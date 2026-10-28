"""Notificação, Voltar, recriação da Activity, áudio nativo e escolha visual de anexos."""
import os,subprocess
from pathlib import Path
from mock import install,SESSION,PERMS_ALL,PNG
from mock_msg import novo_estado
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8765/');OLD=os.environ.get('TK_BASELINE')=='1'
OUT=Path(os.environ.get('TK_EVIDENCE_DIR',str(Path(__file__).parent/'saida')))/'android-retomada';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
  ctx=browser.new_context(viewport={'width':w,'height':h},has_touch=True,is_mobile=w<600,service_workers='block');ctx.add_init_script(SESSION)
  ctx.add_init_script("""window.nativeSavedConversation=0;window.nativeBackCallbacks=0;window.TKAndroid={versao:()=> '2.4.5',audioNativo:()=>true,lista:()=>{window.nativeSavedConversation=0;window.nativeBackCallbacks++;}};window.nativeNotification=(id,request)=>{window.nativeSavedConversation=id;window.TKMobileOpenConversation(id,false,request)};""")
  st=install(ctx,perms=PERMS_ALL,versao='3.7');st['ig']['msg']=novo_estado()
  if OLD:
   for file in ['app-mensagens.js','admin-mensagens.js']:
    code=subprocess.check_output(['git','show','9311ffba2ebbe6214d996425c70eba54639bc7e7:'+file],text=True)
    ctx.route('**/'+file+'*',lambda r,request,code=code:r.fulfill(body=code,content_type='application/javascript'))
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv')
  pg.evaluate("window.nativeNotification(1,'notificacao-1')");pg.wait_for_selector('#ms-texto');(pg.locator('.ms-voltar').evaluate('(el)=>el.click()') if w>=860 else pg.locator('.ms-voltar').click());pg.wait_for_function("document.querySelector('#ms-app').dataset.vista==='lista'")
  saved=pg.evaluate('window.nativeSavedConversation')
  if OLD:
   assert saved==1;pg.evaluate("if(window.nativeSavedConversation)window.TKMobileOpenConversation(window.nativeSavedConversation,false,'activity-restaurada')");pg.wait_for_selector('#ms-texto');assert pg.locator('#ms-app').get_attribute('data-vista')=='conversa';ctx.close();continue
  assert saved==0
  pg.evaluate("window.TKMobileOpenConversation(1,false,'notificacao-1')");pg.wait_for_timeout(200);assert pg.locator('#ms-app').get_attribute('data-vista')=='lista','reentrega reabriu conversa após Voltar'
  pg.evaluate("if(window.nativeSavedConversation)window.TKMobileOpenConversation(window.nativeSavedConversation,false,'activity-restaurada')");pg.wait_for_timeout(150);assert pg.locator('#ms-app').get_attribute('data-vista')=='lista'
  # A new notification still opens a different conversation, even if history cannot push states.
  pg.evaluate("history.pushState=()=>{throw new DOMException('Histórico indisponível','SecurityError')};window.nativeNotification(4,'notificacao-2')");pg.wait_for_selector('#ms-texto')
  assert pg.evaluate("TKCamadas.aberta('ms-conversa')") is False
  assert pg.evaluate('window.TKMobileBack()') is True;pg.wait_for_function("document.querySelector('#ms-app').dataset.vista==='lista'")
  pg.evaluate("window.nativeNotification(1,'notificacao-3')");pg.wait_for_selector('#ms-texto')
  with pg.expect_file_chooser() as fc:
   if w==390:pg.locator('#ms-mic').focus();pg.keyboard.press('Enter')
   else:pg.locator('#ms-mic').click()
  capture=fc.value;assert capture.element.get_attribute('accept')=='audio/mp4';assert capture.element.get_attribute('capture')=='user'
  assert not st['ig']['msg']['envios']
  capture.set_files({'name':'gravacao.m4a','mimeType':'audio/mp4','buffer':b'\x00\x00\x00\x18ftypM4A fake'})
  pg.wait_for_selector('#ms-stage audio');assert not st['ig']['msg']['envios'];assert pg.locator('#ms-enviar').is_enabled()
  pg.evaluate('document.documentElement.style.fontSize="130%"')
  if w<600:pg.set_viewport_size({'width':w,'height':470})
  pg.screenshot(path=str(OUT/f'audio-previa-{w}.png'));assert pg.locator('body').evaluate('(b)=>b.scrollWidth<=innerWidth+1')
  pg.locator('#ms-enviar').click();pg.wait_for_timeout(300);assert len(st['ig']['msg']['envios'])==1
  if w<600:pg.set_viewport_size({'width':w,'height':h})
  if w==390:
   pg.locator('#ms-mais-conv').click()
   with pg.expect_file_chooser() as ac:pg.get_by_role('menuitem',name='Enviar áudio de arquivo',exact=True).click()
   assert ac.value.element.get_attribute('accept')=='audio/*';ac.value.set_files([])
  with pg.expect_file_chooser() as fc:pg.locator('#ms-anexar').click()
  assert fc.value.element.get_attribute('accept')=='image/*,video/*'
  pg.evaluate("window.nativeNotification(4,'notificacao-4')");pg.wait_for_selector('#ms-texto')
  fc.value.set_files({'name':'foto.png','mimeType':'image/png','buffer':PNG});pg.wait_for_timeout(300)
  assert pg.locator('#ms-stage').is_hidden(),'arquivo de outra conversa foi colocado no atendimento atual'
  assert not errors,errors
  ctx.close()
 browser.close()
print('Baseline reproduz conversa restaurada após Voltar.' if OLD else 'Notificação/Voltar/recriação/reentrega, áudio com prévia e seletor visual isolado por conversa: 4 viewports aprovadas.')
