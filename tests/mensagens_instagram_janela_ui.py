"""Instagram: o aviso da janela só aparece além dos 7 dias (24 h padrão + HUMAN_AGENT até 7 dias); Enviar nunca é travado."""
import os,sys,datetime
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import SESSION,PERMS_ALL,install
from mock_msg import novo_estado
from playwright.sync_api import sync_playwright
BASE=os.getenv('TK_BASE','http://127.0.0.1:8774/')
def iso(h): return (datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=h)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(390,844),(1440,900)]:
  for horas,aviso in [(3,False),(30,False),(6*24,False),(8*24,True)]:
   c=b.new_context(viewport={'width':w,'height':h},service_workers='block');c.add_init_script(SESSION);st=install(c,perms=PERMS_ALL,versao='4.28');S=st['ig'].setdefault('msg',novo_estado())
   ig=next(x for x in S['convs'] if x['id']==5);assert ig['canal']=='instagram';ig['ult_entrada_em']=iso(horas)
   pg=c.new_page();pg.set_default_timeout(8000);errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
   pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('.ms-conv');pg.click('.ms-conv[data-id="5"]');pg.wait_for_selector('#ms-texto')
   pg.wait_for_timeout(300)
   txt=pg.inner_text('#ms-dica') if pg.locator('#ms-dica').count() else ''
   assert ('7 dias' in txt)==aviso,(horas,txt)
   assert '24 h' not in txt,(horas,txt)
   pg.fill('#ms-texto','Oi');assert pg.locator('[data-ms=enviar]').is_enabled(),'Enviar nunca é travado pela janela'
   assert not errors,errors;c.close()
 b.close()
print('PASS Instagram janela: sem alarme antes de 7 dias, aviso só além, Enviar liberado (390/1440).')
