/* v7.40.33 — presença, equipe e início de conversa (itens retomados do #305).
   D1 SQLite real; nenhum envio a destinatário real. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-solicitacoes.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '../instagram-worker/worker.js')) + '\nexport {rotasSolicitacoes_,msgRecurso_};');
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
  const id=Number(sqlite.prepare("INSERT INTO msg_conversa(canal,contato,nome,grupo) VALUES('whatsapp1','5588991234567','Cliente Teste',0)").run().lastInsertRowid);
  const op='11111111-1111-4111-8111-111111111111';
  assert.equal((await chamar('/msg/solicitacoes','POST',{id:op,conversa:id,descricao:'Vestido azul, tamanho M'})).status,200);
  assert.equal((await chamar('/msg/solicitacoes','POST',{id:op,conversa:id,descricao:'Vestido azul, tamanho M'})).status,200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_solicitacao').get().n,1);
  let list=await chamar('/msg/solicitacoes');assert.equal(list.status,200,JSON.stringify(list));assert.equal(list.j.itens[0].nome,'Cliente Teste');assert.deepEqual(list.j.itens[0].fotos,[]);
  const item=list.j.itens[0];
  assert.equal((await chamar('/msg/solicitacoes/editar','POST',{id:op,versao:item.versao,status:'aguardando_cliente',obs:'Conferir cor com o cliente',assumir:true})).status,200);
  assert.equal((await chamar('/msg/solicitacoes/editar','POST',{id:op,versao:item.versao,status:'atendida'})).status,409,'Edição velha não sobrescreve acompanhamento');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_solicitacao_evento').get().n,1);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=','base64'),fid='22222222-2222-4222-8222-222222222222';
  const raw=async(path,body)=>{const r=await W.default.fetch(new Request('https://worker.test'+path,{method:'POST',headers,body}),env,{});return {status:r.status,j:await r.json()};};
  const pathFoto='/msg/solicitacoes/foto?solicitacao='+op+'&foto='+fid;
  assert.equal((await raw(pathFoto,png)).status,200);assert.equal((await raw(pathFoto,png)).status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_solicitacao_foto').get().n,1);
  const photo=await W.default.fetch(new Request('https://worker.test'+pathFoto,{headers}),env,{});assert.equal(photo.status,200);assert.equal(photo.headers.get('Cache-Control'),'no-store');assert.deepEqual(Buffer.from(await photo.arrayBuffer()),png);
  assert.equal((await raw('/msg/cliente-foto?conversa='+id+'&op='+fid,png)).status,200);assert.equal((await raw('/msg/cliente-foto?conversa='+id+'&op='+fid,png)).status,200);
  const fc=sqlite.prepare('SELECT * FROM foto_cliente').all();assert.equal(fc.length,1);assert.equal(fc[0].nome,'Cliente Teste');assert.equal(fc[0].whats,'5588991234567');assert.equal(fc[0].vinculo,'mensageiro:'+id);
  const grupo=Number(sqlite.prepare("INSERT INTO msg_conversa(canal,contato,nome,grupo) VALUES('whatsapp1','grupo','Grupo Teste',1)").run().lastInsertRowid);
  assert.equal((await chamar('/msg/solicitacoes','POST',{id:'33333333-3333-4333-8333-333333333333',conversa:grupo,descricao:'Não é cliente individual'})).status,400);
  assert.equal(W.msgRecurso_('/msg/solicitacoes/editar',{method:'POST'},new URL('https://worker.test')), 'responder');
  assert.equal(W.msgRecurso_('/msg/solicitacoes',{method:'GET'},new URL('https://worker.test')), 'acessar');
  assert.equal((await W.default.fetch(new Request('https://worker.test/msg/solicitacoes'),env,{})).status,401,'Sem sessão não lê solicitações');
  assert.equal(envios.length,0,'Nenhuma ação envia mensagens');
  console.log('OK solicitações: ficha, isolamento de grupos, fotos privadas, idempotência, edição concorrente, acompanhamento e nenhum envio.');
})().catch(e=>{console.error(e);process.exitCode=1;});
