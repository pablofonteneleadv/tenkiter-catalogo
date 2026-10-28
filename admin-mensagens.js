/* ====================================================================
 * TENKiTER — admin-mensagens.js (v2.4) — CAIXA DE MENSAGENS (Admin total)
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
  // v7.22: "Nos 2 WhatsApp" (a mesma pessoa falando pelos dois números) e "Encerradas" (saem da lista e voltam quando o cliente escreve)
  // v7.24: "Mensagens" e "Grupos" ligam/desligam juntos ou separados (os dois = tudo); os demais filtros são de um em um e desligam com novo toque
  const FILTROS = [['minhas', 'Minhas'], ['nao_lidas', 'Não lidas'], ['sem_resposta', 'Falta responder'], ['encerradas', 'Encerradas']];
  // v7.21: aba mestre "Todas" (os três canais juntos) vem primeiro e é a que abre
  const ABAS = [['todos', 'Todas']].concat(CANAIS);
  const NOME_CANAL_ = { whatsapp1: 'WhatsApp 1', whatsapp2: 'WhatsApp 2', instagram: 'Instagram' };
  const ESPERA_MS = Number(window.TK_MENSAGENS_POLL_MS) || 4000, ESPERA_MAX_MS = Number(window.TK_MENSAGENS_POLL_MS) ? 3000 : 30000, ESPERA_SELO_MS = Number(window.TK_MENSAGENS_POLL_MS) ? 1500 : 60000;
  let espiando = false, cfgLeitura = null, avisouCelular = {};
  let selecao = null, timerToque = null, toqueLongo = false;      // v7.22: seleção de várias conversas (para encerrar/reabrir)
  let tipos = { msg: true, grp: false }, contVista = null, contTipos = null;
  const tipoParam_ = () => (tipos.msg && !tipos.grp ? 'individual' : tipos.grp && !tipos.msg ? 'grupo' : '');
  let canal = 'todos', filtro = '', busca = '', resumo = null, contagens = null, lista = [], cursor = '', aberta = null, msgs = [], vista = 'lista', painel = '';
  let seqLista = 0, ultIdSrv = 0, nPoll = 0, timerBusca = null, timerLive = null, timerSelo = null, espera = ESPERA_MS, offline = false, abrindo = 0, novasAbaixo = 0, menuAberto = null, aviso = '';
  const rascunhos = {}, elMsgs = new Map(), elConvs = new Map(), pendentes = new Map();
  const blobs = new Map();                     // mídia já baixada nesta conversa: "id" ou "id|c" (story) -> promessa do endereço local
  let anexoPend = null, gravacao = null, colarFimAte = 0;

  // Cache apenas do app, por conta + sessão. Nunca guarda tokens, anexos ou URLs de mídia.
  const APP_RECENTES = new URLSearchParams(location.search).get('app') === 'mensagens';
  const CACHE_RECENTES = 'tk_msg_recentes_v1';
  let cacheConversa = false, cacheBloqueado = false;
  function limparRecentes_() { try { localStorage.removeItem(CACHE_RECENTES); } catch (_) {} }
  window.addEventListener('tk:mensagens-sair', limparRecentes_);
  async function donoRecentes_() {
    const s = typeof getSessao === 'function' && getSessao();
    if (!APP_RECENTES || cacheBloqueado || !s || !podeGerir()) return '';
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.whatsapp + ':' + s.sessao));
    return Array.from(new Uint8Array(h), x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function recentes_(path, valor) {
    if (!/^\/msg\/(conversas\?|mensagens\?)/.test(path)) return null;
    let dono;try{dono=await donoRecentes_();}catch(_){return null;}if(!dono)return null;
    try {
      let c = JSON.parse(localStorage.getItem(CACHE_RECENTES) || 'null');
      if (!c || c.dono !== dono || Date.now()-c.em > 86400000) { limparRecentes_(); c={dono,em:Date.now(),itens:{}}; }
      if (!valor) {
        const item=c.itens[path],d=item?.dados;
        const valido=d&&d.ok&&(Array.isArray(d.conversas)||(d.conversa&&Array.isArray(d.mensagens)));
        return valido&&Date.now()-item.em<86400000&&dono===await donoRecentes_()?d:null;
      }
      const dados=JSON.parse(JSON.stringify(valor, (k,v)=> /(?:url|chave|token|sessao)$/i.test(k) ? undefined : v));
      if (dados.mensagens) dados.mensagens=dados.mensagens.slice(-80);
      if (dados.conversas) dados.conversas=dados.conversas.slice(0,60);
      c.itens[path]={em:Date.now(),dados};c.em=Date.now();
      const keys=Object.keys(c.itens).sort((a,b)=>c.itens[b].em-c.itens[a].em);
      keys.slice(10).forEach(k=>delete c.itens[k]);
      let json=JSON.stringify(c);
      while(json.length>500000&&keys.length>1){delete c.itens[keys.pop()];json=JSON.stringify(c);}
      if(json.length<=500000 && dono===await donoRecentes_()) localStorage.setItem(CACHE_RECENTES,json);
    } catch (_) { /* armazenamento cheio ou indisponível não impede atendimento */ }
    return null;
  }
  /* ---------- utilidades ---------- */
  async function worker_(caminho, metodo, corpo) {
    if(cacheConversa && metodo && metodo!=='GET') return {ok:false,erro:'Aguarde atualizar a conversa para continuar.'};
    const s = (typeof getSessao === 'function' && getSessao()) || null;
    if (!s || typeof INSTAGRAM_URL === 'undefined') return { ok: false, erro: 'Entre com o seu login (não vale só o PIN) para ver as mensagens.' };
    try {
      const r = await fetch(INSTAGRAM_URL + caminho, { method: metodo, headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
      const dados = await r.json();
      const mesmaSessao=()=>{const atual=typeof getSessao==='function'&&getSessao();return atual&&atual.sessao===s.sessao&&atual.whatsapp===s.whatsapp;};
      if(APP_RECENTES&&!mesmaSessao())return {ok:false,erro:'A conta mudou. Abra novamente as mensagens.'};
      if (APP_RECENTES && (r.status===401 || r.status===403)) {
        cacheBloqueado=true;limparRecentes_(); lista=[];msgs=[];aberta=null;cacheConversa=false;
        if($('ms-lista')) pintarLista(); if($('ms-conversa')) $('ms-conversa').textContent='';
      }
      if (dados.ok && (!metodo || metodo==='GET')) await recentes_(caminho,dados);
      if(APP_RECENTES&&!mesmaSessao())return {ok:false,erro:'A conta mudou. Abra novamente as mensagens.'};
      return dados;
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
    if (/^\d{12,13}$/.test(n) && n.indexOf('55') === 0) return foneBonito_(n);
    return /^\d{10,15}$/.test(n) ? '+' + n : (c.grupo ? 'Grupo ' + n : ((c.canal || canal) === 'instagram' ? 'Cliente do Instagram' : n));
  }
  function iniciais(c) { const t = rotuloContato(c).replace(/[^\p{L}\p{N} ]/gu, '').trim(); return t ? (t.split(/\s+/).slice(0, 2).map((x) => x[0]).join('')).toUpperCase() : '?'; }
  function corAvatar(c) { let h = 0; const s = String(c.contato || c.id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return ['#7a4a1e', '#2f5d62', '#5b3a6b', '#6b5a1e', '#3d5a3d', '#7a2f3d'][h % 6]; }
  const TIPO_ROTULO = { 'imagem': '📷 Foto', 'vídeo': '🎬 Vídeo', 'áudio': '🎤 Áudio', 'documento': '📄 Documento', 'figurinha': 'Figurinha', 'contato': '👤 Contato', 'localização': '📍 Localização', 'reação': 'Reação', 'resposta': 'Resposta', 'compartilhamento': 'Compartilhamento', 'menção em story': 'Menção em story', 'reel': 'Reel' };
  const STATUS = { pendente: ['🕓', 'Enviando', ''], enviada: ['✓', 'Enviada', ''], entregue: ['✓✓', 'Entregue', ''], lida: ['✓✓', 'Lida', 'lida'], incerta: ['⚠', 'Sem confirmação', 'incerta'], falhou: ['⚠', 'Não enviada', 'incerta'] };
  function selo(status) { const s = STATUS[status] || STATUS.enviada, e = el('span', 'ms-tique ' + s[2], s[0]); e.title = s[1]; e.setAttribute('role', 'img'); e.setAttribute('aria-label', s[1]); return e; }
  /** v7.24: *negrito*, _itálico_ e ~riscado~ do WhatsApp nas bolhas (sem HTML: cada trecho vira um elemento) */
  function formatarWa_(pai, texto) {
    const re = /(^|[\s(])([*_~])([^\s*_~](?:[^\n]*?[^\s])?)\2(?=$|[\s).,!?:;])/g; let i = 0, m;
    while ((m = re.exec(texto))) {
      const ini = m.index + m[1].length;
      if (ini > i) linkar(pai, texto.slice(i, ini));
      const tag = m[2] === '*' ? 'b' : m[2] === '_' ? 'i' : 's', e = el(tag); linkar(e, m[3]); pai.appendChild(e);
      i = ini + m[2].length * 2 + m[3].length;
    }
    if (i < texto.length) linkar(pai, texto.slice(i));
  }
  const semFormatacao_ = (t) => String(t || '').replace(/(^|[\s(])([*_~])([^\s*_~](?:[^\n]*?[^\s])?)\2(?=$|[\s).,!?:;])/g, '$1$3');
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
      .ms-trab { position: absolute; bottom: calc(8px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); z-index: 30; width: min(520px, calc(100% - 24px)); display: grid; gap: 4px; padding: 10px 14px; border-radius: 10px; background: #141414; color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.25); font-size: 0.86rem; }
      .ms-trab progress { width: 100%; height: 10px; accent-color: #E67E22; }
      .sheet-mensagens .ms-contatos button:disabled { opacity: 0.55; cursor: not-allowed; }
      .ms-trab small { color: #e6e1d6; font-size: 0.78rem; }
      .sheet-mensagens { position: relative; max-width: 1120px; width: 100%; padding: 0; border-radius: 0; height: var(--ms-h, 100dvh); max-height: var(--ms-h, 100dvh); margin-top: var(--ms-top, 0); overflow: hidden; background: #fff; }
      @media (min-width: 860px) { #overlay-mensagens { align-items: center; } .sheet-mensagens { height: min(90dvh, 880px); max-height: min(90dvh, 880px); margin-top: 0; border-radius: 16px; } }
      .sheet-mensagens button { width: auto; margin: 0; font-family: inherit; }
      .sheet-mensagens textarea, .sheet-mensagens input[type=search] { font-family: inherit; }
      .ms-app { position: relative; display: grid; grid-template-columns: 1fr; height: 100%; min-height: 0; }
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
      .sheet-mensagens .ms-busca { width: auto; align-self: stretch; }   /* v7.22: a regra geral de input (100%) empurrava a busca 24 px para fora da coluna */
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
      .ms-etq { display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; color: #222; border: 1px solid #e3ddd3; background: #fff; border-radius: 10px; padding: 0 7px 0 5px; white-space: nowrap; }
      .ms-dono-tag { font-size: 0.72rem; font-weight: 600; color: #3b352c; }
      .ms-etq-ponto { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
      .ms-chip-etq { display: inline-flex; align-items: center; gap: 6px; }
      .ms-etq-faixa { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 12px; border-bottom: 1px solid #e3ddd3; background: #f9f7f2; }
      .ms-etq-mais { background: transparent; border: 0; color: #A85200; font-weight: 600; font-size: 0.8rem; min-height: 32px; padding: 0 4px; cursor: pointer; }
      .ms-etq-rot { margin: 10px 0 4px; font-size: 0.72rem; font-weight: 700; color: #625c53; text-transform: uppercase; letter-spacing: 0.04em; }
      .ms-etq-op { display: flex; align-items: center; gap: 10px; min-height: 44px; border-bottom: 1px solid #f0ece5; font-size: 0.92rem; cursor: pointer; }
      .ms-etq-op input { width: 20px; height: 20px; margin: 0; accent-color: #141414; }
      .ms-etq-pe { display: flex; gap: 8px; justify-content: flex-end; padding-top: 12px; }
      .ms-bolha.ms-nota { align-self: stretch; max-width: none; background: #fff6d6; border: 1px dashed #e0c56e; color: #2b2410; }
      .ms-nota-rot { display: block; font-size: 0.72rem; font-weight: 700; color: #6b5000; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 2px; }
      .ms-modo-nota textarea, textarea.ms-modo-nota, .ms-modo-nota #ms-texto { background: #fff6d6 !important; border-color: #e0c56e !important; }
      .ms-nota-btn[aria-pressed="true"] { background: #fff6d6; }
      .ms-saude { margin: 0 12px 8px; padding: 10px 12px; border-radius: 8px; background: #fdecec; color: #8f1d1d; border: 1px solid #f3c7c7; font-size: 0.85rem; display: grid; gap: 2px; }
      .ms-saude b { color: #c62828; }
      .ms-aviso { position: absolute; left: 12px; right: 12px; bottom: 88px; z-index: 7; margin: 0; padding: 10px 12px; border-radius: 8px; background: #fff3cd; color: #5a4300; font-size: 0.85rem; box-shadow: 0 6px 18px rgba(0,0,0,0.18); }
      .ms-aviso[hidden] { display: none; }
      /* v7.22: número ao lado do nome, mesma pessoa nos 2 WhatsApp, seleção e encerradas */
      .ms-conv .ms-l3 { display: flex; align-items: center; gap: 8px; margin-top: 3px; min-width: 0; }
      .ms-conv .ms-fone { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; color: #625c53; font-size: 0.76rem; }
      .ms-ambos-tag { display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; font-size: 0.72rem; font-weight: 700; color: #7a3a00; }
      .ms-ambos-tag::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--laranja, #E67E22); }
      .ms-chip.alerta { border-color: var(--laranja, #E67E22); color: #7a3a00; }
      .ms-conv .ms-marca { flex: none; width: 44px; height: 44px; border-radius: 50%; border: 2px solid #b9b2a6; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; box-sizing: border-box; }
      .ms-conv[aria-pressed=true] { background: #f5efe0; } .ms-conv[aria-pressed=true] .ms-marca { background: #141414; border-color: #141414; }
      .ms-selbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); border-top: 1px solid #e6e1d6; background: #fff; }
      .ms-selbar[hidden] { display: none; }
      .ms-selbar { flex-direction: column; align-items: stretch; gap: 6px; }
      .ms-sel-topo, .ms-sel-acoes { display: flex; align-items: center; gap: 8px; }
      .ms-sel-n { flex: 1; min-width: 0; font-weight: 700; font-size: 0.88rem; }
      .ms-sel-acoes .ms-btn { flex: 1 1 0; min-width: 0; padding-left: 6px; padding-right: 6px; }
      .ms-chip-sep { flex: none; width: 1px; align-self: stretch; margin: 6px 2px; background: #e3ddd3; }
      .ms-chip-tipo[aria-pressed=true] { background: #141414; border-color: #141414; color: #fff; }
      .ms-selbar .ms-btn { flex: none; }
      .ms-faixa { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; border-bottom: 1px solid #e6e1d6; background: #faf7f0; color: #3d362c; font-size: 0.85rem; }
      .ms-faixa.ambos { background: #fff4e8; border-bottom-color: #f2d3b0; color: #5c2e00; }
      .ms-faixa .ms-btn { flex: none; min-height: 40px; }
      .ms-assina { display: flex; align-items: center; gap: 6px; padding: 0 8px; background: #fff; font-size: 0.78rem; color: #4a443b; min-height: 32px; box-shadow: inset 0 1px 0 #f0ece2; }
      .sheet-mensagens .ms-ferr-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: #141414; font: 600 0.82rem/1 Inter, -apple-system, Roboto, Arial, sans-serif; cursor: pointer; }
      .sheet-mensagens .ms-ferr-btn:hover, .sheet-mensagens .ms-ferr-btn:focus-visible { background: #f6f3ee; }
      .ms-ferr-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linejoin: round; stroke-linecap: round; flex: none; }
      .sheet-mensagens .ms-assina-btn { margin-left: auto; color: #4a443b; font-weight: 500; max-width: 45%; }
      .ms-assina-btn b { color: #141414; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ms-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      .ms-conversa { position: relative; }
      .ms-gaveta { position: absolute; inset: 0; z-index: 6; background: #fff; display: flex; flex-direction: column; }
      @media (min-width: 860px) { .ms-gaveta { left: auto; width: min(420px, 100%); border-left: 1px solid #e6e1d6; box-shadow: -8px 0 24px rgba(0,0,0,0.08); } }
      .ms-gaveta-cab { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 14px; border-bottom: 1px solid #e6e1d6; }
      .ms-gaveta-cab h3 { margin: 0; flex: 1; font-size: 1rem; }
      .ms-gaveta-corpo { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 10px 0 16px; }
      .sheet-mensagens .ms-busca-prod { margin-bottom: 4px; }
      .ms-prod-filtro { padding: 0 12px; font-weight: 500; font-size: 0.85rem; }
      .ms-prod-lista, .ms-resp-lista { list-style: none; margin: 0; padding: 0; }
      .ms-prod { display: flex; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #f0ece2; }
      .ms-prod-foto { flex: none; width: 72px; height: 90px; object-fit: cover; border-radius: 6px; background: #efe9dc; }
      .ms-prod-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .ms-prod-info b { font-size: 0.9rem; overflow-wrap: anywhere; }
      .ms-prod-preco { font-weight: 700; font-size: 0.85rem; color: #141414; }
      .ms-prod-det { font-size: 0.78rem; color: #4a443b; overflow-wrap: anywhere; }
      .ms-prod-acoes { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
      .ms-prod-acoes .ms-btn { min-height: 40px; padding: 6px 10px; font-size: 0.8rem; }
      .ms-previa { display: flex; align-items: center; padding: 0 8px; background: #fff; box-shadow: inset 0 1px 0 #f0ece2; }
      .ms-previa[hidden] { display: none; }
      .ms-previa label { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 0.82rem; color: #141414; cursor: pointer; }
      .ms-previa input { width: 20px; height: 20px; accent-color: #141414; margin: 0; }
      .ms-previa small { color: #4a443b; font-size: 0.76rem; }
      .ms-prod.marcado { background: #fff7ee; box-shadow: inset 3px 0 0 #E67E22; }
      .sheet-mensagens .ms-prod-marca { position: relative; flex: none; width: 72px; height: 90px; padding: 0; border: 0; border-radius: 6px; background: none; cursor: pointer; }
      .ms-prod-marca .ms-prod-foto { display: block; }
      .ms-prod-marca .ms-prod-caixa { position: absolute; top: 4px; left: 4px; width: 26px; height: 26px; border-radius: 6px; border: 2px solid #141414; background: rgba(255,255,255,0.92); display: flex; align-items: center; justify-content: center; font: 800 0.95rem/1 Inter, Arial, sans-serif; color: #141414; }
      .ms-prod-marca[aria-pressed="true"] .ms-prod-caixa { background: #E67E22; border-color: #141414; }
      .sheet-mensagens .ms-prod-marca:focus-visible { outline: 3px solid #141414; outline-offset: 2px; }
      .ms-prod-dica { margin: 2px 12px 6px; font-size: 0.78rem; color: #4a443b; }
      .ms-prod-selbar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); border-top: 1px solid #e6e1d6; background: #fff; }
      .ms-prod-selbar[hidden] { display: none; }
      .ms-prod-selbar .ms-prod-conta { flex: 1 1 auto; font-weight: 700; font-size: 0.88rem; }
      .ms-prod-selbar .ms-btn { min-height: 44px; }
      .ms-prod-selbar .ms-prod-env { display: flex; gap: 8px; flex: 1 1 100%; }
      .ms-prod-selbar .ms-prod-env .ms-btn { flex: 1; }
      .sheet-mensagens .ms-resp { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; padding: 10px 14px; min-height: 56px; border: 0; border-bottom: 1px solid #f0ece2; background: #fff; font: inherit; cursor: pointer; }
      .sheet-mensagens .ms-resp:hover, .sheet-mensagens .ms-resp:focus-visible { background: #faf7f0; }
      .ms-resp b { font-size: 0.9rem; } .ms-resp span { font-size: 0.8rem; color: #4a443b; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: pre-line; }
      .ms-gaveta-corpo > .ms-linha, .ms-gaveta-corpo > .ms-cfg-res { padding: 0 12px; margin-left: 0; }
      .ms-resp-edit { padding: 0 12px; }
      .ms-resp-item { border: 1px solid #e6e1d6; border-radius: 8px; padding: 8px 10px; margin: 0 0 8px; display: flex; flex-direction: column; gap: 6px; }
      .ms-resp-item legend { font-size: 0.78rem; font-weight: 700; padding: 0 4px; }
      .ms-resp-item textarea { font: inherit; font-size: 0.85rem; resize: vertical; }
      .ms-bolha b { font-weight: 700; } .ms-bolha s { opacity: 0.8; }
      .ms-motivos { position: absolute; inset: 0; z-index: 9; background: rgba(0,0,0,0.45); display: flex; align-items: flex-end; justify-content: center; }
      @media (min-width: 860px) { .ms-motivos { align-items: center; } }
      .ms-motivos-box { background: #fff; width: 100%; max-width: 440px; border-radius: 14px 14px 0 0; padding: 14px 14px calc(14px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 8px; max-height: 92%; overflow-y: auto; }
      @media (min-width: 860px) { .ms-motivos-box { border-radius: 14px; } }
      .ms-motivos-box h3 { margin: 0; font-size: 1.02rem; }
      .ms-motivos-box .ms-cfg-res { margin: 0 0 2px; }
      .sheet-mensagens .ms-motivo { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; min-height: 56px; padding: 10px 12px; border: 1px solid #e3ddd3; border-radius: 10px; background: #fff; font: inherit; text-align: left; cursor: pointer; }
      .sheet-mensagens .ms-motivo:hover, .sheet-mensagens .ms-motivo:focus-visible { border-color: #141414; }
      .sheet-mensagens .ms-motivo.padrao { border: 2px solid #141414; }
      .ms-motivo b { font-size: 0.92rem; } .ms-motivo span { font-size: 0.78rem; color: #4a443b; }
      .sheet-mensagens .ms-motivo-cancelar { align-self: stretch; }
      .ms-motivo-tag { flex: none; font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #f1ede3; color: #3d362c; white-space: nowrap; }
      .ms-motivo-tag.ms-motivo-vendeu { background: #e8f3ec; color: #0f6b3f; } .ms-motivo-tag.ms-motivo-sem_resposta { background: #fff1e0; color: #7a3a00; } .ms-motivo-tag.ms-motivo-engano { background: #f3e8e8; color: #7a1f1f; }
      .ms-assina[hidden] { display: none; }
      .ms-assina b { color: #141414; }
      .ms-assina input { flex: 1 1 auto; min-width: 0; min-height: 40px; padding: 6px 10px; border: 1px solid #ccc; border-radius: 8px; font: inherit; font-size: 0.9rem; }
      .ms-assina .ms-btn { min-height: 40px; padding: 6px 12px; }
      /* v7.40.9: respostas automáticas (gaveta) e selo "Automática" na bolha */
      .ms-auto-tag { font-size: 0.68rem; font-weight: 700; color: #5c3a00; background: #fff1dc; border-radius: 4px; padding: 0 5px; margin-right: 4px; }
      .ms-auto { padding: 0 14px; }
      .ms-auto-agora { margin: 0 0 4px; padding: 8px 10px; border-radius: 8px; background: #f7f4ec; font-size: 0.85rem; font-weight: 600; color: #333; }
      .ms-auto-sec { padding: 8px 0 12px; border-bottom: 1px solid #f0ece5; }
      .ms-auto-sec .ms-cfg-linha { font-size: 0.95rem; }
      .ms-auto-exp { margin: 2px 0 8px; font-size: 0.8rem; color: #4a443b; line-height: 1.4; }
      .ms-auto textarea.ms-copia { font: inherit; font-size: 0.9rem; line-height: 1.35; resize: vertical; min-height: 96px; background: #fff; }
      .ms-auto-feriados { list-style: none; margin: 0; padding: 0; }
      .ms-auto-feriados li { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; border-bottom: 1px solid #f0ece5; font-size: 0.9rem; }
      .ms-auto .ms-linha input[type=date] { flex: 1 1 150px; width: auto; min-height: 44px; font-size: 0.9rem; background: #fff; }
      .ms-auto-pe { display: flex; justify-content: flex-end; padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); border-top: 1px solid #e6e1d6; background: #fff; }
      .ms-auto-pe .ms-btn { min-width: 120px; min-height: 48px; }
      .ms-resp-dica { margin: 8px 12px 0; font-size: 0.78rem; color: #4a443b; }
      .sheet-mensagens .ms-link-btn { min-height: 44px; padding: 0 6px; border: 0; background: none; color: #7a3a00; font: inherit; font-size: 0.78rem; font-weight: 700; text-decoration: underline; cursor: pointer; }
      .ms-atendente { color: #0f6b3f; }
      .ms-cfg-tit { margin: 12px 0 0; font-weight: 700; }
      .ms-rel-quando { margin: 0 0 6px; font-size: 0.8rem; color: #4a443b; }
      #ms-estado-wrap .ms-caixa { max-height: 58dvh; overflow-y: auto; overscroll-behavior: contain; }
      .ms-contatos { border-top: 1px solid #eee; margin-top: 10px; padding-top: 2px; } .ms-contatos .ms-copia { margin: 4px 0; }
      .ms-rel-sec { border: 1px solid #e6e1d6; border-radius: 10px; margin: 8px 0; background: #fff; }
      .ms-rel-sec summary { min-height: 44px; display: flex; align-items: center; padding: 0 12px; font-weight: 700; cursor: pointer; }
      .ms-rel-lista { margin: 0; padding: 0 12px 10px 28px; font-size: 0.82rem; } .ms-rel-lista li { margin: 4px 0; overflow-wrap: anywhere; } .ms-cfg-tit.ms-cfg-tit1 { margin-top: 0; }
      /* conversa */
      .ms-cab { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid #e6e1d6; background: #fff; }
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
    const selbar = el('div', 'ms-selbar'); selbar.id = 'ms-selbar'; selbar.hidden = true; selbar.setAttribute('role', 'toolbar'); selbar.setAttribute('aria-label', 'Conversas selecionadas');
    const saudeEl = el('div', 'ms-saude'); saudeEl.id = 'ms-saude'; saudeEl.hidden = true; saudeEl.setAttribute('role', 'alert');
    lat.append(topo, saudeEl, abas, filtros, busq, estado, wrap, selbar);
    // v7.22: segurar o dedo numa conversa começa a seleção (como no WhatsApp)
    ul.addEventListener('pointerdown', (ev) => { const b = ev.target.closest('.ms-conv'); if (!b || selecao) return; clearTimeout(timerToque); toqueLongo = false; timerToque = setTimeout(() => { toqueLongo = true; iniciarSelecao_(Number(b.dataset.id)); if (navigator.vibrate) try { navigator.vibrate(20); } catch (e) { /* sem vibração */ } }, 550); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => ul.addEventListener(t, () => clearTimeout(timerToque)));
    ul.addEventListener('scroll', () => clearTimeout(timerToque), { passive: true });
    ul.addEventListener('contextmenu', (ev) => { if (ev.target.closest('.ms-conv')) ev.preventDefault(); });
    const conv = el('section', 'ms-conversa'); conv.id = 'ms-conversa'; conv.setAttribute('aria-label', 'Conversa');
    conv.appendChild(vazioConversa_());
    app.append(lat, conv); sheet.appendChild(app); sheet.appendChild(av); o.appendChild(sheet); document.body.appendChild(o);
    o.addEventListener('click', clique);
    // v7.21: liga/desliga "marcar como lida no celular" de cada canal
    o.addEventListener('change', async (ev) => {
      const ass = ev.target && ev.target.dataset && ev.target.dataset.cfgAssinatura ? ev.target : null;
      if (ass && cfgLeitura) {
        ass.disabled = true; const r = await worker_('/msg/config', 'POST', { assinatura: ass.checked }); ass.disabled = false;
        if (r.ok) { cfgLeitura.config = r.config; aviso_(r.config.assinatura ? 'O nome do atendente vai antes das respostas.' : 'As respostas saem sem o nome do atendente.'); desenharAssina_(false); } else { ass.checked = !ass.checked; aviso_(r.erro || 'Não foi possível salvar agora.'); }
        return;
      }
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
    if (ev.key === 'Escape' && $('ms-motivos')) { fecharMotivos_(); ev.stopPropagation(); return; }
    if (ev.key === 'Escape' && $('ms-gaveta')) { fecharGaveta_(); const t = $('ms-texto'); if (t) t.focus(); ev.stopPropagation(); return; }
    if (ev.key === 'Escape' && selecao && !menuAberto) { sairSelecao_(); ev.stopPropagation(); return; }
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
    const vazio = { conversas: 0, nao_lidas: 0, sem_resposta: 0, grupos: 0, ambos: 0, encerradas: 0 };
    if (contagens && contagens[id]) return Object.assign({}, vazio, contagens[id]);
    if (id === 'todos') return CANAIS.reduce((t, [k]) => { const c = contagemDe_(k); Object.keys(vazio).forEach((q) => { t[q] += c[q] || 0; }); return t; }, Object.assign({}, vazio));
    return resumo && resumo.canais[id] ? Object.assign({}, vazio, { conversas: resumo.canais[id].conversas, nao_lidas: resumo.canais[id].naoLidas || 0 }) : vazio;
  }
  /* v7.40.4: etiquetas */
  let ETQ = null, etqFiltro = 0, etqCarregando = false;
  const COR_ETQ_ = { cinza: '#7d776d', ambar: '#c98a00', azul: '#3a6fd8', verde: '#2e8b57', roxo: '#7a4fd1', rosa: '#c2477a' };
  function pontoEtq_(e) { const d = el('span', 'ms-etq-ponto'); d.style.background = COR_ETQ_[e.cor] || COR_ETQ_.cinza; d.setAttribute('aria-hidden', 'true'); return d; }
  function tagEtq_(e) { const t = el('span', 'ms-etq'); t.append(pontoEtq_(e), document.createTextNode(e.nome)); return t; }
  async function carregarEtiquetas_() { if (etqCarregando) return; etqCarregando = true; const r = await worker_('/msg/etiquetas', 'GET'); etqCarregando = false; ETQ = r && r.ok ? r.etiquetas : []; desenharFiltros(); }
  function faixaEtq_(c) {
    const f = el('div', 'ms-etq-faixa'); f.id = 'ms-etq-faixa';
    if (c.dono) { f.appendChild(el('span', 'ms-dono-tag', 'Responsável: ' + c.dono)); f.appendChild(botao('ms-etq-mais', 'Liberar', 'liberar')); }   // v7.40.6
    else f.appendChild(botao('ms-etq-mais', 'Assumir', 'assumir'));
    (c.etiquetas || []).forEach((e) => f.appendChild(tagEtq_(e)));
    f.appendChild(botao('ms-etq-mais', (c.etiquetas || []).length ? 'Mudar etiquetas' : '+ Etiqueta', 'etiquetas'));
    return f;
  }
  function abrirEtiquetas_() {
    if (!aberta) return; const corpo = gaveta_('Etiquetas'); if (!corpo) return;
    const tem = new Set((aberta.etiquetas || []).map((e) => e.id)), lista = ETQ || [];
    const grupo = (titulo, itens, tipo) => {
      if (!itens.length) return; corpo.appendChild(el('p', 'ms-etq-rot', titulo));
      itens.forEach((e) => { const lb = el('label', 'ms-etq-op'), i = el('input'); i.type = tipo; i.name = tipo === 'radio' ? 'ms-etq-venda' : 'ms-etq-' + e.id; i.value = String(e.id); i.checked = tem.has(e.id); lb.append(i, pontoEtq_(e), document.createTextNode(e.nome)); corpo.appendChild(lb); });
    };
    grupo('Etapa da venda · uma por vez', lista.filter((e) => e.venda), 'radio');
    grupo('Outras', lista.filter((e) => !e.venda), 'checkbox');
    const pe = el('div', 'ms-etq-pe'); pe.append(botao('ms-btn', 'Tirar etapa', 'etq-sem-etapa'), botao('ms-btn prim', 'Salvar', 'etq-salvar')); corpo.appendChild(pe);
  }
  async function salvarEtiquetas_() {
    const g = $('ms-gaveta'); if (!g || !aberta) return;
    const ids = Array.from(g.querySelectorAll('.ms-etq-op input:checked')).map((i) => Number(i.value));
    const c = aberta, r = await worker_('/msg/rotular', 'POST', { conversa: c.id, etiquetas: ids });
    if (!r.ok) { aviso_(r.erro || 'Não salvei as etiquetas. Tente de novo.'); return; }
    c.etiquetas = r.etiquetas; fecharGaveta_(); const fx = $('ms-etq-faixa'); if (fx) fx.replaceWith(faixaEtq_(c));
    aviso_('Etiquetas salvas.'); ETQ = null; desenharFiltros(); await carregarLista(false);
  }
  function desenharFiltros() {
    const f = $('ms-filtros'); if (!f) return;
    const c = contVista || contagemDe_(canal), t = contTipos || { individuais: Math.max(0, (c.conversas || 0) - (c.grupos || 0)), grupos: c.grupos || 0 };
    f.textContent = '';
    if (canal !== 'instagram') {
      [['msg', 'Mensagens', t.individuais], ['grp', 'Grupos', t.grupos]].forEach(([id, nome, n]) => {
        const b = botao('ms-chip ms-chip-tipo', nome + (n > 0 ? ' · ' + n : ''), 'tipo', { tipo: id }); b.setAttribute('aria-pressed', String(!!tipos[id])); f.appendChild(b);
      });
      f.appendChild(el('span', 'ms-chip-sep'));
    }
    FILTROS.forEach(([id, nome]) => {
      if (id === 'ambos' && (canal === 'instagram' || !tipos.msg)) return;
      const n = id === 'nao_lidas' ? c.nao_lidas : id === 'sem_resposta' ? c.sem_resposta : id === 'ambos' ? c.ambos : id === 'encerradas' ? c.encerradas : 0;
      const b = botao('ms-chip' + (id === 'ambos' && n > 0 ? ' alerta' : ''), nome + (n > 0 ? ' · ' + n : ''), 'filtro', { filtro: id }); b.setAttribute('aria-pressed', String(id === filtro)); f.appendChild(b);
    });
    if (!ETQ) { carregarEtiquetas_(); return; }
    if (ETQ.length) {   // v7.40.4: filtro por etiqueta (pessoas)
      f.appendChild(el('span', 'ms-chip-sep'));
      ETQ.forEach((e) => { const b = botao('ms-chip ms-chip-etq', '', 'etq', { id: String(e.id) }); b.append(pontoEtq_(e), document.createTextNode(e.nome + (e.pessoas > 0 ? ' · ' + e.pessoas : ''))); b.setAttribute('aria-pressed', String(etqFiltro === e.id)); f.appendChild(b); });
    }
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
    caixa.appendChild(el('p', 'ms-cfg-tit ms-cfg-tit1', 'Leitura no celular'));
    caixa.appendChild(el('p', '', 'Ao abrir uma conversa normalmente, ela fica lida aqui no painel e, com a opção ligada, também no celular oficial (o WhatsApp/Instagram da loja mostra como lida e o cliente vê os dois tiques azuis, se ele tiver isso ligado). O botão “Espiar” nunca marca como lida, nem aqui nem no celular.'));
    if (!cfgLeitura) { caixa.appendChild(el('p', '', 'Carregando…')); carregarCfgLeitura_(); return caixa; }
    CANAIS.forEach(([id, nome]) => {
      const lab = el('label', 'ms-cfg-linha'), chk = el('input'); chk.type = 'checkbox'; chk.checked = !!cfgLeitura.config.lerCelular[id]; chk.dataset.cfgCanal = id;
      lab.append(chk, document.createTextNode(' ' + nome + ': marcar como lida no celular ao abrir'));
      caixa.appendChild(lab);
      const u = cfgLeitura.ultimaLeitura && cfgLeitura.ultimaLeitura[id];
      if (u) caixa.appendChild(el('p', 'ms-cfg-res ' + (u.ok ? 'ms-ok' : 'ms-pausa'), (u.ok ? 'Última confirmação no celular: ' : 'Última tentativa não confirmada: ') + hora(u.em) + (u.ok ? '' : ' — ' + (u.erro || 'sem resposta'))));
    });
    // v7.22: nome do atendente antes da resposta
    caixa.appendChild(el('p', 'ms-cfg-tit', 'Nome do atendente nas respostas'));
    const la = el('label', 'ms-cfg-linha'), ca = el('input'); ca.type = 'checkbox'; ca.checked = cfgLeitura.config.assinatura !== false; ca.dataset.cfgAssinatura = '1';
    la.append(ca, document.createTextNode(' Mostrar o nome de quem responde antes da mensagem')); caixa.appendChild(la);
    caixa.appendChild(el('p', 'ms-cfg-res', 'Sai assim: “' + (nomeAtendente_() || 'Pablo') + ': Temos sim!” (no WhatsApp, o nome vai em negrito).'));
    const ln = el('div', 'ms-linha'), inp = el('input', 'ms-copia'); inp.id = 'ms-meu-nome'; inp.type = 'text'; inp.maxLength = 30; inp.autocomplete = 'off'; inp.value = cfgLeitura.meuNome || ''; inp.placeholder = nomePadrao_() ? 'Seu nome (padrão: ' + nomePadrao_() + ')' : 'Seu nome nas respostas'; inp.setAttribute('aria-label', 'Seu nome nas respostas');
    inp.style.flex = '1 1 160px'; inp.style.width = 'auto'; ln.append(inp, botao('ms-btn', 'Salvar nome', 'nome-salvar-cfg')); caixa.appendChild(ln);
    caixa.appendChild(blocoContatos_());
    const l = el('div', 'ms-linha'); l.appendChild(botao('ms-btn', 'Fechar', 'leitura-cfg')); caixa.appendChild(l);
    return caixa;
  }
  /* ---- v7.28: Google Contatos pela ponte (fase de leitura: cópia de segurança e relatório da primeira limpeza) ---- */
  let contatosSit = null;
  async function carregarContatos_() {
    const r = await worker_('/msg/contatos/situacao', 'GET');
    contatosSit = r.ok ? r : { ligada: false, erro: r.erro };
    if (painel === 'leitura') desenharEstado();
  }
  /* v7.35/7.36: trabalhos longos da ponte (15 mil+ contatos): o painel repete as partes, mostra o progresso numa faixa fixa,
   * segura a tela acesa (Wake Lock, quando o aparelho deixa) e avisa antes de sair da página no meio */
  let trabalho = null, travaTela = null;
  const numBR_ = (n) => Number(n || 0).toLocaleString('pt-BR');
  async function segurarTela_() { try { if (trabalho && navigator.wakeLock && document.visibilityState === 'visible') travaTela = await navigator.wakeLock.request('screen'); } catch (e) { travaTela = null; } }
  function soltarTela_() { try { if (travaTela) travaTela.release(); } catch (e) { /* já solta */ } travaTela = null; }
  document.addEventListener('visibilitychange', () => { if (trabalho && document.visibilityState === 'visible') segurarTela_(); });
  function avisoSaida_(ev) { if (!trabalho) return undefined; ev.preventDefault(); ev.returnValue = ''; return ''; }
  function desenharTrabalho_() {
    let f = $('ms-trab'); const sheet = document.querySelector('.sheet-mensagens');
    if (!trabalho) { if (f) f.remove(); return; }
    if (!f) { if (!sheet) return; f = el('div', 'ms-trab'); f.id = 'ms-trab'; f.setAttribute('role', 'status'); sheet.appendChild(f); }
    const pct = trabalho.total ? Math.min(100, Math.round(trabalho.feito * 100 / trabalho.total)) : 0;
    f.textContent = '';
    f.appendChild(el('b', '', '⏳ ' + (trabalho.etapa || '') + trabalho.titulo + (trabalho.total ? ': ' + numBR_(trabalho.feito) + ' de ' + numBR_(trabalho.total) + ' ' + (trabalho.unidade || 'contatos') + ' (' + pct + '%)' : '…')));
    const pr = el('progress'); pr.max = 100; pr.value = pct; pr.setAttribute('aria-label', trabalho.titulo); f.appendChild(pr);
    f.appendChild(el('small', '', 'Não feche esta tela. Ela fica acesa até terminar.'));
  }
  /* fases: [{ titulo, unidade, passo(estado) -> { ok, fim, feito, total, estado }, depois?() -> {ok} }]. Sem rede, tenta a mesma parte de novo (até 3 vezes). */
  async function rodarFases_(fases) {
    if (trabalho) return { ok: false, erro: 'Já há uma operação dos contatos em andamento.' };
    trabalho = { titulo: fases[0].titulo, unidade: fases[0].unidade || 'contatos', etapa: '', feito: 0, total: 0 }; window.addEventListener('beforeunload', avisoSaida_); segurarTela_(); desenharTrabalho_();
    const travados = Array.from(document.querySelectorAll('#ms-contatos button:not([disabled]), .ms-relatorio button[data-ms=ponte-limpar]')); travados.forEach((x) => { x.disabled = true; });
    try {
      let r = { ok: true };
      for (let i = 0; i < fases.length; i++) {
        const f = fases[i]; Object.assign(trabalho, { titulo: f.titulo, unidade: f.unidade || 'contatos', etapa: fases.length > 1 ? 'Etapa ' + (i + 1) + ' de ' + fases.length + ' · ' : '', feito: 0, total: 0 }); desenharTrabalho_();
        let estado = {}, acabou = false;
        for (let volta = 0; volta < 400 && !acabou; volta++) {
          for (let t = 0; t < 3; t++) { r = await f.passo(estado); if (r.ok || !r.semRede) break; await new Promise((ok) => setTimeout(ok, 2000 * (t + 1))); }
          if (!r.ok) return r;
          trabalho.feito = Number(r.feito) || 0; trabalho.total = Math.max(Number(r.total) || 0, trabalho.feito); desenharTrabalho_();
          acabou = !!r.fim; estado = r.estado || {};
        }
        if (!acabou) return { ok: false, erro: 'A operação passou do limite de partes. Tente de novo.' };
        if (f.depois) { const d = await f.depois(); if (!d.ok) return d; r = d; }
      }
      return r;
    } finally { trabalho = null; window.removeEventListener('beforeunload', avisoSaida_); soltarTela_(); desenharTrabalho_(); travados.forEach((x) => { if (x.isConnected) x.disabled = false; }); }
  }
  const rodarTrabalho_ = (titulo, passo) => rodarFases_([{ titulo: titulo, passo: passo }]);
  const faseCopia_ = () => ({ titulo: 'Copiando os contatos do Google', passo: async (e) => {
    const x = await worker_('/msg/contatos/backup', 'POST', { partes: true, pagina: e.pagina || undefined, pasta: e.pasta || undefined });
    return x.ok ? { ok: true, fim: x.fim, feito: x.lidos, total: x.totalPessoas, estado: { pagina: x.proxima, pasta: x.pasta } } : x;
  } });
  const faseLeitura_ = () => ({ titulo: 'Lendo os contatos para o relatório', passo: async (e) => {
    if (!e.iniciado) { const i = await worker_('/msg/contatos/relatorio', 'POST', { etapa: 'inicio' }); if (!i.ok) return i; }
    const x = await worker_('/msg/contatos/relatorio', 'POST', { etapa: 'parte', pagina: e.pagina || undefined });
    return x.ok ? { ok: true, fim: !x.proxima, feito: x.lidos, total: x.total, estado: { pagina: x.proxima, iniciado: true } } : x;
  }, depois: () => worker_('/msg/contatos/relatorio', 'POST', { etapa: 'fim' }) });
  /* v7.35: a situação das ações da ponte fica escrita dentro do quadro (não some em 9 s): cópia e relatório podem passar de um minuto */
  let pontesSt = '';
  function pontesStatus_(t) { pontesSt = t || ''; const e = $('ms-ponte-st'); if (e) { e.textContent = pontesSt; e.hidden = !pontesSt; } }
  function blocoContatos_() {
    const b = el('div', 'ms-contatos'); b.id = 'ms-contatos';
    b.appendChild(el('p', 'ms-cfg-tit', 'Google Contatos (marcador “Tenkiter Clientes G”)'));
    if (!contatosSit) { b.appendChild(el('p', 'ms-cfg-res', 'Carregando…')); carregarContatos_(); return b; }
    if (!contatosSit.ligada) {
      b.appendChild(el('p', 'ms-cfg-res', 'Ainda não ligado. Publique a ponte (contatos-ponte) na conta dos contatos e cole aqui o endereço da implantação e a chave que a função “configurar” mostrou.'));
      const u = el('input', 'ms-copia'); u.id = 'ms-ponte-url'; u.type = 'url'; u.placeholder = 'https://script.google.com/macros/s/…/exec'; u.setAttribute('aria-label', 'Endereço da ponte do Google Contatos');
      const k = el('input', 'ms-copia'); k.id = 'ms-ponte-chave'; k.type = 'password'; k.autocomplete = 'new-password'; k.placeholder = 'Chave da ponte'; k.setAttribute('aria-label', 'Chave da ponte do Google Contatos');
      const l = el('div', 'ms-linha'); l.appendChild(botao('ms-btn prim', 'Ligar a ponte', 'ponte-ligar'));
      const st = el('p', 'ms-cfg-res ms-ponte-st', pontesSt || ''); st.id = 'ms-ponte-st'; st.setAttribute('role', 'status'); st.hidden = !pontesSt;
      b.append(u, k, l, st); return b;
    }
    b.appendChild(el('p', 'ms-ok', 'Ligada à conta ' + (contatosSit.conta || '(sem e-mail)') + '.'));
    const bk = contatosSit.backup;
    const pb = el('p', 'ms-cfg-res', bk ? 'Última cópia de segurança: ' + hora(bk.em) + ' (' + numBR_(bk.total) + ' contatos). ' : 'Antes de qualquer limpeza, faça uma cópia de segurança dos contatos (fica no Drive da conta dos contatos).');
    if (bk && bk.url) { const a = el('a', 'ms-link', 'Abrir no Drive'); a.href = bk.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; pb.appendChild(a); }
    b.appendChild(pb);
    const st = el('p', 'ms-cfg-res ms-ponte-st', pontesSt || ''); st.id = 'ms-ponte-st'; st.setAttribute('role', 'status'); st.hidden = !pontesSt; b.appendChild(st);
    const l = el('div', 'ms-linha');
    l.appendChild(botao('ms-btn', 'Fazer cópia de segurança', 'ponte-backup'));
    const rel = botao('ms-btn prim', 'Gerar relatório da limpeza', 'ponte-relatorio'); rel.disabled = !bk; l.appendChild(rel);
    b.appendChild(l);
    b.appendChild(el('p', 'ms-cfg-res', 'O relatório só lê os contatos: nada muda no Google até você aprovar.'));
    const lp = contatosSit.limpeza;
    if (lp) b.appendChild(el('p', 'ms-ok', 'Limpeza feita ' + hora(lp.em) + ': ' + numBR_(lp.juntados) + ' pessoas juntadas, ' + numBR_(lp.padronizados) + ' números padronizados, ' + numBR_(lp.criados) + ' contatos novos.'));
    const au = el('label', 'ms-cfg-linha'), ac = el('input'); ac.type = 'checkbox'; ac.checked = !!contatosSit.auto; ac.dataset.ms = 'ponte-auto';
    au.append(ac, document.createTextNode(' Cadastrar sozinho os números novos do WhatsApp no Google (“TM Cliente nome ou número”)')); b.appendChild(au);
    const fl = contatosSit.fila || {};
    if (fl.feitos || fl.pendentes || fl.falhas) b.appendChild(el('p', 'ms-cfg-res', 'Cadastro automático: ' + numBR_(fl.feitos) + ' criados' + (fl.pendentes ? ', ' + numBR_(fl.pendentes) + ' na fila' : '') + (fl.falhas ? ', ' + numBR_(fl.falhas) + ' com erro' : '') + '.'));
    const l2 = el('div', 'ms-linha'); l2.appendChild(botao('ms-link-btn', 'Ver o último relatório', 'ponte-ver')); l2.appendChild(botao('ms-link-btn', 'Desligar a ponte', 'ponte-desligar')); b.appendChild(l2);
    return b;
  }
  function mostrarRelatorio_(r) {
    painel = 'metricas'; const ex = $('ms-extra'), ul = $('ms-lista'); ul.hidden = true; chrome_(true); ex.textContent = '';
    const p = el('div', 'ms-painel ms-relatorio');
    const topo = el('div', 'ms-linha'); topo.appendChild(botao('ms-btn', '← Conversas', 'fechar-painel')); p.appendChild(topo);
    p.appendChild(el('h3', '', 'Relatório da primeira limpeza dos contatos'));
    if (!r) { p.appendChild(el('p', 'ms-vazio', 'Ainda não há relatório. Gere em ⋯ → Configurações → Google Contatos.')); ex.appendChild(p); return; }
    p.appendChild(el('p', 'ms-rel-quando', 'Gerado ' + hora(r.em) + '. Nada foi mudado no Google.'));
    const cards = el('div', 'ms-cards');
    const card = (v, t, alerta) => { const c = el('div', 'ms-card' + (alerta ? ' alerta' : '')); c.appendChild(el('b', '', String(v))); c.appendChild(el('span', '', t)); cards.appendChild(c); };
    card(r.total, 'contatos no Google');
    card(r.duplicados.total, 'pessoas repetidas (' + r.duplicados.contatosEnvolvidos + ' contatos)', r.duplicados.total > 0);
    card(r.corrigir.total, 'números a padronizar', r.corrigir.total > 0);
    card(r.invalidos.total, 'números inválidos', r.invalidos.total > 0);
    card(r.semFone, 'contatos sem número');
    card(r.semCadastro.total, 'conversaram no WhatsApp e não estão no Google', r.semCadastro.total > 0);
    p.appendChild(cards);
    const secao = (titulo, lista, total, linha) => {
      const d = el('details', 'ms-rel-sec'); d.appendChild(el('summary', '', titulo + ' (' + total + ')'));
      const u2 = el('ul', 'ms-rel-lista'); lista.slice(0, 80).forEach((x) => u2.appendChild(el('li', '', linha(x))));
      if (total > 80) u2.appendChild(el('li', 'ms-cfg-res', '… e mais ' + (total - 80) + '.'));
      if (!total) u2.appendChild(el('li', 'ms-cfg-res', 'Nenhum.'));
      d.appendChild(u2); p.appendChild(d);
    };
    secao('Pessoas repetidas (vão virar um contato só)', r.duplicados.lista, r.duplicados.total, (g) => g.contatos.map((c) => (c.n || 'Sem nome') + ' ' + (c.f || []).join(', ')).join(' + '));
    secao('Números a padronizar', r.corrigir.lista, r.corrigir.total, (x) => (x.n || 'Sem nome') + ': ' + x.de + ' → ' + x.para);
    secao('Números inválidos (ficam como estão; confira à mão)', r.invalidos.lista, r.invalidos.total, (x) => (x.n || 'Sem nome') + ': ' + x.f);
    secao('Conversaram no WhatsApp e não estão no Google (vão ser criados no marcador)', r.semCadastro.lista, r.semCadastro.total, (x) => (x.nome || 'Sem nome') + ' · ' + foneBonito_(x.fone) + ' · ' + (NOME_CANAL[x.canal] || x.canal));
    const ap = el('div', 'ms-rel-aprovar');
    ap.appendChild(el('p', 'ms-cfg-res', 'Limpeza aprovada: juntar as repetidas (fica o nome mais completo; os outros vão para a observação), padronizar os números (+55 e o 9 do celular; 9 dígitos sem DDD ganham o 88; fixo não ganha o 9) e criar quem conversou como “TM Cliente …” no marcador “Tenkiter Clientes G”. Antes, faz uma cópia de segurança nova. Depois, cada número novo entra sozinho.'));
    ap.appendChild(botao('ms-btn prim', 'Aplicar a limpeza aprovada', 'ponte-limpar'));
    p.appendChild(ap);
    ex.appendChild(p);
  }
  async function carregarCfgLeitura_() {
    const r = await worker_('/msg/config', 'GET');
    cfgLeitura = r.ok ? r : { config: { lerCelular: { whatsapp1: true, whatsapp2: true, instagram: true }, assinatura: true }, ultimaLeitura: {}, meuNome: '' };
    if (painel === 'leitura') desenharEstado();
    desenharAssina_();
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
    if (c.nao_lidas > 0 && !esp && !selecao) { esp = botao('ms-espiar', '', 'espiar', { id: String(c.id) }); esp.innerHTML = '<svg class="ms-olho" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg><span>Espiar</span>'; esp.setAttribute('aria-label', 'Espiar ' + rotuloContato(c) + ' sem marcar como lida'); li.appendChild(esp); }
    else if ((!(c.nao_lidas > 0) || selecao) && esp) esp.remove();
    const b = li.firstChild, nova = c.nao_lidas > 0, saiu = c.ult_dir === 'saida', espera = c.ult_dir === 'entrada' && !c.grupo;
    b.className = 'ms-conv' + (nova ? ' nova' : ''); if (aberta && aberta.id === c.id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    const marcada = !!(selecao && selecao.has(c.id));
    if (selecao) b.setAttribute('aria-pressed', String(marcada)); else b.removeAttribute('aria-pressed');
    const assinatura = [c.dono || '', (c.etiquetas || []).map((e) => e.id + e.nome + e.cor).join('|'), canal === 'todos' ? c.canal : '', c.nome, c.ultima_em, c.previa, c.nao_lidas, c.ult_dir, c.ult_status, espera ? Math.floor(Date.now() / 60000) : '', aberta && aberta.id === c.id, c.outro_id || '', c.encerrada_motivo || '', selecao ? (marcada ? 'S' : 's') : ''].join('|');
    if (li.dataset.ass === assinatura) return li;
    li.dataset.ass = assinatura; b.textContent = '';
    let av;
    if (selecao) { av = el('span', 'ms-marca', marcada ? '✓' : ''); av.setAttribute('aria-hidden', 'true'); }
    else { av = el('span', 'ms-av', iniciais(c)); av.style.background = corAvatar(c); av.setAttribute('aria-hidden', 'true'); }
    const corpo = el('span', 'ms-conv-corpo');
    const l1 = el('span', 'ms-l1'); l1.appendChild(el('span', 'ms-nome', rotuloContato(c)));
    l1.appendChild(el('time', '', horaLista(c.ultima_em)));
    // v7.22: canal e número numa linha própria, pequena: o nome fica inteiro e o número também (o nome é o que a pessoa colocou no WhatsApp)
    const l3 = el('span', 'ms-l3');
    if (canal === 'todos' && NOME_CANAL_[c.canal]) l3.appendChild(el('span', 'ms-canal-tag ms-canal-' + c.canal, NOME_CANAL_[c.canal]));
    if (c.encerrada_em && NOME_MOTIVO_[c.encerrada_motivo]) l3.appendChild(el('span', 'ms-motivo-tag ms-motivo-' + c.encerrada_motivo, NOME_MOTIVO_[c.encerrada_motivo]));
    if (c.nome && !c.grupo && /^\d{10,15}$/.test(c.contato || '')) l3.appendChild(el('span', 'ms-fone', foneBonito_(c.contato)));
    if (c.dono) l3.appendChild(el('span', 'ms-dono-tag', 'Resp.: ' + c.dono));
    (c.etiquetas || []).slice(0, 2).forEach((e) => l3.appendChild(tagEtq_(e)));
    const l2 = el('span', 'ms-l2'); const pv = el('span', 'ms-previa');
    if (saiu) { pv.appendChild(selo(c.ult_status || 'enviada')); pv.appendChild(document.createTextNode('Você: ')); }
    const pr = /^\[(.+)\]$/.exec(c.previa || ''); pv.appendChild(document.createTextNode(pr ? (TIPO_ROTULO[pr[1]] || c.previa) : semFormatacao_(c.previa))); l2.appendChild(pv);
    if (nova) { const bd = el('span', 'ms-badge', c.nao_lidas > 99 ? '99+' : String(c.nao_lidas)); bd.setAttribute('aria-label', c.nao_lidas + ' não lidas'); l2.appendChild(bd); }
    corpo.append(l1, l2); if (l3.firstChild) corpo.appendChild(l3);
    if (espera) corpo.appendChild(el('span', 'ms-aguarda', 'Falta responder · há ' + espera_(c.ult_entrada_em || c.ultima_em)));
    if (c.outro_id) corpo.appendChild(el('span', 'ms-ambos-tag', 'Também no ' + NOME_CANAL[outroCanal_(c)]));
    b.append(av, corpo);
    return li;
  }
  const outroCanal_ = (c) => (c.canal === 'whatsapp1' ? 'whatsapp2' : 'whatsapp1');
  /* ---- v7.22: nome do atendente antes da resposta ("*Pablo:*" no WhatsApp, em negrito; "Pablo:" no Instagram) ---- */
  function nomePadrao_() {
    let n = ''; try { n = typeof usuarioAdmin !== 'undefined' && usuarioAdmin ? String(usuarioAdmin.nome || '') : ''; } catch (e) { n = ''; }
    n = n.trim().split(/\s+/)[0] || '';
    return n && n === n.toUpperCase() ? n.charAt(0) + n.slice(1).toLowerCase() : n;
  }
  const nomeAtendente_ = () => (cfgLeitura && cfgLeitura.meuNome) || nomePadrao_();
  const assinaturaLigada_ = () => !(cfgLeitura && cfgLeitura.config && cfgLeitura.config.assinatura === false);
  function assinar_(c, texto) {
    const n = nomeAtendente_(); if (!texto || !n || !assinaturaLigada_()) return texto;
    return c.canal === 'instagram' ? n + ':\n' + texto : '*' + n + ':*\n' + texto;
  }
  const RE_ASSINATURA_ = /^\*([^*\n]{1,30}):\*\n/;
  /* v7.24: barra acima da caixa de mensagem = ferramentas de atendimento (Produtos, Respostas rápidas) + a assinatura */
  const ICO_ = {
    nota: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/></svg>',
    sacola: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    raio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3 5 14h6l-1 7 8-11h-6l1-7z"/></svg>',
    lapis: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>'
  };
  function botaoIco_(cls, ico, texto, acao) { const b = botao(cls, '', acao); b.innerHTML = ICO_[ico]; b.appendChild(el('span', '', texto)); return b; }
  function desenharAssina_(editando) {
    const w = $('ms-assina'); if (!w) return;
    w.textContent = ''; w.hidden = espiando; if (w.hidden) return;
    const n = nomeAtendente_(), lig = assinaturaLigada_();
    if (lig && (editando || !n)) {
      const i = el('input'); i.id = 'ms-meu-nome-rapido'; i.type = 'text'; i.maxLength = 30; i.autocomplete = 'off'; i.value = n; i.placeholder = 'Seu nome nas respostas'; i.setAttribute('aria-label', 'Seu nome nas respostas');
      i.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); salvarNome_(i.value); } else if (ev.key === 'Escape' && n) { ev.stopPropagation(); desenharAssina_(false); } });
      w.append(el('span', '', 'Assinar como'), i, botao('ms-btn', 'Salvar', 'nome-salvar'));
      if (editando) setTimeout(() => i.focus(), 0);
      return;
    }
    w.append(botaoIco_('ms-ferr-btn', 'sacola', 'Produtos', 'gaveta-produtos'), botaoIco_('ms-ferr-btn', 'raio', 'Respostas', 'gaveta-respostas'), botaoIco_('ms-ferr-btn ms-nota-btn', 'nota', 'Nota', 'modo-nota'));
    if (lig) {
      const b = botao('ms-ferr-btn ms-assina-btn', '', 'nome-editar'); b.title = 'Respondendo como ' + n + ' · tocar para mudar o nome';
      b.append(el('span', 'ms-sr', 'Respondendo como '), el('b', '', n)); b.insertAdjacentHTML('beforeend', ICO_.lapis); b.setAttribute('aria-label', 'Respondendo como ' + n + '. Mudar nome');
      w.appendChild(b);
    }
  }
  /* ---- v7.24: gaveta da conversa (Produtos do catálogo e Respostas rápidas): por cima da conversa, sem perder o que foi digitado ---- */
  const semAcento_ = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function produtosCatalogo_() { try { return typeof window.tkProdutosLista === 'function' ? (window.tkProdutosLista() || []) : []; } catch (e) { return []; } }
  const ativo_ = (p) => !p.Status || String(p.Status).trim().toLowerCase() === 'ativo';
  const esgotado_ = (p) => p.Estoque !== '' && p.Estoque != null && Number(p.Estoque) <= 0;
  function precoTexto_(p) {
    if (!(Number(p.Preco) > 0)) return 'Consulte valor';
    const f = typeof precoTerminacao === 'function' ? precoTerminacao(p.Preco) : null, v = f && f.valido ? f.avista : Number(p.Preco);
    return (typeof formatarReal === 'function' ? formatarReal(v) : 'R$ ' + v.toFixed(2).replace('.', ',')) + ' à vista';
  }
  const tamanhosDe_ = (p) => String(p.Tamanhos || '').split(',').map((x) => x.trim()).filter(Boolean);
  function linkDe_(p) { try { return typeof linkProduto === 'function' ? linkProduto(p) : ''; } catch (e) { return ''; } }
  function textoProduto_(p) {
    const tam = tamanhosDe_(p), wa = !aberta || aberta.canal !== 'instagram';
    return [(wa ? '*' + p.Nome + '*' : p.Nome), precoTexto_(p), tam.length ? 'Tamanhos: ' + tam.join(', ') : '', p.Cores ? 'Cores: ' + p.Cores : '', linkDe_(p)].filter(Boolean).join('\n');
  }
  function colocarNaMensagem_(txt) {
    const ta = $('ms-texto'); if (!ta) return;
    ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n\n' : '') + txt;
    ta.dispatchEvent(new Event('input', { bubbles: true })); fecharGaveta_(); ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { /* campo sem seleção */ }
  }
  /* o "voltar" do celular fecha a gaveta; cada gaveta tem um número para o "voltar" atrasado de uma gaveta anterior não fechar a nova */
  let genGaveta = 0;
  const removerAte_ = (n) => () => { const e = $('ms-gaveta'); if (e && Number(e.dataset.gen) <= n) e.remove(); };
  document.addEventListener('tk:camada-fechada', (ev) => {
    if (!ev.detail || ev.detail.chave !== 'ms-gaveta') return;
    setTimeout(() => { const e = $('ms-gaveta'); if (e && window.TKCamadas && !TKCamadas.aberta('ms-gaveta')) TKCamadas.empilhar('ms-gaveta', removerAte_(Number(e.dataset.gen))); }, 0);
  });
  function fecharGaveta_() { const g = $('ms-gaveta'); if (!g) return; g.remove(); if (window.TKCamadas && TKCamadas.aberta('ms-gaveta')) TKCamadas.desempilhar('ms-gaveta'); }
  function gaveta_(titulo) {
    // v7.40.9: no celular, com a lista à mostra (ex.: gavetas abertas pelo menu ⋯), a gaveta cobre o app inteiro em vez da conversa escondida
    fecharGaveta_(); const cv = $('ms-conversa'), pai = cv && cv.getClientRects().length ? cv : $('ms-app'); if (!pai) return null;
    const g = el('div', 'ms-gaveta'); g.id = 'ms-gaveta'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-label', titulo);
    const cab = el('div', 'ms-gaveta-cab'); cab.appendChild(el('h3', '', titulo));
    const x = botao('ms-ico', '✕', 'gaveta-fechar'); x.setAttribute('aria-label', 'Fechar ' + titulo); cab.appendChild(x);
    const corpo = el('div', 'ms-gaveta-corpo'); g.append(cab, corpo); g.dataset.gen = String(++genGaveta); pai.appendChild(g);
    if (window.TKCamadas && !TKCamadas.aberta('ms-gaveta')) TKCamadas.empilhar('ms-gaveta', removerAte_(genGaveta));
    x.focus();                    // o foco entra na gaveta (Esc e leitor de tela); Produtos depois leva o foco para a busca
    return corpo;
  }
  async function abrirProdutos_() {
    const corpo = gaveta_('Produtos'); if (!corpo) return;
    if(APP_RECENTES&&!produtosCatalogo_().length&&typeof carregarProdutos==='function'){
      corpo.textContent='Carregando produtos…';await carregarProdutos();
      if(!corpo.isConnected)return;corpo.textContent='';
    }
    const idConv = aberta ? aberta.id : null; if (idConv !== prodSelConv) { prodSel = []; prodSelConv = idConv; }
    const q = el('input', 'ms-busca ms-busca-prod'); q.id = 'ms-prod-busca'; q.type = 'search'; q.placeholder = 'Nome, código, cor ou tamanho'; q.setAttribute('aria-label', 'Buscar produto');
    const so = el('label', 'ms-cfg-linha ms-prod-filtro'), chk = el('input'); chk.type = 'checkbox'; chk.id = 'ms-prod-estoque'; chk.checked = true; so.append(chk, document.createTextNode(' Só com estoque'));
    const ul = el('ul', 'ms-prod-lista'); ul.id = 'ms-prod-lista'; ul.setAttribute('aria-live', 'polite');
    const dica = el('p', 'ms-prod-dica', 'Toque na foto para selecionar várias peças e mandar um link só.');
    corpo.append(q, so, dica, ul);
    const bar = el('div', 'ms-prod-selbar'); bar.id = 'ms-prod-selbar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Peças selecionadas'); bar.hidden = true;
    const conta = el('span', 'ms-prod-conta'); conta.id = 'ms-prod-conta'; conta.setAttribute('aria-live', 'polite');
    const env = el('div', 'ms-prod-env');
    env.append(botao('ms-btn', 'Copiar link', 'prodsel-link'), botao('ms-btn prim', 'Enviar seleção', 'prodsel-usar'));
    bar.append(conta, botao('ms-btn', 'Limpar', 'prodsel-limpar'), env);
    corpo.parentNode.appendChild(bar);
    const pintar = () => {
      const termos = semAcento_(q.value).split(/\s+/).filter(Boolean);
      let ps = produtosCatalogo_().filter(ativo_);
      if (chk.checked) ps = ps.filter((p) => !esgotado_(p));
      if (termos.length) ps = ps.filter((p) => { const t = semAcento_([p.Nome, p.Codigo, p.Categoria, p.Cores, p.Tamanhos, p.Genero].join(' ')); return termos.every((x) => t.indexOf(x) >= 0); });
      ul.textContent = '';
      if (!produtosCatalogo_().length) { ul.appendChild(el('li', 'ms-vazio', 'O catálogo ainda está carregando. Tente de novo em alguns segundos.')); return; }
      if (!ps.length) { ul.appendChild(el('li', 'ms-vazio', termos.length ? 'Nenhum produto com “' + q.value.trim() + '”.' + (chk.checked ? ' Desmarque “Só com estoque” para ver os esgotados.' : '') : 'Nenhum produto ativo.')); return; }
      ps.slice(0, 40).forEach((p) => {
        const li = el('li', 'ms-prod');
        const img = el('img', 'ms-prod-foto'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
        const src = typeof fotoMini === 'function' ? fotoMini(p.Foto_URL, 160) : p.Foto_URL; if (src) img.setAttribute('src', src);
        const sim = prodSelecionado_(p.ID), marca = botao('ms-prod-marca', '', 'prod-marcar', { id: String(p.ID) });
        marca.setAttribute('aria-pressed', sim ? 'true' : 'false'); marca.setAttribute('aria-label', 'Selecionar ' + (p.Nome || 'peça') + (p.Codigo ? ' ' + p.Codigo : ''));
        marca.append(img, el('span', 'ms-prod-caixa', sim ? '✓' : '')); marca.lastChild.setAttribute('aria-hidden', 'true');
        if (sim) li.classList.add('marcado');
        const info = el('div', 'ms-prod-info');
        info.appendChild(el('b', '', p.Nome || 'Sem nome'));
        info.appendChild(el('span', 'ms-prod-preco', precoTexto_(p) + (p.Codigo ? ' · ' + p.Codigo : '')));
        const tam = tamanhosDe_(p);
        info.appendChild(el('span', 'ms-prod-det', (tam.length ? tam.join(' · ') : 'Tamanho não informado') + (esgotado_(p) ? ' · Esgotado' : p.Estoque !== '' && p.Estoque != null ? ' · ' + p.Estoque + ' em estoque' : '')));
        const acoes = el('div', 'ms-prod-acoes');
        acoes.appendChild(botao('ms-btn prim', 'Colocar na mensagem', 'prod-usar', { id: String(p.ID) }));
        if (linkDe_(p)) acoes.appendChild(botao('ms-btn', 'Copiar link', 'prod-link', { id: String(p.ID) }));
        info.appendChild(acoes);
        li.append(marca, info); ul.appendChild(li);
      });
      if (ps.length > 40) ul.appendChild(el('li', 'ms-vazio', 'Mostrando 40 de ' + ps.length + '. Escreva mais para achar mais rápido.'));
    };
    q.addEventListener('input', pintar); chk.addEventListener('change', pintar); pintar(); desenharSelProd_();
    setTimeout(() => q.focus(), 0);
  }
  const produtoPorId_ = (id) => produtosCatalogo_().find((p) => String(p.ID) === String(id));
  /* v7.29: seleção de produtos (igual ao "Selecionar" da loja): várias peças numa mensagem só, com o link ?sel= do site.
     A seleção vale para a conversa aberta e continua entre buscas; some ao enviar ou ao trocar de conversa. */
  const MAX_SEL_PROD = 60;
  let prodSel = [], prodSelConv = null;
  const prodSelecionado_ = (id) => prodSel.indexOf(String(id)) >= 0;
  function linkSelecao_(ps) {
    const site = typeof SITE_URL !== 'undefined' ? SITE_URL : '';
    return site ? site + '?sel=' + ps.slice(0, MAX_SEL_PROD).map((p) => encodeURIComponent(String(p.Codigo || p.ID))).join(',') : '';
  }
  function textoSelecao_(ps) {
    const n = Math.min(ps.length, MAX_SEL_PROD), link = linkSelecao_(ps);
    let mostrar = Math.min(n, 12), msg = '';
    do {
      const linhas = ps.slice(0, mostrar).map((p) => '• ' + (p.Nome || 'Peça') + (p.Codigo ? ' (' + p.Codigo + ')' : '') + ' — ' + precoTexto_(p)).join('\n') + (n > mostrar ? '\n… e mais ' + (n - mostrar) + (n - mostrar === 1 ? ' peça' : ' peças') : '');
      msg = 'Olha as peças que separei na TENKiTER Modas (' + n + (n === 1 ? ' peça' : ' peças') + '):\n' + linhas + (link ? '\n\nToque para ver as fotos de cada uma:\n' + link : '');
      mostrar--;
    } while (msg.length > 1500 && mostrar > 0);
    return msg;
  }
  const produtosSelecionados_ = () => prodSel.map(produtoPorId_).filter(Boolean);
  function desenharSelProd_() {
    const bar = $('ms-prod-selbar'); if (!bar) return;
    const n = produtosSelecionados_().length;
    bar.hidden = !n;
    const c = $('ms-prod-conta'); if (c) c.textContent = n + (n === 1 ? ' peça selecionada' : ' peças selecionadas');
  }
  function marcarProduto_(b) {
    const id = String(b.dataset.id), li = b.closest('.ms-prod'), k = prodSel.indexOf(id);
    if (k >= 0) prodSel.splice(k, 1);
    else { if (prodSel.length >= MAX_SEL_PROD) { aviso_('Dá para mandar até ' + MAX_SEL_PROD + ' peças num link.'); return; } prodSel.push(id); }
    const sim = k < 0;
    b.setAttribute('aria-pressed', sim ? 'true' : 'false');
    const cx = b.querySelector('.ms-prod-caixa'); if (cx) cx.textContent = sim ? '✓' : '';
    if (li) li.classList.toggle('marcado', sim);
    desenharSelProd_();
  }
  /* respostas rápidas: as da loja (salvas no servidor) ou, enquanto ninguém salvou, só com o que o site já sabe */
  function respostasPadrao_() {
    const L = typeof LOJA !== 'undefined' ? LOJA : null, site = typeof SITE_URL !== 'undefined' ? SITE_URL : '';
    return [
      L && L.endereco ? { t: 'Endereço da loja', x: 'Nosso endereço: ' + L.endereco + (L.mapaUrl ? '\nComo chegar: ' + L.mapaUrl : '') } : null,
      site ? { t: 'Catálogo no site', x: 'Veja todas as peças no nosso catálogo: ' + site } : null,
      L && L.instagramUrl ? { t: 'Instagram', x: 'Siga a gente no Instagram: ' + L.instagramUrl } : null
    ].filter(Boolean);
  }
  const respostas_ = () => (cfgLeitura && Array.isArray(cfgLeitura.respostas) ? cfgLeitura.respostas : respostasPadrao_());
  /* v7.40.9: [nome] vira o nome da atendente (menos no Pix, onde [nome] é a titular da chave); o primeiro [lacuna] fica selecionado para completar */
  const RE_LACUNA_ = /\[(nome|chave pix|valor[^\]\n]{0,20})\]/i;
  function textoResposta_(x) { const n = nomeAtendente_(); return n && !/pix/i.test(x) ? String(x).replace(/\[nome\]/g, n) : String(x); }
  function marcarLacuna_(desde) {
    const ta = $('ms-texto'); if (!ta) return false;
    const resto = ta.value.slice(desde || 0), mt = RE_LACUNA_.exec(resto); if (!mt) return false;
    const i = (desde || 0) + mt.index; try { ta.focus(); ta.setSelectionRange(i, i + mt[0].length); } catch (e) { /* campo sem seleção */ }
    aviso_('Complete o que está entre colchetes antes de enviar.'); return true;
  }
  function colocarResposta_(x) {
    const ta = $('ms-texto'), txt = textoResposta_(x); colocarNaMensagem_(txt);
    if (ta) marcarLacuna_(Math.max(0, ta.value.length - txt.length));
  }
  function expandirAtalho_(ta) {
    const mt = /^\/([a-z0-9_-]{1,38})\s$/i.exec(ta.value); if (!mt) return false;
    const r = respostas_().find((z) => String(z.t || '').toLowerCase() === '/' + mt[1].toLowerCase()); if (!r) return false;
    ta.value = ''; colocarResposta_(r.x); return true;
  }
  function abrirRespostas_(editando) {
    const corpo = gaveta_('Respostas rápidas'); if (!corpo) return;
    if (!editando) {
      const lista = respostas_(), ul = el('ul', 'ms-resp-lista');
      if (!lista.length) ul.appendChild(el('li', 'ms-vazio', 'Nenhuma resposta salva ainda.'));
      lista.forEach((r, i) => { const li = el('li'), b = botao('ms-resp', '', 'resp-usar', { i: String(i) }); b.append(el('b', '', r.t), el('span', '', r.x)); li.appendChild(b); ul.appendChild(li); });
      corpo.appendChild(ul);
      if (lista.some((r) => /^\/\S/.test(r.t || ''))) corpo.appendChild(el('p', 'ms-resp-dica', 'Atalho: escreva /oi (ou outro título com /) e um espaço na mensagem.'));
      const l = el('div', 'ms-linha'); l.appendChild(botao('ms-btn', 'Editar respostas', 'resp-editar')); corpo.appendChild(l);
      if (!(cfgLeitura && Array.isArray(cfgLeitura.respostas))) corpo.appendChild(el('p', 'ms-cfg-res', 'Estas são as respostas iniciais, com o que o site já sabe da loja. Em “Editar respostas” dá para colocar horário, formas de pagamento, entrega e o que mais a equipe repete.'));
      return;
    }
    const lista = respostas_().map((r) => ({ t: r.t, x: r.x })), box = el('div', 'ms-resp-edit'); box.id = 'ms-resp-edit';
    const desenhar = () => {
      box.textContent = '';
      lista.forEach((r, i) => {
        const f = el('fieldset', 'ms-resp-item'); f.appendChild(el('legend', '', 'Resposta ' + (i + 1)));
        const t = el('input', 'ms-copia'); t.value = r.t; t.maxLength = 40; t.placeholder = 'Título (ex.: Horário)'; t.setAttribute('aria-label', 'Título da resposta ' + (i + 1)); t.addEventListener('input', () => { r.t = t.value; });
        const x = el('textarea', 'ms-copia'); x.value = r.x; x.maxLength = 1000; x.rows = 3; x.placeholder = 'Texto que vai para o cliente'; x.setAttribute('aria-label', 'Texto da resposta ' + (i + 1)); x.addEventListener('input', () => { r.x = x.value; });
        const rm = botao('ms-link-btn', 'Remover', ''); rm.addEventListener('click', () => { lista.splice(i, 1); desenhar(); });
        f.append(t, x, rm); box.appendChild(f);
      });
      const l = el('div', 'ms-linha'), add = botao('ms-btn', '+ Nova resposta', '');
      add.addEventListener('click', () => { if (lista.length >= 30) return; lista.push({ t: '', x: '' }); desenhar(); const ins = box.querySelectorAll('input'); if (ins.length) ins[ins.length - 1].focus(); });
      const salvar = botao('ms-btn prim', 'Salvar respostas', ''); salvar.addEventListener('click', async () => {
        salvar.disabled = true; const r = await worker_('/msg/config', 'POST', { respostas: lista.filter((z) => z.t.trim() && z.x.trim()) }); salvar.disabled = false;
        if (!r.ok) { aviso_(r.erro || 'Não foi possível salvar agora.'); return; }
        cfgLeitura = Object.assign({}, cfgLeitura || {}, { respostas: r.respostas || [] }); aviso_('Respostas salvas para toda a equipe.'); abrirRespostas_(false);
      });
      l.append(add, salvar); box.appendChild(l);
    };
    desenhar(); corpo.appendChild(box);
  }
  /* ---- v7.40.9: respostas automáticas (desligadas por padrão). Tudo é salvo junto, no botão Salvar fixo no pé da gaveta ---- */
  let autoEdit_ = null, autoUlt_ = null;
  const dataCurta_ = (iso) => String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4);
  async function abrirAuto_() {
    const corpo = gaveta_('Respostas automáticas'); if (!corpo) return;
    const g = $('ms-gaveta'), gen = g.dataset.gen; corpo.appendChild(el('p', 'ms-vazio', 'Carregando…'));
    const r = await worker_('/msg/auto', 'GET');
    const g2 = $('ms-gaveta'); if (!g2 || g2.dataset.gen !== gen) return;      // a pessoa fechou ou abriu outra gaveta enquanto carregava
    if (!r.ok) { corpo.textContent = ''; corpo.appendChild(el('p', 'ms-vazio', r.erro || 'Não foi possível carregar agora. Feche e abra de novo.')); return; }
    autoEdit_ = JSON.parse(JSON.stringify(r.auto)); autoUlt_ = r; desenharAuto_();
    const pe = el('div', 'ms-auto-pe'); pe.appendChild(botao('ms-btn prim', 'Salvar', 'auto-salvar')); g2.appendChild(pe);
  }
  function desenharAuto_() {
    const g = $('ms-gaveta'), corpo = g && g.querySelector('.ms-gaveta-corpo'); if (!corpo || !autoEdit_) return;
    const rolagem = corpo.scrollTop; corpo.textContent = '';
    const w = el('div', 'ms-auto'), ag = (autoUlt_ && autoUlt_.agora) || {};
    w.appendChild(el('p', 'ms-auto-agora', ag.aberta ? 'Agora a loja está aberta.' : 'Agora a loja está fechada · abre ' + (ag.abertura || 'em breve') + '.'));
    const secao = (k, titulo, explica) => {
      const s = el('section', 'ms-auto-sec'), lb = el('label', 'ms-cfg-linha'), c = el('input'); c.type = 'checkbox'; c.checked = !!autoEdit_[k].ligado;
      c.addEventListener('change', () => { autoEdit_[k].ligado = c.checked; });
      lb.append(c, document.createTextNode(titulo)); s.appendChild(lb); s.appendChild(el('p', 'ms-auto-exp', explica));
      const ta = el('textarea', 'ms-copia'); ta.rows = 4; ta.maxLength = 1000; ta.value = autoEdit_[k].texto; ta.setAttribute('aria-label', 'Texto da mensagem de ' + titulo.toLowerCase());
      ta.addEventListener('input', () => { autoEdit_[k].texto = ta.value; }); s.appendChild(ta); w.appendChild(s);
    };
    secao('boasVindas', 'Boas-vindas', 'Loja aberta: quando o cliente escreve e a conversa estava parada havia 12 h. Sai uma vez, na hora.');
    secao('foraHorario', 'Fora do horário', 'Loja fechada: no máximo 1 vez por conversa até a loja abrir. {abertura} vira o dia e a hora, como “amanhã às 7h30”.');
    const h = el('section', 'ms-auto-sec');
    h.appendChild(el('p', 'ms-etq-rot', 'Horário da loja'));
    h.appendChild(el('p', 'ms-auto-exp', 'Segunda a sexta, 7h30 às 18h · Sábado, 7h30 às 14h · Domingo fechado'));
    h.appendChild(el('p', 'ms-etq-rot', 'Feriados com comércio aberto (8h às 13h)'));
    const ul = el('ul', 'ms-auto-feriados');
    if (!autoEdit_.feriados.length) ul.appendChild(el('li', '', 'Nenhum feriado cadastrado.'));
    autoEdit_.feriados.forEach((d) => { const li = el('li'), x = botao('ms-link-btn', 'Remover', 'auto-feriado-tirar', { d: d }); x.setAttribute('aria-label', 'Remover o feriado de ' + dataCurta_(d)); li.append(el('span', '', dataCurta_(d)), x); ul.appendChild(li); });
    h.appendChild(ul);
    const ln = el('div', 'ms-linha'), di = el('input', 'ms-copia'); di.type = 'date'; di.id = 'ms-auto-data'; di.setAttribute('aria-label', 'Data do feriado');
    ln.append(di, botao('ms-btn', 'Incluir feriado', 'auto-feriado-add')); h.appendChild(ln); w.appendChild(h);
    w.appendChild(el('p', 'ms-auto-exp', 'Nunca vai para grupos, respostas a status sem texto nem mensagens da própria loja. A mensagem automática aparece na conversa com o selo “Automática” e a conversa continua em “Falta responder”.'));
    const u = autoUlt_ && autoUlt_.ultimo;
    if (u && u.em) { const d = new Date(u.em); w.appendChild(el('p', 'ms-auto-exp' + (u.ok ? '' : ' ms-pausa'), 'Último envio automático: ' + (isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + (u.ok ? ' · enviado' : ' · não confirmado: ' + (u.erro || 'sem resposta')))); }
    corpo.appendChild(w); corpo.scrollTop = rolagem;
  }
  async function salvarAuto_(b) {
    if (!autoEdit_) return;
    b.disabled = true; const r = await worker_('/msg/auto', 'POST', autoEdit_); b.disabled = false;
    if (!r.ok) { aviso_(r.erro || 'Não foi possível salvar agora. Tente de novo.'); return; }
    autoEdit_ = JSON.parse(JSON.stringify(r.auto)); autoUlt_ = r; desenharAuto_();
    const n = (r.auto.boasVindas.ligado ? 1 : 0) + (r.auto.foraHorario.ligado ? 1 : 0);
    aviso_(n ? 'Salvo. ' + (n === 2 ? 'As duas respostas automáticas estão ligadas.' : (r.auto.boasVindas.ligado ? 'Boas-vindas ligada.' : 'Fora do horário ligada.')) : 'Salvo. As respostas automáticas estão desligadas.');
  }
  async function salvarNome_(v) {
    const r = await worker_('/msg/config', 'POST', { meuNome: String(v || '') });
    if (!r.ok) { aviso_(r.erro || 'Não foi possível salvar agora.'); return; }
    cfgLeitura = Object.assign({}, cfgLeitura || {}, { config: r.config, meuNome: r.meuNome || '' });
    aviso_('Nome salvo: as próximas respostas saem como “' + nomeAtendente_() + '”.');
    desenharAssina_(false); if (painel === 'leitura') desenharEstado();
  }
  /* ---- v7.22: seleção de várias conversas para encerrar (ou reabrir, no filtro Encerradas) ---- */
  function iniciarSelecao_(id) {
    selecao = new Set(id ? [id] : []); fecharMenu(); pintarLista(); desenharSelbar_();
    if (!id) { const c = $('ms-selbar') && $('ms-selbar').querySelector('[data-ms=sel-sair]'); if (c) c.focus(); }   // pelo menu: o foco fica na barra (Esc e leitor de tela funcionam)
  }
  function sairSelecao_() { selecao = null; pintarLista(); desenharSelbar_(); }
  function desenharSelbar_() {
    const bar = $('ms-selbar'); if (!bar) return;
    bar.textContent = ''; bar.hidden = !selecao; if (!selecao) return;
    const n = selecao.size, reabrir = filtro === 'encerradas';
    const topo = el('div', 'ms-sel-topo');
    topo.appendChild(el('span', n ? 'ms-sel-n' : 'ms-sel-n dica', n ? n + (n === 1 ? ' selecionada' : ' selecionadas') : 'Toque nas conversas'));
    topo.appendChild(botao('ms-btn', lista.length && lista.every((c) => selecao.has(c.id)) ? 'Nenhuma' : 'Todas', 'sel-todas'));
    const x = botao('ms-btn', 'Cancelar', 'sel-sair'); topo.appendChild(x);
    // v7.24: ferramentas da seleção (lidas e não lidas aqui; lidas também no celular quando a opção do canal está ligada)
    const acoes = el('div', 'ms-sel-acoes');
    [['sel-lidas', 'Marcar lidas'], ['sel-naolidas', 'Não lidas'], ['sel-encerrar', (reabrir ? 'Reabrir' : 'Encerrar') + (n ? ' ' + n : '')]].forEach(([acao, txt], i) => {
      const b = botao('ms-btn' + (i === 2 ? ' prim' : ''), txt, acao); b.disabled = !n; acoes.appendChild(b);
    });
    bar.append(topo, acoes);
  }
  async function marcarLote_(ids, naoLida) {
    if (!ids.length) return;
    const r = await worker_('/msg/lida', 'POST', { conversas: ids, naoLida: !!naoLida, celular: !naoLida });
    if (!r.ok) { aviso_(r.erro || 'Não foi possível agora. Tente de novo.'); return; }
    if (r.contagens) contagens = Object.assign({}, contagens || {}, r.contagens);
    const n = r.alteradas || ids.length, cel = r.celular || {};
    let t = naoLida ? (n === 1 ? 'Marcada como não lida (só aqui no painel).' : n + ' marcadas como não lidas (só aqui no painel).') : (n === 1 ? 'Marcada como lida.' : n + ' marcadas como lidas.');
    if (!naoLida && cel.falhas) t += ' O celular não confirmou ' + cel.falhas + (cel.falhas === 1 ? ' delas' : ' delas') + ' (veja ⋯ → Configurações).';
    aviso_(t);
    if (aberta && ids.indexOf(aberta.id) >= 0) aberta.nao_lidas = naoLida ? 1 : 0;
    selecao = null; desenharSelbar_(); desenharAbas(); selarBotao();
    await carregarLista(true);
  }
  /* v7.27: motivo do encerramento. Concluído (padrão), Vendeu e Cliente parou de responder contam como atendimento resolvido na hora;
   * Engano ou spam fica fora das métricas. */
  const MOTIVOS_ = [['concluido', 'Concluído', 'O atendimento terminou. Conta como respondido agora.'], ['vendeu', 'Vendeu', 'Terminou com venda.'],
    ['sem_resposta', 'Cliente parou de responder', 'Fica no histórico do cliente.'], ['engano', 'Engano ou spam', 'Não entra nas métricas.']];
  const NOME_MOTIVO_ = { concluido: 'Concluído', vendeu: 'Vendeu', sem_resposta: 'Cliente parou de responder', engano: 'Engano ou spam' };
  let idsMotivo_ = null;
  function fecharMotivos_() { const m = $('ms-motivos'); if (m) m.remove(); idsMotivo_ = null; if (window.TKCamadas && TKCamadas.aberta('ms-motivos')) TKCamadas.desempilhar('ms-motivos'); }
  function escolherMotivo_(ids) {
    if (!ids.length) return;
    fecharMotivos_(); idsMotivo_ = ids.slice();
    const sheet = document.querySelector('.sheet-mensagens'); if (!sheet) return;
    const fundo = el('div', 'ms-motivos'); fundo.id = 'ms-motivos';
    const box = el('div', 'ms-motivos-box'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'ms-motivos-tit');
    const t = el('h3', '', ids.length === 1 ? 'Encerrar conversa' : 'Encerrar ' + ids.length + ' conversas'); t.id = 'ms-motivos-tit'; box.appendChild(t);
    box.appendChild(el('p', 'ms-cfg-res', 'Por que está encerrando?'));
    MOTIVOS_.forEach(([id, nome, desc], i) => { const b = botao('ms-motivo' + (i === 0 ? ' padrao' : ''), '', 'motivo', { m: id }); b.append(el('b', '', nome), el('span', '', desc)); box.appendChild(b); });
    box.appendChild(botao('ms-btn ms-motivo-cancelar', 'Cancelar', 'motivo-cancelar'));
    fundo.appendChild(box); sheet.appendChild(fundo);
    if (window.TKCamadas) TKCamadas.empilhar('ms-motivos', () => { const m = $('ms-motivos'); if (m) m.remove(); idsMotivo_ = null; });
    const p = box.querySelector('.ms-motivo'); if (p) p.focus();
  }
  async function encerrar_(ids, reabrir, motivo) {
    if (!ids.length) return;
    const r = await worker_('/msg/encerrar', 'POST', { conversas: ids, reabrir: !!reabrir, motivo: motivo || undefined });
    if (!r.ok) { aviso_(r.erro || 'Não foi possível agora. Tente de novo.'); return; }
    if (r.contagens) contagens = Object.assign({}, contagens || {}, r.contagens);
    const n = ids.length;
    aviso_(reabrir ? (n === 1 ? 'Conversa reaberta.' : n + ' conversas reabertas.') : (n === 1 ? 'Conversa encerrada' : n + ' conversas encerradas') + ' como “' + (NOME_MOTIVO_[motivo] || 'Concluído') + '”. ' + (n === 1 ? 'Ela volta sozinha' : 'Elas voltam sozinhas') + ' se o cliente escrever.');
    if (aberta && ids.indexOf(aberta.id) >= 0) { aberta.encerrada_em = reabrir ? '' : new Date().toISOString(); aberta.encerrada_motivo = reabrir ? '' : (motivo || 'concluido'); }
    selecao = null; desenharSelbar_(); desenharAbas(); desenharFiltros(); selarBotao();
    await carregarLista(true);
  }
  let indexandoNomes = false, nomesConferidos = false;
  async function nomesGoogle_(){if(indexandoNomes)return;indexandoNomes=true;try{for(let i=0;i<40;i++){const r=await worker_('/msg/pessoas/google','POST',{});if(!r.ok||r.fim)break;}await carregarLista(true);}finally{indexandoNomes=false;}}
  function pintarLista() {
    const ul = $('ms-lista'), extra = $('ms-extra'); if (!ul || painel === 'metricas') return;
    const vivos = new Set(lista.map((c) => c.id));
    if (selecao) { selecao.forEach((id) => { if (!vivos.has(id)) selecao.delete(id); }); desenharSelbar_(); }
    elConvs.forEach((li, id) => { if (!vivos.has(id)) { li.remove(); elConvs.delete(id); } });
    let ref = ul.firstChild;
    const blocos = new Map();
    lista.forEach(c=>{const key=c.grupo?'grupo:'+c.id:c.pessoa||'conversa:'+c.id;if(!blocos.has(key))blocos.set(key,[]);blocos.get(key).push(c);});
    [...blocos.values()].map(b=>b.sort((a,c)=>String(c.ultima_em).localeCompare(String(a.ultima_em))||c.id-a.id)).sort((a,b)=>String(b[0].ultima_em).localeCompare(String(a[0].ultima_em))||b[0].id-a[0].id).forEach(b=>b.forEach((c,i)=>{const li=linhaConversa(c);li.classList.toggle('ms-vinculada',i>0);li.style.marginLeft=i?'24px':'';li.style.background=i?'#faf8f3':'';if(li!==ref)ul.insertBefore(li,ref);else ref=ref.nextSibling;}));
    extra.textContent = '';
    if (!lista.length) {
      const m = busca.trim() ? 'Nenhuma conversa encontrada.' : filtro === 'nao_lidas' ? 'Nenhuma conversa não lida. 🎉' : filtro === 'sem_resposta' ? 'Ninguém esperando resposta agora. 🎉' : tipoParam_() === 'grupo' && !filtro ? 'Nenhum grupo aqui.' : filtro === 'ambos' ? 'Ninguém está falando pelos dois WhatsApp agora.' : filtro === 'encerradas' ? 'Nenhuma conversa encerrada. Para encerrar, segure o dedo numa conversa (ou ⋯ → Selecionar conversas).' : 'Ainda não chegou nenhuma mensagem neste canal.';
      extra.appendChild(el('p', 'ms-vazio', m));
    }
  }
  async function carregarLista(reset) {
    if(!nomesConferidos){nomesConferidos=true;setTimeout(nomesGoogle_,1500);}
    const mine = ++seqLista, c0 = canal, f0 = filtro, b0 = busca.trim(), t0 = tipoParam_();
    const path='/msg/conversas?canal=' + encodeURIComponent(canal) + '&filtro=' + encodeURIComponent(filtro) + (t0 ? '&tipo=' + t0 : '') + (b0 ? '&busca=' + encodeURIComponent(b0) : '') + (etqFiltro ? '&etiqueta=' + etqFiltro : '');
    const salvo = APP_RECENTES && reset ? await recentes_(path) : null;
    if (salvo && mine===seqLista) { lista=salvo.conversas;contVista=salvo.contagens||null;contTipos=salvo.tipos||null;desenharFiltros();pintarLista();$('ms-extra').textContent='Conversas recentes · atualizando…'; }
    const r = await worker_(path, 'GET');
    if (mine !== seqLista || c0 !== canal || f0 !== filtro || b0 !== busca.trim() || t0 !== tipoParam_()) return;       // resposta velha de outra aba/filtro/busca: ignora
    if (!r.ok && salvo && r.semRede) { $('ms-extra').textContent='Sem conexão · conversas salvas neste aparelho';return; }
    if (!r.ok) { if (reset || !lista.length) { lista = []; pintarLista(); $('ms-extra').textContent = ''; $('ms-extra').appendChild(el('p', 'ms-vazio', r.erro || 'Não foi possível carregar agora.')); } return; }
    lista = r.conversas; contVista = r.contagens || null; contTipos = r.tipos || null; cursor = r.cursor || cursor;
    if (!t0) contagens = Object.assign({}, contagens || {}, { [canal]: r.contagens });      // as abas mostram sempre o total do canal
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
  /* Quando o contexto exato não veio, mostrar candidatos sem afirmar que são o status respondido. */
  async function abrirStories_(m) {
    fecharLuz_(); const sheet = document.querySelector('.sheet-mensagens'); if (!sheet || !aberta) return;
    const l = el('div', 'ms-luz ms-stories'); l.id = 'ms-luz'; l.setAttribute('role', 'dialog'); l.setAttribute('aria-label', 'Stories no ar');
    const caixa = el('div', 'ms-st-caixa'); caixa.appendChild(el('b', '', 'Stories no ar antes desta mensagem'));
    caixa.appendChild(el('span', 'ms-ctx-det', 'O contexto exato desta mensagem não está disponível. Estes são candidatos publicados nas 26 h anteriores.'));
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
  /* v7.40.1–7.40.7: link de story em mensagens sem contexto (removido na 7.40.8) */

  function bolha(m) {
    let b = elMsgs.get(m.id);
    const ass = [m.autor_nome || '', m.autor_fone || '', ehGrupo_() ? Object.keys(nomesDoGrupo_()).length : 0, m.texto, m.tipo, m.status, m.erro || '', m.midia, m.localUrl || '', m.ctx_tipo || '', m.ctx_midia, m.ctx_texto || '', m.ctx_legenda || '', m.ctx_aprox, m.por || ''].join('|');
    if (b && b.dataset.ass === ass) return b;
    if (!b) { b = el('div'); elMsgs.set(m.id, b); }
    b.dataset.ass = ass; b.dataset.id = String(m.id); b.textContent = '';
    if (m.direcao === 'nota') {   // nota interna: largura total, amarela, nunca parece mensagem enviada
      b.className = 'ms-bolha ms-nota'; const d = new Date(m.enviada_em);
      b.append(el('span', 'ms-nota-rot', 'Só a equipe vê · ' + (m.autor || 'Equipe') + (isNaN(d) ? '' : ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))), el('div', 'ms-nota-tx', m.texto || ''));
      return b;
    }
    const falhou = m.status === 'falhou';
    b.className = 'ms-bolha ' + (m.direcao === 'saida' ? 'saida' : 'entrada') + (m.status === 'pendente' ? ' pendente' : '') + (falhou ? ' falhou' : '');
    const autor = autorEl_(m); if (autor) b.appendChild(autor);
    if (m.ctx_tipo === 'story') b.appendChild(blocoStory_(m)); else if (m.ctx_tipo === 'resposta' && (m.ctx_texto || m.ctx_qtipo)) b.appendChild(blocoCitacao_(m));
    const mid = blocoMidia_(m); if (mid) b.appendChild(mid);
    const sig = m.direcao === 'saida' && m.texto ? RE_ASSINATURA_.exec(m.texto) : null;
    if (sig) b.appendChild(el('span', 'ms-autor ms-atendente', sig[1]));
    const corpoTxt = sig ? m.texto.slice(sig[0].length) : m.texto;
    if (corpoTxt) formatarWa_(b, trocarMencoes_(corpoTxt));
    if (m.tipo && m.tipo !== 'texto' && !mid) b.appendChild(el('span', 'ms-tipo', (m.texto ? ' ' : '') + (TIPO_ROTULO[m.tipo] || '[' + m.tipo + ']') + (m.midia === 0 && m.direcao === 'entrada' && ['imagem', 'vídeo', 'áudio'].indexOf(m.tipo) >= 0 ? ' (arquivo não disponível)' : '')));
    /* v7.40.8: link "Foi resposta a um story?" removido; o contexto do story vem da Wafly quando ela envia a referência */
    const meta = el('span', 'ms-meta'); if (m.direcao === 'saida' && m.por === 'auto') meta.appendChild(el('span', 'ms-auto-tag', 'Automática'));
    meta.appendChild(el('time', '', m.enviada_em ? hm(new Date(m.enviada_em)) : ''));
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
  async function editarPessoa_(id){
    const r=await worker_('/msg/pessoa?conversa='+id,'GET');if(!r.ok){aviso_(r.erro||'Não foi possível abrir o contato.');return;}
    const old=$('ms-pessoa-editor');if(old)old.remove();
    const overlay=el('div');overlay.id='ms-pessoa-editor';Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'10020',background:'rgba(0,0,0,.4)',display:'flex',alignItems:'center',justifyContent:'center',padding:'12px'});
    const form=el('div');Object.assign(form.style,{background:'#fff',padding:'20px',borderRadius:'20px',width:'min(520px,100%)',maxHeight:'90dvh',overflowY:'auto'});form.setAttribute('role','dialog');form.setAttribute('aria-modal','true');form.setAttribute('aria-label','Contato e canais');form.appendChild(el('h2','','Contato e canais'));
    const field=(label,value)=>{const l=el('label','',label),input=el('input');input.value=value||'';input.setAttribute('aria-label',label);input.style.minHeight='48px';input.style.width='100%';l.appendChild(input);form.appendChild(l);return input;};
    const name=field('Nome',r.nome),phone=field('WhatsApp principal',r.whatsapp),second=field('Segundo WhatsApp (opcional)',r.segundo);phone.type=second.type='tel';
    const without=el('input');without.type='checkbox';without.checked=false;const info=el('label','','Cliente do Instagram não informou WhatsApp');info.prepend(without);info.hidden=r.conversa.canal!=='instagram';form.appendChild(info);
    const linked=new Set((r.canais||[]).map(x=>x.id));form.appendChild(el('p','',(r.canais||[]).map(x=>NOME_CANAL[x.canal]+' · '+rotuloContato(x)).join('\n')));
    const search=field('Buscar outro canal para vincular',''),results=el('div');form.appendChild(results);
    const find=el('button','','Buscar contato');find.type='button';find.style.minHeight='48px';find.onclick=async()=>{const found=await worker_('/msg/conversas?canal=todos&busca='+encodeURIComponent(search.value),'GET');results.textContent='';(found.conversas||[]).filter(c=>!c.grupo).forEach(c=>{const label=el('label'),check=el('input');check.type='checkbox';check.checked=linked.has(c.id);check.disabled=check.checked;check.onchange=()=>{if(check.checked){linked.add(c.id);if(c.canal!=='instagram'&&!phone.value){phone.value=c.contato;without.checked=false;}}else linked.delete(c.id);};label.append(check,document.createTextNode(rotuloContato(c)+' · '+NOME_CANAL[c.canal]));label.style.display='block';label.style.minHeight='48px';results.appendChild(label);});};form.appendChild(find);
    const finish=()=>{if(window.TKCamadas)TKCamadas.desempilhar('ms-pessoa');else overlay.remove();};
    const save=el('button','prim','Salvar nome e vínculos');save.type='button';save.style.minHeight='48px';save.onclick=async()=>{if(!confirm('Salvar este nome e reunir os canais escolhidos, preservando o histórico?'))return;save.disabled=true;const out=await worker_('/msg/pessoa','POST',{conversa:id,nome:name.value,whatsapp:phone.value,segundo:second.value,semWhatsApp:without.checked,vincular:[...linked]});save.disabled=false;if(!out.ok){aviso_(out.erro||'Não foi possível salvar.');return;}finish();await carregarLista(true);if(aberta&&aberta.id===id){aberta=out.conversa;montarConversa(aberta);pintarFio(false);}};
    const close=el('button','','Cancelar');close.type='button';close.style.minHeight='48px';close.onclick=finish;form.append(save,close);overlay.appendChild(form);document.body.appendChild(overlay);if(window.TKCamadas)TKCamadas.empilhar('ms-pessoa',()=>overlay.remove());name.focus();
  }
  function cabecalhoConversa(c) {
    const cab = el('div', 'ms-cab');
    const v = botao('ms-ico ms-voltar', '←', 'voltar'); v.setAttribute('aria-label', 'Voltar para as conversas');
    const av = el('span', 'ms-av', iniciais(c)); av.style.background = corAvatar(c); av.setAttribute('aria-hidden', 'true');
    const q = botao('ms-quem', '', 'pessoa');q.setAttribute('aria-label','Configurar contato e canais vinculados');q.style.textAlign='left';q.style.background='transparent';q.appendChild(el('b', '', rotuloContato(c)));
    q.appendChild(el('span', '', NOME_CANAL[c.canal] + (c.grupo ? ' · grupo' : (/^\d{10,15}$/.test(c.contato) ? ' · ' + foneBonito_(c.contato) : ''))));
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
    if ($('ms-gaveta')) fecharGaveta_();
    const pai = $('ms-conversa'); pai.textContent = '';
    pai.appendChild(cabecalhoConversa(c));
    if (!c.grupo) pai.appendChild(faixaEtq_(c));
    if (c.outro_id) {
      const f = el('div', 'ms-faixa ambos'); f.appendChild(el('span', '', 'Esta pessoa também está falando pelo ' + NOME_CANAL[outroCanal_(c)] + '.'));
      f.appendChild(botao('ms-btn', 'Abrir', 'abrir-outro', { id: String(c.outro_id), canal: outroCanal_(c) })); pai.appendChild(f);
    }
    if (c.encerrada_em) {
      const f = el('div', 'ms-faixa'); f.appendChild(el('span', '', 'Conversa encerrada' + (NOME_MOTIVO_[c.encerrada_motivo] ? ' (' + NOME_MOTIVO_[c.encerrada_motivo] + ')' : '') + '. Volta sozinha se o cliente escrever.'));
      f.appendChild(botao('ms-btn', 'Reabrir', 'reabrir')); pai.appendChild(f);
    }
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
    const assina = el('div', 'ms-assina'); assina.id = 'ms-assina'; pai.appendChild(assina);
    const prev = el('div', 'ms-previa'); prev.id = 'ms-previa'; prev.hidden = true;
    const prevL = el('label'), prevC = el('input'); prevC.type = 'checkbox'; prevC.id = 'ms-previa-chk'; prevC.checked = previaPreferida_(c.canal);
    prevC.addEventListener('change', () => guardarPrevia_(c.canal, prevC.checked));
    prevL.append(prevC, el('span', '', 'Mostrar prévia do link'), el('small', '', '(miniatura)')); prev.appendChild(prevL); pai.appendChild(prev);
    const form = el('div', 'ms-compor');
    const clip = botao('ms-ico', '📎', 'anexar'); clip.id = 'ms-anexar'; clip.setAttribute('aria-label', 'Anexar foto, vídeo ou áudio');
    const arq = el('input'); arq.type = 'file'; arq.id = 'ms-arquivo'; arq.hidden = true; arq.accept = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,audio/*';
    arq.addEventListener('change', () => { const f = arq.files && arq.files[0]; arq.value = ''; if (f) escolherArquivo_(f); });
    const ta = el('textarea'); ta.id = 'ms-texto'; ta.rows = 1; ta.placeholder = 'Mensagem'; if (c.canal !== 'instagram') ta.maxLength = limiteTexto(c); ta.setAttribute('aria-label', 'Mensagem para ' + rotuloContato(c)); ta.enterKeyHint = 'enter'; ta.value = rascunhoLer_(c.id);
    const mic = botao('ms-ico', '🎤', 'gravar'); mic.id = 'ms-mic'; mic.setAttribute('aria-label', 'Gravar áudio'); if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)) mic.hidden = true;
    const bt = botao('ms-enviar', 'Enviar', 'enviar'); bt.id = 'ms-enviar'; bt.disabled = !ta.value.trim() && !anexoPend;
    form.append(clip, arq, ta, mic, bt); pai.appendChild(form);
    if (espiando) form.hidden = true;        // para responder, toque em Atender (aí marca como lida)
    const cresce = () => { if (expandirAtalho_(ta)) return; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 132) + 'px'; bt.disabled = !ta.value.trim() && !anexoPend; rascunhoSalvar_(c.id, ta.value); desenharPrevia_(); };
    ta.addEventListener('input', cresce);
    ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && window.matchMedia('(pointer: fine)').matches) { ev.preventDefault(); enviar(); } });
    cresce(); desenharStage_(); desenharAssina_(false);
  }
  /* ---- v7.34: prévia do link (miniatura) escolhida em cada mensagem do WhatsApp; o último jeito usado em cada canal fica lembrado neste aparelho ---- */
  const LINK_RE_ = /https?:\/\/[^\s<>"']+/i;
  function previaPreferida_(canal) { try { return (JSON.parse(localStorage.getItem('tk_ms_previa_v1') || '{}') || {})[canal] === true; } catch (e) { return false; } }
  function guardarPrevia_(canal, sim) { try { const o = JSON.parse(localStorage.getItem('tk_ms_previa_v1') || '{}') || {}; o[canal] = !!sim; localStorage.setItem('tk_ms_previa_v1', JSON.stringify(o)); } catch (e) { /* só conforto */ } }
  function desenharPrevia_() {
    const w = $('ms-previa'), ta = $('ms-texto'); if (!w) return;
    w.hidden = !(aberta && aberta.canal !== 'instagram' && !anexoPend && ta && LINK_RE_.test(ta.value));
  }
  /* título e descrição do cartão: produto do site (nome e preço), seleção (?sel=) ou só o nome da loja; link de fora fica com o que o WhatsApp achar */
  function cartaoDoLink_(texto) {
    const m = String(texto || '').match(LINK_RE_); if (!m) return {};
    const link = m[0].replace(/[).,;:!?*_~]+$/, ''), site = typeof SITE_URL !== 'undefined' ? String(SITE_URL).replace(/\/+$/, '') : '';
    if (!site || link.indexOf(site) !== 0) return {};
    const pm = link.match(/\/p\/([^/?#]+)/), sel = link.match(/[?&]sel=([^&#]+)/);
    if (pm) {
      const cod = decodeURIComponent(pm[1]).toLowerCase(), p = produtosCatalogo_().find((x) => String(x.Codigo || '').toLowerCase() === cod || String(x.ID) === cod);
      if (p) { const tam = tamanhosDe_(p); return { titulo: p.Nome || 'TENKiTER Modas', descricao: precoTexto_(p) + (tam.length ? ' · ' + tam.join(', ') : '') }; }
    }
    if (sel) { const n = decodeURIComponent(sel[1]).split(',').filter(Boolean).length; return { titulo: 'Peças separadas para você', descricao: n + (n === 1 ? ' peça' : ' peças') + ' na TENKiTER Modas' }; }
    return { titulo: 'TENKiTER Modas', descricao: '' };
  }
  /* ---- anexos: foto (reduzida no aparelho), vídeo, áudio e gravação ---- */
  function desenharStage_() {
    const st = $('ms-stage'), bt = $('ms-enviar'), ta = $('ms-texto'); if (!st) return;
    desenharPrevia_();
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
    const path='/msg/mensagens?conversa=' + encodeURIComponent(id);
    const salvo=APP_RECENTES ? await recentes_(path) : null;
    if(w!==abrindo)return;
    cacheConversa=!!salvo;
    if(salvo){
      aberta=salvo.conversa;msgs=salvo.mensagens;montarConversa(aberta);pintarFio(true);
      vista='conversa';$('ms-app').dataset.vista='conversa';
      if(!larga()&&window.TKCamadas&&!TKCamadas.aberta('ms-conversa')) TKCamadas.empilhar('ms-conversa',()=>{vista='lista';if($('ms-app')) $('ms-app').dataset.vista='lista';});
      document.querySelector('.ms-compor')?.setAttribute('inert','');
      document.querySelectorAll('.ms-compor textarea,.ms-compor input,.ms-compor button').forEach(e=>{e.disabled=true;});
      const info=el('p','','Salva no aparelho · atualizando para responder…');info.id='ms-cache-status';info.setAttribute('role','status');
      info.style.cssText='flex:0 0 auto;margin:0;padding:6px 12px;background:#fff4d9;color:#664200;font-size:12px;line-height:1.4';
      const pai=$('ms-conversa');pai.insertBefore(info,pai.children[1]||null);aviso_('');
    }
    const r = await worker_(path, 'GET');
    if (w !== abrindo) return;
    if (!r.ok) {
      const info=$('ms-cache-status');
      if(info){info.textContent=r.semRede?'Salva no aparelho · sem conexão para responder.':'Salva no aparelho · aguarde atualizar para responder.';aviso_('');}
      else aviso_(r.erro || 'Não foi possível abrir a conversa agora.');
      return;
    }
    cacheConversa=false;
    aviso_('');
    const c = r.conversa; aberta = c;
    ultIdSrv = r.mensagens.reduce((m, x) => (x.id > m ? x.id : m), 0);
    msgs = r.mensagens.concat((r.notas || []).map(notaMsg_)).concat(Array.from(pendentes.values()).filter((p) => p.conversa === id).map((p) => p.msg));
    montarConversa(c); pintarFio(true);
    vista = 'conversa'; const app = $('ms-app'); app.dataset.vista = 'conversa';
    if (!larga() && window.TKCamadas && !TKCamadas.aberta('ms-conversa')) TKCamadas.empilhar('ms-conversa', () => { vista = 'lista'; const a = $('ms-app'); if (a) a.dataset.vista = 'lista'; });
    pintarLista(); marcarLida();
    if (larga() && !espiando) { const t = $('ms-texto'); if (t) t.focus(); }
  }
  function voltarLista() {
    if ($('ms-gaveta')) fecharGaveta_();
    if (window.TKCamadas && TKCamadas.aberta('ms-conversa')) { TKCamadas.desempilhar('ms-conversa'); return; }
    vista = 'lista'; const a = $('ms-app'); if (a) a.dataset.vista = 'lista';
  }
  async function marcarLida() {
    if (espiando || cacheConversa) return;                      // v7.21: espiando nunca marca como lida (nem aqui nem no celular)
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
  /* v7.40.3: notas internas — mesmo campo de texto, salva em /msg/notas e nunca chama /msg/enviar */
  let modoNota = false;
  const notaMsg_ = (n) => ({ id: 'nota-' + n.id, direcao: 'nota', tipo: 'nota', texto: n.texto, autor: n.autor, enviada_em: n.em });
  function alternarNota_(forcar) {
    modoNota = forcar === undefined ? !modoNota : forcar;
    const ta = $('ms-texto'), cx = ta && ta.parentElement; if (ta) ta.placeholder = modoNota ? 'Nota interna: só a equipe vê' : 'Mensagem';
    if (cx) cx.classList.toggle('ms-modo-nota', modoNota);
    document.querySelectorAll('.ms-nota-btn').forEach((b) => b.setAttribute('aria-pressed', String(modoNota)));
    if (ta) ta.focus();
  }
  async function salvarNota_(c, ta) {
    const texto = (ta.value || '').trim(); if (!texto) { aviso_('Escreva a nota antes de salvar.'); return; }
    const r = await worker_('/msg/notas', 'POST', { conversa: c.id, texto: texto });
    if (!r.ok) { aviso_(r.erro || 'Não consegui salvar a nota. Tente de novo.'); return; }
    ta.value = ''; if (aberta && aberta.id === c.id) { msgs.push(notaMsg_(r.nota)); pintarFio(true); }
    alternarNota_(false); aviso_('Nota salva. Só a equipe vê.');
  }
  async function enviar(reenvio) {
    if (cacheConversa) { aviso_('Aguarde atualizar a conversa para responder.'); return; }
    if (!aberta) return;
    const c = aberta, ta = $('ms-texto'); if (!ta && !reenvio) return;
    if (modoNota && !reenvio) { await salvarNota_(c, ta); return; }
    let tmp, texto, idLocal;
    if (reenvio) { const p = pendentes.get(reenvio); if (!p) return; tmp = p; texto = p.msg.texto; idLocal = p.idLocal; p.msg.status = 'pendente'; p.msg.erro = ''; }
    else {
      texto = ta.value.replace(/\r\n/g, '\n').trim(); const an = anexoPend;
      if (!texto && !an) return;
      if (an && c.canal === 'instagram' && texto) { aviso_('O Instagram não aceita texto junto com foto, vídeo ou áudio. Envie o anexo e depois o texto.'); return; }
      if (RE_LACUNA_.test(texto)) { marcarLacuna_(0); return; }   // v7.40.9: [valor no Pix], [chave Pix]… ainda sem completar
      texto = assinar_(c, texto);
      if (!an && (c.canal === 'instagram' ? new TextEncoder().encode(texto).length > 1000 : texto.length > limiteTexto(c))) { aviso_('Mensagem grande demais para este canal. Divida em duas.'); return; }
      idLocal = idLocal_();
      const idTmp = 'tmp-' + idLocal;
      const pc = $('ms-previa-chk'), comPrevia = !an && c.canal !== 'instagram' && !!pc && pc.checked && LINK_RE_.test(texto);
      tmp = { idLocal: idLocal, conversa: c.id, previa: comPrevia ? cartaoDoLink_(texto) : null, anexo: an ? { blob: an.blob, tipo: an.tipo, seg: an.seg, chave: '' } : null, msg: { id: idTmp, direcao: 'saida', tipo: an ? an.tipo : 'texto', texto: texto, enviada_em: new Date().toISOString(), status: 'pendente', midia: an ? 1 : 0, localUrl: an ? an.urlLocal : '' } };
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
    if (!r) r = await worker_('/msg/enviar', 'POST', Object.assign({ conversa: c.id, texto: texto, idLocal: idLocal, anexo: tmp.anexo ? tmp.anexo.chave : undefined, seg: tmp.anexo ? tmp.anexo.seg : undefined },
      tmp.previa ? { previa: true, previaTitulo: tmp.previa.titulo || '', previaDescricao: tmp.previa.descricao || '' } : {}));
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
  /* v7.40.2: faixa vermelha quando o servidor está recusando os avisos (ex.: limite do banco) */
  function pintarSaude_(sd) {
    const e = $('ms-saude'); if (!e) return;
    e.hidden = !sd.alerta; if (!sd.alerta) { e.textContent = ''; return; }
    const hora = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
    const b = el('b', '', 'Mensagens não estão chegando desde ' + hora(sd.desde));
    const t = el('span', '', 'O servidor recusou os avisos' + (NOME_CANAL_[sd.canal] ? ' do ' + NOME_CANAL_[sd.canal] : '') + (sd.cod ? ' (erro ' + sd.cod + ')' : '') + '. As mensagens continuam no celular; o site volta a mostrar sozinho quando o servidor aceitar de novo.');
    e.replaceChildren(b, t);
  }
  /* v7.40.7: trocar de usuário sem sair do aparelho — as contas já usadas ficam guardadas aqui e as conversas carregadas continuam */
  const CHAVE_CONTAS_ = 'tm_sessoes_v1';
  function contasSalvas_() { try { const l = JSON.parse(localStorage.getItem(CHAVE_CONTAS_) || '[]'); return Array.isArray(l) ? l.filter((x) => x && x.whatsapp && x.sessao) : []; } catch (e) { return []; } }
  function guardarContas_(l) { try { localStorage.setItem(CHAVE_CONTAS_, JSON.stringify(l.slice(0, 6))); } catch (e) { /* aparelho sem armazenamento */ } }
  function lembrarSessao_() {
    const s = typeof getSessao === 'function' ? getSessao() : null; if (!s) return;
    let nome = ''; try { nome = typeof usuarioAdmin !== 'undefined' && usuarioAdmin ? String(usuarioAdmin.nome || '') : ''; } catch (e) { nome = ''; }
    const l = contasSalvas_().filter((x) => x.whatsapp !== s.whatsapp); l.unshift({ whatsapp: s.whatsapp, sessao: s.sessao, nome: nome, em: new Date().toISOString() }); guardarContas_(l);
  }
  function abrirTrocaUsuario_() {
    lembrarSessao_(); const corpo = gaveta_('Trocar usuário'); if (!corpo) return;
    const atual = (typeof getSessao === 'function' && getSessao()) || {}, l = contasSalvas_();
    corpo.appendChild(el('p', 'ms-etq-rot', 'Contas usadas neste aparelho'));
    l.forEach((c) => {
      const linha = el('div', 'ms-etq-op'), rot = (c.nome || 'Conta') + ' · final ' + String(c.whatsapp).slice(-4);
      linha.appendChild(el('span', '', rot + (c.whatsapp === atual.whatsapp ? ' (em uso)' : '')));
      if (c.whatsapp !== atual.whatsapp) { const u = botao('ms-btn prim', 'Usar', 'usar-conta', { w: c.whatsapp }); u.style.marginLeft = 'auto'; linha.appendChild(u); }
      const x = botao('ms-btn', 'Esquecer', 'esquecer-conta', { w: c.whatsapp }); if (c.whatsapp === atual.whatsapp) x.style.marginLeft = 'auto'; linha.appendChild(x);
      corpo.appendChild(linha);
    });
    const pe = el('div', 'ms-etq-pe'); pe.appendChild(botao('ms-btn', 'Entrar com outra conta', 'outra-conta')); corpo.appendChild(pe);
    corpo.appendChild(el('p', 'ms-dica', 'Trocar não apaga as conversas já carregadas neste aparelho. "Esquecer" tira a conta da lista; para encerrar o acesso de vez, use Sair da conta no painel.'));
  }
  function ligarAoVivo() { lembrarSessao_(); pararAoVivo(); offline = false; espera = ESPERA_MS; atualizarVivo(); agendar(1200); }
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
    if(cacheConversa&&aberta){await abrirConversa(aberta.id,espiando);agendar();return;}
    if (offline) { offline = false; atualizarVivo(); }
    espera = ESPERA_MS; cursor = r.cursor || cursor;
    r.mensagens.forEach((m) => { if (typeof m.id === 'number' && m.id > ultIdSrv) ultIdSrv = m.id; });
    if (r.saude) pintarSaude_(r.saude);
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
        if(APP_RECENTES&&!cacheConversa) await recentes_('/msg/mensagens?conversa='+aberta.id,{ok:true,conversa:aberta,mensagens:msgs.filter(m=>typeof m.id==='number')});
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
    if (r.encerramentos) { const e = r.encerramentos; p.appendChild(el('p', 'ms-vazio', 'Encerramentos no período: ' + e.concluido + ' concluídos · ' + e.vendeu + ' com venda · ' + e.sem_resposta + ' sem resposta do cliente · ' + e.engano + ' engano ou spam (fora das métricas).')); }
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
      if (trabalho && !confirm('A operação dos contatos ainda está em andamento. Se fechar agora, ela para e precisa recomeçar. Fechar mesmo assim?')) return;
      if (window.TKCamadas && TKCamadas.aberta('ms-conversa')) { document.addEventListener('tk:camada-fechada', function f(e) { if (e.detail && e.detail.chave === 'ms-conversa') { document.removeEventListener('tk:camada-fechada', f); fecharComHistorico_('overlay-mensagens'); } }); TKCamadas.desempilhar('ms-conversa'); }
      else fecharComHistorico_('overlay-mensagens');
    }
    else if (a === 'aba') { selecao = null; desenharSelbar_(); contVista = null; contTipos = null; canal = b.dataset.canal; filtro = ''; busca = ''; $('ms-busca').value = ''; aberta = null; msgs = []; elMsgs.clear(); limparBlobs_(); limparAnexo_(true); $('ms-conversa').textContent = ''; $('ms-conversa').appendChild(vazioConversa_()); fecharPainelSilencioso(); lista = []; elConvs.forEach((li) => li.remove()); elConvs.clear(); desenharAbas(); desenharFiltros(); desenharEstado(); await carregarLista(true); }
    else if (a === 'tipo') {
      const k = b.dataset.tipo, outro = k === 'msg' ? 'grp' : 'msg';
      if (tipos[k] && !tipos[outro]) { tipos[k] = false; tipos[outro] = true; } else tipos[k] = !tipos[k];       // desligar o único ligado = mostrar o outro (nunca fica tudo desligado)
      if (!tipos.msg && filtro === 'ambos') filtro = '';
      if (selecao) { selecao.clear(); desenharSelbar_(); }
      fecharPainelSilencioso(); desenharFiltros(); await carregarLista(true);
    }
    else if (a === 'etq') { const id = Number(b.dataset.id); etqFiltro = etqFiltro === id ? 0 : id; desenharFiltros(); await carregarLista(true); }
    else if (a === 'etiquetas') abrirEtiquetas_();
    else if (a === 'assumir' || a === 'liberar') { const c = aberta; if (!c) return; const r = await worker_('/msg/dono', 'POST', { conversa: c.id, assumir: a === 'assumir' }); if (!r.ok) { aviso_(r.erro || 'Não foi possível agora.'); return; } c.dono = r.dono; const fx = $('ms-etq-faixa'); if (fx) fx.replaceWith(faixaEtq_(c)); await carregarLista(false); }
    else if (a === 'etq-salvar') salvarEtiquetas_();
    else if (a === 'etq-sem-etapa') { const g = $('ms-gaveta'); if (g) g.querySelectorAll('input[name=ms-etq-venda]').forEach((i) => { i.checked = false; }); }
    else if (a === 'filtro') { filtro = filtro === b.dataset.filtro ? '' : b.dataset.filtro; if (selecao) { selecao.clear(); desenharSelbar_(); } fecharPainelSilencioso(); desenharFiltros(); await carregarLista(true); }
    else if (a === 'abrir') { if (toqueLongo) { toqueLongo = false; return; } if (selecao) { const id = Number(b.dataset.id); if (selecao.has(id)) selecao.delete(id); else selecao.add(id); pintarLista(); desenharSelbar_(); } else abrirConversa(Number(b.dataset.id)); }
    else if (a === 'selecionar') iniciarSelecao_(0);
    else if (a === 'nome-editar') desenharAssina_(true);
    else if (a === 'ponte-ligar') {
      b.disabled = true; pontesStatus_('Conferindo a ponte…'); const r = await worker_('/msg/contatos/config', 'POST', { url: ($('ms-ponte-url') || {}).value || '', chave: ($('ms-ponte-chave') || {}).value || '' }); b.disabled = false;
      if (!r.ok) { pontesStatus_(r.erro || 'Não foi possível ligar agora.'); return; }
      pontesStatus_('Ponte ligada à conta ' + (r.conta || '') + '.'); contatosSit = null; desenharEstado();
    }
    else if (a === 'ponte-backup') {
      b.disabled = true; pontesStatus_('Fazendo a cópia de segurança dos contatos em partes. Com muitos contatos pode levar alguns minutos.');
      const r = await rodarFases_([faseCopia_()]);
      b.disabled = false;
      if (!r.ok) { pontesStatus_('A cópia não foi feita: ' + (r.erro || 'tente de novo.')); return; }
      pontesStatus_('✓ Cópia feita: ' + numBR_(r.feito) + ' contatos salvos no Drive da conta dos contatos.'); contatosSit = null; desenharEstado();
    }
    else if (a === 'ponte-relatorio') {
      b.disabled = true; pontesStatus_('Lendo os contatos para o relatório em partes. Com muitos contatos pode levar alguns minutos.');
      const r = await rodarFases_([faseLeitura_()]);
      b.disabled = false;
      if (!r.ok) { pontesStatus_('O relatório não foi gerado: ' + (r.erro || 'tente de novo.')); return; }
      pontesStatus_(''); mostrarRelatorio_(r);
    }
    else if (a === 'ponte-limpar') {
      if (!confirm('Aplicar a limpeza aprovada nos contatos do Google?\n\n1. Faz uma cópia de segurança nova.\n2. Junta as pessoas repetidas (fica o nome mais completo; os outros nomes vão para a observação).\n3. Padroniza os números (+55 e o 9 do celular; 9 dígitos sem DDD ganham o 88; fixo não ganha o 9).\n4. Cria quem conversou no WhatsApp e não está no Google como “TM Cliente …”.\n5. Liga o cadastro automático dos números novos.\n\nCom muitos contatos leva vários minutos. Deixe esta tela aberta.')) return;
      pontesStatus_('Aplicando a limpeza aprovada…');
      const limp = (etapa, extra) => worker_('/msg/contatos/limpeza', 'POST', Object.assign({ etapa: etapa }, extra || {}));
      const r = await rodarFases_([
        faseCopia_(),
        faseLeitura_(),
        { titulo: 'Juntando as pessoas repetidas', unidade: 'pessoas', passo: async (e) => { const x = await limp('juntar', { desde: e.desde || 0 }); return x.ok ? { ok: true, fim: !x.proximo, feito: x.feito, total: x.total, estado: { desde: x.proximo } } : x; } },
        { titulo: 'Padronizando os números', passo: async (e) => { const x = await limp('padronizar', { pagina: e.pagina || undefined }); return x.ok ? { ok: true, fim: !x.proxima, feito: x.feito, total: x.total, estado: { pagina: x.proxima } } : x; } },
        { titulo: 'Criando os contatos novos (TM Cliente)', passo: async (e) => { const x = await limp('criar', { continuar: !!e.continuar }); return x.ok ? { ok: true, fim: !x.restantes, feito: x.feito, total: x.total, estado: { continuar: true } } : x; }, depois: () => limp('fim') }
      ]);
      if (!r.ok) { pontesStatus_('A limpeza parou: ' + (r.erro || 'tente de novo.') + ' O que já foi feito fica; ao tentar de novo, ela continua sem repetir.'); contatosSit = null; return; }
      pontesStatus_('✓ Limpeza feita: ' + numBR_(r.juntados) + ' pessoas juntadas (' + numBR_(r.apagados) + ' contatos repetidos apagados), ' + numBR_(r.padronizados) + ' contatos com número padronizado e ' + numBR_(r.criados) + ' contatos novos. O cadastro automático dos números novos está ligado.');
      contatosSit = null; fecharPainel(); painel = 'leitura'; cfgLeitura = null; desenharEstado();   // volta para Configurações, onde o resumo fica escrito
      setTimeout(() => { const st = $('ms-ponte-st'); if (st && st.scrollIntoView) st.scrollIntoView({ block: 'center' }); }, 400);
    }
    else if (a === 'ponte-auto') { const ligar = !!(b.checked); const x = await worker_('/msg/contatos/auto', 'POST', { ligado: ligar }); if (!x.ok) { b.checked = !ligar; pontesStatus_(x.erro || 'Não foi possível mudar agora.'); return; } pontesStatus_(ligar ? 'Cadastro automático ligado: cada número novo vira “TM Cliente …” no Google.' : 'Cadastro automático desligado.'); contatosSit = null; desenharEstado(); }
    else if (a === 'ponte-ver') { const r = await worker_('/msg/contatos/situacao?relatorio=1', 'GET'); mostrarRelatorio_(r.ok ? r.relatorio : null); }
    else if (a === 'ponte-desligar') {
      if (!confirm('Desligar a ponte do Google Contatos? O endereço e a chave saem do servidor da loja. Nenhum contato é apagado.')) return;
      const r = await worker_('/msg/contatos/config', 'POST', { desligar: true }); if (r.ok) { aviso_('Ponte desligada.'); contatosSit = null; desenharEstado(); }
    }
    else if (a === 'gaveta-produtos') abrirProdutos_();
    else if (a === 'gaveta-respostas') abrirRespostas_(false);
    else if (a === 'modo-nota') alternarNota_();
    else if (a === 'gaveta-fechar') { fecharGaveta_(); const t = $('ms-texto'); if (t) t.focus(); }
    else if (a === 'resp-editar') abrirRespostas_(true);
    else if (a === 'resp-usar') { const r = respostas_()[Number(b.dataset.i)]; if (r) colocarResposta_(r.x); }
    else if (a === 'auto-cfg') abrirAuto_();
    else if (a === 'auto-salvar') await salvarAuto_(b);
    else if (a === 'auto-feriado-add') { const di = $('ms-auto-data'), v = di ? di.value : ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { aviso_('Escolha a data do feriado.'); if (di) di.focus(); } else if (autoEdit_) { if (autoEdit_.feriados.indexOf(v) < 0) autoEdit_.feriados = autoEdit_.feriados.concat(v).sort(); desenharAuto_(); const d2 = $('ms-auto-data'); if (d2) d2.focus(); aviso_('Feriado incluído. Toque em Salvar para valer.'); } }
    else if (a === 'auto-feriado-tirar' && autoEdit_) { autoEdit_.feriados = autoEdit_.feriados.filter((d) => d !== b.dataset.d); desenharAuto_(); const d2 = $('ms-auto-data'); if (d2) d2.focus(); aviso_('Feriado retirado. Toque em Salvar para valer.'); }
    else if (a === 'prod-marcar') marcarProduto_(b);
    else if (a === 'prodsel-limpar') { prodSel = []; Array.prototype.forEach.call(document.querySelectorAll('#ms-prod-lista .ms-prod-marca'), (m) => { m.setAttribute('aria-pressed', 'false'); m.querySelector('.ms-prod-caixa').textContent = ''; m.closest('.ms-prod').classList.remove('marcado'); }); desenharSelProd_(); const q = $('ms-prod-busca'); if (q) q.focus(); }
    else if (a === 'prodsel-usar') { const ps = produtosSelecionados_(); if (ps.length) { prodSel = []; colocarNaMensagem_(textoSelecao_(ps)); } }
    else if (a === 'prodsel-link') { const ps = produtosSelecionados_(); if (ps.length) { try { await navigator.clipboard.writeText(linkSelecao_(ps)); aviso_('Link da seleção copiado.'); } catch (e) { aviso_('Não consegui copiar. Use “Enviar seleção”.'); } } }
    else if (a === 'prod-usar') { const p = produtoPorId_(b.dataset.id); if (p) colocarNaMensagem_(textoProduto_(p)); }
    else if (a === 'prod-link') { const p = produtoPorId_(b.dataset.id); if (p) { try { await navigator.clipboard.writeText(linkDe_(p)); aviso_('Link copiado.'); } catch (e) { aviso_('Não consegui copiar. Use “Colocar na mensagem”.'); } } }
    else if (a === 'nome-salvar') { const i = $('ms-meu-nome-rapido'); await salvarNome_(i ? i.value : ''); const t = $('ms-texto'); if (t) t.focus(); }
    else if (a === 'nome-salvar-cfg') { const i = $('ms-meu-nome'); await salvarNome_(i ? i.value : ''); }
    else if (a === 'sel-sair') sairSelecao_();
    else if (a === 'sel-todas' && selecao) { const todas = lista.length && lista.every((c) => selecao.has(c.id)); selecao = new Set(todas ? [] : lista.map((c) => c.id)); pintarLista(); desenharSelbar_(); }
    else if (a === 'sel-encerrar' && selecao) { if (filtro === 'encerradas') await encerrar_(Array.from(selecao), true); else escolherMotivo_(Array.from(selecao)); }
    else if (a === 'motivo' && idsMotivo_) {
      const ids = idsMotivo_, m = b.dataset.m, eraAberta = aberta && ids.indexOf(aberta.id) >= 0; fecharMotivos_();
      await encerrar_(ids, false, m);
      if (eraAberta) voltarLista();
    }
    else if (a === 'motivo-cancelar') fecharMotivos_();
    else if ((a === 'sel-lidas' || a === 'sel-naolidas') && selecao) await marcarLote_(Array.from(selecao), a === 'sel-naolidas');
    else if (a === 'encerrar' && aberta) escolherMotivo_([aberta.id]);
    else if (a === 'reabrir' && aberta) { const id = aberta.id; await encerrar_([id], true); if (aberta && aberta.id === id) { montarConversa(aberta); pintarFio(true); } }
    else if (a === 'abrir-outro') { if (canal !== 'todos') { canal = b.dataset.canal; filtro = ''; desenharAbas(); desenharFiltros(); desenharEstado(); await carregarLista(true); } abrirConversa(Number(b.dataset.id)); }
    else if (a === 'pessoa') { if(aberta&&!aberta.grupo)editarPessoa_(aberta.id); }
    else if (a === 'espiar') abrirConversa(Number(b.dataset.id), true);
    else if (a === 'atender' && aberta) { espiando = false; aberta.nao_lidas = Math.max(1, aberta.nao_lidas || 0); montarConversa(aberta); pintarFio(true); marcarLida(); const t = $('ms-texto'); if (t) t.focus(); }
    else if (a === 'leitura-cfg') { painel = painel === 'leitura' ? '' : 'leitura'; if (painel === 'leitura') { cfgLeitura = null; contatosSit = null; } desenharEstado(); }
    else if (a === 'abrir-canal') { canal = b.dataset.canal; fecharPainelSilencioso(); filtro = ''; desenharAbas(); desenharFiltros(); desenharEstado(); await carregarLista(true); abrirConversa(Number(b.dataset.id)); }
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
    else if (a === 'trocar-usuario') abrirTrocaUsuario_();
    else if (a === 'app-atualizar') { try { window.TKAndroid.atualizar(); } catch (e) { alert('Atualize pelo instalador mais recente do app.'); } }
    else if (a === 'app-permissoes') { try { window.TKAndroid.permissoes(); } catch (e) {} }
    else if (a === 'usar-conta') { const l = contasSalvas_(), c = l.find((x) => x.whatsapp === b.dataset.w); if (!c) return; salvarSessao(c.whatsapp, c.sessao); location.reload(); }
    else if (a === 'esquecer-conta') { guardarContas_(contasSalvas_().filter((x) => x.whatsapp !== b.dataset.w)); abrirTrocaUsuario_(); }
    else if (a === 'outra-conta') { lembrarSessao_(); limparSessao(); location.reload(); }
    else if (a === 'menu-geral') abrirMenu(b, [['Selecionar conversas', 'selecionar'], ['Painel de atendimento', 'painel'], ['Configurações (leitura e nome)…', 'leitura-cfg'], ['Respostas automáticas…', 'auto-cfg'], '-'].concat(canal === 'todos' ? [] : [['Exportar este canal (CSV)', 'exp', { params: 'formato=csv&canal=' + canal, rotulo: 'o canal' }], ['Exportar este canal (TXT para IA)', 'exp', { params: 'formato=txt&canal=' + canal, rotulo: 'o canal' }]]).concat([ ['Exportar tudo (CSV, 3 canais)', 'exp', { params: 'formato=csv', rotulo: 'tudo' }], ['Exportar tudo (JSON)', 'exp', { params: 'formato=json', rotulo: 'tudo' }], '-', ['Atualizar agora', 'atualizar'], '-', ['Trocar usuário…', 'trocar-usuario']]).concat(window.TKAndroid ? ['-', ['Atualizar app', 'app-atualizar'], ['Permissões do app', 'app-permissoes']] : []));
    else if (a === 'menu-conversa' && aberta) abrirMenu(b, [['Copiar conversa para IA', 'copiar-ia'], ['Exportar esta conversa (TXT)', 'exp', { params: 'formato=txt&conversa=' + aberta.id, rotulo: 'a conversa' }], ['Exportar esta conversa (CSV)', 'exp', { params: 'formato=csv&conversa=' + aberta.id, rotulo: 'a conversa' }], '-', ['Marcar como não lida', 'nao-lida'], aberta.encerrada_em ? ['Reabrir conversa', 'reabrir'] : ['Encerrar conversa', 'encerrar']]);
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
    const listaEmCurso=APP_RECENTES ? carregarLista(true) : null;
    resumo = await worker_('/msg/resumo', 'GET');
    if (!resumo.ok) { const ex = $('ms-extra'); ex.textContent = ''; ex.appendChild(el('p', 'ms-vazio', resumo.erro || 'Não foi possível carregar agora.')); return; }
    if (!cfgLeitura) carregarCfgLeitura_();      // v7.22: traz também a assinatura do atendente
    if (!contagens) contagens = {};
    CANAIS.forEach(([id]) => { const c = resumo.canais[id]; contagens[id] = Object.assign({ grupos: 0, sem_resposta: c.semResposta || 0 }, contagens[id] || {}, { conversas: c.conversas, nao_lidas: c.naoLidas || 0, sem_resposta: c.semResposta || 0 }); });
    desenharAbas(); desenharFiltros(); desenharEstado(); selarBotao(); if(listaEmCurso) await listaEmCurso;else await carregarLista(true);
  }
  async function abrir() {
    montar(); abrirComHistorico_('overlay-mensagens');
    vista = 'lista'; $('ms-app').dataset.vista = 'lista'; ajustarViewport();
    $('ms-extra').textContent = 'Carregando…';
    await recarregar(); ligarAoVivo();
    const f = $('ms-fechar'); if (f && larga()) f.focus();
  }
  if(new URLSearchParams(location.search).get('app')==='mensagens')window.TKMensagensApp={abrirConversa:function(id){if(podeGerir()&&Number.isSafeInteger(id)&&id>0)return abrirConversa(id);}};
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
