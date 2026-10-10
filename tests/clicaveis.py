import sys, json
import os
AQUI=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,AQUI)
os.makedirs(os.path.join(AQUI,'saida'),exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
JS="""(function(){
 const out=[];
 const all=document.querySelectorAll('body *');
 for(const el of all){
   const ls=getEventListeners(el);
   if(!ls||!(ls.click||ls.mousedown||ls.pointerdown||ls.touchstart)) continue;
   const t=el.tagName;
   if(['BUTTON','A','INPUT','SELECT','TEXTAREA','SUMMARY','LABEL','OPTION'].includes(t)) continue;
   if(el.getAttribute('role')==='button'||el.getAttribute('role')==='link'||el.getAttribute('role')==='tab') continue;
   if(el.tabIndex>=0) continue;
   const r=el.getBoundingClientRect(); if(!r.width||!r.height) continue;
   // se um ancestral/descendente é interativo e focável, considera coberto
   if(el.querySelector('button,a[href],input,select,textarea,summary,[tabindex="0"]')) {out.push('(contém controle) '+t+'.'+(el.id||el.className).toString().slice(0,40)); continue;}
   out.push(t+'.'+(el.id||el.className).toString().slice(0,50)+' "'+(el.innerText||el.alt||'').trim().slice(0,25)+'"');
 }
 return out;})()"""
def rel(pg,cdp,rotulo):
    r=cdp.send("Runtime.evaluate",{"expression":JS,"includeCommandLineAPI":True,"returnByValue":True})
    v=r.get("result",{}).get("value",[])
    print("\n[%s] %d elementos clicáveis sem teclado:"%(rotulo,len(v)))
    for x in sorted(set(v)): print("   -",x)
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    def novo(sess=False):
        ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
        if sess: ctx.add_init_script(SESSION)
        install(ctx); pg=ctx.new_page(); return ctx,pg,ctx.new_cdp_session(pg)
    ctx,pg,c=novo(); pg.goto(BASE+"index.html"); pg.wait_for_timeout(1500); rel(pg,c,"catálogo")
    pg.locator(".card").nth(1).click(); pg.wait_for_timeout(600); rel(pg,c,"catálogo: produto aberto"); ctx.close()
    ctx,pg,c=novo(True); pg.goto(BASE+"admin.html"); pg.wait_for_timeout(1500); rel(pg,c,"gestão: lista")
    pg.click("#card-form > summary"); pg.wait_for_timeout(300); rel(pg,c,"gestão: cadastro"); ctx.close()
    ctx,pg,c=novo(True); pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1500); rel(pg,c,"treinamentos: início")
    pg.locator(".card").first.click(); pg.wait_for_timeout(600); rel(pg,c,"treinamentos: manual"); 
    pg.goto(BASE+"treinamentos.html?painel=rh"); pg.wait_for_timeout(1500)
    for i,t in enumerate(pg.locator(".admin-tab").all()):
        t.click(); pg.wait_for_timeout(500); rel(pg,c,"RH aba %d"%i)
    ctx.close()
    ctx,pg,c=novo(True); pg.goto(BASE+"curriculos.html"); pg.wait_for_timeout(1500); rel(pg,c,"currículos"); ctx.close()
    ctx,pg,c=novo(); pg.goto(BASE+"curriculo.html"); pg.wait_for_timeout(1500); rel(pg,c,"candidatura"); ctx.close()
    b.close()
