/* ====================================================================
 * TENKiTER — admin-mensagens.js (v2.2) — CAIXA DE MENSAGENS (Admin total)
 *  • Lista de conversas + conversa no estilo WhatsApp: responde por aqui (WhatsApp 1, WhatsApp 2 e Instagram),
 *    vê o que a loja enviou, entregue/lida, não lidas e quem ainda falta responder.
 *  • Atualiza ao vivo (consulta leve a cada poucos segundos, só com a tela aberta e visível) SEM redesenhar
 *    a lista nem a conversa: mantém rolagem, texto digitado, busca e foco de quem está usando.
 *  • Fotos, vídeos e áudios: aparecem na conversa (baixados com a sessão, nunca por link público) e podem ser enviados (anexo ou gravação).
 *    Resposta a story mostra a imagem do story respondido.
 *  • Exporta uma conversa, um canal ou tudo (CSV, TXT para IA, JSON) e mostra métricas de atendimento.
 *  • Todo texto vindo das conversas entra na tela por textContent (nunca innerHTML); links só http(s).
 * ==================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CANAIS = [['whatsapp1', 'WhatsApp 1'], ['whatsapp2', 'WhatsApp 2'], ['instagram', 'Instagram']];
  const NOME_CANAL = { whatsapp1: 'WhatsApp 1', whatsapp2: 'WhatsApp 2', instagram: 'Instagram' };
  const FILTROS = [['todas', 'Todas'], ['nao_lidas', 'Não lidas'], ['lidas', 'Lidas'], ['sem_resposta', 'Falta responder'], ['grupos', 'Grupos']];
  // v7.21: aba mestre "Todas" (os três canais juntos) vem primeiro e é a que abre
  const ABAS = [['todos', 'Todas']].concat(CANAIS);
  const NOME_CANAL_ = { whatsapp1: 'WhatsApp 1', whatsapp2: 'WhatsApp 2', instagram: 'Instagram' };
  const ESPERA_MS = Number(window.TK_MENSAGENS_POLL_MS) || 4000, ESPERA_MAX_MS = Number(window.TK_MENSAGENS_POLL_MS) ? 3000 : 30000, ESPERA_SELO_MS = Number(window.TK_MENSAGENS_POLL_MS) ? 1500 : 60000;
  let espiando = false, cfgLeitura = null, avisouCelular = {};
  let canal = 'todos', filtro = 'todas', busca = '', resumo = null, contagens = null, lista = [], cursor = '', aberta = null, msgs = [], vista = 'lista', painel = '';
  let seqLista = 0, ultIdSrv = 0, nPoll = 0, timerBusca = null, timerLive = null, timerSelo = null, espera = ESPERA_MS, offline = false, abrindo = 0, novasAbaixo = 0, menuAberto = null, aviso = '';
  const rascunhos = {}, elMsgs = new Map(), elConvs = new Map(), pendentes = new Map();
  const blobs = new Map();                     // mídia já baixada nesta conversa: "id" ou "id|c" (story) -> promessa do endereço local
  let anexoPend = null, gravacao = null, colarFimAte = 0;

  /* ---------- utilidades ---------- */
  async function worker_(caminho, metodo, corpo) {
    const s = (typeof getSessao === 'function' && getSessao()) || null;
    if (!s || typeof INSTAGRAM_URL === 'undefined') return { ok: false, erro: 'Entre com o seu login (não vale só o PIN) para ver as mensagens.' };
    try {
      const r = await fetch(INSTAGRAM_URL + caminho, { method: metodo, headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
      return await r.json();
    } catch (e) { return { ok: false, erro: 'Sem conexão agora. Tente de novo.', semRede: true }; }
  }
  function podeGerir() {
    try { return typeof temPermissao === 'function' && typeof usuarioAdmin !== 'undefined' && !!usuarioAdmin && !!temPermissao(usuarioAdmin, 'gerir_acessos'); } catch (e) { return false; }
  }
  function el(tag, cls, texto) { const e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e; }
  function botao(cls, texto, acao, extra) { const b = el('button', cls, texto); b.type = 'button'; if (acao) b.dataset.ms = acao; if (extra) Object.keys(extra).forEach((k) => { b.dataset[k] = extra[k]; }); return b; }
  const hm = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
  function hora(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    const hoje = new Date();
    return mesmoDia(d, hoje) ? hm(d) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + hm(d);
  }
  function horaLista(iso) {
    const d = new Date(iso); if (!iso || isNaN(d)) return '';
    const hoje = new Date(), ontem = new Date(hoje.getTime() - 86400000);
    if (mesmoDia(d, hoje)) return hm(d);
    if (mesmoDia(d, ontem)) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
  function diaRotulo(iso) {
    const d = new Date(iso), hoje = new Date(), ontem = new Date(hoje.getTime() - 86400000);
    if (mesmoDia(d, hoje)) return 'Hoje';
    if (mesmoDia(d, ontem)) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  function espera_(iso) {
    const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (isNaN(min)) return '';
    if (min < 1) return 'agora';
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60); if (h < 24) return h + ' h';
    const d = Math.floor(h / 24); return d + (d === 1 ? ' dia' : ' dias');
  }
  function rotuloContato(c) {
    if (c.nome) return c.nome;
    const n = String(c.contato || '').replace(/-group$|@g\.us$|@s\.whatsapp\.net$/g, '');
    if (/^\d{12,13}$/.test(n) && n.indexOf('55') === 0) return '+55 (' + n.slice(2, 4) + ') ' + n.slice(4, n.length - 4) + '-' + n.slice(-4);
    return /^\d{10,15}$/.test(n) ? '+' + n : (c.grupo ? 'Grupo ' + n : ((c.canal || canal) === 'instagram' ? 'Cliente do Instagram' : n));
  }
  function iniciais(c) { const t = rotuloContato(c).replace(/[^\p{L}\p{N} ]/gu, '').trim(); return t ? (t.split(/\s+/).slice(0, 2).map((x) => x[0]).join('')).toUpperCase() : '?'; }
  function corAvatar(c) { let h = 0; const s = String(c.contato || c.id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return ['#7a4a1e', '#2f5d62', '#5b3a6b', '#6b5a1e', '#3d5a3d', '#7a2f3d'][h % 6]; }
  const TIPO_ROTULO = { 'imagem': '📷 Foto', 'vídeo': '🎬 Vídeo', 'áudio': '🎤 Áudio', 'documento': '📄 Documento', 'figurinha': 'Figurinha', 'contato': '👤 Contato', 'localização': '📍 Localização', 'reação': 'Reação', 'resposta': 'Resposta', 'compartilhamento': 'Compartilhamento', 'menção em story': 'Menção em story', 'reel': 'Reel' };
  const STATUS = { pendente: ['🕓', 'Enviando', ''], enviada: ['✓', 'Enviada', ''], entregue: ['✓✓', 'Entregue', ''], lida: ['✓✓', 'Lida', 'lida'], incerta: ['⚠', 'Sem confirmação', 'incerta'], falhou: ['⚠', 'Não enviada', 'incerta'] };
  function selo(status) { const s = STATUS[status] || STATUS.enviada, e = el('span', 'ms-tique ' + s[2], s[0]); e.title = s[1]; e.setAttribute('role', 'img'); e.setAttribute('aria-label', s[1]); return e; }
  function linkar(pai, texto) {
    const re = /https?:\/\/[^\s<>"']+/g; let i = 0, m;
    while ((m = re.exec(texto))) {
      if (m.index > i) pai.appendChild(document.createTextNode(texto.slice(i, m.index)));
      let url = m[0], cauda = ''; const f = url.match(/[.,;:!?)\]]+$/); if (f) { cauda = f[0]; url = url.slice(0, -cauda.length); }
      const a = el('a', 'ms-link', url); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; pai.appendChild(a);
      if (cauda) pai.appendChild(document.createTextNode(cauda));
      i = m.index + m[0].length;
    }
    if (i < texto.length) pai.appendChild(document.createTextNode(texto.slice(i)));
  }
  const larga = () => window.matchMedia('(min-width: 860px)').matches;
  let timerAviso = null;
  function aviso_(t) { aviso = t || ''; const a = $('ms-aviso'); if (a) { a.textContent = aviso; a.hidden = !aviso; } clearTimeout(timerAviso); if (aviso) timerAviso = setTimeout(() => aviso_(''), 9000); }
  function rascunhoSalvar_(id, t) { rascunhos[id] = t; try { sessionStorage.setItem('tk_ms_rasc_' + id, t); } catch (e) { /* sem armazenamento: só na memória */ } }
  function rascunhoLer_(id) { if (rascunhos[id] != null) return rascunhos[id]; try { return sessionStorage.getItem('tk_ms_rasc_' + id) || ''; } catch (e) { return ''; } }
  function idLocal_() { const a = new Uint8Array(9); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return 'l' + Array.from(a, (x) => x.toString(16).padStart(2, '0')).join(''); }

  /* ---------- estilo ---------- */
  function css() {
    if ($('ms-css')) return;
    const s = document.createElement('style'); s.id = 'ms-css';
    s.textContent = `
      #overlay-mensagens { align-items: stretch; }
      .sheet-mensagens { position: relative; max-width: 1120px; width: 100%; padding: 0; border-radius: 0; height: var(--ms-h, 100dvh); max-height: var(--ms-h, 100dvh); margin-top: var(--ms-top, 0); overflow: hidden; background: #fff; }
      @media (min-width: 860px) { #overlay-mensagens { align-items: center; } .sheet-mensagens { height: min(90dvh, 880px); max-height: min(90dvh, 880px); margin-top: 0; border-radius: 16px; } }
      .sheet-mensagens button { width: auto; margin: 0; font-family: inherit; }
      .sheet-mensagens textarea, .sheet-mensagens input[type=search] { font-family: inherit; }
      .ms-app { display: grid; grid-template-columns: 1fr; height: 100%; min-height: 0; }
      @media (min-width: 860px) { .ms-app { grid-template-columns: minmax(310px, 380px) 1fr; } }
      .ms-lateral, .ms-conversa { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: #fff; }
      .ms-lateral { border-right: 1px solid #e6e1d6; }
      @media (max-width: 859px) { .ms-app[data-vista=lista] .ms-conversa, .ms-app[data-vista=conversa] .ms-lateral { display: none; } }
      .ms-topo { display: flex; align-items: center; gap: 8px; padding: 10px 12px 6px; }
      .ms-titulo { margin: 0; font-family: "Poppins", sans-serif; font-size: 1.05rem; font-weight: 700; flex: 1; min-width: 0; }
      .ms-ao-vivo { font-size: 0.72rem; color: #146c43; font-weight: 700; white-space: nowrap; } .ms-ao-vivo.off { color: #8a2b2b; }
      .ms-ico { min-width: 44px; min-height: 44px; border: 0; border-radius: 50%; background: #f1ede3; color: #222; font-size: 1.1rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; width: 44px; }
      .ms-ico:hover { background: #e8e2d3; }
      .ms-menu { position: absolute; z-index: 5; background: #fff; border: 1px solid #ddd; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); padding: 6px; min-width: 232px; }
      .ms-menu button { display: block; width: 100%; text-align: left; min-height: 44px; padding: 8px 12px; border: 0; background: transparent; border-radius: 8px; font: inherit; font-size: 0.9rem; color: #111; cursor: pointer; }
      .ms-menu button:hover, .ms-menu button:focus-visible { background: #f5f1e8; }
      .ms-menu hr { border: 0; border-top: 1px solid #eee; margin: 4px 0; }
      .ms-abas { display: flex; gap: 6px; padding: 4px 12px 8px; }
      .ms-aba { flex: 1 1 0; min-width: 0; min-height: 48px; padding: 6px 6px; border: 1px solid #d5d5d5; border-radius: 10px; background: #fff; color: #222; font-weight: 700; font-size: 0.82rem; cursor: pointer; text-align: center; position: relative; }
      .ms-aba small { display: block; font-weight: 500; color: #555; font-size: 0.72rem; }
      .ms-aba[aria-selected=true] { background: #0d0d0d; color: #fff; border-color: #0d0d0d; } .ms-aba[aria-selected=true] small { color: #e9dfcf; }
      .ms-aba .ms-pt { position: absolute; top: -6px; right: -4px; min-width: 20px; height: 20px; border-radius: 10px; background: var(--laranja, #E67E22); color: #0d0d0d; font-size: 0.72rem; line-height: 20px; padding: 0 5px; font-weight: 800; }
      .ms-filtros { display: flex; gap: 6px; padding: 0 12px 8px; overflow-x: auto; scrollbar-width: none; }
      .ms-chip { flex: none; min-height: 44px; padding: 6px 12px; border: 1px solid #d5d5d5; border-radius: 22px; background: #fff; font: inherit; font-size: 0.82rem; font-weight: 600; color: #222; cursor: pointer; }
      .ms-chip[aria-pressed=true] { background: #fbe9d6; border-color: var(--laranja, #E67E22); color: #5c2e00; }
      .ms-busca { width: calc(100% - 24px); margin: 0 12px 8px; padding: 11px 12px; min-height: 44px; border: 1px solid #ccc; border-radius: 10px; font-size: 0.95rem; box-sizing: border-box; }
      .ms-estado { margin: 0 12px 8px; padding: 8px 10px; border-radius: 10px; background: #f7f4ec; font-size: 0.8rem; color: #333; display: flex; gap: 8px; align-items: center; }
      .ms-estado .ms-ok { color: #146c43; font-weight: 700; } .ms-estado .ms-pausa { color: #6b3f00; font-weight: 700; }
      .ms-estado button { margin-left: auto; min-height: 44px; border: 0; background: transparent; color: #7a3a00; font-weight: 700; font-size: 0.8rem; cursor: pointer; text-decoration: underline; }
      .ms-caixa { margin: 0 12px 8px; border: 1px solid #e3e3e3; border-radius: 12px; padding: 10px 12px; background: #fff; font-size: 0.85rem; overflow-wrap: anywhere; }
      .ms-ok { color: #146c43; font-weight: 700; } .ms-pausa { color: #6b3f00; font-weight: 700; }
      .ms-caixa p { margin: 4px 0; }
      .ms-linha { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
      .ms-btn { min-height: 44px; padding: 8px 14px; border-radius: 10px; border: 0; font-weight: 700; font-size: 0.85rem; cursor: pointer; background: #eee; color: #222; width: auto; }
      .ms-btn.prim { background: var(--laranja, #E67E22); color: #0d0d0d; }
      .ms-copia { width: 100%; font-size: 0.78rem; padding: 9px 10px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; box-sizing: border-box; }
      .ms-lista-wrap { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
      .ms-lista { list-style: none; margin: 0; padding: 0; }
      .sheet-mensagens .ms-conv { width: 100%; }
      .ms-conv-li { position: relative; display: flex; align-items: stretch; border-bottom: 1px solid #f0ece2; background: #fff; }
      .ms-conv-li .ms-conv { border-bottom: 0; flex: 1; min-width: 0; }
      .ms-espiar { flex: none; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; width: 60px; min-height: 44px; margin: 8px 8px 8px 0; border: 1px solid #e3ddd3; border-radius: 8px; background: #fff; color: #141414; font: 600 0.72rem/1 Inter, -apple-system, Roboto, Arial, sans-serif; cursor: pointer; }
      .ms-espiar:hover { background: #f6f3ee; }
      .ms-olho { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
      .ms-canal-tag { flex: none; font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #f6f3ee; color: #625c53; white-space: nowrap; }
      .ms-canal-tag.ms-canal-whatsapp1, .ms-canal-tag.ms-canal-whatsapp2 { background: #e8f3ec; color: #0f6b3f; }
      .ms-canal-tag.ms-canal-instagram { background: #fbe9f2; color: #8a1259; }
      .ms-espiando { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; background: #fff7e6; border-bottom: 1px solid #f0d9a8; color: #5c3a00; font-size: 0.85rem; font-weight: 600; }
      .ms-espiando .ms-btn { flex: none; min-height: 40px; }
      .ms-cfg-linha { display: flex; align-items: center; gap: 8px; min-height: 44px; font-weight: 600; margin: 4px 0 0; }
      .ms-cfg-linha input { width: 20px; height: 20px; flex: none; accent-color: #141414; }
      .ms-cfg-res { margin: 0 0 4px 28px; font-size: 0.78rem; }
      .ms-conv { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left; background: #fff; border: 0; border-bottom: 1px solid #f0ece2; padding: 10px 12px; min-height: 68px; cursor: pointer; font: inherit; box-sizing: border-box; }
      .ms-conv:hover, .ms-conv:focus-visible { background: #faf7f0; } .ms-conv[aria-current=true] { background: #f5efe0; }
      .ms-av { flex: none; width: 44px; height: 44px; border-radius: 50%; color: #fff; font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; }
      .ms-conv-corpo { flex: 1; min-width: 0; }
      .ms-conv .ms-l1 { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
      .ms-conv .ms-nome { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #111; }
      .ms-conv.nova .ms-nome, .ms-conv.nova .ms-previa { font-weight: 800; color: #000; }
      .ms-conv time { color: #555; font-size: 0.74rem; flex: none; } .ms-conv.nova time { color: #7a3a00; font-weight: 700; }
      .ms-conv .ms-l2 { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-top: 2px; }
      .ms-previa { color: #4a4a4a; font-size: 0.84rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
      .ms-badge { flex: none; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: var(--laranja, #E67E22); color: #0d0d0d; font-size: 0.76rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
      .ms-aguarda { display: block; font-size: 0.74rem; color: #8a3b00; font-weight: 700; margin-top: 1px; }
      .ms-tique { font-size: 0.8rem; letter-spacing: -2px; color: #555; margin-right: 4px; } .ms-tique.lida { color: #0b57b0; } .ms-tique.incerta { color: #a33; letter-spacing: 0; }
      .ms-vazio { color: #555; padding: 18px 16px; font-size: 0.88rem; line-height: 1.4; }
      .ms-vazio-conversa { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; color: #666; padding: 24px; }
      /* v7.21: aviso flutuante (antes ficava na coluna da lista e, no celular, sumia com a conversa aberta) */
      .ms-aviso { position: absolute; left: 12px; right: 12px; bottom: 88px; z-index: 7; margin: 0; padding: 10px 12px; border-radius: 8px; background: #fff3cd; color: #5a4300; font-size: 0.85rem; box-shadow: 0 6px 18px rgba(0,0,0,0.18); }
      .ms-aviso[hidden] { display: none; }
      /* conversa */
      .ms-cab { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid #e6e1d6; background: #fff; }
      .ms-cab .ms-quem { flex: 1; min-width: 0; } .ms-cab .ms-quem b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ms-cab .ms-quem span { display: block; font-size: 0.76rem; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ms-voltar { display: inline-flex; } @media (min-width: 860px) { .ms-voltar { display: none; } }
      .ms-fio-wrap { flex: 1; min-height: 0; position: relative; background: #efe9dc; }
      .ms-fio { position: absolute; inset: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; }
      .ms-dia { align-self: center; background: #fff; color: #444; font-size: 0.74rem; padding: 3px 10px; border-radius: 10px; margin: 8px 0 4px; box-shadow: 0 1px 1px rgba(0,0,0,0.08); }
      .ms-autor { display: block; font-size: 0.8rem; font-weight: 700; margin: 0 0 2px; white-space: normal; }
      .ms-autor small { font-weight: 500; color: #625c53; margin-left: 6px; }
      .ms-bolha { max-width: min(82%, 520px); padding: 7px 10px 5px; border-radius: 12px; font-size: 0.92rem; overflow-wrap: anywhere; white-space: pre-wrap; box-shadow: 0 1px 1px rgba(0,0,0,0.08); }
      .ms-bolha.entrada { align-self: flex-start; background: #fff; color: #111; border-top-left-radius: 4px; }
      .ms-bolha.saida { align-self: flex-end; background: #d8f3e3; color: #0d3b24; border-top-right-radius: 4px; }
      .ms-bolha.saida.pendente { opacity: 0.75; } .ms-bolha.falhou { background: #fde8e8; color: #5b1111; outline: 1px solid #d99; }
      .ms-bolha .ms-meta { display: flex; justify-content: flex-end; align-items: center; gap: 2px; font-size: 0.7rem; color: #555; margin-top: 2px; white-space: normal; }
      .ms-bolha .ms-erro { display: block; font-size: 0.78rem; margin-top: 4px; white-space: normal; }
      .ms-bolha .ms-erro button { min-height: 44px; padding: 0 10px; border: 0; background: transparent; font-weight: 700; color: #7a1f1f; text-decoration: underline; cursor: pointer; }
      .ms-tipo { font-style: italic; color: #555; } .ms-link { color: #0b57b0; }
      .ms-nova { position: absolute; right: 14px; bottom: 12px; min-height: 44px; padding: 0 14px; border: 0; border-radius: 22px; background: #0d0d0d; color: #fff; font-weight: 700; font-size: 0.85rem; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
      .ms-compor { display: flex; gap: 8px; align-items: flex-end; padding: 8px 10px calc(8px + env(safe-area-inset-bottom)); border-top: 1px solid #e6e1d6; background: #fff; }
      .ms-compor textarea { flex: 1 1 0; width: auto; min-width: 0; resize: none; min-height: 44px; max-height: 132px; padding: 10px 12px; border: 1px solid #ccc; border-radius: 22px; font: inherit; font-size: 0.95rem; line-height: 1.3; box-sizing: border-box; }
      .ms-enviar { flex: none; min-width: 64px; min-height: 44px; border: 0; border-radius: 22px; background: var(--laranja, #E67E22); color: #0d0d0d; font-weight: 800; cursor: pointer; padding: 0 16px; }
      .ms-enviar:disabled { background: #e6e1d6; color: #777; cursor: default; }
      .ms-dica { font-size: 0.74rem; color: #6b3f00; padding: 4px 12px 0; background: #fff; }
      /* painel de atendimento */
      .ms-painel { padding: 4px 12px 16px; font-size: 0.88rem; }
      .ms-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0; }
      .ms-card { border: 1px solid #e6e1d6; border-radius: 12px; padding: 10px; background: #fff; } .ms-card b { display: block; font-size: 1.35rem; font-family: "Poppins", sans-serif; } .ms-card span { font-size: 0.76rem; color: #555; }
      .ms-card.alerta b { color: #a33000; }
      .ms-horas { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; align-items: end; height: 80px; margin: 6px 0 2px; }
      .ms-horas i { display: block; background: var(--laranja, #E67E22); border-radius: 2px 2px 0 0; min-height: 2px; }
      .ms-horas-leg { display: flex; justify-content: space-between; font-size: 0.7rem; color: #555; }
      .ms-bolha .ms-ctx, .ms-bolha .ms-midia { white-space: normal; }
      .ms-ctx { display: flex; gap: 8px; align-items: stretch; margin: 0 0 6px; padding: 6px 8px; border-left: 4px solid #7a4a1e; border-radius: 8px; background: rgba(0,0,0,0.06); font-size: 0.8rem; }
      .ms-ctx-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .ms-ctx-txt b { color: #5c2e00; }
      .ms-ctx-leg { color: #333; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; } .ms-ctx-det { color: #555; font-size: 0.72rem; }
      .sheet-mensagens .ms-ctx-mini { flex: none; width: 56px; min-width: 56px; height: 74px; border: 0; padding: 0; border-radius: 8px; background: #d9d2c2 center / cover no-repeat; cursor: pointer; color: #333; font-size: 1.3rem; display: inline-flex; align-items: center; justify-content: center; }
      .ms-midia { margin: 0 0 4px; }
      .ms-img { display: block; width: min(260px, 100%); min-height: 120px; max-height: 340px; object-fit: cover; border-radius: 8px; background: #d9d2c2; cursor: zoom-in; }
      .ms-play { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 14px; border: 0; border-radius: 22px; background: rgba(0,0,0,0.08); color: inherit; font: inherit; font-weight: 700; cursor: pointer; }
      .ms-midia video { display: block; max-width: min(300px, 100%); max-height: 360px; border-radius: 8px; background: #000; } .ms-midia audio { display: block; width: min(280px, 100%); }
      .ms-luz { position: absolute; inset: 0; z-index: 8; background: rgba(0,0,0,0.92); display: flex; align-items: center; justify-content: center; padding: 12px; }
      .ms-stories { align-items: flex-start; overflow: auto; }
      .ms-st-caixa { background: #fff; color: #222; border-radius: 12px; padding: 14px; width: 100%; max-width: 560px; margin: 44px auto 0; display: flex; flex-direction: column; gap: 8px; }
      .ms-st-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
      .ms-st-cel { display: flex; flex-direction: column; gap: 4px; min-width: 0; } .ms-st-cel .ms-ctx-det { overflow-wrap: anywhere; }
      .sheet-mensagens .ms-st-item { width: 100%; aspect-ratio: 3 / 4; min-height: 100px; border: 0; padding: 0; border-radius: 10px; background: #d9d2c2 center / cover no-repeat; cursor: pointer; font-size: 1.6rem; color: #333; }
      .sheet-mensagens .ms-ver-stories { border: 0; background: none; padding: 6px 0 0; min-height: 32px; font-size: 0.72rem; color: #7a4a1e; text-decoration: underline; cursor: pointer; display: block; }
      .ms-luz img, .ms-luz video { max-width: 100%; max-height: 100%; object-fit: contain; }
      .sheet-mensagens .ms-luz-x { position: absolute; top: 10px; right: 10px; min-width: 44px; min-height: 44px; border: 0; border-radius: 50%; background: #fff; color: #111; font-size: 1.1rem; font-weight: 700; cursor: pointer; }
      .ms-stage { display: flex; gap: 10px; align-items: center; padding: 8px 12px; border-top: 1px solid #e6e1d6; background: #faf7f0; font-size: 0.82rem; }
      .ms-stage img, .ms-stage video { flex: none; width: 56px; height: 56px; object-fit: cover; border-radius: 8px; background: #d9d2c2; } .ms-stage audio { flex: 1; min-width: 0; height: 40px; }
      .ms-stage .ms-stage-nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ms-compor .ms-ico { width: 44px; flex: none; } .ms-compor .ms-ico.gravando { background: #c62828; color: #fff; width: auto; padding: 0 12px; font-size: 0.85rem; }
      @media (prefers-reduced-motion: no-preference) { .ms-conv, .ms-chip, .ms-aba { transition: background-color .15s; } }
    `;
    document.head.appendChild(s);
  }

  /* ---------- esqueleto ---------- */
  function montar() {
    if ($('overlay-mensagens')) return;
    css();
    const o = el('div', 'overlay-sheet'); o.id = 'overlay-mensagens';
    const sheet = el('div', 'sheet sheet-mensagens'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'ms-titulo');
    const app = el('div', 'ms-app'); app.id = 'ms-app'; app.dataset.vista = 'lista';
    const lat = el('section', 'ms-lateral'); lat.setAttribute('aria-label', 'Conversas');
    const topo = el('div', 'ms-topo');
    const h = el('h2', 'ms-titulo', '💬 Mensagens'); h.id = 'ms-titulo';
    const live = el('span', 'ms-ao-vivo', ''); live.id = 'ms-vivo'; live.setAttribute('role', 'status');
    const mais = botao('ms-ico', '⋯', 'menu-geral'); mais.setAttribute('aria-label', 'Mais opções'); mais.setAttribute('aria-haspopup', 'menu'); mais.id = 'ms-mais';
    const x = botao('ms-ico', '✕', 'fechar'); x.id = 'ms-fechar'; x.setAttribute('aria-label', 'Fechar mensagens');
    topo.append(h, live, mais, x);
    const abas = el('div', 'ms-abas'); abas.id = 'ms-abas'; abas.setAttribute('role', 'tablist');
    const filtros = el('div', 'ms-filtros'); filtros.id = 'ms-filtros';
    const busq = el('input', 'ms-busca'); busq.id = 'ms-busca'; busq.type = 'search'; busq.placeholder = 'Buscar por nome, número ou texto'; busq.setAttribute('aria-label', 'Buscar conversas');
    const estado = el('div'); estado.id = 'ms-estado-wrap';
    const av = el('p', 'ms-aviso'); av.id = 'ms-aviso'; av.hidden = true; av.setAttribute('role', 'status');
    const wrap = el('div', 'ms-lista-wrap'); wrap.id = 'ms-lista-wrap'; const ul = el('ul', 'ms-lista'); ul.id = 'ms-lista'; wrap.appendChild(ul);
    const extra = el('div'); extra.id = 'ms-extra'; wrap.appendChild(extra);
    lat.append(topo, abas, filtros, busq, estado, wrap);
    const conv = el('section', 'ms-conversa'); conv.id = 'ms-conversa'; conv.setAttribute('aria-label', 'Conversa');
    conv.appendChild(vazioConversa_());
    app.append(lat, conv); sheet.appendChild(app); sheet.appendChild(av); o.appendChild(sheet); document.body.appendChild(o);
    o.addEventListener('click', clique);
    // v7.21: liga/desliga "marcar como lida no celular" de cada canal
    o.addEventListener('change', async (ev) => {
      const chk = ev.target && ev.target.dataset && ev.target.dataset.cfgCanal ? ev.target : null; if (!chk || !cfgLeitura) return;
      const novo = Object.assign({}, cfgLeitura.config.lerCelular, { [chk.dataset.cfgCanal]: chk.checked });
      chk.disabled = true; const r = await worker_('/msg/config', 'POST', { lerCelular: novo }); chk.disabled = false;
      if (r.ok) { cfgLeitura.config = r.config; aviso_('Salvo.'); } else { chk.checked = !chk.checked; aviso_(r.erro || 'Não foi possível salvar agora.'); }
    });
    o.addEventListener('keydown', teclado);
    busq.addEventListener('input', () => { busca = busq.value; clearTimeout(timerBusca); timerBusca = setTimeout(() => carregarLista(true), 350); });
    document.addEventListener('click', (ev) => { if (menuAberto && !menuAberto.contains(ev.target) && !ev.target.closest('[data-ms^=menu-]')) fecharMenu(); }, true);
    ajustarViewport();
    if (window.visualViewport) { visualViewport.addEventListener('resize', ajustarViewport); visualViewport.addEventListener('scroll', ajustarViewport); }
    window.addEventListener('resize', ajustarViewport);
  }
  function vazioConversa_() { return el('div', 'ms-vazio-conversa', 'Escolha uma conversa para ler e responder.'); }
  /** Teclado virtual: a altura útil vem do visualViewport; assim o campo de mensagem nunca fica escondido. */
  function ajustarViewport() {
    const o = $('overlay-mensagens'); if (!o) return;
    const vv = window.visualViewport;
    if (larga()) { o.style.removeProperty('--ms-h'); o.style.removeProperty('--ms-top'); return; }
    const sheet = o.querySelector('.sheet-mensagens'); if (!sheet) return;
    sheet.style.setProperty('--ms-h', Math.round(vv ? vv.height : window.innerHeight) + 'px');
    sheet.style.setProperty('--ms-top', Math.round(vv ? vv.offsetTop : 0) + 'px');
    const f = $('ms-fio'); if (f && perto_(f, 140)) f.scrollTop = f.scrollHeight;
  }
  const perto_ = (e, px) => e.scrollHeight - e.scrollTop - e.clientHeight < (px || 80);

  /* ---------- menus ---------- */
  function fecharMenu() { if (menuAberto) { menuAberto.remove(); menuAberto = null; } }
  function abrirMenu(ancora, itens) {
    const ja = menuAberto && menuAberto.dataset.dono === ancora.id; fecharMenu(); if (ja) return;
    const m = el('div', 'ms-menu'); m.setAttribute('role', 'menu'); m.dataset.dono = ancora.id;
    itens.forEach((it) => { if (it === '-') { m.appendChild(el('hr')); return; } const b = botao('', it[0], it[1], it[2]); b.setAttribute('role', 'menuitem'); m.appendChild(b); });
    const alvo = ancora.closest('.sheet-mensagens'); alvo.appendChild(m);
    const r = ancora.getBoundingClientRect(), s = alvo.getBoundingClientRect();
    m.style.top = Math.round(r.bottom - s.top + 4) + 'px'; m.style.right = Math.max(8, Math.round(s.right - r.right)) + 'px';
    menuAberto = m; const p = m.querySelector('button'); if (p) p.focus();
  }
  function teclado(ev) {
    if (ev.key === 'Escape' && $('ms-luz')) { fecharLuz_(); ev.stopPropagation(); return; }
    if (ev.key === 'Escape' && menuAberto) { const d = menuAberto.dataset.dono, a = $(d); fecharMenu(); if (a) a.focus(); ev.stopPropagation(); }
  }

  /* ---------- cabeçalho, abas, filtros, estado ---------- */
  function desenharAbas() {
    const abas = $('ms-abas'); if (!abas) return;
    abas.textContent = '';
    ABAS.forEach(([id, nome]) => {
      const c = contagemDe_(id);
      const b = botao('ms-aba', '', 'aba', { canal: id }); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(id === canal));
      b.appendChild(document.createTextNode(nome)); b.appendChild(el('small', '', c.conversas + (c.conversas === 1 ? ' conversa' : ' conversas')));
      if (c.nao_lidas > 0) { const p = el('span', 'ms-pt', c.nao_lidas > 99 ? '99+' : String(c.nao_lidas)); p.setAttribute('aria-label', c.nao_lidas + ' não lidas'); b.appendChild(p); }
      abas.appendChild(b);
    });
  }
  function contagemDe_(id) {
    const vazio = { conversas: 0, nao_lidas: 0, sem_resposta: 0, grupos: 0 };
    if (contagens && contagens[id]) return Object.assign({}, vazio, contagens[id]);
    if (id === 'todos') return CANAIS.reduce((t, [k]) => { const c = contagemDe_(k); return { conversas: t.conversas + c.conversas, nao_lidas: t.nao_lidas + c.nao_lidas, sem_resposta: t.sem_resposta + c.sem_resposta, grupos: t.grupos + c.grupos }; }, vazio);
    return resumo && resumo.canais[id] ? Object.assign({}, vazio, { conversas: resumo.canais[id].conversas, nao_lidas: resumo.canais[id].naoLidas || 0 }) : vazio;
  }
  function desenharFiltros() {
    const f = $('ms-filtros'); if (!f) return;
    const c = contagemDe_(canal);
    f.textContent = '';
    FILTROS.forEach(([id, nome]) => {
      const n = id === 'nao_lidas' ? c.nao_lidas : id === 'lidas' ? Math.max(0, c.conversas - c.nao_lidas) : id === 'sem_resposta' ? c.sem_resposta : id === 'grupos' ? c.grupos : 0;
      const b = botao('ms-chip', nome + (n > 0 ? ' · ' + n : ''), 'filtro', { filtro: id }); b.setAttribute('aria-pressed', String(id === filtro)); f.appendChild(b);
    });
  }
  function ligadoOuPronto() {
    if (canal === 'todos') return true;
    const c = resumo && resumo.canais[canal]; if (!c) return false;
    return canal === 'instagram' ? !!c.pronto && !!c.ultima : !!c.ligadoEm;
  }
  function desenharEstado() {
    const w = $('ms-estado-wrap'); if (!w) return; w.textContent = '';
    if (painel === 'leitura') { w.appendChild(caixaLeitura_()); return; }
    if (canal === 'todos') return;   // a aba Todas não tem conexão própria: a de cada canal fica na aba dele
    const c = resumo && resumo.canais[canal]; if (!c) return;
    const aberto = painel === 'conexao' || !ligadoOuPronto();
    if (aberto) { w.appendChild(caixaEstado()); return; }
    const e = el('div', 'ms-estado');
    if (canal !== 'instagram' && !c.v2 && !c.pausado) {
      e.appendChild(el('span', 'ms-pausa', 'Falta ativar: mensagens que você envia e entregue/lida'));
      e.appendChild(botao('', 'Ativar agora', 'ligar', { slot: canal === 'whatsapp1' ? '1' : '2', rel: '1' }));
    } else {
      e.appendChild(el('span', c.pausado ? 'ms-pausa' : 'ms-ok', c.pausado ? 'Gravação pausada' : (canal === 'instagram' ? 'Gravando mensagens' : 'Gravando desde ' + hora(c.ligadoEm))));
      e.appendChild(botao('', 'Conexão', 'conexao'));
    }
    w.appendChild(e);
  }
  function caixaEstado() {
    const caixa = el('div', 'ms-caixa'), c = resumo && resumo.canais[canal];
    if (canal === 'instagram') {
      if (!c.pronto) {
        caixa.appendChild(el('p', 'ms-pausa', 'Ainda não ligado.'));
        caixa.appendChild(el('p', '', 'O Instagram só entrega mensagens por um webhook da Meta. Cole abaixo a “Chave secreta do app do Instagram” (Meta → caso de uso API do Instagram → Mostrar). Ela fica guardada no servidor e não volta para a tela. Depois disso, o endereço do webhook aparece aqui.'));
        const campo = el('input', 'ms-copia'); campo.id = 'ms-segredo'; campo.type = 'password'; campo.autocomplete = 'new-password'; campo.setAttribute('aria-label', 'Chave secreta do app do Instagram'); campo.placeholder = 'Chave secreta do app do Instagram';
        const l = el('div', 'ms-linha'); l.appendChild(botao('ms-btn prim', 'Salvar chave', 'segredo'));
        caixa.append(campo, l);
      } else {
        caixa.appendChild(el('p', c.ultima ? 'ms-ok' : '', c.ultima ? 'Gravando mensagens.' : 'Pronto para receber. Cole este endereço no webhook de Instagram do app da Meta:'));
        const i = el('input', 'ms-copia'); i.readOnly = true; i.value = resumo.urlInstagram; i.setAttribute('aria-label', 'Endereço do webhook do Instagram'); caixa.appendChild(i);
        const dg = el('p', '', 'Conferindo a assinatura da conta…'); dg.id = 'ms-diag'; caixa.appendChild(dg);
        const l = el('div', 'ms-linha'); l.appendChild(botao('ms-btn prim', 'Assinar mensagens desta conta', 'assinar')); caixa.appendChild(l);
        diagnosticar();
      }
    } else {
      const n = canal === 'whatsapp1' ? 1 : 2;
      if (!c.ligadoEm) {
        caixa.appendChild(el('p', 'ms-pausa', 'Ainda não está gravando.'));
        caixa.appendChild(el('p', '', 'Ao ligar, o recebimento de mensagens desta instância da Wafly passa a vir para o servidor da loja e as conversas começam a ser guardadas daqui para frente. O histórico antigo não é buscado.'));
        const l = el('div', 'ms-linha'); l.appendChild(botao('ms-btn prim', 'Ligar gravação', 'ligar', { slot: String(n) })); caixa.appendChild(l);
      } else {
        caixa.appendChild(el('p', c.pausado ? 'ms-pausa' : 'ms-ok', c.pausado ? 'Gravação pausada.' : 'Gravando desde ' + hora(c.ligadoEm) + '.'));
        caixa.appendChild(el('p', '', 'Para ver o que a loja envia pelo celular e quando o cliente recebe/lê, a Wafly precisa avisar o servidor. Toque em “Ativar envios e leituras” uma vez.'));
        const l = el('div', 'ms-linha');
        l.appendChild(botao('ms-btn', c.pausado ? 'Retomar gravação' : 'Pausar gravação', 'pausar', { pausar: c.pausado ? '0' : '1' }));
        l.appendChild(botao('ms-btn', 'Ativar envios e leituras', 'ligar', { slot: String(n), rel: '1' }));
        l.appendChild(botao('ms-btn', 'Fechar', 'conexao'));
        caixa.appendChild(l);
      }
    }
    return caixa;
  }
  /* v7.21: configuração "marcar como lida no celular" por canal + o resultado da última tentativa */
  function caixaLeitura_() {
    const caixa = el('div', 'ms-caixa');
    caixa.appendChild(el('p', '', 'Ao abrir uma conversa normalmente, ela fica lida aqui no painel e, com a opção ligada, também no celular oficial (o WhatsApp/Instagram da loja mostra como lida e o cliente vê os dois tiques azuis, se ele tiver isso ligado). O botão “Espiar” nunca marca como lida, nem aqui nem no celular.'));
    if (!cfgLeitura) { caixa.appendChild(el('p', '', 'Carregando…')); carregarCfgLeitura_(); return caixa; }
    CANAIS.forEach(([id, nome]) => {
      const lab = el('label', 'ms-cfg-linha'), chk = el('input'); chk.type = 'checkbox'; chk.checked = !!cfgLeitura.config.lerCelular[id]; chk.dataset.cfgCanal = id;
      lab.append(chk, document.createTextNode(' ' + nome + ': marcar como lida no celular ao abrir'));
      caixa.appendChild(lab);
      const u = cfgLeitura.ultimaLeitura && cfgLeitura.ultimaLeitura[id];
      if (u) caixa.appendChild(el('p', 'ms-cfg-res ' + (u.ok ? 'ms-ok' : 'ms-pausa'), (u.ok ? 'Última confirmação no celular: ' : 'Última tentativa não confirmada: ') + hora(u.em) + (u.ok ? '' : ' — ' + (u.erro || 'sem resposta'))));
    });
    const l = el('div', 'ms-linha'); l.appendChild(botao('ms-btn', 'Fechar', 'leitura-cfg')); caixa.appendChild(l);
    return caixa;
  }
  async function carregarCfgLeitura_() {
    const r = await worker_('/msg/config', 'GET');
    cfgLeitura = r.ok ? r : { config: { lerCelular: { whatsapp1: true, whatsapp2: true, instagram: true } }, ultimaLeitura: {} };
    if (painel === 'leitura') desenharEstado();
  }
  async function diagnosticar() {
    const r = await worker_('/msg/instagram/situacao', 'GET'), d = $('ms-diag'); if (!d) return;
    if (!r.ok) { d.textContent = r.erro || 'Não foi possível conferir agora.'; return; }
    const u = r.ultimaTentativa, t = [];
    if (!r.token) t.push('Instagram não conectado em Conexões: cole o token longo (IGAA…).');
    else if (r.assinada === true) t.push('Conta assinada para receber mensagens.');
    else if (r.assinada === false) t.push('Conta NÃO assinada: toque em “Assinar mensagens desta conta”.');
    else t.push('Não consegui conferir a assinatura (' + (r.erroMeta || 'sem resposta') + ').');
    if (!u) t.push('A Meta ainda não enviou nenhum aviso para este endereço.');
    else if (u.res === 'assinatura') t.push('Último aviso da Meta (' + hora(u.em) + ') foi recusado: a chave secreta do app está diferente da Meta.');
    else t.push('Último aviso da Meta: ' + hora(u.em) + ' (' + (u.itens || 0) + ' mensagem(ns) lida(s), ' + (u.novas || 0) + ' nova(s)).' + (u.forma ? ' Formato recebido: ' + u.forma : ''));
    if (u && u.forma && /messaging:read|messaging:delivery|messaging:reaction/.test(u.forma) && !/message\{/.test(u.forma)) t.push('A Meta só avisou LEITURAS, nenhuma mensagem. Confira: (1) no Instagram da loja, Configurações → Mensagens e respostas a stories → Ferramentas conectadas → ligar “Permitir acesso às mensagens”; (2) no app da Meta → Instagram → Configurar webhooks → campo “messages” ligado; (3) quem envia precisa ter função no app (ele está não publicado).');
    d.textContent = t.join(' ');
  }

  /* ---------- lista de conversas (atualização por chave: não perde rolagem nem foco) ---------- */
  function linhaConversa(c) {
    let li = elConvs.get(c.id);
    if (!li) { li = el('li', 'ms-conv-li'); const b = botao('ms-conv', '', 'abrir', { id: String(c.id) }); li.appendChild(b); elConvs.set(c.id, li); }
    // v7.21: "Espiar" (só nas não lidas): lê sem marcar como lida aqui nem no celular
    let esp = li.querySelector('.ms-espiar');
    if (c.nao_lidas > 0 && !esp) { esp = botao('ms-espiar', '', 'espiar', { id: String(c.id) }); esp.innerHTML = '<svg class="ms-olho" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg><span>Espiar</span>'; esp.setAttribute('aria-label', 'Espiar ' + rotuloContato(c) + ' sem marcar como lida'); li.appendChild(esp); }
    else if (!(c.nao_lidas > 0) && esp) esp.remove();
    const b = li.firstChild, nova = c.nao_lidas > 0, saiu = c.ult_dir === 'saida', espera = c.ult_dir === 'entrada' && !c.grupo;
    b.className = 'ms-conv' + (nova ? ' nova' : ''); if (aberta && aberta.id === c.id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    const assinatura = [canal === 'todos' ? c.canal : '', c.nome, c.ultima_em, c.previa, c.nao_lidas, c.ult_dir, c.ult_status, espera ? Math.floor(Date.now() / 60000) : '', aberta && aberta.id === c.id].join('|');
    if (li.dataset.ass === assinatura) return li;
    li.dataset.ass = assinatura; b.textContent = '';
    const av = el('span', 'ms-av', iniciais(c)); av.style.background = corAvatar(c); av.setAttribute('aria-hidden', 'true');
    const corpo = el('span', 'ms-conv-corpo');
    const l1 = el('span', 'ms-l1'); l1.appendChild(el('span', 'ms-nome', rotuloContato(c)));
    if (canal === 'todos' && NOME_CANAL_[c.canal]) l1.appendChild(el('span', 'ms-canal-tag ms-canal-' + c.canal, NOME_CANAL_[c.canal]));
    l1.appendChild(el('time', '', horaLista(c.ultima_em)));
    const l2 = el('span', 'ms-l2'); const pv = el('span', 'ms-previa');
    if (saiu) { pv.appendChild(selo(c.ult_status || 'enviada')); pv.appendChild(document.createTextNode('Você: ')); }
    const pr = /^\[(.+)\]$/.exec(c.previa || ''); pv.appendChild(document.createTextNode(pr ? (TIPO_ROTULO[pr[1]] || c.previa) : (c.previa || ''))); l2.appendChild(pv);
    if (nova) { const bd = el('span', 'ms-badge', c.nao_lidas > 99 ? '99+' : String(c.nao_lidas)); bd.setAttribute('aria-label', c.nao_lidas + ' não lidas'); l2.appendChild(bd); }
    corpo.append(l1, l2);
    if (espera) corpo.appendChild(el('span', 'ms-aguarda', 'Falta responder · há ' + espera_(c.ult_entrada_em || c.ultima_em)));
    b.append(av, corpo);
    return li;
  }
  function pintarLista() {
    const ul = $('ms-lista'), extra = $('ms-extra'); if (!ul || painel === 'metricas') return;
    const vivos = new Set(lista.map((c) => c.id));
    elConvs.forEach((li, id) => { if (!vivos.has(id)) { li.remove(); elConvs.delete(id); } });
    let ref = ul.firstChild;
    lista.forEach((c) => { const li = linhaConversa(c); if (li !== ref) ul.insertBefore(li, ref); else ref = ref.nextSibling; });
    extra.textContent = '';
    if (!lista.length) {
      const m = busca.trim() ? 'Nenhuma conversa encontrada.' : filtro === 'nao_lidas' ? 'Nenhuma conversa não lida. 🎉' : filtro === 'lidas' ? 'Nenhuma conversa lida ainda.' : filtro === 'sem_resposta' ? 'Ninguém esperando resposta agora. 🎉' : filtro === 'grupos' ? 'Nenhum grupo neste canal.' : 'Ainda não chegou nenhuma mensagem neste canal.';
      extra.appendChild(el('p', 'ms-vazio', m));
    }
  }
  async function carregarLista(reset) {
    const mine = ++seqLista, c0 = canal, f0 = filtro, b0 = busca.trim();
    const r = await worker_('/msg/conversas?canal=' + encodeURIComponent(canal) + '&filtro=' + encodeURIComponent(filtro) + (b0 ? '&busca=' + encodeURIComponent(b0) : ''), 'GET');
    if (mine !== seqLista || c0 !== canal || f0 !== filtro || b0 !== busca.trim()) return;       // resposta velha de outra aba/filtro/busca: ignora
    if (!r.ok) { if (reset || !lista.length) { lista = []; pintarLista(); $('ms-extra').textContent = ''; $('ms-extra').appendChild(el('p', 'ms-vazio', r.erro || 'Não foi possível carregar agora.')); } return; }
    lista = r.conversas; contagens = Object.assign({}, contagens || {}, { [canal]: r.contagens }); cursor = r.cursor || cursor;
    desenharFiltros(); desenharAbas(); pintarLista();
  }

  /* ---------- conversa ---------- */
  /* ---- mídia: baixada com a sessão (nunca por link público) e guardada só enquanto a conversa está aberta ---- */
  function midiaBlob_(id, story, post) {
    const k = post ? 'p' + post + '-' + id : id + (story ? '|c' : '');
    if (blobs.has(k)) return blobs.get(k);
    const sess = (typeof getSessao === 'function' && getSessao()) || null;
    const p = (async () => {
      if (!sess) throw new Error('sem sessão');
      const r = await fetch(INSTAGRAM_URL + '/msg/midia?' + (post ? 'post=' + encodeURIComponent(post) + '&n=' + encodeURIComponent(id) : 'id=' + encodeURIComponent(id) + (story ? '&ctx=1' : '')), { headers: { 'X-TK-Whats': sess.whatsapp, 'X-TK-Sessao': sess.sessao } });
      if (!r.ok) { let e = null; try { e = await r.json(); } catch (x) { /* corpo vazio */ } throw new Error((e && e.erro) || 'Não foi possível carregar.'); }
      return URL.createObjectURL(await r.blob());
    })();
    p.catch(() => { blobs.delete(k); });
    blobs.set(k, p); return p;
  }
  function limparBlobs_() { blobs.forEach((p) => { p.then((u) => { if (typeof u === 'string' && u.indexOf('blob:') === 0) URL.revokeObjectURL(u); }, () => {}); }); blobs.clear(); }
  const obsMidia = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { obsMidia.unobserve(e.target); if (e.target._carregar) e.target._carregar(); } }), { rootMargin: '240px' }) : null;
  function carregarImg_(img, id, story) {
    img._carregar = () => {
      midiaBlob_(id, story).then((u) => {
        img.onload = () => { const fio = $('ms-fio'); if (fio && Date.now() < colarFimAte) fio.scrollTop = fio.scrollHeight; };
        img.src = u; img.removeAttribute('data-erro');
      }, () => { img.alt = 'Imagem indisponível'; img.dataset.erro = '1'; });
    };
    if (obsMidia) obsMidia.observe(img); else img._carregar();
  }
  function fecharLuz_() { const l = $('ms-luz'); if (l) l.remove(); }
  function abrirLuz_(tipo, url) {
    fecharLuz_(); const sheet = document.querySelector('.sheet-mensagens'); if (!sheet) return;
    const l = el('div', 'ms-luz'); l.id = 'ms-luz'; l.setAttribute('role', 'dialog'); l.setAttribute('aria-label', tipo === 'video' ? 'Vídeo' : 'Imagem ampliada');
    let m; if (tipo === 'video') { m = el('video'); m.controls = true; m.autoplay = true; m.playsInline = true; } else { m = el('img'); m.alt = 'Imagem ampliada'; }
    m.src = url; const x = botao('ms-luz-x', '✕', 'luz-fechar'); x.setAttribute('aria-label', 'Fechar');
    l.append(m, x); sheet.appendChild(l); x.focus();
  }
  /* Wafly não informa qual story foi respondido: mostramos os stories no ar antes da mensagem para a equipe reconhecer. */
  async function abrirStories_(m) {
    fecharLuz_(); const sheet = document.querySelector('.sheet-mensagens'); if (!sheet || !aberta) return;
    const l = el('div', 'ms-luz ms-stories'); l.id = 'ms-luz'; l.setAttribute('role', 'dialog'); l.setAttribute('aria-label', 'Stories no ar');
    const caixa = el('div', 'ms-st-caixa'); caixa.appendChild(el('b', '', 'Stories no ar antes desta mensagem'));
    caixa.appendChild(el('span', 'ms-ctx-det', 'O WhatsApp não informa qual story foi respondido. Estes são os que estavam publicados nas 26 h anteriores.'));
    const grade = el('div', 'ms-st-grade'); grade.appendChild(el('span', 'ms-vazio', 'Carregando…')); caixa.appendChild(grade);
    const x = botao('ms-luz-x', '✕', 'luz-fechar'); x.setAttribute('aria-label', 'Fechar');
    l.append(caixa, x); sheet.appendChild(l); x.focus();
    const r = await worker_('/msg/stories?conversa=' + encodeURIComponent(aberta.id) + '&em=' + encodeURIComponent(m.enviada_em || ''), 'GET');
    if (!$('ms-luz') || $('ms-luz') !== l) return;
    grade.textContent = '';
    if (!r.ok) { grade.appendChild(el('span', 'ms-vazio', r.erro || 'Não foi possível carregar agora.')); return; }
    if (!r.stories.length) { grade.appendChild(el('span', 'ms-vazio', 'Nenhum story publicado pelo sistema nesse período.')); return; }
    r.stories.forEach((st) => {
      const video = st.tipo === 'video', c = botao('ms-st-item', video ? '▶' : '', 'x'); c.removeAttribute('data-ms');
      c.setAttribute('aria-label', 'Ver story publicado ' + hora(st.publicado_em));
      c.addEventListener('click', async () => { try { abrirLuz_(video ? 'video' : 'imagem', await midiaBlob_(0, false, st.id)); } catch (e) { aviso_('Não consegui abrir este story.'); } });
      if (!video) { c._carregar = () => { midiaBlob_(0, false, st.id).then((u) => { c.style.backgroundImage = 'url("' + u + '")'; }, () => { c.textContent = '🖼'; }); }; c._carregar(); }
      const w = el('div', 'ms-st-cel'); w.appendChild(c); w.appendChild(el('span', 'ms-ctx-det', hora(st.publicado_em) + (st.legenda ? ' · ' + st.legenda : ''))); grade.appendChild(w);
    });
  }
  const mmss = (n) => { n = Math.max(0, Math.round(Number(n) || 0)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); };
  function blocoStory_(m) {
    const q = el('div', 'ms-ctx'), col = el('div', 'ms-ctx-txt');
    col.appendChild(el('b', '', m.direcao === 'saida' ? 'Você respondeu a um story' : 'Respondeu ao seu story'));
    if (m.ctx_legenda) col.appendChild(el('span', 'ms-ctx-leg', m.ctx_legenda));
    const det = []; if (m.ctx_em) det.push('publicado ' + hora(m.ctx_em)); if (m.ctx_aprox) det.push('story provável (havia mais de um no ar)');
    if (!m.ctx_midia) det.push('não encontrei a imagem deste story');
    if (det.length) col.appendChild(el('span', 'ms-ctx-det', det.join(' · ')));
    q.appendChild(col);
    if (m.ctx_midia && typeof m.id === 'number') {
      const video = m.ctx_mtipo === 'video', mini = botao('ms-ctx-mini', video ? '▶' : '', 'story-ver', { id: String(m.id), video: video ? '1' : '' });
      mini.setAttribute('aria-label', 'Ver o story respondido');
      if (!video) { mini._carregar = () => { midiaBlob_(m.id, true).then((u) => { mini.style.backgroundImage = 'url("' + u + '")'; }, () => { mini.textContent = '🖼'; }); }; if (obsMidia) obsMidia.observe(mini); else mini._carregar(); }
      q.appendChild(mini);
    }
    return q;
  }
  function blocoCitacao_(m) {
    const q = el('div', 'ms-ctx'), col = el('div', 'ms-ctx-txt');
    col.appendChild(el('b', '', m.ctx_qdir === 'saida' ? 'Você' : 'Cliente'));
    col.appendChild(el('span', 'ms-ctx-leg', m.ctx_texto || TIPO_ROTULO[m.ctx_qtipo] || '[' + (m.ctx_qtipo || 'mensagem') + ']'));
    q.appendChild(col); return q;
  }
  function blocoMidia_(m) {
    const tipo = m.tipo, local = m.localUrl || '';
    if (!local && !(m.midia && typeof m.id === 'number')) return null;
    const w = el('div', 'ms-midia');
    if (tipo === 'imagem' || tipo === 'figurinha') {
      const img = el('img', 'ms-img'); img.alt = tipo === 'figurinha' ? 'Figurinha' : 'Foto'; img.loading = 'lazy';
      if (local) img.src = local; else carregarImg_(img, m.id, false);
      img.addEventListener('click', () => { if (img.src && !img.dataset.erro) abrirLuz_('imagem', img.src); });
      w.appendChild(img); return w;
    }
    if (tipo === 'vídeo' || tipo === 'áudio') {
      const video = tipo === 'vídeo';
      const montarPlayer = (u, auto) => { const p = el(video ? 'video' : 'audio'); p.controls = true; p.preload = 'metadata'; if (video) p.playsInline = true; p.src = u; w.textContent = ''; w.appendChild(p); if (auto) { const r = p.play(); if (r && r.catch) r.catch(() => {}); } };
      if (local) { montarPlayer(local, false); return w; }
      const bt = botao('ms-play', '', 'x'); bt.removeAttribute('data-ms'); bt.textContent = (video ? '▶ Vídeo' : '▶ Áudio') + (m.midia_seg ? ' · ' + mmss(m.midia_seg) : '');
      bt.addEventListener('click', async () => { bt.disabled = true; bt.textContent = 'Carregando…'; try { montarPlayer(await midiaBlob_(m.id, false), true); } catch (e) { bt.disabled = false; bt.textContent = 'Não foi possível carregar. Tentar de novo'; } });
      w.appendChild(bt); return w;
    }
    const bt = botao('ms-play', '📄 Baixar ' + (TIPO_ROTULO[tipo] ? tipo : 'arquivo'), 'x'); bt.removeAttribute('data-ms');
    bt.addEventListener('click', async () => { bt.disabled = true; try { const u = await midiaBlob_(m.id, false), a = document.createElement('a'); a.href = u; a.download = 'arquivo'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { aviso_('Não foi possível baixar o arquivo.'); } bt.disabled = false; });
    w.appendChild(bt); return w;
  }
  /* v7.20: em grupo, quem mandou cada mensagem (nome do WhatsApp; sem nome, o número) com uma cor por pessoa, como no WhatsApp.
   * Menções "@número" viram "@Nome" quando a pessoa já falou na conversa. Mensagens gravadas antes desta versão não têm o autor. */
  const CORES_AUTOR_ = ['#0f6b3f', '#8a1259', '#0b5d8a', '#7a4a00', '#5b3d99', '#a52714', '#00695c', '#6b5b00'];
  const foneBonito_ = (d) => { d = String(d || '').replace(/\D/g, ''); if (d.length === 13 && d.startsWith('55')) return '(' + d.slice(2, 4) + ') ' + d.slice(4, 9) + '-' + d.slice(9); if (d.length === 12 && d.startsWith('55')) return '(' + d.slice(2, 4) + ') ' + d.slice(4, 8) + '-' + d.slice(8); return d ? '+' + d : ''; };
  const ehGrupo_ = () => !!(aberta && Number(aberta.grupo) === 1);
  function nomesDoGrupo_() {
    const mapa = {};
    msgs.forEach((x) => { if (x.autor_nome) { if (x.autor_lid) mapa[x.autor_lid] = x.autor_nome; if (x.autor_fone) mapa[x.autor_fone] = x.autor_nome; } });
    return mapa;
  }
  function trocarMencoes_(texto) {
    if (!ehGrupo_() || texto.indexOf('@') === -1) return texto;
    const mapa = nomesDoGrupo_();
    return texto.replace(/@(\d{8,})/g, (t, n) => mapa[n] ? '@' + mapa[n] : (n.length >= 14 ? '@alguém do grupo' : '@' + foneBonito_(n)));
  }
  function autorEl_(m) {
    if (!ehGrupo_() || m.direcao !== 'entrada' || !(m.autor_nome || m.autor_fone)) return null;
    // cor pela ordem em que a pessoa aparece na conversa: as 8 primeiras nunca repetem
    const chave = (x) => x.autor_fone || x.autor_lid || x.autor_nome || '', ordem = [];
    msgs.slice().sort((x, y) => (x.enviada_em || '').localeCompare(y.enviada_em || '')).forEach((x) => { const k = chave(x); if (k && ordem.indexOf(k) === -1) ordem.push(k); });
    const a = el('span', 'ms-autor', m.autor_nome || foneBonito_(m.autor_fone)); a.style.color = CORES_AUTOR_[Math.max(0, ordem.indexOf(chave(m))) % CORES_AUTOR_.length];
    if (m.autor_nome && m.autor_fone) a.appendChild(el('small', '', foneBonito_(m.autor_fone)));
    return a;
  }
  function bolha(m) {
    let b = elMsgs.get(m.id);
    const ass = [m.autor_nome || '', m.autor_fone || '', ehGrupo_() ? Object.keys(nomesDoGrupo_()).length : 0, m.texto, m.tipo, m.status, m.erro || '', m.midia, m.localUrl || '', m.ctx_tipo || '', m.ctx_midia, m.ctx_texto || '', m.ctx_legenda || '', m.ctx_aprox].join('|');
    if (b && b.dataset.ass === ass) return b;
    if (!b) { b = el('div'); elMsgs.set(m.id, b); }
    b.dataset.ass = ass; b.dataset.id = String(m.id); b.textContent = '';
    const falhou = m.status === 'falhou';
    b.className = 'ms-bolha ' + (m.direcao === 'saida' ? 'saida' : 'entrada') + (m.status === 'pendente' ? ' pendente' : '') + (falhou ? ' falhou' : '');
    const autor = autorEl_(m); if (autor) b.appendChild(autor);
    if (m.ctx_tipo === 'story') b.appendChild(blocoStory_(m)); else if (m.ctx_tipo === 'resposta' && (m.ctx_texto || m.ctx_qtipo)) b.appendChild(blocoCitacao_(m));
    const mid = blocoMidia_(m); if (mid) b.appendChild(mid);
    if (m.texto) linkar(b, trocarMencoes_(m.texto));
    if (m.tipo && m.tipo !== 'texto' && !mid) b.appendChild(el('span', 'ms-tipo', (m.texto ? ' ' : '') + (TIPO_ROTULO[m.tipo] || '[' + m.tipo + ']') + (m.midia === 0 && m.direcao === 'entrada' && ['imagem', 'vídeo', 'áudio'].indexOf(m.tipo) >= 0 ? ' (arquivo não disponível)' : '')));
    if (m.direcao === 'entrada' && typeof m.id === 'number' && !m.ctx_tipo && m.tipo === 'texto' && m.texto && m.texto.length <= 80 && !ehGrupo_() && (canalDaConversa() === 'whatsapp1' || canalDaConversa() === 'whatsapp2')) b.appendChild(botao('ms-ver-stories', 'Foi resposta a um story? Ver stories no ar', 'stories-no-ar', { id: String(m.id) }));
    const meta = el('span', 'ms-meta'); meta.appendChild(el('time', '', m.enviada_em ? hm(new Date(m.enviada_em)) : ''));
    if (m.direcao === 'saida') meta.appendChild(selo(m.status || 'enviada'));
    b.appendChild(meta);
    if (m.status === 'incerta') b.appendChild(el('span', 'ms-erro', 'Sem confirmação. Confira no ' + (canalDaConversa() === 'instagram' ? 'Instagram' : 'WhatsApp') + ' antes de enviar de novo.'));
    if (falhou) { const e = el('span', 'ms-erro', (m.erro || 'Não enviada.') + ' '); e.appendChild(botao('', 'Tentar de novo', 'reenviar', { tmp: String(m.id) })); e.appendChild(botao('', 'Descartar', 'descartar', { tmp: String(m.id) })); b.appendChild(e); }
    return b;
  }
  const canalDaConversa = () => (aberta && aberta.canal) || canal;
  function pintarFio(forcarFim) {
    const fio = $('ms-fio'); if (!fio) return;
    const fim = forcarFim || perto_(fio, 90);
    let ancora = null, ancoraY = 0;                       // quem lê o meio/começo: prende a primeira bolha visível, para nada pular
    if (!fim) for (const f of fio.children) { if (f.offsetTop + f.offsetHeight > fio.scrollTop) { ancora = f; ancoraY = f.offsetTop - fio.scrollTop; break; } }
    const ordenadas = msgs.slice().sort((a, b) => (a.enviada_em || '').localeCompare(b.enviada_em || '') || (typeof a.id === 'number' && typeof b.id === 'number' ? a.id - b.id : 0));
    const vivos = new Set(ordenadas.map((m) => m.id));
    elMsgs.forEach((b, id) => { if (!vivos.has(id)) { b.remove(); elMsgs.delete(id); } });
    fio.querySelectorAll('.ms-dia').forEach((d) => d.remove());
    let ref = fio.firstChild, ultimoDia = '';
    ordenadas.forEach((m) => {
      const dia = m.enviada_em ? new Date(m.enviada_em).toDateString() : '';
      if (dia && dia !== ultimoDia) { ultimoDia = dia; const d = el('div', 'ms-dia', diaRotulo(m.enviada_em)); fio.insertBefore(d, ref); }
      const b = bolha(m);
      if (b !== ref) fio.insertBefore(b, ref); else ref = ref.nextSibling;
    });
    if (fim) { colarFimAte = Date.now() + 2500; fio.scrollTop = fio.scrollHeight; novasAbaixo = 0; } else if (ancora && ancora.isConnected) fio.scrollTop = ancora.offsetTop - ancoraY;
    atualizarPill();
  }
  function atualizarPill() { const p = $('ms-nova'); if (!p) return; p.hidden = novasAbaixo <= 0; p.textContent = '↓ ' + novasAbaixo + (novasAbaixo === 1 ? ' nova mensagem' : ' novas mensagens'); }
  function cabecalhoConversa(c) {
    const cab = el('div', 'ms-cab');
    const v = botao('ms-ico ms-voltar', '←', 'voltar'); v.setAttribute('aria-label', 'Voltar para as conversas');
    const av = el('span', 'ms-av', iniciais(c)); av.style.background = corAvatar(c); av.setAttribute('aria-hidden', 'true');
    const q = el('span', 'ms-quem'); q.appendChild(el('b', '', rotuloContato(c)));
    q.appendChild(el('span', '', NOME_CANAL[c.canal] + (c.grupo ? ' · grupo' : (/^\d{10,15}$/.test(c.contato) ? ' · +' + c.contato : ''))));
    const mais = botao('ms-ico', '⋯', 'menu-conversa'); mais.id = 'ms-mais-conv'; mais.setAttribute('aria-label', 'Opções da conversa'); mais.setAttribute('aria-haspopup', 'menu');
    cab.append(v, av, q, mais); return cab;
  }
  function limiteTexto(c) { return c.canal === 'instagram' ? 1000 : 4000; }
  function dicaComposer(c) {
    if (c.canal === 'instagram' && c.ult_entrada_em && Date.now() - Date.parse(c.ult_entrada_em) > 86400000) return 'Já passaram mais de 24 h da última mensagem deste cliente: o Instagram pode recusar a resposta.';
    if (c.canal !== 'instagram' && c.grupo) return 'Esta mensagem vai para todo o grupo.';
    return '';
  }
  function montarConversa(c) {
    const pai = $('ms-conversa'); pai.textContent = '';
    pai.appendChild(cabecalhoConversa(c));
    if (espiando) {
      const e = el('div', 'ms-espiando'); e.setAttribute('role', 'status');
      e.appendChild(el('span', '', 'Espiando: não marca como lida aqui nem no celular.'));
      e.appendChild(botao('ms-btn prim', 'Atender', 'atender')); pai.appendChild(e);
    }
    const wrap = el('div', 'ms-fio-wrap'), fio = el('div', 'ms-fio'); fio.id = 'ms-fio'; fio.setAttribute('role', 'log'); fio.setAttribute('aria-live', 'polite'); fio.setAttribute('aria-label', 'Mensagens da conversa');
    const pill = botao('ms-nova', '', 'fim'); pill.id = 'ms-nova'; pill.hidden = true;
    wrap.append(fio, pill); pai.appendChild(wrap);
    fio.addEventListener('scroll', () => { if (perto_(fio, 60) && novasAbaixo) { novasAbaixo = 0; atualizarPill(); marcarLida(); } }, { passive: true });
    const dica = dicaComposer(c); if (dica) { const d = el('div', 'ms-dica', dica); d.id = 'ms-dica'; pai.appendChild(d); }
    const stage = el('div', 'ms-stage'); stage.id = 'ms-stage'; stage.hidden = !anexoPend; pai.appendChild(stage);
    const form = el('div', 'ms-compor');
    const clip = botao('ms-ico', '📎', 'anexar'); clip.id = 'ms-anexar'; clip.setAttribute('aria-label', 'Anexar foto, vídeo ou áudio');
    const arq = el('input'); arq.type = 'file'; arq.id = 'ms-arquivo'; arq.hidden = true; arq.accept = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,audio/*';
    arq.addEventListener('change', () => { const f = arq.files && arq.files[0]; arq.value = ''; if (f) escolherArquivo_(f); });
    const ta = el('textarea'); ta.id = 'ms-texto'; ta.rows = 1; ta.placeholder = 'Mensagem'; if (c.canal !== 'instagram') ta.maxLength = limiteTexto(c); ta.setAttribute('aria-label', 'Mensagem para ' + rotuloContato(c)); ta.enterKeyHint = 'enter'; ta.value = rascunhoLer_(c.id);
    const mic = botao('ms-ico', '🎤', 'gravar'); mic.id = 'ms-mic'; mic.setAttribute('aria-label', 'Gravar áudio'); if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)) mic.hidden = true;
    const bt = botao('ms-enviar', 'Enviar', 'enviar'); bt.id = 'ms-enviar'; bt.disabled = !ta.value.trim() && !anexoPend;
    form.append(clip, arq, ta, mic, bt); pai.appendChild(form);
    if (espiando) form.hidden = true;        // para responder, toque em Atender (aí marca como lida)
    const cresce = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 132) + 'px'; bt.disabled = !ta.value.trim() && !anexoPend; rascunhoSalvar_(c.id, ta.value); };
    ta.addEventListener('input', cresce);
    ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && window.matchMedia('(pointer: fine)').matches) { ev.preventDefault(); enviar(); } });
    cresce(); desenharStage_();
  }
  /* ---- anexos: foto (reduzida no aparelho), vídeo, áudio e gravação ---- */
  function desenharStage_() {
    const st = $('ms-stage'), bt = $('ms-enviar'), ta = $('ms-texto'); if (!st) return;
    st.textContent = ''; st.hidden = !anexoPend;
    if (bt) bt.disabled = !anexoPend && !(ta && ta.value.trim());
    if (!anexoPend) return;
    const a = anexoPend, m = el(a.tipo === 'imagem' ? 'img' : a.tipo === 'vídeo' ? 'video' : 'audio');
    if (a.tipo === 'áudio') m.controls = true; else if (a.tipo === 'vídeo') { m.muted = true; m.preload = 'metadata'; } else m.alt = 'Prévia da foto';
    m.src = a.urlLocal; st.appendChild(m);
    if (a.tipo !== 'áudio') st.appendChild(el('span', 'ms-stage-nome', (a.tipo === 'imagem' ? 'Foto' : 'Vídeo') + ' · ' + (a.blob.size / 1048576).toFixed(1).replace('.', ',') + ' MB' + (aberta && aberta.canal !== 'instagram' ? ' · o texto vai como legenda' : '')));
    const x = botao('ms-ico', '✕', 'anexo-tirar'); x.setAttribute('aria-label', 'Remover o anexo'); st.appendChild(x);
  }
  function limparAnexo_(soltarUrl) { if (anexoPend && soltarUrl) URL.revokeObjectURL(anexoPend.urlLocal); anexoPend = null; desenharStage_(); }
  async function reduzirImagem_(f) {
    try {
      const bmp = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86)); if (blob) return blob;
    } catch (e) { /* usa o original se for um formato aceito */ }
    return /^image\/(jpeg|png|webp)$/.test(f.type) ? f : null;
  }
  async function escolherArquivo_(f, seg) {
    const tipo = /^image\//.test(f.type) ? 'imagem' : /^video\//.test(f.type) ? 'vídeo' : /^audio\//.test(f.type) ? 'áudio' : '';
    if (!tipo) { aviso_('Escolha uma foto, um vídeo ou um áudio.'); return; }
    let blob = f;
    if (tipo === 'imagem') { aviso_('Preparando a foto…'); blob = await reduzirImagem_(f); aviso_(''); if (!blob) { aviso_('Não consegui ler esta foto. Use JPG, PNG ou WebP.'); return; } if (blob.size > 8 * 1048576) { aviso_('A foto ficou grande demais (limite 8 MB). Escolha outra.'); return; } }
    else if (blob.size > 16 * 1048576) { aviso_('Arquivo grande demais (limite 16 MB).'); return; }
    if (tipo === 'vídeo' && !/^video\/(mp4|quicktime)$/.test(f.type)) { aviso_('Use um vídeo MP4.'); return; }
    limparAnexo_(true);
    anexoPend = { blob: blob, tipo: tipo, seg: Math.round(Number(seg) || 0), urlLocal: URL.createObjectURL(blob) };
    desenharStage_(); const ta = $('ms-texto'); if (ta && larga()) ta.focus();
  }
  function atualizarMic_() {
    const m = $('ms-mic'); if (!m) return;
    if (gravacao) { m.className = 'ms-ico gravando'; m.textContent = '⏹ ' + mmss((Date.now() - gravacao.t0) / 1000); m.setAttribute('aria-label', 'Parar e usar a gravação'); }
    else { m.className = 'ms-ico'; m.textContent = '🎤'; m.setAttribute('aria-label', 'Gravar áudio'); }
  }
  async function gravarAudio_() {
    if (gravacao) { gravacao.rec.stop(); return; }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { aviso_('Não consegui usar o microfone. Libere a permissão do microfone neste site e tente de novo.'); return; }
    const tipos = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'], mt = tipos.find((t) => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined), partes = [];
    const g = { rec: rec, t0: Date.now(), timer: null };
    rec.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
    rec.onstop = () => {
      clearInterval(g.timer); stream.getTracks().forEach((t) => t.stop()); gravacao = null; atualizarMic_();
      const seg = (Date.now() - g.t0) / 1000, blob = new Blob(partes, { type: (rec.mimeType || mt || 'audio/webm').split(';')[0] });
      if (blob.size && seg >= 1) escolherArquivo_(new File([blob], 'gravacao', { type: blob.type }), seg); else aviso_('Gravação muito curta. Segure um pouco mais.');
    };
    gravacao = g; rec.start(); atualizarMic_();
    g.timer = setInterval(() => { atualizarMic_(); if (Date.now() - g.t0 > 300000) rec.stop(); }, 500);
  }
  async function abrirConversa(id, espiar) {
    const w = ++abrindo;
    espiando = !!espiar;
    const jaNaTela = aberta && aberta.id === id;
    if (!jaNaTela) { elMsgs.clear(); msgs = []; novasAbaixo = 0; limparBlobs_(); limparAnexo_(true); fecharLuz_(); }
    const r = await worker_('/msg/mensagens?conversa=' + encodeURIComponent(id), 'GET');
    if (w !== abrindo) return;
    if (!r.ok) { aviso_(r.erro || 'Não foi possível abrir a conversa agora.'); return; }
    aviso_('');
    const c = r.conversa; aberta = c;
    ultIdSrv = r.mensagens.reduce((m, x) => (x.id > m ? x.id : m), 0);
    msgs = r.mensagens.concat(Array.from(pendentes.values()).filter((p) => p.conversa === id).map((p) => p.msg));
    montarConversa(c); pintarFio(true);
    vista = 'conversa'; const app = $('ms-app'); app.dataset.vista = 'conversa';
    if (!larga() && window.TKCamadas && !TKCamadas.aberta('ms-conversa')) TKCamadas.empilhar('ms-conversa', () => { vista = 'lista'; const a = $('ms-app'); if (a) a.dataset.vista = 'lista'; });
    pintarLista(); marcarLida();
    if (larga() && !espiando) { const t = $('ms-texto'); if (t) t.focus(); }
  }
  function voltarLista() {
    if (window.TKCamadas && TKCamadas.aberta('ms-conversa')) { TKCamadas.desempilhar('ms-conversa'); return; }
    vista = 'lista'; const a = $('ms-app'); if (a) a.dataset.vista = 'lista';
  }
  async function marcarLida() {
    if (espiando) return;                      // v7.21: espiando nunca marca como lida (nem aqui nem no celular)
    if (!aberta || !(aberta.nao_lidas > 0)) return;
    const id = aberta.id, cn = aberta.canal; aberta.nao_lidas = 0;
    const c = lista.find((x) => x.id === id); if (c) { c.nao_lidas = 0; pintarLista(); }
    const r = await worker_('/msg/lida', 'POST', { conversa: id, celular: true });
    // o celular não confirmou: avisa uma vez por canal nesta visita (a configuração mostra o motivo)
    if (r && r.celular && r.celular.ok === false && !r.celular.desligado && !avisouCelular[cn]) { avisouCelular[cn] = true; aviso_('Lida aqui no painel, mas o celular (' + (NOME_CANAL_[cn] || cn) + ') não confirmou a leitura: ' + (r.celular.erro || 'sem resposta') + '. Veja em ⋯ → Leitura no celular.'); }
    if (contagens) { const k = contagens[cn]; if (k && k.nao_lidas > 0) k.nao_lidas--; if (contagens.todos && contagens.todos.nao_lidas > 0) contagens.todos.nao_lidas--; }
    ajustarContagemLocal();
  }
  function ajustarContagemLocal() { desenharAbas(); desenharFiltros(); selarBotao(); }

  /* ---------- enviar ---------- */
  async function subirAnexo_(a) {
    const sess = (typeof getSessao === 'function' && getSessao()) || null; if (!sess) return { ok: false, erro: 'Entre com o seu login para enviar.' };
    try {
      const r = await fetch(INSTAGRAM_URL + '/msg/anexo?tipo=' + encodeURIComponent(a.tipo), { method: 'POST', headers: { 'X-TK-Whats': sess.whatsapp, 'X-TK-Sessao': sess.sessao, 'Content-Type': 'application/octet-stream' }, body: a.blob });
      return await r.json();
    } catch (e) { return { ok: false, erro: 'Sem conexão para enviar o arquivo. Tente de novo.', semRede: true }; }
  }
  async function enviar(reenvio) {
    if (!aberta) return;
    const c = aberta, ta = $('ms-texto'); if (!ta && !reenvio) return;
    let tmp, texto, idLocal;
    if (reenvio) { const p = pendentes.get(reenvio); if (!p) return; tmp = p; texto = p.msg.texto; idLocal = p.idLocal; p.msg.status = 'pendente'; p.msg.erro = ''; }
    else {
      texto = ta.value.replace(/\r\n/g, '\n').trim(); const an = anexoPend;
      if (!texto && !an) return;
      if (an && c.canal === 'instagram' && texto) { aviso_('O Instagram não aceita texto junto com foto, vídeo ou áudio. Envie o anexo e depois o texto.'); return; }
      if (!an && (c.canal === 'instagram' ? new TextEncoder().encode(texto).length > 1000 : texto.length > limiteTexto(c))) { aviso_('Mensagem grande demais para este canal. Divida em duas.'); return; }
      idLocal = idLocal_();
      const idTmp = 'tmp-' + idLocal;
      tmp = { idLocal: idLocal, conversa: c.id, anexo: an ? { blob: an.blob, tipo: an.tipo, seg: an.seg, chave: '' } : null, msg: { id: idTmp, direcao: 'saida', tipo: an ? an.tipo : 'texto', texto: texto, enviada_em: new Date().toISOString(), status: 'pendente', midia: an ? 1 : 0, localUrl: an ? an.urlLocal : '' } };
      pendentes.set(idTmp, tmp); msgs.push(tmp.msg);
      ta.value = ''; ta.style.height = 'auto'; rascunhoSalvar_(c.id, ''); anexoPend = null; desenharStage_(); $('ms-enviar').disabled = true; ta.focus();
    }
    pintarFio(true);
    const idTmp = tmp.msg.id;
    let r;
    if (tmp.anexo && !tmp.anexo.chave) {
      const up = await subirAnexo_(tmp.anexo);
      if (!up.ok) r = { ok: false, erro: up.erro || 'Não foi possível enviar o arquivo.', semRede: up.semRede, semEnvio: true };
      else tmp.anexo.chave = up.anexo;
    }
    if (!r) r = await worker_('/msg/enviar', 'POST', { conversa: c.id, texto: texto, idLocal: idLocal, anexo: tmp.anexo ? tmp.anexo.chave : undefined, seg: tmp.anexo ? tmp.anexo.seg : undefined });
    if (r.ok || (r.incerto && r.mensagem)) {
      pendentes.delete(idTmp);
      if (aberta && aberta.id === c.id) {
        msgs = msgs.filter((m) => m.id !== idTmp);
        const real = r.mensagem; if (real) {
          if (tmp.msg.localUrl) blobs.set(String(real.id), Promise.resolve(tmp.msg.localUrl));      // a prévia local vira a mídia da mensagem: nada para baixar de novo
          msgs = msgs.filter((m) => m.id !== real.id); msgs.push(real); if (r.incerto) real.status = 'incerta';
        }
        aberta.ult_dir = 'saida'; aberta.nao_lidas = 0;
      }
      if (r.incerto) aviso_(r.erro || 'Sem confirmação do envio.'); else aviso_('');
      carregarLista(false);
    } else {
      tmp.msg.status = 'falhou'; tmp.msg.erro = r.erro || 'Não foi possível enviar agora.';
      if (r.semRede && !r.semEnvio) tmp.msg.erro = 'Sem resposta do servidor. A mensagem pode ter saído: confira antes de tentar de novo (tentar de novo não duplica).';
    }
    if (aberta && aberta.id === c.id) pintarFio(true);
  }

  /* ---------- ao vivo ---------- */
  function ligarAoVivo() { pararAoVivo(); offline = false; espera = ESPERA_MS; atualizarVivo(); agendar(1200); }
  function pararAoVivo() { clearTimeout(timerLive); timerLive = null; }
  function agendar(ms) { clearTimeout(timerLive); timerLive = setTimeout(sondar, ms == null ? espera : ms); }
  function atualizarVivo() { const v = $('ms-vivo'); if (!v) return; v.className = 'ms-ao-vivo' + (offline ? ' off' : ''); v.textContent = offline ? 'Sem conexão…' : '● ao vivo'; }
  async function sondar() {
    const o = $('overlay-mensagens');
    if (!o || !o.classList.contains('aberto')) { pararAoVivo(); return; }
    if (document.hidden) { agendar(ESPERA_MAX_MS); return; }
    const ultId = ultIdSrv;
    const st = msgs.reduce((m, x) => (x.status_em && x.status_em > m ? x.status_em : m), '') || cursor;
    const q = '/msg/novidades?desde=' + encodeURIComponent(cursor || new Date(Date.now() - 60000).toISOString()) + ((nPoll++ % 10 === 0) ? '&cont=1' : '') + (aberta ? '&conversa=' + aberta.id + '&depois=' + ultId + '&st=' + encodeURIComponent(st) : '');
    const r = await worker_(q, 'GET');
    if (!r.ok) { offline = true; espera = Math.min(ESPERA_MAX_MS, espera * 2); atualizarVivo(); agendar(); return; }
    if (offline) { offline = false; atualizarVivo(); }
    espera = ESPERA_MS; cursor = r.cursor || cursor;
    r.mensagens.forEach((m) => { if (typeof m.id === 'number' && m.id > ultIdSrv) ultIdSrv = m.id; });
    contagens = r.contagens || contagens; desenharAbas(); desenharFiltros(); selarBotao();
    if (r.conversas.some((c) => canal === 'todos' || c.canal === canal)) await carregarLista(false);
    if (aberta) {
      const mudou = r.conversas.find((c) => c.id === aberta.id); if (mudou) aberta = Object.assign({}, aberta, mudou, { nao_lidas: aberta.nao_lidas });
      const fio = $('ms-fio'), novas = r.mensagens.filter((m) => !msgs.some((x) => x.id === m.id));
      const mudancas = r.mensagens.filter((m) => msgs.some((x) => x.id === m.id && (x.status !== m.status)));
      if (novas.length || mudancas.length) {
        const noFim = !fio || perto_(fio, 90), entradas = novas.filter((m) => m.direcao === 'entrada').length;
        mudancas.forEach((m) => { const x = msgs.find((y) => y.id === m.id); if (x) { x.status = m.status; x.status_em = m.status_em; } });
        // uma mensagem nossa que acabou de voltar pelo servidor substitui a "enviando…" (mesmo texto) sem duplicar
        novas.forEach((m) => { if (m.direcao === 'saida') { const i = msgs.findIndex((x) => typeof x.id === 'string' && x.msg === undefined && x.texto === m.texto && x.tipo === m.tipo && x.status === 'pendente'); if (i >= 0) { pendentes.delete(msgs[i].id); msgs.splice(i, 1); } } });
        msgs = msgs.concat(novas);
        if (!noFim && entradas) novasAbaixo += entradas;
        pintarFio(noFim);
        if (noFim && entradas && !document.hidden) { aberta.nao_lidas = 1; marcarLida(); }
        else if (entradas && aberta) aberta.nao_lidas = (aberta.nao_lidas || 0) + entradas;
      }
    }
    agendar();
  }
  /* selo no botão "Mensagens" do painel: consulta leve, só com a página visível e a cada ~1 min */
  function selarBotao() {
    const b = $('btn-abrir-mensagens'); if (!b || !contagens) return;
    const n = CANAIS.reduce((s, [id]) => s + ((contagens[id] || {}).nao_lidas || 0), 0);
    // v7.19: o botão virou um cartão (ícone + título + descrição); o total vai no selo dele
    const selo = b.querySelector('.ferr-badge');
    if (selo) { selo.textContent = n > 0 ? String(n) : ''; selo.hidden = !(n > 0); }
    else b.textContent = '💬 Mensagens' + (n > 0 ? ' (' + n + ')' : '');
    b.setAttribute('aria-label', 'Mensagens' + (n > 0 ? ', ' + n + ' conversas não lidas' : ''));
  }
  async function sondarSelo() {
    clearTimeout(timerSelo);
    const o = $('overlay-mensagens');
    if (!document.hidden && podeGerir() && !(o && o.classList.contains('aberto'))) { const r = await worker_('/msg/contagem', 'GET'); if (r.ok) { contagens = r.contagens; selarBotao(); } }
    clearTimeout(timerSelo); timerSelo = setTimeout(sondarSelo, ESPERA_SELO_MS);
  }

  /* ---------- exportar ---------- */
  async function baixar(params, rotulo) {
    const s = (typeof getSessao === 'function' && getSessao()) || null; if (!s) { aviso_('Entre com o seu login para exportar.'); return; }
    aviso_('Preparando ' + rotulo + '…');
    try {
      const r = await fetch(INSTAGRAM_URL + '/msg/exportar?' + params, { headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao } });
      if (!r.ok) { let e = null; try { e = await r.json(); } catch (x) { /* corpo vazio */ } aviso_((e && e.erro) || 'Não foi possível exportar agora.'); return; }
      const blob = await r.blob(), total = r.headers.get('X-TK-Total'), cortado = r.headers.get('X-TK-Cortado') === '1';
      const nome = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'mensagens.txt';
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      aviso_('Arquivo pronto (' + (total || '0') + ' mensagens)' + (cortado ? '. Havia mais: use o filtro por datas para exportar o restante.' : '.'));
    } catch (e) { aviso_('Sem conexão. Não foi possível exportar agora.'); }
  }
  async function copiarParaIA() {
    if (!aberta) return;
    const s = (typeof getSessao === 'function' && getSessao()) || null; if (!s) return;
    aviso_('Preparando o texto…');
    try {
      const r = await fetch(INSTAGRAM_URL + '/msg/exportar?formato=txt&conversa=' + aberta.id, { headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao } });
      if (!r.ok) { aviso_('Não foi possível preparar agora.'); return; }
      await navigator.clipboard.writeText((await r.text()).replace(/^﻿/, ''));
      aviso_('Conversa copiada. Cole no ChatGPT, Claude ou Gemini e peça a análise.');
    } catch (e) { aviso_('Não consegui copiar. Use “Exportar esta conversa (TXT)”.'); }
  }

  /* ---------- painel de atendimento ---------- */
  const fmtMin = (m) => m == null ? '—' : m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 6) / 10 + ' h' : Math.round(m / 144) / 10 + ' dias';
  async function abrirPainel(dias) {
    painel = 'metricas'; const ex = $('ms-extra'), ul = $('ms-lista'); ul.hidden = true; ex.textContent = 'Carregando…'; chrome_(true);
    const r = await worker_('/msg/metricas?canal=' + encodeURIComponent(canal) + '&dias=' + (dias || 30), 'GET');
    ex.textContent = '';
    const p = el('div', 'ms-painel');
    const topo = el('div', 'ms-linha'); topo.appendChild(botao('ms-btn', '← Conversas', 'fechar-painel'));
    [7, 30, 90].forEach((d) => { const b = botao('ms-chip', d + ' dias', 'painel-dias', { dias: String(d) }); b.setAttribute('aria-pressed', String(d === (r.dias || dias || 30))); topo.appendChild(b); });
    p.appendChild(topo);
    if (!r.ok) { p.appendChild(el('p', 'ms-vazio', r.erro || 'Não foi possível calcular agora.')); ex.appendChild(p); return; }
    p.appendChild(el('h3', '', 'Atendimento · ' + NOME_CANAL[canal]));
    const cards = el('div', 'ms-cards');
    const card = (v, t, alerta) => { const c = el('div', 'ms-card' + (alerta ? ' alerta' : '')); c.appendChild(el('b', '', String(v))); c.appendChild(el('span', '', t)); cards.appendChild(c); };
    card(r.aguardando.total, 'esperando resposta agora', r.aguardando.total > 0);
    card(fmtMin(r.medianaMin), 'tempo típico da 1ª resposta');
    card(r.ate5min == null ? '—' : r.ate5min + '%', 'respondidas em até 5 min');
    card(r.ate60min == null ? '—' : r.ate60min + '%', 'respondidas em até 1 h');
    card(r.perguntasSemResposta, 'perguntas sem nenhuma resposta', r.perguntasSemResposta > 0);
    card(r.acima24h == null ? '—' : r.acima24h + '%', 'respostas depois de 24 h');
    p.appendChild(cards);
    p.appendChild(el('p', 'ms-vazio', r.conversas + ' conversas com mensagens · ' + r.entradas + ' recebidas · ' + r.saidas + ' enviadas (grupos ficam de fora).'));
    if (r.aguardando.maisAntigas.length) {
      p.appendChild(el('h3', '', 'Esperando há mais tempo'));
      const ul2 = el('ul', 'ms-lista');
      r.aguardando.maisAntigas.forEach((x) => { const li = el('li'), b = botao('ms-conv', '', 'abrir-canal', { id: String(x.id), canal: x.canal }); const cp = el('span', 'ms-conv-corpo'); const l1 = el('span', 'ms-l1'); l1.appendChild(el('span', 'ms-nome', x.nome)); l1.appendChild(el('time', '', 'há ' + espera_(x.desde))); cp.appendChild(l1); b.appendChild(cp); li.appendChild(b); ul2.appendChild(li); });
      p.appendChild(ul2);
    }
    const max = Math.max(1, ...r.porHora.map((h) => h.entradas));
    p.appendChild(el('h3', '', 'Quando os clientes escrevem (horário de Fortaleza)'));
    const g = el('div', 'ms-horas'); g.setAttribute('role', 'img'); g.setAttribute('aria-label', 'Perguntas por hora do dia: ' + r.porHora.filter((h) => h.entradas).map((h) => h.hora + 'h: ' + h.entradas).join(', '));
    r.porHora.forEach((h) => { const i = el('i'); i.style.height = Math.max(2, Math.round(80 * h.entradas / max)) + 'px'; i.title = h.hora + 'h: ' + h.entradas + ' perguntas' + (h.medianaMin != null ? ', resposta típica ' + fmtMin(h.medianaMin) : ''); g.appendChild(i); });
    p.appendChild(g); const leg = el('div', 'ms-horas-leg'); ['0h', '6h', '12h', '18h', '23h'].forEach((t) => leg.appendChild(el('span', '', t))); p.appendChild(leg);
    const l = el('div', 'ms-linha'); l.appendChild(botao('ms-btn prim', 'Exportar tudo deste canal (TXT para IA)', 'exp', { params: 'formato=txt&canal=' + canal, rotulo: 'as conversas' })); p.appendChild(l);
    ex.appendChild(p);
  }
  /** No painel de atendimento, abas de filtro/busca/estado saem do caminho para dar espaço aos números. */
  function chrome_(esconder) { ['ms-filtros', 'ms-busca', 'ms-estado-wrap'].forEach((id) => { const e = $(id); if (e) e.hidden = esconder; }); }
  function fecharPainel() { painel = ''; chrome_(false); const ul = $('ms-lista'); if (ul) ul.hidden = false; pintarLista(); }

  /* ---------- cliques ---------- */
  async function clique(ev) {
    if (ev.target && ev.target.id === 'ms-luz') { fecharLuz_(); return; }
    const b = ev.target.closest('[data-ms]'); if (!b) return;
    const a = b.dataset.ms;
    if (a !== 'menu-geral' && a !== 'menu-conversa') fecharMenu();
    if (a === 'fechar') {
      if (window.TKCamadas && TKCamadas.aberta('ms-conversa')) { document.addEventListener('tk:camada-fechada', function f(e) { if (e.detail && e.detail.chave === 'ms-conversa') { document.removeEventListener('tk:camada-fechada', f); fecharComHistorico_('overlay-mensagens'); } }); TKCamadas.desempilhar('ms-conversa'); }
      else fecharComHistorico_('overlay-mensagens');
    }
    else if (a === 'aba') { canal = b.dataset.canal; filtro = 'todas'; busca = ''; $('ms-busca').value = ''; aberta = null; msgs = []; elMsgs.clear(); limparBlobs_(); limparAnexo_(true); $('ms-conversa').textContent = ''; $('ms-conversa').appendChild(vazioConversa_()); fecharPainelSilencioso(); lista = []; elConvs.forEach((li) => li.remove()); elConvs.clear(); desenharAbas(); desenharFiltros(); desenharEstado(); await carregarLista(true); }
    else if (a === 'filtro') { filtro = b.dataset.filtro; fecharPainelSilencioso(); desenharFiltros(); await carregarLista(true); }
    else if (a === 'abrir') abrirConversa(Number(b.dataset.id));
    else if (a === 'espiar') abrirConversa(Number(b.dataset.id), true);
    else if (a === 'atender' && aberta) { espiando = false; aberta.nao_lidas = Math.max(1, aberta.nao_lidas || 0); montarConversa(aberta); pintarFio(true); marcarLida(); const t = $('ms-texto'); if (t) t.focus(); }
    else if (a === 'leitura-cfg') { painel = painel === 'leitura' ? '' : 'leitura'; if (painel === 'leitura') cfgLeitura = null; desenharEstado(); }
    else if (a === 'abrir-canal') { canal = b.dataset.canal; fecharPainelSilencioso(); filtro = 'todas'; desenharAbas(); desenharFiltros(); desenharEstado(); await carregarLista(true); abrirConversa(Number(b.dataset.id)); }
    else if (a === 'voltar') voltarLista();
    else if (a === 'enviar') enviar();
    else if (a === 'anexar') { const i = $('ms-arquivo'); if (i) i.click(); }
    else if (a === 'anexo-tirar') limparAnexo_(true);
    else if (a === 'gravar') gravarAudio_();
    else if (a === 'luz-fechar') fecharLuz_();
    else if (a === 'story-ver') { const mid = Number(b.dataset.id); try { abrirLuz_(b.dataset.video ? 'video' : 'imagem', await midiaBlob_(mid, true)); } catch (e) { aviso_('Não consegui abrir o story agora.'); } }
    else if (a === 'stories-no-ar') { const mm = msgs.find((x) => String(x.id) === b.dataset.id); if (mm) abrirStories_(mm); }
    else if (a === 'reenviar') enviar(b.dataset.tmp);
    else if (a === 'descartar') { pendentes.delete(b.dataset.tmp); msgs = msgs.filter((m) => m.id !== b.dataset.tmp); pintarFio(false); }
    else if (a === 'fim') { const f = $('ms-fio'); if (f) { f.scrollTop = f.scrollHeight; novasAbaixo = 0; atualizarPill(); marcarLida(); } }
    else if (a === 'conexao') { painel = painel === 'conexao' ? '' : 'conexao'; desenharEstado(); }
    else if (a === 'menu-geral') abrirMenu(b, [['Painel de atendimento', 'painel'], ['Leitura no celular…', 'leitura-cfg'], '-'].concat(canal === 'todos' ? [] : [['Exportar este canal (CSV)', 'exp', { params: 'formato=csv&canal=' + canal, rotulo: 'o canal' }], ['Exportar este canal (TXT para IA)', 'exp', { params: 'formato=txt&canal=' + canal, rotulo: 'o canal' }]]).concat([ ['Exportar tudo (CSV, 3 canais)', 'exp', { params: 'formato=csv', rotulo: 'tudo' }], ['Exportar tudo (JSON)', 'exp', { params: 'formato=json', rotulo: 'tudo' }], '-', ['Atualizar agora', 'atualizar']]));
    else if (a === 'menu-conversa' && aberta) abrirMenu(b, [['Copiar conversa para IA', 'copiar-ia'], ['Exportar esta conversa (TXT)', 'exp', { params: 'formato=txt&conversa=' + aberta.id, rotulo: 'a conversa' }], ['Exportar esta conversa (CSV)', 'exp', { params: 'formato=csv&conversa=' + aberta.id, rotulo: 'a conversa' }], '-', ['Marcar como não lida', 'nao-lida']]);
    else if (a === 'exp') baixar(b.dataset.params, b.dataset.rotulo);
    else if (a === 'copiar-ia') copiarParaIA();
    else if (a === 'painel') abrirPainel(30);
    else if (a === 'painel-dias') abrirPainel(Number(b.dataset.dias));
    else if (a === 'fechar-painel') fecharPainel();
    else if (a === 'atualizar') { await recarregar(); }
    else if (a === 'nao-lida' && aberta) { await worker_('/msg/lida', 'POST', { conversa: aberta.id, naoLida: true }); aberta.nao_lidas = 1; voltarLista(); await carregarLista(false); }
    else if (a === 'segredo') {
      const v = ($('ms-segredo') || {}).value || '';
      const r = await worker_('/msg/instagram/segredo', 'POST', { segredo: v });
      if (!r.ok) aviso_(r.erro || 'Não foi possível guardar agora.'); else recarregar();
    }
    else if (a === 'assinar') {
      b.disabled = true; const r = await worker_('/msg/instagram/assinar', 'POST', {}); b.disabled = false;
      if (!r.ok) aviso_(r.erro || 'Não foi possível assinar agora.'); else { aviso_('Conta assinada. Mande uma mensagem de teste para o Instagram da loja.'); diagnosticar(); }
    }
    else if (a === 'ligar') {
      if (!confirm('Ligar a gravação? A Wafly passará a mandar as mensagens recebidas, as enviadas pelo celular e os avisos de entregue/lida deste WhatsApp para o servidor da loja (no lugar do endereço que estiver configurado hoje). Nada é apagado e o histórico antigo não é buscado.')) return;
      b.disabled = true;
      const r = await worker_('/msg/ligar', 'POST', { slot: Number(b.dataset.slot) });
      b.disabled = false;
      if (!r.ok) { aviso_(r.erro || 'Não foi possível ligar agora.'); return; }
      aviso_(r.avisos && r.avisos.length ? 'Ligado, mas: ' + r.avisos.join(' ') + (r.detalhes && r.detalhes.length ? ' (Resposta da Wafly: ' + r.detalhes.join('; ') + ')' : '') : 'Ativado. Para conferir, mande uma mensagem pelo celular da loja: ela deve aparecer aqui em alguns segundos.');
      painel = ''; recarregar();
    } else if (a === 'pausar') {
      const r = await worker_('/msg/pausar', 'POST', { canal: canal, pausar: b.dataset.pausar === '1' });
      if (!r.ok) aviso_(r.erro || 'Não foi possível agora.'); else recarregar();
    }
  }
  function fecharPainelSilencioso() { if (painel === 'metricas') { painel = ''; chrome_(false); const ul = $('ms-lista'); if (ul) ul.hidden = false; } }

  /* ---------- abrir / fechar ---------- */
  async function recarregar() {
    resumo = await worker_('/msg/resumo', 'GET');
    if (!resumo.ok) { const ex = $('ms-extra'); ex.textContent = ''; ex.appendChild(el('p', 'ms-vazio', resumo.erro || 'Não foi possível carregar agora.')); return; }
    if (!contagens) contagens = {};
    CANAIS.forEach(([id]) => { const c = resumo.canais[id]; contagens[id] = Object.assign({ grupos: 0, sem_resposta: c.semResposta || 0 }, contagens[id] || {}, { conversas: c.conversas, nao_lidas: c.naoLidas || 0, sem_resposta: c.semResposta || 0 }); });
    desenharAbas(); desenharFiltros(); desenharEstado(); selarBotao(); await carregarLista(true);
  }
  async function abrir() {
    montar(); abrirComHistorico_('overlay-mensagens');
    vista = 'lista'; $('ms-app').dataset.vista = 'lista'; ajustarViewport();
    $('ms-extra').textContent = 'Carregando…';
    await recarregar(); ligarAoVivo();
    const f = $('ms-fechar'); if (f && larga()) f.focus();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { const o = $('overlay-mensagens'); if (o && o.classList.contains('aberto')) { espera = ESPERA_MS; agendar(300); } else sondarSelo(); } });
  (function init() {
    const botao_ = $('btn-abrir-mensagens'); if (!botao_) return;
    botao_.hidden = false;
    botao_.addEventListener('click', () => { if (!podeGerir()) { alert('Esta tela é só para o Admin total.'); return; } abrir(); });
    timerSelo = setTimeout(sondarSelo, 4000);
    const obs = new MutationObserver(() => { const o = $('overlay-mensagens'); if (o && !o.classList.contains('aberto')) { pararAoVivo(); fecharMenu(); } });
    const espiar = () => { const o = $('overlay-mensagens'); if (o) obs.observe(o, { attributes: true, attributeFilter: ['class'] }); };
    botao_.addEventListener('click', () => setTimeout(espiar, 50));
  })();
})();
