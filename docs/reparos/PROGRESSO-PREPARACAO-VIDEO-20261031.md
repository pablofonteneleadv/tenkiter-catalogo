# Progresso e recuperação da preparação de vídeo

O botão Preparar todas as partes mantinha o rótulo de ação durante upload e espera, sem percentual ou aparência clara de indisponibilidade. A leitura operacional agregada confirmou que o original havia chegado e havia um único trabalho aguardando o processador, sem duplicação. O pedido de preparação já solicitado pelo proprietário foi processado, sem publicar nem enviar mensagens. Não foram lidos ou exportados os vídeos privados para este relatório.

## Correção

- Um bloqueio explícito impede reentrar no envio enquanto a operação estiver ativa, inclusive por chamada repetida do handler. Botão nativamente desabilitado, texto por etapa e aparência de espera tornam o estado visível.
- Upload usa XMLHttpRequest com percentual e os bytes já lidos para conferir o original. Não reabre o URI da galeria/Google Fotos para transmitir o corpo.
- Estados separados: Enviando vídeo, Confirmando recebimento, Aguardando o processador, Preparando vídeos e Conferindo vídeos. Após recebimento, a tela deixa claro que o original está na fila e permite fechar/recuperar.
- Falta de progresso/resposta por 60 s, limite total de envio de oito minutos, erro de conexão ou resposta incompleta oferecem uma ação clara em português. Cancelar durante o upload interrompe a conexão; recibo incerto não significa publicação.
- Depois de um recibo confirmado, falha temporária de consulta oferece Consultar andamento e mantém o identificador. O original só é reenviado se o trabalho expirou (404) ou houve falha de preparação que exige nova tentativa; deduplicação do servidor permanece.
- Nada é publicado ao preparar ou recuperar. As prévias e o aceite das partes continuam obrigatórios.

A correção não modifica o agendador externo: o início do processamento ainda depende da fila periódica, sem prazo garantido. O estado de espera passa a ser informado, em vez de parecer um clique ignorado. Não foi acionado conversor pago.

## Validação e publicação

Teste de requisição retida, corpo idêntico ao original, cliques repetidos, confirmação, espera em fila, erro temporário de consulta sem reupload, erro do servidor e cancelamento em 320/390/412/1440. Jornada normal de preparação de partes preservada. Evidências em tests/saida/reparos/upload-aguardando-*.png e artefato do CI. Skill de estética humana aplicada: ação principal é acompanhar o preparo sem repetir o envio; alvo principal 48 px, fechamento 44 px, foco mantido no diálogo, sem colisão na viewport. Resultado: APROVADO COM LIMITAÇÃO — serviços e interação simulados; sem validação em aparelho físico.

Somente frontend remoto: WebKeeper carrega a página do site; nenhuma alteração nativa. Mantém Android 2.4.15/code22 e seus artefatos publicados. Site 7.40.40. Backup remoto backup/pre-corrigir-upload-video-20261031 em 9e6d0e5a12a6bb6810bf8b8520f5d5da897f0d8c; sem migração de dados. Rollback por revert deste lote, preservando a preparação existente. CI, merge e deploy serão registrados na PR ao término.
