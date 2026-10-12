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
  const TEMPLATES = [['original', 'Original'], ['classico', 'Clássico'], ['promo', 'Promoção'], ['minimal', 'Minimal'], ['vitrine', 'Vitrine']];
  const ST_TXT = { agendado: '⏳ Agendado', processando: '⚙️ Publicando…', manual_pendente: '✋ Falta você postar', manual_feito: '✅ Postado à mão', publicado: '✅ Publicado', erro: '⚠️ Deu problema', cancelado: 'Cancelado' };
  const HASHTAGS = '#tenkitermodas #modacrateus #crateús #lookdodia #modafeminina #modainfantil #modamasculina';
  let abaAtual = 'nova', fila = null, conectado = null, usuarioIg = '', pollTimer = null, ocupado = false, aviso = '', avisoErro = false;
  let nova = null;   // { p, midias:[{url,tipo,sel}], tipo, template, legenda, quando, data, manual, extras:[] }

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
      .po-previa { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0; }
      .po-previa canvas { height: 190px; width: auto; border-radius: 8px; border: 1px solid #ddd; background: #f4f4f4; flex: none; }
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
    $('po-abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) { abaAtual = b.dataset.aba; aviso = ''; desenhar(); if (abaAtual !== 'nova') carregarFila(); } });
    $('po-corpo').addEventListener('click', clique);
    $('po-corpo').addEventListener('input', entrada);
    window.addEventListener('popstate', () => { o.classList.remove('aberto'); parar(); });
  }
  function fechar() { parar(); fecharComHistorico_('overlay-postagens'); }
  function parar() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  async function abrir() {
    montar();
    abrirComHistorico_('overlay-postagens');
    if (!nova) novaVazia();
    desenhar();
    await carregarFila();
    parar(); pollTimer = setInterval(() => { if ($('overlay-postagens').classList.contains('aberto') && abaAtual !== 'nova' && !ocupado) carregarFila(true); }, window.TK_POSTAGENS_POLL_MS || 15000);
  }
  function novaVazia(lote) { nova = { lote: lote || (nova && nova.lote) || [], p: null, midias: [], tipo: 'feed', template: 'classico', legenda: '', quando: 'agora', data: '', manual: false, busca: '', legendaMexida: false, previa: false }; }

  async function carregarFila(silencioso) {
    const r = await ig('/posts');
    if (r && r.ok) { fila = r.posts || []; conectado = !!r.conectado; usuarioIg = r.usuario || ''; }
    else if (!silencioso) { fila = []; aviso = erroTxt(r); avisoErro = true; }
    desenhar();
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
    if (Number(p.Preco) > 0) l.push('💰 ' + formatarReal(precoAvista(p)) + ' à vista (10% de desconto) · ' + formatarReal(p.Preco) + ' no cartão');
    const tam = typeof textoPlano === 'function' ? textoPlano(p.Tamanhos) : p.Tamanhos; if (String(tam || '').trim()) l.push('📏 Tamanhos: ' + String(tam).trim());
    l.push('🛍️ Código: ' + (p.Codigo || ''), '📍 Rua Dr. Moreira da Rocha 759, Crateús-CE', '👉 ' + linkProduto(p), '', HASHTAGS);
    return l.join('\n');
  }

  /* ---------- desenho ---------- */
  function desenhar() {
    const abas = $('po-abas'), corpo = $('po-corpo'); if (!abas || !corpo) return;
    const nMan = (fila || []).filter((x) => x.status === 'manual_pendente').length, nFila = (fila || []).filter((x) => ['agendado', 'processando', 'erro'].indexOf(x.status) !== -1).length;
    abas.innerHTML = [['nova', 'Nova postagem'], ['fila', 'Fila' + (nFila ? ' (' + nFila + ')' : '')], ['manual', 'Postar à mão' + (nMan ? ' (' + nMan + ')' : '')], ['hist', 'Já postadas']]
      .map((a) => '<button type="button" role="tab" data-aba="' + a[0] + '" aria-selected="' + (abaAtual === a[0]) + '">' + esc(a[1]) + '</button>').join('');
    const topo = (aviso ? '<div class="po-aviso' + (avisoErro ? ' erro' : '') + '" role="status">' + esc(aviso) + '</div>' : '') +
      (conectado === false ? '<div class="po-aviso erro">O Instagram não está conectado. Só o Admin total conecta (Conexões → Instagram). Enquanto isso, só dá para preparar Story com link para postar à mão.</div>' : '');
    corpo.innerHTML = topo + (abaAtual === 'nova' ? htmlNova() : abaAtual === 'fila' ? htmlFila(['agendado', 'processando', 'erro'], 'Nada na fila agora.') : abaAtual === 'manual' ? htmlManual() : htmlFila(['publicado', 'manual_feito'], 'Ainda não há postagens feitas por aqui.'));
    if (abaAtual === 'nova' && nova && nova.previa) pintarPrevia();
  }
  function htmlNova() {
    const n = nova, p = n.p;
    let h = htmlLote() + '<div class="po-passo"><h4>1. Qual peça?</h4>';
    if (p) h += '<div class="po-escolhida"><img src="' + esc(fotoMini(p.Foto_URL, 120)) + '" alt="" width="40" height="50" style="border-radius:6px;object-fit:cover"><div><b>' + esc(p.Nome) + '</b><small style="display:block;color:#555">' + esc(p.Codigo || '') + ' · ' + esc(formatarReal(precoAvista(p))) + ' à vista</small></div><button type="button" data-a="trocar">Trocar</button></div>';
    else {
      const b = semAc(n.busca), l = pecasAtivas().filter((x) => !b || semAc(x.Nome).includes(b) || semAc(x.Codigo).includes(b)).slice(0, 40);
      h += '<label for="po-busca" class="po-ajuda" style="margin:0 0 4px">Procure pelo nome ou código</label><input type="search" id="po-busca" value="' + esc(n.busca) + '" autocomplete="off"><div class="po-lista-pecas">' +
        (l.length ? l.map((x) => '<button type="button" class="po-peca" data-peca="' + esc(x.ID) + '"><img src="' + esc(fotoMini(x.Foto_URL, 100)) + '" alt="" loading="lazy" width="40" height="50"><span><b>' + esc(x.Nome) + '</b><small>' + esc(x.Codigo || '') + ' · ' + esc(formatarReal(x.Preco)) + '</small></span></button>').join('') : '<p class="po-ajuda" style="padding:10px">Nenhuma peça encontrada.</p>') + '</div>';
    }
    h += '</div>';
    if (!p) return h;
    h += '<div class="po-passo"><h4>2. O que postar?</h4><div class="po-chips" role="group" aria-label="Tipo de postagem">' + TIPOS.map((t) => '<button type="button" data-tipo="' + t[0] + '" aria-pressed="' + (n.tipo === t[0]) + '">' + esc(t[1]) + '</button>').join('') + '</div>';
    h += '<p class="po-ajuda">' + ({ feed: 'Uma foto no feed (formato 4:5).', carrossel: 'De 2 a 10 mídias deslizando no mesmo post.', reels: 'Um vídeo vertical. Use o vídeo da peça ou suba um do aparelho.', story: 'Cada foto/vídeo marcado vira UM Story separado.' }[n.tipo]) + '</p>';
    h += '<div class="po-midias" role="group" aria-label="Mídias da peça">' + n.midias.map((m, i) => { const ord = m.sel ? n.midias.filter((x, j) => x.sel && j <= i).length : 0;
      return '<button type="button" class="po-m" data-m="' + i + '" aria-pressed="' + m.sel + '" aria-label="' + (m.tipo === 'video' ? 'Vídeo' : 'Foto ' + (i + 1)) + (m.sel ? ', escolhida em ' + ord + 'º' : ', não escolhida') + '"><img src="' + esc(m.tipo === 'video' ? (typeof posterDoVideo === 'function' ? posterDoVideo(m.url) : '') : fotoMini(m.url, 160)) + '" alt="" loading="lazy">' + (m.sel ? '<span class="po-n">' + ord + '</span>' : '') + (m.tipo === 'video' ? '<span class="po-v">vídeo</span>' : '') + '</button>'; }).join('') + '</div>';
    if (n.tipo === 'reels' || n.tipo === 'story' || n.tipo === 'carrossel') h += '<p class="po-ajuda"><label for="po-vid" style="font-weight:700">Vídeo do aparelho (até 15 MB):</label> <input type="file" id="po-vid" accept="video/mp4,video/webm"></p>';
    if (n.tipo === 'story') h += '<p class="po-ajuda" style="margin-top:10px"><label><input type="checkbox" id="po-manual"' + (n.manual ? ' checked' : '') + '> <b>Story com link da peça</b> — o Instagram não deixa colocar link por aqui. Eu preparo tudo e você só cola o link no app (aba “Postar à mão”).</label></p>';
    h += '</div>';
    if (n.tipo !== 'reels') h += '<div class="po-passo"><h4>3. Visual</h4><div class="po-chips" role="group" aria-label="Visual">' + TEMPLATES.map((t) => '<button type="button" data-tpl="' + t[0] + '" aria-pressed="' + (n.template === t[0]) + '">' + esc(t[1]) + '</button>').join('') + '</div>' +
      '<p class="po-ajuda">' + (n.template === 'original' ? 'A foto como está (ajustada ao formato do Instagram).' : 'A foto ganha nome, preço à vista e código da peça. Vídeos ficam sem template.') + '</p>' +
      '<p><button type="button" data-a="previa" class="po-ajuda" style="width:auto;padding:9px 14px;min-height:44px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">👁️ Ver como vai ficar</button></p><div class="po-previa" id="po-previa"></div></div>';
    h += '<div class="po-passo"><h4>' + (n.tipo === 'reels' ? '3' : '4') + '. Legenda</h4>' + (n.tipo === 'story' ? '<p class="po-ajuda" style="margin-top:0">Story não leva legenda pela API' + (n.manual ? '; aqui ela serve de texto para copiar no app.' : ' — esta legenda só vale para Feed/Carrossel/Reels.') + '</p>' : '') + '<label for="po-leg" class="po-ajuda" style="margin:0 0 4px">Texto que acompanha a postagem</label><textarea id="po-leg" maxlength="2200">' + esc(n.legenda) + '</textarea>' +
      '<p><button type="button" data-a="legenda" style="width:auto;padding:9px 14px;min-height:44px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">↺ Refazer legenda automática</button></p></div>';
    h += '<div class="po-passo"><h4>' + (n.tipo === 'reels' ? '4' : '5') + '. Quando?</h4><div class="po-chips" role="group" aria-label="Quando"><button type="button" data-q="agora" aria-pressed="' + (n.quando === 'agora') + '">Agora</button><button type="button" data-q="agendar" aria-pressed="' + (n.quando === 'agendar') + '">Agendar</button></div>' +
      (n.quando === 'agendar' ? '<p style="margin:8px 0 0"><label for="po-data" class="po-ajuda" style="margin:0 0 4px;display:block">Dia e hora (horário de Brasília)</label><input type="datetime-local" id="po-data" value="' + esc(n.data) + '"></p><p class="po-ajuda">O servidor posta sozinho, mesmo com o celular desligado.</p>' : '') + '</div>';
    h += '<button type="button" class="po-enviar" data-a="enviar"' + (ocupado ? ' disabled' : '') + '>' + (ocupado ? 'Preparando…' : n.manual ? '✋ Preparar Story para postar à mão' : n.quando === 'agora' ? '🚀 Postar agora' : '🗓️ Agendar postagem') + '</button>';
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
    else if (t.id === 'po-manual') { nova.manual = t.checked; desenhar(); }
    else if (t.id === 'po-vid' && t.files && t.files[0]) videoDoAparelho(t.files[0]);
  }
  function msg(t, erro) { aviso = t || ''; avisoErro = !!erro; desenhar(); const c = $('po-corpo'); if (c && t) c.scrollTop = 0; }
  async function clique(ev) {
    const b = ev.target.closest('button, a'); if (!b || b.tagName === 'A') return;
    const d = b.dataset;
    if (d.peca) return escolherPeca(d.peca);
    if (d.lote) return escolherPeca(d.lote);
    if (d.loteX) { nova.lote = nova.lote.filter((i) => i !== d.loteX); if (nova.p && String(nova.p.ID) === d.loteX) { nova.p = null; nova.midias = []; } return desenhar(); }
    if (d.tipo) { nova.tipo = d.tipo; if (d.tipo !== 'story') nova.manual = false; nova.template = d.tipo === 'reels' ? 'original' : (nova.template || 'classico'); ajustarSelecao(); nova.previa = false; return desenhar(); }
    if (d.tpl) { nova.template = d.tpl; nova.previa = false; return desenhar(); }
    if (d.q) { nova.quando = d.q; if (d.q === 'agendar' && !nova.data) nova.data = dataLocalPadrao(); return desenhar(); }
    if (d.m !== undefined) { const m = nova.midias[Number(d.m)]; if (!m) return; m.sel = !m.sel; if (nova.tipo === 'feed' && m.sel) nova.midias.forEach((x) => { if (x !== m) x.sel = false; }); if (nova.tipo === 'reels') nova.midias.forEach((x) => { if (x !== m) x.sel = false; }); nova.previa = false; return desenhar(); }
    const a = d.a; if (!a) return;
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
  function infoPeca(p) { return { nome: String(p.Nome || '').trim(), avista: formatarReal(precoAvista(p)), cheio: formatarReal(p.Preco), codigo: String(p.Codigo || '') }; }
  const FONTE = '"Helvetica Neue", Arial, sans-serif', LARANJA = '#E67E22';
  function desenharTemplate(ctx, img, W, H, tpl, info) {
    const story = H > W * 1.5;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
    if (tpl === 'original') { if (story) caber(ctx, img, 0, 0, W, H); else cobrir(ctx, img, 0, 0, W, H); return; }
    if (tpl === 'classico') {
      cobrir(ctx, img, 0, 0, W, H);
      const bh = story ? 520 : 360, g = ctx.createLinearGradient(0, H - bh, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,.92)'); ctx.fillStyle = g; ctx.fillRect(0, H - bh, W, bh);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 58px ' + FONTE; ctx.textBaseline = 'alphabetic'; const ls = quebrar(ctx, info.nome, W - 120, 2); let y = H - (story ? 250 : 170) - (ls.length - 1) * 66; ls.forEach((t) => { ctx.fillText(t, 60, y); y += 66; });
      ctx.fillStyle = LARANJA; ctx.font = 'bold 74px ' + FONTE; ctx.fillText(info.avista + ' à vista', 60, y + 14);
      ctx.fillStyle = '#ddd'; ctx.font = '34px ' + FONTE; ctx.fillText('Código ' + info.codigo + ' · TENKiTER Modas', 60, y + 66);
      ctx.fillStyle = LARANJA; ctx.fillRect(60, 60, 14, 74); ctx.fillStyle = '#fff'; ctx.font = 'bold 40px ' + FONTE; ctx.fillText('NOVIDADE', 92, 112);
    } else if (tpl === 'promo') {
      cobrir(ctx, img, 0, 0, W, H);
      ctx.fillStyle = LARANJA; ctx.fillRect(0, 70, W * 0.62, 120); ctx.fillStyle = '#0d0d0d'; ctx.font = 'bold 78px ' + FONTE; ctx.fillText('PROMOÇÃO', 50, 155);
      const bw = W * 0.72, bh = 250, by = H - bh - (story ? 220 : 70); ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, by, bw, bh);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 44px ' + FONTE; const ls = quebrar(ctx, info.nome, bw - 90, 2); let y = by + 62; ls.forEach((t) => { ctx.fillText(t, 45, y); y += 52; });
      ctx.fillStyle = LARANJA; ctx.font = 'bold 84px ' + FONTE; ctx.fillText(info.avista, 45, by + bh - 48); ctx.fillStyle = '#ccc'; ctx.font = '30px ' + FONTE; ctx.fillText('à vista · ' + info.codigo, 45 + ctx.measureText(info.avista).width * 0 + 0, by + bh - 6);
    } else if (tpl === 'minimal') {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      const m = 56, fh = H - (story ? 520 : 330); cobrir(ctx, img, m, story ? 140 : m, W - m * 2, fh - (story ? 140 : m));
      ctx.fillStyle = '#111'; ctx.font = 'bold 54px ' + FONTE; const ls = quebrar(ctx, info.nome, W - m * 2, 2); let y = H - (story ? 340 : 215) + 10; ls.forEach((t) => { ctx.fillText(t, m, y); y += 62; });
      ctx.fillStyle = '#A85200'; ctx.font = 'bold 60px ' + FONTE; ctx.fillText(info.avista + ' à vista', m, y + 16); ctx.fillStyle = '#555'; ctx.font = '32px ' + FONTE; ctx.fillText(info.codigo + ' · @tenkitermodas', m, y + 66);
    } else {   // vitrine
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b1b1b'); g.addColorStop(1, '#0d0d0d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = LARANJA; ctx.font = 'bold 40px ' + FONTE; ctx.textAlign = 'center'; ctx.fillText('TENKiTER MODAS', W / 2, 90);
      const fw = W - 160, fh = story ? 1180 : 840, fx = 80, fy = 130; ctx.save(); ctx.beginPath(); const r = 36; ctx.moveTo(fx + r, fy); ctx.arcTo(fx + fw, fy, fx + fw, fy + fh, r); ctx.arcTo(fx + fw, fy + fh, fx, fy + fh, r); ctx.arcTo(fx, fy + fh, fx, fy, r); ctx.arcTo(fx, fy, fx + fw, fy, r); ctx.closePath(); ctx.clip(); cobrir(ctx, img, fx, fy, fw, fh); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 52px ' + FONTE; const ls = quebrar(ctx, info.nome, W - 160, 2); let y = fy + fh + 80; ls.forEach((t) => { ctx.fillText(t, W / 2, y); y += 60; });
      ctx.fillStyle = LARANJA; ctx.font = 'bold 66px ' + FONTE; ctx.fillText(info.avista + ' à vista', W / 2, y + 20);
      if (story) { ctx.fillStyle = '#ccc'; ctx.font = '34px ' + FONTE; ctx.fillText('Peça pelo WhatsApp · ' + info.codigo, W / 2, y + 90); }
      ctx.textAlign = 'left';
    }
  }
  function tamanhoAlvo() { return nova.tipo === 'story' ? [1080, 1920] : [1080, 1350]; }
  async function pintarPrevia() {
    const box = $('po-previa'); if (!box || !nova.p) return;
    const fotos = nova.midias.filter((m) => m.sel && m.tipo === 'imagem').slice(0, 4);
    if (!fotos.length) { box.innerHTML = '<p class="po-ajuda">Marque pelo menos uma foto.</p>'; return; }
    box.innerHTML = '<p class="po-ajuda">Montando…</p>';
    const [W, H] = tamanhoAlvo(); const cs = [];
    try {
      for (const m of fotos) { const img = await carregarImagem(m.url), c = document.createElement('canvas'); c.width = W; c.height = H; desenharTemplate(c.getContext('2d'), img, W, H, nova.template, infoPeca(nova.p)); c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'Prévia da postagem'); cs.push(c); }
      box.innerHTML = ''; cs.forEach((c) => box.appendChild(c));
    } catch (e) { box.innerHTML = '<p class="po-aviso erro">' + esc(e.message || 'Não deu para montar a prévia.') + '</p>'; }
  }
  function blobDe(c) { return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Não consegui preparar a imagem.'))), 'image/jpeg', 0.9)); }

  /* ---------- envio de mídia ---------- */
  async function subirBlob(blob, nome) {
    const s = sessao(); if (!s) throw new Error('Entre com o seu login para postar.');
    try {
      const r = await fetch(MIDIA_URL + '/u', { method: 'POST', headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao }, body: blob });
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
    if (file.size > 15 * 1048576) { return msg('Esse vídeo passa de 15 MB. Corte ou comprima e tente de novo.', true); }
    msg('Enviando o vídeo…', false);
    try { const url = await subirBlob(file, file.name || 'video.mp4'); nova.midias.forEach((m) => { if (nova.tipo === 'reels') m.sel = false; }); nova.midias.push({ url, tipo: 'video', sel: true }); msg('Vídeo pronto.', false); }
    catch (e) { msg(e.message, true); }
  }
  async function prepararMidia(m) {
    if (m.tipo === 'video') return { url: m.url, tipo: 'video' };
    const [W, H] = tamanhoAlvo(), c = document.createElement('canvas'); c.width = W; c.height = H;
    try {
      const img = await carregarImagem(m.url); desenharTemplate(c.getContext('2d'), img, W, H, nova.template, infoPeca(nova.p));
      const blob = await blobDe(c); return { url: await subirBlob(blob, 'post.jpg'), tipo: 'imagem' };
    } catch (e) {
      if (nova.template === 'original' && /^https:\/\//.test(m.url) && /\.(jpe?g)(\?|$)/i.test(m.url)) return { url: m.url, tipo: 'imagem' };   // sem canvas: JPG original serve
      throw e;
    }
  }

  /* ---------- criar ---------- */
  async function enviar() {
    if (ocupado) return;
    const n = nova, sel = n.midias.filter((m) => m.sel);
    if (!n.p) return msg('Escolha a peça.', true);
    if (n.tipo === 'feed' && (sel.length !== 1 || sel[0].tipo !== 'imagem')) return msg('Para Feed, marque exatamente 1 foto.', true);
    if (n.tipo === 'carrossel' && (sel.length < 2 || sel.length > 10)) return msg('Para Carrossel, marque de 2 a 10 mídias.', true);
    if (n.tipo === 'reels' && (sel.length !== 1 || sel[0].tipo !== 'video')) return msg('Para Reels, marque 1 vídeo (da peça ou do aparelho).', true);
    if (n.tipo === 'story' && !sel.length) return msg('Marque pelo menos uma foto ou vídeo para o Story.', true);
    let quando = 'agora';
    if (n.quando === 'agendar') {
      const d = new Date(n.data); if (!n.data || isNaN(d)) return msg('Escolha o dia e a hora.', true);
      if (d.getTime() < Date.now() + 60000) return msg('Escolha um horário daqui a pelo menos 1 minuto (ou use “Agora”).', true);
      quando = d.toISOString();
    }
    if (n.manual) quando = 'agora';
    ocupado = true; aviso = ''; desenhar();
    try {
      const prontas = []; for (const m of sel) prontas.push(await prepararMidia(m));
      const base = { legenda: n.legenda, quando, produto: String(n.p.Codigo || n.p.ID || ''), template: n.template, por: (typeof funcionarioNome !== 'undefined' ? funcionarioNome : '') || '' };
      let corpo;
      if (n.tipo === 'story') corpo = { posts: prontas.map((m) => Object.assign({}, base, { tipo: 'story', midias: [m], modo: n.manual ? 'manual' : 'auto', link: n.manual ? linkProduto(n.p) : undefined, grupo: base.produto })) };
      else corpo = Object.assign({}, base, { tipo: n.tipo, midias: prontas });
      const r = await ig('/post', 'POST', corpo);
      if (!r || !r.ok) throw new Error(erroTxt(r));
      const qtd = (r.ids || []).length || 1;
      aviso = n.manual ? 'Pronto! ' + qtd + ' Story' + (qtd > 1 ? 's' : '') + ' esperando você na aba “Postar à mão”.' : n.quando === 'agora' ? 'Enviado! Em instantes aparece em “Já postadas” (vídeo pode demorar alguns minutos).' : 'Agendado! O servidor posta sozinho na hora marcada.'; avisoErro = false;
      const feita = String(n.p.ID), resto = (n.lote || []).filter((i) => i !== feita), cfg = { tipo: n.tipo, template: n.template, quando: n.quando, data: n.data, manual: n.manual };
      ocupado = false;
      if (resto.length) {      // tem mais peças na lista: segue para a próxima com as mesmas escolhas
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
    return '<div class="po-passo" style="border-color:#c13584"><h4>📋 Lista para postar (' + l.length + ')</h4>' + l.map((id) => '<div class="po-escolhida" style="margin-bottom:6px' + (nova.p && String(nova.p.ID) === String(id) ? ';border-color:#c13584;background:#fde7f3' : '') + '"><button type="button" data-lote="' + esc(id) + '" style="margin:0;background:transparent;flex:1;text-align:left;font-weight:700">' + (nova.p && String(nova.p.ID) === String(id) ? '▶ ' : '') + esc(nomeLote(id)) + '</button><button type="button" data-lote-x="' + esc(id) + '" aria-label="Tirar da lista">✕</button></div>').join('') + '</div>';
  }

  /* ---------- liga ---------- */
  (async function init() {
    const botao = $('btn-abrir-postagens'); if (!botao) return;
    botao.addEventListener('click', () => { if (!podePostar()) { alert('Você não tem permissão para postar no Instagram.'); return; } abrir(); });
    botao.hidden = false;
  })();
})();
