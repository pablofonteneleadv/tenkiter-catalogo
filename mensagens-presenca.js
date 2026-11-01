/* Sinais de uso do Mensageiro: nunca captura texto, teclas ou conteúdo de clientes. */
(function(g){
 'use strict';let interacao=0,digitacao=0,seq=0;const fonte='web_'+crypto.randomUUID();
 const aberta=()=>!!document.querySelector('#overlay-mensagens.aberto');
 const visivel=()=>aberta()&&!document.hidden&&document.hasFocus()&&(!g.TKAndroid?.telaMensagensVisivel||TKAndroid.telaMensagensVisivel());
 const dentro=e=>e.target instanceof Element&&!!e.target.closest('#overlay-mensagens,#tk-gestor');
 for(const evento of ['pointerdown','keydown','input','wheel','touchmove'])document.addEventListener(evento,e=>{if(!e.isTrusted||!dentro(e))return;interacao=Date.now();if(evento==='input'&&e.target.id==='ms-texto')digitacao=Date.now();},{capture:true,passive:true});
 function sinal(conversa,espiar){const agora=Date.now(),ativo=agora-interacao<120000;let estado=!visivel()?'oculto':!ativo?'ausente':conversa&&!document.getElementById('tk-gestor')&&!document.getElementById('ms-gaveta')?(agora-digitacao<30000&&document.activeElement?.id==='ms-texto'?'redigindo':'lendo'):'navegando';return {fonte,seq:++seq,estado,conversa:conversa||0,espiar:!!espiar};}
 g.TKPresenca=Object.freeze({sinal});
})(window);
