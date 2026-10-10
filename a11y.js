/* ====================================================================
 * TENKiTER — acessibilidade comum (carregada em TODAS as páginas)
 *
 * O que faz (sem depender de cada tela lembrar de fazer):
 *  1. Rótulos: todo <label> sem "for" é ligado ao campo que vem logo depois dele (o leitor de tela passa a
 *     dizer "Senha, campo de senha" em vez de "campo de edição"). Pergunta com várias opções
 *     (rádio/caixas) vira um grupo com nome.
 *  1b. Áreas clicáveis sem botão (cartão de manual, logo): ganham foco por Tab e Enter/Espaço.
 *  2. Janelas (modal, gaveta, sacola, folha de categorias): ao abrir, o foco vai para dentro; Tab não
 *     "foge" para trás da janela; Esc fecha; ao fechar, o foco volta para quem abriu.
 *
 * Não muda nenhuma regra de negócio nem o visual. Se esta página não tiver nada disso, não faz nada.
 * ==================================================================== */
(function () {
  'use strict';

  /* ---------- 1. rótulos ---------- */
  var seq = 0;
  var CAMPO = 'input:not([type=hidden]),select,textarea';

  function ligarRotulos(raiz) {
    var labels = (raiz || document).querySelectorAll('label:not([for])');
    for (var i = 0; i < labels.length; i++) {
      var lb = labels[i];
      if (lb.querySelector(CAMPO)) continue;                       // o campo está dentro do label: já vale
      var alvo = lb.nextElementSibling;
      while (alvo && alvo.tagName === 'BR') alvo = alvo.nextElementSibling;
      if (!alvo) continue;
      if (alvo.matches && alvo.matches(CAMPO)) {
        if (!alvo.id) alvo.id = 'tk-campo-' + (++seq);
        lb.setAttribute('for', alvo.id);
      } else if (alvo.querySelector) {
        var unico = alvo.querySelectorAll(CAMPO);
        if (!unico.length) continue;
        var tipo = unico[0].type;
        if (unico.length === 1 && tipo !== 'radio' && tipo !== 'checkbox') {   // campo envolvido por um <div>
          if (!unico[0].id) unico[0].id = 'tk-campo-' + (++seq);
          lb.setAttribute('for', unico[0].id);
        } else if (!alvo.getAttribute('role')) {                                  // várias opções: grupo com nome
          if (!lb.id) lb.id = 'tk-rot-' + (++seq);
          alvo.setAttribute('role', tipo === 'radio' ? 'radiogroup' : 'group');
          alvo.setAttribute('aria-labelledby', lb.id);
        }
      }
    }
  }

  /* ---------- 1b. áreas clicáveis (cartão do manual, logo) viram botão de teclado ---------- */
  var CLICAVEIS = '.card[data-manual],#brand-home,[data-tk-btn]';
  function tornarTeclado(raiz) {
    var l = (raiz || document).querySelectorAll(CLICAVEIS);
    for (var i = 0; i < l.length; i++) {
      var el = l[i];
      if (el.hasAttribute('data-tk-ok')) continue;
      if (el.querySelector('button,a[href],input,select,textarea')) continue;   // já tem controle de verdade lá dentro
      el.setAttribute('data-tk-ok', '1');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.getAttribute('role')) el.setAttribute('role', 'button');
    }
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var el = ev.target;
    if (!el || !el.getAttribute || el.getAttribute('data-tk-ok') !== '1' || ev.target !== el) return;
    ev.preventDefault();
    el.click();
  });

  /* ---------- 2. janelas ---------- */
  var JANELAS = '#overlay,#overlay-sacola,#overlay-compartilhar,.overlay-sheet,#modal-conta,#login-overlay';
  var BOTOES_FECHAR = '[aria-label="Fechar"],.sheet-x,.conta-fechar,.btn-fechar,#btn-fechar-arte-config,#btn-fechar-auditoria';
  var FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var NOMES = {
    'overlay': 'Detalhes da peça', 'overlay-sacola': 'Sua sacola', 'overlay-compartilhar': 'Compartilhar',
    'login-overlay': 'Entrar', 'modal-conta': 'Minha conta', 'overlay-categorias': 'Escolher categoria'
  };
  var lembrar = new WeakMap();      // janela -> elemento que tinha o foco antes de abrir

  function aberta(el) { return el.classList.contains('aberto') || el.classList.contains('visivel'); }
  function visivel(e) { return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); }
  function abertas() {
    return Array.prototype.filter.call(document.querySelectorAll(JANELAS), aberta);
  }
  function topo() {
    var l = abertas(), melhor = null, z = -1;
    l.forEach(function (el) { var v = parseInt(getComputedStyle(el).zIndex, 10) || 0; if (v >= z) { z = v; melhor = el; } });
    return melhor;
  }
  function corpo(el) { return el.querySelector('[role=dialog]') || el.firstElementChild || el; }

  function aoAbrir(el) {
    if (lembrar.has(el)) return;
    lembrar.set(el, document.activeElement);
    var c = corpo(el);
    if (!el.getAttribute('role') && !c.getAttribute('role')) {
      c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true');
      if (!c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby')) c.setAttribute('aria-label', NOMES[el.id] || 'Janela');
    }
    if (!c.hasAttribute('tabindex')) { c.setAttribute('tabindex', '-1'); c.style.outline = 'none'; }
    setTimeout(function () { try { c.focus({ preventScroll: true }); } catch (e) { c.focus(); } }, 30);
  }
  function aoFechar(el) {
    var antes = lembrar.get(el);
    lembrar.delete(el);
    if (antes && antes !== document.body && document.contains(antes) && typeof antes.focus === 'function') {
      try { antes.focus({ preventScroll: true }); } catch (e) { /* ignora */ }
    }
  }
  function sincronizar(el) { if (aberta(el)) aoAbrir(el); else if (lembrar.has(el)) aoFechar(el); }

  document.addEventListener('keydown', function (ev) {
    var el = topo();
    if (!el) return;
    if (ev.key === 'Escape') {
      if (el.id === 'login-overlay') return;                     // entrar é obrigatório: Esc não fecha
      var b = Array.prototype.filter.call(el.querySelectorAll(BOTOES_FECHAR), visivel)[0];
      if (b) { ev.preventDefault(); b.click(); }
      return;
    }
    if (ev.key === 'Tab') {                                       // mantém o Tab dentro da janela
      var c = corpo(el);
      var f = Array.prototype.filter.call(c.querySelectorAll(FOCAVEIS), visivel);
      if (!f.length) { ev.preventDefault(); return; }
      var i = f.indexOf(document.activeElement);
      if (ev.shiftKey && (i <= 0)) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && (i === f.length - 1 || i === -1 && !c.contains(document.activeElement))) { ev.preventDefault(); f[0].focus(); }
    }
  });

  function iniciar() {
    ligarRotulos(document); tornarTeclado(document);
    document.querySelectorAll(JANELAS).forEach(function (el) {
      sincronizar(el);
      new MutationObserver(function () { sincronizar(el); }).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    var agendado = false;
    new MutationObserver(function () {
      if (agendado) return; agendado = true;
      (window.requestAnimationFrame || setTimeout)(function () { agendado = false; ligarRotulos(document); tornarTeclado(document); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
