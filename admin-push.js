/* ====================================================================
 * TENKiTER — admin-push.js (v3.4) — CENTRAL DE AVISOS do lojista
 *  Envia notificação (push) para quem você escolher:
 *   todos • quem instalou o app • por interesse • equipe • alunos • portal • clientes com conta • perfil • acesso • pessoas escolhidas •
 *   o cliente de um pedido • clientes com pedido em uma etapa • segmento do OneSignal.
 *  Título/mensagem com {nome}, link para qualquer https (ou uma peça), imagem grande, agendamento, validade, prévia do público,
 *  "como vai aparecer", teste no seu aparelho, modelos editáveis, histórico com entregues/cliques e a tela "Preparar" (o que falta configurar).
 * Só liga se o backend (?action=versao) disser pushCompleto; com backend antigo continua o painel simples de sempre.
 * Carrega depois de admin-gestao.js e usa o que a página já tem (adminPin, funcionarioNome, produtos, abrirComHistorico_...).
 * ==================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => escaparHtml(v);
  let st = null;                 // pushStatus
  let modelos = [];
  let pessoas = {};              // pid -> {nome, perfil, tel}  (escolhidas)
  let historico = [];
  let aba = 'enviar';
  let temporizadorPrevia = null;
  let ultimaPrevia = null;
  let meuPushId = '';

  /* ---------- backend ---------- */
  function chamar(extra) {
    const sess = (typeof getSessao === 'function' && getSessao()) || null;
    return apiPost(Object.assign({ pin: adminPin, sessao: adminPin, whatsapp: sess ? sess.whatsapp : '', funcionario: funcionarioNome }, extra));
  }
  function erroTxt(r) { return (r && r.erro) || (r && r.semRede ? 'Sem conexão agora. Tente de novo.' : 'Não foi possível agora. Tente de novo.'); }
  function podeGerir() { try { return typeof temPermissao === 'function' && typeof usuarioAdmin !== 'undefined' && !!usuarioAdmin && !!temPermissao(usuarioAdmin, 'gerir_acessos'); } catch (e) { return false; } }

  /* ---------- estilo ---------- */
  function css() {
    if ($('av-css')) return;
    const s = document.createElement('style'); s.id = 'av-css';
    s.textContent = `
      .sheet-avisos { max-width: 760px; height: 92vh; max-height: 92vh; }
      .av-abas { display: flex; gap: 6px; overflow-x: auto; margin: 0 0 8px; padding-bottom: 4px; }
      .av-abas button { flex: none; width: auto; padding: 9px 14px; border-radius: 999px; border: 1px solid #ddd; background: #fff; color: #222; font-size: 0.84rem; font-weight: 700; cursor: pointer; min-height: 40px; }
      .av-abas button[aria-selected="true"] { background: var(--laranja); border-color: var(--laranja); color: #0d0d0d; }
      .av-bloco { border: 1px solid #e3e3e3; border-radius: 12px; padding: 10px 12px; margin: 10px 0; background: #fff; }
      .av-bloco > h3 { margin: 0 0 4px; font-size: 0.9rem; font-family: "Poppins", sans-serif; }
      .av-cont { font-size: 0.72rem; color: #666; text-align: right; margin-top: 2px; }
      .av-previa { background: #f7f4ec; border-radius: 10px; padding: 8px 10px; font-size: 0.82rem; color: #222; margin-top: 8px; min-height: 1.5em; }
      .av-previa b { color: #111; }
      .av-notif { background: #2b2b2b; color: #fff; border-radius: 14px; padding: 10px 12px; display: grid; grid-template-columns: 38px 1fr; gap: 10px; max-width: 360px; font-family: Roboto, system-ui, sans-serif; }
      .av-notif img.av-ico { width: 38px; height: 38px; border-radius: 8px; }
      .av-notif .av-app { font-size: 0.7rem; color: #bbb; }
      .av-notif .av-t { font-weight: 700; font-size: 0.9rem; overflow-wrap: anywhere; }
      .av-notif .av-m { font-size: 0.84rem; color: #e6e6e6; overflow-wrap: anywhere; white-space: pre-wrap; }
      .av-notif img.av-img { grid-column: 1 / -1; width: 100%; max-height: 170px; object-fit: cover; border-radius: 8px; margin-top: 4px; }
      .av-linha { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
      .av-linha button { width: auto; padding: 9px 13px; font-size: 0.82rem; min-height: 40px; }
      .av-prim { background: var(--laranja); color: #0d0d0d; font-weight: 800; }
      .av-sec { background: #eee; color: #222; }
      .av-perigo { background: #fde3e3; color: #8a1c1c; font-weight: 700; }
      .av-ok { color: #146c43; font-weight: 700; font-size: 0.86rem; }
      .av-erro { color: var(--vermelho); font-weight: 700; font-size: 0.86rem; }
      .av-aviso { background: #fff3e0; border: 1px solid #ffcc80; color: #6b3f00; border-radius: 10px; padding: 8px 10px; font-size: 0.82rem; margin: 8px 0; }
      .av-lista { list-style: none; margin: 6px 0; padding: 0; }
      .av-lista li { display: flex; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid #eee; font-size: 0.84rem; }
      .av-lista li > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
      .av-lista li button { width: auto; padding: 7px 11px; font-size: 0.78rem; min-height: 36px; }
      .av-sel-linha { display: flex; gap: 8px; align-items: center; min-height: 40px; font-weight: 500; margin: 2px 0; }
      .av-sel-linha input { width: 20px; height: 20px; flex: none; }
      .av-tag { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; background: #eee; color: #222; }
      .av-tag.agendado { background: #fff3cd; color: #664d03; } .av-tag.enviado { background: #d1e7dd; color: #0a3622; } .av-tag.cancelado { background: #f8d7da; color: #58151c; }
      .av-hist { border-bottom: 1px solid #eee; padding: 8px 0; font-size: 0.84rem; overflow-wrap: anywhere; }
      .av-hist .av-n { font-size: 0.78rem; color: #333; margin-top: 4px; }
      .av-passos { margin: 6px 0; padding-left: 20px; font-size: 0.84rem; color: #222; } .av-passos li { margin: 4px 0; }
      .av-check { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 0.85rem; }
      .av-check .av-i { flex: none; font-size: 1.1rem; }
      .av-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
      .av-chips .chip { font-size: 0.78rem; padding: 7px 12px; }
    `;
    document.head.appendChild(s);
  }

  /* ---------- janela ---------- */
  function montar() {
    if ($('overlay-avisos')) return;
    css();
    const o = document.createElement('div');
    o.className = 'overlay-sheet'; o.id = 'overlay-avisos';
    o.innerHTML =
      '<div class="sheet sheet-avisos" role="dialog" aria-modal="true" aria-labelledby="av-titulo">' +
        '<div class="sheet-topo"><h2 class="gestao-titulo" id="av-titulo">📢 Central de avisos</h2><button type="button" class="sheet-x" id="av-fechar" aria-label="Fechar">✕</button></div>' +
        '<div class="av-abas" role="tablist" aria-label="Seções">' +
          [['enviar', '✉️ Enviar'], ['historico', '📜 Histórico'], ['modelos', '🧩 Modelos'], ['preparar', '⚙️ Preparar']].map((a) => '<button type="button" role="tab" id="av-aba-' + a[0] + '" data-aba="' + a[0] + '" aria-selected="false">' + a[1] + '</button>').join('') +
        '</div>' +
        '<div class="gestao-corpo" id="av-corpo" role="tabpanel" aria-live="polite"></div>' +
      '</div>';
    document.body.appendChild(o);
    $('av-fechar').addEventListener('click', fechar);
    o.querySelector('.av-abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) mostrarAba(b.dataset.aba); });
    window.addEventListener('popstate', () => o.classList.remove('aberto'));
  }
  function fechar() { fecharComHistorico_('overlay-avisos'); }
  async function abrir() {
    montar();
    abrirComHistorico_('overlay-avisos');
    $('av-corpo').innerHTML = '<p class="g-info">Carregando…</p>';
    await carregarTudo();
    mostrarAba(aba);
  }
  async function carregarTudo() {
    const [s, m] = await Promise.all([chamar({ action: 'pushStatus' }), chamar({ action: 'pushModelos' })]);
    st = s && s.ok ? s : null;
    modelos = m && m.ok ? m.modelos : [];
    if (!st) $('av-corpo').innerHTML = '<p class="av-erro">' + esc(erroTxt(s)) + '</p>';
  }
  async function mostrarAba(a) {
    aba = a;
    document.querySelectorAll('#overlay-avisos [data-aba]').forEach((b) => b.setAttribute('aria-selected', b.dataset.aba === a ? 'true' : 'false'));
    if (!st) return;
    if (a === 'preparar') {                       // sempre a situação de agora (a pessoa acabou de mexer no OneSignal e volta aqui para conferir)
      $('av-corpo').innerHTML = '<p class="g-info">Conferindo…</p>';
      await carregarTudo();
      if (!st || aba !== 'preparar') return;
    }
    if (a === 'enviar') telaEnviar();
    else if (a === 'historico') telaHistorico();
    else if (a === 'modelos') telaModelos();
    else telaPreparar();
  }

  /* ====================================================================
   * ENVIAR
   * ==================================================================== */
  const PUBLICOS = [
    ['todos', 'Todos que ativaram os avisos'],
    ['app', 'Quem instalou o app'],
    ['interesse', 'Por interesse (gênero/tipo de peça)…'],
    ['g:equipe', 'Equipe (quem acessa o catálogo/gestão)'],
    ['g:alunos', 'Alunos (Aluno e Novato)'],
    ['g:portal', 'Todos do portal de treinamento'],
    ['g:clientes', 'Clientes com conta'],
    ['g:contas', 'Todas as contas'],
    ['perfil', 'Por perfil…'],
    ['acesso', 'Por acesso (permissão)…'],
    ['pessoas', 'Pessoas específicas…'],
    ['pedido', 'O cliente de um pedido…'],
    ['pedidos', 'Clientes com pedido em uma etapa…'],
    ['segmento', 'Segmento do OneSignal…']
  ];
  const ETAPAS = [['novo', 'Novo'], ['em_atendimento', 'Em atendimento'], ['aguardando_pagamento', 'Aguardando pagamento'], ['separacao', 'Separando'], ['pronto', 'Pronto'], ['concluido', 'Concluído'], ['cancelado', 'Cancelado']];

  /** "(5 · 2 com aviso)"; só "(5)" quando o servidor ainda não diz quem tem aviso ativo (backend anterior ao 3.5 parte 2). */
  function cont(total, ativos) { return typeof ativos === 'number' ? '(' + total + ' · ' + ativos + ' com aviso)' : '(' + total + ')'; }
  /** Quantos há em cada público, para aparecer ao lado do nome (igual à escolha de categoria do currículo). */
  function contagemPublico(chave) {
    const c = st.contas || {}, a = st.contasAtivas, ap = st.aparelhos;
    const conta = (k) => (typeof c[k] === 'number' ? ' ' + cont(c[k], a ? a[k] : undefined) : '');
    if (chave === 'todos') { const n = ap ? (ap.onesignal ? ap.onesignal.recebem : ap.ativos) : null; return typeof n === 'number' ? ' (' + n + ')' : ''; }
    if (chave === 'app') return ap && typeof ap.ativosNoApp === 'number' ? ' (' + ap.ativosNoApp + ')' : '';
    if (chave === 'g:contas') return conta('total');
    if (chave.indexOf('g:') === 0) return conta(chave.slice(2));
    return '';
  }

  function telaEnviar() {
    const rascunho = telaEnviar.rascunho || {};
    const opcoesPublico = PUBLICOS.filter((p) => p[0] !== 'segmento' || (st.segmentos && st.segmentos.length > 1)).map((p) => '<option value="' + p[0] + '">' + esc(p[1] + contagemPublico(p[0])) + '</option>').join('');
    const aviso = !st.chaveConfigurada || st.webPronto === false
      ? '<div class="av-aviso">⚠️ Os avisos ainda não estão prontos para chegar nos aparelhos. Veja a aba <b>⚙️ Preparar</b> (faltam passos no OneSignal).</div>' : '';
    $('av-corpo').innerHTML = aviso +
      '<div class="av-bloco"><h3>1. Para quem</h3>' +
        '<label for="av-publico">Público</label><select id="av-publico">' + opcoesPublico + '</select>' +
        '<div id="av-sub"></div><div class="av-previa" id="av-previa" aria-live="polite">Escolha o público.</div></div>' +
      '<div class="av-bloco"><h3>2. O aviso</h3>' +
        '<div class="av-chips" id="av-modelos-rapidos"></div>' +
        '<label for="av-titulo-in">Título</label><input type="text" id="av-titulo-in" maxlength="80" placeholder="Ex.: Promoção de fim de semana! 🎉" autocomplete="off">' +
        '<div class="av-cont"><span id="av-c-t">0</span>/80</div>' +
        '<label for="av-msg-in">Mensagem</label><textarea id="av-msg-in" rows="3" maxlength="300" placeholder="Ex.: 20% off em toda a loja até domingo."></textarea>' +
        '<div class="av-cont"><span id="av-c-m">0</span>/300</div>' +
        '<div class="av-linha"><button type="button" class="av-sec" id="av-ins-nome">Inserir {nome}</button><span class="g-nota" style="margin:0">{nome} vira o primeiro nome de cada pessoa (só em avisos para contas).</span></div>' +
        '<label for="av-url-in">Ao tocar, abrir</label><input type="text" id="av-url-in" placeholder="https://tenkitermodas.com.br/" autocomplete="off" inputmode="url">' +
        '<div class="av-chips" id="av-links"></div>' +
        '<label for="av-peca-in">Ou escolher uma peça</label><input type="text" id="av-peca-in" list="av-pecas" placeholder="Digite o nome ou código da peça" autocomplete="off"><datalist id="av-pecas"></datalist>' +
        '<label for="av-img-in">Imagem grande (opcional, endereço https://)</label><input type="text" id="av-img-in" placeholder="https://…" autocomplete="off" inputmode="url">' +
      '</div>' +
      '<div class="av-bloco"><h3>3. Quando</h3>' +
        '<label class="av-sel-linha"><input type="radio" name="av-quando" value="agora" checked> Enviar agora</label>' +
        '<label class="av-sel-linha"><input type="radio" name="av-quando" value="agendar"> Agendar</label>' +
        '<div id="av-agenda" hidden><label for="av-data">Dia e hora</label><input type="datetime-local" id="av-data"></div>' +
        '<label for="av-ttl">Por quanto tempo vale</label><select id="av-ttl"><option value="">Padrão (até 3 dias)</option><option value="1">1 hora</option><option value="6">6 horas</option><option value="24">1 dia</option><option value="72">3 dias</option><option value="168">7 dias</option></select>' +
        '<p class="g-nota">Depois desse prazo o aviso some para quem estava com o celular desligado/sem internet.</p></div>' +
      '<div class="av-bloco"><h3>Como vai aparecer</h3><div class="av-notif" id="av-notif" aria-hidden="true"></div></div>' +
      '<div class="av-linha"><button type="button" class="av-sec" id="av-teste">📱 Enviar teste para mim</button><button type="button" class="av-prim" id="av-enviar">Enviar aviso</button></div>' +
      '<div id="av-resultado" role="status" aria-live="polite"></div>';

    // peças
    const lista = (typeof produtos !== 'undefined' && Array.isArray(produtos)) ? produtos.filter((p) => String(p.Status || 'Ativo').toLowerCase() === 'ativo').slice(0, 400) : [];
    $('av-pecas').innerHTML = lista.map((p) => '<option value="' + esc((p.Codigo ? p.Codigo + ' — ' : '') + p.Nome) + '"></option>').join('');
    // modelos
    $('av-modelos-rapidos').innerHTML = modelos.length ? '<span class="g-nota" style="margin:0 6px 0 0">Modelos:</span>' + modelos.map((m, i) => '<button type="button" class="chip" data-m="' + i + '">' + esc(m.rotulo) + '</button>').join('') : '';
    // atalhos de link
    const base = typeof SITE_URL === 'string' ? SITE_URL : 'https://tenkitermodas.com.br/';
    const atalhos = [['Catálogo', base], ['Novidades', base + '?novidade=true'], ['Treinamentos', base + 'treinamentos.html']];
    $('av-links').innerHTML = '<span class="g-nota" style="margin:0 6px 0 0">Atalhos:</span>' + atalhos.map((a, i) => '<button type="button" class="chip" data-l="' + i + '">' + esc(a[0]) + '</button>').join('');

    const pub = $('av-publico');
    pub.value = rascunho.publico || 'todos';
    $('av-titulo-in').value = rascunho.titulo || '';
    $('av-msg-in').value = rascunho.mensagem || '';
    $('av-url-in').value = rascunho.url || base;
    $('av-img-in').value = rascunho.imagem || '';

    function atualizarContadores() {
      $('av-c-t').textContent = $('av-titulo-in').value.length; $('av-c-m').textContent = $('av-msg-in').value.length;
      const tit = $('av-titulo-in').value.replace(/\{nome\}/gi, 'Maria') || 'Título do aviso', msg = $('av-msg-in').value.replace(/\{nome\}/gi, 'Maria') || 'A mensagem aparece aqui.';
      const img = $('av-img-in').value.trim();
      $('av-notif').innerHTML = '<img class="av-ico" src="icon-192.png" alt=""><div><div class="av-app">TENKiTER Modas • agora</div><div class="av-t">' + esc(tit) + '</div><div class="av-m">' + esc(msg) + '</div></div>' +
        (/^https:\/\//.test(img) ? '<img class="av-img" ' + atribSrc(img) + ' alt="">' : '');
    }
    ['av-titulo-in', 'av-msg-in', 'av-img-in'].forEach((id) => $(id).addEventListener('input', atualizarContadores));
    atualizarContadores();
    desenharSub();
    pub.addEventListener('change', () => { desenharSub(); agendarPrevia(); });

    $('av-ins-nome').addEventListener('click', () => {
      const alvo = document.activeElement && (document.activeElement.id === 'av-titulo-in' || document.activeElement.id === 'av-msg-in') ? document.activeElement : (telaEnviar.ultimoCampo || $('av-titulo-in'));
      const ini = alvo.selectionStart == null ? alvo.value.length : alvo.selectionStart, fim = alvo.selectionEnd == null ? ini : alvo.selectionEnd;
      alvo.value = alvo.value.slice(0, ini) + '{nome}' + alvo.value.slice(fim);
      alvo.focus(); alvo.setSelectionRange(ini + 6, ini + 6); atualizarContadores();
    });
    ['av-titulo-in', 'av-msg-in'].forEach((id) => $(id).addEventListener('focus', () => { telaEnviar.ultimoCampo = $(id); }));
    $('av-modelos-rapidos').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-m]'); if (!b) return;
      const m = modelos[Number(b.dataset.m)];
      $('av-titulo-in').value = m.titulo; $('av-msg-in').value = m.mensagem;
      if (m.url) $('av-url-in').value = m.url;
      $('av-img-in').value = m.imagem || '';
      atualizarContadores();
    });
    $('av-links').addEventListener('click', (ev) => { const b = ev.target.closest('[data-l]'); if (b) $('av-url-in').value = atalhos[Number(b.dataset.l)][1]; });
    $('av-peca-in').addEventListener('change', () => {
      const v = $('av-peca-in').value.trim().toLowerCase();
      const p = lista.find((x) => ((x.Codigo ? x.Codigo + ' — ' : '') + x.Nome).toLowerCase() === v) || lista.find((x) => String(x.Codigo || '').toLowerCase() === v);
      if (!p) return;
      $('av-url-in').value = linkProduto(p);
      if (/^https:\/\//.test(String(p.Foto_URL || ''))) $('av-img-in').value = p.Foto_URL;
      if (!$('av-titulo-in').value) $('av-titulo-in').value = p.Nome;
      atualizarContadores();
    });
    document.querySelectorAll('input[name="av-quando"]').forEach((r) => r.addEventListener('change', () => {
      $('av-agenda').hidden = document.querySelector('input[name="av-quando"]:checked').value !== 'agendar';
      if (!$('av-agenda').hidden && !$('av-data').value) {
        const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0);
        const p2 = (n) => String(n).padStart(2, '0');
        $('av-data').value = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
      }
    }));
    $('av-enviar').addEventListener('click', () => enviar(false));
    $('av-teste').addEventListener('click', () => enviar(true));
    agendarPrevia();
  }

  /* ---- sub-seleção do público */
  function desenharSub() {
    const t = $('av-publico').value, sub = $('av-sub');
    let h = '';
    if (t === 'interesse') {
      h = '<div class="av-chips" id="av-sub-interesses" role="group" aria-label="Interesses">' + (st.interesses || []).map((i) => '<button type="button" class="chip" data-int="' + esc(i.chave) + '" data-rot="' + esc(i.rotulo) + '" aria-pressed="false">' + esc(i.rotulo) + (typeof i.total === 'number' ? ' <small>(' + i.total + ')</small>' : '') + '</button>').join('') + '</div><p class="g-nota">Vai para quem marcou esses interesses no aparelho. O número é de aparelhos com aviso ativo que escolheram aquele interesse.</p>';
    } else if (t === 'perfil') {
      h = (st.perfis || []).map((p) => '<label class="av-sel-linha"><input type="checkbox" data-perfil="' + esc(p.nome) + '"> ' + esc(p.nome) + ' <small>' + cont(p.total, p.ativos) + '</small></label>').join('') || '<p class="g-nota">Nenhum perfil cadastrado.</p>';
    } else if (t === 'acesso') {
      let grupo = '';
      h = '<label class="av-sel-linha"><input type="radio" name="av-modo" value="qualquer" checked> Quem tem <b>qualquer um</b> dos marcados</label><label class="av-sel-linha"><input type="radio" name="av-modo" value="todas"> Quem tem <b>todos</b> os marcados</label>';
      (st.acessos || []).forEach((a) => {
        if (a.grupo !== grupo) { grupo = a.grupo; h += '<h3 style="margin:10px 0 2px;font-size:.8rem;color:#555">' + esc(grupo) + '</h3>'; }
        h += '<label class="av-sel-linha"><input type="checkbox" data-acesso="' + esc(a.chave) + '"> ' + esc(a.rotulo) + ' <small>' + cont(a.total, a.ativos) + '</small></label>';
      });
    } else if (t === 'pessoas') {
      h = '<label for="av-busca-pessoa">Buscar pelo nome ou final do telefone</label><input type="text" id="av-busca-pessoa" placeholder="Ex.: Maria" autocomplete="off"><ul class="av-lista" id="av-achadas"></ul><div class="av-chips" id="av-escolhidas"></div>';
    } else if (t === 'pedido') {
      h = '<label for="av-cod-pedido">Código do pedido</label><input type="text" id="av-cod-pedido" placeholder="PED-0001" autocomplete="off" autocapitalize="characters">';
    } else if (t === 'pedidos') {
      h = '<label for="av-etapa">Etapa do pedido</label><select id="av-etapa">' + ETAPAS.map((e) => '<option value="' + e[0] + '">' + esc(e[1]) + (st.etapas ? ' (' + (st.etapas[e[0]] || 0) + ')' : '') + '</option>').join('') + '</select><p class="g-nota">O número é de pedidos que estão nessa etapa agora.</p>';
    } else if (t === 'segmento') {
      h = '<label for="av-seg">Segmento</label><select id="av-seg">' + (st.segmentos || []).map((s) => '<option value="' + esc(s) + '">' + esc(s === 'Subscribed Users' ? 'Todos os assinantes' : s) + '</option>').join('') + '</select>';
    }
    sub.innerHTML = h;
    sub.onchange = sub.oninput = (ev) => { if (ev.target && ev.target.id === 'av-busca-pessoa') return; agendarPrevia(); };
    sub.onclick = (ev) => {
      const ci = ev.target.closest('[data-int]');
      if (ci) { ci.setAttribute('aria-pressed', ci.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); ci.classList.toggle('selecionado'); agendarPrevia(); return; }
      const add = ev.target.closest('[data-add-pessoa]');
      if (add) { const p = achadas[add.dataset.addPessoa]; if (p) { pessoas[p.pid] = p; desenharEscolhidas(); agendarPrevia(); } return; }
      const rem = ev.target.closest('[data-rem-pessoa]');
      if (rem) { delete pessoas[rem.dataset.remPessoa]; desenharEscolhidas(); agendarPrevia(); }
    };
    if (t === 'pessoas') {
      pessoas = {}; desenharEscolhidas();
      let tmp = null;
      $('av-busca-pessoa').addEventListener('input', () => { clearTimeout(tmp); tmp = setTimeout(buscarPessoas, 300); });
    }
    if (t === 'pedido') $('av-cod-pedido').addEventListener('input', agendarPrevia);
  }
  let achadas = [];
  async function buscarPessoas() {
    const q = $('av-busca-pessoa') ? $('av-busca-pessoa').value.trim() : '';
    const ul = $('av-achadas'); if (!ul) return;
    if (q.length < 2) { ul.innerHTML = ''; return; }
    const r = await chamar({ action: 'pushPessoas', q: q });
    if (!r || !r.ok) { ul.innerHTML = '<li class="av-erro">' + esc(erroTxt(r)) + '</li>'; return; }
    achadas = r.pessoas;
    ul.innerHTML = achadas.length ? achadas.map((p, i) => '<li><span><b>' + esc(p.nome) + '</b> · ' + esc(p.perfil) + ' · ' + esc(p.tel) + '</span><button type="button" class="av-sec" data-add-pessoa="' + i + '">Adicionar</button></li>').join('') : '<li class="g-nota">Ninguém encontrado.</li>';
  }
  function desenharEscolhidas() {
    const box = $('av-escolhidas'); if (!box) return;
    const ids = Object.keys(pessoas);
    box.innerHTML = ids.map((id) => '<button type="button" class="chip selecionado" data-rem-pessoa="' + esc(id) + '" title="Tirar da lista">' + esc(pessoas[id].nome) + ' ✕</button>').join('');
  }

  /** Monta o objeto de público a partir dos campos. { aud } ou { erro }. */
  function audienciaDosCampos() {
    const t = $('av-publico').value;
    if (t === 'todos' || t === 'app') return { aud: { tipo: t } };
    if (t.indexOf('g:') === 0) return { aud: { tipo: 'grupo', grupo: t.slice(2) } };
    if (t === 'interesse') {
      const marcados = Array.from(document.querySelectorAll('#av-sub-interesses [aria-pressed="true"]'));
      if (!marcados.length) return { erro: 'Marque pelo menos um interesse.' };
      return { aud: { tipo: 'interesse', chaves: marcados.map((b) => b.dataset.int), rotulos: marcados.map((b) => b.dataset.rot) } };
    }
    if (t === 'perfil') {
      const m = Array.from(document.querySelectorAll('#av-sub [data-perfil]:checked')).map((c) => c.dataset.perfil);
      return m.length ? { aud: { tipo: 'perfil', perfis: m } } : { erro: 'Marque pelo menos um perfil.' };
    }
    if (t === 'acesso') {
      const m = Array.from(document.querySelectorAll('#av-sub [data-acesso]:checked')).map((c) => c.dataset.acesso);
      const modo = (document.querySelector('input[name="av-modo"]:checked') || {}).value || 'qualquer';
      return m.length ? { aud: { tipo: 'acesso', chaves: m, modo: modo } } : { erro: 'Marque pelo menos um acesso.' };
    }
    if (t === 'pessoas') {
      const ids = Object.keys(pessoas);
      return ids.length ? { aud: { tipo: 'pessoas', ids: ids } } : { erro: 'Busque e adicione pelo menos uma pessoa.' };
    }
    if (t === 'pedido') {
      const c = $('av-cod-pedido').value.trim();
      return c ? { aud: { tipo: 'pedido', codigo: c } } : { erro: 'Digite o código do pedido.' };
    }
    if (t === 'pedidos') return { aud: { tipo: 'pedidos', status: $('av-etapa').value } };
    if (t === 'segmento') return { aud: { tipo: 'segmento', nome: $('av-seg').value } };
    return { erro: 'Escolha o público.' };
  }
  function agendarPrevia() {
    clearTimeout(temporizadorPrevia);
    const el = $('av-previa'); if (!el) return;
    const a = audienciaDosCampos();
    if (a.erro) { ultimaPrevia = null; el.textContent = a.erro; return; }
    el.textContent = 'Contando…';
    temporizadorPrevia = setTimeout(async () => {
      const r = await chamar({ action: 'pushPrevia', audiencia: a.aud });
      const el2 = $('av-previa'); if (!el2) return;
      if (!r || !r.ok) { ultimaPrevia = null; el2.innerHTML = '<span class="av-erro">' + esc(erroTxt(r)) + '</span>'; return; }
      ultimaPrevia = r;
      if (r.quantidade === null) el2.innerHTML = '👥 <b>' + esc(r.descricao) + '</b>' + (typeof r.aparelhos === 'number' ? ': cerca de <b>' + r.aparelhos + '</b> aparelho(s) com aviso ativo' : '') + '<br><span class="g-nota">Quem já ativou os avisos no aparelho' + (typeof r.aparelhos === 'number' ? ' (contados pelo site; o número exato do OneSignal aparece no histórico depois de enviar)' : '. O número exato aparece no histórico depois de enviar') + '.</span>';
      else el2.innerHTML = '👥 <b>' + esc(r.descricao) + '</b>: ' + r.quantidade + ' pessoa(s)' + (typeof r.comAviso === 'number' ? ', <b>' + r.comAviso + '</b> com aviso ativo agora' : '') + (r.amostra.length ? '<br><span class="g-nota">' + esc(r.amostra.join(', ')) + (r.quantidade > r.amostra.length ? ' e mais ' + (r.quantidade - r.amostra.length) : '') + '</span>' : '') +
        '<br><span class="g-nota">Só recebe quem entrou na conta e ativou os avisos no aparelho.</span>';
    }, 350);
  }

  async function descobrirMeuPushId() {
    if (meuPushId) return meuPushId;
    const s = (typeof getSessao === 'function' && getSessao()) || null;
    if (!s) return '';
    const r = await apiPost({ action: 'pushIdentidade', whatsapp: s.whatsapp, sessao: s.sessao });
    if (r && r.ok) meuPushId = r.pushId;
    return meuPushId;
  }

  async function enviar(teste) {
    const res = $('av-resultado');
    const titulo = $('av-titulo-in').value.trim(), mensagem = $('av-msg-in').value.trim();
    if (!titulo || !mensagem) { res.innerHTML = '<p class="av-erro">Preencha o título e a mensagem.</p>'; return; }
    let url = $('av-url-in').value.trim(); const imagem = $('av-img-in').value.trim();
    if (url && !/^https:\/\//.test(url)) { res.innerHTML = '<p class="av-erro">O link precisa começar com https://</p>'; return; }
    if (imagem && !/^https:\/\//.test(imagem)) { res.innerHTML = '<p class="av-erro">A imagem precisa ser um endereço https://</p>'; return; }
    const corpo = { action: 'enviarPush', titulo: titulo, mensagem: mensagem, url: url || undefined, imagem: imagem || undefined };
    const ttl = $('av-ttl').value; if (ttl) corpo.ttlHoras = Number(ttl);
    let desc = '';
    if (teste) {
      const id = await descobrirMeuPushId();
      if (!id) { res.innerHTML = '<p class="av-erro">Para testar no seu aparelho, entre com sua conta (WhatsApp e senha) e ative os avisos neste aparelho na aba ⚙️ Preparar.</p>'; return; }
      corpo.audiencia = { tipo: 'pessoas', ids: [id] }; corpo.titulo = '[Teste] ' + titulo.slice(0, 70);
      desc = 'o seu aparelho (teste)';
    } else {
      const a = audienciaDosCampos();
      if (a.erro) { res.innerHTML = '<p class="av-erro">' + esc(a.erro) + '</p>'; return; }
      corpo.audiencia = a.aud;
      if (document.querySelector('input[name="av-quando"]:checked').value === 'agendar') {
        const v = $('av-data').value; const d = v ? new Date(v) : null;
        if (!d || isNaN(d.getTime())) { res.innerHTML = '<p class="av-erro">Escolha o dia e a hora do agendamento.</p>'; return; }
        corpo.agendarEm = d.toISOString();
      }
      desc = ultimaPrevia ? ultimaPrevia.descricao + (ultimaPrevia.quantidade != null ? ' (' + ultimaPrevia.quantidade + ' pessoa(s))' : '') : 'o público escolhido';
      const quando = corpo.agendarEm ? ' para ' + new Date(corpo.agendarEm).toLocaleString('pt-BR') : ' agora';
      if (!confirm('Enviar "' + titulo + '" para ' + desc + quando + '?')) return;
    }
    const b = $(teste ? 'av-teste' : 'av-enviar'); b.disabled = true; const rot = b.textContent; b.textContent = 'Enviando…';
    res.innerHTML = '<p class="g-info">Enviando…</p>';
    const r = await chamar(corpo);
    b.disabled = false; b.textContent = rot;
    if (r && r.ok) {
      let h = '<p class="av-ok">✅ ' + (r.agendado ? 'Aviso agendado!' : 'Aviso enviado!') + ' ' + esc(r.descricao || '') + (r.destinatarios ? ' — ' + r.destinatarios + ' ' + (r.pessoas != null ? 'pessoa(s)' : 'aparelho(s)') : '') + '</p>';
      if (r.semAviso && r.semAviso.length) h += '<div class="av-aviso">Sem aparelho com avisos ativados (não receberam): ' + esc(r.semAviso.join(', ')) + '.<br>Peça para entrarem na conta e tocarem em “Ativar avisos”.</div>';
      res.innerHTML = h;
      if (!teste) { telaEnviar.rascunho = null; }
    } else {
      let h = '<p class="av-erro">❌ ' + esc(erroTxt(r)) + '</p>';
      if (r && r.semAviso && r.semAviso.length) h += '<div class="av-aviso">Sem aparelho: ' + esc(r.semAviso.join(', ')) + '</div>';
      res.innerHTML = h;
    }
  }

  /* ====================================================================
   * HISTÓRICO
   * ==================================================================== */
  async function telaHistorico() {
    $('av-corpo').innerHTML = '<p class="g-info">Carregando…</p>';
    const r = await chamar({ action: 'pushHistorico', limite: 60 });
    if (!r || !r.ok) { $('av-corpo').innerHTML = '<p class="av-erro">' + esc(erroTxt(r)) + '</p>'; return; }
    historico = r.historico;
    $('av-corpo').innerHTML = historico.length ? historico.map((h, i) => {
      const res = h.resultado || 'enviado';
      return '<div class="av-hist"><b>' + esc(h.titulo) + '</b> <span class="av-tag ' + esc(res) + '">' + esc(res) + '</span><br>' + esc(h.mensagem) +
        '<div class="g-nota">' + esc(h.quando) + ' · ' + esc(h.quem) + ' · ' + esc(h.audiencia || (h.segmento === 'Subscribed Users' || !h.segmento ? 'Todos os assinantes' : h.segmento)) + ' · ' + h.destinatarios + ' destinatário(s)' + (h.agendado ? ' · agendado para ' + esc(h.agendado) : '') + '</div>' +
        '<div class="av-n" id="av-n-' + i + '"></div>' +
        '<div class="av-linha">' + (h.id ? '<button type="button" class="av-sec" data-num="' + i + '">📊 Ver números</button>' : '') +
        (res === 'agendado' && h.id ? '<button type="button" class="av-perigo" data-canc="' + i + '">Cancelar agendamento</button>' : '') +
        '<button type="button" class="av-sec" data-reusar="' + i + '">♻️ Usar de novo</button></div></div>';
    }).join('') : '<p class="g-info">Nenhum aviso enviado por aqui ainda.</p>';
    $('av-corpo').onclick = async (ev) => {
      const n = ev.target.closest('[data-num]'), c = ev.target.closest('[data-canc]'), u = ev.target.closest('[data-reusar]');
      if (n) {
        const i = Number(n.dataset.num), box = $('av-n-' + i); box.textContent = 'Consultando…';
        const x = await chamar({ action: 'pushNumeros', id: historico[i].id });
        box.innerHTML = x && x.ok ? '✅ Entregues: <b>' + x.entregues + '</b> · 👆 Cliques: <b>' + x.cliques + '</b> · ⚠️ Falhas: <b>' + x.falhas + '</b>' + (x.restantes ? ' · ⏳ Faltam: ' + x.restantes : '') + (x.cancelado ? ' · cancelado' : '') : '<span class="av-erro">' + esc(erroTxt(x)) + '</span>';
      } else if (c) {
        const i = Number(c.dataset.canc);
        if (!confirm('Cancelar este aviso agendado? Ele não será enviado.')) return;
        const x = await chamar({ action: 'pushCancelar', id: historico[i].id });
        if (x && x.ok) telaHistorico(); else alert(erroTxt(x));
      } else if (u) {
        const h = historico[Number(u.dataset.reusar)];
        telaEnviar.rascunho = { titulo: h.titulo, mensagem: h.mensagem, url: h.url, imagem: h.imagem };
        mostrarAba('enviar');
      }
    };
  }

  /* ====================================================================
   * MODELOS
   * ==================================================================== */
  function telaModelos(editando) {
    const m = editando || { id: '', rotulo: '', titulo: '', mensagem: '', url: '', imagem: '' };
    $('av-corpo').innerHTML =
      '<div class="av-bloco"><h3>' + (m.id ? 'Editar modelo' : 'Novo modelo') + '</h3>' +
        '<label for="md-rotulo">Nome do modelo (aparece no botão)</label><input type="text" id="md-rotulo" maxlength="30" value="' + esc(m.rotulo) + '">' +
        '<label for="md-titulo">Título</label><input type="text" id="md-titulo" maxlength="80" value="' + esc(m.titulo) + '">' +
        '<label for="md-msg">Mensagem</label><textarea id="md-msg" rows="2" maxlength="300">' + esc(m.mensagem) + '</textarea>' +
        '<label for="md-url">Link (opcional)</label><input type="text" id="md-url" value="' + esc(m.url) + '" inputmode="url" placeholder="https://…">' +
        '<label for="md-img">Imagem (opcional)</label><input type="text" id="md-img" value="' + esc(m.imagem) + '" inputmode="url" placeholder="https://…">' +
        '<div class="av-linha"><button type="button" class="av-prim" id="md-salvar">Salvar modelo</button>' + (m.id ? '<button type="button" class="av-sec" id="md-novo">Cancelar edição</button>' : '') + '</div><div id="md-res" role="status"></div></div>' +
      '<h3 style="font-size:.9rem">Seus modelos</h3><ul class="av-lista" id="md-lista">' +
        modelos.map((x, i) => '<li><span><b>' + esc(x.rotulo) + '</b><br><small>' + esc(x.titulo) + '</small></span><button type="button" class="av-sec" data-edit="' + i + '">Editar</button><button type="button" class="av-perigo" data-del="' + i + '">Excluir</button></li>').join('') + '</ul>';
    $('md-salvar').addEventListener('click', async () => {
      const modelo = { id: m.id, rotulo: $('md-rotulo').value.trim(), titulo: $('md-titulo').value.trim(), mensagem: $('md-msg').value.trim(), url: $('md-url').value.trim(), imagem: $('md-img').value.trim() };
      const r = await chamar({ action: 'salvarPushModelo', modelo: modelo });
      if (r && r.ok) { modelos = r.modelos; telaModelos(); $('md-res').innerHTML = '<p class="av-ok">✅ Modelo salvo.</p>'; } else $('md-res').innerHTML = '<p class="av-erro">' + esc(erroTxt(r)) + '</p>';
    });
    const nv = $('md-novo'); if (nv) nv.addEventListener('click', () => telaModelos());
    $('md-lista').addEventListener('click', async (ev) => {
      const e = ev.target.closest('[data-edit]'), d = ev.target.closest('[data-del]');
      if (e) telaModelos(modelos[Number(e.dataset.edit)]);
      else if (d) {
        const x = modelos[Number(d.dataset.del)];
        if (!confirm('Excluir o modelo "' + x.rotulo + '"?')) return;
        const r = await chamar({ action: 'excluirPushModelo', id: x.id });
        if (r && r.ok) { modelos = r.modelos; telaModelos(); } else alert(erroTxt(r));
      }
    });
  }

  /* ====================================================================
   * PREPARAR (o que falta para os avisos chegarem)
   * ==================================================================== */
  function item(ok, titulo, corpo) {
    return '<div class="av-check"><span class="av-i" aria-hidden="true">' + (ok === true ? '✅' : (ok === false ? '❌' : 'ℹ️')) + '</span><div><b>' + esc(titulo) + '</b>' + (corpo ? '<div class="g-nota" style="margin:2px 0 0;font-size:.8rem">' + corpo + '</div>' : '') + '</div></div>';
  }
  function telaPreparar() {
    const c = st.contas || {};
    const aparelho = window.TKPush ? TKPush.resumo() : 'sem-app';
    const rotAparelho = {
      ativo: 'Este aparelho está recebendo avisos.', ativando: 'Ativando os avisos neste aparelho…', pendente: 'Este aparelho ainda não ativou os avisos.', pausado: 'Os avisos estão pausados neste aparelho.',
      negado: 'Este aparelho BLOQUEOU os avisos (toque em “Ativar” para ver como liberar).', 'ios-instalar': 'No iPhone é preciso instalar o app primeiro.', 'ios-antigo': 'Este iPhone precisa do iOS 16.4 ou mais novo.',
      embutido: 'Você está dentro do navegador de outro app (Instagram/WhatsApp). Abra no Chrome ou Safari.', bloqueado: 'Um bloqueador de anúncios (ou a rede) impediu o OneSignal de carregar aqui.',
      'nao-suportado': 'Este navegador não recebe avisos.', 'em-breve': 'O OneSignal ainda não está configurado para o site (passo 2).', 'sem-app': 'App ID do OneSignal ausente no site.'
    }[aparelho] || 'Estado: ' + aparelho;
    let passosWeb = '';
    if (st.webPronto === false) {
      passosWeb = '<ol class="av-passos"><li>Entre em <b>onesignal.com</b> → seu app <b>TENKiTER</b> → <b>Settings → Push &amp; In-App → Web</b> (Platforms).</li>' +
        '<li>Escolha <b>Custom Code</b>. Em “Site URL” coloque exatamente <b>' + esc((typeof SITE_URL === 'string' ? SITE_URL : 'https://tenkitermodas.com.br/').replace(/\/$/, '')) + '</b> (sem barra no final).</li>' +
        '<li>Marque <b>Auto Resubscribe</b> e, em “Default Icon URL”, use <b>https://tenkitermodas.com.br/icon-512.png</b>. Salve.</li>' +
        '<li>Volte aqui e toque em <b>Verificar de novo</b>. O passo a passo completo está no arquivo LEIA-ME-AVISOS.md do projeto.</li></ol>';
    }
    $('av-corpo').innerHTML =
      item(!!st.chaveConfigurada && !!st.appId, '1. Chave do OneSignal no servidor', st.chaveConfigurada ? 'App ID <code>' + esc(st.appId) + '</code> e chave configurados (a chave nunca aparece aqui).' : 'Faltam as propriedades <b>ONESIGNAL_APP_ID</b> e <b>ONESIGNAL_REST_API_KEY</b> no Apps Script (⚙️ Configurações do projeto → Propriedades do script).') +
      item(st.webPronto === null ? null : !!st.webPronto, '2. Plataforma Web ligada no OneSignal', st.webPronto ? 'O OneSignal está pronto para entregar avisos em Android, iPhone (app instalado) e computador.' : (st.webPronto === false ? 'O OneSignal respondeu que este app <b>ainda não está configurado para Web push</b>. Sem isso nenhum aviso chega a celular ou computador.' + passosWeb : 'Não deu para consultar o OneSignal agora.')) +
      '<div class="av-linha"><button type="button" class="av-sec" id="pr-verificar">🔄 Verificar de novo</button></div>' +
      item(aparelho === 'ativo' ? true : (aparelho === 'pendente' || aparelho === 'pausado' || aparelho === 'negado' ? false : null), '3. Este aparelho', esc(rotAparelho) + '<div class="av-linha"><button type="button" class="av-prim" id="pr-ativar">🔔 Ativar avisos neste aparelho</button><button type="button" class="av-sec" id="pr-teste-local">Mostrar notificação de teste</button></div>' +
        '<div class="g-nota">Entre com sua conta (WhatsApp e senha) antes de ativar: é assim que os avisos de equipe e de novos pedidos chegam até você.</div>') +
      item(null, '4. Quem pode receber', 'Contas ativas: <b>' + c.total + '</b> — equipe ' + c.equipe + ', alunos ' + c.alunos + ', portal ' + c.portal + ', clientes ' + c.clientes + '.' +
        (st.contasAtivas ? '<br>Com aviso ativo agora: <b>' + st.contasAtivas.total + '</b> — equipe ' + st.contasAtivas.equipe + ', alunos ' + st.contasAtivas.alunos + ', portal ' + st.contasAtivas.portal + ', clientes ' + st.contasAtivas.clientes + '.' : '') +
        (st.aparelhos ? '<br>Aparelhos: <b>' + st.aparelhos.ativos + '</b> com aviso ativo (' + st.aparelhos.ativosNoApp + ' no app), <b>' + st.aparelhos.instalaram + '</b> instalaram o app' + (st.aparelhos.onesignal ? '; no OneSignal <b>' + st.aparelhos.onesignal.recebem + '</b> recebem avisos (de ' + st.aparelhos.onesignal.inscritos + ' inscritos)' : '') + '.' : '') +
        '<br>Cada pessoa só recebe depois de <b>entrar na conta e tocar em “Ativar avisos”</b> no próprio aparelho (o celular exige esse toque). Os avisos para “todos” alcançam também quem não tem conta.') +
      '<div class="av-bloco"><h3>Avisos automáticos</h3>' +
        '<label class="av-sel-linha"><input type="checkbox" id="pr-auto-novo" ' + (st.autoNovoPedido ? 'checked' : '') + '> A equipe é avisada a cada <b>pedido novo</b></label>' +
        '<label class="av-sel-linha"><input type="checkbox" id="pr-auto-etapa" ' + (st.autoPedido ? 'checked' : '') + '> O cliente é avisado quando a <b>etapa do pedido</b> muda</label>' +
        (podeGerir() ? '' : '<p class="g-nota">Só o Admin total altera estas opções.</p>') +
        '<div id="pr-res" role="status"></div></div>';
    $('pr-verificar').addEventListener('click', async () => { await carregarTudo(); if (st) telaPreparar(); });
    $('pr-ativar').addEventListener('click', () => { if (window.TKPush) TKPush.ativar().then(() => telaPreparar()); });
    $('pr-teste-local').addEventListener('click', () => { if (window.TKPush) TKPush.testeLocal().then(() => { $('pr-res').innerHTML = '<p class="av-ok">Se a notificação apareceu no topo da tela, este aparelho está pronto.</p>'; }, () => { $('pr-res').innerHTML = '<p class="av-erro">Não deu para mostrar a notificação de teste aqui. Ative os avisos antes.</p>'; }); });
    ['pr-auto-novo', 'pr-auto-etapa'].forEach((id) => {
      const el = $(id); el.disabled = !podeGerir();
      el.addEventListener('change', async () => {
        const r = await chamar({ action: 'salvarPushConfig', autoNovoPedido: $('pr-auto-novo').checked, autoPedido: $('pr-auto-etapa').checked });
        if (r && r.ok) { st = r; $('pr-res').innerHTML = '<p class="av-ok">✅ Salvo.</p>'; } else { $('pr-res').innerHTML = '<p class="av-erro">' + esc(erroTxt(r)) + '</p>'; telaPreparar(); }
      });
    });
  }

  /* ---------- ligação com a página ---------- */
  (async function iniciar() {
    const v = await versaoServidor();
    if (!v || !v.pushCompleto) return;           // backend antigo: o painel simples de sempre
    document.addEventListener('click', (ev) => {
      const b = ev.target.closest && ev.target.closest('#btn-abrir-push');
      if (!b) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      abrir();
    }, true);
    window.TKAvisosAdmin = { abrir: abrir };
  })();
})();
