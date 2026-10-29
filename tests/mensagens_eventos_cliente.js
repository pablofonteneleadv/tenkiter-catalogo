'use strict';
const assert = require('node:assert/strict');
const { criar } = require('../mensagens-eventos.js');

class Relogio {
  constructor() { this.agora = 1000; this.seq = 0; this.tarefas = new Map(); }
  timeout(fn, ms) { const id = ++this.seq; this.tarefas.set(id, { fn, em: this.agora + Math.max(0, ms), intervalo: 0 }); return id; }
  interval(fn, ms) { const id = ++this.seq; this.tarefas.set(id, { fn, em: this.agora + ms, intervalo: ms }); return id; }
  clear(id) { this.tarefas.delete(id); }
  async avancar(ms) {
    const fim = this.agora + ms; let limite = 2000;
    while (limite-- > 0) {
      let proximo = null;
      for (const [id, t] of this.tarefas) if (t.em <= fim && (!proximo || t.em < proximo.t.em)) proximo = { id, t };
      if (!proximo) break;
      this.agora = proximo.t.em;
      if (proximo.t.intervalo) proximo.t.em += proximo.t.intervalo; else this.tarefas.delete(proximo.id);
      proximo.t.fn(); await flush();
    }
    assert.ok(limite > 0, 'timer loop did not settle');
    this.agora = fim; await flush();
  }
  get quantidade() { return this.tarefas.size; }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
class FakeWS {
  static abertos = [];
  constructor(url, protocolos) { this.url = url; this.protocolos = protocolos; this.readyState = 0; this.sent = []; FakeWS.abertos.push(this); }
  open() { if (this.readyState >= 2) return; this.readyState = 1; this.onopen?.({}); }
  msg(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  send(value) { this.sent.push(value); if (JSON.parse(value).tipo==='ping') this.msg({tipo:'pong'}); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({}); }
  remoteClose() { this.readyState = 3; this.onclose?.({}); }
}
function ambiente() {
  const clock = new Relogio(); FakeWS.abertos = [];
  const listeners = new Map();
  global.window = global; global.document = { visibilityState: 'visible', addEventListener(type,fn){listeners.set(type,fn);}, removeEventListener(type){listeners.delete(type);}, fire(type){listeners.get(type)?.();} };
  global.WebSocket = FakeWS; global.setTimeout = (f,m)=>clock.timeout(f,m); global.clearTimeout = id=>clock.clear(id);
  global.setInterval = (f,m)=>clock.interval(f,m); global.clearInterval = id=>clock.clear(id); Date.now = ()=>clock.agora;
  return clock;
}
const ticketProvider = async canais => ({ ok:true, socketUrl:'wss://api.example/msg/tempo-real', renovarEm:240000,
  tickets:canais.map((canal,i)=>({canal,token:`tokenSeguro${i}XYZ`})) });
const connectedPair = async (client, clock) => {
  client.iniciar(); await flush();
  const batch = FakeWS.abertos.slice(-2); assert.equal(batch.length, 2);
  batch.forEach(s => s.open()); await flush();
  await clock.avancar(0); return batch;
};

(async () => {
  // Credentials travel only in the required subprotocol; all sockets must open for true.
  let clock = ambiente(), states = [], refreshes = 0;
  let client = criar({ conta:()=> 'conta-A', ativo:()=>true, canais:()=>['whatsapp1','instagram'], pedirTickets:ticketProvider,
    atualizar:async()=>{refreshes++;}, estado:v=>states.push(v) });
  const pair = await connectedPair(client, clock);
  assert.deepEqual(pair[0].protocolos,['tk-msg','tk-ticket.tokenSeguro0XYZ']);
  assert.ok(pair.every(s=>s.url==='wss://api.example/msg/tempo-real'&&!s.url.includes('tokenSeguro')));
  assert.equal(client.conectado(),true); assert.equal(states.at(-1),true);
  const baselineRefresh=refreshes;
  pair[0].msg({tipo:'atualizar',seq:1}); pair[0].msg({tipo:'atualizar',seq:2});
  await clock.avancar(199); assert.equal(refreshes,baselineRefresh); await clock.avancar(1); await flush(); assert.equal(refreshes,baselineRefresh+1,'bursts should coalesce');

  // A notification during a running refresh schedules exactly one more refresh.
  let resolveFirst, count=0;
  const dirty = criar({conta:()=> 'x',ativo:()=>true,canais:()=>['whatsapp1'],pedirTickets:async cs=>({ok:true,socketUrl:'wss://x.example/s',tickets:cs.map(c=>({canal:c,token:'token123456'}))}),
    atualizar:()=>{count++; if(count===1)return new Promise(r=>{resolveFirst=r;}); return Promise.resolve();}});
  dirty.iniciar(); await flush(); const one=FakeWS.abertos.at(-1); one.open(); await clock.avancar(0); assert.equal(count,1);
  one.msg({tipo:'atualizar',seq:1}); await clock.avancar(200); assert.equal(count,1,'in-flight fetch is not duplicated immediately');
  one.msg({tipo:'atualizar',seq:2}); await clock.avancar(200); resolveFirst(); await flush(); assert.equal(count,2,'dirty event during fetch must run once after it');
  dirty.parar();

  // Identity changes close old sockets; even a captured stale callback is ignored.
  let account='old', captured, refreshOld=0; const socketsBefore=FakeWS.abertos.length;
  const moving=criar({conta:()=>account,ativo:()=>true,canais:()=>['whatsapp1'],pedirTickets:ticketProvider,
    atualizar:async ctx=>{if(ctx.conta==='old'){captured=ctx.atual;refreshOld++;}}});
  moving.iniciar(); await flush(); const old=FakeWS.abertos.at(-1); old.open(); await clock.avancar(0);
  account='new'; const movingSync=moving.sincronizar(); await clock.avancar(0); await movingSync; await flush();
  assert.equal(old.readyState,3); assert.equal(captured(),false); assert.ok(FakeWS.abertos.length>socketsBefore);
  moving.parar();

  // A stale ticket response cannot create sockets after account switch.
  account='a'; const pendingTickets=[];
  const stale=criar({conta:()=>account,ativo:()=>true,canais:()=>['whatsapp1'],pedirTickets:()=>new Promise(r=>pendingTickets.push(r)),atualizar:async()=>{}});
  stale.iniciar(); await flush(); account='b'; const staleSync=stale.sincronizar(); await clock.avancar(0); await staleSync; await flush(); const nBefore=FakeWS.abertos.length;
  pendingTickets[0]({ok:true,socketUrl:'wss://x.example/s',tickets:[{canal:'whatsapp1',token:'token123456'}]}); await flush();
  assert.equal(FakeWS.abertos.length,nBefore,'late ticket response must be discarded'); stale.parar();

  // A running refresh must become stale after an account switch, then refresh the new account.
  let syncAccount='acct-1', resolveRefresh, refreshContexts=[];
  const changingSync=criar({conta:()=>syncAccount,ativo:()=>true,canais:()=>['whatsapp1'],pedirTickets:ticketProvider,
    atualizar:ctx=>{refreshContexts.push(ctx); if(ctx.conta==='acct-1')return new Promise(r=>{resolveRefresh=r;}); return Promise.resolve();}});
  changingSync.iniciar(); await clock.avancar(0); assert.equal(refreshContexts[0].conta,'acct-1');
  const staleGuard=refreshContexts[0].atual; syncAccount='acct-2'; const newAccountSync=changingSync.sincronizar(); await clock.avancar(0);
  assert.equal(staleGuard(),false,'old account refresh guard must be invalidated'); resolveRefresh(); await flush(); await clock.avancar(0); await newAccountSync;
  assert.ok(refreshContexts.some(x=>x.conta==='acct-2'),'new account must receive a fresh refresh'); changingSync.parar();

  // Close/error reconnects with bounded backoff; heartbeat and renewal rotate tickets.
  clock=ambiente(); let tickets=0; states=[];
  let updateCount=0;
  client=criar({conta:()=> 'r',ativo:()=>true,canais:()=>['whatsapp1'],pedirTickets:async cs=>{tickets++;return {ok:true,socketUrl:'wss://r.example/s',renovarEm:240000,tickets:cs.map(c=>({canal:c,token:'tokenRenewal123'}))};},atualizar:async()=>{updateCount++;},estado:v=>states.push(v)});
  client.iniciar(); await flush(); let ws=FakeWS.abertos.at(-1); ws.open(); await flush(); assert.equal(client.conectado(),true);
  await clock.avancar(25000); assert.ok(ws.sent.some(s=>JSON.parse(s).tipo==='ping'));
  ws.msg({tipo:'pong'}); ws.remoteClose(); await flush(); assert.equal(client.conectado(),false);
  await clock.avancar(500); const retry=FakeWS.abertos.at(-1); assert.notEqual(retry,ws); retry.open(); await flush(); assert.equal(client.conectado(),true);
  await clock.avancar(240000); await flush(); assert.equal(tickets>=3,true,'ticket batch renewed');
  const staleMessage=retry.onmessage; const rotated=FakeWS.abertos.at(-1); assert.notEqual(rotated,retry); rotated.open(); await clock.avancar(0); assert.equal(retry.readyState,3);
  const beforeStale=updateCount; staleMessage({data:JSON.stringify({tipo:'atualizar',seq:999})}); await clock.avancar(200); assert.equal(updateCount,beforeStale,'old socket must be ignored after rotation');
  const timerCount=clock.quantidade; client.parar(); const afterStop=FakeWS.abertos.length; await clock.avancar(300000);
  assert.equal(FakeWS.abertos.length,afterStop); assert.equal(client.conectado(),false); assert.equal(clock.quantidade,0); assert.ok(timerCount>0);
  client.iniciar(); await flush(); assert.ok(FakeWS.abertos.length>afterStop,'start after stop reopens'); client.parar();

  // Without WebSocket the module refreshes only when asked; the host owns polling.
  clock=ambiente(); global.WebSocket=undefined; let polls=0, active=true;
  client=criar({conta:()=> 'fallback',ativo:()=>active,canais:()=>['whatsapp1'],pedirTickets:ticketProvider,atualizar:async()=>{polls++;}});
  client.iniciar(); await clock.avancar(0); assert.equal(client.conectado(),false); const beforePoll=polls;
  const syncFallback=client.sincronizar(); await clock.avancar(0); await syncFallback; assert.equal(polls,beforePoll+1);
  document.visibilityState='hidden'; document.fire('visibilitychange'); await clock.avancar(60000); assert.equal(polls,beforePoll+1,'hidden state must pause sockets and sync timers');
  document.visibilityState='visible'; document.fire('visibilitychange'); await clock.avancar(0); assert.equal(polls,beforePoll+2,'visible state resumes synchronization');
  active=false; document.fire('visibilitychange'); await client.sincronizar(); assert.equal(client.conectado(),false); client.parar(); assert.equal(clock.quantidade,0);

  // Server/URL credential errors fail closed without a duplicate polling loop.
  clock=ambiente(); let safePoll=0;
  client=criar({conta:()=> 'bad',ativo:()=>true,canais:()=>['whatsapp1'],pedirTickets:async()=>({ok:true,socketUrl:'wss://x.example/s?ticket=token123456',tickets:[{canal:'whatsapp1',token:'token123456'}]}),atualizar:async()=>{safePoll++;}});
  client.iniciar(); await clock.avancar(0); assert.equal(FakeWS.abertos.length,0); const failedPolls=safePoll;
  const safeSync=client.sincronizar(); await clock.avancar(0); await safeSync; assert.equal(safePoll,failedPolls+1); client.parar();
  console.log('mensagens_eventos_cliente: ok');
})().catch(e=>{console.error(e);process.exitCode=1;});
