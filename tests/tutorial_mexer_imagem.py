"""Tutorial: gesto na imagem (Enquadrar a foto). A gravação registra UMA etapa 'mexer na imagem'; no teste basta mexer (não repete o zoom gravado)."""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8766/"
TELA = """<canvas id='enq-cv' data-tut-interagir='Foto da peça' width=200 height=250 style='width:200px;height:250px;border:1px solid #000;touch-action:none'></canvas>
<button id='usar' onclick="window.usou=1">✔ Usar esta foto</button>"""

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
    page.locator("#tut-titulo").fill("Enquadrar")
    page.get_by_role("button", name="Gravação rápida").click()
    page.get_by_role("button", name="Começar a gravação daqui").click()
    fr = page.frame_locator("#tut-frame")
    box = fr.locator("#enq-cv").bounding_box()
    off = page.locator("#tut-frame").bounding_box()
    cx, cy = off["x"] + box["x"] + 100, off["y"] + box["y"] + 120
    page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx + 40, cy + 30, steps=5); page.mouse.up()
    page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx - 20, cy, steps=3); page.mouse.up()   # segundo gesto: não duplica
    fr.locator("#usar").click()
    page.get_by_role("button", name="Encerrar").click()
    n = page.locator("#tut-etapas tbody tr").count()
    assert n == 2, f"esperava 2 etapas (mexer na imagem + tocar), veio {n}"
    assert page.locator('[data-campo="acao"][data-i="0"]').input_value() == "interagir"
    assert "Mexa na imagem" in page.locator('[data-campo="instrucao"][data-i="0"]').input_value()
    assert page.locator('[data-campo="acao"][data-i="1"]').input_value() == "click"
    page.get_by_role("button", name="Testar tutorial inteiro").click()
    teste = page.frame_locator("#tt-frame")
    teste.locator("#enq-cv.tk-tut-alvo").wait_for()
    assert teste.locator(".tk-tut-seta").is_visible()
    # tocar fora é bloqueado
    page.wait_for_function("document.querySelector('#tt-guia').innerText.includes('Etapa 1 de 2')")
    b2 = teste.locator("#enq-cv").bounding_box(); o2 = page.locator("#tt-frame").bounding_box()
    x2, y2 = o2["x"] + b2["x"] + 60, o2["y"] + b2["y"] + 60
    # gesto DIFERENTE do gravado (só um toque + arrasto curto): basta mexer
    page.mouse.move(x2, y2); page.mouse.down(); page.mouse.move(x2 + 10, y2 + 90, steps=4); page.mouse.up()
    page.get_by_role("button", name="✔ Pronto, continuar").wait_for()
    page.mouse.move(x2, y2); page.mouse.down(); page.mouse.move(x2 + 30, y2, steps=3); page.mouse.up()   # pode continuar mexendo livremente
    assert "Etapa 1 de 2" in page.locator("#tt-guia").inner_text(), "não avança sozinho enquanto a pessoa mexe"
    page.get_by_role("button", name="✔ Pronto, continuar").click()
    page.wait_for_function("document.querySelector('#tt-guia').innerText.includes('Etapa 2 de 2')")
    teste.locator("#usar.tk-tut-alvo").wait_for()
    teste.locator("#usar").click()
    page.wait_for_function("document.querySelector('#tt-guia').innerText.includes('Tutorial concluído corretamente')")
    browser.close()
print("tutorial_mexer_imagem: OK")
