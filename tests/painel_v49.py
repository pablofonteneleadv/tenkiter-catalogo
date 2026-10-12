"""Painel v4.9: Ferramentas do gestor logo abaixo do 'O que fazer agora', Postagens como item fixo, miniatura da lista amplia a foto."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); install(ctx, perms=PERMS_ALL, versao="4.3")
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2800)
    ordem = pg.evaluate("(()=>{const a=document.getElementById('atalhos-hoje'),f=document.getElementById('details-ferramentas'),l=document.getElementById('lista-produtos');return [!!(a.compareDocumentPosition(f)&4), !!(f.compareDocumentPosition(l)&4), a.nextElementSibling===f]})()")
    chk("Ferramentas do gestor ficam logo abaixo de 'O que fazer agora' e acima da lista", ordem == [True, True, True], ordem)
    chk("Postagens é item fixo do 'O que fazer agora'", pg.locator("#atalho-postagens").is_visible() and "Postagens" in pg.inner_text("#atalho-postagens"))
    pg.click("#atalho-postagens"); pg.wait_for_timeout(900)
    chk("o atalho abre a janela de Postagens", pg.locator("#overlay-postagens.aberto").count() == 1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.locator(".foto-ampliar").first.scroll_into_view_if_needed(); pg.locator(".foto-ampliar").first.click(); pg.wait_for_timeout(500)
    chk("tocar na miniatura da peça abre a foto grande", pg.locator("#tkfg-palco img").count() == 1 and pg.locator("#tkfg-palco img").get_attribute("src").startswith("http"))
    chk("a foto grande não é a miniatura reduzida", "=w200" not in (pg.locator("#tkfg-palco img").get_attribute("src") or ""))
    chk("sem erros de JavaScript", not erros, erros[:3])
    b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD); sys.exit(1 if BAD else 0)
