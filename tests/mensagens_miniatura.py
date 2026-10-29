"""Miniatura visível no composer e no histórico; serviços inteiramente simulados."""
import os,sys,subprocess
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
from mock_msg import novo_estado
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8767/');OLD=os.environ.get('TK_BASELINE')=='1'
OUT=Path(os.environ.get('TK_EVID','/workspace/artifacts/previa-ui'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for width,height in [(320,700),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':width,'height':height},is_mobile=width<600,has_touch=True,service_workers='block');c.add_init_script(SESSION)
  st=install(c,perms=PERMS_ALL,versao='3.7');s=st['ig']['msg']=novo_estado()
  photo=Path(os.environ.get('TK_PREVIA_FOTO',str(Path(__file__).parent.parent/'logo-mark.png')))
  for pattern in ['**/res.cloudinary.com/**','**/lh3.googleusercontent.com/**']:
   c.route(pattern,lambda r:r.fulfill(body=photo.read_bytes(),content_type='image/jpeg' if photo.suffix=='.jpg' else 'image/png'))
  if OLD:
   code=subprocess.check_output(['git','show','3973fe2cf0c4568b85c1225edac907f3b479ca1f:admin-mensagens.js'],text=True)
   c.route('**/admin-mensagens.js*',lambda r,request,code=code:r.fulfill(body=code,content_type='application/javascript'))
  pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.locator('#ms-lista .ms-conv[data-id="1"]').click();pg.wait_for_selector('#ms-texto')
  pg.locator('[data-ms=gaveta-produtos]').click();pg.wait_for_selector('#ms-prod-lista .ms-prod');pg.locator('#ms-prod-lista [data-ms=prod-usar]').first.click();pg.locator('#ms-previa-chk').check()
  if OLD:
   assert pg.locator('#ms-link-mini img').count()==0;pg.screenshot(path=str(OUT/f'antes-{width}.png'));c.close();continue
  pg.wait_for_selector('#ms-link-mini img');pg.wait_for_function("document.querySelector('#ms-link-mini img').naturalWidth>0")
  draft=pg.input_value('#ms-texto');img=pg.locator('#ms-link-mini img');assert img.bounding_box()['width']==48
  assert img.get_attribute('alt').startswith('Miniatura: ')
  pg.locator('#ms-previa-chk').uncheck();assert pg.locator('#ms-link-mini').is_hidden();pg.locator('#ms-previa-chk').check();assert pg.input_value('#ms-texto')==draft
  pg.evaluate('document.documentElement.style.fontSize="130%"')
  if width<600:pg.set_viewport_size({'width':width,'height':470})
  for selector in ['#ms-enviar','#ms-anexar','#ms-previa label']:
   r=pg.locator(selector).bounding_box();assert r['height']>=44 and r['y']>=0 and r['y']+r['height']<=pg.viewport_size['height'],(width,selector,r)
  r=pg.locator('#ms-link-mini img').bounding_box();assert r['x']>=0 and r['x']+r['width']<=width and r['y']>=0 and r['y']+r['height']<=pg.viewport_size['height']
  assert pg.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth+1')
  pg.screenshot(path=str(OUT/f'composer-{width}.png'));pg.locator('#ms-enviar').click();pg.wait_for_selector('#ms-fio .ms-link-cartao img');assert s['envios'][-1]['previaImagem'].startswith('https://')
  count=len(s['envios']);
  if width<600:pg.set_viewport_size({'width':width,'height':height})
  pg.locator('#ms-fio .ms-link-cartao img').last.scroll_into_view_if_needed();pg.screenshot(path=str(OUT/f'enviada-{width}.png'))
  if width<600:pg.set_viewport_size({'width':width,'height':height})
  pg.reload();pg.wait_for_selector('#ms-lista .ms-conv');pg.locator('#ms-lista .ms-conv[data-id="1"]').click();pg.wait_for_selector('#ms-fio .ms-link-cartao img');assert len(s['envios'])==count
  assert pg.locator('#ms-fio .ms-link-cartao').last.get_attribute('href') in s['envios'][-1]['texto']
  # URL externa e domínio parecido não ganham uma miniatura da loja.
  for url in ['https://tenkitermodas.com.br.evil.invalid/p/TK-0001','https://externo.invalid/produto','https://tenkitermodas.com.br/p/%ZZ']:
   pg.fill('#ms-texto',url);pg.wait_for_timeout(80);assert pg.locator('#ms-link-mini').is_hidden()
  assert not errors,errors;c.close();print('Aprovado',width,flush=True)
 b.close()
print('Baseline: opção sem imagem reproduzida.' if OLD else 'Miniatura antes/depois, reabertura sem reenvio, texto130%, teclado e limites de URL:4 viewports aprovadas.')
