"""Cadastro: sugestão da IA por foto — editar, retirar (✕) e aplicar só o que ficou; gerarSeo leva sessão."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK=[];BAD=[]
def chk(n,c,e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ")+n+(" — "+str(e) if e and not c else ""))
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"]); ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    ctx.add_init_script(SESSION); log=[]; st=install(ctx,log=log,versao="3.5"); st["ia_foto_ok"]=True
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("dialog",lambda d:d.accept())
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(2500)
    pg.locator("#card-menu-cadastro > summary").click()
    pg.evaluate("document.getElementById('card-form').open=true")
    pg.evaluate("p=>{fotosItens.push({b64:p})}",PNG)
    pg.fill("#nome","Nome antigo")
    pg.click("#btn-foto-ia"); pg.wait_for_selector("#btn-foto-ia-aplicar",timeout=8000)
    pg.locator("#foto-ia-box").scroll_into_view_if_needed(); pg.screenshot(path=os.environ.get("SHOT","/tmp/ia.png"))
    chk("tem ✕ por categoria", pg.locator('[data-ia-chave=categorias]').count()==3)
    pg.locator('[data-ia-chave=categorias]').nth(1).click()   # tira Cropped
    pg.locator('[data-ia-chave=cores]').nth(1).click()        # tira Branco
    pg.click('[data-ia-nao=usarDescricao]')                   # não usar descrição
    pg.fill('[data-ia-txt=nome]',"Conjunto Cropped Ombro Único")
    pg.click("#btn-foto-ia-aplicar"); pg.wait_for_timeout(300)
    chk("nome editado foi aplicado", pg.input_value("#nome")=="Conjunto Cropped Ombro Único", pg.input_value("#nome"))
    chk("cores sem a retirada", pg.input_value("#cores")=="Preto", pg.input_value("#cores"))
    chk("descrição retirada não entrou", pg.input_value("#descricao")=="", pg.input_value("#descricao"))
    cats=pg.evaluate("Array.from(selecionadasCategorias)")
    chk("categorias só Conjuntos e Saias", sorted(cats)==["Conjuntos","Saias"], cats)
    chk("painel sumiu", pg.locator("#foto-ia-box").inner_text().strip()=="")
    pg.click("#btn-seo-ia"); pg.wait_for_timeout(1500)
    g=[x for x in log if x.get("action")=="gerarSeo"]
    chk("gerarSeo leva sessão e WhatsApp", g and g[-1].get("sessao") and g[-1].get("whatsapp"), g[-1:] )
    chk("sem erro de JS", not errs, errs)
    pg.locator("#foto-ia-box").scroll_into_view_if_needed()
    b.close()
print("OK=%d FALHAS=%d %s"%(len(OK),len(BAD),BAD))
