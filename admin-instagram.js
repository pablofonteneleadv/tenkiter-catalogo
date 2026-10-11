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
  const GRUPOS = [['pendente', 'Pendentes'], ['duplicado', 'Prováveis duplicados'], ['nao_produto', 'Não é produto'], ['descartado', 'Descartados']];
  let grupo = 'pendente', lista = [], mais = false, cont = {}, st = null, editando = null, ocupado = false, desfazer = null, desfazerTimer = null;
  const LIM_FOTOS = 8, LIM_VIDEOS = 1;   // o cadastro da peça aceita no máximo 8 fotos e 1 vídeo
  let escolha = null;                    // tela de escolha quando juntar passa dos limites: { ordem, itens, sel:Set }
  const marcados = new Set();            // posts marcados com a caixinha para "Juntar"
  let iaRodando = false, iaTxt = '', tela = '';      // tela: 'lista' | 'editor' | 'conectar' (a leitura por IA só redesenha a lista)

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
      .ig-juntar-barra { position: sticky; top: 0; z-index: 2; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; background: #fff; border: 1px solid #e3e3e3; border-radius: 10px; padding: 8px 10px; margin: 0 0 8px; font-size: 0.84rem; }
      .ig-juntar-barra button { width: auto; flex: none; padding: 0 14px; min-height: 44px; border-radius: 8px; border: 0; font-weight: 800; cursor: pointer; } .ig-juntar-barra button:disabled { opacity: .45; cursor: default; }
      .ig-selcard { display: flex; align-items: center; gap: 8px; font-size: 0.86rem; font-weight: 700; margin: 0 0 8px; min-height: 40px; } .ig-selcard input { width: 22px; height: 22px; }
      .ig-ia { background: #f1ecff; border: 1px solid #d8ccff; color: #3b1f8c; border-radius: 10px; padding: 7px 10px; font-size: 0.82rem; margin: 0 0 8px; }
      .ig-iaok { background: #e9f7ee; border: 1px solid #b5e0c4; color: #14532d; border-radius: 8px; padding: 5px 8px; font-size: 0.8rem; margin-bottom: 8px; overflow-wrap: anywhere; }
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
    else desenharFaixaOff(r);
    return r;
  }
  /* O motor (Worker) ainda não foi publicado ou está fora do ar: a faixa APARECE do mesmo jeito, dizendo o que falta (nunca some em silêncio). */
  function desenharFaixaOff(r) {
    const f = $('ig-faixa'); if (!f) return;
    css(); f.hidden = false;
    const motivo = r && r.semRede ? 'Sem conexão agora.' : (r && r.erro && !/Não encontrado/.test(r.erro) ? r.erro : 'O importador ainda não foi ativado no servidor (falta publicar o Worker na Cloudflare).');
    f.innerHTML = '<div class="ig-faixa-btn" style="cursor:default"><span class="ig-badge zero">!</span><span><b>📥 Produtos para aceitar</b><small>' + esc(motivo) + '</small></span></div>';
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
    $('ig-corpo').addEventListener('change', (ev) => {
      const esco = ev.target.closest && ev.target.closest('.ig-esc');
      if (esco && escolha) {   // tela "o que fica ao juntar": respeita 8 fotos e 1 vídeo
        const m = escolha.itens.find((x) => String(x.id) === String(esco.value)); if (!m) return;
        if (esco.checked) {
          const c = contagemEscolha(), ehV = m.tipo === 'video';
          if ((ehV && c.v >= LIM_VIDEOS) || (!ehV && c.f >= LIM_FOTOS)) { esco.checked = false; msg(ehV ? 'Só cabe ' + LIM_VIDEOS + ' vídeo: desmarque o outro antes.' : 'Só cabem ' + LIM_FOTOS + ' fotos: desmarque uma antes.', 'erro'); return; }
          escolha.sel.add(m.id);
        } else escolha.sel.delete(m.id);
        const y = $('ig-corpo').scrollTop; desenharEscolha(); $('ig-corpo').scrollTop = y; return;
      }
      const c = ev.target.closest && ev.target.closest('.ig-selr'); if (!c) return;
      const id = Number(c.value); if (c.checked) marcados.add(id); else marcados.delete(id);
      const y = $('ig-corpo').scrollTop; desenharLista(); $('ig-corpo').scrollTop = y;
    });
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
    editando = null; await carregarLista(true); rodarIA();
  }

  /* ---------- lista ---------- */
  async function carregarLista(zerar) {
    if (zerar) { lista = []; mais = false; }
    const antes = !zerar && lista.length ? '&antes=' + lista[lista.length - 1].id : '';
    const r = await ig('/rascunhos?grupo=' + grupo + '&limite=20' + antes);
    if (!r || !r.ok) { $('ig-corpo').innerHTML = '<p class="ig-aviso">' + esc(erroTxt(r)) + '</p>'; return; }
    lista = lista.concat(r.rascunhos); mais = !!r.mais; cont = r.contagens || cont;
    desenharFaixa(); desenharLista();
    rodarIA();
  }
  const ORIGEM = { feed: '📷 Feed', carrossel: '🖼️ Carrossel', reel: '🎬 Reel', story: '⏱️ Story', avulsa: '📎 Avulsa' };
  function dataBr(iso) { try { const d = new Date(iso); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function miniaturas(r, max) {
    const ms = r.midias || [];
    return '<div class="ig-fotos">' + ms.slice(0, max || 3).map((m, i) => '<div class="ig-th"><img loading="lazy" decoding="async" alt="" ' + atribSrc(m.mini || m.url) + '>' + (m.tipo === 'video' ? '<span class="ig-play">▶ vídeo</span>' : '') + (i === (max || 3) - 1 && ms.length > (max || 3) ? '<span class="ig-mais">+' + (ms.length - (max || 3)) + '</span>' : '') + '</div>').join('') + '</div>';
  }
  function cartao(r) {
    const sug = [];
    if (r.precoSug) sug.push(r.precoFoto ? '💲 Escrito R$ ' + String(r.precoFoto).replace('.', ',') + ' à vista → catálogo R$ ' + String(r.precoSug).replace('.', ',') : '💲 Catálogo R$ ' + String(r.precoSug).replace('.', ','));
    if (r.tamanhosSug) sug.push('📏 ' + r.tamanhosSug);
    const dup = r.codigoDup ? '<div class="ig-dup">Parece já estar no catálogo: <b>' + esc(r.codigoDup) + '</b>. Confira antes de aceitar.</div>' : '';
    const nao = grupo === 'descartado' ? '<button type="button" class="ig-sec" data-ig="restaurar" data-id="' + r.id + '">↩️ Restaurar</button>'
      : '<button type="button" class="ig-ok" data-ig="aceitar" data-id="' + r.id + '">✅ Aceitar</button><button type="button" class="ig-sec" data-ig="editar" data-id="' + r.id + '">🖼️ Mídias</button><button type="button" class="ig-ruim" data-ig="descartar" data-id="' + r.id + '">🗑️ Descartar</button>' + (grupo !== 'nao_produto' ? '<button type="button" class="ig-sec" data-ig="naoproduto" data-id="' + r.id + '">🚫 Não é produto</button>' : '');
    const ia = r.ia || null;
    const iaLinha = ia ? '<div class="ig-iaok">🤖 <b>' + esc(ia.nome || 'Sem nome') + '</b>' + (ia.categorias && ia.categorias.length ? ' · ' + esc(ia.categorias.join(', ')) : '') + (ia.generos && ia.generos.length ? ' · ' + esc(ia.generos.join(', ')) : '') + (ia.cores && ia.cores.length ? ' · ' + esc(ia.cores.join(', ')) : '') +
      ''+ (ia.produto === false ? '<br>🤔 A IA acha que isso não é uma peça à venda.' : '') + '</div>'
      : (r.iaStatus === 'erro' ? '<div class="ig-ia">🤖 A IA não conseguiu ler as fotos deste post (você pode aceitar e preencher na mão).</div>' : '');
    const caixa = (grupo !== 'descartado') ? '<label class="ig-selcard"><input type="checkbox" class="ig-selr" value="' + r.id + '"' + (marcados.has(r.id) ? ' checked' : '') + '> Marcar para juntar</label>' : '';
    return '<div class="ig-card" data-card="' + r.id + '">' + caixa + miniaturas(r, 3) + '<div class="ig-meta"><span>' + (ORIGEM[r.origem] || r.origem) + '</span><span>' + esc(dataBr(r.publicadoEm)) + '</span><span>' + (r.midias || []).length + ' mídia(s)</span>' + (r.permalink ? '<a href="' + esc(r.permalink) + '" target="_blank" rel="noopener" style="color:var(--laranja-txt)">ver no Instagram</a>' : '') + '</div>' +
      (r.legenda ? '<p class="ig-leg">' + esc(r.legenda) + '</p>' : '') + iaLinha + (sug.length ? '<div class="ig-sug">' + sug.map((x) => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') + dup + '<div class="ig-acoes">' + nao + '</div></div>';
  }
  function desenharLista() {
    tela = 'lista';
    const abas = '<div class="ig-abas" role="tablist">' + GRUPOS.map((g) => { const n = g[0] === 'pendente' ? (cont.pendente || 0) + (cont.sem_id || 0) : cont[g[0]]; return '<button type="button" role="tab" aria-selected="' + (g[0] === grupo) + '" data-ig="aba" data-g="' + g[0] + '">' + g[1] + (n ? ' (' + n + ')' : '') + '</button>'; }).join('') + '</div>';
    const avisos = (st && st.alertas || []).map((a) => '<div class="ig-aviso">⚠️ ' + esc(a) + '</div>').join('');
    const vazio = '<p class="ig-vazio">' + (grupo === 'pendente' ? 'Nada esperando agora. 🎉 O que você postar no Instagram aparece aqui sozinho (a cada 30 minutos) ou toque em "Buscar agora".' : 'Nada por aqui.') + '</p>';
    const ids = lista.map((x) => x.id); marcados.forEach((id) => { if (ids.indexOf(id) === -1) marcados.delete(id); });
    const barra = (grupo !== 'descartado' && lista.length > 1) ? '<div class="ig-juntar-barra"><button type="button" class="ig-ok" data-ig="juntarMarcados"' + (marcados.size < 2 ? ' disabled' : '') + '>🔗 Juntar ' + (marcados.size >= 2 ? marcados.size + ' posts em 1 produto' : 'em 1 produto') + '</button>' +
      '<button type="button" class="ig-ok" data-ig="separadoMarcados"' + (marcados.size < 2 ? ' disabled' : '') + '>🧩 Cadastrar separado' + (marcados.size >= 2 ? ' (' + marcados.size + ')' : '') + '</button>' +
      (marcados.size ? '<button type="button" class="ig-sec" data-ig="limparMarcados">Limpar</button>' : '') + '<span>' + (marcados.size ? marcados.size + ' marcado(s)' : 'Marque os posts (caixinha em cada um). Juntar = 1 produto só (máx. ' + LIM_FOTOS + ' fotos e ' + LIM_VIDEOS + ' vídeo). Cadastrar separado = 1 produto por post, com as mesmas informações.') + '</span></div>' : '';
    const iaBox = '<div class="ig-ia" id="ig-ia" role="status"' + (iaTxt ? '' : ' hidden') + '>' + esc(iaTxt) + '</div>';
    $('ig-corpo').innerHTML = avisos + iaBox + abas + barra + (lista.length ? lista.map(cartao).join('') : vazio) + (mais ? '<div class="ig-acoes" style="justify-content:center"><button type="button" class="ig-sec" data-ig="mais" style="width:auto;padding:10px 16px;border:0;border-radius:8px;min-height:44px;font-weight:700">Carregar mais</button></div>' : '') + rodape() + toast();
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
    tela = 'editor';
    const tiles = (r.midias || []).map((m, i) => '<div class="ig-tile' + (m.capa ? ' capa' : '') + '" data-m="' + esc(m.id) + '"><div class="ig-th">' + (m.tipo === 'video' ? '<img loading="lazy" alt="" ' + atribSrc(m.mini || '') + '><button type="button" data-ig="tocar" data-url="' + esc(m.url) + '" style="position:absolute;inset:auto 6px 6px auto;min-height:36px">▶ tocar</button>' : '<img loading="lazy" alt="" ' + atribSrc(m.url) + '>') + '</div>' +
      '<div class="ig-linha"><button type="button" data-ig="sobe" data-m="' + esc(m.id) + '" ' + (i === 0 ? 'disabled' : '') + ' aria-label="Mover para antes">◀</button><button type="button" data-ig="desce" data-m="' + esc(m.id) + '" ' + (i === r.midias.length - 1 ? 'disabled' : '') + ' aria-label="Mover para depois">▶</button>' +
      (m.tipo === 'foto' && !m.capa ? '<button type="button" data-ig="capa" data-m="' + esc(m.id) + '">⭐ Capa</button>' : (m.capa ? '<span style="align-self:center;font-weight:800;font-size:.8rem">⭐ Capa</span>' : '')) + '<button type="button" data-ig="tirar" data-m="' + esc(m.id) + '">✕ Tirar</button></div>' +
      '<label><input type="checkbox" class="ig-sel" value="' + esc(m.id) + '"> escolher</label></div>').join('');
    $('ig-corpo').innerHTML = '<button type="button" class="ig-sec" data-ig="voltar" style="width:auto;padding:10px 14px;border:0;border-radius:8px;min-height:44px;font-weight:700">← Voltar à lista</button>' +
      '<div class="ig-meta" style="margin-top:8px"><span>' + (ORIGEM[r.origem] || r.origem) + '</span><span>' + esc(dataBr(r.publicadoEm)) + '</span></div>' + (r.legenda ? '<p class="ig-leg" style="-webkit-line-clamp:4">' + esc(r.legenda) + '</p>' : '') +
      '<div class="ig-grade">' + tiles + '</div><div class="ig-edit-barra"><button type="button" class="ig-sec" data-ig="separar">✂️ Separar as escolhidas em outro produto</button><button type="button" class="ig-sec" data-ig="juntar">🔗 Juntar com outro produto…</button>' + (st && st.ia && st.ia.ligada ? '<button type="button" class="ig-sec" data-ig="lerIA" data-id="' + r.id + '">🤖 Ler as fotos de novo</button>' : '') + '</div>' +
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
    tela = 'conectar';
    const c = st || {};
    $('ig-corpo').innerHTML = '<div class="ig-conectar">' + (c.conectado ? '<p><b>✅ Conectado' + (c.usuario ? ' como @' + esc(c.usuario) : '') + '</b>' + (c.venceEmDias != null ? ' · o acesso é renovado sozinho (vence em ' + c.venceEmDias + ' dias se algo falhar)' : '') + '.</p>' +
      '<div class="ig-edit-barra"><button type="button" class="ig-sec" data-ig="historico">📚 Importar os últimos 20 posts</button><button type="button" class="ig-sec" data-ig="todos" id="ig-btn-todos">' + rotuloTodos(c) + '</button><button type="button" class="ig-ruim" data-ig="desconectar">Desconectar</button><button type="button" class="ig-sec" data-ig="voltarLista">← Voltar</button></div><hr>' + '<h3 style="font-size:.95rem;margin:8px 0 6px">🤖 Leitura das fotos por IA</h3>' + (c.ia && c.ia.ligada ? '<p style="font-size:.86rem">✅ <b>Ligada</b> (chave terminada em ' + esc(c.ia.fim || '') + '). Cada post novo é lido sozinho: nome, preço escrito na foto, categoria e cores já vêm preenchidos quando você aceita.</p><div class="ig-edit-barra"><button type="button" class="ig-ruim" data-ig="iaDesligar">Desligar a IA</button></div>' :
        '<p style="font-size:.86rem">Para os posts chegarem já com nome, preço, categoria e cores, cole uma chave do Google (Gemini). No celular: abra <b>aistudio.google.com/apikey</b> → <b>Criar chave de API</b> → copie e cole aqui. Ela fica guardada só no servidor e nunca volta para a tela.</p><label for="ig-ia-chave">Chave da IA (Gemini)</label><input type="password" id="ig-ia-chave" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="ig-edit-barra"><button type="button" class="ig-ok" data-ig="iaLigar">Ligar a IA</button></div>') : '') +
      '<h3 style="font-size:.95rem;margin:8px 0">' + (c.conectado ? 'Trocar o acesso do Instagram' : 'Conectar o Instagram') + '</h3>' +
      '<p style="font-size:.85rem">O sistema só LÊ o seu Instagram (nunca posta). Para liberar, você cria um acesso na Meta e cola o código aqui:</p>' +
      '<ol><li>No celular, abra <b>developers.facebook.com</b> → <b>Meus apps</b> → <b>Criar app</b> (tipo "Negócios") → adicione o produto <b>Instagram</b> → <b>API com login do Instagram</b>.</li><li>Em <b>Funções do app</b>, adicione a conta <b>@tenkitermodasceara</b> como testadora e aceite o convite no app do Instagram (Configurações → Apps e sites).</li><li>Em <b>Gerar tokens de acesso</b>, gere o token da conta e copie.</li><li>Cole abaixo e toque em Conectar. O código fica guardado só no servidor e nunca volta para a tela.</li></ol>' +
      '<label for="ig-token">Código de acesso (token)</label><input type="password" id="ig-token" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="ig-edit-barra"><button type="button" class="ig-ok" data-ig="conectar">Conectar</button></div>' + (erro ? '<div class="ig-msg erro">' + esc(erro) + '</div>' : '<div class="ig-msg" id="ig-msg"></div>') + '</div>';
  }

  /* ---------- importar TODOS os posts (em lotes; o servidor guarda onde parou) ---------- */
  let paraTodos = false, rodandoTodos = false;
  function rotuloTodos(c) { const h = (c && c.historico) || {}; return '📦 Importar TODOS os posts' + (h.completo ? ' (já feito · refazer)' : h.emAndamento ? ' (continuar de onde parou)' : ''); }
  async function importarTodos(refazer) {
    if (rodandoTodos) return;
    const aviso = 'Importar TODOS os posts do Instagram?\n\n• Cada post vira um rascunho em "Produtos para aceitar" (nada vai para a loja sem você aceitar).\n• As fotos e vídeos são copiados para o armazenamento da loja (grátis; o sistema para sozinho antes de gerar cobrança).\n• Pode levar vários minutos. Deixe esta tela aberta — se fechar ou der erro, é só tocar de novo que continua de onde parou.';
    if (!confirm(aviso)) return;
    rodandoTodos = true; paraTodos = false;
    const barra = document.querySelector('.ig-conectar .ig-edit-barra');
    const btn = $('ig-btn-todos'); if (btn) btn.disabled = true;
    if (barra && !$('ig-btn-parar')) { const p = document.createElement('button'); p.type = 'button'; p.className = 'ig-ruim'; p.id = 'ig-btn-parar'; p.dataset.ig = 'parar'; p.textContent = '⏹ Parar'; barra.appendChild(p); }
    let total = 0, puladas = 0, recomecar = !!refazer, falhasRede = 0, terminou = false, erroFinal = '';
    while (!paraTodos) {
      msg('Importando… ' + total + ' post(s) copiados até agora' + (puladas ? ' · ' + puladas + ' pulado(s)' : '') + '.');
      const r = await ig('/buscar', 'POST', recomecar ? { todos: true, recomecar: true } : { todos: true });
      recomecar = false;
      if (r && r.ok) {
        if (typeof r.fim !== 'boolean') { erroFinal = 'o servidor do importador ainda é a versão antiga (falta publicar a atualização do Worker na Cloudflare)'; break; }
        falhasRede = 0; total += r.novas || 0; puladas += r.puladas || 0;
        if (r.fim) { terminou = true; break; }
      } else {
        const t = erroTxt(r);
        if (/em andamento/i.test(t) && falhasRede < 5) { falhasRede++; await new Promise((ok) => setTimeout(ok, 4000)); continue; }
        if (r && r.semRede && falhasRede < 3) { falhasRede++; await new Promise((ok) => setTimeout(ok, 3000)); continue; }
        erroFinal = t; break;
      }
    }
    rodandoTodos = false;
    const pb = $('ig-btn-parar'); if (pb) pb.remove();
    await carregarStatus();
    if (btn) { btn.disabled = false; btn.textContent = rotuloTodos(st); }
    rodarIA();
    if (terminou) msg('✅ Pronto! Todos os posts foram importados: ' + total + ' novo(s)' + (puladas ? ' (' + puladas + ' pulado(s) por falha na mídia)' : '') + '. Veja em "Produtos para aceitar".', 'ok');
    else if (erroFinal) msg('Parei: ' + erroFinal + ' (' + total + ' copiados). Toque em "Importar TODOS" para continuar de onde parou.', 'erro');
    else msg('Parado. ' + total + ' post(s) copiados. Toque em "Importar TODOS" para continuar de onde parou.', 'ok');
  }

  /* ---------- juntar vários posts em 1 produto ---------- */
  function midiasDe(ordem) { const o = []; ordem.forEach((r) => (r.midias || []).forEach((m) => o.push({ id: m.id, tipo: m.tipo, mini: m.mini || m.url, url: m.url, de: r.id }))); return o; }
  async function juntarMarcados() {
    if (ocupado) return;
    const ordem = lista.filter((x) => marcados.has(x.id)); if (ordem.length < 2) { msg('Marque 2 ou mais posts.', 'erro'); return; }
    await iniciarJuncao(ordem);
  }
  /** Se as mídias juntas cabem (8 fotos e 1 vídeo), junta direto; se passam, abre a tela para a pessoa ESCOLHER o que fica. */
  async function iniciarJuncao(ordem) {
    const itens = midiasDe(ordem), fotos = itens.filter((m) => m.tipo !== 'video'), vids = itens.filter((m) => m.tipo === 'video');
    if (fotos.length <= LIM_FOTOS && vids.length <= LIM_VIDEOS) {
      if (!confirm('Juntar ' + ordem.length + ' posts em UM produto só?\n\n• ' + fotos.length + ' foto(s)' + (vids.length ? ' e ' + vids.length + ' vídeo' : '') + ' ficam juntos (a capa é a do primeiro da lista).\n• Os outros ' + (ordem.length - 1) + ' post(s) saem desta lista (ficam em "Descartados").')) return;
      await executarJuncao(ordem, null); return;
    }
    const sel = new Set(fotos.slice(0, LIM_FOTOS).map((m) => m.id).concat(vids.slice(0, LIM_VIDEOS).map((m) => m.id)));
    escolha = { ordem: ordem, itens: itens, sel: sel }; desenharEscolha();
  }
  function contagemEscolha() { const f = escolha.itens.filter((m) => m.tipo !== 'video' && escolha.sel.has(m.id)).length, v = escolha.itens.filter((m) => m.tipo === 'video' && escolha.sel.has(m.id)).length; return { f, v }; }
  function desenharEscolha() {
    tela = 'escolha';
    const e = escolha, c = contagemEscolha();
    const totF = e.itens.filter((m) => m.tipo !== 'video').length, totV = e.itens.length - totF;
    const tiles = e.itens.map((m, i) => '<div class="ig-tile' + (e.sel.has(m.id) ? ' capa' : '') + '"><div class="ig-th"><img loading="lazy" alt="" ' + atribSrc(m.mini) + '>' + (m.tipo === 'video' ? '<span class="ig-play">▶ vídeo</span>' : '') + '</div>' +
      '<label class="ig-linha" style="align-items:center"><input type="checkbox" class="ig-esc" value="' + esc(m.id) + '"' + (e.sel.has(m.id) ? ' checked' : '') + '> <span>' + (e.sel.has(m.id) ? 'Fica' : 'Não fica') + ' · post ' + (e.ordem.findIndex((r) => r.id === m.de) + 1) + '</span></label></div>').join('');
    $('ig-corpo').innerHTML = '<button type="button" class="ig-sec" data-ig="voltarEscolha" style="width:auto;padding:10px 14px;border:0;border-radius:8px;min-height:44px;font-weight:700">← Voltar</button>' +
      '<p class="ig-leg" style="-webkit-line-clamp:6;margin-top:10px"><b>Os ' + e.ordem.length + ' posts juntos têm ' + totF + ' foto(s)' + (totV ? ' e ' + totV + ' vídeo(s)' : '') + '.</b> O produto aceita no máximo ' + LIM_FOTOS + ' fotos e ' + LIM_VIDEOS + ' vídeo. Marque o que FICA; o resto vai para "Pendentes" como mídia solta (nada se perde).</p>' +
      '<div class="ig-sug"><span id="ig-esc-cont">Fotos ' + c.f + '/' + LIM_FOTOS + ' · Vídeo ' + c.v + '/' + LIM_VIDEOS + '</span></div><div class="ig-grade">' + tiles + '</div>' +
      '<div class="ig-edit-barra"><button type="button" class="ig-ok" data-ig="juntarEscolhidas"' + (c.f < 1 ? ' disabled' : '') + '>🔗 Juntar com as escolhidas</button></div><div class="ig-msg" id="ig-msg" role="status"></div>';
  }
  async function executarJuncao(ordem, manter) {
    if (ocupado) return;
    const destino = ordem[0], outros = ordem.slice(1);
    ocupado = true; let feitos = 0, erro = '', fora = 0;
    for (const o of outros) {
      msg('Juntando… ' + (feitos + 1) + ' de ' + outros.length);
      const r = await ig('/acao', 'POST', { acao: 'juntar', id: o.id, para: destino.id });
      if (r && r.ok) feitos++; else { erro = erroTxt(r); break; }
    }
    if (!erro && manter) {   // o que passou do limite sai do produto (vira mídia solta em "Pendentes")
      const sobrando = midiasDe(ordem).filter((m) => !manter.has(m.id));
      for (const m of sobrando) { const r = await ig('/acao', 'POST', { acao: 'removerMidia', id: destino.id, midia: m.id }); if (r && r.ok) fora++; else { erro = erroTxt(r); break; } }
    }
    ocupado = false; marcados.clear(); escolha = null;
    await carregarStatus(); await carregarLista(true);
    msg(erro ? 'Juntei ' + feitos + ' e parei: ' + erro : '✅ Pronto: ' + (feitos + 1) + ' posts viraram 1 produto' + (fora ? ' (' + fora + ' mídia(s) que passavam do limite foram para "Pendentes")' : '') + '.', erro ? 'erro' : 'ok');
    rodarIA();
  }
  /** "Cadastrar separado": cada post vira um produto, todos com as mesmas informações preenchidas no formulário. */
  async function separadoMarcados() {
    if (ocupado) return;
    const ordem = lista.filter((x) => marcados.has(x.id)); if (ordem.length < 2) { msg('Marque 2 ou mais posts.', 'erro'); return; }
    const semFoto = ordem.filter((r) => !(r.midias || []).some((m) => m.tipo !== 'video'));
    if (semFoto.length) { msg(semFoto.length + ' dos posts marcados só tem vídeo (sem foto). Desmarque-os ou junte com outro post que tenha foto.', 'erro'); return; }
    if (typeof window.tkAceitarSeparado !== 'function') { alert('O cadastro ainda não carregou. Tente de novo.'); return; }
    if (!confirm('Cadastrar ' + ordem.length + ' posts como ' + ordem.length + ' produtos SEPARADOS?\n\nVocê preenche o cadastro UMA vez (começa com o post mais recente da lista marcada). Ao cadastrar, cada post vira um produto diferente, todos com as mesmas informações (nome, categoria, gênero, preço, cores…), cada um com as fotos do seu post.')) return;
    marcados.clear(); fechar(); window.tkAceitarSeparado(ordem);
  }

  /* ---------- IA: lê as fotos dos posts que ainda não foram lidos (o Worker também faz isso sozinho a cada 30 min) ---------- */
  async function rodarIA() {
    if (iaRodando || !st || !st.conectado || !st.ia || !st.ia.ligada) return;
    if (!(st.ia.pendentes > 0)) return;
    iaRodando = true; let seguidasSemProgresso = 0;
    try {
      while (st && st.ia && st.ia.pendentes > 0 && $('overlay-instagram') && $('overlay-instagram').classList.contains('aberto')) {
        iaTxt = '🤖 Lendo as fotos com IA… faltam ' + st.ia.pendentes + ' post(s). Pode continuar mexendo.'; const el = $('ig-ia'); if (el) { el.hidden = false; el.textContent = iaTxt; }
        const r = await ig('/ia', 'POST', { limite: 2 });
        if (!r || !r.ok) { iaTxt = '🤖 A leitura por IA parou: ' + erroTxt(r); break; }
        if (r.restantes != null) st.ia.pendentes = r.restantes;
        if (r.espera) { iaTxt = '🤖 A IA pediu um tempinho (limite de uso). Continuo já já…'; const e2 = $('ig-ia'); if (e2) e2.textContent = iaTxt; await new Promise((ok) => setTimeout(ok, 20000)); continue; }
        if (!r.feitas) { seguidasSemProgresso++; if (seguidasSemProgresso >= 3) { iaTxt = '🤖 A IA não conseguiu ler alguns posts (' + (r.erro || 'erro') + '). Você pode aceitá-los e preencher na mão.'; break; } } else seguidasSemProgresso = 0;
        if (tela === 'lista' && !editando && !ocupado) { const x = $('ig-corpo').scrollTop; const rr = await ig('/rascunhos?grupo=' + grupo + '&limite=' + Math.max(20, lista.length)); if (rr && rr.ok && tela === 'lista' && !editando) { lista = rr.rascunhos; mais = !!rr.mais; desenharLista(); $('ig-corpo').scrollTop = x; } }
      }
      if (st && st.ia && !(st.ia.pendentes > 0)) iaTxt = '';
    } finally { iaRodando = false; const e3 = $('ig-ia'); if (e3) { e3.textContent = iaTxt; e3.hidden = !iaTxt; } }
  }

  /* ---------- cliques ---------- */
  /** Toque numa miniatura (lista ou editor) = foto grande e nítida, com ‹ › e, no editor, "Usar como capa". */
  function abrirGrande(ev) {
    const im = ev.target.closest && ev.target.closest('.ig-th img'); if (!im || ev.target.closest('[data-ig]')) return false;
    const tile = im.closest('.ig-tile'), card = im.closest('.ig-card');
    const r = tile ? editando : (card ? lista.find((x) => x.id === Number(card.dataset.card)) : null); if (!r || !window.TKFotoGrande) return false;
    const ms = (r.midias || []).filter((m) => m.url);
    const alvo = tile ? tile.dataset.m : null;
    let i = tile ? ms.findIndex((m) => m.id === alvo) : Array.prototype.indexOf.call(card.querySelectorAll('.ig-th'), im.closest('.ig-th'));
    window.TKFotoGrande.abrir({
      itens: ms.map((m) => ({ url: m.url, tipo: m.tipo === 'video' ? 'video' : 'foto', poster: m.mini || '' })), indice: Math.max(0, i),
      capa: tile ? (k) => !!(editando && (editando.midias || []).filter((m) => m.url)[k] && (editando.midias || []).filter((m) => m.url)[k].capa) : null,
      aoCapa: tile ? (k) => { const m = ms[k]; if (m) { ms.forEach((x) => { x.capa = (x === m); }); agirEditor({ acao: 'capa', midia: m.id }); } } : null
    });
    return true;
  }
  async function clique(ev) {
    if (abrirGrande(ev)) return;
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
    else if (a === 'buscar') { msg('Buscando no Instagram…'); const r = await ig('/buscar', 'POST', {}); if (r && r.ok) { msg(r.novas ? r.novas + ' novo(s) encontrado(s).' : 'Nada novo.', 'ok'); await carregarStatus(); await carregarLista(true); rodarIA(); } else msg(erroTxt(r), 'erro'); }
    else if (a === 'juntarMarcados') await juntarMarcados();
    else if (a === 'separadoMarcados') await separadoMarcados();
    else if (a === 'voltarEscolha') { escolha = null; desenharLista(); }
    else if (a === 'juntarEscolhidas') { if (escolha) { const manter = new Set(escolha.sel); if (confirm('Juntar com ' + contagemEscolha().f + ' foto(s) e ' + contagemEscolha().v + ' vídeo(s)?\n\nO que ficou de fora vai para "Pendentes" como mídia solta.')) await executarJuncao(escolha.ordem, manter); } }
    else if (a === 'limparMarcados') { marcados.clear(); desenharLista(); }
    else if (a === 'iaLigar') { const k = ($('ig-ia-chave') || {}).value || ''; msg('Conferindo a chave com o Google…'); const r = await ig('/ia-chave', 'POST', { chave: k }); if (r && r.ok) { $('ig-ia-chave').value = ''; await carregarStatus(); desenharConectar(); msg('✅ IA ligada. Os posts pendentes vão sendo lidos.', 'ok'); rodarIA(); } else msg(erroTxt(r), 'erro'); }
    else if (a === 'iaDesligar') { if (confirm('Desligar a leitura por IA? Os posts continuam chegando, só sem o preenchimento automático.')) { await ig('/ia-chave', 'DELETE'); await carregarStatus(); desenharConectar(); } }
    else if (a === 'lerIA') { msg('Lendo as fotos…'); const r = await ig('/acao', 'POST', { acao: 'lerIA', id }); if (r && r.ok) { await recarregarEditor(); msg('✅ Fotos lidas de novo.', 'ok'); } else msg(erroTxt(r), 'erro'); }
    else if (a === 'config') desenharConectar();
    else if (a === 'conectar') { const t = ($('ig-token') || {}).value || ''; msg('Conferindo com o Instagram…'); const r = await ig('/token', 'POST', { token: t }); if (r && r.ok) { $('ig-token').value = ''; await carregarStatus(); grupo = 'pendente'; await carregarLista(true); } else desenharConectar(erroTxt(r)); }
    else if (a === 'desconectar') { if (confirm('Desconectar o Instagram? Os rascunhos já criados continuam aqui.')) { await ig('/token', 'DELETE'); await carregarStatus(); desenharConectar(); } }
    else if (a === 'historico') { msg('Importando…'); const r = await ig('/buscar', 'POST', { ultimos: 20 }); if (r && r.ok) { msg(r.novas + ' post(s) importado(s).', 'ok'); await carregarStatus(); } else msg(erroTxt(r), 'erro'); }
    else if (a === 'todos') await importarTodos(!!(st && st.historico && st.historico.completo));
    else if (a === 'parar') { paraTodos = true; msg('Parando depois deste lote…'); }
    else if (a === 'sobe') agirEditor({ acao: 'ordem', midia: b.dataset.m, delta: -1 });
    else if (a === 'desce') agirEditor({ acao: 'ordem', midia: b.dataset.m, delta: 1 });
    else if (a === 'capa') agirEditor({ acao: 'capa', midia: b.dataset.m });
    else if (a === 'tirar') agirEditor({ acao: 'removerMidia', midia: b.dataset.m }, 'A mídia foi para "Sem identificação".');
    else if (a === 'separar') { const s = escolhidas(); if (!s.length) { msg('Marque "escolher" nas mídias que vão para o outro produto.', 'erro'); return; } agirEditor({ acao: 'separar', midias: s }, 'Separado: o novo produto está na lista.'); }
    else if (a === 'juntar') escolherJunta();
    else if (a === 'juntarCom') { const para = lista.find((x) => x.id === Number(b.dataset.para)); if (para && editando) { const de = editando; editando = null; await iniciarJuncao([para, de]); } }
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
