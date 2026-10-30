"""Jornada isolada: atendimento -> editar tamanhos em modal interno -> salvar.
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
    envios_mock = []
    state = install(ctx, perms=PERMS_ALL, log=envios_mock, versao='4.28')
    state['ig'].setdefault('msg', mock_msg.novo_estado())
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: (errors.append(str(e)),print('JS:',e,flush=True)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(BASE + 'admin.html')
    pg.wait_for_timeout(2200)
    pg.click('#details-ferramentas > summary')
    pg.click('#btn-abrir-mensagens')
    pg.wait_for_selector('.ms-conv', timeout=8000)
    pg.locator('#ms-lista .ms-conv[data-id="4"]').click()
    # A conversa é carregada assincronamente. Não consultar is_visible()
    # antes de terminar a abertura: isso deixava a tela em modo Espiar.
    pg.wait_for_selector('#ms-conversa #ms-texto', state='attached', timeout=12000)
    atender = pg.locator('#ms-conversa [data-ms="atender"]')
    if atender.count():
        atender.wait_for(state='visible', timeout=8000)
        atender.click()
    # O compositor só é exibido após Atender; diagnosticar o estado
    # real antes de aguardar o botão de produtos.
    try:
        pg.locator('#ms-conversa .ms-compor').wait_for(state='visible', timeout=12000)
        pg.locator('#ms-conversa [data-ms="gaveta-produtos"]').wait_for(state='visible', timeout=12000)
    except Exception:
        print('DIAGNOSTICO:', pg.evaluate("""() => ({
          vista: document.querySelector('#ms-app')?.dataset.vista,
          espiar: !!document.querySelector('#ms-conversa [data-ms="atender"]'),
          compositor: [...document.querySelectorAll('#ms-conversa .ms-compor')].map(e=>({hidden:e.hidden,display:getComputedStyle(e).display})),
          botoes: [...document.querySelectorAll('#ms-conversa [data-ms]')].map(e=>e.dataset.ms).slice(0,35)
        })"""), flush=True)
        pg.screenshot(path=str(EVID / f'erro-abertura-{width}.png'), full_page=False)
        raise
    pg.fill('#ms-texto', 'Não perder este rascunho')
    pg.click('[data-ms="gaveta-produtos"]')
    pg.fill('#ms-prod-busca', 'vestido liso')
    pg.wait_for_timeout(250)
    editor = pg.locator('#ms-prod-lista [data-ms="prod-editar"]').first
    check(editor.count() == 1, 'Disponibilidade aparece no seletor de produtos')
    medida = editor.evaluate('(x)=>{const r=x.getBoundingClientRect();return {w:r.width,h:r.height}}')
    check(medida['h']>=44, 'Alvo de toque com pelo menos 44px', medida)
    check(pg.locator('#ms-prod-lista [data-ms="prod-usar"]').count()>=1, 'Enviar produto preservado')
    pg.screenshot(path=str(EVID / f'escolha-{width}.png'), full_page=False)
    # Cancelar não deve gravar, abrir outra aba ou apagar o rascunho.
    editor.click()
    modal = pg.locator('#ms-edicao-tamanhos')
    modal.wait_for(state='visible')
    modal.get_by_role('button', name='Cancelar').click()
    check(not modal.is_visible(), 'Cancelar fecha a janela sem navegar')
    check(not [x for x in envios_mock if x.get('action') == 'update'],
          'Cancelar não envia alteração ao backend')
    check(pg.locator('#ms-texto').input_value() == 'Não perder este rascunho',
          'Cancelar preserva o rascunho')
    editor.click()
    modal = pg.locator('#ms-edicao-tamanhos')
    modal.wait_for(state='visible')
    check(pg.locator('#ms-texto').input_value() == 'Não perder este rascunho',
          'Rascunho preservado com editor interno aberto')
    check(pg.locator('#ms-prod-busca').input_value() == 'vestido liso',
          'Busca preservada durante a edição')
    check(len(ctx.pages) == 1, 'Não abre nova aba nem sai de Mensagens')
    check(modal.locator('textarea').count()==0, 'Edição rápida não oferece inclusão livre')
    check(modal.get_by_role('button', name='Retirar P', exact=True).count()==1, 'Só tamanhos cadastrados aparecem')
    check(modal.get_by_role('button', name='Retirar GG', exact=True).count()==0, 'Tamanho ausente não pode ser acrescentado')
    modal.get_by_role('button', name='Retirar P', exact=True).click()
    modal.get_by_role('button', name='Retirar Preto', exact=True).click()
    salvar = modal.get_by_role('button', name='Salvar alterações')
    rect = salvar.bounding_box()
    check(rect is not None and rect['x'] >= 0 and rect['x'] + rect['width'] <= width
          and rect['y'] >= 0 and rect['y'] + rect['height'] <= height,
          'Salvar visível na viewport', rect)
    check(modal.locator('.tk-disp-fechar').bounding_box()['width']==44, 'Fechar compacto de 44px')
    check(modal.evaluate('(x)=>x.scrollWidth <= innerWidth'), 'Sem rolagem horizontal')
    if (ROOT/'tests/axe.min.js').exists():
        pg.add_script_tag(path=str(ROOT/'tests/axe.min.js'))
        violations=pg.evaluate("async()=> (await axe.run(document.querySelector('.tk-disp-painel'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations")
        check(not violations, 'Editor sem violações axe WCAG AA',violations)
    pg.screenshot(path=str(EVID / f'correcao-{width}.png'), full_page=False)
    salvar.click()
    pg.wait_for_timeout(1200)
    updates = [x for x in envios_mock if x.get('action') == 'update']
    check(bool(updates), 'Atualização enviada pelo backend autenticado')
    check(updates[-1].get('tamanhos') == 'M, G', 'Retira somente o tamanho esgotado')
    check(updates[-1].get('cores') == 'Bege', 'Retira somente a cor esgotada')
    check(updates[-1].get('id'), 'Mantém o identificador do produto')
    check(not any(k in updates[-1] for k in ('nome','preco','descricao','fotoUrlExistente','fotosGaleriaExistentes','videos')), 'Atualização parcial preserva nome, preço, tecido e mídias no servidor')
    check(not modal.is_visible(), 'Modal fecha após salvar')
    check(pg.locator('#ms-texto').input_value() == 'Não perder este rascunho',
          'Rascunho continua intacto após salvar')
    check(len(ctx.pages) == 1, 'Permanência na mesma aba após salvar')
    check(not errors, 'Sem erros JavaScript', errors)
    ctx.close()

try:
    if 'TK_BASE' not in os.environ:
        server = subprocess.Popen([sys.executable,'-m','http.server','8765','--bind','127.0.0.1'],
                                  cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(args=['--no-sandbox'])
        for w,h,mob in ((320,700,True),(390,844,True),(412,915,True),(1440,900,False)):
            run_case(browser,w,h,mob)
        browser.close()
    print('Jornada de edição rápida concluída em 320×700, 390×844, 412×915, 1440×900.')
finally:
    if server: server.terminate()
