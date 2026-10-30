"""Painel pesquisável: paginação, filtros, cancelamento, conversa e ACL, APIs simuladas."""
import os, re
from pathlib import Path
from playwright.sync_api import sync_playwright
from mock import install, SESSION, PERMS_ALL
import mock_msg
BASE=os.getenv('TK_BASE','http://localhost:8783/')
OUT=Path(os.getenv('TK_EVID',str(Path(__file__).parent/'evidencias_edicao'/'agendamentos')));OUT.mkdir(parents=True,exist_ok=True)
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
  s['agenda']=[{'id':1000+i,'conversa_id':[1,4,5][i%3],'texto':'Pedido '+str(1000+i)+' — pesquisa do painel','quando':mock_msg.iso(-120),'autor':'Ana','status':'pendente','tipo':'manual','erro':'','tem_anexo':i==0,'anexo_nome':'anexo especial.jpg' if i==0 else ''} for i in range(35)]
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv')
  def abrir():
   pg.click('#ms-nav [data-ms=menu-geral]');pg.click('[data-ms=agenda-painel]');pg.wait_for_selector('#ms-ag-painel-lista li')
  abrir();rows=pg.locator('#ms-ag-painel-lista>li');pg.wait_for_function('document.querySelectorAll("#ms-ag-painel-lista>li").length===30')
  pg.get_by_role('button',name='Carregar mais',exact=True).click();pg.wait_for_function('document.querySelectorAll("#ms-ag-painel-lista>li").length===35')
  busca=pg.get_by_label('Pesquisar agendamentos',exact=True);busca.fill('anexo especial');pg.wait_for_function('document.querySelectorAll("#ms-ag-painel-lista>li").length===1');assert 'anexo especial.jpg' in rows.inner_text()
  busca.fill('');pg.wait_for_function('document.querySelectorAll("#ms-ag-painel-lista>li").length===30')
  for scale in [100,130]:
   pg.evaluate('(s)=>document.documentElement.style.fontSize=s+"%"',scale)
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert pg.locator('#ms-gaveta .ms-gaveta-cab button').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.height>=44&&r.top>=0&&r.right<=innerWidth}')
   pg.screenshot(path=str(OUT/f'agendamentos-{w}-{h}-{scale}.png'))
  validar_axe(pg)
  pg.evaluate('document.documentElement.style.fontSize="100%"');pg.locator('.ms-ag-filtros summary').click();pg.get_by_label('Canal',exact=True).select_option('instagram');pg.wait_for_function('document.querySelectorAll("#ms-ag-painel-lista>li").length===11')
  assert all('Instagram' in x for x in rows.all_text_contents());pg.get_by_label('Situação',exact=True).select_option('cancelada');pg.wait_for_function('document.querySelector("#ms-ag-painel-lista").textContent.includes("Nenhum agendamento")')
  pg.get_by_label('Canal',exact=True).select_option('todos');pg.get_by_label('Situação',exact=True).select_option('pendentes');pg.get_by_label('Tipo',exact=True).select_option('manual');pg.wait_for_function('document.querySelectorAll("#ms-ag-painel-lista>li").length===30')
  pg.locator('.ms-ag-filtros summary').click();pg.get_by_role('button',name=re.compile('Cancelar mensagem de')).first.click();pg.wait_for_function('document.querySelector(".ms-ag-painel-status").textContent==="Agendamento cancelado."');assert s['cancelados']==[1000]
  pg.locator('#ms-ag-painel-lista [data-ms=agenda-conversa]').first.click();pg.wait_for_selector('#ms-texto');assert pg.locator('#ms-gaveta').count()==0
  if w<860: pg.locator('.ms-voltar').click()
  abrir();assert pg.get_by_label('Tipo',exact=True).input_value()=='manual'
  pg.evaluate("TKMensagensAcessos.pode=k=>k==='acessar';window.dispatchEvent(new Event('tk:mensagens-acessos'))");pg.wait_for_selector('#ms-gaveta',state='detached')
  assert not errors,errors;ctx.close()
 b.close()
print('Agendamentos: cinco telas, texto100/130, paginação, busca, filtros, cancelamento, conversa e revogação visual aprovados.')
