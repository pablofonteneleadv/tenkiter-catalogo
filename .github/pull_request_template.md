## O que muda

<!-- Descreva a mudança em 1-3 frases. Se resolve um item do plano de ação, cite o ID (ex.: INFRA-02). -->

## Checklist

- [ ] Rodei `bash scripts/ci/check_secrets.sh` e não há credencial em texto plano
- [ ] Rodei `bash scripts/ci/check_js.sh` (sintaxe dos .js)
- [ ] Rodei `python3 scripts/ci/check_html.py` (estrutura das páginas)
- [ ] Rodei os testes do setor antes/depois e registrei resultados (bateria completa só quando solicitada)
- [ ] Se mexi em backend `.gs`: avisei que o redeploy no Apps Script é **manual**
- [ ] Se mexi em Worker: conferirei a publicação automática dos três Workers após o merge
- [ ] Atualizei o `CHANGELOG.md` se a mudança é visível para o usuário
- [ ] Se alterei interface: apliquei a skill `tenkiter-estetica-humana`, testei 390×844, 412×915 e 1440×900 e registrei colisões/medidas

## Como testar

<!-- Passos para quem for revisar confirmar que funciona. -->

- [ ] Backup/ponto de restauração disponível e escopo registrado antes do merge

## Risco e rollback

<!-- O que pode dar errado e como voltar atrás (tag anterior? revert do commit?). -->
