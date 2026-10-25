#!/usr/bin/env python3
"""Guarda contra a regressao que derrubou o painel do Instagram (15/10/2026).

O problema
----------
O `wrangler deploy` NAO faz merge das variaveis do Worker: ele SUBSTITUI o
conjunto inteiro pelo que esta declarado em `[vars]` no `wrangler.toml`. Se o
worker.js le `env.ORIGENS` mas o `wrangler.toml` nao declara `ORIGENS`, o deploy
APAGA a variavel que existe em producao. O Worker cai no valor padrao do codigo
e, se a origem de onde o painel abriu nao estiver nessa lista, o navegador
bloqueia a resposta por CORS — a tela mostra "Sem conexao agora. Tente de novo."

Este script compara, para cada Worker:
  - as variaveis que o worker.js LE (`env.NOME`)
  - as variaveis que o wrangler.toml DECLARA (`[vars]` e bindings)

e falha se alguma variavel lida nao estiver declarada. Assim o erro aparece no
CI, antes do deploy, em vez de aparecer no celular do lojista.

Uso:  python3 scripts/ci/check_workers.py
"""
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Bindings que o wrangler injeta por tipo (nao sao [vars], mas tambem viram env.X).
BINDINGS = {
    "d1_databases": "DB",
    "kv_namespaces": "CACHE",
    "r2_buckets": "MIDIA",
}

# Variaveis que o codigo le mas que NAO precisam estar no wrangler.toml:
# sao opcionais por desenho (o codigo tem valor padrao) ou sao secrets.
OPCIONAIS = {
    "IG_BASE",        # opcional: cai em IG_BASE_PADRAO
    "LIMITE_BYTES",   # opcional: cai em LIMITE_PADRAO
    # Binding KV opcional do og-worker: sem ele o Worker faz fetch direto e
    # "nunca quebra por falta dele" (ver o comentario no proprio worker.js).
    # Nao e uma variavel de configuracao — e um cache. Nao entra na guarda.
    "TK_LISTA",
    # Segredo do Worker tenkiter-ig (ponte para o Status do WhatsApp). Nao vai em [vars] (o repositorio
    # e publico): e gravado com `wrangler secret put WORKER_TOKEN` e sobrevive aos deploys.
    "WORKER_TOKEN",
    "WAFLY_GRUPO_CLIENTES",  # JSON privado: credenciais e destino fixo, preservado como secret.
    "IG_APP_SECRET",  # segredo do app Meta: valida a assinatura dos webhooks de DM do Instagram (módulo Mensagens).
    "WAME_STATUS_2",  # JSON privado: chave da instância Wame (WhatsApp 2), preservado como secret.
    "FREECONVERT_API_KEY",  # segredo externo; cadastrar no Cloudflare, nunca em [vars].
}

WORKERS = ["og-worker", "midia-worker", "instagram-worker"]


def vars_lidas(caminho_worker):
    """Nomes lidos como env.NOME no worker.js."""
    with open(caminho_worker, encoding="utf-8") as f:
        texto = f.read()
    return set(re.findall(r"\benv\.([A-Z][A-Z0-9_]*)\b", texto))


def vars_declaradas(caminho_toml):
    """Nomes declarados no wrangler.toml: [vars] + bindings."""
    with open(caminho_toml, encoding="utf-8") as f:
        texto = f.read()

    declaradas = set()

    # [vars] NOME = "valor"
    bloco_vars = re.search(r"^\[vars\]\s*$(.*?)(?=^\[|\Z)", texto, re.M | re.S)
    if bloco_vars:
        declaradas |= set(re.findall(r"^([A-Z][A-Z0-9_]*)\s*=", bloco_vars.group(1), re.M))

    # [[d1_databases]] binding = "DB"  /  [[kv_namespaces]] binding = "CACHE" ...
    for secao, nome_padrao in BINDINGS.items():
        for bloco in re.findall(r"^\[\[%s\]\]\s*$(.*?)(?=^\[|\Z)" % secao, texto, re.M | re.S):
            m = re.search(r'^binding\s*=\s*"([^"]+)"', bloco, re.M)
            declaradas.add(m.group(1) if m else nome_padrao)

    # [ai] binding = "AI"  (Workers AI: tabela simples, nao lista)
    bloco_ai = re.search(r"^\[ai\]\s*$(.*?)(?=^\[|\Z)", texto, re.M | re.S)
    if bloco_ai:
        m = re.search(r'^binding\s*=\s*"([^"]+)"', bloco_ai.group(1), re.M)
        declaradas.add(m.group(1) if m else "AI")

    return declaradas


def main():
    falhas = []

    for pasta in WORKERS:
        caminho_worker = os.path.join(RAIZ, pasta, "worker.js")
        caminho_toml = os.path.join(RAIZ, pasta, "wrangler.toml")

        if not os.path.exists(caminho_worker):
            continue
        if not os.path.exists(caminho_toml):
            falhas.append("%s: falta o wrangler.toml (o deploy nao teria configuracao)." % pasta)
            continue

        lidas = vars_lidas(caminho_worker)
        declaradas = vars_declaradas(caminho_toml)
        faltando = sorted(lidas - declaradas - OPCIONAIS)

        if faltando:
            falhas.append(
                "%s: o worker.js le %s, mas o wrangler.toml nao declara %s.\n"
                "    O `wrangler deploy` SUBSTITUI as variaveis — o deploy APAGARIA essa(s) "
                "variavel(eis) de producao.\n"
                "    Corrija declarando em [vars] no %s/wrangler.toml."
                % (pasta, ", ".join(sorted(lidas)), ", ".join(faltando), pasta)
            )
        else:
            print("  ok %s — %d variavel(eis) lida(s), todas declaradas" % (pasta, len(lidas)))

    if falhas:
        print("")
        for f in falhas:
            print("::error::" + f.replace("\n", "%0A"))
        print("")
        print("FALHOU: %d Worker(s) com variavel lida e nao declarada." % len(falhas))
        return 1

    print("")
    print("Workers: toda variavel lida esta declarada no wrangler.toml.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
