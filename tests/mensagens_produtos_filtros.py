"""Menu de filtros de Produtos compartilhado entre site e APK 2.4; dados simulados."""
import os,json
from pathlib import Path
from mock import install,SESSION
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8765/');OUT=Path('/workspace/artifacts/produtos-web');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=True,service_workers='block');c.add_init_script(SESSION)
  st=install(c,versao='3.7');products=st['produtos'];products[:]=products[:2]
  for i,prod in enumerate(products):prod.update(Status='Ativo',Nome='Vestido '+['azul','verde'][i],Categoria='Vestido',Genero='Feminino Adulto',Cores=['Azul','Verde'][i],Tamanhos=['M, 38','G, 40'][i],Estoque=2)
  c.add_init_script('localStorage.setItem("tenkiter_admin_prod_v1",'+json.dumps(json.dumps({'produtos':products,'em':1}))+');')
  pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.locator('#ms-lista .ms-conv[data-id="1"]').click();pg.screenshot(path=str(OUT/'debug-abertura.png'));pg.wait_for_selector('[data-ms=gaveta-produtos]')
  if w==390:
   pg.evaluate("""(()=>{window.originalFetchTest=window.fetch;window.fetch=(url,options)=>String(url).includes('/msg/pessoa?')?new Promise(resolve=>window.resolvePersonTest=resolve):window.originalFetchTest(url,options);return true})()""")
   pg.click('.ms-cab .ms-quem');pg.wait_for_selector('#ms-pessoa-editor',timeout=1000)
   assert 'Carregando contato' in pg.locator('#ms-pessoa-editor').inner_text()
   pg.evaluate("document.querySelector('.ms-cab .ms-quem').click();document.querySelector('.ms-cab .ms-quem').click()")
   assert pg.locator('#ms-pessoa-editor').count()==1
   pg.locator('#ms-pessoa-editor').get_by_role('button',name='Fechar',exact=True).click()
   pg.evaluate("window.resolvePersonTest(new Response(JSON.stringify({ok:true,nome:'Teste',conversa:{canal:'whatsapp1'},canais:[]})));window.fetch=window.originalFetchTest")
   pg.wait_for_timeout(100);assert pg.locator('#ms-pessoa-editor').count()==0
  pg.evaluate('(()=>{window.carregarProdutos=()=>new Promise(resolve=>window.finishCatalogTest=resolve);return true})()')
  pg.click('[data-ms=gaveta-produtos]');pg.wait_for_selector('#ms-prod-lista .ms-prod',timeout=1500)
  assert pg.locator('#ms-prod-lista .ms-prod').count()==2
  pg.fill('#ms-prod-busca','vést');pg.wait_for_selector('#ms-prod-refina:visible')
  for label in ['Categoria','Para quem','Tamanho','Cor']:assert pg.locator('#ms-prod-refina b',has_text=label).count()==1
  pg.get_by_role('button',name='Cor: Azul',exact=True).click();assert pg.locator('#ms-prod-lista .ms-prod').count()==1
  pg.screenshot(path=str(OUT/f'filtros-{w}.png'))
  pg.click('#ms-prod-refinar');assert pg.locator('#ms-prod-lista').is_visible()
  assert pg.locator('#ms-prod-lista .ms-prod').count()==1
  pg.locator('#ms-prod-lista .ms-prod-marca').click();assert pg.locator('#ms-prod-selbar').is_visible()
  pg.fill('#ms-prod-busca','vesti');pg.get_by_role('button',name='Limpar filtros',exact=True).click();pg.click('#ms-prod-refinar');assert pg.locator('#ms-prod-lista .ms-prod').count()==2
  assert pg.locator('#ms-prod-lista [aria-pressed=true]').count()==1
  if w==390:
   pg.set_viewport_size({'width':390,'height':480});pg.fill('#ms-prod-busca','vest');pg.screenshot(path=str(OUT/'filtros-altura480.png'));pg.click('#ms-prod-refinar')
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
  c.close()
 b.close()
print('Produtos: cache antes da rede, filtros nas 4 dimensões, contagem, acentos e seleção preservada em 4 viewports; altura reduzida aprovada.')
