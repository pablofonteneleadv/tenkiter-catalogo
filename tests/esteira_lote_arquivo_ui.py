"""Descrição geral e arquivo reversível com endpoints reais e SQLite local."""
import os,json,urllib.request,urllib.error
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
base=Path(__file__).with_name('esteira_fotos_ui.py');ns={'__file__':str(base),'__name__':'base'}
exec(compile(base.read_text(encoding='utf-8').split('\nwith sync_playwright() as p:')[0],str(base),'exec'),ns)
OUT=Path(os.environ.get('TK_EVID',str(Path(__file__).parent/'saida/reparos/esteira-lote')));OUT.mkdir(parents=True,exist_ok=True)
def api(path,body=None,headers=None,method=None):
 try:
  with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8774'+path,data=body,headers=headers or {},method=method)) as r:return r.status,r.read()
 except urllib.error.HTTPError as e:return e.code,e.read()
def forward(route):
 q=urlsplit(route.request.url);status,data=api(q.path+('?' +q.query if q.query else ''),route.request.post_data_buffer,{**route.request.headers,'x-tk-whats':'88999999998'},route.request.method);route.fulfill(status=status,body=data,content_type='application/json')
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox'])
 for width,height in [(390,844),(412,915),(1440,900),(320,700)]:
  api('/qa/reset');ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<500,service_workers='block');st=ns['instalar'](ctx,admin=False);ns['fotos_srv'](ctx,st,admin=False)
  def route(r):
   q=urlsplit(r.request.url)
   if q.path in ['/esteira/caixa','/esteira/caixa/lote','/esteira/caixa/arquivar-proprias']:return forward(r)
   return r.fallback()
  ctx.route('**/*',route);ctx.route('https://midia.test/**',lambda r:r.fulfill(body=ns['PNG'],content_type='image/png'));pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));ns['entrar'](pg);pg.click('[data-aba=fotos]');pg.wait_for_selector('[data-caixa="1"]')
  if width==320:pg.evaluate("document.documentElement.style.fontSize='130%'")
  pg.screenshot(path=str(OUT/f'fotos-{width}.png'));pg.get_by_role('button',name='Editar descrição geral',exact=True).click();pg.get_by_label('Descrição geral',exact=True).fill('Descrição corrigida de todas as fotos deste envio.');pg.screenshot(path=str(OUT/f'editar-geral-{width}.png'));pg.get_by_role('button',name='Salvar descrição geral',exact=True).click();pg.wait_for_selector('[role=dialog][aria-label="Descrição geral do envio"]',state='detached')
  state=json.loads(api('/qa/estado')[1]);assert {x['descricao_lote'] for x in state['caixa']}=={'Descrição corrigida de todas as fotos deste envio.'};assert [x['descricao'] for x in state['caixa']]==['Individual 1','Individual 2']
  pg.on('dialog',lambda d:d.accept());pg.locator('[data-caixa="1"]').get_by_role('button',name='Arquivar foto',exact=True).click();pg.wait_for_timeout(500);state=json.loads(api('/qa/estado')[1]);assert state['caixa'][0]['status']=='descartada';pg.locator('[data-caixa="1"]').get_by_role('button',name='Restaurar foto',exact=True).click();pg.wait_for_timeout(500);state=json.loads(api('/qa/estado')[1]);assert state['caixa'][0]['status']=='nova'
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')));violations=pg.evaluate("async()=>{const r=await axe.run();return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}");assert not violations,violations;assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors;ctx.close();print('OK',width,'edição geral, descrições individuais e arquivo reversível')
 browser.close()
