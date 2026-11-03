"""Entrada do lote da Gestão em Fotos IA; serviços simulados, sem gerar imagens."""
from fotoia_jornadas import ambiente, BASE, OUT
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c,st,pg,errors=ambiente(b,w,h)
  pg.goto(BASE+'admin.html')
  pg.wait_for_function('typeof produtos!=="undefined" && produtos.length>0')
  ids=pg.evaluate('produtos.slice(2,4).map(p=>String(p.ID))')
  pg.evaluate('(ids)=>{selecionadosBulk=new Set(ids);atualizarBarraBulk();renderizarProdutos()}',ids)
  pg.wait_for_selector('#btn-bulk-fotoia:visible')
  assert not pg.locator('#btn-bulk-mais').count()
  assert pg.locator('#bulk-bar .bulk-bar-actions #btn-bulk-separar').count()==1
  for zoom in [1,1.3]:
   pg.evaluate('(z)=>document.documentElement.style.fontSize=(z*100)+"%"',zoom)
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   assert pg.locator('#btn-bulk-fotoia').bounding_box()['height']>=44
  pg.locator('#btn-bulk-fotoia').scroll_into_view_if_needed()
  pg.screenshot(path=str(OUT/f'menu-selecao-{w}.png'))
  pg.click('#btn-bulk-fotoia')
  pg.wait_for_url('**/fotos-ia.html?origem=gestao&peca=*')
  pg.wait_for_selector('[data-a=escolher]')
  assert pg.evaluate('new URLSearchParams(location.search).getAll("peca")')==ids
  pg.locator('[data-a=escolher]').first.click()
  assert 'selecionadas na Gestão' in pg.inner_text('#fi-picker-lista')
  pg.locator('[data-picker=produto]').first.click()
  pg.locator('[data-picker=foto]').first.click()
  assert pg.locator('.fi-roupa img').count() or pg.locator('.fi-editor img').count()
  assert not st['ig']['fotoia']['itens'], 'Entrar não pode iniciar geração paga'
  assert not errors,errors
  c.close()
 b.close()
print('PASS menu permanente, entrada IA com seleção, escolha de referência e nenhuma geração; 4 viewports, texto130%.')
