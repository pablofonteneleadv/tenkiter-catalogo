/* ====================================================================
 * TENKiTER — meta.js — Pixel da Meta (Facebook/Instagram), PRONTO mas DESLIGADO por padrão
 *
 * Só liga quando as duas coisas acontecem:
 *   1. o gestor colocou o ID do Pixel em Gestão > Integrações (o backend 3.1 devolve em ?action=config); e
 *   2. a pessoa que visita aceitou o aviso de medição de anúncios (LGPD).
 * Sem ID: este arquivo não faz nada (nenhum pedido de rede, nenhum aviso na tela).
 * Eventos usados: ViewContent (abrir peça), AddToCart (sacola), Contact (WhatsApp), Lead (pedido enviado).
 * O token da API de Conversões (servidor) NUNCA passa por aqui: fica só nas Propriedades do Script.
 * ==================================================================== */
(function () {
  'use strict';
  var CHAVE = 'tenkiter_consent_meta_v1';   // 'sim' | 'nao'
  var pixelId = '';
  var ligado = false;

  function ler() { try { return localStorage.getItem(CHAVE); } catch (e) { return null; } }
  function gravar(v) { try { localStorage.setItem(CHAVE, v); } catch (e) {} }
  function idValido(id) { return /^\d{8,20}$/.test(String(id || '')); }

  function carregar() {
    if (ligado || !idValido(pixelId)) return;
    ligado = true;
    var n = window.fbq = function () { if (n.callMethod) n.callMethod.apply(n, arguments); else n.queue.push(arguments); };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    var sc = document.createElement('script');
    sc.async = true; sc.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(sc);
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
  }

  function aviso() {
    if (document.getElementById('aviso-meta')) return;
    var d = document.createElement('div');
    d.className = 'cookie-aviso'; d.id = 'aviso-meta'; d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Aviso de privacidade');
    d.innerHTML = '<div>Usamos o <b>Pixel da Meta</b> para medir se nossos anúncios no Instagram e no Facebook funcionam. Isso usa cookies. Você pode recusar e continuar usando o catálogo normalmente. ' +
      '<a href="privacidade.html">Saiba mais</a>.</div>' +
      '<div class="linha"><button type="button" id="meta-nao">Recusar</button><button type="button" class="sim" id="meta-sim">Aceitar</button></div>';
    document.body.appendChild(d);
    document.getElementById('meta-sim').addEventListener('click', function () { gravar('sim'); d.remove(); carregar(); });
    document.getElementById('meta-nao').addEventListener('click', function () { gravar('nao'); d.remove(); });
  }

  window.TKMeta = {
    /** Chamado depois de ler a configuração pública. Sem ID válido: não faz nada. */
    iniciar: function (id) {
      pixelId = String(id || '').trim();
      if (!idValido(pixelId)) return;
      var c = ler();
      if (c === 'sim') carregar();
      else if (c !== 'nao') aviso();
    },
    ativo: function () { return ligado && typeof window.fbq === 'function'; },
    /** Registra um evento do Pixel. Sem Pixel ligado, não faz nada. eventId liga o evento do navegador ao do servidor (sem contar 2x). */
    evento: function (nome, dados, eventId) {
      if (!this.ativo()) return;
      try { window.fbq('track', nome, dados || {}, eventId ? { eventID: eventId } : undefined); } catch (e) {}
    },
    /** Dados do navegador que a API de Conversões aceita (cookies _fbp/_fbc), só se a pessoa aceitou. */
    cookies: function () {
      if (!this.ativo()) return null;
      var m = function (k) { var r = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)')); return r ? decodeURIComponent(r[1]) : ''; };
      return { fbp: m('_fbp'), fbc: m('_fbc') };
    }
  };
})();
