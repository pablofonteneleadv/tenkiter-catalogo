"""Aviso compacto de entrada preservada, retry e erro; APIs inteiramente simuladas."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from mock import install,SESSION,PERMS_ALL
import mock_msg
BASE=os.getenv('TK_BASE','http://localhost:8781/');OUT=Path(os.getenv('TK_EVID',str(Path(__file__).parent/'evidencias_edicao'/'confiabilidade')));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900),(390,470)]:
  ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=w<600,service_workers='block');ctx.add_init_script(SESSION)
  st=install(ctx,versao='4.28',perms=PERMS_ALL);s=st['ig'].setdefault('msg',mock_msg.novo_estado());s['saude']={'alerta':True,'tipo':'entrada','pendentes':2,'desde':mock_msg.iso(3)}
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html');pg.wait_for_timeout(2300)
  pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.wait_for_selector('#ms-saude:not([hidden])')
  assert 'Mensagens guardadas' in pg.locator('#ms-saude').inner_text()
  assert 'não estão chegando' not in pg.locator('#ms-saude').inner_text()
  for scale in [100,130]:
   pg.evaluate('(s)=>document.documentElement.style.fontSize=s+"%"',scale)
   bt=pg.locator('[data-ms=entrada-reprocessar]');r=bt.bounding_box();assert r['width']>=44 and r['height']>=44
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert pg.locator('#ms-nav').evaluate('(e)=>e.getBoundingClientRect().bottom<=innerHeight+1')
   height=pg.locator('#ms-saude').bounding_box()['height'];assert height<=110,(w,h,scale,height)
   pg.screenshot(path=str(OUT/f'entrada-{w}-{h}-{scale}.png'))
  pg.evaluate('document.documentElement.style.fontSize="100%"')
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
  vio=pg.evaluate("async()=> (await axe.run(document.querySelector('#ms-saude'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations")
  assert not vio,vio
  s['reprocessar_erro']=True;pg.click('[data-ms=entrada-reprocessar]');pg.wait_for_timeout(200)
  assert pg.locator('[data-ms=entrada-reprocessar]').is_enabled()
  assert 'Tente novamente' in pg.locator('#ms-aviso').inner_text()
  s['reprocessar_erro']=False;pg.click('[data-ms=entrada-reprocessar]');pg.wait_for_timeout(200)
  assert len(s.get('reprocessamentos',[]))==2
  assert 'Nova tentativa iniciada' in pg.locator('#ms-aviso').inner_text()
  pg.locator('#ms-busca').fill('Maria');pg.wait_for_timeout(400);assert pg.locator('#ms-lista .ms-conv').count()==1
  for tipo,titulo in [('anexos','Anexos aguardando'),('webhook','Falha no recebimento')]:
   s['saude']={'alerta':True,'tipo':tipo,'desde':mock_msg.iso(3),'canal':'whatsapp1','cod':503}
   pg.evaluate("window.dispatchEvent(new Event('focus'))")
   pg.wait_for_function('(txt)=>document.getElementById("ms-saude").textContent.includes(txt)',arg=titulo)
   pg.evaluate('document.documentElement.style.fontSize="130%"')
   med=pg.locator('#ms-saude').bounding_box()['height']
   pg.screenshot(path=str(OUT/f'{tipo}-{w}-{h}.png'))
   assert med<=110,(tipo,w,h,med)
   if tipo=='webhook':assert pg.locator('[data-ms=entrada-reprocessar]').count()==0
   pg.screenshot(path=str(OUT/f'{tipo}-{w}-{h}.png'))
  assert not errors,errors
  ctx.close()
 b.close()
print('Saúde da entrada: aviso compacto, toque44, navegação, reprocessar/erro, busca e axe em cinco telas × texto100/130%.')
