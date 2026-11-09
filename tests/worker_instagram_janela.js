/* v7.69 — Instagram: janela real (24 h padrão, 7 dias com HUMAN_AGENT) e Acompanhar/Agendar. D1 SQLite real e serviços simulados; nenhum envio para destinatários reais. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {DatabaseSync}=require('node:sqlite');
const sqlite=new DatabaseSync(':memory:');let falhar=false;
const DB={prepare(sql){let args=[];const st={bind(...x){args=x;return st},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return st._run()},_run(){if(falhar&&!/^SELECT|^PRAGMA/.test(sql))throw Error('falha simulada');const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};return st},async batch(xs){sqlite.exec('BEGIN');try{const r=xs.map(x=>x._run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
(async()=>{
const tmp=path.join(os.tmpdir(),'tk-ig-janela.mjs');fs.writeFileSync(tmp,fs.readFileSync(path.join(__dirname,'../instagram-worker/worker.js'))+'\nexport {alterarAcompanhamento_};');const W=await import(tmp);
const cache=new Map(),kv=new Map();global.caches={default:{async match(r){return cache.has(r.url)?Response.json(cache.get(r.url)):undefined},async put(r,v){cache.set(r.url,await v.json())}}};
let envios=[],aoRecusar=null,modoZ='padrao',pode=true;
global.fetch=async(u,opt)=>{u=String(u);
 if(u==='https://backend.test')return Response.json({ok:true,sessao:'tk3.5588999999999.'+Math.floor(Date.now()/1000+30*86400)+'.renovada-simulada',usuario:{nome:'Ana Teste',permissoes:pode?['gerir_acessos']:[]}});
 if(/\/send-(text|image)$/.test(u)){envios.push({via:'wafly',...JSON.parse(opt.body)});return Response.json({messageId:'w-'+envios.length});}
 if(/\/inbox\/conversations\/.+\/messages$/.test(u)){const b=JSON.parse(opt.body);envios.push({via:'zernio',...b});
   const cv=sqlite.prepare('SELECT ult_entrada_em FROM msg_conversa WHERE id=?').get(Number((u.match(/zc-(\d+)/)||[])[1]));const fora=cv&&Date.now()-Date.parse(cv.ult_entrada_em)>=24*3600000;
   if(!b.messageTag&&fora)return Response.json({error:'Message sent outside of allowed window (24 hours)'},{status:400});
   if(b.messageTag&&modoZ==='sete')return Response.json({error:'Outside 7 days window'},{status:400});
   return Response.json({data:{messageId:'z-'+envios.length}});}
 if(/\/me\/messages$/.test(u)){const b=JSON.parse(opt.body);envios.push({via:'graph',...b});const cv=sqlite.prepare('SELECT ult_entrada_em FROM msg_conversa WHERE contato=?').get(b.recipient.id);const fora=Date.now()-Date.parse(cv.ult_entrada_em)>=24*3600000;
   if(!b.tag&&fora)return Response.json({error:{code:10,message:'This message is sent outside of allowed window.'}},{status:400});return Response.json({message_id:'g-'+envios.length});}
 throw Error('Serviço não simulado: '+u);};
const CACHE={async get(k){return kv.get(k)||null},async put(k,v){kv.set(k,String(v))},async delete(k){kv.delete(k)}};
const env={DB,CACHE,MIDIA:require('./helpers/r2_condicional')(),API_URL:'https://backend.test',MIDIA_URL:'https://midia.test'};
const headers={'X-TK-Whats':'5588999999999','X-TK-Sessao':'tk3.teste'},req=new Request('https://worker.test',{headers});
await W.default.fetch(new Request('https://worker.test/msg/config',{headers}),env,{});
sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run('zernio_chave','chave-simulada');
sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run('zernio_conta',JSON.stringify({id:'conta-simulada'}));
sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run('wafly_1',JSON.stringify({instance:'teste-01',token:'simulado',clientToken:'simulado'}));
const RealDate=Date;let clock=Date.parse('2026-11-02T12:00:00Z');global.Date=class extends RealDate{constructor(...xs){super(...(xs.length?xs:[clock]))}static now(){return clock}};
const H=3600000,iso=ms=>new RealDate(ms).toISOString();let seq=100;
const criar=(canal,contato,pessoa,entradaHaH)=>{const id=++seq;sqlite.prepare("INSERT INTO msg_conversa(id,canal,contato,nome,pessoa,total,ult_entrada_em,ult_dir) VALUES(?,?,?,?,?,1,?,'entrada')").run(id,canal,contato,'Cliente simulado',pessoa,iso(clock-entradaHaH*H));
  if(canal==='instagram')sqlite.prepare('INSERT OR REPLACE INTO msg_zernio_conv(contato,conversa,em) VALUES(?,?,?)').run(contato,'zc-'+id,iso(clock));return id;};
const ligar=(id,k)=>W.alterarAcompanhamento_(env,req,{conversa:id,ligado:true,idLocal:k});
const estado=id=>sqlite.prepare('SELECT encerrada_em,encerrada_motivo FROM msg_conversa WHERE id=?').get(id);
const rodar=async(quando)=>{clock=Math.max(clock,Date.parse(quando));return W.processarAgenda_(env,clock);};
async function ciclo(id,irmaos,rotulo){
  const a=await ligar(id,'acompanhar-'+rotulo);assert(a.ok,rotulo+': '+(a.erro||''));
  const antes=envios.length;let r=await rodar(a.acompanhamento.quando);if(process.env.DBG)console.log(JSON.stringify(r),JSON.stringify(sqlite.prepare('SELECT id,status,erro,tipo FROM msg_agenda').all()),JSON.stringify(envios));assert.equal(r.enviadas,1,rotulo+': lembrete enviado');
  const plano=sqlite.prepare('SELECT * FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id);assert.equal(plano.etapa,'encerrar',rotulo+': armou o encerramento');
  await rodar(plano.quando);
  assert.equal(sqlite.prepare('SELECT status FROM msg_acompanhamento WHERE id=?').get(plano.id).status,'concluida',rotulo+': concluiu');
  for(const c of [id,...irmaos]){assert.equal(estado(c).encerrada_motivo,'sem_resposta',rotulo+': todos os canais encerram');}
  const evs=sqlite.prepare('SELECT conversa_id,motivo,em FROM msg_encerramento WHERE conversa_id IN ('+[id,...irmaos].join(',')+')').all();
  assert.equal(evs.length,1+irmaos.length);assert.equal(new Set(evs.map(x=>x.em)).size,1,rotulo+': mesmo instante');
  const cfgP=(await (await W.default.fetch(new Request('https://worker.test/msg/gestor/prioridade',{headers}),env,{})).json()).config;
  assert.equal(W.pontuarCliente_(W.episodiosCliente_(evs),cfgP,clock).pontos,47,rotulo+': cliente com vários canais conta uma vez');
  return envios.slice(antes);
}
// 1) Instagram dentro das 24 h (+ WhatsApp irmão): lembrete sem etiqueta, encerra os dois canais, pontua uma vez.
let ig=criar('instagram','17841400000001','cli-a',3),zap=criar('whatsapp1','5588991110001','cli-a',3);
let usados=await ciclo(ig,[zap],'ig-dentro');
assert.equal(usados.length,1);assert.equal(usados[0].via,'zernio');assert(!usados[0].messageTag,'Dentro de 24 h não precisa de etiqueta');assert(/passando aqui/.test(usados[0].message));
// 2) Instagram fora das 24 h, mas dentro de 7 dias: arma, tenta, o servidor pede HUMAN_AGENT e a mensagem sai.
ig=criar('instagram','17841400000002','cli-b',30);
usados=await ciclo(ig,[],'ig-30h');
assert.deepEqual(usados.map(x=>x.messageTag||''),['','HUMAN_AGENT'],'Tenta normal e repete com HUMAN_AGENT');
// 3) Além de 7 dias: aviso claro em português, antes de armar.
ig=criar('instagram','17841400000003','cli-c',8*24);
const longe=await ligar(ig,'acompanhar-ig-8d');assert.equal(longe.cod,400);assert(/7 dias/.test(longe.erro),longe.erro);assert(!/24 horas/.test(longe.erro));
// 4) Agendar: 30 h passa; 8 dias recusa com texto da regra real.
const agendar=async(id,dados)=>{const r=await W.default.fetch(new Request('https://worker.test/msg/agendar',{method:'POST',headers,body:JSON.stringify({conversa:id,quando:iso(clock+2*H),idLocal:'agenda-'+id+'-'+Math.random().toString(36).slice(2,10),...dados})}),env,{});return {status:r.status,j:await r.json()};};
ig=criar('instagram','17841400000004','cli-d',30);
let ag=await agendar(ig,{texto:'Oi, tudo bem?'});assert.equal(ag.status,200,JSON.stringify(ag.j));
let antes=envios.length;await rodar(ag.j.agendada.quando);assert.deepEqual(envios.slice(antes).map(x=>x.messageTag||''),['','HUMAN_AGENT'],'Agendada fora das 24 h sai com HUMAN_AGENT');
ig=criar('instagram','17841400000005','cli-e',8*24);
ag=await agendar(ig,{texto:'Oi?'});assert.equal(ag.status,400);assert(/7 dias/.test(ag.j.erro),ag.j.erro);
// 5) Se o servidor recusar mesmo com HUMAN_AGENT, o erro é claro e o Acompanhar não encerra por engano.
modoZ='sete';ig=criar('instagram','17841400000006','cli-f',30);
const f=await ligar(ig,'acompanhar-ig-recusa');assert(f.ok);await rodar(f.acompanhamento.quando);
const pf=sqlite.prepare('SELECT status,erro FROM msg_acompanhamento WHERE id=?').get(f.acompanhamento.id);assert.equal(pf.status,'falhou');assert(/7 dias/.test(pf.erro),pf.erro);assert.equal(estado(ig).encerrada_em,'');modoZ='padrao';
// 6) WhatsApp: mesmo fluxo, continua funcionando.
const z1=criar('whatsapp1','5588991110002','cli-g',2),z2=criar('whatsapp2','5588991110003','cli-g',2);
usados=await ciclo(z1,[z2],'zap');assert.equal(usados[0].via,'wafly');
// 7) Sem Zernio (Graph direto): fora das 24 h repete com HUMAN_AGENT.
sqlite.prepare("DELETE FROM cfg WHERE chave IN ('zernio_chave','zernio_conta')").run();sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run('ig_token','token-simulado');
ig=criar('instagram','17841400000007','cli-h',30);ag=await agendar(ig,{texto:'Oi, tudo bem?'});assert.equal(ag.status,200);antes=envios.length;await rodar(ag.j.agendada.quando);
assert.deepEqual(envios.slice(antes).map(x=>x.via+':'+(x.tag||'')),['graph:','graph:HUMAN_AGENT']);assert.equal(envios.at(-1).messaging_type,'MESSAGE_TAG');
console.log('OK: Instagram janela real (24 h, 7 dias com HUMAN_AGENT), Agendar e Acompanhar em Instagram e WhatsApp, todos os canais encerrados e pontuação uma vez.');
global.Date=RealDate;
})().catch(e=>{console.error(e);process.exitCode=1;});
