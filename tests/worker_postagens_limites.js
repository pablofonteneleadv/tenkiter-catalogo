/* Partes: D1 real, R2 e provedor simulados. Nada é enviado a serviços reais. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { assert(x.length<=100,'D1: máximo100parâmetros por comando');args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-fila-limites.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '../instagram-worker/worker.js')) + '\nexport {videoClaims_,videoUsuario_,videoRunner_,autorizarVideoRunner_};export function simularAvanco_(f){avancarPostagem=f;}');
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
  await chamar('/post/config','POST',{config:{pausaAtiva:false,canais:{status:{max24h:1},status2:{max24h:90}}}});
  const RealDate=Date;let time=Date.parse('2026-11-03T18:00:00Z');global.Date=class extends RealDate{constructor(...xs){super(...(xs.length?xs:[time]));}static now(){return time;}};
  const criar=(canal,status,agendado,publicado='',extra={})=>Number(sqlite.prepare("INSERT INTO postagem(tipo,modo,midias,agendado_em,status,canal,publicado_em,ig_id,zap_estado,serie,parte,partes) VALUES('story','auto','[]',?,?,?,?,?,?,?,?,?)").run(agendado,status,canal,publicado,extra.ig_id||'',extra.zap_estado||'',extra.serie||'',extra.parte||0,extra.partes||0).lastInsertRowid);
  const passado=new Date(time-3600000).toISOString(),publicado=criar('whatsapp','publicado',passado,passado);
  const bloqueadas=Array.from({length:40},()=>criar('whatsapp','agendado',passado));const livre=criar('whatsapp2','agendado',passado);
  const calls=[];W.simularAvanco_(async(e,t,p)=>{calls.push(p.id);await DB.prepare("UPDATE postagem SET status='publicado',publicado_em=? WHERE id=?").bind(new Date().toISOString(),p.id).run();});
  await W.processarPostagens(env);assert.deepEqual(calls,[livre],'40 antigas no teto de um destino não escondem outro destino livre');
  let lista=(await chamar('/posts?limite=250')).j.posts;const espera=lista.find(p=>p.id===bloqueadas[0]).espera;assert.equal(espera.motivo,'limite24h');assert.equal(espera.limites[0].usadas,1);assert.equal(espera.limites[0].limite,1);assert.equal(espera.retomaEm,new Date(Date.parse(passado)+86400000+1000).toISOString());
  const incerto=criar('whatsapp2','agendado',passado),futuro=criar('whatsapp2','agendado',new Date(time+3600000).toISOString()),processando=criar('whatsapp2','processando',passado),erro=criar('whatsapp2','erro',passado);
  sqlite.prepare("INSERT INTO postagem_grupo_recibo(postagem_id,ordem,estado) VALUES(?,1,'enviando')").run(incerto);
  const antes=sqlite.prepare('SELECT * FROM postagem WHERE id=?').get(publicado);
  const ids=[...bloqueadas,publicado,livre,incerto,futuro,processando,erro];
  let retomada=await chamar('/post/retomar-pendentes','POST',{ids,limitePorCanal:90,idLocal:'retomar-limites-0001'});assert.equal(retomada.status,200,JSON.stringify(retomada));assert.equal(retomada.j.retomadas,40);assert.equal(retomada.j.preservadas,6);assert.equal(retomada.j.config.canais.status.max24h,90);assert.equal(retomada.j.config.canais.status2.max24h,90);assert.equal(retomada.j.config.max24h,90,'Teto global Instagram mantido');assert.equal(retomada.j.aguardandoLimite,0);
  const horarios=sqlite.prepare('SELECT id,agendado_em FROM postagem ORDER BY id').all();time+=10000;const repetida=await chamar('/post/retomar-pendentes','POST',{ids,limitePorCanal:90,idLocal:'retomar-limites-0001'});assert.equal(repetida.j.retomadas,40);assert.deepEqual(sqlite.prepare('SELECT id,agendado_em FROM postagem ORDER BY id').all(),horarios,'Resposta perdida não reorganiza nem duplica a fila');
  assert.deepEqual(sqlite.prepare('SELECT * FROM postagem WHERE id=?').get(publicado),antes,'Publicado fica intacto');assert.equal(sqlite.prepare('SELECT estado FROM postagem_grupo_recibo WHERE postagem_id=?').get(incerto).estado,'enviando');assert.equal(sqlite.prepare('SELECT status FROM postagem WHERE id=?').get(erro).status,'erro');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM postagem').get().n,46,'Retomar não cria cópias');
  assert.equal((await chamar('/post/retomar-pendentes','POST',{ids:[]})).status,400);assert.equal((await chamar('/post/retomar-pendentes','POST',{ids,limitePorCanal:1000})).status,403);
  assert(sqlite.prepare("SELECT valor FROM cfg WHERE chave='po_retoma_ultima'").get(),'Ajuste de regra guarda cópia anterior e autoria');
  await W.processarPostagens(env);assert.equal(calls.filter(id=>bloqueadas.includes(id)).length,1,'Retomada respeita o intervalo, sem despejar a fila de uma vez');
  const antesCfg=sqlite.prepare("SELECT valor FROM cfg WHERE chave='po_cfg'").get().valor,originalFetch=global.fetch;
  global.fetch=async(u,o)=>String(u)==='https://backend.test'?Response.json({ok:true,usuario:{nome:'Equipe',permissoes:['catalogo_cadastrar']}}):originalFetch(u,o);cache.clear();
  const equipeId=criar('whatsapp2','agendado',passado);
  assert.equal((await chamar('/post/retomar-pendentes','POST',{ids:[equipeId],limitePorCanal:90,idLocal:'equipe-sem-admin'})).status,403);
  assert.equal((await chamar('/post/retomar-pendentes','POST',{ids:[equipeId],idLocal:'equipe-sem-ajuste'})).status,200,'Equipe retoma sem mudar regras');
  assert.equal(sqlite.prepare("SELECT valor FROM cfg WHERE chave='po_cfg'").get().valor,antesCfg);
  assert.equal((await W.default.fetch(new Request('https://worker.test/post/retomar-pendentes',{method:'POST',body:'{}'}),env,{})).status,401);global.fetch=originalFetch;cache.clear();
  // Muitos vínculos de partes nunca excedem100 parâmetros no D1.
  sqlite.exec('DELETE FROM postagem_grupo_recibo;DELETE FROM postagem');
  for(let i=0;i<60;i++)criar('whatsapp','agendado',passado,'',{serie:'serie-'+i,parte:2,partes:2});
  await W.processarPostagens(env);assert(!calls.some(id=>id===publicado),'Comprovante antigo não é reenviado');
  assert.equal(envios.length,0,'Nenhum serviço real usado');global.Date=RealDate;
  console.log('Limites: destinos independentes, janela24h, retomada sem cópias, comprovantes preservados, regra90 auditada e partes em lotes aprovados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
