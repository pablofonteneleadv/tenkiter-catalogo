"""v7.48.1: categorias, tamanhos, cores e tecidos — só o Admin total (gerir_acessos) cria ou escreve nomes novos.
Funcionária com cadastro (sem gerir_acessos) só escolhe nomes já cadastrados: no cadastro, na janela de tamanhos/cores e na edição em lote.
Apps Script e Worker SIMULADOS.   python3 tests/listas_so_admin.py"""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
from pathlib import Path
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OUT = Path(os.environ.get("TK_OUT", "/tmp/listas-so-admin")); OUT.mkdir(parents=True, exist_ok=True)
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + (" — " + str(e)[:300] if e and not c else ""))

EQUIPE = [x for x in PERMS_ALL if x != "gerir_acessos"]

def abrir(b, perms, w=390, h=844):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, service_workers="block")
    ctx.add_init_script(SESSION); log = []
    install(ctx, perms=perms, log=log, versao="4.20")
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2800)
    return ctx, pg, log, errs

def lote_novo(pg, campo, texto):
    pg.evaluate("document.querySelector('#lista-produtos').scrollIntoView()"); pg.wait_for_timeout(200)
    pg.locator("#lista-produtos input[type=checkbox]").nth(0).check(); pg.locator("#lista-produtos input[type=checkbox]").nth(1).check(); pg.wait_for_timeout(200)
    pg.click("#btn-bulk-editar"); pg.wait_for_selector("#overlay-lote.aberto")
    i = pg.locator(f"#lote-lista-{campo} [data-entrada]"); i.click(); i.type(texto, delay=20); pg.wait_for_timeout(500)
    return pg.locator(f"#lote-lista-{campo}")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for w, h in [(390, 844), (1440, 900)]:
        # ---- funcionária com cadastro, sem Admin total ----
        ctx, pg, log, errs = abrir(b, EQUIPE, w, h)
        chk(f"{w} equipe: a página marca 'sem-gerir'", pg.evaluate("document.body.classList.contains('sem-gerir')"))
        pg.locator("button", has_text="Cadastrar peça").first.click(); pg.wait_for_timeout(600)
        pg.evaluate("document.getElementById('tecido').scrollIntoView({block:'center'})"); pg.wait_for_timeout(300)
        t = pg.locator("#tecido")
        chk(f"{w} equipe: campo Tecido não aceita escrever (só escolher)", t.evaluate("e => e.readOnly") and t.get_attribute("list") is None and pg.evaluate("!document.getElementById('tecido-ajuda').hidden"), [t.evaluate("e => e.readOnly"), t.get_attribute("list")])
        chips = pg.locator("#tecidos-rapidos button")
        if chips.count():
            nome = chips.first.inner_text(); chips.first.click(); pg.wait_for_timeout(150)
            chk(f"{w} equipe: tocar num tecido cadastrado escolhe", pg.input_value("#tecido") == nome, pg.input_value("#tecido"))
            chips.first.click(); pg.wait_for_timeout(150)
            chk(f"{w} equipe: tocar de novo tira o tecido", pg.input_value("#tecido") == "", pg.input_value("#tecido"))
        chk(f"{w} equipe: 'Gerenciar nomes de tecidos' escondido", pg.locator("#tecidos-gerenciar").is_hidden())
        pg.screenshot(path=str(OUT / f"tecido_equipe_{w}.png"))
        chk(f"{w} equipe: botões 'criar tamanho novo' e 'criar cor nova' escondidos", pg.locator("#btn-criar-tamanho").is_hidden() and pg.locator("#btn-criar-cor").is_hidden())
        pg.evaluate("abrirCriacaoEscolha_('tamanhos', 'XXXG')"); pg.wait_for_timeout(200)
        chk(f"{w} equipe: mesmo chamando direto, a criação de tamanho não abre", not pg.evaluate("document.getElementById('nova-tamanho-linha').classList.contains('aberto')"))
        caixa = lote_novo(pg, "tamanhos", "Zz9")
        chk(f"{w} equipe: na edição em lote não aparece 'Criar' para tamanho novo", caixa.locator("[data-cria]").count() == 0 and "Só o Admin total cria nomes novos" in caixa.inner_text(), caixa.inner_text())
        pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
        chk(f"{w} equipe: Enter com nome novo não cria chip", caixa.locator(".lote-chip.novo").count() == 0)
        cat = pg.locator("#lote-lista-categoria [data-entrada]"); cat.click(); cat.type("Zzcat", delay=20); pg.wait_for_timeout(400)
        chk(f"{w} equipe: categoria nova também não", pg.locator("#lote-lista-categoria [data-cria]").count() == 0)
        pg.screenshot(path=str(OUT / f"lote_equipe_{w}.png"))
        chk(f"{w} equipe: nenhuma chamada de criar foi feita", not any(x.get("action") in ("addTamanho", "addCor", "addCategoria") for x in log), [x.get("action") for x in log][-8:])
        chk(f"{w} equipe: sem erro de JavaScript", not errs, errs)
        chk(f"{w} equipe: sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        ctx.close()
        # ---- Admin total ----
        ctx, pg, log, errs = abrir(b, PERMS_ALL, w, h)
        pg.evaluate("document.getElementById('tecido').scrollIntoView({block:'center'})"); pg.wait_for_timeout(300)
        chk(f"{w} admin: campo Tecido aceita escrever e sugere", not pg.locator("#tecido").evaluate("e => e.readOnly") and pg.locator("#tecido").get_attribute("list") == "tecidos-opcoes" and pg.evaluate("document.getElementById('tecido-ajuda').hidden"))
        chk(f"{w} admin: botões de criar tamanho/cor existem para o Admin", pg.locator("#btn-criar-tamanho").count() == 1 and pg.evaluate("getComputedStyle(document.getElementById('btn-criar-tamanho')).display") != "none")
        caixa = lote_novo(pg, "tamanhos", "Zz9")
        chk(f"{w} admin: na edição em lote aparece 'Criar “Zz9”'", caixa.locator("[data-cria]").count() == 1)
        chk(f"{w} admin: sem erro de JavaScript", not errs, errs)
        ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
