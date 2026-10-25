/* ====================================================================
 * TENKiTER — admin-mensagens.js (v1.0) — DASHBOARD DE MENSAGENS (Admin total)
 *  • Mostra as conversas que o servidor (Worker tenkiter-ig) passou a GUARDAR, separadas por canal:
 *    Instagram, WhatsApp 1 e WhatsApp 2. Só guarda o que chega depois de ligado; não busca histórico.
 *  • "Ligar gravação" aponta o recebimento de mensagens da instância Wafly para o Worker (ação do Admin, com confirmação).
 *  • Todo texto vindo das conversas entra na tela por textContent (nunca innerHTML).
 * ==================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CANAIS = [['whatsapp1', 'WhatsApp 1'], ['whatsapp2', 'WhatsApp 2'], ['instagram', 'Instagram']];
  let canal = 'whatsapp1', resumo = null, conversaAberta = null, busca = '', timerBusca = null;

  async function worker_(caminho, metodo, corpo) {
    const s = (typeof getSessao === 'function' && getSessao()) || null;
    if (!s || typeof INSTAGRAM_URL === 'undefined') return { ok: false, erro: 'Entre com o seu login (não vale só o PIN) para ver as mensagens.' };
    try {
      const r = await fetch(INSTAGRAM_URL + caminho, { method: metodo, headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
      return await r.json();
    } catch (e) { return { ok: false, erro: 'Sem conexão agora. Tente de novo.' }; }
  }
  function podeGerir() {
    try { return typeof temPermissao === 'function' && typeof usuarioAdmin !== 'undefined' && !!usuarioAdmin && !!temPermissao(usuarioAdmin, 'gerir_acessos'); } catch (e) { return false; }
  }
  function el(tag, cls, texto) { const e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e; }
  function hora(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    const hoje = new Date(), mesmoDia = d.toDateString() === hoje.toDateString();
    return mesmoDia ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function rotuloContato(c) {
    if (c.nome) return c.nome;
    const n = String(c.contato || '').replace(/-group$|@g\.us$|@s\.whatsapp\.net$/g, '');
    return /^\d{10,15}$/.test(n) ? '+' + n : (c.grupo ? 'Grupo ' + n : n);
  }

  function css() {
    if ($('ms-css')) return;
    const s = document.createElement('style'); s.id = 'ms-css';
    s.textContent = `
      .sheet-mensagens { max-width: 760px; height: 92vh; max-height: 92vh; }
      .ms-abas { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 10px; }
      .ms-aba { flex: 1 1 0; min-width: 96px; min-height: 44px; padding: 8px 10px; border: 1px solid #d5d5d5; border-radius: 10px; background: #fff; color: #222; font-weight: 700; font-size: 0.84rem; cursor: pointer; text-align: center; }
      .ms-aba small { display: block; font-weight: 500; color: #555; font-size: 0.74rem; }
      .ms-aba[aria-selected=true] { background: #0b5d63; color: #fff; border-color: #0b5d63; } .ms-aba[aria-selected=true] small { color: #d7eeee; }
      .ms-caixa { border: 1px solid #e3e3e3; border-radius: 12px; padding: 10px 12px; background: #fff; margin: 8px 0; font-size: 0.85rem; overflow-wrap: anywhere; }
      .ms-ok { color: #146c43; font-weight: 700; } .ms-pausa { color: #6b3f00; font-weight: 700; }
      .ms-linha { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
      .ms-btn { min-height: 40px; padding: 8px 13px; border-radius: 8px; border: 0; font-weight: 700; font-size: 0.82rem; cursor: pointer; background: #eee; color: #222; width: auto; }
      .ms-btn.prim { background: var(--laranja); color: #0d0d0d; }
      .ms-busca { width: 100%; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; font-size: 0.95rem; margin: 6px 0; }
      .ms-lista { list-style: none; margin: 0; padding: 0; }
      .ms-conv { display: block; width: 100%; text-align: left; background: #fff; border: 0; border-bottom: 1px solid #eee; padding: 10px 4px; min-height: 52px; cursor: pointer; font: inherit; }
      .ms-conv:hover, .ms-conv:focus-visible { background: #f5f5f5; }
      .ms-conv .ms-topo { display: flex; justify-content: space-between; gap: 8px; }
      .ms-conv b { overflow-wrap: anywhere; } .ms-conv time { color: #555; font-size: 0.74rem; flex: none; }
      .ms-conv .ms-previa { color: #444; font-size: 0.82rem; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ms-fio { display: flex; flex-direction: column; gap: 6px; padding: 6px 0; }
      .ms-bolha { max-width: 82%; padding: 8px 11px; border-radius: 12px; font-size: 0.88rem; overflow-wrap: anywhere; white-space: pre-wrap; }
      .ms-bolha.entrada { align-self: flex-start; background: #f0f0f0; color: #111; }
      .ms-bolha.saida { align-self: flex-end; background: #d8f3e3; color: #0d3b24; }
      .ms-bolha time { display: block; font-size: 0.7rem; color: #555; margin-top: 3px; }
      .ms-tipo { font-style: italic; color: #555; }
      .ms-vazio { color: #555; padding: 14px 4px; font-size: 0.86rem; }
      .ms-copia { width: 100%; font-size: 0.78rem; padding: 9px 10px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; }
    `;
    document.head.appendChild(s);
  }

  function montar() {
    if ($('overlay-mensagens')) return;
    css();
    const o = el('div', 'overlay-sheet'); o.id = 'overlay-mensagens';
    o.innerHTML = '<div class="sheet sheet-mensagens" role="dialog" aria-modal="true" aria-labelledby="ms-titulo"><div class="sheet-topo"><h2 class="gestao-titulo" id="ms-titulo">💬 Mensagens</h2><button type="button" class="sheet-x" id="ms-fechar" aria-label="Fechar">✕</button></div><div class="gestao-corpo" id="ms-corpo" aria-live="polite"></div></div>';
    document.body.appendChild(o);
    $('ms-fechar').addEventListener('click', () => fecharComHistorico_('overlay-mensagens'));
    $('ms-corpo').addEventListener('click', clique);
    $('ms-corpo').addEventListener('input', (ev) => { if (ev.target.id === 'ms-busca') { busca = ev.target.value; clearTimeout(timerBusca); timerBusca = setTimeout(carregarLista, 350); } });
  }

  function cabecalhoAbas() {
    const abas = el('div', 'ms-abas'); abas.setAttribute('role', 'tablist');
    CANAIS.forEach(([id, nome]) => {
      const c = resumo && resumo.canais[id] ? resumo.canais[id] : { conversas: 0 };
      const b = el('button', 'ms-aba'); b.type = 'button'; b.dataset.ms = 'aba'; b.dataset.canal = id;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(id === canal));
      b.appendChild(document.createTextNode(nome)); b.appendChild(el('small', '', c.conversas + (c.conversas === 1 ? ' conversa' : ' conversas')));
      abas.appendChild(b);
    });
    return abas;
  }
  function caixaEstado() {
    const caixa = el('div', 'ms-caixa'), c = resumo && resumo.canais[canal];
    if (!c) { caixa.textContent = 'Carregando…'; return caixa; }
    if (canal === 'instagram') {
      if (!c.pronto) {
        caixa.appendChild(el('p', 'ms-pausa', 'Ainda não ligado.'));
        caixa.appendChild(el('p', '', 'O Instagram só entrega mensagens por um webhook da Meta. Cole abaixo a “Chave secreta do app do Instagram” (Meta → caso de uso API do Instagram → Mostrar). Ela fica guardada no servidor e não volta para a tela. Depois disso, o endereço do webhook aparece aqui.'));
        const campo = el('input', 'ms-busca'); campo.id = 'ms-segredo'; campo.type = 'password'; campo.autocomplete = 'new-password'; campo.setAttribute('aria-label', 'Chave secreta do app do Instagram'); campo.placeholder = 'Chave secreta do app do Instagram';
        const l = el('div', 'ms-linha'), bt = el('button', 'ms-btn prim', 'Salvar chave'); bt.type = 'button'; bt.dataset.ms = 'segredo'; l.appendChild(bt);
        caixa.appendChild(campo); caixa.appendChild(l);
      } else {
        caixa.appendChild(el('p', c.ultima ? 'ms-ok' : '', c.ultima ? 'Gravando mensagens.' : 'Pronto para receber. Cole este endereço no webhook de Instagram do app da Meta:'));
        const i = el('input', 'ms-copia'); i.readOnly = true; i.value = resumo.urlInstagram; i.setAttribute('aria-label', 'Endereço do webhook do Instagram'); caixa.appendChild(i);
      }
      return caixa;
    }
    const n = canal === 'whatsapp1' ? 1 : 2;
    if (!c.ligadoEm) {
      caixa.appendChild(el('p', 'ms-pausa', 'Ainda não está gravando.'));
      caixa.appendChild(el('p', '', 'Ao ligar, o recebimento de mensagens desta instância da Wafly passa a vir para o servidor da loja e as conversas começam a ser guardadas daqui para frente. O histórico antigo não é buscado.'));
      const l = el('div', 'ms-linha'), b = el('button', 'ms-btn prim', 'Ligar gravação'); b.type = 'button'; b.dataset.ms = 'ligar'; b.dataset.slot = String(n); l.appendChild(b); caixa.appendChild(l);
    } else {
      caixa.appendChild(el('p', c.pausado ? 'ms-pausa' : 'ms-ok', c.pausado ? 'Gravação pausada.' : 'Gravando desde ' + hora(c.ligadoEm) + '.'));
      const l = el('div', 'ms-linha'), b = el('button', 'ms-btn', c.pausado ? 'Retomar gravação' : 'Pausar gravação'); b.type = 'button'; b.dataset.ms = 'pausar'; b.dataset.pausar = c.pausado ? '0' : '1'; l.appendChild(b); caixa.appendChild(l);
    }
    return caixa;
  }

  async function desenhar() {
    const corpo = $('ms-corpo'); corpo.textContent = '';
    corpo.appendChild(cabecalhoAbas());
    corpo.appendChild(caixaEstado());
    const busq = el('input', 'ms-busca'); busq.id = 'ms-busca'; busq.type = 'search'; busq.placeholder = 'Buscar por nome, número ou texto'; busq.value = busca; busq.setAttribute('aria-label', 'Buscar conversas'); corpo.appendChild(busq);
    const lista = el('div'); lista.id = 'ms-lista'; corpo.appendChild(lista);
    await carregarLista();
  }
  async function carregarLista() {
    const lista = $('ms-lista'); if (!lista) return;
    const r = await worker_('/msg/conversas?canal=' + encodeURIComponent(canal) + (busca.trim() ? '&busca=' + encodeURIComponent(busca.trim()) : ''), 'GET');
    lista.textContent = '';
    if (!r.ok) { lista.appendChild(el('p', 'ms-vazio', r.erro || 'Não foi possível carregar agora.')); return; }
    if (!r.conversas.length) { lista.appendChild(el('p', 'ms-vazio', busca.trim() ? 'Nenhuma conversa encontrada.' : 'Ainda não chegou nenhuma mensagem neste canal.')); return; }
    const ul = el('ul', 'ms-lista');
    r.conversas.forEach((c) => {
      const li = el('li'), b = el('button', 'ms-conv'); b.type = 'button'; b.dataset.ms = 'abrir'; b.dataset.id = String(c.id);
      const topo = el('span', 'ms-topo'); topo.appendChild(el('b', '', rotuloContato(c))); topo.appendChild(el('time', '', hora(c.ultima_em)));
      b.appendChild(topo); b.appendChild(el('span', 'ms-previa', c.previa || ''));
      li.appendChild(b); ul.appendChild(li);
    });
    lista.appendChild(ul);
  }
  async function abrirConversa(id) {
    const corpo = $('ms-corpo'); corpo.textContent = 'Carregando…';
    const r = await worker_('/msg/mensagens?conversa=' + encodeURIComponent(id), 'GET');
    corpo.textContent = '';
    const voltar = el('button', 'ms-btn', '← Voltar'); voltar.type = 'button'; voltar.dataset.ms = 'voltar'; corpo.appendChild(voltar);
    if (!r.ok) { corpo.appendChild(el('p', 'ms-vazio', r.erro || 'Não foi possível abrir agora.')); return; }
    corpo.appendChild(el('h3', '', rotuloContato(r.conversa)));
    const fio = el('div', 'ms-fio');
    r.mensagens.forEach((m) => {
      const b = el('div', 'ms-bolha ' + (m.direcao === 'saida' ? 'saida' : 'entrada'));
      if (m.texto) b.appendChild(document.createTextNode(m.texto));
      if (m.tipo && m.tipo !== 'texto') b.appendChild(el('span', 'ms-tipo', (m.texto ? ' ' : '') + '[' + m.tipo + ']'));
      b.appendChild(el('time', '', hora(m.enviada_em)));
      fio.appendChild(b);
    });
    corpo.appendChild(fio);
  }
  async function recarregar() { resumo = await worker_('/msg/resumo', 'GET'); if (!resumo.ok) { $('ms-corpo').textContent = resumo.erro || 'Não foi possível carregar agora.'; return; } await desenhar(); }

  async function clique(ev) {
    const b = ev.target.closest('[data-ms]'); if (!b) return;
    const a = b.dataset.ms;
    if (a === 'aba') { canal = b.dataset.canal; busca = ''; await desenhar(); }
    else if (a === 'segredo') {
      const v = ($('ms-segredo') || {}).value || '';
      const r = await worker_('/msg/instagram/segredo', 'POST', { segredo: v });
      if (!r.ok) alert(r.erro || 'Não foi possível guardar agora.'); else recarregar();
    }
    else if (a === 'abrir') abrirConversa(b.dataset.id);
    else if (a === 'voltar') recarregar();
    else if (a === 'ligar') {
      if (!confirm('Ligar a gravação? A Wafly passará a mandar as mensagens recebidas deste WhatsApp para o servidor da loja (no lugar do endereço que estiver configurado hoje). Nada é apagado e o histórico antigo não é buscado.')) return;
      b.disabled = true;
      const r = await worker_('/msg/ligar', 'POST', { slot: Number(b.dataset.slot) });
      if (!r.ok) { b.disabled = false; alert(r.erro || 'Não foi possível ligar agora.'); return; }
      recarregar();
    } else if (a === 'pausar') {
      const r = await worker_('/msg/pausar', 'POST', { canal: canal, pausar: b.dataset.pausar === '1' });
      if (!r.ok) alert(r.erro || 'Não foi possível agora.'); else recarregar();
    }
  }

  async function abrir() {
    montar(); abrirComHistorico_('overlay-mensagens');
    $('ms-corpo').textContent = 'Carregando…';
    await recarregar();
  }
  (function init() {
    const botao = $('btn-abrir-mensagens'); if (!botao) return;
    botao.hidden = false;
    botao.addEventListener('click', () => { if (!podeGerir()) { alert('Esta tela é só para o Admin total.'); return; } abrir(); });
  })();
})();
