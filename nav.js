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
 *
 * v3.10 (FE-06) — modernização gradual: `var` -> `const`/`let`, callbacks em arrow e optional
 * chaining. Comportamento idêntico: mesmos itens, mesma ordem, mesmos seletores e efeitos.
 * ==================================================================== */
/* TKOcupado — "estou salvando": enquanto houver gravação em andamento, puxar a tela para baixo (recarregar) é bloqueado e fechar/recarregar
 * pede confirmação. Uso: const fim = TKOcupado.inicio('excluindo avaliação'); ... fim();  (fim pode ser chamado mais de uma vez). */
(() => {
  'use strict';
  if (window.TKOcupado) return;
  let n = 0, est = null;
  const liga = () => {
    if (!est) { est = document.createElement('style'); est.textContent = 'html,body{overscroll-behavior-y:contain!important}'; (document.head || document.documentElement).appendChild(est); }
  };
  const desliga = () => { if (est?.parentNode) est.parentNode.removeChild(est); est = null; };
  window.TKOcupado = {
    inicio: () => { n++; liga(); let feito = false; return () => { if (feito) return; feito = true; n = Math.max(0, n - 1); if (!n) desliga(); }; },
    pendentes: () => n
  };
  window.addEventListener('beforeunload', (e) => { if (n > 0) { e.preventDefault(); e.returnValue = 'Ainda estou salvando. Se sair agora, a alteração pode não ser concluída.'; return e.returnValue; } });
})();
(() => {
  'use strict';
  if (window.TenkiterNav) return;
  if (/[?&]embed=1/.test(location.search)) { // página dentro do app unificado: sem segunda barra
    document.documentElement.classList.add('tk-app-embed');
    // Links para uma das áreas principais devem trocar a tela do app inteiro.
    // Links internos (detalhes, manuais, formulários) continuam dentro da área atual.
    document.addEventListener('click', (ev) => {
      const a = ev.target?.closest ? ev.target.closest('a[href]') : null;
      if (!a || a.target === '_blank' || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      let u; try { u = new URL(a.href, location.href); } catch (e) { return; }
      if (u.origin !== location.origin || !/^\/(?:.*\/)?(?:index|admin|treinamentos|curriculos|curriculo)\.html$/.test(u.pathname)) return;
      ev.preventDefault();
      window.parent.postMessage({ tipo: 'tk-app-navegar', href: u.pathname + u.search + u.hash }, location.origin);
    }, true);
    return;
  }

  // Simulação isolada: a barra deve existir no iframe mesmo sem sessão real.
  // Nunca gravar permissões fictícias no navegador nem consultar API nesse modo.
  const tutorialSimulado = /[?&]tutorial_(?:teste|editor)=1(?:&|$)/.test(location.search);
  const permissoesTutorial = ['catalogo_admin','portal','equipe_relatorio','gerir_manuais','gerir_acessos','dados_pessoais'];
  const CHAVE_SESSAO = 'tm_session';
  const CHAVE_CACHE = 'tm_nav_perms';
  const TTL_MS = 5 * 60 * 1000;

  const ITENS = [
    { id: 'catalogo',     href: 'index.html',                 icone: '👗', rotulo: 'Catálogo' },
    { id: 'gestao',       href: 'admin.html',                 icone: '🔧', rotulo: 'Gestão',        qualquer: ['catalogo_admin'] },
    { id: 'treinamentos', href: 'treinamentos.html',          icone: '🎓', rotulo: 'Treinamentos',  visitanteOuPerm: 'portal' },
    { id: 'rh',           href: 'treinamentos.html?painel=rh', icone: '👥', rotulo: 'RH',            qualquer: ['equipe_relatorio', 'gerir_manuais', 'gerir_acessos'] },
    { id: 'curriculos',   href: 'curriculos.html',            icone: '📄', rotulo: 'Currículos',    qualquer: ['dados_pessoais', 'gerir_acessos'] },
    { id: 'candidatura',  href: 'curriculo.html',             icone: '✍️', rotulo: 'Trabalhe conosco', soVisitante: true }
  ];
  const CHAVES_EQUIPE = ['catalogo_admin', 'equipe_relatorio', 'gerir_manuais', 'dados_pessoais', 'gerir_acessos'];
  // v7.1 (mockup aprovado 24/10/2026): barra do CLIENTE = Início · Buscar · Seleção · Favoritos · Atendente.
  // Equipe continua com as abas de ITENS (Catálogo, Gestão, Treinamentos, RH, Currículos).
  // Trabalhe conosco e Treinamentos (alunos) saem da barra do cliente e ficam no rodapé da vitrine.
  const ITENS_CLIENTE = () => [
    { id: 'catalogo',   href: 'index.html',                        icone: '🏠', rotulo: 'Início' },
    { id: 'busca',      href: 'index.html?abrir=busca',            icone: '🔎', rotulo: 'Buscar' },
    { id: 'selecao',    href: 'index.html?abrir=selecao',          icone: '🛍️', rotulo: 'Seleção' },
    { id: 'favoritos',  href: 'index.html?abrir=favoritos',        icone: '❤️', rotulo: 'Favoritos' },
    { id: 'atendente',  href: (typeof window.linkWhatsApp === 'function' ? window.linkWhatsApp() : 'index.html?abrir=atendente'), icone: '💬', rotulo: 'Atendente', externo: true }
  ];

  let perms = [];
  let logado = false;
  let ativoId = '';
  let nav = null;
  let appViews = null;
  const appFrames = new Map();
  const rotaInicial = location.pathname + location.search + location.hash;
  const tituloInicial = document.title;
  let scrollInicial = 0;

  const lerJson = (chave) => { try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (e) { return null; } };
  const sessao = () => { const s = lerJson(CHAVE_SESSAO); return s?.whatsapp ? s : null; };

  const lerCache = () => {
    if (tutorialSimulado) { logado = true; perms = permissoesTutorial.slice(); return null; }
    const s = sessao();
    logado = !!s;
    if (!s) { perms = []; try { localStorage.removeItem(CHAVE_CACHE); } catch (e) {} return null; }
    const c = lerJson(CHAVE_CACHE);
    if (c && c.w === s.whatsapp && Array.isArray(c.p)) { perms = c.p; return c; }
    perms = [];
    return null;
  };
  const gravarCache = (lista) => {
    if (tutorialSimulado) return;
    const s = sessao(); if (!s) return;
    try { localStorage.setItem(CHAVE_CACHE, JSON.stringify({ w: s.whatsapp, p: lista, t: Date.now() })); } catch (e) {}
  };

  const tem = (chave) => perms.indexOf(chave) !== -1;
  const ehEquipe = () => CHAVES_EQUIPE.some(tem);

  const visivel = (it) => {
    if (it.id === ativoId) return true; // a página em que a pessoa está sempre aparece (e destacada)
    if (it.qualquer) return it.qualquer.some(tem);
    if (it.visitanteOuPerm) return !logado || tem(it.visitanteOuPerm) || !perms.length; // sem lista ainda: mostra (a página decide o acesso)
    if (it.soVisitante) return !ehEquipe();
    return true;
  };

  const css = () => {
    if (document.getElementById('tk-nav-css')) return;
    const s = document.createElement('style');
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
      '.tk-app-views{position:fixed;inset:0 0 calc(70px + env(safe-area-inset-bottom,0px)) 0;z-index:80;background:#fff}' +
      '.tk-app-frame{display:block;width:100%;height:100%;border:0;background:#fff}' +
      '.tk-app-frame[hidden],.tk-app-views[hidden]{display:none!important}' +
      '.tk-app-loading{position:absolute;inset:0;z-index:2;display:grid;place-items:center;background:#fff;color:#5f391f;font:700 1rem/1.4 system-ui,sans-serif}' +
      '.tk-app-loading[hidden]{display:none!important}' +
      'body.tk-app-frame-ativo{overflow:hidden!important}' +
      'body.tk-app-frame-ativo > :not(.tk-app-views):not(.tk-nav):not(script):not(style){visibility:hidden!important}' +
      '@media (min-width:900px){.tk-nav{justify-content:center}.tk-nav a{flex:0 0 130px}}' +
      '@media (prefers-reduced-motion:reduce){@view-transition{navigation:none}}';
    document.head.appendChild(s);
  };

  const desenhar = () => {
    if (!document.body) return;
    css();
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'tk-nav';
      nav.setAttribute('aria-label', 'Navegação principal');
      document.body.appendChild(nav);
      document.body.classList.add('tk-tem-nav');
    }
    const lista = ehEquipe() ? ITENS.filter(visivel) : ITENS_CLIENTE();
    const html = lista.map((it) => {
      const atual = it.id === ativoId;
      return '<a href="' + it.href + '"' + (atual ? ' class="tk-ativo" aria-current="page"' : '') + (it.externo ? ' target="_blank" rel="noopener"' : '') + ' data-nav="' + it.id + '">' +
        '<span class="tk-i" aria-hidden="true">' + it.icone + '</span><span class="tk-r">' + it.rotulo + '</span></a>';
    }).join('');
    if (nav.getAttribute('data-h') !== html) { nav.innerHTML = html; nav.setAttribute('data-h', html); }
  };

  /** Atualiza as permissões a partir do catálogo (mesmo login do portal). Só se common.js estiver na página. */
  const atualizarDoServidor = () => {
    if (tutorialSimulado) return;
    const s = sessao();
    if (!s?.sessao) return;
    const c = lerJson(CHAVE_CACHE);
    if (c && c.w === s.whatsapp && Date.now() - (c.t || 0) < TTL_MS) return;
    let url = null;
    try { url = (typeof API_URL !== 'undefined') ? API_URL : null; } catch (e) { url = null; }
    if (!url) return;
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'sessao', whatsapp: s.whatsapp, sessao: s.sessao }) })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j.usuario && Array.isArray(j.usuario.permissoes)) { perms = j.usuario.permissoes; gravarCache(perms); desenhar(); }
        else if (j && (j.sessaoInvalida || j.inativa)) { perms = []; try { localStorage.removeItem(CHAVE_CACHE); } catch (e) {} desenhar(); }
      })
      .catch(() => { /* sem rede: segue com o cache */ });
  };

  /** Pré-carrega as outras telas para o toque na barra abrir na hora. */
  const preCarregar = () => {
    if (tutorialSimulado) return;
    const fazer = () => {
      ITENS.filter(visivel).forEach((it) => {
        if (it.id === ativoId) return;
        const a = document.createElement('link'); a.rel = 'prefetch'; a.href = it.href.split('?')[0];
        document.head.appendChild(a);
      });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(fazer, { timeout: 4000 }); else setTimeout(fazer, 2500);
  };

  const itemDaUrl = (url) => {
    const u = new URL(url, location.href);
    return ITENS.find((it) => {
      const x = new URL(it.href, location.origin + location.pathname.replace(/[^/]*$/, ''));
      if (x.pathname !== u.pathname) return false;
      if (it.id === 'rh') return new URLSearchParams(u.search).get('painel') === 'rh';
      if (it.id === 'treinamentos') return new URLSearchParams(u.search).get('painel') !== 'rh';
      return true;
    }) || null;
  };
  const appDisponivel = () => window.top === window.self && !!itemDaUrl(location.href);
  const garantirViews = () => {
    if (appViews) return appViews;
    appViews = document.createElement('div');
    appViews.className = 'tk-app-views'; appViews.hidden = true;
    const carregando = document.createElement('div');
    carregando.className = 'tk-app-loading'; carregando.hidden = true;
    carregando.setAttribute('role', 'status'); carregando.textContent = 'Abrindo…';
    appViews.appendChild(carregando);
    document.body.appendChild(appViews);
    return appViews;
  };
  const urlEmbed = (it) => {
    const u = new URL(it.href, location.href);
    u.searchParams.set('embed', '1'); u.searchParams.set('tkapp', '1');
    return u.pathname + u.search + u.hash;
  };
  const bloquearSaidaAtiva = () => {
    let w = window;
    const visivel = appViews && appViews.querySelector('.tk-app-frame:not([hidden])');
    if (visivel) { try { w = visivel.contentWindow || window; } catch (e) { w = window; } }
    if (typeof w.TKSairBloqueio !== 'function') return '';
    try { return w.TKSairBloqueio() || ''; } catch (e) { return ''; }
  };
  const mostrarRota = (it, historico) => {
    if (!it || !appDisponivel()) return false;
    const destino = new URL(it.href, location.href);
    const inicial = new URL(rotaInicial, location.origin);
    const itemInicial = itemDaUrl(inicial.href);
    const ehInicial = !!itemInicial && it.id === itemInicial.id;
    const rota = ehInicial ? rotaInicial : destino.pathname + destino.search + destino.hash;
    let historicoDepoisDaCarga = false;
    garantirViews();
    appFrames.forEach((f) => { f.hidden = true; f.setAttribute('aria-hidden', 'true'); f.inert = true; });
    if (ehInicial) {
      appViews.hidden = true; document.body.classList.remove('tk-app-frame-ativo');
      document.title = tituloInicial;
      requestAnimationFrame(() => scrollTo(0, scrollInicial));
    } else {
      if (!document.body.classList.contains('tk-app-frame-ativo')) scrollInicial = scrollY;
      let frame = appFrames.get(rota);
      if (!frame) {
        const carregando = appViews.querySelector('.tk-app-loading');
        carregando.textContent = 'Abrindo ' + it.rotulo + '…'; carregando.hidden = false;
        frame = document.createElement('iframe'); frame.className = 'tk-app-frame';
        frame.name = 'tk-app-' + it.id; frame.title = it.rotulo;
        frame.setAttribute('loading', 'eager');
        historicoDepoisDaCarga = historico === 'push';
        frame.addEventListener('load', () => {
          carregando.hidden = true;
          // A navegação inicial do iframe entra no histórico conjunto. Criamos
          // a entrada da área depois dela para que um único Voltar mude de aba.
          if (historicoDepoisDaCarga) setTimeout(() => {
            if (ativoId === it.id && location.pathname !== destino.pathname) history.pushState({ tkApp: rota }, '', rota);
          }, 0);
        }, { once: true });
        appFrames.set(rota, frame); appViews.appendChild(frame);
        // Substitui o about:blank inicial, sem criar uma etapa extra no Voltar.
        frame.contentWindow.location.replace(urlEmbed(it));
      }
      frame.hidden = false; frame.removeAttribute('aria-hidden'); frame.inert = false;
      appViews.hidden = false; document.body.classList.add('tk-app-frame-ativo');
      document.title = it.rotulo + ' — TENKiTER Modas';
      try { frame.contentWindow.focus(); } catch (e) {}
    }
    ativoId = it.id; desenhar();
    if (historico === 'push' && !historicoDepoisDaCarga) history.pushState({ tkApp: rota }, '', rota);
    else if (historico === 'replace') history.replaceState({ tkApp: rota }, '', rota);
    try { sessionStorage.setItem('tk_app_ultima', rota); } catch (e) {}
    return true;
  };

  const API = {
    ativo: (id) => { ativoId = id || ''; desenhar(); },
    setPerms: (lista) => {
      logado = !!sessao();
      perms = Array.isArray(lista) ? lista.slice() : [];
      if (logado) gravarCache(perms);
      desenhar();
    },
    redesenhar: desenhar
  };
  window.TenkiterNav = API;

  // v4.10 (FE-02): a sessão mudou (entrou/saiu nesta página ou em OUTRA aba/página) -> redesenha a barra
  // na hora, sem recarregar. Antes, entrar no catálogo só refletia na barra depois de um F5.
  try {
    window.addEventListener('tk:sessao', () => { lerCache(); desenhar(); atualizarDoServidor(); });
    window.addEventListener('storage', (e) => { if (e && e.key === CHAVE_SESSAO) { lerCache(); desenhar(); atualizarDoServidor(); } });
  } catch (e) { /* navegador sem eventos: segue como antes */ }

  // o <script> fica no fim do <body>: o DOM já existe. currentScript só vale agora, então guardamos antes.
  const _tag = document.currentScript;
  if (_tag) ativoId = _tag.getAttribute('data-ativo') || '';
  // Guarda de saída: a página pode definir window.TKSairBloqueio = function () { return 'texto' | '' }.
  // Se devolver texto (ex.: envios em andamento), tocar na barra pede confirmação antes de sair.
  document.addEventListener('click', (ev) => {
    const a = ev.target?.closest ? ev.target.closest('a[data-nav]') : null;
    if (!a) return;
    const msg = bloquearSaidaAtiva();
    if (msg && !window.confirm(msg)) { ev.preventDefault(); ev.stopPropagation(); return; }
    if (!appDisponivel() || ev.button > 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || a.target === '_blank') return;
    const it = ITENS.find((x) => x.id === a.dataset.nav);
    if (it) {
      ev.preventDefault(); ev.stopPropagation();
      if (it.id !== ativoId) mostrarRota(it, 'push');
    }
  }, true);
  window.addEventListener('popstate', () => {
    const it = itemDaUrl(location.href);
    if (it) mostrarRota(it, 'none');
  });
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin || ev.data?.tipo !== 'tk-app-navegar') return;
    const it = itemDaUrl(ev.data.href || '');
    if (!it || it.id === ativoId) return;
    const msg = bloquearSaidaAtiva();
    if (!msg || window.confirm(msg)) mostrarRota(it, 'push');
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { lerCache(); desenhar(); atualizarDoServidor(); preCarregar(); });
  else { lerCache(); desenhar(); atualizarDoServidor(); preCarregar(); }
})();

/* v4.25 — envios de cadastro em QUALQUER tela. O painel (admin.html) guarda no IndexedDB (tenkiter_admin_envios_v1) o registro LEVE das peças novas cujas mídias já estão no servidor
 * (texto + endereços, sem credencial). Quem sai do painel não precisa esperar: aqui, nas outras páginas, esse registro é terminado (o servidor reconhece o mesmo opId e nunca duplica)
 * e a pessoa vê o andamento. "Cadastrada" só aparece com resposta ok do servidor; timeout/erro deixa o registro guardado (o painel retoma ao abrir). O X só fecha o aviso. */
(() => {
  'use strict';
  if (window.__tkEnviosBg || /\/admin\.html$/.test(location.pathname) || !window.indexedDB) return;
  window.__tkEnviosBg = true;
  const BD = 'tenkiter_admin_envios_v1', HIST = 'tk_envios_hist_v1';
  const abrirBd = () => new Promise((res, rej) => { try { const rq = indexedDB.open(BD, 1); rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains('e')) rq.result.createObjectStore('e', { keyPath: 'k' }); }; rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); } catch (e) { rej(e); } });
  const lerTudo = async () => { const db = await abrirBd(); try { return await new Promise((r) => { const q = db.transaction('e', 'readonly').objectStore('e').getAll(); q.onsuccess = () => r(q.result || []); q.onerror = () => r([]); }); } finally { db.close(); } };
  const apagar = async (k) => { const db = await abrirBd(); try { await new Promise((r) => { const t = db.transaction('e', 'readwrite'); t.objectStore('e').delete(k); t.oncomplete = r; t.onerror = r; t.onabort = r; }); } finally { db.close(); } };
  const sessao = () => { try { const s = JSON.parse(localStorage.getItem('tm_session') || 'null'); return s && s.sessao && /^tk/.test(s.sessao) ? s : null; } catch (e) { return null; } };
  const hist = (t, r) => { try { const l = JSON.parse(localStorage.getItem(HIST) || '[]'); l.unshift({ t: String(t || 'Peça').slice(0, 60), q: Date.now(), r, m: '' }); localStorage.setItem(HIST, JSON.stringify(l.slice(0, 40))); } catch (e) {} };
  let chip = null, toast = null, rodando = false, tentativas = 0;
  const css = () => { if (document.getElementById('tk-env-css')) return; const c = document.createElement('style'); c.id = 'tk-env-css'; c.textContent = '#tk-env-chip,#tk-env-toast{position:fixed;left:12px;right:12px;margin:0 auto;max-width:520px;z-index:85;border-radius:14px;padding:10px 14px;font:600 .86rem/1.3 system-ui,sans-serif;display:flex;align-items:center;gap:10px;box-shadow:0 4px 16px rgba(0,0,0,.35)}#tk-env-chip{bottom:calc(84px + env(safe-area-inset-bottom));background:#222;color:#fff;border:2px solid #E67E22;text-decoration:none}#tk-env-chip.erro{border-color:#f5c542}#tk-env-toast{bottom:calc(140px + env(safe-area-inset-bottom));background:#0f3d1d;color:#fff;border:2px solid #4caf50}#tk-env-toast button{margin-left:auto;width:auto;min-width:44px;min-height:44px;border:0;border-radius:10px;background:#ffffff22;color:#fff;font-size:1.1rem;cursor:pointer}'; document.head.appendChild(c); };
  const chipOff = () => { if (chip) { chip.remove(); chip = null; } };
  const chipOn = (txt, erro) => { css(); if (!chip) { chip = document.createElement('a'); chip.id = 'tk-env-chip'; chip.href = 'admin.html'; chip.setAttribute('role', 'status'); document.body.appendChild(chip); } chip.className = erro ? 'erro' : ''; chip.textContent = txt; };
  const avisoOk = (txt) => { css(); if (!toast) { toast = document.createElement('div'); toast.id = 'tk-env-toast'; toast.setAttribute('role', 'status'); document.body.appendChild(toast); }
    toast.innerHTML = ''; const sp = document.createElement('span'); sp.textContent = txt; const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Fechar este aviso'); x.textContent = '✕';
    x.addEventListener('click', () => { if (toast) { toast.remove(); toast = null; } }); toast.append(sp, x); };
  const postar = async (r, s, api) => {
    const feito = async () => {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 70000);
      try {
        const resp = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({}, r.pacote, { pin: s.sessao })), signal: ctl.signal });
        return await resp.json();
      } finally { clearTimeout(t); }
    };
    if (navigator.locks && navigator.locks.request) return navigator.locks.request('tk-env-' + r.k, { ifAvailable: true }, (lock) => lock ? feito() : { ocupado: true });
    return feito();
  };
  const ciclo = async () => {
    if (rodando) return; rodando = true;
    try {
      let lista = await lerTudo();
      if (!lista.length) { chipOff(); return; }
      const s = sessao(), api = typeof API_URL === 'string' ? API_URL : '';
      const prontos = lista.filter((r) => r.pacote && !r.ehEdicao);
      let feitos = 0, falhou = false;
      if (prontos.length && s && api) {
        chipOn('⏳ Finalizando ' + (prontos.length === 1 ? '1 cadastro' : prontos.length + ' cadastros') + '…');
        for (const r of prontos) {
          let j = null; try { j = await postar(r, s, api); } catch (e) { j = null; }
          if (j && j.ok === true) { await apagar(r.k); hist(r.titulo, 'ok'); feitos++; avisoOk(j.repetido ? '✅ “' + r.titulo + '” já estava cadastrada.' : '✅ “' + r.titulo + '” cadastrada.'); }
          else if (!(j && j.ocupado)) falhou = true;
        }
      } else if (prontos.length) falhou = true;
      lista = await lerTudo();
      if (!lista.length) { chipOff(); return; }
      const n = lista.length;
      chipOn('⚠️ ' + (n === 1 ? '1 envio não terminou' : n + ' envios não terminaram') + ' — toque para continuar no painel', true);
      if (falhou && tentativas++ < 8) setTimeout(ciclo, 20000);
    } catch (e) { /* sem IndexedDB/erro: não atrapalha a página */ } finally { rodando = false; }
  };
  window.addEventListener('online', ciclo);
  window.addEventListener('tk:sessao', ciclo);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciclo(); });
  setTimeout(ciclo, 1500);
})();
