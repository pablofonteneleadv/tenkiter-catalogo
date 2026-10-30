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
  const FILTROS = [['minhas', 'Minhas'], ['nao_lidas', 'Não lidas'], ['sem_resposta', 'Falta responder'], ['com_notas', 'Com notas'], ['retomar', 'Retomar'], ['encerradas', 'Encerradas']];
  // v7.21: aba mestre "Todas" (os três canais juntos) vem primeiro e é a que abre
  const ABAS = [['todos', 'Todas']].concat(CANAIS);
  const NOME_CANAL_ = { whatsapp1: 'WhatsApp 1', whatsapp2: 'WhatsApp 2', instagram: 'Instagram' };
  const ESPERA_MS = Number(window.TK_MENSAGENS_POLL_MS) || 4000, ESPERA_MAX_MS = Number(window.TK_MENSAGENS_POLL_MS) ? 3000 : 30000, ESPERA_SELO_MS = Number(window.TK_MENSAGENS_POLL_MS) ? 1500 : 60000;
  let espiando = false, cfgLeitura = null, avisouCelular = {};
  let selecao = null, timerToque = null, toqueLongo = false;      // v7.22: seleção de várias conversas (para encerrar/reabrir)
  let tipos = { msg: true, grp: false }, contVista = null, contTipos = null;
  const tipoParam_ = () => canal === 'instagram' ? 'individual' : (tipos.msg && !tipos.grp ? 'individual' : tipos.grp && !tipos.msg ? 'grupo' : '');
  let filaAtendimento_='esperando',escopoAtendimento_='todos';
  let canal = 'todos', filtro = '', busca = '', resumo = null, contagens = null, lista = [], cursor = '', aberta = null, msgs = [], vista = 'lista', painel = '';
  let seqLista = 0, ultIdSrv = 0, nPoll = 0, timerBusca = null, timerLive = null, timerSelo = null, espera = ESPERA_MS, offline = false, abrindo = 0, novasAbaixo = 0, menuAberto = null, aviso = '';
  const rascunhos = {}, elMsgs = new Map(), elConvs = new Map(), pendentes = new Map();
  const blobs = new Map();                     // mídia já baixada nesta conversa: "id" ou "id|c" (story) -> promessa do endereço local
  let anexoPend = null, gravacao = null, colarFimAte = 0;
  let agendadas_ = [], timerAgenda_ = null, agendaQuando_ = 0, agendaAtalho_ = '';   // v7.40.13: mensagens agendadas da conversa aberta
  let acompanhamento_=null;
  let agendaAnexo_=null,agendaPedido_=null;
  let agendaPainelFiltros_={busca:'',status:'pendentes',canal:'todos',tipo:'todos',minhas:false,de:'',ate:''};

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
  const contaSessao_ = s => s ? normalizarWhats(s.whatsapp) : '';
  let contaAtual_ = contaSessao_(typeof getSessao==='function'&&getSessao()), epocaConta_ = 0;
  function conferirContaAtual_(){
    const nova=contaSessao_(getSessao());
    if(nova!==contaAtual_){
      contaAtual_=nova;epocaConta_++;filaAtendimento_='esperando';escopoAtendimento_='todos';cfgLeitura=null;acompanhamento_=null;agendaAnexo_=null;agendaPedido_=null;agendaPainelFiltros_={busca:'',status:'pendentes',canal:'todos',tipo:'todos',minhas:false,de:'',ate:''};fecharGaveta_();atualizarIdentidade_();
      if(APP_RECENTES){limparRecentes_();cacheBloqueado=true;lista=[];msgs=[];mostrarLista_();const ul=$('ms-lista');if(ul)ul.textContent='';const extra=$('ms-extra');if(extra)extra.textContent='Atualizando acesso…';}
    }
    return nova;
  }
  async function renovarAcesso_(s,epoca){
    const r=await apiPost({action:'sessao',whatsapp:s.whatsapp,sessao:s.sessao});
    conferirContaAtual_();const atual=getSessao();
    if(epoca!==epocaConta_||!atual||atual.sessao!==s.sessao||contaSessao_(atual)!==contaSessao_(s))return;
    if(r&&r.ok&&r.usuario&&contaSessao_(r.usuario)===contaSessao_(s)&&r.sessao&&r.sessao!==s.sessao)salvarSessao(r.usuario.whatsapp,r.sessao);
    else if(r&&(r.sessaoInvalida||r.inativa))limparSessao();
  }
  window.addEventListener('tk:sessao',conferirContaAtual_);
  window.addEventListener('storage',e=>{if(e.key==='tm_session')conferirContaAtual_();});
  window.addEventListener('tk:mensagens-sair',()=>{epocaConta_++;contaAtual_='';});
  async function worker_(caminho, metodo, corpo, repetiu) {
    if(cacheConversa && metodo && metodo!=='GET') return {ok:false,erro:'Aguarde atualizar a conversa para continuar.'};
    const s = (typeof getSessao === 'function' && getSessao()) || null;
    if (!s || typeof INSTAGRAM_URL === 'undefined') return { ok: false, erro: 'Entre com o seu login (não vale só o PIN) para ver as mensagens.' };
    conferirContaAtual_(); const epoca = epocaConta_, conta = contaSessao_(s);
    try {
      const r = await fetch(INSTAGRAM_URL + caminho, { method: metodo, headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
      const dados = await r.json();
      const mesmaSessao=()=>{conferirContaAtual_();return epoca===epocaConta_&&contaSessao_(getSessao())===conta;};
      if(APP_RECENTES&&!mesmaSessao())return {ok:false,erro:'A conta mudou. Abra novamente as mensagens.'};
      if (APP_RECENTES && !repetiu && (r.status===401||r.status===403)) {
        let atual=getSessao();
        if(r.status===401 && atual && atual.sessao===s.sessao){await renovarAcesso_(s,epoca);atual=getSessao();}
        if(!mesmaSessao())return {ok:false,erro:'Entre na sua conta para continuar.'};
        if(atual && atual.sessao!==s.sessao)return worker_(caminho,metodo,corpo,true);
      }
      if (APP_RECENTES && (r.status===401 || (r.status===403 && /^\/msg\/(conversas|mensagens|novidades|resumo|contagem)(\?|$)/.test(caminho)))) {
        cacheBloqueado=true;limparRecentes_(); lista=[];msgs=[];aberta=null;cacheConversa=false;
        if($('ms-lista')) pintarLista(); if($('ms-conversa')) $('ms-conversa').textContent='';
      }
      if (dados.ok && (!metodo || metodo==='GET')) await recentes_(caminho,dados);
      if(APP_RECENTES&&!mesmaSessao())return {ok:false,erro:'A conta mudou. Abra novamente as mensagens.'};
      return dados;
    } catch (e) { return { ok: false, erro: 'Sem conexão agora. Tente de novo.', semRede: true }; }
  }
  function podeGerir() {
    try { if(window.TKMensagensAcessos)return TKMensagensAcessos.pode('acessar'); return typeof temPermissao === 'function' && typeof usuarioAdmin !== 'undefined' && !!usuarioAdmin && !!temPermissao(usuarioAdmin, 'gerir_acessos'); } catch (e) { return false; }
  }
  function podeFerramenta_(k) { return window.TKMensagensAcessos ? TKMensagensAcessos.pode(k) : podeGerir(); }
  function recursoAcao_(a) {
    if (/^(gaveta-produtos|prod-?|prodsel-)/.test(a)) return 'produtos';
    if (/^(inicio-notas|notas-|modo-nota)/.test(a)) return 'notas';
    if (/^(nome-|nova-)/.test(a)) return 'responder';
    if (/^(ficha|pessoa)/.test(a)) return 'contatos';
    if (/^(etq|etiquetas)/.test(a)) return 'etiquetas';
    if (/^(funil)/.test(a)) return 'funil';
    if(a==='entrada-reprocessar')return 'configuracoes';
    if (/^(agenda|agendar)/.test(a)) return 'agenda';
    if (/^(exp|copiar)/.test(a)) return 'exportar';
    if (/^(painel|metricas|met-|equipe-)/.test(a)) return 'metricas';
    if (/^(gaveta-respostas|resp-)/.test(a)) return 'respostas';
    if (/^(leitura-cfg|ponte-|auto-|ligar|pausar|conexao|diagnostico)/.test(a)) return 'configuracoes';
    if (/^(selecionar|enviar|anexar|gravar|assumir|liberar|encerrar|reabrir|atender|sel-encerrar|sel-reabrir)/.test(a)) return 'responder';
    return '';
  }
  function filtrarFerramentas_() {
    const gaveta=$('ms-gaveta'),tipo=gaveta?.dataset.tipo||'';
    if((['agenda','agenda-painel','agendar-opcoes'].includes(tipo)&&!podeFerramenta_('agenda'))||(tipo==='automacoes'&&!podeFerramenta_('configuracoes')))fecharGaveta_();
    document.querySelectorAll('#overlay-mensagens [data-ms]').forEach(b=>{const k=recursoAcao_(b.dataset.ms);if(k&&!podeFerramenta_(k))b.hidden=true;});
    document.querySelectorAll('#overlay-mensagens [data-filtro="com_notas"]').forEach(b=>{b.hidden=!podeFerramenta_('notas');});
  }
  const permissaoObserver_ = new MutationObserver(filtrarFerramentas_);
  window.addEventListener('tk:mensagens-acessos',filtrarFerramentas_);
  document.addEventListener('DOMContentLoaded',()=>{const o=$('overlay-mensagens');if(o)permissaoObserver_.observe(o,{childList:true,subtree:true});});
  function el(tag, cls, texto) { const e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e; }
  function botao(cls, texto, acao, extra) { const b = el('button', cls, texto); b.type = 'button'; if (acao) { b.dataset.ms = acao; const k=recursoAcao_(acao); if(k&&!podeFerramenta_(k))b.hidden=true; } if (extra) Object.keys(extra).forEach((k) => { b.dataset[k] = extra[k]; }); return b; }
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
  const META_RESPOSTA_MS = 15 * 60000;   // v7.40.12: meta de tempo de resposta; acima disso a linha fica em vermelho
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
      .ms-identidade { display: block; font: 500 0.78rem/1.35 Roboto,sans-serif; color: #4a443b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
      .ms-espiando { flex-wrap: wrap; }
      .ms-espiar-acoes { display: flex; gap: 8px; flex-wrap: wrap; }
      .ms-espiando .ms-btn { flex: none; min-height: 48px; }
      .ms-gaveta-corpo.ms-notas-corpo { padding: 16px; }
      .ms-notas-corpo > .ms-btn { min-height: 48px; }
      .ms-nota-label { display: block; font-size: 1rem; font-weight: 600; margin: 0 0 8px; text-transform: none; }
      .ms-nota-campo { box-sizing: border-box; width: 100%; min-height: 96px; padding: 12px; border: 1px solid #a9a397; border-radius: 12px; font: inherit; resize: vertical; margin-bottom: 8px; }
      .ms-notas-lista { list-style: none; padding: 0; margin: 16px 0; }
      .ms-nota-item { display: flex; align-items: flex-start; gap: 8px; border-top: 1px solid #dedbd3; padding: 12px 0; }
      .ms-nota-item > div { flex: 1; min-width: 0; overflow-wrap: anywhere; }
      .ms-nota-item p { white-space: pre-wrap; margin: 0 0 8px; }
      .ms-nota-item .ms-ico { min-width: 48px; min-height: 48px; flex: none; }
      .ms-nota-estado { overflow-wrap: anywhere; }
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
      .ms-aguarda.atrasada { color: #b42318; }   /* v7.40.12: passou da meta de resposta (15 min) */
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
      .ms-saude { margin: 0 12px 8px; padding: 10px 12px; border-radius: 8px; background: #fdecec; color: #8f1d1d; border: 1px solid #f3c7c7; font-size: 0.85rem; display: flex; align-items:center; gap:8px; }
      .ms-saude>div{min-width:0;flex:1}.ms-saude>button{flex:none;min-height:44px}.ms-saude b,.ms-saude span{display:block}
      .ms-saude b { color: #c62828; }
      .ms-aviso { position: absolute; left: 12px; right: 12px; bottom: 88px; z-index: 7; margin: 0; padding: 10px 12px; border-radius: 8px; background: #fff3cd; color: #5a4300; font-size: 0.85rem; box-shadow: 0 6px 18px rgba(0,0,0,0.18); }
      .ms-aviso[hidden] { display: none; }
      /* v7.22: número ao lado do nome, mesma pessoa nos 2 WhatsApp, seleção e encerradas */
      .ms-conv .ms-l3 { display: flex; align-items: center; gap: 8px; margin-top: 3px; min-width: 0; }
      .ms-conv .ms-fone { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; color: #625c53; font-size: 0.76rem; }
      .ms-agenda-indicador { display:inline-flex; align-items:center; flex:none; padding:2px 7px; border-radius:8px; border:1px solid #e6cf99; background:#fff5dc; color:#76500a; font-size:.76rem; font-weight:750; white-space:nowrap; }
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
      .ms-assina .ms-ferr-btn { min-width: 44px; padding: 0 6px; gap: 4px; }
      .ms-assina .ms-ferr-btn > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
      .ms-prod-filtros { margin: 8px 12px; border: 1px solid #dedbd3; border-radius: 12px; }
      .ms-prod-filtros summary { min-height: 48px; padding: 12px; box-sizing: border-box; cursor: pointer; font-weight: 600; }
      .ms-prod-opcoes { max-height: 240px; overflow-y: auto; padding: 0 12px 12px; overscroll-behavior: contain; }
      .ms-prod-grupo-filtro h4 { margin: 12px 0 8px; font-size: 0.9rem; }
      .ms-prod-chips, .ms-prod-refinos { display: flex; gap: 8px; flex-wrap: wrap; }
      .ms-prod-chips .ms-btn, .ms-prod-refinos .ms-btn { min-height: 48px; overflow-wrap: anywhere; max-width: 100%; white-space: normal; }
      .ms-prod-chips .ms-btn[aria-pressed="true"] { background: #171714; color: #fff; }
      .ms-prod-refinos { padding: 0 12px; }
      .ms-prod-filtro { padding: 0 12px; font-weight: 500; font-size: 0.85rem; }
      .ms-prod-lista, .ms-resp-lista { list-style: none; margin: 0; padding: 0; }
      .ms-prod { display: flex; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #f0ece2; }
      .ms-prod-foto { flex: none; width: 72px; height: 90px; object-fit: cover; border-radius: 6px; background: #efe9dc; }
      .ms-prod-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .ms-prod-info b { font-size: 0.9rem; overflow-wrap: anywhere; }
      .ms-prod-preco { font-weight: 700; font-size: 0.85rem; color: #141414; }
      .ms-prod-det { font-size: 0.78rem; color: #4a443b; overflow-wrap: anywhere; }
      .ms-prod-acoes { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
      .ms-prod-editar { align-self: flex-start; border: 0; padding: 8px 2px; background: transparent; color: var(--laranja-txt,#9c530e); font: 700 .83rem/1.4 system-ui, sans-serif; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; min-height: 44px; }
      .ms-prod-editar:focus-visible { outline: 3px solid #e88a25; outline-offset: 3px; border-radius: 5px; }
      .ms-prod-acoes .ms-btn { min-height: 40px; padding: 6px 10px; font-size: 0.8rem; }
      .ms-previa { display: flex; align-items: center; padding: 0 8px; background: #fff; box-shadow: inset 0 1px 0 #f0ece2; }
      .ms-previa[hidden] { display: none; }
      .ms-previa label { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 0.82rem; color: #141414; cursor: pointer; }
      .ms-previa input { width: 20px; height: 20px; accent-color: #141414; margin: 0; }
      #ms-previa { gap: 8px; white-space: normal; flex-shrink: 0; }
      #ms-previa label { flex: 1; min-width: 0; flex-wrap: wrap; padding: 4px 0; }
      #ms-previa label input { flex: none; }
      .ms-link-mini { flex: none; width: 48px; height: 56px; padding: 4px 0; box-sizing: border-box; }
      .ms-link-mini[hidden] { display:none; }
      .ms-link-mini img { width: 48px; height: 48px; object-fit: cover; border-radius: 6px; }
      .ms-link-cartao { display: flex; gap: 10px; padding: 8px; margin: 0 0 8px; background: rgba(0,0,0,.04); color: #222; border-radius: 8px; text-decoration: none; min-width: 0; }
      .ms-link-cartao img { width: 72px; height: 88px; flex: none; object-fit: cover; border-radius: 5px; }
      .ms-link-cartao > span { min-width: 0; overflow-wrap: anywhere; }
      .ms-link-cartao b, .ms-link-cartao small { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
      .ms-link-cartao b { font-size: .9rem; line-height: 1.3; }
      .ms-link-cartao small { font-size: .75rem; line-height: 1.35; margin-top: 4px; }
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
      /* v7.40.13: agendar mensagem */
      .ms-agenda { padding: 0 14px; }
      .ms-agenda-rot { display: block; margin: 4px 0 6px; font-size: 0.85rem; font-weight: 700; color: #2b261f; }
      .ms-agenda textarea.ms-copia { font: inherit; font-size: 0.95rem; line-height: 1.35; resize: vertical; min-height: 104px; background: #fff; }
      .ms-agenda-atalhos { display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 8px; }
      .ms-agenda-atalhos .ms-btn { flex: 1 1 auto; font-weight: 600; background: #f3efe6; border: 1px solid transparent; }
      .ms-agenda-atalhos .ms-btn[aria-pressed=true] { background: #fff4e8; border-color: var(--laranja, #E67E22); color: #5c2e00; }
      .ms-agenda input[type=datetime-local] { width: 100%; min-height: 44px; font: inherit; font-size: 0.95rem; background: #fff; box-sizing: border-box; }
      .ms-agenda-res { margin: 6px 0 4px; font-size: 0.85rem; color: #4a443b; min-height: 1.3em; }
      .ms-agenda-sec { padding: 10px 0 12px; border-bottom: 1px solid #f0ece5; }
      .ms-agenda-lista { list-style: none; margin: 0; padding: 0; }
      .ms-agenda-lista li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f0ece5; }
      .ms-agenda-lista li > div { flex: 1; min-width: 0; }
      .ms-agenda-lista b { display: block; font-size: 0.85rem; color: #2b261f; }
      .ms-agenda-lista p { margin: 2px 0 0; font-size: 0.85rem; color: #3d362c; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
      .ms-agenda-lista small { display: block; font-size: 0.75rem; color: #625c53; margin-top: 2px; }
      .ms-agenda-lista small.falha { color: #8a2b2b; }
      .ms-agenda-lista .ms-btn { flex: none; }
      .ms-faixa.ms-agenda-faixa { background: #fffaf2; }
      .ms-agenda-faixa span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      /* v7.40.14: ficha do cliente */
      .ms-ficha { padding: 0 14px; }
      .ms-ficha-quem { margin: 2px 0 4px; font-size: 0.85rem; color: #4a443b; overflow-wrap: anywhere; }
      .ms-ficha-quem b { color: #2b261f; }
      .ms-ficha-sec { padding: 10px 0 12px; border-bottom: 1px solid #f0ece5; }
      .ms-ficha-sec:last-child { border-bottom: 0; }
      .ms-ficha-rot { display: block; margin: 2px 0 6px; font-size: 0.85rem; font-weight: 700; color: #2b261f; }
      .ms-ficha input[type=text], .ms-ficha textarea { width: 100%; min-height: 44px; font: inherit; font-size: 0.95rem; background: #fff; box-sizing: border-box; }
      .ms-ficha textarea.ms-copia { line-height: 1.35; resize: vertical; min-height: 76px; }
      .ms-ficha-tams { display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); gap: 6px; margin: 8px 0 0; }
      .ms-ficha-tams .ms-btn { min-width: 44px; padding: 0 4px; font-weight: 600; background: #f3efe6; border: 1px solid transparent; }
      .ms-ficha-tams .ms-btn[aria-pressed=true] { background: #fff4e8; border-color: var(--laranja, #E67E22); color: #5c2e00; }
      .ms-ficha-vazio { margin: 0; font-size: 0.85rem; color: #625c53; }
      .ms-ficha-etqs { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
      .ms-ficha-lista { list-style: none; margin: 0; padding: 0; }
      .ms-ficha-lista li { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid #f0ece5; font-size: 0.88rem; color: #2b261f; }
      .ms-ficha-lista li:last-child { border-bottom: 0; }
      .ms-ficha-lista li > div { flex: 1; min-width: 0; overflow-wrap: anywhere; }
      .ms-ficha-lista small { display: block; font-size: 0.75rem; color: #625c53; margin-top: 2px; }
      .ms-ficha-lista .ms-btn { flex: none; }
      .ms-ficha-nota p { margin: 0; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .ms-ficha-acao { margin-top: 8px; }
      details.ms-ficha-acao > summary { min-height: 48px; padding: 12px 0; box-sizing: border-box; cursor: pointer; }
      .ms-ficha-pe { align-items: center; gap: 10px; }
      .ms-ficha-pe small { flex: 1; min-width: 0; font-size: 0.75rem; color: #625c53; }
      .ms-veste { font-size: 0.72rem; font-weight: 600; color: #3b352c; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
      /* v7.40.15: funil de vendas. Celular: uma coluna por tela, rolagem lateral com encaixe só dentro do quadro. Computador: colunas lado a lado. */
      .ms-funil { min-width: 0; padding: 4px 0 16px; font-size: 0.88rem; }
      .ms-funil > .ms-linha, .ms-funil > h3, .ms-funil > .ms-fdica, .ms-funil > .ms-vazio { margin-left: 12px; margin-right: 12px; }
      .ms-funil > h3 { margin-top: 4px; margin-bottom: 2px; font-size: 1rem; }
      .ms-fdica { margin-top: 0; margin-bottom: 8px; font-size: 0.8rem; color: #555; }
      .ms-fq { display: flex; gap: 8px; align-items: flex-start; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scroll-padding: 0 12px; padding: 0 12px 8px; -webkit-overflow-scrolling: touch; }
      .ms-fcol { flex: 0 0 calc(100% - 28px); min-width: 0; box-sizing: border-box; scroll-snap-align: start; background: #f6f3ec; border-radius: 12px; padding: 0 8px 8px; border: 2px solid transparent; }
      .ms-fcol.alvo { border-color: #141414; background: #efe9dc; }
      .ms-fcol-cab { display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 0 2px; }
      .ms-fcol-cab h4 { margin: 0; flex: 1; min-width: 0; font-size: 0.95rem; line-height: 1.2; overflow-wrap: anywhere; }
      .ms-fcol-cab h4:focus-visible { outline: 3px solid #141414; outline-offset: 2px; border-radius: 4px; }
      .ms-fcol-cab .ms-etq-ponto { width: 12px; height: 12px; }
      .ms-ftot { flex: none; min-width: 28px; padding: 2px 8px; border-radius: 12px; background: #fff; border: 1px solid #e3ddd3; font-weight: 700; font-size: 0.8rem; text-align: center; box-sizing: border-box; }
      .ms-fpos { flex: none; font-size: 0.74rem; color: #555; }
      .sheet-mensagens .ms-fir { flex: none; width: 44px; min-height: 44px; border: 0; border-radius: 50%; background: #fff; color: #222; font-size: 1.1rem; font-weight: 700; cursor: pointer; padding: 0; }
      .sheet-mensagens .ms-fir:disabled { opacity: 0.35; cursor: default; }
      .ms-fcards { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
      .sheet-mensagens .ms-fcard { display: grid; gap: 3px; width: 100%; min-height: 64px; text-align: left; background: #fff; border: 1px solid #e3ddd3; border-radius: 10px; padding: 10px 12px; font: inherit; color: #111; cursor: pointer; box-sizing: border-box; }
      .sheet-mensagens .ms-fcard:hover { border-color: #b9b0a2; } .sheet-mensagens .ms-fcard:focus-visible { outline: 3px solid #141414; outline-offset: 2px; }
      .sheet-mensagens .ms-fcard[draggable=true] { cursor: grab; } .sheet-mensagens .ms-fcard.arrastando { opacity: 0.5; }
      .ms-fcard-l1 { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
      .ms-fcard-nome { flex: 1; min-width: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ms-fcard-l1 time { flex: none; font-size: 0.74rem; color: #555; }
      .ms-fcard-prev { font-size: 0.82rem; color: #333; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
      .ms-fcard-meta { font-size: 0.74rem; color: #5f584e; overflow-wrap: anywhere; }
      .ms-fcol-vazio, .ms-fcol-mais { margin: 4px 2px; font-size: 0.8rem; color: #555; }
      .ms-fop-info { margin: 0 14px 4px; font-size: 0.82rem; color: #555; }
      .ms-gaveta-corpo > .ms-etq-rot { margin-left: 14px; margin-right: 14px; }
      .sheet-mensagens .ms-fop { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 0 14px; border: 0; border-bottom: 1px solid #f0ece5; background: #fff; font: inherit; font-size: 0.95rem; color: #111; text-align: left; cursor: pointer; }
      .sheet-mensagens .ms-fop:hover, .sheet-mensagens .ms-fop:focus-visible { background: #f5f1e8; }
      .sheet-mensagens .ms-fop[aria-current=true] { cursor: default; color: #555; background: #faf8f3; }
      .sheet-mensagens .ms-fop .ms-etq-ponto { width: 12px; height: 12px; }
      .ms-fop small { margin-left: auto; font-size: 0.76rem; color: #555; }
      .ms-gaveta-corpo > .ms-fpe { display: flex; gap: 8px; flex-wrap: wrap; padding: 14px 14px 0; }
      .ms-fpe .ms-btn { flex: 1 1 140px; }
      @media (min-width: 860px) {
        .ms-app[data-painel=funil] { grid-template-columns: 1fr; } .ms-app[data-painel=funil] .ms-conversa { display: none; } .ms-app[data-painel=funil] .ms-lateral { border-right: 0; }
        .ms-fq { scroll-snap-type: none; } .ms-fcol { flex: 1 0 200px; } .ms-fpos, .sheet-mensagens .ms-fir { display: none; }
      }

      .ms-pesquisa{display:flex;gap:8px;padding:0 12px 8px;align-items:stretch}.sheet-mensagens .ms-pesquisa .ms-busca{flex:1;min-width:0;width:0;margin:0}.ms-pesquisa>.ms-btn{flex:none;border:1px solid #d5d5d5;background:#fff;padding:8px 10px}
      .ms-abas{gap:4px}.ms-aba{font-size:.72rem;padding:6px 3px;min-height:44px;border-radius:6px}.ms-aba .ms-pt{display:none}
      /* v7.40.33 — Equipe: mesma grade dos grupos do menu Mais, sem cor nova. */
      .ms-eq-on,.ms-eq-totais,.ms-eq-hist{display:grid;gap:6px}
      .ms-eq-linha{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;min-height:40px;padding:8px 10px;border:1px solid #e3e3e3;border-radius:8px;background:#fff;font-size:.86rem;color:#222}
      .ms-eq-bola{width:8px;height:8px;border-radius:50%;background:#b9b3a8;flex:0 0 auto;align-self:center}
      .ms-eq-linha.on .ms-eq-bola{background:#2e8b57}
      .ms-eq-quando{margin-left:auto;color:#666;font-size:.78rem;white-space:nowrap}
      .ms-eq-pessoa{display:grid;gap:2px;text-align:left;min-height:48px;padding:8px 10px;border:1px solid #e3e3e3;border-radius:8px;background:#fff;cursor:pointer;color:#222}
      .ms-eq-pessoa.on{border-color:#0d0d0d;background:#f6f1e8}
      .ms-eq-num{color:#555;font-size:.78rem}
      .ms-dica{color:#555;font-size:.82rem;margin:0}
      .ms-filtros{display:grid;grid-template-columns:1.35fr 1fr .8fr;overflow:visible;gap:4px}.ms-filtros .ms-chip{min-width:0;padding:6px 3px;white-space:normal;border-radius:6px;font-size:.74rem;line-height:1.3}.ms-fila-conta{display:inline-block;margin-left:4px;font-size:.7rem}
      .ms-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:4px 4px calc(4px + env(safe-area-inset-bottom));border-top:1px solid #e6e1d6;flex:none;background:#fff}.ms-nav button{min-width:0;min-height:48px;border:0;background:#fff;font:600 .74rem/1.3 Inter,Arial,sans-serif;padding:4px;color:#555}.ms-nav button[aria-current=page]{color:#854200;background:#fff2e4;border-radius:6px}.ms-nav button:focus-visible,.ms-filtro-op:focus-within{outline:2px solid #9b4a00;outline-offset:-2px}
      .ms-filtro-grupo{border:0;border-bottom:1px solid #e6e1d6;margin:0 0 16px;padding:0 0 12px;min-width:0}.ms-filtro-grupo legend{font-weight:700;padding:0 0 8px}.ms-filtro-op{display:flex;gap:12px;align-items:center;min-height:48px;font-size:.9rem}.sheet-mensagens .ms-filtro-op input{width:20px;height:20px;flex:none;accent-color:#a65300;margin:0}.ms-filtros-pe{position:sticky;bottom:0;background:#fff;display:flex;gap:8px;justify-content:space-between;padding:12px 0}
      .ms-mais-grupo{padding-bottom:12px;border-bottom:1px solid #e6e1d6;margin-bottom:16px}.ms-mais-grupo h4{margin:0 0 4px;font-size:.8rem;color:#645e55}.ms-mais-item{display:block;width:100%;text-align:left;padding:12px 0;min-height:48px;background:none;border:0;font:inherit;color:#171714;cursor:pointer}.ms-mais-item:focus-visible{outline:2px solid #a65300}
      .ms-espiar{width:48px;min-height:44px;align-self:center;padding:4px 0;border:0;margin:4px 8px 4px 0;font-size:.65rem}.ms-vinculada .ms-av{width:32px;height:32px;font-size:.7rem}.ms-vinculada .ms-conv{padding-top:8px;padding-bottom:8px}.ms-vinculada .ms-l1 strong{font-size:.86rem}
      .sheet-mensagens .ms-ficha select{min-height:48px;max-width:100%;background:#fff;font:inherit;color:#222}.ms-fi-faceta{border-bottom:1px solid #e6e1d6;padding:0 0 8px;margin:0 0 8px}.ms-fi-faceta summary{min-height:48px;display:list-item;align-content:center;font-weight:600;cursor:pointer;overflow-wrap:anywhere}.ms-fi-faceta-corpo{padding:8px 0}.ms-fi-faceta .ms-ficha-tams{display:flex;flex-wrap:wrap;gap:8px}.ms-fi-faceta .ms-ficha-tams .ms-btn{flex:0 1 auto;min-width:44px;max-width:100%;min-height:44px;white-space:normal;overflow-wrap:anywhere;padding:10px 12px}.ms-fi-faceta-corpo>.ms-btn{margin-top:12px}.ms-fi-adicionar{display:flex;gap:8px;margin-top:12px}.ms-fi-adicionar input{min-width:0;flex:1}.ms-fi-faceta summary:focus-visible{outline:2px solid #a65300}.ms-ficha [hidden]{display:none!important}

      /* Ritmo e hierarquia da proposta HTML aprovada: superfícies leves, abas e ícones de linha. */
      .sheet-mensagens{color:#20211e}.sheet-mensagens .ms-topo{min-height:68px;padding:12px 16px;border-bottom:1px solid #e7e7e0;box-sizing:border-box;gap:10px;flex:none}body .sheet-mensagens .ms-titulo{display:block;font-size:1.2rem;font-weight:750;line-height:1.25;letter-spacing:-.035em}.sheet-mensagens .ms-identidade{margin-top:3px;font-size:.8rem;font-weight:400;letter-spacing:0;color:#62675d}.sheet-mensagens #ms-mais{background:transparent;border-radius:12px;font-weight:400}.ms-linha-icone{display:inline-flex;align-items:center;justify-content:center;flex:none}.ms-linha-icone svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      /* Cabeçalho de Mensagens: nunca sobrepor título, identidade nem ferramentas no celular.
         Rolagem horizontal nas ações conserva todos os botões e suas áreas de toque. */
      .sheet-mensagens .ms-topo{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;min-width:0;height:auto}
      .sheet-mensagens .ms-topo>.ms-titulo{min-width:0;overflow:hidden;overflow-wrap:anywhere}
      .sheet-mensagens .ms-topo>.ms-ao-vivo{min-width:0}
      .sheet-mensagens .ms-topo>.ms-ico{flex:0 0 44px}
      @media(max-width:650px){
        .sheet-mensagens .ms-topo{grid-template-columns:minmax(0,1fr) 44px 44px;gap:8px;padding:12px 14px;min-height:72px}
        .sheet-mensagens .ms-topo>.ms-titulo{font-size:1.16rem;line-height:1.25}
        .sheet-mensagens .ms-topo .ms-identidade{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .sheet-mensagens .ms-topo>.ms-ao-vivo{grid-row:2;grid-column:1 / -1;justify-self:start;font-size:.73rem}
        .sheet-mensagens .ms-topo>#ms-fechar{grid-column:2;grid-row:1}
        .sheet-mensagens .ms-topo>#ms-mais{grid-column:3;grid-row:1}
      }
      .sheet-mensagens .ms-abas{padding:0 8px;gap:0;border-bottom:1px solid #e7e7e0;flex:none}.sheet-mensagens .ms-aba{position:relative;border:0;border-radius:0;min-height:48px;padding:0 3px;font-size:.73rem;font-weight:650;color:#5c6455;background:#fff}#overlay-mensagens #ms-abas .ms-aba[aria-selected=true]{background:#fff!important;color:#23251f!important}#overlay-mensagens #ms-abas .ms-aba{border:0!important;border-radius:0!important}.sheet-mensagens .ms-aba[aria-selected=true]::after{content:'';position:absolute;bottom:0;left:9px;right:9px;height:3px;background:#d97116;border-radius:3px 3px 0 0}
      .sheet-mensagens .ms-pesquisa{position:relative;padding:12px 16px 10px;gap:8px;flex:none}.sheet-mensagens .ms-pesquisa>.ms-linha-icone{position:absolute;left:26px;top:24px;color:#656d5e;pointer-events:none}.sheet-mensagens .ms-pesquisa .ms-busca{background:#f7f6f2;border-color:#e0e1d8;border-radius:10px;font-size:.875rem;padding:10px 8px 10px 36px;min-height:44px}.sheet-mensagens .ms-pesquisa>.ms-btn{display:flex;align-items:center;justify-content:center;gap:6px;max-width:100px;min-width:76px;padding:8px;border-color:#e0e1d8;font-size:.75rem;font-weight:600}
      .sheet-mensagens .ms-filtros{padding:0 16px 8px;gap:6px;grid-template-columns:1.4fr 1.12fr .8fr;flex:none}.sheet-mensagens .ms-filtros .ms-chip{display:flex;align-items:center;justify-content:center;gap:5px;min-height:44px;padding:7px 5px;border:0;border-radius:8px;background:#f4f4ef;font-size:.75rem;font-weight:500;color:#555d4f}.sheet-mensagens .ms-filtros .ms-chip[aria-pressed=true]{background:#292b25;color:#fff}.ms-fila-conta{font-weight:750;margin:0;font-size:.72rem;flex:none}
      .ms-intro{padding:0 16px 4px;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px;flex:none;color:#62695a;font-size:.7rem}.ms-intro button{min-width:64px;min-height:44px;border:0;background:none;color:#805324;font:inherit;font-weight:600;padding:4px}
      .sheet-mensagens .ms-lista{padding:0 12px 16px}.sheet-mensagens .ms-conv-li{border-bottom:1px solid #e7e7e0}.sheet-mensagens .ms-conv{gap:10px;padding:13px 4px 12px;min-height:104px;align-items:flex-start;background:transparent}.sheet-mensagens .ms-av{width:38px;height:38px;flex:0 0 38px;border-radius:50%;font-size:.75rem;margin-top:3px;background:#dce7e3!important;color:#345f54}.sheet-mensagens .ms-conv-li:nth-child(3n) .ms-av{background:#e8dfda!important;color:#6a4b3e}.sheet-mensagens .ms-conv-li:nth-child(3n+2) .ms-av{background:#e0e5d6!important;color:#4b553c}.sheet-mensagens .ms-nome{font-size:.91rem;font-weight:650;line-height:1.35}.sheet-mensagens .ms-l1 time{font-size:.69rem;color:#697060;font-weight:400;white-space:nowrap}.sheet-mensagens .ms-l2{font-size:.85rem;line-height:1.4;margin-top:3px;color:#5e6457}.sheet-mensagens .nova .ms-l2{color:#252a21}.sheet-mensagens .ms-l3{gap:6px;font-size:.67rem;margin-top:5px;color:#62695a}.sheet-mensagens .ms-canal-tag{font-size:.63rem;font-weight:600;border-radius:4px;padding:2px 5px}.sheet-mensagens .ms-aguarda{font-size:.69rem;font-weight:500;line-height:1.4;margin-top:4px}.sheet-mensagens .ms-espiar{width:44px;min-height:44px;margin:0 0 0 4px;border:0;background:none;font-size:.63rem;color:#645d50;align-self:center}.sheet-mensagens .ms-espiar .ms-olho{width:19px;height:19px}
      .sheet-mensagens .ms-vinculo-principal{border:1px solid #e4e1d8;border-bottom:0;border-radius:12px 12px 0 0;background:#fcfbf7;margin-top:6px}.sheet-mensagens .ms-vinculada{background:#fcfbf7;border-left:1px solid #e4e1d8;border-right:1px solid #e4e1d8;margin:0;padding-left:44px}.sheet-mensagens .ms-vinculada .ms-conv{padding:8px 6px;min-height:60px}.sheet-mensagens .ms-vinculada .ms-av{display:none}.sheet-mensagens .ms-vinculada .ms-nome{font-size:.76rem;font-weight:500}.sheet-mensagens .ms-vinculada .ms-l2{font-size:.76rem}.sheet-mensagens .ms-vinculada .ms-fone,.sheet-mensagens .ms-vinculada .ms-dono-tag{display:none}.sheet-mensagens .ms-vinculo-fim{border:1px solid #e4e1d8;border-top:0;border-radius:0 0 12px 12px;margin-bottom:6px}
      .sheet-mensagens .ms-nav{padding:5px 8px calc(6px + env(safe-area-inset-bottom));border-top:1px solid #e7e7e0;gap:0}.sheet-mensagens .ms-nav button{position:relative;display:flex;flex-direction:column;gap:5px;align-items:center;justify-content:center;min-height:52px;font-size:.7rem;font-weight:500;background:transparent;color:#62695a;padding:4px}.sheet-mensagens .ms-nav button[aria-current=page]{color:#99500d;background:transparent;border-radius:0;font-weight:700}.sheet-mensagens .ms-nav button[aria-current=page]::before{content:'';position:absolute;top:-5px;left:30%;right:30%;height:3px;background:#d97116;border-radius:0 0 3px 3px}
      @media(prefers-reduced-motion:no-preference){.sheet-mensagens .ms-aba,.sheet-mensagens .ms-chip,.sheet-mensagens .ms-nav button{transition:background-color 160ms,color 160ms}}

      .ms-gaveta-proposta [hidden]{display:none!important}
      /* Filtros/Mais reproduzem os painéis da proposta, sem alterar as outras gavetas. */
      .sheet-mensagens .ms-gaveta.ms-gaveta-proposta{inset:0;width:auto;padding-top:24px;box-sizing:border-box;background:rgba(27,33,30,.4);justify-content:flex-end;border:0;box-shadow:none}
      .ms-gaveta-proposta .ms-gaveta-painel{background:#fff;border-radius:20px 20px 0 0;width:100%;max-height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -8px 60px rgba(29,33,28,.07)}
      .sheet-mensagens .ms-gaveta-proposta .ms-gaveta-cab{padding:13px 16px 9px;gap:8px;border-bottom:1px solid #e7e7e0;flex:none}
      .sheet-mensagens .ms-gaveta-proposta .ms-gaveta-cab h3{font:700 1rem/1.3 Inter,Arial,sans-serif;letter-spacing:-.03em;margin:0;color:#20211e}
      .sheet-mensagens .ms-gaveta-proposta .ms-gaveta-cab .ms-ico{background:transparent;border-radius:12px;font-size:1.1rem;font-weight:400;min-height:44px;min-width:44px}
      .sheet-mensagens .ms-gaveta-proposta .ms-gaveta-corpo{padding:4px 18px 16px;flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}
      .sheet-mensagens .ms-gaveta-proposta .ms-filtro-grupo{margin:0;padding:16px 0;border:0;border-bottom:1px solid #e7e7e0;min-width:0}
      .sheet-mensagens .ms-gaveta-proposta .ms-filtro-grupo legend{font:600 .68rem/1.4 Inter,Arial,sans-serif;text-transform:uppercase;letter-spacing:.09em;color:#62695a;margin:0 0 8px;padding:0;float:left;width:100%}
      .sheet-mensagens .ms-gaveta-proposta .ms-filtro-grupo legend+*{clear:both}
      .sheet-mensagens .ms-gaveta-proposta .ms-filtro-op{display:flex;align-items:center;gap:10px;min-height:44px;padding:0;margin:0;font:400 .85rem/1.4 Inter,Arial,sans-serif;color:#20211e;cursor:pointer}
      .sheet-mensagens .ms-gaveta-proposta .ms-filtro-op input{width:18px;height:18px;margin:0;flex:none;accent-color:#a76a25}
      .sheet-mensagens .ms-gaveta-proposta .ms-filtro-select{width:100%;max-width:100%;min-width:0;min-height:46px;margin:0;padding:11px 12px;border:1px solid #8b9481;border-radius:9px;background:#fff;color:#20211e;font:400 .9rem/1.4 Inter,Arial,sans-serif;box-sizing:border-box}
      .sheet-mensagens .ms-gaveta-proposta .ms-filtros-pe{position:static;padding:12px 18px max(16px,env(safe-area-inset-bottom));border-top:1px solid #e7e7e0;background:#fff;display:flex;gap:8px;align-items:center;flex:none}
      .sheet-mensagens .ms-gaveta-proposta .ms-filtros-pe .ms-btn{min-height:48px;margin:0;padding:10px 14px;border-radius:9px;font:600 .85rem/1.4 Inter,Arial,sans-serif;background:transparent;color:#6c4523}
      .sheet-mensagens .ms-gaveta-proposta .ms-filtros-pe .prim{flex:1;background:var(--laranja,#e97d1c);color:#171714}
      .sheet-mensagens .ms-gaveta-proposta .ms-mais-grupo{margin:0;padding:14px 0 8px;border-bottom:1px solid #e7e7e0}
      .sheet-mensagens .ms-gaveta-proposta .ms-mais-grupo h4{font:600 .68rem/1.4 Inter,Arial,sans-serif;text-transform:uppercase;letter-spacing:.09em;color:#62695a;margin:0 0 8px}
      .sheet-mensagens .ms-gaveta-proposta .ms-mais-item{display:flex;gap:12px;align-items:center;min-height:48px;width:100%;margin:0;padding:8px 0;border:0;border-radius:4px;background:transparent;color:#20211e;font:400 .86rem/1.4 Inter,Arial,sans-serif;text-align:left;cursor:pointer}
      .sheet-mensagens .ms-gaveta-proposta .ms-mais-texto{flex:1;min-width:0;overflow-wrap:anywhere}
      .sheet-mensagens .ms-gaveta-proposta .ms-mais-item>.ms-linha-icone{color:#62695a}
      .sheet-mensagens .ms-gaveta-proposta .ms-mais-item>.ms-linha-icone:first-child svg{width:18px;height:18px}
      .sheet-mensagens .ms-gaveta-proposta .ms-mais-item>.ms-linha-icone:last-child svg{width:15px;height:15px}
      .sheet-mensagens .ms-gaveta-proposta .ms-mais-item:hover{background:#f7f6f2}
      .sheet-mensagens .ms-gaveta-proposta button:focus-visible,.sheet-mensagens .ms-gaveta-proposta select:focus-visible{outline:2px solid #99500d;outline-offset:-2px}
      @media(min-width:860px){.ms-gaveta-proposta .ms-gaveta-painel{max-width:480px;align-self:flex-end}}
      @media(prefers-reduced-motion:no-preference){.ms-gaveta-proposta .ms-gaveta-painel{animation:ms-painel-proposta 160ms ease-out}@keyframes ms-painel-proposta{from{transform:translateY(12px);opacity:.7}to{transform:translateY(0);opacity:1}}}
      .sheet-mensagens .ms-agendar-item{display:flex;align-items:center;gap:12px;width:100%;max-width:none;min-height:64px;margin:0;padding:12px 0;border:0;border-radius:0;border-bottom:1px solid #e7e7e0;box-shadow:none;background:transparent;color:#20211e;font:600 .95rem/1.4 Inter,Arial,sans-serif;text-align:left;cursor:pointer}
      .ms-agendar-item svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;flex:none}
      .ms-acomp-opcao{padding:12px 0;border-bottom:1px solid #e7e7e0}
      .ms-acomp-linha{display:flex;align-items:center;gap:12px;min-height:48px;cursor:pointer}
      .ms-acomp-linha input{width:22px;height:22px;margin:0;accent-color:#99500d}
      .ms-acomp-opcao p,.ms-acomp-feedback{font-size:.85rem;line-height:1.5;color:#515749;margin:4px 0 8px;overflow-wrap:anywhere}
      .ms-acomp-feedback{min-height:24px;padding:8px 0;color:#724618}
      .ms-ag-anexo{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
      .ms-ag-anexo-nome{font-size:.85rem;overflow-wrap:anywhere;min-width:0;max-width:100%}
      .ms-ag-anexo [hidden]{display:none!important}
      .ms-agenda .ms-btn{min-height:44px}
      .ms-gaveta-proposta .ms-agenda,.ms-gaveta-proposta .ms-auto{padding:0}
      .ms-expediente details{border-bottom:1px solid #e7e7e0}
      .ms-expediente summary{min-height:48px;display:list-item;align-content:center;font-weight:600;cursor:pointer}
      .ms-exp-dia{min-inline-size:0;margin:8px 0;padding:8px 0;border:0;border-bottom:1px solid #e7e7e0}
      .ms-exp-dia legend{font-size:.9rem;font-weight:600;padding:0}
      .ms-exp-par{display:flex;gap:8px;align-items:flex-end;min-width:0;flex-wrap:wrap;margin-bottom:8px}
      .ms-exp-hora{flex:1;min-width:90px;font-size:.8rem}
      .ms-exp-hora span{display:block;min-height:24px}
      .ms-exp-hora input{width:100%;min-width:0;max-width:100%;box-sizing:border-box;min-height:44px;padding:8px}
      .ms-exp-par>.ms-btn{width:44px;min-width:44px;padding:0;font-size:1.2rem}
      .ms-exp-excecao{display:flex;gap:8px;align-items:center;justify-content:space-between;font-size:.85rem;border-bottom:1px solid #e7e7e0}
      .ms-expediente [hidden],#ms-gaveta textarea[hidden]{display:none!important}
      .ms-auto-status{flex:1;min-width:0;align-self:center;padding-right:8px;color:#515749;font-size:.8rem;line-height:1.4;overflow-wrap:anywhere}
      .ms-ag-pesquisa{display:flex;align-items:center;gap:8px;padding:8px 0}
      .ms-ag-pesquisa input{flex:1;min-width:0}
      .ms-ag-pesquisa .ms-btn{min-width:80px;min-height:44px}
      .sheet-mensagens .ms-filtros{grid-template-columns:1.05fr 1.35fr .85fr}.sheet-mensagens .ms-filtros select.ms-chip{width:100%;font:600 .8rem Inter,Arial,sans-serif;border:1px solid #8b9481;background:#fff;color:#20211e}
      .ms-ag-filtros{border-bottom:1px solid #e7e7e0}
      .ms-ag-filtros summary{min-height:44px;align-content:center;cursor:pointer;font-weight:600}
      .ms-ag-filtros-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 8px;padding-bottom:12px}
      .ms-ag-filtro{min-width:0;font-size:.8rem}
      .ms-ag-filtro span{display:block;line-height:1.5;margin-bottom:4px}
      .ms-ag-filtro .ms-copia{min-width:0;width:100%;max-width:100%;box-sizing:border-box;min-height:44px;padding:8px}
      .ms-ag-painel-status{font-size:.8rem;color:#515749;min-height:24px;margin:8px 0 0;line-height:1.5}
      .ms-ag-painel-lista{list-style:none;margin:0;padding:0}
      .ms-ag-painel-lista>li{display:flex;gap:12px;align-items:center;border-bottom:1px solid #e7e7e0;padding:8px 0}
      .ms-ag-painel-item{flex:1;min-width:0;overflow-wrap:anywhere}
      .sheet-mensagens .ms-ag-cliente{width:100%;max-width:none;min-height:44px;margin:0;padding:4px 0;border:0;border-radius:0;box-shadow:none;background:transparent;color:#20211e;font:600 .95rem/1.4 Inter,Arial,sans-serif;text-align:left;cursor:pointer}
      .ms-ag-painel-item p{margin:4px 0;font-size:.85rem;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .ms-ag-data{display:block;font-size:.8rem;line-height:1.5;color:#3e493d}
      .ms-ag-painel-item small{display:block;font-size:.76rem;line-height:1.5;color:#515749}
      .ms-ag-painel-item .ms-ag-painel-erro{color:#8b3c11}
      .ms-ag-painel-lista .ms-btn{min-height:44px;min-width:72px;font-size:.8rem;padding:8px}
      .ms-auto-pe[hidden]{display:none!important}
      @media(max-width:650px){.sheet-mensagens .ms-assina{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:0;padding:0 4px}.sheet-mensagens .ms-assina .ms-ferr-btn{display:flex;flex-direction:column;justify-content:center;gap:4px;min-width:0;min-height:52px;max-width:none;margin:0;padding:4px 2px;font-size:.72rem}.sheet-mensagens .ms-assina-btn b{max-width:100%;order:2}.sheet-mensagens .ms-assina-btn svg{order:1}}
`;
    document.head.appendChild(s);
  }

  function iconeFluido_(nome){
    const p={conversas:'M4 5h16v12H9l-5 4z',funil:'M3 4h18l-7 8v7l-4 2v-9z',notas:'M5 3h14v13l-5 5H5zM14 21v-5h5',mais:'M5 12h.01M12 12h.01M19 12h.01',chevron:'m9 5 7 7-7 7',selecao:'M9 11l2 2 4-4M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2',painel:'M4 20V10M10 20V4M16 20v-7M22 20H2',auto:'m13 2-9 12h7l-1 8 10-13h-7z',atualizar:'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15',config:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',usuario:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 8h5m-2-2 2 2-2 2',baixar:'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',permissoes:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',conexao:'m8 3 3 3-5 5-3-3M16 21l-3-3 5-5 3 3M8 16l8-8',busca:'M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',filtros:'M4 6h16M7 12h10M10 18h4M8 3v6M16 9v6M12 15v6'};
    p.agenda='M5 5h14v16H5zM5 9h14M8 3v4M16 3v4M8 13h3M8 17h6';
    p.equipe='M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M17 11a3 3 0 1 0 0-6M18 14a4 4 0 0 1 3 4v2';
    const n=el('span','ms-linha-icone');n.setAttribute('aria-hidden','true');n.innerHTML='<svg viewBox="0 0 24 24"><path d="'+p[nome]+'"/></svg>';return n;
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
    const h = el('h2', 'ms-titulo', 'Mensagens'); h.id = 'ms-titulo';
    const live = el('span', 'ms-ao-vivo', ''); live.id = 'ms-vivo'; live.setAttribute('role', 'status');
    const mais = botao('ms-ico', '⋯', 'menu-geral'); mais.setAttribute('aria-label', 'Mais opções'); mais.setAttribute('aria-haspopup', 'dialog'); mais.id = 'ms-mais';mais.textContent='';mais.appendChild(iconeFluido_('mais'));
    const x = botao('ms-ico', '✕', 'fechar'); x.id = 'ms-fechar'; x.setAttribute('aria-label', 'Fechar mensagens');
    topo.append(h, live, mais, x);
    const quem=el('small','ms-identidade');quem.id='ms-identidade';h.appendChild(quem);atualizarIdentidade_();
    const abas = el('div', 'ms-abas'); abas.id = 'ms-abas'; abas.setAttribute('role', 'tablist');
    const filtros = el('div', 'ms-filtros'); filtros.id = 'ms-filtros';
    const busq = el('input', 'ms-busca'); busq.id = 'ms-busca'; busq.type = 'search'; busq.placeholder = 'Buscar conversa'; busq.setAttribute('aria-label', 'Buscar conversas');
    const estado = el('div'); estado.id = 'ms-estado-wrap';
    const av = el('p', 'ms-aviso'); av.id = 'ms-aviso'; av.hidden = true; av.setAttribute('role', 'status');
    const wrap = el('div', 'ms-lista-wrap'); wrap.id = 'ms-lista-wrap'; const ul = el('ul', 'ms-lista'); ul.id = 'ms-lista'; wrap.appendChild(ul);
    const extra = el('div'); extra.id = 'ms-extra'; wrap.appendChild(extra);
    const selbar = el('div', 'ms-selbar'); selbar.id = 'ms-selbar'; selbar.hidden = true; selbar.setAttribute('role', 'toolbar'); selbar.setAttribute('aria-label', 'Conversas selecionadas');
    const saudeEl = el('div', 'ms-saude'); saudeEl.id = 'ms-saude'; saudeEl.hidden = true; saudeEl.setAttribute('role', 'alert');
    const pesquisa = el('div','ms-pesquisa'); pesquisa.id='ms-pesquisa';
    const bf=botao('ms-btn','Filtros','filtros-abrir');bf.id='ms-btn-filtros';bf.setAttribute('aria-haspopup','dialog');bf.prepend(iconeFluido_('filtros'));pesquisa.append(iconeFluido_('busca'),busq,bf);
    const nav=el('nav','ms-nav');nav.id='ms-nav';nav.setAttribute('aria-label','Navegação das mensagens');
    [['Conversas','inicio','conversas'],['Funil','funil','funil'],['Com notas','inicio-notas','notas'],['Mais','menu-geral','mais']].forEach(([nome,acao,ico])=>{const b=botao('',nome,acao);b.prepend(iconeFluido_(ico));nav.appendChild(b);});
    const intro=el('div','ms-intro');intro.id='ms-intro';const resultados=el('span');resultados.id='ms-resultados';intro.append(resultados,botao('','Selecionar','selecionar'));
    lat.append(topo, saudeEl, abas, pesquisa, filtros, estado, intro, wrap, selbar, nav);
    // v7.22: segurar o dedo numa conversa começa a seleção (como no WhatsApp)
    ul.addEventListener('pointerdown', (ev) => { const b = ev.target.closest('.ms-conv'); if (!b || selecao) return; clearTimeout(timerToque); toqueLongo = false; timerToque = setTimeout(() => { toqueLongo = true; iniciarSelecao_(Number(b.dataset.id)); if (navigator.vibrate) try { navigator.vibrate(20); } catch (e) { /* sem vibração */ } }, 550); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => ul.addEventListener(t, () => clearTimeout(timerToque)));
    ul.addEventListener('scroll', () => clearTimeout(timerToque), { passive: true });
    ul.addEventListener('contextmenu', (ev) => { if (ev.target.closest('.ms-conv')) ev.preventDefault(); });
    const conv = el('section', 'ms-conversa'); conv.id = 'ms-conversa'; conv.setAttribute('aria-label', 'Conversa');
    conv.appendChild(vazioConversa_());
    app.append(lat, conv); sheet.appendChild(app); sheet.appendChild(av); o.appendChild(sheet); document.body.appendChild(o);
    permissaoObserver_.observe(o,{childList:true,subtree:true});
    o.addEventListener('click', clique);
    // v7.21: liga/desliga "marcar como lida no celular" de cada canal
    o.addEventListener('change', async (ev) => {
      const ass = ev.target && ev.target.dataset && ev.target.dataset.cfgAssinatura ? ev.target : null;
      if (ass && cfgLeitura) {
        ass.disabled = true; const r = await worker_('/msg/config', 'POST', { assinatura: ass.checked }); ass.disabled = false;
        if (r.ok) { versaoPerfil_++;cfgLeitura=Object.assign({},cfgLeitura,r);guardarPerfil_(); aviso_(r.config.assinatura ? 'O nome do atendente vai antes das respostas.' : 'Suas respostas saem sem assinatura.'); desenharAssina_(false); } else { ass.checked = !ass.checked; aviso_(r.erro || 'Não foi possível salvar agora.'); }
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
    if (ev.key === 'Escape' && $('ms-gaveta')) { if(!sairFicha_())return;fichaOrig_=null;fecharGaveta_(); const t = $('ms-texto'); if (t) t.focus(); ev.stopPropagation(); return; }
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
      b.appendChild(document.createTextNode(nome)); b.title=c.conversas+' conversas';
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
  let ETQ = null, etqFiltro = 0, etqCarregando = false, etqDaFicha_ = false;
  const COR_ETQ_ = { cinza: '#7d776d', ambar: '#c98a00', azul: '#3a6fd8', verde: '#2e8b57', roxo: '#7a4fd1', rosa: '#c2477a' };
  function pontoEtq_(e) { const d = el('span', 'ms-etq-ponto'); d.style.background = COR_ETQ_[e.cor] || COR_ETQ_.cinza; d.setAttribute('aria-hidden', 'true'); return d; }
  function tagEtq_(e) { const t = el('span', 'ms-etq'); t.append(pontoEtq_(e), document.createTextNode(e.nome)); return t; }
  async function carregarEtiquetas_() { if(!podeFerramenta_('etiquetas')){ETQ=[];return;} if (etqCarregando) return; etqCarregando = true; const r = await worker_('/msg/etiquetas', 'GET'); etqCarregando = false; ETQ = r && r.ok ? r.etiquetas : []; desenharFiltros(); }
  function faixaEtq_(c) {
    const f = el('div', 'ms-etq-faixa'); f.id = 'ms-etq-faixa';
    if (c.dono) { f.appendChild(el('span', 'ms-dono-tag', 'Responsável: ' + c.dono)); f.appendChild(botao('ms-etq-mais', 'Liberar', 'liberar')); }   // v7.40.6
    else f.appendChild(botao('ms-etq-mais', 'Assumir', 'assumir'));
    if (c.tamanhos) { const v = el('span', 'ms-veste', 'Veste ' + c.tamanhos); v.id = 'ms-veste'; v.title = 'Tamanhos da ficha do cliente'; f.appendChild(v); }   // v7.40.14
    (c.etiquetas || []).forEach((e) => f.appendChild(tagEtq_(e)));
    f.appendChild(botao('ms-etq-mais', (c.etiquetas || []).some(e=>e.venda) ? 'Mudar etapa' : '+ Etapa da venda', 'etiquetas'));
    const n = msgs.filter(m => m.direcao === 'nota').length;
    if (aberta && aberta.id === c.id && n) f.appendChild(botao('ms-etq-mais', 'Notas · ' + n, 'notas-abrir'));
    return f;
  }
  function abrirEtiquetas_() {
    if (!aberta) return; const corpo = gaveta_('Etapa da venda'); if (!corpo) return;
    const tem = new Set((aberta.etiquetas || []).map((e) => e.id)), lista = ETQ || [];
    const grupo = (titulo, itens, tipo) => {
      if (!itens.length) return; corpo.appendChild(el('p', 'ms-etq-rot', titulo));
      itens.forEach((e) => { const lb = el('label', 'ms-etq-op'), i = el('input'); i.type = tipo; i.name = tipo === 'radio' ? 'ms-etq-venda' : 'ms-etq-' + e.id; i.value = String(e.id); i.checked = tem.has(e.id); lb.append(i, pontoEtq_(e), document.createTextNode(e.nome)); corpo.appendChild(lb); });
    };
    grupo('Etapa da venda · uma por vez', lista.filter((e) => e.venda), 'radio');

    const pe = el('div', 'ms-etq-pe'); pe.append(botao('ms-btn', 'Tirar etapa', 'etq-sem-etapa'), botao('ms-btn prim', 'Salvar', 'etq-salvar')); corpo.appendChild(pe);
  }
  async function salvarEtiquetas_() {
    const g = $('ms-gaveta'); if (!g || !aberta) return;
    const ids = [...new Set(Array.from(g.querySelectorAll('.ms-etq-op input:checked')).map((i) => Number(i.value)).concat((aberta.etiquetas||[]).filter(e=>!e.venda).map(e=>e.id)))];
    const c = aberta, r = await worker_('/msg/rotular', 'POST', { conversa: c.id, etiquetas: ids });
    if (!r.ok) { aviso_(r.erro || 'Não salvei a etapa da venda. Tente de novo.'); return; }
    c.etiquetas = r.etiquetas; fecharGaveta_(); const fx = $('ms-etq-faixa'); if (fx) fx.replaceWith(faixaEtq_(c));
    aviso_('Etapa da venda salva.'); if (etqDaFicha_) { etqDaFicha_ = false; abrirFicha_(); }
    ETQ = null; desenharFiltros(); await carregarLista(false);
  }
  function desenharFiltros() {
    const f = $('ms-filtros'); if (!f) return;
    const c = contVista || contagemDe_(canal), t = contTipos || { individuais: Math.max(0, (c.conversas || 0) - (c.grupos || 0)), grupos: c.grupos || 0 };
    f.textContent = '';
    const grupo=tipoParam_()==='grupo'||tipos.grp;
    const filaVisivel=['encerradas','retomar','minhas','com_notas'].includes(filtro)||grupo?'':filaAtendimento_;
    [['esperando','Esperando',c.esperando],['em_atendimento','Em atendimento',c.em_atendimento]].forEach(([id,nome,n])=>{
      const b=botao('ms-chip',nome,'fila-atendimento',{fila:id});b.setAttribute('aria-pressed',String(filaVisivel===id));f.appendChild(b);
    });
    if(filaVisivel==='em_atendimento'){
      const sel=el('select','ms-chip');sel.id='ms-atendimento-escopo';sel.setAttribute('aria-label','Atendimentos de');[['todos','Todos'],['meus','Meus']].forEach(([v,t])=>{const o=el('option','',t);o.value=v;sel.appendChild(o);});sel.value=escopoAtendimento_;sel.addEventListener('change',()=>{escopoAtendimento_=sel.value;carregarLista(true);});f.appendChild(sel);
    }else{const b=botao('ms-chip','Todas','fila-atendimento',{fila:''});b.setAttribute('aria-pressed',String(filaVisivel===''));f.appendChild(b);}
    const bf=$('ms-btn-filtros');if(bf){const ativo=etqFiltro||!tipos.msg||tipos.grp||!!filtro;bf.textContent=ativo?'Filtros •':'Filtros';bf.prepend(iconeFluido_('filtros'));bf.setAttribute('aria-label',ativo?'Filtros, há filtros aplicados':'Filtros');}
    const nav=$('ms-nav');if(nav)nav.querySelectorAll('button').forEach(b=>{const ativo=b.dataset.ms==='funil'?painel==='funil':b.dataset.ms==='inicio-notas'?filtro==='com_notas':b.dataset.ms==='inicio'?painel!=='funil'&&filtro!=='com_notas':false;b.setAttribute('aria-current',ativo?'page':'false');});
    if(!ETQ)carregarEtiquetas_();
  }
  function propostaGaveta_(tipo,anterior){
    const g=$('ms-gaveta');if(!g)return null;
    g.classList.add('ms-gaveta-proposta');g.dataset.tipo=tipo;
    const app=$('ms-app');if(app&&g.parentElement!==app)app.appendChild(g);
    const titulo=g.getAttribute('aria-label');g.removeAttribute('aria-label');g.setAttribute('role','presentation');
    const painel=el('div','ms-gaveta-painel');painel.setAttribute('role','dialog');painel.setAttribute('aria-modal','true');painel.setAttribute('aria-label',titulo);
    while(g.firstChild)painel.appendChild(g.firstChild);g.appendChild(painel);
    g.addEventListener('click',ev=>{if(ev.target===g)fecharGaveta_();});
    g.addEventListener('keydown',ev=>{if(ev.key!=='Tab')return;const alvos=[...painel.querySelectorAll('button,input,textarea,select,summary,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length),primeiro=alvos[0],ultimo=alvos.at(-1);if(ev.shiftKey&&document.activeElement===primeiro){ev.preventDefault();ultimo.focus();}else if(!ev.shiftKey&&document.activeElement===ultimo){ev.preventDefault();primeiro.focus();}});
    document.addEventListener('tk:camada-fechada',function foco(ev){if(ev.detail?.chave!=='ms-gaveta')return;document.removeEventListener('tk:camada-fechada',foco);setTimeout(()=>{if(!g.isConnected&&!$('ms-gaveta')&&document.activeElement===document.body&&anterior?.isConnected)anterior.focus();},0);});
    painel.querySelector('.ms-gaveta-cab button')?.focus();return painel;
  }
  function abrirFiltros_(){
    const anterior=document.activeElement,corpo=gaveta_('Filtros');if(!corpo)return;const painel=propostaGaveta_('filtros',anterior);
    const sec=(titulo)=>{const fs=el('fieldset','ms-filtro-grupo');fs.appendChild(el('legend','',titulo));corpo.appendChild(fs);return fs;};
    const opc=(pai,tipo,nome,valor,texto,checked)=>{const lb=el('label','ms-filtro-op'),i=el('input');i.type=tipo;i.name=nome;i.value=valor;i.checked=checked;lb.append(i,document.createTextNode(texto));pai.appendChild(lb);};
    const selecao=(pai,nome,rotulo,itens,valor)=>{const sel=el('select','ms-filtro-select');sel.name=nome;sel.setAttribute('aria-label',rotulo);itens.forEach(([v,t])=>{const op=el('option','',t);op.value=v;sel.appendChild(op);});sel.value=String(valor);pai.appendChild(sel);return sel;};
    if(canal!=='instagram'){const g=sec('O que mostrar');opc(g,'checkbox','ms-ft-tipo','msg','Atendimentos individuais',tipos.msg);opc(g,'checkbox','ms-ft-tipo','grp','Grupos',tipos.grp);}
    const g=sec('Mostrar');
    const filas=[['','Todas as conversas abertas'],...FILTROS];
    selecao(g,'ms-ft-fila','Mostrar conversas',filas,filtro);
    const etapas=(ETQ||[]).filter(e=>e.venda);if(etapas.length){const e=sec('Etapa da venda');selecao(e,'ms-ft-etapa','Etapa da venda',[['0','Todas as etapas'],...etapas.map(x=>[String(x.id),x.nome])],etqFiltro);}
    const pe=el('div','ms-filtros-pe');pe.append(botao('ms-btn','Limpar','filtros-limpar'),botao('ms-btn prim','Aplicar filtros','filtros-aplicar'));painel.appendChild(pe);
  }
  function abrirMais_(){
    const anterior=document.activeElement,corpo=gaveta_('Mais');if(!corpo)return;propostaGaveta_('mais',anterior);
    const mapa={selecionar:'selecao',painel:'painel',funil:'funil','auto-cfg':'auto','agenda-painel':'agenda',atualizar:'atualizar','leitura-cfg':'config','trocar-usuario':'usuario','app-atualizar':'baixar','app-permissoes':'permissoes',conexao:'conexao',exp:'baixar','nova-conversa':'selecao','equipe-atividade':'equipe'};
    const grupo=(titulo,itens)=>{const sec=el('section','ms-mais-grupo');sec.appendChild(el('h4','',titulo));itens.forEach(([nome,acao,dados])=>{const b=botao('ms-mais-item','',acao,dados);b.append(iconeFluido_(mapa[acao]),el('span','ms-mais-texto',nome),iconeFluido_('chevron'));sec.appendChild(b);});corpo.appendChild(sec);};
    grupo('Atendimento',[['Nova conversa','nova-conversa'],['Equipe e atividade','equipe-atividade'],['Selecionar conversas','selecionar'],['Painel de atendimento','painel'],['Agendamentos','agenda-painel'],['Etapas da venda','funil'],['Respostas automáticas','auto-cfg'],['Atualizar agora','atualizar']]);
    grupo('Conta e aplicativo',[['Configurações de leitura e nome','leitura-cfg'],['Trocar usuário','trocar-usuario'],...(window.TKAndroid?[['Atualizar app','app-atualizar'],['Permissões do app','app-permissoes']]:[]),...(canal!=='todos'?[['Conexão deste canal','conexao']]:[])]);
    grupo('Exportar',[...(canal!=='todos'?[['Este canal (CSV)','exp',{params:'formato=csv&canal='+canal,rotulo:'o canal'}],['Este canal (TXT para IA)','exp',{params:'formato=txt&canal='+canal,rotulo:'o canal'}]]:[]),['Tudo (CSV, três canais)','exp',{params:'formato=csv',rotulo:'tudo'}],['Tudo (JSON)','exp',{params:'formato=json',rotulo:'tudo'}]]);
    corpo.querySelectorAll('.ms-mais-grupo').forEach(sec=>{if(![...sec.querySelectorAll('button')].some(b=>!b.hidden))sec.hidden=true;});
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
    if(!c.pausado && (canal==='instagram'||c.v2))return;
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
    if(adminAssinatura_()){
    const la = el('label', 'ms-cfg-linha'), ca = el('input'); ca.type = 'checkbox'; ca.checked = cfgLeitura.config.assinatura !== false; ca.dataset.cfgAssinatura = '1';
    la.append(ca, document.createTextNode(' Mostrar meu nome nas respostas antes da mensagem')); caixa.appendChild(la);}
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
    largarFunil_(); painel = 'metricas'; const ex = $('ms-extra'), ul = $('ms-lista'); ul.hidden = true; chrome_(true); ex.textContent = '';
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
  let versaoPerfil_ = 0;
  function perfilGuardado_() {
    try { const c=JSON.parse(localStorage.getItem('tk_msg_perfil_v1')||'null');return c&&c.conta===contaSessao_(getSessao())?c.perfil:null; } catch(_){return null;}
  }
  function guardarPerfil_() { try {localStorage.setItem('tk_msg_perfil_v1',JSON.stringify({conta:contaSessao_(getSessao()),perfil:cfgLeitura}));}catch(_){} }
  function atualizarIdentidade_() {
    const e=$('ms-identidade');if(!e)return;
    const u=typeof usuarioAdmin!=='undefined'&&usuarioAdmin;
    const p=cfgLeitura||perfilGuardado_();
    e.textContent=(p&&p.nomeCadastro)||(u&&(u.nome||u.name))||'';
    e.title=e.textContent;
  }
  async function carregarCfgLeitura_() {
    const conta=contaSessao_(getSessao()), versao=versaoPerfil_;
    if(!cfgLeitura)cfgLeitura=perfilGuardado_();
    atualizarIdentidade_();desenharAssina_();
    const r = await worker_('/msg/config', 'GET');
    if(conta!==contaSessao_(getSessao())||versao!==versaoPerfil_)return;
    if(r.ok){cfgLeitura=r;guardarPerfil_();}
    else if(!cfgLeitura)cfgLeitura={config:{assinatura:true,lerCelular:{}},meuNome:'',erroPerfil:r.erro};
    atualizarIdentidade_();
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
    const assinatura = [c.dono || '', (c.etiquetas || []).map((e) => e.id + e.nome + e.cor).join('|'), canal === 'todos' ? c.canal : '', c.nome, c.ultima_em, c.previa, c.nao_lidas, c.ult_dir, c.ult_status, espera ? Math.floor(Date.now() / 60000) : '', aberta && aberta.id === c.id, c.outro_id || '', c.encerrada_motivo || '', c.agenda_pendente || 0, c.agenda_proxima || '', selecao ? (marcada ? 'S' : 's') : ''].join('|');
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
    if (Number(c.agenda_pendente) > 0) {
      const quantidade = Number(c.agenda_pendente);
      const agenda = el('span', 'ms-agenda-indicador', '🕒' + (quantidade > 1 ? ' ' + quantidade : ''));
      const horario = c.agenda_proxima ? ' · Próxima: ' + hora(c.agenda_proxima) : '';
      agenda.title = quantidade + (quantidade === 1 ? ' agendamento ativo' : ' agendamentos ativos') + horario;
      agenda.setAttribute('aria-label', agenda.title);
      l3.appendChild(agenda);
    }
    (c.etiquetas || []).slice(0, 2).forEach((e) => l3.appendChild(tagEtq_(e)));
    const l2 = el('span', 'ms-l2'); const pv = el('span', 'ms-previa');
    if (saiu) { pv.appendChild(selo(c.ult_status || 'enviada')); pv.appendChild(document.createTextNode('Você: ')); }
    const pr = /^\[(.+)\]$/.exec(c.previa || ''); pv.appendChild(document.createTextNode(pr ? (TIPO_ROTULO[pr[1]] || c.previa) : semFormatacao_(c.previa))); l2.appendChild(pv);
    if (nova) { const bd = el('span', 'ms-badge', c.nao_lidas > 99 ? '99+' : String(c.nao_lidas)); bd.setAttribute('aria-label', c.nao_lidas + ' não lidas'); l2.appendChild(bd); }
    corpo.append(l1, l2); if (l3.firstChild) corpo.appendChild(l3);
    if (espera) { const desde = c.ult_entrada_em || c.ultima_em, atrasou = Date.now() - Date.parse(desde) > META_RESPOSTA_MS; corpo.appendChild(el('span', 'ms-aguarda' + (atrasou ? ' atrasada' : ''), (atrasou ? '⚠ ' : '') + 'Falta responder · há ' + espera_(desde))); }
    if (c.outro_id) corpo.appendChild(el('span', 'ms-ambos-tag', 'Também no ' + NOME_CANAL[outroCanal_(c)]));
    b.append(av, corpo);
    return li;
  }
  const outroCanal_ = (c) => (c.canal === 'whatsapp1' ? 'whatsapp2' : 'whatsapp1');
  /* ---- v7.22: nome do atendente antes da resposta ("*Pablo:*" no WhatsApp, em negrito; "Pablo:" no Instagram) ---- */
  function nomePadrao_() {
    let n = ''; try { n = typeof usuarioAdmin !== 'undefined' && usuarioAdmin ? String(usuarioAdmin.nome || usuarioAdmin.name || '') : ''; } catch (e) { n = ''; }
    n = n.trim().split(/\s+/)[0] || '';
    return n && n === n.toUpperCase() ? n.charAt(0) + n.slice(1).toLowerCase() : n;
  }
  const nomeAtendente_ = () => {const p=cfgLeitura||perfilGuardado_();return (p&&(p.meuNome||p.nomePadrao))||nomePadrao_();};
  const adminAssinatura_ = () => { try{return typeof usuarioAdmin!=='undefined'&&usuarioAdmin&&temPermissao(usuarioAdmin,'gerir_acessos');}catch(_){return false;} };
  const assinaturaLigada_ = () => !adminAssinatura_() || !(cfgLeitura && cfgLeitura.config && cfgLeitura.config.assinatura === false);
  function assinar_(c, texto) {
    const n = nomeAtendente_(); if (!texto || !n || !assinaturaLigada_()) return texto;
    return c.canal === 'instagram' ? n + ':\n' + texto : '*' + n + ':*\n' + texto;
  }
  const RE_ASSINATURA_ = /^\*([^*\n]{1,30}):\*\n/;
  /* v7.24: barra acima da caixa de mensagem = ferramentas de atendimento (Produtos, Respostas rápidas) + a assinatura */
  const ICO_ = {
    calendario: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v16H5zM5 9h14M8 3v4M16 3v4M8 13h3M8 17h6"/></svg>',
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
    w.append(botaoIco_('ms-ferr-btn', 'sacola', 'Produtos', 'gaveta-produtos'), botaoIco_('ms-ferr-btn', 'raio', 'Respostas', 'gaveta-respostas'), botaoIco_('ms-ferr-btn ms-nota-btn', 'nota', 'Nota', 'modo-nota'));
    if(podeFerramenta_('agenda'))w.appendChild(botaoIco_('ms-ferr-btn','calendario','Agendar','agenda-opcoes'));
    const b=botao('ms-ferr-btn ms-assina-btn','','nome-editar');b.title='Editar nome nas respostas';
    b.append(el('b','',lig?(n||'Meu nome'):'Sem assinatura'));b.insertAdjacentHTML('beforeend',ICO_.lapis);b.setAttribute('aria-label','Editar nome nas respostas'+(n?': '+n:''));w.appendChild(b);
  }
  function editarAssinatura_(){
    const corpo=gaveta_('Nome nas respostas');if(!corpo)return;
    corpo.style.padding='14px';
    const l=el('label','ms-etq-rot','Como quer ser chamado?');l.htmlFor='ms-meu-nome-rapido';
    const i=el('input','ms-copia');i.id='ms-meu-nome-rapido';i.type='text';i.maxLength=30;i.value=nomeAtendente_();i.autocomplete='given-name';i.style.minHeight='48px';i.style.font='inherit';
    corpo.append(l,i);
    if(adminAssinatura_()){
      const la=el('label','ms-cfg-linha'),ch=el('input');ch.type='checkbox';ch.id='ms-mostrar-nome';ch.checked=assinaturaLigada_();la.append(ch,el('span','','Mostrar meu nome nas respostas'));corpo.appendChild(la);
    }
    const pe=el('div','ms-auto-pe');pe.appendChild(botao('ms-btn prim','Salvar','nome-salvar'));$('ms-gaveta').appendChild(pe);
    i.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();salvarNome_(i.value);}});i.focus();
  }
  /* ---- v7.24: gaveta da conversa (Produtos do catálogo e Respostas rápidas): por cima da conversa, sem perder o que foi digitado ---- */
  const semAcento_ = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function produtosCatalogo_() { try { return typeof window.tkProdutosLista === 'function' ? disponibilidade_.projetar(window.tkProdutosLista() || []) : []; } catch (e) { return []; } }
  const ativo_ = (p) => !p.Status || String(p.Status).trim().toLowerCase() === 'ativo';
  const esgotado_ = (p) => p.Estoque !== '' && p.Estoque != null && Number(p.Estoque) <= 0;
  function precoTexto_(p) {
    if (!(Number(p.Preco) > 0)) return 'Consulte valor';
    const f = typeof precoTerminacao === 'function' ? precoTerminacao(p.Preco) : null, v = f && f.valido ? f.avista : Number(p.Preco);
    return (typeof formatarReal === 'function' ? formatarReal(v) : 'R$ ' + v.toFixed(2).replace('.', ',')) + ' à vista';
  }
  // Mesmo resumo usado no cartão da Gestão: nunca expor "Etiqueta:" ou "Idade:" brutos.
  function resumoTamanhosProduto_(p) {
    if (typeof TKTamanhos !== 'undefined' && TKTamanhos && typeof TKTamanhos.cliente === 'function') {
      const dados = TKTamanhos.cliente(String(p.Tamanhos || ''), p.Genero);
      const resumo = TKTamanhos.resumir(dados.valores, dados.tipo);
      return { titulo: dados.titulo, texto: resumo, valores: dados.valores };
    }
    // Compatibilidade com carregamento antigo sem o módulo de tamanhos.
    const raw = String(p.Tamanhos || '');
    const idades = [...raw.matchAll(/(?:^|,)\s*Idade:\s*([^,]+)/gi)].map(m=>m[1].trim());
    const numeros = [...raw.matchAll(/(?:^|,)\s*Veste:\s*([^,]+)/gi)].map(m=>m[1].trim());
    const dados = idades.length ? { titulo: 'Idades', valores: idades, tipo: 'idade' } : numeros.length ? { titulo: 'Numerações', valores: numeros, tipo: 'numero' } : null;
    if (dados) {
      const nums = [...new Set(dados.valores.map(v => parseInt(v, 10)))].filter(Number.isFinite).sort((a,b)=>a-b);
      const passo = dados.tipo === 'idade' ? 1 : 2;
      dados.texto = nums.length === dados.valores.length && nums.every((v,i)=>!i||v-nums[i-1]===passo) && nums.length>1 ? nums[0]+(dados.tipo==='idade'?' a ':' ao ')+nums.at(-1)+(dados.tipo==='idade'?' anos':'') : nums.join('/')+(dados.tipo==='idade'?' anos':'');
      return dados;
    }
    const antigos = raw.split(',').map(x => x.trim()).filter(x => x && !/^(Etiqueta|Idade|Veste):/i.test(x) && !/^Consultar tamanhos disponíveis$/i.test(x));
    return { titulo: 'Tamanhos', texto: antigos.join('/'), valores: antigos };
  }
  const tamanhosDe_ = (p) => resumoTamanhosProduto_(p).valores;
  function linkDe_(p) { try { return typeof linkProduto === 'function' ? linkProduto(p) : ''; } catch (e) { return ''; } }
  function textoProduto_(p) {
    const tam = resumoTamanhosProduto_(p), wa = !aberta || aberta.canal !== 'instagram';
    return [(wa ? '*' + p.Nome + '*' : p.Nome), precoTexto_(p), tam.texto ? tam.titulo + ': ' + tam.texto : '', p.Cores ? 'Cores: ' + p.Cores : '', linkDe_(p)].filter(Boolean).join('\n');
  }
  function colocarNaMensagem_(txt) {
    const ta = $('ms-texto'); if (!ta) return;
    ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n\n' : '') + txt;
    ta.dispatchEvent(new Event('input', { bubbles: true })); fecharGaveta_(); ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { /* campo sem seleção */ }
  }
  /* o "voltar" do celular fecha a gaveta; cada gaveta tem um número para o "voltar" atrasado de uma gaveta anterior não fechar a nova */
  let genGaveta = 0;
  const removerAte_ = (n) => () => { const e = $('ms-gaveta'); if (e && Number(e.dataset.gen) <= n) { if(e.dataset.tipo==='ficha'&&!sairFicha_())return;fichaOrig_=null;e.remove(); } };
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
  let atualizarPickerAoEditar_ = null;
  async function abrirProdutos_() {
    const corpo = gaveta_('Produtos'); if (!corpo) return;
    if(APP_RECENTES&&!produtosCatalogo_().length&&typeof carregarProdutos==='function'){
      corpo.textContent='Carregando produtos…';await carregarProdutos();
      if(!corpo.isConnected)return;corpo.textContent='';
    }
    const idConv = aberta ? aberta.id : null; if (idConv !== prodSelConv) { prodSel = []; prodSelConv = idConv; }
    if (atualizarPickerAoEditar_) window.removeEventListener('storage', atualizarPickerAoEditar_);
    const q = el('input', 'ms-busca ms-busca-prod'); q.id = 'ms-prod-busca'; q.type = 'search'; q.placeholder = 'Nome, código, cor, tecido ou tamanho'; q.setAttribute('aria-label', 'Buscar produto');
    const so = el('label', 'ms-cfg-linha ms-prod-filtro'), chk = el('input'); chk.type = 'checkbox'; chk.id = 'ms-prod-estoque'; chk.checked = true; so.append(chk, document.createTextNode(' Só com estoque'));
    const ul = el('ul', 'ms-prod-lista'); ul.id = 'ms-prod-lista'; ul.setAttribute('aria-live', 'polite');
    const dica = el('p', 'ms-prod-dica', 'Toque na foto para selecionar várias peças e mandar um link só.');
    const filtrosProd = el('details', 'ms-prod-filtros'); filtrosProd.id='ms-prod-filtros';
    const tituloFiltros=el('summary','','Filtros · tamanho, categoria, cor e tecido');
    const opcoesFiltros=el('div','ms-prod-opcoes');opcoesFiltros.id='ms-prod-opcoes';
    filtrosProd.append(tituloFiltros,opcoesFiltros);
    const resumoFiltros=el('div','ms-prod-refinos');resumoFiltros.id='ms-prod-refinos';
    const resultado=el('p','ms-prod-dica');resultado.id='ms-prod-resultado';resultado.setAttribute('role','status');
    corpo.append(q, so, filtrosProd, resumoFiltros, resultado, dica, ul);
    const tamanhosCliente=p=>window.TKTamanhos ? TKTamanhos.cliente(String(p.Tamanhos||''),p.Genero).valores.filter(v=>!/consult/i.test(v)) : tamanhosDe_(p);
    const campos=[{id:'tamanho',nome:'Tamanho',tags:tamanhosCliente},{id:'categoria',nome:'Categoria',tags:p=>String(p.Categoria||'').split(',').map(v=>v.trim()).filter(Boolean)},{id:'cor',nome:'Cor',tags:p=>String(p.Cores||'').split(',').map(v=>v.trim()).filter(Boolean)},{id:'genero',nome:'Para quem',tags:p=>String(p.Genero||'').split(',').map(v=>v.trim()).filter(Boolean)},{id:'tecido',nome:'Tecido',tags:p=>{const t=window.TKTecido&&TKTecido.ler(p);return t?[t]:[]}}];
    const refinados=Object.fromEntries(campos.map(c=>[c.id,new Set()]));
    const combina=(p,ignorar)=>campos.every(c=>c.id===ignorar||!refinados[c.id].size||c.tags(p).some(v=>refinados[c.id].has(v)));
    function pintarFiltros(base){
      opcoesFiltros.textContent='';resumoFiltros.textContent='';
      campos.forEach(c=>{
        const valores=new Set(produtosCatalogo_().filter(ativo_).flatMap(c.tags));
        const sec=el('section','ms-prod-grupo-filtro'),cab=el('h4','',c.nome),chips=el('div','ms-prod-chips');chips.setAttribute('role','group');chips.setAttribute('aria-label','Filtrar por '+c.nome.toLowerCase());sec.append(cab,chips);
        Array.from(valores).sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})).forEach(v=>{
          const n=base.filter(p=>combina(p,c.id)&&c.tags(p).includes(v)).length,ativo=refinados[c.id].has(v);
          if(!n&&!ativo)return;
          const bt=botao('ms-btn',v+' · '+n,'');bt.dataset.prodFiltro=c.id;bt.dataset.valor=v;bt.setAttribute('aria-pressed',String(ativo));
          bt.addEventListener('click',()=>{if(ativo)refinados[c.id].delete(v);else refinados[c.id].add(v);pintar();});chips.appendChild(bt);
          if(ativo){const tirar=botao('ms-btn',c.nome+': '+v+' ×','');tirar.setAttribute('aria-label','Retirar filtro '+c.nome+' '+v);tirar.addEventListener('click',()=>{refinados[c.id].delete(v);pintar();});resumoFiltros.appendChild(tirar);}
        });
        if(chips.childElementCount)opcoesFiltros.appendChild(sec);
      });
      if(!opcoesFiltros.childElementCount)opcoesFiltros.appendChild(el('p','','Nenhuma opção para esta busca. Apague parte do texto ou limpe os filtros.'));
      if(campos.some(c=>refinados[c.id].size)){const limpar=botao('ms-btn','Limpar filtros','');limpar.addEventListener('click',()=>{campos.forEach(c=>refinados[c.id].clear());pintar();});resumoFiltros.appendChild(limpar);}
    }
    const bar = el('div', 'ms-prod-selbar'); bar.id = 'ms-prod-selbar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Peças selecionadas'); bar.hidden = true;
    const conta = el('span', 'ms-prod-conta'); conta.id = 'ms-prod-conta'; conta.setAttribute('aria-live', 'polite');
    const env = el('div', 'ms-prod-env');
    env.append(botao('ms-btn', 'Copiar link', 'prodsel-link'), botao('ms-btn prim', 'Enviar seleção', 'prodsel-usar'));
    bar.append(conta, botao('ms-btn', 'Limpar', 'prodsel-limpar'), env);
    corpo.parentNode.appendChild(bar);
    const pendentes = disponibilidade_.aviso(); corpo.prepend(pendentes);
    const pintar = () => {
      disponibilidade_.atualizarAviso(pendentes);
      desenharSelProd_();
      const termos = semAcento_(q.value).split(/\s+/).filter(Boolean);
      let ps = produtosCatalogo_().filter(ativo_);
      if (chk.checked) ps = ps.filter((p) => !esgotado_(p));
      if (termos.length) ps = ps.filter((p) => { const t = semAcento_([p.Nome, p.Codigo, p.Categoria, p.Cores, p.Tamanhos, p.Genero,window.TKTecido&&TKTecido.ler(p)].join(' ')); return termos.every((x) => t.indexOf(x) >= 0); });
      pintarFiltros(ps);ps=ps.filter(p=>combina(p));
      resultado.textContent=ps.length+' '+(ps.length===1?'peça encontrada':'peças encontradas');
      ul.textContent = '';
      if (!produtosCatalogo_().length) { ul.appendChild(el('li', 'ms-vazio', 'O catálogo ainda está carregando. Tente de novo em alguns segundos.')); return; }
      if (!ps.length) { ul.appendChild(el('li', 'ms-vazio', termos.length ? 'Nenhum produto com “' + q.value.trim() + '”.' + (chk.checked ? ' Desmarque “Só com estoque” para ver os esgotados.' : '') : 'Nenhuma peça com os filtros escolhidos. Use Limpar filtros ou desmarque Só com estoque.')); return; }
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
        const tecido=window.TKTecido&&TKTecido.ler(p);if(tecido)info.appendChild(el('span','ms-prod-det','Tecido: '+tecido));
        const tam = resumoTamanhosProduto_(p);
        info.appendChild(el('span', 'ms-prod-det', (tam.texto ? tam.titulo + ': ' + tam.texto : 'Tamanho não informado') + (esgotado_(p) ? ' · Esgotado' : p.Estoque !== '' && p.Estoque != null ? ' · ' + p.Estoque + ' em estoque' : '')));

        const acoes = el('div', 'ms-prod-acoes');
        acoes.appendChild(botao('ms-btn prim', 'Colocar na mensagem', 'prod-usar', { id: String(p.ID) }));
        if (linkDe_(p)) acoes.appendChild(botao('ms-btn', 'Copiar link', 'prod-link', { id: String(p.ID) }));
        const editar = botao('ms-prod-editar', '✎ Disponibilidade', 'prod-editar', { id: String(p.ID) });
        editar.setAttribute('aria-label', 'Editar disponibilidade de ' + (p.Nome || 'produto'));
        if(disponibilidade_.pode()) info.appendChild(editar);
        info.appendChild(acoes);
        li.append(marca, info); ul.appendChild(li);
      });
      if (ps.length > 40) ul.appendChild(el('li', 'ms-vazio', 'Mostrando 40 de ' + ps.length + '. Escreva mais para achar mais rápido.'));
    };
    atualizarPickerAoEditar_ = (ev) => {
      if (ev.key !== 'tk_produto_atendimento_atualizado' || !ul.isConnected) return;
      if (typeof carregarProdutos === 'function') {
        Promise.resolve(carregarProdutos()).then(() => {
          if (ul.isConnected) pintar(); // mantém busca, filtros e seleção da conversa
        }).catch(() => aviso_('Não consegui atualizar os produtos. Feche e abra Produtos novamente.'));
      }
    };
    window.addEventListener('storage', atualizarPickerAoEditar_);
    q.addEventListener('tk:disponibilidade', pintar);
    q.addEventListener('input', ()=>{if(q.value.trim().length>=2)filtrosProd.open=true;pintar();}); chk.addEventListener('change', pintar); pintar(); desenharSelProd_();
    setTimeout(() => q.focus(), 0);
  }
  const disponibilidade_ = window.TKDisponibilidade.criar({
    conta: () => contaSessao_(typeof getSessao === 'function' && getSessao()),
    pode: () => { try { return !!usuarioAdmin && temPermissao(usuarioAdmin, 'catalogo_cadastrar'); } catch (_) { return false; } },
    enviar: dados => chamarAdmin_(dados),
    atualizar: () => {
      const q=document.getElementById('ms-prod-busca');if(!q)return;
      const foco=document.activeElement, id=foco?.dataset?.ms==='prod-editar'?foco.dataset.id:null;
      q.dispatchEvent(new Event('tk:disponibilidade'));
      if(id)(document.querySelector('#ms-prod-lista [data-ms=prod-editar][data-id="'+CSS.escape(id)+'"]')||q).focus({preventScroll:true});
    },
    avisar: texto => aviso_(texto),
  });
  function abrirEdicaoRapidaProduto_(p) { disponibilidade_.abrir(p); }
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
  const produtosSelecionados_ = () => prodSel.map(produtoPorId_).filter(p=>p&&ativo_(p));
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
    const anterior=document.activeElement,corpo = gaveta_('Respostas automáticas'); if (!corpo) return;
    const painel=propostaGaveta_('automacoes',anterior);
    const g = $('ms-gaveta'), gen = g.dataset.gen; corpo.appendChild(el('p', 'ms-vazio', 'Carregando…'));
    const r = await worker_('/msg/auto', 'GET');
    const g2 = $('ms-gaveta'); if (!g2 || g2.dataset.gen !== gen) return;      // a pessoa fechou ou abriu outra gaveta enquanto carregava
    if (!r.ok) { corpo.textContent = ''; corpo.appendChild(el('p', 'ms-vazio', r.erro || 'Não foi possível carregar agora. Feche e abra de novo.')); return; }
    autoEdit_ = JSON.parse(JSON.stringify(r.auto)); autoUlt_ = r; desenharAuto_();
    const pe = el('div', 'ms-auto-pe'),status=el('span','ms-auto-status');status.id='ms-auto-status';status.setAttribute('role','status');pe.append(status,botao('ms-btn prim', 'Salvar', 'auto-salvar')); painel.appendChild(pe);
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
    if(autoEdit_.expediente)h.appendChild(editorExpediente_());
    else h.appendChild(el('p', 'ms-auto-exp', 'Segunda a sexta, 7h30 às 18h · Sábado, 7h30 às 14h · Domingo fechado'));
    h.appendChild(el('p', 'ms-etq-rot', 'Feriados com comércio aberto (8h às 13h)'));
    const ul = el('ul', 'ms-auto-feriados');
    if (!autoEdit_.feriados.length) ul.appendChild(el('li', '', 'Nenhum feriado cadastrado.'));
    autoEdit_.feriados.forEach((d) => { const li = el('li'), x = botao('ms-link-btn', 'Remover', 'auto-feriado-tirar', { d: d }); x.setAttribute('aria-label', 'Remover o feriado de ' + dataCurta_(d)); li.append(el('span', '', dataCurta_(d)), x); ul.appendChild(li); });
    h.appendChild(ul);
    const ln = el('div', 'ms-linha'), di = el('input', 'ms-copia'); di.type = 'date'; di.id = 'ms-auto-data'; di.setAttribute('aria-label', 'Data do feriado');
    ln.append(di, botao('ms-btn', 'Incluir feriado', 'auto-feriado-add')); h.appendChild(ln); w.appendChild(h);
    if(autoEdit_.acompanhamento){
      const s=el('section','ms-auto-sec'),titulo=el('h4','','Acompanhamento');s.appendChild(titulo);
      const lb=el('label','ms-agenda-rot','Mensagem após 2 horas úteis');lb.htmlFor='ms-acomp-texto-config';
      const ta=el('textarea','ms-copia');ta.id='ms-acomp-texto-config';ta.rows=4;ta.maxLength=900;ta.value=autoEdit_.acompanhamento.textoLembrete;ta.addEventListener('input',()=>autoEdit_.acompanhamento.textoLembrete=ta.value);
      s.append(lb,ta,el('p','ms-auto-exp','{saudacao} vira Bom dia, Boa tarde ou Boa noite na hora do envio.'));
      const l=el('label','ms-cfg-linha'),ch=el('input');ch.type='checkbox';ch.id='ms-acomp-final-config';ch.checked=autoEdit_.acompanhamento.mensagemFinal;l.append(ch,el('span','','Enviar mensagem ao encerrar automaticamente'));s.appendChild(l);
      const final=el('textarea','ms-copia');final.rows=3;final.maxLength=900;final.value=autoEdit_.acompanhamento.textoFinal;final.setAttribute('aria-label','Mensagem ao encerrar o acompanhamento');final.hidden=!ch.checked;final.addEventListener('input',()=>autoEdit_.acompanhamento.textoFinal=final.value);
      ch.addEventListener('change',()=>{autoEdit_.acompanhamento.mensagemFinal=ch.checked;final.hidden=!ch.checked;});s.appendChild(final);
      s.appendChild(el('p','ms-auto-exp','Acompanhar é ativado em cada conversa. Qualquer resposta do cliente cancela os próximos passos.'));w.appendChild(s);
    }
    w.appendChild(el('p', 'ms-auto-exp', 'Nunca vai para grupos, respostas a status sem texto nem mensagens da própria loja. A mensagem automática aparece na conversa com o selo “Automática” e a conversa continua em “Falta responder”.'));
    const u = autoUlt_ && autoUlt_.ultimo;
    if (u && u.em) { const d = new Date(u.em); w.appendChild(el('p', 'ms-auto-exp' + (u.ok ? '' : ' ms-pausa'), 'Último envio automático: ' + (isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + (u.ok ? ' · enviado' : ' · não confirmado: ' + (u.erro || 'sem resposta')))); }
    corpo.appendChild(w); corpo.scrollTop = rolagem;
  }
  function editorExpediente_(){
    const cfg=autoEdit_.expediente,w=el('div','ms-expediente'),semana=el('details');semana.appendChild(el('summary','','Horário semanal'));
    const hora=n=>String(Math.floor((n===1440?0:n)/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
    const minutos=v=>{const m=/^(\d{2}):([0-5]\d)$/.exec(v);return m?Number(m[1])*60+Number(m[2]):NaN;};
    const nomes=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    const campo=(valor,rotulo,mudar)=>{const lb=el('label','ms-exp-hora'),i=el('input','ms-copia');i.type='time';i.step='60';i.value=hora(valor);i.setAttribute('aria-label',rotulo);i.addEventListener('input',()=>mudar(minutos(i.value)));lb.append(el('span','',rotulo.split(' · ')[0]),i);return lb;};
    nomes.forEach((nome,dia)=>{
      const grupo=el('fieldset','ms-exp-dia');grupo.appendChild(el('legend','',nome));
      const op=el('label','ms-cfg-linha'),ch=el('input');ch.type='checkbox';ch.id='ms-exp-dia-'+dia;ch.checked=cfg.semana[dia].length>0;op.append(ch,el('span','','Aberto'));grupo.appendChild(op);
      const pares=el('div');grupo.appendChild(pares);
      const pintar=()=>{
        pares.textContent='';cfg.semana[dia].forEach((par,k)=>{
          const linha=el('div','ms-exp-par');linha.append(campo(par[0],'Abre · '+nome+' '+(k+1),v=>par[0]=v),campo(par[1],'Fecha · '+nome+' '+(k+1),v=>par[1]=v===0?1440:v));
          const tirar=el('button','ms-btn','×');tirar.type='button';tirar.setAttribute('aria-label','Remover intervalo '+(k+1)+' de '+nome);tirar.addEventListener('click',()=>{cfg.semana[dia].splice(k,1);ch.checked=cfg.semana[dia].length>0;pintar();ch.focus();});linha.appendChild(tirar);pares.appendChild(linha);
        });
        if(ch.checked&&cfg.semana[dia].length<3){const add=el('button','ms-btn','Adicionar intervalo');add.type='button';add.addEventListener('click',()=>{const fim=cfg.semana[dia].at(-1)?.[1]||450;cfg.semana[dia].push([Math.min(fim+60,1320),Math.min(fim+120,1440)]);pintar();pares.querySelectorAll('input').item(pares.querySelectorAll('input').length-2)?.focus();});pares.appendChild(add);}
      };
      ch.addEventListener('change',()=>{cfg.semana[dia]=ch.checked?[[450,dia===6?840:1080]]:[];pintar();});pintar();semana.appendChild(grupo);
    });
    const excecoes=el('details');excecoes.appendChild(el('summary','','Exceções por data'));excecoes.appendChild(el('p','ms-auto-exp','A exceção tem prioridade sobre a semana e os feriados.'));
    const lista=el('div'),pintarLista=()=>{
      lista.textContent='';Object.entries(cfg.excecoes).sort(([a],[b])=>a.localeCompare(b)).forEach(([data,faixas])=>{
        const li=el('div','ms-exp-excecao'),x=el('button','ms-btn','Remover');x.type='button';x.setAttribute('aria-label','Remover exceção de '+dataCurta_(data));x.addEventListener('click',()=>{delete cfg.excecoes[data];pintarLista();});li.append(el('span','',dataCurta_(data)+' · '+(faixas.length?faixas.map(p=>hora(p[0])+'–'+hora(p[1])).join(', '):'Fechado')),x);lista.appendChild(li);
      });
    };excecoes.appendChild(lista);pintarLista();
    const d=el('input','ms-copia');d.type='date';d.id='ms-exp-data';d.setAttribute('aria-label','Data da exceção');
    const fechado=el('input'),lf=el('label','ms-cfg-linha');fechado.type='checkbox';fechado.checked=true;lf.append(fechado,el('span','','Fechado nessa data'));
    let abre=450,fecha=1080;const par=el('div','ms-exp-par');par.append(campo(abre,'Abertura da exceção',v=>abre=v),campo(fecha,'Fechamento da exceção',v=>fecha=v===0?1440:v));par.hidden=true;fechado.addEventListener('change',()=>par.hidden=fechado.checked);
    const bt=el('button','ms-btn','Adicionar exceção'),feedback=el('p','ms-auto-exp');bt.type='button';feedback.setAttribute('role','status');
    bt.addEventListener('click',()=>{if(!d.value||!d.checkValidity()){feedback.textContent='Escolha a data da exceção.';d.focus();return;}if(!fechado.checked&&(!Number.isFinite(abre)||!Number.isFinite(fecha)||abre>=fecha)){feedback.textContent='Confira a abertura e o fechamento.';return;}cfg.excecoes[d.value]=fechado.checked?[]:[[abre,fecha]];pintarLista();d.value='';feedback.textContent='Exceção adicionada. Use Salvar para confirmar.';});
    excecoes.append(d,lf,par,bt,feedback);w.append(semana,excecoes);return w;
  }
  async function salvarAuto_(b) {
    if (!autoEdit_) return;
    const enviado=JSON.parse(JSON.stringify(autoEdit_)),epoca=epocaConta_,gen=$('ms-gaveta')?.dataset.gen,status=$('ms-auto-status');
    b.disabled = true;if(status)status.textContent='Salvando…'; const r = await worker_('/msg/auto', 'POST', enviado); b.disabled = false;
    if(epoca!==epocaConta_||$('ms-gaveta')?.dataset.gen!==gen)return;
    if (!r.ok) { if(status)status.textContent=r.erro||'Não foi possível salvar. Tente novamente.';b.focus();return; }
    autoUlt_=r;
    if(JSON.stringify(autoEdit_)!==JSON.stringify(enviado)){if(status)status.textContent='Salvo. Há novas alterações na tela para salvar.';return;}
    autoEdit_ = JSON.parse(JSON.stringify(r.auto)); desenharAuto_();if(status)status.textContent='Configurações salvas.';b.focus();
    if(status)status.textContent='Salvo.';
  }
  async function salvarNome_(v) {
    const conta=contaSessao_(getSessao());versaoPerfil_++;
    const b=$('ms-gaveta')?.querySelector('[data-ms=nome-salvar]');if(b){if(b.disabled)return;b.disabled=true;}
    const r = await worker_('/msg/config', 'POST', Object.assign({ meuNome: String(v || '') },$('ms-mostrar-nome')?{assinatura:$('ms-mostrar-nome').checked}:{}));
    if(b)b.disabled=false;if(conta!==contaSessao_(getSessao()))return;
    if (!r.ok) { aviso_(r.erro || 'Não foi possível salvar agora.'); return; }
    cfgLeitura = Object.assign({},cfgLeitura||{},r);guardarPerfil_();atualizarIdentidade_();
    if($('ms-meu-nome-rapido'))fecharGaveta_();
    aviso_(assinaturaLigada_()?'Nome salvo: as próximas respostas saem como “'+nomeAtendente_()+'”.':'Preferência salva: suas respostas saem sem assinatura.');
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
  async function nomesGoogle_(){if(!podeFerramenta_('configuracoes'))return;if(indexandoNomes)return;indexandoNomes=true;try{for(let i=0;i<40;i++){const r=await worker_('/msg/pessoas/google','POST',{});if(!r.ok||r.fim)break;}await carregarLista(true);}finally{indexandoNomes=false;}}
  function pintarLista() {
    const ul = $('ms-lista'), extra = $('ms-extra'); if (!ul || painel === 'metricas' || painel === 'funil') return;
    ul.hidden = false; extra.hidden = false;
    const resultados=$('ms-resultados');if(resultados){const n=new Set(lista.map(c=>c.pessoa||'c:'+c.id)).size;resultados.textContent=n+(n===1?' atendimento':' atendimentos')+(filtro==='encerradas'?' encerrados':' em aberto')+' · mais recentes';}const intro=$('ms-intro');if(intro){const b=intro.querySelector('button');b.textContent=selecao?'Cancelar':'Selecionar';b.dataset.ms=selecao?'sel-sair':'selecionar';}
    const vivos = new Set(lista.map((c) => c.id));
    if (selecao) { selecao.forEach((id) => { if (!vivos.has(id)) selecao.delete(id); }); desenharSelbar_(); }
    elConvs.forEach((li, id) => { if (!vivos.has(id)) { li.remove(); elConvs.delete(id); } });
    let ref = ul.firstChild;
    const blocos = new Map();
    lista.forEach(c=>{const key=c.grupo?'grupo:'+c.id:c.pessoa||(c.outro_id?'par:'+Math.min(c.id,c.outro_id):'conversa:'+c.id);   /* v7.40.16: mesmo número nos dois WhatsApp fica junto, mesmo sem vínculo manual */if(!blocos.has(key))blocos.set(key,[]);blocos.get(key).push(c);});
    [...blocos.values()].map(b=>b.sort((a,c)=>String(c.ultima_em).localeCompare(String(a.ultima_em))||c.id-a.id)).sort((a,b)=>String(b[0].ultima_em).localeCompare(String(a[0].ultima_em))||b[0].id-a[0].id).forEach(b=>b.forEach((c,i)=>{const li=linhaConversa(c);li.classList.toggle('ms-vinculada',i>0);li.classList.toggle('ms-vinculo-principal',b.length>1&&i===0);li.classList.toggle('ms-vinculo-fim',b.length>1&&i===b.length-1);li.style.marginLeft='';li.style.background='';if(li!==ref)ul.insertBefore(li,ref);else ref=ref.nextSibling;}));
    extra.textContent = '';
    if (!lista.length) {
      const m = busca.trim() ? 'Nenhuma conversa encontrada.' : etqFiltro ? 'Nenhuma conversa nesta etapa de venda neste canal.' : filtro === 'nao_lidas' ? 'Nenhuma conversa não lida. 🎉' : filtro === 'sem_resposta' ? 'Ninguém esperando resposta agora. 🎉' : tipoParam_() === 'grupo' && !filtro ? 'Nenhum grupo aqui.' : filtro === 'ambos' ? 'Ninguém está falando pelos dois WhatsApp agora.' : filtro === 'encerradas' ? 'Nenhuma conversa encerrada. Para encerrar, segure o dedo numa conversa (ou ⋯ → Selecionar conversas).' : 'Ainda não chegou nenhuma mensagem neste canal.';
      extra.appendChild(el('p', 'ms-vazio', m));
    }
  }
  async function carregarLista(reset) {
    if(!nomesConferidos){nomesConferidos=true;setTimeout(nomesGoogle_,1500);}
    const mine = ++seqLista, c0 = canal, f0 = filtro, b0 = busca.trim(), t0 = tipoParam_();
    const filaConsulta=tipos.grp||['encerradas','retomar','minhas','com_notas'].includes(filtro)?'':filaAtendimento_;
    const path='/msg/conversas?blocos=1&fila='+filaConsulta+'&escopo='+escopoAtendimento_+'&canal=' + encodeURIComponent(canal) + '&filtro=' + encodeURIComponent(filtro) + (t0 ? '&tipo=' + t0 : '') + (b0 ? '&busca=' + encodeURIComponent(b0) : '') + (etqFiltro ? '&etiqueta=' + etqFiltro : '');
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
  function botaoBaixarArquivo_(m) {
    if (!podeFerramenta_('arquivos') || typeof m.id !== 'number') return null;
    const bt = botao('ms-play', 'Baixar arquivo', '');
    bt.addEventListener('click', async()=>{
      const nome = String(m.texto || '').split('\n').find(x=>/\.[a-z0-9]{1,12}$/i.test(x.trim())) || ('arquivo-' + m.id);
      if(window.TKAndroid && typeof TKAndroid.baixarArquivo === 'function'){TKAndroid.baixarArquivo(m.id,nome);return;}
      bt.disabled=true;
      try {
        const s = getSessao(), r=await fetch(INSTAGRAM_URL+'/msg/midia?id='+m.id+'&baixar=1',{headers:{'X-TK-Whats':s.whatsapp,'X-TK-Sessao':s.sessao},cache:'no-store'});
        if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.erro||'Arquivo indisponível. A mídia pode ter expirado.');}
        const blob=await r.blob(), u=URL.createObjectURL(blob),a=el('a');a.href=u;
        const cd=r.headers.get('Content-Disposition')||'';const utf=/filename\*=UTF-8''([^;]+)/i.exec(cd);a.download=utf?decodeURIComponent(utf[1]):nome;
        document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);
      }catch(e){aviso_(e.message||'Não foi possível baixar o arquivo.');}finally{bt.disabled=false;}
    }); return bt;
  }
  function blocoMidia_(m) {
    const tipo = m.tipo, local = m.localUrl || '';
    if (!local && !(m.midia && typeof m.id === 'number')) return null;
    const w = el('div', 'ms-midia');
    if (tipo === 'imagem' || tipo === 'figurinha') {
      const img = el('img', 'ms-img'); img.alt = tipo === 'figurinha' ? 'Figurinha' : 'Foto'; img.loading = 'lazy';
      if (local) img.src = local; else carregarImg_(img, m.id, false);
      img.addEventListener('click', () => { if (img.src && !img.dataset.erro) abrirLuz_('imagem', img.src); });
      w.appendChild(img); const baixar=botaoBaixarArquivo_(m);if(baixar)w.appendChild(baixar); return w;
    }
    if (tipo === 'vídeo' || tipo === 'áudio') {
      const video = tipo === 'vídeo';
      const montarPlayer = (u, auto) => { const p = el(video ? 'video' : 'audio'); p.controls = true; p.preload = 'metadata'; if (video) p.playsInline = true; p.src = u; w.textContent = ''; w.appendChild(p);const baixar=botaoBaixarArquivo_(m);if(baixar)w.appendChild(baixar); if (auto) { const r = p.play(); if (r && r.catch) r.catch(() => {}); } };
      if (local) { montarPlayer(local, false); return w; }
      const bt = botao('ms-play', '', 'x'); bt.removeAttribute('data-ms'); bt.textContent = (video ? '▶ Vídeo' : '▶ Áudio') + (m.midia_seg ? ' · ' + mmss(m.midia_seg) : '');
      bt.addEventListener('click', async () => { bt.disabled = true; bt.textContent = 'Carregando…'; try { montarPlayer(await midiaBlob_(m.id, false), true); } catch (e) { bt.disabled = false; bt.textContent = 'Não foi possível carregar. Tentar de novo'; } });
      w.appendChild(bt); return w;
    }
    const bt=botaoBaixarArquivo_(m); if(bt)w.appendChild(bt);else w.appendChild(el('span','','Arquivo recebido · acesso ao download restrito'));return w;
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
    const ass = [m.autor_nome || '', m.autor_fone || '', ehGrupo_() ? Object.keys(nomesDoGrupo_()).length : 0, m.texto, m.tipo, m.status, m.status_em, m.erro || '', m.midia, m.localUrl || '', m.ctx_tipo || '', m.ctx_midia, m.ctx_mtipo || '', m.ctx_em || '', m.ctx_qtipo || '', m.ctx_qdir || '', m.ctx_texto || '', m.ctx_legenda || '', m.link_previa || '', m.ctx_aprox, m.por || ''].join('|');
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
    const card=blocoLink_(m);if(card)b.appendChild(card);
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
  async function editarPessoa_(id, destino){
    if(!destino){abrirFicha_();return;}
    const r=await worker_('/msg/pessoa?conversa='+id,'GET');if(!r.ok){aviso_(r.erro||'Não foi possível abrir o contato.');return;}
    if(!destino.isConnected)return;
    const form=el('div','ms-ficha-sec');destino.appendChild(form);
    const field=(label,value)=>{const l=el('label','',label),input=el('input');input.value=value||'';input.setAttribute('aria-label',label);input.style.minHeight='48px';input.style.width='100%';l.appendChild(input);form.appendChild(l);return input;};
    const name=$('ms-fi-nome'),phone=field('WhatsApp principal',r.whatsapp),second=field('Segundo WhatsApp (opcional)',r.segundo);phone.type=second.type='tel';
    const without=el('input');without.type='checkbox';without.checked=false;const info=el('label','','Cliente do Instagram não informou WhatsApp');info.prepend(without);info.hidden=r.conversa.canal!=='instagram';form.appendChild(info);
    const linked=new Set((r.canais||[]).map(x=>x.id));form.appendChild(el('p','',(r.canais||[]).map(x=>NOME_CANAL[x.canal]+' · '+rotuloContato(x)).join('\n')));
    const search=field('Buscar outro canal para vincular',''),results=el('div');form.appendChild(results);
    const find=el('button','','Buscar contato');find.type='button';find.style.minHeight='48px';find.onclick=async()=>{const found=await worker_('/msg/conversas?canal=todos&busca='+encodeURIComponent(search.value),'GET');results.textContent='';(found.conversas||[]).filter(c=>!c.grupo).forEach(c=>{const label=el('label'),check=el('input');check.type='checkbox';check.checked=linked.has(c.id);check.disabled=check.checked;check.onchange=()=>{if(check.checked){linked.add(c.id);if(c.canal!=='instagram'&&!phone.value){phone.value=c.contato;without.checked=false;}}else linked.delete(c.id);};label.append(check,document.createTextNode(rotuloContato(c)+' · '+NOME_CANAL[c.canal]));label.style.display='block';label.style.minHeight='48px';results.appendChild(label);});};form.appendChild(find);
    const finish=()=>{destino.open=false;form.remove();delete destino.dataset.carregado;};
    const save=el('button','prim','Salvar nome e vínculos');save.type='button';save.style.minHeight='48px';save.onclick=async()=>{if(!confirm('Salvar este nome e reunir os canais escolhidos, preservando o histórico?'))return;save.disabled=true;const out=await worker_('/msg/pessoa','POST',{conversa:id,nome:name.value,whatsapp:phone.value,segundo:second.value,semWhatsApp:without.checked,vincular:[...linked]});save.disabled=false;if(!out.ok){aviso_(out.erro||'Não foi possível salvar.');return;}finish();await carregarLista(true);if(aberta&&aberta.id===id){aberta=out.conversa;abrirFicha_();}};
    const close=el('button','','Cancelar');close.type='button';close.style.minHeight='48px';close.onclick=finish;save.textContent='Salvar telefones e canais';form.append(save,close);
  }
  /* ---- v7.40.13: agendar mensagem (horário de Fortaleza, UTC-3 sem horário de verão) ---- */
  const FORT_MS_ = 3 * 3600000;
  const fortIso_ = (ms) => new Date(ms - FORT_MS_).toISOString();                     // "relógio de Fortaleza" em formato ISO
  const fortDia_ = (ms) => fortIso_(ms).slice(0, 10);
  const fortParaMs_ = (diaHora) => Date.parse(diaHora + ':00-03:00');                  // "AAAA-MM-DDTHH:MM" de Fortaleza → instante
  function quandoRotulo_(iso) {
    const t = Date.parse(iso); if (isNaN(t)) return '';
    const dia = fortDia_(t), hojeD = fortDia_(Date.now()), amanhaD = fortDia_(Date.now() + 86400000), h = fortIso_(t).slice(11, 16);
    if (dia === hojeD) return 'hoje ' + h;
    if (dia === amanhaD) return 'amanhã ' + h;
    return dia.slice(8, 10) + '/' + dia.slice(5, 7) + ' ' + h;
  }
  function atalhoMs_(k) {
    if (k === '1h') return Math.ceil((Date.now() + 3600000) / 60000) * 60000;
    const amanha = fortDia_(Date.now() + 86400000);
    return fortParaMs_(amanha + (k === 'am8' ? 'T08:00' : 'T14:00'));
  }
  function desenharFaixaAgenda_() {
    const velha = $('ms-agenda-faixa'); if (velha) velha.remove();
    clearTimeout(timerAgenda_); timerAgenda_ = null;
    const pai = $('ms-conversa'), wrap = pai && pai.querySelector('.ms-fio-wrap'); if (!wrap || !aberta) return;
    const pend = agendadas_.filter((x) => x.status === 'pendente' || x.status === 'enviando').sort((x, y) => Date.parse(x.quando) - Date.parse(y.quando));
    if (!pend.length) return;
    const f = el('div', 'ms-faixa ms-agenda-faixa'); f.id = 'ms-agenda-faixa'; f.setAttribute('role', 'status');
    const manuais=pend.filter(x=>!x.acompanhamento),acomp=pend.find(x=>x.acompanhamento);
    const t = acomp ? (manuais.length?manuais.length+' agendada'+(manuais.length>1?'s':'')+' · ':'')+(acomp.tipo==='encerrar'?'Encerrar: ':'Lembrete: ')+quandoRotulo_(acomp.quando) : pend.length===1?'1 mensagem agendada para '+quandoRotulo_(pend[0].quando):pend.length+' mensagens agendadas · a próxima sai '+quandoRotulo_(pend[0].quando);
    const sp = el('span', '', '🕓 ' + t); sp.title = t; f.appendChild(sp);
    const ver = botao('ms-btn', 'Ver', 'agenda-abrir'); ver.setAttribute('aria-label', 'Ver mensagens agendadas'); f.appendChild(ver);
    pai.insertBefore(f, wrap);
    const conv = aberta.id, falta = Date.parse(pend[0].quando) - Date.now() + 75000;    // passou a hora: confere de novo (o servidor envia a cada minuto)
    timerAgenda_ = setTimeout(() => recarregarAgenda_(conv), Math.min(Math.max(falta, 15000), 2147000000));
  }
  async function recarregarAgenda_(conv) {
    if(!podeFerramenta_('agenda'))return;
    if (!aberta || aberta.id !== conv) return;
    const r = await worker_('/msg/agendadas?conversa=' + encodeURIComponent(conv), 'GET');
    if (!aberta || aberta.id !== conv || !r.ok) return;
    agendadas_ = r.pendentes || []; desenharFaixaAgenda_();
    const g = $('ms-gaveta'); if (g && g.dataset.tipo === 'agenda') desenharListaAgenda_(r);
  }
  function pintarAcompanhamento_(){
    const ch=$('ms-acompanhar'),status=$('ms-acomp-status');if(!ch||!status)return;
    if(ch.dataset.salvando!=='1')ch.checked=acompanhamento_?.status==='ativo';
    const a=acompanhamento_;status.textContent=!a||a.status==='cancelada'?'Se o cliente responder, os próximos passos serão cancelados.':a.status==='ativo'?(a.etapa==='encerrar'?'Encerramento previsto: ':'Lembrete previsto: ')+quandoRotulo_(a.quando)+'.':a.status==='falhou'?'Não confirmado. Confira a conversa antes de ativar novamente.':'Acompanhamento concluído.';
  }
  async function abrirPainelAgenda_(){
    const anterior=$('ms-nav')?.querySelector('[data-ms=menu-geral]'),corpo=gaveta_('Agendamentos');if(!corpo)return;
    const painelAgenda=propostaGaveta_('agenda-painel',anterior),g=$('ms-gaveta'),epoca=epocaConta_,f=agendaPainelFiltros_;
    let versao=0,cursor='',itens=[],timer=0;
    const atual=()=>g.isConnected&&epoca===epocaConta_;
    const pesquisa=el('div','ms-ag-pesquisa'),bus=el('input','ms-copia');bus.type='search';bus.placeholder='Cliente, número ou mensagem';bus.setAttribute('aria-label','Pesquisar agendamentos');bus.value=f.busca;
    const atualizar=el('button','ms-btn','Atualizar');atualizar.type='button';pesquisa.append(bus,atualizar);corpo.appendChild(pesquisa);
    const filtros=el('details','ms-ag-filtros');filtros.appendChild(el('summary','','Filtros'));
    const grade=el('div','ms-ag-filtros-grade');
    const seletor=(chave,rotulo,opcoes)=>{const lb=el('label','ms-ag-filtro'),s=el('select','ms-copia');s.setAttribute('aria-label',rotulo);opcoes.forEach(([v,t])=>{const o=el('option','',t);o.value=v;s.appendChild(o);});s.value=f[chave];s.addEventListener('change',()=>{f[chave]=s.value;carregar(true);});lb.append(el('span','',rotulo),s);grade.appendChild(lb);};
    seletor('status','Situação',[['pendentes','Pendentes'],['enviada','Concluídos'],['falhou','Com falha'],['cancelada','Cancelados'],['todas','Todas']]);
    seletor('canal','Canal',[['todos','Todos os canais'],...CANAIS]);
    seletor('tipo','Tipo',[['todos','Todos os tipos'],['manual','Mensagem agendada'],['lembrete','Lembrete'],['encerrar','Encerramento']]);
    const minhas=el('label','ms-cfg-linha'),ch=el('input');ch.type='checkbox';ch.checked=f.minhas;ch.addEventListener('change',()=>{f.minhas=ch.checked;carregar(true);});minhas.append(ch,el('span','','Somente os que agendei'));grade.appendChild(minhas);
    for(const [chave,rotulo] of [['de','De'],['ate','Até']]){const lb=el('label','ms-ag-filtro'),i=el('input','ms-copia');i.type='date';i.value=f[chave];i.setAttribute('aria-label',rotulo+' — data do agendamento');i.addEventListener('change',()=>{f[chave]=i.value;carregar(true);});lb.append(el('span','',rotulo),i);grade.appendChild(lb);}
    filtros.appendChild(grade);corpo.appendChild(filtros);
    const status=el('p','ms-ag-painel-status');status.setAttribute('role','status');status.tabIndex=-1;
    const lista=el('ul','ms-ag-painel-lista');lista.id='ms-ag-painel-lista';corpo.append(status,lista);
    const pe=el('div','ms-auto-pe'),mais=el('button','ms-btn','Carregar mais');mais.type='button';pe.hidden=true;pe.appendChild(mais);painelAgenda.appendChild(pe);
    const pintar=()=>{
      lista.textContent='';for(const a of itens){
        const li=el('li'),conteudo=el('div','ms-ag-painel-item'),nome=botao('ms-ag-cliente',a.nome||foneBonito_(a.contato)||'Cliente','agenda-conversa',{id:String(a.conversa_id)});
        const tipo=a.tipo==='encerrar'?'Encerramento':a.tipo==='lembrete'?'Lembrete':'Mensagem';
        const situacao=a.status==='pendente'?quandoRotulo_(a.quando):a.status==='enviando'?'Enviando…':a.status==='falhou'?'Falhou':a.status==='cancelada'?'Cancelado':'Concluído';
        conteudo.append(nome,el('b','ms-ag-data',tipo+' · '+situacao));
        if(a.texto)conteudo.appendChild(el('p','',semFormatacao_(a.texto).slice(0,180)));
        if(a.tem_anexo)conteudo.appendChild(el('p','ms-ag-arquivo-nome','Anexo: '+(a.anexo_nome||'Foto, vídeo ou áudio')));
        conteudo.appendChild(el('small','',(NOME_CANAL[a.canal]||a.canal)+(a.autor?' · '+a.autor:'')));
        if(a.erro)conteudo.appendChild(el('small','ms-ag-painel-erro',a.erro));li.appendChild(conteudo);
        if(a.status==='pendente'){
          const cancelar=el('button','ms-btn','Cancelar');cancelar.type='button';cancelar.setAttribute('aria-label','Cancelar '+tipo.toLowerCase()+' de '+(a.nome||a.contato));
          cancelar.addEventListener('click',async()=>{cancelar.disabled=true;const r=await worker_('/msg/agendar/cancelar','POST',{id:a.id});if(!atual())return;await carregar(true);if(atual()){status.textContent=r.ok?'Agendamento cancelado.':r.erro||'Não consegui confirmar. Atualize para conferir.';status.focus({preventScroll:true});}});li.appendChild(cancelar);
        }
        lista.appendChild(li);
      }
      if(!itens.length)lista.appendChild(el('li','ms-vazio','Nenhum agendamento com esses filtros.'));
    };
    async function carregar(reset){
      clearTimeout(timer);
      const consulta=++versao,proximo=reset?'':cursor;if(reset){cursor='';itens=[];lista.textContent='';}
      status.textContent='Carregando…';lista.setAttribute('aria-busy','true');mais.disabled=true;
      const q=new URLSearchParams({status:f.status,canal:f.canal,tipo:f.tipo,busca:f.busca,minhas:f.minhas?'1':'0',de:f.de,ate:f.ate,cursor:proximo});
      const r=await worker_('/msg/agendadas?'+q,'GET');if(!atual()||consulta!==versao)return;
      lista.removeAttribute('aria-busy');mais.disabled=false;
      if(!r.ok){status.textContent=r.erro||'Não foi possível carregar. Use Atualizar para tentar novamente.';pe.hidden=true;return;}
      itens=reset?r.agendamentos||[]:itens.concat(r.agendamentos||[]);cursor=r.proximo||'';pe.hidden=!r.temMais;pintar();status.textContent=itens.length+(itens.length===1?' agendamento':' agendamentos')+(r.temMais?' · há mais resultados':'');
    }
    bus.addEventListener('input',()=>{f.busca=bus.value;clearTimeout(timer);timer=setTimeout(()=>{if(atual())carregar(true);},350);});
    atualizar.addEventListener('click',()=>{clearTimeout(timer);carregar(true);});mais.addEventListener('click',()=>carregar(false));await carregar(true);
  }
  async function abrirAgendarOpcoes_(){
    if(!aberta)return;const anterior=document.activeElement,id=aberta.id,corpo=gaveta_('Agendar');if(!corpo)return;
    propostaGaveta_('agendar-opcoes',anterior);
    const gen=$('ms-gaveta').dataset.gen;corpo.classList.add('ms-agendar-escolhas');
    const manual=botaoIco_('ms-agendar-item','calendario','Agendar mensagem','agenda-abrir');manual.title='Escolher data, hora, mensagem e anexos';corpo.appendChild(manual);
    if(!aberta.grupo){
      const w=el('section','ms-acomp-opcao'),lb=el('label','ms-acomp-linha'),ch=el('input');ch.type='checkbox';ch.id='ms-acompanhar';ch.disabled=true;
      lb.append(ch,el('b','','Acompanhar'));w.append(lb,el('p','','Lembrete após 2 horas úteis. Mais 2 horas sem resposta: encerrar o atendimento.'));
      const status=el('p','ms-acomp-status','Conferindo acompanhamento…');status.id='ms-acomp-status';status.setAttribute('role','status');w.appendChild(status);corpo.appendChild(w);
      const feedback=el('p','ms-acomp-feedback');feedback.id='ms-acomp-feedback';feedback.setAttribute('role','status');corpo.appendChild(feedback);
      ch.addEventListener('change',async()=>{
        const ligado=ch.checked,focado=document.activeElement===ch;ch.disabled=true;ch.dataset.salvando='1';feedback.textContent='Salvando…';
        const r=await worker_('/msg/acompanhamento','POST',{conversa:id,ligado,idLocal:idLocal_()});
        delete ch.dataset.salvando;if(!aberta||aberta.id!==id||$('ms-gaveta')?.dataset.gen!==gen)return;
        ch.disabled=false;if(focado)ch.focus();
        if(!r.ok){ch.checked=acompanhamento_?.status==='ativo';feedback.textContent=r.erro||'Não consegui confirmar. Feche e abra Agendar para conferir.';return;}
        acompanhamento_=r.acompanhamento;pintarAcompanhamento_();feedback.textContent=acompanhamento_?.status==='ativo'?'Acompanhamento ativado.':acompanhamento_?.erro||'Acompanhamento desativado.';await recarregarAgenda_(id);
      });
      const r=await worker_('/msg/acompanhamento?conversa='+id,'GET');if(!aberta||aberta.id!==id||$('ms-gaveta')?.dataset.gen!==gen)return;
      if(!r.ok){status.textContent=r.erro||'Não foi possível conferir. Feche e abra Agendar novamente.';return;}
      acompanhamento_=r.acompanhamento;ch.disabled=!!aberta.encerrada_em||!podeFerramenta_('responder');pintarAcompanhamento_();
      if(aberta.encerrada_em)status.textContent='Reabra o atendimento para acompanhar.';
    }
  }
  async function abrirAgenda_() {
    if (!aberta) return;
    const anterior=document.activeElement,conv = aberta, ta0 = $('ms-texto'), rascunho = ta0 ? ta0.value.trim() : '';
    const corpo = gaveta_('Agendar mensagem'); if (!corpo) return;
    const g = $('ms-gaveta'),painelAgenda=propostaGaveta_('agenda',anterior); const gen = g.dataset.gen,epoca=epocaConta_;
    agendaAnexo_=anexoPend?{blob:anexoPend.blob,tipo:anexoPend.tipo,nome:anexoPend.nome||'Anexo'}:null;agendaPedido_=null;
    agendaQuando_ = 0; agendaAtalho_ = '';
    const w = el('div', 'ms-agenda');
    const s1 = el('section', 'ms-agenda-sec'), lb = el('label', 'ms-agenda-rot', 'Mensagem'); lb.htmlFor = 'ms-ag-texto';
    const ta = el('textarea', 'ms-copia'); ta.id = 'ms-ag-texto'; ta.rows = 4; ta.maxLength = 1000; ta.value = rascunho.slice(0, 1000); ta.placeholder = 'Ex.: Oi! A peça que você pediu chegou. Posso separar?';
    s1.append(lb, ta);
    const anexo=el('div','ms-ag-anexo'),seletor=el('input');seletor.type='file';seletor.accept='image/*,video/*';seletor.hidden=true;seletor.id='ms-ag-arquivo';
    const seletorAudio=el('input');seletorAudio.type='file';seletorAudio.accept='audio/*';seletorAudio.hidden=true;seletorAudio.id='ms-ag-arquivo-audio';
    const anexarAudio=botao('ms-btn','Áudio','agenda-anexar-audio');anexarAudio.addEventListener('click',()=>seletorAudio.click());
    const anexar=botao('ms-btn','Foto ou vídeo','agenda-anexar');anexar.id='ms-ag-anexar';anexar.addEventListener('click',()=>seletor.click());
    const nomeAnexo=el('span','ms-ag-anexo-nome'),remover=botao('ms-btn','Remover anexo','agenda-remover-anexo');remover.id='ms-ag-remover-anexo';
    const pintar=()=>{nomeAnexo.textContent=agendaAnexo_?agendaAnexo_.nome+' · '+(agendaAnexo_.blob.size/1048576).toFixed(1).replace('.',',')+' MB':'';remover.hidden=!agendaAnexo_;};
    remover.addEventListener('click',()=>{agendaAnexo_=null;agendaPedido_=null;pintar();});
    [seletor,seletorAudio].forEach(input=>input.addEventListener('change',async()=>{
      const f=input.files?.[0];input.value='';if(!f)return;
      const tipo=/^image\//.test(f.type)?'imagem':/^video\//.test(f.type)?'vídeo':/^audio\//.test(f.type)?'áudio':'';
      const feedback=$('ms-ag-form-status');if(!tipo){feedback.textContent='Escolha foto, vídeo ou áudio.';return;}
      anexar.disabled=true;feedback.textContent='Preparando anexo…';
      const blob=tipo==='imagem'?await reduzirImagem_(f):f;
      if(!aberta||aberta.id!==conv.id||$('ms-gaveta')?.dataset.gen!==gen||epoca!==epocaConta_)return;
      anexar.disabled=false;
      if(!blob||blob.size>(tipo==='imagem'?8:16)*1048576){feedback.textContent='Arquivo muito grande ou em formato não aceito. Use foto até 8 MB ou vídeo/áudio até 16 MB.';return;}
      agendaAnexo_={blob,tipo,nome:f.name||'Anexo'};agendaPedido_=null;feedback.textContent='';pintar();
    }));
    anexo.append(anexar,anexarAudio,seletor,seletorAudio,nomeAnexo,remover);s1.appendChild(anexo);pintar();
    if (conv.grupo) s1.appendChild(el('p', 'ms-auto-exp', 'Vai para todo o grupo.'));
    const s2 = el('section', 'ms-agenda-sec'), lq = el('span', 'ms-agenda-rot', 'Quando enviar'); lq.id = 'ms-ag-rot-q';
    const at = el('div', 'ms-agenda-atalhos'); at.setAttribute('role', 'group'); at.setAttribute('aria-labelledby', 'ms-ag-rot-q');
    [['1h', 'Daqui a 1 hora'], ['am8', 'Amanhã 8h'], ['am14', 'Amanhã 14h']].forEach(([k, t]) => { const b = botao('ms-btn', t, 'agenda-atalho', { k: k }); b.setAttribute('aria-pressed', 'false'); at.appendChild(b); });
    const ld = el('label', 'ms-agenda-rot', 'Ou escolha dia e hora (horário de Fortaleza)'); ld.htmlFor = 'ms-ag-quando';
    const dq = el('input', 'ms-copia'); dq.type = 'datetime-local'; dq.id = 'ms-ag-quando'; dq.step = '60';
    dq.min = fortIso_(Date.now() + 60000).slice(0, 16); dq.max = fortIso_(Date.now() + 60 * 86400000).slice(0, 16);
    dq.addEventListener('input', () => { agendaAtalho_ = ''; agendaQuando_ = dq.value ? fortParaMs_(dq.value) : 0; marcarAgenda_(); });
    const res = el('p', 'ms-agenda-res'); res.id = 'ms-ag-res'; res.setAttribute('aria-live', 'polite');
    s2.append(lq, at, ld, dq, res);
    const s3 = el('section', 'ms-agenda-sec'); s3.id = 'ms-ag-lista'; s3.appendChild(el('p', 'ms-auto-exp', 'Carregando as agendadas…'));
    const feedback=el('p','ms-agenda-res');feedback.id='ms-ag-form-status';feedback.setAttribute('role','status');
    w.append(s1, s2, feedback, s3); corpo.appendChild(w);
    const pe = el('div', 'ms-auto-pe'), bt = botao('ms-btn prim', 'Agendar', 'agenda-salvar'); bt.id = 'ms-ag-salvar'; pe.appendChild(bt); painelAgenda.appendChild(pe);
    marcarAgenda_();
    if (!rascunho) setTimeout(() => { if ($('ms-ag-texto') && larga()) $('ms-ag-texto').focus(); }, 0);
    const r = await worker_('/msg/agendadas?conversa=' + encodeURIComponent(conv.id), 'GET');
    const g2 = $('ms-gaveta'); if (!g2 || g2.dataset.gen !== gen) return;
    if (!r.ok) { s3.textContent = ''; s3.appendChild(el('p', 'ms-auto-exp', r.erro || 'Não foi possível carregar as agendadas agora.')); return; }
    agendadas_ = r.pendentes || []; desenharFaixaAgenda_(); desenharListaAgenda_(r);
  }
  function marcarAgenda_() {
    document.querySelectorAll('#ms-gaveta [data-ms=agenda-atalho]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === agendaAtalho_)));
    const dq = $('ms-ag-quando'); if (dq && agendaAtalho_ && agendaQuando_) dq.value = fortIso_(agendaQuando_).slice(0, 16);
    const res = $('ms-ag-res'); if (!res) return;
    res.textContent = agendaQuando_ ? (agendaQuando_ <= Date.now() ? 'Esse horário já passou. Escolha outro.' : 'Sai ' + quandoRotulo_(new Date(agendaQuando_).toISOString()) + ', sozinha.') : 'Escolha um atalho ou o dia e a hora.';
  }
  function desenharListaAgenda_(r) {
    const s3 = $('ms-ag-lista'); if (!s3) return; s3.textContent = '';
    const pend = r.pendentes || [], hist = r.historico || [];
    s3.appendChild(el('span', 'ms-agenda-rot', pend.length ? 'Agendadas nesta conversa' : 'Nenhuma mensagem agendada nesta conversa.'));
    const item = (a, comCancelar) => {
      const li = el('li'), d = el('div');
      const st = a.status === 'enviada' ? 'Enviada ' + quandoRotulo_(a.enviado_em || a.quando) : a.status === 'falhou' ? 'Não enviada' : a.status === 'enviando' ? 'Saindo agora…' : quandoRotulo_(a.quando);
      d.append(el('b', '', a.tipo==='encerrar'&&a.status==='enviada'&&!a.erro?'Atendimento encerrado':a.status==='cancelada'?'Cancelado':st), el('p', '', a.texto));
      if(a.tem_anexo)d.appendChild(el('small','','Anexo: '+(a.anexo_nome||'Foto, vídeo ou áudio')));
      if(a.erro&&a.status!=='falhou')d.appendChild(el('small','',a.erro));
      const sub = el('small', a.status === 'falhou' ? 'falha' : '', a.status === 'falhou' ? (a.erro || 'Não foi possível enviar.') : (a.autor ? 'Agendada por ' + a.autor : ''));
      if (sub.textContent) d.appendChild(sub);
      li.appendChild(d);
      if (comCancelar && a.status === 'pendente') { const c = botao('ms-btn', 'Cancelar', 'agenda-cancelar', { id: String(a.id) }); c.setAttribute('aria-label', 'Cancelar a mensagem agendada para ' + quandoRotulo_(a.quando)); li.appendChild(c); }
      return li;
    };
    if (pend.length) { const ul = el('ul', 'ms-agenda-lista'); pend.forEach((a) => ul.appendChild(item(a, true))); s3.appendChild(ul); }
    if (hist.length) {
      s3.appendChild(el('span', 'ms-agenda-rot', 'Últimas enviadas ou com falha'));
      const ul = el('ul', 'ms-agenda-lista'); hist.forEach((a) => ul.appendChild(item(a, false))); s3.appendChild(ul);
    }
  }
  async function salvarAgenda_(b) {
    if(!aberta)return;
    const c=aberta,conv=c.id,gen=$('ms-gaveta')?.dataset.gen,epoca=epocaConta_,ta=$('ms-ag-texto'),texto=ta?.value.trim()||'',feedback=$('ms-ag-form-status'),arquivo=agendaAnexo_;
    const informar=t=>{if(feedback)feedback.textContent=t;};
    if(!texto&&!arquivo){informar('Escreva a mensagem ou escolha um anexo.');ta?.focus();return;}
    if(!agendaQuando_||agendaQuando_<=Date.now()){informar('Escolha um dia e horário no futuro.');$('ms-ag-quando')?.focus();return;}
    if(c.canal==='instagram'&&arquivo&&texto){informar('No Instagram, agende o arquivo e o texto em mensagens separadas.');return;}
    const quando=new Date(agendaQuando_).toISOString(),assinado=texto?(adminAssinatura_()?assinar_(c,texto):texto):'',assinatura=JSON.stringify([conv,quando,assinado,arquivo?.nome,arquivo?.blob.size]);
    if(!agendaPedido_||agendaPedido_.assinatura!==assinatura)agendaPedido_={assinatura,idLocal:idLocal_()};
    const idLocal=agendaPedido_.idLocal,campos=[...$('ms-gaveta').querySelectorAll('.ms-agenda input,.ms-agenda textarea,.ms-agenda button,#ms-ag-salvar')].map(e=>[e,e.disabled]);campos.forEach(([e])=>e.disabled=true);informar(arquivo?'Preparando envio do anexo…':'Salvando…');
    const atual=()=>aberta?.id===conv&&$('ms-gaveta')?.dataset.gen===gen&&epoca===epocaConta_;
    try{
      if(arquivo&&!arquivo.chave){
        const r=await subirAnexo_(arquivo);if(!atual())return;
        if(!r.ok){informar(r.erro||'Não foi possível preparar o anexo. Tente novamente.');return;}
        arquivo.chave=r.anexo;
      }
      if(!atual())return;
      const r=await worker_('/msg/agendar','POST',{conversa:conv,texto:assinado,quando,anexo:arquivo?.chave||'',anexoNome:arquivo?.nome||'',idLocal});
      if(!atual())return;
      if(!r.ok){informar(r.erro||'Não consegui confirmar. Tente novamente para conferir o mesmo pedido.');return;}
      const comp=$('ms-texto');if(comp&&comp.value.trim()===texto){comp.value='';comp.dispatchEvent(new Event('input',{bubbles:true}));}
      if(arquivo&&anexoPend?.blob===arquivo.blob)limparAnexo_(true);
      ta.value='';agendaAnexo_=null;agendaPedido_=null;agendaQuando_=0;agendaAtalho_='';$('ms-ag-quando').value='';marcarAgenda_();
      $('ms-ag-remover-anexo').hidden=true;$('ms-ag-anexar').parentElement.querySelector('.ms-ag-anexo-nome').textContent='';
      agendadas_=r.pendentes||[];desenharFaixaAgenda_();desenharListaAgenda_(r);informar('Agendada para '+quandoRotulo_(r.agendada.quando)+'.');
    }finally{campos.forEach(([e,disabled])=>{if(e.isConnected)e.disabled=disabled;});if(atual())b.focus();}
  }

  async function cancelarAgenda_(b) {
    if (!aberta || !confirm('Cancelar esta mensagem agendada? Ela não será enviada.')) return;
    const conv = aberta.id; b.disabled = true;
    const r = await worker_('/msg/agendar/cancelar', 'POST', { id: Number(b.dataset.id) });
    if (!r.ok) { b.disabled = false; aviso_(r.erro || 'Não foi possível cancelar agora.'); recarregarAgenda_(conv); return; }
    if (!aberta || aberta.id !== conv) return;
    agendadas_ = r.pendentes || []; desenharFaixaAgenda_(); desenharListaAgenda_(r); aviso_('Agendamento cancelado.');
    const prox = document.querySelector('#ms-gaveta [data-ms=agenda-cancelar]') || $('ms-ag-texto'); if (prox) prox.focus();
  }
  let fichaOrig_ = null, fichaAtual_ = null, fichaApiPromise_;
  function carregarFichaApi_() {
    if (window.TKMensagensFicha) return Promise.resolve(window.TKMensagensFicha);
    if (!fichaApiPromise_) fichaApiPromise_ = new Promise((resolve,reject)=>{const s=document.createElement('script');const origem=document.querySelector('script[src*="admin-mensagens.js"]');const ver=origem?new URL(origem.src).search:'';s.src=new URL('mensagens-ficha.js'+ver,document.baseURI).href;s.onload=()=>window.TKMensagensFicha?resolve(window.TKMensagensFicha):reject(new Error('Módulo de ficha indisponível.'));s.onerror=()=>reject(new Error('Não foi possível carregar os dados da ficha.'));document.head.appendChild(s);});
    return fichaApiPromise_.catch(e=>{fichaApiPromise_=null;throw e;});
  }
  const dataFicha_ = (iso) => { const d = new Date(iso); return !iso || isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  function capturarFicha_(){const val=id=>String($(id)?.value||'').trim();return {nome:val('ms-fi-nome'),cidade:val('ms-fi-cid')==='__outra'?val('ms-fi-outra-cid'):val('ms-fi-cid'),municipio:val('ms-fi-municipio'),bairro:val('ms-fi-bairro'),localidade:val('ms-fi-localidade'),preferencias:{texto:val('ms-fi-pref'),tamanhos:[...(fichaAtual_?.preferencias.tamanhos||[])],generos:[...(fichaAtual_?.preferencias.generos||[])],tecidos:[...(fichaAtual_?.preferencias.tecidos||[])],cores:[...(fichaAtual_?.preferencias.cores||[])]}}}
  function fichaMudou_(){if(!fichaOrig_||!$('ms-fi-nome'))return false;return JSON.stringify(capturarFicha_())!==fichaOrig_;}
  async function abrirFicha_() {
    if (!aberta || aberta.grupo) return;
    const conv=aberta,corpo=gaveta_('Ficha do cliente');if(!corpo)return;
    const g=$('ms-gaveta');g.dataset.tipo='ficha';const gen=g.dataset.gen;fichaOrig_=null;
    const w=el('div','ms-ficha');w.id='ms-ficha';w.setAttribute('aria-busy','true');w.appendChild(el('p','ms-auto-exp','Carregando a ficha…'));corpo.appendChild(w);
    let api;try{api=await carregarFichaApi_()}catch(e){w.removeAttribute('aria-busy');w.textContent=e.message;return}
    const r=await worker_('/msg/ficha?conversa='+encodeURIComponent(conv.id),'GET');
    if(r.ok&&typeof tkProdutosLista==='function'&&!tkProdutosLista().length&&typeof carregarProdutos==='function'){try{await carregarProdutos();}catch(_){/* ficha continua editável sem catálogo; não inventar opções */}}
    const g2=$('ms-gaveta');if(!g2||g2.dataset.gen!==gen||!aberta||aberta.id!==conv.id)return;
    w.removeAttribute('aria-busy');w.textContent='';if(!r.ok){w.appendChild(el('p','ms-auto-exp',r.erro||'Não foi possível abrir a ficha agora.'));const l=el('div','ms-ficha-acao');l.appendChild(botao('ms-btn','Tentar de novo','ficha'));w.appendChild(l);return}
    desenharFicha_(w,conv,r,api);const pe=el('div','ms-auto-pe ms-ficha-pe'),info=el('small');info.id='ms-fi-info';const bt=botao('ms-btn prim','Salvar','ficha-salvar');bt.id='ms-fi-salvar';pe.append(info,bt);g2.appendChild(pe);infoFicha_(r.ficha);
  }
  function infoFicha_(f){const i=$('ms-fi-info');if(i)i.textContent=f&&f.atualizado_em?'Atualizada'+(f.autor?' por '+f.autor:'')+' em '+dataFicha_(f.atualizado_em):''}
  function desenharFicha_(w,conv,r,api){
    const f=r.ficha||{},p=api.comoPerfil(f,api.cidades);fichaAtual_=p;

    const sec=(titulo,id)=>{const s=el('section','ms-ficha-sec'),h=el('h4','ms-ficha-rot',titulo);h.id=id;s.setAttribute('aria-labelledby',id);s.appendChild(h);w.appendChild(s);return s};
    const quem=el('p','ms-ficha-quem'),nc=(r.canais||[]).length;quem.append(el('b','',rotuloContato(conv)),document.createTextNode(nc>1?' · vale para os '+nc+' canais desta pessoa':''));w.appendChild(quem);
    const sn=el('section','ms-ficha-sec'),ln=el('label','ms-ficha-rot','Nome do cliente'),inn=el('input','ms-copia');ln.htmlFor='ms-fi-nome';inn.id='ms-fi-nome';inn.type='text';inn.maxLength=120;inn.value=r.nome||rotuloContato(conv);inn.autocomplete='off';sn.append(ln,inn);w.appendChild(sn);
    const loc=sec('Cidade e localização','ms-fi-h-loc');
    const field=(parent,label,id,value)=>{const l=el('label','ms-ficha-rot',label),i=el('input','ms-copia');l.htmlFor=id;i.id=id;i.value=value||'';i.maxLength=100;i.autocomplete='off';parent.append(l,i);return i;};
    const select=(parent,label,id,items,value)=>{const lb=el('label','ms-ficha-rot',label),sel=el('select','ms-copia');lb.htmlFor=id;sel.id=id;items.forEach(([v,t])=>{const op=el('option','',t);op.value=v;sel.appendChild(op)});sel.value=value;parent.append(lb,sel);return sel;};
    const conhecida=api.cidades.includes(p.cidade),cidade=select(loc,'Cidade','ms-fi-cid',[['','Escolher cidade'],...api.cidades.map(v=>[v,v]),['__outra','Outra cidade']],p.cidade?(conhecida?p.cidade:'__outra'):'');
    const outra=field(loc,'Nome da cidade','ms-fi-outra-cid',conhecida?'':p.cidade);outra.hidden=cidade.value!=='__outra';outra.previousSibling.hidden=outra.hidden;
    const sub=el('div');sub.id='ms-fi-sub-loc';
    const livre=(parent,label,id,atual,opcoes)=>{const tem=opcoes.includes(atual),sel=select(parent,label,id+'-opcao',[['__livre','Escrever outro / preencher livremente'],...opcoes.map(v=>[v,v])],tem?atual:'__livre');const inp=field(parent,'Escrever '+label.toLowerCase(),id,atual);const sync=()=>{const texto=sel.value==='__livre';inp.hidden=!texto;inp.previousSibling.hidden=!texto;if(!texto)inp.value=sel.value;};sel.addEventListener('change',()=>{if(sel.value==='__livre'){inp.value='';inp.hidden=false;inp.previousSibling.hidden=false;inp.focus();}else sync();});sync();return inp;};
    const blocoCr=el('div');blocoCr.id='ms-fi-bloco-cr';livre(blocoCr,'Bairro','ms-fi-bairro',p.bairro,api.sugestoesBairrosCrateus);sub.appendChild(blocoCr);
    const blocoIn=el('div');blocoIn.id='ms-fi-bloco-in';livre(blocoIn,'Localidade','ms-fi-localidade',p.localidade,api.sugestoesDistritosCrateus);const municipio=field(blocoIn,'Município da região (opcional)','ms-fi-municipio',p.municipio);municipio.parentNode.querySelector('label[for=ms-fi-municipio]').hidden=true;municipio.hidden=true;sub.appendChild(blocoIn);
    sub.appendChild(el('p','ms-ficha-vazio','Não encontrou? Escolha preencher livremente. As sugestões de bairros e localidades são parciais.'));loc.appendChild(sub);
    const atualizarLocal=()=>{const v=cidade.value;sub.hidden=!['Crateús','Interior'].includes(v);blocoCr.hidden=v!=='Crateús';blocoIn.hidden=v!=='Interior';outra.hidden=v!=='__outra';outra.previousSibling.hidden=outra.hidden;};cidade.addEventListener('change',atualizarLocal);atualizarLocal();
    const pref=sec('Preferências','ms-fi-h-pref'),lp=el('label','ms-ficha-rot','Observações'),tp=el('textarea','ms-copia');lp.htmlFor='ms-fi-pref';tp.id='ms-fi-pref';tp.rows=2;tp.maxLength=300;tp.value=f.preferencias||'';tp.placeholder='Ex.: gosta de vestido longo e cores claras';pref.append(lp,tp);
    const gostos=sec('Tamanhos e peças de interesse','ms-fi-h-gostos');
    const grupos=[['tamanhos','Tamanhos'],['generos','Gêneros'],['tecidos','Tecidos'],['cores','Cores']], paineis=[];
    const produtos=typeof tkProdutosLista==='function'?tkProdutosLista():[];
    const norm=x=>semAcento_(String(x)).trim(), tokens=x=>String(x||'').split(/[,;|]/).map(v=>v.trim()).filter(Boolean);
    const vals=(prod,key)=>key==='tamanhos'?(window.TKTamanhos?TKTamanhos.cliente(String(prod.Tamanhos||''),prod.Genero).valores:tokens(prod.Tamanhos)).filter(v=>!/consult/i.test(v)):key==='tecidos'?[window.TKTecido&&TKTecido.ler(prod)].filter(Boolean):tokens(prod[key==='generos'?'Genero':'Cores']);
    const compativeis=indice=>produtos.filter(prod=>prod&&(!prod.Status||prod.Status==='Ativo')&&grupos.slice(0,indice).every(([key])=>!p.preferencias[key].length||p.preferencias[key].some(v=>vals(prod,key).some(x=>norm(x)===norm(v)))));
    const pintarGostos=()=>{grupos.forEach(([key,title],idx)=>{const {d,sum,body}=paineis[idx], escolhidos=p.preferencias[key],disponiveis=api.unicos(compativeis(idx).flatMap(prod=>vals(prod,key))), todas=api.unicos(disponiveis.concat(escolhidos));sum.textContent=title+(escolhidos.length?' · '+escolhidos.join(', '):' · escolher');body.textContent='';
      const pronto=idx===0||p.preferencias[grupos[idx-1][0]].length>0;
      if(!pronto&&!escolhidos.length){body.appendChild(el('p','ms-ficha-vazio','Escolha '+grupos[idx-1][1].toLowerCase()+' primeiro.'));return;}
      const chips=el('div','ms-ficha-tams');chips.setAttribute('role','group');chips.setAttribute('aria-label',title);
      todas.forEach(v=>{const ativo=escolhidos.includes(v),fora=!disponiveis.includes(v),b=botao('ms-btn',v+(fora?' · salvo':''));b.dataset.fichaGrupo=key;b.dataset.valor=v;b.setAttribute('aria-pressed',String(ativo));b.addEventListener('click',()=>{const ix=escolhidos.indexOf(v);if(ix<0)escolhidos.push(v);else escolhidos.splice(ix,1);pintarGostos();const mesmo=body.querySelector('button[data-valor="'+CSS.escape(v)+'"]');if(mesmo)mesmo.focus();});chips.appendChild(b);});body.appendChild(chips);
      if(!todas.length)body.appendChild(el('p','ms-ficha-vazio','Nenhuma opção compatível cadastrada no catálogo.'));
      if(idx===0){const ad=el('div','ms-fi-adicionar'),i=el('input','ms-copia');i.setAttribute('aria-label','Outro tamanho');i.placeholder='Outro tamanho';i.maxLength=60;const bt=botao('ms-btn','Adicionar');bt.addEventListener('click',()=>{const v=i.value.trim();if(v&&!escolhidos.includes(v)){escolhidos.push(v);pintarGostos();}});ad.append(i,bt);body.appendChild(ad);}
      if(idx<3){const bt=botao('ms-btn','Escolher '+grupos[idx+1][1].toLowerCase());bt.disabled=!escolhidos.length;bt.addEventListener('click',()=>{d.open=false;paineis[idx+1].d.open=true;paineis[idx+1].sum.focus();});body.appendChild(bt);}
    });};
    grupos.forEach(([key,title],idx)=>{const d=el('details','ms-fi-faceta'),sum=el('summary','',title),body=el('div','ms-fi-faceta-corpo');d.open=idx===0;d.append(sum,body);gostos.appendChild(d);paineis.push({d,sum,body});});pintarGostos();
    const etiquetas=r.etiquetas||[],etapas=etiquetas.filter(e=>e.venda),outras=etiquetas.filter(e=>!e.venda),drawTags=(title,id,items,button)=>{const s=sec(title,id);if(items.length){const d=el('div','ms-ficha-etqs');items.forEach(e=>d.appendChild(tagEtq_(e)));s.appendChild(d)}else s.appendChild(el('p','ms-ficha-vazio',title==='Etapa da venda'?'Sem etapa definida.':'Nenhuma outra etiqueta.'));const a=el('div','ms-ficha-acao');a.appendChild(botao('ms-btn',button,'ficha-etiquetas'));s.appendChild(a)};
    drawTags('Etapa da venda','ms-fi-h-etapa',etapas,etapas.length?'Mudar etapa':'Definir etapa');if(outras.length){const legado=sec('Outras informações','ms-fi-h-etq');outras.forEach(e=>legado.appendChild(tagEtq_(e)));}
    const s5=sec('Notas recentes','ms-fi-h-notas'),notas=r.notas||[];if(notas.length){const ul=el('ul','ms-ficha-lista');notas.forEach(n=>{const li=el('li','ms-ficha-nota'),d=el('div');d.append(el('p','',n.texto),el('small','',[n.autor,dataFicha_(n.em)].filter(Boolean).join(' · ')));li.appendChild(d);ul.appendChild(li)});s5.appendChild(ul)}else s5.appendChild(el('p','ms-ficha-vazio','Nenhuma nota interna ainda.'));
    const s6=sec('Compras','ms-fi-h-compras'),compras=r.compras||[];if(compras.length){const ul=el('ul','ms-ficha-lista');compras.forEach(c=>{const li=el('li'),d=el('div');d.append(document.createTextNode('Vendeu em '+dataFicha_(c.em)),el('small','','Pelo '+(NOME_CANAL[c.canal]||c.canal)));li.appendChild(d);ul.appendChild(li)});s6.appendChild(ul)}else s6.appendChild(el('p','ms-ficha-vazio','Nenhuma compra registrada ainda.'));
    const s7=sec('Canais','ms-fi-h-canais'),ul7=el('ul','ms-ficha-lista');(r.canais||[]).forEach(c=>{const li=el('li'),d=el('div'),fone=c.canal!=='instagram'&&/^\\d{10,15}$/.test(String(c.contato||''))?foneBonito_(c.contato):'';d.append(document.createTextNode(NOME_CANAL[c.canal]||c.canal),el('small','',[fone,c.atual?'esta conversa':''].filter(Boolean).join(' · ')));li.appendChild(d);if(!c.atual){const b=botao('ms-btn','Abrir','ficha-abrir',{id:String(c.id),canal:c.canal});b.setAttribute('aria-label','Abrir a conversa do '+(NOME_CANAL[c.canal]||c.canal));li.appendChild(b)}ul7.appendChild(li)});s7.appendChild(ul7);const ac=el('details','ms-ficha-acao');ac.appendChild(el('summary','','Editar telefones e canais'));ac.addEventListener('toggle',()=>{if(ac.open&&!ac.dataset.carregado){ac.dataset.carregado='1';editarPessoa_(conv.id,ac)}});s7.appendChild(ac);
    fichaOrig_=JSON.stringify(capturarFicha_());
  }
  function sairFicha_(){return !fichaMudou_()||confirm('Você mudou a ficha e ainda não salvou. Sair sem salvar?')}
  async function salvarFicha_(b){if(!aberta||!$('ms-fi-nome'))return;const gen=$('ms-gaveta')?.dataset.gen,conv=aberta.id,perfil=capturarFicha_(),corpo={conversa:conv,nome:perfil.nome,cidade:perfil.cidade,preferencias:perfil.preferencias.texto,perfil};corpo.tamanhos=perfil.preferencias.tamanhos.join(' · ').slice(0,60);b.disabled=true;const r=await worker_('/msg/ficha','POST',corpo);b.disabled=false;if(!r.ok){aviso_(r.erro||'Não foi possível salvar a ficha agora. Tente de novo.');b.focus();return}if(!aberta||aberta.id!==conv||$('ms-gaveta')?.dataset.gen!==gen)return;aberta.tamanhos=r.ficha.tamanhos||'';if(r.nome){aberta.nome=r.nome;const q=$('ms-conversa').querySelector('.ms-quem b');if(q)q.textContent=r.nome;await carregarLista(true)}const fx=$('ms-etq-faixa');if(fx)fx.replaceWith(faixaEtq_(aberta));fichaOrig_=null;fecharGaveta_();aviso_('Ficha salva.');const q=document.querySelector('#ms-conversa .ms-quem');if(q)q.focus()}

  function cabecalhoConversa(c) {
    const cab = el('div', 'ms-cab');
    const v = botao('ms-ico ms-voltar', '←', 'voltar'); v.setAttribute('aria-label', 'Voltar para as conversas');
    v.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();voltarLista();});
    const av = el('span', 'ms-av', iniciais(c)); av.style.background = corAvatar(c); av.setAttribute('aria-hidden', 'true');
    if (!c.grupo) { av.dataset.ms = 'ficha'; av.style.cursor = 'pointer'; }   // v7.40.14: nome/avatar abrem a ficha do cliente (o teclado usa o botão do nome)
    const q = botao('ms-quem', '', c.grupo ? 'pessoa' : 'ficha');q.setAttribute('aria-label',c.grupo?'Grupo '+rotuloContato(c):'Abrir a ficha do cliente '+rotuloContato(c));q.style.textAlign='left';q.style.background='transparent';q.appendChild(el('b', '', rotuloContato(c)));
    q.appendChild(el('span', '', NOME_CANAL[c.canal] + (c.grupo ? ' · grupo' : (/^\d{10,15}$/.test(c.contato) ? ' · ' + foneBonito_(c.contato) : ''))));
    const mais = botao('ms-ico', '⋯', 'menu-conversa'); mais.id = 'ms-mais-conv'; mais.setAttribute('aria-label', 'Opções da conversa'); mais.setAttribute('aria-haspopup', 'dialog');
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
      const a = el('div', 'ms-espiar-acoes'); a.append(botao('ms-btn', 'Nota para equipe', 'notas-abrir'), botao('ms-btn prim', 'Atender', 'atender')); e.appendChild(a); pai.appendChild(e);
    }
    const wrap = el('div', 'ms-fio-wrap'), fio = el('div', 'ms-fio'); fio.id = 'ms-fio'; fio.tabIndex=0; fio.setAttribute('role', 'log'); fio.setAttribute('aria-live', 'polite'); fio.setAttribute('aria-label', 'Mensagens da conversa');
    const pill = botao('ms-nova', '', 'fim'); pill.id = 'ms-nova'; pill.hidden = true;
    wrap.append(fio, pill); pai.appendChild(wrap);
    fio.addEventListener('scroll', () => { if (perto_(fio, 60) && novasAbaixo) { novasAbaixo = 0; atualizarPill(); marcarLida(); } }, { passive: true });
    const dica = dicaComposer(c); if (dica) { const d = el('div', 'ms-dica', dica); d.id = 'ms-dica'; pai.appendChild(d); }
    const stage = el('div', 'ms-stage'); stage.id = 'ms-stage'; stage.hidden = !anexoPend; pai.appendChild(stage);
    const assina = el('div', 'ms-assina'); assina.id = 'ms-assina'; pai.appendChild(assina);
    const prev = el('div', 'ms-previa'); prev.id = 'ms-previa'; prev.hidden = true;
    const prevL = el('label'), prevC = el('input'); prevC.type = 'checkbox'; prevC.id = 'ms-previa-chk'; prevC.checked = previaPreferida_(c.canal);
    prevC.addEventListener('change', () => {guardarPrevia_(c.canal, prevC.checked);desenharPrevia_();});
    prevL.append(prevC, el('span', '', 'Mostrar prévia do link'), el('small', '', '(miniatura)')); prev.appendChild(prevL);const mini=el('div','ms-link-mini');mini.id='ms-link-mini';mini.hidden=true;prev.appendChild(mini);pai.appendChild(prev);
    const form = el('div', 'ms-compor');
    const clip = botao('ms-ico', '📎', 'anexar'); clip.id = 'ms-anexar'; clip.setAttribute('aria-label', 'Anexar foto, vídeo ou áudio');
    const arq = el('input'); arq.type = 'file'; arq.id = 'ms-arquivo'; arq.hidden = true; arq.accept = 'image/*,video/*';
    const contaDoAnexo=contaSessao_(getSessao()),epocaDoAnexo=epocaConta_;
    arq.addEventListener('change', () => { const f = arq.files && arq.files[0]; arq.value = ''; conferirContaAtual_();if(!f)return;if(aberta&&aberta.id===c.id&&contaSessao_(getSessao())===contaDoAnexo&&epocaConta_===epocaDoAnexo)escolherArquivo_(f);else aviso_('A conversa mudou. Escolha o arquivo novamente no atendimento correto.'); });
    const audioArquivo=el('input');audioArquivo.type='file';audioArquivo.accept='audio/*';audioArquivo.id='ms-arquivo-audio';audioArquivo.hidden=true;
    audioArquivo.addEventListener('change',()=>{const f=audioArquivo.files&&audioArquivo.files[0];audioArquivo.value='';conferirContaAtual_();if(f&&aberta&&aberta.id===c.id&&contaSessao_(getSessao())===contaDoAnexo&&epocaConta_===epocaDoAnexo)escolherArquivo_(f);});
    const ta = el('textarea'); ta.id = 'ms-texto'; ta.rows = 1; ta.placeholder = 'Mensagem'; if (c.canal !== 'instagram') ta.maxLength = limiteTexto(c); ta.setAttribute('aria-label', 'Mensagem para ' + rotuloContato(c)); ta.enterKeyHint = 'enter'; ta.value = rascunhoLer_(c.id);
    const mic = botao('ms-ico', '🎤', 'gravar'); mic.id = 'ms-mic'; mic.setAttribute('aria-label', 'Gravar áudio'); if (!(window.TKAndroid && typeof TKAndroid.audioNativo==='function' && TKAndroid.audioNativo()) && !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)) mic.hidden = true;
    const bt = botao('ms-enviar', 'Enviar', 'enviar'); bt.id = 'ms-enviar'; bt.disabled = !ta.value.trim() && !anexoPend;
    form.append(clip, arq, audioArquivo, ta, mic, bt); pai.appendChild(form);
    if (espiando || !podeFerramenta_('responder')) form.hidden = true;        // para responder, toque em Atender (aí marca como lida)
    const cresce = () => { if (expandirAtalho_(ta)) return; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 132) + 'px'; bt.disabled = !ta.value.trim() && !anexoPend; rascunhoSalvar_(c.id, ta.value); desenharPrevia_(); };
    ta.addEventListener('input', cresce);
    ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && window.matchMedia('(pointer: fine)').matches) { ev.preventDefault(); enviar(); } });
    cresce(); desenharStage_(); desenharAssina_(false); desenharFaixaAgenda_();
  }
  /* ---- v7.34: prévia do link (miniatura) escolhida em cada mensagem do WhatsApp; o último jeito usado em cada canal fica lembrado neste aparelho ---- */
  const LINK_RE_ = /https?:\/\/[^\s<>"']+/i;
  function previaPreferida_(canal) { try { return (JSON.parse(localStorage.getItem('tk_ms_previa_v1') || '{}') || {})[canal] === true; } catch (e) { return false; } }
  function guardarPrevia_(canal, sim) { try { const o = JSON.parse(localStorage.getItem('tk_ms_previa_v1') || '{}') || {}; o[canal] = !!sim; localStorage.setItem('tk_ms_previa_v1', JSON.stringify(o)); } catch (e) { /* só conforto */ } }
  function desenharPrevia_() {
    const w = $('ms-previa'), ta = $('ms-texto'); if (!w) return;
    w.hidden = !(aberta && !espiando && !modoNota && aberta.canal !== 'instagram' && !anexoPend && ta && LINK_RE_.test(ta.value));
    const mini=$('ms-link-mini');if(mini){const p=!w.hidden&&$('ms-previa-chk')?.checked?cartaoDoLink_(ta.value):null,key=p&&p.imagem||'';mini.hidden=!key;if(mini.dataset.imagem!==key){mini.dataset.imagem=key;mini.textContent='';if(key)mini.appendChild(imgCartao_(p));}}
  }
  /* título e descrição do cartão: produto do site (nome e preço), seleção (?sel=) ou só o nome da loja; link de fora fica com o que o WhatsApp achar */
  function imagemCartaoSegura_(v){try{const u=new URL(String(v||''));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.href.length<=2048&&['tenkiter-midia.distkrpconfeccoes.workers.dev','midia.tenkitermodas.com.br','res.cloudinary.com','lh3.googleusercontent.com'].includes(u.hostname)?u.href:'';}catch(_){return '';}}
  function cartaoDoLink_(texto) {
    const m=String(texto||'').match(LINK_RE_);if(!m)return {};
    const link=m[0].replace(/[).,;:!?*_~]+$/,'');let u;
    try{u=new URL(link);if(u.origin!==new URL(SITE_URL).origin||u.protocol!=='https:'||u.username||u.password)return {};}catch(_){return {};}
    const pm=u.pathname.match(/^\/p\/([^/]+)\/?$/),sel=u.searchParams.get('sel');
    if(pm){
      let cod;try{cod=decodeURIComponent(pm[1]).toLowerCase();}catch(_){return {};}
      const p=produtosCatalogo_().find(x=>String(x.Codigo||'').toLowerCase()===cod||String(x.ID)===cod);
      if(p){const tam=tamanhosDe_(p),f=Number(u.searchParams.get('f')),fotos=[p.Foto_URL,...String(p.Fotos_Galeria||'').split(',').map(x=>x.trim()).filter(Boolean)],foto=Number.isInteger(f)&&f>=2&&f<=fotos.length?fotos[f-1]:p.Foto_URL;
        return {url:u.href,titulo:p.Nome||'TENKiTER Modas',descricao:precoTexto_(p)+(tam.length?' · '+tam.join(', '):''),imagem:imagemCartaoSegura_(foto)};
      }
    }
    if(sel){const n=sel.split(',').filter(Boolean).length;return {url:u.href,titulo:'Peças separadas para você',descricao:n+(n===1?' peça':' peças')+' na TENKiTER Modas'};}
    return {url:u.href,titulo:'TENKiTER Modas',descricao:''};
  }
  function imgCartao_(p){
    const w=el('span');w.innerHTML='<img alt="" '+atribSrc(imagemCartaoSegura_(p.imagem))+'>';const img=w.firstChild;
    img.alt='Miniatura: '+(p.titulo||'produto');img.decoding='async';img.addEventListener('error',()=>{img.alt='Miniatura indisponível';img.dataset.erro='1';},{once:true});return img;
  }
  function blocoLink_(m){
    let p;try{p=JSON.parse(m.link_previa||'null');}catch(_){return null;}
    if(!p||!imagemCartaoSegura_(p.imagem))return null;
    let u;try{u=new URL(p.url);if(u.origin!==new URL(SITE_URL).origin||u.protocol!=='https:'||u.username||u.password)return null;}catch(_){return null;}
    const a=el('a','ms-link-cartao'),d=el('span');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','Abrir produto: '+String(p.titulo||''));
    d.append(el('b','',String(p.titulo||'Produto')),el('small','',String(p.descricao||'')),el('small','ms-link-dominio',u.hostname));a.append(imgCartao_(p),d);return a;
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
    anexoPend = { blob: blob, tipo: tipo, nome:f.name||'Anexo', seg: Math.round(Number(seg) || 0), urlLocal: URL.createObjectURL(blob) };
    desenharStage_(); const ta = $('ms-texto'); if (ta && larga()) ta.focus();
  }
  function atualizarMic_() {
    const m = $('ms-mic'); if (!m) return;
    if (gravacao) { m.className = 'ms-ico gravando'; m.textContent = '⏹ ' + mmss((Date.now() - gravacao.t0) / 1000); m.setAttribute('aria-label', 'Parar e usar a gravação'); }
    else { m.className = 'ms-ico'; m.textContent = '🎤'; m.setAttribute('aria-label', 'Gravar áudio'); }
  }
  async function gravarAudio_() {
    if (gravacao) { gravacao.rec.stop(); return; }
    if(window.TKAndroid && typeof TKAndroid.audioNativo==='function' && TKAndroid.audioNativo()){
      const id=aberta&&aberta.id,epoca=epocaConta_,nav=abrindo;
      const input=el('input');input.type='file';input.accept='audio/mp4';input.setAttribute('capture','user');input.hidden=true;document.body.appendChild(input);
      input.addEventListener('change',()=>{const f=input.files&&input.files[0];input.remove();conferirContaAtual_();if(f&&aberta&&aberta.id===id&&epoca===epocaConta_&&nav===abrindo)escolherArquivo_(f);},{once:true});
      input.addEventListener('cancel',()=>input.remove(),{once:true});input.click();return;
    }
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
    if (!jaNaTela) { elMsgs.clear(); msgs = []; novasAbaixo = 0; limparBlobs_(); limparAnexo_(true); fecharLuz_(); agendadas_ = []; acompanhamento_=null; }
    const path='/msg/mensagens?conversa=' + encodeURIComponent(id);
    const salvo=APP_RECENTES ? await recentes_(path) : null;
    if(w!==abrindo)return;
    cacheConversa=!!salvo;
    if(salvo){
      aberta=salvo.conversa;msgs=salvo.mensagens;montarConversa(aberta);pintarFio(true);
      vista='conversa';$('ms-app').dataset.vista='conversa';
      if(!APP_RECENTES&&!larga()&&window.TKCamadas&&!TKCamadas.aberta('ms-conversa')) TKCamadas.empilhar('ms-conversa',mostrarLista_);
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
    const c = r.conversa; aberta = c; if (Array.isArray(r.agendadas)) agendadas_ = r.agendadas;if(Object.hasOwn(r,'acompanhamento'))acompanhamento_=r.acompanhamento;
    ultIdSrv = r.mensagens.reduce((m, x) => (x.id > m ? x.id : m), 0);
    msgs = r.mensagens.concat((r.notas || []).map(notaMsg_)).concat(Array.from(pendentes.values()).filter((p) => p.conversa === id).map((p) => p.msg));
    montarConversa(c); pintarFio(true);
    vista = 'conversa'; const app = $('ms-app'); app.dataset.vista = 'conversa';
    if (!APP_RECENTES && !larga() && window.TKCamadas && !TKCamadas.aberta('ms-conversa')) TKCamadas.empilhar('ms-conversa', mostrarLista_);
    pintarLista(); marcarLida();
    if (larga() && !espiando) { const t = $('ms-texto'); if (t) t.focus(); }
  }
  function mostrarLista_() {
    // Leaving a cached chat also cancels its pending open/retry. A late response must not navigate.
    ++abrindo; cacheConversa = false; aberta = null; vista = 'lista';
    const a = $('ms-app'); if (a) a.dataset.vista = 'lista';
    const c = $('ms-conversa'); if (c) { c.textContent = ''; c.appendChild(vazioConversa_()); }
    window.dispatchEvent(new Event('tk:mensagens-lista'));
  }
  function voltarLista() {
    if ($('ms-gaveta')) fecharGaveta_();
    mostrarLista_();
    if (!APP_RECENTES && window.TKCamadas && TKCamadas.aberta('ms-conversa')) TKCamadas.desempilhar('ms-conversa');
  }
  function voltarApp_(){
    if($('ms-luz')){fecharLuz_();return true;}
    if($('ms-gaveta')){if(!sairFicha_())return true;fichaOrig_=null;fecharGaveta_();return true;}
    if(vista==='conversa'||$('ms-app')?.dataset.vista==='conversa'){voltarLista();return true;}
    return false;
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
    atualizarAtalhoNotas_(); alternarNota_(false); aviso_('Nota salva. Só a equipe vê.');
  }
  function atualizarAtalhoNotas_() {
    if (!aberta) return;
    aberta.notas = msgs.filter(m => m.direcao === 'nota').length;
    const fx = $('ms-etq-faixa'); if (fx) fx.replaceWith(faixaEtq_(aberta));
  }
  function sincronizarNotas_(notas) {
    const novas = notas.map(notaMsg_);
    const anteriores = msgs.filter(m => m.direcao === 'nota');
    if (JSON.stringify(anteriores) === JSON.stringify(novas)) return false;
    msgs = msgs.filter(m => m.direcao !== 'nota').concat(novas);
    atualizarAtalhoNotas_(); return true;
  }
  async function abrirNotas_() {
    const c = aberta; if (!c) return;
    const corpo = gaveta_('Notas da equipe'); if (!corpo) return;
    corpo.classList.add('ms-notas-corpo');
    const label = el('label', 'ms-nota-label', 'Nova nota · só a equipe vê');
    const ta = el('textarea', 'ms-nota-campo'); ta.id = 'ms-nota-interna'; ta.rows = 3; ta.maxLength = 1000; label.htmlFor = ta.id;
    const salvar = botao('ms-btn prim', 'Salvar nota', ''); salvar.disabled = true;
    ta.addEventListener('input', () => { salvar.disabled = !ta.value.trim(); });
    const estado = el('p', 'ms-nota-estado', 'Carregando notas…'); estado.setAttribute('role', 'status');
    const ul = el('ul', 'ms-notas-lista');
    corpo.append(label, ta, salvar, estado, ul);
    function desenhar(notas) {
      ul.textContent = ''; estado.textContent = notas.length ? '' : 'Nenhuma nota nesta conversa.';
      notas.slice().reverse().forEach(n => {
        const li = el('li', 'ms-nota-item'), texto = el('div');
        texto.append(el('p', '', n.texto), el('small', '', [n.autor, dataFicha_(n.em)].filter(Boolean).join(' · ')));
        const x = botao('ms-ico', '×', ''); x.title = 'Apagar nota'; x.setAttribute('aria-label', 'Apagar nota de ' + (n.autor || 'Equipe'));
        x.addEventListener('click', async () => {
          x.disabled = true; estado.textContent = 'Apagando nota…';
          const r = await worker_('/msg/notas?conversa=' + c.id + '&id=' + n.id, 'DELETE');
          if (!corpo.isConnected) return;
          if (!r.ok) { x.disabled = false; estado.textContent = r.erro || 'Não foi possível apagar. Tente novamente.'; return; }
          if (aberta && aberta.id === c.id) { sincronizarNotas_(r.notas || []); pintarFio(false); }
          desenhar(r.notas || []); aviso_('Nota apagada. Exclusão registrada no histórico.');
        });
        li.append(texto, x); ul.appendChild(li);
      });
    }
    salvar.addEventListener('click', async () => {
      const texto = ta.value.trim(); if (!texto || salvar.disabled) return;
      salvar.disabled = true; ta.disabled = true; estado.textContent = 'Salvando nota…';
      const r = await worker_('/msg/notas', 'POST', { conversa: c.id, texto });
      if (!corpo.isConnected) return;
      ta.disabled = false; salvar.disabled = false;
      if (!r.ok) { estado.textContent = r.erro || 'Não foi possível salvar. Tente novamente.'; return; }
      ta.value = ''; salvar.disabled = true;
      if (aberta && aberta.id === c.id) { msgs.push(notaMsg_(r.nota)); atualizarAtalhoNotas_(); pintarFio(false); }
      const notas = msgs.filter(m => m.direcao === 'nota').map(m => ({ id: Number(String(m.id).slice(5)), texto: m.texto, autor: m.autor, em: m.enviada_em }));
      desenhar(notas); estado.textContent = 'Nota salva. Só a equipe vê.'; ta.focus();
    });
    const r = await worker_('/msg/notas?conversa=' + c.id, 'GET');
    if (!corpo.isConnected) return;
    if (!r.ok) { estado.textContent = r.erro || 'Não foi possível carregar. Feche e tente novamente.'; return; }
    if (aberta && aberta.id === c.id) { sincronizarNotas_(r.notas || []); pintarFio(false); }
    desenhar(r.notas || []);
  }
  async function enviar(reenvio) {
    if (cacheConversa) { aviso_('Aguarde atualizar a conversa para responder.'); return; }
    if (!aberta) return;
    const c = aberta, ta = $('ms-texto'); if (!ta && !reenvio) return;
    if (modoNota && !reenvio) { await salvarNota_(c, ta); return; }
    if(!reenvio&&assinaturaLigada_()&&!nomeAtendente_()){aviso_('Atualizando seu nome do cadastro. Tente enviar novamente em instantes.');carregarCfgLeitura_();return;}
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
      if(tmp.previa&&tmp.previa.imagem)tmp.msg.link_previa=JSON.stringify(tmp.previa);
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
      tmp.previa ? { previa: true, previaTitulo: tmp.previa.titulo || '', previaDescricao: tmp.previa.descricao || '', previaImagem:tmp.previa.imagem||'' } : {}));
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
    const guardada=sd.tipo==='entrada'||sd.tipo==='anexos';
    const b=el('b','',guardada?(sd.tipo==='entrada'?'Mensagens guardadas':'Anexos aguardando'):'Falha no recebimento');
    const t=el('span','',guardada?'Processamento será tentado novamente.':(hora(sd.desde)?'Desde '+hora(sd.desde)+'. ':'')+'Confira o canal no celular.');
    const texto=el('div');texto.append(b,t);e.replaceChildren(texto);
    if(guardada&&podeFerramenta_('configuracoes')){const bt=botao('ms-btn','Tentar','entrada-reprocessar');bt.setAttribute('aria-label','Tentar processar mensagens pendentes');e.append(bt);}

  }
  /* v7.40.7: trocar de usuário sem sair do aparelho — as contas já usadas ficam guardadas aqui e as conversas carregadas continuam */
  const CHAVE_CONTAS_ = 'tm_sessoes_v1';
  function contasSalvas_() { try { const l = JSON.parse(localStorage.getItem(CHAVE_CONTAS_) || '[]'); return Array.isArray(l) ? l.filter((x) => x && x.whatsapp && x.sessao) : []; } catch (e) { return []; } }
  function guardarContas_(l) { try { localStorage.setItem(CHAVE_CONTAS_, JSON.stringify(l.slice(0, 6))); } catch (e) { /* aparelho sem armazenamento */ } }
  function lembrarSessao_() {
    const s = typeof getSessao === 'function' ? getSessao() : null; if (!s) return;
    let nome = ''; try { nome = typeof usuarioAdmin !== 'undefined' && usuarioAdmin ? String(usuarioAdmin.nome || usuarioAdmin.name || '') : ''; } catch (e) { nome = ''; }
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
  let eventosAoVivo_=null;
  function iniciarEventos_(){
    if(!window.TKMensagensEventos)return;
    if(!eventosAoVivo_)eventosAoVivo_=window.TKMensagensEventos.criar({
      conta:()=>{const s=getSessao();return s?contaSessao_(s)+'|'+s.sessao:'';},
      ativo:()=>podeGerir()&&!!$('overlay-mensagens')?.classList.contains('aberto'),
      canais:()=>CANAIS.map(x=>x[0]),
      pedirTickets:canais=>worker_('/msg/tempo-real/ticket','POST',{canais}),
      atualizar:async contexto=>{if(sondaEmCurso_)await sondaEmCurso_;if(contexto.atual())await sondar();},
      estado:()=>agendar()
    });
    eventosAoVivo_.iniciar();
  }
  /* v7.40.33 (retomado do #305): iniciar conversa e acompanhar a equipe.
     As duas respeitam o acesso da pessoa: sem a ferramenta, a gaveta não abre.
     Nenhuma delas envia mensagem nem encerra atendimento. */
  let equipeFiltros_ = { dias: 7, usuario: '' }, equipeItens_ = [], equipeProximo_ = 0, equipeCarregando_ = false;
  function abrirNovaConversa_() {
    if (!podeFerramenta_('responder')) { aviso_('Seu acesso não permite iniciar conversas.'); return; }
    const corpo = gaveta_('Nova conversa'); if (!corpo) return;
    propostaGaveta_('nova-conversa', $('ms-nav')?.querySelector('[data-ms=menu-geral]'));
    const aj = el('p', 'ms-dica', 'No WhatsApp a loja pode escrever primeiro: a mensagem sai na hora. No Instagram só é possível abrir conversa que o cliente já iniciou.');
    const form = el('form', 'ms-cfg'); form.noValidate = true;
    const canal = el('select', 'ms-copia'); canal.id = 'ms-nova-canal'; canal.setAttribute('aria-label', 'Canal da conversa');
    CANAIS.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; canal.appendChild(o); });
    const lbCanal = el('label', 'ms-cfg-linha'); lbCanal.append(el('span', '', 'Canal'), canal);
    const destino = el('input', 'ms-copia'); destino.id = 'ms-nova-destino'; destino.type = 'tel'; destino.inputMode = 'tel';
    destino.autocomplete = 'off'; destino.placeholder = '(88) 99999-9999';
    const lbDestino = el('label', 'ms-cfg-linha'); const rotulo = el('span', '', 'WhatsApp com DDD'); lbDestino.append(rotulo, destino);
    const dica = el('p', 'ms-dica', 'Use o número com DDD. Se a pessoa já tem conversa neste canal, abrimos a existente.');
    const msg = el('textarea', 'ms-copia'); msg.id = 'ms-nova-texto'; msg.rows = 3;
    msg.maxLength = 1000; msg.placeholder = 'Escreva a primeira mensagem';
    msg.setAttribute('aria-label', 'Primeira mensagem');
    const lbMsg = el('label', 'ms-cfg-linha'); const rotMsg = el('span', '', 'Primeira mensagem'); lbMsg.append(rotMsg, msg);
    const ir = botao('ms-btn prim', 'Enviar pelo WhatsApp', 'nova-conversa-ir');
    const troca = () => {
      const ig = canal.value === 'instagram';
      rotulo.textContent = ig ? '@ do Instagram' : 'WhatsApp com DDD';
      destino.type = ig ? 'text' : 'tel'; destino.inputMode = ig ? 'text' : 'tel';
      destino.placeholder = ig ? '@loja.cliente' : '(88) 99999-9999';
      dica.textContent = ig ? 'A API oficial do Instagram não deixa escrever primeiro: só abre conversa que o cliente já iniciou.' : 'Use o número com DDD. Se a pessoa já tem conversa neste canal, abrimos a existente.';
      // O Instagram não recebe texto de início: o campo some para não prometer o que não acontece.
      lbMsg.hidden = ig;
      if (ig) msg.value = '';
      ir.textContent = ig ? 'Abrir conversa' : 'Enviar pelo WhatsApp';
    };
    canal.addEventListener('change', troca);
    form.append(lbCanal, lbDestino, lbMsg, dica, aj);
    const pe = el('div', 'ms-filtros-pe');
    pe.append(botao('ms-btn', 'Cancelar', 'gaveta-fechar'), ir);
    form.appendChild(pe); corpo.appendChild(form);
    troca();
    setTimeout(() => destino.focus(), 60);
  }
  async function irParaConversa_(b) {
    const canal = $('ms-nova-canal')?.value, destino = ($('ms-nova-destino')?.value || '').trim();
    const texto = canal === 'instagram' ? '' : ($('ms-nova-texto')?.value || '').trim();
    if (!destino) { aviso_(canal === 'instagram' ? 'Digite o @ do Instagram.' : 'Digite o WhatsApp com DDD.'); return; }
    if (canal !== 'instagram' && !texto) { aviso_('Escreva a primeira mensagem: ela sai agora pelo WhatsApp.'); $('ms-nova-texto')?.focus(); return; }
    if (canal !== 'instagram' && !/\d{10,}/.test(destino.replace(/\D/g, ''))) { aviso_('Digite o WhatsApp com DDD, como (88) 99999-9999.'); return; }
    // Mesmo idLocal em duas tentativas: a reserva do Worker impede a mesma mensagem sair duas vezes.
    if (!irParaConversa_.id) irParaConversa_.id = idLocal_();
    b.disabled = true;
    const r = await worker_('/msg/iniciar', 'POST', { canal, destino, texto, idLocal: irParaConversa_.id });
    b.disabled = false;
    if (!r.ok) { aviso_(r.erro || 'Não foi possível abrir a conversa.'); return; }
    irParaConversa_.id = null;
    const id = Number(r.conversa);
    fecharGaveta_();
    if (canal !== 'todos' && canal !== self.canal) { document.querySelectorAll('#ms-abas .ms-aba').forEach((ab) => { if (ab.dataset.canal === canal) ab.click(); }); await new Promise((ok) => setTimeout(ok, 250)); }
    await carregarLista(true);
    if (id) { await desempilharEsperando_('ms-gaveta'); await abrirConversa(id); }
    if (r.enviada === false && canal !== 'instagram') aviso_('Conversa aberta, mas a mensagem não saiu. Confira a Conexão do WhatsApp.');
  }
  function abrirEquipe_(recarregar) {
    if (!podeFerramenta_('metricas') && !podeFerramenta_('acessar')) { aviso_('Seu acesso não permite ver a equipe.'); return; }
    const corpo = gaveta_('Equipe e atividade'); if (!corpo) return;
    if (!recarregar) propostaGaveta_('equipe-atividade', $('ms-nav')?.querySelector('[data-ms=menu-geral]'));
    const topo = el('div', 'ms-ag-pesquisa');
    [['1', 'Hoje'], ['7', '7 dias'], ['30', '30 dias']].forEach(([d, t]) => {
      const bt = botao('ms-btn' + (String(equipeFiltros_.dias) === d ? ' prim' : ''), t, 'equipe-periodo', { dias: d });
      topo.appendChild(bt);
    });
    corpo.appendChild(topo);
    const on = el('section', 'ms-mais-grupo'); on.appendChild(el('h4', '', 'Agora'));
    const listaOn = el('div', 'ms-eq-on'); listaOn.id = 'ms-eq-online'; on.appendChild(listaOn); corpo.appendChild(on);
    const resumo = el('section', 'ms-mais-grupo'); resumo.appendChild(el('h4', '', 'No período'));
    const tab = el('div', 'ms-eq-totais'); tab.id = 'ms-eq-totais'; resumo.appendChild(tab); corpo.appendChild(resumo);
    const hist = el('section', 'ms-mais-grupo'); hist.appendChild(el('h4', '', 'Ações'));
    const lista = el('div', 'ms-eq-hist'); lista.id = 'ms-eq-hist'; hist.appendChild(lista);
    const mais = botao('ms-btn', 'Ver mais', 'equipe-mais'); mais.id = 'ms-eq-mais'; hist.appendChild(mais); corpo.appendChild(hist);
    carregarEquipe_(false);
  }
  async function carregarEquipe_(mais) {
    if (equipeCarregando_) return;
    equipeCarregando_ = true;
    const dias = Number(equipeFiltros_.dias) || 7;
    const fim = new Date(), ini = new Date(Date.now() - (dias - 1) * 86400000);
    const iso = (d) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
    let q = '/msg/equipe?de=' + iso(ini) + '&ate=' + iso(fim) + (equipeFiltros_.usuario ? '&usuario=' + encodeURIComponent(equipeFiltros_.usuario) : '');
    if (mais && equipeProximo_) q += '&antes=' + equipeProximo_;
    const r = await worker_(q, 'GET');
    equipeCarregando_ = false;
    if (!r.ok) {
      const onde = $('ms-eq-hist'); if (onde) onde.textContent = r.erro || 'Não consegui carregar agora. Tente de novo.';
      return;
    }
    if (mais) equipeItens_ = equipeItens_.concat(r.atividades || []); else equipeItens_ = r.atividades || [];
    equipeProximo_ = r.proximo || 0;
    const on = $('ms-eq-online');
    if (on) {
      on.textContent = '';
      const pres = r.presencas || [];
      if (!pres.length) on.appendChild(el('p', 'ms-dica', 'Ninguém abriu Mensagens ainda. A presença aparece assim que alguém entra.'));
      pres.forEach((p) => {
        const l = el('div', 'ms-eq-linha' + (p.online ? ' on' : ''));
        l.appendChild(el('span', 'ms-eq-bola')); l.appendChild(el('b', '', p.nome || 'Sem nome'));
        l.appendChild(el('span', 'ms-eq-quando', p.online ? 'agora' : 'aberto ' + quandoRotulo_(p.em)));
        on.appendChild(l);
      });
    }
    const tt = $('ms-eq-totais');
    if (tt) {
      tt.textContent = '';
      const tots = r.totais || [];
      if (!tots.length) tt.appendChild(el('p', 'ms-dica', 'Sem ações registradas neste período. A trilha começa nesta atualização.'));
      tots.forEach((t) => {
        const b = botao('ms-eq-pessoa' + (equipeFiltros_.usuario === t.usuario ? ' on' : ''), '', 'equipe-usuario', { usuario: t.usuario });
        b.appendChild(el('b', '', t.nome || t.usuario));
        b.appendChild(el('span', 'ms-eq-num', (t.respostas || 0) + ' respostas · ' + (t.encerramentos || 0) + ' encerramentos · ' + (t.acoes || 0) + ' ações'));
        tt.appendChild(b);
      });
    }
    const hist = $('ms-eq-hist');
    if (hist) {
      hist.textContent = '';
      if (!equipeItens_.length) hist.appendChild(el('p', 'ms-dica', 'Nenhuma ação no período escolhido.'));
      const nomes = { responder: 'respondeu', encerrar: 'encerrou', responsavel: 'dividiu atendimento', notas: 'anotou', etapa: 'mudou a etapa', ficha: 'atualizou a ficha', agendar: 'agendou', acompanhar: 'acompanhou', criar: 'abriu conversa', visualizar: 'abriu conversa', espiar: 'acompanhou sem responder', online: 'entrou em Mensagens' };
      equipeItens_.forEach((a) => {
        const l = el('div', 'ms-eq-linha');
        l.appendChild(el('b', '', a.nome || a.usuario));
        l.appendChild(el('span', '', ' ' + (nomes[a.acao] || a.acao) + (a.cliente ? ' · ' + a.cliente : '')));
        l.appendChild(el('span', 'ms-eq-quando', quandoRotulo_(a.em)));
        hist.appendChild(l);
      });
      const maisBt = $('ms-eq-mais'); if (maisBt) maisBt.hidden = !r.temMais;
    }
  }
  /* Presença: enquanto a pessoa está com Mensagens aberta, avisa o servidor a cada 45 s.
     É aproximada (2 minutos de validade) e existe só para a equipe se localizar. */
  let presencaTimer_ = 0;
  async function baterPresenca_() {
    if (!document.querySelector('#overlay-mensagens.aberto') || document.hidden) return;
    const r = await worker_('/msg/presenca', 'POST', { conversa: aberta ? aberta.id : 0, espiar: !!espiando }).catch(() => null);
    return r;
  }
  function ligarPresenca_() {
    if (presencaTimer_) return;
    baterPresenca_();
    presencaTimer_ = setInterval(() => { if (document.querySelector('#overlay-mensagens.aberto')) baterPresenca_(); else { clearInterval(presencaTimer_); presencaTimer_ = 0; } }, 45000);
  }
  window.addEventListener('tk:mensagens-sair', () => { clearInterval(presencaTimer_); presencaTimer_ = 0; });

  function ligarAoVivo() { lembrarSessao_(); pararAoVivo(); offline = false; espera = ESPERA_MS; atualizarVivo(); iniciarEventos_(); agendar(1200); ligarPresenca_(); }
  function pararAoVivo() { clearTimeout(timerLive); timerLive = null; if(eventosAoVivo_)eventosAoVivo_.parar(); }
  window.addEventListener('tk:sessao',()=>{if(eventosAoVivo_)eventosAoVivo_.sincronizar();});
  window.addEventListener('storage',e=>{if(e.key==='tm_session'&&eventosAoVivo_)eventosAoVivo_.sincronizar();});
  window.addEventListener('tk:mensagens-sair',pararAoVivo);
  function agendar(ms) { clearTimeout(timerLive); timerLive = setTimeout(sondar, ms == null ? (!offline&&eventosAoVivo_?.conectado()?30000:espera) : ms); }
  function atualizarVivo() { const v = $('ms-vivo'); if (!v) return; v.className = 'ms-ao-vivo' + (offline ? ' off' : ''); v.textContent = offline ? 'Sem conexão…' : '● ao vivo'; }
  let sondaEmCurso_ = null;
  function sondar(){if(sondaEmCurso_)return sondaEmCurso_;sondaEmCurso_=sondarDados_().finally(()=>{sondaEmCurso_=null;});return sondaEmCurso_;}
  async function sondarDados_() {
    const o = $('overlay-mensagens');
    if (!o || !o.classList.contains('aberto')) { pararAoVivo(); return; }
    if (document.hidden) { agendar(ESPERA_MAX_MS); return; }
    const aberturaDaSonda = abrindo;
    const ultId = ultIdSrv;
    const st = msgs.reduce((m, x) => (x.status_em && x.status_em > m ? x.status_em : m), '') || cursor;
    const q = '/msg/novidades?desde=' + encodeURIComponent(cursor || new Date(Date.now() - 60000).toISOString()) + ((nPoll++ % 10 === 0) ? '&cont=1' : '') + (aberta ? '&conversa=' + aberta.id + '&depois=' + ultId + '&st=' + encodeURIComponent(st) : '');
    const r = await worker_(q, 'GET');
    if (!r.ok) { offline = true; espera = Math.min(ESPERA_MAX_MS, espera * 2); atualizarVivo(); agendar(); return; }
    if(aberturaDaSonda!==abrindo){agendar();return;}
    if(cacheConversa&&aberta){await abrirConversa(aberta.id,espiando);agendar();return;}
    if (offline) { offline = false; atualizarVivo(); }
    espera = ESPERA_MS; cursor = r.cursor || cursor;
    r.mensagens.forEach((m) => { if (typeof m.id === 'number' && m.id > ultIdSrv) ultIdSrv = m.id; });
    if (r.saude) pintarSaude_(r.saude);
    contagens = r.contagens || contagens; desenharAbas(); desenharFiltros(); selarBotao();
    if (r.conversas.some((c) => canal === 'todos' || c.canal === canal)) await carregarLista(false);
    if(aberturaDaSonda!==abrindo){agendar();return;}
    if (aberta) {
      if(Array.isArray(r.agendadas)){agendadas_=r.agendadas;desenharFaixaAgenda_();}
      if(Object.hasOwn(r,'acompanhamento')){
        const mudouAcompanhamento=JSON.stringify(acompanhamento_)!==JSON.stringify(r.acompanhamento);
        acompanhamento_=r.acompanhamento;pintarAcompanhamento_();
        if(mudouAcompanhamento)await recarregarAgenda_(aberta.id);
        if(aberturaDaSonda!==abrindo){agendar();return;}
      }
      if (Array.isArray(r.notas) && sincronizarNotas_(r.notas)) pintarFio(false);
      const mudou = r.conversas.find((c) => c.id === aberta.id); if (mudou) aberta = Object.assign({}, aberta, mudou, { nao_lidas: aberta.nao_lidas });
      const fio = $('ms-fio'), novas = r.mensagens.filter((m) => !msgs.some((x) => x.id === m.id));
      const mudancas = r.mensagens.filter((m) => msgs.some((x) => x.id === m.id && Object.keys(m).some(k=>x[k]!==m[k])));
      if (novas.length || mudancas.length) {
        const noFim = !fio || perto_(fio, 90), entradas = novas.filter((m) => m.direcao === 'entrada').length;
        mudancas.forEach((m) => { const x = msgs.find((y) => y.id === m.id); if (x) Object.assign(x,m); });
        // uma mensagem nossa que acabou de voltar pelo servidor substitui a "enviando…" (mesmo texto) sem duplicar
        novas.forEach((m) => { if (m.direcao === 'saida') { const i = msgs.findIndex((x) => typeof x.id === 'string' && x.msg === undefined && x.texto === m.texto && x.tipo === m.tipo && x.status === 'pendente'); if (i >= 0) { pendentes.delete(msgs[i].id); msgs.splice(i, 1); } } });
        msgs = msgs.concat(novas);
        if (!noFim && entradas) novasAbaixo += entradas;
        pintarFio(noFim);
        if(APP_RECENTES&&!cacheConversa) await recentes_('/msg/mensagens?conversa='+aberta.id,{ok:true,conversa:aberta,mensagens:msgs.filter(m=>typeof m.id==='number')});
        if(aberturaDaSonda!==abrindo){agendar();return;}
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
    largarFunil_(); painel = 'metricas'; const ex = $('ms-extra'), ul = $('ms-lista'); ul.hidden = true; ex.textContent = 'Carregando…'; chrome_(true);
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
  function chrome_(esconder) { ['ms-filtros', 'ms-pesquisa', 'ms-estado-wrap','ms-intro'].forEach((id) => { const e = $(id); if (e) e.hidden = esconder; }); }
  function fecharPainel() { if (painel === 'funil') sairFunil_(); painel = ''; chrome_(false); const ul = $('ms-lista'); if (ul) ul.hidden = false; pintarLista(); }

  /* ---------- v7.40.15: funil de vendas ----------
   * Colunas = etiquetas de venda (as que a equipe mantém em Etiquetas, na mesma ordem); cartão = uma pessoa.
   * Mover o cartão troca só a etapa da venda da pessoa (as outras etiquetas ficam). Celular: tocar no cartão abre "Mover para…" e "Abrir conversa".
   * Computador: arrastar e soltar entre colunas, ou clicar/Enter no cartão para o mesmo menu (teclado). Dados entram só por textContent. */
  let funil_ = [], funilSeq_ = 0;
  const funilMapa_ = new Map();
  const arrastavel_ = () => larga() && window.matchMedia('(pointer: fine)').matches;
  const haQuanto_ = (iso) => { const e = espera_(iso); return !e ? '' : e === 'agora' ? 'agora' : 'há ' + e; };
  function sairFunil_() { const b = $('ms-funil'); if (b) { b.hidden = true; b.textContent = ''; } const ex = $('ms-extra'); if (ex) ex.hidden = false; const app = $('ms-app'); if (app) delete app.dataset.painel; funilMapa_.clear(); funilSeq_++; }
  /** Sai do funil sem esperar o "voltar" (outra tela do menu tomou o lugar). */
  function largarFunil_() { if (painel !== 'funil') return; sairFunil_(); painel = ''; if (window.TKCamadas && TKCamadas.aberta('ms-funil')) TKCamadas.desempilhar('ms-funil'); }
  function desempilharEsperando_(chave) {
    return new Promise((res) => {
      if (!(window.TKCamadas && TKCamadas.aberta(chave))) { res(); return; }
      let feito = false; const fim = () => { if (feito) return; feito = true; document.removeEventListener('tk:camada-fechada', f); res(); };
      const f = (e) => { if (e.detail && e.detail.chave === chave) fim(); };
      document.addEventListener('tk:camada-fechada', f); TKCamadas.desempilhar(chave); setTimeout(fim, 700);
    });
  }
  function caixaFunil_() {
    let box = $('ms-funil'); if (box) return box;
    box = el('div', 'ms-funil'); box.id = 'ms-funil'; box.hidden = true; $('ms-lista-wrap').appendChild(box);
    box.addEventListener('dragstart', (ev) => { const c = ev.target.closest && ev.target.closest('.ms-fcard'); if (!c) return; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', 'tk-funil:' + c.dataset.id); c.classList.add('arrastando'); });
    box.addEventListener('dragend', () => { box.querySelectorAll('.arrastando, .alvo').forEach((x) => x.classList.remove('arrastando', 'alvo')); });
    box.addEventListener('dragover', (ev) => { const col = ev.target.closest && ev.target.closest('.ms-fcol'); if (!col || !box.querySelector('.ms-fcard.arrastando')) return; ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; box.querySelectorAll('.ms-fcol.alvo').forEach((x) => { if (x !== col) x.classList.remove('alvo'); }); col.classList.add('alvo'); });
    box.addEventListener('dragleave', (ev) => { const col = ev.target.closest && ev.target.closest('.ms-fcol'); if (col && !col.contains(ev.relatedTarget)) col.classList.remove('alvo'); });
    box.addEventListener('drop', (ev) => {
      const col = ev.target.closest && ev.target.closest('.ms-fcol'); if (!col) return; ev.preventDefault(); col.classList.remove('alvo');
      const m = /^tk-funil:(\d+)$/.exec(ev.dataTransfer.getData('text/plain') || ''); if (m) moverFunil_(Number(m[1]), Number(col.dataset.etq));
    });
    box.addEventListener('scroll', () => posFunil_(), { passive: true, capture: true });
    return box;
  }
  /** Celular: setas ‹ › ligadas conforme a coluna (a primeira não volta, a última não avança) e marca a coluna à mostra. */
  function posFunil_() {
    const q = $('ms-fq'); if (!q || !q.firstElementChild) return;
    const w = q.firstElementChild.getBoundingClientRect().width + 8, i = Math.max(0, Math.min(funil_.length - 1, Math.round(q.scrollLeft / (w || 1))));
    q.querySelectorAll('.ms-fcol').forEach((c, k) => { c.querySelectorAll('.ms-fir').forEach((b) => { b.disabled = b.dataset.dir === '-1' ? k === 0 : k === funil_.length - 1; }); c.toggleAttribute('data-visivel', k === i); });
  }
  function irColuna_(b) {
    const q = $('ms-fq'), col = b.closest('.ms-fcol'), alvo = col && (b.dataset.dir === '1' ? col.nextElementSibling : col.previousElementSibling);
    if (!q || !alvo) return;
    q.scrollTo({ left: alvo.offsetLeft - q.firstElementChild.offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const h4 = alvo.querySelector('h4'); if (h4) setTimeout(() => h4.focus({ preventScroll: true }), 260);
  }
  function cartaoFunil_(c, arr) {
    const li = el('li'), b = botao('ms-fcard', '', 'funil-cartao', { id: String(c.conversa) }); b.setAttribute('aria-haspopup', 'dialog');
    if (arr) b.draggable = true;
    const l1 = el('span', 'ms-fcard-l1'); l1.appendChild(el('span', 'ms-fcard-nome', rotuloContato(c)));
    const tm = el('time', '', haQuanto_(c.ultima_em)); if (c.ultima_em) tm.dateTime = c.ultima_em; l1.appendChild(tm); b.appendChild(l1);
    if (c.previa) b.appendChild(el('span', 'ms-fcard-prev', c.previa));
    b.appendChild(el('span', 'ms-fcard-meta', (NOME_CANAL[c.canal] || c.canal) + (c.dono ? ' · Responsável: ' + c.dono : ' · Sem responsável')));
    li.appendChild(b); return li;
  }
  async function abrirFunil_(focoId) {
    fecharMenu(); const g0 = $('ms-gaveta'); if (g0) { g0.remove(); await desempilharEsperando_('ms-gaveta'); }
    if (painel === 'metricas') { const ex0 = $('ms-extra'); if (ex0) ex0.textContent = ''; }
    const novo = painel !== 'funil'; painel = 'funil'; chrome_(true);
    const ul = $('ms-lista'), ex = $('ms-extra'), app = $('ms-app'), box = caixaFunil_(); ul.hidden = true; ex.hidden = true; app.dataset.painel = 'funil'; box.hidden = false;
    if (novo && window.TKCamadas && !TKCamadas.aberta('ms-funil')) TKCamadas.empilhar('ms-funil', () => { if (painel === 'funil') fecharPainel(); });
    const q0 = $('ms-fq'), sx = q0 && !novo ? q0.scrollLeft : 0;
    if (novo || !q0) { box.textContent = ''; const t = el('div', 'ms-linha'); t.appendChild(botao('ms-btn', '← Conversas', 'fechar-painel')); box.appendChild(t); box.appendChild(el('p', 'ms-vazio', 'Carregando o funil…')); }
    const mine = ++funilSeq_, c0 = canal;
    const r = await worker_('/msg/funil?canal=' + encodeURIComponent(canal), 'GET');
    if (mine !== funilSeq_ || painel !== 'funil' || c0 !== canal) return;
    box.textContent = ''; funilMapa_.clear();
    const topo = el('div', 'ms-linha'); topo.appendChild(botao('ms-btn', '← Conversas', 'fechar-painel')); topo.appendChild(botao('ms-chip', 'Atualizar', 'funil-atualizar')); box.appendChild(topo);
    const h = el('h3', '', 'Funil de vendas · ' + (canal === 'todos' ? 'Todas' : NOME_CANAL[canal])); h.id = 'ms-ftitulo'; box.appendChild(h);
    if (!r.ok) { funil_ = []; box.appendChild(el('p', 'ms-vazio', r.erro || 'Não foi possível carregar o funil agora. Tente de novo.')); return; }
    funil_ = r.colunas || [];
    if (!funil_.length) { box.appendChild(el('p', 'ms-vazio', 'Nenhuma etiqueta de venda ativa. As etapas do funil são as etiquetas de venda (Novo cliente, Reserva…).')); return; }
    const arr = arrastavel_();
    box.appendChild(el('p', 'ms-fdica', arr ? 'Arraste o cartão para outra coluna, ou clique nele para mover ou abrir a conversa.' : 'Toque num cartão para mudar a etapa ou abrir a conversa. Deslize para o lado para ver as outras etapas.'));
    const q = el('div', 'ms-fq'); q.id = 'ms-fq'; q.setAttribute('role', 'region'); q.setAttribute('aria-labelledby', 'ms-ftitulo');
    funil_.forEach((col, k) => {
      const e = col.etiqueta, sec = el('section', 'ms-fcol'); sec.dataset.etq = String(e.id); sec.setAttribute('aria-labelledby', 'ms-fcol-' + e.id);
      const cab = el('div', 'ms-fcol-cab'); const h4 = el('h4', '', e.nome); h4.id = 'ms-fcol-' + e.id; h4.tabIndex = -1;
      const tot = el('span', 'ms-ftot', String(col.total)); tot.title = col.total + (col.total === 1 ? ' pessoa' : ' pessoas');
      const ant = botao('ms-fir', '‹', 'funil-ir', { dir: '-1' }); ant.setAttribute('aria-label', 'Etapa anterior');
      const prox = botao('ms-fir', '›', 'funil-ir', { dir: '1' }); prox.setAttribute('aria-label', 'Próxima etapa');
      const pos = el('span', 'ms-fpos', (k + 1) + ' de ' + funil_.length);
      cab.append(pontoEtq_(e), h4, tot, pos, ant, prox); sec.appendChild(cab);
      const ulc = el('ul', 'ms-fcards');
      col.cartoes.forEach((c) => { funilMapa_.set(c.conversa, { c: c, etq: e.id }); ulc.appendChild(cartaoFunil_(c, arr)); });
      if (col.cartoes.length) sec.appendChild(ulc);
      else sec.appendChild(el('p', 'ms-fcol-vazio', 'Ninguém nesta etapa.'));
      if (col.total > col.cartoes.length) sec.appendChild(el('p', 'ms-fcol-mais', 'Mostrando as ' + col.cartoes.length + ' mais recentes de ' + col.total + '.'));
      q.appendChild(sec);
    });
    box.appendChild(q);
    if (sx) q.scrollLeft = sx;
    posFunil_();
    if (focoId) { const f = q.querySelector('.ms-fcard[data-id="' + Number(focoId) + '"]'); if (f) f.focus({ preventScroll: true }); else { const v = q.querySelector('.ms-fcol[data-visivel] h4') || q.querySelector('h4'); if (v) v.focus({ preventScroll: true }); } }
    else if (novo) { const b0 = box.querySelector('[data-ms=fechar-painel]'); if (b0 && larga()) b0.focus(); }
  }
  function opcoesFunil_(id) {
    const k = funilMapa_.get(id); if (!k) return;
    const nome = rotuloContato(k.c), atual = funil_.find((col) => col.etiqueta.id === k.etq);
    const corpo = gaveta_(nome); if (!corpo) return;
    corpo.appendChild(el('p', 'ms-fop-info', 'Agora em ' + (atual ? atual.etiqueta.nome : '—') + ' · ' + (NOME_CANAL[k.c.canal] || k.c.canal)));
    corpo.appendChild(el('p', 'ms-etq-rot', 'Mover para'));
    funil_.forEach((col) => {
      const e = col.etiqueta, eu = e.id === k.etq;
      const b = botao('ms-fop', '', eu ? '' : 'funil-mover', { id: String(id), etq: String(e.id) });
      b.append(pontoEtq_(e), document.createTextNode(e.nome));
      if (eu) { b.setAttribute('aria-current', 'true'); b.setAttribute('aria-disabled', 'true'); b.appendChild(el('small', '', 'etapa atual')); }
      else b.setAttribute('aria-label', 'Mover para ' + e.nome);
      corpo.appendChild(b);
    });
    const pe = el('div', 'ms-fpe');
    pe.append(botao('ms-btn', 'Tirar do funil', 'funil-mover', { id: String(id), etq: '0' }), botao('ms-btn prim', 'Abrir conversa', 'funil-abrir', { id: String(id) }));
    corpo.appendChild(pe);
  }
  async function moverFunil_(id, etq, botaoEl) {
    const k = funilMapa_.get(id); if (!k || k.etq === etq) return;
    if (botaoEl) botaoEl.disabled = true;
    const r = await worker_('/msg/funil/mover', 'POST', { conversa: id, etiqueta: etq });
    if (botaoEl) botaoEl.disabled = false;
    if (!r.ok) { aviso_(r.erro || 'Não consegui mudar a etapa. Tente de novo.'); return; }
    const nome = rotuloContato(k.c), dest = funil_.find((col) => col.etiqueta.id === etq);
    if (aberta && aberta.id === id) { aberta.etiquetas = r.etiquetas || []; const fx = $('ms-etq-faixa'); if (fx) fx.replaceWith(faixaEtq_(aberta)); }
    lista.forEach((c) => { if (c.id === id) c.etiquetas = r.etiquetas || []; });
    ETQ = null;
    const g = $('ms-gaveta'); if (g) { g.remove(); await desempilharEsperando_('ms-gaveta'); }
    aviso_(etq ? nome + ' agora está em ' + (dest ? dest.etiqueta.nome : 'outra etapa') + '.' : nome + ' saiu do funil.');
    if (painel === 'funil') await abrirFunil_(id);
  }
  async function abrirDoFunil_(id) {
    const g = $('ms-gaveta'); if (g) { g.remove(); await desempilharEsperando_('ms-gaveta'); }
    await desempilharEsperando_('ms-funil');
    if (painel === 'funil') fecharPainel();
    abrirConversa(id);
  }

  /* ---------- cliques ---------- */
  async function clique(ev) {
    if (ev.target && ev.target.id === 'ms-luz') { fecharLuz_(); return; }
    const b = ev.target.closest('[data-ms]'); if (!b) return;
    const a = b.dataset.ms;
    if($('ms-gaveta')?.dataset.tipo==='ficha'&&!b.closest('#ms-gaveta')&&fichaMudou_()){if(!sairFicha_())return;fichaOrig_=null;}
    if($('ms-gaveta')?.dataset.tipo==='mais'&&a!=='gaveta-fechar'){$('ms-gaveta').remove();await desempilharEsperando_('ms-gaveta');}
    const recurso = recursoAcao_(a); if (recurso && !podeFerramenta_(recurso)) { aviso_('Seu acesso não permite usar esta ferramenta.'); return; }
    if (a !== 'menu-geral' && a !== 'menu-conversa') fecharMenu();
    if (painel === 'funil' && (a === 'leitura-cfg' || a === 'selecionar')) { largarFunil_(); chrome_(false); const ul0 = $('ms-lista'); if (ul0) ul0.hidden = false; pintarLista(); }
    if (painel === 'funil' && a === 'atualizar') { abrirFunil_(); return; }
    if (a === 'fechar') {
      if (trabalho && !confirm('A operação dos contatos ainda está em andamento. Se fechar agora, ela para e precisa recomeçar. Fechar mesmo assim?')) return;
      if (painel === 'funil') { const g0 = $('ms-gaveta'); if (g0) { g0.remove(); await desempilharEsperando_('ms-gaveta'); } await desempilharEsperando_('ms-funil'); if (painel === 'funil') fecharPainel(); }   // v7.40.15
      if (window.TKCamadas && TKCamadas.aberta('ms-conversa')) { document.addEventListener('tk:camada-fechada', function f(e) { if (e.detail && e.detail.chave === 'ms-conversa') { document.removeEventListener('tk:camada-fechada', f); fecharComHistorico_('overlay-mensagens'); } }); TKCamadas.desempilhar('ms-conversa'); }
      else fecharComHistorico_('overlay-mensagens');
    }
    else if(a==='fila-atendimento'){filaAtendimento_=b.dataset.fila;escopoAtendimento_='todos';filtro='';tipos={msg:true,grp:false};selecao=null;desenharSelbar_();desenharFiltros();await carregarLista(true);}
    else if (a === 'aba') { const eraFunil = painel === 'funil'; selecao = null; desenharSelbar_(); contVista = null; contTipos = null; canal = b.dataset.canal; filtro = ''; etqFiltro = 0; busca = ''; $('ms-busca').value = ''; aberta = null; msgs = []; elMsgs.clear(); limparBlobs_(); limparAnexo_(true); $('ms-conversa').textContent = ''; $('ms-conversa').appendChild(vazioConversa_()); fecharPainelSilencioso(); lista = []; elConvs.forEach((li) => li.remove()); elConvs.clear(); desenharAbas(); desenharFiltros(); desenharEstado(); if (eraFunil) { chrome_(true); abrirFunil_(); } else { $('ms-extra').textContent = 'Carregando conversas…'; } await carregarLista(true); }
    else if(a==='filtros-abrir')abrirFiltros_();
    else if(a==='filtros-aplicar'||a==='filtros-limpar'){
      const g=$('ms-gaveta');if(!g)return;
      if(a==='filtros-limpar'){tipos={msg:true,grp:false};filtro='';etqFiltro=0;}
      else{if(canal!=='instagram'){const ts=[...g.querySelectorAll('[name=ms-ft-tipo]:checked')].map(x=>x.value);if(!ts.length){aviso_('Escolha mensagens individuais ou grupos.');return;}tipos={msg:ts.includes('msg'),grp:ts.includes('grp')};}filtro=g.querySelector('[name=ms-ft-fila]')?.value||'';etqFiltro=Number(g.querySelector('[name=ms-ft-etapa]')?.value||0);}
      fecharGaveta_();fecharPainel();desenharFiltros();await carregarLista(true);
    }
    else if(a==='fila'||a==='inicio'||a==='inicio-notas'){
      if($('ms-gaveta'))fecharGaveta_();if(painel==='funil'){await desempilharEsperando_('ms-funil');if(painel==='funil')fecharPainel();}else fecharPainel();
      filtro=a==='inicio-notas'?'com_notas':a==='inicio'?'':b.dataset.filtro;selecao=null;desenharSelbar_();desenharFiltros();await carregarLista(true);
    }
    else if (a === 'tipo') {
      const k = b.dataset.tipo, outro = k === 'msg' ? 'grp' : 'msg';
      if (tipos[k] && !tipos[outro]) { tipos[k] = false; tipos[outro] = true; } else tipos[k] = !tipos[k];       // desligar o único ligado = mostrar o outro (nunca fica tudo desligado)
      if (!tipos.msg && filtro === 'ambos') filtro = '';
      if (selecao) { selecao.clear(); desenharSelbar_(); }
      fecharPainelSilencioso(); desenharFiltros(); await carregarLista(true);
    }
    else if (a === 'etq') { const id = Number(b.dataset.id); etqFiltro = etqFiltro === id ? 0 : id; desenharFiltros(); await carregarLista(true); }
    else if (a === 'etiquetas') { etqDaFicha_ = false; if(!ETQ)await carregarEtiquetas_(); abrirEtiquetas_(); }
    else if (a === 'ficha') { fecharMenu(); abrirFicha_(); }   // v7.40.14
    else if (a === 'ficha-salvar') await salvarFicha_(b);
    else if (a === 'ficha-etiquetas') { if (!sairFicha_()) return; etqDaFicha_ = true; if (!ETQ || !ETQ.length) await carregarEtiquetas_(); abrirEtiquetas_(); }
    else if (a === 'ficha-abrir') { if (!sairFicha_()) return; fecharGaveta_(); if (canal !== 'todos') { canal = b.dataset.canal; filtro = ''; desenharAbas(); desenharFiltros(); desenharEstado(); await carregarLista(true); } abrirConversa(Number(b.dataset.id)); }
    else if (a === 'assumir' || a === 'liberar') { const c = aberta; if (!c) return; const r = await worker_('/msg/dono', 'POST', { conversa: c.id, assumir: a === 'assumir' }); if (!r.ok) { aviso_(r.erro || 'Não foi possível agora.'); return; } c.dono = r.dono; const fx = $('ms-etq-faixa'); if (fx) fx.replaceWith(faixaEtq_(c)); await carregarLista(false); }
    else if (a === 'etq-salvar') salvarEtiquetas_();
    else if (a === 'etq-sem-etapa') { const g = $('ms-gaveta'); if (g) g.querySelectorAll('input[name=ms-etq-venda]').forEach((i) => { i.checked = false; }); }
    else if (a === 'filtro') { filtro = filtro === b.dataset.filtro ? '' : b.dataset.filtro; if (selecao) { selecao.clear(); desenharSelbar_(); } fecharPainelSilencioso(); desenharFiltros(); await carregarLista(true); }
    else if (a === 'abrir') { if (toqueLongo) { toqueLongo = false; return; } if (selecao) { const id = Number(b.dataset.id); if (selecao.has(id)) selecao.delete(id); else selecao.add(id); pintarLista(); desenharSelbar_(); } else abrirConversa(Number(b.dataset.id), filaAtendimento_ === 'esperando'); }
    else if (a === 'selecionar') iniciarSelecao_(0);
    else if (a === 'nome-editar') editarAssinatura_();
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
    else if(a==='entrada-reprocessar'){
      b.disabled=true;
      try{const r=await worker_('/msg/entrada/reprocessar','POST',{});const texto=$('ms-saude')?.querySelector('span');if(texto)texto.textContent=r.ok?'Nova tentativa iniciada.':r.erro||'Não consegui iniciar. Tente novamente.';}
      finally{if(b.isConnected)b.disabled=false;}
    }
    else if (a === 'gaveta-produtos') abrirProdutos_();
    else if (a === 'gaveta-respostas') abrirRespostas_(false);
    else if (a === 'notas-abrir') await abrirNotas_();
    else if (a === 'modo-nota') alternarNota_();
    else if (a === 'gaveta-fechar') { if(!sairFicha_())return;fichaOrig_=null;fecharGaveta_(); const t = $('ms-texto'); if (t) t.focus(); }
    else if (a === 'resp-editar') abrirRespostas_(true);
    else if (a === 'resp-usar') { const r = respostas_()[Number(b.dataset.i)]; if (r) colocarResposta_(r.x); }
    else if (a === 'auto-cfg') abrirAuto_();
    else if (a === 'agenda-painel') { fecharMenu(); abrirPainelAgenda_(); }
    else if (a === 'nova-conversa') { fecharMenu(); abrirNovaConversa_(); }
    else if (a === 'equipe-atividade') { fecharMenu(); abrirEquipe_(); }
    else if (a === 'nova-conversa-ir') await irParaConversa_(b);
    else if (a === 'equipe-periodo') { equipeFiltros_.dias = Number(b.dataset.dias) || 7; abrirEquipe_(true); }
    else if (a === 'equipe-usuario') { const u = b.dataset.usuario || ''; equipeFiltros_.usuario = equipeFiltros_.usuario === u ? '' : u; abrirEquipe_(true); }
    else if (a === 'equipe-mais') await carregarEquipe_(true);
    else if (a === 'agenda-conversa') { const id=Number(b.dataset.id);$('ms-gaveta')?.remove();await desempilharEsperando_('ms-gaveta');await abrirConversa(id); }
    else if (a === 'agenda-opcoes') { fecharMenu(); abrirAgendarOpcoes_(); }
    else if (a === 'agenda-abrir') { fecharMenu(); abrirAgenda_(); }
    else if (a === 'agenda-atalho') { agendaAtalho_ = b.dataset.k; agendaQuando_ = atalhoMs_(agendaAtalho_); marcarAgenda_(); aviso_(''); }
    else if (a === 'agenda-salvar') await salvarAgenda_(b);
    else if (a === 'agenda-cancelar') await cancelarAgenda_(b);
    else if (a === 'auto-salvar') await salvarAuto_(b);
    else if (a === 'auto-feriado-add') { const di = $('ms-auto-data'), v = di ? di.value : ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { aviso_('Escolha a data do feriado.'); if (di) di.focus(); } else if (autoEdit_) { if (autoEdit_.feriados.indexOf(v) < 0) autoEdit_.feriados = autoEdit_.feriados.concat(v).sort(); desenharAuto_(); const d2 = $('ms-auto-data'); if (d2) d2.focus(); aviso_('Feriado incluído. Toque em Salvar para valer.'); } }
    else if (a === 'auto-feriado-tirar' && autoEdit_) { autoEdit_.feriados = autoEdit_.feriados.filter((d) => d !== b.dataset.d); desenharAuto_(); const d2 = $('ms-auto-data'); if (d2) d2.focus(); aviso_('Feriado retirado. Toque em Salvar para valer.'); }
    else if (a === 'prod-marcar') marcarProduto_(b);
    else if (a === 'prodsel-limpar') { prodSel = []; Array.prototype.forEach.call(document.querySelectorAll('#ms-prod-lista .ms-prod-marca'), (m) => { m.setAttribute('aria-pressed', 'false'); m.querySelector('.ms-prod-caixa').textContent = ''; m.closest('.ms-prod').classList.remove('marcado'); }); desenharSelProd_(); const q = $('ms-prod-busca'); if (q) q.focus(); }
    else if (a === 'prodsel-usar') { const ps = produtosSelecionados_(); if (ps.length) { prodSel = []; colocarNaMensagem_(textoSelecao_(ps)); } }
    else if (a === 'prodsel-link') { const ps = produtosSelecionados_(); if (ps.length) { try { await navigator.clipboard.writeText(linkSelecao_(ps)); aviso_('Link da seleção copiado.'); } catch (e) { aviso_('Não consegui copiar. Use “Enviar seleção”.'); } } }
    else if (a === 'prod-editar') { const p = produtoPorId_(b.dataset.id); if (p) abrirEdicaoRapidaProduto_(p); }
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
    else if (a === 'pessoa') { if (aberta && !aberta.grupo && sairFicha_()) { if ($('ms-gaveta')) fecharGaveta_(); editarPessoa_(aberta.id); } }
    else if (a === 'espiar') abrirConversa(Number(b.dataset.id), true);
    else if (a === 'atender' && aberta) { espiando = false; aberta.nao_lidas = Math.max(1, aberta.nao_lidas || 0); montarConversa(aberta); pintarFio(true); marcarLida(); const t = $('ms-texto'); if (t) t.focus(); }
    else if (a === 'leitura-cfg') { painel = painel === 'leitura' ? '' : 'leitura'; if (painel === 'leitura') { cfgLeitura = null; contatosSit = null; } desenharEstado(); }
    else if (a === 'abrir-canal') { canal = b.dataset.canal; fecharPainelSilencioso(); filtro = ''; desenharAbas(); desenharFiltros(); desenharEstado(); await carregarLista(true); abrirConversa(Number(b.dataset.id)); }
    else if (a === 'voltar') voltarLista();
    else if (a === 'enviar') enviar();
    else if (a === 'anexar') { const i = $('ms-arquivo'); if (i) i.click(); }
    else if (a === 'anexo-tirar') limparAnexo_(true);
    else if (a === 'anexar-audio') {if(espiando||cacheConversa){aviso_('Toque em Atender e aguarde a conversa atualizar antes de anexar.');return;}const i=$('ms-arquivo-audio');if(i)i.click();}
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
    else if (a === 'menu-geral') abrirMais_();
    else if (a === 'menu-conversa' && aberta) abrirMenu(b, [...(aberta.grupo ? [] : [['Ficha do cliente…', 'ficha']]), ['Agendar mensagem…', 'agenda-abrir'], ['Enviar áudio de arquivo', 'anexar-audio'], '-', ['Copiar conversa para IA', 'copiar-ia'], ['Exportar esta conversa (TXT)', 'exp', { params: 'formato=txt&conversa=' + aberta.id, rotulo: 'a conversa' }], ['Exportar esta conversa (CSV)', 'exp', { params: 'formato=csv&conversa=' + aberta.id, rotulo: 'a conversa' }], '-', ['Marcar como não lida', 'nao-lida'], aberta.encerrada_em ? ['Reabrir conversa', 'reabrir'] : ['Encerrar conversa', 'encerrar']]);
    else if (a === 'exp') baixar(b.dataset.params, b.dataset.rotulo);
    else if (a === 'copiar-ia') copiarParaIA();
    else if (a === 'painel') abrirPainel(30);
    else if (a === 'painel-dias') abrirPainel(Number(b.dataset.dias));
    else if (a === 'fechar-painel') { if (painel === 'funil' && window.TKCamadas && TKCamadas.aberta('ms-funil')) TKCamadas.desempilhar('ms-funil'); else fecharPainel(); }
    else if (a === 'funil' || a === 'funil-atualizar') { await abrirFunil_();desenharFiltros(); }   // v7.40.15
    else if (a === 'funil-cartao') opcoesFunil_(Number(b.dataset.id));
    else if (a === 'funil-mover') await moverFunil_(Number(b.dataset.id), Number(b.dataset.etq), b);
    else if (a === 'funil-abrir') await abrirDoFunil_(Number(b.dataset.id));
    else if (a === 'funil-ir') irColuna_(b);
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
    carregarCfgLeitura_();
    resumo = await worker_('/msg/resumo', 'GET');
    if (!resumo.ok) { const ex = $('ms-extra'); ex.textContent = ''; ex.appendChild(el('p', 'ms-vazio', resumo.erro || 'Não foi possível carregar agora.')); return; }
    // perfil carregado em paralelo com o resumo
    if (!contagens) contagens = {};
    CANAIS.forEach(([id]) => { const c = resumo.canais[id]; contagens[id] = Object.assign({ grupos: 0, sem_resposta: c.semResposta || 0 }, contagens[id] || {}, { conversas: c.conversas, nao_lidas: c.naoLidas || 0, sem_resposta: c.semResposta || 0 }); });
    desenharAbas(); desenharFiltros(); desenharEstado(); selarBotao(); if(listaEmCurso) await listaEmCurso;else await carregarLista(true);
  }
  async function abrir() {
    montar(); abrirComHistorico_('overlay-mensagens');
    escopoAtendimento_='todos';vista = 'lista'; $('ms-app').dataset.vista = 'lista'; ajustarViewport();
    $('ms-extra').textContent = 'Carregando…';
    await recarregar(); ligarAoVivo();
    const f = $('ms-fechar'); if (f && larga()) f.focus();
  }
  let atualizacaoImediata_ = false;
  async function atualizarAgora_(){if(atualizacaoImediata_||!podeGerir()||!$('overlay-mensagens')?.classList.contains('aberto'))return;atualizacaoImediata_=true;clearTimeout(timerLive);try{await carregarLista(false);await sondar();}finally{atualizacaoImediata_=false;}}
  window.addEventListener('focus',atualizarAgora_);document.addEventListener('visibilitychange',()=>{if(!document.hidden)atualizarAgora_();});
  if(new URLSearchParams(location.search).get('app')==='mensagens')window.TKMensagensApp={atualizar:atualizarAgora_,voltar:voltarApp_,abrirConversa:function(id,espiar){if(podeGerir()&&Number.isSafeInteger(id)&&id>0)return abrirConversa(id,espiar===true);}};
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { const o = $('overlay-mensagens'); if (o && o.classList.contains('aberto')) { espera = ESPERA_MS; agendar(300); } else sondarSelo(); } });
  (function init() {
    const botao_ = $('btn-abrir-mensagens'); if (!botao_) return;
    botao_.hidden = false;
    botao_.addEventListener('click', () => { if (!podeGerir()) { alert('Sua conta não tem acesso a Mensagens.'); return; } abrir(); });
    timerSelo = setTimeout(sondarSelo, 4000);
    const obs = new MutationObserver(() => { const o = $('overlay-mensagens'); if (o && !o.classList.contains('aberto')) { pararAoVivo(); fecharMenu(); } });
    const espiar = () => { const o = $('overlay-mensagens'); if (o) obs.observe(o, { attributes: true, attributeFilter: ['class'] }); };
    botao_.addEventListener('click', () => setTimeout(espiar, 50));
  })();
})();
