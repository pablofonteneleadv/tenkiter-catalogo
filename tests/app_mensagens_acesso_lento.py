"""Funcionária (não Admin) abre as Mensagens pelo atalho do app enquanto o servidor ainda responde os direitos de acesso (lento):
não pode aparecer "Sua conta não tem acesso ao módulo Mensagens" — o app espera os direitos antes de decidir. Serviços SIMULADOS."""
import os,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION
import mock_msg
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://127.0.0.1:8777/')
PERMS_FUNCIONARIA=["catalogo_admin","painel_simples"]
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(390,844),(412,915)]:
  c=b.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True);c.add_init_script(SESSION)
  st=install(c,perms=PERMS_FUNCIONARIA,versao='3.4');st['ig']['msg']=mock_msg.novo_estado()
  dire={k:True for k in ['acessar','responder','produtos','arquivos','contatos','etiquetas','notas','agenda','respostas']}
  dire.update({'funil':False,'metricas':False,'exportar':False,'configuracoes':False,'excluir_solicitacao':False})
  def lento(route):
   import time;time.sleep(1.2);route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps({'ok':True,'direitos':dire}))
  c.route('**/msg/acesso',lento)
  pg=c.new_page();erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
  pg.goto(BASE+'admin.html?app=mensagens')
  pg.wait_for_timeout(300)
  # atalho do app (notificação/ícone): pede para abrir as Mensagens logo no começo, antes dos direitos chegarem
  pg.evaluate("window.TKMobileOpenConversation&&window.TKMobileOpenConversation(1,true,'t')")
  pg.wait_for_timeout(4000)  # direitos chegam em ~1,2 s
  assert pg.evaluate("document.getElementById('overlay-mensagens')&&document.getElementById('overlay-mensagens').classList.contains('aberto')"),'As Mensagens deviam abrir para quem tem acesso'
  texto=pg.evaluate("(document.getElementById('mobile-push-status')||{}).innerText||''")
  assert 'não tem acesso ao módulo Mensagens' not in texto,('aviso falso de acesso',texto)
  assert not erros,erros
  c.close()
 b.close()
print('PASS app Mensagens: aviso falso de acesso não aparece com direitos lentos (390/412)')
