"""Busca do atendimento: filtros facetados, tamanho exato e seleção preservada."""
import os
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
from mock_msg import novo_estado
from playwright.sync_api import sync_playwright
OUT=Path(os.environ.get('TK_EVIDENCE_DIR',str(Path(__file__).parent/'saida')))/'produtos-filtros';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
  ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=True,service_workers='block');ctx.add_init_script(SESSION)
  st=install(ctx,perms=PERMS_ALL,versao='3.7');st['ig']['msg']=novo_estado()
  for i,pr in enumerate(st['produtos']):pr.update({'Nome':'Vestido longo '+str(i),'Categoria':'Vestido','Genero':'Feminino Adulto','Tamanhos':'P' if i%2 else 'GG','Estoque':2,'Status':'Ativo','Cores':'Preto' if i%2 else 'Azul'})
  st['produtos'][0]['Tamanhos']='M, Etiqueta: M, Veste: 38, Veste: 40'
  pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.goto(os.environ.get('TK_BASE','http://localhost:8765/')+'admin.html?app=mensagens');pg.wait_for_selector('.ms-conv')
  pg.locator('.ms-conv').first.click();pg.wait_for_selector('#ms-texto');pg.locator('[data-ms=gaveta-produtos]').click();pg.wait_for_selector('.ms-prod')
  pg.locator('#ms-prod-filtros summary').click();pg.locator('[data-prod-filtro=tamanho][data-valor="38"]').click();assert pg.locator('.ms-prod').count()==1;assert not pg.locator('[data-prod-filtro=tamanho][data-valor=M]').count();pg.locator('[data-prod-filtro=tamanho][data-valor="38"]').click();pg.locator('[data-prod-filtro=tamanho][data-valor=P]').click()
  assert pg.locator('.ms-prod').count()==12,(w,pg.locator('.ms-prod').count(),pg.locator('#ms-prod-opcoes').inner_text(),errs)
  assert pg.locator('.ms-prod-det').evaluate_all('(es)=>es.every(e=>e.textContent.startsWith("P"))')
  pg.locator('.ms-prod-marca').first.click();assert pg.locator('#ms-prod-selbar').is_visible()
  pg.locator('#ms-prod-busca').fill('vestido');assert pg.locator('#ms-prod-filtros').get_attribute('open') is not None
  pg.locator('[data-prod-filtro=cor][data-valor=Preto]').click();assert pg.locator('.ms-prod').count()==12,(w,pg.locator('.ms-prod').count(),pg.locator('#ms-prod-opcoes').inner_text(),errs)
  pg.locator('#ms-prod-filtros summary').click();pg.locator('#ms-prod-refinos').get_by_role('button',name='Limpar filtros',exact=True).click();assert pg.locator('.ms-prod').count()==24
  pg.locator('#ms-prod-busca').fill('inexistente');assert pg.locator('.ms-prod').count()==0;assert 'Nenhum produto' in pg.locator('#ms-prod-lista').inner_text()
  pg.locator('#ms-prod-busca').fill('vestido');pg.locator('#ms-prod-filtros summary').click()
  pg.evaluate('document.documentElement.style.fontSize="130%"')
  if w<600:pg.set_viewport_size({'width':w,'height':470})
  pg.screenshot(path=str(OUT/f'produtos-{w}.png'))
  assert pg.locator('body').evaluate('(b)=>b.scrollWidth<=innerWidth+1')
  assert pg.locator('#ms-prod-selbar').is_visible()
  assert not errs,errs
  ctx.close()
 b.close()
print('Produtos: tamanho exato, cor, menu ao digitar, limpar, vazio e seleção preservada; 4 viewports/130%/altura reduzida.')
