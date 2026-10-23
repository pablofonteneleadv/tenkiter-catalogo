"""Navegação unificada: URLs reais, telas mantidas vivas, voltar/avançar e estado por aba."""
import os, sys, re
from playwright.sync_api import sync_playwright, expect

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from mock import SESSION, install, PERMS_ALL

BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK, BAD = [], []
def chk(nome, cond, detalhe=""):
    (OK if cond else BAD).append(nome)
    print(("  ✔ " if cond else "  ✘ ") + nome + ((" — " + str(detalhe)) if detalhe and not cond else ""))

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION)
    ctx.add_init_script("localStorage.setItem('tm_nav_perms',JSON.stringify({w:'88999999999',p:" + str(PERMS_ALL).replace("'", '"') + ",t:Date.now()}));")
    install(ctx, perms=PERMS_ALL)
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "index.html")
    pg.wait_for_selector(".tk-nav")
    pg.evaluate("window.__catalogoVivo={valor:17}; window.scrollTo(0,500)")
    scroll0 = pg.evaluate("scrollY")

    pg.click('[data-nav="gestao"]')
    expect(pg).to_have_url(re.compile(r"/admin\.html$"))
    expect(pg.locator('.tk-app-frame:not([hidden])')).to_have_count(1)
    fr_admin = pg.frame(url=lambda u: "admin.html" in u and "embed=1" in u)
    fr_admin.wait_for_load_state("domcontentloaded")
    fr_admin.evaluate("window.__gestaoViva={valor:23}")
    chk("Gestão troca sem recarregar o documento principal", pg.evaluate("window.__catalogoVivo.valor") == 17)
    chk("URL individual da Gestão é preservada", pg.url.endswith("/admin.html"), pg.url)
    chk("página embutida não cria uma segunda barra", fr_admin.locator(".tk-nav").count() == 0)

    pg.click('[data-nav="treinamentos"]')
    expect(pg).to_have_url(re.compile(r"/treinamentos\.html$"))
    fr_treino = pg.frame(url=lambda u: "treinamentos.html" in u and "embed=1" in u and "painel=rh" not in u)
    fr_treino.wait_for_load_state("domcontentloaded")
    chk("cada área é carregada uma vez e fica guardada", pg.locator(".tk-app-frame").count() == 2)

    pg.evaluate("history.back()")
    expect(pg).to_have_url(re.compile(r"/admin\.html$"))
    chk("Voltar do Android/navegador retorna à aba anterior", pg.url.endswith("/admin.html"))
    chk("estado em memória da Gestão foi preservado", fr_admin.evaluate("window.__gestaoViva.valor") == 23)

    pg.evaluate("history.back()")
    expect(pg).to_have_url(re.compile(r"/index\.html$"))
    pg.evaluate("history.forward()")
    expect(pg).to_have_url(re.compile(r"/admin\.html$"))
    chk("Avançar restaura a mesma Gestão", fr_admin.evaluate("window.__gestaoViva.valor") == 23)

    pg.click('[data-nav="catalogo"]')
    expect(pg).to_have_url(re.compile(r"/index\.html$"))
    expect(pg.locator('.tk-app-views')).to_be_hidden()
    pg.wait_for_timeout(100)
    chk("Catálogo original volta sem nova carga", pg.evaluate("window.__catalogoVivo.valor") == 17)
    chk("posição do Catálogo é restaurada", abs(pg.evaluate("scrollY") - scroll0) < 5, (scroll0, pg.evaluate("scrollY")))

    chk("sem erros JavaScript no shell", not erros, erros)

    direto = ctx.new_page()
    direto.goto(BASE + "admin.html")
    direto.wait_for_selector('.tk-nav')
    direto.evaluate("window.__entradaDireta=31")
    direto.click('[data-nav="rh"]')
    expect(direto).to_have_url(re.compile(r"/treinamentos\.html\?painel=rh$"))
    fr_rh = direto.frame(url=lambda u: "painel=rh" in u and "embed=1" in u)
    fr_rh.wait_for_load_state("domcontentloaded")
    chk("link direto de RH continua compartilhável", direto.url.endswith("/treinamentos.html?painel=rh"), direto.url)
    direto.click('[data-nav="gestao"]')
    expect(direto).to_have_url(re.compile(r"/admin\.html$"))
    chk("entrada direta em qualquer área também permanece viva", direto.evaluate("window.__entradaDireta") == 31)
    b.close()

print("OK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD)
sys.exit(1 if BAD else 0)
