"""Solicitar fotos pela seleção da Gestão e do catálogo; serviços externos simulados."""
import os, sys, json, threading, functools, http.server, subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EVID = Path(os.environ.get('TK_EVID', str(ROOT / 'tests' / '_evid-fotos')))
EVID.mkdir(parents=True, exist_ok=True)
BEFORE = '--before' in sys.argv
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=str(ROOT), **kw)
    def log_message(self, *a): pass
    def do_GET(self):
        name = self.path.split('?')[0].lstrip('/')
        if BEFORE and name in ('admin.html', 'index.html', 'catalogo.js'):
            r = subprocess.run(['git', 'show', 'HEAD:' + name], cwd=ROOT, capture_output=True, check=True)
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8' if name.endswith('.html') else 'text/javascript; charset=utf-8'); self.end_headers(); self.wfile.write(r.stdout); return
        return super().do_GET()
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
BASE = f'http://127.0.0.1:{server.server_port}/'
import mock
mock.BASE_LOCAL = BASE
checks = 0
def chk(name, value):
    global checks
    assert value, name
    checks += 1; print('OK', name, flush=True)

def setup(browser, width, height, page_name, logged=True, mode='ok'):
    ctx = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=width < 600, has_touch=width < 600, service_workers='block')
    if logged: ctx.add_init_script(SESSION)
    state = install(ctx, versao='4.28', ia=False)
    calls = []; fail = {'once': mode == 'partial'}
    def pedir(route):
        body = json.loads(route.request.post_data or '{}'); calls.append(body)
        if mode == 'deny': return route.fulfill(status=403, json={'ok': False, 'erro': 'Seu nome ainda não está na equipe da Esteira.'})
        if fail['once'] and len(calls) == 2:
            fail['once'] = False; return route.abort()
        return route.fulfill(json={'ok': True, 'id': len(calls), 'repetido': mode == 'repeated'})
    ctx.route('**/esteira/fotos/pedir', pedir)
    pg = ctx.new_page(); errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.set_default_timeout(15000); pg.goto(BASE + page_name)
    if page_name == 'admin.html':
        pg.wait_for_selector('#lista-produtos .produto')
        pg.wait_for_timeout(1500)
        pg.locator('.produto-chk').nth(0).check(); pg.locator('.produto-chk').nth(1).check()
        ids = pg.locator('.produto-chk:checked').evaluate_all('(xs)=>xs.map(x=>x.dataset.id)')
    else:
        pg.wait_for_selector('#grid .card[data-id]')
        ids = [str(p['ID']) for p in state['produtos'] if p['Status'] == 'Ativo'][:2]
        pg.evaluate('(ids)=>{salvarSacola(ids); atualizarSacolaHeader_(); atualizarBarraFiltros_();}', ids)
        if logged: pg.locator('#btn-lote-menu').click()
    return ctx, pg, state, calls, errors, ids

def open_dialog(pg, page_name):
    pg.wait_for_function('() => !!window.TKPedirFotos')
    pg.locator('#btn-bulk-pedir-fotos' if page_name == 'admin.html' else '[data-lote="btn-bulk-pedir-fotos"]').click()
    pg.wait_for_selector('#tk-pedir-fotos:not([hidden])')

try:
    with sync_playwright() as p:
        launch = {'headless': True}
        if os.environ.get('TK_BROWSER'): launch['channel'] = os.environ['TK_BROWSER']
        browser = p.chromium.launch(**launch)
        for width, height in [(390, 844), (412, 915), (1440, 900)]:
            for page_name in ['admin.html', 'index.html']:
                ctx, pg, state, calls, errors, ids = setup(browser, width, height, page_name)
                stem = ('antes' if BEFORE else 'depois') + '-' + page_name.split('.')[0] + '-' + str(width)
                pg.screenshot(path=str(EVID / (stem + '-selecao.png')))
                if BEFORE: ctx.close(); continue
                open_dialog(pg, page_name)
                chk(stem + ': quantidade selecionada', '2 produtos selecionados' in pg.locator('.pf-resumo').inner_text())
                pg.locator('.pf-enviar').click()
                chk(stem + ': exige tipo de foto sem enviar', not calls and 'Escolha' in pg.locator('.pf-status').inner_text())
                pg.locator('[data-opcao="outro"]').click(); pg.locator('.pf-enviar').click()
                chk(stem + ': Outro exige texto', not calls and 'Escreva' in pg.locator('.pf-status').inner_text())
                pg.locator('#pf-outro').fill('Foto das costas e detalhe da manga')
                pg.locator('[data-opcao="pano"]').click(); pg.locator('#pf-observacao').fill('Com luz natural, sem esconder a estampa.')
                pg.locator('#pf-observacao').scroll_into_view_if_needed()
                pg.screenshot(path=str(EVID / (stem + '-pedido.png')))
                axe = ROOT / 'tests' / 'axe.min.js'
                if axe.exists():
                    pg.add_script_tag(path=str(axe))
                    violations = pg.evaluate("async () => (await axe.run('#tk-pedir-fotos', {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(x=>({id:x.id,alvos:x.nodes.map(n=>n.target)}))")
                    chk(stem + ': axe WCAG AA sem violacoes ' + str(violations), not violations)
                chk(stem + ': sem rolagem horizontal', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                dims = pg.locator('.pf-folha').evaluate('(e)=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,innerWidth,innerHeight]}')
                chk(stem + ': dialogo cabe na tela', dims[0] >= -1 and dims[1] >= -1 and dims[2] <= dims[4] + 1 and dims[3] <= dims[5] + 1)
                targets = pg.locator('.pf-folha button').evaluate_all('(xs)=>xs.filter(x=>x.getClientRects().length).every(x=>{const r=x.getBoundingClientRect();return r.width>=44&&r.height>=44})')
                chk(stem + ': alvos de toque >=44px', targets)
                pg.locator('.pf-enviar').click()
                pg.wait_for_function('() => document.querySelector(".pf-enviar").textContent === "Concluído"')
                chk(stem + ': um pedido para cada produto', len(calls) == 2 and {x['produto'] for x in calls} == set(ids))
                chk(stem + ': observacao e opcoes em ambos', all(x['obs'] == 'Com luz natural, sem esconder a estampa.' and x['opcoes'] == ['pano'] and x['outro'] == 'Foto das costas e detalhe da manga' for x in calls))
                chk(stem + ': origem correta', all(x['de'] == ('gestao' if page_name == 'admin.html' else 'catalogo') for x in calls))
                pg.locator('.pf-fechar').click(); pg.wait_for_selector('#tk-pedir-fotos', state='hidden')
                chk(stem + ': sem erros JS', not errors)
                ctx.close()
        if not BEFORE:
            # Falha parcial: repete apenas a peça sem confirmação, com o mesmo identificador.
            ctx, pg, state, calls, errors, ids = setup(browser, 390, 844, 'admin.html', mode='partial')
            open_dialog(pg, 'admin.html'); pg.locator('[data-opcao="manequim"]').click(); pg.locator('.pf-enviar').click()
            pg.wait_for_function('() => document.querySelector(".pf-enviar").textContent.includes("Tentar")')
            chk('falha parcial informa 1 de 2', '1 de 2' in pg.locator('.pf-status').inner_text())
            chk('plural: falta 1 (não "Faltam 1")', 'Falta 1' in pg.locator('.pf-status').inner_text() and 'Faltam 1' not in pg.locator('.pf-status').inner_text() and 'restantes' not in pg.locator('.pf-enviar').inner_text())
            pg.locator('.pf-fechar').click(); open_dialog(pg, 'admin.html')
            chk('fechar/reabrir preserva falha e formulario', pg.locator('[data-opcao="manequim"]').get_attribute('aria-pressed') == 'true' and 'Tentar' in pg.locator('.pf-enviar').inner_text())
            pg.locator('.pf-enviar').click(); pg.wait_for_function('() => document.querySelector(".pf-enviar").textContent === "Concluído"')
            chk('retry nao repete confirmado', len(calls) == 3 and calls[1]['produto'] == calls[2]['produto'] and calls[0]['produto'] != calls[2]['produto'])
            chk('retry conserva op', calls[1]['op'] == calls[2]['op'])
            ctx.close()
            # Nenhum pedido real: recusa do servidor precisa ser exibida e não virar sucesso.
            ctx, pg, state, calls, errors, ids = setup(browser, 390, 844, 'admin.html', mode='deny')
            open_dialog(pg, 'admin.html'); pg.locator('[data-opcao="cores"]').click(); pg.locator('.pf-enviar').click()
            pg.wait_for_function('() => document.querySelector(".pf-enviar").textContent.includes("restantes")')
            chk('permissao negada sem falso sucesso', '0 de 2' in pg.locator('.pf-status').inner_text() and 'equipe da Esteira' in pg.locator('.pf-falhas').inner_text())
            pg.locator('.pf-fechar').click(); open_dialog(pg, 'admin.html')
            pg.locator('.pf-fechar').focus(); pg.keyboard.press('Shift+Tab')
            chk('Tab fica no dialogo', pg.locator('.pf-folha').evaluate('(e)=>e.contains(document.activeElement)'))
            pg.keyboard.press('Escape'); pg.wait_for_selector('#tk-pedir-fotos', state='hidden')
            chk('Escape fecha dialogo', pg.locator('#tk-pedir-fotos').is_hidden())
            ctx.close()
            ctx, pg, state, calls, errors, ids = setup(browser, 390, 844, 'index.html', logged=False)
            chk('visitante nao ve acao administrativa', pg.locator('#btn-lote-menu').is_hidden())
            ctx.close()
            for width, height, zoom in [(320, 700, 1), (390, 470, 1.3)]:
                ctx, pg, state, calls, errors, ids = setup(browser, width, height, 'index.html')
                if zoom > 1: pg.add_style_tag(content='html { font-size: 130% !important; }')
                open_dialog(pg, 'index.html'); pg.locator('[data-opcao="outro"]').click()
                pg.locator('#pf-outro').fill('Detalhes e costas da peça'); pg.locator('#pf-observacao').fill('Mostrar todos os detalhes da estampa e o caimento da manga.')
                pg.locator('#pf-observacao').scroll_into_view_if_needed()
                pg.screenshot(path=str(EVID / f'depois-index-{width}x{height}-texto.png'))
                chk(f'{width}x{height}: sem rolagem horizontal com texto ampliado', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                bounds = pg.locator('.pf-enviar').bounding_box()
                chk(f'{width}x{height}: acao principal acessivel', bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= height)
                pg.locator('.pf-enviar').click(); pg.wait_for_function('() => document.querySelector(".pf-enviar").textContent === "Concluído"')
                chk(f'{width}x{height}: envia com area reduzida', len(calls) == 2)
                ctx.close()
            ctx, pg, state, calls, errors, ids = setup(browser, 390, 844, 'admin.html')
            open_dialog(pg, 'admin.html'); pg.locator('[data-opcao="pano"]').click()
            pg.evaluate("salvarSessao('88777777777','outra-conta')")
            pg.locator('.pf-enviar').click()
            chk('troca de conta nao envia o rascunho anterior', not calls and 'conta mudou' in pg.locator('.pf-status').inner_text())
            ctx.close()
        browser.close()
    print('RESULTADO', checks, 'verificacoes; capturas:', EVID, flush=True)
finally:
    server.shutdown(); server.server_close(); thread.join()
