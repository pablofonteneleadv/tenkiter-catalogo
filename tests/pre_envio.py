"""v4.20: pré-envio das mídias (sobem ao escolher), cadastro idempotente (opId), pacote final ao minimizar (keepalive) e retomada sem perguntar.
    python3 tests/pre_envio.py"""
import sys, os, re, json
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI); os.makedirs(os.path.join(AQUI, "saida"), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
from PIL import Image
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
S = os.path.join(AQUI, "saida")
Image.new("RGB", (900, 1200), (190, 60, 110)).save(os.path.join(S, "pre1.jpg"))
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + (" — " + str(e) if e and not c else ""))

def novo(p, modo="ok", cloud_ok=True):
    b = p.chromium.launch(args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    ctx.add_init_script(SESSION); log = []
    st = install(ctx, log=log, versao="4.19"); st["midia"]["modo"] = modo
    ups = []
    def cl(route):
        ups.append(route.request.url)
        if not cloud_ok: return route.abort()
        return route.fulfill(json={"secure_url": "https://res.cloudinary.com/z/image/upload/v1/up%d.jpg" % len(ups)})
    ctx.route("https://api.cloudinary.com/**", cl)
    def assin(route):
        r = route.request
        if r.method == "POST" and '"assinarUploadVideo"' in (r.post_data or ""): return route.fulfill(json={"ok": True, "cloudName": "z", "apiKey": "k", "timestamp": 1, "folder": "f", "signature": "s"})
        return route.fallback()
    ctx.route("**script.google.com/**", assin)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(1500)
    pg.evaluate("document.getElementById('card-form').open=true"); pg.wait_for_timeout(300)
    return b, ctx, pg, st, log, errs, ups

def preencher(pg, nome="Vestido Pré"):
    pg.fill("#nome", nome); pg.fill("#preco", "99.90"); pg.fill("#estoque", "2")
    pg.click("#chips-genero .chip:first-child")
    pg.click("#btn-abrir-categorias"); pg.click("#cat-lista .cat-item:has-text('Vestido')"); pg.click("#cat-pronto")
    pg.locator('#chips-tamanhos .chip').filter(has_text=re.compile(r'^P$')).click()

def criacoes(log): return [x for x in log if x.get("action") == "create"]

with sync_playwright() as p:
    print("== A. a foto sobe ao escolher, antes de salvar ==")
    b, ctx, pg, st, log, errs, ups = novo(p)
    pg.set_input_files("#galeria-input", os.path.join(S, "pre1.jpg")); pg.wait_for_timeout(1500)
    chk("1 envio ao R2 ANTES de tocar em Salvar", len(st["midia"]["envios"]) == 1, len(st["midia"]["envios"]))
    chk("selo verde 'enviada' na miniatura", "enviada" in (pg.inner_text("#galeria-grid .pre-badge") or ""), pg.inner_text("#galeria-grid"))
    preencher(pg); pg.click("#btn-salvar"); pg.wait_for_timeout(2500)
    cr = criacoes(log)
    chk("peça criada com a URL que já tinha subido", len(cr) == 1 and cr[0]["fotoUrlExistente"].startswith("https://tenkiter-midia."), cr)
    chk("a foto NÃO subiu de novo ao salvar", len(st["midia"]["envios"]) == 1, len(st["midia"]["envios"]))
    chk("o pacote leva opId", len(cr) == 1 and re.match(r"^[A-Za-z0-9_-]{6,40}$", cr[0].get("opId", "")), cr and cr[0].get("opId"))
    chk("sem erro de JavaScript", not errs, errs); b.close()

    print("== B. tocar em Salvar com a foto ainda subindo: espera terminar e usa a mesma ==")
    b, ctx, pg, st, log, errs, ups = novo(p)
    seguradas = []
    ctx.route(re.compile(r".*tenkiter-midia.*/u.*"), lambda route: seguradas.append(route))
    pg.set_input_files("#galeria-input", os.path.join(S, "pre1.jpg")); pg.wait_for_timeout(1200)
    chk("subida em andamento (selo não é 'enviada')", seguradas and "enviada" not in pg.inner_text("#galeria-grid .pre-badge"), pg.inner_text("#galeria-grid"))
    preencher(pg); pg.click("#btn-salvar"); pg.wait_for_timeout(1000)
    chk("Salvar não manda o cadastro enquanto a foto não terminou", len(criacoes(log)) == 0)
    chk("formulário já liberado para a próxima peça", pg.evaluate("document.getElementById('nome').value") == "")
    seguradas[0].fallback(); pg.wait_for_timeout(2500)
    cr = criacoes(log)
    chk("terminou a foto, o cadastro saiu com a URL dela", len(cr) == 1 and cr[0]["fotoUrlExistente"].startswith("https://tenkiter-midia."), cr)
    chk("só 1 envio de foto no total", len(st["midia"]["envios"]) == 1, len(st["midia"]["envios"]))
    chk("sem erro de JavaScript", not errs, errs); b.close()

    print("== C. falha no pré-envio: selo avisa, toque reenvia ==")
    b, ctx, pg, st, log, errs, ups = novo(p, modo="recusa", cloud_ok=False)
    pg.set_input_files("#galeria-input", os.path.join(S, "pre1.jpg")); pg.wait_for_timeout(9000)
    t = pg.inner_text("#galeria-grid .pre-badge")
    chk("selo vermelho 'toque para reenviar'", "reenviar" in t, t)
    ctx.unroute("https://api.cloudinary.com/**")
    ctx.route("https://api.cloudinary.com/**", lambda r: r.fulfill(json={"secure_url": "https://res.cloudinary.com/z/image/upload/v1/ok.jpg"}))
    pg.click("#galeria-grid .pre-badge"); pg.wait_for_timeout(2500)
    chk("depois do toque a foto sobe", "enviada" in pg.inner_text("#galeria-grid .pre-badge"), pg.inner_text("#galeria-grid .pre-badge"))
    b.close()

    print("== D. minimizar com o cadastro em andamento: pacote final sai sem duplicar ==")
    b, ctx, pg, st, log, errs, ups = novo(p)
    pg.set_input_files("#galeria-input", os.path.join(S, "pre1.jpg")); pg.wait_for_timeout(1500)
    presas = []
    def segura(route):
        if route.request.method == "POST" and '"action":"create"' in (route.request.post_data or ""): presas.append(route); return
        return route.fallback()
    ctx.route("**script.google.com/**", segura)
    preencher(pg); pg.click("#btn-salvar"); pg.wait_for_timeout(1200)
    chk("o cadastro ficou pendente (1 pedido preso)", len(presas) == 1, len(presas))
    pg.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'}); document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(600)
    chk("ao minimizar sai um 2º pedido com o MESMO opId", len(presas) == 2 and json.loads(presas[0].request.post_data)["opId"] == json.loads(presas[1].request.post_data)["opId"], len(presas))
    for r in presas: r.fallback()
    pg.wait_for_timeout(2000)
    chk("o servidor criou UMA peça só (o 2º pedido foi reconhecido)", len(st["creates"]) == 1, st.get("creates"))
    chk("sem erro de JavaScript", not errs, errs); b.close()

    print("== E. app fechou na hora de salvar: ao voltar reenvia sozinho, sem perguntar ==")
    b, ctx, pg, st, log, errs, ups = novo(p)
    pg.set_input_files("#galeria-input", os.path.join(S, "pre1.jpg")); pg.wait_for_timeout(1500)
    presas = []
    def segura2(route):
        if route.request.method == "POST" and '"action":"create"' in (route.request.post_data or ""): presas.append(route); return
        return route.fallback()
    ctx.route("**script.google.com/**", segura2)
    preencher(pg); pg.click("#btn-salvar"); pg.wait_for_timeout(1200)
    op1 = json.loads(presas[0].request.post_data)["opId"]
    ctx.unroute("**script.google.com/**", segura2)
    pg.reload(); pg.wait_for_timeout(3500)
    cr = criacoes(log)
    chk("ao reabrir o painel o cadastro foi reenviado com o mesmo opId", any(x.get("opId") == op1 for x in cr), [x.get("opId") for x in cr])
    chk("sem pergunta 'não sei se salvou'", "não sei se" not in pg.inner_text("#fila-envios"), pg.inner_text("#fila-envios"))
    chk("sem erro de JavaScript", not errs, errs); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
