from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8766/"
TELA = """<style>#um{position:fixed;left:0;right:0;bottom:0;height:64px}</style>
<button id='um'>Um</button><button id='dois'>Dois</button>
<button id='tres'>Cadastrar nova peça</button><button id='quatro'>Adicionar foto</button>"""
TUTORIAL = {
    "id": "sequencia", "titulo": "Sequência", "descricao": "", "pagina": "index.html",
    "status": "publicado", "versao": 1, "preparacao": [],
    "etapas": [
        {"selector": f"#{nome}", "alvoNome": rotulo, "acao": "click", "regra": "acao",
         "valor": "", "instrucao": f"Toque em {rotulo}", "observacao": "", "erro": ""}
        for nome, rotulo in (("um", "Um"), ("dois", "Dois"),
                             ("tres", "Cadastrar nova peça"), ("quatro", "Adicionar foto"))
    ]
}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.route("**/index.html?tutorial_teste=1", lambda r: r.fulfill(
        status=200, content_type="text/html", body=TELA))
    page.goto(BASE + "404.html")
    page.evaluate("document.body.innerHTML='<div id=\"tut-aluno-slot\"></div>';window.TMV={init:function(){}}")
    page.add_script_tag(url=BASE + "tutorial-app.js")
    page.evaluate("""t => { TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),
      submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[t]}:{ok:true},toast:()=>{}});
      TKTutorial.montarAluno(); }""", TUTORIAL)
    page.get_by_role("button", name="Começar atividade").click()
    frame = page.frame_locator("#tt-frame")
    alvo_um = frame.locator("#um.tk-tut-alvo")
    alvo_um.wait_for()
    alvo_box = alvo_um.bounding_box()
    placa_box = frame.locator(".tk-tut-seta").bounding_box()
    assert placa_box["y"] + placa_box["height"] <= alvo_box["y"], "a placa não pode cobrir o menu inferior"
    card = page.locator("#tut-teste .tut-modal-card").bounding_box()
    visual_h = page.evaluate("visualViewport.height")
    assert abs(card["height"] - visual_h) <= 2, "o teste deve usar a altura visual real do celular"
    alvo_um.click()
    frame.locator("#dois.tk-tut-alvo").click()
    frame.locator("#tres.tk-tut-alvo").wait_for()
    assert "Etapa 3 de 4" in page.locator("#tt-guia").inner_text()
    frame.locator("#tres").evaluate("el => el.click()")
    page.wait_for_timeout(650)
    assert "Etapa 3 de 4" in page.locator("#tt-guia").inner_text(), "clique interno não pode consumir a etapa 3"
    frame.locator("#tres").click()
    frame.locator("#quatro.tk-tut-alvo").wait_for()
    assert "Etapa 4 de 4" in page.locator("#tt-guia").inner_text()
    assert page.locator("#tut-teste .tut-modal-card").evaluate("el => getComputedStyle(el).position") == "fixed"
    browser.close()

print("tutorial_nao_pula_etapa: OK")
