# Mensagens: motivo ao encerrar — 26/10/2026

Pedido do Pablo: "na hora que a gente coloca para encerrar conversa (...) poder colocar um motivo. O primeiro motivo (...) encerrando porque terminou (...) vai contabilizar como um encerramento correto no horário do encerramento (...) a outra que me interessa muito é encerrado por falta de resposta." Ele aprovou os 4 motivos propostos.

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `mensagens-motivos-20261026/06-motivos.png`.

## Na tela
- **Encerrar** (barra de seleção ou ⋯ da conversa) abre a escolha "Por que está encerrando?", com quatro botões de 56 px:
  1. **Concluído** (o padrão, com borda forte e o foco já nele): o atendimento terminou e conta como respondido naquela hora.
  2. **Vendeu**: terminou com venda.
  3. **Cliente parou de responder**: fica no histórico do cliente.
  4. **Engano ou spam**: não entra nas métricas.
- Cancelar, Esc e o "voltar" do celular fecham a escolha sem encerrar nada.
- A conversa encerrada mostra o motivo na lista (etiqueta colorida) e na faixa da conversa: "Conversa encerrada (Vendeu)".
- O aviso confirma o motivo, por exemplo: "2 conversas encerradas como 'Concluído'".
- O painel de atendimento soma os encerramentos do período por motivo.

## Métricas
- Concluído, Vendeu e Cliente parou de responder contam como atendimento resolvido na hora do encerramento: a pergunta sai de "esperando" e entra no tempo de resposta, mesmo sem mensagem da loja.
- Engano ou spam: a conversa sai das contagens e dos tempos.
- Cada encerramento fica num histórico, com conversa, número, motivo, horário e quem encerrou (os 4 últimos dígitos). Esse histórico é a base do futuro termômetro do cliente ("só pergunta preço" e "já comprou").
- Quando o cliente escreve de novo, a conversa reabre e o motivo sai da conversa. O histórico continua guardado.

Testes: `worker_mensagens_conversa` (158, com 9 novos de motivo e métricas), `mensagens_encerrar` (40, com 5 novos e axe na escolha), `mensagens_atendimento` (35), `mensagens_dashboard` (100) e `mensagens_mestre` (21).

Resultado: APROVADO. Não foi visto num Android real.
