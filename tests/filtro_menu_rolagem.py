"""v6.5: no celular o menu de filtros é um painel de tela cheia — rola por dentro, rodapé sempre à vista, não fecha ao rolar, voltar fecha."""
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
    ctx = b.new_context(viewport={"width": 360, "height": 640}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx, perms=["portal"], versao="3.7"); ctx.add_init_script("localStorage.removeItem('tm_session');")
    pg = ctx.new_page(); pg.goto(BASE + "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(1200)
    pg.evaluate("window.scrollTo(0, 600)"); pg.wait_for_timeout(500)
    pg.fill("#busca", "a"); pg.wait_for_timeout(400)
    chk("digitar na busca NÃO abre o painel no celular", not pg.evaluate("document.getElementById('filtros').classList.contains('aberto')"))
    pg.evaluate("document.activeElement.blur()")
    pg.click("#btn-filtros-toggle"); pg.wait_for_timeout(400)
    chk("painel abriu", pg.evaluate("document.getElementById('filtros').classList.contains('aberto')"))
    r = pg.evaluate("(()=>{const e=document.getElementById('filtros-extras').getBoundingClientRect();return [e.top,e.left,e.width,e.height]})()")
    chk("painel cobre a tela toda", r[0] == 0 and r[1] == 0 and r[2] >= 359 and r[3] >= 639, r)
    chk("topo com 'Fechar' à vista", pg.locator("#fx-fechar").is_visible())
    chk("rodapé 'Ver N peças' sempre dentro da tela", pg.evaluate("document.getElementById('fx-ver').getBoundingClientRect().bottom <= innerHeight"))
    pg.evaluate("document.getElementById('details-categoria').open = true"); pg.evaluate("document.getElementById('details-cor').open = true"); pg.evaluate("document.getElementById('details-tamanho').open = true"); pg.wait_for_timeout(200)
    y0 = pg.evaluate("scrollY")
    # v7.x: topo e rodapé ficam fixos e quem rola é o corpo do painel (#fx-corpo); sem ele, o painel inteiro
    ROLA = "(document.querySelector('#filtros-extras .fx-corpo, #fx-corpo')||document.getElementById('filtros-extras'))"
    pg.evaluate(ROLA + ".scrollTop = 99999"); pg.wait_for_timeout(500)
    chk("rola por dentro do painel (chega ao fim)", pg.evaluate("(()=>{const e=" + ROLA + ";return e.scrollTop>0 && e.scrollTop+e.clientHeight>=e.scrollHeight-2})()"))
    chk("a página de trás não rolou", pg.evaluate("scrollY") == y0)
    chk("o painel continua aberto depois de rolar", pg.evaluate("document.getElementById('filtros').classList.contains('aberto')"))
    chk("rodapé continua à vista no fim da rolagem", pg.evaluate("document.getElementById('fx-ver').getBoundingClientRect().bottom <= innerHeight") and pg.locator("#fx-ver").is_visible())
    chk("filtro de Tamanho existe", pg.locator("#details-tamanho").count() == 1)
    pg.evaluate("document.querySelector('#chips-tamanho .chip') && document.querySelector('#chips-tamanho .chip').click()"); pg.wait_for_timeout(300)
    chk("escolher tamanho filtra e conta no botão", pg.evaluate("filtroTamanhos.size") == 1 and "Ver" in pg.inner_text("#fx-ver"))
    pg.go_back(); pg.wait_for_timeout(400)
    chk("botão voltar do celular fecha só o painel", not pg.evaluate("document.getElementById('filtros').classList.contains('aberto')") and "index.html" in pg.url)
    pg.click("#btn-filtros-toggle"); pg.wait_for_timeout(300); pg.click("#fx-ver"); pg.wait_for_timeout(400)
    chk("'Ver N peças' fecha e mostra o resultado", not pg.evaluate("document.getElementById('filtros').classList.contains('aberto')"))
    chk("página volta a rolar depois de fechar", not pg.evaluate("document.documentElement.classList.contains('fx-travado')"))
    b.close()
print("FALHAS:", BAD); sys.exit(1 if BAD else 0)
