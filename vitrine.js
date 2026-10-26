/* ====================================================================
 * TENKiTER — camada de vitrine (v7.0)
 *
 * Sprint 1–3 do relatório de front. Carregada DEPOIS de catalogo.js e
 * nav.js: em vez de reescrever arquivos grandes, esta camada observa e
 * complementa o que já existe. É o mesmo padrão de a11y.js / meta.js.
 *
 * Por que assim: catalogo.js é um script clássico (as funções vivem no
 * escopo global) e não é um IIFE fechado. Isso permite envolver uma
 * função existente sem duplicá-la, e é o que este arquivo faz — nunca
 * recria regra de negócio que já está lá.
 *
 * Itens atendidos:
 *   A11Y-1 salto para as peças            A11Y-2 nome acessível = texto visível
 *   A11Y-3 foco visível (vitrine.css)     A11Y-4 contraste do CTA (vitrine.css)
 *   A11Y-5 grupo nomeado nas pílulas/chips A11Y-6 prefers-contrast/forced-colors
 *   NAV-1   barra inferior de compra       NAV-2   categorias em 2 níveis
 *   NAV-3   facetas à esquerda (desktop)   NAV-4   buscas recentes
 *   VIT-1   miniaturas + tamanho no card   VIT-2   Novidades / Mais consultados
 *   VIT-3   tamanho em botões + medidas    VIT-4   contagem por faceta
 *   VIT-5   prova social                   VIT-6   CTA "Pedir no WhatsApp"
 * ==================================================================== */
(() => {
  'use strict';

  // Só o catálogo tem vitrine. Nas outras telas esta camada não faz nada.
  if (!document.getElementById('grid')) return;

  /* Seletor das faixas. Depois que cercarFaixas() envolve gênero e categoria
   * num wrapper, elas deixam de ser filhas diretas do <body>; toda busca por
   * elas passa por aqui para não depender do nível. */
  const faixaGenero = () => document.getElementById('pills-genero');
  const faixaCategoria = () => document.getElementById('pills-categoria');

  const $ = (id) => document.getElementById(id);
  const VISTAS = 'tk_vistas_v1';
  const RECENTES = 'tk_buscas_recentes';
  const tem = (fn) => typeof window[fn] === 'function';
  const arred = (v) => (typeof v === 'number' ? v : 0);

  /* ATENÇÃO — por que os acessos abaixo são por NOME e não por window.*
   * catalogo.js declara `let produtos`, `let filtroGeneros` etc. No topo de
   * um script clássico, `let`/`const` ficam no escopo do script: acessíveis
   * pelo nome a partir de outro script clássico, mas NÃO como window.produtos.
   * Por isso as funções abaixo, e um try/catch em volta de cada leitura —
   * se o catálogo não carregar, a vitrine apenas não enfeita nada. */
  const listaProdutos = () => { try { return typeof produtos !== 'undefined' && produtos ? produtos : []; } catch (e) { return []; } };
  // Nomes DIFERENTES dos originais de propósito: um `const generosDisponiveis = () =>
  // typeof generosDisponiveis` se auto-referencia e devolve a própria função em vez do Set.
  const conjuntoGeneros = () => { try { return typeof filtroGeneros !== 'undefined' ? filtroGeneros : null; } catch (e) { return null; } };
  const conjuntoCategorias = () => { try { return typeof filtroCategorias !== 'undefined' ? filtroCategorias : null; } catch (e) { return null; } };
  const lerGenerosDisponiveis = () => { try { return typeof generosDisponiveis !== 'undefined' && generosDisponiveis ? generosDisponiveis : []; } catch (e) { return []; } };
  const lerCategoriasDisponiveis = () => { try { return typeof categoriasDisponiveis !== 'undefined' && categoriasDisponiveis ? categoriasDisponiveis : []; } catch (e) { return []; } };

  /* ==================================================================
   * A11Y-1 — salto para as peças
   * Cabeçalho + busca + filtros + vantagens são ~12 controles antes da
   * primeira peça. Este link é a primeira coisa que o Tab encontra.
   * ================================================================== */
  function criarSalto() {
    if ($('pular-pecas')) return;
    const main = $('pecas') || document.querySelector('main');
    if (!main) return;
    if (!main.id) main.id = 'pecas';
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    const a = document.createElement('a');
    a.id = 'pular-pecas';
    a.className = 'pular-conteudo';
    a.href = '#' + main.id;
    a.textContent = 'Pular para as peças';
    a.addEventListener('click', () => {
      // O href já move o foco; isto garante o comportamento mesmo se o
      // navegador não focar elementos com tabindex=-1 pelo fragmento.
      setTimeout(() => { try { main.focus({ preventScroll: true }); } catch (e) { main.focus(); } }, 0);
    });
    document.body.insertBefore(a, document.body.firstChild);
  }

  /* ==================================================================
   * A11Y — as faixas de gênero/categoria precisam de um landmark
   * Elas ficam fora de <main> (é o desenho da página: a vitrine desliza
   * por baixo). Soltas no <body>, o axe reprova em `region`: “conteúdo
   * fora de landmarks”. Envolver as duas numa <nav> com nome resolve sem
   * mexer no layout, porque o wrapper é display:contents.
   * ================================================================== */
  function cercarFaixas() {
    const gen = faixaGenero();
    const cats = faixaCategoria();
    if (!gen || !cats) return;
    // O gênero nasce fora do .vitrine-layout (antes do container no HTML);
    // ele precisa entrar para, no desktop, ficar na mesma faixa das categorias.
    const layout = document.querySelector('.vitrine-layout');
    if (layout && gen.parentNode !== layout && !gen.parentNode.dataset.faixas) {
      layout.insertBefore(gen, cats);
    }
    if (gen.parentNode && gen.parentNode.dataset && gen.parentNode.dataset.faixas === '1') return;
    const wrap = document.createElement('nav');
    wrap.dataset.faixas = '1';
    wrap.className = 'faixas-vitrine';
    wrap.setAttribute('aria-label', 'Categorias da loja');
    cats.parentNode.insertBefore(wrap, cats);
    wrap.appendChild(gen);
    wrap.appendChild(cats);
  }

  /* ==================================================================
   * A11Y-2 — o nome acessível começa pelo texto visível
   * O botão mostra "Selecionar" e o leitor de tela dizia
   * "Vestido X: selecionar" — a regra label-content-name-mismatch exige
   * que o nome COMECE pelo texto que está na tela. Ação primeiro,
   * contexto depois: é também o que a pessoa ouve no celular.
   * ================================================================== */
  function rotuloSacola(nome, na) {
    const estado = na ? 'Na seleção' : 'Selecionar';
    return nome ? (estado + ': ' + nome) : estado;
  }
  window.rotuloSacola_ = rotuloSacola;

  /** Repinta o rótulo dos botões de seleção que já estão na tela. */
  function corrigirRotulosSacola() {
    document.querySelectorAll('.ac-sacola').forEach((btn) => {
      if (!btn.hasAttribute('data-rot')) btn.setAttribute('data-rot', btn.getAttribute('aria-label') || '');
      // Só reescreve o que ainda usa o formato antigo ("Nome: selecionar").
      const atual = btn.getAttribute('aria-label') || '';
      if (/: (selecionar|na seleção)$/i.test(atual)) {
        const nome = atual.replace(/:\s*(selecionar|na seleção)$/i, '');
        btn.setAttribute('aria-label', rotuloSacola(nome, btn.getAttribute('aria-pressed') === 'true'));
      }
    });
  }

  /* ==================================================================
   * NAV-2 / VIT-4 — contagem por faceta
   * "Quantas peças tem aqui?" respondido antes do clique: evita o filtro
   * que devolve lista vazia. O total vem do estado real do catálogo.
   * ================================================================== */
  function contar(v, campo, extra) {
    const lista = listaProdutos();
    return lista.filter((p) => {
      if (tem('estaEsgotado') && estaEsgotado(p)) return false;
      if (extra && !extra(p)) return false;
      const tags = campo === 'cor' || campo === 'tamanho'
        ? listaDeTags(textoPlano(p[campo === 'cor' ? 'Cores' : 'Tamanhos']))
        : listaDeTags(p[campo]);
      return tags.includes(v);
    }).length;
  }

  /* ==================================================================
   * NAV-2 — navegação em 2 níveis
   * Nível 1: gênero. Nível 2: as categorias DAQUELE gênero, com contagem.
   * O nível 2 só aparece com um gênero escolhido — uma árvore aberta de
   * 14 categorias empurra a vitrine para fora da tela (erro clássico).
   * ================================================================== */
  function montarNivelGenero() {
    const faixa = $('pills-genero');
    const cats = $('pills-categoria');
    if (!faixa || !cats) return;

    const generos = Array.from(lerGenerosDisponiveis() || []).sort();
    if (!generos.length) { faixa.hidden = true; return; }

    const sel = conjuntoGeneros();
    if (!sel) { faixa.hidden = true; return; }
    faixa.hidden = false;
    faixa.textContent = '';

    const botao = (valor, rotulo, ativo, n, aoClicar) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pill-gen';
      b.setAttribute('aria-pressed', String(!!ativo));
      b.textContent = rotulo;
      if (n) {
        const s = document.createElement('span');
        s.className = 'pill-n';
        s.textContent = n;
        s.setAttribute('aria-hidden', 'true');
        b.appendChild(s);
        b.setAttribute('aria-label', rotulo + ': ' + n + (n === 1 ? ' peça' : ' peças'));
      }
      b.addEventListener('click', aoClicar);
      faixa.appendChild(b);
    };

    botao('', 'Todos', sel.size === 0, 0, () => {
      sel.clear();
      aplicarFiltros();
    });
    generos.forEach((g) => {
      botao(g, g, sel.size === 1 && sel.has(g), contar(g, 'Genero'), () => {
        const era = sel.size === 1 && sel.has(g);
        sel.clear();
        if (!era) sel.add(g);
        if (era && conjuntoCategorias()) conjuntoCategorias().clear();
        aplicarFiltros();
      });
    });

    // Nível 2: filtra as categorias oferecidas pelo gênero escolhido.
    const genero = sel.size === 1 ? Array.from(sel)[0] : null;
    cats.querySelectorAll('.pill-cat').forEach((p) => {
      const valor = p.dataset.val || p.textContent.replace(/\s*\d+$/, '').trim();
      p.dataset.val = valor;
      if (genero) {
        const n = contar(valor, 'Categoria', (prod) => listaDeTags(prod.Genero).includes(genero));
        p.hidden = n === 0;
        p.setAttribute('aria-label', valor + ': ' + n + (n === 1 ? ' peça' : ' peças'));
      } else {
        p.hidden = false;
      }
      if (!p.hasAttribute('aria-pressed')) {
        p.setAttribute('aria-pressed', String(p.classList.contains('selecionado')));
      }
    });
  }

  /* ==================================================================
   * A11Y-5 — pílulas e chips são grupos, não uma pilha de botões soltos
   * Sem nome de grupo, o leitor de tela anuncia "Camiseta, botão" sem
   * dizer se aquilo é categoria, gênero, cor ou tamanho.
   * ================================================================== */
  const GRUPOS = [
    ['pills-genero', 'Filtrar por gênero'],
    ['pills-categoria', 'Filtrar por categoria'],
    ['chips-genero', 'Gênero'],
    ['chips-categoria', 'Categoria'],
    ['chips-cor', 'Cor'],
    ['chips-tamanho', 'Tamanho']
  ];
  function nomearGrupos() {
    GRUPOS.forEach(([id, rotulo]) => {
      const el = $(id);
      if (!el) return;
      // `role="group"` NÃO é permitido em <nav> (o axe reprova: aria-allowed-role).
      // Em <nav> o nome já vem de aria-label e o papel é "navigation"; nos
      // containers neutros (div) o group é o que agrupa os botões de filtro.
      if (el.tagName === 'NAV') {
        el.setAttribute('aria-label', rotulo);
        return;
      }
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', rotulo);
    });
  }

  /* ==================================================================
   * VIT-2 — "Novidades primeiro" e "Mais consultados"
   * A lista pública não devolve contagem de acessos por peça, então
   * "mais consultados" usa o único sinal real disponível: o que esta
   * pessoa abriu, guardou ou pôs na seleção. Empate cai na ordem do
   * servidor, que já traz as peças novas primeiro.
   * ================================================================== */
  function vistas() {
    try { const m = JSON.parse(localStorage.getItem(VISTAS) || '{}'); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; }
  }
  function anotarVista(id) {
    try {
      const m = vistas();
      const k = String(id);
      m[k] = Math.min(99, Number(m[k] || 0) + 1);
      localStorage.setItem(VISTAS, JSON.stringify(m));
    } catch (e) {}
  }
  function interesse(p) {
    const id = String(p.ID);
    let n = 0;
    try {
      if (tem('ehFavorito') && ehFavorito(id)) n += 3;
      if (tem('estaNaSacola') && estaNaSacola(id)) n += 5;
    } catch (e) {}
    return n + arred(Number(vistas()[id] || 0));
  }

  function instalarOrdenacao() {
    const sel = $('ordem');
    if (!sel) return;
    if (!sel.querySelector('option[value="novidades"]')) {
      const o = document.createElement('option');
      o.value = 'novidades';
      o.textContent = 'Novidades primeiro';
      sel.appendChild(o);
    }
    if (!sel.querySelector('option[value="mais-vendidos"]')) {
      const o = document.createElement('option');
      o.value = 'mais-vendidos';
      o.textContent = 'Mais consultados';
      sel.appendChild(o);
    }
  }

  // Envolve a ordenação original: mantém os 4 critérios que já existiam.
  const ordenarOriginal = window.ordenarLista_;
  if (typeof ordenarOriginal === 'function') {
    window.ordenarLista_ = function (lista) {
      const sel = $('ordem');
      const o = sel ? sel.value : '';
      if (o === 'novidades') {
        return lista.slice().sort((a, b) => ((ehNovidade(b) ? 1 : 0) - (ehNovidade(a) ? 1 : 0)));
      }
      if (o === 'mais-vendidos') {
        return lista.slice().sort((a, b) => (interesse(b) - interesse(a)));
      }
      return ordenarOriginal(lista);
    };
  }

  // Toda peça aberta conta para "mais consultados" e vira a peça atual do modal.
  // (Comparar pelo título da peça seria frágil: o nome na tela pode vir com
  //  sanitização, corte ou preço colado. Guardar o id é exato.)
  let pecaAtual = null;
  const detalheOriginal = window.abrirDetalhe;
  if (typeof detalheOriginal === 'function') {
    window.abrirDetalhe = function (id) {
      anotarVista(id);
      pecaAtual = listaProdutos().find((x) => String(x.ID) === String(id)) || null;
      const r = detalheOriginal.apply(this, arguments);
      setTimeout(() => { try { prepararPeca(); } catch (e) {} }, 0);
      return r;
    };
  }

  /* ==================================================================
   * VIT-3 — tamanho e cor na mensagem do WhatsApp
   * Menos ida-e-volta no atendimento ("qual tamanho?", "tem em preto?").
   * Se a peça tem tamanhos e nenhum foi escolhido, o pedido NÃO sai
   * sem tamanho: o botão pede a escolha e leva o foco para ela.
   * ================================================================== */
  const zapOriginal = window.abrirWhatsApp;
  if (typeof zapOriginal === 'function') {
    window.abrirWhatsApp = function (p, foto, escolha) {
      if (escolha && (escolha.tam || escolha.cor)) {
        const extra = '\n' + [
          escolha.tam ? 'Tamanho: ' + escolha.tam : '',
          escolha.cor ? 'Cor: ' + escolha.cor : ''
        ].filter(Boolean).join(' · ');
        // Reaproveita o caminho original (link, evento, pixel) só acrescentando a escolha.
        // `window.open` é envolvido UMA vez, apenas durante esta chamada sincrona: o texto
        // original já vem montado e o que se faz aqui é inserir a linha da escolha.
        const aberto = window.open;
        window.open = function (url) {
          try {
            const u = new URL(String(url), location.href);
            const t = u.searchParams.get('text') || '';
            if (t.indexOf('Tamanho:') === -1 && t.indexOf('Cor:') === -1) {
              // A escolha entra DEPOIS do nome da peça (antes da linha de preço
              // ou de "saber o valor"), para o atendente ler primeiro o quê e
              // depois em que tamanho — e para não partir a frase de valor.
              const linhas = t.split('\n');
              const posNome = linhas.findIndex((l) => l.indexOf('*') === 0);
              const i = posNome >= 0 ? posNome + 1 : 1;
              linhas.splice(i, 0, extra.replace(/^\n/, ''));
              u.searchParams.set('text', linhas.join('\n'));
              // URLSearchParams escreve espaço como "+" (application/x-www-form-urlencoded),
              // mas o wa.me e o restante do app esperam %20 — e o texto chega ao
              // atendente com "+" no lugar dos espaços. Um "+" cru na query é sempre
              // espaço (um mais literal viraria %2B), então a troca é segura.
              return aberto.call(window, u.toString().replace(/\+/g, '%20'), '_blank');
            }
            return aberto.call(window, u.toString().replace(/\+/g, '%20'), '_blank');
          } catch (e) { return aberto.call(window, url, '_blank'); }
        };
        try { return zapOriginal.call(this, p, foto); }
        finally { window.open = aberto; }
      }
      return zapOriginal.apply(this, arguments);
    };
  }

  /* ==================================================================
   * VIT-5 — prova social sem inventar número
   * A lista pública não traz contagem de consultas por peça. A única
   * fonte honesta é o próprio aparelho. Sem sinal, o cartão não mostra
   * nada: melhor nenhum número do que um número falso.
   * ================================================================== */
  function provaSocial(p) {
    const id = String(p.ID);
    const v = arred(Number(vistas()[id] || 0));
    let n = 0;
    try {
      if (tem('ehFavorito') && ehFavorito(id)) n += 1;
      if (tem('estaNaSacola') && estaNaSacola(id)) n += 1;
    } catch (e) {}
    if (v >= 2) return 'Você já viu esta peça ' + v + ' vezes';
    if (n >= 2) return 'Você já guardou esta peça';
    if (n === 1 || v === 1) return 'Você já se interessou por esta peça';
    return '';
  }

  /* ==================================================================
   * Enriquecimento dos cartões — VIT-1, VIT-3, VIT-5, VIT-6
   * Roda DEPOIS de cada render do grid, olhando só os cartões que ainda
   * não foram visitados (marca `data-v7`). Não reescreve o grid.
   * ================================================================== */
  function fotosDe(p) {
    const cru = String(p.Fotos_Galeria || '').split(',').map((s) => s.trim()).filter(Boolean);
    return Array.from(new Set([p.Foto_URL].concat(cru).filter(Boolean)));
  }

  function enriquecerCartao(card) {
    if (!card || card.dataset.v7) return;
    const id = card.dataset.id;
    const p = listaProdutos().find((x) => String(x.ID) === String(id));
    if (!p) return;
    card.dataset.v7 = '1';

    const info = card.querySelector('.card-info');
    const img = card.querySelector('img');
    if (!info || !img) return;

    const esgotado = tem('estaEsgotado') ? estaEsgotado(p) : false;
    const nome = p.Nome || '';

    // VIT-6 (v7.4, mockup aprovado 24/10/2026) — o CTA é "Consulte esta peça" (regra: "Consulte", nunca "pedir").
    const pedir = info.querySelector('.ac-pedir');
    if (pedir) {
      if (!pedir.querySelector('.v7-rot')) {
        if (window.TKIcone) pedir.innerHTML = window.TKIcone('whatsapp') + ' '; else pedir.textContent = '\u{1F4AC} ';
        const span = document.createElement('span');
        span.className = 'v7-rot';
        span.textContent = 'Consulte esta peça';
        pedir.appendChild(span);
      }
      pedir.setAttribute('aria-label', 'Consulte esta peça: ' + nome);
    }

    // VIT-5 — prova social (só com sinal real).
    const texto = provaSocial(p);
    if (texto && !info.querySelector('.prova-social')) {
      const d = document.createElement('div');
      d.className = 'prova-social';
      const i = document.createElement('span');
      i.setAttribute('aria-hidden', 'true');
      i.textContent = '\u{1F525}';
      d.appendChild(i);
      d.appendChild(document.createTextNode(texto));
      const antes = info.querySelector('.acoes-card');
      if (antes) info.insertBefore(d, antes); else info.appendChild(d);
    }

    // VIT-1 — miniaturas: 3 fotos sem abrir a peça.
    const fotos = fotosDe(p);
    if (fotos.length > 1 && !card.querySelector('.thumbs-card')) {
      const box = document.createElement('div');
      box.className = 'thumbs-card';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Fotos de ' + nome);
      fotos.slice(0, 3).forEach((f, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'thumb-card' + (i === 0 ? ' on' : '');
        b.dataset.thumb = String(i);
        b.setAttribute('aria-pressed', String(i === 0));
        b.setAttribute('aria-label', 'Ver foto ' + (i + 1) + ' de ' + Math.min(3, fotos.length) + ': ' + nome);
        b.style.backgroundImage = "url('" + f + "')";
        b.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          img.removeAttribute('srcset');
          img.removeAttribute('sizes');
          img.src = f;
          box.querySelectorAll('.thumb-card').forEach((x, j) => {
            x.classList.toggle('on', j === i);
            x.setAttribute('aria-pressed', String(j === i));
          });
        });
        box.appendChild(b);
      });
      const wrap = card.querySelector('.img-wrap');
      if (wrap && wrap.parentNode === card) card.insertBefore(box, wrap.nextSibling);
      else img.insertAdjacentElement('afterend', box);
    }

    // VIT-1/VIT-3 — tamanho em botões dentro do cartão.
    const tamanhosApresentados = TKTamanhos.cliente(textoPlano(p.Tamanhos || ''), p.Genero);
    const tamanhos = tamanhosApresentados.valores;
    if (!esgotado && tamanhos.length && !info.querySelector('.tam-card')) {
      const box = document.createElement('div');
      box.className = 'tam-card';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', tamanhosApresentados.titulo + ' de ' + nome);
      tamanhos.slice(0, 5).forEach((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tam-op';
        b.dataset.tam = t;
        b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', (tamanhosApresentados.tipo === 'idade' ? 'Idade ' : tamanhosApresentados.tipo === 'numero' ? 'Numeração ' : 'Tamanho ') + t);
        b.textContent = t;
        b.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const era = b.getAttribute('aria-pressed') === 'true';
          box.querySelectorAll('.tam-op').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          if (!era) b.setAttribute('aria-pressed', 'true');
        });
        box.appendChild(b);
      });
      const acoes = info.querySelector('.acoes-card');
      if (acoes) info.insertBefore(box, acoes); else info.appendChild(box);
    }

    // VIT-3 — o pedido do cartão leva o tamanho marcado.
    if (pedir && !pedir.dataset.v7) {
      pedir.dataset.v7 = '1';
      pedir.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const tam = info.querySelector('.tam-op[aria-pressed="true"]');
        const p2 = listaProdutos().find((x) => String(x.ID) === String(id));
        if (p2 && tem('abrirWhatsApp')) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          abrirWhatsApp(p2, undefined, tam ? { tam: tam.dataset.tam } : null);
        }
      }, true);
    }
  }

  function enriquecerTodos() {
    const grid = $('grid');
    if (!grid) return;
    grid.querySelectorAll('.card').forEach(enriquecerCartao);
    corrigirRotulosSacola();
  }

  /* ==================================================================
   * Página da peça — VIT-3
   * Tamanho e cor em botões (57% dos sites erram isso) + guia de medidas
   * em tabela HTML de verdade, com <th scope> para leitor de tela.
   * ================================================================== */
  const MEDIDAS = [
    ['PP', '80\u201384', '62\u201366', '88\u201392'],
    ['P', '84\u201388', '66\u201370', '92\u201396'],
    ['M', '88\u201394', '70\u201376', '96\u2013102'],
    ['G', '94\u2013100', '76\u201382', '102\u2013108'],
    ['GG', '100\u2013108', '82\u201390', '108\u2013116']
  ];

  function escolhaAtual(modal) {
    const t = modal.querySelector('.op-btn[data-op="tam"][aria-pressed="true"]');
    const c = modal.querySelector('.op-btn[data-op="cor"][aria-pressed="true"]');
    return { tam: t ? t.dataset.val : undefined, cor: c ? c.dataset.val : undefined };
  }

  function montarEscolha(modal) {
    if (!modal || modal.querySelector('.op-escolha')) return;
    const p = pecaAtual;   // id exato guardado por abrirDetalhe, nunca por comparação de título
    // Sem a peça identificada não há como montar a escolha: sai de cena.
    if (!p) return;

    // Substitui o texto corrido "Tamanhos: P, M, G" por botões.
    modal.querySelectorAll('.extra').forEach((el) => {
      const rot = (el.querySelector('strong') || {}).textContent || '';
      if (/tamanhos|idades|numerações|cores/i.test(rot)) el.hidden = true;
    });

    const alvo = modal.querySelector('.extra') || modal.querySelector('.modal-conteudo');
    if (!alvo) return;

    const bloco = document.createElement('div');

    const linha = (op, rotulo, valores) => {
      if (!valores.length) return;
      const box = document.createElement('div');
      box.className = 'op-escolha';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Escolha ' + rotulo.toLowerCase());
      const r = document.createElement('span');
      r.className = 'op-rot';
      r.textContent = rotulo;
      box.appendChild(r);
      valores.forEach((v) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'op-btn';
        b.dataset.op = op;
        b.dataset.val = v;
        b.setAttribute('aria-pressed', 'false');
        b.textContent = v;
        b.addEventListener('click', () => {
          const era = b.getAttribute('aria-pressed') === 'true';
          box.querySelectorAll('.op-btn').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          if (!era) b.setAttribute('aria-pressed', 'true');
          const erro = modal.querySelector('.op-erro');
          if (erro && op === 'tam') erro.remove();
        });
        box.appendChild(b);
      });
      bloco.appendChild(box);
    };

    const tamanhosApresentados = TKTamanhos.cliente(textoPlano(p.Tamanhos || ''), p.Genero);
    linha('tam', tamanhosApresentados.tipo === 'idade' ? 'Idade' : tamanhosApresentados.tipo === 'numero' ? 'Numeração' : 'Tamanho', tamanhosApresentados.valores);
    linha('cor', 'Cor', listaDeTags(textoPlano(p.Cores || '')));

    // Guia de medidas: tabela HTML com cabeçalho de linha e coluna.
    if (bloco.children.length && tamanhosApresentados.tipo === 'legado') {
      const det = document.createElement('details');
      det.className = 'guia-medidas';
      det.id = 'guia-medidas';
      const sum = document.createElement('summary');
      if (window.TKIcone) sum.innerHTML = window.TKIcone('regua') + ' Guia de medidas'; else sum.textContent = '\u{1F4CF} Guia de medidas';
      det.appendChild(sum);
      const table = document.createElement('table');
      const cap = document.createElement('caption');
      cap.textContent = 'Medidas do corpo em centímetros. Em dúvida entre dois números, escolha o maior.';
      table.appendChild(cap);
      const thead = document.createElement('thead');
      const htr = document.createElement('tr');
      ['Tamanho', 'Busto', 'Cintura', 'Quadril'].forEach((t) => {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = t;
        htr.appendChild(th);
      });
      thead.appendChild(htr);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      MEDIDAS.forEach(([tam, ...cols]) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = tam;
        tr.appendChild(th);
        cols.forEach((c) => {
          const td = document.createElement('td');
          td.textContent = c;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      det.appendChild(table);
      bloco.appendChild(det);
    }

    alvo.parentNode.insertBefore(bloco, alvo);
  }

  /**
   * Reforça o pedido da página da peça com o tamanho/cor escolhidos.
   *
   * NÃO bloqueia o clique quando o tamanho não foi escolhido: o botão é o
   * caminho de conversão da loja inteira e travá-lo para exigir um campo
   * opcional custa mais venda do que a dúvida do atendente. Sem escolha, a
   * mensagem sai com “(a combinar)”, que já resolve o vai-e-vem no WhatsApp.
   */
  function ligarPedidoDaPeca() {
    const modal = $('modal-conteudo');
    if (!modal) return;
    const btn = $('btn-quero');
    if (!btn || btn.dataset.v7) return;
    btn.dataset.v7 = '1';
    btn.addEventListener('click', (ev) => {
      const p = pecaAtual;
      if (!p || !tem('abrirWhatsApp')) return;      // caminho original segue intacto
      const esc = escolhaAtual(modal);
      const temTamanho = !!modal.querySelector('.op-btn[data-op="tam"]');
      // Sem escolha: não impede o pedido, só registra a intenção na mensagem.
      if (temTamanho && !esc.tam) {
        avisarTamanho(modal);
        esc.tam = 'a combinar';
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
      abrirWhatsApp(p, undefined, esc);
    }, true);
  }

  /** Aviso discreto (não bloqueante) que leva o foco ao seletor de tamanho. */
  function avisarTamanho(modal) {
    let aviso = modal.querySelector('.op-erro');
    if (!aviso) {
      aviso = document.createElement('p');
      aviso.className = 'op-erro';
      const grupo = modal.querySelector('.op-escolha');
      if (grupo) grupo.appendChild(aviso);
      aviso.setAttribute('role', 'status');
    }
    aviso.textContent = 'Dica: escolha o tamanho para agilizar o atendimento.';
    setTimeout(() => { if (aviso && aviso.parentNode) aviso.remove(); }, 6000);
  }

  /**
   * Chama as duas partes da página da peça na ordem certa:
   * primeiro monta os botões (o pedido depende de eles existirem),
   * depois liga o botão de pedido.
   */
  function prepararPeca() {
    const modal = $('modal-conteudo');
    if (!modal || !modal.querySelector('.op-escolha, .extra')) return;
    montarEscolha(modal);
    ligarPedidoDaPeca();
  }

  /* ==================================================================
   * NAV-1 — barra inferior do CLIENTE (mockup aprovado em 24/10/2026)
   * Início, Buscar, Seleção, Favoritos e Atendente. Sem "Categorias"
   * (ficam no menu e em Filtros). Favoritos só salva com conta; o
   * visitante recebe o convite para entrar.
   * A barra do nav.js continua valendo para a equipe (ferramenta de
   * trabalho); para o visitante, esta substitui.
   * ================================================================== */
  const ITENS_COMPRA = [
    { id: 'inicio', href: 'index.html', icone: '\u{1F3E0}', svg: 'casa', rotulo: 'Início' },
    { id: 'buscar', href: '#busca', icone: '\u{1F50E}', svg: 'busca', rotulo: 'Buscar', acao: 'buscar' },
    { id: 'selecao', href: '#selecao', icone: '\u{1F6CD}', svg: 'sacola', rotulo: 'Seleção', acao: 'selecao', contador: true },
    { id: 'favoritos', href: '#favoritos', icone: '\u{2764}\u{FE0F}', svg: 'coracao', rotulo: 'Favoritos', acao: 'favoritos' },
    { id: 'atendente', href: '#atendente', icone: '\u{1F4AC}', svg: 'whatsapp', rotulo: 'Atendente', acao: 'atendente' }
  ];

  /* Quem é da equipe recebe do nav.js uma barra com ÁREAS DE TRABALHO. O sinal
   * seguro são os links que só existem para quem tem permissão (admin, RH,
   * currículos). "Treinamentos" NÃO serve de sinal: o visitante também o vê,
   * e usá-lo fazia a barra de compra nunca aparecer. */
  let ehEquipeCache = null;
  const AREAS_SO_EQUIPE = ['admin.html', 'curriculos.html', 'painel=rh'];
  function calcularEhEquipe() {
    const nav = document.querySelector('.tk-nav');
    if (!nav) return false;
    const hrefs = Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href') || '');
    return hrefs.some((h) => AREAS_SO_EQUIPE.some((area) => h.indexOf(area) !== -1));
  }

  function qtdSelecao() {
    try { return tem('getSacola') ? getSacola().length : 0; } catch (e) { return 0; }
  }

  function acao(nome) {
    if (nome === 'buscar') {
      const campo = $('busca');
      if (campo) {
        try { campo.focus({ preventScroll: true }); } catch (e) { campo.focus(); }
        campo.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return;
    }
    if (nome === 'selecao') {
      if (tem('abrirSacola')) return abrirSacola();
      const b = document.querySelector('[data-abrir-sacola], #btn-sacola');
      if (b) b.click();
      return;
    }
    if (nome === 'favoritos') {
      if (typeof window.abrirFavoritos === 'function') return window.abrirFavoritos();
      const f = document.getElementById('btn-favoritos-header');
      if (f) f.click();
      return;
    }
    if (nome === 'atendente') {
      const num = (typeof window.WHATSAPP_NUMERO !== 'undefined' && window.WHATSAPP_NUMERO) || '5588993223998';
      const txt = encodeURIComponent('Olá! Vim pelo catálogo e quero ajuda para escolher uma peça.');
      window.open('https://wa.me/' + num + '?text=' + txt, '_blank', 'noopener');
    }
  }

  function montarBarra() {
    const nav = document.querySelector('.tk-nav');
    if (!nav) return;
    // Decisão tomada uma única vez, antes da primeira troca.
    if (ehEquipeCache === null) ehEquipeCache = calcularEhEquipe();
    // A equipe mantém a barra de áreas (ferramenta de trabalho, não vitrine).
    if (ehEquipeCache) return;
    const assinatura = ITENS_COMPRA.map((i) => i.id).join(',') + '|' + qtdSelecao();
    if (nav.dataset.v7 === assinatura) return;
    nav.dataset.v7 = assinatura;

    nav.innerHTML = '';
    ITENS_COMPRA.forEach((it) => {
      const a = document.createElement('a');
      a.href = it.href;
      a.dataset.nav = it.id;
      if (it.id === 'inicio') a.className = 'tk-ativo';
      const i = document.createElement('span');
      i.className = 'tk-i';
      i.setAttribute('aria-hidden', 'true');
      if (window.TKIcone && it.svg) i.innerHTML = window.TKIcone(it.svg); else i.textContent = it.icone;
      const r = document.createElement('span');
      r.className = 'tk-r';
      r.textContent = it.rotulo;
      if (it.contador) {
        const n = qtdSelecao();
        if (n > 0) {
          const b = document.createElement('span');
          b.className = 'tk-b';
          b.textContent = n;
          r.appendChild(b);
        }
      }
      a.appendChild(i);
      a.appendChild(r);
      if (it.id === 'inicio') a.setAttribute('aria-current', 'page');
      if (it.acao) {
        a.addEventListener('click', (ev) => { ev.preventDefault(); acao(it.acao); });
      }
      nav.appendChild(a);
    });
  }

  /* ==================================================================
   * NAV-4 — buscas recentes no autocomplete
   * Ao tocar na busca sem nada digitado, mostra o que já se procurou
   * nesta loja (só no aparelho). Quem volta para "aquele vestido verde"
   * não precisa lembrar a palavra exata nem digitar de novo.
   * ================================================================== */
  function recentes() {
    try { const l = JSON.parse(localStorage.getItem(RECENTES) || '[]'); return Array.isArray(l) ? l.slice(0, 5) : []; } catch (e) { return []; }
  }
  function guardarRecente(termo) {
    const t = String(termo || '').trim();
    if (t.length < 2) return;
    try {
      const l = recentes().filter((x) => String(x).toLowerCase() !== t.toLowerCase());
      l.unshift(t);
      localStorage.setItem(RECENTES, JSON.stringify(l.slice(0, 5)));
    } catch (e) {}
  }

  let recentesPintados = false;
  function pintarRecentes() {
    const lista = $('sugestoes-busca');
    const campo = $('busca');
    if (!lista || !campo || campo.value.trim().length >= 2) return;
    const l = recentes();
    if (!l.length) return;
    recentesPintados = true;
    lista.textContent = '';
    const cab = document.createElement('div');
    cab.className = 'sug-aviso';
    cab.setAttribute('role', 'presentation');
    cab.textContent = 'Buscas recentes';
    lista.appendChild(cab);
    l.forEach((t, i) => {
      const d = document.createElement('div');
      d.className = 'sug-item';
      d.id = 'sug-rec-' + i;
      d.setAttribute('role', 'option');
      d.setAttribute('aria-selected', 'false');
      d.dataset.recente = t;
      const s = document.createElement('span');
      s.className = 'sug-txt';
      s.textContent = '\u{1F552} ' + t;
      d.appendChild(s);
      d.addEventListener('mousedown', (ev) => ev.preventDefault());
      d.addEventListener('click', () => {
        campo.value = t;
        guardarRecente(t);
        recentesPintados = false;
        if (tem('aplicarFiltros')) aplicarFiltros();
        lista.hidden = true;
        campo.setAttribute('aria-expanded', 'false');
      });
      lista.appendChild(d);
    });
    lista.hidden = false;
    campo.setAttribute('aria-expanded', 'true');
  }

  function ligarRecentes() {
    const campo = $('busca');
    if (!campo || campo.dataset.v7) return;
    campo.dataset.v7 = '1';
    campo.addEventListener('focus', () => { setTimeout(pintarRecentes, 0); });
    campo.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !recentesPintados) guardarRecente(campo.value);
    }, true);
    campo.addEventListener('blur', () => { setTimeout(() => { recentesPintados = false; }, 180); });
  }

  /* ==================================================================
   * Observação do DOM
   * O catálogo redesenha o grid, as pílulas e a peça a cada filtro. Em
   * vez de reescrever essas funções, esta camada reage ao que muda —
   * uma MutationObserver só, com debounce, para não pesar a rolagem.
   * ================================================================== */
  function observar() {
    let pendente = null;
    const agendar = () => {
      if (pendente) return;
      pendente = setTimeout(() => {
        pendente = null;
        try { enriquecerTodos(); } catch (e) {}
        try { prepararPeca(); } catch (e) {}
        try { montarBarra(); } catch (e) {}
      }, 60);
    };

    const obs = new MutationObserver(agendar);
    obs.observe(document.body, { childList: true, subtree: true });

    // "Nível 2" depende do que foi clicado: reage ao clique sem esperar o DOM.
    document.addEventListener('click', (ev) => {
      if (ev.target.closest && ev.target.closest('#pills-genero, #pills-categoria, .chip')) {
        setTimeout(() => { try { montarNivelGenero(); } catch (e) {} }, 80);
      }
    }, true);

    window.addEventListener('storage', agendar);
  }

  /* ==================================================================
   * Arranque
   * ================================================================== */
  function iniciar() {
    criarSalto();
    cercarFaixas();
    nomearGrupos();
    instalarOrdenacao();
    // Se o catálogo já desenhou antes desta camada carregar.
    try { montarNivelGenero(); } catch (e) {}
    try { enriquecerTodos(); } catch (e) {}
    try { montarBarra(); } catch (e) {}
    ligarRecentes();
    try { prepararPeca(); } catch (e) {}
    observar();

    // As pílulas de gênero precisam ser remontadas depois de cada
    // aplicarFiltros (as contagens mudam com os outros filtros).
    if (tem('aplicarFiltros')) {
      const aplicarOriginal = window.aplicarFiltros;
      window.aplicarFiltros = function () {
        const r = aplicarOriginal.apply(this, arguments);
        setTimeout(() => {
          try { montarNivelGenero(); } catch (e) {}
          try { enriquecerTodos(); } catch (e) {}
          try { montarBarra(); } catch (e) {}
        }, 0);
        return r;
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
