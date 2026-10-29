const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const file=path.join(os.tmpdir(),'tk-mobile-worker.mjs');fs.writeFileSync(file,fs.readFileSync('instagram-worker/worker.js'));
 const W=await import(file),db=new DatabaseSync(':memory:');
 const DB={prepare(sql){let args=[];return {bind(...a){args=a;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}}}};
 DB.batch=async(stmts)=>{db.exec('BEGIN');try{const r=[];for(const st of stmts)r.push(await st.run());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
 const mem=new Map(),CACHE={async get(k,t){const v=mem.get(k);return v&&t==='json'?JSON.parse(v):v||null},async put(k,v){mem.set(k,v)},async delete(k){mem.delete(k)}};
 global.caches={default:{async match(){return null},async put(){}}};
 const env={DB,CACHE,MIDIA:require('./helpers/r2_condicional.js')(),API_URL:'https://backend.test',MOBILE_ONESIGNAL_KEY:'test-provider-key'};let accepted=true,posted=[];
 global.fetch=async(url,opt)=>{if(url==='https://backend.test')return Response.json({ok:accepted,usuario:{permissoes:accepted?['gerir_acessos']:[]}});if(url==='https://api.onesignal.com/notifications'){posted.push(JSON.parse(opt.body));return Response.json({id:'push-id'})}throw Error('unexpected fetch')};
 const id='11111111-1111-4111-8111-111111111111';
 const req=(method,owner='88999990000')=>new Request('https://site.test',{method,headers:{'X-TK-Whats':owner,'X-TK-Sessao':'tk3.test'},body:JSON.stringify({subscription:id})});
 assert.equal((await W.registrarMobile_(env,req('POST'))).servidorConfigurado,true);
 await W.default.fetch(new Request('https://worker.test/wh/wafly/1/errado',{method:'POST',body:'{}'}),env,{});
 db.prepare("INSERT INTO msg_conversa(id,canal,contato,nome,nao_lidas) VALUES(9,'whatsapp1','5588999990000','Maria Cliente',2)").run();
 db.prepare("INSERT INTO msg_mensagem(id,conversa_id,canal,ext_id,direcao,tipo,texto) VALUES(1,9,'whatsapp1','test-notification','entrada','texto','Tem em azul?')").run();
 const insert=()=>db.prepare('INSERT INTO msg_push_outbox(mensagem,conversa,canal,chave,criado) VALUES(?,?,?,?,?)').run(1,9,'whatsapp1','22222222-2222-4222-8222-222222222222',new Date().toISOString());insert();
 let r=await W.processarPushMobile_(env);assert.equal(r.enviadas,1);assert.equal(posted.length,1);assert.deepEqual(posted[0].include_subscription_ids,[id]);assert.equal(posted[0].data.conversa,9);assert(!JSON.stringify(posted).includes('tk3.test'));assert.equal(posted[0].headings.pt,'Maria Cliente · WhatsApp 1');assert.equal(posted[0].contents.pt,'Tem em azul?');assert.equal(posted[0].android_visibility,0);assert.deepEqual(posted[0].buttons.map(x=>x.id),['espiar','abrir']);assert.equal(posted[0].data.modo,'espiar');
 assert.deepEqual(W.previaPushMobile_({nome:'Grupo',canal:'whatsapp2',grupo:1,autor_nome:'Ana',tipo:'vídeo',texto:'Veja aqui'}),{titulo:'Grupo · WhatsApp 2',texto:'Ana: Vídeo · Veja aqui'});
 assert.equal(W.previaPushMobile_({canal:'instagram',tipo:'texto',texto:'a'.repeat(300)}).texto.length,220);
 await W.processarPushMobile_(env);assert.equal(posted.length,1,'fila não reenvia entrega confirmada');
 db.prepare('INSERT INTO msg_push_outbox(mensagem,conversa,canal,chave,criado) VALUES(?,?,?,?,?)').run(99999,9,'whatsapp1','33333333-3333-4333-8333-333333333333',new Date().toISOString());await W.processarPushMobile_(env);assert.equal(posted.length,1,'mensagem apagada não gera aviso com prévia errada');assert.equal(db.prepare('SELECT estado FROM msg_push_outbox WHERE mensagem=99999').get().estado,'expirada');
 // Uma tarefa antiga que termina depois não pode substituir a prévia da mensagem mais recente.
 for(const [mid,text] of [[2,'Mensagem anterior'],[3,'Mensagem mais recente']]){
  db.prepare("INSERT INTO msg_mensagem(id,conversa_id,canal,ext_id,direcao,tipo,texto,enviada_em) VALUES(?,9,'whatsapp1',?,'entrada','texto',?,?)").run(mid,'backlog-'+mid,text,'2026-10-27T00:00:0'+mid+'Z');
  db.prepare('INSERT INTO msg_push_outbox(mensagem,conversa,canal,chave,criado) VALUES(?,?,?,?,?)').run(mid,9,'whatsapp1',mid===2?'44444444-4444-4444-8444-444444444444':'55555555-5555-4555-8555-555555555555',new Date().toISOString());
 }
 const beforeBacklog=posted.length;await W.processarPushMobile_(env,true);assert.equal(posted.length,beforeBacklog+2);assert(posted.slice(-2).every(x=>x.contents.pt==='Mensagem mais recente'));
 db.prepare('DELETE FROM msg_push_outbox WHERE mensagem IN(2,3)').run();db.prepare('DELETE FROM msg_mensagem WHERE id IN(2,3)').run();posted.splice(1);
 db.prepare("UPDATE msg_push_outbox SET estado='pendente' WHERE mensagem=1").run();accepted=false;await W.processarPushMobile_(env);assert.equal(posted.length,1,'permissão revogada não recebe push');
 const refused=await W.registrarMobile_(env,req('DELETE','88000000000'));assert.equal(refused.ok,false);
 await W.registrarMobile_(env,req('DELETE'));assert.equal(db.prepare('SELECT COUNT(*) n FROM msg_mobile').get().n,0);assert.equal(mem.size,0);
 assert.equal((await W.processarPushMobile_({...env,MOBILE_ONESIGNAL_KEY:''})).motivo,'sem_configuracao');
 // Webhook chama o despachante sem esperar pelo cron; duplicado não agenda de novo.
 accepted=true;await W.registrarMobile_(env,req('POST'));db.prepare('DELETE FROM msg_push_outbox').run();const antesWebhook=posted.length;
 await W.default.fetch(new Request('https://worker.test/wh/wafly/1/errado',{method:'POST',body:'{}'}),env,{});
 const segredo=db.prepare("SELECT valor FROM cfg WHERE chave='msg_wh_segredo'").get().valor;
 const jobs=[];const ctx={waitUntil(p){jobs.push(p)}};
 const payload={type:'ReceivedCallback',messageId:'mobile-fresh-1',phone:'5588999990000',momment:Date.now(),text:{message:'Oi'},chatName:'Cliente teste'};
 const wh=()=>W.default.fetch(new Request('https://worker.test/wh/wafly/1/'+segredo,{method:'POST',body:JSON.stringify(payload)}),env,ctx);
 let response=await wh();assert.equal(response.status,200);assert.equal(jobs.length,1,'push disparado no webhook');await Promise.all(jobs);
 assert.equal(posted.length,antesWebhook+1,'novo aviso enviado sem cron');assert.equal(posted.at(-1).data.conversa,9);assert.equal(posted.at(-1).contents.pt,'Oi');const n=posted.length;
 assert.equal((await wh()).status,200);await Promise.all(jobs);assert.equal(posted.length,n,'reentrega processada não duplica aviso');
 // Instagram pelo Zernio: o aviso no celular sai na hora (antes esperava o cron de 1 minuto).
 const f0=global.fetch;global.fetch=async(url,opt)=>String(url).startsWith('https://zernio.com/')?Response.json({messages:[]}):f0(url,opt);
 db.prepare("INSERT INTO cfg(chave,valor) VALUES('zernio_chave','sk_teste_'||hex(randomblob(8))),('zernio_conta',?),('zernio_wh_segredo','segredo-zernio-teste')").run(JSON.stringify({id:'acc_t',usuario:'loja'}));
 const zEv=(id,dir)=>JSON.stringify({id:'ev_'+id,event:dir==='incoming'?'message.received':'message.sent',account:{accountId:'acc_t'},message:{id:'z_'+id,conversationId:'conv_1',platform:'instagram',platformMessageId:'mid_'+id,direction:dir,text:dir==='incoming'?'Oi do Direct':'Blz',sentAt:new Date().toISOString(),sender:{id:'IGSID_1',name:'Cliente Insta'}}});
 const zAss=async(c)=>{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode('segredo-zernio-teste'),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Buffer.from(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(c))).toString('hex')};
 const zJobs=[],zCtx={waitUntil(p){zJobs.push(p)}};
 const zWh=async(c)=>W.default.fetch(new Request('https://worker.test/wh/zernio/'+segredo,{method:'POST',headers:{'Content-Type':'application/json','X-Zernio-Signature':await zAss(c)},body:c}),env,zCtx);
 const antesZ=posted.length;assert.equal((await zWh(zEv(1,'incoming'))).status,200);await Promise.all(zJobs);
 assert.equal(posted.length,antesZ+1,'DM do Instagram avisa o celular sem esperar o cron');assert.equal(posted.at(-1).contents.pt,'Oi do Direct');
 assert.equal(db.prepare("SELECT estado FROM msg_push_outbox WHERE canal='instagram'").get().estado,'enviada');
 await zWh(zEv(2,'outgoing'));await Promise.all(zJobs);assert.equal(posted.length,antesZ+1,'resposta da loja não gera aviso');
 global.fetch=f0;
 console.log('worker_mobile_push: OK (registro, entrega, deduplicação, revogação, logout e configuração ausente)');
})().catch(e=>{console.error(e);process.exit(1)});
