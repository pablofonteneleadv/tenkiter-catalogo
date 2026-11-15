"""Medição REPRODUTÍVEL: "tempo até o primeiro item de trabalho utilizável" na Esteira (esteira.html).

Não é um teste de aprovação/reprovação: é um instrumento para comparar ANTES/DEPOIS de uma mudança.
Tudo simulado (nada vai ao Google, à Cloudflare nem ao servidor de mídia); sem dados reais, sem credenciais.
Reaproveita as fixtures de tests/esteira_ui.py (login, catálogo, login/sessão) como os outros testes da Esteira;
o Worker (/esteira/*) é simulado aqui, com latência configurável por rota.

Uso (na raiz do repositório):
    python tests/medicao/esteira_primeiro_item.py --rotulo antes
    python tests/medicao/esteira_primeiro_item.py --rotulo depois --n 7 --lat hoje=2500 --lat fotos=1800

Veja tests/medicao/LEIA-ME.md.
"""
import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

AQUI = Path(__file__).resolve().parent
TESTES = AQUI.parent
RAIZ = TESTES.parent

# Latências do Worker simulado (ms de processamento no servidor; a rede do perfil é somada à parte).
LAT_PADRAO = {"hoje": 2500, "menu": 300, "fotos": 1800, "caixa": 2200, "tarefas": 600, "sincronizar": 300}
# Perfis de rede: bw em bits/s, rtt em ms.
PERFIS = {"wifi": {"bw": 30_000_000, "rtt": 20}, "4g": {"bw": 1_600_000, "rtt": 150}}
CENARIOS = ["hoje_frio", "fotos_apos_hoje", "retorno_hoje", "retorno_fotos", "fotos_direto"]
# Rotas /esteira/* que o simulado base de tests/esteira_ui.py já conhece: seguem para ele (fallback).
BASE_CONHECIDAS = ("preparacao", "painel", "config", "equipe", "listas", "fornecedores", "pedidos", "lista/", "conferir",
                   "tarefa", "toque", "preparar", "aceitar", "reativacao", "registros")
CHAVE_ABA = "tk-esteira-ultima-aba-v1"
WHATS, SENHA = "88999999999", "senha"          # conta FICTÍCIA do simulado (mesma de tests/esteira_ui.py)
ACESSO = "acesso-simulado"


def args_cli():
    a = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    a.add_argument("--rotulo", required=True, help="nome da saída: tests/saida/medicao-esteira/<rotulo>.json (ex.: antes, depois)")
    a.add_argument("--n", type=int, default=7, help="repetições por cenário/perfil (padrão 7)")
    a.add_argument("--perfis", default="wifi,4g", help="perfis de rede separados por vírgula (wifi,4g)")
    a.add_argument("--cenarios", default=",".join(CENARIOS), help="subconjunto de: " + ", ".join(CENARIOS))
    a.add_argument("--lat", action="append", default=[], metavar="ROTA=MS",
                   help="latência do servidor por rota (repita): hoje, menu, fotos, caixa, tarefas, sincronizar, generico, parcial")
    a.add_argument("--produtos", type=int, default=60, help="itens na lista de Hoje (padrão 60)")
    a.add_argument("--fotos-caixa", type=int, default=300, help="fotos na Caixa, 24 por página (padrão 300)")
    a.add_argument("--cpu", type=float, default=4, help="fator de CPU lenta (CDP setCPUThrottlingRate; padrão 4)")
    a.add_argument("--foto-kb", type=float, default=15, help="tamanho NOMINAL de cada miniatura para o cálculo de rede (padrão 15 KB)")
    a.add_argument("--timeout", type=float, default=90, help="limite de espera por cenário, em segundos")
    a.add_argument("--ref", default="", help="serve os arquivos do site a partir de um commit/branch (ex.: HEAD, main) em vez da pasta de trabalho; "
                   "garante o 'antes' mesmo com esteira.html em edição")
    a.add_argument("--visivel", action="store_true", help="abre o Chromium com janela")
    a.add_argument("--saida", default=str(TESTES / "saida" / "medicao-esteira"), help="pasta de saída")
    return a.parse_args()


# ----------------------------------------------------------------------------------------------------
# Servidor estático local (raiz do repositório), em porta livre; o teste não depende de servidor externo.
def exportar_ref(ref):
    """Extrai os arquivos da raiz do commit `ref` (html/js/css/imagens da raiz) para uma pasta temporária."""
    import io, tarfile, tempfile
    ls = subprocess.run(["git", "-C", str(RAIZ), "ls-tree", ref], capture_output=True, text=True, check=True).stdout
    nomes = [l.split("	", 1)[1] for l in ls.splitlines() if " blob " in l]
    dest = Path(tempfile.mkdtemp(prefix="esteira-ref-"))
    tar = subprocess.run(["git", "-C", str(RAIZ), "archive", "--format=tar", ref, "--"] + nomes, capture_output=True, check=True).stdout
    tarfile.open(fileobj=io.BytesIO(tar)).extractall(dest)
    return dest


def subir_servidor(raiz=RAIZ):
    class H(SimpleHTTPRequestHandler):
        extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "application/javascript", ".css": "text/css",
                          ".html": "text/html; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml"}

        def log_message(self, *a):
            pass

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")   # cache HTTP frio e idêntico em toda repetição
            super().end_headers()

    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(H, directory=str(raiz)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/"


# ----------------------------------------------------------------------------------------------------
# Detector dentro da página (performance.now(), mesmo relógio dos performance.mark do app).
INIT_JS = r"""
(() => {
  const N_HOJE = __N_HOJE__, N_CAIXA_PAG = __N_CAIXA_PAG__;
  const M = window.__med = { t: {}, toques: [], t0: 0 };
  const agora = () => Math.round(performance.now() * 10) / 10;
  const reg = k => { if (M.t[k] == null) M.t[k] = agora(); };
  M.reset = () => { M.t = {}; };
  const app = () => document.getElementById('app');
  const tela = () => app() && app().dataset.tela;
  const usavel = e => {
    if (!e || !e.isConnected) return false;
    if (e.disabled || e.getAttribute('aria-disabled') === 'true' || e.closest('[inert],[hidden],[aria-busy="true"]')) return false;
    if (e.closest('[class*="skel"],[class*="esquel"],[data-skeleton]')) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none' || parseFloat(s.opacity) === 0) return false;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight) {      // dentro da tela: nada pode cobrir o centro
      const topo = document.elementFromPoint(cx, cy);
      if (topo && !(e === topo || e.contains(topo) || topo.contains(e))) return false;
    }
    return true;
  };
  const imgOk = i => i.complete && i.naturalWidth > 0;
  const tick = () => {
    const a = app(), t = tela();
    if (!a) return;
    if (t === 'hoje') {
      const pecas = [...a.querySelectorAll('button.peca')];
      if (pecas.length) {
        reg('conteudo');
        if (usavel(pecas[0])) reg('primeiro_item');
        if (pecas.length >= N_HOJE) reg('lista_completa');
      }
    } else if (t === 'fotos') {
      const ped = a.querySelector('#fotos-pedidas'), cx = a.querySelector('#caixa');
      const cartPed = ped && [...ped.querySelectorAll('.pedido-fotos button, .pedido-fotos .add-fotos')].find(usavel);
      if (cartPed) reg('cartao_pedido');
      const imgPed = ped && [...ped.querySelectorAll('img')].find(i => imgOk(i) && usavel(i));
      if (imgPed) reg('foto_pedido');
      const itensCx = cx ? [...cx.querySelectorAll('[data-caixa]')] : [];
      const cartCx = itensCx.length && itensCx.some(c => { const b = c.querySelector('.foto-bt, button'); return b && usavel(b); });
      if (cartCx) reg('cartao_caixa');
      const imgCx = cx && [...cx.querySelectorAll('[data-caixa] img')].find(i => imgOk(i) && usavel(i));
      if (imgCx) reg('foto_caixa');
      const carregando = cx && /Carregando/.test(cx.textContent || '');
      if (ped && ped.querySelector('.pedido-fotos, p.muted') && itensCx.length >= N_CAIXA_PAG && !carregando) reg('concluido');
    }
  };
  let agendado = false;
  const pedir = () => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; tick(); }); };
  new MutationObserver(() => { tick(); pedir(); }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  document.addEventListener('load', pedir, true); document.addEventListener('error', pedir, true);
  setInterval(tick, 20);
  document.addEventListener('pointerdown', e => {
    const b = e.target && e.target.closest && e.target.closest('[data-aba]');
    if (b) { M.t0 = agora(); M.toques.push({ aba: b.dataset.aba, t: M.t0 }); }
  }, true);
})();
"""

LER_JS = r"""
() => {
  const M = window.__med, t0 = M.t0 || 0;
  const marcas = performance.getEntriesByType('mark').filter(m => m.name.startsWith('esteira:')).map(m => [m.name, Math.round(m.startTime * 10) / 10]);
  const rec = performance.getEntriesByType('resource').filter(r => r.name.includes('tenkiter-ig')).map(r => {
    const u = new URL(r.name); return [u.pathname + u.search, Math.round(r.startTime * 10) / 10, Math.round(r.responseEnd * 10) / 10]; });
  return { t: M.t, t0, marcas, rec };
}
"""


# ----------------------------------------------------------------------------------------------------
def montar_fixtures(args, lat, BASE, png_cor):
    """Fixtures do Worker simulado (mesmo formato das de tests/esteira_ui.py e tests/esteira_fotos_ui.py)."""
    from datetime import datetime, timedelta, timezone
    dia = (datetime.now(timezone.utc) - timedelta(hours=3)).date().isoformat()
    M = "https://midia.fake/m/"
    cats = ["Blusas", "Vestidos", "Saias", "Shorts", "Conjuntos", "Moda praia"]
    lista = []
    for k in range(args.produtos):
        c = cats[k % len(cats)]
        lista.append({"id": str(9000 + k), "nome": f"Produto de teste {k + 1}", "codigo": f"TK-{9000 + k}", "categoria": c,
                      "genero": "Feminino Adulto", "estoque": str(2 + k % 5), "tamanhos": "P, M, G", "cores": "Preto, Areia",
                      "foto": f"{M}h{k}.jpg", "cadastro": "2026-08-18T12:00:00Z", "grupo": c + " · Feminino Adulto",
                      "feito": False, "atualizado_em": "", "conferido_em": ""})
    caixa = [{"id": 1000 + k, "url": f"{M}c{k}.jpg", "descricao": "peça de teste" if k % 3 == 0 else "", "descricaoLote": "Lote de teste",
              "lote": f"lt-{k // 8}", "produto": "", "produtoNome": "", "por": "Bia", "minha": k % 5 == 0,
              "em": "2026-11-03T08:10:00Z", "status": "nova", "repetidaDe": None, "usoProduto": "", "usoNome": "", "usadaPor": "", "usadaEm": ""}
             for k in range(args.fotos_caixa)]
    pedidos = [{"produto": str(9100 + k), "nome": f"Vestido pedido {k + 1}", "codigo": f"TK-{9100 + k}", "foto": f"{M}p{k}.jpg", "noSite": True,
                "itens": [{"id": 50 + k, "rotulos": ["No pano", "No manequim"], "obs": "luz natural", "texto": "", "por": "Pablo", "em": "2026-11-02T10:00:00Z"}]}
               for k in range(4)]
    eu = {"whats": WHATS, "nome": "Iara", "admin": True, "membro": True, "confere": True, "aceitar": True, "gestorFotos": True}
    sync = {"ok": True, "eu": eu, "acesso": ACESSO, "data": dia, "revisao": "r1"}

    def hoje(q):
        itens = lista
        parcial = False
        lim = (q.get("limite") or q.get("primeiro") or [None])[0]
        if lim is not None:
            parcial = True
            n = int(lim) if str(lim).isdigit() and int(lim) > 1 else 6
            itens = lista[:n]
        r = {**sync, "categoria": "", "lista": itens, "feitas": 0, "total": len(lista), "pecas": len(lista),
             "pedidos": {"conferir": 0, "aprovar": 0, "aplicar": 0},
             "funcoes": [{"funcao": "Fotos", "instrucoes": "Fotografar os produtos novos."}], "tarefas": [],
             "escala": [{"funcao": "Fotos", "whats": WHATS, "nome": "Iara", "alterado": False}]}
        if parcial:
            r["parcial"] = True
        return r

    def primeiros(q):
        h = hoje({})
        n = 8
        return {"ok": True, "eu": {"admin": True, "nome": "Iara"}, "acesso": ACESSO, "data": dia,
                "resumoHoje": {"total": len(lista), "feitas": 0, "pedidos": {"conferir": 0, "aprovar": 0, "aplicar": 0}},
                "pronto": True, "lista": lista[:n], "restantes": max(0, len(lista) - n), "total": len(lista), "feitas": 0,
                "pecas": len(lista), "categoria": ""}

    def menu(q):
        return {**sync, "resumoHoje": {"total": len(lista), "feitas": 0, "pedidos": {"conferir": 0, "aprovar": 0, "aplicar": 0}}}

    def tarefas(q):
        return {"ok": True, "tarefas": [{"id": 900 + k, "produto": str(9000 + k), "titulo": f"Foto nova {k + 1}", "tipo": "foto", "funcao": "Fotos",
                                         "origem": "conferencia", "instrucao": "", "obs": "", "status": "pendente", "posso": True,
                                         "produtoNome": f"Produto de teste {k + 1}", "produtoCodigo": f"TK-{9000 + k}", "produtoFoto": ""} for k in range(2)]}

    def fotos(q):
        return {"ok": True, "acesso": ACESSO, "diaRevisao": dia, "revisao": "r1", "eu": eu, "pedidos": pedidos, "caixaNovas": len(caixa)}

    def pagina_caixa(q):
        ver = (q.get("ver") or ["novas"])[0]
        antes = int((q.get("antes") or ["99999999"])[0])
        its = sorted((i for i in caixa if i["id"] < antes), key=lambda i: -i["id"]) if ver == "novas" else []
        return {"ok": True, "acesso": ACESSO, "diaRevisao": dia, "revisao": "r1", "gestor": True, "ver": ver,
                "contagem": {"novas": len(caixa), "usadas": 0, "descartadas": 0}, "itens": its[:24],
                "proximo": its[23]["id"] if len(its) > 24 else None}

    return dict(dia=dia, hoje=hoje, menu=menu, primeiros=primeiros, tarefas=tarefas, fotos=fotos, caixa=pagina_caixa, sync=lambda q: sync)


class Mundo:
    """Estado do simulado: latências, perfil de rede, fila de respostas adiadas e registro das requisições."""

    def __init__(self, args, lat, BASE, png_cor, fx):
        self.args, self.lat, self.BASE, self.png_cor, self.fx = args, lat, BASE.rstrip("/"), png_cor, fx
        self.perfil = {"bw": 0, "rtt": 0}          # 0 = sem atraso de rede (usado só no preparo da sessão)
        self.zero = False                          # True: sem nenhuma latência (preparo da sessão)
        self.pend = []                             # (instante_devido, função)
        self.log = []                              # (rota, instante_chegada_s, atraso_ms)

    def atraso_rede(self, nbytes):
        if self.zero or not self.perfil["bw"]:
            return 0.0
        return self.perfil["rtt"] + nbytes * 8 / self.perfil["bw"] * 1000

    def adiar(self, ms, fn):
        if ms <= 0:
            return fn()
        self.pend.append((time.perf_counter() + ms / 1000, fn))

    def bombear(self, pg, ms=4):
        agora = time.perf_counter()
        devidos = [x for x in self.pend if x[0] <= agora]
        for x in devidos:
            self.pend.remove(x)
            try:
                x[1]()
            except Exception:
                pass                                 # página/rota já fechada
        pg.wait_for_timeout(ms)

    def rota_esteira(self, route):
        req = route.request
        u = req.url
        # Miniaturas: cor fixa por endereço, com atraso de rede proporcional ao tamanho nominal.
        if req.resource_type == "image" and not u.startswith(self.BASE):
            from_png = self.png_cor((196, 160, 120))
            d = self.atraso_rede(self.args.foto_kb * 1024)
            self.log.append(("(imagem)", time.perf_counter(), d))
            return self.adiar(d, lambda: route.fulfill(body=from_png, content_type="image/png"))
        if "tenkiter-ig" not in u:
            return route.fallback()
        sp = urlsplit(u)
        path, q = sp.path, parse_qs(sp.query)
        if req.method != "GET" or not path.startswith("/esteira/"):
            return route.fallback()
        sub = path[len("/esteira/"):]
        fx = self.fx
        if path == "/esteira/menu": chave, corpo = "menu", fx["menu"](q)
        elif path == "/esteira/sincronizar": chave, corpo = "sincronizar", fx["sync"](q)
        elif path == "/esteira/hoje": chave, corpo = "hoje", fx["hoje"](q)
        elif path == "/esteira/hoje/tarefas": chave, corpo = "tarefas", fx["tarefas"](q)
        elif path == "/esteira/hoje/primeiros":
            # Contrato da rota v7.79.0: identidade + resumo + primeiros cartões; sem funções, tarefas nem escala.
            if "primeiros" not in self.lat and "parcial" not in self.lat: return route.fallback()
            chave, corpo = "primeiros", fx["primeiros"](q)
        elif path == "/esteira/fotos": chave, corpo = "fotos", fx["fotos"](q)
        elif path == "/esteira/caixa": chave, corpo = "caixa", fx["caixa"](q)
        elif sub.startswith(BASE_CONHECIDAS):
            return route.fallback()
        else:
            # Rota desconhecida (versão futura: /esteira/hoje?primeiro=1, /esteira/hoje/primeiros, ...): reutiliza a fixture de Hoje.
            chave, corpo = "generico", fx["hoje"](q)
            if "parcial" in self.lat and (q.get("limite") or q.get("primeiro") or sub.startswith("hoje/")):
                chave = "parcial"
        corpo_b = json.dumps(corpo).encode()
        base_ms = self.lat.get(chave, self.lat["hoje"]) if not self.zero else 0
        d = base_ms + self.atraso_rede(len(corpo_b))
        self.log.append((path + ("?" + sp.query if sp.query else ""), time.perf_counter(), round(d)))
        return self.adiar(d, lambda: route.fulfill(status=200, body=corpo_b, content_type="application/json"))


# ----------------------------------------------------------------------------------------------------
def novo_contexto(browser, mundo, args, estado=None, perfil=None, nome_perfil=None):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block",
                              storage_state=estado)
    return ctx


def aplicar_cdp(ctx, pg, args, perfil):
    cdp = ctx.new_cdp_session(pg)
    if args.cpu and args.cpu > 1:
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": args.cpu})
    if perfil:
        cdp.send("Network.enable")
        cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": perfil["rtt"],
                 "downloadThroughput": perfil["bw"] / 8, "uploadThroughput": perfil["bw"] / 8})
    return cdp


def esperar(mundo, pg, chave, limite_s):
    """Bombeia as respostas adiadas até a chave do detector aparecer."""
    ini = time.perf_counter()
    while True:
        mundo.bombear(pg)
        if pg.evaluate(f"() => window.__med && window.__med.t[{json.dumps(chave)}] != null"):
            return True
        if time.perf_counter() - ini > limite_s:
            return False


def pausa(mundo, pg, ms):
    fim = time.perf_counter() + ms / 1000
    while time.perf_counter() < fim:
        mundo.bombear(pg)


def tocar(mundo, pg, aba):
    pg.evaluate("() => window.__med.reset()")
    pg.locator(f"[data-aba={aba}]").tap()


def coletar(pg, aba, chaves, extras_marcas=("util", "toque", "menu", "resumo", "abertura", "retomada")):
    d = pg.evaluate(LER_JS)
    t0 = d["t0"]
    r = {}
    for k in chaves:
        v = d["t"].get(k)
        r[k] = None if v is None else round(v - t0, 1)
    for nome, tm in d["marcas"]:
        _, a, etapa = (nome.split(":") + ["", ""])[:3]
        if a == aba and etapa in extras_marcas and tm >= t0 and etapa != "toque":
            r["marca_" + etapa] = round(tm - t0, 1)
    cascata = sorted(([p, round(i - t0), round(f - t0)] for p, i, f in d["rec"] if i >= t0 - 1), key=lambda x: x[1])
    r["_cascata"] = cascata
    r["reqs"] = len(cascata)
    return r


def preparar_sessao(browser, mundo, args, BASE):
    """Login uma vez, sem latência nem throttle; devolve o storage_state (sessão + dica da última aba) — sem IndexedDB, logo sem cache."""
    mundo.zero = True
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    mundo.instalar(ctx)
    ctx.route("**/*", mundo.rota_esteira)
    pg = ctx.new_page()
    pg.set_default_timeout(15000)
    pg.goto(BASE + "esteira.html")
    pg.fill("#login-w", WHATS)
    pg.fill("#login-s", SENHA)
    pg.locator("#login-s").press("Enter")
    pg.locator("button.peca").first.wait_for()
    pausa(mundo, pg, 600)
    pg.locator("[data-aba=fotos]").tap()
    pg.locator("#caixa [data-caixa]").first.wait_for()
    pausa(mundo, pg, 1200)
    estado = ctx.storage_state()
    ctx.close()
    mundo.zero = False
    return estado


def estado_para(estado, com_dica_fotos):
    """Cópia do storage_state: sem dica (abre em Hoje) ou com dica fresca de 'fotos' (abre direto em Fotos)."""
    e = json.loads(json.dumps(estado))
    achou = False
    for o in e.get("origins", []):
        novos = []
        for it in o.get("localStorage", []):
            if it["name"] == CHAVE_ABA:
                achou = True
                if not com_dica_fotos:
                    continue
                v = json.loads(it["value"])
                v["aba"] = "fotos"
                v["em"] = int(time.time() * 1000)
                it = {"name": it["name"], "value": json.dumps(v)}
            novos.append(it)
        o["localStorage"] = novos
    if com_dica_fotos and not achou:
        raise RuntimeError("A dica de última aba não foi gravada pelo app; não dá para medir 'Fotos direto'.")
    return e


def rodar_perfil(browser, mundo, args, BASE, estado, nome_perfil, cenarios, res, amostras):
    perfil = PERFIS[nome_perfil]
    init = INIT_JS.replace("__N_HOJE__", str(args.produtos)).replace("__N_CAIXA_PAG__", str(min(24, args.fotos_caixa)))
    for i in range(args.n):
        mundo.perfil = perfil
        # --- Sequência A: Hoje frio -> Fotos (1ª entrada) -> retorno a Hoje -> retorno a Fotos
        if {"hoje_frio", "fotos_apos_hoje", "retorno_hoje", "retorno_fotos"} & set(cenarios):
            ctx = novo_contexto(browser, mundo, args, estado_para(estado, False))
            mundo.instalar(ctx)
            ctx.route("**/*", mundo.rota_esteira)
            pg = ctx.new_page()
            pg.set_default_timeout(15000)
            pg.add_init_script(init)
            aplicar_cdp(ctx, pg, args, perfil)
            mundo.pend.clear(); mundo.log.clear()
            pg.goto(BASE + "esteira.html", wait_until="commit")
            ok = esperar(mundo, pg, "lista_completa", args.timeout)
            ch = ["primeiro_item", "lista_completa", "conteudo"]
            r = coletar(pg, "hoje", ch)
            r["completou"] = ok
            guardar(res, amostras, "hoje_frio", nome_perfil, r, cenarios)
            pausa(mundo, pg, 1500)                        # deixa menu/tarefas/revalidações assentarem
            if not {"fotos_apos_hoje", "retorno_hoje", "retorno_fotos"} & set(cenarios):
                ctx.close(); continue
            tocar(mundo, pg, "fotos")
            ok = esperar(mundo, pg, "concluido", args.timeout)
            ch = ["cartao_pedido", "cartao_caixa", "foto_pedido", "foto_caixa", "concluido"]
            r = coletar(pg, "fotos", ch)
            r["primeiro_item"] = minimo(r, ["cartao_pedido", "cartao_caixa", "foto_pedido", "foto_caixa"])
            r["primeira_imagem"] = minimo(r, ["foto_pedido", "foto_caixa"])
            r["completou"] = ok
            guardar(res, amostras, "fotos_apos_hoje", nome_perfil, r, cenarios)
            pausa(mundo, pg, 700)
            tocar(mundo, pg, "hoje")                      # retorno curto (cache válido)
            ok = esperar(mundo, pg, "lista_completa", 20)
            r = coletar(pg, "hoje", ["primeiro_item", "lista_completa"])
            r["completou"] = ok
            guardar(res, amostras, "retorno_hoje", nome_perfil, r, cenarios)
            pausa(mundo, pg, 700)
            tocar(mundo, pg, "fotos")
            ok = esperar(mundo, pg, "concluido", 20)
            r = coletar(pg, "fotos", ch)
            r["primeiro_item"] = minimo(r, ["cartao_pedido", "cartao_caixa", "foto_pedido", "foto_caixa"])
            r["primeira_imagem"] = minimo(r, ["foto_pedido", "foto_caixa"])
            r["completou"] = ok
            guardar(res, amostras, "retorno_fotos", nome_perfil, r, cenarios)
            ctx.close()
        # --- Sequência B: abrir direto em Fotos (sessão + dica de última aba = fotos, SEM cache)
        if "fotos_direto" in cenarios:
            ctx = novo_contexto(browser, mundo, args, estado_para(estado, True))
            mundo.instalar(ctx)
            ctx.route("**/*", mundo.rota_esteira)
            pg = ctx.new_page()
            pg.set_default_timeout(15000)
            pg.add_init_script(init)
            aplicar_cdp(ctx, pg, args, perfil)
            mundo.pend.clear(); mundo.log.clear()
            pg.goto(BASE + "esteira.html", wait_until="commit")
            ok = esperar(mundo, pg, "concluido", args.timeout)
            ch = ["cartao_pedido", "cartao_caixa", "foto_pedido", "foto_caixa", "concluido"]
            r = coletar(pg, "fotos", ch)
            r["primeiro_item"] = minimo(r, ["cartao_pedido", "cartao_caixa", "foto_pedido", "foto_caixa"])
            r["primeira_imagem"] = minimo(r, ["foto_pedido", "foto_caixa"])
            r["completou"] = ok
            r["abriu_em"] = pg.evaluate("() => document.getElementById('app').dataset.tela")
            guardar(res, amostras, "fotos_direto", nome_perfil, r, cenarios)
            ctx.close()
        print(f"  [{nome_perfil}] repetição {i + 1}/{args.n} concluída", flush=True)


def minimo(r, chaves):
    v = [r[k] for k in chaves if r.get(k) is not None]
    return min(v) if v else None


def guardar(res, amostras, cenario, perfil, r, cenarios):
    if cenario not in cenarios:
        return
    cascata = r.pop("_cascata", [])
    res.setdefault(cenario, {}).setdefault(perfil, []).append(r)
    amostras.setdefault((cenario, perfil), cascata)    # só a cascata da 1ª repetição, para ler a ordem das requisições


def resumo(vals):
    v = [x for x in vals if x is not None]
    if not v:
        return None
    return {"mediana": round(statistics.median(v), 1), "min": round(min(v), 1), "max": round(max(v), 1), "n": len(v), "de": len(vals)}


COLUNAS = {
    "hoje_frio": ["conteudo", "primeiro_item", "lista_completa", "marca_util"],
    "retorno_hoje": ["primeiro_item", "lista_completa", "reqs"],
    "fotos_apos_hoje": ["primeiro_item", "primeira_imagem", "concluido", "marca_util", "reqs"],
    "fotos_direto": ["primeiro_item", "primeira_imagem", "concluido", "marca_util", "reqs"],
    "retorno_fotos": ["primeiro_item", "primeira_imagem", "concluido", "reqs"],
}
ROTULO_CEN = {"hoje_frio": "Hoje, sessão existente e cache ausente", "fotos_apos_hoje": "Fotos, 1ª entrada depois de Hoje",
              "fotos_direto": "Fotos, abrindo direto (cache ausente)", "retorno_hoje": "Retorno curto a Hoje (cache válido)",
              "retorno_fotos": "Retorno curto a Fotos (cache válido)"}


def imprimir(agregado):
    print("\nTempos em ms desde o início (navegação ou toque na aba): mediana [mín–máx]. 'reqs' = requisições ao Worker.")
    for cen in CENARIOS:
        if cen not in agregado:
            continue
        cols = COLUNAS[cen]
        print(f"\n== {ROTULO_CEN[cen]} ==")
        print(f"{'rede':<6}" + "".join(f"{c:>26}" for c in cols))
        for perfil, met in agregado[cen].items():
            linha = f"{perfil:<6}"
            for c in cols:
                s = met.get(c)
                txt = "-" if not s else "%.0f [%.0f-%.0f]" % (s["mediana"], s["min"], s["max"])
                linha += f"{txt:>26}"
            print(linha)


def main():
    args = args_cli()
    lat = dict(LAT_PADRAO)
    for x in args.lat:
        k, _, v = x.partition("=")
        lat[k.strip()] = float(v)
    lat.setdefault("generico", lat["hoje"])
    perfis = [p.strip() for p in args.perfis.split(",") if p.strip()]
    cenarios = [c.strip() for c in args.cenarios.split(",") if c.strip()]
    if any(p not in PERFIS for p in perfis) or any(c not in CENARIOS for c in cenarios):
        sys.exit("Perfil ou cenário desconhecido.")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Falta o Playwright: python -m pip install playwright && python -m playwright install chromium")
    raiz_site = exportar_ref(args.ref) if args.ref else RAIZ
    srv, BASE = subir_servidor(raiz_site)
    os.environ["TK_BASE"] = BASE
    os.environ.setdefault("TK_OUT", str(Path(args.saida) / "_tmp"))
    # Mesmo padrão dos outros testes: executa só o trecho inicial de esteira_ui.py (fixtures), sem rodar a jornada dele.
    fonte = TESTES / "esteira_ui.py"
    ns = {"__file__": str(fonte), "__name__": "esteira_base"}
    exec(compile(fonte.read_text(encoding="utf-8").split("\nwith sync_playwright() as p:")[0], str(fonte), "exec"), ns)
    BASE = ns["BASE"] if ns["BASE"].startswith("http://127.0.0.1") else BASE
    fx = montar_fixtures(args, lat, BASE, ns["_png_cor"])
    mundo = Mundo(args, lat, BASE, ns["_png_cor"], fx)
    mundo.instalar = ns["instalar"]
    res, amostras = {}, {}
    inicio = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"], headless=not args.visivel)
        versao = browser.version
        print(f"Chromium {versao} | rótulo={args.rotulo} n={args.n} cpu=x{args.cpu} produtos={args.produtos} caixa={args.fotos_caixa}")
        print("Latências do Worker (ms):", {k: lat[k] for k in sorted(lat)})
        estado = preparar_sessao(browser, mundo, args, BASE)
        for perfil in perfis:
            print(f"Perfil {perfil}: {PERFIS[perfil]}", flush=True)
            rodar_perfil(browser, mundo, args, BASE, estado, perfil, cenarios, res, amostras)
        browser.close()
    srv.shutdown()
    agregado, falhas = {}, {}
    for cen, por in res.items():
        for perfil, rs in por.items():
            chaves = sorted({k for r in rs for k, v in r.items() if isinstance(v, (int, float)) and not isinstance(v, bool)})
            agregado.setdefault(cen, {})[perfil] = {k: resumo([r.get(k) for r in rs]) for k in chaves}
            falhas.setdefault(cen, {})[perfil] = sum(1 for r in rs if not r.get("completou", True))
    imprimir(agregado)
    if any(v for por in falhas.values() for v in por.values()):
        print("\nATENÇÃO: repetições que não completaram no limite de tempo:", falhas)
    print("\nCascata de requisições ao Worker da 1ª repetição (ms desde o início do cenário; rota, início, fim):")
    for (cen, perfil), c in amostras.items():
        if perfil != perfis[0] and cen != "hoje_frio":
            continue
        print(f"  {cen} / {perfil}")
        for rota, i, f in c:
            print(f"    {i:>6} -> {f:>6}  {rota}")
    try:
        git = subprocess.run(["git", "-C", str(RAIZ), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=10).stdout.strip()
        sujo = bool(subprocess.run(["git", "-C", str(RAIZ), "status", "--porcelain", "--", "esteira.html", "esteira-fluidez.js"],
                                   capture_output=True, text=True, timeout=10).stdout.strip())
    except Exception:
        git, sujo = "", None
    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)
    tmp = saida / "_tmp"
    if tmp.exists() and not any(tmp.iterdir()):
        tmp.rmdir()
    destino = saida / (re.sub(r"[^\w.-]+", "_", args.rotulo) + ".json")
    destino.write_text(json.dumps({
        "rotulo": args.rotulo, "gerado_em": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "duracao_s": round(time.time() - inicio),
        "ambiente": {"chromium": versao, "viewport": "390x844 touch", "cpu_throttle": args.cpu, "perfis": {p: PERFIS[p] for p in perfis},
                     "git": git, "ref_servida": args.ref or "pasta de trabalho", "esteira_html_modificado_na_pasta": sujo, "python": sys.version.split()[0]},
        "parametros": {"n": args.n, "latencias_ms": lat, "produtos": args.produtos, "fotos_caixa": args.fotos_caixa, "foto_kb_nominal": args.foto_kb},
        "agregado": agregado, "nao_completaram": falhas, "amostras": res,
        "cascata_1a_repeticao": {f"{c}/{p}": v for (c, p), v in amostras.items()},
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\nJSON:", destino)


if __name__ == "__main__":
    main()
