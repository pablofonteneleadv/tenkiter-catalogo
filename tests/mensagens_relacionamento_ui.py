"""Contexto de relacionamento no card/conversa, discreto e sem alterar leitura/ordem."""
import os,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from mock import install, SESSION, PERMS_ALL
import mock_msg
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
OUT=Path('tests/saida/reparos/relacionamento');OUT.mkdir(parents=True,exist_ok=True)
H={'pontos':35,'faixa':'Baixa','base':50,'totalEventos':15,'historico':[{'motivo':'sem_resposta','total':15,'ultimo':'2026-11-01T10:00:00Z'}],'motivos':[{'motivo':'sem_resposta','ocorrencias':15,'eventos':5,'pontos':-15,'validadeDias':14}],'semHistorico':False,'calculadoEm':'2026-11-01T10:00:00Z'}
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
  ctx=b.new_context(viewport={'width':w,'height':h},service_workers='block');ctx.add_init_script(SESSION);ctx.add_init_script('window.TK_MENSAGENS_POLL_MS=400;')
  st=install(ctx,perms=PERMS_ALL);s=mock_msg.novo_estado();st['ig']['msg']=s;s['convs'][0]['relacionamento']=H;calls=[];falhar=[False];vazio=[False];resumo=[dict(H)]
  def api(route):
   if urlparse(route.request.url).path=='/msg/relacionamento':
    calls.append(route.request.method);assert route.request.method=='GET'
    route.fulfill(json={'ok':False,'erro':'Falha simulada'} if falhar[0] else {'ok':True,'relacionamento':{**resumo[0],'pontos':resumo[0]['base'],'totalEventos':0,'historico':[],'motivos':[]} if vazio[0] else resumo[0]});return
   route.fallback()
  ctx.route('**/*',api)
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html');pg.wait_for_timeout(1700);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.wait_for_timeout(650)
  ids=pg.locator('#ms-lista .ms-conv').evaluate_all('xs=>xs.map(x=>x.dataset.id)');card=pg.locator('#ms-lista .ms-conv[data-id="1"]');assert 'Hist. 35' in card.inner_text()
  height=card.bounding_box()['height'];badge=card.locator('.ms-relacionamento-mini');badge.evaluate('e=>e.style.display="none"');base=card.bounding_box()['height'];badge.evaluate('e=>e.style.display=""');assert height<=base+18,(w,height,base)
  assert pg.locator('#ms-lista .ms-conv').evaluate_all('xs=>xs.map(x=>x.dataset.id)')==ids
  pg.screenshot(path=str(OUT/f'card-{w}.png'))
  # Espiar mantém leitura; abrir apenas o histórico tampouco marca como lida.
  pg.locator('#ms-lista .ms-espiar[data-id="1"]').click();pg.wait_for_selector('#ms-conversa .ms-relacionamento-abrir');pg.wait_for_timeout(250);lidas=list(s['lidas'])
  header=pg.locator('#ms-conversa .ms-cab');before=header.bounding_box()['height'];target=pg.locator('.ms-relacionamento-abrir');target.evaluate('e=>e.style.display="none"');assert header.bounding_box()['height']>=before-1;target.evaluate('e=>e.style.display=""');assert target.bounding_box()['height']>=44;assert pg.locator('.ms-cab .ms-quem').bounding_box()['width']>=90
  target.click();pg.wait_for_selector('.ms-relacionamento-evento');assert '15 vezes' in pg.inner_text('#ms-gaveta');assert not pg.locator('#ms-gaveta details').get_attribute('open')
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
  for zoom in [100,130]:
   pg.evaluate('(n)=>document.documentElement.style.fontSize=n+"%"',zoom)
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert not pg.evaluate("async()=> (await axe.run(document.querySelector('.ms-gaveta-painel'))).violations.filter(x=>['serious','critical'].includes(x.impact)).map(x=>x.id)")
   pg.screenshot(path=str(OUT/f'detalhe-{w}-{zoom}.png'))
  pg.get_by_text('Como a nota foi calculada',exact=True).click();assert '15 ocorrência(s)' in pg.inner_text('#ms-gaveta');assert '5 conta(m)' in pg.inner_text('#ms-gaveta')
  pg.keyboard.press('Escape');pg.wait_for_selector('#ms-gaveta',state='detached');assert pg.locator('.ms-relacionamento-abrir').evaluate('e=>e===document.activeElement');assert s['lidas']==lidas;assert not s['envios']
  if w==390:
   resumo[0]={**H,'pontos':36,'base':51};s['convs'][0]['relacionamento']=resumo[0];s['convs'][0]['atualizada_em']=mock_msg.iso(-1);pg.wait_for_function("document.querySelector('.ms-relacionamento-abrir').textContent==='Hist. 36'",timeout=10000);assert s['lidas']==lidas
  # Falha e vazio continuam distinguíveis da nota e oferecem saída/retry.
  falhar[0]=True;target.click();pg.wait_for_selector('#ms-gaveta [data-ms=relacionamento]',state='visible');assert 'Não consegui' in pg.inner_text('#ms-gaveta');falhar[0]=False;vazio[0]=True;pg.locator('#ms-gaveta [data-ms=relacionamento]').click();pg.wait_for_function("document.querySelector('#ms-gaveta').textContent.includes('Nenhum encerramento')");assert not errors,errors
  if w==320:
   pg.keyboard.press('Escape');pg.wait_for_selector('#ms-gaveta',state='detached');pg.locator('#ms-conversa [data-ms=atender]').click();pg.wait_for_selector('#ms-texto');pg.fill('#ms-texto','Rascunho preservado');pg.set_viewport_size({'width':320,'height':470});target.click();pg.wait_for_function("document.querySelector('#ms-gaveta').textContent.includes('Nenhum encerramento')");pg.keyboard.press('Escape');pg.wait_for_selector('#ms-gaveta',state='detached');assert pg.input_value('#ms-texto')=='Rascunho preservado';assert pg.locator('#ms-enviar').bounding_box()['y']+pg.locator('#ms-enviar').bounding_box()['height']<=470;pg.screenshot(path=str(OUT/'teclado-320.png'))
  print('OK',w,'card compacto, 15 ocorrências, detalhe, leitura/ordem, teclado, erro/vazio e axe',flush=True);ctx.close()
 b.close()
