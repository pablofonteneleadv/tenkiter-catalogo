# Status 2 — indisponibilidade da agenda

Diagnóstico em05/11: último Status2 confirmado às11:10UTC (08:10 de Brasília),22erros,1em processamento e13agendados na consulta inicial. Outros canais continuavam publicando. Números são fotografia da consulta, não total permanente.

GET autenticado da Wafly: conexão ativa, Status suportado, `contactsReady=false`, mensagem de falha ao confirmar agenda/privacidade. Consulta de uma tentativa retorna404/REQUEST_NOT_FOUND. Nenhum token, telefone ou conteúdo privado incluído aqui. Uma chamada ao reinício normal da instância retornou conexão ativa/recovery_action=none/requires_qr=false; não recuperou a agenda. Não houve desconexão, troca de público, limpeza de fila nem republicação manual de itens.

A API documenta que Meus contatos exige agenda sincronizada. No painel da própria Wafly, “Sincronizar contatos” repete GET de capacidades; a consulta já foi realizada e continuou indisponível. Referências: [API](https://wafly.com.br/api-docs), [OpenAPI](https://wafly.com.br/openapi.json). Falha do provedor precisa ser corrigida nele; o código local não deve inventar uma audiência ou considerar publicação confirmada.

## Correção

Sondagem única por passagem da fila quando há Status2 direto vencido. Indisponibilidade mantém item/horário e não ocupa vagas de envio dos outros canais. Assim que a agenda volta, aplicam-se normalmente os intervalos e cotas existentes; não há cópia do item. Envio que recebe AUDIENCE_UNAVAILABLE entre sondagem e POST também permanece agendado, sem marcador de confirmação ou novo ID. Timeouts de envio continuam no fluxo de consulta do mesmo pedido. Recibos antigos do Wame preservados. Teste de conexão deixa de anunciar saúde quando contactsReady=false.

Erros históricos não são reagendados automaticamente: podem conter envios incertos e precisam de conferência antes de recuperar. Não foi feita mutação manual dos dados de produção.

## Validação

- worker_wafly:38verificações, incluindo bloqueio, retomada única, corrida da agenda e40agendados preservados.
- worker_zap_proativo:27; worker_canal:11; worker_postagens_limites: aprovado. Serviços simulados, sem publicação real de teste.
- Conferência de fila em390×844,412×915 e1440×900; componentes existentes preservados, sem CSS/HTML alterados. Evidência local em outputs/status2. Não é validação Android físico.
- Graphify start/query falharam no Windows por árvore recursiva de processos/timeout; nenhuma relação de cache antigo usada como prova. Verificação por fontes e testes diretamente.
- Base pública36eb19e e privada4f76260 conferidas antes da edição. Backup local catalogo-pre-status2.zip e branch backup/pre-status2-20261105.

Publicação e condição final do provedor devem ser registradas após CI/deploy. RH/AppsScript não são alterados neste reparo.
