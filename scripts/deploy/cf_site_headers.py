"""Gera .public-site/_headers para o site na Cloudflare com as MESMAS regras que o Render recebe (render_headers.py)."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_headers import HEADERS  # noqa: E402  (fonte única das regras)

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
