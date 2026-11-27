"""App 2.6 (fase 2) — Gestão aberta a partir de uma conversa no app ("Na Gestão" na lista de produtos das Mensagens):
a edição mostra "Mandar este produto para <cliente>", que devolve o produto à conversa pela ponte do app (simulada).
Fora do app, ou sem conversa de origem, o botão não existe. Apps Script e internet SIMULADOS (tests/mock.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
ALVO = prods()[2]
PONTE = """window.__mandou = [];
window.TKAndroid = { origemConversa: function () { return %s; }, mandarProduto: function (id) { window.__mandou.push(String(id)); }, versao: function () { return '2.6.0'; } };"""

def abrir(b, origem, larg=390, alt=844):
    ctx = b.new_context(viewport={"width": larg, "height": alt}, is_mobile=larg < 600, has_touch=larg < 600, service_workers="block")
    ctx.add_init_script(SESSION)
    if origem is not None: ctx.add_init_script(PONTE % origem)
    ctx.route("**/android/latest.json*", lambda r: r.fulfill(status=200, content_type="application/json", body='{"versionName":"2.6.0"}'))
    install(ctx, versao="4.20")
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html?editar=" + ALVO["ID"])
    pg.wait_for_function("(document.getElementById('titulo-form')||{}).textContent.indexOf('Editando')===0", timeout=15000)
    return ctx, pg, erros

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    print("== Gestão aberta da conversa com a Rose ==")
    for larg, alt in ((390, 844), (1440, 900)):
        ctx, pg, erros = abrir(b, "JSON.stringify({conversa: 42, nome: 'Rose confecções'})", larg, alt)
        bt = pg.locator("#btn-mandar-conversa")
        chk(f"{larg}: botão 'Mandar este produto para Rose confecções' acima do formulário", bt.is_visible() and "Mandar este produto para Rose confecções" in bt.inner_text(), bt.count() and bt.inner_text())
        chk(f"{larg}: botão com toque de pelo menos 44 px", (bt.bounding_box() or {}).get("height", 0) >= 44, bt.bounding_box())
        bt.click(); pg.wait_for_timeout(200)
        chk(f"{larg}: tocar devolve o ID do produto ao app", pg.evaluate("window.__mandou") == [ALVO["ID"]], pg.evaluate("window.__mandou"))
        os.makedirs(os.path.join(AQUI, "saida"), exist_ok=True); pg.screenshot(path=os.path.join(AQUI, "saida", f"app_voltar_conversa_{larg}.png"))
        chk(f"{larg}: sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        chk(f"{larg}: sem erro de JavaScript", not erros, erros)
        ctx.close()
    print("== Sem conversa de origem / fora do app ==")
    ctx, pg, erros = abrir(b, "''")
    chk("app sem conversa de origem: sem o botão", pg.locator("#btn-mandar-conversa:visible").count() == 0)
    ctx.close()
    ctx, pg, erros = abrir(b, None)
    chk("navegador comum: sem o botão", pg.locator("#btn-mandar-conversa").count() == 0)
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close()
    b.close()
print(f"\nOK={len(OK)} FALHAS={len(BAD)} {BAD}")
sys.exit(1 if BAD else 0)
