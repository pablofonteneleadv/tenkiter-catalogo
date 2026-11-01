/* v7.40.33 — presença, equipe e início de conversa (itens retomados do #305).
   D1 SQLite real; nenhum envio a destinatário real. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-prioridade-teste.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '../instagram-worker/worker.js')) + '\nexport {equipeAtendimento_,iniciarConversa_,registrarAtividade_};');
  const W = await import(tmp);
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
  const cfg=(await chamar('/msg/gestor/prioridade')).j.config,now=Date.now(),em=n=>new Date(now-n*86400000).toISOString();
  const pontuar=xs=>W.pontuarCliente_(xs,cfg,now);
  assert.equal(pontuar([]).pontos,50);
  assert.equal(pontuar([{motivo:'vendeu',em:em(1)},{motivo:'vendeu',em:em(1)},{motivo:'sem_resposta',em:em(2)}]).pontos,57,'Mesmo encerramento em dois canais não duplica pontos');
  assert.equal(pontuar([{motivo:'sem_resposta',em:em(15)}]).pontos,50,'Desconto expira e prioridade se recupera');
  assert.equal(pontuar(Array.from({length:8},(_,i)=>({motivo:'vendeu',em:em(i)}))).motivos[0].eventos,5,'Limite por motivo');
  assert.equal(pontuar([{motivo:'engano',em:em(1)},{motivo:'vendeu',em:em(-1)}]).pontos,50,'Engano sem punição padrão e evento futuro ignorado');
  const criar=(canal,contato,pessoa,fechada,espera=0)=>Number(sqlite.prepare("INSERT INTO msg_conversa(canal,contato,nome,pessoa,grupo,total,ult_dir,ult_entrada_em,encerrada_em,encerrada_motivo) VALUES(?,?,?, ?,0,1,'entrada',?,?,?)").run(canal,contato,'Cliente simulado',pessoa,new Date(now-espera*60000).toISOString(),fechada?em(1):'',fechada?'sem_resposta':'').lastInsertRowid);
  const a=criar('whatsapp1','5588999000001','cliente-a',true),b=criar('instagram','ig-cliente-a','cliente-a',true);
  const enc=(id,motivo,quando)=>sqlite.prepare('INSERT INTO msg_encerramento(conversa_id,canal,pessoa,motivo,em) SELECT id,canal,pessoa,?,? FROM msg_conversa WHERE id=?').run(motivo,quando,id);
  enc(a,'vendeu',em(2));enc(b,'vendeu',em(2));enc(a,'sem_resposta',em(1));
  let g=(await chamar('/msg/gestor')).j;assert.equal(g.prioridades.retomadas.length,1);assert.equal(g.prioridades.retomadas[0].pontuacao.pontos,57);
  const antigo=criar('whatsapp1','5588999000002','cliente-antigo',false,100),novo=criar('whatsapp2','5588999000003','cliente-a',false,5);
  g=(await chamar('/msg/gestor')).j;assert.equal(g.prioridades.retomadas.length,0,'Conversa aberta vinculada sai das sugestões de retomada');assert.equal(g.fila[0].id,antigo,'Pontuação não rebaixa nova mensagem por urgência e espera');assert.equal(g.fila.find(x=>x.id===novo).pontuacao.pontos,57);
  cfg.regras.vendeu.pontos=20;const saved=await chamar('/msg/gestor/prioridade','POST',cfg);assert.equal(saved.status,200);assert.equal(saved.j.config.versao,1);
  assert.equal((await chamar('/msg/gestor/prioridade','POST',cfg)).status,409,'Protege outra sessão');
  assert.equal((await chamar('/msg/gestor/prioridade','POST',{...saved.j.config,regras:{...saved.j.config.regras,vendeu:{pontos:999,dias:90}}})).status,400);
  g=(await chamar('/msg/gestor')).j;assert.equal(g.fila.find(x=>x.id===novo).pontuacao.pontos,67,'Regras novas recalculam o histórico sem o alterar');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_encerramento').get().n,3);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_gestor_log WHERE acao='prioridade'").get().n,1);
  cache.clear();kv.clear();global.fetch=async()=>Response.json({ok:true,usuario:{nome:'Equipe',permissoes:['catalogo_admin','painel_simples']}});assert.equal((await chamar('/msg/gestor/prioridade')).status,403);
  console.log('OK: prioridade explicável, eventos únicos, validade, limites, retomada sem conversa aberta, urgência preservada, regras auditadas e ACL.');
})().catch(e=>{console.error(e);process.exitCode=1;});
