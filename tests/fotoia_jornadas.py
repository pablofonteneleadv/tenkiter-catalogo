"""Jornadas da página dedicada; rede e IA simuladas, banco local real no navegador."""
import os, io, json
from pathlib import Path
from PIL import Image, ImageDraw
from mock import SESSION, PERMS_ALL, install
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8773/').rstrip('/')+'/'
OUT=Path('tests/saida/fotoia-catalogo');OUT.mkdir(parents=True,exist_ok=True)
def ambiente(browser,w=390,h=844,perms=PERMS_ALL):
 c=browser.new_context(viewport={'width':w,'height':h},has_touch=True,reduced_motion='reduce',service_workers='block');c.add_init_script(SESSION);c.add_init_script('window.TK_FOTOIA_POLL_MS=60000');st=install(c,versao='4.28',perms=perms);st['ids_unicos']=True
 ps=st['produtos'];ps[2].update(Nome='Conjunto Premium',Categoria='Conjunto',Genero='Feminino Adulto',Tamanhos='P, M, G');ps[3].update(Nome='Blusa floral infantil',Categoria='Blusa',Genero='Infantil Menina',Tamanhos='6 anos');ps[4].update(Nome='Short infantil',Categoria='Short',Genero='Infantil Menina',Tamanhos='6 anos')
 im=Image.new('RGB',(400,600),'#e9e5dc');d=ImageDraw.Draw(im);d.polygon([(120,100),(280,100),(330,230),(270,250),(260,390),(140,390),(130,250),(70,230)],fill='#3f665a');d.rectangle((150,400,250,550),fill='#343d45');d.text((90,575),'SIMULACAO - SEM IA',fill='#202020');buf=io.BytesIO();im.save(buf,format='JPEG')
 for host in ['res.cloudinary.com','lh3.googleusercontent.com','tenkiter-midia.distkrpconfeccoes.workers.dev']:c.route('https://'+host+'/**',lambda r:r.fulfill(body=buf.getvalue(),content_type='image/jpeg',headers={'Access-Control-Allow-Origin':'*'}))
 pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('dialog',lambda d:d.accept());pg.goto(BASE+'fotos-ia.html');pg.wait_for_selector('[data-a=escolher]');return c,st,pg,errors

def escolher(pg,pessoa=0,papel='look',codigo='TK-0003'):
 pg.locator('.fi-pessoa').nth(pessoa).locator('[data-a=escolher][data-papel='+papel+']').click();pg.fill('#fi-busca',codigo);pg.click('[data-picker=produto]');pg.locator('[data-picker=foto]').first.click();pg.wait_for_selector('#fi-picker',state='hidden')
def salvar(pg):pg.locator('[data-a=salvar-foto]').evaluate('e=>{e.click();e.click()}');pg.wait_for_selector('.fi-editor',state='hidden');pg.wait_for_selector('[data-a=enviar]')
def foto(pg,n=1):
 for i in range(n):
  if i:pg.click('[data-a=pessoa-nova]')
  escolher(pg,i)
 salvar(pg)
def fila(st):return st['ig']['fotoia']
def recebidas(pg,n):pg.wait_for_function('(n)=>[...document.querySelectorAll(".fi-plano-item .fi-status")].filter(x=>x.textContent.includes("Recebida para criação")).length===n',arg=n)
def pronta(pg,st):
 j=fila(st)['itens'][0];j['status']='pronta';j['resultado']=st['produtos'][2]['Foto_URL'];pg.click('[data-aba=resultados]');pg.wait_for_selector('[data-r=aprovar]');return j

def basico():
 with sync_playwright() as p:
  b=p.chromium.launch(args=['--no-sandbox']);c,st,pg,errors=ambiente(b)
  # Real link from management opens the dedicated HTML rather than another modal.
  pg.goto(BASE+'admin.html');pg.wait_for_function('typeof produtos!=="undefined" && produtos.length');pg.evaluate('document.getElementById("details-ferramentas").open=true');pg.click('#btn-abrir-fotoia');pg.wait_for_url('**/fotos-ia.html?origem=gestao');pg.wait_for_selector('[data-a=escolher]')
  assert pg.locator('[role=tab]:visible').count()==3
  pg.click('[data-a=salvar-foto]');assert 'falta escolher' in pg.inner_text('#fi-editor-erro')
  pg.click('[data-a=escolher]');pg.fill('#fi-busca','TK-0003');assert pg.locator('[data-picker=produto]').count()==1;assert pg.evaluate('document.activeElement.id')=='fi-busca';pg.keyboard.press('Escape');pg.wait_for_selector('#fi-picker',state='hidden');assert pg.locator('[data-a=escolher]').evaluate('e=>e===document.activeElement')
  foto(pg);pg.click('[data-a=enviar]');recebidas(pg,1);j=pronta(pg,st);assert not pg.locator('[data-det=catalogo]').count();pg.click('[data-r=aprovar]');pg.wait_for_selector('[data-det=catalogo]');assert j['status']=='aprovada'
  pg.click('[data-det=legenda] summary');assert 'à vista' in pg.locator('[data-legenda]').input_value();assert pg.locator('[data-det=legenda] a').first.get_attribute('href')
  pg.click('[data-r=descartar]');pg.wait_for_function('!document.querySelector("[data-job]")');pg.select_option('#fi-resultados-filtro','descartada');pg.wait_for_selector('[data-r=refazer]')
  pg.click('[data-aba=ajustes]');pg.fill('[name=limiteDia]','7');pg.select_option('[name=provedores]','cloudflare');pg.locator('.fi-opcoes summary').click();pg.fill('[name=instrucao]','Fidelidade total às roupas cadastradas.');pg.fill('[name=modelos]','modelo-a\nmodelo-b');pg.click('#fi-config button[type=submit]');pg.wait_for_function('document.querySelector("#fi-config-status").textContent.includes("Ajustes salvos")');assert fila(st)['cfg']['limiteDia']==7;assert fila(st)['cfg']['modelos']==['modelo-a','modelo-b']
  # A focused filter must not prevent automatic arrival of image/actions, nor erase an open form.
  pg.click('[data-aba=lote]');pg.locator('[data-a=base]').first.click();salvar(pg);pg.click('[data-a=enviar]');recebidas(pg,2);j=fila(st)['itens'][0];pg.evaluate('window.TK_FOTOIA_POLL_MS=150');pg.click('[data-aba=resultados]');pg.select_option('#fi-resultados-filtro','fila');pg.wait_for_selector('[data-r=cancelar]');pg.select_option('#fi-resultados-filtro','ativas');pg.focus('#fi-resultados-filtro');j['status']='pronta';j['resultado']=st['produtos'][2]['Foto_URL'];pg.wait_for_selector('[data-r=aprovar]');assert pg.evaluate('document.activeElement.id')=='fi-resultados-filtro';pg.wait_for_function('document.querySelector("#fi-num-fila").textContent===""');pg.click('[data-r=aprovar]');pg.wait_for_selector('[data-det=catalogo]');pg.click('[data-det=catalogo] summary');pg.uncheck('[data-produto]');pg.wait_for_timeout(350);assert not pg.locator('[data-produto]').is_checked()
  assert not errors,errors;c.close()
  c,st,pg,errors=ambiente(b,perms=['catalogo_cadastrar']);assert pg.locator('#fi-tab-ajustes').is_hidden();pg.goto(BASE+'fotos-ia.html#ajustes');pg.wait_for_selector('[data-a=escolher]');assert not pg.locator('#fi-config').count();assert not errors;c.close()
  c=b.new_context();install(c,perms=[]);pg=c.new_page();pg.goto(BASE+'fotos-ia.html');pg.wait_for_selector('.fi-login');assert not pg.locator('[data-a=escolher]').count();c.close();b.close()
 print('FALHAS=0 — página, entrada, busca, validação, teclado, aprovação, histórico, ajustes e permissões.')

def lotes():
 with sync_playwright() as p:
  b=p.chromium.launch(args=['--no-sandbox']);c,st,pg,errors=ambiente(b)
  # Four explicitly planned photos; reuse is intentional, independent poses and order.
  for n in [3,2,2,1]:
   if pg.locator('[data-a=nova]').count():pg.click('[data-a=nova]')
   foto(pg,n)
  assert pg.locator('.fi-plano-item').count()==4
  pg.locator('[data-a=editar]').first.click();pg.select_option('[data-pose]:visible >> nth=0','perfil');pg.locator('[data-a=pessoa-direita]').first.click();salvar(pg)
  pg.reload();pg.wait_for_selector('.fi-plano-item');assert pg.locator('.fi-plano-item').count()==4
  count=[0]
  def falha(r):
   count[0]+=1
   if count[0]==2:return r.fulfill(status=503,json={'ok':False,'erro':'Conexão indisponível no teste'})
   r.fallback()
  c.route('**/fotoia/fila',falha);pg.locator('[data-a=enviar]').evaluate('e=>{e.click();e.click()}');pg.wait_for_function('document.querySelector("#fi-aviso").textContent.includes("precisa de confirmação")');assert len(fila(st)['itens'])==3
  assert pg.locator('[data-a=editar]').count()==0,'uncertain delivery cannot mutate original request'
  pg.click('[data-a=enviar]');recebidas(pg,4);assert len(fila(st)['itens'])==4
  jobs=[x['body'] for x in fila(st)['chamadas'] if x['path']=='/fotoia/fila'];assert len(set(x['pedidoId'] for x in jobs))==4;assert sorted(len(x['looks']) for x in jobs)==[1,2,2,3];assert all(x['fotos']=='<1 fotos>' for x in jobs),'same source reused across people'
  pg.reload();pg.wait_for_selector('.fi-plano-item');recebidas(pg,4);assert len(fila(st)['itens'])==4
  # Lost acknowledgement after acceptance is confirmed by identity and never posted twice.
  pg.locator('[data-a=base]').first.click();salvar(pg)
  def perdido(r):
   # Acceptance is simulated locally; no provider or real API is contacted.
   body=json.loads(r.request.post_data);fi=fila(st);fi['seq']+=1;fi['itens'].insert(0,{'id':fi['seq'],'pedidoId':body['pedidoId'],'status':'fila'});r.abort('failed')
  c.unroute('**/fotoia/fila',falha);c.route('**/fotoia/fila',perdido);pg.click('[data-a=enviar]');recebidas(pg,5);assert len(fila(st)['itens'])==5
  # A raw garment needs its audience and survives a reload as a Blob, without credentials in IndexedDB.
  c.unroute('**/fotoia/fila',perdido);pg.click('[data-a=novo-lote]');pg.click('[data-a=escolher]');raw=OUT/'raw-referencia.jpg';Image.new('RGB',(120,180),'#567').save(raw);pg.set_input_files('#fi-arquivo',str(raw));pg.wait_for_selector('#fi-picker',state='hidden');pg.click('[data-a=salvar-foto]');assert 'público' in pg.inner_text('#fi-editor-erro');pg.select_option('[data-publico]','criancas');salvar(pg);pg.reload();pg.wait_for_selector('.fi-plano-item');assert 'raw-referencia.jpg' in pg.inner_text('.fi-plano-item');pg.click('[data-a=enviar]');recebidas(pg,1);assert fila(st)['chamadas'][-1]['path'] # no paid generation
  assert not errors,errors;c.close()
  # Upload acknowledgement can arrive while another photo is being edited; preserve typing/focus.
  c,st,pg,errors=ambiente(b);foto(pg);held=[]
  c.route('**/fotoia/fila',lambda r:held.append(r));pg.click('[data-a=enviar]');pg.wait_for_function('document.querySelector("[data-a=enviar]").disabled');pg.click('[data-a=nova]');pg.locator('.fi-opcoes summary').click();pg.fill('#fi-titulo','Próxima combinação');pg.focus('#fi-titulo');assert len(held)==1;held[0].fulfill(json={'ok':True,'id':99});pg.wait_for_function('document.querySelector(".fi-plano-item .fi-status").textContent.includes("Recebida")');assert pg.input_value('#fi-titulo')=='Próxima combinação';assert pg.evaluate('document.activeElement.id')=='fi-titulo';assert not pg.locator('[data-a=enviar]').count();assert not errors,errors;c.close();b.close()
 print('P-26 LOTES PASS — 3/2/2/1 pessoas, reuso, ordem, poses, rascunho, clique duplo, falha parcial, confirmação e resposta perdida.')

def catalogo():
 with sync_playwright() as p:
  browser=p.chromium.launch(args=['--no-sandbox'])
  for w,h in [(390,844),(412,915),(1440,900),(320,700)]:
   c,st,pg,errors=ambiente(browser,w,h);ps=st['produtos'];a,bb=ps[3],ps[4];a['Fotos_Galeria']='https://res.cloudinary.com/z/image/upload/v1/galeria.jpg';a['Video_URL']='https://res.cloudinary.com/z/video/upload/v1/video.mp4';orig=a.copy()
   pg.click('[data-a=modo][data-modo=par]');escolher(pg,0,'cima','TK-0004');escolher(pg,0,'baixo','TK-0005');pg.select_option('[data-pose]','sentada');pg.select_option('[data-f=cenario]','natural');salvar(pg);pg.click('[data-a=enviar]');recebidas(pg,1);j=pronta(pg,st);pg.click('[data-r=aprovar]');pg.wait_for_selector('[data-det=catalogo]');pg.click('[data-det=catalogo] summary')
   pg.check('[data-capa="'+a['ID']+'"]');pg.click('[data-r=incorporar]');pg.wait_for_function('document.querySelector("[data-catalogo-status]").textContent.includes("Foto adicionada em 2")');assert orig['Foto_URL'] in a['Fotos_Galeria'];assert orig['Fotos_Galeria'] in a['Fotos_Galeria'];assert a['Preco']==orig['Preco'];assert a['Video_URL']==orig['Video_URL'];assert bb['Foto_URL']!=a['Foto_URL'];assert a['Foto_URL'] in bb['Fotos_Galeria']
   pg.click('[data-r=incorporar]');pg.wait_for_function('document.querySelector("[data-catalogo-status]").textContent.includes("Foto adicionada em 2")');assert a['Fotos_Galeria'].split(',').count(orig['Foto_URL'])==1
   falhar=[True]
   def vinculo(r):
    if r.request.method=='POST' and falhar[0]:falhar[0]=False;return r.fulfill(status=503,json={'ok':False,'erro':'Vínculo interrompido no teste'})
    r.fallback()
   c.route('**/fotoia/composicao*',vinculo);n=len(ps);pg.click('[data-r=misto]');pg.wait_for_function('document.querySelector("[data-catalogo-status]").textContent.includes("faltou vincular")');assert len(ps)==n+1;pg.click('[data-r=misto]');pg.wait_for_function('document.querySelector("[data-catalogo-status]").textContent.includes("Produto misto pronto")');assert len(ps)==n+1;novo=ps[-1];assert float(novo['Preco'])==0;assert set(fila(st)['composicoes'][0]['membros'])=={a['ID'],bb['ID']}
   pg.evaluate('document.activeElement.blur();scrollTo(0,0)');pg.screenshot(path=str(OUT/f'pagina-produtos-{w}.png'),full_page=True)
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   # Zoom/reflow and short-height picker, genuine focus and close controls.
   pg.click('[data-aba=lote]');pg.locator('[data-a=base]').first.click()
   for vw,vh,zoom in [(w,h,1),(320,700,1),(390,844,1.3),(390,470,1)]:
    pg.set_viewport_size({'width':vw,'height':vh});pg.evaluate('(z)=>document.documentElement.style.fontSize=(z*100)+"%"',zoom);assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1');pg.locator('[data-a=escolher]').first.click();pg.fill('#fi-busca','TK-0004');assert pg.locator('[data-picker=produto]').count()==1;box=pg.locator('#fi-picker-fechar').bounding_box();assert box['height']>=44 and box['y']>=0 and box['y']+box['height']<=vh;pg.screenshot(path=str(OUT/f'picker-{w}-{vw}-{vh}-{zoom}.png'));pg.keyboard.press('Escape')
   pg.set_viewport_size({'width':w,'height':h});pg.evaluate('document.documentElement.style.fontSize=""');pg.evaluate('document.activeElement.blur();scrollTo(0,0)');pg.screenshot(path=str(OUT/f'pagina-editor-{w}.png'),full_page=True)
   if Path('tests/axe.min.js').exists():
    pg.add_script_tag(path='tests/axe.min.js');viol=pg.evaluate("async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(x=>({id:x.id,targets:x.nodes.map(n=>n.target)}))");assert not viol,viol
   pg.goto(BASE+'?c='+novo['Codigo']);pg.wait_for_selector('.composicao-ia-dica')
   for _ in range(1+len([u for u in str(novo.get('Fotos_Galeria','')).split(',') if u.strip()])):pg.click('#seta-dir')
   pg.wait_for_selector('.composicao-ia-slide');assert a['Nome'] in pg.inner_text('.composicao-ia-slide');assert 'à vista' in pg.inner_text('.composicao-ia-slide');pg.locator('.composicao-ia-slide a').first.click();pg.wait_for_function('(cod)=>location.search.includes(cod)',arg=a['Codigo']);assert not errors,errors;c.close()
  browser.close()
 print('FOTOS IA CATÁLOGO PASS — capa/galeria sem perda, preço/vídeo, misto recuperável, vitrine, 4 viewports, reflow, texto 130%, altura 470, teclado e axe.')
