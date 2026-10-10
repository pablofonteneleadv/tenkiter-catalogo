/* ====================================================================
 * TENKiTER — pwa.js (v3.3) — app instalável + catálogo que abre sem internet
 *  1. registra o service worker (o mesmo arquivo do OneSignal: OneSignalSDKWorker.js — só pode haver um por endereço);
 *  2. mostra o botão "Instalar o app" no rodapé quando o navegador permite (Android/Chrome) ou a dica no iPhone.
 * Não pede permissão nenhuma e não muda nada para quem não quiser instalar.
 * ==================================================================== */
(function () {
  'use strict';

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      setTimeout(function () {
        navigator.serviceWorker.getRegistration('/').then(function (reg) {
          // se o OneSignal já registrou, ele é o mesmo arquivo: não registra de novo (evita trocar o worker à toa)
          if (!reg) return navigator.serviceWorker.register('/OneSignalSDKWorker.js', { scope: '/' });
        }).catch(function () { /* sem service worker o site funciona igual, só não abre offline */ });
      }, 2500);
    });
  }

  var btn = document.getElementById('btn-instalar');
  if (!btn) return;
  var jaInstalado = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (jaInstalado) return;
  var evento = null;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); evento = e; btn.hidden = false;
  });
  window.addEventListener('appinstalled', function () { btn.hidden = true; evento = null; });
  if (ios) btn.hidden = false;
  btn.addEventListener('click', function () {
    if (evento) {
      evento.prompt();
      evento.userChoice.then(function () { evento = null; btn.hidden = true; });
    } else if (ios) {
      alert('No iPhone: toque no botão Compartilhar do Safari e depois em “Adicionar à Tela de Início”.');
    }
  });
})();
