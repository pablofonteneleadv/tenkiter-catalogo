"""Notificação -> conversa salva -> Voltar, com rede atrasada. Sem serviços reais."""
import os
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8765/');OUT=Path(os.environ.get('TK_EVID','/workspace/artifacts/notificacao-voltar'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
  ctx=browser.new_context(viewport={'width':w,'height':h},has_touch=True,is_mobile=w<600,service_workers='block');ctx.add_init_script(SESSION);ctx.add_init_script('window.TK_MENSAGENS_POLL_MS=250;')
  st=install(ctx,perms=PERMS_ALL,versao='3.7');pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv[data-id="1"]')
  pg.evaluate('window.TKMobileOpenConversation(1)');pg.wait_for_selector('#ms-texto');pg.wait_for_timeout(150)
  # The first response warms the real local cache, just as a previously opened chat.
  pg.evaluate("document.querySelector('#ms-conversa .ms-voltar').click()") if w>=900 else pg.click('#ms-conversa .ms-voltar');pg.wait_for_function("document.querySelector('#ms-app').dataset.vista==='lista'")
  pg.evaluate("""(()=>{const original=window.fetch;window.releaseChat=[];window.fetch=(url,opts)=>String(url).includes('/msg/mensagens?conversa=')?new Promise(resolve=>window.releaseChat.push(()=>window.failHeldChat?resolve(new Response(JSON.stringify({ok:false,erro:'Sem conexão',semRede:true}),{status:503})):original(url,opts).then(resolve))):original(url,opts);return true})()""")
  next(c for c in st['ig']['msg']['convs'] if c['id']==1)['nao_lidas']=2
  read_before=len(st['ig']['msg']['lidas'])
  pg.evaluate('window.TKMobileOpenConversation(1)');pg.wait_for_selector('#ms-cache-status')
  pg.screenshot(path=str(OUT/f'antes-voltar-{w}.png'))
  pg.evaluate("document.querySelector('#ms-conversa .ms-voltar').click()") if w>=900 else pg.click('#ms-conversa .ms-voltar');pg.wait_for_function("document.querySelector('#ms-app').dataset.vista==='lista'")
  # A late response must not reopen the conversation or mark it read after leaving.
  pg.evaluate('window.releaseChat.splice(0).forEach(release=>release())');pg.wait_for_timeout(800)
  pg.screenshot(path=str(OUT/f'depois-voltar-{w}.png'))
  assert pg.evaluate("document.querySelector('#ms-app').dataset.vista")=='lista',(w,'resposta atrasada reabriu a conversa')
  assert not pg.locator('#ms-cache-status').is_visible()
  assert len(st['ig']['msg']['lidas'])==read_before,'resposta atrasada marcou leitura após sair'
  # Repeated taps must keep the root list and allow selecting a different chat.
  pg.evaluate("for(let i=0;i<8;i++)document.querySelector('#ms-conversa .ms-voltar')?.click()")
  pg.wait_for_timeout(300);assert pg.locator('#overlay-mensagens').evaluate("e=>e.classList.contains('aberto')")
  pg.locator('#ms-lista .ms-conv[data-id="4"]').click();pg.wait_for_function('window.releaseChat.length>0')
  pg.evaluate('window.releaseChat.splice(0).forEach(release=>release())');pg.wait_for_selector('#ms-texto');pg.wait_for_timeout(200)
  assert 'João' in pg.locator('.ms-cab .ms-quem').inner_text()
  if w<600:
   assert pg.evaluate('window.TKMobileBack()') is True;pg.wait_for_timeout(300)
   assert pg.evaluate("document.querySelector('#ms-app').dataset.vista")=='lista'
  if w==390:
   pg.set_viewport_size({'width':390,'height':480});pg.evaluate("document.documentElement.style.fontSize='130%';window.failHeldChat=true")
   pg.evaluate('window.TKMobileOpenConversation(1)');pg.wait_for_selector('#ms-cache-status')
   arrow=pg.locator('#ms-conversa .ms-voltar');r=arrow.bounding_box();assert r['width']>=44 and r['height']>=44
   arrow.focus();pg.keyboard.press('Enter');pg.wait_for_function("document.querySelector('#ms-app').dataset.vista==='lista'")
   pg.evaluate('window.releaseChat.splice(0).forEach(release=>release())');pg.wait_for_timeout(350)
   assert pg.evaluate("document.querySelector('#ms-app').dataset.vista")=='lista'
   pg.screenshot(path=str(OUT/'lista-altura480-texto130.png'))
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
  ctx.close()
 browser.close()
print('Notificação, cache, resposta atrasada, toques repetidos e Voltar do Android: 4 viewports aprovadas.')
