/* Permissões das ferramentas de atendimento, confirmadas no servidor por sessão. */
(function(){
 'use strict';
 let key='',rights={},pending=null;
 /* 26/11/2026 (Espiar lento): os direitos da última conferência ficam guardados no aparelho, por sessão, e valem na hora ao abrir;
    o servidor confere de novo em seguida e em todo pedido (a guarda só agiliza a tela, não libera nada no servidor). */
 const GUARDA='tk_msg_direitos_v1';
 function guardados(atual){try{const x=JSON.parse(localStorage.getItem(GUARDA)||'null');return x&&x.k===atual&&x.d&&typeof x.d==='object'?x.d:null;}catch(_){return null;}}
 function guardar(atual,d){try{if(d&&Object.keys(d).length)localStorage.setItem(GUARDA,JSON.stringify({k:atual,d}));else localStorage.removeItem(GUARDA);}catch(_){}}
 function session(){return typeof getSessao==='function'?getSessao():null;}
 function admin(){try{return typeof usuarioAdmin!=='undefined'&&temPermissao(usuarioAdmin,'gerir_acessos');}catch(_){return false;}}
 function pode(k){const s=session();if(s&&key!==s.whatsapp+'|'+s.sessao){const g=guardados(s.whatsapp+'|'+s.sessao);if(g){key=s.whatsapp+'|'+s.sessao;rights=g;}}return !!s&&(admin()||(key===s.whatsapp+'|'+s.sessao&&rights[k]===true));}
 async function atualizar(){
  const s=session();if(!s)return;const atual=s.whatsapp+'|'+s.sessao;
  if(pending&&key===atual)return pending;
  if(key!==atual){rights=guardados(atual)||{};key=atual;}
  pending=(async()=>{try{const r=await fetch(INSTAGRAM_URL+'/msg/acesso',{headers:{'X-TK-Whats':s.whatsapp,'X-TK-Sessao':s.sessao},cache:'no-store'});const j=await r.json();if(key===atual){rights=r.ok&&j.ok?j.direitos:{};if(r.ok)guardar(atual,rights);}}catch(_){/* sem rede: mantém o que já valia (o servidor recusa o que não for permitido) */}finally{pending=null;document.body.classList.toggle('tem-mensagens',pode('acessar'));const b=document.getElementById('btn-abrir-mensagens');if(b)b.hidden=!pode('acessar');window.dispatchEvent(new Event('tk:mensagens-acessos'));}})();return pending;
 }
 window.TKMensagensAcessos={pode,atualizar};
 window.addEventListener('tk:sessao',atualizar);window.addEventListener('tk:mensagens-sair',()=>{key='';rights={};try{localStorage.removeItem(GUARDA);}catch(_){}});
 setTimeout(atualizar,0);setInterval(()=>{if(!document.hidden)atualizar();},60000);
})();
