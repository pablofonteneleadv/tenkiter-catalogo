# Mensageiro — encerrar cliente e pontuação (Hist.)

Atualização: 09/11/2026 (v7.68.0). Código: `instagram-worker/worker.js` (Worker `tenkiter-ig`, D1) e `admin-mensagens.js` (tela). Teste: `tests/worker_pontuacao_canais.js` (usa os exemplos abaixo).

## 1. Encerrar um cliente com vários canais = sempre todos os canais

Um cliente pode ter vários canais (Instagram, WhatsApp 1, WhatsApp 2). O sistema os agrupa pela identidade unificada (`MSG_IDENTIDADE_SQL_`: vínculo de contatos / "Também no WhatsApp 2"). Encerrar um canal encerra **todos os canais abertos** desse cliente, sem pedir escolha.

| Caminho | Onde | O que acontece |
|---|---|---|
| Seleção na lista (1 ou vários clientes) | `POST /msg/encerrar` | O Worker soma os canais irmãos (`canaisIrmaosAbertos_`) e encerra tudo numa única transação (`env.DB.batch`). A tela só avisa. |
| Botão Encerrar da conversa (menu ⋯) | idem | idem |
| Acompanhar (lembrete + 2 h úteis sem resposta) | `finalizarAcompanhamento_` | Encerra o canal e os irmãos no mesmo instante, motivo `sem_resposta`, na mesma transação. |
| Reabrir | `POST /msg/encerrar` com `reabrir` | Continua individual (só o canal pedido). |

Garantias: idempotente (repetir o pedido não cria novo evento: só conversas ainda abertas recebem o encerramento e o evento), nenhuma mensagem nem conversa é apagada, grupos internos nunca são encerrados, todos os canais do cliente recebem o **mesmo instante** (`em`) e o mesmo motivo. A resposta traz `tambemEncerradas` (canais irmãos) e a tela diz quais foram.

## 2. Como a pontuação funciona

A pontuação do cliente (no chat aparece como **Hist. N**, 0 a 100) orienta o atendente; **não muda a ordem da fila**. Regras configuráveis (Gestão → Prioridade de clientes, `msg_prioridade_v1`):

| Motivo do encerramento | Pontos por ocorrência | Vale por |
|---|---|---|
| Vendeu | +10 | 90 dias |
| Concluído | +2 | 30 dias |
| Cliente parou de responder (`sem_resposta`) | −3 | 14 dias |
| Engano ou spam | 0 | 14 dias |

Pontuação = base 50 + pontos das ocorrências válidas (dentro da validade), no máximo 5 ocorrências por motivo, limitada a 0–100. Faixas: Alta ≥ 70, Normal 40–69, Baixa < 40. É calculada ao vivo a partir da tabela `msg_encerramento` (um registro por canal encerrado); nada é gravado como pontuação.

Onde está no código: `pontuarCliente_` (soma), `episodiosCliente_` (média dos canais), `prioridadeBase_` (Gestão / fila), `relacionamentosAtendimento_` + `resumirRelacionamento_` (Hist. na lista e na conversa).

## 3. Cliente = média dos canais

Regra: um **cliente** pesa **uma vez**, pela média dos seus canais. Os encerramentos do mesmo cliente que acontecem na mesma **rodada** (até 10 minutos entre si, e um canal nunca aparece duas vezes na mesma rodada) formam um **episódio**. Dentro do episódio, cada motivo pesa:

`peso do motivo = canais encerrados com esse motivo ÷ canais encerrados no episódio`

O peso total de um episódio é sempre 1. Histórico antigo não foi reescrito nem apagado: o agrupamento é feito na leitura (rodadas antigas fechadas em sequência pelo painel também viram um episódio só). Encerramentos em dias diferentes continuam sendo eventos diferentes.

### Exemplos (regras padrão: base 50)

| Caso | Antes | Agora |
|---|---|---|
| 1 canal, encerrado por falta de resposta | 50 − 3 = **47** | **47** |
| 3 canais encerrados juntos por falta de resposta | 50 − 3×3 = **41** (se fechados em instantes diferentes) | 3 ÷ 3 = 1 ocorrência: **47** |
| 3 canais encerrados após resposta (Concluído) | 50 + 2×3 = 56 (instantes diferentes) | 1 ocorrência: **52** |
| 3 canais: 2 sem resposta + 1 vendeu (resultados diferentes) | 50 − 6 + 10 = 54 | −3×(2/3) + 10×(1/3) = +1,33: **51** |
| 1 canal, sem resposta há 5 dias e de novo há 2 dias (duas rodadas) | **44** | **44** |
| Falta de resposta há 15 dias | 50 (já expirou) | 50 |

Obs.: com a regra 1 (encerrar sempre todos os canais), o caso "resultados diferentes" só aparece em histórico antigo; daqui para frente todos os canais do cliente saem com o mesmo motivo.

## 4. Onde isso aparece na interface

Na janela "Histórico de relacionamento" (botão Hist. N da conversa): "Cliente com 3 canais conta uma vez: média dos canais." Quantidades fracionárias (só em histórico antigo com resultados diferentes) aparecem com vírgula.

## 5. Limites e cuidados

- A janela de 10 minutos é uma regra de leitura; os registros em `msg_encerramento` não foram alterados e nenhuma coluna nova foi criada.
- O cache do cálculo (`prioridade-v2`, `relacionamento-v2`) foi renovado; resultados antigos em cache expiram sozinhos (60 s a 5 min).
- Nada depende do Apps Script.

## 6. Instagram: janela de resposta e Acompanhar (v7.69.0)

Regra real da Meta: resposta padrão até 24 h depois da última mensagem do cliente; com a etiqueta `HUMAN_AGENT` (atendente humano) até 7 dias. O Worker (`enviarZernio_` e o envio direto `enviarInstagram_`) tenta normal e, se a Meta recusar por prazo, repete com `HUMAN_AGENT`. Por isso uma resposta com mais de 24 h chega.

- Aviso da conversa: só além dos 7 dias ("Já passaram mais de 7 dias..."). Antes dos 7 dias não há alarme e o botão Enviar nunca é travado.
- Agendar e Acompanhar: só recusam quando o horário cai depois dos 7 dias; antes eles eram recusados a partir de 24 h, e era por isso que o Acompanhar quase nunca armava no Instagram (o cliente costuma ter escrito há mais de 22 h). Mensagens agendadas e o lembrete do Acompanhar também usam `HUMAN_AGENT` ao sair, pois foram armadas por uma pessoa.
- Se a Meta recusar mesmo assim, o erro aparece em português (e o Acompanhar fica "falhou" sem encerrar o atendimento).
- Cuidado: a política da Meta para `HUMAN_AGENT` espera resposta de uma pessoa; lembrete/agendada pré-armada fica numa zona cinzenta. Se a Meta recusar, o servidor devolve o erro e nada é encerrado por engano.
- Teste: `tests/worker_instagram_janela.js` (Zernio e Graph simulados, Instagram e WhatsApp, todos os canais encerrados, pontuação 47 uma vez) e `tests/mensagens_instagram_janela_ui.py`.
