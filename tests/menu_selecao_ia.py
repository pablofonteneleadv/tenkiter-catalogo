"""Entrada do lote da Gestão em Fotos IA; serviços simulados, sem gerar imagens."""
from fotoia_jornadas import ambiente, BASE, OUT
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c,st,pg,errors=ambiente(b,w,h)
  pg.evaluate('async()=>{const e=await TKFotoIAServico.recuperar();const f=TKFotoIAPlano.novaFoto();f.titulo="Lote anterior";f.job=17;f.estado="enviada";e.fotos.push(f);await TKFotoIAServico.guardar(e)}')
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
  pg.wait_for_url('**/fotos-ia.html*')
  pg.wait_for_selector('[data-a=escolher]')
  assert pg.locator('.fi-editor img').count(), 'A capa recebida deve estar no preparo, sem nova busca'
  assert pg.get_by_text('Lote anterior',exact=False).count(), 'Lote antigo deve permanecer'
  assert pg.locator('.fi-plano-item').count()==3
  pg.reload();pg.wait_for_selector('[data-a=escolher]');assert pg.locator('.fi-plano-item').count()==3, 'Recarregar não pode importar de novo'
  pg.screenshot(path=str(OUT/f'ia-preparada-{w}.png'),full_page=True)
  assert pg.evaluate('async()=>{const e=await TKFotoIAServico.recuperar();return e.fotos.slice(0,2).flatMap(f=>f.pessoas.flatMap(p=>Object.values(p.roupa).map(r=>r.produto)))}')==ids
  pg.locator('[data-a=escolher]').first.click()
  pg.locator('[data-picker=produto]').first.click()
  pg.locator('[data-picker=foto]').first.click()
  assert pg.locator('.fi-roupa img').count() or pg.locator('.fi-editor img').count()
  assert not st['ig']['fotoia']['itens'], 'Entrar não pode iniciar geração paga'
  assert not errors,errors
  c.close()
 b.close()
print('PASS menu permanente, entrada IA com seleção, escolha de referência e nenhuma geração; 4 viewports, texto130%.')
