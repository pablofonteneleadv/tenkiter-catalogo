/* Partes: D1 real, R2 e provedor simulados. Nada é enviado a serviços reais. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-fila-originais.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '../instagram-worker/worker.js')) + '\nexport {videoClaims_,videoUsuario_,videoRunner_,autorizarVideoRunner_};export function simularAvanco_(f){avancarPostagem=f;}');
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
  await chamar('/post/config','POST',{config:{pausaAtiva:false,partesRapidas:true}});
  const posts=Array.from({length:3},(_,i)=>({tipo:'story',canal:'ambos',modo:'manual',link:'https://tenkitermodas.com.br/',quando:'sequencia',origemMidia:'forjada',midias:[{url:'https://midia.test/foto-'+i+'.jpg',tipo:'imagem'}]}));
  const created=await chamar('/post','POST',{posts,intervalo:20});assert.equal(created.status,200,JSON.stringify(created));
  const createdRows=sqlite.prepare('SELECT * FROM postagem ORDER BY id').all();assert.equal(createdRows.length,6);
  for(let i=0;i<3;i++){const a=createdRows[2*i],b=createdRows[2*i+1];assert.equal(a.origem_midia,b.origem_midia,'Mesma mídia ligada aos dois destinos');assert.notEqual(a.origem_midia,'forjada');assert.equal(a.intervalo_ms,1200000);assert.equal(b.intervalo_ms,1200000);}
  assert.equal(new Set(createdRows.map(x=>x.origem_midia)).size,3);
  const listed=(await chamar('/posts?limite=250')).j.posts;assert.equal(listed[0].origemMidia,createdRows[0].origem_midia);assert.equal(listed[0].intervaloMs,1200000);
  sqlite.prepare('DELETE FROM postagem').run();
  // Cada original deve compartilhar o horário mesmo com filas e mínimos diferentes.
  env.WAFLY_GRUPO_CLIENTES=JSON.stringify({instance:'teste',token:'teste',clientToken:'teste',phone:'123-group'});
  await DB.prepare("INSERT OR REPLACE INTO cfg(chave,valor) VALUES('wafly_2',?)").bind(JSON.stringify({instance:'teste-simulado',token:'teste-simulado',clientToken:'teste-simulado'})).run();
  await chamar('/post/config','POST',{config:{canais:{story:{gapMin:900,gapMax:900},status:{gapMin:900,gapMax:900},grupo:{gapMin:120,gapMax:120},status2:{gapMin:120,gapMax:120}}}});
  const ocupado=new Date(Date.now()+60000).toISOString();
  sqlite.prepare("INSERT INTO postagem(tipo,modo,midias,agendado_em,status,canal) VALUES('story','auto','[]',?,'agendado','whatsapp')").run(ocupado);
  const lote=posts.map(p=>({...p,grupoClientes:true,status2:true}));
  const juntos=await chamar('/post','POST',{posts:lote,intervalo:20});assert.equal(juntos.status,200,JSON.stringify(juntos));
  const linhas=sqlite.prepare("SELECT * FROM postagem WHERE origem_midia<>'' ORDER BY id").all();
  assert.equal(linhas.length,12);
  assert(Date.parse(linhas[0].agendado_em)>=Date.parse(ocupado)+900000,'A fila ocupada do Status 1 também adia Grupo 1 e Status 2');
  for(let i=0;i<3;i++){
    const destinos=linhas.slice(i*4,i*4+4);
    assert.equal(new Set(destinos.map(p=>p.agendado_em)).size,1,'Story, Grupo 1 e dois Status no mesmo horário');
    assert.equal(new Set(destinos.map(p=>p.intervalo_ms)).size,1,'Intervalo editorial único por original');
    if(i)assert(Date.parse(destinos[0].agendado_em)-Date.parse(linhas[(i-1)*4].agendado_em)>=1200000);
  }
  // Reagendar um destino precisa mover a origem inteira, sem se bloquear nos próprios irmãos.
  const alvo=linhas[0],origem=alvo.origem_midia,novo=new Date(Date.now()+48*3600000).toISOString();
  let horario=await chamar('/post/reagendar','POST',{id:alvo.id,quando:novo});
  assert.equal(horario.status,200,JSON.stringify(horario));
  assert.equal(new Set(sqlite.prepare('SELECT agendado_em FROM postagem WHERE origem_midia=?').all(origem).map(x=>x.agendado_em)).size,1);
  assert.equal(horario.j.quando,novo);
  const repetido=await chamar('/post/reagendar','POST',{id:linhas[1].id,quando:novo});
  assert.equal(repetido.j.quando,novo,'Clientes antigos repetindo por destino não adiam os próprios irmãos');
  const conflito=await chamar('/post/reagendar','POST',{id:alvo.id,quando:linhas[4].agendado_em});
  assert.equal(conflito.status,200);assert.notEqual(conflito.j.quando,linhas[4].agendado_em);
  assert.equal(new Set(sqlite.prepare('SELECT agendado_em FROM postagem WHERE origem_midia=?').all(origem).map(x=>x.agendado_em)).size,1,'Conflito de um canal ajusta todos juntos');
  sqlite.prepare("UPDATE postagem SET status='publicado',publicado_em=? WHERE id=?").run(novo,linhas[0].id);
  const parcial=await chamar('/post/reagendar','POST',{id:linhas[1].id,quando:novo});assert.equal(parcial.status,200);
  assert.equal(sqlite.prepare('SELECT status,publicado_em FROM postagem WHERE id=?').get(linhas[0].id).publicado_em,novo,'Destino publicado preservado');
  sqlite.prepare("UPDATE postagem SET ig_id='zapq:incerto' WHERE id=?").run(linhas[2].id);
  const antesIncerto=sqlite.prepare('SELECT id,status,agendado_em FROM postagem WHERE origem_midia=? ORDER BY id').all(origem);
  assert.equal((await chamar('/post/reagendar','POST',{id:linhas[1].id,quando:novo})).status,409);
  assert.deepEqual(sqlite.prepare('SELECT id,status,agendado_em FROM postagem WHERE origem_midia=? ORDER BY id').all(origem),antesIncerto,'Recibo incerto impede alteração de todos');
  sqlite.prepare("UPDATE postagem SET ig_id='' WHERE id=?").run(linhas[2].id);
  const batchOriginal=DB.batch;
  DB.batch=async xs=>{sqlite.prepare("UPDATE postagem SET status='processando' WHERE id=?").run(linhas[2].id);return batchOriginal(xs);};
  const race=await chamar('/post/reagendar','POST',{id:linhas[1].id,quando:new Date(Date.now()+72*3600000).toISOString()});
  DB.batch=batchOriginal;assert.equal(race.status,409);
  assert.equal(sqlite.prepare('SELECT agendado_em FROM postagem WHERE id=?').get(linhas[1].id).agendado_em,antesIncerto[1].agendado_em,'Concorrência não deixa um destino movido sozinho');
  sqlite.prepare('DELETE FROM postagem').run();
  // Recuperação planejada: pendentes de mídia já iniciada antes de originais ainda não iniciados.
  const inserir=(o,c,status,t)=>Number(sqlite.prepare("INSERT INTO postagem(tipo,modo,midias,agendado_em,status,canal,origem_midia,intervalo_ms) VALUES('story','auto','[]',?,?,?,?,1200000)").run(t,status,c,o).lastInsertRowid);
  const cedo=new Date(Date.now()+3600000).toISOString(),tarde=new Date(Date.now()+4*3600000).toISOString();
  inserir('inteira','instagram','agendado',cedo);inserir('inteira','whatsapp2','agendado',tarde);
  const publicado=inserir('parcial','instagram','publicado',cedo);inserir('parcial','whatsapp2','agendado',tarde);inserir('parcial','grupo','agendado',cedo);
  const incerto=inserir('incerto','whatsapp2','agendado',tarde);sqlite.prepare("UPDATE postagem SET ig_id='zapq:aceito' WHERE id=?").run(incerto);
  const antesPlano=sqlite.prepare('SELECT * FROM postagem ORDER BY id').all();
  const sim=await chamar('/post/reorganizar','POST',{simular:true,priorizarPendentes:true});assert.equal(sim.status,200,JSON.stringify(sim));
  assert.deepEqual(sqlite.prepare('SELECT * FROM postagem ORDER BY id').all(),antesPlano,'Simulação não escreve');
  const aplicado=await chamar('/post/reorganizar','POST',{priorizarPendentes:true});assert.equal(aplicado.status,200,JSON.stringify(aplicado));
  const par=sqlite.prepare("SELECT agendado_em FROM postagem WHERE origem_midia='parcial' AND status='agendado'").all(),inteira=sqlite.prepare("SELECT agendado_em FROM postagem WHERE origem_midia='inteira'").all();
  assert.equal(new Set(par.map(x=>x.agendado_em)).size,1);assert.equal(new Set(inteira.map(x=>x.agendado_em)).size,1);
  assert(par[0].agendado_em<inteira[0].agendado_em,'Pendentes vêm antes da mídia que falta tudo');
  assert.equal(sqlite.prepare('SELECT status FROM postagem WHERE id=?').get(publicado).status,'publicado');
  assert.equal(sqlite.prepare('SELECT agendado_em FROM postagem WHERE id=?').get(incerto).agendado_em,tarde);
  assert(sqlite.prepare('SELECT valor FROM cfg WHERE chave=?').get(aplicado.j.backup),'Backup privado recuperável antes da escrita');
  sqlite.prepare('DELETE FROM postagem').run();
  const legado1=inserir('','instagram','agendado',cedo),legado2=inserir('','whatsapp2','agendado',tarde);
  sqlite.prepare("UPDATE postagem SET criado_em='2026-11-05T12:01:00Z',midias=? WHERE id IN (?,?)").run(JSON.stringify([{url:'https://midia.test/legado.jpg',tipo:'imagem'}]),legado1,legado2);
  const legacy=await chamar('/post/reagendar','POST',{id:legado1,quando:novo});assert.equal(legacy.status,200,JSON.stringify(legacy));
  assert.equal(sqlite.prepare('SELECT agendado_em FROM postagem WHERE id=?').get(legado1).agendado_em,sqlite.prepare('SELECT agendado_em FROM postagem WHERE id=?').get(legado2).agendado_em,'Mídia antiga sem origem também alinha os canais');
  sqlite.prepare('DELETE FROM postagem').run();
  const RealDate=Date;let time=RealDate.now();global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}};
  const seed=(serie,origem,part,interval=1200000)=>Number(sqlite.prepare("INSERT INTO postagem(tipo,modo,midias,agendado_em,status,canal,serie,parte,partes,origem_midia,intervalo_ms) VALUES('story','auto',?,?,'agendado','whatsapp',?, ?,2,?,?)").run(JSON.stringify([{url:'https://midia.test/video.mp4',tipo:'video'}]),new Date(time-3600000).toISOString(),serie,part,origem,part===1?interval:0).lastInsertRowid);
  const ids=[];for(const o of ['A','B','C'])for(const part of [1,2])ids.push(seed('serie-'+o,'original-'+o,part));
  const calls=[];W.simularAvanco_(async(e,t,p)=>{calls.push({id:p.id,em:Date.now()});await DB.prepare("UPDATE postagem SET status='publicado',publicado_em=? WHERE id=?").bind(new Date().toISOString(),p.id).run();});
  await W.processarPostagens(env);assert.deepEqual(calls.map(x=>x.id),ids.slice(0,2),'Duas partes do primeiro original imediatamente; os outros aguardam');
  assert.equal(calls[0].em,calls[1].em);
  time+=19*60000;await W.processarPostagens(env);assert.equal(calls.length,2,'Intervalo escolhido não é reduzido ao mínimo do canal');
  time+=60000;await W.processarPostagens(env);assert.deepEqual(calls.map(x=>x.id),ids.slice(0,4));assert.equal(calls[2].em,calls[3].em);
  time+=20*60000;await W.processarPostagens(env);assert.deepEqual(calls.map(x=>x.id),ids);assert.equal(calls[4].em,calls[5].em);
  await W.processarPostagens(env);assert.equal(calls.length,6,'Confirmadas não são repetidas');
  // Alterar o horário do original movimenta as partes juntas; nunca repete uma já publicada.
  assert.equal((await chamar('/post/reagendar','POST',{id:ids[0],quando:new Date(time+3600000).toISOString()})).status,409);
  const d1=seed('serie-D','original-D',1),d2=seed('serie-D','original-D',2);
  const future=new Date(time+7200000).toISOString();const moved=await chamar('/post/reagendar','POST',{id:d1,quando:future});assert.equal(moved.status,200,JSON.stringify(moved));assert.equal(moved.j.partes,2);
  const ds=sqlite.prepare('SELECT * FROM postagem WHERE serie=? ORDER BY parte').all('serie-D');assert.equal(ds[0].agendado_em,ds[1].agendado_em);assert.equal(ds[0].agendado_em,future);
  assert.equal((await chamar('/post/proximo','POST',{id:d1})).status,200,'Próximo livre vale para o vídeo completo');
  sqlite.prepare("INSERT INTO postagem_grupo_recibo(postagem_id,ordem,estado) VALUES(?,1,'enviando')").run(d1);
  assert.equal((await chamar('/post/reagendar','POST',{id:d1,quando:future})).status,409,'Envio incerto não é reiniciado');
  sqlite.prepare('DELETE FROM postagem_grupo_recibo WHERE postagem_id=?').run(d1);
  sqlite.prepare("UPDATE postagem SET status='processando' WHERE id=?").run(d1);
  assert.equal((await chamar('/post/proximo','POST',{id:d1})).status,409,'Sequência iniciada não se move parcialmente');
  global.Date=RealDate;
  console.log('OK: três originais, seis partes, intervalo completo entre originais, origens entre canais, reagendamento comum (incluindo legado), prioridade de pendentes, concorrência atômica e envio incerto preservado.');
})().catch(e=>{console.error(e);process.exitCode=1;});
