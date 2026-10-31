"""Perfil comum: trecho explícito, cancelamento preserva foto e destinos usam mesma mídia."""
import sys,os,json,subprocess,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL,PNG
from playwright.sync_api import sync_playwright
OUT=Path(__file__).parent/'saida'/'reparos';OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp)
 for seconds,name in [(46,'longo'),(20,'trecho')]:subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=orange:s=160x240:r=24','-t',str(seconds),'-c:v','libx264','-threads','2','-y',str(root/(name+'.mp4'))],check=True)
 (root/'foto.png').write_bytes(PNG)
 with sync_playwright() as p:
  b=p.chromium.launch(args=['--no-sandbox'])
  for width,height in [(390,844),(412,915),(1440,900),(320,700)]:
   c=b.new_context(viewport={'width':width,'height':height});c.add_init_script(SESSION);st=install(c,perms=PERMS_ALL,versao='7.40.37');g=st['ig'];g['regras']=True;st['midia']['modo']='ok';jobs=[]
   def preparation(route):
    req=route.request
    if req.method=='POST':jobs.append(req.url);route.fulfill(json={'ok':True,'id':'simulado','estado':'fila'})
    elif 'arquivo=1' in req.url:route.fulfill(body=(root/'trecho.mp4').read_bytes(),content_type='video/mp4')
    else:route.fulfill(json={'ok':True,'id':'simulado','estado':'pronto'})
   c.route('**/post/video-preparar*',preparation)
   pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
   pg.goto(os.environ.get('TK_BASE','http://localhost:8773/')+'admin.html');pg.wait_for_timeout(1800);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-postagens');pg.wait_for_timeout(500);pg.get_by_role('button',name='✍️ Livre',exact=True).click()
   assert '3 a 30 s' in pg.locator('label[for=po-livre-arq]').inner_text()
   pg.set_input_files('#po-livre-arq',[str(root/'longo.mp4'),str(root/'foto.png')]);pg.wait_for_selector('#tk-video-preparo');pg.keyboard.press('Escape');pg.wait_for_timeout(700)
   assert pg.locator('[data-lm=x]').count()==1,'Cancelar vídeo descartou a foto válida';assert not jobs
   pg.set_input_files('#po-livre-arq',str(root/'longo.mp4'));pg.wait_for_selector('#tk-video-preparo')
   pg.locator('#tk-video-preparo input').nth(0).fill('5');pg.locator('#tk-video-preparo input').nth(1).fill('20')
   pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
   assert not pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#tk-video-preparo'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}")
   pg.screenshot(path=str(OUT/f'preparo-trecho-{width}.png'))
   pg.get_by_role('button',name='Preparar este trecho',exact=True).click();pg.get_by_role('button',name='Usar este vídeo',exact=True).wait_for(timeout=10000);assert '20,0 s' in pg.locator('#tk-video-preparo').inner_text();pg.get_by_role('button',name='Usar este vídeo',exact=True).click();pg.wait_for_selector('#tk-video-preparo',state='detached',timeout=10000);pg.wait_for_timeout(300)
   assert len(jobs)==1 and 'inicio=5' in jobs[0] and 'duracao=20' in jobs[0]
   assert pg.locator('[data-lm=x]').count()==2,'Trecho preparado não entrou na lista'
   for destino in ['whatsapp','instagram','whatsapp2','grupo']:
    button=pg.locator('[data-destino='+destino+']')
    if button.count():button.click();pg.wait_for_timeout(200)
    assert '3 a 30 s' in pg.locator('label[for=po-livre-arq]').inner_text()
    assert pg.locator('[data-lm=x]').count()==2,'Troca de destino apagou mídia'
   assert len(jobs)==1,'Trocar destino reconverteu a mídia'
   assert not [x for x in g['post_chamadas'] if x['path']=='/post'],'Preparação publicou sem confirmação'
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
   print('OK',width,'trecho explícito, cancelamento, foto preservada, regra comum, uma conversão e nenhum envio')
   c.close()
  b.close()
