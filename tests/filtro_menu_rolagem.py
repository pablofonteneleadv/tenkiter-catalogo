"""P-36: rolar dentro do menu de filtros (muitas opções) não pode fechar o menu."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
BAD = []
def chk(n, c, e=""):
    if not c: BAD.append(n)
    print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx, perms=["portal"], versao="3.7"); ctx.add_init_script("localStorage.removeItem('tm_session');")
    pg = ctx.new_page(); pg.goto(BASE + "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(1200)
    pg.evaluate("window.scrollTo(0, 600)"); pg.wait_for_timeout(500)
    pg.click("#btn-filtros-toggle"); pg.wait_for_timeout(300)
    chk("menu abriu", pg.evaluate("document.getElementById('filtros').classList.contains('aberto')"))
    pg.evaluate("document.getElementById('details-categoria').open = true")
    pg.touchscreen.tap(200, 300); pg.wait_for_timeout(100)
    pg.evaluate("window.scrollTo(0, 1200)"); pg.wait_for_timeout(600)
    chk("rolou e o menu continua aberto", pg.evaluate("document.getElementById('filtros').classList.contains('aberto')"))
    b.close()
print("FALHAS:", BAD); sys.exit(1 if BAD else 0)
