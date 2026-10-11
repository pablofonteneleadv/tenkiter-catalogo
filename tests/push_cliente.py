"""Avisos (push) e instalação do app no cliente (push.js + pwa.js, v3.4) — com um OneSignal FALSO que imita o SDK v16 de verdade
(init/login/logout/tags/alias/permissão/inscrição), para provar: o que pede permissão e QUANDO (só num toque), ligação do aparelho à conta,
etiquetas, pedidos acompanhados, convite, bloqueio, iPhone (precisa instalar), navegador de Instagram, app não configurado ('em-breve') e a seção
"Instale o app" no fim da página (Android com o aviso do navegador, iPhone com o menu Compartilhar, computador).
Entrega de verdade no celular NÃO dá para provar aqui: é o roteiro no aparelho do LEIA-ME-AVISOS.md."""
import sys, os, json
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
AXE = open(os.path.join(AQUI, 'axe.min.js')).read()
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});return r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,ex:v.nodes.slice(0,3).map(n=>n.target.join(' ')+' :: '+(n.failureSummary||'').split('\\n')[1])}))}")
    chk("axe — " + label, not r, "; ".join("%s×%d %s" % (v['id'], v['n'], v['ex'][:2]) for v in r))

UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; 23078PNDDG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
UA_IPHONE_ANTIGO = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1"
UA_INSTAGRAM = "Mozilla/5.0 (Linux; Android 14; 23078PNDDG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Instagram 330.0.0.38.90 Android"
UA_PC = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

# ---- OneSignal FALSO (mesma forma do SDK v16: fila OneSignalDeferred + objeto OneSignal)
SDK_FALSO = r"""
(function(){
  var S = window.__os = { calls: [], externalId: null, tags: {}, aliases: {}, optedIn: false, perm: [], sub: [], initOpts: null };
  function avisa(l){ l.forEach(function(f){ try{ f(); }catch(e){} }); }
  var OneSignal = {
    init: function(o){ S.initOpts = o; S.calls.push(['init']); return Promise.resolve(); },
    login: function(id){ S.externalId = id; S.calls.push(['login', id]); return Promise.resolve(); },
    logout: function(){ S.externalId = null; S.calls.push(['logout']); return Promise.resolve(); },
    User: {
      get externalId(){ return S.externalId; },
      addTag: function(k,v){ S.tags[k] = v; S.calls.push(['addTag', k, v]); }, addTags: function(t){ Object.assign(S.tags, t); S.calls.push(['addTags', t]); },
      removeTag: function(k){ delete S.tags[k]; S.calls.push(['removeTag', k]); },
      addAlias: function(l,v){ S.aliases[l] = v; S.calls.push(['addAlias', l]); }, removeAlias: function(l){ delete S.aliases[l]; S.calls.push(['removeAlias', l]); },
      PushSubscription: {
        get optedIn(){ return S.optedIn; },
        optIn: function(){ S.calls.push(['optIn']); S.optedIn = true; avisa(S.sub); return Promise.resolve(); },
        optOut: function(){ S.calls.push(['optOut']); S.optedIn = false; avisa(S.sub); return Promise.resolve(); },
        addEventListener: function(e,f){ S.sub.push(f); }
      }
    },
    Notifications: {
      requestPermission: function(){
        S.calls.push(['requestPermission', !!(navigator.userActivation && navigator.userActivation.isActive)]);
        window.__perm = window.__permAnswer || 'granted';
        if (window.__perm === 'granted') S.optedIn = true;
        avisa(S.perm); avisa(S.sub); return Promise.resolve();
      },
      addEventListener: function(e,f){ S.perm.push(f); }
    }
  };
  var fila = window.OneSignalDeferred || [];
  window.OneSignalDeferred = { push: function(fn){ return Promise.resolve().then(function(){ return fn(OneSignal); }); } };
  fila.forEach(function(fn){ window.OneSignalDeferred.push(fn); });
})();
"""

def ambiente(perm="default", standalone_ios=False, standalone_mm=False, share=False):
    js = "window.__perm=%s;window.__shares=[];" % json.dumps(perm)
    js += "try{Object.defineProperty(Notification,'permission',{get:function(){return window.__perm},configurable:true});Notification.requestPermission=function(){window.__perm=window.__permAnswer||'granted';return Promise.resolve(window.__perm)}}catch(e){}"
    if standalone_ios: js += "Object.defineProperty(navigator,'standalone',{value:true,configurable:true});"
    if standalone_mm: js += "(function(){var mm=window.matchMedia.bind(window);window.matchMedia=function(q){var m=mm(q);if(/display-mode:\\s*standalone/.test(q)){Object.defineProperty(m,'matches',{value:true});}return m;};})();"
    if share: js += "navigator.share=function(d){window.__shares.push(d);return Promise.resolve()};"
    return js

def novo_contexto(b, ua=UA_ANDROID, mobile=True, perm="default", configurado=True, sessao=False, versao="3.3", **amb):
    ctx = b.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1200, "height": 800}, is_mobile=mobile, has_touch=mobile,
                        user_agent=ua, service_workers="block")
    st = install(ctx, versao=versao)
    reqs = {"sdk": 0, "sync": 0}
    def sync(route):
        reqs["sync"] += 1
        corpo = ('x({"success":true,"app_id":"535f6b0d-c866-43c2-b241-43bd7ab62fae","features":{"restrict_origin":{"enable":true},"metrics":{"enable":true}},"config":{"origin":"https://tenkitermodas.com.br"}})'
                 if configurado else 'x({"success":false,"errors":["Please configure the Web platform for this app"]})')
        route.fulfill(body=corpo, content_type="application/javascript", headers={"Access-Control-Allow-Origin": "*"})
    def sdk(route):
        reqs["sdk"] += 1
        route.fulfill(body=SDK_FALSO, content_type="application/javascript")
    ctx.route("https://api.onesignal.com/**", sync)
    ctx.route("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js", sdk)
    ctx.add_init_script(ambiente(perm, **amb))
    if sessao: ctx.add_init_script(SESSION)
    return ctx, st, reqs

def pag(ctx, erros):
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); return pg
def os_(pg, expr): return pg.evaluate("()=>{const S=window.__os; return " + expr + "}")
def chamadas(pg, nome): return pg.evaluate("(n)=>(window.__os?window.__os.calls:[]).filter(c=>c[0]===n)", nome)
def resumo(pg): return pg.evaluate("window.TKPush.resumo()")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    erros = []

    # ======================================================================= A. Android/Chrome, sem conta
    print("== Android/Chrome, configurado, sem conta ==")
    ctx, st, reqs = novo_contexto(b)
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2300)
    e = pg.evaluate("window.TKPush.estado()")
    chk("o OneSignal só carrega depois de checar que o app está configurado", reqs["sync"] >= 1 and reqs["sdk"] == 1, reqs)
    chk("iniciou com o App ID e o service worker único do site", os_(pg, "S.initOpts && S.initOpts.appId") == "535f6b0d-c866-43c2-b241-43bd7ab62fae" and os_(pg, "S.initOpts.serviceWorkerPath") == "OneSignalSDKWorker.js", os_(pg, "S.initOpts"))
    chk("não liga o sininho/notifyButton do OneSignal (usamos o nosso)", os_(pg, "S.initOpts.notifyButton.enable") is False)
    chk("estado 'pendente' (ainda não pediu nada)", e["resumo"] == "pendente" and e["sdk"] == "pronto", e)
    chk("NUNCA pede permissão sozinho", chamadas(pg, "requestPermission") == [] and pg.evaluate("window.__perm") == "default")
    chk("sininho do topo aparece (🔕) quando dá para ativar", pg.locator("#btn-push-header").is_visible() and "🔕" in pg.inner_text("#btn-push-header"))
    chk("etiqueta de origem 'site' (sem 'tipo' porque não há conta)", os_(pg, "S.tags.origem") == "site" and os_(pg, "S.tags.tipo") is None, os_(pg, "S.tags"))
    chk("sem conta, não há login no OneSignal", chamadas(pg, "login") == [])

    pg.click("#btn-push-header"); pg.wait_for_timeout(500)
    chk("o sininho abre o CONVITE nosso (explica antes de pedir)", pg.locator("#tkp-janela.aberto").count() == 1 and "Ativar avisos" in pg.inner_text("#tkp-janela") and pg.evaluate("window.__perm") == "default")
    pg.wait_for_timeout(300)
    chk("convite: foco vai para dentro da janela e ela é um diálogo com nome", pg.evaluate("document.getElementById('tkp-janela').contains(document.activeElement)") and pg.evaluate("(()=>{const d=document.querySelector('#tkp-janela [role=dialog]');return !!d&&!!d.getAttribute('aria-labelledby')})()"), pg.evaluate("document.activeElement.tagName+'#'+document.activeElement.id+'.'+document.activeElement.className"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    chk("Esc fecha o convite", pg.locator("#tkp-janela.aberto").count() == 0)
    pg.click("#btn-push-header"); pg.wait_for_timeout(400)
    axe(pg, "convite de avisos")
    pg.click("#tkp-janela .tkp-btn:has-text('Ativar avisos')"); pg.wait_for_timeout(900)
    rp = chamadas(pg, "requestPermission")
    chk("a permissão é pedida UMA vez e DENTRO do toque da pessoa (userActivation)", len(rp) == 1 and rp[0][1] is True, rp)
    chk("ficou ativo: sininho 🔔 e estado 'ativo'", resumo(pg) == "ativo" and "🔔" in pg.inner_text("#btn-push-header"), resumo(pg))
    chk("aparece o aviso 'Avisos ativados neste aparelho'", pg.locator("#tkp-aviso").count() == 1 and "ativados" in pg.inner_text("#tkp-aviso"))

    pg.click("#btn-push-header"); pg.wait_for_timeout(700)
    chk("com avisos ligados o sininho abre 'Meus avisos' com preferências", "Meus avisos" in pg.inner_text("#tkp-janela") and pg.locator("#tkp-promo").is_checked())
    chk("interesses vêm da loja (pushconfig) como botões", pg.locator("#tkp-janela .tkp-chip").count() == 2, pg.inner_text("#tkp-janela")[:200])
    pg.click("#tkp-janela .tkp-chip >> nth=1"); pg.wait_for_timeout(300)
    chk("marcar interesse vira etiqueta int_<chave>=1", os_(pg, "S.tags['int_infantil-menina']") == "1" and pg.get_attribute("#tkp-janela .tkp-chip >> nth=1", "aria-pressed") == "true", os_(pg, "S.tags"))
    pg.click("#tkp-janela .tkp-chip >> nth=1"); pg.wait_for_timeout(300)
    chk("desmarcar remove a etiqueta", os_(pg, "S.tags['int_infantil-menina']") is None)
    pg.uncheck("#tkp-promo"); pg.wait_for_timeout(300)
    chk("desmarcar 'novidades e promoções' grava av_novidades=0 (a gestão respeita)", os_(pg, "S.tags.av_novidades") == "0", os_(pg, "S.tags"))
    pg.check("#tkp-promo"); pg.wait_for_timeout(300)
    chk("marcar de novo grava av_novidades=1", os_(pg, "S.tags.av_novidades") == "1")
    chk("'O aviso não aparece com o app fechado?' traz o passo 'Pausar atividade no app quando não usado'", "Pausar atividade no app quando não usado" in pg.inner_text("#tkp-janela details") or "Pausar atividade" in pg.evaluate("document.querySelector('#tkp-janela details').textContent"))
    chk("e as dicas de bateria e Xiaomi", "Sem restrições" in pg.evaluate("document.querySelector('#tkp-janela details').textContent") and "Início automático" in pg.evaluate("document.querySelector('#tkp-janela details').textContent"))
    axe(pg, "painel 'Meus avisos'")
    pg.click("#tkp-janela .tkp-btn:has-text('Desativar')"); pg.wait_for_timeout(600)
    chk("desativar chama optOut e o estado vira 'pausado'", chamadas(pg, "optOut") != [] and resumo(pg) == "pausado", resumo(pg))
    pg.click("#btn-push-header"); pg.wait_for_timeout(500)
    chk("pausado: o painel oferece 'Reativar avisos'", "Reativar avisos" in pg.inner_text("#tkp-janela"))
    pg.click("#tkp-janela .tkp-btn:has-text('Reativar avisos')"); pg.wait_for_timeout(800)
    chk("reativar volta a 'ativo' (optIn, sem pedir permissão de novo)", resumo(pg) == "ativo" and chamadas(pg, "optIn") != [] and len(chamadas(pg, "requestPermission")) == 1, resumo(pg))
    ctx.close()

    # ======================================================================= B. permissão bloqueada
    print("== Permissão bloqueada no Android ==")
    ctx, st, reqs = novo_contexto(b, perm="denied")
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2300)
    chk("estado 'negado'", resumo(pg) == "negado", resumo(pg))
    pg.click("#btn-push-header"); pg.wait_for_timeout(500)
    t = pg.inner_text("#tkp-janela")
    chk("explica que está bloqueado e ensina a liberar (inclui 'Pausar atividade no app')", "bloqueados" in t and "Pausar atividade no app quando não usado" in t and "Informações do app" in t, t[:300])
    chk("não tenta pedir permissão (o navegador não deixaria)", chamadas(pg, "requestPermission") == [])
    axe(pg, "ajuda: avisos bloqueados")
    pg.evaluate("window.__perm='granted'; window.__os.optedIn=false")
    pg.click("#tkp-janela .tkp-btn:has-text('Já liberei')"); pg.wait_for_timeout(900)
    chk("'Já liberei' confere de novo e, liberado, ativa", resumo(pg) == "ativo", resumo(pg))
    ctx.close()

    # ======================================================================= C. conta (equipe), login/logout, convite
    print("== Com conta: o aparelho se liga à pessoa ==")
    ctx, st, reqs = novo_contexto(b, sessao=True)
    log = []
    ctx2 = ctx
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2600)
    chk("pede o pushId ao servidor com o TOKEN (nunca senha) e faz login no OneSignal", chamadas(pg, "login") == [["login", "tkpush0000000000000000000000000"]], chamadas(pg, "login"))
    chk("etiqueta de tipo 'equipe' (a conta do exemplo tem permissões de equipe)", os_(pg, "S.tags.tipo") == "equipe", os_(pg, "S.tags"))
    pg.wait_for_timeout(3600)
    chk("equipe no navegador recebe UM convite automático (cliente comum não)", pg.locator("#tkp-janela.aberto").count() == 1 and "pedidos e os avisos da equipe" in pg.inner_text("#tkp-janela"), pg.inner_text("#tkp-janela") if pg.locator("#tkp-janela").count() else "sem janela")
    chk("o convite automático ainda NÃO pediu permissão", chamadas(pg, "requestPermission") == [])
    pg.click("#tkp-janela .tkp-btn:has-text('Não quero receber')"); pg.wait_for_timeout(300)
    conv = pg.evaluate("JSON.parse(localStorage.getItem('tk_push_convite_v1'))")
    chk("'Não quero receber' grava nunca=true e conta 1 convite", conv.get("nunca") is True and conv.get("n") == 1, conv)
    pg.reload(); pg.wait_for_timeout(6500)
    chk("depois do 'não quero', não convida mais", pg.locator("#tkp-janela.aberto").count() == 0)
    # sair da conta -> logout
    pg.evaluate("localStorage.removeItem('tm_session'); window.dispatchEvent(new Event('tk:sessao'))"); pg.wait_for_timeout(800)
    chk("sair da conta desliga o aparelho da pessoa (logout no OneSignal)", chamadas(pg, "logout") != [] and os_(pg, "S.externalId") is None, chamadas(pg, "logout"))
    pg.evaluate("localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999999999',sessao:'tk2.x.y'})); window.dispatchEvent(new Event('tk:sessao'))"); pg.wait_for_timeout(900)
    chk("entrar de novo religa (login com o mesmo pushId)", os_(pg, "S.externalId") == "tkpush0000000000000000000000000")
    ctx.close()

    # ======================================================================= D. pedido: acompanhar pelo aparelho
    print("== Pedido: aparelho acompanha o pedido ==")
    ctx, st, reqs = novo_contexto(b)
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2300)
    D = ".card:not(.esqueleto):has(.ac-sacola)"
    pg.locator(D).first.locator(".ac-sacola").click(); pg.click("#btn-sacola-header"); pg.wait_for_timeout(500)
    pg.fill("#ped-nome", "Maria Souza"); pg.fill("#ped-whats", "88 99876-5432"); pg.click("#btn-enviar-sacola"); pg.wait_for_timeout(1300)
    chk("tela de pedido enviado oferece 'avisar quando o pedido mudar'", pg.locator("#pedido-ok").count() == 1 and pg.locator("#tkp-avisar-pedido").is_visible(), pg.inner_text("#pedido-ok")[:200] if pg.locator("#pedido-ok").count() else "")
    chk("a chave do pedido (pushKey) fica guardada só como chave opaca, sem telefone/nome", "pk0000" in (pg.evaluate("localStorage.getItem('tk_push_pedidos_v1')") or "") and "Maria" not in (pg.evaluate("localStorage.getItem('tk_push_pedidos_v1')") or "") and "9876" not in (pg.evaluate("localStorage.getItem('tk_push_pedidos_v1')") or ""))
    axe(pg, "pedido enviado com o bloco de avisos")
    pg.click("#tkp-avisar-pedido"); pg.wait_for_timeout(1000)
    rp = chamadas(pg, "requestPermission")
    chk("tocar em 'Avisar quando o pedido mudar' pede a permissão num toque", len(rp) == 1 and rp[0][1] is True, rp)
    chk("e liga o aparelho ao pedido (apelido ped_0001 com a chave)", os_(pg, "S.aliases.ped_0001") == "pk0000000000000000000000000001", os_(pg, "S.aliases"))
    chk("o bloco passa a dizer 'Avisos ligados'", "Avisos ligados" in pg.inner_text("#tkp-bloco-pedido"), pg.inner_text("#tkp-bloco-pedido"))
    # acompanhar pedido (código + 4 últimos números) também liga
    pg.click("#btn-continuar"); pg.wait_for_timeout(300)
    pg.evaluate("localStorage.removeItem('tk_push_pedidos_v1')")
    pg.click("#rod-rastrear"); pg.wait_for_timeout(500)
    pg.fill("#rast-codigo", "PED-0001"); pg.fill("#rast-final", "5432"); pg.click("#btn-consultar"); pg.wait_for_timeout(1100)
    chk("em 'Acompanhar pedido' o aparelho também é ligado ao pedido", os_(pg, "S.aliases.ped_0001") == "pk0000000000000000000000000001" and "Avisos ligados" in pg.inner_text("#overlay-rastreio"), os_(pg, "S.aliases"))
    # mais de 5 pedidos: tira o mais antigo
    pg.evaluate("for (let i=2;i<=7;i++) TKPush.pedidoCriado('PED-000'+i,'pk'+i)"); pg.wait_for_timeout(300)
    n = pg.evaluate("JSON.parse(localStorage.getItem('tk_push_pedidos_v1')).length")
    chk("guarda no máximo 5 pedidos por aparelho e remove o apelido do mais antigo", n == 5 and any(c[1] == "ped_0001" or c[1] == "ped_0002" for c in chamadas(pg, "removeAlias")), (n, chamadas(pg, "removeAlias")))
    ctx.close()

    # ======================================================================= E. OneSignal NÃO configurado
    print("== OneSignal sem a plataforma Web (estado real de hoje) ==")
    ctx, st, reqs = novo_contexto(b, configurado=False)
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2300)
    chk("estado 'em-breve' e o SDK nem é baixado", resumo(pg) == "em-breve" and reqs["sdk"] == 0, (resumo(pg), reqs))
    chk("sem promessa falsa: sininho escondido", pg.locator("#btn-push-header").is_hidden())
    chk("sem pedir permissão", pg.evaluate("window.__perm") == "default")
    pg.evaluate("document.getElementById('instalar-app').scrollIntoView()")
    chk("a seção de instalar continua funcionando e esconde a linha de avisos", pg.locator("#instalar-app").is_visible() and pg.locator("#inst-avisos").is_hidden())
    ctx.close()

    # ======================================================================= F. iPhone no Safari
    print("== iPhone no Safari (sem instalar) ==")
    ctx, st, reqs = novo_contexto(b, ua=UA_IPHONE, share=True)
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2300)
    chk("estado 'ios-instalar' e o SDK nem é baixado", resumo(pg) == "ios-instalar" and reqs["sdk"] == 0, (resumo(pg), reqs))
    pg.click("#btn-push-header"); pg.wait_for_timeout(500)
    t = pg.inner_text("#tkp-janela")
    chk("sininho explica: no iPhone, primeiro instale (Compartilhar → Adicionar à Tela de Início, iOS 16.4)", "primeiro instale" in t and "Adicionar à Tela de Início" in t and "16.4" in t, t[:300])
    pg.click("#tkp-janela .tkp-x"); pg.wait_for_timeout(300)
    pg.evaluate("document.getElementById('instalar-app').scrollIntoView()"); pg.wait_for_timeout(300)
    chk("seção 'Instale o app' fica ABAIXO DE TUDO (dentro do rodapé, depois dos links)", pg.evaluate("""()=>{const s=document.getElementById('instalar-app'), f=document.querySelector('footer.rodape'); const l=document.getElementById('rod-rastrear');
        return f.contains(s) && (l.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) && !!f && f.getBoundingClientRect().bottom >= s.getBoundingClientRect().bottom - 1 }"""))
    chk("cartão do iPhone marcado 'Seu aparelho' e com os 4 passos sempre à vista", pg.locator("#inst-ios .inst-seu").is_visible() and pg.locator("#inst-ios-passos li").count() == 4 and pg.locator("#inst-ios-passos").is_visible())
    chk("cartão do Android continua visível para quem está no iPhone ver os dois", pg.locator("#inst-android").is_visible() and pg.locator("#inst-android .inst-seu").is_hidden())
    chk("botão 'Abrir o menu Compartilhar' aparece no iPhone", pg.locator("#btn-inst-ios").is_visible())
    pg.click("#btn-inst-ios"); pg.wait_for_timeout(400)
    sh = pg.evaluate("window.__shares")
    chk("o botão abre o menu Compartilhar (navigator.share) com o endereço do site", len(sh) == 1 and sh[0].get("url", "").endswith("/") and "Adicionar à Tela de Início" in pg.inner_text("#inst-msg"), (sh, pg.inner_text("#inst-msg")))
    axe(pg, "rodapé com 'Instale o app' (iPhone no Safari)")
    ctx.close()

    print("== iPhone antigo (iOS 15) ==")
    ctx, st, reqs = novo_contexto(b, ua=UA_IPHONE_ANTIGO)
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2000)
    pg.click("#btn-push-header"); pg.wait_for_timeout(400)
    chk("estado 'ios-antigo' com explicação de atualizar o iOS", resumo(pg) == "ios-antigo" and "iOS 16.4" in pg.inner_text("#tkp-janela"), resumo(pg))
    ctx.close()

    print("== iPhone com o app instalado (aberto pelo ícone) ==")
    ctx, st, reqs = novo_contexto(b, ua=UA_IPHONE, standalone_ios=True, share=True)
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2300)
    chk("no app instalado do iPhone o SDK carrega e o estado é 'pendente'", reqs["sdk"] == 1 and resumo(pg) == "pendente", (reqs, resumo(pg)))
    chk("origem 'app' na etiqueta", os_(pg, "S.tags.origem") == "app", os_(pg, "S.tags"))
    pg.wait_for_timeout(1500)
    chk("convida a ativar (UMA janela nossa) sem pedir a permissão sozinho", pg.locator("#tkp-janela.aberto").count() == 1 and chamadas(pg, "requestPermission") == [])
    pg.click("#tkp-janela .tkp-btn:has-text('Ativar avisos')"); pg.wait_for_timeout(900)
    rp = chamadas(pg, "requestPermission")
    chk("no iPhone a permissão também sai de um toque", len(rp) == 1 and rp[0][1] is True and resumo(pg) == "ativo", (rp, resumo(pg)))
    pg.evaluate("document.getElementById('instalar-app').scrollIntoView()")
    chk("seção de instalar diz que já está usando o app e esconde o botão de compartilhar", "já está usando o app" in pg.inner_text("#inst-ios-txt") and pg.locator("#btn-inst-ios").is_hidden())
    ctx.close()

    # ======================================================================= G. navegador de Instagram / WhatsApp
    print("== Navegador embutido (Instagram) ==")
    ctx, st, reqs = novo_contexto(b, ua=UA_INSTAGRAM)
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2000)
    chk("estado 'embutido' e o SDK não é baixado", resumo(pg) == "embutido" and reqs["sdk"] == 0, (resumo(pg), reqs))
    pg.click("#btn-push-header"); pg.wait_for_timeout(400)
    chk("explica: abra no Chrome (⋯ → Abrir no navegador) e oferece copiar o endereço", "Abrir no navegador" in pg.inner_text("#tkp-janela") and pg.locator("#tkp-janela .tkp-btn:has-text('Copiar o endereço')").count() == 1)
    pg.click("#tkp-janela .tkp-x"); pg.wait_for_timeout(200)
    pg.evaluate("document.getElementById('instalar-app').scrollIntoView()")
    chk("na seção de instalar, o Android pede para abrir no Chrome e oferece copiar o endereço", "Abra o site no Chrome" in pg.inner_text("#inst-android-txt") and pg.locator("#btn-inst-android").is_visible() and "Copiar" in pg.inner_text("#btn-inst-android"), pg.inner_text("#inst-android-txt"))
    ctx.close()

    # ======================================================================= H. instalar no Android
    print("== Instalar no Android (aviso do navegador beforeinstallprompt) ==")
    ctx, st, reqs = novo_contexto(b)
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2300)
    pg.evaluate("document.getElementById('instalar-app').scrollIntoView()")
    chk("antes do aviso do navegador: mostra o passo a passo do Chrome (sem botão falso)", pg.locator("#inst-android-passos").is_visible() and pg.locator("#btn-inst-android").is_hidden() and pg.locator("#btn-instalar").is_hidden())
    chk("cartão do Android marcado 'Seu aparelho'", pg.locator("#inst-android .inst-seu").is_visible())
    pg.evaluate("""()=>{ window.__inst={prompts:0,ativo:[]}; const e=new Event('beforeinstallprompt',{cancelable:true});
        e.prompt=function(){ window.__inst.prompts++; window.__inst.ativo.push(!!(navigator.userActivation&&navigator.userActivation.isActive)); return Promise.resolve() };
        e.userChoice=Promise.resolve({outcome:'accepted',platform:'web'}); window.dispatchEvent(e); }""")
    pg.wait_for_timeout(400)
    chk("com o aviso do navegador aparece o botão 'Instalar no Android' (e o do rodapé)", pg.locator("#btn-inst-android").is_visible() and "Instalar no Android" in pg.inner_text("#btn-inst-android") and pg.locator("#btn-instalar").is_visible() and pg.locator("#inst-android-passos").is_hidden())
    axe(pg, "seção instalar com botão (Android)")
    pg.click("#btn-inst-android"); pg.wait_for_timeout(500)
    chk("o toque abre a janela de instalar do navegador (prompt dentro do toque)", pg.evaluate("window.__inst") == {"prompts": 1, "ativo": [True]}, pg.evaluate("window.__inst"))
    chk("mensagem de instalando", "Instalando" in pg.inner_text("#inst-msg"), pg.inner_text("#inst-msg"))
    pg.evaluate("window.dispatchEvent(new Event('appinstalled'))"); pg.wait_for_timeout(1200)
    chk("depois de instalado: mensagem de sucesso e o botão some", "App instalado" in pg.inner_text("#inst-msg") and pg.locator("#btn-inst-android").is_hidden() and pg.locator("#btn-instalar").is_hidden())
    chk("e CONVIDA a ativar os avisos na hora ('App instalado! Ative os avisos')", pg.locator("#tkp-janela.aberto").count() == 1 and "App instalado" in pg.inner_text("#tkp-janela"), pg.inner_text("#tkp-janela") if pg.locator("#tkp-janela").count() else "sem janela")
    chk("a permissão só foi pedida depois do toque no convite", chamadas(pg, "requestPermission") == [])
    pg.click("#tkp-janela .tkp-btn:has-text('Ativar avisos')"); pg.wait_for_timeout(900)
    chk("toque no convite → permissão pedida num toque → ativo", resumo(pg) == "ativo" and chamadas(pg, "requestPermission")[0][1] is True)
    pg.reload(); pg.wait_for_timeout(2000)
    pg.evaluate("document.getElementById('instalar-app').scrollIntoView()")
    chk("recarregando depois de instalar: a página lembra que o app já está instalado", "já está instalado" in pg.inner_text("#inst-android-txt"), pg.inner_text("#inst-android-txt"))
    ctx.close()

    print("== Android com o app instalado (aberto pelo ícone) ==")
    ctx, st, reqs = novo_contexto(b, standalone_mm=True)
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2300)
    chk("origem 'app' e SDK carregado", os_(pg, "S.tags.origem") == "app" and reqs["sdk"] == 1, os_(pg, "S.tags"))
    pg.wait_for_timeout(1500)
    chk("abrir o app instalado convida a ativar os avisos", pg.locator("#tkp-janela.aberto").count() == 1)
    pg.click("#tkp-janela .tkp-btn:has-text('Agora não')"); pg.wait_for_timeout(300)
    pg.evaluate("document.getElementById('instalar-app').scrollIntoView()")
    chk("a seção de instalar diz 'Você já está usando o app' e oferece 'Ativar avisos'", "já está usando o app" in pg.inner_text("#inst-android-txt") and pg.locator("#inst-avisos").is_visible() and "Ativar avisos" in pg.inner_text("#btn-inst-avisos"), pg.inner_text("#inst-avisos") if pg.locator("#inst-avisos").count() else "")
    pg.click("#btn-inst-avisos"); pg.wait_for_timeout(900)
    chk("o botão da seção ativa os avisos (toque)", resumo(pg) == "ativo" and chamadas(pg, "requestPermission")[0][1] is True)
    chk("e passa a oferecer 'Ajustar avisos'", "Ajustar avisos" in pg.inner_text("#btn-inst-avisos"), pg.inner_text("#btn-inst-avisos"))
    ctx.close()

    # ======================================================================= I. computador
    print("== Computador (Chrome) ==")
    ctx, st, reqs = novo_contexto(b, ua=UA_PC, mobile=False)
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2300)
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); pg.wait_for_timeout(300)
    chk("no computador nenhum cartão é marcado 'Seu aparelho' e a dica fala de Chrome/Edge", pg.locator(".inst-seu:visible").count() == 0 and "Chrome ou Edge" in pg.inner_text("#inst-android-txt"), pg.inner_text("#inst-android-txt"))
    axe(pg, "seção instalar no computador")
    ctx.close()

    # ======================================================================= J. outras páginas carregam o push sem quebrar
    print("== admin e treinamentos ==")
    ctx, st, reqs = novo_contexto(b, sessao=True)
    pg = pag(ctx, erros)
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2800)
    chk("admin: TKPush existe e liga a conta ao OneSignal", pg.evaluate("typeof window.TKPush") == "object" and os_(pg, "S.externalId") == "tkpush0000000000000000000000000", os_(pg, "S.externalId"))
    pg.goto(BASE + "treinamentos.html"); pg.wait_for_timeout(2800)
    chk("treinamentos: TKPush existe (precisa do common.js) e liga a conta", pg.evaluate("typeof window.TKPush") == "object" and os_(pg, "S.externalId") == "tkpush0000000000000000000000000", os_(pg, "S.externalId"))
    ctx.close()

    chk("nenhum erro de JavaScript em nenhuma tela", not erros, erros[:4])
    b.close()

print("\nFALHAS=%d %s" % (len(BAD), BAD))
sys.exit(1 if BAD else 0)
