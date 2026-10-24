from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8766/"
TELA = """<button id='certo' onclick='window.certos=(window.certos||0)+1'>Gestão</button>
<button id='errado' onclick='window.errados=(window.errados||0)+1'>Catálogo</button>"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.route("**/index.html?tutorial_editor=1", lambda r: r.fulfill(status=200, content_type="text/html", body=TELA))
    page.route("**/index.html?tutorial_teste=1", lambda r: r.fulfill(status=200, content_type="text/html", body=TELA))
    page.goto(BASE + "404.html")
    page.evaluate("document.body.innerHTML='<div id=\"tut-editor-slot\"></div>';window.TMV={init:function(){}}")
    page.add_script_tag(url=BASE + "tutorial-app.js")
    page.evaluate("""TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),
      submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[]}:{ok:true,tutorial:p.tutorial},toast:()=>{}});
      TKTutorial.montarEditor()""")
    page.get_by_role("button", name="Gravar tutorial").click()
    page.locator("#tut-titulo").fill("Bloqueio")
    page.get_by_role("button", name="Gravação rápida").click()
    page.get_by_role("button", name="Começar a gravação daqui").click()
    frame = page.frame_locator("#tut-frame")
    frame.locator("#certo").click()
    page.get_by_role("button", name="Encerrar").click()
    page.get_by_role("button", name="Testar tutorial inteiro").click()
    teste = page.frame_locator("#tt-frame")
    teste.locator("#certo.tk-tut-alvo").wait_for()
    teste.locator("#errado").click()
    assert teste.locator("body").evaluate("() => window.errados || 0") == 0
    assert page.locator("[data-tut-erro-toque]").is_visible()
    assert "Etapa 1 de 1" in page.locator("#tt-guia").inner_text()
    teste.locator("#certo").click()
    assert teste.locator("body").evaluate("() => window.certos || 0") == 1
    assert "Tutorial concluído corretamente" in page.locator("#tt-guia").inner_text()
    browser.close()

print("tutorial_bloqueia_toque_errado: OK")
