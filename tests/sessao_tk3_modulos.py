#!/usr/bin/env python3
"""Impede módulos do site de recusarem a sessão compartilhada tk3."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARQUIVOS = (
    "admin-postagens.js",
    "admin-fotoia.js",
    "common.js",
    "midia-worker/worker.js",
    "admin-instagram.js",
    "foto-cliente.js",
    "admin.html",
)


def test_modulos_aceitam_sessao_compartilhada_tk3():
    for nome in ARQUIVOS:
        texto = (ROOT / nome).read_text(encoding="utf-8")
        assert "^tk[12]\\." not in texto, f"{nome} ainda recusa tk3"
        assert "^tk[123]\\." in texto, f"{nome} não valida os tokens de sessão"


if __name__ == "__main__":
    test_modulos_aceitam_sessao_compartilhada_tk3()
    print("sessao_tk3_modulos: OK")

