"""Mensagens v7.20: em grupo, cada mensagem mostra quem mandou (nome + número, cor por pessoa); menção "@número" vira "@Nome";
grupo não mostra "Foi resposta a um story?" (conversa individual continua mostrando). Serviços simulados (mock_msg.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
import mock_msg
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4")
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000)
    S = st["ig"]["msg"]
    def m(id, texto, nome, fone, lid, min_atras):
        return {"id": id, "conversa_id": 3, "direcao": "entrada", "tipo": "texto", "texto": texto, "enviada_em": mock_msg.iso(min_atras), "status": "", "por": "", "status_em": mock_msg.iso(min_atras),
                "autor_nome": nome, "autor_fone": fone, "autor_lid": lid}
    S["msgs"] += [m(301, "Eu abri a loja hoje", "Iara", "5588999112233", "266124864270572", 60),
                  m(302, "@266124864270572 bom dia", "Pablo", "5588988776655", "111222333444555", 50),
                  m(303, "E as vendas de sábado estão salvas", "", "5588977665544", "", 40)]
    pg.click("[data-ms=abrir][data-id='3']"); pg.wait_for_selector("[data-id='301']", timeout=5000); pg.wait_for_timeout(400)
    a1 = pg.inner_text("[data-id='301'] .ms-autor")
    chk("mensagem do grupo mostra o nome e o número de quem mandou", "Iara" in a1 and "(88) 99911-2233" in a1, a1)
    chk("sem nome no WhatsApp: mostra o número", pg.inner_text("[data-id='303'] .ms-autor").strip() == "(88) 97766-5544", pg.inner_text("[data-id='303'] .ms-autor"))
    c1 = pg.evaluate("getComputedStyle(document.querySelector(\"[data-id='301'] .ms-autor\")).color"); c2 = pg.evaluate("getComputedStyle(document.querySelector(\"[data-id='302'] .ms-autor\")).color")
    chk("pessoas diferentes têm cores diferentes", c1 != c2, (c1, c2))
    t2 = pg.inner_text("[data-id='302']")
    chk("menção @número vira @Nome de quem já falou no grupo", "@Iara bom dia" in t2 and "266124864270572" not in t2, t2)
    chk("grupo não mostra 'Foi resposta a um story?'", pg.locator("#ms-fio .ms-ver-stories").count() == 0)
    chk("mensagem antiga do grupo (sem autor gravado) continua aparecendo, sem rótulo", pg.locator("#ms-fio [data-id='6']").count() == 1 and pg.locator("#ms-fio [data-id='6'] .ms-autor").count() == 0)
    pg.go_back(); pg.wait_for_timeout(400)
    if pg.locator("[data-ms=abrir][data-id='1']").count() == 0: pg.click("[data-canal=whatsapp1]"); pg.wait_for_timeout(400)
    pg.click("[data-ms=abrir][data-id='1']"); pg.wait_for_selector("[data-id='3']", timeout=5000); pg.wait_for_timeout(300)
    chk("conversa individual: sem rótulo de autor e sem o link de story (7.40.8)", pg.locator("#ms-fio .ms-autor").count() == 0 and pg.locator("#ms-fio .ms-ver-stories").count() == 0)
    chk("sem erro de JavaScript", not erros, erros)
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
