import sys, json
import os
AQUI=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,AQUI)
os.makedirs(os.path.join(AQUI,'saida'),exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
AXE=open(os.path.join(AQUI,'axe.min.js')).read()
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
res={}
def axe(pg,label):
    pg.evaluate(AXE)
    r=pg.evaluate("async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});return r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,help:v.help,ex:v.nodes.slice(0,3).map(n=>n.target.join(' ')+' :: '+(n.failureSummary||'').split('\\n')[1])}))}")
    res[label]=r; print(("  ✘ " if r else "  ✔ ")+label+("  "+", ".join("%s×%d"%(v['id'],v['n']) for v in r) if r else ""))
CV=[{"ID":"c%d"%i,"Nome":"Maria Silva %d"%i,"WhatsApp":"8899900000%d"%i,"Etapa":["Enviado","Perfil","Instagram"][i%3],"Status":["Novo","Entrevista","Novo"][i%3],"Vaga":"Vendedora","Email":"m%d@x.com"%i,"Instagram":"@maria%d"%i,"Idade":"2%d"%i,"EnviadoEm":"2026-10-0%d"%(i+1),"Historico":"[]"} for i in range(1,5)]
def cv_route(ctx):
    def hd(route):
        r=route.request
        if "script.google.com" in r.url and r.method=="POST":
            b=json.loads(r.post_data or "{}")
            if b.get("action")=="curriculos_listar": return route.fulfill(json={"ok":True,"curriculos":CV,"status":["Novo","Entrevista","Contratar","Desistiu"],"motivos":["Sem perfil"]})
        route.fallback()
    ctx.route("**/*",hd)
def tentar(pg,sel,txt=None,t=1500):
    try:
        l=pg.locator(sel) if not txt else pg.locator(sel,has_text=txt)
        l.first.click(timeout=t); pg.wait_for_timeout(500); return True
    except Exception as e: print("   (não achei",sel,txt,")"); return False
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    # ---- catálogo: sacola, favoritos, conta, filtros abertos, modal com galeria
    ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); install(ctx); pg=ctx.new_page()
    pg.goto(BASE+"index.html"); pg.wait_for_timeout(1500)
    pg.click(".card >> nth=1"); pg.wait_for_timeout(500)
    tentar(pg,"#btn-sacola-modal"); tentar(pg,"#btn-favorito-modal"); pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.goto(BASE+"index.html"); pg.wait_for_timeout(1200)
    tentar(pg,"#btn-filtros-toggle"); axe(pg,"catálogo: filtros abertos")
    for sel in ["#btn-sacola-header","#btn-sacola","button[aria-label*=acola]","#btn-conta-header","#btn-conta"]:
        if pg.locator(sel).count(): 
            pg.locator(sel).first.click(); pg.wait_for_timeout(500); axe(pg,"catálogo: "+sel); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    ctx.close()
    # ---- admin com sessão: ferramentas, stories
    ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); ctx.add_init_script(SESSION); install(ctx); pg=ctx.new_page()
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(1500)
    tentar(pg,"#details-ferramentas > summary"); axe(pg,"gestão: ferramentas abertas")
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(1500)
    if tentar(pg,".btn-arte"): axe(pg,"gestão: Stories (arte)"); pg.keyboard.press("Escape")
    ctx.close()
    # gestão sem sessão (login)
    ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); install(ctx); pg=ctx.new_page()
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(1500); axe(pg,"gestão: tela de entrar")
    ctx.close()
    # ---- treinamentos: cadastro, manual, quiz, perfil, abas RH, dark
    for esquema in ["light","dark"]:
        ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,color_scheme=esquema); install(ctx); pg=ctx.new_page()
        pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1500)
        if tentar(pg,"#link-cadastro"): axe(pg,"treinamentos %s: cadastro"%esquema)
        ctx.close()
        ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,color_scheme=esquema); ctx.add_init_script(SESSION); install(ctx); pg=ctx.new_page()
        pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1500); axe(pg,"treinamentos %s: início"%esquema)
        if pg.locator(".card").count():
            pg.locator(".card").first.click(); pg.wait_for_timeout(700); axe(pg,"treinamentos %s: manual aberto"%esquema)
        pg.goto(BASE+"treinamentos.html?painel=rh"); pg.wait_for_timeout(1500)
        for i,t in enumerate(pg.locator(".admin-tab").all()):
            try: t.click(); pg.wait_for_timeout(600); axe(pg,"RH %s: aba %d (%s)"%(esquema,i,(t.inner_text() or '')[:18].strip()))
            except Exception as e: print("aba",i,e)
        ctx.close()
    # ---- currículos com dados + abrir um
    ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); ctx.add_init_script(SESSION); install(ctx); cv_route(ctx); pg=ctx.new_page()
    pg.goto(BASE+"curriculos.html"); pg.wait_for_timeout(1800); axe(pg,"currículos: lista com dados")
    pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)"); pg.wait_for_timeout(300); axe(pg,"currículos: cartões abertos")
    ctx.close()
    # ---- candidatura pública, passos
    ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); install(ctx); pg=ctx.new_page()
    pg.goto(BASE+"curriculo.html"); pg.wait_for_timeout(1500); axe(pg,"candidatura: passo 1")
    ctx.close(); b.close()
json.dump(res,open(os.path.join(AQUI,'saida','axe_b.json'),'w'),ensure_ascii=False,indent=1)
print("\nTOTAL com problema:",sum(1 for v in res.values() if v),"de",len(res))
