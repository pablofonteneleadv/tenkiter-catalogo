import sys
import os
AQUI=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,AQUI)
os.makedirs(os.path.join(AQUI,'saida'),exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
OK=[];BAD=[]
def chk(n,c,e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ")+n+((" — "+str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":1000,"height":800}); install(ctx); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto(BASE+"index.html"); pg.wait_for_timeout(1500)
    print("== Catálogo (teclado) ==")
    card=pg.locator(".card .abrir-peca").first
    card.focus(); pg.keyboard.press("Enter"); pg.wait_for_timeout(700)
    chk("Enter no cartão abre o produto",pg.locator("#overlay.aberto").count()==1)
    foco=pg.evaluate("document.activeElement && (document.activeElement.id||document.activeElement.className)")
    chk("foco foi para dentro da janela",pg.evaluate("document.querySelector('#overlay').contains(document.activeElement)"),foco)
    # Tab 40x: nunca sai da janela
    saiu=False
    for i in range(40):
        pg.keyboard.press("Tab")
        if not pg.evaluate("document.querySelector('#overlay').contains(document.activeElement)"): saiu=True;break
    chk("Tab não escapa da janela (40 toques)",not saiu)
    saiu=False
    for i in range(40):
        pg.keyboard.press("Shift+Tab")
        if not pg.evaluate("document.querySelector('#overlay').contains(document.activeElement)"): saiu=True;break
    chk("Shift+Tab não escapa da janela",not saiu)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    chk("Esc fecha o produto",pg.locator("#overlay.aberto").count()==0)
    chk("URL voltou sem ?id",("id=" not in pg.url),pg.url)
    chk("foco voltou ao cartão",pg.evaluate("!!document.activeElement.closest(\".card\")"),pg.evaluate("document.activeElement.tagName+'.'+document.activeElement.className"))
    # sacola
    pg.locator(".card:not(:has(.selo-card.esgotado))").nth(2).click(); pg.wait_for_timeout(500)
    pg.click("#btn-sacola-modal"); pg.wait_for_timeout(300); pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    for sel in ["#btn-sacola-header","button[aria-label*=acola]","#btn-sacola"]:
        if pg.locator(sel).count(): pg.locator(sel).first.click(); break
    pg.wait_for_timeout(500)
    chk("sacola abre",pg.locator("#overlay-sacola.aberto").count()==1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    chk("Esc fecha a sacola",pg.locator("#overlay-sacola.aberto").count()==0)
    print("erros JS:",errs)
    ctx.close()
    print("== Gestão (teclado) ==")
    ctx=b.new_context(viewport={"width":1000,"height":800}); ctx.add_init_script(SESSION); install(ctx); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(1500)
    pg.click("#card-form > summary"); pg.wait_for_timeout(300)
    pg.click("#btn-abrir-categorias"); pg.wait_for_timeout(500)
    chk("folha de categorias abre",pg.locator("#overlay-categorias.aberto").count()==1)
    chk("foco dentro da folha",pg.evaluate("document.querySelector('#overlay-categorias').contains(document.activeElement)"))
    saiu=False
    for i in range(30):
        pg.keyboard.press("Tab")
        if not pg.evaluate("document.querySelector('#overlay-categorias').contains(document.activeElement)"): saiu=True;break
    chk("Tab preso na folha",not saiu)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    chk("Esc fecha a folha",pg.locator("#overlay-categorias.aberto").count()==0)
    chk("foco voltou ao botão de categoria",pg.evaluate("document.activeElement.id")=="btn-abrir-categorias",pg.evaluate("document.activeElement.id"))
    print("erros JS:",errs); ctx.close()
    print("== Rótulos ==")
    ctx=b.new_context(viewport={"width":390,"height":800}); install(ctx); pg=ctx.new_page()
    pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1500)
    chk("campo Senha tem rótulo",pg.evaluate("document.getElementById('login-pass').labels.length")==1)
    chk("campo WhatsApp tem rótulo",pg.evaluate("document.getElementById('login-whats').labels.length")==1)
    pg.click("#link-cadastro"); pg.wait_for_timeout(400)
    n=pg.evaluate("[...document.querySelectorAll('#app input:not([type=hidden]),#app select,#app textarea')].filter(e=>!e.labels.length&&!e.getAttribute('aria-label')).map(e=>e.id)")
    chk("cadastro: todos os campos com rótulo",not n,n)
    ctx.close()
    ctx=b.new_context(viewport={"width":390,"height":800}); install(ctx); pg=ctx.new_page()
    pg.goto(BASE+"curriculo.html"); pg.wait_for_timeout(1500)
    n=pg.evaluate("[...document.querySelectorAll('#app input:not([type=hidden]):not([type=radio]):not([type=checkbox]),#app select,#app textarea')].filter(e=>!e.labels.length&&!e.getAttribute('aria-label')).map(e=>e.id||e.name)")
    chk("candidatura passo 1: campos com rótulo",not n,n)
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d"%(len(OK),len(BAD)),BAD)
