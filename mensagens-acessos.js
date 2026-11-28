/* Direitos de atendimento: conferência por sessão, sem autorização por cache antigo. */
(function(){
 'use strict';
 let key='',rights={},pending=null,negada='',conferida='',geracao=0;
 const GUARDA='tk_msg_direitos_v1';
 const session=()=>typeof getSessao==='function'?getSessao():null;
 const identidade=()=>{const s=session();return s?s.whatsapp+'|'+s.sessao:'';};
 function guardar(d){try{if(d&&Object.keys(d).length)localStorage.setItem(GUARDA,JSON.stringify({k:key,d}));else localStorage.removeItem(GUARDA);}catch(_){}}
 function admin(){try{const s=session();return !!s&&typeof usuarioAdmin!=='undefined'&&String(usuarioAdmin?.whatsapp||'').replace(/\D/g,'')===String(s.whatsapp).replace(/\D/g,'')&&temPermissao(usuarioAdmin,'gerir_acessos');}catch(_){return false;}}
 function pode(k){const atual=identidade();return !!atual&&negada!==atual&&(admin()||(key===atual&&rights[k]===true));}
 function conferido(){const atual=identidade();return !!atual&&conferida===atual;}
 function emitir(){document.body.classList.toggle('tem-mensagens',pode('acessar'));const b=document.getElementById('btn-abrir-mensagens');if(b)b.hidden=!pode('acessar');window.dispatchEvent(new Event('tk:mensagens-acessos'));}
 function invalidar(){geracao++;pending=null;key=identidade();rights={};negada=key;conferida=key;guardar(null);emitir();}
 async function atualizar(){
  const s=session(),atual=identidade();
  if(!s){geracao++;pending=null;key='';rights={};conferida='';negada='';guardar(null);emitir();return;}
  if(pending&&key===atual)return pending;
  if(key!==atual){geracao++;key=atual;rights={};conferida='';negada='';}
  const gen=geracao;
  const vigente=()=>gen===geracao&&key===atual&&identidade()===atual;
  pending=(async()=>{
   try{
    const r=await fetch(INSTAGRAM_URL+'/msg/acesso',{headers:{'X-TK-Whats':s.whatsapp,'X-TK-Sessao':s.sessao},cache:'no-store'}),j=await r.json();
    if(vigente()){rights=r.ok&&j.ok&&j.direitos?j.direitos:{};negada=rights.acessar===true?'':atual;conferida=atual;guardar(rights);}
   }catch(_){/* falha de rede não inventa concessão nem revogação */}
   finally{if(vigente()){pending=null;emitir();}}
  })();return pending;
 }
 window.TKMensagensAcessos={pode,atualizar,invalidar,conferido};
 window.addEventListener('tk:sessao',atualizar);
 window.addEventListener('tk:mensagens-sair',()=>{geracao++;pending=null;key='';rights={};conferida='';negada='';guardar(null);emitir();});
 setTimeout(atualizar,0);setInterval(()=>{if(!document.hidden)atualizar();},60000);
})();
