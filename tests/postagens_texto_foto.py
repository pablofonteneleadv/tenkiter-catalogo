"""v4.27: com "Fazer em todos" DESMARCADO, editar o texto (e tamanho/largura/ocultar) vale só para a foto selecionada; marcado, vale para todas.
Ao tocar em outra foto o painel mostra os valores DELA. Apps Script/internet SIMULADOS."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
BAD = []
def chk(n, c, e=""):
    if not c: BAD.append(n)
    print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
GAL = ",".join("https://res.cloudinary.com/z/image/upload/v1/g%d.jpg" % i for i in (1, 2))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"
    for _p in st["produtos"]: _p["Fotos_Galeria"] = GAL
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(1400)
    for i in range(3):
        if pg.locator(".po-m[aria-pressed=true]").count() < 3 and pg.locator(".po-m").nth(i).get_attribute("aria-pressed") != "true":
            pg.locator(".po-m").nth(i).click(); pg.wait_for_timeout(200)
    pg.wait_for_timeout(1500)
    chk("3 fotos = 3 prévias", pg.locator("#po-previa canvas").count() == 3)
    pg.evaluate("document.getElementById('po-det').open=true"); pg.wait_for_timeout(200)
    K = pg.locator("[data-seltx]").first.get_attribute("data-seltx")
    pg.locator("[data-seltx]").first.click(); pg.wait_for_timeout(200)
    def larguras():
        return pg.evaluate("(k)=>[...document.querySelectorAll('#po-previa canvas')].map(c=>{const b=(c._boxes||[]).find(x=>x.k===k);return b?Math.round(b.x1-b.x0):-1})", K)
    def tem(i): return larguras()[i] > 0
    pad = larguras()
    chk("no começo as 3 fotos têm o mesmo texto", len(set(pad)) == 1 and pad[0] > 0, pad)
    chk("'Fazer em todos' desmarcado", not pg.locator("[data-a=todos]").is_checked())
    chk("a 1ª foto já aparece como selecionada (borda)", pg.evaluate("document.querySelectorAll('#po-previa canvas')[0].classList.contains('ativa')"))
    pg.fill("#po-tx-%s" % K, "TEXTO MUITO MAIS LONGO AQUI"); pg.wait_for_timeout(500)
    l = larguras()
    chk("desmarcado: só a foto selecionada mudou", l[0] != pad[0] and l[1] == pad[1] and l[2] == pad[2], l)
    # toca na 2ª foto: o painel passa a mostrar o texto DELA
    pg.locator("#po-previa canvas").nth(1).scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    bx = pg.locator("#po-previa canvas").nth(1).bounding_box()
    pg.mouse.click(bx["x"] + 6, bx["y"] + 6); pg.wait_for_timeout(500)
    chk("tocar na 2ª foto a seleciona", pg.evaluate("document.querySelectorAll('#po-previa canvas')[1].classList.contains('ativa')"))
    v2 = pg.input_value("#po-tx-%s" % K)
    chk("o painel mostra o texto da 2ª (o original), não o da 1ª", "MUITO MAIS LONGO" not in v2 and v2 != "", v2)
    pg.fill("#po-tx-%s" % K, "OUTRO"); pg.wait_for_timeout(500)
    l = larguras()
    chk("editar a 2ª não mexe na 1ª nem na 3ª", l[1] != pad[1] and l[0] != l[1] and l[2] == pad[2], l)
    # Ocultar só nesta
    pg.locator("[data-oc=%s]" % K).click(); pg.wait_for_timeout(500)
    pg.evaluate("document.getElementById('po-det').open=true")
    l = larguras()
    chk("Ocultar vale só na foto selecionada", l[1] == -1 and l[0] > 0 and l[2] > 0, l)
    pg.locator("[data-oc=%s]" % K).click(); pg.wait_for_timeout(400)
    # volta para a 1ª: o painel mostra o texto longo
    pg.locator("#po-previa canvas").nth(0).scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    bx = pg.locator("#po-previa canvas").nth(0).bounding_box()
    pg.mouse.click(bx["x"] + 6, bx["y"] + 6); pg.wait_for_timeout(500)
    chk("voltando à 1ª, o painel mostra o texto dela", pg.input_value("#po-tx-%s" % K) == "TEXTO MUITO MAIS LONGO AQUI", pg.input_value("#po-tx-%s" % K))
    # marcado: vale para todas
    pg.locator("[data-a=todos]").check(); pg.wait_for_timeout(150)
    pg.fill("#po-tx-%s" % K, "PARA TODAS"); pg.wait_for_timeout(500)
    l = larguras()
    chk("'Fazer em todos' marcado: as 3 ficam iguais", len(set(l)) == 1 and l[0] > 0, l)
    # voltar ao padrão
    pg.locator("[data-a=resetTx]").click(); pg.wait_for_timeout(600)
    pg.evaluate("document.getElementById('po-det').open=true")
    l = larguras()
    chk("'Voltar textos ao padrão' limpa o que era de cada foto", l == pad, l)
    chk("sem erro de página", not erros, erros[:2])
    b.close()
print("FALHAS=%d" % len(BAD))
for x in BAD: print("  ✘", x)
sys.exit(1 if BAD else 0)
