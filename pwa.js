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

  /* ---------------------------------------------------------------- 3. plaquinha flutuante de convite
   * Só aparece quando a pessoa está no SITE (navegador comum) e não no app instalado, no celular.
   * Respeita: "Agora não" (volta em >= 3 dias, no máximo 3 vezes), "Já instalei / Não mostrar mais" (nunca mais).
   * Nunca abre por cima de janela aberta, nem em navegador de computador. O botão de instalar do Android usa o toque (prompt() exige). */
  var K_CONVITE = 'tk_convite_app_v1';
  function lerConvite() { try { return JSON.parse(localStorage.getItem(K_CONVITE) || '{}') || {}; } catch (e) { return {}; } }
  function gravarConvite(o) { try { localStorage.setItem(K_CONVITE, JSON.stringify(o)); } catch (e) {} }
  function vindoDoApp() {
    return standalone() || /^android-app:\/\//.test(document.referrer || '') || /[?&](source=pwa|origem=app)\b/.test(location.search);
  }
  function podeConvidar() {
    if (vindoDoApp()) return false;
    if (!(iOS || android)) return false;                        // computador: não incomoda
    var c = lerConvite();
    if (c.nunca) return false;
    if ((c.vezes || 0) >= 3) return false;
    if (c.ultimo && Date.now() - c.ultimo < 3 * 86400000) return false;
    if (lembrouInstalado() && !evento && android) return false; // já instalou (o Chrome só oferece instalar quando NÃO está instalado)
    if (document.querySelector('.aberto, .visivel, [role=dialog][open]')) return false;
    return true;
  }
  function fecharConvite(nunca) {
    var el = $('tk-convite-app'); if (el) el.remove();
    var c = lerConvite(); c.vezes = (c.vezes || 0) + 1; c.ultimo = Date.now(); if (nunca) c.nunca = true; gravarConvite(c);
  }
  function abrirConvite() {
    if ($('tk-convite-app') || !podeConvidar()) return;
    if (!$('tk-convite-css')) {
      var st = document.createElement('style'); st.id = 'tk-convite-css';
      st.textContent = '#tk-convite-app{position:fixed;left:12px;right:12px;bottom:84px;z-index:80;max-width:460px;margin:0 auto;background:#111;color:#fff;border-radius:14px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.35);font:14px/1.35 system-ui,sans-serif}' +
        '#tk-convite-app b{display:block;font-size:15px;margin-bottom:2px}#tk-convite-app p{margin:0 0 10px;color:#e6e6e6}' +
        '#tk-convite-app .tkcv-l{display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
        '#tk-convite-app button{width:auto;font:inherit;cursor:pointer;border-radius:10px;padding:9px 14px;min-height:40px}' +
        '#tk-convite-app .tkcv-p{background:#E67E22;color:#0d0d0d;border:0;font-weight:700}' +
        '#tk-convite-app .tkcv-s{background:transparent;color:#fff;border:1px solid #888}' +
        '#tk-convite-app .tkcv-n{background:transparent;color:#9a9a9a;border:0;text-decoration:underline;font-size:10px;line-height:1;min-height:0;padding:3px 4px;margin-left:auto;align-self:flex-end}';
      document.head.appendChild(st);
    }
    var box = document.createElement('div'); box.id = 'tk-convite-app'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Instalar o app da TENKiTER');
    var pode = !!evento, texto, rot;
    if (embutido) { texto = 'Você está dentro de outro app. Abra no Chrome ou Safari para instalar o app da TENKiTER.'; rot = 'Copiar endereço'; }
    else if (iOS) { texto = 'Instale o app na tela inicial: abre mais rápido e você recebe os avisos dos seus pedidos.'; rot = 'Como instalar'; }
    else if (pode) { texto = 'Instale o app da TENKiTER: abre mais rápido, funciona sem sinal ruim e avisa quando seu pedido andar.'; rot = '📲 Instalar o app'; }
    else { texto = 'Instale o app da TENKiTER pelo menu do navegador (⋮ → Instalar app ou Adicionar à tela inicial).'; rot = 'Ver o passo a passo'; }
    box.innerHTML = '<b>📲 Leve a TENKiTER no seu celular</b><p></p><div class="tkcv-l"><button type="button" class="tkcv-p"></button><button type="button" class="tkcv-s">Agora não</button><button type="button" class="tkcv-n">Não mostrar mais</button></div>';
    box.querySelector('p').textContent = texto; box.querySelector('.tkcv-p').textContent = rot;
    box.querySelector('.tkcv-p').addEventListener('click', function () {
      if (embutido) { copiarEndereco(); return; }
      if (iOS) {
        fecharConvite(false);
        try { navigator.share({ title: 'TENKiTER Modas', url: location.origin + '/' }).catch(function () {}); } catch (e) {}
        if (secao) { try { secao.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
        return;
      }
      if (evento) { fecharConvite(false); pedirInstalacao(); return; }
      fecharConvite(false);
      if (secao) { try { secao.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
    });
    box.querySelector('.tkcv-s').addEventListener('click', function () { fecharConvite(false); });
    box.querySelector('.tkcv-n').addEventListener('click', function () { fecharConvite(true); });
    document.body.appendChild(box);
  }
  window.addEventListener('appinstalled', function () { var el = $('tk-convite-app'); if (el) el.remove(); var c = lerConvite(); c.nunca = true; gravarConvite(c); });
  window.addEventListener('load', function () { setTimeout(abrirConvite, window.TK_CONVITE_ATRASO_MS != null ? window.TK_CONVITE_ATRASO_MS : 9000); });

  window.TKInstalar = {
    estado: function () { return { vindoDoApp: vindoDoApp(), instalado: instalado(), podeInstalar: !!evento, standalone: standalone(), ios: iOS, android: android, embutido: embutido }; },
    instalar: pedirInstalacao, redesenhar: desenhar
  };
  desenhar();
})();
