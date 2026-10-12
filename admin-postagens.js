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
  let nova = null;
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
      .po-previa { display: flex; gap: 10px; flex-wrap: wrap; padding: 4px 0; }
      .po-previa canvas { width: calc(50% - 5px); max-width: 260px; height: auto; border-radius: 8px; border: 1px solid #ddd; background: #f4f4f4; flex: none; }
      .po-previa canvas.arrastando { outline: 3px solid var(--laranja); }
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
    $('po-abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) { abaAtual = b.dataset.aba; aviso = ''; desenhar(); if (abaAtual === 'fotos') carregarFotos(); else if (abaAtual !== 'nova') carregarFila(); } });
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
    await carregarFila(); carregarFotos(true);
    parar(); pollTimer = setInterval(() => { if ($('overlay-postagens').classList.contains('aberto') && abaAtual !== 'nova' && !ocupado) carregarFila(true); }, window.TK_POSTAGENS_POLL_MS || 15000);
  }
  function novaVazia(lote) { nova = { lote: lote || (nova && nova.lote) || [], modoLivre: false, modoCli: false, tx: {}, tam: {}, ajuste: 'preencher', livre: [], seqAgenda: true, link: '', p: null, midias: [], tipo: 'feed', template: 'classico', legenda: '', quando: 'agora', data: '', manual: false, busca: '', legendaMexida: false, previa: false }; }

  async function carregarFila(silencioso) {
    const r = await ig('/posts');
    if (r && r.ok) { fila = r.posts || []; conectado = !!r.conectado; usuarioIg = r.usuario || ''; }
    else if (!silencioso) { fila = []; aviso = erroTxt(r); avisoErro = true; }
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
  function usarFotos() {
    const ids = Array.from(selFotos), escolhidas = (fotos || []).filter((x) => ids.indexOf(x.id) !== -1);
    if (!escolhidas.length) return;
    if (!nova) novaVazia();
    if (!nova.modoCli) { nova.livre.forEach((m) => { try { if (!m.fotoId) URL.revokeObjectURL(m.url); } catch (e) {} }); nova.livre = []; }
    nova.modoCli = true; nova.modoLivre = false; nova.p = null; nova.midias = []; nova.tipo = 'story'; nova.template = 'elausa'; nova.manual = false; nova.previa = false;
    escolhidas.forEach((x) => { if (!nova.livre.some((m) => m.fotoId === x.id)) nova.livre.push({ fotoId: x.id, tipo: 'imagem', url: x.url, nome: (x.nome || (x.instagram ? '@' + x.instagram : '') || whatsBonito(x.whats) || 'Cliente'), hora: '', pos: {} }); });
    selFotos.clear(); abaAtual = 'nova'; aviso = escolhidas.length + (escolhidas.length > 1 ? ' fotos prontas' : ' foto pronta') + ' para o Story. Ajuste o texto, arraste na foto e escolha o horário.'; avisoErro = false; desenhar();
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
    abas.innerHTML = [['nova', 'Nova postagem'], ['fila', 'Fila' + (nFila ? ' (' + nFila + ')' : '')], ['manual', 'Postar à mão' + (nMan ? ' (' + nMan + ')' : '')], ['fotos', 'Fotos de clientes' + (fotosConta.nova ? ' (' + fotosConta.nova + ')' : '')], ['hist', 'Já postadas']]
      .map((a) => '<button type="button" role="tab" data-aba="' + a[0] + '" aria-selected="' + (abaAtual === a[0]) + '">' + esc(a[1]) + '</button>').join('');
    const topo = (aviso ? '<div class="po-aviso' + (avisoErro ? ' erro' : '') + '" role="status">' + esc(aviso) + '</div>' : '') +
      (conectado === false ? '<div class="po-aviso erro">O Instagram não está conectado. Só o Admin total conecta (Conexões → Instagram). Enquanto isso, só dá para preparar Story com link para postar à mão.</div>' : '');
    corpo.innerHTML = topo + (abaAtual === 'nova' ? htmlNova() : abaAtual === 'fila' ? htmlFila(['agendado', 'processando', 'erro'], 'Nada na fila agora.') : abaAtual === 'manual' ? htmlManual() : abaAtual === 'fotos' ? htmlFotos() : htmlFila(['publicado', 'manual_feito'], 'Ainda não há postagens feitas por aqui.'));
    if (abaAtual === 'nova' && nova && nova.p !== undefined && deveMostrarPrevia()) pintarPrevia();
  }
  function htmlLivre() {
    const n = nova;
    let h = n.modoCli ? '<div class="po-passo"><h4>1. Fotos de clientes escolhidas</h4><p class="po-ajuda" style="margin-top:0">Só Story, com o template “Ela usa TM”. Escolha mais fotos na aba <b>Fotos de clientes</b>.</p>' :
      '<div class="po-passo"><h4>1. Suas mídias (sem peça)</h4><p class="po-ajuda" style="margin-top:0">Fotos e vídeos do aparelho, na ordem em que vão sair. Serve para Story do dia, aviso, bastidores, qualquer coisa.</p>' +
      '<label for="po-livre-arq" class="po-ajuda" style="font-weight:700;margin:0 0 4px;display:block">Escolher fotos e vídeos (vídeo até 15 MB)</label><input type="file" id="po-livre-arq" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple>';
    h += n.livre.length ? '<div style="margin-top:8px">' + n.livre.map((m, i) => '<div class="po-escolhida" style="margin-bottom:6px;align-items:flex-start">' +
      (m.tipo === 'video' ? '<span class="po-v" style="background:#222;color:#fff;border-radius:6px;padding:20px 12px;font-size:1.2rem" aria-hidden="true">🎬</span>' : '<img src="' + esc(m.url) + '" alt="" width="40" height="50" style="border-radius:6px;object-fit:cover">') +
      '<div style="flex:1;min-width:0"><b>' + (i + 1) + 'º · ' + (m.tipo === 'video' ? 'Vídeo' : 'Foto') + '</b><small style="display:block;color:#555;overflow-wrap:anywhere">' + esc(m.nome || '') + '</small>' +
      (n.quando === 'agendar' ? '<label class="po-ajuda" for="po-h-' + i + '" style="display:block;margin:4px 0 2px">Horário só deste (opcional)</label><input type="datetime-local" id="po-h-' + i + '" data-hora="' + i + '" value="' + esc(m.hora || '') + '">' : '') + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;flex:none"><button type="button" data-lm="up" data-i="' + i + '" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" data-lm="down" data-i="' + i + '" aria-label="Descer"' + (i === n.livre.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" data-lm="x" data-i="' + i + '" aria-label="Tirar">✕</button></div></div>').join('') + '</div>' : (n.modoCli ? '<p class="po-ajuda">Nenhuma foto escolhida ainda. Vá em <b>Fotos de clientes</b>, marque as fotos e toque em “Colocar na fila de Story”.</p>' : '<p class="po-ajuda">Nenhuma mídia ainda.</p>');
    return h + '</div>';
  }
  function htmlNova() {
    const n = nova, p = n.p, cli = n.modoCli, livre = n.modoLivre || cli;
    let h = htmlLote() + '<div class="po-chips" role="group" aria-label="Tipo de conteúdo" style="margin-bottom:10px"><button type="button" data-modo="peca" aria-pressed="' + !livre + '">🛍️ Com peça</button><button type="button" data-modo="livre" aria-pressed="' + n.modoLivre + '">✍️ Livre</button><button type="button" data-modo="cliente" aria-pressed="' + cli + '">🧡 Ela usa TM</button></div>';
    if (livre) h += htmlLivre();
    else {
      h += '<div class="po-passo"><h4>1. Qual peça?</h4>';
      if (p) h += '<div class="po-escolhida"><img src="' + esc(fotoMini(p.Foto_URL, 120)) + '" alt="" width="40" height="50" style="border-radius:6px;object-fit:cover"><div><b>' + esc(p.Nome) + '</b><small style="display:block;color:#555">' + esc(p.Codigo || '') + ' · ' + esc(formatarReal(precoAvista(p))) + ' à vista</small></div><button type="button" data-a="trocar">Trocar</button></div>';
      else {
        const b = semAc(n.busca), l = pecasAtivas().filter((x) => !b || semAc(x.Nome).includes(b) || semAc(x.Codigo).includes(b)).slice(0, 40);
        h += '<label for="po-busca" class="po-ajuda" style="margin:0 0 4px">Procure pelo nome ou código</label><input type="search" id="po-busca" value="' + esc(n.busca) + '" autocomplete="off"><div class="po-lista-pecas">' +
          (l.length ? l.map((x) => '<button type="button" class="po-peca" data-peca="' + esc(x.ID) + '"><img src="' + esc(fotoMini(x.Foto_URL, 100)) + '" alt="" loading="lazy" width="40" height="50"><span><b>' + esc(x.Nome) + '</b><small>' + esc(x.Codigo || '') + ' · ' + esc(formatarReal(x.Preco)) + '</small></span></button>').join('') : '<p class="po-ajuda" style="padding:10px">Nenhuma peça encontrada.</p>') + '</div>';
      }
      h += '</div>';
      if (!p) return h;
    }
    h += '<div class="po-passo"><h4>2. O que postar?</h4><div class="po-chips" role="group" aria-label="Tipo de postagem">' + TIPOS.filter((t) => !cli || t[0] === 'story').map((t) => '<button type="button" data-tipo="' + t[0] + '" aria-pressed="' + (n.tipo === t[0]) + '">' + esc(t[1]) + '</button>').join('') + '</div>';
    h += '<p class="po-ajuda">' + ({ feed: 'Uma foto no feed (formato 4:5).', carrossel: 'De 2 a 10 mídias deslizando no mesmo post.', reels: 'Um vídeo vertical.' + (livre ? '' : ' Use o vídeo da peça ou suba um do aparelho.'), story: 'Cada foto/vídeo vira UM Story separado, na ordem.' }[n.tipo]) + '</p>';
    if (!livre) {
      h += '<div class="po-midias" role="group" aria-label="Mídias da peça">' + n.midias.map((m, i) => { const ord = m.sel ? n.midias.filter((x, j) => x.sel && j <= i).length : 0;
        return '<button type="button" class="po-m" data-m="' + i + '" aria-pressed="' + m.sel + '" aria-label="' + (m.tipo === 'video' ? 'Vídeo' : 'Foto ' + (i + 1)) + (m.sel ? ', escolhida em ' + ord + 'º' : ', não escolhida') + '"><img src="' + esc(m.tipo === 'video' ? (typeof posterDoVideo === 'function' ? posterDoVideo(m.url) : '') : fotoMini(m.url, 160)) + '" alt="" loading="lazy">' + (m.sel ? '<span class="po-n">' + ord + '</span>' : '') + (m.tipo === 'video' ? '<span class="po-v">vídeo</span>' : '') + '</button>'; }).join('') + '</div>';
      if (n.tipo === 'reels' || n.tipo === 'story' || n.tipo === 'carrossel') h += '<p class="po-ajuda"><label for="po-vid" style="font-weight:700">Vídeo do aparelho (até 15 MB):</label> <input type="file" id="po-vid" accept="video/mp4,video/webm"></p>';
    }
    if (n.tipo === 'story') {
      h += '<p class="po-ajuda" style="margin-top:10px"><label><input type="checkbox" id="po-manual"' + (n.manual ? ' checked' : '') + '> <b>Story com link</b> — o Instagram não deixa colocar link por aqui. Eu preparo tudo e você só cola o link no app (aba “Postar à mão”).</label></p>';
      if (n.manual && livre) h += '<label for="po-link" class="po-ajuda" style="display:block;margin:6px 0 2px">Link que vai no Story (https://…)</label><input type="url" id="po-link" value="' + esc(n.link) + '" placeholder="https://tenkitermodas.com.br/">';
    }
    h += '</div>';
    if (n.tipo !== 'reels') {
      const lista = cli ? [['elausa', 'Ela usa TM']] : livre ? [['original', 'Original'], ['elausa', 'Ela usa TM']] : TEMPLATES, itens = n.template !== 'original' ? itensTemplate(n.template, infoPeca(n.p), ...tamanhoAlvo()) : [];
      h += '<div class="po-passo"><h4>3. Visual</h4>' + (lista.length > 1 ? '<div class="po-chips" role="group" aria-label="Visual">' + lista.map((t) => '<button type="button" data-tpl="' + t[0] + '" aria-pressed="' + (n.template === t[0]) + '">' + esc(t[1]) + '</button>').join('') + '</div>' : '') +
        '<p class="po-ajuda">' + (n.template === 'original' ? 'A foto como está (ajustada ao formato do Instagram).' : n.template === 'elausa' ? 'A foto com o texto “Ela usa TM” (toque numa das opções ou escreva o seu). Arraste o texto na foto para onde quiser.' : 'A foto ganha nome, preço à vista e código da peça. Arraste cada texto na prévia para onde quiser. Vídeos ficam sem template.') + '</p>';
      if (n.template === 'original' || n.template === 'elausa') h += '<div class="po-chips" role="group" aria-label="Como a foto ocupa a tela" style="margin-bottom:6px"><button type="button" data-aj="preencher" aria-pressed="' + (n.ajuste === 'preencher') + '">Preencher a tela</button><button type="button" data-aj="inteira" aria-pressed="' + (n.ajuste === 'inteira') + '">Foto inteira (fundo desfocado)</button></div>';
      if (n.template === 'elausa') h += '<div class="po-chips" role="group" aria-label="Textos prontos" style="margin-bottom:6px">' + VARIANTES_ELA.map((v) => '<button type="button" data-var="' + esc(v) + '" aria-pressed="' + (((n.tx.elausa || {}).marca !== undefined ? n.tx.elausa.marca : VARIANTES_ELA[0]) === v) + '">' + esc(v) + '</button>').join('') + '</div>';
      if (itens.length) h += '<div id="po-textos">' + itens.map((it) => { const tx = (n.tx[n.template] || {})[it.k], tm = (n.tam[n.template] || {})[it.k] || 1;
        return '<div style="margin:6px 0"><label class="po-ajuda" for="po-tx-' + it.k + '" style="display:block;margin:0 0 2px;font-weight:700">' + esc(it.rot) + '</label><input type="text" id="po-tx-' + it.k + '" data-tx="' + it.k + '" value="' + esc(tx !== undefined ? tx : it.t) + '" maxlength="90" autocomplete="off">' +
          '<label class="po-ajuda" for="po-tm-' + it.k + '" style="display:flex;gap:8px;align-items:center;margin:2px 0 0">Tamanho <input type="range" id="po-tm-' + it.k + '" data-tm="' + it.k + '" min="0.5" max="2" step="0.05" value="' + tm + '" style="flex:1"></label></div>'; }).join('') +
        '<p><button type="button" data-a="resetTx" style="width:auto;padding:9px 14px;min-height:44px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">↺ Voltar textos e posições ao padrão</button></p></div>';
      h += '<p><button type="button" data-a="previa" class="po-ajuda" style="width:auto;padding:9px 14px;min-height:44px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">👁️ Ver como vai ficar</button></p><div class="po-previa" id="po-previa"></div></div>';
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
    else if (t.dataset && t.dataset.tm !== undefined) { (nova.tam[nova.template] = nova.tam[nova.template] || {})[t.dataset.tm] = Number(t.value) || 1; repintar(); }
    else if (t.id === 'po-f-whats') formFoto.whats = t.value;
    else if (t.id === 'po-f-ig') formFoto.ig = t.value;
    else if (t.id === 'po-f-obs') formFoto.obs = t.value;
    else if (t.dataset && t.dataset.fsel !== undefined) { const id = Number(t.dataset.fsel); if (t.checked) selFotos.add(id); else selFotos.delete(id); desenhar(); }
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
    if (d.aj) { nova.ajuste = d.aj; return desenhar(); }
    if (d.var) { (nova.tx.elausa = nova.tx.elausa || {}).marca = d.var; return desenhar(); }
    if (d.a === 'resetTx') { delete nova.tx[nova.template]; delete nova.tam[nova.template]; itensDaPostagem().forEach((m) => { if (m.pos) delete m.pos[nova.template]; }); return desenhar(); }
    if (d.modo) {
      const antes = nova.modoCli ? 'cliente' : nova.modoLivre ? 'livre' : 'peca';
      if (antes !== d.modo && antes !== 'peca') { nova.livre.forEach((m) => { try { if (!m.fotoId) URL.revokeObjectURL(m.url); } catch (e) {} }); nova.livre = []; }
      nova.modoLivre = d.modo === 'livre'; nova.modoCli = d.modo === 'cliente';
      if (d.modo === 'peca') { if (nova.template === 'original' || nova.template === 'elausa') nova.template = 'classico'; }
      else { nova.p = null; nova.midias = []; if (d.modo === 'cliente') { nova.tipo = 'story'; nova.template = 'elausa'; nova.manual = false; } else if (nova.template !== 'elausa') nova.template = 'original'; }
      nova.previa = false; return desenhar();
    }
    if (d.lm) { const i = Number(d.i), L = nova.livre; if (d.lm === 'x') { try { URL.revokeObjectURL(L[i].url); } catch (e) {} L.splice(i, 1); } else { const k = d.lm === 'up' ? i - 1 : i + 1; if (L[k]) { const t = L[i]; L[i] = L[k]; L[k] = t; } } return desenhar(); }
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
  function infoPeca(p) { if (!p) return { nome: '', avista: '', cheio: '', codigo: '' }; return { nome: String(p.Nome || '').trim(), avista: formatarReal(precoAvista(p)), cheio: formatarReal(p.Preco), codigo: String(p.Codigo || '') }; }
  const FONTE = '"Helvetica Neue", Arial, sans-serif', LARANJA = '#E67E22';
  const VARIANTES_ELA = ['ElausaTM🧡', 'EleusaTM🧡', 'ElasusamTM🧡', 'ElesusamTM🧡'];
  const FONTE_MANUAL = '"Segoe Script","Brush Script MT","Lucida Handwriting","Snell Roundhand",cursive';
  /** Textos de cada template: k = chave, rot = nome no editor, t = texto padrão, x/y = posição (fração da imagem; x é a esquerda ou o centro, y é a linha de base), tam = tamanho em px (imagem de 1080 de largura). */
  function itensTemplate(tpl, info, W, H) {
    const story = H > W * 1.5;
    if (tpl === 'classico') return [
      { k: 'selo', rot: 'Selo', t: 'NOVIDADE', x: 0.07, y: 0.085, tam: 38, cor: '#0d0d0d', bg: LARANJA },
      { k: 'nome', rot: 'Nome da peça', t: info.nome, x: 0.055, y: 0.8, tam: 58, cor: '#fff', max: 0.88, linhas: 2, sombra: true },
      { k: 'preco', rot: 'Preço', t: info.avista ? info.avista + ' à vista' : '', x: 0.055, y: 0.895, tam: 74, cor: LARANJA, sombra: true },
      { k: 'codigo', rot: 'Código', t: info.codigo ? 'Código ' + info.codigo + ' · TENKiTER Modas' : '', x: 0.055, y: 0.945, tam: 32, cor: '#ddd', sombra: true }];
    if (tpl === 'promo') return [
      { k: 'selo', rot: 'Selo', t: 'PROMOÇÃO', x: 0.05, y: 0.115, tam: 78, cor: '#0d0d0d', bg: LARANJA },
      { k: 'nome', rot: 'Nome da peça', t: info.nome, x: 0.045, y: 0.73, tam: 44, cor: '#fff', bg: '#0d0d0d', max: 0.7, linhas: 2 },
      { k: 'preco', rot: 'Preço', t: info.avista || '', x: 0.045, y: 0.84, tam: 84, cor: LARANJA, bg: '#0d0d0d' },
      { k: 'codigo', rot: 'Código', t: info.codigo ? 'à vista · ' + info.codigo : '', x: 0.045, y: 0.895, tam: 30, cor: '#fff', bg: '#0d0d0d' }];
    if (tpl === 'minimal') return [
      { k: 'nome', rot: 'Nome da peça', t: info.nome, x: 0.052, y: story ? 0.8 : 0.84, tam: 54, cor: '#111', max: 0.9, linhas: 2 },
      { k: 'preco', rot: 'Preço', t: info.avista ? info.avista + ' à vista' : '', x: 0.052, y: story ? 0.89 : 0.915, tam: 60, cor: '#A85200' },
      { k: 'codigo', rot: 'Código', t: info.codigo ? info.codigo + ' · @tenkitermodasceara' : '', x: 0.052, y: story ? 0.94 : 0.96, tam: 32, cor: '#555' }];
    if (tpl === 'vitrine') { const yn = story ? 0.72 : 0.78; return [
      { k: 'marca', rot: 'Marca', t: 'TENKiTER MODAS', x: 0.5, y: 0.05, tam: 40, cor: LARANJA, alinha: 'center' },
      { k: 'nome', rot: 'Nome da peça', t: info.nome, x: 0.5, y: yn, tam: 52, cor: '#fff', alinha: 'center', max: 0.85, linhas: 2 },
      { k: 'preco', rot: 'Preço', t: info.avista ? info.avista + ' à vista' : '', x: 0.5, y: yn + 0.075, tam: 66, cor: LARANJA, alinha: 'center' }]
      .concat(story ? [{ k: 'extra', rot: 'Linha extra', t: info.codigo ? 'Peça pelo WhatsApp · ' + info.codigo : 'Peça pelo WhatsApp', x: 0.5, y: yn + 0.125, tam: 34, cor: '#ccc', alinha: 'center' }] : []); }
    if (tpl === 'elausa') return [{ k: 'marca', rot: 'Texto', t: VARIANTES_ELA[0], x: 0.5, y: 0.72, tam: 120, cor: '#fff', alinha: 'center', estilo: 'italic', fonte: FONTE_MANUAL, sombra: true }];
    return [];
  }
  /** Itens com o que a pessoa mexeu: texto trocado, tamanho e a posição (por foto). */
  function itensEfetivos(tpl, m) {
    const [W, H] = tamanhoAlvo(), base = itensTemplate(tpl, infoPeca(nova.p), W, H);
    const tx = (nova.tx && nova.tx[tpl]) || {}, tm = (nova.tam && nova.tam[tpl]) || {}, ps = (m && m.pos && m.pos[tpl]) || {};
    return base.map((it) => Object.assign({}, it, { t: tx[it.k] !== undefined ? tx[it.k] : it.t, mult: tm[it.k] || 1 }, ps[it.k] ? { x: ps[it.k].x, y: ps[it.k].y } : {}));
  }
  function textoCanvas(ctx, it, W, H) {
    const txt = String(it.t == null ? '' : it.t).trim(); if (!txt) return null;
    const tam = Math.max(12, Math.round(it.tam * (it.mult || 1)));
    ctx.font = (it.estilo ? it.estilo + ' ' : '') + 'bold ' + tam + 'px ' + (it.fonte || FONTE); ctx.textAlign = it.alinha || 'left'; ctx.textBaseline = 'alphabetic';
    const linhas = it.max ? quebrar(ctx, txt, W * it.max, it.linhas || 2) : [txt], lh = tam * 1.15, pad = it.bg ? tam * 0.28 : 4;
    const larg = Math.max.apply(null, linhas.map((l) => ctx.measureText(l).width)), x = it.x * W, y0 = it.y * H;
    const x0 = (it.alinha === 'center' ? x - larg / 2 : x) - pad, y1 = y0 - tam * 0.88 - pad * 0.6, y2 = y0 + (linhas.length - 1) * lh + tam * 0.3 + pad * 0.6;
    if (it.bg) { ctx.fillStyle = it.bg; ctx.fillRect(x0, y1, larg + pad * 2, y2 - y1); }
    ctx.save(); if (it.sombra) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = Math.round(tam * 0.18); ctx.shadowOffsetY = Math.round(tam * 0.05); }
    ctx.fillStyle = it.cor || '#fff'; linhas.forEach((l, n) => ctx.fillText(l, x, y0 + n * lh)); ctx.restore();
    return { k: it.k, x0: x0, y0: y1, x1: x0 + larg + pad * 2, y1: y2 };
  }
  function fundoFoto(ctx, img, W, H, ajuste) {
    if (ajuste === 'inteira') {
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
      try { ctx.save(); ctx.filter = 'blur(40px)'; cobrir(ctx, img, -60, -60, W + 120, H + 120); ctx.restore(); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H); } catch (e) { /* sem blur: fica o fundo escuro */ }
      caber(ctx, img, 0, 0, W, H);
    } else cobrir(ctx, img, 0, 0, W, H);
  }
  /** Desenha a foto + template e os textos; devolve as caixas dos textos (para arrastar). */
  function desenharTemplate(ctx, img, W, H, tpl, itens, ajuste) {
    const story = H > W * 1.5;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
    if (tpl === 'original' || tpl === 'elausa') fundoFoto(ctx, img, W, H, ajuste);
    else if (tpl === 'classico') { cobrir(ctx, img, 0, 0, W, H); const bh = story ? 640 : 460, g = ctx.createLinearGradient(0, H - bh, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,.92)'); ctx.fillStyle = g; ctx.fillRect(0, H - bh, W, bh); }
    else if (tpl === 'promo') cobrir(ctx, img, 0, 0, W, H);
    else if (tpl === 'minimal') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); const m = 56, topo = story ? 140 : m, fh = H - (story ? 520 : 330); cobrir(ctx, img, m, topo, W - m * 2, fh - topo); }
    else {     // vitrine
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b1b1b'); g.addColorStop(1, '#0d0d0d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const fw = W - 160, fh = story ? 1180 : 840, fx = 80, fy = 130, r = 36; ctx.save(); ctx.beginPath(); ctx.moveTo(fx + r, fy); ctx.arcTo(fx + fw, fy, fx + fw, fy + fh, r); ctx.arcTo(fx + fw, fy + fh, fx, fy + fh, r); ctx.arcTo(fx, fy + fh, fx, fy, r); ctx.arcTo(fx, fy, fx + fw, fy, r); ctx.closePath(); ctx.clip(); cobrir(ctx, img, fx, fy, fw, fh); ctx.restore();
    }
    const caixas = []; (itens || []).forEach((it) => { const c = textoCanvas(ctx, it, W, H); if (c) caixas.push(c); });
    return caixas;
  }
  function tamanhoAlvo() { return nova.tipo === 'story' ? [1080, 1920] : [1080, 1350]; }
  const imgCache = {};
  async function imagemCache(url) { if (!imgCache[url]) imgCache[url] = carregarImagem(url).catch((e) => { delete imgCache[url]; throw e; }); return imgCache[url]; }
  function itensDaPostagem() { return nova.modoLivre || nova.modoCli ? nova.livre : nova.midias.filter((m) => m.sel); }
  function deveMostrarPrevia() { return nova && (nova.previa || (nova.template && nova.template !== 'original')) && nova.tipo !== 'reels'; }
  let previaSeq = 0;
  function pintarCanvas(c) {
    const m = c._m, [W, H] = tamanhoAlvo(); c.width = W; c.height = H;
    c._boxes = desenharTemplate(c.getContext('2d'), c._img, W, H, nova.template, itensEfetivos(nova.template, m), nova.ajuste);
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
  function ligarArraste(c) {
    if (!arrGlobal) { arrGlobal = true; window.addEventListener('mousemove', moverArraste); window.addEventListener('mouseup', fimArraste); }
    const inicio = (e) => { const pt = pontoDe(c, e), b = acharCaixa(c, pt); if (!b) return; const it = itensEfetivos(nova.template, c._m).find((q) => q.k === b.k); if (!it) return; arr = { c: c, k: b.k, x: it.x, y: it.y, ox: pt.x, oy: pt.y }; c.classList.add('arrastando'); if (e.cancelable) e.preventDefault(); };
    c.addEventListener('mousedown', inicio);
    c.addEventListener('touchstart', inicio, { passive: false }); c.addEventListener('touchmove', moverArraste, { passive: false }); c.addEventListener('touchend', fimArraste); c.addEventListener('touchcancel', fimArraste);
    c.addEventListener('mousemove', (e) => { if (!arr) c.style.cursor = acharCaixa(c, pontoDe(c, e)) ? 'grab' : 'default'; });
  }
  async function pintarPrevia() {
    const box = $('po-previa'); if (!box) return;
    const fotos = itensDaPostagem().filter((m) => m.tipo === 'imagem').slice(0, 10), meu = ++previaSeq;
    if (!fotos.length) { box.innerHTML = '<p class="po-ajuda">Escolha pelo menos uma foto.</p>'; return; }
    box.innerHTML = '<p class="po-ajuda">Montando…</p>';
    const cs = [];
    try {
      for (const m of fotos) { const img = await imagemCache(m.url); if (meu !== previaSeq) return; const c = document.createElement('canvas'); c._m = m; c._img = img; pintarCanvas(c); c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'Prévia da postagem. Arraste os textos para mudar de lugar.'); ligarArraste(c); cs.push(c); }
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
  function adicionarLivres(arqs) {
    const erros = [];
    arqs.forEach((f) => {
      const video = /^video\//.test(f.type), foto = /^image\/(jpeg|png|webp)$/.test(f.type);
      if (!video && !foto) { erros.push(f.name + ': formato não aceito (use JPG, PNG, WEBP, MP4 ou WEBM)'); return; }
      if (video && f.size > 15 * 1048576) { erros.push(f.name + ': vídeo passa de 15 MB'); return; }
      if (nova.livre.length >= 20) { erros.push('No máximo 20 mídias por vez'); return; }
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
      const img = await imagemCache(m.url); desenharTemplate(c.getContext('2d'), img, W, H, nova.template, itensEfetivos(nova.template, m), nova.ajuste);
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
      const base = { legenda: n.legenda, produto: livre ? '' : grupo, template: livre ? (cli ? 'elausa' : 'livre') : n.template, por: (typeof funcionarioNome !== 'undefined' ? funcionarioNome : '') || '' };
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
    return '<div class="po-passo" style="border-color:#c13584"><h4>📋 Lista para postar (' + l.length + ')</h4>' + l.map((id) => '<div class="po-escolhida" style="margin-bottom:6px' + (nova.p && String(nova.p.ID) === String(id) ? ';border-color:#c13584;background:#fde7f3' : '') + '"><button type="button" data-lote="' + esc(id) + '" style="margin:0;background:transparent;flex:1;text-align:left;font-weight:700">' + (nova.p && String(nova.p.ID) === String(id) ? '▶ ' : '') + esc(nomeLote(id)) + '</button><button type="button" data-lote-x="' + esc(id) + '" aria-label="Tirar da lista">✕</button></div>').join('') + '</div>';
  }

  /* ---------- liga ---------- */
  (async function init() {
    const botao = $('btn-abrir-postagens'); if (!botao) return;
    botao.addEventListener('click', () => { if (!podePostar()) { alert('Você não tem permissão para postar no Instagram.'); return; } abrir(); });
    botao.hidden = false;
  })();
})();
