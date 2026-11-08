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
  var emVoo = {};
  function enviarPend() {
    var h = cab(), l = lerPend(); if (!h || !l.length || typeof INSTAGRAM_URL === 'undefined') return;
    l.forEach(function (x) {
      if (emVoo[x.k]) return; emVoo[x.k] = 1;
      fetch(INSTAGRAM_URL + '/esteira/caixa/usar', { method: 'POST', headers: h, body: JSON.stringify({ ids: x.ids, uso: 'criado', produto: x.produto, produtoNome: x.nome || '' }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) gravarPend(lerPend().filter(function (y) { return y.k !== x.k; })); }).catch(function () {}).then(function () { delete emVoo[x.k]; });
    });
  }
  // produto salvo pelo cadastro: o envio leva rascunhoId "caixa:12.13" (o importador do Instagram ignora esse prefixo)
  window.addEventListener('tk:peca-salva', function (ev) {
    var d = ev && ev.detail; if (!d || !/^caixa:[0-9.]+$/.test(String(d.rascunhoId || ''))) return;
    var ids = String(d.rascunhoId).slice(6).split('.').map(Number).filter(function (n) { return n > 0; });
    if (!ids.length || !(d.id || d.codigo)) return;
    var l = lerPend(); l.push({ k: String(d.rascunhoId) + ':' + (d.id || d.codigo), ids: ids, produto: String(d.id || d.codigo), nome: String(d.codigo || '') }); gravarPend(l);
    enviarPend();
  });
  setTimeout(enviarPend, 4000);

  var m = /[?&]caixaFotos=([0-9,]{1,400})/.exec(location.search);
  if (!m) return;
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
        fim('');
      })
      .catch(function () { fim('Sem conexão. Não consegui ler as fotos da caixa; tente de novo pela Esteira.'); });
  }, 500);
})();
