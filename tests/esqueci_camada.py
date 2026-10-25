"""Minha conta -> Esqueci a senha: a janela de recuperação abre NA FRENTE da conta."""
import sys, os
AQUI=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,AQUI)
import mock
from playwright.sync_api import sync_playwright
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"]); c=b.new_context(viewport={"width":390,"height":844}); mock.install(c)
    pg=c.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto(BASE+"index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(1200)
    pg.click("#menu-lateral-abrir, #btn-menu-header"); pg.wait_for_timeout(400)
    pg.click('#menu-lateral .ml-item:has-text("Minha conta")'); pg.wait_for_selector("#conta-esqueci",timeout=5000)
    pg.click("#conta-esqueci"); pg.wait_for_selector("#tkc-recuperar.aberto"); pg.wait_for_timeout(300)
    r=pg.evaluate("()=>{const b=document.querySelector('#tkc-recuperar .tkc-box').getBoundingClientRect();const e=document.elementFromPoint(b.left+b.width/2,b.top+30);return !!e.closest('#tkc-recuperar')}")
    print("recuperação na frente:", r, "erros:", errs)
    b.close(); sys.exit(0 if r and not errs else 1)
