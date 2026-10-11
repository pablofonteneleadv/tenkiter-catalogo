/* ====================================================================
 * TENKiTER — pwa.js (v3.4) — app instalável + catálogo que abre sem internet
 *  1. registra o service worker (o mesmo arquivo do OneSignal: OneSignalSDKWorker.js — só pode haver um por endereço);
 *  2. instalação: a seção "Instale o app" no fim da página (Android e iPhone) e o botão do rodapé:
 *     - Android/Chrome/Edge: o navegador avisa quando dá para instalar (beforeinstallprompt); o botão abre a janelinha de instalação de verdade.
 *       Sem esse aviso (outro navegador, já dispensado antes), mostra o passo a passo.
 *     - iPhone: não existe botão de instalar (a Apple não deixa o site fazer isso): o botão abre o menu Compartilhar do Safari
 *       (navigator.share) e o passo a passo fica sempre à vista.
 *     - Depois de instalar, convida a ativar os avisos (push.js) — o navegador exige que a permissão seja pedida num toque da pessoa.
 * Não pede permissão nenhuma sozinho e não muda nada para quem não quiser instalar.
 * ==================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- 1. service worker */
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

  /* ---------------------------------------------------------------- 2. instalação */
  var UA = navigator.userAgent || '';
  var iOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(UA);
  var embutido = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|musical_ly|TikTok/i.test(UA) || (android && /; wv\)/.test(UA));
  var K_INST = 'tk_app_instalado_v1';
  var evento = null;

  function standalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function lembrouInstalado() { try { return localStorage.getItem(K_INST) === '1'; } catch (e) { return false; } }
  function guardarInstalado(v) { try { if (v) localStorage.setItem(K_INST, '1'); else localStorage.removeItem(K_INST); } catch (e) {} }
  if (standalone()) guardarInstalado(true);
  if (window.TKDisp) { if (standalone()) TKDisp.registrar({ instalou: true }); TKDisp.ping(); }   // v3.5: este aparelho existe (e, se abriu como app, já está instalado)

  var $ = function (id) { return document.getElementById(id); };
  var btnRodape = $('btn-instalar');
  var secao = $('instalar-app');

  function instalado() { return standalone() || (lembrouInstalado() && !evento); }

  function msg(t) { var m = $('inst-msg'); if (m) m.textContent = t || ''; }

  function copiarEndereco() {
    var url = location.origin + '/';
    var fim = function (ok) { msg(ok ? 'Endereço copiado. Cole no Safari (ou no Chrome) para instalar.' : 'Endereço do site: ' + url); };
    try { navigator.clipboard.writeText(url).then(function () { fim(true); }, function () { fim(false); }); } catch (e) { fim(false); }
  }

  function desenhar() {
    if (btnRodape) btnRodape.hidden = !(evento && !instalado());
    if (!secao) return;

    var cAnd = $('inst-android'), cIos = $('inst-ios');
    var seuAnd = cAnd.querySelector('.inst-seu'), seuIos = cIos.querySelector('.inst-seu');
    var desktop = !android && !iOS;
    seuAnd.hidden = !android; seuIos.hidden = !iOS;
    cAnd.classList.toggle('meu', android);
    cIos.classList.toggle('meu', iOS);

    var txtAnd = $('inst-android-txt'), btnAnd = $('btn-inst-android'), passosAnd = $('inst-android-passos');
    var txtIos = $('inst-ios-txt'), btnIos = $('btn-inst-ios'), passosIos = $('inst-ios-passos');

    /* ---- Android (e computador com Chrome/Edge) */
    var jaInst = instalado();
    if (jaInst) {
      txtAnd.textContent = standalone()
        ? '✅ Você já está usando o app. Para receber avisos, use o botão abaixo.'
        : '✅ O app já está instalado neste aparelho. Abra pelo ícone TENKiTER na tela inicial.';
      btnAnd.hidden = true; passosAnd.hidden = true;
    } else if (evento) {
      txtAnd.textContent = desktop ? 'Instale no computador: abre numa janela própria, rápido e com avisos.' : 'Toque em Instalar e confirme. O ícone da TENKiTER aparece na tela inicial.';
      btnAnd.hidden = false; btnAnd.textContent = desktop ? 'Instalar neste computador' : 'Instalar no Android';
      passosAnd.hidden = true;
    } else if (embutido) {
      txtAnd.textContent = 'Você está dentro do navegador de outro aplicativo (Instagram, WhatsApp…). Abra o site no Chrome para instalar.';
      btnAnd.hidden = false; btnAnd.textContent = 'Copiar o endereço do site';
      passosAnd.hidden = true;
    } else {
      txtAnd.textContent = android ? 'Para instalar, siga os passos abaixo (leva 20 segundos).' : 'No computador, use Chrome ou Edge: aparece um ícone de instalar na barra de endereço. No Android, siga os passos abaixo.';
      btnAnd.hidden = true; passosAnd.hidden = false;
    }

    /* ---- iPhone */
    if (standalone() && iOS) {
      txtIos.textContent = '✅ Você já está usando o app no iPhone. Para receber avisos, use o botão abaixo.';
      btnIos.hidden = true; passosIos.hidden = true;
    } else if (iOS && embutido) {
      txtIos.textContent = 'Você está dentro do navegador de outro aplicativo. No iPhone a instalação só funciona no Safari: copie o endereço e abra no Safari.';
      btnIos.hidden = false; btnIos.textContent = 'Copiar o endereço do site'; btnIos.setAttribute('data-modo', 'copiar');
      passosIos.hidden = false;
    } else {
      txtIos.textContent = iOS ? 'No iPhone a instalação é pelo Safari. É rapidinho:' : 'No iPhone a instalação é feita pelo Safari, em poucos toques:';
      var podeCompartilhar = iOS && typeof navigator.share === 'function';
      btnIos.hidden = !podeCompartilhar; btnIos.textContent = '📤 Abrir o menu Compartilhar'; btnIos.setAttribute('data-modo', 'compartilhar');
      passosIos.hidden = false;
    }

    /* ---- avisos (push.js) */
    var linha = $('inst-avisos');
    if (linha && window.TKPush) {
      var r = TKPush.resumo();
      var t = $('inst-avisos-txt'), b = $('btn-inst-avisos');
      var mostra = true;
      if (r === 'em-breve' || r === 'sem-app' || r === 'nao-suportado') mostra = false;
      linha.hidden = !mostra;
      if (mostra) {
        if (r === 'ativo' || r === 'ativando') { t.textContent = '🔔 Avisos ativados neste aparelho.'; b.textContent = 'Ajustar avisos'; }
        else if (r === 'pausado') { t.textContent = '🔕 Avisos pausados neste aparelho.'; b.textContent = 'Reativar avisos'; }
        else if (r === 'negado') { t.textContent = '🚫 Os avisos estão bloqueados neste aparelho.'; b.textContent = 'Como liberar'; }
        else if (r === 'ios-instalar') { t.textContent = '🔕 No iPhone, instale o app primeiro (passos acima) e depois ative os avisos dentro dele.'; b.textContent = 'Entender'; }
        else if (r === 'embutido' || r === 'ios-antigo' || r === 'bloqueado') { t.textContent = '🔕 Avisos indisponíveis aqui.'; b.textContent = 'Ver o motivo'; }
        else { t.textContent = '🔕 Avisos desligados. Ative para receber novidades e o andamento do seu pedido.'; b.textContent = '🔔 Ativar avisos'; }
      }
    }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); evento = e; guardarInstalado(false); desenhar();
  });
  window.addEventListener('appinstalled', function () {
    evento = null; guardarInstalado(true); desenhar();
    if (window.TKDisp) TKDisp.registrar({ instalou: true });     // v3.5: conta no painel "quantas pessoas instalaram"
    msg('✅ App instalado! Procure o ícone TENKiTER na tela inicial.');
    if (window.TKPush) setTimeout(function () { TKPush.aposInstalar(); }, 600);
  });
  try { window.matchMedia('(display-mode: standalone)').addEventListener('change', desenhar); } catch (e) {}

  function pedirInstalacao() {
    if (!evento) return Promise.resolve(false);
    var ev = evento;
    ev.prompt();
    return ev.userChoice.then(function (r) {
      evento = null;
      if (r && r.outcome === 'accepted') { msg('Instalando… o ícone TENKiTER vai aparecer na tela inicial.'); }
      else { msg('Tudo bem! Você pode instalar depois, por aqui mesmo.'); }
      desenhar();
      return !!(r && r.outcome === 'accepted');
    });
  }

  if (btnRodape) btnRodape.addEventListener('click', function () { pedirInstalacao(); });
  if (secao) {
    $('btn-inst-android').addEventListener('click', function () {
      if (evento) pedirInstalacao(); else if (embutido) copiarEndereco();
    });
    $('btn-inst-ios').addEventListener('click', function () {
      if (this.getAttribute('data-modo') === 'copiar') { copiarEndereco(); return; }
      try {
        navigator.share({ title: 'TENKiTER Modas', url: location.origin + '/' }).catch(function () { /* a pessoa fechou o menu */ });
        msg('No menu que abriu, role e escolha “Adicionar à Tela de Início”.');
      } catch (e) { msg('Toque no botão Compartilhar do Safari e depois em “Adicionar à Tela de Início”.'); }
    });
    $('btn-inst-avisos').addEventListener('click', function () {
      if (!window.TKPush) return;
      var r = TKPush.resumo();
      if (r === 'pendente' || r === 'pausado') TKPush.ativar().then(desenhar);
      else if (r === 'ativo' || r === 'ativando') TKPush.abrirPainel();
      else TKPush.abrirAjuda(r);
    });
    if (window.TKPush) TKPush.aoMudar(desenhar);
    else window.addEventListener('load', function () { if (window.TKPush) TKPush.aoMudar(desenhar); desenhar(); });
  }

  window.TKInstalar = {
    estado: function () { return { instalado: instalado(), podeInstalar: !!evento, standalone: standalone(), ios: iOS, android: android, embutido: embutido }; },
    instalar: pedirInstalacao, redesenhar: desenhar
  };
  desenhar();
})();
