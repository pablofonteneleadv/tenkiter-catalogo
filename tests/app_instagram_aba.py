"""Conversas Instagram: mesmas pessoas em Todas e na aba específica, inclusive não lidas."""
import os,copy
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
from mock_msg import novo_estado,iso
from playwright.sync_api import sync_playwright
OUT=Path('/workspace/artifacts/instagram-aba');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(390,844),(412,915),(1440,900),(320,700)]:
  ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=True,service_workers='block');ctx.add_init_script(SESSION)
  st=install(ctx,perms=PERMS_ALL,versao='3.7');s=st['ig']['msg']=novo_estado();s['ig_pronto']=True
  ig=copy.deepcopy(next(c for c in s['convs'] if c['canal']=='instagram'))
  s['convs']=[c for c in s['convs'] if c['canal']!='instagram']+[dict(ig,id=100+i,contato='ig-'+str(i),nome='Pessoa Instagram '+str(i),nao_lidas=1 if i<2 else 0,ultima_em=iso(i)) for i in range(5)]
  s['etq_mock']=[{'id':21,'nome':'Reserva','cor':'ambar','pessoas':1}];s['convs'][0]['etiquetas']=s['etq_mock']
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.goto(os.environ.get('TK_BASE','http://localhost:8765/')+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv[data-id="100"]')
  for turn in range(3):
   pg.click('[data-ms=aba][data-canal=instagram]');pg.wait_for_timeout(500)
   ids=pg.locator('#ms-lista .ms-conv').evaluate_all('(rows)=>rows.map(x=>Number(x.dataset.id))')
   pg.screenshot(path=str(OUT/f'instagram-{w}.png'))
   assert set(ids)==set(range(100,105)),(w,turn,ids,errors,pg.locator('#ms-extra').inner_text())
   pg.click('[data-ms=filtro][data-filtro=nao_lidas]');pg.wait_for_timeout(300)
   assert pg.locator('#ms-lista .ms-conv').count()==2
   pg.click('[data-ms=aba][data-canal=todos]');pg.wait_for_timeout(300)
  # WhatsApp's group selector is hidden in Instagram and must not silently filter its DMs.
  pg.click('[data-ms=tipo][data-tipo=msg]');pg.wait_for_timeout(250)
  pg.click('[data-ms=aba][data-canal=instagram]');pg.wait_for_timeout(350)
  assert pg.locator('#ms-lista .ms-conv').count()==5,(w,'Instagram herdou filtro invisível de grupos',s.get('consultas',[])[-1])
  assert pg.locator('#ms-lista').is_visible()
  # Channel changes already clear search/status; they must clear a tag from the other channel too.
  pg.click('[data-ms=aba][data-canal=todos]');pg.click('[data-ms=tipo][data-tipo=msg]');pg.wait_for_timeout(150)
  pg.click('[data-ms=etq][data-id="21"]');pg.wait_for_timeout(250)
  assert pg.locator('#ms-lista .ms-conv').count()==1
  pg.click('[data-ms=aba][data-canal=instagram]');pg.wait_for_timeout(350)
  assert pg.locator('#ms-lista .ms-conv').count()==5,(w,'Instagram herdou etiqueta do outro canal',s.get('consultas',[])[-1])
  assert pg.locator('[data-ms=etq][aria-pressed=true]').count()==0
  assert not errors,errors
  ctx.close()
 b.close()
print('Instagram/ Todas/ não lidas e alternância repetida: 4 viewports aprovadas.')
