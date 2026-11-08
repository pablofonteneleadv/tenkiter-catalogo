/* v7.49.0 — Fotos novas e fotos postadas (vitrine e Postagens).
 *
 * 1) Ordem "mais recentes": peça que ganhou FOTO NOVA (inclusão de foto; preço, nome, tamanho e estoque não contam) sobe para o começo,
 *    no lugar da data da foto nova, como se tivesse sido cadastrada naquele momento. Outras ordenações (nome, preço…) ficam como a
 *    pessoa escolheu. O mapa "peça → data da última foto nova" vem do Worker (GET /catalogo/fotos-novas, público, só id e data) com
 *    cache local de 10 min e limite de 2,5 s: sem resposta, a vitrine fica exatamente como antes (nunca espera o Worker para pintar).
 * 2) Postagens: "Postada hoje" / "Postada há N dias" por foto, a partir de GET /post/fotos-postadas (com sessão).
 */
(function () {
  'use strict';
  var CHAVE = 'tk_fotos_novas_v1', VALIDADE = 10 * 60 * 1000, LIMITE_MS = 2500;
  var mapa = {};                                   // ID do produto → ms da última foto nova

  function usar(obj) {
    var m = {};
    Object.keys(obj && typeof obj === 'object' ? obj : {}).forEach(function (k) { var t = Date.parse(obj[k]); if (isFinite(t)) m[String(k)] = t; });
    var mudou = JSON.stringify(m) !== JSON.stringify(mapa);
    mapa = m;
    return mudou;
  }
  /** Momento do cadastro: o ID das peças é o carimbo em milissegundos; sem isso, Data_Cadastro (ISO ou dd/mm/aaaa hh:mm). */
  function cadastroMs(p) {
    var id = String((p && p.ID) || '');
    if (/^\d{12,13}$/.test(id)) { var n = Number(id); if (n > 1e12 && n < 4e12) return n; }
    var d = String((p && p.Data_Cadastro) || '').trim(); if (!d) return NaN;
    var br = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] || 0), Number(br[5] || 0), Number(br[6] || 0)).getTime();
    var t = Date.parse(d); return isFinite(t) ? t : NaN;
  }
  function dataDe(id) { return mapa[String(id)] || 0; }
  /** Ordem "mais recentes" com foto nova: quem ganhou foto nova (depois do próprio cadastro) entra antes da primeira peça
   * cadastrada antes daquela foto. O resto mantém a ordem recebida. Sem mapa, devolve a mesma lista. */
  function ordenar(lista) {
    if (!Array.isArray(lista) || lista.length < 2 || !Object.keys(mapa).length) return lista;
    var sobe = [], resto = [];
    lista.forEach(function (p) {
      var f = dataDe(p && p.ID), c = cadastroMs(p);
      if (f && !(isFinite(c) && c >= f)) sobe.push({ p: p, f: f }); else resto.push(p);
    });
    if (!sobe.length) return lista;
    sobe.sort(function (a, b) { return b.f - a.f; });
    var out = [], i = 0, j = 0;
    while (i < sobe.length && j < resto.length) {
      var c = cadastroMs(resto[j]);
      if (isFinite(c) && c > sobe[i].f) out.push(resto[j++]); else out.push(sobe[i++].p);
    }
    while (i < sobe.length) out.push(sobe[i++].p);
    while (j < resto.length) out.push(resto[j++]);
    return out;
  }
  /** Lê o cache (pinta na hora) e pede o mapa ao Worker com limite de 2,5 s. aoMudar() só é chamado se algo mudou. */
  function carregar(aoMudar) {
    var cache = null;
    try { cache = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { cache = null; }
    if (cache && cache.mapa && Date.now() - (Number(cache.em) || 0) < VALIDADE) usar(cache.mapa);
    if (typeof INSTAGRAM_URL === 'undefined' || typeof fetch !== 'function') return Promise.resolve(false);
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var limite = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (e) {} }, LIMITE_MS);
    return fetch(INSTAGRAM_URL + '/catalogo/fotos-novas', ctl ? { signal: ctl.signal } : undefined).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      clearTimeout(limite);
      if (!j || !j.ok || !j.fotosNovas || typeof j.fotosNovas !== 'object') return false;
      try { localStorage.setItem(CHAVE, JSON.stringify({ em: Date.now(), mapa: j.fotosNovas })); } catch (e) {}
      var mudou = usar(j.fotosNovas);
      if (mudou && typeof aoMudar === 'function') { try { aoMudar(); } catch (e) {} }
      return mudou;
    }).catch(function () { clearTimeout(limite); return false; });
  }

  /* ---------- fotos postadas (Postagens) ---------- */
  function fotosDe(p) {
    var out = [];
    [p && p.Foto_URL].concat(String((p && p.Fotos_Galeria) || '').split(',')).forEach(function (u) { u = String(u == null ? '' : u).trim(); if (/^https:\/\//i.test(u) && out.indexOf(u) === -1) out.push(u); });
    return out;
  }
  /** Dias de calendário entre a postagem e hoje (0 = hoje). */
  function diasDesde(iso, agora) {
    var t = Date.parse(iso); if (!isFinite(t)) return -1;
    var a = new Date(agora || Date.now()), d = new Date(t);
    var hoje = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime(), dia = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.max(0, Math.round((hoje - dia) / 864e5));
  }
  function quando(iso, agora) { var n = diasDesde(iso, agora); return n < 0 ? '' : n === 0 ? 'hoje' : n === 1 ? 'há 1 dia' : 'há ' + n + ' dias'; }
  function textoPostada(iso, agora) { var q = quando(iso, agora); return q ? 'Postada ' + q : ''; }
  /** Monta a consulta "quando esta foto desta peça foi postada" a partir da resposta do Worker.
   * Exato: endereço original guardado na postagem (inclusive colagem/modelo). Recorte feito na Gestão herda da foto original.
   * Postagem antiga (sem origem guardada): endereço igual; se a mídia foi transformada, a posição na mesma peça. */
  function resolvedor(resp) {
    var porUrl = {}, der = (resp && resp.derivadas) || {}, legado = (resp && Array.isArray(resp.legado)) ? resp.legado : [], cachePeca = {};
    var marcar = function (m, u, em) { if (u && em && (!m[u] || m[u] < em)) m[u] = em; };
    Object.keys((resp && resp.porUrl) || {}).forEach(function (u) { marcar(porUrl, u, resp.porUrl[u]); });
    legado.forEach(function (x) { (x.u || []).forEach(function (u) { marcar(porUrl, u, x.em); }); });   // endereço igual vale para qualquer produto
    function daPeca(p) {
      var id = String((p && p.ID) || ''); if (cachePeca[id]) return cachePeca[id];
      var m = {}, fotos = fotosDe(p), cod = String((p && p.Codigo) || '');
      legado.forEach(function (x) {
        if (!x.c || (x.c !== id && x.c !== cod)) return;
        (x.u || []).forEach(function (u, i) { if (fotos.indexOf(u) !== -1) marcar(m, u, x.em); else if (fotos[i] && (x.u.indexOf(fotos[i]) === -1)) marcar(m, fotos[i], x.em); });
      });
      cachePeca[id] = m; return m;
    }
    function em(p, url) {
      var u = String(url || ''), cands = [porUrl[u], der[u] ? porUrl[der[u]] : '', p ? daPeca(p)[u] : '', p && der[u] ? daPeca(p)[der[u]] : ''];
      var melhor = ''; cands.forEach(function (c) { if (c && c > melhor) melhor = c; });
      return melhor;
    }
    /** Resumo para a lista de peças: {texto, novas, total, todas}. */
    function resumo(p, agora) {
      var fotos = fotosDe(p); if (!fotos.length) return null;
      var datas = fotos.map(function (u) { return em(p, u); }), postadas = datas.filter(Boolean), novas = fotos.length - postadas.length;
      if (!postadas.length) return { texto: fotos.length > 1 ? 'Nenhuma das ' + fotos.length + ' fotos postada' : 'Foto ainda não postada', novas: novas, total: fotos.length, todas: false, nenhuma: true };
      if (!novas) { var ult = postadas.sort().pop(); return { texto: 'Tudo já postado ' + quando(ult, agora), novas: 0, total: fotos.length, todas: true }; }
      return { texto: novas === 1 ? '1 foto nova para postar' : novas + ' fotos novas para postar', novas: novas, total: fotos.length, todas: false };
    }
    return { em: em, resumo: resumo };
  }

  window.TKFotosNovas = { carregar: carregar, usar: usar, ordenar: ordenar, dataDe: dataDe, cadastroMs: cadastroMs, fotosDe: fotosDe, diasDesde: diasDesde, quando: quando, textoPostada: textoPostada, resolvedor: resolvedor };
})();
