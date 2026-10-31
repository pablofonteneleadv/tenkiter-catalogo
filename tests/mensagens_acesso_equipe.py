"""Catálogo 1 abre atendimento; ferramentas sem direito não aparecem."""
import os,json
from mock import install,SESSION
from mock_msg import novo_estado
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block');ctx.add_init_script(SESSION)
 st=install(ctx,perms=['catalogo_admin','catalogo_cadastrar','painel_simples','cliente'],versao='3.7');st['ig']['msg']=novo_estado()
 rights={k:True for k in ['acessar','responder','arquivos','contatos','etiquetas','notas','agenda','respostas']};rights.update({k:False for k in ['metricas','exportar','funil','configuracoes']})
 ctx.route('**/msg/acesso',lambda r:r.fulfill(json={'ok':True,'permitido':True,'direitos':rights}))
 pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(os.environ.get('TK_BASE','http://localhost:8765/')+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv')
 pg.click('#ms-mais');pg.wait_for_selector('#ms-gaveta[data-tipo=mais]')
 for action in ['painel','exp','funil','leitura-cfg','equipe-atividade']:
  for e in pg.locator('#ms-gaveta [data-ms="'+action+'"]').all():assert not e.is_visible(),action
 assert not errors,errors
 ctx.close();b.close()
print('Equipe catálogo 1 abre Mensagens; ferramentas administrativas ocultas.')
