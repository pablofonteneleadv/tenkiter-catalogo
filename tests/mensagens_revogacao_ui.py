"""Revogação: a recusa elimina conversas visíveis e cache; nenhum serviço real."""
import os, sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION, PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TK_BASE', 'http://127.0.0.1:8777/')
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for mode in ('?app=mensagens', ''):
        c = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
        c.add_init_script(SESSION)
        st = install(c, perms=PERMS_ALL, versao='3.4')
        st['ig']['msg'] = mock_msg.novo_estado()
        pg = c.new_page()
        pg.on('pageerror', lambda e: print('ERRO JS', e, flush=True))
        pg.goto(BASE + 'admin.html' + mode)
        if not mode:
            pg.locator('#details-ferramentas > summary').click()
            pg.locator('#btn-abrir-mensagens').click()
        try:
            pg.wait_for_selector('.ms-conv')
        except Exception:
            print(pg.locator('body').inner_text()[-2200:], flush=True)
            print(pg.evaluate("({pode:TKMensagensAcessos.pode('acessar'),confirmado:TKMensagensAcessos.conferido(),appHidden:document.getElementById('ms-app')?.hidden})"), flush=True)
            raise
        pg.locator('.ms-conv').first.click()
        pg.wait_for_selector('#ms-texto')
        pg.route('**/msg/acesso', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'permitido': False, 'direitos': {'acessar': False}})))
        pg.evaluate('TKMensagensAcessos.atualizar()')
        pg.wait_for_function("!TKMensagensAcessos.pode('acessar')")
        assert pg.locator('.ms-conv').count() == 0, 'Lista antiga continuou no DOM'
        assert pg.locator('#ms-conversa').inner_text() == '', 'Conversa antiga continuou no DOM'
        assert pg.locator('#btn-abrir-mensagens').is_hidden()
        assert pg.evaluate("localStorage.getItem('tk_msg_recentes_v1')") is None
        assert not pg.evaluate("TKMensagensAcessos.pode('responder')")
        pg.wait_for_timeout(800)
        assert pg.locator('.ms-conv').count() == 0, 'Resposta atrasada repintou lista'
        c.close()
        print('OK revogação sem conteúdo', mode or 'web')
    b.close()
