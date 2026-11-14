"""Troca de abas e revalidação lenta; rede simulada, sem escrita real."""
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
p=Path(__file__).with_name('esteira_ui.py');ns={'__file__':str(p),'__name__':'esteira_base'}
exec(compile(p.read_text().split('\nwith sync_playwright() as p:')[0],str(p),'exec'),ns)
BASE=ns['BASE'];OUT=Path(os.getenv('TK_EVID','tests/saida/esteira-fluidez'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block');st=ns['instalar'](c);pg=c.new_page();pg.set_default_timeout(6000);erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
  print('INICIO',w,flush=True)
  inicio=[]
  pg.on('request',lambda r:inicio.append(r.url) if r.url.endswith('/esteira/hoje') else None)
  pg.clock.install();pg.goto(BASE+'esteira.html');pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1');pg.wait_for_selector('.peca')
  assert len(inicio)==1,inicio
  pg.locator('[data-aba=pedidos]').focus();pg.keyboard.press('Enter');pg.wait_for_selector('text=Pedidos ao fornecedor')
  assert pg.locator('[data-aba=pedidos]').evaluate('b=>document.activeElement===b')
  pg.click('[data-aba=hoje]');pg.clock.fast_forward(16000)
  held=[];c.route('**/esteira/pedidos',lambda r:held.append(r))
  print('PENDENTE',flush=True)
  pg.click('[data-aba=pedidos]');pg.wait_for_timeout(100)
  assert held and pg.get_by_text('Pedidos ao fornecedor',exact=True).is_visible()
  assert 'Carregando os pedidos' not in pg.inner_text('main')
  pg.screenshot(path=str(OUT/f'pedidos-atualizando-{w}.png'))
  pg.click('[data-aba=painel]');pg.wait_for_selector('#painel-listas')
  held[0].fulfill(json={'ok':True,'admin':True,'pedidos':[{'id':99,'fornecedor':'Lote atualizado','status':'rascunho','itens':0}]})
  pg.wait_for_timeout(100);assert pg.locator('#painel-listas').is_visible();assert not pg.get_by_text('Lote atualizado',exact=True).count()
  pg.click('[data-aba=pedidos]');pg.wait_for_selector('text=Lote atualizado');c.unroute('**/esteira/pedidos')
  pg.click('[data-aba=config]')
  try: pg.wait_for_selector('#cfg-funcoes')
  except Exception:
   print('CONFIG_DIAGNOSTICO',w,'aba=',pg.locator('[data-aba=config]').get_attribute('aria-selected'),'texto=',pg.locator('main').inner_text()[:1500],'erros=',erros,flush=True)
   pg.screenshot(path=str(OUT/f'config-falha-{w}.png'))
   raise
  pg.fill('#cfg-funcoes','Fotos, Meu rascunho')
  pg.click('[data-aba=hoje]');pg.click('[data-aba=config]');assert pg.locator('#cfg-funcoes').input_value()=='Fotos, Meu rascunho'
  st['equipe'].append({'whats':'88999990004','nome':'Nova pessoa','confere':1,'rodizio':1,'atendente':1,'aceitar':0,'ativo':1})
  print('ATUALIZANDO',flush=True)
  pg.clock.fast_forward(31000);pg.wait_for_selector('text=Nova pessoa · 88999990004');assert pg.locator('#cfg-funcoes').input_value()=='Fotos, Meu rascunho'
  # A confirmação antiga não limpa a marca de edição de um rascunho mais novo.
  escritos=[]
  def reter_escrita(r):
   if r.request.method=='POST':escritos.append(r)
   else:r.fallback()
  c.route('**/esteira/config',reter_escrita)
  pg.get_by_role('button',name='Salvar funções e regras',exact=True).click();pg.wait_for_timeout(150);assert escritos
  pg.fill('#cfg-funcoes','Fotos, Rascunho mais novo');escritos.pop(0).fallback();pg.wait_for_selector('text=Salvo. As novas regras')
  c.unroute('**/esteira/config',reter_escrita);pg.clock.fast_forward(31000)
  assert pg.locator('#cfg-funcoes').input_value()=='Fotos, Rascunho mais novo'
  c.route('**/esteira/config?basico=1',lambda r:r.abort())
  # a mensagem aparece depois da tentativa falhar (assíncrono): avança o relógio simulado e confere até 10 vezes antes de reprovar
  pg.clock.fast_forward(31000);pg.wait_for_selector('.esteira-atualizacao')
  for _ in range(10):
   if 'informações anteriores continuam visíveis' in pg.inner_text('.esteira-atualizacao'):break
   pg.wait_for_timeout(300);pg.clock.fast_forward(31000)
  assert 'informações anteriores continuam visíveis' in pg.inner_text('.esteira-atualizacao')
  assert pg.locator('#cfg-funcoes').input_value()=='Fotos, Rascunho mais novo'
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  pg.evaluate('()=>{localStorage.clear();dispatchEvent(new Event("tk:sessao"))}');pg.wait_for_selector('#login-w');assert not pg.locator('#cfg-funcoes').count()
  assert not erros,erros;c.close()
 # User Timing precisa do relógio nativo. A jornada acima acelera apenas a
 # revalidação e o vencimento do cache por meio do relógio do Playwright.
 c=b.new_context(viewport={'width':390,'height':844},service_workers='block')
 ns['instalar'](c);pg=c.new_page();pg.goto(BASE+'esteira.html')
 pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
 pg.wait_for_function("performance.getEntriesByName('esteira:hoje:util','mark').length===1")
 pg.click('[data-aba=pedidos]')
 pg.wait_for_function("performance.getEntriesByName('esteira:pedidos:util','mark').length===1")
 c.close()
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block',is_mobile=w<600,has_touch=w<600)
  st=ns['instalar'](c)
  st['pedidos'][9]={'id':9,'fornecedor':'Fornecedor Antigo Ltda','previsao':'','status':'rascunho',
                    'obs':'','fotos':[],'itens':[{'id':31,'tipo':'reposicao','produto':'1001','nome':'Vestido Midi Linho',
                                                'fotos':[],'qtd_pedida':2,'custo':30,'qtd_contada':None}]}
  retido=[]
  c.route(re.compile(r'/exec\?action=list&todos=true$'),lambda r:retido.append(r))
  pg=c.new_page();pg.goto(BASE+'esteira.html')
  pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
  pg.click('[data-aba=pedidos]')
  pg.click('.peca.pedido[data-pedido="9"]')
  pg.wait_for_selector('#ped-fornecedor')
  item=pg.locator('.item-ped[data-item="31"]')
  assert pg.input_value('#ped-fornecedor')=='texto'
  pg.wait_for_timeout(100)
  assert len(retido)==1,[r.request.url for r in retido]
  assert item.get_by_text('Reposição',exact=True).is_visible(),item.inner_text()
  pg.fill('#ped-obs','Manter o texto ao carregar o catálogo')
  pg.screenshot(path=str(OUT/f'pedidos-editor-catalogo-atrasado-{w}.png'))
  retido[0].fallback()
  item.get_by_text('Reposição · TK-1001 · estoque hoje: 4',exact=True).wait_for()
  assert pg.input_value('#ped-obs')=='Manter o texto ao carregar o catálogo'
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  c.close()
 # A preparação deixa as leituras do catálogo para quando há um controle aberto.
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block',has_touch=w<600)
  st=ns['instalar'](c)
  st['outras'].clear()
  st['feitas'].extend([11,12,13,14,15])
  catalogo=[]
  c.route(re.compile(r'/exec\?action=list&todos=true$'),lambda r:catalogo.append(r))
  pg=c.new_page();erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
  pg.goto(BASE+'esteira.html')
  pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
  pg.click('[data-aba=prep]')
  cartao=pg.locator('.card[data-produto="2001"]')
  cartao.get_by_role('heading',name='Blusa Nova Tricô').wait_for()
  assert not pg.locator('#prep-busca').count()
  assert not cartao.locator('details.dados').evaluate('e=>e.open')
  pg.wait_for_timeout(100)
  assert not catalogo,[r.request.url for r in catalogo]
  pg.screenshot(path=str(OUT/f'preparacao-antes-do-catalogo-{w}.png'))
  colocar=pg.get_by_role('button',name='Colocar produto em preparação')
  if w<600: colocar.tap()
  else: colocar.focus();pg.keyboard.press('Enter')
  busca=pg.locator('#prep-busca')
  busca.fill('saia')
  dados=cartao.locator('details.dados > summary')
  dados.click()
  cartao.get_by_text('Carregando os dados do cadastro…').wait_for()
  assert len(catalogo)==1,[r.request.url for r in catalogo]
  catalogo[0].fallback()
  cartao.get_by_text('Tricô macio',exact=True).wait_for()
  pg.get_by_role('button',name='Colocar Saia Plissada Midi em preparação').wait_for()
  assert busca.input_value()=='saia'
  assert len(catalogo)==1
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  assert not erros,erros
  c.close()
 # Uma conferência de cadastro pendente mantém os detalhes abertos por padrão.
 c=b.new_context(viewport={'width':390,'height':844},service_workers='block')
 ns['instalar'](c)
 pg=c.new_page();pg.goto(BASE+'esteira.html')
 pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
 pg.click('[data-aba=prep]')
 cadastro=pg.locator('.card[data-produto="2001"] details.dados')
 cadastro.get_by_text('Tricô macio',exact=True).wait_for()
 assert cadastro.evaluate('e=>e.open')
 c.close()
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block',has_touch=w<600)
  ns['instalar'](c);paginas=[]
  ids=[str(9000+i) for i in range(24)]+['1003']
  def simular_pagina(r):
   depois='&depois=' in r.request.url
   paginas.append(depois)
   if depois and paginas.count(True)==1:
    return r.fulfill(status=503,json={'ok':False,'erro':'Tente de novo.'})
   itens=ids[-1:] if depois else ids[:-1]
   return r.fulfill(json={'ok':True,'podeAceitar':True,'funcoes':['Fotos'],
     'produtos':[{'id':i,'nome':'Peça '+i,'tarefas':[],'feitas':0,'total':0,'noSite':True} for i in itens],
     'outras':[],'fotosPedidas':2,'proximo':None if depois else 'cursor/+=',
     **({} if depois else {'emPreparacao':ids})})
  c.route(re.compile(r'/esteira/preparacao\?pagina=1(?:&depois=.*)?$'),simular_pagina)
  pg=c.new_page();pg.goto(BASE+'esteira.html')
  pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
  pg.click('[data-aba=prep]')
  pg.wait_for_selector('#prep-produto-9000')
  cartoes=pg.locator('.card[id^=prep-produto-]')
  assert cartoes.count()==24 and paginas==[False]
  pg.get_by_role('button',name='Colocar produto em preparação').click()
  pg.fill('#prep-busca','saia')
  pg.get_by_text('Nenhum produto com esse nome ou código.',exact=True).wait_for()
  primeiro=pg.locator('#prep-produto-9000')
  primeiro.get_by_role('button',name='Nova tarefa para este produto').click()
  rascunho=primeiro.get_by_role('textbox',name='Nova tarefa')
  rascunho.fill('Manter tarefa em edição')
  mais=pg.get_by_role('button',name='Carregar mais produtos')
  mais.click();pg.locator('#prep-paginacao .erro').wait_for()
  assert cartoes.count()==24
  mais.focus();pg.keyboard.press('Enter')
  pg.get_by_role('heading',name='Peça 1003').wait_for()
  assert cartoes.count()==25 and rascunho.input_value()=='Manter tarefa em edição'
  assert pg.locator('#prep-produto-1003 h3').evaluate('e=>e===document.activeElement')
  pg.locator('#prep-produto-1003').scroll_into_view_if_needed()
  pg.screenshot(path=str(OUT/f'preparacao-paginada-{w}.png'))
  pg.click('[data-aba=hoje]');pg.click('[data-aba=prep]')
  pg.wait_for_selector('#prep-produto-1003')
  assert cartoes.count()==25 and rascunho.input_value()=='Manter tarefa em edição'
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  c.close()
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block',has_touch=w<600)
  ns['instalar'](c)
  pendentes=[]
  c.route('**/esteira/hoje',lambda r:pendentes.append(r))
  c.route(re.compile(r'/esteira/menu\?resumo=1$'),lambda r:r.fulfill(json={'ok':True,'eu':{'admin':True,'nome':'Iara'},'resumoHoje':{'total':3,'feitas':2,'pedidos':{'aprovar':1}}}))
  pg=c.new_page();pg.goto(BASE+'esteira.html')
  pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
  pg.get_by_text('2 de 3 conferências registradas hoje.').wait_for()
  assert pg.get_by_text('Chegada esperando aprovação',exact=True).is_visible()
  assert pg.get_by_text('Montando a sua lista de hoje…',exact=True).is_visible()
  assert len(pendentes)==1
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  pg.screenshot(path=str(OUT/f'hoje-resumo-antes-da-lista-{w}.png'))
  pendentes.pop().fulfill(status=503,json={'ok':False,'erro':'O catálogo não respondeu agora.'})
  pg.get_by_role('button',name='Tentar de novo',exact=True).wait_for()
  assert pg.get_by_text('2 de 3 conferências registradas hoje.').is_visible()
  pg.get_by_role('button',name='Tentar de novo',exact=True).click()
  pg.wait_for_timeout(150);assert len(pendentes)==1
  pendentes.pop().fallback()
  pg.wait_for_selector('.peca');assert not pg.locator('#hoje-resumo-abertura').count()
  c.close()
 for admin in (False, True):
  c=b.new_context(viewport={'width':390,'height':844},service_workers='block')
  ns['instalar'](c,admin=admin)
  pendentes=[]
  c.route('**/esteira/hoje',lambda r:pendentes.append(r))
  pg=c.new_page();pg.goto(BASE+'esteira.html')
  pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
  pg.wait_for_selector('[data-aba=pedidos]')
  assert pg.locator('[data-aba=painel]').count()==int(admin)
  assert pg.get_by_text('Montando a sua lista de hoje…',exact=True).is_visible()
  pg.screenshot(path=str(OUT/('menu-antes-de-hoje-admin.png' if admin else 'menu-antes-de-hoje-equipe.png')))
  pg.locator('[data-aba=pedidos]').click()
  pg.wait_for_selector('text='+('Pedidos ao fornecedor' if admin else 'Chegou mercadoria'))
  assert len(pendentes)==1,pendentes
  pendentes[0].fallback()
  pg.wait_for_timeout(200)
  assert pg.locator('[data-aba=pedidos]').get_attribute('aria-selected')=='true'
  assert not pg.get_by_text('Minha conferência',exact=True).is_visible()
  c.close()
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block')
  st=ns['instalar'](c)
  config_base={
   'ok':True,'fonteEquipe':'acessos','equipe':st['equipe'],'escalaPadrao':[],'hoje':'2026-11-01','escalaHoje':{},
   'config':{'porPessoa':20,'diasSemRepetir':21,'funcoes':['Fotos'],'instrucoes':{},'modelosPreparacao':[],'pesos':{},
             'categoriasFixas':{'88999999999':'Categoria antiga'},'reativacao':[30,60,90],'retratoHora':6}
  }
  c.route('**/esteira/config?basico=1',lambda r:r.fulfill(json=config_base))
  cats=[]
  c.route('**/esteira/config/categorias',lambda r:cats.append(r))
  pg=c.new_page();erros_config=[];pg.on('pageerror',lambda e:erros_config.append(str(e)));pg.goto(BASE+'esteira.html')
  pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
  pg.click('[data-aba=config]')
  try: pg.wait_for_selector('#cfg-funcoes')
  except Exception:
   print('CONFIG_CATEGORIAS_DIAGNOSTICO',w,'texto=',pg.locator('main').inner_text()[:1500],flush=True)
   pg.screenshot(path=str(OUT/f'config-categorias-falha-{w}.png'))
   raise
  pg.wait_for_function("document.querySelector('#cfg-foco [role=status]')?.textContent==='Carregando categorias…'")
  cat=pg.locator('#cfg-foco select[data-whats="88999999999"]')
  assert cat.is_disabled() and cat.input_value()=='Categoria antiga'
  pg.fill('#cfg-funcoes','Fotos, Meu rascunho')
  pg.screenshot(path=str(OUT/f'config-antes-de-categorias-{w}.png'))
  pg.wait_for_timeout(100)
  assert len(cats)==1
  cats[0].fulfill(status=503,json={'ok':False,'erro':'Categorias indisponíveis.'})
  retry=pg.get_by_role('button',name='Tentar carregar categorias')
  retry.wait_for()
  retry.scroll_into_view_if_needed()
  pg.screenshot(path=str(OUT/f'config-categorias-indisponiveis-{w}.png'))
  pg.locator('#cfg-reat-1').fill('20')
  pg.get_by_role('button',name='Salvar foco e reativação').click()
  pg.wait_for_selector('#cfg-foco >> text=Salvo.')
  assert 'categoriasFixas' not in st['cfg']['config']
  retry.click()
  pg.wait_for_timeout(100)
  assert len(cats)==2
  cats[1].fulfill(json={'ok':True,'categorias':[{'nome':'Blusas','pecas':20}]})
  pg.wait_for_function("!document.querySelector('#cfg-foco select').disabled")
  assert cat.input_value()=='Categoria antiga'
  assert pg.locator('#cfg-funcoes').input_value()=='Fotos, Meu rascunho'
  assert pg.locator('#cfg-reat-1').input_value()=='20'
  cat.select_option('Blusas')
  pg.get_by_role('button',name='Salvar foco e reativação').click()
  pg.wait_for_function("!document.documentElement.dataset.esteiraGuardando")
  ns['aguardar_processos'](pg)
  assert st['cfg']['config']['categoriasFixas']=={'88999999999':'Blusas'}
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  assert not erros_config,erros_config
  c.close()
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block',is_mobile=w<600,has_touch=w<600)
  ns['instalar'](c)
  consultas=[]
  c.route('**/esteira/hoje',lambda r:consultas.append(r))
  pg=c.new_page();erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
  # O prazo nativo de AbortSignal.timeout não usa o relógio do Playwright.
  pg.add_init_script("""AbortSignal.timeout = ms => {
    const controle = new AbortController();
    setTimeout(() => controle.abort(new DOMException('Prazo esgotado', 'TimeoutError')), ms);
    return controle.signal;
  }""")
  pg.clock.install();pg.goto(BASE+'esteira.html')
  pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
  pg.wait_for_selector('[data-aba=fotos]')
  pg.clock.fast_forward(22000)
  assert len(consultas)==1
  assert pg.get_by_text('Montando a sua lista de hoje…',exact=True).is_visible()
  consultas[0].fallback()
  pg.wait_for_selector('.peca')

  consultas.clear()
  c.route('**/esteira/fotos',lambda r:consultas.append(r))
  aba=pg.locator('[data-aba=fotos]')
  if w<600: aba.tap()
  else: aba.focus();pg.keyboard.press('Enter')
  pg.wait_for_timeout(150)
  assert len(consultas)==1
  pg.clock.fast_forward(91000)
  aviso=pg.locator('.esteira-vista > .card')
  aviso.filter(has_text='A Esteira demorou para responder.').wait_for()
  botao=pg.get_by_role('button',name='Tentar de novo',exact=True)
  assert botao.bounding_box()['height']>=44
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  pg.screenshot(path=str(OUT/f'esteira-servidor-demorou-{w}.png'))

  c.unroute('**/esteira/fotos')
  c.route('**/esteira/fotos',lambda r:r.abort())
  botao.click()
  aviso.filter(has_text='Não foi possível falar com o servidor da Esteira.').wait_for()
  c.set_offline(True)
  botao.click()
  aviso.filter(has_text='Sem conexão. Verifique a internet e tente de novo.').wait_for()
  c.unroute('**/esteira/fotos')
  c.route('**/esteira/fotos',lambda r:r.fulfill(json={'ok':True,'pedidos':[],'caixaNovas':0}))
  c.route('**/esteira/caixa?*',lambda r:r.fulfill(json={'ok':True,'itens':[],'total':0}))
  c.set_offline(False)
  if w<600: botao.tap()
  else: botao.focus();pg.keyboard.press('Enter')
  pg.wait_for_selector('#fotos-pedidas')
  assert aba.get_attribute('aria-selected')=='true'
  assert not erros,erros
  c.close()
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block')
  ns['instalar'](c)
  pendentes=[]
  resumo={'ok':True,'detalhesPendentes':True,'focoCategoria':True,
          'listas':[{'whats':'88999999999','nome':'Iara','total':0,'feitas':0}],
          'pedidos':{'aCaminho':[{'fornecedor':'Fornecedor do resumo','itens':2}],'aprovar':[]},
          'divergencia30':{'conferencias':12,'divergentes':1}}
  c.route('**/esteira/painel?resumo=1',lambda r:r.fulfill(json=resumo))
  c.route('**/esteira/painel',lambda r:pendentes.append(r))
  pg=c.new_page();pg.goto(BASE+'esteira.html')
  pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
  pg.click('[data-aba=painel]')
  pg.wait_for_selector('text=Fornecedor do resumo')
  assert pg.get_by_text('Aguardando lista de hoje').is_visible()
  assert not pg.get_by_role('button',name='Ver e alterar a lista de Iara').count()
  pg.wait_for_timeout(100)
  assert len(pendentes)==1
  pg.screenshot(path=str(OUT/f'painel-resumo-com-catalogo-pendente-{w}.png'))
  pendentes[0].fulfill(status=503,json={'ok':False,'erro':'Detalhes indisponíveis.'})
  retry=pg.get_by_role('button',name='Tentar carregar detalhes')
  retry.wait_for()
  assert pg.get_by_text('Fornecedor do resumo').is_visible()
  retry.click()
  pg.wait_for_timeout(100)
  assert len(pendentes)==2
  pendentes[1].fallback()
  pg.get_by_role('button',name='Ver e alterar a lista de Iara').wait_for()
  assert not pg.get_by_text('Aguardando lista de hoje').count()
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  c.close()
 # Concluir uma tarefa atualiza a Preparação sem invalidar Pedidos; um GET
 # iniciado antes da gravação não pode devolver seu retrato antigo.
 c=b.new_context(viewport={'width':390,'height':844},service_workers='block')
 ns['instalar'](c); pedidos=[]
 def contar_pedidos(r):
  pedidos.append(r.request.url);r.fallback()
 c.route('**/esteira/pedidos',contar_pedidos)
 pg=c.new_page();pg.clock.install();pg.goto(BASE+'esteira.html')
 pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
 pg.click('[data-aba=pedidos]');pg.wait_for_selector('text=Pedidos ao fornecedor')
 pg.click('[data-aba=prep]')
 card=pg.locator('.card[data-produto="2001"]')
 card.get_by_role('button',name='Feito: Cadastro conferido',exact=True).click()
 card.get_by_role('button',name='Desfazer Cadastro conferido',exact=True).wait_for()
 pg.click('[data-aba=pedidos]');pg.wait_for_selector('text=Pedidos ao fornecedor')
 pg.wait_for_timeout(100)
 assert len(pedidos)==1,pedidos
 estado=pg.evaluate('''async () => {
   const raiz=document.createElement('div');
   let sessao={whatsapp:'conta simulada',sessao:'sessão simulada'};
   const tela=TKEsteiraFluidez(raiz,()=>sessao);
   const rota='/esteira/preparacao?pagina=1&depois=simulado';
   let entregar, chamadas=0;
   const rede=()=>++chamadas===1?new Promise(r=>{entregar=r}):{ok:true,dado:'novo'};
   const antiga=tela.ler(rota,rede);
   await Promise.resolve();
   tela.invalidar(null,new Set(['/esteira/preparacao']));
   const nova=await tela.ler(rota,rede);
   entregar({ok:true,dado:'antigo'});
   const tardia=await antiga;
   tela.invalidar();
   const anterior=tela.ler(rota,()=>new Promise(r=>{entregar=r}));
   await Promise.resolve();
   sessao={whatsapp:'outra conta',sessao:'outra sessão'};
   entregar({ok:true,dado:'outra conta'});
   return [nova.dado,tardia.dado,chamadas,(await anterior).sessaoMudou];
 }''')
 assert estado==['novo','novo',2,True],estado
 c.close()
 # A revalidação que confirma perda de acesso remove os dados da aba ativa.
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block',has_touch=w<600)
  ns['instalar'](c)
  pg=c.new_page();pg.clock.install();pg.goto(BASE+'esteira.html')
  pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
  pg.click('[data-aba=pedidos]');pg.wait_for_selector('text=Pedidos ao fornecedor')
  c.route('**/esteira/pedidos',lambda r:r.fulfill(status=403,json={'ok':False,'acessoRevogado':True,'erro':'Seu acesso não permite entrar na Esteira.'}))
  pg.clock.fast_forward(31000);pg.locator('#login-w').wait_for()
  assert not pg.get_by_text('Pedidos ao fornecedor',exact=True).count()
  assert pg.locator('#abas').is_hidden()
  assert pg.get_by_text('Seu acesso não permite entrar na Esteira.',exact=True).is_visible()
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  pg.screenshot(path=str(OUT/f'esteira-acesso-revogado-{w}.png'))
  c.close()
 # Reiniciar o documento com a mesma sessão e rede controlada.
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block',has_touch=w<600)
  ns['instalar'](c)
  estado={'rev':'r1','auth':True,'reter':False,'consultas':0,'pedidos':0,'hoje':0,'escritas':0}
  retidas=[]
  from datetime import datetime, timezone, timedelta
  from urllib.parse import urlsplit
  dia=(datetime.now(timezone.utc)-timedelta(hours=3)).date().isoformat()
  def responder_sync(r):
   if not estado['auth']:
    return r.fulfill(status=403,json={'ok':False,'acessoRevogado':True,'erro':'Seu acesso não permite entrar na Esteira.'})
   return r.fulfill(json={'ok':True,'eu':{'admin':True,'nome':'Iara'},'acesso':'acesso-simulado','data':dia,'revisao':estado['rev']})
  def retomada_rota(r):
   path=urlsplit(r.request.url).path.rsplit('/',1)[-1]
   if r.request.method!='GET':
    estado['escritas']+=1
    return r.fallback()
   if path=='sincronizar':
    estado['consultas']+=1
    if estado['reter']:retidas.append(r);return
    return responder_sync(r)
   if path=='menu':
    return r.fulfill(json={'ok':True,'eu':{'admin':True,'nome':'Iara'},'acesso':'acesso-simulado','data':dia})
   if path=='hoje':estado['hoje']+=1
   if path!='pedidos':return r.fallback()
   estado['pedidos']+=1
   pedidos=[{'id':n,'fornecedor':f'Fornecedor simulado {n}','status':'a_caminho','itens':2} for n in range(1,26)]
   if estado['rev']=='r2':pedidos[-1]['fornecedor']='Fornecedor atualizado'
   return r.fulfill(json={'ok':True,'admin':True,'pedidos':pedidos,'acesso':'acesso-simulado','diaRevisao':dia,'revisao':estado['rev']})
  c.route('**/esteira/**',retomada_rota)
  pg=c.new_page();pg.goto(BASE+'esteira.html')
  pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
  pg.click('[data-aba=pedidos]')
  pg.locator('[data-pedido="25"]').wait_for()
  pg.evaluate('window.scrollTo(0,600)')
  pg.wait_for_timeout(600)
  pos=pg.evaluate('window.scrollY')
  assert pos>400
  antes=estado['pedidos']
  pg.evaluate("() => {document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));}")
  pg.wait_for_timeout(520)
  assert estado['consultas']==1 and estado['pedidos']==antes,(w,estado)
  assert pg.evaluate('window.scrollY')==pos
  estado['reter']=True;hoje=estado['hoje']
  pg.reload()
  for _ in range(30):
   if retidas:break
   pg.wait_for_timeout(100)
  assert len(retidas)==1 and not pg.locator('[data-pedido]').count(),(w,estado)
  estado['reter']=False;responder_sync(retidas.pop())
  pg.locator('[data-pedido="25"]').wait_for()
  assert estado['pedidos']==antes and estado['hoje']==hoje,(w,estado)
  assert pg.evaluate('window.scrollY')==pos
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  pg.screenshot(path=str(OUT/f'esteira-retomada-pedidos-{w}.png'))
  estado['rev']='r2'
  pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
  pg.get_by_text('Fornecedor atualizado',exact=True).wait_for()
  pg.wait_for_timeout(400)
  assert estado['pedidos']==antes+1 and estado['hoje']==hoje,(w,estado)
  estado['auth']=False
  pg.reload();pg.locator('#login-w').wait_for()
  assert not pg.locator('[data-pedido]').count() and estado['escritas']==0
  c.close()
 # O rascunho de uma conferência sobrevive à recarga, mas não registra nada sozinho.
 c=b.new_context(viewport={'width':390,'height':844},service_workers='block',has_touch=True)
 ns['instalar'](c)
 rascunho_dia=dia
 acessos={'rev':'r1','envios':0}
 def conferencia_rota(r):
  url=r.request.url
  if r.request.method=='POST':
   acessos['envios']+=1
   return r.fulfill(status=503,json={'ok':False})
  base={'ok':True,'acesso':'acesso-simulado','data':rascunho_dia,'revisao':acessos['rev'],
        'eu':{'admin':True,'nome':'Iara','confere':True}}
  if '/menu?' in url or '/sincronizar?' in url:return r.fulfill(json=base)
  if url.endswith('/hoje'):
   return r.fulfill(json={**base,'diaRevisao':rascunho_dia,'total':1,'feitas':0,'pecas':1,'escala':[],'funcoes':[],
        'lista':[{'id':'1001','nome':'Vestido para conferir','estoque':'4','tamanhos':'P, M','cores':'Verde','grupo':'Vestidos'}]})
  return r.fallback()
 c.route('**/esteira/**',conferencia_rota)
 pg=c.new_page();pg.goto(BASE+'esteira.html')
 pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1')
 pg.get_by_role('button',name='Vestido para conferir, abrir conferência').tap()
 pg.locator('#conf-estoque').fill('7')
 pg.get_by_role('button',name='P',exact=True).tap()
 pg.wait_for_timeout(650)
 pg.reload()
 pg.get_by_text('Conferência recuperada. Revise antes de salvar.',exact=True).wait_for()
 assert pg.locator('#conf-estoque').input_value()=='7'
 assert pg.get_by_role('button',name='P',exact=True).get_attribute('aria-pressed')=='false'
 pg.screenshot(path=str(OUT/'esteira-retomada-conferencia-390.png'))
 acessos['rev']='r2'
 pg.get_by_role('button',name='Salvar conferência',exact=True).tap()
 pg.get_by_text('A lista mudou ou ainda não pôde ser confirmada.',exact=False).wait_for()
 assert pg.locator('#conf-estoque').input_value()=='7' and acessos['envios']==0
 c.close()
 b.close()
print('PASS 4 telas: cache imediato com revalidação lenta, resposta fora de ordem, dados novos por bloco e rascunho preservado.')
