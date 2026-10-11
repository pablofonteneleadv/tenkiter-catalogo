# A fila de envios fica guardada no aparelho: fechar/minimizar no meio NÃO perde a peça (retoma sozinha) e, se fechou na hora de salvar, a pessoa confere antes de reenviar
import sys, os, json
AQUI=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,AQUI)
from mock import *
from playwright.sync_api import sync_playwright
OK=[];BAD=[]
def chk(n,c,e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ")+n+((" — "+str(e)) if (e and not c) else ""))
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
SEED="""async (r)=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open('tenkiter_admin_envios_v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('e',{keyPath:'k'});q.onsuccess=()=>res(q.result);q.onerror=rej});
await new Promise(res=>{const tx=db.transaction('e','readwrite');tx.objectStore('e').put(r);tx.oncomplete=res});db.close()}"""
LER="""async ()=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open('tenkiter_admin_envios_v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('e',{keyPath:'k'});q.onsuccess=()=>res(q.result);q.onerror=rej});
const l=await new Promise(res=>{const rq=db.transaction('e','readonly').objectStore('e').getAll();rq.onsuccess=()=>res(rq.result)});db.close();return l.map(x=>x.titulo)}"""
def rec(k,titulo,etapa):
    return {"k":k,"titulo":titulo,"ehEdicao":False,"temVideo":False,"videoArquivo":None,"capaNovaB64":None,"galeriaNovaB64":[],"rascunhoId":None,"etapa":etapa,"msg":"",
            "dados":{"action":"create","nome":titulo,"preco":"59.9","categoria":"Vestidos","genero":"Feminino"}}
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,service_workers="block")
    log=[]; install(ctx,log=log); ctx.add_init_script(SESSION)
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("dialog",lambda d:d.accept())
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(1500)
    pg.evaluate(SEED,rec("e1","Peça Retomada","fila")); pg.evaluate(SEED,rec("e2","Peça Incerta","salvando"))
    print("== fechou o app com 2 peças na fila; abre de novo ==")
    pg.reload(); pg.wait_for_timeout(3500)
    criados=[x for x in log if x.get("action")=="create"]
    chk("a peça que estava na fila foi enviada sozinha ao voltar",any(x.get("nome")=="Peça Retomada" for x in criados),[x.get("nome") for x in criados])
    chk("a peça que fechou NA HORA de salvar NÃO foi reenviada (evita duplicar)",not any(x.get("nome")=="Peça Incerta" for x in criados))
    txt=pg.inner_text("#fila-envios")
    chk("mostra o aviso claro para conferir antes de reenviar","não sei se esta peça" in txt and "Tentar de novo" in txt and "Descartar" in txt,txt[:300])
    chk("a enviada com sucesso saiu do armazenamento do aparelho",pg.evaluate(LER)==["Peça Incerta"],pg.evaluate(LER))
    pg.locator("#fila-envios button:has-text('Descartar')").click(); pg.wait_for_timeout(400)
    chk("descartar apaga também do aparelho",pg.evaluate(LER)==[])
    chk("sem erro de JavaScript",not errs,errs)
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d"%(len(OK),len(BAD)),BAD)
sys.exit(1 if BAD else 0)
