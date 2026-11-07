/* v7.40.33 — presença, equipe e início de conversa (itens retomados do #305).
   D1 SQLite real; nenhum envio a destinatário real. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-video-disparo.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '../instagram-worker/worker.js')) + '\nexport {acordarVideoPreparo_};');
  const W = await import(require('node:url').pathToFileURL(tmp).href);
  const cache = new Map(), kv = new Map();
  global.caches = { default: { async match(r) { return cache.has(r.url) ? Response.json(cache.get(r.url)) : undefined; }, async put(r, v) { cache.set(r.url, await v.json()); } } };
  let envios = [];
  global.fetch = async (u, opt) => {
    if (String(u) === 'https://backend.test') return Response.json({ ok: true, sessao: 'tk3.5588999999999.' + Math.floor(Date.now() / 1000 + 30 * 86400) + '.simulada', usuario: { nome: 'Ana Teste', permissoes: ['gerir_acessos'] } });
    assert(/\/send-(text|image)$/.test(String(u)), 'Serviço não simulado');
    envios.push(JSON.parse(opt.body)); return Response.json({ messageId: 'simulado-' + envios.length });
  };
  const CACHE = { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  const env = { DB, CACHE, MIDIA: require('./helpers/r2_condicional')(), API_URL: 'https://backend.test', MIDIA_URL: 'https://midia.test' };
  const headers = { 'X-TK-Whats': '5588999999999', 'X-TK-Sessao': 'tk3.teste' };
  const chamar = async (rota, metodo = 'GET', corpo) => { const r = await W.default.fetch(new Request('https://worker.test' + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined }), env, {}); return { status: r.status, j: await r.json() }; };

  await chamar('/msg/config');
  let requests=0;const anterior=global.fetch;global.fetch=async(u,opt)=>{if(String(u).startsWith('https://api.github.com/repos/')){requests++;assert.equal(String(u),'https://api.github.com/repos/pablofonteneleadv/tenkiter-catalogo/actions/workflows/wafly-transcode.yml/dispatches');assert.deepEqual(JSON.parse(opt.body),{ref:'main'});return new Response('{}',{status:requests===1?200:403});}return anterior(u,opt);};
  assert.equal((await W.acordarVideoPreparo_(env)).configurado,false);assert.equal(requests,0,'Sem segredo não faz chamada externa');
  env.GITHUB_DISPATCH_TOKEN='simulado-apenas-no-teste';assert((await W.acordarVideoPreparo_(env)).ok);await W.acordarVideoPreparo_(env);assert.equal(requests,1,'Uploads simultâneos não disparam workflows repetidos');
  const real=Date.now;Date.now=()=>real()+61000;const erro=await W.acordarVideoPreparo_(env);Date.now=real;assert.equal(erro.ok,false);assert.equal(requests,2);const health=JSON.parse(sqlite.prepare("SELECT valor FROM cfg WHERE chave='video_disparo_status'").get().valor);assert.equal(health.cod,403);assert(!JSON.stringify(health).includes('simulado-apenas'));
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM postagem').get().n,0);assert.equal(envios.length,0,'Disparo não publica nem envia mensagens');console.log('OK disparo: opcional, fixo, com cooldown, sem credencial em resposta, sem publicação e falha recuperável.');
})().catch(e=>{console.error(e);process.exitCode=1;});
