"""v7.20: aviso de versão nova (nav.js). Com a página aberta, se /version.json muda de commit, aparece a faixa
"Saiu uma versão nova do site · Atualizar"; sem mudança, nada aparece; nunca recarrega sozinho."""
import sys, os, json
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for pagina in ["admin.html", "index.html"]:
        ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
        ctx.add_init_script(SESSION); install(ctx, perms=PERMS_ALL, versao="4.28")
        estado = {"commit": "aaa111"}
        ctx.route("**/version.json*", lambda r: r.fulfill(json={"versao": "7.20.0", "commit": estado["commit"]}))
        pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(BASE + pagina); pg.wait_for_timeout(3000)
        pg.evaluate("tkConferirVersao_()"); pg.wait_for_timeout(400)
        chk(pagina + ": sem publicação nova, nenhum aviso", pg.locator("#tk-versao-nova").count() == 0)
        estado["commit"] = "bbb222"
        url0 = pg.url
        pg.evaluate("tkConferirVersao_()"); pg.wait_for_timeout(600)
        chk(pagina + ": publicação nova mostra a faixa com Atualizar", pg.locator("#tk-versao-nova").count() == 1 and "Atualizar" in pg.inner_text("#tk-versao-nova"))
        chk(pagina + ": não recarrega sozinho", pg.url == url0 and pg.evaluate("performance.getEntriesByType('navigation').length") == 1)
        h = pg.evaluate("Math.round(document.querySelector('#tk-versao-nova button').getBoundingClientRect().height)")
        chk(pagina + ": botões com 44 px", h >= 44, h)
        pg.click("#tk-versao-nova [aria-label='Fechar o aviso']"); pg.wait_for_timeout(200)
        chk(pagina + ": ✕ fecha o aviso", pg.locator("#tk-versao-nova").count() == 0)
        chk(pagina + ": sem erro de JavaScript", not erros, erros)
        ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
