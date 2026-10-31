"""Clipe: escolha explícita da câmera/galeria, sem envio; aparelhos antigos pedem atualização."""
import os
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright
out=Path(__file__).parent/'saida'/'reparos';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for width,height in [(320,700),(390,844),(412,915),(1440,900)]:
  ctx=b.new_context(viewport={'width':width,'height':height});ctx.add_init_script(SESSION);st=install(ctx,perms=PERMS_ALL,versao='7.40.39');st['ig'].setdefault('msg',mock_msg.novo_estado());pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.goto(os.environ.get('TK_BASE','http://localhost:8773/')+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.click('#ms-abas [data-aba=todos]');pg.click('[data-ms=abrir][data-id="1"]');pg.wait_for_selector('#ms-texto')
  if pg.locator('[data-ms=atender]').count():pg.click('[data-ms=atender]');pg.wait_for_timeout(400)
  pg.click('#ms-anexar');pg.get_by_role('menuitem',name='Gravar vídeo',exact=True).wait_for();assert pg.get_by_role('menuitem',name='Escolher fotos ou vídeos da galeria',exact=True).is_visible()
  assert pg.locator('.ms-menu').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}')
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
  assert not pg.evaluate("async()=>{const r=await axe.run(document.querySelector('.ms-menu'));return r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id)}")
  pg.screenshot(path=str(out/f'clipe-camera-{width}.png'))
  pg.keyboard.press('Escape');assert not pg.locator('.ms-menu').count();assert pg.locator('#ms-anexar').evaluate('e=>e===document.activeElement');pg.click('#ms-anexar')
  with pg.expect_file_chooser() as selected:pg.get_by_role('menuitem',name='Gravar vídeo',exact=True).click()
  assert selected.value.element.get_attribute('capture')=='environment';assert selected.value.element.get_attribute('accept')=='video/*'
  pg.click('#ms-anexar')
  with pg.expect_file_chooser() as selected:pg.get_by_role('menuitem',name='Escolher fotos ou vídeos da galeria',exact=True).click()
  assert selected.value.is_multiple()
  pg.evaluate("window.TKAndroid={versao:()=> '2.4.13',atualizar:()=>window.__update=true}");pg.click('#ms-anexar');pg.get_by_role('menuitem',name='Gravar vídeo',exact=True).click();assert pg.evaluate('window.__update===true')
  assert not st['ig']['msg']['envios'],'Abrir o clipe/câmera não envia';assert not errors,errors;ctx.close();print('OK',width,'clipe, câmera, galeria múltipla, atualização e nenhum envio')
 b.close()
