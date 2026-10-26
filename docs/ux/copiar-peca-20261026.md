# Copiar de outra peça — 26/10/2026

Tarefa: cadastrando uma peça nova, achar uma parecida já cadastrada e trazer para o formulário só as informações que servem.

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `copiar-peca-20261026/celular.jpg` (390×844).

- Embaixo do nome: até 3 parecidas com foto 44×55, nome, código · preço · situação e "Ver todas (N)". Cada linha tem 64 px de altura e é um botão inteiro.
- Tela cheia (TKCamadas: voltar e ✕ fecham): busca por nome ou código, filtros Todas/Ativas/Arquivadas (36 px), lista com foto 56×70.
- "O que copiar?": fotos da peça, caixinhas de 22 px em linhas de 48 px, "Marcar/Desmarcar tudo", rodapé fixo com "Editar esta peça" e "Copiar N informações" (50 px). Fotos e vídeos nunca são copiados (aviso na tela). Editando outra peça, só o nome pode ser copiado.
- Cores e categorias em ordem alfabética pt-BR; "Consulte…" por último.
- Sem rolagem horizontal a 390 px.

Testes: `admin_categorias` (72 verificações, com as novas da tela cheia), `opcoes_lista`, `lote_editar`, `ia_foto_campos`, `consultar_valor`, `admin_gestao`, `envios_retomar`, `lote_falhas`.

Resultado: APROVADO COM LIMITAÇÃO. Não testado em aparelho físico.
