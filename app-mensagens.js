/* App Android de atendimento. Não modifica o comportamento do site normal. */
(function(){
 'use strict';
 if(new URLSearchParams(location.search).get('app')!=='mensagens')return;
 document.documentElement.classList.add('tk-app-mensagens');
 // A Activity já desconta as barras do Android na WebView. Não reservar a mesma área novamente.
 if(window.TKAndroid&&typeof TKAndroid.versao==='function')document.documentElement.classList.add('tk-app-nativo');
 let notificationConversation=0,notificationPeek=false,notificationGeneration=0,lastNativeRequest='';
 window.TKMobileOpenConversation=function(id,peek,request){
  if(request && String(request)===lastNativeRequest)return true;
  if(request)lastNativeRequest=String(request);
  notificationGeneration++;notificationPeek=peek===true;notificationConversation=Number(id)||0;deliverConversation();return true;
 };
 function deliverConversation(){if(notificationConversation&&window.TKMensagensApp&&abriu){const id=notificationConversation;notificationConversation=0;window.TKMensagensApp.abrirConversa(id,notificationPeek);}}
 window.addEventListener('tk:mensagens-lista',()=>{notificationConversation=0;notificationGeneration++;try{if(window.TKAndroid&&typeof TKAndroid.lista==='function')TKAndroid.lista();}catch(_){}});
 let last='',lastAt=0,subscription='',previous=null,abriu=false;
 const status=document.createElement('p');status.id='mobile-push-status';status.setAttribute('role','status');
 const css=document.createElement('style');css.textContent='.tk-app-mensagens header,.tk-app-mensagens .nav-inferior,.tk-app-mensagens .tk-nav,.tk-app-mensagens .tk-app-views,.tk-app-mensagens main{display:none!important}.tk-app-mensagens body{padding:0!important}.tk-app-mensagens #overlay-mensagens{padding:0!important;background:var(--cinza);align-items:stretch}.tk-app-mensagens .sheet-mensagens{width:100%!important;height:var(--ms-h,100dvh)!important;max-height:var(--ms-h,100dvh)!important;max-width:none!important;border-radius:0!important;margin:0!important}.tk-app-mensagens #ms-fechar{display:none}.tk-app-nativo .sheet-mensagens{--ms-safe-bottom:0px}.tk-app-mensagens #mobile-push-status{position:fixed;bottom:0;left:0;right:0;z-index:10002;padding:8px 12px;margin:0;background:#fff4d9;color:#664200;font:12px/1.4 Inter,Arial,sans-serif}.tk-app-mensagens #mobile-push-status:empty{display:none}.tk-app-mensagens body:has(#mobile-push-status:not(:empty)) .sheet-mensagens{height:calc(var(--ms-h,100dvh) - var(--mobile-notice-h,48px))!important;max-height:calc(var(--ms-h,100dvh) - var(--mobile-notice-h,48px))!important}';document.head.appendChild(css);document.body.appendChild(status);new ResizeObserver(()=>document.documentElement.style.setProperty('--mobile-notice-h',status.offsetHeight+'px')).observe(status);
 async function register(id,allowed){
   const s=typeof getSessao==='function'?getSessao():null;if(!s||!id)return;
   const key=id+'|'+s.sessao+'|'+allowed;if(key===last&&Date.now()-lastAt<3600000)return;
   try{const r=await fetch(INSTAGRAM_URL+'/msg/mobile/subscription',{method:allowed?'POST':'DELETE',headers:{'Content-Type':'application/json','X-TK-Whats':s.whatsapp,'X-TK-Sessao':s.sessao},body:JSON.stringify({subscription:id})}),j=await r.json();if(!j.ok){status.textContent=j.erro||'Não foi possível ativar avisos. Abra novamente o app.';return;}last=key;lastAt=Date.now();previous=s;status.textContent=!allowed?'Avisos desativados neste aparelho. Use Avisos para ativar.':!j.servidorConfigurado?'Notificações Android aguardam configuração no servidor. As conversas continuam disponíveis.':'';}catch(_){status.textContent='Sem conexão para registrar avisos. Tentaremos novamente.';}
 }
 window.TKMobileSubscription=function(id,allowed){subscription=id;if(!id){status.textContent='Use Avisos para ativar notificações. Se já ativou, falta configurar Android no OneSignal.';return;}register(id,allowed);};
 window.TKMobileLogout=async function(){window.dispatchEvent(new Event('tk:mensagens-sair'));try{const s=previous||(typeof getSessao==='function'&&getSessao());if(s&&subscription)await fetch(INSTAGRAM_URL+'/msg/mobile/subscription',{method:'DELETE',headers:{'Content-Type':'application/json','X-TK-Whats':s.whatsapp,'X-TK-Sessao':s.sessao},body:JSON.stringify({subscription})});}finally{localStorage.removeItem('tm_session');window.dispatchEvent(new Event('tk:mensagens-sair'));sessionStorage.clear();location.reload();}};
 function open(){const ov=document.getElementById('overlay-mensagens');if(abriu&&ov&&ov.classList.contains('aberto'))return;if(abriu&&ov)abriu=false;try{if(typeof usuarioAdmin!=='undefined'&&usuarioAdmin){if(typeof temPermissao==='function'&&(window.TKMensagensAcessos?TKMensagensAcessos.pode('acessar'):temPermissao(usuarioAdmin,'gerir_acessos'))){const b=document.getElementById('btn-abrir-mensagens');if(b){abriu=true;b.click();setTimeout(deliverConversation,500);}}else{status.textContent='Sua conta não tem acesso ao módulo Mensagens. Entre com uma conta autorizada.';}}}catch(_){} }
 window.TKMobileBack=function(){
  if(window.TKMensagensApp&&TKMensagensApp.voltar&&TKMensagensApp.voltar())return true;
  const app=document.getElementById('ms-app'),v=document.querySelector('#ms-app .ms-voltar');
  if(app&&app.dataset.vista==='conversa'&&v){v.click();return true;}
  if(window.TKCamadas&&TKCamadas.total()>1){history.back();return true;}return false;
 };

 window.addEventListener('tk:mensagens-acessos',open);window.addEventListener('tk:sessao',open);const timer=setInterval(open,400);window.addEventListener('pagehide',()=>clearInterval(timer));open();
})();
