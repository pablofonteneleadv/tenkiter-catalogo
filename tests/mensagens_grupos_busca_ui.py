"""Abas fixas, pendentes progressivos e pesquisa global por identidade/canal/situação."""
import os,copy
from pathlib import Path
from playwright.sync_api import sync_playwright
from mock import install,SESSION,PERMS_ALL
from mensagens_filtros import tipos,aplicar
import mock_msg
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
OUT=Path('tests/saida/reparos/grupos-busca');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900),(390,470)]:
  ctx=b.new_context(viewport={'width':w,'height':h},service_workers='block');ctx.add_init_script(SESSION);st=install(ctx,perms=PERMS_ALL);s=mock_msg.novo_estado();st['ig']['msg']=s;template=copy.deepcopy(s['convs'][0]);s['convs']=[]
  entries=[(1,'whatsapp1','p1','Pablo',False,False),(2,'whatsapp2','p1','Alias vinculado',True,False),(3,'instagram','p1','Outro alias',True,True),(4,'instagram','p2','Pablo',True,True),(5,'instagram','p3','Pablo',True,False),(6,'whatsapp1','p3','Alias segundo',False,False)]
  for id,canal,pessoa,nome,atendido,fechado in entries:
   c=copy.deepcopy(template);c.update(id=id,canal=canal,pessoa_teste=pessoa,contato='55889900000'+str(id),nome=nome,atendido_em=mock_msg.iso(60) if atendido else '',encerrada_em=mock_msg.iso(40) if fechado else '',ultima_em=mock_msg.iso(id),ult_entrada_em=mock_msg.iso(80),grupo=0,nao_lidas=0,dono='Pablo' if atendido else '');s['convs'].append(c)
  g=copy.deepcopy(template);g.update(id=7,canal='whatsapp1',pessoa='',contato='grupo-interno',nome='Equipe interna',grupo=1,atendido_em='',encerrada_em='',nao_lidas=1);s['convs'].append(g)
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.wait_for_timeout(600)
  def ids():return pg.locator('#ms-lista .ms-conv').evaluate_all('es=>es.map(e=>Number(e.dataset.id))')
  assert pg.locator('#ms-tipos').is_visible();assert pg.locator('#ms-tipos [data-tipo=msg]').get_attribute('aria-pressed')=='true';assert 7 not in ids()
  tipos(pg,True,True);pg.wait_for_selector('#ms-lista .ms-conv[data-id="7"]');tipos(pg,False,True);pg.wait_for_function('document.querySelectorAll("#ms-lista .ms-conv").length===1');assert ids()==[7]
  pg.locator('#ms-lista .ms-conv').click();pg.wait_for_selector('#ms-mais-conv');pg.click('#ms-mais-conv');assert not pg.get_by_role('menuitem',name='Encerrar conversa',exact=True).count();pg.keyboard.press('Escape')
  if w<860:pg.click('#ms-conversa [data-ms=voltar]')
  pg.click('#ms-abas [data-aba=pendentes]');pg.wait_for_selector('#ms-lista .ms-conv[data-id="1"]');assert pg.locator('#ms-tipos').is_hidden();assert 7 not in ids()
  pg.wait_for_function('document.querySelector("#ms-abas [data-aba=pendentes]").dataset.alerta==="critico"')
  assert 'mais antigo' in pg.locator('#ms-abas [data-aba=pendentes]').get_attribute('aria-label')
  # Restore a restrictive list, then prove search disregards it in every tab.
  pg.click('#ms-abas [data-aba=atendimento]');tipos(pg,True,False);aplicar(pg,canal='whatsapp1',escopo='meus')
  for aba in ['atendimento','todos','encerrados','pendentes']:
   pg.click('#ms-abas [data-aba='+aba+']');pg.fill('#ms-busca','Pablo');pg.wait_for_function('document.querySelectorAll("#ms-lista .ms-conv").length===6');assert sorted(ids())==[1,2,3,4,5,6]
   assert pg.locator('#ms-lista .ms-vinculo-principal').count()==2;assert pg.locator('#ms-lista .ms-vinculada').count()==3
   assert pg.locator('.ms-situacao.encerrado').count()==2;assert pg.locator('.ms-situacao.pendente').count()==2;assert pg.locator('.ms-situacao.atendimento').count()==2
   assert not pg.locator('.ms-lista-secao').count();assert 'todos os canais' in pg.inner_text('#ms-busca-escopo');assert pg.locator('#ms-btn-filtros').is_disabled()
   if aba=='atendimento':
    for zoom in [100,130]:
     pg.evaluate('(n)=>document.documentElement.style.fontSize=n+"%"',zoom);assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');assert pg.locator('#ms-nav').evaluate('e=>e.getBoundingClientRect().bottom<=innerHeight+1');pg.screenshot(path=str(OUT/f'busca-{w}-{h}-{zoom}.png'))
    pg.evaluate('document.documentElement.style.fontSize="100%"')
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')));assert not pg.evaluate("async()=> (await axe.run(document.querySelector('#overlay-mensagens'))).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id)")
  pg.fill('#ms-busca','');pg.wait_for_selector('#ms-btn-filtros:enabled');assert 7 not in ids();assert not errors,errors;assert not s['envios'];print('OK',w,h,'tipos fixos, grupo interno, pendente crítico, busca global, 3 pessoas/6 canais, estados, zoom, teclado e axe',flush=True);ctx.close()
 b.close()
