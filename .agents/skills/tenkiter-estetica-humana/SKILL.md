---
name: tenkiter-estetica-humana
description: Use obrigatoriamente ao criar, alterar ou revisar qualquer interface visual do TENKiTER. Avalia funcionalidade, estética, conforto humano, mobile, acessibilidade e coerência da marca antes de aprovar merge ou deploy.
---

# Especialista em estética e experiência humana TENKiTER

Esta skill é um portão de qualidade. Uma interface só está pronta quando funciona, cabe na tela, comunica a hierarquia certa e parece deliberadamente desenhada para uma pessoa real.

## Princípio de decisão

Preserve primeiro a tarefa principal. Controles administrativos, explicações, badges, tutoriais, chats e barras nunca podem roubar a área necessária para ver ou manipular o conteúdo. Beleza deve aumentar compreensão e confiança; não pode esconder defeitos de uso.

## Processo obrigatório

1. Defina em uma frase a tarefa humana principal da tela e o elemento que precisa receber atenção primeiro.
2. Observe a interface anterior e a alterada em 390×844, 412×915 e 1440×900. Use conteúdo realista, teclado aberto quando houver escrita, listas longas, texto ampliado e estados de erro/carregamento/vazio.
3. Faça a tarefa inteira por toque e por teclado. Não aprove apenas por inspeção do HTML.
4. Meça a área útil. Cabeçalhos, ferramentas e avisos devem usar o menor espaço compatível com clareza. Se a pessoa precisa manipular o conteúdo, ofereça recolher/minimizar sem perder o estado.
5. Confira colisões em todos os quatro limites da viewport, especialmente navegação inferior, teclado, safe areas, modais, widgets fixos e textos flutuantes.
6. Revise hierarquia, ritmo, tipografia, contraste, nomes e feedback usando os critérios abaixo.
7. Registre evidência: screenshots antes/depois, dimensões relevantes, jornada automatizada e resultado do checklist. Corrija falhas antes de merge.

## Portões que reprovam a mudança

- A ação necessária, navegação ou conteúdo fica total ou parcialmente fora da área visível.
- Um overlay, tutorial, chat, badge ou teclado encobre o alvo ou impede rolagem até ele.
- Surge rolagem horizontal a 320 CSS px, exceto em conteúdo bidimensional indispensável.
- O alvo de toque tem menos de 44×44 CSS px sem área clicável equivalente; controles críticos devem buscar 48×48 px.
- Texto comum não alcança contraste 4,5:1; texto grande e componentes não alcançam 3:1.
- Foco não é visível, a ordem de teclado é incoerente ou uma ação depende apenas de cor, hover ou gesto.
- A tela muda de posição durante carregamento/interação de modo que cause toque errado ou perda de contexto.
- A interface usa texto genérico, excesso de caixas, sombras, cores, emojis ou explicações que competem com a tarefa.
- O estado vazio, erro, espera ou sucesso deixa a pessoa sem próxima ação clara.
- O resultado parece um conjunto de componentes prontos sem relação com a linguagem visual TENKiTER.

## Linguagem visual TENKiTER

- Use preto quente, laranja da marca e fundos claros como estrutura, não como decoração em toda superfície.
- Reserve o laranja forte para ação principal, seleção e pequenos sinais de identidade. Uma área deve ter uma ação dominante.
- Prefira superfícies simples, bordas discretas e espaçamento consistente a cartões aninhados.
- Use escala de 8 px para ritmo; 4 px apenas em ajustes internos pequenos. Agrupe por proximidade antes de adicionar contornos.
- Títulos devem orientar; rótulos devem dizer a ação concreta. Corte instruções que a disposição visual já explica.
- Use ícone sozinho somente quando for convencional ou tiver nome acessível e `title`; ações incomuns precisam de texto.
- Preserve fotos de produto como protagonistas. Controles e selos não podem competir com rosto, roupa, preço e tamanho.
- Animações devem explicar mudança, durar em geral 120–240 ms e respeitar `prefers-reduced-motion`.

## Mobile e interfaces de trabalho

- Considere `visualViewport`, `100dvh`, teclado virtual e `env(safe-area-inset-*)`; não suponha que `100vh` seja a área visível.
- Navegação inferior é infraestrutura. Reserve 76–88 px e teste qualquer elemento `fixed` ou `sticky` junto dela.
- Barras de ferramentas devem ser compactas, persistir apenas o necessário e permitir expansão sob demanda.
- Em criação/edição, separe configurar de posicionar. Ao arrastar, recorte os controles para uma faixa mínima.
- Bottom sheets precisam de título curto, fechamento evidente, conteúdo rolável e ação principal alcançável.
- Nunca altere `position`, `display`, `transform` ou ancestral de empilhamento do alvo apenas para destacá-lo; use outline/overlay independente.

## Vitrine e conversão

- Busca, categorias e filtros devem encurtar o caminho até a peça; nunca deixe busca sem alternativa útil.
- Cards priorizam foto, nome, preço e sinal útil de decisão. Evite repetir variações como produtos diferentes.
- Filtros mobile usam painel/accordion com aplicar e limpar claros, sem saltos de rolagem.
- PDP mostra tamanhos como botões, fotos grandes e guia de medidas em HTML.
- WhatsApp deve levar contexto do produto, sem cobrir navegação ou ação de compra.
- Evite poluição semelhante a marketplaces: prova social e badges só entram quando verdadeiros e úteis.

## Entrega da revisão

Relate sempre:

- tarefa humana avaliada;
- viewports e estados testados;
- problemas encontrados e correções feitas;
- medições de áreas fixas, alvos e sobreposições;
- resultado: `APROVADO`, `APROVADO COM LIMITAÇÃO` ou `REPROVADO`;
- limitações materiais que dependem de aparelho ou validação humana real.

Leia [fontes-e-criterios.md](references/fontes-e-criterios.md) para a origem dos critérios e [checklist.md](references/checklist.md) antes da aprovação.
