"""Arquivo autenticado no navegador e atualização explícita ao retomar/receber aviso."""
import os,copy
from mock import install,SESSION,PERMS_ALL
from mock_msg import novo_estado,iso
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block');ctx.add_init_script(SESSION)
 st=install(ctx,perms=PERMS_ALL,versao='3.7');s=st['ig']['msg']=novo_estado();m=copy.deepcopy(s['msgs'][0]);m.update({'id':333,'conversa_id':1,'tipo':'documento','texto':'TENKiTER-Mensagens-2.4.2.apk','midia':1,'enviada_em':iso(0)});s['msgs'].append(m)
 downloads=[]
 def file_route(r):
  downloads.append(dict(r.request.headers));r.fulfill(status=200,body=b'PK\x03\x04teste',headers={'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''TENKiTER-Mensagens-2.4.2.apk"})
 ctx.route('**/msg/midia?id=333&baixar=1',file_route)
 pg=ctx.new_page();pg.goto(os.environ.get('TK_BASE','http://localhost:8765/')+'admin.html?app=mensagens');pg.wait_for_selector('.ms-conv');pg.locator('#ms-lista .ms-conv[data-id="1"]').click();pg.wait_for_selector('#ms-texto')
 with pg.expect_download() as d:pg.locator('#ms-fio').get_by_role('button',name='Baixar arquivo',exact=True).last.click()
 assert d.value.suggested_filename=='TENKiTER-Mensagens-2.4.2.apk'
 assert downloads and downloads[0]['x-tk-sessao']=='tk2.x.y'
 pg.locator('.ms-voltar').click();pg.wait_for_timeout(250)
 c=copy.deepcopy(s['convs'][0]);c.update({'id':99,'nome':'Mensagem recém-chegada','contato':'5588993331111','ultima_em':iso(0),'atualizada_em':iso(0)});s['convs'].append(c)
 pg.evaluate('window.TKMensagensApp.atualizar()');pg.wait_for_selector('#ms-lista .ms-conv[data-id="99"]',timeout=2500)
 # Espiar vindo do aviso continua sem leitura e permite nota interna.
 antes=len(s['calls']);pg.evaluate('window.TKMobileOpenConversation(1,true)');pg.wait_for_selector('.ms-espiando');pg.locator('.ms-espiando [data-ms=notas-abrir]').click();pg.wait_for_selector('#ms-nota-interna')
 assert '/msg/lida' not in s['calls'][antes:]
 ctx.close();b.close()
print('Download com nome/sessão, atualização imediata da lista e Espiar da notificação: aprovados em simulação.')
