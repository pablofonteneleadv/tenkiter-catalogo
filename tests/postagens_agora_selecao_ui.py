"""Seleção imediata usa uma operação atômica; Worker local não publica."""
import os,sys,json,urllib.request,urllib.error
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
OUT=Path(os.environ.get('TK_EVID',str(Path(__file__).parent/'saida/reparos/agora-selecao')));OUT.mkdir(parents=True,exist_ok=True)
def api(path,body=None,headers=None,method=None):
 try:
  with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8774'+path,data=body,headers=headers or {},method=method)) as r:return r.status,r.read()
 except urllib.error.HTTPError as e:return e.code,e.read()
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox'])
 for width,height in [(390,844),(412,915),(1440,900),(320,700)]:
  api('/qa/reset');ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<500,is_mobile=width<500,service_workers='block');ctx.add_init_script(SESSION);st=install(ctx,perms=PERMS_ALL);calls=[]
  def route(r):
   q=urlsplit(r.request.url)
   if q.path in ['/posts','/post/reagendar-lote','/post/config']:
    code,data=api(q.path+('?' +q.query if q.query else ''),r.request.post_data_buffer,r.request.headers,r.request.method)
    if q.path=='/post/reagendar-lote':calls.append(r.request.post_data_json)
    return r.fulfill(status=code,body=data,content_type='application/json')
   return r.fallback()
  ctx.route('**/*',route);pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html');pg.wait_for_timeout(1500);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-postagens');pg.locator('#po-abas [data-aba=fila]').click();pg.locator('[data-fila-modo=midia]').click();pg.locator('[data-filmidia]').nth(1).check();pg.locator('[data-filmidia]').nth(2).check();assert '2 selecionadas' in pg.locator('.po-lote').inner_text()
  if width==320:pg.evaluate("document.documentElement.style.fontSize='130%'")
  assert pg.get_by_role('button',name='Horário da seleção',exact=True).is_visible();agora=pg.get_by_role('button',name='Postar seleção agora',exact=True);assert agora.is_visible();assert agora.evaluate('(e)=>e.getBoundingClientRect().height>=44');pg.screenshot(path=str(OUT/f'selecao-{width}.png'));pg.once('dialog',lambda d:d.accept());agora.focus();pg.keyboard.press('Enter');pg.wait_for_function("!document.querySelector('.po-lote')");assert len(calls)==1 and calls[0]['agora'] is True
  state=json.loads(api('/qa/estado')[1]);lote=json.loads(state['lote']['valor']);assert len(lote['grupos'])==2;fila=state['fila'];selected=[r for r in fila if r['origem_midia']!='qa-regular'];regular=[r for r in fila if r['origem_midia']=='qa-regular'];assert all(r['urgente']==1 for r in selected);assert len({r['agendado_em'] for r in selected})==1;assert min(r['agendado_em'] for r in regular)>max(r['agendado_em'] for r in selected);assert all(r['status']=='agendado' for r in fila)
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')));violations=pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}");assert not violations,violations;assert not errors,errors;assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');ctx.close();print('OK',width,'horário preservado, seleção agora atômica e fila afastada')
 browser.close()
