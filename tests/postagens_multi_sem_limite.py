"""Seleção de peças juntas sem teto artificial; serviços e publicações simulados."""
import os
from pathlib import Path
from mock import install, prods, SESSION, PERMS_ALL
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TK_BASE', 'http://localhost:8765/')
OUT = Path(os.environ.get('TK_EVID', 'tests/saida/pecas-juntas'))
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])
    for width, height in [(390, 844), (412, 915), (1440, 900), (320, 844)]:
        ctx = browser.new_context(viewport={'width': width, 'height': height}, has_touch=True, service_workers='block')
        ctx.add_init_script(SESSION)
        ctx.add_init_script('window.TK_POSTAGENS_POLL_MS=600000;')
        st = install(ctx, perms=PERMS_ALL, versao='4.3')
        st['produtos'][:] = prods(100)
        for q in st['produtos']:
            q.update(Status='Ativo', Estoque='', Fotos_Galeria='', Video_URL='')
        st['midia']['modo'] = 'ok'
        st['ig']['regras'] = True
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE + 'admin.html')
        page.locator('#details-ferramentas > summary').click()
        page.locator('#btn-abrir-postagens').click()
        page.locator('.po-card').first.wait_for()
        # Dez peças: reproduz exatamente o botão desabilitado da reclamação.
        for i in range(10):
            page.locator('.po-card').nth(i).click()
        button = page.locator('[data-a=usarjuntas]')
        button.scroll_into_view_if_needed()
        page.screenshot(path=str(OUT / f'10-pecas-{width}.png'))
        assert button.is_enabled(), '10 peças juntas continuam bloqueadas'
        assert 'máx.' not in button.inner_text()
        if width == 1440:
            button.focus(); page.keyboard.press('Enter')
        else:
            button.tap()
        assert page.locator('.po-multi [data-mx]').count() == 10
        page.locator('#po-previa canvas').nth(9).wait_for()
        assert page.locator('.po-midias .po-m[aria-pressed=true]').count() == 10
        # Confirmar que o pedido simulado inclui TODAS as dez, com seus códigos.
        page.locator('[data-a=enviar]').click()
        page.locator('#po-abas [data-aba=fila][aria-selected=true]').wait_for()
        page.locator('#po-abas [data-aba=nova]').click()
        page.locator('.po-card').first.wait_for()
        chamadas = [c for c in st['ig'].get('post_chamadas', []) if c['path'] == '/post']
        assert len(chamadas) == 1
        posts = chamadas[0]['corpo']['posts']
        assert len(posts) == 10 and len({q['produto'] for q in posts}) == 10
        enviados_antes = len(st['midia']['envios'])
        # Selecionar a lista completa (100), sem cortar depois da oitava peça.
        page.locator('[data-a=pecas-todas]').click()
        page.locator('[data-a=usarjuntas]').click()
        assert page.locator('.po-multi [data-mx]').count() == 100, 'houve corte da lista'
        assert page.locator('.po-midias .po-m[aria-pressed=true]').count() == 100
        page.wait_for_function("document.querySelectorAll('#po-previa canvas').length===10")
        assert '1–10 de 100' in page.inner_text('#po-previa-paginas')
        next_button = page.locator('[data-a=previa-proxima]')
        for _ in range(9):
            next_button.click()
        page.wait_for_function("document.querySelector('#po-previa canvas')?._m?.peca != null")
        assert '91–100 de 100' in page.inner_text('#po-previa-paginas')
        assert next_button.is_disabled()
        assert page.locator('#po-previa canvas').count() == 10
        codes = page.eval_on_selector_all('#po-previa canvas', 'l=>l.map(c=>c._m.peca.Codigo)')
        assert len(set(codes)) == 10
        assert all(code in page.input_value('#po-leg') for code in codes)
        page.locator('#po-previa-paginas').scroll_into_view_if_needed()
        page.screenshot(path=str(OUT / f'100-pecas-previa-{width}.png'))
        # O servidor aceita até 60 originais por requisição: avisar antes de subir arquivos,
        # sem perder as cem peças. Nenhum serviço real é chamado.
        page.locator('[data-a=enviar]').click()
        assert len(st['midia']['envios']) == enviados_antes
        assert len([c for c in st['ig'].get('post_chamadas', []) if c['path'] == '/post']) == 1
        assert page.locator('.po-multi [data-mx]').count() == 100
        assert '60' in page.inner_text('#overlay-postagens')
        # Alvos e conteúdo cabem inclusive a 320 CSS px; axe usa o mesmo mock da suíte.
        metrics = page.eval_on_selector_all('#po-previa-paginas button', 'l=>l.map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height}})')
        assert all(m['w'] >= 44 and m['h'] >= 44 for m in metrics), metrics
        page.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
        violations = page.evaluate("async()=> (await axe.run(document.querySelector('#overlay-postagens'), {runOnly:{type:'tag', values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id)")
        assert not violations, violations
        assert not errors, errors
        ctx.close()
        print(f'PASS {width}: 10 e 100 peças sem corte; todas as prévias; limite de envio sem perda; toque/teclado e axe')
    browser.close()
print('FALHAS=0')
