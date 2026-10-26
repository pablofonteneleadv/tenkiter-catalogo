"""Mensagens v7.21: aba mestre "Todas" (os 3 canais), filtros Lidas/Não lidas, "Espiar" (lê sem marcar como lida aqui
nem no celular), "Atender" e abrir normal (marca lida aqui e pede a leitura no celular), configuração "Leitura no celular".
Serviços simulados (mock_msg.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.getElementById('overlay-mensagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+'×'+v.nodes.length)}")
    chk("axe — " + label, not r, r)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4")
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000); pg.wait_for_timeout(500)
    S = st["ig"]["msg"]
    abas = pg.evaluate("[...document.querySelectorAll('.ms-aba')].map(a=>a.dataset.canal)")
    chk("aba mestre 'Todas' vem primeiro e é a que abre", abas[:1] == ["todos"] and pg.locator("[data-canal=todos][aria-selected=true]").count() == 1, abas)
    tags = set(pg.evaluate("[...document.querySelectorAll('#ms-lista .ms-canal-tag')].map(t=>t.textContent)"))
    chk("lista junta os 3 canais, cada conversa com a etiqueta do canal", {"WhatsApp 1", "WhatsApp 2", "Instagram"} <= tags, tags)
    chk("'Todas' mostra as conversas de todos os canais", pg.locator("#ms-lista .ms-conv").count() == len([c for c in S["convs"] if c["total"] > 0]))
    axe(pg, "aba Todas")
    pg.click("[data-ms=filtro][data-filtro=nao_lidas]"); pg.wait_for_timeout(500)
    ids_nl = pg.evaluate("[...document.querySelectorAll('#ms-lista .ms-conv')].map(b=>+b.dataset.id)")
    chk("filtro 'Não lidas' (todos os canais)", sorted(ids_nl) == sorted(c["id"] for c in S["convs"] if c["nao_lidas"] > 0), ids_nl)
    pg.click("[data-ms=filtro][data-filtro=lidas]"); pg.wait_for_timeout(500)
    ids_l = pg.evaluate("[...document.querySelectorAll('#ms-lista .ms-conv')].map(b=>+b.dataset.id)")
    chk("filtro 'Lidas' mostra só as já lidas", ids_l and sorted(ids_l) == sorted(c["id"] for c in S["convs"] if c["nao_lidas"] == 0 and c["total"] > 0), ids_l)
    pg.click("[data-ms=filtro][data-filtro=todas]"); pg.wait_for_timeout(500)
    chk("'Espiar' aparece só nas não lidas", pg.locator("#ms-lista .ms-espiar").count() == len([c for c in S["convs"] if c["nao_lidas"] > 0]))
    h = pg.evaluate("Math.round(document.querySelector('#ms-lista .ms-espiar').getBoundingClientRect().height)")
    chk("botão Espiar com 44 px ou mais", h >= 44, h)

    print("== Espiar")
    n_lidas = len(S["lidas"])
    pg.click("[data-ms=espiar][data-id='1']"); pg.wait_for_selector("[data-id='3']", timeout=5000); pg.wait_for_timeout(700)
    chk("espiando: mostra as mensagens", "Vocês entregam" in pg.inner_text("#ms-fio"))
    chk("espiando: faixa avisa que não marca como lida, com 'Atender'", pg.locator(".ms-espiando").count() == 1 and "não marca como lida" in pg.inner_text(".ms-espiando") and pg.locator(".ms-espiando [data-ms=atender]").count() == 1)
    chk("espiando: a caixa de resposta fica escondida", pg.locator(".ms-compor").is_hidden())
    pg.wait_for_timeout(1200)   # passa por algumas atualizações ao vivo
    chk("espiando: não marca como lida no painel nem pede ao celular", len(S["lidas"]) == n_lidas and next(c for c in S["convs"] if c["id"] == 1)["nao_lidas"] > 0 and not S.get("celular"), (S["lidas"], S.get("celular")))
    axe(pg, "conversa espiando")
    pg.click(".ms-espiando [data-ms=atender]"); pg.wait_for_timeout(800)
    chk("'Atender': marca como lida aqui e pede a leitura no celular", next(c for c in S["convs"] if c["id"] == 1)["nao_lidas"] == 0 and (1, "whatsapp1") in S.get("celular", []), (S["lidas"][-1:], S.get("celular")))
    chk("'Atender': a caixa de resposta aparece e a faixa some", pg.locator(".ms-compor").is_visible() and pg.locator(".ms-espiando").count() == 0)

    print("== Abrir normal")
    pg.go_back(); pg.wait_for_timeout(500)
    pg.click("[data-ms=abrir][data-id='4']"); pg.wait_for_timeout(1000)
    chk("abrir normal: marca como lida e pede a leitura no celular", next(c for c in S["convs"] if c["id"] == 4)["nao_lidas"] == 0 and (4, "whatsapp2") in S.get("celular", []), S.get("celular"))
    pg.go_back(); pg.wait_for_timeout(400)

    print("== Configuração 'Leitura no celular'")
    pg.click("#ms-mais"); pg.wait_for_timeout(200); pg.click(".ms-menu [data-ms=leitura-cfg]"); pg.wait_for_timeout(700)
    chk("configuração mostra os 3 canais ligados e a última confirmação", pg.locator("[data-cfg-canal]").count() == 3 and pg.locator("[data-cfg-canal]:checked").count() == 3 and "Última confirmação" in pg.inner_text("#ms-estado-wrap"))
    pg.click("[data-cfg-canal=instagram]"); pg.wait_for_timeout(600)
    chk("desligar o Instagram salva no servidor", S["cfg_leitura"]["instagram"] is False)
    n_cel = len(S.get("celular", []))
    pg.click("[data-ms=abrir][data-id='5']"); pg.wait_for_timeout(1000)
    chk("com o Instagram desligado: marca lida no painel, mas não pede ao celular", next(c for c in S["convs"] if c["id"] == 5)["nao_lidas"] == 0 and len(S.get("celular", [])) == n_cel)
    pg.go_back(); pg.wait_for_timeout(400)

    print("== Celular não confirmou")
    S["celular_falha"] = True
    nova = next(c for c in S["convs"] if c["id"] == 2); nova["nao_lidas"] = 1; nova["atualizada_em"] = "2099-01-01T00:00:00.000Z"
    pg.click("[data-ms=atualizar]") if pg.locator("[data-ms=atualizar]").count() else None
    pg.wait_for_timeout(1500)
    pg.click("[data-ms=abrir][data-id='2']"); pg.wait_for_timeout(1000)
    t = pg.inner_text(".sheet-mensagens")
    chk("avisa em português quando o celular não confirma a leitura", "não confirmou a leitura" in t, t[:300])
    chk("sem erro de JavaScript", not erros, erros)
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
