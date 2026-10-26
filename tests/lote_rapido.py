"""Admin v7.18: "Editar peças" (só dados) vai numa chamada `updateLote` (servidor 4.28) em vez de uma por peça;
erro de uma peça fica só nela; se o grupo não passar, cada peça segue pelo envio normal; servidor antigo continua como antes."""
import sys, os, time
AQUI=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
OK=[];BAD=[]
def chk(n,c,e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ")+n+(" — "+str(e) if e and not c else ""))

def rodar(p, versao, prep=None, n=5):
    b=p.chromium.launch(args=["--no-sandbox"]); ctx=b.new_context(viewport={"width":390,"height":780},is_mobile=True,has_touch=True,service_workers="block")
    ctx.add_init_script(SESSION); log=[]; st=install(ctx,perms=PERMS_ALL,versao=versao,log=log)
    if prep: prep(st)
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("dialog",lambda d:d.accept())
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(2800)
    ids=pg.evaluate("[...document.querySelectorAll('#lista-produtos .produto-chk')].slice(0,%d).map(c=>c.dataset.id)"%n)
    for k in range(n): pg.locator("#lista-produtos .produto-chk").nth(k).check()
    pg.click("#btn-bulk-editar"); pg.wait_for_selector("#overlay-lote.aberto")
    pg.select_option("#lote-nome-modo","fim"); pg.fill("#lote-nome","Premium")
    t0=time.time(); pg.click("#lote-ok")
    pg.wait_for_function("!envios.some(e=>e.estado==='fila'||e.estado==='enviando')", timeout=60000); dt=time.time()-t0
    pg.wait_for_timeout(600)
    est=pg.evaluate("envios.map(e=>({id:String(e.dados.id),estado:e.estado,msg:e.msg||''}))")
    r=dict(log=log,st=st,ids=ids,est=est,errs=errs,dt=dt,pg=pg)
    return r,b

with sync_playwright() as p:
    print("== servidor 4.28: um grupo só ==")
    r,b=rodar(p,"4.28")
    lotes=r["st"].get("lotes_upd",[]); ups=[x for x in r["log"] if x.get("action")=="update"]
    chk("uma chamada updateLote com as 5 peças", len(lotes)==1 and len(lotes[0])==5, [len(x) for x in lotes])
    chk("nenhuma chamada update por peça", len(ups)==0, len(ups))
    it=lotes[0][0] if lotes else {}
    chk("cada item leva os dados da peça, sem senha/sessão dentro", it.get("nome","").endswith("Premium") and str(it.get("id")) in r["ids"] and not any(k in it for k in ("pin","sessao","whatsapp","action")), it)
    lu=[x for x in r["log"] if x.get("action")=="updateLote"]
    chk("a sessão vai uma vez, no pacote", lu and lu[0].get("sessao") and lu[0].get("whatsapp"), {k:lu[0].get(k) for k in ("sessao","whatsapp")} if lu else None)
    chk("todas terminam como salvas", all(e["estado"]=="ok" for e in r["est"]) or not r["est"], r["est"])
    chk("sem erro de JS", not r["errs"], r["errs"]); b.close()

    print("== uma peça recusada pelo servidor ==")
    # a lista abre sempre na mesma ordem: a 2ª peça marcada é a mesma da rodada anterior
    def prep3(st, alvo=r["ids"][1]): st["lote_upd_falhar"]=[alvo]
    r,b=rodar(p,"4.28",prep3)
    errados=[e for e in r["est"] if e["estado"]=="erro"]
    chk("só a peça recusada fica com erro, com a mensagem do servidor", len(errados)==1 and errados[0]["id"]==r["ids"][1] and "Preço inválido" in errados[0]["msg"], r["est"])
    chk("aparece o Tentar de novo dela", r["pg"].locator("#fila-envios button", has_text="Tentar de novo").count()==1)
    chk("o quadro de envios aparece (tem pendência)", r["pg"].locator("#cad-envios").is_visible())
    r["pg"].locator("#fila-envios button", has_text="Tentar de novo").click(); r["pg"].wait_for_timeout(2500)
    ups=[x for x in r["log"] if x.get("action")=="update"]
    chk("Tentar de novo manda essa peça sozinha pelo update normal", len(ups)==1 and str(ups[0].get("id"))==r["ids"][1], [x.get("id") for x in ups])
    b.close()

    print("== grupo não passa: cada peça segue pelo envio normal ==")
    def prep4(st): st["lote_upd_cair"]=1
    r,b=rodar(p,"4.28",prep4)
    ups=[x for x in r["log"] if x.get("action")=="update"]
    chk("depois da recusa do grupo, as 5 vão uma a uma", len(r["st"].get("lotes_upd",[]))==1 and len(ups)==5, (len(r["st"].get("lotes_upd",[])),len(ups)))
    chk("e terminam salvas", not [e for e in r["est"] if e["estado"]=="erro"], r["est"]); b.close()

    print("== servidor antigo (4.20): como antes ==")
    r,b=rodar(p,"4.20")
    ups=[x for x in r["log"] if x.get("action")=="update"]
    chk("sem updateLote; 5 updates", not r["st"].get("lotes_upd") and len(ups)==5, len(ups)); b.close()
print("OK=%d FALHAS=%d %s"%(len(OK),len(BAD),BAD))
