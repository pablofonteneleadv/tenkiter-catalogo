/* v7.40.33 — presença, equipe e início de conversa (itens retomados do #305).
   D1 SQLite real; nenhum envio a destinatário real. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-tempo-teste.mjs');
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
  const RealDate=Date;let now=Date.parse('2026-10-31T15:00:00Z');global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};
  const conv=Number(sqlite.prepare("INSERT INTO msg_conversa(canal,contato,nome) VALUES('whatsapp1','5588999000000','Cliente simulado')").run().lastInsertRowid);
  const beat=(fonte,estado='lendo')=>chamar('/msg/presenca','POST',{fonte,estado,conversa:conv});
  const pessoa='558899999999';
  await beat('web_abcdefgh');now+=45000;await beat('web_abcdefgh');
  let m=await chamar('/msg/gestor?dias=1');let p=m.j.tempos.pessoas.find(x=>x.usuario===pessoa);assert.equal(p.online,45);assert.equal(p.atendimento,45);assert.equal(p.ativo,45);
  now+=45000;await beat('web_abcdefgh');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_tempo_intervalo').get().n,1,'Mesmo estado é comprimido, não cria linha por batida');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_atividade WHERE acao IN ('online','visualizar','espiar')").get().n,0,'Entrar/navegar não infla ações');
  now+=5*60000;await beat('web_abcdefgh');m=await chamar('/msg/gestor?dias=1');p=m.j.tempos.pessoas.find(x=>x.usuario===pessoa);assert.equal(p.online,90,'Lacuna não vira trabalho ou ausência');
  await chamar('/msg/disponibilidade','POST',{pausa:true});now+=45000;await beat('web_abcdefgh','redigindo');now+=45000;await beat('web_abcdefgh','redigindo');m=await chamar('/msg/gestor?dias=1');p=m.j.tempos.pessoas.find(x=>x.usuario===pessoa);assert.equal(p.segundos.pausa,45);assert.equal(p.ativo,90,'Pausa informada domina atividade');
  await chamar('/msg/disponibilidade','POST',{pausa:false});now+=45000;await beat('web_abcdefgh','oculto');now+=30000;await beat('web_abcdefgh','lendo');m=await chamar('/msg/gestor?dias=1');p=m.j.tempos.pessoas.find(x=>x.usuario===pessoa);assert.equal(p.online,180,'Ocultar/retornar não preenche intervalo em segundo plano');
  // Sequência atrasada não desfaz o estado mais recente; oculto vence pausa.
  await chamar('/msg/disponibilidade','POST',{pausa:true});
  now+=45000;await chamar('/msg/presenca','POST',{fonte:'web_sequencia',seq:10,estado:'lendo',conversa:conv});
  now+=45000;await chamar('/msg/presenca','POST',{fonte:'web_sequencia',seq:12,estado:'oculto',conversa:conv});
  now+=1000;await chamar('/msg/presenca','POST',{fonte:'web_sequencia',seq:11,estado:'lendo',conversa:conv});
  const sinal=sqlite.prepare("SELECT estado,seq FROM msg_tempo_sinal WHERE fonte='web_sequencia'").get();assert.equal(sinal.estado,'oculto');assert.equal(sinal.seq,12);
  const rows=[{usuario:'a',inicio:0,fim:60000,estado:'lendo'},{usuario:'a',inicio:30000,fim:90000,estado:'redigindo'},{usuario:'b',inicio:0,fim:90000,estado:'ausente'}];
  const resumo=W.resumirTempos_(rows,0,90000);assert.equal(resumo[0].online,90);assert.equal(resumo[0].segundos.lendo,30);assert.equal(resumo[0].segundos.redigindo,60);assert.equal(resumo[1].ativo,0);
  assert.equal(W.resumirTempos_(rows,45000,75000)[0].online,30,'Recorte do período correto');
  // O passado é mantido para auditoria, mas as consultas não contam entradas antigas.
  sqlite.prepare("INSERT INTO msg_atividade(chave,usuario,nome,acao,em) VALUES('antiga',?,'Ana','online',?)").run(pessoa,new Date(now).toISOString());
  const equipe=await chamar('/msg/equipe');assert(!equipe.j.atividades.some(x=>x.acao==='online'));assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_atividade WHERE chave='antiga'").get().n,1);
  assert.equal((await chamar('/msg/disponibilidade','POST',{pausa:'sim'})).status,400);
  global.Date=RealDate;
  console.log('OK: tempos por sinais, compressão, lacunas, pausa, múltiplas telas sem duplicar, recorte e ações históricas preservadas sem inflar totais.');
})().catch(e=>{console.error(e);process.exitCode=1;});
