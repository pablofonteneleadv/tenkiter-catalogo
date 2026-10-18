---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git push:*), Bash(git log:*), Bash(git diff:*), Bash(git branch:*), Bash(git checkout:*), Bash(git fetch:*), Bash(gh api:*), Bash(curl:*)
description: Comita, abre o PR, faz o merge na main e confirma o deploy automático do GitHub
---

## Contexto

- Status do git: !`git status`
- Diff (staged + unstaged): !`git diff HEAD`
- Branch atual: !`git branch --show-current`
- Últimos commits: !`git log --oneline -5`

## Sua tarefa

O deploy deste repo (TENKiTER catálogo) é **automático pelo GitHub**: o merge na `main` aciona
`.github/workflows/deploy.yml`, que publica o site, acompanha até "live" e confirma o commit em
`/version.json`. Não existe deploy manual — não pedir confirmação ao Pablo.

1. Se houver mudanças não commitadas, crie um commit com mensagem apropriada (siga o padrão dos
   commits recentes acima) numa branch própria (nunca direto na `main`).
2. Crie o ponto de restauração: branch `backup/pre-<tema>-<data>` apontando para o commit atual da
   `main` (`git push origin <sha-da-main>:refs/heads/backup/pre-<tema>-<data>`).
3. Dê `git push` da branch, abra o PR (`gh api`) e aguarde o check **Portão de qualidade** ficar verde.
4. Faça o merge (squash) na `main`. O `deploy.yml` publica sozinho.
5. Aguarde o término do workflow `Deploy` e confira o site no ar: `curl` em
   `https://tenkiter-catalogo.onrender.com/version.json` (campo `commit` = commit do merge) e em
   `https://tenkiter-catalogo.onrender.com/<arquivo>` com `grep` numa string que só existe nesta mudança.
6. Lembre, se algum `.gs.txt` (Apps Script) foi alterado: isso **não é publicado por este
   comando** — avise que o Pablo precisa colar manualmente no editor do Apps Script e clicar em
   "Nova versão", e que depois disso dá para validar via `curl ?action=versao`.

Reporte ao final, em 1-2 frases: o que foi commitado, se o deploy automático foi confirmado no ar
(com a string checada) e se algum backend Apps Script ficou pendente de colar à mão.
