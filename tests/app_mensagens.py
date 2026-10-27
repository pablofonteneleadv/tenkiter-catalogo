import os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://127.0.0.1:8777/')
OUT=Path(__file__).parent/'saida';OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(390,844),(412,915),(1440,900),(320,700)]:
  c=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=w<600);c.add_init_script(SESSION)
  st=install(c,perms=PERMS_ALL,versao='3.4');st['ig']['msg']=mock_msg.novo_estado()
  pg=c.new_page();requests=[];pg.on('request',lambda r:requests.append(r.url));errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('.ms-conv',timeout=15000)
  assert not pg.locator('main').is_visible()
  assert not pg.locator('#ms-fechar').is_visible()
  pg.locator('.ms-conv').first.click();pg.wait_for_selector('#ms-texto')
  assert not any('action=list&todos=true' in u for u in requests),'Catálogo carregou antes de Produtos'
  pg.locator('[data-ms=gaveta-produtos]').click();pg.wait_for_selector('.ms-prod',timeout=10000)
  pg.locator('[data-ms=gaveta-fechar]').click()
  pg.locator('#ms-texto').fill('Resposta de teste para a cliente')
  assert pg.locator('#ms-texto').input_value()=='Resposta de teste para a cliente'
  pg.locator('#ms-enviar').click();pg.wait_for_timeout(300)
  assert st['ig']['msg']['envios'] and 'Resposta de teste' in st['ig']['msg']['envios'][-1]['texto']
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
  pg.screenshot(path=str(OUT/f'app-mensagens-{w}.png'))
  pg.evaluate("window.TKMobileSubscription('',false)")
  assert 'Avisos' in pg.locator('#mobile-push-status').inner_text()
  # Simula redução da área útil pelo teclado: o compositor continua dentro da viewport.
  if w<600:
   pg.set_viewport_size({'width':w,'height':480});pg.wait_for_timeout(300)
   r=pg.locator('#ms-texto').bounding_box();assert r['y']+r['height']<=480,(w,r)
  assert not errors,errors
  c.close()
 b.close()
print('app_mensagens: OK')
