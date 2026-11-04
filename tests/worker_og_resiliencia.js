'use strict';
// Regressões com fetch/KV simulados: sem Apps Script ou dados reais.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'og-worker/worker.js'), 'utf8');
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; }
function load(fetcher) {
  const c = { Response, URL, console, fetch: fetcher, module: { exports: {} } };
  vm.runInNewContext(source.replace('export default', 'module.exports ='), c);
  return { worker: c.module.exports, context: c };
}
const request = path => new Request('https://example.test' + path);
const payload = (products = []) => new Response(JSON.stringify({ ok: true, produtos: products }));
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
(async () => {
  for (const status of [401, 429, 500, 503]) {
    const { worker } = load(async () => new Response(JSON.stringify({ ok: true, produtos: [] }), { status }));
    const response = await worker.fetch(request('/feed.csv'));
    ok(response.status === 503, 'HTTP de falha nunca vira feed vazio 200');
  }
  for (const body of [{ ok: 'true', produtos: [] }, { ok: false, produtos: [] }, { ok: true, produtos: null }]) {
    const { worker } = load(async () => new Response(JSON.stringify(body)));
    ok((await worker.fetch(request('/lista.json'))).status === 502, 'envelope inválido não é publicado como lista');
  }
  let calls = 0, gate = defer();
  let env = load(async () => { calls++; await gate.promise; return payload(); });
  const parallel = ['/feed.csv', '/feed.xml', '/sitemap.xml', '/lista.json'].map(p => env.worker.fetch(request(p)));
  ok(calls === 1, 'quatro consultas concorrentes compartilham um fetch');
  gate.resolve();
  const responses = await Promise.all(parallel);
  ok(responses.every(r => r.status === 200), 'cada formato recebe sua resposta normal');
  await env.worker.fetch(request('/feed.csv'));
  ok(calls === 2, 'próxima consulta não reutiliza resposta concluída');
  calls = 0;
  env = load(async () => { calls++; return calls === 1 ? new Response('falha', { status: 500 }) : payload(); });
  ok((await env.worker.fetch(request('/feed.xml'))).status === 503, 'falha inicial é sinalizada');
  ok((await env.worker.fetch(request('/feed.xml'))).status === 200 && calls === 2, 'nova leitura pode recuperar após falha');
  let saved = 0;
  const kv = { get: async () => null, put: async () => { saved++; } };
  env = load(async () => new Response(JSON.stringify({ ok: true, produtos: [] }), { status: 500 }));
  ok((await env.worker.fetch(request('/lista.json'), { TK_LISTA: kv })).status === 502 && saved === 0, 'erro HTTP nunca contamina KV vazio');
  const stale = [{ ID: 7, Nome: 'Simulado' }], background = [];
  const kvStale = { get: async () => ({ produtos: stale, salvoEm: 1 }), put: async () => { saved++; } };
  let r = await env.worker.fetch(request('/lista.json'), { TK_LISTA: kvStale }, { waitUntil: p => background.push(p) });
  ok(r.status === 200 && (await r.json()).produtos[0].ID === 7, 'fallback anterior do KV é mantido');
  await Promise.all(background);
  ok(saved === 0, 'falha de atualização preserva o cache anterior');
  const unhandled = []; const listener = e => unhandled.push(e); process.on('unhandledRejection', listener);
  r = await env.worker.fetch(request('/lista.json'), { TK_LISTA: kvStale });
  await new Promise(resolve => setImmediate(resolve)); process.removeListener('unhandledRejection', listener);
  ok(r.status === 200 && unhandled.length === 0, 'sem waitUntil também observa falha de atualização');
  calls = 0;
  env = load(async () => { calls++; return payload(); });
  const fresh = { get: async () => ({ produtos: [], salvoEm: Date.now() }), put: async () => { throw Error('não deve gravar'); } };
  r = await env.worker.fetch(request('/lista.json'), { TK_LISTA: fresh });
  ok(r.status === 200 && calls === 0 && (await r.json()).produtos.length === 0, 'KV fresco e vazio continua válido, sem fetch');
  env = load(async () => payload());
  const other = load(async () => new Response(JSON.stringify({ ok: true, produtos: [{ ID: 8 }] })));
  const a = await env.worker.fetch(request('/lista.json')); const b = await other.worker.fetch(request('/lista.json'));
  ok((await a.json()).produtos.length === 0 && (await b.json()).produtos[0].ID === 8, 'isolates independentes não misturam dados');
  console.log('PASS OG resiliente: ' + checks + ' verificações.');
})().catch(error => { console.error(error); process.exitCode = 1; });
