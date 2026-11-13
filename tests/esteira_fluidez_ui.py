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
  pg.click('[data-aba=config]');pg.wait_for_selector('#cfg-funcoes');pg.fill('#cfg-funcoes','Fotos, Meu rascunho')
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
  c.route('**/esteira/config',lambda r:r.abort())
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
  pg.get_by_text('A Esteira demorou para responder.',exact=True).wait_for()
  botao=pg.get_by_role('button',name='Tentar de novo',exact=True)
  assert botao.bounding_box()['height']>=44
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  pg.screenshot(path=str(OUT/f'esteira-servidor-demorou-{w}.png'))

  c.unroute('**/esteira/fotos')
  c.route('**/esteira/fotos',lambda r:r.abort())
  botao.click()
  pg.get_by_text('Não foi possível falar com o servidor da Esteira.',exact=True).wait_for()
  c.set_offline(True)
  botao.click()
  pg.get_by_text('Sem conexão. Verifique a internet e tente de novo.',exact=True).wait_for()
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
 b.close()
print('PASS 4 telas: cache imediato com revalidação lenta, resposta fora de ordem, dados novos por bloco e rascunho preservado.')
