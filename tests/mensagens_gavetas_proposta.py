"""Filtros/Mais como painéis da proposta: margens, seletor, ícones, rodapé e navegação reais, APIs simuladas."""
import os
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8774/');OUT=Path(os.environ.get('TK_EVID','/tmp/gavetas-proposta'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900),(390,470)]:
  c=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=w<600,service_workers='block');c.add_init_script(SESSION);c.add_init_script('window.TKAndroid={atualizar(){},permissoes(){}}')
  st=install(c,versao='4.28',perms=PERMS_ALL);s=st['ig'].setdefault('msg',mock_msg.novo_estado());s['etq_mock']=[{'id':i,'nome':n,'cor':'ambar','venda':1,'pessoas':0} for i,n in enumerate(['Novo cliente','Reserva','Aguardando pagamento','Pago','Enviado'],1)];s['convs'][0]['etiquetas']=[s['etq_mock'][1]]
  pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html');pg.wait_for_timeout(2300);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.wait_for_timeout(300)
  for zoom in [100,130]:
   pg.evaluate('(s)=>document.documentElement.style.fontSize=s+"%"',zoom)
   pg.click('#ms-btn-filtros');pg.wait_for_selector('.ms-gaveta-proposta');pg.wait_for_timeout(200)
   assert pg.locator('[name=ms-ft-fila]').evaluate('e=>e.tagName')=='SELECT'
   assert pg.locator('[name=ms-ft-etapa]').evaluate('e=>e.tagName')=='SELECT'
   assert pg.locator('#ms-gaveta').evaluate("e=>{const r=e.getBoundingClientRect(),a=document.getElementById('ms-app').getBoundingClientRect();return r.left<=a.left+1&&r.right>=a.right-1}")
   assert pg.locator('.ms-gaveta-painel').evaluate("e=>getComputedStyle(e).borderTopLeftRadius==='20px'")
   assert pg.locator('.ms-gaveta-corpo').evaluate("e=>{const r=e.firstElementChild.getBoundingClientRect(),b=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return r.left>=p.left+17&&r.right<=p.right-17&&b.bottom<=document.querySelector('.ms-filtros-pe').getBoundingClientRect().top+1}")
   assert pg.locator('.ms-filtros-pe [data-ms=filtros-aplicar]').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.height>=48&&r.bottom<=innerHeight+1}')
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
   ax=pg.evaluate("async()=>{const r=await axe.run(document.querySelector('.ms-gaveta-painel'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}")
   assert not ax,(w,h,zoom,ax)
   pg.screenshot(path=str(OUT/f'filtros-{w}-{h}-{zoom}.png'))
   pg.select_option('[name=ms-ft-etapa]','2');pg.click('[data-ms=filtros-aplicar]');pg.wait_for_selector('#ms-lista .ms-conv[data-id="1"]');assert pg.locator('#ms-lista .ms-conv').count()==1
   pg.click('#ms-btn-filtros');assert pg.input_value('[name=ms-ft-etapa]')=='2';pg.click('[data-ms=filtros-limpar]');pg.wait_for_selector('#ms-lista .ms-conv[data-id="2"]')
   if w==390 and h==844 and zoom==100:
    pg.click('#ms-btn-filtros');pg.select_option('[name=ms-ft-fila]','encerradas');pg.click('[data-ms=filtros-aplicar]');pg.wait_for_timeout(350);assert s['consultas'][-1]['filtro']=='encerradas';pg.click('#ms-btn-filtros');assert pg.input_value('[name=ms-ft-fila]')=='encerradas';pg.click('[data-ms=filtros-limpar]');pg.wait_for_selector('#ms-lista .ms-conv')
   pg.click('#ms-nav [data-ms=menu-geral]');pg.wait_for_selector('.ms-mais-item');pg.wait_for_timeout(180)
   assert pg.locator('.ms-mais-item').evaluate_all("es=>es.filter(e=>!e.hidden).every(e=>e.querySelectorAll('svg').length===2&&e.getBoundingClientRect().height>=48)")
   assert pg.locator('.ms-gaveta-corpo').evaluate("e=>{const r=e.firstElementChild.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return r.left>=p.left+17&&r.right<=p.right-17}")
   pg.screenshot(path=str(OUT/f'mais-{w}-{h}-{zoom}.png'))
   ax=pg.evaluate("async()=>{const r=await axe.run(document.querySelector('.ms-gaveta-painel'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}")
   assert not ax,(w,h,zoom,ax)
   x=pg.locator('.ms-gaveta-cab button');x.focus();pg.keyboard.press('Shift+Tab');assert pg.locator('.ms-mais-item').last.evaluate('e=>e===document.activeElement');pg.keyboard.press('Tab');assert x.evaluate('e=>e===document.activeElement')
   if w==390 and h==844 and zoom==100:pg.evaluate('history.back()')
   else:pg.keyboard.press('Escape')
   pg.wait_for_timeout(300);assert not pg.locator('#ms-gaveta').count()
  # Ação real pelo novo menu, mantendo o destino e o retorno.
  pg.click('#ms-nav [data-ms=menu-geral]');pg.locator('.ms-mais-item[data-ms=funil]').click();pg.wait_for_selector('.ms-fcol');pg.click('#ms-nav [data-ms=inicio]');pg.wait_for_selector('#ms-lista .ms-conv')
  pg.evaluate("TKMensagensAcessos.pode=k=>['acessar','responder'].includes(k);window.dispatchEvent(new Event('tk:mensagens-acessos'))")
  pg.click('#ms-nav [data-ms=menu-geral]');pg.wait_for_timeout(100);assert pg.locator('.ms-mais-item[data-ms=exp]').first.is_hidden();assert pg.locator('.ms-mais-item[data-ms=leitura-cfg]').is_hidden();assert pg.locator('.ms-mais-item[data-ms=selecionar]').is_visible();pg.keyboard.press('Escape');assert not errors,errors
  c.close()
 b.close()
print('Filtros e Mais: proposta visual, filtros/etapa, navegação, teclado, ACL e axe aprovados em cinco viewports × texto100/130%.')
