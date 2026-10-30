"""Agendar e Acompanhar: jornada com APIs simuladas, sem envio externo."""
import os, base64, datetime
from pathlib import Path
from playwright.sync_api import sync_playwright
from mock import install, SESSION, PERMS_ALL
import mock_msg
BASE=os.getenv('TK_BASE','http://localhost:8783/')
OUT=Path(os.getenv('TK_EVID',str(Path(__file__).parent/'evidencias_edicao'/'agendar')));OUT.mkdir(parents=True,exist_ok=True)
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=')
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
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.locator('.ms-conv[data-id="1"]').click();pg.wait_for_selector('#ms-texto');pg.locator('#ms-texto').fill('Rascunho da conversa')
  agenda=pg.locator('#ms-assina [data-ms=agenda-opcoes]');r=agenda.bounding_box();assert r['width']>=44 and r['height']>=44
  agenda.click();pg.wait_for_selector('#ms-acompanhar:enabled');pg.locator('#ms-acompanhar').check();pg.wait_for_function('document.getElementById("ms-acomp-status").textContent.includes("Lembrete previsto")')
  assert len(s['acompanhamento_posts'])==1
  for scale in [100,130]:
   pg.evaluate('(s)=>document.documentElement.style.fontSize=s+"%"',scale)
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert pg.locator('#ms-gaveta .ms-gaveta-cab button').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.top>=0&&r.right<=innerWidth&&r.height>=44}')
   pg.screenshot(path=str(OUT/f'acompanhar-{w}-{h}-{scale}.png'))
  validar_axe(pg)
  pg.evaluate('document.documentElement.style.fontSize="100%"')
  pg.locator('#ms-acompanhar').uncheck();pg.wait_for_function('document.getElementById("ms-acomp-feedback").textContent.includes("desativado")')
  pg.keyboard.press('Escape');pg.wait_for_selector('#ms-gaveta',state='detached');assert pg.locator('#ms-texto').input_value()=='Rascunho da conversa'
  agenda.click();pg.wait_for_selector('#ms-acompanhar:enabled');pg.locator('#ms-gaveta [data-ms=agenda-abrir]').click();pg.wait_for_selector('#ms-ag-texto');pg.locator('#ms-ag-texto').fill('')
  pg.locator('#ms-ag-arquivo').set_input_files({'name':'foto da peça.png','mimeType':'image/png','buffer':PNG});pg.wait_for_function('document.querySelector(".ms-ag-anexo-nome").textContent.includes("foto da peça")')
  data=(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=3)+datetime.timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M')
  pg.locator('#ms-ag-quando').fill(data);s['agendar_falha_apos_gravar']=True;pg.locator('#ms-ag-salvar').click();pg.wait_for_function('document.getElementById("ms-ag-form-status").textContent.includes("Tente novamente")')
  assert pg.locator('#ms-ag-quando').input_value()==data;assert pg.locator('.ms-ag-anexo-nome').inner_text().startswith('foto da peça')
  pg.locator('#ms-ag-salvar').click();pg.wait_for_function('document.getElementById("ms-ag-form-status").textContent.includes("Agendada para")')
  assert s['agendar_posts'][-1]['idLocal']==s['agendar_posts'][-2]['idLocal'];assert len([a for a in s['agenda'] if a.get('tem_anexo')])==1
  assert 'foto da peça.png' in pg.locator('#ms-ag-lista').inner_text()
  for scale in [100,130]:
   pg.evaluate('(s)=>document.documentElement.style.fontSize=s+"%"',scale)
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert pg.locator('#ms-ag-salvar').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.height>=44&&r.bottom<=innerHeight+1}')
   pg.screenshot(path=str(OUT/f'agendar-{w}-{h}-{scale}.png'))
  validar_axe(pg)
  assert not errors,errors;ctx.close()
 b.close()
print('Agendar/Acompanhar: cinco telas, texto100/130, toque44, anexo, retry idempotente, rascunho e navegação aprovados.')
