from mensagens_filtros import aplicar, valor
"""Abas do painel de Mensagens, escopo Todos/Meus, reload, filtros antigos e axe.

Reescrito na v7.40.35: a fila deixou de ser um par de chips em #ms-filtros e virou
ABA (#ms-abas). O roteiro continua sendo o mesmo que o #305 pedia — trocar de fila,
alternar Todos/Meus, sobreviver ao reload, aplicar um filtro antigo, caber em 320 px
com texto a 100% e 130%, e passar no axe sem violações.

Uso: TK_BASE=http://localhost:8765/ python3 tests/filas_atendimento_ui.py
"""
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

from mock import install, SESSION, PERMS_ALL
import mock_msg

BASE = os.getenv('TK_BASE', 'http://localhost:8783/')
OUT = Path(os.getenv('TK_EVID', str(Path(__file__).parent / 'evidencias_edicao' / 'filas')))
OUT.mkdir(parents=True, exist_ok=True)

TELAS = [(320, 700), (390, 844), (412, 915), (1440, 900), (390, 470)]

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for w, h in TELAS:
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 600,
                            has_touch=w < 600, service_workers='block')
        ctx.add_init_script(SESSION)
        st = install(ctx, perms=PERMS_ALL, versao='7.40.35')
        s = st['ig']['msg'] = mock_msg.novo_estado()
        # Duas conversas atendidas (1 e 2), as demais seguem o padrão do mock.
        for c in s['convs']:
            c['atendido_em'] = '2026-10-30T09:00:00.000Z' if c['id'] in (1, 2) else ''
            c['dono'] = 'Pablo' if c['id'] == 1 else ('Outra pessoa' if c['id'] == 2 else '')
        s['saude'] = {'alerta': True, 'tipo': 'entrada', 'pendentes': 2, 'desde': mock_msg.iso(3)}

        pg = ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(BASE + 'admin.html?app=mensagens')
        pg.wait_for_selector('#ms-abas .ms-aba[data-aba="atendimento"]')

        # Em atendimento mostra quem foi atendido; a conversa 4 (sem atendimento) não aparece.
        pg.wait_for_selector('#ms-lista .ms-conv[data-id="1"]')
        pg.wait_for_timeout(600)          # deixa a lista/saúde assentarem antes de medir
        assert pg.locator('#ms-lista .ms-conv[data-id="4"]').count() == 0, 'Em atendimento não deve mostrar pendente'

        for scale in [100, 130]:
            pg.evaluate('(x)=>document.documentElement.style.fontSize=x+"%"', scale)
            # a navegação de baixo continua inteira na tela
            navd = pg.locator('#ms-nav').evaluate('e=>{const r=e.getBoundingClientRect();return [Math.round(r.bottom),innerHeight,document.documentElement.scrollHeight,innerWidth]}')
            assert navd[0] <= navd[1] + 1, ('nav vazando', w, h, scale, navd)
            assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'scroll horizontal'
            # toda aba é alvo de toque de 44px
            for aba in ['atendimento', 'pendentes', 'todos', 'encerrados']:
                pg.wait_for_function('(aba)=>{const e=document.querySelector("#ms-abas [data-aba="+aba+"]");return e&&e.getBoundingClientRect().height>=44}',arg=aba)
                r = pg.locator('#ms-abas .ms-aba[data-aba="%s"]' % aba).bounding_box()
                assert r and r['height'] >= 44, ('aba curta', aba, r)
            pg.screenshot(path=str(OUT / f'atendimento-{w}-{h}-{scale}.png'))

        # escopo Todos -> Meus
        aplicar(pg,escopo='todos')
        pg.wait_for_function('document.querySelectorAll("#ms-lista .ms-conv").length>=2')
        n_todos = pg.locator('#ms-lista .ms-conv').count()
        aplicar(pg,escopo='meus')
        pg.wait_for_function('document.querySelectorAll("#ms-lista .ms-conv").length<%d' % n_todos)
        assert pg.locator('#ms-lista .ms-conv[data-id="1"]').count() == 1, 'Só meus deve manter a minha'
        assert pg.locator('#ms-lista .ms-conv[data-id="2"]').count() == 0, 'Só meus deve esconder a de outra pessoa'

        for scale in [100, 130]:
            pg.evaluate('(x)=>document.documentElement.style.fontSize=x+"%"', scale)
            assert pg.locator('#ms-nav').evaluate('e=>e.getBoundingClientRect().bottom<=innerHeight+1'), 'nav vazando (meus)'
            # o seletor de escopo cabe na tela e é alvo de toque
            pg.click('#ms-btn-filtros')
            assert pg.locator('[name=ms-ft-escopo]').evaluate(
                'e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.right<=innerWidth}'), 'escopo fora'
            pg.keyboard.press('Escape');pg.wait_for_selector('#ms-gaveta',state='detached')
            pg.screenshot(path=str(OUT / f'meus-{w}-{h}-{scale}.png'))

        # Pendentes: a conversa que não foi atendida está aqui
        pg.click('#ms-abas .ms-aba[data-aba="pendentes"]')
        pg.wait_for_selector('#ms-lista .ms-conv[data-id="4"]')
        pg.screenshot(path=str(OUT / f'pendentes-{w}-{h}.png'))

        # Todos: as não encerradas, dos dois tipos
        pg.click('#ms-abas .ms-aba[data-aba="todos"]')
        pg.wait_for_timeout(700)

        # reload: o painel volta em Em atendimento, com escopo Todos
        pg.reload()
        pg.wait_for_selector('#ms-abas .ms-aba[data-aba="atendimento"]')
        assert pg.locator('#ms-abas .ms-aba[data-aba="atendimento"]').get_attribute('aria-selected') == 'true', \
            'ao reabrir, começa em Em atendimento'
        assert valor(pg,'escopo') == 'todos', 'escopo volta a Todos'

        # filtro antigo continua funcionando (Não lidas)
        pg.click('[data-ms=filtros-abrir]')
        pg.select_option('[name=ms-ft-fila]', 'nao_lidas')
        pg.click('[data-ms=filtros-aplicar]')
        pg.wait_for_timeout(900)
        assert pg.locator('#ms-lista .ms-conv').count() >= 1, 'filtro Não lidas não pode esvaziar a lista'

        # axe
        axe = Path(__file__).with_name('axe.min.js')
        if axe.exists():
            pg.add_script_tag(path=str(axe))
            vs = pg.evaluate("""async () => (await axe.run(document.getElementById('overlay-mensagens'),
                {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations""")
            assert not vs, vs

        assert not errors, errors
        ctx.close()
    b.close()

print('Abas: Em atendimento / Pendentes / Todos / Encerrados, Todos-Meuss, reload, filtros, '
      '5 telas a 100/130% e axe aprovados.')
