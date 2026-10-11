# Plaquinha flutuante de convite para instalar o app (só no site em celular, nunca no app instalado)
import sys, os
AQUI=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,AQUI)
from mock import *
from playwright.sync_api import sync_playwright
OK=[];BAD=[]
def chk(n,c,e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ")+n+((" — "+str(e)) if (e and not c) else ""))
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
UA_AND="Mozilla/5.0 (Linux; Android 14; 23078PNDDG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
UA_IPH="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
UA_PC="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
def abrir(b,ua,mobile=True,url="",standalone=False):
    ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=mobile,has_touch=mobile,user_agent=ua,service_workers="block")
    install(ctx)
    ctx.add_init_script("window.TK_CONVITE_ATRASO_MS=200;"+("window.matchMedia=(q)=>({matches:/standalone/.test(q),addEventListener(){},removeEventListener(){}});" if standalone else ""))
    pg=ctx.new_page(); pg.goto(BASE+"index.html"+url); pg.wait_for_timeout(1500); return ctx,pg
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    ctx,pg=abrir(b,UA_AND)
    chk("Android no navegador: aparece a plaquinha",pg.locator("#tk-convite-app").count()==1)
    chk("tem instalar-agora-não-nunca",pg.locator("#tk-convite-app button").count()==3)
    pg.click("#tk-convite-app .tkcv-s"); pg.wait_for_timeout(200)
    chk("'Agora não' fecha",pg.locator("#tk-convite-app").count()==0)
    pg.reload(); pg.wait_for_timeout(1500)
    chk("recarregar logo depois não volta a aparecer (espera 3 dias)",pg.locator("#tk-convite-app").count()==0)
    ctx.close()
    ctx,pg=abrir(b,UA_AND)
    pg.click("#tk-convite-app .tkcv-n"); pg.reload(); pg.wait_for_timeout(1500)
    chk("'Não mostrar mais' = nunca mais",pg.locator("#tk-convite-app").count()==0)
    ctx.close()
    ctx,pg=abrir(b,UA_AND,url="?origem=app")
    chk("aberto pelo ícone do app (origem=app): não convida",pg.locator("#tk-convite-app").count()==0)
    ctx.close()
    ctx,pg=abrir(b,UA_AND,standalone=True)
    chk("modo app (standalone): não convida",pg.locator("#tk-convite-app").count()==0)
    ctx.close()
    ctx,pg=abrir(b,UA_PC,mobile=False)
    chk("computador: não incomoda",pg.locator("#tk-convite-app").count()==0)
    ctx.close()
    ctx,pg=abrir(b,UA_IPH)
    chk("iPhone no Safari: aparece com 'Como instalar'",pg.locator("#tk-convite-app").count()==1 and "Como instalar" in pg.inner_text("#tk-convite-app"))
    ctx.close()
    # Android com o evento do Chrome: botão instala dentro do toque
    ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,user_agent=UA_AND,service_workers="block"); install(ctx)
    ctx.add_init_script("window.TK_CONVITE_ATRASO_MS=1500; window.__p=0; addEventListener('DOMContentLoaded',()=>{setTimeout(()=>{const e=new Event('beforeinstallprompt');e.prompt=()=>{window.__p++};e.userChoice=Promise.resolve({outcome:'dismissed'});dispatchEvent(e)},300)});")
    pg=ctx.new_page(); pg.goto(BASE+"index.html"); pg.wait_for_timeout(2500)
    chk("com o evento do Chrome o botão diz 'Instalar o app'","Instalar o app" in pg.inner_text("#tk-convite-app"),pg.inner_text("#tk-convite-app") if pg.locator("#tk-convite-app").count() else "sem plaquinha")
    pg.click("#tk-convite-app .tkcv-p"); pg.wait_for_timeout(300)
    chk("tocar abre a janela de instalação do navegador (prompt)",pg.evaluate("window.__p")==1)
    chk("e a plaquinha some",pg.locator("#tk-convite-app").count()==0)
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d"%(len(OK),len(BAD)),BAD)
sys.exit(1 if BAD else 0)
