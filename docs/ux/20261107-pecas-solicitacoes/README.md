# Peças juntas e registros de clientes — 7.56.2

A tarefa é montar postagens com todas as peças escolhidas e registrar referências do cliente sem interromper o atendimento. O proprietário pediu a retirada do limite de oito, três miniaturas lado a lado com ampliação e salvamento recolhido com acompanhamento flutuante.

## Comportamento

- O seletor não impõe teto de peças e não corta a lista na oitava. Cada mídia mantém sua peça. Prévia em páginas de dez, com navegação por todas as fotos; o cache mantém até vinte imagens para conter memória. Esses números limitam renderização/cache, não seleção.
- Os contratos existentes de Feed, Reels, Carrossel, capacidade da fila e sessenta originais por requisição não foram alterados. Acima de sessenta Stories, o aviso ocorre antes de preparar/subir arquivos e preserva a seleção para envio em etapas.
- A lista de solicitações mostra uma linha de até três miniaturas; quando há mais, o terceiro alvo indica a quantidade restante. A ampliação percorre todas as fotos e retorna à mesma lista. Imagens autenticadas são carregadas conforme a aproximação da área visível.
- O formulário mostra miniaturas, descrição e remoção. Registrar persiste o trabalho e os arquivos em IndexedDB antes de recolher a gaveta. Se o armazenamento falhar, não libera o formulário nem perde o que foi escolhido.
- O indicador flutuante mostra atividade e contagem de fotos confirmadas, permite acompanhar/minimizar, conferir conclusão e retomar falha. Posiciona-se acima de ferramentas, citação, anexo e compositor. A animação respeita movimento reduzido; não há percentual fictício nem mensagem enviada ao cliente.
- Arquivos e identificadores ficam vinculados à conta/conversa de origem. Cada confirmação é persistida; retomada usa os mesmos IDs idempotentes do servidor e pula fotos já confirmadas. Trava nativa impede execução simultânea por abas; navegadores sem Web Locks usam reserva local temporária.
- A execução exige página aberta. Ao reabrir o Mensageiro na conta de origem, processos persistidos retomam; falhas explícitas oferecem tentativa manual. Não há promessa de JavaScript continuar com aplicativo fechado. Nenhuma credencial é persistida.

## Revisão humana e verificação

Componentes de referência: gavetas e botões do Mensageiro, seletor/mídias de Postagens. Preservados Inter, preto quente, laranja funcional, superfícies claras, bordas discretas e TKCamadas. Não houve novo tema nem novo serviço.

Jornadas simuladas: `postagens_multi.py`, `postagens_multi_sem_limite.py`, `mensagens_solicitacoes_ui.py` e `mensagens_registros_fundo_ui.py`. Tamanhos 390×844, 412×915, 1440×900 e reflow a320px com texto ampliado. Asserções cobrem seleção de10/100, pedido com10 fotos, acesso à última página, preservação ao exceder o contrato de envio, três miniaturas na mesma linha, zoom, acompanhamento, rascunho sem envio, upload retido, troca de conversa, falha parcial e recarga. Serviços externos são simulados; pedidos/arquivos do teste ficam em SQLite local.

Alvos novos de prévia/progresso48px; demais ações no mínimo44px. A inspeção da primeira captura detectou sobreposição do progresso à barra Produtos/Respostas; a ancoragem foi corrigida para considerar a barra inteira e os anexos. Aprovação visual depende de revisar as capturas finais e CI; os resultados e provas de publicação são registrados no Cofre. Não houve teste físico Android. A mudança é HTML/JS remoto carregado pelo APK existente, sem alteração de código nativo.

Graphify start/query/ensure/affected tentados: cache de instalação em `/home/agent/.cache` somente leitura. Relações conferidas nas fontes e jornadas; o verificador de contrato Graphify passa. Nenhum índice privado ou modelo pago utilizado.

Restauração: branch remota `backup/pre-pecas-juntas-20261107` conserva a base7.56.1, commit26ab5ba95bcbce4671f53a352d939d3815e1e977. Reversão do código não deve apagar o banco local de envios; concluir/conferir registros pendentes antes de reverter esse módulo.
