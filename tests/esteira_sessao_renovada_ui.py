"""v7.52.0 — Esteira: pedir fotos com opções prontas, cartão só de fotos, caixa de fotos da equipe e Preparação sem instruções.
Jornada em esteira.html (e o cadastro da Gestão aberto com as fotos da caixa) com catálogo, login, servidor da Esteira e servidor de
fotos SIMULADOS. Nada vai ao Google, à Cloudflare nem ao servidor de mídia. Celular (390) e computador (1440).
Evidências .jpg em tests/saida/esteira-fotos/ (TK_EVID=docs/ux/esteira-fotos-20261103 gera as do PR)."""
import json, os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).parent
EVID = Path(os.environ.get("TK_EVID", AQUI / "saida" / "esteira-fotos")); EVID.mkdir(parents=True, exist_ok=True)
# reaproveita o servidor simulado da Esteira (catálogo, login, conferência, preparação) de tests/esteira_ui.py, sem rodar a jornada dele
_src = (AQUI / "esteira_ui.py").read_text(encoding="utf-8").split("\nwith sync_playwright() as p:")[0]
_ns = {"__file__": str(AQUI / "esteira_ui.py"), "__name__": "esteira_base"}
exec(compile(_src, "esteira_ui_base", "exec"), _ns)
instalar, BASE, PNG, _png_cor = _ns["instalar"], _ns["BASE"], _ns["PNG"], _ns["_png_cor"]
ok, falhas = 0, []
def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1; print("  ✔ " + nome)
    else: falhas.append(nome); print("  ✘ " + nome + ("" if det is None else " — " + str(det)[:400]))
def foto_png(cor): return {"name": "foto%d.png" % sum(cor), "mimeType": "image/png", "buffer": _png_cor(cor, 64, 80)}
def shot(pg, nome, full=False): pg.screenshot(path=str(EVID / (nome + ".jpg")), type="jpeg", quality=78, full_page=full)
SEM_ROLAGEM = "document.documentElement.scrollWidth <= innerWidth"
ALVOS = "(sel)=>[...document.querySelectorAll(sel)].filter(b=>b.getClientRects().length && getComputedStyle(b).visibility!=='hidden').map(b=>{const r=b.getBoundingClientRect();return [Math.round(Math.min(r.width,r.height)*10)/10,(b.textContent||b.getAttribute('aria-label')||'').trim().slice(0,30)]})"
def confirmar_revisao(pg):
    """v7.81.0: as fotos passam pela revisão; confirma e solta os 8 s do desfazer (tela oculta entra na fila na hora)."""
    pg.wait_for_selector("#rev-confirmar:not([disabled])", timeout=8000)
    pg.click("#rev-confirmar"); pg.wait_for_selector(".tk-aviso .tk-aviso-desfazer", timeout=4000)
    pg.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden")
def confirmar_revisao_caixa(pg):
    """v7.82.0: as fotos do envio para a caixa passam pela revisão; confirma e espera a revisão fechar."""
    pg.wait_for_selector("#rev-confirmar:not([disabled])", timeout=8000)
    pg.click("#rev-confirmar"); pg.wait_for_selector(".folha[aria-label='Revisar fotos para a caixa']", state="detached", timeout=4000)
def alvos_ok(pg, sel):
    v = pg.evaluate(ALVOS, sel); ruins = [x for x in v if x[0] < 43.5]; return not ruins, ruins
M = "https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202611/"

def fotos_srv(ctx, st, admin=True):
    """Rotas novas (/esteira/fotos*, /esteira/caixa*) e o servidor de fotos; o resto cai no simulado de esteira_ui.py."""
    f = {"pedidos": [{"produto": "1001", "nome": "Vestido Midi Linho", "codigo": "TK-1001", "foto": M.replace("202611/", "") + "x.jpg", "noSite": True, "itens": [
            {"id": 51, "rotulos": ["No pano", "No manequim"], "obs": "luz natural", "texto": "", "por": "Pablo", "em": "2026-11-02T10:00:00Z"},
            {"id": 52, "rotulos": ["Outro: foto das costas"], "obs": "", "texto": "", "por": "Iara", "em": "2026-11-03T09:00:00Z"}]}],
         "pedir": [], "concluir": [], "enviar": [], "usar": [], "descartar": [], "uploads": 0, "falhar_upload": [], "seq": 200,
         "caixa": [
            {"id": 101, "url": M + "bia1.jpg", "descricao": "vestido azul no manequim", "descricaoLote": "Vestidos que chegaram hoje", "lote": "lt-bia", "produto": "", "produtoNome": "", "por": "Bia", "minha": False, "em": "2026-11-03T08:10:00Z", "status": "nova", "repetidaDe": None},
            {"id": 102, "url": M + "bia2.jpg", "descricao": "", "descricaoLote": "Vestidos que chegaram hoje", "lote": "lt-bia", "produto": "", "produtoNome": "", "por": "Bia", "minha": False, "em": "2026-11-03T08:10:00Z", "status": "nova", "repetidaDe": None},
            {"id": 103, "url": M + "bia3.jpg", "descricao": "", "descricaoLote": "Vestidos que chegaram hoje", "lote": "lt-bia", "produto": "", "produtoNome": "", "por": "Bia", "minha": False, "em": "2026-11-03T08:10:00Z", "status": "nova", "repetidaDe": {"id": 90, "em": "2026-11-01T10:00:00Z", "por": "Clarice"}},
            {"id": 104, "url": M + "iara1.jpg", "descricao": "costas do floral", "descricaoLote": "", "lote": "lt-iara", "produto": "1002", "produtoNome": "Vestido Longo Floral", "por": "Iara", "minha": True, "em": "2026-11-03T09:30:00Z", "status": "nova", "repetidaDe": None}]}
    st["f"] = f
    def item_saida(i): return dict({"usoProduto": "", "usoNome": "", "usadaPor": "", "usadaEm": ""}, **i)
    def hd(route):
        req = route.request; u = req.url
        if "tenkiter-midia" in u and req.method == "POST":
            f["uploads"] += 1
            if f["uploads"] in f["falhar_upload"]: return route.fulfill(status=503, json={"ok": False, "erro": "O servidor de fotos está ocupado. Tente de novo."})
            return route.fulfill(json={"ok": True, "url": M + "up%03d.jpg" % f["uploads"], "tipo": "foto"})
        if "tenkiter-ig" not in u: return route.fallback()
        path = re.sub(r"^https://[^/]+", "", u).split("?")[0]
        b = json.loads(req.post_data or "{}") if req.method == "POST" else {}
        J = lambda d, s=200: route.fulfill(status=s, json=d)
        eu = {"whats": "88999999999", "nome": "Iara", "admin": admin, "membro": True, "confere": True, "aceitar": admin, "gestorFotos": admin}
        # v7.88.0: ao recarregar, a Esteira volta para a aba em que a pessoa estava e confere o acesso dessa aba primeiro.
        if path == "/esteira/sincronizar": return J({"ok": True, "eu": eu, "acesso": "qa-fotos", "data": "", "revisao": 1})
        if path == "/esteira/fotos": return J({"ok": True, "eu": eu, "pedidos": f["pedidos"], "caixaNovas": sum(1 for i in f["caixa"] if i["status"] == "nova") if admin else 0})
        if path == "/esteira/fotos/pedir":
            f["pedir"].append(b)
            if not b.get("opcoes") and not b.get("outro"): return J({"ok": False, "erro": "Escolha como quer as fotos."}, 400)
            x = next(p for p in _ns_todos() if p["ID"] == b["produto"])
            rot = [{"pano": "No pano", "manequim": "No manequim", "cores": "Das outras cores/estampas"}[k] for k in b.get("opcoes", [])] + (["Outro: " + b["outro"]] if b.get("outro") else [])
            f["seq"] += 1; g = next((g for g in f["pedidos"] if g["produto"] == b["produto"]), None)
            if not g: g = {"produto": b["produto"], "nome": x["Nome"], "codigo": x["Codigo"], "foto": x["Foto_URL"], "noSite": x["Status"] == "Ativo", "itens": []}; f["pedidos"].append(g)
            g["itens"].append({"id": f["seq"], "rotulos": rot, "obs": b.get("obs", ""), "texto": "", "por": "Iara", "em": "2026-11-03T12:00:00Z"})
            return J({"ok": True, "id": f["seq"], "repetido": False})
        if path == "/esteira/fotos/concluir":
            f["concluir"].append(b); ids = set(b.get("ids", [])); st["feitas"].extend(ids)
            for g in f["pedidos"]: g["itens"] = [i for i in g["itens"] if i["id"] not in ids]
            f["pedidos"] = [g for g in f["pedidos"] if g["itens"]]
            return J({"ok": True, "concluidos": len(ids)})
        if path == "/esteira/caixa/enviar":
            f["enviar"].append(b); out = []
            for it in b["itens"]:
                ja = next((i for i in f["caixa"] if i.get("op") == it["op"]), None)
                if not ja:
                    f["seq"] += 1; ja = {"id": f["seq"], "op": it["op"], "url": it["url"], "descricao": it.get("descricao", ""), "descricaoLote": b.get("descricaoLote", ""), "lote": b["lote"], "produto": b.get("produto", ""), "produtoNome": b.get("produtoNome", ""), "por": "Iara", "minha": True, "em": "2026-11-03T12:30:00Z", "status": "nova", "repetidaDe": None}
                    f["caixa"].insert(0, ja)
                out.append(item_saida(ja))
            return J({"ok": True, "itens": out})
        if path == "/esteira/caixa":
            ver = (re.search(r"ver=(\w+)", u) or [None, "novas"])[1]
            if not admin: its = [i for i in f["caixa"] if i["minha"]]
            else: its = [i for i in f["caixa"] if (i["status"] in ("nova", "cadastro") if ver == "novas" else i["status"] == ("usada" if ver == "usadas" else "descartada"))]
            base_ = f["caixa"] if admin else [i for i in f["caixa"] if i["minha"]]
            cont = {"novas": sum(1 for i in base_ if i["status"] in ("nova", "cadastro")), "usadas": sum(1 for i in base_ if i["status"] == "usada"), "descartadas": sum(1 for i in base_ if i["status"] == "descartada")}
            extra = {}
            if 'pagina=1' in u:
                antes = re.search(r"[?&]antes=(\d+)", u)
                its = sorted((i for i in its if not antes or i["id"] < int(antes[1])), key=lambda i: -i["id"])
                extra["proximo"] = its[23]["id"] if len(its) > 24 else None
                its = its[:24]
            return J({"ok": True, "gestor": admin, "ver": ver if admin else "minhas", "contagem": cont, "itens": [item_saida(i) for i in its], **extra})
        if path.startswith("/esteira/caixa/") and not admin: return J({"ok": False, "erro": "Só o administrador total e quem cadastra produtos usam as fotos recebidas."}, 403)
        if path == "/esteira/caixa/usar":
            f["usar"].append(b); n = 0
            for i in f["caixa"]:
                if i["id"] in b["ids"]:
                    if b["uso"] == "cadastro" and i["status"] in ("nova", "cadastro"): i.update(status="cadastro", usadaPor="Iara", usadaEm="2026-11-03T13:00:00Z"); n += 1
                    elif b["uso"] != "cadastro" and i["status"] != "usada": i.update(status="usada", usoProduto=b["produto"], usoNome=b.get("produtoNome", ""), usadaPor="Iara", usadaEm="2026-11-03T13:00:00Z"); n += 1
            return J({"ok": True, "marcadas": n})
        if path == "/esteira/caixa/descartar":
            f["descartar"].append(b); n = 0
            for i in f["caixa"]:
                if i["id"] in b["ids"]:
                    if b.get("desfazer") and i["status"] in ("descartada", "cadastro"): i["status"] = "nova"; n += 1
                    elif not b.get("desfazer") and i["status"] in ("nova", "cadastro"): i.update(status="descartada", usadaPor="Iara", usadaEm="2026-11-03T13:00:00Z"); n += 1
            return J({"ok": True, "marcadas": n})
        return route.fallback()
    ctx.route("**/*", hd)
    return f

_TODOS = []
def _ns_todos(): return _TODOS

def entrar(pg):
    pg.goto(BASE + "esteira.html"); pg.wait_for_selector("#login-w", timeout=8000)
    pg.fill("#login-w", "88999999999"); pg.fill("#login-s", "senha"); pg.click("text=Entrar >> nth=-1"); pg.wait_for_selector(".peca", timeout=8000)

# ==== v7.88.1 — Esteira em branco no app (relato do Pablo com captura, 22/11/2026) ====
# Outra tela (Gestão, Mensagens) renova o código da sessão; a Esteira comparava o código e limpava a tela / parava o
# carregamento no meio. Renovar em qualquer momento do carregamento nunca pode deixar a tela vazia; trocar de CONTA sim limpa.
OKS = []; BADS = []
def chk2(n, c, e=""):
    (OKS if c else BADS).append(n); print(("  ✔ " if c else "  ✘ ") + n + ("" if c else " — " + str(e)[:300]))
RENOVA = "(()=>{const s=JSON.parse(localStorage.getItem('tm_session'));s.sessao=s.sessao+'r';localStorage.setItem('tm_session',JSON.stringify(s))})()"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for atraso in (0, 100, 150, 250, 400, 800, 1500, 0, 150, 150):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, service_workers="block")
        st = instalar(ctx, admin=True); fotos_srv(ctx, st, admin=True); pg = ctx.new_page(); erros = []
        pg.on("pageerror", lambda e: erros.append(str(e)))
        entrar(pg); pg.wait_for_timeout(600)
        outra = ctx.new_page(); outra.goto(pg.url.split("esteira.html")[0] + "404.html", wait_until="domcontentloaded")
        pg.reload(wait_until="commit"); pg.wait_for_timeout(atraso)
        outra.evaluate(RENOVA)
        try: pg.wait_for_function("document.getElementById('app').innerText.trim().length > 50 && !document.getElementById('abas').hidden", timeout=12000); ok = True
        except Exception: ok = False
        chk2(f"código da sessão renovado {atraso} ms depois de abrir: a Esteira carrega normalmente (abas e conteúdo)", ok, pg.evaluate("[document.getElementById('abas').hidden, document.getElementById('app').innerText.slice(0,80)]"))
        chk2(f"{atraso} ms: sem erro de JavaScript", not erros, erros)
        ctx.close()
    # tela já aberta e trabalhando: renovar não apaga nada e não muda de aba
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, service_workers="block")
    st = instalar(ctx, admin=True); fotos_srv(ctx, st, admin=True); pg = ctx.new_page(); entrar(pg)
    pg.click("nav.abas button[data-aba=fotos]"); pg.wait_for_selector("#caixa .cx-item", timeout=8000); pg.wait_for_timeout(500)
    outra = ctx.new_page(); outra.goto(pg.url.split("esteira.html")[0] + "404.html", wait_until="domcontentloaded"); outra.evaluate(RENOVA); pg.wait_for_timeout(2500)
    chk2("tela aberta em Fotos: renovar o código não apaga a tela nem volta para Hoje", pg.evaluate("document.getElementById('app').dataset.tela") == "fotos" and pg.locator("#caixa .cx-item").count() > 0)
    # trocar de CONTA (outro WhatsApp) continua limpando e pedindo a tela certa da outra conta
    outra.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('tm_session'));s.whatsapp='88911112222';localStorage.setItem('tm_session',JSON.stringify(s))})()"); pg.wait_for_timeout(2500)
    chk2("trocar de CONTA em outra tela ainda limpa o que era da conta anterior", pg.locator("#caixa .cx-item").count() == 0)
    ctx.close(); b.close()
print("OK=%d FALHAS=%d %s" % (len(OKS), len(BADS), BADS))
sys.exit(1 if BADS else 0)
