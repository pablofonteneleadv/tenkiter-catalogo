from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8766/"
TELA = """<div data-acao='novo' onclick='window.menu=(window.menu||0)+1'><span>Cadastrar nova peça</span></div>
<label id='foto-label' for='foto'>📷 Tirar foto ou escolher da galeria</label>
<input id='foto' type='file' accept='image/*'>"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    for q in ("tutorial_editor=1", "tutorial_teste=1"):
        page.route(f"**/index.html?{q}", lambda r: r.fulfill(status=200, content_type="text/html", body=TELA))
    page.goto(BASE + "404.html")
    page.evaluate("document.body.innerHTML='<div id=\"tut-editor-slot\"></div>';window.TMV={init:function(){}}")
    page.add_script_tag(url=BASE + "tutorial-app.js")
    page.evaluate("""TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),
      submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[]}:{ok:true,tutorial:p.tutorial},toast:()=>{}});
      TKTutorial.montarEditor()""")
    page.get_by_role("button", name="Gravar tutorial").click()
    page.locator("#tut-titulo").fill("Foto e menu")
    page.get_by_role("button", name="Gravação rápida").click()
    page.get_by_role("button", name="Começar a gravação daqui").click()
    frame = page.frame_locator("#tut-frame")
    frame.locator("[data-acao=novo] span").click()
    with page.expect_file_chooser() as escolha:
        frame.locator("#foto-label").click()
    escolha.value.set_files({"name": "foto.jpg", "mimeType": "image/jpeg", "buffer": b"imagem"})
    page.get_by_role("button", name="Encerrar").click()
    assert page.locator("#tut-etapas tbody tr").count() == 2, "foto deve virar uma etapa, sem clique duplicado no rótulo"
    assert page.locator('[data-campo="instrucao"][data-i="0"]').input_value() == "Toque em Cadastrar nova peça"
    assert page.locator('[data-campo="valor"][data-i="1"]').input_value() == ""
    assert "Adicione uma foto" in page.locator('[data-campo="instrucao"][data-i="1"]').input_value()
    page.get_by_role("button", name="Testar tutorial inteiro").click()
    teste = page.frame_locator("#tt-frame")
    assert "5px" in teste.locator("[data-acao=novo]").evaluate("el => getComputedStyle(el).outlineWidth")
    teste.locator("[data-acao=novo]").click()
    page.wait_for_function("document.querySelector('#tt-guia').innerText.includes('Etapa 2 de 2')")
    assert "5px" in teste.locator("#foto-label").evaluate("el => getComputedStyle(el).outlineWidth")
    teste.locator("#foto").set_input_files({"name": "outra.jpg", "mimeType": "image/jpeg", "buffer": b"outra"})
    page.wait_for_function("document.querySelector('#tt-guia').innerText.includes('Tutorial concluído corretamente')")
    browser.close()

print("tutorial_foto_menu: OK")
