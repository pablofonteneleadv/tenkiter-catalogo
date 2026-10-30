"""Filas compactas, Todos/Meus e combinações sem serviços reais."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from mock import install,SESSION,PERMS_ALL
import mock_msg
BASE=os.getenv('TK_BASE','http://localhost:8783/')
OUT=Path(os.getenv('TK_EVID',str(Path(__file__).parent/'evidencias_edicao'/'filas')));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900),(390,470)]:
  ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=w<600,service_workers='block');ctx.add_init_script(SESSION)
  st=install(ctx,perms=PERMS_ALL,versao='4.28');s=st['ig']['msg']=mock_msg.novo_estado()
  for c in s['convs']:c['em_atendimento']=int(c['id'] in [1,2]);c['dono']='Pablo' if c['id']==1 else 'Outra pessoa'
  s['saude']={'alerta':True,'tipo':'entrada','pendentes':2,'desde':mock_msg.iso(3)}
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv[data-id="4"]')
  assert pg.locator('#ms-lista .ms-conv[data-id="1"]').count()==0
  for scale in [100,130]:
   pg.evaluate('(x)=>document.documentElement.style.fontSize=x+"%"',scale)
   assert pg.locator('#ms-nav').evaluate('e=>e.getBoundingClientRect().bottom<=innerHeight+1')
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   for v in ['esperando','em_atendimento']:
    r=pg.locator(f'#ms-filtros [data-fila="{v}"]').bounding_box();assert r['width']>=44 and r['height']>=44
   pg.screenshot(path=str(OUT/f'esperando-{w}-{h}-{scale}.png'))
  pg.locator('#ms-filtros [data-fila="em_atendimento"]').click();pg.wait_for_selector('#ms-lista .ms-conv[data-id="1"]');assert pg.locator('#ms-lista .ms-conv').count()==2
  assert pg.locator('#ms-atendimento-escopo').input_value()=='todos'
  pg.select_option('#ms-atendimento-escopo','meus');pg.wait_for_function('document.querySelectorAll("#ms-lista .ms-conv").length===1');assert pg.locator('#ms-lista .ms-conv[data-id="1"]').count()==1
  for scale in [100,130]:
   pg.evaluate('(x)=>document.documentElement.style.fontSize=x+"%"',scale)
   assert pg.locator('#ms-nav').evaluate('e=>e.getBoundingClientRect().bottom<=innerHeight+1')
   assert pg.locator('#ms-atendimento-escopo').evaluate('e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.right<=innerWidth}')
   pg.screenshot(path=str(OUT/f'em-atendimento-{w}-{h}-{scale}.png'))
  pg.reload();pg.wait_for_selector('#ms-filtros [data-fila="em_atendimento"]');pg.locator('#ms-filtros [data-fila="em_atendimento"]').click();pg.wait_for_selector('#ms-atendimento-escopo');assert pg.locator('#ms-atendimento-escopo').input_value()=='todos';pg.wait_for_function('document.querySelectorAll("#ms-lista .ms-conv").length===2')
  pg.click('[data-ms=filtros-abrir]');pg.select_option('[name=ms-ft-fila]','nao_lidas');pg.click('[data-ms=filtros-aplicar]');pg.wait_for_function('document.querySelectorAll("#ms-lista .ms-conv").length===1')
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')));vs=pg.evaluate("async()=> (await axe.run(document.getElementById('overlay-mensagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations");assert not vs,vs
  assert not errors,errors;ctx.close()
 b.close()
print('Filas: Esperando/Em atendimento, Todos/Meus e reload, filtros,5telas100/130%, saúde, navegação e axe aprovados.')
