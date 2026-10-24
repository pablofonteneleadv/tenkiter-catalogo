/* ====================================================================
 * TENKiTER — Pacote 1 (v7.1): menu, pesquisa e filtros
 *
 * Camada ADITIVA, no mesmo padrão de vitrine.js / a11y.js: carregada DEPOIS
 * de catalogo.js e vitrine.js. Em vez de reescrever arquivos grandes, ela
 * observa e complementa o que já existe. Nenhuma regra de negócio do
 * catálogo é alterada.
 *
 * Por que assim: catalogo.js é um script clássico — as funções e variáveis
 * de topo vivem no escopo global lexical, acessíveis PELO NOME a partir de
 * outro script clássico (mas não como window.produtos).
 * ==================================================================== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  /* O desktop é o ponto de virada do layout (mesmo 1024px do vitrine.css).
   * Serve para decidir o que nasce aberto e o que nasce recolhido. */
  const DESKTOP = () => window.matchMedia('(min-width: 1024px)').matches;

  /* ==================================================================
   * (h) Categorias duplicadas
   * A planilha tem "Blusa" (3 peças) e "Blusas" (87), "Vestido" (1) e
   * "Vestidos" (169), "Conjunto" (1) e "Conjuntos" (150), "Short" (1) e
   * "Shorts" (18). Sem isto o menu mostra as duas formas e a pessoa escolhe
   * a que tem 1 peça — parece loja vazia.
   * O mapa é aplicado na LEITURA (não altera a planilha): cada tag vira a
   * forma canônica, a que tem mais peças.
   * ================================================================== */
  const CATEGORIAS_SINONIMAS_ = {
    'blusa': 'Blusas', 'blusas': 'Blusas',
    'vestido': 'Vestidos', 'vestidos': 'Vestidos',
    'conjunto': 'Conjuntos', 'conjuntos': 'Conjuntos',
    'short': 'Shorts', 'shorts': 'Shorts',
    'calca': 'Calças', 'calcas': 'Calças',
    'camiseta': 'Camisetas', 'camisetas': 'Camisetas',
    'saia': 'Saias', 'saias': 'Saias',
    'pijama': 'Pijamas', 'pijamas': 'Pijamas',
    'bolsa': 'Bolsas', 'bolsas': 'Bolsas',
    'acessorio': 'Acessórios', 'acessorios': 'Acessórios',
    'fantasia': 'Fantasia', 'fantasias': 'Fantasia',
    'cropped': 'Cropped', 'croppeds': 'Cropped',
    'jeans': 'Jeans', 'macaquinho': 'Macaquinho', 'macaquinhos': 'Macaquinho',
    'body': 'Body', 'bodies': 'Body', 'baby-doll': 'Baby-doll', 'babydoll': 'Baby-doll',
    'calcinha': 'Calcinhas', 'calcinhas': 'Calcinhas', 'sol': 'Sol', 'multimarcas': 'Multimarcas'
  };

  /** Forma canônica de uma categoria (sem acento, minúscula). */
  function categoriaCanonica_(c) {
    const bruto = String(c || '').trim();
    if (!bruto) return bruto;
    const chave = bruto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return CATEGORIAS_SINONIMAS_[chave] || bruto;
  }

  /** Reescreve p.Categoria de cada peça para a forma canônica. */
  function normalizarCategorias_(lista) {
    (lista || []).forEach((p) => {
      if (!p || !p.Categoria) return;
      const tags = String(p.Categoria).split(',').map((s) => s.trim()).filter(Boolean).map(categoriaCanonica_);
      p.Categoria = Array.from(new Set(tags)).join(', ');
    });
    return lista;
  }

  /* Envolve o funil único por onde TODA lista de produtos passa (cache,
   * rede, offline, atualização). Assim o menu, as pílulas e a contagem já
   * nascem com as categorias juntadas. */
  function ligarNormalizacao() {
    try {
      if (typeof aplicarProdutosRecebidos !== 'function') return;
      if (aplicarProdutosRecebidos.__pacote1) return;
      const original = aplicarProdutosRecebidos;
      const envolvido = function (lista) {
        try { normalizarCategorias_(lista); } catch (e) {}
        return original(lista);
      };
      envolvido.__pacote1 = true;
      aplicarProdutosRecebidos = envolvido;
    } catch (e) {}
  }

  /* ==================================================================
   * (a) Gênero + categorias num único <details>
   * Fechado no celular: a vitrine aparece antes do 1º produto (eram 22
   * controles antes da primeira peça). No desktop nasce aberto.
   * ================================================================== */
  function agruparFaixas() {
    const gen = $('pills-genero');
    const cats = $('pills-categoria');
    if (!gen || !cats) return;
    let wrap = document.querySelector('.faixas-vitrine');
    if (!wrap) {
      wrap = document.createElement('nav');
      wrap.className = 'faixas-vitrine';
      wrap.setAttribute('aria-label', 'Categorias da loja');
      cats.parentNode.insertBefore(wrap, cats);
      wrap.appendChild(gen);
      wrap.appendChild(cats);
    }
    if (wrap.parentNode && wrap.parentNode.tagName === 'DETAILS') return;
    const det = document.createElement('details');
    det.className = 'nav-loja';
    det.id = 'nav-loja';
    const sum = document.createElement('summary');
    sum.textContent = 'Categorias e gênero';
    det.appendChild(sum);
    wrap.parentNode.insertBefore(det, wrap);
    det.appendChild(wrap);
    det.open = DESKTOP();
  }

  /* ==================================================================
   * (a) Faixa de vantagens recolhida no celular
   * Ela é a 3ª coisa antes do 1º produto e não ajuda a escolher. No desktop
   * fica exatamente como sempre esteve.
   * ================================================================== */
  function ajustarBeneficios() {
    const ben = $('beneficios');
    if (!ben) return;
    const det = $('beneficios-details');
    if (DESKTOP()) {
      if (det && det.parentNode) { det.parentNode.insertBefore(ben, det); det.remove(); }
      return;
    }
    if (det) return;
    const d = document.createElement('details');
    d.className = 'beneficios-details';
    d.id = 'beneficios-details';
    const s = document.createElement('summary');
    s.textContent = 'Vantagens da loja';
    d.appendChild(s);
    ben.parentNode.insertBefore(d, ben);
    d.appendChild(ben);
  }

  /* ==================================================================
   * (g) "Limpar filtros" sempre à vista
   * No celular a gaveta de filtros fica fechada, então o #btn-limpar que
   * vive dentro dela não aparecia. Este botão espelha o mesmo clique e só
   * existe quando há filtro ativo.
   * ================================================================== */
  function algumFiltroAtivo() {
    try {
      if ($('busca') && $('busca').value.trim()) return true;
      if ($('preco-min') && $('preco-min').value) return true;
      if ($('preco-max') && $('preco-max').value) return true;
      if (typeof filtroCategorias !== 'undefined' && filtroCategorias && filtroCategorias.size > 0) return true;
      if (typeof filtroGeneros !== 'undefined' && filtroGeneros && filtroGeneros.size > 0) return true;
      if (document.querySelectorAll('#filtros-extras .chip.selecionado, #chips-extra button[aria-pressed="true"]').length > 0) return true;
    } catch (e) {}
    return false;
  }

  function ajustarLimparVisivel() {
    const alvo = $('filtros');
    if (!alvo) return;
    let b = $('btn-limpar-visivel');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'btn-limpar-visivel';
      b.textContent = '\u2715 Limpar filtros';
      b.addEventListener('click', () => { const o = $('btn-limpar'); if (o) o.click(); });
      alvo.parentNode.insertBefore(b, alvo.nextSibling);
    }
    const ativo = algumFiltroAtivo();
    document.body.classList.toggle('tem-filtro-ativo', ativo);
    b.hidden = !ativo;
  }

  /* ==================================================================
   * Ligação: roda no início e a cada mudança da lista/filtros.
   * ================================================================== */
  /* (d) A categoria sai do cartão: ela já aparece na pílula selecionada e na
   * janela da peça. Repetir no cartão só ocupava altura. Removemos o nó de
   * verdade (não só escondemos) para o cartão ficar mais baixo. */
  function removerTagsDoCartao() {
    document.querySelectorAll('.card-info .tags').forEach((el) => el.remove());
  }

  function aplicarTudo() {
    try { agruparFaixas(); } catch (e) {}
    try { ajustarBeneficios(); } catch (e) {}
    try { ajustarLimparVisivel(); } catch (e) {}
    try { removerTagsDoCartao(); } catch (e) {}
  }

  function iniciar() {
    ligarNormalizacao();
    aplicarTudo();

    /* A lista é redesenhada por catalogo.js/vitrine.js; observamos o DOM em
     * vez de reescrever o render. */
    let pendente = null;
    const agendar = () => {
      if (pendente) return;
      pendente = setTimeout(() => { pendente = null; aplicarTudo(); }, 60);
    };
    try {
      const alvo = $('grade') || $('lista') || document.body;
      new MutationObserver(agendar).observe(alvo, { childList: true, subtree: true });
    } catch (e) {}
    ['input', 'change', 'click'].forEach((ev) => document.addEventListener(ev, agendar, true));
    window.addEventListener('storage', agendar);

    /* O que nasce aberto/recolhido depende da largura da tela. */
    window.addEventListener('resize', () => {
      try { ajustarBeneficios(); } catch (e) {}
      const d = $('nav-loja'); if (d) d.open = DESKTOP();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
