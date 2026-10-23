# CPF, e-mail, login múltiplo, "Esqueci a senha", "conta já existe" e faixa vermelha de CPF (treinamentos, curriculo, admin)
import sys, json, os
AQUI=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,AQUI)
from mock import *
from playwright.sync_api import sync_playwright
OK=[];BAD=[]
def chk(n,c,e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ")+n+((" — "+str(e)) if (e and not c) else ""))
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
AXE=open(os.path.join(AQUI,'axe.min.js')).read()
def axe(pg,label):
    pg.evaluate(AXE)
    r=pg.evaluate("async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}});return r.violations.map(v=>v.id+'x'+v.nodes.length+' '+v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(','))}")
    chk('axe — '+label,not r,r)
CPF_OK="529.982.247-25"
def novo(b,perms=PERMS_ALL,cfg=None):
    ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    log=[]; install(ctx,perms=perms,log=log); cfg=cfg if cfg is not None else {}
    cfg["acoes"]=[]
    def h(route):
        r=route.request
        if "script.google.com" in r.url and r.method=="POST":
            body=json.loads(r.post_data or "{}"); a=body.get("action"); cfg["acoes"].append(body)
            if a=="login" and cfg.get("loginSemCpf"):
                return route.fulfill(json={"ok":True,"sessao":"tk2.x.y","usuario":{"whatsapp":"88999999999","name":"Ana Estagiária","level":2,"permissoes":["portal","catalogo_cadastrar","catalogo_admin"],"perfil":"Estagiário","cpf":""}})
            if a=="recuperar_senha":
                if body.get("cpf")!=("52998224725"): return route.fulfill(json={"ok":False,"naoConfere":True,"restam":4,"erro":"Os dados não conferem. Restam 4 tentativas."})
                return route.fulfill(json={"ok":True,"sessao":"tk2.n.z","usuario":{"whatsapp":"88999999999","name":"Ana Estagiária","level":2,"permissoes":["portal","catalogo_cadastrar","catalogo_admin"],"perfil":"Estagiário","cpf":CPF_OK}})
            if a=="recuperar_whatsapp_iniciar":
                return route.fulfill(json={"ok":True,"desafio":"a"*32,"mensagem":"Se houver uma conta ativa, o código chegará ao WhatsApp cadastrado."})
            if a=="recuperar_whatsapp_concluir":
                if body.get("codigo")!="AB12CD34EF": return route.fulfill(json={"ok":False,"erro":"Código inválido, expirado ou já utilizado."})
                return route.fulfill(json={"ok":True})
            if a=="salvar_identificadores":
                return route.fulfill(json={"ok":True,"usuario":{"whatsapp":"88999999999","name":"Ana Estagiária","level":2,"permissoes":["portal"],"cpf":CPF_OK}})
            if a=="registrar" and cfg.get("existe"):
                return route.fulfill(json={"ok":False,"contaExiste":True,"erro":"Já existe uma conta com esse WhatsApp."})
        route.fallback()
    ctx.route("**/*",h); return ctx,cfg
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    print("== treinamentos: login múltiplo, esqueci a senha, faixa de CPF ==")
    ctx,cfg=novo(b,cfg={"loginSemCpf":True}); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("dialog",lambda d:d.accept())
    pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1500)
    chk("campo de entrada aceita e-mail/WhatsApp/CPF",pg.locator("#login-whats").get_attribute("type")=="text" and "CPF" in pg.inner_text("#app"))
    pg.click("#link-esqueci"); pg.wait_for_timeout(400)
    chk("'Esqueci a senha' abre a janela de recuperação",pg.locator("#tkc-recuperar").count()==1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    chk("Esc fecha a janela",pg.locator("#tkc-recuperar").count()==0)
    pg.fill("#login-whats","ana@email.com"); pg.fill("#login-pass","1234"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    lg=[x for x in cfg["acoes"] if x.get("action")=="login"]
    chk("login enviou o e-mail em 'identificador' (sem virar número)",lg and lg[-1].get("identificador")=="ana@email.com" and lg[-1].get("whatsapp")=="",lg[-1:] )
    chk("entrou na tela inicial",pg.locator(".hero h1").count()==1,pg.inner_text("#app")[:80])
    chk("faixa vermelha de CPF aparece na mesma tela (Estagiário sem CPF)",pg.locator(".tkc-faixa").count()==1)
    axe(pg,"faixa vermelha de CPF + tela inicial")
    pg.fill(".tkc-faixa input","111.111.111-11"); pg.click(".tkc-faixa button"); pg.wait_for_timeout(300)
    chk("CPF inválido não é enviado",pg.locator(".tkc-faixa").count()==1 and not any(x.get("action")=="salvar_identificadores" for x in cfg["acoes"]))
    pg.fill(".tkc-faixa input","52998224725")
    chk("máscara de CPF aplicada",pg.input_value(".tkc-faixa input")==CPF_OK,pg.input_value(".tkc-faixa input"))
    pg.click(".tkc-faixa button"); pg.wait_for_timeout(700)
    sv=[x for x in cfg["acoes"] if x.get("action")=="salvar_identificadores"]
    chk("CPF válido salvo e faixa some",pg.locator(".tkc-faixa").count()==0 and sv and sv[-1].get("cpf")==CPF_OK,sv)
    chk("sem erro de JS",not errs,errs); ctx.close()

    print("== treinamentos: recuperar senha ==")
    ctx,cfg=novo(b); pg=ctx.new_page(); pg.on("dialog",lambda d:d.accept())
    pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1200)
    pg.fill("#login-whats","88999999999"); pg.click("#link-esqueci"); pg.wait_for_timeout(400)
    ov=pg.locator("#tkc-recuperar"); axe(pg,"janela Esqueci a senha")
    chk("janela traz o identificador já digitado",ov.locator("input").first.input_value()=="88999999999")
    ins=ov.locator("input"); n=ins.count()
    # campos: identificador, CPF, nascimento, nova senha
    ins.nth(1).fill("390.533.447-05"); ins.nth(3).fill("novaSenha1"); ov.locator("button:has-text('Trocar a senha')").click(); pg.wait_for_timeout(600)
    chk("dados que não conferem mostram frase (sem JSON)",ov.count()==1 and "{" not in ov.inner_text() and "não conferem" in ov.inner_text().lower(),ov.inner_text()[:200])
    ins.nth(1).fill("52998224725"); ov.locator("button:has-text('Trocar a senha')").click(); pg.wait_for_timeout(1200)
    ctx2=None
    chk("recuperou e entrou",pg.locator("#tkc-recuperar").count()==0 and pg.locator(".hero h1").count()==1)
    ctx.close()

    print("== recuperação por código do WhatsApp ==")
    ctx,cfg=novo(b); pg=ctx.new_page()
    pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1200)
    pg.fill("#login-whats","ana@email.com"); pg.click("#link-esqueci"); pg.wait_for_timeout(300)
    pg.locator("#tkc-recuperar button:has-text('Receber código')").click(); pg.wait_for_timeout(400)
    chk("resposta genérica não confirma se a conta existe","se houver uma conta" in pg.locator("#tkc-recuperar").inner_text().lower())
    pg.fill("#tkc-codigo","ERRADO0000"); pg.fill("#tkc-senha-zap","senha-nova-segura")
    pg.locator("#tkc-recuperar button:has-text('Salvar nova senha')").click(); pg.wait_for_timeout(400)
    chk("código inválido não altera senha","inválido" in pg.locator("#tkc-recuperar").inner_text().lower())
    pg.fill("#tkc-codigo","AB12CD34EF"); pg.locator("#tkc-recuperar button:has-text('Salvar nova senha')").click(); pg.wait_for_timeout(400)
    chk("código válido é enviado com desafio e senha",any(x.get("action")=="recuperar_whatsapp_concluir" and x.get("desafio")=="a"*32 and x.get("novaSenha")=="senha-nova-segura" for x in cfg["acoes"]))
    chk("sucesso consome os campos e encerra a ação",pg.locator("#tkc-senha-zap").input_value()=="" and pg.locator("#tkc-recuperar button:has-text('Salvar nova senha')").is_hidden())
    axe(pg,"recuperação por código do WhatsApp")
    ctx.close()
    ctx,cfg=novo(b); pg=ctx.new_page()
    pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1200); pg.fill("#login-whats","88999999999"); pg.click("#link-esqueci"); pg.wait_for_timeout(300)
    pg.locator("#tkc-recuperar button:has-text('Não lembro')").click(); pg.wait_for_timeout(300)
    hr=pg.locator("#tkc-recuperar a").first.get_attribute("href") or ""
    chk("link de ajuda não expõe CPF, e-mail nem identificador", "52998224725" not in hr and "@" not in hr and "identificador" not in hr.lower())
    chk("sem CPF/nascimento: chama a gestão no WhatsApp da loja (link completo com mensagem pronta)",hr.startswith("https://wa.me/5588993223998?text="),hr)
    ctx.close()

    print("== treinamentos: cadastro com CPF/e-mail opcionais e conta já existente ==")
    ctx,cfg=novo(b,cfg={"existe":True}); pg=ctx.new_page(); pg.on("dialog",lambda d:d.accept())
    pg.goto(BASE+"treinamentos.html"); pg.wait_for_timeout(1200); pg.click("#link-cadastro"); pg.wait_for_timeout(300)
    chk("CPF e e-mail aparecem como opcionais","opcional" in pg.inner_text("#app").lower() and pg.locator("#cad-cpf").count()==1)
    axe(pg,"cadastro com CPF/e-mail opcionais")
    pg.fill("#cad-nome","Bia"); pg.fill("#cad-whats","88977776666"); pg.fill("#cad-senha","1234"); pg.fill("#cad-cpf","123"); pg.click("#cad-btn"); pg.wait_for_timeout(300)
    chk("CPF incompleto é barrado",("cpf inválido" in pg.inner_text("#login-error").lower()),pg.inner_text("#login-error"))
    pg.fill("#cad-cpf",CPF_OK); pg.click("#cad-btn"); pg.wait_for_timeout(900)
    chk("conta que já existe vira cartão com Entrar / Esqueci a senha",pg.locator(".tkc-exist").count()==1 and pg.locator(".tkc-exist button").count()==2)
    pg.locator(".tkc-exist button:has-text('Esqueci')").click(); pg.wait_for_timeout(400)
    chk("'Esqueci a senha' do cartão abre a recuperação",pg.locator("#tkc-recuperar").count()==1)
    ctx.close()

    print("== curriculo: CPF obrigatório ==")
    ctx,cfg=novo(b); pg=ctx.new_page(); pg.on("dialog",lambda d:d.accept())
    pg.goto(BASE+"curriculo.html"); pg.wait_for_timeout(1200)
    pg.evaluate("S.tmp={email:'a@b.com',nome:'Bia Teste',whats:'88977776666',senha:'1234',moradia:'Crateús',chegada:'A pé'}; viewFinalizar('')"); pg.wait_for_timeout(300)
    chk("campo CPF marcado como obrigatório",pg.locator("#cpf").count()==1 and "obrigat" in pg.inner_text("#app").lower())
    pg.fill("#nasc","10/10/1990"); pg.check("input[name=lgpd]"); pg.click("#ok"); pg.wait_for_timeout(300)
    chk("sem CPF não envia",("cpf" in pg.inner_text("#erro").lower()) and not any(x.get("action")=="curriculo_cadastro" for x in cfg["acoes"]),pg.inner_text("#erro"))
    pg.fill("#cpf","11111111111"); pg.click("#ok"); pg.wait_for_timeout(300)
    chk("CPF inválido não envia","inválido" in pg.inner_text("#erro").lower() and not any(x.get("action")=="curriculo_cadastro" for x in cfg["acoes"]))
    pg.fill("#cpf","52998224725")
    chk("máscara no CPF do currículo",pg.input_value("#cpf")==CPF_OK,pg.input_value("#cpf"))
    pg.click("#ok"); pg.wait_for_timeout(700)
    cc=[x for x in cfg["acoes"] if x.get("action")=="curriculo_cadastro"]
    chk("CPF válido segue no envio do currículo",cc and cc[-1].get("cpf")==CPF_OK,cc)
    ctx.close()
    ctx,cfg=novo(b); pg=ctx.new_page()
    pg.goto(BASE+"curriculo.html"); pg.wait_for_timeout(1000)
    pg.evaluate("S.whats='88977776666'; viewRetomar('')"); pg.wait_for_timeout(300)
    chk("tela de retomar tem 'Esqueci a senha'",pg.locator("#esqueci").count()==1)
    pg.click("#esqueci"); pg.wait_for_timeout(400); chk("abre a recuperação",pg.locator("#tkc-recuperar").count()==1)
    ctx.close()

    print("== admin: login múltiplo, esqueci a senha ==")
    ctx,cfg=novo(b); pg=ctx.new_page(); pg.on("dialog",lambda d:d.accept())
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(1500)
    chk("login do admin aceita e-mail/CPF",pg.locator("#lo-whats").get_attribute("type")=="text")
    pg.click("#lo-esqueci"); pg.wait_for_timeout(400); chk("admin abre a recuperação",pg.locator("#tkc-recuperar").count()==1)
    ctx.close()
    print("== aviso ao sair com envios pendentes (barra inferior) ==")
    ctx,cfg=novo(b); pg=ctx.new_page(); falas=[]
    pg.on("dialog",lambda d:(falas.append(d.message),d.dismiss()))
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(1200)
    pg.evaluate("window.TKSairBloqueio=()=>'Ainda faltam 2 peças. Se sair, se perde.'")
    url0=pg.url; pg.evaluate("document.querySelector('a[data-nav]:not([data-nav=gestao])').click()"); pg.wait_for_timeout(500)
    chk("sair pela barra com envio pendente mostra o aviso e Cancelar fica na página",falas and "faltam 2" in falas[0] and pg.url==url0,(falas,pg.url))
    pg.evaluate("window.TKSairBloqueio=()=>''"); n=len(falas)
    pg.evaluate("document.querySelector('a[data-nav]:not([data-nav=gestao])').click()"); pg.wait_for_timeout(500)
    chk("sem envio pendente sai sem perguntar",len(falas)==n)
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d"%(len(OK),len(BAD)),BAD)
sys.exit(1 if BAD else 0)
