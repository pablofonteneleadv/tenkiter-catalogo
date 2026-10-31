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
   pg.wait_for_function("document.querySelectorAll('[data-preparo]').length===2")
   for _ in range(50):
    if len(held)==2:break
    pg.wait_for_timeout(100)
   assert len(held)==2,'Segundo original aguardou a conclusão do primeiro'
   assert not pg.locator('#tk-video-preparo').count(),'Lote abriu modal bloqueante'
   assert pg.locator('[data-a=enviar]').is_disabled()
   assert pg.locator('[data-preparo] button:visible').first.evaluate('(e)=>e.getBoundingClientRect().height>=48&&e.getBoundingClientRect().width>=48')
   assert pg.locator('[data-lm=x]').count()==3
   assert all(r.request.post_data_buffer==(root/(ident+'.mp4')).read_bytes() for ident,r in held)
   # Um novo seletor e a navegação continuam utilizáveis durante os dois uploads.
   pg.locator('#po-leg').fill('Legenda preservada durante o preparo')
   pg.locator('#po-fechar').click();pg.click('#btn-abrir-postagens');pg.wait_for_timeout(250)
   assert len(jobs)==2 and pg.locator('#po-leg').input_value()=='Legenda preservada durante o preparo'
   for ident,r in held:r.fulfill(json={'ok':True,'id':ident,'estado':'fila'})
   held.clear();pg.wait_for_function("[...document.querySelectorAll('[data-progresso]')].every(e=>e.textContent.includes('Original recebido'))")
   pg.locator('[data-preparo]').first.scroll_into_view_if_needed()
   pg.screenshot(path=str(OUT/f'videos-lote-andamento-{width}.png'))
   # Recarregar retoma por ID, sem escolher arquivos ou reenviar os originais.
   pg.wait_for_timeout(500);abrir();assert pg.locator('[data-preparo]').count()==2
   assert len(jobs)==2
   if width==320:pg.evaluate("document.documentElement.style.fontSize='130%'");pg.set_viewport_size({'width':320,'height':470})
   fail.add('primeiro');ready.add('segundo')
   pg.wait_for_function("document.querySelectorAll('[data-preparo]').length===1",timeout=15000)
   assert 'primeiro.mp4' in pg.locator('[data-preparo]').inner_text()
   assert 'segundo-parte-01' in pg.inner_text('#po-corpo')
   assert pg.locator('[data-a=enviar]').is_disabled()
   assert len(jobs)==2,'Falha de consulta provocou reupload'
   # Finalização não rouba o foco nem apaga o texto sendo editado.
   pg.locator('#po-leg').fill('Editando enquanto termina');pg.locator('#po-leg').focus()
   fail.clear();ready.add('primeiro')
   pg.wait_for_function("document.querySelectorAll('[data-preparo]').length===0",timeout=15000)
   assert pg.locator('#po-leg').input_value()=='Editando enquanto termina'
   assert pg.locator('#po-leg').evaluate('(e)=>e===document.activeElement')
   names=pg.locator('.po-escolhida small').all_text_contents()
   assert names==['primeiro-parte-01-de-3.mp4','primeiro-parte-02-de-3.mp4','primeiro-parte-03-de-3.mp4','segundo-parte-01-de-2.mp4','segundo-parte-02-de-2.mp4','foto.png'],names
   assert pg.locator('[data-a=enviar]').is_enabled()
   pg.locator('[data-lm=x]').first.scroll_into_view_if_needed();assert pg.locator('[data-lm=x]').first.evaluate('(e)=>e.getBoundingClientRect().width>=44&&e.getBoundingClientRect().height>=44');pg.screenshot(path=str(OUT/f'videos-lote-pronto-{width}.png'))
   pg.locator('.po-escolhida summary').first.click();assert pg.locator('.po-escolhida video').first.is_visible();pg.locator('.po-escolhida summary').first.focus();pg.keyboard.press('Enter');assert pg.locator('.po-escolhida video').first.is_hidden()
   pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
   violations=pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}")
   assert not violations,violations
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert len(jobs)==2 and not [x for x in st['ig']['post_chamadas'] if x['path']=='/post']
   assert not errors,errors
   if width==390:
    for destino in ['instagram','whatsapp2','grupo']:
     botao=pg.locator('[data-destino='+destino+']')
     if botao.count() and botao.get_attribute('aria-pressed')=='true':botao.click()
    botao=pg.locator('[data-destino=whatsapp]')
    if botao.get_attribute('aria-pressed')!='true':botao.click()
    pg.locator('[data-a=enviar]').click();pg.wait_for_timeout(2000)
    calls=[x for x in st['ig']['post_chamadas'] if x['path']=='/post'];assert len(calls)==1,calls
    refs=[x['serie'] for x in calls[0]['corpo']['posts'] if x.get('serie')]
    assert [(r['preparo'],r['ordem']) for r in refs]==[('primeiro',1),('primeiro',2),('primeiro',3),('segundo',1),('segundo',2)],refs
   print('OK',width,'uploads paralelos, retomada automática, ordem, foco e confirmação preservados')
   ctx.close()
  browser.close()
