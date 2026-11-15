---
name: tenkiter-falhas-silenciosas
description: Use ao revisar ou escrever código de Workers (instagram-worker, midia-worker, og-worker), Apps Script ou JS do site/Esteira que faz fetch, grava dado ou trata erro. Caça catch vazio, .catch que devolve valor padrão, fallback que esconde falha e fetch sem timeout.
---

# Caça a falhas silenciosas

Inspirada em ECC agents/silent-failure-hunter (MIT). Erro engolido vira dado errado sem alarme: a Esteira mostra "nada pendente" quando a consulta falhou; o Worker responde 200 sem ter gravado.

## O que procurar

1. **catch vazio**: `catch(_){}` / `catch(e){}` em escrita de dado ou chamada externa. Aceitável só em limpeza de baixo risco (cache, `ws.close`, `localStorage`), e o motivo deve estar óbvio.
2. **Promessa que vira valor neutro**: `.catch(()=>{})`, `.catch(()=>null)`, `.catch(()=>[])` em operação que deveria ser vista (gravar fila, processar job). Em `r.json().catch(()=>null)` o chamador precisa tratar `null` como erro, não como "sem dados".
3. **Fallback que esconde**: `catch(e){ return null; }` onde o chamador interpreta `null` como "sem permissão/sem sessão" quando na verdade o Apps Script caiu.
4. **fetch sem timeout**: em Worker, um upstream lento segura a requisição até o limite da plataforma. Exige `signal: AbortSignal.timeout(ms)` (padrão já usado, ex.: `ligarWebhookWafly_`, 15000 ms).
5. **Sucesso falso**: responder `{ok:true}` antes de a gravação confirmar; ignorar `meta.changes` do D1; `ctx.waitUntil` sem registro quando a tarefa falha.
6. **Mensagem enganosa**: erro técnico mostrado como "tente de novo" quando a causa é permanente, ou o inverso.

## Passo a passo

1. Rode as buscas (Grep real, não por memória):
   - `catch\s*(\(\w*\))?\s*\{\s*\}` e `catch\(_\)\{\}`
   - `\.catch\(\s*\(?\w*\)?\s*=>\s*(\{\}|null|\[\]|false)`
   - `fetch\(` e confira se a mesma chamada tem `signal`/`AbortSignal.timeout` ou `cf:` com cache.
   Arquivos: `instagram-worker/*.js`, `midia-worker/worker.js`, `og-worker/worker.js`, `esteira*.js`, `common.js`.
2. Para cada achado, leia o contexto e classifique: **inofensivo** (cache/UI), **degradado** (precisa de registro) ou **perigoso** (perde dado, esconde falha de segurança).
3. Correção mínima: registrar (o padrão do repo é `console.warn(JSON.stringify({evento:'tk_...'}))` ou `cfgSet(env,'msg_ult_...')`, sem segredo nem corpo de cliente), propagar o erro ao chamador, ou dar timeout. Nunca trocar um catch silencioso por `console.log(e)` com dado pessoal.
4. Cada falha real corrigida vira teste (`tenkiter-bug-vira-teste`), p.ex. simulando o upstream lento ou o `fetch` rejeitando.
5. Apps Script (`.gs.txt`) não está neste repositório (regra 10): peça a Pablo ou ao Cofre o código; procure `try{}catch(e){}` vazio e respostas `{ok:true}` antes de `appendRow`/`setValues`.

## Achados iniciais (confirmados lendo o código)

Sem timeout em fetch a Apps Script/terceiros, com `catch` que devolve `null`:
- `instagram-worker/worker.js:2217` busca de sessão no `API_URL`, `catch (e) { return null; }`: Apps Script lento/indisponível vira "sem sessão".
- `midia-worker/worker.js:91` mesmo padrão (permissões em cache 120 s).
- `instagram-worker/worker.js:488` `copiarMidia`: `fetch(url)` da mídia do Instagram sem timeout.
- `instagram-worker/worker.js:3581` `fetch(download)` do vídeo convertido (FreeConvert) sem timeout.
- `og-worker/worker.js:31` `fetch(API_URL + '?action=list')` sem timeout (só `cf: {cacheTtl}`).

Erro engolido sem registro:
- `og-worker/worker.js:56` `kv.put` com `catch (e) {}`: cache do catálogo falha sem sinal.
- `instagram-worker/worker.js:3388` `processarFotoIA(...).catch(() => {})`: job de foto IA que falha não deixa rastro aqui.
- `instagram-worker/worker.js:4541` `respostaAutomatica_(...).catch(() => null)`: resposta automática perdida sem registro.
- `instagram-worker/worker.js:3950`, `3951`, `4052`, `4941` `processarPushMobile_`/`processarComplementos_` com `.catch(()=>{})`: push e complementos falham mudos.
- `instagram-worker/worker.js:6616` a `6619` e `6623` a `6628`: tarefas do cron com `.catch(()=>{})` (push, fila Zernio, entradas, agenda, índice de nomes, catálogo quente); falha recorrente do cron fica invisível.
- `instagram-worker/worker.js:6538` já registra (`video_disparo_status` grava `ok`/`cod`) e tem timeout: bom modelo a copiar.
