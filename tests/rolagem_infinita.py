"""Rolagem infinita + faixa flutuante de filtros no catálogo (pedido do Pablo, 13/10/2026)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx, versao="3.3")
    erros = []
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    # simula catálogo grande: duplica os produtos do mock
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(1800)
    pg.evaluate("""()=>{const base=produtos.slice(); let n=0; while(produtos.length<80){base.forEach(p=>{if(produtos.length<80){n++;produtos.push(Object.assign({},p,{ID:'X'+n,Codigo:'TK-9'+n}));}})}
      aplicarFiltros();}""")
    pg.wait_for_timeout(500)
    n0 = pg.locator(".card:not(.esqueleto)").count()
    chk("começa com no máximo 24 peças", 0 < n0 <= 24, n0)
    pg.mouse.wheel(0, 20000); pg.wait_for_timeout(1200)
    pg.mouse.wheel(0, 20000); pg.wait_for_timeout(1200)
    n1 = pg.locator(".card:not(.esqueleto)").count()
    chk("rolando, carrega mais sozinho (sem tocar no botão)", n1 > n0, (n0, n1))
    chk("faixa flutuante some sem filtro", pg.locator("#barra-filtros-flut").is_hidden())
    pg.evaluate("document.getElementById('busca').value='a'; aplicarFiltros()"); pg.wait_for_timeout(400)
    chk("com busca ativa a faixa flutuante aparece com a contagem", pg.locator("#barra-filtros-flut").is_visible() and "peça" in pg.inner_text("#barra-filtros-txt"))
    pg.click("#barra-filtros-limpar"); pg.wait_for_timeout(500)
    chk("Limpar da faixa zera a busca e esconde a faixa", pg.input_value("#busca") == "" and pg.locator("#barra-filtros-flut").is_hidden())
    pg.on("dialog", lambda d: d.accept())
    pg.evaluate("window.scrollTo(0,0)")
    for i in (0, 1): pg.locator(".card:not(.esqueleto) .ac-sacola").nth(i).click(); pg.wait_for_timeout(150)
    chk("2 peças na seleção aparecem marcadas", pg.locator(".ac-sacola[aria-pressed=true]").count() == 2)
    pg.click("#btn-sacola-header"); pg.wait_for_timeout(400); pg.click("#btn-limpar-sacola"); pg.wait_for_timeout(500)
    chk("esvaziar a seleção desmarca TODOS os cartões do catálogo", pg.locator(".ac-sacola[aria-pressed=true]").count() == 0)
    pg2 = ctx.new_page(); pg2.on("pageerror", lambda e: erros.append(str(e)))
    pg2.goto(BASE + "index.html?q=a"); pg2.wait_for_timeout(1800)
    pg2.locator(".ac-sacola").first.click(); pg2.wait_for_timeout(300)
    chk("link de seleção: só um botão 'Ver os outros produtos do site'", pg2.locator("#barra-filtros-flut.so-botao").is_visible() and "Ver os outros produtos do site" in pg2.inner_text("#barra-filtros-limpar") and pg2.locator("#barra-filtros-txt").is_hidden())
    chk("com seleção ativa aparece 'Compartilhar seleção' abaixo da busca", pg2.locator("#linha-share-busca").is_visible())
    pg2.click("#barra-filtros-limpar"); pg2.wait_for_timeout(600)
    chk("o botão mostra o site inteiro e esconde a faixa", pg2.input_value("#busca") == "" and pg2.locator("#barra-filtros-flut").is_hidden())
    chk("sem filtro, com 1 peça marcada em Selecionar, o Compartilhar continua (com a contagem)", pg2.locator("#linha-share-busca").is_visible() and "(1)" in pg2.inner_text("#btn-share-busca"))
    pg2.click("#btn-share-busca"); pg2.wait_for_timeout(500)
    lk = pg2.input_value("#sel-link") if pg2.locator("#sel-link").count() else ""
    chk("e o link leva SÓ a peça marcada (?sel=…)", "?sel=" in lk and lk.count(",") == 0, lk)
    chk("a seleção que a pessoa fez continua (badge da sacola)", pg2.locator("#badge-sacola").inner_text() == "1")
    chk("nenhum erro de JavaScript", not erros, erros)
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
