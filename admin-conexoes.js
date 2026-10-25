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
  let itens = [], status = null, deployTimer = null, ocupado = false, temOnesignal = false, temCofre = false, cofreCodigo = '', cofreTimer = null, cofreFimEm = 0;

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

  async function abrir() {
    montar();
    abrirComHistorico_('overlay-conexoes');
    $('cx-corpo').innerHTML = '<p class="g-info">Carregando…</p>';
    const s = await chamar({ action: 'statusConexoes' });
    if (!s || !s.ok) { $('cx-corpo').innerHTML = '<p class="g-erro">' + esc(erroTxt(s)) + '</p>'; return; }
    status = s; itens = [];
    desenhar();
    conferir();
    conferirFreeConvert_();
    conferirWame_();
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
  function desenhar() { desenharBase_(); desenharCofre(); }
  function desenharBase_() {
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

      (temOnesignal ? blocoOneSignal() : '') +

      blocoChave('render', 'Render — chave da API',
        'Crie em <b>Render → Account Settings → API Keys → Create API Key</b> e cole aqui. Ela serve para conferir/criar as regras do site e publicar. O painel testa a chave antes de guardar.',
        '⚠️ A chave do Render manda em <b>toda a sua conta do Render</b> (não dá para limitar). Por isso ela só fica no servidor e só o Admin total mexe. Se desconfiar de vazamento, apague a chave aqui <b>e</b> revogue-a no Render.') +

      (status.conexoes && status.conexoes.instagram ? blocoChave('instagram', 'Instagram — token de acesso',
        'Gere em <b>developers.facebook.com → Meus apps → seu app → Instagram → API com login do Instagram → Gerar token</b> (a conta da loja precisa ser <b>Empresa</b>; para postar, marque a permissão <b>instagram_business_content_publish</b>). O painel testa o token no Instagram, liga o importador/postagens (Worker) e guarda uma cópia aqui no cofre.',
        'O token vale ~60 dias; o servidor renova o dele sozinho. Se o Instagram recusar, gere outro e cole aqui.') : '') +

      '<div class="cx-bloco"><h3>🎬 FreeConvert — conversão de vídeos</h3>' +
      '<p class="g-nota">Cole a chave de API da FreeConvert para converter vídeos H.265/HEVC em MP4 H.264/AAC nas postagens para grupos. A chave fica guardada no servidor e não volta para a tela.</p>' +
      '<p id="cx-fc-status" role="status" class="cx-chave-sem">Conferindo chave…</p>' +
      '<label for="cx-fc-chave">Chave da API FreeConvert</label>' +
      '<input type="password" id="cx-fc-chave" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole a nova chave aqui">' +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="fc-guardar">Salvar chave</button>' +
      '<button type="button" class="cx-btn cx-perigo" data-cx="fc-apagar">Remover chave</button></div>' +
      '<div id="cx-fc-msg" class="cx-msg" role="status"></div>' +
      '<p class="g-nota">Use uma chave nova; revogue a que foi compartilhada na conversa. A conversão depende da cota disponível na FreeConvert.</p></div>' +

      '<div class="cx-bloco"><h3>💬 WhatsApp Status 2 — Wame</h3>' +
      '<p class="g-nota">Cole a chave da instância do Wame (WhatsApp 2) e escolha o servidor em que ela foi criada. A chave fica guardada no servidor e não volta para a tela.</p>' +
      '<p id="cx-wm-status" role="status" class="cx-chave-sem">Conferindo chave…</p>' +
      '<label for="cx-wm-chave">Chave da instância Wame</label>' +
      '<input type="password" id="cx-wm-chave" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Cole a chave aqui">' +
      '<label for="cx-wm-servidor">Servidor</label>' +
      '<select id="cx-wm-servidor"><option value="server.wame.api.br">server.wame.api.br (padrão)</option><option value="us.api-wa.me">us.api-wa.me (EUA)</option><option value="server.api-wa.me">server.api-wa.me</option></select>' +
      '<div class="cx-linha"><button type="button" class="cx-btn cx-prim" data-cx="wm-guardar">Salvar</button>' +
      '<button type="button" class="cx-btn" data-cx="wm-testar">Testar conexão</button>' +
      '<button type="button" class="cx-btn cx-perigo" data-cx="wm-apagar">Remover chave</button></div>' +
      '<div id="cx-wm-msg" class="cx-msg" role="status"></div>' +
      '<ul id="cx-wm-res" class="g-nota" aria-live="polite"></ul>' +
      '<p class="g-nota">O teste só consulta a instância (não envia nada) e procura em qual servidor a chave funciona. Depois, faça um primeiro envio real com uma única postagem no Status 2.</p></div>' +

      blocoChave('cloudflare', 'Cloudflare — token (opcional)',
        'Crie em <b>Cloudflare → Meu perfil → API Tokens → Create Token</b>, modelo <b>Edit Cloudflare Workers</b>, de preferência com data de fim. Aqui serve só para conferir quando o Worker das miniaturas foi publicado.', '') +

      '<div class="cx-bloco"><h3>Endereços para a Meta e o Google</h3>' +
        '<p class="g-nota">Já no domínio da loja. Na Meta (Gerenciador de Comércio) e no Google Merchant use “fonte de dados por link”; no Google Search Console cadastre o mapa do site.</p>' +
        [['cx-end-csv', 'Catálogo CSV — Meta e Google', e.feedCsv], ['cx-end-xml', 'Catálogo XML — Google Merchant', e.feedXml], ['cx-end-map', 'Mapa do site (sitemap) — Google Search Console', e.sitemap]].map((x) =>
          '<label for="' + x[0] + '">' + esc(x[1]) + '</label><div class="cx-copia"><input type="text" id="' + x[0] + '" readonly value="' + esc(x[2] || '') + '"><button type="button" data-cx="copiar" data-alvo="' + x[0] + '">Copiar</button></div>').join('') +
      '</div>' + (temCofre ? '<div class="cx-bloco" id="cx-cofre"></div>' : '') + blocoDados();
  }
  /* ---------- COFRE (dupla verificação): 1) login de Admin total  2) senha da conta digitada de novo. O código de abertura vive só na memória desta tela. ---------- */
  const cofreBase_ = [['render', 'Render — chave da API', () => status.conexoes.render], ['cloudflare', 'Cloudflare — token', () => status.conexoes.cloudflare],
    ['onesignal', 'OneSignal — chave da organização', () => status.conexoes.onesignal], ['onesignalEnvio', 'OneSignal — chave de envio dos avisos', () => ({ temChave: !!(status.conexoes.onesignal || {}).chaveEnvio, fim: '' })]]
  const cofreItens_ = () => cofreBase_.concat(status && status.conexoes && status.conexoes.instagram ? [['instagram', 'Instagram — token de acesso', () => status.conexoes.instagram]] : []);
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
    if (tinha) chamar({ action: 'fecharCofre' });
    if (!silencioso) { desenharCofre(); msg('cx-msg-cofre', 'Cofre trancado.', 'ok'); }
  }
  async function abrirCofre_() {
    const campo = $('cx-cofre-senha'); const senha = campo ? campo.value : '';
    if (!senha) { msg('cx-msg-cofre', 'Digite a senha da sua conta.', 'erro'); return; }
    msg('cx-msg-cofre', 'Conferindo…', '');
    const r = await chamar({ action: 'abrirCofre', senha: senha });
    if (campo) campo.value = '';                                     // a senha não fica no campo
    if (!r || !r.ok) { msg('cx-msg-cofre', erroTxt(r), 'erro'); return; }
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
    const r = await chamar({ action: 'revelarConexao', nome: nome, cofre: cofreCodigo });
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
  async function conferirWame_(){
    const el=$('cx-wm-status');if(!el)return;
    const r=await igWorker_('/post/wame/config','GET');
    if(r.ok&&r.servidor){const sel=$('cx-wm-servidor');if(sel&&Array.from(sel.options).some(o=>o.value===r.servidor))sel.value=r.servidor}
    el.textContent=r.ok?(r.configurada?(r.origem==='worker'?'✓ Chave Wame configurada no servidor':'✓ Chave Wame configurada')+' · '+r.servidor:'Nenhuma chave Wame cadastrada.') : erroTxt(r);
    el.className=r.ok&&r.configurada?'cx-chave-ok':'cx-chave-sem';
  }
  async function guardarWame_(){
    const campo=$('cx-wm-chave'),sel=$('cx-wm-servidor');if(!campo||!sel)return;
    const chave=campo.value.trim(),corpo={servidor:sel.value};
    if(chave)corpo.chave=chave;
    msg('cx-wm-msg','Salvando…','');
    const r=await igWorker_('/post/wame/config','POST',corpo);
    if(r.ok){campo.value='';msg('cx-wm-msg',chave?'Chave e servidor guardados no servidor.':'Servidor atualizado.','ok');conferirWame_();}
    else msg('cx-wm-msg',erroTxt(r),'erro');
  }
  async function testarWame_(){
    const ul=$('cx-wm-res');if(!ul)return;
    msg('cx-wm-msg','Testando a conexão…','');ul.textContent='';
    const r=await igWorker_('/post/wame/teste','POST',{});
    if(!r.ok)return msg('cx-wm-msg',erroTxt(r),'erro');
    (r.resultados||[]).forEach(x=>{const li=document.createElement('li');li.textContent=x.servidor+': '+x.texto+'.';ul.appendChild(li)});
    if(r.encontrado){
      const outro=r.encontrado!==r.servidorAtual;
      msg('cx-wm-msg',(r.conectado===true?'✓ WhatsApp conectado em ':'A chave funciona em ')+r.encontrado+'.'+(outro?' Escolha esse servidor acima e toque em Salvar.':''),r.conectado===false?'erro':'ok');
    }else msg('cx-wm-msg','Nenhum servidor aceitou a chave. Confira se a chave está certa e a instância criada no painel do Wame.','erro');
  }
  async function apagarWame_(){
    if(!confirm('Remover a chave e o servidor do Wame guardados na Gestão?'))return;
    const r=await igWorker_('/post/wame/config','POST',{apagar:true});
    msg('cx-wm-msg',r.ok?'Chave da Gestão removida.':erroTxt(r),r.ok?'ok':'erro');
    if(r.ok){const ul=$('cx-wm-res');ul&&(ul.textContent='');conferirWame_();}
  }
  function clique(ev) {
    const b = ev.target.closest('[data-cx]'); if (!b) return;
    const a = b.dataset.cx;
    if (a === 'fc-guardar') guardarFreeConvert_();
    else if (a === 'fc-apagar') apagarFreeConvert_();
    else if (a === 'wm-guardar') guardarWame_();
    else if (a === 'wm-apagar') apagarWame_();
    else if (a === 'wm-testar') testarWame_();
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
    temOnesignal = !!v.conexoesOnesignal; temCofre = !!v.conexoesCopiar;                          // backend 3.4: sem o bloco do OneSignal
    botao.hidden = false;
    botao.addEventListener('click', () => {
      if (!podeGerir()) { alert('Esta tela é só para o Admin total.'); return; }
      abrir();
    });
  })();
})();
