"""Renovação de credencial não é troca de pessoa; logout/troca seguem isolados."""
import os,subprocess
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
from mock_msg import novo_estado
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8765/')
OLD=os.environ.get('TK_BASELINE')=='1'
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
  ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=True,service_workers='block');ctx.add_init_script(SESSION)
  ctx.add_init_script("""(()=>{const f=window.fetch;window.holdLists=true;window.pendingLists=[];window.fetch=(url,opt)=>String(url).includes('/msg/conversas?')&&window.holdLists?new Promise(resolve=>window.pendingLists.push(()=>f(url,opt).then(resolve))):f(url,opt);})()""")
  st=install(ctx,perms=PERMS_ALL,versao='3.7');st['ig']['msg']=novo_estado()
  if OLD:
   source=subprocess.check_output(['git','show','9311ffba2ebbe6214d996425c70eba54639bc7e7:admin-mensagens.js'],text=True)
   ctx.route('**/admin-mensagens.js*',lambda r:r.fulfill(body=source,content_type='application/javascript'))
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_function('window.pendingLists.length>0')
  pg.evaluate("salvarSessao('+55 (88) 99999-9999','tk3.credencial-renovada');window.holdLists=false;window.pendingLists.splice(0).forEach(f=>f())")
  if OLD:
   pg.wait_for_timeout(500);assert 'A conta mudou' in pg.locator('#ms-extra').inner_text();ctx.close();continue
  pg.wait_for_selector('#ms-lista .ms-conv');assert 'A conta mudou' not in pg.locator('#ms-extra').inner_text()
  # Old-token authorization failure is retried once with the already renewed token.
  pg.evaluate("""(()=>{const f=window.fetch;window.rotateOnce=true;window.fetch=async(url,opt)=>{if(String(url).includes('/msg/mensagens?')&&window.rotateOnce){window.rotateOnce=false;salvarSessao('88999999999','tk3.segunda-renovacao');return new Response(JSON.stringify({ok:false,erro:'Sessão antiga'}),{status:401});}return f(url,opt);};})()""")
  pg.evaluate("window.TKMobileOpenConversation(1,true,'renew-test-1')");pg.wait_for_selector('#ms-texto',state='attached');assert pg.locator('.ms-espiando').is_visible()
  (pg.locator('.ms-voltar').evaluate('(el)=>el.click()') if w>=860 else pg.locator('.ms-voltar').click());pg.wait_for_function("document.querySelector('#ms-app').dataset.vista==='lista'")
  # No concurrent token was saved: refresh this expired credential, then retry once.
  pg.evaluate("""(()=>{const f=window.fetch;window.refreshOnce=true;window.fetch=async(url,opt)=>{if(String(url).includes('/msg/mensagens?')&&window.refreshOnce){window.refreshOnce=false;return new Response(JSON.stringify({ok:false,erro:'Credencial antiga'}),{status:401});}if(String(url).startsWith(API_URL)&&opt&&opt.body&&JSON.parse(opt.body).action==='sessao')return new Response(JSON.stringify({ok:true,sessao:'tk3.terceira-renovacao',usuario:Object.assign({},usuarioAdmin,{whatsapp:'88999999999'})}));return f(url,opt);}})()""")
  pg.evaluate("window.TKMobileOpenConversation(1,true,'renew-test-2')");pg.wait_for_selector('#ms-texto',state='attached');assert pg.evaluate('getSessao().sessao')=='tk3.terceira-renovacao'
  (pg.locator('.ms-voltar').evaluate('(el)=>el.click()') if w>=860 else pg.locator('.ms-voltar').click())
  # Response from before a genuine account switch must never populate the new account's screen.
  # A fresh wrapper specifically holds this request after the first wrapper was rotated.
  pg.evaluate("""(()=>{const f=window.fetch;window.releaseOther=null;window.fetch=(url,opt)=>String(url).includes('/msg/mensagens?')?new Promise(resolve=>window.releaseOther=()=>f(url,opt).then(resolve)):f(url,opt)})()""")
  pg.evaluate("window.TKMobileOpenConversation(4,true,'other-test')");pg.wait_for_function('window.releaseOther!==null')
  pg.evaluate("salvarSessao('88911112222','tk3.outra-conta');window.releaseOther()")
  pg.wait_for_timeout(400);assert not pg.locator('#ms-fio').count() or 'João' not in pg.locator('#ms-fio').inner_text()
  if w==390:
   # A late credential-renewal response must not switch the account back.
   pg.evaluate("""salvarSessao('88999999999','tk3.antes-da-troca');(()=>{const f=window.fetch;window.failAuthOnce=true;window.releaseAuth=null;window.fetch=(url,opt)=>{if(String(url).includes('/msg/mensagens?')&&window.failAuthOnce){window.failAuthOnce=false;return Promise.resolve(new Response(JSON.stringify({ok:false}),{status:401}));}if(String(url).startsWith(API_URL)&&opt&&opt.body&&JSON.parse(opt.body).action==='sessao')return new Promise(resolve=>window.releaseAuth=()=>resolve(new Response(JSON.stringify({ok:true,sessao:'tk3.resposta-antiga',usuario:Object.assign({},usuarioAdmin,{whatsapp:'88999999999'})}))));return f(url,opt);};})();window.TKMobileOpenConversation(1,true,'auth-em-atraso');true""")
   pg.wait_for_function('window.releaseAuth!==null');pg.evaluate("salvarSessao('88911112222','tk3.conta-atual');window.releaseAuth()");pg.wait_for_timeout(300)
   assert pg.evaluate('getSessao().whatsapp')=='88911112222'
  assert not errors,errors
  ctx.close()
 browser.close()
print('Baseline reproduz renovação como troca de conta.' if OLD else 'Renovação durante resposta, retry do token antigo e troca real de pessoa: 4 viewports aprovadas.')
