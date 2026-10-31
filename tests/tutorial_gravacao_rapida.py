import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8766/")
TELA = """<button id='menu' onclick="document.querySelector('#dentro').hidden=false">Abrir menu</button>
<div id='dentro' hidden><button id='opcao'>Opção interna</button><input id='codigo' aria-label='Código'></div>"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1100, "height": 800})
    page.route("**/index.html?tutorial_editor=1", lambda r: r.fulfill(status=200, content_type="text/html", body=TELA))
    page.goto(BASE + "404.html")
    page.evaluate("document.body.innerHTML='<div id=\"tut-editor-slot\"></div>';window.TMV={init:function(){}}")
    page.add_script_tag(url=BASE + "tutorial-app.js")
    page.evaluate("""TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),
      submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[]}:{ok:true,tutorial:p.tutorial},toast:()=>{}});
      TKTutorial.montarEditor()""")
    page.get_by_role("button", name="Gravar tutorial").click()
    page.locator("#tut-titulo").fill("Fluxo rápido")
    page.get_by_role("button", name="Gravação rápida").click()
    assert page.locator("#tut-gravacao-full").evaluate("el => getComputedStyle(el).position") == "fixed"
    frame = page.frame_locator("#tut-frame")
    frame.locator("body").wait_for()
    frame.locator("#menu").click()
    assert frame.locator("#dentro").is_visible(), "o clique gravado precisa abrir o menu"
    page.get_by_role("button", name="Começar a gravação daqui").click()
    assert page.locator(".tut-full-bar").bounding_box()["height"] < 70, "a barra de gravação deve ser compacta"
    frame.locator("#opcao").click()
    frame.locator("#codigo").fill("TK-123")
    frame.locator("#codigo").blur()
    page.get_by_role("button", name="Inserir texto").click()
    page.locator("#tfg-texto").fill("Texto criado durante a gravação")
    page.get_by_role("button", name="Posicionar na tela").click()
    assert page.locator(".tut-full-form").bounding_box()["height"] < 65, "ao posicionar, o editor deve virar uma faixa pequena"
    page.get_by_role("button", name="Salvar", exact=True).click()
    page.get_by_role("button", name="Encerrar").click()
    total = page.locator("#tut-etapas tbody tr").count()
    assert total == 3, f"esperava 2 ações e 1 texto após a preparação, recebeu {total}"
    assert page.locator('[data-campo="valor"][data-i="1"]').input_value() == "TK-123"
    page.get_by_role("button", name="Texto flutuante").click()
    page.locator("#tf-texto").fill("Confira os dados antes de continuar")
    page.locator("#tf-b").check()
    page.locator("#tf-fundo").fill("#fff3cd")
    page.get_by_role("button", name="Salvar texto").click()
    assert page.locator("#tut-etapas tbody tr").count() == 4
    browser.close()

print("tutorial_gravacao_rapida: OK")
