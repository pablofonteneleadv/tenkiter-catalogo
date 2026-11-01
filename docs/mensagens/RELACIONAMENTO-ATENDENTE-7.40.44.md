# Relacionamento para o atendente — 7.40.44

Tarefa humana: consultar rapidamente o histórico do cliente para escolher a abordagem, mantendo nome, mensagem e resposta como elementos principais.

## Interface

- Card individual com eventos registrados: indicador neutro **Hist. 35**, integrado à linha existente; não é outro botão dentro do card nem modifica a ordenação. Sem eventos, o card continua sem indicador para evitar ruído.
- Conversa individual: botão compacto no cabeçalho abre **Histórico de relacionamento**. Mostra nota, todos os motivos registrados e suas quantidades. O cálculo fica recolhido em **Como a nota foi calculada**.
- No APK, o indicador aproveita a coluna lateral já usada por não lidas/Espiar. Botão do cabeçalho de 76×48dp; mantém a altura do cabeçalho. Dados salvos mostram horário e aviso quando offline; indisponível não vira nota inventada.
- Cor neutra e texto, sem estrelas ou rótulo de cliente “bom/ruim”. O atendente decide sua abordagem. A nota não ordena fila, altera SLA, marca leitura ou envia mensagem.

## Dados

A nota usa exatamente os pesos, prazos, base e limite de eventos definidos pelo gestor, de 0 a 100. Os totais exibidos são diferentes do limite aplicado à nota: 15 encerramentos por falta de resposta aparecem como 15, mesmo se só 5 puderem contar pontos. Eventos expirados permanecem nos totais históricos, mas não influenciam a nota.

São motivos de encerramento registrados. “Parou de responder” não prova desistência por preço; “Vendeu” não prova pagamento. Não há análise automática de mensagens ou inferência de intenção. Canais vinculados usam a identidade atual (incluindo aliases), e eventos com mesmo motivo e instante contam uma vez. Clientes de nome igual não são reunidos.

Leitura autenticada com permissão de acessar Mensagens. Endpoint `/msg/relacionamento?conversa=id` retorna só o resumo daquele cliente; não libera configurações, auditoria ou dados de outros clientes. Grupos ficam fora. API de lista e conversa inclui o mesmo resumo para web/caixa nativa; agregação em lote por página e cache de até 60s por conjunto de clientes e versão das regras. Não há mudança de banco, migração ou escrita de dados neste lote.

## Revisão e evidência

APROVADO COM LIMITAÇÃO de aparelho físico. Web: 320×700,390×844,412×915,1440×900, texto100/130%, toque, teclado/Escape e retorno de foco, falha/retry/vazio, axe sem críticas/sérias. Indicador soma no máximo uma linha curta no card; cabeçalho mantém altura e preserva pelo menos90px para identidade a320. Avatar redundante do cabeçalho é recolhido no celular para preservar nome e informações.

Testes SQLite conferem 15 ocorrências sem duplicar canais, expiração, limites, alias, mesma nota em lista/conversa, escopo/ACL e consulta sem marcar leitura ou envio. Regressão de436 conversas, pontuação, encerramento e gestor aprovada. Android possui testes de card/cabeçalho/detalhes e indisponibilidade; assinatura original, manifesto e publicação serão conferidos no pipeline oficial.

Backup remoto anterior: `backup/pre-relacionamento-atendente-20261101`, commit `07b97b4ff20c91dd0581f593ab1e67d3619a9625`. APK anterior2.4.19/code26; novo2.4.21/code28. Sem aparelho físico para homologar instalação e uso; não houve envio real, publicação em canal ou IA paga nos testes.

Candidato assinado aprovado no Actions [41267989939](https://github.com/pablofonteneleadv/tenkiter-catalogo/actions/runs/41267989939): unitários/lint/build. APK2.4.20/code27, 4.624.477bytes, SHA256 `6e8588655a226104fe49a861f3405d8357d6df435eb48814b85690414e17fa32`. Certificado SHA256 `09ed81d57207c72a9d49cc5065483a22f57a15528d8a626aa3a99467e1b59a76` igual ao2.4.19. O alvo novo foi ajustado para48dp após o teste de ergonomia detectar44dp; cabeçalho permaneceu com52dp. Publicação e manifesto público serão conferidos após o CI obrigatório e merge normal.

Candidato final2.4.21/code28 aprovado no Actions [41268451900](https://github.com/pablofonteneleadv/tenkiter-catalogo/actions/runs/41268451900), incluindo nota100 com fonte do sistema130% a320px sem corte. Altura do texto acompanha a fonte; o cabeçalho preserva altura. Versão2.4.20 permanece draft e não foi sobrescrita. APK final 4624245bytes, SHA256 `7c504a0ef66a12e42e28afeea6e4d331ce531860c96190c9fa94c85efd8b1a72`; assinatura original comparada à produção2.4.19.

Integração final: o resumo também acompanha `/msg/novidades` e os retornos de edição de pessoa/canais, pois a caixa nativa substitui os registros locais por esses DTOs. Lotes maiores são divididos em50 conversas para respeitar limites de parâmetros D1. Teste SQLite com mais de50 clientes e teste de atualização ao vivo do cabeçalho aprovados, sem leitura ou rascunho afetados.
