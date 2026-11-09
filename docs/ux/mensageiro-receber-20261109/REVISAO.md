# Revisão — mensagem nova sem esperar a lista (v7.71.0)

Mudança de comportamento **sem mudança visual**: nenhum componente, cor, tamanho ou texto novo.

- O que muda: o balão do cliente aparece na conversa aberta assim que as novidades chegam; a lista de conversas atualiza ao lado, sem segurar o balão.
- Evidência: `tests/mensagens_receber_rapido.py` (390 e 1440 px) mede 31 a 51 ms com a lista simulada em 4 s; na `main` o mesmo teste mede ~4 040 ms. Sem rolagem horizontal e sem erros de JavaScript nas duas larguras.
- Mobile/desktop, alvos de toque, contraste e foco: inalterados (nenhum elemento novo).
- Limite: Chromium e serviços simulados; não é validação em Android real.
