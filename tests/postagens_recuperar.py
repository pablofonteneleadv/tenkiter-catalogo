"""v6.8: a montagem de Postagens sobrevive a recarregar a página (fotos avulsas voltam a abrir). Apps Script SIMULADO."""
import sys, os, tempfile
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
from PIL import Image
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
PASTA = tempfile.mkdtemp(prefix="tk_rec_") + "/"
Image.new("RGB", (600, 800), (200, 40, 40)).save(PASTA + "a.jpg", "JPEG")
BAD = []
def chk(n, c, e=""):
    if not c: BAD.append(n)
    print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    install(ctx, perms=PERMS_ALL, versao="4.3")
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    def abrir():
        pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
        pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(900)
    abrir()
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(1000)
    pg.click("[data-tipo=carrossel]"); pg.wait_for_timeout(400)
    pg.set_input_files("#po-avulsa-arq", [PASTA + "a.jpg"]); pg.wait_for_timeout(1200)
    n = pg.locator(".po-m").count()
    chk("avulsa entrou", n >= 2, n)
    abrir()
    chk("montagem voltou (mesmo número de mídias)", pg.locator(".po-m").count() == n, pg.locator(".po-m").count())
    ok = pg.evaluate("()=>[...document.querySelectorAll('.po-m img')].every(i=>i.complete&&i.naturalWidth>0)")
    chk("todas as miniaturas abrem (blob renovado)", ok)
    chk("sem erro de página", not erros, erros)
    b.close()
print("FALHAS=%d" % len(BAD)); sys.exit(1 if BAD else 0)
