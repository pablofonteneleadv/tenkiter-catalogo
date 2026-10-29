"""Mensagens v7.22: nome do atendente antes da resposta. Padrão = primeiro nome do cadastro, ligado para todos;
o atendente escolhe o próprio nome e o Admin liga/desliga. Serviços simulados (mock_msg.py)."""
import sys, os
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
    r = pg.evaluate("async()=>{const r=await axe.run(document.getElementById('overlay-mensagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+'×'+v.nodes.length)}")
    chk("axe — " + label, not r, r)
def foto(pg, nome):
    if EVID: pg.screenshot(path=os.path.join(EVID, nome))
def escrever_e_enviar(pg, texto):
    pg.fill("#ms-texto", texto); pg.click("#ms-enviar"); pg.wait_for_timeout(700)

def tela(b, w, h, mob):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4"); S = st["ig"].setdefault("msg", mock_msg.novo_estado())
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000); pg.wait_for_timeout(600)
    return ctx, pg, S, erros

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx, pg, S, erros = tela(b, 390, 844, True)
    pg.click("#ms-lista .ms-conv[data-id='1']"); pg.wait_for_selector("#ms-assina", timeout=4000); pg.wait_for_timeout(300)
    chk("na conversa aparece 'Respondendo como Ana' (primeiro nome do cadastro)", "Ana" in (pg.locator("#ms-assina").text_content() or ""))
    axe(pg, "linha da assinatura")
    foto(pg, "07-assinatura-390.png")
    escrever_e_enviar(pg, "Entregamos hoje sim!")
    env = S["envios"][-1]["texto"]
    chk("WhatsApp: a resposta sai com o nome em negrito antes", env == "*Ana:*\nEntregamos hoje sim!", env)
    ult = pg.locator("#ms-fio .ms-bolha.saida").last
    chk("na bolha enviada o nome aparece como rótulo (sem os asteriscos)", (ult.locator(".ms-atendente").text_content() or "") == "Ana" and "*" not in (ult.text_content() or ""), ult.text_content())
    chk("a bolha não duplica quando a mensagem volta do servidor", pg.locator("#ms-fio .ms-bolha.saida", has_text="Entregamos hoje sim!").count() == 1)
    pg.click("[data-ms=nome-editar]"); pg.wait_for_timeout(200)
    chk("'Mudar nome' abre o campo já com o foco", pg.evaluate("document.activeElement && document.activeElement.id") == "ms-meu-nome-rapido")
    pg.fill("#ms-meu-nome-rapido", "Pablo *TK*"); pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    chk("o nome escolhido é salvo no servidor", S.get("meu_nome") == "Pablo TK" and "Pablo TK" in (pg.locator("#ms-assina").text_content() or ""), S.get("meu_nome"))
    foto(pg, "08-assinatura-nome-escolhido.png")
    escrever_e_enviar(pg, "Tem no P também")
    chk("próximas respostas saem com o nome escolhido", S["envios"][-1]["texto"] == "*Pablo TK:*\nTem no P também", S["envios"][-1]["texto"])
    pg.click(".ms-cab [data-ms=voltar]"); pg.wait_for_timeout(300)
    pg.click("#ms-lista .ms-conv[data-id='5']"); pg.wait_for_timeout(600)
    escrever_e_enviar(pg, "Tem sim")
    chk("Instagram: nome sem asteriscos (o Instagram não tem negrito)", S["envios"][-1]["texto"] == "Pablo TK:\nTem sim", S["envios"][-1]["texto"])
    pg.click(".ms-cab [data-ms=voltar]"); pg.wait_for_timeout(300)
    # Admin desliga para todos
    pg.click("#ms-mais"); pg.wait_for_timeout(200); pg.click(".ms-menu [data-ms=leitura-cfg]"); pg.wait_for_timeout(600)
    cx = pg.locator("[data-cfg-assinatura]")
    chk("configuração mostra 'Mostrar o nome de quem responde' marcada por padrão", cx.count() == 1 and cx.is_checked())
    axe(pg, "configurações com o nome do atendente")
    foto(pg, "09-config-assinatura.png")
    cx.uncheck(); pg.wait_for_timeout(500)
    chk("desmarcar salva no servidor", S.get("assinatura") is False)
    pg.click("[data-ms=leitura-cfg]"); pg.wait_for_timeout(200)
    pg.click("#ms-lista .ms-conv[data-id='4']"); pg.wait_for_timeout(600)
    chk("desligada: 'Respondendo como' some (ficam só Produtos e Respostas)", "Sem assinatura" in pg.locator("#ms-assina").inner_text() and pg.locator("#ms-assina [data-ms=gaveta-produtos]").is_visible())
    escrever_e_enviar(pg, "Boa tarde!")
    chk("desligada: a resposta sai sem nome", S["envios"][-1]["texto"] == "Boa tarde!", S["envios"][-1]["texto"])
    pg.click(".ms-cab [data-ms=voltar]"); pg.wait_for_timeout(300)
    pg.click("#ms-mais"); pg.wait_for_timeout(200); pg.click(".ms-menu [data-ms=leitura-cfg]"); pg.wait_for_timeout(500)
    pg.locator("[data-cfg-assinatura]").check(); pg.wait_for_timeout(500)
    pg.fill("#ms-meu-nome", ""); pg.click("[data-ms=nome-salvar-cfg]"); pg.wait_for_timeout(500)
    chk("remarcar liga de novo; nome vazio volta ao primeiro nome", S.get("assinatura") is True and S.get("meu_nome") == "")
    pg.click("[data-ms=leitura-cfg]"); pg.wait_for_timeout(200)
    pg.click("#ms-lista .ms-conv[data-id='4']"); pg.wait_for_timeout(600)
    chk("de volta ao padrão: 'Respondendo como Ana'", "Ana" in (pg.locator("#ms-assina").text_content() or ""))
    # espiando: sem caixa de resposta e sem a linha
    pg.click(".ms-cab [data-ms=voltar]"); pg.wait_for_timeout(300)
    S["convs"][0]["nao_lidas"] = 2; pg.click("#ms-mais"); pg.wait_for_timeout(150); pg.click(".ms-menu [data-ms=atualizar]"); pg.wait_for_timeout(800)
    pg.click("#ms-lista .ms-espiar[data-id='1']"); pg.wait_for_timeout(600)
    chk("espiando: a linha da assinatura fica escondida junto com a resposta", not pg.locator("#ms-assina").is_visible())
    pg.click("[data-ms=atender]"); pg.wait_for_timeout(400)
    chk("ao atender, a linha volta", pg.locator("#ms-assina").is_visible())
    alt = pg.evaluate("(()=>{const r=document.getElementById('ms-assina').getBoundingClientRect(),b=[...document.querySelectorAll('#ms-assina button')].map(x=>x.getBoundingClientRect().height);return [Math.round(r.height),b]})()")
    chk("linha compacta (até 44 px) e botão com 44 px de altura", alt[0] <= 44 and all(h >= 44 for h in alt[1]), alt)
    chk("sem erros de JavaScript (celular)", not erros, erros)
    ctx.close()
    ctx, pg, S, erros = tela(b, 1280, 860, False)
    pg.click("#ms-lista .ms-conv[data-id='1']"); pg.wait_for_timeout(600)
    pg.fill("#ms-texto", "Oi"); pg.keyboard.press("Enter"); pg.wait_for_timeout(700)
    chk("computador: Enter envia já assinado", S["envios"][-1]["texto"] == "*Ana:*\nOi", S["envios"][-1]["texto"])
    foto(pg, "10-assinatura-computador.png")
    chk("sem erros de JavaScript (computador)", not erros, erros)
    b.close()
print("\n%d ok, %d falhas" % (len(OK), len(BAD)))
if BAD: print("\n".join(BAD)); sys.exit(1)
