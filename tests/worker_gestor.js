/* Partes: D1 real, R2 e provedor simulados. Nada é enviado a serviços reais. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-gestor-teste.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '../instagram-worker/worker.js')) + '\nexport {videoClaims_,videoUsuario_,videoRunner_,autorizarVideoRunner_};export function simularAvanco_(f){avancarPostagem=f;}');
  const W = await import(tmp);
  const expediente={semana:{0:[],1:[[480,720],[780,1080]],2:[[480,720],[780,1080]],3:[[480,720],[780,1080]],4:[[480,720],[780,1080]],5:[[480,720],[780,1080]],6:[[480,720]]},excecoes:{'2026-11-02':[]}};
  const util=W.calendarioGestor_(Date.parse('2026-10-30T00:00:00Z'),Date.parse('2026-11-04T00:00:00Z'),expediente,[]);
  assert.equal(util(Date.parse('2026-10-30T20:30:00Z'),Date.parse('2026-11-03T11:30:00Z')),300,'Noite, sábado, domingo e exceção sem contar como atraso');
  assert.equal(util(Date.parse('2026-10-30T14:30:00Z'),Date.parse('2026-10-30T16:30:00Z')),60,'Intervalo de almoço excluído');
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
  const realDate=Date;const now=Date.parse('2026-10-31T15:00:00Z');global.Date=class extends realDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  const criar=(nome,dono='',donoId='',grupo=0)=>Number(sqlite.prepare("INSERT INTO msg_conversa(canal,contato,nome,grupo,total,criado_em,ult_dir,encerrada_em,dono,dono_id,atendido_em) VALUES('whatsapp1',?,?,?,1,'2026-10-31T10:30:00Z','saida','',?,?,'2026-10-31T10:35:00Z')").run('5588999'+String(Math.random()).slice(2,9),nome,grupo,dono,donoId).lastInsertRowid);
  const a=criar('Cliente A','Ana','5588999999999'),b=criar('Cliente B','Bia',''),c=criar('Cliente C'),pend=criar('Cliente aguardando'),grupo=criar('Grupo excluído','','',1);
  let id=0;const msg=(cid,direcao,em,autor='',status='enviada',por='1234',automatica=0)=>sqlite.prepare("INSERT INTO msg_mensagem(conversa_id,canal,ext_id,direcao,enviada_em,status,atendente_id,por,automatica) VALUES(?,'whatsapp1',?,?,?, ?,?,?,?)").run(cid,'teste-'+(++id),direcao,'2026-10-31T'+em+':00Z',status,autor,por,automatica);
  msg(a,'entrada','11:00');msg(a,'entrada','11:02');msg(a,'saida','11:03','','enviada','auto',1);msg(a,'saida','11:05','5588999999999');msg(a,'entrada','11:10');msg(a,'saida','11:11','5588999999999','incerta');msg(a,'saida','11:18','5588999999999');
  msg(b,'entrada','11:00');msg(b,'saida','11:15');
  msg(c,'entrada','11:00');msg(c,'saida','11:30');sqlite.prepare("INSERT INTO msg_encerramento(conversa_id,canal,motivo,em) VALUES(?,'whatsapp1','engano','2026-10-31T11:31:00Z')").run(c);sqlite.prepare("UPDATE msg_conversa SET encerrada_em='2026-10-31T11:31:00Z' WHERE id=?").run(c);
  msg(pend,'entrada','14:30');msg(pend,'entrada','14:55');msg(pend,'saida','14:56','','enviada','auto',1);sqlite.prepare("UPDATE msg_conversa SET ult_dir='saida',ult_entrada_em='2026-10-31T14:55:00Z',dono='',dono_id='' WHERE id=?").run(pend);
  msg(grupo,'entrada','11:00');msg(grupo,'saida','11:59');
  const snap=await chamar('/msg/gestor?dias=1&tempo=util');assert.equal(snap.status,200,JSON.stringify(snap));const d=snap.j;if(process.env.TK_GESTOR_FIXTURE)fs.writeFileSync(process.env.TK_GESTOR_FIXTURE,JSON.stringify(d));
  assert.equal(d.agora.esperandoLoja,1);assert.equal(d.agora.vencidas,1);assert.equal(d.fila.find(x=>x.id===pend).minutos,30,'Primeira entrada sem resposta, não a última mensagem');
  assert.equal(d.historico.resposta.amostra,3);assert.equal(d.historico.resposta.medianaMin,8);assert.equal(d.historico.resposta.p90Min,15);
  assert.equal(d.historico.primeiraResposta.amostra,2);assert.equal(d.historico.primeiraResposta.medianaMin,10);
  assert.equal(d.historico.meta.dentro,2);assert.equal(d.historico.meta.total,3);assert.equal(d.historico.encerramentos.engano,1);
  assert.equal(d.historico.porPessoa.length,1);assert.equal(d.historico.porPessoa[0].usuario,'5588999999999');assert.equal(d.equipe.find(x=>x.usuario==='legado:Bia').legado,true);
  assert(!d.fila.some(x=>x.id===grupo));assert(!JSON.stringify(d).includes('texto'),'Sem texto das conversas ou rascunhos no endpoint');
  assert.equal((await chamar('/msg/gestor?dias=999')).status,400);assert.equal((await chamar('/msg/gestor?canal=inventado')).status,400);
  const acl=await chamar('/msg/acessos?tipo=pessoa&alvo=88999999999');assert.equal(acl.j.alvo,'558899999999','Alvo normalizado pelo servidor, igual ao cadastro de direitos');
  const cfg=await chamar('/msg/gestor/config');assert.equal(cfg.j.config.versao,0);
  const metros={whatsapp1:20,whatsapp2:15,instagram:30};assert.equal((await chamar('/msg/gestor/config','POST',{versao:0,metas:metros})).status,200);
  assert.equal((await chamar('/msg/gestor/config','POST',{versao:0,metas:metros})).status,409,'Versão antiga não sobrescreve outra sessão');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_gestor_log').get().n,1);
  assert.equal((await chamar('/msg/gestor/config','POST',{versao:1,metas:{...metros,instagram:0}})).status,400);
  // ACL: permissão delegada de métricas/configuração não concede a área Admin total.
  const oldFetch=global.fetch;global.fetch=async(u,opt)=>String(u)==='https://backend.test'?Response.json({ok:true,usuario:{nome:'Equipe',permissoes:['catalogo_admin','painel_simples']}}):oldFetch(u,opt);kv.clear();
  const ordinary=await W.default.fetch(new Request('https://worker.test/msg/gestor',{headers:{'X-TK-Whats':'5588777777777','X-TK-Sessao':'tk3.ordinary'}}),env,{});assert.equal(ordinary.status,403);
  const ordinarySave=await W.default.fetch(new Request('https://worker.test/msg/gestor/config',{method:'POST',headers:{'X-TK-Whats':'5588777777777','X-TK-Sessao':'tk3.ordinary'},body:JSON.stringify({versao:1,metas:metros})}),env,{});assert.equal(ordinarySave.status,403);
  const noAuth=await W.default.fetch(new Request('https://worker.test/msg/gestor'),env,{});assert.equal(noAuth.status,401);
  global.fetch=oldFetch;global.Date=realDate;
  console.log('OK: gestor Admin total, fila real, autoria sem adivinhação, tempos úteis, primeira espera, automações, incerteza, metas e conflito de sessão.');
})().catch(e=>{console.error(e);process.exitCode=1;});
