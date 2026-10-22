"""P-40: imagem inteira, desfazer e aplicação atômica de ajuste em várias fotos."""
import base64
import io
import os
from PIL import Image
from playwright.sync_api import sync_playwright
from mock import SESSION, install

BASE = os.environ.get('TK_BASE', 'http://localhost:8765/')
buf = io.BytesIO()
Image.new('RGB', (1200, 600), (180, 40, 80)).save(buf, 'JPEG')
url = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    ctx.add_init_script(SESSION)
    st = install(ctx, versao='4.20')
    st['midia']['modo'] = 'ok'
    pg = ctx.new_page()
    pg.goto(BASE + 'admin.html')
    pg.wait_for_function('typeof produtos !== "undefined" && produtos.length > 0')
    pg.evaluate('(u) => { cancelarDuplicacao(); fotosItens = [{prev:u,b64:u.split(",")[1],capa:true},{prev:u,b64:u.split(",")[1]}]; desenharFotos(); abrirEnquadrar_(0); }', url)
    pg.wait_for_function('TKEnquadrar._estado() && TKEnquadrar._estado().img')
    assert pg.evaluate('TKEnquadrar._estado().modo') == 'encaixar'
    assert not pg.locator('#enq-ajustes').evaluate('e => e.open')
    assert pg.locator('#enq-todas').is_visible()
    assert pg.locator('#enq-z').is_hidden()
    if os.environ.get('TK_PRINTS'):
        os.makedirs(os.environ['TK_PRINTS'], exist_ok=True)
        pg.screenshot(path=os.path.join(os.environ['TK_PRINTS'], 'enquadrar-simples.png'))
    pg.click('#enq-ajustes summary')
    pg.click('[data-enq=g][data-v="90"]')
    assert pg.evaluate('TKEnquadrar._estado().r') == 90
    pg.click('[data-enq=desfazer]')
    assert pg.evaluate('TKEnquadrar._estado().r') == 0
    pg.click('[data-enq=g][data-v="90"]')
    pg.click('#enq-todas')
    pg.wait_for_function('fotosItens.length === 2 && fotosItens.every(f => f.orig && f.enquadramento.r === 90)')
    assert pg.evaluate('fotosItens.filter(f => f.capa).length') == 1
    assert pg.evaluate('fotosItens.every(f => f.prev.startsWith("data:image/jpeg"))')
    pg.evaluate('abrirEnquadrar_(1)')
    pg.wait_for_function('TKEnquadrar._estado() && TKEnquadrar._estado().img')
    assert pg.evaluate('TKEnquadrar._estado().r') == 90
    pg.click('#enq-voltar')
    pg.wait_for_function('!fotosItens[1].orig')
    assert pg.evaluate('fotosItens[0].enquadramento.r') == 90
    # Falha numa imagem impede a troca de qualquer uma das outras.
    ctx.route('https://imagem-invalida.exemplo/**', lambda r: r.abort())
    pg.evaluate('fotosItens[1] = {url:"https://imagem-invalida.exemplo/foto.jpg"}; window.__antesLote = fotosItens.slice(); abrirEnquadrar_(0)')
    pg.wait_for_function('TKEnquadrar._estado() && TKEnquadrar._estado().img')
    pg.click('#enq-todas')
    pg.wait_for_function('document.getElementById("enq-aviso").textContent.includes("Nenhuma foto foi trocada")')
    assert pg.evaluate('fotosItens.every((f,i) => f === window.__antesLote[i])')
    assert pg.locator('#enq-todas').is_enabled()
    print('P-40 LOTE: PASS (inteira, desfazer, rotação, aplicação em duas fotos, capa única, ajuste individual, original e falha atômica).')
    b.close()
