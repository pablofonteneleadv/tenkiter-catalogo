import os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://127.0.0.1:8766/')
OUT=Path(__file__).parent/'saida';OUT.mkdir(exist_ok=True)
T=[
 {'id':'ind','titulo':'Atendimento pelo WhatsApp','descricao':'Pratique a resposta ao cliente.','pagina':'index.html','status':'publicado','versao':2,'manualId':'','etapas':[{'selector':'#busca','alvoNome':'Buscar','acao':'fill','regra':'preenchido','instrucao':'Procure uma peça'}]},
 {'id':'hib','titulo':'Prática do cadastro','descricao':'Faça o cadastro guiado.','pagina':'admin.html','status':'publicado','versao':1,'manualId':'1','etapas':[{'selector':'#busca-admin','alvoNome':'Buscar','acao':'fill','regra':'preenchido','instrucao':'Procure uma peça'}], 'conclusao':{'concluidoEm':'2026-10-25T12:00:00Z','versao':1,'acertos':1,'erros':0,'duracaoSeg':30}}
]
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h,n in [(390,844,'mobile'),(412,915,'mobile-grande'),(1440,900,'desktop')]:
  c=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=w<600);c.add_init_script(SESSION);st=install(c);st['tutorials']=[dict(x) for x in T]
  pg=c.new_page();pg.goto(BASE+'treinamentos.html');pg.wait_for_timeout(2600)
  assert pg.locator('text=Prática de postagens').count()==0
  assert pg.locator('#tut-aluno-slot [data-play="ind"]').count()==1
  if pg.locator('.card').count():
   box=pg.locator('.card').first.bounding_box();assert box and box['height']<220,(n,box)
  pg.evaluate("document.querySelector('#tut-aluno-slot').insertAdjacentHTML('afterend','<div id=\"tut-manual-slot\"></div>');TKTutorial.montarManual('1')")
  pg.wait_for_timeout(500)
  assert pg.locator('#tut-manual-slot [data-play="hib"]').count()==1
  assert 'Concluído em' in pg.locator('#tut-manual-slot').inner_text()
  pg.screenshot(path=str(OUT/f'cursos-{n}.png'),full_page=True)
  c.close()
 b.close()
print('cursos_interativos: OK')
