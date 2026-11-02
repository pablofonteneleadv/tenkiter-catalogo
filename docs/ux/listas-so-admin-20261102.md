# Só o Admin total cria nomes de categoria, tamanho, cor e tecido (7.48.1)

## Pedido do Pablo (02/11/2026)
Em nenhum lugar do site a equipe pode escrever e criar nomes de categorias, cores, tecidos e tamanhos. Só o Admin total cria ou edita esses nomes. A Esteira já seguia essa regra desde a 7.48.0; esta versão fecha os três pontos que sobravam na Gestão.

## O que mudou
A regra é a mesma da classe `.so-admin-cores`: vale para quem tem `body.sem-gerir`, ou seja, quem não tem `gerir_acessos`.

- **Tecido (cadastro, `admin-tecidos.js`):**
  - quem não é Admin total tem o campo somente leitura, sem a lista de sugestões para digitar;
  - a pessoa escolhe tocando num tecido cadastrado, e um segundo toque tira;
  - a ajuda explica a regra e muda de texto quando ainda não há tecidos cadastrados;
  - para o Admin total, nada muda: escreve e gerencia os nomes.
- **"Não achei: criar tamanho novo" e "criar cor/estampa nova":** ganharam `so-admin-cores` (só o Admin vê). `abrirCriacaoEscolha_` e o envio de `addTamanho`/`addCor` recusam quem não é Admin total. O texto do estado vazio também ficou certo para cada perfil.
- **Edição em lote:** `podeCriar` passou a exigir Admin total, então não aparece "Criar" nem o Enter cria nome novo. O aviso agora diz "Só o Admin total cria nomes novos". Também corrigi "esse categoria/cor" para "essa".
- **Limitação:** o Apps Script não foi alterado (a publicação dele é manual, pelo Pablo), então a trava é na tela. Renomear/apagar categorias já exigia Admin total no servidor (`podeGerirCategorias_`).

## Revisão estética (skill tenkiter-estetica-humana)
- **Tarefa:** a funcionária cadastra a peça escolhendo só nomes existentes, sem duplicar nomes com pouca diferença.
- **Reaproveitado:** chips de tecido existentes, `.so-admin-cores` e os avisos `.lote-nada`. Não entrou componente novo; só a linha de ajuda do tecido, no tom do texto secundário.
- **Viewports:** 390 e 1440. Sem rolagem horizontal e sem erro de JavaScript.
- **Evidência** (pasta `listas-so-admin-20261102/`): `tecido_equipe_390/1440.jpg` e `lote_equipe_390/1440.jpg`.
- **Resultado:** APROVADO COM LIMITAÇÃO (serviços simulados; a trava do Apps Script depende da publicação manual).

## Testes
- `tests/listas_so_admin.py`: 30 ok (funcionária e Admin, 390 e 1440).
- Regressão OK: `lote_editar`, `admin_categorias`, `familia_gestao`, `admin_lista_v424`, `cadastro_tipos`, `catalogo_tecido_ui`, `tecidos_gestao`.
- Verificações estáticas (js, html, segredos) OK.
