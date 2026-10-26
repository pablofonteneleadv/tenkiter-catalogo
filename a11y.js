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
 *
 * v3.10 (FE-06) — modernização gradual: `var` -> `const`/`let`, funções de callback em arrow e
 * optional chaining. Nenhuma mudança de comportamento: os mesmos seletores, a mesma ordem e os
 * mesmos efeitos. O arquivo continua sendo um IIFE com 'use strict' (nada vaza para o global).
 * ==================================================================== */
(() => {
  'use strict';

  /* ---------- 1. rótulos ---------- */
  let seq = 0;
  const CAMPO = 'input:not([type=hidden]),select,textarea';

  const ligarRotulos = (raiz) => {
    const labels = (raiz || document).querySelectorAll('label:not([for])');
    for (const lb of labels) {
      if (lb.querySelector(CAMPO)) continue;                       // o campo está dentro do label: já vale
      let alvo = lb.nextElementSibling;
      while (alvo && alvo.tagName === 'BR') alvo = alvo.nextElementSibling;
      if (!alvo) continue;
      if (alvo.matches?.(CAMPO)) {
        if (!alvo.id) alvo.id = 'tk-campo-' + (++seq);
        lb.setAttribute('for', alvo.id);
      } else if (alvo.querySelector) {
        const unico = alvo.querySelectorAll(CAMPO);
        if (!unico.length) continue;
        const tipo = unico[0].type;
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
  };

  /* ---------- 1b. áreas clicáveis (cartão do manual, logo) viram botão de teclado ---------- */
  const CLICAVEIS = '.card[data-manual],#brand-home,[data-tk-btn]';
  const tornarTeclado = (raiz) => {
    const l = (raiz || document).querySelectorAll(CLICAVEIS);
    for (const el of l) {
      if (el.hasAttribute('data-tk-ok')) continue;
      if (el.querySelector('button,a[href],input,select,textarea')) continue;   // já tem controle de verdade lá dentro
      el.setAttribute('data-tk-ok', '1');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.getAttribute('role')) el.setAttribute('role', 'button');
    }
  };
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const el = ev.target;
    if (!el?.getAttribute || el.getAttribute('data-tk-ok') !== '1' || ev.target !== el) return;
    ev.preventDefault();
    el.click();
  });

  /* ---------- 2. janelas ---------- */
  const JANELAS = '#overlay,#overlay-sacola,#overlay-compartilhar,.overlay-sheet,.overlay-sheet-loja,#modal-conta,#login-overlay,#tkp-janela,#tkc-recuperar,#menu-lateral';
  const BOTOES_FECHAR = '[aria-label="Fechar"],.sheet-x,.conta-fechar,.btn-fechar,#btn-fechar-arte-config,#btn-fechar-auditoria';
  const FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const NOMES = {
    'overlay': 'Detalhes da peça', 'overlay-sacola': 'Sua sacola', 'overlay-compartilhar': 'Compartilhar',
    'login-overlay': 'Entrar', 'modal-conta': 'Minha conta', 'overlay-categorias': 'Escolher categoria', 'tkp-janela': 'Avisos', 'tkc-recuperar': 'Esqueci minha senha'
  };
  const lembrar = new WeakMap();      // janela -> elemento que tinha o foco antes de abrir

  const aberta = (el) => el.classList.contains('aberto') || el.classList.contains('visivel');
  const visivel = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const abertas = () => [...document.querySelectorAll(JANELAS)].filter(aberta);
  const topo = () => {
    let melhor = null, z = -1;
    abertas().forEach((el) => { const v = parseInt(getComputedStyle(el).zIndex, 10) || 0; if (v >= z) { z = v; melhor = el; } });
    return melhor;
  };
  const corpo = (el) => el.querySelector('[role=dialog]') || el.firstElementChild || el;

  const aoAbrir = (el) => {
    if (lembrar.has(el)) return;
    lembrar.set(el, document.activeElement);
    const c = corpo(el);
    if (!el.getAttribute('role') && !c.getAttribute('role')) {
      c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true');
      if (!c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby')) c.setAttribute('aria-label', NOMES[el.id] || 'Janela');
    }
    if (!c.hasAttribute('tabindex')) { c.setAttribute('tabindex', '-1'); c.style.outline = 'none'; }
    setTimeout(() => { try { c.focus({ preventScroll: true }); } catch (e) { c.focus(); } }, 30);
  };
  const aoFechar = (el) => {
    const antes = lembrar.get(el);
    lembrar.delete(el);
    if (antes && antes !== document.body && document.contains(antes) && typeof antes.focus === 'function') {
      try { antes.focus({ preventScroll: true }); } catch (e) { /* ignora */ }
    }
  };
  const sincronizar = (el) => { if (aberta(el)) aoAbrir(el); else if (lembrar.has(el)) aoFechar(el); };

  document.addEventListener('keydown', (ev) => {
    const el = topo();
    if (!el) return;
    if (ev.key === 'Escape') {
      if (el.id === 'login-overlay') return;                     // entrar é obrigatório: Esc não fecha
      const b = [...el.querySelectorAll(BOTOES_FECHAR)].filter(visivel)[0];
      if (b) { ev.preventDefault(); b.click(); }
      return;
    }
    if (ev.key === 'Tab') {                                       // mantém o Tab dentro da janela
      const c = corpo(el);
      const f = [...c.querySelectorAll(FOCAVEIS)].filter(visivel);
      if (!f.length) { ev.preventDefault(); return; }
      const i = f.indexOf(document.activeElement);
      if (ev.shiftKey && (i <= 0)) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && (i === f.length - 1 || i === -1 && !c.contains(document.activeElement))) { ev.preventDefault(); f[0].focus(); }
    }
  });

  /* janelas criadas depois (ex.: a de avisos, montada por push.js) também passam a ser acompanhadas */
  const observarJanelas = () => {
    document.querySelectorAll(JANELAS).forEach((el) => {
      if (el.hasAttribute('data-tk-obs')) return;
      el.setAttribute('data-tk-obs', '1');
      sincronizar(el);
      new MutationObserver(() => { sincronizar(el); }).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
  };

  const iniciar = () => {
    ligarRotulos(document); tornarTeclado(document);
    observarJanelas();
    /* v7.25: antes cada mudança em qualquer lugar (até um texto trocado) varria a página inteira; no painel, com centenas de
     * peças, isso travava a tela ao abrir janelas (ex.: Enquadrar). Agora só olha onde entrou elemento novo; troca de texto não conta. */
    let agendado = false; const pais = new Set();
    new MutationObserver((recs) => {
      for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1 && r.target && r.target.nodeType === 1) pais.add(r.target);
      if (!pais.size || agendado) return; agendado = true;
      (window.requestAnimationFrame || setTimeout)(() => {
        agendado = false; const lista = [...pais]; pais.clear();
        for (const p of lista) { if (!p.isConnected) continue; ligarRotulos(p); tornarTeclado(p); }
        observarJanelas();
      });
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();

/* v7.1 NAV-1/A11Y-2/VIT-4 (so no catalogo). NAV-1: o nav.js reescreve o
   innerHTML do MESMO <nav> de forma assincrona (permissoes/tk:sessao) e
   apagava os itens de compra. Sem Favoritos e sem Categorias, por pedido. */
(() => {
  'use strict';
  if (!document.getElementById('grid')) return;
  // v7.4 (mockup aprovado 24/10/2026): Início, Buscar, Seleção, Favoritos e Atendente.
  const IT = [['inicio', 'index.html', '\u{1F3E0}', 'In\u00edcio'], ['buscar', '#busca', '\u{1F50E}', 'Buscar'],
    ['selecao', '#selecao', '\u{1F6CD}', 'Sele\u00e7\u00e3o'], ['favoritos', '#favoritos', '\u{2764}\u{FE0F}', 'Favoritos'],
    ['atendente', '#atendente', '\u{1F4AC}', 'Atendente']];
  const SIG = IT.map((i) => i[0]).join(',');
  const EQ = ['admin.html', 'curriculos.html', 'painel=rh'];
  const NAV = () => document.querySelector('.tk-nav');
  const QT = () => { try { return typeof getSacola === 'function' ? getSacola().length : 0; } catch (e) { return 0; } };

  const ACAO = (id) => {
    if (id === 'buscar') {
      const c = document.getElementById('busca');
      if (!c) return;
      try { c.focus({ preventScroll: true }); } catch (e) { c.focus(); }
      try { c.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
      return;
    }
    if (id === 'selecao') {
      if (typeof abrirSacola === 'function') return abrirSacola();
      const b = document.querySelector('[data-abrir-sacola], #btn-sacola');
      if (b) b.click();
      return;
    }
    if (id === 'favoritos') {
      if (typeof abrirFavoritos === 'function') return abrirFavoritos();
      const f = document.getElementById('btn-favoritos-header');
      if (f) f.click();
      return;
    }
    let n = '';
    try { n = window.WHATSAPP_NUMERO || ''; } catch (e) {}
    window.open('https://wa.me/' + (n || '5588993223998') + '?text=' +
      encodeURIComponent('Ol\u00e1! Vim pelo cat\u00e1logo e quero ajuda para escolher uma pe\u00e7a.'), '_blank', 'noopener');
  };

  const MONTAR = () => {
    const el = NAV();
    if (!el) return;
    const as = Array.from(el.querySelectorAll('a'));
    if (as.some((a) => EQ.some((x) => (a.getAttribute('href') || '').indexOf(x) !== -1))) return;
    if (as.map((a) => a.dataset.nav || '').join(',') === SIG) {
      const b = el.querySelector('[data-nav="selecao"] .tk-b');
      if (b) b.textContent = QT();
      return;
    }
    el.innerHTML = '';
    IT.forEach(([id, href, ico, rot]) => {
      const a = document.createElement('a'), i = document.createElement('span'),
        r = document.createElement('span');
      a.href = href; a.dataset.nav = id;
      if (id === 'inicio') { a.className = 'tk-ativo'; a.setAttribute('aria-current', 'page'); }
      i.className = 'tk-i'; i.setAttribute('aria-hidden', 'true'); i.textContent = ico;
      r.className = 'tk-r'; r.textContent = rot;
      if (id === 'selecao' && QT() > 0) {
        const b = document.createElement('span');
        b.className = 'tk-b'; b.textContent = QT(); r.appendChild(b);
      }
      a.append(i, r);
      if (id !== 'inicio') a.addEventListener('click', (e) => { e.preventDefault(); ACAO(id); });
      el.appendChild(a);
    });
  };

  const NOMES = () => {
    document.querySelectorAll('.ac-pedir').forEach((b) => {
      const rot = b.querySelector('.v7-rot');
      if (!rot) return;
      const vis = (rot.textContent || '').trim();
      if (!vis) return;
      Array.from(b.childNodes).forEach((n) => { if (n.nodeType === 3) n.textContent = ''; });
      const ar = String(b.getAttribute('aria-label') || '');
      if (ar.toLowerCase().indexOf(vis.toLowerCase()) !== 0) b.setAttribute('aria-label', vis + (ar.indexOf(':') > -1 ? ar.slice(ar.indexOf(':')) : ''));
    });
  };

  const CONTAR = (v, c) => {
    try {
      const l = typeof produtos !== 'undefined' && produtos ? produtos : [];
      return l.filter((p) => {
        if (typeof estaEsgotado === 'function' && estaEsgotado(p)) return false;
        const b = c === 'cor' ? p.Cores : c === 'tamanho' ? p.Tamanhos : p[c];
        const t = typeof textoPlano === 'function' ? textoPlano(b) : b;
        return (typeof listaDeTags === 'function' ? listaDeTags(t) : []).indexOf(v) !== -1;
      }).length;
    } catch (e) { return 0; }
  };
  const FACETAS = () => {
    [['chips-categoria', 'Categoria'], ['chips-genero', 'Genero'], ['chips-cor', 'cor'], ['chips-tamanho', 'tamanho']].forEach(([id, c]) => {
      const box = document.getElementById(id);
      if (!box) return;
      box.querySelectorAll('button.chip').forEach((el) => {
        if (el.querySelector('.chip-n')) return;
        const v = (el.textContent || '').trim();
        if (!v) return;
        const n = CONTAR(v, c), s = document.createElement('span');
        s.className = 'chip-n'; s.setAttribute('aria-hidden', 'true'); s.textContent = n;
        el.appendChild(s);
        el.setAttribute('aria-label', v + ': ' + n + (n === 1 ? ' pe\u00e7a' : ' pe\u00e7as'));
      });
    });
  };

  let pb = false, pf = false;
  const AG_B = () => { if (pb) return; pb = true; (window.requestAnimationFrame || setTimeout)(() => { pb = false; MONTAR(); }); };
  const AG_F = () => { if (pf) return; pf = true; (window.requestAnimationFrame || setTimeout)(() => { pf = false; NOMES(); FACETAS(); }); };

  const INICIAR = () => {
    const el = NAV();
    if (el) {
      MONTAR();
      new MutationObserver(AG_B).observe(el, { childList: true });
      window.addEventListener('tk:sessao', () => setTimeout(AG_B, 0));
      window.addEventListener('storage', (e) => { if (!e || !e.key || e.key === 'tm_session') setTimeout(AG_B, 0); });
      const api = window.TenkiterNav;
      if (api && typeof api.redesenhar === 'function' && !api.redesenhar.__v71) {
        const o = api.redesenhar, f = function () { const r = o.apply(this, arguments); MONTAR(); return r; };
        f.__v71 = true; api.redesenhar = f;
      }
    }
    AG_F();
    new MutationObserver(AG_F).observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', INICIAR); else INICIAR();
})();
