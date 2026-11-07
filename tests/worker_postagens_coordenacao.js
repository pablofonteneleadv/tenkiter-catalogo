/* Coordenação do ciclo de envio e reagendamento; nenhum serviço real. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
  const eventos=[];let liberar;
  globalThis.__processar=async()=>{eventos.push('envio-iniciou');await new Promise(r=>liberar=r);eventos.push('envio-confirmou');return {feitas:1,continuar:true};};
  globalThis.__inserir=async(env,ps,t,J)=>{eventos.push('reagendou');if(ps[0].falha)throw Error('Conflito simulado');return J({ok:true,ids:ps.map(p=>p.id),quando:t});};
  const fonte=fs.readFileSync(path.join(__dirname,'../instagram-worker/postagens-sequencia.js'),'utf8')
    .replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}")
    .replace("import { processarPostagens, inserirMidiaAntesLocal_ } from './worker.js';","const processarPostagens=(...a)=>globalThis.__processar(...a),inserirMidiaAntesLocal_=(...a)=>globalThis.__inserir(...a);");
  const tmp=path.join(os.tmpdir(),'tk-coordenacao.mjs');fs.writeFileSync(tmp,fonte);const {PostagensSequenciais}=await import(require('node:url').pathToFileURL(tmp).href);
  let alarme=null;const d=new PostagensSequenciais({storage:{getAlarm:async()=>alarme,setAlarm:async n=>alarme=n}},{});
  const ciclo=d.alarm();await new Promise(r=>setImmediate(r));
  const reagendamento=d.reorganizarMidias({ps:[{id:7}],desejado:123});await new Promise(r=>setImmediate(r));
  assert.deepEqual(eventos,['envio-iniciou'],'Não reorganizar enquanto o cron usa o retrato anterior');
  liberar();await ciclo;const r=await reagendamento;assert.deepEqual(eventos,['envio-iniciou','envio-confirmou','reagendou']);assert.deepEqual(r.body.ids,[7]);assert.equal(r.status,200);assert(alarme>Date.now());
  await assert.rejects(d.reorganizarMidias({ps:[{id:8,falha:true}],desejado:124}));
  assert.equal((await d.reorganizarMidias({ps:[{id:9}],desejado:125})).body.ok,true,'Um conflito não envenena a fila de operações');
  console.log('OK coordenação: envio anterior termina antes do plano; RPC conserva resposta e conflito não bloqueia operações futuras.');
})().catch(e=>{console.error(e);process.exitCode=1;});
