/* Coordenador e alarmes no runtime Cloudflare real, com provedor de envio falso. */
const assert=require('node:assert/strict'),path=require('node:path');
const {Miniflare}=require('../instagram-worker/node_modules/miniflare');
(async()=>{
 const root=path.resolve(__dirname,'../instagram-worker');const sent=[];
 const mf=new Miniflare({name:'teste-partes',modules:true,modulesRules:[{type:'ESModule',include:['**/*.js']}],scriptPath:path.join(root,'worker-entry.js'),modulesRoot:root,compatibilityDate:'2025-01-01',compatibilityFlags:['web_socket_auto_reply_to_close'],d1Databases:['DB'],kvNamespaces:['CACHE'],r2Buckets:['MIDIA'],durableObjects:{MSG_EVENTOS:{className:'MensagensAoVivo',useSQLite:true},POSTAGENS_SEQUENCIA:{className:'PostagensSequenciais',useSQLite:true}},bindings:{API_URL:'https://backend.test',ORIGENS:'https://painel.test'},outboundService:async req=>{
  assert.equal(new URL(req.url).hostname,'backend.test');const d=await req.json();
  if(d.action==='waflyStatusRemoto'){sent.push(d.requestId);return Response.json({ok:true,requestId:d.requestId});}
  return Response.json({ok:true,usuario:{nome:'Teste',permissoes:['gerir_acessos']}});
 }});
 try{
  const headers={'X-TK-Whats':'5588999999999','X-TK-Sessao':'tk3.teste',Origin:'https://painel.test'};
  assert.equal((await mf.dispatchFetch('https://worker.test/msg/config',{headers})).status,200);
  const db=await mf.getD1Database('DB');await db.prepare("INSERT OR REPLACE INTO cfg(chave,valor) VALUES('po_cfg',?)").bind(JSON.stringify({pausaAtiva:false,partesRapidas:true})).run();
  const now=new Date(Date.now()-1000).toISOString();
  for(let i=1;i<=6;i++)await db.prepare("INSERT INTO postagem(tipo,modo,midias,agendado_em,status,canal,serie,parte,partes) VALUES('story','auto',?,?,'agendado','whatsapp','serie-runtime',?,6)").bind(JSON.stringify([{url:'https://midia.test/'+i+'.mp4',tipo:'video'}]),now,i).run();
  // Cron inicia o DO. O alarme prossegue além das quatro tentativas de uma execução.
  await mf.getDurableObjectNamespace('POSTAGENS_SEQUENCIA').then(ns=>ns.get(ns.idFromName('loja')).acordar());
  const deadline=Date.now()+20000;
  while(Date.now()<deadline){const n=await db.prepare("SELECT COUNT(*) n FROM postagem WHERE status='publicado'").first();if(n.n===6)break;await new Promise(r=>setTimeout(r,250));}
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM postagem WHERE status='publicado'").first()).n,6);
  assert.deepEqual(sent,Array.from({length:6},(_,i)=>'tkpost-'+String(i+1).padStart(12,'0')));
  await new Promise(r=>setTimeout(r,1500));assert.equal(sent.length,6,'Alarme não repete envios confirmados');
  // Uma sequência iniciada não fica presa atrás das 40 primeiras linhas atrasadas.
  await db.prepare("UPDATE postagem SET status='agendado',publicado_em='' WHERE serie='serie-runtime' AND parte>1").run();sent.length=0;
  for(let i=0;i<45;i++)await db.prepare("INSERT INTO postagem(tipo,modo,midias,agendado_em,status,canal) VALUES('story','auto','[]',?,'agendado','whatsapp')").bind(new Date(Date.now()-3600000).toISOString()).run();
  await mf.getDurableObjectNamespace('POSTAGENS_SEQUENCIA').then(ns=>ns.get(ns.idFromName('loja')).acordar());
  const again=Date.now()+25000;
  while(Date.now()<again){const n=await db.prepare("SELECT COUNT(*) n FROM postagem WHERE serie='serie-runtime' AND status='publicado'").first();if(n.n===6)break;await new Promise(r=>setTimeout(r,250));}
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM postagem WHERE serie='serie-runtime' AND status='publicado'").first()).n,6,'Partes continuam com fila acumulada');
  assert.deepEqual(sent,Array.from({length:5},(_,i)=>'tkpost-'+String(i+2).padStart(12,'0')));
  console.log('OK: Durable Object, alarmes e seis partes em ordem, sem intervalo editorial ou repetição.');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1});
