# TENKiTER Mensagens — reconciliação da lista e plano restante

Revisão de 29/10/2026. Referência: **“TENKiTER Mensagens 2.3 — revisão e plano de melhorias”**, fornecida pelo proprietário, somada aos pedidos posteriores desta conversa, inclusive busca por imagem.

Base publicada conferida nesta revisão: site **7.40.27**, main `9227ad36530a091c5095e422d45ad0ed376554aa`; instalador documentado **2.4.5**. A edição rápida de disponibilidade está neste lote 7.40.28; publicação só pode ser considerada concluída após CI/deploy e conferência do commit público.

“Implementado” significa que há fluxo e suporte no código publicado de referência. Não significa que foi homologado no celular físico nem que uma automação está ligada na configuração real da loja. A auditoria não enviou mensagens, executou campanhas, consumiu IA ou alterou produtos reais.

## 1. Os 14 itens da lista original

| # | Item original | Estado atual | O que falta |
|---|---|---|---|
| 1 | Alerta de falha + base estável | Parcial | Existem faixa de saúde, registro de falhas e fila de entrada do Zernio. Faltam previsão de cota, proteção uniforme da entrada Wafly/Meta, recuperação do que faltou e atualização realmente orientada a eventos. O código não comprova o plano de cobrança vigente. |
| 2 | Etiquetas | Entregue como **Etapa da venda**, conforme pedido posterior | Etapas, cores, filtro e ligação ao funil existem. “Etiquetas” genéricas, independentes da etapa comercial, ficaram reservadas para finalidade futura; não devem ser confundidas com a etapa já entregue. |
| 3 | Saudação e ausência | Implementado | Horário, textos e feriados são editáveis; padrões desligados. Falta conferir a configuração efetivamente escolhida pela loja e homologar o envio real. Não inventar horário ou ligar respostas sem texto configurado. |
| 4 | Notas internas | Implementado no núcleo | Há nota para equipe, uso ao espiar, filtro Com notas, acesso às notas e exclusão com log. A **@menção a um colega**, citada na comparação original, ainda falta. |
| 5 | Atribuir atendente | Parcial | Assumir, liberar, responsável e Minhas existem. Faltam métricas por atendente e uma regra de acesso de dados para quem só pode ver as próprias conversas, se esse perfil for usado; filtro Minhas não é restrição de segurança. |
| 6 | Funil de vendas | Implementado | Etapas, movimentação de cartão e alternativa por toque existem. Não consta como pendente criar o quadro novamente. Relatórios de conversão e tempo por etapa ainda faltam. |
| 7 | Pedido na conversa | Ausente no Mensagens | Falta transformar seleção em orçamento/venda com itens, total, cliente, pagamento e relação ao atendimento. Selecionar e enviar links de produtos não é pedido integrado. O fluxo formal de pedidos desligado não deve ser reativado como efeito colateral. |
| 8 | IA no atendimento | Parcial | Existe copiar conversa para IA externa. Faltam resumo, sugestão de resposta e recomendação integrada de peças disponíveis, sempre para revisão do atendente. IA de foto/cadastro em outro módulo não atende esse item. |
| 9 | Lembrete de retomada | Implementado na forma atual | Retomar identifica conversas paradas e há resposta pronta. Critérios atuais usam janela de 1 a 30 dias; lembretes configuráveis por compromisso/data e sequência automática não estão implementados. |
| 10 | Ficha do cliente | Parcial | Nome, localização, preferências, tamanhos, gênero, tecido, cores, canais, notas e etapas existem. “Compras” são referências a encerramentos Vendeu; faltam compras com itens/valores e listas geográficas completas. |
| 11 | Agendar mensagem | Implementado | Escrever texto, escolher horário de Fortaleza, listar, cancelar e acompanhar situação existem. Não confundir com campanha, sequência ou agendamento de toda modalidade de mídia. Falta homologar entrega real no horário previsto. |
| 12 | Meta de tempo de resposta | Parcial | Há tempo de espera e métricas. Faltam meta configurável, contagem conforme expediente, alerta de vencimento e escalonamento por responsável. |
| 13 | Pesquisa de satisfação | Ausente | Falta pergunta pós-atendimento, coleta de resposta e painel de satisfação. |
| 14 | Envio em massa | Ausente no Mensagens | Faltam segmentos, consentimento, descadastro, prévia, lotes, pausa e acompanhamento. Agendar uma mensagem por conversa não cobre campanhas. A implementação deve seguir as possibilidades do canal oficial e modelos exigidos. |

## 2. Pendências de base, com proposta de implementação

### A. Receber antes de enriquecer e recuperar perdas — prioridade P0

**Ainda falta:** garantir o mesmo comportamento durável nos webhooks dos três canais. O Zernio já guarda payload e tenta novamente; Wafly/Meta ainda têm processamento síncrono antes da conclusão da gravação. O contexto/story ainda pode ser resolvido antes do INSERT da mensagem.

**Proposta:** entrada autenticada → registro durável com ID do provedor → resposta de aceite → processamento com deduplicação → enriquecimento posterior de story/mídia. Usar fila separada da cota que pode estar falhando; adicionar fila de falhas e ação de recuperação. Mostrar inicialmente mensagem e estado “Carregando anexo” quando necessário, sem esperar o story para ela aparecer.

**“Buscar o que faltou”:** consultar, pelo servidor, histórico recente disponível na Wafly, por canal e intervalo; mostrar prévia e importar por ID do provedor, sem duplicar. Primeiro confirmar quais endpoints e retenções a Wafly contratada disponibiliza; se o provedor não fornecer histórico, informar essa limitação em vez de prometer recuperação impossível.

**Aceite:** simular story lento, cota indisponível, repetição de webhook, falha de rede e reprocessamento. Nenhuma duplicação; mensagem básica aparece antes do anexo; fila mostra o que permanece sem recuperação.

### B. Cotas, limpeza e monitoramento — prioridade P0

**Ainda falta:** contador/alerta preventivo de cota; o aviso atual reage a falhas já ocorridas. A limpeza está dividida em lotes, mas ainda escreve contatos temporários/plano no D1.

**Proposta:** conferir plano vigente e capacidade no painel da infraestrutura; medir gravações/leituras reais; alertar por limites adequados ao plano (70/85/95% quando houver cota aplicável); armazenar snapshots e staging em objetos, mantendo no D1 cursor, resumo e resultado necessário. Suspender tarefas administrativas pesadas antes de afetar mensagens. Painel mostra último recebimento, atraso da fila e falhas por canal; silêncio de clientes sozinho não deve gerar alerta de pane.

**Aceite:** carga simulada da limpeza não bloqueia ingestão; alerta distingue falta de tráfego de falha de recebimento. Não assumir plano pago nem quota ilimitada sem conferência.

### C. Atualização por eventos — prioridade P1

**Ainda falta:** a tela consulta novidades periodicamente, aproximadamente a cada quatro segundos; isso não é conexão ao vivo por eventos.

**Proposta:** canal autenticado SSE/WebSocket, com cursor de retomada, isolamento de usuário e publicação de eventos após gravação. Manter polling com recuo como reserva. Ao retomar o app ou tocar numa notificação, atualizar a conversa e a lista imediatamente.

**Aceite:** medir tempo entre gravação e aparição; recuperar evento perdido/reconexão sem duplicar; respeitar permissões; comparar leituras antes/depois. Entrega de notificação e atualização de lista devem referenciar a mesma mensagem persistida.

## 3. Pendências comerciais e de atendimento

| Prioridade | Pendência | Proposta concreta | Critério de conclusão |
|---|---|---|---|
| P1 | **Busca por imagem** | Câmera/foto em Produtos e ação “Encontrar no catálogo” na foto recebida. Usar hash para fotos idênticas e embeddings visuais (ex.: CLIP/SigLIP) das fotos do catálogo em índice vetorial para peças semelhantes. Indexar alterações por produto/foto; retirar arquivados do resultado. Combinar tamanho, gênero, tecido, cor e estoque. Não indexar automaticamente histórico/fotos pessoais dos clientes. Validar fornecedor, compatibilidade e custo antes de ativar a inferência. | Fotos exatas e parecidas retornam candidatos reais, com preço/tamanho atuais; diferenciar correspondência exata de semelhante e oferecer “Não encontrei”. Atendente escolhe; nada enviado automaticamente. Avaliar acerto e tempo com conjunto de teste da loja. |
| P1 | **Métricas por atendente e etapa** | Registrar autoria pelo ID do usuário em resposta/atribuição/movimento, guardando nomes como apresentação. Agregações por período, canal, responsável e etapa: entradas, primeira resposta, tempo de espera, encerramentos e conversões. Sinalizar truncamento/paginar em vez de ocultar limites de volume. | Totais por pessoa reconciliam com o geral; transferência não atribui todas as respostas ao último dono; números de venda só incluem registros de venda existentes. |
| P1 | **SLA com alerta** | Definir meta por canal/equipe e expediente. Exibir relógio discreto na lista, fila de vencidos e aviso para responsável/gestor, com deduplicação. | Espera pausa conforme regra fora do expediente; resposta resolve alerta; sem alertas repetidos sobre o mesmo atraso. |
| P1 | **Filtros combináveis** | Separar situação (aberta/encerrada/retomar), responsável e prioridade (não lida/falta responder/notas), mantendo canal e etapa. Chips de resumo removíveis, salvar por usuário. | Combinações como “Minhas + Não lidas + Instagram” funcionam sem um filtro apagar silenciosamente o outro; números refletem o mesmo recorte. |
| P1 | **Permissão de ver somente próprias conversas** | Acrescentar escopo de dados no servidor, além das permissões de ferramentas: próprias/equipe/todas. Aplicar a lista, conversa, mídia, notas, exportação e métricas. | Usuário não consegue abrir por URL/ID conversa fora do escopo. Admin gerencia a regra pelo cadastro de acesso. |
| P2 | **IA integrada ao atendimento** | Gaveta IA com Resumir, Sugerir resposta e Sugerir peças. Contexto limitado à conversa autorizada e consulta ao catálogo; limite de custo e auditoria. Resposta vai para rascunho editável. | Não inventa estoque, preço ou pagamento; não envia sozinha; respeita notas privadas e autorização de cada ferramenta. |
| P2 | **Orçamento/venda ligado à conversa** | Começar com registro leve a partir da seleção: itens, tamanhos/cores, total, cliente, responsável e situação. Pix/link usa dados reais configurados, nunca placeholder enviado. Reserva/baixa exigem operação idempotente e regra clara de estoque, com histórico e desfazer. | Reabrir conversa mostra itens/valor e situação da venda; repetição não duplica venda/baixa; não reativa pedidos formais desligados. |
| P2 | **Histórico de compras real** | Ligar ficha ao registro de venda, com data, peças, valores, pagamento e responsável. Manter separado o marcador antigo “encerrou como Vendeu”. | Não transformar encerramento em compra com valores fictícios; preservar histórico anterior. |
| P2 | **@menção nas notas** | Escolha de colega ao digitar @; salvar ID do destinatário, aviso interno e status de leitura. | Cliente nunca recebe nota; só pessoas com acesso à conversa veem conteúdo; exclusão preserva auditoria. |
| P2 | **Retomada por compromisso/data** | “Lembrar em…” na conversa, motivo, responsável e lista de vencidos; preenchimento de rascunho na abertura. | Lembrete não dispara mensagem automática; conclusão/adiamento deixam histórico; retomada atual continua funcionando. |
| P2 | **Satisfação pós-atendimento** | Pergunta curta opcional após encerramento elegível, nota e comentário, uma resposta por atendimento e relatórios. | Não enviar para grupos/spam; respeitar canal, intervalo, cancelamento e destinatário; separar satisfação de avaliação pública. |
| P2 | **Localidades completas** | Completar bairros de Crateús e localidades rurais/região com fontes verificáveis, tipo e município. Administração permite acrescentar/corrigir nomes; campo livre continua. | Não apresentar lista parcial como “todos”; evitar bairro em lista de distritos, duplicidade e perda dos textos já preenchidos. |
| P3 | **Regras/fluxos automáticos** | Evoluir saudação/ausência para regras simples: evento, condição, ação, janela e teste de simulação. Habilitação explícita, trava de repetição e histórico. | Fluxo pode ser pausado; não entra em loop nem envia repetidamente; versão simulável antes de ativar. |
| P3 | **Campanhas** | Segmentação autorizada, lista de destinatários, consentimento/opt-out, modelos do canal, aprovação da prévia, envio em lotes com limites, pausa e relatório. Usar API oficial conforme suporte, regras e preço vigente. | Sem disparo como teste; sem repetir destinatário; descadastro aplicado a futuras campanhas; orçamento visível. |
| P3 | **Etiquetas genéricas independentes** | Estrutura separada das etapas, com múltiplos marcadores por pessoa, cor e filtro, quando houver finalidade definida. | Não converter automaticamente etapas existentes nem perder os marcadores antigos que não são comerciais. |

A busca por imagem **não aparece como item próprio nos 14 da lista original**, mas entra expressamente neste plano porque foi solicitada agora e também consta no material anterior sobre a vitrine. Não existe hoje busca visual implementada no catálogo/Mensagens de referência.

## 4. Pedidos posteriores e limitações de validação

- **Edição rápida de disponibilidade:** lote 7.40.28 prepara tela compacta com apenas opções cadastradas, retirada de fotos/vídeos/tamanhos/cores e arquivamento inteiro. Salvar libera a tela após guardar a alteração localmente; servidor confirma em segundo plano, com pendência/retry. Precisa concluir CI/deploy para entrar como entregue. Se retirar a última foto ou toda a disponibilidade de tamanho/cor, o editor informa que vai arquivar a peça inteira ao salvar.
- **Tecido:** já foi movido após o nome no cadastro, destacado e integrado aos filtros da vitrine/Gestão/atendimento; Admin total gerencia nomes. Não listar novamente como funcionalidade ausente. Completar preenchimento de peças antigas é trabalho de dados, não algo que o código possa adivinhar.
- **Assinatura/identidade:** padrão pelo primeiro nome, persistência, edição e ocultação restrita a Admin foram implementados; falta homologar persistência/atendimento no aparelho do proprietário por tempo prolongado.
- **Instagram, vínculo de pessoas, volta por notificação, áudio, galeria e arquivos:** há correções e testes documentados. Falta homologação física e de integração real dos relatos anteriores. Testes simulados não justificam dizer que todos os sintomas foram eliminados no celular.
- **Prévia com miniatura:** composição e renderização de cartão foram implementadas. Falta confirmar thumbnail na entrega real ao destinatário no WhatsApp, inclusive após renovar cache e com imagens antigas.
- **Acabamento conforme HTML aprovado:** a base visual e as gavetas Filtros/Mais foram refeitas; a edição rápida está neste lote. Revisar telas novas durante cada entrega, sem reabrir o desenho anterior com botões gigantes e fileiras obrigando arraste lateral.
- **Site/app:** há interface web compartilhada e controles nativos; ainda falta homologar TalkBack, permissões, microfone/Bluetooth, codecs, Photo Picker dos fabricantes, suspensão/reabertura e notificações em Android físico. Não há ambiente físico conectado nesta revisão.
- **Peças relacionadas/completar look e avaliações públicas de produtos:** são pedidos do material da vitrine, não dos 14 originais de Mensagens. Permanecem frentes separadas: relação manual entre peças para iniciar, depois sugestões por características; avaliações apenas de compras verificadas, com moderação. Não confundir IA de fotos/looks com recomendação comercial pronta nem CSAT privado com avaliação pública.

## 5. Ordem recomendada de entrega

1. **Base e redução de risco de perda:** fila durável uniforme, enriquecimento depois, recuperação Wafly, alertas/cota e staging de contatos.
2. **Produtividade imediata:** concluir edição rápida, filtros combináveis, iniciar busca por imagem e homologar retornos/áudio/anexos no aparelho.
3. **Gestão do atendimento:** métricas por pessoa/etapa, SLA e escopo de acesso às conversas; concluir geografia.
4. **Venda assistida:** IA para rascunho, orçamento/venda ligado à conversa, histórico real e lembretes por data; @menções.
5. **Relacionamento e alcance:** satisfação, regras configuráveis, campanhas e recursos de vitrine relacionados. Campanhas não são pré-requisito para busca por imagem.

Cada lote: PR revisável, testes simulados do servidor e da jornada, acessibilidade/estética em 320/390/412/1440 e texto ampliado, backup recuperável, CI verde, deploy oficial e verificação do commit público. Não atribuir prazo fechado antes de validar APIs externas e o conjunto de teste de busca por imagem.

## 6. Evidências do código auditado

Referências referentes à base 7.40.27; linhas podem mudar nos próximos lotes.

- `instagram-worker/worker.js`: `receberZernioDuravel_`/fila (região 3381–3420), gravação de contexto antes do INSERT (2687–2690), webhooks Wafly/Meta (2793–2823), saúde (3981–3997), staging/limpeza (3820–3949), métricas (3953–3979), agendamento (3651–3690), retomada (4213–4216), notas (4274–4299), automação (4565–4568), ficha/compras por encerramento (3533–3648).
- `admin-mensagens.js`: copiar para IA (`copiarParaIA`), sem gaveta de IA integrada; Products textual/filtros em `abrirProdutos_`; `abrirAuto_`, `abrirAgenda_`, `abrirFicha_`, `abrirFunil_`, `saude_`, `poll_`.
- `mensagens-ficha.js`: cobertura declaradamente parcial de bairros/localidades, com texto livre; lista de municípios do Ceará.
- `docs/android/RETOMADA-AUDIO-GALERIA-2.4.5.md`: correções, pacote publicado e limites da homologação.
- `docs/mensagens/PREVIA-MINIATURA-7.40.24.md`: cartão/miniatura e limite de entrega real.
- `docs/ux/gavetas-proposta-20261029.md`, `docs/ux/tecidos-fluidez-20261029.md`: acabamento e tecido já entregues.

Ausência de rota/fluxo na busca de código foi usada junto com inspeção das APIs e telas, não como prova sobre serviços externos ou configuração de faturamento.
