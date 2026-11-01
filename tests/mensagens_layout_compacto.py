"""Layout real do modo APK: espaço útil, filtros, homônimos, toque e continuidade."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
from mock import install,SESSION,PERMS_ALL
from mensagens_filtros import aplicar,valor
import mock_msg
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
OUT=Path('tests/saida/reparos/layout');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900),(390,470)]:
  ctx=b.new_context(viewport={'width':w,'height':h},service_workers='block');ctx.add_init_script(SESSION);ctx.add_init_script('window.TKAndroid={versao:()=>"2.4.21",telaMensagensVisivel:()=>true};')
  st=install(ctx,perms=PERMS_ALL);s=mock_msg.novo_estado();st['ig']['msg']=s
  s['etq_mock']=[{'id':1,'nome':'Novo cliente','cor':'cinza','venda':1,'pessoas':0}]
  for i,c in enumerate(s['convs']):
   if c['id'] in [1,2]:c['nome']='Cliente com o mesmo nome'
   c['dono']='Ana' if i==0 else 'Atendente com nome longo';c['relacionamento']={'pontos':57,'totalEventos':2}
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.wait_for_timeout(500)
  if w==390 and h==844:
   pg.evaluate("document.documentElement.style.setProperty('--ms-safe-bottom','60px')")
   assert pg.locator('#ms-nav').evaluate('e=>getComputedStyle(e).paddingBottom==="6px"')
   pg.evaluate("document.documentElement.classList.remove('tk-app-nativo')")
   assert pg.locator('#ms-nav').evaluate('e=>getComputedStyle(e).paddingBottom==="66px"')
   pg.evaluate("document.documentElement.classList.add('tk-app-nativo');document.documentElement.style.removeProperty('--ms-safe-bottom')")
  initial=pg.locator('#ms-lista .ms-conv').evaluate_all('es=>es.map(e=>e.dataset.id)')
  assert pg.locator('#ms-filtros').is_hidden()
  assert pg.locator('.ms-homonimo .ms-fone').count()==2
  assert pg.locator('.ms-homonimo .ms-fone').evaluate_all('es=>es.every(e=>e.getBoundingClientRect().height>0)')
  assert pg.locator('#ms-lista-wrap').bounding_box()['y']<=230 if w<600 else True
  for zoom in [100,130]:
   pg.evaluate('(n)=>document.documentElement.style.fontSize=n+"%"',zoom)
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert pg.locator('#ms-nav').evaluate('e=>{let r=e.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.top>=0&&getComputedStyle(e).paddingBottom==="6px"}')
   assert pg.locator('#ms-nav button').evaluate_all('es=>es.every(e=>e.getBoundingClientRect().height>=44)')
   assert pg.locator('#ms-lista .ms-l3').evaluate_all('es=>es.every(e=>e.scrollWidth<=e.clientWidth+1)')
   pg.screenshot(path=str(OUT/f'lista-{w}-{h}-{zoom}.png'))
  pg.evaluate('document.documentElement.style.fontSize="100%"')
  # Cancelar não aplica; todos os filtros antigos seguem disponíveis no painel.
  pg.click('#ms-btn-filtros');pg.select_option('[name=ms-ft-canal]','whatsapp2');pg.keyboard.press('Escape');pg.wait_for_selector('#ms-gaveta',state='detached');assert pg.locator('#ms-lista .ms-conv').evaluate_all('es=>es.map(e=>e.dataset.id)')==initial
  aplicar(pg,escopo='meus');assert valor(pg,'escopo')=='meus';assert 'Só meus' in pg.inner_text('#ms-filtros')
  pg.click('#ms-btn-filtros');pg.click('[data-ms=filtros-limpar]');pg.wait_for_selector('#ms-filtros',state='hidden')
  aplicar(pg,canal='whatsapp1');assert valor(pg,'canal')=='whatsapp1';assert 'WhatsApp 1' in pg.inner_text('#ms-filtros')
  pg.click('#ms-btn-filtros');pg.check('[name=ms-ft-resposta]');pg.screenshot(path=str(OUT/f'filtros-{w}-{h}.png'));pg.keyboard.press('Escape');pg.wait_for_selector('#ms-gaveta',state='detached')
  pg.click('#ms-btn-filtros');pg.click('[data-ms=filtros-limpar]')
  aplicar(pg,canal='whatsapp1',escopo='meus',resposta=True,fila='nao_lidas',etapa='1')
  assert pg.locator('#ms-filtros button').count()==3
  assert pg.locator('#ms-filtros button').last.inner_text().startswith('+')
  pg.click('#ms-btn-filtros');pg.click('[data-ms=filtros-limpar]')
  if w==390 and h==844:
   pg.click('#ms-btn-filtros');pg.uncheck('[name=ms-ft-tipo][value=msg]');pg.uncheck('[name=ms-ft-tipo][value=grp]');pg.click('[data-ms=filtros-aplicar]');assert pg.locator('#ms-gaveta').is_visible();assert 'Escolha mensagens individuais ou grupos' in pg.inner_text('#ms-aviso');pg.keyboard.press('Escape');pg.wait_for_selector('#ms-gaveta',state='detached')
   pg.click('#ms-btn-filtros');pg.check('[name=ms-ft-tipo][value=grp]');pg.uncheck('[name=ms-ft-tipo][value=msg]');pg.click('[data-ms=filtros-aplicar]')
   aplicar(pg,canal='instagram');assert 'Grupos' not in pg.inner_text('#ms-filtros');assert s['consultas'][-1]['tipo']=='individual'
   pg.click('#ms-btn-filtros');pg.click('[data-ms=filtros-limpar]')
  pg.click('#ms-nav [data-ms=menu-geral]');pg.click('[data-ms=lista-continua]');assert not pg.locator('.ms-lista-secao').count()
  pg.click('#ms-nav [data-ms=menu-geral]');pg.click('[data-ms=lista-dividida]');assert pg.locator('.ms-lista-secao').count()
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
  assert not pg.evaluate("async()=> (await axe.run(document.querySelector('#overlay-mensagens'))).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id)")
  pg.locator('#ms-lista .ms-conv').first.click();pg.wait_for_selector('#ms-fio');
  if pg.locator('[data-ms=atender]').count():pg.click('[data-ms=atender]')
  pg.wait_for_selector('#ms-texto');pg.fill('#ms-texto','Rascunho do layout');pg.set_viewport_size({'width':w,'height':470});pg.wait_for_function('document.querySelector("#ms-enviar").getBoundingClientRect().bottom<=innerHeight+1')
  pg.click('.ms-relacionamento-abrir');pg.wait_for_selector('#ms-gaveta');pg.keyboard.press('Escape');pg.wait_for_selector('#ms-gaveta',state='detached');assert pg.input_value('#ms-texto')=='Rascunho do layout'
  assert not s['envios'];assert not errors,errors
  print('OK',w,h,'layout, filtros, cancelar/limpar, ordem, alternância, rascunho, teclado, axe e nenhum envio',flush=True);ctx.close()
 b.close()
