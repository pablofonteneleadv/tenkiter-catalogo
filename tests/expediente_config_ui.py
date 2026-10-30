"""Configuração de expediente e mensagens do acompanhamento; só serviços simulados."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from mock import install, SESSION, PERMS_ALL
import mock_msg
BASE=os.getenv('TK_BASE','http://localhost:8783/')
OUT=Path(os.getenv('TK_EVID',str(Path(__file__).parent/'evidencias_edicao'/'expediente')));OUT.mkdir(parents=True,exist_ok=True)
def validar_axe(pg):
 if not pg.evaluate('!!window.axe'): pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
 assert pg.locator('.ms-gaveta-painel').count()==1
 violacoes=pg.evaluate("async()=> (await axe.run(document.querySelector('.ms-gaveta-painel'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations")
 assert not violacoes,violacoes
with sync_playwright() as pw:
 b=pw.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900),(390,470)]:
  ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=w<600,service_workers='block');ctx.add_init_script(SESSION)
  st=install(ctx,perms=PERMS_ALL,versao='4.28');s=st['ig']['msg']=mock_msg.novo_estado()
  s['auto']={'boasVindas':{'ligado':False,'texto':'Olá, já vamos atender.'},'foraHorario':{'ligado':False,'texto':'Retornamos {abertura}.'},'feriados':[],
   'expediente':{'semana':{str(i):([] if i==0 else [[450,840 if i==6 else 1080]]) for i in range(7)},'excecoes':{}},
   'acompanhamento':{'textoLembrete':'{saudacao} amiga, passando para saber se deu certo.','mensagemFinal':False,'textoFinal':''}}
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.click('#ms-nav [data-ms=menu-geral]');pg.click('[data-ms=auto-cfg]');pg.wait_for_selector('#ms-acomp-texto-config')
  pg.get_by_text('Horário semanal',exact=True).click();pg.get_by_label('Fecha · Segunda 1',exact=True).fill('12:00')
  seg=pg.locator('.ms-exp-dia').filter(has=pg.locator('legend',has_text='Segunda'));seg.get_by_role('button',name='Adicionar intervalo',exact=True).click()
  pg.get_by_label('Abre · Segunda 2',exact=True).fill('13:00');pg.get_by_label('Fecha · Segunda 2',exact=True).fill('17:00')
  for scale in [100,130]:
   pg.evaluate('(s)=>document.documentElement.style.fontSize=s+"%"',scale)
   pg.get_by_label('Abre · Segunda 2',exact=True).scroll_into_view_if_needed()
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert pg.locator('[data-ms=auto-salvar]').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.height>=44}')
   pg.screenshot(path=str(OUT/f'expediente-{w}-{h}-{scale}.png'))
  validar_axe(pg)
  pg.evaluate('document.documentElement.style.fontSize="100%"');pg.get_by_text('Exceções por data',exact=True).click();pg.locator('#ms-exp-data').fill('2026-11-15');pg.get_by_role('button',name='Adicionar exceção',exact=True).click()
  pg.locator('#ms-acomp-final-config').check();pg.get_by_label('Mensagem ao encerrar o acompanhamento',exact=True).fill('Encerramos por enquanto. Quando precisar, pode nos chamar.')
  pg.locator('#ms-acomp-texto-config').fill('{saudacao} amiga, posso ajudar?');pg.click('[data-ms=auto-salvar]');pg.wait_for_function('document.getElementById("ms-auto-status").textContent==="Salvo."')
  body=s['auto_posts'][-1];assert body['expediente']['semana']['1']==[[450,720],[780,1020]];assert body['expediente']['excecoes']['2026-11-15']==[]
  assert body['acompanhamento']['mensagemFinal'] and body['acompanhamento']['textoFinal'].startswith('Encerramos');assert body['acompanhamento']['textoLembrete']=='{saudacao} amiga, posso ajudar?'
  validar_axe(pg)
  assert not errors,errors;ctx.close()
 b.close()
print('Expediente: semana com pausa, exceção fechada, mensagem final opcional e persistência em cinco telas × texto100/130 aprovados.')
