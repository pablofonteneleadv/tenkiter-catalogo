/* ====================================================================
 * TENKiTER — admin-gestao.js (v3.1) — extras do painel do lojista
 *   • Pedidos (etapas, mensagem pronta de WhatsApp por etapa, nota interna)
 *   • Números reais (visualizações, cliques no WhatsApp, conversão, mais vistas, por dia)
 *   • Exportar / importar planilha CSV (com prévia antes de gravar)
 *   • Gerar códigos das peças antigas, lista de peças para o WhatsApp, lote de categoria e estoque
 *   • Integrações (Pixel da Meta, API de Conversões, sinônimos, endereços do catálogo para Meta/Google)
 *   • Avisos (push): modelos, segmento e histórico
 * Carrega DEPOIS do script de admin.html e usa o que ele já tem (adminPin, funcionarioNome, produtos, carregarProdutos...).
 * Cada recurso só aparece se o backend (?action=versao) disser que tem — com backend antigo o painel fica como sempre foi.
 * ==================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let recursos = {};

  /* ---------- chamada ao backend com a credencial do admin ---------- */
  function chamar_(extra) {
    const sess = (typeof getSessao === 'function' && getSessao()) || null;
    return apiPost(Object.assign({ pin: adminPin, sessao: adminPin, whatsapp: sess ? sess.whatsapp : '', funcionario: funcionarioNome }, extra));
  }
  function erroTexto_(r) { return (r && r.erro) || (r && r.semRede ? 'Sem conexão agora. Tente de novo.' : 'Não foi possível agora. Tente de novo.'); }
  const esc = (v) => escaparHtml(v);
  function dataHora_(iso) { return iso || ''; }
  function dois_(n) { return String(n).padStart(2, '0'); }

  /* ---------- janela (folha) reaproveitada pelos painéis ---------- */
  function abrirFolha_(titulo, html) {
    $('gestao-titulo').textContent = titulo;
    $('gestao-corpo').innerHTML = html;
    abrirComHistorico_('overlay-gestao');
  }
  function fecharFolha_() { fecharComHistorico_('overlay-gestao'); }
  function copiar_(texto, ok) {
    const aviso = () => alert(ok || 'Copiado!');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(aviso).catch(() => window.prompt('Copie o texto abaixo:', texto));
    else window.prompt('Copie o texto abaixo:', texto);
  }

  /* ====================================================================
   * PEDIDOS
   * ==================================================================== */
  let pedidos = [], contagemPed = {}, filtroPed = 'abertos', carregandoPed = false;
  const ABERTOS = ['novo', 'em_atendimento', 'aguardando_pagamento', 'separacao', 'pronto'];
  const CLASSE_ST = { novo: 'st-novo', concluido: 'st-ok', cancelado: 'st-cancel' };

  function rotuloEtapa_(st, entrega) { return pedidoRotulo(st, entrega); }

  async function carregarPedidos_(silencioso) {
    if (!recursos.pedidos || carregandoPed || !adminPin) return; // sem login ainda: espera (iniciar() tenta de novo quando entrar)
    carregandoPed = true;
    const btn = $('ped-atualizar');
    if (btn && !silencioso) { btn.disabled = true; btn.textContent = 'Atualizando…'; }
    const r = await chamar_({ action: 'listarPedidos', limite: 300 });
    carregandoPed = false;
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Atualizar'; }
    if (!r || !r.ok) {
      if (!silencioso) $('ped-lista').innerHTML = '<p class="ped-vazio ped-erro">' + esc(erroTexto_(r)) + '</p>';
      return;
    }
    pedidos = r.pedidos || [];
    contagemPed = r.contagem || {};
    // atualização automática não pode apagar uma nota que alguém está digitando
    if (silencioso && $('ped-lista').contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { desenharFiltrosPed_(); atualizarResumoPed_(); return; }
    desenharPedidos_();
  }

  function atualizarResumoPed_() {
    const novos = contagemPed.novo || 0;
    const abertos = ABERTOS.reduce((s, k) => s + (contagemPed[k] || 0), 0);
    $('ped-sum-txt').textContent = '🧾 Pedidos' + (abertos ? ' · ' + abertos + ' em aberto' : '') + (novos ? ' (' + novos + ' novo' + (novos > 1 ? 's' : '') + ')' : '');
    const b = $('aviso-pedidos-novos');
    if (b) {
      b.hidden = !novos;
      b.textContent = novos ? '🧾 ' + novos + (novos === 1 ? ' pedido novo' : ' pedidos novos') + ' esperando atendimento — toque para ver' : '';
    }
  }

  function desenharFiltrosPed_() {
    const total = Object.keys(contagemPed).reduce((s, k) => s + contagemPed[k], 0);
    const abertos = ABERTOS.reduce((s, k) => s + (contagemPed[k] || 0), 0);
    const itens = [['abertos', 'Em aberto', abertos]].concat(PEDIDO_STATUS.map((s) => [s.id, s.rotulo, contagemPed[s.id] || 0])).concat([['todos', 'Todos', total]]);
    $('ped-filtros').innerHTML = itens.map(([k, r, n]) => '<button type="button" class="chip' + (filtroPed === k ? ' selecionado' : '') + '" data-pf="' + k + '">' + esc(r) + ' (' + n + ')</button>').join('');
  }

  function itensTexto_(ped) {
    const itens = Array.isArray(ped.itens) ? ped.itens : [];
    if (!itens.length) return '<li>(sem itens)</li>';
    return itens.map((i) => '<li>' + esc(i.nome || '') + (i.codigo ? ' <span class="ped-cod">' + esc(i.codigo) + '</span>' : '') + (i.preco ? ' · ' + formatarReal(i.preco) : '') + '</li>').join('');
  }

  function cartaoPedido_(p) {
    const etapas = PEDIDO_STATUS.map((s) => '<button type="button" class="chip' + (p.status === s.id ? ' selecionado' : '') + '" data-ped-etapa="' + s.id + '" data-ped="' + esc(p.codigo) + '" ' + (p.status === s.id ? 'aria-pressed="true"' : 'aria-pressed="false"') + '>' + esc(rotuloEtapa_(s.id, p.entrega)) + '</button>').join('');
    const msg = mensagemStatusPedido(p);
    const hist = (p.historico || []).map((h) => '<li>' + esc(h.quando) + ' — ' + esc(rotuloEtapa_(h.status, p.entrega)) + (h.por ? ' <span class="ped-cod">por ' + esc(h.por) + '</span>' : '') + '</li>').join('');
    return '<article class="ped-card ' + (CLASSE_ST[p.status] || '') + '" data-card-ped="' + esc(p.codigo) + '">' +
      '<div class="ped-topo-card"><strong>' + esc(p.codigo) + '</strong><span class="ped-badge">' + esc(rotuloEtapa_(p.status, p.entrega)) + '</span></div>' +
      '<div class="ped-linha"><b>' + esc(p.nome) + '</b> · ' + esc(formatarTelefone(p.whatsapp)) + '</div>' +
      '<div class="ped-linha">' + (p.entrega === 'entrega' ? '🛵 Entrega' : '🏬 Retirada na loja') + ' · feito em ' + esc(p.data) + ' · <b>' + formatarReal(p.total) + '</b> à vista</div>' +
      (p.entrega === 'entrega' && p.endereco ? '<div class="ped-linha">📍 ' + esc(p.endereco) + '</div>' : '') +
      (p.obs ? '<div class="ped-linha">📝 ' + esc(p.obs) + '</div>' : '') +
      '<ul class="ped-itens">' + itensTexto_(p) + '</ul>' +
      '<a class="ped-zap" target="_blank" rel="noopener" href="' + esc(linkWhatsAppCliente(p.whatsapp, msg)) + '">💬 Avisar o cliente: “' + esc(rotuloEtapa_(p.status, p.entrega)) + '”</a>' +
      '<div class="ped-rotulo">Mudar etapa</div><div class="ped-etapas">' + etapas + '</div>' +
      '<label class="ped-rotulo" for="nota-' + esc(p.codigo) + '">Nota interna (o cliente não vê)</label>' +
      '<div class="ped-nota"><input type="text" id="nota-' + esc(p.codigo) + '" maxlength="500" value="' + esc(p.nota || '') + '" placeholder="Ex.: separado na prateleira 2"><button type="button" data-ped-nota="' + esc(p.codigo) + '">Salvar</button></div>' +
      (hist ? '<details class="ped-hist"><summary>Histórico do pedido</summary><ul>' + hist + '</ul></details>' : '') +
      '</article>';
  }

  function desenharPedidos_() {
    desenharFiltrosPed_();
    atualizarResumoPed_();
    const lista = pedidos.filter((p) => filtroPed === 'todos' ? true : filtroPed === 'abertos' ? ABERTOS.indexOf(p.status) !== -1 : p.status === filtroPed);
    if (!lista.length) {
      $('ped-lista').innerHTML = '<p class="ped-vazio">' + (pedidos.length ? 'Nenhum pedido nesta etapa.' : 'Nenhum pedido ainda. Quando alguém enviar a sacola pelo catálogo, aparece aqui.') + '</p>';
      return;
    }
    $('ped-lista').innerHTML = lista.map(cartaoPedido_).join('');
  }

  async function mudarEtapa_(codigo, etapa) {
    const p = pedidos.find((x) => x.codigo === codigo);
    if (!p || p.status === etapa) return;
    if ((etapa === 'cancelado' || etapa === 'concluido') && !confirm((etapa === 'cancelado' ? 'Cancelar' : 'Concluir') + ' o pedido ' + codigo + '?')) return;
    const r = await chamar_({ action: 'atualizarPedido', codigo: codigo, status: etapa });
    if (!r || !r.ok) { alert(erroTexto_(r)); return; }
    Object.assign(p, r.pedido);
    await carregarPedidos_(true);
  }
  async function salvarNota_(codigo) {
    const campo = $('nota-' + codigo);
    if (!campo) return;
    const r = await chamar_({ action: 'atualizarPedido', codigo: codigo, nota: campo.value });
    if (!r || !r.ok) { alert(erroTexto_(r)); return; }
    const p = pedidos.find((x) => x.codigo === codigo);
    if (p) Object.assign(p, r.pedido);
    campo.classList.add('salvo');
    setTimeout(() => campo.classList.remove('salvo'), 1200);
  }

  function ligarPedidos_() {
    $('ped-filtros').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pf]'); if (!b) return;
      filtroPed = b.dataset.pf; desenharPedidos_();
    });
    $('ped-atualizar').addEventListener('click', () => carregarPedidos_(false));
    $('ped-lista').addEventListener('click', (ev) => {
      const e = ev.target.closest('[data-ped-etapa]');
      if (e) { mudarEtapa_(e.dataset.ped, e.dataset.pedEtapa); return; }
      const n = ev.target.closest('[data-ped-nota]');
      if (n) salvarNota_(n.dataset.pedNota);
    });
    $('card-pedidos').addEventListener('toggle', (ev) => { if (ev.target.open) carregarPedidos_(false); });
    $('aviso-pedidos-novos').addEventListener('click', () => {
      const card = $('card-pedidos'); card.open = true; filtroPed = 'novo'; carregarPedidos_(false);
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) carregarPedidos_(true); });
    setInterval(() => { if (!document.hidden) carregarPedidos_(true); }, 120000);
  }

  /* ====================================================================
   * NÚMEROS REAIS
   * ==================================================================== */
  let diasMetricas = 30;
  function barraDia_(d, max) {
    const h = max ? Math.max(2, Math.round((d.visualizacoes / max) * 100)) : 2;
    return '<div class="mt-col" title="' + esc(d.dia) + ': ' + d.visualizacoes + ' visualizações, ' + d.whatsapp + ' cliques no WhatsApp"><div class="mt-barra" style="height:' + h + '%"></div></div>';
  }
  function formatarDiaCurto_(iso) { const p = String(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : iso; }

  async function abrirMetricas_(dias) {
    diasMetricas = dias || diasMetricas;
    abrirFolha_('📊 Números reais da loja', '<p class="g-info">Carregando…</p>');
    const r = await chamar_({ action: 'metricas', dias: diasMetricas });
    if (!r || !r.ok) { $('gestao-corpo').innerHTML = '<p class="g-erro">' + esc(erroTexto_(r)) + '</p>'; return; }
    const t = r.totais, ped = r.pedidos;
    const max = r.porDia.reduce((m, d) => Math.max(m, d.visualizacoes), 0);
    const melhor = r.porDia.reduce((m, d) => (d.visualizacoes > (m ? m.visualizacoes : -1) ? d : m), null);
    const chips = [7, 30, 90].map((n) => '<button type="button" class="chip' + (diasMetricas === n ? ' selecionado' : '') + '" data-mt-dias="' + n + '">Últimos ' + n + ' dias</button>').join('');
    const taxa = t.whatsappPor100Visualizacoes === null ? '—' : String(t.whatsappPor100Visualizacoes).replace('.', ',');
    let h = '<div class="filtros-lista">' + chips + '</div>';
    if (r.semDados) h += '<p class="g-info">Ainda não há visitas nem pedidos neste período. Os números aparecem conforme as pessoas usam o catálogo.</p>';
    h += '<div class="mt-cards">' +
      '<div class="mt-card"><span>👁️ Visualizações de peças</span><strong>' + t.visualizacoes + '</strong></div>' +
      '<div class="mt-card"><span>💬 Toques em “Pedir no WhatsApp”</span><strong>' + t.whatsapp + '</strong></div>' +
      '<div class="mt-card"><span>📈 Toques por 100 visualizações</span><strong>' + taxa + '</strong></div>' +
      '<div class="mt-card"><span>🧾 Pedidos pelo site</span><strong>' + ped.total + '</strong><small>' + formatarReal(ped.valor) + ' à vista (sem cancelados)</small></div></div>';
    h += '<p class="g-nota">Toque no WhatsApp não é venda confirmada: é a pessoa que pediu para falar com a loja. Venda confirmada é o pedido marcado como “Concluído”' + (ped.concluidos ? ' (' + ped.concluidos + ' no período, ' + formatarReal(ped.valorConcluidos) + ')' : '') + '.</p>';
    h += '<h3>Visualizações por dia</h3><div class="mt-grafico" role="img" aria-label="Gráfico de visualizações por dia nos últimos ' + r.dias + ' dias' + (melhor && melhor.visualizacoes ? '. Melhor dia: ' + formatarDiaCurto_(melhor.dia) + ' com ' + melhor.visualizacoes + ' visualizações' : '') + '">' + r.porDia.map((d) => barraDia_(d, max)).join('') + '</div>' +
      '<div class="mt-eixo"><span>' + formatarDiaCurto_(r.porDia[0].dia) + '</span><span>' + (melhor && melhor.visualizacoes ? 'Melhor dia: ' + formatarDiaCurto_(melhor.dia) + ' (' + melhor.visualizacoes + ')' : '') + '</span><span>' + formatarDiaCurto_(r.porDia[r.porDia.length - 1].dia) + '</span></div>';
    h += '<h3>Peças mais vistas</h3>';
    h += r.topProdutos.length ? '<table class="mt-tab"><thead><tr><th>Peça</th><th>Vistas</th><th>WhatsApp</th><th>Taxa</th></tr></thead><tbody>' +
      r.topProdutos.map((x) => '<tr><td><b>' + esc(x.codigo || '') + '</b> ' + esc(x.nome) + '</td><td>' + x.visualizacoes + '</td><td>' + x.whatsapp + '</td><td>' + (x.taxa === null ? '—' : String(x.taxa).replace('.', ',') + '%') + '</td></tr>').join('') + '</tbody></table>' : '<p class="g-info">Sem dados.</p>';
    h += '<h3>Por categoria</h3>';
    h += r.categorias.length ? '<table class="mt-tab"><thead><tr><th>Categoria</th><th>Vistas</th><th>WhatsApp</th><th>Taxa</th></tr></thead><tbody>' +
      r.categorias.map((x) => '<tr><td>' + esc(x.nome) + '</td><td>' + x.visualizacoes + '</td><td>' + x.whatsapp + '</td><td>' + (x.taxa === null ? '—' : String(x.taxa).replace('.', ',') + '%') + '</td></tr>').join('') + '</tbody></table>' : '<p class="g-info">Sem dados.</p>';
    const etapas = Object.keys(ped.porStatus || {});
    if (etapas.length) h += '<h3>Pedidos por etapa</h3><p class="g-info">' + etapas.map((k) => esc(rotuloEtapa_(k, '')) + ': <b>' + ped.porStatus[k] + '</b>').join(' · ') + '</p>';
    h += '<p class="g-nota">Atualizado em ' + esc(r.geradoEm) + '. Os números ficam guardados por até 2 minutos.</p>';
    $('gestao-corpo').innerHTML = h;
  }

  /* ====================================================================
   * CSV: exportar e importar
   * ==================================================================== */
  const COLUNAS_CSV = ['codigo', 'id', 'nome', 'categoria', 'genero', 'preco', 'estoque', 'tamanhos', 'cores', 'descricao', 'novidade', 'status', 'foto_url'];
  function celulaCsv_(v) {
    let t = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(t)) t = "'" + t; // planilha não executa como fórmula
    return /[";\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function linhaDoProduto_(p) {
    const inativo = ehInativo_(p);
    return [p.Codigo, p.ID, p.Nome, p.Categoria, p.Genero, String(p.Preco == null ? '' : p.Preco).replace('.', ','), p.Estoque, p.Tamanhos, p.Cores, p.Descricao,
      (p.Novidade === true || String(p.Novidade).toLowerCase() === 'true') ? 'sim' : 'não', inativo ? 'Inativo' : 'Ativo', p.Foto_URL].map(celulaCsv_).join(';');
  }
  function exportarCsv_() {
    if (!produtos.length) { alert('A lista de peças ainda não carregou.'); return; }
    const csv = '﻿' + COLUNAS_CSV.join(';') + '\r\n' + produtos.map(linhaDoProduto_).join('\r\n') + '\r\n';
    const d = new Date();
    const nome = 'tenkiter-pecas-' + d.getFullYear() + '-' + dois_(d.getMonth() + 1) + '-' + dois_(d.getDate()) + '.csv';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Lê o CSV (aspas, ; , ou tab). Devolve matriz de linhas. */
  function lerCsv_(texto) {
    texto = texto.replace(/^﻿/, '');
    const primeira = texto.split(/\r?\n/, 1)[0] || '';
    const cont = (c) => (primeira.match(new RegExp('\\' + c, 'g')) || []).length;
    const sep = [';', '\t', ','].sort((a, b) => cont(b) - cont(a))[0];
    const linhas = []; let linha = [], cel = '', aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"') { if (texto[i + 1] === '"') { cel += '"'; i++; } else aspas = false; } else cel += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { linha.push(cel); cel = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; linha.push(cel); cel = ''; if (linha.some((x) => x.trim() !== '')) linhas.push(linha); linha = []; }
      else cel += c;
    }
    linha.push(cel); if (linha.some((x) => x.trim() !== '')) linhas.push(linha);
    return linhas;
  }
  const NOME_COLUNA = {
    codigo: 'codigo', cod: 'codigo', id: 'id', nome: 'nome', produto: 'nome', titulo: 'nome', categoria: 'categoria', genero: 'genero', preco: 'preco', valor: 'preco',
    estoque: 'estoque', quantidade: 'estoque', tamanhos: 'tamanhos', tamanho: 'tamanhos', cores: 'cores', cor: 'cores', descricao: 'descricao', novidade: 'novidade',
    status: 'status', foto_url: 'foto_url', foto: 'foto_url', imagem: 'foto_url', link_da_foto: 'foto_url'
  };
  function colunaCanonica_(h) { return NOME_COLUNA[semAcento_(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')] || null; }
  function linhasParaObjetos_(matriz) {
    if (matriz.length < 2) return { erro: 'O arquivo está vazio ou só tem o cabeçalho.' };
    const mapa = matriz[0].map(colunaCanonica_);
    if (mapa.indexOf('codigo') === -1 && mapa.indexOf('id') === -1 && mapa.indexOf('nome') === -1) return { erro: 'Não reconheci as colunas. A primeira linha precisa ter pelo menos “codigo” (ou “nome”). Use “Exportar planilha” para ver o formato.' };
    const objs = matriz.slice(1).map((l) => {
      const o = {}; mapa.forEach((k, i) => { if (k && l[i] !== undefined) o[k] = String(l[i]).trim(); });
      if (o.id && !/^\d{10,}$/.test(o.id)) delete o.id; // o Excel estraga números grandes (1,79E+12): sem o ID, vale o código
      return o;
    });
    return { objs: objs, colunas: Array.from(new Set(mapa.filter(Boolean))) };
  }
  async function lerArquivoTexto_(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); } // Excel em português salva em ANSI
  }

  let importacao = null; // { objs }
  async function enviarLotes_(objs, simular, aoProgresso) {
    const total = { atualizados: [], criados: [], ignorados: [] };
    const TAM = 100;
    for (let i = 0; i < objs.length; i += TAM) {
      if (aoProgresso) aoProgresso(Math.min(i + TAM, objs.length), objs.length);
      const r = await chamar_({ action: 'importarProdutos', linhas: objs.slice(i, i + TAM), simular: simular });
      if (!r || !r.ok) return { erro: erroTexto_(r), parcial: total };
      const base = i;
      ['atualizados', 'criados', 'ignorados'].forEach((k) => (r[k] || []).forEach((x) => { x.linha = (x.linha || 2) + base; total[k].push(x); }));
    }
    return total;
  }

  function telaImportar_() {
    abrirFolha_('⬆️ Importar planilha (CSV)',
      '<p class="g-info">Serve para mudar preço, estoque, nome, categoria etc. de várias peças de uma vez, ou cadastrar peças novas. Primeiro toque em <b>Exportar planilha</b> (abaixo), edite no Excel/Google Planilhas e volte aqui com o arquivo. <b>Nada é gravado antes de você conferir a prévia.</b></p>' +
      '<div class="g-linha"><button type="button" id="imp-exportar" class="g-sec">⬇️ Exportar planilha atual</button></div>' +
      '<label for="imp-arquivo">Arquivo CSV</label><input type="file" id="imp-arquivo" accept=".csv,.txt,text/csv">' +
      '<p class="g-nota">Coluna <b>codigo</b> identifica a peça. Célula vazia = não mexe. Peça nova precisa de nome, preço e foto (link https://).</p>' +
      '<div id="imp-previa" aria-live="polite"></div>');
    $('imp-exportar').addEventListener('click', exportarCsv_);
    $('imp-arquivo').addEventListener('change', async (ev) => {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      const prev = $('imp-previa');
      prev.innerHTML = '<p class="g-info">Lendo o arquivo…</p>';
      let lido;
      try { lido = linhasParaObjetos_(lerCsv_(await lerArquivoTexto_(f))); } catch (e) { prev.innerHTML = '<p class="g-erro">Não consegui ler esse arquivo.</p>'; return; }
      if (lido.erro) { prev.innerHTML = '<p class="g-erro">' + esc(lido.erro) + '</p>'; return; }
      if (lido.objs.length > 1500) { prev.innerHTML = '<p class="g-erro">O arquivo tem mais de 1.500 linhas. Divida em partes menores.</p>'; return; }
      const res = await enviarLotes_(lido.objs, true, (a, b) => { prev.innerHTML = '<p class="g-info">Conferindo ' + a + ' de ' + b + ' linhas…</p>'; });
      if (res.erro) { prev.innerHTML = '<p class="g-erro">' + esc(res.erro) + '</p>'; return; }
      importacao = { objs: lido.objs, res: res };
      desenharPrevia_(res);
    });
  }

  function desenharPrevia_(res) {
    const a = res.atualizados, c = res.criados, ig = res.ignorados.filter((x) => !x.semMudanca), sem = res.ignorados.length - ig.length;
    let h = '<div class="mt-cards"><div class="mt-card ok"><span>Vão ser atualizadas</span><strong>' + a.length + '</strong></div>' +
      '<div class="mt-card ok"><span>Peças novas</span><strong>' + c.length + '</strong></div>' +
      '<div class="mt-card ' + (ig.length ? 'atencao' : '') + '"><span>Ignoradas (com problema)</span><strong>' + ig.length + '</strong></div>' +
      '<div class="mt-card"><span>Sem mudança</span><strong>' + sem + '</strong></div></div>';
    if (a.length) h += '<details class="g-det" open><summary>Peças que vão mudar (' + a.length + ')</summary>' + a.map((x) => '<div class="imp-item"><b>' + esc(x.codigo) + '</b> ' + esc(x.nome) + '<ul>' + x.campos.map((k) => '<li>' + esc(k) + '</li>').join('') + '</ul></div>').join('') + '</details>';
    if (c.length) h += '<details class="g-det" open><summary>Peças novas (' + c.length + ')</summary>' + c.map((x) => '<div class="imp-item"><b>Linha ' + x.linha + ':</b> ' + esc(x.nome) + ' <span class="ped-cod">vai ganhar código automático</span></div>').join('') + '<p class="g-nota">Confira: se uma destas deveria ser uma peça que já existe, o código da linha está errado ou vazio.</p></details>';
    if (ig.length) h += '<details class="g-det" open><summary>Linhas ignoradas (' + ig.length + ')</summary>' + ig.map((x) => '<div class="imp-item ig">Linha ' + x.linha + (x.codigo ? ' (' + esc(x.codigo) + ')' : '') + ': ' + esc(x.motivo) + '</div>').join('') + '</details>';
    const n = a.length + c.length;
    h += n ? '<button type="button" id="imp-aplicar" class="g-prim">✅ Aplicar ' + n + ' alteraç' + (n > 1 ? 'ões' : 'ão') + '</button>' : '<p class="g-info">Não há nada para aplicar.</p>';
    $('imp-previa').innerHTML = h;
    const btn = $('imp-aplicar');
    if (btn) btn.addEventListener('click', async () => {
      if (!confirm('Gravar ' + n + ' alteração(ões) na planilha agora? As mudanças de preço e estoque ficam registradas no histórico.')) return;
      btn.disabled = true;
      const r = await enviarLotes_(importacao.objs, false, (x, y) => { btn.textContent = 'Gravando ' + x + ' de ' + y + '…'; });
      if (r.erro) { $('imp-previa').innerHTML = '<p class="g-erro">' + esc(r.erro) + '</p><p class="g-info">Parte das linhas pode já ter sido gravada. Reabra a lista e confira antes de tentar de novo.</p>'; await carregarProdutos(); return; }
      $('imp-previa').innerHTML = '<p class="g-ok">✅ Pronto! ' + r.atualizados.length + ' peça(s) atualizada(s) e ' + r.criados.length + ' nova(s).</p>' +
        (r.criados.length ? '<p class="g-info">Novas: ' + r.criados.map((x) => esc(x.codigo) + ' ' + esc(x.nome)).join(', ') + '</p>' : '');
      importacao = null;
      await carregarProdutos();
    });
  }

  /* ====================================================================
   * CÓDIGOS FALTANTES, LISTA PARA O WHATSAPP, LOTE
   * ==================================================================== */
  function semCodigo_() { return produtos.filter((p) => !String(p.Codigo || '').trim()); }
  function atualizarAvisoCodigos_() {
    const el = $('aviso-codigos'); if (!el) return;
    const n = recursos.codigos ? semCodigo_().length : 0;
    el.hidden = !n;
    if (n) el.innerHTML = '⚠️ <b>' + n + (n === 1 ? ' peça está' : ' peças estão') + ' sem código.</b> Sem código, o link curto da peça e o catálogo para a Meta/Google não funcionam direito. <button type="button" id="btn-gerar-codigos">Gerar códigos agora</button>';
  }
  async function gerarCodigos_() {
    if (!confirm('Dar um código (TK-0000) para as ' + semCodigo_().length + ' peças que estão sem? Os códigos que já existem não mudam.')) return;
    const btn = $('btn-gerar-codigos'); if (btn) btn.disabled = true;
    const r = await chamar_({ action: 'gerarCodigosFaltantes' });
    if (!r || !r.ok) { alert(erroTexto_(r)); if (btn) btn.disabled = false; return; }
    await carregarProdutos();
    abrirFolha_('Códigos gerados', r.geradas.length
      ? '<p class="g-ok">✅ ' + r.geradas.length + ' peça(s) ganharam código:</p><ul class="g-lista">' + r.geradas.map((g) => '<li><b>' + esc(g.codigo) + '</b> — ' + esc(g.nome) + '</li>').join('') + '</ul>' + (r.duplicados && r.duplicados.length ? '<p class="g-erro">Atenção: estes códigos aparecem repetidos na planilha: ' + r.duplicados.map(esc).join(', ') + '. Corrija à mão.</p>' : '')
      : '<p class="g-info">Todas as peças já tinham código.</p>');
  }

  function textoListaWhats_(lista) {
    const linhas = lista.map((p) => '*' + p.Nome + '*' + (p.Codigo ? ' (' + p.Codigo + ')' : '') + '\n' + formatarReal(p.Preco) + ' · à vista ' + formatarReal(p.Preco * (1 - DESCONTO_AVISTA)) + '\n' + linkProduto(p));
    return '🛍️ *' + LOJA.nome + '* — peças disponíveis\n\n' + linhas.join('\n\n') + '\n\nVeja tudo no catálogo: ' + SITE_URL;
  }
  function copiarListaWhats_() {
    const sel = produtos.filter((p) => selecionadosBulk.has(String(p.ID)) && !ehInativo_(p) && !estaEsgotado(p));
    if (!sel.length) { alert('Selecione peças ativas e disponíveis para montar a lista.'); return; }
    copiar_(textoListaWhats_(sel.slice(0, 30)), 'Lista copiada (' + Math.min(sel.length, 30) + ' peças)! É só colar no WhatsApp.' + (sel.length > 30 ? ' (Limitei a 30 peças por mensagem.)' : ''));
  }
  async function lote_(tipoAcao, valor, msg) {
    if (!selecionadosBulk.size) return;
    const r = await chamar_({ action: 'bulkUpdate', ids: Array.from(selecionadosBulk), tipoAcao: tipoAcao, valor: valor });
    if (!r || !r.ok) { alert(erroTexto_(r)); return; }
    alert(msg + ' em ' + r.afetados + ' peça(s).');
    selecionadosBulk.clear(); atualizarBarraBulk(); await carregarProdutos();
  }
  function ligarLote_() {
    const barra = document.querySelector('#bulk-bar .bulk-bar-actions');
    const add = (id, txt, fn) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = txt; b.addEventListener('click', fn); barra.appendChild(b); };
    add('btn-bulk-estoque', '📦 Estoque', async () => {
      const v = prompt('Novo estoque para as ' + selecionadosBulk.size + ' peças selecionadas (número, 0 = esgotado):');
      if (v === null || v.trim() === '') return;
      const n = Number(v.replace(',', '.'));
      if (isNaN(n) || n < 0) { alert('Digite um número (0 ou mais).'); return; }
      await lote_('alterarEstoque', n, 'Estoque alterado');
    });
    if (recursos.loteCategoria) add('btn-bulk-categoria', '🏷️ Categoria', async () => {
      const v = prompt('Categoria para as ' + selecionadosBulk.size + ' peças (substitui a atual).\nExistentes: ' + categorias.join(', '));
      if (v === null || !v.trim()) return;
      await lote_('alterarCategoria', v.trim(), 'Categoria alterada');
    });
    add('btn-bulk-lista', '📋 Copiar lista p/ WhatsApp', copiarListaWhats_);
    const antes = typeof BOTOES_BULK_IDS !== 'undefined' ? BOTOES_BULK_IDS : null;
    if (antes) antes.push('btn-bulk-estoque', 'btn-bulk-lista', 'btn-bulk-categoria');
  }

  /* ====================================================================
   * INTEGRAÇÕES (Pixel, API de Conversões, sinônimos, catálogo Meta/Google)
   * ==================================================================== */
  async function abrirIntegracoes_() {
    abrirFolha_('🔌 Integrações', '<p class="g-info">Carregando…</p>');
    const r = await chamar_({ action: 'statusIntegracoes' });
    if (!r || !r.ok) { $('gestao-corpo').innerHTML = '<p class="g-erro">' + esc(erroTexto_(r)) + '</p>'; return; }
    const feedCsv = API_URL + '?action=feed&formato=csv', feedXml = API_URL + '?action=feed&formato=xml';
    $('gestao-corpo').innerHTML =
      '<p class="g-info">Tudo aqui já fica pronto, mas <b>desligado</b>: enquanto os campos estiverem vazios, nada é enviado para a Meta e o aviso de cookies nem aparece para o cliente.</p>' +
      '<h3>Pixel da Meta (Instagram e Facebook)</h3>' +
      '<label for="int-pixel">ID do Pixel (só números)</label><input type="text" id="int-pixel" inputmode="numeric" autocomplete="off" value="' + esc(r.pixelId) + '" placeholder="Ex.: 1234567890123456">' +
      '<p class="g-nota">Quando preenchido, o catálogo pede a autorização do cliente (aviso de cookies) e só então liga o Pixel. Eventos: ver peça, sacola, WhatsApp e pedido enviado.</p>' +
      '<h3>API de Conversões (opcional)</h3>' +
      '<p class="g-info" id="int-capi-status">' + (r.capiConfigurado ? '✓ Token configurado (guardado só no servidor)' : '✗ Sem token') + '</p>' +
      '<label for="int-token">Token de acesso da Meta</label><input type="password" id="int-token" autocomplete="off" placeholder="' + (r.capiConfigurado ? 'deixe vazio para manter o atual' : 'cole aqui o token') + '">' +
      '<label for="int-teste">Código de teste de eventos (opcional)</label><input type="text" id="int-teste" autocomplete="off" value="' + esc(r.testeCodigo) + '" placeholder="Ex.: TEST12345">' +
      '<details class="g-det"><summary>Avançado</summary><label for="int-graph">Versão da API</label><input type="text" id="int-graph" value="' + esc(r.graphVersao) + '"></details>' +
      '<p class="g-nota">O token <b>nunca volta para esta tela nem vai para o GitHub</b>: fica nas Propriedades do Script. Só entra em ação se o Pixel e o token estiverem preenchidos e o cliente tiver aceitado o aviso.</p>' +
      '<h3>Busca: sinônimos</h3>' +
      '<label for="int-sin">Uma por linha, no formato palavra=parecida1,parecida2</label><textarea id="int-sin" rows="4" placeholder="bermuda=short&#10;fantasia=roupa de festa">' + esc(r.sinonimos) + '</textarea>' +
      '<p class="g-nota">Usado só quando o cliente digita algo que não acha nada. Já existem sinônimos padrão (camisa/camiseta, calça/jeans…).</p>' +
      '<h3>Avisos (OneSignal): segmentos</h3>' +
      '<label for="int-seg">Nomes dos segmentos criados no OneSignal, separados por vírgula</label><input type="text" id="int-seg" autocomplete="off" value="' + esc(r.segmentosPush) + '" placeholder="Ex.: Clientes Infantil, Clientes Feminino">' +
      '<div class="g-linha"><button type="button" class="g-prim" id="int-salvar">Salvar integrações</button></div><p id="int-msg" class="g-info" aria-live="polite"></p>' +
      '<h3>Catálogo para Instagram/Facebook e Google</h3>' +
      '<p class="g-info">Endereços prontos com as peças ativas (atualizam sozinhos). Na Meta (Gerenciador de Comércio) e no Google Merchant Center, crie uma fonte de dados por link/URL e cole um destes endereços.</p>' +
      '<label for="int-feed-csv">Planilha (CSV) — Meta e Google</label><div class="g-copia"><input type="text" id="int-feed-csv" readonly value="' + esc(feedCsv) + '"><button type="button" data-cp="int-feed-csv">Copiar</button></div>' +
      '<label for="int-feed-xml">XML — Google Merchant</label><div class="g-copia"><input type="text" id="int-feed-xml" readonly value="' + esc(feedXml) + '"><button type="button" data-cp="int-feed-xml">Copiar</button></div>' +
      '<label for="int-sitemap">Mapa do site (sitemap)</label><div class="g-copia"><input type="text" id="int-sitemap" readonly value="' + esc(API_URL + '?action=sitemap') + '"><button type="button" data-cp="int-sitemap">Copiar</button></div>' +
      '<p class="g-nota">O Instagram não é publicado automaticamente (decisão do projeto). A sacola/loja do Instagram depende da Meta aprovar sua conta de comércio; este catálogo é a base para isso.</p>' +
      '<div class="g-linha">' + (r.capiConfigurado ? '<button type="button" class="g-sec" id="int-limpar-token">Remover o token guardado</button>' : '') + '</div>';
    $('gestao-corpo').querySelectorAll('[data-cp]').forEach((b) => b.addEventListener('click', () => copiar_($(b.dataset.cp).value, 'Endereço copiado!')));
    const salvar = async (extra) => {
      const msg = $('int-msg'); msg.textContent = 'Salvando…';
      const corpo = Object.assign({ action: 'salvarIntegracoes', pixelId: $('int-pixel').value.trim(), testeCodigo: $('int-teste').value.trim(), graphVersao: $('int-graph').value.trim(), sinonimos: $('int-sin').value, segmentosPush: $('int-seg').value }, extra || {});
      const t = $('int-token').value.trim(); if (t) corpo.tokenCapi = t;
      const x = await chamar_(corpo);
      if (!x || !x.ok) { msg.className = 'g-erro'; msg.textContent = erroTexto_(x); return; }
      try { localStorage.removeItem(CONFIG_PUBLICA_CHAVE); } catch (e) {}
      $('int-token').value = '';
      msg.className = 'g-ok'; msg.textContent = '✅ Salvo. ' + (x.pixelId ? 'Pixel ativo (' + x.pixelId + ').' : 'Pixel desligado.') + (x.capiConfigurado ? ' API de Conversões pronta.' : '');
      $('int-capi-status').textContent = x.capiConfigurado ? '✓ Token configurado (guardado só no servidor)' : '✗ Sem token';
    };
    $('int-salvar').addEventListener('click', () => salvar());
    const lt = $('int-limpar-token');
    if (lt) lt.addEventListener('click', () => { if (confirm('Remover o token da API de Conversões guardado no servidor?')) salvar({ limparTokenCapi: true }).then(() => { lt.remove(); }); });
  }

  /* ====================================================================
   * AVISOS (PUSH): modelos, segmento, histórico
   * ==================================================================== */
  const MODELOS_PUSH = [
    { rotulo: 'Novidades', titulo: 'Chegou novidade! 🆕', msg: 'Peças novas na TENKiTER Modas. Vem conferir no catálogo!' },
    { rotulo: 'Últimas peças', titulo: 'Últimas peças! ⏳', msg: 'Algumas peças estão acabando. Garanta a sua no catálogo.' },
    { rotulo: 'Reposição', titulo: 'Voltou ao estoque ✨', msg: 'As peças que você pediu chegaram de novo. Confira no catálogo.' },
    { rotulo: 'Fantasias', titulo: 'Fantasias infantis 🎭', msg: 'Veja as fantasias disponíveis na TENKiTER Modas, em Crateús.' }
  ];
  async function prepararPush_() {
    const painel = $('painel-push'); if (!painel) return;
    const box = $('push-modelos');
    box.innerHTML = '<span class="g-nota" style="margin:0">Modelos:</span> ' + MODELOS_PUSH.map((m, i) => '<button type="button" class="chip" data-pm="' + i + '">' + esc(m.rotulo) + '</button>').join('');
    box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pm]'); if (!b) return;
      const m = MODELOS_PUSH[Number(b.dataset.pm)]; $('push-titulo').value = m.titulo; $('push-mensagem').value = m.msg;
    });
    if (!recursos.pushHistorico) { $('push-extras').hidden = true; return; }
    $('push-extras').hidden = false;
    $('btn-push-historico').addEventListener('click', abrirHistoricoPush_);
    carregarSegmentos_();
  }
  async function carregarSegmentos_() {
    const r = await chamar_({ action: 'pushHistorico', limite: 1 });
    if (!r || !r.ok) return;
    const sel = $('push-segmento');
    sel.innerHTML = r.segmentos.map((s) => '<option value="' + esc(s) + '">' + esc(s === 'Subscribed Users' ? 'Todos os assinantes' : s) + '</option>').join('');
    $('push-segmento-linha').hidden = r.segmentos.length < 2;
  }
  async function abrirHistoricoPush_() {
    abrirFolha_('📢 Últimos avisos enviados', '<p class="g-info">Carregando…</p>');
    const r = await chamar_({ action: 'pushHistorico', limite: 50 });
    if (!r || !r.ok) { $('gestao-corpo').innerHTML = '<p class="g-erro">' + esc(erroTexto_(r)) + '</p>'; return; }
    $('gestao-corpo').innerHTML = r.historico.length ? r.historico.map((h) => '<div class="imp-item"><b>' + esc(h.titulo) + '</b><br>' + esc(h.mensagem) +
      '<div class="g-nota">' + esc(h.quando) + ' · ' + esc(h.quem) + ' · ' + (h.segmento === 'Subscribed Users' ? 'todos' : esc(h.segmento)) + ' · ' + h.destinatarios + ' assinante(s)</div></div>').join('') : '<p class="g-info">Nenhum aviso enviado por aqui ainda.</p>';
  }

  /* ====================================================================
   * ligação com a página
   * ==================================================================== */
  window.TKGestao = {
    aoRenderizarLista: function () { atualizarAvisoCodigos_(); },
    segmentoEscolhido: function () { const s = $('push-segmento'); return s && !$('push-segmento-linha').hidden ? s.value : ''; },
    // usados pelos testes
    _lerCsv: lerCsv_, _linhasParaObjetos: linhasParaObjetos_, _textoListaWhats: textoListaWhats_
  };

  function esconder_(id, mostrar) { const el = $(id); if (el) el.hidden = !mostrar; }

  (async function iniciar() {
    $('gestao-fechar').addEventListener('click', fecharFolha_);
    $('gestao-corpo').addEventListener('click', (ev) => { const m = ev.target.closest('[data-mt-dias]'); if (m) abrirMetricas_(Number(m.dataset.mtDias)); });
    $('aviso-codigos').addEventListener('click', (ev) => { if (ev.target.closest('#btn-gerar-codigos')) gerarCodigos_(); });
    $('btn-exportar-csv').addEventListener('click', exportarCsv_);
    $('btn-importar-csv').addEventListener('click', telaImportar_);
    $('btn-abrir-metricas').addEventListener('click', () => abrirMetricas_(30));
    $('btn-abrir-integracoes').addEventListener('click', abrirIntegracoes_);
    ligarPedidos_();
    const v = await versaoServidor();
    recursos = v && typeof v === 'object' ? v : {};
    esconder_('card-pedidos', !!recursos.pedidos);
    esconder_('btn-abrir-metricas', !!recursos.metricas);
    esconder_('btn-importar-csv', !!recursos.importacao);
    esconder_('btn-abrir-integracoes', !!recursos.integracoes);
    ligarLote_();
    prepararPush_();
    atualizarAvisoCodigos_();
    if (recursos.pedidos) { // espera o login terminar (a credencial só existe depois) e então traz os pedidos
      let tentativas = 0;
      const espera = setInterval(() => { tentativas++; if (adminPin) { clearInterval(espera); carregarPedidos_(true); } else if (tentativas > 100) clearInterval(espera); }, 600);
    }
  })();
})();
