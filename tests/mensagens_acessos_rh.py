"""Permissões de ferramentas no RH, sem enviar chaves novas ao Apps Script."""
import os
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
from playwright.sync_api import sync_playwright
OUT=Path(os.environ.get('TK_EVIDENCE_DIR',str(Path(__file__).parent/'saida')))/'acessos-rh';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
  ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=True,service_workers='block');ctx.add_init_script(SESSION);log=[];st=install(ctx,perms=PERMS_ALL,versao='3.7',log=log)
  saved=[];rules={'perfis':{},'pessoas':{}}
  def route(r):
   if r.request.method=='POST':
    d=r.request.post_data_json;saved.append(d);rules['pessoas'].setdefault(d['alvo'],{})[d['chave']]=d['valor']
   r.fulfill(json={'ok':True,'regras':rules,'ferramentas':{'acessar':'Acessar Mensagens','notas':'Ver e editar notas da equipe','configuracoes':'Configurar conexões e automações'}})
  ctx.route('**/msg/acessos',route)
  pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.goto(os.environ.get('TK_BASE','http://localhost:8765/')+'treinamentos.html?painel=rh');pg.wait_for_selector('.admin-tab[data-tab=acessos]');pg.locator('.admin-tab[data-tab=acessos]').click();pg.wait_for_selector('.ac-card');pg.locator('#ac-todos').click()
  card=pg.locator('.ac-card[data-whats="88988887777"]');card.locator('.ac-abrir').click();pg.wait_for_selector('[data-msg-chave=acessar]')
  card.locator('[data-msg-chave=acessar]').select_option('true');pg.wait_for_timeout(500);assert saved[-1]=={'tipo':'pessoa','alvo':'88988887777','chave':'acessar','valor':True}
  card=pg.locator('.ac-card[data-whats="88988887777"]');card.locator('[data-msg-chave=notas]').select_option('false');pg.wait_for_timeout(500);assert saved[-1]['valor'] is False
  card.locator('[data-msg-chave=configuracoes]').scroll_into_view_if_needed();pg.screenshot(path=str(OUT/f'acessos-{w}.png'));assert pg.locator('body').evaluate('(b)=>b.scrollWidth<=innerWidth+1')
  assert not errs,errs
  ctx.close()
 b.close()
print('RH: ferramentas por pessoa, herança e bloqueio sem publicar Apps Script; 4 viewports.')
