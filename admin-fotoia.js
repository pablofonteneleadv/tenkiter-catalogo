/* ====================================================================
 * TENKiTER — admin-fotoia.js (v1.9) — "FOTOS COM IA" (a IA gera a arte das pessoas com as roupas a partir das fotos reais das peças)
 *  v1.9 (18/10/2026, pedido do Pablo): a IA NÃO escreve mais texto nem desenha seta/emoji — "só faz a arte que interessa dos produtos e isso eu coloco na layout".
 *  Seta, chamadas e emojis entram depois, em Postagens (➕ Adicionar → Elementos), onde quem posta pode mover/aumentar/girar. O campo `seta` saiu do painel e do pedido.
 *  v1.8 (18/10/2026, pedido do Pablo): até 6 fotos de VÁRIAS peças + do aparelho; cada foto tem um PAPEL (👚 cima, 👖 baixo, 👗 look inteiro); cima e baixo fecham par (a IA não
 *  inventa peça: se faltar, o painel mostra o filtro da que falta); N looks = N pessoas diferentes na imagem; destino Status/Reels/capa de carrossel;
 *  quem veste (mulheres/crianças/homens/misto); com mais de 4 fotos o pedido é dividido (limite do Cloudflare grátis) ou vai inteiro ao Gemini.
 *  Pedido do Pablo (18/10/2026): "de graça, respeitando os limites do plano; sem crédito entra na fila e faz quando tiver cota", com a instrução
 *  EDITÁVEL pelo gestor para ir testando os resultados (a de partida é a SKILL dele: Reels/Carrossel 9:16, modelos alegres, zero texto).
 *  Fala com o Worker `tenkiter-ig` (INSTAGRAM_URL, common.js) em /fotoia/*: o Worker guarda a fila, tenta uma por minuto e, se a cota acabou, deixa
 *  o pedido esperando (nada se perde, nada é cobrado a mais). A chave do Gemini é a mesma da leitura de fotos (⚙️ no importador) e NUNCA vem para cá.
 *  Quem usa: gerir_acessos OU catalogo_cadastrar. Só o Admin total (gerir_acessos) muda a instrução, os modelos e o limite por dia.
 * Carrega depois de admin-postagens.js; usa getSessao, usuarioAdmin, temPermissao, produtos, abrirComHistorico_/fecharComHistorico_.
 * ==================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => escaparHtml(v);
  let extraTxt = '', aba = 'gerar', cfg = null, info = null, itens = [], cont = {}, filtro = 'todas', timer = null, busca = '', enviando = false, msgTxt = '', msgTipo = '';
  let sel = [], abertas = [], tipoFiltro = 'todas', giro = 0, destino = 'status', quem = 'mulheres', dividirModo = 'sim';          // sel = fotos escolhidas {url, peca, cod, papel}
  const MAX_FOTOS = 6, CF_MAX = 4;
  let quantidadeLooks = 0, looksPorImagem = 2, fotosPlanejadas = [], motor = 'auto', modelosFoto = 1, editandoFoto = -1, modelosManuais = false;
  const salvandoCatalogo = new Set();
  const limiteFotos = () => quantidadeLooks ? 40 : MAX_FOTOS;

  /* ---------- Worker ---------- */
  function sessao() { const s = typeof getSessao === 'function' ? getSessao() : null; return s && /^tk[123]\./.test(String(s.sessao)) ? s : null; }
  async function api(caminho, metodo, corpo) {
    const s = sessao();
    if (!s) return { ok: false, erro: 'Entre com o seu login (não vale só o PIN) para usar esta tela.' };
    try {
      const r = await fetch(INSTAGRAM_URL + caminho, { method: metodo || 'GET', headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
      return await r.json();
    } catch (e) { return { ok: false, erro: 'Sem conexão agora. Tente de novo.', semRede: true }; }
  }
  const erroTxt = (r) => (r && r.erro && !/Não encontrado/.test(r.erro) ? r.erro : 'O servidor de Fotos com IA ainda não foi atualizado (falta publicar o Worker na Cloudflare).');
  function perm(p) { try { return typeof temPermissao === 'function' && typeof usuarioAdmin !== 'undefined' && !!usuarioAdmin && !!temPermissao(usuarioAdmin, p); } catch (e) { return false; } }
  const podeUsar = () => perm('gerir_acessos') || perm('catalogo_cadastrar');
  const ehGestor = () => perm('gerir_acessos');

  /* ---------- estilo ---------- */
  function css() {
    if ($('fia-css')) return;
    const s = document.createElement('style'); s.id = 'fia-css';
    s.textContent = `
      .sheet-fia { max-width: 760px; height: 94vh; max-height: 94vh; }
      .fia-abas { display: flex; gap: 6px; overflow-x: auto; margin: 0 0 8px; padding-bottom: 4px; }
      .fia-abas button { flex: none; width: auto; padding: 9px 13px; border-radius: 999px; border: 1px solid #ddd; background: #fff; color: #222; font-size: 0.84rem; font-weight: 700; cursor: pointer; min-height: 44px; }
      .fia-abas button[aria-selected="true"], .fia-abas button[aria-pressed="true"] { background: var(--laranja); border-color: var(--laranja); color: #0d0d0d; }
      .fia-aviso { background: #fff3e0; border: 1px solid #ffcc80; color: #6b3f00; border-radius: 10px; padding: 9px 11px; font-size: 0.85rem; margin: 8px 0; line-height: 1.4; }
      .fia-ok { background: #e8f5e9; border: 1px solid #a5d6a7; color: #1b5e20; border-radius: 10px; padding: 9px 11px; font-size: 0.85rem; margin: 8px 0; }
      .fia-erro { background: #ffebee; border: 1px solid #ef9a9a; color: #8e0000; border-radius: 10px; padding: 9px 11px; font-size: 0.85rem; margin: 8px 0; }
      .fia-st { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; font-size: 0.8rem; color: #444; }
      .fia-st span { background: #f1f1f1; border-radius: 999px; padding: 5px 10px; }
      .fia-pecas { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; max-height: 34vh; overflow-y: auto; margin: 8px 0; }
      .fia-peca { display: block; width: 100%; text-align: left; padding: 0; border: 2px solid #e4e4e4; border-radius: 10px; background: #fff; cursor: pointer; overflow: hidden; color: #111; }
      .fia-peca[aria-pressed="true"] { border-color: var(--laranja); box-shadow: 0 0 0 2px var(--laranja); }
      .fia-peca img { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; display: block; background: #eee; }
      .fia-peca b { display: block; font-size: 0.74rem; padding: 4px 6px 6px; line-height: 1.2; }
      .fia-fotos { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
      .fia-foto { position: relative; width: 92px; }
      .fia-foto img { width: 92px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 8px; border: 3px solid #ddd; display: block; background: #eee; }
      .fia-foto[aria-pressed="true"] img { border-color: var(--laranja); }
      .fia-foto button { position: absolute; inset: 0; width: 100%; height: 100%; background: transparent; border: 0; cursor: pointer; padding: 0; }
      .fia-foto i { position: absolute; top: 4px; left: 4px; background: var(--laranja); color: #0d0d0d; font-style: normal; font-weight: 800; font-size: 0.78rem; border-radius: 999px; min-width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; }
      .fia-btn { width: auto; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 14px; min-height: 44px; border-radius: 10px; border: 1px solid #ccc; background: #fff; color: #111; font-weight: 700; font-size: 0.88rem; cursor: pointer; }
      .fia-btn.pri { background: var(--laranja); border-color: var(--laranja); color: #0d0d0d; }
      .fia-btn.perigo { color: #8e0000; border-color: #e0a0a0; }
      .fia-btn:disabled { opacity: .55; cursor: default; }
      .fia-linha { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; align-items: center; }
      .fia-cartao { border: 1px solid #e2e2e2; border-radius: 12px; padding: 10px; margin: 10px 0; background: #fff; }
      .fia-cartao h3 { margin: 0 0 4px; font-size: 0.95rem; }
      .fia-cartao small { color: #555; display: block; line-height: 1.35; }
      .fia-resu { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0; }
      .fia-resu img { width: 100%; max-width: 250px; aspect-ratio: 9 / 16; object-fit: cover; border-radius: 10px; border: 1px solid #ddd; background: #eee; cursor: zoom-in; display: block; }
      .fia-fontes { display: flex; gap: 4px; } .fia-fontes img { width: 44px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 6px; }
      .fia-chip { display: inline-block; border-radius: 999px; padding: 3px 9px; font-size: 0.74rem; font-weight: 800; }
      .fia-chip.fila { background: #fff3e0; color: #7a4a00; } .fia-chip.gerando { background: #e3f2fd; color: #0b4f8a; } .fia-chip.pronta { background: #e8f5e9; color: #1b5e20; }
      .fia-chip.aprovada { background: #1b5e20; color: #fff; } .fia-chip.erro { background: #ffebee; color: #8e0000; } .fia-chip.descartada, .fia-chip.cancelada { background: #eee; color: #555; }
      .fia-corpo label { display: block; font-weight: 700; font-size: 0.86rem; margin: 10px 0 4px; }
      .fia-corpo textarea, .fia-corpo input[type=text], .fia-corpo input[type=number], .fia-corpo select { width: 100%; box-sizing: border-box; border: 1px solid #ccc; border-radius: 10px; padding: 10px; font: inherit; font-size: 0.92rem; background: #fff; color: #111; }
      .fia-corpo textarea { min-height: 220px; line-height: 1.4; }
      .fia-corpo textarea:disabled, .fia-corpo input:disabled, .fia-corpo select:disabled { background: #f3f3f3; color: #444; }
      .fia-dica { font-size: 0.8rem; color: #555; margin: 2px 0 0; line-height: 1.35; }
      .fia-filtros { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
      .fia-filtros button { width: auto; min-height: 44px; padding: 8px 12px; border-radius: 999px; border: 1px solid #ccc; background: #fff; color: #111; font-size: 0.84rem; font-weight: 700; cursor: pointer; }
      .fia-filtros button small { font-weight: 500; color: #555; }
      .fia-filtros button[aria-pressed="true"] { background: var(--laranja); border-color: var(--laranja); color: #0d0d0d; }
      .fia-filtros button[aria-pressed="true"] small { color: #0d0d0d; }
      .fia-grupo { border: 1px dashed #ccc; border-radius: 10px; padding: 6px 8px; margin: 6px 0; }
      .fia-grupo h4 { margin: 0 0 2px; font-size: 0.84rem; }
      .fia-sel { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; }
      .fia-selitem { display: flex; gap: 10px; align-items: flex-start; border: 1px solid #e2e2e2; border-radius: 10px; padding: 6px; background: #fff; }
      .fia-selitem img { width: 64px; flex: none; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 6px; cursor: zoom-in; background: #eee; }
      .fia-selinfo { flex: 1; min-width: 0; } .fia-selinfo .nome { font-size: 0.82rem; line-height: 1.25; margin-bottom: 4px; }
      .fia-papeis { display: flex; flex-wrap: wrap; gap: 4px; }
      .fia-papeis button { width: auto; min-height: 44px; padding: 6px 10px; border-radius: 999px; border: 1px solid #ccc; background: #fff; color: #111; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
      .fia-papeis button[aria-pressed="true"] { background: var(--laranja); border-color: var(--laranja); color: #0d0d0d; }
      .fia-papeis .fia-x { color: #8e0000; border-color: #e0a0a0; margin-left: auto; min-width: 44px; }
      .fia-looks { background: #f7f7f7; border-radius: 10px; padding: 8px 10px; margin: 8px 0; font-size: 0.85rem; line-height: 1.45; }
      .fia-corpo .fia-chk { display: flex; gap: 8px; align-items: flex-start; font-weight: 600; }
      .fia-corpo .fia-chk input { width: 22px; height: 22px; flex: none; margin-top: 1px; }
    `;
    document.head.appendChild(s);
  }

  /* ---------- janela ---------- */
  function cssCatalogo_() {
    if ($('fia-estilo-catalogo')) return;
    const st = document.createElement('style'); st.id = 'fia-estilo-catalogo'; st.textContent = '.fia-automatico summary{min-height:44px;cursor:pointer;padding:12px 0;font-size:.9rem}.fia-planejamento{margin-bottom:16px;border-bottom:1px solid #deddd6}.fia-planejamento h3{margin:8px 0}.fia-foto-plano{padding:8px 0;border-bottom:1px solid #eee}.fia-catalogo{margin:16px 0;border-top:1px solid #deddd6;padding-top:12px}.fia-catalogo summary{min-height:44px;cursor:pointer;font-weight:700;display:list-item}.fia-catalogo input[type=checkbox]{width:20px;height:20px;min-height:20px;flex:none;margin:0 8px 0 0}.fia-catalogo label{display:flex;align-items:center;min-height:44px;flex-wrap:wrap;gap:4px}.fia-catalogo label:has([data-fia-nome]){display:block}.fia-catalogo .fia-grupo{border:0;border-bottom:1px solid #deddd6;border-radius:0;padding:4px 0;margin:4px 0}.fia-catalogo input[data-fia-nome]{width:100%;min-height:44px}.fia-catalogo button{white-space:normal;max-width:100%}.fia-catalogo [role=status]{font-size:.92rem;overflow-wrap:anywhere}'; document.head.appendChild(st);
  }
  function montar() {
    cssCatalogo_();
    if ($('overlay-fotoia')) return;
    css();
    const o = document.createElement('div'); o.className = 'overlay-sheet'; o.id = 'overlay-fotoia';
    o.innerHTML = '<div class="sheet sheet-fia" role="dialog" aria-modal="true" aria-labelledby="fia-titulo"><div class="sheet-topo"><h2 class="gestao-titulo" id="fia-titulo">🎨 Fotos com IA</h2><button type="button" class="sheet-x" id="fia-fechar" aria-label="Fechar">✕</button></div><div class="gestao-corpo fia-corpo" id="fia-corpo" aria-live="polite"></div></div>';
    document.body.appendChild(o);
    $('fia-fechar').addEventListener('click', fechar);
    $('fia-corpo').addEventListener('click', clique);
    $('fia-corpo').addEventListener('input', entrada);
    $('fia-corpo').addEventListener('change', mudou);
  }
  function fechar() { parar(); fecharComHistorico_('overlay-fotoia'); }
  async function abrir() {
    if (!podeUsar()) { alert('Esta tela é para quem cadastra peças.'); return; }
    montar(); abrirComHistorico_('overlay-fotoia');
    $('fia-corpo').innerHTML = '<p class="fia-aviso">Carregando…</p>';
    await carregarConfig(); if (!info) return;
    await carregarLista(); desenhar(); religar();
  }
  document.addEventListener('tk:camada-fechada', (e) => { if (e && e.detail && e.detail.chave === 'overlay-fotoia') parar(); });
  function parar() { if (timer) { clearInterval(timer); timer = null; } }
  function religar() {
    parar();
    timer = setInterval(async () => {
      const o = $('overlay-fotoia'); if (!o || !o.classList.contains('aberto')) { parar(); return; }
      if (aba !== 'fila') return;
      if (!itens.some((x) => x.status === 'fila' || x.status === 'gerando')) return;
      await carregarLista(); if (aba === 'fila') desenharFila(true);
    }, (window.TK_FOTOIA_POLL_MS || 6000));
  }
  async function carregarConfig() {
    const r = await api('/fotoia/config');
    if (!r || !r.ok) { $('fia-corpo').innerHTML = '<p class="fia-erro">' + esc(erroTxt(r)) + '</p>'; info = null; return; }
    info = r; cfg = JSON.parse(JSON.stringify(r.config)); cont = r.contagens || cont;
  }
  async function carregarLista() {
    const r = await api('/fotoia/lista?status=todas');
    if (r && r.ok) { itens = r.itens || []; cont = r.contagens || cont; }
  }

  /* ---------- desenho ---------- */
  function nFila() { return (cont.fila || 0) + (cont.gerando || 0); }
  function desenhar() {
    const c = $('fia-corpo'); if (!c) return;
    const abas = [['gerar', '✨ Gerar'], ['fila', '📋 Fila e resultados' + (nFila() ? ' (' + nFila() + ')' : '')], ['instrucao', '⚙️ Instrução']];
    c.innerHTML = '<div class="fia-abas" role="tablist">' + abas.map((a) => '<button type="button" role="tab" data-a="aba" data-v="' + a[0] + '" aria-selected="' + (aba === a[0]) + '">' + a[1] + '</button>').join('') + '</div><div id="fia-aba"></div>';
    if (aba === 'gerar') desenharGerar(); else if (aba === 'fila') desenharFila(); else desenharInstrucao();
  }
  function statusHtml() {
    const u = info.hoje || {}, semCota = Object.keys(info.semCota || {}), cf = info.cloudflare || {}, provs = (info.config && info.config.provedores) || ['gemini', 'cloudflare'];
    const usaGem = provs.indexOf('gemini') !== -1, usaCf = provs.indexOf('cloudflare') !== -1;
    const algumMotor = (usaGem && info.temChave) || (usaCf && cf.disponivel);
    return '<div class="fia-st">' + (usaGem ? '<span>' + (info.temChave ? '🔑 Gemini: chave ✓ (…' + esc(info.fimChave) + ')' : '🔑 Gemini: falta a chave') + '</span>' : '') +
      (usaCf ? '<span>' + (cf.disponivel ? (cf.semGratisAte ? '☁️ Cloudflare: grátis de hoje acabou' : '☁️ Cloudflare: ligado (grátis por dia)') : '☁️ Cloudflare: ainda não ligado') + '</span>' : '') +
      '<span>🖼️ Hoje: ' + (u.usadas || 0) + ' de ' + (u.limite || 0) + '</span>' +
      (nFila() ? '<span>⏳ Na fila: ' + nFila() + '</span>' : '') + (semCota.length && usaGem ? '<span>⚠️ Gemini sem cota agora: ' + semCota.length + ' modelo(s)</span>' : '') + (info.config && info.config.ligado === false ? '<span>⏸️ IA desligada</span>' : '') + '</div>' +
      (algumMotor ? '' : '<p class="fia-erro">Nenhum motor de imagem está pronto. Ligue o <b>Cloudflare</b> (aba ⚙️, grátis por dia) ou cole a chave do Gemini em <b>Produtos para aceitar ▸ ⚙️ Instagram ▸ IA</b>.</p>');
  }
  function pecasFiltradas() {
    let l = []; try { l = typeof produtos !== 'undefined' && Array.isArray(produtos) ? produtos : []; } catch (e) { l = []; }
    l = l.filter((p) => !(typeof ehInativo_ === 'function' && ehInativo_(p)));
    const q = semAc(busca).trim(); if (q) l = l.filter((p) => semAc((p.Nome || '') + ' ' + (p.Codigo || '') + ' ' + (p.Categoria || '')).indexOf(q) !== -1);
    if (tipoFiltro !== 'todas') l = l.filter((p) => tipoPeca(p) === tipoFiltro);
    return l.slice(0, 40);
  }
  const semAc = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function fotosDaPeca(p) {
    return [String(p.Foto_URL || '').trim()].concat(String(p.Fotos_Galeria || '').split(',').map((x) => x.trim())).filter((u, i, a) => /^https:\/\//i.test(u) && !/\.(mp4|webm|mov)(\?|$)/i.test(u) && a.indexOf(u) === i).slice(0, 10);
  }
  /* ---------- tipo da peça (só para sugerir o papel e o filtro; quem manda é o toque da pessoa) ---------- */
  function tipoPeca(p) {
    const t = ' ' + semAc((p.Categoria || '') + ' ' + (p.Nome || '')) + ' ';
    if (/[^a-z](vestidos?|macacao|macacoes|macaquinhos?|conjuntos?|fantasias?|kimonos?|biquinis?|maios?|pijamas?|saidas? de praia)[^a-z]/.test(t)) return 'look';
    if (/[^a-z](calcas?|shorts?|saias?|bermudas?|leggings?|jeans|cargos?|pantalonas?|joggers?|calcoes?|shortinhos?)[^a-z]/.test(t)) return 'baixo';
    if (/[^a-z](blusas?|camisetas?|camisas?|croppeds?|tops?|regatas?|bodys?|bodies|jaquetas?|casacos?|coletes?|moletons?|cardigans?|tricots?|batas?|t-shirts?|tshirts?)[^a-z]/.test(t)) return 'cima';
    return '';
  }
  const PAPEL_ROT = { cima: '👚 Cima', baixo: '👖 Baixo', look: '👗 Look inteiro' };
  const PAPEL_DICA = { cima: 'só a peça de cima desta foto', baixo: 'só a peça de baixo desta foto', look: 'a roupa toda desta foto (vestido, macacão, fantasia, conjunto…)' };
  const DESTINOS = [['status', '📱 Status do WhatsApp', '9:16'], ['reels', '🎬 Reels', '9:16 · evita topo e rodapé'], ['carrossel', '🖼️ Capa de carrossel', '4:5']];
  const QUEM = [['mulheres', 'Mulheres adultas (idades e corpos variados)'], ['criancas', 'Crianças'], ['homens', 'Homens'], ['misto', 'Mulheres e homens']];
  /** Looks = fotos "look inteiro" + pares (cima + baixo). Cima e baixo têm que fechar par: a IA não inventa peça. */
  function montarLooks() {
    const cima = [], baixo = [], looks = [];
    sel.forEach((x, i) => { if (x.papel === 'cima') cima.push(i); else if (x.papel === 'baixo') baixo.push(i); });
    if (cima.length !== baixo.length) return { looks: [], erro: { faltam: cima.length > baixo.length ? 'baixo' : 'cima', n: Math.abs(cima.length - baixo.length), nCima: cima.length, nBaixo: baixo.length } };
    let ib = 0;
    sel.forEach((x, i) => { if (x.papel === 'look') looks.push([i]); else if (x.papel === 'cima') { looks.push([i, baixo[(ib + giro) % baixo.length]]); ib++; } });
    return { looks: looks, erro: null, pares: baixo.length };
  }
  /** Parte os looks em pedidos de até 4 fotos (o limite do Cloudflare grátis); cada look fica inteiro. */
  function dividirLooks(looks) {
    const grupos = []; let atual = [], n = 0;
    looks.forEach((l) => { if ((n + l.length > CF_MAX || (quantidadeLooks && atual.length >= looksPorImagem)) && atual.length) { grupos.push(atual); atual = []; n = 0; } atual.push(l); n += l.length; });
    if (atual.length) grupos.push(atual);
    return grupos;
  }
  const nomeLook = (l) => l.map((i) => (sel[i].peca || 'Foto do aparelho') + (sel[i].papel === 'cima' ? ' (de cima)' : sel[i].papel === 'baixo' ? ' (de baixo)' : '')).join(' + ');
  function gruposDoPlano(looks) {
    return dividirModo === 'sim' && (sel.length > CF_MAX || quantidadeLooks) ? dividirLooks(looks) : [looks];
  }
  function trocarFotos(i, j) {
    if (enviando || !sel[i] || !sel[j] || i === j) return;
    if (sel[i].papel !== sel[j].papel) { msg('Troque peças do mesmo papel: cima com cima, baixo com baixo ou look inteiro com look inteiro.', 'erro'); desenharGerar(); return; }
    const x = sel[i]; sel[i] = sel[j]; sel[j] = x; giro = 0; msg('Combinação atualizada. Confira os looks antes de gerar.', 'ok'); desenharGerar();
  }
  function ligarArrasto() {
    document.querySelectorAll('#fia-aba .fia-arrastar').forEach(btn => {
      btn.addEventListener('pointerdown', e => {
        if (enviando || e.button !== 0) return;
        e.preventDefault(); const i = Number(btn.dataset.i), x = e.clientX, y = e.clientY;
        btn.setPointerCapture(e.pointerId); btn.setAttribute('aria-pressed', 'true');
        const fim = ev => {
          btn.removeEventListener('pointerup', fim); btn.removeEventListener('pointercancel', cancelar);
          btn.setAttribute('aria-pressed', 'false');
          if (Math.hypot(ev.clientX - x, ev.clientY - y) < 10) return;
          const destino = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.fia-selitem');
          if (destino) trocarFotos(i, Number(destino.dataset.i));
        };
        const cancelar = () => { btn.removeEventListener('pointerup', fim); btn.removeEventListener('pointercancel', cancelar); btn.setAttribute('aria-pressed', 'false'); };
        btn.addEventListener('pointerup', fim); btn.addEventListener('pointercancel', cancelar);
      });
      btn.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault(); const i = Number(btn.dataset.i), delta = e.key === 'ArrowUp' ? -1 : 1;
        for (let j = i + delta; j >= 0 && j < sel.length; j += delta) if (sel[j].papel === sel[i].papel) { trocarFotos(i, j); document.querySelector('.fia-arrastar[data-i="' + j + '"]')?.focus(); break; }
      });
    });
  }
  function desenharGerar() {
    const a = $('fia-aba'); if (!a) return;
    const yC = $('fia-corpo').scrollTop, g0 = a.querySelector('.fia-pecas'), yG = g0 ? g0.scrollTop : 0;
    const pecas = pecasFiltradas(), ml = montarLooks(), nSel = sel.length, selDe = (u, pid) => sel.findIndex((x) => x.url === u && String(x.pid || '') === String(pid || ''));
    if (!modelosManuais) modelosFoto = ml.looks.length || 1;
    const abertasP = abertas.map((id) => (typeof produtos !== 'undefined' ? produtos : []).find((x) => String(x.ID) === String(id))).filter(Boolean);
    const provs = (info.config && info.config.provedores) || [], temGem = info.temChave && provs.indexOf('gemini') !== -1, temCf = !!(info.cloudflare && info.cloudflare.disponivel && provs.indexOf('cloudflare') !== -1);
    const pedidos = quantidadeLooks && !ml.erro ? gruposDoPlano(ml.looks).length : 1;
    const filtros = [['todas', 'Todas'], ['cima', '👚 De cima'], ['baixo', '👖 De baixo'], ['look', '👗 Looks e peças únicas']];
    a.innerHTML = statusHtml() + (msgTxt ? '<p role="status" class="' + (msgTipo === 'erro' ? 'fia-erro' : 'fia-ok') + '">' + esc(msgTxt) + '</p>' : '') + planoFotosHtml_() +
      '<details class="fia-automatico"' + (quantidadeLooks ? ' open' : '') + '><summary>Distribuir um total de looks automaticamente</summary><label for="fia-quantidade">Divisão automática: total de looks (opcional)</label><input id="fia-quantidade" type="number" min="1" max="20" step="1" value="' + (quantidadeLooks || '') + '" placeholder="Ex.: 10"><p class="fia-dica">Para definir os modelos de cada foto, deixe este campo vazio e use Adicionar esta foto ao lote. Preencha apenas se quiser distribuir automaticamente um total de looks.</p>' +
      (quantidadeLooks ? '<label for="fia-looks-imagem">Divisão automática sugerida (opcional)</label><select id="fia-looks-imagem"><option value="2"' + (looksPorImagem === 2 ? ' selected' : '') + '>Até 2 looks por imagem</option><option value="3"' + (looksPorImagem === 3 ? ' selected' : '') + '>Até 3 looks por imagem</option></select><p class="fia-dica">Até 4 fotos de referência por imagem no motor grátis. Três looks só cabem quando suas referências cabem nesse limite. Confira a qualidade: mais pessoas podem reduzir a fidelidade.</p>' : '') +
      '</details>' +
      '<div class="fia-aviso">Escolha até <b>' + limiteFotos() + ' fotos</b> (de várias peças e do aparelho) e diga o que a IA vai usar de cada uma. A imagem sai com <b>uma pessoa diferente para cada look</b> (modelos diversos, não as das fotos). Se a cota acabar, o pedido <b>espera na fila</b> e sai sozinho — não precisa ficar na tela.</div>' +
      '<label for="fia-busca">1. Escolha as peças (toque para ver as fotos)</label><input type="text" id="fia-busca" placeholder="Nome ou código…" value="' + esc(busca) + '" autocomplete="off">' +
      '<div class="fia-filtros" role="group" aria-label="Tipo de peça">' + filtros.map((f) => '<button type="button" data-a="tipo" data-v="' + f[0] + '" aria-pressed="' + (tipoFiltro === f[0]) + '">' + f[1] + '</button>').join('') + '</div>' +
      (tipoFiltro === 'baixo' || tipoFiltro === 'cima' ? '<p class="fia-dica">Mostrando só ' + (tipoFiltro === 'baixo' ? 'peças de baixo (calça, short, saia…)' : 'peças de cima (blusa, cropped, camiseta…)') + '. Peça que não foi reconhecida só aparece em “Todas”.</p>' : '') +
      '<div class="fia-pecas">' + (pecas.length ? pecas.map((p) => '<button type="button" class="fia-peca" data-a="peca" data-id="' + esc(p.ID) + '" aria-pressed="' + (abertas.indexOf(String(p.ID)) !== -1) + '"><img loading="lazy" decoding="async" alt="" ' + atribSrc(fotoMini(String(p.Foto_URL || ''), 220)) + '><b>' + esc((p.Codigo ? p.Codigo + ' · ' : '') + (p.Nome || 'Peça')) + '</b></button>').join('') : '<p class="fia-dica">Nenhuma peça encontrada neste filtro.</p>') + '</div>' +
      abertasP.map((p) => '<div class="fia-grupo"><h4>' + esc((p.Codigo ? p.Codigo + ' · ' : '') + (p.Nome || 'Peça')) + '</h4><div class="fia-fotos">' + fotosDaPeca(p).map((u) => '<div class="fia-foto" aria-pressed="' + (selDe(u, p.ID) >= 0) + '"><img loading="lazy" decoding="async" alt="" ' + atribSrc(fotoMini(u, 200)) + '>' + (selDe(u, p.ID) >= 0 ? '<i>' + (selDe(u, p.ID) + 1) + '</i>' : '') + '<button type="button" data-a="foto" data-u="' + esc(u) + '" data-p="' + esc(p.ID) + '" aria-label="' + (selDe(u, p.ID) >= 0 ? 'Tirar esta foto' : 'Usar esta foto') + '"></button></div>').join('') + '</div></div>').join('') +
      '<div class="fia-linha"><label class="fia-btn" for="fia-arq" style="margin:0">📎 Foto do aparelho</label><input type="file" id="fia-arq" accept="image/jpeg,image/png,image/webp" multiple hidden><span class="fia-dica">' + nSel + ' de ' + limiteFotos() + ' fotos marcadas</span></div>' +
      '<label>2. O que a IA deve usar de cada foto?</label>' +
      (nSel ? '<div class="fia-sel">' + sel.map((x, i) => '<div class="fia-selitem" data-i="' + i + '"><img alt="Foto ' + (i + 1) + '" data-a="ampliar" data-u="' + esc(x.url) + '" ' + atribSrc(/^data:/.test(x.url) ? x.url : fotoMini(x.url, 200)) + '><div class="fia-selinfo"><button type="button" class="fia-arrastar" data-i="' + i + '" style="touch-action:none;min-height:44px" title="Arraste sobre outra peça do mesmo papel, ou use as setas do teclado">↕ Trocar de look</button><div class="nome"><b>' + (i + 1) + '.</b> ' + esc(x.peca || 'Foto do aparelho') + '</div><div class="fia-papeis" role="group" aria-label="Papel da foto ' + (i + 1) + '">' + ['cima', 'baixo', 'look'].map((r) => '<button type="button" data-a="papel" data-i="' + i + '" data-v="' + r + '" aria-pressed="' + (x.papel === r) + '" title="' + esc(PAPEL_DICA[r]) + '">' + PAPEL_ROT[r] + '</button>').join('') + '<button type="button" class="fia-x" data-a="tirar" data-i="' + i + '" aria-label="Tirar a foto ' + (i + 1) + '">✕</button></div></div></div>').join('') + '</div>'
        : '<p class="fia-dica">Nenhuma foto marcada ainda. Toque numa peça acima e depois nas fotos que quer usar, ou envie fotos do aparelho.</p>') +
      (nSel ? (ml.erro ? '<div class="fia-erro">Faltam <b>' + ml.erro.n + '</b> peça' + (ml.erro.n > 1 ? 's' : '') + ' de ' + ml.erro.faltam + ' (você marcou ' + ml.erro.nCima + ' de cima e ' + ml.erro.nBaixo + ' de baixo). A IA <b>não inventa peças</b>: escolha ' + (ml.erro.n > 1 ? 'as que faltam' : 'a que falta') + ' ou mude o papel de alguma foto.<div class="fia-linha"><button type="button" class="fia-btn pri" data-a="tipo" data-v="' + ml.erro.faltam + '">' + (ml.erro.faltam === 'baixo' ? '👖 Mostrar peças de baixo' : '👚 Mostrar peças de cima') + '</button></div></div>'
        : '<div class="fia-looks"><b>' + ml.looks.length + (ml.looks.length === 1 ? ' pessoa' : ' pessoas') + ' na imagem (uma por look):</b><ol style="margin:4px 0 0 18px;padding:0">' + ml.looks.map((l) => '<li>' + esc(nomeLook(l)) + '</li>').join('') + '</ol>' +
          (ml.pares >= 2 ? '<div class="fia-linha"><button type="button" class="fia-btn" data-a="trocar">🔀 Trocar a combinação de cima e de baixo</button></div>' : '') + '</div>') : '') +
      (quantidadeLooks && !ml.erro ? '<p class="fia-dica">Plano: ' + ml.looks.length + ' de ' + quantidadeLooks + ' looks escolhidos. Divisão atual: ' + gruposDoPlano(ml.looks).map(g => g.length + (g.length === 1 ? ' look' : ' looks')).join(' + ') + '.</p>' : '') +
      '<label>3. Para onde vai a imagem?</label><div class="fia-filtros" role="group" aria-label="Destino">' + DESTINOS.map((d) => '<button type="button" data-a="destino" data-v="' + d[0] + '" aria-pressed="' + (destino === d[0]) + '">' + d[1] + ' <small>' + d[2] + '</small></button>').join('') + '</div>' +
      '<p class="fia-dica">A imagem sai <b>sem texto, sem seta e sem emoji</b>: só as pessoas com as roupas. Setas, chamadas e emojis você coloca depois em <b>📸 Postagens → ➕ Adicionar</b>.</p>' +
      '<label for="fia-quem">Quem veste</label><select id="fia-quem">' + QUEM.map((q) => '<option value="' + q[0] + '"' + (quem === q[0] ? ' selected' : '') + '>' + q[1] + '</option>').join('') + '</select>' +
      (quantidadeLooks && nSel > CF_MAX && !ml.erro ? '<div class="fia-aviso"><b>Mais de ' + CF_MAX + ' fotos:</b> o Cloudflare grátis aceita até ' + CF_MAX + ' fotos por imagem; o Gemini (plano com imagens) aceita ' + MAX_FOTOS + '.<label for="fia-divide" style="margin-top:6px">Como enviar</label><select id="fia-divide"><option value="sim"' + (dividirModo === 'sim' ? ' selected' : '') + '>Dividir em ' + dividirLooks(ml.looks).length + ' imagens (funciona no grátis; cada imagem tem alguns dos looks)</option><option value="nao"' + (dividirModo === 'nao' ? ' selected' : '') + '>Uma imagem só com todos os looks (só o Gemini com plano de imagens)</option></select>' + (!temGem && dividirModo === 'nao' ? '<p class="fia-erro">Sem a chave do Gemini, “uma imagem só” não vai sair. Escolha dividir.</p>' : '') + '</div>' : '') +
      '<label for="fia-extra">4. Observação para esta imagem (opcional)</label><input type="text" id="fia-extra" maxlength="300" value="' + esc(extraTxt) + '" placeholder="Ex.: luz de fim de tarde, só mulheres de cabelo longo…">' +
      '<label for="fia-modelos-foto">Modelos nesta foto</label><input id="fia-modelos-foto" type="number" min="1" max="6" step="1" value="' + modelosFoto + '"><p class="fia-dica">Uma pessoa por look: combine uma peça de cima e uma de baixo, ou escolha um look completo. Idade, público e tamanho do cadastro têm prioridade.</p>' +
      '<label for="fia-motor">Motor desta foto</label><select id="fia-motor">' + [['auto','Automático (configuração do gestor)'],['klein4b','FLUX.2 Klein 4B · econômico'],['klein9b','FLUX.2 Klein 9B · testar fidelidade'],['fluxdev','FLUX.2 Dev · teste detalhado (mais cota)']].map(m => '<option value="' + m[0] + '"' + (motor === m[0] ? ' selected' : '') + (m[0] !== 'auto' && !temCf ? ' disabled' : '') + '>' + m[1] + '</option>').join('') + '</select><p class="fia-dica">Os três motores Cloudflare compartilham a cota diária. 9B e Dev consomem mais; Dev também é mais lento. Em plano pago, exceder a franquia pode gerar cobrança. Cada teste gera só uma foto, sem trocar de motor silenciosamente.</p>' +
      '<div class="fia-linha"><button type="button" class="fia-btn" data-a="planejar" ' + (enviando || !nSel ? 'disabled' : '') + '>' + (editandoFoto >= 0 ? 'Salvar alterações da foto' : 'Adicionar esta foto ao lote') + '</button></div>' +
      (fotosPlanejadas.length ? '' : '<div class="fia-linha"><button type="button" class="fia-btn pri" data-a="enviar" ' + (enviando || (fotosPlanejadas.length ? nSel > 0 || editandoFoto >= 0 : !nSel || ml.erro || (quantidadeLooks && ml.looks.length !== quantidadeLooks)) || !(temGem || temCf) ? 'disabled' : '') + '>' + (enviando ? 'Enviando…' : fotosPlanejadas.length ? 'Gerar lote (' + fotosPlanejadas.length + ' fotos)' : (quantidadeLooks ? '➕ Colocar na fila' : 'Gerar esta foto') + (pedidos > 1 ? ' (' + pedidos + ' imagens)' : '')) + '</button></div>');
    if (enviando) a.querySelectorAll('input,select,button').forEach(el => { el.disabled = true; });
    ligarArrasto();
    $('fia-corpo').scrollTop = yC; const g1 = a.querySelector('.fia-pecas'); if (g1) g1.scrollTop = yG;
  }
  function planoFotosHtml_() {
    if (!fotosPlanejadas.length) return '<p class="fia-dica">Para configurar foto por foto, escolha as peças abaixo e toque em “Adicionar esta foto ao lote”. Depois configure a próxima.</p>';
    return '<section class="fia-planejamento" aria-label="Fotos do lote"><h3>Seu lote · ' + fotosPlanejadas.length + ' fotos</h3>' + fotosPlanejadas.map((f, i) => '<div class="fia-foto-plano"><b>Foto ' + (i + 1) + ' · ' + f.modelos + (f.modelos === 1 ? ' modelo' : ' modelos') + '</b>' + (f.sel.length > CF_MAX ? '<p class="fia-dica">Mais de quatro referências: exige Gemini com geração habilitada; não usa a franquia Cloudflare.</p>' : '') + '<p class="fia-dica">' + f.sel.map(x => esc(x.peca || 'Foto do aparelho') + ' (' + esc(PAPEL_ROT[x.papel]) + ')').join(' + ') + '</p><div class="fia-linha"><button type="button" class="fia-btn" data-a="editar-foto" data-i="' + i + '">Editar foto ' + (i + 1) + '</button><button type="button" class="fia-btn" data-a="remover-foto" data-i="' + i + '">Remover</button></div></div>').join('') + '<p class="fia-dica">As fotos só entram na fila quando você tocar em Gerar lote. ' + (sel.length ? 'Adicione ou salve a foto em edição para liberar o envio.' : 'Configure outra foto abaixo ou envie o lote.') + '</p><div class="fia-linha"><button type="button" class="fia-btn pri" data-a="enviar" ' + (enviando || sel.length || editandoFoto >= 0 ? 'disabled' : '') + '>' + (enviando ? 'Enviando lote…' : 'Gerar lote (' + fotosPlanejadas.length + ' fotos)') + '</button></div></section>';
  }
  function planejarFoto_() {
    const ml = montarLooks();
    const temGem = info.temChave && (info.config.provedores || []).includes('gemini');
    if (!sel.length || ml.erro || ml.looks.length !== modelosFoto) { msg('Escolha exatamente ' + modelosFoto + ' look(s) completos para esta foto, sem faltar cima ou baixo.', 'erro'); desenharGerar(); return; }
    if (sel.length > MAX_FOTOS || (sel.length > CF_MAX && (!temGem || motor !== 'auto'))) { msg('Esta foto precisa de ' + sel.length + ' referências. Cloudflare aceita quatro; até seis precisam do Gemini com geração de imagens habilitada. Não vamos dividir os modelos desta foto.', 'erro'); desenharGerar(); return; }
    if (fotosPlanejadas.length >= 20 && editandoFoto < 0) { msg('O lote aceita até 20 fotos.', 'erro'); desenharGerar(); return; }
    const f = { pedidoId: editandoFoto >= 0 ? fotosPlanejadas[editandoFoto].pedidoId : crypto.randomUUID(), sel: sel.map(x => ({ ...x })), looks: ml.looks, modelos: modelosFoto, giro, destino, quem, motor, extra: extraTxt };
    if (editandoFoto >= 0) fotosPlanejadas[editandoFoto] = f; else fotosPlanejadas.push(f);
    sel = []; abertas = []; giro = 0; editandoFoto = -1; modelosManuais = false; quantidadeLooks = 0; msg('Foto salva no planejamento do lote.', 'ok'); desenharGerar();
  }
  async function enviarFotosPlanejadas_() {
    if (enviando || sel.length || editandoFoto >= 0) return;
    enviando = true; const total = fotosPlanejadas.length; desenharGerar();
    while (fotosPlanejadas.length) {
      const f = fotosPlanejadas[0]; msg('Preparando foto ' + (total - fotosPlanejadas.length + 1) + ' de ' + total + '. Você pode fechar esta janela e continuar no painel enquanto envia.', 'ok'); desenharGerar();
      const corpo = await corpoFoto_(f);
      if (!corpo) { enviando = false; msg('Não consegui ler uma referência. As fotos ainda não enviadas continuam no lote.', 'erro'); desenharGerar(); return; }
      const r = await api('/fotoia/fila', 'POST', corpo);
      if (!r || !r.ok) { enviando = false; msg(erroTxt(r) + ' As fotos restantes foram mantidas.', 'erro'); desenharGerar(); return; }
      fotosPlanejadas.shift(); desenharGerar();
    }
    enviando = false; aba = 'fila'; filtro = 'todas'; msg('Lote enviado. Cada foto mantém seus modelos e peças.', 'ok'); await carregarLista(); desenhar(); religar();
  }
  async function corpoFoto_(f) {
    const fotos = [], refs = [];
    for (const x of f.sel) { const r = await fotoPronta(x.url); if (!r) return null; fotos.push({ mime: 'image/jpeg', data: r.grande.split(',')[1] }); if (r.pequena) refs.push({ mime: 'image/jpeg', data: r.pequena.split(',')[1] }); }
    return { pedidoId: f.pedidoId, produto: new Set(f.sel.map(x => x.cod || '')).size === 1 ? f.sel[0].cod || '' : '', nome: f.sel.map(x => x.peca || 'Foto do aparelho').join(' + ').slice(0, 120), fotos, refs: f.sel.length <= CF_MAX && refs.length === fotos.length ? refs : [], papeis: f.sel.map(x => x.papel), looks: f.looks, rotulos: f.sel.map(x => x.peca || ''), pecas: f.sel.map(x => { const p = produtos.find(p => String(p.ID) === String(x.pid)); return { codigo: x.cod || '', nome: x.peca || '', avista: p && Number(p.Preco) > 0 ? Math.round(Number(p.Preco) * (1 - DESCONTO_AVISTA) * 100) / 100 : null }; }), destino: f.destino, quem: f.quem, motor: f.motor, extra: f.extra };
  }
  function dataBr(iso) { try { const d = new Date(iso); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  const ROT = { fila: 'Na fila', gerando: 'Gerando…', pronta: 'Pronta', aprovada: 'Aprovada', erro: 'Erro', descartada: 'Descartada', cancelada: 'Cancelada' };
  function cartao(x) {
    const botoes = [];
    if (x.status === 'fila') botoes.push(['agora', '⚡ Tentar agora', ''], ['cancelar', 'Cancelar', 'perigo']);
    if (x.status === 'pronta') botoes.push(['aprovar', '✔ Aprovar', 'pri'], ['baixar', '⬇ Baixar', ''], ['refazer', '🔁 Refazer', ''], ['descartar', '🗑 Descartar', 'perigo']);
    if (x.status === 'aprovada') botoes.push(['baixar', '⬇ Baixar', ''], ['refazer', '🔁 Refazer', ''], ['descartar', '🗑 Descartar', 'perigo']);
    if (x.status === 'erro') botoes.push(['refazer', '🔁 Tentar de novo', 'pri'], ['descartar', '🗑 Descartar', 'perigo']);
    if (x.status === 'descartada' || x.status === 'cancelada') botoes.push(['refazer', '🔁 Refazer', '']);
    return '<div class="fia-cartao" data-id="' + x.id + '"><h3>' + esc(x.nome || 'Peça sem nome') + ' <span class="fia-chip ' + esc(x.status) + '">' + esc(ROT[x.status] || x.status) + '</span></h3>' +
      '<small>' + (x.produto ? esc(x.produto) + ' · ' : '') + 'pedido em ' + esc(dataBr(x.criado_em)) + (x.modelo ? ' · ' + esc(x.modelo) : '') + '</small>' +
      (x.plano ? '<small>' + x.plano.looks + (x.plano.looks === 1 ? ' look (1 pessoa)' : ' looks (' + x.plano.looks + ' pessoas)') + ' · ' + esc(({ status: 'Status', reels: 'Reels', carrossel: 'Capa de carrossel' })[x.plano.destino] || '') + '</small>' : '') +
      (x.plano && x.plano.origem ? '<small>Comparação do pedido ' + Number(x.plano.origem) + ' · original preservado</small>' : '') +
      (x.extra ? '<small>Observação: ' + esc(x.extra) + '</small>' : '') +
      (x.status === 'fila' && x.espera ? '<p class="fia-aviso">⏳ ' + esc(x.erro || 'Esperando a cota.') + ' Tenta de novo por volta de <b>' + esc(dataBr(x.espera)) + '</b>.</p>' : '') +
      (x.status === 'fila' && !x.espera && !x.erro ? '<small>Aguardando a vez (1 por minuto).</small>' : '') +
      (x.status === 'gerando' ? '<small>A IA está criando a imagem… (leva de 10 a 60 segundos)</small>' : '') +
      (x.status === 'erro' ? '<p class="fia-erro">' + esc(x.erro || 'Não deu certo.') + '</p>' : '') +
      '<div class="fia-resu">' + (x.resultado ? '<img alt="Imagem gerada" data-a="ampliar" data-u="' + esc(x.resultado) + '" ' + atribSrc(x.resultado) + '>' : '') +
      '<div class="fia-fontes" title="Fotos enviadas à IA">' + (x.fontes || []).map((u) => '<img alt="" loading="lazy" ' + atribSrc(u) + '>').join('') + '</div></div>' +
      legendaHtml(x) + catalogoHtml_(x) + compararHtml_(x) + '<div class="fia-linha">' + botoes.map((b) => '<button type="button" class="fia-btn ' + b[2] + '" data-a="acao" data-v="' + b[0] + '" data-id="' + x.id + '">' + b[1] + '</button>').join('') + '</div></div>';
  }
  function compararHtml_(x) {
    if (!['pronta', 'aprovada'].includes(x.status)) return '';
    return '<details class="fia-catalogo"><summary>Testar outro motor</summary><p class="fia-dica">Mantém esta imagem e gera uma comparação com as mesmas peças. Os motores compartilham a franquia Cloudflare; 9B e Dev usam mais cota. Nenhuma imagem será publicada ou aprovada automaticamente.</p><label for="fia-teste-' + x.id + '">Motor do teste</label><select id="fia-teste-' + x.id + '"><option value="klein4b">FLUX.2 Klein 4B</option><option value="klein9b">FLUX.2 Klein 9B</option><option value="fluxdev">FLUX.2 Dev (mais cota)</option></select><button type="button" class="fia-btn" data-a="comparar" data-id="' + x.id + '">Gerar uma comparação</button><p class="fia-teste-retorno" role="status"></p></details>';
  }
  function produtosDaFoto_(x) {
    const codigos = [...new Set((x.plano && x.plano.pecas || []).map(p => p.codigo).filter(Boolean))];
    if (!codigos.length && x.produto) codigos.push(x.produto);
    return codigos.map(c => produtos.find(p => String(p.Codigo) === String(c))).filter(Boolean);
  }
  function catalogoHtml_(x) {
    if (x.status !== 'aprovada' || !x.resultado) return '';
    const ps = produtosDaFoto_(x);
    if (!ps.length) return '<p class="fia-dica">Foto sem produto de origem vinculado. Baixe a imagem para usar no cadastro.</p>';
    return '<details class="fia-catalogo fia-catalogo-produto"><summary>Colocar no produto</summary><p class="fia-dica">Escolha onde usar esta foto aprovada. As fotos originais serão preservadas.</p>' + ps.map(p => '<div class="fia-grupo"><label><input type="checkbox" data-fia-produto="' + esc(p.ID) + '" checked> ' + esc(p.Nome) + '</label><label><input type="checkbox" data-fia-capa="' + esc(p.ID) + '"> Usar como capa deste produto</label></div>').join('') + '<button type="button" class="fia-btn pri" data-a="catalogo-salvar" data-id="' + x.id + '">Adicionar aos produtos escolhidos</button>' + (ps.length > 1 ? '<label>Nome do produto misto<input type="text" data-fia-nome maxlength="120" value="' + esc('Look · ' + ps.map(p => p.Nome).join(' + ').slice(0, 110)) + '"></label><p class="fia-dica">Cria um cadastro próprio, com esta capa e “Consultar valor”. As peças vinculadas mostram seus próprios preços e fotos.</p><button type="button" class="fia-btn" data-a="catalogo-salvar" data-misto="sim" data-id="' + x.id + '">Criar produto misto com todas as peças</button>' : '') + '<p data-fia-retorno role="status"></p></details>';
  }
  async function catalogoAtual_() {
    const r = await fetch(API_URL + '?action=list&todos=true', { cache: 'no-store' }).then(r => r.json());
    if (!r || !Array.isArray(r.produtos)) throw new Error('Não consegui atualizar os produtos. Nada foi alterado.');
    return r.produtos;
  }
  async function adicionarFotoProduto_(p, url, capa) {
    const todas = [p.Foto_URL].concat(String(p.Fotos_Galeria || '').split(',')).map(u => String(u || '').trim()).filter(Boolean);
    const unica = [...new Set(todas.concat(url))], novaCapa = capa || !p.Foto_URL ? url : p.Foto_URL;
    if (unica.filter(u => u !== novaCapa).length > 8) throw new Error('A galeria de ' + p.Nome + ' já está completa (oito fotos). Organize as fotos no cadastro antes de acrescentar outra.');
    const r = await chamarAdmin_({ action: 'update', id: p.ID, fotoUrlExistente: novaCapa, fotosGaleriaExistentes: unica.filter(u => u !== novaCapa).join(',') });
    if (!r || !r.ok) throw new Error((r && r.erro) || 'Não consegui salvar este produto.');
  }
  async function salvarNoCatalogo_(id, misto, btn) {
    if (salvandoCatalogo.has(id)) return;
    const x = itens.find(x => x.id === id), box = btn.closest('.fia-catalogo'), ret = box.querySelector('[data-fia-retorno]');
    const ids = Array.from(box.querySelectorAll('[data-fia-produto]:checked')).map(e => e.dataset.fiaProduto);
    if (!misto && !ids.length) { ret.textContent = 'Escolha pelo menos um produto.'; return; }
    const nome = misto ? box.querySelector('[data-fia-nome]').value.trim() : '';
    if (misto && !nome) { ret.textContent = 'Informe o nome do produto misto.'; return; }
    salvandoCatalogo.add(id); box.querySelectorAll('button').forEach(b => { b.disabled = true; });
    ret.textContent = 'Guardando uma cópia permanente da foto…';
    const salvos = [];
    try {
      const copia = await api('/fotoia/incorporar', 'POST', { id }); if (!copia || !copia.ok) throw new Error(erroTxt(copia));
      const atuais = await catalogoAtual_();
      if (misto) {
        ret.textContent = 'Criando o cadastro e vinculando as peças…';
        // Same intent across retries, devices and lost responses. Existing backend deduplicates opId.
        const status = await api('/fotoia/composicao?id=' + id); if (!status || !status.ok) throw new Error(erroTxt(status));
        let produtoMisto = status.produto || '';
        try { if (!produtoMisto) produtoMisto = localStorage.getItem('tk_fotoia_misto_' + id) || ''; } catch (e) { /* registro de vínculo ainda funciona */ }
        const uniao = campo => [...new Set(produtosDaFoto_(x).flatMap(p => String(p[campo] || '').split(',').map(s => s.trim())).filter(Boolean))].join(', ');
        const r = produtoMisto ? { ok: true, id: produtoMisto } : await chamarAdmin_({ action: 'create', opId: 'fotoia-misto-' + id, nome, categoria: uniao('Categoria'), genero: uniao('Genero'), preco: '0', consultarValor: true, estoque: '', tamanhos: '', cores: '', descricao: 'Composição com peças vendidas separadamente. Consulte a disponibilidade de cada peça.', novidade: false, notificarPush: false, fotoUrlExistente: copia.url, fotosGaleriaExistentes: '' });
        if (!r || !r.ok || !r.id) throw new Error((r && r.erro) || 'Não consegui confirmar o cadastro. Tente novamente: o mesmo pedido não cria outro produto.');
        const existente = atuais.find(p => String(p.ID) === String(r.id));
        if (existente && existente.Foto_URL !== copia.url) await adicionarFotoProduto_(existente, copia.url, true);
        try { localStorage.setItem('tk_fotoia_misto_' + id, String(r.id)); } catch (e) { /* backend também reconhece opId nos reenvios recentes */ }
        const v = await api('/fotoia/composicao', 'POST', { id, produto: String(r.id) });
        if (!v || !v.ok) throw new Error('O produto foi criado, mas faltou vincular as peças. Tente novamente para concluir sem duplicar. ' + erroTxt(v));
        ret.textContent = 'Produto misto pronto com esta foto, peças vinculadas e valor a consultar.';
      } else {
        for (const pid of ids) {
          const p = atuais.find(p => String(p.ID) === pid); if (!p) throw new Error('Um produto não está mais disponível. Atualize a lista.');
          const capa = box.querySelector('[data-fia-capa="' + CSS.escape(pid) + '"]').checked;
          ret.textContent = 'Salvando em ' + p.Nome + '…';
          await adicionarFotoProduto_(p, copia.url, capa);
          salvos.push(p.Nome);
        }
        ret.textContent = 'Foto adicionada em ' + salvos.length + ' produto(s).';
      }
      await carregarProdutos();
    } catch (e) { ret.textContent = (salvos.length ? 'Já salvo: ' + salvos.join(', ') + '. ' : '') + e.message; }
    finally { salvandoCatalogo.delete(id); box.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  }
  function conteudoDasPecas(x) {
    const ps = x && x.plano && Array.isArray(x.plano.pecas) ? x.plano.pecas : [];
    const unicas = ps.filter((p, i) => p.codigo && ps.findIndex(q => q.codigo === p.codigo) === i);
    const texto = unicas.map(p => (p.nome || 'Peça') + ' · ' + p.codigo + '\n' + (Number(p.avista) > 0 ? Number(p.avista).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' à vista' : 'Consulte valor')).join('\n\n');
    const link = unicas.length ? SITE_URL + '?sel=' + unicas.map(p => encodeURIComponent(p.codigo)).join(',') : '';
    return { texto, link };
  }
  function legendaHtml(x) {
    const c = conteudoDasPecas(x); if (!c.texto) return '';
    return '<details class="fia-legenda"><summary>Legenda e link das peças</summary><p class="fia-dica">Preços à vista registrados ao gerar. Confira preço e disponibilidade antes de compartilhar.</p><label>Legenda<textarea readonly rows="5">' + esc(c.texto) + '</textarea></label><button type="button" class="fia-btn" data-a="copiar-legenda" data-id="' + x.id + '">Copiar legenda</button><label>Link destas peças<input readonly value="' + esc(c.link) + '"></label><button type="button" class="fia-btn" data-a="copiar-link" data-id="' + x.id + '">Copiar link</button></details>';
  }
  function desenharFila(manterRolagem) {
    if (manterRolagem && $('fia-aba') && ($('fia-aba').querySelector('.fia-catalogo[open]') || salvandoCatalogo.size)) return;
    const a = $('fia-aba'); if (!a) return;
    const legendasAbertas = new Set(Array.from(a.querySelectorAll('.fia-cartao')).filter(c => c.querySelector('.fia-legenda[open]')).map(c => c.dataset.id));
    const y = $('fia-corpo').scrollTop;
    const filtros = [['todas', 'Todas'], ['fila', 'Na fila'], ['pronta', 'Prontas'], ['aprovada', 'Aprovadas'], ['erro', 'Com erro'], ['descartada', 'Descartadas']];
    const vis = itens.filter((x) => filtro === 'todas' ? x.status !== 'descartada' && x.status !== 'cancelada' : x.status === filtro || (filtro === 'fila' && x.status === 'gerando'));
    a.innerHTML = statusHtml() + (msgTxt ? '<p role="status" class="' + (msgTipo === 'erro' ? 'fia-erro' : 'fia-ok') + '">' + esc(msgTxt) + '</p>' : '') + '<div class="fia-abas">' + filtros.map((f) => '<button type="button" data-a="filtro" data-v="' + f[0] + '" aria-pressed="' + (filtro === f[0]) + '">' + f[1] + '</button>').join('') + '</div>' +
      (vis.length ? vis.map(cartao).join('') : '<p class="fia-dica">Nada aqui ainda. Volte em “✨ Gerar” e coloque uma peça na fila.</p>');
    a.querySelectorAll('.fia-cartao').forEach(c => { const d = c.querySelector('.fia-legenda'); if (d && legendasAbertas.has(c.dataset.id)) d.open = true; });
    if (manterRolagem) $('fia-corpo').scrollTop = y;
  }
  function desenharInstrucao() {
    const a = $('fia-aba'); if (!a) return; const ed = ehGestor() && !!(info && info.podeEditar !== false), dis = ed ? '' : ' disabled';
    a.innerHTML = statusHtml() + (ed ? '' : '<p class="fia-aviso">Só o Admin total muda a instrução e os limites. Você pode ler e usar.</p>') +
      '<label for="fia-instr">Instrução enviada à IA em TODO pedido <span class="fia-dica" id="fia-cont"></span></label><textarea id="fia-instr" maxlength="12000"' + dis + '>' + esc(cfg.instrucao) + '</textarea>' +
      '<p class="fia-dica">Dica: mude uma coisa por vez e gere de novo (🔁 Refazer) para comparar. No fim de cada pedido o sistema acrescenta sozinho: o nome do lote, a <b>lista de looks</b> (qual foto veste em qual pessoa, com o perfil de cada uma), o destino (Status, Reels ou capa) e a observação — não precisa escrever isso aqui. A imagem nunca leva texto nem seta: isso é colocado depois, em Postagens.</p>' +
      '<label for="fia-formato">Proporção da imagem</label><select id="fia-formato"' + dis + '>' + ['9:16', '4:5', '3:4', '1:1'].map((f) => '<option value="' + f + '"' + (cfg.formato === f ? ' selected' : '') + '>' + f + (f === '9:16' ? ' (Story / Reels)' : f === '4:5' ? ' (Feed)' : '') + '</option>').join('') + '</select>' +
      '<label for="fia-prov">Quem gera a imagem</label><select id="fia-prov"' + dis + '>' + [['gemini,cloudflare', 'Gemini primeiro; se estiver sem cota, Cloudflare (recomendado)'], ['cloudflare,gemini', 'Cloudflare primeiro; Gemini como reserva'], ['cloudflare', 'Só Cloudflare (grátis por dia)'], ['gemini', 'Só Gemini']].map((m) => '<option value="' + m[0] + '"' + ((cfg.provedores || ['gemini', 'cloudflare']).join(',') === m[0] ? ' selected' : '') + '>' + m[1] + '</option>').join('') + '</select>' +
      '<p class="fia-dica">O Gemini gera imagens melhores, mas a conta grátis dele costuma ter cota 0 para imagem. O Cloudflare (FLUX) tem uma cota grátis por dia e aceita as fotos reais da peça como referência; a qualidade e a fidelidade à roupa precisam ser conferidas por você — comece com 🔁 Refazer e compare.</p>' +
      '<label for="fia-instrcf">Instrução do Cloudflare (curta, em inglês funciona melhor) <span class="fia-dica" id="fia-contcf"></span></label><textarea id="fia-instrcf" maxlength="3000" style="min-height:150px"' + dis + '>' + esc(cfg.instrucaoCf || '') + '</textarea>' +
      '<p class="fia-dica">Pode usar <b>{n}</b> (quantas pessoas), <b>{quem}</b> (mulheres/crianças/homens), <b>{looks}</b> (a lista de quem veste o quê, já em inglês), <b>{nome}</b>, <b>{extra}</b> e <b>{formato}</b>. Se faltar <b>{looks}</b>, a lista é colocada no fim. A instrução grande de cima vale só para o Gemini.</p>' +
      '<label for="fia-cfmod">Modelo do Cloudflare</label><input type="text" id="fia-cfmod" value="' + esc(cfg.cfModelo || '') + '" maxlength="120"' + dis + '>' +
      '<p class="fia-dica">Hoje: <b>flux-2-klein-4b</b> (rápido; pela tabela de preços da Cloudflare dá ~90 imagens por dia no grátis). Para testar mais qualidade: <b>@cf/black-forest-labs/flux-2-klein-9b</b> — gasta mais do grátis (~6 imagens por dia). Os dois aceitam até 4 fotos de referência por imagem (por isso pedidos com 5 ou 6 fotos são divididos). Não testei o 9B neste sistema: se der erro, volte ao 4b.</p>' +
      '<label for="fia-modelos">Modelos (um por linha; tenta na ordem e pula o que estiver sem cota)</label><textarea id="fia-modelos" style="min-height:90px"' + dis + '>' + esc((cfg.modelos || []).join('\n')) + '</textarea>' +
      '<label for="fia-modo">Jeito de falar com o Google</label><select id="fia-modo"' + dis + '>' + [['auto', 'Automático (tenta o novo e depois o clássico)'], ['interactions', 'Só Interactions API'], ['generateContent', 'Só generateContent (clássico)']].map((m) => '<option value="' + m[0] + '"' + (cfg.modo === m[0] ? ' selected' : '') + '>' + m[1] + '</option>').join('') + '</select>' +
      '<label for="fia-lim">Máximo de imagens por dia (trava contra gasto)</label><input type="number" id="fia-lim" min="1" max="200" value="' + esc(cfg.limiteDia) + '"' + dis + '>' +
      '<label><input type="checkbox" id="fia-lig"' + (cfg.ligado !== false ? ' checked' : '') + dis + '> IA ligada (desmarcado: os pedidos esperam na fila)</label>' +
      '<p class="fia-aviso">Sobre custo: os modelos de imagem do Google podem não ter plano gratuito. Sem cota, o pedido tenta o Cloudflare e, se os dois estiverem sem cota, fica na fila (nada é cobrado) e a tela avisa. O Cloudflare grátis tem um limite diário da conta; passou, o pedido espera até a manhã seguinte. O limite por dia acima protege caso você ligue um plano pago.</p>' +
      (msgTxt ? '<p class="' + (msgTipo === 'erro' ? 'fia-erro' : 'fia-ok') + '">' + esc(msgTxt) + '</p>' : '') +
      (ed ? '<div class="fia-linha"><button type="button" class="fia-btn pri" data-a="salvarcfg">💾 Salvar</button><button type="button" class="fia-btn" data-a="padrao">↺ Voltar à instrução padrão</button></div>' : '');
    contar();
  }
  function contar() { const t = $('fia-instr'), c = $('fia-cont'); if (t && c) c.textContent = '(' + t.value.length + ' de 12000 letras)'; const t2 = $('fia-instrcf'), c2 = $('fia-contcf'); if (t2 && c2) c2.textContent = '(' + t2.value.length + ' de 3000 letras)'; }

  /* ---------- ações ---------- */
  function msg(t, tipo) { msgTxt = t || ''; msgTipo = tipo || ''; }
  async function clique(e) {
    if (enviando) return;
    const b = e.target.closest && e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'aba') { aba = b.dataset.v; msg(''); await carregarConfig(); if (!info) return; if (aba === 'fila') await carregarLista(); desenhar(); return; }
    if (a === 'filtro') { filtro = b.dataset.v; desenharFila(); return; }
    if (a === 'peca') { const id = String(b.dataset.id), i = abertas.indexOf(id); if (i >= 0) abertas.splice(i, 1); else abertas.push(id); msg(''); desenharGerar(); return; }
    if (a === 'foto') {
      const u = b.dataset.u, pid = String(b.dataset.p || ''), i = sel.findIndex((x) => x.url === u && String(x.pid || '') === pid);
      if (i >= 0) { sel.splice(i, 1); giro = 0; }
      else if (sel.length >= limiteFotos()) { msg('Máximo de ' + limiteFotos() + ' fotos por pedido. Tire uma para escolher outra.', 'erro'); }
      else { const p = (typeof produtos !== 'undefined' ? produtos : []).find((x) => String(x.ID) === String(b.dataset.p)); sel.push({ url: u, pid: pid, peca: p ? (p.Nome || 'Peça') : '', cod: p ? (p.Codigo || p.ID || '') : '', papel: (p && tipoPeca(p)) || 'look' }); msg(''); }
      desenharGerar(); return;
    }
    if (a === 'tipo') { tipoFiltro = b.dataset.v; msg(''); desenharGerar(); const g = $('fia-aba') && $('fia-aba').querySelector('.fia-pecas'); if (g && b.closest('.fia-erro')) { try { g.scrollIntoView({ block: 'center' }); } catch (er) { /* sem rolagem */ } } return; }
    if (a === 'papel') { const x = sel[Number(b.dataset.i)]; if (x) { x.papel = b.dataset.v; giro = 0; msg(''); } desenharGerar(); return; }
    if (a === 'tirar') { sel.splice(Number(b.dataset.i), 1); giro = 0; msg(''); desenharGerar(); return; }
    if (a === 'trocar') { giro++; desenharGerar(); return; }
    if (a === 'destino') { destino = b.dataset.v; desenharGerar(); return; }
    if (a === 'planejar') return planejarFoto_();
    if (a === 'remover-foto') { const i = Number(b.dataset.i); if (editandoFoto >= 0) { msg('Salve a foto em edição antes de remover outra.', 'erro'); desenharGerar(); return; } fotosPlanejadas.splice(i, 1); desenharGerar(); return; }
    if (a === 'editar-foto') { if (sel.length) { msg('Adicione a foto atual ao lote antes de editar outra.', 'erro'); desenharGerar(); return; } const i = Number(b.dataset.i), f = fotosPlanejadas[i]; if (!f) return; sel = f.sel.map(x => ({ ...x })); giro = f.giro; destino = f.destino; quem = f.quem; motor = f.motor; modelosFoto = f.modelos; modelosManuais = true; extraTxt = f.extra; editandoFoto = i; desenharGerar(); return; }
    if (a === 'catalogo-salvar') return salvarNoCatalogo_(Number(b.dataset.id), b.dataset.misto === 'sim', b);
    if (a === 'enviar') return fotosPlanejadas.length ? enviarFotosPlanejadas_() : enviar();
    if (a === 'ampliar') { try { if (window.TKFotoGrande) { window.TKFotoGrande.abrir({ itens: [{ url: b.dataset.u }], indice: 0 }); return; } } catch (er) { /* abre normal */ } window.open(b.dataset.u, '_blank', 'noopener'); return; }
    if (a === 'copiar-legenda' || a === 'copiar-link') {
      const item = itens.find(x => String(x.id) === String(b.dataset.id));
      const c = conteudoDasPecas(item);
      try { await navigator.clipboard.writeText(a === 'copiar-link' ? c.link : c.texto); b.textContent = 'Copiado!'; }
      catch (err) { b.textContent = 'Selecione o texto acima para copiar'; }
      return;
    }
    if (a === 'comparar') { const id = Number(b.dataset.id), motorTeste = $('fia-teste-' + id).value; b.disabled = true; b.textContent = 'Colocando teste na fila…'; const r = await api('/fotoia/acao', 'POST', { id, acao: 'comparar', motor: motorTeste }); msg(r && r.ok ? 'Comparação na fila (pedido ' + r.id + '). A imagem anterior foi mantida.' : erroTxt(r), r && r.ok ? 'ok' : 'erro'); if (r && r.ok) { filtro = 'todas'; await carregarLista(); desenhar(); religar(); } else { b.disabled = false; b.textContent = 'Gerar uma comparação'; b.closest('details').querySelector('.fia-teste-retorno').textContent = erroTxt(r); } return; }
    if (a === 'acao') return acao(b.dataset.v, Number(b.dataset.id), b);
    if (a === 'salvarcfg') return salvarCfg();
    if (a === 'padrao') { if (!confirm('Voltar as instruções, a proporção, os modelos, o motor e o limite para o padrão?')) return; const r = await api('/fotoia/config', 'POST', { padrao: true }); if (r && r.ok) { cfg = JSON.parse(JSON.stringify(r.config)); await carregarConfig(); msg('Voltou ao padrão.', 'ok'); } else msg(erroTxt(r), 'erro'); desenhar(); return; }
  }
  function entrada(e) {
    if (e.target.id === 'fia-busca') { busca = e.target.value; const pos = e.target.selectionStart; desenharGerar(); const n = $('fia-busca'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { /* sem seleção */ } } }
    if (e.target.id === 'fia-instr' || e.target.id === 'fia-instrcf') contar();
    if (e.target.id === 'fia-extra') extraTxt = e.target.value;
  }
  async function mudou(e) {
    if (enviando) return;
    if (e.target.id === 'fia-quantidade') { const n = Number(e.target.value); if (e.target.value && (!Number.isInteger(n) || n < 1 || n > 20)) { msg('Escolha de 1 a 20 looks.', 'erro'); desenharGerar(); return; } quantidadeLooks = n || 0; if (!quantidadeLooks && sel.length > MAX_FOTOS) { quantidadeLooks = Math.min(20, montarLooks().looks.length || 20); msg('Para sair do lote, reduza primeiro a seleção a seis fotos.', 'erro'); } dividirModo = 'sim'; desenharGerar(); return; }
    if (e.target.id === 'fia-looks-imagem') { looksPorImagem = Number(e.target.value) === 3 ? 3 : 2; desenharGerar(); return; }
    const id = e.target.id;
    if (id === 'fia-modelos-foto') { const n = Number(e.target.value); modelosManuais = true; modelosFoto = Number.isInteger(n) && n >= 1 && n <= 6 ? n : 1; e.target.value = modelosFoto; return; }
    if (id === 'fia-motor') { motor = e.target.value; return; }
    if (id === 'fia-quem') { quem = e.target.value; return; }
    if (id === 'fia-divide') { dividirModo = e.target.value; desenharGerar(); return; }
    if (id !== 'fia-arq') return;
    const arqs = Array.from(e.target.files || []); e.target.value = '';
    for (const f of arqs) {
      if (sel.length >= limiteFotos()) { msg('Máximo de ' + limiteFotos() + ' fotos por pedido.', 'erro'); break; }
      const d = await arquivoParaDataUrl(f, 1280); if (!d) { msg('Não consegui ler ' + f.name + '.', 'erro'); continue; }
      sel.push({ url: d, peca: '', cod: '', papel: 'look', aparelho: true });
    }
    desenharGerar();
  }
  function reduzir(img, max) {
    const esc2 = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(img.width * esc2)); c.height = Math.max(1, Math.floor(img.height * esc2));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  }
  function arquivoParaDataUrl(file, max) {
    return new Promise((resolve) => { const o = URL.createObjectURL(file), img = new Image(); img.onerror = () => { URL.revokeObjectURL(o); resolve(null); }; img.onload = () => { try { resolve(reduzir(img, max)); } catch (e) { resolve(null); } URL.revokeObjectURL(o); }; img.src = o; });
  }
  function dataUrlReduzida(url, max) {
    return new Promise((resolve) => { const img = new Image(); img.onerror = () => resolve(null); img.onload = () => { try { resolve(reduzir(img, max)); } catch (e) { resolve(null); } }; img.src = url; });
  }
  async function urlParaDataUrl(url, max) {
    if (/^data:/.test(url)) return max < 1000 ? dataUrlReduzida(url, max) : url;
    try { const r = await fetch(url, { mode: 'cors' }); if (!r.ok) return null; return await arquivoParaDataUrl(await r.blob(), max); } catch (e) { return null; }
  }
  const cacheFoto = {};
  async function fotoPronta(u) {                                           // {grande, pequena} em data URL; guarda para não baixar duas vezes
    if (!cacheFoto[u]) { const d = await urlParaDataUrl(u, 1280); cacheFoto[u] = d ? { grande: d, pequena: await urlParaDataUrl(d, 500) } : null; }
    return cacheFoto[u];
  }
  async function enviar() {
    if (enviando) return;
    if (!quantidadeLooks && sel.length) { planejarFoto_(); if (!sel.length && fotosPlanejadas.length) return enviarFotosPlanejadas_(); return; }
    if (!sel.length) { msg('Toque em pelo menos 1 foto.', 'erro'); desenharGerar(); return; }
    const ml = montarLooks(); if (ml.erro) { msg('Faltam ' + ml.erro.n + ' peça(s) de ' + ml.erro.faltam + ' para fechar os looks.', 'erro'); desenharGerar(); return; }
    const provs = (info.config && info.config.provedores) || [], usaCf = provs.indexOf('cloudflare') !== -1 && !!(info.cloudflare && info.cloudflare.disponivel);
    if (quantidadeLooks && ml.looks.length !== quantidadeLooks) { msg('Complete exatamente ' + quantidadeLooks + ' looks antes de gerar.', 'erro'); desenharGerar(); return; }
    if (dividirModo === 'nao' && sel.length > MAX_FOTOS) { msg('Este lote precisa ser dividido. Escolha a divisão antes de enviar.', 'erro'); desenharGerar(); return; }
    const grupos = gruposDoPlano(ml.looks);
    enviando = true; msg(''); desenharGerar();
    const extra = extraTxt || '', criados = [];
    function manterRestantes(gi) { if (!criados.length) return; sel = grupos.slice(gi).flatMap(g => g.flatMap(l => l.map(i => sel[i]))); giro = 0; if (quantidadeLooks) quantidadeLooks = grupos.slice(gi).reduce((n, g) => n + g.length, 0); abertas = []; }
    for (let gi = 0; gi < grupos.length; gi++) {
      const ordem = []; grupos[gi].forEach((l) => l.forEach((i) => ordem.push(i)));       // fotos na ordem dos looks; os índices dos looks passam a ser os desta lista
      const fotos = [], refs = []; let refsOk = usaCf && ordem.length <= CF_MAX;
      for (const i of ordem) {
        const f = await fotoPronta(sel[i].url); if (!f) { manterRestantes(gi); enviando = false; msg((criados.length ? criados.length + ' imagem(ns) já na fila; só os looks restantes foram mantidos. ' : '') + 'Não consegui baixar uma das fotos. Tente outra foto ou envie do aparelho.', 'erro'); desenharGerar(); return; }
        fotos.push({ mime: 'image/jpeg', data: f.grande.split(',')[1] });
        if (refsOk) { if (f.pequena) refs.push({ mime: 'image/jpeg', data: f.pequena.split(',')[1] }); else refsOk = false; }   // a cópia pequena TEM que casar com a foto (a ordem liga foto ↔ look)
      }
      const looks = grupos[gi].map((l) => l.map((i) => ordem.indexOf(i)));
      const nomes = []; ordem.forEach((i) => { const n = sel[i].peca || 'Foto do aparelho'; if (nomes.indexOf(n) === -1) nomes.push(n); });
      const unica = new Set(ordem.map((i) => sel[i].cod || '')).size === 1 && sel[ordem[0]].cod ? sel[ordem[0]].cod : '';
      const corpo = { nome: (nomes.slice(0, 3).join(' + ') + (nomes.length > 3 ? ' +' + (nomes.length - 3) : '') + (grupos.length > 1 ? ' (parte ' + (gi + 1) + '/' + grupos.length + ')' : '')).slice(0, 120), produto: unica, extra: extra, fotos: fotos,
        papeis: ordem.map((i) => sel[i].papel), looks: looks, rotulos: ordem.map((i) => sel[i].peca || ''), destino: destino, quem: quem, motor: motor };
      corpo.pecas = ordem.map(i => {
        const p = (typeof produtos !== 'undefined' ? produtos : []).find(p => String(p.ID) === String(sel[i].pid));
        const preco = p ? Number(p.Preco) : 0;
        return { codigo: sel[i].cod || '', nome: sel[i].peca || '', avista: preco > 0 ? Number((preco * (1 - DESCONTO_AVISTA)).toFixed(2)) : null };
      });
      if (refsOk && refs.length === fotos.length) corpo.refs = refs;
      const r = await api('/fotoia/fila', 'POST', corpo);
      if (!r || !r.ok) { enviando = false; msg((criados.length ? criados.length + ' pedido(s) já entraram na fila. ' : '') + erroTxt(r), 'erro'); manterRestantes(gi); desenharGerar(); return; }
      criados.push(r.id);
    }
    Object.keys(cacheFoto).forEach((k) => { delete cacheFoto[k]; });
    enviando = false; sel = []; abertas = []; giro = 0; extraTxt = ''; quantidadeLooks = 0; modelosManuais = false; msg(criados.length > 1 ? criados.length + ' imagens na fila! Acompanhe em “Fila e resultados”.' : 'Pedido na fila! Acompanhe em “Fila e resultados”.', 'ok');
    aba = 'fila'; filtro = 'todas'; await carregarConfig(); await carregarLista(); desenhar(); religar();      // 'todas': quem estava olhando só os erros/descartadas vê o pedido novo
  }
  async function baixar(url, nome) {
    try { const r = await fetch(url); const bl = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
    catch (e) { window.open(url, '_blank', 'noopener'); }
  }
  async function acao(v, id, btn) {
    const x = itens.find((i) => i.id === id); if (!x) return;
    if (v === 'baixar') { await baixar(x.resultado, 'tenkiter-ia-' + id + '.jpg'); return; }
    if (v === 'descartar' && !confirm('Descartar esta imagem? Ela será apagada.')) return;
    if (btn) btn.disabled = true;
    const r = await api('/fotoia/acao', 'POST', { id: id, acao: v });
    if (!r || !r.ok) { msg(erroTxt(r), 'erro'); } else msg('');
    await carregarConfig(); await carregarLista(); desenhar(); religar();
  }
  async function salvarCfg() {
    const nova = { instrucao: $('fia-instr').value, instrucaoCf: $('fia-instrcf').value, provedores: $('fia-prov').value.split(','), cfModelo: $('fia-cfmod').value, formato: $('fia-formato').value, modelos: $('fia-modelos').value, modo: $('fia-modo').value, limiteDia: Number($('fia-lim').value) || 20, ligado: $('fia-lig').checked };
    const r = await api('/fotoia/config', 'POST', { config: nova });
    if (r && r.ok) { cfg = JSON.parse(JSON.stringify(r.config)); await carregarConfig(); msg('Salvo. Vale para os próximos pedidos (use 🔁 Refazer para testar nos antigos).', 'ok'); } else msg(erroTxt(r), 'erro');
    desenhar();
  }

  /* ---------- botão ---------- */
  function ligarBotao() {
    const b = $('btn-abrir-fotoia'); if (!b) return;
    const ok = podeUsar(); b.hidden = !ok;
    if (!b.dataset.ligado) { b.dataset.ligado = '1'; b.addEventListener('click', abrir); }
  }
  window.tkFotoIA = { abrir: abrir };
  document.addEventListener('DOMContentLoaded', ligarBotao); ligarBotao();
  setInterval(ligarBotao, 1000);
})();
