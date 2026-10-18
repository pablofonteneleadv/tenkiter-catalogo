/* ====================================================================
 * TENKiTER — admin-fotoia.js (v1.0) — "FOTOS COM IA" (Gemini gera a capa de campanha a partir das fotos reais da peça)
 *  Pedido do Pablo (18/10/2026): "de graça, respeitando os limites do plano; sem crédito entra na fila e faz quando tiver cota", com a instrução
 *  EDITÁVEL pelo gestor para ir testando os resultados (a de partida é a SKILL dele: Reels/Carrossel 9:16, seta →, modelos alegres, zero texto).
 *  Fala com o Worker `tenkiter-ig` (INSTAGRAM_URL, common.js) em /fotoia/*: o Worker guarda a fila, tenta uma por minuto e, se a cota acabou, deixa
 *  o pedido esperando (nada se perde, nada é cobrado a mais). A chave do Gemini é a mesma da leitura de fotos (⚙️ no importador) e NUNCA vem para cá.
 *  Quem usa: gerir_acessos OU catalogo_cadastrar. Só o Admin total (gerir_acessos) muda a instrução, os modelos e o limite por dia.
 * Carrega depois de admin-postagens.js; usa getSessao, usuarioAdmin, temPermissao, produtos, abrirComHistorico_/fecharComHistorico_.
 * ==================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => escaparHtml(v);
  let extraTxt = '', aba = 'gerar', cfg = null, info = null, itens = [], cont = {}, filtro = 'todas', timer = null, busca = '', escolhida = null, fotosEsc = [], extras = [], enviando = false, msgTxt = '', msgTipo = '';
  const MAX_FOTOS = 4;

  /* ---------- Worker ---------- */
  function sessao() { const s = typeof getSessao === 'function' ? getSessao() : null; return s && /^tk[12]\./.test(String(s.sessao)) ? s : null; }
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
      .fia-abas button[aria-selected="true"] { background: var(--laranja); border-color: var(--laranja); color: #0d0d0d; }
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
    `;
    document.head.appendChild(s);
  }

  /* ---------- janela ---------- */
  function montar() {
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
    const u = info.hoje || {}, semCota = Object.keys(info.semCota || {});
    return '<div class="fia-st"><span>' + (info.temChave ? '🔑 Chave do Gemini: ✓ (…' + esc(info.fimChave) + ')' : '🔑 Chave do Gemini: falta') + '</span><span>🖼️ Hoje: ' + (u.usadas || 0) + ' de ' + (u.limite || 0) + '</span>' +
      (nFila() ? '<span>⏳ Na fila: ' + nFila() + '</span>' : '') + (semCota.length ? '<span>⚠️ Sem cota agora: ' + semCota.length + ' modelo(s)</span>' : '') + (info.config && info.config.ligado === false ? '<span>⏸️ IA desligada</span>' : '') + '</div>' +
      (info.temChave ? '' : '<p class="fia-erro">Falta a chave do Gemini. Cole-a em <b>Produtos para aceitar ▸ ⚙️ Instagram ▸ IA</b> (a mesma chave serve para ler as fotos e gerar imagens).</p>');
  }
  function pecasFiltradas() {
    let l = []; try { l = typeof produtos !== 'undefined' && Array.isArray(produtos) ? produtos : []; } catch (e) { l = []; }
    l = l.filter((p) => !(typeof ehInativo_ === 'function' && ehInativo_(p)));
    const q = semAc(busca).trim(); if (q) l = l.filter((p) => semAc((p.Nome || '') + ' ' + (p.Codigo || '') + ' ' + (p.Categoria || '')).indexOf(q) !== -1);
    return l.slice(0, 40);
  }
  const semAc = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function fotosDaPeca(p) {
    return [String(p.Foto_URL || '').trim()].concat(String(p.Fotos_Galeria || '').split(',').map((x) => x.trim())).filter((u, i, a) => /^https:\/\//i.test(u) && !/\.(mp4|webm|mov)(\?|$)/i.test(u) && a.indexOf(u) === i).slice(0, 10);
  }
  function desenharGerar() {
    const a = $('fia-aba'); if (!a) return;
    const pecas = pecasFiltradas(), fotos = escolhida ? fotosDaPeca(escolhida) : [];
    const sel = (u) => fotosEsc.indexOf(u) + 1;
    a.innerHTML = statusHtml() + (msgTxt ? '<p class="' + (msgTipo === 'erro' ? 'fia-erro' : 'fia-ok') + '">' + esc(msgTxt) + '</p>' : '') +
      '<div class="fia-aviso">A IA recebe as fotos reais da peça e gera <b>1 imagem de capa</b> seguindo a sua instrução (aba ⚙️). Se a cota do Google acabar, o pedido <b>espera na fila</b> e sai sozinho quando voltar — não precisa ficar na tela.</div>' +
      '<label for="fia-busca">1. Escolha a peça</label><input type="text" id="fia-busca" placeholder="Nome ou código…" value="' + esc(busca) + '" autocomplete="off">' +
      '<div class="fia-pecas">' + (pecas.length ? pecas.map((p) => '<button type="button" class="fia-peca" data-a="peca" data-id="' + esc(p.ID) + '" aria-pressed="' + !!(escolhida && String(escolhida.ID) === String(p.ID)) + '"><img loading="lazy" decoding="async" alt="" ' + atribSrc(fotoMini(String(p.Foto_URL || ''), 220)) + '><b>' + esc((p.Codigo ? p.Codigo + ' · ' : '') + (p.Nome || 'Peça')) + '</b></button>').join('') : '<p class="fia-dica">Nenhuma peça encontrada.</p>') + '</div>' +
      (escolhida || extras.length ? '<label>2. Quais fotos a IA deve usar? (até ' + MAX_FOTOS + ', na ordem em que tocar)</label><div class="fia-fotos">' +
        fotos.map((u) => '<div class="fia-foto" aria-pressed="' + (sel(u) > 0) + '"><img loading="lazy" decoding="async" alt="" ' + atribSrc(fotoMini(u, 200)) + '>' + (sel(u) > 0 ? '<i>' + sel(u) + '</i>' : '') + '<button type="button" data-a="foto" data-u="' + esc(u) + '" aria-label="Usar esta foto"></button></div>').join('') +
        extras.map((x, i) => '<div class="fia-foto" aria-pressed="' + (sel(x.url) > 0) + '"><img alt="" ' + atribSrc(x.url) + '>' + (sel(x.url) > 0 ? '<i>' + sel(x.url) + '</i>' : '') + '<button type="button" data-a="foto" data-u="' + esc(x.url) + '" aria-label="Usar esta foto do aparelho"></button></div>').join('') + '</div>' : '') +
      '<div class="fia-linha"><label class="fia-btn" for="fia-arq" style="margin:0">📎 Foto do aparelho</label><input type="file" id="fia-arq" accept="image/jpeg,image/png,image/webp" multiple hidden></div>' +
      '<label for="fia-extra">3. Observação para esta imagem (opcional)</label><input type="text" id="fia-extra" maxlength="300" value="' + esc(extraTxt) + '" placeholder="Ex.: fundo areia, só duas modelos…">' +
      '<div class="fia-linha"><button type="button" class="fia-btn pri" data-a="enviar" ' + (enviando || !info.temChave ? 'disabled' : '') + '>' + (enviando ? 'Enviando…' : '➕ Colocar na fila') + '</button><span class="fia-dica">' + fotosEsc.length + ' de ' + MAX_FOTOS + ' fotos marcadas</span></div>';
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
      (x.extra ? '<small>Observação: ' + esc(x.extra) + '</small>' : '') +
      (x.status === 'fila' && x.espera ? '<p class="fia-aviso">⏳ ' + esc(x.erro || 'Esperando a cota.') + ' Tenta de novo por volta de <b>' + esc(dataBr(x.espera)) + '</b>.</p>' : '') +
      (x.status === 'fila' && !x.espera && !x.erro ? '<small>Aguardando a vez (1 por minuto).</small>' : '') +
      (x.status === 'gerando' ? '<small>A IA está criando a imagem… (leva de 10 a 60 segundos)</small>' : '') +
      (x.status === 'erro' ? '<p class="fia-erro">' + esc(x.erro || 'Não deu certo.') + '</p>' : '') +
      '<div class="fia-resu">' + (x.resultado ? '<img alt="Imagem gerada" data-a="ampliar" data-u="' + esc(x.resultado) + '" ' + atribSrc(x.resultado) + '>' : '') +
      '<div class="fia-fontes" title="Fotos enviadas à IA">' + (x.fontes || []).map((u) => '<img alt="" loading="lazy" ' + atribSrc(u) + '>').join('') + '</div></div>' +
      '<div class="fia-linha">' + botoes.map((b) => '<button type="button" class="fia-btn ' + b[2] + '" data-a="acao" data-v="' + b[0] + '" data-id="' + x.id + '">' + b[1] + '</button>').join('') + '</div></div>';
  }
  function desenharFila(manterRolagem) {
    const a = $('fia-aba'); if (!a) return;
    const y = $('fia-corpo').scrollTop;
    const filtros = [['todas', 'Todas'], ['fila', 'Na fila'], ['pronta', 'Prontas'], ['aprovada', 'Aprovadas'], ['erro', 'Com erro'], ['descartada', 'Descartadas']];
    const vis = itens.filter((x) => filtro === 'todas' ? x.status !== 'descartada' && x.status !== 'cancelada' : x.status === filtro || (filtro === 'fila' && x.status === 'gerando'));
    a.innerHTML = statusHtml() + '<div class="fia-abas">' + filtros.map((f) => '<button type="button" data-a="filtro" data-v="' + f[0] + '" aria-selected="' + (filtro === f[0]) + '">' + f[1] + '</button>').join('') + '</div>' +
      (vis.length ? vis.map(cartao).join('') : '<p class="fia-dica">Nada aqui ainda. Volte em “✨ Gerar” e coloque uma peça na fila.</p>');
    if (manterRolagem) $('fia-corpo').scrollTop = y;
  }
  function desenharInstrucao() {
    const a = $('fia-aba'); if (!a) return; const ed = ehGestor() && !!(info && info.podeEditar !== false), dis = ed ? '' : ' disabled';
    a.innerHTML = statusHtml() + (ed ? '' : '<p class="fia-aviso">Só o Admin total muda a instrução e os limites. Você pode ler e usar.</p>') +
      '<label for="fia-instr">Instrução enviada à IA em TODO pedido <span class="fia-dica" id="fia-cont"></span></label><textarea id="fia-instr" maxlength="12000"' + dis + '>' + esc(cfg.instrucao) + '</textarea>' +
      '<p class="fia-dica">Dica: mude uma coisa por vez e gere de novo (🔁 Refazer) para comparar. O nome da peça, as fotos e a observação do pedido são acrescentados no fim automaticamente.</p>' +
      '<label for="fia-formato">Proporção da imagem</label><select id="fia-formato"' + dis + '>' + ['9:16', '4:5', '3:4', '1:1'].map((f) => '<option value="' + f + '"' + (cfg.formato === f ? ' selected' : '') + '>' + f + (f === '9:16' ? ' (Story / Reels)' : f === '4:5' ? ' (Feed)' : '') + '</option>').join('') + '</select>' +
      '<label for="fia-modelos">Modelos (um por linha; tenta na ordem e pula o que estiver sem cota)</label><textarea id="fia-modelos" style="min-height:90px"' + dis + '>' + esc((cfg.modelos || []).join('\n')) + '</textarea>' +
      '<label for="fia-modo">Jeito de falar com o Google</label><select id="fia-modo"' + dis + '>' + [['auto', 'Automático (tenta o novo e depois o clássico)'], ['interactions', 'Só Interactions API'], ['generateContent', 'Só generateContent (clássico)']].map((m) => '<option value="' + m[0] + '"' + (cfg.modo === m[0] ? ' selected' : '') + '>' + m[1] + '</option>').join('') + '</select>' +
      '<label for="fia-lim">Máximo de imagens por dia (trava contra gasto)</label><input type="number" id="fia-lim" min="1" max="200" value="' + esc(cfg.limiteDia) + '"' + dis + '>' +
      '<label><input type="checkbox" id="fia-lig"' + (cfg.ligado !== false ? ' checked' : '') + dis + '> IA ligada (desmarcado: os pedidos esperam na fila)</label>' +
      '<p class="fia-aviso">Sobre custo: os modelos de imagem do Google podem não ter plano gratuito. Se a sua chave não tiver cota de imagem, os pedidos ficam na fila (nada é cobrado) e a tela avisa. O limite por dia protege caso você ligue um plano pago.</p>' +
      (msgTxt ? '<p class="' + (msgTipo === 'erro' ? 'fia-erro' : 'fia-ok') + '">' + esc(msgTxt) + '</p>' : '') +
      (ed ? '<div class="fia-linha"><button type="button" class="fia-btn pri" data-a="salvarcfg">💾 Salvar</button><button type="button" class="fia-btn" data-a="padrao">↺ Voltar à instrução padrão</button></div>' : '');
    contar();
  }
  function contar() { const t = $('fia-instr'), c = $('fia-cont'); if (t && c) c.textContent = '(' + t.value.length + ' de 12000 letras)'; }

  /* ---------- ações ---------- */
  function msg(t, tipo) { msgTxt = t || ''; msgTipo = tipo || ''; }
  async function clique(e) {
    const b = e.target.closest && e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'aba') { aba = b.dataset.v; msg(''); await carregarConfig(); if (!info) return; if (aba === 'fila') await carregarLista(); desenhar(); return; }
    if (a === 'filtro') { filtro = b.dataset.v; desenharFila(); return; }
    if (a === 'peca') { const p = (typeof produtos !== 'undefined' ? produtos : []).find((x) => String(x.ID) === String(b.dataset.id)); escolhida = p || null; fotosEsc = (p ? fotosDaPeca(p).slice(0, 3) : []).concat(extras.map((x) => x.url)).slice(0, MAX_FOTOS); msg(''); desenharGerar(); return; }
    if (a === 'foto') { const u = b.dataset.u, i = fotosEsc.indexOf(u); if (i >= 0) fotosEsc.splice(i, 1); else if (fotosEsc.length < MAX_FOTOS) fotosEsc.push(u); else { msg('Máximo de ' + MAX_FOTOS + ' fotos por pedido.', 'erro'); } desenharGerar(); return; }
    if (a === 'enviar') return enviar();
    if (a === 'ampliar') { try { if (window.TKFotoGrande) { window.TKFotoGrande.abrir({ itens: [{ url: b.dataset.u }], indice: 0 }); return; } } catch (er) { /* abre normal */ } window.open(b.dataset.u, '_blank', 'noopener'); return; }
    if (a === 'acao') return acao(b.dataset.v, Number(b.dataset.id), b);
    if (a === 'salvarcfg') return salvarCfg();
    if (a === 'padrao') { if (!confirm('Voltar a instrução, a proporção, os modelos e o limite para o padrão?')) return; const r = await api('/fotoia/config', 'POST', { padrao: true }); if (r && r.ok) { cfg = JSON.parse(JSON.stringify(r.config)); await carregarConfig(); msg('Voltou ao padrão.', 'ok'); } else msg(erroTxt(r), 'erro'); desenhar(); return; }
  }
  function entrada(e) {
    if (e.target.id === 'fia-busca') { busca = e.target.value; const pos = e.target.selectionStart; desenharGerar(); const n = $('fia-busca'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { /* sem seleção */ } } }
    if (e.target.id === 'fia-instr') contar();
    if (e.target.id === 'fia-extra') extraTxt = e.target.value;
  }
  async function mudou(e) {
    if (e.target.id !== 'fia-arq') return;
    const arqs = Array.from(e.target.files || []); e.target.value = '';
    for (const f of arqs) {
      if (fotosEsc.length >= MAX_FOTOS) break;
      const d = await arquivoParaDataUrl(f, 1280); if (!d) { msg('Não consegui ler ' + f.name + '.', 'erro'); continue; }
      extras.push({ url: d }); fotosEsc.push(d);
    }
    desenharGerar();
  }
  function reduzir(img, max) {
    const esc2 = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * esc2)); c.height = Math.max(1, Math.round(img.height * esc2));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  }
  function arquivoParaDataUrl(file, max) {
    return new Promise((resolve) => { const o = URL.createObjectURL(file), img = new Image(); img.onerror = () => { URL.revokeObjectURL(o); resolve(null); }; img.onload = () => { try { resolve(reduzir(img, max)); } catch (e) { resolve(null); } URL.revokeObjectURL(o); }; img.src = o; });
  }
  async function urlParaDataUrl(url, max) {
    if (/^data:/.test(url)) return url;
    try { const r = await fetch(url, { mode: 'cors' }); if (!r.ok) return null; return await arquivoParaDataUrl(await r.blob(), max); } catch (e) { return null; }
  }
  async function enviar() {
    if (enviando) return;
    if (!fotosEsc.length) { msg('Toque em pelo menos 1 foto da peça.', 'erro'); desenharGerar(); return; }
    enviando = true; msg(''); desenharGerar();
    const fotos = [];
    for (const u of fotosEsc) { const d = await urlParaDataUrl(u, 1280); if (!d) { enviando = false; msg('Não consegui baixar uma das fotos para enviar. Tente outra foto ou envie do aparelho.', 'erro'); desenharGerar(); return; } fotos.push({ mime: 'image/jpeg', data: d.split(',')[1] }); }
    const extra = extraTxt || '';
    const r = await api('/fotoia/fila', 'POST', { nome: escolhida ? (escolhida.Nome || '') : 'Fotos do aparelho', produto: escolhida ? (escolhida.Codigo || escolhida.ID || '') : '', extra: extra, fotos: fotos });
    enviando = false;
    if (!r || !r.ok) { msg(erroTxt(r), 'erro'); desenharGerar(); return; }
    fotosEsc = []; extras = []; escolhida = null; extraTxt = ''; msg('Pedido na fila! Acompanhe em “Fila e resultados”.', 'ok');
    aba = 'fila'; await carregarConfig(); await carregarLista(); desenhar(); religar();
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
    const nova = { instrucao: $('fia-instr').value, formato: $('fia-formato').value, modelos: $('fia-modelos').value, modo: $('fia-modo').value, limiteDia: Number($('fia-lim').value) || 20, ligado: $('fia-lig').checked };
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
