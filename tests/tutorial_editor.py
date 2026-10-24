from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8766/"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.route("**/index.html?tutorial_editor=1", lambda route: route.fulfill(
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
    page.get_by_role("button", name="Selecionar elemento na tela").click()
    frame = page.frame_locator("#tut-frame")
    frame.locator("body").wait_for()
    alvo = frame.locator("#cadastrar")
    alvo.evaluate("el => setTimeout(() => el.click(), 0)")
    page.locator("#te-inst").fill("Toque neste controle")
    page.locator("#te-obs").fill("Confira o destaque laranja")
    page.locator("#te-acao").select_option("click")
    page.locator("#te-regra").select_option("acao")
    page.get_by_role("button", name="Adicionar etapa").click()
    assert page.locator("#tut-etapas .tut-linha").count() == 1
    page.get_by_role("button", name="Salvar rascunho").click()
    page.wait_for_function("window.__saved.length === 1")
    saved = page.evaluate("window.__saved[0]")
    assert saved["titulo"] == "Cadastrar uma peça"
    assert saved["etapas"][0]["instrucao"] == "Toque neste controle"
    assert saved["etapas"][0]["selector"]
    browser.close()

print("tutorial_editor: OK")
