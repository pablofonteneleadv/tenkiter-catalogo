"""Conexões do Admin total (admin-conexoes.js, v3.4/v3.5): guardar a chave do Render / token da Cloudflare / chave da organização do OneSignal NO SERVIDOR,
situação (feed, mapa, regras do Render, OneSignal, Worker), criar as regras que faltam, publicar o site agora e acompanhar, "Ligar os avisos agora" (OneSignal),
endereços prontos para a Meta/Google. A chave nunca fica na tela nem no aparelho. Só Admin total e só com backend 3.4+ (OneSignal: 3.5). Apps Script simulado (mock.py)."""
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
DIALOGOS = []
def dialogo(d):
    DIALOGOS.append((d.type, d.message)); d.accept()
CHAVE_R = "rnd_SEGREDOSEGREDOSEGREDO7788"
CHAVE_C = "cfut_SEGREDODACLOUDFLARE0123456789ab"
CHAVE_O = "os_v2_org_SEGREDODAORGANIZACAOFALSA0123456789xyz"     # inventada: o repositório é público, nunca usar chave real em teste
ORG_ID = "b0b0b0b0-1111-4222-8333-444444444444"
POLL = "window.TK_CONEXOES_POLL_MS=250;"

def pagina(ctx, erros):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", dialogo)
    return pg
def abrir_ferramentas(pg):
    if pg.locator("#details-ferramentas[open]").count() == 0:
        pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
def abrir(pg):
    abrir_ferramentas(pg)
    pg.click("#btn-abrir-conexoes"); pg.wait_for_timeout(1500)
def corpo(pg): return pg.inner_text("#cx-corpo")
def novo_contexto(b, perms=PERMS_ALL, versao="3.4", log=None):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script(POLL)
    st = install(ctx, perms=perms, log=log, versao=versao)
    return ctx, st

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    log = []
    ctx, st = novo_contexto(b, log=log)
    erros = []
    pg = pagina(ctx, erros)
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)

    print("== Quem vê o botão ==")
    abrir_ferramentas(pg)
    chk("Admin total com backend 3.4 vê o botão 🔗 Conexões", pg.locator("#btn-abrir-conexoes").is_visible())
    c2, _ = novo_contexto(b, perms=[x for x in PERMS_ALL if x != "gerir_acessos"])
    p2 = pagina(c2, erros); p2.goto(BASE + "admin.html"); p2.wait_for_timeout(2600); abrir_ferramentas(p2)
    chk("Funcionária (sem gerir_acessos) NÃO vê o botão", not p2.locator("#btn-abrir-conexoes").is_visible())
    c3, _ = novo_contexto(b, versao="3.3")
    p3 = pagina(c3, erros); p3.goto(BASE + "admin.html"); p3.wait_for_timeout(2600); abrir_ferramentas(p3)
    chk("Com o backend 3.3 (sem a bandeira) o botão não aparece e o painel segue igual", not p3.locator("#btn-abrir-conexoes").is_visible() and p3.locator("#btn-abrir-push").is_visible())
    c2.close(); c3.close()

    print("== Abrir ==")
    abrir(pg)
    chk("a janela abre com título e fecha por ✕", pg.locator("#overlay-conexoes.aberto").count() == 1 and "Conexões" in pg.inner_text("#cx-titulo"))
    t = corpo(pg)
    chk("explica que a chave fica no servidor e nunca volta", "nunca voltam para esta tela" in t and "Propriedades do Script" in t, t[:200])
    chk("blocos: Situação, Publicar, Render, Cloudflare e Endereços", all(x in t for x in ["Situação agora", "Publicar o site agora", "Render — chave da API", "Cloudflare — token", "Endereços para a Meta e o Google"]))
    chk("avisa que a chave do Render manda na conta inteira", "toda a sua conta do Render" in t)
    chk("sem chave: 'Sem chave guardada.' nos dois", t.count("Sem chave guardada.") >= 2, t.count("Sem chave guardada."))
    chk("campos de chave são do tipo senha, sem preenchimento automático", pg.eval_on_selector_all("input[id^=cx-chave-]", "e=>e.every(i=>i.type==='password' && i.autocomplete==='new-password' && i.value==='')"))
    chk("cada campo tem rótulo ligado (for)", pg.eval_on_selector_all("input[id^=cx-chave-]", "e=>e.every(i=>document.querySelector('label[for='+i.id+']'))"))
    itens = pg.inner_text("#cx-itens")
    chk("situação mostra o feed/mapa fora do ar e o OneSignal", "feed.csv" in itens and "Atenção." in itens and "OneSignal" in itens, itens[:300])
    chk("há UM botão 'Guardar a chave do Render' (os itens do feed só explicam) e o da Cloudflare", pg.locator("#cx-itens button:has-text('Guardar a chave do Render')").count() == 1 and pg.locator("#cx-itens button:has-text('Guardar o token da Cloudflare')").count() == 1, pg.locator("#cx-itens button").all_inner_texts())
    chk("o botão do item leva o foco ao campo da chave", (pg.click("#cx-itens button:has-text('Guardar a chave do Render')") or True) and pg.evaluate("document.activeElement.id") == "cx-chave-render")
    chk("endereços no domínio da loja", pg.input_value("#cx-end-csv") == "https://tenkitermodas.com.br/feed.csv" and pg.input_value("#cx-end-xml") == "https://tenkitermodas.com.br/feed.xml" and pg.input_value("#cx-end-map") == "https://tenkitermodas.com.br/sitemap.xml")
    chk("nada de JSON cru na tela", "{" not in corpo(pg) and "}" not in corpo(pg))
    chk("sem rolagem horizontal no celular", pg.evaluate("(()=>{const e=document.querySelector('#cx-corpo');return e.scrollWidth<=e.clientWidth+1})()"))
    axe(pg, "Conexões — sem chaves")

    print("== Guardar a chave do Render ==")
    pg.click("[data-cx=guardar][data-nome=render]"); pg.wait_for_timeout(300)
    chk("sem colar nada: pede para colar e não chama o servidor", "Cole a chave" in pg.inner_text("#cx-msg-render") and not any(x.get("action") == "salvarConexao" for x in log))
    pg.fill("#cx-chave-render", "curta"); pg.click("[data-cx=guardar][data-nome=render]"); pg.wait_for_timeout(700)
    chk("chave incompleta vira frase de erro e nada é guardado", "incompleta" in pg.inner_text("#cx-msg-render") and not st["conex"]["render"]["temChave"], pg.inner_text("#cx-msg-render"))
    pg.fill("#cx-chave-render", "rnd_RECUSADARECUSADARECUSADA"); pg.click("[data-cx=guardar][data-nome=render]"); pg.wait_for_timeout(700)
    chk("chave que o Render recusa: 'Não guardei' e nada é guardado", "Não guardei" in pg.inner_text("#cx-msg-render") and not st["conex"]["render"]["temChave"], pg.inner_text("#cx-msg-render"))
    chk("o campo é limpo mesmo quando dá erro (a chave não fica na tela)", pg.input_value("#cx-chave-render") == "")
    pg.fill("#cx-chave-render", "  " + CHAVE_R + " "); pg.click("[data-cx=guardar][data-nome=render]"); pg.wait_for_timeout(1500)
    chk("chave certa: o servidor recebeu a chave limpa e guardou", st["chave_enviada"] == CHAVE_R and st["conex"]["render"]["temChave"])
    chk("mostra 'Guardada' e que enxerga o site", "✔ Guardada" in pg.inner_text("#cx-msg-render") and "tenkiter-catalogo" in pg.inner_text("#cx-msg-render"), pg.inner_text("#cx-msg-render"))
    chk("estado mostra só o final da chave (7788)", "termina em 7788" in pg.inner_text("#cx-estado-render"), pg.inner_text("#cx-estado-render"))
    html = pg.content(); store = pg.evaluate("JSON.stringify([localStorage, sessionStorage])") + json.dumps(pg.context.cookies())
    chk("a chave inteira NÃO está no HTML, nem no localStorage/sessionStorage/cookies", CHAVE_R not in html and CHAVE_R not in store and "SEGREDOSEGREDO" not in html + store)
    chk("o campo continua vazio e agora diz 'Trocar a chave' e oferece apagar", pg.input_value("#cx-chave-render") == "" and pg.locator("label[for=cx-chave-render]").inner_text() == "Trocar a chave" and pg.locator("[data-cx=apagar][data-nome=render]").count() == 1)

    print("== Situação com a chave: regras que faltam ==")
    pg.wait_for_timeout(600)
    itens = pg.inner_text("#cx-itens")
    chk("aparece 'Regras do Render' com o que falta e o botão de criar", "Faltam: /feed.csv, /feed.xml, /sitemap.xml" in itens and pg.locator("#cx-itens button:has-text('Criar as regras que faltam')").count() >= 1, itens[:400])
    pg.locator("#cx-itens button:has-text('Criar as regras que faltam')").first.click(); pg.wait_for_timeout(900)
    chk("criar regras: diz quais criou", "Criei 3 regra(s): /feed.csv, /feed.xml, /sitemap.xml" in pg.inner_text("#cx-msg-itens"), pg.inner_text("#cx-msg-itens"))
    pg.wait_for_timeout(5200)
    itens = pg.inner_text("#cx-itens")
    chk("depois de conferir de novo tudo do site fica certo (feed, mapa, regras)", "Faltam" not in itens and itens.count("Tudo certo.") >= 6 and "Atenção." not in itens, itens[:500])
    axe(pg, "Conexões — com a chave do Render e tudo certo")

    print("== Publicar o site agora ==")
    pg.click("#cx-deploy"); pg.wait_for_timeout(500)
    chk("clicar publica: botão trava e mostra 'Publicando'", pg.locator("#cx-deploy").is_disabled() and "Publicando" in pg.inner_text("#cx-msg-deploy"), pg.inner_text("#cx-msg-deploy"))
    pg.wait_for_timeout(3500)
    chk("quando o Render diz 'live' mostra '✔ No ar' e destrava o botão", "No ar" in pg.inner_text("#cx-msg-deploy") and pg.locator("#cx-deploy").is_enabled(), pg.inner_text("#cx-msg-deploy"))
    chk("o servidor recebeu o pedido de publicar uma vez", st["deploys"] == 1, st["deploys"])
    st["deploy_falha"] = True
    pg.click("#cx-deploy"); pg.wait_for_timeout(3000)
    chk("deploy que falha vira frase com o motivo e destrava o botão", "build_failed" in pg.inner_text("#cx-msg-deploy") and pg.locator("#cx-deploy").is_enabled(), pg.inner_text("#cx-msg-deploy"))
    st["deploy_falha"] = False

    print("== Cloudflare ==")
    pg.fill("#cx-chave-cloudflare", CHAVE_C); pg.click("[data-cx=guardar][data-nome=cloudflare]"); pg.wait_for_timeout(1800)
    chk("token da Cloudflare guardado (termina em 89ab) e o Worker aparece na situação", "termina em 89ab" in pg.inner_text("#cx-estado-cloudflare") and "Publicado em 10/10/2026 22:36" in pg.inner_text("#cx-itens"), pg.inner_text("#cx-itens")[:300])
    chk("o token também não está no HTML nem no armazenamento do aparelho", CHAVE_C not in pg.content() and CHAVE_C not in pg.evaluate("JSON.stringify([localStorage, sessionStorage])"))

    print("== Apagar a chave ==")
    DIALOGOS.clear()
    pg.click("[data-cx=apagar][data-nome=render]"); pg.wait_for_timeout(1500)
    chk("apagar pede confirmação e remove do servidor", any(t == "confirm" and "Apagar a chave" in m for t, m in DIALOGOS) and st.get("apagou") == "render" and not st["conex"]["render"]["temChave"], DIALOGOS)
    chk("a tela volta a 'Sem chave guardada.' e o botão de apagar some", "Sem chave guardada." in pg.inner_text("#cx-estado-render") and pg.locator("[data-cx=apagar][data-nome=render]").count() == 0)
    pg.fill("#cx-chave-render", CHAVE_R); pg.click("[data-cx=guardar][data-nome=render]"); pg.wait_for_timeout(1200)
    DIALOGOS.clear()
    pg.click("[data-cx=copiar][data-alvo=cx-end-csv]"); pg.wait_for_timeout(700)
    chk("sem permissão de área de transferência, 'Copiar' abre a caixa para copiar à mão (nunca falha calado)", any(t == "prompt" and "Copie o endereço" in m for t, m in DIALOGOS), (pg.inner_text("#cx-msg-itens"), DIALOGOS))
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE.split("/", 3)[0] + "//" + BASE.split("/", 3)[2])
    pg.click("[data-cx=copiar][data-alvo=cx-end-map]"); pg.wait_for_timeout(600)
    chk("com permissão, 'Copiar' copia o endereço certo e avisa", "Copiado!" in pg.inner_text("#cx-msg-itens") and pg.evaluate("navigator.clipboard.readText()") == "https://tenkitermodas.com.br/sitemap.xml", pg.inner_text("#cx-msg-itens"))

    print("== Teclado e janela ==")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    chk("Esc fecha a janela", pg.locator("#overlay-conexoes.aberto").count() == 0)
    abrir(pg)
    foco_dentro = pg.evaluate("document.querySelector('#overlay-conexoes').contains(document.activeElement)")
    for _ in range(40): pg.keyboard.press("Tab")
    chk("Tab não escapa da janela (foco preso)", pg.evaluate("document.querySelector('#overlay-conexoes').contains(document.activeElement)") and foco_dentro is not None)
    pg.click("#cx-fechar"); pg.wait_for_timeout(400)
    chk("✕ fecha a janela", pg.locator("#overlay-conexoes.aberto").count() == 0)


    print("== OneSignal (backend 3.5) ==")
    chk("com o backend 3.4 o bloco OneSignal não aparece (painel segue igual)", pg.locator("#cx-bloco-onesignal").count() == 0)
    log5 = []
    c5, st5 = novo_contexto(b, versao="3.5", log=log5)
    st5["pushcfg"]["web"] = False; st5["pushcfg"]["chave"] = False
    p5 = pagina(c5, erros); p5.goto(BASE + "admin.html"); p5.wait_for_timeout(2600)
    abrir(p5)
    t5 = corpo(p5)
    chk("bloco OneSignal aparece com a explicação de onde criar a chave e o aviso 'todos os apps'", "OneSignal — avisos (notificações)" in t5 and "Keys & IDs" in t5 and "todos os apps" in t5 and "Nunca cole essa chave em conversa" in t5, t5[:300])
    chk("campos: Organization ID (texto, com rótulo) e chave (senha, sem preenchimento automático, com rótulo)", p5.eval_on_selector("#cx-org-onesignal", "i=>i.type==='text' && !!document.querySelector('label[for=cx-org-onesignal]')") and p5.eval_on_selector("#cx-chave-onesignal", "i=>i.type==='password' && i.autocomplete==='new-password' && i.value==='' && !!document.querySelector('label[for=cx-chave-onesignal]')"))
    chk("sem chave: não há botão 'Ligar os avisos agora' no bloco (só aviso para guardar antes)", p5.locator("#cx-ligar-avisos").count() == 0 and "Guarde a chave acima" in t5)
    it5 = p5.inner_text("#cx-itens")
    chk("situação: avisos desligados (Atenção) e item da chave do OneSignal com UM botão para guardar", "Avisos (OneSignal, plataforma Web)" in it5 and "Atenção." in it5 and p5.locator("#cx-itens button:has-text('Guardar a chave do OneSignal')").count() == 1 and p5.locator("#cx-itens button:has-text('Ligar os avisos agora')").count() == 0, p5.locator("#cx-itens button").all_inner_texts())
    axe(p5, "Conexões — bloco OneSignal sem chave")
    p5.fill("#cx-chave-onesignal", CHAVE_O); p5.click("[data-cx=guardar][data-nome=onesignal]"); p5.wait_for_timeout(500)
    chk("sem o Organization ID: pede o código e NÃO chama o servidor", "Organization ID" in p5.inner_text("#cx-msg-onesignal") and not any(x.get("action") == "salvarConexao" for x in log5), p5.inner_text("#cx-msg-onesignal"))
    p5.fill("#cx-org-onesignal", "  " + ORG_ID + " "); p5.fill("#cx-chave-onesignal", "  " + CHAVE_O + " "); p5.click("[data-cx=guardar][data-nome=onesignal]"); p5.wait_for_timeout(1800)
    chk("o servidor recebeu a chave limpa e o código, e guardou", st5["chave_enviada"] == CHAVE_O and st5["org_enviado"] == ORG_ID and st5["conex"]["onesignal"]["temChave"], (st5.get("chave_enviada"), st5.get("org_enviado")))
    chk("mostra 'Guardada' e a próxima ação; o código (público) continua no campo e a chave NÃO", "✔ Guardada" in p5.inner_text("#cx-msg-onesignal") and "Ligar os avisos agora" in p5.inner_text("#cx-msg-onesignal") and p5.input_value("#cx-org-onesignal") == ORG_ID and p5.input_value("#cx-chave-onesignal") == "", p5.inner_text("#cx-msg-onesignal"))
    chk("estado mostra só o final da chave (xyz) e o botão de apagar", "termina em 9xyz" in p5.inner_text("#cx-estado-onesignal") and p5.locator("[data-cx=apagar][data-nome=onesignal]").count() == 1, p5.inner_text("#cx-estado-onesignal"))
    h5 = p5.content(); store5 = p5.evaluate("JSON.stringify([localStorage, sessionStorage])") + json.dumps(p5.context.cookies())
    chk("a chave da organização NÃO está no HTML, nem no localStorage/sessionStorage/cookies", CHAVE_O not in h5 and CHAVE_O not in store5 and "SEGREDODAORGANIZACAO" not in h5 + store5)
    p5.wait_for_timeout(600)
    it5 = p5.inner_text("#cx-itens")
    chk("com a chave guardada: avisos ainda desligados, UM botão 'Ligar os avisos agora' na situação e outro no bloco", p5.locator("#cx-itens button:has-text('Ligar os avisos agora')").count() == 1 and p5.locator("#cx-ligar-avisos").count() == 1 and "chave de envio do app ainda não está" in p5.inner_text("#cx-estado-envio"), (p5.locator("#cx-itens button").all_inner_texts(), p5.inner_text("#cx-estado-envio")))
    axe(p5, "Conexões — OneSignal com a chave guardada")
    p5.click("#cx-ligar-avisos"); p5.wait_for_timeout(2200)
    m5 = p5.inner_text("#cx-msg-onesignal"); ps = p5.inner_text("#cx-passos-onesignal")
    chk("ligar: mostra '✔ Avisos ligados!' e o passo a passo em frases", st5["ligou"] == 1 and "✔ Avisos ligados!" in m5 and "Plataforma Web ligada" in ps and "Criei a chave de envio" in ps and "{" not in ps, (m5, ps))
    chk("a tela passa a dizer que a chave de envio já está no servidor (sem mostrar a chave)", "já está no servidor" in p5.inner_text("#cx-estado-envio") and "os_v2_app" not in p5.content())
    p5.wait_for_timeout(800)
    it5 = p5.inner_text("#cx-itens")
    chk("depois de ligar a situação fica toda certa para o OneSignal", "Plataforma Web ligada" in it5 and "A chave de envio funciona." in it5 and p5.locator("#cx-itens button:has-text('Ligar os avisos agora')").count() == 0, it5[:500])
    st5["liga_falha"] = True
    p5.click("#cx-ligar-avisos"); p5.wait_for_timeout(1800)
    me = p5.inner_text("#cx-msg-onesignal")
    chk("falha ao ligar vira frase de erro (sem JSON) e o botão volta a funcionar", "Não consegui ligar a plataforma Web" in me and "{" not in me and p5.locator("#cx-ligar-avisos").is_enabled(), me)
    st5["liga_falha"] = False
    DIALOGOS.clear()
    p5.click("[data-cx=apagar][data-nome=onesignal]"); p5.wait_for_timeout(1500)
    chk("apagar pede confirmação, remove a chave e o código, e o botão 'Ligar' some", any(t == "confirm" for t, m in DIALOGOS) and st5.get("apagou") == "onesignal" and p5.input_value("#cx-org-onesignal") == "" and p5.locator("#cx-ligar-avisos").count() == 0 and "Sem chave guardada." in p5.inner_text("#cx-estado-onesignal"))
    axe(p5, "Conexões — OneSignal depois de apagar")
    c5.close()

    chk("nenhum erro de JavaScript", not erros, erros[:3])
    b.close()

print("\nRESULTADO: %d ok, %d falhas" % (len(OK), len(BAD)))
print("FALHAS=%d %s" % (len(BAD), BAD))
sys.exit(1 if BAD else 0)
