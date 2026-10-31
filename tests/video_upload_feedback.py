"""Upload retido, cliques repetidos, confirmação, fila, erro e cancelamento."""
import os,tempfile,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, Error
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
with tempfile.TemporaryDirectory() as tmp:
 file=Path(tmp)/'original.mp4';subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=orange:s=160x240:r=24','-t','58','-c:v','libx264','-threads','2','-y',str(file)],check=True)
 with sync_playwright() as p:
  b=p.chromium.launch(args=['--no-sandbox'])
  for width,height in [(320,700),(390,844),(412,915),(1440,900)]:
   ctx=b.new_context(viewport={'width':width,'height':height});pg=ctx.new_page();held=[];requests=[];state={'phase':'fila'}
   def route(r):
    if r.request.method=='OPTIONS':r.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'X-TK-Whats,X-TK-Sessao,Content-Type'});return
    if r.request.method=='POST':requests.append(r.request);held.append(r);return
    if state.get('erro'):r.fulfill(status=503,json={'ok':False,'erro':'Consulta indisponível. Tente novamente.'},headers={'Access-Control-Allow-Origin':'*'});return
    r.fulfill(json={'ok':True,'id':'upload-test','estado':state['phase'],'partes':[]},headers={'Access-Control-Allow-Origin':'*'})
   ctx.route('https://video.test/**',route)
   pg.goto(BASE+'404.html');pg.add_script_tag(url=BASE+'video-validation.js');pg.set_content('<input id=file type=file>');pg.set_input_files('#file',str(file))
   pg.evaluate("()=>{window.preparacao=TKVideoPreparation.preparar(document.querySelector('#file').files[0],{perfil:'postagens',base:'https://video.test',conta:'teste',headers:{'X-TK-Whats':'teste','X-TK-Sessao':'simulado'}}).catch(e=>window.erro=e.message)}")
   go=pg.get_by_role('button',name='Preparar todas as partes',exact=True);go.click();pg.wait_for_function("document.querySelector('#tk-video-preparo button').disabled")
   pg.wait_for_timeout(300);assert len(requests)==1,len(requests);assert requests[0].post_data_buffer==file.read_bytes()
   assert pg.locator('#tk-video-preparo button').first.is_disabled();assert pg.locator('#tk-video-preparo button').first.inner_text() in ['Enviando vídeo…','Confirmando recebimento…']
   pg.evaluate("()=>{const b=document.querySelector('#tk-video-preparo button');b.onclick();b.onclick();b.click()}");pg.wait_for_timeout(150);assert len(requests)==1,'Toques repetidos duplicaram upload'
   assert pg.locator('#tk-video-preparo progress').is_visible()
   assert pg.locator('#tk-video-preparo section').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}')
   out=Path(__file__).parent/'saida'/'reparos';out.mkdir(parents=True,exist_ok=True);pg.screenshot(path=str(out/f'upload-aguardando-{width}.png'))
   held.pop().fulfill(json={'ok':True,'id':'upload-test','estado':'fila'},headers={'Access-Control-Allow-Origin':'*'})
   pg.get_by_role('button',name='Aguardando o processador…',exact=True).wait_for();assert 'Original recebido' in pg.locator('#tk-video-preparo [role=status]').inner_text();assert pg.get_by_role('button',name='Aguardando o processador…',exact=True).is_disabled()
   assert pg.locator('#tk-video-preparo progress').is_hidden()
   state['erro']=True;pg.get_by_role('button',name='Consultar andamento',exact=True).wait_for(timeout=10000);assert len(requests)==1
   state['erro']=False;pg.get_by_role('button',name='Consultar andamento',exact=True).click();pg.get_by_role('button',name='Aguardando o processador…',exact=True).wait_for();assert len(requests)==1,'Consultar não deve reenviar o original'
   pg.get_by_role('button',name='Fechar e recuperar depois',exact=True).click();pg.wait_for_selector('#tk-video-preparo',state='detached');assert pg.evaluate('window.erro.includes("original foi recebido")')
   # Erro de rede/servidor deixa uma ação clara, sem tornar a preparação automática.
   pg.evaluate("()=>{sessionStorage.clear();window.preparacao=TKVideoPreparation.preparar(document.querySelector('#file').files[0],{perfil:'postagens',base:'https://video.test',conta:'teste',headers:{}}).catch(e=>window.erro=e.message)}")
   pg.get_by_role('button',name='Preparar todas as partes',exact=True).click();pg.wait_for_timeout(200);held.pop().fulfill(status=503,json={'ok':False,'erro':'Servidor indisponível. Tente novamente.'},headers={'Access-Control-Allow-Origin':'*'})
   pg.get_by_role('button',name='Tentar novamente',exact=True).wait_for();assert pg.get_by_role('button',name='Tentar novamente',exact=True).is_enabled();assert 'Servidor indisponível' in pg.locator('#tk-video-preparo').inner_text()
   pg.get_by_role('button',name='Tentar novamente',exact=True).click();pg.wait_for_timeout(200);assert len(requests)==3;pg.get_by_role('button',name='Cancelar envio',exact=True).click();pg.wait_for_selector('#tk-video-preparo',state='detached');assert 'interrompido' in pg.evaluate('window.erro')
   if held:
    try:held.pop().abort()
    except Error:pass
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');ctx.close();print('OK',width,'upload único, bytes preservados, bloqueio, fila, erro e cancelamento')
  b.close()
