/* v7.65 — encerrar cliente = todos os canais; pontuação por cliente = média dos canais (exemplos de docs/ia/mensageiro-pontuacao.md).
   D1 SQLite real (node:sqlite); nenhum envio a destinatário real. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-pontuacao-canais.mjs');
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
  const cfg=(await chamar('/msg/gestor/prioridade')).j.config,now=Date.now(),em=n=>new Date(now-n*86400000).toISOString();
  const pts=(linhas)=>W.pontuarCliente_(W.episodiosCliente_(linhas),cfg,now).pontos;
  // Regras padrão: base 50, falta de resposta −3, concluído +2, vendeu +10, engano 0.
  assert.deepEqual([cfg.base,cfg.regras.sem_resposta.pontos,cfg.regras.concluido.pontos,cfg.regras.vendeu.pontos],[50,-3,2,10]);
  const L=(motivo,conv,t)=>({motivo,conversa_id:conv,em:new Date(Date.parse(em(1))+t*1000).toISOString()});
  // Exemplo 1: um canal, falta de resposta: 50 − 3 = 47.
  assert.equal(pts([L('sem_resposta',1,0)]),47);
  // Exemplo 2: três canais encerrados juntos por falta de resposta: UMA vez (média 3/3), não três (41). Mesmo com segundos de diferença.
  assert.equal(pts([L('sem_resposta',1,0),L('sem_resposta',2,0),L('sem_resposta',3,0)]),47);
  assert.equal(pts([L('sem_resposta',1,0),L('sem_resposta',2,20),L('sem_resposta',3,45)]),47,'Legado: encerrados em sequência na mesma rodada também contam uma vez');
  // Exemplo 3: três canais encerrados após resposta (concluído): +2 uma vez = 52.
  assert.equal(pts([L('concluido',1,0),L('concluido',2,0),L('concluido',3,0)]),52);
  // Exemplo 4: resultados diferentes dividem o peso: 2 canais sem resposta + 1 vendeu = −3×2/3 + 10×1/3 = +1,33 → 51.
  const mix=W.episodiosCliente_([L('sem_resposta',1,0),L('sem_resposta',2,0),L('vendeu',3,0)]);
  assert.equal(mix.length,2);assert(Math.abs(mix.find(x=>x.motivo==='sem_resposta').peso-2/3)<1e-9);assert(Math.abs(mix.find(x=>x.motivo==='vendeu').peso-1/3)<1e-9);
  assert.equal(pts([L('sem_resposta',1,0),L('sem_resposta',2,0),L('vendeu',3,0)]),51);
  // Exemplo 5: rodadas diferentes (dias separados) são eventos diferentes: 47 e depois 44.
  assert.equal(pts([{motivo:'sem_resposta',conversa_id:1,em:em(5)},{motivo:'sem_resposta',conversa_id:1,em:em(2)}]),44);
  // Validade: depois de 14 dias a falta de resposta deixa de contar.
  assert.equal(pts([{motivo:'sem_resposta',conversa_id:1,em:em(15)}]),50);
  // Limite de eventos continua valendo (5 × −3): 7 rodadas = 35.
  assert.equal(pts([1,2,3,4,5,6,7].map(i=>({motivo:'sem_resposta',conversa_id:1,em:em(i*0.5)}))),35);

  // Servidor: encerrar UM canal encerra TODOS os canais do cliente, numa operação, sem apagar dados.
  const criar=(canal,contato,pessoa,grupo=0)=>Number(sqlite.prepare("INSERT INTO msg_conversa(canal,contato,pessoa,nome,grupo,total,ultima_em,ult_dir,ult_entrada_em,atualizada_em,nao_lidas) VALUES(?,?,?,'Cliente simulado',?,1,?,'entrada',?,?,2)").run(canal,contato,pessoa,grupo,em(0.01),em(0.01),em(0.01)).lastInsertRowid);
  const a=criar('whatsapp1','5588999000011','cliente-1'),b=criar('whatsapp2','5588999000012','cliente-1'),ig=criar('instagram','17841400000011','cliente-1'),outro=criar('whatsapp1','5588999000013','cliente-2'),b2=criar('whatsapp2','5588999000014','cliente-3');
  sqlite.prepare("UPDATE msg_conversa SET encerrada_em=? WHERE id=?").run(em(3),b2);   // canal já encerrado antes: não vira evento novo
  const msgs=sqlite.prepare('SELECT COUNT(*) n FROM msg_mensagem').get().n;
  let r=await chamar('/msg/encerrar','POST',{conversa:a,motivo:'sem_resposta'});
  assert.equal(r.status,200);assert.deepEqual(r.j.tambemEncerradas.map(x=>x.canal).sort(),['instagram','whatsapp2']);
  const estado=id=>sqlite.prepare('SELECT encerrada_em,encerrada_motivo FROM msg_conversa WHERE id=?').get(id);
  for(const id of [a,b,ig]){assert(estado(id).encerrada_em,'Todos os canais do cliente encerram');assert.equal(estado(id).encerrada_motivo,'sem_resposta');}
  assert.equal(estado(outro).encerrada_em,'','Outro cliente não é tocado');
  const evs=sqlite.prepare('SELECT conversa_id,em FROM msg_encerramento ORDER BY conversa_id').all();assert.equal(evs.length,3);assert.equal(new Set(evs.map(x=>x.em)).size,1,'Mesma rodada: mesmo instante');
  r=await chamar('/msg/encerrar','POST',{conversa:b,motivo:'sem_resposta'});assert.equal(r.status,200);assert.equal(r.j.tambemEncerradas.length,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_encerramento').get().n,3,'Idempotente: repetir não cria novo evento');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_mensagem').get().n,msgs,'Nenhum dado apagado');
  // Pontuação ao vivo (relacionamento): 3 canais encerrados juntos = 47, uma vez.
  cache.clear();const rel=(await chamar('/msg/relacionamento?conversa='+a)).j.relacionamento;assert.equal(rel.pontos,47);assert.equal(rel.historico.find(x=>x.motivo==='sem_resposta').total,1);
  // Lote com vários clientes: cada um leva todos os canais.
  const c1=criar('whatsapp1','5588999000021','cliente-4'),c2=criar('instagram','17841400000021','cliente-4');
  r=await chamar('/msg/encerrar','POST',{conversas:[c1,outro],motivo:'concluido'});assert.equal(r.j.tambemEncerradas.length,1);assert(estado(c2).encerrada_em);assert(estado(outro).encerrada_em);
  // Reabrir continua individual (não reabre sozinho os outros canais).
  r=await chamar('/msg/encerrar','POST',{conversa:a,reabrir:true});assert.equal(estado(a).encerrada_em,'');assert(estado(b).encerrada_em);
  console.log('OK: encerrar cliente fecha todos os canais, idempotente, pontuação por média dos canais (exemplos do documento).');
})().catch(e=>{console.error(e);process.exitCode=1;});
