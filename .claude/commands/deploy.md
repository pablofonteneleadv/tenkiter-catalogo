---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git push:*), Bash(git log:*), Bash(git diff:*), Bash(curl:*), mcp__Render__trigger_deploy, mcp__Render__get_deploy, mcp__Render__list_deploys
description: Comita, dá push e dispara+confirma o deploy no Render (não confiar no autoDeploy)
---

## Contexto

- Status do git: !`git status`
- Diff (staged + unstaged): !`git diff HEAD`
- Branch atual: !`git branch --show-current`
- Últimos commits: !`git log --oneline -5`

## Sua tarefa

Este repo (TENKiTER catálogo) tem autoDeploy configurado no Render, mas na prática ele não é
confiável — **sempre** fazer o deploy explícito, nunca assumir que o push sozinho publicou.

1. Se houver mudanças não commitadas, crie um único commit com mensagem apropriada (siga o
   padrão dos commits recentes acima) e dê `git push`.
2. Dispare o deploy: `mcp__Render__trigger_deploy` no serviço `srv-dasa63fpn0mc73fh8fgg`
   (workspace `tea-d001phk9c44c73fd13h0`).
3. Faça polling com `mcp__Render__get_deploy` até o `status` virar `"live"` (não declare sucesso
   antes disso).
4. Confirme que o ar está servindo o código novo: `curl` a URL pública do arquivo alterado em
   `https://tenkiter-catalogo.onrender.com/<arquivo>` e confira (com grep/leitura) por uma string
   que só existe na mudança deste commit — "live" no painel do Render não é prova suficiente.
5. Lembre, se algum `.gs.txt` (Apps Script) foi alterado: isso **não é publicado por este
   comando** — avise que o Pablo precisa colar manualmente no editor do Apps Script e clicar em
   "Nova versão", e que depois disso dá para validar via `curl ?action=versao`.

Reporte ao final, em 1-2 frases: o que foi commitado, se o deploy do Render foi confirmado ao
vivo (com a string checada), e se algum backend Apps Script ficou pendente de redeploy manual.
