---
name: tenkiter-canario-pos-deploy
description: Use depois que o deploy.yml terminar (merge na main) para confirmar, somente leitura e em produção, que a versão certa está no ar - version.json, assets 200, console sem erro, rotas públicas dos Workers e Esteira no celular. Nunca grava dado nem usa credencial de cliente.
---

# Canário pós-deploy (somente leitura)

Inspirada em ECC skills/canary-watch e skills/browser-qa (MIT). Deploy verde não prova que o cliente vê a versão nova. Este roteiro confirma isso sem alterar nada.

## Regras

- Apenas GET/HEAD. Nenhum pedido, mensagem, upload, login real, nem token ou segredo em comando ou saída (regras 10 e 11 do `CLAUDE.md`).
- Registre o resultado no log (regra 17). Falhou: não "corrija na hora" em produção; abra PR de correção ou restaure o ponto anterior (regra 9).

## Checklist

1. **Workflow terminou.** `deploy.yml` concluído com sucesso para o commit do merge (regra 7).
2. **`/version.json`.** Abra `SITE_URL` (definido em `common.js`) + `version.json`: `versao` igual a `VERSION`, `commit` de 40 hex igual ao do merge, `Cache-Control` com `no-store`. É a mesma validação de `validate()` em `scripts/monitoramento/saude_publica.py`, que pode ser rodado com `python3 scripts/monitoramento/saude_publica.py --expected-commit <sha>` (só GET, sem sessão, sem dados de cliente).
3. **Assets 200 e do tipo certo.** `/`, `pedido.js`, `treinamentos.html`, `rh-permissoes.js`, `rh-permissoes.css`, `sitemap.xml`, `feed.csv`, `feed.xml` (lista de `check()` no mesmo script). Falha típica: HTML devolvido no lugar de JS/CSS. Para o que a PR alterou, confira que o `?v=` novo (regra de `scripts/ci/check_versao_assets.py`) aparece na página servida e que o arquivo responde 200 com o `Content-Type` certo.
4. **Arquivos internos não vazam.** `python3 scripts/deploy/verificar_arquivos_internos.py` (404/410 em `scripts/deploy/build_version.sh`, `tests/mock.py` etc., nos dois hosts).
5. **Workers publicados agora.** `scripts/deploy/verificar_workers.sh` confere pela API da Cloudflare que `tenkiter-og`, `tenkiter-midia` e `tenkiter-ig` foram republicados na janela. O token vem do ambiente do CI: não copie nem cole em lugar nenhum.
6. **Rotas públicas dos Workers (GET sem corpo).** `tenkiter-ig` (host em `common.js`): `/catalogo/composicoes` e `/familias`. `tenkiter-midia`: uma imagem pública já usada pelo catálogo em `/m/<chave>` (200, `Content-Type` de imagem). Espere 200 JSON com `ok:true` ou o 401/403 documentado, nunca 5xx nem HTML de erro. Não chame `/wh/...`, `/esteira/...` com sessão nem rotas POST.
7. **Console e rede, no navegador.** Abra `/`, o catálogo e `esteira.html` em celular 390x844 (sem login: a tela de entrada) e leia o console: zero `pageerror`, zero 404 de script/CSS, zero bloqueio de CORS.
8. **Esteira no celular (se a PR tocou Esteira).** Com a conta do próprio dono já logada no aparelho: as abas aparecem (`#abas`), a troca de aba funciona, nenhum botão fica cortado pela barra inferior. Gravação de teste fica com o dono; o agente não executa.
9. **Android.** Se mexeu em `android/`, confira `android/latest.json` e o fluxo de `scripts/release/` apenas por leitura.

## Saída

Lista `OK` / `FALHOU` por item, com horário, commit conferido e, no que falhou, o sintoma e a evidência (status, trecho de cabeçalho, mensagem de console sem dados pessoais). Item que exige login real vai como "não verificado", nunca como OK.

## Repetir

Em mudança de risco alto, repita os itens 2 e 6 depois de 10 e de 30 minutos (Render serve com `s-maxage=300`, e a borda da Cloudflare pode segurar a versão antiga por alguns minutos). O workflow `saude-publica.yml` já roda a cada 5 minutos e cobre os itens 2 e 3 continuamente.
