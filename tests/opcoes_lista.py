"""v4.18: tamanhos e cores/estampas vêm do servidor e o Admin total que cria opção nova a deixa valendo para todos.
    python3 tests/opcoes_lista.py"""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, x=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + (" — " + str(x) if x and not c else ""))
def abrir(b, versao, perms=PERMS_ALL):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); log = []; st = install(ctx, perms=perms, log=log, versao=versao)
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(1500)
    pg.evaluate("document.getElementById('card-form').open=true"); pg.wait_for_timeout(500)
    return ctx, pg, log, st, erros
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, log, st, er = abrir(b, "4.18")
    st["opcoes"]["cores"].append("Farm")
    pg.reload(); pg.wait_for_timeout(1500); pg.evaluate("document.getElementById('card-form').open=true"); pg.wait_for_timeout(500)
    chks = pg.eval_on_selector_all("#chips-cores .chip", "e=>e.map(x=>x.dataset.v)")
    chk("chips de cor vêm do servidor (inclui Farm criada antes)", "Farm" in chks, chks)
    chk("campo de texto de cores escondido", not pg.is_visible("#cores"))
    chk("campo de texto de tamanhos escondido", not pg.is_visible("#tamanhos"))
    pg.click("#chips-cores .chip[data-v='Farm']"); pg.wait_for_timeout(100)
    chk("clicar no chip marca e grava no campo", pg.input_value("#cores") == "Farm", pg.input_value("#cores"))
    pg.click("#btn-abrir-cores"); pg.wait_for_timeout(300)
    pg.click("#btn-criar-cor"); pg.wait_for_timeout(200)
    pg.fill("#input-nova-cor", "Xadrez"); pg.click("#btn-confirmar-nova-cor"); pg.wait_for_timeout(700)
    chk("addCor foi ao servidor", any(x[0] == "addCor" and x[1] == "Xadrez" for x in st["opcoes_add"]), st["opcoes_add"])
    chk("opção nova virou chip", "Xadrez" in pg.eval_on_selector_all("#chips-cores .chip", "e=>e.map(x=>x.dataset.v)"))
    pg.reload(); pg.wait_for_timeout(1500)
    chk("depois de recarregar a cor continua (vem do servidor)", "Xadrez" in pg.evaluate("localStorage.getItem('tenkiter_admin_opcoes_v1')||''"))
    chk("sem erro de JS", not er, er)
    ctx.close()
    ctx, pg, log, st, er = abrir(b, "4.17")
    chk("backend antigo: segue com a lista de fábrica", pg.locator("#chips-cores .chip").count() >= 5)
    chk("backend antigo: nada de erro de JS", not er, er)
    ctx.close(); b.close()
print(f"\n{len(OK)} ok, {len(BAD)} falhas"); sys.exit(1 if BAD else 0)
