/* ====================================================================
 * TENKiTER — admin-postagens.js (v4.6) — ABA "POSTAGENS" (publicar no Instagram: Feed, Carrossel, Reels e Story)
 *  Escolhe a peça e as fotos, o tipo, "Original" ou "Template", escreve/ajusta a legenda e manda AGORA ou AGENDADO.
 *  Quem publica é o Worker `tenkiter-ig` (fila + cron de 1 min, no servidor — o celular pode ficar desligado). O Instagram NÃO aceita link em Story pela API:
 *  "Story com link" vira tarefa MANUAL (baixar a mídia, copiar legenda/link, postar no app do Instagram e marcar "Já postei").
 *  Fotos e templates são feitos no próprio aparelho (canvas -> JPEG) e sobem ao R2 (mesmo caminho do cadastro). Nada de senha/token no aparelho: só o login do painel.
 *  Quem usa: Admin total (gerir_acessos) OU quem cadastra peças (catalogo_cadastrar). Só liga se o Worker responde (INSTAGRAM_URL).
 * Carrega depois de admin-instagram.js e usa o que a página já tem (produtos, getSessao, usuarioAdmin, temPermissao, abrirComHistorico_, subirMidia_...).
 * ==================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => escaparHtml(v);
  const TIPOS = [['feed', '🖼️ Feed'], ['carrossel', '🗂️ Carrossel'], ['reels', '🎬 Reels'], ['story', '📱 Story']];
  /* Visuais que aparecem para cada tipo (configurável na aba ⚙️ Visuais; fica neste aparelho). */
  const semPrecoIds = {};   // peças marcadas “Sem preço — Consulte valor” (vale na arte e na legenda)
  const ehSemPreco_ = (p) => !!(p && semPrecoIds[String(p.ID)]);
  const CFG_VIS_KEY = 'tk_po_visuais_v1';
  function lerCfgVis_() { try { return JSON.parse(localStorage.getItem(CFG_VIS_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function salvarCfgVis_(c) { try { localStorage.setItem(CFG_VIS_KEY, JSON.stringify(c)); } catch (e) {} agendarEnvioVisuais_(); }
  const CUSTOM_KEY = 'tk_po_visuais_custom_v1', NOMES_KEY = 'tk_po_visuais_nomes_v1', CTA_KEY = 'tk_po_cta_v1', CTA_PADRAO = 'www.tenkitermodas.com.br';
  /* Sincronização com o servidor (Worker tenkiter-ig, /fotos/visuais): os visuais valem em todos os aparelhos. Sem a rota nova no Worker, segue só local. */
  const CHAVES_SYNC_ = ['tk_po_visuais_v1', 'tk_po_visuais_custom_v1', 'tk_po_visuais_nomes_v1', 'tk_po_cta_v1'];
  let sincTimer_ = null, sincAtivo_ = true;
  function agendarEnvioVisuais_() {
    if (!sincAtivo_) return; clearTimeout(sincTimer_);
    sincTimer_ = setTimeout(() => { const d = {}; CHAVES_SYNC_.forEach((k) => { try { d[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { d[k] = null; } }); ig('/fotos/visuais', 'POST', { dados: d }); }, 900);
  }
  async function puxarVisuais_() {
    const r = await ig('/fotos/visuais'); if (!r || !r.ok) { sincAtivo_ = false; return false; }
    if (r.dados && typeof r.dados === 'object') { CHAVES_SYNC_.forEach((k) => { try { if (r.dados[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(r.dados[k])); } catch (e) {} }); return true; }
    if (CHAVES_SYNC_.some((k) => { try { return !!localStorage.getItem(k); } catch (e) { return false; } })) agendarEnvioVisuais_();
    return false;
  }
  const lerJ_ = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } };
  const gravarJ_ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} if (CHAVES_SYNC_.indexOf(k) !== -1) agendarEnvioVisuais_(); };
  const lerCustom_ = () => { const l = lerJ_(CUSTOM_KEY, []); return Array.isArray(l) ? l.filter((c) => c && c.id && c.spec) : []; };
  const customPorId_ = (id) => lerCustom_().find((c) => c.id === id) || null;
  const ctaDoVisual_ = (id) => { const c = lerJ_(CTA_KEY, {}); return c && typeof c[id] === 'string' && c[id].trim() ? c[id].trim() : CTA_PADRAO; };
  function todosVisuais_() {
    const nomes = lerJ_(NOMES_KEY, {});
    return TEMPLATES.map((t) => [t[0], (nomes && nomes[t[0]]) || t[1]]).concat(lerCustom_().map((c) => [c.id, c.nome || 'Meu visual']));
  }
  function visuaisDoTipo_(tipo) {
    const todos = todosVisuais_(), c = lerCfgVis_()[tipo];
    if (!Array.isArray(c)) return todos;
    const l = todos.filter((t) => c.indexOf(t[0]) !== -1);
    return l.length ? l : todos;
  }
  const TEMPLATES = [['original', 'Original'], ['classico', '1 · Vitrine em arco'], ['promo', '2 · Preço em destaque'], ['minimal', '3 · Cartão central'], ['rodape', '4 · Faixa e detalhes'], ['lateral', '5 · Preço no canto'], ['cabecalho', '6 · Título grande'], ['energia', '7 · Laranja e detalhes'], ['blocos', '8 · Palavras empilhadas'], ['editorial', '9 · Editorial vertical'], ['cartao', '10 · Elegante']];
  const ST_TXT = { agendado: '⏳ Agendado', processando: '⚙️ Publicando…', manual_pendente: '✋ Falta você postar', manual_feito: '✅ Postado à mão', publicado: '✅ Publicado', erro: '⚠️ Deu problema', cancelado: 'Cancelado' };
  const HASHTAGS = '#tenkitermodas #modacrateus #crateús #lookdodia #modafeminina #modainfantil #modamasculina';
  let abaAtual = 'nova', fila = null, conectado = null, usuarioIg = '', pollTimer = null, ocupado = false, aviso = '', avisoErro = false;
  let nova = null, fotosNovas = null;
  let fotos = null, fotosFiltro = 'nova', fotosConta = {}, selFotos = new Set(), formFoto = { aberto: false, whats: '', ig: '', obs: '', msg: '', erro: false, ocupado: false };   // { p, midias:[{url,tipo,sel}], tipo, template, legenda, quando, data, manual, extras:[] }

  /* ---------- Worker ---------- */
  function sessao() { const s = typeof getSessao === 'function' ? getSessao() : null; return s && /^tk[12]\./.test(String(s.sessao)) ? s : null; }
  async function ig(caminho, metodo, corpo) {
    const s = sessao();
    if (!s) return { ok: false, erro: 'Entre com o seu login (não vale só o PIN) para usar esta tela.' };
    try {
      const r = await fetch(INSTAGRAM_URL + caminho, { method: metodo || 'GET', headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
      return await r.json();
    } catch (e) { return { ok: false, erro: 'Sem conexão agora. Tente de novo.', semRede: true }; }
  }
  const erroTxt = (r) => (r && r.erro) || 'Não foi possível agora. Tente de novo.';
  function podePostar() {
    try { return typeof temPermissao === 'function' && typeof usuarioAdmin !== 'undefined' && !!usuarioAdmin && (temPermissao(usuarioAdmin, 'gerir_acessos') || temPermissao(usuarioAdmin, 'catalogo_cadastrar')); } catch (e) { return false; }
  }

  /* ---------- estilo ---------- */
  function css() {
    if ($('po-css')) return;
    const s = document.createElement('style'); s.id = 'po-css';
    s.textContent = `
      .sheet-po { max-width: 760px; height: 94vh; max-height: 94vh; }
      #po-corpo { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 8px; }
      .po-abas { display: flex; gap: 6px; overflow-x: auto; margin: 0 0 10px; padding-bottom: 4px; }
      .po-abas button { flex: none; width: auto; padding: 9px 14px; border-radius: 999px; border: 1px solid #ddd; background: #fff; color: #222; font-size: 0.85rem; font-weight: 700; cursor: pointer; min-height: 44px; }
      .po-abas button[aria-selected="true"] { background: var(--laranja); border-color: var(--laranja); color: #0d0d0d; }
      .po-passo { border: 1px solid #e3e3e3; border-radius: 12px; background: #fff; padding: 10px 12px; margin: 0 0 10px; }
      .po-passo h4 { margin: 0 0 8px; font-size: 0.92rem; }
      .po-chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .po-chips button { width: auto; flex: none; padding: 9px 13px; border-radius: 999px; border: 1px solid #ccc; background: #fff; color: #222; font-size: 0.85rem; font-weight: 700; cursor: pointer; min-height: 44px; }
      .po-chips button[aria-pressed="true"] { background: var(--laranja); border-color: var(--laranja); color: #0d0d0d; }
      .po-lista-pecas { max-height: 220px; overflow-y: auto; border: 1px solid #eee; border-radius: 10px; margin-top: 8px; }
      .po-peca { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; background: #fff; border: 0; border-bottom: 1px solid #f0f0f0; padding: 8px 10px; cursor: pointer; min-height: 56px; color: #111; border-radius: 0; }
      .po-peca img { width: 40px; height: 50px; object-fit: cover; border-radius: 6px; background: #eee; flex: none; }
      .po-peca small { color: #555; display: block; }
      .po-escolhida { display: flex; gap: 10px; align-items: center; background: #fff3e0; border: 1px solid #ffcc80; border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; }
      .po-escolhida button { width: auto; flex: none; margin-left: auto; padding: 8px 12px; min-height: 40px; border-radius: 8px; border: 0; background: #eee; color: #222; cursor: pointer; }
      .po-midias { display: flex; gap: 6px; flex-wrap: wrap; }
      .po-m { position: relative; width: 78px; height: 98px; border-radius: 8px; overflow: hidden; border: 3px solid transparent; background: #eee; cursor: pointer; padding: 0; }
      .po-m[aria-pressed="true"] { border-color: var(--laranja); }
      .po-m img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .po-m .po-n { position: absolute; left: 3px; top: 3px; background: var(--laranja); color: #0d0d0d; font-weight: 800; font-size: 0.75rem; border-radius: 999px; min-width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; }
      .po-m .po-v { position: absolute; right: 3px; bottom: 3px; background: rgba(0,0,0,.75); color: #fff; font-size: 0.7rem; padding: 1px 6px; border-radius: 8px; }
      .po-sticky { padding: 4px 0 8px; }
      .po-chips-h { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 6px; -webkit-overflow-scrolling: touch; }
      .po-chips-h button { white-space: nowrap; min-height: 40px; padding: 7px 12px; }
      .po-previa-btn { width: auto; margin: 2px 0 4px; padding: 6px 12px; min-height: 36px; border-radius: 8px; border: 1px solid #ccc; background: #fff; font-size: .8rem; cursor: pointer; }
      .po-sticky .po-previa { flex-wrap: nowrap; overflow-x: auto; gap: 8px; justify-content: flex-start; }
      .po-sticky .po-previa canvas { width: auto; max-width: none; height: min(40vh, 380px); }
      .po-det { margin: 6px 0; border: 1px solid #e3e3e3; border-radius: 10px; padding: 0 10px; }
      .po-det > summary { cursor: pointer; font-weight: 700; font-size: .9rem; min-height: 44px; display: flex; align-items: center; }
      .po-it { margin: 0 0 8px; }
      .po-it-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .po-it-top label { font-weight: 700; font-size: .78rem; margin: 0; flex: none; color: #333; }
      .po-it-top input[type=range] { width: 46%; flex: none; margin: 0; }
      .po-it-row { display: flex; gap: 6px; align-items: center; }
      .po-it-row input[type=text] { flex: 1; width: auto; min-width: 0; min-height: 40px; padding: 6px 10px; }
      .po-it-row .po-oc { min-height: 40px; padding: 4px 10px; font-size: .75rem; white-space: nowrap; }
      .po-reset { width: auto; padding: 8px 14px; min-height: 40px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; font-size: .85rem; }
      .po-previa { display: flex; gap: 10px; flex-wrap: wrap; padding: 4px 0; }
      .po-previa canvas { width: calc(50% - 5px); max-width: 260px; height: auto; border-radius: 8px; border: 1px solid #ddd; background: #f4f4f4; flex: none; }
      .po-previa canvas.arrastando { outline: 3px solid var(--laranja); }
      .po-previa canvas.ativa { outline: 2px solid var(--laranja); outline-offset: 1px; }
      .po-zoom { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 4px 0 2px; }
      .po-zoom label { font-weight: 700; font-size: .9em; }
      .po-zoom input[type=range] { flex: 1 1 120px; width: auto; min-width: 100px; }
      .po-zoom button { width: auto; min-width: 44px; min-height: 44px; }
      .po-sheet textarea, .po-sheet input[type=datetime-local], .po-sheet input[type=search] { width: 100%; box-sizing: border-box; font-size: 1rem; padding: 10px; border: 1px solid #ccc; border-radius: 8px; }
      .po-sheet textarea { min-height: 150px; font-family: inherit; }
      .po-ajuda { font-size: 0.8rem; color: #444; margin: 6px 0 0; }
      .po-aviso { border-radius: 10px; padding: 9px 12px; margin: 0 0 10px; font-size: 0.9rem; background: #e8f5e9; border: 1px solid #a5d6a7; color: #1b4d1f; }
      .po-aviso.erro { background: #fde3e3; border-color: #f5b5b5; color: #8a1c1c; }
      .po-enviar { width: 100%; padding: 14px; border-radius: 10px; border: 0; background: var(--laranja); color: #0d0d0d; font-weight: 800; font-size: 1rem; cursor: pointer; min-height: 52px; }
      .po-enviar[disabled] { opacity: .55; cursor: wait; }
      .po-item { border: 1px solid #e3e3e3; border-radius: 12px; background: #fff; padding: 10px; margin: 0 0 10px; }
      .po-item .po-th { display: flex; gap: 4px; margin-bottom: 6px; }
      .po-item .po-th img { width: 52px; height: 65px; object-fit: cover; border-radius: 6px; background: #eee; }
      .po-item .po-meta { font-size: 0.8rem; color: #555; margin: 0 0 4px; overflow-wrap: anywhere; }
      .po-item .po-leg { font-size: 0.85rem; margin: 0 0 6px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
      .po-st { font-weight: 800; font-size: 0.85rem; margin-bottom: 4px; }
      .po-st.erro { color: #8a1c1c; } .po-st.ok { color: #1b5e20; }
      .po-erro { background: #fde3e3; border: 1px solid #f5b5b5; color: #8a1c1c; border-radius: 8px; padding: 6px 9px; font-size: 0.82rem; margin: 4px 0 6px; }
      .po-acoes { display: flex; gap: 8px; flex-wrap: wrap; }
      .po-acoes button, .po-acoes a { width: auto; flex: none; padding: 10px 14px; border-radius: 8px; border: 0; font-size: 0.85rem; min-height: 44px; cursor: pointer; background: #eee; color: #222; text-decoration: none; display: inline-flex; align-items: center; font-weight: 700; box-sizing: border-box; }
      .po-acoes .po-ok { background: var(--laranja); color: #0d0d0d; } .po-acoes .po-ruim { background: #fde3e3; color: #8a1c1c; }
      .po-lista-pecas { max-height: none; }
      .po-grade { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-height: calc(94vh - 300px); min-height: 280px; overflow-y: auto; padding: 4px; border: 1px solid #eee; border-radius: 10px; margin-top: 8px; -webkit-overflow-scrolling: touch; }
      .po-card { position: relative; display: flex; flex-direction: column; gap: 4px; text-align: left; background: #fff; border: 2px solid #e6e6e6; border-radius: 10px; padding: 6px; cursor: pointer; color: #111; width: auto; min-height: 44px; }
      .po-card[aria-pressed="true"] { border-color: var(--laranja); background: #fff3e0; }
      .po-card img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 7px; background: #eee; }
      .po-card b { font-size: .8rem; line-height: 1.15; overflow-wrap: anywhere; } .po-card small { color: #555; font-size: .72rem; }
      .po-card .po-ck { position: absolute; left: 10px; top: 10px; width: 24px; height: 24px; border-radius: 6px; background: #fff; border: 2px solid #999; display: inline-flex; align-items: center; justify-content: center; font-weight: 900; font-size: .9rem; }
      .po-card[aria-pressed="true"] .po-ck { background: var(--laranja); border-color: var(--laranja); color: #0d0d0d; }
      .po-barra-sel { position: sticky; bottom: 0; background: #fff; padding: 8px 0 2px; display: flex; gap: 8px; flex-wrap: wrap; z-index: 2; }
      .po-barra-sel button { flex: 1 1 140px; }
      .po-filtros { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 6px 0; }
      .po-filtros select { flex: 1 1 140px; min-height: 44px; font-size: .9rem; padding: 6px 8px; border-radius: 8px; border: 1px solid #ccc; background: #fff; }
      .po-oc { width: auto; flex: none; min-height: 44px; padding: 6px 12px; border-radius: 8px; border: 1px solid #ccc; background: #fff; color: #222; font-size: .8rem; font-weight: 700; cursor: pointer; }
      .po-oc[aria-pressed="true"] { background: #333; color: #fff; border-color: #333; }
      .po-presets button { font-size: .78rem; padding: 8px 10px; }
      .po-passos-man { background: #fff3e0; border: 1px solid #ffcc80; border-radius: 10px; padding: 8px 10px; font-size: 0.85rem; margin: 6px 0; }
      .po-passos-man ol { margin: 4px 0 0; padding-left: 20px; }
    `;
    document.head.appendChild(s);
  }

  /* ---------- janela ---------- */
  function montar() {
    if ($('overlay-postagens')) return;
    css();
    const o = document.createElement('div');
    o.className = 'overlay-sheet'; o.id = 'overlay-postagens';
    o.innerHTML = '<div class="sheet sheet-po po-sheet" role="dialog" aria-modal="true" aria-labelledby="po-titulo">' +
      '<div class="sheet-topo"><h3 id="po-titulo" style="margin:0;">📸 Postagens no Instagram</h3><button type="button" class="btn-fechar" id="po-fechar" aria-label="Fechar">✕</button></div>' +
      '<div class="po-abas" role="tablist" id="po-abas"></div><div id="po-corpo"></div></div>';
    document.body.appendChild(o);
    $('po-fechar').addEventListener('click', fechar);
    ligarConfigVisuais_();
    $('po-corpo').addEventListener('change', (ev) => {
      const sp = ev.target.closest && ev.target.closest('[data-sp]');
      if (sp) { const id = sp.dataset.sp; if (sp.checked) semPrecoIds[id] = true; else delete semPrecoIds[id]; if (nova && nova.p && !nova.legendaMexida) nova.legenda = legendaPadrao(); if (nova) nova.previa = false; return desenhar(); }
      const cb = ev.target.closest && ev.target.closest('[data-cv-tipo]'); if (!cb) return;
      const tipo = cb.dataset.cvTipo, c = lerCfgVis_();
      const marcados = Array.from(document.querySelectorAll('[data-cv-tipo="' + tipo + '"]')).filter((x) => x.checked).map((x) => x.dataset.cvId);
      if (!marcados.length) { cb.checked = true; return; }
      c[tipo] = marcados; salvarCfgVis_(c);
    });
    $('po-abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) { abaAtual = b.dataset.aba; aviso = ''; desenhar(); if (abaAtual === 'fotos') carregarFotos(); else if (abaAtual !== 'nova') carregarFila(); } });
    $('po-corpo').addEventListener('click', clique);
    $('po-corpo').addEventListener('input', entrada);
    $('po-corpo').addEventListener('toggle', (e) => { if (e.target && e.target.id === 'po-det' && nova) nova.detTx = e.target.open; }, true);
    document.addEventListener('tk:camada-fechada', (ev) => { if (ev.detail.chave === 'overlay-postagens') parar(); });
  }
  function fechar() { parar(); fecharComHistorico_('overlay-postagens'); }
  function parar() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  async function abrir() {
    montar();
    abrirComHistorico_('overlay-postagens');
    if (!nova) novaVazia();
    desenhar();
    puxarVisuais_().then((mudou) => { if (mudou && (abaAtual === 'nova' || abaAtual === 'config')) desenhar(); });
    await carregarFila(); carregarFotos(true);
    parar(); pollTimer = setInterval(() => { if ($('overlay-postagens').classList.contains('aberto') && abaAtual !== 'nova' && !ocupado) carregarFila(true); }, window.TK_POSTAGENS_POLL_MS || 15000);
  }
  function novaVazia(lote) { nova = { lote: lote || (nova && nova.lote) || [], modoLivre: false, modoCli: false, tx: {}, tam: {}, ajuste: 'preencher', livre: [], seqAgenda: true, link: '', p: null, midias: [], tipo: 'feed', template: 'classico', legenda: '', quando: 'agora', data: '', manual: false, busca: '', legendaMexida: false, previa: false, oculto: {}, preset: {}, fg: '', fc: '', selPecas: [] }; }

  async function carregarFila(silencioso) {
    const r = await ig('/posts'), antes = JSON.stringify([fila, conectado, usuarioIg]);
    if (r && r.ok) { fila = r.posts || []; conectado = !!r.conectado; usuarioIg = r.usuario || ''; }
    else if (!silencioso) { fila = []; aviso = erroTxt(r); avisoErro = true; }
    if (silencioso && antes === JSON.stringify([fila, conectado, usuarioIg])) return;     // nada mudou: não refaz a tela (senão some a foto que a pessoa acabou de escolher)
    desenhar();
  }


  /* ---------- fotos de clientes ---------- */
  async function carregarFotos(silencioso) {
    const r = await ig('/fotos?status=' + encodeURIComponent(fotosFiltro) + '&limite=80');
    if (r && r.ok) { fotos = r.fotos || []; fotosConta = r.contagens || {}; }
    else if (!silencioso) { fotos = fotos || []; aviso = erroTxt(r); avisoErro = true; }
    desenhar();
  }
  function whatsBonito(w) { const d = String(w || '').replace(/\D/g, ''); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d.length === 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6) : d; }
  function htmlFotos() {
    const f = formFoto, c = fotosConta || {};
    let h = '<div class="po-chips" role="group" aria-label="Filtrar fotos" style="margin-bottom:8px">' + [['nova', 'Novas'], ['usada', 'Já usadas'], ['descartada', 'Descartadas']].map((x) => '<button type="button" data-ff="' + x[0] + '" aria-pressed="' + (fotosFiltro === x[0]) + '">' + x[1] + (c[x[0]] ? ' (' + c[x[0]] + ')' : '') + '</button>').join('') +
      '<button type="button" data-a="fotoform" style="background:#fde7f3;border-color:#c13584">➕ Adicionar foto recebida</button></div>';
    if (f.aberto) h += '<div class="po-passo" style="border-color:#c13584"><h4>➕ Foto que um cliente mandou</h4>' +
      '<label for="po-f-arq" class="po-ajuda" style="font-weight:700;margin:0 0 4px;display:block">Foto(s) (JPG, PNG ou WEBP)</label><input type="file" id="po-f-arq" accept="image/jpeg,image/png,image/webp,image/*" multiple>' +
      '<label for="po-f-whats" class="po-ajuda" style="font-weight:700;margin:8px 0 2px;display:block">WhatsApp de quem mandou (com DDD)</label><input type="tel" id="po-f-whats" value="' + esc(f.whats) + '" placeholder="(88) 99999-9999" autocomplete="off">' +
      '<label for="po-f-ig" class="po-ajuda" style="font-weight:700;margin:8px 0 2px;display:block">Instagram (se não tiver o WhatsApp)</label><input type="text" id="po-f-ig" value="' + esc(f.ig) + '" placeholder="@usuario" autocomplete="off" autocapitalize="none">' +
      '<label for="po-f-obs" class="po-ajuda" style="font-weight:700;margin:8px 0 2px;display:block">Observação (opcional)</label><input type="text" id="po-f-obs" value="' + esc(f.obs) + '" maxlength="300" autocomplete="off">' +
      '<p class="po-ajuda"><b>Obrigatório:</b> o WhatsApp <b>ou</b> o Instagram (pelo menos um). Se o WhatsApp já tem cadastro no site, a foto é ligada à conta sozinha. Se só tiver o Instagram e já houve foto dessa pessoa, uso os mesmos dados.</p>' +
      (f.msg ? '<div class="po-aviso' + (f.erro ? ' erro' : '') + '" role="status">' + esc(f.msg) + '</div>' : '') +
      '<button type="button" class="po-enviar" data-a="fotosalvar"' + (f.ocupado ? ' disabled' : '') + '>' + (f.ocupado ? 'Enviando…' : 'Salvar foto(s)') + '</button></div>';
    if (fotos === null) return h + '<p class="po-ajuda">Carregando…</p>';
    if (!fotos.length) return h + '<p class="po-ajuda">' + ({ nova: 'Nenhuma foto nova. Os clientes mandam pela conta deles no site, e você também pode adicionar as que chegam pelo WhatsApp.', usada: 'Nenhuma foto usada ainda.', descartada: 'Nenhuma foto descartada.' }[fotosFiltro]) + '</p>';
    h += fotos.map((x) => '<div class="po-item" data-fid="' + x.id + '"><div style="display:flex;gap:10px;align-items:flex-start">' +
      '<label style="display:flex;align-items:center;min-height:44px;min-width:32px"><input type="checkbox" data-fsel="' + x.id + '"' + (selFotos.has(x.id) ? ' checked' : '') + ' aria-label="Escolher a foto de ' + esc(x.nome || x.instagram || x.whats || 'cliente') + '"></label>' +
      '<a href="' + esc(x.url) + '" target="_blank" rel="noopener" aria-label="Abrir a foto inteira"><img src="' + esc(x.url) + '" alt="" loading="lazy" style="width:72px;height:96px;object-fit:cover;border-radius:8px;background:#eee"></a>' +
      '<div style="flex:1;min-width:0"><div class="po-st">' + esc(x.nome || (x.vinculo === 'nenhum' ? 'Sem cadastro' : 'Cliente')) + '</div>' +
      '<p class="po-meta">' + (x.whats ? '📱 ' + esc(whatsBonito(x.whats)) : '') + (x.instagram ? ' · 📷 @' + esc(x.instagram) : '') + '</p>' +
      '<p class="po-meta">' + (x.origem === 'cliente' ? '🧡 Enviada pelo cliente no site' : '👤 Anexada pela equipe' + (x.criadoPor ? ' (' + esc(x.criadoPor) + ')' : '')) + ' · ' + ({ conta: 'ligada à conta', historico: 'dados de foto anterior', nenhum: 'só com os dados informados' }[x.vinculo] || '') + '</p>' +
      (x.obs ? '<p class="po-leg">“' + esc(x.obs) + '”</p>' : '') + '</div></div>' +
      '<div class="po-acoes" style="margin-top:6px">' + (fotosFiltro === 'nova' ? '<button type="button" class="po-ruim" data-fa="descartar" data-id="' + x.id + '">Descartar</button>' : '<button type="button" data-fa="restaurar" data-id="' + x.id + '">Voltar para novas</button>') + '</div></div>').join('');
    if (selFotos.size) h += '<div style="position:sticky;bottom:0;background:#fff;padding:8px 0"><button type="button" class="po-enviar" data-a="fotousar">📱 Colocar ' + selFotos.size + ' na fila de Story</button></div>';
    return h;
  }
  function reduzirFoto(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { try { const r = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r)); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); let q = 0.86; const t = () => c.toBlob((b) => { if (!b) { URL.revokeObjectURL(url); rej(new Error('Não consegui preparar a foto.')); return; } if (b.size > 2.4 * 1048576 && q > 0.5) { q -= 0.12; t(); return; } URL.revokeObjectURL(url); res(b); }, 'image/jpeg', q); t(); } catch (e) { URL.revokeObjectURL(url); rej(new Error('Não consegui preparar a foto.')); } };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não consegui abrir ' + (file.name || 'a foto') + '. Use JPG, PNG ou WEBP.')); };
      img.src = url;
    });
  }
  async function salvarFotosEquipe() {
    const f = formFoto, arq = $('po-f-arq'), lista = arq && arq.files ? Array.from(arq.files) : [], s = sessao();
    const whats = String(f.whats || '').replace(/\D/g, ''), ig2 = String(f.ig || '').trim();
    const falha = (t) => { f.msg = t; f.erro = true; desenhar(); };
    if (!lista.length) return falha('Escolha a foto.');
    if (!whats && !ig2) return falha('Coloque o WhatsApp ou o Instagram de quem mandou a foto (pelo menos um).');
    if (whats && whats.length < 10) return falha('WhatsApp incompleto: coloque com DDD (ex.: 88 99999-9999).');
    if (!s) return falha('Entre com o seu login para anexar a foto.');
    f.ocupado = true; f.msg = ''; desenhar();
    let ok = 0, ultimo = null, erro = '';
    for (const file of lista) {
      try {
        const blob = await reduzirFoto(file);
        const q = '?whats=' + encodeURIComponent(whats) + '&ig=' + encodeURIComponent(ig2) + '&obs=' + encodeURIComponent(f.obs || '') + '&por=' + encodeURIComponent((typeof funcionarioNome !== 'undefined' ? funcionarioNome : '') || '');
        const r = await fetch(INSTAGRAM_URL + '/fotos/nova' + q, { method: 'POST', headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao, 'Content-Type': 'image/jpeg' }, body: blob });
        const j = await r.json(); if (r.ok && j && j.ok) { ok++; ultimo = j; } else { erro = (j && j.erro) || 'Não consegui enviar agora.'; break; }
      } catch (e) { erro = (e && e.message) || 'Sem conexão agora. Tente de novo.'; break; }
    }
    f.ocupado = false;
    if (erro && !ok) return falha(erro);
    const vinc = ultimo ? ({ conta: 'Ligada à conta de ' + (ultimo.nome || 'cliente') + '.', historico: 'Usei os dados de uma foto anterior' + (ultimo.nome ? ' (' + ultimo.nome + ')' : '') + '.', nenhum: 'Salva só com os dados informados (não achei cadastro).' }[ultimo.vinculo] || '') : '';
    f.msg = ok + (ok > 1 ? ' fotos salvas. ' : ' foto salva. ') + vinc + (erro ? ' Parei em um erro: ' + erro : ''); f.erro = !!erro; f.whats = ''; f.ig = ''; f.obs = '';
    fotosFiltro = 'nova'; await carregarFotos(true);
  }
  function fotoParaLivre(x) { return { fotoId: x.id, tipo: 'imagem', url: x.url, nome: (x.nome || (x.instagram ? '@' + x.instagram : '') || whatsBonito(x.whats) || 'Cliente'), hora: '', pos: {} }; }
  function usarFotos() {
    const ids = Array.from(selFotos), escolhidas = (fotos || []).filter((x) => ids.indexOf(x.id) !== -1);
    if (!escolhidas.length) return;
    if (!nova) novaVazia();
    if (!nova.modoCli) { nova.livre.forEach((m) => { try { if (!m.fotoId) URL.revokeObjectURL(m.url); } catch (e) {} }); nova.livre = []; }
    nova.modoCli = true; nova.modoLivre = false; nova.p = null; nova.midias = []; nova.tipo = 'story'; nova.template = 'elausa'; nova.manual = false; nova.previa = false;
    escolhidas.forEach((x) => { if (!nova.livre.some((m) => m.fotoId === x.id)) nova.livre.push(fotoParaLivre(x)); });
    selFotos.clear(); abaAtual = 'nova'; carregarFotosNovas(); aviso = escolhidas.length + (escolhidas.length > 1 ? ' fotos prontas' : ' foto pronta') + ' para o Story. Ajuste o texto, arraste na foto e escolha o horário.'; avisoErro = false; desenhar();
  }

  /* ---------- peças e mídia ---------- */
  function pecasAtivas() {
    let l = []; try { l = (typeof produtos !== 'undefined' && Array.isArray(produtos)) ? produtos : []; } catch (e) { l = []; }
    return l.filter((p) => !(typeof ehInativo_ === 'function' && ehInativo_(p)));
  }
  function semAc(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function midiasDaPeca(p) {
    const fotos = [String(p.Foto_URL || '').trim()].concat(String(p.Fotos_Galeria || '').split(',').map((x) => x.trim())).filter((u) => /^https:\/\//i.test(u));
    const out = fotos.slice(0, 10).map((u) => ({ url: u, tipo: 'imagem', sel: true }));
    const v = String(p.Video_URL || '').trim();
    if (/^https:\/\//i.test(v) && typeof ehVideoDireto === 'function' && ehVideoDireto(v)) out.push({ url: v, tipo: 'video', sel: false });
    return out;
  }
  function escolherPeca(id) {
    const p = pecasAtivas().find((x) => String(x.ID) === String(id)); if (!p) return;
    nova.p = p; nova.midias = midiasDaPeca(p); nova.legendaMexida = false; nova.previa = false; ajustarSelecao(); nova.legenda = legendaPadrao(); desenhar();
  }
  function ajustarSelecao() {
    const m = nova.midias, sel = m.filter((x) => x.sel);
    if (nova.tipo === 'feed') { let achou = false; m.forEach((x) => { x.sel = x.tipo === 'imagem' && x.sel && !achou ? (achou = true) : false; }); if (!achou) { const f = m.find((x) => x.tipo === 'imagem'); if (f) f.sel = true; } }
    else if (nova.tipo === 'reels') { const v = m.find((x) => x.tipo === 'video'); m.forEach((x) => { x.sel = x === v; }); }
    else if (nova.tipo === 'carrossel') { if (sel.length < 2) m.filter((x) => x.tipo === 'imagem').slice(0, 10).forEach((x) => { x.sel = true; }); let n = 0; m.forEach((x) => { if (x.sel && ++n > 10) x.sel = false; }); }
    else if (nova.tipo === 'story') { if (!sel.length) m.filter((x) => x.tipo === 'imagem').slice(0, 3).forEach((x) => { x.sel = true; }); }
  }
  function precoAvista(p) { return Number(p.Preco) * (1 - DESCONTO_AVISTA); }
  function legendaPadrao() {
    const p = nova.p; if (!p) return '';
    const l = [String(p.Nome || '').trim(), ''];
    if (ehSemPreco_(p)) l.push('💰 Consulte valor pelo WhatsApp');
    else if (Number(p.Preco) > 0) l.push('💰 ' + formatarReal(precoAvista(p)) + ' à vista (10% de desconto) · ' + formatarReal(p.Preco) + ' no cartão');
    const tam = typeof textoPlano === 'function' ? textoPlano(p.Tamanhos) : p.Tamanhos; if (String(tam || '').trim()) l.push('📏 Tamanhos: ' + String(tam).trim());
    l.push('🛍️ Código: ' + (p.Codigo || ''), '📍 Rua Dr. Moreira da Rocha 759, Crateús-CE', '👉 ' + linkProduto(p), '', HASHTAGS);
    return l.join('\n');
  }

  /* ---------- desenho ---------- */
  function desenhar() {
    const abas = $('po-abas'), corpo = $('po-corpo'); if (!abas || !corpo) return;
    const nMan = (fila || []).filter((x) => x.status === 'manual_pendente').length, nFila = (fila || []).filter((x) => ['agendado', 'processando', 'erro'].indexOf(x.status) !== -1).length;
    abas.innerHTML = [['nova', 'Nova postagem'], ['fila', 'Fila' + (nFila ? ' (' + nFila + ')' : '')], ['manual', 'Postar à mão' + (nMan ? ' (' + nMan + ')' : '')], ['fotos', 'Fotos de clientes' + (fotosConta.nova ? ' (' + fotosConta.nova + ')' : '')], ['hist', 'Já postadas'], ['config', '⚙️ Visuais']]
      .map((a) => '<button type="button" role="tab" data-aba="' + a[0] + '" aria-selected="' + (abaAtual === a[0]) + '">' + esc(a[1]) + '</button>').join('');
    const topo = (aviso ? '<div class="po-aviso' + (avisoErro ? ' erro' : '') + '" role="status">' + esc(aviso) + '</div>' : '') +
      (conectado === false ? '<div class="po-aviso erro">O Instagram não está conectado. Só o Admin total conecta (Conexões → Instagram). Enquanto isso, só dá para preparar Story com link para postar à mão.</div>' : '');
    const chipsAntes = corpo.querySelector('.po-chips-h'), rolou = chipsAntes ? chipsAntes.scrollLeft : 0;
    corpo.innerHTML = topo + (abaAtual === 'nova' ? htmlNova() : abaAtual === 'fila' ? htmlFila(['agendado', 'processando', 'erro'], 'Nada na fila agora.') : abaAtual === 'manual' ? htmlManual() : abaAtual === 'fotos' ? htmlFotos() : abaAtual === 'config' ? htmlConfigVisuais_() : htmlFila(['publicado', 'manual_feito'], 'Ainda não há postagens feitas por aqui.'));
    const chipsDepois = corpo.querySelector('.po-chips-h');
    if (chipsDepois) { chipsDepois.scrollLeft = rolou; const sel = chipsDepois.querySelector('[aria-pressed="true"]'); if (sel) { const a = sel.offsetLeft, b = a + sel.offsetWidth; if (a < chipsDepois.scrollLeft || b > chipsDepois.scrollLeft + chipsDepois.clientWidth) chipsDepois.scrollLeft = a - 12; } }
    if (abaAtual === 'config') setTimeout(pintarAbertas_, 0);
    if (abaAtual === 'nova' && nova && nova.p !== undefined && deveMostrarPrevia()) pintarPrevia();
  }
  /* ---------- aba ⚙️ Visuais: cards por tipo, editor de cada visual (campos + código) com prévia ao vivo ---------- */
  const vzTrab = {}, vzAbertos = {};
  const FUNDOS_OK = ['foto', 'baixo', 'baixo-leve', 'ambos', 'topo', 'baixo-dir', 'direita', 'rodape', 'energia', 'arte'];
  const INFO_AMOSTRA = { nome: 'Vestido Longo Floral', avista: 'R$ 89,90', cheio: 'R$ 99,89', codigo: 'TK-0000', tam: 'P, M, G', cores: 'Branco, preto', cat: 'Vestidos', gen: 'Feminino Adulto', comLink: false, semPreco: false };
  const INFO_MOLDE = { nome: '{nome}', avista: '{avista}', cheio: '{cheio}', codigo: '{codigo}', tam: '{tam}', cores: '{cores}', cat: '{cat}', gen: '{gen}', comLink: false, semPreco: false };
  const CAMPOS_NOVOS = [['extra', 'Texto extra (livre)', 'Seu texto'], ['nome', 'Nome da peça', '{nome}'], ['preco', 'Preço', '{avista} à vista'], ['codigo', 'Código', 'Código {codigo}'], ['tam', 'Tamanhos', 'Tamanhos: {tam}'], ['cores', 'Cores', 'Cores: {cores}'], ['cat', 'Categoria e gênero', '{cat} · {gen}'], ['zona', 'Botão / zona do link', 'Compre online']];
  const novoIdVisual_ = () => 'c_' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  function validarSpec_(sp) {
    if (!sp || typeof sp !== 'object' || Array.isArray(sp)) return 'O código precisa ser um objeto { … }.';
    if (sp.camadas !== undefined) return validarCamadas_(sp);
    if (!Array.isArray(sp.grupos) || !sp.grupos.length) return 'Falta a lista "grupos" (pelo menos 1).';
    if (!Array.isArray(sp.itens) || !sp.itens.length) return 'Falta a lista "itens" (pelo menos 1 campo).';
    const ids = sp.grupos.map((g) => g && g.id);
    if (ids.some((x) => !x)) return 'Todo grupo precisa de "id".';
    for (let i = 0; i < sp.itens.length; i++) { const it = sp.itens[i]; if (!it || !it.k) return 'O campo ' + (i + 1) + ' precisa de "k" (um nome curto único).'; if (ids.indexOf(it.grp) === -1) return 'O campo "' + it.k + '" aponta para um grupo que não existe ("' + it.grp + '").'; }
    const ks = sp.itens.map((it) => it.k); if (ks.some((k, i) => ks.indexOf(k) !== i)) return 'Dois campos com o mesmo "k".';
    if (sp.fundo && FUNDOS_OK.indexOf(sp.fundo) === -1) return 'Fundo inválido. Use: ' + FUNDOS_OK.join(', ') + '.';
    if (sp.fundo === 'arte' && !ARTES[sp.base]) return 'Fundo "arte" precisa de "base" com o id de um visual pronto (ex.: classico).';
    return '';
  }
  function validarCamadas_(sp) {
    if (!Array.isArray(sp.camadas)) return 'A lista "camadas" precisa ser uma lista [ … ].';
    if (sp.fundo && FUNDOS_OK.indexOf(sp.fundo) === -1) return 'Fundo inválido. Use: ' + FUNDOS_OK.join(', ') + '.';
    if (sp.fundo === 'arte' && !ARTES[sp.base]) return 'Fundo "arte" precisa de "base" com o id de um visual pronto (ex.: classico).';
    const ks = {}, num = (v) => typeof v === 'number' && isFinite(v);
    for (let i = 0; i < sp.camadas.length; i++) {
      const c = sp.camadas[i], n = 'A camada ' + (i + 1) + (c && c.k ? ' ("' + c.k + '")' : '');
      if (!c || typeof c !== 'object') return n + ' não é um objeto { … }.';
      if (!c.k || typeof c.k !== 'string' || !/^[a-z0-9_]{1,30}$/.test(c.k)) return n + ' precisa de "k" único (minúsculas, números e _, sem espaço).';
      if (ks[c.k]) return 'Duas camadas com o mesmo "k": "' + c.k + '".'; ks[c.k] = 1;
      if (c.tipo !== 'texto' && c.tipo !== 'forma') return n + ': "tipo" precisa ser "texto" ou "forma".';
      if (!num(c.x) || !num(c.y) || !num(c.w) || !num(c.h)) return n + ' precisa de números em x, y, w e h.';
      if (c.w <= 0 || c.h <= 0 || c.w > 4 || c.h > 4) return n + ': w e h precisam ficar entre 0 e 4 (fração da largura).';
      if (c.tipo === 'texto') { if (typeof c.t !== 'string') return n + ' precisa de "t" (o texto, entre aspas).'; if (c.tam != null && (!num(c.tam) || c.tam < 8 || c.tam > 500)) return n + ': "tam" precisa ficar entre 8 e 500.'; }
      else if (c.forma && ['ret', 'elipse', 'linha'].indexOf(c.forma) === -1) return n + ': "forma" precisa ser ret, elipse ou linha.';
      if (c.giro != null && !num(c.giro)) return n + ': "giro" precisa ser número (graus).';
    }
    return '';
  }
  const EDT = { sel: {}, drag: null };
  function edE_(id) { return EDT.sel[id] || (EDT.sel[id] = { sel: '', fmt: 'feed', guia: null }); }
  function formatarSpec_(spec) {
    const o = Object.assign({ _guia: GUIA_CODIGO }, spec), partes = [];
    Object.keys(o).forEach((k) => {
      if (k === 'camadas') partes.push(' "camadas": [\n' + o.camadas.map((c) => '  ' + JSON.stringify(c)).join(',\n') + '\n ]');
      else if (k === '_guia') partes.push(' "_guia": [\n' + o._guia.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n ]');
      else partes.push(' ' + JSON.stringify(k) + ': ' + JSON.stringify(o[k]));
    });
    return '{\n' + partes.join(',\n') + '\n}';
  }
  function promptIA_(id) {
    return 'Você vai editar o código de um visual de postagem do Instagram da TENKiTER Modas. Leia o guia dentro do JSON, aplique SÓ o pedido no final e devolva o JSON inteiro, válido, sem explicações.\n\nCÓDIGO ATUAL:\n' + formatarSpec_(vzTrab[id].spec) + '\n\nPEDIDO: (escreva aqui o que quer mudar)';
  }
  function novoSpecCamadas_() {
    return { versao: 2, fundo: 'baixo', camadas: [
      { k: 'faixa', tipo: 'forma', rot: 'Faixa laranja', forma: 'ret', x: 0.5, y: 0.905, w: 1, h: 0.13, cor: '#E67E22', opac: 0.95 },
      { k: 'nome', tipo: 'texto', rot: 'Nome da peça', papel: 'nome', t: '{nome}', x: 0.5, y: 0.79, w: 0.88, h: 0.15, tam: 66, cor: '#F5F1E8', peso: 'bold', al: 'center', linhas: 2, max: 40, sombra: true },
      { k: 'preco', tipo: 'texto', rot: 'Preço', papel: 'preco', t: '{avista} à vista', x: 0.5, y: 0.905, w: 0.9, h: 0.1, tam: 78, cor: '#0d0d0d', peso: 'bold', al: 'center', linhas: 1, max: 16, sombra: false },
      { k: 'zona', tipo: 'texto', rot: 'Botão / zona do link', papel: 'zona', t: 'Compre online', x: 0.5, y: 0.69, w: 0.6, h: 0.07, tam: 36, cor: '#0d0d0d', peso: 'bold', al: 'center', linhas: 1, max: 26, bg: '#E67E22', raio: 40, sombra: false }
    ] };
  }
  function converterParaCamadas_(spec) {
    const raw = JSON.parse(JSON.stringify(spec)), W = 1080, H = 1350, sub = especCustom_({ spec: JSON.parse(JSON.stringify(spec)) }, INFO_AMOSTRA);
    const lista = layoutItens(sub, W, H, {}), cams = [], papeis = ['nome', 'preco', 'codigo', 'tam', 'cores', 'cat', 'zona', 'selo'], f = (n) => Math.round(n * 10000) / 10000; let n = 0;
    lista.forEach((it) => {
      if (it.deco === 'caixa') { cams.push({ k: 'caixa' + (++n), tipo: 'forma', rot: 'Caixa ' + n, forma: 'ret', x: f((it.x0 + it.x1) / 2 / W), y: f((it.y0 + it.y1) / 2 / H), w: f((it.x1 - it.x0) / W), h: f((it.y1 - it.y0) / W), cor: it.cx.cor, raio: it.cx.r || 0, sombra: !!it.cx.sombra }); return; }
      const r = it.r, m = it.m, ri = raw.itens.find((q) => q.k === it.k) || it, cx = (r.x0 + r.x1) / 2 / W, cy = (r.y0 + r.y1) / 2 / H;
      if (it.bg) cams.push({ k: 'fundo_' + it.k, tipo: 'forma', rot: 'Fundo de ' + (it.rot || it.k), forma: 'ret', x: f(cx), y: f(cy), w: f((r.x1 - r.x0) / W), h: f((r.y1 - r.y0) / W), cor: it.bg, raio: Math.round((it.radius || 0) * m.tam * 2) });
      const al = it.alinhaTexto || (it.wz ? (it.txtAl || 'center') : (it.bg ? 'center' : (it.ial || 'left'))), papel = papeis.indexOf(it.k) !== -1 ? it.k : 'extra';
      cams.push({ k: String(it.k).toLowerCase().replace(/[^a-z0-9_]/g, '') || 'txt' + (++n), tipo: 'texto', rot: it.rot || it.k, papel: papel, t: ri.t, x: f(cx), y: f(cy), w: f(Math.min(1.2, (r.x1 - r.x0) / W * (it.wz ? 1 : 1.08) + (it.wz ? 0 : 0.01))), h: f((r.y1 - r.y0) / W), tam: Math.round(m.tam), cor: it.cor || '#ffffff', peso: it.peso || 'bold', al: al, linhas: Math.max(it.linhas || 1, (m.linhas || []).length || 1), max: Number(it.max) || MAX_PADRAO[papel] || 60, sombra: !!it.sombra });
    });
    const out = { versao: 2, fundo: raw.fundo || 'foto', camadas: cams }; if (raw.base) out.base = raw.base; return out;
  }
  function trabDe_(id) {
    if (!vzTrab[id]) { const c = customPorId_(id); if (!c) return null; vzTrab[id] = { nome: c.nome, spec: JSON.parse(JSON.stringify(c.spec)), erro: '' }; }
    return vzTrab[id];
  }
  function especDoCard_(id) {
    const tr = vzTrab[id];
    if (tr) { const r = especCustom_({ spec: tr.spec }, INFO_AMOSTRA); if (tr.spec.base) r.base = tr.spec.base; return posEspec_(r, INFO_AMOSTRA, id); }
    return especTemplate(id, INFO_AMOSTRA, 1080, 1350);
  }
  function fotoAmostra_() {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, '#e8d5c4'); g.addColorStop(1, '#9c7b64'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(540, 520, 190, 250, 0, 0, 7); x.fill(); x.fillRect(380, 700, 320, 560);
    return c;
  }
  async function pintarAmostra_(id) {
    if (vzTrab[id] && vzTrab[id].spec && vzTrab[id].spec.camadas) return pintarEditor_(id);
    const cv = document.querySelector('[data-vz-cv="' + id + '"]'); if (!cv) return;
    try {
      await carregarFontes_();
      cv.width = 1080; cv.height = 1350; const x = cv.getContext('2d');
      if (id === 'original') { x.drawImage(fotoAmostra_(), 0, 0); return; }
      const sp = especDoCard_(id); if (!sp) return;
      sp.itens = sp.itens.map((it) => Object.assign({ mult: 1 }, it));
      const ef = { fundo: sp.fundo, arteBase: sp.base, lista: layoutItens(sp, 1080, 1350, {}) };
      desenharTemplate(x, fotoAmostra_(), 1080, 1350, id, ef, 'preencher');
      const erro = document.querySelector('[data-vz-erro="' + id + '"]'); if (erro && vzTrab[id]) erro.textContent = vzTrab[id].erro || '';
    } catch (e) { const erro = document.querySelector('[data-vz-erro="' + id + '"]'); if (erro) erro.textContent = 'Não consegui desenhar: ' + (e && e.message ? e.message : e); }
  }

  /* ---------- editor visual (camadas): prévia com seleção, alças, painel de propriedades, lista de camadas, código ↔ visual ---------- */
  const fotoAmostraCache_ = {};
  function fotoAmostraUma_() { return fotoAmostraCache_.c || (fotoAmostraCache_.c = fotoAmostra_()); }
  function edTam_(id) { return edE_(id).fmt === 'story' ? [1080, 1920] : [1080, 1350]; }
  function edCam_(id) { const tr = vzTrab[id]; return tr && tr.spec.camadas ? tr.spec.camadas.find((c) => c.k === edE_(id).sel) : null; }
  const arred_ = (v) => Math.round(v * 10000) / 10000;
  function desenharSelecao_(x, id, W, H) {
    const st = edE_(id), c = edCam_(id);
    if (c) {
      const b = caixaDaCamada_(c, W, H);
      x.save(); x.translate(b.cx, b.cy); x.rotate(b.a);
      x.lineWidth = 6; x.strokeStyle = '#fff'; x.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
      x.lineWidth = 3; x.strokeStyle = '#E67E22'; x.setLineDash([16, 10]); x.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h); x.setLineDash([]);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((q) => { x.fillStyle = '#fff'; x.strokeStyle = '#E67E22'; x.lineWidth = 5; x.fillRect(q[0] * b.w / 2 - 22, q[1] * b.h / 2 - 22, 44, 44); x.strokeRect(q[0] * b.w / 2 - 22, q[1] * b.h / 2 - 22, 44, 44); });
      x.strokeStyle = '#E67E22'; x.lineWidth = 4; x.beginPath(); x.moveTo(0, -b.h / 2); x.lineTo(0, -b.h / 2 - 90); x.stroke();
      x.fillStyle = '#E67E22'; x.strokeStyle = '#fff'; x.beginPath(); x.arc(0, -b.h / 2 - 90, 28, 0, Math.PI * 2); x.fill(); x.stroke();
      x.restore();
    }
    if (st.guia) { x.save(); x.strokeStyle = '#00c2d1'; x.lineWidth = 3; x.setLineDash([14, 10]); if (st.guia.v) { x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke(); } if (st.guia.h) { x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke(); } x.restore(); }
  }
  async function pintarEditor_(id) {
    const cv = document.querySelector('[data-ed-cv="' + id + '"]'), tr = vzTrab[id]; if (!cv || !tr) return;
    try {
      await carregarFontes_();
      const [W, H] = edTam_(id); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const sp = posEspec_(especCustom_({ spec: tr.spec }, INFO_AMOSTRA), INFO_AMOSTRA, id); if (tr.spec.base) sp.base = tr.spec.base;
      const ef = { fundo: sp.fundo, arteBase: sp.base, lista: layoutItens(sp, W, H, {}) };
      desenharTemplate(cv.getContext('2d'), fotoAmostraUma_(), W, H, id, ef, 'preencher');
      desenharSelecao_(cv.getContext('2d'), id, W, H);
      const erro = document.querySelector('[data-vz-erro="' + id + '"]'); if (erro) erro.textContent = tr.erro || '';
    } catch (e) { const erro = document.querySelector('[data-vz-erro="' + id + '"]'); if (erro) erro.textContent = 'Não consegui desenhar: ' + (e && e.message ? e.message : e); }
  }
  function toHex_(c) { c = String(c || ''); if (/^#[0-9a-f]{6}/i.test(c)) return c.slice(0, 7); if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return '#000000'; }
  function edCampo_(id, f, rotulo, tipo, val, extra) {
    const at = ' data-ed-id="' + esc(id) + '" data-ed-p="' + f + '" data-ed-t="' + tipo + '"';
    if (tipo === 'bool') return '<label class="ed-chk"><input type="checkbox"' + at + (val ? ' checked' : '') + '> ' + esc(rotulo) + '</label>';
    if (tipo === 'cor') return '<label class="ed-c">' + esc(rotulo) + '<input type="color"' + at + ' value="' + esc(toHex_(val)) + '"></label>';
    if (tipo === 'sel') return '<label class="ed-c">' + esc(rotulo) + '<select' + at + '>' + extra.map((o) => '<option value="' + o[0] + '"' + (String(val) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
    return '<label class="ed-c">' + esc(rotulo) + '<input type="' + (tipo === 'txt' ? 'text' : 'number') + '"' + at + ' value="' + esc(val == null ? '' : val) + '"' + (extra || '') + '></label>';
  }
  function htmlPropsEd_(id, c) {
    const pct = (v) => Math.round((Number(v) || 0) * 1000) / 10, isT = c.tipo === 'texto';
    let h = '<div class="ed-props"><h5>' + (isT ? '✏️ Texto' : '🔷 Forma') + ': ' + esc(c.rot || c.k) + '</h5>';
    if (isT) {
      h += edCampo_(id, 't', 'Texto (use {nome} {avista} {codigo}…)', 'txt', c.t, ' maxlength="140"');
      h += '<div class="ed-lin">' + edCampo_(id, 'tam', 'Tamanho da letra', 'num', c.tam || 40, ' min="10" max="400" step="1"') + '<button type="button" data-ed-a="tam-" data-id="' + esc(id) + '" aria-label="Diminuir a letra">A−</button><button type="button" data-ed-a="tam+" data-id="' + esc(id) + '" aria-label="Aumentar a letra">A+</button>' + edCampo_(id, 'cor', 'Cor da letra', 'cor', c.cor || '#ffffff') + '</div>';
      h += '<div class="ed-lin">' + edCampo_(id, 'max', 'Máx. letras (0 = sem limite) · padrão ' + (MAX_PADRAO[c.papel || 'extra'] || 60), 'num', c.max == null ? (MAX_PADRAO[c.papel || 'extra'] || 60) : c.max, ' min="0" max="200"') + edCampo_(id, 'linhas', 'Linhas', 'num', c.linhas || 1, ' min="1" max="8"') + '</div>';
      h += '<div class="ed-lin">' + edCampo_(id, 'al', 'Alinhar', 'sel', c.al || 'center', [['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']]) + edCampo_(id, 'peso', 'Peso', 'sel', c.peso || 'bold', [['bold', 'Negrito'], ['normal', 'Normal']]) + edCampo_(id, 'sombra', 'Sombra', 'bool', !!c.sombra) + '</div>';
      h += '<div class="ed-lin">' + edCampo_(id, 'bgOn', 'Caixa atrás do texto', 'bool', !!c.bg) + (c.bg ? edCampo_(id, 'bg', 'Cor da caixa', 'cor', c.bg) + edCampo_(id, 'raio', 'Canto (px)', 'num', c.raio || 0, ' min="0" max="300"') : '') + '</div>';
    } else {
      h += '<div class="ed-lin">' + edCampo_(id, 'forma', 'Forma', 'sel', c.forma || 'ret', [['ret', 'Retângulo'], ['elipse', 'Círculo / oval'], ['linha', 'Linha']]) + edCampo_(id, 'cor', 'Cor', 'cor', c.cor || '#E67E22') + '</div>';
      h += '<div class="ed-lin">' + edCampo_(id, 'gradOn', 'Degradê', 'bool', !!c.cor2) + (c.cor2 ? edCampo_(id, 'cor2', 'Cor final', 'cor', c.cor2) : '') + edCampo_(id, 'sombra', 'Sombra', 'bool', !!c.sombra) + '</div>';
      h += '<div class="ed-lin">' + edCampo_(id, 'bordaCor', 'Cor da borda', 'cor', (c.borda && c.borda.cor) || '#ffffff') + edCampo_(id, 'bordaW', 'Borda (px, 0 = sem)', 'num', (c.borda && c.borda.w) || 0, ' min="0" max="60"') + (c.forma !== 'elipse' ? edCampo_(id, 'raio', 'Canto (px)', 'num', c.raio || 0, ' min="0" max="400"') : '') + '</div>';
    }
    h += '<div class="ed-lin">' + edCampo_(id, 'x', 'X (%)', 'num', pct(c.x), ' step="0.5"') + edCampo_(id, 'y', 'Y (%)', 'num', pct(c.y), ' step="0.5"') + edCampo_(id, 'w', 'Largura (%)', 'num', pct(c.w), ' min="2" step="0.5"') + edCampo_(id, 'h', 'Altura (%)', 'num', pct(c.h), ' min="1" step="0.5"') + '</div>';
    h += '<div class="ed-lin">' + edCampo_(id, 'giro', 'Girar (graus)', 'num', Math.round((Number(c.giro) || 0) * 10) / 10, ' min="-180" max="180" step="1"') + edCampo_(id, 'opac', 'Opacidade (%)', 'num', Math.round((c.opac == null ? 1 : c.opac) * 100), ' min="5" max="100" step="5"') + '</div>';
    return h + '</div>';
  }
  function htmlPainelEd_(id) {
    const tr = vzTrab[id], st = edE_(id), cams = tr.spec.camadas;
    let h = '<div class="ed-add" role="group" aria-label="Adicionar elemento"><select data-ed-papel="' + esc(id) + '" aria-label="Tipo de texto">' + PAPEIS.map((q) => '<option value="' + q[0] + '">' + esc(q[1]) + '</option>').join('') + '</select><button type="button" data-ed-a="addtxt" data-id="' + esc(id) + '">+ Texto</button><button type="button" data-ed-a="addforma" data-forma="ret" data-id="' + esc(id) + '">+ Retângulo</button><button type="button" data-ed-a="addforma" data-forma="elipse" data-id="' + esc(id) + '">+ Círculo</button><button type="button" data-ed-a="addforma" data-forma="linha" data-id="' + esc(id) + '">+ Linha</button></div>';
    h += '<label class="po-vz-l">Efeito sobre a foto<select data-ed-fundo="' + esc(id) + '">' + FUNDOS_OK.filter((f) => f !== 'arte' || tr.spec.base).map((f) => '<option value="' + f + '"' + ((tr.spec.fundo || 'foto') === f ? ' selected' : '') + '>' + f + '</option>').join('') + '</select></label>';
    h += '<h5 style="margin:12px 0 2px">Elementos deste visual</h5><p class="po-ajuda">Toque no nome para escolher o elemento e editar (cor, tamanho, texto) logo acima. “Frente/Trás” muda quem fica por cima.</p><div class="ed-camadas" role="list" aria-label="Camadas (de cima para baixo)">' + (cams.length ? cams.map((c, i) => i).reverse().map((i) => { const c = cams[i]; return '<div class="ed-cam' + (c.k === st.sel ? ' sel' : '') + '" role="listitem"><button type="button" class="ed-cam-n" data-ed-a="sel" data-k="' + esc(c.k) + '" data-id="' + esc(id) + '">' + (c.tipo === 'texto' ? '✏️' : '🔷') + ' ' + esc(c.rot || c.k) + (c.oculto ? ' (oculto)' : '') + '</button><div class="ed-cam-b"><button type="button" data-ed-a="up" data-k="' + esc(c.k) + '" data-id="' + esc(id) + '" aria-label="Trazer para frente">▲ Frente</button><button type="button" data-ed-a="down" data-k="' + esc(c.k) + '" data-id="' + esc(id) + '" aria-label="Enviar para trás">▼ Trás</button><button type="button" data-ed-a="vis" data-k="' + esc(c.k) + '" data-id="' + esc(id) + '" aria-label="Mostrar ou esconder">👁 Ocultar</button><button type="button" data-ed-a="dupcam" data-k="' + esc(c.k) + '" data-id="' + esc(id) + '" aria-label="Duplicar">⧉ Copiar</button><button type="button" data-ed-a="delcam" data-k="' + esc(c.k) + '" data-id="' + esc(id) + '" aria-label="Apagar">✕ Apagar</button></div></div>'; }).join('') : '<p class="po-ajuda">Nenhum elemento ainda. Use os botões “+” acima.</p>') + '</div>';
    const c = edCam_(id);
    return h + (c ? htmlPropsEd_(id, c) : '<p class="po-ajuda">Toque num elemento da prévia (ou na lista) para editar. Arraste para mover; cantos = tamanho; bolinha de cima = girar. Setas do teclado movem.</p>');
  }
  function htmlEditor_(id) {
    const st = edE_(id);
    return '<div class="ed-fmt" role="group" aria-label="Formato da prévia"><button type="button" data-ed-a="fmt" data-v="feed" data-id="' + esc(id) + '" aria-pressed="' + (st.fmt === 'feed') + '">Feed 4:5</button><button type="button" data-ed-a="fmt" data-v="story" data-id="' + esc(id) + '" aria-pressed="' + (st.fmt === 'story') + '">Story 9:16</button></div>' +
      '<canvas class="ed-cv" data-ed-cv="' + esc(id) + '" tabindex="0" role="group" aria-label="Editor visual. Toque num elemento para selecionar; arraste para mover; setas do teclado movem; Delete apaga."></canvas>' +
      '<div data-ed-dyn="' + esc(id) + '">' + htmlPainelEd_(id) + '</div>';
  }
  function edPainel_(id) { const d = document.querySelector('[data-ed-dyn="' + id + '"]'); if (d) d.innerHTML = htmlPainelEd_(id); }
  function edSyncCodigo_(id) { const ta = document.querySelector('[data-vz-json="' + id + '"]'); if (ta && document.activeElement !== ta && vzTrab[id]) ta.value = formatarSpec_(vzTrab[id].spec); }
  function edSyncCampos_(id) {
    const c = edCam_(id); if (!c) return; const pct = (v) => Math.round((Number(v) || 0) * 1000) / 10;
    document.querySelectorAll('[data-ed-id="' + id + '"][data-ed-p]').forEach((el) => { if (document.activeElement === el) return; const f = el.dataset.edP; if (f === 'x' || f === 'y' || f === 'w' || f === 'h') el.value = pct(c[f]); else if (f === 'giro') el.value = Math.round((Number(c.giro) || 0) * 10) / 10; else if (f === 'tam') el.value = c.tam || 40; });
  }
  function edMudou_(id, painel) { const tr = vzTrab[id]; if (tr) tr.erro = ''; edSyncCodigo_(id); if (painel) edPainel_(id); else edSyncCampos_(id); pintarEditor_(id); }
  function edNovoK_(spec, base) { let k = base, n = 1; while (spec.camadas.some((c) => c.k === k)) k = base + (++n); return k; }
  function edProp_(t) {
    const id = t.dataset.edId, tr = vzTrab[id], c = edCam_(id); if (!tr || !c) return;
    const f = t.dataset.edP, k = t.dataset.edT; let v = k === 'bool' ? t.checked : (k === 'txt' || k === 'cor' || k === 'sel') ? t.value : Number(t.value), repintaPainel = false;
    if (k === 'num' && (t.value === '' || !isFinite(v))) return;
    const lim = (a, b) => Math.max(a, Math.min(b, v));
    if (f === 'x' || f === 'y') c[f] = arred_(lim(-20, 120) / 100);
    else if (f === 'w') c.w = arred_(lim(2, 400) / 100); else if (f === 'h') c.h = arred_(lim(0.5, 400) / 100);
    else if (f === 'opac') { c.opac = lim(5, 100) / 100; if (c.opac >= 1) delete c.opac; }
    else if (f === 'giro') { c.giro = lim(-180, 180); if (!c.giro) delete c.giro; }
    else if (f === 'tam') c.tam = Math.round(lim(10, 400));
    else if (f === 'max') c.max = Math.round(lim(0, 200)); else if (f === 'linhas') c.linhas = Math.round(lim(1, 8));
    else if (f === 'raio') c.raio = Math.round(lim(0, 400));
    else if (f === 'bgOn') { if (v) c.bg = c.bg || '#2C2C2C'; else { delete c.bg; delete c.raio; } repintaPainel = true; }
    else if (f === 'gradOn') { if (v) c.cor2 = c.cor2 || '#C0392B'; else delete c.cor2; repintaPainel = true; }
    else if (f === 'bordaCor') c.borda = { cor: v, w: (c.borda && c.borda.w) || 4 };
    else if (f === 'bordaW') { if (v > 0) c.borda = { cor: (c.borda && c.borda.cor) || '#ffffff', w: Math.round(lim(1, 60)) }; else delete c.borda; }
    else if (f === 'forma') { c.forma = v; repintaPainel = true; }
    else if (f === 'sombra') c.sombra = !!v;
    else c[f] = v;
    edMudou_(id, repintaPainel);
    if (f === 't') { const h5 = document.querySelector('[data-ed-dyn="' + id + '"] .ed-props h5'); if (h5) h5.textContent = '✏️ Texto: ' + (c.rot || c.k); }
  }
  function ptEd_(cv, e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * cv.width, y: (e.clientY - r.top) / r.height * cv.height }; }
  function localDe_(b, p) { const dx = p.x - b.cx, dy = p.y - b.cy, co = Math.cos(-b.a), si = Math.sin(-b.a); return { x: dx * co - dy * si, y: dx * si + dy * co }; }
  function edDown_(e) {
    const cv = e.target.closest && e.target.closest('[data-ed-cv]'); if (!cv) return;
    const id = cv.dataset.edCv, tr = vzTrab[id]; if (!tr || !tr.spec.camadas) return;
    const st = edE_(id), p = ptEd_(cv, e), W = cv.width, H = cv.height; let c = edCam_(id), modo = '';
    if (c) {
      const b = caixaDaCamada_(c, W, H), l = localDe_(b, p);
      if (Math.hypot(l.x, l.y + b.h / 2 + 90) < 64) modo = 'giro';
      else if (Math.abs(Math.abs(l.x) - b.w / 2) < 56 && Math.abs(Math.abs(l.y) - b.h / 2) < 56) modo = 'redim';
      else if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) modo = 'mover';
    }
    if (!modo) {
      c = null;
      for (let i = tr.spec.camadas.length - 1; i >= 0; i--) { const q = tr.spec.camadas[i]; if (q.oculto) continue; const b = caixaDaCamada_(q, W, H), l = localDe_(b, p); if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) { c = q; break; } }
      if (c) { modo = 'mover'; st.sel = c.k; } else { st.sel = ''; }
      edPainel_(id);
    }
    if (modo && c) { try { cv.setPointerCapture(e.pointerId); } catch (er) {} EDT.drag = { id, k: c.k, modo, p0: p, x0: c.x, y0: c.y, b0: caixaDaCamada_(c, W, H) }; }
    cv.focus({ preventScroll: true }); if (e.cancelable) e.preventDefault(); pintarEditor_(id);
  }
  function edMove_(e) {
    const d = EDT.drag; if (!d) return; const cv = document.querySelector('[data-ed-cv="' + d.id + '"]'), tr = vzTrab[d.id]; if (!cv || !tr) return;
    const c = tr.spec.camadas.find((q) => q.k === d.k); if (!c) return; const p = ptEd_(cv, e), W = cv.width, H = cv.height, st = edE_(d.id); st.guia = null;
    if (d.modo === 'mover') {
      let x = d.x0 + (p.x - d.p0.x) / W, y = d.y0 + (p.y - d.p0.y) / H;
      if (Math.abs(x - 0.5) < 0.012) { x = 0.5; st.guia = { v: true }; } if (Math.abs(y - 0.5) < 0.012) { y = 0.5; st.guia = Object.assign(st.guia || {}, { h: true }); }
      c.x = arred_(Math.max(-0.2, Math.min(1.2, x))); c.y = arred_(Math.max(-0.2, Math.min(1.2, y)));
    } else if (d.modo === 'redim') {
      const l = localDe_(d.b0, p); c.w = arred_(Math.max(0.03, 2 * Math.abs(l.x) / W)); c.h = arred_(Math.max(0.015, 2 * Math.abs(l.y) / W));
    } else if (d.modo === 'giro') {
      let ang = Math.atan2(p.y - d.b0.cy, p.x - d.b0.cx) * 180 / Math.PI + 90; if (ang > 180) ang -= 360; if (ang < -180) ang += 360;
      const m15 = Math.round(ang / 15) * 15; if (Math.abs(ang - m15) < 4) ang = m15; c.giro = Math.round(ang * 10) / 10; if (!c.giro) delete c.giro;
    }
    if (!d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; edSyncCodigo_(d.id); edSyncCampos_(d.id); pintarEditor_(d.id); });
    if (e.cancelable) e.preventDefault();
  }
  function edUp_() { const d = EDT.drag; if (!d) return; EDT.drag = null; const st = edE_(d.id); st.guia = null; edMudou_(d.id, false); }
  function edTecla_(e) {
    const cv = e.target.closest && e.target.closest('[data-ed-cv]'); if (!cv) return; const id = cv.dataset.edCv, c = edCam_(id); if (!c) return;
    const passo = e.shiftKey ? 0.02 : 0.004; let usou = true;
    if (e.key === 'ArrowLeft') c.x = arred_(c.x - passo); else if (e.key === 'ArrowRight') c.x = arred_(c.x + passo); else if (e.key === 'ArrowUp') c.y = arred_(c.y - passo); else if (e.key === 'ArrowDown') c.y = arred_(c.y + passo);
    else if (e.key === 'Delete' || e.key === 'Backspace') { vzTrab[id].spec.camadas = vzTrab[id].spec.camadas.filter((q) => q !== c); edE_(id).sel = ''; edMudou_(id, true); e.preventDefault(); return; } else usou = false;
    if (usou) { e.preventDefault(); edMudou_(id, false); }
  }
  function edAcao_(b) {
    const a = b.dataset.edA, id = b.dataset.id, tr = vzTrab[id]; if (!tr || !tr.spec.camadas) return; const st = edE_(id), cams = tr.spec.camadas, k = b.dataset.k, i = cams.findIndex((q) => q.k === k);
    if (a === 'fmt') { st.fmt = b.dataset.v; document.querySelectorAll('[data-ed-a="fmt"][data-id="' + id + '"]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === st.fmt))); return pintarEditor_(id); }
    if (a === 'addtxt') { const sel = document.querySelector('[data-ed-papel="' + id + '"]'), papel = sel ? sel.value : 'extra', def = PAPEIS.find((q) => q[0] === papel) || PAPEIS[0]; const nk = edNovoK_(tr.spec, papel); cams.push({ k: nk, tipo: 'texto', rot: def[1], papel: papel, t: def[2], x: 0.5, y: 0.5, w: 0.8, h: papel === 'nome' ? 0.15 : 0.1, tam: papel === 'preco' ? 90 : papel === 'nome' ? 66 : 44, cor: '#F5F1E8', peso: 'bold', al: 'center', linhas: papel === 'nome' ? 2 : 1, max: MAX_PADRAO[papel] || 60, sombra: true }); st.sel = nk; return edMudou_(id, true); }
    if (a === 'addforma') { const fm = b.dataset.forma, nk = edNovoK_(tr.spec, 'forma'); cams.push({ k: nk, tipo: 'forma', rot: fm === 'ret' ? 'Retângulo' : fm === 'elipse' ? 'Círculo' : 'Linha', forma: fm, x: 0.5, y: 0.5, w: fm === 'linha' ? 0.5 : 0.4, h: fm === 'linha' ? 0.006 : fm === 'elipse' ? 0.4 : 0.2, cor: '#E67E22', raio: fm === 'ret' ? 24 : 0 }); st.sel = nk; return edMudou_(id, true); }
    if (a === 'sel') { st.sel = k; return edMudou_(id, true); }
    if (i < 0 && a !== 'tam-' && a !== 'tam+') return;
    if (a === 'up' && i < cams.length - 1) { const t = cams[i]; cams[i] = cams[i + 1]; cams[i + 1] = t; return edMudou_(id, true); }
    if (a === 'down' && i > 0) { const t = cams[i]; cams[i] = cams[i - 1]; cams[i - 1] = t; return edMudou_(id, true); }
    if (a === 'vis') { if (cams[i].oculto) delete cams[i].oculto; else cams[i].oculto = true; return edMudou_(id, true); }
    if (a === 'dupcam') { const cp = JSON.parse(JSON.stringify(cams[i])); cp.k = edNovoK_(tr.spec, cp.k.replace(/\d+$/, '')); cp.x = arred_(cp.x + 0.03); cp.y = arred_(cp.y + 0.02); cams.splice(i + 1, 0, cp); st.sel = cp.k; return edMudou_(id, true); }
    if (a === 'delcam') { cams.splice(i, 1); if (st.sel === k) st.sel = ''; return edMudou_(id, true); }
    if (a === 'tam+' || a === 'tam-') { const c = edCam_(id); if (c && c.tipo === 'texto') { c.tam = Math.max(10, Math.min(400, Math.round((c.tam || 40) * (a === 'tam+' ? 1.1 : 1 / 1.1)))); edMudou_(id, false); } return; }
    if (a === 'copiarIA') return copiar(promptIA_(id));
    if (a === 'converter') return;
  }
  function pintarAbertas_() { document.querySelectorAll('details[data-vz-det^="v:"][open]').forEach((d) => pintarAmostra_(d.dataset.vzDet.slice(2))); }
  function htmlCardVisual_(v) {
    const id = v[0], custom = id.indexOf('c_') === 0, tr = custom ? trabDe_(id) : null, aberto = vzAbertos['v:' + id] ? ' open' : '';
    const nomes = lerJ_(NOMES_KEY, {}), nomeAtual = custom ? (tr ? tr.nome : v[1]) : ((nomes && nomes[id]) || v[1]);
    let h = '<details class="po-vz" data-vz-det="v:' + esc(id) + '"' + aberto + '><summary>' + esc(nomeAtual) + (custom ? ' <small>(seu)</small>' : '') + '</summary><div class="po-vz-corpo">';
    h += '<label class="po-vz-l">Nome do visual<input type="text" data-vz-nome="' + esc(id) + '" value="' + esc(nomeAtual) + '" maxlength="40"></label>';
    h += '<label class="po-vz-l">Texto do botão quando NÃO há link<input type="text" data-vz-cta="' + esc(id) + '" value="' + esc(ctaDoVisual_(id)) + '" maxlength="40" placeholder="' + CTA_PADRAO + '"></label>';
    const ehCam = !!(custom && tr && tr.spec.camadas);
    h += ehCam ? '<div class="po-vz-prev ed">' + htmlEditor_(id) + '</div>' : '<div class="po-vz-prev"><canvas data-vz-cv="' + esc(id) + '" aria-label="Prévia do visual ' + esc(nomeAtual) + '" style="width:100%;max-width:280px;border-radius:12px;border:1px solid #ddd"></canvas></div>';
    h += '<div class="po-vz-erro" data-vz-erro="' + esc(id) + '" role="status" style="color:#b00020;font-size:.82rem"></div>';
    if (ehCam) {
      h += '<details class="po-vz-cod" open><summary>🧩 Código do visual (muda junto com a prévia)</summary><p class="po-ajuda" style="margin:6px 0">Edite aqui ou arraste na prévia: um atualiza o outro na hora. O guia dentro do código explica cada campo para pessoas e IAs.</p><textarea data-vz-json="' + esc(id) + '" spellcheck="false" rows="14" style="width:100%;font-family:monospace;font-size:.76rem" aria-label="Código do visual">' + esc(formatarSpec_(tr.spec)) + '</textarea><div class="po-vz-acoes"><button type="button" data-ed-a="copiarIA" data-id="' + esc(id) + '">📋 Copiar guia + código para uma IA</button></div></details>';
      h += '<div class="po-vz-acoes"><button type="button" class="po-vz-ok" data-vza="salvar" data-id="' + esc(id) + '">💾 Salvar visual</button><button type="button" data-vza="dup" data-id="' + esc(id) + '">Duplicar</button><button type="button" data-vza="excluir" data-id="' + esc(id) + '" style="color:#b00020">Excluir</button></div>';
    } else if (custom && tr) {
      h += '<h5 style="margin:10px 0 4px">Campos deste visual</h5>';
      h += tr.spec.itens.map((it, i) => '<div class="po-vz-f"><b>' + esc(it.rot || it.k) + '</b><input type="text" data-vz-f="' + esc(id) + '|' + i + '|t" value="' + esc(it.t) + '" aria-label="Texto de ' + esc(it.rot || it.k) + '"><label>Tam.<input type="number" min="10" max="300" data-vz-f="' + esc(id) + '|' + i + '|tam" value="' + esc(it.tam || 40) + '"></label><label>Máx. letras<input type="number" min="0" max="200" data-vz-f="' + esc(id) + '|' + i + '|max" value="' + esc(it.max || 0) + '"></label><button type="button" data-vza="delf" data-id="' + esc(id) + '" data-i="' + i + '" aria-label="Apagar o campo ' + esc(it.rot || it.k) + '">✕</button></div>').join('');
      h += '<div class="po-vz-add"><select data-vz-add="' + esc(id) + '" aria-label="Tipo de campo">' + CAMPOS_NOVOS.map((c) => '<option value="' + c[0] + '">' + esc(c[1]) + '</option>').join('') + '</select><button type="button" data-vza="addf" data-id="' + esc(id) + '">+ Adicionar campo</button></div>';
      h += '<p class="po-ajuda" style="margin:6px 0">Use {nome} {avista} {cheio} {codigo} {tam} {cores} {cat} {gen} no texto: trocam pelos dados da peça. “Máx. letras” 0 = sem limite.</p>';
      h += '<details class="po-vz-cod"><summary>🧩 Código do visual (avançado)</summary><textarea data-vz-json="' + esc(id) + '" spellcheck="false" rows="12" style="width:100%;font-family:monospace;font-size:.78rem">' + esc(JSON.stringify(tr.spec, null, 1)) + '</textarea><button type="button" data-vza="aplicar" data-id="' + esc(id) + '">Aplicar código na prévia</button></details>';
      h += '<div class="po-vz-acoes"><button type="button" class="po-vz-ok" data-vza="salvar" data-id="' + esc(id) + '">💾 Salvar visual</button><button type="button" data-vza="converter" data-id="' + esc(id) + '">🎨 Converter para o editor visual (arrastar)</button><button type="button" data-vza="dup" data-id="' + esc(id) + '">Duplicar</button><button type="button" data-vza="excluir" data-id="' + esc(id) + '" style="color:#b00020">Excluir</button></div>';
    } else {
      h += '<div class="po-vz-acoes">' + (id === 'original' ? '' : '<button type="button" data-vza="dup" data-id="' + esc(id) + '">📄 Duplicar para editar campos e código</button>') + '<button type="button" data-vza="esconder" data-id="' + esc(id) + '">Esconder de todos os tipos</button></div>';
    }
    return h + '</div></details>';
  }
  function htmlConfigVisuais_() {
    const c = lerCfgVis_(), todos = todosVisuais_();
    const tipos = [['feed', 'Feed'], ['carrossel', 'Carrossel'], ['story', 'Story']];
    let h = '<style>.po-vz{border:1px solid #ddd;border-radius:12px;margin:0 0 8px;background:#fff}.po-vz>summary{padding:12px;font-weight:800;cursor:pointer;min-height:44px}.po-vz-corpo{padding:0 12px 12px}.po-vz-l{display:block;font-weight:700;font-size:.85rem;margin:8px 0}.po-vz-l input{display:block;width:100%;margin-top:4px}.po-vz-f{display:grid;grid-template-columns:1fr;gap:4px;border-top:1px solid #eee;padding:8px 0}.po-vz-f label{font-size:.75rem;display:inline-flex;gap:4px;align-items:center}.po-vz-f input[type=number]{width:70px}.po-vz-add,.po-vz-acoes{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.po-vz button{width:auto;min-height:40px;padding:6px 12px}.po-vz-ok{background:#E67E22;color:#0d0d0d;font-weight:800}.ed-cv{display:block;width:86%;margin:8px auto;border-radius:12px;border:1px solid #ccc;background:#eee;touch-action:none;cursor:crosshair}.ed-cv:focus-visible{outline:3px solid #A85200}.ed-fmt,.ed-add{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.ed-fmt button[aria-pressed=true]{background:#E67E22;color:#0d0d0d;font-weight:800}.ed-camadas{margin:8px 0}.ed-cam{display:block;border:1px solid #ddd;border-radius:10px;padding:6px;margin:6px 0;background:#fff}.ed-cam.sel{border-color:#E67E22;background:#FFF8F0}.ed-cam-b{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.ed-cam-b button{width:auto!important;flex:1 1 auto;min-width:0;min-height:36px;padding:4px 2px;font-size:.7rem;white-space:nowrap}.ed-cam.sel .ed-cam-n{border-color:#E67E22;background:#FFF3E6;font-weight:800}.ed-cam-n{display:block;text-align:left;border:1px solid #ccc;border-radius:8px;background:#fff;min-height:40px;width:100%;white-space:normal;word-break:break-word}.ed-props{border:1px solid #E67E22;border-radius:12px;padding:8px 10px;margin:8px 0;background:#fffaf5}.ed-props h5{margin:0 0 6px}.ed-lin{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin:4px 0}.ed-c{display:flex;flex-direction:column;font-size:.75rem;font-weight:700;gap:2px;flex:1 1 90px}.ed-c input,.ed-c select{width:100%;min-height:40px}.ed-chk{display:flex;gap:6px;align-items:center;min-height:40px;font-size:.8rem;font-weight:700}.ed-props input[type=color]{padding:2px;height:40px}</style>';
    h += '<div class="po-passo"><h4>Visuais de cada tipo</h4><p class="po-ajuda" style="margin-top:0">Toque num tipo para marcar quais visuais aparecem nele. Reels não usa visual. Vale para todos os aparelhos da equipe; sempre sobra pelo menos um.</p>';
    h += tipos.map((t) => { const ativos = Array.isArray(c[t[0]]) ? c[t[0]] : todos.map((x) => x[0]); return '<details class="po-vz" data-vz-det="t:' + t[0] + '"' + (vzAbertos['t:' + t[0]] ? ' open' : '') + '><summary>' + t[1] + ' <small>(' + todos.filter((v) => ativos.indexOf(v[0]) !== -1).length + ' de ' + todos.length + ')</small></summary><div class="po-vz-corpo">' + todos.map((v) => '<label style="display:flex;gap:8px;align-items:center;min-height:40px"><input type="checkbox" data-cv-tipo="' + t[0] + '" data-cv-id="' + esc(v[0]) + '"' + (ativos.indexOf(v[0]) !== -1 ? ' checked' : '') + '> ' + esc(v[1]) + '</label>').join('') + '</div></details>'; }).join('') + '</div>';
    h += '<div class="po-passo"><h4>Meus visuais e edição</h4><p class="po-ajuda" style="margin-top:0">Cada visual tem nome, texto do botão sem link e prévia ao vivo. Os visuais prontos podem ser duplicados para você editar campos e código; os seus podem ser alterados e excluídos.</p><div class="po-vz-acoes" style="margin-top:0"><button type="button" class="po-vz-ok" data-vza="novo">+ Novo visual</button></div>' + todos.map(htmlCardVisual_).join('') + '</div>';
    return h;
  }
  function redesenharConfig_() { desenhar(); setTimeout(pintarAbertas_, 0); }
  function addCfgTodosTipos_(id, remover) {
    const c = lerCfgVis_(), todos = todosVisuais_().map((x) => x[0]);
    ['feed', 'carrossel', 'story'].forEach((t) => {
      if (!Array.isArray(c[t])) { if (!remover) return; c[t] = todos.slice(); }
      c[t] = c[t].filter((x) => x !== id); if (!remover) c[t].push(id);
      if (!c[t].length) c[t] = todos.filter((x) => x !== id).slice(0, 1);
    });
    salvarCfgVis_(c);
  }
  function ligarConfigVisuais_() {
    const corpo = $('po-corpo');
    corpo.addEventListener('toggle', (e) => { const d = e.target; if (d && d.dataset && d.dataset.vzDet) { vzAbertos[d.dataset.vzDet] = d.open; if (d.open && d.dataset.vzDet.indexOf('v:') === 0) pintarAmostra_(d.dataset.vzDet.slice(2)); } }, true);
    corpo.addEventListener('input', (e) => {
      const t = e.target; if (!t || !t.dataset) return;
      if (t.dataset.edP !== undefined) return edProp_(t);
      if (t.dataset.vzNome !== undefined) { const id = t.dataset.vzNome, v = t.value.trim().slice(0, 40); if (id.indexOf('c_') === 0) { const tr = trabDe_(id); if (tr) tr.nome = v || 'Meu visual'; } else { const n = lerJ_(NOMES_KEY, {}); if (v) n[id] = v; else delete n[id]; gravarJ_(NOMES_KEY, n); } const sm = t.closest('details').querySelector('summary'); if (sm) sm.firstChild.textContent = v || 'Meu visual'; return; }
      if (t.dataset.vzCta !== undefined) { const id = t.dataset.vzCta, c = lerJ_(CTA_KEY, {}); const v = t.value.trim(); if (v) c[id] = v; else delete c[id]; gravarJ_(CTA_KEY, c); pintarAmostra_(id); return; }
      if (t.dataset.vzF !== undefined) { const [id, i, campo] = t.dataset.vzF.split('|'), tr = trabDe_(id); if (!tr || !tr.spec.itens[Number(i)]) return; const it = tr.spec.itens[Number(i)]; if (campo === 't') it.t = t.value; else it[campo] = Number(t.value) || 0; const ta = document.querySelector('[data-vz-json="' + id + '"]'); if (ta && document.activeElement !== ta) ta.value = JSON.stringify(tr.spec, null, 1); tr.erro = ''; pintarAmostra_(id); return; }
      if (t.dataset.vzJson !== undefined) { const id = t.dataset.vzJson, tr = trabDe_(id); if (!tr) return; clearTimeout(t._tm); t._tm = setTimeout(() => { try { const sp = JSON.parse(t.value); delete sp._guia; const err = validarSpec_(sp); if (err) { tr.erro = err; const el = document.querySelector('[data-vz-erro="' + id + '"]'); if (el) el.textContent = err; return; } tr.spec = sp; tr.erro = ''; if (sp.camadas) { const st = edE_(id); if (!sp.camadas.some((q) => q.k === st.sel)) st.sel = ''; edPainel_(id); } pintarAmostra_(id); } catch (er) { tr.erro = 'Código com erro de escrita: ' + er.message; const el = document.querySelector('[data-vz-erro="' + id + '"]'); if (el) el.textContent = tr.erro; } }, 350); }
    });
    corpo.addEventListener('pointerdown', edDown_); corpo.addEventListener('pointermove', edMove_); corpo.addEventListener('pointerup', edUp_); corpo.addEventListener('pointercancel', edUp_); corpo.addEventListener('keydown', edTecla_);
    corpo.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-ed-a]'); if (b) edAcao_(b); });
    corpo.addEventListener('change', (e) => { const t = e.target; if (t && t.dataset && t.dataset.edFundo !== undefined) { const tr = vzTrab[t.dataset.edFundo]; if (tr) { tr.spec.fundo = t.value; edMudou_(t.dataset.edFundo, false); } } });
    corpo.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-vza]'); if (!b) return; const a = b.dataset.vza, id = b.dataset.id;
      if (a === 'novo') { const nid = novoIdVisual_(), sp = novoSpecCamadas_(); const l = lerCustom_(); l.push({ id: nid, nome: 'Meu visual ' + (l.length + 1), spec: sp }); gravarJ_(CUSTOM_KEY, l); addCfgTodosTipos_(nid); vzAbertos['v:' + nid] = true; return redesenharConfig_(); }
      if (a === 'dup') {
        let sp, nome; const cu = customPorId_(id);
        if (vzTrab[id]) { sp = JSON.parse(JSON.stringify(vzTrab[id].spec)); nome = vzTrab[id].nome; } else if (cu) { sp = JSON.parse(JSON.stringify(cu.spec)); nome = cu.nome; } else { const r = especTemplateBase(id, INFO_MOLDE, 1080, 1350); sp = JSON.parse(JSON.stringify({ fundo: r.fundo, grupos: r.grupos, itens: r.itens })); if (r.fundo === 'arte') sp.base = id; try { sp = converterParaCamadas_(sp); } catch (er) { /* fica no formato antigo */ } nome = (todosVisuais_().find((x) => x[0] === id) || [0, id])[1]; }
        const nid = novoIdVisual_(), l = lerCustom_(); l.push({ id: nid, nome: 'Cópia de ' + nome, spec: sp }); gravarJ_(CUSTOM_KEY, l); addCfgTodosTipos_(nid); vzAbertos['v:' + nid] = true; return redesenharConfig_();
      }
      if (a === 'esconder') { addCfgTodosTipos_(id, true); return redesenharConfig_(); }
      const tr = trabDe_(id); if (!tr && a !== 'excluir') return;
      if (a === 'addf') { const sel = document.querySelector('[data-vz-add="' + id + '"]'), k0 = sel ? sel.value : 'extra', def = CAMPOS_NOVOS.find((x) => x[0] === k0) || CAMPOS_NOVOS[0]; let k = k0, n = 1; while (tr.spec.itens.some((it) => it.k === k)) k = k0 + (++n); tr.spec.itens.push({ k: k, rot: def[1], t: def[2], grp: tr.spec.grupos[0].id, tam: 40, cor: '#F5F1E8', sombra: true, max: 0 }); return redesenharConfig_(); }
      if (a === 'delf') { if (tr.spec.itens.length <= 1) { tr.erro = 'O visual precisa de pelo menos 1 campo.'; return pintarAmostra_(id); } tr.spec.itens.splice(Number(b.dataset.i), 1); return redesenharConfig_(); }
      if (a === 'converter') { try { tr.spec = converterParaCamadas_(tr.spec); tr.erro = ''; edE_(id).sel = ''; return redesenharConfig_(); } catch (er) { tr.erro = 'Não consegui converter: ' + er.message; return pintarAmostra_(id); } }
      if (a === 'aplicar') { const ta = document.querySelector('[data-vz-json="' + id + '"]'); try { const sp = JSON.parse(ta.value), err = validarSpec_(sp); if (err) { tr.erro = err; return pintarAmostra_(id); } tr.spec = sp; tr.erro = ''; return redesenharConfig_(); } catch (er) { tr.erro = 'Código com erro de escrita: ' + er.message; return pintarAmostra_(id); } }
      if (a === 'salvar') { const err = validarSpec_(tr.spec); if (err) { tr.erro = err; return pintarAmostra_(id); } const l = lerCustom_(), c = l.find((x) => x.id === id); if (c) { c.nome = tr.nome; c.spec = tr.spec; gravarJ_(CUSTOM_KEY, l); } aviso = 'Visual salvo.'; avisoErro = false; return redesenharConfig_(); }
      if (a === 'excluir') { if (!confirm('Excluir este visual? Não dá para desfazer.')) return; gravarJ_(CUSTOM_KEY, lerCustom_().filter((x) => x.id !== id)); delete vzTrab[id]; addCfgTodosTipos_(id, true); return redesenharConfig_(); }
    });
  }
  function htmlLivre() {
    const n = nova;
    let h = n.modoCli ? '<div class="po-passo"><h4>1. Fotos de clientes escolhidas</h4><p class="po-ajuda" style="margin-top:0">Só Story, com o template “Ela usa TM”. Escolha mais fotos na aba <b>Fotos de clientes</b>.</p>' :
      '<div class="po-passo"><h4>1. Suas mídias (sem peça)</h4><p class="po-ajuda" style="margin-top:0">Fotos e vídeos do aparelho, na ordem em que vão sair. Serve para Story do dia, aviso, bastidores, qualquer coisa.</p>' +
      '<label for="po-livre-arq" class="po-ajuda" style="font-weight:700;margin:0 0 4px;display:block">Escolher fotos e vídeos (vídeo até 40 MB)</label><input type="file" id="po-livre-arq" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple>';
    if (n.modoCli) h += htmlEscolherFotos();
    h += n.livre.length ? '<div style="margin-top:8px">' + n.livre.map((m, i) => '<div class="po-escolhida" style="margin-bottom:6px;align-items:flex-start">' +
      (m.tipo === 'video' ? '<span class="po-v" style="background:#222;color:#fff;border-radius:6px;padding:20px 12px;font-size:1.2rem" aria-hidden="true">🎬</span>' : '<img src="' + esc(m.url) + '" alt="" width="40" height="50" style="border-radius:6px;object-fit:cover">') +
      '<div style="flex:1;min-width:0"><b>' + (i + 1) + 'º · ' + (m.tipo === 'video' ? 'Vídeo' : 'Foto') + '</b><small style="display:block;color:#555;overflow-wrap:anywhere">' + esc(m.nome || '') + '</small>' +
      (n.quando === 'agendar' ? '<label class="po-ajuda" for="po-h-' + i + '" style="display:block;margin:4px 0 2px">Horário só deste (opcional)</label><input type="datetime-local" id="po-h-' + i + '" data-hora="' + i + '" value="' + esc(m.hora || '') + '">' : '') + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;flex:none"><button type="button" data-lm="up" data-i="' + i + '" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" data-lm="down" data-i="' + i + '" aria-label="Descer"' + (i === n.livre.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" data-lm="x" data-i="' + i + '" aria-label="Tirar">✕</button></div></div>').join('') + '</div>' : (n.modoCli ? '<p class="po-ajuda">Nenhuma foto escolhida ainda. Vá em <b>Fotos de clientes</b>, marque as fotos e toque em “Colocar na fila de Story”.</p>' : '<p class="po-ajuda">Nenhuma mídia ainda.</p>');
    return h + '</div>';
  }
  /** Ela usa TM: escolher aqui mesmo entre as fotos de clientes ainda NÃO usadas (várias de uma vez). */
  function htmlEscolherFotos() {
    const l = fotosNovas;
    if (l === null) return '<p class="po-ajuda">Carregando as fotos de clientes…</p>';
    const jaNa = (x) => nova.livre.some((m) => m.fotoId === x.id);
    if (!l.length) return '<p class="po-ajuda"><b>Não há fotos novas</b> de clientes. Quando chegarem (pela conta do cliente ou adicionadas por você), aparecem aqui.</p>';
    const todas = l.every(jaNa);
    return '<div class="po-barra-sel" style="position:static;padding:0 0 6px"><button type="button" class="po-oc" data-a="fotos-todas">' + (todas ? '☐ Desmarcar todas' : '☑ Marcar todas (' + l.length + ')') + '</button></div>' +
      '<div class="po-grade" role="group" aria-label="Fotos de clientes que ainda não foram usadas">' + l.map((x) => '<button type="button" class="po-card" data-fcli="' + x.id + '" aria-pressed="' + jaNa(x) + '"><span class="po-ck" aria-hidden="true">' + (jaNa(x) ? '✓' : '') + '</span><img src="' + esc(fotoMini(x.url, 240)) + '" alt="" loading="lazy"><b>' + esc(x.nome || (x.instagram ? '@' + x.instagram : whatsBonito(x.whats)) || 'Cliente') + '</b>' + (x.obs ? '<small>' + esc(String(x.obs).slice(0, 50)) + '</small>' : '') + '</button>').join('') + '</div>';
  }
  async function carregarFotosNovas() {
    const r = await ig('/fotos?status=nova&limite=80');
    if (r && r.ok) fotosNovas = r.fotos || []; else if (fotosNovas === null) fotosNovas = [];
    if (abaAtual === 'nova' && nova && nova.modoCli) desenhar();
  }
  /** Com peça: grade grande (aproveita a tela), filtros por gênero e categoria, e escolhe VÁRIAS peças. */
  function opcoesDe(campo) { const m = {}; pecasAtivas().forEach((p) => String(p[campo] || '').split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => { m[x] = true; })); return Object.keys(m).sort((a, b) => a.localeCompare(b, 'pt-BR')); }
  function pecasFiltradas() {
    const n = nova, b = semAc(n.busca);
    return pecasAtivas().filter((x) => (!b || semAc(x.Nome).includes(b) || semAc(x.Codigo).includes(b)) &&
      (!n.fg || String(x.Genero || '').split(',').map((s) => s.trim()).indexOf(n.fg) !== -1) && (!n.fc || String(x.Categoria || '').split(',').map((s) => s.trim()).indexOf(n.fc) !== -1));
  }
  function htmlEscolherPecas() {
    const n = nova, l = pecasFiltradas(), sel = n.selPecas || [], gs = opcoesDe('Genero'), cs = opcoesDe('Categoria');
    const op = (lista, atual, vazio) => '<option value="">' + vazio + '</option>' + lista.map((x) => '<option value="' + esc(x) + '"' + (x === atual ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    const todas = l.length > 0 && l.every((x) => sel.indexOf(String(x.ID)) !== -1);
    return '<label for="po-busca" class="po-ajuda" style="margin:0 0 4px">Procure pelo nome ou código</label><input type="search" id="po-busca" value="' + esc(n.busca) + '" autocomplete="off">' +
      '<div class="po-filtros"><select id="po-fg" aria-label="Filtrar por gênero">' + op(gs, n.fg, 'Todos os gêneros') + '</select><select id="po-fc" aria-label="Filtrar por categoria">' + op(cs, n.fc, 'Todas as categorias') + '</select></div>' +
      '<p class="po-ajuda" style="margin:2px 0">' + l.length + ' peça(s)' + (sel.length ? ' · <b>' + sel.length + ' marcada(s)</b>' : '') + '. Toque para marcar uma ou várias.</p>' +
      '<div class="po-grade" role="group" aria-label="Peças">' + (l.length ? l.map((x) => { const on = sel.indexOf(String(x.ID)) !== -1; return '<button type="button" class="po-card" data-psel="' + esc(x.ID) + '" aria-pressed="' + on + '"><span class="po-ck" aria-hidden="true">' + (on ? '✓' : '') + '</span><img src="' + esc(fotoMini(x.Foto_URL, 240)) + '" alt="" loading="lazy"><b>' + esc(x.Nome) + '</b><small>' + esc(x.Codigo || '') + ' · ' + esc(formatarReal(x.Preco)) + '</small></button>'; }).join('') : '<p class="po-ajuda" style="padding:10px;grid-column:1/-1">Nenhuma peça com esses filtros.</p>') + '</div>' +
      '<div class="po-barra-sel"><button type="button" class="po-oc" data-a="pecas-todas">' + (todas ? '☐ Desmarcar as ' + l.length : '☑ Marcar as ' + l.length + ' da lista') + '</button>' +
      '<button type="button" class="po-enviar" data-a="usarpecas"' + (sel.length ? '' : ' disabled') + '>' + (sel.length > 1 ? '➡ Usar as ' + sel.length + ' peças (uma por vez)' : sel.length ? '➡ Usar esta peça' : 'Marque pelo menos uma peça') + '</button></div>';
  }
  function htmlNova() {
    const n = nova, p = n.p, cli = n.modoCli, livre = n.modoLivre || cli;
    let h = htmlLote() + '<div class="po-chips" role="group" aria-label="Tipo de conteúdo" style="margin-bottom:10px"><button type="button" data-modo="peca" aria-pressed="' + !livre + '">🛍️ Com peça</button><button type="button" data-modo="livre" aria-pressed="' + n.modoLivre + '">✍️ Livre</button><button type="button" data-modo="cliente" aria-pressed="' + cli + '">🧡 Ela usa TM</button></div>';
    if (livre) h += htmlLivre();
    else {
      h += '<div class="po-passo"><h4>1. Qual peça?</h4>';
      if (p) h += '<div class="po-escolhida"><img src="' + esc(fotoMini(p.Foto_URL, 120)) + '" alt="" width="40" height="50" style="border-radius:6px;object-fit:cover"><div><b>' + esc(p.Nome) + '</b><small style="display:block;color:#555">' + esc(p.Codigo || '') + ' · ' + esc(formatarReal(precoAvista(p))) + ' à vista</small></div><button type="button" data-a="trocar">Trocar</button></div>';
      else h += htmlEscolherPecas();
      h += '</div>';
      if (!p) return h;
    }
    h += '<div class="po-passo"><h4>2. O que postar?</h4><div class="po-chips" role="group" aria-label="Tipo de postagem">' + TIPOS.filter((t) => !cli || t[0] === 'story').map((t) => '<button type="button" data-tipo="' + t[0] + '" aria-pressed="' + (n.tipo === t[0]) + '">' + esc(t[1]) + '</button>').join('') + '</div>';
    h += '<p class="po-ajuda">' + ({ feed: 'Uma foto no feed (formato 4:5).', carrossel: 'De 2 a 10 mídias deslizando no mesmo post.', reels: 'Um vídeo vertical.' + (livre ? '' : ' Use o vídeo da peça ou suba um do aparelho.'), story: 'Cada foto/vídeo vira UM Story separado, na ordem.' }[n.tipo]) + '</p>';
    if (!livre) {
      h += '<div class="po-midias" role="group" aria-label="Mídias da peça">' + n.midias.map((m, i) => { const ord = m.sel ? n.midias.filter((x, j) => x.sel && j <= i).length : 0;
        return '<button type="button" class="po-m" data-m="' + i + '" aria-pressed="' + m.sel + '" aria-label="' + (m.tipo === 'video' ? 'Vídeo' : 'Foto ' + (i + 1)) + (m.sel ? ', escolhida em ' + ord + 'º' : ', não escolhida') + '"><img src="' + esc(m.tipo === 'video' ? (typeof posterDoVideo === 'function' ? posterDoVideo(m.url) : '') : fotoMini(m.url, 160)) + '" alt="" loading="lazy">' + (m.sel ? '<span class="po-n">' + ord + '</span>' : '') + (m.tipo === 'video' ? '<span class="po-v">vídeo</span>' : '') + '</button>'; }).join('') + '</div>';
      if (n.tipo === 'reels' || n.tipo === 'story' || n.tipo === 'carrossel') h += '<p class="po-ajuda"><label for="po-vid" style="font-weight:700">Vídeo do aparelho (até 40 MB):</label> <input type="file" id="po-vid" accept="video/mp4,video/webm"></p>';
    }
    if (n.tipo === 'story') {
      h += '<p class="po-ajuda" style="margin-top:10px"><label><input type="checkbox" id="po-manual"' + (n.manual ? ' checked' : '') + '> <b>Story com link</b> — o Instagram não deixa colocar link por aqui. Eu preparo tudo e você só cola o link no app (aba “Postar à mão”).</label></p>';
      if (n.manual && livre) h += '<label for="po-link" class="po-ajuda" style="display:block;margin:6px 0 2px">Link que vai no Story (https://…)</label><input type="url" id="po-link" value="' + esc(n.link) + '" placeholder="https://tenkitermodas.com.br/">';
    }
    h += '</div>';
    if (n.tipo !== 'reels') {
      const baseV = visuaisDoTipo_(n.tipo); if (n.template !== 'elausa' && !baseV.some((t) => t[0] === n.template)) n.template = baseV[0][0]; const lista = cli ? [['elausa', 'Ela usa TM']] : livre ? baseV.concat([['elausa', 'Ela usa TM']]) : baseV, itens = n.template !== 'original' ? itensTemplate(n.template, infoPeca(n.p), ...tamanhoAlvo()) : [];
      const chipsV = lista.length > 1 ? '<div class="po-chips po-chips-h" role="group" aria-label="Visual">' + lista.map((t) => '<button type="button" data-tpl="' + t[0] + '" aria-pressed="' + (n.template === t[0]) + '">' + esc(t[1]) + '</button>').join('') + '</div>' : '';
      h += (n.p ? '<label class="po-sp" style="display:flex;gap:8px;align-items:center;min-height:44px;font-weight:700"><input type="checkbox" data-sp="' + esc(String(n.p.ID)) + '"' + (ehSemPreco_(n.p) ? ' checked' : '') + '> Sem preço — mostrar “Consulte valor”</label>' : '') + '<div class="po-passo"><h4>3. Visual</h4><div class="po-sticky">' + chipsV +
        '<button type="button" data-a="previa" class="po-previa-btn">👁️ Ver como vai ficar</button><div class="po-previa" id="po-previa" tabindex="0" role="group" aria-label="Prévia da arte"></div></div>' +
        '<p class="po-ajuda">' + (n.template === 'original' ? 'A foto como está (ajustada ao formato do Instagram).' : n.template === 'elausa' ? 'A foto com o texto “Ela usa TM” (toque numa das opções ou escreva o seu). Arraste o texto na foto para onde quiser.' : 'Toque num visual e a prévia muda na hora. Arraste cada texto na prévia para onde quiser. No Story, cole o adesivo de link do Instagram em cima da “zona do link” (sem adesivo, o texto da loja fica ali). Vídeos ficam sem template.') + '</p>';
      h += '<div class="po-foto-aj" id="po-foto-aj"><div class="po-chips" role="group" aria-label="Como a foto ocupa a tela" style="margin-bottom:6px"><button type="button" data-aj="preencher" aria-pressed="' + (n.ajuste === 'preencher') + '">✂️ Cortar (preencher)</button><button type="button" data-aj="inteira" aria-pressed="' + (n.ajuste === 'inteira') + '">🖼️ Encaixar (fundo desfocado)</button><button type="button" data-aj="margem" aria-pressed="' + (n.ajuste === 'margem') + '">⬜ Com margens</button></div>' +
        (n.ajuste === 'margem' ? '<div class="po-chips" role="group" aria-label="Cor da margem" style="margin-bottom:6px">' + [['#ffffff', 'Branca'], ['#111111', 'Preta'], ['#F5F1E8', 'Creme'], ['#E67E22', 'Laranja']].map((q) => '<button type="button" data-mg="' + q[0] + '" aria-pressed="' + ((n.margemCor || '#ffffff') === q[0]) + '">' + q[1] + '</button>').join('') + '</div>' : '') +
        '<div class="po-zoom"><label for="po-zoom">🔍 Zoom da foto</label><button type="button" data-a="zoomMenos" aria-label="Afastar a foto">−</button><input type="range" id="po-zoom" data-zoom="1" min="0.3" max="4" step="0.02" value="' + ((n.fotoAtiva && n.fotoAtiva.zoom) || 1) + '" aria-label="Zoom da foto"><button type="button" data-a="zoomMais" aria-label="Aproximar a foto">+</button><button type="button" data-a="centrar" class="po-reset">↺ Centralizar</button></div>' +
        '<label class="po-mover" style="display:flex;gap:8px;align-items:center;min-height:44px"><input type="checkbox" data-a="mover"' + (n.moverFoto ? ' checked' : '') + '> ✋ Mover a foto com o dedo (desliga a rolagem sobre a prévia)</label>' +
        '<p class="po-ajuda">Arraste a foto (computador: arraste no fundo; roda do mouse = zoom). No celular, ligue “Mover a foto” e use 1 dedo para mover e 2 dedos para aproximar. O visual fica por cima, sem alterar a foto.</p></div>';
      if (n.template === 'elausa') h += '<div class="po-chips" role="group" aria-label="Textos prontos" style="margin-bottom:6px">' + VARIANTES_ELA.map((v) => '<button type="button" data-var="' + esc(v) + '" aria-pressed="' + (((n.tx.elausa || {}).marca !== undefined ? n.tx.elausa.marca : VARIANTES_ELA[0]) === v) + '">' + esc(v) + '</button>').join('') + '</div>';
      if (itens.length) h += '<details class="po-det" id="po-det"' + (n.detTx ? ' open' : '') + '><summary>✏️ Personalizar textos (' + itens.length + ')</summary><div id="po-textos">' + itens.map((it) => { const tx = (n.tx[n.template] || {})[it.k], tm = (n.tam[n.template] || {})[it.k] || 1, oc = !!((n.oculto[n.template] || {})[it.k]);
        return '<div class="po-it"><div class="po-it-top"><label for="po-tx-' + it.k + '">' + esc(it.rot) + '</label><input type="range" id="po-tm-' + it.k + '" data-tm="' + it.k + '" min="0.5" max="2" step="0.05" value="' + tm + '" aria-label="Tamanho: ' + esc(it.rot) + '"></div>' +
          '<div class="po-it-row"><input type="text" id="po-tx-' + it.k + '" data-tx="' + it.k + '" value="' + esc(tx !== undefined ? tx : it.t) + '" maxlength="90" autocomplete="off">' +
          '<button type="button" class="po-oc" data-oc="' + it.k + '" aria-pressed="' + oc + '">' + (oc ? '🙈 mostrar' : '👁 Ocultar') + '</button></div></div>'; }).join('') +
        '<p style="margin:8px 0 0"><button type="button" data-a="resetTx" class="po-reset">↺ Voltar textos e posições ao padrão</button></p></div></details>';
      h += '</div>';
    }
    const visual = n.tipo !== 'reels', nLeg = visual ? 4 : 3;
    h += '<div class="po-passo"><h4>' + nLeg + '. Legenda</h4>' + (n.tipo === 'story' ? '<p class="po-ajuda" style="margin-top:0">Story não leva legenda pela API' + (n.manual ? '; aqui ela serve de texto para copiar no app.' : ' — esta legenda só vale para Feed/Carrossel/Reels.') + '</p>' : '') + '<label for="po-leg" class="po-ajuda" style="margin:0 0 4px">Texto que acompanha a postagem</label><textarea id="po-leg" maxlength="2200">' + esc(n.legenda) + '</textarea>' +
      (livre ? '' : '<p><button type="button" data-a="legenda" style="width:auto;padding:9px 14px;min-height:44px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">↺ Refazer legenda automática</button></p>') + '</div>';
    const nItens = livre ? n.livre.length : n.midias.filter((m) => m.sel).length;
    h += '<div class="po-passo"><h4>' + (nLeg + 1) + '. Quando?</h4><div class="po-chips" role="group" aria-label="Quando">' +
      '<button type="button" data-q="agora" aria-pressed="' + (n.quando === 'agora') + '">⚡ Agora mesmo</button><button type="button" data-q="sequencia" aria-pressed="' + (n.quando === 'sequencia') + '">🔁 Na sequência</button><button type="button" data-q="agendar" aria-pressed="' + (n.quando === 'agendar') + '">🗓️ Dia e hora</button></div>' +
      '<p class="po-ajuda">' + ({ agora: 'Sai em instantes.', sequencia: 'Entra na fila e sai com intervalo curto e variado entre uma e outra (Stories: 1 a 3 min; Feed/Reels: 3 a 9 min), para parecer postagem de gente.', agendar: 'Escolha o dia e a hora. Várias postagens no mesmo horário não têm problema: saem todas, em ordem.' }[n.quando]) + '</p>' +
      (n.quando === 'agendar' ? '<p style="margin:8px 0 0"><label for="po-data" class="po-ajuda" style="margin:0 0 4px;display:block">Dia e hora (horário de Brasília)</label><input type="datetime-local" id="po-data" value="' + esc(n.data) + '"></p>' +
        (n.tipo === 'story' && nItens > 1 ? '<p class="po-ajuda"><label><input type="checkbox" id="po-seqag"' + (n.seqAgenda ? ' checked' : '') + '> Soltar os ' + nItens + ' Stories em sequência a partir desse horário (intervalo humano). Desmarcado = todos no mesmo horário.</label></p>' : '') : '') + '</div>';
    h += '<button type="button" class="po-enviar" data-a="enviar"' + (ocupado ? ' disabled' : '') + '>' + (ocupado ? 'Preparando…' : n.manual ? '✋ Preparar Story para postar à mão' : n.quando === 'agora' ? '🚀 Postar agora' : n.quando === 'sequencia' ? '🔁 Colocar na sequência' : '🗓️ Agendar postagem') + '</button>';
    return h;
  }
  function quando_(x) { const d = x.agendadoEm ? new Date(x.agendadoEm) : null; return d && !isNaN(d) ? d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function thumbs(x) { return '<div class="po-th">' + (x.midias || []).slice(0, 5).map((m) => '<img src="' + esc(m.tipo === 'video' ? (typeof posterDoVideo === 'function' ? posterDoVideo(m.url) : '') : fotoMini(m.url, 120)) + '" alt="" loading="lazy">').join('') + '</div>'; }
  const NOME_TIPO = { feed: 'Feed', carrossel: 'Carrossel', reels: 'Reels', story: 'Story' };
  function htmlFila(status, vazio) {
    const l = (fila || []).filter((x) => status.indexOf(x.status) !== -1);
    if (fila === null) return '<p class="po-ajuda">Carregando…</p>';
    if (!l.length) return '<p class="po-ajuda">' + esc(vazio) + '</p>';
    return l.map((x) => '<div class="po-item" data-id="' + x.id + '">' + thumbs(x) +
      '<div class="po-st ' + (x.status === 'erro' ? 'erro' : (x.status === 'publicado' || x.status === 'manual_feito') ? 'ok' : '') + '">' + esc(ST_TXT[x.status] || x.status) + '</div>' +
      '<p class="po-meta">' + esc(NOME_TIPO[x.tipo] || x.tipo) + ((x.midias || []).length > 1 ? ' · ' + x.midias.length + ' mídias' : '') + ' · ' + esc(quando_(x)) + (x.criadoPor ? ' · por ' + esc(x.criadoPor) : '') + '</p>' +
      (x.legenda ? '<p class="po-leg">' + esc(x.legenda) + '</p>' : '') +
      (x.erro && x.status !== 'publicado' ? '<div class="po-erro">' + esc(x.erro) + '</div>' : '') +
      '<div class="po-acoes">' +
      (x.status === 'agendado' || x.status === 'erro' ? '<button type="button" class="po-ok" data-a="agora" data-id="' + x.id + '">' + (x.status === 'erro' ? 'Tentar de novo' : 'Postar agora') + '</button>' : '') +
      (x.status === 'agendado' || x.status === 'erro' ? '<button type="button" class="po-ruim" data-a="cancelar" data-id="' + x.id + '">Cancelar</button>' : '') +
      (x.permalink ? '<a href="' + esc(x.permalink) + '" target="_blank" rel="noopener">Ver no Instagram</a>' : '') + '</div></div>').join('');
  }
  function htmlManual() {
    if (fila === null) return '<p class="po-ajuda">Carregando…</p>';
    const l = (fila || []).filter((x) => x.status === 'manual_pendente');
    if (!l.length) return '<p class="po-ajuda">Nenhum Story esperando você. Para criar um, escolha “Story com link da peça” em Nova postagem.</p>';
    return l.map((x) => '<div class="po-item" data-id="' + x.id + '">' + thumbs(x) + '<div class="po-st">✋ Falta você postar</div><p class="po-meta">Story · ' + esc(quando_(x)) + '</p>' +
      '<div class="po-passos-man"><b>Passo a passo (1 minuto):</b><ol><li>Toque em “Baixar mídia”.</li><li>Toque em “Copiar link” e abra o Instagram.</li><li>Crie o Story com a mídia e use a figurinha <b>Link</b> colando o endereço.</li><li>Volte aqui e toque em “Já postei”.</li></ol></div>' +
      '<p class="po-meta">Link: ' + esc(x.link || '') + '</p><div class="po-acoes">' +
      (x.midias || []).map((m, i) => '<a href="' + esc(m.url) + '" download target="_blank" rel="noopener">⬇ Baixar mídia' + ((x.midias || []).length > 1 ? ' ' + (i + 1) : '') + '</a>').join('') +
      '<button type="button" data-a="copiar-link" data-id="' + x.id + '">🔗 Copiar link</button>' + (x.legenda ? '<button type="button" data-a="copiar-leg" data-id="' + x.id + '">📋 Copiar texto</button>' : '') +
      '<a href="https://www.instagram.com/" target="_blank" rel="noopener">Abrir o Instagram</a>' +
      '<button type="button" class="po-ok" data-a="feito" data-id="' + x.id + '">✔ Já postei</button><button type="button" class="po-ruim" data-a="cancelar" data-id="' + x.id + '">Cancelar</button></div></div>').join('');
  }

  /* ---------- eventos ---------- */
  function entrada(ev) {
    const t = ev.target;
    if (t.id === 'po-busca') { nova.busca = t.value; const pos = t.selectionStart; desenhar(); const n = $('po-busca'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }
    else if (t.id === 'po-leg') { nova.legenda = t.value; nova.legendaMexida = true; }
    else if (t.id === 'po-data') nova.data = t.value;
    else if (t.dataset && t.dataset.tx !== undefined) { (nova.tx[nova.template] = nova.tx[nova.template] || {})[t.dataset.tx] = t.value; repintar(); }
    else if (t.dataset && t.dataset.zoom !== undefined) { const m = fotoAtiva_(); if (m) { m.zoom = Number(t.value) || 1; limitesFoto_(m); repintar(); } }
    else if (t.dataset && t.dataset.a === 'mover') { nova.moverFoto = t.checked; repintar(); }
    else if (t.dataset && t.dataset.tm !== undefined) { (nova.tam[nova.template] = nova.tam[nova.template] || {})[t.dataset.tm] = Number(t.value) || 1; repintar(); }
    else if (t.id === 'po-f-whats') formFoto.whats = t.value;
    else if (t.id === 'po-f-ig') formFoto.ig = t.value;
    else if (t.id === 'po-f-obs') formFoto.obs = t.value;
    else if (t.dataset && t.dataset.fsel !== undefined) { const id = Number(t.dataset.fsel); if (t.checked) selFotos.add(id); else selFotos.delete(id); desenhar(); }
    else if (t.id === 'po-fg') { nova.fg = t.value; desenhar(); }
    else if (t.id === 'po-fc') { nova.fc = t.value; desenhar(); }
    else if (t.id === 'po-link') nova.link = t.value;
    else if (t.id === 'po-seqag') nova.seqAgenda = t.checked;
    else if (t.dataset && t.dataset.hora !== undefined) { const m = nova.livre[Number(t.dataset.hora)]; if (m) m.hora = t.value; }
    else if (t.id === 'po-livre-arq' && t.files && t.files.length) { adicionarLivres(Array.from(t.files)); t.value = ''; }
    else if (t.id === 'po-manual') { nova.manual = t.checked; desenhar(); }
    else if (t.id === 'po-vid' && t.files && t.files[0]) videoDoAparelho(t.files[0]);
  }
  function msg(t, erro) { aviso = t || ''; avisoErro = !!erro; desenhar(); const c = $('po-corpo'); if (c && t) c.scrollTop = 0; }
  async function clique(ev) {
    const b = ev.target.closest('button, a'); if (!b || b.tagName === 'A') return;
    const d = b.dataset;
    if (d.ff) { fotosFiltro = d.ff; selFotos.clear(); fotos = null; desenhar(); return carregarFotos(); }
    if (d.fa) { const r = await ig('/fotos/acao', 'POST', { ids: [Number(d.id)], acao: d.fa }); if (!r.ok) return msg(erroTxt(r), true); selFotos.delete(Number(d.id)); return carregarFotos(); }
    if (d.a === 'fotoform') { formFoto.aberto = !formFoto.aberto; formFoto.msg = ''; return desenhar(); }
    if (d.a === 'fotosalvar') return salvarFotosEquipe();
    if (d.a === 'fotousar') return usarFotos();
    if (d.aj) { nova.ajuste = d.aj; itensDaPostagem().forEach((m) => { m.zoom = 1; m.fx = 0; m.fy = 0; }); return desenhar(); }
    if (d.mg) { nova.margemCor = d.mg; return desenhar(); }
    if (d.a === 'zoomMais' || d.a === 'zoomMenos') { const m = fotoAtiva_(); if (m) { m.zoom = (m.zoom || 1) * (d.a === 'zoomMais' ? 1.1 : 1 / 1.1); limitesFoto_(m); const z = $('po-zoom'); if (z) z.value = m.zoom; repintar(); } return; }
    if (d.a === 'centrar') { const m = fotoAtiva_(); if (m) { m.zoom = 1; m.fx = 0; m.fy = 0; const z = $('po-zoom'); if (z) z.value = 1; repintar(); } return; }
    if (d.var) { (nova.tx.elausa = nova.tx.elausa || {}).marca = d.var; return desenhar(); }
    if (d.a === 'resetTx') { delete nova.tx[nova.template]; delete nova.tam[nova.template]; itensDaPostagem().forEach((m) => { if (m.pos) delete m.pos[nova.template]; }); return desenhar(); }
    if (d.modo) {
      const antes = nova.modoCli ? 'cliente' : nova.modoLivre ? 'livre' : 'peca';
      if (antes !== d.modo && antes !== 'peca') { nova.livre.forEach((m) => { try { if (!m.fotoId) URL.revokeObjectURL(m.url); } catch (e) {} }); nova.livre = []; }
      nova.modoLivre = d.modo === 'livre'; nova.modoCli = d.modo === 'cliente'; if (nova.modoCli) carregarFotosNovas();
      if (d.modo === 'peca') { if (nova.template === 'original' || nova.template === 'elausa') nova.template = 'classico'; nova.selPecas = []; }
      else { nova.p = null; nova.midias = []; if (d.modo === 'cliente') { nova.tipo = 'story'; nova.template = 'elausa'; nova.manual = false; } else if (nova.template !== 'elausa' && !todosVisuais_().some((t) => t[0] === nova.template)) nova.template = 'original'; }
      nova.previa = false; return desenhar();
    }
    if (d.lm) { const i = Number(d.i), L = nova.livre; if (d.lm === 'x') { try { URL.revokeObjectURL(L[i].url); } catch (e) {} L.splice(i, 1); } else { const k = d.lm === 'up' ? i - 1 : i + 1; if (L[k]) { const t = L[i]; L[i] = L[k]; L[k] = t; } } return desenhar(); }
    if (d.psel) { const id = String(d.psel), i = nova.selPecas.indexOf(id); if (i === -1) nova.selPecas.push(id); else nova.selPecas.splice(i, 1); const g = document.querySelector('.po-grade'), y = g ? g.scrollTop : 0; desenhar(); const g2 = document.querySelector('.po-grade'); if (g2) g2.scrollTop = y; return; }
    if (d.fcli) { const x = (fotosNovas || []).find((q) => String(q.id) === String(d.fcli)); if (!x) return; const i = nova.livre.findIndex((m) => m.fotoId === x.id); if (i === -1) nova.livre.push(fotoParaLivre(x)); else nova.livre.splice(i, 1); nova.previa = false; const g = document.querySelector('.po-grade'), y = g ? g.scrollTop : 0; desenhar(); const g2 = document.querySelector('.po-grade'); if (g2) g2.scrollTop = y; return; }
    if (d.oc !== undefined) { const t = nova.template, o = (nova.oculto[t] = nova.oculto[t] || {}); o[d.oc] = !o[d.oc]; return desenhar(); }
    if (d.peca) return escolherPeca(d.peca);
    if (d.lote) return escolherPeca(d.lote);
    if (d.loteX) { nova.lote = nova.lote.filter((i) => i !== d.loteX); if (nova.p && String(nova.p.ID) === d.loteX) { nova.p = null; nova.midias = []; } return desenhar(); }
    if (d.tipo) { nova.tipo = d.tipo; if (d.tipo !== 'story') nova.manual = false; nova.template = d.tipo === 'reels' ? 'original' : (nova.template || 'classico'); ajustarSelecao(); nova.previa = false; return desenhar(); }
    if (d.tpl) { nova.template = d.tpl; nova.previa = false; return desenhar(); }
    if (d.q) { nova.quando = d.q; if (d.q === 'agendar' && !nova.data) nova.data = dataLocalPadrao(); return desenhar(); }
    if (d.m !== undefined) { const m = nova.midias[Number(d.m)]; if (!m) return; m.sel = !m.sel; if (nova.tipo === 'feed' && m.sel) nova.midias.forEach((x) => { if (x !== m) x.sel = false; }); if (nova.tipo === 'reels') nova.midias.forEach((x) => { if (x !== m) x.sel = false; }); nova.previa = false; return desenhar(); }
    const a = d.a; if (!a) return;
    if (a === 'pecas-todas') { const l = pecasFiltradas().map((x) => String(x.ID)), todas = l.every((i) => nova.selPecas.indexOf(i) !== -1); nova.selPecas = todas ? nova.selPecas.filter((i) => l.indexOf(i) === -1) : nova.selPecas.concat(l.filter((i) => nova.selPecas.indexOf(i) === -1)); return desenhar(); }
    if (a === 'usarpecas') { const ids = nova.selPecas.slice(); if (!ids.length) return; nova.lote = ids; nova.selPecas = []; aviso = ids.length > 1 ? ids.length + ' peças na lista. Vamos uma por uma, com as mesmas escolhas.' : ''; avisoErro = false; return escolherPeca(ids[0]); }
    if (a === 'fotos-todas') { const l = fotosNovas || [], todas = l.every((x) => nova.livre.some((m) => m.fotoId === x.id)); if (todas) nova.livre = nova.livre.filter((m) => !l.some((x) => x.id === m.fotoId)); else l.forEach((x) => { if (!nova.livre.some((m) => m.fotoId === x.id)) nova.livre.push(fotoParaLivre(x)); }); nova.previa = false; return desenhar(); }
    if (a === 'trocar') { nova.p = null; nova.midias = []; nova.previa = false; return desenhar(); }
    if (a === 'legenda') { nova.legenda = legendaPadrao(); nova.legendaMexida = false; return desenhar(); }
    if (a === 'previa') { nova.previa = true; return desenhar(); }
    if (a === 'enviar') return enviar();
    const id = Number(d.id);
    if (a === 'cancelar') { if (!confirm('Cancelar esta postagem?')) return; const r = await ig('/post/cancelar', 'POST', { id }); return r.ok ? (aviso = 'Cancelada.', avisoErro = false, carregarFila()) : msg(erroTxt(r), true); }
    if (a === 'agora') { const r = await ig('/post/reagendar', 'POST', { id, quando: 'agora' }); return r.ok ? (aviso = 'Mandei para publicar. Em poucos instantes aparece em “Já postadas”.', avisoErro = false, carregarFila()) : msg(erroTxt(r), true); }
    if (a === 'feito') { const r = await ig('/post/feito', 'POST', { id }); return r.ok ? (aviso = 'Anotado como postado. 👏', avisoErro = false, carregarFila()) : msg(erroTxt(r), true); }
    if (a === 'copiar-link' || a === 'copiar-leg') { const x = (fila || []).find((q) => q.id === id); if (x) copiar(a === 'copiar-link' ? x.link : x.legenda); }
  }
  async function copiar(t) {
    try { await navigator.clipboard.writeText(String(t || '')); aviso = 'Copiado! Agora cole no Instagram.'; avisoErro = false; desenhar(); }
    catch (e) { window.prompt('Copie o texto abaixo:', String(t || '')); }
  }
  function dataLocalPadrao() { const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); const z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); }

  /* ---------- imagem (canvas) ---------- */
  function carregarImagem(url) {
    return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('Não consegui abrir uma das fotos.')); i.src = url; });
  }
  function cobrir(ctx, img, x, y, w, h) { const r = Math.max(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); ctx.restore(); }
  function caber(ctx, img, x, y, w, h) { const r = Math.min(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r; ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); }
  function quebrar(ctx, texto, largura, max) { const pal = String(texto).split(/\s+/), l = []; let cur = ''; pal.forEach((p) => { const t = cur ? cur + ' ' + p : p; if (ctx.measureText(t).width > largura && cur) { l.push(cur); cur = p; } else cur = t; }); if (cur) l.push(cur); if (l.length > max) { l.length = max; l[max - 1] = l[max - 1].replace(/.?.?$/, '…'); } return l; }
  function infoPeca(p) {
    if (!p) return { semPreco: false, nome: '', avista: '', cheio: '', codigo: '', tam: '', cores: '', cat: '', gen: '', comLink: false };
    const tp = (v) => String(typeof textoPlano === 'function' ? textoPlano(v) : v || '').trim(), pri = (v) => String(v || '').split(',')[0].trim();
    const semP = ehSemPreco_(p);
    return { semPreco: semP, nome: String(p.Nome || '').trim(), avista: semP ? '' : formatarReal(precoAvista(p)), cheio: formatarReal(p.Preco), codigo: String(p.Codigo || ''), tam: tp(p.Tamanhos), cores: tp(p.Cores), cat: pri(p.Categoria), gen: pri(p.Genero), comLink: !!(nova && nova.tipo === 'story' && nova.manual) };
  }
  const FONTE = '"Helvetica Neue", Arial, sans-serif', LARANJA = '#E67E22';
  const VARIANTES_ELA = ['ElausaTM🧡', 'EleusaTM🧡', 'ElasusamTM🧡', 'ElesusamTM🧡'];
  const FONTE_MANUAL = '"Segoe Script","Brush Script MT","Lucida Handwriting","Snell Roundhand",cursive';
  /* ---------- Motor de templates (v5.1) ----------
   * Cada visual = fundo + GRUPOS de itens empilhados a partir de uma borda (baixo/topo/meio). O texto se AJUSTA sozinho (encolhe ou quebra em
   * linhas) para caber na largura do grupo, e a altura de cada item é medida de verdade — por isso nada se sobrepõe nem sai cortado.
   * "Zona de link" (k:'zona') = caixa com texto padrão da marca no lugar onde o adesivo de link do Instagram será colado por cima: sem adesivo,
   * o texto padrão fica bonito; com adesivo, ele cobre a zona. Tudo continua editável (texto, tamanho, ocultar) e arrastável por foto. */
  const FONTE_T = '"Poppins","Inter","Helvetica Neue",Arial,sans-serif', FONTE_I = '"Inter","Helvetica Neue",Arial,sans-serif';
  const BEGE = '#F5F1E8', CINZA = '#2C2C2C', OURO = '#F39C12', PRETO = '#1a1a1a';
  const PLACEHOLDERS_ = ['nome', 'avista', 'cheio', 'codigo', 'tam', 'cores', 'cat', 'gen'];
  function especCustom_(c, info) {
    const sp = JSON.parse(JSON.stringify(c.spec));
    if (Array.isArray(sp.camadas)) {
      const sub2 = (t) => String(t == null ? '' : t).replace(/\{(nome|avista|cheio|codigo|tam|cores|cat|gen)\}/g, (m, k) => (info[k] == null ? '' : info[k]));
      sp.camadas.forEach((q) => { if (q.tipo !== 'texto') return; let t = sub2(q.t); const mx = Number(q.max) || 0; if (mx > 0 && t.length > mx) t = t.slice(0, Math.max(1, mx - 1)).trim() + '…'; q.t = t; });
      sp.itens = sp.camadas.filter((q) => q.tipo === 'texto'); sp.grupos = []; if (!sp.fundo) sp.fundo = 'foto'; return sp;
    }
    sp.grupos = Array.isArray(sp.grupos) ? sp.grupos : []; sp.itens = Array.isArray(sp.itens) ? sp.itens : [];
    const sub = (t) => String(t == null ? '' : t).replace(/\{(nome|avista|cheio|codigo|tam|cores|cat|gen)\}/g, (m, k) => (info[k] == null ? '' : info[k]));
    sp.itens.forEach((it) => { let t = sub(it.t); const mx = Number(it.max) || 0; if (mx > 0 && t.length > mx) t = t.slice(0, Math.max(1, mx - 1)).trim() + '…'; it.t = t; });
    if (!sp.fundo) sp.fundo = 'foto';
    return sp;
  }
  function posEspec_(r, info, tpl) {
    if (r && r.itens && info) {
      if (info.semPreco) r.itens.forEach((it) => { if (it.k === 'preco' || it.papel === 'preco') { it.t = 'Consulte valor'; delete it.big; it.tam = Math.round((it.tam || 80) * 0.5); it.linhas = 1; } });
      if (!info.comLink) r.itens.forEach((it) => { if (it.k === 'zona' || it.papel === 'zona') it.t = ctaDoVisual_(tpl); });
    }
    return r;
  }
  function especTemplate(tpl, info, W, H) {
    const cu = customPorId_(tpl);
    const r = cu ? especCustom_(cu, info || {}) : especTemplateBase(tpl, info, W, H);
    if (r && cu && cu.spec && cu.spec.base) r.base = cu.spec.base;
    return posEspec_(r, info, tpl);
  }
  function especTemplateBase(tpl, info, W, H) {
    if (ARTES[tpl]) return especArte(tpl, info, W, H);
    const story = H > W * 1.5, preco = info.avista ? info.avista + ' à vista' : '';
    const selo = (t, grp) => ({ k: 'selo', rot: 'Selo', t: t || 'NOVIDADE', grp: grp, tam: 38, cor: PRETO, bg: LARANJA, padX: 0.7, padY: 0.38, radius: 0.18 });
    const nome = (grp, o) => Object.assign({ k: 'nome', rot: 'Nome da peça', t: info.nome, grp: grp, tam: 66, cor: BEGE, linhas: 2, sombra: true }, o || {});
    const precoIt = (grp, o) => Object.assign({ k: 'preco', rot: 'Preço', t: preco, grp: grp, tam: 88, cor: OURO, sombra: true }, o || {});
    const codigo = (grp, o) => Object.assign({ k: 'codigo', rot: 'Código', t: info.codigo ? 'Código ' + info.codigo + ' · TENKiTER Modas' : '', grp: grp, tam: 34, cor: BEGE, peso: 'normal', sombra: true }, o || {});
    const zona = (grp, t, o) => Object.assign({ k: 'zona', rot: 'Zona do link (texto padrão)', t: t, grp: grp, tam: 40, cor: BEGE, wz: 0.6, padY: 0.5, sombra: false }, o || {});
    const dy = story ? 0.04 : 0;      // no Story a base sobe um pouco: a barra de resposta do Instagram cobre o rodapé
    if (tpl === 'classico') return { fundo: 'baixo', grupos: [
      { id: 'a', anc: 't', y: 0.05, x: 0.05, al: 'left' }, { id: 'b', anc: 'b', y: 0.14 + dy, x: 0.05, al: 'left', w: 0.9, gap: 8 }, { id: 'c', anc: 'b', y: 0.04 + dy, x: 0.5, al: 'center' }],
      itens: [selo('NOVIDADE', 'a'), nome('b'), precoIt('b'), codigo('b'), zona('c', 'www.tenkiter.com.br', { sub: { cor: LARANJA, w: 3 }, wz: 0.6 })] };
    if (tpl === 'promo') return { fundo: 'ambos', grupos: [
      { id: 'a', anc: 't', y: 0.05, x: 0.05, al: 'left' }, { id: 'p', anc: 't', y: 0.115, x: 0.05, al: 'left', w: 0.9 }, { id: 'b', anc: 'b', y: 0.2 + dy, x: 0.05, al: 'left', w: 0.9 }, { id: 'c', anc: 'b', y: 0.05 + dy, x: 0.5, al: 'center' }],
      itens: [selo('PROMOÇÃO', 'a'), precoIt('p', { tam: 170 }), nome('b', { tam: 64 }), zona('c', 'Compre Online', { cor: OURO, bg: 'rgba(44,44,44,.62)', radius: 0.22, padY: 0.55 })] };
    if (tpl === 'minimal') return { fundo: 'baixo', grupos: [
      { id: 'a', anc: 't', y: 0.05, x: 0.5, al: 'center' }, { id: 'b', anc: 'b', y: 0.15 + dy, x: 0.5, al: 'center', w: 0.88, gap: 10 }, { id: 'c', anc: 'b', y: 0.05 + dy, x: 0.5, al: 'center' }],
      itens: [selo('NOVIDADE', 'a'), nome('b', { al: 'center' }), precoIt('b'), zona('c', info.codigo ? 'Código ' + info.codigo : 'TENKiTER Modas', { wz: 0.7, setas: LARANJA, tam: 38 })] };
    if (tpl === 'rodape') return { fundo: 'rodape', grupos: [
      { id: 'b', anc: 'm', y: 0.875, x: 0.05, al: 'left', w: 0.44, gap: 8 }, { id: 'c', anc: 'm', y: 0.875, x: 0.95, al: 'right' }],
      itens: [nome('b', { tam: 50 }), precoIt('b', { tam: 70 }), zona('c', 'Toque e Compre', { wz: 0.42, bg: LARANJA, cor: CINZA, radius: 0.12, padY: 0.7, tam: 40 })] };
    if (tpl === 'lateral') return { fundo: 'baixo-dir', grupos: [
      { id: 'a', anc: 't', y: 0.05, x: 0.95, al: 'right' }, { id: 'b', anc: 'b', y: 0.2 + dy, x: 0.95, al: 'right', w: 0.7, gap: 8 }, { id: 'c', anc: 'b', y: 0.08 + dy, x: 0.95, al: 'right' }],
      itens: [selo('NOVIDADE', 'a'), nome('b'), precoIt('b'), zona('c', '@tenkitermodas', { wz: 0.5, borda: { cor: BEGE, w: 2, dash: true }, padY: 0.55, tam: 38 })] };
    if (tpl === 'cabecalho') return { fundo: 'topo', grupos: [
      { id: 'b', anc: 't', y: 0.1, x: 0.05, al: 'left', w: 0.88, gap: 8 }, { id: 'c', anc: 'b', y: 0.03 + dy, x: 0.5, al: 'center' }],
      itens: [precoIt('b', { tam: 110 }), nome('b', { tam: 60 }), zona('c', 'www.tenkiter.com.br', { wz: 1, fade: true, padY: 0.7 })] };
    if (tpl === 'energia') return { fundo: 'energia', grupos: [
      { id: 'b', anc: 'm', y: 0.9, x: 0.05, al: 'left', w: 0.44, gap: 6 }, { id: 'c', anc: 'm', y: 0.9, x: 0.95, al: 'right' }],
      itens: [nome('b', { tam: 48, cor: PRETO, sombra: false }), precoIt('b', { tam: 68, cor: PRETO, sombra: false }), zona('c', 'Clique Aqui', { wz: 0.4, bg: BEGE, cor: CINZA, radius: 0.16, padY: 0.65 })] };
    if (tpl === 'blocos') return { fundo: 'ambos', grupos: [
      { id: 'a', anc: 't', y: 0.08, x: 0.05, al: 'left', w: 0.88, gap: 12 }, { id: 'b', anc: 'b', y: 0.15 + dy, x: 0.05, al: 'left', w: 0.9 }, { id: 'c', anc: 'b', y: 0.05 + dy, x: 0.95, al: 'right' }],
      itens: [selo('NOVIDADE', 'a'), nome('a'), precoIt('b', { tam: 96 }), zona('c', 'Ver no Site', { wz: 0.5, bg: BEGE, cor: CINZA, radius: 0.2, padY: 0.6, sombraCx: true })] };
    if (tpl === 'editorial') return { fundo: 'direita', grupos: [
      { id: 'a', anc: 't', y: 0.2, x: 0.95, al: 'right', w: 0.36, gap: 6 }, { id: 'c', anc: 'b', y: 0.05 + dy, x: 0.95, al: 'right' }],
      itens: [precoIt('a', { tam: 80, linhas: 2 }), nome('a', { tam: 48, linhas: 3 }), codigo('a', { t: info.codigo || '', tam: 28 }), zona('c', 'WhatsApp →', { wz: 0.5, bl: { cor: LARANJA, w: 5 }, txtAl: 'left', padX: 0.5, padY: 0.45 })] };
    if (tpl === 'cartao') return { fundo: 'baixo-leve', grupos: [
      { id: 'a', anc: 'b', y: 0.05 + dy, x: 0.5, al: 'center', fw: 0.9, gap: 10, caixa: { cor: BEGE, r: 26, pad: 28, sombra: true } }],
      itens: [nome('a', { cor: CINZA, sombra: false, tam: 54, al: 'center' }), precoIt('a', { cor: '#A85200', sombra: false, tam: 72 }), zona('a', 'Chame no WhatsApp', { wz: 'cheio', bg: CINZA, radius: 0.16, padY: 0.6, tam: 42 })] };
    if (tpl === 'elausa') return { fundo: 'foto', grupos: [{ id: 'a', anc: 'm', y: 0.72, x: 0.5, al: 'center', w: 0.9 }],
      itens: [{ k: 'marca', rot: 'Texto', t: VARIANTES_ELA[0], grp: 'a', tam: 120, cor: '#fff', estilo: 'italic', fonte: FONTE_MANUAL, sombra: true, al: 'center' }] };
    return { fundo: 'foto', grupos: [], itens: [] };
  }
  function itensTemplate(tpl, info, W, H) { return especTemplate(tpl, info, W, H).itens; }
  const _mc = document.createElement('canvas').getContext('2d');
  function fonteDe(it, tam) { return (it.estilo ? it.estilo + ' ' : '') + (it.peso || 'bold') + ' ' + tam + 'px ' + (it.fonte || (it.peso === 'normal' ? FONTE_I : FONTE_T)); }
  /* ---------- v5.2: ARTES (visuais desenhados) ----------
   * Inspirados no PDF de referência do Pablo (só o estilo: arcos, painéis curvos, janela da foto, pílula de botão com ícone, ícones em círculo,
   * texto vertical, preço grande) — NENHUM texto do PDF é usado: tudo vem dos dados da peça (nome, preço, categoria, gênero, tamanhos, cores, código)
   * e cada item continua editável, ocultável e arrastável. A foto fica numa JANELA (arco, retângulo arredondado…) por cima de formas da marca,
   * então nenhum texto cobre a peça e o resultado fica bonito com qualquer foto. */
  const CREME = '#F5F1E8', CREME2 = '#FBF8F2', LARANJA_TXT = '#A85200', TXT_SUAVE = '#555';
  const ARTES = { classico: 1, promo: 1, minimal: 1, rodape: 1, lateral: 1, cabecalho: 1, energia: 1, blocos: 1, editorial: 1, cartao: 1 };
  function caminhoJanela(ctx, x0, y0, x1, y1, forma) {
    const w = x1 - x0; ctx.beginPath();
    if (forma === 'arco') { const r = w / 2; ctx.moveTo(x0, y1); ctx.lineTo(x0, y0 + r); ctx.arc(x0 + r, y0 + r, r, Math.PI, 0); ctx.lineTo(x1, y1); ctx.closePath(); }
    else if (forma === 'cantos') { const r = Math.min(150, w * 0.3), s = 26; ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - s, y0); ctx.arcTo(x1, y0, x1, y0 + s, s); ctx.lineTo(x1, y1 - r); ctx.arcTo(x1, y1, x1 - r, y1, r); ctx.lineTo(x0 + s, y1); ctx.arcTo(x0, y1, x0, y1 - s, s); ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r); ctx.closePath(); }
    else caixaArredondada(ctx, x0, y0, x1, y1, 44);
  }
  function fotoNaRegiao(ctx, img, x, y, w, h, aj) {
    if (aj === 'inteira') { ctx.fillStyle = '#222'; ctx.fillRect(x, y, w, h); try { ctx.save(); ctx.filter = 'blur(30px)'; cobrir(ctx, img, x - 40, y - 40, w + 80, h + 80); ctx.restore(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y, w, h); } catch (e) { /* sem blur */ } caber(ctx, img, x, y, w, h); }
    else cobrir(ctx, img, x, y, w, h);
  }
  function janelaFoto(ctx, img, x0, y0, x1, y1, forma, aj, borda) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 12; ctx.fillStyle = '#fff'; caminhoJanela(ctx, x0, y0, x1, y1, forma); ctx.fill(); ctx.restore();
    ctx.save(); caminhoJanela(ctx, x0, y0, x1, y1, forma); ctx.clip(); fotoNaRegiao(ctx, img, x0, y0, x1 - x0, y1 - y0, aj); ctx.restore();
    if (borda) { ctx.save(); ctx.strokeStyle = borda; ctx.lineWidth = 6; caminhoJanela(ctx, x0, y0, x1, y1, forma); ctx.stroke(); ctx.restore(); }
  }
  function baseCreme(ctx, W, H, forte) { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, forte ? CREME : CREME2); g.addColorStop(1, forte ? '#EBE3D2' : CREME); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  function curvaLado(ctx, W, H, lado, cor, prof) {
    ctx.save(); ctx.fillStyle = cor; ctx.beginPath();
    const X = (f) => (lado === 'dir' ? W * (1 - f) : W * f);
    ctx.moveTo(lado === 'dir' ? W : 0, 0); ctx.lineTo(X(prof), 0); ctx.bezierCurveTo(X(prof * 0.3), H * 0.26, X(prof * 1.25), H * 0.56, X(prof * 0.5), H); ctx.lineTo(lado === 'dir' ? W : 0, H); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function arcoLinha(ctx, cx, cy, r, cor, w, a0, a1) { ctx.save(); ctx.strokeStyle = cor; ctx.lineWidth = w || 3; ctx.beginPath(); ctx.arc(cx, cy, r, a0 == null ? 0 : a0, a1 == null ? Math.PI * 2 : a1); ctx.stroke(); ctx.restore(); }
  function discoSuave(ctx, cx, cy, rx, ry, cor) { ctx.save(); ctx.fillStyle = cor; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  /** Desenha o fundo + a foto de cada visual. `story` = formato alto (sobra espaço em cima e embaixo). */
  function desenharArte(ctx, img, W, H, tpl, aj) {
    const story = H > W * 1.5, ty = story ? H * 0.075 : H * 0.035, by = story ? H * 0.92 : H * 0.965;
    if (tpl === 'classico') {
      baseCreme(ctx, W, H); curvaLado(ctx, W, H, 'dir', LARANJA, 0.4); discoSuave(ctx, W * 0.64, H * 0.5, W * 0.4, H * 0.47, 'rgba(255,255,255,.7)');
      arcoLinha(ctx, 0, H, W * 0.5, 'rgba(230,126,34,.55)', 3, -Math.PI / 2, 0); arcoLinha(ctx, 0, H, W * 0.56, 'rgba(230,126,34,.3)', 2, -Math.PI / 2, 0);
      janelaFoto(ctx, img, W * 0.3, ty, W * 0.97, by, 'arco', aj);
    } else if (tpl === 'promo') {
      baseCreme(ctx, W, H, true); curvaLado(ctx, W, H, 'dir', LARANJA, 0.3); discoSuave(ctx, W * 0.68, H * 0.52, W * 0.36, H * 0.44, 'rgba(255,255,255,.75)');
      arcoLinha(ctx, W * 0.1, 0, W * 0.34, 'rgba(230,126,34,.5)', 3, 0, Math.PI / 2);
      janelaFoto(ctx, img, W * 0.38, ty, W * 0.97, by, 'arco', aj);
    } else if (tpl === 'minimal') {
      cobrir(ctx, img, 0, 0, W, H); if (aj === 'inteira') fundoFoto(ctx, img, W, H, 'inteira');
      ctx.save(); ctx.fillStyle = LARANJA; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.4, 0); ctx.bezierCurveTo(W * 0.3, H * 0.05, W * 0.08, H * 0.1, 0, H * 0.2); ctx.closePath(); ctx.fill(); ctx.restore();
      arcoLinha(ctx, 0, 0, W * 0.5, 'rgba(255,255,255,.85)', 3, 0, Math.PI / 2); arcoLinha(ctx, W, H, W * 0.42, 'rgba(230,126,34,.9)', 5, Math.PI, Math.PI * 1.5);
    } else if (tpl === 'rodape') {
      baseCreme(ctx, W, H); curvaLado(ctx, W, H, 'dir', LARANJA, 0.27); arcoLinha(ctx, W * 0.08, 0, W * 0.3, 'rgba(230,126,34,.5)', 3, 0, Math.PI / 2);
      arcoLinha(ctx, 0, H, W * 0.36, 'rgba(230,126,34,.4)', 3, -Math.PI / 2, 0);
      janelaFoto(ctx, img, W * 0.42, ty, W * 0.98, by, 'ret', aj);
    } else if (tpl === 'lateral') {
      baseCreme(ctx, W, H, true); discoSuave(ctx, W * 0.9, H * 0.18, W * 0.3, W * 0.3, 'rgba(230,126,34,.18)'); arcoLinha(ctx, W, H, W * 0.42, 'rgba(230,126,34,.5)', 3, Math.PI, Math.PI * 1.5);
      ctx.save(); ctx.fillStyle = LARANJA; caixaArredondada(ctx, W * 0.045, ty + 24, W * 0.665, by + 20, 44); ctx.fill(); ctx.restore();
      janelaFoto(ctx, img, W * 0.02, ty, W * 0.64, by, 'cantos', aj);
    } else if (tpl === 'cabecalho') {
      baseCreme(ctx, W, H); curvaLado(ctx, W, H, 'esq', 'rgba(230,126,34,.9)', 0.09); discoSuave(ctx, W * 0.7, H * 0.5, W * 0.32, H * 0.45, 'rgba(255,255,255,.7)');
      arcoLinha(ctx, 0, H, W * 0.46, 'rgba(230,126,34,.5)', 3, -Math.PI / 2, 0);
      janelaFoto(ctx, img, W * 0.42, ty, W * 0.98, by, 'arco', aj);
    } else if (tpl === 'energia') {
      baseCreme(ctx, W, H, true); ctx.save(); ctx.fillStyle = LARANJA; ctx.beginPath(); ctx.arc(0, 0, W * 0.4, 0, Math.PI / 2); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); ctx.restore();
      arcoLinha(ctx, 0, 0, W * 0.47, 'rgba(230,126,34,.45)', 3, 0, Math.PI / 2); arcoLinha(ctx, W, H, W * 0.4, 'rgba(230,126,34,.5)', 3, Math.PI, Math.PI * 1.5);
      janelaFoto(ctx, img, W * 0.4, ty, W * 0.98, by, 'ret', aj);
    } else if (tpl === 'blocos') {
      baseCreme(ctx, W, H); curvaLado(ctx, W, H, 'dir', LARANJA, 0.42); discoSuave(ctx, W * 0.32, H * 0.5, W * 0.34, H * 0.46, 'rgba(255,255,255,.7)');
      arcoLinha(ctx, W, 0, W * 0.3, 'rgba(26,26,26,.25)', 3, Math.PI / 2, Math.PI);
      janelaFoto(ctx, img, W * 0.03, ty, W * 0.6, by, 'arco', aj);
    } else if (tpl === 'editorial') {
      baseCreme(ctx, W, H, true); ctx.fillStyle = LARANJA; ctx.fillRect(0, 0, W * 0.085, H);
      discoSuave(ctx, W * 0.5, H * 0.5, W * 0.34, H * 0.47, 'rgba(255,255,255,.7)'); arcoLinha(ctx, W, H, W * 0.36, 'rgba(230,126,34,.5)', 3, Math.PI, Math.PI * 1.5);
      janelaFoto(ctx, img, W * 0.13, ty, W * 0.66, by, 'ret', aj);
    } else if (tpl === 'cartao') {
      baseCreme(ctx, W, H); discoSuave(ctx, W * 0.68, H * 0.5, W * 0.4, H * 0.48, 'rgba(255,255,255,.75)'); arcoLinha(ctx, W, 0, W * 0.32, 'rgba(230,126,34,.5)', 3, Math.PI / 2, Math.PI);
      ctx.save(); ctx.fillStyle = 'rgba(26,26,26,.9)'; caixaArredondada(ctx, W * 0.395, ty + 22, W * 0.985, by + 18, 44); ctx.fill(); ctx.restore();
      janelaFoto(ctx, img, W * 0.37, ty, W * 0.96, by, 'cantos', aj);
    }
  }

  /* ---------- itens novos: texto espaçado (caps), vertical, nome em 2 cores/pilha, preço grande, botão com ícone, ícone em círculo ---------- */
  function iconeCirculo(ctx, ic, cx, cy, r, cor) {
    ctx.save(); ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineWidth = Math.max(2, r * 0.1); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const u = r * 0.5;
    if (ic === 'tam') { ctx.strokeRect(cx - u * 1.1, cy - u * 0.45, u * 2.2, u * 0.9); for (let i = 0; i < 5; i++) { const x = cx - u * 0.88 + i * u * 0.44; ctx.beginPath(); ctx.moveTo(x, cy - u * 0.45); ctx.lineTo(x, cy + (i % 2 ? -0.05 : 0.12) * u); ctx.stroke(); } }
    else if (ic === 'cor') { [[-0.5, 0.15], [0.5, 0.15], [0, -0.5]].forEach((p) => { ctx.beginPath(); ctx.arc(cx + p[0] * u, cy + p[1] * u, u * 0.62, 0, Math.PI * 2); ctx.stroke(); }); }
    else if (ic === 'cat') { ctx.beginPath(); ctx.moveTo(cx - u * 0.2, cy - u); ctx.lineTo(cx + u * 0.85, cy - u); ctx.lineTo(cx + u * 0.85, cy + u * 0.1); ctx.lineTo(cx - u * 0.15, cy + u * 1.1); ctx.lineTo(cx - u * 1.1, cy + u * 0.1); ctx.lineTo(cx - u * 1.1, cy - u * 0.15); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + u * 0.45, cy - u * 0.5, u * 0.14, 0, Math.PI * 2); ctx.fill(); }
    else if (ic === 'gen') { ctx.beginPath(); ctx.moveTo(cx, cy + u * 0.95); ctx.bezierCurveTo(cx - u * 1.8, cy - u * 0.2, cx - u * 0.8, cy - u * 1.3, cx, cy - u * 0.4); ctx.bezierCurveTo(cx + u * 0.8, cy - u * 1.3, cx + u * 1.8, cy - u * 0.2, cx, cy + u * 0.95); ctx.stroke(); }
    else if (ic === 'cod') { ctx.beginPath(); [[-0.35, -1], [-0.35, 1], [0.35, -1], [0.35, 1]].forEach((p, i) => { if (i % 2 === 0) ctx.moveTo(cx + p[0] * u, cy + p[1] * u); else ctx.lineTo(cx + p[0] * u, cy + p[1] * u); }); ctx.moveTo(cx - u, cy - u * 0.35); ctx.lineTo(cx + u, cy - u * 0.35); ctx.moveTo(cx - u, cy + u * 0.35); ctx.lineTo(cx + u, cy + u * 0.35); ctx.stroke(); }
    else if (ic === 'globo') { ctx.beginPath(); ctx.arc(cx, cy, u * 1.05, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(cx, cy, u * 0.45, u * 1.05, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - u * 1.05, cy); ctx.lineTo(cx + u * 1.05, cy); ctx.stroke(); }
    else if (ic === 'zap') {   // balão do WhatsApp com o fone dentro
      ctx.beginPath(); ctx.arc(cx, cy, u * 1.1, 0.3 * Math.PI, 2.3 * Math.PI); ctx.lineTo(cx - u * 1.18, cy + u * 1.3); ctx.lineTo(cx - u * 0.45, cy + u * 0.98); ctx.closePath(); ctx.stroke();
      ctx.lineWidth = Math.max(3, r * 0.2); ctx.beginPath(); ctx.moveTo(cx - u * 0.45, cy - u * 0.5); ctx.quadraticCurveTo(cx - u * 0.45, cy + u * 0.5, cx + u * 0.5, cy + u * 0.45); ctx.stroke();
    }
    ctx.restore();
  }
  function larguraT(ctx, txt, tam, track) { return ctx.measureText(txt).width + (track ? track * tam * Math.max(0, txt.length - 1) : 0); }
  function desenharTrack(ctx, txt, x, y, tam, track, al) {
    const w = larguraT(ctx, txt, tam, track); let cx = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x; ctx.textAlign = 'left';
    for (const ch of txt) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + track * tam; }
  }
  function dividirNome(txt, maxL) {
    const pal = String(txt).trim().split(/\s+/).filter(Boolean); if (pal.length <= 1) return [pal.join(' ')];
    const n = Math.min(maxL, pal.length), total = pal.join(' ').length, alvo = total / n, linhas = []; let cur = [];
    pal.forEach((p, i) => { const resto = pal.length - i, faltam = n - linhas.length - 1; cur.push(p); const len = cur.join(' ').length; if (linhas.length < n - 1 && len >= alvo * 0.85 && resto - 1 >= faltam) { linhas.push(cur.join(' ')); cur = []; } });
    if (cur.length) linhas.push(cur.join(' ')); return linhas;
  }
  function estiloLinha(it, i, n) {
    if (it.stack === 'pilha') { const ponta = (i === 0 || i === n - 1) && n > 2; return { peso: ponta ? '500' : 'bold', cor: ponta ? it.cor : it.cor2 }; }
    return { peso: 'bold', cor: i === 0 ? it.cor : it.cor2 };
  }
  function fonteLinha(it, tam, peso) { return peso + ' ' + tam + 'px ' + FONTE_T; }
  /** Mede os itens novos. Devolve null para os itens comuns (o medirItem de sempre cuida deles). */
  function medirEspecial(it, larg) {
    const txt = String(it.t == null ? '' : it.t).trim(); if (!txt) return null;
    const base = Math.max(12, Math.round(it.tam * (it.mult || 1)));
    if (it.track || it.vert) {
      const maxL = it.linhas || 1; let tam = base, linhas;
      for (;;) {
        _mc.font = fonteDe(it, tam); const cab = (t) => larguraT(_mc, t, tam, it.track || 0), pal = txt.split(/\s+/); linhas = []; let cur = '';
        pal.forEach((p) => { const t = cur ? cur + ' ' + p : p; if (cab(t) > (it.vert ? 1e9 : larg) && cur) { linhas.push(cur); cur = p; } else cur = t; }); if (cur) linhas.push(cur);
        const lw = Math.max.apply(null, linhas.map(cab));
        if ((linhas.length <= maxL && (it.vert ? lw <= (it.vmax || 600) : lw <= larg + 0.5)) || tam <= base * 0.5) break; tam = Math.floor(tam * 0.94);
      }
      _mc.font = fonteDe(it, tam); const lh = tam * 1.35, lw = Math.max.apply(null, linhas.map((l) => larguraT(_mc, l, tam, it.track || 0)));
      return it.vert ? { tam, linhas, lh, padX: 0, padY: 0, lw, w: lh * linhas.length, h: lw } : { tam, linhas, lh, padX: 0, padY: 0, lw, w: lw, h: lh * linhas.length };
    }
    if (it.stack) {
      const maxL = it.stack === 'pilha' ? 4 : 2; let tam = base, linhas = dividirNome(txt, maxL);
      for (;;) { const lw = Math.max.apply(null, linhas.map((l, i) => { _mc.font = fonteLinha(it, tam, estiloLinha(it, i, linhas.length).peso); return _mc.measureText(l).width; })); if (lw <= larg + 0.5 || tam <= base * 0.4) { var w = lw; break; } tam = Math.floor(tam * 0.94); }
      const lh = tam * 1.12; return { tam, linhas, lh, padX: 0, padY: 0, lw: w, w: w, h: lh * linhas.length };
    }
    if (it.big) {
      const mt = /^(R\$)\s*(\d[\d.]*)(?:,(\d{2}))?\s*(.*)$/.exec(txt); if (!mt) return null;
      const padX = (it.padX || 0) * base, padY = (it.padY || 0) * base, livre = Math.max(40, larg - padX * 2); let tam = base, partes;
      for (;;) {
        _mc.font = 'bold ' + Math.round(tam * 0.42) + 'px ' + FONTE_T; const wr = _mc.measureText('R$').width;
        _mc.font = 'bold ' + tam + 'px ' + FONTE_T; const wi = _mc.measureText(mt[2]).width;
        _mc.font = 'bold ' + Math.round(tam * 0.5) + 'px ' + FONTE_T; const wc = mt[3] ? _mc.measureText(',' + mt[3]).width : 0;
        _mc.font = '500 ' + Math.round(tam * 0.4) + 'px ' + FONTE_T; const wv = mt[4] ? _mc.measureText(mt[4]).width : 0;
        const lw = wr + tam * 0.06 + wi + wc; partes = { wr, wi, wc, wv, lw, mt };
        if (Math.max(lw, wv) <= livre + 0.5 || tam <= base * 0.4) break; tam = Math.floor(tam * 0.94);
      }
      const hv = mt[4] ? tam * 0.5 : 0, hh = tam * 0.98 + hv;
      return { tam, linhas: [txt], lh: tam, padX, padY, lw: Math.max(partes.lw, partes.wv), w: Math.max(partes.lw, partes.wv) + padX * 2, h: hh + padY * 2, big: partes };
    }
    if (it.pill) {
      const total = it.wz === 'cheio' ? larg : larg, h = base * 2.4, d = h * 0.62, ocupado = h * 0.35 + d + h * 0.3 + (it.seta ? h * 0.5 : h * 0.25), livre = Math.max(60, total - ocupado);
      let tam = base, linhas; const maxL = it.linhas || 1;
      for (;;) { _mc.font = 'bold ' + tam + 'px ' + FONTE_T; linhas = quebrar(_mc, txt, livre, maxL); const lw = Math.max.apply(null, linhas.map((l) => _mc.measureText(l).width)), cortou = linhas.join(' ') !== txt.replace(/\s+/g, ' '); if ((lw <= livre + 0.5 && !cortou) || tam <= base * 0.5) break; tam = Math.floor(tam * 0.94); }
      const hh = Math.max(h * 0.8, (linhas.length > 1 ? tam * 2.3 : tam * 1.18) + base * 1.05);
      return { tam, linhas, lh: tam * 1.12, padX: 0, padY: 0, lw: 0, w: 0, h: Math.max(hh, h * 0.9), pill: { h: Math.max(hh, h * 0.9), d: Math.max(hh, h * 0.9) * 0.62 } };
    }
    if (it.chip) {
      const d = base * 2.1, gap = base * 0.5, livre = Math.max(60, larg - d - gap); let tam = base, linhas; const maxL = it.linhas || 2;
      for (;;) { _mc.font = fonteDe(Object.assign({}, it, { peso: 'bold' }), tam); linhas = quebrar(_mc, txt, livre, maxL); const lw = Math.max.apply(null, linhas.map((l) => _mc.measureText(l).width)), cortou = linhas.join(' ') !== txt.replace(/\s+/g, ' '); if ((lw <= livre + 0.5 && !cortou) || tam <= base * 0.55) break; tam = Math.floor(tam * 0.94); }
      _mc.font = fonteDe(Object.assign({}, it, { peso: 'bold' }), tam); const lw = Math.max.apply(null, linhas.map((l) => _mc.measureText(l).width)), lh = tam * 1.2;
      return { tam, linhas, lh, padX: 0, padY: 0, lw, w: d + gap + lw, h: Math.max(d, linhas.length * lh), chip: { d, gap } };
    }
    return null;
  }
  function pilulaCaminho(ctx, x0, y0, x1, y1) { caixaArredondada(ctx, x0, y0, x1, y1, (y1 - y0) / 2); }
  function desenharEspecial(ctx, it, W, H) {
    const m = it.m, r = it.r, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    ctx.save(); ctx.textBaseline = 'alphabetic';
    if (it.track && !it.vert) {
      ctx.font = fonteDe(it, m.tam); ctx.fillStyle = it.cor || CINZA; const al = it.ial === 'center' ? 'center' : it.ial === 'right' ? 'right' : 'left', xx = al === 'center' ? cx : al === 'right' ? r.x1 : r.x0;
      m.linhas.forEach((l, n) => desenharTrack(ctx, l, xx, r.y0 + n * m.lh + m.tam * 1.0, m.tam, it.track, al));
    } else if (it.vert) {
      ctx.font = fonteDe(it, m.tam); ctx.fillStyle = it.cor || CINZA; ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2);
      m.linhas.forEach((l, n) => desenharTrack(ctx, l, 0, (n - (m.linhas.length - 1) / 2) * m.lh + m.tam * 0.35, m.tam, it.track || 0, 'center'));
    } else if (it.stack) {
      const al = it.ial === 'center' ? 'center' : it.ial === 'right' ? 'right' : 'left', xx = al === 'center' ? cx : al === 'right' ? r.x1 : r.x0;
      m.linhas.forEach((l, i) => { const s = estiloLinha(it, i, m.linhas.length); ctx.font = fonteLinha(it, m.tam, s.peso); ctx.fillStyle = s.cor; ctx.textAlign = al; ctx.fillText(l, xx, r.y0 + i * m.lh + m.tam * 0.92); });
    } else if (it.big) {
      const b = m.big, mt = b.mt;
      if (it.bg) { ctx.save(); if (it.sombraCx) { ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6; } ctx.fillStyle = it.bg; const x0 = it.sangra === 'esq' ? 0 : r.x0, x1 = it.sangra === 'dir' ? W : r.x1; caixaArredondada(ctx, x0, r.y0, x1, r.y1, it.rpx || 26); ctx.fill(); ctx.restore(); }
      if (it.borda2) { ctx.save(); ctx.strokeStyle = it.borda2; ctx.lineWidth = 3; caixaArredondada(ctx, r.x0 + 12, r.y0 + 12, r.x1 + 12, r.y1 + 12, it.rpx || 26); ctx.stroke(); ctx.restore(); }
      const xi = r.x0 + m.padX + (r.x1 - r.x0 - m.padX * 2 - b.lw) / (it.alP === 'left' ? 1e9 : 2), top = r.y0 + m.padY, bi = top + m.tam * 0.8;
      ctx.fillStyle = it.cor; ctx.textAlign = 'left';
      ctx.font = 'bold ' + Math.round(m.tam * 0.42) + 'px ' + FONTE_T; ctx.fillText('R$', xi, bi - m.tam * 0.38);
      ctx.font = 'bold ' + m.tam + 'px ' + FONTE_T; ctx.fillText(mt[2], xi + b.wr + m.tam * 0.06, bi);
      if (mt[3]) { ctx.font = 'bold ' + Math.round(m.tam * 0.5) + 'px ' + FONTE_T; ctx.fillText(',' + mt[3], xi + b.wr + m.tam * 0.06 + b.wi, bi - m.tam * 0.3); }
      if (mt[4]) { ctx.font = '500 ' + Math.round(m.tam * 0.4) + 'px ' + FONTE_T; ctx.textAlign = it.vistaAl === 'left' ? 'left' : 'right'; ctx.fillText(mt[4], it.vistaAl === 'left' ? xi : xi + b.lw, bi + m.tam * 0.42); }
    } else if (it.pill) {
      const h = r.y1 - r.y0, d = m.pill.d, estilo = it.estilo || 'cheio';
      ctx.save(); if (estilo === 'cheio') { ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5; ctx.fillStyle = it.bg || LARANJA; pilulaCaminho(ctx, r.x0, r.y0, r.x1, r.y1); ctx.fill(); }
      else { ctx.fillStyle = it.bg || 'rgba(255,255,255,.9)'; pilulaCaminho(ctx, r.x0, r.y0, r.x1, r.y1); ctx.fill(); ctx.strokeStyle = it.corBorda || LARANJA; ctx.lineWidth = 4; pilulaCaminho(ctx, r.x0 + 2, r.y0 + 2, r.x1 - 2, r.y1 - 2); ctx.stroke(); }
      ctx.restore();
      const ic = /whats|zap/i.test(it.t) ? 'zap' : 'globo', corI = it.cor, ix = r.x0 + h * 0.35 + d / 2;
      iconeCirculo(ctx, ic, ix, cy, d / 2, corI);
      ctx.strokeStyle = corI; ctx.globalAlpha = 0.45; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ix + d / 2 + h * 0.15, r.y0 + h * 0.25); ctx.lineTo(ix + d / 2 + h * 0.15, r.y1 - h * 0.25); ctx.stroke(); ctx.globalAlpha = 1;
      const tx0 = ix + d / 2 + h * 0.3, tx1 = r.x1 - (it.seta ? h * 0.5 : h * 0.25);
      ctx.font = 'bold ' + m.tam + 'px ' + FONTE_T; ctx.fillStyle = corI; ctx.textAlign = 'left';
      m.linhas.forEach((l, n) => ctx.fillText(l, tx0, cy - ((m.linhas.length - 1) * m.lh) / 2 + n * m.lh + m.tam * 0.36));
      if (it.seta) { ctx.strokeStyle = corI; ctx.lineWidth = Math.max(3, h * 0.06); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const ax = r.x1 - h * 0.5, as = h * 0.13; ctx.beginPath(); ctx.moveTo(ax, cy - as); ctx.lineTo(ax + as, cy); ctx.lineTo(ax, cy + as); ctx.stroke(); }
    } else if (it.chip) {
      const c = m.chip, rr = c.d / 2, ix = r.x0 + rr, cyy = cy;
      ctx.fillStyle = 'rgba(230,126,34,.16)'; ctx.beginPath(); ctx.arc(ix, cyy, rr, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = LARANJA; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ix, cyy, rr - 1.5, 0, Math.PI * 2); ctx.stroke();
      iconeCirculo(ctx, it.chip.ic, ix, cyy, rr * 0.82, LARANJA_TXT);
      ctx.font = fonteDe(Object.assign({}, it, { peso: 'bold' }), m.tam); ctx.fillStyle = it.cor || CINZA; ctx.textAlign = 'left';
      m.linhas.forEach((l, n) => ctx.fillText(l, r.x0 + c.d + c.gap, cyy - ((m.linhas.length - 1) * m.lh) / 2 + n * m.lh + m.tam * 0.36));
    }
    ctx.restore();
    return { k: it.k, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
  }
  const ESPECIAL = (it) => it.track || it.vert || it.stack || it.big || it.pill || it.chip;

  /** Especificação dos 10 visuais: grupos (onde cada bloco de texto fica) + itens (o que aparece). Tudo vem dos dados da peça. */
  function especArte(tpl, info, W, H) {
    const story = H > W * 1.5, sy = story ? 0.06 : 0, by = story ? 0.055 : 0, preco = info.avista ? info.avista + ' à vista' : '';
    const cta = info.comLink ? 'Toque no link' : null;
    const nome = (grp, o) => Object.assign({ k: 'nome', rot: 'Nome da peça', t: info.nome, grp: grp, tam: 62, cor: CINZA, cor2: LARANJA_TXT, stack: 'duo' }, o || {});
    const precoG = (grp, o) => Object.assign({ k: 'preco', rot: 'Preço', t: preco, grp: grp, tam: 120, cor: CINZA, big: true }, o || {});
    const botao = (grp, texto, o) => Object.assign({ k: 'zona', rot: 'Zona do link (botão)', t: cta || texto, grp: grp, tam: 34, pill: true, wz: 0.5, bg: LARANJA, cor: PRETO, estilo: 'cheio', seta: true }, o || {});
    const lema = (grp, t, o) => Object.assign({ k: 'lema', rot: 'Frase pequena', t: t, grp: grp, tam: 24, track: 0.28, peso: 'normal', cor: TXT_SUAVE, linhas: 4 }, o || {});
    const chip = (grp, n, ic, t, o) => Object.assign({ k: 'chip' + n, rot: 'Detalhe ' + n, t: t, grp: grp, tam: 27, chip: { ic: ic }, cor: CINZA, linhas: 2 }, o || {});
    const selo = (grp, t, o) => Object.assign({ k: 'selo', rot: 'Selo', t: t, grp: grp, tam: 30, cor: PRETO, bg: LARANJA, padX: 0.8, padY: 0.4, radius: 0.5, peso: 'bold' }, o || {});
    const c3 = (g) => [info.tam ? chip(g, 1, 'tam', 'Tamanhos ' + info.tam) : null, info.cores ? chip(g, 2, 'cor', 'Cores ' + info.cores) : null, (info.cat || info.gen) ? chip(g, 3, info.cat ? 'cat' : 'gen', [info.cat, info.gen].filter(Boolean).join(' · ')) : null].filter(Boolean);
    const lemaTxt = [info.gen, info.cat].filter(Boolean).join(' ').toUpperCase() || 'TENKiTER MODAS';
    const codigoTxt = info.codigo ? 'CÓDIGO ' + info.codigo : '';
    let g = [], it = [];
    if (tpl === 'classico') {
      g = [{ id: 'a', anc: 't', y: 0.07 + sy, x: 0.045, al: 'left', w: 0.22, gap: 10 }, { id: 'c', anc: 'm', y: 0.46, x: 0.04, al: 'left', w: 0.27, gap: 18 }, { id: 'k', anc: 'b', y: 0.04 + by, x: 0.04, al: 'left', fw: 0.55, gap: 10, caixa: { cor: '#FFFFFF', r: 26, pad: 22, sombra: true } }];
      it = [selo('a', 'NOVIDADE'), lema('a', lemaTxt)].concat(c3('c').slice(0, 3), [nome('k', { tam: 50 }), precoG('k', { tam: 108, alP: 'left', vistaAl: 'left' }), codigo_(info, 'k'), botao('k', 'Chame no WhatsApp', { wz: 'cheio' })].filter(Boolean));
    } else if (tpl === 'promo') {
      g = [{ id: 'a', anc: 't', y: 0.07 + sy, x: 0.05, al: 'left', w: 0.3, gap: 14 }, { id: 'p', anc: 'm', y: 0.38, x: 0.05, al: 'left', w: 0.3, gap: 10 }, { id: 'k', anc: 'b', y: 0.05 + by, x: 0.05, al: 'left', w: 0.34, gap: 12 }];
      it = [selo('a', 'NOVIDADE'), nome('a', { tam: 54, linhas: 3 }), lema('a', lemaTxt, { linhas: 2, tam: 22 }), precoG('p', { tam: 104, vistaAl: 'left', alP: 'left' }), codigo_(info, 'p'), botao('k', 'Chame no WhatsApp', { wz: 'cheio', linhas: 2, tam: 30 })].filter(Boolean);
    } else if (tpl === 'minimal') {
      g = [{ id: 'a', anc: 't', y: 0.05 + sy, x: 0.05, al: 'left', w: 0.3 }, { id: 'k', anc: 'b', y: 0.04 + by, x: 0.5, al: 'center', fw: 0.9, gap: 10, caixa: { cor: '#FFFFFF', r: 30, pad: 26, sombra: true } }];
      it = [selo('a', 'NOVIDADE', { cor: PRETO }), precoG('k', { tam: 104, linhas: 1, alP: 'center', vistaAl: 'right' }), nome('k', { tam: 52, al: 'center', stack: 'duo' }), botao('k', 'Chame no WhatsApp', { wz: 'cheio', bg: LARANJA, seta: false })];
    } else if (tpl === 'rodape') {
      g = [{ id: 'a', anc: 't', y: 0.06 + sy, x: 0.05, al: 'left', w: 0.34, gap: 12 }, { id: 'c', anc: 'm', y: 0.43, x: 0.05, al: 'left', w: 0.34, gap: 16 }, { id: 'p', anc: 'b', y: 0.18 + by, x: 0.05, al: 'left', w: 0.34, gap: 10 }, { id: 'k', anc: 'b', y: 0.05 + by, x: 0.05, al: 'left', w: 0.34 }];
      it = [nome('a', { tam: 50, linhas: 3 }), lema('a', lemaTxt, { linhas: 2, tam: 20 })].concat(c3('c'), [precoG('p', { tam: 92, bg: LARANJA, padX: 0.28, padY: 0.2, rpx: 24, sombraCx: true }), botao('k', 'Chame no WhatsApp', { wz: 'cheio', estilo: 'contorno', bg: '#FFFFFF', cor: CINZA, linhas: 2, tam: 28 })]);
    } else if (tpl === 'lateral') {
      g = [{ id: 'p', anc: 't', y: 0.06 + sy, x: 0.97, al: 'right', w: 0.31, gap: 10 }, { id: 'a', anc: 'm', y: 0.5, x: 0.97, al: 'right', w: 0.31, gap: 12 }, { id: 'k', anc: 'b', y: 0.05 + by, x: 0.97, al: 'right', w: 0.31, gap: 10 }];
      it = [precoG('p', { tam: 88, bg: LARANJA, padX: 0.28, padY: 0.2, rpx: 22, sangra: 'dir', sombraCx: true, vistaAl: 'right' }), nome('a', { tam: 50, linhas: 3, al: 'right', stack: 'duo' }), lema('a', lemaTxt, { linhas: 2, tam: 20, al: 'right' }), selo('k', 'NOVIDADE'), botao('k', 'Chame no WhatsApp', { wz: 'cheio', linhas: 2, tam: 26, seta: false })];
    } else if (tpl === 'cabecalho') {
      g = [{ id: 'a', anc: 't', y: 0.06 + sy, x: 0.05, al: 'left', w: 0.35, gap: 10 }, { id: 'p', anc: 'm', y: 0.45, x: 0.0, al: 'left', w: 0.4, gap: 8 }, { id: 'c', anc: 'b', y: 0.2 + by, x: 0.05, al: 'left', w: 0.35, gap: 14 }, { id: 'k', anc: 'b', y: 0.05 + by, x: 0.05, al: 'left', w: 0.35 }];
      it = [lema('a', lemaTxt, { linhas: 2, tam: 20 }), nome('a', { tam: 70, linhas: 3, stack: 'pilha' }), precoG('p', { tam: 88, bg: LARANJA, padX: 0.4, padY: 0.2, rpx: 26, sangra: 'esq', vistaAl: 'left', alP: 'left' })].concat(c3('c'), [botao('k', 'Chame no WhatsApp', { wz: 'cheio', linhas: 2, tam: 27, seta: false })]);
    } else if (tpl === 'energia') {
      g = [{ id: 'a', anc: 't', y: 0.06 + sy, x: 0.05, al: 'left', w: 0.33, gap: 12 }, { id: 'p', anc: 'm', y: 0.42, x: 0.05, al: 'left', w: 0.33, gap: 10 }, { id: 'c', anc: 'b', y: 0.2 + by, x: 0.05, al: 'left', w: 0.33, gap: 14 }, { id: 'k', anc: 'b', y: 0.05 + by, x: 0.05, al: 'left', w: 0.33 }];
      it = [nome('a', { tam: 52, linhas: 3, cor: PRETO, cor2: PRETO }), precoG('p', { tam: 100, cor: PRETO, bg: 'rgba(255,255,255,.0)', alP: 'left', vistaAl: 'left', padX: 0, padY: 0 })].concat(c3('c'), [botao('k', 'Chame no WhatsApp', { wz: 'cheio', linhas: 2, tam: 27 })]);
      it[0] = Object.assign(it[0], { cor: PRETO, cor2: PRETO });
    } else if (tpl === 'blocos') {
      g = [{ id: 'a', anc: 't', y: 0.12 + sy, x: 0.97, al: 'right', w: 0.34, gap: 10 }, { id: 'p', anc: 'm', y: 0.62, x: 0.97, al: 'right', w: 0.34, gap: 10 }, { id: 'k', anc: 'b', y: 0.05 + by, x: 0.97, al: 'right', w: 0.34 }];
      it = [lema('a', lemaTxt, { linhas: 2, tam: 20, al: 'right', cor: PRETO }), nome('a', { tam: 66, linhas: 4, stack: 'pilha', al: 'right', cor: PRETO, cor2: PRETO }), precoG('p', { tam: 92, bg: '#FFFFFF', cor: PRETO, padX: 0.3, padY: 0.2, rpx: 22, borda2: PRETO, vistaAl: 'right' }), botao('k', 'Chame no WhatsApp', { wz: 'cheio', estilo: 'contorno', bg: '#FFFFFF', cor: PRETO, corBorda: PRETO, linhas: 2, tam: 26, seta: false })];
    } else if (tpl === 'editorial') {
      g = [{ id: 'v', anc: 'm', y: 0.5, x: 0.0425, al: 'center', w: 0.07 }, { id: 'a', anc: 't', y: 0.06 + sy, x: 0.96, al: 'right', w: 0.29, gap: 10 }, { id: 'p', anc: 'm', y: 0.5, x: 0.96, al: 'right', w: 0.29, gap: 10 }, { id: 'c', anc: 'b', y: 0.14 + by, x: 0.96, al: 'right', w: 0.29, gap: 12 }, { id: 'k', anc: 'b', y: 0.045 + by, x: 0.96, al: 'right', w: 0.29 }];
      it = [lema('v', lemaTxt, { vert: true, k: 'lema', tam: 22, cor: PRETO, vmax: H * 0.7 }), nome('a', { tam: 48, linhas: 3, al: 'right' }), precoG('p', { tam: 78, bg: LARANJA, padX: 0.3, padY: 0.2, rpx: 22, sombraCx: true, vistaAl: 'right' })].concat(c3('c').slice(0, 2), [botao('k', 'Chame no WhatsApp', { wz: 'cheio', linhas: 2, tam: 24, seta: false })]);
    } else if (tpl === 'cartao') {
      g = [{ id: 'a', anc: 't', y: 0.06 + sy, x: 0.04, al: 'left', w: 0.3, gap: 10 }, { id: 'n', anc: 'm', y: 0.42, x: 0.04, al: 'left', w: 0.3, gap: 12 }, { id: 'c', anc: 'b', y: 0.2 + by, x: 0.04, al: 'left', w: 0.3, gap: 12 }, { id: 'k', anc: 'b', y: 0.05 + by, x: 0.04, al: 'left', w: 0.3, gap: 10 }];
      it = [lema('a', [info.gen, info.cat, info.tam ? 'TAM ' + info.tam : '', info.cores].filter(Boolean).join(' · ').toUpperCase() || lemaTxt, { linhas: 4, tam: 20 }), nome('n', { tam: 48, linhas: 3, stack: 'pilha' }), precoG('c', { tam: 82, vistaAl: 'left', alP: 'left', cor: LARANJA_TXT }), botao('k', 'Chame no WhatsApp', { wz: 'cheio', estilo: 'contorno', bg: '#FFFFFF', cor: CINZA, linhas: 2, tam: 25 })];
    }
    return { fundo: 'arte', grupos: g, itens: it };
  }
  function codigo_(info, grp) { return info.codigo ? { k: 'codigo', rot: 'Código', t: 'CÓDIGO ' + info.codigo, grp: grp, tam: 22, track: 0.2, peso: 'normal', cor: TXT_SUAVE } : null; }

  /** Mede um item: encolhe a letra (até 45%) até caber em `larg` px nas linhas permitidas; devolve tamanho, linhas e caixa. */

  /* ---------- v5.5: CAMADAS (editor visual sem código) ----------
   * Um visual "v2" é { versao:2, fundo, base?, camadas:[ … ] }. Cada camada é um TEXTO ou uma FORMA com posição livre
   * (x,y = centro em fração; w,h = fração da LARGURA; giro em graus). A foto fica sempre por baixo; as camadas vêm por cima, na ordem da lista.
   * Texto: a letra ENCOLHE sozinha (até 45%) para caber na caixa w×h; `max` = limite de letras; `papel` liga comportamentos (preco, zona).
   * O guia completo para pessoas/IA vai dentro do próprio código (GUIA_CODIGO). */
  const MAX_PADRAO = { nome: 40, preco: 30, codigo: 20, tam: 30, cores: 30, cat: 32, zona: 26, selo: 16, extra: 60 };
  const PAPEIS = [['extra', 'Texto livre', 'Seu texto'], ['nome', 'Nome da peça', '{nome}'], ['preco', 'Preço', '{avista} à vista'], ['codigo', 'Código', 'Código {codigo}'], ['tam', 'Tamanhos', 'Tamanhos: {tam}'], ['cores', 'Cores', 'Cores: {cores}'], ['cat', 'Categoria e gênero', '{cat} · {gen}'], ['zona', 'Botão / zona do link', 'Compre online'], ['selo', 'Selo', 'NOVIDADE']];
  const GUIA_CODIGO = [
    'GUIA PARA QUEM EDITAR ESTE CÓDIGO (pessoa ou IA). A chave "_guia" é só explicação: pode ficar ou sair, o sistema ignora.',
    'FORMATO: JSON válido (sem comentários, sem vírgula sobrando). Responda SEMPRE com o JSON inteiro, mantendo "camadas" e todos os "k".',
    'TELA: imagem de 1080 px de largura. Feed = 1080x1350, Story = 1080x1920. A FOTO DA PEÇA fica sempre por baixo; as "camadas" são desenhadas por cima, na ordem da lista (a última fica na frente).',
    'COORDENADAS (frações): x = CENTRO na horizontal (0 esquerda, 0.5 meio, 1 direita); y = CENTRO na vertical (0 topo, 1 base); w = largura como fração da LARGURA da imagem; h = altura como fração da LARGURA (não da altura: assim a caixa mantém a proporção no Feed e no Story); giro = graus de -180 a 180, em volta do centro.',
    'camada tipo "texto": t = texto (aceita {nome} {avista} {cheio} {codigo} {tam} {cores} {cat} {gen}, que viram os dados da peça); tam = tamanho da letra em px (a letra encolhe sozinha, até 45%, se o texto não couber na caixa w x h); linhas = máximo de linhas; max = máximo de letras (passou disso vira "…"; 0 = sem limite); cor; peso "bold" ou "normal"; al "left", "center" ou "right"; bg = cor da caixa atrás do texto (opcional) e raio = canto arredondado em px; sombra true/false; opac de 0 a 1.',
    'papel (só em texto, opcional): "preco" = quando a peça está marcada "Sem preço" o texto vira "Consulte valor"; "zona" = botão/zona do link do Story: sem link aparece o CTA configurado do visual (padrão www.tenkitermodas.com.br). Outros papéis (nome, codigo, tam, cores, cat, selo, extra) só definem o limite de letras padrão.',
    'camada tipo "forma": forma = "ret" (retângulo, com raio de canto em px), "elipse" (círculo/oval) ou "linha" (traço fino, use h pequeno, ex. 0.005); cor e, se quiser degradê de cima para baixo, cor2; borda = {"cor":"#fff","w":4}; opac; sombra true/false.',
    'fundo = efeito escuro/colorido sobre a foto: foto (nenhum) | baixo | baixo-leve | ambos | topo | baixo-dir | direita | rodape | energia. Para os visuais prontos desenhados, fundo "arte" exige "base" com o id do visual (ex. "classico").',
    'LIMITES PADRÃO DE LETRAS por papel: nome 40, preco 16, codigo 20, tam 30, cores 30, cat 32, zona 26, selo 16, extra 60. Pode mudar em cada camada ("max").',
    'CADA camada precisa de "k" ÚNICO (minúsculas e números, sem espaço) e de "tipo". "rot" é só o nome que aparece na lista. Cores: #RRGGBB ou rgba(...).',
    'MARCA: laranja #E67E22, bege #F5F1E8, cinza #2C2C2C, ouro #F39C12. Fundo laranja SEMPRE com letra preta (#0d0d0d), nunca branca. Texto sobre foto precisa de contraste (use sombra true ou uma forma escura atrás).',
    'DICA: no Story, o rodapé (cerca de 12% de baixo) fica sob a barra de resposta do Instagram: evite texto importante com y acima de 0.92.'
  ];
  function caixaDaCamada_(c, W, H) { return { cx: (Number(c.x) || 0) * W, cy: (Number(c.y) || 0) * H, w: Math.max(4, (Number(c.w) || 0.2) * W), h: Math.max(4, (Number(c.h) || 0.1) * W), a: (Number(c.giro) || 0) * Math.PI / 180 }; }
  function medirTextoCamada_(c, bw, bh) {
    const txt = String(c.t == null ? '' : c.t).trim(); if (!txt) return null;
    const base = Math.max(10, Math.round((Number(c.tam) || 40) * (c.mult || 1))), pad = c.bg ? Math.round(base * 0.35) : 0, livre = Math.max(20, bw - pad * 2), maxL = Math.max(1, Math.min(8, Number(c.linhas) || 1));
    let tam = base, linhas;
    for (;;) {
      _mc.font = fonteDe(c, tam); linhas = quebrar(_mc, txt, livre, maxL);
      const lw = Math.max.apply(null, linhas.map((l) => _mc.measureText(l).width)), cortou = linhas.join(' ').replace(/\s+/g, ' ') !== txt.replace(/\s+/g, ' ');
      if ((lw <= livre + 0.5 && !cortou && linhas.length * tam * 1.18 <= bh - pad * 2 + 0.5) || tam <= Math.max(10, base * 0.45)) break;
      tam = Math.max(10, Math.floor(tam * 0.94));
    }
    return { tam, linhas, lh: tam * 1.18, pad };
  }
  function layoutCamadas(spec, W, H, ov) {
    const out = [];
    (spec.camadas || []).forEach((c) => {
      if (!c || c.oculto) return;
      const b = caixaDaCamada_(c, W, H), o = ov && ov[c.k], cx = o ? o.x * W : b.cx, cy = o ? o.y * H : b.cy;
      let m = null; if (c.tipo === 'texto') { m = medirTextoCamada_(c, b.w, b.h); if (!m) return; }
      out.push(Object.assign({}, c, { camada: true, cb: { cx, cy, w: b.w, h: b.h, a: b.a }, m, r: { x0: cx - b.w / 2, y0: cy - b.h / 2, x1: cx + b.w / 2, y1: cy + b.h / 2 }, x: cx / W, y: cy / H }));
    });
    return out;
  }
  function desenharCamada(ctx, it, W, H) {
    const b = it.cb, w = b.w, h = b.h, rad = Math.max(0, Number(it.raio) || 0);
    ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(b.a); ctx.globalAlpha = it.opac == null ? 1 : Math.max(0, Math.min(1, Number(it.opac)));
    if (it.tipo === 'forma') {
      const caminho = () => { if (it.forma === 'elipse') { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); } else caixaArredondada(ctx, -w / 2, -h / 2, w / 2, h / 2, it.forma === 'linha' ? Math.min(w, h) / 2 : rad); };
      let fill = it.cor || '#E67E22'; if (it.cor2) { const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, fill); g.addColorStop(1, it.cor2); fill = g; }
      if (it.sombra) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; }
      ctx.fillStyle = fill; caminho(); ctx.fill(); ctx.shadowColor = 'transparent';
      if (it.borda && Number(it.borda.w) > 0) { ctx.strokeStyle = it.borda.cor || '#fff'; ctx.lineWidth = Number(it.borda.w); caminho(); ctx.stroke(); }
    } else {
      const m = it.m;
      if (it.bg) { ctx.fillStyle = it.bg; caixaArredondada(ctx, -w / 2, -h / 2, w / 2, h / 2, rad); ctx.fill(); }
      ctx.font = fonteDe(it, m.tam); ctx.textBaseline = 'middle'; ctx.fillStyle = it.cor || '#fff';
      if (it.sombra) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = Math.round(m.tam * 0.18); ctx.shadowOffsetY = Math.round(m.tam * 0.05); }
      const ta = it.al === 'left' || it.al === 'right' ? it.al : 'center'; ctx.textAlign = ta;
      const tx = ta === 'left' ? -w / 2 + m.pad : ta === 'right' ? w / 2 - m.pad : 0, total = m.linhas.length * m.lh;
      m.linhas.forEach((l, i) => ctx.fillText(l, tx, -total / 2 + m.lh * (i + 0.5)));
    }
    ctx.restore();
    if (it.tipo === 'forma') return null;
    const cs = Math.abs(Math.cos(b.a)), sn = Math.abs(Math.sin(b.a)), bw = w * cs + h * sn, bh = w * sn + h * cs;
    return { k: it.k, x0: b.cx - bw / 2, y0: b.cy - bh / 2, x1: b.cx + bw / 2, y1: b.cy + bh / 2 };
  }
  function medirItem(it, larg) {
    if (ESPECIAL(it)) { const esp = medirEspecial(it, larg); if (esp) return esp; }
    const txt = String(it.t == null ? '' : it.t).trim(); if (!txt) return null;
    const base = Math.max(12, Math.round(it.tam * (it.mult || 1))), padX = (it.padX || 0) * base, padY = (it.padY || 0) * base, livre = Math.max(40, larg - padX * 2), maxL = it.linhas || 1;
    let tam = base, linhas;
    for (;;) {
      _mc.font = fonteDe(it, tam); linhas = (it.k === 'preco' && maxL >= 2 && /\sà vista$/i.test(txt)) ? [txt.replace(/\s+à vista$/i, ''), 'à vista'] : quebrar(_mc, txt, livre, maxL);
      const lw = Math.max.apply(null, linhas.map((l) => _mc.measureText(l).width)), cortou = linhas.join(' ').replace(/\s+/g, ' ') !== txt.replace(/\s+/g, ' ');
      if ((lw <= livre + 0.5 && !cortou) || tam <= base * 0.45) break;
      tam = Math.floor(tam * 0.94);
    }
    _mc.font = fonteDe(it, tam);
    const lh = tam * 1.18, lw = Math.max.apply(null, linhas.map((l) => _mc.measureText(l).width));
    return { tam, linhas, lh, padX, padY, lw, w: it.wz ? 0 : lw + padX * 2, h: linhas.length * lh + padY * 2 };
  }
  /** Calcula a posição (caixa) de cada item. Itens com `pos` (arrastados) ficam onde a pessoa deixou. */
  function layoutItens(spec, W, H, ov) {
    if (spec.camadas) return layoutCamadas(spec, W, H, ov);
    const story = H > W * 1.5, out = [];
    spec.grupos.forEach((g) => {
      const its = spec.itens.filter((q) => q.grp === g.id && String(q.t == null ? '' : q.t).trim());
      if (!its.length) return;
      const gap = g.gap == null ? 8 : g.gap, cx = g.caixa, pad = cx ? cx.pad : 0;
      const larguraGrupo = (g.fw ? g.fw * W : (g.w || 0.9) * W);
      const larguraInterna = g.fw ? larguraGrupo - pad * 2 : larguraGrupo;
      const med = its.map((it) => { const larg = it.wz === 'cheio' ? larguraInterna : it.wz ? it.wz * W : larguraInterna; const m = medirItem(it, larg); if (m && it.wz) m.w = it.wz === 'cheio' ? larguraInterna : it.wz * W; return m; });
      const itensM = its.map((it, i) => ({ it, m: med[i] })).filter((q) => q.m);
      if (!itensM.length) return;
      const total = itensM.reduce((s, q) => s + q.m.h, 0) + gap * (itensM.length - 1) + pad * 2;
      const gx = g.x * W;
      const larguraCaixa = g.fw ? larguraGrupo : Math.max.apply(null, itensM.map((q) => q.m.w)) + pad * 2;
      const gx0 = g.al === 'center' ? gx - larguraCaixa / 2 : g.al === 'right' ? gx - larguraCaixa : gx;
      let top = g.anc === 'b' ? H - g.y * H - total : g.anc === 't' ? g.y * H : g.y * H - total / 2;
      if (cx) out.push({ deco: 'caixa', x0: gx0, y0: top, x1: gx0 + larguraCaixa, y1: top + total, cx });
      let y = top + pad;
      itensM.forEach((q) => {
        const it = q.it, m = q.m, w = m.w, ial = it.al || g.al;
        const x0 = ial === 'center' ? gx0 + larguraCaixa / 2 - w / 2 : ial === 'right' ? gx0 + larguraCaixa - pad - w : gx0 + pad;
        const r = { x0, y0: y, x1: x0 + w, y1: y + m.h };
        const o = ov && ov[it.k];
        if (o) { const dx = o.x * W - (r.x0 + r.x1) / 2, dyy = o.y * H - (r.y0 + r.y1) / 2; r.x0 += dx; r.x1 += dx; r.y0 += dyy; r.y1 += dyy; }
        out.push(Object.assign({}, it, { ial, m, r, x: (r.x0 + r.x1) / 2 / W, y: (r.y0 + r.y1) / 2 / H }));
        y += m.h + gap;
      });
    });
    return out;
  }
  function itensEfetivos(tpl, m) {
    const [W, H] = tamanhoAlvo(), spec = especTemplate(tpl, infoPeca(nova.p), W, H);
    const tx = (nova.tx && nova.tx[tpl]) || {}, tm = (nova.tam && nova.tam[tpl]) || {}, ps = (m && m.pos && m.pos[tpl]) || {}, oc = (nova.oculto && nova.oculto[tpl]) || {};
    const novosIt = spec.itens.map((it) => { let t = oc[it.k] ? '' : (tx[it.k] !== undefined ? tx[it.k] : it.t); const mx = Number(it.max) || 0; if (spec.camadas && mx > 0 && String(t).length > mx) t = String(t).slice(0, Math.max(1, mx - 1)).trim() + '…'; return Object.assign({}, it, { t: t, mult: tm[it.k] || 1 }); });
    if (spec.camadas) { const mp = {}; novosIt.forEach((n) => { mp[n.k] = n; }); spec.camadas = spec.camadas.map((c) => (c.tipo === 'texto' && mp[c.k] ? mp[c.k] : c)); }
    spec.itens = novosIt;
    return { tpl: tpl, fundo: spec.fundo, arteBase: spec.base, lista: layoutItens(spec, W, H, ps) };
  }
  function caixaArredondada(ctx, x0, y0, x1, y1, r) { r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2); ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x1, y0, x1, y1, r); ctx.arcTo(x1, y1, x0, y1, r); ctx.arcTo(x0, y1, x0, y0, r); ctx.arcTo(x0, y0, x1, y0, r); ctx.closePath(); }
  function desenharItem(ctx, it, W, H) {
    if (it.camada) return desenharCamada(ctx, it, W, H);
    if (ESPECIAL(it) && it.m && (it.m.big || it.m.pill || it.m.chip || it.track || it.vert || it.stack)) return desenharEspecial(ctx, it, W, H);
    const m = it.m, r = it.r, rad = (it.radius || 0) * m.tam * 2;
    if (it.fade) { const g = ctx.createLinearGradient(0, r.y0 - 90, 0, H); g.addColorStop(0, 'rgba(44,44,44,0)'); g.addColorStop(0.45, 'rgba(44,44,44,.8)'); g.addColorStop(1, 'rgba(44,44,44,.92)'); ctx.fillStyle = g; ctx.fillRect(0, r.y0 - 90, W, H - r.y0 + 90); }
    if (it.bg) { ctx.save(); if (it.sombraCx) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3; } ctx.fillStyle = it.bg; caixaArredondada(ctx, r.x0, r.y0, r.x1, r.y1, rad); ctx.fill(); ctx.restore(); }
    if (it.borda) { ctx.save(); ctx.strokeStyle = it.borda.cor; ctx.lineWidth = it.borda.w; if (it.borda.dash) ctx.setLineDash([12, 8]); caixaArredondada(ctx, r.x0, r.y0, r.x1, r.y1, 6); ctx.stroke(); ctx.restore(); }
    if (it.sub) { ctx.fillStyle = it.sub.cor; ctx.fillRect(r.x0, r.y1 - it.sub.w, r.x1 - r.x0, it.sub.w); }
    if (it.bl) { ctx.fillStyle = it.bl.cor; ctx.fillRect(r.x0, r.y0, it.bl.w, r.y1 - r.y0); }
    ctx.save(); ctx.font = fonteDe(it, m.tam); ctx.textBaseline = 'alphabetic';
    if (it.sombra) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = Math.round(m.tam * 0.18); ctx.shadowOffsetY = Math.round(m.tam * 0.05); }
    const caixa = !!(it.wz || it.bg), centro = it.wz ? (it.txtAl !== 'left') : false, gal = it.ial || it.al || 'left';
    const alinha = it.wz ? (it.txtAl || 'center') : (it.alinhaTexto || null);
    ctx.fillStyle = it.cor || '#fff';
    m.linhas.forEach((l, n) => {
      const yb = r.y0 + m.padY + n * m.lh + m.tam * 0.9 + (m.lh - m.tam * 1.18) / 2;
      let tx, ta = alinha;
      if (!ta) ta = it.bg ? 'center' : (gal === 'center' ? 'center' : gal === 'right' ? 'right' : 'left');
      if (ta === 'center') tx = (r.x0 + r.x1) / 2; else if (ta === 'right') tx = r.x1 - m.padX; else tx = r.x0 + m.padX;
      ctx.textAlign = ta; ctx.fillText(l, tx, yb);
    });
    if (it.setas) { ctx.fillStyle = it.setas; ctx.font = fonteDe(it, Math.round(m.tam * 1.7)); ctx.textAlign = 'left'; ctx.fillText('»', r.x0 + 10, r.y0 + m.padY + m.tam * 1.05); ctx.textAlign = 'right'; ctx.fillText('«', r.x1 - 10, r.y0 + m.padY + m.tam * 1.05); }
    ctx.restore();
    return { k: it.k, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
  }
  function fundoFoto(ctx, img, W, H, ajuste) {
    if (ajuste === 'inteira') {
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
      try { ctx.save(); ctx.filter = 'blur(40px)'; cobrir(ctx, img, -60, -60, W + 120, H + 120); ctx.restore(); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H); } catch (e) { /* sem blur: fica o fundo escuro */ }
      caber(ctx, img, 0, 0, W, H);
    } else cobrir(ctx, img, 0, 0, W, H);
  }
  /** Monta a FOTO no formato da postagem (Feed 1080×1350 / Story 1080×1920) antes de qualquer visual:
   *  'preencher' = corta para cobrir, 'inteira' = foto inteira com fundo desfocado, 'margem' = foto inteira com margem de cor.
   *  Zoom (m.zoom) e deslocamento (m.fx/m.fy, em fração da tela) valem para os três. O visual é desenhado POR CIMA, sem mexer na foto. */
  const fundoBorrado = new WeakMap();
  function fundoDesfocado(img, W, H) {
    const k = W + 'x' + H, mapa = fundoBorrado.get(img) || {}; if (mapa[k]) return mapa[k];
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, W, H);
    try { x.filter = 'blur(40px)'; cobrir(x, img, -60, -60, W + 120, H + 120); x.filter = 'none'; x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, W, H); } catch (e) { /* sem blur: fundo escuro */ }
    mapa[k] = c; fundoBorrado.set(img, mapa); return c;
  }
  function limitesFoto_(m) { m.zoom = Math.min(4, Math.max(0.3, Number(m.zoom) || 1)); m.fx = Math.min(1, Math.max(-1, Number(m.fx) || 0)); m.fy = Math.min(1, Math.max(-1, Number(m.fy) || 0)); }
  function compor(img, W, H, m) {
    m = m || {}; limitesFoto_(m);
    const modo = nova.ajuste === 'inteira' || nova.ajuste === 'margem' ? nova.ajuste : 'preencher';
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    if (modo === 'margem') { x.fillStyle = nova.margemCor || '#ffffff'; x.fillRect(0, 0, W, H); } else x.drawImage(fundoDesfocado(img, W, H), 0, 0);
    const r = (modo === 'preencher' ? Math.max(W / img.width, H / img.height) : Math.min(W / img.width, H / img.height)) * m.zoom;
    const iw = img.width * r, ih = img.height * r;
    x.drawImage(img, (W - iw) / 2 + m.fx * W, (H - ih) / 2 + m.fy * H, iw, ih);
    return c;
  }
  function degrade(ctx, W, y0, y1, a0, a1, cor) { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgba(' + (cor || '0,0,0') + ',' + a0 + ')'); g.addColorStop(1, 'rgba(' + (cor || '0,0,0') + ',' + a1 + ')'); ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0)); }
  /** Desenha a foto + fundo do visual + itens; devolve as caixas dos textos (para arrastar). */
  function desenharTemplate(ctx, img, W, H, tpl, ef, ajuste) {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
    const fundo = ef && ef.fundo ? ef.fundo : 'foto';
    if (tpl === 'original' || tpl === 'elausa') fundoFoto(ctx, img, W, H, ajuste); else if (fundo === 'arte') desenharArte(ctx, img, W, H, (ef && ef.arteBase) || tpl, ajuste); else cobrir(ctx, img, 0, 0, W, H);
    if (fundo === 'baixo') degrade(ctx, W, H * 0.5, H, 0, 0.88);
    else if (fundo === 'baixo-leve') degrade(ctx, W, H * 0.7, H, 0, 0.45);
    else if (fundo === 'ambos') { degrade(ctx, W, H * 0.42, 0, 0, 0.7); degrade(ctx, W, H * 0.58, H, 0, 0.82); }
    else if (fundo === 'topo') { degrade(ctx, W, H * 0.5, 0, 0, 0.85); }
    else if (fundo === 'baixo-dir') { degrade(ctx, W, H * 0.5, H, 0, 0.82); const g = ctx.createLinearGradient(W * 0.3, 0, W, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.4)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    else if (fundo === 'direita') { const g = ctx.createLinearGradient(W * 0.35, 0, W, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.78)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); degrade(ctx, W, H * 0.8, H, 0, 0.5); }
    else if (fundo === 'rodape') { ctx.fillStyle = CINZA; ctx.fillRect(0, H * 0.75, W, H * 0.25); }
    else if (fundo === 'energia') { ctx.fillStyle = LARANJA; ctx.fillRect(0, H * 0.8, W, H * 0.2); }
    const caixas = [];
    ((ef && ef.lista) || []).forEach((it) => {
      if (it.deco === 'caixa') { ctx.save(); if (it.cx.sombra) { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8; } ctx.fillStyle = it.cx.cor; caixaArredondada(ctx, it.x0, it.y0, it.x1, it.y1, it.cx.r); ctx.fill(); ctx.restore(); }
    });
    ((ef && ef.lista) || []).forEach((it) => { if (!it.deco) { const bx = desenharItem(ctx, it, W, H); if (bx) caixas.push(bx); } });
    return caixas;
  }
  function tamanhoAlvo() { return nova.tipo === 'story' ? [1080, 1920] : [1080, 1350]; }
  async function carregarFontes_() { try { await Promise.all(['700 40px Poppins', '800 40px Poppins', '400 30px Inter', '700 30px Inter'].map((f) => document.fonts.load(f))); } catch (e) { /* sem fonte da loja: usa a do aparelho */ } }
  const imgCache = {};
  async function imagemCache(url) { if (!imgCache[url]) imgCache[url] = carregarImagem(url).catch((e) => { delete imgCache[url]; throw e; }); return imgCache[url]; }
  function itensDaPostagem() { return nova.modoLivre || nova.modoCli ? nova.livre : nova.midias.filter((m) => m.sel); }
  function deveMostrarPrevia() { return nova && (nova.previa || (nova.template && nova.template !== 'original')) && nova.tipo !== 'reels'; }
  let previaSeq = 0;
  function pintarCanvas(c) {
    const m = c._m, [W, H] = tamanhoAlvo(); c.width = W; c.height = H;
    const x = c.getContext('2d');
    c._boxes = desenharTemplate(x, compor(c._img, W, H, m), W, H, nova.template, itensEfetivos(nova.template, m), 'preencher');
    if (nova.tipo === 'story' && nova.manual && (nova.template === 'original' || nova.template === 'elausa')) {     // só na prévia: reserva o lugar do botão de link que será colocado no Instagram
      x.save(); x.setLineDash([14, 10]); x.lineWidth = 4; x.strokeStyle = 'rgba(255,255,255,.95)'; x.fillStyle = 'rgba(0,0,0,.35)';
      const bw = W * 0.56, bh = H * 0.05, bx = (W - bw) / 2, by = H * 0.655; x.fillRect(bx, by, bw, bh); x.strokeRect(bx, by, bw, bh);
      x.setLineDash([]); x.fillStyle = '#fff'; x.font = 'bold ' + Math.round(W * 0.028) + 'px ' + FONTE; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🔗 aqui entra o link (só na prévia)', W / 2, by + bh / 2); x.restore();
    }
  }
  function repintar() { document.querySelectorAll('#po-previa canvas').forEach((c) => { if (c._img) pintarCanvas(c); }); }
  let arr = null, arrRaf = 0, arrGlobal = false;
  function pontoDe(c, e) { const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e, r = c.getBoundingClientRect(); return { x: (t.clientX - r.left) / r.width * c.width, y: (t.clientY - r.top) / r.height * c.height }; }
  function acharCaixa(c, pt) { const b = c._boxes || []; for (let i = b.length - 1; i >= 0; i--) if (pt.x >= b[i].x0 && pt.x <= b[i].x1 && pt.y >= b[i].y0 && pt.y <= b[i].y1) return b[i]; return null; }
  function moverArraste(e) {
    if (!arr) return; const c = arr.c, pt = pontoDe(c, e), m = c._m; m.pos = m.pos || {}; m.pos[nova.template] = m.pos[nova.template] || {};
    m.pos[nova.template][arr.k] = { x: Math.min(1, Math.max(0, arr.x + (pt.x - arr.ox) / c.width)), y: Math.min(1.02, Math.max(0.02, arr.y + (pt.y - arr.oy) / c.height)) };
    if (!arrRaf) arrRaf = requestAnimationFrame(() => { arrRaf = 0; if (arr) pintarCanvas(arr.c); }); if (e.cancelable) e.preventDefault();
  }
  function fimArraste() { if (arr) { const c = arr.c; arr = null; c.classList.remove('arrastando'); pintarCanvas(c); } }
  function fotoAtiva_() { const l = itensDaPostagem().filter((m) => m.tipo === 'imagem'); return (nova.fotoAtiva && l.indexOf(nova.fotoAtiva) >= 0) ? nova.fotoAtiva : (nova.fotoAtiva = l[0] || null); }
  let pan = null;
  function marcarAtiva_(c) { nova.fotoAtiva = c._m; document.querySelectorAll('#po-previa canvas').forEach((q) => q.classList.toggle('ativa', q === c)); const z = $('po-zoom'); if (z) z.value = c._m.zoom || 1; }
  function distDedos_(e) { const a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
  function ligarFoto(c) {
    const r = () => c.getBoundingClientRect();
    const mexer = (ptX, ptY) => { if (!pan) return; const m = c._m, k = r(); m.fx = pan.fx + (ptX - pan.x) / k.width; m.fy = pan.fy + (ptY - pan.y) / k.height; limitesFoto_(m); if (!pan.raf) pan.raf = requestAnimationFrame(() => { if (pan) pan.raf = 0; pintarCanvas(c); }); };
    c.addEventListener('mousedown', (e) => { marcarAtiva_(c); if (arr || acharCaixa(c, pontoDe(c, e))) return; pan = { x: e.clientX, y: e.clientY, fx: c._m.fx || 0, fy: c._m.fy || 0 }; c.style.cursor = 'move'; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (pan && !pan.toque) mexer(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { if (pan && !pan.toque) { pan = null; c.style.cursor = ''; pintarCanvas(c); } });
    c.addEventListener('wheel', (e) => { if (!nova.moverFoto && !e.ctrlKey) return; marcarAtiva_(c); const m = c._m; m.zoom = (m.zoom || 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08); limitesFoto_(m); const z = $('po-zoom'); if (z) z.value = m.zoom; pintarCanvas(c); e.preventDefault(); }, { passive: false });
    c.addEventListener('touchstart', (e) => {
      marcarAtiva_(c);
      if (e.touches.length === 2) { pan = { toque: 2, d: distDedos_(e), z: c._m.zoom || 1 }; e.preventDefault(); return; }
      if (e.touches.length === 1 && nova.moverFoto && !arr && !acharCaixa(c, pontoDe(c, e))) { const t = e.touches[0]; pan = { toque: 1, x: t.clientX, y: t.clientY, fx: c._m.fx || 0, fy: c._m.fy || 0 }; e.preventDefault(); }
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      if (!pan || !pan.toque) return;
      if (pan.toque === 2 && e.touches.length === 2) { c._m.zoom = pan.z * distDedos_(e) / (pan.d || 1); limitesFoto_(c._m); const z = $('po-zoom'); if (z) z.value = c._m.zoom; if (!pan.raf) pan.raf = requestAnimationFrame(() => { if (pan) pan.raf = 0; pintarCanvas(c); }); }
      else if (pan.toque === 1 && e.touches.length === 1) mexer(e.touches[0].clientX, e.touches[0].clientY);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const fim = () => { if (pan && pan.toque) { pan = null; pintarCanvas(c); } };
    c.addEventListener('touchend', fim); c.addEventListener('touchcancel', fim);
  }
  function ligarArraste(c) {
    if (!arrGlobal) { arrGlobal = true; window.addEventListener('mousemove', moverArraste); window.addEventListener('mouseup', fimArraste); }
    const inicio = (e) => { const pt = pontoDe(c, e), b = acharCaixa(c, pt); if (!b) return; const it = itensEfetivos(nova.template, c._m).lista.find((q) => q.k === b.k); if (!it) return; arr = { c: c, k: b.k, x: it.x, y: it.y, ox: pt.x, oy: pt.y }; c.classList.add('arrastando'); if (e.cancelable) e.preventDefault(); };
    c.addEventListener('mousedown', inicio);
    c.addEventListener('touchstart', inicio, { passive: false }); c.addEventListener('touchmove', moverArraste, { passive: false }); c.addEventListener('touchend', fimArraste); c.addEventListener('touchcancel', fimArraste);
    c.addEventListener('mousemove', (e) => { if (!arr) c.style.cursor = acharCaixa(c, pontoDe(c, e)) ? 'grab' : 'default'; });
  }
  async function pintarPrevia() {
    const box = $('po-previa'); if (!box) return;
    const fotos = itensDaPostagem().filter((m) => m.tipo === 'imagem').slice(0, 10), meu = ++previaSeq;
    if (!fotos.length) { box.innerHTML = '<p class="po-ajuda">Escolha pelo menos uma foto.</p>'; return; }
    box.innerHTML = '<p class="po-ajuda">Montando…</p>';
    await carregarFontes_();
    const cs = [];
    try {
      for (const m of fotos) { const img = await imagemCache(m.url); if (meu !== previaSeq) return; const c = document.createElement('canvas'); c._m = m; c._img = img; pintarCanvas(c); c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'Prévia da postagem. Arraste os textos para mudar de lugar.'); ligarArraste(c); ligarFoto(c); cs.push(c); }
      box.innerHTML = ''; cs.forEach((c) => box.appendChild(c));
    } catch (e) { box.innerHTML = '<p class="po-aviso erro">' + esc(e.message || 'Não deu para montar a prévia.') + '</p>'; }
  }
  function blobDe(c) { return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Não consegui preparar a imagem.'))), 'image/jpeg', 0.9)); }

  /* ---------- envio de mídia ---------- */
  async function subirBlob(blob, nome) {
    const s = sessao(); if (!s) throw new Error('Entre com o seu login para postar.');
    try {
      const r = await fetch(MIDIA_URL + '/u?temp=1', { method: 'POST', headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao }, body: blob });
      const j = await r.json();
      if (r.ok && j && j.ok && j.url) return j.url;
      throw new Error((j && j.erro) || ('HTTP ' + r.status));
    } catch (e) {
      if (typeof subirMidia_ === 'function') {      // plano B: o mesmo caminho do cadastro (cai no Cloudinary)
        try { return await subirMidia_(new File([blob], nome, { type: blob.type }), {}, null, blob.type.indexOf('video') === 0 ? 'video' : 'image', 'postagem'); } catch (e2) { /* cai no erro abaixo */ }
      }
      throw new Error('Não consegui enviar a mídia (' + ((e && e.message) || 'falha') + ').');
    }
  }
  async function videoDoAparelho(file) {
    if (file.size > 40 * 1048576) { return msg('Esse vídeo passa de 40 MB. Corte ou comprima e tente de novo.', true); }
    msg('Enviando o vídeo…', false);
    try { const url = await subirBlob(file, file.name || 'video.mp4'); nova.midias.forEach((m) => { if (nova.tipo === 'reels') m.sel = false; }); nova.midias.push({ url, tipo: 'video', sel: true }); msg('Vídeo pronto.', false); }
    catch (e) { msg(e.message, true); }
  }
  function adicionarLivres(arqs) {
    const erros = [];
    arqs.forEach((f) => {
      const video = /^video\//.test(f.type), foto = /^image\/(jpeg|png|webp)$/.test(f.type);
      if (!video && !foto) { erros.push(f.name + ': formato não aceito (use JPG, PNG, WEBP, MP4 ou WEBM)'); return; }
      if (video && f.size > 40 * 1048576) { erros.push(f.name + ': vídeo passa de 40 MB'); return; }
      if (nova.livre.length >= 30) { erros.push('No máximo 30 mídias por vez'); return; }
      nova.livre.push({ file: f, tipo: video ? 'video' : 'imagem', url: URL.createObjectURL(f), nome: f.name, hora: '' });
    });
    aviso = erros.join(' · '); avisoErro = erros.length > 0; desenhar();
  }
  /** Intervalo "humano" (igual ao do servidor): Story depois de Story 1–3 min; o resto 3–9 min. */
  function gapHumanoMs(ant, tipo) { const curto = ant === 'story' && tipo === 'story', mn = curto ? 1 : 3, mx = curto ? 3 : 9; return Math.round((mn + Math.random() * (mx - mn)) * 60000); }
  async function prepararMidia(m) {
    if (m.file && m.tipo === 'video') return { url: await subirBlob(m.file, m.nome || 'video.mp4'), tipo: 'video' };
    if (m.tipo === 'video') return { url: m.url, tipo: 'video' };
    const [W, H] = tamanhoAlvo(), c = document.createElement('canvas'); c.width = W; c.height = H;
    try {
      await carregarFontes_();
      const img = await imagemCache(m.url); desenharTemplate(c.getContext('2d'), compor(img, W, H, m), W, H, nova.template, itensEfetivos(nova.template, m), 'preencher');
      const blob = await blobDe(c); return { url: await subirBlob(blob, 'post.jpg'), tipo: 'imagem' };
    } catch (e) {
      if (nova.template === 'original' && /^https:\/\//.test(m.url) && /\.(jpe?g)(\?|$)/i.test(m.url)) return { url: m.url, tipo: 'imagem' };   // sem canvas: JPG original serve
      throw e;
    }
  }

  /* ---------- criar ---------- */
  async function enviar() {
    if (ocupado) return;
    const n = nova, cli = n.modoCli, livre = n.modoLivre || cli, sel = livre ? n.livre : n.midias.filter((m) => m.sel);
    if (!livre && !n.p) return msg('Escolha a peça.', true);
    if (livre && !n.livre.length) return msg(cli ? 'Escolha fotos na aba “Fotos de clientes”.' : 'Escolha pelo menos uma foto ou vídeo.', true);
    if (n.tipo === 'feed' && (sel.length !== 1 || sel[0].tipo !== 'imagem')) return msg('Para Feed, use exatamente 1 foto.', true);
    if (n.tipo === 'carrossel' && (sel.length < 2 || sel.length > 10)) return msg('Para Carrossel, use de 2 a 10 mídias.', true);
    if (n.tipo === 'reels' && (sel.length !== 1 || sel[0].tipo !== 'video')) return msg('Para Reels, use 1 vídeo (da peça ou do aparelho).', true);
    if (n.tipo === 'story' && !sel.length) return msg('Escolha pelo menos uma foto ou vídeo para o Story.', true);
    const link = n.manual ? (livre ? String(n.link || '').trim() : linkProduto(n.p)) : '';
    if (n.manual && !/^https:\/\//i.test(link)) return msg('Coloque o link do Story começando com https://', true);
    // horários: 'agora' | 'sequencia' (o servidor escalona) | datas (uma por postagem)
    const nPosts = n.tipo === 'story' ? sel.length : 1;
    let quandos = [];
    if (n.quando === 'agendar') {
      const d0 = new Date(n.data); if (!n.data || isNaN(d0)) return msg('Escolha o dia e a hora.', true);
      let t = d0.getTime(), ant = null;
      for (let k = 0; k < nPosts; k++) {
        const proprio = livre && n.tipo === 'story' && sel[k].hora ? new Date(sel[k].hora).getTime() : NaN;
        if (isFinite(proprio)) { quandos.push(proprio); continue; }
        if (k > 0 && n.seqAgenda && n.tipo === 'story') t += gapHumanoMs(ant, 'story');
        quandos.push(t); ant = 'story';
      }
      if (quandos.some((q) => q < Date.now() + 60000)) return msg('Os horários precisam ser daqui a pelo menos 1 minuto (ou use “Agora mesmo”).', true);
      quandos = quandos.map((q) => new Date(q).toISOString());
    } else quandos = Array.from({ length: nPosts }, () => n.quando);
    ocupado = true; aviso = ''; desenhar();
    try {
      const prontas = []; for (const m of sel) prontas.push(await prepararMidia(m));
      const grupo = livre ? (cli ? 'cliente-' : 'livre-') + Date.now().toString(36) : String(n.p.Codigo || n.p.ID || '');
      const base = { legenda: n.legenda, produto: livre ? '' : grupo, template: livre ? (cli ? 'elausa' : (n.template === 'original' ? 'livre' : 'livre-' + n.template)) : n.template, por: (typeof funcionarioNome !== 'undefined' ? funcionarioNome : '') || '' };
      let corpo;
      if (n.tipo === 'story') corpo = { posts: prontas.map((m, k) => Object.assign({}, base, { tipo: 'story', quando: quandos[k], midias: [m], modo: n.manual ? 'manual' : 'auto', link: n.manual ? link : undefined, grupo })), por: base.por };
      else corpo = Object.assign({}, base, { tipo: n.tipo, quando: quandos[0], midias: prontas });
      const r = await ig('/post', 'POST', corpo);
      if (!r || !r.ok) throw new Error(erroTxt(r));
      const qtd = (r.ids || []).length || 1, hh = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      aviso = n.manual ? 'Pronto! ' + qtd + ' Story' + (qtd > 1 ? 's' : '') + ' ' + (n.quando === 'agendar' ? 'vão aparecer na aba “Postar à mão” na hora marcada.' : 'esperando você na aba “Postar à mão”.')
        : n.quando === 'agora' ? 'Enviado! Em instantes aparece em “Já postadas” (vídeo pode demorar alguns minutos).'
        : n.quando === 'sequencia' ? 'Na fila! ' + (r.quandos && r.quandos.length ? 'Sai entre ' + hh(r.quandos[0]) + ' e ' + hh(r.quandos[r.quandos.length - 1]) + ', com intervalos variados.' : '')
        : 'Agendado! O servidor posta sozinho na hora marcada, mesmo com o celular desligado.';
      avisoErro = false;
      const feita = livre ? '' : String(n.p.ID), resto = (n.lote || []).filter((i) => i !== feita), cfg = { tipo: n.tipo, template: n.template, quando: n.quando, data: n.data, manual: n.manual, seqAgenda: n.seqAgenda };
      if (cli) { const ids = n.livre.map((m) => m.fotoId).filter(Boolean); if (ids.length) { await ig('/fotos/acao', 'POST', { ids: ids, acao: 'usada' }); } }
      n.livre.forEach((m) => { try { if (!m.fotoId) URL.revokeObjectURL(m.url); } catch (e) {} });
      ocupado = false;
      if (!livre && resto.length) {      // tem mais peças na lista: segue para a próxima com as mesmas escolhas
        novaVazia(resto); Object.assign(nova, cfg); abaAtual = 'nova'; escolherPeca(resto[0]);
        aviso += ' Próxima da lista: ' + nomeLote(resto[0]) + ' (faltam ' + resto.length + ').';
        await carregarFila(); return;
      }
      abaAtual = n.manual ? 'manual' : n.quando === 'agora' ? 'hist' : 'fila'; novaVazia([]);
      await carregarFila();
    } catch (e) { ocupado = false; msg((e && e.message) || 'Não deu certo. Tente de novo.', true); }
  }

  /* ---------- lista de peças para postar (vem dos cartões / seleção em massa) ---------- */
  window.tkPostarPecas = async function (ids) {
    if (!podePostar()) { alert('Você não tem permissão para postar no Instagram.'); return; }
    montar(); if (!nova) novaVazia();
    const todos = pecasAtivas().map((p) => String(p.ID)), novos = (ids || []).map(String).filter((i) => todos.indexOf(i) !== -1);
    if (!novos.length) { alert('Essas peças não estão ativas (arquivadas não vão para postagem).'); return; }
    nova.lote = (nova.lote || []).filter((i) => novos.indexOf(i) === -1).concat(novos);
    abaAtual = 'nova'; aviso = novos.length > 1 ? novos.length + ' peças na lista para postar. Vamos uma por uma.' : ''; avisoErro = false;
    escolherPeca(novos[0]);
    abrirComHistorico_('overlay-postagens'); desenhar();
    carregarFila();
  };
  function nomeLote(id) { const p = pecasAtivas().find((x) => String(x.ID) === String(id)); return p ? (p.Codigo ? p.Codigo + ' · ' : '') + p.Nome : id; }
  function htmlLote() {
    const l = (nova && nova.lote) || []; if (!l.length) return '';
    return '<div class="po-passo" style="border-color:#c13584"><h4>📋 Lista para postar (' + l.length + ')</h4>' + l.map((id) => '<div class="po-escolhida" style="margin-bottom:6px' + (nova.p && String(nova.p.ID) === String(id) ? ';border-color:#c13584;background:#fde7f3' : '') + '"><button type="button" data-lote="' + esc(id) + '" style="margin:0;background:transparent;flex:1;text-align:left;font-weight:700">' + (nova.p && String(nova.p.ID) === String(id) ? '▶ ' : '') + esc(nomeLote(id)) + '</button><label style="display:flex;gap:4px;align-items:center;font-size:.78rem;white-space:nowrap;min-height:36px"><input type="checkbox" data-sp="' + esc(id) + '"' + (semPrecoIds[String(id)] ? ' checked' : '') + '> sem preço</label><button type="button" data-lote-x="' + esc(id) + '" aria-label="Tirar da lista">✕</button></div>').join('') + '</div>';
  }

  /* ---------- liga ---------- */
  (async function init() {
    const botao = $('btn-abrir-postagens'); if (!botao) return;
    botao.addEventListener('click', () => { if (!podePostar()) { alert('Você não tem permissão para postar no Instagram.'); return; } abrir(); });
    botao.hidden = false;
  })();
})();
