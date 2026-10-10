import sys, json, re
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
opened=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"]); ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    install(ctx)   # visitante: sem sessão
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.add_init_script("window.open=(u)=>{window.__opened=(window.__opened||[]).concat([String(u)]);return null}")
    pg.on("dialog",lambda d:d.accept())
    print("== Jornada do cliente (visitante) ==")
    pg.goto(BASE+"index.html"); pg.wait_for_timeout(1600)
    n0=pg.locator(".card:not(.esqueleto)").count(); chk("catálogo mostra peças",n0>=10,n0)
    chk("não mostra arquivadas",pg.locator(".card").count()<=22,pg.locator(".card").count())
    pg.fill("#busca","vestido"); pg.wait_for_timeout(500); n1=pg.locator(".card").count(); chk("busca por 'vestido' filtra",0<n1<n0,(n0,n1))
    pg.fill("#busca","TK-0007"); pg.wait_for_timeout(500); chk("busca por código acha a peça",pg.locator(".card").count()==1)
    pg.fill("#busca","vestdo"); pg.wait_for_timeout(500); print("   (busca com erro de digitação 'vestdo' →",pg.locator(".card").count(),"resultado(s))")
    pg.fill("#busca",""); pg.press("#busca","Enter"); pg.wait_for_timeout(500)
    pg.locator(".card").first.click(); pg.wait_for_timeout(700)
    chk("abre o produto (modal)",pg.locator("#foto-principal-modal").count()==1)
    chk("URL ganhou ?c=código",re.search(r"[?&]c=TK-",pg.url) is not None,pg.url)
    btn=pg.locator("button:has-text('WhatsApp'), a:has-text('WhatsApp')").first
    chk("botão de WhatsApp existe",btn.count()>0)
    if btn.count():
        btn.click(); pg.wait_for_timeout(500)
        op=pg.evaluate("window.__opened||[]"); print("   abriu:",[o[:160] for o in op])
        chk("mensagem do WhatsApp usa link /p/<código> do site",any("%2Fp%2FTK-" in o or "/p/TK-" in o for o in op),op)
    print("erros JS:",errs)
    # alvos de toque pequenos
    small=pg.evaluate("""()=>[...document.querySelectorAll('button,a,[role=button],input,select')].filter(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&(r.width<32||r.height<32)}).map(e=>(e.id||e.className||e.tagName)+' '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height)).slice(0,12)""")
    print("alvos de toque < 32px (modal aberto):",small)
    b.close()
print("\nOK=%d FALHAS=%d"%(len(OK),len(BAD)),BAD)
