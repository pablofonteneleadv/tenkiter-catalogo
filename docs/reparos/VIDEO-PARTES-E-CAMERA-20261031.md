# Vídeo completo em partes e câmera de atendimento

## Comportamento

Postagens prepara o original completo quando ele ultrapassa 30 segundos: 59 s → 30+29; 75 s → 30+30+15; 90 s → 30+30+30. O máximo de cada parte pode ser escolhido entre 3 e 30 segundos. Se o resto ficaria abaixo de 3 segundos, ele é redistribuído entre as duas últimas partes (61 s → 30+28+3), sem perder conteúdo. Quando o navegador não consegue ler a duração (por exemplo, codec não decodificado no aparelho), FFprobe define o plano no processador, sem descartar o restante do original. O original é enviado uma vez à preparação privada, e os resultados só entram na postagem depois da prévia e da ação “Usar as partes”. O usuário continua confirmando a publicação; preparar não envia.

As partes mantêm identidade de sequência e número/total. A primeira usa o agendamento normal. As seguintes aguardam a confirmação efetiva da anterior, inclusive quando a API devolve resultado incerto. A regra “Partes do mesmo vídeo: enviar em sequência, sem intervalo”, habilitada por padrão nas Regras, dispensa o intervalo editorial entre partes. A pausa de início é aplicada à primeira; uma sequência já iniciada pode terminar sem ser interrompida pela pausa editorial. Os limites de volume dos canais continuam valendo. Desabilitar essa regra mantém ordem e aplica o intervalo mínimo entre confirmações. Nenhum recebimento incerto é reenviado automaticamente.

Um Durable Object coordena a fila desta loja e usa alarmes para continuar após uma execução, sem depender do celular aberto ou do intervalo do cron. Publicações independentes não entram no meio de uma sequência iniciada no mesmo canal; depois dela voltam a respeitar o intervalo mínimo. Erro interrompe a sequência até correção/consulta ou cancelamento. “Cancelar partes pendentes” mantém recibos e partes já publicadas. Para alterar uma sequência já cadastrada, cancelar suas partes pendentes e preparar o original novamente; nada publicado é desfeito. A interface não oferece mover/repostar uma parte isoladamente. Stories manuais continuam exigindo ação humana, em ordem.

O servidor só concede essa regra para uma sequência completa do mesmo trabalho privado, pertencente ao usuário e com hashes correspondentes aos arquivos preparados. Campos inventados no pedido não liberam o intervalo. Cadastro é atômico para todos os destinos; faltas, reordenação ou mídia alterada são recusadas.

## Câmera e Mensageiro

O clipe oferece “Gravar vídeo” e “Escolher da galeria”; seleção múltipla permanece. O menu cabe na viewport, inclusive junto ao compositor. Apps antigos orientam atualizar para obter a gravação controlada.

Android 2.4.14/code 21 adiciona captura própria, sem depender dos extras opcionais da câmera de outro aplicativo: MP4, H.264, até 720p/30 fps, áudio AAC mono a 64 kbps, vídeo a 1 Mbps e teto de 14.000.000 bytes. O orçamento de 90 segundos com margem de 10% é 13.167.000 bytes, abaixo do teto e dos 15.000.000 bytes do Mensageiro. Atingir o teto encerra a gravação e oferece conferir; não envia. Permissões são solicitadas no uso, e falhas de câmera/arquivo recusam o resultado com mensagem legível. “Usar este vídeo” devolve à conferência normal do atendimento. WhatsApp e Instagram usam o mesmo orçamento. Mensageiro preserva 90 segundos em um vídeo; a divisão é de Postagens.

O tamanho efetivo e o suporte de câmera dependem do aparelho. Orçamento, compilação, testes nativos e vídeo sintético não equivalem a gravação física homologada. Não foram feitas instalação/atualização pelo botão nem gravação/envio em aparelho físico. O app não declara compatibilidade real de um fabricante sem essa verificação.

## Limites e recuperação

Originais de até 40 MiB/30 minutos; no máximo 60 partes e 200 publicações na fila, considerando destinos. Cada parte fica entre 3–30 s e até 9,5 MiB. A preparação reserva até 256 MiB para o conjunto de saídas dentro do teto temporário existente de 512 MiB. O processador ajusta o orçamento por parte, conserva enquadramento, áudio e ordem, e não ativa conversor pago. Preparações privadas expiram em 24 h; agendamentos já confirmados usam as cópias públicas e não dependem dessa validade.

O trabalho não promete latência zero de API, aprovação de conta ou conversão instantânea. Depois de confirmada uma parte, a próxima é iniciada sem a pausa editorial; processamentos/recibos pendentes e cotas do provedor ainda podem fazer esperar.

Migração aditiva: três colunas em postagem, tabela video_parte e namespace Durable Object. Nenhum dado existente é apagado. Backup de código remoto: backup/pre-video-partes-20261031, SHA 8a1e9ead9b17f2457a16ba237c58ae7cf5989d53. Snapshot privado anterior e recuperação D1 existentes preservados; não foi feito corte de dados. Rollback operacional deve preservar o binding, a classe e a migração do coordenador já publicados e os metadados de sequências; não voltar ao publicador antigo que desconhece a ordem. Desabilitar partes rápidas, suspender novas preparações e corrigir por PR preserva recibos e arquivos. Não excluir namespace ou tabela como rollback automático.

## Validação

Testes: encoder real com áudio e cores diferentes por trecho (ordem temporal); 59/75/90 s e cauda curta; 90 s sintéticos 720p/H.264/AAC aceitos inteiros no Mensageiro; D1 real com hashes/ACL/atomicidade/agendamento/confirmação/erro/cancelamento; seis partes no runtime Cloudflare com alarmes e provedor simulado, inclusive atrás de 45 outras postagens atrasadas; interface 320/390/412/1440 com prévia, cancelamento e seleção; menu do clipe/câmera/galeria múltipla/atualização de app antigo. Regressões de fila, canais, importador e atendimento também verificadas. Nenhuma mensagem/publicação real ou conversão paga usada em teste.

Skill de estética humana aplicada: tarefa é preparar o vídeo inteiro, conferir as partes e publicar em ordem, e escolher câmera/galeria no atendimento. Campos e ações principais de 44–48 px; retorno/Escape/foco e reflow a 320 px preservados. Evidências em tests/saida/reparos e nos artefatos do CI. Resultado: APROVADO COM LIMITAÇÃO — interação e câmera simuladas; sem aparelho físico.

Merge, CI, assinatura, manifesto público, deploy e saúde real do coordenador serão registrados na PR ao término. A existência de candidato Android em rascunho não significa publicação em produção.
