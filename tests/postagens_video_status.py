"""Perfil comum: partes completas, cancelamento preserva foto e destinos usam as mesmas mídias."""
import sys,os,json,subprocess,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL,PNG
from playwright.sync_api import sync_playwright
OUT=Path(__file__).parent/'saida'/'reparos';OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp)
 for seconds,name in [(75,'longo'),(30,'parte30'),(15,'parte15')]:subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=orange:s=160x240:r=24','-t',str(seconds),'-c:v','libx264','-threads','2','-y',str(root/(name+'.mp4'))],check=True)
 (root/'foto.png').write_bytes(PNG)
 with sync_playwright() as p:
  b=p.chromium.launch(args=['--no-sandbox'])
  for width,height in [(390,844),(412,915),(1440,900),(320,700)]:
   c=b.new_context(viewport={'width':width,'height':height});c.add_init_script(SESSION);st=install(c,perms=PERMS_ALL,versao='7.40.37');g=st['ig'];g['regras']=True;st['midia']['modo']='ok';jobs=[]
   def preparation(route):
    req=route.request
    if req.method=='POST':jobs.append(req.url);route.fulfill(json={'ok':True,'id':'simulado','estado':'fila'})
    elif 'arquivo=1' in req.url:route.fulfill(body=(root/('parte15.mp4' if 'parte=3' in req.url else 'parte30.mp4')).read_bytes(),content_type='video/mp4')
    else:route.fulfill(json={'ok':True,'id':'simulado','estado':'pronto','partes':[{'ordem':i+1,'total':3,'inicio':i*30,'duracao':30 if i<2 else 15} for i in range(3)]})
   c.route('**/post/video-preparar*',preparation)
   pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
   pg.goto(os.environ.get('TK_BASE','http://localhost:8773/')+'admin.html');pg.wait_for_timeout(1800);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-postagens');pg.wait_for_timeout(500);pg.get_by_role('button',name='✍️ Livre',exact=True).click()
   assert 'partes automáticas' in pg.locator('label[for=po-livre-arq]').inner_text()
   pg.set_input_files('#po-livre-arq',[str(root/'longo.mp4'),str(root/'foto.png')]);pg.wait_for_selector('#tk-video-preparo');pg.keyboard.press('Escape');pg.wait_for_timeout(700)
   assert pg.locator('[data-lm=x]').count()==1,'Cancelar vídeo descartou a foto válida';assert not jobs
   if width==320:pg.evaluate('window.TKVideoValidation={...TKVideoValidation,inspecionar:async()=>({ok:false})}')
   pg.set_input_files('#po-livre-arq',str(root/'longo.mp4'));pg.wait_for_selector('#tk-video-preparo')
   assert pg.locator('#tk-video-preparo input:visible').count()==1
   pg.locator('#tk-video-preparo input:visible').fill('30')
   pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
   assert not pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#tk-video-preparo'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}")
   pg.screenshot(path=str(OUT/f'preparo-trecho-{width}.png'))
   pg.get_by_role('button',name='Preparar todas as partes',exact=True).click();pg.get_by_role('button',name='Usar as 3 partes',exact=True).wait_for(timeout=20000)
   assert pg.get_by_role('button',name='Parte 3/3',exact=True).is_visible();pg.get_by_role('button',name='Parte 3/3',exact=True).click()
   pg.get_by_role('button',name='Usar as 3 partes',exact=True).click();pg.wait_for_selector('#tk-video-preparo',state='detached',timeout=10000);pg.wait_for_timeout(300)
   assert len(jobs)==1 and 'inicio=30' in jobs[0] and ('duracao=0' if width==320 else 'duracao=75') in jobs[0] and 'partes=1' in jobs[0]
   assert pg.locator('[data-lm=x]').count()==4,'Todas as partes e a foto devem estar na lista'
   assert 'Parte 1/3' in pg.inner_text('#po-corpo') and 'Parte 3/3' in pg.inner_text('#po-corpo')
   for destino in ['whatsapp','instagram','whatsapp2','grupo']:
    button=pg.locator('[data-destino='+destino+']')
    if button.count():button.click();pg.wait_for_timeout(200)
    assert 'partes automáticas' in pg.locator('label[for=po-livre-arq]').inner_text()
    assert pg.locator('[data-lm=x]').count()==4,'Troca de destino apagou mídia'
   pg.locator('[data-lm=up][data-i="2"]').click();pg.wait_for_timeout(150)
   assert pg.locator('.po-escolhida').filter(has_text='Parte 1/3').count()>=1
   names=pg.locator('.po-escolhida small').all_text_contents();assert [x for x in names if 'parte-' in x]==sorted([x for x in names if 'parte-' in x]),names
   assert len(jobs)==1,'Trocar destino reconverteu a mídia'
   assert not [x for x in g['post_chamadas'] if x['path']=='/post'],'Preparação publicou sem confirmação'
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
   if width==390:
    for dest in ['instagram','whatsapp2','grupo']:
     q=pg.locator('[data-destino='+dest+']')
     if q.count() and q.get_attribute('aria-pressed')=='true':q.click()
    q=pg.locator('[data-destino=whatsapp]')
    if q.get_attribute('aria-pressed')!='true':q.click()
    pg.click('[data-a=enviar]');pg.wait_for_timeout(1800)
    calls=[x for x in g['post_chamadas'] if x['path']=='/post'];assert len(calls)==1,calls
    refs=[x['serie'] for x in calls[0]['corpo']['posts'] if x.get('serie')];assert [x['ordem'] for x in refs]==[1,2,3] and all(x['preparo']=='simulado' for x in refs),refs
   print('OK',width,'partes completas, cancelamento, foto preservada, regra comum, uma conversão e nenhum envio')
   c.close()
  b.close()
