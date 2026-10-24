#!/usr/bin/env python3
"""Cache-busting dos assets (item 2 do plano de front).

O index.html referenciava catalogo.js / vitrine.js / vitrine.css sem ?v=.
Navegador e Cloudflare guardavam a versao antiga, entao um deploy novo nao
chegava em quem ja tinha visitado o site - o cliente via a barra de navegacao
nova com o JS velho nos cartoes. Foi o que aconteceu no print de 23/10.

Roda no build, DEPOIS do version.json, para o ?v= ser sempre o VERSION deste
commit. Assim o index.html do repositorio fica limpo (sem numero de versao
escrito a mao) e o cache-busting tem uma fonte da verdade so.
Idempotente: rodar duas vezes nao duplica o ?v= nem a tag do script.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
V = (RAIZ / "VERSION").read_text(encoding="utf-8").strip() or "0.0.0"

ASSETS = ["catalogo.css", "vitrine.css", "common.js", "catalogo.js",
          "nav.js", "vitrine.js", "a11y.js", "vitrine-v71.js"]

TAG = ('<!-- v7.1: menu, pesquisa e filtros (itens 1,3,4,5,6,7,8). Camada aditiva,\n'
       '     carregada por ultimo: so age no catalogo e nao reescreve regra existente. -->\n'
       '<script src="vitrine-v71.js?v=%s"></script>') % V


def aplicar(html):
    for nome in ASSETS:
        html = re.sub(r'((?:src|href)="%s)(?:\?v=[^"]*)?"' % re.escape(nome),
                      lambda m: m.group(1) + "?v=" + V + '"', html)
    if "vitrine-v71.js" not in html:
        m = re.search(r'<script src="a11y\.js\?v=[^"]*"></script>', html)
        if not m:
            print("ERRO: ancora a11y.js nao encontrada no index.html")
            return html
        html = html[:m.end()] + "\n" + TAG + html[m.end():]
    else:
        html = re.sub(r'(<script src="vitrine-v71\.js)(?:\?v=[^"]*)?"',
                      lambda m: m.group(1) + "?v=" + V + '"', html)
    return html


alvo = RAIZ / "index.html"
orig = alvo.read_text(encoding="utf-8")
novo = aplicar(orig)
if novo == orig:
    print("cache_bust: index.html ja estava em v=" + V)
else:
    alvo.write_text(novo, encoding="utf-8")
    print("cache_bust: index.html atualizado para v=" + V)
