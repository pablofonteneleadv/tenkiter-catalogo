"""Notas internas no modo Espiar, filtro aberto e exclusão sem marcar leitura."""
import os
from pathlib import Path
from mock import install,SESSION,PERMS_ALL
from mock_msg import novo_estado,pessoa
from playwright.sync_api import sync_playwright
OUT=Path(os.environ.get('TK_EVIDENCE_DIR',str(Path(__file__).parent/'saida')))/'notas-espiar';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
  ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=True,service_workers='block');ctx.add_init_script(SESSION)
  st=install(ctx,perms=PERMS_ALL,versao='3.7');s=st['ig']['msg']=novo_estado();c=next(c for c in s['convs'] if not c['grupo'] and c['nao_lidas']);cid=c['id'];alvo=pessoa(c) or f'c:{cid}'
  pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto(os.environ.get('TK_BASE','http://localhost:8765/')+'admin.html?app=mensagens');pg.wait_for_selector(f'#ms-lista [data-id="{cid}"]')
  pg.locator(f'#ms-lista [data-ms=espiar][data-id="{cid}"]').click();pg.wait_for_selector('.ms-espiando')
  assert pg.locator('#ms-etq-faixa [data-ms=notas-abrir]').count()==0
  antes=list(s['calls']);unread=c['nao_lidas']
  falha=[w==390]
  def falhar_uma_vez(r):
   if r.request.method=='POST' and falha[0]:falha[0]=False;r.fulfill(status=500,json={'ok':False,'erro':'Falha simulada. Tente novamente.'})
   else:r.fallback()
  ctx.route('**/msg/notas',falhar_uma_vez)
  pg.locator('.ms-espiando [data-ms=notas-abrir]').click();pg.wait_for_selector('#ms-nota-interna')
  for scale in [1,1.3]:
   pg.evaluate('(s)=>document.documentElement.style.fontSize=(s*100)+"%"',scale)
   pg.locator('#ms-nota-interna').fill('Conferir o pagamento antes de separar.\nNota longa para a equipe, com detalhes do atendimento e ação pendente.')
   if scale==1.3 and w<600:pg.set_viewport_size({'width':w,'height':470})
   save=pg.get_by_role('button',name='Salvar nota',exact=True);save.scroll_into_view_if_needed();save.focus();save.press('Enter')
   if w==390 and scale==1:
    pg.wait_for_timeout(150);assert 'Falha simulada' in pg.locator('.ms-nota-estado').inner_text();assert pg.locator('#ms-nota-interna').input_value();save.press('Enter')
   pg.wait_for_function('(n)=>document.querySelectorAll(".ms-nota-item").length===n',arg=1 if scale==1 else 2)
   pg.screenshot(path=str(OUT/f'notas-{w}-{scale}.png'))
   assert pg.locator('body').evaluate('(b)=>b.scrollWidth<=innerWidth+1')
   if w<600:pg.set_viewport_size({'width':w,'height':h})
  pg.get_by_role('button',name='Fechar Notas da equipe').click()
  pg.locator('#ms-etq-faixa [data-ms=notas-abrir]').click();pg.wait_for_selector('.ms-nota-item')
  buttons=pg.get_by_role('button',name='Apagar nota de Ana');assert buttons.count()==2
  for _ in range(2):buttons.first.click();pg.wait_for_timeout(180)
  assert not pg.locator('.ms-nota-item').count()
  pg.get_by_role('button',name='Fechar Notas da equipe').click();assert not pg.locator('#ms-etq-faixa [data-ms=notas-abrir]').count()
  assert c['nao_lidas']==unread and '/msg/lida' not in s['calls'][len(antes):],(w,s['calls'])
  assert len(s['notas_apagadas'])==2
  assert not errs,errs
  ctx.close()
 b.close()
print('Notas em Espiar: criação, exclusão, atalho condicional, teclado reduzido e fonte 130%; 4 viewports, sem leitura.')
