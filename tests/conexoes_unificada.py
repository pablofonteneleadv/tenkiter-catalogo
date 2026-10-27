"""Conexões unificada: um só lugar para chaves e dados de gestão (Instagram, Wafly, Meta/Google, serviços, cofre). Serviços simulados."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_CONEXOES_POLL_MS=250;")
    log = []; st = install(ctx, log=log, versao="4.3")
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    if pg.locator("#details-ferramentas[open]").count() == 0: pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    chk("não existe mais o botão separado de Integrações", pg.locator("#btn-abrir-integracoes").count() == 0)
    pg.click("#btn-abrir-conexoes"); pg.wait_for_timeout(1500)
    nomes = [t.strip() for t in pg.locator("#cx-corpo .cx-grupo > summary").all_inner_texts()]
    chk("grupos organizados: site, Android, Instagram, WhatsApp, Meta/Google, serviços, cofre", len(nomes) == 7 and any("Android" in n for n in nomes) and any("Instagram" in n for n in nomes) and any("WhatsApp" in n for n in nomes) and any("Meta" in n for n in nomes), nomes)
    chk("só o primeiro grupo vem aberto (tela curta no celular)", pg.locator("#cx-corpo .cx-grupo[open]").count() == 1, pg.locator("#cx-corpo .cx-grupo[open]").count())
    chk("não há rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    pg.screenshot(path=os.path.join(AQUI, "saida", "conexoes_unificada_mobile.png"))
    pg.click("#cx-g-meta > summary"); pg.wait_for_timeout(500)
    chk("Pixel e API de Conversões dentro de Conexões", pg.locator("#int-pixel").is_visible() and pg.get_attribute("#int-token", "type") == "password")
    pg.click("#cx-g-instagram > summary"); pg.wait_for_timeout(500)
    chk("Instagram e IA dentro de Conexões", pg.locator("#cx-ig-token").is_visible() and pg.locator("#cx-ia-chave").is_visible())
    pg.click("#cx-fechar"); pg.wait_for_timeout(400)
    pg.evaluate("window.TKConexoes.abrir('whatsapp')"); pg.wait_for_timeout(900)
    chk("abrir('whatsapp') abre direto no grupo do WhatsApp", pg.locator("#cx-g-whatsapp[open]").count() == 1)
    chk("sem erros JavaScript", not erros, erros)
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
