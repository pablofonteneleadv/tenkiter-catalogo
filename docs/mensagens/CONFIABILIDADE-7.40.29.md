# Confiabilidade de Mensagens — lote 7.40.29

Tarefa: receber e preservar a mensagem antes de confirmar o webhook; permitir que o funcionário veja o texto sem esperar a cópia de mídia/story.

## Resultado do código

- Eventos autenticados e normalizados são persistidos no R2 privado antes do aceite. Não guardam cabeçalhos, segredo do caminho ou credenciais. A entrada deixa de depender de uma nova gravação D1 disponível naquele instante. Autenticação ainda exige leitura de configuração válida; se essa leitura ou o R2 falharem, o servidor não confirma falsamente que recebeu.
- Mensagem e atualização da conversa entram na mesma transação D1. Repetição do ID externo não incrementa de novo a atividade ou os não lidos. A conversa vazia de uma tentativa abortada permanece invisível até a retomada; não há migração de mensagens antigas.
- Texto/atividade são gravados antes de consultas remotas e anexos. Complementos possuem fila separada, com nova tentativa e reuso de arquivo já copiado quando uma gravação posterior falha. A notificação usa a mensagem persistida; falha do push não desfaz a entrada.
- Consumidores usam lease condicional por ETag; cron retoma com backoff e cursor, priorizando mensagens básicas. Eventos em erro não são apagados automaticamente. O processamento é pelo menos uma vez; a transação/deduplicação evita duplicar mensagens e contadores.
- Recibos Wafly aguardam a mensagem referenciada, se ela ainda pode estar no backlog. Referências desconhecidas sem mensagem pendente deixam de insistir após cinco minutos. Leitura antiga do celular não limpa mensagens mais novas ainda não lidas.
- A fila D1 antiga do Zernio continua sendo consumida; nenhum backlog anterior é removido por migração.
- Saúde distingue mensagens/anexos guardados de falha antes do aceite, também sinaliza contagem truncada de backlog. Cache de borda reduz leituras do armazenamento por aparelho. Reprocessamento manual exige a permissão de configurações no servidor; demais acessos recebem a tentativa automática.

## Limpeza de contatos

Relatório e plano novos usam objetos privados por página/lote; D1 mantém apenas o ponteiro, resumo e fila operacional. Planos e relatórios já iniciados no formato anterior continuam no caminho legado, sem apagar suas linhas no deploy. O backup no Drive e a exigência de cópia recente são preservados; o plano novo é vinculado à mesma cópia usada para produzi-lo.

Páginas, plano e resumo usam checkpoints condicionais. Plano e snapshot do relatório são publicados juntos; repetir a conclusão devolve o mesmo snapshot. A junção reserva o lote antes de chamar a ponte. Se houver efeito externo possível sem confirmação, conserva o marcador e bloqueia a repetição: uma nova cópia e relatório conferem o estado real. Não há promessa de exactly-once para uma ponte sem esse contrato.

Staging concluído é removido após persistir o resultado e liberar o ponteiro. Expurgo limitado remove apenas staging órfão com mais de sete dias, preservando o job ativo e abortando se seu ponteiro não puder ser validado. Não apaga contatos, mídia, backups do Drive ou dados das conversas.

## Privacidade e operação

Os prefixos privados não passam pela lista de formatos/chaves do Worker público de mídia. O teste tenta abrir um objeto privado existente e recebe404. A conta foi conferida em leitura: o acesso público gerenciado do bucket está desligado e não existem domínios públicos diretos do bucket. Nenhuma configuração de domínio ou cobrança foi modificada.

Logs de erro contêm somente evento, canal, motivo categorizado e tentativa. Não incluem texto, nome, telefone, payload, segredo ou URL de mídia. Eventos pendentes são preservados até confirmação; erros permanentes exigem acompanhamento do alerta. Não foi instituído descarte automático de mensagens recebidas.

## Validação e revisão estética

- Baseline:436 testes de conversa aprovados antes da alteração.
- Regressões:436 de conversa;49 de recebimento; push móvel; Worker de mídia41; Worker de Instagram406; novos testes de cota/transação/concorrência/ordem de recibos/story lento/reuso de mídia/privacidade; contatos R2 com25 verificações de falha e retomada.
- Nenhum teste usa WhatsApp, Instagram, IA paga ou contatos reais. Testes da ponte usam respostas simuladas.
- Interface em320×700,390×844,412×915,1440×900 e390×470, texto100/130%; controles44px, aviso compacto, sem excesso horizontal ou colisão com a navegação. Retry/erro/busca e axe WCAG AA; feedback da tentativa fica na própria faixa e não cobre a lista com toast. Corrigido o aviso de falha não aceita que ultrapassava110px com texto ampliado.
- Skill estética TENKiTER, referências/checklist e boas práticas Workers aplicadas. Evidências sintéticas em backup privado/artefatos do CI.

**APROVADO COM LIMITAÇÃO:** testes simulados e metadados de privacidade conferidos; sem Android físico nem envio real. O código não prova o plano financeiro vigente: a conexão OAuth atual não tem leitura de faturamento. Alertas preventivos percentuais de cota ainda requerem fonte de uso e plano confirmados, sem inferir que a conta é gratuita ou paga.

## Limites externos e sequência

A documentação pública Wafly (`api-docs`, `openapi.json`, tutorial de webhook) oferece lista/metadados de chats, sem histórico completo de mensagens com IDs e paginação por intervalo. Não foi criado um botão que finge reconstruir mensagens por uma última prévia. Este lote recupera os eventos já aceitos no nosso servidor; recuperação de perdas anteriores ao aceite depende de contrato de histórico/replay do provedor.

Depois da publicação: atualização por eventos, busca por imagem e produtividade, seguidas pelas demais frentes do plano. Fonte do roteiro: `docs/mensagens/PLANO-RESTANTE-20261029.md`. Frontend e Workers usam o workflow oficial; nenhum Apps Script ou APK novo é necessário neste lote.
