"""Lista por resposta: ordem por cliente, alternância persistente e nenhum envio."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from mock import install, SESSION, PERMS_ALL
import mock_msg

BASE=os.environ.get('TK_BASE','http://localhost:8773/')
OUT=Path(__file__).parent/'saida/reparos/gestor';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
  ctx=b.new_context(viewport={'width':w,'height':h},service_workers='block');ctx.add_init_script(SESSION)
  st=install(ctx,perms=PERMS_ALL);s=mock_msg.novo_estado();st['ig']['msg']=s
  s['convs']=[c for c in s['convs'] if c['id'] in [1,2,4]]
  for c in s['convs']:
   c['ultima_em']=mock_msg.iso({1:60,2:1,4:10}[c['id']]);c['aguarda_resposta']=int(c['id']==1)
   if c['id'] in [1,4]:c['pessoa']='cliente-vinculada'
   if c['id']!=1:c.update(nao_lidas=0,ult_dir='saida')
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  def abrir():
   pg.goto(BASE+'admin.html');pg.wait_for_timeout(1500);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.wait_for_timeout(700)
  def ids():return pg.locator('#ms-lista .ms-conv').evaluate_all('xs=>xs.map(x=>Number(x.dataset.id))')
  abrir();assert ids()==[4,1,2],ids();assert pg.locator('.ms-lista-secao').count()==2
  assert pg.locator('#ms-lista .ms-vinculada .ms-conv').get_attribute('data-id')=='1','Canais vinculados permanecem juntos'
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
  assert not pg.evaluate("async()=> (await axe.run(document.querySelector('#overlay-mensagens'))).violations.filter(x=>['serious','critical'].includes(x.impact)).map(x=>x.id)")
  pg.screenshot(path=str(OUT/f'lista-dividida-{w}.png'))
  pg.click('#ms-nav [data-ms=menu-geral]');pg.click('[data-ms=lista-continua]');assert ids()==[2,4,1],ids();assert pg.locator('.ms-lista-secao').count()==0
  abrir();assert ids()==[2,4,1],'Preferência mantida ao reabrir'
  pg.click('#ms-nav [data-ms=menu-geral]');pg.locator('[data-ms=lista-dividida]').focus();pg.keyboard.press('Enter');assert ids()==[4,1,2]
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not s['envios'];assert not errors,errors
  print('OK',w,'seções, cliente vinculado, cronologia, preferência, teclado e axe',flush=True);ctx.close()
 b.close()
