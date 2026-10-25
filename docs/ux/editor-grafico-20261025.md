# Revisão do editor gráfico — 25/10/2026

Tarefa: revisar uma etapa sobre a tela real, alterar alvo ou texto, navegar entre etapas e aplicar sem perder as demais.

Skill aplicada: `.agents/skills/tenkiter-estetica-humana/SKILL.md`.

Jornada automatizada `tests/tutorial_editor_grafico.py`: 390×844, 412×915, 1440×900 e 320×700. Cobriu selecionar alvo, texto, formatação, posição por teclado, avanço/retorno e persistência no salvamento. Screenshots locais em `tests/saida/editor-grafico-*.png`.

Barra: duas linhas compactas, controles de 44px; instrução de até 48px. Painel móvel limitado a 45% da viewport e recolhível; desktop lateral de 340px. Sem rolagem horizontal nos quatro tamanhos. Corrigida transparência inicial da barra. Alvos marcados por outline independente, sem alterar o layout da prévia.

Resultado: APROVADO COM LIMITAÇÃO. Android e teclado virtual real não foram testados nesta sessão. A prévia mantém a tela atual ao navegar entre etapas; quando um alvo não está visível, informa para abrir o menu na prévia. Não reconstrói arquivos locais ou estados arbitrários do navegador. Mudanças só vão ao servidor ao Salvar/Publicar no editor principal.

## Complemento 7.14.0

Instrução flutuante opcional na própria etapa, com edição de tamanho/cores e arraste. Enquadramento por posição proporcional do alvo, sem fixar pixels de aparelho. Teste específico confirmou que o overlay não contém botão Continuar e não cria etapa extra. `tutorial_foco_preco.py` verificou bloqueio de Tab com nome incorreto e validação de 89.90 antes da transformação para 89.99. Os quatro viewports da edição continuam aprovados. Android real permanece não validado.
