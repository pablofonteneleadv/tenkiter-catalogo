# Escolher peça para copiar — 26/10/2026

Tarefa: cadastrando uma peça nova, achar rápido a peça já cadastrada de onde vêm os dados (pedido do Pablo: "mais fácil a escolha do produto", "menu maior e mais interativo com filtros e últimos cadastrados"). Sem escolher campo a campo: tocar na peça copia tudo, como antes, e há Desfazer.

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `copiar-peca-20261026/celular.jpg` (390×844) e `desktop.jpg` (1280×860).

- Passo 3: botão "Copiar dados de outra peça" (44 px) sempre à vista; ao digitar o nome, as 3 parecidas em cartões com foto 3:4 e "Ver todas (N)".
- Tela cheia (TKCamadas: voltar e ✕ fecham): abre em "Últimos cadastrados" (ordem pelo ID, que é a hora do cadastro); busca por nome ou código; situação Ativas/Arquivadas/Todas; ordem Mais recentes/A–Z; faixas roláveis de público e categoria com contagem (38 px). Grade de 2 colunas no celular, 3 a 600 px e 4 a 860 px; mostra 40 e "Mostrar mais".
- Cartão: foto 3:4, nome, código · preço, categoria · tamanhos, selo de arquivada/esgotada, "Copiar dados" e ✎ Editar (44×44).
- Depois de copiar: aviso com o que veio e botão Desfazer (volta o formulário como estava). Fotos, vídeos e código nunca são copiados.
- Sem rolagem horizontal a 390 e 1280 px; sem erro de JavaScript.

Testes: `admin_categorias` (76 verificações; inclui Desfazer, últimos primeiro, busca por código, filtro de categoria, copiar pela tela cheia e ✎ Editar), `opcoes_lista`, `lote_editar`, `ia_foto_campos`, `consultar_valor`, `admin_gestao`, `envios_retomar`, `lote_falhas`.

Resultado: APROVADO COM LIMITAÇÃO. Não testado em aparelho físico.
