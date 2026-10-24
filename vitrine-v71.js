/* ====================================================================
 * TENKiTER — vitrine v7.1 (menu, pesquisa e filtros)
 *
 * Camada ADITIVA, no mesmo padrão de vitrine.js / a11y.js: carregada por
 * último, só age na página do catálogo (guarda em #grid) e não reescreve
 * nenhuma regra de negócio. catalogo.js, nav.js e catalogo.css ficam
 * byte-idênticos ao que já estava em main.
 *
 * Itens do plano de front atendidos aqui:
 *   1. gênero + categorias num <details> fechado no celular (aberto no
 *      desktop) e faixa de vantagens em 1 linha — a vitrine sobe para a
 *      primeira tela (o 1º produto começava em y=406 de 844px)
 *   3. CLS < 0,10 — altura reservada nas faixas e aspect-ratio no cartão
 *   4. ações do cartão lado a lado no celular; categoria fora do cartão
 *   5. barra inferior escondida no desktop (>=900px), padding-bottom zerado
 *   6. piso de 12px em código, categoria e rótulo da barra
 *   7. "Limpar filtros" à vista na barra de contagem quando há filtro ativo
 *   8. categorias canônicas (Blusa/Blusas, Vestido/Vestidos,
 *      Conjunto/Conjuntos, Short/Shorts)
 *
 * Restrição do cliente mantida: a barra inferior continua com Início,
 * Buscar, Seleção e Atendente — sem Favoritos e sem Categorias.
 * ==================================================================== */
(() => {
  'use strict';

  // Só o catálogo tem vitrine. Nas outras telas esta camada não faz nada.
  if (!document.getElementById('grid')) return;

  const $ = (id) => document.getElementById(id);
  const tem = (fn) => typeof window[fn] === 'function';

  /* ==================================================================
   * CSS — injetado por último, então vence as regras de vitrine.css e
   * catalogo.css de mesma especificidade (mesma origem, ordem posterior).
   * ================================================================== */
  const CSS = `
/* ---------- item 1: as faixas de navegação num <details> ---------- */
.faixas-details { margin: 0; }
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
.card .img-wrap img { height: 100%; }

/* ---------- item 4: ações do cartão em linha ---------- */
@media (max-width: 480px) {
  .acoes-card { flex-direction: row; gap: 6px; }
  .acoes-card button {
    width: auto; flex: 1 1 0; min-width: 0;
    min-height: 44px; font-size: .72rem; padding: 0 4px;
  }
}

/* ---------- item 5: a barra inferior é de celular ---------- */
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

/* ---------- item 4: a categoria sai do cartão ---------- */
.card-info .tags { display: none; }

/* ---------- item 7: limpar filtros à vista ---------- */
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
     as faixas de gênero/categoria e as duas caíam na mesma célula do grid. */
  .vitrine-layout #beneficios { grid-column: 1 / -1; grid-row: 2; }
  .vitrine-layout .filtros { grid-row: 3; }
  .vitrine-layout main { grid-row: 3; }
}
`;

  function injetarCss() {
    if ($('tk-v71-css')) return;
    const s = document.createElement('style');
    s.id = 'tk-v71-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ==================================================================
   * Item 8 — categorias canônicas
   * "Blusa" x "Blusas", "Vestido" x "Vestidos", "Conjunto" x "Conjuntos" e
   * "Short" x "Shorts" partiam a navegação em duas entradas para a MESMA
   * coisa: a pílula "Blusa" mostrava 3 peças e "Blusas" 87, e quem clicava
   * na primeira concluía que a loja quase não tem blusa.
   * O mapa unifica na forma plural, que é a que tem acervo. Aplicado UMA
   * vez, na entrada dos dados, filtro/busca/exibição passam a ver o mesmo
   * valor — sem regra em cada lugar.
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
  /** Se o catálogo já desenhou antes desta camada carregar, a lista em
   *  memória ainda tem "Blusa"/"Blusas" separados: canoniza e redesenha. */
  function canonizarListaAtual() {
    try {
      if (typeof produtos === 'undefined' || !produtos || !produtos.length) return false;
      produtos.forEach(canonizarProduto_);
      if (tem('aplicarFiltros')) aplicarFiltros();
      return true;
    } catch (e) { return false; }
  }

  /* ==================================================================
   * Item 1 — gênero + categorias dentro de um <details>
   * O vitrine.js já envolve as duas faixas num <nav class="faixas-vitrine">.
   * Aqui esse <nav> entra num <details> que nasce FECHADO no celular: um
   * toque abre, e enquanto fechado a vitrine sobe ~110px. No desktop ele é
   * forçado aberto (o resumo some por CSS), porque lá o espaço não é o
   * problema. O <details> é o elemento certo: já traz abrir/fechar, o
   * estado `open` e o anúncio correto para leitor de tela.
   * ================================================================== */
  function montarFaixas() {
    const wrap = document.querySelector('.faixas-vitrine');
    if (!wrap || wrap.parentNode.classList.contains('faixas-details')) return;
    const det = document.createElement('details');
    det.className = 'faixas-details';
    det.id = 'faixas-details';
    const sum = document.createElement('summary');
    sum.className = 'faixas-sum';
    sum.textContent = 'Categorias e gênero';
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
   * Item 7 — "Limpar filtros" à vista
   * O #btn-limpar existe, mas mora DENTRO do painel de filtros, que no
   * celular é uma gaveta fechada. Quem aplica um filtro e se arrepende não
   * acha o botão. Este é o mesmo botão (dispara o clique do original), na
   * barra de contagem, e só aparece quando há filtro ativo.
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
   * Ciclo de atualização
   * O catálogo redesenha a cada filtro. Em vez de reescrever as funções,
   * esta camada reage ao que muda — uma MutationObserver só, com debounce.
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

  function iniciar() {
    injetarCss();
    instalarCategoriasCanonicas();
    // A lista pode já estar em memória (cache local) quando esta camada roda.
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
