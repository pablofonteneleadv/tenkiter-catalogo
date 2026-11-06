"""Interface real com novos endpoints do Worker e SQLite local; nenhum envio externo."""
import os,sys,json,urllib.request,urllib.error,io
from PIL import Image
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL,PNG
from playwright.sync_api import sync_playwright
_img=io.BytesIO();Image.new('RGB',(160,240),(45,82,123)).save(_img,format='PNG');PNG=_img.getvalue()
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
OUT=Path(os.environ.get('TK_EVID',str(Path(__file__).parent/'saida/reparos/solicitacoes')));OUT.mkdir(parents=True,exist_ok=True)
def api(path,body=None,headers=None,method=None):
 req=urllib.request.Request('http://127.0.0.1:8774'+path,data=body,headers=headers or {},method=method)
 try:
  with urllib.request.urlopen(req) as r:return r.status,r.read(),r.headers.get('Content-Type','application/json')
 except urllib.error.HTTPError as e:return e.code,e.read(),e.headers.get('Content-Type','application/json')
def forward(route):
 q=urlsplit(route.request.url);code,data,mime=api(q.path+('?' +q.query if q.query else ''),route.request.post_data_buffer,route.request.headers,route.request.method);route.fulfill(status=code,body=data,content_type=mime)
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox'])
 for width,height in [(390,844),(412,915),(1440,900),(320,700)]:
  api('/qa/reset');ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<500,is_mobile=width<500,service_workers='block');ctx.add_init_script(SESSION);st=install(ctx,perms=PERMS_ALL);errors=[]
  def novos(route):
   path=urlsplit(route.request.url).path
   if path.startswith(('/msg/solicitacoes','/msg/cliente-foto','/esteira/caixa')):return forward(route)
   return route.fallback()
  ctx.route('**/*',novos)
  pg=ctx.new_page();
  def agir(l):
   if width<500:l.tap()
   else:l.focus();pg.keyboard.press('Enter')
  pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html');pg.wait_for_timeout(1800);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens');pg.wait_for_selector('.ms-conv');pg.click('#ms-lista .ms-conv[data-id="1"]');pg.wait_for_selector('#ms-texto')
  if width==320:pg.evaluate("document.documentElement.style.fontSize='130%'")
  for name in ['Foto do cliente','Pedido do cliente']:
   button=pg.get_by_role('button',name=name,exact=True);assert button.is_visible();assert button.evaluate('(e)=>e.getBoundingClientRect().height>=44')
  pg.screenshot(path=str(OUT/f'atalhos-{width}.png'))
  agir(pg.get_by_role('button',name='Foto do cliente',exact=True));assert pg.locator('#ms-registro-fotos').evaluate('(e)=>e.getBoundingClientRect().height>=44');pg.set_input_files('#ms-registro-fotos',{'name':'cliente.png','mimeType':'image/png','buffer':PNG});agir(pg.get_by_role('button',name='Guardar fotos do cliente',exact=True));pg.get_by_text('Fotos guardadas com os dados da ficha. Nenhuma mensagem foi enviada.',exact=True).wait_for();state=json.loads(api('/qa/estado')[1]);assert len(state['fotos'])==1 and state['fotos'][0]['nome']=='Maria';agir(pg.get_by_role('button',name='Fechar',exact=True))
  agir(pg.get_by_role('button',name='Pedido do cliente',exact=True));pg.get_by_label('Descrição geral do pedido',exact=True).fill('Cliente procura vestido azul M para sexta-feira.');pg.set_input_files('#ms-registro-fotos',{'name':'referencia.png','mimeType':'image/png','buffer':PNG});pg.screenshot(path=str(OUT/f'pedido-formulario-{width}.png'));agir(pg.get_by_role('button',name='Registrar pedido',exact=True));pg.get_by_text('Pedido registrado. Nenhuma mensagem foi enviada.',exact=True).wait_for();agir(pg.get_by_role('button',name='Ver pedidos deste cliente',exact=True));pg.locator('.ms-solicitacao').wait_for();assert pg.locator('.ms-solicitacao').count()==1
  agir(pg.locator('.ms-solicitacao-fotos summary'));pg.locator('.ms-solicitacao-fotos img').wait_for(state='visible');pg.wait_for_function("document.querySelector('.ms-solicitacao-fotos img').naturalWidth>0");agir(pg.get_by_text('Acompanhar solicitação',exact=True));pg.get_by_label('Situação do pedido',exact=True).select_option('aguardando_cliente');pg.get_by_label('Observações internas',exact=True).fill('Confirmar a cor antes de separar.');agir(pg.get_by_role('button',name='Assumir solicitação',exact=True));pg.get_by_text('Acompanhamento salvo. Nenhuma mensagem foi enviada.',exact=True).wait_for();state=json.loads(api('/qa/estado')[1]);assert state['solicitacoes'][0]['status']=='aguardando_cliente' and state['solicitacoes'][0]['responsavel'];pg.screenshot(path=str(OUT/f'pedido-acompanhamento-{width}.png'))
  agir(pg.get_by_role('button',name='Usar descrição na resposta',exact=True));pg.wait_for_selector('#ms-texto');assert 'vestido azul' in pg.locator('#ms-texto').input_value();assert not st['ig']['msg']['envios'],'Preparar resposta enviou mensagem'
  # A seção global também abre fora do cliente e mantém o registro salvo.
  if width<700:agir(pg.get_by_role('button',name='Voltar para as conversas',exact=True))
  agir(pg.get_by_role('tab',name='Solicitações de clientes',exact=True));pg.locator('.ms-solicitacao').wait_for();assert pg.locator('.ms-solicitacao').count()==1;pg.get_by_label('Situação das solicitações',exact=True).select_option('atendida');pg.get_by_text('Nenhuma solicitação neste filtro.',exact=True).wait_for()
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')));violations=pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-mensagens'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}");assert not violations,violations;assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
  ctx.close();print('OK',width,'ficha automática, fotos, pedido, acompanhamento e rascunho sem envio')
 browser.close()
