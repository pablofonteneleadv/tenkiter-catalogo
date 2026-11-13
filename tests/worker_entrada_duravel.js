/* Falhas reais de transação SQLite e concorrência R2 simulada. Nenhum serviço externo. */
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const PREFIX='privado/mensagens/entrada/';
function banco(){
 const sqlite=new DatabaseSync(':memory:');let falhar=false;
 const DB={prepare(sql){let args=[];const st={bind(...a){args=a;return st},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){if(falhar&&!/^SELECT|^PRAGMA/i.test(sql))throw Error('cota simulada');const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}},_run(){if(falhar)throw Error('cota simulada');const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};return st},async batch(xs){sqlite.exec('BEGIN');try{const r=xs.map(x=>x._run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 return {DB,sqlite,falha:v=>falhar=v};
}
const r2=require('./helpers/r2_condicional.js');

(async()=>{
 const tmp=path.join(os.tmpdir(),'tk-worker-entrada.mjs');fs.writeFileSync(tmp,fs.readFileSync('instagram-worker/worker.js','utf8')+'\nexport {processarEntradas_,guardarEntrada_,processarEntrada_,corpoWebhook_,copiarMidiaRemota_};');const W=await import(tmp);
 const b=banco(),MIDIA=r2(),kv=new Map(),cache=new Map();
 // R2 calcula o ETag a partir do conteúdo, mesmo que mudem os metadados.
 const put=MIDIA.put.bind(MIDIA);
 MIDIA.put=async(key,body,options)=>{
   const saved=await put(key,body,options);
   if(!saved)return null;
   const value=MIDIA.mem.get(key);
   value.etag=createHash('md5').update(value.body).digest('hex');
   return {etag:value.etag};
 };
 const CACHE={async get(k,t){const v=kv.get(k);return t==='json'&&v?JSON.parse(v):v||null},async put(k,v){kv.set(k,String(v))},async delete(k){kv.delete(k)}};
 global.caches={default:{async match(r){const s=cache.get(r.url);return s?new Response(s):undefined},async put(r,v){cache.set(r.url,await v.text())},async delete(r){return cache.delete(r.url)}}};
 const env={DB:b.DB,MIDIA,CACHE,API_URL:'https://backend.test',MIDIA_URL:'https://midia.test'};
 let redeLenta=null,liberar=null,downloads=0,admin=true;
 global.fetch=async(u,opt)=>{
   u=String(u);if(u==='https://backend.test')return Response.json({ok:true,usuario:{nome:'Ana Teste',perfil:admin?'Admin total':'Equipe catálogo 1',permissoes:admin?['gerir_acessos']:['catalogo_admin','catalogo_cadastrar']}});
   if(u.includes('/inbox/conversations/')){if(redeLenta)await redeLenta;return Response.json({messages:[{id:'ig-lento',storyReply:{storyUrl:'https://cdn.test/story.jpg',storyId:'story-teste'}}]})}
   if(u.startsWith('https://cdn.test/')){downloads++;return new Response(new Uint8Array([255,216,255,1]),{headers:{'Content-Type':'image/jpeg'}})}
   throw Error('Rede não simulada: '+u);
 };
 // A falha de anexo remoto e classificada sem alterar o resultado nem vazar dados do webhook.
 const baixarOriginal=global.fetch,avisoOriginal=console.warn,avisos=[];
 try {
   console.warn=(x)=>avisos.push(String(x));
   global.fetch=async()=>new Response('proibido',{status:403});
   assert.equal(await W.copiarMidiaRemota_(env,'https://cdn.test/segredo-ficticio?token=nao-logar','image/jpeg'),null);
   assert.deepEqual(JSON.parse(avisos.pop()),{evento:'tk_midia_remota_falha',tipo:'http',codigo:403},'403 remoto deve ficar distinguivel sem URL');
   global.fetch=async()=>new Response('<html>login</html>',{headers:{'Content-Type':'text/html'}});
   assert.equal(await W.copiarMidiaRemota_(env,'https://cdn.test/segredo-ficticio','image/jpeg'),null);
   assert.equal(JSON.parse(avisos.pop()).tipo,'formato','pagina HTML nunca e aceita como foto');
   global.fetch=async()=>{throw Error('falha de rede: SEGREDO-FICTICIO');};
   assert.equal(await W.copiarMidiaRemota_(env,'https://cdn.test/segredo-ficticio','image/jpeg'),null);
   assert.equal(JSON.parse(avisos.pop()).tipo,'rede','falha de fetch nao revela detalhes privados');
   assert.equal(await W.copiarMidiaRemota_(env,'http://inseguro.test/segredo','image/jpeg'),null);
   assert.equal(JSON.parse(avisos.pop()).tipo,'url','URL insegura continua recusada');
   assert.equal(avisos.length,0,'cada falha gera um unico evento seguro');
 } finally { global.fetch=baixarOriginal; console.warn=avisoOriginal; }
 const wh=(body,ctx={})=>W.default.fetch(new Request('https://worker.test/wh/wafly/1/'+seg,{method:'POST',body:JSON.stringify(body)}),env,ctx);
 const msg=id=>({type:'ReceivedCallback',messageId:id,phone:'5588991234567',senderName:'Cliente teste',text:{message:'Olá'},momment:Date.now()});
 const fila=classe=>[...MIDIA.mem.keys()].filter(k=>k.startsWith(PREFIX+(classe?classe+'/':'')));
 const esperar=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,2))}throw Error('Estado não alcançado')};
 const get=(sql,...args)=>b.sqlite.prepare(sql).get(...args);
 await W.default.fetch(new Request('https://worker.test/wh/wafly/1/bootstrap',{method:'POST',body:'{}'}),env,{});
 const seg=get("SELECT valor FROM cfg WHERE chave='msg_wh_segredo'").valor;
 const cfg=(k,v)=>b.sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run(k,v);
 assert.equal((await W.default.fetch(new Request('https://worker.test/wh/wafly/1/errado',{method:'POST',body:JSON.stringify(msg('nao-autorizado'))}),env,{})).status,404);
 assert.equal(fila().length,0,'Não preserva evento sem autenticação');
 MIDIA.falha(true);assert.equal((await wh(msg('r2-falhou'))).status,500,'Sem persistência não confirma recebimento');MIDIA.falha(false);
 assert(!get("SELECT id FROM msg_mensagem WHERE ext_id='r2-falhou'"));
 b.falha(true);const jobs=[],ctx={waitUntil(p){jobs.push(p)}};
 assert.equal((await wh(msg('cota'),ctx)).status,200,'Confirma somente depois de guardar no R2');await Promise.all(jobs);
 assert.equal(fila('recebidas').length,1);assert(!get("SELECT id FROM msg_mensagem WHERE ext_id='cota'"));
 assert(!JSON.stringify([...MIDIA.mem.values()].map(x=>x.body.toString())).includes(seg),'Journal não contém caminho secreto');
 for(const v of MIDIA.mem.values())v.customMetadata.em=new Date(Date.now()-60000).toISOString();
 const api=(p,metodo='GET',sessao='tk3.admin')=>W.default.fetch(new Request('https://worker.test'+p,{method:metodo,headers:{'X-TK-Whats':'5588999999999','X-TK-Sessao':sessao}}),env,{});
 const sd=await(await api('/msg/novidades?cont=1')).json();assert(sd.saude.alerta&&sd.saude.tipo==='entrada'&&sd.saude.pendentes===1,'Avisa que mensagens aceitas aguardam processamento');
 assert(!JSON.stringify(sd.saude).includes(seg)&&!JSON.stringify(sd.saude).includes('Olá'),'Saúde não expõe mensagem ou segredo');
 admin=false;assert.equal((await api('/msg/entrada/reprocessar','POST','tk3.equipe')).status,403,'Reprocessamento exige configuração no servidor');admin=true;

 b.falha(false);await W.processarEntradas_(env,true);
 assert.equal(fila('recebidas').length,0);let c=get("SELECT total,nao_lidas FROM msg_conversa WHERE contato='5588991234567'");assert.equal(c.total,1);assert.equal(c.nao_lidas,1);
 await wh(msg('cota'));c=get("SELECT total,nao_lidas FROM msg_conversa WHERE contato='5588991234567'");assert.deepEqual({...c},{total:1,nao_lidas:1},'Reentrega não incrementa contador');
 // Falha depois do INSERT, antes de atualizar a lista: os dois precisam reverter.
 b.sqlite.exec("CREATE TRIGGER falha_lista BEFORE UPDATE OF total ON msg_conversa BEGIN SELECT RAISE(ABORT,'lista indisponivel'); END;");
 await wh(msg('transacao'));assert(!get("SELECT id FROM msg_mensagem WHERE ext_id='transacao'"),'Falha da lista reverte INSERT da mensagem');assert.equal(fila('recebidas').length,1);
 b.sqlite.exec('DROP TRIGGER falha_lista');await W.processarEntradas_(env,true);assert(get("SELECT id FROM msg_mensagem WHERE ext_id='transacao'"));assert.equal(get("SELECT total FROM msg_conversa WHERE contato='5588991234567'").total,2);
 // Dois consumidores competem pelo mesmo objeto; somente um obtém a lease condicional.
 const m={extId:'concorrente',contato:'5588991234567',nome:'Cliente teste',grupo:0,direcao:'entrada',tipo:'texto',texto:'Concorrente',em:new Date().toISOString()};
 const key=await W.guardarEntrada_(env,'mensagens','whatsapp1',{mensagens:[m]});
 const rr=await Promise.all([W.processarEntrada_(env,key),W.processarEntrada_(env,key)]);assert(rr.some(x=>x.ocupada));assert.equal(get("SELECT COUNT(*) n FROM msg_mensagem WHERE ext_id='concorrente'").n,1);
 // Evento preservado não é descartado ao pausar o canal.
 const pk=await W.guardarEntrada_(env,'mensagens','whatsapp1',{mensagens:[{...m,extId:'pausado'}]});cfg('msg_pausa_whatsapp1','1');await W.processarEntrada_(env,pk);assert(MIDIA.mem.has(pk));cfg('msg_pausa_whatsapp1','0');await W.processarEntradas_(env,true);assert(!MIDIA.mem.has(pk));
 // Recibo invertido fica preservado até a mensagem referenciada chegar.
 await wh({type:'MessageStatusCallback',status:'READ',ids:['ack-invertido']});
 assert.equal(fila('atualizacoes').length,1);
 await wh({...msg('ack-invertido'),fromMe:true});await W.processarEntradas_(env,true);
 assert.equal(get("SELECT status FROM msg_mensagem WHERE ext_id='ack-invertido'").status,'lida');
 assert.equal(fila('atualizacoes').length,0);
 // A leitura do primeiro evento não pode apagar o novo não lido após a resposta.
 await wh(msg('chegou-depois-da-resposta'));
 const antigo=get("SELECT id,enviada_em,conversa_id FROM msg_mensagem WHERE ext_id='cota'");
 const antesLeitura=get('SELECT nao_lidas FROM msg_conversa WHERE id=?',antigo.conversa_id).nao_lidas;
 const depoisDaReferencia=get("SELECT COUNT(*) n FROM msg_mensagem WHERE conversa_id=? AND direcao='entrada' AND (enviada_em>? OR (enviada_em=? AND id>?))",antigo.conversa_id,antigo.enviada_em,antigo.enviada_em,antigo.id).n;
 const esperados=Math.min(antesLeitura,depoisDaReferencia);assert(esperados>0);
 await wh({type:'MessageStatusCallback',status:'READ_BY_ME',ids:['cota']});
 assert.equal(get('SELECT nao_lidas FROM msg_conversa WHERE id=?',antigo.conversa_id).nao_lidas,esperados,'Recibo antigo preserva mensagens novas não lidas');
 // Mais de uma página de backlog é sinalizada mesmo se os primeiros 50 são recentes.
 for(let i=0;i<51;i++)await W.guardarEntrada_(env,'mensagens','whatsapp1',{mensagens:[{...m,extId:'backlog-'+i}]});
 cache.clear();const grandeFila=await(await api('/msg/novidades?cont=1')).json();assert(grandeFila.saude.alerta&&grandeFila.saude.mais,'Página truncada nunca esconde backlog');
 for(const k of fila('recebidas'))MIDIA.mem.delete(k);
 // Consulta de story fica pendente, mas a mensagem e a lista já foram confirmadas.
 cfg('zernio_chave','sk_live_'+'x'.repeat(32));cfg('zernio_conta',JSON.stringify({id:'conta-teste'}));cfg('zernio_wh_segredo','assinatura-de-teste');
 const ev=JSON.stringify({event:'message.received',account:{accountId:'conta-teste'},message:{id:'ig-lento',platformMessageId:'ig-lento',platform:'instagram',direction:'incoming',conversationId:'cid-teste',sender:{id:'ig-contato',name:'Cliente Instagram'},text:'Tem esse?',sentAt:new Date().toISOString()}});
 const k=await crypto.subtle.importKey('raw',new TextEncoder().encode('assinatura-de-teste'),{name:'HMAC',hash:'SHA-256'},false,['sign']);const ass=Buffer.from(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(ev))).toString('hex');
 redeLenta=new Promise(r=>liberar=r);const zj=[];const r=await W.default.fetch(new Request('https://worker.test/wh/zernio/'+seg,{method:'POST',headers:{'X-Zernio-Signature':ass},body:ev}),env,{waitUntil(p){zj.push(p)}});assert.equal(r.status,200);
 await esperar(()=>get("SELECT m.id FROM msg_mensagem m JOIN msg_conversa c ON c.id=m.conversa_id WHERE m.ext_id='ig-lento' AND c.total=1"));
 await esperar(()=>fila('complementos').length>0);
 assert(fila('complementos').length>0,'Story lento aguarda separado da mensagem básica');
 const inicial=get("SELECT id,conversa_id FROM msg_mensagem WHERE ext_id='ig-lento'");b.sqlite.prepare("UPDATE msg_mensagem SET status_em='2020-01-01T00:00:00.000Z' WHERE id=?").run(inicial.id);
 liberar();await Promise.all(zj);redeLenta=null;
 assert(get("SELECT ctx_chave FROM msg_mensagem WHERE ext_id='ig-lento'").ctx_chave.endsWith('.jpg'));
 const tardias=await(await api('/msg/novidades?conversa='+inicial.conversa_id+'&depois='+inicial.id+'&st='+encodeURIComponent(new Date(Date.now()-2000).toISOString()))).json();
 assert(tardias.mensagens.some(x=>x.id===inicial.id&&x.ctx_midia===1),'Mensagem antiga enriquecida reaparece nas novidades');
 // Falha de D1 após cópia: o endereço já copiado deve sobreviver na fila e ser reutilizado.
 const mk=await W.guardarEntrada_(env,'midia','instagram',{extId:'ig-lento',midiaUrl:'https://cdn.test/foto.jpg',midiaMime:'image/jpeg'});
 b.sqlite.exec("CREATE TRIGGER falha_midia BEFORE UPDATE OF midia_chave ON msg_mensagem BEGIN SELECT RAISE(ABORT,'falha depois da copia'); END;");
 const antes=downloads;await W.processarEntrada_(env,mk);assert(MIDIA.mem.has(mk));assert.equal(downloads,antes+1);b.sqlite.exec('DROP TRIGGER falha_midia');await W.processarEntrada_(env,mk,true);assert.equal(downloads,antes+1,'Retentativa não copia arquivo outra vez');assert(!MIDIA.mem.has(mk));
 // Complemento com origem indisponível por dias sai da fila, preservando o histórico.
 const falhasPrefixo=PREFIX+'falhas-midia/';
 await wh(msg('anexo-esgotado'));
 await wh(msg('anexo-recuperavel'));
 const media=(id)=>W.guardarEntrada_(env,'midia','whatsapp1',{
   extId:id,tipo:'imagem',midiaUrl:'https://cdn.test/'+id+'.jpg',midiaMime:'image/jpeg'
 });
 const envelhecer=(key)=>{
   Object.assign(MIDIA.mem.get(key).customMetadata,{em:new Date(Date.now()-25*3600000).toISOString(),tentativas:'105',tentativasMidia:'7'});
 };
 const esgotada=await media('anexo-esgotado'), recuperavel=await media('anexo-recuperavel');
 const entradaOriginal=MIDIA.mem.get(esgotada).body.toString();
 const chaveFalha=falhasPrefixo+esgotada.split('/').at(-1);
 envelhecer(esgotada);
 global.fetch=async(u,opt)=>String(u).includes('/anexo-esgotado.jpg')?new Response('',{status:404}):baixarOriginal(u,opt);
 try {
   await W.processarEntradas_(env,true);
   assert(!MIDIA.mem.has(esgotada),'Download esgotado deve sair da fila ativa');
   assert(MIDIA.mem.has(chaveFalha),'Complemento deve ser preservado no arquivo privado');
   assert.equal(MIDIA.mem.get(chaveFalha).customMetadata.codigo,'404');
   assert.equal(get("SELECT texto FROM msg_mensagem WHERE ext_id='anexo-esgotado'").texto,'Olá');
   assert(get("SELECT midia_chave FROM msg_mensagem WHERE ext_id='anexo-recuperavel'").midia_chave);
   assert.equal(fila('complementos').length,0);
   cache.clear();
   const saude=await(await api('/msg/novidades?cont=1')).json();
   assert.equal(saude.saude.alerta,false,'Complemento arquivado não gera aviso de espera ou de webhook');
   const original=JSON.parse(entradaOriginal);
   await W.guardarEntrada_(env,original.tipo,original.canal,original.dados);
   assert(!MIDIA.mem.has(esgotada),'Reentrega idêntica não reabre download esgotado');
   await MIDIA.put(esgotada,entradaOriginal);
   assert.equal((await W.processarEntrada_(env,esgotada,true)).arquivada,true);
   assert(!MIDIA.mem.has(esgotada),'Uma reentrega concorrente que já gravou é reconciliada');
 } finally { global.fetch=baixarOriginal; }
 // Uma origem que oscila continua tentando e pode se recuperar, mesmo com várias falhas.
 await wh(msg('anexo-temporario'));
 const temporaria=await media('anexo-temporario');
 const antesTemporaria=MIDIA.mem.get(temporaria).customMetadata;
 Object.assign(antesTemporaria,{tentativas:'12',tentativasMidia:'7'});
 const indisponivel=async()=>new Response('',{status:503});
 try {
   global.fetch=indisponivel;
   assert.equal((await W.processarEntrada_(env,temporaria,true)).pendente,true);
   assert.equal(MIDIA.mem.get(temporaria).customMetadata.tentativasMidia,'8');
 } finally {global.fetch=baixarOriginal;}
 assert.equal((await W.processarEntrada_(env,temporaria,true)).ok,true);
 assert(get("SELECT midia_chave FROM msg_mensagem WHERE ext_id='anexo-temporario'").midia_chave);

 // Legado com muitas tentativas: falha ao arquivar conserva a entrada ativa.
 await wh(msg('anexo-legado'));
 const antiga=await media('anexo-legado');
 const arquivoAntiga=falhasPrefixo+antiga.split('/').at(-1);
 Object.assign(MIDIA.mem.get(antiga).customMetadata,{
   em:new Date(Date.now()-52*3600000).toISOString(),motivo:'midia',tentativas:'105'
 });
 const gravar=MIDIA.put;
 try {
   global.fetch=async()=>new Response('',{status:410});
   MIDIA.put=async(key,...args)=>{
     if(key===arquivoAntiga)throw Error('Falha simulada no arquivo');
     return gravar(key,...args);
   };
   assert.equal((await W.processarEntrada_(env,antiga,true)).pendente,true);
   assert(MIDIA.mem.has(antiga)&&!MIDIA.mem.has(arquivoAntiga));
 } finally { MIDIA.put=gravar; global.fetch=baixarOriginal; }

 assert.equal(MIDIA.mem.get(antiga).customMetadata.tentativasMidia,'1');
 // Falha no R2 da mídia não é contada como falha da origem, mesmo depois do prazo.
 await wh(msg('anexo-r2-temporario'));
 const armazenamento=await media('anexo-r2-temporario');
 envelhecer(armazenamento);
 try {
   MIDIA.put=async(key,...args)=>{
     if(key.startsWith('msg/'))throw Error('R2 de mídia indisponível');
     return gravar(key,...args);
   };
   assert.equal((await W.processarEntrada_(env,armazenamento,true)).pendente,true);
   assert.equal(MIDIA.mem.get(armazenamento).customMetadata.tentativasMidia,'7');
   assert.equal(MIDIA.mem.get(armazenamento).customMetadata.motivo,'armazenamento');
 } finally { MIDIA.put=gravar; }
 assert.equal((await W.processarEntrada_(env,armazenamento,true)).ok,true);

 // Um link obsoleto não impede persistir outro arquivo disponível do mesmo complemento.
 await wh(msg('dois-anexos'));
 const dois=await W.guardarEntrada_(env,'midia','whatsapp1',{
   extId:'dois-anexos',tipo:'imagem',midiaUrl:'https://cdn.test/origem-expirada.jpg',
   midiaMime:'image/jpeg',ctxUrl:'https://cdn.test/story-ok.jpg',ctxMime:'image/jpeg',ctxTipo:'story'
 });
 try {
   global.fetch=async(u,opt)=>String(u).includes('/origem-expirada.jpg')?new Response('',{status:410}):baixarOriginal(u,opt);
   const antes=downloads;
   assert.equal((await W.processarEntrada_(env,dois,true)).pendente,true);
   assert(get("SELECT ctx_chave FROM msg_mensagem WHERE ext_id='dois-anexos'").ctx_chave);
   await W.processarEntrada_(env,dois,true);
   assert.equal(downloads,antes+1,'A prévia disponível é copiada uma vez');
 } finally {global.fetch=baixarOriginal;}
 // Prefixo do journal nunca é servido no endpoint público de mídia, nem com chave conhecida.
 const mf=path.join(os.tmpdir(),'tk-midia-entrada.mjs');fs.writeFileSync(mf,fs.readFileSync('midia-worker/worker.js'));const MW=await import(mf);await MIDIA.put(pk,'{"privado":"não expor"}',{httpMetadata:{contentType:'application/json'}});assert.equal((await MW.default.fetch(new Request('https://midia.test/m/'+pk),env,{})).status,404);
 assert.equal((await MW.default.fetch(new Request('https://midia.test/m/'+chaveFalha),env,{})).status,404);
 const grande=new Request('https://wh.test',{method:'POST',body:new Uint8Array(300000)});assert.equal(await W.corpoWebhook_(grande,262144),null,'Leitura do corpo é limitada antes de JSON/HMAC');
 console.log('Entrada durável: autenticação, persistência independente, cota, transação, deduplicação, lease, pausa, story lento, retomada de mídia e privacidade aprovados.');
})().catch(e=>{console.error(e);process.exitCode=1});
