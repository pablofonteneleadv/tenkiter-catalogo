"""Três originais/seis partes, fila por mídia e alternância pessoal para a visão por canal."""
import sys,os,tempfile,subprocess,shutil
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8773/');OUT=Path(__file__).parent/'saida'/'reparos';OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as temp:
 root=Path(temp);v=root/'video1.mp4'
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=orange:s=160x240:r=24','-t','4','-c:v','libx264','-threads','2','-y',str(v)],check=True)
 for n in [2,3]:shutil.copyfile(v,root/f'video{n}.mp4')
 with sync_playwright() as p:
  browser=p.chromium.launch(args=['--no-sandbox'])
  for width,height in [(390,844),(412,915),(1440,900),(320,700)]:
   ctx=browser.new_context(viewport={'width':width,'height':height});ctx.add_init_script(SESSION);st=install(ctx,perms=PERMS_ALL,versao='7.40.42');g=st['ig'];g['regras']=True;st['midia']['modo']='ok';ctx.on('dialog',lambda d:d.accept())
   rows=[];ident=1
   for original in range(3):
    for canal in ['instagram','whatsapp','whatsapp2','grupo']:
     for parte in [1,2]:
      rows.append({'id':ident,'origemMidia':'original-'+str(original),'serie':{'id':f'serie-{original}-{canal}','ordem':parte,'total':2},'tipo':'story','modo':'auto','canal':canal,'midias':[{'url':f'https://midia.test/video-{original}-{parte}.mp4','tipo':'video'}],'status':'manual_pendente' if original==0 and canal=='instagram' else 'agendado','agendadoEm':f'2030-12-{10+original}T12:30:00Z','legenda':'Vídeo '+str(original),'link':'https://tenkitermodas.com.br/','criadoPor':'Equipe','criadoEm':'2026-10-31T13:00:00Z'});ident+=1
   for canal in ['instagram','whatsapp']:
    rows.append({'id':ident,'origemMidia':'foto-unica','tipo':'story','modo':'auto','canal':canal,'midias':[{'url':'https://res.cloudinary.com/demo/image/upload/foto.jpg','tipo':'imagem'}],'status':'agendado','agendadoEm':'2030-12-14T12:30:00Z','legenda':'Foto'});ident+=1
   g['posts']=rows
   pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
   def abrir():
    pg.goto(BASE+'admin.html');pg.wait_for_timeout(1600);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-postagens');pg.wait_for_timeout(400)
   abrir();pg.get_by_role('button',name='✍️ Livre',exact=True).click()
   pg.evaluate("""()=>{window.TKVideoPreparation={...TKVideoPreparation,prepararEmFundo:async(file,op)=>{const bytes=await file.arrayBuffer();return [1,2].map(ordem=>{const f=new File([bytes],file.name+'-parte-'+ordem+'.mp4',{type:'video/mp4'});f.tkParte={preparo:file.name,ordem,total:2};return f;});}};}""")
   pg.set_input_files('#po-livre-arq',[str(root/f'video{n}.mp4') for n in [1,2,3]])
   pg.wait_for_function("document.querySelectorAll('[data-lm=x]').length===6&&!document.querySelector('[data-preparo]')")
   rule=pg.locator('.po-partes-regra');assert '3 vídeos originais' in rule.inner_text() and '6 partes' in rule.inner_text()
   interval=pg.get_by_role('group',name='Intervalo entre mídias originais');assert '3 vídeos originais' in interval.inner_text();assert '6 Stories' not in pg.inner_text('#po-corpo')
   pg.locator('[data-gm=custom]').click();pg.locator('#po-gapmin').fill('20');pg.locator('[data-q=agendar]').click();assert '3 mídias originais' in pg.inner_text('#po-corpo')
   pg.screenshot(path=str(OUT/f'originais-intervalo-{width}.png'))
   pg.locator('#po-abas [data-aba=fila]').click();pg.wait_for_timeout(350)
   assert pg.locator('[data-fila-modo=midia]').get_attribute('aria-pressed')=='true'
   assert pg.locator('.po-midia-grupo').count()==4,'As partes/canais devem resultar em 3 vídeos +1 foto'
   assert pg.locator('.po-midia-grupo').first.locator('.po-midia-canal').count()==4
   assert '2 partes' in pg.locator('.po-midia-topo').first.inner_text()
   # Opções manuais e de cada canal continuam vinculadas ao ID correto.
   manual=pg.locator('.po-midia-grupo').first.locator('[data-midia-canal=story]');manual.locator('summary').click();assert manual.locator('[data-a=feito]').count()==2;assert manual.locator('[data-a=copiar-link]').count()==2
   canal=pg.locator('.po-midia-grupo').nth(1).locator('[data-midia-canal=status]');canal.locator('summary').click();canal.get_by_role('button',name='Horário do vídeo',exact=True).click();assert 'Novo horário' in canal.inner_text();assert canal.locator('[data-a=hora-ok]').get_attribute('data-id')=='11'
   pg.locator('[data-fila-modo=canal]').click();assert pg.locator('.po-fg-h').count()==4
   pg.locator('[data-fg=status]').click();assert pg.locator('[data-fg-sec=status] .po-item').count()==7
   pg.locator('[data-fila-modo=midia]').click();assert pg.locator('.po-midia-grupo').count()==4;assert canal.locator('details').get_attribute('open') is not None
   assert not [x for x in g['post_chamadas'] if x['path']=='/post'],'Alternar a fila não publica nem cria cópias'
   pg.locator('.po-midia-grupo').first.scroll_into_view_if_needed();pg.screenshot(path=str(OUT/f'fila-midia-{width}.png'))
   pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
   violations=pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,alvos:v.nodes.map(n=>n.target)}))}");assert not violations,violations
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   pg.locator('[data-fila-modo=canal]').click();abrir();pg.locator('#po-abas [data-aba=fila]').click();assert pg.locator('[data-fila-modo=canal]').get_attribute('aria-pressed')=='true','Preferência da atendente deve sobreviver à recarga'
   pg.locator('[data-fila-modo=midia]').click()
   if width==320:
    pg.set_viewport_size({'width':320,'height':470});pg.evaluate("document.documentElement.style.fontSize='130%'");assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');pg.screenshot(path=str(OUT/'fila-midia-texto130.png'))
   assert not errors,errors;print('OK',width,'3 originais/6 partes, quatro destinos, manual, ações e alternância persistida',flush=True);ctx.close()
  browser.close()
