'use strict';
// Workerd/Miniflare real, com todas as saídas HTTP interceptadas e simuladas.
const assert = require('node:assert/strict'), path = require('node:path');
const { Miniflare } = require('../instagram-worker/node_modules/miniflare');
(async () => {
  const root = path.resolve(__dirname, '../og-worker');
  let calls = 0, fail = false, release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const backendEntered = new Promise(resolve => { entered = resolve; });
  const mf = new Miniflare({ modules: true, modulesRules: [{type: 'ESModule', include: ['**/*.js']}], modulesRoot: root, scriptPath: path.join(root, 'teste-entry.js'),
    script: `import worker from './worker.js';let entradas=0;export default {async fetch(req,env,ctx){if(new URL(req.url).pathname==='/__teste/estado')return Response.json({entradas});entradas++;return worker.fetch(req,env,ctx)}}`,
    compatibilityDate: '2025-01-01',
    outboundService: async req => {
      assert.equal(new URL(req.url).hostname, 'script.google.com', 'Só backend público simulado');
      calls++; entered(); await gate;
      return new Response(JSON.stringify({ ok: true, produtos: [] }), { status: fail ? 500 : 200 });
    } });
  const get = p => mf.dispatchFetch('https://worker.test' + p);
  try {
    const first = get('/feed.csv'); await backendEntered;
    const second = get('/feed.xml');
    let entries = 0;
    for (let i = 0; i < 100; i++) {
      entries = (await (await get('/__teste/estado')).json()).entradas;
      if (entries >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(entries, 2, 'Duas requisições realmente entraram no isolate');
    assert.equal(calls, 1, 'Consultas simultâneas compartilham I/O no workerd');
    release(); const responses = await Promise.all([first, second]);
    assert(responses.every(r => r.status === 200), 'Nenhuma violação de contexto de I/O entre requisições');
    assert((await responses[0].text()).startsWith('id,title,'));
    assert((await responses[1].text()).includes('<rss'));
    await get('/feed.csv'); assert.equal(calls, 2, 'Não mantém resultado após conclusão');
    fail = true; assert.equal((await get('/feed.xml')).status, 503, 'Erro HTTP não vira feed normal');
    fail = false; assert.equal((await get('/feed.xml')).status, 200, 'Isolate recupera depois da falha');
    console.log('PASS OG runtime: concorrência entre requisições, contextos de I/O, formatos e recuperação no workerd.');
  } finally { release(); await mf.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
