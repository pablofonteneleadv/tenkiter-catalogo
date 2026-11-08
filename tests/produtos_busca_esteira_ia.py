"""Buscas Esteira/IA: catálogo inicial, ordem de fotos, facetas e escolha da galeria. Rede simulada."""
import os,sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
sys.path.insert(0,str(Path(__file__).parent));import fotoia_jornadas as ia
p=Path(__file__).with_name('esteira_fotos_ui.py');ns={'__file__':str(p),'__name__':'base'};exec(compile(p.read_text().split('\nwith sync_playwright() as p:')[0],str(p),'exec'),ns)
BASE=os.environ.get('TK_BASE',ns['BASE']);OUT=Path(os.getenv('TK_EVID','tests/saida/esteira-buscas'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block');st=ns['instalar'](c);ns['fotos_srv'](c,st)
  c.route('**/catalogo/fotos-novas',lambda r:r.fulfill(json={'ok':True,'fotosNovas':{'1002':'2026-11-04T00:00:00Z'}}));pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'esteira.html');pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1');pg.wait_for_selector('.peca');pg.click('[data-aba=fotos]');pg.wait_for_selector('text=Pedir fotos de um produto');pg.click('text=Pedir fotos de um produto');pg.wait_for_selector('.busca-res [data-escolher]')
  # A lista inicial aparece antes da revalidação das fotos; aguarda a ordem final, sem relaxar o resultado.
  expect(pg.locator('.busca-res [data-escolher]').first).to_have_attribute('data-escolher','1002')
  pg.fill('#pf-busca','Verde');pg.wait_for_timeout(350);pg.wait_for_selector('[data-escolher="1003"]');assert pg.locator('.busca-res [data-escolher]').count()==1
  pg.fill('#pf-busca','');pg.wait_for_timeout(350);pg.wait_for_selector('[data-escolher="1002"]');pg.locator('.busca-cat summary').click();pg.locator('.busca-cat details select[aria-label="Tamanho"]').select_option('G');assert pg.locator('.busca-res [data-escolher="1003"]').count()==0
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1');pg.screenshot(path=str(OUT/f'esteira-filtros-{w}.png'));pg.keyboard.press('Escape');assert not errors,errors;c.close()
  c,st,pg,errors=ia.ambiente(b,w,h);pg.locator('[data-a=escolher]').first.click();pg.click('[data-papel-filtro=cima]');pg.fill('#fi-busca','TK-0004');assert pg.locator('[data-picker=produto]').count()==1
  pg.click('[data-papel-filtro=baixo]');assert pg.locator('[data-picker=produto]').count()==0
  pg.fill('#fi-busca','TK-0005');assert pg.locator('[data-picker=produto]').count()==1
  pg.click('[data-papel-filtro=look]');assert pg.locator('[data-picker=produto]').count()==0
  pg.fill('#fi-busca','TK-0003');assert pg.locator('[data-picker=produto]').count()==1
  pg.fill('#fi-busca','');pg.locator('#fi-filtros-extra summary').click();ia.alvos(pg);pg.screenshot(path=str(OUT/f'ia-filtros-{w}.png'));assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  pg.fill('#fi-busca','nenhum-produto-deste-teste');pg.locator('#fi-filtros-extra select').last.focus();pg.keyboard.press('Tab');assert pg.locator('#fi-picker-fechar').evaluate('e=>e===document.activeElement');pg.fill('#fi-busca','TK-0003');pg.click('[data-picker=produto]');pg.wait_for_selector('[data-picker=foto]');pg.locator('[data-picker=foto]').first.click();pg.wait_for_selector('#fi-picker',state='hidden');assert not errors,errors;c.close()
 b.close()
print('PASS 4 viewports: catálogo inicial, foto recente primeiro, cor e tamanho; IA Cima/Baixo/Look estritos e galeria preservada.')
