"""Vídeos Status: seleção, troca de destino e envio. Serviços externos simulados."""
import sys,os,subprocess,tempfile,shutil
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from mock import *
from playwright.sync_api import sync_playwright
root=tempfile.mkdtemp()
for duration,name in [(46,'longo.mp4'),(25,'curto.mp4')]:
 subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i','color=c=orange:s=160x240:r=10','-t',str(duration),'-c:v','libx264','-pix_fmt','yuv420p',root+'/'+name],check=True)
shutil.copyfile(root+'/longo.mp4',root+'/longo-2.mp4')
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for width,height in [(390,844),(412,915),(1440,900),(320,700)]:
  c=b.new_context(viewport={'width':width,'height':height});c.add_init_script(SESSION);st=install(c,perms=PERMS_ALL,versao='4.3');g=st['ig'];g['regras']=True;st['midia']['modo']='ok'
  pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.goto(os.environ.get('TK_BASE','http://localhost:8765/')+'admin.html');pg.wait_for_timeout(2500);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-postagens');pg.wait_for_timeout(600);pg.get_by_role('button',name='✍️ Livre',exact=True).click()
  pg.locator('[data-destino=todos]').click();pg.locator('[data-destino=whatsapp]').click()
  assert '30 s e 10 MB' in pg.locator('label[for=po-livre-arq]').inner_text()
  pg.set_input_files('#po-livre-arq',[root+'/longo.mp4',root+'/longo-2.mp4']);pg.wait_for_timeout(800)
  body=pg.locator('#overlay-postagens').inner_text()
  assert '30 segundos' in body and 'longo.mp4' in body and 'longo-2.mp4' in body
  assert pg.locator('[data-lm=x]').count()==0,'Vídeo inválido entrou na lista'
  assert not [x for x in g['post_chamadas'] if x['path']=='/post']
  pg.locator('.po-aviso').first.scroll_into_view_if_needed();pg.screenshot(path=f'tests/saida/status-selecao-{width}.png',full_page=False)
  pg.set_input_files('#po-livre-arq',root+'/curto.mp4');pg.wait_for_timeout(700)
  assert pg.locator('[data-lm=x]').count()==1,'Vídeo válido recusado'
  pg.locator('[data-destino=whatsapp]').click();pg.locator('[data-destino=instagram]').click()
  assert '40 MB' in pg.locator('label[for=po-livre-arq]').inner_text()
  pg.set_input_files('#po-livre-arq',root+'/longo.mp4');pg.wait_for_timeout(700)
  assert pg.locator('[data-lm=x]').count()==2,'Instagram foi bloqueado'
  pg.locator('[data-destino=whatsapp2]').click();pg.wait_for_timeout(800)
  assert '30 segundos' in pg.locator('.po-aviso').first.inner_text(),'Troca para Status não conferiu o vídeo'
  assert pg.locator('[data-lm=x]').count()==2,'Troca apagou o rascunho'
  pg.click('[data-a=enviar]');pg.wait_for_timeout(700)
  assert not [x for x in g['post_chamadas'] if x['path']=='/post']
  assert pg.locator('[data-a=enviar]').is_enabled()
  pg.locator('[data-destino=whatsapp2]').click();pg.click('[data-a=enviar]');pg.wait_for_timeout(1500)
  assert [x for x in g['post_chamadas'] if x['path']=='/post'],'Instagram foi bloqueado indevidamente'
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors
  print('OK',width,'seleção recusa ambos; curto aceito; troca confere; rascunho preservado; Instagram liberado')
  c.close()
shutil.rmtree(root)
