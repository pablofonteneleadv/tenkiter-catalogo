from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8766/'
TELA='<button id="botao-que-nao-existe" onclick="window.errado=(window.errado||0)+1">Dicas de enquadramento</button><button id="botao-atual" onclick="window.ok=(window.ok||0)+1">Aplicar a todas (9)</button>'
TUT={'id':'antigo','titulo':'Antigo','descricao':'','pagina':'index.html','status':'publicado','versao':1,'preparacao':[],'etapas':[{'selector':'#botao-que-nao-existe','alvoNome':'Aplicar a todas (7)','acao':'click','regra':'acao','valor':'','instrucao':'Toque em Aplicar a todas (7)','observacao':'','erro':''}]}
with sync_playwright() as p:
    b=p.chromium.launch(headless=True); page=b.new_page(viewport={'width':390,'height':844})
    page.route('**/index.html?tutorial_teste=1',lambda r:r.fulfill(status=200,content_type='text/html',body=TELA))
    page.goto(BASE+'404.html'); page.evaluate("document.body.innerHTML='<div id=\"tut-aluno-slot\"></div>';window.TMV={init:function(){}}")
    page.add_script_tag(url=BASE+'tutorial-app.js')
    page.evaluate("""t=>{TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[t]}:{ok:true},toast:()=>{}});TKTutorial.montarAluno()}""",TUT)
    page.get_by_role('button',name='Começar tutorial').click(); f=page.frame_locator('#tt-frame')
    f.locator('#botao-atual.tk-tut-alvo').wait_for(); f.locator('#botao-atual').click()
    assert 'Tutorial concluído corretamente' in page.locator('#tt-guia').inner_text()
    assert f.locator('body').evaluate('()=>window.ok')==1
    assert f.locator('body').evaluate('()=>window.errado||0')==0
    b.close()
print('tutorial_seletor_antigo: OK')
