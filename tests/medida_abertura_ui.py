"""7.96.14 — Fase 0 do app 2.6: cada área manda, depois de abrir, uma medida anônima do tempo de abertura (/app/medida).
Só com a equipe logada; o catálogo público (cliente sem login) não manda nada; a medida não leva WhatsApp nem nome no corpo.
Serviços SIMULADOS (mock.py)."""
import os, sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION, PERMS_ALL
from playwright.sync_api import sync_playwright
BASE = os.environ.get('TK_BASE', 'http://127.0.0.1:8777/')
OK = []; BAD = []
def chk(n, c, e=''):
    (OK if c else BAD).append(n); print(('  ✔ ' if c else '  ✘ ') + n + ('' if c else ' — ' + str(e)[:300]))
CASOS = [('admin.html?app=mensagens', 'mensagens'), ('admin.html', 'gestao'), ('admin.html?abrir=postagens', 'postagens'),
         ('esteira.html', 'esteira'), ('treinamentos.html?painel=rh', 'rh'), ('curriculos.html', 'curriculos')]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for pagina, esperado in CASOS:
        c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, service_workers='block'); c.add_init_script(SESSION)
        install(c, perms=PERMS_ALL, versao='3.4')
        enviados = []
        def medida(route):
            enviados.append({'corpo': json.loads(route.request.post_data or '{}'), 'h': route.request.headers})
            route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"ok":true}')
        c.route('**/app/medida', medida)
        pg = c.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(BASE + pagina); pg.wait_for_timeout(6500)
        corpo = enviados[0]['corpo'] if enviados else {}
        chk('%s manda 1 medida com área "%s"' % (pagina, esperado), len(enviados) == 1 and corpo.get('area') == esperado, [x['corpo'] for x in enviados])
        if enviados:
            texto = json.dumps(corpo)
            chk('%s: corpo sem WhatsApp nem sessão, tempos inteiros e via navegador' % pagina,
                'tk2.' not in texto and 'tk3.' not in texto and 'sessao' not in corpo and 'whats' not in corpo and isinstance(corpo.get('dom_ms'), int) and corpo.get('dom_ms') > 0 and corpo.get('via') == 'navegador', corpo)
        chk('%s: sem erro de JavaScript' % pagina, not erros, erros)
        c.close()
    print('== Catálogo público sem login ==')
    c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, service_workers='block')
    install(c, perms=PERMS_ALL, versao='3.4')
    enviados = []
    c.route('**/app/medida', lambda r: (enviados.append(1), r.fulfill(status=200, body='{"ok":true}')))
    pg = c.new_page(); pg.goto(BASE + 'index.html'); pg.wait_for_timeout(6500)
    chk('cliente sem login: nenhuma medida enviada', not enviados, enviados)
    c.close(); b.close()
print('OK=%d FALHAS=%d %s' % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
