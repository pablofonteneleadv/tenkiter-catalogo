/* v4.27: a seleção vence sozinha (2 h; 3 h se a pessoa pediu para segurar) — tem que rodar ANTES de qualquer tela ler a sacola */
try { tkSelExpirar_(); } catch (e) {}
  const POR_PAGINA = 24;
  const QTD_PILLS_CATEGORIA = 6;

  let produtos = [];
  const equipe_ = { pode: false };   // v3.7: Equipe do site vê o X de arquivar (definirEquipe_)
  let listaFiltradaAtual = [];
  let itensVisiveis = POR_PAGINA;
  let categoriasDisponiveis = new Set();
  let generosDisponiveis = new Set();
  let coresDisponiveis = new Set();
  let filtroCores = new Set();
  let filtroCategorias = new Set();
  let filtroGeneros = new Set();
  let apenasNovidades = false;
  let apenasFavoritos = false;
  /** Seleção fixa vinda de um link (?sel=TK-0010,TK-0011,…): mostra SÓ essas peças. null = não há seleção. */
  let selecaoFixa = null;

  function listaDeTags(c) { return String(c || '').split(',').map(s => s.trim()).filter(Boolean); }

  function nivelDisponibilidade(p) {
    if (!estoqueInformado(p)) return null;
    const n = Number(p.Estoque);
    if (n <= 0) return { texto: '🔴 Esgotado', classe: 'esgotado-txt' };
    if (n <= 2) return { texto: n === 1 ? '🟡 Última unidade' : '🟡 Últimas ' + n + ' unidades', classe: 'poucas' };
    return { texto: '🟢 Disponível', classe: 'disponivel' };
  }

  /** Identificador único de UM evento: o mesmo texto vai ao Pixel (navegador) e à API de Conversões (servidor) para a Meta não contar 2x. */
  function novoEventId_(prefixo, id) { return prefixo + '-' + id + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /** eventId liga este registro ao evento do Pixel. semCapi=true: só conta na planilha (ex.: pedido com várias peças, que o Pixel conta uma vez só). */
  function registrarEvento(produtoId, codigo, tipo, eventId, semCapi) {
    try {
      const corpo = { action: 'registrarEvento', produtoId: produtoId, codigo: codigo, tipo: tipo };
      if (window.TKDisp) Object.assign(corpo, TKDisp.perfil());   // v3.5: app ou navegador, aparelho, de onde veio e um código ANÔNIMO do aparelho (sem nome nem telefone)
      // Só se o Pixel estiver ligado e aceito: o servidor pode repetir o evento na API de Conversões da Meta (o token fica só no servidor).
      const ck = !semCapi && window.TKMeta && TKMeta.cookies();
      if (ck) { corpo.meta = { fbp: ck.fbp, fbc: ck.fbc, url: location.href, ua: navigator.userAgent }; if (eventId) corpo.meta.eventId = eventId; }
      fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo) }).catch(function () {});   // sem internet não pode virar erro de JavaScript
    } catch (e) {}
  }

  /** Uma "visita" por sessão: conta quantas PESSOAS entraram (visualização conta peças vistas). Só o servidor 3.5 guarda; o antigo ignora. */
  (function () {
    try { if (sessionStorage.getItem('tk_visita_v1')) return; sessionStorage.setItem('tk_visita_v1', '1'); } catch (e) { return; }
    setTimeout(function () { registrarEvento('', '', 'visita', '', true); }, 900);
  })();

  let modoLink_ = false;   // a pessoa entrou por um link de seleção (filtros/peças vindos do endereço)
  function lerFiltrosURL() {
    const params = new URLSearchParams(window.location.search);
    modoLink_ = ['q', 'min', 'max', 'novidade', 'cat', 'gen', 'sel'].some((k) => params.has(k));
    if (params.has('q')) document.getElementById('busca').value = params.get('q');
    if (params.has('min')) document.getElementById('preco-min').value = params.get('min');
    if (params.has('max')) document.getElementById('preco-max').value = params.get('max');
    if (params.get('novidade') === 'true') apenasNovidades = true;
    if (params.has('ord') && ['recentes', 'menor', 'maior', 'az'].includes(params.get('ord'))) document.getElementById('ordem').value = params.get('ord');
    if (params.has('cat')) params.get('cat').split(',').forEach(c => filtroCategorias.add(c.trim()));
    if (params.has('gen')) params.get('gen').split(',').forEach(g => filtroGeneros.add(g.trim()));
    if (params.has('cor')) params.get('cor').split(',').forEach(g => filtroCores.add(g.trim()));
    if (params.has('sel')) {
      const itens = Array.from(new Set(params.get('sel').split(',').map(s => s.trim().slice(0, 60)).filter(Boolean))).slice(0, 60);
      selecaoFixa = itens.length ? itens : null;
    }
  }

  /** A peça faz parte da seleção do link? Casa pelo código (sem diferenciar maiúscula) ou, para peça sem código, pelo ID. */
  function naSelecaoFixa_(p) {
    if (!selecaoFixa) return true;
    const cod = String(p.Codigo || '').toLowerCase(), id = String(p.ID);
    return selecaoFixa.some(t => (cod && t.toLowerCase() === cod) || t === id);
  }

  function atualizarURLComFiltros() {
    const url = new URL(window.location);
    const busca = document.getElementById('busca').value.trim();
    const min = document.getElementById('preco-min').value;
    const max = document.getElementById('preco-max').value;

    if (busca) url.searchParams.set('q', busca); else url.searchParams.delete('q');
    if (min) url.searchParams.set('min', min); else url.searchParams.delete('min');
    if (max) url.searchParams.set('max', max); else url.searchParams.delete('max');
    if (apenasNovidades) url.searchParams.set('novidade', 'true'); else url.searchParams.delete('novidade');
    const ord = document.getElementById('ordem').value;
    if (ord && ord !== 'recentes') url.searchParams.set('ord', ord); else url.searchParams.delete('ord');

    if (filtroCategorias.size) url.searchParams.set('cat', Array.from(filtroCategorias).join(',')); else url.searchParams.delete('cat');
    if (filtroGeneros.size) url.searchParams.set('gen', Array.from(filtroGeneros).join(',')); else url.searchParams.delete('gen');
    if (filtroCores.size) url.searchParams.set('cor', Array.from(filtroCores).join(',')); else url.searchParams.delete('cor');
    if (selecaoFixa) url.searchParams.set('sel', selecaoFixa.join(',')); else url.searchParams.delete('sel');

    window.history.replaceState((window.history.state && window.history.state.overlay) ? window.history.state : {}, '', url);   // não apaga a entrada de uma janela aberta (placa, foto…)
  }

  function mostrarToastCarregando(texto) {
    const toast = document.getElementById('toast-carregando');
    document.getElementById('texto-toast').textContent = texto || 'Carregando produtos...';
    toast.classList.add('visivel');
  }

  function esconderToastCarregando() {
    document.getElementById('toast-carregando').classList.remove('visivel');
  }

  function aplicarProdutosRecebidos(lista) {
    produtos = lista;
    categoriasDisponiveis = new Set();
    generosDisponiveis = new Set();
    coresDisponiveis = new Set();
    produtos.forEach(p => {
      listaDeTags(textoPlano(p.Cores)).forEach(c => coresDisponiveis.add(c));
      listaDeTags(p.Categoria).forEach(c => categoriasDisponiveis.add(c));
      listaDeTags(p.Genero).forEach(g => generosDisponiveis.add(g));
    });
    renderizarChipExtra();
    renderizarPillsCategoria();
    renderizarChipsFiltro('chips-categoria', categoriasDisponiveis, filtroCategorias, 'resumo-categoria');
    renderizarChipsFiltro('chips-genero', generosDisponiveis, filtroGeneros, 'resumo-genero');
    renderizarChipsFiltro('chips-cor', coresDisponiveis, filtroCores, 'resumo-cor');
    atualizarBadges();
    aplicarFiltros();
    if (typeof aoAtualizarProdutos === 'function') aoAtualizarProdutos();
  }

  /** Aviso "sem internet" (só aparece quando realmente está offline; o catálogo salvo continua na tela). */
  function avisoOffline_(mostrar) {
    const el = document.getElementById('aviso-offline');
    if (el) el.hidden = !mostrar;
    document.body.classList.toggle('tem-aviso-offline', !!mostrar);
  }
  async function atualizarListaSilencioso_() {
    try {
      const resp = await buscarListaPublica();
      const recebidos = (resp.produtos || []).reverse();
      salvarCatalogoCache(recebidos);
      aplicarProdutosRecebidos(recebidos);
      avisoOffline_(false);
    } catch (e) { /* segue com o que já está na tela */ }
  }
  window.addEventListener('offline', () => avisoOffline_(true));
  window.addEventListener('online', () => { avisoOffline_(false); atualizarListaSilencioso_(); });
  if (navigator.onLine === false) avisoOffline_(true);

  /**
   * Carrega o catálogo. Se já existe uma lista salva localmente (de uma
   * visita recente), mostra ela IMEDIATAMENTE — sem esperar a rede — e só
   * depois busca a versão atual do servidor por trás ("stale-while-revalidate").
   * Isso faz a página parecer instantânea mesmo em conexões lentas; o único
   * custo é que, por 1-2 segundos, o visitante pode ver preço/estoque de
   * poucos minutos atrás antes da tela se atualizar sozinha.
   */
  async function carregarCatalogo() {
    lerFiltrosURL();
    const cache = obterCatalogoCache();
    const temCache = !!(cache && cache.produtos && cache.produtos.length);

    if (temCache) {
      aplicarProdutosRecebidos(cache.produtos);
      abrirProdutoDaURL();
      // v3.10 (FE-01): com cache local, revalida por trás e repinta quando a lista nova chegar
      // (stale-while-revalidate). Antes só a busca do <head> atualizava, e ela podia chegar antes
      // do cache ser lido — a tela ficava com a versão velha até a próxima visita.
      buscarListaComCache(function (novos) {
        if (Array.isArray(novos) && novos.length) { aplicarProdutosRecebidos(novos); avisoOffline_(false); }
      }).catch(function () {});
    } else {
      mostrarToastCarregando('Carregando produtos...');
      // esqueleto: cartões cinza no formato do real (em vez de tela vazia) até a lista chegar
      const grade = document.getElementById('grid');
      grade.innerHTML = Array.from({ length: 8 }, () =>
        '<div class="card esqueleto" aria-hidden="true"><div class="sk sk-foto"></div><div class="card-info">' +
        '<div class="sk sk-linha" style="width:35%"></div><div class="sk sk-linha"></div><div class="sk sk-linha" style="width:60%"></div></div></div>').join('');
    }

    try {
      const pre = window.__precargaLista; window.__precargaLista = null;   // busca iniciada no <head> (uma vez só)
      const resp = await (pre || buscarListaPublica());
      const recebidos = (resp.produtos || []).reverse();
      if (!Array.isArray(resp.produtos)) throw new Error('resposta sem lista');
      salvarCatalogoCache(recebidos);
      aplicarProdutosRecebidos(recebidos);
      avisoOffline_(false);
      if (!temCache) abrirProdutoDaURL();
    } catch (e) {
      if (!temCache) {
        document.getElementById('grid').innerHTML = ''; // some o esqueleto
        document.getElementById('contagem').textContent = '';
        const vazio = document.getElementById('vazio');
        vazio.textContent = '';
        const msg = document.createElement('div');
        msg.textContent = 'Não foi possível carregar o catálogo agora. Verifique sua internet e tente de novo.';
        const acoes = document.createElement('div'); acoes.className = 'vazio-acoes';
        const tentar = document.createElement('button');
        tentar.type = 'button'; tentar.className = 'btn-neutro'; tentar.id = 'btn-tentar-de-novo'; tentar.textContent = '🔄 Tentar de novo';
        tentar.addEventListener('click', () => { vazio.style.display = 'none'; carregarCatalogo(); });
        const zap = document.createElement('a');
        zap.className = 'btn-zap'; zap.id = 'vazio-zap'; zap.target = '_blank'; zap.rel = 'noopener';
        zap.href = linkWhatsApp('Olá! Não consegui abrir o catálogo no site. Pode me ajudar a escolher uma peça?');
        zap.textContent = '💬 Falar com a loja no WhatsApp';
        acoes.appendChild(tentar); acoes.appendChild(zap);
        vazio.appendChild(msg); vazio.appendChild(acoes);
        vazio.style.display = 'block';
      } else if (navigator.onLine === false) {
        avisoOffline_(true);
      }
      // Com cache: mantém o que já está na tela em vez de mostrar erro — o
      // visitante continua vendo o catálogo (um pouco desatualizado) em vez de nada.
    } finally {
      esconderToastCarregando();
    }
  }

  function renderizarChipExtra() {
    const container = document.getElementById('chips-extra');
    container.innerHTML = '';

    const chipNovidade = document.createElement('button');
    chipNovidade.type = 'button';
    chipNovidade.className = 'chip novidade-chip' + (apenasNovidades ? ' selecionado' : '');
    chipNovidade.textContent = '🆕 Apenas Novidades';
    chipNovidade.addEventListener('click', () => { apenasNovidades = !apenasNovidades; chipNovidade.classList.toggle('selecionado'); aplicarFiltros(); });
    container.appendChild(chipNovidade);

    const chipFavoritos = document.createElement('button');
    chipFavoritos.type = 'button';
    chipFavoritos.className = 'chip favoritos-chip' + (apenasFavoritos ? ' selecionado' : '');
    chipFavoritos.textContent = '❤️ Favoritos';
    chipFavoritos.addEventListener('click', () => { apenasFavoritos = !apenasFavoritos; chipFavoritos.classList.toggle('selecionado'); aplicarFiltros(); });
    container.appendChild(chipFavoritos);
  }

  function renderizarPillsCategoria() {
    const container = document.getElementById('pills-categoria');
    container.innerHTML = '';
    const todas = Array.from(categoriasDisponiveis).sort();
    const principais = todas.slice(0, QTD_PILLS_CATEGORIA);
    const resto = todas.length - principais.length;

    principais.forEach(v => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pill-cat' + (filtroCategorias.has(v) ? ' selecionado' : '');
      pill.textContent = v;
      pill.addEventListener('click', () => {
        if (filtroCategorias.has(v)) filtroCategorias.delete(v); else filtroCategorias.add(v);
        renderizarPillsCategoria();
        renderizarChipsFiltro('chips-categoria', categoriasDisponiveis, filtroCategorias, 'resumo-categoria');
        aplicarFiltros();
      });
      container.appendChild(pill);
    });

    if (resto > 0) {
      const maisBtn = document.createElement('button');
      maisBtn.type = 'button';
      maisBtn.className = 'pill-cat pill-mais';
      maisBtn.textContent = '+' + resto + ' Mais';
      maisBtn.addEventListener('click', () => {
        const details = document.getElementById('details-categoria');
        details.open = true;
        details.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      container.appendChild(maisBtn);
    }
  }

  function atualizarResumoFiltro(idResumo, conjunto) {
    const el = document.getElementById(idResumo);
    if (el) el.textContent = conjunto.size ? '(' + Array.from(conjunto).join(', ') + ')' : '(todas)';
  }

  function renderizarChipsFiltro(idContainer, valores, conjunto, idResumo) {
    const container = document.getElementById(idContainer);
    container.innerHTML = '';
    Array.from(valores).sort().forEach(v => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (conjunto.has(v) ? ' selecionado' : '');
      chip.textContent = v;
      chip.addEventListener('click', () => {
        if (conjunto.has(v)) conjunto.delete(v); else conjunto.add(v);
        chip.classList.toggle('selecionado');
        if (idResumo) atualizarResumoFiltro(idResumo, conjunto);
        if (idContainer === 'chips-categoria') renderizarPillsCategoria();
        aplicarFiltros();
      });
      container.appendChild(chip);
    });
    if (idResumo) atualizarResumoFiltro(idResumo, conjunto);
  }

  // Debounce: espera 250ms sem digitar antes de refiltrar, em vez de
  // recalcular e re-renderizar a grade a cada tecla (mais leve em celulares).
  const aplicarFiltrosComDebounce = debounce(aplicarFiltros, 250);
  document.getElementById('busca').addEventListener('input', aplicarFiltrosComDebounce);
  document.getElementById('preco-min').addEventListener('input', aplicarFiltrosComDebounce);
  document.getElementById('preco-max').addEventListener('input', aplicarFiltrosComDebounce);
  document.getElementById('btn-limpar').addEventListener('click', () => {
    document.getElementById('busca').value = '';
    document.getElementById('preco-min').value = '';
    document.getElementById('preco-max').value = '';
    filtroCategorias.clear(); filtroGeneros.clear(); filtroCores.clear(); apenasNovidades = false; apenasFavoritos = false; selecaoFixa = null;
    renderizarChipExtra();
    renderizarPillsCategoria();
    renderizarChipsFiltro('chips-categoria', categoriasDisponiveis, filtroCategorias, 'resumo-categoria');
    renderizarChipsFiltro('chips-genero', generosDisponiveis, filtroGeneros, 'resumo-genero');
    renderizarChipsFiltro('chips-cor', coresDisponiveis, filtroCores, 'resumo-cor');
    aplicarFiltros();
  });

  function aplicarFiltros() {
    atualizarURLComFiltros();
    const busca = document.getElementById('busca').value.trim();
    const termos = termosDaBusca(busca);
    const min = parseFloat(document.getElementById('preco-min').value);
    const max = parseFloat(document.getElementById('preco-max').value);
    const filtrosAtivos = !isNaN(min) || !isNaN(max) || apenasNovidades || apenasFavoritos || filtroCategorias.size > 0 || filtroGeneros.size > 0 || filtroCores.size > 0 || !!selecaoFixa;

    const passaFiltros = p => {
      if (selecaoFixa && !naSelecaoFixa_(p)) return false;
      if (!isNaN(min) && (ehConsulta(p) || Number(p.Preco) < min)) return false;   // "Consulte valor" não entra em filtro de preço
      if (!isNaN(max) && (ehConsulta(p) || Number(p.Preco) > max)) return false;
      if (apenasNovidades && !ehNovidade(p)) return false;
      if (apenasFavoritos && !ehFavorito(p.ID)) return false;
      if (filtroCategorias.size) { const tags = listaDeTags(p.Categoria); if (!tags.some(t => filtroCategorias.has(t))) return false; }
      if (filtroCores.size) { const tc = listaDeTags(textoPlano(p.Cores)); if (!tc.some(t => filtroCores.has(t))) return false; }
      if (filtroGeneros.size) { const tags = listaDeTags(p.Genero); if (!tags.some(t => filtroGeneros.has(t))) return false; }
      return true;
    };
    let porBusca = termos.length ? produtos.filter(p => casaBusca(p, termos)) : produtos;
    // Nada achou? Tenta sinônimos (camisa -> camiseta, blusa...) e avisa que são peças parecidas.
    buscaPorSinonimo_ = '';
    if (termos.length && !porBusca.length) {
      const grupos = termos.map(t => [t].concat(sinonimosMapa_[t] || []));
      if (grupos.some(g => g.length > 1)) {
        const alt = produtos.filter(p => { const ind = indiceDe(p); return grupos.every(g => g.some(t => casaTermo(ind, t))); });
        if (alt.length) { porBusca = alt; buscaPorSinonimo_ = busca; }
      }
    }
    listaFiltradaAtual = ordenarLista_(porBusca.filter(passaFiltros));
    // Busca nunca pode "sumir" por causa de um filtro escondido na gaveta: se com os filtros deu zero, mostra o resultado da loja toda.
    buscaIgnorouFiltros = !!(termos.length && filtrosAtivos && !listaFiltradaAtual.length && porBusca.length);
    if (buscaIgnorouFiltros) listaFiltradaAtual = ordenarLista_(porBusca);
    itensVisiveis = POR_PAGINA;
    renderEtiquetasAtivas_();
    renderizarGrid();
  }

  /** Filtros ativos sempre à vista (mesmo com a gaveta de filtros fechada), cada um removível com um toque. */
  function renderEtiquetasAtivas_() {
    const box = document.getElementById('etiquetas-ativas');
    if (!box) return;
    const itens = [];
    const busca = document.getElementById('busca').value.trim();
    const min = document.getElementById('preco-min').value, max = document.getElementById('preco-max').value;
    if (selecaoFixa) itens.push(['Peças separadas para você', () => { selecaoFixa = null; }]);
    if (apenasNovidades) itens.push(['Novidades', () => { apenasNovidades = false; renderizarChipExtra(); }]);
    if (apenasFavoritos) itens.push(['Favoritos', () => { apenasFavoritos = false; renderizarChipExtra(); }]);
    filtroCategorias.forEach(c => itens.push([c, () => { filtroCategorias.delete(c); }]));
    filtroGeneros.forEach(g => itens.push([g, () => { filtroGeneros.delete(g); }]));
    filtroCores.forEach(g => itens.push([g, () => { filtroCores.delete(g); }]));
    if (min !== '' || max !== '') {
      const rot = min !== '' && max !== '' ? 'R$ ' + min + ' a ' + max : (min !== '' ? 'a partir de R$ ' + min : 'até R$ ' + max);
      itens.push(['Preço: ' + rot, () => { document.getElementById('preco-min').value = ''; document.getElementById('preco-max').value = ''; }]);
    }
    box.textContent = '';
    box.hidden = !itens.length;
    if (!itens.length) return;
    itens.forEach(([rotulo, remover]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'etiqueta-ativa';
      b.setAttribute('aria-label', 'Tirar o filtro ' + rotulo);
      const t = document.createElement('span'); t.textContent = rotulo;
      const x = document.createElement('span'); x.className = 'x'; x.setAttribute('aria-hidden', 'true'); x.textContent = '✕';
      b.append(t, x);
      b.addEventListener('click', () => {
        remover();
        renderizarPillsCategoria();
        renderizarChipsFiltro('chips-categoria', categoriasDisponiveis, filtroCategorias, 'resumo-categoria');
        renderizarChipsFiltro('chips-genero', generosDisponiveis, filtroGeneros, 'resumo-genero');
    renderizarChipsFiltro('chips-cor', coresDisponiveis, filtroCores, 'resumo-cor');
        aplicarFiltros();
      });
      box.appendChild(b);
    });
    const l = document.createElement('button');
    l.type = 'button'; l.className = 'btn-limpar'; l.textContent = 'Limpar tudo';
    l.addEventListener('click', () => document.getElementById('btn-limpar').click());
    box.appendChild(l);
  }

  /* ---- busca tolerante: sem acento, vários termos, nome + categoria + gênero + cor + descrição, e 1 letra errada ---- */
  let buscaIgnorouFiltros = false;
  let buscaPorSinonimo_ = '';
  let sinonimosMapa_ = montarSinonimos(SINONIMOS_PADRAO);
  function ordenarLista_(lista) {
    const o = document.getElementById('ordem').value;
    // "Consulte valor" vai sempre para o fim, nos dois sentidos
    const cmpPreco_ = (a, b, dir) => { const ca = ehConsulta(a), cb = ehConsulta(b); if (ca || cb) return ca === cb ? 0 : (ca ? 1 : -1); return dir * (Number(a.Preco) - Number(b.Preco)); };
    if (o === 'menor') return lista.slice().sort((a, b) => cmpPreco_(a, b, 1));
    if (o === 'maior') return lista.slice().sort((a, b) => cmpPreco_(a, b, -1));
    if (o === 'az') return lista.slice().sort((a, b) => String(a.Nome).localeCompare(String(b.Nome), 'pt-BR'));
    return lista;                                   // "mais recentes": a ordem que o servidor mandou
  }
  document.getElementById('ordem').addEventListener('change', () => aplicarFiltros());
  const semAcentoBusca = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const indiceBusca = new Map(); // ID -> { texto, palavras } (não grava nada no produto)
  function indiceDe(p) {
    let i = indiceBusca.get(p.ID);
    if (!i) {
      const texto = semAcentoBusca([p.Nome, p.Codigo, p.Categoria, p.Genero, p.Cores, p.Descricao].join(' '));
      i = { texto, palavras: texto.split(/[^a-z0-9]+/).filter(Boolean) };
      indiceBusca.set(p.ID, i);
    }
    return i;
  }
  function termosDaBusca(txt) { return semAcentoBusca(txt).split(/\s+/).filter(Boolean); }
  function umaLetraDeDiferenca(a, b) {            // distância de edição <= 1 (troca, falta ou sobra de 1 letra)
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, erros = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++erros > 1) return false;
      if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
    return erros + (la - i) + (lb - j) <= 1;
  }
  function casaTermo(ind, t) {
    if (t.length <= 2) return ind.palavras.some(w => w.startsWith(t));
    if (ind.texto.includes(t)) return true;
    if (t.length < 4) return false;
    return ind.palavras.some(w => umaLetraDeDiferenca(t, w) || (w.length > t.length && umaLetraDeDiferenca(t, w.slice(0, t.length))));
  }
  function casaBusca(p, termos) { const ind = indiceDe(p); return termos.every(t => casaTermo(ind, t)); }

  document.getElementById('btn-carregar-mais').addEventListener('click', () => {
    itensVisiveis += POR_PAGINA;
    renderizarGrid();
  });

  /** Rolagem infinita: o botão fica de reserva; chegando perto dele (1500 px antes) já carrega mais 24. */
  let obsMais_ = null;
  function vigiarMais_() {
    const b = document.getElementById('btn-carregar-mais');
    if (!b || !('IntersectionObserver' in window)) return;
    if (!obsMais_) {
      obsMais_ = new IntersectionObserver((es) => {
        if (es.some(e => e.isIntersecting) && listaFiltradaAtual.length > itensVisiveis) { itensVisiveis += POR_PAGINA; renderizarGrid(); }
      }, { rootMargin: '1500px 0px' });
    }
    obsMais_.unobserve(b);
    if (b.style.display !== 'none') obsMais_.observe(b);
  }

  /** Faixa flutuante: aparece sempre que há filtro/busca/seleção ativa, com contagem e botão claro de limpar. */
  function atualizarBarraFiltros_() {
    const bar = document.getElementById('barra-filtros-flut');
    if (!bar) return;
    const bf = document.getElementById('badge-filtros');
    const nFiltros = (bf && !bf.hidden ? (parseInt(bf.textContent, 10) || 0) : 0);
    const q = document.getElementById('busca').value.trim();
    const ativo = nFiltros > 0 || !!q || !!selecaoFixa || apenasFavoritos || apenasNovidades;
    const nSac = getSacola().length, share = document.getElementById('linha-share-busca'); if (share) share.hidden = !(ativo || nSac > 0);
    const bsb = document.getElementById('btn-share-busca'); if (bsb) bsb.textContent = (nSac > 0 && !ativo) ? '🔗 Compartilhar seleção (' + nSac + ')' : '🔗 Compartilhar seleção';
    const bls = document.getElementById('btn-limpar-sel'); if (bls) bls.hidden = !(ativo || nSac > 0) || !!selecaoFixa || modoLink_;
    const blm = document.getElementById('btn-lote-menu'); if (blm) { blm.hidden = !(equipe_.pode && nSac > 0); if (blm.hidden) { const lm = document.getElementById('lote-menu'); if (lm) lm.hidden = true; } }
    if (!ativo) { bar.hidden = true; modoLink_ = false; return; }
    bar.classList.toggle('so-botao', modoLink_);
    if (modoLink_) { document.getElementById('barra-filtros-txt').textContent = ''; document.getElementById('barra-filtros-limpar').textContent = 'Ver os outros produtos do site'; bar.hidden = false; return; }
    const n = listaFiltradaAtual.length;
    let t = selecaoFixa ? 'Seleção' : (n + (n === 1 ? ' peça' : ' peças'));
    if (!selecaoFixa && nFiltros) t += ' · ' + nFiltros + (nFiltros === 1 ? ' filtro' : ' filtros');
    if (selecaoFixa) t = 'Seleção · ' + n + (n === 1 ? ' peça' : ' peças');
    document.getElementById('barra-filtros-txt').textContent = t;
    document.getElementById('barra-filtros-limpar').textContent = selecaoFixa ? '✕ Sair da seleção compartilhada' : 'Limpar filtros';
    bar.hidden = false;
  }
  /** Sai dos filtros do link (ou limpa os filtros comuns) e mostra o site inteiro; sacola e favoritos da pessoa ficam como estão. */
  document.getElementById('btn-share-busca').addEventListener('click', () => { const bf = document.getElementById('badge-filtros'), q = document.getElementById('busca').value.trim(); const filtrando = (bf && !bf.hidden && (parseInt(bf.textContent, 10) || 0) > 0) || q || selecaoFixa || apenasFavoritos || apenasNovidades; if (!filtrando && getSacola().length) abrirSelecao(true); else document.getElementById('btn-share-filtros').click(); });
  document.getElementById('btn-limpar-sel').addEventListener('click', () => { if (getSacola().length) { limparSacola(); atualizarSacolaHeader_(); if (window.tkSincronizarCards) window.tkSincronizarCards(); } if (selecaoFixa || document.getElementById('busca').value.trim() || apenasFavoritos || apenasNovidades) document.getElementById('btn-limpar').click(); atualizarBarraFiltros_(); });
  document.getElementById('btn-lote-menu').addEventListener('click', (e) => { const m = document.getElementById('lote-menu'); m.hidden = !m.hidden; e.currentTarget.setAttribute('aria-expanded', String(!m.hidden)); });
  document.getElementById('lote-menu').addEventListener('click', (e) => { const b = e.target.closest('[data-lote]'); if (!b) return; if (b.dataset.lote === 'btn-bulk-juntar') { document.getElementById('lote-menu').hidden = true; abrirJuntarCatalogo_(); return; }
    // v4.10 (FE-06): "Enviar para postagem" (e as demais ações em lote) exigem a MESMA sessão compartilhada.
    // Antes, o catálogo mandava direto pro admin.html e o admin pedia login de novo. Agora: sem sessão, abre o
    // login AQUI; com sessão, leva o token junto para o admin validar (nunca manda o link cru).
    const s = getSessao();
    if (!s || !s.sessao) { avisoEquipe_('Entre na sua conta para usar a edição em lote.'); const bc = document.getElementById('btn-conta-header'); if (bc) bc.click(); return; }
    document.getElementById('lote-menu').hidden = true;
    location.href = 'admin.html?lote=' + encodeURIComponent(getSacola().join(',')) + '&acao=' + b.dataset.lote + '&sessao=' + encodeURIComponent(s.sessao) + '&whatsapp=' + encodeURIComponent(s.whatsapp || '');
  });
  function verTodoSite_() {
    modoLink_ = false;
    if (selecaoFixa) { selecaoFixa = null; }
    document.getElementById('btn-limpar').click();
    aplicarFiltros();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.getElementById('barra-filtros-limpar').addEventListener('click', () => {
    verTodoSite_();
  });

  function mostrarVazio_(mensagem) {
    const vazio = document.getElementById('vazio');
    const q = document.getElementById('busca').value.trim();
    vazio.textContent = '';
    const msg = document.createElement('div'); msg.textContent = mensagem; vazio.appendChild(msg);
    const acoes = document.createElement('div'); acoes.className = 'vazio-acoes';
    const zap = document.createElement('a');
    zap.className = 'btn-zap'; zap.target = '_blank'; zap.rel = 'noopener'; zap.id = 'vazio-zap';
    zap.href = linkWhatsApp(q ? 'Olá! Procuro: ' + q + '. Vocês têm?' : 'Olá! Vim pelo catálogo e quero ajuda para escolher.');
    zap.textContent = q ? '💬 Perguntar no WhatsApp se tem “' + q + '”' : '💬 Falar com a loja no WhatsApp';
    acoes.appendChild(zap);
    const limpar = document.createElement('button');
    limpar.type = 'button'; limpar.className = 'btn-neutro'; limpar.id = 'vazio-limpar'; limpar.textContent = 'Limpar busca e filtros';
    limpar.addEventListener('click', () => document.getElementById('btn-limpar').click());
    acoes.appendChild(limpar);
    vazio.appendChild(acoes);
    vazio.style.display = 'block';
  }

  /** Faixa "peças separadas para você" (link ?sel=…): diz quantas são e avisa se alguma já saiu da loja. */
  function atualizarAvisoSelecao_() {
    const box = document.getElementById('aviso-selecao');
    if (!box) return;
    if (!selecaoFixa) { box.hidden = true; return; }
    const total = selecaoFixa.length;
    const achadas = produtos.length ? produtos.filter(naSelecaoFixa_).length : total;
    let t = '🔗 Peças separadas para você: ' + achadas + (achadas === 1 ? ' peça' : ' peças') + '.';
    if (produtos.length && achadas < total) t += ' ' + (total - achadas) + (total - achadas === 1 ? ' peça desta seleção não está mais disponível.' : ' peças desta seleção não estão mais disponíveis.');
    document.getElementById('aviso-selecao-txt').textContent = t;
    box.hidden = false;
  }
  document.getElementById('aviso-selecao-todas').addEventListener('click', () => {
    modoLink_ = false; selecaoFixa = null; aplicarFiltros();
    const m = document.querySelector('main'); if (m && m.scrollIntoView) m.scrollIntoView({ behavior: 'smooth' });
  });

  function renderizarGrid() {
    const grid = document.getElementById('grid');
    const vazio = document.getElementById('vazio');
    const contagem = document.getElementById('contagem');
    const btnMais = document.getElementById('btn-carregar-mais');
    const lista = listaFiltradaAtual;
    const qtd = lista.length + (lista.length === 1 ? ' peça' : ' peças');

    atualizarAvisoSelecao_();
    contagem.textContent = buscaIgnorouFiltros
      ? 'Nada com esses filtros — mostrando ' + qtd + ' de toda a loja'
      : (selecaoFixa && !buscaPorSinonimo_)
        ? lista.length + (lista.length === 1 ? ' peça da seleção' : ' peças da seleção')
      : buscaPorSinonimo_
        ? 'Nada com “' + buscaPorSinonimo_ + '” — mostrando ' + qtd + ' parecida' + (lista.length === 1 ? '' : 's')
        : lista.length + (lista.length === 1 ? ' peça disponível' : ' peças encontradas');
    if (!lista.length) {
      grid.innerHTML = ''; btnMais.style.display = 'none'; atualizarBarraFiltros_();
      const q = document.getElementById('busca').value.trim();
      mostrarVazio_(q
        ? 'Não achamos "' + q + '". Tente outra palavra (ex.: vestido, blusa, calça) ou o código da peça.'
        : 'Nenhum produto encontrado para estes filtros.');
      return;
    }
    vazio.style.display = 'none';

    const visiveis = lista.slice(0, itensVisiveis);
    grid.innerHTML = visiveis.map((p, pos) => {
      const avista = Number(p.Preco) * (1 - DESCONTO_AVISTA);
      const esgotado = estaEsgotado(p);
      const disp = nivelDisponibilidade(p);
      const favoritado = ehFavorito(p.ID);
      const naSacola = estaNaSacola(p.ID);
      const nFotos = 1 + String(p.Fotos_Galeria || '').split(',').map(x => x.trim()).filter(Boolean).length;
      const temVideo = !!idVideoSeguro(p.Video_URL);
      const ultimas = estoqueInformado(p) && !esgotado && Number(p.Estoque) <= 2;
      return `
        <div class="card" data-id="${escaparHtml(p.ID)}">
          <div class="img-wrap">
            <img ${atribSrc(fotoMini(p.Foto_URL, larguraMini()))} ${atribSrcSet(p.Foto_URL)}alt="${escaparHtml(p.Nome)}" ${pos === 0 ? 'fetchpriority="high" decoding="async"' : (pos < 4 ? 'decoding="async"' : 'loading="lazy" decoding="async"')}>
            ${esgotado ? '<span class="selo-card esgotado">ESGOTADO</span>' : (ehNovidade(p) ? '<span class="selo-card novidade">NOVIDADE</span>' : '')}
            ${equipe_.pode ? `<button type="button" class="x-equipe" data-x-prod="${escaparHtml(p.ID)}" title="Arquivar esta peça (equipe)" aria-label="Arquivar a peça: ${escaparHtml(p.Nome)}">✕</button>` : ''}
            <button type="button" class="btn-favorito-card" data-fav-id="${escaparHtml(p.ID)}" title="Favoritar" aria-label="${favoritado ? 'Remover dos favoritos' : 'Favoritar'}: ${escaparHtml(p.Nome)}" aria-pressed="${favoritado}">${favoritado ? '❤️' : '🤍'}</button>
            ${nFotos > 1 || temVideo ? `<span class="mini-selos" aria-hidden="true">${nFotos > 1 ? `<span class="mini-selo">📷 ${nFotos}</span>` : ''}${temVideo ? '<span class="mini-selo">▶ vídeo</span>' : ''}</span>` : ''}
            ${ultimas ? '<span class="selo-ultimas" aria-hidden="true">' + (Number(p.Estoque) === 1 ? 'Última!' : 'Últimas ' + Number(p.Estoque)) + '</span>' : ''}
          </div>
          <div class="card-info">
            ${p.Codigo ? `<div class="codigo">${escaparHtml(p.Codigo)}</div>` : ''}
            <div class="nome"><button type="button" class="abrir-peca" aria-label="Ver detalhes: ${escaparHtml(p.Nome)}">${escaparHtml(p.Nome)}</button></div>
            <div class="preco">${ehConsulta(p) ? '<strong class="consulta">' + TEXTO_CONSULTA + '</strong>' : formatarReal(p.Preco) + ' <span>' + formatarReal(avista) + '</span>'}</div>
            <div class="tags">${escaparHtml(p.Categoria)}</div>
            ${disp && !esgotado ? `<div class="disponibilidade ${disp.classe}">${disp.texto}</div>` : ''}
            ${esgotado ? '' : `<div class="acoes-card">
              <button type="button" class="ac-sacola" data-sac-id="${escaparHtml(p.ID)}" aria-pressed="${naSacola}" aria-label="${escaparHtml(rotuloSacola_(p.Nome, naSacola))}">${conteudoSacola_(naSacola)}</button>
              <button type="button" class="ac-pedir" data-pedir-id="${escaparHtml(p.ID)}" aria-label="${escaparHtml(p.Nome)}: consultar no WhatsApp"><span aria-hidden="true">💬</span> Consultar</button>
            </div>`}
          </div>
        </div>
      `;
    }).join('');

    btnMais.style.display = lista.length > itensVisiveis ? 'block' : 'none';
    vigiarMais_(); atualizarBarraFiltros_();
    grid.querySelectorAll('.card').forEach(el => el.addEventListener('click', (e) => {
      if (e.target.closest('.btn-favorito-card, .acoes-card, .x-equipe')) return;
      abrirDetalhe(el.dataset.id);
    }));
    grid.querySelectorAll('.x-equipe').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); arquivarProdutoX_(b.dataset.xProd); }));
    grid.querySelectorAll('.btn-favorito-card').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.favId;
      const agoraFavorito = toggleFavorito(id);
      btn.textContent = agoraFavorito ? '❤️' : '🤍';
      btn.setAttribute('aria-pressed', String(agoraFavorito));
      btn.setAttribute('aria-label', (agoraFavorito ? 'Remover dos favoritos' : 'Favoritar') + ': ' + (btn.closest('.card').querySelector('.abrir-peca') || {}).textContent);
      atualizarBadges();
      if (apenasFavoritos) aplicarFiltros();
    }));
    grid.querySelectorAll('.ac-sacola').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = produtos.find(x => String(x.ID) === String(btn.dataset.sacId));
      if (p) alternarSacola_(p);
    }));
    grid.querySelectorAll('.ac-pedir').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = produtos.find(x => String(x.ID) === String(btn.dataset.pedirId));
      if (p) abrirWhatsApp(p);
    }));
  }

  function atualizarBadges() {
    const qtdFav = (produtos && produtos.length ? getFavoritos().filter(id => produtos.some(p => String(p.ID) === String(id))) : getFavoritos()).length;
    const badgeFav = document.getElementById('badge-favoritos');
    badgeFav.textContent = qtdFav;
    badgeFav.style.display = qtdFav > 0 ? 'flex' : 'none';

    const qtdSacola = getSacola().length; try { atualizarBarraFiltros_(); } catch (e) {}
    const badgeSacola = document.getElementById('badge-sacola');
    badgeSacola.textContent = qtdSacola;
    badgeSacola.style.display = qtdSacola > 0 ? 'flex' : 'none';
  }

  /** Põe ou tira a peça da sacola (cartão e folha usam a mesma função). Devolve true se agora está na sacola. */
  function alternarSacola_(p, foto) {
    let agora;
    if (estaNaSacola(p.ID)) { removerDaSacola(p.ID); agora = false; }
    else { adicionarNaSacola(p.ID, foto); agora = true; if (window.TKMeta) TKMeta.evento('AddToCart', dadosPixel_(p), novoEventId_('ac', p.ID)); }
    atualizarBadges(); sincronizarBotoesCard_(p.ID);
    return agora;
  }
  /** Mantém o ❤️ e o botão Sacola do cartão iguais ao estado real (a pessoa pode ter mudado dentro da folha). */
  /** Chamada pela janela da seleção (pedido.js) depois de esvaziar/remover: refaz os botões “Na seleção” de todos os cartões. */
  /** v3.10 — nome acessível x texto visível do botão da sacola.
   *  O ícone fica FORA do nome acessível (span aria-hidden) e o nome acessível SEMPRE contém o texto
   *  visível. Antes o nome fixo era "minha seleção" num botão que mostrava "Selecionar": o leitor de
   *  tela dizia uma coisa e o botão mostrava outra (achado "label-content-name-mismatch" da auditoria). */
  function conteudoSacola_(na) { return na ? '<span aria-hidden="true">✓</span> Na seleção' : '<span aria-hidden="true">🛍️</span> Selecionar'; }
  function rotuloSacola_(nome, na) { const estado = na ? 'na seleção' : 'selecionar'; return nome ? (nome + ': ' + estado) : estado; }
  function pintarBotaoSacola_(btn, nome, na) {
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(!!na));
    btn.setAttribute('aria-label', rotuloSacola_(nome, na));
    btn.innerHTML = conteudoSacola_(!!na);
  }

  window.tkSincronizarCards = function () {
    document.querySelectorAll('.card[data-id]').forEach((card) => {
      const id = card.getAttribute('data-id'), sac = card.querySelector('.ac-sacola');
      if (sac) pintarBotaoSacola_(sac, (card.querySelector('.abrir-peca') || {}).textContent || '', estaNaSacola(id));
    });
    atualizarBadges();
  };
  function sincronizarBotoesCard_(id) {
    const card = document.querySelector('.card[data-id="' + String(id).replace(/"/g, '') + '"]');
    if (!card) return;
    const fav = card.querySelector('.btn-favorito-card');
    if (fav) { const f = ehFavorito(id); fav.textContent = f ? '❤️' : '🤍'; fav.setAttribute('aria-pressed', String(f)); }
    const sac = card.querySelector('.ac-sacola');
    if (sac) pintarBotaoSacola_(sac, (card.querySelector('.abrir-peca') || {}).textContent || '', estaNaSacola(id));
    if (apenasFavoritos && !ehFavorito(id)) aplicarFiltros();
  }
  function dadosPixel_(p) {
    const d = { content_ids: [p.Codigo || String(p.ID)], content_name: p.Nome, content_type: 'product', currency: 'BRL' };
    if (!ehConsulta(p)) d.value = Number(p.Preco) * (1 - DESCONTO_AVISTA);   // sem preço = sem valor para a Meta
    return d;
  }

  // Foto/vídeo que está aparecendo na janela da peça (0 = capa). Os botões "Pedir" e "Compartilhar" da janela usam isso:
  // o link leva a foto escolhida (?f=<n>) e a miniatura no WhatsApp é essa foto, não a capa.
  let slideAtualModal_ = 0;

  function abrirWhatsApp(p, foto) {
    // Link do produto NO SITE (linkProduto, em common.js): ?c=<código>. Antes apontava para o Apps Script
    // (endpoint de compartilhamento), que o WhatsApp não consegue ler -- aparecia o endereço do script e nada de miniatura.
    // `foto` = número (de 1) da foto/vídeo escolhido na galeria; só a janela da peça passa isso (no cartão da lista vale a capa).
    const link = linkProduto(p, foto);
    const avista = Number(p.Preco) * (1 - DESCONTO_AVISTA);
    const codigo = p.Codigo ? ('\nCódigo: ' + p.Codigo) : '';
    const texto = `Olá! Quero garantir este produto:\n*${p.Nome}*${codigo}\n${ehConsulta(p) ? 'Gostaria de saber o valor e a disponibilidade.' : formatarReal(avista) + ' à vista'}\n${link}`;
    const eidContato = novoEventId_('ct', p.ID);
    registrarEvento(p.ID, p.Codigo, 'whatsapp', eidContato);
    if (window.TKMeta) TKMeta.evento('Contact', dadosPixel_(p), eidContato);
    window.open(linkWhatsApp(texto), '_blank');   // sempre o WhatsApp da loja
  }

  /** Baixa a foto (ou o vídeo da Cloudinary) que está na tela para mandar como ARQUIVO. Devolve null se não der a tempo ou não for possível
   *  (ex.: vídeo do Drive, que o navegador não consegue baixar) -- aí vai só o link, que já mostra a miniatura certa. O tempo é curto de
   *  propósito: o navegador só deixa abrir a janela de compartilhar até ~5 s depois do toque. */
  async function arquivoDoSlide_(slide, p, ms) {
    let url, nome, tipoPadrao;
    const cod = String(p.Codigo || p.ID).replace(/[^\w-]/g, '');
    if (!slide || slide.tipo === 'foto') { url = (slide && slide.url) || p.Foto_URL; nome = 'tenkiter-' + cod + '.jpg'; tipoPadrao = 'image/jpeg'; }
    else if (slide.video && slide.video.tipo === 'cloudinary') { url = slide.video.url; nome = 'tenkiter-' + cod + '.mp4'; tipoPadrao = 'video/mp4'; }
    else return null;
    if (!url) return null;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => { if (ctl) ctl.abort(); }, ms);
    try {
      const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (!r.ok) return null;
      const blob = await r.blob();
      const tipo = String(blob.type || '').split(';')[0] || tipoPadrao; // "video/mp4;codecs=avc1" -> "video/mp4" (o canShare não aceita o complemento)
      return new File([blob], nome, { type: tipo });
    } catch (e) { return null; }
    finally { clearTimeout(t); }
  }

  /** "Compartilhar foto e link": manda a foto (ou o vídeo) QUE ESTÁ NA TELA e o link que já abre nessa foto. `slide` = { tipo, url | video }, `foto` = número (de 1). */
  async function compartilharComFoto(p, slide, foto) {
    const link = linkProduto(p, foto);
    const avista = Number(p.Preco) * (1 - DESCONTO_AVISTA);
    const ehVideo = !!(slide && slide.tipo === 'video');
    const texto = `${p.Nome} — ${ehConsulta(p) ? TEXTO_CONSULTA : formatarReal(avista) + ' à vista'}${ehVideo ? ' (vídeo)' : ''}\n${link}\n\nTENKiTER Modas — WhatsApp: ${linkWhatsApp()}`;
    const btn = document.getElementById('btn-anexar-foto');
    const rotulo = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = ehVideo ? '⏳ Preparando o vídeo…' : '⏳ Preparando…'; }
    let arquivo = null;
    try { arquivo = await arquivoDoSlide_(slide, p, 3500); }
    finally { if (btn) { btn.disabled = false; btn.textContent = rotulo; } }

    if (navigator.share) {
      try {
        if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
          await navigator.share({ files: [arquivo], text: texto });
        } else {
          await navigator.share({ text: texto });
        }
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // a pessoa fechou a janela de compartilhar: não abre mais nada
      }
    }
    // Sem compartilhar nativo (computador) ou falhou: abre o WhatsApp para ESCOLHER o contato (sem número fixo -- é para mandar a alguém).
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
  }

  // ===================== Overlays x botão/gesto "voltar" do Android =====================
  // Sem isso, abrir um overlay (detalhe do produto, sacola) não empilha nada no histórico,
  // então o primeiro "voltar" do Android sai direto do site. Abrir empilha uma entrada no
  // histórico (só na transição fechado->aberto, nunca de novo se já estava aberto); fechar
  // pelo botão/backdrop consome essa entrada (history.back()), e o popstate (que dispara tanto
  // pelo "voltar" do Android quanto por esse history.back()) é quem realmente fecha na tela --
  // assim os dois caminhos (botão "Fechar" e botão físico/gesto de voltar) sempre terminam no
  // mesmo lugar: o catálogo, sem sair da Tenkiter.
  // v3.3: pilha de janelas. Cada janela aberta empilha UMA entrada no histórico (com o nível n); o "voltar" fecha só a de cima
  // (ex.: peça aberta de dentro dos favoritos volta para os favoritos, e o próximo "voltar" volta para a lista).
  function abrirComHistorico_(idOverlay, url) {
    const el = document.getElementById(idOverlay);
    if (!el || el.classList.contains('aberto')) return;
    el.classList.add('aberto');
    TKCamadas.empilhar(idOverlay, () => { el.classList.remove('aberto'); if (idOverlay === 'overlay') restaurarMeta_(); }, url);
  }
  function fecharComHistorico_(idOverlay) {
    const el = document.getElementById(idOverlay);
    if (!el || !el.classList.contains('aberto')) return;
    if (TKCamadas.aberta(idOverlay)) TKCamadas.desempilhar(idOverlay);
    else el.classList.remove('aberto');
  }

  // Título, descrição e dados estruturados da peça aberta (buscadores e abas do navegador); volta ao normal ao fechar.
  const META_PADRAO_ = { titulo: document.title, descricao: (document.querySelector('meta[name="description"]') || {}).content || '' };
  function definirMetaPeca_(p, avista) {
    const cod = p.Codigo ? ' [' + p.Codigo + ']' : '';
    document.title = p.Nome + cod + ' — ' + (ehConsulta(p) ? TEXTO_CONSULTA : formatarReal(avista) + ' à vista') + ' | TENKiTER Modas';
    const d = document.querySelector('meta[name="description"]');
    if (d) d.content = (p.Descricao ? String(p.Descricao).slice(0, 110) + ' ' : '') + (ehConsulta(p) ? 'Consulte o valor pelo WhatsApp na TENKiTER Modas, Crateús-CE.' : 'De ' + formatarReal(p.Preco) + ' por ' + formatarReal(avista) + ' à vista na TENKiTER Modas, Crateús-CE.');
    let ld = document.getElementById('ld-produto');
    if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'ld-produto'; document.head.appendChild(ld); }
    const imgs = [p.Foto_URL].concat(String(p.Fotos_Galeria || '').split(',').map(x => x.trim()).filter(Boolean)).filter(Boolean);
    const dados = {
      '@context': 'https://schema.org', '@type': 'Product', name: p.Nome, image: imgs, description: p.Descricao || p.Nome,
      sku: p.Codigo || String(p.ID), brand: { '@type': 'Brand', name: 'TENKiTER Modas' }, url: linkProduto(p),
      offers: { '@type': 'Offer', url: linkProduto(p), priceCurrency: 'BRL', price: Number(avista).toFixed(2), availability: estaEsgotado(p) ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: 'TENKiTER Modas' } }
    };
    if (ehConsulta(p)) delete dados.offers;   // sem preço não há oferta para os buscadores
    ld.textContent = JSON.stringify(dados);
  }
  function restaurarMeta_() {
    document.title = META_PADRAO_.titulo;
    const d = document.querySelector('meta[name="description"]'); if (d) d.content = META_PADRAO_.descricao;
    const ld = document.getElementById('ld-produto'); if (ld) ld.remove();
  }

  /** slideInicial (opcional) = posição (de 0) da foto/vídeo que já deve aparecer: vem do endereço ?f=<n> (link compartilhado numa foto específica). */
  function abrirDetalhe(id, slideInicial, silencioso) {
    const p = produtos.find(x => String(x.ID) === String(id));
    if (!p) return;
    slideAtualModal_ = 0;
    const eidVista = novoEventId_('vc', p.ID);
    if (!silencioso) registrarEvento(p.ID, p.Codigo, 'visualizacao', eidVista);   // reabrir depois de arquivar uma foto não conta como outra visualização
    const avista = Number(p.Preco) * (1 - DESCONTO_AVISTA);
    const esgotado = estaEsgotado(p);
    const disp = nivelDisponibilidade(p);
    const favoritado = ehFavorito(p.ID);
    const naSacola = estaNaSacola(p.ID);
    definirMetaPeca_(p, avista);
    if (window.TKMeta && !silencioso) TKMeta.evento('ViewContent', dadosPixel_(p), eidVista);

    const fotosGaleria = [p.Foto_URL].concat(String(p.Fotos_Galeria || '').split(',').map(s=>s.trim()).filter(Boolean));
    const idVid = idVideoSeguro(p.Video_URL);
    const totalSlides = fotosGaleria.length + (idVid ? 1 : 0);

    document.getElementById('modal-conteudo').innerHTML = `
      <div class="sheet-handle" aria-hidden="true"></div>
      <button type="button" class="btn-x-modal" id="btn-fechar-modal" aria-label="Fechar">✕</button>
      <div class="carrossel-wrap">
        <div class="slide-area" id="slide-area"><img id="foto-principal-modal" alt="${escaparHtml(p.Nome)}"></div>
        ${equipe_.pode ? `<a class="btn-editar-peca" id="btn-editar-peca" href="admin.html?editar=${encodeURIComponent(p.ID)}">✎ Editar produto</a>` : ''}
        ${equipe_.pode ? `<button type="button" class="x-equipe" id="x-slide" title="Tirar esta foto/vídeo da peça (equipe)" aria-label="Tirar esta foto ou vídeo da peça">✕</button>` : ''}
        ${totalSlides > 1 ? `<button type="button" class="seta-slide esq" id="seta-esq" aria-label="Anterior">‹</button><button type="button" class="seta-slide dir" id="seta-dir" aria-label="Próxima">›</button><span class="contador-slide" id="contador-slide">1 / ${totalSlides}</span>` : ''}
        ${esgotado ? '<span class="selo-card esgotado" style="top:12px;left:12px;font-size:0.7rem;">ESGOTADO</span>' : (ehNovidade(p) ? '<span class="selo-card novidade" style="top:12px;left:12px;font-size:0.7rem;">NOVIDADE</span>' : '')}
      </div>
      ${totalSlides > 1 ? `
        <div class="thumbs-galeria">
          ${fotosGaleria.map((f, idx) => { const im = `<img ${atribSrc(fotoMini(f, 120))} class="thumb-item ${idx===0?'ativa':''}" data-idx="${idx}" alt="" width="50" height="62" loading="lazy">`; return equipe_.pode ? `<span class="thumb-wrap">${im}<button type="button" class="x-equipe mini" data-x-idx="${idx}" aria-label="Tirar a foto ${idx+1} da peça">✕</button></span>` : im; }).join('')}
          ${idVid ? (equipe_.pode ? `<span class="thumb-wrap"><div class="thumb-item thumb-video" data-idx="${fotosGaleria.length}" role="button" aria-label="Ver vídeo">▶</div><button type="button" class="x-equipe mini" data-x-idx="${fotosGaleria.length}" aria-label="Tirar o vídeo da peça">✕</button></span>` : `<div class="thumb-item thumb-video" data-idx="${fotosGaleria.length}" role="button" aria-label="Ver vídeo">▶</div>`) : ''}
        </div>
      ` : ''}
      <div class="modal-conteudo">
        ${p.Codigo ? `<div class="codigo">${escaparHtml(p.Codigo)}</div>` : ''}
        <div class="nome">${escaparHtml(p.Nome)}</div>
        <div class="preco-linha">
          ${ehConsulta(p) ? '<span class="consulta">' + TEXTO_CONSULTA + '</span>' : '<span class="cheio">' + formatarReal(p.Preco) + '</span>\n          <span class="avista">' + formatarReal(avista) + ' à vista</span>'}
        </div>
        <div class="tags">${escaparHtml(p.Categoria)} · ${escaparHtml(p.Genero)}</div>
        ${p.Tamanhos ? `<div class="extra"><strong>Tamanhos:</strong> ${escaparHtml(textoPlano(p.Tamanhos))}</div>` : ''}
        ${p.Cores ? `<div class="extra"><strong>Cores:</strong> ${escaparHtml(textoPlano(p.Cores))}</div>` : ''}
        ${p.Descricao ? `<div class="desc">${escaparHtml(p.Descricao)}</div>` : ''}
        ${disp ? `<div class="disponibilidade ${disp.classe}" style="margin-top:10px;font-size:0.8rem;">${disp.texto}</div>` : ''}
      </div>
      <div class="barra-compra">
        <div class="linha-secundaria">
        <button type="button" id="btn-favorito-modal" aria-pressed="${favoritado}">${favoritado ? '❤️ Nos favoritos' : '🤍 Favoritar'}</button>
        ${esgotado ? '' : '<button type="button" id="btn-anexar-foto">📎 Compartilhar foto e link</button>'}
        </div>
        <div class="bc-linha">
        ${esgotado
          ? '<span class="bc-aviso">Indisponível no momento</span><button type="button" class="bc-pedir" id="btn-perguntar">💬 Perguntar se volta</button>'
          : `<button type="button" class="bc-sacola" id="btn-sacola-modal" aria-pressed="${naSacola}" aria-label="${escaparHtml(rotuloSacola_(p.Nome, naSacola))}">${conteudoSacola_(naSacola)}</button>
             <button type="button" class="bc-pedir" id="btn-quero">💬 CONSULTAR NO WHATSAPP</button>`}
        </div>
      </div>
    `;
    // O endereço da foto principal entra por aqui (e não escrito dentro do <img> do texto acima): com a política de segurança da página + service worker, o Chrome chegava a pedir o texto "${...}" como se fosse um endereço de foto (erro 404 à toa).
    const slideValido = Number.isInteger(slideInicial) && slideInicial > 0 && slideInicial < totalSlides;
    if (!slideValido) document.getElementById('foto-principal-modal').src = p.Foto_URL; // com ?f=<n> a foto certa entra logo abaixo (sem piscar a capa antes)

    const urlAbertura = new URL(window.location);
    // endereço curto e igual ao do link compartilhado (?c=TK-0008&f=3); peça sem código cai no ?id= antigo
    urlAbertura.searchParams.delete('id'); urlAbertura.searchParams.delete('c'); urlAbertura.searchParams.delete('f');
    if (p.Codigo) urlAbertura.searchParams.set('c', p.Codigo); else urlAbertura.searchParams.set('id', p.ID);
    if (slideValido) urlAbertura.searchParams.set('f', String(slideInicial + 1));
    abrirComHistorico_('overlay', urlAbertura);
    habilitarArrastarParaFechar(document.getElementById('modal-conteudo'), fecharDetalhe);
    document.getElementById('btn-fechar-modal').addEventListener('click', fecharDetalhe);
    // favoritar/sacola mudam só o botão (antes a folha era redesenhada: voltava à 1ª foto, ao topo, e contava outra visualização)
    const btnFav = document.getElementById('btn-favorito-modal');
    btnFav.addEventListener('click', () => {
      const agora = toggleFavorito(p.ID);
      btnFav.textContent = agora ? '❤️ Nos favoritos' : '🤍 Favoritar';
      btnFav.setAttribute('aria-pressed', String(agora));
      atualizarBadges(); sincronizarBotoesCard_(p.ID);
    });

    if (!esgotado) {
      // "Pedir" e "Compartilhar" levam a foto/vídeo que está na tela (slides/atual são definidos mais abaixo; só são lidos no toque)
      document.getElementById('btn-quero').addEventListener('click', () => abrirWhatsApp(p, slideAtualModal_ + 1));
      document.getElementById('btn-anexar-foto').addEventListener('click', () => compartilharComFoto(p, slides[slideAtualModal_], slideAtualModal_ + 1));
      const btnSac = document.getElementById('btn-sacola-modal');
      btnSac.addEventListener('click', () => {
        const agora = alternarSacola_(p, slideAtualModal_ + 1); // a sacola guarda a foto que a pessoa está vendo
        pintarBotaoSacola_(btnSac, p.Nome, agora);
      });
    } else {
      document.getElementById('btn-perguntar').addEventListener('click', () => {
        registrarEvento(p.ID, p.Codigo, 'whatsapp');
        window.open(linkWhatsApp('Olá! A peça ' + p.Nome + (p.Codigo ? ' (' + p.Codigo + ')' : '') + ' está esgotada no catálogo. Vai chegar mais?\n' + linkProduto(p, slideAtualModal_ + 1)), '_blank');
      });
    }

    // galeria: setas, deslizar o dedo, miniaturas e teclado; o vídeo é o último slide (só carrega quando chega nele)
    const slides = fotosGaleria.map(u => ({ tipo: 'foto', url: u })).concat(idVid ? [{ tipo: 'video', video: idVid }] : []);
    const area = document.getElementById('slide-area');
    const thumbs = document.querySelectorAll('.thumb-item');
    let atual = 0;
    const xs = document.getElementById('x-slide'); if (xs) xs.addEventListener('click', () => arquivarMidiaX_(p, slides[atual], atual));
    document.querySelectorAll('.thumb-wrap .x-equipe').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); const k = Number(b.dataset.xIdx); arquivarMidiaX_(p, slides[k], k); }));
    function mostrarSlide(i) {
      atual = (i + slides.length) % slides.length;
      slideAtualModal_ = atual;
      // o endereço acompanha a foto que está na tela (?c=TK-0010&f=3): copiar o endereço do navegador também leva a essa foto
      try {
        const u = new URL(window.location.href);
        if (atual > 0) u.searchParams.set('f', String(atual + 1)); else u.searchParams.delete('f');
        if (u.href !== window.location.href) window.history.replaceState(window.history.state, '', u);
      } catch (e) {}
      const s = slides[atual];
      area.innerHTML = '';
      if (s.tipo === 'foto') {
        const im = document.createElement('img'); im.id = 'foto-principal-modal'; im.alt = p.Nome; im.src = s.url;
        area.appendChild(im);
      } else if (s.video.tipo === 'cloudinary') {
        // Sem controles, em loop, com som -- o play() roda dentro do clique/toque/seta que troca
        // de slide, e isso conta como gesto do usuário, então o navegador libera autoplay COM som.
        // Se mesmo assim algum navegador bloquear o som, cai pro mudo (ao menos o vídeo roda) e
        // mostra um toque rápido pra ligar o som, já que não tem barra de controle por cima.
        const vid = document.createElement('video');
        vid.src = s.video.url;
        vid.loop = true; vid.playsInline = true;
        vid.style.width = '100%'; vid.style.height = '100%'; vid.style.objectFit = 'contain';
        area.appendChild(vid);
        // Toque no vídeo pausa; toque de novo continua -- sem ícone nem nada aparecendo por cima.
        // Um swipe (troca de slide) não dispara isso: o navegador só sintetiza o "click" depois
        // de um toque parado, não depois de um arrasto.
        vid.style.cursor = 'pointer';
        vid.addEventListener('click', () => { if (vid.paused) vid.play().catch(() => {}); else vid.pause(); });
        const tocarComSom = () => {
          vid.muted = false;
          const p = vid.play();
          if (p && p.catch) {
            p.catch(() => {
              vid.muted = true;
              vid.play().catch(() => {});
              const btnSom = document.createElement('button');
              btnSom.type = 'button'; btnSom.className = 'btn-ligar-som'; btnSom.textContent = '🔇 Toque para ouvir';
              btnSom.addEventListener('click', (ev) => {
                ev.stopPropagation();
                vid.muted = false; vid.play().catch(() => {});
                btnSom.remove();
              });
              area.appendChild(btnSom);
            });
          }
        };
        tocarComSom();
      } else {
        const fr = document.createElement('iframe');
        fr.src = 'https://drive.google.com/file/d/' + s.video.id + '/preview';
        fr.allow = 'autoplay; fullscreen'; fr.allowFullscreen = true; fr.title = 'Vídeo da peça';
        area.appendChild(fr);
      }
      const c = document.getElementById('contador-slide'); if (c) c.textContent = (atual + 1) + ' / ' + slides.length;
      thumbs.forEach((t, k) => t.classList.toggle('ativa', k === atual));
      const ativa = thumbs[atual]; if (ativa && ativa.scrollIntoView) ativa.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    if (slides.length > 1) {
      document.getElementById('seta-esq').addEventListener('click', () => mostrarSlide(atual - 1));
      document.getElementById('seta-dir').addEventListener('click', () => mostrarSlide(atual + 1));
      thumbs.forEach(t => t.addEventListener('click', () => mostrarSlide(parseInt(t.dataset.idx, 10) || 0)));
      let x0 = null;
      area.addEventListener('touchstart', (ev) => { x0 = ev.touches[0].clientX; }, { passive: true });
      area.addEventListener('touchend', (ev) => {
        if (x0 === null) return;
        const dx = ev.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 50) mostrarSlide(atual + (dx < 0 ? 1 : -1));
      });
      window.__navSlide = (d) => mostrarSlide(atual + d);
    } else { window.__navSlide = null; }
    if (slideValido) mostrarSlide(slideInicial); // veio de um link de uma foto específica (?f=<n>)
  }

  // Reconhece tanto vídeo antigo (Drive, tocado num <iframe>) quanto vídeo novo (Cloudinary,
  // tocado num <video> nativo). Devolve null se não houver vídeo ou o formato for desconhecido.
  function idVideoSeguro(u) {
    const texto = String(u || '');
    const mDrive = /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\/preview$/.exec(texto);
    if (mDrive) return { tipo: 'drive', id: mDrive[1] };
    if (ehVideoDireto(texto)) return { tipo: 'cloudinary', url: texto };   // Cloudinary (antigo) ou R2 (novo): os dois tocam num <video>
    return null;
  }
  document.addEventListener('keydown', (ev) => {
    if (!window.__navSlide || !document.getElementById('overlay').classList.contains('aberto')) return;
    if (ev.key === 'ArrowLeft') window.__navSlide(-1); else if (ev.key === 'ArrowRight') window.__navSlide(1);
  });

  function fecharDetalhe() {
    fecharComHistorico_('overlay');
  }

  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') fecharDetalhe(); });

  /* ===================== Busca por voz ===================== */

  (function configurarBuscaPorVoz() {
    const btnVoz = document.getElementById('btn-voz');
    const ReconhecimentoVoz = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!ReconhecimentoVoz) { btnVoz.style.display = 'none'; return; }

    const reconhecimento = new ReconhecimentoVoz();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.interimResults = false;
    reconhecimento.maxAlternatives = 1;

    reconhecimento.addEventListener('result', (e) => {
      const texto = e.results[0][0].transcript;
      const busca = document.getElementById('busca');
      busca.value = texto;
      busca.dispatchEvent(new Event('input'));
    });
    reconhecimento.addEventListener('end', () => btnVoz.classList.remove('ouvindo'));
    reconhecimento.addEventListener('error', () => btnVoz.classList.remove('ouvindo'));

    btnVoz.addEventListener('click', () => {
      btnVoz.classList.add('ouvindo');
      try { reconhecimento.start(); } catch (e) { btnVoz.classList.remove('ouvindo'); }
    });
  })();

  function abrirProdutoDaURL() {
    const params = new URLSearchParams(window.location.search);
    let id = params.get('id');
    // Link curto por código da peça: tenkitermodas.com.br/?c=TK-0008 (mais curto que ?id=...)
    const cod = params.get('c');
    if (!id && cod) {
      const achado = produtos.find(x => String(x.Codigo || '').toLowerCase() === String(cod).trim().toLowerCase());
      if (achado) id = achado.ID;
    }
    // ?f=<n>: link compartilhado numa foto/vídeo específico (1 = capa; o vídeo é o último). Número inválido = capa.
    const f = parseInt(params.get('f'), 10);
    if (id) abrirDetalhe(id, f >= 2 ? f - 1 : 0);
  }

  /** Atalhos por endereço: ?abrir=sacola (atalho do app) e ?pedido=<código> (acompanhar pedido). Roda uma vez, na abertura. */
  function abrirJanelasDaURL_() {
    const params = new URLSearchParams(window.location.search);
    const abrirSac = params.get('abrir') === 'sacola';
    const temPedido = params.has('pedido');
    if (!abrirSac && !temPedido) return;
    const limpa = new URL(window.location);
    ['abrir', 'pedido', 'origem'].forEach(k => limpa.searchParams.delete(k));
    window.history.replaceState({}, '', limpa);   // a janela empilha a própria entrada; voltar leva ao catálogo limpo
    if (abrirSac) abrirSacola();
    if (temPedido) abrirRastreio(params.get('pedido') || '', '');
  }

  /* Notificações push: tudo em push.js (v3.4) — sininho #btn-push-header, convite, conta, pedidos, ajuda. */

  /* ===================== v3.7: Equipe do site (catalogo_cadastrar) arquiva pelo X ===================== */
  async function definirEquipe_(usuario) {
    let pode = false;
    try { const v = await versaoServidor(); pode = !!(v && v.midiaRapida && temPermissao(usuario, 'catalogo_cadastrar')); } catch (e) { pode = false; }
    try { localStorage.setItem('tk_equipe_dica_v1', pode ? '1' : '0'); } catch (e) {}   // só um sim/não (sem nome nem telefone): deixa o ✕ aparecer já na 1ª tela da próxima vez
    if (pode === equipe_.pode) return;
    equipe_.pode = pode;
    document.body.classList.toggle('equipe-x', pode);
    try { atualizarBarraFiltros_(); } catch (e) {}
    if (produtos && produtos.length) renderizarGrid();
  }
  function pedirEquipe_(corpo) {
    const s = getSessao();
    if (!s) return Promise.resolve({ ok: false, erro: 'Entre na sua conta para fazer isso.' });
    return apiPost(Object.assign({ whatsapp: s.whatsapp, sessao: s.sessao }, corpo));
  }

  /* v6.2: Juntar produtos repetidos SEM sair do catálogo (usa a ação juntarProdutos do backend 3.7+) */
  function abrirJuntarCatalogo_() {
    const sel = getSacola().map(String).map(id => produtos.find(p => String(p.ID) === id)).filter(Boolean);
    if (sel.length < 2) { avisoEquipe_('Marque pelo menos 2 peças para juntar.'); return; }
    const lista = document.getElementById('juntar-lista'); lista.innerHTML = '';
    sel.forEach((p, i) => {
      const fotos = 1 + listaGaleria_(p).length;
      const lb = document.createElement('label'); lb.className = 'juntar-item';
      lb.innerHTML = '<input type="radio" name="juntar-destino" value="' + escaparHtml(String(p.ID)) + '"' + (i === 0 ? ' checked' : '') + '><img ' + atribSrc(fotoMini(p.Foto_URL, 120)) + ' alt=""><span><b>' + escaparHtml(p.Nome) + '</b><br>' + escaparHtml(p.Codigo || '') + ' · ' + fotos + (fotos === 1 ? ' foto' : ' fotos') + '</span>';
      lista.appendChild(lb);
    });
    document.getElementById('juntar-erro').hidden = true; document.getElementById('juntar-prog').hidden = true;
    document.getElementById('juntar-ok').disabled = false; document.getElementById('juntar-ok').textContent = 'Juntar';
    abrirComHistorico_('overlay-juntar');
  }
  document.getElementById('juntar-fechar').addEventListener('click', () => { if (!document.getElementById('juntar-ok').disabled) fecharComHistorico_('overlay-juntar'); });
  document.getElementById('juntar-ok').addEventListener('click', async () => {
    const btn = document.getElementById('juntar-ok'), er = document.getElementById('juntar-erro'), prog = document.getElementById('juntar-prog');
    const marcado = document.querySelector('input[name="juntar-destino"]:checked'); if (!marcado) return;
    const sel = getSacola().map(String).map(id => produtos.find(p => String(p.ID) === id)).filter(Boolean);
    const destino = sel.find(p => String(p.ID) === marcado.value), outros = sel.filter(p => String(p.ID) !== marcado.value);
    if (!destino || !outros.length) return;
    if (!confirm('Juntar ' + outros.length + (outros.length === 1 ? ' peça' : ' peças') + ' em "' + destino.Nome + '" (' + (destino.Codigo || '') + ')?\n\nAs outras ficam arquivadas e as fotos delas passam para esta.')) return;
    btn.disabled = true; btn.textContent = 'Juntando…'; er.hidden = true; prog.hidden = false;
    document.querySelectorAll('#juntar-lista input').forEach(i => i.disabled = true);
    try {
      const r = await pedirEquipe_({ action: 'juntarProdutos', destinoId: destino.ID, origemIds: outros.map(p => p.ID) });
      if (r && r.ok) {
        btn.textContent = '✔ Pronto!'; prog.hidden = true;
        limparSacola(); atualizarSacolaHeader_(); if (window.tkSincronizarCards) window.tkSincronizarCards();
        try { const resp = await buscarListaPublica(); if (Array.isArray(resp.produtos)) { const rec = resp.produtos.reverse(); salvarCatalogoCache(rec); aplicarProdutosRecebidos(rec); } } catch (e) {}
        btn.disabled = false; fecharComHistorico_('overlay-juntar'); atualizarBarraFiltros_();
        avisoEquipe_('✔ Pronto! "' + destino.Nome + '" ficou com ' + (r.fotosNoDestino != null ? r.fotosNoDestino + ' foto(s)' : 'as fotos juntas') + '. ' + outros.length + ' arquivada(s).');
      } else { prog.hidden = true; btn.disabled = false; btn.textContent = 'Juntar'; document.querySelectorAll('#juntar-lista input').forEach(i => i.disabled = false); er.textContent = erroEquipe_(r); er.hidden = false; }
    } catch (e) { prog.hidden = true; btn.disabled = false; btn.textContent = 'Juntar'; document.querySelectorAll('#juntar-lista input').forEach(i => i.disabled = false); er.textContent = 'Sem conexão. Tente de novo.'; er.hidden = false; }
  });
  function erroEquipe_(r) { return (r && r.erro) || (r && r.semPermissao ? 'Sua conta não tem esse acesso.' : 'Não consegui agora. Tente de novo.'); }
  let toastEquipeTimer_ = null;
  function avisoEquipe_(texto, desfazer) {
    const t = document.getElementById('toast-equipe'), tx = document.getElementById('toast-equipe-txt'), b = document.getElementById('toast-equipe-btn');
    tx.textContent = texto; b.hidden = !desfazer; b.onclick = desfazer ? async () => { b.disabled = true; try { await desfazer(); } finally { b.disabled = false; t.classList.remove('visivel'); } } : null;
    t.classList.add('visivel'); clearTimeout(toastEquipeTimer_); toastEquipeTimer_ = setTimeout(() => t.classList.remove('visivel'), desfazer ? 12000 : 6000);
  }
  function listaGaleria_(p) { return String(p.Fotos_Galeria || '').split(',').map(x => x.trim()).filter(Boolean); }
  async function arquivarProdutoX_(id) {
    const p = produtos.find(x => String(x.ID) === String(id)); if (!p) return;
    if (!confirm('Arquivar a peça "' + p.Nome + '"' + (p.Codigo ? ' (' + p.Codigo + ')' : '') + '?\n\nEla some do catálogo. Fica registrado e um Encarregado pode reativar.')) return;
    const r = await pedirEquipe_({ action: 'arquivarRapido', id: p.ID });
    if (!r || !r.ok) { avisoEquipe_(erroEquipe_(r)); return; }
    produtos = produtos.filter(x => String(x.ID) !== String(id));
    try { salvarCatalogoCache(produtos); } catch (e) {}
    fecharDetalhe && document.getElementById('overlay').classList.contains('aberto') && fecharDetalhe();
    aplicarFiltros(); avisoEquipe_('Peça arquivada. Para voltar, um Encarregado reativa em Gestão → Arquivadas.');
  }
  async function arquivarMidiaX_(p, slide, idx) {
    if (!slide) return;
    const ehVideo = slide.tipo === 'video';
    const url = ehVideo ? String(p.Video_URL || '').trim() : String(slide.url || '').trim();
    // v4.18 (foto 09): se for a única foto e não houver vídeo, o ✕ arquiva a PEÇA inteira (mesmo caminho do ✕ da peça)
    if (!ehVideo && listaGaleria_(p).length === 0) { if (!(p.Video_URL || '').trim()) { return arquivarProdutoX_(p.ID); } }
    if (!confirm((ehVideo ? 'Tirar o VÍDEO' : 'Tirar esta FOTO') + ' da peça "' + p.Nome + '"?\n\nO arquivo não é apagado: fica guardado e dá para desfazer.')) return;
    const r = await pedirEquipe_({ action: 'arquivarMidia', id: p.ID, tipo: ehVideo ? 'video' : 'foto', url: url });
    if (!r || !r.ok) { avisoEquipe_(erroEquipe_(r)); return; }
    if (ehVideo) p.Video_URL = '';
    else {
      let gal = listaGaleria_(p);
      if (url === String(p.Foto_URL || '').trim()) { p.Foto_URL = r.novaCapa || gal[0]; gal = gal.slice(1); } else gal = gal.filter(x => x !== url);
      p.Fotos_Galeria = gal.join(',');
    }
    try { salvarCatalogoCache(produtos); } catch (e) {}
    aplicarFiltros(); abrirDetalhe(p.ID, Math.max(0, idx - 1), true);
    avisoEquipe_((ehVideo ? 'Vídeo' : 'Foto') + ' tirada da peça.', async () => {
      const d = await pedirEquipe_({ action: 'restaurarMidia', registro: r.registro });
      if (!d || !d.ok) { avisoEquipe_(erroEquipe_(d)); return; }
      try { const resp = await buscarListaPublica(); if (Array.isArray(resp.produtos)) { const rec = resp.produtos.reverse(); salvarCatalogoCache(rec); aplicarProdutosRecebidos(rec); } } catch (e) {}
      if (document.getElementById('overlay').classList.contains('aberto')) abrirDetalhe(p.ID, 0, true);
      avisoEquipe_('Pronto, voltou para a peça.');
    });
  }

  /* ===================== v2: conta de cliente (favoritos e sacola salvos) ===================== */
  try { (function contaCliente() {
    const btn = document.getElementById('btn-conta-header');
    const ov = document.getElementById('modal-conta');
    function abrirConta_() { if (!ov.classList.contains('visivel')) { ov.classList.add('visivel'); TKCamadas.empilhar('modal-conta', () => ov.classList.remove('visivel')); } }
    function fecharConta_() { if (ov.classList.contains('visivel')) { if (TKCamadas.aberta('modal-conta')) TKCamadas.desempilhar('modal-conta'); else ov.classList.remove('visivel'); } }
    const corpo = document.getElementById('conta-corpo');
    let usuario = null;
    let aba = 'entrar';

    function el(tag, props, filhos) {
      const e = document.createElement(tag);
      Object.keys(props || {}).forEach(k => { if (k === 'text') e.textContent = props[k]; else e[k] = props[k]; });
      (filhos || []).forEach(f => e.appendChild(f));
      return e;
    }

    function atualizarBotao() {
      window.__usuarioCliente = usuario;   // pedido.js pré-preenche nome e WhatsApp com isto
      btn.textContent = usuario ? (String(usuario.name || '?').trim().charAt(0).toUpperCase() || '👤') : '👤';
      btn.title = usuario ? 'Minha conta (' + usuario.name + ')' : 'Entrar ou criar conta';
      btn.classList.toggle('ativado', !!usuario);
    }

    async function sincronizar() {
      const r = await sincronizarContaCliente();
      if (r && r.ok) { atualizarBadges(); if (produtos.length) aplicarFiltros(); }
      return r;
    }

    async function depoisDeEntrar(u) {
      usuario = u; definirEquipe_(usuario);
      atualizarBotao();
      fecharConta_();
      await sincronizar();
    }

    let identDigitado_ = '';
    function desenhar(erro) {
      corpo.textContent = '';
      if (usuario) {
        corpo.appendChild(el('h2', { id: 'conta-titulo', text: 'Olá, ' + usuario.name + '!' }));
        corpo.appendChild(el('p', { text: 'Seus favoritos e sua sacola ficam salvos na sua conta e aparecem em qualquer aparelho em que você entrar.' }));
        // CPF: da equipe (Estagiário em diante) é obrigatório = faixa vermelha aqui mesmo; cliente comum só é convidado (opcional)
        if (window.TKConta && TKConta.precisaCpf(usuario)) {
          TKConta.faixaCpf(corpo, { usuario, salvar: (cpf) => chamarConta({ action: 'salvar_identificadores', whatsapp: getSessao() && getSessao().whatsapp, sessao: getSessao() && getSessao().sessao, cpf }), aoSalvar: (r) => { if (r.usuario) { usuario = r.usuario; desenhar(); } } });
        } else if (window.TKConta && !usuario.cpf && !usuario.email) {
          const cx = el('div', { className: 'conta-opc' });
          cx.appendChild(el('p', { className: 'conta-opc-txt', text: 'Quer entrar também com e-mail ou CPF e poder recuperar a senha sozinho(a)? Preencha abaixo. É opcional — pode pular.' }));
          const inEmail = el('input', { type: 'email', id: 'conta-email-opc', placeholder: 'E-mail (opcional)', autocomplete: 'email' });
          const inCpf = el('input', { type: 'text', id: 'conta-cpf-opc', placeholder: 'CPF (opcional)' }); TKConta.ligarCpf(inCpf);
          const msgOpc = el('div', { className: 'conta-erro', id: 'conta-opc-msg' });
          const salvarOpc = el('button', { type: 'button', className: 'conta-secundario', text: 'Salvar' });
          salvarOpc.addEventListener('click', async () => {
            if (!inEmail.value.trim() && !inCpf.value.trim()) { msgOpc.textContent = 'Digite o e-mail ou o CPF (ou deixe como está).'; return; }
            if (inCpf.value && !TKConta.cpfValido(inCpf.value)) { msgOpc.textContent = 'CPF inválido. Confira os 11 números.'; return; }
            if (inEmail.value && !TKConta.emailValido(inEmail.value)) { msgOpc.textContent = 'E-mail inválido.'; return; }
            salvarOpc.disabled = true;
            const s = getSessao() || {};
            const r = await chamarConta({ action: 'salvar_identificadores', whatsapp: s.whatsapp, sessao: s.sessao, cpf: inCpf.value, email: inEmail.value });
            salvarOpc.disabled = false;
            if (r && r.ok) { if (r.usuario) usuario = r.usuario; desenhar(); return; }
            msgOpc.textContent = (r && r.erro) || 'Não consegui salvar agora.';
          });
          [cx.firstChild, inEmail, inCpf, msgOpc, salvarOpc].forEach((n) => cx.appendChild(n));
          corpo.appendChild(cx);
        }
        if (window.TKFotoCliente) corpo.appendChild(TKFotoCliente.bloco());
        const sair = el('button', { type: 'button', className: 'conta-secundario', id: 'conta-sair', text: 'Sair da conta' });
        sair.addEventListener('click', () => { limparSessao(); usuario = null; definirEquipe_(null); atualizarBotao(); fecharConta_(); });
        corpo.appendChild(sair);
        return;
      }
      corpo.appendChild(el('h2', { id: 'conta-titulo', text: 'Minha conta' }));
      corpo.appendChild(el('p', { text: 'Entre para guardar seus favoritos e sua sacola e vê-los em qualquer aparelho. Você continua podendo navegar sem conta.' }));
      const abas = el('div', { className: 'conta-abas' });
      [['entrar', 'Entrar'], ['criar', 'Criar conta']].forEach(([id, rotulo]) => {
        const b = el('button', { type: 'button', text: rotulo, className: aba === id ? 'ativa' : '' });
        b.addEventListener('click', () => { aba = id; desenhar(); });
        abas.appendChild(b);
      });
      corpo.appendChild(abas);
      const nome = el('input', { type: 'text', id: 'conta-nome', placeholder: 'Seu nome', autocomplete: 'name' });
      const whats = el('input', aba === 'criar' ? { type: 'tel', id: 'conta-whats', placeholder: 'WhatsApp com DDD', autocomplete: 'username', inputMode: 'tel' } : { type: 'text', id: 'conta-whats', placeholder: 'E-mail, WhatsApp ou CPF', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off' });
      whats.value = identDigitado_;
      whats.addEventListener('input', () => { identDigitado_ = whats.value; });
      const emailNovo = el('input', { type: 'email', id: 'conta-email', placeholder: 'E-mail (opcional)', autocomplete: 'email' });
      const cpfNovo = el('input', { type: 'text', id: 'conta-cpf', placeholder: 'CPF (opcional)' });
      if (window.TKConta) TKConta.ligarCpf(cpfNovo);
      const senha = el('input', { type: 'password', id: 'conta-senha', placeholder: aba === 'criar' ? 'Crie uma senha (mín. 4)' : 'Senha', autocomplete: aba === 'criar' ? 'new-password' : 'current-password' });
      if (aba === 'criar') corpo.appendChild(nome);
      corpo.appendChild(whats); corpo.appendChild(senha);
      if (aba === 'criar') {
        corpo.appendChild(emailNovo); corpo.appendChild(cpfNovo);
        corpo.appendChild(el('p', { className: 'conta-opc-txt', text: 'E-mail e CPF são opcionais. Se quiser informar, você poderá entrar também por eles e recuperar a senha sozinho(a) se esquecer.' }));
      }
      corpo.appendChild(el('div', { className: 'conta-erro', id: 'conta-erro', text: erro || '' }));
      const ok = el('button', { type: 'button', className: 'conta-principal', id: 'conta-ok', text: aba === 'criar' ? 'Criar conta' : 'Entrar' });
      async function enviar() {
        const erroEl = document.getElementById('conta-erro');
        if (!whats.value || !senha.value || (aba === 'criar' && !nome.value.trim())) { erroEl.textContent = 'Preencha todos os campos.'; return; }
        if (aba === 'criar' && senha.value.length < 4) { erroEl.textContent = 'A senha precisa ter pelo menos 4 caracteres.'; return; }
        if (aba === 'criar' && cpfNovo.value && window.TKConta && !TKConta.cpfValido(cpfNovo.value)) { erroEl.textContent = 'CPF inválido. Confira os 11 números (ou deixe em branco).'; return; }
        ok.disabled = true; const rotulo = ok.textContent; ok.textContent = 'Aguarde...';
        const r = aba === 'criar' ? await registrarClienteApi(nome.value.trim(), whats.value, senha.value, { cpf: cpfNovo.value, email: emailNovo.value }) : await entrarComSenha(whats.value, senha.value);
        ok.disabled = false; ok.textContent = rotulo;
        if (r && r.contaExiste && window.TKConta) {
          erroEl.textContent = '';
          TKConta.avisoContaExiste(corpo, { aoEntrar: () => { aba = 'entrar'; desenhar(); }, aoRecuperar: () => abrirRecuperar_(whats.value) });
          return;
        }
        if (!r || !r.ok || !r.usuario) { erroEl.textContent = (r && r.erro) || 'Não foi possível agora. Tente de novo.'; return; }
        depoisDeEntrar(r.usuario);
      }
      ok.addEventListener('click', enviar);
      senha.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
      corpo.appendChild(ok);
      if (aba === 'entrar') {
        const esq = el('button', { type: 'button', className: 'conta-secundario', id: 'conta-esqueci', text: 'Esqueci a senha' });
        esq.addEventListener('click', () => abrirRecuperar_(whats.value));
        corpo.appendChild(esq);
      }
    }
    function abrirRecuperar_(ident) {
      if (!window.TKConta) return;
      TKConta.abrirRecuperar({ identificador: ident, chamar: chamarConta, aoEntrar: (r) => { salvarSessao(r.usuario.whatsapp, r.sessao); depoisDeEntrar(r.usuario); } });
    }

    btn.addEventListener('click', () => { desenhar(); abrirConta_(); });
    document.getElementById('conta-fechar').addEventListener('click', () => fecharConta_());
    ov.addEventListener('click', (e) => { if (e.target === ov) fecharConta_(); });

    // só aparece se o backend já tem contas; catálogo antigo segue exatamente como era
    (async () => {
      const v = await versaoServidor();
      if (!v || !v.acessos) return;
      btn.style.display = '';
      const u = await conferirSessao();
      if (u && !u.semRede) { usuario = u; definirEquipe_(usuario); atualizarBotao(); sincronizar(); }
      else if (!u) definirEquipe_(null);     // sessão acabou: tira o ✕ que foi mostrado antes da conferência
    })();
  })(); } catch (erroConta) { console.warn('Conta de cliente indisponível:', erroConta); }

  // ✕ da equipe aparece na hora (palpite do último acesso deste aparelho); a conferência de verdade vem do servidor e corrige se preciso.
  try { if (getSessao() && localStorage.getItem('tk_equipe_dica_v1') === '1') { equipe_.pode = true; document.body.classList.add('equipe-x'); } } catch (e) {}
  ligarPedidoNaPagina();
  carregarCatalogo();
  abrirJanelasDaURL_();
  // Configuração pública do painel (Pixel da Meta, sinônimos de busca). Backend antigo => nada muda.
  (async () => {
    try {
      const cfg = await configPublica();
      if (Array.isArray(cfg.sinonimos) && cfg.sinonimos.length) { sinonimosMapa_ = montarSinonimos(SINONIMOS_PADRAO.concat(cfg.sinonimos)); if (produtos.length) aplicarFiltros(); }
      if (cfg.pixelId && window.TKMeta) TKMeta.iniciar(cfg.pixelId);
    } catch (e) {}
  })();

/* v3.0 — filtros recolhíveis (só a busca fica visível ao rolar) */
(function () {
  const f = document.getElementById('filtros');
  const busca = document.getElementById('busca');
  const btn = document.getElementById('btn-filtros-toggle');
  const badge = document.getElementById('badge-filtros');
  if (!f || !busca || !btn) return;
  let ultimoY = window.scrollY, yAbertura = 0;
  const CELULAR = window.matchMedia('(max-width: 600px)').matches;   // no celular as peças vêm primeiro: filtros ficam na gaveta (botão Filtros)

  function contarAtivos() {
    let n = f.querySelectorAll('.filtros-extras .chip.selecionado').length;
    if (document.getElementById('preco-min').value) n++;
    if (document.getElementById('preco-max').value) n++;
    return n;
  }
  function atualizarBadge() {
    const n = contarAtivos();
    badge.hidden = !n; badge.textContent = n;
  }
  function abrir() { yAbertura = window.scrollY; f.classList.add('aberto'); btn.setAttribute('aria-expanded', 'true'); }
  // abre sozinho ao procurar e fecha ao sair (só se foi aberto por esta busca)
  let autoAberto = false;
  busca.addEventListener('focus', () => { if (!f.classList.contains('aberto')) { abrir(); autoAberto = true; } });
  f.addEventListener('focusout', () => { setTimeout(() => { if (autoAberto && !f.contains(document.activeElement)) { fechar(); autoAberto = false; } }, 250); });
  btn.addEventListener('click', () => { autoAberto = false; }, true);
  function fechar() { f.classList.remove('aberto'); btn.setAttribute('aria-expanded', 'false'); }
  function compactar(sim) {
    if (sim === f.classList.contains('compacto')) return;
    f.classList.toggle('compacto', sim);
    if (sim) { fechar(); atualizarBadge(); } else { f.classList.remove('aberto'); btn.setAttribute('aria-expanded', 'true'); }
  }

  window.addEventListener('scroll', () => {
    const y = window.scrollY, descendo = y > ultimoY;
    ultimoY = y;
    if (f.classList.contains('compacto')) {
      if (y < 60 && !CELULAR) compactar(false);                       // computador: voltou ao topo, filtros completos de novo
      else if (f.classList.contains('aberto') && Math.abs(y - yAbertura) > 140 && document.activeElement !== busca) fechar();
    } else if (y > 230 && descendo) {
      compactar(true);                                                // rolou para ver as fotos: recolhe
    }
  }, { passive: true });

  if (CELULAR) compactar(true);
  busca.addEventListener('focus', () => { if (f.classList.contains('compacto')) abrir(); });
  btn.addEventListener('click', () => { f.classList.contains('aberto') ? fechar() : abrir(); });
  // tocar fora da barra fecha a gaveta
  document.addEventListener('pointerdown', (ev) => {
    if (f.classList.contains('compacto') && f.classList.contains('aberto') && !ev.target.closest('#filtros')) fechar();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fechar(); });
  // Enter na busca: fecha o teclado e mostra os resultados
  busca.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { busca.blur(); if (f.classList.contains('compacto')) fechar(); } });
  f.addEventListener('click', () => setTimeout(atualizarBadge, 0));
  f.addEventListener('input', atualizarBadge);
})();

/* ===================== v4.27/v4.28: vida da seleção — "Libera a seleção" / "Segura minha seleção" ao sair da loja ===================== */
(function () {
  let guardaAtiva = false, sairDepois = false, limparUrl_ = false, destino_ = '', modoVolta_ = false;
  const CH_SAIU = 'tk_sel_saiu_v1', CH_DECIDIU = 'tk_sel_decidiu_v1';
  const TXT_PADRAO = { titulo: 'Antes de sair…', segura: '\u{1F9E1} Segura minha seleção, volto já já', libera: 'Libera a seleção', fica: 'Continuar vendo a loja' };
  const temSelecao_ = () => getSacola().length > 0 || !!selecaoFixa;
  const nSelecao_ = () => getSacola().length || (selecaoFixa ? selecaoFixa.length : 0);
  const voltaMs_ = () => (typeof window.TK_SEL_VOLTA_MS === 'number' ? window.TK_SEL_VOLTA_MS : 45000);
  function atualizarTudo_() { try { atualizarSacolaHeader_(); if (window.tkSincronizarCards) window.tkSincronizarCards(); atualizarBarraFiltros_(); } catch (e) {} }
  const deixar_ = () => setTimeout(() => { try { history.back(); } catch (e) {} }, 0);
  const irPara_ = (url) => { try { location.assign(url); } catch (e) { location.href = url; } };

  // A entrada-guarda precisa ser criada DENTRO de um toque/clique (o Chrome ignora, no "voltar", entradas criadas sem interação).
  // Só arma com a tela livre (nenhuma janela aberta) e quando há seleção; o "voltar" então cai nela e mostra a placa em vez de sair.
  function armarGuarda_() {
    if (guardaAtiva || !temSelecao_() || TKCamadas.total() > 0) return;
    guardaAtiva = TKCamadas.empilhar('guarda-sair-sel', () => {
      guardaAtiva = false;
      if (!temSelecao_()) { deixar_(); return; }   // a pessoa já limpou: o "voltar" segue o caminho normal
      setTimeout(mostrarPlaca_, 0);                // fora do popstate (a pilha ainda está sendo esvaziada)
    });
  }
  document.addEventListener('click', (e) => { if (sairDepois || (e.target && e.target.closest && e.target.closest('#overlay-sair-sel'))) return; setTimeout(armarGuarda_, 0); }, true);   // cliques da própria placa não rearmam (corriam com o fechamento)

  // v4.28: tocar num link que LEVA PARA OUTRA PÁGINA (barra de baixo, rodapé, "cadastrar peça"…) também mostra a placa — antes só o botão "voltar" do aparelho mostrava.
  // Não intercepta: link da mesma página (âncora, ?pedido=, ?c=), que abre em outra aba (target=_blank: a loja continua aberta aqui), download, e/mailto/tel.
  const semIndex_ = (p) => String(p || '/').replace(/index\.html$/, '');
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !temSelecao_() || a.closest('#overlay-sair-sel')) return;
    if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    let u; try { u = new URL(a.href, location.href); } catch (er) { return; }
    if (!/^https?:$/.test(u.protocol)) return;
    if (u.origin === location.origin && semIndex_(u.pathname) === semIndex_(location.pathname)) return;
    e.preventDefault(); e.stopPropagation();
    mostrarPlaca_({ destino: u.href });
  }, true);

  function textos_(t) {
    document.getElementById('sair-sel-titulo').textContent = t.titulo;
    document.getElementById('sair-sel-segura').textContent = t.segura;
    document.getElementById('sair-sel-libera').textContent = t.libera;
    document.getElementById('sair-sel-fica').textContent = t.fica;
  }
  function mostrarPlaca_(op) {
    op = (op && typeof op === 'object' && !op.type) ? op : {};   // chamado por setTimeout/evento sem opções
    if (!temSelecao_() || TKCamadas.aberta('overlay-sair-sel')) return false;
    destino_ = op.destino || ''; modoVolta_ = !!op.volta;
    const n = nSelecao_(), doLink = !getSacola().length && !!selecaoFixa;
    const pecas = n === 1 ? '1 peça' : n + ' peças';
    if (modoVolta_) {
      textos_({ titulo: 'Que bom que você voltou! \u{1F9E1}', segura: '\u{1F9E1} Segura minha seleção por 3 horas', libera: 'Libera a seleção', fica: 'Continuar vendo a loja' });
      document.getElementById('sair-sel-txt').textContent = (doLink ? 'As ' + pecas + ' que separamos para você' : 'Suas ' + pecas + ' separadas') + ' continuam aqui. Quer que eu segure por mais tempo?';
    } else {
      textos_(TXT_PADRAO);
      document.getElementById('sair-sel-txt').textContent = (doLink ? 'Separamos ' + pecas + ' para você.' : 'Você separou ' + pecas + '.') + ' Quer que eu segure essa seleção?';
    }
    abrirComHistorico_('overlay-sair-sel');
    setTimeout(() => { const b = document.getElementById('sair-sel-segura'); if (b) b.focus(); }, 60);
    return true;
  }
  function fecharPlaca_(sair) { sairDepois = !!sair; fecharComHistorico_('overlay-sair-sel'); }
  function decidiu_() { try { localStorage.setItem(CH_DECIDIU, String(Date.now())); localStorage.removeItem(CH_SAIU); } catch (e) {} }

  document.getElementById('sair-sel-segura').addEventListener('click', () => {
    tkSelSegurar_(); decidiu_();
    avisoEquipe_('Guardei sua seleção por 3 horas. ' + (modoVolta_ ? 'Pode continuar! ' : 'Até já! ') + '\u{1F9E1}');
    fecharPlaca_(!modoVolta_);
  });
  document.getElementById('sair-sel-libera').addEventListener('click', () => {
    if (getSacola().length) limparSacola();
    if (selecaoFixa || modoLink_) { limparUrl_ = true; document.getElementById('btn-limpar').click(); modoLink_ = false; }
    decidiu_(); atualizarTudo_();
    fecharPlaca_(!modoVolta_);
  });
  document.getElementById('sair-sel-fica').addEventListener('click', () => fecharPlaca_(false));
  document.getElementById('overlay-sair-sel').addEventListener('click', (e) => { if (e.target.id === 'overlay-sair-sel') fecharPlaca_(false); });

  document.addEventListener('tk:camada-fechada', (e) => {
    if (!e.detail || e.detail.chave !== 'overlay-sair-sel') return;
    if (limparUrl_) { limparUrl_ = false; try { history.replaceState(history.state, '', location.pathname); } catch (er) {} }
    const dest = destino_, sair = sairDepois;
    destino_ = ''; sairDepois = false; modoVolta_ = false; textos_(TXT_PADRAO);
    if (sair) { if (dest) irPara_(dest); else deixar_(); }
  });

  // v4.28 — MINIMIZAR / trocar de app: o navegador não deixa mostrar nada na hora (a página é congelada), então anotamos que a pessoa saiu e,
  // quando ela VOLTAR depois de um tempinho (45 s) com seleção ainda guardada, a placa aparece ("Que bom que você voltou… segura?").
  // Não anota se ela acabou de escolher Segura/Libera (já decidiu) nem quando não há seleção.
  function marcarSaida_() {
    try {
      if (!temSelecao_()) return;
      const d = parseInt(localStorage.getItem(CH_DECIDIU) || '0', 10);
      if (Date.now() - d < 15000) return;
      localStorage.setItem(CH_SAIU, String(Date.now()));
    } catch (e) {}
  }
  function verVolta_() {
    try {
      const t = parseInt(localStorage.getItem(CH_SAIU) || '0', 10);
      if (!t) return;
      localStorage.removeItem(CH_SAIU);
      if (Date.now() - t < voltaMs_() || !temSelecao_()) return;
      if (TKCamadas.total() > (guardaAtiva ? 1 : 0)) return;   // há outra janela aberta (ex.: pedido em andamento): não atrapalha
      mostrarPlaca_({ volta: true });
    } catch (e) {}
  }
  // Voltou para a aba/app: a seleção pode ter vencido enquanto estava fora; se ainda existe, mostra a placa de "volta".
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { marcarSaida_(); return; }
    if (tkSelExpirar_()) atualizarTudo_();
    verVolta_();
  });
  window.addEventListener('pagehide', marcarSaida_);
  // Abriu de novo e a seleção estava guardada: avisa e volta a valer o prazo normal.
  if (tkSelSeguraAte_() && getSacola().length) {
    const n = getSacola().length;
    tkSelSoltarSegura_();
    try { localStorage.removeItem(CH_SAIU); } catch (e) {}
    setTimeout(() => avisoEquipe_('Sua seleção estava guardada: ' + (n === 1 ? '1 peça' : n + ' peças') + ' \u{1F9E1}'), 1500);
  } else {
    // O navegador pode ter fechado a aba em segundo plano (Android): ao reabrir, vale a mesma regra do "voltar".
    let saiuAntes_ = false; try { saiuAntes_ = !!localStorage.getItem(CH_SAIU); } catch (e) {}
    if (saiuAntes_) setTimeout(() => { if (document.visibilityState === 'visible') verVolta_(); }, 1800);
  }
  window.tkSelTeste_ = { mostrarPlaca: mostrarPlaca_, armar: armarGuarda_, verVolta: verVolta_, marcarSaida: marcarSaida_ };
})();

/* ===================== v4.27: sugestões enquanto digita + sinônimos ("não achei igual, mas tem…") ===================== */
(function () {
  const busca = document.getElementById('busca'), lista = document.getElementById('sugestoes-busca');
  if (!busca || !lista) return;
  const PARAR = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'sem', 'em', 'e', 'a', 'o', 'um', 'uma', 'por', 'no', 'na']);
  let vocabRef_ = null, vocab_ = [], itens_ = [], ativo_ = -1, tReal_ = 0;

  function vocabulario_() {
    if (vocabRef_ === produtos && vocab_.length) return vocab_;
    const mapa = new Map();
    const guardar = (rotulo, peso) => {
      const k = semAcentoBusca(rotulo).trim();
      if (k.length < 3 || PARAR.has(k)) return;
      const e = mapa.get(k);
      if (e) e.peso += peso; else mapa.set(k, { k, rotulo: String(rotulo).trim().toLowerCase(), peso });
    };
    produtos.forEach((p) => {
      String(p.Nome || '').split(/[^A-Za-zÀ-ÿ]+/).forEach((w) => guardar(w, 2));
      [p.Categoria, p.Genero, textoPlano(p.Cores)].forEach((campo) => listaDeTags(campo).forEach((t) => {
        guardar(t, 3);                                           // a categoria inteira ("vestido longo")
        String(t).split(/[^A-Za-zÀ-ÿ]+/).forEach((w) => guardar(w, 1));
      }));
    });
    vocabRef_ = produtos; vocab_ = Array.from(mapa.values());
    return vocab_;
  }
  const contar_ = (frase) => { const t = termosDaBusca(frase); return t.length ? produtos.filter((p) => casaBusca(p, t)).length : 0; };
  const trocar_ = (termos, i, novo) => termos.map((t, j) => (j === i ? novo : t)).join(' ');
  function parecidos_(t) {                                      // sinônimos nos dois sentidos (camisa→camiseta e camiseta→camisa)
    const ida = sinonimosMapa_[t] || [], volta = Object.keys(sinonimosMapa_).filter((k) => (sinonimosMapa_[k] || []).includes(t));
    return Array.from(new Set(ida.concat(volta)));
  }

  /** Devolve { aviso, itens:[{texto, qtd, tipo}] } para o que a pessoa digitou até agora. */
  function sugerir_(txt) {
    const termos = termosDaBusca(txt);
    if (!termos.length || semAcentoBusca(txt).trim().length < 2 || !produtos.length) return { aviso: '', itens: [] };
    const itens = [], vistos = new Set();
    const por = (texto, tipo) => {
      const k = semAcentoBusca(texto).trim();
      if (!k || vistos.has(k) || k === semAcentoBusca(txt).trim()) return;
      const qtd = contar_(texto); if (!qtd) return;
      vistos.add(k); itens.push({ texto, qtd, tipo });
    };
    // 1) completar a última palavra com o que existe na loja
    const ult = termos[termos.length - 1], antes = termos.slice(0, -1).join(' '), tudo = semAcentoBusca(txt).trim();
    vocabulario_().filter((e) => (e.k.startsWith(ult) && e.k !== ult) || (e.k.includes(' ') && e.k.startsWith(tudo) && e.k !== tudo))
      .sort((a, b) => b.peso - a.peso || a.k.length - b.k.length)
      .slice(0, 14).forEach((e) => { if (itens.length < 6) por(e.k.includes(' ') && e.k.startsWith(tudo) ? e.rotulo : (antes ? antes + ' ' : '') + e.rotulo, 'completa'); });
    // 2) nada IGUAL (a grade até acha parecido por tolerância, mas a pessoa merece saber): aponta sinônimos que TÊM peças e "você quis dizer"
    const existe_ = (t) => produtos.some((p) => indiceDe(p).texto.includes(t));
    const faltam = termos.map((t, i) => ({ t, i })).filter((x) => x.t.length >= 3 && !existe_(x.t));
    let aviso = '';
    if (faltam.length) {
      aviso = 'Não achei “' + txt.trim() + '” igual.';
      const extras = [];
      faltam.forEach(({ t, i }) => parecidos_(t).forEach((alt) => { const f = trocar_(termos, i, alt), q = contar_(f); if (q) extras.push({ texto: f, qtd: q, tipo: 'sinonimo' }); }));
      faltam.forEach(({ t, i }) => { if (t.length >= 4) vocabulario_().forEach((e) => { if (e.k !== t && !e.k.includes(' ') && umaLetraDeDiferenca(t, e.k)) { const f = trocar_(termos, i, e.rotulo), q = contar_(f); if (q) extras.push({ texto: f, qtd: q, tipo: 'quis' }); } }); });
      extras.sort((a, b) => (a.tipo === b.tipo ? b.qtd - a.qtd : (a.tipo === 'quis' ? -1 : 1))).forEach((x) => { const k = semAcentoBusca(x.texto).trim(); if (itens.length < 8 && !vistos.has(k)) { vistos.add(k); itens.push(x); } });
      if (!itens.length) aviso += ' Tente outra palavra ou chame a gente no WhatsApp.';
      else aviso += ' Mas temos:';
    }
    return { aviso, itens };
  }

  function fechar_() { lista.hidden = true; lista.textContent = ''; itens_ = []; ativo_ = -1; busca.setAttribute('aria-expanded', 'false'); busca.removeAttribute('aria-activedescendant'); }
  function pintar_() {
    const r = sugerir_(busca.value);
    if (!r.aviso && !r.itens.length) { fechar_(); return; }
    lista.textContent = ''; itens_ = r.itens; ativo_ = -1;
    if (r.aviso) { const a = document.createElement('div'); a.className = 'sug-aviso'; a.setAttribute('role', 'presentation'); a.textContent = r.aviso; lista.appendChild(a); }
    r.itens.forEach((it, i) => {
      const d = document.createElement('div'); d.id = 'sug-' + i; d.className = 'sug-item'; d.setAttribute('role', 'option'); d.setAttribute('aria-selected', 'false'); d.dataset.i = String(i);
      const tx = document.createElement('span'); tx.className = 'sug-txt';
      tx.textContent = (it.tipo === 'sinonimo' ? 'Parecido: ' : it.tipo === 'quis' ? 'Você quis dizer: ' : '') + it.texto;
      const q = document.createElement('span'); q.className = 'sug-qtd'; q.textContent = it.qtd === 1 ? '1 peça' : it.qtd + ' peças';
      d.appendChild(tx); d.appendChild(q); lista.appendChild(d);
    });
    lista.hidden = false; busca.setAttribute('aria-expanded', 'true');
  }
  function escolher_(i) {
    const it = itens_[i]; if (!it) return;
    busca.value = it.texto; fechar_();
    aplicarFiltros();
    busca.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));   // mesmo caminho do Enter: fecha o teclado e a gaveta
    busca.blur();
  }
  function marcar_(i) {
    const els = lista.querySelectorAll('.sug-item'); if (!els.length) return;
    ativo_ = (i + els.length) % els.length;
    els.forEach((e, j) => { e.classList.toggle('ativo', j === ativo_); e.setAttribute('aria-selected', String(j === ativo_)); });
    busca.setAttribute('aria-activedescendant', 'sug-' + ativo_);
    els[ativo_].scrollIntoView({ block: 'nearest' });
  }
  busca.setAttribute('role', 'combobox'); busca.setAttribute('aria-autocomplete', 'list'); busca.setAttribute('aria-controls', 'sugestoes-busca'); busca.setAttribute('aria-expanded', 'false'); busca.setAttribute('autocomplete', 'off');
  busca.addEventListener('input', () => { clearTimeout(tReal_); tReal_ = setTimeout(pintar_, 120); });
  busca.addEventListener('focus', () => { if (busca.value.trim().length >= 2) pintar_(); });
  busca.addEventListener('blur', () => { setTimeout(fechar_, 160); });
  busca.addEventListener('keydown', (ev) => {
    if (lista.hidden) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); marcar_(ativo_ + 1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); marcar_(ativo_ < 0 ? -1 : ativo_ - 1); }
    else if (ev.key === 'Escape') { fechar_(); }
    else if (ev.key === 'Enter' && ativo_ >= 0 && ev.isTrusted !== false) { ev.preventDefault(); ev.stopImmediatePropagation(); escolher_(ativo_); }
  }, true);
  lista.addEventListener('pointerdown', (ev) => { ev.preventDefault(); });          // não tira o foco do campo antes do toque valer
  lista.addEventListener('click', (ev) => { const d = ev.target.closest('.sug-item'); if (d) escolher_(parseInt(d.dataset.i, 10)); });
  window.tkSugestoes_ = { sugerir: sugerir_ };
})();
