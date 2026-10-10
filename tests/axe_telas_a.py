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
    r=pg.evaluate("async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}});return r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,help:v.help,ex:v.nodes.slice(0,2).map(n=>n.target.join(' ')+' :: '+(n.failureSummary||'').split('\\n')[1])}))}")
    res[label]=r
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"]); ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    ctx.add_init_script(SESSION); install(ctx)
    pg=ctx.new_page()
    pg.goto(BASE+"index.html"); pg.wait_for_timeout(1500); axe(pg,"catalogo")
    pg.click(".card >> nth=0"); pg.wait_for_timeout(600); axe(pg,"catalogo: produto aberto")
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(1500); axe(pg,"gestao: lista")
    pg.click("#card-form > summary"); pg.wait_for_timeout(300); axe(pg,"gestao: cadastro")
    pg.click("#btn-abrir-categorias"); pg.wait_for_timeout(300); axe(pg,"gestao: categorias")
    pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1500); axe(pg,"treinamentos: inicio")
    pg.goto(BASE+"treinamentos.html?painel=rh"); pg.wait_for_timeout(1500); axe(pg,"RH: painel")
    pg.goto(BASE+"curriculos.html"); pg.wait_for_timeout(1500); axe(pg,"curriculos")
    ctx2=b.new_context(viewport={"width":390,"height":844},is_mobile=True); install(ctx2)
    q=ctx2.new_page(); q.goto(BASE+"curriculo.html"); q.wait_for_timeout(1500); axe(q,"curriculo (candidato)")
    q.goto(BASE+"treinamentos.html"); q.wait_for_timeout(1200); axe(q,"treinamentos: login")
    b.close()
agg={}
for page,vs in res.items():
    for v in vs: agg.setdefault(v['id'],{'impact':v['impact'],'help':v['help'],'pages':{},}).__getitem__('pages')[page]=v['n']
for k,v in sorted(agg.items(),key=lambda kv:{'critical':0,'serious':1,'moderate':2,'minor':3}.get(kv[1]['impact'],4)):
    print("[%s] %s — %s\n    %s"%(v['impact'],k,v['help'],"; ".join("%s×%d"%(a,n) for a,n in v['pages'].items())))
json.dump(res,open(os.path.join(AQUI,'saida','axe_a.json'),'w'),ensure_ascii=False,indent=1)
