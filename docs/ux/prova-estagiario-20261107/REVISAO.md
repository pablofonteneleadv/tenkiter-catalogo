# Revisão visual — prova do manual: falha ao enviar a nota (07/11/2026)

Skill `tenkiter-estetica-humana`. Chromium com serviços simulados (Apps Script simulado devolvendo "Sessão inválida"); **não validado em Android**.

| Item | 390 px | 1440 px |
|---|---|---|
| Nota continua visível mesmo sem conseguir salvar | ok | ok |
| Motivo em português na própria tela da nota (sem JSON, sem aviso que some) | ok | ok |
| Botão "Enviar de novo" (altura 50 px, largura total da coluna) | 310×50 | 604×50 |
| Rolagem horizontal | não | não |
| Mesmo padrão do site: botão `.btn`, texto `muted-note` com `role="status"` | ok | ok |

Capturas: `falha-envio-390.jpg`, `falha-envio-1440.jpg`.

Testes: `tests/prova_resiliente.py` (13 verificações): pergunta sem alternativas não trava; servidor recusa → motivo claro, nota guardada, "Enviar de novo" funciona; sem internet → reenvio automático ao entrar de novo.
