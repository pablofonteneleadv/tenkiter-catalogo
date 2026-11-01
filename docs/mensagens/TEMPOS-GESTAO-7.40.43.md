# Gestão por tempo observado — 7.40.43

Tarefa principal: saber onde há clientes esperando e como a equipe está usando o Mensageiro, distinguindo presença, interação e resultado.

## Funções

- Entradas, abertura de conversas e Espiar deixam de contar como ações de atendimento e de ocupar a trilha operacional. Registros antigos permanecem no banco para auditoria; as consultas e totais os excluem. Respostas, encerramentos e alterações operacionais continuam registrados.
- **Equipe → Tempo observado de uso**: online com tela visível, interação recente, conversa em uso, redação, ausência de interação e pausa em tela. Detalhes mostram os últimos 40 períodos unidos. Fontes simultâneas (abas/celulares) não duplicam segundos. Todo o bloco considera todos os canais, até31dias do período escolhido, e mostra início de cobertura e consulta parcial.
- **Minha disponibilidade**: Disponível/Em pausa para a própria conta em todos os aparelhos. Não bloqueia mensagens ou notificações. A pausa é declaração do atendente, não uma conclusão baseada em inatividade. No APK também há Disponibilidade no menu nativo.
- **Agora → Pendências por tempo de espera**: até5min, mais de5até15, mais de15até60 e mais de1h. Cada faixa filtra a fila de prioridades. Usa tempo corrido/expediente conforme a escolha existente; espera do cliente não entra como atraso da equipe.
- Metas por canal, carteira, mediana/percentil90, primeira resposta, encerramentos e qualidade dos dados continuam integrados para contextualizar os tempos. Ações e minutos não viram pontuação de produtividade.

## O que é medido

Sinais autenticados a cada45s, somente enquanto a tela está em uso. Interação recente usa janela de2min; redação requer interação no compositor nos últimos30s. Conversa em uso é uma estimativa de leitura/redação, não prova de atenção ou trabalho efetivo. Não são coletados texto digitado, teclas, imagem da tela ou conteúdo das mensagens para essa medição.

O servidor usa seu próprio relógio. Intervalos maiores que75s não são preenchidos; mudanças de estado sem classificação confiável ficam separadas; ocultar/retornar não preenche o tempo em segundo plano. Relatórios unem períodos por pessoa, recortam o intervalo solicitado e não somam aparelhos concorrentes. Sequências por fonte evitam inverter sinais atrasados. Limite de12fontes simultâneas por pessoa; consultas com mais de50mil intervalos indicam amostra parcial. Períodos consecutivos iguais são comprimidos para reduzir gravação/armazenamento.

Não é relógio de ponto, prova de leitura, tempo fora do aplicativo ou fiscalização de pausas sem tela. Instalações antigas sem sinais detalhados não recebem tempos históricos inventados. O detalhamento começa após a atualização. APK2.4.19/code26 acrescenta sinais da tela nativa e distingue a WebView oculta da tela remota visível.

## Dados e segurança

Migração somente aditiva: msg_tempo_sinal, msg_tempo_intervalo e msg_disponibilidade. Sem apagar histórico. Tempos detalhados só saem pelo endpoint Admin total; cada pessoa só pode alterar a própria disponibilidade. Sem envio real, alteração de cliente ou IA paga como teste. Cobertura finita e ausência de sinal são exibidas, sem atribuir ausência ao atendente.

## Pesquisa aplicada

Referências oficiais consultadas em31/10/2026:

- [Intercom: painel em tempo real](https://www.intercom.com/help/en/articles/5784131-real-time-dashboard): presença, última observação, carteira e resposta são medidas distintas.
- [Intercom: status do atendente](https://www.intercom.com/help/en/articles/6522874-manage-teammate-inbox-status): disponibilidade informada e tratamento de ausência.
- [Zendesk: atividade dos agentes](https://support.zendesk.com/hc/en-us/articles/6443347506970-About-the-Agent-activity-page): períodos por estado e separação de tempo não rastreado.

Adaptação ao projeto: priorizar atrasos/carga, tempos com cobertura explícita e resultados confirmados. Não ativar ranking por ações, taxa de venda sem pedidos/pagamentos ou satisfação sem pesquisa. Métricas por hora ativa só serão confiáveis depois de haver cobertura representativa; não dividir resultados antigos por poucos minutos recém-medidos.

## Validação e limites

SQLite com serviços simulados: união entre fontes, recorte de período, compressão, lacunas, pausa, ocultação, autoria, ACL e histórico preservado sem inflar ações. Interface320/390/412/1440, teclado, texto ampliado e axe. Android: testes unitários/lint/build e assinatura original via Actions. Sem Android físico para homologar instalação, câmera ou comportamento real do fabricante; registrar essa limitação na entrega.


## Pontuação de clientes e retomadas

**Clientes e retomadas** mostra a prioridade de relacionamento (0–100), seus motivos e a conversa para revisar em Espiar. Só sugere retomada se o cliente foi encerrado por falta de resposta e não tem outro atendimento aberto vinculado. Não envia mensagens. Novas entradas mantêm a ordem por urgência/espera; o desconto de uma retomada não rebaixa quem voltou a escrever.

Padrões editáveis em Configurações → Pontuação e prioridade dos clientes:

| Motivo | Pontos por evento | Validade |
|---|---:|---:|
| Vendeu no atendimento | +10 | 90 dias |
| Concluído | +2 | 30 dias |
| Cliente parou de responder | −3 | 14 dias |
| Engano/spam | 0 | 14 dias |

Base neutra50; no máximo5eventos por motivo. A nota é limitada de0a100: Alta≥70, Normal40–69 e Baixa<40. Encerramentos idênticos do mesmo cliente vinculado, no mesmo instante e motivo, contam uma vez entre canais. Eventos expirados não influem. Não se une cliente pelo nome; usa a vinculação registrada, com fallback separado por conversa. Falta de histórico não significa ausência de compras, e Vendeu não comprova pagamento ou faturamento. As sugestões de retomada ficam pela pontuação e, no empate, pelo encerramento mais antigo.

Regras têm versão e auditoria, sem reescrever encerramentos. Consulta de pontuação usa cache de até5min, limite de20mil eventos e aviso de amostra parcial; até500clientes nas sugestões. O bloco usa os próprios prazos das regras, distintos do período de produtividade. A central passa a ter6 abas e22 grupos de configurações. Testes cobrem expiração, limites, duplicatas entre canais, conversa reaberta, urgência preservada, recálculo por versão, auditoria e ACL.

## Revisão visual

APROVADO COM LIMITAÇÃO: interfaces verificadas em320/390/412/1440, altura470/texto130%, axe sem críticas/sérias, teclado, detalhes de períodos/pontos, edição de regras e retorno. Alvos da central≥48px; tabelas viram blocos no celular; não há rodapé fixo sobre as ações. Detalhes abertos e seu foco são preservados na atualização. Referência anterior7.40.42; capturas do lote ficam no artefato de evidências do CI. Sem Android físico.

Backup de código anterior: branch remota `backup/pre-tempo-atendimento-20261031` no commit `67f768a3c3d01a61e39ef8fa3807957b84769ff9`. Migrações aditivas, histórico preservado. Bookmark D1 pré-deploy registrado somente no Cofre privado (retenção finita do Time Travel). APK de produção anterior2.4.16/code23; candidato deste lote2.4.19/code26. Hash/assinatura e execução final constarão no PR e registro de entrega. Instalação em aparelho físico não homologada.

## Encerramento, cortesias e retorno

Configurações → Encerramento e retorno reúne regras para os três canais. Padrão: confirmação/despedida exata em até120min após Concluído/Vendeu mantém encerrado, preserva mensagem e mostra rótulo Cortesia. Não dispara boas-vindas/ausência ou push por padrão. A gestão pode ligar a notificação sem reabrir o atendimento. Expressões completas editáveis, até60, e motivos elegíveis escolhidos explicitamente. Pergunta, pedido adicional ou mídia nunca é classificado por conter apenas uma palavra conhecida. Falta de resposta/engano ficam fora da cortesia por padrão.

Retorno real em até24h corridas preserva responsável e início do atendimento anterior, fica em Em atendimento e não volta aos Pendentes. Sem atendimento humano anterior observado, ou fora da janela, segue a abertura normal. Prazo, retenção de responsável e automações de retorno são configuráveis. O critério de última mensagem da lista é preservado; não se congela uma posição numérica. Na conversa, **Tratar como solicitação** permite corrigir uma cortesia; repetição não reabre um novo encerramento. Mensagens e encerramentos passados permanecem no banco. Cortesias não entram como perguntas aguardando resposta nas métricas.

## Dois visuais da lista

Padrão **Não respondidos primeiro**: Aguardando resposta da loja acima; Demais conversas abaixo. Cada seção conserva a ordem atual, mais recente primeiro. Canais vinculados do mesmo cliente permanecem juntos; se qualquer canal aguarda resposta, todo o bloco fica acima. O critério de espera considera entrada real não respondida e exclui mensagens automáticas/cortesias; marcar não lida continua respeitado. Encerrados mantém sua lista sem subdivisão.

Mais → Visual da lista permite alternar livremente com **Lista contínua (ordem atual)**. Preferência por conta e aparelho; compartilhada entre tela nativa e atendimento completo no mesmo APK. Não muda fila do servidor, não envia mensagem e não altera regras de outros atendentes.

## Evidência deste lote

- 436 cenários existentes de conversa aprovados; testes específicos de tempos, pontuação, encerramento, equipe, gestor, push e canais.
- Jornadas reais em320/390/412/1440: seis abas,22grupos, salvar regras, disponibilidade, Espiar retomada e voltar ao gestor, alternância de lista, persistência e canais vinculados. Teclado/altura reduzida/texto130% e axe sem falhas críticas/sérias.
- Testes usam somente serviços e clientes simulados. Nenhum envio real, publicação em canal ou IA paga.

APK candidato validado no Actions [41264001565](https://github.com/pablofonteneleadv/tenkiter-catalogo/actions/runs/41264001565): unitários/lint/build, assinatura original comparada ao2.4.16, certificado SHA256 `09ed81d57207c72a9d49cc5065483a22f57a15528d8a626aa3a99467e1b59a76`. APK2.4.19/code26, 4.621.917 bytes, SHA256 `b518a93c3fc2ccc0cf0abe499b1f01c8f932b7192a89c575fa505fe903f88f9b`. Candidato permanece draft até o merge aprovado; deploy oficial promove os mesmos bytes e confere manifesto público.
