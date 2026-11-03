/* Entrada única para Fotos com IA. O espaço de trabalho vive em fotos-ia.html. */
(function(){
  'use strict';
  function podeUsar(){try{return typeof usuarioAdmin!=='undefined'&&usuarioAdmin&&(temPermissao(usuarioAdmin,'catalogo_cadastrar')||temPermissao(usuarioAdmin,'gerir_acessos'))}catch(e){return false}}
  function abrir(){if(!podeUsar()){alert('Entre com uma conta que possa cadastrar peças.');return}const origem=new URLSearchParams(location.search).get('app')==='mensagens'?'mensagens':'gestao';location.assign('fotos-ia.html?origem='+origem)}
  function ligar(){const b=document.getElementById('btn-abrir-fotoia');if(!b)return;b.hidden=!podeUsar();if(b.tagName==='A'){b.href='fotos-ia.html?origem='+(new URLSearchParams(location.search).get('app')==='mensagens'?'mensagens':'gestao');return}if(!b.dataset.fotoiaLigado){b.dataset.fotoiaLigado='1';b.addEventListener('click',abrir)}}
  window.tkFotoIA={abrir};document.addEventListener('DOMContentLoaded',ligar);ligar();setInterval(ligar,1000);
})();
