# Acabamento do painel de gestão (Opção A) — 26/10/2026

Pedido do Pablo: "fazer a mesma coisa que foi feito na index. Sem alterar nada, reorganizar botões, tamanhos de letras e etc. pra ficar no padrão. Aproveite e corrija erros que pré-existam."

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência (antes × depois, serviços simulados): `acabamento-admin-20261026/celular-390.jpg`, `celular-390-lote-menu.jpg` (390×844), `android-412.jpg` (412×915) e `desktop-1440.jpg` (1440×900).

## O que mudou (só aparência)

- Camada `acabamento-admin.css`, carregada depois dos `<style>` do admin, com os mesmos tokens da vitrine: texto #141414 / #625c53, borda #e3ddd3, fundo #f6f3ee, raio 8/6 px, sem sombra.
- Ícones de linha (`icones.js`, novos: ferramenta, cabide, pessoas, documento, gráfico, recibo, pincel, copiar, relógio, arquivar, pasta). Botões fixos usam `data-ico` com o emoji como reserva; os criados por script usam `TKIcone` com reserva.
- Cabeçalho: uma faixa de 58 px, marca à esquerda, subtítulo menor embaixo; alinhado à mesma largura do conteúdo.
- "O que fazer agora": grade de 2 colunas no celular (6 por linha no computador), 44 px, ícone + texto à esquerda.
- Cadastrar: o laranja continua sendo a ação principal; aberto fica preto. Itens do menu com ícone num quadro de 44 px.
- Lista: busca de 44 px com lupa dentro do campo e texto de 16 px (não dá zoom no iPhone); Filtros e "Selecionar todos" com 44 px; filtros com a escolha em preto.
- Cartão da peça: Editar preto (principal); Stories, Link e Postar com borda; no celular, grade 2×2 de 40 px (antes quebrava 3 + 1). Menu ⋯ de 40 px e itens de 44 px; Excluir em vermelho.
- Barra de seleção: botões com ícone, mesmo raio; "Mais ações" segue laranja.
- Barra inferior da equipe com ícones de linha em todas as páginas que usam `nav.js`.

## Erros que já existiam, corrigidos

- "Envios e pendências" ficava sempre à vista, vazio, com título grande no meio do painel: agora aparece só quando há envio (continua abrindo pelo aviso flutuante e pelo resumo).
- Botão "✂ Enquadrar" das miniaturas tinha 27 px de altura no celular: agora 32 px.
- Selo "novos" do Cadastrar era laranja sobre laranja: agora preto com texto branco.
- Faixa do CPF ocupava a tela inteira no computador: agora acompanha o conteúdo, com campo e botão na mesma linha.
- 15 escapes `\u{1F…}` de cinco dígitos (proibidos nas REGRAS) trocados pelo caractere.
- Testes `cadastro_plano_mestre` e `jornada_lojista` ainda clicavam nos chips antigos de tamanho (hoje só aparecem em cadastro antigo) e no público "Masculino Adulto" (hoje "Homem"); `enquadrar_cadastro` lia a dica fechada.

## Verificação

- Sem rolagem horizontal a 390, 412 e 1440 px; sem erro de JavaScript.
- Bateria do painel (62 testes) comparada com a versão publicada, nos dois casos com serviços simulados.

Resultado: APROVADO COM LIMITAÇÃO. Não testado em aparelho físico.
