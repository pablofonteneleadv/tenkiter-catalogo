"""Fotos extras ocupam linha própria; preços e ações continuam alinhados. API simulada."""
import os
from pathlib import Path
from mock import install
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8765/')
OUT=Path(os.environ.get('TK_EVID','/tmp/catalogo-cards-fotos'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(args=['--no-sandbox'])
    for width,height in [(320,700),(390,844),(412,915),(1440,900)]:
        ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=True,is_mobile=width<600,service_workers='block')
        st=install(ctx,versao='3.7');st['produtos'][:]=st['produtos'][:6]
        for i,prod in enumerate(st['produtos']):
            prod.update(Status='Ativo',Estoque=3,Codigo=f'TK-{9999-i}',Genero='Feminino Adulto',Tamanhos='36, 38, 40, 42' if i%2 else 'M',Nome='Conjunto feminino adulto short saia balonê com nome comprido' if i%2 else 'Body rosa')
            prod['Fotos_Galeria']=','.join(f'https://res.cloudinary.com/z/image/upload/v1/extra-{i}-{j}.jpg' for j in range(5)) if i%3!=1 else ''
        before=os.environ.get('TK_BEFORE_CSS')
        if before:ctx.route('**/catalogo.css*',lambda r:r.fulfill(path=before,content_type='text/css'))
        pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
        pg.goto(BASE+'index.html');pg.wait_for_selector('.thumbs-card');pg.wait_for_timeout(700)
        for scale in [100,130]:
            pg.evaluate('(s)=>document.documentElement.style.fontSize=s+"%"',scale)
            pg.wait_for_timeout(100)
            pg.screenshot(path=str(OUT/f'cards-{width}-{scale}.png'),full_page=True)
            measured=pg.locator('#grid .card').evaluate_all('''cards=>cards.map(c=>{
                const rect=s=>{const n=s===':scope'?c:c.querySelector(s);if(!n)return null;const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}};
                return {card:rect(':scope'),img:rect('.img-wrap'),thumbs:rect('.thumbs-card'),info:rect('.card-info'),price:rect('.preco'),actions:rect('.acoes-card')};
            })''')
            assert measured,(width,scale)
            for m in measured:
                if m['thumbs']:
                    assert m['thumbs']['top']>=m['img']['bottom']-1,('foto/miniaturas',width,scale,m)
                    assert m['info']['top']>=m['thumbs']['bottom']-1,('miniaturas/info',width,scale,m)
                assert m['actions']['top']>=m['price']['bottom']-1,('preço/ações',width,scale,m)
                assert m['actions']['bottom']<=m['card']['bottom']+1,('ações/cartão',width,scale,m)
            for m in measured:
                row=[x for x in measured if abs(x['img']['top']-m['img']['top'])<1]
                assert max(x['actions']['top'] for x in row)-min(x['actions']['top'] for x in row)<1.1,('alinhamento',width,scale,row)
            assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,scale,'overflow')
        thumb=pg.locator('.thumbs-card').first.locator('button').nth(1)
        thumb.focus();pg.keyboard.press('Space');assert thumb.get_attribute('aria-pressed')=='true'
        assert not pg.locator('#overlay.aberto').count()
        assert not errors,errors
        ctx.close()
    browser.close()
print('Fotos extras: sem sobreposição e com ações alinhadas, 4 viewports × texto 100/130%; seleção por teclado aprovada.')
