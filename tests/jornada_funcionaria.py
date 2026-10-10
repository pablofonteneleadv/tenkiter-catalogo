import sys, json
import os
AQUI=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,AQUI)
os.makedirs(os.path.join(AQUI,'saida'),exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
OK=[];BAD=[]
def chk(n,c,e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ")+n+((" — "+str(e)) if (e and not c) else ""))
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); log=[]
    install(ctx,perms=PERMS_ALL+["avaliacoes","manual_1","manual_2","manual_3"],log=log); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("dialog",lambda d:d.accept())
    print("== Funcionária: entrar, ler manual, avaliação ==")
    pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1500)
    chk("abre na tela de entrar",pg.locator("#login-pass").count()==1)
    pg.fill("#login-whats","88999999999"); pg.fill("#login-pass","1234"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    chk("entrou: mostra 'Oi, ...'",pg.locator(".hero h1").count()==1 and "Oi" in pg.inner_text(".hero h1"),pg.inner_text("#app")[:80])
    chk("tem cartões de manual",pg.locator(".card[data-manual]").count()>=1,pg.locator(".card").count())
    chk("sessão gravada só com whatsapp+token (sem dados pessoais)",not any(k in (pg.evaluate("localStorage.getItem('tm_session')") or "").lower() for k in ["nascimento","endereco","cpf"]))
    pg.locator(".card[data-manual]").first.click(); pg.wait_for_timeout(800)
    chk("manual abriu com capítulos",pg.locator(".chapter").count()>=1,pg.locator(".chapter").count())
    n=pg.locator(".chapter input[type=checkbox]").count()
    chk("botão da avaliação começa travado",pg.locator("#btn-ir-avaliacao").is_disabled() if pg.locator("#btn-ir-avaliacao").count() else False)
    for i in range(n):
        pg.locator(".chapter input[type=checkbox]").nth(i).check(force=True)
    pg.wait_for_timeout(1200)
    chk("todos os capítulos marcados (%d)"%n,pg.locator(".chapter input[type=checkbox]:checked").count()==n)
    chk("avaliação destravou",pg.locator("#btn-ir-avaliacao").count()==1 and not pg.locator("#btn-ir-avaliacao").is_disabled())
    acoes=sorted(set(x.get("action") for x in log)); print("   ações enviadas:",acoes)
    chk("progresso foi enviado ao servidor",any("prog" in (a or "").lower() or "leit" in (a or "").lower() or "cap" in (a or "").lower() for a in acoes),acoes)
    pg.click("#btn-ir-avaliacao"); pg.wait_for_timeout(900)
    txt=pg.inner_text("#app")
    chk("tela da avaliação abre",("avalia" in txt.lower()),txt[:100].replace("\n"," | "))
    print("   erros JS:",errs)
    # voltar pelo botão do navegador não quebra
    pg.go_back(); pg.wait_for_timeout(600); chk("voltar não dá erro",not errs,errs)
    ctx.close()
    # ---- sair e entrar com senha errada
    ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    install(ctx)
    def errlogin(route):
        r=route.request
        if "script.google.com" in r.url and r.method=="POST":
            body=json.loads(r.post_data or "{}")
            if body.get("action")=="login": return route.fulfill(json={"ok":False,"erro":"Senha incorreta"})
        route.fallback()
    ctx.route("**/*",errlogin); pg=ctx.new_page()
    pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1200)
    pg.fill("#login-whats","88999999999"); pg.fill("#login-pass","x"); pg.click("button:has-text('Entrar')"); pg.wait_for_timeout(1000)
    chk("senha errada mostra mensagem legível (sem JSON cru)",("incorreta" in pg.inner_text("#app").lower()) and "{" not in pg.inner_text("#app")[:300],pg.inner_text("#app")[:200])
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d"%(len(OK),len(BAD)),BAD)
