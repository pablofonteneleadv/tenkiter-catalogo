"""Troca de abas e revalidação lenta; rede simulada, sem escrita real."""
import os
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
 b.close()
print('PASS 4 telas: cache imediato com revalidação lenta, resposta fora de ordem, dados novos por bloco e rascunho preservado.')
