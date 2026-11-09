"""Receber mensagem nova: o balão aparece na conversa aberta SEM esperar a lista de conversas recarregar (servidor da lista lento).
Serviços simulados (nada sai para a rede). Chromium; não é Android real."""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION, PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TK_BASE', 'http://localhost:8773/')
LENTO_MS = 4000
LISTA_LENTA = """(ms)=>{const f=window.fetch;window.__lenta=false;window.fetch=function(u,i){const p=f.apply(this,arguments);
 return window.__lenta&&/\\/msg\\/conversas\\?/.test(String(u))?p.then(r=>new Promise(k=>setTimeout(()=>k(r),ms))):p}}"""
FALHAS = []
def chk(n, c, d=''):
    if c: print('  ✔', n)
    else: FALHAS.append(n); print('  ✘', n, '—', str(d)[:300])

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for w, h in [(390, 844), (1440, 900)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); ctx.add_init_script(SESSION)
        st = install(ctx, perms=PERMS_ALL); s = mock_msg.novo_estado(); st['ig']['msg'] = s
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(1200); pg.evaluate(f"({LISTA_LENTA})({LENTO_MS})")
        pg.evaluate("document.getElementById('btn-abrir-mensagens').click()"); pg.wait_for_selector('#ms-lista .ms-conv')
        pg.locator('#ms-lista .ms-conv').first.click(); pg.wait_for_selector('#ms-fio .ms-bolha'); pg.wait_for_timeout(800)
        cid = int(pg.evaluate("document.querySelector('#ms-lista .ms-conv[aria-current=true]')?.dataset.id||1"))
        conv = next(c for c in s['convs'] if c['id'] == cid)
        # chega uma mensagem do cliente enquanto a lista está lenta
        pg.evaluate("window.__lenta=true")
        s['seq'] += 1
        agora = mock_msg.agora()
        s['msgs'].append({'id': s['seq'], 'conversa_id': cid, 'direcao': 'entrada', 'tipo': 'texto', 'texto': 'chegou agora mesmo', 'enviada_em': agora, 'status': '', 'por': '', 'status_em': agora})
        conv.update(ultima_em=agora, atualizada_em=agora, total=conv['total'] + 1, previa='chegou agora mesmo', ult_dir='entrada')
        pg.evaluate("window.__t0=performance.now();window.dispatchEvent(new Event('focus'))")
        pg.wait_for_function("document.querySelector('#ms-fio')&&document.querySelector('#ms-fio').textContent.includes('chegou agora mesmo')", timeout=LENTO_MS + 6000)
        ms = pg.evaluate("Math.round(performance.now()-window.__t0)")
        chk(f'a mensagem nova apareceu em {ms} ms, com a lista levando {LENTO_MS} ms', ms < LENTO_MS * 0.5, ms)
        chk('sem rolagem lateral', pg.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        chk('sem erros de JavaScript', not erros, erros)
        print(f'  largura {w}: {ms} ms', flush=True)
        ctx.close()
    b.close()
print(f'FALHAS={len(FALHAS)}', FALHAS)
sys.exit(1 if FALHAS else 0)
