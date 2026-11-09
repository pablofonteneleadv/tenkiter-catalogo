/* v7.44.0 / v7.47.0 — Família de produtos na Gestão.
 * Família = o mesmo produto cadastrado em várias peças, que podem mudar por estampa ou por tamanho. Cada peça continua
 * própria (fotos, estoque, link). Ligar só RECONHECE as peças: não pede nada e não muda nada nelas — ninguém digita nome,
 * tamanho, idade ou cor (evita duplicidade com pouca diferença). O rótulo de tamanho, quando existe, sai do próprio nome.
 * "+ Nova variação desta família" na edição, "Ligar como família" na seleção em lote, "Sugestões de famílias" e
 * "Tirar da família". A ligação fica no Worker (D1); a planilha e o Apps Script não mudam.
 * Janelas com TKCamadas (abrirComHistorico_), textos montados com nós (nada de HTML com dados), erros em português. */
(function () {
  'use strict';
  if (typeof INSTAGRAM_URL === 'undefined') return;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const botao = (txt, cls, fn) => { const b = el('button', cls, txt); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
  const lista_ = () => (typeof produtos !== 'undefined' && Array.isArray(produtos) ? produtos : []);
  const peca_ = (id) => lista_().find((x) => String(x.ID) === String(id)) || null;

  /* ---------- nome sem o tamanho (mesma regra do servidor; o servidor decide as sugestões) ---------- */
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const SEP = /[\s\-–—/(,|]+$/;
  function separarNome(nome) {
    const orig = String(nome || '').trim().replace(/\s+/g, ' '), n = semAcento(orig);
    const nada = { base: orig, rotulo: '' };
    const m = n.match(/([\s\-–—/(,|]+)((?:tam(?:anho)?\.?\s*|n[º°o]\.?\s*)?)(pp|p|m|g|gg|xg|eg|exg|g[1-4]|u|unico|rn|\d{1,2}\s*(?:anos?|meses?)|\d{1,2})\)?\s*$/);
    if (!m) return nada;
    if (/^\d{1,2}$/.test(m[3]) && !m[2]) { const k = Number(m[3]); if (!((k >= 1 && k <= 16) || (k >= 34 && k <= 56))) return nada; }
    const tam = n.length - m.index - m[1].length;
    let rot = orig.slice(orig.length - tam).replace(/\)\s*$/, '').trim().replace(/^(tam(anho)?\.?|n[º°o]\.?)\s*/i, '').trim();
    const r0 = semAcento(rot);
    if (r0 === 'unico') rot = 'Único'; else if (/^(pp|p|m|g|gg|xg|eg|exg|g[1-4]|u|rn)$/.test(r0)) rot = r0.toUpperCase();
    const base = orig.slice(0, orig.length - tam - m[1].length).replace(SEP, '').trim();
    return base ? { base, rotulo: rot } : nada;
  }
  window.tkFamiliaSepararNome = separarNome;

  /* ---------- servidor ---------- */
  async function srv(caminho, corpo) {
    const s = typeof getSessao === 'function' ? getSessao() : null;
    if (!s && caminho !== '/familias') return { ok: false, erro: 'Entre na sua conta para organizar as famílias de produtos.' };
    try {
      const h = { 'Content-Type': 'application/json' }; if (s) { h['X-TK-Whats'] = s.whatsapp; h['X-TK-Sessao'] = s.sessao; }
      const r = await fetch(INSTAGRAM_URL + caminho, { method: corpo ? 'POST' : 'GET', headers: h, body: corpo ? JSON.stringify(corpo) : undefined, cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!j) return { ok: false, erro: 'O servidor das famílias não respondeu direito. Tente de novo.' };
      if (!j.ok) j.erro = window.TKPadrao ? TKPadrao.erro(j, 'Não consegui agora. Tente de novo.') : (j.erro || 'Não consegui agora. Tente de novo.');   // v7.57.0: nunca JSON nem código na tela
      return j;
    } catch (e) { return { ok: false, erro: 'Sem conexão. Verifique a internet e tente de novo.' }; }
  }
  let familias = [], carregou = false, carregando = null;
  /** v7.47.1: selo "Família · N peças" nos cards da lista (depois de cada desenho da lista e quando as famílias chegam). */
  function marcarLista(container) {
    const c = container || $('lista-produtos'); if (!c) return;
    c.querySelectorAll('.produto-chk[data-id]').forEach((chk) => {
      const card = chk.closest('.produto'); if (!card) return;
      const velho = card.querySelector('.fam-selo'); if (velho) velho.remove();
      const f = familiaDe(chk.dataset.id); if (!f) return;
      const s = el('span', 'fam-selo', 'Família · ' + f.membros.length + ' produtos'); s.title = 'Família “' + (f.nome || '') + '”';
      const nome = card.querySelector('.produto-info .nome'); if (nome) nome.after(s); else card.querySelector('.produto-info')?.append(s);
    });
  }
  window.tkFamiliaMarcarLista = marcarLista;
  const familiaDe = (id) => familias.find((f) => f.membros.some((m) => String(m.produto) === String(id))) || null;
  function carregar() {
    if (carregando) return carregando;
    carregando = srv('/familias').then((j) => { if (j && j.ok && Array.isArray(j.familias)) { familias = j.familias; carregou = true; } carregando = null; pintarForm(); marcarLista(); return familias; });
    return carregando;
  }
  function usarFamilia(f, tirarProduto) {
    familias = familias.filter((x) => x.id !== (f && f.id) && !(tirarProduto && x.membros.some((m) => String(m.produto) === String(tirarProduto))));
    if (f) familias.push(f);
    try { localStorage.removeItem('tk_familias_v1'); } catch (e) {}   // a vitrine deste aparelho busca a lista nova
    marcarLista();
  }
  const aviso = (txt) => { const s = $('status'); if (s) s.textContent = txt; };

  /* ---------- formulário: família da peça aberta, "+ Novo tamanho" e "Tirar da família" ---------- */
  let pecaForm = null;
  window.__familiaNova = null;
  function caixaForm() {
    let box = $('fam-form');
    if (!box) { box = el('section', 'fam-form'); box.id = 'fam-form'; box.setAttribute('aria-label', 'Família de tamanhos'); box.hidden = true; const ref = $('audit-form'); if (ref) ref.after(box); }
    return box;
  }
  function pintarForm() {
    const box = caixaForm(); if (!box) return;
    box.replaceChildren();
    const nova = window.__familiaNova;
    if (nova) {   // cadastrando um tamanho novo
      box.hidden = false; box.classList.add('nova');
      box.append(el('b', 'fam-tit', 'Nova variação da família “' + nova.base + '”'), el('p', 'fam-sub', 'Fotos, tamanhos, cores e quantidade ficam vazios: escolha o que é deste produto. O resto veio do produto original. Ao cadastrar, ele entra na família.'));
      return;
    }
    box.classList.remove('nova');
    const p = pecaForm && typeof modoFormulario !== 'undefined' && modoFormulario === 'editando' ? peca_(pecaForm) : null;
    if (!p) { box.hidden = true; return; }
    box.hidden = false;
    const f = familiaDe(p.ID);
    if (!carregou) box.append(el('p', 'fam-sub', 'Conferindo a família deste produto…'));
    else if (f) {
      box.append(el('b', 'fam-tit', 'Família: ' + (f.nome || 'produtos ligados') + ' · ' + f.membros.length + ' produtos'));
      const tams = el('div', 'fam-tams'); tams.setAttribute('role', 'group'); tams.setAttribute('aria-label', 'Produtos desta família');
      f.membros.forEach((m, k) => {
        const q = peca_(m.produto), atual = String(m.produto) === String(p.ID);
        const desc = (q ? (q.Codigo ? q.Codigo + ' ' : '') + q.Nome : 'produto ' + m.produto) + (m.rotulo ? ', ' + m.rotulo : '');
        // v7.47.1: tocar na foto de outra peça abre a edição dela
        const t = el(atual || !q ? 'figure' : 'button', 'fam-tam' + (atual ? ' atual' : ''));
        if (atual) { t.setAttribute('aria-current', 'true'); t.setAttribute('aria-label', 'Este produto: ' + desc); }
        else if (q) { t.type = 'button'; t.setAttribute('aria-label', 'Abrir ' + desc); t.title = 'Abrir este produto'; t.addEventListener('click', () => abrirOutra(m.produto)); }
        else t.setAttribute('aria-label', desc + ' (fora desta lista)');
        t.append(foto(q && q.Foto_URL), el(atual || !q ? 'figcaption' : 'span', '', m.rotulo || (atual ? 'esta' : String(k + 1))));
        tams.append(t);
      });
      box.append(tams);
    } else box.append(el('p', 'fam-sub', 'Este produto ainda não está ligado a outras do mesmo produto.'));
    const acoes = el('div', 'fam-acoes');
    acoes.append(botao('+ Nova variação desta família', 'fam-novo', () => novaVariacao(p.ID)));
    if (f) {
      const tirar = botao('Tirar da família', 'fam-tirar');
      tirar.addEventListener('click', async () => {
        if (!confirm('Tirar este produto da família? Ele continua no site; só deixa de aparecer junto dos outros da família.')) return;
        tirar.disabled = true; st.className = 'fam-st'; st.textContent = 'Tirando da família…';
        const r = await srv('/familias/desligar', { produto: String(p.ID) });
        if (!r.ok) { tirar.disabled = false; st.className = 'fam-st erro'; st.textContent = r.erro; return; }
        usarFamilia(r.familia, p.ID); aviso(r.dissolvida ? 'Produto tirado da família. Como sobrou só um produto, a família foi desfeita.' : 'Produto tirado da família.');
        pintarForm();
      });
      acoes.append(tirar);
    }
    const st = el('p', 'fam-st'); st.setAttribute('role', 'status');
    box.append(acoes, st);
  }
  function abrirOutra(id) {
    if (typeof editarProduto !== 'function') return;
    editarProduto(String(id));
    setTimeout(() => { const box = $('fam-form'); if (box) { try { box.scrollIntoView({ block: 'nearest' }); } catch (e) {} const a = box.querySelector('.fam-tam.atual'); if (a) { a.tabIndex = -1; a.focus({ preventScroll: true }); } } }, 60);
  }
  window.tkFamiliaForm = function (p) {
    pecaForm = p ? p.ID : null;
    if (!p) window.__familiaNova = null;
    pintarForm();
    if (p && !carregou) carregar();
  };

  /** "+ Nova variação desta família": cadastro já preenchido a partir da peça (fluxo de duplicar). Fotos, tamanhos, cores e
   * quantidade ficam vazios (são de cada peça); o resto, inclusive o nome, vem igual e só muda se a pessoa quiser. Nada é digitado à parte. */
  function novaVariacao(id) {
    const p = peca_(id); if (!p || typeof duplicarProduto !== 'function') return;
    const f = familiaDe(p.ID);
    const base = (f && f.nome) || separarNome(p.Nome).base || p.Nome;
    const alertaOrig = window.alert; window.alert = function () {};   // o duplicar avisa "selecione uma foto": aqui o aviso fica no próprio formulário
    try { duplicarProduto(p.ID); } finally { window.alert = alertaOrig; }
    ['tamanhos', 'cores', 'estoque'].forEach((k) => { const c = $(k); if (c) c.value = ''; });
    try { if (typeof cadLerVinculos_ === 'function') cadLerVinculos_(); if (typeof cadDesenharVinculos_ === 'function') cadDesenharVinculos_(); } catch (e) {}
    try { if (typeof zerarMidia === 'function') zerarMidia(null); } catch (e) {}
    const la = $('linha-arquivar-depois'); if (la) la.style.display = 'none';
    $('nome').value = String(p.Nome || '').slice(0, 80);
    window.__familiaNova = { origem: String(p.ID), familia: f ? f.id : '', base, nomeOrigem: p.Nome };
    if (typeof tituloForm_ === 'function') tituloForm_('Nova variação: ' + base);
    const bs = $('btn-salvar'); if (bs) bs.textContent = 'Cadastrar esta variação';
    const bc = $('btn-cancelar-duplicar'); if (bc) { bc.textContent = 'Cancelar nova variação'; bc.style.display = 'block'; }
    pintarForm();
    try { if (typeof atualizarFaltas_ === 'function') atualizarFaltas_(); } catch (e) {}
  }
  /* v7.50.0: "Separar" (fila-lote.js) — família atual da peça e ligar as peças separadas (nova família ou a atual; repetir não muda nada). */
  window.tkFamiliaDe = (id) => familiaDe(id);
  window.tkFamiliaCarregar = () => carregar();
  window.tkFamiliaLigar = async function (ids, fam) {
    const corpo = { produtos: ids.map(String), juntar: true };
    const nome = fam && String(fam.nome || '').trim(); if (nome && fam.modo === 'nova') corpo.nome = nome.slice(0, 80);
    const r = await srv('/familias/ligar', corpo);
    if (r && r.ok && r.familia) usarFamilia(r.familia);
    return r;
  };
  window.tkFamiliaNovaVariacao = novaVariacao;
  window.tkFamiliaNovoTamanho = novaVariacao;   // nome antigo (7.44.0)
  /** Chamado no "Cadastrar": devolve o que o envio precisa guardar para ligar a peça nova (null = não é variação). Nunca bloqueia o cadastro. */
  window.tkFamiliaAoSalvar = function () {
    const nova = window.__familiaNova; if (!nova) return null;
    const nomeFinal = String($('nome').value || '').trim().slice(0, 80);
    return { origem: nova.origem, familia: nova.familia, base: nova.base, rotulo: separarNome(nomeFinal).rotulo, rotuloOrigem: separarNome(nova.nomeOrigem).rotulo, nomeFinal };
  };

  /* ---------- depois de cadastrar: liga a peça nova (com tentativas guardadas no aparelho) ---------- */
  const PEND = 'tk_fam_pendentes_v1';
  const lerPend = () => { try { const l = JSON.parse(localStorage.getItem(PEND) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } };
  const gravarPend = (l) => { try { localStorage.setItem(PEND, JSON.stringify(l.slice(-30))); } catch (e) {} };
  async function ligarNova(x) {
    const rotulos = {}; if (x.rotulo) rotulos[x.novo] = x.rotulo; if (x.rotuloOrigem) rotulos[x.origem] = x.rotuloOrigem;   // rótulos tirados do nome, nunca digitados
    const r = await srv('/familias/ligar', { produtos: [x.origem, x.novo], rotulos, nome: x.familia ? undefined : x.base, juntar: true });   // a variação nova entra na família da original
    if (r.ok) usarFamilia(r.familia);
    return r;
  }
  window.tkFamiliaDepoisDeSalvar = async function (it, novoId) {
    const fam = it && it.familia; if (!fam || !novoId) return;
    const x = { origem: fam.origem, novo: String(novoId), rotulo: fam.rotulo, rotuloOrigem: fam.rotuloOrigem, familia: fam.familia, base: fam.base };
    const r = await ligarNova(x);
    if (r.ok) { aviso('Variação cadastrada e ligada à família “' + ((r.familia && r.familia.nome) || x.base) + '”.'); return; }
    if (r.erro && /outra família|famílias diferentes/.test(r.erro)) { aviso('O produto foi cadastrado, mas não entrou na família: ' + r.erro); return; }
    gravarPend(lerPend().concat([x]));
    aviso('O produto foi cadastrado. Não consegui ligar à família agora; tento de novo sozinho na próxima vez que a Gestão abrir.');
  };
  async function tentarPendentes() {
    const l = lerPend(); if (!l.length) return;
    const resto = [];
    for (const x of l) { const r = await ligarNova(x); if (!r.ok && !/outra família|famílias diferentes/.test(r.erro || '')) resto.push(x); }
    gravarPend(resto); pintarForm();
  }

  /* ---------- janela (gaveta) reutilizada: ligar em lote e sugestões ---------- */
  function janela(titulo) {
    let ov = $('overlay-familias');
    if (!ov) {
      ov = el('div', 'overlay-sheet'); ov.id = 'overlay-familias';
      const sh = el('div', 'sheet fam-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'fam-titulo');
      const topo = el('div', 'sheet-topo'), t = el('h2', 'fam-h2'); t.id = 'fam-titulo';
      const x = botao('✕', 'sheet-x', fecharJanela); x.setAttribute('aria-label', 'Fechar');
      topo.append(t, x);
      const corpo = el('div', 'fam-corpo'); corpo.id = 'fam-corpo';
      const pe = el('div', 'fam-pe'); pe.id = 'fam-pe';
      sh.append(topo, corpo, pe); ov.append(sh); document.body.append(ov);
      ov.addEventListener('click', (e) => { if (e.target === ov) fecharJanela(); });
      ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharJanela(); } });   // v7.47.1: sem repassar ao a11y.js (fechava duas vezes e voltava duas páginas)
    }
    $('fam-titulo').textContent = titulo; $('fam-corpo').replaceChildren(); $('fam-pe').replaceChildren();
    janelaVolta = document.activeElement;
    if (typeof abrirComHistorico_ === 'function') abrirComHistorico_('overlay-familias'); else ov.classList.add('aberto');
    setTimeout(() => { const x = ov.querySelector('.sheet-x'); if (x) x.focus({ preventScroll: true }); }, 0);
    return { corpo: $('fam-corpo'), pe: $('fam-pe') };
  }
  let janelaVolta = null;
  function fecharJanela() {
    if (typeof fecharComHistorico_ === 'function') fecharComHistorico_('overlay-familias'); else { const ov = $('overlay-familias'); if (ov) ov.classList.remove('aberto'); }
    if (janelaVolta && janelaVolta.isConnected) try { janelaVolta.focus({ preventScroll: true }); } catch (e) {}
  }
  function foto(url) {
    if (!url) return el('span', 'fam-semfoto');
    const i = el('img'); i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; i.src = typeof fotoMini === 'function' ? fotoMini(url, 200) : url;
    i.onerror = () => i.replaceWith(el('span', 'fam-semfoto')); return i;
  }
  /** Linha de uma peça (só leitura): foto, nome e código. Ligar não pede nem muda nada na peça. */
  function linhaMembro(p) {
    const li = el('div', 'fam-membro'); li.dataset.produto = String(p.ID);
    const t = el('div', 'fam-mt'); t.append(el('b', '', p.Nome || 'Produto sem nome'));
    const info = [p.Codigo, separarNome(p.Nome).rotulo ? 'tamanho ' + separarNome(p.Nome).rotulo : '', estoqueInfo_(p)].filter(Boolean).join(' · ');
    if (info) t.append(el('small', 'fam-info', info));
    li.append(foto(p.Foto_URL), t); return li;
  }
  const estoqueInfo_ = (p) => (p.Estoque !== '' && p.Estoque != null ? p.Estoque + ' un.' : '');
  const rotulosAuto_ = (ps) => { const o = {}; ps.forEach((p) => { const r = separarNome(p.Nome).rotulo; if (r) o[String(p.ID)] = r; }); return o; };

  /** Seleção em lote: "Ligar como família". Só confirma as peças; o nome da família sai do nome delas.
   * v7.47.1: se alguma peça já tem família, nada é ligado até a pessoa resolver: tirar a peça desta seleção, tirar a peça
   * da família onde ela está, ou (quando é uma família só) juntar todas nela. */
  function ligarSelecionadas() {
    const ids = typeof selecionadosBulk !== 'undefined' ? Array.from(selecionadosBulk).map(String) : [];
    if (ids.length < 2) { aviso('Marque pelo menos dois produtos do mesmo produto para ligar como família.'); return; }
    const { corpo, pe } = janela('Ligar como família');
    desenharLigar(corpo, pe);
  }
  function desenharLigar(corpo, pe, msg) {
    corpo.replaceChildren(); pe.replaceChildren();
    const ids = typeof selecionadosBulk !== 'undefined' ? Array.from(selecionadosBulk).map(String) : [];
    const ps = ids.map(peca_).filter(Boolean);
    const st = el('p', 'fam-st'); st.setAttribute('role', 'status'); if (msg) st.textContent = msg;
    const redesenhar = (m) => { try { atualizarBarraBulk(); renderizarProdutos(); } catch (e) {} desenharLigar(corpo, pe, m); };
    if (ps.length < 2) {
      corpo.append(el('p', 'fam-sub', 'Sobrou menos de dois produtos marcados. Marque pelo menos dois produtos do mesmo produto para ligar como família.'));
      pe.append(st, botao('Fechar', 'fam-sec', fecharJanela)); return;
    }
    const famIds = [...new Set(ps.map((p) => familiaDe(p.ID)).filter(Boolean).map((f) => f.id))];
    const livres = ps.filter((p) => !familiaDe(p.ID));
    const famUnica = famIds.length === 1 ? familias.find((f) => f.id === famIds[0]) : null;
    corpo.append(el('p', 'fam-sub', 'Estes produtos são o mesmo produto (mudando estampa ou tamanho). Nada neles muda: cada um continua com as próprias fotos, estoque e link. No site eles aparecem juntos.'));
    const bases = [...new Set(ps.map((p) => semAcento(separarNome(p.Nome).base)))];
    if (bases.length > 1) corpo.append(el('p', 'fam-alerta', 'Atenção: os nomes desses produtos são diferentes. Confira se são mesmo o mesmo produto.'));
    if (famUnica && !livres.length) {
      corpo.append(el('p', 'fam-alerta', 'Todos esses produtos já estão juntos na família “' + famUnica.nome + '” (' + famUnica.membros.length + ' produtos). Não há nada para ligar.'));
      ps.forEach((p) => corpo.append(linhaMembro(p)));
      pe.append(st, botao('Fechar', 'fam-sec', fecharJanela)); return;
    }
    if (famIds.length) {
      const nj = ps.length - livres.length;
      corpo.append(el('p', 'fam-alerta', famUnica
        ? (nj === 1 ? '1 produto já está' : nj + ' produtos já estão') + ' na família “' + famUnica.nome + '” (' + famUnica.membros.length + ' produtos). Para continuar, escolha: juntar todos nessa família, ou tirar desta seleção / tirar da família os produtos que já têm família.'
        : 'Há produtos em famílias diferentes. Tire da seleção ou tire da família os produtos marcados até sobrar no máximo uma família.'));
    }
    ps.forEach((p) => {
      const li = linhaMembro(p), f = familiaDe(p.ID);
      if (f) {
        li.classList.add('tem-fam');
        li.querySelector('.fam-mt').append(el('span', 'fam-ja', 'Já está na família “' + f.nome + '” · ' + f.membros.length + ' produtos'));
        const res = el('div', 'fam-res');
        const sair = botao('Tirar desta seleção', '', () => { selecionadosBulk.delete(String(p.ID)); redesenhar((p.Codigo || p.Nome) + ' saiu desta seleção.'); });
        const tirar = botao('Tirar da família “' + f.nome + '”', '');
        tirar.addEventListener('click', async () => {
          if (!confirm('Tirar este produto da família “' + f.nome + '”? Ele continua no site; só sai da família.')) return;
          tirar.disabled = sair.disabled = true; st.className = 'fam-st'; st.textContent = 'Tirando da família…';
          const r = await srv('/familias/desligar', { produto: String(p.ID) });
          if (!r.ok) { tirar.disabled = sair.disabled = false; st.className = 'fam-st erro'; st.textContent = r.erro; return; }
          usarFamilia(r.familia, p.ID);
          redesenhar((p.Codigo || p.Nome) + ' saiu da família “' + f.nome + '”' + (r.dissolvida ? ' (a família foi desfeita, pois sobrou um produto só).' : '.'));
        });
        res.append(sair, tirar); li.append(res);
      }
      corpo.append(li);
    });
    const ligar = async (juntar) => {
      ok.disabled = true; st.className = 'fam-st'; st.textContent = 'Ligando…';
      const r = await srv('/familias/ligar', Object.assign({ produtos: ps.map((p) => String(p.ID)), rotulos: rotulosAuto_(ps) }, juntar ? { juntar: true } : {}));
      if (!r.ok) {
        ok.disabled = false; st.className = 'fam-st erro'; st.textContent = r.erro;
        if (r.precisaEscolher) carregar().then(() => desenharLigar(corpo, pe, r.erro));   // a lista de famílias deste aparelho estava velha
        return;
      }
      usarFamilia(r.familia);
      if (typeof selecionadosBulk !== 'undefined') selecionadosBulk.clear();
      try { atualizarBarraBulk(); renderizarProdutos(); } catch (e) {}
      fecharJanela(); aviso('Família “' + r.familia.nome + '” ' + (juntar ? 'agora tem ' : 'ligada com ') + r.familia.membros.length + ' produtos.');
    };
    let ok;
    if (!famIds.length) ok = botao('Ligar ' + ps.length + ' produtos como família', 'fam-prim', () => ligar(false));
    else if (famUnica) {
      const total = new Set(famUnica.membros.map((m) => String(m.produto)).concat(ps.map((p) => String(p.ID)))).size;
      ok = botao('Juntar todos na família “' + famUnica.nome + '” (' + total + ' produtos)', 'fam-prim', () => ligar(true));
    } else { ok = botao('Resolva os produtos com família para continuar', 'fam-prim'); ok.disabled = true; }
    pe.append(st, ok);
  }

  /** "Sugestões de famílias": nomes iguais tirando o tamanho, com fotos; "Ligar" ou "Ignorar". */
  async function abrirSugestoes() {
    const { corpo } = janela('Sugestões de famílias');
    corpo.append(el('p', 'fam-sub', 'Produtos com o mesmo nome (mudando só a estampa, o tamanho ou a idade). Ligue os que forem o mesmo produto: no site eles aparecem juntos. Nada nos produtos muda.'));
    const box = el('div', 'fam-sugs'); box.setAttribute('aria-live', 'polite'); box.append(el('p', 'fam-sub', 'Procurando…')); corpo.append(box);
    const r = await srv('/familias/sugestoes');
    box.replaceChildren();
    if (!r.ok) { box.append(el('p', 'fam-st erro', r.erro), botao('Tentar de novo', 'fam-sec', abrirSugestoes)); return; }
    const vazio = () => { if (!box.querySelector('.fam-sug')) box.replaceChildren(el('p', 'fam-vazio', 'Nenhuma sugestão agora: os nomes repetidos já estão ligados ou foram ignorados.')); };
    (r.sugestoes || []).forEach((g) => {
      const c = el('section', 'fam-sug'); c.dataset.chave = g.chave; c.setAttribute('aria-label', g.nome + ', ' + g.membros.length + ' produtos');
      const rots = g.membros.map((m) => m.rotulo).filter(Boolean);
      c.append(el('b', 'fam-tit', g.nome), el('p', 'fam-sub', g.membros.length + ' produtos' + (rots.length ? ': ' + rots.join(' · ') : '')));
      const fotos = el('div', 'fam-fotos'); g.membros.forEach((m) => { const f = el('figure', 'fam-fig'); f.append(foto(m.foto), el('figcaption', '', m.rotulo || m.codigo || '')); fotos.append(f); });
      const st = el('p', 'fam-st'); st.setAttribute('role', 'status');
      const acoes = el('div', 'fam-acoes');
      const lig = botao('Ligar', 'fam-prim', async () => {
        lig.disabled = ign.disabled = true; st.className = 'fam-st'; st.textContent = 'Ligando…';
        const rotulos = {}; g.membros.forEach((m) => { if (m.rotulo) rotulos[m.produto] = m.rotulo; });
        const x = await srv('/familias/ligar', { produtos: g.membros.map((m) => m.produto), nome: g.nome, rotulos });
        if (!x.ok) { lig.disabled = ign.disabled = false; st.className = 'fam-st erro'; st.textContent = x.erro; return; }
        usarFamilia(x.familia); c.remove(); aviso('Família “' + x.familia.nome + '” ligada.'); vazio();
      });
      const ign = botao('Ignorar', 'fam-sec', async () => {
        lig.disabled = ign.disabled = true;
        const x = await srv('/familias/ignorar', { chave: g.chave });
        if (!x.ok) { lig.disabled = ign.disabled = false; st.className = 'fam-st erro'; st.textContent = x.erro; return; }
        c.remove(); vazio();
      });
      acoes.append(lig, ign); c.append(fotos, acoes, st); box.append(c);
    });
    vazio();
  }

  /* ---------- botões da Gestão ---------- */
  function ligarBotoes() {
    const bulk = document.querySelector('#bulk-bar .bulk-bar-actions');
    if (bulk && !$('btn-bulk-familia')) { const b = botao('Ligar como família', '', ligarSelecionadas); b.id = 'btn-bulk-familia'; b.hidden = true; bulk.append(b); }
    const topo = document.querySelector('.lista-topo');
    if (topo && !$('btn-fam-sugestoes')) { const b = botao('Sugestões de famílias', 'btn-fam-sug', abrirSugestoes); b.id = 'btn-fam-sugestoes'; topo.append(b); }
  }
  window.tkFamiliaBarraLote = function (n) { const b = $('btn-bulk-familia'); if (b) b.hidden = !(n >= 2); };
  ligarBotoes();
  carregar().then(tentarPendentes);
})();
