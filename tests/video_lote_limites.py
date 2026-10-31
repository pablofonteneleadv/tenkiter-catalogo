"""Três preparações concorrentes, quarta automática, remoção e retry sem escolher o original."""
import os,tempfile,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, Error
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
with tempfile.TemporaryDirectory() as tmp:
 f=Path(tmp)/'original.mp4';subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=160x240:r=24','-t','35','-c:v','libx264','-threads','2','-y',str(f)],check=True)
 with sync_playwright() as p:
  browser=p.chromium.launch(args=['--no-sandbox']);ctx=browser.new_context();pg=ctx.new_page();held=[];posts=[];fail={'post':False}
  def route(r):
   if r.request.method=='POST':
    posts.append(r.request)
    if fail['post']:fail['post']=False;r.fulfill(status=503,json={'ok':False,'erro':'Servidor temporariamente indisponível'});return
    held.append(r);return
   r.fulfill(json={'ok':True,'id':'limite','estado':'fila','partes':[]})
  ctx.route('**/post/video-preparar*',route)
  pg.goto(BASE+'404.html');pg.add_script_tag(url=BASE+'video-validation.js');pg.set_content('<input id=file type=file>');pg.set_input_files('#file',str(f))
  pg.evaluate("""()=>{window.controles=[];window.estados=[];window.resultados=[];window.pedidos=[];for(let i=0;i<5;i++){const c=new AbortController(),estado={};controles.push(c);estados.push(estado);pedidos.push(TKVideoPreparation.prepararEmFundo(document.querySelector('#file').files[0],{base:location.origin,conta:'teste',headers:{},estado,signal:c.signal,progresso:()=>{},salvar:async()=>{}}).catch(e=>resultados.push(e.name)));}}""")
  for _ in range(60):
   if len(held)==3:break
   pg.wait_for_timeout(100)
  assert len(posts)==3 and len(held)==3,'Limite do servidor foi ultrapassado ou uploads serializados'
  pg.evaluate('controles[4].abort();controles[0].abort()')
  for _ in range(50):
   if len(posts)==4:break
   pg.wait_for_timeout(100)
  assert len(posts)==4,'Quarto original não iniciou automaticamente quando surgiu vaga'
  pg.evaluate('controles.forEach(c=>c.abort())');pg.wait_for_function('resultados.length===5')
  for r in held:
   try:r.abort()
   except Error:pass
  held.clear()
  # Falha de upload pode ser repetida usando o mesmo File preservado e estado, sem novo seletor.
  fail['post']=True
  pg.evaluate("""()=>{window.estado={};window.repetir=()=>TKVideoPreparation.prepararEmFundo(document.querySelector('#file').files[0],{base:location.origin,conta:'teste',headers:{},estado,signal:new AbortController().signal,progresso:()=>{},salvar:async()=>{}});window.primeira=repetir().catch(e=>window.erro=e.message)}""")
  pg.wait_for_function("window.erro?.includes('Servidor temporariamente')")
  pg.evaluate('()=>{window.segunda=repetir()}')
  for _ in range(50):
   if held:break
   pg.wait_for_timeout(100)
  assert len(posts)==6 and held
  assert posts[-1].post_data_buffer==f.read_bytes()
  # Fecha contexto explicitamente após responder a rota retida.
  held.pop().fulfill(json={'ok':True,'id':'retry','estado':'fila'});pg.wait_for_function("estado.id==='retry'")
  ctx.close();browser.close();print('OK vagas paralelas, início automático do excedente, cancelamento e repetição do upload preservado')
