"""Admin: tamanhos na lista + janela interativa 'Editar peças' (nome, preço, categoria/tamanho/cor com criação por escrita, retirar, foco ao digitar)."""
import sys, os
AQUI=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
OK=[];BAD=[]
def chk(n,c,e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ")+n+(" — "+str(e) if e and not c else ""))
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"]); ctx=b.new_context(viewport={"width":390,"height":780},is_mobile=True,has_touch=True,service_workers="block")
    ctx.add_init_script(SESSION); log=[]; st=install(ctx,perms=PERMS_ALL,versao="4.20",log=log)
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("dialog",lambda d:d.accept())
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(2800)
    pg.evaluate("document.querySelector('#lista-produtos').scrollIntoView()"); pg.wait_for_timeout(300)
    chk("lista mostra a linha de tamanhos", pg.locator("#lista-produtos .tam-linha").count()>0)
    pg.locator("#lista-produtos input[type=checkbox]").nth(0).check(); pg.locator("#lista-produtos input[type=checkbox]").nth(1).check(); pg.wait_for_timeout(300)
    nomes=pg.evaluate("[...document.querySelectorAll('#lista-produtos .produto')].slice(0,2).map(e=>e.querySelector('.nome').textContent.trim())")
    pg.click("#btn-bulk-editar"); pg.wait_for_selector("#overlay-lote.aberto")
    chk("janela abre e botão Aplicar começa desligado", pg.locator("#lote-ok").is_disabled())
    pg.fill("#lote-nome"," extra"); pg.select_option("#lote-nome-modo","fim"); pg.fill("#lote-nome","Premium")
    # categoria: digitar abre opções e ancora o campo no topo da janela
    inp=pg.locator("#lote-lista-categoria [data-entrada]"); inp.click(); pg.wait_for_timeout(400)
    y0=pg.evaluate("document.getElementById('lote-corpo').scrollTop")
    inp.type("Zzcat",delay=30); pg.wait_for_timeout(900)
    topo=pg.evaluate("(()=>{const c=document.getElementById('lote-corpo').getBoundingClientRect(),i=document.querySelector('#lote-lista-categoria [data-entrada]').getBoundingClientRect();return i.top-c.top})()")
    chk("ao escrever, o campo sobe para o topo da janela", topo<40, topo)
    chk("aparece 'Criar “Zzcat”'", pg.locator('#lote-lista-categoria [data-cria]').count()==1)
    pg.click('#lote-lista-categoria [data-cria]'); pg.wait_for_timeout(900)
    y1=pg.evaluate("document.getElementById('lote-corpo').scrollTop")
    chk("ao escolher, volta para onde estava", abs(y1-y0)<6, (y0,y1))
    chk("chip novo aparece", pg.locator("#lote-lista-categoria .lote-chip.novo").count()==1)
    # tamanho existente por toque + novo por escrita
    pg.locator("#lote-lista-tamanhos [data-sug] button[data-pega]").first.click()
    pg.locator("#lote-lista-tamanhos [data-entrada]").fill("XXG"); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    chk("tamanhos: 2 chips (1 novo)", pg.locator("#lote-lista-tamanhos .lote-chip").count()==2 and pg.locator("#lote-lista-tamanhos .lote-chip.novo").count()==1)
    pg.select_option("#lote-preco-modo","pct"); pg.fill("#lote-preco","10")
    pg.select_option("#lote-novidade","sim")
    chk("prévia lista o que muda", all(w in pg.inner_text("#lote-previa") for w in ["nome","preço","categoria","tamanhos","novidade"]), pg.inner_text("#lote-previa"))
    pg.click("#lote-ok"); pg.wait_for_timeout(5000)
    acts=[x.get("action") for x in log]
    chk("criou categoria e tamanho antes de editar", "addCategoria" in acts and "addTamanho" in acts and acts.index("addCategoria")<acts.index("update"), acts[-12:])
    ups=[x for x in log if x.get("action")=="update"]
    chk("2 peças atualizadas", len(ups)==2, len(ups))
    u=ups[0] if ups else {}
    chk("nome acrescentado", u.get("nome","").endswith("Premium") and u.get("nome","").startswith(nomes[0].split(' ')[0]), u.get("nome"))
    chk("categoria nova entrou e tamanho novo entrou", "Zzcat" in u.get("categoria","") and "XXG" in u.get("tamanhos",""), (u.get("categoria"),u.get("tamanhos")))
    chk("novidade marcada", u.get("novidade") in (True,"true"), u.get("novidade"))
    chk("janela fechou", pg.locator("#overlay-lote.aberto").count()==0)
    chk("sem erro de JS", not errs, errs)
    b.close()
print("OK=%d FALHAS=%d %s"%(len(OK),len(BAD),BAD))
