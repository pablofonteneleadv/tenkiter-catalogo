/* Partes: D1 real, R2 e provedor simulados. Nada é enviado a serviços reais. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-video-partes.mjs');
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

  assert.deepEqual(W.planoPartes(75).map(p=>p.duracao),[30,30,15]);assert.deepEqual(W.planoPartes(59).map(p=>p.duracao),[30,29]);assert.deepEqual(W.planoPartes(61).map(p=>p.duracao),[30,28,3]);
  const create=(seconds,name)=>{const f=path.join(folder,name+'.mp4');require('node:child_process').execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=orange:s=160x240:r=24','-t',String(seconds),'-c:v','libx264','-threads','2','-y',f]);return fs.readFileSync(f)};
  const full=create(75,'75'),thirty=create(30,'30'),fifteen=create(15,'15');
  const route='/post/video-preparar?partes=1';const prep=await(await call(route+'&inicio=30&duracao=75','POST',full)).json();assert(prep.ok,JSON.stringify(prep));
  const work=(await(await call('/internal/video?acao=proximo','POST',undefined,auth)).json()).job;assert.equal(work.id,prep.id);assert.deepEqual(work.partes.map(p=>p.duracao),[30,30,15]);
  const identity={...auth,'X-Video-Lease':work.lease};
  assert.equal((await call('/internal/video?acao=resultado&id='+prep.id+'&parte=1','POST',real,identity)).status,415,'Saída de duração errada recusada');
  const posts=[];const future=new Date(Date.now()+3600000).toISOString();
  for(let i=1;i<=3;i++){
    const bytes=i===3?fifteen:thirty;const r=await call('/internal/video?acao=resultado&id='+prep.id+'&parte='+i,'POST',bytes,identity);assert.equal(r.status,200);assert((await r.json()).ok);
    const status=await(await call(route+'&id='+prep.id)).json();assert.equal(status.estado,i===3?'pronto':'processando');
    const key='202610/'+String(i).padStart(20,'0')+'.mp4';await env.MIDIA.put(key,bytes);
    posts.push({tipo:'story',canal:'whatsapp',quando:future,midias:[{url:'https://midia.test/m/'+key,tipo:'video'}],serie:{preparo:prep.id,ordem:i,total:3}});
  }
  assert.equal((await W.videoUsuario_(env,new Request('https://worker.test'+route+'&id='+prep.id,{headers:outro}),new URL('https://worker.test'+route+'&id='+prep.id),J)).status,404,'Outros usuários não recuperam partes');
  assert.equal((await chamar('/post','POST',{posts:posts.slice(0,2)})).status,400,'Não cadastrar sequência incompleta');
  assert.equal((await chamar('/post','POST',{posts:[posts[1],posts[0],posts[2]]})).status,400,'Não cadastrar partes fora de ordem');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM postagem').get().n,0,'Falha não deixa meia sequência');
  const forged=JSON.parse(JSON.stringify(posts));forged[2].midias[0].url=posts[0].midias[0].url;assert.equal((await chamar('/post','POST',{posts:forged})).status,400,'Hashes impedem usar outra mídia para obter exceção');
  const accepted=await chamar('/post','POST',{posts});assert.equal(accepted.status,200,JSON.stringify(accepted));assert.equal(new Set(accepted.j.quandos).size,1,'Partes compartilham agendamento inicial');
  const rows=sqlite.prepare('SELECT * FROM postagem ORDER BY id').all();assert.deepEqual(rows.map(r=>r.parte),[1,2,3]);assert.equal(new Set(rows.map(r=>r.serie)).size,1);
  const calls=[];let pending=true;
  W.simularAvanco_(async(e,t,p)=>{calls.push(p.id);if(p.parte===1&&pending)await DB.prepare("UPDATE postagem SET status='processando' WHERE id=?").bind(p.id).run();else await DB.prepare("UPDATE postagem SET status='publicado',publicado_em=? WHERE id=?").bind(new Date().toISOString(),p.id).run();});
  await chamar('/post/config','POST',{config:{pausaAtiva:false}});
  await W.processarPostagens(env);assert.equal(calls.length,0,'Nada sai antes do agendamento');
  sqlite.prepare("UPDATE postagem SET agendado_em=?").run(new Date(Date.now()-1000).toISOString());
  await W.processarPostagens(env);assert.deepEqual(calls,[rows[0].id],'Sem confirmação, partes 2 e 3 não são enviadas');
  pending=false;await W.processarPostagens(env);assert.deepEqual(calls,[rows[0].id,rows[0].id,rows[1].id,rows[2].id],'Após confirmação, partes seguintes iniciam na mesma execução sem intervalo');
  await W.processarPostagens(env);assert.equal(calls.length,4,'Cron posterior não repete partes confirmadas');
  // Desligar a exceção mantém ordem, mas aplica o intervalo normal.
  sqlite.prepare("UPDATE postagem SET status='agendado',publicado_em='' WHERE parte>1").run();calls.length=0;
  await chamar('/post/config','POST',{config:{pausaAtiva:false,partesRapidas:false}});await W.processarPostagens(env);assert.equal(calls.length,0,'Configuração desligada respeita o intervalo');
  sqlite.prepare("UPDATE postagem SET publicado_em=? WHERE parte=1").run(new Date(Date.now()-600000).toISOString());await W.processarPostagens(env);assert.deepEqual(calls,[rows[1].id],'Parte seguinte aguarda seu próprio intervalo');
  await chamar('/post/config','POST',{config:{pausaAtiva:false,partesRapidas:true}});await W.processarPostagens(env);assert.equal(calls.at(-1),rows[2].id);
  // Postagem independente depois da sequência não herda a exceção.
  const ordinary=sqlite.prepare("INSERT INTO postagem(tipo,modo,midias,agendado_em,status,canal) VALUES('story','auto','[]',?,'agendado','whatsapp')").run(new Date(Date.now()-1000).toISOString());calls.length=0;
  await W.processarPostagens(env);assert.equal(calls.length,0,'Intervalo normal volta após a sequência');assert(Date.parse(sqlite.prepare('SELECT agendado_em FROM postagem WHERE id=?').get(Number(ordinary.lastInsertRowid)).agendado_em)>Date.now());
  sqlite.prepare("UPDATE postagem SET status='agendado',publicado_em='' WHERE parte>1").run();sqlite.prepare("UPDATE postagem SET status='erro' WHERE parte=2").run();calls.length=0;
  await W.processarPostagens(env);assert.equal(calls.length,0,'Erro na parte anterior bloqueia a seguinte');
  const cancel=await chamar('/post/cancelar','POST',{id:rows[1].id});assert.equal(cancel.status,200);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM postagem WHERE status='cancelado'").get().n,2,'Descartar cancela partes restantes, preservando a publicada');
  const unknown=await(await call(route+'&inicio=30&duracao=0','POST',full)).json();assert(unknown.ok);
  const probeJob=(await(await call('/internal/video?acao=proximo','POST',undefined,auth)).json()).job;assert.equal(probeJob.id,unknown.id);assert.equal(probeJob.partes,null);
  const probeAuth={...auth,'X-Video-Lease':probeJob.lease};
  const defined=await(await call('/internal/video?acao=plano&id='+unknown.id,'POST',JSON.stringify({duracao:75}),probeAuth)).json();assert.deepEqual(defined.partes.map(p=>p.duracao),[30,30,15],'Servidor define plano quando o navegador não lê a duração');
  fs.rmSync(folder,{recursive:true,force:true});
  console.log('OK: partes integrais, hashes, dono, cadastro atômico, agendamento, confirmação, ordem, erro e cancelamento.');
})().catch(e=>{console.error(e);process.exitCode=1;});
