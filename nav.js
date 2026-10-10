/* ====================================================================
 * TENKiTER Modas — nav.js — barra inferior ÚNICA do site inteiro
 *
 * Todas as páginas (catálogo, gestão, treinamentos, RH, currículos e
 * candidatura) usam este mesmo arquivo: mesma barra, mesma ordem, mesmo
 * visual, e só aparece o que a pessoa pode acessar.
 *
 *   <script src="nav.js" data-ativo="catalogo"></script>   (no fim do <body>)
 *
 * Quem aparece para quem
 *   Catálogo ........ todos
 *   Gestão .......... catalogo_admin        -> admin.html
 *   Treinamentos .... visitante ou perm "portal" -> treinamentos.html
 *   RH .............. equipe_relatorio / gerir_manuais / gerir_acessos
 *                     -> treinamentos.html?painel=rh (abre o painel do RH direto)
 *   Currículos ...... dados_pessoais / gerir_acessos -> curriculos.html
 *   Trabalhe conosco  só quem NÃO é da equipe -> curriculo.html (candidatura)
 *
 * Permissões: lê o cache local (instantâneo, sem "pisca") e se atualiza
 * sozinha no catálogo (mesmo login do portal) quando a página já carregou
 * common.js. Páginas que sabem as permissões (treinamentos.html) chamam
 * TenkiterNav.setPerms([...]) e TenkiterNav.ativo('rh').
 * Nunca guarda senha: só a lista de permissões.
 * ==================================================================== */
(function () {
  'use strict';
  if (window.TenkiterNav) return;
  if (/[?&]embed=1/.test(location.search)) return; // página dentro de outra (iframe): sem barra

  var CHAVE_SESSAO = 'tm_session';
  var CHAVE_CACHE = 'tm_nav_perms';
  var TTL_MS = 5 * 60 * 1000;

  var ITENS = [
    { id: 'catalogo',     href: 'index.html',                 icone: '👗', rotulo: 'Catálogo' },
    { id: 'gestao',       href: 'admin.html',                 icone: '🔧', rotulo: 'Gestão',        qualquer: ['catalogo_admin'] },
    { id: 'treinamentos', href: 'treinamentos.html',          icone: '🎓', rotulo: 'Treinamentos',  visitanteOuPerm: 'portal' },
    { id: 'rh',           href: 'treinamentos.html?painel=rh', icone: '👥', rotulo: 'RH',            qualquer: ['equipe_relatorio', 'gerir_manuais', 'gerir_acessos'] },
    { id: 'curriculos',   href: 'curriculos.html',            icone: '📄', rotulo: 'Currículos',    qualquer: ['dados_pessoais', 'gerir_acessos'] },
    { id: 'candidatura',  href: 'curriculo.html',             icone: '✍️', rotulo: 'Trabalhe conosco', soVisitante: true }
  ];
  var CHAVES_EQUIPE = ['catalogo_admin', 'equipe_relatorio', 'gerir_manuais', 'dados_pessoais', 'gerir_acessos'];

  var perms = [];
  var logado = false;
  var ativoId = '';
  var nav = null;

  function lerJson(chave) { try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (e) { return null; } }
  function sessao() { var s = lerJson(CHAVE_SESSAO); return s && s.whatsapp ? s : null; }

  function lerCache() {
    var s = sessao();
    logado = !!s;
    if (!s) { perms = []; try { localStorage.removeItem(CHAVE_CACHE); } catch (e) {} return null; }
    var c = lerJson(CHAVE_CACHE);
    if (c && c.w === s.whatsapp && Array.isArray(c.p)) { perms = c.p; return c; }
    perms = [];
    return null;
  }
  function gravarCache(lista) {
    var s = sessao(); if (!s) return;
    try { localStorage.setItem(CHAVE_CACHE, JSON.stringify({ w: s.whatsapp, p: lista, t: Date.now() })); } catch (e) {}
  }

  function tem(chave) { return perms.indexOf(chave) !== -1; }
  function ehEquipe() { return CHAVES_EQUIPE.some(tem); }

  function visivel(it) {
    if (it.id === ativoId) return true; // a página em que a pessoa está sempre aparece (e destacada)
    if (it.qualquer) return it.qualquer.some(tem);
    if (it.visitanteOuPerm) return !logado || tem(it.visitanteOuPerm) || !perms.length; // sem lista ainda: mostra (a página decide o acesso)
    if (it.soVisitante) return !ehEquipe();
    return true;
  }

  function css() {
    if (document.getElementById('tk-nav-css')) return;
    var s = document.createElement('style');
    s.id = 'tk-nav-css';
    s.textContent =
      '@view-transition{navigation:auto}' +
      '.tk-nav{position:fixed;left:0;right:0;bottom:0;z-index:90;display:flex;background:#0d0d0d;border-top:1px solid rgba(255,255,255,.08);' +
        'box-shadow:0 -2px 10px rgba(0,0,0,.35);padding-bottom:env(safe-area-inset-bottom,0);view-transition-name:tk-nav;touch-action:manipulation}' +
      '.tk-nav a{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 2px 7px;' +
        'color:#9a9a9a;text-decoration:none;font:700 .64rem/1.1 "Inter",-apple-system,Roboto,Arial,sans-serif;text-align:center;position:relative;-webkit-tap-highlight-color:transparent}' +
      '.tk-nav a .tk-i{font-size:1.15rem;line-height:1}' +
      '.tk-nav a .tk-r{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.tk-nav a.tk-ativo{color:#ff7a1a}' +
      '.tk-nav a.tk-ativo::before{content:"";position:absolute;top:0;left:22%;right:22%;height:3px;border-radius:0 0 3px 3px;background:#ff7a1a}' +
      '.tk-nav a:active{background:rgba(255,255,255,.06)}' +
      '.tk-nav a:focus-visible{outline:2px solid #ff7a1a;outline-offset:-3px}' +
      'body.tk-tem-nav{padding-bottom:calc(76px + env(safe-area-inset-bottom,0px))}' +
      '@media (min-width:900px){.tk-nav{justify-content:center}.tk-nav a{flex:0 0 130px}}' +
      '@media (prefers-reduced-motion:reduce){@view-transition{navigation:none}}';
    document.head.appendChild(s);
  }

  function desenhar() {
    if (!document.body) return;
    css();
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'tk-nav';
      nav.setAttribute('aria-label', 'Navegação principal');
      document.body.appendChild(nav);
      document.body.classList.add('tk-tem-nav');
    }
    var html = ITENS.filter(visivel).map(function (it) {
      var atual = it.id === ativoId;
      return '<a href="' + it.href + '"' + (atual ? ' class="tk-ativo" aria-current="page"' : '') + ' data-nav="' + it.id + '">' +
        '<span class="tk-i" aria-hidden="true">' + it.icone + '</span><span class="tk-r">' + it.rotulo + '</span></a>';
    }).join('');
    if (nav.getAttribute('data-h') !== html) { nav.innerHTML = html; nav.setAttribute('data-h', html); }
  }

  /** Atualiza as permissões a partir do catálogo (mesmo login do portal). Só se common.js estiver na página. */
  function atualizarDoServidor() {
    var s = sessao();
    if (!s || !s.sessao) return;
    var c = lerJson(CHAVE_CACHE);
    if (c && c.w === s.whatsapp && Date.now() - (c.t || 0) < TTL_MS) return;
    var url = null;
    try { url = (typeof API_URL !== 'undefined') ? API_URL : null; } catch (e) { url = null; }
    if (!url) return;
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'sessao', whatsapp: s.whatsapp, sessao: s.sessao }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.usuario && Array.isArray(j.usuario.permissoes)) { perms = j.usuario.permissoes; gravarCache(perms); desenhar(); }
        else if (j && (j.sessaoInvalida || j.inativa)) { perms = []; try { localStorage.removeItem(CHAVE_CACHE); } catch (e) {} desenhar(); }
      })
      .catch(function () { /* sem rede: segue com o cache */ });
  }

  /** Pré-carrega as outras telas para o toque na barra abrir na hora. */
  function preCarregar() {
    var fazer = function () {
      ITENS.filter(visivel).forEach(function (it) {
        if (it.id === ativoId) return;
        var a = document.createElement('link'); a.rel = 'prefetch'; a.href = it.href.split('?')[0];
        document.head.appendChild(a);
      });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(fazer, { timeout: 4000 }); else setTimeout(fazer, 2500);
  }

  var API = {
    ativo: function (id) { ativoId = id || ''; desenhar(); },
    setPerms: function (lista) {
      logado = !!sessao();
      perms = Array.isArray(lista) ? lista.slice() : [];
      if (logado) gravarCache(perms);
      desenhar();
    },
    redesenhar: desenhar
  };
  window.TenkiterNav = API;

  // o <script> fica no fim do <body>: o DOM já existe. currentScript só vale agora, então guardamos antes.
  var _tag = document.currentScript;
  if (_tag) ativoId = _tag.getAttribute('data-ativo') || '';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { lerCache(); desenhar(); atualizarDoServidor(); preCarregar(); });
  else { lerCache(); desenhar(); atualizarDoServidor(); preCarregar(); }
})();
