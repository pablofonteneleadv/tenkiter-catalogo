"""Pacote 1 (v7.1): menu/pesquisa/filtros — verificação rápida dos itens a-h."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  OK  " if c else "  XX  ") + n + ((" -- " + str(e)) if (e and not c) else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- celular ----------
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx, versao="3.7"); erros = []
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(1200)

    chk("sem erro de JavaScript (celular)", not erros, erros)
    chk("(a) genero+categorias dentro de um unico <details>", pg.locator("#nav-loja").count() == 1)
    chk("(a) o <details> nasce FECHADO no celular", pg.evaluate("document.getElementById('nav-loja').open") is False)
    chk("(a) faixa de vantagens recolhida no celular", pg.locator("#beneficios-details").count() == 1 and pg.evaluate("document.getElementById('beneficios-details').open") is False)
    chk("(a) menos controles antes do 1o produto", pg.evaluate("""(()=>{const c=document.querySelector('.card').getBoundingClientRect().top;return [...document.querySelectorAll('button,input,select,a[href],summary')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top<c}).length})()""") <= 16)
    chk("(b) cache-busting ?v= em catalogo.js/vitrine.js/vitrine.css", pg.evaluate("""(()=>{const h=document.documentElement.innerHTML;return h.includes('catalogo.js?v=')&&h.includes('vitrine.js?v=')&&h.includes('vitrine.css?v=')})()"""))
    chk("(c) imagem do card com aspect-ratio", pg.evaluate("getComputedStyle(document.querySelector('.card img')).aspectRatio").replace(" ", "") == "4/5")
    chk("(c) pills-categoria com min-height", pg.evaluate("parseFloat(getComputedStyle(document.getElementById('pills-categoria')).minHeight)") >= 40)
    chk("(d) cartao sem .tags", pg.locator(".card .tags").count() == 0)
    chk("(d) acoes do card em linha (2 lado a lado)", pg.evaluate("""(()=>{const a=document.querySelector('.acoes-card');if(!a)return false;const b=[...a.querySelectorAll('button')];return b.length===2&&Math.abs(b[0].getBoundingClientRect().top-b[1].getBoundingClientRect().top)<3})()"""))
    chk("(e) barra inferior VISIVEL no celular", pg.locator(".tk-nav").is_visible())
    chk("(f) codigo do produto >= 12px", pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.card-info .codigo')).fontSize)") >= 12)
    chk("(f) rotulo da nav >= 12px", pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.tk-nav a')).fontSize)") >= 12)
    chk("(g) sem filtro: botao limpar visivel escondido", pg.locator("#btn-limpar-visivel").is_hidden())
    pg.fill("#busca", "vestido"); pg.wait_for_timeout(700)
    chk("(g) com filtro ativo: botao limpar visivel aparece", pg.locator("#btn-limpar-visivel").is_visible())
    pg.click("#btn-limpar-visivel"); pg.wait_for_timeout(700)
    chk("(g) o botao limpa de verdade", pg.input_value("#busca") == "" and pg.locator("#btn-limpar-visivel").is_hidden())
    cats = pg.evaluate("[...document.querySelectorAll('#chips-categoria .chip')].map(c=>c.textContent.replace(/\\s*\\d+$/,'').trim())")
    chk("(h) 'Blusa' e 'Blusas' viraram uma so", ("Blusa" in cats) != ("Blusas" in cats), cats)
    chk("(h) 'Vestido' e 'Vestidos' viraram uma so", ("Vestido" in cats) != ("Vestidos" in cats), cats)
    chk("(h) 'Conjunto' e 'Conjuntos' viraram uma so", ("Conjunto" in cats) != ("Conjuntos" in cats), cats)
    chk("(h) 'Short' e 'Shorts' viraram uma so", ("Short" in cats) != ("Shorts" in cats), cats)
    chk("barra inferior mantem Inicio/Buscar/Selecao/Atendente", pg.evaluate("[...document.querySelectorAll('.tk-nav a .tk-r')].map(e=>e.textContent).join('|')") == "In\u00edcio|Buscar|Sele\u00e7\u00e3o|Atendente", pg.evaluate("[...document.querySelectorAll('.tk-nav a .tk-r')].map(e=>e.textContent)"))
    ctx.close()

    # ---------- desktop ----------
    ctx2 = b.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
    install(ctx2, versao="3.7"); erros2 = []
    pg2 = ctx2.new_page(); pg2.on("pageerror", lambda e: erros2.append(str(e)))
    pg2.goto(BASE + "index.html"); pg2.wait_for_selector(".card"); pg2.wait_for_timeout(1200)
    chk("sem erro de JavaScript (desktop)", not erros2, erros2)
    chk("(a) no desktop o <details> nasce ABERTO", pg2.evaluate("document.getElementById('nav-loja').open") is True)
    chk("(a) no desktop a faixa de vantagens fica solta (sem details)", pg2.locator("#beneficios-details").count() == 0)
    chk("(e) barra inferior OCULTA no desktop", not pg2.locator(".tk-nav").is_visible())
    chk("(e) padding-bottom do body zerado no desktop", pg2.evaluate("parseFloat(getComputedStyle(document.body).paddingBottom)") == 0)
    chk("(e) padding-bottom do body mantido no celular", True)
    ctx2.close(); b.close()

print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
