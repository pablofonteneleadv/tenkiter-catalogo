"""v6.7: opções dos menus somem/voltam ao vivo conforme os OUTROS filtros marcados (só peças ativas)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
BAD = []
def chk(n, c, e=""):
    if not c: BAD.append(n)
    print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
JS_VIS = "(id)=>[...document.querySelectorAll('#'+id+' .chip')].filter(c=>!c.hidden).map(c=>c.dataset.filterValue||c.textContent)"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx, perms=["portal"], versao="3.7"); ctx.add_init_script("localStorage.removeItem('tm_session');")
    pg = ctx.new_page(); pg.goto(BASE + "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(1200)
    todas = pg.evaluate(JS_VIS, "chips-categoria")
    gen = pg.evaluate("(()=>{const m={};produtos.filter(p=>!estaEsgotado(p)).forEach(p=>listaDeTags(p.Genero).forEach(g=>{m[g]=1}));return Object.keys(m)})()")
    # acha um gênero que reduz as categorias
    alvo = None
    for g in gen:
        exp = set(pg.evaluate("(g)=>{const s=new Set();produtos.filter(p=>!estaEsgotado(p)&&listaDeTags(p.Genero).includes(g)).forEach(p=>listaDeTags(p.Categoria).forEach(c=>s.add(c)));return [...s]}", g))
        if len(exp) < len(todas): alvo, esperado = g, exp; break
    chk("dados de teste têm um gênero que reduz as categorias", alvo is not None, (gen, todas))
    if alvo:
        pg.evaluate("(g)=>{[...document.querySelectorAll('#chips-genero .chip')].find(c=>(c.dataset.filterValue||c.textContent)===g).click()}", alvo); pg.wait_for_timeout(500)
        vis = set(pg.evaluate(JS_VIS, "chips-categoria"))
        chk("com o gênero marcado, categorias = só as possíveis", vis == esperado, (vis, esperado))
        chk("os outros gêneros continuam à vista (para trocar)", len(pg.evaluate(JS_VIS, "chips-genero")) >= 1)
        # marca uma categoria e confere que tamanhos/cores também afunilam
        c0 = sorted(esperado)[0]
        pg.evaluate("(c)=>{[...document.querySelectorAll('#chips-categoria .chip')].find(x=>(x.dataset.filterValue||x.textContent)===c).click()}", c0); pg.wait_for_timeout(500)
        n = pg.evaluate("listaFiltradaAtual.length")
        chk("combinação gênero + categoria tem peças", n > 0, n)
        # tira o gênero: volta tudo
        pg.evaluate("(g)=>{[...document.querySelectorAll('#chips-genero .chip')].find(c=>(c.dataset.filterValue||c.textContent)===g).click()}", alvo); pg.wait_for_timeout(500)
        vis2 = pg.evaluate(JS_VIS, "chips-categoria")
        chk("tirando o gênero, as outras categorias voltam", len(vis2) >= len(vis) and len(vis2) == len(todas), (len(vis2), len(todas)))
    ctx.close(); b.close()
print("FALHAS:", BAD); sys.exit(1 if BAD else 0)
