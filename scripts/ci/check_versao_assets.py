#!/usr/bin/env python3
"""Exige que todo CSS/JS alterado na PR tenha o `?v=` trocado nas páginas que o carregam.

Por quê: Render serve com `s-maxage=300` e o navegador/WebView pode guardar o arquivo. Se o arquivo muda e o
`?v=` continua igual, o celular pode montar a página com HTML novo + CSS velho (ou o contrário) e a tela abre
errada até atualizar. Trocar o `?v=` força todos a baixar a versão certa.

Uso: python3 scripts/ci/check_versao_assets.py [base]   (base padrão: origin/main)
"""
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REF = re.compile(r'''["'(]([A-Za-z0-9_./-]+\.(?:css|js))\?v=([0-9A-Za-z._-]+)''')


def git(*args):
    r = subprocess.run(["git", *args], cwd=RAIZ, capture_output=True, text=True)
    return r.returncode, r.stdout


def refs(texto):
    return {(m.group(1), m.group(2)) for m in REF.finditer(texto)}


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    rc, mb = git("merge-base", base, "HEAD")
    if rc != 0:
        print("check_versao_assets: base %s indisponível; verificação pulada." % base)
        return 0
    mb = mb.strip()
    rc, lista = git("diff", "--name-only", mb, "HEAD")
    mudados = {p.strip() for p in lista.splitlines() if p.strip()}
    assets = {p for p in mudados if p.endswith((".css", ".js")) and "/" not in p}
    if not assets:
        print("check_versao_assets: nenhum CSS/JS da raiz alterado.")
        return 0
    paginas = [p for p in os.listdir(RAIZ) if p.endswith(".html")]
    erros = []
    for pag in sorted(paginas):
        with open(os.path.join(RAIZ, pag), encoding="utf-8") as f:
            novo = refs(f.read())
        rc, antigo_txt = git("show", "%s:%s" % (mb, pag))
        antigo = refs(antigo_txt) if rc == 0 else set()
        for nome, ver in sorted(novo):
            if nome in assets and (nome, ver) in antigo:
                erros.append("%s referencia %s?v=%s, mas %s mudou nesta PR: troque o ?v=" % (pag, nome, ver, nome))
    if erros:
        print("check_versao_assets: FALHOU")
        for e in erros:
            print("  -", e)
        return 1
    print("check_versao_assets: OK (%d arquivo(s) alterado(s), todos com ?v= novo)." % len(assets))
    return 0


if __name__ == "__main__":
    sys.exit(main())
