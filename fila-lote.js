/* v7.50.0 — Trabalhos de lote em segundo plano: "Juntar produtos repetidos" e "Separar" (Gestão e loja).
 * Mesmo padrão do cadastro assíncrono (skill tenkiter-cadastro-assincrono):
 *  - a janela fecha logo e a pessoa continua trabalhando; um aviso discreto mostra o andamento e o resultado;
 *  - fila guardada no aparelho (IndexedDB `tenkiter_lote_fila_v1`) SEM credencial: só ids, códigos, nomes e endereços das fotos.
 *    A sessão entra na hora de enviar, pela função `chamar` que a página configura;
 *  - idempotente: cada trabalho tem um opId. Juntar de novo o mesmo grupo não duplica nada (o servidor não repete foto e quem já
 *    está arquivado continua arquivado). No Separar, cada produto novo vai com opId próprio (k-1, k-2…): o servidor 4.19+ devolve o
 *    mesmo produto em vez de criar outro. Cada passo concluído fica anotado, então retomar continua de onde parou;
 *  - "Pronto" só com resposta ok do servidor. Se a página fechar no meio, continua quando o painel ou a loja abrir de novo
 *    (não prometemos rodar com o app fechado). Web Locks evita duas abas fazendo o mesmo trabalho.
 * Não usa HTML com dados (só textContent). Erros em português. */
(function () {
  'use strict';
  if (window.TKFilaLote) return;
  const BD = 'tenkiter_lote_fila_v1', LOJA = 't';
  const MANTER_OK_MS = 24 * 3600 * 1000;
  let cfg = {}, jobs = [], rodando = false, carregou = false, timerOk = 0, el = null;

  /* ---------- IndexedDB (falhou? segue só na memória desta página) ---------- */
  function abrirBd() {
    return new Promise((res, rej) => {
      try {
        const rq = indexedDB.open(BD, 1);
        rq.onupgradeneeded = () => { rq.result.createObjectStore(LOJA, { keyPath: 'k' }); };
        rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
      } catch (e) { rej(e); }
    });
  }
  async function lerTodos() {
    try {
      const db = await abrirBd();
      return await new Promise((res) => { const rq = db.transaction(LOJA, 'readonly').objectStore(LOJA).getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => res(null); });
    } catch (e) { return null; }
  }
  async function guardar(j) {
    try { const db = await abrirBd(); await new Promise((res) => { const tx = db.transaction(LOJA, 'readwrite'); tx.objectStore(LOJA).put(JSON.parse(JSON.stringify(j))); tx.oncomplete = res; tx.onerror = res; tx.onabort = res; }); } catch (e) {}
  }
  async function apagar(k) {
    try { const db = await abrirBd(); await new Promise((res) => { const tx = db.transaction(LOJA, 'readwrite'); tx.objectStore(LOJA).delete(k); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {}
  }
  function novoK() { return 'lt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  async function carregar(retomar) {
    const salvos = await lerTodos();
    if (Array.isArray(salvos)) {
      const agora = Date.now(), porK = new Map(jobs.map((j) => [j.k, j]));
      salvos.forEach((j) => {
        if (j.estado === 'ok' && agora - Number(j.fimEm || 0) > MANTER_OK_MS) { apagar(j.k); return; }
        if (j.estado === 'rodando' && retomar) j.estado = 'fila';   // com a vez (lock) nesta aba: a página que rodava fechou no meio; retoma (cada passo é idempotente)
        porK.set(j.k, Object.assign(porK.get(j.k) || {}, j));
      });
      jobs = Array.from(porK.values()).sort((a, b) => a.criadoEm - b.criadoEm);
    }
    carregou = true;
  }

  /* ---------- textos ---------- */
  const rotulo = (p) => (p && (p.codigo || p.nome)) || 'o produto';
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
  function erroLegivel(r, padrao) {
    if (r && r.semPermissao) return 'Sua conta não tem permissão para isso. Fale com a gestão.';
    if (r && r.semRede) return 'Sem conexão. Verifique a internet e tente de novo.';
    const t = String((r && r.erro) || '').trim();
    if (t && t.length < 220 && !/[{}<>]|Exception|TypeError|HTTP \d/.test(t)) return t;
    return padrao;
  }
  function textos(j) {
    if (j.tipo === 'juntar') {
      const n = 1 + j.origens.length;
      if (j.estado === 'ok') {
        const r = j.resultado || {};
        return { tit: 'Pronto: ' + rotulo(j.destino) + (r.fotos != null ? ' ficou com ' + plural(Number(r.fotos), 'foto', 'fotos') : ' recebeu as fotos') + '; ' + plural(Number(r.arquivados != null ? r.arquivados : j.origens.length), 'arquivada', 'arquivadas') + '.', sub: '' };
      }
      if (j.estado === 'erro') return { tit: 'Não consegui juntar em ' + rotulo(j.destino) + '.', sub: j.msg || 'Tente de novo.' };
      return { tit: 'Juntando ' + n + ' produtos em ' + rotulo(j.destino) + '…', sub: 'Pode continuar trabalhando. Se fechar a página, continua quando você abrir de novo.' };
    }
    const n = j.fotos.length, novos = n - 1, feitos = Object.keys(j.criados || {}).length;
    const fam = j.familia && j.familia.modo !== 'nao';
    if (j.estado === 'ok') return { tit: 'Pronto: ' + rotulo(j.produto) + ' virou ' + n + ' produtos' + (fam ? ' na mesma família.' : ' soltos.'), sub: j.aviso || '' };
    if (j.estado === 'erro') return { tit: 'Não terminei de separar ' + rotulo(j.produto) + '.', sub: (j.msg || 'Tente de novo.') + ' Nada foi perdido: o que já foi criado fica e o resto continua ao tentar de novo.' };
    return { tit: 'Separando ' + rotulo(j.produto) + ' em ' + n + ' produtos… (' + feitos + ' de ' + novos + ' novos)', sub: 'Pode continuar trabalhando. Se fechar a página, continua quando você abrir de novo.', pct: novos ? Math.round((feitos / novos) * 100) : 0 };
  }

  /* ---------- aviso discreto ---------- */
  function css() {
    if (document.getElementById('tk-fila-lote-css')) return;
    const s = document.createElement('style'); s.id = 'tk-fila-lote-css';
    s.textContent =
      '.tk-fila-lote{position:fixed;left:12px;right:12px;bottom:calc(86px + env(safe-area-inset-bottom,0px));z-index:84;max-width:520px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;background:#0d0d0d;color:#fff;border:2px solid #E67E22;border-radius:14px;padding:10px 12px 10px 14px;font-size:.9rem;line-height:1.3;box-shadow:0 6px 18px rgba(0,0,0,.35)}' +
      '.tk-fila-lote[hidden]{display:none}' +
      'body:has(.envios-flut:not([hidden])) .tk-fila-lote{bottom:calc(160px + env(safe-area-inset-bottom,0px))}' +
      '.tk-fila-lote .tfl-txt{flex:1 1 200px;min-width:0}' +
      '.tk-fila-lote .tfl-txt b{display:block;font-weight:800}' +
      '.tk-fila-lote .tfl-txt small{display:block;font-size:.76rem;color:#d6d6d6;font-weight:500;margin-top:2px}' +
      '.tk-fila-lote .tfl-barra{flex-basis:100%;display:block;height:5px;border-radius:3px;background:#444;overflow:hidden}' +
      '.tk-fila-lote .tfl-barra i{display:block;height:100%;background:#E67E22;transition:width .3s}' +
      '.tk-fila-lote .tfl-acoes{display:flex;gap:6px;flex:none}' +
      '.tk-fila-lote button{width:auto;min-height:44px;min-width:44px;padding:0 12px;border-radius:10px;border:0;font:inherit;font-weight:800;font-size:.84rem;cursor:pointer;background:#2b2b2b;color:#fff}' +
      '.tk-fila-lote button.tfl-prim{background:#E67E22;color:#0d0d0d}' +
      '.tk-fila-lote button:focus-visible{outline:3px solid #fff;outline-offset:2px}' +
      '.tk-fila-lote .tfl-gira{display:inline-block;width:14px;height:14px;border:2px solid #E67E22;border-right-color:transparent;border-radius:50%;margin-right:6px;vertical-align:-2px;animation:tfl-g .9s linear infinite}' +
      '@keyframes tfl-g{to{transform:rotate(360deg)}}' +
      '@media (prefers-reduced-motion:reduce){.tk-fila-lote .tfl-gira{animation:none}.tk-fila-lote .tfl-barra i{transition:none}}' +
      '.tk-fila-lote.ok{border-color:#4caf50}.tk-fila-lote.erro{border-color:#ff6b6b;background:#4a0f0f}';
    document.head.appendChild(s);
  }
  function caixa() {
    if (el && document.body.contains(el)) return el;
    css();
    el = document.createElement('div'); el.id = 'tk-fila-lote'; el.className = 'tk-fila-lote'; el.hidden = true;
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return el;
  }
  function botao(txt, cls, fn, rot) { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; if (cls) b.className = cls; if (rot) b.setAttribute('aria-label', rot); b.addEventListener('click', fn); return b; }
  function desenhar() {
    if (!document.body) return;
    const box = caixa();
    const ativo = jobs.find((j) => j.estado === 'rodando') || jobs.find((j) => j.estado === 'fila');
    const erro = jobs.filter((j) => j.estado === 'erro').pop();
    const ok = jobs.filter((j) => j.estado === 'ok' && !j.visto).pop();
    const j = ativo || erro || ok;
    clearTimeout(timerOk);
    if (!j) { box.hidden = true; box.replaceChildren(); return; }
    const t = textos(j);
    box.className = 'tk-fila-lote' + (j.estado === 'ok' ? ' ok' : j.estado === 'erro' ? ' erro' : '');
    box.dataset.estado = j.estado; box.dataset.tipo = j.tipo;
    const txt = document.createElement('div'); txt.className = 'tfl-txt';
    const b = document.createElement('b');
    if (j === ativo) { const g = document.createElement('span'); g.className = 'tfl-gira'; g.setAttribute('aria-hidden', 'true'); b.append(g); }
    b.append(document.createTextNode(t.tit)); txt.append(b);
    const outros = jobs.filter((x) => x !== j && (x.estado === 'fila' || x.estado === 'rodando')).length;
    const sub = (t.sub || '') + (outros ? (t.sub ? ' ' : '') + '+ ' + plural(outros, 'trabalho', 'trabalhos') + ' na fila.' : '');
    if (sub) { const s = document.createElement('small'); s.textContent = sub; txt.append(s); }
    const acoes = document.createElement('div'); acoes.className = 'tfl-acoes';
    if (j.estado === 'erro') {
      acoes.append(botao('Tentar de novo', 'tfl-prim', () => tentarDeNovo(j.k)), botao('Descartar', '', () => descartar(j.k), 'Descartar este trabalho'));
    } else if (j.estado === 'ok') {
      acoes.append(botao('OK', '', () => { j.visto = true; guardar(j); desenhar(); }, 'Fechar o aviso'));
      const some = () => { if (window.TKCamadas && TKCamadas.total() > 0) { timerOk = setTimeout(some, 4000); return; } j.visto = true; guardar(j); desenhar(); };   // com uma janela aberta por cima, espera ela fechar para a pessoa ver
      timerOk = setTimeout(some, 15000);
    }
    const nos = [txt]; if (acoes.childNodes.length) nos.push(acoes);
    if (j === ativo && t.pct != null) { const br = document.createElement('span'); br.className = 'tfl-barra'; const i = document.createElement('i'); i.style.width = t.pct + '%'; br.append(i); nos.push(br); }
    box.replaceChildren(...nos);
    box.hidden = false;
  }

  /* ---------- execução ---------- */
  function falha(msg, semRede) { const e = new Error(msg); e.legivel = msg; e.semRede = !!semRede; return e; }
  async function chamar(corpo, padrao) {
    if (typeof cfg.chamar !== 'function') throw falha('Abra a Gestão para terminar este trabalho.');
    let r;
    try { r = await cfg.chamar(corpo); } catch (e) { throw falha('Sem conexão. Verifique a internet e tente de novo.', true); }
    if (!r || !r.ok) throw falha(erroLegivel(r, padrao), !!(r && r.semRede));
    return r;
  }
  async function executarJuntar(j) {
    const r = await chamar({ action: 'juntarProdutos', destinoId: j.destino.id, origemIds: j.origens.map((o) => o.id), opId: j.k }, 'Não consegui juntar agora. Tente de novo.');
    j.resultado = { fotos: r.fotosNoDestino != null ? r.fotosNoDestino : null, arquivados: r.arquivados != null ? r.arquivados : j.origens.length };
  }
  async function executarSeparar(j) {
    j.criados = j.criados || {};
    // 1) um produto novo para cada foto extra (opId próprio: repetir devolve o mesmo produto)
    for (let i = 1; i < j.fotos.length; i++) {
      if (j.criados[i]) continue;
      const r = await chamar(Object.assign({}, j.base, { action: 'create', fotoUrlExistente: j.fotos[i], fotosGaleriaExistentes: '', novidade: false, notificarPush: false, opId: j.k + '-' + i }), 'Não consegui criar o produto da foto ' + (i + 1) + '. Tente de novo.');
      if (!r.id) throw falha('O servidor não devolveu o produto da foto ' + (i + 1) + '. Tente de novo.');
      j.criados[i] = { id: String(r.id), codigo: r.codigo || '' };
      await guardar(j); desenhar();
    }
    // 2) a peça original fica só com a 1ª foto (as outras já estão nos produtos novos: nada se perde). Repetir dá o mesmo resultado.
    if (!j.originalOk) {
      await chamar(Object.assign({}, j.baseOriginal, { action: 'update', id: j.produto.id, fotoUrlExistente: j.fotos[0], fotosGaleriaExistentes: '' }), 'Os produtos novos foram criados, mas não consegui tirar as fotos extras do produto original. Tente de novo.');
      j.originalOk = true; await guardar(j);
    }
    // 3) família (opcional): ligar de novo as mesmas peças não muda nada
    if (j.familia && j.familia.modo !== 'nao' && !j.familiaOk) {
      const ids = [String(j.produto.id)].concat(Object.keys(j.criados).sort((a, b) => a - b).map((k) => j.criados[k].id));
      if (typeof cfg.ligarFamilia !== 'function') throw falha('Os produtos foram separados. Abra a Gestão para ligar a família.');
      let r;
      try { r = await cfg.ligarFamilia(ids, j.familia); } catch (e) { r = null; }
      if (!r || !r.ok) throw falha('Os produtos foram separados, mas não consegui ligar a família: ' + erroLegivel(r, 'tente de novo.'));
      j.familiaOk = true; await guardar(j);
    }
  }
  async function executar(j) {
    j.estado = 'rodando'; j.tentativas = (j.tentativas || 0) + 1; j.msg = ''; await guardar(j); desenhar();
    try {
      if (j.tipo === 'juntar') await executarJuntar(j); else await executarSeparar(j);
      j.estado = 'ok'; j.fimEm = Date.now(); j.visto = false;
      await guardar(j); desenhar();
      try { if (typeof cfg.aoConcluir === 'function') await cfg.aoConcluir(j); } catch (e) {}
    } catch (e) {
      j.estado = 'erro'; j.msg = (e && e.legivel) || 'Não consegui terminar agora. Tente de novo.'; j.semRede = !!(e && e.semRede);
      await guardar(j); desenhar();
    }
  }
  async function rodar() {
    if (rodando || typeof cfg.chamar !== 'function') return;
    rodando = true;
    const trabalho = async () => {
      await carregar(true);   // outra aba pode ter terminado algo enquanto esperávamos a vez
      let j;
      while ((j = jobs.find((x) => x.estado === 'fila'))) await executar(j);
    };
    try {
      if (navigator.locks && typeof navigator.locks.request === 'function') await navigator.locks.request('tk-fila-lote', trabalho);
      else await trabalho();
    } catch (e) {} finally { rodando = false; desenhar(); }
  }
  async function adicionar(j) {
    j.k = j.k || novoK(); j.criadoEm = Date.now(); j.estado = 'fila';
    jobs.push(j); await guardar(j); desenhar(); rodar();
    return j;
  }
  function tentarDeNovo(k) { const j = jobs.find((x) => x.k === k); if (!j) return; j.estado = 'fila'; j.msg = ''; guardar(j).then(() => { desenhar(); rodar(); }); }
  function descartar(k) { jobs = jobs.filter((x) => x.k !== k); apagar(k); desenhar(); }
  window.addEventListener('online', () => { jobs.filter((j) => j.estado === 'erro' && j.semRede).forEach((j) => { j.estado = 'fila'; }); rodar(); });

  window.TKFilaLote = {
    /** A página informa como falar com o servidor (com a sessão de quem está logado) e o que fazer quando um trabalho termina. */
    configurar(c) { cfg = Object.assign({}, cfg, c || {}); (carregou ? Promise.resolve() : carregar()).then(() => { desenhar(); rodar(); }); },
    /** destino/origens: { id, codigo, nome }. */
    juntar(destino, origens) {
      const limpa = (p) => ({ id: String(p.id), codigo: String(p.codigo || ''), nome: String(p.nome || '').slice(0, 80) });
      return adicionar({ tipo: 'juntar', destino: limpa(destino), origens: origens.map(limpa) });
    },
    /** produto { id, codigo, nome }; fotos: endereços (a 1ª fica na original); base: dados para os novos; baseOriginal: dados atuais da original;
     *  familia: { modo: 'nova' | 'atual' | 'nao', nome }. */
    separar(o) {
      return adicionar({ tipo: 'separar', produto: { id: String(o.produto.id), codigo: String(o.produto.codigo || ''), nome: String(o.produto.nome || '').slice(0, 80) }, fotos: o.fotos.slice(), base: o.base, baseOriginal: o.baseOriginal, familia: o.familia || { modo: 'nao' }, criados: {} });
    },
    pendentes() { return jobs.filter((j) => j.estado === 'fila' || j.estado === 'rodando'); },
    lista() { return jobs.slice(); },
    ocupado(ids) { const s = new Set((ids || []).map(String)); return jobs.some((j) => (j.estado === 'fila' || j.estado === 'rodando') && (j.tipo === 'juntar' ? [j.destino.id].concat(j.origens.map((o) => o.id)) : [j.produto.id]).some((id) => s.has(String(id)))); },
    _rodar: rodar
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { carregar().then(desenhar); }); else carregar().then(desenhar);
})();
