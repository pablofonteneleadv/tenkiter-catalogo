/* Pedidos de fotos da seleção: Gestão e catálogo usam a mesma fila da Esteira. */
(function () {
  'use strict';
  const ID = 'tk-pedir-fotos';
  let atual = null;
  const opcoes = [['pano', 'No pano'], ['manequim', 'No manequim'], ['cores', 'Das outras cores/estampas'], ['outro', 'Outro (escrever)']];
  function el(tag, classe, texto) {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto) n.textContent = texto;
    return n;
  }
  function sessao() { return typeof getSessao === 'function' ? getSessao() : null; }
  function mesmaConta(a, b) { return !!(a && b && normalizarWhats(a.whatsapp) === normalizarWhats(b.whatsapp)); }
  function mensagem(erro) {
    const t = String(erro || '').trim();
    return t && t.length <= 350 && !/^[\[{<]/.test(t) ? t : 'Não consegui registrar o pedido. Tente novamente.';
  }
  function abrir(lista, origem) {
    const s = sessao();
    if (!s) { alert('Entre na sua conta da equipe para solicitar fotos.'); return; }
    const vistos = new Set();
    const pecas = (lista || []).filter(p => {
      if (!p || p.ID == null || vistos.has(String(p.ID))) return false;
      vistos.add(String(p.ID)); return true;
    });
    if (!pecas.length) { alert('Selecione os produtos que precisam de fotos.'); return; }
    if (atual && !atual.fundo.hidden) return;
    const chave = [...vistos].sort().join('|');
    if (atual && atual.chave === chave && atual.confirmados.size < pecas.length && mesmaConta(atual.conta, s)) {
      atual.mostrar(); return;
    }
    if (atual) atual.fundo.remove();
    const estado = { chave, conta: s, enviando: false, fixado: false, confirmados: new Set(), falhas: new Map(), ops: new Map() };
    atual = estado;
    const anterior = document.activeElement, fundo = el('div', 'pf-overlay'); fundo.id = ID;
    const folha = el('section', 'pf-folha'); folha.setAttribute('role', 'dialog'); folha.setAttribute('aria-modal', 'true'); folha.setAttribute('aria-labelledby', 'pf-titulo');
    const topo = el('header', 'pf-topo'), titulo = el('h2', '', 'Solicitar fotos'); titulo.id = 'pf-titulo';
    const fechar = el('button', 'pf-fechar', '✕'); fechar.type = 'button'; fechar.setAttribute('aria-label', 'Fechar solicitação de fotos');
    topo.append(titulo, fechar);
    const corpo = el('div', 'pf-corpo');
    corpo.append(el('p', 'pf-resumo', pecas.length === 1 ? '1 produto selecionado' : pecas.length + ' produtos selecionados'));
    const detalhes = el('details', 'pf-produtos'), resumo = el('summary', '', 'Conferir produtos');
    const produtos = el('ul');
    pecas.forEach(p => produtos.append(el('li', '', [p.Codigo, p.Nome || 'Produto'].filter(Boolean).join(' — '))));
    detalhes.append(resumo, produtos); corpo.append(detalhes);
    const grupo = el('fieldset', 'pf-opcoes'); grupo.append(el('legend', '', 'Como você quer as fotos?'));
    const chips = el('div', 'pf-chips'), escolhidas = new Set(), botoes = [];
    const outroRot = el('label', 'pf-campo', 'Como é a foto que falta?'); outroRot.htmlFor = 'pf-outro';
    const outro = el('textarea'); outro.id = 'pf-outro'; outro.maxLength = 200; outro.rows = 2; outro.placeholder = 'Ex.: foto das costas, detalhe do bordado'; outroRot.append(outro); outroRot.hidden = true;
    opcoes.forEach(([id, texto]) => {
      const b = el('button', '', texto); b.type = 'button'; b.dataset.opcao = id; b.setAttribute('aria-pressed', 'false');
      b.onclick = () => { if (escolhidas.has(id)) escolhidas.delete(id); else escolhidas.add(id); b.setAttribute('aria-pressed', String(escolhidas.has(id))); outroRot.hidden = !escolhidas.has('outro'); status.textContent = ''; if (id === 'outro' && !outroRot.hidden) outro.focus(); };
      chips.append(b); botoes.push(b);
    });
    grupo.append(chips); corpo.append(grupo, outroRot);
    const obsRot = el('label', 'pf-campo', 'Observação (opcional)'); obsRot.htmlFor = 'pf-observacao';
    const obs = el('textarea'); obs.id = 'pf-observacao'; obs.maxLength = 300; obs.rows = 3; obs.placeholder = 'Ex.: mostrar o caimento e o detalhe da manga'; obsRot.append(obs); corpo.append(obsRot);
    corpo.append(el('p', 'pf-ajuda', 'As mesmas orientações serão enviadas para cada produto. Os pedidos ficam em Fotos, na Esteira.'));
    const status = el('p', 'pf-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    outro.oninput = obs.oninput = () => { if (!estado.fixado) status.textContent = ''; };
    const falhas = el('ul', 'pf-falhas'); falhas.hidden = true;
    const pe = el('footer', 'pf-pe'), enviar = el('button', 'pf-enviar', 'Solicitar fotos'); enviar.type = 'button';
    corpo.append(status, falhas); pe.append(enviar); folha.append(topo, corpo, pe); fundo.append(folha); document.body.append(fundo);
    estado.fundo = fundo;
    estado.ajustar = () => {
      const vv = window.visualViewport;
      fundo.style.setProperty('--pf-altura', (vv ? vv.height : innerHeight) + 'px');
      fundo.style.setProperty('--pf-viewport-top', (vv ? vv.offsetTop : 0) + 'px');
    };
    let overflowAnterior = '', focoAnterior = anterior;
    function sumir() { fundo.hidden = true; document.body.style.overflow = overflowAnterior; focoAnterior?.focus?.({ preventScroll: true }); }
    function sair() {
      if (window.TKCamadas && TKCamadas.aberta(ID)) TKCamadas.desempilhar(ID); else sumir();
    }
    estado.mostrar = () => {
      focoAnterior = document.activeElement; overflowAnterior = document.body.style.overflow;
      fundo.hidden = false; document.body.style.overflow = 'hidden';
      estado.ajustar();
      if (window.TKCamadas) TKCamadas.empilhar(ID, sumir);
      fechar.focus({ preventScroll: true });
    };
    fechar.onclick = sair; fundo.onclick = e => { if (e.target === fundo) sair(); };
    folha.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sair(); }
      if (e.key !== 'Tab') return;
      const itens = [...folha.querySelectorAll('button, textarea, summary, a[href]')].filter(n => !n.disabled && n.getClientRects().length);
      const primeiro = itens[0], ultimo = itens[itens.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    });
    enviar.onclick = async () => {
      if (estado.enviando) return;
      if (!mesmaConta(s, sessao())) { status.textContent = 'Sua conta mudou. Entre novamente e confira os produtos antes de solicitar fotos.'; return; }
      if (!estado.fixado) {
        if (!escolhidas.size) { status.textContent = 'Escolha como quer as fotos.'; botoes[0].focus(); return; }
        if (escolhidas.has('outro') && !outro.value.trim()) { status.textContent = 'Escreva como quer a foto em “Outro”, ou desmarque essa opção.'; outro.focus(); return; }
        estado.pedido = { opcoes: [...escolhidas].filter(k => k !== 'outro'), querOutro: escolhidas.has('outro'), outro: escolhidas.has('outro') ? outro.value.trim() : '', obs: obs.value.trim() };
        estado.fixado = true;
        botoes.forEach(b => { b.disabled = true; }); outro.readOnly = obs.readOnly = true;
      }
      estado.enviando = true; enviar.disabled = true; folha.setAttribute('aria-busy', 'true');
      estado.falhas.clear(); falhas.replaceChildren(); falhas.hidden = true;
      for (const p of pecas) {
        const id = String(p.ID);
        if (estado.confirmados.has(id)) continue;
        const agora = sessao();
        if (!mesmaConta(s, agora)) { estado.falhas.set(id, 'Sua conta mudou. Entre novamente para continuar.'); break; }
        status.textContent = 'Solicitando fotos: ' + estado.confirmados.size + ' de ' + pecas.length + ' produtos confirmados…';
        if (!estado.ops.has(id)) estado.ops.set(id, 'pf-' + (window.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)));
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
        try {
          const resposta = await fetch(INSTAGRAM_URL + '/esteira/fotos/pedir', {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', 'X-TK-Whats': agora.whatsapp, 'X-TK-Sessao': agora.sessao },
            body: JSON.stringify(Object.assign({ produto: id, nome: p.Nome || '', codigo: p.Codigo || '', foto: String(p.Foto_URL || ''), de: origem === 'catalogo' ? 'catalogo' : 'gestao', op: estado.ops.get(id) }, estado.pedido))
          });
          const r = await resposta.json().catch(() => null);
          if (!resposta.ok || !r?.ok) throw Error(mensagem(r?.erro));
          estado.confirmados.add(id);
        } catch (e) {
          estado.falhas.set(id, e.name === 'AbortError' || e instanceof TypeError ? 'Não houve confirmação. Confira a conexão e tente novamente.' : mensagem(e.message));
        } finally { clearTimeout(timer); }
      }
      estado.enviando = false; folha.removeAttribute('aria-busy');
      const n = estado.confirmados.size, faltam = pecas.length - n;
      if (!faltam) { status.textContent = n === 1 ? 'Pedido registrado. A equipe pode vê-lo em Fotos, na Esteira.' : 'Pedidos registrados para os ' + n + ' produtos. A equipe pode vê-los em Fotos, na Esteira.'; enviar.textContent = 'Concluído'; enviar.disabled = true; }
      else {
        status.textContent = n + ' de ' + pecas.length + ' produtos confirmados. Faltam ' + faltam + '. Tente novamente para enviar apenas os que faltam.';
        estado.falhas.forEach((erro, id) => { const p = pecas.find(x => String(x.ID) === id); falhas.append(el('li', '', (p.Codigo || p.Nome || 'Produto') + ': ' + erro)); });
        falhas.hidden = false; enviar.textContent = 'Tentar os ' + faltam + ' restantes'; enviar.disabled = false;
      }
    };
    estado.mostrar();
  }
  window.TKPedirFotos = { abrir };
  const ajustar = () => { if (atual && !atual.fundo.hidden) atual.ajustar(); };
  window.addEventListener('resize', ajustar);
  if (window.visualViewport) { visualViewport.addEventListener('resize', ajustar); visualViewport.addEventListener('scroll', ajustar); }
})();
