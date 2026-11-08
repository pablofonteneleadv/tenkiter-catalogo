/* Entrada única para Fotos com IA. O espaço de trabalho vive em fotos-ia.html. */
(function(){
  'use strict';
  function podeUsar(){try{return typeof usuarioAdmin!=='undefined'&&usuarioAdmin&&(temPermissao(usuarioAdmin,'catalogo_cadastrar')||temPermissao(usuarioAdmin,'gerir_acessos'))}catch(e){return false}}
  function abrir(ids){if(!podeUsar()){TKAviso.aviso('Entre com uma conta que possa cadastrar produtos.');return}const origem=new URLSearchParams(location.search).get('app')==='mensagens'?'mensagens':'gestao';const url=new URL('fotos-ia.html',location.href);url.searchParams.set('origem',origem);if(Array.isArray(ids)&&ids.length){ids.forEach(id=>url.searchParams.append('peca',String(id)));url.searchParams.set('entrada',crypto.randomUUID());}location.assign(url.href)}
  function ligar(){const b=document.getElementById('btn-abrir-fotoia');const lote=document.getElementById('btn-bulk-fotoia');if(lote)lote.hidden=!podeUsar();if(!b)return;b.hidden=!podeUsar();if(b.tagName==='A'){b.href='fotos-ia.html?origem='+(new URLSearchParams(location.search).get('app')==='mensagens'?'mensagens':'gestao');return}if(!b.dataset.fotoiaLigado){b.dataset.fotoiaLigado='1';b.addEventListener('click',abrir)}}
  window.tkFotoIA={abrir};document.addEventListener('DOMContentLoaded',ligar);ligar();setInterval(ligar,1000);
})();
