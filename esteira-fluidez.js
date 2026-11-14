/* Telas em memória e uma cópia recente por sessão para retomada após recarga. */
(function(){
 'use strict';
 window.TKEsteiraFluidez=function(root,sessao){
  const vistas=new Map(),leituras=new Map(),sujas=new WeakSet();let conta='',epoca=0,ativa='',ultimoBloco=null;
  const identidade=()=>{const s=sessao()||{};return String(s.whatsapp||'')+'|'+String(s.sessao||'')};
  function conferir(){const c=identidade();if(c!==conta){conta=c;epoca++;vistas.clear();leituras.clear();root.replaceChildren();ativa=''}return epoca}
  root.addEventListener('click',e=>{ultimoBloco=e.target.closest('.card')},true);
  root.addEventListener('input',e=>{const c=e.target.closest('.card');if(c)sujas.add(c)});
  root.addEventListener('change',e=>{const c=e.target.closest('.card');if(c)sujas.add(c)});
  async function ler(rota,rede){const e=conferir(),ant=leituras.get(rota);if(ant?.promessa)return ant.promessa;if(ant?.dados&&Date.now()-ant.em<15000)return ant.dados;
   const item={dados:ant?.dados,em:ant?.em||0};item.promessa=Promise.resolve().then(rede).then(r=>{
    if(e!==conferir())return{ok:false,erro:'A sessão mudou.',sessaoMudou:true};
    if(leituras.get(rota)!==item)return ler(rota,rede);
    if(r.ok){item.dados=r;item.em=Date.now()}
    return r;
   }).finally(()=>{item.promessa=null;if(!item.dados&&leituras.get(rota)===item)leituras.delete(rota)});leituras.set(rota,item);return item.promessa;
  }
  function marcarUtil(chave){
   const marca='esteira:'+chave+':util';
   if(!performance.getEntriesByName(marca,'mark').length)performance.mark(marca);
  }
  function preparar(chave,texto){const e=conferir();let v=vistas.get(chave);if(!v){v={painel:document.createElement('div'),seq:0,pronta:false};v.painel.className='esteira-vista';vistas.set(chave,v)}ativa=chave;root.dataset.tela=chave;if(!root.contains(v.painel))root.replaceChildren(v.painel);if(!v.pronta&&!v.painel.querySelector('#hoje-resumo-abertura')){v.painel.textContent='';const p=document.createElement('div');p.className='card';p.textContent=texto;v.painel.append(p)}else marcarUtil(chave);
   const seq=++v.seq,stage=document.createElement('div'),ctx={v,e,seq,chave,stage,terminou:false,erro:'',tentar:null};
   ctx.valida=()=>e===conferir()&&seq===v.seq;
   ctx.app=new Proxy(stage,{get(t,k){const alvo=ctx.terminou?v.painel:stage,val=Reflect.get(alvo,k,alvo);return typeof val==='function'?val.bind(alvo):val},set(t,k,val){const alvo=ctx.terminou?v.painel:stage;return Reflect.set(alvo,k,val,alvo)}});
   return ctx;
  }
  const assinatura=e=>e.outerHTML+'|'+JSON.stringify([...e.querySelectorAll('input,textarea,select')].map(x=>[x.id,x.value,x.checked]));
  function concluir(ctx){if(!ctx.valida())return;const v=ctx.v,painel=v.painel;ctx.terminou=true;
   if(ctx.erro){if(v.pronta){let p=painel.querySelector('.esteira-atualizacao');if(!p){p=document.createElement('p');p.className='esteira-atualizacao dica';p.setAttribute('role','status');painel.prepend(p)}p.textContent='Não consegui atualizar. As informações anteriores continuam visíveis. '+ctx.erro;return}const c=document.createElement('div');c.className='card';c.textContent=ctx.erro;const b=document.createElement('button');b.type='button';b.className='bt prim';b.textContent='Tentar de novo';b.onclick=ctx.tentar;c.append(b);painel.replaceChildren(c);return}
   let adiados=0;const antigos=[...painel.children].filter(x=>!x.classList.contains('esteira-atualizacao')),novos=[...ctx.stage.children],usar=[],foco=document.activeElement,editando=foco?.matches('input,textarea,select,[contenteditable=true]');
   novos.forEach((n,i)=>{const a=n.id?antigos.find(x=>x.id===n.id):antigos[i]?.id?null:antigos[i];const igual=a&&assinatura(a)===assinatura(n),protegido=a&&((editando&&a.contains(foco))||sujas.has(a)||a.querySelector('.cx-sel[aria-pressed=true]'));if(a&&!igual&&protegido)adiados++;usar.push(a&&(igual||protegido)?a:n)});
   let ref=painel.firstChild;usar.forEach(n=>{if(n===ref)ref=ref.nextSibling;else painel.insertBefore(n,ref)});const manter=new Set(usar);[...painel.childNodes].forEach(n=>{if(!manter.has(n))n.remove()});if(adiados){const p=document.createElement('p');p.className='esteira-atualizacao dica';p.setAttribute('role','status');p.textContent='Há dados novos no bloco em edição. Suas alterações foram mantidas; conclua a edição para atualizar esse bloco.';painel.append(p)}v.pronta=true;
   if(ativa===ctx.chave)marcarUtil(ctx.chave);
  }
  function liberar(bloco){if(bloco)sujas.delete(bloco)}
  function invalidar(bloco,rotas){
   conferir();
   if(rotas){for(const rota of leituras.keys())if(rotas.has(rota.split('?')[0]))leituras.delete(rota)}
   else leituras.clear();
   liberar(bloco);
  }
  return{ler,preparar,concluir,invalidar,liberar,
   semRede(chave, texto) {
    const v=vistas.get(chave);
    if (!v?.pronta || !v.painel.isConnected) return;
    let p=v.painel.querySelector('.esteira-atualizacao');
    if (texto && !p) {p=document.createElement('p');p.className='esteira-atualizacao dica';p.setAttribute('role','status');v.painel.prepend(p);}
    if (p && texto) {p.dataset.falhaRede='1';p.textContent=texto;}
    else if (p?.dataset.falhaRede) p.remove();
   },
   pronta(chave){return vistas.get(chave)?.pronta===true;},
   expirar(){for(const item of leituras.values())item.em=0},alvo:()=>ultimoBloco,ativa:()=>ativa,visivel:()=>!!vistas.get(ativa)&&root.contains(vistas.get(ativa).painel),limpar(){conta='';conferir()}};
 };

 // A cópia nunca autoriza acesso. Só o chamador, após confirmação do servidor,
 // pode entregá-la aos renderizadores. Nenhum token ou HTML entra neste banco.
 window.TKEsteiraRetomada=function(){
  const loja='telas', maxIdade=20*60*1000, chaveAba='tk-esteira-ultima-aba-v1';
  let banco;
  const abrir=()=>banco||=(new Promise((ok,erro)=>{
   const req=indexedDB.open('tk-esteira-retomada-v1',1);
   req.onupgradeneeded=()=>req.result.createObjectStore(loja);
   req.onsuccess=()=>ok(req.result);
   req.onerror=req.onblocked=()=>erro(req.error);
  })).catch(e=>{banco=null;throw e;});
  async function transacao(modo,operar){
   try {
    const db=await abrir();
    return await new Promise((ok,erro)=>{
     const tx=db.transaction(loja,modo), req=operar(tx.objectStore(loja));
     tx.oncomplete=()=>ok(req?.result??null);
     tx.onerror=tx.onabort=()=>erro(tx.error);
    });
   } catch (_) {return null;}
  }
  async function chave(s){
   try {
    if(!s?.whatsapp||!s?.sessao)return '';
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s.whatsapp+'|'+s.sessao));
    return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
   } catch (_) {return '';}
  }
  function dica(k) {
   try {
    const item = JSON.parse(localStorage.getItem(chaveAba));
    return item?.chave === k ? item : null;
   } catch (_) {return null;}
  }
  async function ultimaAba(s) {
   const k = await chave(s), item = k && dica(k);
   return item?.em > Date.now()-maxIdade ? item : null;
  }
  async function ler(s){
   const k=await chave(s);
   if (!k) return null;
   const item=await transacao('readonly',st=>st.get(k));
   return item?.em>Date.now()-maxIdade?item:null;
  }
  async function gravar(s, item, valida){
   const k=await chave(s);
   if (!k || !valida()) return;
   // Apenas o identificador derivado e a aba ficam fora do IndexedDB.
   // Isso permite validar a sessão enquanto o banco está abrindo.
   try {localStorage.setItem(chaveAba, JSON.stringify({chave:k, aba:item.aba, em:item.em, filtro:item.filtro}));} catch (_) {}
   await transacao('readwrite',st=>{
    if (!valida()) return;
    st.put(item,k);
    const cursor=st.openCursor();
    cursor.onsuccess=()=>{
     const c=cursor.result;
     if (!c) return;
     if(c.key!==k && c.value?.em<=Date.now()-maxIdade)c.delete();
     c.continue();
    };
   });
  }
  async function limpar(s){
   const k=await chave(s);
   if (!k) return;
   try {if (dica(k)) localStorage.removeItem(chaveAba);} catch (_) {}
   await transacao('readwrite',st=>st.delete(k));
  }
  return {ler,gravar,limpar,ultimaAba};
 };
})();
