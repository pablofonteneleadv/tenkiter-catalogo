/* Relógio do acompanhamento: só tempo útil; não toca banco nem envia mensagens. */
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
const tmp=path.join(os.tmpdir(),'tk-expediente-acompanhamento.mjs');fs.writeFileSync(tmp,fs.readFileSync(path.join(__dirname,'../instagram-worker/worker.js')));const W=await import(tmp);
const somar=(data,min,cfg,feriados)=>W.somarMinutosUteis_(Date.parse(data+'-03:00'),min,cfg,feriados);
assert.equal(somar('2026-10-29T17:00:00',120),'2026-10-30T11:30:00.000Z','17h + duas úteis termina8h30 seguinte');
assert.equal(somar('2026-10-29T08:00:00',120),'2026-10-29T13:00:00.000Z');
assert.equal(somar('2026-10-29T19:00:00',120),'2026-10-30T12:30:00.000Z','Noite começa7h30');
assert.equal(somar('2026-10-31T13:00:00',120),'2026-11-02T11:30:00.000Z','Sábado atravessa domingo');
assert.equal(somar('2026-11-01T10:00:00',120),'2026-11-02T12:30:00.000Z','Domingo fechado');
assert.equal(somar('2026-10-29T16:00:00',120),'2026-10-30T10:30:00.000Z','Fim exato fora da faixa espera abertura');
const cfg={semana:{0:[],1:[[450,720],[780,1080]],2:[[450,1080]],3:[[450,1080]],4:[[450,1080]],5:[[450,1080]],6:[[450,840]]},excecoes:{'2026-10-30':[]}};
assert.equal(somar('2026-10-29T17:00:00',120,cfg),'2026-10-31T11:30:00.000Z','Exceção fechada');
assert.equal(somar('2026-11-02T11:00:00',120,cfg),'2026-11-02T17:00:00.000Z','Pausa de almoço não conta');
assert.equal(somar('2026-10-29T17:00:00',120,undefined,['2026-10-30']),'2026-10-30T12:00:00.000Z','Feriado legado abre8h');
assert.equal(somar('2026-10-29T17:00:00',120,cfg,['2026-10-30']),'2026-10-31T11:30:00.000Z','Exceção explícita vence feriado legado');
const fechado={semana:Object.fromEntries(Array.from({length:7},(_,i)=>[i,[]])),excecoes:{}};
assert.throws(()=>somar('2026-10-29T17:00:00',120,fechado),/Não há horário/);
assert.throws(()=>W.somarMinutosUteis_(NaN,120),/inválido/);
assert(W.validarExpediente_({...cfg,semana:{...cfg.semana,1:[[700,600]]}})[0]);
assert(W.validarExpediente_({...cfg,semana:{...cfg.semana,1:[[400,700],[600,800]]}})[0]);
assert(W.validarExpediente_({...cfg,excecoes:{'2026-02-30':[]}})[0]);
assert(W.validarExpediente_({...cfg,excecoes:{'2026-01-00':[]}})[0]);
const antes=JSON.stringify(cfg);somar('2026-10-29T17:00:00',120,cfg);assert.equal(JSON.stringify(cfg),antes);
console.log('Expediente: travessia de fechamento, fim de semana, almoço, feriado/exceção, validação e configuração imutável aprovados.');
})().catch(e=>{console.error(e);process.exitCode=1});
