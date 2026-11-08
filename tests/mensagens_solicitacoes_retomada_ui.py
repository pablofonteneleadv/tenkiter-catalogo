"""Resposta perdida após gravar: mesma solicitação/foto, retomada após reload; SQLite e serviços simulados."""
import io,json,os,sys,subprocess,urllib.request,urllib.error
from pathlib import Path
from urllib.parse import urlsplit
from PIL import Image
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
OUT=Path(__file__).parent/'saida/reparos/solicitacoes-retomada';OUT.mkdir(parents=True,exist_ok=True)
def foto(cor):
 b=io.BytesIO();Image.new('RGB',(240,320),cor).save(b,format='PNG');return b.getvalue()
FOTOS=[{'name':f'foto-{i}.png','mimeType':'image/png','buffer':foto(c)} for i,c in enumerate(['blue','red','green'],1)]
def api(path,body=None,headers=None,method=None):
 req=urllib.request.Request('http://127.0.0.1:'+os.environ.get('TK_QA_PORT','8774')+path,data=body,headers=headers or {},method=method)
 try:
  with urllib.request.urlopen(req,timeout=20) as r:return r.status,r.read(),r.headers.get('Content-Type','application/json')
 except urllib.error.HTTPError as e:return e.code,e.read(),e.headers.get('Content-Type','application/json')
def encaminhar(route):
 q=urlsplit(route.request.url);return api(q.path+('?' +q.query if q.query else ''),route.request.post_data_buffer,route.request.headers,route.request.method)
def cumprir(route,res):
 code,data,mime=res;route.fulfill(status=code,body=data,content_type=mime)
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox'])
 for largura,altura in ([(390,844)] if os.environ.get('TK_QA_SOMENTE_390') else [(390,844),(412,915),(1440,900),(320,700)]):
  api('/qa/reset');ctx=browser.new_context(viewport={'width':largura,'height':altura},has_touch=largura<500,is_mobile=largura<500,service_workers='block');ctx.add_init_script(SESSION);ctx.add_init_script('window.TK_REGISTRO_PRAZO_MS=1000');st=install(ctx,perms=PERMS_ALL)
  if largura==390:ctx.add_init_script('window.TKAndroid={versao:()=>"2.4.22",telaMensagensVisivel:()=>true};')
  retidas=[];metadados=[];fotos=[];perder={'pedido':True,'foto':True}
  def rota(route):
   path=urlsplit(route.request.url).path
   if not path.startswith(('/msg/solicitacoes','/msg/cliente-foto')):return route.fallback()
   res=encaminhar(route)
   if route.request.method=='POST' and path=='/msg/solicitacoes':
    metadados.append(json.loads(route.request.post_data));assert res[0]==200
    if perder['pedido']:perder['pedido']=False;retidas.append(route);return
   if route.request.method=='POST' and path=='/msg/solicitacoes/foto':
    fotos.append(route.request.url);assert res[0]==200
    if perder['foto']:perder['foto']=False;retidas.append(route);return
   cumprir(route,res)
  if os.environ.get('TK_QA_BASELINE'):
   anterior=subprocess.check_output(['git','show','HEAD:admin-mensagens.js'])
   ctx.route('**/admin-mensagens.js*',lambda route:route.fulfill(body=anterior,content_type='application/javascript'))
  ctx.route('**/*',rota);pg=ctx.new_page();erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
  def abrir():
   pg.goto(BASE+('admin.html?app=mensagens' if largura==390 else 'admin.html'));pg.wait_for_timeout(1800)
   if largura!=390:pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens')
   pg.wait_for_selector('.ms-conv');pg.click('#ms-lista .ms-conv[data-id="1"]');pg.wait_for_selector('#ms-texto');pg.wait_for_timeout(300)
  abrir();pg.get_by_role('button',name='Pedido do cliente',exact=True).click();pg.get_by_label('Descrição geral do pedido',exact=True).fill('Vestido para sábado; azul, tamanho M.');pg.set_input_files('#ms-registro-fotos',FOTOS[:2])
  pg.wait_for_function("[...document.querySelectorAll('.ms-solicitacao-arquivo img')].length===2&&[...document.querySelectorAll('.ms-solicitacao-arquivo img')].every(x=>x.naturalWidth>0)")
  pg.get_by_role('button',name='Registrar pedido',exact=True).click();pg.locator('#ms-gaveta').wait_for(state='detached')
  def painel():
   pg.get_by_role('button',name='Acompanhar registros de clientes',exact=True).click();pg.locator('.ms-registro-processo').wait_for()
  try:
   # 1) A resposta do pedido se perde: a fila avisa, preserva tudo no aparelho e oferece tentar de novo.
   pg.get_by_role('button',name='Acompanhar registros de clientes',exact=True).filter(has_text='Envio precisa de atenção').wait_for(timeout=8000)
   painel();pg.get_by_role('button',name='Tentar de novo',exact=True).wait_for(timeout=6000)
   assert pg.get_by_role('button',name='Tentar de novo',exact=True).is_enabled()
   if largura==320:pg.evaluate("document.documentElement.style.fontSize='130%'")
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert pg.get_by_role('button',name='Tentar de novo',exact=True).evaluate('e=>e.getBoundingClientRect().height>=44')
   assert 'Failed' not in pg.locator('#ms-gaveta').inner_text() and 'HTTP' not in pg.locator('#ms-gaveta').inner_text()
   state=json.loads(api('/qa/estado')[1]);assert len(state['solicitacoes'])==1
   ident=state['solicitacoes'][0]['id'];assert not fotos
   pg.screenshot(path=str(OUT/f'pedido-sem-resposta-{largura}.png'))
   # 2) Recarregar a página mantém o envio guardado; tentar de novo usa o mesmo pedido.
   abrir();painel();pg.get_by_role('button',name='Tentar de novo',exact=True).wait_for()
   pg.get_by_role('button',name='Tentar de novo',exact=True).click()
   # 3) Agora a foto grava, mas a resposta se perde: tentar de novo repete a mesma identificação.
   for _ in range(100):
    if fotos:break
    pg.wait_for_timeout(100)
   pg.wait_for_function("(()=>{const b=[...document.querySelectorAll('#ms-gaveta button')].find(x=>x.textContent==='Tentar de novo');return !!b&&!b.disabled})()",timeout=8000)
   state=json.loads(api('/qa/estado')[1]);assert len(state['solicitacoes'])==1 and state['solicitacoes'][0]['id']==ident
   assert len(metadados)==2 and metadados[0]['id']==metadados[1]['id']==ident
   pg.screenshot(path=str(OUT/f'foto-sem-resposta-{largura}.png'))
   pg.get_by_role('button',name='Tentar de novo',exact=True).click();pg.get_by_text('Pedido registrado. Nenhuma mensagem foi enviada.',exact=True).wait_for()
   assert len(fotos)==3 and fotos[0]==fotos[1],'Foto sem recibo ganhou outro identificador'
   assert len(json.loads(api('/qa/estado')[1])['solicitacoes'])==1
   pg.get_by_role('button',name='Ver pedidos deste cliente',exact=True).click();pg.locator('.ms-solicitacao').wait_for();assert pg.locator('.ms-solicitacao-mini').count()==2
   # 4) Adicionar fotos ao pedido existente pela mesma fila; repetir a mesma imagem não cria cópia.
   for _ in range(2):
    pg.get_by_role('button',name='Adicionar fotos',exact=True).click();pg.set_input_files('#ms-registro-fotos',[FOTOS[2]]);pg.get_by_role('button',name='Guardar fotos',exact=True).click();pg.locator('#ms-gaveta').wait_for(state='detached')
    painel();pg.get_by_text('Fotos acrescentadas ao pedido. Nenhuma mensagem foi enviada.',exact=True).wait_for()
    pg.get_by_role('button',name='Ver pedidos deste cliente',exact=True).click();pg.locator('.ms-solicitacao').wait_for();assert pg.locator('.ms-solicitacao-mini').count()==3,'Reanexar a mesma foto criou cópia'
   assert not st['ig']['msg']['envios'];assert not erros,erros
   pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')));violacoes=pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-mensagens'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}");assert not violacoes,violacoes
   pg.screenshot(path=str(OUT/f'retomada-concluida-{largura}.png'));print('OK',largura,'resposta perdida, reload, mesmas IDs e anexos no pedido existente, sem duplicação ou envio',flush=True)
  except Exception:
   pg.screenshot(path=str(OUT/f'falha-ou-baseline-{largura}.png'))
   print('Estado no ponto da falha:',len(metadados),'pedidos enviados;',len(fotos),'fotos enviadas; registros no servidor:',len(json.loads(api('/qa/estado')[1])['solicitacoes']),flush=True)
   raise
  finally:
   for route in retidas:
    try:route.abort()
    except Exception:pass
   ctx.close()
 browser.close()
