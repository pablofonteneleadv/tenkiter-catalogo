"""Lote de vídeos em segundo plano: concorrência, retomada, ordem e nenhuma publicação implícita."""
import os,sys,tempfile,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL,PNG
from playwright.sync_api import sync_playwright
OUT=Path(__file__).parent/'saida'/'reparos';OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp)
 for seconds,name in [(75,'primeiro'),(58,'segundo'),(30,'parte30'),(28,'parte28'),(15,'parte15')]:
  subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=orange:s=160x240:r=24','-t',str(seconds),'-c:v','libx264','-threads','2','-y',str(root/(name+'.mp4'))],check=True)
 (root/'foto.png').write_bytes(PNG)
 with sync_playwright() as p:
  browser=p.chromium.launch(args=['--no-sandbox'])
  for width,height in [(390,844),(412,915),(1440,900),(320,700)]:
   ctx=browser.new_context(viewport={'width':width,'height':height});ctx.add_init_script(SESSION);st=install(ctx,perms=PERMS_ALL,versao='7.40.41');st['ig']['regras']=True;st['midia']['modo']='ok'
   jobs=[];held=[];ready=set();fail=set();errors=[]
   def preparation(route):
    req=route.request;url=req.url
    if req.method=='POST' and 'excluir=1' in url:route.fulfill(json={'ok':True});return
    if req.method=='POST':
     ident='primeiro' if 'duracao=75' in url else 'segundo';jobs.append(ident);held.append((ident,route));return
    ident='primeiro' if 'id=primeiro' in url else 'segundo'
    if ident in fail:route.fulfill(status=503,json={'ok':False,'erro':'Falha temporária'});return
    if 'arquivo=1' in url:
     name='parte15' if ident=='primeiro' and 'parte=3' in url else 'parte28' if ident=='segundo' and 'parte=2' in url else 'parte30'
     route.fulfill(body=(root/(name+'.mp4')).read_bytes(),content_type='video/mp4');return
    ds=[30,30,15] if ident=='primeiro' else [30,28]
    route.fulfill(json={'ok':True,'id':ident,'estado':'pronto' if ident in ready else 'fila','partes':[{'ordem':i+1,'total':len(ds),'inicio':sum(ds[:i]),'duracao':d} for i,d in enumerate(ds)] if ident in ready else []})
   ctx.route('**/post/video-preparar*',preparation)
   pg=ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)))
   def abrir():
    pg.goto(os.environ.get('TK_BASE','http://localhost:8773/')+'admin.html');pg.wait_for_timeout(1500);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-postagens');pg.wait_for_timeout(300)
   abrir();pg.get_by_role('button',name='✍️ Livre',exact=True).click()
   pg.set_input_files('#po-livre-arq',[str(root/'primeiro.mp4'),str(root/'segundo.mp4'),str(root/'foto.png')])
   for _ in range(80):
    if len(held)==2:break
    pg.wait_for_timeout(100)
   assert len(held)==2,'Uploads devem continuar fora do compositor'
   assert not pg.locator('[data-preparo]').count(),'Compositor ainda mostra preparos'
   assert pg.locator('[data-lm=x]').count()==1,'Só a foto deve entrar diretamente'
   assert pg.locator('[data-a=enviar]').is_enabled(),'Preparo da biblioteca bloqueou a foto'
   pg.locator('#po-leg').fill('Legenda preservada na biblioteca')
   pg.get_by_role('tab',name='Vídeos',exact=True).click()
   assert pg.locator('.po-video-item').count()==2
   pg.screenshot(path=str(OUT/f'videos-debug-{width}.png'))
   assert pg.locator('.po-video-item progress').count()==2
   pg.screenshot(path=str(OUT/f'videos-biblioteca-enviando-{width}.png'))
   for ident,r in held:r.fulfill(json={'ok':True,'id':ident,'estado':'fila'})
   held.clear()
   pg.wait_for_function("[...document.querySelectorAll('[data-vlib-status]')].every(e=>e.textContent.includes('Original recebido'))")
   pg.wait_for_timeout(600);abrir()
   pg.get_by_role('tab',name='Vídeos',exact=True).click()
   assert pg.locator('.po-video-item').count()==2 and len(jobs)==2,'Recarregar perdeu ou reenviou original'
   if width==320:pg.evaluate("document.documentElement.style.fontSize='130%'")
   fail.add('primeiro');ready.add('segundo')
   pg.wait_for_function("[...document.querySelectorAll('[data-vlib-status]')].filter(e=>e.textContent.startsWith('Pronto')).length===1",timeout=15000)
   assert len(jobs)==2,'Falha temporária provocou reupload'
   fail.clear();ready.add('primeiro')
   pg.wait_for_function("[...document.querySelectorAll('[data-vlib-status]')].every(e=>e.textContent.startsWith('Pronto'))",timeout=15000)
   pg.screenshot(path=str(OUT/f'videos-biblioteca-prontos-{width}.png'))
   pg.get_by_role('tab',name='Nova postagem',exact=True).click()
   assert pg.locator('#po-leg').input_value()=='Legenda preservada na biblioteca'
   assert pg.locator('[data-lm=x]').count()==1,'Vídeos foram incluídos sem seleção'
   pg.get_by_role('button',name='Recuperar vídeos',exact=True).click()
   checks=pg.locator('[data-vlib-sel]');assert checks.count()==2
   for cb in checks.all():cb.check()
   pg.screenshot(path=str(OUT/f'videos-recuperar-{width}.png'))
   pg.get_by_role('button',name='Incluir selecionados na postagem',exact=True).click()
   pg.wait_for_function("document.querySelectorAll('[data-lm=x]').length===6")
   names=pg.locator('.po-escolhida small').all_text_contents()
   assert names==['foto.png','primeiro-parte-01-de-3.mp4','primeiro-parte-02-de-3.mp4','primeiro-parte-03-de-3.mp4','segundo-parte-01-de-2.mp4','segundo-parte-02-de-2.mp4'],names
   # Duplicar recuperação não duplica as partes no rascunho.
   pg.get_by_role('button',name='Recuperar vídeos',exact=True).click()
   pg.locator('[data-vlib-sel]').first.check()
   pg.get_by_role('button',name='Incluir selecionados na postagem',exact=True).click()
   pg.wait_for_timeout(300);assert pg.locator('[data-lm=x]').count()==6
   pg.get_by_role('tab',name='Vídeos',exact=True).click()
   pg.once('dialog',lambda d:d.accept())
   pg.locator('[data-vlib-excluir]').first.click()
   pg.wait_for_function("document.querySelectorAll('.po-video-item').length===1")
   abrir();pg.get_by_role('tab',name='Nova postagem',exact=True).click()
   assert pg.locator('[data-lm=x]').count()==6,'Excluir biblioteca apagou a cópia do rascunho'
   pg.locator('.po-escolhida summary').first.click()
   assert pg.locator('.po-escolhida video').first.is_visible()
   pg.locator('.po-escolhida summary').first.focus();pg.keyboard.press('Enter')
   assert pg.locator('.po-escolhida video').first.is_hidden()
   pg.screenshot(path=str(OUT/f'videos-incluidos-{width}.png'))
   pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
   violations=pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}")
   assert not violations,violations
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert len(jobs)==2 and not [x for x in st['ig']['post_chamadas'] if x['path']=='/post']
   assert not errors,errors
   print('OK',width,'biblioteca, retomada, seleção de todas as partes e exclusão sem apagar rascunho')
   ctx.close()
  browser.close()
