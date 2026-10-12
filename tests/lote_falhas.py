"""Ação em lote: quando alguma peça NÃO é alterada, o painel diz quais e deixa só elas marcadas."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
D = []
def dlg(d):
    D.append((d.type, d.message)); d.accept("5") if d.type == "prompt" else d.accept()
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION)
    log = []; st = install(ctx, log=log)
    pg = ctx.new_page(); pg.on("dialog", dlg)
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    chks = pg.locator("#lista-produtos .produto-chk")
    chks.nth(0).check(); chks.nth(1).check(); pg.wait_for_timeout(200)
    ids = pg.evaluate("Array.from(selecionadosBulk).map(String)")
    chk("2 peças marcadas", len(ids) == 2, ids)
    st["lote_faltar"] = [ids[0]]
    pg.click("#btn-bulk-arquivar"); pg.wait_for_timeout(1500)
    msgs = [m for t, m in D if t == "alert"]
    chk("aviso diz 1 de 2 e que NÃO foi alterada", any("1 de 2" in m and "NÃO foram alteradas" in m for m in msgs), msgs)
    rest = pg.evaluate("Array.from(selecionadosBulk).map(String)")
    chk("só a que falhou continua marcada", rest == [ids[0]], rest)
    print(f"OK={len(OK)} FALHAS={len(BAD)}"); sys.exit(1 if BAD else 0)
