#!/usr/bin/env python3
"""Cache-busting dos assets + CSS da camada v7.1 no <head> (itens 2 e 3).

Duas coisas, as duas no build:

1. ?v= nos assets. O index.html referenciava catalogo.js / vitrine.js /
   vitrine.css sem ?v=. Navegador e Cloudflare guardavam a versao antiga,
   entao um deploy novo nao chegava em quem ja tinha visitado o site - o
   cliente via a barra de navegacao nova com o JS velho nos cartoes. Foi o
   que aconteceu no print de 23/10.

2. O CSS da camada v7.1 sai do vitrine-v71.js e vira vitrine-v71.css,
   carregado no <head>. Injetado por JS no fim do <body>, ele chegava
   DEPOIS do primeiro paint: a pagina pintava com as faixas abertas e o
   recolhimento virava um salto de layout (CLS 0,17 medido, contra 0,05 de
   linha de base). No <head> ele chega antes do paint (CLS 0,056).

O vitrine-v71.js continua sendo a fonte da verdade do CSS; o .css e gerado.
Idempotente: rodar duas vezes nao duplica o ?v=, a tag do script nem o link.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
V = (RAIZ / "VERSION").read_text(encoding="utf-8").strip() or "0.0.0"

ASSETS = ["catalogo.css", "vitrine.css", "vitrine-v71.css", "common.js",
          "catalogo.js", "nav.js", "vitrine.js", "a11y.js", "vitrine-v71.js"]

TAG_JS = ('<!-- v7.1: menu, pesquisa e filtros (itens 1,3,4,5,6,7,8). Camada aditiva,\n'
          '     carregada por ultimo: so age no catalogo e nao reescreve regra existente. -->\n'
          '<script src="vitrine-v71.js?v=%s"></script>') % V

TAG_CSS = '<link rel="stylesheet" href="vitrine-v71.css?v=%s">' % V


def extrair_css():
    """Le o CSS de dentro do vitrine-v71.js (fonte da verdade) e grava o .css."""
    js = (RAIZ / "vitrine-v71.js").read_text(encoding="utf-8")
    m = re.search(r"const CSS = `(.*?)`;", js, re.S)
    if not m:
        print("ERRO: bloco 'const CSS = `...`' nao encontrado em vitrine-v71.js")
        return False
    css = m.group(1).strip()
    # O CSS vive dentro de um template literal JS, onde \\ vira \. Lendo o
    # texto CRU do arquivo, os escapes vem dobrados ("\\25BE"); desdobra para
    # o CSS receber "\25BE", que e o escape de caractere do proprio CSS.
    css = css.replace("\\\\", "\\")
    (RAIZ / "vitrine-v71.css").write_text(css + "\n", encoding="utf-8")
    print("vitrine-v71.css gerado a partir de vitrine-v71.js")
    return True


def aplicar(html):
    for nome in ASSETS:
        html = re.sub(r'((?:src|href)="%s)(?:\?v=[^"]*)?"' % re.escape(nome),
                      lambda m: m.group(1) + "?v=" + V + '"', html)

    # <link> do CSS v7.1 no <head>, logo depois do vitrine.css.
    if "vitrine-v71.css" not in html:
        m = re.search(r'<link rel="stylesheet" href="vitrine\.css\?v=[^"]*">', html)
        if not m:
            print("ERRO: ancora vitrine.css nao encontrada no index.html")
            return html
        html = html[:m.end()] + "\n" + TAG_CSS + html[m.end():]

    # <script> da camada v7.1, logo depois do a11y.js.
    if "vitrine-v71.js" not in html:
        m = re.search(r'<script src="a11y\.js\?v=[^"]*"></script>', html)
        if not m:
            print("ERRO: ancora a11y.js nao encontrada no index.html")
            return html
        html = html[:m.end()] + "\n" + TAG_JS + html[m.end():]
    return html


if not extrair_css():
    raise SystemExit(1)

alvo = RAIZ / "index.html"
orig = alvo.read_text(encoding="utf-8")
novo = aplicar(orig)
if novo == orig:
    print("cache_bust: index.html ja estava em v=" + V)
else:
    alvo.write_text(novo, encoding="utf-8")
    print("cache_bust: index.html atualizado para v=" + V)
