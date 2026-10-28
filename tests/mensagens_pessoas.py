"""Blocos por pessoa, grupos desligados e editor de contatos; serviços simulados."""
import os,sys,copy
sys.path.insert(0,os.path.dirname(__file__))
from mock import install,PERMS_ALL
from mock_msg import novo_estado,iso
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8765/')
OUT=os.environ.get('TK_EVID','/tmp/mensagens-pessoas-web');os.makedirs(OUT,exist_ok=True)
SESSION="""localStorage.setItem('tk_admin_sessao','tk2.admin');"""
# use the project's same authenticated fixture as the existing messaging journeys
from mock import SESSION as FIXTURE_SESSION
with sync_playwright() as p:
    browser=p.chromium.launch(args=['--no-sandbox'])
    for width,height in [(320,700),(390,844),(412,915),(1440,900)]:
        ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<600,has_touch=True,service_workers='block')
        ctx.add_init_script(FIXTURE_SESSION);ctx.add_init_script('window.TK_MENSAGENS_POLL_MS=600000;')
        st=install(ctx,perms=PERMS_ALL,versao='3.4');s=st['ig'].setdefault('msg',novo_estado())
        original=copy.deepcopy(s['convs'][0]);s['convs']=[dict(original,id=1,pessoa='person',canal='whatsapp1',ultima_em=iso(30)),dict(original,id=6,pessoa='person',canal='whatsapp2',ultima_em=iso(25)),dict(original,id=7,pessoa='person',canal='instagram',contato='ig-linked',ultima_em=iso(5)),dict(original,id=8,pessoa='other',nome='Outra pessoa',ultima_em=iso(10)),dict(original,id=9,pessoa='',grupo=1,nome='Grupo teste')]
        pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('dialog',lambda d:d.accept())
        pg.goto(BASE+'admin.html');pg.wait_for_timeout(2700);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens');pg.wait_for_selector('.ms-conv');pg.click('[data-ms=aba][data-canal=todos]');pg.wait_for_timeout(600)
        ids=pg.locator('#ms-lista .ms-conv').evaluate_all('(rows)=>rows.map(r=>+r.dataset.id)')
        assert ids==[7,6,1,8],ids
        assert pg.locator('[data-ms=filtro][data-filtro=ambos]').count()==0
        pg.screenshot(path=f'{OUT}/lista-{width}.png')
        pg.click('#ms-lista .ms-conv[data-id="1"]');pg.wait_for_timeout(300);pg.click('.ms-cab .ms-quem');pg.wait_for_selector('#ms-pessoa-editor')   # v7.40.14: o nome abre a ficha; o editor fica em Canais
        pg.get_by_role('textbox',name='Nome',exact=True).fill('Nome confirmado')
        assert not s.get('pessoas_salvas')
        assert pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
        pg.screenshot(path=f'{OUT}/contato-{width}.png')
        pg.get_by_role('button',name='Salvar',exact=True).click();pg.wait_for_timeout(300);assert s.get('pessoas_salvas')
        assert not errors,errors
        ctx.close()
    browser.close()
print('Blocos, ordem, grupos e contato: 4 viewports aprovadas; sem efeitos reais.')
