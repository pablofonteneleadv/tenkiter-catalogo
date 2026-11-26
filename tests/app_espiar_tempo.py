"""Tempo do toque em "Espiar" na notificação até a conversa aparecer, com o app recém-aberto (WebView carregando).
Pedido do Pablo (26/11/2026): "quando aperta espiar demora muito para entrar". Serviços SIMULADOS; o servidor de acesso
responde em 0,8 s e a conversa em 0,3 s. Mede funcionária (direitos vêm do servidor) e repetição com direitos já guardados."""
import os, sys, json, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION
import mock_msg
from playwright.sync_api import sync_playwright
BASE = os.environ.get('TK_BASE', 'http://127.0.0.1:8777/')
LIMITE_MS = float(os.environ.get("TK_ESPIAR_LIMITE_MS", "4000"))   # teto folgado p/ CI lento (aqui ~0,4 s); trava só regressão grosseira
PERMS = ["catalogo_admin", "painel_simples"]
dire = {k: True for k in ['acessar', 'responder', 'produtos', 'arquivos', 'contatos', 'etiquetas', 'notas', 'agenda', 'respostas']}
resultados = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); c.add_init_script(SESSION)
    st = install(c, perms=PERMS, versao='3.4'); st['ig']['msg'] = mock_msg.novo_estado()
    def acesso(route):
        time.sleep(0.8); route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'ok': True, 'direitos': dire}))
    c.route('**/msg/acesso', acesso)
    for rodada in ('primeira vez', 'com direitos guardados'):
        pg = c.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(BASE + 'admin.html?app=mensagens', wait_until='domcontentloaded')
        t0 = time.time()
        pg.wait_for_function("!!window.TKMobileOpenConversation", timeout=20000)
        pg.evaluate("window.TKMobileOpenConversation(1,true,'m-%d')" % len(resultados))
        pg.wait_for_function("(document.getElementById('ms-app')||{dataset:{}}).dataset.vista==='conversa'", timeout=20000)
        ms = (time.time() - t0) * 1000
        resultados[rodada] = round(ms)
        print('  %s: conversa aberta em %d ms%s' % (rodada, ms, (' erros ' + str(erros)) if erros else ''))
        pg.close()
    b.close()
pior = max(resultados.values())
if LIMITE_MS and pior > LIMITE_MS:
    print('FAIL Espiar acima de %d ms: %s' % (LIMITE_MS, resultados)); sys.exit(1)
print('PASS Espiar: %s' % resultados)
