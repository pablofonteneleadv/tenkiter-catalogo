from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8766/"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.set_default_timeout(5000)
    for q in ("tutorial_editor=1", "tutorial_teste=1"):
        page.route(f"**/index.html?{q}", lambda route: route.fulfill(
            status=200, content_type="text/html", body='<button id="cadastrar">Cadastrar nova peça</button>'))
    page.goto(BASE + "404.html")
    page.evaluate("""document.body.innerHTML='<div id="tut-editor-slot"></div>';
      window.__saved=[];
      window.TMV={init:function(o){window.__cfg=o}};""")
    page.add_script_tag(url=BASE + "tutorial-app.js")
    page.evaluate("""TMV.init({
      state:function(){return {user:{whatsapp:'5599999999999',password:'sessao'}}},
      submit:async function(p){
        if(p.action==='tutorial_listar') return {ok:true,tutoriais:[]};
        if(p.action==='tutorial_salvar'){window.__saved.push(p.tutorial);return {ok:true,tutorial:p.tutorial};}
        return {ok:true};
      }, toast:function(m){window.__toast=m}
    }); TKTutorial.montarEditor();""")
    page.get_by_role("button", name="Gravar tutorial").click()
    page.locator("#tut-titulo").fill("Cadastrar uma peça")
    page.locator("#tut-desc").fill("Tutorial criado pelo editor visual")
    page.get_by_role("button", name="Adicionar explicando").click()
    page.get_by_role("button", name="Começar a gravação daqui").click()
    frame = page.frame_locator("#tut-frame")
    frame.locator("body").wait_for()
    alvo = frame.locator("#cadastrar")
    alvo.evaluate("el => setTimeout(() => el.click(), 0)")
    page.locator("#te-inst").fill("Toque neste controle")
    page.locator("#te-obs").fill("Confira o destaque laranja")
    page.locator("#te-acao").select_option("click")
    page.locator("#te-regra").select_option("acao")
    page.get_by_role("button", name="Salvar etapa").click()
    assert page.locator("#tut-etapas tbody tr").count() == 1
    page.get_by_role("button", name="Encerrar").click()
    page.get_by_role("button", name="Texto flutuante").click()
    page.locator("#tf-texto").fill("Confira este comentário")
    palco = page.locator("#tf-palco").bounding_box()
    amostra = page.locator("#tf-amostra").bounding_box()
    page.mouse.move(amostra["x"] + amostra["width"]/2, amostra["y"] + amostra["height"]/2)
    page.mouse.down(); page.mouse.move(palco["x"] + palco["width"]*.78, palco["y"] + palco["height"]*.76, steps=5); page.mouse.up()
    page.get_by_role("button", name="Salvar texto").click()
    assert page.locator("#tut-etapas tbody tr").count() == 2
    page.get_by_role("button", name="Testar tutorial inteiro").click()
    teste = page.frame_locator("#tt-frame")
    teste.locator("#cadastrar.tk-tut-alvo").wait_for()
    teste.locator("#cadastrar").click()
    caixa = page.locator(".tut-texto-overlay")
    caixa.wait_for()
    antes = caixa.bounding_box()
    page.mouse.move(antes["x"] + 10, antes["y"] + 10); page.mouse.down(); page.mouse.move(140, 170, steps=5); page.mouse.up()
    depois = caixa.bounding_box()
    assert abs(antes["x"] - depois["x"]) > 10 or abs(antes["y"] - depois["y"]) > 10
    caixa.get_by_role("button", name="Continuar").click()
    assert "Tutorial concluído corretamente" in page.locator("#tt-guia").inner_text()
    page.get_by_role("button", name="Fechar teste").click()
    page.get_by_role("button", name="Salvar rascunho").click()
    page.wait_for_function("window.__saved.length === 1")
    saved = page.evaluate("window.__saved[0]")
    assert saved["titulo"] == "Cadastrar uma peça"
    assert saved["etapas"][0]["instrucao"] == "Toque neste controle"
    assert saved["etapas"][0]["selector"]
    assert saved["etapas"][1]["acao"] == "texto"
    assert saved["etapas"][1]["estilo"]["x"] > 60 and saved["etapas"][1]["estilo"]["y"] > 60
    browser.close()

print("tutorial_editor: OK")
