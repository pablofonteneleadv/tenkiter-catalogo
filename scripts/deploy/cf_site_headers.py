"""Gera .public-site/_headers do site na Cloudflare (fonte única das regras de cabeçalho do site; o Render foi retirado em 26/11/2026)."""
import os
from pathlib import Path

HEADERS = [
    {'path': '/*', 'name': 'X-Content-Type-Options', 'value': 'nosniff'},
    {'path': '/*', 'name': 'X-Frame-Options', 'value': 'SAMEORIGIN'},
    {'path': '/*', 'name': 'Referrer-Policy', 'value': 'strict-origin-when-cross-origin'},
    {'path': '/*', 'name': 'Strict-Transport-Security', 'value': 'max-age=31536000'},
    {'path': '/version.json', 'name': 'Cache-Control', 'value': 'no-store'},
    {'path': '/android/latest.json', 'name': 'Cache-Control', 'value': 'no-store, max-age=0'},
]

RAIZ = Path(os.environ.get('TK_BUILD_ROOT') or Path(__file__).resolve().parents[2] / '.public-site')


def gerar():
    por_caminho = {}
    for h in HEADERS:
        por_caminho.setdefault(h['path'], []).append((h['name'], h['value']))
    linhas = []
    for caminho, regras in por_caminho.items():
        linhas.append(caminho)
        linhas.extend('  %s: %s' % (n, v) for n, v in regras)
    (RAIZ / '_headers').write_text('\n'.join(linhas) + '\n', encoding='utf-8')
    return len(HEADERS)


if __name__ == '__main__':
    print('_headers gerado com %d regras em %s' % (gerar(), RAIZ))
