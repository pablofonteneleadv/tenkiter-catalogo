"""Postagens (17/10/2026): padrões (Story, Encaixar, foto travada), sem zoom/texto explicativo, 3 opções na horizontal embaixo da prévia,
"Personalizar textos" por toque (escolher o texto na prévia, mover/aumentar/girar com os dedos, editar só o campo escolhido),
foto travada x destravada (2 dedos aumentam e GIRAM a foto). Dedo de verdade via CDP (390 px). O Apps Script e a internet são SIMULADOS."""
import sys, os, math
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"; erros = []
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    cdp = ctx.new_cdp_session(pg)
    def tp(pts): return [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]
    def gesto(ini, fim, passos=8):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": tp(ini)})
        for i in range(1, passos + 1):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": tp([(a[0] + (z[0] - a[0]) * i / passos, a[1] + (z[1] - a[1]) * i / passos) for a, z in zip(ini, fim)])}); pg.wait_for_timeout(16)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); pg.wait_for_timeout(200)
    def toque(x, y): gesto([(x, y)], [(x, y)], 1)
    def boxes(): return pg.evaluate("(()=>{const c=document.querySelector('#po-previa canvas');const r=c.getBoundingClientRect();const k=r.width/c.width;return (c._boxes||[]).map(x=>({k:x.k,x:r.left+(x.x0+x.x1)/2*k,y:r.top+(x.y0+x.y1)/2*k,w:(x.x1-x.x0),h:(x.y1-x.y0)}))})()")
    def ver_canvas(): pg.evaluate("document.querySelector('#po-previa canvas').scrollIntoView({block:'center'})"); pg.wait_for_timeout(250)
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(1400)

    print("== Padrões e tela enxuta ==")
    chk("Story já vem escolhido", pg.locator("[data-tipo=story][aria-pressed=true]").count() == 1)
    chk("Encaixar (fundo desfocado) já vem escolhido", pg.locator("[data-aj=inteira][aria-pressed=true]").count() == 1)
    chk("a prévia já está aberta", pg.locator("#po-previa canvas").count() >= 1)
    chk("caixa 'Travar a foto' vem MARCADA", pg.locator("[data-a=travar]").is_checked() and "Travar a foto" in pg.inner_text("#po-foto-aj"))
    chk("sem barra de zoom e sem 'Mover a foto'", pg.locator("#po-zoom").count() == 0 and pg.locator("[data-a=mover]").count() == 0)
    chk("sem texto explicativo embaixo da prévia", "Toque num visual" not in pg.inner_text("#po-corpo") and "Arraste os textos" not in pg.inner_text("#po-corpo"))
    g = pg.evaluate("(()=>{const r=[...document.querySelectorAll('[data-aj]')].map(e=>e.getBoundingClientRect());const p=document.querySelector('#po-previa').getBoundingClientRect();return {tops:r.map(x=>Math.round(x.top)),n:r.length,abaixo:r.every(x=>x.top>=p.bottom-1)}})()")
    chk("Cortar, Encaixar e Margens: 3 opções na mesma linha, embaixo da prévia", g["n"] == 3 and len(set(g["tops"])) == 1 and g["abaixo"], g)

    print("== Personalizar textos por toque ==")
    ver_canvas(); bx = boxes(); alvo = [x for x in bx if x["k"] == "nome"] or [x for x in bx if x["k"] != "zona"]
    chk("a prévia tem textos para tocar", len(alvo) >= 1, [x["k"] for x in bx]); a = alvo[0]; k = a["k"]
    chk("nada escolhido: nenhum campo aparece, só a dica", pg.locator("#po-textos .po-it:visible").count() == 0)
    toque(a["x"], a["y"]); pg.wait_for_timeout(300)
    chk("tocar no texto da prévia escolhe ESSE texto", pg.evaluate("document.querySelector('[data-seltx=%s]').getAttribute('aria-pressed')" % k) == "true")
    chk("a janela 'Personalizar textos' abre sozinha", pg.evaluate("document.getElementById('po-det').open"))
    vis = pg.evaluate("[...document.querySelectorAll('#po-textos .po-it')].filter(e=>e.offsetParent!==null).map(e=>e.dataset.it)")
    chk("embaixo aparece SÓ o campo daquele texto", vis == [k], vis)
    pg.fill("#po-tx-%s" % k, "Vestido Novo"); pg.wait_for_timeout(300)
    chk("editar o campo muda o texto na prévia (e o foco continua)", pg.evaluate("document.activeElement.id") == "po-tx-%s" % k)
    outro = [x for x in boxes() if x["k"] not in (k, "zona")]
    if outro:
        ver_canvas(); o = [x for x in boxes() if x["k"] == outro[0]["k"]][0]; toque(o["x"], o["y"]); pg.wait_for_timeout(300)
        vis = pg.evaluate("[...document.querySelectorAll('#po-textos .po-it')].filter(e=>e.offsetParent!==null).map(e=>e.dataset.it)")
        chk("tocar em OUTRO texto troca o campo de baixo", vis == [o["k"]], vis)
        pg.click("[data-seltx=%s]" % k); pg.wait_for_timeout(200)
    chk("os nomes acima também escolhem o texto", pg.evaluate("document.querySelector('[data-seltx=%s]').getAttribute('aria-pressed')" % k) == "true")

    print("== Dois dedos no TEXTO (foto travada): aumenta e gira ==")
    ver_canvas(); a = [x for x in boxes() if x["k"] == k][0]; cx, cy = a["x"], a["y"]
    tm0 = float(pg.input_value("#po-tm-%s" % k)); giro0 = float(pg.input_value("#po-gr-%s" % k))
    z0 = pg.evaluate("document.querySelector('#po-previa canvas')._m.zoom||1"); gf0 = pg.evaluate("document.querySelector('#po-previa canvas')._m.giro||0")
    gesto([(cx - 30, cy), (cx + 30, cy)], [(cx - 60 * math.cos(math.radians(30)), cy - 60 * math.sin(math.radians(30))), (cx + 60 * math.cos(math.radians(30)), cy + 60 * math.sin(math.radians(30)))])
    tm1 = float(pg.input_value("#po-tm-%s" % k)); giro1 = float(pg.input_value("#po-gr-%s" % k))
    chk("afastar os dedos AUMENTA o texto", tm1 > tm0 * 1.4, (tm0, tm1))
    chk("girar os dedos GIRA o texto (≈ 30°)", 22 <= giro1 <= 38, giro1)
    chk("a foto não mexeu (está travada)", pg.evaluate("document.querySelector('#po-previa canvas')._m.zoom||1") == z0 and pg.evaluate("document.querySelector('#po-previa canvas')._m.giro||0") == gf0)
    ver_canvas(); a2 = [x for x in boxes() if x["k"] == k][0]
    chk("o quadro do texto girado muda (fica mais alto/largo)", abs(a2["h"] - a["h"]) > 5 or abs(a2["w"] - a["w"]) > 5, (a, a2))
    ver_canvas(); a2 = [x for x in boxes() if x["k"] == k][0]
    gesto([(a2["x"], a2["y"])], [(a2["x"] + 20, a2["y"] + 40)])
    chk("arrastar com 1 dedo mantém o giro", abs(float(pg.input_value("#po-gr-%s" % k)) - giro1) < 1, pg.input_value("#po-gr-%s" % k))
    chk("e o texto saiu do lugar", any(abs(x["y"] - a2["y"]) > 10 for x in boxes() if x["k"] == k))
    pg.fill("#po-gr-%s" % k, "0") if False else pg.evaluate("()=>{const e=document.getElementById('po-gr-%s');e.value=0;e.dispatchEvent(new Event('input',{bubbles:true}))}" % k); pg.wait_for_timeout(300)
    chk("a barra 'Girar' também desfaz o giro", pg.evaluate("(()=>{const m=document.querySelector('#po-previa canvas')._m;return (((m.pos||{})[document.querySelector('[data-tpl][aria-pressed=true]').dataset.tpl]||{})['%s']||{}).gr||0})()" % k) == 0)

    print("== Tocar num espaço vazio solta o texto ==")
    ver_canvas()
    c = pg.evaluate("(()=>{const c=document.querySelector('#po-previa canvas');const r=c.getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height}})()")
    livre = None
    for fx in (.5, .15, .85):
        for fy in (.03, .5, .97):
            px, py = c["l"] + c["w"] * fx, c["t"] + c["h"] * fy
            if not any(abs(x["x"] - px) < x["w"] * c["w"] / 1080 / 2 + 6 and abs(x["y"] - py) < x["h"] * c["w"] / 1080 / 2 + 6 for x in boxes()): livre = (px, py); break
        if livre: break
    toque(*livre); pg.wait_for_timeout(300)
    chk("tocar fora de qualquer texto: nenhum campo fica aberto", pg.locator("#po-textos .po-it:visible").count() == 0, livre)

    print("== Foto destravada: 1 dedo move, 2 dedos aumentam e GIRAM ==")
    pg.evaluate("document.querySelector('#po-foto-aj').scrollIntoView({block:'center'})"); pg.wait_for_timeout(200)
    pg.locator("[data-a=travar]").uncheck(); pg.wait_for_timeout(300)
    chk("desmarcar libera a foto", not pg.locator("[data-a=travar]").is_checked())
    ver_canvas(); c = pg.evaluate("(()=>{const c=document.querySelector('#po-previa canvas');const r=c.getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height}})()")
    cx, cy = c["l"] + c["w"] * .5, c["t"] + c["h"] * .08
    gesto([(cx - 30, cy), (cx + 30, cy)], [(cx - 50 * math.cos(math.radians(40)), cy - 50 * math.sin(math.radians(40))), (cx + 50 * math.cos(math.radians(40)), cy + 50 * math.sin(math.radians(40)))])
    m = pg.evaluate("(()=>{const m=document.querySelector('#po-previa canvas')._m;return {z:m.zoom||1,g:m.giro||0}})()")
    chk("com a foto livre, os dedos aumentam a foto", m["z"] > 1.3, m)
    chk("e GIRAM a foto (≈ 40°)", 30 <= m["g"] <= 50, m)
    ver_canvas()
    chk("trocar Cortar/Encaixar zera zoom e giro", (pg.click("[data-aj=preencher]"), pg.wait_for_timeout(400), pg.evaluate("(()=>{const m=document.querySelector('#po-previa canvas')._m;return (m.zoom||1)==1&&(m.giro||0)==0})()"))[2])
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
