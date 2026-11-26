"""Toque em "Espiar" (ou "Abrir conversa") na notificação do app com o app fechado: a WebView recebe o pedido logo no começo,
antes de chegar a resposta dos direitos de acesso. A conversa pedida tem de abrir (espiando ou não); nunca parar na lista.
Pedido do Pablo, 26/11/2026: "Se apertar em espiar, leva para a tela inicial, não leva até a conversa". Serviços SIMULADOS."""
import os,sys,json,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION
import mock_msg
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://127.0.0.1:8777/')
PERMS_FUNCIONARIA=["catalogo_admin","painel_simples"]
falhas=[]
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for espiar in (True,False):
  for atraso,quando in ((1.2,300),(0.0,50),(2.5,1500)):
   c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);c.add_init_script(SESSION)
   st=install(c,perms=PERMS_FUNCIONARIA,versao='3.4');st['ig']['msg']=mock_msg.novo_estado()
   dire={k:True for k in ['acessar','responder','produtos','arquivos','contatos','etiquetas','notas','agenda','respostas']}
   dire.update({'funil':False,'metricas':False,'exportar':False,'configuracoes':False,'excluir_solicitacao':False})
   def fazer(atraso):
    def lento(route):
     time.sleep(atraso);route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps({'ok':True,'direitos':dire}))
    return lento
   lento=fazer(atraso)
   c.route('**/msg/acesso',lento)
   pg=c.new_page();erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
   pg.goto(BASE+'admin.html?app=mensagens')
   pg.wait_for_timeout(quando)
   pg.evaluate("window.TKMobileOpenConversation&&window.TKMobileOpenConversation(1,%s,'n1')"%('true' if espiar else 'false'))
   pg.wait_for_timeout(5000)
   vista=pg.evaluate("(document.getElementById('ms-app')||{dataset:{}}).dataset.vista||''")
   nome='espiar=%s acesso=%.1fs pedido=%dms'%(espiar,atraso,quando)
   if vista!='conversa':falhas.append(nome+' -> vista='+vista)
   if erros:falhas.append(nome+' erros '+str(erros))
   print(('  ✔ ' if vista=='conversa' and not erros else '  ✘ ')+nome+' vista='+vista)
   c.close()
 b.close()
if falhas:
 print('FAIL',falhas);sys.exit(1)
print('PASS app: Espiar/Abrir da notificação abre a conversa mesmo com o app recém-aberto')
