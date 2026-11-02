# Postagens 7.48.3 — WhatsApp (Wafly) proativo, canais separados e Já postadas com filtros

Data: 02/11/2026 · Branch `ia/postagens-zap-proativo-20261102` · Escopo: `instagram-worker/worker.js`, `admin-postagens.js` (sem `common.js`, sem Apps Script).

## Diagnóstico (dados reais da leva das 17:01)

- 48 postagens, 46 publicadas e 2 travadas:
  - **916** (`ambos` = Instagram + WhatsApp Status 1): `erro`, marcador `zapq:tkpost-000000000916`, "a Wafly ainda não confirmou depois de 30 min". O **Story do Instagram também não saiu**: no `ambos`, a perna do WhatsApp ia antes e, enquanto a Wafly não confirmava, segurava o Instagram.
  - **927** (`whatsapp2`): mesmo erro.
- Código antigo: `consultarWaflyDireto_` só reconhecia `accepted + serverAcknowledged`; qualquer outra resposta (inclusive falha definitiva e recibo 404) virava "desconhecido" e o sistema esperava 30 min. Depois disso, "Consultar resultado" consultava, mas a tela não dizia nada quando a resposta era "desconhecido".
- Quando alguém confirmava uma `ambos` antiga, o Instagram era publicado **na hora**, fora da vez — é o que explica uma calça no meio das calcinhas horas depois.

## Regra nova (decisão do Pablo)

| Situação | O que acontece |
| --- | --- |
| Wafly não confirma | Consulta a cada ~1 min (cron) por até **10 min**, sempre com o mesmo requestId, sem reenviar. |
| Sem resposta definitiva em 10 min | **"Publicado sem confirmação"**: status `publicado` + `zap_estado='sem_confirmacao'`. Aviso discreto (texto + ícone) na Fila e em Já postadas. A fila segue na ordem. |
| Wafly diz que não publicou (estado `failed/rejected/error/expired/cancel…` ou recibo **404**) | Reenvia **uma vez**, logo em seguida e só dentro da janela de 10 min, com requestId novo (`tkpost-…-r1` / `tkpost2-…-r1`; o prefixo continua dizendo a instância para `slotDoRequestId_`). |
| O reenvio também falha | `erro` com motivo em português e "Repostar"; sai do fluxo automático (o cron não consulta mais nem publica horas depois). |
| `ambos` | O Instagram publica no horário; o WhatsApp é acompanhado em paralelo (`zap_estado`, `zap_req`, `zap_desde`, `zap_tent`, `zap_erro`, `zap_consulta` — colunas aditivas, `ALTER TABLE` protegido; nada migrado nem apagado). O `ig_id`/`permalink` do Instagram ficam intactos. |
| Repostar | Também para "Publicado sem confirmação". Agenda no **próximo horário livre do mesmo canal, depois da leva já agendada** (`fimDaSequencia_` + `proximoLivreMulti`, respeitando intervalo e pausa). No `ambos`, só a perna que não saiu (`perna`: `whatsapp`, `instagram` ou `ambos`). A tela informa o horário escolhido. |
| "Tentar de novo" | Virou **"Postar agora mesmo assim"** (secundário). Não aparece onde repetiria o mesmo requestId do WhatsApp. |
| Consultar resultado | Sempre responde com o que a Wafly disse e a hora ("A Wafly ainda não confirmou (consultado às 18:05…)", "Confirmado: a Wafly publicou…", "A Wafly diz que não publicou: reenviando agora…"); botão mostra "Consultando a Wafly…" e fica desabilitado durante a consulta. |

### Postagens antigas (916, 927 e similares em `erro` com `zapq:`)

Nada é alterado automaticamente: o cron não lê linhas em `erro`. Quando alguém toca:

- **Consultar** na 916: a perna do WhatsApp passa para as colunas `zap_*` e é consultada. Confirmado → WhatsApp "publicado"; sem resposta → "sem confirmação"; falha → erro (sem reenvio, porque o horário já passou). O Story continua em erro com a frase "não saiu porque esperava a confirmação do WhatsApp" — **nunca é publicado fora da vez**.
- **Repostar** na 916: cria uma cópia no próximo horário livre só do Instagram (se o WhatsApp já saiu) ou dos dois.
- **Consultar** na 927: confirmado → publicado; sem resposta → "Publicado sem confirmação"; falha → erro com "Repostar". Nada é reenviado sozinho.

## Tela (admin-postagens.js)

- **Fila → Por canal:** um grupo por canal. O `ambos` aparece no grupo do Story (Instagram) e no WhatsApp Status 1, cada um com o estado da sua perna (`data-perna=ig|zap`). Contagem, ⚠, "Marcar as N", intervalo e "próx." contam só aquele canal. A perna do WhatsApp não tem ações de agenda (elas mexeriam no Instagram); quando a ação vale para a postagem inteira, o botão diz "(Story + Status 1)".
- **Fila → Por mídia:** ▲▼, 🕐 Horário, ⏭ Próximo livre, ⚡ Postar agora (urgente) e Cancelar ficam numa barra no topo do card aberto e valem para **todos os destinos da mídia**, no mesmo horário (Próximo livre usa o maior "próximo livre" entre os canais e reagenda todos para ele; ▲▼ troca o horário com a mídia vizinha em todos os destinos). Um feedback único; se algum destino falhar, diz qual. "Opções do canal" saiu. Cada destino mostra só horário e estado; ações por destino só quando aquele destino precisa (Consultar, Repostar só este canal, Descartar).
- **Já postadas:** Por mídia / Por canal com os mesmos componentes e filtro Todos / Hoje / Ontem / 7 dias / Dia e hora (dia + faixa de horário), sobre a hora da publicação. "Ver no Instagram" mantido; "Publicado sem confirmação" com "Não saiu? Repostar…". A lista continua limitada às 250 postagens mais recentes que a tela já carregava (não havia paginação).
- Miniatura de vídeo: as linhas de destino não repetem miniatura; o plano B de pôster → quadro do vídeo → placeholder (7.48.2) agora vale também para as miniaturas que ficavam dentro do card aberto.

## Revisão pela skill `tenkiter-estetica-humana`

- Tarefa humana: saber em qual canal algo deu errado e agir sem atrasar nem bagunçar a ordem; ver o que já saiu por dia/horário.
- Referência: componentes da 7.48.2 (cards recolhidos, chips com ícone + texto, grupos dobráveis, filtros por chips). Reutilizados `icoFila_`, `po-mc-chip`, `po-fg`, `po-fil`, `htmlPicker_`.
- Estado nunca só por cor: "Sem confirmação" tem ícone + texto e borda tracejada; erro tem ⚠ + texto.
- Progresso verdadeiro: "Aguardando a Wafly confirmar… até HH:MM; depois fica Publicado sem confirmação"; o botão de consulta mostra carregamento e bloqueia toque duplo; barra do card desabilita enquanto aplica.
- Diferencia envio / aguardando confirmação / sem confirmação / erro; nada exige recuperação manual como fluxo normal.
- Viewports: 390×844 e 1440×900. Medido: botões da barra e do histórico ≥ 44 px; sem rolagem horizontal na Fila e em Já postadas; axe sem violações graves; sem erro de JavaScript.
- Resultado: **APROVADO COM LIMITAÇÃO** — validado com Worker simulado em navegador (Playwright). Não houve chamada à Wafly real nem validação em aparelho Android/APK.

## Evidência (`docs/ux/postagens-zap-proativo-20261102/`)

- `fila-por-canal-390.jpg` / `-1440.jpg` — Story e WhatsApp Status 1 separados; 916 com motivo claro e "Repostar Story e WhatsApp"; aviso do Repostar com horário.
- `fila-por-midia-barra-390.jpg` / `-1440.jpg` — barra de ações no card aberto, destinos sem botões.
- `fila-por-midia-erro-390.jpg` / `-1440.jpg` — destino com erro mostrando só as ações necessárias.
- `ja-postadas-canal-*.jpg`, `ja-postadas-midia-*.jpg` — Já postadas com modos e filtros.
- `ja-postadas-sem-confirmacao-*.jpg` — aviso "Publicado sem confirmação" (ícone + texto) e "Não saiu? Repostar só o WhatsApp".

## Testes

- `node tests/worker_zap_proativo.js` (novo, 27 verificações): aceito; desconhecido 10 min → sem confirmação; 404 → reenvio `-r1` → sucesso (instância 2); `failed` → reenvio pendente → `rejected` → erro e não volta sozinho; 422 no reenvio; `ambos` publica o Instagram com WhatsApp pendente; Repostar depois da leva sem furar a ordem; perna só WhatsApp; 916/927 só ao tocar.
- `node tests/worker_ig.js` (407), `worker_canal.js` (11), `worker_grupo.js` (52), `worker_wame.js` (52), `worker_wafly.js` (33), `worker_postagens_runtime.cjs` — ajustados à regra nova onde ela mudou de propósito (10 min, `ambos` sem segurar o Instagram).
- `tests/postagens_zap_proativo_ui.py` (novo, 82 verificações em 390 e 1440) e os testes de Postagens existentes (`postagens_*.py`).
