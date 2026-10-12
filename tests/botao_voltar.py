"""Botão voltar do celular: fecha SÓ a janela de cima e a pessoa continua no site; só sem janela aberta é que sai. (admin, catálogo, foto grande)"""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def novo(b, pagina, seletor):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); st = install(ctx, ia=False, versao="4.3")
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: "Access is denied" in str(e) or erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto("about:blank"); pg.goto(BASE + pagina); pg.wait_for_selector(seletor); pg.wait_for_timeout(1200)
    return ctx, pg, st, erros
def volta(pg): pg.go_back(); pg.wait_for_timeout(450)
def aqui(pg, nome): return nome in pg.url
with sync_playwright() as p:
    b = p.chromium.launch()
    print("== Admin: foto grande ==")
    ctx, pg, st, er = novo(b, "admin.html", "#lista-produtos .produto")
    pg.locator(".foto-ampliar").first.scroll_into_view_if_needed(); pg.locator(".foto-ampliar").first.click(); pg.wait_for_selector("#tkfg.aberto")
    volta(pg)
    chk("voltar fecha a foto e fica no admin", pg.locator("#tkfg.aberto").count() == 0 and aqui(pg, "admin.html"), pg.url)
    pg.locator(".foto-ampliar").first.click(); pg.wait_for_selector("#tkfg.aberto"); pg.click("#tkfg-fechar"); pg.wait_for_timeout(400)
    chk("botão Fechar também fecha (e consome a entrada)", pg.locator("#tkfg.aberto").count() == 0 and aqui(pg, "admin.html"))
    pg.keyboard.press("Escape")
    pg.locator(".foto-ampliar").first.click(); pg.wait_for_selector("#tkfg.aberto"); pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    chk("Esc fecha só a foto", pg.locator("#tkfg.aberto").count() == 0 and aqui(pg, "admin.html"))
    volta(pg)
    chk("sem janela aberta, voltar sai do admin (como sempre)", not aqui(pg, "admin.html"), pg.url)
    chk("sem erro de JavaScript", not er, er); ctx.close()

    print("== Admin: janela por cima de janela ==")
    ctx, pg, st, er = novo(b, "admin.html", "#lista-produtos .produto")
    pg.evaluate("abrirComHistorico_('overlay-categorias')"); pg.wait_for_timeout(200)
    pg.evaluate("TKFotoGrande.abrir({itens:[{url:'icon-256.png'}]})"); pg.wait_for_selector("#tkfg.aberto")
    volta(pg)
    chk("1º voltar fecha só a foto; a janela de baixo continua", pg.locator("#tkfg.aberto").count() == 0 and pg.locator("#overlay-categorias.aberto").count() == 1)
    volta(pg)
    chk("2º voltar fecha a janela e continua no admin", pg.locator("#overlay-categorias.aberto").count() == 0 and aqui(pg, "admin.html"))
    volta(pg); chk("3º voltar sai", not aqui(pg, "admin.html")); ctx.close()

    print("== Admin: login não reaparece com resposta atrasada ==")
    ctx, pg, st, er = novo(b, "admin.html", "#lista-produtos .produto")
    pg.evaluate("tratarRespostaAcesso({ok:false, exigeLogin:true, erro:'x'})"); pg.wait_for_timeout(1500)
    chk("logado: resposta 'exigeLogin' solta NÃO abre o login", pg.locator("#login-overlay.visivel").count() == 0)
    ctx.close()

    print("== Catálogo ==")
    ctx, pg, st, er = novo(b, "index.html", ".card")
    pg.locator(".card").first.click(); pg.wait_for_selector("#overlay.aberto")
    pg.evaluate("TKFotoGrande.abrir({itens:[{url:'icon-256.png'}]})"); pg.wait_for_selector("#tkfg.aberto")
    volta(pg)
    chk("foto fecha, peça continua", pg.locator("#tkfg.aberto").count() == 0 and pg.locator("#overlay.aberto").count() == 1)
    volta(pg)
    chk("peça fecha, fica no catálogo", pg.locator("#overlay.aberto").count() == 0 and aqui(pg, "index.html"))
    volta(pg); chk("sem janela, sai", not aqui(pg, "index.html"), pg.url); ctx.close()
    ctx, pg, st, er = novo(b, "index.html", ".card")
    pg.click("#btn-conta") if pg.locator("#btn-conta").count() else None
    if pg.locator("#modal-conta.visivel").count():
        volta(pg); chk("Minha conta: voltar fecha a janela e fica no catálogo", pg.locator("#modal-conta.visivel").count() == 0 and aqui(pg, "index.html"))
    chk("sem erro de JavaScript", not er, er); ctx.close(); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
