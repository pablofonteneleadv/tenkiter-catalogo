"""Jornada de configuração de acessos, isolada de todos os serviços reais."""
import os,json,pathlib
from mock import install,SESSION,PERMS_ALL
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8765/')
OUT=pathlib.Path(os.environ.get('TK_EVID','tests/saida/rh-permissoes'));OUT.mkdir(parents=True,exist_ok=True)
novas=[('esteira','Esteira','Acessar a Esteira e participar do rodízio'),('esteira_aceitar','Esteira','Aceitar produtos preparados para o site'),('postador','Postador','Preparar e publicar postagens'),('fotoia','Geração de fotos com IA','Gerar fotos com IA')]+[('msg_'+k,'Mensageiro',r) for k,r in [('acessar','Acessar o Mensageiro'),('responder','Responder atendimentos'),('produtos','Selecionar produtos'),('arquivos','Baixar arquivos'),('contatos','Editar contatos'),('etiquetas','Alterar etapas'),('notas','Editar notas'),('agenda','Agendar mensagens'),('respostas','Respostas rápidas'),('funil','Ver o funil'),('metricas','Ver métricas'),('exportar','Exportar atendimentos'),('configuracoes','Configurar Mensageiro')]]
def fixture(c):
 st=install(c,perms=PERMS_ALL+['avaliacoes','manual_1'],versao='3.7')
 acessos=st['_post']({'action':'acessos_listar'})
 defs=acessos['permissoes']+[{'chave':k,'grupo':g,'rotulo':r} for k,g,r in novas]
 modelos=[dict(p,permissoes={k:True for k in p['permissoes']},pessoas=3,protegido=p['nome'] in ['Cliente','Admin total']) for p in acessos['perfis']]
 modelos.append({'nome':'Esteira','desc':'Conferência de produtos e rodízio da equipe','permissoes':{'esteira':True,'cliente':True},'pessoas':4,'protegido':False})
 data={'ok':True,'modelos':modelos,'permissoes':defs,'revisao':0};calls=[];fail={'save':False}
 def route(r):
  req=r.request
  if 'action=versao' in req.url:
   return r.fulfill(json={'ok':True,'versao':'3.30','acessos':True,'acessosConfiguraveis':True})
  try:d=json.loads(req.post_data or '{}')
  except:d={}
  action=d.get('action','')
  if action.startswith('acessos_modelos_'):
   calls.append(d)
   if action!='acessos_modelos_listar':
    if fail['save']:return r.fulfill(json={'ok':False,'erro':'Servidor indisponível. Tente de novo.'})
    original=d.get('original');data['modelos']=[m for m in data['modelos'] if m['nome']!=original]
    if action.endswith('salvar'):data['modelos'].append({'nome':d['nome'],'desc':d['desc'],'permissoes':{k:True for k in d['permissoes']},'pessoas':3,'protegido':False})
    data['revisao']+=1
   return r.fulfill(json=data)
  return r.fallback()
 c.route('**/script.google.com/**',route)
 c.route('**/msg/acessos',lambda r:r.fulfill(json={'ok':True,'regras':{'pessoas':{},'perfis':{'equipedosite':{'acessar':True,'responder':True}}},'ferramentas':{}}))
 return calls,fail
with sync_playwright() as p:
 b=p.chromium.launch()
 for w,h in [(390,844),(412,915),(1440,900),(320,844)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block');c.add_init_script(SESSION);calls,fail=fixture(c)
  pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('dialog',lambda d:d.accept())
  pg.goto(BASE+'treinamentos.html?painel=rh');pg.wait_for_selector('.ac-card');pg.screenshot(path=str(OUT/f'rh-acessos-{w}.png'))
  pg.click('[data-tab="permissoes"]');pg.wait_for_selector('.rp-linha');pg.screenshot(path=str(OUT/f'rh-permissoes-{w}.png'))
  pg.locator('.rp-linha').filter(has_text='Equipe do site').click();pg.locator('.rp-grupo').filter(has=pg.locator('summary',has_text='Mensageiro')).locator('summary').click();assert pg.locator('[data-rp-chave="msg_responder"]').is_checked();pg.click('#rp-cancelar')
  pg.get_by_role('button',name='+ Novo acesso').click();pg.locator('#rp-nome').fill('Equipe de fotografia');pg.locator('#rp-desc').fill('Responsáveis pelas fotos e pelo rodízio da loja')
  pg.locator('.rp-grupo').filter(has=pg.locator('summary',has_text='Esteira')).locator('summary').click()
  pg.locator('[data-rp-chave="esteira"]').check();pg.screenshot(path=str(OUT/f'rh-editor-{w}.png'))
  assert pg.evaluate('() => document.documentElement.scrollWidth <= innerWidth'), 'rolagem horizontal'
  # Simula área reduzida pelo teclado e fonte ampliada; não equivale a aparelho físico.
  pg.set_viewport_size({'width':w,'height':500});pg.locator('#rp-nome').focus();pg.locator('#rp-nome').fill('Fotografia e Esteira');pg.get_by_role('button',name='Salvar acesso',exact=True).click();pg.wait_for_selector('.rp-sucesso')
  assert calls[-1]['nome']=='Fotografia e Esteira' and 'esteira' in calls[-1]['permissoes']
  pg.set_viewport_size({'width':w,'height':h});pg.locator('.rp-linha').filter(has_text='Fotografia e Esteira').click();pg.locator('#rp-nome').fill('Produção de imagens');fail['save']=True
  pg.get_by_role('button',name='Salvar acesso',exact=True).click();pg.wait_for_selector('.rp-erro');assert pg.locator('#rp-nome').input_value()=='Produção de imagens'
  fail['save']=False;pg.get_by_role('button',name='Salvar acesso',exact=True).click();pg.wait_for_selector('.rp-sucesso')
  pg.locator('.rp-linha').filter(has_text='Produção de imagens').click();pg.locator('.rp-excluir summary').click();pg.select_option('#rp-substituto',label='Cliente');pg.click('#rp-excluir');pg.wait_for_selector('.rp-sucesso')
  assert calls[-1]['action']=='acessos_modelos_excluir' and calls[-1]['substituirPor']=='Cliente'
  pg.locator('.rp-linha').filter(has_text='Admin total').click();assert not pg.locator('#rp-excluir').count() and pg.locator('#rp-nome').is_disabled()
  pg.click('#rp-voltar');pg.locator('#rp-busca').fill('não existe');assert 'Nenhum acesso encontrado' in pg.inner_text('#rp-lista');pg.locator('#rp-busca').fill('Esteira')
  # Teclado: abrir com Enter, editar, cancelar e devolver foco.
  pg.locator('.rp-linha').focus();pg.keyboard.press('Enter');pg.wait_for_selector('#rp-nome');pg.locator('#rp-nome').focus();pg.keyboard.press('End');pg.keyboard.type(' da loja');pg.click('#rp-cancelar');assert pg.locator('#rp-novo').evaluate('(e)=>e===document.activeElement')
  pg.add_style_tag(content='body.rh-admin :is(p,button,input,select,textarea,label,summary,strong,small){font-size:20.8px!important}');assert pg.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
  pg.screenshot(path=str(OUT/f'rh-texto130-{w}.png'))
  assert not errors,errors
  print('OK jornada RH',w,flush=True);c.close()
 b.close()
