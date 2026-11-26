/* 7.96.14 — Fase 0 do app 2.6: quanto cada área leva para abrir em cada aparelho (app ou navegador).
 * Só para a equipe logada; anônimo (sem WhatsApp, sem nome). "aparelho" é um código aleatório deste celular, criado aqui,
 * só para comparar os aparelhos da loja. Nunca atrapalha a tela: roda depois do carregamento e ignora qualquer falha. */
(function () {
  'use strict';
  function area() {
    try {
      const u = new URL(location.href), p = u.pathname.replace(/^\/+/, ''), q = u.searchParams;
      if (/^admin(\.html)?$/.test(p)) return q.get('app') === 'mensagens' ? 'mensagens' : q.get('abrir') === 'postagens' ? 'postagens' : 'gestao';
      if (/^esteira(\.html)?$/.test(p)) return 'esteira';
      if (/^treinamentos(\.html)?$/.test(p)) return q.get('painel') === 'rh' ? 'rh' : 'treinamento';
      if (/^curriculos(\.html)?$/.test(p)) return 'curriculos';
      if (p === '' || /^index(\.html)?$/.test(p)) return 'principal';
    } catch (e) { /* endereço estranho: não mede */ }
    return '';
  }
  function aparelho() {
    try {
      let a = localStorage.getItem('tk_aparelho_v1');
      if (!/^[a-z0-9]{6,16}$/.test(a || '')) { a = Math.random().toString(36).slice(2, 12).replace(/[^a-z0-9]/g, '') || 'semcodigo'; localStorage.setItem('tk_aparelho_v1', a); }
      return a;
    } catch (e) { return ''; }
  }
  function enviar() {
    try {
      const s = typeof getSessao === 'function' ? getSessao() : null;
      if (!s || !/^tk[123]\./.test(String(s.sessao || '')) || typeof INSTAGRAM_URL === 'undefined') return;
      const a = area(); if (!a) return;
      const n = performance.getEntriesByType && performance.getEntriesByType('navigation')[0]; if (!n || !(n.domContentLoadedEventEnd > 0)) return;
      const pronto = performance.getEntriesByName('tk:pronto', 'mark')[0], c = navigator.connection || {};
      let appV = ''; try { if (window.TKAndroid && typeof TKAndroid.versao === 'function') appV = String(TKAndroid.versao()); } catch (e) { appV = ''; }
      const siteV = ((document.querySelector('script[src*="medida-abertura.js"]')?.getAttribute('src') || '').match(/v=([0-9A-Za-z._-]+)/) || [])[1] || '';
      const corpo = {
        area: a, via: /TenkiterAndroid/.test(navigator.userAgent) ? 'app' : 'navegador',
        tipo: n.type === 'reload' ? 'recarga' : n.type === 'back_forward' ? 'volta' : 'frio',
        html_ms: Math.round(n.responseEnd), dom_ms: Math.round(n.domContentLoadedEventEnd), load_ms: Math.round(n.loadEventEnd || n.domContentLoadedEventEnd),
        pronto_ms: pronto ? Math.round(pronto.startTime) : 0, app_v: appV, site_v: siteV,
        rede: ['slow-2g', '2g', '3g', '4g'].includes(c.effectiveType) ? c.effectiveType : '', cpu: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0,
        aparelho: aparelho()
      };
      fetch(INSTAGRAM_URL + '/app/medida', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao }, body: JSON.stringify(corpo) }).catch(() => {});
    } catch (e) { /* a medida nunca atrapalha o trabalho */ }
  }
  // depois do carregamento e com folga: a sessão pode chegar um pouco depois; mede uma vez por abertura de página
  const agendar = () => setTimeout(enviar, 4000);
  if (document.readyState === 'complete') agendar(); else window.addEventListener('load', agendar, { once: true });
})();
