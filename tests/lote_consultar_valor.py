"""v7.14.3: editar peça "Consultar valor" (Preco 0) sem mexer no preço — janela "Editar peças" ou reenvio de envio antigo — vai com
consultarValor:true (o servidor recusava "Preço inválido"). Preço novo continua valendo; criar e desmarcar não mudam."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK=[];BAD=[]
def chk(n,c,e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ")+n+(" — "+str(e) if e and not c else ""))
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"]); ctx=b.new_context(viewport={"width":390,"height":844})
    ctx.add_init_script(SESSION); install(ctx, perms=PERMS_ALL, versao="4.20")
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(3000)
    m=lambda d: pg.evaluate("d=>{const o=montarDadosFinais_({ehEdicao:d.action==='update',dados:d,k:'k1'}).dados;return {preco:o.preco,consultarValor:o.consultarValor}}", d)
    r=m({"action":"update","id":"1","preco":"0"}); chk("edição com preço 0 vai como 'Consultar valor'", r=={"preco":"","consultarValor":True}, r)
    r=m({"action":"update","id":"1","preco":""}); chk("edição sem preço também", r=={"preco":"","consultarValor":True}, r)
    r=m({"action":"update","id":"1","preco":"59.9"}); chk("preço novo continua valendo (sem marca)", r["preco"]=="59.9" and r["consultarValor"] is None, r)
    r=m({"action":"update","id":"1","preco":"","consultarValor":False}); chk("desmarcar 'Consultar valor' sem preço continua pedindo preço", r["consultarValor"] is False, r)
    r=m({"action":"create","nome":"x","preco":"0"}); chk("cadastro novo não é alterado", r["preco"]=="0" and r["consultarValor"] is None, r)
    chk("sem erro de JS", not errs, errs)
    b.close()
print("OK=%d FALHAS=%d %s"%(len(OK),len(BAD),BAD))
