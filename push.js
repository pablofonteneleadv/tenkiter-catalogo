/* ====================================================================
 * TENKiTER — push.js (v3.4) — avisos no celular (Android, iPhone e computador)
 *
 * O envio e a entrega são do OneSignal (serviço pronto, usado no mundo todo). Este arquivo cuida do que é nosso:
 *  - carrega o OneSignal só onde ele pode funcionar (e explica com clareza onde não pode: iPhone no Safari, Instagram/WhatsApp embutido, permissão bloqueada...);
 *  - pede a permissão DO JEITO CERTO: sempre num toque da pessoa (o navegador exige), com um convite nosso antes e ajuda passo a passo se ela estiver bloqueada;
 *  - liga o aparelho à CONTA (OneSignal.login com o pushId que o servidor calcula) -- é assim que a gestão escolhe avisar clientes, equipe, alunos,
 *    perfis, acessos ou uma pessoa só. O navegador nunca decide quem ele é: o servidor confere o token de sessão e devolve o pushId;
 *  - guarda as escolhas da pessoa (novidades/promoções e interesses) como etiquetas, e liga o aparelho aos pedidos dela (apelido ped_0001).
 *
 * Carregado em index.html, admin.html e treinamentos.html (precisa de common.js antes). Não guarda NENHUM dado pessoal no aparelho:
 * só escolhas de aviso, chaves opacas de pedido e contadores do convite.
 * ==================================================================== */
(function () {
  'use strict';
  if (window.TKPush) return;

  var APP_ID = typeof ONESIGNAL_APP_ID !== 'undefined' ? ONESIGNAL_APP_ID : '';
  var SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  var K_CONVITE = 'tk_push_convite_v1', K_TAGS = 'tk_push_tags_v1', K_PEDIDOS = 'tk_push_pedidos_v1', K_PREFS = 'tk_push_prefs_v1';
  var S_IDENT = 'tk_push_ident_v1', S_CFG = 'tk_push_cfg_v1';

  /* ---------------------------------------------------------------- armazenamento (nunca derruba a página) */
  function lerLS(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function gravarLS(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lerSS(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function gravarSS(k, v) { try { if (v === null || v === undefined) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------------------------------------------------------------- onde estamos */
  var UA = navigator.userAgent || '';
  var iOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(UA);
  var embutido = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|musical_ly|TikTok/i.test(UA) || (android && /; wv\)/.test(UA));
  function standalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function versaoIOS() { var m = UA.match(/OS (\d+)[_.](\d+)/); return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null; }
  function lerPermissao() { try { return ('Notification' in window) ? Notification.permission : 'default'; } catch (e) { return 'default'; } }

  /** 'ok' = dá para ativar aqui; senão o motivo (cada um tem sua explicação em abrirAjuda). */
  function suporte() {
    if (!APP_ID) return 'sem-app';
    if (embutido && !standalone()) return 'embutido';
    if (iOS) {
      var v = versaoIOS();
      if (v && (v[0] < 16 || (v[0] === 16 && v[1] < 4))) return 'ios-antigo';
      if (!standalone()) return 'ios-instalar';
    }
    var seguro = location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (!seguro || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'nao-suportado';
    return 'ok';
  }

  /* ---------------------------------------------------------------- estado */
  var OS = null;                       // objeto OneSignal (depois do init)
  var est = { sdk: 'parado', configurado: null, permissao: lerPermissao(), inscrito: false, pushId: '', tipo: '', equipe: false };
  var ouvintes = [];
  var pediuEm = 0;                     // quando a pessoa tocou em "Ativar" (para mostrar "ativando…" em vez de "pausado")
  var iniciado = false;

  function resumo() {
    if (est.configurado === false) return 'em-breve';
    var s = suporte();
    if (s !== 'ok') return s;
    if (est.sdk === 'bloqueado' || est.sdk === 'erro') return 'bloqueado';
    if (est.permissao === 'denied') return 'negado';
    if (est.permissao === 'granted') return est.inscrito ? 'ativo' : (Date.now() - pediuEm < 20000 ? 'ativando' : 'pausado');
    return 'pendente';
  }
  function mudou() {
    ouvintes.slice().forEach(function (f) { try { f(est, resumo()); } catch (e) {} });
    atualizarBotaoTopo();
  }
  function lerEstado() {
    est.permissao = lerPermissao();
    try { est.inscrito = !!(OS && OS.User.PushSubscription.optedIn); } catch (e) { est.inscrito = false; }
    if (est.inscrito) { aplicarPedidos(); }
    mudou();
  }

  /* ---------------------------------------------------------------- servidor do OneSignal configurado para a Web? */
  function verificarConfigurado() {
    var c = lerSS(S_CFG);
    if (c && Date.now() - c.t < 600000) { est.configurado = c.ok; return Promise.resolve(); }
    return fetch('https://api.onesignal.com/sync/' + encodeURIComponent(APP_ID) + '/web?callback=x', { cache: 'no-store' })
      .then(function (r) { return r.text().then(function (t) { return { ok: r.ok, t: t }; }); })
      .then(function (r) {
        if (/"success"\s*:\s*false/.test(r.t)) est.configurado = false;
        else if (r.ok && r.t.length > 40) est.configurado = true;
        if (est.configurado !== null) gravarSS(S_CFG, { ok: est.configurado, t: Date.now() });
      })
      .catch(function () { /* sem resposta: deixa o SDK tentar */ });
  }

  /* ---------------------------------------------------------------- carregar e iniciar o OneSignal */
  function carregarSDK() {
    est.sdk = 'carregando';
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(function (OneSignal) { return prepararSDK(OneSignal); });
    var s = document.createElement('script');
    s.src = SDK_URL; s.defer = true;
    s.onerror = function () { est.sdk = 'bloqueado'; mudou(); };
    document.head.appendChild(s);
    setTimeout(function () { if (est.sdk === 'carregando') { est.sdk = 'bloqueado'; mudou(); } }, 20000);
  }

  var fila = Promise.resolve();       // identificação e etiquetas nunca rodam ao mesmo tempo
  function naFila(fn) { fila = fila.then(fn, fn).catch(function () {}); return fila; }

  function prepararSDK(OneSignal) {
    OS = OneSignal;
    return Promise.resolve().then(function () {
      return OS.init({
        appId: APP_ID, serviceWorkerPath: 'OneSignalSDKWorker.js', serviceWorkerParam: { scope: '/' },
        autoResubscribe: true, notifyButton: { enable: false }
      });
    }).then(function () {
      est.sdk = 'pronto';
      try {
        OS.Notifications.addEventListener('permissionChange', lerEstado);
        OS.User.PushSubscription.addEventListener('change', lerEstado);
      } catch (e) {}
      lerEstado();
      return identificar();
    }).then(function () { return marcar(); }).then(function () { aplicarPedidos(); lerEstado(); convidarAutomatico(); })
      .catch(function (e) {
        est.sdk = 'erro'; est.erro = String((e && e.message) || e);
        if (/not configured|web push/i.test(est.erro)) est.configurado = false;
        mudou();
      });
  }

  function iniciar() {
    if (iniciado) return; iniciado = true;
    if (!APP_ID) return;
    verificarConfigurado().then(function () {
      if (est.configurado === false) { est.sdk = 'inativo'; mudou(); return; }
      if (suporte() !== 'ok') { mudou(); return; }   // o botão continua aparecendo para explicar o que fazer
      carregarSDK(); mudou();
    });
  }

  /* ---------------------------------------------------------------- conta: quem é este aparelho */
  function identificar() {
    return naFila(function () {
      if (!OS || est.sdk !== 'pronto') return;
      var s = typeof getSessao === 'function' ? getSessao() : null;
      return Promise.resolve().then(function () {
        if (!s) {
          gravarSS(S_IDENT, null);
          var tinha = OS.User.externalId;
          est.pushId = ''; est.tipo = ''; est.equipe = false;
          if (tinha) return OS.logout();
          return null;
        }
        var tok = String(s.sessao).slice(-16), c = lerSS(S_IDENT);
        if (c && c.tok === tok && c.id) return c;
        return apiPost({ action: 'pushIdentidade', whatsapp: s.whatsapp, sessao: s.sessao }).then(function (r) {
          if (!r || !r.ok || !r.pushId) return null;      // sem rede ou sessão vencida: não mexe no que já estava ligado
          var d = { tok: tok, id: r.pushId, tipo: r.tipo || '', equipe: !!r.equipe };
          gravarSS(S_IDENT, d);
          return d;
        });
      }).then(function (d) {
        if (!d || !d.id) { mudou(); return; }
        est.tipo = d.tipo; est.equipe = d.equipe;
        var login = OS.User.externalId !== d.id ? OS.login(d.id) : null;
        return Promise.resolve(login).then(function () { est.pushId = d.id; mudou(); });
      }).catch(function () {});
    });
  }

  /* ---------------------------------------------------------------- etiquetas (origem, tipo e escolhas da pessoa) */
  function prefs() { var p = lerLS(K_PREFS); return p && typeof p === 'object' ? p : { int: [] }; }
  function marcar() {
    return naFila(function () {
      if (!OS || est.sdk !== 'pronto') return;
      var t = { origem: standalone() ? 'app' : 'site' };
      if (est.tipo) t.tipo = est.tipo;
      var p = prefs();
      if (p.novidades === true) t.av_novidades = '1'; else if (p.novidades === false) t.av_novidades = '0';
      (p.int || []).forEach(function (k) { t['int_' + k] = '1'; });
      var antes = lerLS(K_TAGS) || {};
      var assinatura = JSON.stringify(Object.keys(t).sort().map(function (k) { return [k, t[k]]; })) + '|' + est.pushId;
      if (antes.a === assinatura) return;
      try { OS.User.addTags(t); gravarLS(K_TAGS, { a: assinatura }); } catch (e) {}
    });
  }
  function salvarPrefs(p) { gravarLS(K_PREFS, p); gravarLS(K_TAGS, null); return marcar(); }
  function definirNovidades(ligado) {
    var p = prefs(); p.novidades = !!ligado; gravarLS(K_PREFS, p);
    try { if (OS) OS.User.addTag('av_novidades', ligado ? '1' : '0'); } catch (e) {}
    gravarLS(K_TAGS, null);
  }
  function definirInteresse(chave, ligado) {
    var p = prefs(); p.int = (p.int || []).filter(function (k) { return k !== chave; });
    if (ligado) p.int.push(chave);
    gravarLS(K_PREFS, p);
    try { if (OS) { if (ligado) OS.User.addTag('int_' + chave, '1'); else OS.User.removeTag('int_' + chave); } } catch (e) {}
    gravarLS(K_TAGS, null);
  }

  /* ---------------------------------------------------------------- pedidos: o aparelho acompanha cada pedido (apelido ped_0001) */
  function pedidoCriado(codigo, chave) {
    if (!codigo || !chave) return;
    var rot = 'ped_' + String(codigo).replace(/\D/g, '');
    var lista = (lerLS(K_PEDIDOS) || []).filter(function (p) { return p.r !== rot; });
    lista.push({ r: rot, k: chave });
    while (lista.length > 5) {
      var velho = lista.shift();
      try { if (OS) OS.User.removeAlias(velho.r); } catch (e) {}
    }
    gravarLS(K_PEDIDOS, lista);
    aplicarPedidos();
  }
  var aliasFeitos = {};
  function aplicarPedidos() {
    if (!OS || est.sdk !== 'pronto' || !est.inscrito) return;
    (lerLS(K_PEDIDOS) || []).forEach(function (p) {
      var marca = p.r + '|' + (est.pushId || '-');
      if (aliasFeitos[marca]) return;
      try { OS.User.addAlias(p.r, p.k); aliasFeitos[marca] = true; } catch (e) {}
    });
  }

  /* ---------------------------------------------------------------- ativar / desativar (SEMPRE chamado de um toque da pessoa) */
  function ativar() {
    var s = suporte();
    if (est.configurado === false) { abrirAjuda('em-breve'); return Promise.resolve({ ok: false, motivo: 'em-breve' }); }
    if (s !== 'ok') { abrirAjuda(s); return Promise.resolve({ ok: false, motivo: s }); }
    if (!OS || est.sdk !== 'pronto') { abrirAjuda(est.sdk === 'bloqueado' || est.sdk === 'erro' ? 'bloqueado' : 'carregando'); return Promise.resolve({ ok: false, motivo: 'sdk' }); }
    if (lerPermissao() === 'denied') { abrirAjuda('negado'); return Promise.resolve({ ok: false, motivo: 'negado' }); }
    pediuEm = Date.now();
    var p;
    try { p = lerPermissao() === 'granted' ? OS.User.PushSubscription.optIn() : OS.Notifications.requestPermission(); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).then(function () {
      if (lerPermissao() === 'granted' && !OS.User.PushSubscription.optedIn) return OS.User.PushSubscription.optIn();
    }).catch(function () {}).then(function () {
      lerEstado();
      if (est.permissao === 'denied') { abrirAjuda('negado'); return { ok: false, motivo: 'negado' }; }
      if (est.permissao === 'granted') {
        identificar().then(function () { return marcar(); });
        aviso('Avisos ativados neste aparelho 🔔');
        return { ok: true };
      }
      return { ok: false, motivo: 'pendente' };      // a pessoa fechou a janelinha sem escolher
    });
  }
  function desativar() {
    pediuEm = 0;                       // quem desligou de propósito vê "pausado" na hora (não "ativando…")
    try { return Promise.resolve(OS.User.PushSubscription.optOut()).then(lerEstado, lerEstado); } catch (e) { return Promise.resolve(); }
  }
  function testeLocal() {
    if (!('serviceWorker' in navigator)) return Promise.reject(new Error('sem service worker'));
    return navigator.serviceWorker.ready.then(function (r) {
      return r.showNotification('TENKiTER Modas', { body: 'Teste: é assim que os avisos aparecem neste aparelho. 🔔', icon: '/icon-192.png', badge: '/icon-192.png', tag: 'tk-teste', data: { url: location.origin + '/' } });
    });
  }

  /* ---------------------------------------------------------------- interface (folha única que muda de conteúdo) */
  function el(tag, props, filhos) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') e.textContent = props[k];
      else if (k === 'class') e.className = props[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    });
    (filhos || []).forEach(function (f) { if (f) e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return e;
  }
  function css() {
    if (document.getElementById('tkp-css')) return;
    var s = document.createElement('style'); s.id = 'tkp-css';
    s.textContent =
      '#tkp-janela{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center}' +
      '#tkp-janela.aberto{display:flex}' +
      '#tkp-janela .tkp-fo{background:#fff;color:#1a1a1a;width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 18px 24px;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 -8px 30px rgba(0,0,0,.4);box-sizing:border-box}' +
      '@media(min-width:600px){#tkp-janela{align-items:center}#tkp-janela .tkp-fo{border-radius:18px}}' +
      '#tkp-janela h2{margin:0 36px 6px 0;font-size:1.18rem;line-height:1.25;color:#111}' +
      '#tkp-janela h3{margin:16px 0 4px;font-size:.98rem;color:#111}' +
      '#tkp-janela p{margin:8px 0;color:#333}' +
      '#tkp-janela .tkp-x{position:absolute;right:10px;top:10px;width:44px;height:44px;border:0;border-radius:22px;background:#eee;color:#111;font-size:1.1rem;cursor:pointer}' +
      '#tkp-janela .tkp-topo{position:relative}' +
      '#tkp-janela .tkp-btn{display:block;width:100%;min-height:50px;border:2px solid #E67E22;border-radius:12px;background:#E67E22;color:#0d0d0d;font:800 1rem system-ui,sans-serif;cursor:pointer;margin:12px 0 0;padding:10px 14px;box-sizing:border-box}' +
      '#tkp-janela .tkp-btn.sec{background:#fff;border-color:#A85200;color:#A85200}' +
      '#tkp-janela .tkp-btn.link{background:none;border:0;color:#555;font-weight:600;text-decoration:underline;min-height:44px}' +
      '#tkp-janela .tkp-btn[disabled]{opacity:.6;cursor:default}' +
      '#tkp-janela .tkp-sel{display:flex;gap:10px;align-items:center;margin:10px 0;min-height:44px}' +
      '#tkp-janela .tkp-sel input{width:22px;height:22px;flex:none}' +
      '#tkp-janela .tkp-chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}' +
      '#tkp-janela .tkp-chip{min-height:40px;padding:6px 14px;border-radius:999px;border:2px solid #A85200;background:#fff;color:#A85200;font:700 .9rem system-ui,sans-serif;cursor:pointer}' +
      '#tkp-janela .tkp-chip[aria-pressed="true"]{background:#E67E22;border-color:#E67E22;color:#0d0d0d}' +
      '#tkp-janela ol,#tkp-janela ul{margin:6px 0;padding-left:22px;color:#333}#tkp-janela li{margin:5px 0}' +
      '#tkp-janela .tkp-estado{display:inline-block;padding:3px 12px;border-radius:999px;font-weight:800;font-size:.85rem;background:#eee;color:#222}' +
      '#tkp-janela .tkp-estado.ok{background:#d8f3dc;color:#14532d}#tkp-janela .tkp-estado.ruim{background:#fde2e2;color:#7f1d1d}' +
      '#tkp-janela details{margin:12px 0;border:1px solid #ddd;border-radius:10px;padding:8px 12px}#tkp-janela summary{cursor:pointer;font-weight:700;min-height:32px}' +
      '#tkp-janela .tkp-peq{font-size:.85rem;color:#555}' +
      '#tkp-aviso{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:101;background:#111;color:#fff;padding:12px 18px;border-radius:12px;font:600 .95rem system-ui,sans-serif;max-width:90vw;box-shadow:0 4px 18px rgba(0,0,0,.4)}' +
      '.tkp-pedido{margin:12px 16px;padding:12px;border:2px dashed #A85200;border-radius:12px;background:#fff8f0;color:#1a1a1a;font:15px/1.4 system-ui,sans-serif}' +
      '.tkp-pedido b{color:#111}.tkp-pedido button{display:block;width:100%;min-height:48px;margin-top:8px;border:0;border-radius:10px;background:#E67E22;color:#0d0d0d;font:800 .98rem system-ui,sans-serif;cursor:pointer}';
    document.head.appendChild(s);
  }
  var janela = null, folha = null, voltaFoco = null;
  function garantirJanela() {
    css();
    if (janela) return;
    janela = el('div', { id: 'tkp-janela' });
    folha = el('div', { class: 'tkp-fo', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tkp-titulo' });
    janela.appendChild(folha);
    janela.addEventListener('click', function (e) { if (e.target === janela) fechar(); });
    document.body.appendChild(janela);
  }
  function fechar() { if (janela) janela.classList.remove('aberto'); }
  function abrir(titulo, filhos) {
    garantirJanela();
    folha.textContent = '';
    var topo = el('div', { class: 'tkp-topo' }, [el('h2', { id: 'tkp-titulo', text: titulo }), el('button', { type: 'button', class: 'tkp-x', 'aria-label': 'Fechar', text: '✕', onclick: fechar })]);
    folha.appendChild(topo);
    filhos.forEach(function (f) { if (f) folha.appendChild(f); });
    janela.classList.add('aberto');
  }
  function aviso(msg) {
    css();
    var a = document.getElementById('tkp-aviso');
    if (a) a.remove();
    a = el('div', { id: 'tkp-aviso', role: 'status', text: msg });
    document.body.appendChild(a);
    setTimeout(function () { if (a.parentNode) a.remove(); }, 3500);
  }
  function btn(texto, fn, tipo) { return el('button', { type: 'button', class: 'tkp-btn' + (tipo ? ' ' + tipo : ''), text: texto, onclick: fn }); }
  function lista(tag, itens) { return el(tag, {}, itens.map(function (t) { return el('li', { text: t }); })); }

  /** Passos para o aparelho da pessoa: o que fazer quando a permissão está bloqueada ou os avisos não chegam. */
  function passosAparelho() {
    if (iOS) return [
      'Abra os Ajustes do iPhone.', 'Toque em Notificações e procure TENKiTER na lista.', 'Ative “Permitir notificações”.',
      'Volte e abra o app TENKiTER pelo ícone da tela de início (não pelo Safari).'
    ];
    if (android) return [
      'Toque e segure o ícone do app TENKiTER e escolha “Informações do app” (ou “i”).',
      'Toque em Notificações e ative “Permitir notificações”.',
      'Ainda em Informações do app, DESLIGUE “Pausar atividade no app quando não usado” (se ficar ligado, o Android tira a permissão depois de um tempo sem abrir o app).',
      'Bateria: escolha “Sem restrições” para o TENKiTER (assim o aviso chega com o app fechado).',
      'Celular Xiaomi/Redmi/POCO: em Segurança → Permissões → Início automático, ligue o TENKiTER.',
      'Se você está no Chrome (sem o app): toque em ⋮ → Configurações → Configurações do site → Notificações → tenkitermodas.com.br → Permitir.'
    ];
    return [
      'Clique no cadeado (ou no ícone de configurações) ao lado do endereço do site.', 'Procure “Notificações” e escolha “Permitir”.', 'Recarregue a página e toque em Ativar avisos de novo.'
    ];
  }

  function abrirAjuda(motivo) {
    var conteudo = [];
    var titulo = 'Como ativar os avisos';
    if (motivo === 'negado') {
      titulo = 'Os avisos estão bloqueados';
      conteudo.push(el('p', { text: 'Este aparelho recusou os avisos da TENKiTER. Para voltar a receber, é preciso liberar nas configurações — o site não consegue fazer isso sozinho. É rapidinho:' }));
      conteudo.push(lista('ol', passosAparelho()));
      conteudo.push(btn('Já liberei — verificar de novo', function () { lerEstado(); if (lerPermissao() === 'granted') { fechar(); ativar(); } else aviso('Ainda está bloqueado. Confira os passos.'); }));
    } else if (motivo === 'ios-instalar') {
      titulo = 'No iPhone, primeiro instale o app';
      conteudo.push(el('p', { text: 'A Apple só deixa o iPhone receber avisos de sites que foram instalados na tela de início. Faça assim (leva 20 segundos):' }));
      conteudo.push(lista('ol', ['Abra este site no Safari (não vale o navegador do Instagram ou WhatsApp).', 'Toque no botão Compartilhar (o quadrado com a seta para cima, embaixo na tela).', 'Role e toque em “Adicionar à Tela de Início”, depois em “Adicionar”.', 'Abra o TENKiTER pelo novo ícone na tela de início.', 'Toque em “Ativar avisos” e permita.']));
      conteudo.push(el('p', { class: 'tkp-peq', text: 'Funciona no iPhone com iOS 16.4 ou mais novo.' }));
    } else if (motivo === 'ios-antigo') {
      titulo = 'Seu iPhone precisa atualizar';
      conteudo.push(el('p', { text: 'Para receber avisos de sites, o iPhone precisa do iOS 16.4 ou mais novo. Atualize em Ajustes → Geral → Atualização de Software. Enquanto isso o catálogo e o app funcionam normalmente.' }));
    } else if (motivo === 'embutido') {
      titulo = 'Abra no navegador do celular';
      conteudo.push(el('p', { text: 'Você está dentro do navegador do Instagram, WhatsApp ou outro aplicativo, e ele não permite avisos. Toque nos três pontinhos (⋯ ou ⋮) e escolha “Abrir no navegador” (Chrome no Android, Safari no iPhone). Depois é só ativar.' }));
      conteudo.push(btn('Copiar o endereço do site', function () {
        var fim = function (ok) { aviso(ok ? 'Endereço copiado. Cole no navegador.' : 'Endereço: ' + location.origin + '/'); };
        try { navigator.clipboard.writeText(location.origin + '/').then(function () { fim(true); }, function () { fim(false); }); } catch (e) { fim(false); }
      }, 'sec'));
    } else if (motivo === 'bloqueado') {
      titulo = 'Os avisos foram bloqueados';
      conteudo.push(el('p', { text: 'Alguma extensão ou bloqueador de anúncios impediu o serviço de avisos de carregar. Desative o bloqueador para este site (ou use outro navegador) e tente de novo.' }));
    } else if (motivo === 'carregando') {
      titulo = 'Quase pronto…';
      conteudo.push(el('p', { text: 'O serviço de avisos ainda está carregando. Espere uns segundos e toque de novo.' }));
    } else if (motivo === 'em-breve') {
      titulo = 'Avisos em preparação';
      conteudo.push(el('p', { text: 'Os avisos por notificação ainda estão sendo preparados pela loja. Em breve você poderá ativá-los aqui.' }));
    } else {
      titulo = 'Este navegador não recebe avisos';
      conteudo.push(el('p', { text: 'Para receber avisos no celular, use o Chrome (Android) ou instale o app (iPhone, no Safari). No computador, Chrome, Edge e Firefox funcionam.' }));
    }
    conteudo.push(btn('Entendi', fechar, 'link'));
    abrir(titulo, conteudo);
  }

  /* ---- preferências dentro do painel */
  var interessesCache = null;
  function carregarInteresses() {
    if (interessesCache) return Promise.resolve(interessesCache);
    return versaoServidor().then(function (v) {
      if (!v || !v.pushCompleto) return [];
      return fetch(API_URL + '?action=pushconfig').then(function (r) { return r.json(); }).then(function (j) { interessesCache = (j && j.ok && j.interesses) || []; return interessesCache; });
    }).catch(function () { return []; });
  }
  function blocoPreferencias() {
    var cx = el('div');
    var p = prefs();
    var chk = el('input', { type: 'checkbox', id: 'tkp-promo' });
    chk.checked = p.novidades !== false;
    chk.addEventListener('change', function () { definirNovidades(chk.checked); });
    cx.appendChild(el('h3', { text: 'O que você quer receber' }));
    cx.appendChild(el('label', { class: 'tkp-sel', for: 'tkp-promo' }, [chk, el('span', { text: 'Novidades e promoções da loja' })]));
    cx.appendChild(el('p', { class: 'tkp-peq', text: 'Avisos do andamento do seu pedido sempre chegam.' }));
    var area = el('div'); cx.appendChild(area);
    carregarInteresses().then(function (itens) {
      if (!itens.length) return;
      area.appendChild(el('h3', { text: 'Tenho interesse em' }));
      var chips = el('div', { class: 'tkp-chips', role: 'group', 'aria-label': 'Interesses' });
      var atual = prefs().int || [];
      itens.forEach(function (i) {
        var b = el('button', { type: 'button', class: 'tkp-chip', 'aria-pressed': atual.indexOf(i.chave) !== -1 ? 'true' : 'false', text: i.rotulo });
        b.addEventListener('click', function () {
          var lig = b.getAttribute('aria-pressed') !== 'true';
          b.setAttribute('aria-pressed', lig ? 'true' : 'false');
          definirInteresse(i.chave, lig);
        });
        chips.appendChild(b);
      });
      area.appendChild(chips);
      area.appendChild(el('p', { class: 'tkp-peq', text: 'Sem nenhum marcado, você recebe as novidades de tudo.' }));
    });
    return cx;
  }
  function blocoNaoChega() {
    var d = el('details');
    d.appendChild(el('summary', { text: 'O aviso não aparece com o app fechado?' }));
    d.appendChild(lista('ol', passosAparelho()));
    d.appendChild(btn('Mostrar uma notificação de teste', function () {
      testeLocal().then(function () { aviso('Se apareceu no topo da tela, está tudo certo neste aparelho.'); }, function () { aviso('Não deu para mostrar o teste neste navegador.'); });
    }, 'sec'));
    return d;
  }
  function textoPorTipo() {
    if (est.tipo === 'equipe') return 'Você receberá os avisos da equipe, novos pedidos e comunicados da gestão.';
    if (est.tipo === 'aluno') return 'Você receberá os avisos dos treinamentos e da equipe.';
    return 'Você receberá novidades, promoções e o andamento dos seus pedidos.';
  }

  function abrirPainel() {
    voltaFoco = document.activeElement;
    var r = resumo();
    if (r === 'ativo' || r === 'ativando' || r === 'pausado') {
      var ligado = r === 'ativo' || r === 'ativando';
      var filhos = [
        el('p', {}, [el('span', { class: 'tkp-estado ' + (ligado ? 'ok' : ''), text: r === 'ativando' ? 'Ativando…' : (ligado ? 'Avisos ativados' : 'Avisos pausados') })]),
        el('p', { text: ligado ? textoPorTipo() : 'Você pausou os avisos neste aparelho. Reative quando quiser.' })
      ];
      if (ligado) {
        filhos.push(blocoPreferencias());
        filhos.push(blocoNaoChega());
        filhos.push(btn('Desativar avisos neste aparelho', function () { desativar().then(function () { fechar(); aviso('Avisos desativados neste aparelho.'); }); }, 'sec'));
      } else {
        filhos.push(btn('Reativar avisos', function () { ativar().then(function () { fechar(); }); }));
      }
      abrir('🔔 Meus avisos', filhos);
      return;
    }
    if (r === 'pendente') { abrirConvite('painel'); return; }
    abrirAjuda(r);
  }

  /** Convite nosso (antes do pedido do navegador): explica o benefício e só então pede, no toque da pessoa. */
  function abrirConvite(origem) {
    voltaFoco = document.activeElement;
    var quem = est.tipo === 'equipe' ? 'os novos pedidos e os avisos da equipe' : (est.tipo === 'aluno' ? 'os avisos dos treinamentos e da equipe' : 'as novidades, as promoções e o andamento do seu pedido');
    var filhos = [
      el('p', { text: 'Ative para receber ' + quem + ' direto na tela do celular, mesmo com o app fechado.' }),
      btn('🔔 Ativar avisos', function () { fechar(); ativar(); }),
      btn('Agora não', fechar, 'link')
    ];
    if (origem === 'auto') {
      filhos.push(el('button', { type: 'button', class: 'tkp-btn link', text: 'Não quero receber', onclick: function () { var c = lerLS(K_CONVITE) || {}; c.nunca = true; gravarLS(K_CONVITE, c); fechar(); } }));
    }
    abrir(origem === 'instalou' ? '✅ App instalado! Ative os avisos' : 'Receba os avisos da TENKiTER', filhos);
  }
  function convidarAutomatico() {
    if (resumo() !== 'pendente' || est.sdk !== 'pronto') return;
    var noApp = standalone();
    if (!noApp && !(est.equipe || est.tipo === 'aluno')) return;     // cliente no navegador: só o sininho, sem insistir
    var c = lerLS(K_CONVITE) || { n: 0, t: 0, nunca: false };
    if (c.nunca || c.n >= 3 || Date.now() - c.t < 3 * 86400000) return;
    setTimeout(function () {
      if (resumo() !== 'pendente' || (janela && janela.classList.contains('aberto'))) return;
      var cc = lerLS(K_CONVITE) || { n: 0, t: 0, nunca: false };
      cc.n = (cc.n || 0) + 1; cc.t = Date.now(); gravarLS(K_CONVITE, cc);
      abrirConvite('auto');
    }, noApp ? 2500 : 5000);
  }
  /** Chamado pelo instalador depois que o app foi instalado (a pessoa ainda está no navegador, com o dedo na tela). */
  function aposInstalar() {
    if (resumo() === 'pendente' && est.sdk === 'pronto') abrirConvite('instalou');
  }

  /* ---------------------------------------------------------------- sininho do topo e bloco do pedido */
  function atualizarBotaoTopo() {
    var b = document.getElementById('btn-push-header');
    if (!b) return;
    var r = resumo();
    if (!APP_ID || r === 'em-breve' || r === 'nao-suportado' || r === 'sem-app') { b.style.display = 'none'; return; }
    b.style.display = '';
    var on = r === 'ativo' || r === 'ativando';
    b.textContent = on ? '🔔' : '🔕';
    b.classList.toggle('ativado', on);
    b.title = on ? 'Avisos ativados (toque para ajustar)' : 'Ativar avisos de novidades e do pedido';
    b.setAttribute('aria-label', b.title);
  }
  function ligarBotaoTopo() {
    var b = document.getElementById('btn-push-header');
    if (!b || b.getAttribute('data-tkp')) return;
    b.setAttribute('data-tkp', '1');
    b.addEventListener('click', abrirPainel);
    atualizarBotaoTopo();
  }

  /** Bloco "Avisar quando o pedido mudar", dentro da tela de pedido enviado / acompanhar pedido. */
  function blocoPedido(container) {
    css();
    var caixa = el('div', { class: 'tkp-pedido', id: 'tkp-bloco-pedido' });
    function desenhar() {
      var r = resumo();
      caixa.textContent = '';
      if (r === 'em-breve' || r === 'sem-app' || r === 'nao-suportado') { caixa.style.display = 'none'; return; }
      caixa.style.display = '';
      if (r === 'ativo' || r === 'ativando') { caixa.appendChild(el('b', { text: '🔔 Avisos ligados.' })); caixa.appendChild(document.createTextNode(' Você será avisado aqui quando o pedido mudar de etapa.')); return; }
      caixa.appendChild(el('b', { text: '🔔 Quer ser avisado quando o pedido mudar?' }));
      caixa.appendChild(document.createTextNode(' Receba no celular: separando, pronto para retirar, etc.'));
      caixa.appendChild(el('button', { type: 'button', id: 'tkp-avisar-pedido', text: r === 'pendente' || r === 'pausado' ? 'Avisar quando o pedido mudar' : 'Como ativar os avisos', onclick: function () { if (r === 'pendente' || r === 'pausado') ativar().then(desenhar); else abrirAjuda(r); } }));
    }
    desenhar();
    var f = function () { if (!document.body.contains(caixa)) { var i = ouvintes.indexOf(f); if (i !== -1) ouvintes.splice(i, 1); return; } desenhar(); };
    ouvintes.push(f);
    container.appendChild(caixa);
    return caixa;
  }

  /* ---------------------------------------------------------------- troca de conta (login/logout em qualquer aba ou página) */
  function rawSessao() { try { return localStorage.getItem('tm_session') || ''; } catch (e) { return ''; } }
  var ultima = rawSessao();
  function checarSessao() {
    var r = rawSessao();
    if (r === ultima) return;
    ultima = r;
    identificar().then(marcar).then(function () { convidarAutomatico(); });
  }
  window.addEventListener('storage', checarSessao);
  window.addEventListener('tk:sessao', checarSessao);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { checarSessao(); lerEstado(); } });
  setInterval(checarSessao, 3000);

  /* ---------------------------------------------------------------- API pública */
  window.TKPush = {
    estado: function () { return { sdk: est.sdk, configurado: est.configurado, permissao: est.permissao, inscrito: est.inscrito, pushId: est.pushId, tipo: est.tipo, equipe: est.equipe, resumo: resumo() }; },
    resumo: resumo, ativar: ativar, desativar: desativar, abrirPainel: abrirPainel, abrirConvite: abrirConvite, abrirAjuda: abrirAjuda,
    identificar: identificar, pedidoCriado: pedidoCriado, blocoPedido: blocoPedido, aposInstalar: aposInstalar, testeLocal: testeLocal,
    aoMudar: function (f) { ouvintes.push(f); }, definirNovidades: definirNovidades, definirInteresse: definirInteresse, salvarPrefs: salvarPrefs,
    ambiente: function () { return { ios: iOS, android: android, standalone: standalone(), embutido: embutido, suporte: suporte() }; }
  };

  function partida() {
    ligarBotaoTopo();
    setTimeout(iniciar, 600);       // o catálogo aparece primeiro; os avisos carregam logo depois
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', partida); else partida();
})();
