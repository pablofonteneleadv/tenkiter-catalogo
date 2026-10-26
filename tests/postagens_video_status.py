import sys,os,subprocess,tempfile
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from mock import *
from playwright.sync_api import sync_playwright
root=tempfile.mkdtemp()
for duration,name in [(46,'long.mp4'),(25,'short.mp4')]:
 subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i','color=c=orange:s=160x240:r=10','-t',str(duration),'-c:v','libx264','-pix_fmt','yuv420p',root+'/'+name],check=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for width,height in [(390,844),(412,915),(1440,900),(320,700)]:
  c=b.new_context(viewport={'width':width,'height':height});c.add_init_script(SESSION);st=install(c,perms=PERMS_ALL,versao='4.3');g=st['ig'];g['regras']=True;st['midia']['modo']='ok'
  pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.goto(os.environ.get('TK_BASE','http://localhost:8765/')+'admin.html');pg.wait_for_timeout(2500);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-postagens');pg.wait_for_timeout(600);pg.get_by_role('button',name='✍️ Livre',exact=True).click()
  pg.locator('[data-destino=todos]').click()
  pg.locator('[data-destino=whatsapp]').click()
  pg.set_input_files('#po-livre-arq',root+'/long.mp4');pg.wait_for_timeout(700)
  pg.click('[data-a=enviar]');pg.wait_for_timeout(700)
  body=pg.locator('#overlay-postagens').inner_text();assert 'máximo' in body or 'limite' in body,body[-1000:]
  assert '30 segundos' in body and 'rascunho foi mantido' in body,body[:300]
  assert not [x for x in g['post_chamadas'] if x['path']=='/post']
  pg.locator('.po-aviso').first.scroll_into_view_if_needed() if pg.locator('.po-aviso').count() else None
  pg.screenshot(path=f'tests/saida/status-video-{width}.png',full_page=False)
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert pg.locator('[data-a=enviar]').is_enabled()
  # Troca para Instagram: o limite específico de Status não bloqueia outro canal.
  pg.locator('[data-destino=whatsapp]').click();pg.locator('[data-destino=instagram]').click()
  pg.click('[data-a=enviar]');pg.wait_for_timeout(1200)
  assert [x for x in g['post_chamadas'] if x['path']=='/post'], pg.locator('#overlay-postagens').inner_text()[:700] + repr(g['post_chamadas'])
  assert not errors,errors
  print('OK',width,'aviso e rascunho, sem envio e sem overflow')
  c.close()
