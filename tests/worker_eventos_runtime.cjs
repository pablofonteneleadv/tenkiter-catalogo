/* Runtime Cloudflare local: autenticação real do Worker + SQLite/hibernação do DO.
 * Nenhuma chamada é encaminhada à Internet. */
const assert=require('node:assert/strict'),path=require('node:path');
const {Miniflare}=require('../instagram-worker/node_modules/miniflare');
(async()=>{
 const raiz=path.resolve(__dirname,'../instagram-worker');
 let permissao=true;
 const mf=new Miniflare({name:'teste-eventos',modules:true,modulesRules:[{type:'ESModule',include:['**/*.js']}],script:`import worker from './worker.js';import {MensagensAoVivo as Base} from './mensagens-aovivo.js';export class MensagensAoVivo extends Base {async info(){return {conexoes:this.ctx.getWebSockets().map(w=>w.deserializeAttachment()?.exp)}}}export default {async fetch(req,env,ctx){const u=new URL(req.url);if(u.pathname==='/teste/info')return Response.json(await env.MSG_EVENTOS.get(env.MSG_EVENTOS.idFromName('whatsapp1')).info());if(u.pathname==='/teste/sinal'){await env.MSG_EVENTOS.get(env.MSG_EVENTOS.idFromName(u.searchParams.get('canal'))).avisar();return new Response('ok')}return worker.fetch(req,env,ctx)}}`,scriptPath:path.join(raiz,'teste-entry.js'),modulesRoot:raiz,
   compatibilityDate:'2025-01-01',compatibilityFlags:['web_socket_auto_reply_to_close'],d1Databases:['DB'],kvNamespaces:['CACHE'],r2Buckets:['MIDIA'],
   durableObjects:{MSG_EVENTOS:{className:'MensagensAoVivo',useSQLite:true}},
   bindings:{API_URL:'https://backend.test',ORIGENS:'https://painel.test'},
   outboundService:async req=>{assert.equal(new URL(req.url).hostname,'backend.test','Rede só backend simulado');return Response.json({ok:true,usuario:{nome:'Ana Teste',permissoes:permissao?['gerir_acessos']:[],perfis:[]}});}});
 try{
 const headers={Origin:'https://painel.test','X-TK-Whats':'5588999999999','X-TK-Sessao':'tk3.teste'};
 const ticket=async(h=headers,canais=['whatsapp1'])=>mf.dispatchFetch('https://worker.test/msg/tempo-real/ticket',{method:'POST',headers:h,body:JSON.stringify({canais})});
 assert.equal((await ticket({Origin:'https://painel.test'})).status,401);
 let r=await ticket();assert.equal(r.status,200);const j=await r.json();assert.equal(j.ok,true);assert.equal(j.tickets.length,1);
 assert.equal(j.socketUrl,'wss://worker.test/msg/tempo-real');assert(!JSON.stringify(j).includes('tk3.teste'));
 const wsReq=(t,origin='https://painel.test',query='')=>mf.dispatchFetch('https://worker.test/msg/tempo-real'+query,{headers:{Upgrade:'websocket',Origin:origin,'Sec-WebSocket-Protocol':'tk-msg, tk-ticket.'+t}});
 assert.equal((await wsReq(j.tickets[0].token,'https://invasor.test')).status,403);
 assert.equal((await wsReq(j.tickets[0].token,'https://painel.test','?ticket=x')).status,403);
 assert.equal((await wsReq(j.tickets[0].token+'x')).status,401);
 assert.equal((await mf.dispatchFetch(j.socketUrl.replace('wss:','https:'))).status,426);
 const socketResp=await wsReq(j.tickets[0].token);assert.equal(socketResp.status,101);assert.equal(socketResp.headers.get('Sec-WebSocket-Protocol'),'tk-msg');
 const ws=socketResp.webSocket, recebidos=[];ws.accept();ws.addEventListener('message',e=>recebidos.push(JSON.parse(e.data)));
 const esperar=async fn=>{for(let i=0;i<400;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('Evento não recebido')};
 await esperar(()=>recebidos.length);assert.deepEqual(Object.keys(recebidos[0]).sort(),['seq','tipo']);
 assert.equal((await wsReq(j.tickets[0].token)).status,409,'Ticket não pode ser reutilizado');
 ws.send('{"tipo":"ping"}');await esperar(()=>recebidos.some(x=>x.tipo==='pong'));
 const sinal=c=>mf.dispatchFetch('https://worker.test/teste/sinal?canal='+c);
 const antes=recebidos.filter(x=>x.tipo==='atualizar').at(-1).seq;
 await sinal('instagram');await new Promise(r=>setTimeout(r,30));assert.equal(recebidos.filter(x=>x.tipo==='atualizar').at(-1).seq,antes,'Canal independente');
 await sinal('whatsapp1');await esperar(()=>recebidos.some(x=>x.seq>antes));
 const seq=recebidos.filter(x=>x.tipo==='atualizar').at(-1).seq;
 await mf.unsafeEvictDurableObject('teste-eventos','MensagensAoVivo',{name:'whatsapp1',webSockets:'hibernate'});
 await sinal('whatsapp1');await esperar(()=>recebidos.some(x=>x.seq>seq));
 assert.equal((await wsReq(j.tickets[0].token)).status,409,'Hibernação conserva prevenção de replay');
 assert(recebidos.every(x=>Object.keys(x).every(k=>['tipo','seq'].includes(k))),'Socket não carrega dados de clientes');
 // Revogação de acesso impede tickets novos; não confia no pedido de canais.
 permissao=false;assert.equal((await ticket({...headers,'X-TK-Sessao':'tk3.sem-permissao'})).status,403);
 const db=await mf.getD1Database('DB');
 const seg=(await db.prepare("SELECT valor FROM cfg WHERE chave='msg_wh_segredo'").first()).valor;
 const assinar=async dados=>{const c=Buffer.from(JSON.stringify(dados)).toString('base64url');const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(seg),{name:'HMAC',hash:'SHA-256'},false,['sign']);return c+'.'+Buffer.from(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode('mensagens-eventos-v1:'+c))).toString('hex')};
 const base={canal:'whatsapp1',nonce:'a'.repeat(48),conectar:Date.now()+29000,exp:Date.now()+290000};
 assert.equal((await wsReq(await assinar({...base,conectar:Date.now()-1}))).status,401,'Ticket expirado');
 assert.equal((await wsReq(await assinar({...base,canal:'outro'}))).status,401,'Canal inválido');
 const expBreve=Date.now()+800;
 const breve=await wsReq(await assinar({...base,nonce:'b'.repeat(48),exp:expBreve}));assert.equal(breve.status,101);
 breve.webSocket.accept();
 await esperar(async()=>!(await(await mf.dispatchFetch('https://worker.test/teste/info')).json()).conexoes.includes(expBreve));
 assert.equal((await wsReq(await assinar({...base,nonce:'b'.repeat(48),exp:expBreve}))).status,401,'Socket expirado e ticket já vencido');
 breve.webSocket.close();
 ws.close();
 console.log('Eventos runtime: sessão, ACL, origem, assinatura, expiração, replay SQLite, canais, protocolo, ping e aviso mínimo aprovados.');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1});
