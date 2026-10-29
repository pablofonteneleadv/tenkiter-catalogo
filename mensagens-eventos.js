/* Sincronização em tempo real do painel de Mensagens. Só solicita atualização da lista;
 * nunca cria nem envia conteúdo de conversa. Tickets existem apenas em memória e como
 * subprotocolo do WebSocket, nunca na URL, armazenamento local ou logs. */
(function(root){
  'use strict';
  const CANAIS_VALIDOS = new Set(['whatsapp1','whatsapp2','instagram']);
  const DEBOUNCE_MS = 200, HEARTBEAT_MS = 25000, PONG_MAX_MS = 55000;
  const RENOVAR_MAX_MS = 240000, ABRIR_TIMEOUT_MS = 15000;

  function criar(opcoes){
    opcoes=opcoes||{};
    const lerConta=typeof opcoes.conta==='function'?opcoes.conta:()=>'';
    const lerAtivo=typeof opcoes.ativo==='function'?opcoes.ativo:()=>false;
    const lerCanais=typeof opcoes.canais==='function'?opcoes.canais:()=>[];
    const pedirTickets=typeof opcoes.pedirTickets==='function'?opcoes.pedirTickets:async()=>({ok:false});
    const atualizar=typeof opcoes.atualizar==='function'?opcoes.atualizar:async()=>{};
    const informarEstado=typeof opcoes.estado==='function'?opcoes.estado:()=>{};

    let iniciado=false, geracao=0, identidade='', contaAtual='', canaisAtuais=[];
    let sockets=new Map(), lote=null, estadoAtual=false, dirty=false, syncRodando=false;
    let timerDebounce=0,timerHeartbeat=0,timerRenovar=0,timerReconectar=0;
    let tentativaReconexao=0, esperasSync=[], ultimaSequencia=new Map(), listenersAtivos=false;

    const doc=()=>root.document||null;
    const visivel=()=>{const d=doc();return !d||d.visibilityState!=='hidden';};
    const contaLida=()=>{try{return String(lerConta()||'').trim();}catch(_){return '';}};
    const ativoLido=()=>{try{return lerAtivo()===true;}catch(_){return false;}};
    const canaisLidos=()=>{
      let a=[];try{a=lerCanais();}catch(_){a=[];}
      if(!Array.isArray(a))return [];
      return [...new Set(a.map(String).filter(x=>CANAIS_VALIDOS.has(x)))];
    };
    const chaveIdentidade=(conta,canais,ativo)=>JSON.stringify([conta,canais,ativo]);
    const atual=(g,key)=>iniciado&&geracao===g&&identidade===key&&ativoLido()&&visivel();
    function emitirEstado(v){v=!!v;if(estadoAtual===v)return;estadoAtual=v;try{informarEstado(v);}catch(_){} }
    function todosAbertos(map=sockets){return canaisAtuais.length>0&&canaisAtuais.every(c=>{const s=map.get(c);return !!s&&s.readyState===1;});}
    function conectado(){return iniciado&&ativoLido()&&todosAbertos();}
    function resolverEsperas(v){const a=esperasSync.splice(0);for(const x of a){try{x(v);}catch(_){}}}
    function limparTimer(nome){if(!nome)return;root.clearTimeout(nome);root.clearInterval(nome);}
    function fecharLote(){
      if(!lote)return;const x=lote;lote=null;limparTimer(x.timeout);
      for(const ws of x.sockets.values()){try{ws.onopen=ws.onmessage=ws.onerror=ws.onclose=null;ws.close();}catch(_){}}
    }
    function fecharSockets(){
      const velhos=[...sockets.values()];sockets=new Map();
      for(const ws of velhos){try{ws.onopen=ws.onmessage=ws.onerror=ws.onclose=null;ws.close();}catch(_){}}
    }
    function limparTimers(){
      limparTimer(timerDebounce);limparTimer(timerHeartbeat);limparTimer(timerRenovar);
      limparTimer(timerReconectar);
      timerDebounce=timerHeartbeat=timerRenovar=timerReconectar=0;
      if(lote)fecharLote();
    }
    function suspender(){
      geracao++;limparTimers();fecharSockets();dirty=false;ultimaSequencia.clear();emitirEstado(false);resolverEsperas(false);
    }
    function lerIdentidade(){
      const conta=contaLida(),canais=canaisLidos(),ativo=ativoLido();
      return {conta,canais,ativo,key:chaveIdentidade(conta,canais,ativo)};
    }
    function atualizarIdentidade(){
      const n=lerIdentidade();
      if(n.key!==identidade){
        geracao++;identidade=n.key;contaAtual=n.conta;canaisAtuais=n.canais.slice();
        limparTimers();fecharSockets();dirty=false;ultimaSequencia.clear();tentativaReconexao=0;emitirEstado(false);resolverEsperas(false);
      } else {contaAtual=n.conta;canaisAtuais=n.canais.slice();}
      if(!n.ativo||!n.conta||!n.canais.length){
        if(sockets.size||lote||timerDebounce||timerHeartbeat||timerRenovar||timerReconectar){limparTimers();fecharSockets();emitirEstado(false);}
        return false;
      }
      if(!visivel())return false;
      return true;
    }
    function scheduleReconnect(g,key){
      if(timerReconectar||!atual(g,key)||!visivel())return;
      const ms=Math.min(30000,500*Math.pow(2,Math.min(tentativaReconexao++,6)));
      timerReconectar=root.setTimeout(()=>{timerReconectar=0;if(atual(g,key))abrirLote(g,key);},ms);
    }
    function syncEstado(){emitirEstado(todosAbertos());}
    function pararHeartbeat(){limparTimer(timerHeartbeat);timerHeartbeat=0;}
    function iniciarHeartbeat(g,key){
      pararHeartbeat();timerHeartbeat=root.setInterval(()=>{
        if(!atual(g,key))return;
        const t=Date.now();
        for(const [canal,ws] of sockets){
          if(ws.readyState!==1)continue;
          const visto=ws.__tkPongAt||ws.__tkOpenAt||t;
          if(t-visto>PONG_MAX_MS){try{ws.close();}catch(_){};continue;}
          try{ws.send(JSON.stringify({tipo:'ping'}));}catch(_){try{ws.close();}catch(__){}}
        }
      },HEARTBEAT_MS);
    }
    function scheduleRenew(g,key,ms){
      limparTimer(timerRenovar);timerRenovar=0;
      const renovar=Math.max(30000,Math.min(RENOVAR_MAX_MS,Number(ms)||RENOVAR_MAX_MS));
      timerRenovar=root.setTimeout(()=>{timerRenovar=0;if(atual(g,key))abrirLote(g,key,true);},renovar);
    }
    function validSocketUrl(url,tokens){
      try{
        const u=new URL(String(url||''));
        if(u.protocol!=='wss:'||u.username||u.password||u.search||u.hash)return false;
        const text=u.href;
        return !tokens.some(t=>t&&text.includes(t));
      }catch(_){return false;}
    }
    function ticketsPorCanal(res,canals){
      if(!res||res.ok!==true||!Array.isArray(res.tickets))return null;
      const map=new Map();
      for(const x of res.tickets){
        if(!x||!canals.includes(x.canal)||map.has(x.canal)||typeof x.token!=='string'||! /^[A-Za-z0-9._~-]{8,512}$/.test(x.token))return null;
        map.set(x.canal,x.token);
      }
      return canals.every(c=>map.has(c))?map:null;
    }
    function evento(ws,canal,g,key,data){
      const socketAtual=sockets.get(canal)===ws;
      const socketCandidato=!!lote&&lote.sockets.get(canal)===ws;
      if(!atual(g,key)||(!socketAtual&&!socketCandidato))return;
      let p;try{p=typeof data==='string'?JSON.parse(data):data;}catch(_){return;}
      if(!p||typeof p!=='object')return;
      if(p.tipo==='ping'){try{if(ws.readyState===1)ws.send(JSON.stringify({tipo:'pong'}));}catch(_){}};
      if(p.tipo==='pong'){ws.__tkPongAt=Date.now();return;}
      if(p.tipo!=='atualizar')return;
      if(Number.isSafeInteger(p.seq)){const prev=ultimaSequencia.get(canal);if(prev!==undefined&&p.seq<=prev)return;ultimaSequencia.set(canal,p.seq);}
      solicitarSync(true);
    }
    function batchFalhou(batch,g,key){
      if(lote!==batch)return;
      const tinhaAtivos=sockets.size>0&&todosAbertos(sockets);
      fecharLote();
      if(!tinhaAtivos)emitirEstado(false);
      if(atual(g,key))scheduleReconnect(g,key);
    }
    function abrirSockets(g,key,canals,url,tokens,renovarEm){
      const WS=root.WebSocket;
      if(typeof WS!=='function'){emitirEstado(false);return;}
      const b={g,key,sockets:new Map(),abertos:new Set(),timeout:0,renovarEm};lote=b;
      const falha=()=>batchFalhou(b,g,key);
      b.timeout=root.setTimeout(falha,ABRIR_TIMEOUT_MS);
      for(const canal of canals){
        let ws;
        try{ws=new WS(url,['tk-msg','tk-ticket.'+tokens.get(canal)]);}catch(_){falha();return;}
        b.sockets.set(canal,ws);ws.__tkOpenAt=Date.now();ws.__tkPongAt=Date.now();
        ws.onopen=()=>{
          if(lote!==b||!atual(g,key)){try{ws.close();}catch(_){};return;}
          b.abertos.add(canal);
          if(b.abertos.size!==canals.length)return;
          limparTimer(b.timeout);lote=null;
          const anteriores=sockets;sockets=b.sockets;tentativaReconexao=0;
          for(const old of anteriores.values()){try{old.onopen=old.onmessage=old.onerror=old.onclose=null;old.close();}catch(_){}}
          for(const [ch,sock] of sockets){
            sock.onmessage=e=>evento(sock,ch,g,key,e&&e.data);
            sock.onclose=()=>{if(sockets.get(ch)!==sock||!atual(g,key))return;emitirEstado(false);fecharSockets();pararHeartbeat();scheduleReconnect(g,key);};
            sock.onerror=()=>{if(sockets.get(ch)===sock)try{sock.close();}catch(_){}};
          }
          iniciarHeartbeat(g,key);scheduleRenew(g,key,renovarEm);syncEstado();solicitarSync(false);
        };
        ws.onmessage=e=>evento(ws,canal,g,key,e&&e.data);
        ws.onerror=()=>{if(lote===b)falha();else if(sockets.get(canal)===ws)try{ws.close();}catch(_){}};
        ws.onclose=()=>{if(lote===b)falha();else if(sockets.get(canal)===ws){emitirEstado(false);fecharSockets();pararHeartbeat();scheduleReconnect(g,key);}};
      }
    }
    async function abrirLote(g,key,rotacao=false){
      if(!atual(g,key)||lote)return;
      const WS=root.WebSocket;if(typeof WS!=='function'){emitirEstado(false);return;}
      const conta=contaAtual,canals=canaisAtuais.slice();
      try{
        const res=await pedirTickets(canals.slice());
        if(!atual(g,key)||conta!==contaAtual)return;
        const tokens=ticketsPorCanal(res,canals),url=String(res&&res.socketUrl||'');
        if(!tokens||!validSocketUrl(url,[...tokens.values()])){if(!sockets.size)emitirEstado(false);scheduleReconnect(g,key);return;}
        abrirSockets(g,key,canals,url,tokens,res.renovarEm);
      }catch(_){if(!sockets.size)emitirEstado(false);scheduleReconnect(g,key);}
    }
    function solicitarSync(debounce=true){
      dirty=true;
      const promise=new Promise(resolve=>esperasSync.push(resolve));
      if(!iniciado||!atualizarIdentidade()||!visivel()){resolverEsperas(false);return promise;}
      if(timerDebounce)limparTimer(timerDebounce);
      timerDebounce=root.setTimeout(()=>{timerDebounce=0;rodarSync();},debounce?DEBOUNCE_MS:0);
      return promise;
    }
    async function rodarSync(){
      if(syncRodando||!iniciado)return;
      if(!atualizarIdentidade()||!visivel()){dirty=true;resolverEsperas(false);return;}
      syncRodando=true;let concluiu=true;
      while(dirty&&iniciado&&ativoLido()&&visivel()){
        dirty=false;const g=geracao,key=identidade,conta=contaAtual,canals=canaisAtuais.slice();
        try{await atualizar({conta,canais:canals,generacao:g,atual:()=>atual(g,key)});}catch(_){concluiu=false;}
        if(!atual(g,key)){concluiu=false;break;}
      }
      syncRodando=false;resolverEsperas(concluiu);
      if(dirty&&iniciado&&visivel())solicitarSync(false);
    }
    function iniciar(){
      if(iniciado){atualizarIdentidade();return true;}
      iniciado=true;anexarListeners();
      const ok=atualizarIdentidade();
      if(ok){abrirLote(geracao,identidade);solicitarSync(false);}else if(!visivel())emitirEstado(false);
      return true;
    }
    function parar(){
      if(!iniciado)return;
      iniciado=false;geracao++;limparTimers();fecharSockets();dirty=false;ultimaSequencia.clear();emitirEstado(false);resolverEsperas(false);desanexarListeners();
    }
    function sincronizar(){
      if(!iniciado)return Promise.resolve(false);
      const ok=atualizarIdentidade();
      if(!ok){if(ativoLido()&&visivel())return solicitarSync(false);return Promise.resolve(false);}
      if(!todosAbertos()&&!lote&&!timerReconectar)abrirLote(geracao,identidade);
      return solicitarSync(false);
    }
    function onVisibility(){
      if(!iniciado)return;
      if(!visivel()){suspender();return;}
      if(atualizarIdentidade()){if(!todosAbertos()&&!lote&&!timerReconectar)abrirLote(geracao,identidade);solicitarSync(false);}
    }
    function onFocus(){if(!iniciado||!visivel()||!ativoLido())return;if(atualizarIdentidade()){if(!todosAbertos()&&!lote&&!timerReconectar)abrirLote(geracao,identidade);solicitarSync(false);}}
    function anexarListeners(){if(listenersAtivos)return;const d=doc();if(d&&d.addEventListener)d.addEventListener('visibilitychange',onVisibility);if(root.addEventListener)root.addEventListener('focus',onFocus);listenersAtivos=true;}
    function desanexarListeners(){if(!listenersAtivos)return;const d=doc();if(d&&d.removeEventListener)d.removeEventListener('visibilitychange',onVisibility);if(root.removeEventListener)root.removeEventListener('focus',onFocus);listenersAtivos=false;}
    return {iniciar,parar,sincronizar,conectado};
  }
  const api={criar};
  root.TKMensagensEventos=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
