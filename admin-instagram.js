/* ====================================================================
 * TENKiTER — admin-instagram.js (v3.6) — "PRODUTOS PARA ACEITAR" (importador do Instagram)
 *  Tudo que a loja posta no Instagram (feed, carrossel, Reel, Story) chega aqui como RASCUNHO. Você aceita, mexe nas mídias, junta, separa ou descarta.
 *  Nada entra no catálogo sem o seu aceite: "Aceitar" abre o cadastro normal já preenchido (fotos e vídeo já estão no R2), e só vira peça quando você toca em "Cadastrar peça".
 *  Só lê o Instagram (nunca posta). Fala com o Worker `tenkiter-ig` (INSTAGRAM_URL, common.js) com o login do painel; só Admin total (gerir_acessos).
 *  Rápido no celular: miniaturas preguiçosas, páginas de 20, ações com resposta na hora (descartar tem "Desfazer"), vídeo só toca quando você pede.
 * Carrega depois de admin-conexoes.js e usa o que a página já tem (getSessao, usuarioAdmin, temPermissao, abrirComHistorico_, window.tkAceitarRascunho...).
 * ==================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => escaparHtml(v);
  const GRUPOS = [['pendente', 'Pendentes'], ['sem_id', 'Sem identificação'], ['duplicado', 'Prováveis duplicados'], ['nao_produto', 'Não é produto'], ['descartado', 'Descartados']];
  let grupo = 'pendente', lista = [], mais = false, cont = {}, st = null, editando = null, ocupado = false, desfazer = null, desfazerTimer = null;

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
  function podeGerir() { try { return typeof temPermissao === 'function' && typeof usuarioAdmin !== 'undefined' && !!usuarioAdmin && !!temPermissao(usuarioAdmin, 'gerir_acessos'); } catch (e) { return false; } }

  /* ---------- estilo ---------- */
  function css() {
    if ($('ig-css')) return;
    const s = document.createElement('style'); s.id = 'ig-css';
    s.textContent = `
      #ig-faixa { margin: 0 0 12px; }
      .ig-faixa-btn { width: 100%; display: flex; align-items: center; gap: 12px; text-align: left; background: #fff; border: 2px solid var(--laranja); border-radius: 14px; padding: 12px 14px; cursor: pointer; min-height: 56px; color: #111; }
      .ig-faixa-btn b { font-size: 1rem; display: block; } .ig-faixa-btn small { color: #444; font-size: 0.8rem; }
      .ig-badge { flex: none; min-width: 34px; height: 34px; padding: 0 9px; border-radius: 999px; background: var(--laranja); color: #0d0d0d; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
      .ig-badge.zero { background: #e6e6e6; color: #444; }
      .sheet-ig { max-width: 760px; height: 94vh; max-height: 94vh; }
      .ig-abas { display: flex; gap: 6px; overflow-x: auto; margin: 0 0 8px; padding-bottom: 4px; }
      .ig-abas button { flex: none; width: auto; padding: 9px 13px; border-radius: 999px; border: 1px solid #ddd; background: #fff; color: #222; font-size: 0.82rem; font-weight: 700; cursor: pointer; min-height: 40px; }
      .ig-abas button[aria-selected="true"] { background: var(--laranja); border-color: var(--laranja); color: #0d0d0d; }
      .ig-card { border: 1px solid #e3e3e3; border-radius: 12px; background: #fff; padding: 10px; margin: 0 0 10px; }
      .ig-fotos { display: flex; gap: 4px; margin-bottom: 8px; }
      .ig-fotos .ig-th { position: relative; flex: 1 1 0; max-width: 33%; aspect-ratio: 3/4; border-radius: 8px; overflow: hidden; background: #eee; }
      .ig-th img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .ig-th .ig-mais, .ig-th .ig-play { position: absolute; right: 4px; bottom: 4px; background: rgba(0,0,0,.72); color: #fff; font-size: 0.75rem; font-weight: 700; padding: 2px 7px; border-radius: 999px; }
      .ig-meta { font-size: 0.78rem; color: #555; margin-bottom: 4px; display: flex; gap: 8px; flex-wrap: wrap; }
      .ig-leg { font-size: 0.86rem; color: #222; margin: 0 0 6px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
      .ig-sug { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
      .ig-sug span { background: #fff3e0; border: 1px solid #ffcc80; color: #6b3f00; border-radius: 8px; padding: 3px 8px; font-size: 0.8rem; font-weight: 700; }
      .ig-dup { background: #fde3e3; border: 1px solid #f5b5b5; color: #8a1c1c; border-radius: 8px; padding: 6px 9px; font-size: 0.82rem; margin-bottom: 8px; }
      .ig-acoes { display: flex; gap: 8px; flex-wrap: wrap; }
      .ig-acoes button, .ig-rodape button, .ig-edit-barra button, .ig-conectar button { width: auto; flex: none; padding: 10px 14px; border-radius: 8px; border: 0; font-size: 0.85rem; min-height: 44px; cursor: pointer; font-weight: 700; }
      .ig-ok { background: var(--laranja); color: #0d0d0d; font-weight: 800; } .ig-sec { background: #eee; color: #222; } .ig-ruim { background: #fde3e3; color: #8a1c1c; }
      .ig-rodape { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; font-size: 0.8rem; color: #444; }
      .ig-aviso { background: #fff3e0; border: 1px solid #ffcc80; color: #6b3f00; border-radius: 10px; padding: 8px 10px; font-size: 0.84rem; margin: 8px 0; }
      .ig-vazio { text-align: center; color: #555; padding: 26px 8px; font-size: 0.9rem; }
      .ig-grade { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 8px 0; }
      .ig-tile { border: 2px solid #e3e3e3; border-radius: 10px; padding: 6px; background: #fff; }
      .ig-tile.capa { border-color: var(--laranja); }
      .ig-tile .ig-th { aspect-ratio: 3/4; max-width: none; border-radius: 8px; overflow: hidden; background: #eee; position: relative; }
      .ig-tile .ig-th img, .ig-tile video { width: 100%; height: 100%; object-fit: cover; display: block; }
      .ig-tile .ig-linha { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
      .ig-tile button { width: auto; padding: 8px 10px; min-height: 40px; border-radius: 8px; border: 0; background: #eee; color: #222; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
      .ig-tile label { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; margin-top: 6px; }
      .ig-edit-barra { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
      .ig-conectar label { display: block; font-size: 0.82rem; font-weight: 700; margin: 8px 0 4px; }
      .ig-conectar input[type=password] { width: 100%; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; font-size: 0.95rem; }
      .ig-conectar ol { padding-left: 20px; font-size: 0.86rem; line-height: 1.5; }
      .ig-toast { position: sticky; bottom: 0; background: #222; color: #fff; border-radius: 10px; padding: 10px 12px; display: flex; gap: 10px; align-items: center; justify-content: space-between; font-size: 0.86rem; }
      .ig-toast button { width: auto; min-height: 40px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--laranja); color: #0d0d0d; font-weight: 800; cursor: pointer; }
      .ig-msg { min-height: 1.3em; font-size: 0.85rem; margin: 6px 0; } .ig-msg.erro { color: var(--vermelho); font-weight: 700; } .ig-msg.ok { color: #146c43; font-weight: 700; }
    `;
    document.head.appendChild(s);
  }

  /* ---------- faixa no painel ---------- */
  function desenharFaixa() {
    const f = $('ig-faixa'); if (!f || !st) return;
    css(); f.hidden = false;
    const n = (cont.pendente || 0) + (cont.sem_id || 0);
    f.innerHTML = '<button type="button" class="ig-faixa-btn" id="ig-abrir"><span class="ig-badge' + (n ? '' : ' zero') + '">' + (st.conectado ? n : '!') + '</span>' +
      '<span><b>📥 Produtos para aceitar</b><small>' + (st.conectado ? (n ? n + ' do Instagram esperando você' : 'Nada novo agora') : 'Conecte o Instagram para começar') + (st.alertas && st.alertas.length ? ' · ⚠️ atenção' : '') + '</small></span></button>';
    $('ig-abrir').addEventListener('click', abrir);
  }
  async function carregarStatus() {
    const r = await ig('/status');
    if (r && r.ok) { st = r; cont = r.contagens || {}; desenharFaixa(); }
    return r;
  }

  /* ---------- janela ---------- */
  function montar() {
    if ($('overlay-instagram')) return;
    css();
    const o = document.createElement('div'); o.className = 'overlay-sheet'; o.id = 'overlay-instagram';
    o.innerHTML = '<div class="sheet sheet-ig" role="dialog" aria-modal="true" aria-labelledby="ig-titulo"><div class="sheet-topo"><h2 class="gestao-titulo" id="ig-titulo">📥 Produtos para aceitar</h2><button type="button" class="sheet-x" id="ig-fechar" aria-label="Fechar">✕</button></div><div class="gestao-corpo" id="ig-corpo" aria-live="polite"></div></div>';
    document.body.appendChild(o);
    $('ig-fechar').addEventListener('click', fechar);
    $('ig-corpo').addEventListener('click', clique);
    window.addEventListener('popstate', () => o.classList.remove('aberto'));
  }
  function fechar() { fecharComHistorico_('overlay-instagram'); }
  async function abrir() {
    if (!podeGerir()) { alert('Esta tela é só para o Admin total.'); return; }
    montar(); abrirComHistorico_('overlay-instagram');
    $('ig-corpo').innerHTML = '<p class="ig-vazio">Carregando…</p>';
    const r = await carregarStatus();
    if (!r || !r.ok) { $('ig-corpo').innerHTML = '<p class="ig-aviso">' + esc(erroTxt(r)) + '</p>'; return; }
    if (!st.conectado) { desenharConectar(); return; }
    editando = null; await carregarLista(true);
  }

  /* ---------- lista ---------- */
  async function carregarLista(zerar) {
    if (zerar) { lista = []; mais = false; }
    const antes = !zerar && lista.length ? '&antes=' + lista[lista.length - 1].id : '';
    const r = await ig('/rascunhos?grupo=' + grupo + '&limite=20' + antes);
    if (!r || !r.ok) { $('ig-corpo').innerHTML = '<p class="ig-aviso">' + esc(erroTxt(r)) + '</p>'; return; }
    lista = lista.concat(r.rascunhos); mais = !!r.mais; cont = r.contagens || cont;
    desenharFaixa(); desenharLista();
  }
  const ORIGEM = { feed: '📷 Feed', carrossel: '🖼️ Carrossel', reel: '🎬 Reel', story: '⏱️ Story', avulsa: '📎 Avulsa' };
  function dataBr(iso) { try { const d = new Date(iso); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function miniaturas(r, max) {
    const ms = r.midias || [];
    return '<div class="ig-fotos">' + ms.slice(0, max || 3).map((m, i) => '<div class="ig-th"><img loading="lazy" decoding="async" alt="" ' + atribSrc(m.mini || m.url) + '>' + (m.tipo === 'video' ? '<span class="ig-play">▶ vídeo</span>' : '') + (i === (max || 3) - 1 && ms.length > (max || 3) ? '<span class="ig-mais">+' + (ms.length - (max || 3)) + '</span>' : '') + '</div>').join('') + '</div>';
  }
  function cartao(r) {
    const sug = [];
    if (r.precoSug) sug.push('💲 R$ ' + String(r.precoSug).replace('.', ','));
    if (r.tamanhosSug) sug.push('📏 ' + r.tamanhosSug);
    const dup = r.codigoDup ? '<div class="ig-dup">Parece já estar no catálogo: <b>' + esc(r.codigoDup) + '</b>. Confira antes de aceitar.</div>' : '';
    const nao = grupo === 'descartado' ? '<button type="button" class="ig-sec" data-ig="restaurar" data-id="' + r.id + '">↩️ Restaurar</button>'
      : '<button type="button" class="ig-ok" data-ig="aceitar" data-id="' + r.id + '">✅ Aceitar</button><button type="button" class="ig-sec" data-ig="editar" data-id="' + r.id + '">🖼️ Mídias</button><button type="button" class="ig-ruim" data-ig="descartar" data-id="' + r.id + '">🗑️ Descartar</button>' + (grupo !== 'nao_produto' ? '<button type="button" class="ig-sec" data-ig="naoproduto" data-id="' + r.id + '">🚫 Não é produto</button>' : '');
    return '<div class="ig-card" data-card="' + r.id + '">' + miniaturas(r, 3) + '<div class="ig-meta"><span>' + (ORIGEM[r.origem] || r.origem) + '</span><span>' + esc(dataBr(r.publicadoEm)) + '</span><span>' + (r.midias || []).length + ' mídia(s)</span>' + (r.permalink ? '<a href="' + esc(r.permalink) + '" target="_blank" rel="noopener" style="color:var(--laranja-txt)">ver no Instagram</a>' : '') + '</div>' +
      (r.legenda ? '<p class="ig-leg">' + esc(r.legenda) + '</p>' : '') + (sug.length ? '<div class="ig-sug">' + sug.map((x) => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') + dup + '<div class="ig-acoes">' + nao + '</div></div>';
  }
  function desenharLista() {
    const abas = '<div class="ig-abas" role="tablist">' + GRUPOS.map((g) => '<button type="button" role="tab" aria-selected="' + (g[0] === grupo) + '" data-ig="aba" data-g="' + g[0] + '">' + g[1] + (cont[g[0]] ? ' (' + cont[g[0]] + ')' : '') + '</button>').join('') + '</div>';
    const avisos = (st && st.alertas || []).map((a) => '<div class="ig-aviso">⚠️ ' + esc(a) + '</div>').join('');
    const vazio = '<p class="ig-vazio">' + (grupo === 'pendente' ? 'Nada esperando agora. 🎉 O que você postar no Instagram aparece aqui sozinho (a cada 30 minutos) ou toque em "Buscar agora".' : 'Nada por aqui.') + '</p>';
    $('ig-corpo').innerHTML = avisos + abas + (lista.length ? lista.map(cartao).join('') : vazio) + (mais ? '<div class="ig-acoes" style="justify-content:center"><button type="button" class="ig-sec" data-ig="mais" style="width:auto;padding:10px 16px;border:0;border-radius:8px;min-height:44px;font-weight:700">Carregar mais</button></div>' : '') + rodape() + toast();
  }
  function rodape() {
    const u = st && st.ultimoCiclo;
    return '<div class="ig-rodape"><span>' + (u ? 'Última busca: ' + esc(dataBr(u.fim)) + (u.erro ? ' (com erro)' : '') + ' · ' : '') + (st && st.novasDesdeOntem != null ? st.novasDesdeOntem + ' novo(s) em 24 h' : '') + '</span>' +
      '<button type="button" class="ig-sec" data-ig="buscar">🔄 Buscar agora</button><button type="button" class="ig-sec" data-ig="config">⚙️ Instagram</button></div><div class="ig-msg" id="ig-msg" role="status"></div>';
  }
  function toast() { return desfazer ? '<div class="ig-toast" id="ig-toast"><span>' + esc(desfazer.txt) + '</span><button type="button" data-ig="desfazer">Desfazer</button></div>' : ''; }
  function msg(t, tipo) { const m = $('ig-msg'); if (m) { m.textContent = t || ''; m.className = 'ig-msg' + (tipo ? ' ' + tipo : ''); } }

  /* ---------- editor de mídias ---------- */
  function desenharEditor() {
    const r = editando; if (!r) return;
    const tiles = (r.midias || []).map((m, i) => '<div class="ig-tile' + (m.capa ? ' capa' : '') + '" data-m="' + esc(m.id) + '"><div class="ig-th">' + (m.tipo === 'video' ? '<img loading="lazy" alt="" ' + atribSrc(m.mini || '') + '><button type="button" data-ig="tocar" data-url="' + esc(m.url) + '" style="position:absolute;inset:auto 6px 6px auto;min-height:36px">▶ tocar</button>' : '<img loading="lazy" alt="" ' + atribSrc(m.url) + '>') + '</div>' +
      '<div class="ig-linha"><button type="button" data-ig="sobe" data-m="' + esc(m.id) + '" ' + (i === 0 ? 'disabled' : '') + ' aria-label="Mover para antes">◀</button><button type="button" data-ig="desce" data-m="' + esc(m.id) + '" ' + (i === r.midias.length - 1 ? 'disabled' : '') + ' aria-label="Mover para depois">▶</button>' +
      (m.tipo === 'foto' && !m.capa ? '<button type="button" data-ig="capa" data-m="' + esc(m.id) + '">⭐ Capa</button>' : (m.capa ? '<span style="align-self:center;font-weight:800;font-size:.8rem">⭐ Capa</span>' : '')) + '<button type="button" data-ig="tirar" data-m="' + esc(m.id) + '">✕ Tirar</button></div>' +
      '<label><input type="checkbox" class="ig-sel" value="' + esc(m.id) + '"> escolher</label></div>').join('');
    $('ig-corpo').innerHTML = '<button type="button" class="ig-sec" data-ig="voltar" style="width:auto;padding:10px 14px;border:0;border-radius:8px;min-height:44px;font-weight:700">← Voltar à lista</button>' +
      '<div class="ig-meta" style="margin-top:8px"><span>' + (ORIGEM[r.origem] || r.origem) + '</span><span>' + esc(dataBr(r.publicadoEm)) + '</span></div>' + (r.legenda ? '<p class="ig-leg" style="-webkit-line-clamp:4">' + esc(r.legenda) + '</p>' : '') +
      '<div class="ig-grade">' + tiles + '</div><div class="ig-edit-barra"><button type="button" class="ig-sec" data-ig="separar">✂️ Separar as escolhidas em outro produto</button><button type="button" class="ig-sec" data-ig="juntar">🔗 Juntar com outro produto…</button></div>' +
      '<div class="ig-edit-barra"><button type="button" class="ig-ok" data-ig="aceitar" data-id="' + r.id + '">✅ Aceitar este produto</button><button type="button" class="ig-ruim" data-ig="descartar" data-id="' + r.id + '">🗑️ Descartar</button></div><div class="ig-msg" id="ig-msg" role="status"></div>';
  }
  async function recarregarEditor() {
    const r = await ig('/rascunhos?grupo=' + grupo + '&limite=60');
    if (!r || !r.ok) { msg(erroTxt(r), 'erro'); return; }
    lista = r.rascunhos; cont = r.contagens || cont; desenharFaixa();
    const novo = lista.find((x) => x.id === editando.id);
    if (!novo) { editando = null; desenharLista(); return; }
    editando = novo; desenharEditor();
  }
  async function agirEditor(corpo, okTxt) {
    if (ocupado) return; ocupado = true;
    const r = await ig('/acao', 'POST', Object.assign({ id: editando.id }, corpo));
    ocupado = false;
    if (!r || !r.ok) { msg(erroTxt(r), 'erro'); return; }
    if (r.contagens) cont = r.contagens;
    await recarregarEditor(); if (okTxt) msg(okTxt, 'ok');
  }
  function escolhidas() { return Array.from(document.querySelectorAll('#ig-corpo .ig-sel:checked')).map((x) => x.value); }
  async function escolherJunta() {
    const outros = lista.filter((x) => x.id !== editando.id).slice(0, 12);
    if (!outros.length) { msg('Não há outro produto na lista para juntar.', 'erro'); return; }
    $('ig-corpo').innerHTML = '<button type="button" class="ig-sec" data-ig="editar" data-id="' + editando.id + '" style="width:auto;padding:10px 14px;border:0;border-radius:8px;min-height:44px;font-weight:700">← Voltar</button><p class="ig-leg" style="-webkit-line-clamp:3;margin-top:10px"><b>Juntar este produto dentro de qual?</b> As mídias vão para o final do escolhido.</p>' +
      outros.map((x) => '<div class="ig-card">' + miniaturas(x, 3) + '<p class="ig-leg">' + esc(x.legenda || '(sem legenda)') + '</p><div class="ig-acoes"><button type="button" class="ig-ok" data-ig="juntarCom" data-para="' + x.id + '">Juntar aqui</button></div></div>').join('') + '<div class="ig-msg" id="ig-msg"></div>';
  }

  /* ---------- aceitar ---------- */
  function aceitar(id) {
    const r = lista.find((x) => String(x.id) === String(id)) || (editando && String(editando.id) === String(id) ? editando : null);
    if (!r) return;
    if (typeof window.tkAceitarRascunho !== 'function') { alert('O cadastro ainda não carregou. Tente de novo.'); return; }
    fechar();
    window.tkAceitarRascunho(r);
  }
  window.addEventListener('tk:peca-salva', async (ev) => {
    const d = ev && ev.detail; if (!d || !d.rascunhoId) return;
    await ig('/acao', 'POST', { acao: 'aceitado', id: d.rascunhoId, produtoId: d.id || d.codigo || '' });
    if (st) carregarStatus();
  });

  /* ---------- conectar ---------- */
  function desenharConectar(erro) {
    const c = st || {};
    $('ig-corpo').innerHTML = '<div class="ig-conectar">' + (c.conectado ? '<p><b>✅ Conectado' + (c.usuario ? ' como @' + esc(c.usuario) : '') + '</b>' + (c.venceEmDias != null ? ' · o acesso é renovado sozinho (vence em ' + c.venceEmDias + ' dias se algo falhar)' : '') + '.</p>' +
      '<div class="ig-edit-barra"><button type="button" class="ig-sec" data-ig="historico">📚 Importar os últimos 20 posts</button><button type="button" class="ig-ruim" data-ig="desconectar">Desconectar</button><button type="button" class="ig-sec" data-ig="voltarLista">← Voltar</button></div><hr>' : '') +
      '<h3 style="font-size:.95rem;margin:8px 0">' + (c.conectado ? 'Trocar o acesso do Instagram' : 'Conectar o Instagram') + '</h3>' +
      '<p style="font-size:.85rem">O sistema só LÊ o seu Instagram (nunca posta). Para liberar, você cria um acesso na Meta e cola o código aqui:</p>' +
      '<ol><li>No celular, abra <b>developers.facebook.com</b> → <b>Meus apps</b> → <b>Criar app</b> (tipo "Negócios") → adicione o produto <b>Instagram</b> → <b>API com login do Instagram</b>.</li><li>Em <b>Funções do app</b>, adicione a conta <b>@tenkitermodasceara</b> como testadora e aceite o convite no app do Instagram (Configurações → Apps e sites).</li><li>Em <b>Gerar tokens de acesso</b>, gere o token da conta e copie.</li><li>Cole abaixo e toque em Conectar. O código fica guardado só no servidor e nunca volta para a tela.</li></ol>' +
      '<label for="ig-token">Código de acesso (token)</label><input type="password" id="ig-token" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="ig-edit-barra"><button type="button" class="ig-ok" data-ig="conectar">Conectar</button></div>' + (erro ? '<div class="ig-msg erro">' + esc(erro) + '</div>' : '<div class="ig-msg" id="ig-msg"></div>') + '</div>';
  }

  /* ---------- cliques ---------- */
  async function clique(ev) {
    const b = ev.target.closest('[data-ig]'); if (!b) return;
    const a = b.dataset.ig, id = Number(b.dataset.id) || 0;
    if (a === 'aba') { grupo = b.dataset.g; editando = null; $('ig-corpo').innerHTML = '<p class="ig-vazio">Carregando…</p>'; await carregarLista(true); }
    else if (a === 'mais') { await carregarLista(false); }
    else if (a === 'aceitar') aceitar(id);
    else if (a === 'editar') { editando = lista.find((x) => x.id === id) || editando; if (editando) desenharEditor(); }
    else if (a === 'voltar' || a === 'voltarLista') { editando = null; await carregarLista(true); }
    else if (a === 'descartar' || a === 'naoproduto') await descartarRapido(id, a === 'naoproduto');
    else if (a === 'restaurar') { await ig('/acao', 'POST', { acao: 'restaurar', id: id }); lista = lista.filter((x) => x.id !== id); await carregarStatus(); desenharLista(); }
    else if (a === 'desfazer') await refazer();
    else if (a === 'buscar') { msg('Buscando no Instagram…'); const r = await ig('/buscar', 'POST', {}); if (r && r.ok) { msg(r.novas ? r.novas + ' novo(s) encontrado(s).' : 'Nada novo.', 'ok'); await carregarStatus(); await carregarLista(true); } else msg(erroTxt(r), 'erro'); }
    else if (a === 'config') desenharConectar();
    else if (a === 'conectar') { const t = ($('ig-token') || {}).value || ''; msg('Conferindo com o Instagram…'); const r = await ig('/token', 'POST', { token: t }); if (r && r.ok) { $('ig-token').value = ''; await carregarStatus(); grupo = 'pendente'; await carregarLista(true); } else desenharConectar(erroTxt(r)); }
    else if (a === 'desconectar') { if (confirm('Desconectar o Instagram? Os rascunhos já criados continuam aqui.')) { await ig('/token', 'DELETE'); await carregarStatus(); desenharConectar(); } }
    else if (a === 'historico') { msg('Importando…'); const r = await ig('/buscar', 'POST', { ultimos: 20 }); if (r && r.ok) { msg(r.novas + ' post(s) importado(s).', 'ok'); await carregarStatus(); } else msg(erroTxt(r), 'erro'); }
    else if (a === 'sobe') agirEditor({ acao: 'ordem', midia: b.dataset.m, delta: -1 });
    else if (a === 'desce') agirEditor({ acao: 'ordem', midia: b.dataset.m, delta: 1 });
    else if (a === 'capa') agirEditor({ acao: 'capa', midia: b.dataset.m });
    else if (a === 'tirar') agirEditor({ acao: 'removerMidia', midia: b.dataset.m }, 'A mídia foi para "Sem identificação".');
    else if (a === 'separar') { const s = escolhidas(); if (!s.length) { msg('Marque "escolher" nas mídias que vão para o outro produto.', 'erro'); return; } agirEditor({ acao: 'separar', midias: s }, 'Separado: o novo produto está na lista.'); }
    else if (a === 'juntar') escolherJunta();
    else if (a === 'juntarCom') { const r = await ig('/acao', 'POST', { acao: 'juntar', id: editando.id, para: Number(b.dataset.para) }); if (r && r.ok) { editando = null; await carregarLista(true); } else msg(erroTxt(r), 'erro'); }
    else if (a === 'tocar') { const t = b.closest('.ig-th'); const v = document.createElement('video'); v.src = b.dataset.url; v.controls = true; v.playsInline = true; v.autoplay = true; t.innerHTML = ''; t.appendChild(v); }
  }
  async function descartarRapido(id, naoProduto) {
    const r = lista.find((x) => x.id === id) || editando; if (!r) return;
    const grupoAntes = grupo;
    lista = lista.filter((x) => x.id !== id); cont[grupoAntes] = Math.max(0, (cont[grupoAntes] || 1) - 1); if (editando && editando.id === id) editando = null;
    desfazer = { id: id, txt: naoProduto ? 'Marcado como "Não é produto".' : 'Descartado.', grupoAntes: grupoAntes };
    desenharLista(); desenharFaixa();
    clearTimeout(desfazerTimer); desfazerTimer = setTimeout(() => { desfazer = null; if ($('ig-toast')) $('ig-toast').remove(); }, 8000);
    const resp = await ig('/acao', 'POST', naoProduto ? { acao: 'grupo', id: id, grupo: 'nao_produto' } : { acao: 'descartar', id: id });
    if (!resp || !resp.ok) { desfazer = null; msg(erroTxt(resp), 'erro'); await carregarLista(true); }
  }
  async function refazer() {
    const d = desfazer; if (!d) return; desfazer = null; clearTimeout(desfazerTimer);
    await ig('/acao', 'POST', d.grupoAntes === 'descartado' ? { acao: 'restaurar', id: d.id } : { acao: 'grupo', id: d.id, grupo: d.grupoAntes });
    await carregarStatus(); await carregarLista(true);
  }

  /* ---------- liga ---------- */
  (function init() {
    if (!$('ig-faixa')) return;
    let t = 0;
    const espera = setInterval(async () => {
      t++;
      if (t > 40) { clearInterval(espera); return; }
      if (typeof usuarioAdmin === 'undefined' || !usuarioAdmin) return;
      clearInterval(espera);
      if (!podeGerir() || !sessao()) return;       // só Admin total, com login (não vale o PIN antigo)
      carregarStatus();                             // erro de rede: a faixa simplesmente não aparece
    }, 500);
  })();
})();
