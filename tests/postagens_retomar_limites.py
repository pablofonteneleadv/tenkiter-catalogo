"""Retomar só pendentes: limite visível, recibos preservados e retry estável; serviços simulados."""
import os,datetime,base64
from pathlib import Path
from playwright.sync_api import sync_playwright
from mock import install,SESSION,PERMS_ALL
BASE=os.getenv('TK_BASE','http://localhost:8794/');OUT=Path(os.getenv('TK_EVID','/tmp/postagens-retomar'));OUT.mkdir(parents=True,exist_ok=True)
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=')
now=datetime.datetime.now(datetime.timezone.utc)
def iso(d):return d.isoformat().replace('+00:00','Z')
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900),(390,470)]:
  ctx=b.new_context(viewport={'width':w,'height':h},service_workers='block');ctx.add_init_script(SESSION);ctx.add_init_script('window.TK_POSTAGENS_POLL_MS=600;')
  st=install(ctx,perms=PERMS_ALL,versao='7.52.0');g=st['ig'];g['regras']=True
  def item(id,status,canal):return {'id':id,'tipo':'story','modo':'auto','canal':canal,'status':status,'agendadoEm':iso(now-datetime.timedelta(hours=1)),'publicadoEm':iso(now-datetime.timedelta(hours=1)) if status=='publicado' else '', 'criadoEm':iso(now-datetime.timedelta(hours=2)),'criadoPor':'Equipe de teste','origemMidia':'foto-exemplo','legenda':'Conjunto de teste','midias':[{'url':'https://res.cloudinary.com/demo/image/upload/fixture.jpg','tipo':'imagem'}]}
  g['posts']=[item(1,'publicado','instagram'),item(2,'publicado','whatsapp'),item(3,'agendado','grupo'),item(4,'agendado','whatsapp2'),item(5,'processando','whatsapp2')]
  for x in g['posts'][2:4]:x['espera']={'motivo':'limite24h','limites':[{'canal':'grupo' if x['canal']=='grupo' else 'status2','usadas':40,'limite':40}],'retomaEm':iso(now+datetime.timedelta(hours=2))}
  ctx.route('https://res.cloudinary.com/**',lambda r:r.fulfill(body=PNG,content_type='image/png'))
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html');pg.wait_for_selector('#btn-abrir-postagens',state='attached');pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-postagens');pg.locator('#po-abas [data-aba=fila]').click();pg.wait_for_selector('[data-a=retoma-abrir]')
  assert 'Limite 40/40' in pg.locator('#po-corpo').inner_text();pg.locator('[data-a=retoma-abrir]').click();pg.wait_for_selector('[data-retoma90]');pg.locator('[data-retoma90]').check();pg.wait_for_timeout(850);assert pg.locator('[data-retoma90]').is_checked(),'Polling preserva opção'
  for scale in [100,130]:
   pg.evaluate('(x)=>document.documentElement.style.fontSize=x+"%"',scale)
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   bt=pg.locator('[data-a=retoma-executar]');bt.scroll_into_view_if_needed();r=bt.bounding_box();assert r['height']>=44 and r['width']>=44
   assert r['x']>=0 and r['x']+r['width']<=w+1 and r['y']>=0 and r['y']+r['height']<=h+1
   pg.screenshot(path=str(OUT/f'retomar-{w}-{h}-{scale}.png'))
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')));violacoes=pg.evaluate("async()=> (await axe.run(document.getElementById('po-corpo'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations");assert not violacoes,violacoes
  g['retoma_falha_apos_gravar']=True;pg.locator('[data-a=retoma-executar]').click();pg.wait_for_timeout(300);assert pg.locator('[data-retoma90]').is_checked();pg.locator('[data-a=retoma-executar]').click();pg.wait_for_timeout(500)
  calls=[x['corpo'] for x in g['post_chamadas'] if x['path']=='/post/retomar-pendentes'];assert len(calls)==2;assert calls[0]['ids']==[3,4];assert calls[0]['limitePorCanal']==90;assert calls[0]['idLocal']==calls[1]['idLocal'];assert g['posts'][0]['status']=='publicado' and g['posts'][1]['status']=='publicado' and g['posts'][4]['status']=='processando'
  assert len(g['retomas'])==1;assert not errors,errors;ctx.close()
 b.close()
print('Retomada:5telas100/130%, limite40/40 visível, opção preservada no polling, retryidempotente e publicados preservados.')
