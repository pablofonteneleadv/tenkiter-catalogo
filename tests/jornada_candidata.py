import sys, json
import os
AQUI=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,AQUI)
os.makedirs(os.path.join(AQUI,'saida'),exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":360,"height":740},is_mobile=True,has_touch=True); log=[]
    install(ctx,log=log)
    # respostas plausíveis para o fluxo de candidatura
    def hd(route):
        r=route.request
        if "script.google.com" in r.url and r.method=="POST":
            body=json.loads(r.post_data or "{}"); a=body.get("action")
            if a and a.startswith("cv_"):
                return route.fulfill(json={"ok":True,"cvToken":"tok123","etapa":"Perfil","desafio":{"a":3,"b":4},"prefill":{},"sessao":"tk2.a.b","whatsapp":"88999999999"})
        route.fallback()
    ctx.route("**/*",hd)
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("dialog",lambda d:d.accept())
    pg.goto(BASE+"curriculo.html"); pg.wait_for_timeout(1500)
    vistos=[]
    for it in range(30):
        h=pg.evaluate("(document.querySelector('#app h2,#app h3,#app .titulo')||{}).innerText||''").strip()
        ov=pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth")
        tit=h or pg.inner_text("#app")[:40].replace("\n"," ")
        if tit not in vistos: vistos.append(tit); print("passo:",tit[:70],"| rolagem horizontal:" ,ov)
        # preenche
        for el in pg.locator("#app input:visible, #app select:visible, #app textarea:visible").all():
            try:
                t=(el.get_attribute("type",timeout=1500) or "text"); n=(el.get_attribute("name",timeout=1500) or el.get_attribute("id",timeout=1500) or "")
                if t in("radio",): 
                    if not pg.locator(f'input[name="{n}"]:checked').count(): el.check(force=True,timeout=2000)
                elif t=="checkbox": 
                    if n=="lgpd" or "lgpd" in n or not pg.locator(f'input[name="{n}"]:checked').count(): el.check(force=True,timeout=2000)
                elif t=="file": pass
                elif el.evaluate("e=>e.tagName")=="SELECT": el.select_option(index=1)
                elif "nasc" in n: el.fill("10/05/2000")
                elif t=="email" or "mail" in n: el.fill("maria@exemplo.com")
                elif t=="tel" or "whats" in n: el.fill("88999999999")
                elif "insta" in n: el.fill("@maria")
                elif el.evaluate("e=>e.tagName")=="TEXTAREA": el.fill("Texto de teste com mais de vinte caracteres para validar.")
                elif t in("number",): el.fill("3")
                elif not el.input_value(): el.fill("Maria da Silva")
            except Exception as e: pass
        btn=pg.locator("#app button:visible").filter(has_text=__import__('re').compile("Avançar|Continuar|Enviar|Próximo|Começar|Iniciar|Salvar",__import__('re').I))
        if not btn.count():
            print("   botões visíveis:",[x.inner_text()[:30] for x in pg.locator("#app button:visible").all()], "| radios:",pg.locator("#app input[type=radio]:visible").count(),"| url:",pg.url); break
        btn.last.click(); pg.wait_for_timeout(700)
        er=pg.evaluate("(document.getElementById('erro')||{}).innerText||''").strip()
        if er: print("   aviso:",er[:110])
    print("erros JS:",errs)
    print("ações enviadas:",sorted(set(x.get('action') for x in log)))
    b.close()
