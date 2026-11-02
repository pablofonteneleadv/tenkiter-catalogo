/* v7.44.0 — Família de produtos na Gestão.
 * A loja cadastra o mesmo modelo uma vez por tamanho/idade. Cada tamanho continua uma peça própria (fotos, estoque, link);
 * aqui só ligamos as peças: "+ Novo tamanho desta família" na edição, "Ligar como família" na seleção em lote,
 * "Sugestões de famílias" e "Tirar da família". A ligação fica no Worker (D1); a planilha e o Apps Script não mudam.
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
    if (!s && caminho !== '/familias') return { ok: false, erro: 'Entre na sua conta para organizar as famílias de peças.' };
    try {
      const h = { 'Content-Type': 'application/json' }; if (s) { h['X-TK-Whats'] = s.whatsapp; h['X-TK-Sessao'] = s.sessao; }
      const r = await fetch(INSTAGRAM_URL + caminho, { method: corpo ? 'POST' : 'GET', headers: h, body: corpo ? JSON.stringify(corpo) : undefined, cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!j) return { ok: false, erro: 'O servidor das famílias não respondeu direito. Tente de novo.' };
      if (!j.ok && !j.erro) j.erro = 'Não consegui agora. Tente de novo.';
      return j;
    } catch (e) { return { ok: false, erro: 'Sem conexão com o servidor das famílias. Verifique a internet e tente de novo.' }; }
  }
  let familias = [], carregou = false, carregando = null;
  const familiaDe = (id) => familias.find((f) => f.membros.some((m) => String(m.produto) === String(id))) || null;
  function carregar() {
    if (carregando) return carregando;
    carregando = srv('/familias').then((j) => { if (j && j.ok && Array.isArray(j.familias)) { familias = j.familias; carregou = true; } carregando = null; pintarForm(); return familias; });
    return carregando;
  }
  function usarFamilia(f, tirarProduto) {
    familias = familias.filter((x) => x.id !== (f && f.id) && !(tirarProduto && x.membros.some((m) => String(m.produto) === String(tirarProduto))));
    if (f) familias.push(f);
    try { localStorage.removeItem('tk_familias_v1'); } catch (e) {}   // a vitrine deste aparelho busca a lista nova
  }
  const aviso = (txt) => { const s = $('status'); if (s) s.textContent = txt; };

  /* ---------- formulário: família da peça aberta, "+ Novo tamanho" e "Tirar da família" ---------- */
  let pecaForm = null, tirarConfirma = false;
  window.__familiaNova = null;
  function caixaForm() {
    let box = $('fam-form');
    if (!box) { box = el('section', 'fam-form'); box.id = 'fam-form'; box.setAttribute('aria-label', 'Família de tamanhos'); box.hidden = true; const ref = $('audit-form'); if (ref) ref.after(box); }
    return box;
  }
  function pintarForm() {
    const box = caixaForm(); if (!box) return;
    box.replaceChildren(); tirarConfirma = false;
    const nova = window.__familiaNova;
    if (nova) {   // cadastrando um tamanho novo
      box.hidden = false; box.classList.add('nova');
      box.append(el('b', 'fam-tit', 'Novo tamanho da família “' + nova.base + '”'), el('p', 'fam-sub', 'Fotos, tamanhos, cores e quantidade ficam vazios: preencha com o que é deste tamanho. Ao cadastrar, a peça entra na família.'));
      return;
    }
    box.classList.remove('nova');
    const p = pecaForm && typeof modoFormulario !== 'undefined' && modoFormulario === 'editando' ? peca_(pecaForm) : null;
    if (!p) { box.hidden = true; return; }
    box.hidden = false;
    const f = familiaDe(p.ID);
    if (!carregou) box.append(el('p', 'fam-sub', 'Conferindo a família de tamanhos…'));
    else if (f) {
      box.append(el('b', 'fam-tit', 'Família: ' + (f.nome || 'tamanhos ligados')));
      const tams = el('div', 'fam-tams'); tams.setAttribute('role', 'list');
      f.membros.forEach((m) => { const q = peca_(m.produto); const t = el('span', 'fam-tam' + (String(m.produto) === String(p.ID) ? ' atual' : ''), m.rotulo || (q ? q.Nome : 'peça ' + m.produto)); t.setAttribute('role', 'listitem'); if (String(m.produto) === String(p.ID)) t.setAttribute('aria-current', 'true'); tams.append(t); });
      box.append(tams);
    } else box.append(el('p', 'fam-sub', 'Esta peça ainda não está ligada a outros tamanhos.'));
    const acoes = el('div', 'fam-acoes');
    acoes.append(botao('+ Novo tamanho desta família', 'fam-novo', () => novoTamanho(p.ID)));
    if (f) {
      const tirar = botao('Tirar da família', 'fam-tirar');
      tirar.addEventListener('click', async () => {
        if (!tirarConfirma) { tirarConfirma = true; tirar.textContent = 'Toque de novo para tirar'; st.textContent = 'A peça continua no site; só deixa de aparecer junto dos outros tamanhos.'; return; }
        tirar.disabled = true; st.className = 'fam-st'; st.textContent = 'Tirando da família…';
        const r = await srv('/familias/desligar', { produto: String(p.ID) });
        if (!r.ok) { tirar.disabled = false; st.className = 'fam-st erro'; st.textContent = r.erro; return; }
        usarFamilia(r.familia, p.ID); aviso(r.dissolvida ? 'Peça tirada da família. Como sobrou só um tamanho, a família foi desfeita.' : 'Peça tirada da família.');
        pintarForm();
      });
      acoes.append(tirar);
    }
    const st = el('p', 'fam-st'); st.setAttribute('role', 'status');
    box.append(acoes, st);
  }
  window.tkFamiliaForm = function (p) {
    pecaForm = p ? p.ID : null;
    if (!p) { window.__familiaNova = null; tirarCampoRotulo(); }
    pintarForm();
    if (p && !carregou) carregar();
  };

  function tirarCampoRotulo() { const c = $('fam-rotulo-box'); if (c) c.remove(); }
  function campoRotulo(nova) {
    tirarCampoRotulo();
    const nomeIn = $('nome'); if (!nomeIn) return;
    const box = el('div', 'fam-rotulo-box'); box.id = 'fam-rotulo-box';
    const l1 = el('label', 'fam-rot-l'); l1.htmlFor = 'fam-rotulo'; l1.append(document.createTextNode('Tamanho/idade desta peça '), el('i', 'obg', '*'));
    const i1 = el('input'); i1.type = 'text'; i1.id = 'fam-rotulo'; i1.maxLength = 20; i1.autocomplete = 'off'; i1.placeholder = 'Ex.: M, 4 anos, 38';
    const prev = el('p', 'fam-prev'); prev.id = 'fam-prev'; prev.setAttribute('aria-live', 'polite');
    box.append(l1, i1);
    if (!nova.familia) {   // a peça original ainda não tem família: confirma o tamanho dela também
      const l2 = el('label', 'fam-rot-l', 'Tamanho/idade da peça original (' + nova.nomeOrigem + ')'); l2.htmlFor = 'fam-rotulo-origem';
      const i2 = el('input'); i2.type = 'text'; i2.id = 'fam-rotulo-origem'; i2.maxLength = 20; i2.autocomplete = 'off'; i2.value = nova.rotuloOrigem || ''; i2.placeholder = 'Ex.: P';
      box.append(l2, i2);
    }
    box.append(prev);
    const atualizar = () => { const r = i1.value.trim(), b = nomeIn.value.trim(); prev.textContent = r ? 'Nome no site: ' + (b + ' ' + r).trim() : 'Escreva o tamanho ou a idade: ele completa o nome da peça.'; prev.className = 'fam-prev'; i1.removeAttribute('aria-invalid'); };
    i1.addEventListener('input', atualizar); nomeIn.addEventListener('input', atualizar); atualizar();
    const linha = nomeIn.closest('.cad-nome-linha') || nomeIn; linha.after(box);
  }
  /** "+ Novo tamanho desta família": cadastro já preenchido a partir da peça (fluxo de duplicar), sem fotos, tamanhos, cores e quantidade. */
  function novoTamanho(id) {
    const p = peca_(id); if (!p || typeof duplicarProduto !== 'function') return;
    const f = familiaDe(p.ID), sep = separarNome(p.Nome);
    const base = (f && f.nome) || sep.base || p.Nome;
    const origMembro = f ? f.membros.find((m) => String(m.produto) === String(p.ID)) : null;
    const alertaOrig = window.alert; window.alert = function () {};   // o duplicar avisa "selecione uma foto": aqui o aviso fica no próprio formulário
    try { duplicarProduto(p.ID); } finally { window.alert = alertaOrig; }
    ['tamanhos', 'cores', 'estoque'].forEach((k) => { const c = $(k); if (c) c.value = ''; });
    try { if (typeof cadLerVinculos_ === 'function') cadLerVinculos_(); if (typeof cadDesenharVinculos_ === 'function') cadDesenharVinculos_(); } catch (e) {}
    try { if (typeof zerarMidia === 'function') zerarMidia(null); } catch (e) {}
    const la = $('linha-arquivar-depois'); if (la) la.style.display = 'none';
    $('nome').value = base.slice(0, 80);
    window.__familiaNova = { origem: String(p.ID), familia: f ? f.id : '', base, nomeOrigem: p.Nome, rotuloOrigem: origMembro ? origMembro.rotulo : sep.rotulo };
    if (typeof tituloForm_ === 'function') tituloForm_('Novo tamanho: ' + base);
    const bs = $('btn-salvar'); if (bs) bs.textContent = 'Cadastrar este tamanho';
    const bc = $('btn-cancelar-duplicar'); if (bc) { bc.textContent = 'Cancelar novo tamanho'; bc.style.display = 'block'; }
    campoRotulo(window.__familiaNova); pintarForm();
    try { if (typeof atualizarFaltas_ === 'function') atualizarFaltas_(); } catch (e) {}
    const r = $('fam-rotulo'); if (r) r.focus({ preventScroll: false });
  }
  window.tkFamiliaNovoTamanho = novoTamanho;
  /** Chamado no "Cadastrar": confere o tamanho e devolve o que o envio precisa guardar (false = falta o tamanho; null = não é tamanho novo). */
  window.tkFamiliaAoSalvar = function () {
    const nova = window.__familiaNova; if (!nova) return null;
    const i = $('fam-rotulo'), rot = i ? i.value.trim() : '';
    if (!rot) { if (i) { i.setAttribute('aria-invalid', 'true'); i.focus(); } const pv = $('fam-prev'); if (pv) { pv.textContent = 'Escreva o tamanho ou a idade desta peça (ex.: M, 4 anos).'; pv.className = 'fam-prev erro'; } return false; }
    const io = $('fam-rotulo-origem');
    const nomeFinal = (String($('nome').value || '').trim() + ' ' + rot).trim().slice(0, 80);
    return { origem: nova.origem, familia: nova.familia, base: nova.base, rotulo: rot, rotuloOrigem: io ? io.value.trim() : (nova.rotuloOrigem || ''), nomeFinal };
  };

  /* ---------- depois de cadastrar: liga a peça nova (com tentativas guardadas no aparelho) ---------- */
  const PEND = 'tk_fam_pendentes_v1';
  const lerPend = () => { try { const l = JSON.parse(localStorage.getItem(PEND) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } };
  const gravarPend = (l) => { try { localStorage.setItem(PEND, JSON.stringify(l.slice(-30))); } catch (e) {} };
  async function ligarNova(x) {
    const rotulos = {}; rotulos[x.novo] = x.rotulo; if (x.rotuloOrigem) rotulos[x.origem] = x.rotuloOrigem;
    const r = await srv('/familias/ligar', { produtos: [x.origem, x.novo], rotulos, nome: x.familia ? undefined : x.base });
    if (r.ok) usarFamilia(r.familia);
    return r;
  }
  window.tkFamiliaDepoisDeSalvar = async function (it, novoId) {
    const fam = it && it.familia; if (!fam || !novoId) return;
    const x = { origem: fam.origem, novo: String(novoId), rotulo: fam.rotulo, rotuloOrigem: fam.rotuloOrigem, familia: fam.familia, base: fam.base };
    const r = await ligarNova(x);
    if (r.ok) { aviso('Tamanho ' + x.rotulo + ' cadastrado e ligado à família “' + ((r.familia && r.familia.nome) || x.base) + '”.'); return; }
    if (r.erro && /outra família|famílias diferentes/.test(r.erro)) { aviso('A peça foi cadastrada, mas não entrou na família: ' + r.erro); return; }
    gravarPend(lerPend().concat([x]));
    aviso('A peça foi cadastrada. Não consegui ligar à família agora; tento de novo sozinho na próxima vez que a Gestão abrir.');
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
      ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); fecharJanela(); } });
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
  /** Linha de uma peça com foto, nome e o campo do rótulo (tamanho/idade) para conferir. */
  function linhaMembro(id, nome, fotoUrl, rotulo) {
    const li = el('div', 'fam-membro'); li.dataset.produto = id;
    const t = el('div', 'fam-mt'); t.append(el('b', '', nome));
    const lab = el('label', 'fam-ml', 'Tamanho/idade'); const inp = el('input'); inp.type = 'text'; inp.maxLength = 20; inp.value = rotulo || ''; inp.className = 'fam-rot'; inp.setAttribute('aria-label', 'Tamanho ou idade de ' + nome);
    lab.append(inp); t.append(lab);
    li.append(foto(fotoUrl), t); return li;
  }
  const rotulosDe = (corpo) => { const o = {}; corpo.querySelectorAll('.fam-membro').forEach((li) => { o[li.dataset.produto] = li.querySelector('.fam-rot').value.trim(); }); return o; };

  /** Seleção em lote: "Ligar como família". */
  function ligarSelecionadas() {
    const ids = typeof selecionadosBulk !== 'undefined' ? Array.from(selecionadosBulk).map(String) : [];
    if (ids.length < 2) { aviso('Marque pelo menos duas peças (uma por tamanho) para ligar como família.'); return; }
    const ps = ids.map(peca_).filter(Boolean);
    const seps = ps.map((p) => separarNome(p.Nome));
    const bases = [...new Set(seps.map((s) => semAcento(s.base)))];
    const { corpo, pe } = janela('Ligar como família');
    const lNome = el('label', 'fam-campo', 'Nome da família'); const iNome = el('input'); iNome.type = 'text'; iNome.id = 'fam-nome'; iNome.maxLength = 80; iNome.value = seps[0] ? seps[0].base : ''; lNome.append(iNome);
    corpo.append(el('p', 'fam-sub', 'Cada peça continua com as próprias fotos, estoque e link. No site elas aparecem juntas, na ordem dos tamanhos. Confira o tamanho/idade de cada uma.'), lNome);
    if (bases.length > 1) corpo.append(el('p', 'fam-alerta', 'Atenção: os nomes dessas peças são diferentes. Confira se são mesmo o mesmo modelo.'));
    const jaOutra = ps.filter((p) => familiaDe(p.ID)); const fams = [...new Set(jaOutra.map((p) => familiaDe(p.ID).id))];
    if (fams.length > 1) corpo.append(el('p', 'fam-alerta', 'Algumas peças já estão em famílias diferentes. Tire da família antes de juntar.'));
    else if (fams.length === 1) corpo.append(el('p', 'fam-sub', 'Parte dessas peças já está na família “' + familiaDe(jaOutra[0].ID).nome + '”: as outras entram nela.'));
    ps.forEach((p, k) => corpo.append(linhaMembro(String(p.ID), p.Nome, p.Foto_URL, (familiaDe(p.ID) && (familiaDe(p.ID).membros.find((m) => String(m.produto) === String(p.ID)) || {}).rotulo) || seps[k].rotulo)));
    const st = el('p', 'fam-st'); st.setAttribute('role', 'status');
    const ok = botao('Ligar ' + ps.length + ' peças como família', 'fam-prim', async () => {
      const rot = rotulosDe(corpo), falta = Object.keys(rot).filter((k) => !rot[k]);
      if (falta.length) { st.className = 'fam-st erro'; st.textContent = falta.length === 1 ? 'Falta o tamanho/idade de 1 peça.' : 'Falta o tamanho/idade de ' + falta.length + ' peças.'; const i = corpo.querySelector('.fam-membro[data-produto="' + CSS.escape(falta[0]) + '"] .fam-rot'); if (i) i.focus(); return; }
      ok.disabled = true; st.className = 'fam-st'; st.textContent = 'Ligando…';
      const r = await srv('/familias/ligar', { produtos: ps.map((p) => String(p.ID)), nome: iNome.value.trim() || undefined, rotulos: rot });
      if (!r.ok) { ok.disabled = false; st.className = 'fam-st erro'; st.textContent = r.erro; return; }
      usarFamilia(r.familia);
      if (typeof selecionadosBulk !== 'undefined') selecionadosBulk.clear();
      try { atualizarBarraBulk(); renderizarProdutos(); } catch (e) {}
      fecharJanela(); aviso('Família “' + r.familia.nome + '” ligada: ' + r.familia.membros.map((m) => m.rotulo).filter(Boolean).join(' · ') + '.');
    });
    pe.append(st, ok);
  }

  /** "Sugestões de famílias": nomes iguais tirando o tamanho, com fotos; "Ligar" ou "Ignorar". */
  async function abrirSugestoes() {
    const { corpo } = janela('Sugestões de famílias');
    corpo.append(el('p', 'fam-sub', 'Peças com o mesmo nome, mudando só o tamanho ou a idade. Ligue as que forem o mesmo modelo: no site os tamanhos aparecem juntos.'));
    const box = el('div', 'fam-sugs'); box.setAttribute('aria-live', 'polite'); box.append(el('p', 'fam-sub', 'Procurando…')); corpo.append(box);
    const r = await srv('/familias/sugestoes');
    box.replaceChildren();
    if (!r.ok) { box.append(el('p', 'fam-st erro', r.erro), botao('Tentar de novo', 'fam-sec', abrirSugestoes)); return; }
    const vazio = () => { if (!box.querySelector('.fam-sug')) box.replaceChildren(el('p', 'fam-vazio', 'Nenhuma sugestão agora: os nomes repetidos já estão ligados ou foram ignorados.')); };
    (r.sugestoes || []).forEach((g) => {
      const c = el('section', 'fam-sug'); c.dataset.chave = g.chave; c.setAttribute('aria-label', g.nome + ', ' + g.membros.length + ' tamanhos');
      c.append(el('b', 'fam-tit', g.nome), el('p', 'fam-sub', g.membros.length + ' tamanhos: ' + g.membros.map((m) => m.rotulo).join(' · ')));
      const fotos = el('div', 'fam-fotos'); g.membros.forEach((m) => { const f = el('figure', 'fam-fig'); f.append(foto(m.foto), el('figcaption', '', m.rotulo)); fotos.append(f); });
      const st = el('p', 'fam-st'); st.setAttribute('role', 'status');
      const acoes = el('div', 'fam-acoes');
      const lig = botao('Ligar', 'fam-prim', async () => {
        lig.disabled = ign.disabled = true; st.className = 'fam-st'; st.textContent = 'Ligando…';
        const rotulos = {}; g.membros.forEach((m) => { rotulos[m.produto] = m.rotulo; });
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
    if (bulk && !$('btn-bulk-familia')) { const b = botao('Ligar como família', '', ligarSelecionadas); b.id = 'btn-bulk-familia'; b.hidden = true; const mais = $('btn-bulk-mais'); bulk.insertBefore(b, mais || null); }
    const topo = document.querySelector('.lista-topo');
    if (topo && !$('btn-fam-sugestoes')) { const b = botao('Sugestões de famílias', 'btn-fam-sug', abrirSugestoes); b.id = 'btn-fam-sugestoes'; topo.append(b); }
  }
  window.tkFamiliaBarraLote = function (n) { const b = $('btn-bulk-familia'); if (b) b.hidden = !(n >= 2); };
  ligarBotoes();
  carregar().then(tentarPendentes);
})();
