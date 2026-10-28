"""Mensagens v7.40.13: "Agendar mensagem" (menu ⋯ da conversa) — gaveta com texto, atalhos de horário, data/hora de Fortaleza,
lista das agendadas com Cancelar e faixa na conversa. Serviços simulados (mock_msg.py).
TK_EVID=<pasta> guarda as capturas de tela (celular 390, computador 1440)."""
import sys, os, datetime
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
import mock_msg
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
EVID = os.environ.get("TK_EVID", "")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.getElementById('overlay-mensagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+'×'+v.nodes.length+' '+v.nodes.slice(0,2).map(x=>x.target.join(' ')).join(','))}")
    chk("axe — " + label, not r, r)
def foto(pg, nome):
    if EVID: pg.screenshot(path=os.path.join(EVID, nome))
DIALOGOS = []
def tela(b, w, h, mob):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4"); S = st["ig"].setdefault("msg", mock_msg.novo_estado())
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: (DIALOGOS.append(d.message), d.accept()))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000); pg.wait_for_timeout(600)
    pg.click("#ms-lista .ms-conv[data-id='1']"); pg.wait_for_selector("#ms-texto", timeout=4000); pg.wait_for_timeout(500)
    return ctx, pg, S, erros
def abrir_agenda(pg):
    pg.click("#ms-mais-conv"); pg.wait_for_timeout(300)
    pg.click(".ms-menu [data-ms=agenda-abrir]"); pg.wait_for_selector(".ms-agenda", timeout=4000); pg.wait_for_timeout(400)
def sem_rolagem_h(pg):
    return pg.evaluate("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('#ms-gaveta *')].every(e=>{const r=e.getBoundingClientRect();return r.width===0||(r.left>=-1&&r.right<=innerWidth+1)})")
def dentro(pg, sel):
    return pg.evaluate("(s)=>{const r=document.querySelector(s).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&r.height>=44}", sel)
ALVOS = "[...document.querySelectorAll('#ms-gaveta button, #ms-gaveta input, #ms-agenda-faixa button')].filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.width>=44})"
def fortaleza_amanha(hhmm):
    d = (datetime.datetime.utcnow() - datetime.timedelta(hours=3) + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    return (datetime.datetime.strptime(d + " " + hhmm, "%Y-%m-%d %H:%M") + datetime.timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:00.000Z")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    # ===== celular 390×844 =====
    ctx, pg, S, erros = tela(b, 390, 844, True)
    chk("sem agendadas: a conversa não mostra a faixa", pg.locator("#ms-agenda-faixa").count() == 0)
    pg.fill("#ms-texto", "Oi Maria! A blusa que você pediu chegou 😊")
    abrir_agenda(pg)
    chk("menu ⋯ da conversa abre a gaveta 'Agendar mensagem'", pg.locator("#ms-gaveta").is_visible() and "Agendar mensagem" in pg.inner_text(".ms-gaveta-cab"))
    chk("o texto já digitado no compositor vem pré-preenchido", pg.input_value("#ms-ag-texto") == "Oi Maria! A blusa que você pediu chegou 😊", pg.input_value("#ms-ag-texto"))
    chk("atalhos de horário e campo data/hora (Fortaleza)", pg.locator("[data-ms=agenda-atalho]").count() == 3 and "Daqui a 1 hora" in pg.inner_text(".ms-agenda-atalhos") and pg.locator("#ms-ag-quando[type=datetime-local]").count() == 1 and "Fortaleza" in pg.inner_text(".ms-agenda"))
    chk("lista vazia explica que não há agendadas", "Nenhuma mensagem agendada" in pg.inner_text("#ms-ag-lista"), pg.inner_text("#ms-ag-lista"))
    chk("botão primário 'Agendar' fixo e visível no pé da gaveta", dentro(pg, "#ms-ag-salvar") and "prim" in pg.get_attribute("#ms-ag-salvar", "class"))
    chk("390: sem rolagem horizontal na gaveta", sem_rolagem_h(pg))
    chk("390: alvos de toque com 44 px ou mais", pg.evaluate(ALVOS))
    axe(pg, "gaveta agendar (390)")
    foto(pg, "agendar-390-inicio.png")
    pg.click("#ms-ag-salvar"); pg.wait_for_timeout(200)
    chk("sem horário: avisa em português e não chama o servidor", "Escolha quando" in pg.inner_text("#ms-aviso") and not S.get("agendar_posts"), pg.inner_text("#ms-aviso"))
    pg.click("[data-ms=agenda-atalho][data-k=am8]"); pg.wait_for_timeout(150)
    chk("atalho 'Amanhã 8h' fica marcado e o resumo diz quando sai", pg.get_attribute("[data-ms=agenda-atalho][data-k=am8]", "aria-pressed") == "true" and "amanhã 08:00" in pg.inner_text("#ms-ag-res") and pg.input_value("#ms-ag-quando").endswith("T08:00"), pg.inner_text("#ms-ag-res"))
    foto(pg, "agendar-390-escolhido.png")
    pg.click("#ms-ag-salvar"); pg.wait_for_timeout(600)
    post = (S.get("agendar_posts") or [{}])[-1]
    chk("Agendar manda conversa, texto e o instante de amanhã 08:00 em Fortaleza (11:00 UTC)", post.get("conversa") == 1 and post.get("texto") == "Oi Maria! A blusa que você pediu chegou 😊" and post.get("quando") == fortaleza_amanha("08:00"), (post, fortaleza_amanha("08:00")))
    chk("confirmação legível e o compositor fica limpo (não manda de novo sem querer)", "agendada para amanhã 08:00" in pg.inner_text("#ms-aviso") and pg.input_value("#ms-texto") == "", pg.inner_text("#ms-aviso"))
    chk("a agendada aparece na lista com 'Cancelar'", "amanhã 08:00" in pg.inner_text("#ms-ag-lista") and pg.locator("[data-ms=agenda-cancelar]").count() == 1)
    foto(pg, "agendar-390-lista.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
    chk("Esc fecha a gaveta", pg.locator("#ms-gaveta").count() == 0)
    chk("faixa discreta na conversa: '1 mensagem agendada para amanhã 08:00 · Ver'", pg.locator("#ms-agenda-faixa").is_visible() and "1 mensagem agendada para amanhã 08:00" in pg.inner_text("#ms-agenda-faixa") and pg.locator("#ms-agenda-faixa [data-ms=agenda-abrir]").count() == 1, pg.inner_text("#ms-conversa")[:200])
    chk("390: faixa sem estourar a largura e campo de mensagem ainda visível", pg.evaluate("(()=>{const f=document.getElementById('ms-agenda-faixa').getBoundingClientRect();return f.right<=innerWidth+1&&document.documentElement.scrollWidth<=innerWidth})()") and dentro(pg, "#ms-texto"))
    foto(pg, "agendar-390-faixa.png")
    # data/hora escolhida à mão + segunda agendada
    pg.click("#ms-agenda-faixa [data-ms=agenda-abrir]"); pg.wait_for_selector(".ms-agenda", timeout=4000); pg.wait_for_timeout(400)
    chk("'Ver' da faixa abre a gaveta com a lista", "amanhã 08:00" in pg.inner_text("#ms-ag-lista"))
    pg.fill("#ms-ag-texto", "Segunda mensagem")
    amanha = (datetime.datetime.utcnow() - datetime.timedelta(hours=3) + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    pg.fill("#ms-ag-quando", amanha + "T16:30"); pg.wait_for_timeout(150)
    chk("data/hora à mão: resumo 'amanhã 16:30' e nenhum atalho marcado", "amanhã 16:30" in pg.inner_text("#ms-ag-res") and pg.locator("[data-ms=agenda-atalho][aria-pressed=true]").count() == 0, pg.inner_text("#ms-ag-res"))
    pg.click("#ms-ag-salvar"); pg.wait_for_timeout(600)
    chk("data/hora à mão vira 19:30 UTC", (S.get("agendar_posts") or [{}])[-1].get("quando") == fortaleza_amanha("16:30"), S.get("agendar_posts"))
    chk("duas agendadas: faixa resume e lista mostra as duas", pg.locator("[data-ms=agenda-cancelar]").count() == 2 and "2 mensagens agendadas" in pg.inner_text("#ms-agenda-faixa"))
    pg.locator("[data-ms=agenda-cancelar]").first.click(); pg.wait_for_timeout(600)
    chk("Cancelar pede confirmação e cancela a primeira no servidor", any("Cancelar esta mensagem" in d for d in DIALOGOS) and len(S.get("cancelados", [])) == 1 and pg.locator("[data-ms=agenda-cancelar]").count() == 1, S.get("cancelados"))
    chk("faixa volta a '1 mensagem agendada para amanhã 16:30'", "1 mensagem agendada para amanhã 16:30" in pg.inner_text("#ms-agenda-faixa"), pg.inner_text("#ms-agenda-faixa"))
    # horário que já passou: recusado na tela, em português
    pg.fill("#ms-ag-texto", "x"); pg.fill("#ms-ag-quando", (datetime.datetime.utcnow() - datetime.timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M")); pg.wait_for_timeout(100)
    n0 = len(S.get("agendar_posts") or []); pg.click("#ms-ag-salvar"); pg.wait_for_timeout(300)
    chk("horário passado: aviso em português e nada vai ao servidor", "já passou" in pg.inner_text("#ms-aviso") and len(S.get("agendar_posts") or []) == n0 and "{" not in pg.inner_text("#ms-aviso"), pg.inner_text("#ms-aviso"))
    chk("390: depois das ações continua sem rolagem horizontal", sem_rolagem_h(pg))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    # reabrir a conversa: faixa vem do /msg/mensagens
    pg.click("[data-ms=voltar]"); pg.wait_for_timeout(500)
    pg.click("#ms-lista .ms-conv[data-id='1']"); pg.wait_for_selector("#ms-texto", timeout=4000); pg.wait_for_timeout(500)
    chk("reabrir a conversa: faixa vem junto das mensagens", pg.locator("#ms-agenda-faixa").is_visible())
    pg.click("[data-ms=voltar]"); pg.wait_for_timeout(500)
    pg.click("#ms-lista .ms-conv[data-id='2']"); pg.wait_for_selector("#ms-texto", timeout=4000); pg.wait_for_timeout(500)
    chk("outra conversa sem agendadas não mostra a faixa", pg.locator("#ms-agenda-faixa").count() == 0)
    chk("sem erros JavaScript (390)", not erros, erros)
    ctx.close()
    # ===== computador 1440×900 =====
    ctx, pg, S, erros = tela(b, 1440, 900, False)
    abrir_agenda(pg)
    chk("1440: gaveta lateral de até 420 px, lista continua visível", pg.evaluate("document.getElementById('ms-gaveta').getBoundingClientRect().width<=421") and pg.locator(".ms-lateral").is_visible())
    chk("1440: sem rolagem horizontal e alvos ≥ 44 px", sem_rolagem_h(pg) and pg.evaluate(ALVOS))
    chk("1440: compositor vazio → foco no campo de texto da gaveta", pg.evaluate("document.activeElement.id") == "ms-ag-texto", pg.evaluate("document.activeElement.id"))
    pg.keyboard.type("Chegou o seu pedido!")
    pg.keyboard.press("Tab"); pg.keyboard.press("Enter"); pg.wait_for_timeout(150)
    chk("1440: teclado — Tab leva ao atalho 'Daqui a 1 hora' e Enter escolhe", pg.get_attribute("[data-ms=agenda-atalho][data-k='1h']", "aria-pressed") == "true", pg.evaluate("document.activeElement.outerHTML.slice(0,120)"))
    axe(pg, "gaveta agendar (1440)")
    foto(pg, "agendar-1440.png")
    pg.click("#ms-ag-salvar"); pg.wait_for_timeout(600)
    chk("1440: agenda e a faixa aparece na conversa", len(S.get("agendar_posts") or []) == 1 and pg.locator("#ms-agenda-faixa").is_visible() and ("hoje" in pg.inner_text("#ms-agenda-faixa") or "amanhã" in pg.inner_text("#ms-agenda-faixa")))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    foto(pg, "agendar-1440-faixa.png")
    chk("sem erros JavaScript (1440)", not erros, erros)
    ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
