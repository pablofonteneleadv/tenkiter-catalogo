/* v7.40.33 — presença, equipe e início de conversa (itens retomados do #305).
   D1 SQLite real; nenhum envio a destinatário real. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-video-preparo.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '../instagram-worker/worker.js')) + '\nexport {videoClaims_,videoUsuario_,videoRunner_,autorizarVideoRunner_};');
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
  const seg = sqlite.prepare("SELECT valor FROM cfg WHERE chave='msg_wh_segredo'").get();
  if (!seg) await chamar('/wh/wafly/1/iniciar', 'POST', {});
  const segredo = sqlite.prepare("SELECT valor FROM cfg WHERE chave='msg_wh_segredo'").get().valor;
  const wh = async (id, slot = 1, telefone = '5588991234567', nome = 'Cliente simulado') => W.default.fetch(new Request('https://worker.test/wh/wafly/' + slot + '/' + segredo, { method: 'POST', body: JSON.stringify({ type: 'ReceivedCallback', messageId: id, phone: telefone, senderName: nome, fromMe: false, text: { message: 'Teste' }, momment: Date.now() }) }), env, {});
  await wh('entrada-1');
  const conv = sqlite.prepare("SELECT id FROM msg_conversa WHERE canal='whatsapp1'").get().id;


  const J=(body,status=200)=>Response.json(body,{status});
  const call=async(path,method='GET',body,custom=headers)=>W.default.fetch(new Request('https://worker.test'+path,{method,headers:custom,body}),env,{});
  const src=Buffer.alloc(2048,0);src.write('ftyp',4);src.write('isom',8);
  assert.equal((await call('/msg/video-preparar?inicio=0&duracao=12','POST',src)).status,400,'Mensageiro recusa recorte');
  sqlite.prepare("INSERT OR REPLACE INTO cfg(chave,valor) VALUES('freeconvert_api_key','simulada')").run();
  const paid=await call('/post/freeconvert/iniciar','POST',JSON.stringify({url:'https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/260101/00000000000000000000.mp4',formato:'mp4'}));assert.equal(paid.status,400,'Sem consentimento não iniciar serviço externo');
  const req=await call('/msg/video-preparar','POST',src);assert.equal(req.status,200);const id=(await req.json()).id;assert(id);const duplicate=await call('/msg/video-preparar','POST',src);assert.equal((await duplicate.json()).id,id,'Mesmo original não cria outro trabalho');
  assert.equal((await call('/msg/video-preparar?id='+id)).status,200);
  const outro={...headers,'X-TK-Whats':'5588999998888'};
  assert.equal((await W.videoUsuario_(env,new Request('https://worker.test/msg/video-preparar?id='+id,{headers:outro}),new URL('https://worker.test/msg/video-preparar?id='+id),J)).status,404,'Conta diferente não consulta o trabalho');
  const base={iss:'https://token.actions.githubusercontent.com',aud:'tenkiter-video',repository:'pablofonteneleadv/tenkiter-catalogo',repository_id:'1366921721',repository_owner_id:'207932006',repository_owner:'pablofonteneleadv',ref:'refs/heads/main',workflow_ref:'pablofonteneleadv/tenkiter-catalogo/.github/workflows/wafly-transcode.yml@refs/heads/main',sub:'repo:pablofonteneleadv/tenkiter-catalogo:ref:refs/heads/main',event_name:'workflow_dispatch',exp:Math.floor(Date.now()/1000)+300,nbf:Math.floor(Date.now()/1000)-1};
  assert(W.videoClaims_(base));for(const bad of [{aud:'x'},{repository:'outro/repo'},{ref:'refs/pull/1/merge'},{workflow_ref:'outro'},{exp:1},{event_name:'pull_request'},{sub:''}])assert(!W.videoClaims_({...base,...bad}));
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='local-test';jwk.use='sig';
  const originalFetch=global.fetch;global.fetch=async(u,opt)=>String(u).includes('/.well-known/jwks')?Response.json({keys:[jwk]}):originalFetch(u,opt);
  const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const msg=b64({alg:'RS256',kid:jwk.kid})+'.'+b64(base);const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(msg))).toString('base64url');
  const auth={Authorization:'Bearer '+msg+'.'+signature};
  assert(await W.autorizarVideoRunner_(new Request('https://worker.test',{headers:auth})));
  assert(!await W.autorizarVideoRunner_(new Request('https://worker.test',{headers:{Authorization:auth.Authorization.slice(0,-20)+'123'}})));
  assert.equal((await call('/internal/video?acao=saude')).status,401);
  assert.equal((await call('/internal/video?acao=saude','GET',undefined,auth)).status,200);
  let job=await (await call('/internal/video?acao=proximo','POST',undefined,auth)).json();assert.equal(job.job.id,id);job=job.job;
  assert.equal((await (await call('/internal/video?acao=proximo','POST',undefined,auth)).json()).job,null,'Claim impede processamento duplicado');
  assert.equal((await call('/internal/video?acao=origem&id='+id,'GET',undefined,auth)).status,409,'Lease exigido');
  const lease={...auth,'X-Video-Lease':job.lease};const origin=await call('/internal/video?acao=origem&id='+id,'GET',undefined,lease);assert.equal((await origin.arrayBuffer()).byteLength,src.length);
  await call('/internal/video?acao=falha&id='+id,'POST',undefined,lease);assert.equal((await (await call('/msg/video-preparar?id='+id)).json()).estado,'erro');
  assert.equal(envios.length,0,'Preparação e erro não enviam mensagens');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'video-roundtrip-')),mediaFile=path.join(folder,'original.mp4');
  require('node:child_process').execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=orange:s=160x240:r=24','-t','4','-c:v','libx264','-threads','2','-y',mediaFile]);
  const real=fs.readFileSync(mediaFile);const postJob=await (await call('/post/video-preparar?inicio=0&duracao=4','POST',real)).json();assert(postJob.ok);
  const next=(await (await call('/internal/video?acao=proximo','POST',undefined,auth)).json()).job;assert.equal(next.id,postJob.id);
  const nextAuth={...auth,'X-Video-Lease':next.lease};const output=await call('/internal/video?acao=resultado&id='+next.id,'POST',real,nextAuth);assert.equal(output.status,200);assert((await output.json()).ok);
  const download=await call('/post/video-preparar?arquivo=1&id='+next.id);assert.equal(download.status,200);assert.equal(Buffer.from(await download.arrayBuffer()).compare(real),0);assert.equal(download.headers.get('Cache-Control'),'no-store');
  fs.rmSync(folder,{recursive:true,force:true});assert.equal(envios.length,0,'Resultado pronto não publica nem envia');
  const met=await call('/msg/metricas?canal=todos');assert.equal(met.status,200);const data=await met.json();assert.equal(data.cobertura.parcial,false);
  const when=new Date(Date.now()-600000).toISOString();
  sqlite.prepare("INSERT INTO msg_conversa(canal,contato,grupo,total) VALUES('instagram','metrica-isolada',0,1)").run();
  const metricId=Number(sqlite.prepare("SELECT id FROM msg_conversa WHERE contato='metrica-isolada'").get().id);
  sqlite.prepare("INSERT INTO msg_mensagem(conversa_id,canal,ext_id,direcao,enviada_em) VALUES(?,'instagram','metrica-entrada','entrada',?)").run(metricId,when);
  sqlite.prepare("INSERT INTO msg_encerramento(conversa_id,canal,motivo,em) VALUES(?,'instagram','concluido',?)").run(metricId,new Date().toISOString());
  const meaning=await (await call('/msg/metricas?canal=instagram')).json();assert.equal(meaning.perguntasRespondidas,0);assert.equal(meaning.medianaMin,null);assert.equal(meaning.resolvidosSemResposta,1);
  sqlite.prepare("WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<30001) INSERT INTO msg_mensagem(conversa_id,canal,ext_id,direcao,enviada_em) SELECT ?,'whatsapp1','amostra-'||n,'entrada',? FROM seq").run(conv,new Date().toISOString());
  const capped=await (await call('/msg/metricas?canal=todos')).json();assert.equal(capped.cobertura.parcial,true,'Limite de consulta precisa ser visível');
  const prepareOriginal=DB.prepare;let leiturasHistorico=0;
  DB.prepare=function(sql){if(sql.startsWith('SELECT m.conversa_id'))leiturasHistorico++;return prepareOriginal.call(DB,sql);};
  sqlite.prepare("INSERT INTO msg_conversa(canal,contato,grupo,total,ult_dir,ult_entrada_em) VALUES('instagram','fila-nova',0,1,'entrada',?)").run(new Date().toISOString());
  const live=await (await call('/msg/metricas?canal=todos&cache=1')).json();assert.equal(leiturasHistorico,0,'Reconciliação ao vivo não pode reler 30 mil mensagens');assert.equal(live.aguardando.total,capped.aguardando.total+1,'Fila permanece atual mesmo com indicadores em cache');
  console.log('OK: ACL/isolamento, OIDC assinado e claims, lease, recuperação, sem envio e métricas Todos.');
})().catch(e=>{console.error(e);process.exitCode=1;});
