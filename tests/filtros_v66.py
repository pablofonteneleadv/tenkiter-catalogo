"""v6.6: sem barra escura embaixo, gênero primeiro, só opções com peça ativa, 'adicionar' após qualquer filtro, só o botão laranja embaixo."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
BAD = []
def chk(n, c, e=""):
    if not c: BAD.append(n)
    print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx, perms=["portal"], versao="3.7"); ctx.add_init_script("localStorage.removeItem('tm_session');")
    pg = ctx.new_page(); pg.goto(BASE + "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(1200)
    chk("a barra escura 'Minha seleção' não existe mais", pg.locator("#barra-minha-selecao").count() == 0)
    ordem = pg.evaluate("[...document.querySelectorAll('#filtros-extras details.selecao-expansivel')].map(d=>d.id)")
    chk("Gênero é o primeiro menu", ordem[0] == "details-genero", ordem)
    # só opções de peças ativas
    cats = set(pg.evaluate("[...document.querySelectorAll('#chips-categoria .chip')].map(c=>c.textContent)"))
    ativas = set(pg.evaluate("(()=>{const s=new Set();produtos.filter(p=>!estaEsgotado(p)).forEach(p=>listaDeTags(p.Categoria).forEach(c=>s.add(c)));return [...s]})()"))
    chk("categorias do menu = só as de peças ativas", cats == ativas, (cats ^ ativas))
    # filtro simples já mostra o 'adicionar'
    pg.evaluate("document.querySelector('#chips-categoria .chip').click()"); pg.wait_for_timeout(600)
    chk("após 1 filtro (sem seleção) a linha do topo aparece", pg.locator("#linha-share-busca").is_visible())
    chk("e o botão Adicionar estes N à seleção", pg.locator("#btn-add-resultados-topo").is_visible() and "Adicionar estes" in pg.inner_text("#btn-add-resultados-topo"))
    chk("embaixo só o botão laranja (sem texto)", pg.locator("#barra-filtros-flut").is_visible() and not pg.locator("#barra-filtros-txt").is_visible())
    r = pg.evaluate("(()=>{const f=document.querySelector('#barra-filtros-limpar').getBoundingClientRect(),n=document.querySelector('.tk-nav').getBoundingClientRect();return {fb:f.bottom,nt:n.top,bg:getComputedStyle(document.querySelector('#barra-filtros-limpar')).backgroundColor}})()")
    chk("botão acima da barra de navegação com folga", r["nt"] - r["fb"] >= 8, r)
    chk("botão laranja", r["bg"].replace(" ", "") == "rgb(230,126,34)", r["bg"])
    ctx.close(); b.close()
print("FALHAS:", BAD); sys.exit(1 if BAD else 0)
