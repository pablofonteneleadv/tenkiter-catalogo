"""P-26: lote de dez looks, divisão, falha parcial e troca por teclado/toque; IA falsa."""
import os
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
from mock import SESSION, install

BASE = os.environ.get('TK_BASE', 'http://localhost:8772/')
out = Path(__file__).parent / 'saida'
out.mkdir(exist_ok=True)
files = []
for i in range(10):
    f = out / ('look-lote-%02d.jpg' % i)
    Image.new('RGB', (100, 150), (i * 20, 80, 180)).save(f)
    files.append(str(f))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, service_workers='block')
    ctx.add_init_script(SESSION)
    st = install(ctx, versao='4.20')
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + 'admin.html')
    pg.wait_for_function('typeof produtos !== "undefined" && produtos.length')
    pg.evaluate('document.getElementById("details-ferramentas").open=true')
    pg.click('#btn-abrir-fotoia')
    pg.wait_for_selector('#fia-quantidade')
    pg.fill('#fia-quantidade', '10')
    pg.locator('#fia-quantidade').dispatch_event('change')
    assert pg.locator('[data-a=enviar]').is_disabled()
    pg.set_input_files('#fia-arq', files)
    pg.wait_for_function('document.querySelectorAll(".fia-selitem").length === 10')
    pg.select_option('#fia-looks-imagem', '3')
    assert '3 looks + 3 looks + 3 looks + 1 look' in pg.locator('#fia-aba').inner_text()
    # Os dois primeiros pedidos entram, o terceiro falha; só os quatro looks restantes ficam na tela.
    count = [0]
    def fail_once(route):
        if route.request.method == 'POST' and route.request.url.endswith('/fotoia/fila'):
            count[0] += 1
            if count[0] == 3:
                return route.fulfill(status=503, json={'ok': False, 'erro': 'Serviço indisponível no teste'})
        route.fallback()
    ctx.route('**/fotoia/fila', fail_once)
    pg.click('[data-a=enviar]')
    pg.wait_for_function('document.querySelectorAll(".fia-selitem").length === 4')
    fi = st['ig']['fotoia']
    assert len(fi['itens']) == 2
    assert pg.input_value('#fia-quantidade') == '4'
    assert not pg.locator('[data-a=enviar]').is_disabled()
    pg.click('[data-a=enviar]')
    pg.wait_for_selector('.fia-cartao')
    assert len(fi['itens']) == 4
    jobs = [c['body'] for c in fi['chamadas'] if c['path'] == '/fotoia/fila']
    assert [len(x['looks']) for x in jobs] == [3, 3, 3, 1]
    assert all(len(x['pecas']) == len(x['looks']) for x in jobs)
    # Dois pares: a troca das peças de baixo precisa mudar a associação mantendo todos os papéis.
    pg.click('[data-v=gerar]')
    pg.fill('#fia-quantidade', '2')
    pg.locator('#fia-quantidade').dispatch_event('change')
    pg.set_input_files('#fia-arq', files[:4])
    pg.wait_for_function('document.querySelectorAll(".fia-selitem").length === 4')
    for i, papel in enumerate(['cima', 'baixo', 'cima', 'baixo']):
        pg.locator('.fia-selitem').nth(i).locator('[data-a=papel][data-v=%s]' % papel).click()
    pg.select_option('#fia-looks-imagem', '3')
    assert '2 looks' in pg.locator('.fia-looks').inner_text() or '2 pessoas' in pg.locator('.fia-looks').inner_text()
    before = pg.locator('.fia-selitem').nth(1).locator('img').get_attribute('src')
    pg.locator('.fia-arrastar').nth(1).focus()
    pg.keyboard.press('ArrowDown')
    assert pg.locator('.fia-selitem').nth(3).locator('img').get_attribute('src') == before
    # Pointer Events usados também pelo dedo: arraste de volta entre peças de baixo.
    src = pg.locator('.fia-arrastar').nth(3)
    dst = pg.locator('.fia-arrastar').nth(1)
    src.scroll_into_view_if_needed()
    # Exercita o gesto com coordenadas de destino após rolagem, sem depender de HTML5 drag.
    pg.evaluate('''() => {
      const handles = document.querySelectorAll('.fia-arrastar');
      handles[3].setPointerCapture = () => {};
      const box = handles[1].getBoundingClientRect();
      const old = document.elementFromPoint;
      document.elementFromPoint = () => handles[1];
      handles[3].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:7,button:0,clientX:10,clientY:10}));
      handles[3].dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7,button:0,clientX:box.x+20,clientY:box.y+20}));
      document.elementFromPoint = old;
    }''')
    assert pg.locator('.fia-selitem').nth(1).locator('img').get_attribute('src') == before
    pg.click('[data-a=enviar]')
    pg.wait_for_selector('.fia-cartao')
    last = [c['body'] for c in fi['chamadas'] if c['path'] == '/fotoia/fila'][-1]
    assert len(last['looks']) == 2 and last['papeis'] == ['cima', 'baixo', 'cima', 'baixo']
    assert not errs, errs
    print('P-26 LOTES PASS: dez looks, 3+3+3+1, falha parcial sem repetir, metadados, pares, teclado e Pointer Events.')
    b.close()
