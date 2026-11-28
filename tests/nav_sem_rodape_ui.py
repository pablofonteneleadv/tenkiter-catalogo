"""Navegação: setores sem rodapé; catálogo com ações de cliente para todos.
Páginas reais, APIs simuladas. Não envia mensagens nem usa dados de produção.
"""
import json
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))
from mock import install, SESSION, PERMS_ALL

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = None
BASE = os.environ.get('TK_BASE')
if not BASE:
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    BASE = f'http://127.0.0.1:{server.server_port}/'

ok, bad = [], []
def chk(name, cond):
    (ok if cond else bad).append(name)
    print(('OK ' if cond else 'FALHA ') + name, flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for width, height in ((320, 740), (390, 844), (412, 915), (1440, 900)):
        for role, perms in (('visitante', []), ('catalogo1', ['catalogo_admin', 'catalogo_cadastrar', 'painel_simples', 'portal']), ('admin', PERMS_ALL)):
            ctx = browser.new_context(viewport={'width': width, 'height': height}, service_workers='block')
            # O fallback bloqueia serviços não simulados; as rotas do mock têm precedência.
            ctx.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in ('127.0.0.1', 'localhost') else route.abort())
            install(ctx, perms=perms, versao='4.32')
            if role != 'visitante':
                ctx.add_init_script(SESSION + "localStorage.setItem('tm_nav_perms',JSON.stringify({w:'88999999999',p:" + json.dumps(perms) + ",t:Date.now()}));")
            if role == 'catalogo1':
                ctx.add_init_script("window.TKAndroid={abrirModulo:()=>true};")
            page = ctx.new_page()
            page.on('pageerror', lambda e: print('ERRO JS', e, flush=True))
            page.goto(BASE + 'index.html', wait_until='domcontentloaded')
            page.wait_for_selector('.tk-nav [data-nav=busca], .tk-nav [data-nav=buscar]', state='attached' if width >= 1024 else 'visible')
            ids = page.locator('.tk-nav a').evaluate_all('(els)=>els.map(e=>e.dataset.nav)')
            ids = [{'inicio': 'catalogo', 'buscar': 'busca'}.get(i, i) for i in ids]
            chk(f'{width}/{role}: catálogo oferece as cinco ações do cliente', ids == ['catalogo', 'busca', 'selecao', 'favoritos', 'atendente'])
            chk(f'{width}/{role}: nenhum atalho de setor no rodapé', page.locator('.tk-nav [data-nav=gestao],.tk-nav [data-nav=treinamentos],.tk-nav [data-nav=rh]').count() == 0)
            chk(f'{width}/{role}: alvos visíveis têm 44 px', page.locator('.tk-nav a').evaluate_all('(els)=>els.every(e=>{const r=e.getBoundingClientRect();return (r.width===0&&r.height===0)||r.width>=44&&r.height>=44})'))
            chk(f'{width}/{role}: sem rolagem horizontal', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            chk(f'{width}/{role}: ferramenta de cadastro de produto permanece na página', page.locator('#btn-nova-peca[href="admin.html?novo=1"]').count() == 1)
            # A infraestrutura de navegação não toca a permissão do botão de produto.
            page.evaluate("window.TenkiterNav.setPerms(['gerir_acessos','catalogo_admin']);window.TenkiterNav.redesenhar()")
            chk(f'{width}/{role}: mudar permissões não recoloca setores', page.locator('.tk-nav a').count() == 5 and page.locator('[data-nav=gestao]').count() == 0)
            for target in ('equipe.html', 'admin.html', 'treinamentos.html', 'curriculos.html'):
                page.goto(BASE + target, wait_until='domcontentloaded')
                page.wait_for_function("!!window.TenkiterNav && document.body.classList.contains('tk-sem-nav')")
                chk(f'{width}/{role}/{target}: sem barra e sem reserva inferior', page.locator('.tk-nav').count() == 0 and page.evaluate('parseFloat(getComputedStyle(document.body).paddingBottom)<20'))
                page.evaluate("TenkiterNav.setPerms(['gerir_acessos','catalogo_admin']);TenkiterNav.redesenhar()")
                chk(f'{width}/{role}/{target}: API mantida sem recriar rodapé', page.locator('.tk-nav').count() == 0)
            ctx.close()
    browser.close()
if server: server.shutdown()
print(f'{len(ok)} ok, {len(bad)} falhas: {bad}')
sys.exit(1 if bad else 0)
