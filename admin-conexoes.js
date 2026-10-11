/* ====================================================================
 * TENKiTER — admin-conexoes.js (v3.4) — CONEXÕES (Render / Cloudflare) do Admin total
 *  • Guarda no SERVIDOR (Propriedades do Script) a chave do Render e o token da Cloudflare. A chave nunca volta para esta tela
 *    (só "guardada ✓" + últimos 4 caracteres), nunca fica no navegador (nem em localStorage) e nunca vai ao GitHub.
 *  • "Situação agora": confere feed.csv / feed.xml / sitemap.xml do SEU site, a plataforma Web do OneSignal, as regras e o último deploy
 *    do Render e o Worker da Cloudflare — cada item com o botão que resolve (criar as regras que faltam, guardar a chave).
 *  • "Publicar o site agora": dispara o deploy no Render e acompanha até ficar no ar (o deploy automático é pouco confiável).
 *  • Endereços prontos para copiar e dar à Meta / Google (feed e mapa do site, no domínio da loja).
 * Só liga se o backend (?action=versao) disser conexoes:true e a pessoa tiver gerir_acessos (Admin total) entrando com a conta.
 * Carrega depois de admin-push.js e usa o que a página já tem (adminPin, funcionarioNome, getSessao, abrirComHistorico_...).
 * ==================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => escaparHtml(v);
  let itens = [], status = null, deployTimer = null, ocupado = false;

  /* ---------- backend ---------- */
  function chamar(extra) {
    const sess = (typeof getSessao === 'function' && getSessao()) || null;
    return apiPost(Object.assign({ pin: adminPin, sessao: adminPin, whatsapp: sess ? sess.whatsapp : '', funcionario: funcionarioNome }, extra));
  }
  function erroTxt(r) {
    if (r && r.erro) return r.erro;
    return r && r.semRede ? 'Sem conexão agora. Tente de novo.' : 'Não foi possível agora. Tente de novo.';
  }
  function podeGerir() {
    try { return typeof temPermissao === 'function' && typeof usuarioAdmin !== 'undefined' && !!usuarioAdmin && !!temPermissao(usuarioAdmin, 'gerir_acessos'); } catch (e) { return false; }
  }

  /* ---------- estilo ---------- */
  function css() {
    if ($('cx-css')) return;
    const s = document.createElement('style'); s.id = 'cx-css';
    s.textContent = `
      .sheet-conexoes { max-width: 720px; height: 92vh; max-height: 92vh; }
      .cx-bloco { border: 1px solid #e3e3e3; border-radius: 12px; padding: 10px 12px; margin: 12px 0; background: #fff; }
      .cx-bloco > h3 { margin: 0 0 6px; font-size: 0.92rem; font-family: "Poppins", sans-serif; }
      .cx-lista { list-style: none; margin: 6px 0; padding: 0; }
      .cx-lista li { display: flex; gap: 10px; align-items: flex-start; padding: 9px 0; border-bottom: 1px solid #eee; font-size: 0.85rem; }
      .cx-lista li:last-child { border-bottom: 0; }
      .cx-i { flex: none; font-size: 1.1rem; line-height: 1.3; }
      .cx-t { flex: 1; min-width: 0; overflow-wrap: anywhere; }
      .cx-t b { display: block; color: #111; }
      .cx-t span { color: #333; }
      .cx-lista button, .cx-bloco .cx-btn { width: auto; flex: none; padding: 9px 13px; font-size: 0.82rem; min-height: 40px; border-radius: 8px; cursor: pointer; }
      .cx-prim { background: var(--laranja); color: #0d0d0d; font-weight: 800; border: 0; }
      .cx-sec { background: #eee; color: #222; border: 0; font-weight: 700; }
      .cx-perigo { background: #fde3e3; color: #8a1c1c; border: 0; font-weight: 700; }
      .cx-linha { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
      .cx-chave-ok { color: #146c43; font-weight: 700; font-size: 0.86rem; }
      .cx-chave-sem { color: #6b3f00; font-weight: 700; font-size: 0.86rem; }
      .cx-aviso { background: #fff3e0; border: 1px solid #ffcc80; color: #6b3f00; border-radius: 10px; padding: 8px 10px; font-size: 0.82rem; margin: 8px 0; }
      .cx-msg { min-height: 1.4em; font-size: 0.86rem; margin: 6px 0; overflow-wrap: anywhere; }
      .cx-msg.ok { color: #146c43; font-weight: 700; } .cx-msg.erro { color: var(--vermelho); font-weight: 700; }
      .cx-bloco label { display: block; font-size: 0.82rem; font-weight: 700; margin: 8px 0 4px; }
      .cx-bloco input[type=password] { width: 100%; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; font-size: 0.95rem; background: var(--branco); }
      .cx-copia { display: flex; gap: 6px; margin-bottom: 6px; }
      .cx-copia input { flex: 1; min-width: 0; font-size: 0.78rem; padding: 9px 10px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; }
      .cx-copia button { width: auto; padding: 0 14px; min-height: 40px; background: var(--preto); color: var(--laranja); border: 0; border-radius: 8px; font-size: 0.8rem; cursor: pointer; }
    `;
    document.head.appendChild(s);
  }

  /* ---------- janela ---------- */
  function montar() {
    if ($('overlay-conexoes')) return;
    css();
    const o = document.createElement('div');
    o.className = 'overlay-sheet'; o.id = 'overlay-conexoes';
    o.innerHTML =
      '<div class="sheet sheet-conexoes" role="dialog" aria-modal="true" aria-labelledby="cx-titulo">' +
        '<div class="sheet-topo"><h2 class="gestao-titulo" id="cx-titulo">🔗 Conexões</h2><button type="button" class="sheet-x" id="cx-fechar" aria-label="Fechar">✕</button></div>' +
        '<div class="gestao-corpo" id="cx-corpo" aria-live="polite"></div>' +
      '</div>';
    document.body.appendChild(o);
    $('cx-fechar').addEventListener('click', fechar);
    $('cx-corpo').addEventListener('click', clique);
    window.addEventListener('popstate', () => { o.classList.remove('aberto'); parouDeploy_(); });
  }
  function fechar() { fecharComHistorico_('overlay-conexoes'); parouDeploy_(); }
  function parouDeploy_() { if (deployTimer) { clearTimeout(deployTimer); deployTimer = null; } }

  async function abrir() {
    montar();
    abrirComHistorico_('overlay-conexoes');
    $('cx-corpo').innerHTML = '<p class="g-info">Carregando…</p>';
    const s = await chamar({ action: 'statusConexoes' });
    if (!s || !s.ok) { $('cx-corpo').innerHTML = '<p class="g-erro">' + esc(erroTxt(s)) + '</p>'; return; }
    status = s; itens = [];
    desenhar();
    conferir();
  }

  /* ---------- desenho ---------- */
  const ICONE = { true: '✅', false: '⚠️', null: 'ℹ️' };
  const ROTULO_ACAO = { renderCriarRegras: 'Criar as regras que faltam', 'chave:render': 'Guardar a chave do Render', 'chave:cloudflare': 'Guardar o token da Cloudflare' };
  function fmtData(iso) {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  }
  function blocoChave(nome, titulo, ajuda, aviso) {
    const c = (status.conexoes || {})[nome] || {};
    const quando = fmtData(c.salvaEm);
    return '<div class="cx-bloco" id="cx-bloco-' + nome + '">' +
      '<h3>' + esc(titulo) + '</h3>' +
      (c.temChave
        ? '<p class="cx-chave-ok" id="cx-estado-' + nome + '">✔ Chave guardada no servidor (termina em ' + esc(c.fim) + (quando ? ', desde ' + esc(quando) : '') + ').</p>'
        : '<p class="cx-chave-sem" id="cx-estado-' + nome + '">Sem chave guardada.</p>') +
      '<p class="g-nota">' + ajuda + '</p>' +
      (aviso ? '<div class="cx-aviso">' + aviso + '</div>' : '') +
      '<label for="cx-chave-' + nome + '">' + (c.temChave ? 'Trocar a chave' : 'Colar a chave') + '</label>' +
      '<input type="password" id="cx-chave-' + nome + '" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole aqui — a chave não aparece depois">' +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="guardar" data-nome="' + nome + '">Testar e guardar</button>' +
      (c.temChave ? '<button type="button" class="cx-btn cx-perigo" data-cx="apagar" data-nome="' + nome + '">Apagar a chave guardada</button>' : '') + '</div>' +
      '<div class="cx-msg" id="cx-msg-' + nome + '" role="status"></div>' +
    '</div>';
  }
  function desenhar() {
    const e = status.enderecos || {};
    $('cx-corpo').innerHTML =
      '<p class="g-info">Aqui ficam as chaves que o painel usa para cuidar do site sozinho. Elas ficam guardadas <b>no servidor</b> (Propriedades do Script): <b>nunca voltam para esta tela</b>, não ficam neste aparelho e não vão para o GitHub. Só o Admin total vê esta tela.</p>' +

      '<div class="cx-bloco"><h3>Situação agora</h3>' +
        '<div class="cx-linha"><button type="button" class="cx-btn cx-sec" data-cx="conferir" id="cx-conferir">🔄 Conferir de novo</button></div>' +
        '<ul class="cx-lista" id="cx-itens"><li><span class="cx-i">⏳</span><span class="cx-t">Conferindo…</span></li></ul>' +
        '<div class="cx-msg" id="cx-msg-itens" role="status"></div>' +
      '</div>' +

      '<div class="cx-bloco"><h3>Publicar o site agora</h3>' +
        '<p class="g-nota">Manda o Render publicar a versão mais recente do site (o deploy automático às vezes não dispara). Leva cerca de 1 minuto.</p>' +
        '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="deploy" id="cx-deploy">🚀 Publicar agora</button></div>' +
        '<div class="cx-msg" id="cx-msg-deploy" role="status"></div>' +
      '</div>' +

      blocoChave('render', 'Render — chave da API',
        'Crie em <b>Render → Account Settings → API Keys → Create API Key</b> e cole aqui. Ela serve para conferir/criar as regras do site e publicar. O painel testa a chave antes de guardar.',
        '⚠️ A chave do Render manda em <b>toda a sua conta do Render</b> (não dá para limitar). Por isso ela só fica no servidor e só o Admin total mexe. Se desconfiar de vazamento, apague a chave aqui <b>e</b> revogue-a no Render.') +

      blocoChave('cloudflare', 'Cloudflare — token (opcional)',
        'Crie em <b>Cloudflare → Meu perfil → API Tokens → Create Token</b>, modelo <b>Edit Cloudflare Workers</b>, de preferência com data de fim. Aqui serve só para conferir quando o Worker das miniaturas foi publicado.', '') +

      '<div class="cx-bloco"><h3>Endereços para a Meta e o Google</h3>' +
        '<p class="g-nota">Já no domínio da loja. Na Meta (Gerenciador de Comércio) e no Google Merchant use “fonte de dados por link”; no Google Search Console cadastre o mapa do site.</p>' +
        [['cx-end-csv', 'Catálogo CSV — Meta e Google', e.feedCsv], ['cx-end-xml', 'Catálogo XML — Google Merchant', e.feedXml], ['cx-end-map', 'Mapa do site (sitemap) — Google Search Console', e.sitemap]].map((x) =>
          '<label for="' + x[0] + '">' + esc(x[1]) + '</label><div class="cx-copia"><input type="text" id="' + x[0] + '" readonly value="' + esc(x[2] || '') + '"><button type="button" data-cx="copiar" data-alvo="' + x[0] + '">Copiar</button></div>').join('') +
      '</div>';
  }
  /* O botão "Guardar a chave…" aparece UMA vez (no item da própria chave); os itens do feed/mapa sem chave só explicam. */
  function desenharItens() {
    const ul = $('cx-itens'); if (!ul) return;
    ul.innerHTML = itens.map((x) =>
      '<li><span class="cx-i" aria-hidden="true">' + ICONE[String(x.ok)] + '</span>' +
      '<span class="cx-t"><b>' + esc(x.rotulo) + '</b><span>' + (x.ok === true ? 'Tudo certo. ' : x.ok === false ? 'Atenção. ' : '') + esc(x.detalhe) + '</span></span>' +
      (x.acao && ROTULO_ACAO[x.acao] && (x.acao.indexOf('chave:') !== 0 || /-chave$/.test(x.id)) ? '<button type="button" class="cx-btn ' + (x.ok === false ? 'cx-prim' : 'cx-sec') + '" data-cx="acao" data-acao="' + esc(x.acao) + '">' + esc(ROTULO_ACAO[x.acao]) + '</button>' : '') +
      '</li>').join('') || '<li><span class="cx-t">Nada para mostrar.</span></li>';
  }
  function msg(id, texto, tipo) {
    const el = $(id); if (!el) return;
    el.className = 'cx-msg' + (tipo ? ' ' + tipo : '');
    el.textContent = texto || '';
  }

  /* ---------- ações ---------- */
  async function conferir() {
    if (ocupado) return;
    ocupado = true;
    const b = $('cx-conferir'); if (b) b.disabled = true;
    msg('cx-msg-itens', 'Conferindo…', '');
    const r = await chamar({ action: 'testarConexoes' });
    ocupado = false;
    if (b) b.disabled = false;
    if (!r || !r.ok) { msg('cx-msg-itens', erroTxt(r), 'erro'); return; }
    itens = r.itens || [];
    desenharItens();
    msg('cx-msg-itens', 'Conferido às ' + fmtData(r.quando).split(' ')[1] + '.', '');
  }
  async function recarregarStatus() {
    const s = await chamar({ action: 'statusConexoes' });
    if (s && s.ok) { status = s; desenhar(); }
  }
  async function guardar(nome) {
    const campo = $('cx-chave-' + nome); const chave = campo ? campo.value.trim() : '';
    if (!chave) { msg('cx-msg-' + nome, 'Cole a chave no campo acima primeiro.', 'erro'); if (campo) campo.focus(); return; }
    msg('cx-msg-' + nome, 'Testando a chave…', '');
    const r = await chamar({ action: 'salvarConexao', nome, chave });
    if (campo) campo.value = '';                      // a chave não fica na tela nem no aparelho
    if (!r || !r.ok) { msg('cx-msg-' + nome, erroTxt(r), 'erro'); return; }
    status = r; desenhar();
    msg('cx-msg-' + nome, '✔ Guardada. ' + (r.detalhe || ''), 'ok');
    conferir();
  }
  async function apagar(nome) {
    if (!confirm('Apagar a chave guardada no servidor? O painel deixa de conseguir cuidar disso até você colar outra. (Se quiser, revogue-a também no site do serviço.)')) return;
    const r = await chamar({ action: 'salvarConexao', nome, apagar: true });
    if (!r || !r.ok) { msg('cx-msg-' + nome, erroTxt(r), 'erro'); return; }
    status = r; desenhar();
    msg('cx-msg-' + nome, 'Chave apagada do servidor.', 'ok');
    conferir();
  }
  async function criarRegras() {
    msg('cx-msg-itens', 'Criando as regras no Render…', '');
    const r = await chamar({ action: 'renderCriarRegras' });
    if (!r || !r.ok) { msg('cx-msg-itens', erroTxt(r), 'erro'); return; }
    const n = (r.criadas || []).length;
    msg('cx-msg-itens', n ? '✔ Criei ' + n + ' regra(s): ' + r.criadas.join(', ') + '. Pode levar alguns segundos para valer.' : 'Nada a criar: as regras já estavam no lugar.', 'ok');
    setTimeout(conferir, 4000);
  }
  async function publicar() {
    const b = $('cx-deploy'); if (b) b.disabled = true;
    parouDeploy_();
    msg('cx-msg-deploy', 'Pedindo ao Render para publicar…', '');
    const r = await chamar({ action: 'renderDeploy' });
    if (!r || !r.ok) { if (b) b.disabled = false; msg('cx-msg-deploy', erroTxt(r), 'erro'); return; }
    acompanhar(r.deployId, 0);
  }
  const FALHOU = ['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'];
  function acompanhar(id, n) {
    const espera = Number(window.TK_CONEXOES_POLL_MS) || 5000;
    deployTimer = setTimeout(async () => {
      const r = await chamar({ action: 'renderStatusDeploy', deployId: id });
      const b = $('cx-deploy');
      if (!r || !r.ok) {
        if (n >= 3) { if (b) b.disabled = false; msg('cx-msg-deploy', 'Pedi a publicação, mas não consegui acompanhar: ' + erroTxt(r), 'erro'); return; }
        return acompanhar(id, n + 1);
      }
      if (r.status === 'live') { if (b) b.disabled = false; msg('cx-msg-deploy', '✔ No ar! O site já está com a versão mais recente.', 'ok'); conferir(); return; }
      if (FALHOU.indexOf(r.status) !== -1) { if (b) b.disabled = false; msg('cx-msg-deploy', 'A publicação não terminou (' + r.status + '). Veja o painel do Render.', 'erro'); return; }
      if (n >= 60) { if (b) b.disabled = false; msg('cx-msg-deploy', 'Ainda publicando… confira daqui a pouco em “Conferir de novo”.', ''); return; }
      msg('cx-msg-deploy', 'Publicando… (pode levar cerca de 1 minuto)', '');
      acompanhar(id, n + 1);
    }, n === 0 ? Math.min(espera, 2000) : espera);
  }
  function copiar(alvo) {
    const el = $(alvo); if (!el) return;
    const texto = el.value;
    const aviso = () => msg('cx-msg-itens', 'Copiado!', 'ok');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(aviso).catch(() => { el.select(); window.prompt('Copie o endereço abaixo:', texto); });
    else { el.select(); window.prompt('Copie o endereço abaixo:', texto); }
  }
  function clique(ev) {
    const b = ev.target.closest('[data-cx]'); if (!b) return;
    const a = b.dataset.cx;
    if (a === 'conferir') conferir();
    else if (a === 'guardar') guardar(b.dataset.nome);
    else if (a === 'apagar') apagar(b.dataset.nome);
    else if (a === 'deploy') publicar();
    else if (a === 'copiar') copiar(b.dataset.alvo);
    else if (a === 'acao') {
      const ac = b.dataset.acao;
      if (ac === 'renderCriarRegras') criarRegras();
      else if (ac.indexOf('chave:') === 0) { const c = $('cx-chave-' + ac.slice(6)); if (c) { c.scrollIntoView({ block: 'center' }); c.focus(); } }
    }
  }

  /* ---------- liga ---------- */
  (async function init() {
    const botao = $('btn-abrir-conexoes'); if (!botao) return;
    let v = null;
    try { v = await versaoServidor(); } catch (e) { v = null; }
    if (!v || typeof v !== 'object' || !v.conexoes) return;       // backend antigo: nada muda
    botao.hidden = false;
    botao.addEventListener('click', () => {
      if (!podeGerir()) { alert('Esta tela é só para o Admin total.'); return; }
      abrir();
    });
  })();
})();
