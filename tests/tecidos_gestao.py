"""Cadastro abaixo do nome, gestão protegida, aliases e filtros administrativos; serviços simulados."""
import os,json
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8773/');OUT=Path(os.environ.get('TK_EVID','/tmp/tecidos-gestao'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900),(390,470)]:
  ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=w<600,service_workers='block');ctx.add_init_script(SESSION)
  st=install(ctx,versao='4.28',perms=PERMS_ALL);st['produtos'][0]['Descricao']='Leve.\nTecido: Dior';st['produtos'][1]['Descricao']='Tecido: Linho'
  cfg={'ok':True,'versao':0,'itens':[]};posts=[]
  def api(route):
   if route.request.method=='POST':
    d=route.request.post_data_json;posts.append(d);cfg['versao']+=1;cfg['itens']=[{'nome':d['nome'],'apelidos':[d['de'],d['nome']]}]
   route.fulfill(json=cfg)
  ctx.route('**/catalogo/tecidos',api)
  pg=ctx.new_page();erros=[];pg.on('pageerror',lambda e:erros.append(str(e)));pg.on('dialog',lambda d:d.accept());pg.goto(BASE+'admin.html');pg.wait_for_function('typeof produtos!=="undefined" && produtos.length>0');pg.wait_for_timeout(300)
  pg.evaluate('(id)=>editarProduto(id)',st['produtos'][0]['ID']);pg.wait_for_selector('#tecido')
  assert pg.locator('[data-passo=nome]').evaluate("e=>e.nextElementSibling.dataset.passo==='tecido'")
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');
  if w==390 and h==844:
   pg.locator('[data-passo=nome]').scroll_into_view_if_needed();pg.screenshot(path=str(OUT/'cadastro-tecido.png'))
  assert pg.input_value('#tecido')=='Dior';assert pg.locator('#tecidos-rapidos button',has_text='Dior').count()==1
  pg.click('#tecidos-gerenciar');pg.wait_for_selector('#overlay-tecidos.aberto');pg.select_option('#tecidos-antigo','Dior');pg.fill('#tecidos-novo','Crepe Dior');pg.click('#tecidos-salvar');pg.wait_for_function('document.getElementById("tecidos-status").textContent.includes("Nome salvo")')
  assert posts[-1]['de']=='Dior' and posts[-1]['nome']=='Crepe Dior'
  assert pg.input_value('#tecido')=='Crepe Dior'
  assert pg.locator('#tecidos-antigo option',has_text='Crepe Dior').count()==1
  assert pg.evaluate('(id)=>TKTecido.ler(tkProdutosLista().find(p=>p.ID===id))',st['produtos'][0]['ID'])=='Crepe Dior'
  pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
  errosaxe=pg.evaluate("async()=>{const r=await axe.run(document.getElementById('overlay-tecidos'));return r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id)}")
  assert not errosaxe,errosaxe
  assert pg.locator('#tecidos-salvar').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}')
  assert pg.locator('.tk-tecido-gestao').evaluate('(e)=>e.getBoundingClientRect().bottom<=document.querySelector(".tk-tecido-rodape").getBoundingClientRect().top+1')
  pg.screenshot(path=str(OUT/f'gestao-{w}-{h}.png'));pg.keyboard.press('Escape');pg.wait_for_timeout(300);assert not pg.locator('#overlay-tecidos').is_visible()
  pg.evaluate('abrirGestao_ && abrirGestao_()') if False else None
  pg.evaluate('document.querySelectorAll("details").forEach(e=>e.open=true)')
  pg.click('#fa-toggle');pg.select_option('#fa-tecido','Crepe Dior');pg.locator('#fa-tecido').dispatch_event('change');assert pg.evaluate('listaVisivel_().length')==1
  pg.goto(BASE+'admin.html');pg.wait_for_function('typeof produtos!=="undefined" && produtos.length>0');pg.wait_for_timeout(300)
  assert pg.evaluate('(id)=>TKTecido.ler(tkProdutosLista().find(p=>p.ID===id))',st['produtos'][0]['ID'])=='Crepe Dior'
  assert not erros,erros
  ctx.close()
 # Visibilidade gerencial depende da permissão, inclusive com a sessão válida.
 ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block');ctx.add_init_script(SESSION);st=install(ctx,versao='4.28',perms=['catalogo_admin','catalogo_cadastrar']);pg=ctx.new_page();pg.goto(BASE+'admin.html');pg.wait_for_timeout(2500);assert pg.locator('#tecidos-gerenciar').is_hidden();ctx.close();b.close()
print('Tecidos: ordem, cadastro/rename persistente, aliases, filtro, axe e acesso de Admin em cinco viewports aprovados.')
