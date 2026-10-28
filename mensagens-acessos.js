/* Permissões das ferramentas de atendimento, confirmadas no servidor por sessão. */
(function(){
 'use strict';
 let key='',rights={},pending=null;
 function session(){return typeof getSessao==='function'?getSessao():null;}
 function admin(){try{return typeof usuarioAdmin!=='undefined'&&temPermissao(usuarioAdmin,'gerir_acessos');}catch(_){return false;}}
 function pode(k){const s=session();return !!s&&(admin()||(key===s.whatsapp+'|'+s.sessao&&rights[k]===true));}
 async function atualizar(){
  const s=session();if(!s)return;const atual=s.whatsapp+'|'+s.sessao;
  if(pending&&key===atual)return pending;
  if(key!==atual){rights={};key=atual;}
  pending=(async()=>{try{const r=await fetch(INSTAGRAM_URL+'/msg/acesso',{headers:{'X-TK-Whats':s.whatsapp,'X-TK-Sessao':s.sessao},cache:'no-store'});const j=await r.json();if(key===atual)rights=r.ok&&j.ok?j.direitos:{};}catch(_){if(key===atual)rights={};}finally{pending=null;document.body.classList.toggle('tem-mensagens',pode('acessar'));const b=document.getElementById('btn-abrir-mensagens');if(b)b.hidden=!pode('acessar');window.dispatchEvent(new Event('tk:mensagens-acessos'));}})();return pending;
 }
 window.TKMensagensAcessos={pode,atualizar};
 window.addEventListener('tk:sessao',atualizar);window.addEventListener('tk:mensagens-sair',()=>{key='';rights={};});
 setTimeout(atualizar,300);setInterval(()=>{if(!document.hidden)atualizar();},60000);
})();
