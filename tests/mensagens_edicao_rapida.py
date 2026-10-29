"""Jornada isolada: atendimento -> editar idades em aba compacta -> salvar.
Serviços simulados; não envia WhatsApp nem altera o catálogo real.
"""
import os, sys, time, socket, subprocess
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tests'))
from mock import install, SESSION, PERMS_ALL
import mock_msg

BASE = os.getenv('TK_BASE', 'http://localhost:8765/')
EVID = ROOT / 'tests' / 'evidencias_edicao'
EVID.mkdir(exist_ok=True)
server = None
def check(cond, msg, data=''):
    if not cond: raise AssertionError(msg + (' · ' + str(data) if data else ''))
    print('✓', msg, flush=True)

def run_case(browser, width, height, mobile):
    ctx = browser.new_context(viewport={'width':width,'height':height},
                              is_mobile=mobile, has_touch=mobile, service_workers='block')
    ctx.add_init_script(SESSION)
    state = install(ctx, perms=PERMS_ALL, versao='3.4')
    state['ig'].setdefault('msg', mock_msg.novo_estado())
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(BASE + 'admin.html')
    pg.wait_for_timeout(2200)
    pg.click('#details-ferramentas > summary')
    pg.click('#btn-abrir-mensagens')
    pg.wait_for_selector('.ms-conv', timeout=8000)
    pg.locator('#ms-lista .ms-conv[data-id="4"]').click()
    pg.wait_for_selector('[data-ms="gaveta-produtos"]')
    pg.fill('#ms-texto', 'Não perder este rascunho')
    pg.click('[data-ms="gaveta-produtos"]')
    pg.fill('#ms-prod-busca', 'vestido liso')
    pg.wait_for_timeout(250)
    editor = pg.locator('#ms-prod-lista [data-ms="prod-editar"]').first
    check(editor.count() == 1, 'Editar tamanhos aparece no seletor de produtos')
    medida = editor.evaluate('(x)=>{const r=x.getBoundingClientRect();return {w:r.width,h:r.height}}')
    check(medida['h']>=44, 'Alvo de toque com pelo menos 44px', medida)
    check(pg.locator('#ms-prod-lista [data-ms="prod-usar"]').count()>=1, 'Enviar produto preservado')
    with ctx.expect_page() as popup:
        editor.click()
    ed = popup.value
    ed.on('pageerror', lambda e: errors.append('edição: '+str(e)))
    ed.wait_for_load_state('domcontentloaded')
    ed.wait_for_timeout(2300)
    query = parse_qs(urlparse(ed.url).query)
    check(query.get('edicaoRapida') == ['tamanhos'] and bool(query.get('editarProduto')),
          'Abre a edição da peça exata em outra aba',ed.url)
    ed.wait_for_selector('body.edicao-rapida-atendimento',timeout=8000)
    check(ed.locator('#card-form').evaluate('(x)=>x.open'), 'Formulário autenticado está aberto')
    check(ed.locator('#form-produto [data-passo="tamanhos"]').is_visible(), 'Opções de idades estão visíveis')
    check(not ed.locator('#form-produto [data-passo="fotos"]').is_visible(), 'Fotos não atrasam a correção')
    check(not ed.locator('#form-produto [data-passo="preco"]').is_visible(), 'Preço continua armazenado, mas oculto')
    check(ed.locator('#produto-id').input_value() == query['editarProduto'][0], 'ID selecionado confere')
    check(pg.locator('#ms-texto').input_value() == 'Não perder este rascunho', 'Conversa original preservada')
    ed.locator('#cad-etiquetas').get_by_role('button',name='M',exact=True).click()
    ed.locator('#cad-faixas').get_by_role('button',name='3 anos',exact=True).click()
    t = ed.locator('#tamanhos').input_value()
    check('Etiqueta: M' in t and 'Idade: 3 anos' in t, 'Nova escolha serializada no cadastro',t)
    check(ed.locator('#btn-salvar').is_visible(), 'Salvar acessível na edição compacta')
    ed.screenshot(path=str(EVID / f'correcao-{width}.png'),full_page=False)
    ed.locator('#btn-salvar').click()
    ed.wait_for_timeout(1500)
    check(ed.locator('#status').count()==1, 'Status do salvamento exibido')
    check(not errors, 'Sem erros JavaScript', errors)
    ed.close(); ctx.close()

try:
    if 'TK_BASE' not in os.environ:
        server = subprocess.Popen([sys.executable,'-m','http.server','8765','--bind','127.0.0.1'],
                                  cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(args=['--no-sandbox'])
        for w,h,mob in ((390,844,True),(412,915,True),(1440,900,False)):
            run_case(browser,w,h,mob)
        browser.close()
    print('Jornada de edição rápida concluída em 390×844, 412×915, 1440×900.')
finally:
    if server: server.terminate()
