#!/usr/bin/env python3
"""TENKiTER: trava dos padrões do site (docs/ia/padroes-site.md). Python puro, sem navegador, roda em toda PR.

O site é UM site com vários módulos. Cada regra abaixo impede que a próxima PR reintroduza um jeito antigo
ou crie um jeito novo e isolado de fazer o que já tem dono (janela, aviso, botão, cor, erro, vocabulário...).

CATRACA (scripts/ci/padroes-baseline.json): guarda as ocorrências que já existem HOJE, por regra e por arquivo.
  - a contagem de um arquivo SOBE (ou aparece arquivo novo) -> FALHA: use o componente do padrão;
  - a contagem DESCE -> FALHA pedindo para baixar o baseline (assim a dívida paga não volta);
  - dívida antiga que não mudou nunca falha.
Uso:
  python3 scripts/ci/check_padroes.py                       confere (CI)
  python3 scripts/ci/check_padroes.py --atualizar           grava o baseline (só aceita DESCER; para subir use --aceitar-aumento)
  python3 scripts/ci/check_padroes.py --listar              mostra todas as ocorrências atuais, por regra
  python3 scripts/ci/check_padroes.py --raiz DIR --baseline ARQ   (usado pelo teste do próprio check)
"""
from __future__ import annotations
import argparse
import colorsys
import contextlib
import glob
import io
import json
import os
import re
import sys

ROOT_PADRAO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOC = "docs/ia/padroes-site.md"
BASELINE_PADRAO = "scripts/ci/padroes-baseline.json"
IGNORAR_PREFIXO = ("vendor", "OneSignalSDK", "axe.")

# ----------------------------------------------------------------------------------------------- leitura
def arquivos_site(raiz: str, exts=(".html", ".js", ".css")) -> list[str]:
    """Só o site publicado (raiz do repositório). Testes, workers, android e docs ficam de fora."""
    saida = []
    for ext in exts:
        for f in sorted(glob.glob(os.path.join(raiz, "*" + ext))):
            if not os.path.basename(f).startswith(IGNORAR_PREFIXO):
                saida.append(f)
    return saida

def _brancos(m: re.Match) -> str:
    return re.sub(r"[^\n]", " ", m.group(0))

def limpar(texto: str, ext: str) -> str:
    """Remove comentários mantendo as quebras de linha (os números de linha continuam certos)."""
    t = re.sub(r"(?<![\w'\"`\\/:*.])/\*.*?\*/", _brancos, texto, flags=re.S)
    if ext == ".html":
        t = re.sub(r"<!--.*?-->", _brancos, t, flags=re.S)
    if ext in (".js", ".html"):
        t = re.sub(r"(?m)^\s*//.*$", _brancos, t)
        t = re.sub(r"(?<![:\w\"'`\\/])//\s[^\n]*", _brancos, t)
    return t

class Site:
    def __init__(self, raiz: str):
        self.raiz = raiz
        self.arquivos = {}
        for f in arquivos_site(raiz):
            nome = os.path.basename(f)
            bruto = open(f, encoding="utf-8", errors="ignore").read()
            self.arquivos[nome] = (bruto, limpar(bruto, os.path.splitext(nome)[1]))
        v = os.path.join(raiz, "VERSION")
        self.versao = open(v, encoding="utf-8").read().strip() if os.path.isfile(v) else ""
    def por_ext(self, *exts):
        return [(n, b, l) for n, (b, l) in self.arquivos.items() if n.endswith(exts)]
    def paginas(self):
        return [(n, b, l) for n, b, l in self.por_ext(".html") if "<body" in b.lower()]

# ----------------------------------------------------------------------------------------------- achados
# Cada regra devolve uma lista de (arquivo, linha, trecho). Chave do baseline: regra -> arquivo -> contagem.
Achado = tuple

def linha_de(texto: str, pos: int) -> int:
    return texto.count("\n", 0, pos) + 1

def trecho(texto: str, ini: int, fim: int, raio=30) -> str:
    return re.sub(r"\s+", " ", texto[max(0, ini - raio): fim + raio]).strip()[:110]

def varrer(site: Site, exts, rx: re.Pattern, excluir_arquivos=(), filtro=None) -> list[Achado]:
    out = []
    for n, _b, l in site.por_ext(*exts):
        if n in excluir_arquivos:
            continue
        for m in rx.finditer(l):
            if filtro and not filtro(n, l, m):
                continue
            out.append((n, linha_de(l, m.start()), trecho(l, m.start(), m.end())))
    return out

def r_alert(s: Site):
    # alert() só para erro que exige ação (lista fechada = o baseline). O resto é TKAviso.
    return varrer(s, (".js", ".html"), re.compile(r"(?<![\w.$])alert\("))

def r_prompt_senha(s: Site):
    return varrer(s, (".js", ".html"), re.compile(r"(?<![\w.$])prompt\([^)\n]*[Ss]enha"))

def r_travar_fundo(s: Site):
    rx_js = re.compile(r"(document\.body|document\.documentElement|(?<![\w.])body)\.style\.overflow|fx-travado")
    achados = varrer(s, (".js", ".html"), rx_js)
    rx_css = re.compile(r"(?<![\w-])(?:html|body)(?:\.[\w-]+)+\s*(?:,[^{};]*)?\{[^}]*overflow(?:-y)?\s*:\s*hidden")
    achados += varrer(s, (".css", ".html"), rx_css, filtro=lambda n, l, m: "tk-travado" not in m.group(0))
    return achados

def r_zindex(s: Site):
    # 0-10 = empilhamento local dentro do próprio componente. Acima disso a camada é global: use var(--z-*).
    rx = re.compile(r"z-?[iI]ndex\s*[:=]\s*['\"]?\s*(-?\d+)\b")
    return varrer(s, (".css", ".js", ".html"), rx, excluir_arquivos=("janelas.css",),
                  filtro=lambda n, l, m: int(m.group(1)) > 10)

def _eh_laranja(r, g, b):
    h, l, sat = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return 15 <= h * 360 <= 42 and sat >= 0.45 and 0.15 <= l <= 0.75

FALLBACK_TOKEN = re.compile(r"var\(\s*--(?:laranja\s*,\s*#e67e22|laranja-txt\s*,\s*#a85200|tk-foco-cor\s*,\s*#a85200)\s*$", re.I)

def r_laranja(s: Site):
    rx = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})")
    donos = ("tk-padrao.css", "catalogo.css")   # onde os tokens --laranja/--laranja-txt são DEFINIDOS
    out = []
    for n, _b, l in s.por_ext(".css", ".js", ".html"):
        for m in rx.finditer(l):
            if m.group(1):
                h = m.group(1)
                if len(h) == 3:
                    h = "".join(c * 2 for c in h)
                rgb = tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
            else:
                rgb = tuple(min(255, int(m.group(i))) for i in (2, 3, 4))
            if not _eh_laranja(*rgb):
                continue
            ini = l.rfind("\n", 0, m.start()) + 1
            if n in donos and re.search(r"--[\w-]+\s*:\s*$", l[max(ini, m.start() - 60):m.start()]):
                continue
            # fallback do próprio token (var(--laranja, #E67E22)) é o jeito sancionado: o valor segue o token
            if m.group(1) and FALLBACK_TOKEN.search(l[max(0, m.start() - 24):m.end()]):
                continue
            out.append((n, linha_de(l, m.start()), trecho(l, m.start(), m.end())))
    return out

def r_location_origin(s: Site):
    # Link que a pessoa copia/compartilha = SITE_URL. postMessage, checagem de origem e base de new URL() não são link.
    rx = re.compile(r"location\.origin\s*\+\s*['\"`]")
    def filtro(n, l, m):
        ini = l.rfind("\n", 0, m.start()) + 1
        fim = l.find("\n", m.end())
        return "SITE_URL" not in l[ini: fim if fim >= 0 else len(l)]
    achados = varrer(s, (".js", ".html"), rx, filtro=filtro)
    rx2 = re.compile(r"location\.origin")
    achados += varrer(s, (".js", ".html"), rx2, filtro=lambda n, l, m: bool(re.search(
        r"clipboard|navigator\.share|wa\.me|api\.whatsapp|compartilh",
        l[l.rfind("\n", 0, m.start()) + 1: (l.find("\n", m.end()) if l.find("\n", m.end()) >= 0 else len(l))]))
        and "SITE_URL" not in l[l.rfind("\n", 0, m.start()) + 1: (l.find("\n", m.end()) if l.find("\n", m.end()) >= 0 else len(l))])
    return sorted(set(achados))

def r_img_dinamico(s: Site):
    # <img src="'+x+'"> / <img src="${x}"> montados à mão; o certo é <img '+atribSrc(fotoMini(x, 480))+'> (common.js).
    rx = re.compile(r"""<img[^>]{0,250}?\bsrc=\\?["']\s*(?:["'`]\s*\+|\$\{)""")
    return varrer(s, (".js", ".html"), rx, excluir_arquivos=("common.js", "padrao-dados.js", "curriculo.html"))

def r_moeda(s: Site):
    return varrer(s, (".js", ".html"), re.compile(r"typeof\s+moeda\b|(?<![\w.$])moeda\("))

def r_http_tela(s: Site):
    # "HTTP 500" / "(HTTP 413)" montado em texto. Erro que a pessoa lê passa por TKPadrao.erro / TKAviso.textoErro.
    rx = re.compile(r"""HTTP\s*["'`]\s*\+|HTTP\s*\$\{|\(HTTP\s|HTTP\s+\d{3}\b""")
    return varrer(s, (".js", ".html"), rx, excluir_arquivos=("padrao-dados.js", "avisos.js"),
                  filtro=lambda n, l, m: "new Error(" not in l[max(0, m.start() - 40): m.start()]
                  and not re.search(r"logDebug_|console\.|\.log\(", l[max(0, m.start() - 60): m.start()]))

def r_tablist(s: Site):
    out = []
    rx = re.compile(r"""role\s*=\s*\\?["']tablist|setAttribute\(\s*['"]role['"]\s*,\s*['"]tablist""")
    for n, _b, l in s.por_ext(".js", ".html"):
        for m in rx.finditer(l):
            if "tk-abas" not in l[max(0, m.start() - 350): m.end() + 350]:
                out.append((n, linha_de(l, m.start()), trecho(l, m.start(), m.end())))
    return out

def r_fechar(s: Site):
    out = []
    rx = re.compile(r"""aria-label\s*(?:=|,)\s*\\?["']\s*Fechar\b""", re.I)
    for n, _b, l in s.por_ext(".js", ".html"):
        for m in rx.finditer(l):
            jan = l[max(0, m.start() - 260): m.end() + 260]
            if not re.search(r"tk-fechar|sheet-x|tk-aviso", jan):
                out.append((n, linha_de(l, m.start()), trecho(l, m.start(), m.end())))
    return out

def _carrega(l: str, nome: str) -> bool:
    return re.search(r"""(?:src|href)\s*=\s*["']\.?/?""" + re.escape(nome) + r"""(?:\?[^"']*)?["']""", l) is not None

def r_pagina_sem_padrao(s: Site):
    out = []
    for n, _b, l in s.paginas():
        for obrig in ("janelas.css", "a11y.js", "tk-padrao.css"):
            if not _carrega(l, obrig):
                out.append((n, 1, "não carrega " + obrig))
    return out

def r_padrao_dados(s: Site):
    usam = [n for n, b, l in s.por_ext(".js") if "TKPadrao" in l and n != "padrao-dados.js"]
    out = []
    for n, _b, l in s.paginas():
        precisa = "TKPadrao" in l or any(_carrega(l, j) for j in usam)
        if precisa and not _carrega(l, "padrao-dados.js"):
            out.append((n, 1, "usa TKPadrao (direto ou por " + ", ".join(j for j in usam if _carrega(l, j))[:50] + ") e não carrega padrao-dados.js"))
    return out

def _vers(v: str):
    return tuple(int(x) if x.isdigit() else 0 for x in re.split(r"[.\-]", v))

def r_common_versao(s: Site):
    # common.js é embutido no aplicativo e cacheado: TODAS as páginas devem pedir a MESMA versão (?v=), a mais nova.
    # Quem muda o common.js sobe o ?v= em todas as páginas, no número do VERSION daquela PR.
    achadas = {}
    for n, _b, l in s.paginas():
        if re.search(r"""src\s*=\s*["']\.?/?common\.js""", l):
            m = re.search(r"""common\.js\?v=([\w.\-]+)""", l)
            achadas[n] = (m.group(1) if m else None, linha_de(l, m.start()) if m else 1)
    com = [v for v, _ in achadas.values() if v]
    ref = max(com, key=_vers) if com else s.versao
    out = []
    for n, (v, ln) in sorted(achadas.items()):
        if not v:
            out.append((n, ln, "common.js sem ?v= (use ?v=%s)" % ref))
        elif v != ref:
            out.append((n, ln, "common.js?v=%s mas as outras páginas usam %s" % (v, ref)))
    if s.versao and com and _vers(ref) > _vers(s.versao):
        out.append(("VERSION", 1, "common.js?v=%s é mais novo que VERSION %s" % (ref, s.versao)))
    return out

SINAIS_TOAST = re.compile(r"""id\s*=\s*["']toast["']|class\s*=\s*["'][^"']*(?<![\w-])toast(?![\w-])|function\s+(?:toast|mostrarToast|showToast|avisoToast)\s*\(""")
def r_toast_proprio(s: Site):
    # Aviso temporário próprio (toast) fora de avisos.js: o dono é TKAviso. Página com toast tem de carregar avisos.js.
    out = []
    for n, _b, l in s.por_ext(".js", ".html", ".css"):
        if n in ("avisos.js", "tk-padrao.css"):
            continue
        vistas = set()
        for m in SINAIS_TOAST.finditer(l):
            ln = linha_de(l, m.start())
            if ln not in vistas:
                vistas.add(ln)
                out.append((n, ln, trecho(l, m.start(), m.end())))
    for n, _b, l in s.paginas():
        if not _carrega(l, "avisos.js") and not any(o[0] == n for o in out):
            scripts = " ".join(re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", l, flags=re.S | re.I))
            if re.search(r"(?<![\w.$])(?:aviso|toast)\s*\(", scripts):
                out.append((n, 1, "usa aviso()/toast() e não carrega avisos.js"))
    return out

def _vocabulario(s: Site):
    """Reaproveita as listas de tests/padrao_vocabulario.py (BANIDOS + PERMITIDO) sem abrir navegador: executa só a parte estática."""
    caminho = os.path.join(s.raiz, "tests", "padrao_vocabulario.py")
    if not os.path.isfile(caminho):
        return [("tests/padrao_vocabulario.py", 1, "arquivo ausente: a regra de vocabulário depende dele")]
    fonte = open(caminho, encoding="utf-8").read()
    corte = re.search(r"(?m)^# -+ na tela\s*$", fonte)
    if not corte:
        return [("tests/padrao_vocabulario.py", 1, "marcador '# --- na tela' não encontrado: ajuste o check_padroes.py junto com o teste")]
    ns = {"__file__": caminho, "__name__": "vocab_estatico"}
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(fonte[:corte.start()], caminho, "exec"), ns)
    out = []
    for (nome, expl), lst in sorted(ns.get("achados", {}).items()):
        for item in lst:
            arq, _, resto = item.partition(":")
            num, _, tr = resto.partition(" ")
            out.append((arq, int(num) if num.isdigit() else 1, "'%s' (%s): %s" % (nome, expl, tr)))
    return out

# id -> (função, título, orientação). A orientação aponta o componente certo.
REGRAS = {
    "vocabulario": (_vocabulario, "termo fora do vocabulário oficial em texto de interface",
                    "use produto/seleção/Gestão/Admin total/Pedir fotos/Tentar de novo/MB/… (seção Vocabulário)"),
    "alert": (r_alert, "alert() fora da lista fechada",
              "aviso que não trava: TKAviso.ok/info/aviso/erro (avisos.js). alert() só para erro que exige ação, e só com a lista revista no PR"),
    "prompt-senha": (r_prompt_senha, "prompt() de senha", "TKAviso.pedirSenha (avisos.js): campo de senha, nunca prompt()"),
    "travar-fundo": (r_travar_fundo, "fundo travado de jeito próprio",
                     "só a classe html.tk-travado (janelas.css); nada de body.style.overflow nem fx-travado"),
    "z-index": (r_zindex, "z-index numérico global", "use var(--z-folha), var(--z-dialogo)... (escala em janelas.css). 0 a 10 só para empilhar dentro do próprio componente"),
    "laranja-solto": (r_laranja, "tom de laranja/marrom fora dos tokens", "use var(--laranja) (preenchimento) ou var(--laranja-txt) (texto/contorno), de tk-padrao.css"),
    "location-origin": (r_location_origin, "location.origin em link", "links compartilháveis usam SITE_URL (common.js)"),
    "img-sem-atribsrc": (r_img_dinamico, "imagem dinâmica sem atribSrc", "<img '+atribSrc(fotoMini(url, 480))+'> (common.js)"),
    "moeda": (r_moeda, "moeda()/typeof moeda (função que não existe)", "use o cálculo de preço do common.js (precoTerminacao / DESCONTO_AVISTA)"),
    "http-na-tela": (r_http_tela, "HTTP + código de status em texto", "TKPadrao.erro(e, 'frase padrão') ou TKAviso.textoErro (padrao-dados.js / avisos.js)"),
    "tablist-sem-tk-abas": (r_tablist, "role=tablist sem a classe tk-abas", "acrescente class=\"tk-abas\" (janelas.css) e aria-selected na aba ativa"),
    "fechar-sem-tk-fechar": (r_fechar, "botão Fechar sem a classe tk-fechar", "class=\"tk-fechar\" (✕ 44×44, janelas.css)"),
    "pagina-sem-padrao": (r_pagina_sem_padrao, "página sem janelas.css, a11y.js ou tk-padrao.css", "toda página carrega os três (ordem: ver páginas existentes)"),
    "padrao-dados": (r_padrao_dados, "TKPadrao sem padrao-dados.js na página", "carregue padrao-dados.js antes do script que usa TKPadrao"),
    "common-versao": (r_common_versao, "common.js?v= diferente entre páginas", "todas as páginas usam o mesmo ?v= (o do VERSION da PR que mudou o common.js)"),
    "toast-proprio": (r_toast_proprio, "aviso temporário (toast) próprio", "TKAviso (avisos.js); a página precisa carregar avisos.js"),
}

# ----------------------------------------------------------------------------------------------- catraca
def medir(site: Site):
    achados = {}
    for rid, (fn, _t, _o) in REGRAS.items():
        achados[rid] = fn(site)
    contagens = {rid: {} for rid in achados}
    for rid, lst in achados.items():
        for arq, _ln, _tr in lst:
            contagens[rid][arq] = contagens[rid].get(arq, 0) + 1
    return achados, contagens

def ler_baseline(caminho: str) -> dict:
    if not os.path.isfile(caminho):
        return {}
    return json.load(open(caminho, encoding="utf-8")).get("regras", {})

def gravar_baseline(caminho: str, contagens: dict) -> None:
    dados = {
        "_leia": "Dívida conhecida dos padrões do site (docs/ia/padroes-site.md). Só pode DESCER: ao pagar dívida rode "
                 "python3 scripts/ci/check_padroes.py --atualizar. Subir exige --aceitar-aumento e justificativa na PR.",
        "versao": 1,
        "regras": {rid: dict(sorted(v.items())) for rid, v in sorted(contagens.items()) if v},
    }
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write("\n")

def comparar(achados, contagens, base):
    subiu, desceu = [], []
    for rid in REGRAS:
        atual, antigo = contagens.get(rid, {}), base.get(rid, {})
        for arq in sorted(set(atual) | set(antigo)):
            a, b = atual.get(arq, 0), antigo.get(arq, 0)
            if a > b:
                subiu.append((rid, arq, b, a))
            elif a < b:
                desceu.append((rid, arq, b, a))
    return subiu, desceu

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raiz", default=ROOT_PADRAO)
    ap.add_argument("--baseline", default=None)
    ap.add_argument("--atualizar", action="store_true")
    ap.add_argument("--aceitar-aumento", action="store_true")
    ap.add_argument("--listar", action="store_true")
    a = ap.parse_args(argv)
    caminho_base = a.baseline or os.path.join(a.raiz, BASELINE_PADRAO)
    site = Site(a.raiz)
    achados, contagens = medir(site)
    base = ler_baseline(caminho_base)

    if a.listar:
        for rid, lst in achados.items():
            print("\n## %s — %s (%d)" % (rid, REGRAS[rid][1], len(lst)))
            for arq, ln, tr in lst:
                print("  %s:%d  %s" % (arq, ln, tr))
        return 0

    subiu, desceu = comparar(achados, contagens, base)
    if a.atualizar:
        if subiu and not a.aceitar_aumento and os.path.isfile(caminho_base):
            print("Recusado: o baseline só pode DESCER. Subiria em:")
            for rid, arq, b, n in subiu:
                print("  [%s] %s: %d -> %d" % (rid, arq, b, n))
            print("Corrija o código (ver %s) ou, com justificativa na PR, use --aceitar-aumento." % DOC)
            return 1
        gravar_baseline(caminho_base, contagens)
        print("Baseline gravado em %s (%d ocorrências em %d regras)." % (os.path.relpath(caminho_base, a.raiz),
              sum(sum(v.values()) for v in contagens.values()), sum(1 for v in contagens.values() if v)))
        return 0

    erros = 0
    for rid, arq, b, n in subiu:
        erros += 1
        _fn, titulo, orient = REGRAS[rid]
        print("ERRO PADRÃO [%s] %s: %s (era %d, agora %d)." % (rid, arq, titulo, b, n))
        print("   Como corrigir: %s. Regras e donos: %s" % (orient, DOC))
        mostradas = [x for x in achados[rid] if x[0] == arq]
        for _arq, ln, tr in mostradas[:8]:
            print("     %s:%d  %s" % (arq, ln, tr))
        if len(mostradas) > 8:
            print("     … +%d" % (len(mostradas) - 8))
    for rid, arq, b, n in desceu:
        erros += 1
        print("DÍVIDA PAGA [%s] %s: caiu de %d para %d. Ótimo! Baixe o baseline para a dívida não voltar: "
              "python3 scripts/ci/check_padroes.py --atualizar" % (rid, arq, b, n))
    total = sum(sum(v.values()) for v in contagens.values())
    if erros:
        print("\ncheck_padroes: FALHOU (%d item(ns)). Dívida conhecida no baseline: %d ocorrências." % (erros, total))
        return 1
    print("check_padroes: OK — %d regras, nenhuma regressão (dívida conhecida no baseline: %d ocorrências, só pode baixar)." % (len(REGRAS), total))
    return 0

if __name__ == "__main__":
    sys.exit(main())
