# Esteira e busca de produtos — 7.54.0

Tarefa humana: enviar o trabalho e seguir imediatamente para outra atividade, acompanhando a confirmação sem perder fotos, observações ou a tela atual.

## Comportamento

- A fila grava o comando e as fotos originais no IndexedDB antes de liberar a tela. Não guarda credenciais. Com o navegador fechado, retoma ao reabrir; não promete execução com o aparelho desligado.
- Fotos da caixa, de tarefas e pedidos, conferência, aceite para o site e aplicação de pedidos executam por etapas. Uploads concluídos e recibos confirmados são reaproveitados ao tentar novamente. Falhas ficam em **Processos**, com ação para retomar/conferir.
- Web Locks e reserva local impedem duas abas de processar a mesma fila simultaneamente. Fila e histórico são separados por conta. Arquivos originais são liberados da fila após confirmação.
- O Worker registra um recibo por conta/operação. Uma resposta perdida não cria outro comando; dados diferentes no mesmo recibo são recusados. Resultado incerto exige conferência, sem repetir a mutação às cegas. O recibo não substitui autenticação nem permissões.
- Conferência preserva tamanhos/cores acrescentados por outra pessoa e interrompe alteração de estoque conflitante. A aplicação de reposição mantém o estoque inicial da tentativa.
- A conclusão não força a navegação de quem já abriu outra atividade. Rascunhos em edição continuam protegidos pela atualização por blocos existente.
- Buscadores da Esteira abrem com produtos, busca por palavras e características, filtros recolhidos e mais resultados sob demanda. Usam o mesmo mapa de fotos recentes do catálogo.
- A IA usa a mesma ordenação/facetas, estoque, filtros Cima/Baixo/Look/Todas e seleção da foto na galeria. Trocar o tipo respeita a roupa escolhida na montagem. Nenhuma geração paga é iniciada automaticamente.

## Conferência

1. Envie fotos para a caixa e troque de aba enquanto há upload: a janela fecha após guardar e o processo aparece no cabeçalho.
2. Comece outro pedido e digite uma observação: a conclusão anterior não deve remover o texto nem trocar a tela.
3. Salve um pedido com anexo: volte à lista sem aguardar o upload; acompanhe a confirmação em Processos.
4. Force uma interrupção e retome em Processos: fotos já enviadas não sobem novamente. Reabrir recupera originais e etapas pendentes.
5. Em Preparação, Fotos e reposição, abra o buscador sem digitar. Confira ordem por fotos recentes e filtros de tamanho/categoria/público/cor/tecido.
6. Na IA, alterne Cima, Baixo, Look e Todas, busque por tecido/cor e escolha a foto de referência. O lote anterior deve continuar salvo.

## Validação

Rede, catálogo, mídia e IA simulados; nenhum envio a clientes nem geração paga usado em testes. Jornadas em 320×700, 390×844, 412×915 e 1440×900, texto ampliado, altura curta, teclado, alvos de toque e reflow. Evidências sintéticas e checklist final ficam no Cofre operacional.

Testes: `worker_esteira.js`, `worker_esteira_fotos.js`, `esteira_fotos_ui.py`, `esteira_processos_ui.py`, `esteira_envios_fundo_ui.py`, `produtos_busca_esteira_ia.py`, `esteira_fluidez_ui.py` e jornadas de IA.

Graphify: consulta inicial `fila-lote cxProcessar esteira salvar tarefa`; cobertura parcial de HTML/JS confirmada pelas fontes e testes. Indexações interrompidas por alterações simultâneas são refeitas ao finalizar o lote.
