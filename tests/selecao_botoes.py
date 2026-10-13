"""Botões da seleção no catálogo: Compartilhar / Limpar seleção / Edição em lote (só equipe)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
BAD = []
def chk(n, c, e=""):
    if not c: BAD.append(n)
    print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def abrir(b, perms, sessao=True):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    st = install(ctx, perms=perms, versao="3.7")
    ctx.add_init_script(SESSION if sessao else "localStorage.removeItem('tm_session');")
    pg = ctx.new_page(); pg.goto(BASE + "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(1200)
    return ctx, pg
with sync_playwright() as p:
    b = p.chromium.launch()
    for nome, perms, sess, lote in (("equipe", PERMS_ALL, True, True), ("cliente", ["portal"], False, False)):
        print("==", nome)
        ctx, pg = abrir(b, perms, sess)
        chk("sem seleção: nenhum dos 3 botões", pg.locator("#linha-share-busca:visible").count() == 0)
        pg.evaluate("salvarSacola([String(produtos[0].ID), String(produtos[1].ID)]); atualizarBarraFiltros_()")
        pg.wait_for_timeout(300)
        chk("Compartilhar e Limpar aparecem", pg.locator("#btn-share-busca:visible").count() == 1 and pg.locator("#btn-limpar-sel:visible").count() == 1)
        chk("Edição em lote só para a equipe", (pg.locator("#btn-lote-menu:visible").count() == 1) == lote)
        chk("botões com fundo próprio e ≥44px", pg.evaluate("(()=>{const r=document.querySelector('#btn-limpar-sel').getBoundingClientRect(); return r.height>=44 && getComputedStyle(document.querySelector('#btn-limpar-sel')).backgroundColor!=='rgba(0, 0, 0, 0)'})()"))
        if lote:
            pg.click("#btn-lote-menu"); chk("lista de ações abre", pg.locator("#lote-menu:visible").count() == 1 and pg.locator("#lote-menu [data-lote]").count() == 6)
        chk("mesma linha (tops iguais)", pg.evaluate("(()=>{const t=[...document.querySelectorAll('#btn-share-busca,#btn-limpar-sel,#btn-lote-menu')].filter(b=>b.offsetParent).map(b=>Math.round(b.getBoundingClientRect().top)); return new Set(t).size===1})()"))
        pg.click("#btn-limpar-sel"); pg.wait_for_timeout(300)
        chk("Limpar esvazia a seleção e some", pg.evaluate("getSacola().length") == 0 and pg.locator("#linha-share-busca:visible").count() == 0)
        ctx.close()
    b.close()
print("FALHAS:", BAD); sys.exit(1 if BAD else 0)
