"""Perfil por usuário, assinatura obrigatória, ficha única e blocos de canais. Sem rede real."""
import os,copy
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
from mock_msg import novo_estado,iso
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8766/')
OUT=Path(os.environ.get('TK_EVID','/workspace/artifacts/atendente-ui'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for width,height in [(320,700),(390,844),(412,915),(1440,900)]:
  for admin in [True,False]:
   print('Jornada',width,admin,flush=True)
   ctx=b.new_context(viewport={'width':width,'height':height},has_touch=True,is_mobile=width<600,service_workers='block');ctx.add_init_script(SESSION)
   state=install(ctx,perms=PERMS_ALL if admin else [x for x in PERMS_ALL if x!='gerir_acessos'],versao='3.7');s=state['ig']['msg']=novo_estado()
   ctx.route('**/mensagens-acessos.js*',lambda r:r.fulfill(content_type='application/javascript',body="window.TKMensagensAcessos={pode:()=>true,atualizar:async()=>{}}"))
   s['convs'][0]['pessoa']='pessoa1'
   for cid,ch,minago in [(40,'instagram',3000),(41,'whatsapp2',4000)]:
    c=copy.deepcopy(s['convs'][0]);c.update(id=cid,canal=ch,ultima_em=iso(minago));s['convs'].append(c)
   pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('dialog',lambda d:d.accept())
   pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv')
   pg.wait_for_function("document.getElementById('ms-identidade').textContent==='Ana Lojista'")
   ids=pg.locator('#ms-lista .ms-conv').evaluate_all('(els)=>els.map(e=>e.dataset.id)');n=ids.index('1');assert ids[n:n+3]==['1','40','41'],ids
   assert pg.locator('.ms-vinculada').count()==2
   pg.locator('#ms-lista .ms-conv[data-id="1"]').click();pg.wait_for_selector('#ms-texto')
   assert not pg.locator('#ms-assina input').count()
   assert 'Ana' in pg.locator('#ms-assina').inner_text()
   pg.locator('[data-ms=nome-editar]').click();pg.wait_for_selector('#ms-meu-nome-rapido')
   assert pg.locator('#ms-meu-nome-rapido').bounding_box()['height']>=48
   assert pg.locator('#ms-mostrar-nome').count()==(1 if admin else 0)
   pg.fill('#ms-meu-nome-rapido','Aninha');pg.keyboard.press('Enter');pg.wait_for_function("!document.getElementById('ms-gaveta')")
   assert s['meu_nome']=='Aninha'
   if width==390:s['perfil_erro']=True
   pg.reload();pg.wait_for_selector('#ms-lista .ms-conv');pg.locator('#ms-lista .ms-conv[data-id="1"]').click();pg.wait_for_selector('#ms-texto')
   pg.wait_for_function("document.querySelector('#ms-assina').textContent.includes('Aninha')")
   s['perfil_erro']=False
   pg.fill('#ms-texto','Olá');pg.locator('#ms-enviar').click();pg.wait_for_timeout(300);assert s['envios'][-1]['texto']=='*Aninha:*\nOlá'
   if admin:
    pg.locator('[data-ms=nome-editar]').click();pg.locator('#ms-mostrar-nome').uncheck();pg.locator('[data-ms=nome-salvar]').click();pg.wait_for_function("!document.getElementById('ms-gaveta')")
    assert 'Sem assinatura' in pg.locator('#ms-assina').inner_text()
    pg.locator('[data-ms=nome-editar]').click();assert pg.locator('#ms-mostrar-nome').is_checked() is False
    pg.locator('#ms-mostrar-nome').check();pg.locator('[data-ms=nome-salvar]').click();pg.wait_for_function("!document.getElementById('ms-gaveta')")
   # Name changes occur in ficha; no second overlay.
   pg.locator('.ms-quem').click();pg.wait_for_selector('#ms-fi-nome');pg.fill('#ms-fi-nome','Maria da Silva Corrigida')
   pg.evaluate('document.documentElement.style.fontSize="130%"')
   if width<600:pg.set_viewport_size({'width':width,'height':470})
   pg.locator('#ms-fi-salvar').scroll_into_view_if_needed();r=pg.locator('#ms-fi-salvar').bounding_box();assert r['height']>=44 and r['y']>=0 and r['y']+r['height']<=pg.viewport_size['height']
   assert pg.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth+1')
   pg.screenshot(path=str(OUT/f'ficha-{width}-{admin}.png'));pg.locator('#ms-fi-salvar').click();pg.wait_for_function("!document.getElementById('ms-gaveta')")
   assert s['ficha_posts'][-1]['nome']=='Maria da Silva Corrigida';assert 'Maria da Silva Corrigida' in pg.locator('.ms-quem').inner_text()
   if width<600:pg.set_viewport_size({'width':width,'height':height})
   pg.locator('[data-ms=nome-editar]').focus();pg.keyboard.press('Enter');pg.wait_for_selector('#ms-meu-nome-rapido');pg.screenshot(path=str(OUT/f'assinatura-{width}-{admin}.png'))
   assert pg.locator('[data-ms=nome-salvar]').bounding_box()['height']>=44
   assert not pg.locator('#ms-pessoa-editor').count();assert not errs,errs
   ctx.close()
 b.close()
print('Perfil padrão/editável/persistente, admin exclusivo, nome na principal, blocos e ficha: 8 jornadas, 4 viewports, teclado e 130% aprovados.')
