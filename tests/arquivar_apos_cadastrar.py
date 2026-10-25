import os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,SESSION
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://127.0.0.1:8766/')
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);c.add_init_script(SESSION);install(c);pg=c.new_page();pg.goto(BASE+'admin.html');pg.wait_for_timeout(1200)
 assert pg.locator('#arquivar-depois').count()==1
 assert not pg.locator('#arquivar-depois').is_checked()
 assert 'peça de teste' in pg.locator('#linha-arquivar-depois').inner_text().lower()
 c.close();b.close()
print('arquivar_apos_cadastrar: OK')
