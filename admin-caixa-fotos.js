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
  var usadasAgora = [];
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
    usadasAgora = usadasAgora.concat(ids);   // v7.86.0: o "próximo" não oferece de novo as fotos que acabaram de ser usadas
    posSalvar();   // v7.88.0: volta para a Esteira / libera o próximo assim que o servidor confirmou
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
  /* v7.88.0 — cadastro contínuo (pedido do Pablo: "não deixar a pessoa com sensação de nada").
   * - Espera com animação (aviso fixo no topo, com roda girando) em cada etapa: abrindo o cadastro, salvando, voltando.
   * - As fotos da caixa começam a ser lidas na hora, junto com a carga da Gestão (antes só depois da lista de produtos).
   * - "Salvar e cadastrar o próximo": a escolha das fotos abre NA HORA, enquanto o anterior salva; o próximo cadastro abre
   *   na mesma tela, sem recarregar a Gestão. Fotos inteiras (sem corte) e com botão de ampliar.
   * - Voltar para a Esteira assim que o servidor confirma o produto (sem esperar a Gestão recarregar a lista inteira). */
  var PROX = 'tk_caixa_proximo';
  function lerProx() { try { var v = Number(typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PROX)); return v && Date.now() - v < 30 * 60000; } catch (e) { return false; } }
  function gravarProx(v) { try { if (typeof sessionStorage === 'undefined') return; if (v) sessionStorage.setItem(PROX, String(Date.now())); else sessionStorage.removeItem(PROX); } catch (e) { /* conforto */ } }
  function esc(t) { return String(t == null ? '' : t); }

  /* ---- espera com animação ---- */
  var esperaEl = null;
  function cssCaixa() {
    if (document.getElementById('tkcx-css')) return;
    var s = document.createElement('style'); s.id = 'tkcx-css';
    s.textContent = '.tkcx-espera{position:fixed;left:50%;top:calc(var(--tk-seguro-topo,env(safe-area-inset-top,0px)) + 64px);transform:translateX(-50%);z-index:var(--z-processo,1000);background:#1a1a1a;color:#fff;border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;width:max-content;max-width:calc(100vw - 24px);box-shadow:0 8px 24px rgba(0,0,0,.3);font-weight:600;font-size:.95rem;line-height:1.3}' +
      '.tkcx-espera[hidden]{display:none}.tkcx-roda{flex:0 0 auto;width:22px;height:22px;border-radius:50%;border:3px solid rgba(255,255,255,.28);border-top-color:var(--laranja,currentColor);animation:tkcx-gira .8s linear infinite}' +
      '.tkcx-prox .tkcx-roda{border-color:rgba(0,0,0,.15);border-top-color:var(--laranja,currentColor);width:18px;height:18px}' +
      '@keyframes tkcx-gira{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.tkcx-roda{animation-duration:2.4s}}' +
      '.tkcx-fundo{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:var(--z-folha,100)}' +
      '.tkcx-prox{position:fixed;left:0;right:0;bottom:0;max-height:90vh;z-index:var(--z-folha,100);background:#fff;border-radius:16px 16px 0 0;display:flex;flex-direction:column;box-shadow:0 -6px 24px rgba(0,0,0,.25)}' +
      '@media (min-width:700px){.tkcx-prox{left:50%;right:auto;bottom:auto;top:5vh;transform:translateX(-50%);width:660px;border-radius:16px;max-height:90vh}}' +
      '.tkcx-prox .tkcx-cab{display:flex;align-items:center;gap:8px;padding:12px 12px 6px 16px}.tkcx-prox .tkcx-cab h2{flex:1;margin:0;font-size:1.1rem}' +
      '.tkcx-prox .tkcx-salvando{display:flex;align-items:center;gap:8px;margin:0 16px 6px;padding:8px 10px;border-radius:10px;background:#f5f1e8;font-size:.9rem;font-weight:600}.tkcx-prox .tkcx-salvando.ok{background:#e8f5ec;color:#1b6e3c}.tkcx-prox .tkcx-salvando.erro{background:#fde3e3;color:#8b1a1a}' +
      '.tkcx-prox .tkcx-dica{margin:0 16px 8px;font-size:.88rem;color:#555}.tkcx-prox .tkcx-grade{overflow:auto;padding:4px 12px 12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px}' +
      '.tkcx-prox .tkcx-carregando{grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:16px;color:#555}' +
      '.tkcx-prox .tkcx-cel{position:relative}.tkcx-prox .tkcx-foto{position:relative;display:block;width:100%;padding:0;border:2px solid #ddd;border-radius:10px;background:#f5f1e8;overflow:hidden;cursor:pointer}' +
      '.tkcx-prox .tkcx-foto img{display:block;width:100%!important;height:auto!important;aspect-ratio:4/5!important;object-fit:contain!important;background:#ece7dc}' +
      '.tkcx-prox .tkcx-foto small{display:block;padding:4px 6px;font-size:.75rem;color:#333;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.tkcx-prox .tkcx-foto[aria-pressed=true]{border-color:#1a1a1a;box-shadow:0 0 0 2px #1a1a1a}.tkcx-prox .tkcx-n{position:absolute;top:6px;left:6px;min-width:26px;height:26px;border-radius:13px;background:#1a1a1a;color:#fff;font-weight:800;font-size:.85rem;display:none;align-items:center;justify-content:center}' +
      '.tkcx-prox .tkcx-foto[aria-pressed=true] .tkcx-n{display:flex}' +
      '.tkcx-prox button.tkcx-zoom{position:absolute;top:2px;right:2px;width:44px;height:44px;min-height:44px;border:0;border-radius:22px;background:rgba(0,0,0,.55);color:#fff;font-size:1.05rem;display:flex;align-items:center;justify-content:center;padding:0}' +
      '.tkcx-prox .tkcx-pe{display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid #eee}.tkcx-prox .tkcx-pe button{flex:1 1 180px}';
    document.head.appendChild(s);
  }
  function roda() { var r = document.createElement('span'); r.className = 'tkcx-roda'; r.setAttribute('aria-hidden', 'true'); return r; }
  function espera(texto) {
    cssCaixa();
    if (!esperaEl) esperaEl = document.getElementById('tkcx-espera');   // o aviso imediato do começo da página (admin.html)
    if (!esperaEl) {
      esperaEl = document.createElement('div'); esperaEl.className = 'tkcx-espera'; esperaEl.id = 'tkcx-espera';
      esperaEl.setAttribute('role', 'status'); esperaEl.setAttribute('aria-live', 'polite');
      var t = document.createElement('span'); t.className = 'tkcx-txt';
      esperaEl.appendChild(roda()); esperaEl.appendChild(t); document.body.appendChild(esperaEl);
    }
    esperaEl.querySelector('.tkcx-txt').textContent = texto; esperaEl.hidden = false;
  }
  function fimEspera() { if (esperaEl) esperaEl.hidden = true; }

  /* ---- acompanhar o salvamento dos produtos da caixa ---- */
  function qtdEnvios() { try { return (typeof envios !== 'undefined' && Array.isArray(envios)) ? envios.length : null; } catch (e) { return null; } }
  function caixaPendentes() {
    try {
      if (typeof envios === 'undefined' || !Array.isArray(envios)) return null;
      return envios.filter(function (e) { return e && !e.ehEdicao && /^caixa:/.test(String(e.rascunhoId || '')) && ['fila', 'enviando', 'erro'].indexOf(e.estado) >= 0; });
    } catch (e) { return null; }
  }
  /** Depois do toque em Cadastrar: só segue se o produto entrou mesmo na fila (dado faltando = o formulário avisa e nada acontece). */
  function aoEnfileirar(antes, cb) {
    var t0 = Date.now();
    (function olha() {
      var n = qtdEnvios();
      if (n === null || n > antes) return cb(true);
      if (Date.now() - t0 > 2500) return cb(false);
      setTimeout(olha, 100);
    })();
  }
  var acompanha = null;   // { modo: 'voltar' | 'proximo', nome, folha }
  function salvouTudo() {
    var a = acompanha; if (!a) return; acompanha = null;
    if (a.modo === 'voltar') { espera('Produto salvo! Voltando para a Esteira…'); gravarVolta(''); setTimeout(function () { fimEspera(); voltarEsteira(); }, 700); }
    else if (a.folha) a.folha.salvo();
  }
  function falhouSalvar() {
    var a = acompanha; if (!a) return; acompanha = null; fimEspera(); gravarProx('');
    if (a.folha) a.folha.erro();
    aviso('Não consegui salvar o produto. Confira o motivo em “Envios e pendências” e tente de novo.');
  }
  /** Chamado pelo único ouvinte de "produto salvo" (lá em cima): todos os produtos da caixa salvos → segue. */
  function posSalvar() { if (!acompanha) return; var p = caixaPendentes(); if (p && !p.length) salvouTudo(); }
  window.addEventListener('tk:fila-terminou', function (ev) {
    var d = ev && ev.detail; if (!d || !acompanha) return;
    var itens = Array.isArray(d.itens) ? d.itens : [];
    if (itens.some(function (x) { return x.estado === 'erro' || x.estado === 'offline'; })) return falhouSalvar();
    if (!d.restam && itens.length && itens.every(function (x) { return x.estado === 'ok' || x.estado === 'aviso'; })) salvouTudo();
  });

  /* ---- "Salvar e cadastrar o próximo": escolha das fotos na hora ---- */
  function folhaProximas(veioDaEsteira, nomeSalvando) {
    cssCaixa();
    var escolhidas = [], livres = [], presa = null, salvo = false, falhou = false, querSeguir = false;
    var fundo = document.createElement('div'); fundo.className = 'tkcx-fundo';
    var jan = document.createElement('div'); jan.className = 'tkcx-prox'; jan.id = 'tkcx-proximas'; jan.setAttribute('role', 'dialog'); jan.setAttribute('aria-modal', 'true'); jan.setAttribute('aria-labelledby', 'tkcx-prox-tit');
    var cabeca = document.createElement('div'); cabeca.className = 'tkcx-cab';
    var tit = document.createElement('h2'); tit.id = 'tkcx-prox-tit'; tit.textContent = 'Próximo produto: escolha as fotos';
    var fechar = document.createElement('button'); fechar.type = 'button'; fechar.className = 'tk-fechar'; fechar.setAttribute('aria-label', 'Fechar'); fechar.textContent = '✕';
    cabeca.appendChild(tit); cabeca.appendChild(fechar);
    var st = document.createElement('p'); st.className = 'tkcx-salvando'; st.id = 'tkcx-salvando'; st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'polite');
    var stTxt = document.createElement('span'); st.appendChild(roda()); st.appendChild(stTxt);
    stTxt.textContent = 'Salvando “' + (nomeSalvando || 'o produto') + '”… enquanto isso, escolha as fotos do próximo.';
    var dica = document.createElement('p'); dica.className = 'tkcx-dica'; dica.textContent = 'Toque nas fotos do mesmo produto, até 20; a primeira vira a capa. Toque na lupa para ver a foto inteira.';
    var grade = document.createElement('div'); grade.className = 'tkcx-grade';
    var carregando = document.createElement('div'); carregando.className = 'tkcx-carregando'; carregando.appendChild(roda()); carregando.appendChild(document.createTextNode('Carregando as fotos da caixa…'));
    grade.appendChild(carregando);
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'tk-btn-prim'; ok.id = 'tkcx-prox-ok';
    var sairB = document.createElement('button'); sairB.type = 'button'; sairB.className = 'tk-btn-sec'; sairB.id = 'tkcx-prox-sair'; sairB.textContent = veioDaEsteira ? 'Voltar para a Esteira' : 'Fechar';
    function pintar() {
      ok.disabled = !escolhidas.length || falhou || (querSeguir && !salvo);
      var n = escolhidas.length === 1 ? '1 foto' : escolhidas.length + ' fotos';
      ok.textContent = falhou ? 'Não foi salvo' : !escolhidas.length ? 'Escolha as fotos' : (querSeguir && !salvo) ? 'Esperando salvar…' : salvo ? 'Cadastrar com ' + n : 'Cadastrar com ' + n + ' (ao salvar)';
      Array.prototype.forEach.call(grade.querySelectorAll('.tkcx-foto'), function (b) { var k = escolhidas.indexOf(Number(b.dataset.id)); b.setAttribute('aria-pressed', String(k >= 0)); b.querySelector('.tkcx-n').textContent = k >= 0 ? String(k + 1) : ''; });
    }
    function desenharFotos() {
      grade.replaceChildren();
      if (!livres.length) {
        var vazio = document.createElement('p'); vazio.className = 'tkcx-carregando'; vazio.textContent = 'Não há mais fotos novas na caixa.'; grade.appendChild(vazio);
        ok.hidden = true; return;
      }
      var todas = livres.map(function (x) { return { url: x.url, tipo: 'foto' }; });
      livres.forEach(function (x, i) {
        var cel = document.createElement('div'); cel.className = 'tkcx-cel';
        var b = document.createElement('button'); b.type = 'button'; b.className = 'tkcx-foto'; b.dataset.id = String(x.id);
        var desc = esc(x.descricao || x.descricaoLote || '');
        b.setAttribute('aria-label', 'Foto ' + (i + 1) + (desc ? ': “' + desc + '”' : '') + (x.por ? ', enviada por ' + esc(x.por) : ''));
        b.innerHTML = '<span class="tkcx-n" aria-hidden="true"></span><img alt="" loading="lazy" ' + (typeof atribSrc === 'function' ? atribSrc(typeof fotoMini === 'function' ? fotoMini(x.url, 320) : x.url) : '') + '>';
        var sm = document.createElement('small'); sm.textContent = desc || (x.por ? 'Por ' + esc(x.por) : 'Sem descrição'); b.appendChild(sm);
        b.addEventListener('click', function () {
          var id = Number(x.id), k = escolhidas.indexOf(id);
          if (k >= 0) escolhidas.splice(k, 1); else if (escolhidas.length < 20) escolhidas.push(id); else aviso('Cabem até 20 fotos num produto.');
          pintar();
        });
        var z = document.createElement('button'); z.type = 'button'; z.className = 'tkcx-zoom'; z.textContent = '🔍'; z.setAttribute('aria-label', 'Ver a foto ' + (i + 1) + ' inteira');
        z.addEventListener('click', function () { if (window.TKFotoGrande) TKFotoGrande.abrir({ itens: todas, indice: i }); });
        cel.appendChild(b); cel.appendChild(z); grade.appendChild(cel);
      });
      pintar();
    }
    var pe = document.createElement('div'); pe.className = 'tkcx-pe'; pe.appendChild(sairB); pe.appendChild(ok);
    jan.appendChild(cabeca); jan.appendChild(st); jan.appendChild(dica); jan.appendChild(grade); jan.appendChild(pe);
    document.body.appendChild(fundo); document.body.appendChild(jan);
    function limpar() { if (presa) { presa.soltar(); presa = null; } jan.remove(); fundo.remove(); try { document.documentElement.classList.remove('tk-travado'); } catch (e) { /* segue */ } }
    function fecharFolha() { if (window.TKCamadas && TKCamadas.aberta('tkcx-proximas')) TKCamadas.desempilhar('tkcx-proximas'); else limpar(); }
    fechar.addEventListener('click', fecharFolha); fundo.addEventListener('click', fecharFolha);
    sairB.addEventListener('click', function () { fecharFolha(); if (veioDaEsteira) { if (salvo || falhou) voltarEsteira(); else if (acompanha) { acompanha.modo = 'voltar'; espera('Salvando “' + (nomeSalvando || 'o produto') + '”… depois volto para a Esteira.'); } } });
    function seguir() {
      var ids = escolhidas.slice(), h = cab();
      if (h) fetch(INSTAGRAM_URL + '/esteira/caixa/usar', { method: 'POST', headers: h, keepalive: true, body: JSON.stringify({ ids: ids, uso: 'cadastro' }) }).catch(function () { return null; });
      fecharFolha();
      abrirCaixa(ids, false, veioDaEsteira);   // mesma tela: sem recarregar a Gestão
    }
    ok.addEventListener('click', function () {
      if (!escolhidas.length || falhou) return;
      if (salvo) return seguir();
      querSeguir = true; pintar();   // segue sozinho assim que o anterior terminar de salvar
    });
    var h0 = cab();
    if (h0 && typeof INSTAGRAM_URL !== 'undefined') {
      fetch(INSTAGRAM_URL + '/esteira/caixa?pagina=1&ver=novas', { headers: h0 })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (j) {
          var usadas = usadasAgora.slice();
          livres = ((j && j.ok && j.itens) || []).filter(function (x) { return x && x.status === 'nova' && /^https:\/\//.test(String(x.url || '')) && usadas.indexOf(Number(x.id)) < 0; }).slice(0, 24);
          if (j && j.ok) dica.textContent = 'Fotos novas da caixa (' + livres.length + '). ' + dica.textContent;
          desenharFotos();
        })
        .catch(function () { grade.replaceChildren(); var p = document.createElement('p'); p.className = 'tkcx-carregando'; p.textContent = 'Sem conexão para ler a caixa. Abra as fotos pela Esteira.'; grade.appendChild(p); ok.hidden = true; });
    }
    try { document.documentElement.classList.add('tk-travado'); } catch (e) { /* segue */ }
    if (window.TKCamadas) TKCamadas.empilhar('tkcx-proximas', limpar);
    if (window.TKJanela) presa = TKJanela.prender(jan, { fechar: fecharFolha, camada: 'tkcx-proximas', foco: '#tkcx-prox-sair' });
    pintar();
    return {
      salvo: function () {
        salvo = true; st.className = 'tkcx-salvando ok'; st.replaceChildren(document.createTextNode('✓ “' + (nomeSalvando || 'Produto') + '” salvo.'));
        if (querSeguir && escolhidas.length && jan.isConnected) return seguir();
        pintar();
      },
      erro: function () { falhou = true; st.className = 'tkcx-salvando erro'; st.replaceChildren(document.createTextNode('Não consegui salvar “' + (nomeSalvando || 'o produto') + '”. Feche e confira em “Envios e pendências”.')); pintar(); }
    };
  }

  /* ---- botões de salvar do cadastro com fotos da caixa ---- */
  var botoesLigados = false;
  function ligarBotoes() {
    var sv = document.getElementById('btn-salvar'); if (!sv) return;
    if (!document.getElementById('btn-salvar-proximo')) {
      var b = document.createElement('button'); b.type = 'button'; b.id = 'btn-salvar-proximo'; b.className = 'tk-btn-sec btn-salvar-proximo'; b.style.cssText = 'width:100%;margin-top:8px'; b.textContent = 'Salvar e cadastrar o próximo';
      b.addEventListener('click', function () {
        var antes = qtdEnvios(), nome = ((document.getElementById('nome') || {}).value || '').trim(), veio = !!lerVolta();
        gravarProx('1'); sv.click();
        aoEnfileirar(antes, function (entrou) {
          if (!entrou) { gravarProx(''); return; }   // faltou algum dado: o formulário já avisou o quê
          acompanha = { modo: 'proximo', nome: nome };
          acompanha.folha = folhaProximas(veio, nome);
          var p = caixaPendentes(); if (p && !p.length) salvouTudo();   // salvou antes de a folha abrir
        });
      });
      sv.insertAdjacentElement('afterend', b);
    }
    if (botoesLigados) return; botoesLigados = true;
    // "Cadastrar" (toque da pessoa): se veio da Esteira, mostra a espera e volta quando o servidor confirmar.
    sv.addEventListener('click', function (e) {
      if (!e.isTrusted) return;
      gravarProx('');
      if (!lerVolta() || !document.getElementById('btn-salvar-proximo')) return;
      var antes = qtdEnvios(), nome = ((document.getElementById('nome') || {}).value || '').trim();
      aoEnfileirar(antes, function (entrou) {
        if (!entrou) return;
        acompanha = { modo: 'voltar', nome: nome };
        espera('Salvando “' + (nome || 'o produto') + '”… depois volto para a Esteira.');
        var p = caixaPendentes(); if (p && !p.length) salvouTudo();
      });
    }, true);
  }

  /* ---- abrir o cadastro com fotos da caixa (pelo endereço, pelo "próximo" ou pelo app) ---- */
  var abrindo = null;
  function abrirCaixa(ids, varias, veioDaEsteira) {
    ids = (ids || []).map(Number).filter(function (n) { return n > 0; }).slice(0, 60);
    if (abrindo) clearInterval(abrindo);
    if (veioDaEsteira) gravarVolta(String(Date.now()));
    var tent = 0, pediuLogin = false, aplicado = false, n = ids.length;
    espera(n ? 'Abrindo o cadastro com ' + (n === 1 ? '1 foto' : n + ' fotos') + ' da caixa…' : 'Abrindo o cadastro…');
    // Lê as fotos já, em paralelo com a carga da Gestão.
    var leitura = null;
    function ler() {
      var h = cab(); if (!h || typeof INSTAGRAM_URL === 'undefined' || !n) return null;
      return fetch(INSTAGRAM_URL + '/esteira/caixa/itens?ids=' + ids.join(','), { headers: h })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .catch(function () { return { ok: false, semRede: true }; });
    }
    leitura = ler();
    function fim(t) { clearInterval(abrindo); abrindo = null; limparUrl(); fimEspera(); if (t) aviso(t); }
    abrindo = setInterval(function () {
      tent++;
      if (aplicado) return;
      if (!n) return fim('O link das fotos está incompleto. Abra de novo pela Esteira.');
      var lo = document.getElementById('login-overlay');
      if (lo && lo.classList.contains('visivel')) { fimEspera(); if (!pediuLogin) { pediuLogin = true; aviso('Entre na sua conta para cadastrar com as fotos da caixa.'); } tent = 0; return; }
      var u = (typeof usuarioAdmin !== 'undefined') ? usuarioAdmin : null, contas = (typeof modoLogin !== 'undefined') && modoLogin;
      var pronta = typeof window.tkAceitarRascunho === 'function' && typeof window.tkAceitarSeparado === 'function' && (typeof produtos !== 'undefined') && produtos && produtos.length;
      if (!pronta || (contas && !u && tent < 40)) {
        if (tent === 6) espera('Abrindo o cadastro… carregando os dados da loja.');
        if (tent > 120) fim('Não consegui abrir o cadastro agora. Atualize a página e tente de novo pela Esteira.');
        return;
      }
      if (u && typeof temPermissao === 'function' && !temPermissao(u, 'catalogo_cadastrar')) return fim('Seu acesso não permite cadastrar produtos. Produto ao Admin total a permissão de cadastrar produtos.');
      if (!leitura) leitura = ler();
      if (!leitura) return fim('Entre na sua conta para cadastrar com as fotos da caixa.');
      aplicado = true;
      leitura.then(function (j) {
        if (!j || !j.ok) return fim(j && j.semRede ? 'Sem conexão. Não consegui ler as fotos da caixa; tente de novo pela Esteira.' : (j && j.erro && !/^[\[{<]/.test(j.erro)) ? j.erro : 'Não consegui ler as fotos da caixa. Tente de novo pela Esteira.');
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
          window.tkAceitarRascunho({ id: 'caixa:' + itens.slice(0, 20).map(function (x) { return x.id; }).join('.'), legenda: '', midias: itens.slice(0, 20).map(function (x, k) { return { tipo: 'foto', url: x.url, capa: k === 0 }; }) });
          var t2 = document.getElementById('titulo-form'); if (t2) t2.textContent = 'Produto novo com fotos da caixa';
          var al2 = document.getElementById('aviso-lote'); if (al2) { al2.hidden = false; al2.textContent = txt + (itens.length > 20 ? ' Só as 20 primeiras entraram (limite por produto).' : ''); }
        }
        ligarBotoes();
        fim('');
      });
    }, 250);
  }
  function limparUrl() { try { if (/[?&]caixaFotos=/.test(location.search)) history.replaceState(history.state, '', location.pathname); } catch (e) { /* segue */ } }
  function lerEndereco(endereco) {
    var u; try { u = new URL(endereco, location.href); } catch (e) { return null; }
    var c = /^[0-9,]{1,400}$/.exec(u.searchParams.get('caixaFotos') || ''); if (!c) return null;
    return { ids: c[0].split(','), varias: u.searchParams.get('modo') === 'varias', volta: u.searchParams.get('volta') === 'esteira' };
  }
  /** App Android (2.5.3+): com a Gestão já aberta, "Abrir o cadastro" da Esteira usa esta tela em vez de recarregá-la. */
  window.tkAbrirCaixaFotos = function (endereco) {
    var p = lerEndereco(endereco); if (!p) return false;
    gravarProx(''); acompanha = null;
    abrirCaixa(p.ids, p.varias, p.volta); return true;
  };

  var inicio = lerEndereco(location.href);
  if (!inicio) return;
  abrirCaixa(inicio.ids, inicio.varias, inicio.volta);
})();
