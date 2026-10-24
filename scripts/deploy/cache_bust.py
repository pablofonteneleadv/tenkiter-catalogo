#!/usr/bin/env python3
"""Cache-busting dos assets do catalogo (item 2 do plano de front).

Por que existe: o index.html referenciava catalogo.js / vitrine.js / vitrine.css
sem `?v=`. O navegador (e o Cloudflare) guardavam a versao antiga, entao um
deploy novo nao chegava para quem ja tinha visitado o site -- o cliente via a
barra de navegacao nova com o JS velho nos cartoes. Foi exatamente o que
aconteceu no print enviado em 23/10.

Por que no build e nao no HTML: assim o index.html do repositorio fica limpo
(sem numero de versao escrito a mao, que envelhece e vira conflito de merge) e
o `?v=` passa a ser sempre o VERSION do commit que esta sendo publicado. Uma
fonte da verdade so.

Roda como parte do buildCommand do Render, depois de build_version.sh.
Idempotente: rodar duas vezes nao duplica o `?v=` nem a tag do script.
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
VERSAO = (RAIZ / "VERSION").read_text(encoding="utf-8").strip() or "0.0.0"

# Assets que mudam a cada release. Os que nao mudam (icones, fontes) ficam fora.
ASSETS = [
    "catalogo.css",
    "vitrine.css",
    "common.js",
    "catalogo.js",
    "nav.js",
    "vitrine.js",
    "a11y.js",
    "vitrine-v71.js",
]

# Camada v7.1 (menu, pesquisa e filtros). Entra por ultimo, de proposito:
# depende de catalogo.js (funcoes que ela envolve) e de nav.js (a barra
# inferior que ela assume). Injetada aqui para o index.html seguir limpo.
SCRIPT_V71 = (
    "<!-- v7.1: menu, pesquisa e filtros (itens 1,3,4,5,6,7,8). Camada aditiva,\n"
    "     carregada por ultimo: so age no catalogo e nao reescreve regra existente. -->\n"
    '<script src="vitrine-v71.js?v=__V__"></script>'
)


def aplicar(html: str) -> str:
    # 1. `?v=` em cada asset, sem duplicar se ja houver.
    for nome in ASSETS:
        padrao = re.compile(
            r'((?:src|href)="' + re.escape(nome) + r')(?:\?v=[^"]*)?(")'
        )
        html = padrao.sub(lambda m: f"{m.group(1)}?v={VERSAO}{m.group(2)}", html)

    # 2. A tag da camada v7.1, logo depois de a11y.js (que e o ultimo script
    #    da vitrine). Se ja estiver la, so atualiza o `?v=`.
    if "vitrine-v71.js" not in html:
        ancora = re.search(r'<script src="a11y\.js\?v=[^"]*"></script>', html)
        if not ancora:
            print("ERRO: ancora a11y.js nao encontrada no index.html", file=sys.stderr)
            return html
        html = html[: ancora.end()] + "\n" + SCRIPT_V71.replace("__V__", VERSAO) + html[ancora.end():]
    else:
        html = re.sub(
            r'(<script src="vitrine-v71\.js)(?:\?v=[^"]*)?(")',
            lambda m: f"{m.group(1)}?v={VERSAO}{m.group(2)}",
            html,
        )
    return html


def main() -> int:
    alvo = RAIZ / "index.html"
    original = alvo.read_text(encoding="utf-8")
    novo = applicar(original)
    if novo == original:
        print(f"cache_bust: index.html ja estava em v={VERSAO}")
        return 0
    alvo.write_text(novo, encoding="utf-8")
    print(f"cache_bust: index.html atualizado para v={VERSAO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
