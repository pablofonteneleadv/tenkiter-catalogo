"""Juntar produtos repetidos na lista do admin (v3.7). Apps Script simulado (mock.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def sessao(b, versao):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); log = []; st = install(ctx, log=log, ia=False, versao=versao)
    erros = []; msgs = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: (msgs.append(d.message), d.accept()))
    pg.goto(BASE + "admin.html"); pg.wait_for_selector("#lista-produtos .produto"); pg.wait_for_timeout(1200)
    return ctx, pg, st, msgs, erros
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, st, msgs, er = sessao(b, "3.6")
    pg.locator(".produto-chk").nth(0).check(); pg.locator(".produto-chk").nth(1).check(); pg.wait_for_timeout(300)
    chk("backend antigo: sem botão Juntar", pg.locator("#btn-bulk-juntar:visible").count() == 0); ctx.close()
    ctx, pg, st, msgs, er = sessao(b, "3.7")
    pg.locator(".produto-chk").nth(0).check(); pg.wait_for_timeout(200)
    chk("com 1 marcado: sem Juntar", pg.locator("#btn-bulk-juntar:visible").count() == 0)
    pg.locator(".produto-chk").nth(1).check(); pg.locator(".produto-chk").nth(2).check(); pg.wait_for_timeout(300)
    chk("com 3 marcados: aparece Juntar", pg.locator("#btn-bulk-juntar:visible").count() == 1)
    pg.click("#btn-bulk-juntar"); pg.wait_for_selector("#overlay-juntar.aberto")
    chk("janela lista as 3 peças, a 1ª já escolhida", pg.locator("#juntar-lista input[type=radio]").count() == 3 and pg.locator("#juntar-lista input:checked").count() == 1)
    pg.locator("#juntar-lista input").nth(1).check(); dest = pg.locator("#juntar-lista input:checked").get_attribute("value")
    pg.click("#juntar-ok"); pg.wait_for_timeout(1200)
    c = [x for x in st["x_chamadas"] if x["action"] == "juntarProdutos"]
    chk("chamou juntarProdutos com o destino escolhido e os 2 outros, com sessão", len(c) == 1 and str(c[0]["destinoId"]) == dest and len(c[0]["origemIds"]) == 2 and dest not in map(str, c[0]["origemIds"]) and str(c[0].get("sessao", "")).startswith("tk"), c)
    chk("confirmou antes e avisou o resultado", any("Juntar 2 produtos" in m for m in msgs) and any("Pronto" in m for m in msgs), msgs)
    chk("janela fechou e a seleção foi limpa", pg.locator("#overlay-juntar.aberto").count() == 0 and pg.locator("#bulk-bar.ativa").count() == 0)
    chk("sem erro de JavaScript", not er, er); ctx.close(); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
