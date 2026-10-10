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
    b=p.chromium.launch(args=["--no-sandbox"]); ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); install(ctx); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto(BASE+"index.html"); pg.wait_for_timeout(1600)
    def q(t):
        pg.fill("#busca",t); pg.wait_for_timeout(450); return pg.locator(".card:not(.esqueleto)").count(), pg.inner_text("#contagem")
    total,_=q("")
    n,_=q("vestido"); chk("'vestido' acha",0<n<total,n)
    n2,_=q("VESTIDO"); chk("maiúsculas iguais",n2==n,(n,n2))
    n3,_=q("vestidos"); chk("plural 'vestidos' acha o mesmo",n3==n,(n,n3))
    n4,_=q("vestdo"); chk("erro de digitação 'vestdo' acha",n4==n,(n,n4))
    n5,_=q("calca"); n6,_=q("calça"); chk("'calca' (sem acento) = 'calça'",n5==n6 and n5>0,(n5,n6))
    n7,_=q("floral saia"); chk("2 termos, qualquer ordem",n7>0,n7)
    n8,_=q("preto"); chk("busca por cor",n8>0,n8)
    n9,_=q("tk-0007"); chk("busca por código",n9==1,n9)
    n10,_=q("zzzzz"); chk("sem resultado mostra mensagem útil",n10==0 and "Não achamos" in pg.inner_text("#vazio"),pg.inner_text("#vazio"))
    # filtro escondido + busca
    q("")
    if not pg.evaluate("document.getElementById('filtros').classList.contains('aberto')"): pg.click("#btn-filtros-toggle")
    pg.wait_for_timeout(300)
    pg.locator("#details-categoria > summary").click(); pg.wait_for_timeout(200)
    pg.locator("#chips-categoria .chip",has_text="Calça").first.click(); pg.wait_for_timeout(400)
    nf=pg.locator(".card:not(.esqueleto)").count(); chk("filtro Calça reduz a lista",0<nf<total,nf)
    pg.keyboard.press("Escape")
    n11,c11=q("biquini"); chk("busca fora do filtro ativo não fica vazia (mostra toda a loja + aviso)",n11>0 and "toda a loja" in c11,(n11,c11))
    print("erros:",errs); b.close()
print("OK=%d FALHAS=%d"%(len(OK),len(BAD)),BAD)
