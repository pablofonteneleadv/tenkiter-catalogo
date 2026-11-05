"""Jornadas do comparativo aprovado: ferramentas, CSV e compartilhar busca, sem serviços reais."""
import io, json, os, re, sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
os.environ['TK_BASE']=f'http://127.0.0.1:{server.server_port}/'
sys.path.insert(0,str(ROOT/'tests'))
from mock import install, SESSION
OUT=Path(os.environ.get('TK_EVID','tests/saida/aparencia-aprovada'));OUT.mkdir(parents=True,exist_ok=True)
measurements=[]
img=Image.new('RGB',(480,600),(40,120,90));d=ImageDraw.Draw(img);d.rectangle((150,120,330,520),fill=(95,165,135));d.ellipse((200,40,280,120),fill=(235,210,190));buf=io.BytesIO();img.save(buf,'JPEG');photo=buf.getvalue()
def context(browser,w,h,perms=None):
    c=browser.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=w<600,service_workers='block')
    c.add_init_script(SESSION)
    c.add_init_script("window.__links=[];Object.defineProperty(navigator,'share',{configurable:true,value:async v=>{window.__links.push(v.text||v.url)}})")
    install(c,**({'perms':perms} if perms is not None else {}),versao='4.29',ia=False)
    c.route(re.compile(r'.*(lh3\.googleusercontent|cloudinary).*'),lambda r:r.fulfill(status=200,content_type='image/jpeg',body=photo) if r.request.method=='GET' else r.abort())
    return c

def fits(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Rolagem horizontal'

def touch_targets(page,selector):
    return page.locator(selector).evaluate_all("es=>es.filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({nome:e.innerText.trim(),h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width}))")
try:
 with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox'])
    for w,h in [(320,740),(390,844),(412,915),(1440,900)]:
        c=context(b,w,h);pg=c.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(os.environ['TK_BASE']+'admin.html');pg.wait_for_selector('#lista-produtos .produto')
        shortcut=pg.locator('[data-atalho="ferramentas"]');expect(shortcut).to_have_text(re.compile('Ferramentas do gestor'))
        shortcut.focus();shortcut.press('Enter');expect(pg.locator('#details-ferramentas')).to_have_attribute('open','')
        assert pg.locator('#details-ferramentas .ferr-txt small').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=14
        targets=touch_targets(pg,'#details-ferramentas .ferr-tile,#atalhos-hoje button')
        assert targets and all(t['h']>=44 and t['w']>=44 for t in targets),targets
        fits(pg)
        pg.locator('[data-grupo="vendas"]').scroll_into_view_if_needed();pg.screenshot(path=str(OUT/f'gestao-{w}.png'))
        with pg.expect_download() as dl:pg.locator('#btn-exportar-csv').click()
        assert dl.value.failure() is None
        summary=pg.locator('#details-ferramentas > summary');summary.focus();summary.press('Space');expect(pg.locator('#details-ferramentas')).not_to_have_attribute('open','')
        summary.press('Space');expect(pg.locator('#details-ferramentas')).to_have_attribute('open','')
        # Texto ampliado deve continuar alcançável sem recortar a lista.
        pg.add_style_tag(content='html{font-size:125%}');fits(pg);pg.locator('#btn-abrir-auditoria').scroll_into_view_if_needed();pg.screenshot(path=str(OUT/f'gestao-ampliada-{w}.png'))
        pg.goto(os.environ['TK_BASE']+'index.html');pg.wait_for_selector('.card');pg.fill('#busca','Vestido');pg.press('#busca','Escape');pg.locator('#busca').evaluate('e=>e.blur()')
        share=pg.locator('#btn-share-busca');expect(share).to_be_visible();fits(pg)
        shares=touch_targets(pg,'.btn-compartilhar-filtros,.linha-share-busca button');assert shares and all(t['h']>=44 and t['w']>=44 for t in shares),shares
        pg.screenshot(path=str(OUT/f'loja-{w}.png'));share.click();expect(pg.locator('#sel-link')).to_have_value(re.compile(r'^https://tenkitermodas\.com\.br/'));pg.locator('#sel-nativo').click();pg.wait_for_function('()=>window.__links.length>0');assert 'https://tenkitermodas.com.br/' in pg.evaluate('window.__links[0]');pg.locator('#btn-fechar-selecao').click();expect(pg.locator('#sel-link')).to_be_hidden()
        drawer=pg.locator('#btn-share-filtros')
        if w<600:pg.locator('#btn-filtros-toggle').click()
        expect(drawer).to_be_visible()
        drawer_targets=touch_targets(pg,'.btn-compartilhar-filtros');assert drawer_targets and all(t['h']>=44 and t['w']>=44 for t in drawer_targets),drawer_targets
        assert drawer.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=14
        drawer.click();expect(pg.locator('#sel-link')).to_be_visible();pg.locator('#btn-fechar-selecao').click()
        if w<600:pg.locator('#fx-fechar').click()
        pg.screenshot(path=str(OUT/f'loja-{w}.png'));pg.locator('#btn-limpar-filtros-topo').click();expect(pg.locator('#busca')).to_have_value('');fits(pg)
        assert not errs,errs;c.close()
        # O acabamento não pode revelar ferramentas de gestão ao perfil simplificado.
        c=context(b,w,h,['catalogo_admin','catalogo_cadastrar','painel_simples','cliente']);pg=c.new_page();pg.goto(os.environ['TK_BASE']+'admin.html');pg.wait_for_selector('#lista-produtos .produto');expect(pg.locator('[data-atalho="ferramentas"]')).to_be_hidden();fits(pg);c.close()
        measurements.append({'largura':w,'altura':h,'ferramentas':targets,'compartilhar':shares,'compartilhar_painel_filtros':drawer_targets,'overflow':False,'csv':True,'teclado':True,'compartilhar_busca':True,'perfil_simples_preservado':True})
    b.close()
finally:
 server.shutdown();server.server_close()
(OUT/'medidas.json').write_text(json.dumps(measurements,ensure_ascii=False,indent=2)+'\n')
print('PASS aparência aprovada: ferramentas, teclado, CSV, busca/compartilhar/limpar, texto125%, perfil simples,320/390/412/1440px; sem gravação real.')
