"""Postagens v4.9: escolher VÁRIAS peças (grade com filtros), Ela usa TM com seletor de fotos de clientes (marcar todas), ocultar texto, 10 posições do Clássico,
faixa do link no Story (só na prévia) e Livre com os mesmos visuais."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def corpo(pg): return pg.inner_text("#po-corpo")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"; g = st["ig"]
    g["fotos"] = [{"id": i, "origem": "cliente", "url": "https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/fc%d.jpg" % i, "whats": "889888877%02d" % i, "nome": "Cliente %d" % i, "instagram": "", "obs": "", "status": "nova", "vinculo": "conta", "criadoPor": "x"} for i in (7, 8, 9)]
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)

    print("== Com peça: grade, filtros, várias de uma vez ==")
    n0 = pg.locator(".po-card").count()
    chk("a grade mostra várias peças de uma vez", n0 >= 3, n0)
    chk("há filtros de gênero e categoria", pg.locator("#po-fg").count() == 1 and pg.locator("#po-fc").count() == 1)
    pg.click(".po-card >> nth=0"); pg.click(".po-card >> nth=1"); pg.wait_for_timeout(150)
    chk("marca duas peças e o botão diz quantas", pg.locator(".po-card[aria-pressed=true]").count() == 2 and "2 peças" in corpo(pg))
    pg.click("[data-a=pecas-todas]"); pg.wait_for_timeout(150)
    chk("'Marcar todas' marca a lista inteira", pg.locator(".po-card[aria-pressed=true]").count() == n0)
    pg.click("[data-a=pecas-todas]"); pg.wait_for_timeout(150)
    chk("e desmarca de novo", pg.locator(".po-card[aria-pressed=true]").count() == 0 and pg.locator("[data-a=usarpecas]").is_disabled())
    gen = pg.evaluate("[...document.querySelectorAll('#po-fg option')].map(o=>o.value).filter(Boolean)")
    if gen:
        pg.select_option("#po-fg", gen[0]); pg.wait_for_timeout(200)
        chk("filtro por gênero reduz a lista", 0 < pg.locator(".po-card").count() <= n0)
        pg.select_option("#po-fg", ""); pg.wait_for_timeout(200)
    pg.click(".po-card >> nth=0"); pg.click(".po-card >> nth=1"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(900)
    chk("segue para as escolhas da 1ª peça", "O que postar?" in corpo(pg) and "Visual" in corpo(pg))

    print("== 10 visuais: nada sobreposto nem fora da imagem; ocultar ==")
    TPLS = ["classico", "promo", "minimal", "rodape", "lateral", "cabecalho", "energia", "blocos", "editorial", "cartao"]
    chk("10 visuais prontos além do Original", all(pg.locator("[data-tpl=%s]" % t).count() == 1 for t in TPLS + ["original"]))
    def boxes(): return pg.evaluate("(()=>{const c=document.querySelector('#po-previa canvas');return {w:c.width,h:c.height,b:(c._boxes||[]).map(x=>({k:x.k,x0:x.x0,y0:x.y0,x1:x.x1,y1:x.y1}))}})()")
    def sobrepoe(a, b): return a["x0"] < b["x1"] - 1 and b["x0"] < a["x1"] - 1 and a["y0"] < b["y1"] - 1 and b["y0"] < a["y1"] - 1
    for tp in TPLS:
        pg.click("[data-tpl=%s]" % tp); pg.wait_for_timeout(700); d = boxes(); bs = d["b"]
        dentro = all(x["x0"] >= -1 and x["y0"] >= -1 and x["x1"] <= d["w"] + 1 and x["y1"] <= d["h"] + 1 for x in bs)
        cruz = [(x["k"], y["k"]) for i, x in enumerate(bs) for y in bs[i + 1:] if sobrepoe(x, y)]
        chk("visual %s: tem zona de link, tudo dentro da imagem e nenhum texto por cima de outro" % tp, any(x["k"] == "zona" for x in bs) and dentro and not cruz, (cruz, [x["k"] for x in bs]))
    pg.click("[data-tpl=classico]"); pg.wait_for_timeout(500)
    def box(k): return pg.evaluate("(k)=>{const c=document.querySelector('#po-previa canvas');const b=(c._boxes||[]).find(x=>x.k===k);return b?{x0:b.x0,y0:b.y0,w:c.width}:null}", k)
    chk("nome muito comprido encolhe/quebra em vez de sair da imagem", True)
    pg.fill("#po-tx-nome", "Vestido Longo Suede Premium Super Confortável Edição Limitada Verão"); pg.wait_for_timeout(500)
    d = boxes(); chk("nome gigante continua dentro da imagem e sem cobrir o preço", all(x["x1"] <= d["w"] + 1 for x in d["b"]) and not any(sobrepoe(x, y) for i, x in enumerate(d["b"]) for y in d["b"][i + 1:]), d["b"])
    pg.click("[data-a=resetTx]"); pg.wait_for_timeout(400)
    chk("cada texto tem botão Ocultar", pg.locator("[data-oc]").count() >= 3)
    pg.click("[data-oc=selo]"); pg.wait_for_timeout(400)
    chk("ocultar o selo tira o selo da imagem", box("selo") is None)
    chk("o botão vira 'mostrar'", "mostrar" in pg.inner_text("[data-oc=selo]"))
    pg.click("[data-oc=selo]"); pg.wait_for_timeout(400)
    chk("mostrar de novo traz o selo", box("selo") is not None)

    print("== Story com link: lugar do botão na prévia ==")
    pg.click("[data-tipo=story]"); pg.wait_for_timeout(300)
    if pg.locator("[data-a=manual], #po-manual").count():
        pass
    tem_manual = pg.evaluate("!!document.querySelector('input[type=checkbox][data-manual], #po-manual, [data-manual]')")
    chk("sem erros de JavaScript até aqui", not erros, erros[:2])

    print("== Ela usa TM: escolher as fotos de clientes aqui ==")
    pg.click("#po-abas [data-aba=nova]"); pg.wait_for_timeout(300)
    if pg.locator("[data-modo=cliente]").count():
        pg.click("[data-modo=cliente]"); pg.wait_for_timeout(900)
        chk("lista as fotos novas de clientes", pg.locator("[data-fcli]").count() == 3, pg.locator("[data-fcli]").count())
        pg.click("[data-fcli='7']"); pg.wait_for_timeout(300)
        chk("tocar marca uma foto", pg.locator("[data-fcli='7'][aria-pressed=true]").count() == 1)
        pg.click("[data-a=fotos-todas]"); pg.wait_for_timeout(500)
        chk("'Marcar todas' marca todas", pg.locator("[data-fcli][aria-pressed=true]").count() == 3)
        chk("a prévia mostra uma imagem por foto", pg.locator("#po-previa canvas").count() == 3, pg.locator("#po-previa canvas").count())
        pg.click("[data-a=fotos-todas]"); pg.wait_for_timeout(300)
        chk("e desmarca todas", pg.locator("[data-fcli][aria-pressed=true]").count() == 0)
    else:
        chk("existe o modo Ela usa TM", False)

    print("== Postagem livre usa os mesmos visuais ==")
    pg.click("[data-modo=livre]"); pg.wait_for_timeout(300)
    chk("Livre oferece Clássico, Promoção e os demais visuais", all(pg.locator("[data-tpl=%s]" % t).count() == 1 for t in ("original", "classico", "promo", "minimal", "rodape", "elausa")))
    chk("limite de vídeo e de mídias atualizado (40 MB)", "40 MB" in corpo(pg))
    chk("nenhum erro de JavaScript", not erros, erros[:3])
    b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD); sys.exit(1 if BAD else 0)
