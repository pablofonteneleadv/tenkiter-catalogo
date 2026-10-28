/* ====================================================================
 * TENKiTER — admin-conexoes.js (v3.5) — CONEXÕES (Render / Cloudflare / OneSignal) do Admin total
 *  • v3.5: bloco OneSignal (só com a bandeira conexoesOnesignal do backend): guarda o Organization ID + a Organization API Key e o botão
 *    "Ligar os avisos agora" liga a plataforma Web do app e cria a chave de envio, tudo no servidor (a chave de envio nunca aparece aqui).
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
  let itens = [], status = null, deployTimer = null, ocupado = false, temOnesignal = false, temIntegracoes = false, temCofre = false, cofreCodigo = '', cofreTimer = null, cofreFimEm = 0;

  /* ---------- backend ---------- */
  function chamar(extra) {
    const sess = (typeof getSessao === 'function' && getSessao()) || null;
    return apiPost(Object.assign({ pin: adminPin, sessao: adminPin, whatsapp: sess ? sess.whatsapp : '', funcionario: funcionarioNome }, extra));
  }
  async function igWorker_(caminho, metodo, corpo) {
    const s = (typeof getSessao === 'function' && getSessao()) || null;
    if (!s || typeof INSTAGRAM_URL === 'undefined') return { ok: false, erro: 'Entre com o seu login (não vale só o PIN) para conectar o Instagram.' };
    try {
      const r = await fetch(INSTAGRAM_URL + caminho, { method: metodo, headers: { 'X-TK-Whats': s.whatsapp, 'X-TK-Sessao': s.sessao, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
      return await r.json();
    } catch (e) { return { ok: false, erro: 'Sem conexão agora. Tente de novo.', semRede: true }; }
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
      .cx-grupo { border: 1px solid #d9d9d9; border-radius: 14px; margin: 12px 0; background: #fafafa; }
      .cx-grupo > summary { list-style: none; cursor: pointer; padding: 14px 14px; min-height: 48px; font-weight: 800; font-size: 1rem; font-family: "Poppins", sans-serif; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .cx-grupo > summary::-webkit-details-marker { display: none; }
      .cx-grupo > summary::after { content: "▾"; transition: transform .15s; }
      .cx-grupo[open] > summary::after { transform: rotate(180deg); }
      .cx-grupo > summary:focus-visible { outline: 3px solid #0b5d63; outline-offset: 2px; border-radius: 12px; }
      .cx-grupo > .cx-bloco, .cx-grupo > .cx-grupo-ajuda { margin-left: 10px; margin-right: 10px; }
      .cx-grupo > .cx-grupo-ajuda { margin-top: 0; }
      .cx-grupo > .cx-bloco:last-child { margin-bottom: 12px; }
      .cx-lista { list-style: none; margin: 6px 0; padding: 0; }
      .cx-lista li { display: flex; gap: 10px; align-items: flex-start; padding: 9px 0; border-bottom: 1px solid #eee; font-size: 0.85rem; }
      .cx-lista li:last-child { border-bottom: 0; }
      .cx-i { flex: none; font-size: 1.1rem; line-height: 1.3; }
      .cx-t { flex: 1; min-width: 0; overflow-wrap: anywhere; }
      .cx-t b { display: block; color: #111; }
      .cx-t span { color: #333; }
      .cx-lista button, .cx-bloco .cx-btn { width: auto; flex: none; padding: 9px 13px; font-size: 0.82rem; min-height: 44px; border-radius: 8px; cursor: pointer; }
      .cx-prim { background: var(--laranja); color: #0d0d0d; font-weight: 800; border: 0; }
      .cx-sec { background: #eee; color: #222; border: 0; font-weight: 700; }
      .cx-perigo { background: #fde3e3; color: #8a1c1c; border: 0; font-weight: 700; }
      .cx-zr-diag { white-space: pre-line; font-size: 0.84rem; color: #222; margin: 6px 0; overflow-wrap: anywhere; }
      .cx-bloco .cx-btn:disabled { background: #e6e6e6; color: #555; cursor: not-allowed; }
      .cx-linha { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
      .cx-chave-ok { color: #146c43; font-weight: 700; font-size: 0.86rem; }
      .cx-passos { margin: 4px 0 10px; padding-left: 20px; } .cx-passos li { margin: 2px 0; }
      .cx-zr-escolha { border: 1px solid #e3e3e3; border-radius: 8px; padding: 6px 10px 8px; margin: 6px 0 8px; }
      .cx-zr-escolha legend { font-weight: 700; font-size: 0.86rem; padding: 0 4px; }
      .cx-zr-escolha label { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: 0.9rem; }
      .cx-chave-sem { color: #6b3f00; font-weight: 700; font-size: 0.86rem; }
      .cx-aviso { background: #fff3e0; border: 1px solid #ffcc80; color: #6b3f00; border-radius: 10px; padding: 8px 10px; font-size: 0.82rem; margin: 8px 0; }
      .cx-msg { min-height: 1.4em; font-size: 0.86rem; margin: 6px 0; overflow-wrap: anywhere; }
      .cx-msg.ok { color: #146c43; font-weight: 700; } .cx-msg.erro { color: var(--vermelho); font-weight: 700; }
      .cx-bloco label { display: block; font-size: 0.82rem; font-weight: 700; margin: 8px 0 4px; }
      .cx-bloco input[type=password], .cx-bloco input[type=text].cx-campo { width: 100%; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; font-size: 0.95rem; background: var(--branco); }
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
    document.addEventListener('tk:camada-fechada', (ev) => { if (ev.detail.chave === 'overlay-conexoes') { trancarCofre_(true); parouDeploy_(); } });
  }
  function fechar() { trancarCofre_(true); fecharComHistorico_('overlay-conexoes'); parouDeploy_(); }
  function parouDeploy_() { if (deployTimer) { clearTimeout(deployTimer); deployTimer = null; } }

  async function abrir(secao) {
    montar();
    abrirComHistorico_('overlay-conexoes');
    $('cx-corpo').innerHTML = '<p class="g-info">Carregando…</p>';
    const s = await chamar({ action: 'statusConexoes' });
    if (!s || !s.ok) { $('cx-corpo').innerHTML = '<p class="g-erro">' + esc(erroTxt(s)) + '</p>'; return; }
    status = s; itens = [];
    desenhar();
    conferir();
    if (secao) { const g = $('cx-g-' + secao); if (g) { g.open = true; gruposAbertos.add(g.id); g.scrollIntoView({ block: 'start' }); } }
  }

  /* ---------- desenho ---------- */
  const ICONE = { true: '✅', false: '⚠️', null: 'ℹ️' };
  const ROTULO_ACAO = { renderCriarRegras: 'Criar as regras que faltam', 'chave:render': 'Guardar a chave do Render', 'chave:cloudflare': 'Guardar o token da Cloudflare', onesignalConfigurar: 'Ligar os avisos agora', 'chave:onesignal': 'Guardar a chave do OneSignal' };
  function fmtData(iso) {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  }
  function blocoChave(nome, titulo, ajuda, aviso, antes, depois) {
    const c = (status.conexoes || {})[nome] || {};
    const quando = fmtData(c.salvaEm);
    return '<div class="cx-bloco" id="cx-bloco-' + nome + '">' +
      '<h3>' + esc(titulo) + '</h3>' +
      (c.temChave
        ? '<p class="cx-chave-ok" id="cx-estado-' + nome + '">✔ Chave guardada no servidor (termina em ' + esc(c.fim) + (quando ? ', desde ' + esc(quando) : '') + ').</p>'
        : '<p class="cx-chave-sem" id="cx-estado-' + nome + '">Sem chave guardada.</p>') +
      '<p class="g-nota">' + ajuda + '</p>' +
      (aviso ? '<div class="cx-aviso">' + aviso + '</div>' : '') +
      (antes || '') +
      '<label for="cx-chave-' + nome + '">' + (c.temChave ? 'Trocar a chave' : 'Colar a chave') + '</label>' +
      '<input type="password" id="cx-chave-' + nome + '" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole aqui — a chave não aparece depois">' +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="guardar" data-nome="' + nome + '">Testar e guardar</button>' +
      (c.temChave ? '<button type="button" class="cx-btn cx-perigo" data-cx="apagar" data-nome="' + nome + '">Apagar a chave guardada</button>' : '') + '</div>' +
      (depois || '') +
      '<div class="cx-msg" id="cx-msg-' + nome + '" role="status"></div>' +
    '</div>';
  }
  function blocoOneSignal() {
    const c = (status.conexoes || {}).onesignal || {};
    const antes =
      '<label for="cx-org-onesignal">Organization ID (código público)</label>' +
      '<input type="text" class="cx-campo" id="cx-org-onesignal" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ex.: b036c245-6f4a-4074-b7af-eaaed786933a" value="' + esc(c.orgId || '') + '">';
    const depois =
      '<p class="' + (c.chaveEnvio ? 'cx-chave-ok' : 'cx-chave-sem') + '" id="cx-estado-envio">' + (c.chaveEnvio ? '✔ A chave de envio do app (a que manda os avisos) já está no servidor.' : 'A chave de envio do app ainda não está no servidor — o botão abaixo cria sozinho.') + '</p>' +
      (c.temChave
        ? '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="acao" data-acao="onesignalConfigurar" id="cx-ligar-avisos">📣 Ligar os avisos agora</button></div>'
        : '<p class="g-nota">Guarde a chave acima para liberar o botão “Ligar os avisos agora”.</p>') +
      '<div id="cx-passos-onesignal" aria-live="polite"></div>';
    return blocoChave('onesignal', 'OneSignal — avisos (notificações)',
      'No OneSignal: <b>⚙️ Settings → Organization settings → Security → Keys &amp; IDs → Add Key</b> (nome: <i>TENKiTER site</i>, deixe a lista de IPs vazia). O <b>Organization ID</b> aparece na mesma tela. O painel testa tudo antes de guardar e depois liga a plataforma Web do app e cria a chave de envio.',
      '⚠️ A chave da organização manda em <b>todos os apps</b> da sua conta do OneSignal. Ela só fica no servidor e só o Admin total mexe. Se desconfiar de vazamento, apague aqui <b>e</b> apague a chave no OneSignal. Nunca cole essa chave em conversa: cole só aqui.',
      antes, depois);
  }
  function mostrarPassos(passos) {
    const el = $('cx-passos-onesignal'); if (!el) return;
    el.innerHTML = (passos && passos.length) ? '<ul class="cx-lista">' + passos.map((x) =>
      '<li><span class="cx-i" aria-hidden="true">' + ICONE[String(x.ok)] + '</span><span class="cx-t">' + esc(x.detalhe) + '</span></li>').join('') + '</ul>' : '';
  }
  let gruposAbertos = new Set(['cx-g-site']);
  function desenhar() {
    document.querySelectorAll('#cx-corpo .cx-grupo').forEach((g) => { if (g.open) gruposAbertos.add(g.id); else gruposAbertos.delete(g.id); });
    desenharBase_();
    document.querySelectorAll('#cx-corpo .cx-grupo').forEach((g) => { g.open = gruposAbertos.has(g.id); });
    desenharCofre(); conferirMobile_(); conferirZernio_(); conferirFreeConvert_(); conferirWafly_(); conferirIg_(); if (temIntegracoes) carregarIntegracoes_();
  }
  function grupo_(id, titulo, ajuda, partes, aberto) {
    return '<details class="cx-grupo" id="cx-g-' + id + '"' + (aberto ? ' open' : '') + '><summary><span>' + titulo + '</span></summary>' +
      (ajuda ? '<p class="g-nota cx-grupo-ajuda">' + ajuda + '</p>' : '') + partes.join('') + '</details>';
  }
  function desenharBase_() {
    const e = status.enderecos || {};
    $('cx-corpo').innerHTML =
      '<p class="g-info">Aqui ficam as chaves que o painel usa para cuidar do site sozinho. Elas ficam guardadas <b>no servidor</b> (Propriedades do Script): <b>nunca voltam para esta tela</b>, não ficam neste aparelho e não vão para o GitHub. Só o Admin total vê esta tela.</p>' +
      grupo_('site', '🩺 Situação e publicação do site', '', [
      '<div class="cx-bloco"><h3>Situação agora</h3>' +
        '<div class="cx-linha"><button type="button" class="cx-btn cx-sec" data-cx="conferir" id="cx-conferir">🔄 Conferir de novo</button></div>' +
        '<ul class="cx-lista" id="cx-itens"><li><span class="cx-i">⏳</span><span class="cx-t">Conferindo…</span></li></ul>' +
        '<div class="cx-msg" id="cx-msg-itens" role="status"></div>' +
      '</div>',
      '<div class="cx-bloco"><h3>Publicar o site agora</h3>' +
        '<p class="g-nota">Manda o Render publicar a versão mais recente do site (o deploy automático às vezes não dispara). Leva cerca de 1 minuto.</p>' +
        '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="deploy" id="cx-deploy">🚀 Publicar agora</button></div>' +
        '<div class="cx-msg" id="cx-msg-deploy" role="status"></div>' +
      '</div>'
      ], true) +
      grupo_('android', 'Aplicativo Android · Mensagens', 'Avisos nativos do atendimento.', [
        '<div class="cx-bloco"><p id="cx-mobile-status" role="status">Conferindo…</p><p class="g-nota">Primeiro configure Google Android (FCM) no OneSignal com a conta de serviço do Firebase. Depois cole aqui a App API Key do aplicativo da TENKiTER, em OneSignal → Settings → Keys & IDs. A chave fica somente no servidor.</p><label for="cx-mobile-key">OneSignal · App API Key</label><input id="cx-mobile-key" type="password" autocomplete="new-password" placeholder="Cole a chave de envio aqui"><div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="mobile-guardar">Salvar chave</button><button type="button" class="cx-btn cx-sec" data-cx="mobile-apagar">Remover chave</button></div><p id="cx-mobile-msg" class="cx-msg" role="status"></p><p class="g-nota">Ter a chave salva não comprova a entrega no Android. Instale o APK, entre na conta, ative Avisos e confira uma nova mensagem com o app fechado.</p></div>'
      ], false) +
      grupo_('instagram', '📸 Instagram', 'Conexão do importador e das mensagens, e leitura das fotos por IA.', [
        blocoInstagramWorker_(),
        blocoZernio_(),
        ((status.conexoes && status.conexoes.instagram ? blocoChave('instagram', 'Instagram — token antigo (Apps Script)',
        'Gere em <b>developers.facebook.com → Meus apps → seu app → Instagram → API com login do Instagram → Gerar token</b> (a conta da loja precisa ser <b>Empresa</b>; para postar, marque a permissão <b>instagram_business_content_publish</b>). O painel testa o token no Instagram, liga o importador/postagens (Worker) e guarda uma cópia aqui no cofre.',
        'O token vale ~60 dias; o servidor renova o dele sozinho. Se o Instagram recusar, gere outro e cole aqui.') : ''))
      ], false) +
      grupo_('whatsapp', '💬 WhatsApp (Wafly)', 'Instâncias que publicam os Status e gravam as mensagens.', [
      '<div class="cx-bloco"><h3>💬 WhatsApp Status 1 — Wafly</h3>' +
      '<p class="g-nota">Hoje o Status 1 sai pelo Apps Script. Ao salvar aqui, o servidor passa a falar direto com a Wafly. Se você remover, volta sozinho para o Apps Script. Os três códigos ficam guardados no servidor e não voltam para a tela.</p>' +
      '<p id="cx-wf1-status" role="status" class="cx-chave-sem">Conferindo…</p>' +
      '<label for="cx-wf1-inst">Instância (ID)</label>' +
      '<input type="text" id="cx-wf1-inst" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Código da instância">' +
      '<label for="cx-wf1-tok">Token da instância</label>' +
      '<input type="password" id="cx-wf1-tok" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole o token aqui">' +
      '<label for="cx-wf1-cli">Client-Token da conta</label>' +
      '<input type="password" id="cx-wf1-cli" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole o Client-Token aqui">' +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="wf1-guardar">Salvar</button>' +
      '<button type="button" class="cx-btn" data-cx="wf1-testar">Testar conexão</button>' +
      '<button type="button" class="cx-btn cx-perigo" data-cx="wf1-apagar">Remover</button></div>' +
      '<div id="cx-wf1-msg" class="cx-msg" role="status"></div>' +
      '<ul id="cx-wf1-res" class="g-nota" aria-live="polite"></ul></div>',
      '<div class="cx-bloco"><h3>💬 WhatsApp Status 2 — Wafly</h3>' +
      '<p class="g-nota">Segunda instância da Wafly. Quando cadastrada, ela assume o Status 2 (a fila já agendada para o Status 2 segue por ela). Os três códigos ficam guardados no servidor e não voltam para a tela.</p>' +
      '<p id="cx-wf2-status" role="status" class="cx-chave-sem">Conferindo…</p>' +
      '<label for="cx-wf2-inst">Instância (ID)</label>' +
      '<input type="text" id="cx-wf2-inst" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Código da instância">' +
      '<label for="cx-wf2-tok">Token da instância</label>' +
      '<input type="password" id="cx-wf2-tok" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole o token aqui">' +
      '<label for="cx-wf2-cli">Client-Token da conta</label>' +
      '<input type="password" id="cx-wf2-cli" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole o Client-Token aqui">' +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="wf2-guardar">Salvar</button>' +
      '<button type="button" class="cx-btn" data-cx="wf2-testar">Testar conexão</button>' +
      '<button type="button" class="cx-btn cx-perigo" data-cx="wf2-apagar">Remover</button></div>' +
      '<div id="cx-wf2-msg" class="cx-msg" role="status"></div>' +
      '<ul id="cx-wf2-res" class="g-nota" aria-live="polite"></ul></div>'
      ], false) +
      grupo_('meta', '📣 Meta, Google e busca', 'Pixel, catálogo, mapa do site, sinônimos e segmentos dos avisos.', [
        blocoIntegracoes_(),
      '<div class="cx-bloco"><h3>Endereços para a Meta e o Google</h3>' +
        '<p class="g-nota">Já no domínio da loja. Na Meta (Gerenciador de Comércio) e no Google Merchant use “fonte de dados por link”; no Google Search Console cadastre o mapa do site.</p>' +
        [['cx-end-csv', 'Catálogo CSV — Meta e Google', e.feedCsv], ['cx-end-xml', 'Catálogo XML — Google Merchant', e.feedXml], ['cx-end-map', 'Mapa do site (sitemap) — Google Search Console', e.sitemap]].map((x) =>
          '<label for="' + x[0] + '">' + esc(x[1]) + '</label><div class="cx-copia"><input type="text" id="' + x[0] + '" readonly value="' + esc(x[2] || '') + '"><button type="button" data-cx="copiar" data-alvo="' + x[0] + '">Copiar</button></div>').join('') +
      '</div>'
      ], false) +
      grupo_('servicos', '☁️ Serviços do site', 'Avisos (OneSignal), publicação (Render), Cloudflare e conversão de vídeos.', [
        (temOnesignal ? blocoOneSignal() : ''),
      blocoChave('render', 'Render — chave da API',
        'Crie em <b>Render → Account Settings → API Keys → Create API Key</b> e cole aqui. Ela serve para conferir/criar as regras do site e publicar. O painel testa a chave antes de guardar.',
        '⚠️ A chave do Render manda em <b>toda a sua conta do Render</b> (não dá para limitar). Por isso ela só fica no servidor e só o Admin total mexe. Se desconfiar de vazamento, apague a chave aqui <b>e</b> revogue-a no Render.'),
      blocoChave('cloudflare', 'Cloudflare — token (opcional)',
        'Crie em <b>Cloudflare → Meu perfil → API Tokens → Create Token</b>, modelo <b>Edit Cloudflare Workers</b>, de preferência com data de fim. Aqui serve só para conferir quando o Worker das miniaturas foi publicado.', ''),
      '<div class="cx-bloco"><h3>🎬 FreeConvert — conversão de vídeos</h3>' +
      '<p class="g-nota">Cole a chave de API da FreeConvert para converter vídeos H.265/HEVC em MP4 H.264/AAC nas postagens para grupos. A chave fica guardada no servidor e não volta para a tela.</p>' +
      '<p id="cx-fc-status" role="status" class="cx-chave-sem">Conferindo chave…</p>' +
      '<label for="cx-fc-chave">Chave da API FreeConvert</label>' +
      '<input type="password" id="cx-fc-chave" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole a nova chave aqui">' +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="fc-guardar">Salvar chave</button>' +
      '<button type="button" class="cx-btn cx-perigo" data-cx="fc-apagar">Remover chave</button></div>' +
      '<div id="cx-fc-msg" class="cx-msg" role="status"></div>' +
      '<p class="g-nota">Use uma chave nova; revogue a que foi compartilhada na conversa. A conversão depende da cota disponível na FreeConvert.</p></div>'
      ], false) +
      grupo_('cofre', '🔐 Cofre e dados', '', [
(temCofre ? '<div class="cx-bloco" id="cx-cofre"></div>' : '') + blocoDados()
      ], false);
  }
  /* ---------- COFRE (dupla verificação): 1) login de Admin total  2) senha da conta digitada de novo. O código de abertura vive só na memória desta tela. ---------- */
  const cofreBase_ = [['render', 'Render — chave da API', () => status.conexoes.render], ['cloudflare', 'Cloudflare — token', () => status.conexoes.cloudflare],
    ['onesignal', 'OneSignal — chave da organização', () => status.conexoes.onesignal], ['onesignalEnvio', 'OneSignal — chave de envio dos avisos', () => ({ temChave: !!(status.conexoes.onesignal || {}).chaveEnvio, fim: '' })]]
  /* v7.38: chaves guardadas no servidor das Mensagens (Zernio, Wafly, Wame, Gemini, FreeConvert, ponte dos contatos, Android) entram no mesmo cofre */
  let cofreW = [];
  const cofreItens_ = () => cofreBase_.concat(status && status.conexoes && status.conexoes.instagram ? [['instagram', 'Instagram — token de acesso', () => status.conexoes.instagram]] : [])
    .concat(cofreW.map((x) => ['w:' + x.nome, x.titulo, () => ({ temChave: x.temChave, fim: x.fim })]));
  function desenharCofre() {
    const box = $('cx-cofre'); if (!box || !status) return;
    const aberto = !!cofreCodigo;
    box.innerHTML = '<h3>🔐 Cofre das chaves</h3>' +
      '<p class="g-nota">Para copiar uma chave são <b>duas verificações</b>: você já entrou com o seu login e agora digita a <b>senha da sua conta</b> de novo. Depois de aberto, o cofre se tranca sozinho em 5 minutos. A chave <b>nunca aparece na tela</b>: vai direto para a área de transferência. Cole-a só na conversa com o Claude e <b>revogue depois</b> no site de origem.</p>' +
      (aberto ? '<div class="cx-linha"><span class="cx-t"><b id="cx-cofre-tempo">Cofre aberto</b></span><button type="button" class="cx-btn cx-sec" data-cx="cofre-trancar">🔒 Trancar agora</button></div>' +
        cofreItens_().map((x) => { const c = x[2]() || {}; return '<div class="cx-linha"><span class="cx-t"><b>' + esc(x[1]) + '</b><span>' + (c.temChave ? 'Guardada' + (c.fim ? ' (termina em ' + esc(c.fim) + ')' : '') : 'Ainda não guardada — use o campo acima.') + '</span></span><button type="button" class="cx-btn cx-prim" data-cx="cofre-copiar" data-nome="' + x[0] + '"' + (c.temChave ? '' : ' disabled') + '>Copiar</button></div>'; }).join('')
        : '<label for="cx-cofre-senha">Senha da sua conta</label><div class="cx-copia"><input type="password" id="cx-cofre-senha" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="Digite de novo para abrir"><button type="button" data-cx="cofre-abrir">Abrir cofre</button></div>') +
      '<div class="cx-msg" id="cx-msg-cofre" role="status"></div>';
  }
  function trancarCofre_(silencioso) {
    const tinha = !!cofreCodigo;
    cofreCodigo = ''; cofreFimEm = 0; if (cofreTimer) { clearInterval(cofreTimer); cofreTimer = null; }
    if (tinha) { chamar({ action: 'fecharCofre' }); igWorker_('/cofre/fechar', 'POST', {}); }
    if (!silencioso) { desenharCofre(); msg('cx-msg-cofre', 'Cofre trancado.', 'ok'); }
  }
  async function abrirCofre_() {
    const campo = $('cx-cofre-senha'); const senha = campo ? campo.value : '';
    if (!senha) { msg('cx-msg-cofre', 'Digite a senha da sua conta.', 'erro'); return; }
    msg('cx-msg-cofre', 'Conferindo…', '');
    // abre pelo servidor das Mensagens (ele repassa a senha ao Apps Script e guarda o mesmo código 5 min); fora do ar, abre só o do Apps Script
    let r = await igWorker_('/cofre/abrir', 'POST', { senha: senha });
    const caiu = !r || (!r.ok && !r.senhaRecusada && !(r.erro && /senha/i.test(r.erro) && !r.semRede));   // senha recusada não tenta de novo (não conta falha em dobro)
    if (caiu) r = await chamar({ action: 'abrirCofre', senha: senha });
    if (campo) campo.value = '';                                     // a senha não fica no campo
    if (!r || !r.ok) { msg('cx-msg-cofre', erroTxt(r), 'erro'); return; }
    const it = caiu ? null : await igWorker_('/cofre/itens', 'GET'); cofreW = it && it.ok && Array.isArray(it.itens) ? it.itens : [];
    cofreCodigo = r.cofre; cofreFimEm = Date.now() + (r.validoSegundos || 300) * 1000;
    desenharCofre();
    cofreTimer = setInterval(() => {
      const falta = Math.round((cofreFimEm - Date.now()) / 1000);
      if (falta <= 0) { trancarCofre_(false); return; }
      const el = $('cx-cofre-tempo'); if (el) el.textContent = 'Cofre aberto — tranca em ' + Math.floor(falta / 60) + ':' + String(falta % 60).padStart(2, '0');
    }, 1000);
  }
  async function copiarChave_(nome) {
    if (!cofreCodigo) { desenharCofre(); return; }
    msg('cx-msg-cofre', 'Copiando…', '');
    const r = nome.indexOf('w:') === 0 ? await igWorker_('/cofre/revelar', 'POST', { nome: nome.slice(2), cofre: cofreCodigo }) : await chamar({ action: 'revelarConexao', nome: nome, cofre: cofreCodigo });
    if (!r || !r.ok) { if (r && r.cofreFechado) { cofreCodigo = ''; desenharCofre(); } msg('cx-msg-cofre', erroTxt(r), 'erro'); return; }
    let valor = r.valor; r.valor = '';
    const fim = () => msg('cx-msg-cofre', 'Copiada! Cole na conversa e revogue depois no site de origem.', 'ok');
    try { await navigator.clipboard.writeText(valor); fim(); }
    catch (e) { window.prompt('Seu aparelho não deixou copiar sozinho. Copie abaixo:', valor); fim(); }
    valor = '';
  }

  /* Dados que o Claude pede em toda conversa: só IDs e endereços PÚBLICOS (nunca chave/senha/token — esses não saem do servidor). */
  function blocoDados() {
    const lista = [
      ['Site (endereço final)', typeof SITE_URL !== 'undefined' ? SITE_URL : ''],
      ['Site no Render (endereço de teste)', 'https://tenkiter-catalogo.onrender.com'],
      ['Render — ID do serviço', 'srv-dasa63fpn0mc73fh8fgg'],
      ['Render — ID do workspace', 'tea-d001phk9c44c73fd13h0'],
      ['Apps Script — endereço do catálogo (API)', typeof API_URL_PADRAO !== 'undefined' ? API_URL_PADRAO : ''],
      ['Cloudflare — Worker das miniaturas (og)', 'https://tenkiter-og.distkrpconfeccoes.workers.dev'],
      ['Cloudflare — Worker de mídia (R2)', typeof MIDIA_URL !== 'undefined' ? MIDIA_URL : ''],
      ['Cloudflare — Worker do Instagram', typeof INSTAGRAM_URL !== 'undefined' ? INSTAGRAM_URL : ''],
      ['OneSignal — App ID (público)', typeof ONESIGNAL_APP_ID !== 'undefined' ? ONESIGNAL_APP_ID : '535f6b0d-c866-43c2-b241-43bd7ab62fae'],
      ['Instagram da loja', '@tenkitermodasceara'],
      ['Repositório no GitHub', 'pablofonteneleadv/tenkiter-catalogo']
    ];
    return '<div class="cx-bloco"><h3>Dados para copiar e me passar</h3>' +
      '<p class="g-nota">Toque em <b>Copiar</b> e cole na conversa com o Claude. São só endereços e códigos públicos. <b>Chaves e tokens (Render, Cloudflare, OneSignal, Instagram) não aparecem aqui de propósito</b>: ficam guardados no servidor e nunca voltam para a tela — quando precisar de uma, o Claude vai pedir para você criar uma nova e depois revogar.</p>' +
      lista.map((x, i) => '<label for="cx-dado-' + i + '">' + esc(x[0]) + '</label><div class="cx-copia"><input type="text" id="cx-dado-' + i + '" readonly value="' + esc(x[1]) + '"><button type="button" data-cx="copiar" data-alvo="cx-dado-' + i + '" aria-label="Copiar ' + esc(x[0]) + '">Copiar</button></div>').join('') +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-sec" data-cx="copiartudo">📋 Copiar tudo de uma vez</button></div>' +
      '<div class="cx-msg" id="cx-msg-dados" role="status"></div></div>';
  }
  /* O botão "Guardar a chave…" aparece UMA vez (no item da própria chave); os itens do feed/mapa sem chave só explicam. */
  function desenharItens() {
    const ul = $('cx-itens'); if (!ul) return;
    let ligarJa = false;                                   // "Ligar os avisos agora" aparece em UM item só (dois botões iguais confundem)
    ul.innerHTML = itens.map((x) => {
      const mostra = x.acao && ROTULO_ACAO[x.acao] && (x.acao.indexOf('chave:') !== 0 || /-chave$/.test(x.id)) && !(x.acao === 'onesignalConfigurar' && ligarJa);
      if (mostra && x.acao === 'onesignalConfigurar') ligarJa = true;
      return (
      '<li><span class="cx-i" aria-hidden="true">' + ICONE[String(x.ok)] + '</span>' +
      '<span class="cx-t"><b>' + esc(x.rotulo) + '</b><span>' + (x.ok === true ? 'Tudo certo. ' : x.ok === false ? 'Atenção. ' : '') + esc(x.detalhe) + '</span></span>' +
      (mostra ? '<button type="button" class="cx-btn ' + (x.ok === false ? 'cx-prim' : 'cx-sec') + '" data-cx="acao" data-acao="' + esc(x.acao) + '">' + esc(ROTULO_ACAO[x.acao]) + '</button>' : '') +
      '</li>'); }).join('') || '<li><span class="cx-t">Nada para mostrar.</span></li>';
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
    const extra = {};
    if (nome === 'onesignal') {
      const org = $('cx-org-onesignal'); const orgId = org ? org.value.trim() : '';
      const guardado = (((status.conexoes || {}).onesignal) || {}).orgId;
      if (!orgId && !guardado) { msg('cx-msg-' + nome, 'Cole também o Organization ID (o código da tela Security).', 'erro'); if (org) org.focus(); return; }
      if (orgId) extra.orgId = orgId;
    }
    msg('cx-msg-' + nome, 'Testando a chave…', '');
    if (nome === 'instagram') {       // 1º liga o Worker (importador/postagens); só se ele aceitar, guarda a cópia no cofre
      const w = await igWorker_('/token', 'POST', { token: chave });
      if (!w || !w.ok) { if (campo) campo.value = ''; msg('cx-msg-' + nome, erroTxt(w), 'erro'); return; }
    }
    const r = await chamar(Object.assign({ action: 'salvarConexao', nome, chave }, extra));
    if (campo) campo.value = '';                      // a chave não fica na tela nem no aparelho
    if (!r || !r.ok) { msg('cx-msg-' + nome, erroTxt(r), 'erro'); return; }
    status = r; desenhar();
    msg('cx-msg-' + nome, '✔ Guardada. ' + (r.detalhe || '') + (nome === 'onesignal' ? ' Agora toque em “Ligar os avisos agora”.' : ''), 'ok');
    conferir();
  }
  async function apagar(nome) {
    if (!confirm('Apagar a chave guardada no servidor? O painel deixa de conseguir cuidar disso até você colar outra. (Se quiser, revogue-a também no site do serviço.)')) return;
    if (nome === 'instagram') await igWorker_('/token', 'DELETE');
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
  async function ligarAvisos() {
    if (ocupado) return;
    ocupado = true;
    const b = $('cx-ligar-avisos'); if (b) b.disabled = true;
    msg('cx-msg-onesignal', 'Ligando os avisos… (leva alguns segundos)', '');
    const r = await chamar({ action: 'onesignalConfigurar' });
    ocupado = false;
    if (!r || !r.ok) {
      const b2 = $('cx-ligar-avisos'); if (b2) b2.disabled = false;
      mostrarPassos(r && r.passos); msg('cx-msg-onesignal', erroTxt(r), 'erro'); return;
    }
    status = r; desenhar(); mostrarPassos(r.passos);
    msg('cx-msg-onesignal', r.webPronto ? '✔ Avisos ligados! Os aparelhos já podem ativar as notificações (o app instalado pode levar alguns minutos para perceber).' : '✔ Ligado. O OneSignal ainda não confirmou: toque em “Conferir de novo” daqui a um minuto.', 'ok');
    conferir();
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
    const aviso = () => msg(/^cx-dado-/.test(alvo) ? 'cx-msg-dados' : 'cx-msg-itens', 'Copiado!', 'ok');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(aviso).catch(() => { el.select(); window.prompt('Copie o endereço abaixo:', texto); });
    else { el.select(); window.prompt('Copie o endereço abaixo:', texto); }
  }
  async function conferirFreeConvert_(){
    const el=$('cx-fc-status');if(!el)return;
    const r=await igWorker_('/post/freeconvert/config','GET');
    el.textContent=r.ok?(r.configurada?'✓ Chave FreeConvert configurada.':'Nenhuma chave FreeConvert cadastrada.') : erroTxt(r);
    el.className=r.ok&&r.configurada?'cx-chave-ok':'cx-chave-sem';
  }
  async function guardarFreeConvert_(){
    const campo=$('cx-fc-chave');if(!campo)return;
    const chave=campo.value.trim();
    if(!chave)return msg('cx-fc-msg','Cole uma chave para salvar.','erro');
    msg('cx-fc-msg','Salvando…','');
    const r=await igWorker_('/post/freeconvert/config','POST',{chave});
    if(r.ok){campo.value='';msg('cx-fc-msg','Chave guardada no servidor.','ok');conferirFreeConvert_();}
    else msg('cx-fc-msg',erroTxt(r),'erro');
  }
  async function apagarFreeConvert_(){
    if(!confirm('Remover a chave FreeConvert da Gestão?'))return;
    const r=await igWorker_('/post/freeconvert/config','POST',{apagar:true});
    msg('cx-fc-msg',r.ok?'Chave da Gestão removida.':erroTxt(r),r.ok?'ok':'erro');
    if(r.ok)conferirFreeConvert_();
  }

  /* ---------- Instagram (Worker tenkiter-ig): conexão e leitura das fotos por IA ---------- */
  function blocoInstagramWorker_() {
    return '<div class="cx-bloco"><h3>📥 Instagram — conexão do importador</h3>' +
      '<p id="cx-ig-status" role="status" class="cx-chave-sem">Conferindo…</p>' +
      '<p class="g-nota">O código de acesso fica guardado só no servidor e nunca volta para a tela. Ele serve para importar os posts, ler as mensagens e conferir a conexão.</p>' +
      '<details class="g-det"><summary>Como gerar o código (token)</summary><ol class="g-nota">' +
        '<li>No celular, abra <b>developers.facebook.com</b> → <b>Meus apps</b> → seu app → <b>Casos de uso</b> → <b>Gerenciar mensagens e conteúdo no Instagram</b> → <b>Personalizar</b>.</li>' +
        '<li>No passo <b>Gerar tokens de acesso</b>, toque em <b>Gerar token</b> na conta <b>@tenkitermodasceara</b> e aceite todas as permissões.</li>' +
        '<li>Use o botão <b>Copiar</b> da própria caixa da Meta (o token é longo e começa com <b>IGAA</b>) e cole abaixo.</li></ol></details>' +
      '<label for="cx-ig-token">Código de acesso (token)</label>' +
      '<input type="password" id="cx-ig-token" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole o token aqui">' +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="ig-conectar">Conectar / trocar</button>' +
      '<button type="button" class="cx-btn cx-perigo" data-cx="ig-desconectar">Desconectar</button></div>' +
      '<div class="cx-msg" id="cx-ig-msg" role="status"></div></div>' +
      '<div class="cx-bloco"><h3>🤖 Leitura das fotos por IA (Gemini)</h3>' +
      '<p id="cx-ia-status" role="status" class="cx-chave-sem">Conferindo…</p>' +
      '<p class="g-nota">Com a chave, cada post novo chega com nome, preço escrito na foto, categoria e cores. Crie em <b>aistudio.google.com/apikey</b> → <b>Criar chave de API</b>.</p>' +
      '<label for="cx-ia-chave">Chave da IA (Gemini)</label>' +
      '<input type="password" id="cx-ia-chave" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole a chave aqui">' +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="ia-ligar">Ligar a IA</button>' +
      '<button type="button" class="cx-btn cx-perigo" data-cx="ia-desligar">Desligar a IA</button></div>' +
      '<div class="cx-msg" id="cx-ia-msg" role="status"></div></div>';
  }
  async function conferirIg_() {
    const a = $('cx-ig-status'), b = $('cx-ia-status'); if (!a || !b) return;
    const r = await igWorker_('/status', 'GET');
    if (!r || !r.ok) { a.textContent = erroTxt(r); b.textContent = ''; a.className = b.className = 'cx-chave-sem'; return; }
    a.textContent = r.conectado ? '✔ Conectado' + (r.usuario ? ' como @' + r.usuario : '') + (r.venceEmDias != null ? ' · renovado sozinho (vence em ' + r.venceEmDias + ' dias se algo falhar)' : '') : 'Não conectado.';
    a.className = r.conectado ? 'cx-chave-ok' : 'cx-chave-sem';
    const ligada = !!(r.ia && r.ia.ligada);
    b.textContent = ligada ? '✔ Ligada (chave terminada em ' + (r.ia.fim || '') + ')' : 'Desligada.';
    b.className = ligada ? 'cx-chave-ok' : 'cx-chave-sem';
  }
  async function conectarIg_() {
    const c = $('cx-ig-token'); if (!c) return;
    const t = c.value.trim();
    if (!t) return msg('cx-ig-msg', 'Cole o token primeiro.', 'erro');
    msg('cx-ig-msg', 'Conferindo com o Instagram…', '');
    const r = await igWorker_('/token', 'POST', { token: t });
    if (r && r.ok) { c.value = ''; msg('cx-ig-msg', '✅ Conectado. O token ficou guardado no servidor.', 'ok'); conferirIg_(); }
    else msg('cx-ig-msg', erroTxt(r), 'erro');
  }
  async function desconectarIg_() {
    if (!confirm('Desconectar o Instagram? Os rascunhos já criados continuam em “Produtos para aceitar”.')) return;
    const r = await igWorker_('/token', 'DELETE');
    msg('cx-ig-msg', r && r.ok ? 'Desconectado.' : erroTxt(r), r && r.ok ? 'ok' : 'erro');
    conferirIg_();
  }
  async function ligarIA_() {
    const c = $('cx-ia-chave'); if (!c) return;
    if (!c.value.trim()) return msg('cx-ia-msg', 'Cole a chave primeiro.', 'erro');
    msg('cx-ia-msg', 'Conferindo a chave com o Google…', '');
    const r = await igWorker_('/ia-chave', 'POST', { chave: c.value.trim() });
    if (r && r.ok) { c.value = ''; msg('cx-ia-msg', '✅ IA ligada. Os posts pendentes vão sendo lidos.', 'ok'); conferirIg_(); }
    else msg('cx-ia-msg', erroTxt(r), 'erro');
  }
  async function desligarIA_() {
    if (!confirm('Desligar a leitura por IA? Os posts continuam chegando, só sem o preenchimento automático.')) return;
    const r = await igWorker_('/ia-chave', 'DELETE');
    msg('cx-ia-msg', r && r.ok ? 'IA desligada.' : erroTxt(r), r && r.ok ? 'ok' : 'erro');
    conferirIg_();
  }

  /* ---------- Meta e catálogo (antiga janela "Integrações"): Pixel, API de Conversões, sinônimos, segmentos dos avisos ---------- */
  function blocoIntegracoes_() {
    return '<div class="cx-bloco" id="cx-int"><h3>Pixel, API de Conversões e busca</h3><p class="g-info" id="cx-int-carga">Carregando…</p></div>';
  }
  async function carregarIntegracoes_() {
    const box = $('cx-int'); if (!box) return;
    const r = await chamar({ action: 'statusIntegracoes' });
    if (!r || !r.ok) { box.innerHTML = '<h3>Pixel, API de Conversões e busca</h3><p class="g-nota">' + esc(erroTxt(r)) + '</p>'; return; }
    box.innerHTML = '<h3>Pixel, API de Conversões e busca</h3>' +
      '<p class="g-nota">Tudo aqui fica pronto, mas <b>desligado</b>: com os campos vazios, nada é enviado para a Meta e o aviso de cookies nem aparece para o cliente.</p>' +
      '<label for="int-pixel">ID do Pixel da Meta (só números)</label><input type="text" id="int-pixel" class="cx-campo" inputmode="numeric" autocomplete="off" value="' + esc(r.pixelId) + '" placeholder="Ex.: 1234567890123456">' +
      '<p class="g-nota">Quando preenchido, o catálogo pede a autorização do cliente (aviso de cookies) e só então liga o Pixel. Eventos: ver peça, sacola, WhatsApp e pedido enviado.</p>' +
      '<p class="' + (r.capiConfigurado ? 'cx-chave-ok' : 'cx-chave-sem') + '" id="int-capi-status">' + (r.capiConfigurado ? '✓ Token da API de Conversões configurado (guardado só no servidor)' : '✗ Sem token da API de Conversões') + '</p>' +
      '<label for="int-token">Token de acesso da Meta (API de Conversões, opcional)</label><input type="password" id="int-token" autocomplete="new-password" placeholder="' + (r.capiConfigurado ? 'deixe vazio para manter o atual' : 'cole aqui o token') + '">' +
      '<label for="int-teste">Código de teste de eventos (opcional)</label><input type="text" id="int-teste" class="cx-campo" autocomplete="off" value="' + esc(r.testeCodigo) + '" placeholder="Ex.: TEST12345">' +
      '<details class="g-det"><summary>Avançado</summary><label for="int-graph">Versão da API</label><input type="text" id="int-graph" class="cx-campo" value="' + esc(r.graphVersao) + '"></details>' +
      '<label for="int-sin">Sinônimos da busca: uma por linha, palavra=parecida1,parecida2</label><textarea id="int-sin" rows="4" placeholder="bermuda=short&#10;fantasia=roupa de festa">' + esc(r.sinonimos) + '</textarea>' +
      '<p class="g-nota">Usado só quando o cliente digita algo que não acha nada. Já existem sinônimos padrão (camisa/camiseta, calça/jeans…).</p>' +
      '<label for="int-seg">Segmentos dos avisos (OneSignal), separados por vírgula</label><input type="text" id="int-seg" class="cx-campo" autocomplete="off" value="' + esc(r.segmentosPush) + '" placeholder="Ex.: Clientes Infantil, Clientes Feminino">' +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="int-salvar">Salvar</button>' +
      (r.capiConfigurado ? '<button type="button" class="cx-btn cx-perigo" data-cx="int-limpar">Remover o token guardado</button>' : '') + '</div>' +
      '<div class="cx-msg" id="int-msg" role="status"></div>';
  }
  async function salvarIntegracoes_(extra) {
    msg('int-msg', 'Salvando…', '');
    const corpo = Object.assign({ action: 'salvarIntegracoes', pixelId: $('int-pixel').value.trim(), testeCodigo: $('int-teste').value.trim(), graphVersao: $('int-graph').value.trim(), sinonimos: $('int-sin').value, segmentosPush: $('int-seg').value }, extra || {});
    const t = $('int-token').value.trim(); if (t) corpo.tokenCapi = t;
    const x = await chamar(corpo);
    if (!x || !x.ok) { msg('int-msg', erroTxt(x), 'erro'); return; }
    try { if (typeof CONFIG_PUBLICA_CHAVE !== 'undefined') localStorage.removeItem(CONFIG_PUBLICA_CHAVE); } catch (e) { /* sem armazenamento */ }
    $('int-token').value = '';
    const st = $('int-capi-status'); if (st) { st.textContent = x.capiConfigurado ? '✓ Token da API de Conversões configurado (guardado só no servidor)' : '✗ Sem token da API de Conversões'; st.className = x.capiConfigurado ? 'cx-chave-ok' : 'cx-chave-sem'; }
    msg('int-msg', '✅ Salvo. ' + (x.pixelId ? 'Pixel ativo (' + x.pixelId + ').' : 'Pixel desligado.') + (x.capiConfigurado ? ' API de Conversões pronta.' : ''), 'ok');
  }
  async function conferirWafly_(){
    const r=await igWorker_('/post/wafly/config','GET');
    [1,2].forEach(n=>{
      const el=$('cx-wf'+n+'-status');if(!el)return;
      const x=r.ok&&r.slots?r.slots[n]:null;
      let t;
      if(!r.ok)t=erroTxt(r);
      else if(x&&x.configurada)t='✓ Cadastrada na Gestão · instância '+x.instancia+(x.ultimoTeste?(x.ultimoTeste.ok?' · último teste: ok':' · último teste: com problema'):'');
      else t=n===1?'Em uso: Apps Script (nada cadastrado aqui).':'Nenhuma instância cadastrada.';
      el.textContent=t;el.className=r.ok&&x&&x.configurada?'cx-chave-ok':'cx-chave-sem';
      const i=$('cx-wf'+n+'-inst');if(i&&x&&x.instancia&&!i.value)i.value=x.instancia;
    });
  }
  async function guardarWafly_(n){
    const i=$('cx-wf'+n+'-inst'),t=$('cx-wf'+n+'-tok'),c=$('cx-wf'+n+'-cli');if(!i||!t||!c)return;
    if(!i.value.trim()||!t.value.trim()||!c.value.trim())return msg('cx-wf'+n+'-msg','Preencha os três campos para salvar.','erro');
    msg('cx-wf'+n+'-msg','Salvando…','');
    const r=await igWorker_('/post/wafly/config','POST',{slot:n,instance:i.value.trim(),token:t.value.trim(),clientToken:c.value.trim()});
    if(r.ok){t.value='';c.value='';msg('cx-wf'+n+'-msg','Guardado no servidor. Toque em “Testar conexão” para conferir.','ok');conferirWafly_();}
    else msg('cx-wf'+n+'-msg',erroTxt(r),'erro');
  }
  async function testarWafly_(n){
    const ul=$('cx-wf'+n+'-res');if(!ul)return;
    msg('cx-wf'+n+'-msg','Testando a conexão…','');ul.textContent='';
    const r=await igWorker_('/post/wafly/teste','POST',{slot:n});
    (r.itens||[]).forEach(x=>{const li=document.createElement('li');li.textContent=x.nome+': '+x.texto+'.';ul.appendChild(li)});
    if(r.itens)msg('cx-wf'+n+'-msg',r.ok?'✓ Tudo certo. O teste só consulta; nada foi enviado.':'Algo precisa de atenção (veja a lista).',r.ok?'ok':'erro');
    else msg('cx-wf'+n+'-msg',erroTxt(r),'erro');
    conferirWafly_();
  }
  async function apagarWafly_(n){
    if(!confirm(n===1?'Remover o cadastro do Wafly 1? O Status 1 volta a sair pelo Apps Script.':'Remover o cadastro do Wafly 2? Os itens do Status 2 ficam aguardando até você cadastrar outra instância.'))return;
    const r=await igWorker_('/post/wafly/config','POST',{slot:n,apagar:true});
    msg('cx-wf'+n+'-msg',r.ok?'Cadastro removido. A fila não foi alterada.':erroTxt(r),r.ok?'ok':'erro');
    if(r.ok){const ul=$('cx-wf'+n+'-res');ul&&(ul.textContent='');conferirWafly_();}
  }
  /* v7.35: Zernio (Instagram Direct pela API oficial). A chave fica só no servidor; aqui só aparece se está guardada e qual Instagram está conectado. */
  function blocoZernio_() {
    return '<div class="cx-bloco"><h3>Instagram Direct · Zernio</h3>' +
      '<p id="cx-zr-status" role="status">Conferindo…</p>' +
      '<div id="cx-zr-contas" hidden></div>' +
      '<div class="cx-linha" id="cx-zr-ligar" hidden><button type="button" class="cx-btn cx-prim" data-cx="zr-ligar">Ligar mensagens do Direct</button></div>' +
      '<ol class="g-nota cx-passos"><li>Crie a conta em <b>zernio.com</b> (grátis até 2 contas).</li><li>No Zernio, conecte o Instagram da loja (conta Empresa ou Criador).</li><li>Em <b>Settings → API Keys</b>, crie uma chave e cole aqui.</li></ol>' +
      '<label for="cx-zr-key">Zernio · chave de API</label><input id="cx-zr-key" type="password" autocomplete="new-password" placeholder="Cole a chave aqui">' +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="zr-guardar">Salvar e conferir</button><button type="button" class="cx-btn cx-sec" data-cx="zr-apagar">Remover chave</button></div>' +
      '<p id="cx-zr-msg" class="cx-msg" role="status"></p>' +
      '<div class="cx-linha" id="cx-zr-diag-l" hidden><button type="button" class="cx-btn cx-sec" data-cx="zr-diag">Conferir entregas</button><button type="button" class="cx-btn cx-sec" data-cx="zr-testar">Testar aviso</button></div>' +
      '<div id="cx-zr-diag" class="cx-zr-diag" role="status"></div>' +
      '<p class="g-nota">O servidor confere a chave no Zernio sem enviar nenhuma mensagem e liga o aviso de mensagens novas: as DMs do Instagram aparecem em Mensagens → Instagram, com a foto do story que o cliente respondeu.</p></div>';
  }
  function textoZernio_(r) {
    if (!r || !r.ok) return erroTxt(r);
    if (!r.configurada) return 'Nenhuma chave guardada.';
    if (!(r.conta && r.conta.usuario)) return '✓ Chave guardada · falta conectar o Instagram no Zernio';
    const ult = r.ultimoAviso && r.ultimoAviso.em ? ' · último aviso ' + fmtData(r.ultimoAviso.em) : '';
    return '✓ Instagram conectado: @' + r.conta.usuario + (r.avisoLigado ? ' · mensagens do Direct ligadas' + ult : ' · mensagens do Direct ainda desligadas: toque em “Ligar mensagens do Direct”');
  }
  async function conferirZernio_() {
    const el = $('cx-zr-status'); if (!el) return;
    const r = await igWorker_('/msg/zernio/config', 'GET');
    el.textContent = textoZernio_(r); el.className = r && r.ok && r.configurada ? 'cx-chave-ok' : 'cx-chave-sem';
    const dg = $('cx-zr-diag-l'); if (dg) dg.hidden = !(r && r.ok && r.configurada && r.conta);
    const lig = $('cx-zr-ligar'); if (lig) { lig.hidden = !(r && r.ok && r.configurada && r.conta && !r.avisoLigado); lig.dataset.conta = r && r.conta ? r.conta.id : ''; }
    if (r && r.ok && r.configurada) { const l = await igWorker_('/msg/zernio/config', 'POST', { listar: true }); desenharContasZernio_(l); } else desenharContasZernio_(null);
  }
  /* mais de um Instagram conectado no Zernio: o gestor escolhe qual é o da loja */
  function desenharContasZernio_(r) {
    const box = $('cx-zr-contas'); if (!box) return;
    const contas = r && r.ok && Array.isArray(r.contas) ? r.contas : [];
    box.hidden = contas.length < 2; box.textContent = ''; if (box.hidden) return;
    const fs = document.createElement('fieldset'); fs.className = 'cx-zr-escolha';
    const lg = document.createElement('legend'); lg.textContent = 'Qual Instagram é o da loja?'; fs.appendChild(lg);
    contas.forEach((c) => {
      const lb = document.createElement('label'), i = document.createElement('input');
      i.type = 'radio'; i.name = 'cx-zr-conta'; i.value = c.id; i.checked = !!(r.conta && r.conta.id === c.id);
      lb.append(i, document.createTextNode(' @' + c.usuario)); fs.appendChild(lb);
    });
    const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'cx-btn cx-prim'; bt.dataset.cx = 'zr-escolher'; bt.textContent = 'Usar este Instagram';
    box.append(fs, bt);
  }
  /* v7.38.2: pergunta ao próprio Zernio se o aviso está ativo e como foram as últimas entregas para o nosso servidor */
  const horaZr_ = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
  async function diagnosticoZernio_(testar) {
    const box = $('cx-zr-diag'); if (!box) return;
    box.textContent = testar ? 'Pedindo ao Zernio um aviso de teste…' : 'Conferindo no Zernio…';
    const antes = await igWorker_('/msg/zernio/config', 'GET'), ultAntes = antes && antes.ultimoAviso ? antes.ultimoAviso.em : '';
    const r = await igWorker_('/msg/zernio/config', 'POST', testar ? { testar: true } : { diagnostico: true });
    if (!r || !r.ok) { box.textContent = erroTxt(r); return; }
    const linhas = [];
    const a = r.aviso || {};
    if (!a.existe) linhas.push('✗ O Zernio não tem o aviso de mensagens deste servidor. Toque em "Ligar mensagens do Direct" ou em "Salvar e conferir".');
    else {
      linhas.push(a.ativo ? '✓ Aviso ativo no Zernio.' : '✗ O Zernio DESLIGOU o aviso (falhas seguidas). Toque em "Salvar e conferir" para religar.');
      if (!a.esteServidor) linhas.push('✗ O aviso aponta para outro endereço. Toque em "Salvar e conferir".');
      if (!a.contaCerta) linhas.push('✗ O aviso está ligado para outro Instagram. Escolha o da loja de novo.');
      if (a.eventos && a.eventos.length) linhas.push('Eventos: ' + a.eventos.join(', ') + '.');
    }
    if (testar) {
      if (!r.teste || !r.teste.enviado) linhas.push('✗ O Zernio não aceitou mandar o teste' + (r.teste ? ' (HTTP ' + r.teste.codigo + ')' : '') + '.');
      else {
        await new Promise((ok) => setTimeout(ok, 6000));
        const depois = await igWorker_('/msg/zernio/config', 'GET'), u = depois && depois.ultimoAviso;
        linhas.push(u && u.em && u.em !== ultAntes ? '✓ O teste chegou ao nosso servidor às ' + horaZr_(u.em) + (u.res === 'assinatura' ? ', mas com assinatura errada: toque em "Salvar e conferir".' : '.') : '✗ O teste não chegou ao nosso servidor em 6 segundos.');
      }
    }
    if (r.entregas && r.entregas.length) {
      linhas.push('Últimas entregas do Zernio:');
      r.entregas.forEach((e) => linhas.push('• ' + horaZr_(e.em) + ' · ' + (e.evento || 'evento') + ' · ' + (e.situacao || '?') + (e.codigo ? ' (HTTP ' + e.codigo + ')' : '') + (e.erro ? ' · ' + e.erro : '') + (e.teste ? ' · teste' : '')));
    } else linhas.push(r.logsDisponiveis ? 'O Zernio não registrou nenhuma entrega recente para este aviso.' : 'O Zernio não mostrou o histórico de entregas agora.');
    if (r.ultimoRecebido && r.ultimoRecebido.em) linhas.push('Último aviso recebido aqui: ' + horaZr_(r.ultimoRecebido.em) + (r.ultimoRecebido.evento ? ' (' + r.ultimoRecebido.evento + ')' : '') + '.');
    box.textContent = linhas.join('\n');
  }
  /* liga o aviso de mensagens usando a chave já guardada (não precisa colar de novo) */
  async function ligarDirectZernio_() {
    const lig = $('cx-zr-ligar'), id = lig ? lig.dataset.conta : ''; if (!id) return;
    msg('cx-zr-msg', 'Ligando as mensagens do Direct…', '');
    const r = await igWorker_('/msg/zernio/config', 'POST', { escolher: id });
    if (r && r.ok && (!r.aviso || r.aviso.ok)) { msg('cx-zr-msg', 'Pronto: as mensagens do Direct passam a chegar em Mensagens → Instagram.', 'ok'); conferirZernio_(); }
    else msg('cx-zr-msg', (r && r.aviso && r.aviso.erro) || erroTxt(r), 'erro');
  }
  async function escolherZernio_() {
    const sel = document.querySelector('input[name=cx-zr-conta]:checked'); if (!sel) return msg('cx-zr-msg', 'Marque o Instagram da loja.', 'erro');
    msg('cx-zr-msg', 'Guardando…', '');
    const r = await igWorker_('/msg/zernio/config', 'POST', { escolher: sel.value });
    if (r && r.ok) { msg('cx-zr-msg', 'Pronto: o Direct vai usar @' + (r.conta ? r.conta.usuario : '') + '.', 'ok'); conferirZernio_(); } else msg('cx-zr-msg', erroTxt(r), 'erro');
  }
  async function configurarZernio_(apagar) {
    const input = $('cx-zr-key'); if (!input) return;
    if (apagar && !confirm('Remover a chave do Zernio do servidor? Nada muda no Instagram.')) return;
    if (!apagar && !input.value.trim()) return msg('cx-zr-msg', 'Cole a chave do Zernio antes de salvar.', 'erro');
    msg('cx-zr-msg', apagar ? 'Removendo…' : 'Conferindo a chave no Zernio…', '');
    const r = await igWorker_('/msg/zernio/config', 'POST', apagar ? { apagar: true } : { chave: input.value.trim() });
    if (r && r.ok) {
      input.value = '';
      const avisoTxt = r.aviso ? (r.aviso.ok ? ' As mensagens do Direct passam a chegar em Mensagens → Instagram.' : ' ' + r.aviso.erro) : '';
      msg('cx-zr-msg', apagar ? 'Chave removida e aviso de mensagens desligado.' : (r.conta ? 'Chave conferida e guardada no servidor.' + avisoTxt + (r.contas && r.contas.length > 1 ? ' Há mais de um Instagram: confira qual é o da loja abaixo.' : '') : 'Chave guardada. Agora conecte o Instagram no Zernio e toque em “Salvar e conferir” de novo.'), r.aviso && !r.aviso.ok ? 'erro' : 'ok');
      conferirZernio_();
    }
    else msg('cx-zr-msg', erroTxt(r), 'erro');
  }
  async function conferirMobile_(){const el=$('cx-mobile-status');if(!el)return;const r=await igWorker_('/msg/mobile/config','GET');el.textContent=r&&r.ok?(r.configurada?'Chave de envio salva. Falta conferir a entrega no aparelho.':'Chave de envio Android ainda não configurada.'):erroTxt(r);}
  async function configurarMobile_(apagar){const input=$('cx-mobile-key');if(apagar&&!confirm('Desativar o envio de avisos Android pelo servidor?'))return;const r=await igWorker_('/msg/mobile/config','POST',apagar?{apagar:true}:{chave:input.value.trim()});if(r&&r.ok){input.value='';msg('cx-mobile-msg',apagar?'Chave removida.':'Chave conferida e salva no servidor.','ok');conferirMobile_();}else msg('cx-mobile-msg',erroTxt(r),'erro');}
  function clique(ev) {
    const b = ev.target.closest('[data-cx]'); if (!b) return;
    const a = b.dataset.cx;
    if(a==='mobile-guardar')configurarMobile_(false);
    else if (a === 'zr-guardar') configurarZernio_(false);
    else if (a === 'zr-apagar') configurarZernio_(true);
    else if (a === 'zr-diag') diagnosticoZernio_(false);
    else if (a === 'zr-testar') diagnosticoZernio_(true);
    else if (a === 'zr-escolher') escolherZernio_();
    else if (a === 'zr-ligar') ligarDirectZernio_();
    else if(a==='mobile-apagar')configurarMobile_(true);
    else if (a === 'fc-guardar') guardarFreeConvert_();
    else if (a === 'fc-apagar') apagarFreeConvert_();
    else if (/^wf[12]-/.test(a)) { const n = Number(a[2]), q = a.slice(4); if (q === 'guardar') guardarWafly_(n); else if (q === 'testar') testarWafly_(n); else if (q === 'apagar') apagarWafly_(n); }
    else if (a === 'ig-conectar') conectarIg_();
    else if (a === 'ig-desconectar') desconectarIg_();
    else if (a === 'ia-ligar') ligarIA_();
    else if (a === 'ia-desligar') desligarIA_();
    else if (a === 'int-salvar') salvarIntegracoes_();
    else if (a === 'int-limpar') { if (confirm('Remover o token da API de Conversões guardado no servidor?')) salvarIntegracoes_({ limparTokenCapi: true }).then(carregarIntegracoes_); }
    else if (a === 'conferir') conferir();
    else if (a === 'guardar') guardar(b.dataset.nome);
    else if (a === 'apagar') apagar(b.dataset.nome);
    else if (a === 'deploy') publicar();
    else if (a === 'copiar') copiar(b.dataset.alvo);
    else if (a === 'cofre-abrir') abrirCofre_();
    else if (a === 'cofre-trancar') trancarCofre_(false);
    else if (a === 'cofre-copiar') copiarChave_(b.dataset.nome);
    else if (a === 'copiartudo') {
      const t = Array.from(document.querySelectorAll('#cx-corpo [id^=cx-dado-]')).map((i) => (document.querySelector('label[for=' + i.id + ']') || {}).textContent + ': ' + i.value).join('\n');
      const ok = () => msg('cx-msg-dados', 'Tudo copiado!', 'ok');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok).catch(() => window.prompt('Copie abaixo:', t)); else window.prompt('Copie abaixo:', t);
    }
    else if (a === 'acao') {
      const ac = b.dataset.acao;
      if (ac === 'renderCriarRegras') criarRegras();
      else if (ac === 'onesignalConfigurar') ligarAvisos();
      else if (ac.indexOf('chave:') === 0) { const c = $('cx-chave-' + ac.slice(6)); if (c) { c.scrollIntoView({ block: 'center' }); c.focus(); } }
    }
  }

  /* ---------- liga ---------- */
  (async function init() {
    const botao = $('btn-abrir-conexoes'); if (!botao) return;
    let v = null;
    try { v = await versaoServidor(); } catch (e) { v = null; }
    if (!v || typeof v !== 'object' || !v.conexoes) return;       // backend antigo: nada muda
    temOnesignal = !!v.conexoesOnesignal; temIntegracoes = !!v.integracoes; temCofre = !!v.conexoesCopiar;                          // backend 3.4: sem o bloco do OneSignal
    botao.hidden = false;
    botao.addEventListener('click', () => {
      if (!podeGerir()) { alert('Esta tela é só para o Admin total.'); return; }
      abrir();
    });
    window.TKConexoes = { abrir: (secao) => { if (!podeGerir()) { alert('Esta tela é só para o Admin total.'); return; } abrir(secao); } };
  })();
})();
