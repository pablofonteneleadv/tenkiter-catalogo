"""Orçamento/contrato de um clipe de 90 s; não substitui câmera física."""
import os,sys,tempfile,subprocess,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION,PERMS_ALL
from playwright.sync_api import sync_playwright
with tempfile.TemporaryDirectory() as tmp:
 f=Path(tmp)/'camera-90s.mp4'
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=30','-f','lavfi','-i','sine=frequency=880:sample_rate=44100','-t','90','-c:v','libx264','-preset','ultrafast','-threads','2','-b:v','1000000','-maxrate','1000000','-bufsize','2000000','-c:a','aac','-b:a','64000','-movflags','+faststart','-y',str(f)],check=True)
 meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(f)]));assert abs(float(meta['format']['duration'])-90)<.1;assert f.stat().st_size<14_000_000
 with sync_playwright() as p:
  b=p.chromium.launch(args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844});ctx.add_init_script(SESSION);install(ctx,perms=PERMS_ALL,versao='7.40.39');pg=ctx.new_page();pg.goto(os.environ.get('TK_BASE','http://localhost:8773/')+'404.html');pg.add_script_tag(url=os.environ.get('TK_BASE','http://localhost:8773/')+'video-validation.js')
  pg.set_content('<input type=file id=video>');pg.set_input_files('#video',str(f));result=pg.evaluate("async()=>{const f=document.querySelector('#video').files[0];const v=await TKVideoValidation.validar(f,{maxBytes:15000000});const r=await TKVideoPreparation.preparar(f,{perfil:'mensageiro'});return {ok:v.ok,duration:v.metadata.duration,width:v.metadata.width,height:v.metadata.height,same:r===f}}")
  assert result['ok'] and result['same'] and abs(result['duration']-90)<.1 and result['width']==1280,result
  assert not pg.locator('#tk-video-preparo').count(),'Clipes compatíveis não devem depender da fila de preparação';b.close()
 print('OK: 90 s completos, MP4/H264/AAC 720p,',f.stat().st_size,'bytes, Mensageiro sem corte ou conversão adicional. Câmera física não testada.')
