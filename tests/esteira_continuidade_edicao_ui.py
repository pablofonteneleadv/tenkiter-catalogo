"""Fotos, autoria, edição e filtros. Todos os serviços são simulados."""
import json, os
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
arq=Path(__file__).with_name('esteira_fotos_ui.py');ns={'__file__':str(arq),'__name__':'base'}
exec(compile(arq.read_text(encoding='utf-8').split('\nwith sync_playwright() as p:')[0],str(arq),'exec'),ns)
OUT=Path(os.getenv('TK_EVID','tests/saida/esteira-continuidade'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(args=['--no-sandbox'],**({'executable_path':os.environ['TK_CHROME']} if os.getenv('TK_CHROME') else {}))
 for w,h in json.loads(os.getenv('TK_LARGURAS','[[320,700],[390,844],[412,915],[1440,900]]')):
  for admin in [True,False]:
   print('INICIO',w,admin,flush=True)
   c=b.new_context(viewport={'width':w,'height':h},has_touch=w<600,service_workers='block');st=ns['instalar'](c,admin=admin);ns['fotos_srv'](c,st,admin=admin)
   ns['_TODOS'][:]=ns['_ns']['PRODUTOS']+[ns['_ns']['ARQUIVADA'],ns['_ns']['ARQUIVADA2']]
   calls={'fotos':0,'editar':[],'falhar':False}
   records={t:{'tipo':t,'id':104,'produto':'1002','titulo':'Vestido Longo Floral','por':'Iara','em':'2026-11-05T10:00:00Z','campos':({'descricao':'costas do floral','descricao_lote':'Descrição do envio'} if t=='foto' else {'detalhe':json.dumps({'opcoes':['pano'],'obs':'luz natural'})} if t=='pedido_fotos' else {'obs':'Observação anterior'}),'versao':'versao-1'} for t in ['foto','pedido_fotos','conferencia','tarefa']}
   def rotas(route):
    req=route.request;u=urlparse(req.url)
    if u.path=='/esteira/fotos':calls['fotos']+=1;return route.fallback()
    if u.path=='/esteira/registros':return route.fulfill(json={'ok':True,'admin':admin,'itens':[records[parse_qs(u.query).get('tipo',['foto'])[0]]],'proximo':None})
    if u.path=='/esteira/registro-editar':
     d=json.loads(req.post_data);calls['editar'].append(d)
     if calls['falhar']:return route.fulfill(status=409,json={'ok':False,'erro':'O registro mudou. Abra novamente para conferir.'})
     r=records[d['tipo']];r['campos']={k:d.get(k,v) for k,v in r['campos'].items()};r['versao']='versao-2';return route.fulfill(json={'ok':True,'registro':r})
    return route.fallback()
   c.route('**/esteira/**',rotas);pg=c.new_page();pg.set_default_timeout(10000);errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
   pg.clock.install();ns['entrar'](pg);pg.click('[data-aba=fotos]');pg.wait_for_selector('[data-caixa="104"]')
   first=calls['fotos'];pg.locator('[data-caixa="104"]').evaluate("e=>e.dataset.preservar='sim'")
   pg.clock.fast_forward(62000);pg.evaluate("()=>{dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));}")
   assert calls['fotos']==first and pg.locator('[data-caixa="104"]').get_attribute('data-preservar')=='sim'
   if admin:
    pg.locator('[data-caixa="101"] .cx-sel').click();pg.click('.cx-colocar');pg.wait_for_selector('#cx-colocar-busca');expect(pg.locator('.f-situacao')).to_have_value('ativas')
    pg.locator('.busca-cat summary').click();pg.get_by_label('Preço mínimo (R$)',exact=True).fill('140,00');pg.get_by_label('Preço máximo (R$)',exact=True).fill('150')
    expect(pg.locator('.busca-res [data-escolher="1002"]')).to_be_visible();assert pg.locator('.busca-res [data-escolher]').count()==1
    expect(pg.locator('.busca-res [data-escolher="1002"]')).to_contain_text('R$ 149,90');expect(pg.locator('.busca-res [data-escolher="1002"]')).to_contain_text('à vista')
    pg.get_by_label('Preço máximo (R$)',exact=True).scroll_into_view_if_needed()
    assert pg.get_by_label('Preço máximo (R$)',exact=True).evaluate('e=>{const r=e.getBoundingClientRect(),b=e.closest(".corpo").getBoundingClientRect();return r.height>=44&&r.top>=b.top&&r.bottom<=b.bottom+1}')
    pg.screenshot(path=str(OUT/f'faixa-preco-{w}.png'))
    pg.clock.fast_forward(31000);assert pg.get_by_label('Preço mínimo (R$)',exact=True).input_value()=='140,00'
    pg.get_by_label('Preço mínimo (R$)',exact=True).fill('160');expect(pg.get_by_label('Preço mínimo (R$)',exact=True)).to_have_attribute('aria-invalid','true')
    pg.get_by_label('Preço mínimo (R$)',exact=True).fill('');pg.get_by_label('Preço máximo (R$)',exact=True).fill('');pg.locator('.f-situacao').select_option('arquivadas');assert pg.locator('[data-escolher="2001"]').count()==1
    assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1');pg.screenshot(path=str(OUT/f'filtros-{w}.png'));pg.keyboard.press('Escape');expect(pg.locator('[data-caixa="101"] .cx-sel')).to_have_attribute('aria-pressed','true')
   pg.get_by_role('button',name='Registros da equipe' if admin else 'Meus registros',exact=True).click();pg.wait_for_selector('[data-registro="foto-104"]');pg.locator('[data-registro="foto-104"]').get_by_role('button',name='Editar',exact=True).click()
   pg.get_by_label('Descrição da foto',exact=True).fill('Detalhe do bordado corrigido');pg.clock.fast_forward(62000);assert pg.get_by_label('Descrição da foto',exact=True).input_value()=='Detalhe do bordado corrigido'
   assert pg.locator('[role=dialog][aria-label="Editar registro"] button').evaluate_all('es=>es.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44})')
   pg.screenshot(path=str(OUT/f'editar-{w}-{admin}.png'))
   if admin and w in [390,1440]:
    pg.evaluate('document.documentElement.style.fontSize="130%"');pg.set_viewport_size({'width':w,'height':470 if w==390 else 600});pg.get_by_role('button',name='Salvar alterações',exact=True).scroll_into_view_if_needed()
    pg.screenshot(path=str(OUT/f'editar-ampliado-{w}.png'))
    medida=pg.get_by_role('button',name='Salvar alterações',exact=True).evaluate('e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,tela:innerHeight}}');assert medida['top']>=0 and medida['bottom']<=medida['tela']+1 and medida['height']>=44,medida
    assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1');pg.screenshot(path=str(OUT/f'editar-ampliado-{w}.png'));pg.set_viewport_size({'width':w,'height':h});pg.evaluate('document.documentElement.style.fontSize=""')
   pg.get_by_role('button',name='Salvar alterações',exact=True).click();pg.wait_for_selector('[role=dialog][aria-label="Editar registro"]',state='detached')
   assert calls['editar'][-1]['descricao']=='Detalhe do bordado corrigido';expect(pg.locator('[data-registro="foto-104"]')).to_contain_text('Detalhe do bordado corrigido')
   for tipo in ['pedido_fotos','conferencia','tarefa']:
    pg.get_by_label('Tipo de registro',exact=True).select_option(tipo);pg.wait_for_selector(f'[data-registro="{tipo}-104"]');pg.locator(f'[data-registro="{tipo}-104"]').get_by_role('button',name='Editar',exact=True).click()
    label='Observação do pedido' if tipo=='pedido_fotos' else 'Observação';pg.get_by_label(label,exact=True).fill('Rascunho preservado');calls['falhar']=True;pg.get_by_role('button',name='Salvar alterações',exact=True).click();pg.wait_for_selector('text=O registro mudou. Abra novamente para conferir.');assert pg.get_by_label(label,exact=True).input_value()=='Rascunho preservado';pg.keyboard.press('Escape');calls['falhar']=False
   assert not errors,errors
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1');pg.keyboard.press('Escape');pg.get_by_role('button',name='Atualizar fotos',exact=True).click();pg.wait_for_timeout(150);assert calls['fotos']>first
   pg.get_by_role('button',name='Registros da equipe' if admin else 'Meus registros',exact=True).click();pg.wait_for_selector('[data-registro="foto-104"]');pg.evaluate('()=>{localStorage.clear();dispatchEvent(new Event("tk:sessao"));}');pg.wait_for_selector('#login-w');assert not pg.locator('[role=dialog]').count();c.close()
 b.close()
print('PASS: 4 viewports, admin/equipe, trabalho preservado, filtros ativos/preço e edição com erro sem perder rascunho.')
