"""v7.23: menu Cadastrar com "Cadastrar UM produto" (até 8 fotos e 3 vídeos no mesmo produto) e "Cadastrar vários produtos"
(cada foto vira um produto com os mesmos dados), com o desenho fotos → produtos. Serviços simulados (mock.py)."""
import sys, os, base64
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
EVID = os.environ.get("TK_EVID", "")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
def abre(b, w, h, mob):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob, service_workers="block")
    ctx.add_init_script(SESSION); st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2800)
    if not pg.locator("#card-menu-cadastro").evaluate("e => e.open"): pg.click("#card-menu-cadastro > summary")
    pg.wait_for_timeout(200)
    return ctx, pg, erros
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for w, h, mob in ((390, 844, True), (320, 700, True), (1280, 860, False)):
        print("== %dx%d ==" % (w, h))
        ctx, pg, erros = abre(b, w, h, mob)
        um = pg.locator("#menu-cad-nova"); varios = pg.locator("#menu-cad-varias")
        if w == 390:
            chk("cartão 1: 'Cadastrar UM produto' com 'até 8 fotos e 3 vídeos, tudo no mesmo produto'", "Cadastrar UM produto" in um.inner_text() and "Até 8 fotos e 3 vídeos, tudo no mesmo produto" in um.inner_text(), um.inner_text())
            chk("cartão 2: 'Cadastrar vários produtos' explica que cada foto vira um produto com o mesmo título, valor, tamanho e cor", "Cadastrar vários produtos" in varios.inner_text() and "Cada foto vira um produto, com o mesmo título, valor, tamanho e cor" in varios.inner_text(), varios.inner_text())
            chk("desenho: 3 fotos → 1 produto no primeiro e 3 fotos → 3 produtos no segundo", um.locator(".mc-prods i").count() == 1 and varios.locator(".mc-prods i").count() == 3 and um.locator(".mc-fotos i").count() == 3)
            chk("o desenho fica fora do leitor de tela (o texto já explica)", um.locator(".mc-eq").get_attribute("aria-hidden") == "true")
            pg.evaluate(AXE)
            r = pg.evaluate("async()=>{const r=await axe.run(document.getElementById('card-menu-cadastro'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+'×'+v.nodes.length)}")
            chk("axe sem falhas graves no menu Cadastrar", not r, r)
        med = pg.evaluate("""(()=>{const a=document.getElementById('menu-cad-nova').getBoundingClientRect(),b=document.getElementById('menu-cad-varias').getBoundingClientRect();
          return {h:[Math.round(a.height),Math.round(b.height)], scroll:document.documentElement.scrollWidth>document.documentElement.clientWidth,
          dentro:[...document.querySelectorAll('#card-menu-cadastro .menu-cad-item *')].every(e=>{const r=e.getBoundingClientRect();return r.right<=a.right+1})}})()""")
        chk("%d px: cartões compactos (até %d px), com toque de 44 px+ e nada vazando" % (w, 96 if w >= 390 else 120), all(44 <= x <= (96 if w >= 390 else 120) for x in med["h"]) and med["dentro"] and not med["scroll"], med)
        if EVID: pg.locator("#card-menu-cadastro").screenshot(path=os.path.join(EVID, "menu-%d.png" % w))
        if w == 390:
            varios.click(); pg.wait_for_timeout(600)
            chk("modo vários: título 'Cadastrar vários produtos' e botão 'Cadastrar os produtos'", pg.locator("#titulo-form").inner_text() == "Cadastrar vários produtos" and pg.locator("#btn-salvar").inner_text() == "Cadastrar os produtos")
            chk("modo vários: passo 1 diz 'Fotos · uma por produto' e explica embaixo", pg.locator("#passo-fotos-nome").inner_text() == "Fotos · uma por produto" and pg.locator("#passo-fotos-varias").is_visible())
            pg.set_input_files("#galeria-input", [{"name": "a%d.png" % i, "mimeType": "image/png", "buffer": PNG} for i in range(3)]); pg.wait_for_timeout(1200)
            chk("modo vários: 3 fotos = '(3 produtos)'", pg.locator("#galeria-contador").inner_text() == "(3 produtos)", pg.locator("#galeria-contador").inner_text())
            chk("modo vários: sem '★ CAPA' nem a dica 'A primeira foto é a capa' (cada foto é um produto)", pg.locator("#galeria-grid .selo-capa").count() == 0 and not pg.locator("#galeria-box .dica-midia-expansivel").is_visible())
            if EVID: pg.locator("[data-passo=fotos]").screenshot(path=os.path.join(EVID, "varios-passo1-390.png"))
            if not pg.locator("#card-menu-cadastro").evaluate("e => e.open"): pg.click("#card-menu-cadastro > summary")
            pg.click("#menu-cad-nova"); pg.wait_for_timeout(600)
            chk("voltar para UM produto: passo 1 'Fotos da peça (0 de 8)' sem a explicação do lote", pg.locator("#galeria-box .dica-midia-expansivel").is_visible() and pg.locator("#passo-fotos-nome").inner_text() == "Fotos da peça" and not pg.locator("#passo-fotos-varias").is_visible() and pg.locator("#galeria-contador").inner_text() == "(0 de 8)", pg.locator("#galeria-contador").inner_text())
        chk("sem erros de JavaScript", not erros, erros)
        ctx.close()
    b.close()
print("\n%d ok, %d falhas" % (len(OK), len(BAD)))
if BAD: print("\n".join(BAD)); sys.exit(1)
