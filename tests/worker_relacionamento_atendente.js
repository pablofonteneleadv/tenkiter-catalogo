/* v7.40.33 — presença, equipe e início de conversa (itens retomados do #305).
   D1 SQLite real; nenhum envio a destinatário real. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { assert(x.length<=100,'Limite de parâmetros D1');args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-relacionamento-teste.mjs');
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
  const now=Date.now(),at=ms=>new Date(now-ms).toISOString();
  const criar=(canal,contato,pessoa,grupo=0)=>Number(sqlite.prepare("INSERT INTO msg_conversa(canal,contato,pessoa,nome,grupo,total,ultima_em,ult_dir,ult_entrada_em,atualizada_em,nao_lidas) VALUES(?,?,?,'Cliente simulado',?,1,?,'entrada',?,?,2)").run(canal,contato,pessoa,grupo,at(1000),at(1000),at(1000)).lastInsertRowid);
  const a=criar('whatsapp1','5588999000011','cliente-1'),b=criar('whatsapp2','5588999000012','cliente-1'),outro=criar('whatsapp1','5588999000013','cliente-2'),grupo=criar('whatsapp1','123-group','',1);
  const enc=(id,motivo,em)=>sqlite.prepare("INSERT INTO msg_encerramento(conversa_id,canal,pessoa,motivo,em) SELECT id,canal,pessoa,?,? FROM msg_conversa WHERE id=?").run(motivo,em,id);
  for(let i=0;i<15;i++){enc(a,'sem_resposta',at(86400000+i*1000));enc(b,'sem_resposta',at(86400000+i*1000));}
  enc(a,'vendeu',at(120*86400000));enc(outro,'vendeu',at(10000));
  const pessoa=(await chamar('/msg/pessoa?conversa='+a)).j;assert.equal(pessoa.conversa.relacionamento.pontos,35);assert(pessoa.canais.every(c=>c.relacionamento.pontos===35),'Editar vínculo não perde resumo no cache nativo');
  // Conta comum, sem métricas ou gestão, pode consultar o contexto do cliente.
  cache.clear();kv.clear();global.fetch=async()=>Response.json({ok:true,usuario:{nome:'Equipe',permissoes:['catalogo_admin','painel_simples']}});
  const r=await chamar('/msg/relacionamento?conversa='+a);assert.equal(r.status,200);const h=r.j.relacionamento;
  assert.equal(h.pontos,35);assert.equal(h.historico.find(x=>x.motivo==='sem_resposta').total,15,'Quinze ocorrências não são escondidas pelo limite de cinco pontos');
  assert.equal(h.totalEventos,16,'Venda antiga continua no histórico, mesmo fora da pontuação');assert.equal(h.motivos[0].ocorrencias,15);assert.equal(h.motivos[0].eventos,5);assert.equal(h.motivos[0].pontos,-15);
  assert(!('config' in r.j));assert(!JSON.stringify(r.j).includes('cliente-2'));assert(!JSON.stringify(r.j).includes('por'));
  const rb=(await chamar('/msg/relacionamento?conversa='+b)).j.relacionamento;assert.deepEqual(rb,h,'Canais vinculados veem o mesmo histórico sem duplicar');
  const lista=(await chamar('/msg/conversas?canal=todos')).j.conversas;assert.equal(lista.find(c=>c.id===a).relacionamento.pontos,35);assert(!lista.find(c=>c.id===grupo).relacionamento);
  const ordem=sqlite.prepare('SELECT id FROM msg_conversa ORDER BY ultima_em DESC,id DESC').all().map(c=>c.id);assert.deepEqual(lista.map(c=>c.id),ordem,'Nota não ordena a fila');
  assert.equal((await chamar('/msg/mensagens?conversa='+a)).j.conversa.relacionamento.pontos,35);assert.equal(sqlite.prepare('SELECT nao_lidas FROM msg_conversa WHERE id=?').get(a).nao_lidas,2,'Consultar histórico não marca leitura');
  assert.equal((await chamar('/msg/gestor/prioridade')).status,403,'Consultar cliente não concede gestão');assert.equal((await chamar('/msg/relacionamento?conversa='+grupo)).status,404);assert.equal((await chamar('/msg/relacionamento?conversa=-1')).status,400);assert.equal((await chamar('/msg/relacionamento?conversa=99999')).status,404);
  const sem=criar('instagram','17840000','');assert.equal((await chamar('/msg/relacionamento?conversa='+sem)).j.relacionamento.totalEventos,0);
  for(let i=0;i<80;i++)criar('whatsapp2','5588999'+String(1000+i),'pessoa-'+i);
  const delta=(await chamar('/msg/novidades?desde='+encodeURIComponent(at(60000)))).j;assert(delta.conversas.length>50);assert.equal(delta.conversas.find(c=>c.id===a).relacionamento.pontos,35);assert(delta.conversas.filter(c=>!c.grupo).every(c=>Number.isInteger(c.relacionamento?.pontos)),'Incremental preserva resumo para mais de50 clientes sem exceder parâmetros');
  // O vínculo atual resolve também aliases, sem reunir clientes pelo nome.
  cache.clear();sqlite.prepare("INSERT INTO msg_pessoa_alias(canal,contato,pessoa) VALUES('whatsapp1','5588999000011','cliente-alias')").run();assert.equal((await chamar('/msg/relacionamento?conversa='+a)).j.relacionamento.historico.find(x=>x.motivo==='sem_resposta').total,15);
  const semSessao=await W.default.fetch(new Request('https://worker.test/msg/relacionamento?conversa='+a),env,{});assert.equal(semSessao.status,401);
  cache.clear();kv.clear();global.fetch=async()=>Response.json({ok:true,usuario:{nome:'Sem acesso',permissoes:[]}});assert.equal((await chamar('/msg/relacionamento?conversa='+a)).status,403);assert.equal(envios.length,0);
  console.log('OK: relacionamento para atendente, quinze ocorrências sem duplicar, expiração/pontos, escopo, ACL, leitura e ordem preservadas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
