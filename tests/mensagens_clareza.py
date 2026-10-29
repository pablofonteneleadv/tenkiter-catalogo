"""Jornada da caixa compacta, filtros verticais e navegação; serviços simulados."""
import os
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8771/')
OUT=Path(os.environ.get('TK_EVID','/tmp/clareza-home'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
  ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True,is_mobile=w<600,service_workers='block');ctx.add_init_script(SESSION)
  st=install(ctx,perms=PERMS_ALL,versao='3.4');S=st['ig'].setdefault('msg',mock_msg.novo_estado())
  pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto(BASE+'admin.html');pg.wait_for_timeout(2600);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens');pg.wait_for_selector('#ms-lista .ms-conv')
  assert pg.locator('#ms-abas small').count()==0
  assert pg.locator('#ms-filtros button').count()==3
  for zoom in [100,130]:
   pg.evaluate('(s)=>document.documentElement.style.fontSize=s+"%"',zoom)
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   for sel in ['#ms-filtros','#ms-abas','#ms-nav']:
    assert pg.locator(sel).evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'),(w,zoom,sel)
   assert pg.locator('#ms-nav').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.top>=0}')
   pg.screenshot(path=str(OUT/f'home-{w}-{zoom}.png'))
  pg.evaluate('document.documentElement.style.fontSize="100%"')
  pg.click('[data-ms=filtros-abrir]');pg.wait_for_selector('#ms-gaveta')
  pg.check('[name=ms-ft-tipo][value=grp]');pg.uncheck('[name=ms-ft-tipo][value=msg]');pg.click('[data-ms=filtros-aplicar]');pg.wait_for_selector('#ms-lista .ms-conv[data-id="3"]')
  assert pg.locator('#ms-lista .ms-conv').count()==1
  pg.click('[data-ms=filtros-abrir]');pg.click('[data-ms=filtros-limpar]');pg.wait_for_selector('#ms-lista .ms-conv[data-id="1"]');assert not pg.locator('#ms-lista .ms-conv[data-id="3"]').count()
  pg.click('#ms-filtros [data-filtro=nao_lidas]');pg.wait_for_timeout(500);assert not pg.locator('#ms-lista .ms-conv[data-id="2"]').count()
  pg.click('#ms-nav [data-ms=inicio]');pg.wait_for_selector('#ms-lista .ms-conv[data-id="2"]')
  pg.click('#ms-nav [data-ms=menu-geral]');pg.wait_for_selector('.ms-mais-grupo');pg.screenshot(path=str(OUT/f'mais-{w}.png'))
  pg.keyboard.press('Escape');pg.wait_for_timeout(250);assert not pg.locator('#ms-gaveta').count()
  pg.click('#ms-nav [data-ms=funil]');pg.wait_for_timeout(800);pg.click('#ms-nav [data-ms=inicio]');pg.wait_for_timeout(800);assert pg.locator('#ms-lista').is_visible()
  pg.fill('#ms-busca','Maria');pg.wait_for_timeout(600);assert pg.locator('#ms-lista .ms-conv').count()==1
  pg.add_script_tag(path=str(Path(__file__).parent/'axe.min.js'))
  violations=pg.evaluate("async()=>{const r=await axe.run(document.getElementById('overlay-mensagens'));return r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id+':'+v.nodes.map(n=>n.target))}")
  assert not violations,violations
  assert not errs,errs
  ctx.close()
 b.close()
print('Clareza: filas, filtros, navegação, busca, teclado e acessibilidade aprovados em quatro telas e texto 130%.')
