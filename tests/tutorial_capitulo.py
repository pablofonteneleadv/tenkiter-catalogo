from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8766/'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 for w,h in [(390,844),(412,915),(1440,900)]:
  pg=b.new_page(viewport={'width':w,'height':h})
  pg.route('**/index.html?tutorial_teste=1',lambda r:r.fulfill(status=200,content_type='text/html',body='<button id="feito">Concluir ação</button>'))
  pg.goto(BASE+'404.html')
  pg.evaluate("""document.body.innerHTML='<main><article class="chapter" data-requisitos="1"><div data-tutorial-inline="tut-cap"></div></article></main>';window.TMV={init:function(o){window.__cfg=o}};window.__concluiu=0;""")
  pg.add_script_tag(url=BASE+'tutorial-app.js')
  pg.evaluate("""TMV.init({state:function(){return {user:{whatsapp:'55',password:'s'}}},toast:function(){},submit:async function(p){if(p.action==='tutorial_listar')return {ok:true,tutoriais:[{id:'tut-cap',titulo:'Prática curta',descricao:'Faça dentro desta lição.',pagina:'index.html',manualId:'',tipo:'conteudo',status:'publicado',versao:1,etapas:[{selector:'#feito',alvoNome:'Concluir ação',acao:'click',regra:'acao',instrucao:'Toque em Concluir ação'}]}]};if(p.action==='tutorial_resultado')return {ok:true,conclusao:{versao:1,concluidoEm:new Date().toISOString()}};return {ok:true};}});TKTutorial.montarConteudos(document,'qualquer-manual',function(){window.__concluiu++})""")
  pg.get_by_role('button',name='Começar atividade').click()
  pg.frame_locator('#tt-frame').locator('#feito.tk-tut-alvo').wait_for()
  pg.frame_locator('#tt-frame').locator('#feito').click()
  pg.wait_for_function("document.querySelector('[data-tutorial-inline]').classList.contains('tut-inline-ok')",timeout=5000)
  pg.wait_for_function('window.__concluiu > 0')
  assert pg.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
  pg.close()
 b.close()
print('tutorial_capitulo: OK')
