# Site 7.40.17 — Instagram e cartões do catálogo

O proprietário autorizou o deploy e depois determinou **não fazer as alterações anteriores do APK**. Essa instrução substitui o escopo inicial: edição de contato, filtros/busca de Produtos, cache, cabeçalhos e todas as mudanças Android foram retirados deste PR, inclusive da tela compartilhada que alteraria o APK indiretamente. `android/`, `admin-mensagens.js` e `admin.html` estão idênticos à base de produção 7.40.16. Manifesto, assinatura e APK 2.4.3 preservados.

## Correções que permanecem

**Instagram/Ludimara.** Leitura do provedor confirmou a mensagem e três tentativas de webhook **failed / The operation was aborted**. A conversa não existia no D1. O recebimento agora valida assinatura e persiste em fila antes de aceitar, sem aguardar inicialização completa, consultas externas ou mídia. Falhas de gravação mantêm o evento para nova tentativa pelo cron, com bloqueio por prazo e deduplicação. A carga bruta é removida após sucesso. A recuperação não dispara respostas automáticas. A reentrega do evento original será solicitada após publicar o Worker e conferida no D1.

**Cartões.** O subgrid não reservava espaço para as miniaturas e tinha uma linha a menos na informação. Foram reservadas dez linhas: foto, miniaturas e oito de informação. Fotos extras ficam abaixo da principal e acima das informações, enquanto preços e ações continuam alinhados entre cartões com/sem fotos adicionais, nomes e tamanhos diferentes. [Evidência simulada 390px](erro-04/cards-390.png).

**Diagnóstico, sem alteração de conexões.** `/device` da Wafly confirmou principal no WhatsApp 1 e reserva no WhatsApp 2. Não há inversão real de instâncias. Números da loja apenas no log privado. A entrega da referência de status do principal continua dependendo do provedor; não foi criada associação fictícia com um story provável.

## Validação

- 391 verificações Worker/SQLite/provedores simulados, incluindo evento preservado após falha, nova tentativa e reentrega sem duplicação.
- Regressões de mensagens/mídias e push aprovadas separadamente; sem envio real nos testes.
- Cartões em 320×700, 390×844, 412×915 e 1440×900, fonte 100/130%: sem sobreposição, ações alinhadas por fileira e miniatura acionada por teclado. Teste `catalogo_cards_fotos.py`.
- Skill TENKiTER aplicada. Tarefa: consultar várias fotos sem perder acesso ao botão da peça. **APROVADO COM LIMITAÇÃO** de navegador físico/Android real; não há mudança do IME ou da UI do APK. Foto, miniaturas, informações e ações ocupam linhas distintas; reflow verificado a 320px.
- Backup: branch `backup/pre-lote-erros-20261028`, base a86c3a35af2266d25d82500e57dca68624be0c3e; bookmark D1 no log privado. Resultado do workflow e recuperação serão registrados após a publicação.
