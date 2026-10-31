import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://127.0.0.1:8766/')
with sync_playwright() as p:
 b=p.chromium.launch();pg=b.new_page(viewport={'width':390,'height':844});pg.set_default_timeout(7000)
 pg.route('**/index.html?tutorial_teste=1',lambda r:r.fulfill(content_type='text/html',body='''<input id="nome"><input id="preco"><button id="fim">Fim</button><script>document.querySelector('#preco').addEventListener('change',function(){this.value='89.99'})</script>'''))
 pg.goto(BASE+'404.html');pg.evaluate("document.body.innerHTML='<div id=\"tut-aluno-slot\"></div>';window.TMV={init:function(){}}")
 pg.add_script_tag(url=BASE+'tutorial-app.js')
 pg.evaluate('''TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),toast:()=>{},submit:async p=>({ok:true,tutoriais:[{id:'foco',titulo:'Foco',pagina:'index.html',status:'publicado',etapas:[{acao:'fill',selector:'#nome',alvoNome:'INPUT',instrucao:'Nome',regra:'exato',valor:'Vestido suplex',flutuante:true,estilo:{x:50,y:70}},{acao:'fill',selector:'#preco',alvoNome:'INPUT',instrucao:'Preço',regra:'exato',valor:'89.90'},{acao:'click',selector:'#fim',alvoNome:'Fim',instrucao:'Fim',regra:'acao'}]}]})});TKTutorial.montarAluno()''')
 pg.get_by_role('button',name='Começar atividade').click();f=pg.frame_locator('#tt-frame');f.locator('#nome.tk-tut-alvo').wait_for()
 assert pg.locator('.tut-texto-overlay').count()==1
 assert pg.locator('.tut-texto-overlay button').count()==0
 f.locator('#nome').fill('Errado');f.locator('#nome').press('Tab');pg.wait_for_timeout(200)
 assert f.locator('#nome').evaluate('e=>e===document.activeElement')
 assert f.locator('#preco').input_value()==''
 f.locator('#nome').fill('Vestido suplex');f.locator('#nome').press('Tab');f.locator('#preco.tk-tut-alvo').wait_for()
 f.locator('#preco').fill('89.90');f.locator('#preco').press('Tab');f.locator('#fim.tk-tut-alvo').wait_for()
 assert f.locator('#preco').input_value()=='89.99'
 b.close()
print('tutorial_foco_preco: OK')
