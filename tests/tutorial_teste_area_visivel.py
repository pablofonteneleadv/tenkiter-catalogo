"""Teste guiado dentro do app: mesmo que a tela do app (iframe) seja mais alta que a área visível do navegador, a janela do teste mede a área REAL e a barra inferior (alvo) fica à vista."""
import os, sys, re
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import SESSION, install, PERMS_ALL
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
T = {"id": "n", "titulo": "Teste ok ok", "descricao": "", "pagina": "index.html", "tipo": "independente", "status": "publicado", "versao": 1, "preparacao": [], "visao": "admin_total",
     "etapas": [{"selector": "[data-nav=gestao]", "alvoNome": "Gestão", "acao": "click", "regra": "acao", "valor": "", "instrucao": "Toque em Gestão", "observacao": "", "erro": ""}]}
H = 780
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 412, "height": H}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION)
    ctx.add_init_script("localStorage.setItem('tm_nav_perms',JSON.stringify({w:'88999999999',p:" + str(PERMS_ALL).replace("'", '"') + ",t:Date.now()}));")
    st = install(ctx, perms=PERMS_ALL); st["tutorials"].append(T)
    pg = ctx.new_page(); pg.set_default_timeout(9000)
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".tk-nav"); pg.click('[data-nav="treinamentos"]')
    pg.wait_for_selector('.tk-app-views iframe', state='attached'); pg.wait_for_timeout(1500)
    # simula o navegador/ app com a tela embutida MAIS ALTA que a área visível (a barra de baixo ficaria fora)
    pg.add_style_tag(content="body.tk-tutorial-teste .tk-app-views,.tk-app-views{top:0!important;bottom:auto!important;height:%dpx!important}" % (H + 120))
    pg.wait_for_timeout(500)
    fr = pg.frame(url=lambda u: "treinamentos.html" in u and "embed=1" in u)
    fr.get_by_role("button", name=re.compile("Começar atividade")).first.click()
    inner = None
    for _ in range(40):
        inner = pg.frame(url=lambda u: "tutorial_teste=1" in u)
        if inner: break
        pg.wait_for_timeout(250)
    inner.wait_for_selector("[data-nav=gestao].tk-tut-alvo"); pg.wait_for_timeout(1200)
    off = fr.evaluate("document.querySelector('#tt-frame').getBoundingClientRect().top")
    nav = inner.evaluate("(()=>{const r=document.querySelector('[data-nav=gestao]').getBoundingClientRect();return [r.top,r.bottom]})()")
    seta = inner.evaluate("(()=>{const e=document.querySelector('.tk-tut-seta');if(!e)return null;const r=e.getBoundingClientRect();return [r.top,r.bottom]})()")
    assert nav[1] + off <= H + 1, ("barra Gestão fora da área visível", nav, off)
    assert seta and seta[1] + off <= H + 1, ("placa TOQUE AQUI fora", seta, off)
    b.close()
print("tutorial_teste_area_visivel: OK")
