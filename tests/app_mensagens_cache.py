"""Cache do app: leitura rápida, atualização, isolamento e logout; API simulada."""
import os,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8777/')
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for width,height in [(390,844),(412,915),(1440,900),(320,700)]:
  c=b.new_context(viewport={'width':width,'height':height});c.add_init_script(SESSION)
  st=install(c,perms=PERMS_ALL,versao='3.4');st['ig']['msg']=mock_msg.novo_estado()
  pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('.ms-conv');pg.locator('.ms-conv').first.click();pg.wait_for_selector('#ms-texto')
  saved=pg.evaluate("localStorage.getItem('tk_msg_recentes_v1')")
  assert saved and 'tk2.x.y' not in saved
  # Reabrir com API de mensagens indisponível: login continua sendo validado normalmente.
  pg.route('**/msg/conversas?*',lambda r:r.abort())
  pg.route('**/msg/mensagens?*',lambda r:r.abort())
  pg.reload();pg.wait_for_selector('.ms-conv',timeout=10000)
  pg.locator('.ms-conv').first.click();pg.wait_for_selector('#ms-texto')
  assert pg.locator('.ms-compor').get_attribute('inert') is not None
  assert pg.locator('#ms-fio').inner_text().strip()
  header=pg.locator('.ms-cab').bounding_box();assert header['y']>=0 and header['height']>=44,header
  assert pg.locator('#ms-texto').is_disabled()
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
  pg.screenshot(path=f'tests/saida/app-cache-{width}.png')
  # Ao voltar a rede, o dado recente substitui o salvo e libera a resposta.
  pg.unroute('**/msg/conversas?*');pg.unroute('**/msg/mensagens?*')
  pg.reload();pg.wait_for_selector('#overlay-mensagens.aberto .ms-conv');pg.locator('.ms-conv').first.click();pg.wait_for_selector('.ms-compor:not([inert]) #ms-texto')
  pg.evaluate("window.dispatchEvent(new Event('tk:mensagens-sair'))")
  assert pg.evaluate("localStorage.getItem('tk_msg_recentes_v1')") is None
  if width==390:
   pg.evaluate("v=>{const c=JSON.parse(v);c.dono='outra-conta';localStorage.setItem('tk_msg_recentes_v1',JSON.stringify(c));}",saved)
   pg.route('**/msg/conversas?*',lambda r:r.abort())
   pg.reload();pg.wait_for_timeout(1800)
   assert pg.locator('.ms-conv').count()==0,'Cache de outra sessão apareceu'
   pg.evaluate("v=>localStorage.setItem('tk_msg_recentes_v1',v)",saved)
   pg.route('**/msg/conversas?*',lambda r:r.fulfill(status=403,content_type='application/json',body=json.dumps({'ok':False,'erro':'Sem permissão'})))
   pg.reload();pg.wait_for_selector('#overlay-mensagens.aberto');pg.wait_for_timeout(500)
   assert pg.evaluate("localStorage.getItem('tk_msg_recentes_v1')") is None,'Recusa de acesso manteve cache'
   assert pg.locator('.ms-conv').count()==0
  assert not errors,errors
  c.close();print('OK cache',width,'offline somente leitura, atualização e limpeza')
 b.close()
