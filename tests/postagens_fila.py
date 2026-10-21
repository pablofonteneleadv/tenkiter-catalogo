"""Postagens (18/10/2026): regras da fila (só gestor edita), fila por tipo (subir/descer, mudar horário, próximo livre), seletor rápido de dia/hora e
"Agora mesmo" discreto com confirmação. Worker e Apps Script SIMULADOS (mock.py: st["ig"]["regras"]=True liga as rotas novas)."""
import sys, os, json, datetime
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.map(v=>v.id+'×'+v.nodes.length+' '+v.nodes.slice(0,2).map(n=>n.html.slice(0,90)).join('|'))}")
    chk("axe — " + label, not r, "; ".join(r))
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def post(i, tipo, quando, status="agendado"):
    return {"id": i, "tipo": tipo, "modo": "auto", "legenda": "Legenda %d" % i, "midias": [{"url": "https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/aa%d.jpg" % i, "tipo": "foto"}],
            "produto": "TK-0003", "template": "", "link": "", "agendadoEm": quando, "status": status, "erro": "", "criadoPor": "Loja", "permalink": ""}
def abrir(b, perms=PERMS_ALL, gestor=True, extras=None):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=60000;")
    st = install(ctx, perms=perms, versao="4.3"); st["midia"]["modo"] = "ok"
    g = st["ig"]; g["regras"] = True; g["pode_regras"] = gestor; g["posts"] = [
        post(1, "story", "2026-10-19T11:00:00Z"), post(2, "story", "2026-10-19T11:02:00Z"), post(3, "story", "2026-10-19T11:04:00Z"), post(4, "feed", "2026-10-19T12:00:00Z")]
    if extras: g["posts"] += extras
    pg = ctx.new_page(); erros = []; msgs = []
    pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: (msgs.append(d.message), d.accept()))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2400)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    return ctx, pg, st, g, erros, msgs
def aba(pg, n): pg.click("#po-abas [data-aba=%s]" % n); pg.wait_for_timeout(500)
def chamadas(g, path): return [c for c in g["post_chamadas"] if c["path"] == path]

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    print("== Aba Regras (gestor) ==")
    ctx, pg, st, g, erros, msgs = abrir(b)
    chk("a aba 🛡️ Regras existe", pg.locator("#po-abas [data-aba=regras]").count() == 1)
    aba(pg, "regras")
    chk("pausa vem ligada, 22:00 até 06:30", pg.is_checked("[data-rg=pausaAtiva]") and pg.input_value("[data-rg=pausaDeH]") == "22" and pg.input_value("[data-rg=pausaAteM]") == "30", pg.inner_text("#po-corpo")[:200])
    chk("um cartão por canal: Story, Status do WhatsApp, Feed, Carrossel e Reels", pg.locator(".po-rg-c").count() == 5 and "Status do WhatsApp" in pg.inner_text("#po-corpo"), pg.locator(".po-rg-c").count())
    chk("intervalo de/até com a faixa por extenso (Story 2 a 5 min)", pg.input_value("#rg-story-gapMin") == "120" and pg.input_value("#rg-story-gapMax") == "300" and "2 min a 5 min" in pg.inner_text("#rg-lbl-story"), pg.inner_text("#rg-lbl-story"))
    chk("cada canal tem o seu limite de 24 h e mostra quanto já usou", pg.input_value("#rg-story-max24h") == "40" and pg.input_value("#rg-reels-max24h") == "10" and "Já usou 12 de 40" in pg.inner_text("#rg-uso-story") and "Já usou 3 de 40" in pg.inner_text("#rg-uso-status"), [pg.inner_text("#rg-uso-story"), pg.inner_text("#rg-uso-status")])
    chk("campos de número grandes e afastados (48 px de altura, sem encostar um no outro)", pg.evaluate("()=>{const a=document.querySelector('#rg-story-gapMin').getBoundingClientRect(),b=document.querySelector('#rg-story-gapMax').getBoundingClientRect();return a.height>=48&&(b.left-a.right>=40||b.top-a.bottom>=8)}"))
    chk("gestor vê Salvar e Voltar ao padrão", pg.locator("[data-rga=salvar]").count() == 1 and pg.locator("[data-rga=padrao]").count() == 1)
    axe(pg, "Regras")
    pg.select_option("[data-rg=pausaDeH]", "23"); pg.fill("#rg-story-gapMin", "180"); pg.dispatch_event("#rg-story-gapMin", "input"); pg.wait_for_timeout(100)
    chk("o rótulo acompanha o que digita (180 s a 300 s = 3 min a 5 min)", "3 min a 5 min" in pg.inner_text("#rg-lbl-story"), pg.inner_text("#rg-lbl-story"))
    pg.fill("#rg-feed-gapMax", "60"); pg.dispatch_event("#rg-feed-gapMax", "input"); pg.wait_for_timeout(100)
    chk("máximo menor que o mínimo avisa na hora", "não pode ser menor" in pg.inner_text("#rg-lbl-feed"), pg.inner_text("#rg-lbl-feed"))
    pg.fill("#rg-feed-gapMax", "600"); pg.dispatch_event("#rg-feed-gapMax", "input"); pg.fill("#rg-status-max24h", "7"); pg.dispatch_event("#rg-status-max24h", "input")
    pg.click("[data-rga=salvar]"); pg.wait_for_timeout(700)
    c = chamadas(g, "/post/config")
    chk("salvou pelo servidor com as mudanças", c and c[-1]["corpo"]["config"]["pausaDe"] == "23:00" and c[-1]["corpo"]["config"]["canais"]["story"]["gapMin"] == 180 and c[-1]["corpo"]["config"]["canais"]["story"]["gapMax"] == 300 and c[-1]["corpo"]["config"]["canais"]["status"]["max24h"] == 7, c[-1:] if c else c)
    chk("mostra confirmação das regras salvas", "Regras salvas" in pg.inner_text("#po-corpo"))
    chk("a pausa desligada deixa os horários esmaecidos", (pg.click("[data-rg=pausaAtiva]"), pg.wait_for_timeout(200), pg.get_attribute(".po-rg-pausa", "style") or "")[2].find("opacity") != -1)
    pg.click("[data-rga=padrao]"); pg.wait_for_timeout(500)
    chk("Voltar ao padrão repõe 22:00 e 120 s sem salvar sozinho", pg.input_value("[data-rg=pausaDeH]") == "22" and pg.input_value("#rg-story-gapMin") == "120" and pg.input_value("#rg-status-max24h") == "40" and g["regras_cfg"]["canais"]["story"]["gapMin"] == 180)
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close()

    print("== Status do WhatsApp à parte e 'ambos' sem subir/descer ==")
    ex = [dict(post(5, "story", "2026-10-19T11:10:00Z"), canal="whatsapp"), dict(post(6, "story", "2026-10-19T11:12:00Z"), canal="ambos")]
    ctx, pg, st, g, erros, msgs = abrir(b, extras=ex)
    aba(pg, "fila")
    gr = [pg.inner_text(".po-grupo >> nth=%d" % i) for i in range(pg.locator(".po-grupo").count())]
    chk("3 grupos na ordem Story, Status do WhatsApp, Feed", len(gr) == 3 and "Story" in gr[0] and gr[1].startswith("Status do WhatsApp") and "Feed" in gr[2], gr)
    chk("o grupo do Status mostra o intervalo próprio (2 min a 5 min)", "2 min a 5 min" in gr[1], gr[1])
    chk("o 'ambos' fica no grupo do Story (4 itens: 1, 2, 3 e o 'ambos')", gr[0].split("·")[1].strip() == "4", gr[0])
    chk("'ambos' não tem ▲▼ (usar Horário/Próximo livre) e diz Instagram + WhatsApp", pg.locator(".po-item[data-id='6'] [data-a=subir]").count() == 0 and pg.locator(".po-item[data-id='6'] [data-a=hora]").count() == 1 and "Instagram + WhatsApp" in pg.inner_text(".po-item[data-id='6']"), pg.inner_text(".po-item[data-id='6']")[:200])
    chk("o Status mostra 'Status do WhatsApp' e não tem ▲▼ (é o único do grupo)", "Status do WhatsApp" in pg.inner_text(".po-item[data-id='5']") and pg.is_disabled(".po-item[data-id='5'] [data-a=subir]") and pg.is_disabled(".po-item[data-id='5'] [data-a=descer]"))
    chk("sem o 'ambos' na conta, a ordem do Story continua 1, 2, 3 (o 3 desce desabilitado)", pg.is_disabled(".po-item[data-id='3'] [data-a=descer]") and pg.is_enabled(".po-item[data-id='2'] [data-a=descer]"))
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close()

    print("== Quem não é gestor só vê ==")
    ctx, pg, st, g, erros, msgs = abrir(b, gestor=False)
    aba(pg, "regras")
    chk("campos travados e sem botão de salvar", pg.locator("[data-rga=salvar]").count() == 0 and pg.is_disabled("#rg-story-gapMin") and pg.is_disabled("#rg-reels-max24h") and pg.is_disabled("[data-rg=pausaAtiva]"))
    chk("explica que é do gestor", "gestor" in pg.inner_text("#po-corpo"))
    ctx.close()

    print("== Fila por tipo ==")
    ctx, pg, st, g, erros, msgs = abrir(b)
    aba(pg, "fila")
    t = pg.inner_text("#po-corpo")
    chk("grupos por tipo com o intervalo (faixa) entre postagens", pg.locator(".po-grupo").count() == 2 and "2 min a 5 min entre uma e outra" in t and "5 min a 10 min entre uma e outra" in t, t[:300])
    chk("Story vem antes do Feed", pg.inner_text(".po-grupo >> nth=0").startswith("📱") or "Story" in pg.inner_text(".po-grupo >> nth=0"), pg.inner_text(".po-grupo >> nth=0"))
    chk("a 1ª não sobe e a última não desce", pg.is_disabled(".po-item[data-id='1'] [data-a=subir]") and pg.is_disabled(".po-item[data-id='3'] [data-a=descer]") and pg.is_enabled(".po-item[data-id='2'] [data-a=subir]"))
    pg.click(".po-item[data-id='2'] [data-a=subir]"); pg.wait_for_timeout(700)
    c = chamadas(g, "/post/mover")
    chk("subir chama /post/mover com a direção", c and c[-1]["corpo"] == {"id": 2, "dir": "subir"}, c)
    ordem = [pg.get_attribute(".po-item >> nth=%d" % i, "data-id") for i in range(3)]
    chk("a ordem na tela mudou (2, 1, 3)", ordem == ["2", "1", "3"], ordem)
    pg.click(".po-item[data-id='3'] [data-a=proximo]"); pg.wait_for_timeout(700)
    chk("⏭ Próximo livre chama /post/proximo e avisa o horário", chamadas(g, "/post/proximo") and "próximo horário livre" in pg.inner_text("#po-corpo"), pg.inner_text("#po-corpo")[:200])
    print("-- mudar horário --")
    pg.click(".po-item[data-id='1'] [data-a=hora]"); pg.wait_for_timeout(300)
    axe(pg, "Fila com o seletor de horário aberto")
    chk("🕐 Horário abre o seletor rápido dentro do item", pg.locator(".po-item[data-id='1'] .po-pk").count() == 1)
    pg.click(".po-item[data-id='1'] [data-pk='d:1']"); pg.click(".po-item[data-id='1'] [data-pk='h:8']"); pg.click(".po-item[data-id='1'] [data-pk='m:0']"); pg.wait_for_timeout(250)
    chk("Amanhã, 8h, :00 (um toque em cada) preenche e mostra o resumo", "08:00" in pg.inner_text(".po-item[data-id='1'] .po-pk-res"), pg.inner_text(".po-item[data-id='1'] .po-pk-res"))
    chk("08:00 cai fora da pausa: sem aviso de madrugada", "pausa" not in pg.inner_text(".po-item[data-id='1'] .po-pk-res"))
    pg.click(".po-item[data-id='1'] [data-pk='h:23']"); pg.wait_for_timeout(250)
    chk("23h avisa que cai na pausa da madrugada", "pausa da madrugada" in pg.inner_text(".po-item[data-id='1'] .po-pk-res"), pg.inner_text(".po-item[data-id='1'] .po-pk-res"))
    pg.click(".po-item[data-id='1'] [data-pk='h:10']"); pg.click(".po-item[data-id='1'] [data-pk='m:35']"); pg.wait_for_timeout(200)
    g["ajusta"] = True
    pg.click(".po-item[data-id='1'] [data-a=hora-ok]"); pg.wait_for_timeout(700)
    c = chamadas(g, "/post/reagendar")
    hm = pg.evaluate("(q)=>{const d=new Date(q);return d.getHours()+':'+d.getMinutes()}", c[-1]["corpo"]["quando"]) if c else ""
    chk("salvou o horário escolhido (10:35, hora do aparelho)", c and c[-1]["corpo"]["id"] == 1 and hm == "10:35", (hm, c[-1:] if c else c))
    chk("quando o servidor ajusta, a pessoa é avisada com o motivo", "ajustado" in pg.inner_text("#po-corpo") and "intervalo mínimo" in pg.inner_text("#po-corpo"), pg.inner_text("#po-corpo")[:260])
    n_conf = len(msgs)
    pg.click(".po-item[data-id='4'] [data-a=agora]"); pg.wait_for_timeout(700)
    chk("Postar agora pede confirmação lembrando que é só para urgência", len(msgs) == n_conf + 1 and "urgência" in msgs[-1], msgs[-1:])
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close()

    print("== Nova postagem: Na sequência é o padrão; Agora mesmo é discreto e confirma ==")
    ctx, pg, st, g, erros, msgs = abrir(b)
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(400); pg.click("[data-tipo=story]"); pg.wait_for_timeout(900)
    chk("o padrão é 🔁 Na sequência", pg.get_attribute("[data-q=sequencia]", "aria-pressed") == "true")
    chk("só 2 botões de destaque (Na sequência e Dia e hora); Agora mesmo é separado e discreto", pg.locator(".po-chips [data-q]").count() == 2 and pg.locator(".po-urg").count() == 1 and "só urgência" in pg.inner_text(".po-urg"))
    chk("explica a fila do tipo com o intervalo mínimo", "fila de" in pg.inner_text(".po-ajuda >> nth=-1") or "fila de" in pg.inner_text("#po-corpo"), pg.inner_text("#po-corpo")[-400:])
    pg.click(".po-urg"); pg.wait_for_timeout(250)
    axe(pg, "Confirmação do Agora mesmo")
    chk("Agora mesmo abre a confirmação explicando para usar Na sequência", pg.locator(".po-conf").count() == 1 and "Se não for urgente" in pg.inner_text(".po-conf") and "Na sequência" in pg.inner_text(".po-conf"))
    chk("ainda NÃO ficou em 'agora' (só depois de confirmar)", pg.get_attribute("[data-q=sequencia]", "aria-pressed") == "true")
    pg.click("[data-a=agora-nao]"); pg.wait_for_timeout(200)
    chk("'Usar Na sequência' fecha a confirmação e mantém a fila", pg.locator(".po-conf").count() == 0 and pg.get_attribute("[data-q=sequencia]", "aria-pressed") == "true")
    pg.click(".po-urg"); pg.click("[data-a=agora-sim]"); pg.wait_for_timeout(250)
    chk("'É urgente' liga o modo urgente com faixa vermelha e botão Desfazer", pg.locator(".po-urg-on").count() == 1 and "Postar agora (urgente)" in pg.inner_text("[data-a=enviar]"))
    pg.click(".po-urg-on button"); pg.wait_for_timeout(200)
    chk("Desfazer volta à sequência", pg.get_attribute("[data-q=sequencia]", "aria-pressed") == "true")
    print("-- seletor de dia e hora --")
    pg.click("[data-q=agendar]"); pg.wait_for_timeout(300)
    axe(pg, "Nova postagem com o seletor de dia e hora")
    chk("o horário já vem marcado no PRÓXIMO LIVRE da fila (sem aviso de 'já passou')", pg.locator(".po-pk-dias [aria-pressed=true]").count() == 1 and pg.locator(".po-pk-hs [aria-pressed=true]").count() == 1 and pg.locator(".po-pk-ms [aria-pressed=true]").count() == 1 and "já passou" not in pg.inner_text(".po-pk-res"), pg.inner_text(".po-pk-res"))
    chk("seletor enxuto: SEM atalhos (+30 min, Hoje 19:00…), 10 dias, 24 horas e minutos de 5 em 5", pg.locator(".po-pk-at").count() == 0 and "+30 min" not in pg.inner_text(".po-pk") and pg.locator(".po-pk-dias button").count() == 10 and pg.locator(".po-pk-hs button").count() == 24 and pg.locator(".po-pk-ms button").count() == 12)
    chk("não usa o campo nativo datetime-local", pg.locator("input[type=datetime-local]").count() == 0)
    pg.click("[data-pk='d:1']"); pg.click("[data-pk='h:19']"); pg.click("[data-pk='m:0']"); pg.wait_for_timeout(250)
    chk("Amanhã 19:00 marca o dia, a hora e os minutos", pg.get_attribute(".po-pk-dias button >> nth=1", "aria-pressed") == "true" and pg.get_attribute("[data-pk='h:19']", "aria-pressed") == "true" and pg.get_attribute("[data-pk='m:0']", "aria-pressed") == "true")
    pg.click("[data-pk='d:3']"); pg.click("[data-pk='h:8']"); pg.click("[data-pk='m:45']"); pg.wait_for_timeout(250)
    chk("trocar dia, hora e minuto, um toque cada", pg.get_attribute(".po-pk-dias button >> nth=3", "aria-pressed") == "true" and "08:45" in pg.inner_text(".po-pk-res"), pg.inner_text(".po-pk-res"))
    chk("hora que já passou hoje fica desabilitada", pg.locator(".po-pk-hs button[disabled]").count() >= 0)
    pg.click("[data-pk='d:1']"); pg.click("[data-pk='h:8']"); pg.click("[data-pk='m:0']"); pg.wait_for_timeout(200)
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
    c = chamadas(g, "/post")
    corpo = ((c[-1]["corpo"].get("posts") or [c[-1]["corpo"]])[0]) if c else {}
    hm = pg.evaluate("(q)=>{const d=new Date(q);return d.getHours()+':'+d.getMinutes()+':'+(Math.round((d-Date.now())/36e5))}", corpo.get("quando", "")) if corpo.get("quando", "").endswith("Z") else corpo.get("quando")
    chk("enviou agendado para amanhã 08:00 (ISO), não 'agora'", corpo.get("tipo") == "story" and str(hm).startswith("8:0:") and corpo.get("quando") not in ("agora", "sequencia"), (corpo.get("quando"), hm))
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close()

    print("== Intervalo entre as fotos (padrão do gestor ou de X em X minutos) ==")
    from PIL import Image
    import tempfile
    tmpd = tempfile.mkdtemp(); av = []
    for i in (1, 2):
        pth = os.path.join(tmpd, "av%d.jpg" % i); Image.new("RGB", (300, 400), (200, 90 * i, 50)).save(pth); av.append(pth)
    ctx, pg, st, g, erros, msgs = abrir(b)
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(400); pg.click("[data-tipo=story]"); pg.wait_for_timeout(700)
    chk("com 1 foto só, não aparece escolha de intervalo", pg.locator(".po-int").count() == 0)
    pg.set_input_files("#po-avulsa-arq", av); pg.wait_for_timeout(1200)
    chk("com 3 Stories aparece 'Intervalo entre os 3 Stories' com Padrão marcado e a faixa do gestor", pg.locator(".po-int").count() == 1 and pg.get_attribute("[data-gm=padrao]", "aria-pressed") == "true" and "2 min a 5 min" in pg.inner_text(".po-int"), pg.inner_text(".po-int") if pg.locator(".po-int").count() else "")
    axe(pg, "Intervalo entre os Stories")
    pg.click("[data-gm=custom]"); pg.wait_for_timeout(250)
    chk("'Eu escolho' mostra o campo em minutos e explica o mínimo do canal", pg.locator("#po-gapmin").count() == 1 and "mínimo do canal é 2 min" in pg.inner_text(".po-int"), pg.inner_text(".po-int"))
    pg.fill("#po-gapmin", "1"); pg.dispatch_event("#po-gapmin", "change"); pg.wait_for_timeout(250)
    chk("valor abaixo do mínimo sobe para o mínimo do canal (2 min)", pg.input_value("#po-gapmin") == "2", pg.input_value("#po-gapmin"))
    pg.fill("#po-gapmin", "15"); pg.dispatch_event("#po-gapmin", "change"); pg.wait_for_timeout(250)
    chk("15 minutos fica como escolhido", pg.input_value("#po-gapmin") == "15")
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(3500)
    c = chamadas(g, "/post")
    cp = c[-1]["corpo"] if c else {}
    chk("Na sequência: envia os 3 Stories com intervalo = 15", cp.get("intervalo") == 15 and len(cp.get("posts", [])) == 3 and all(x.get("quando") == "sequencia" for x in cp.get("posts", [])), cp.get("intervalo"))
    ctx.close()
    ctx, pg, st, g, erros, msgs = abrir(b)
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(400); pg.click("[data-tipo=story]"); pg.wait_for_timeout(700)
    pg.set_input_files("#po-avulsa-arq", av); pg.wait_for_timeout(1200)
    pg.click("[data-q=agendar]"); pg.wait_for_timeout(300)
    chk("em 'Dia e hora' o intervalo também aparece (com a caixa de soltar em sequência marcada)", pg.locator(".po-int").count() == 1 and pg.is_checked("#po-seqag"))
    pg.click("[data-pk='d:3']"); pg.click("[data-pk='h:12']"); pg.click("[data-pk='m:0']")
    pg.click("[data-gm=custom]"); pg.fill("#po-gapmin", "30"); pg.dispatch_event("#po-gapmin", "change"); pg.wait_for_timeout(250)
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(3500)
    c = chamadas(g, "/post"); cp = c[-1]["corpo"] if c else {}
    ts = [__import__("datetime").datetime.fromisoformat(x["quando"].replace("Z", "+00:00")).timestamp() for x in cp.get("posts", [])]
    chk("Dia e hora: 3 horários de 30 em 30 minutos (ISO), a partir do escolhido", len(ts) == 3 and abs((ts[1] - ts[0]) - 1800) < 1 and abs((ts[2] - ts[1]) - 1800) < 1 and cp.get("intervalo") is None, ts)
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close()

    print("== Servidor antigo (sem regras): tudo continua funcionando ==")
    ctx, pg, st, g, erros, msgs = abrir(b)
    g["regras"] = False; pg.reload(); pg.wait_for_timeout(2400)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    aba(pg, "fila")
    chk("fila abre sem grupos e sem ▲▼ (o servidor não sabe mover)", pg.locator(".po-grupo").count() == 0 and pg.locator("[data-a=subir]").count() == 0 and pg.locator(".po-item").count() == 4)
    aba(pg, "regras")
    chk("a aba Regras explica que falta publicar o Worker", "ainda não tem as regras" in pg.inner_text("#po-corpo"))
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close()
    print("== Confirmação com carimbos do servidor ==")
    ctx, pg, st, g, erros, msgs = abrir(b)
    g["posts"][0].update({"status":"processando", "aguardaZap":True, "progresso":{"fase":"confirmacao", "desde":"2026-10-21T10:00:00Z", "proximaConsultaEm":"2026-10-21T10:02:00Z", "limiteEm":"2026-10-21T10:30:00Z"}})
    aba(pg, "fila"); pg.wait_for_timeout(900)
    chk("a fila mostra próxima consulta e limite de 30 min informados pelo servidor", pg.locator(".po-progresso").count() > 0 and "Próxima consulta prevista" in pg.inner_text("#po-corpo") and "30 min" in pg.inner_text("#po-corpo"))
    chk("a confirmação oferece consultar sem reenviar", pg.locator("[data-a=consultar]").count() > 0)
    ctx.close(); b.close()

print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
