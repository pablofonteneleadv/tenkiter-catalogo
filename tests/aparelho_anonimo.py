"""Contagem ANÔNIMA de aparelhos (common.js TKDisp + index.html + pwa.js + push.js, v3.5): cada visualização/WhatsApp leva app-ou-navegador, aparelho, de onde veio
e um código aleatório; uma "visita" por sessão; o aparelho diz se instalou e se o aviso está ativo (um envio só, sem repetir); só token de sessão liga à conta;
sai da conta = solta; nada pessoal (nome/telefone/senha) no que vai para o servidor nem no localStorage. O Apps Script é simulado."""
import sys, os, json, re
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; 23078PNDDG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
UA_INSTAGRAM = UA_ANDROID + " Instagram 330.0.0.38.90 Android"
UA_PC = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
# tempos curtos para o teste (o site usa 1,5 s e 17 s)
RAPIDO = "window.TK_DISP_ATRASO_MS=300;window.TK_DISP_ESPERA_MS=900;"
# OneSignal FALSO mínimo (só o que o push.js usa para saber se há aviso ativo)
SDK = r"""(function(){var S=window.__os={optedIn:false,ext:null,tags:{},sub:[],perm:[]};function av(l){l.forEach(function(f){try{f()}catch(e){}})}
var O={init:function(){return Promise.resolve()},login:function(i){S.ext=i;return Promise.resolve()},logout:function(){S.ext=null;return Promise.resolve()},
User:{get externalId(){return S.ext},addTag:function(k,v){S.tags[k]=v},addTags:function(t){Object.assign(S.tags,t)},removeTag:function(k){delete S.tags[k]},addAlias:function(){},removeAlias:function(){},
PushSubscription:{get optedIn(){return S.optedIn},optIn:function(){S.optedIn=true;av(S.sub);return Promise.resolve()},optOut:function(){S.optedIn=false;av(S.sub);return Promise.resolve()},addEventListener:function(e,f){S.sub.push(f)}}},
Notifications:{requestPermission:function(){window.__perm='granted';S.optedIn=true;av(S.perm);av(S.sub);return Promise.resolve()},addEventListener:function(e,f){S.perm.push(f)}}};
var fila=window.OneSignalDeferred||[];window.OneSignalDeferred={push:function(fn){return Promise.resolve().then(function(){return fn(O)})}};fila.forEach(function(fn){window.OneSignalDeferred.push(fn)})})();"""

def contexto(b, ua=UA_ANDROID, sessao=False, standalone=False, mobile=True, extra=""):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=mobile, has_touch=mobile, user_agent=ua, service_workers="block")
    log = []; st = install(ctx, log=log, versao="3.5")
    ctx.route("https://api.onesignal.com/**", lambda r: r.fulfill(body='x({"success":true,"app_id":"535f6b0d-c866-43c2-b241-43bd7ab62fae","features":{},"config":{"origin":"https://tenkitermodas.com.br"}})', content_type="application/javascript", headers={"Access-Control-Allow-Origin": "*"}))
    ctx.route("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js", lambda r: r.fulfill(body=SDK, content_type="application/javascript"))
    js = RAPIDO + "window.__perm='default';try{Object.defineProperty(Notification,'permission',{get:function(){return window.__perm},configurable:true})}catch(e){};" + extra
    if standalone: js += "Object.defineProperty(navigator,'standalone',{value:true,configurable:true});"
    ctx.add_init_script(js)
    if sessao: ctx.add_init_script(SESSION)
    return ctx, log, st
def disp(log): return [x for x in log if x.get("action") == "dispositivo"]
def evt(log, tipo=None): return [x for x in log if x.get("action") == "registrarEvento" and (tipo is None or x.get("tipo") == tipo)]
HEX = re.compile(r"^[0-9a-f]{24}$")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    erros = []
    print("== Visitante comum (Android, navegador) ==")
    ctx, log, st = contexto(b)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "index.html?utm_source=instagram"); pg.wait_for_timeout(2600)
    v = evt(log, "visita")
    chk("uma 'visita' foi registrada ao abrir a loja", len(v) == 1, len(v))
    chk("a visita leva app/site, aparelho, fonte e o código anônimo", v and v[0].get("origem") == "site" and v[0].get("dispositivo") == "android" and v[0].get("fonte") == "instagram" and HEX.match(v[0].get("visitante", "")), v[:1])
    chk("a visita não leva produto nem dados do Pixel", v and v[0].get("produtoId") == "" and "meta" not in v[0])
    vid = pg.evaluate("localStorage.getItem('tk_vid_v1')")
    chk("o código do aparelho é aleatório (24 letras/números) e fica só no aparelho", bool(HEX.match(vid or "")), vid)
    d = disp(log)
    chk("o aparelho se registrou UMA vez, com o mesmo código", len(d) == 1 and d[0]["visitante"] == vid, d)
    chk("registro de aparelho: sem conta, sem 'instalou' e sem 'aviso'", d and "whatsapp" not in d[0] and "sessao" not in d[0] and "instalou" not in d[0] and d[0].get("origem") == "site", d)
    pg.locator(".card:not(.esqueleto):has(.ac-sacola)").first.locator("button.abrir-peca, .btn-detalhes, .nome-produto").first.click(timeout=3000) if pg.locator(".card:not(.esqueleto):has(.ac-sacola)").count() else None
    pg.wait_for_timeout(1200)
    vz = evt(log, "visualizacao")
    chk("abrir uma peça registra a visualização com o mesmo código e a mesma fonte", vz and vz[-1].get("visitante") == vid and vz[-1].get("fonte") == "instagram" and vz[-1].get("dispositivo") == "android", vz[-1:] )
    pg.reload(); pg.wait_for_timeout(2600)
    chk("recarregar a página NÃO conta nova visita na mesma sessão", len(evt(log, "visita")) == 1, len(evt(log, "visita")))
    chk("recarregar NÃO repete o registro do aparelho (nada mudou)", len(disp(log)) == 1, len(disp(log)))
    chk("a fonte da visita fica a mesma durante a sessão", pg.evaluate("sessionStorage.getItem('tk_fonte_v1')") == "instagram")
    estado = json.loads(pg.evaluate("localStorage.getItem('tk_disp_estado_v1')") or "{}")
    chk("o que fica guardado no aparelho é só o necessário (sem telefone, nome ou senha)", set(estado) <= {"instalou", "pushAtivo", "novidades", "interesses"} and "tm_session" not in pg.evaluate("Object.keys(localStorage)"), estado)
    chk("nenhum erro de JavaScript", not erros, erros)
    ctx.close()

    print("== De onde veio ==")
    casos = [("Instagram embutido (navegador do app)", dict(ua=UA_INSTAGRAM), "index.html", "instagram"),
             ("link com ?fonte=whatsapp", dict(), "index.html?fonte=whatsapp", "whatsapp"),
             ("fbclid → facebook", dict(), "index.html?fbclid=abc", "facebook"),
             ("sem origem → direto", dict(), "index.html", "direto"),
             ("computador", dict(ua=UA_PC, mobile=False), "index.html", "direto"),
             ("iPhone", dict(ua=UA_IPHONE), "index.html?utm_source=tiktok", "tiktok")]
    for nome, kw, url, esperado in casos:
        ctx, log, st = contexto(b, **kw); pg = ctx.new_page(); pg.goto(BASE + url); pg.wait_for_timeout(2300)
        v = evt(log, "visita")
        chk("fonte: " + nome + " → " + esperado, v and v[0].get("fonte") == esperado, v[:1])
        if "iPhone" in nome: chk("iPhone é detectado como 'ios'", v and v[0].get("dispositivo") == "ios")
        if "computador" in nome: chk("computador é detectado como 'computador'", v and v[0].get("dispositivo") == "computador")
        ctx.close()
    ctx, log, st = contexto(b); pg = ctx.new_page()
    pg.goto(BASE + "index.html", referer="https://l.instagram.com/?u=x"); pg.wait_for_timeout(2300)
    chk("fonte: vindo da página do Instagram (referer) → instagram", evt(log, "visita") and evt(log, "visita")[0].get("fonte") == "instagram", evt(log, "visita")[:1])
    ctx.close()

    print("== App instalado ==")
    ctx, log, st = contexto(b, ua=UA_IPHONE, standalone=True)
    pg = ctx.new_page(); pg.goto(BASE + "index.html"); pg.wait_for_timeout(2500)
    d = disp(log)
    chk("aberto como app: o aparelho diz origem=app e instalou=true", len(d) == 1 and d[0].get("origem") == "app" and d[0].get("instalou") is True, d)
    v = evt(log, "visita")
    chk("a visita também sai como 'app'", v and v[0].get("origem") == "app")
    ctx.close()
    ctx, log, st = contexto(b)
    pg = ctx.new_page(); pg.goto(BASE + "index.html"); pg.evaluate("window.dispatchEvent(new Event('appinstalled'))"); pg.wait_for_timeout(2500)
    d = disp(log)
    chk("evento 'appinstalled' (Android): instalou=true, no MESMO envio (não manda dois)", len(d) == 1 and d[0].get("instalou") is True and d[0].get("origem") == "site", d)
    ctx.close()

    print("== Aviso ativo e interesses ==")
    ctx, log, st = contexto(b)
    pg = ctx.new_page(); pg.goto(BASE + "index.html"); pg.wait_for_timeout(2400)
    d0 = len(disp(log))
    chk("antes de ativar não diz que tem aviso ativo", all(x.get("pushAtivo") in (None, False) for x in disp(log)), disp(log))
    pg.click("#btn-push-header"); pg.wait_for_timeout(400)
    pg.click("#tkp-janela .tkp-btn:has-text('Ativar avisos')"); pg.wait_for_timeout(2600)
    d = disp(log)
    chk("ao ativar os avisos o aparelho informa pushAtivo=true", d and d[-1].get("pushAtivo") is True, d[-1:] )
    pg.click("#btn-push-header"); pg.wait_for_timeout(600)
    pg.click("#tkp-janela .tkp-chip >> nth=1"); pg.wait_for_timeout(2600)
    d = disp(log)
    chk("escolher um interesse é informado (lista de chaves, sem texto livre)", d and d[-1].get("interesses") == ["infantil-menina"], d[-1:])
    pg.uncheck("#tkp-promo"); pg.wait_for_timeout(2600)
    d = disp(log)
    chk("desligar 'novidades e promoções' é informado (novidades=false)", d and d[-1].get("novidades") is False, d[-1:])
    antes = len(disp(log)); pg.wait_for_timeout(2500)
    chk("sem mudança, não envia de novo", len(disp(log)) == antes)
    pg.evaluate("window.__os.optedIn=false; window.__os.sub.forEach(function(f){f()})"); pg.wait_for_timeout(2600)
    chk("pausar os avisos é informado (pushAtivo=false)", disp(log)[-1].get("pushAtivo") is False, disp(log)[-1:])
    ctx.close()

    print("== Conta ==")
    ctx, log, st = contexto(b, sessao=True)
    pg = ctx.new_page(); pg.goto(BASE + "index.html"); pg.wait_for_timeout(2500)
    d = disp(log)
    chk("com login, o aparelho manda o TOKEN de sessão (tk2.…) e o número da conta", d and d[0].get("sessao") == "tk2.x.y" and d[0].get("whatsapp") == "88999999999", d[:1])
    chk("nunca manda senha nem nome", all("senha" not in x and "nome" not in x and "name" not in x for x in d))
    n = len(disp(log))
    pg.evaluate("limparSessao()"); pg.wait_for_timeout(2600)
    d = disp(log)
    chk("sair da conta avisa o servidor (logout=true), sem token", len(d) == n + 1 and d[-1].get("logout") is True and "sessao" not in d[-1], d[-1:])
    pg.evaluate("salvarSessao('88999999999','senha-antiga-sem-prefixo')"); pg.wait_for_timeout(2600)
    chk("sessão sem prefixo de token (senha) NUNCA é enviada", all(x.get("sessao") != "senha-antiga-sem-prefixo" for x in disp(log)))
    ctx.close()

    print("== Servidor antigo (sem a ação 'dispositivo') ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, user_agent=UA_ANDROID, service_workers="block")
    log = []; install(ctx, log=log, versao="3.3"); ctx.add_init_script(RAPIDO)
    pg = ctx.new_page(); er = []; pg.on("pageerror", lambda e: er.append(str(e)))
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2600)
    chk("com servidor antigo a loja abre normal e nenhum erro aparece", pg.locator(".card:not(.esqueleto)").count() > 0 and not er, er)
    ctx.close()
    b.close()

print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
