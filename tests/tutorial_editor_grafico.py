import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://127.0.0.1:8766/')
OUT=Path(__file__).parent/'saida';OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 for w,h in [(390,844),(412,915),(1440,900),(320,700)]:
  pg=b.new_page(viewport={'width':w,'height':h});pg.set_default_timeout(7000)
  pg.route('**/index.html?tutorial_editor=1',lambda r:r.fulfill(status=200,content_type='text/html',body='<style>body{font:18px Arial;padding:20px}button{padding:16px;margin:20px}</style><h1>Cadastro</h1><button id="original">Cadastrar</button><button id="novo">Escolher foto</button><input id="nome" placeholder="Nome da peça">'))
  pg.goto(BASE+'404.html');pg.evaluate("document.body.innerHTML='<div id=\"tut-editor-slot\"></div>';window.TMV={init:function(){}};window.__saved=[]")
  pg.add_script_tag(url=BASE+'tutorial-app.js')
  pg.evaluate('''TMV.init({state:()=>({user:{whatsapp:'88',password:'s'},manuaisList:[]}),toast:()=>{},submit:async p=>{if(p.action==='treinamento_conteudo')return {ok:true,manuais:[]};if(p.action==='tutorial_listar')return {ok:true,tutoriais:[{id:'t',titulo:'Cadastro',pagina:'index.html',tipo:'independente',etapas:[{acao:'click',selector:'#original',alvoNome:'Cadastrar',instrucao:'Abra cadastro',regra:'acao'},{acao:'texto',instrucao:'Confira a foto',estilo:{x:50,y:35,tamanho:18}}]}]};if(p.action==='tutorial_salvar'){window.__saved.push(p.tutorial);return {ok:true,tutorial:p.tutorial}};return {ok:true}}});TKTutorial.montarEditor()''')
  pg.locator('[data-edit="t"]').click();pg.locator('[data-ed="0"]').click()
  pg.frame_locator('#tv-frame').locator('#novo').wait_for();pg.locator('#tv-painel').click()
  pg.locator('[data-tv="instrucao"]').fill('Escolha a foto correta')
  pg.locator('#tv-alvo').click();pg.frame_locator('#tv-frame').locator('#novo').click()
  assert 'Escolher foto' in pg.locator('#tv-status').inner_text()
  pg.locator('#tv-painel').click();pg.locator('#tv-flutuante').check();pg.locator('#tv-enquadrar').click();pg.locator('#tv-recolher').click();
  pg.locator('#tv-proxima').click();pg.locator('#tv-painel').click()
  pg.locator('[data-tv="instrucao"]').fill('Confira o enquadramento da foto antes de continuar.')
  pg.locator('.tv-config summary').click();pg.locator('[data-estilo="tamanho"]').fill('22')
  pg.locator('#tv-recolher').click();box=pg.locator('.tv-texto');box.focus();box.press('ArrowRight');box.press('ArrowDown')
  assert 'enquadramento' in box.inner_text()
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
  pg.screenshot(path=str(OUT/f'editor-grafico-{w}.png'))
  pg.locator('#tv-anterior').click();pg.locator('#tv-painel').click()
  assert pg.locator('[data-tv="instrucao"]').input_value()=='Escolha a foto correta'
  pg.locator('#tv-salvar').click();pg.locator('#tut-salvar').click();pg.wait_for_function('__saved.length===1')
  saved=pg.evaluate('__saved[0]');assert saved['etapas'][0]['flutuante'];assert 'enquadramento' in saved['etapas'][0];assert len(saved['etapas'])==2;assert saved['etapas'][0]['selector']=='#novo';assert saved['etapas'][1]['estilo']['tamanho']==22
  assert saved['etapas'][1]['estilo']['x']==51
  pg.close()
 b.close()
print('tutorial_editor_grafico: OK (4 viewports, alvo, texto, formato, posição, navegação, persistência)')
