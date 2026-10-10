/* ====================================================================
 * TENKiTER — pedido.js (catálogo público, v3.3)
 *
 * Sacola com dados do cliente + pedido enviado, acompanhamento do pedido (código + 4 últimos números
 * do WhatsApp), gaveta de favoritos, compartilhar seleção, arrastar-para-fechar nas folhas.
 *
 * Carrega depois de common.js e ANTES do script principal do index.html; só usa as variáveis do catálogo
 * (produtos, abrirDetalhe, abrirComHistorico_...) na hora em que uma função é chamada, nunca ao carregar.
 *
 * Regras que valem aqui:
 *  - O WhatsApp é SEMPRE o da loja (linkWhatsApp / WHATSAPP_NUMERO). Não existe número de atendente.
 *  - Texto que vai para o WhatsApp é texto PURO: nunca passa por escaparHtml (isso gerava "&amp;" na mensagem).
 *  - Todo link dentro de mensagem é o endereço completo (https://...), nunca só o nome do arquivo.
 *  - Sem o backend 3.1 (action=versao sem "pedidos"), o pedido segue pelo WhatsApp normalmente, só sem código/acompanhamento.
 *  - Dados pessoais do cliente só ficam no aparelho se ele marcar "Lembrar meus dados" (e dá para desmarcar).
 * ==================================================================== */

/* ---------------- textos de WhatsApp (texto puro) ---------------- */
function precoAvista_(p) { return Number(p.Preco) * (1 - DESCONTO_AVISTA); }
function totalAvista_(itens) { return itens.reduce(function (s, p) { return s + precoAvista_(p); }, 0); }
function linhaItem_(p) {
  return '• ' + p.Nome + (p.Codigo ? ' (' + p.Codigo + ')' : '') + ' — ' + formatarReal(precoAvista_(p)) + ' à vista';
}
/** Lista de peças. Põe o link de cada peça enquanto a mensagem couber no limite do wa.me (~1800 caracteres). */
function listaDePecasTexto_(itens) {
  var comLinks = itens.map(function (p) { return linhaItem_(p) + '\n  ' + linkProduto(p, fotoDaSacola(p.ID)); }).join('\n'); // o link leva à foto que a pessoa escolheu
  if (comLinks.length <= 1100) return comLinks;
  return itens.map(linhaItem_).join('\n');
}

/* ---------------- dados do cliente (rascunho em memória; no aparelho só se ele pedir) ---------------- */
var CHAVE_CLIENTE_LOCAL = 'tenkiter_cliente_dados_v1';
var rascunhoPedido_ = null;
function lerClienteLocal_() { try { return JSON.parse(localStorage.getItem(CHAVE_CLIENTE_LOCAL) || 'null'); } catch (e) { return null; } }
function gravarClienteLocal_(d) { try { if (d) localStorage.setItem(CHAVE_CLIENTE_LOCAL, JSON.stringify(d)); else localStorage.removeItem(CHAVE_CLIENTE_LOCAL); } catch (e) {} }
function dadosIniciaisCliente_() {
  if (rascunhoPedido_) return rascunhoPedido_;
  var salvo = lerClienteLocal_() || {};
  var conta = window.__usuarioCliente || null;
  return {
    nome: salvo.nome || (conta && conta.name) || '',
    whats: salvo.whats || (conta && conta.whatsapp) || '',
    entrega: salvo.entrega === 'entrega' ? 'entrega' : 'retirada',
    endereco: salvo.endereco || '',
    obs: '',
    lembrar: !!salvo.nome
  };
}

/* ---------------- arrastar para baixo fecha a folha (celular) ---------------- */
function habilitarArrastarParaFechar(modal, fechar) {
  if (!modal || modal.__arrastar) return;
  modal.__arrastar = true;
  var y0 = null, x0 = 0, dy = 0, ativo = false;
  modal.addEventListener('touchstart', function (e) {
    if (modal.scrollTop > 0 || e.touches.length !== 1) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; ativo = false;
  }, { passive: true });
  modal.addEventListener('touchmove', function (e) {
    if (y0 === null) return;
    var t = e.touches[0], ddy = t.clientY - y0, ddx = t.clientX - x0;
    if (!ativo) {
      if (ddy > 12 && Math.abs(ddy) > Math.abs(ddx) * 1.5) { ativo = true; modal.classList.add('arrastando'); } else return;
    }
    dy = Math.max(0, ddy);
    modal.style.transform = 'translateY(' + dy + 'px)';
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  function fim() {
    if (!ativo) { y0 = null; return; }
    ativo = false; y0 = null;
    modal.classList.remove('arrastando'); modal.classList.add('voltando');
    if (dy > 110) {
      modal.style.transform = 'translateY(100%)';
      setTimeout(function () { modal.classList.remove('voltando'); modal.style.transform = ''; fechar(); }, 190);
    } else {
      modal.style.transform = '';
      setTimeout(function () { modal.classList.remove('voltando'); }, 220);
    }
  }
  modal.addEventListener('touchend', fim);
  modal.addEventListener('touchcancel', fim);
}

/* ---------------- itens da sacola ---------------- */
function itensDaSacola_() {
  var ids = getSacola();
  return ids.map(function (id) { return produtos.find(function (p) { return String(p.ID) === String(id); }); }).filter(Boolean);
}
function atualizarSacolaHeader_() { if (typeof atualizarBadges === 'function') atualizarBadges(); }

/* ====================================================================
 * SACOLA
 * ==================================================================== */
function abrirSacola() {
  var container = document.getElementById('sacola-conteudo');
  var ids = getSacola();
  var carregando = !produtos.length && ids.length;
  var todos = itensDaSacola_();
  var sumiram = produtos.length ? ids.length - todos.length : 0;
  if (sumiram > 0) { todos.length === 0 ? limparSacola() : salvarSacola(todos.map(function (p) { return String(p.ID); })); atualizarSacolaHeader_(); }
  var itens = todos.filter(function (p) { return !estaEsgotado(p); });
  var esgotados = todos.filter(estaEsgotado);

  if (carregando) {
    container.innerHTML = '<div class="sheet-topo"><div class="nome">🛍️ Sua sacola</div><button type="button" class="x" id="btn-fechar-sacola" aria-label="Fechar">✕</button></div>' +
      '<p class="texto-pequeno" style="padding:20px 16px">Carregando as peças da sua sacola…</p>';
  } else if (!todos.length) {
    container.innerHTML =
      '<div class="sheet-topo"><div class="nome">🛍️ Sua sacola</div><button type="button" class="x" id="btn-fechar-sacola" aria-label="Fechar">✕</button></div>' +
      '<div id="sacola-vazia">Sua sacola está vazia. Toque em <b>Sacola</b> nas peças que você gostar e peça tudo de uma vez.</div>' +
      '<a class="btn-zap" style="margin:0 16px 16px" href="' + escaparHtml(linkWhatsApp('Olá! Vim pelo catálogo e quero ajuda para escolher.')) + '" target="_blank" rel="noopener">💬 Prefiro falar no WhatsApp</a>';
  } else {
    var d = dadosIniciaisCliente_();
    var total = totalAvista_(itens);
    container.innerHTML =
      '<div class="sheet-topo"><div class="nome">🛍️ Sua sacola (' + itens.length + ')</div><button type="button" class="x" id="btn-fechar-sacola" aria-label="Fechar">✕</button></div>' +
      (sumiram > 0 ? '<p class="texto-pequeno" role="status">' + sumiram + (sumiram === 1 ? ' peça saiu' : ' peças saíram') + ' do catálogo e foi removida da sacola.</p>' : '') +
      itens.map(function (p) {
        return '<div class="item-sacola">' +
          '<img src="' + escaparHtml(imagemDoSlide(p, fotoDaSacola(p.ID), 160)) + '" alt="" width="48" height="60" loading="lazy">' +
          '<div class="info"><div class="nome">' + escaparHtml(p.Nome) + '</div>' +
          (p.Codigo ? '<div class="codigo" style="font-size:.68rem;color:var(--laranja-txt);font-weight:800">' + escaparHtml(p.Codigo) + '</div>' : '') +
          '<div class="preco">' + formatarReal(precoAvista_(p)) + ' à vista</div></div>' +
          '<button type="button" class="btn-remover" data-remover-id="' + escaparHtml(p.ID) + '" aria-label="Remover da sacola: ' + escaparHtml(p.Nome) + '">✕</button></div>';
      }).join('') +
      (esgotados.length ? '<p class="texto-pequeno" role="status" style="margin-top:8px">' + esgotados.length + (esgotados.length === 1 ? ' peça da sacola está esgotada' : ' peças da sacola estão esgotadas') + ' e não entra no pedido.</p>' : '') +
      '<div class="resumo-linha" style="margin-top:6px"><strong>Total estimado à vista</strong><span class="avista" style="color:#1a7a1a;font-weight:800">' + formatarReal(total) + '</span></div>' +
      '<div class="form-pedido">' +
        '<h3>Seus dados</h3>' +
        '<label for="ped-nome">Seu nome *</label><input type="text" id="ped-nome" autocomplete="name" value="' + escaparHtml(d.nome) + '">' +
        '<label for="ped-whats">WhatsApp com DDD *</label><input type="tel" id="ped-whats" inputmode="tel" autocomplete="tel" placeholder="(88) 99999-9999" value="' + escaparHtml(d.whats ? formatarTelefone(d.whats) : '') + '">' +
        '<h3>Como prefere receber?</h3>' +
        '<div class="opcoes" role="radiogroup" aria-label="Como prefere receber">' +
          '<label><input type="radio" name="ped-entrega" value="retirada"' + (d.entrega === 'retirada' ? ' checked' : '') + '><span>🏬 Retirar na loja</span></label>' +
          '<label><input type="radio" name="ped-entrega" value="entrega"' + (d.entrega === 'entrega' ? ' checked' : '') + '><span>🛵 Entrega</span></label>' +
        '</div>' +
        '<div id="ped-endereco-wrap"' + (d.entrega === 'entrega' ? '' : ' hidden') + '><label for="ped-endereco">Endereço para entrega *</label>' +
          '<textarea id="ped-endereco" placeholder="Rua, número, bairro e ponto de referência">' + escaparHtml(d.endereco) + '</textarea></div>' +
        '<label for="ped-obs">Observações (opcional)</label><textarea id="ped-obs" placeholder="Ex.: tamanho, cor, para quando precisa">' + escaparHtml(d.obs) + '</textarea>' +
        '<label class="lembrar"><input type="checkbox" id="ped-lembrar"' + (d.lembrar ? ' checked' : '') + '> Lembrar meus dados neste aparelho</label>' +
        '<div class="erro-campo" id="ped-erro" role="alert"></div>' +
      '</div>' +
      '<p class="texto-pequeno">O pedido vai para o WhatsApp da loja. O pagamento e a combinação de retirada ou entrega são feitos por lá. Veja a <a href="privacidade.html" style="color:var(--laranja-txt);font-weight:700">política de privacidade</a>.</p>' +
      '<button type="button" class="btn-secundario-cta" id="btn-limpar-sacola" style="margin-top:12px">🗑️ Esvaziar sacola</button>' +
      '<div class="barra-compra"><div class="bc-total"><small>Total à vista</small><strong>' + formatarReal(total) + '</strong></div>' +
      '<button type="button" class="bc-pedir" id="btn-enviar-sacola">💬 ENVIAR PEDIDO</button></div>';

    container.querySelectorAll('[data-remover-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        guardarRascunho_(); removerDaSacola(btn.dataset.removerId); atualizarSacolaHeader_(); abrirSacola();
      });
    });
    container.querySelectorAll('input[name="ped-entrega"]').forEach(function (r) {
      r.addEventListener('change', function () { document.getElementById('ped-endereco-wrap').hidden = (r.value !== 'entrega' || !r.checked); });
    });
    document.getElementById('btn-enviar-sacola').addEventListener('click', function () { enviarPedido_(itens); });
    document.getElementById('btn-limpar-sacola').addEventListener('click', function () {
      if (confirm('Esvaziar toda a sacola?')) { limparSacola(); atualizarSacolaHeader_(); abrirSacola(); }
    });
  }
  container.querySelectorAll('#btn-fechar-sacola').forEach(function (btn) { btn.addEventListener('click', fecharSacola); });
  abrirComHistorico_('overlay-sacola');
}
function fecharSacola() { fecharComHistorico_('overlay-sacola'); }

function guardarRascunho_() {
  var n = document.getElementById('ped-nome');
  if (!n) return;
  var marcado = document.querySelector('input[name="ped-entrega"]:checked');
  rascunhoPedido_ = {
    nome: n.value, whats: document.getElementById('ped-whats').value,
    entrega: marcado ? marcado.value : 'retirada',
    endereco: document.getElementById('ped-endereco').value, obs: document.getElementById('ped-obs').value,
    lembrar: document.getElementById('ped-lembrar').checked
  };
}

function validarPedido_() {
  guardarRascunho_();
  var d = rascunhoPedido_, erros = [], primeiro = null;
  function marcar(id, msg) { var el = document.getElementById(id); if (el) { el.classList.add('invalido'); el.setAttribute('aria-invalid', 'true'); if (!primeiro) primeiro = el; } erros.push(msg); }
  ['ped-nome', 'ped-whats', 'ped-endereco'].forEach(function (id) { var el = document.getElementById(id); if (el) { el.classList.remove('invalido'); el.removeAttribute('aria-invalid'); } });
  if (String(d.nome).trim().length < 2) marcar('ped-nome', 'Escreva seu nome.');
  var w = normalizarWhats(d.whats);
  if (w.length < 10 || w.length > 11) marcar('ped-whats', 'Escreva o WhatsApp com DDD (ex.: 88 99999-9999).');
  if (d.entrega === 'entrega' && String(d.endereco).trim().length < 8) marcar('ped-endereco', 'Para entrega, escreva rua, número e bairro.');
  var el = document.getElementById('ped-erro'); if (el) el.textContent = erros.join(' ');
  if (primeiro) { try { primeiro.focus(); } catch (e) {} }
  return erros.length ? null : { nome: String(d.nome).trim(), whatsapp: w, entrega: d.entrega, endereco: String(d.endereco).trim(), obs: String(d.obs).trim(), lembrar: d.lembrar };
}

/** Mensagem do pedido para o WhatsApp da loja (texto puro; link completo de acompanhamento quando há código). */
function textoPedido_(itens, dados, codigo) {
  var t = 'Olá! Quero fazer um pedido pelo catálogo' + (codigo ? ' (pedido ' + codigo + ')' : '') + ':\n\n';
  t += listaDePecasTexto_(itens) + '\n\nTotal estimado à vista: ' + formatarReal(totalAvista_(itens)) + '\n\n';
  t += 'Nome: ' + dados.nome + '\nWhatsApp: ' + formatarTelefone(dados.whatsapp) + '\n';
  t += 'Receber: ' + (dados.entrega === 'entrega' ? 'Entrega — ' + dados.endereco : 'Retirar na loja') + '\n';
  if (dados.obs) t += 'Observações: ' + dados.obs + '\n';
  if (codigo) t += '\nAcompanhar o pedido: ' + linkRastreio(codigo);
  return t;
}

async function enviarPedido_(itens) {
  var dados = validarPedido_();
  if (!dados) return;
  var btn = document.getElementById('btn-enviar-sacola');
  btn.disabled = true; var rotulo = btn.textContent; btn.textContent = 'Enviando pedido…';
  // lembrar (ou esquecer) os dados neste aparelho — só quando a pessoa escolheu
  gravarClienteLocal_(dados.lembrar ? { nome: dados.nome, whats: dados.whatsapp, entrega: dados.entrega, endereco: dados.endereco } : null);

  var codigo = '', totalServidor = null, avisoServidor = '';
  var v = await versaoServidor();
  if (v && v.pedidos) {
    var r = await criarPedidoApi({
      nome: dados.nome, whatsapp: dados.whatsapp, entrega: dados.entrega, endereco: dados.endereco, obs: dados.obs,
      itens: itens.map(function (p) { return { id: String(p.ID) }; }), origem: 'site'
    });
    if (r && r.ok && r.codigo) { codigo = r.codigo; if (typeof r.total === 'number') totalServidor = r.total; }
    else avisoServidor = (r && r.erro) ? r.erro : 'Não foi possível registrar o pedido agora.';
  }
  var texto = textoPedido_(itens, dados, codigo);
  var url = linkWhatsApp(texto);
  itens.forEach(function (p) { try { registrarEvento(p.ID, p.Codigo, 'whatsapp', '', true); } catch (e) {} });
  if (window.TKMeta) TKMeta.evento('Lead', { value: totalAvista_(itens), currency: 'BRL', content_ids: itens.map(function (p) { return p.Codigo || p.ID; }), content_type: 'product', num_items: itens.length }, codigo || undefined);
  var janela = null;
  try { janela = window.open(url, '_blank'); } catch (e) {}
  if (codigo) { limparSacola(); atualizarSacolaHeader_(); }
  rascunhoPedido_ = null;
  mostrarPedidoEnviado_({ codigo: codigo, url: url, aberto: !!janela, itens: itens, total: totalServidor != null ? totalServidor : totalAvista_(itens), dados: dados, aviso: avisoServidor, rotuloBotao: rotulo });
}

function mostrarPedidoEnviado_(o) {
  var c = document.getElementById('sacola-conteudo');
  var link = o.codigo ? linkRastreio(o.codigo) : '';
  c.innerHTML =
    '<div class="sheet-topo"><div class="nome">Pedido enviado</div><button type="button" class="x" id="btn-fechar-sacola" aria-label="Fechar">✕</button></div>' +
    '<div class="pedido-ok" id="pedido-ok">' +
      '<div class="selo-ok" aria-hidden="true">✓</div>' +
      (o.codigo ? '<div>Seu pedido é o</div><div class="codigo-pedido" id="codigo-pedido">' + escaparHtml(o.codigo) + '</div>' : '') +
      '<p>' + (o.aberto ? 'O WhatsApp da loja abriu com a mensagem pronta. <b>Falta só tocar em enviar.</b>' : 'Toque no botão verde abaixo para abrir o WhatsApp da loja e <b>enviar a mensagem do pedido</b>.') + '</p>' +
      (o.aviso ? '<p style="color:#7a4b00">' + escaparHtml(o.aviso) + ' Mas você pode enviar o pedido pelo WhatsApp normalmente.</p>' : '') +
      (o.codigo ? '<p>Para acompanhar, guarde este código e os 4 últimos números do seu WhatsApp.<br><a href="' + escaparHtml(link) + '" id="link-rastreio-ok" style="color:var(--laranja-txt);font-weight:700;word-break:break-all">' + escaparHtml(link) + '</a></p>' : '') +
    '</div>' +
    '<a class="btn-principal-cta" style="text-decoration:none" id="btn-abrir-zap" href="' + escaparHtml(o.url) + '" target="_blank" rel="noopener">💬 ABRIR O WHATSAPP DA LOJA</a>' +
    (o.codigo ? '<button type="button" class="btn-secundario-cta" id="btn-ir-rastreio">📦 Acompanhar este pedido</button>' : '<button type="button" class="btn-secundario-cta" id="btn-esvaziar-depois">🗑️ Já enviei — esvaziar a sacola</button>') +
    '<button type="button" class="btn-secundario-cta" id="btn-continuar">Continuar vendo o catálogo</button>';
  c.querySelectorAll('#btn-fechar-sacola, #btn-continuar').forEach(function (b) { b.addEventListener('click', fecharSacola); });
  var rast = document.getElementById('btn-ir-rastreio');
  if (rast) rast.addEventListener('click', function () { abrirRastreio(o.codigo, o.dados.whatsapp.slice(-4)); });
  var lk = document.getElementById('link-rastreio-ok');
  if (lk) lk.addEventListener('click', function (e) { e.preventDefault(); abrirRastreio(o.codigo, o.dados.whatsapp.slice(-4)); });
  var esv = document.getElementById('btn-esvaziar-depois');
  if (esv) esv.addEventListener('click', function () { limparSacola(); atualizarSacolaHeader_(); fecharSacola(); });
  var bz = document.getElementById('btn-abrir-zap');
  if (bz) bz.focus();
}

/* ====================================================================
 * ACOMPANHAR PEDIDO  (?pedido=PED-0001)
 * ==================================================================== */
function abrirRastreio(codigo, final4) {
  var c = document.getElementById('rastreio-conteudo');
  c.innerHTML =
    '<div class="sheet-topo"><div class="nome">📦 Acompanhar pedido</div><button type="button" class="x" id="btn-fechar-rastreio" aria-label="Fechar">✕</button></div>' +
    '<p class="texto-pequeno">Digite o código do pedido e os <b>4 últimos números</b> do WhatsApp usado nele.</p>' +
    '<form class="campo-rastreio" id="form-rastreio" novalidate>' +
      '<label for="rast-codigo">Código do pedido</label><input type="text" id="rast-codigo" placeholder="PED-0001" autocomplete="off" autocapitalize="characters" value="' + escaparHtml(codigo || '') + '">' +
      '<label for="rast-final">4 últimos números do WhatsApp</label><input type="text" class="num" id="rast-final" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="0000" value="' + escaparHtml(final4 || '') + '">' +
      '<div class="erro-campo" id="rast-erro" role="alert" style="padding:6px 0 0;color:var(--vermelho);font-weight:700;font-size:.82rem"></div>' +
      '<button type="submit" class="btn-principal-cta" id="btn-consultar" style="width:100%;margin:10px 0 6px">Consultar</button>' +
    '</form>' +
    '<div id="rast-resultado" aria-live="polite"></div>' +
    '<a class="btn-zap" style="margin:6px 16px 16px" id="rast-zap" href="' + escaparHtml(linkWhatsApp('Olá! Quero saber do meu pedido' + (codigo ? ' ' + codigo : '') + '.')) + '" target="_blank" rel="noopener">💬 Falar com a loja no WhatsApp</a>';
  document.getElementById('btn-fechar-rastreio').addEventListener('click', fecharRastreio);
  document.getElementById('form-rastreio').addEventListener('submit', function (e) { e.preventDefault(); consultarRastreio_(); });
  var u = new URL(window.location); u.searchParams.delete('c'); u.searchParams.delete('id');
  if (codigo) u.searchParams.set('pedido', codigo); else u.searchParams.set('pedido', '');
  abrirComHistorico_('overlay-rastreio', u);
  if (codigo && final4 && String(final4).length === 4) consultarRastreio_();
}
function fecharRastreio() { fecharComHistorico_('overlay-rastreio'); }

async function consultarRastreio_() {
  var cod = document.getElementById('rast-codigo').value.trim().toUpperCase();
  var fim = soDigitos(document.getElementById('rast-final').value);
  var erro = document.getElementById('rast-erro'), res = document.getElementById('rast-resultado');
  erro.textContent = ''; res.innerHTML = '';
  if (!/^[A-Z]{2,4}-?\d{3,}$/.test(cod)) { erro.textContent = 'Confira o código do pedido (ex.: PED-0001).'; return; }
  if (fim.length !== 4) { erro.textContent = 'Digite os 4 últimos números do seu WhatsApp.'; return; }
  var btn = document.getElementById('btn-consultar'); btn.disabled = true; btn.textContent = 'Consultando…';
  var v = await versaoServidor();
  var r = (v && v.pedidos) ? await consultarPedidoApi(cod, fim) : { ok: false, indisponivel: true };
  btn.disabled = false; btn.textContent = 'Consultar';
  if (r && r.ok && r.pedido) { res.innerHTML = htmlPedidoRastreio_(r.pedido); return; }
  if (r && r.bloqueado) erro.textContent = 'Muitas tentativas seguidas. Aguarde 15 minutos ou fale com a loja.';
  else if (r && r.naoEncontrado) erro.textContent = 'Não encontramos esse pedido. Confira o código e os 4 últimos números do WhatsApp usado no pedido.';
  else if (r && r.semRede) erro.textContent = 'Sem conexão agora. Tente de novo em instantes.';
  else if (!v || !v.pedidos) erro.textContent = 'O acompanhamento online ainda não está disponível. Fale com a loja pelo WhatsApp.';
  else erro.textContent = (r && r.erro) || 'Não foi possível consultar agora. Tente de novo.';
}

function htmlPedidoRastreio_(ped) {
  var ordem = ['novo', 'em_atendimento', 'aguardando_pagamento', 'separacao', 'pronto', 'concluido'];
  var idx = ordem.indexOf(ped.status);
  var etapas = ped.status === 'cancelado'
    ? '<p style="padding:0 16px"><span class="tag-cancelado">Pedido cancelado</span></p>'
    : '<ol class="etapas">' + ordem.map(function (s, i) {
        return '<li class="' + (i < idx ? 'feita' : (i === idx ? 'atual' : '')) + '"' + (i === idx ? ' aria-current="step"' : '') + '>' + escaparHtml(pedidoRotulo(s, ped.entrega)) + '</li>';
      }).join('') + '</ol>';
  var itens = (ped.itens || []).map(function (i) { return '<li>' + escaparHtml(i.nome) + (i.codigo ? ' <small>(' + escaparHtml(i.codigo) + ')</small>' : '') + '</li>'; }).join('');
  return '<hr class="linha-linha">' +
    '<div style="padding:0 16px"><div style="font-weight:800;font-size:1.05rem">Pedido ' + escaparHtml(ped.codigo) + '</div>' +
    '<div class="texto-pequeno" style="padding:0">Feito em ' + escaparHtml(ped.data || '') + (ped.atualizado ? ' · atualizado em ' + escaparHtml(ped.atualizado) : '') + '</div>' +
    '<div style="margin-top:8px;font-weight:800;color:var(--laranja-txt)">' + escaparHtml(pedidoRotulo(ped.status, ped.entrega)) + '</div></div>' +
    etapas +
    '<ul style="margin:6px 0 4px;padding:0 16px 0 34px;font-size:.86rem">' + itens + '</ul>' +
    '<div class="resumo-linha"><span>' + (ped.entrega === 'entrega' ? '🛵 Entrega' : '🏬 Retirada na loja') + '</span><strong>' + formatarReal(ped.total || 0) + ' à vista</strong></div>';
}

/* ====================================================================
 * FAVORITOS (gaveta)
 * ==================================================================== */
function abrirFavoritos() {
  var c = document.getElementById('favoritos-conteudo');
  var ids = getFavoritos();
  var todos = ids.map(function (id) { return produtos.find(function (p) { return String(p.ID) === String(id); }); }).filter(Boolean);
  var disp = todos.filter(function (p) { return !estaEsgotado(p); });
  var topo = '<div class="sheet-topo"><div class="nome">❤️ Seus favoritos (' + todos.length + ')</div><button type="button" class="x" id="btn-fechar-favoritos" aria-label="Fechar">✕</button></div>';
  if (!produtos.length && ids.length) {
    c.innerHTML = topo + '<p class="texto-pequeno" style="padding:20px 16px">Carregando seus favoritos…</p>';
  } else if (!todos.length) {
    c.innerHTML = topo + '<div id="sacola-vazia">Você ainda não tem favoritos. Toque no 🤍 das peças que gostar para guardá-las aqui.</div>' +
      '<a class="btn-zap" style="margin:0 16px 16px" href="' + escaparHtml(linkWhatsApp('Olá! Vim pelo catálogo e quero ajuda para escolher.')) + '" target="_blank" rel="noopener">💬 Prefiro falar no WhatsApp</a>';
  } else {
    c.innerHTML = topo +
      todos.map(function (p) {
        var esg = estaEsgotado(p);
        return '<div class="fav-linha"><img src="' + escaparHtml(fotoMini(p.Foto_URL, 160)) + '" alt="" width="48" height="60" loading="lazy">' +
          '<div class="info"><button type="button" class="nome-btn" data-abrir-id="' + escaparHtml(p.ID) + '" style="all:unset;cursor:pointer;font-weight:700;font-size:.85rem">' + escaparHtml(p.Nome) + '</button>' +
          '<div style="font-size:.78rem;font-weight:700;color:' + (esg ? 'var(--vermelho)' : '#1a7a1a') + '">' + (esg ? 'Esgotado' : formatarReal(precoAvista_(p)) + ' à vista') + '</div></div>' +
          '<div class="acoes">' + (esg ? '' : '<button type="button" data-sac-id="' + escaparHtml(p.ID) + '" aria-label="' + (estaNaSacola(p.ID) ? 'Já está na sacola: ' : 'Adicionar à sacola: ') + escaparHtml(p.Nome) + '">' + (estaNaSacola(p.ID) ? '✓' : '🛍️') + '</button>') +
          '<button type="button" data-rem-id="' + escaparHtml(p.ID) + '" aria-label="Remover dos favoritos: ' + escaparHtml(p.Nome) + '">✕</button></div></div>';
      }).join('') +
      '<div class="resumo-linha" style="margin-top:6px"><strong>Total à vista (' + disp.length + (disp.length === 1 ? ' peça' : ' peças') + ')</strong><span style="color:#1a7a1a;font-weight:800">' + formatarReal(totalAvista_(disp)) + '</span></div>' +
      (todos.length > disp.length ? '<p class="texto-pequeno">' + (todos.length - disp.length) + ' esgotada(s) não entram na conta.</p>' : '') +
      '<button type="button" class="btn-principal-cta" id="fav-pedir"' + (disp.length ? '' : ' disabled') + '>💬 PEDIR A LISTA COMPLETA NO WHATSAPP</button>' +
      '<button type="button" class="btn-secundario-cta" id="fav-mover"' + (disp.length ? '' : ' disabled') + '>🛍️ Adicionar todos à sacola</button>' +
      '<button type="button" class="btn-secundario-cta" id="fav-ver">Ver só os favoritos na lista</button>';
    c.querySelectorAll('[data-abrir-id]').forEach(function (b) { b.addEventListener('click', function () { abrirDetalhe(b.dataset.abrirId); }); });
    c.querySelectorAll('[data-sac-id]').forEach(function (b) { b.addEventListener('click', function () { adicionarNaSacola(b.dataset.sacId); atualizarSacolaHeader_(); abrirFavoritos(); }); });
    c.querySelectorAll('[data-rem-id]').forEach(function (b) { b.addEventListener('click', function () { toggleFavorito(b.dataset.remId); atualizarSacolaHeader_(); abrirFavoritos(); if (apenasFavoritos) aplicarFiltros(); }); });
    var ped = document.getElementById('fav-pedir');
    if (ped) ped.addEventListener('click', function () {
      var t = 'Olá! Gostei destas peças do catálogo e queria saber se estão disponíveis:\n\n' + listaDePecasTexto_(disp) + '\n\nTotal estimado à vista: ' + formatarReal(totalAvista_(disp));
      disp.forEach(function (p) { try { registrarEvento(p.ID, p.Codigo, 'whatsapp', '', true); } catch (e) {} });
      if (window.TKMeta) TKMeta.evento('Contact', { content_ids: disp.map(function (p) { return p.Codigo || p.ID; }), content_type: 'product' });
      window.open(linkWhatsApp(t), '_blank');
    });
    var mov = document.getElementById('fav-mover');
    if (mov) mov.addEventListener('click', function () { disp.forEach(function (p) { adicionarNaSacola(p.ID); }); atualizarSacolaHeader_(); fecharFavoritos(); setTimeout(abrirSacola, 60); });
    document.getElementById('fav-ver').addEventListener('click', function () {
      apenasFavoritos = true; renderizarChipExtra(); aplicarFiltros(); fecharFavoritos();
      setTimeout(function () { var m = document.querySelector('main'); if (m) m.scrollIntoView({ behavior: 'smooth' }); }, 80);
    });
  }
  c.querySelectorAll('#btn-fechar-favoritos').forEach(function (b) { b.addEventListener('click', fecharFavoritos); });
  abrirComHistorico_('overlay-favoritos');
}
function fecharFavoritos() { fecharComHistorico_('overlay-favoritos'); }

/* ====================================================================
 * COMPARTILHAR SELEÇÃO (neutro: fala só da loja, sem nome de atendente)
 * ==================================================================== */
function linkDaSelecao_() {
  var u = new URL(window.location.href);
  ['c', 'id', 'pedido', 'abrir', 'origem'].forEach(function (k) { u.searchParams.delete(k); });
  var qs = u.searchParams.toString();
  return SITE_URL + (qs ? '?' + qs : '');   // sempre o endereço do SITE, mesmo se a pessoa estiver em outro endereço
}
function descricaoDaSelecao_() {
  var partes = [];
  var q = document.getElementById('busca').value.trim(); if (q) partes.push('busca “' + q + '”');
  if (filtroCategorias.size) partes.push(Array.from(filtroCategorias).join(', '));
  if (filtroGeneros.size) partes.push(Array.from(filtroGeneros).join(', '));
  var min = document.getElementById('preco-min').value, max = document.getElementById('preco-max').value;
  if (min || max) partes.push('preço ' + (min ? 'de R$ ' + min : '') + (min && max ? ' ' : '') + (max ? 'até R$ ' + max : ''));
  if (apenasNovidades) partes.push('novidades');
  return partes.length ? partes.join(' · ') : 'todas as peças';
}
function abrirSelecao() {
  if (typeof atualizarURLComFiltros === 'function') atualizarURLComFiltros();
  var link = linkDaSelecao_();
  var lista = listaFiltradaAtual || [];
  var c = document.getElementById('selecao-conteudo');
  var msg = 'Olha as peças que separei na TENKiTER Modas (' + descricaoDaSelecao_() + '):\n' + link;
  c.innerHTML =
    '<div class="sheet-topo"><div class="nome">🔗 Compartilhar seleção</div><button type="button" class="x" id="btn-fechar-selecao" aria-label="Fechar">✕</button></div>' +
    '<p class="texto-pequeno" style="margin-bottom:8px"><b>' + lista.length + (lista.length === 1 ? ' peça' : ' peças') + '</b> — ' + escaparHtml(descricaoDaSelecao_()) + '</p>' +
    '<div class="preview-selecao">' + lista.slice(0, 4).map(function (p) { return '<img src="' + escaparHtml(fotoMini(p.Foto_URL, 160)) + '" alt="' + escaparHtml(p.Nome) + '" width="80" height="100" loading="lazy">'; }).join('') + '</div>' +
    '<label class="sr-only" for="sel-link">Link da seleção</label><input type="text" id="sel-link" class="link-selecao" readonly value="' + escaparHtml(link) + '">' +
    '<a class="btn-zap" style="margin:0 16px 8px" id="sel-zap" href="' + escaparHtml('https://wa.me/?text=' + encodeURIComponent(msg)) + '" target="_blank" rel="noopener">💬 Enviar pelo WhatsApp</a>' +
    '<button type="button" class="btn-secundario-cta" id="sel-copiar">📋 Copiar link</button>' +
    (navigator.share ? '<button type="button" class="btn-secundario-cta" id="sel-nativo">↗ Mais opções de compartilhar…</button>' : '') +
    '<p class="texto-pequeno" id="sel-aviso" role="status" style="padding-bottom:16px"></p>';
  document.getElementById('btn-fechar-selecao').addEventListener('click', fecharSelecao);
  document.getElementById('sel-copiar').addEventListener('click', async function () {
    var aviso = document.getElementById('sel-aviso');
    try { await navigator.clipboard.writeText(link); aviso.textContent = 'Link copiado. É só colar na conversa.'; }
    catch (e) { var i = document.getElementById('sel-link'); i.focus(); i.select(); aviso.textContent = 'Selecione e copie o link acima.'; }
  });
  var nat = document.getElementById('sel-nativo');
  if (nat) nat.addEventListener('click', async function () { try { await navigator.share({ title: 'TENKiTER Modas — peças selecionadas', text: 'Olha as peças que separei na TENKiTER Modas:', url: link }); } catch (e) {} });
  abrirComHistorico_('overlay-selecao');
}
function fecharSelecao() { fecharComHistorico_('overlay-selecao'); }

/* ---------------- ligações ---------------- */
function aoAtualizarProdutos() {
  // a lista chegou depois da pessoa já ter aberto uma gaveta: redesenha com as peças de verdade
  var s = document.getElementById('overlay-sacola'), f = document.getElementById('overlay-favoritos');
  if (s && s.classList.contains('aberto') && !document.getElementById('pedido-ok') && !document.getElementById('ped-nome')) abrirSacola();
  if (f && f.classList.contains('aberto')) abrirFavoritos();
}

function ligarPedidoNaPagina() {
  var bs = document.getElementById('btn-sacola-header'); if (bs) bs.addEventListener('click', abrirSacola);
  var bf = document.getElementById('btn-favoritos-header'); if (bf) bf.addEventListener('click', abrirFavoritos);
  var bsel = document.getElementById('btn-share-filtros'); if (bsel) bsel.addEventListener('click', abrirSelecao);
  [['overlay-sacola', fecharSacola], ['overlay-favoritos', fecharFavoritos], ['overlay-rastreio', fecharRastreio], ['overlay-selecao', fecharSelecao]].forEach(function (par) {
    var ov = document.getElementById(par[0]); if (!ov) return;
    ov.addEventListener('click', function (e) { if (e.target === ov) par[1](); });
    habilitarArrastarParaFechar(ov.querySelector('.modal'), par[1]);
  });
  var rast = document.getElementById('rod-rastrear');
  if (rast) rast.addEventListener('click', function (e) { e.preventDefault(); abrirRastreio('', ''); });
  var z = document.getElementById('rod-zap'); if (z) z.href = linkWhatsApp('Olá! Vim pelo catálogo da TENKiTER Modas.');
  var fz = document.getElementById('fab-zap');
  if (fz) { fz.href = linkWhatsApp('Olá! Vim pelo catálogo da TENKiTER Modas e quero ajuda.'); fz.addEventListener('click', function () { if (window.TKMeta) TKMeta.evento('Contact'); }); }
}
