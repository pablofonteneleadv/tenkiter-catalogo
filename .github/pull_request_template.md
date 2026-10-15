## O que muda

<!-- Descreva a mudança em 1-3 frases. Se resolve um item do plano de ação, cite o ID (ex.: INFRA-02). -->

## Checklist

- [ ] Rodei `bash scripts/ci/check_secrets.sh` e não há credencial em texto plano
- [ ] Rodei `bash scripts/ci/check_js.sh` (sintaxe dos .js)
- [ ] Rodei `python3 scripts/ci/check_html.py` (estrutura das páginas)
- [ ] Rodei a bateria de testes: `python3 tests/rodar_tudo.py`
- [ ] Se mexi em backend `.gs`: avisei que o redeploy no Apps Script é **manual**
- [ ] Se mexi em Worker (`og-worker/`, `midia-worker/`, `instagram-worker/`): publiquei com `wrangler deploy`
- [ ] Atualizei o `CHANGELOG.md` se a mudança é visível para o usuário

## Como testar

<!-- Passos para quem for revisar confirmar que funciona. -->

## Risco e rollback

<!-- O que pode dar errado e como voltar atrás (tag anterior? revert do commit?). -->
