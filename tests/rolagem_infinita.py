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
    chk("nenhum erro de JavaScript", not erros, erros)
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
