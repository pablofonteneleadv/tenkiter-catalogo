"""Mensagens v7.22: número ao lado do nome, a mesma pessoa nos 2 WhatsApp (etiqueta, faixa e filtro "Nos 2 WhatsApp"),
encerrar uma ou várias conversas (seleção pelo menu ou segurando o dedo), filtro Encerradas, reabrir e volta automática.
Serviços simulados (mock_msg.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from mock_msg import agora
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
IDS = "[...document.querySelectorAll('#ms-lista .ms-conv')].map(b=>+b.dataset.id)"

def preparar(st):
    import mock_msg
    S = st["ig"].setdefault("msg", mock_msg.novo_estado())
    base = dict(next(c for c in S["convs"] if c["id"] == 4))
    # a Maria (conversa 1, WhatsApp 1, 5588999990000) também escreve pelo WhatsApp 2, sem o 9º dígito
    base.update({"id": 7, "contato": "558899990000", "nome": "Maria", "previa": "Oi, sou eu de novo", "nao_lidas": 0})
    S["convs"].append(base)
    return S

def abrir_tela(ctx):
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000); pg.wait_for_timeout(500)
    return pg, erros

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4")
    S = preparar(st)
    pg, erros = abrir_tela(ctx)

    # ---- nome + número ----
    fone1 = pg.locator("#ms-lista .ms-conv[data-id='1'] .ms-fone").text_content() or ""
    chk("com nome, o número aparece junto (formatado)", "(88) 99999-0000" in fone1, fone1)
    nome2 = pg.locator("#ms-lista .ms-conv[data-id='2'] .ms-nome").text_content() or ""
    chk("sem nome, a conversa mostra o número formatado (nunca o nome da loja)", nome2.strip() == "(88) 98888-7777", nome2)
    chk("grupo não ganha número ao lado", pg.locator("#ms-lista .ms-conv[data-id='3'] .ms-fone").count() == 0)

    # ---- mesma pessoa nos 2 WhatsApp ----
    chip = pg.locator("[data-ms=filtro][data-filtro=ambos]")
    chk("filtro 'Nos 2 WhatsApp · 2' aparece em destaque", (chip.text_content() or "").strip() == "Nos 2 WhatsApp · 2" and "alerta" in (chip.get_attribute("class") or ""), chip.text_content())
    t1 = pg.locator("#ms-lista .ms-conv[data-id='1'] .ms-ambos-tag").text_content() or ""
    t7 = pg.locator("#ms-lista .ms-conv[data-id='7'] .ms-ambos-tag").text_content() or ""
    chk("cada conversa da pessoa avisa o outro número", t1 == "Também no WhatsApp 2" and t7 == "Também no WhatsApp 1", [t1, t7])
    chk("quem fala só por um número não tem o aviso", pg.locator("#ms-lista .ms-ambos-tag").count() == 2)
    foto(pg, "01-lista-numero-e-ambos.png")
    chip.click(); pg.wait_for_timeout(500)
    chk("filtro 'Nos 2 WhatsApp' traz só as duas conversas da Maria", sorted(pg.evaluate(IDS)) == [1, 7], pg.evaluate(IDS))
    chip.click(); pg.wait_for_timeout(500)
    pg.click("#ms-lista .ms-conv[data-id='1']"); pg.wait_for_selector(".ms-faixa.ambos", timeout=4000); pg.wait_for_timeout(300)
    chk("na conversa, faixa avisa que a pessoa também fala pelo outro número", "também está falando pelo WhatsApp 2" in (pg.locator(".ms-faixa.ambos").text_content() or ""))
    axe(pg, "conversa com a faixa 'nos 2 WhatsApp'")
    foto(pg, "02-conversa-faixa-ambos.png")
    pg.click("[data-ms=abrir-outro]"); pg.wait_for_timeout(800)
    cab = pg.locator(".ms-cab .ms-quem span").text_content() or ""
    chk("'Abrir' leva à conversa do outro número", cab.startswith("WhatsApp 2") and "(88) 9999-0000" in cab, cab)
    pg.click(".ms-cab [data-ms=voltar]"); pg.wait_for_timeout(400)

    # ---- encerrar várias pelo menu ----
    pg.click("#ms-mais"); pg.wait_for_timeout(200)
    pg.click(".ms-menu [data-ms=selecionar]"); pg.wait_for_timeout(300)
    chk("'Selecionar conversas' mostra a barra de seleção", pg.locator("#ms-selbar").is_visible() and "Toque nas conversas" in (pg.locator("#ms-selbar").text_content() or ""))
    chk("na seleção, 'Espiar' sai do caminho", pg.locator("#ms-lista .ms-espiar").count() == 0)
    pg.click("#ms-lista .ms-conv[data-id='2']"); pg.click("#ms-lista .ms-conv[data-id='4']"); pg.wait_for_timeout(200)
    chk("tocar marca as conversas (sem abrir)", "2 selecionadas" in (pg.locator("#ms-selbar").text_content() or "") and pg.locator("#ms-lista .ms-conv[aria-pressed=true]").count() == 2 and pg.evaluate("document.getElementById('ms-app').dataset.vista") == "lista")
    pg.click("#ms-lista .ms-conv[data-id='4']"); pg.wait_for_timeout(150)
    chk("tocar de novo desmarca", "1 selecionada" in (pg.locator("#ms-selbar").text_content() or ""))
    pg.click("#ms-lista .ms-conv[data-id='4']"); pg.wait_for_timeout(150)
    axe(pg, "seleção de conversas")
    foto(pg, "03-selecao.png")
    pg.click("[data-ms=sel-encerrar]"); pg.wait_for_timeout(700)
    ult = (S.get("encerrar") or [{}])[-1]
    chk("'Encerrar' manda as selecionadas de uma vez", sorted(ult.get("ids", [])) == [2, 4] and ult.get("reabrir") is False, ult)
    ids = pg.evaluate(IDS)
    chk("encerradas saem da lista e a barra some", 2 not in ids and 4 not in ids and not pg.locator("#ms-selbar").is_visible(), ids)
    chk("aviso explica que voltam sozinhas", "voltam sozinhas se o cliente escrever" in (pg.locator("#ms-aviso").text_content() or ""))
    chk("filtro 'Encerradas · 2'", (pg.locator("[data-ms=filtro][data-filtro=encerradas]").text_content() or "").strip() == "Encerradas · 2")

    # ---- segurar o dedo começa a seleção; Esc/Cancelar sai ----
    bx = pg.locator("#ms-lista .ms-conv[data-id='5']").bounding_box()
    pg.mouse.move(bx["x"] + 120, bx["y"] + 20); pg.mouse.down(); pg.wait_for_timeout(750); pg.mouse.up(); pg.wait_for_timeout(250)
    chk("segurar o dedo numa conversa já a seleciona (sem abrir)", "1 selecionada" in (pg.locator("#ms-selbar").text_content() or "") and pg.locator("#ms-lista .ms-conv[data-id='5'][aria-pressed=true]").count() == 1 and pg.evaluate("document.getElementById('ms-app').dataset.vista") == "lista")
    pg.click("[data-ms=sel-sair]"); pg.wait_for_timeout(200)
    chk("'Cancelar' sai da seleção", not pg.locator("#ms-selbar").is_visible() and pg.locator("#ms-lista .ms-marca").count() == 0)
    pg.click("#ms-lista .ms-conv[data-id='5']"); pg.wait_for_timeout(600)
    chk("toque normal continua abrindo a conversa", pg.evaluate("document.getElementById('ms-app').dataset.vista") == "conversa")
    pg.click(".ms-cab [data-ms=voltar]"); pg.wait_for_timeout(300)

    # ---- filtro Encerradas: reabrir ----
    pg.click("[data-ms=filtro][data-filtro=encerradas]"); pg.wait_for_timeout(500)
    chk("filtro 'Encerradas' mostra as duas", sorted(pg.evaluate(IDS)) == [2, 4], pg.evaluate(IDS))
    pg.click("#ms-mais"); pg.wait_for_timeout(200); pg.click(".ms-menu [data-ms=selecionar]"); pg.wait_for_timeout(200)
    pg.click("[data-ms=sel-todas]"); pg.wait_for_timeout(150)
    chk("'Todas' marca todas e o botão vira 'Reabrir'", "2 selecionadas" in (pg.locator("#ms-selbar").text_content() or "") and (pg.locator("[data-ms=sel-encerrar]").text_content() or "") == "Reabrir 2")
    foto(pg, "04-encerradas-reabrir.png")
    pg.click("[data-ms=sel-encerrar]"); pg.wait_for_timeout(700)
    ult = S["encerrar"][-1]
    chk("'Reabrir' devolve as conversas", sorted(ult["ids"]) == [2, 4] and ult["reabrir"] is True and pg.evaluate(IDS) == [], ult)
    chk("lista de encerradas vazia explica como encerrar", "segure o dedo" in (pg.locator("#ms-extra").text_content() or ""))
    pg.click("[data-ms=filtro][data-filtro=encerradas]"); pg.wait_for_timeout(500)

    # ---- encerrar pela conversa e volta automática ----
    pg.click("#ms-lista .ms-conv[data-id='6']"); pg.wait_for_timeout(700)
    pg.click("#ms-mais-conv"); pg.wait_for_timeout(200)
    chk("menu da conversa tem 'Encerrar conversa'", pg.locator(".ms-menu [data-ms=encerrar]").count() == 1)
    pg.click(".ms-menu [data-ms=encerrar]"); pg.wait_for_timeout(700)
    chk("encerrar pela conversa volta para a lista sem ela", S["encerrar"][-1]["ids"] == [6] and pg.evaluate("document.getElementById('ms-app').dataset.vista") == "lista" and 6 not in pg.evaluate(IDS))
    c6 = next(c for c in S["convs"] if c["id"] == 6)
    c6.update({"encerrada_em": "", "nao_lidas": 1, "atualizada_em": agora(), "previa": "Ainda tem?"})     # o cliente escreveu de novo
    pg.wait_for_timeout(1500)
    chk("quando o cliente escreve, a conversa volta sozinha para a lista", 6 in pg.evaluate(IDS), pg.evaluate(IDS))
    pg.click("#ms-mais"); pg.wait_for_timeout(200); pg.click(".ms-menu [data-ms=selecionar]"); pg.wait_for_timeout(200)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    chk("Esc sai da seleção", not pg.locator("#ms-selbar").is_visible())
    chk("sem erros de JavaScript (celular)", not erros, erros)
    pg.close(); ctx.close()

    # ---- computador ----
    ctx = b.new_context(viewport={"width": 1280, "height": 860}, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4"); S = preparar(st)
    pg, erros = abrir_tela(ctx)
    pg.click("#ms-lista .ms-conv[data-id='7']"); pg.wait_for_timeout(700)
    pg.click("#ms-mais"); pg.wait_for_timeout(200); pg.click(".ms-menu [data-ms=selecionar]"); pg.wait_for_timeout(200)
    pg.click("#ms-lista .ms-conv[data-id='1']"); pg.wait_for_timeout(200)
    bar = pg.locator("#ms-selbar").bounding_box(); lat = pg.locator(".ms-lateral").bounding_box()
    chk("computador: barra de seleção fica no pé da coluna das conversas", bar and lat and abs((bar["y"] + bar["height"]) - (lat["y"] + lat["height"])) < 2 and bar["width"] <= lat["width"] + 1, [bar, lat])
    chk("computador: faixa 'nos 2 WhatsApp' na conversa aberta", pg.locator(".ms-faixa.ambos").is_visible())
    sem_estouro = pg.evaluate("(()=>{const l=document.querySelector('.ms-lateral');return l.scrollWidth<=l.clientWidth+1})()")
    chk("computador: nada estoura a largura da coluna", sem_estouro)
    foto(pg, "05-computador.png")
    chk("sem erros de JavaScript (computador)", not erros, erros)
    b.close()
print("\n%d ok, %d falhas" % (len(OK), len(BAD)))
if BAD: print("\n".join(BAD)); sys.exit(1)
