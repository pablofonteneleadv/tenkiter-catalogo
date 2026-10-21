"""P-38/39/41/42: duplicação, padrões, confirmação e pendências com backend falso."""
import os
from playwright.sync_api import sync_playwright
from mock import SESSION, install

BASE = os.environ.get('TK_BASE', 'http://localhost:8765/')

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    ctx.add_init_script(SESSION)
    calls = []
    state = install(ctx, log=calls, versao='4.20')
    state['midia']['modo'] = 'ok'
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    page.goto(BASE + 'admin.html')
    page.wait_for_function('typeof produtos !== "undefined" && produtos.length > 0 && generos.length > 0')
    page.evaluate('cancelarDuplicacao(); abrirCadastro_()')
    assert page.input_value('#cores') == 'Consulte cor/estampa disponível'
    assert page.input_value('#tamanhos') == 'Consultar tamanhos disponíveis'
    assert page.evaluate('Array.from(selecionadosGeneros)') == ['Feminino Adulto']
    page.locator('#chips-tamanhos .chip').filter(has_text=__import__('re').compile('^P$')).click()
    assert page.input_value('#tamanhos') == 'P'
    page.locator('#chips-cores .chip').filter(has_text=__import__('re').compile('^Preto$')).click()
    assert page.input_value('#cores') == 'Preto'
    page.evaluate('aplicarPadroesNovo_()')
    assert page.input_value('#cores') == 'Preto'
    assert page.input_value('#tamanhos') == 'P'
    page.locator('#chips-genero .chip').filter(has_text=__import__('re').compile('^Masculino Adulto$')).click()
    assert page.evaluate('Array.from(selecionadosGeneros)') == ['Masculino Adulto']
    page.evaluate('aplicarPadroesNovo_()')
    assert page.evaluate('Array.from(selecionadosGeneros)') == ['Masculino Adulto']
    original = state['produtos'][0]
    page.evaluate('(id) => { window.__rascunhoAtual = 999; duplicarProduto(id); }', original['ID'])
    assert page.input_value('#nome') == original['Nome']
    assert page.input_value('#produto-id') == ''
    assert page.evaluate('fotosItens.length + videosItens.length') == 0
    assert page.evaluate('window.__rascunhoAtual') is None
    assert page.input_value('#cores') == original['Cores']
    assert page.input_value('#tamanhos') == original['Tamanhos']
    page.evaluate('aplicarPadroesNovo_()')
    assert page.input_value('#cores') == original['Cores']
    page.evaluate('(id) => editarProduto(id)', original['ID'])
    assert page.input_value('#produto-id') == original['ID']
    assert page.input_value('#tamanhos') == original['Tamanhos']
    page.evaluate('iniciarVarias_()')
    assert page.input_value('#cores') == 'Consulte cor/estampa disponível'
    assert page.input_value('#tamanhos') == 'Consultar tamanhos disponíveis'
    page.evaluate('envios.push({chave: 1, k: "teste-local", titulo: "Peça de teste", estado: "erro", msg: "Não consegui enviar a foto", dados: {}, etapa: "fila"}); desenharEnvios(); document.getElementById("card-form").open = false')
    assert page.locator('#cad-envios').is_visible()
    assert page.locator('#fila-envios button', has_text='Tentar de novo').is_visible()
    assert 'Não consegui enviar a foto' in page.inner_text('#fila-envios')
    assert page.evaluate('document.getElementById("card-form").contains(document.getElementById("fila-envios"))') is False
    # Apenas sucesso confirmado e sem outra edição em curso devolve o foco ao cadastro.
    page.evaluate('envios.length = 0; conferir_.push({estado:"ok", dados:{}, respSalvo:{}})')
    page.evaluate('fimDaFila_()')
    assert page.evaluate('document.activeElement === document.querySelector("#card-menu-cadastro > summary")')
    assert not errors, errors
    print('P-38/39/41/42: PASS (padrões, escolha explícita, duplicação sem mídia/ID/importação, edição preservada, lote, erro acessível e foco após confirmação).')
    browser.close()
