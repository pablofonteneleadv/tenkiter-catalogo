/* v7.4 — Menu lateral da vitrine (mockup aprovado em 24/10/2026).
 * Abre pelo botão ☰ do cabeçalho (#btn-menu-header). Só REUSA o que já existe:
 * filtros de categoria, janela de favoritos, seleção, conta, instalar o app e o WhatsApp fixo da loja.
 * A janela entra na pilha TKCamadas (botão voltar fecha só o menu) e na lista JANELAS do a11y.js (foco/Esc/Tab). */
(function () {
  'use strict';
  var btn = document.getElementById('btn-menu-header');
  if (!btn) return;
  var el = null;
  var pendente = null;
  var categoriasAbertas = true;

  function tem(fn) { return typeof window[fn] === 'function' || (function () { try { return typeof eval(fn) === 'function'; } catch (e) { return false; } })(); }
  function logado() { try { return !!(window.TKSessao && window.TKSessao.logado()); } catch (e) { return false; } }
  function qtdSelecao() { try { return typeof getSacola === 'function' ? getSacola().length : 0; } catch (e) { return 0; } }

  /** Categorias e contagem de peças ATIVAS (esgotadas ficam de fora, como nos filtros). */
  function categorias() {
    var mapa = {};
    var lista = (typeof produtos !== 'undefined' && Array.isArray(produtos)) ? produtos : [];
    lista.forEach(function (p) {
      if (typeof estaEsgotado === 'function' && estaEsgotado(p)) return;
      String(p.Categoria || '').split(',').forEach(function (c) {
        c = c.trim(); if (c) mapa[c] = (mapa[c] || 0) + 1;
      });
    });
    return Object.keys(mapa).sort(function (a, b) { return (mapa[b] - mapa[a]) || a.localeCompare(b, 'pt-BR'); })
      .map(function (c) { return [c, mapa[c]]; });
  }

  function css() {
    if (document.getElementById('tk-menu-css')) return;
    var s = document.createElement('style');
    s.id = 'tk-menu-css';
    s.textContent =
      '#menu-lateral{position:fixed;inset:0;z-index:100;display:none}' +
      '#menu-lateral.aberto{display:block}' +
      '#menu-lateral .ml-fundo{position:absolute;inset:0;background:rgba(44,44,44,.5)}' +
      '#menu-lateral .ml-painel{position:absolute;top:0;left:0;bottom:0;width:86%;max-width:330px;background:#fff;color:#2C2C2C;display:flex;flex-direction:column;box-shadow:4px 0 16px rgba(0,0,0,.14)}' +
      '#menu-lateral .ml-topo{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:2px solid #E67E22}' +
      '#menu-lateral .ml-marca{display:flex;align-items:center;gap:8px;font:800 1rem Poppins,Inter,sans-serif}' +
      '#menu-lateral .ml-marca img{height:34px;width:auto}' +
      '#menu-lateral .ml-corpo{flex:1;overflow:auto;padding:8px 12px;overscroll-behavior:contain}' +
      '#menu-lateral .ml-item{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:50px;border:0;border-bottom:1px solid #EFE8DA;background:none;padding:0 4px;font:600 15px Inter,system-ui,sans-serif;color:#2C2C2C;text-align:left;cursor:pointer;border-radius:0}' +
      '#menu-lateral .ml-item[aria-current]{color:#A85200}' +
      '#menu-lateral .ml-dica{color:#666;font-size:12px;font-weight:400}' +
      '#menu-lateral .ml-sub{display:flex;align-items:center;width:100%;min-height:44px;padding:0 16px;font:400 14px Inter,system-ui,sans-serif;color:#2C2C2C;border:0;background:none;text-align:left;cursor:pointer;border-radius:0}' +
      '#menu-lateral .ml-sub .ml-n{margin-left:auto;color:#666;font-size:13px}' +
      '#menu-lateral .ml-sub.ml-todas{font-weight:700;color:#A85200}' +
      '#menu-lateral .ml-ajuda{margin:18px 4px 6px;padding:14px;border-radius:16px;background:#F5F1E8}' +
      '#menu-lateral .ml-ajuda p{margin:0 0 4px;font:700 15px Poppins,Inter,sans-serif}' +
      '#menu-lateral .ml-ajuda span{display:block;margin:0 0 12px;font-size:13px;color:#4a4a46;line-height:1.5}' +
      '#menu-lateral .ml-ajuda button{width:100%;min-height:48px;border:0;border-radius:12px;background:#E67E22;color:#0d0d0d;font:800 15px Poppins,Inter,sans-serif;box-shadow:0 2px 0 #B85F12;cursor:pointer}' +
      '#menu-lateral .ml-rodape{padding:12px 16px;border-top:1px solid #EFE8DA;font-size:12px;color:#4a4a46;line-height:1.5}' +
      '#menu-lateral .ml-fechar{width:auto;flex:none;min-height:44px;min-width:44px;padding:0 12px;border-radius:999px;border:1px solid #2C2C2C;background:#fff;color:#2C2C2C;font:600 14px Inter,system-ui,sans-serif;cursor:pointer}' +
      '#menu-lateral button:focus-visible{outline:2px solid #A85200;outline-offset:2px}';
    document.head.appendChild(s);
  }

  function no(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function item(rotulo, dica, acao, atual) {
    var b = no('button', 'ml-item'); b.type = 'button';
    b.appendChild(document.createTextNode(rotulo));
    if (dica) b.appendChild(no('span', 'ml-dica', dica));
    if (atual) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', acao);
    return b;
  }

  /** Fecha o menu e, só DEPOIS de a pilha de janelas fechar, roda a ação (evita brigar com o histórico). */
  function fecharEDepois(fn) {
    pendente = fn || null;
    if (window.TKCamadas && TKCamadas.aberta('menu-lateral')) TKCamadas.desempilhar('menu-lateral');
    else { esconder(); rodarPendente(); }
  }
  function rodarPendente() { var f = pendente; pendente = null; if (f) setTimeout(f, 0); }
  function esconder() { if (el) el.classList.remove('aberto'); try { btn.focus(); } catch (e) {} }

  function irParaCategoria(cat) {
    try {
      var limpar = document.getElementById('btn-limpar'); if (limpar) limpar.click();
      if (typeof filtroCategorias !== 'undefined') {
        filtroCategorias.add(cat);
        if (typeof renderizarPillsCategoria === 'function') renderizarPillsCategoria();
        if (typeof renderizarChipsFiltro === 'function' && typeof categoriasDisponiveis !== 'undefined') renderizarChipsFiltro('chips-categoria', categoriasDisponiveis, filtroCategorias, 'resumo-categoria');
        if (typeof aplicarFiltros === 'function') aplicarFiltros();
      }
      var g = document.getElementById('grid'); if (g) g.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (e) {}
  }
  function verTodas() {
    var limpar = document.getElementById('btn-limpar'); if (limpar) limpar.click();
    var g = document.getElementById('grid'); if (g) g.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function instalarApp() {
    var b = document.getElementById('btn-instalar');
    if (b && !b.hidden) { b.click(); return; }
    var s = document.getElementById('instalar-app');   // sem convite do navegador: o passo a passo fica no rodapé
    if (s) s.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function montar() {
    css();
    if (!el) {
      el = no('div'); el.id = 'menu-lateral';
      el.addEventListener('click', function (ev) { if (ev.target.classList.contains('ml-fundo')) fecharEDepois(); });
      document.addEventListener('tk:camada-fechada', function (ev) {
        if (ev && ev.detail && ev.detail.chave === 'menu-lateral') { esconder(); rodarPendente(); }
      });
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    var painel = no('aside', 'ml-painel');
    painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-modal', 'true'); painel.setAttribute('aria-label', 'Menu');

    var topo = no('div', 'ml-topo');
    var marca = no('div', 'ml-marca');
    var img = document.createElement('img'); img.src = 'logo-mark.png'; img.alt = ''; marca.appendChild(img);
    marca.appendChild(no('span', '', 'TENKiTER'));
    var fechar = no('button', 'ml-fechar btn-fechar', 'Fechar'); fechar.type = 'button'; fechar.setAttribute('aria-label', 'Fechar menu');
    fechar.addEventListener('click', function () { fecharEDepois(); });
    topo.appendChild(marca); topo.appendChild(fechar);

    var corpo = no('div', 'ml-corpo');
    corpo.appendChild(item('Início', '', function () { fecharEDepois(function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }); }, true));

    var lista = categorias();
    var cab = no('button', 'ml-item'); cab.type = 'button'; cab.setAttribute('aria-expanded', categoriasAbertas ? 'true' : 'false');
    cab.appendChild(document.createTextNode('Categorias'));
    var sinal = no('span', '', categoriasAbertas ? '−' : '+'); sinal.style.cssText = 'color:#A85200;font-size:18px'; cab.appendChild(sinal);
    var caixa = no('div'); caixa.style.cssText = 'padding:4px 0 8px'; caixa.hidden = !categoriasAbertas;
    lista.forEach(function (par) {
      var b = no('button', 'ml-sub'); b.type = 'button';
      b.appendChild(document.createTextNode(par[0]));
      b.appendChild(no('span', 'ml-n', String(par[1])));
      b.addEventListener('click', function () { fecharEDepois(function () { irParaCategoria(par[0]); }); });
      caixa.appendChild(b);
    });
    var todas = no('button', 'ml-sub ml-todas', 'Ver todas as peças'); todas.type = 'button';
    todas.addEventListener('click', function () { fecharEDepois(verTodas); });
    caixa.appendChild(todas);
    cab.addEventListener('click', function () {
      categoriasAbertas = !categoriasAbertas; caixa.hidden = !categoriasAbertas;
      cab.setAttribute('aria-expanded', categoriasAbertas ? 'true' : 'false'); sinal.textContent = categoriasAbertas ? '−' : '+';
    });
    corpo.appendChild(cab); corpo.appendChild(caixa);

    corpo.appendChild(item('Favoritos', logado() ? '' : 'entre para salvar', function () {
      fecharEDepois(function () { if (typeof abrirFavoritos === 'function') abrirFavoritos(); else { var f = document.getElementById('btn-favoritos-header'); if (f) f.click(); } });
    }));
    var n = qtdSelecao();
    corpo.appendChild(item('Minha seleção', n ? (n + (n === 1 ? ' peça' : ' peças')) : '', function () {
      fecharEDepois(function () { if (typeof abrirSacola === 'function') abrirSacola(); else { var s = document.getElementById('btn-sacola-header'); if (s) s.click(); } });
    }));
    corpo.appendChild(item('Minha conta', logado() ? '' : 'Entrar', function () {
      fecharEDepois(function () { var c = document.getElementById('btn-conta-header'); if (c) c.click(); });
    }));
    corpo.appendChild(item('Instalar o app', 'no celular', function () { fecharEDepois(instalarApp); }));

    var ajuda = no('div', 'ml-ajuda');
    ajuda.appendChild(no('p', '', 'Precisa de ajuda para escolher?'));
    ajuda.appendChild(no('span', '', 'Fale com a equipe da loja pelo WhatsApp sobre qualquer peça.'));
    var consulte = no('button', '', 'Consulte a loja'); consulte.type = 'button';
    consulte.addEventListener('click', function () { fecharEDepois(function () { window.open(linkWhatsApp('Olá! Preciso de ajuda para escolher uma peça.'), '_blank', 'noopener'); }); });
    ajuda.appendChild(consulte); corpo.appendChild(ajuda);

    var rod = no('div', 'ml-rodape');
    rod.appendChild(document.createTextNode('Rua Dr. Moreira da Rocha, 759 · Crateús-CE'));
    rod.appendChild(document.createElement('br'));
    rod.appendChild(document.createTextNode('Retire na loja. 10% de desconto à vista.'));

    painel.appendChild(topo); painel.appendChild(corpo); painel.appendChild(rod);
    var fundo = no('div', 'ml-fundo'); fundo.setAttribute('aria-hidden', 'true');
    el.appendChild(fundo); el.appendChild(painel);
  }

  function abrir() {
    montar();
    el.classList.add('aberto');
    btn.setAttribute('aria-expanded', 'true');
    if (window.TKCamadas) TKCamadas.empilhar('menu-lateral', function () { el.classList.remove('aberto'); btn.setAttribute('aria-expanded', 'false'); });
    var f = el.querySelector('.ml-fechar'); if (f) f.focus();
  }

  btn.addEventListener('click', abrir);
})();
