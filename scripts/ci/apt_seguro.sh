#!/usr/bin/env bash
# apt-get update que não para quando um repositório de terceiros do runner sai do ar.
# 27/11/2026: packages.microsoft.com respondeu 403 e derrubou a bateria noturna antes de qualquer teste.
# Tenta normal; se falhar, desliga as listas que não são do Ubuntu e tenta de novo.
set -u
if sudo apt-get update -o Acquire::Retries=3; then exit 0; fi
echo "::warning::apt-get update falhou; desligando repositórios de terceiros do runner e tentando de novo"
for f in /etc/apt/sources.list.d/*; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in ubuntu*|*.desligado) ;; *) sudo mv "$f" "$f.desligado" ;; esac
done
sudo apt-get update -o Acquire::Retries=3
