/* ====================================================================
 * TENKiTER - vitrine v7.1 (menu, pesquisa e filtros)
 *
 * Camada ADITIVA, no mesmo padrao de vitrine.js / a11y.js: carregada por
 * ultimo, so age na pagina do catalogo (guarda em #grid) e nao reescreve
 * nenhuma regra de negocio. catalogo.js, nav.js e catalogo.css ficam
 * byte-identicos ao que ja estava em main.
 *
 * Itens do plano de front atendidos aqui:
 *   1. genero + categorias num <details> fechado no celular (aberto no
 *      desktop) e faixa de vantagens em 1 linha - a vitrine sobe para a
 *      primeira tela (o 1o produto comecava em y=406 de 844px)
 *   3. CLS < 0,10 - altura reservada nas faixas e aspect-ratio no cartao
 *   4. acoes do cartao lado a lado no celular; categoria fora do cartao
 *   5. barra inferior escondida no desktop (>=900px), padding-bottom zerado
 *   6. piso de 12px em codigo, categoria e rotulo da barra
 *   7. "Limpar filtros" a vista na barra de contagem quando ha filtro ativo
 *   8. categorias canonicas (Blusa/Blusas, Vestido/Vestidos,
 *      Conjunto/Conjuntos, Short/Shorts)
 *
 * Restricao do cliente mantida: a barra inferior continua com Inicio,
 * Buscar, Selecao e Atendente - sem Favoritos e sem Categorias.
 * ==================================================================== */
(() => {
  'use strict';

  // So o catalogo tem vitrine. Nas outras telas esta camada nao faz nada.
  if (!document.getElementById('grid')) return;

  const $ = (id) => document.getElementById(id);
  const tem = (fn) => typeof window[fn] === 'function';

  /* ==================================================================
   * CSS - injetado por ultimo, entao vence as regras de vitrine.css e
   * catalogo.css de mesma especificidade (mesma origem, ordem posterior).
   *
   * O build tambem extrai este bloco para vitrine-v71.css e o carrega no
   * <head> (scripts/deploy/cache_bust.py). No <head> ele chega ANTES do
   * primeiro paint; injetado so por JS, chegava depois e o recolhimento
   * das faixas virava salto de layout. Medido: CLS 0,17 com o CSS so por
   * JS contra 0,05 de linha de base; com o <link> no <head>, 0,056.
   * ================================================================== */
  const CSS = `
/* ---------- item 1: as faixas de navegacao num <details> ---------- */
.faixas-details { margin: 0; }
/* O navegador esconde o conteudo de um <details> fechado, mas o
   display:flex de .faixas-vitrine (regra de autor, em vitrine.css) vence
   essa regra do navegador - as pilulas continuavam a vista com o <details>
   fechado, e o recolhimento nao acontecia. Esconder explicitamente. */
.faixas-details:not([open]) > .faixas-vitrine { display: none; }
.faixas-sum {
  display: flex; align-items: center; gap: 8px;
  min-height: 48px; padding: 0 14px; margin: 0;
  background: #fff; border-bottom: 1px solid #eee;
  font-size: .82rem; font-weight: 800; color: #222; cursor: pointer;
  list-style: none;
}
.faixas-sum::-webkit-details-marker { display: none; }
.faixas-sum::after {
  content: "\\25BE"; margin-left: auto; font-size: .9rem; color: #8a8272;
  transition: transform .15s ease;
}
.faixas-details[open] > .faixas-sum::after { transform: rotate(180deg); }
.faixas-sum:focus-visible { outline: 3px solid #E67E22; outline-offset: -3px; }
.faixas-sum .faixas-sum-n { font-weight: 700; font-size: .74rem; color: #8a8272; }

/* ---------- item 1: vantagens em 1 linha no celular ---------- */
@media (max-width: 899px) {
  .beneficios {
    display: flex; flex-wrap: wrap; justify-content: center;
    gap: 4px 10px; min-height: 0; padding: 6px 14px;
    background: #fbf9f4; border-bottom: 1px solid #f0ece2;
  }
  .beneficios span {
    background: none; border: 0; border-radius: 0; padding: 0;
    font-size: .68rem; font-weight: 700; color: #5c5648;
    display: inline; text-align: left;
  }
  .beneficios span + span::before { content: "\\00b7"; margin-right: 10px; color: #c9bfa8; }
}

/* ---------- item 3: CLS < 0,10 ---------- */
.pills-genero { min-height: 56px; }
.pills-categoria { min-height: 50px; }
.beneficios { min-height: 44px; }
.card .img-wrap { aspect-ratio: 4 / 5; }
/* A grade nasce vazia e so cresce quando os dados chegam: sem altura
   reservada, o rodape e a caixa de ajuda sobem e descem (o maior salto
   medido). Reservar ~1 tela evita o pulo sem travar o crescimento. */
#grid { min-height: 50vh; }
.card .img-wrap img { height: 100%; }

/* ---------- item 4: acoes do cartao em linha ---------- */
@media (max-width: 480px) {
  .acoes-card { flex-direction: row; gap: 6px; }
  .acoes-card button {
    width: auto; flex: 1 1 0; min-width: 0;
    min-height: 44px; font-size: .72rem; padding: 0 4px;
  }
}

/* ---------- item 5: a barra inferior e de celular ---------- */
@media (min-width: 900px) {
  body .tk-nav { display: none !important; }
  body.tk-tem-nav { padding-bottom: 0 !important; }
  body { padding-bottom: 0; }
  body.tem-aviso-offline { padding-bottom: 44px; }
}

/* ---------- item 6: piso de 12px ---------- */
.card-info .codigo { font-size: 12px; }
body .tk-nav a { font-size: 12px !important; }
body .tk-nav a .tk-r { font-size: 12px; }

/* ---------- item 4: a categoria sai do cartao ---------- */
.card-info .tags { display: none; }

/* ---------- item 7: limpar filtros a vista ---------- */
.btn-limpar-topo {
  flex: 0 0 auto; min-height: 38px; padding: 0 12px;
  border: 1px solid #d8d2c4; border-radius: 19px;
  background: #fff; color: #333;
  font-size: .74rem; font-weight: 800; cursor: pointer; white-space: nowrap;
}
.btn-limpar-topo[hidden] { display: none; }
.btn-limpar-topo:focus-visible { outline: 3px solid #E67E22; outline-offset: 2px; }

/* ---------- desktop: o <details> fica aberto e o resumo some ---------- */
@media (min-width: 1024px) {
  .vitrine-layout > .faixas-details { grid-column: 1 / -1; grid-row: 1; }
  .vitrine-layout > .faixas-details > .faixas-vitrine {
    display: flex; flex-direction: column; gap: 2px;
  }
  .vitrine-layout > .faixas-details > .faixas-sum { display: none; }
  /* A faixa de vantagens desce para a linha 2: antes dividia a linha 1 com
     as faixas de genero/categoria e as duas caiam na mesma celula do grid. */
  .vitrine-layout #beneficios { grid-column: 1 / -1; grid-row: 2; }
  .vitrine-layout .filtros { grid-row: 3; }
  .vitrine-layout main { grid-row: 3; }
}
`;

  function injetarCss() {
    // Se o build ja colocou o <link> no <head>, nao injeta de novo: o CSS
    // do <head> chega antes do primeiro paint e evita o salto de layout.
    if (document.querySelector('link[href^="vitrine-v71.css"]')) return;
    if ($('tk-v71-css')) return;
    const s = document.createElement('style');
    s.id = 'tk-v71-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ==================================================================
   * Item 8 - categorias canonicas
   * "Blusa" x "Blusas", "Vestido" x "Vestidos", "Conjunto" x "Conjuntos" e
   * "Short" x "Shorts" partiam a navegacao em duas entradas para a MESMA
   * coisa: a pilula "Blusa" mostrava 3 pecas e "Blusas" 87, e quem clicava
   * na primeira concluia que a loja quase nao tem blusa.
   * O mapa unifica na forma plural, que e a que tem acervo. Aplicado UMA
   * vez, na entrada dos dados, filtro/busca/exibicao passam a ver o mesmo
   * valor - sem regra em cada lugar.
   * ================================================================== */
  const CATEGORIAS_CANONICAS = { 'blusa': 'Blusas', 'conjunto': 'Conjuntos', 'vestido': 'Vestidos', 'short': 'Shorts' };
  function canonizarCategoria_(v) {
    const t = String(v || '').trim();
    if (!t) return t;
    const chave = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return CATEGORIAS_CANONICAS[chave] || t;
  }
  function canonizarProduto_(p) {
    if (!p || !p.Categoria) return;
    const tags = String(p.Categoria).split(',').map((s) => canonizarCategoria_(s.trim())).filter(Boolean);
    p.Categoria = Array.from(new Set(tags)).join(', ');
  }
  function instalarCategoriasCanonicas() {
    const original = window.aplicarProdutosRecebidos;
    if (typeof original !== 'function' || original.__v71) return;
    const f = function (lista) {
      try { (lista || []).forEach(canonizarProduto_); } catch (e) {}
      return original.apply(this, arguments);
    };
    f.__v71 = true;
    window.aplicarProdutosRecebidos = f;
  }
  /** Se o catalogo ja desenhou antes desta camada carregar, a lista em
   *  memoria ainda tem "Blusa"/"Blusas" separados: canoniza e redesenha. */
  function canonizarListaAtual() {
    try {
      if (typeof produtos === 'undefined' || !produtos || !produtos.length) return false;
      produtos.forEach(canonizarProduto_);
      // v7.16: refaz também as opções dos menus (antes só refiltrava: "Blusa"/"Conjunto"/"Short"/"Vestido" ficavam
      // no menu com 0 peças e sumiam, enquanto as peças já estavam como "Blusas"...). aplicarProdutosRecebidos chama aplicarFiltros.
      if (tem('aplicarProdutosRecebidos')) aplicarProdutosRecebidos(produtos);
      else if (tem('aplicarFiltros')) aplicarFiltros();
      return true;
    } catch (e) { return false; }
  }

  /* ==================================================================
   * Item 1 - genero + categorias dentro de um <details>
   * O vitrine.js ja envolve as duas faixas num <nav class="faixas-vitrine">.
   * Aqui esse <nav> entra num <details> que nasce FECHADO no celular: um
   * toque abre, e enquanto fechado a vitrine sobe ~110px. No desktop ele e
   * forcado aberto (o resumo some por CSS), porque la o espaco nao e o
   * problema. O <details> e o elemento certo: ja traz abrir/fechar, o
   * estado `open` e o anuncio correto para leitor de tela.
   * ================================================================== */
  function montarFaixas() {
    const wrap = document.querySelector('.faixas-vitrine');
    if (!wrap || wrap.parentNode.classList.contains('faixas-details')) return;
    const det = document.createElement('details');
    det.className = 'faixas-details';
    det.id = 'faixas-details';
    const sum = document.createElement('summary');
    sum.className = 'faixas-sum';
    sum.textContent = 'Categorias e genero';
    const cont = document.createElement('span');
    cont.className = 'faixas-sum-n';
    sum.appendChild(cont);
    det.appendChild(sum);
    wrap.parentNode.insertBefore(det, wrap);
    det.appendChild(wrap);

    const largo = () => { try { return window.matchMedia('(min-width: 1024px)').matches; } catch (e) { return false; } };
    const ajustar = () => {
      if (largo()) { det.open = true; return; }
      if (!det.dataset.tocado) det.open = false;
    };
    det.addEventListener('toggle', () => { if (!largo()) det.dataset.tocado = '1'; });
    ajustar();
    try { window.matchMedia('(min-width: 1024px)').addEventListener('change', ajustar); } catch (e) {}
  }

  /** Contagem no resumo do <details>: mostra o filtro ativo sem abrir. */
  function atualizarResumoFaixas() {
    const det = $('faixas-details');
    if (!det) return;
    const n = det.querySelector('.faixas-sum-n');
    if (!n) return;
    const partes = [];
    try {
      if (typeof filtroGeneros !== 'undefined' && filtroGeneros && filtroGeneros.size) partes.push(Array.from(filtroGeneros).join(', '));
      if (typeof filtroCategorias !== 'undefined' && filtroCategorias && filtroCategorias.size) partes.push(Array.from(filtroCategorias).join(', '));
    } catch (e) {}
    n.textContent = partes.length ? '\u00b7 ' + partes.join(' \u00b7 ') : '';
  }

  /* ==================================================================
   * Item 7 - "Limpar filtros" a vista
   * O #btn-limpar existe, mas mora DENTRO do painel de filtros, que no
   * celular e uma gaveta fechada. Quem aplica um filtro e se arrepende nao
   * acha o botao. Este e o mesmo botao (dispara o clique do original), na
   * barra de contagem, e so aparece quando ha filtro ativo.
   * ================================================================== */
  function filtrosAtivos() {
    try {
      const n = document.querySelectorAll('#filtros-extras .chip.selecionado').length
        + (($('preco-min') || {}).value ? 1 : 0)
        + (($('preco-max') || {}).value ? 1 : 0);
      const q = (($('busca') || {}).value || '').trim();
      return n + (q ? 1 : 0);
    } catch (e) { return 0; }
  }

  function montarLimparTopo() {
    const barra = document.querySelector('.barra-lista');
    if (!barra) return;
    let b = barra.querySelector('.btn-limpar-topo');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-limpar-topo';
      b.textContent = '\u2715 Limpar filtros';
      b.addEventListener('click', () => { const o = $('btn-limpar'); if (o) o.click(); });
      barra.appendChild(b);
    }
    b.hidden = filtrosAtivos() === 0;
  }

  /* ==================================================================
   * Ciclo de atualizacao
   * O catalogo redesenha a cada filtro. Em vez de reescrever as funcoes,
   * esta camada reage ao que muda - uma MutationObserver so, com debounce.
   * ================================================================== */
  function atualizar() {
    try { montarFaixas(); } catch (e) {}
    try { atualizarResumoFaixas(); } catch (e) {}
    try { montarLimparTopo(); } catch (e) {}
  }

  function observar() {
    let pendente = null;
    const agendar = () => {
      if (pendente) return;
      pendente = setTimeout(() => { pendente = null; atualizar(); }, 60);
    };
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('storage', agendar);
  }

  // O CSS entra JA, na execucao do script (fim do body, antes do primeiro
  // paint). Se esperasse o DOMContentLoaded, a pagina pintaria com o layout
  // antigo das faixas e o recolhimento viraria um salto de layout (CLS).
  injetarCss();
  // Idem para o <details>: montado aqui, o recolhimento das faixas acontece
  // antes do primeiro paint. Montado no DOMContentLoaded, ele empurraria a
  // vitrine ~110px depois de a pagina ja estar visivel.
  try { montarFaixas(); } catch (e) {}

  function iniciar() {
    instalarCategoriasCanonicas();
    // A lista pode ja estar em memoria (cache local) quando esta camada roda.
    if (!canonizarListaAtual()) setTimeout(canonizarListaAtual, 0);
    atualizar();
    observar();
    // Depois de cada aplicarFiltros as contagens e o resumo mudam.
    if (tem('aplicarFiltros') && !window.aplicarFiltros.__v71) {
      const original = window.aplicarFiltros;
      const f = function () {
        const r = original.apply(this, arguments);
        setTimeout(atualizar, 0);
        return r;
      };
      f.__v71 = true;
      window.aplicarFiltros = f;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
