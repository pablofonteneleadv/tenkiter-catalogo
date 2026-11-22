/* v7.52.0 — Gestão: cadastrar produto novo com fotos da caixa da equipe (Esteira → aba Fotos → "Cadastrar produto novo").
 * admin.html?caixaFotos=12,13&modo=um      → abre o cadastro NORMAL já com as fotos (já estão no servidor de fotos).
 * admin.html?caixaFotos=12,13&modo=varias  → "Cadastrar vários produtos" (7.50.0) já com as fotos: cada foto vira um produto e "Unir fotos"
 *                                           junta as do mesmo produto (sem esse recurso: o caminho do "Cadastro separado").
 * Nada vira produto sem a pessoa conferir e tocar em Cadastrar. Depois de salvo, a Esteira marca as fotos como usadas, com a peça
 * criada (o aviso fica guardado neste aparelho até o servidor confirmar, sem senha nem dados de pessoas). */
(function () {
  'use strict';
  var CHAVE = 'tk_caixa_usar_v1';
  function cab() { var s = (typeof getSessao === 'function') ? getSessao() : null; return s ? { 'Content-Type': 'application/json', 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao } : null; }
  function aviso(t) { if (typeof window.tkAvisoRapido === 'function') window.tkAvisoRapido(t, 'aviso'); }
  function lerPend() { try { var l = JSON.parse(localStorage.getItem(CHAVE) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function gravarPend(l) { try { localStorage.setItem(CHAVE, JSON.stringify(l.slice(-50))); } catch (e) { /* conforto */ } }
  var emVoo = {}, falhas = {}, tentarDepois = {}, avisouPendencia = false;
  function enviarPend() {
    var h = cab(), l = lerPend(); if (!h || !l.length || typeof INSTAGRAM_URL === 'undefined') return;
    l.forEach(function (x) {
      if (!x || !x.k || !Array.isArray(x.ids) || !x.ids.length || !x.produto) return; // conservar registros antigos inválidos, nunca apagar
      if (emVoo[x.k] || Date.now() < (tentarDepois[x.k] || 0)) return;
      emVoo[x.k] = 1;
      fetch(INSTAGRAM_URL + '/esteira/caixa/usar', { method: 'POST', headers: h, keepalive: true, body: JSON.stringify({ ids: x.ids, uso: 'criado', produto: x.produto, produtoNome: x.nome || '' }) })
        .then(function (r) { if (!r.ok) throw new Error('Confirmação HTTP sem sucesso'); return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error('Confirmação não aceita pelo servidor');
          gravarPend(lerPend().filter(function (y) { return y.k !== x.k; }));
          delete falhas[x.k]; delete tentarDepois[x.k];
          if (avisouPendencia && !lerPend().length) { avisouPendencia = false; aviso('A Esteira confirmou o uso das fotos do produto.'); }
        })
        .catch(function () {
          falhas[x.k] = Math.min(6, (falhas[x.k] || 0) + 1);
          tentarDepois[x.k] = Date.now() + Math.min(15 * 60000, 30000 * Math.pow(2, falhas[x.k] - 1));
          if (!avisouPendencia) {
            avisouPendencia = true;
            aviso('O produto foi salvo, mas a confirmação das fotos na Esteira ficou pendente neste aparelho. O sistema vai tentar de novo.');
          }
        })
        .then(function () { delete emVoo[x.k]; });
    });
  }
  // Reconciliar apenas operações já guardadas; servidor aplica uso=criado de modo idempotente.
  // Eventos de retorno à página aceleram a recuperação, respeitando backoff por item.
  window.addEventListener('online', enviarPend);
  window.addEventListener('focus', enviarPend);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) enviarPend(); });
  setInterval(function () { if (!document.hidden) enviarPend(); }, 60000);
  // produto salvo pelo cadastro: o envio leva rascunhoId "caixa:12.13" (o importador do Instagram ignora esse prefixo)
  window.addEventListener('tk:peca-salva', function (ev) {
    var d = ev && ev.detail; if (!d || !/^caixa:[0-9.]+$/.test(String(d.rascunhoId || ''))) return;
    var ids = String(d.rascunhoId).slice(6).split('.').map(Number).filter(function (n) { return n > 0; });
    if (!ids.length || !(d.id || d.codigo)) return;
    var l = lerPend(); l.push({ k: String(d.rascunhoId) + ':' + (d.id || d.codigo), ids: ids, produto: String(d.id || d.codigo), nome: String(d.codigo || '') }); gravarPend(l);
    enviarPend();
  });
  setTimeout(enviarPend, 4000);

  /* v7.85.0 — volta para a Esteira. No app Android a "outra aba" abre na mesma tela e a pessoa perdia a Esteira a cada produto.
   * Aberto pela Esteira (&volta=esteira), o cadastro lembra disso nesta aba; quando o lote termina com tudo salvo, avisa e volta.
   * Aba própria (navegador do computador): fecha e a Esteira, que ficou aberta na outra, segue onde estava. Senão abre a Esteira
   * nesta tela; ela retoma a aba Fotos, o filtro e a rolagem guardados neste aparelho. Erro, aviso ou sem conexão: fica no cadastro. */
  var VOLTA = 'tk_caixa_volta_esteira';
  function lerVolta() { try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(VOLTA); } catch (e) { return null; } }
  function gravarVolta(v) { try { if (typeof sessionStorage === 'undefined') return; if (v) sessionStorage.setItem(VOLTA, v); else sessionStorage.removeItem(VOLTA); } catch (e) { /* conforto */ } }
  // A Gestão pede transição animada entre páginas (nav.js), mas a página de destino só liga a dela depois de carregar:
  // o navegador cancelaria a animação com erro. Desliga a animação só nestas trocas de tela feitas daqui.
  function semTransicao() {
    try {
      Array.prototype.forEach.call(document.querySelectorAll('style'), function (s) { if (s.textContent.indexOf('@view-transition') >= 0) s.textContent = s.textContent.replace(/@view-transition\s*\{\s*navigation\s*:\s*auto\s*;?\s*\}/g, '@view-transition{navigation:none}'); });
      var vt = document.createElement('style'); vt.textContent = '@view-transition{navigation:none}'; document.head.appendChild(vt);
    } catch (e) { /* segue sem */ }
    window.addEventListener('pageswap', function (e) { var t = e && e.viewTransition; if (!t) return; [t.ready, t.finished, t.updateCallbackDone].forEach(function (p) { if (p && p.catch) p.catch(function () {}); }); try { t.skipTransition(); } catch (x) { /* segue */ } }, { once: true });
  }
  function voltarEsteira() {
    semTransicao();
    var proprio = (typeof history !== 'undefined') && history.length === 1;
    if (proprio) { try { window.close(); } catch (e) { /* segue */ } }
    setTimeout(function () { location.replace('esteira.html'); }, proprio ? 400 : 0);
  }
  /* v7.86.0 — "Salvar e cadastrar o próximo": salva e, em vez de voltar, mostra aqui mesmo as fotos novas que ainda estão
   * na caixa. A pessoa escolhe as do próximo produto (o sistema não adivinha quais fotos são do mesmo produto) e o cadastro
   * reabre já com elas. Sem fotos novas, volta para a Esteira (se veio dela) ou fica na Gestão. */
  var PROX = 'tk_caixa_proximo';
  function lerProx() { try { var v = Number(typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PROX)); return v && Date.now() - v < 30 * 60000; } catch (e) { return false; } }
  function gravarProx(v) { try { if (typeof sessionStorage === 'undefined') return; if (v) sessionStorage.setItem(PROX, String(Date.now())); else sessionStorage.removeItem(PROX); } catch (e) { /* conforto */ } }
  function esc(t) { return String(t == null ? '' : t); }
  function abrirProximas(veioDaEsteira, usadas) {
    var h = cab(); if (!h || typeof INSTAGRAM_URL === 'undefined') { if (veioDaEsteira) voltarEsteira(); return; }
    fetch(INSTAGRAM_URL + '/esteira/caixa?pagina=1&ver=novas', { headers: h })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (j) {
        var livres = ((j && j.ok && j.itens) || []).filter(function (x) { return x && x.status === 'nova' && /^https:\/\//.test(String(x.url || '')) && usadas.indexOf(Number(x.id)) < 0; });
        if (!livres.length) { aviso('Produto cadastrado. Não há mais fotos novas na caixa.' + (veioDaEsteira ? ' Voltando para a Esteira…' : '')); if (veioDaEsteira) setTimeout(voltarEsteira, 1500); return; }
        folhaProximas(livres, veioDaEsteira);
      })
      .catch(function () { aviso('Produto cadastrado, mas não consegui ler a caixa agora (sem conexão). Abra as fotos pela Esteira.'); });
  }
  function folhaProximas(livres, veioDaEsteira) {
    var escolhidas = [], presa = null;
    var fundo = document.createElement('div'); fundo.className = 'tkcx-fundo';
    var jan = document.createElement('div'); jan.className = 'tkcx-prox'; jan.id = 'tkcx-proximas'; jan.setAttribute('role', 'dialog'); jan.setAttribute('aria-modal', 'true'); jan.setAttribute('aria-labelledby', 'tkcx-prox-tit');
    if (!document.getElementById('tkcx-css')) {
      var s = document.createElement('style'); s.id = 'tkcx-css';
      s.textContent = '.tkcx-fundo{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:var(--z-folha,100)}' +
        '.tkcx-prox{position:fixed;left:0;right:0;bottom:0;max-height:88vh;z-index:var(--z-folha,100);background:#fff;border-radius:16px 16px 0 0;display:flex;flex-direction:column;box-shadow:0 -6px 24px rgba(0,0,0,.25)}' +
        '@media (min-width:700px){.tkcx-prox{left:50%;right:auto;bottom:auto;top:6vh;transform:translateX(-50%);width:640px;border-radius:16px;max-height:88vh}}' +
        '.tkcx-prox .tkcx-cab{display:flex;align-items:center;gap:8px;padding:12px 12px 8px 16px}.tkcx-prox .tkcx-cab h2{flex:1;margin:0;font-size:1.1rem}' +
        '.tkcx-prox .tkcx-dica{margin:0 16px 8px;font-size:.9rem;color:#555}.tkcx-prox .tkcx-grade{overflow:auto;padding:4px 12px 12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}' +
        '.tkcx-prox .tkcx-foto{position:relative;padding:0;border:2px solid #ddd;border-radius:10px;background:#f5f1e8;overflow:hidden;cursor:pointer;min-height:44px}' +
        '.tkcx-prox .tkcx-foto img{display:block;width:100%;aspect-ratio:var(--tk-foto,4/5);object-fit:cover}.tkcx-prox .tkcx-foto small{display:block;padding:4px 6px;font-size:.75rem;color:#333;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.tkcx-prox .tkcx-foto[aria-pressed=true]{border-color:#1a1a1a;box-shadow:0 0 0 2px #1a1a1a}.tkcx-prox .tkcx-foto .tkcx-n{position:absolute;top:6px;left:6px;min-width:26px;height:26px;border-radius:13px;background:#1a1a1a;color:#fff;font-weight:800;font-size:.85rem;display:none;align-items:center;justify-content:center}' +
        '.tkcx-prox .tkcx-foto[aria-pressed=true] .tkcx-n{display:flex}.tkcx-prox .tkcx-pe{display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid #eee}.tkcx-prox .tkcx-pe button{flex:1 1 180px}';
      document.head.appendChild(s);
    }
    var cabeca = document.createElement('div'); cabeca.className = 'tkcx-cab';
    var tit = document.createElement('h2'); tit.id = 'tkcx-prox-tit'; tit.textContent = 'Próximo produto: escolha as fotos';
    var fechar = document.createElement('button'); fechar.type = 'button'; fechar.className = 'tk-fechar'; fechar.setAttribute('aria-label', 'Fechar'); fechar.textContent = '✕';
    cabeca.appendChild(tit); cabeca.appendChild(fechar);
    var dica = document.createElement('p'); dica.className = 'tkcx-dica'; dica.textContent = 'Fotos novas da caixa (' + livres.length + '). Toque nas fotos do mesmo produto, até 8; a primeira vira a capa.';
    var grade = document.createElement('div'); grade.className = 'tkcx-grade';
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'tk-btn-prim'; ok.id = 'tkcx-prox-ok';
    var sairB = document.createElement('button'); sairB.type = 'button'; sairB.className = 'tk-btn-sec'; sairB.id = 'tkcx-prox-sair'; sairB.textContent = veioDaEsteira ? 'Voltar para a Esteira' : 'Fechar';
    function pintar() {
      ok.disabled = !escolhidas.length;
      ok.textContent = !escolhidas.length ? 'Escolha as fotos' : 'Cadastrar com ' + (escolhidas.length === 1 ? '1 foto' : escolhidas.length + ' fotos');
      Array.prototype.forEach.call(grade.children, function (b) { var k = escolhidas.indexOf(Number(b.dataset.id)); b.setAttribute('aria-pressed', String(k >= 0)); b.querySelector('.tkcx-n').textContent = k >= 0 ? String(k + 1) : ''; });
    }
    livres.slice(0, 24).forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'tkcx-foto'; b.dataset.id = String(x.id);
      var desc = esc(x.descricao || x.descricaoLote || '');
      b.setAttribute('aria-label', 'Foto ' + (desc ? '“' + desc + '”' : 'sem descrição') + (x.por ? ', enviada por ' + esc(x.por) : ''));
      b.innerHTML = '<span class="tkcx-n" aria-hidden="true"></span><img alt="" loading="lazy" ' + (typeof atribSrc === 'function' ? atribSrc(typeof fotoMini === 'function' ? fotoMini(x.url, 240) : x.url) : '') + '>';
      var sm = document.createElement('small'); sm.textContent = desc || (x.por ? 'Por ' + esc(x.por) : 'Sem descrição'); b.appendChild(sm);
      b.addEventListener('click', function () {
        var id = Number(x.id), k = escolhidas.indexOf(id);
        if (k >= 0) escolhidas.splice(k, 1); else if (escolhidas.length < 8) escolhidas.push(id); else aviso('Cabem até 8 fotos num produto.');
        pintar();
      });
      grade.appendChild(b);
    });
    var pe = document.createElement('div'); pe.className = 'tkcx-pe'; pe.appendChild(sairB); pe.appendChild(ok);
    jan.appendChild(cabeca); jan.appendChild(dica); jan.appendChild(grade); jan.appendChild(pe);
    document.body.appendChild(fundo); document.body.appendChild(jan);
    function limpar() { if (presa) { presa.soltar(); presa = null; } jan.remove(); fundo.remove(); try { document.documentElement.classList.remove('tk-travado'); } catch (e) { /* segue */ } }
    function fecharFolha() { if (window.TKCamadas && TKCamadas.aberta('tkcx-proximas')) TKCamadas.desempilhar('tkcx-proximas'); else limpar(); }
    fechar.addEventListener('click', fecharFolha); fundo.addEventListener('click', fecharFolha);
    sairB.addEventListener('click', function () { fecharFolha(); if (veioDaEsteira) voltarEsteira(); });
    ok.addEventListener('click', function () {
      if (!escolhidas.length) return; ok.disabled = true; ok.textContent = 'Abrindo o cadastro…';
      var h = cab(); var ids = escolhidas.slice();
      var marcar = h ? fetch(INSTAGRAM_URL + '/esteira/caixa/usar', { method: 'POST', headers: h, keepalive: true, body: JSON.stringify({ ids: ids, uso: 'cadastro' }) }).catch(function () { return null; }) : Promise.resolve(null);
      marcar.then(function () { semTransicao(); location.replace('admin.html?caixaFotos=' + ids.join(',') + '&modo=um' + (veioDaEsteira ? '&volta=esteira' : '')); });
    });
    try { document.documentElement.classList.add('tk-travado'); } catch (e) { /* segue */ }
    if (window.TKCamadas) TKCamadas.empilhar('tkcx-proximas', limpar);
    if (window.TKJanela) presa = TKJanela.prender(jan, { fechar: fecharFolha, camada: 'tkcx-proximas', foco: '.tkcx-foto' });
    pintar();
  }
  var usadasAgora = [];
  window.addEventListener('tk:peca-salva', function (ev) {
    var d = ev && ev.detail; if (!d || !/^caixa:[0-9.]+$/.test(String(d.rascunhoId || ''))) return;
    String(d.rascunhoId).slice(6).split('.').forEach(function (n) { if (Number(n) > 0) usadasAgora.push(Number(n)); });
  });
  window.addEventListener('tk:fila-terminou', function (ev) {
    var d = ev && ev.detail; if (!d) return;
    var itens = Array.isArray(d.itens) ? d.itens : [];
    var tudoCerto = !d.restam && itens.length && itens.some(function (x) { return !x.edicao && x.caixa; }) && itens.every(function (x) { return x.estado === 'ok'; });
    if (lerProx()) {
      if (!tudoCerto) return;   // erro ou aviso: fica no cadastro, e o próximo espera a pessoa tentar de novo
      var veio = !!lerVolta(); gravarProx(''); gravarVolta('');
      aviso((itens.length === 1 ? 'Produto cadastrado.' : itens.length + ' produtos cadastrados.') + ' Escolha as fotos do próximo.');
      abrirProximas(veio, usadasAgora.slice()); usadasAgora = [];
      return;
    }
    if (!lerVolta() || !tudoCerto) return;
    gravarVolta('');
    aviso((itens.length === 1 ? 'Produto cadastrado.' : itens.length + ' produtos cadastrados.') + ' Voltando para a Esteira…');
    setTimeout(voltarEsteira, 1500);
  });

  function botaoProximo() {
    var sv = document.getElementById('btn-salvar'); if (!sv || document.getElementById('btn-salvar-proximo')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'btn-salvar-proximo'; b.className = 'tk-btn-sec btn-salvar-proximo'; b.style.cssText = 'width:100%;margin-top:8px'; b.textContent = 'Salvar e cadastrar o próximo';
    b.addEventListener('click', function () { gravarProx('1'); sv.click(); });
    // Só o toque da pessoa em "Cadastrar" desfaz o "próximo" (a Gestão às vezes reaciona o botão sozinha, depois de uma pergunta).
    sv.addEventListener('click', function (e) { if (e.isTrusted) gravarProx(''); }, true);
    sv.insertAdjacentElement('afterend', b);
  }

  var m = /[?&]caixaFotos=([0-9,]{1,400})/.exec(location.search);
  if (!m) return;
  if (/[?&]volta=esteira\b/.test(location.search)) gravarVolta(String(Date.now()));
  var ids = m[1].split(',').map(Number).filter(function (n) { return n > 0; }).slice(0, 60);
  var varias = /[?&]modo=varias\b/.test(location.search), tent = 0, pediuLogin = false, buscando = false;
  function limparUrl() { try { history.replaceState(history.state, '', location.pathname); } catch (e) { /* segue */ } }
  function fim(t) { clearInterval(tm); limparUrl(); if (t) aviso(t); }
  var tm = setInterval(function () {
    tent++;
    if (buscando) return;
    if (!ids.length) return fim('O link das fotos está incompleto. Abra de novo pela Esteira.');
    var lo = document.getElementById('login-overlay');
    if (lo && lo.classList.contains('visivel')) { if (!pediuLogin) { pediuLogin = true; aviso('Entre na sua conta para cadastrar com as fotos da caixa.'); } tent = 0; return; }
    var u = (typeof usuarioAdmin !== 'undefined') ? usuarioAdmin : null, contas = (typeof modoLogin !== 'undefined') && modoLogin;
    var pronta = typeof window.tkAceitarRascunho === 'function' && typeof window.tkAceitarSeparado === 'function' && (typeof produtos !== 'undefined') && produtos && produtos.length;
    if (!pronta || (contas && !u && tent < 40)) { if (tent > 120) fim('Não consegui abrir o cadastro agora. Atualize a página e tente de novo pela Esteira.'); return; }
    if (u && typeof temPermissao === 'function' && !temPermissao(u, 'catalogo_cadastrar')) return fim('Seu acesso não permite cadastrar produtos. Produto ao Admin total a permissão de cadastrar produtos.');
    var h = cab(); if (!h) return fim('Entre na sua conta para cadastrar com as fotos da caixa.');
    buscando = true;
    fetch(INSTAGRAM_URL + '/esteira/caixa/itens?ids=' + ids.join(','), { headers: h })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (j) {
        if (!j || !j.ok) return fim((j && j.erro && !/^[\[{<]/.test(j.erro)) ? j.erro : 'Não consegui ler as fotos da caixa. Tente de novo pela Esteira.');
        var itens = (j.itens || []).filter(function (x) { return /^https:\/\//.test(String(x.url || '')); });
        if (!itens.length) return fim('Essas fotos não estão mais na caixa.');
        var usadas = itens.filter(function (x) { return x.status === 'usada'; }).length;
        var descr = itens.map(function (x) { return x.descricao || x.descricaoLote; }).filter(Boolean).filter(function (x, k, a) { return a.indexOf(x) === k; }).slice(0, 4);
        var quem = itens[0].por || 'equipe';
        var txt = 'Fotos da caixa da equipe (enviadas por ' + quem + ')' + (descr.length ? ': “' + descr.join('”, “') + '”' : '') + '.' + (usadas ? ' Atenção: ' + usadas + ' já foi(ram) usada(s) em outro produto.' : '');
        if (varias && itens.length >= 2 && typeof window.tkVariasComFotos === 'function') {   // "Cadastrar vários produtos" com "Unir fotos" (7.50.0)
          window.tkVariasComFotos(itens.map(function (x) { return { url: x.url, caixaId: x.id }; }));
          var alv = document.getElementById('aviso-lote'); if (alv) { alv.hidden = false; alv.textContent = 'Cada foto vira um produto com os dados que você preencher. Fotos do mesmo produto? Toque em “Unir fotos”. ' + txt; }
        } else if (varias && itens.length >= 2) {
          window.tkAceitarSeparado(itens.map(function (x) { return { id: 'caixa:' + x.id, legenda: '', midias: [{ tipo: 'foto', url: x.url, capa: true }] }; }));
          var t = document.getElementById('titulo-form'); if (t) t.textContent = 'Vários produtos com fotos da caixa (' + itens.length + ')';
          var b = document.getElementById('btn-salvar'); if (b) b.textContent = 'Cadastrar os ' + itens.length + ' produtos';
          var al = document.getElementById('aviso-lote'); if (al) { al.hidden = false; al.textContent = 'Preencha os dados uma vez: ao cadastrar, cada uma das ' + itens.length + ' fotos vira um produto com estas informações. ' + txt; }
        } else {
          window.tkAceitarRascunho({ id: 'caixa:' + itens.slice(0, 8).map(function (x) { return x.id; }).join('.'), legenda: '', midias: itens.slice(0, 8).map(function (x, k) { return { tipo: 'foto', url: x.url, capa: k === 0 }; }) });
          var t2 = document.getElementById('titulo-form'); if (t2) t2.textContent = 'Produto novo com fotos da caixa';
          var al2 = document.getElementById('aviso-lote'); if (al2) { al2.hidden = false; al2.textContent = txt + (itens.length > 8 ? ' Só as 8 primeiras entraram (limite por produto).' : ''); }
        }
        botaoProximo();
        fim('');
      })
      .catch(function () { fim('Sem conexão. Não consegui ler as fotos da caixa; tente de novo pela Esteira.'); });
  }, 500);
})();
