"""Seleção opcional dos canais vinculados; não junta contatos por nome."""
import os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import SESSION,PERMS_ALL,install
from mock_msg import pessoa,novo_estado
from playwright.sync_api import sync_playwright
BASE=os.getenv('TK_BASE','http://127.0.0.1:8774/')
OUT=Path(os.getenv('TK_EVID','tests/saida/selecao-canais'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,844),(390,844),(412,915),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block');c.add_init_script(SESSION);st=install(c,perms=PERMS_ALL,versao='4.28');S=st['ig'].setdefault('msg',novo_estado());m=next(x for x in S['convs'] if x['id']==1);key=pessoa(m);m['pessoa']=key
  extra=dict(m,id=7,canal='whatsapp2',contato='558899990000');S['convs'].append(extra)
  ig=next(x for x in S['convs'] if x['id']==5);ig.update(nome='Maria',pessoa=key)
  homonimo=next(x for x in S['convs'] if x['id']==4);homonimo['nome']='Maria'
  pg=c.new_page();pg.set_default_timeout(8000);errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));aceitar=[False];pg.on('dialog',lambda d:d.accept() if aceitar[0] else d.dismiss())
  pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('.ms-conv');pg.click('[data-ms=selecionar]');pg.click('.ms-conv[data-id="1"]');pg.wait_for_selector('[data-ms=sel-canais-pessoa]')
  pg.click('[data-ms=sel-canais-pessoa]');pg.wait_for_timeout(150);assert '1 selecionada' in pg.inner_text('#ms-selbar');assert not S.get('encerrar')
  aceitar[0]=True;pg.click('[data-ms=sel-canais-pessoa]');pg.wait_for_function('document.querySelector("#ms-selbar").textContent.includes("3 selecionadas")')
  assert pg.locator('.ms-conv[data-id="4"][aria-pressed=true]').count()==0
  assert not S.get('encerrar'),'A confirmação amplia a seleção sem encerrar'
  pg.screenshot(path=str(OUT/f'canais-{w}.png'))
  pg.click('[data-ms=sel-encerrar]');pg.click('[data-ms=motivo][data-m=sem_resposta]');pg.wait_for_timeout(300)
  assert sorted(S['encerrar'][-1]['ids'])==[1,5,7]
  assert not errors,errors;c.close()
 b.close()
print('PASS 4telas: autorização recusada preserva seleção, aceita inclui 3canais vinculados, homônimo excluído, encerramento explícito.')
