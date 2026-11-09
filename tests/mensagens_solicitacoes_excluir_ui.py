"""Excluir solicitação de cliente: botão só com permissão, confirmação nativa, Desfazer, dados preservados.
Interface real (Chromium) com o Worker e SQLite locais; nenhum envio externo e nenhum dado real apagado."""
import os,sys,json,urllib.request,urllib.error
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,PERMS_ALL
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
PORTA=os.environ.get('TK_QA_PORT','8774')
OUT=Path(os.environ.get('TK_EVID',str(Path(__file__).parent/'saida/reparos/solicitacoes-excluir')));OUT.mkdir(parents=True,exist_ok=True)
ADMIN='88999999999';ATENDENTE='88999999997'
def api(path,body=None,whats=ADMIN,method=None):
 h={'X-TK-Whats':whats,'X-TK-Sessao':'tk3.teste','Content-Type':'application/json'}
 req=urllib.request.Request('http://127.0.0.1:'+PORTA+path,data=json.dumps(body).encode() if body is not None else None,headers=h,method=method or ('POST' if body is not None else 'GET'))
 try:
  with urllib.request.urlopen(req) as r:return r.status,json.loads(r.read() or b'{}')
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or b'{}')
def forward(route,whats=None):
 q=urlsplit(route.request.url);h=dict(route.request.headers)
 if whats:h['x-tk-whats']=whats   # o mock de login sempre devolve a mesma conta; aqui a pessoa logada é a escolhida
 req=urllib.request.Request('http://127.0.0.1:'+PORTA+q.path+('?'+q.query if q.query else ''),data=route.request.post_data_buffer,headers=h,method=route.request.method)
 try:
  with urllib.request.urlopen(req) as r:code,data,mime=r.status,r.read(),r.headers.get('Content-Type','application/json')
 except urllib.error.HTTPError as e:code,data,mime=e.code,e.read(),e.headers.get('Content-Type','application/json')
 route.fulfill(status=code,body=data,content_type=mime)
def estado():return json.loads(urllib.request.urlopen('http://127.0.0.1:'+PORTA+'/qa/estado').read())['solicitacoes']
SEMENTES=[('11111111-1111-4111-8111-111111111111','Vestido azul M para sexta-feira.'),('22222222-2222-4222-8222-222222222222','Saia midi preta G.')]
def semear():
 urllib.request.urlopen('http://127.0.0.1:'+PORTA+'/qa/reset')
 for i,d in SEMENTES:assert api('/msg/solicitacoes',{'id':i,'conversa':1,'descricao':d})[0]==200
def abrir(pg,agir,largura):
 pg.goto(BASE+'admin.html');pg.wait_for_timeout(1800);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens');pg.wait_for_selector('.ms-conv')
 agir(pg.get_by_role('tab',name='Solicitações de clientes',exact=True));pg.locator('.ms-solicitacao').first.wait_for()
def contexto(browser,largura,altura,whats,perms):
 ctx=browser.new_context(viewport={'width':largura,'height':altura},has_touch=largura<500,is_mobile=largura<500,service_workers='block')
 ctx.add_init_script("localStorage.setItem('tm_session', JSON.stringify({whatsapp:'"+whats+"',sessao:'tk3.teste'}));")
 install(ctx,perms=perms)
 def novos(route):
  if urlsplit(route.request.url).path.startswith(('/msg/solicitacoes','/msg/acesso','/msg/cliente-foto')):return forward(route,whats)
  return route.fallback()
 ctx.route('**/*',novos);return ctx
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox'])
 for largura,altura in [(390,844),(412,915),(1440,900),(320,700)]:
  semear();erros=[]
  # 1) Admin total vê o botão, confirma e exclui; Desfazer restaura; os dados continuam no banco.
  ctx=contexto(browser,largura,altura,ADMIN,PERMS_ALL);pg=ctx.new_page();pg.on('pageerror',lambda e:erros.append(str(e)))
  agir=lambda l:l.tap() if largura<500 else (l.focus(),pg.keyboard.press('Enter'))
  abrir(pg,agir,largura)
  if largura==320:pg.evaluate("document.documentElement.style.fontSize='130%'")
  botoes=pg.get_by_role('button',name='Excluir solicitação',exact=True);assert botoes.count()==2
  assert botoes.first.evaluate('(e)=>e.getBoundingClientRect().height>=44 && e.getBoundingClientRect().width>=44')
  assert pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth"),'Estouro horizontal'
  botoes.first.scroll_into_view_if_needed();pg.screenshot(path=str(OUT/f'lista-admin-{largura}.png'))
  textos=[]
  pg.once('dialog',lambda d:(textos.append(d.message),d.dismiss()));agir(botoes.first);pg.wait_for_timeout(300)
  assert textos and 'Excluir esta solicitação de' in textos[0] and 'não são apagadas' in textos[0],textos
  assert all(not s['excluida_em'] for s in estado()),'Cancelar não pode excluir'
  pg.once('dialog',lambda d:d.accept());agir(botoes.first)
  pg.get_by_text('Solicitação excluída',exact=True).wait_for();pg.wait_for_function("document.querySelectorAll('.ms-solicitacao').length===1")
  excl=[s for s in estado() if s['excluida_em']];assert len(excl)==1 and excl[0]['excluida_por']==ADMIN and len(estado())==2,'Exclusão é lógica: a linha continua no banco'
  pg.screenshot(path=str(OUT/f'excluida-desfazer-{largura}.png'))
  agir(pg.get_by_role('button',name='Desfazer',exact=True));pg.wait_for_function("document.querySelectorAll('.ms-solicitacao').length===2")
  assert not [s for s in estado() if s['excluida_em']],'Desfazer restaura'
  pg.once('dialog',lambda d:d.accept());agir(pg.get_by_role('button',name='Excluir solicitação',exact=True).first)
  pg.wait_for_function("document.querySelectorAll('.ms-solicitacao').length===1")
  pg.get_by_label('Situação das solicitações',exact=True).select_option('todas');pg.wait_for_timeout(500);assert pg.locator('.ms-solicitacao').count()==1,'Excluída não aparece em Todas'
  assert len(estado())==2
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')));v=pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-mensagens'));return r.violations.filter(x=>['critical','serious'].includes(x.impact)).map(x=>x.id)}");assert not v,v
  assert not erros,erros;ctx.close()
  # 2) Sem a permissão: nenhum botão e o servidor recusa a chamada direta.
  semear();ctx=contexto(browser,largura,altura,ATENDENTE,['portal','catalogo_admin']);pg=ctx.new_page()
  agir=lambda l:l.tap() if largura<500 else (l.focus(),pg.keyboard.press('Enter'))
  abrir(pg,agir,largura);assert pg.get_by_role('button',name='Excluir solicitação',exact=True).count()==0,'Botão aparece sem permissão'
  assert pg.get_by_role('button',name='Abrir conversa',exact=True).count()>=1
  pg.screenshot(path=str(OUT/f'lista-sem-permissao-{largura}.png'))
  c,j=api('/msg/solicitacoes/excluir',{'id':SEMENTES[0][0]},ATENDENTE);assert c==403 and 'não permite' in j['erro'],(c,j)
  assert not [s for s in estado() if s['excluida_em']];ctx.close()
  # 3) O Admin total concede a essa pessoa: o botão aparece e exclui.
  assert api('/msg/acessos',{'tipo':'pessoa','alvo':ATENDENTE,'chave':'excluir_solicitacao','valor':True})[0]==200
  ctx=contexto(browser,largura,altura,ATENDENTE,['portal','catalogo_admin']);pg=ctx.new_page()
  agir=lambda l:l.tap() if largura<500 else (l.focus(),pg.keyboard.press('Enter'))
  abrir(pg,agir,largura);botoes=pg.get_by_role('button',name='Excluir solicitação',exact=True);assert botoes.count()==2
  pg.once('dialog',lambda d:d.accept());agir(botoes.first);pg.wait_for_function("document.querySelectorAll('.ms-solicitacao').length===1")
  assert [s['excluida_por'] for s in estado() if s['excluida_em']]==[ATENDENTE]
  api('/msg/acessos',{'tipo':'pessoa','alvo':ATENDENTE,'chave':'excluir_solicitacao','valor':None});ctx.close()
  print('OK',largura,'excluir solicitação: permissão, confirmação, Desfazer, dados preservados e axe')
 browser.close()
