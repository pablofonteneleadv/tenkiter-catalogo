# Mensagens: selecionar várias peças e mandar a seleção — 26/10/2026

Pedido do Pablo (print da gaveta Produtos com "Blusas"): poder selecionar produtos e enviar a seleção, igual é no site.

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `selecao-produtos-20261026/01-selecao-390.png`, `02-selecao-412.png` e `03-selecao-1440.png`.

## Tarefa humana
A atendente, no meio da conversa, separa algumas peças para a cliente e manda numa mensagem só, com um link que abre exatamente essas peças. O que precisa de atenção primeiro é a foto da peça (é ela que marca), e depois a ação "Enviar seleção".

## Como ficou
- A foto de cada produto virou o botão de marcar ("Selecionar <nome> <código>", `aria-pressed`), com uma caixinha no canto. Marcada: ✓ laranja, fundo creme e um filete laranja à esquerda da linha.
- Uma dica de uma linha sob "Só com estoque": "Toque na foto para selecionar várias peças e mandar um link só."
- A barra da seleção fica no pé da gaveta e só aparece com peça marcada: "N peças selecionadas" · Limpar, e embaixo "Copiar link" e "Enviar seleção" (a principal, em laranja).
- "Enviar seleção" usa o mesmo texto da loja (`mensagemDaSelecao_`): cabeçalho com a quantidade, uma linha por peça com código e preço à vista (até 12 linhas, depois "… e mais N"), e o link `SITE_URL?sel=TK-…`. O texto vai para o fim da mensagem, sem apagar o que já estava escrito. A gaveta fecha e o foco volta para a mensagem.
- A seleção sobrevive à troca de busca (dá para juntar blusa e short), recomeça ao enviar e não passa para outra conversa. Limite de 60 peças, igual ao link da loja.
- "Colocar na mensagem" e "Copiar link" de cada peça continuam iguais.

## Medições
- Foto/alvo de marcar: 72×90 px. Botões da barra: 44 px de altura.
- Barra: 111 px no celular de 412 px e 115 px na gaveta de 420 px do computador; fica dentro da gaveta, sem sair da tela.
- Sem rolagem horizontal em 390, 412 e 1440. axe sem falhas sérias nos três tamanhos.
- Teclado: Tab chega na foto, Espaço marca e desmarca.

## Testes
- `tests/mensagens_selecao_produtos.py`: 29 verificações (novo), com serviços simulados.
- Continuam passando: `mensagens_atendimento` (35), `mensagens_assinatura` (22), `mensagens_encerrar` (40) e `mensagens_mestre` (21).

Resultado: APROVADO COM LIMITAÇÃO. Testado em navegador simulado; falta conferir no Android de verdade se o link colado no WhatsApp abre a seleção.
