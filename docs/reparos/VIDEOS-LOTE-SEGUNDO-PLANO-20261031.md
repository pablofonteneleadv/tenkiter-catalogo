# Vídeos em lote no rascunho — 7.40.41

Tarefa humana: selecionar fotos e vídeos, continuar configurando a postagem e encontrar todas as partes prontas na ordem correta, sem acompanhar um modal por original.

## Comportamento entregue

- A seleção múltipla inclui imediatamente cada original na lista. Os vídeos começam sem confirmação intermediária; preparar não publica.
- Até três originais são preparados simultaneamente, respeitando o limite atual do servidor por conta. Os demais ficam no aparelho e começam automaticamente quando surge vaga. Não se aumentou quota, armazenamento ou custo.
- Cada original mostra envio percentual, recebimento, espera do processador, processamento, conferência ou erro. Percentual só representa bytes enviados; não se inventa percentual do encoder.
- Original e identificador ficam no rascunho IndexedDB. Fechar Postagens não interrompe as tarefas. Reabrir/recarregar retoma automaticamente sem escolher o original novamente quando o rascunho está disponível.
- A chegada dos resultados substitui somente o original correspondente, de uma vez e em ordem, sem seguir a ordem de término das conversões. Fotos válidas permanecem no lote. Foco, seleção de texto e posição de edição são preservados.
- Partes ficam disponíveis automaticamente. Prévia opcional “Ver vídeo” na própria lista, sem modal obrigatório. Publicar/agendar exige confirmação final e permanece indisponível enquanto houver original pendente ou com erro.
- O máximo por parte continua configurável antes da seleção; cada original conserva a configuração usada. Limites de tamanho/duração, vínculo das partes, ordem e regra de publicação imediata das partes permanecem.
- Falhas temporárias de consulta são retomadas automaticamente sem reenviar. Falha de upload/conversão oferece Tentar novamente com o arquivo salvo, sem novo seletor. Remover cancela o acompanhamento/upload; não apaga originais privados no servidor.
- Os scripts do admin passam a referenciar explicitamente 7.40.41. Mensageiro e fluxos antigos de recuperação conservam a API interativa; a nova seleção de Postagens usa a API em segundo plano.

## Limites reais

O navegador não garante upload com o aplicativo encerrado ou suspenso pelo Android. Enquanto se usa o painel, o envio continua. Após o recebimento, o servidor processa independentemente da tela; na volta ao painel, o rascunho retoma acompanhamento/download. Não é um novo serviço nativo Android e não exige APK.

O processador continua periódico no GitHub, sem prazo de início garantido. Se o usuário limpar o armazenamento do navegador, usar outro aparelho ou negar armazenamento local, não se pode garantir retomada local. Falha ao salvar é indicada pedindo manter o painel aberto. Preparações iniciadas na versão antiga não continham o original/id completo no rascunho; este lote não inventa associação automática com seleções históricas já utilizadas.

## Verificação e revisão humana

`tests/postagens_video_status.py`: dois uploads retidos simultaneamente, bytes originais, navegação/legenda durante envio, recarga com recuperação por ID, segundo original terminando primeiro, erro temporário de consulta, entrada automática das cinco partes + foto na ordem, foco preservado e nenhuma publicação implícita. 320/390/412/1440 px, texto 130% e altura 470 em 320; axe sem violações graves/críticas. Screenshots de andamento e pronto em `tests/saida/reparos/videos-lote-*`.

`tests/video_lote_limites.py`: três ativos, quarto inicia após liberação, cancelamentos e retry usando os mesmos bytes. `postagens_avulsas.py`: seleção da peça/fotos, reordenação, preparação em segundo plano/remover, vídeo compatível sem conversão e publicação simulada. `video_upload_feedback.py` e `video_validacao.py`: contratos interativos e validação preservados. Teste novo de limite incluído no CI obrigatório.

Alvos novos de remover/repetir: 48 px; configuração 48 px; resumo de prévia 44 px. Não foi adicionada barra fixa/overlay. Capturas anteriores da PR338 documentam o modal bloqueante substituído; capturas novas documentam lista livre. Evidências e logs externos em `/workspace/review/research/lote-*`, screenshots no artefato de CI.

Resultado visual: **APROVADO COM LIMITAÇÃO**, condicionado ao CI obrigatório verde antes do merge. Interface e serviços simulados; sem aparelho Android físico, envio/publicação real ou serviço pago como teste.

## Backup e publicação

Ponto anterior: `2c88ce5199328fb55e38b886b79994256b537e20`, branch remota `backup/pre-videos-lote-20261031`. Mudança de frontend/testes, sem migração ou alteração de dados do servidor. Reverter os scripts/HTML restaura a interface anterior; preparações remotas são preservadas. PR, CI, merge e resultado de deploy serão registrados na descrição da PR e no relatório de entrega após confirmação pública.
