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
  pg.clock.install();pg.goto(BASE+'esteira.html');pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1');pg.wait_for_selector('.peca')
  pg.click('[data-aba=pedidos]');pg.wait_for_selector('text=Pedidos ao fornecedor');pg.click('[data-aba=hoje]');pg.clock.fast_forward(16000)
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
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  assert not erros,erros;c.close()
 b.close()
print('PASS 4 telas: cache imediato com revalidação lenta, resposta fora de ordem, dados novos por bloco e rascunho preservado.')
