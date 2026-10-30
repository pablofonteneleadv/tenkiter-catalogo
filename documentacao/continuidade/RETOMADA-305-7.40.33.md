# #305 — o que foi concluído e o que ficou pendente (7.40.33)

O checkpoint do #305 (merge `21e3fd8`) entrou na `main`, mas o #306 retirou de
propósito três blocos dele. Esta atualização (7.40.33) retoma os dois primeiros;
o terceiro continua pendente por falta de ferramenta no ambiente.

## Concluído agora

| Item do #305 | Onde |
|---|---|
| Presença da equipe (janela de 2 minutos) | `msg_presenca`, `POST /msg/presenca`, heartbeat de 45 s em `admin-mensagens.js` |
| Atividade por pessoa e histórico de ações | `msg_atividade`, `GET /msg/equipe`, gaveta "Equipe e atividade" |
| Abrir conversa por WhatsApp/@ do Instagram | `POST /msg/iniciar`, gaveta "Nova conversa" |
| Trilha só de ação confirmada (sem texto de mensagem) | `J()` em `instagram-worker/worker.js` |
| Testes | `tests/worker_equipe_inicio.js` (D1 real) e `tests/mensagens_equipe_inicio_ui.py` (Playwright + axe) |

Regras mantidas de propósito:

- abrir conversa **não** envia mensagem, não marca como lida e não assume responsável;
- a trilha guarda ação, pessoa e conversa — nunca o texto enviado;
- presença é aproximada e não serve de prova de trabalho;
- Instagram só abre conversa que o cliente já iniciou (limite da API oficial).

## Pendente

- **Android** (`android/`): as mudanças de alias/equipe do #305 não voltaram
  porque este ambiente não tem Java/Gradle para compilar e testar. Precisa de
  um build com a toolchain Android antes de publicar no app.

## Deploy

`VERSION` 7.40.33, `version.json` e o cache-busting de `admin-mensagens.js`
atualizados. A trilha de equipe começa vazia: só conta ações a partir deste deploy.
