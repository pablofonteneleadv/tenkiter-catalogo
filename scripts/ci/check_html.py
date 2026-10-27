#!/usr/bin/env python3
"""Valida a estrutura das páginas HTML do site.

Checa, para cada .html versionado:
  1. tags de bloco balanceadas (div, section, main, header, footer, nav, form, table, ul, ol, li, p, span, button, a, script, style, template, select, label, article, aside);
  2. nenhum <script> aberto sem fechar;
  3. <meta charset> e <meta name="viewport"> presentes;
  4. nenhum marcador de conflito de merge (<<<<<<<, =======, >>>>>>>).

Sai com código 1 se qualquer página falhar.
"""
import os
import re
import sys
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TAGS = [
    "div", "section", "main", "header", "footer", "nav", "form", "table",
    "ul", "ol", "li", "p", "span", "button", "a", "script", "style",
    "template", "select", "label", "article", "aside", "textarea", "svg",
]
VAZIAS = {"br", "hr", "img", "input", "meta", "link", "source", "track", "area", "col", "embed", "wbr"}

CONFLITO = re.compile(r"^(<{7}|={7}|>{7})", re.M)


def paginas():
    # Relatórios de build Android são ignorados pelo Git, não páginas do site.
    try:
        nomes = subprocess.check_output(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.html"],
            cwd=RAIZ, stderr=subprocess.DEVNULL,
        )
        for nome in sorted(set(nomes.split(b"\0")) - {b""}):
            yield os.path.join(RAIZ, os.fsdecode(nome))
        return
    except (OSError, subprocess.CalledProcessError):
        pass  # também funciona quando executado fora de um checkout Git
    for base, dirs, arquivos in os.walk(RAIZ):
        dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "__pycache__"}]
        for nome in sorted(arquivos):
            if nome.endswith(".html"):
                yield os.path.join(base, nome)


def checar(caminho):
    rel = os.path.relpath(caminho, RAIZ)
    texto = open(caminho, encoding="utf-8", errors="ignore").read()
    problemas = []

    if CONFLITO.search(texto):
        problemas.append("marcador de conflito de merge no arquivo")

    if not re.search(r"<meta[^>]+charset", texto, re.I):
        problemas.append("sem <meta charset>")
    if not re.search(r'<meta[^>]+name=["\']viewport["\']', texto, re.I):
        problemas.append("sem <meta name=\"viewport\">")

    # Remove comentários HTML, blocos <script> e <style> antes de contar as tags:
    # dentro deles há strings com "<ul>", "</div>" etc. que não são marcação real.
    limpo = re.sub(r"<!--.*?-->", "", texto, flags=re.S)
    limpo = re.sub(r"<script\b[^>]*>.*?</script\s*>", "", limpo, flags=re.S | re.I)
    limpo = re.sub(r"<style\b[^>]*>.*?</style\s*>", "", limpo, flags=re.S | re.I)

    for tag in TAGS:
        aberturas = len(re.findall(r"<%s(?=[\s/>])" % tag, limpo, re.I))
        fechamentos = len(re.findall(r"</%s\s*>" % tag, limpo, re.I))
        auto = len(re.findall(r"<%s(?=[\s/>])[^>]*/>" % tag, limpo, re.I))
        if aberturas - auto != fechamentos:
            problemas.append(
                "<%s>: %d aberturas vs %d fechamentos" % (tag, aberturas - auto, fechamentos)
            )

    return rel, problemas


def main():
    total = 0
    falhas = 0
    for caminho in paginas():
        total += 1
        rel, problemas = checar(caminho)
        if problemas:
            falhas += 1
            print("::error file=%s::%s" % (rel, "; ".join(problemas)))
            for p in problemas:
                print("  x %s -> %s" % (rel, p))
        else:
            print("  ok %s" % rel)

    print("\nHTML: %d/%d páginas OK" % (total - falhas, total))
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
