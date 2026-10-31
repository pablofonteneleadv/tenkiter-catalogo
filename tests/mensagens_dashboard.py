"""Caixa atual: quatro filas, canal por select, envio/retry, rascunho e exportação.
O roteiro v2 esperava abas por canal e acesso exclusivo de Admin, contratos superados.
Citação, eventos, anexos e painel também têm jornadas específicas no executor.
"""
import os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8765/')
mock_msg.ASSINATURA_PADRAO=False
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for width,height in [(320,700),(390,844),(412,915),(1440,900)]:
  ctx=b.new_context(viewport={'width':width,'height':height},is_mobile=width<600,has_touch=width<600,service_workers='block');ctx.add_init_script(SESSION);ctx.add_init_script('window.TK_MENSAGENS_POLL_MS=400;');st=install(ctx,perms=PERMS_ALL,versao='4.28');S=st['ig'].setdefault('msg',mock_msg.novo_estado());pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('dialog',lambda d:d.accept())
  pg.goto(BASE+'admin.html');pg.wait_for_timeout(1500);pg.click('#details-ferramentas > summary');pg.locator('#btn-abrir-mensagens').evaluate("e=>e.scrollIntoView({block:'center'})");pg.click('#btn-abrir-mensagens');pg.wait_for_selector('#ms-abas .ms-aba')
  assert pg.locator('#ms-abas .ms-aba').count()==4
  pg.click('#ms-abas [data-aba=todos]');pg.select_option('#ms-filtro-canal','whatsapp1');pg.wait_for_selector('[data-ms=abrir][data-id="1"]');assert pg.input_value('#ms-filtro-canal')=='whatsapp1'
  pg.fill('#ms-busca','entregam');pg.wait_for_timeout(800);assert pg.locator('#ms-lista .ms-conv').count()==1;pg.fill('#ms-busca','');pg.wait_for_timeout(600)
  pg.click('[data-ms=abrir][data-id="1"]');pg.wait_for_selector('#ms-fio .ms-bolha')
  if pg.locator('[data-ms=atender]').count():pg.click('[data-ms=atender]');pg.wait_for_timeout(300)
  pg.fill('#ms-texto','Resposta de teste');pg.click('#ms-enviar');pg.wait_for_timeout(700)
  assert len(S['envios'])==1 and S['envios'][0]['texto']=='Resposta de teste' and S['envios'][0].get('idLocal')
  assert pg.input_value('#ms-texto')=='' and pg.is_disabled('#ms-enviar')
  S['envio']='erro';pg.fill('#ms-texto','Nova tentativa');pg.click('#ms-enviar');pg.wait_for_selector('[data-ms=reenviar]');S['envio']='ok';pg.click('[data-ms=reenviar]');pg.wait_for_timeout(700);assert not pg.locator('.ms-bolha.falhou').count()
  pg.fill('#ms-texto','Rascunho preservado')
  pg.click('#ms-mais-conv');pg.wait_for_selector('.ms-menu');assert 'Exportar esta conversa (CSV)' in pg.inner_text('.ms-menu')
  with pg.expect_download() as download:pg.get_by_text('Exportar esta conversa (CSV)',exact=True).click()
  assert download.value.suggested_filename=='tenkiter-mensagens-teste.csv' and 'conversa=1' in S['exportacoes'][-1]
  if width<600:pg.click('[data-ms=voltar]');pg.wait_for_timeout(300)
  pg.select_option('#ms-filtro-canal','whatsapp2');pg.wait_for_timeout(400);assert 'João' in pg.inner_text('#ms-lista')
  pg.select_option('#ms-filtro-canal','whatsapp1');pg.wait_for_timeout(400);pg.click('[data-ms=abrir][data-id="1"]');pg.wait_for_selector('#ms-texto');assert pg.input_value('#ms-texto')=='Rascunho preservado'
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
  assert not pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-mensagens'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}")
  assert not errors,errors;ctx.close();print('OK',width,'filas, canal, busca, envio, retry, rascunho, exportação e axe')
 b.close()
print('FALHAS=0')
