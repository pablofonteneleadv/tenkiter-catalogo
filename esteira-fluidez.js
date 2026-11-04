/* Leituras e painéis em memória, isolados por sessão; nenhuma escrita em cache. */
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
   const item={dados:ant?.dados,em:ant?.em||0};item.promessa=Promise.resolve().then(rede).then(r=>{if(e===epoca&&r.ok){item.dados=r;item.em=Date.now()}else if(e!==epoca)return{ok:false,erro:'A sessão mudou.',sessaoMudou:true};return r}).finally(()=>{item.promessa=null;if(!item.dados&&leituras.get(rota)===item)leituras.delete(rota)});leituras.set(rota,item);return item.promessa;
  }
  function preparar(chave,texto){const e=conferir();let v=vistas.get(chave);if(!v){v={painel:document.createElement('div'),seq:0,pronta:false};v.painel.className='esteira-vista';vistas.set(chave,v)}ativa=chave;root.dataset.tela=chave;if(!root.contains(v.painel))root.replaceChildren(v.painel);if(!v.pronta){v.painel.textContent='';const p=document.createElement('div');p.className='card';p.textContent=texto;v.painel.append(p)}
   const seq=++v.seq,stage=document.createElement('div'),ctx={v,e,seq,chave,stage,terminou:false,erro:'',tentar:null};
   ctx.valida=()=>e===conferir()&&seq===v.seq;
   ctx.app=new Proxy(stage,{get(t,k){const alvo=ctx.terminou?v.painel:stage,val=Reflect.get(alvo,k,alvo);return typeof val==='function'?val.bind(alvo):val},set(t,k,val){const alvo=ctx.terminou?v.painel:stage;return Reflect.set(alvo,k,val,alvo)}});
   return ctx;
  }
  const assinatura=e=>e.outerHTML+'|'+JSON.stringify([...e.querySelectorAll('input,textarea,select')].map(x=>[x.id,x.value,x.checked]));
  function concluir(ctx){if(!ctx.valida())return;const v=ctx.v,painel=v.painel;ctx.terminou=true;
   if(ctx.erro){if(v.pronta){let p=painel.querySelector('.esteira-atualizacao');if(!p){p=document.createElement('p');p.className='esteira-atualizacao dica';p.setAttribute('role','status');painel.prepend(p)}p.textContent='Não consegui atualizar. As informações anteriores continuam visíveis. '+ctx.erro;return}const c=document.createElement('div');c.className='card';c.textContent=ctx.erro;const b=document.createElement('button');b.type='button';b.className='bt prim';b.textContent='Tentar de novo';b.onclick=ctx.tentar;c.append(b);painel.replaceChildren(c);return}
   let adiados=0;const antigos=[...painel.children].filter(x=>!x.classList.contains('esteira-atualizacao')),novos=[...ctx.stage.children],usar=[],foco=document.activeElement,editando=foco?.matches('input,textarea,select,[contenteditable=true]');
   novos.forEach((n,i)=>{const a=n.id?antigos.find(x=>x.id===n.id):antigos[i];const igual=a&&assinatura(a)===assinatura(n),protegido=a&&((editando&&a.contains(foco))||sujas.has(a));if(a&&!igual&&protegido)adiados++;usar.push(a&&(igual||protegido)?a:n)});
   let ref=painel.firstChild;usar.forEach(n=>{if(n===ref)ref=ref.nextSibling;else painel.insertBefore(n,ref)});const manter=new Set(usar);[...painel.childNodes].forEach(n=>{if(!manter.has(n))n.remove()});if(adiados){const p=document.createElement('p');p.className='esteira-atualizacao dica';p.setAttribute('role','status');p.textContent='Há dados novos no bloco em edição. Suas alterações foram mantidas; conclua a edição para atualizar esse bloco.';painel.append(p)}v.pronta=true;
  }
  function invalidar(bloco){conferir();leituras.clear();if(bloco)sujas.delete(bloco)}
  return{ler,preparar,concluir,invalidar,alvo:()=>ultimoBloco,ativa:()=>ativa,visivel:()=>!!vistas.get(ativa)&&root.contains(vistas.get(ativa).painel),limpar(){conta='';conferir()}};
 };
})();
