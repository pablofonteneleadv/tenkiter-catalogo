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

  const now=Date.now(),iso=n=>new Date(now-n*60000).toISOString();
  let n=0;
  const criar=(canal,pessoa,nome,atendido=false,fechado=false,grupo=0)=>Number(sqlite.prepare("INSERT INTO msg_conversa(canal,contato,nome,pessoa,grupo,total,criado_em,ultima_em,ult_entrada_em,ult_dir,atendido_em,encerrada_em) VALUES(?,?,?,?,?,1,?,?,?,'entrada',?,?)").run(canal,'contato-'+(++n),nome,pessoa,grupo,iso(80),iso(n),iso(70),atendido?iso(60):'',fechado?iso(40):'').lastInsertRowid);
  const ids=[criar('whatsapp1','p1','Pablo',false),criar('whatsapp2','p1','Nome antigo',true),criar('instagram','p1','Outro alias',true,true),criar('instagram','p2','Pablo',true,true),criar('instagram','p3','Pablo',true),criar('whatsapp1','p3','Alias diferente',false)];
  const grupo=criar('whatsapp1','interno','Equipe interna',false,true,1);
  let r=await chamar('/msg/conversas?canal=todos&fila=em_atendimento&blocos=1');assert.equal(r.status,200,JSON.stringify(r.j));assert(r.j.conversas.some(c=>c.id===grupo));let g=r.j.conversas.find(c=>c.id===grupo);assert.equal(g.encerrada_em,'');assert.equal(g.em_atendimento,1);assert.equal(g.aguarda_resposta,0);
  r=await chamar('/msg/conversas?canal=todos&fila=esperando');assert(!r.j.conversas.some(c=>c.grupo));
  r=await chamar('/msg/conversas?canal=todos&fila=em_atendimento&tipo=grupo');assert.deepEqual(r.j.conversas.map(c=>c.id),[grupo]);
  r=await chamar('/msg/conversas?canal=todos&filtro=encerradas');assert(!r.j.conversas.some(c=>c.grupo));
  assert.equal((await chamar('/msg/encerrar','POST',{conversas:[grupo,ids[0]]})).status,409);assert.equal(sqlite.prepare('SELECT encerrada_em FROM msg_conversa WHERE id=?').get(ids[0]).encerrada_em,'');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_encerramento').get().n,0);
  for(const flags of ['fila=em_atendimento&escopo=meus&tipo=individual&filtro=sem_resposta&canal=whatsapp1','filtro=encerradas&tipo=grupo&canal=instagram','fila=esperando&canal=todos']){
   r=await chamar('/msg/conversas?blocos=1&busca=Pablo&etiqueta=999&'+flags);assert.equal(r.status,200,JSON.stringify(r.j));assert.deepEqual([...r.j.conversas.map(c=>c.id)].sort((a,b)=>a-b),ids,'Busca global e expansão dos canais');assert.equal(new Set(r.j.conversas.map(c=>c.pessoa)).size,3,'Homônimos não são unidos');assert(r.j.conversas.some(c=>c.encerrada_em));assert(r.j.conversas.some(c=>!c.encerrada_em&&!c.em_atendimento));
  }
  r=await chamar('/msg/conversas?canal=todos&busca='+encodeURIComponent("%' OR 1=1 --"));assert.equal(r.j.conversas.length,0);r=await chamar('/msg/conversas?canal=todos&busca=%25');assert.equal(r.j.conversas.length,0);
  sqlite.prepare("INSERT INTO msg_mensagem(conversa_id,canal,ext_id,direcao,texto,enviada_em) VALUES(?,'instagram','texto-global','entrada','referencia-especial',?)").run(ids[2],iso(2));
  r=await chamar('/msg/conversas?canal=whatsapp1&busca=referencia-especial');assert.deepEqual(r.j.conversas.map(c=>c.id).sort((a,b)=>a-b),ids.slice(0,3));
  r=await chamar('/msg/conversas?canal=todos&tipo=individual');assert(r.j.contagens.esperando_desde);assert.equal(r.j.contagens.grupos,0);assert.equal(r.j.contagens.encerradas,2);
  await W.registrarAtividade_(env,new Request('https://worker.test',{headers}),{conversa:grupo},'responder');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_atividade').get().n,0);
  sqlite.prepare("INSERT INTO msg_mensagem(conversa_id,canal,ext_id,direcao,texto,enviada_em) VALUES(?,'whatsapp1','primeira-espera','entrada','Oi',?)").run(ids[0],iso(90));sqlite.prepare('UPDATE msg_conversa SET ult_entrada_em=? WHERE id=?').run(iso(1),ids[0]);
  r=await chamar('/msg/conversas?canal=todos&tipo=individual');assert.equal(r.j.contagens.esperando_desde,iso(90),'Primeira entrada, não a mensagem recente');
  for(let i=0;i<55;i++)criar('whatsapp1','pagina-'+i,'Pablo paginado '+i,true);
  r=await chamar('/msg/conversas?canal=todos&busca=Pablo&blocos=1');assert(r.j.temMais);const primeira=r.j.conversas,proximo=r.j.proximo;assert.equal(new Set(primeira.map(c=>c.pessoa)).size,50);
  r=await chamar('/msg/conversas?canal=todos&busca=Pablo&blocos=1&antes='+encodeURIComponent(proximo.em)+'&antesId='+proximo.id);assert(!r.j.temMais);const todas=[...primeira,...r.j.conversas];assert.equal(new Set(todas.map(c=>c.pessoa)).size,58);assert.equal(new Set(todas.map(c=>c.id)).size,61);assert.equal(todas.length,61,'Sem repetição ou corte de canal na paginação');
  console.log('OK: grupos internos, encerramento atômico bloqueado, busca global, homônimos, canais completos, mensagem antiga, parâmetros seguros e espera.');
})().catch(e=>{console.error(e);process.exitCode=1;});
