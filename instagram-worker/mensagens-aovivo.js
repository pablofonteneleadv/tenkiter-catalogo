import { DurableObject } from 'cloudflare:workers';

// Uma coordenação por canal. O socket transporta apenas invalidações, nunca dados.
export class MensagensAoVivo extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS usado (nonce TEXT PRIMARY KEY, exp INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS sequencia (id INTEGER PRIMARY KEY CHECK(id=1), n INTEGER NOT NULL)');
    this.sql.exec('INSERT OR IGNORE INTO sequencia VALUES(1,0)');
  }
  async fetch(req) {
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response(null, {status:426});
    const nonce=req.headers.get('X-TK-Evento-Nonce')||'', exp=Number(req.headers.get('X-TK-Evento-Exp'));
    if (!/^[a-f0-9]{48}$/.test(nonce)||!Number.isSafeInteger(exp)||exp<=Date.now()||exp>Date.now()+300000) return new Response(null,{status:401});
    this.sql.exec('DELETE FROM usado WHERE exp<=?',Date.now());
    if (this.sql.exec('SELECT nonce FROM usado WHERE nonce=?',nonce).toArray().length) return new Response(null,{status:409});
    if(this.ctx.getWebSockets().length>=1000)return new Response(null,{status:503});
    this.sql.exec('INSERT INTO usado VALUES(?,?)',nonce,exp);
    const pair=new WebSocketPair(), [cliente,servidor]=Object.values(pair);
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment({exp});
    servidor.send(JSON.stringify({tipo:'atualizar',seq:this.sql.exec('SELECT n FROM sequencia WHERE id=1').one().n}));
    await this.agendarExpiracao();
    return new Response(null,{status:101,webSocket:cliente,headers:{'Sec-WebSocket-Protocol':'tk-msg','Cache-Control':'no-store'}});
  }
  async agendarExpiracao() {
    const exp=this.sql.exec('SELECT min(exp) AS exp FROM usado').one().exp;
    if(exp)await this.ctx.storage.setAlarm(exp);
  }
  async avisar() {
    const seq=this.sql.exec('UPDATE sequencia SET n=n+1 WHERE id=1 RETURNING n').one().n;
    const corpo=JSON.stringify({tipo:'atualizar',seq});
    for(const ws of this.ctx.getWebSockets()){
      try{if((ws.deserializeAttachment()?.exp||0)<=Date.now())ws.close(4001,'Renove o acesso');else ws.send(corpo);}catch(_){try{ws.close();}catch(__){}}
    }
  }
  webSocketMessage(ws, corpo) {
    if((ws.deserializeAttachment()?.exp||0)<=Date.now()){ws.close(4001,'Renove o acesso');return;}
    if(typeof corpo!=='string'||corpo.length>64){ws.close(1008,'Mensagem inválida');return;}
    try{if(JSON.parse(corpo).tipo==='ping')ws.send('{"tipo":"pong"}');else ws.close(1008,'Mensagem inválida');}catch(_){ws.close(1008,'Mensagem inválida');}
  }
  webSocketClose(ws,code){try{ws.close(code===1006?1000:code);}catch(_){}}
  webSocketError(ws){try{ws.close(1011,'Reconecte');}catch(_){}}
  async alarm(){
    for(const ws of this.ctx.getWebSockets()){try{if((ws.deserializeAttachment()?.exp||0)<=Date.now())ws.close(4001,'Renove o acesso');}catch(_){}}
    this.sql.exec('DELETE FROM usado WHERE exp<=?',Date.now());
    await this.agendarExpiracao();
  }
}
