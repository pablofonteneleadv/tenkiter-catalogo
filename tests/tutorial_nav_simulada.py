from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8766/"
TELA = "<h1>Catálogo</h1><script src='nav.js' data-ativo='catalogo'></script>"
TUTORIAL = {
    "id": "nav", "titulo": "Barra", "descricao": "", "pagina": "index.html",
    "status": "publicado", "versao": 1, "preparacao": [],
    "etapas": [{"selector": "[data-nav=gestao]", "alvoNome": "Gestão", "acao": "click", "regra": "acao",
                "valor": "", "instrucao": "Toque em Gestão", "observacao": "", "erro": ""}]
}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.route("**/index.html?tutorial_teste=1", lambda r: r.fulfill(status=200, content_type="text/html", body=TELA))
    page.goto(BASE + "404.html")
    page.evaluate("document.body.innerHTML='<div id=\"tut-aluno-slot\"></div>';window.TMV={init:function(){}}")
    page.add_script_tag(url=BASE + "nav.js")
    page.add_script_tag(url=BASE + "tutorial-app.js")
    page.evaluate("""t => { TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),
      submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[t]}:{ok:true},toast:()=>{}});
      TKTutorial.montarAluno(); }""", TUTORIAL)
    page.get_by_role("button", name="Começar atividade").click()
    frame = page.frame_locator("#tt-frame")
    frame.locator("[data-nav=gestao].tk-tut-alvo").wait_for(timeout=8000)
    assert frame.locator(".tk-tut-seta").is_visible(), "a placa TOQUE AQUI deve aparecer"
    browser.close()
print("tutorial_nav_simulada: OK")

# App unificado: a barra do app (fora do iframe do treinamento) some enquanto o teste está aberto e volta ao fechar.
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.goto(BASE + "404.html")
    page.add_script_tag(url=BASE + "nav.js")
    page.wait_for_selector(".tk-nav")
    page.evaluate("window.postMessage({tipo:'tk-tutorial-teste',ativo:true}, location.origin)")
    page.wait_for_function("getComputedStyle(document.querySelector('.tk-nav')).display==='none'")
    page.evaluate("window.postMessage({tipo:'tk-tutorial-teste',ativo:false}, location.origin)")
    page.wait_for_function("getComputedStyle(document.querySelector('.tk-nav')).display!=='none'")
    browser.close()
print("barra do app ok")

# Janela fixa com rolagem interna (ex.: "Enquadrar a foto"): o alvo no fim da janela precisa ser rolado até aparecer.
JANELA = """<div id=sheet style='position:fixed;inset:0;overflow:auto;background:#fff'>
<div style='height:1400px'>conteúdo longo</div><button id=usar>✔ Usar esta foto</button><div style='height:200px'></div></div>"""
TUT2 = dict(TUTORIAL, id="janela", etapas=[{"selector": "#usar", "alvoNome": "Usar esta foto", "acao": "click", "regra": "acao",
            "valor": "", "instrucao": "Toque em Usar esta foto", "observacao": "", "erro": ""}])
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.route("**/index.html?tutorial_teste=1", lambda r: r.fulfill(status=200, content_type="text/html", body=JANELA))
    page.goto(BASE + "404.html")
    page.evaluate("document.body.innerHTML='<div id=\"tut-aluno-slot\"></div>';window.TMV={init:function(){}}")
    page.add_script_tag(url=BASE + "tutorial-app.js")
    page.evaluate("""t => { TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),
      submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[t]}:{ok:true},toast:()=>{}});
      TKTutorial.montarAluno(); }""", TUT2)
    page.get_by_role("button", name="Começar atividade").click()
    fr = page.frame_locator("#tt-frame")
    fr.locator("#usar.tk-tut-alvo").wait_for(timeout=8000)
    dentro = fr.locator("#usar").evaluate("e => { const r=e.getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight }")
    assert dentro, "o botão no fim da janela com rolagem interna deve ser rolado até ficar visível"
    browser.close()
print("janela com rolagem ok")
