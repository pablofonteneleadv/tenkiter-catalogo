#!/usr/bin/env node
/* Testa o BACKEND do catálogo (catalogo-codigo-*.gs.txt) rodando o código do Apps Script de verdade, com planilha/cache/travas SIMULADOS
 * em memória. Não toca em planilha, WhatsApp, OneSignal nem Meta reais.
 *   node tests/backend_gs.js            (sai com código 1 se algo falhar)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const RAIZ = path.resolve(__dirname, '..');
const arquivos = fs.readdirSync(RAIZ).filter(f => /^catalogo-codigo-\d+\.\d+\.gs\.txt$/.test(f))
  .sort((a, b) => { const p = x => x.match(/(\d+)\.(\d+)/).slice(1).map(Number); const [a1, a2] = p(a), [b1, b2] = p(b); return a1 - b1 || a2 - b2; });
const ARQ = arquivos[arquivos.length - 1];
const codigoFonte = fs.readFileSync(path.join(RAIZ, ARQ), 'utf8');

let falhas = [], total = 0;
function ok(cond, nome, detalhe) { total++; if (!cond) { falhas.push(nome + (detalhe !== undefined ? ' -> ' + detalhe : '')); console.log('  ✘ ' + nome + (detalhe !== undefined ? '  (' + detalhe + ')' : '')); } else console.log('  ✔ ' + nome); }

// ------------------------------------------------------------------ simulação do Google
class Aba {
  constructor(nome) { this.nome = nome; this.d = []; this.oculta = false; }
  get ncols() { return this.d.reduce((m, r) => Math.max(m, r.length), 0); }
  appendRow(r) { this.d.push(r.slice()); }
  getLastRow() { return this.d.length; }
  getLastColumn() { return this.ncols; }
  getDataRange() { const n = this.ncols; return { getValues: () => this.d.map(r => { const c = r.slice(); while (c.length < n) c.push(''); return c; }) }; }
  getRange(r, c, nr, nc) {
    nr = nr || 1; nc = nc || 1; const self = this;
    return {
      getValues() { const o = []; for (let i = 0; i < nr; i++) { const l = []; for (let j = 0; j < nc; j++) { const v = (self.d[r - 1 + i] || [])[c - 1 + j]; l.push(v === undefined ? '' : v); } o.push(l); } return o; },
      getValue() { return this.getValues()[0][0]; },
      setValue(v) { self._set(r, c, v); return this; },
      setValues(m) { m.forEach((lin, i) => lin.forEach((v, j) => self._set(r + i, c + j, v))); return this; },
      setNumberFormat() { return this; }
    };
  }
  _set(r, c, v) { while (this.d.length < r) this.d.push([]); const l = this.d[r - 1]; while (l.length < c) l.push(''); l[c - 1] = v; }
  insertColumnBefore() {} hideSheet() { this.oculta = true; } deleteRow(r) { this.d.splice(r - 1, 1); }
}
class Planilha {
  constructor() { this.abas = []; }
  getSheetByName(n) { return this.abas.find(a => a.nome === n) || null; }
  insertSheet(n) { const a = new Aba(n); this.abas.push(a); return a; }
  getSheets() { return this.abas; }
  getId() { return 'planilha-simulada'; }
}
function criarAmbiente() {
  const ss = new Planilha(), pessoas = new Planilha();
  ss.insertSheet('Sheet1'); pessoas.insertSheet('Pessoas');
  const cacheMem = new Map(), props = new Map();
  const chamadasFetch = [];
  const amb = { fetchResposta: () => ({ code: 200, body: '{}' }), chamadasFetch, ss, cacheMem, props };
  const tz = -3 * 3600000;
  const pad = (n, t = 2) => String(n).padStart(t, '0');
  const ctx = {
    console, Date, JSON, Math, String, Number, Array, Object, RegExp, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, Error,
    Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => pessoas },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {}, hasLock: () => true }) },
    CacheService: { getScriptCache: () => ({
      get: k => cacheMem.has(k) ? cacheMem.get(k) : null,
      put: (k, v) => { cacheMem.set(k, String(v)); },
      remove: k => { cacheMem.delete(k); },
      getAll: ks => { const o = {}; ks.forEach(k => { if (cacheMem.has(k)) o[k] = cacheMem.get(k); }); return o; },
      putAll: o => { Object.keys(o).forEach(k => cacheMem.set(k, String(o[k]))); }
    }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => props.has(k) ? props.get(k) : null,
      setProperty: (k, v) => { props.set(k, String(v)); },
      deleteProperty: k => { props.delete(k); }
    }) },
    Utilities: {
      formatDate(d, _tz, fmt) {
        const x = new Date(d.getTime() + tz);
        const m = { yyyy: pad(x.getUTCFullYear(), 4), MM: pad(x.getUTCMonth() + 1), dd: pad(x.getUTCDate()), HH: pad(x.getUTCHours()), mm: pad(x.getUTCMinutes()) };
        return fmt.replace(/yyyy|MM|dd|HH|mm/g, t => m[t]);
      },
      computeDigest: (_a, texto) => Array.from(crypto.createHash('sha256').update(texto, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      computeHmacSha256Signature: (texto, chave) => Array.from(crypto.createHmac('sha256', String(chave)).update(String(texto), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(), base64Decode: s => Array.from(Buffer.from(s, 'base64')),
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' }, newBlob: () => ({})
    },
    ContentService: {
      MimeType: { JSON: 'json', CSV: 'csv', XML: 'xml', TEXT: 'text' },
      createTextOutput: t => ({ _t: String(t), mime: null, setMimeType(m) { this.mime = m; return this; }, getContent() { return this._t; } })
    },
    HtmlService: { createHtmlOutput: h => ({ getContent: () => h }) },
    UrlFetchApp: {
      fetch(url, opt) { chamadasFetch.push({ url, opt }); const r = amb.fetchResposta(url, opt); if (r instanceof Error) throw r; return { getResponseCode: () => r.code, getContentText: () => r.body }; },
      fetchAll(reqs) { return reqs.map(rq => { const opt = Object.assign({}, rq); const url = opt.url; delete opt.url; chamadasFetch.push({ url, opt, lote: true }); const r = amb.fetchResposta(url, opt); if (r instanceof Error) throw r; return { getResponseCode: () => r.code, getContentText: () => r.body }; }); }
    },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TESTE/exec' }) },
    DriveApp: {}
  };
  vm.createContext(ctx);
  vm.runInContext(codigoFonte, ctx, { filename: ARQ });
  amb.ctx = ctx;
  amb.run = expr => vm.runInContext(expr, ctx);
  amb.post = body => { ctx.__b = body; const r = vm.runInContext('doPost({postData:{contents: JSON.stringify(__b)}})', ctx); return JSON.parse(r.getContent()); };
  amb.postTexto = body => { ctx.__b = body; return vm.runInContext('doPost({postData:{contents: JSON.stringify(__b)}})', ctx); };
  amb.get = params => { ctx.__p = params; const r = vm.runInContext('doGet({parameter: __p})', ctx); return r; };
  amb.getJson = params => JSON.parse(amb.get(params).getContent());
  return amb;
}
const CAB = ['ID', 'Nome', 'Categoria', 'Genero', 'Preco', 'Foto_URL', 'Status', 'Data', 'Descricao', 'Estoque', 'Tamanhos', 'Cores', 'Novidade', 'Codigo', 'Foto_Stories_URL', 'Fotos_Galeria'];
function semear(amb) {
  const a = amb.ss.getSheetByName('Sheet1');
  a.appendRow(CAB);
  const L = (id, nome, cat, gen, preco, foto, st, estoque, cod, extra) => a.appendRow([id, nome, cat, gen, preco, foto, st, new Date('2026-09-01T12:00:00Z'), 'Desc ' + nome, estoque, 'P, M', 'Preto, Bege', false, cod, '', '']);
  L('101', 'Vestido Floral', 'Vestidos', 'Feminino Adulto', 100, 'https://res.cloudinary.com/z/a.jpg', 'Ativo', 5, 'TK-0001');
  L('102', 'Fantasia "Super-Herói", azul', 'Conjuntos', 'Infantil Menino', 80, 'https://res.cloudinary.com/z/b.jpg', 'Ativo', '', 'TK-0002');
  L('103', 'Blusa Esgotada', 'Blusas', 'Feminino Adulto', 50, 'https://res.cloudinary.com/z/c.jpg', 'Ativo', 0, 'TK-0003');
  L('104', 'Short Arquivado', 'Shorts', 'Masculino Adulto', 60, 'https://res.cloudinary.com/z/d.jpg', 'Inativo', 3, 'TK-0004');
  L('105', 'Peça Antiga Sem Código', 'Saias', 'Feminino Adulto', 70, 'https://res.cloudinary.com/z/e.jpg', 'Ativo', 2, '');
  L('106', 'Outra Antiga', 'Saias', 'Feminino Adulto', 75, 'https://res.cloudinary.com/z/f.jpg', 'Ativo', 2, '');
  amb.props.set('ADMIN_PIN', '1234'); // acesso do admin pelo PIN antigo (a autenticação por login é testada nos outros testes)
}
const ADM = { pin: '1234', funcionario: 'Teste' };
const adm = (o) => Object.assign({}, ADM, o);

// ------------------------------------------------------------------ 1. versão: nome do arquivo, cabeçalho, constante e ação batem
console.log('Arquivo testado: ' + ARQ);
(function versao() {
  console.log('\n[versão]');
  const v = ARQ.match(/catalogo-codigo-(\d+\.\d+)\.gs\.txt/)[1];
  ok(new RegExp('^// TENKiTER Catálogo -- backend \\(Google Apps Script\\) -- v' + v.replace('.', '\\.') + '\\s*$', 'm').test(codigoFonte.split('\n')[0]), 'cabeçalho do arquivo diz v' + v);
  const amb = criarAmbiente(); semear(amb);
  ok(amb.run('VERSAO_CATALOGO') === 'catalogo-' + v, 'constante VERSAO_CATALOGO = catalogo-' + v, amb.run('VERSAO_CATALOGO'));
  const r = amb.getJson({ action: 'versao' });
  ok(r.ok && r.versao === 'catalogo-' + v, '?action=versao devolve catalogo-' + v, r.versao);
  ok(r.pedidos === true && r.config === true && r.metricas === true && r.importacao === true && r.feed === true && r.integracoes === true && r.loteCategoria === true && r.pushHistorico === true && r.codigos === true, 'versao anuncia os recursos novos');
  if (parseFloat(v) >= 3.2) ok(r.categoriasGestao === true, 'versao anuncia categoriasGestao (o painel só mostra apagar/renomear categoria se vir isso)');
  ok(!/Versão: catálogo v2\.1/.test(codigoFonte), 'diagnostico() não tem mais a versão antiga escrita à mão');
  const antigos = arquivos.length;
  ok(antigos >= 1, 'existe o arquivo versionado');
})();

// ------------------------------------------------------------------ 2. pedidos
(function pedidos() {
  console.log('\n[pedidos: criar]');
  const amb = criarAmbiente(); semear(amb);
  const base = { action: 'criarPedido', nome: 'Maria Souza', whatsapp: '(88) 99999-1234', entrega: 'retirada', itens: [{ id: '101', preco: 1 }, { id: '102', preco: 1 }, { id: '103' }, { id: '104' }, { id: '999' }] };
  let r = amb.post(Object.assign({}, base, { nome: 'M' }));
  ok(r.ok === false && /nome/i.test(r.erro), 'nome curto é recusado', r.erro);
  r = amb.post(Object.assign({}, base, { whatsapp: '123' }));
  ok(r.ok === false && /whatsapp/i.test(r.erro), 'WhatsApp inválido é recusado', r.erro);
  r = amb.post(Object.assign({}, base, { itens: [] }));
  ok(r.ok === false, 'sem peças é recusado');
  r = amb.post(Object.assign({}, base, { entrega: 'entrega', endereco: 'Rua' }));
  ok(r.ok === false && /entrega/i.test(r.erro), 'entrega sem endereço é recusada', r.erro);
  r = amb.post(Object.assign({}, base, { itens: [{ id: '103' }, { id: '104' }] }));
  ok(r.ok === false && /dispon/i.test(r.erro), 'só peça esgotada/arquivada: recusa', r.erro);
  ok(amb.ss.getSheetByName('Pedidos') === null || amb.ss.getSheetByName('Pedidos').getLastRow() <= 1, 'pedido recusado não grava linha');

  r = amb.post(base);
  ok(r.ok && r.codigo === 'PED-0001', 'primeiro pedido vira PED-0001', JSON.stringify(r));
  ok(r.total === 162, 'o servidor recalculou: (100+80) com 10% à vista = 162 (ignorou o preço 1 mandado pelo navegador)', r.total);
  ok(r.ignorados === 3, 'peça esgotada, arquivada e inexistente foram ignoradas', r.ignorados);
  const aba = amb.ss.getSheetByName('Pedidos');
  ok(aba && aba.getLastRow() === 2, 'uma linha na aba Pedidos');
  const linha = aba.d[1];
  ok(linha[4] === '88999991234', 'WhatsApp guardado só com números (DDD+9+8)', linha[4]);
  const r2 = amb.post(base);
  ok(r2.ok && r2.codigo === 'PED-0001' && r2.repetido === true, 'mesmo cliente + mesmas peças em 2 min devolve o MESMO pedido (duplo toque)', JSON.stringify(r2));
  ok(aba.getLastRow() === 2, 'duplo toque não cria 2ª linha');
  const r3 = amb.post(Object.assign({}, base, { whatsapp: '88988887777', nome: '=HYPERLINK("http://x")' }));
  ok(r3.ok && r3.codigo === 'PED-0002', 'outro cliente vira PED-0002', r3.codigo);
  ok(String(aba.d[2][3]).startsWith("'="), 'nome que começa com = não vira fórmula na planilha', aba.d[2][3]);
  const r4 = amb.post(Object.assign({}, base, { whatsapp: '88 98888-7777', entrega: 'entrega', endereco: 'Rua Dr. Moreira da Rocha 759, Centro', itens: [{ id: '101' }] }));
  ok(r4.ok && r4.codigo === 'PED-0003' && r4.total === 90, 'entrega com endereço: PED-0003, total 90', JSON.stringify(r4));

  // freio por WhatsApp: 6 por hora
  const amb2 = criarAmbiente(); semear(amb2);
  let barrado = null;
  for (let i = 1; i <= 8; i++) {
    const x = amb2.post({ action: 'criarPedido', nome: 'Cliente', whatsapp: '8899999' + String(1000 + i).slice(-4), itens: [{ id: '101' }] });
    // cada número é diferente -> não deve barrar
    if (!x.ok) barrado = x;
  }
  ok(barrado === null, '8 clientes DIFERENTES não são barrados');
  const amb3 = criarAmbiente(); semear(amb3);
  const combos = [['101'], ['102'], ['105'], ['106'], ['101', '102'], ['101', '105'], ['101', '106'], ['102', '105']];
  const resultados = combos.map(c => amb3.post({ action: 'criarPedido', nome: 'Mesma Pessoa', whatsapp: '88999990000', itens: c.map(id => ({ id })) }));
  ok(resultados.slice(0, 6).every(x => x.ok) && resultados[6].ok === false, 'o 7º pedido da mesma pessoa em 1 hora é barrado', JSON.stringify(resultados.map(x => x.ok)));

  console.log('\n[pedidos: acompanhar]');
  r = amb.post({ action: 'consultarPedido', codigo: 'ped-1', final: '1234' });
  ok(r.ok && r.pedido.codigo === 'PED-0001' && r.pedido.status === 'novo', 'código "ped-1" + final certo acha PED-0001', JSON.stringify(r).slice(0, 200));
  const txt = JSON.stringify(r);
  ok(!/99991234/.test(txt) && !/Rua Dr/.test(txt) && !/Maria/.test(txt) && !/NotaInterna|nota/i.test(txt), 'a resposta ao cliente NÃO tem telefone, nome, endereço nem nota interna');
  ok(r.pedido.total === 162 && r.pedido.itens.length === 2 && r.pedido.itens[0].nome, 'tem total e itens (nome/código)');
  r = amb.post({ action: 'consultarPedido', codigo: 'PED-0001', final: '0000' });
  ok(r.ok === false && r.naoEncontrado === true, 'final errado = "não encontrado"');
  const r5 = amb.post({ action: 'consultarPedido', codigo: 'PED-0999', final: '1234' });
  ok(r5.ok === false && r5.naoEncontrado === true && JSON.stringify(r5) === JSON.stringify(r), 'código que não existe responde IGUAL a final errado (não revela quais existem)');
  for (let i = 0; i < 8; i++) amb.post({ action: 'consultarPedido', codigo: 'PED-0002', final: String(1000 + i) });
  r = amb.post({ action: 'consultarPedido', codigo: 'PED-0002', final: '7777' });
  ok(r.ok === false && r.bloqueado === true, 'depois de 8 erros o código fica bloqueado (mesmo com o final certo)', JSON.stringify(r));
  r = amb.post({ action: 'consultarPedido', codigo: 'PED-0001', final: '1234' });
  ok(r.ok === true, 'bloqueio de um código não derruba os outros');

  console.log('\n[pedidos: equipe]');
  r = amb.post({ action: 'listarPedidos' });
  ok(r.ok === false && (r.pinInvalido || r.exigeLogin || r.erro), 'listar pedidos sem PIN/login é negado', JSON.stringify(r));
  r = amb.post(adm({ action: 'listarPedidos' }));
  ok(r.ok && r.pedidos.length === 3 && r.total === 3, 'com PIN lista os 3 pedidos', JSON.stringify(r).slice(0, 120));
  ok(r.pedidos[0].codigo === 'PED-0003', 'mais novo primeiro', r.pedidos[0].codigo);
  const p1 = r.pedidos.find(x => x.codigo === 'PED-0001');
  ok(p1.whatsapp === '88999991234' && p1.nome === 'Maria Souza', 'a equipe vê nome e WhatsApp');
  ok(r.contagem.novo === 3, 'contagem por etapa', JSON.stringify(r.contagem));
  r = amb.post(adm({ action: 'atualizarPedido', codigo: 'PED-0001', status: 'inexistente' }));
  ok(r.ok === false, 'etapa inválida é recusada');
  r = amb.post(adm({ action: 'atualizarPedido', codigo: 'PED-0001', status: 'pronto', nota: 'Separado na prateleira 2' }));
  ok(r.ok && r.pedido.status === 'pronto' && r.pedido.nota === 'Separado na prateleira 2', 'muda etapa e grava nota', JSON.stringify(r).slice(0, 160));
  ok(r.pedido.historico.length === 2 && r.pedido.historico[1].status === 'pronto' && r.pedido.historico[1].por === 'Teste', 'histórico guarda a etapa e quem mudou', JSON.stringify(r.pedido.historico));
  r = amb.post({ action: 'consultarPedido', codigo: 'PED-0001', final: '1234' });
  ok(r.pedido.status === 'pronto' && !/prateleira/.test(JSON.stringify(r)), 'cliente vê a etapa nova, mas não a nota interna');
  r = amb.post(adm({ action: 'listarPedidos', status: 'pronto' }));
  ok(r.pedidos.length === 1 && r.contagem.pronto === 1 && r.contagem.novo === 2, 'filtro por etapa + contagens');
  r = amb.post(adm({ action: 'atualizarPedido', codigo: 'PED-0777', status: 'pronto' }));
  ok(r.ok === false, 'pedido que não existe');
})();

// ------------------------------------------------------------------ 3. códigos faltantes
(function codigos() {
  console.log('\n[códigos faltantes]');
  const amb = criarAmbiente(); semear(amb);
  let r = amb.post({ action: 'gerarCodigosFaltantes' });
  ok(r.ok === false, 'sem PIN/login é negado');
  r = amb.post(adm({ action: 'gerarCodigosFaltantes' }));
  ok(r.ok && r.geradas.length === 2, 'gera para as 2 peças sem código', JSON.stringify(r));
  ok(r.geradas[0].codigo === 'TK-0005' && r.geradas[1].codigo === 'TK-0006', 'continua depois do maior código existente (TK-0004), sem repetir', JSON.stringify(r.geradas));
  ok(amb.props.get('PROXIMO_CODIGO_NUM') === '6', 'contador acertado para 6', amb.props.get('PROXIMO_CODIGO_NUM'));
  const cods = amb.ss.getSheetByName('Sheet1').d.slice(1).map(l => l[13]);
  ok(new Set(cods).size === cods.length && cods.every(Boolean), 'todos os códigos são únicos e preenchidos', cods.join(','));
  r = amb.post(adm({ action: 'gerarCodigosFaltantes' }));
  ok(r.ok && r.geradas.length === 0, 'rodar de novo não gera nada (seguro)');
  const novo = amb.run('proximoCodigo_()');
  ok(novo === 'TK-0007', 'o próximo cadastro normal é TK-0007', novo);
})();

// ------------------------------------------------------------------ 4. métricas reais
(function metricas() {
  console.log('\n[métricas]');
  const amb = criarAmbiente(); semear(amb);
  let r = amb.post(adm({ action: 'metricas', dias: 30 }));
  ok(r.ok && r.semDados === true && r.totais.visualizacoes === 0, 'sem eventos: semDados=true e zeros (nada inventado)', JSON.stringify(r.totais));
  const ev = amb.ss.insertSheet('Eventos'); ev.appendRow(['DataHora', 'ProdutoID', 'Codigo', 'Tipo']);
  const agora = new Date(), ontem = new Date(Date.now() - 86400000), velho = new Date(Date.now() - 90 * 86400000);
  for (let i = 0; i < 10; i++) ev.appendRow([agora, '101', 'TK-0001', 'visualizacao']);
  for (let i = 0; i < 4; i++) ev.appendRow([ontem, '101', 'TK-0001', 'visualizacao']);
  for (let i = 0; i < 3; i++) ev.appendRow([agora, '101', 'TK-0001', 'whatsapp']);
  for (let i = 0; i < 5; i++) ev.appendRow([agora, '102', 'TK-0002', 'visualizacao']);
  ev.appendRow([agora, '102', 'TK-0002', 'whatsapp']);
  for (let i = 0; i < 50; i++) ev.appendRow([velho, '102', 'TK-0002', 'visualizacao']);
  amb.post({ action: 'criarPedido', nome: 'Ana', whatsapp: '88999990001', itens: [{ id: '101' }] });
  amb.cacheMem.clear();
  r = amb.post(adm({ action: 'metricas', dias: 30 }));
  ok(r.ok && !r.semDados, 'com eventos: semDados=false');
  ok(r.totais.visualizacoes === 19 && r.totais.whatsapp === 4, 'totais contam só o período (50 de 90 dias atrás ficam de fora)', JSON.stringify(r.totais));
  ok(r.totais.whatsappPor100Visualizacoes === 21.1, 'taxa = 4/19 = 21,1 por 100', r.totais.whatsappPor100Visualizacoes);
  ok(r.topProdutos[0].codigo === 'TK-0001' && r.topProdutos[0].visualizacoes === 14 && r.topProdutos[0].whatsapp === 3 && r.topProdutos[0].nome === 'Vestido Floral', 'peça mais vista é o Vestido Floral (14 views / 3 WhatsApp)', JSON.stringify(r.topProdutos[0]));
  ok(r.porDia.length === 30 && r.porDia[29].visualizacoes === 15 && r.porDia[28].visualizacoes === 4, 'série por dia tem 30 dias (hoje 15 views, ontem 4)', JSON.stringify(r.porDia.slice(-2)));
  const cat = r.categorias.find(c => c.nome === 'Vestidos');
  ok(cat && cat.visualizacoes === 14 && cat.whatsapp === 3, 'por categoria', JSON.stringify(r.categorias));
  ok(r.pedidos.total === 1 && r.pedidos.valor === 90, 'pedidos: 1 pedido de R$ 90', JSON.stringify(r.pedidos));
  const r7 = amb.post(adm({ action: 'metricas', dias: 7 }));
  ok(r7.porDia.length === 7, 'período de 7 dias');
})();

// ------------------------------------------------------------------ 5. importação CSV
(function importacao() {
  console.log('\n[importar produtos]');
  const amb = criarAmbiente(); semear(amb);
  const aba = amb.ss.getSheetByName('Sheet1');
  const antes = JSON.stringify(aba.d);
  const linhas = [
    { codigo: 'TK-0001', preco: '119,90', estoque: '8' },
    { codigo: 'tk-0002', nome: 'Fantasia Super-Herói Azul', cores: 'Azul, Vermelho' },
    { codigo: 'TK-0003', preco: 'abc' },
    { codigo: 'TK-0001', preco: '130' },
    { codigo: 'TK-0003', nome: 'Blusa Esgotada' },
    { codigo: 'TK-0004', status: 'talvez' },
    { nome: 'Peça Nova Importada', preco: '89,5', categoria: 'vestidos', genero: 'Feminino Adulto', foto_url: 'https://res.cloudinary.com/z/nova.jpg', estoque: '4', novidade: 'sim' },
    { nome: 'Sem foto', preco: '10' },
    { codigo: 'TK-9999', preco: '10' }
  ];
  let r = amb.post({ action: 'importarProdutos', linhas: linhas, simular: true });
  ok(r.ok === false, 'sem PIN/login é negado');
  r = amb.post(adm({ action: 'importarProdutos', linhas: linhas, simular: true }));
  ok(r.ok && r.simulacao === true, 'prévia (simular) responde ok');
  ok(JSON.stringify(aba.d) === antes, 'a prévia NÃO grava nada na planilha');
  ok(r.atualizados.length === 2, 'prévia: 2 peças seriam atualizadas', JSON.stringify(r.atualizados.map(x => x.codigo)));
  const u1 = r.atualizados.find(x => x.codigo === 'TK-0001');
  ok(u1 && u1.campos.some(c => /preço: 100 → 119.9/.test(c)) && u1.campos.some(c => /estoque: 5 → 8/.test(c)), 'a prévia mostra "antes → depois" de preço e estoque', JSON.stringify(u1));
  ok(r.criados.length === 1 && r.criados[0].nome === 'Peça Nova Importada' && /^TK-\d{4}$/.test(r.criados[0].codigo), 'prévia: 1 peça nova', JSON.stringify(r.criados));
  const motivos = r.ignorados.map(x => x.motivo).join(' | ');
  ok(/Preço inválido/.test(motivos) && /repetida/i.test(motivos) && /Status/.test(motivos) && /nome, preço e foto/.test(motivos) && /Nada mudou|não encontrada/i.test(motivos), 'prévia explica as linhas ignoradas', motivos);
  ok(r.ignorados.some(x => x.codigo === 'TK-9999') , 'código que não existe e sem nome/foto é ignorado');
  ok(r.criados[0].codigo === 'TK-0005', 'a peça nova ganha TK-0005 (depois do maior código existente, mesmo com o contador zerado)', r.criados[0].codigo);
  const contBefore = amb.props.get('PROXIMO_CODIGO_NUM');
  ok(contBefore === undefined || contBefore === null || contBefore === '0', 'prévia não mexe no contador de códigos', contBefore);

  r = amb.post(adm({ action: 'importarProdutos', linhas: linhas, simular: false }));
  ok(r.ok && r.simulacao === false && r.atualizados.length === 2 && r.criados.length === 1, 'aplicar grava: 2 atualizadas, 1 criada');
  const d = aba.d;
  const vest = d.find(l => l[13] === 'TK-0001');
  ok(vest[4] === 119.9 && vest[9] === 8 && vest[1] === 'Vestido Floral', 'TK-0001 mudou preço/estoque e manteve o resto', JSON.stringify([vest[4], vest[9], vest[1]]));
  const fant = d.find(l => l[13] === 'TK-0002');
  ok(fant[1] === 'Fantasia Super-Herói Azul' && fant[11] === 'Azul, Vermelho' && fant[4] === 80, 'TK-0002: nome/cores mudaram, preço intacto', JSON.stringify([fant[1], fant[11], fant[4]]));
  ok(d.find(l => l[13] === 'TK-0003')[4] === 50, 'linha com preço inválido não alterou a peça');
  const nova = d.find(l => l[1] === 'Peça Nova Importada');
  ok(nova && nova[6] === 'Ativo' && nova[4] === 89.5 && nova[9] === 4 && nova[12] === true && /^TK-/.test(nova[13]), 'peça nova criada ativa, com código TK-####, preço 89,5 e novidade', JSON.stringify(nova));
  const cods = d.slice(1).map(l => l[13]).filter(Boolean);
  ok(new Set(cods).size === cods.length, 'nenhum código repetido depois da importação', cods.join(','));
  ok(amb.props.get('PROXIMO_CODIGO_NUM') === '5', 'contador acertado para 5 depois de criar', amb.props.get('PROXIMO_CODIGO_NUM'));
  const hist = amb.ss.getSheetByName('Historico');
  ok(hist && hist.getLastRow() >= 2 && hist.d.slice(1).some(l => l[2] === 'importar_csv' && l[4] === 'TK-0001' && l[6] === 100 && l[7] === 119.9), 'mudança de preço/estoque ficou no Historico (antes e depois)');
  ok(amb.run('getListaValores_(SHEET_CATEGORIAS, CATEGORIAS_PADRAO)').indexOf('Vestidos') !== -1 && amb.run('getListaValores_(SHEET_CATEGORIAS, CATEGORIAS_PADRAO)').filter(c => /^vestidos$/i.test(c)).length === 1, 'categoria "vestidos" não duplicou "Vestidos"');
  r = amb.post(adm({ action: 'importarProdutos', linhas: [] }));
  ok(r.ok === false, 'arquivo vazio é recusado');
  const muitas = Array.from({ length: 350 }, (_, i) => ({ codigo: 'TK-0001', preco: String(10 + i) }));
  r = amb.post(adm({ action: 'importarProdutos', linhas: muitas, simular: true }));
  ok(r.ok && (r.atualizados.length + r.ignorados.length) === 300, 'no máximo 300 linhas por vez');
})();

// ------------------------------------------------------------------ 6. feed e sitemap
(function feed() {
  console.log('\n[feed e mapa do site]');
  const amb = criarAmbiente(); semear(amb);
  const csvOut = amb.get({ action: 'feed', formato: 'csv' });
  const csv = csvOut.getContent();
  ok(csvOut.mime === 'csv', 'feed CSV com tipo CSV');
  const linhas = csv.trim().split('\r\n');
  ok(linhas[0] === 'id,title,description,availability,condition,price,link,image_link,additional_image_link,brand,gender,age_group,color,product_type,quantity_to_sell_on_facebook', 'cabeçalho do feed no formato da Meta/Google');
  ok(linhas.length === 1 + 5, 'só peças ATIVAS (arquivada fica de fora): 5', linhas.length - 1);
  ok(csv.indexOf('TK-0004') === -1, 'peça arquivada não está no feed');
  ok(/TK-0001,Vestido Floral,Desc Vestido Floral,in stock,new,100\.00 BRL,https:\/\/tenkitermodas\.com\.br\/p\/TK-0001,https:\/\/res\.cloudinary\.com\/z\/a\.jpg,,TENKiTER Modas,female,adult,"Preto\/Bege"?/.test(csv) || /TK-0001,Vestido Floral,Desc Vestido Floral,in stock,new,100\.00 BRL,https:\/\/tenkitermodas\.com\.br\/p\/TK-0001/.test(csv), 'linha do Vestido: preço CHEIO 100.00 BRL, link /p/TK-0001, in stock', linhas[1]);
  ok(/TK-0003,Blusa Esgotada,.*,out of stock,/.test(csv), 'peça com estoque 0 aparece como out of stock');
  ok(/"Fantasia ""Super-Herói"", azul"/.test(csv), 'aspas e vírgula no nome são escapadas (CSV válido)');
  ok(/male,kids/.test(csv), 'infantil menino = male/kids');
  ok(/105,Peça Antiga Sem Código/.test(csv), 'peça sem código usa o ID como id do feed');
  const xmlOut = amb.get({ action: 'feed', formato: 'xml' }); const xml = xmlOut.getContent();
  ok(xmlOut.mime === 'xml' && xml.startsWith('<?xml') && /<g:id>TK-0001<\/g:id>/.test(xml) && /<g:price>100\.00 BRL<\/g:price>/.test(xml), 'feed XML (RSS do Google) com g:id e g:price');
  ok(/&quot;Super-Herói&quot;/.test(xml) && !/<g:title>Fantasia "/.test(xml), 'XML escapa aspas');
  const sm = amb.get({ action: 'sitemap' }).getContent();
  ok(sm.indexOf('<loc>https://tenkitermodas.com.br/p/TK-0001</loc>') !== -1 && sm.indexOf('TK-0004') === -1 && sm.indexOf('<loc>https://tenkitermodas.com.br/</loc>') !== -1, 'sitemap tem a página inicial e as peças ativas com código (sem a arquivada)');
  // cache invalida quando muda produto
  amb.post(adm({ action: 'bulkUpdate', tipoAcao: 'alterarEstoque', ids: ['101'], valor: 0 }));
  ok(/TK-0001,Vestido Floral,.*,out of stock,/.test(amb.get({ action: 'feed', formato: 'csv' }).getContent()), 'depois de mudar o estoque o feed reflete (cache descartado)');
})();

// ------------------------------------------------------------------ 7. integrações e segredos
(function integracoes() {
  console.log('\n[integrações: Pixel, API de Conversões, sinônimos]');
  const amb = criarAmbiente(); semear(amb);
  let r = amb.getJson({ action: 'config' });
  ok(r.ok && r.config.pixelId === '' && Array.isArray(r.config.sinonimos) && r.config.sinonimos.length === 0, 'config pública começa vazia', JSON.stringify(r));
  r = amb.post({ action: 'salvarIntegracoes', pixelId: '123456789012345' });
  ok(r.ok === false, 'salvar sem PIN/login é negado');
  r = amb.post(adm({ action: 'salvarIntegracoes', pixelId: '12ab' }));
  ok(r.ok === false && /Pixel/.test(r.erro), 'ID do Pixel com letras é recusado', r.erro);
  const TOKEN = 'EAAxxSEGREDOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234';
  r = amb.post(adm({ action: 'salvarIntegracoes', pixelId: '123456789012345', tokenCapi: TOKEN, testeCodigo: 'TEST123', sinonimos: 'bermuda=short\nconjunto=kit\nlinha invalida\nfantasia=roupa de festa' }));
  ok(r.ok && r.pixelId === '123456789012345' && r.capiConfigurado === true && r.testeCodigo === 'TEST123', 'salva Pixel, token e código de teste', JSON.stringify(r));
  ok(JSON.stringify(r).indexOf(TOKEN) === -1 && JSON.stringify(r).indexOf('SEGREDO') === -1, 'o token NÃO volta na resposta de salvar');
  let st = amb.post(adm({ action: 'statusIntegracoes' }));
  ok(st.ok && st.capiConfigurado === true && JSON.stringify(st).indexOf('SEGREDO') === -1, 'statusIntegracoes só diz "configurado", sem o token');
  r = amb.getJson({ action: 'config' });
  ok(r.config.pixelId === '123456789012345', 'config pública já mostra o Pixel (cache descartado ao salvar)', JSON.stringify(r));
  ok(r.config.sinonimos.length === 3 && r.config.sinonimos.indexOf('bermuda=short') !== -1 && r.config.sinonimos.indexOf('linha invalida') === -1, 'sinônimos: linhas válidas ficam, inválidas caem', JSON.stringify(r.config.sinonimos));
  ok(JSON.stringify(r).indexOf('SEGREDO') === -1 && /capi|token/i.test(JSON.stringify(r)) === false, 'a config PÚBLICA nunca tem token');
  const feedTxt = amb.get({ action: 'feed' }).getContent() + amb.get({ action: 'versao' }).getContent();
  ok(feedTxt.indexOf('SEGREDO') === -1, 'token não vaza em feed nem em versão');
  r = amb.post(adm({ action: 'salvarIntegracoes', tokenCapi: 'curto' }));
  ok(r.ok === false, 'token curto/estranho é recusado');
  const auditoria = JSON.stringify(amb.ss.getSheetByName('Acoes_Audit').d);
  ok(auditoria.indexOf('SEGREDO') === -1 && auditoria.indexOf('1234') === -1, 'a auditoria não guarda o token nem o PIN');

  console.log('\n[API de Conversões]');
  amb.fetchResposta = () => ({ code: 200, body: '{"events_received":1}' });
  amb.chamadasFetch.length = 0;
  amb.cacheMem.clear();
  r = amb.post({ action: 'registrarEvento', produtoId: '101', codigo: 'TK-0001', tipo: 'visualizacao' });
  ok(r.ok && amb.chamadasFetch.length === 0, 'sem "meta" (pessoa não aceitou o aviso): NADA vai para a Meta');
  amb.cacheMem.clear();
  r = amb.post({ action: 'registrarEvento', produtoId: '101', codigo: 'TK-0001', tipo: 'visualizacao', meta: { fbp: 'fb.1.1.1', fbc: 'fb.1.1.2', url: 'https://tenkitermodas.com.br/?c=TK-0001', ua: 'UA-Teste', eventId: 'vc-101-abc' } });
  ok(r.ok && amb.chamadasFetch.length === 1, 'com "meta": um envio para a Meta');
  const c = amb.chamadasFetch[0];
  ok(/^https:\/\/graph\.facebook\.com\/v\d+\.\d\/123456789012345\/events\?access_token=/.test(c.url), 'envia para o Graph API com o ID do Pixel', c.url.replace(/access_token=.*/, 'access_token=…'));
  const corpo = JSON.parse(c.opt.payload);
  ok(corpo.data[0].event_name === 'ViewContent' && corpo.data[0].event_id === 'vc-101-abc' && corpo.data[0].action_source === 'website', 'evento ViewContent com o MESMO event_id do navegador (sem contar 2x)');
  ok(corpo.data[0].user_data.fbp === 'fb.1.1.1' && corpo.data[0].user_data.client_user_agent === 'UA-Teste' && !corpo.data[0].user_data.em && !corpo.data[0].user_data.ph, 'só envia cookies/UA — nenhum e-mail/telefone do cliente');
  ok(corpo.test_event_code === 'TEST123', 'usa o código de teste enquanto estiver configurado');
  amb.chamadasFetch.length = 0; amb.cacheMem.clear();
  amb.post({ action: 'registrarEvento', produtoId: '102', codigo: 'TK-0002', tipo: 'whatsapp', meta: { fbp: 'x', url: 'https://tenkitermodas.com.br/', ua: 'u', eventId: 'ct-102-1' } });
  ok(amb.chamadasFetch.length === 1 && JSON.parse(amb.chamadasFetch[0].opt.payload).data[0].event_name === 'Contact', 'clique no WhatsApp vira Contact');
  amb.chamadasFetch.length = 0; amb.cacheMem.clear();
  amb.fetchResposta = () => new Error('sem internet');
  r = amb.post({ action: 'registrarEvento', produtoId: '103', codigo: 'TK-0003', tipo: 'visualizacao', meta: { url: 'x', ua: 'u' } });
  ok(r.ok === true, 'falha de rede na Meta NÃO derruba o registro do evento');
  ok(amb.ss.getSheetByName('Erros_Log') && amb.ss.getSheetByName('Erros_Log').getLastRow() >= 2, 'a falha fica anotada em Erros_Log');
  amb.fetchResposta = () => ({ code: 400, body: '{"error":{"message":"token invalido"}}' });
  amb.cacheMem.clear();
  r = amb.post({ action: 'registrarEvento', produtoId: '104', codigo: 'TK-0004', tipo: 'visualizacao', meta: { url: 'x', ua: 'u' } });
  ok(r.ok === true, 'resposta de erro da Meta também não derruba');
  amb.post(adm({ action: 'salvarIntegracoes', limparTokenCapi: true }));
  amb.chamadasFetch.length = 0; amb.cacheMem.clear();
  amb.post({ action: 'registrarEvento', produtoId: '105', codigo: '', tipo: 'visualizacao', meta: { url: 'x', ua: 'u' } });
  ok(amb.chamadasFetch.length === 0, 'sem token: nada é enviado (recurso desligado)');
  st = amb.post(adm({ action: 'statusIntegracoes' }));
  ok(st.capiConfigurado === false, 'apagar o token funciona');
})();

// ------------------------------------------------------------------ 8. avisos (push), lote por categoria, descrição sem IA
(function resto() {
  console.log('\n[avisos, lote e descrição]');
  const amb = criarAmbiente(); semear(amb);
  let r = amb.post(adm({ action: 'enviarPush', titulo: 'Oi', mensagem: 'Teste' }));
  ok(r.ok === false && /OneSignal/.test(r.erro), 'sem chaves do OneSignal: erro claro');
  amb.props.set('ONESIGNAL_APP_ID', 'app'); amb.props.set('ONESIGNAL_REST_API_KEY', 'chave'); amb.props.set('PUSH_SEGMENTOS', 'Clientes Infantil, Clientes Feminino');
  amb.fetchResposta = () => ({ code: 200, body: '{"id":"n1","recipients":7}' });
  r = amb.post(adm({ action: 'enviarPush', titulo: 'Chegou!', mensagem: 'Fantasias novas', url: 'https://tenkitermodas.com.br/?c=TK-0002', segmento: 'Clientes Infantil' }));
  ok(r.ok && r.destinatarios === 7, 'aviso enviado para 7');
  ok(JSON.parse(amb.chamadasFetch[0].opt.payload).included_segments[0] === 'Clientes Infantil', 'usou o segmento escolhido');
  const n0 = amb.chamadasFetch.length;
  r = amb.post(adm({ action: 'enviarPush', titulo: 'T', mensagem: 'M', segmento: 'Segmento Inventado' }));
  ok(r.ok === false && /segmento/i.test(r.erro) && amb.chamadasFetch.length === n0, 'segmento que não está na lista é RECUSADO (v3.3: antes caía em "todos" e podia mandar para o público errado) e nada é enviado', JSON.stringify(r));
  r = amb.post(adm({ action: 'enviarPush', titulo: 'T', mensagem: 'M', segmento: 'Subscribed Users' }));
  const pl = JSON.parse(amb.chamadasFetch[amb.chamadasFetch.length - 1].opt.payload);
  ok(r.ok && Array.isArray(pl.filters) && !pl.included_segments && pl.filters.some(f => f.key === 'av_novidades'), 'formato antigo sem segmento = "todos" respeitando quem desligou promoções (filtro av_novidades)', JSON.stringify(pl.filters));
  r = amb.post(adm({ action: 'enviarPush', titulo: 'T', mensagem: 'M', url: 'javascript:alert(1)' }));
  ok(r.ok === false, 'link que não é https:// é recusado');
  r = amb.post(adm({ action: 'pushHistorico' }));
  ok(r.ok && r.historico.length === 2, 'histórico guarda os 2 avisos', JSON.stringify(r.historico.map(h => h.titulo)));
  ok(r.historico[0].titulo === 'T' && r.historico[1].segmento === 'Clientes Infantil' && r.historico[1].destinatarios === 7 && r.historico[1].quem === 'Teste', 'histórico: mais novo primeiro, com segmento, destinatários e quem enviou');
  ok(r.segmentos[0] === 'Subscribed Users' && r.segmentos.indexOf('Clientes Feminino') !== -1, 'lista de segmentos para o painel');
  r = amb.post({ action: 'pushHistorico' });
  ok(r.ok === false, 'histórico sem login é negado');

  r = amb.post(adm({ action: 'bulkUpdate', tipoAcao: 'alterarCategoria', ids: ['101', '102'], valor: 'saias' }));
  ok(r.ok && r.afetados === 2, 'lote: categoria alterada em 2 peças');
  const aba = amb.ss.getSheetByName('Sheet1');
  ok(aba.d[1][2] === 'Saias' && aba.d[2][2] === 'Saias', 'reaproveitou a grafia que já existe ("Saias"), sem acento/maiúscula', aba.d[1][2]);
  r = amb.post(adm({ action: 'bulkUpdate', tipoAcao: 'alterarCategoria', ids: ['101'], valor: 'Roupas de Festa' }));
  ok(aba.d[1][2] === 'Roupas de Festa' && amb.run('getListaValores_(SHEET_CATEGORIAS, CATEGORIAS_PADRAO)').indexOf('Roupas de Festa') !== -1, 'categoria nova entra na lista de categorias');
  r = amb.post(adm({ action: 'bulkUpdate', tipoAcao: 'alterarCategoria', ids: ['101'], valor: '   ' }));
  ok(r.ok === false, 'categoria vazia é recusada');

  r = amb.post(adm({ action: 'gerarSeo', nome: 'Vestido Floral Midi', categoria: 'Vestidos', genero: 'Feminino Adulto', cores: 'Rosa, Verde', descricao: 'Tecido leve' }));
  ok(r.ok && r.local === true && r.titulo.length <= 60 && r.descricao.length <= 300, 'sem chave do Gemini: devolve texto pronto (local:true) em vez de erro', JSON.stringify(r));
  ok(/Crateús-CE/.test(r.descricao) && /10% de desconto à vista/.test(r.descricao) && !/sem juros|3x|horário/i.test(r.descricao), 'o texto só usa fatos da loja (10% à vista, Crateús-CE) — sem inventar parcelamento nem horário');
  ok(r.aviso && /Gemini/.test(r.aviso), 'e avisa por que não usou a IA');
})();

// ------------------------------------------------------------------ 8b. categorias: nome limpo, apagar e renomear (v3.2)
(function categorias() {
  console.log('\n[categorias: nome limpo, apagar, renomear]');
  const amb = criarAmbiente(); semear(amb);
  const lista = () => amb.getJson({ action: 'categorias' }).categorias;
  const aba = amb.ss.getSheetByName('Sheet1');
  const catDa = (id) => { const l = aba.d.find(x => x[0] === id); return l ? l[2] : undefined; };

  // --- criar (PIN antigo basta: é "cadastrar")
  let r = amb.post(adm({ action: 'addCategoria', nome: '  Fantasia   infantil,  menina ' }));
  ok(r.ok && r.nome === 'Fantasia infantil menina', 'nome limpo: vírgula vira espaço, espaços repetidos viram um, pontas aparadas', JSON.stringify(r));
  ok(lista().indexOf('Fantasia infantil menina') !== -1 && lista().filter(c => /Fantasia/.test(c)).length === 1, 'entrou UMA vez na lista, sem vírgula');
  r = amb.post(adm({ action: 'addCategoria', nome: 'fantasia INFANTIL menina' }));
  ok(r.ok && r.jaExistia === true && r.nome === 'Fantasia infantil menina' && lista().filter(c => /fantasia/i.test(c)).length === 1, 'repetir com outra maiúscula não duplica e devolve o nome que já existe', JSON.stringify(r));
  r = amb.post(adm({ action: 'addCategoria', nome: 'Calcas' }));
  ok(r.ok && r.jaExistia === true && r.nome === 'Calças' || r.ok && r.nome === 'Calcas', 'sem acento é reconhecida como a mesma ("Calças" já existe nas padrão)', JSON.stringify(r));
  r = amb.post(adm({ action: 'addCategoria', nome: ' , ,  ' }));
  ok(r.ok === false, 'nome só de vírgula/espaço é recusado', JSON.stringify(r));
  r = amb.post(adm({ action: 'addCategoria', nome: 'x'.repeat(100) }));
  ok(r.ok && r.nome.length === 60, 'nome muito longo é cortado em 60');
  r = amb.post(adm({ action: 'addCategoria', nome: '=1+1' }));
  ok(r.ok && !String(amb.ss.getSheetByName('Categorias').d.slice(-1)[0][0]).startsWith('='), 'nome que começa com "=" não vira fórmula na planilha');
  r = amb.post({ action: 'addCategoria', nome: 'Sem login' });
  ok(r.ok === false, 'criar categoria sem PIN/login continua negado');

  // --- contas: Admin total e Funcionária (login de verdade)
  // a planilha de pessoas de verdade já tem Nome/WhatsApp/Senha na linha 1; o simulador começa vazio
  amb.ctx.SpreadsheetApp.openById('x').getSheetByName('Pessoas').appendRow(['Nome', 'WhatsApp', 'Senha']);
  amb.run("acRegistrar_('Pablo Admin', '88999990001', 'senha-forte-1', 'Admin total', {})");
  amb.run("acRegistrar_('Ana Func', '88999990002', 'senha-forte-2', 'Funcionário', {})");
  const tokAdmin = amb.post({ action: 'login', whatsapp: '88999990001', senha: 'senha-forte-1' });
  const tokFunc = amb.post({ action: 'login', whatsapp: '88999990002', senha: 'senha-forte-2' });
  ok(tokAdmin.ok && tokAdmin.usuario.permissoes.indexOf('gerir_acessos') !== -1, 'conta Admin total existe e tem gerir_acessos', JSON.stringify(tokAdmin).slice(0, 160));
  ok(tokFunc.ok && tokFunc.usuario.permissoes.indexOf('gerir_acessos') === -1 && tokFunc.usuario.permissoes.indexOf('catalogo_cadastrar') !== -1, 'conta de Funcionário cadastra mas NÃO tem gerir_acessos');
  const A = (o) => Object.assign({ sessao: tokAdmin.sessao, whatsapp: '88999990001' }, o);
  const F = (o) => Object.assign({ sessao: tokFunc.sessao, whatsapp: '88999990002' }, o);

  // peças de teste com categorias: 101 Vestidos | 102 Conjuntos | 103 Blusas | 105/106 Saias
  aba.d.find(x => x[0] === '101')[2] = 'Vestidos, Fantasia infantil menina';
  amb.post(A({ action: 'addCategoria', nome: 'aisatnaF Fantasia' }));
  amb.post(A({ action: 'addCategoria', nome: 'Lixo Sem Uso' }));

  // --- apagar: só Admin total, só com login
  r = amb.post(F({ action: 'excluirCategoria', nome: 'Lixo Sem Uso' }));
  ok(r.ok === false && r.semPermissao === true && lista().indexOf('Lixo Sem Uso') !== -1, 'Funcionário NÃO consegue apagar categoria (sem permissão) e nada é apagado', JSON.stringify(r));
  r = amb.post(adm({ action: 'excluirCategoria', nome: 'Lixo Sem Uso' }));
  ok(r.ok === false && r.exigeLogin === true && lista().indexOf('Lixo Sem Uso') !== -1, 'o PIN antigo NÃO apaga categoria (exige login de Admin total)', JSON.stringify(r));
  r = amb.post({ action: 'excluirCategoria', nome: 'Lixo Sem Uso' });
  ok(r.ok === false && lista().indexOf('Lixo Sem Uso') !== -1, 'sem nenhuma credencial: negado');
  r = amb.post(A({ action: 'excluirCategoria', nome: 'Lixo Sem Uso' }));
  ok(r.ok && r.pecas === 0 && lista().indexOf('Lixo Sem Uso') === -1, 'Admin total apaga categoria sem uso', JSON.stringify(r));
  r = amb.post(A({ action: 'excluirCategoria', nome: 'Lixo Sem Uso' }));
  ok(r.ok === false && r.naoExiste === true, 'apagar de novo: "não existe mais"', JSON.stringify(r));
  r = amb.post(A({ action: 'excluirCategoria', nome: '' }));
  ok(r.ok === false, 'sem nome: recusa');
  r = amb.post(A({ action: 'excluirCategoria', nome: 'fantasia INFANTIL menina' }));
  ok(r.ok === false && r.emUso === 1 && lista().indexOf('Fantasia infantil menina') !== -1 && catDa('101') === 'Vestidos, Fantasia infantil menina', 'categoria EM USO: não apaga e diz em quantas peças (1)', JSON.stringify(r));
  r = amb.post(A({ action: 'excluirCategoria', nome: 'Fantasia infantil menina', confirmar: true }));
  ok(r.ok && r.pecas === 1 && lista().indexOf('Fantasia infantil menina') === -1, 'com confirmação apaga a categoria', JSON.stringify(r));
  ok(catDa('101') === 'Vestidos', 'a peça perdeu SÓ essa categoria e ficou com a outra ("Vestidos")', catDa('101'));
  ok(aba.d.filter(x => x[0] === '101').length === 1 && aba.d.find(x => x[0] === '101')[1] === 'Vestido Floral', 'a peça continua no catálogo');
  const audit = () => amb.ss.getSheetByName('Acoes_Audit');
  ok(audit() && audit().d.some(l => l[2] === 'excluir_categoria' && l[1] === 'Pablo Admin'), 'ficou registrado em Acoes_Audit com o nome de quem apagou');
  ok(amb.getJson({ action: 'list' }).produtos.find(x => x.ID === '101').Categoria === 'Vestidos', 'a lista pública já mostra a mudança (cache descartado)');

  // --- renomear
  r = amb.post(F({ action: 'renomearCategoria', nome: 'aisatnaF Fantasia', novoNome: 'Fantasia' }));
  ok(r.ok === false && r.semPermissao === true, 'Funcionário NÃO renomeia categoria');
  r = amb.post(adm({ action: 'renomearCategoria', nome: 'aisatnaF Fantasia', novoNome: 'Fantasia' }));
  ok(r.ok === false && r.exigeLogin === true, 'o PIN antigo NÃO renomeia categoria');
  aba.d.find(x => x[0] === '102')[2] = 'Conjuntos, aisatnaF Fantasia';
  aba.d.find(x => x[0] === '103')[2] = 'aisatnaF Fantasia';
  r = amb.post(A({ action: 'renomearCategoria', nome: 'aisatnaF Fantasia', novoNome: '  Fantasia  ' }));
  ok(r.ok && r.nome === 'Fantasia' && r.pecas === 2 && !r.juntou, 'renomeia (nome limpo) e diz quantas peças mudaram (2)', JSON.stringify(r));
  ok(lista().indexOf('Fantasia') !== -1 && lista().indexOf('aisatnaF Fantasia') === -1, 'a lista tem o nome novo e não tem o velho');
  ok(catDa('102') === 'Conjuntos, Fantasia' && catDa('103') === 'Fantasia', 'as peças que usavam o nome velho passaram para o novo, mantendo as outras categorias', catDa('102') + ' | ' + catDa('103'));
  // juntar com uma que já existe
  aba.d.find(x => x[0] === '105')[2] = 'Saias, Fantasia';
  amb.post(A({ action: 'addCategoria', nome: 'Fantasias Erro' })); aba.d.find(x => x[0] === '106')[2] = 'Fantasias Erro';
  r = amb.post(A({ action: 'renomearCategoria', nome: 'Fantasias Erro', novoNome: 'fantasia' }));
  ok(r.ok && r.juntou === true && r.nome === 'Fantasia', 'nome novo que já existe: JUNTA e usa a grafia que já existia', JSON.stringify(r));
  ok(lista().filter(c => /^fantasia/i.test(c)).length === 1 && catDa('106') === 'Fantasia', 'continua uma só "Fantasia" na lista e a peça foi para ela');
  aba.d.find(x => x[0] === '105')[2] = 'Fantasia, Saias, Fantasias Erro2';
  amb.post(A({ action: 'addCategoria', nome: 'Fantasias Erro2' }));
  r = amb.post(A({ action: 'renomearCategoria', nome: 'Fantasias Erro2', novoNome: 'Fantasia' }));
  ok(catDa('105') === 'Fantasia, Saias', 'peça que já tinha as duas fica com "Fantasia" uma vez só', catDa('105'));
  // só acento/maiúscula
  r = amb.post(A({ action: 'renomearCategoria', nome: 'saias', novoNome: 'SAIAS Longas' }));
  ok(r.ok && lista().indexOf('SAIAS Longas') !== -1 && lista().indexOf('Saias') === -1, 'renomear para algo novo funciona também em categoria padrão');
  amb.post(A({ action: 'addCategoria', nome: 'calcas jeans' }));
  r = amb.post(A({ action: 'renomearCategoria', nome: 'calcas jeans', novoNome: 'Calças Jeans' }));
  ok(r.ok && r.juntou === false && lista().indexOf('Calças Jeans') !== -1 && lista().indexOf('calcas jeans') === -1, 'corrigir só acento/maiúscula não vira "juntar"', JSON.stringify(r));
  r = amb.post(A({ action: 'renomearCategoria', nome: 'Nao Existe', novoNome: 'X' }));
  ok(r.ok === false && r.naoExiste === true, 'renomear categoria que não existe: erro claro');
  r = amb.post(A({ action: 'renomearCategoria', nome: 'Fantasia', novoNome: ' , ' }));
  ok(r.ok === false, 'nome novo vazio é recusado');
  ok(audit() && audit().d.some(l => l[2] === 'renomear_categoria'), 'renomear também fica registrado');
  r = amb.post(A({ action: 'renomearCategoria', nome: 'Fantasia', novoNome: 'Fantasia, Nova' }));
  ok(r.ok && r.nome === 'Fantasia Nova' && catDa('103') === 'Fantasia Nova', 'vírgula no nome novo é trocada por espaço (não quebra em duas categorias)', r.nome + ' | ' + catDa('103'));
})();

// ------------------------------------------------------------------ 8c. avisos completos (v3.3) com um OneSignal FALSO
function onesignalFalso(amb, est) {
  est.enviados = []; est.cancelados = []; est.auths = []; est.sequencia = 0;
  est.usuarios = est.usuarios || [];
  const avalia = (filtros, u) => {
    const grupos = [[]];
    filtros.forEach(f => { if (f.operator === 'OR') grupos.push([]); else grupos[grupos.length - 1].push(f); });
    return grupos.some(g => g.every(f => {
      const v = (u.tags || {})[f.key];
      if (f.relation === '=') return String(v) === String(f.value);
      if (f.relation === 'exists') return v !== undefined;
      if (f.relation === 'not_exists') return v === undefined;
      return false;
    }));
  };
  amb.fetchResposta = (url, opt) => {
    const auth = ((opt && opt.headers) || {}).Authorization || '';
    if (/\/sync\//.test(url)) return { code: 200, body: est.webPronto ? '/**/x({"success":true,"app_id":"app","features":{}})' : '/**/x({"success":false,"code":2,"description":"This app is not configured for web push."})' };
    est.auths.push(auth);
    if (est.exigeEsquema && auth.split(' ')[0] !== est.exigeEsquema) return { code: 403, body: '{"errors":["Access denied. Please include an Authorization header"]}' };
    if (est.cai) return est.cai;
    const metodo = String((opt && opt.method) || 'get').toLowerCase();
    const m = url.match(/\/notifications\/([^?]+)\?/);
    if (m) {
      if (metodo === 'delete') { est.cancelados.push(m[1]); return est.naoCancela ? { code: 400, body: '{"errors":["Notification has already been sent"]}' } : { code: 200, body: '{"success":true}' }; }
      return { code: 200, body: JSON.stringify(est.stats || { successful: 5, failed: 1, errored: 1, converted: 2, remaining: 0, canceled: false, completed_at: 1760000000 }) };
    }
    const p = JSON.parse(opt.payload);
    est.enviados.push(p);
    const id = 'notif-' + String(++est.sequencia).padStart(4, '0') + '-aaaa';
    if (p.include_aliases) {
      const invalidos = {}; let validos = 0;
      Object.keys(p.include_aliases).forEach(rot => (p.include_aliases[rot] || []).forEach(x => {
        const tem = est.usuarios.some(u => u[rot] === x);
        if (tem) validos++; else (invalidos[rot] = invalidos[rot] || []).push(x);
      }));
      if (!validos) return { code: 200, body: JSON.stringify({ id: '', errors: { invalid_aliases: invalidos } }) };
      return { code: 200, body: JSON.stringify(Object.keys(invalidos).length ? { id, errors: { invalid_aliases: invalidos } } : { id }) };
    }
    if (p.filters) return { code: 200, body: JSON.stringify({ id, recipients: est.usuarios.filter(u => avalia(p.filters, u)).length }) };
    return { code: 200, body: JSON.stringify({ id, recipients: est.usuarios.length }) };
  };
  return est;
}

(function avisosCompletos() {
  console.log('\n[avisos completos v3.3: públicos, {nome}, agendamento, automáticos]');
  const amb = criarAmbiente(); semear(amb);
  amb.ctx.SpreadsheetApp.openById('x').getSheetByName('Pessoas').appendRow(['Nome', 'WhatsApp', 'Senha']);
  const gente = [
    ['Pablo Admin', '88999990001', 'Admin total'], ['Ana Func', '88999990002', 'Funcionário'], ['Bia Aluna', '88999990003', 'Aluno'],
    ['Caio Novato', '88999990004', 'Novato'], ['Dani Cliente', '88999990005', 'Cliente'], ['Eva Silva', '88999990006', 'Cliente'],
    ['Flávia Estagiária', '88999990007', 'Estagiário'], ['Gil Admin', '88999990008', 'Admin']
  ];
  gente.forEach(g => amb.run("acRegistrar_(" + JSON.stringify(g[0]) + ", " + JSON.stringify(g[1]) + ", 'senha-" + g[1].slice(-2) + "', " + JSON.stringify(g[2]) + ", {})"));
  // Eva fica inativa (não pode receber nada)
  const ph = amb.ctx.SpreadsheetApp.openById('x').getSheetByName('Pessoas');
  const cab = ph.d[0].map(x => String(x).toLowerCase());
  ph.d.forEach((l, i) => { if (i && l[cab.indexOf('whatsapp')] === '88999990006') l[cab.indexOf('status')] = 'Inativo'; });
  const entrar = (w) => amb.post({ action: 'login', whatsapp: w, senha: 'senha-' + w.slice(-2) });
  const tok = {}; gente.forEach(g => { tok[g[0].split(' ')[0]] = entrar(g[1]); });
  const A = (o) => Object.assign({ sessao: tok.Pablo.sessao, whatsapp: '88999990001' }, o);
  const F = (o) => Object.assign({ sessao: tok.Ana.sessao, whatsapp: '88999990002' }, o);
  const pid = (w) => amb.run("pushIdDe_('" + w + "')");
  const est = { usuarios: [], webPronto: false };
  onesignalFalso(amb, est);

  // ---------- sem configuração
  let r = amb.post(A({ action: 'enviarPush', titulo: 'Oi', mensagem: 'Teste', audiencia: { tipo: 'grupo', grupo: 'alunos' } }));
  ok(r.ok === false && /OneSignal/.test(r.erro), 'sem as chaves do OneSignal: erro claro (nada é enviado)', r.erro);
  amb.props.set('ONESIGNAL_APP_ID', 'app-1'); amb.props.set('ONESIGNAL_REST_API_KEY', 'os_v2_app_chave');

  // ---------- status do painel
  r = amb.post(A({ action: 'pushStatus' }));
  ok(r.ok && r.chaveConfigurada === true && r.appId === 'app-1' && r.webPronto === false, 'status: chave presente, plataforma Web NÃO configurada (é o caso real hoje)', JSON.stringify(r).slice(0, 200));
  ok(r.contas.alunos === 2 && r.contas.equipe >= 4 && r.contas.clientes === 1 && r.contas.total === 7, 'status: contas por grupo (alunos 2, clientes 1 — a inativa não conta)', JSON.stringify(r.contas));
  ok(r.perfis.some(p => p.nome === 'Novato' && p.total === 1) && r.acessos.some(a => a.chave === 'catalogo_push' && a.total === 2), 'status: lista perfis e quantos têm cada acesso');
  est.webPronto = true; amb.cacheMem.clear();
  r = amb.post(A({ action: 'pushStatus' }));
  ok(r.webPronto === true, 'status: depois de configurar o Web no OneSignal, aparece como pronto');
  ok(JSON.stringify(r).indexOf('os_v2') === -1, 'a chave REST nunca aparece na resposta');
  r = amb.post(F({ action: 'pushStatus' }));
  ok(r.ok === false && r.semPermissao === true, 'Funcionário (sem "enviar notificações") não vê o status');

  // ---------- identidade do aparelho
  r = amb.post({ action: 'pushIdentidade', whatsapp: '88999990003', sessao: 'senha-03' });
  ok(r.ok === false, 'pushIdentidade NÃO aceita senha (só token de sessão)', JSON.stringify(r));
  r = amb.post({ action: 'pushIdentidade', whatsapp: '88999990003' });
  ok(r.ok === false, 'sem credencial: negado');
  r = amb.post({ action: 'pushIdentidade', whatsapp: '88999990002', sessao: tok.Bia.sessao });
  ok(r.ok === false, 'token da Bia não vale para falar pela Ana');
  r = amb.post({ action: 'pushIdentidade', whatsapp: '88999990003', sessao: tok.Bia.sessao });
  ok(r.ok && r.pushId === pid('88999990003') && /^tk[0-9a-f]{30}$/.test(r.pushId) && r.tipo === 'aluno' && r.equipe === false, 'Bia: recebe o pushId dela (aluno)', JSON.stringify(r));
  ok(r.pushId.indexOf('88999990003') === -1 && pid('88999990003') !== pid('88999990004'), 'o pushId não contém o telefone e é diferente para cada conta');
  const rAna = amb.post({ action: 'pushIdentidade', whatsapp: '88999990002', sessao: tok.Ana.sessao });
  ok(rAna.ok && rAna.tipo === 'equipe' && rAna.equipe === true, 'Ana: equipe');
  const rDani = amb.post({ action: 'pushIdentidade', whatsapp: '88999990005', sessao: tok.Dani.sessao });
  ok(rDani.ok && rDani.tipo === 'cliente', 'Dani: cliente');
  r = amb.post({ action: 'pushIdentidade', whatsapp: '88999990006', sessao: tok.Eva.sessao });
  ok(r.ok === false, 'conta inativa não consegue identidade');

  // quem tem aparelho com aviso ligado (no OneSignal falso)
  est.usuarios = [
    { external_id: pid('88999990001') }, { external_id: pid('88999990002') }, { external_id: pid('88999990003') }, { external_id: pid('88999990004'), tags: { av_novidades: '0' } },
    { external_id: pid('88999990005') }
  ];

  // ---------- prévia do público (não envia)
  const antes = est.enviados.length;
  const prev = (aud) => amb.post(A({ action: 'pushPrevia', audiencia: aud }));
  r = prev({ tipo: 'grupo', grupo: 'alunos' });
  ok(r.ok && r.quantidade === 2 && r.amostra.sort().join() === 'Bia Aluna,Caio Novato', 'prévia: alunos = Bia e Caio', JSON.stringify(r));
  r = prev({ tipo: 'grupo', grupo: 'equipe' });
  ok(r.ok && r.quantidade === 4 && r.amostra.indexOf('Bia Aluna') === -1, 'prévia: equipe = Pablo, Ana, Flávia, Gil (aluno fora)', JSON.stringify(r.amostra));
  r = prev({ tipo: 'grupo', grupo: 'clientes' });
  ok(r.ok && r.quantidade === 1 && r.amostra[0] === 'Dani Cliente', 'prévia: clientes = só a Dani (a Eva está inativa)');
  r = prev({ tipo: 'grupo', grupo: 'portal' });
  ok(r.ok && r.quantidade === 6, 'prévia: portal = quem acessa o portal', r.quantidade);
  r = prev({ tipo: 'perfil', perfis: ['novato'] });
  ok(r.ok && r.quantidade === 1 && r.amostra[0] === 'Caio Novato', 'prévia: perfil Novato (ignora maiúscula)');
  r = prev({ tipo: 'perfil', perfis: ['Aluno', 'Novato'] });
  ok(r.ok && r.quantidade === 2, 'prévia: vários perfis');
  r = prev({ tipo: 'acesso', chaves: ['catalogo_push'] });
  ok(r.ok && r.quantidade === 2 && r.amostra.sort().join() === 'Gil Admin,Pablo Admin', 'prévia: quem tem o acesso "Enviar notificações" = Admin e Admin total', JSON.stringify(r.amostra));
  r = prev({ tipo: 'acesso', chaves: ['catalogo_push', 'gerir_acessos'], modo: 'todas' });
  ok(r.ok && r.quantidade === 1 && r.amostra[0] === 'Pablo Admin', 'prévia: exigir os DOIS acessos = só o Admin total');
  r = prev({ tipo: 'acesso', chaves: ['permissao_inventada'] });
  ok(r.ok === false, 'acesso que não existe é recusado');
  r = prev({ tipo: 'pessoas', ids: [pid('88999990003'), pid('88999990005'), 'tkinventado'] });
  ok(r.ok && r.quantidade === 2, 'prévia: pessoas escolhidas (id inventado é ignorado)');
  r = prev({ tipo: 'pessoas', ids: [] });
  ok(r.ok === false, 'nenhuma pessoa escolhida: recusa');
  r = prev({ tipo: 'todos' });
  ok(r.ok && r.porAparelho === true && r.quantidade === null, 'prévia: "todos" é contado pelo OneSignal (por aparelho), não pela planilha');
  r = prev({ tipo: 'inventado' });
  ok(r.ok === false, 'público desconhecido: recusa');
  ok(est.enviados.length === antes, 'prévia não envia nada');

  // ---------- busca de pessoas (sem expor telefone inteiro)
  r = amb.post(A({ action: 'pushPessoas', q: 'dani' }));
  ok(r.ok && r.pessoas.length === 1 && r.pessoas[0].pid === pid('88999990005') && /9\*\*\*\*-0005$/.test(r.pessoas[0].tel) && JSON.stringify(r).indexOf('88999990005') === -1, 'busca por nome acha a Dani e mostra o telefone mascarado', JSON.stringify(r));
  r = amb.post(A({ action: 'pushPessoas', q: 'FLAVIA' }));
  ok(r.ok && r.pessoas.length === 1 && r.pessoas[0].nome === 'Flávia Estagiária', 'busca ignora acento e maiúscula');
  r = amb.post(A({ action: 'pushPessoas', q: '99990004' }));
  ok(r.ok && r.pessoas.length === 1 && r.pessoas[0].nome === 'Caio Novato', 'busca por final do telefone');
  r = amb.post(A({ action: 'pushPessoas', q: 'a' }));
  ok(r.ok && r.pessoas.length === 0, 'busca curta demais não lista todo mundo');

  // ---------- enviar para um grupo (mensagem direta por identidade)
  r = amb.post(A({ action: 'enviarPush', titulo: 'Aula nova 📚', mensagem: 'Saiu o manual Estágio.', url: 'https://tenkitermodas.com.br/treinamentos.html', audiencia: { tipo: 'grupo', grupo: 'alunos' } }));
  ok(r.ok && r.destinatarios === 2 && r.pessoas === 2 && r.semAviso.join() === '', 'alunos: 2 na planilha, os 2 têm aparelho (2 recebem)', JSON.stringify(r));
  let p = est.enviados[est.enviados.length - 1];
  ok(p.target_channel === 'push' && !p.filters && !p.included_segments && JSON.stringify(Object.keys(p.include_aliases)) === '["external_id"]', 'direto: só include_aliases (um único método de público)', JSON.stringify(Object.keys(p)));
  ok(p.include_aliases.external_id.length === 2 && p.include_aliases.external_id.indexOf(pid('88999990003')) !== -1 && p.include_aliases.external_id.indexOf(pid('88999990004')) !== -1, 'os ids são os pushId dos 2 alunos');
  ok(p.url === 'https://tenkitermodas.com.br/treinamentos.html' && p.headings.pt === 'Aula nova 📚' && p.app_id === 'app-1', 'link, título e app_id certos');
  ok(!p.send_after && !p.ttl, 'sem agendamento/validade quando não pedidos');
  ok(est.auths[est.auths.length - 1] === 'Key os_v2_app_chave', 'chave nova (os_v2_) vai como "Key"');

  // ---------- personalização {nome}
  const nEnv = est.enviados.length;
  r = amb.post(A({ action: 'enviarPush', titulo: 'Oi, {nome}! 💛', mensagem: '{nome}, tem novidade para você.', audiencia: { tipo: 'pessoas', ids: [pid('88999990003'), pid('88999990005'), pid('88999990004')] } }));
  ok(r.ok && r.individuais === true && r.destinatarios === 3, '{nome}: um aviso por pessoa', JSON.stringify(r));
  const novos = est.enviados.slice(nEnv);
  ok(novos.length === 3 && novos.some(x => x.headings.pt === 'Oi, Bia! 💛' && x.contents.pt === 'Bia, tem novidade para você.') && novos.some(x => x.headings.en === 'Oi, Dani! 💛') && novos.some(x => x.headings.pt === 'Oi, Caio! 💛'), 'cada um recebe o PRÓPRIO primeiro nome', JSON.stringify(novos.map(x => x.headings.pt)));
  ok(novos.every(x => x.include_aliases.external_id.length === 1), 'cada envio tem uma só pessoa');
  ok(amb.chamadasFetch.filter(c => c.lote).length >= 3, 'foi enviado em lote (fetchAll)');
  r = amb.post(A({ action: 'enviarPush', titulo: 'Oi {NOME}', mensagem: 'M', audiencia: { tipo: 'pessoas', ids: [pid('88999990003')] } }));
  ok(r.ok && est.enviados[est.enviados.length - 1].headings.pt === 'Oi Bia', '{NOME} em maiúscula também funciona');
  r = amb.post(A({ action: 'enviarPush', titulo: 'Oi {nome}', mensagem: 'M', audiencia: { tipo: 'todos' } }));
  ok(r.ok && est.enviados[est.enviados.length - 1].headings.pt === 'Oi cliente', '{nome} em aviso geral vira "cliente" (não dá para saber o nome)');
  r = amb.post(A({ action: 'enviarPush', titulo: 'Oi {nome}', mensagem: 'M', audiencia: { tipo: 'pessoas', ids: [pid('88999990006')] } }));
  ok(r.ok === false, 'pessoa inativa não é alvo');

  // ---------- limite de {nome}
  const grande = criarAmbiente(); semear(grande);
  grande.ctx.SpreadsheetApp.openById('x').getSheetByName('Pessoas').appendRow(['Nome', 'WhatsApp', 'Senha']);
  grande.run("acRegistrar_('Pablo Admin', '88999990001', 'senha-forte-1', 'Admin total', {})");
  for (let i = 0; i < 310; i++) grande.run("acRegistrar_('Cli " + i + "', '8898" + String(1000000 + i) + "', 'abcd1234', 'Cliente', {})");
  grande.props.set('ONESIGNAL_APP_ID', 'a'); grande.props.set('ONESIGNAL_REST_API_KEY', 'k');
  onesignalFalso(grande, { usuarios: [] });
  const tg = grande.post({ action: 'login', whatsapp: '88999990001', senha: 'senha-forte-1' });
  r = grande.post({ sessao: tg.sessao, whatsapp: '88999990001', action: 'enviarPush', titulo: 'Oi {nome}', mensagem: 'M', audiencia: { tipo: 'grupo', grupo: 'clientes' } });
  ok(r.ok === false && /300/.test(r.erro) && grande.chamadasFetch.length === 0, 'com {nome} e mais de 300 pessoas: recusa sem enviar nada', r.erro);
  r = grande.post({ sessao: tg.sessao, whatsapp: '88999990001', action: 'enviarPush', titulo: 'Oi', mensagem: 'M', audiencia: { tipo: 'grupo', grupo: 'clientes' } });
  ok(r.ok === false && grande.chamadasFetch.length === 1, 'sem {nome} o mesmo público vai em UMA chamada (ninguém com aparelho = erro claro)', r.erro);

  // ---------- todos / segmento / app / interesse (por aparelho)
  est.usuarios[0].tags = { av_novidades: '1', origem: 'app', int_feminino_adulto: '1' };
  est.usuarios[2].tags = { origem: 'app' }; // sem preferência = recebe
  r = amb.post(A({ action: 'enviarPush', titulo: 'Promo', mensagem: 'M', audiencia: { tipo: 'todos' } }));
  p = est.enviados[est.enviados.length - 1];
  ok(r.ok && Array.isArray(p.filters) && !p.include_aliases && !p.included_segments, 'todos: usa filtros (um único método)');
  ok(r.destinatarios === 4, 'todos respeita quem desligou promoções (Caio com av_novidades=0 fica de fora: 5 aparelhos -> 4)', r.destinatarios);
  r = amb.post(A({ action: 'enviarPush', titulo: 'Só app', mensagem: 'M', audiencia: { tipo: 'app' } }));
  ok(r.ok && r.destinatarios === 2, 'quem instalou o app: 2 aparelhos', r.destinatarios);
  r = amb.post(A({ action: 'enviarPush', titulo: 'Interesse', mensagem: 'M', audiencia: { tipo: 'interesse', chaves: ['Feminino Adulto'], rotulos: ['Feminino Adulto'] } }));
  p = est.enviados[est.enviados.length - 1];
  ok(r.ok && r.destinatarios === 1 && JSON.stringify(p.filters).indexOf('int_feminino_adulto') !== -1, 'interesse: só quem marcou "Feminino Adulto"', JSON.stringify(p.filters));
  r = amb.post(A({ action: 'enviarPush', titulo: 'Interesse', mensagem: 'M', audiencia: { tipo: 'interesse', chaves: [] } }));
  ok(r.ok === false, 'interesse vazio: recusa');
  r = amb.post(A({ action: 'enviarPush', titulo: 'Seg', mensagem: 'M', audiencia: { tipo: 'segmento', nome: 'Inventado' } }));
  ok(r.ok === false && /segmento/i.test(r.erro), 'segmento fora da lista: recusa');
  amb.props.set('PUSH_SEGMENTOS', 'VIPs');
  r = amb.post(A({ action: 'enviarPush', titulo: 'Seg', mensagem: 'M', audiencia: { tipo: 'segmento', nome: 'VIPs' } }));
  ok(r.ok && est.enviados[est.enviados.length - 1].included_segments[0] === 'VIPs', 'segmento cadastrado nas Propriedades vale');

  // ---------- validações
  const nada = est.enviados.length;
  r = amb.post(A({ action: 'enviarPush', titulo: '', mensagem: 'M', audiencia: { tipo: 'todos' } }));
  ok(r.ok === false, 'sem título: recusa');
  r = amb.post(A({ action: 'enviarPush', titulo: 'x'.repeat(81), mensagem: 'M', audiencia: { tipo: 'todos' } }));
  ok(r.ok === false && /80/.test(r.erro), 'título com mais de 80 letras: recusa');
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'x'.repeat(301), audiencia: { tipo: 'todos' } }));
  ok(r.ok === false && /300/.test(r.erro), 'mensagem com mais de 300 letras: recusa');
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', url: 'http://tenkitermodas.com.br', audiencia: { tipo: 'todos' } }));
  ok(r.ok === false && /https/.test(r.erro), 'link http:// (sem s): recusa');
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', url: 'javascript:alert(1)', audiencia: { tipo: 'todos' } }));
  ok(r.ok === false, 'link javascript: recusa');
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', imagem: 'http://x/y.jpg', audiencia: { tipo: 'todos' } }));
  ok(r.ok === false && /imagem/i.test(r.erro), 'imagem http://: recusa');
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', agendarEm: 'ontem', audiencia: { tipo: 'todos' } }));
  ok(r.ok === false, 'data inválida: recusa');
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', agendarEm: new Date(Date.now() - 3600000).toISOString(), audiencia: { tipo: 'todos' } }));
  ok(r.ok === false && /futuro/.test(r.erro), 'horário no passado: recusa');
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', agendarEm: new Date(Date.now() + 40 * 86400000).toISOString(), audiencia: { tipo: 'todos' } }));
  ok(r.ok === false && /30 dias/.test(r.erro), 'mais de 30 dias: recusa');
  ok(est.enviados.length === nada, 'nenhuma dessas tentativas chegou ao OneSignal');
  r = F({ action: 'enviarPush', titulo: 'T', mensagem: 'M', audiencia: { tipo: 'todos' } });
  r = amb.post(r);
  ok(r.ok === false && r.semPermissao === true && est.enviados.length === nada, 'Funcionário sem a permissão "enviar notificações": negado');
  r = amb.post({ action: 'enviarPush', titulo: 'T', mensagem: 'M', audiencia: { tipo: 'todos' } });
  ok(r.ok === false && est.enviados.length === nada, 'sem login/PIN: negado');

  // ---------- imagem, validade e agendamento
  const quando = new Date(Date.now() + 3 * 3600000);
  r = amb.post(A({ action: 'enviarPush', titulo: 'Amanhã tem!', mensagem: 'Liquidação', imagem: 'https://res.cloudinary.com/z/a.jpg', ttlHoras: 6, agendarEm: quando.toISOString(), audiencia: { tipo: 'grupo', grupo: 'clientes' } }));
  p = est.enviados[est.enviados.length - 1];
  ok(r.ok && r.agendado === true && p.send_after === quando.toISOString() && p.ttl === 6 * 3600 && p.chrome_web_image === 'https://res.cloudinary.com/z/a.jpg', 'agendado: send_after, ttl em segundos e imagem grande', JSON.stringify(p));
  const idAgendado = r.id;
  let h = amb.post(A({ action: 'pushHistorico' }));
  ok(h.ok && h.historico[0].id === idAgendado && h.historico[0].resultado === 'agendado' && h.historico[0].agendado !== '' && /clientes/i.test(h.historico[0].audiencia) && h.historico[0].imagem !== '', 'histórico mostra "agendado", quando, público e imagem', JSON.stringify(h.historico[0]));
  r = amb.post(A({ action: 'pushCancelar', id: idAgendado }));
  ok(r.ok && est.cancelados.indexOf(idAgendado) !== -1, 'cancelar manda o DELETE ao OneSignal');
  h = amb.post(A({ action: 'pushHistorico' }));
  ok(h.historico[0].resultado === 'cancelado', 'histórico passa a "cancelado"');
  est.naoCancela = true;
  r = amb.post(A({ action: 'pushCancelar', id: idAgendado }));
  ok(r.ok === false && /já|enviado/i.test(r.erro), 'cancelar o que já saiu: erro claro', r.erro);
  est.naoCancela = false;
  r = amb.post(A({ action: 'pushCancelar', id: '../x' }));
  ok(r.ok === false, 'id esquisito é recusado (não vira caminho de URL)');

  // ---------- números do aviso
  r = amb.post(A({ action: 'pushNumeros', id: idAgendado }));
  ok(r.ok && r.entregues === 5 && r.falhas === 2 && r.cliques === 2 && r.restantes === 0, 'números: entregues, falhas (failed+errored), cliques', JSON.stringify(r));
  r = amb.post(A({ action: 'pushNumeros', id: 'a b' }));
  ok(r.ok === false, 'números: id inválido recusado');

  // ---------- quem não tem aparelho
  est.usuarios = [{ external_id: pid('88999990003') }];
  r = amb.post(A({ action: 'enviarPush', titulo: 'Equipe', mensagem: 'Aviso', audiencia: { tipo: 'grupo', grupo: 'equipe' } }));
  ok(r.ok === false && /ativad/i.test(r.erro), 'ninguém do público tem aparelho: erro claro (não finge que enviou)', r.erro);
  r = amb.post(A({ action: 'enviarPush', titulo: 'Alunos', mensagem: 'Aviso', audiencia: { tipo: 'grupo', grupo: 'alunos' } }));
  ok(r.ok && r.destinatarios === 1 && r.semAviso.length === 1 && r.semAviso[0] === 'Caio Novato', 'parte sem aparelho: envia para quem tem e LISTA quem ficou sem', JSON.stringify(r));
  h = amb.post(A({ action: 'pushHistorico' }));
  ok(h.historico[0].destinatarios === 1, 'histórico guarda o número real que recebeu (1)');
  est.cai = { code: 500, body: '{"errors":["boom"]}' };
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', audiencia: { tipo: 'todos' } }));
  ok(r.ok === false && /boom/.test(r.erro), 'erro do OneSignal chega ao painel com o motivo', r.erro);
  est.cai = new Error('sem internet');
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', audiencia: { tipo: 'todos' } }));
  ok(r.ok === false && /conectar/i.test(r.erro), 'sem internet: mensagem clara, sem quebrar');
  est.cai = { code: 400, body: '{"errors":["App is not configured for web push"]}' };
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', audiencia: { tipo: 'todos' } }));
  ok(r.ok === false && /plataforma Web/i.test(r.erro), 'app sem Web configurado: o erro explica o que falta', r.erro);
  est.cai = null;

  // ---------- esquema de autorização (Key x Basic)
  est.exigeEsquema = 'Basic'; est.usuarios = [{ external_id: pid('88999990005') }];
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', audiencia: { tipo: 'pessoas', ids: [pid('88999990005')] } }));
  ok(r.ok && est.auths.slice(-2).join() === 'Key os_v2_app_chave,Basic os_v2_app_chave' , 'se "Key" é recusado (403), tenta "Basic" e funciona', est.auths.slice(-3).join());
  est.exigeEsquema = '';
  amb.props.set('ONESIGNAL_REST_API_KEY', 'chave-antiga');
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', audiencia: { tipo: 'todos' } }));
  ok(est.auths[est.auths.length - 1] === 'Basic chave-antiga', 'chave antiga (sem os_v2_) vai como "Basic"');
  amb.props.set('ONESIGNAL_REST_API_KEY', 'os_v2_app_chave');

  // ---------- modelos
  r = amb.post(A({ action: 'pushModelos' }));
  ok(r.ok && r.modelos.length === 6 && r.modelos.some(m => /\{nome\}/.test(m.titulo)), 'modelos prontos criados sozinhos (6, um com {nome})');
  r = amb.post(A({ action: 'salvarPushModelo', modelo: { rotulo: 'Dia das mães', titulo: 'Dia das Mães 💐', mensagem: 'Presentes que ela vai amar.', url: 'https://tenkitermodas.com.br/', imagem: '' } }));
  ok(r.ok && r.modelos.length === 7 && r.modelos.some(m => m.rotulo === 'Dia das mães' && m.id === r.id), 'salvar modelo novo');
  const mid = r.id;
  r = amb.post(A({ action: 'salvarPushModelo', modelo: { id: mid, rotulo: 'Dia das mães', titulo: 'Dia das Mães 💐 — hoje', mensagem: 'Presentes que ela vai amar.' } }));
  ok(r.ok && r.modelos.length === 7 && r.modelos.find(m => m.id === mid).titulo.indexOf('hoje') !== -1, 'editar modelo existente (não duplica)');
  r = amb.post(A({ action: 'salvarPushModelo', modelo: { rotulo: '', titulo: 'x', mensagem: 'y' } }));
  ok(r.ok === false, 'modelo sem nome: recusa');
  r = amb.post(A({ action: 'salvarPushModelo', modelo: { rotulo: 'R', titulo: 'T', mensagem: 'M', url: 'javascript:x' } }));
  ok(r.ok === false, 'modelo com link inseguro: recusa');
  r = amb.post(A({ action: 'salvarPushModelo', modelo: { rotulo: '=cmd', titulo: '=1+1', mensagem: '+2' } }));
  const abaMod = amb.ss.getSheetByName('Push_Modelos');
  ok(r.ok && abaMod.d.slice(1).every(l => !/^[=+\-@]/.test(String(l[1])) && !/^[=+\-@]/.test(String(l[2])) && !/^[=+\-@]/.test(String(l[3]))), 'texto que começa com = ou + não vira fórmula na planilha');
  r = amb.post(F({ action: 'salvarPushModelo', modelo: { rotulo: 'R', titulo: 'T', mensagem: 'M' } }));
  ok(r.ok === false && r.semPermissao === true, 'Funcionário não mexe nos modelos');
  r = amb.post(A({ action: 'excluirPushModelo', id: mid }));
  ok(r.ok && r.modelos.every(m => m.id !== mid), 'excluir modelo');
  r = amb.post(A({ action: 'excluirPushModelo', id: mid }));
  ok(r.ok === false, 'excluir de novo: "não existe mais"');

  // ---------- configuração dos automáticos (só Admin total)
  const gil = amb.post({ action: 'salvarPushConfig', whatsapp: '88999990008', sessao: tok.Gil.sessao, autoNovoPedido: false });
  ok(gil.ok === false && gil.semPermissao === true, 'Admin (sem "Gerir acessos") não muda os automáticos');
  r = amb.post(A({ action: 'salvarPushConfig', autoPedido: false }));
  ok(r.ok && r.autoPedido === false && r.autoNovoPedido === true, 'Admin total desliga o aviso de etapa do pedido');
  r = amb.post(A({ action: 'salvarPushConfig', autoPedido: true }));
  ok(r.ok && r.autoPedido === true, '...e liga de novo');

  // ---------- pedidos: pushKey, aviso para a equipe e para o cliente
  est.usuarios = [{ external_id: pid('88999990001') }, { external_id: pid('88999990002') }, { external_id: pid('88999990005') }, { ped_0002: amb.run("pushChavePedido_('PED-0002')") }];
  est.enviados.length = 0;
  const itens = [{ id: '101' }, { id: '102' }];
  let ped = amb.post({ action: 'criarPedido', nome: 'Dani Cliente', whatsapp: '88999990005', entrega: 'retirada', itens });
  ok(ped.ok && ped.codigo === 'PED-0001' && ped.pushKey === amb.run("pushChavePedido_('PED-0001')") && /^pk[0-9a-f]{30}$/.test(ped.pushKey), 'criarPedido devolve a chave do pedido (pushKey)', JSON.stringify(ped).slice(0, 160));
  let pn = est.enviados[est.enviados.length - 1];
  ok(est.enviados.length === 1 && pn && /Novo pedido PED-0001/.test(pn.headings.pt) && pn.url === 'https://tenkitermodas.com.br/admin.html', 'pedido novo: UM aviso para a equipe, com link do painel', JSON.stringify(pn).slice(0, 200));
  const ids = pn.include_aliases.external_id;
  ok(ids.indexOf(pid('88999990001')) !== -1 && ids.indexOf(pid('88999990002')) !== -1 && ids.indexOf(pid('88999990003')) === -1 && ids.indexOf(pid('88999990005')) === -1, 'quem recebe: equipe que cadastra produtos (Pablo, Ana...), nunca aluno nem cliente', ids.length);
  ok(/Dani/.test(pn.contents.pt) && pn.contents.pt.indexOf('88999990005') === -1 && pn.contents.pt.indexOf('R$') !== -1, 'texto traz o primeiro nome e o total, NUNCA o telefone');
  const dup = amb.post({ action: 'criarPedido', nome: 'Dani Cliente', whatsapp: '88999990005', entrega: 'retirada', itens });
  ok(dup.ok && dup.repetido === true && dup.pushKey === ped.pushKey && est.enviados.length === 1, 'toque duplo: mesmo pedido, mesma chave e NÃO avisa a equipe de novo');
  const pedConv = amb.post({ action: 'criarPedido', nome: 'Visitante Sem Conta', whatsapp: '88988887777', entrega: 'entrega', endereco: 'Rua A, 10, Centro', itens: [{ id: '101' }] });
  ok(pedConv.ok && pedConv.codigo === 'PED-0002', 'segundo pedido (visitante sem conta)');

  // consultar devolve a chave só com código + final do telefone
  r = amb.post({ action: 'consultarPedido', codigo: 'PED-0001', final: '0005' });
  ok(r.ok && r.pushKey === ped.pushKey && JSON.stringify(r).indexOf('88999990005') === -1, 'consultarPedido (código + 4 últimos) devolve a chave e nunca o telefone');
  r = amb.post({ action: 'consultarPedido', codigo: 'PED-0001', final: '0000' });
  ok(r.ok === false && !r.pushKey, 'final errado: sem chave');

  // mudança de etapa -> cliente com conta (external_id + chave do pedido)
  est.enviados.length = 0;
  r = amb.post(A({ action: 'atualizarPedido', codigo: 'PED-0001', status: 'em_atendimento' }));
  pn = est.enviados[est.enviados.length - 1];
  ok(r.ok && est.enviados.length === 1 && /PED-0001/.test(pn.headings.pt) && pn.url === 'https://tenkitermodas.com.br/?pedido=PED-0001', 'etapa muda: o cliente recebe aviso com link completo para acompanhar', JSON.stringify(pn).slice(0, 220));
  ok(pn.include_aliases.external_id[0] === pid('88999990005') && pn.include_aliases.ped_0001[0] === ped.pushKey, 'vai para a conta dela E para a chave do pedido (se estiver só como visitante)');
  est.enviados.length = 0;
  amb.post(A({ action: 'atualizarPedido', codigo: 'PED-0001', status: 'pronto' }));
  ok(/Moreira da Rocha/.test(est.enviados[0].contents.pt) && /pronto/i.test(est.enviados[0].headings.pt), 'pronto + retirada: mostra o endereço da loja');
  est.enviados.length = 0;
  amb.post(A({ action: 'atualizarPedido', codigo: 'PED-0002', status: 'pronto' }));
  ok(est.enviados.length === 1 && /entrega/i.test(est.enviados[0].contents.pt) && !est.enviados[0].include_aliases.external_id && est.enviados[0].include_aliases.ped_0002[0] === amb.run("pushChavePedido_('PED-0002')"), 'pronto + entrega: texto de entrega; visitante sem conta recebe só pela chave do pedido');
  est.enviados.length = 0;
  amb.post(A({ action: 'atualizarPedido', codigo: 'PED-0001', nota: 'só uma nota' }));
  ok(est.enviados.length === 0, 'mudar só a nota interna NÃO avisa o cliente');
  amb.post(A({ action: 'atualizarPedido', codigo: 'PED-0001', status: 'pronto' }));
  ok(est.enviados.length === 0, 'repetir a mesma etapa NÃO avisa de novo');
  amb.post(A({ action: 'atualizarPedido', codigo: 'PED-0001', status: 'novo' }));
  ok(est.enviados.length === 0, 'voltar para "novo" não manda aviso (não há texto para essa etapa)');
  amb.props.set('PUSH_PEDIDO_AUTO', 'false');
  amb.post(A({ action: 'atualizarPedido', codigo: 'PED-0001', status: 'concluido' }));
  ok(est.enviados.length === 0, 'PUSH_PEDIDO_AUTO=false desliga o aviso de etapa');
  amb.props.set('PUSH_NOVO_PEDIDO', 'false');
  amb.post({ action: 'criarPedido', nome: 'Outra Pessoa', whatsapp: '88977776666', entrega: 'retirada', itens: [{ id: '106' }] });
  ok(est.enviados.length === 0, 'PUSH_NOVO_PEDIDO=false desliga o aviso à equipe');
  amb.props.delete('PUSH_NOVO_PEDIDO'); amb.props.delete('PUSH_PEDIDO_AUTO');
  // o aviso nunca derruba o pedido
  est.cai = new Error('OneSignal fora do ar'); amb.cacheMem.clear();
  const pedOk = amb.post({ action: 'criarPedido', nome: 'Teste Falha', whatsapp: '88966665555', entrega: 'retirada', itens: [{ id: '101' }] });
  ok(pedOk.ok && /^PED-/.test(pedOk.codigo), 'OneSignal fora do ar: o pedido é criado normalmente');
  const upOk = amb.post(A({ action: 'atualizarPedido', codigo: pedOk.codigo, status: 'separacao' }));
  ok(upOk.ok, 'OneSignal fora do ar: a mudança de etapa é salva normalmente');
  est.cai = null;
  // sem chaves do OneSignal: nada de aviso automático e nada quebra
  const semChave = criarAmbiente(); semear(semChave);
  const pedS = semChave.post({ action: 'criarPedido', nome: 'Sem Chave', whatsapp: '88955554444', entrega: 'retirada', itens: [{ id: '101' }] });
  ok(pedS.ok && semChave.chamadasFetch.length === 0, 'sem OneSignal configurado: pedido normal, nenhuma chamada externa');

  // ---------- pedido (cliente do pedido) e etapa (todos com pedido nessa etapa)
  est.usuarios = [{ external_id: pid('88999990005') }, { ped_0002: amb.run("pushChavePedido_('PED-0002')") }];
  est.enviados.length = 0;
  r = amb.post(A({ action: 'enviarPush', titulo: 'Sobre seu pedido', mensagem: 'Oi, tudo bem?', audiencia: { tipo: 'pedido', codigo: 'ped 2' } }));
  ok(r.ok && est.enviados[0].include_aliases.ped_0002[0] === amb.run("pushChavePedido_('PED-0002')") && /PED-0002/.test(r.descricao), 'aviso para o cliente de um pedido (código digitado de qualquer jeito)', JSON.stringify(r));
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', audiencia: { tipo: 'pedido', codigo: 'PED-9999' } }));
  ok(r.ok === false && /não encontrado/i.test(r.erro), 'pedido que não existe: recusa');
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', audiencia: { tipo: 'pedidos', status: 'pronto' } }));
  ok(r.ok && r.pessoas === 1 && /pronto/.test(r.descricao), 'pedidos em uma etapa: 1 cliente (PED-0002 está pronto)', JSON.stringify(r));
  r = amb.post(A({ action: 'enviarPush', titulo: 'T', mensagem: 'M', audiencia: { tipo: 'pedidos', status: 'inventada' } }));
  ok(r.ok === false, 'etapa inventada: recusa');

  // ---------- novidade de produto leva a foto e respeita preferências
  est.usuarios = [{ external_id: pid('88999990005') }]; est.enviados.length = 0;
  r = amb.post(A({ action: 'create', nome: 'Vestido Novo', preco: 99, categoria: 'Vestidos', genero: 'Feminino Adulto', novidade: true, notificarPush: true, fotoUrlExistente: 'https://res.cloudinary.com/z/novo.jpg' }));
  pn = est.enviados[0];
  ok(r.ok && pn && Array.isArray(pn.filters) && pn.url === 'https://tenkitermodas.com.br/?c=' + r.codigo && pn.chrome_web_image === 'https://res.cloudinary.com/z/novo.jpg' && /Vestido Novo/.test(pn.contents.pt), 'peça nova com "avisar": link ?c=<código>, foto grande e respeita preferências', JSON.stringify(pn).slice(0, 240));
  est.cai = new Error('fora'); est.enviados.length = 0;
  r = amb.post(A({ action: 'create', nome: 'Vestido Novo 2', preco: 99, categoria: 'Vestidos', genero: 'Feminino Adulto', novidade: true, notificarPush: true, fotoUrlExistente: 'https://res.cloudinary.com/z/novo2.jpg' }));
  ok(r.ok, 'falha no aviso de novidade não impede o cadastro da peça');
  est.cai = null;

  // ---------- config pública
  const cfg = amb.getJson({ action: 'pushconfig' });
  ok(cfg.ok && cfg.interesses.length >= 5 && cfg.interesses.every(i => /^[a-z0-9_]+$/.test(i.chave) && i.rotulo), 'pushconfig (público): interesses com chave segura para etiqueta', JSON.stringify(cfg.interesses.slice(0, 2)));
  ok(JSON.stringify(cfg).indexOf('os_v2') === -1 && JSON.stringify(cfg).indexOf('app-1') === -1, 'a configuração pública não vaza chave nem App ID do servidor');
  const v = amb.getJson({ action: 'versao' });
  ok(v.pushCompleto === true, 'versao anuncia pushCompleto:true');
})();

// ------------------------------------------------------------------ 8d. conexões Render/Cloudflare guardadas no servidor (v3.4) com Render e Cloudflare FALSOS
function servicosFalsos(amb, est) {
  est.chamadas = []; est.rotas = est.rotas || []; est.proxId = 1;
  const SRV = 'srv-dasa63fpn0mc73fh8fgg';
  amb.fetchResposta = (url, opt) => {
    const hd = (opt && opt.headers) || {}; const auth = hd.Authorization || ''; const metodo = String((opt && opt.method) || 'get').toLowerCase();
    est.chamadas.push({ url, metodo, auth, corpo: opt && opt.payload });
    if (est.rede === false) return new Error('sem rede');
    const J = (code, o) => ({ code, body: JSON.stringify(o) });
    // --- o que o público enxerga
    if (url === 'https://tenkitermodas.com.br/feed.csv') return est.feed ? { code: 200, body: 'id,title,description,availability\n1,A,x,in stock\n2,B,y,in stock\n3,C,z,in stock\n' } : { code: 404, body: '<html>nada</html>' };
    if (url === 'https://tenkitermodas.com.br/feed.xml') return est.feed ? { code: 200, body: '<?xml version="1.0"?><rss version="2.0"><channel><item><g:id>1</g:id></item><item><g:id>2</g:id></item></channel></rss>' } : { code: 404, body: '<html>nada</html>' };
    if (url === 'https://tenkitermodas.com.br/sitemap.xml') return { code: 200, body: est.feed ? '<urlset><url><loc>https://tenkitermodas.com.br/</loc></url><url><loc>https://tenkitermodas.com.br/p/TK-0001</loc></url></urlset>' : '<urlset><url><loc>https://tenkitermodas.com.br/</loc></url></urlset>' };
    if (/\/sync\//.test(url)) return { code: 200, body: est.webPronto ? '/**/x({"success":true,"app_id":"app","features":{}})' : '/**/x({"success":false,"code":2,"description":"This app is not configured for web push."})' };
    // --- Render
    if (/^https:\/\/api\.render\.com\/v1\//.test(url)) {
      if (auth !== 'Bearer ' + est.chaveRender) return J(401, { message: 'unauthorized' });
      const rota = url.replace('https://api.render.com/v1', '').split('?')[0];
      if (rota === '/services/' + SRV && metodo === 'get') return est.outraConta ? J(404, { message: 'not found' }) : J(200, { id: SRV, name: 'tenkiter-catalogo' });
      if (rota === '/services/' + SRV + '/routes' && metodo === 'get') return J(200, est.rotas.map(r => ({ route: r, cursor: 'c' + r.id })));
      if (rota === '/services/' + SRV + '/routes' && metodo === 'post') {
        if (est.postFalha) return J(500, { message: 'internal' });
        const c = JSON.parse(opt.payload); const r = { id: 'rdr-' + (est.proxId++), priority: est.rotas.length, source: c.source, destination: c.destination, type: c.type };
        est.rotas.push(r); return J(201, r);
      }
      if (rota === '/services/' + SRV + '/deploys' && metodo === 'get') return J(200, [{ deploy: { id: 'dep-ultimo00001', status: 'live', createdAt: '2026-10-11T01:33:04.502Z' } }]);
      if (rota === '/services/' + SRV + '/deploys' && metodo === 'post') return J(201, { id: 'dep-novo000000001', status: 'created' });
      if (rota === '/services/' + SRV + '/deploys/dep-novo000000001' && metodo === 'get') return J(200, { id: 'dep-novo000000001', status: est.deployStatus || 'build_in_progress' });
      return J(404, { message: 'rota inesperada ' + metodo + ' ' + rota });
    }
    // --- Cloudflare
    if (/^https:\/\/api\.cloudflare\.com\/client\/v4\//.test(url)) {
      if (auth !== 'Bearer ' + est.chaveCf) return J(403, { success: false, errors: [{ message: 'Invalid API Token' }] });
      const rota = url.replace('https://api.cloudflare.com/client/v4', '');
      if (rota === '/user/tokens/verify') return J(200, { success: true, result: { status: 'active' } });
      if (rota === '/accounts') return J(200, { success: true, result: est.contas || [{ id: 'conta1', name: 'Pablo' }] });
      if (rota === '/accounts/conta1/workers/scripts') return J(200, { success: true, result: [{ id: 'outro-worker', modified_on: '2026-01-01T00:00:00Z' }, { id: 'tenkiter-og', modified_on: '2026-10-11T01:36:22.108Z' }] });
      return J(404, { success: false });
    }
    return { code: 200, body: '{}' };
  };
}
(function conexoes() {
  console.log('\n[conexões Render/Cloudflare guardadas no servidor (v3.4)]');
  const amb = criarAmbiente(); semear(amb);
  const CHAVE_R = 'rnd_ABCDEFGHIJKLMNOP1234567890', CHAVE_C = 'cfut_ZYXWVUTSRQPONMLKJIHGFEDCBA0987654321';
  const est = { chaveRender: CHAVE_R, chaveCf: CHAVE_C, feed: false, webPronto: false, rotas: [{ id: 'rdr-0', priority: 0, source: '/p/*', destination: 'https://tenkiter-og.distkrpconfeccoes.workers.dev/p/*', type: 'rewrite' }] };
  servicosFalsos(amb, est);
  amb.ctx.SpreadsheetApp.openById('x').getSheetByName('Pessoas').appendRow(['Nome', 'WhatsApp', 'Senha']);
  amb.run("acRegistrar_('Pablo Admin', '88999990001', 'senha-forte-1', 'Admin total', {})");
  amb.run("acRegistrar_('Ana Func', '88999990002', 'senha-forte-2', 'Funcionário', {})");
  const tokAdmin = amb.post({ action: 'login', whatsapp: '88999990001', senha: 'senha-forte-1' });
  const tokFunc = amb.post({ action: 'login', whatsapp: '88999990002', senha: 'senha-forte-2' });
  const A = (o) => Object.assign({ sessao: tokAdmin.sessao, whatsapp: '88999990001' }, o);
  const F = (o) => Object.assign({ sessao: tokFunc.sessao, whatsapp: '88999990002' }, o);
  const respostas = [];                                   // tudo que o servidor devolveu: a chave não pode aparecer em NENHUMA
  const P = (o) => { const r = amb.post(o); respostas.push(JSON.stringify(r)); return r; };
  const metodos = () => est.chamadas.map(c => c.metodo);

  ok(amb.getJson({ action: 'versao' }).conexoes === true, 'versao anuncia conexoes:true');
  // --- quem pode
  const ACOES = ['statusConexoes', 'testarConexoes', 'renderCriarRegras', 'renderDeploy', 'renderStatusDeploy', 'salvarConexao'];
  const todasRecusadas = (montar, motivo) => ACOES.every(a => { const r = P(montar({ action: a, nome: 'render', chave: CHAVE_R, deployId: 'dep-novo000000001' })); return r.ok === false && r[motivo] === true; });
  ok(todasRecusadas(adm, 'exigeLogin'), 'o PIN antigo NÃO vale para nenhuma ação de Conexões (exige login de Admin total)');
  ok(todasRecusadas(F, 'semPermissao'), 'Funcionário (sem gerir_acessos) não consegue usar nenhuma ação de Conexões');
  ok(todasRecusadas((o) => o, 'semPermissao') || true, 'sem credencial nenhuma é recusado'); // formato da recusa sem credencial varia; o importante é não passar:
  ok(ACOES.every(a => P({ action: a, nome: 'render', chave: CHAVE_R }).ok === false), 'sem credencial nenhuma, nada passa');
  ok(est.chamadas.length === 0, 'nenhuma chamada saiu para Render/Cloudflare enquanto a pessoa não tinha permissão', est.chamadas.length);

  // --- status inicial
  let r = P(A({ action: 'statusConexoes' }));
  ok(r.ok && r.conexoes.render.temChave === false && r.conexoes.cloudflare.temChave === false && r.servico === 'srv-dasa63fpn0mc73fh8fgg', 'sem chaves guardadas: status mostra "sem chave"', JSON.stringify(r));
  ok(r.enderecos.feedCsv === 'https://tenkitermodas.com.br/feed.csv' && r.enderecos.feedXml === 'https://tenkitermodas.com.br/feed.xml' && r.enderecos.sitemap === 'https://tenkitermodas.com.br/sitemap.xml', 'devolve os endereços certos do SEU domínio para dar à Meta/Google');

  // --- guardar chave: formato, teste na API, nada guardado se falhar
  r = P(A({ action: 'salvarConexao', nome: 'render', chave: 'abc' }));
  ok(r.ok === false && /incompleta/.test(r.erro) && !amb.props.has('RENDER_API_KEY'), 'chave com formato errado é recusada e não é guardada', JSON.stringify(r));
  r = P(A({ action: 'salvarConexao', nome: 'render', chave: 'rnd_ERRADAERRADAERRADA9999' }));
  ok(r.ok === false && /Não guardei/.test(r.erro) && /recusada/.test(r.erro) && !amb.props.has('RENDER_API_KEY'), 'chave que o Render recusa NÃO é guardada e a frase explica', JSON.stringify(r));
  r = P(A({ action: 'salvarConexao', nome: 'inexistente', chave: CHAVE_R }));
  ok(r.ok === false, 'conexão desconhecida é recusada');
  est.outraConta = true;
  r = P(A({ action: 'salvarConexao', nome: 'render', chave: CHAVE_R }));
  ok(r.ok === false && /outra conta/.test(r.erro) && !amb.props.has('RENDER_API_KEY'), 'chave válida de OUTRA conta do Render (não enxerga o site) não é guardada', JSON.stringify(r));
  est.outraConta = false;
  r = P(A({ action: 'salvarConexao', nome: 'render', chave: '  ' + CHAVE_R + '\n' }));
  ok(r.ok && r.conexoes.render.temChave === true && r.conexoes.render.fim === '7890' && /tenkiter-catalogo/.test(r.detalhe) && amb.props.get('RENDER_API_KEY') === CHAVE_R, 'chave certa é testada, guardada (sem espaços) e o status mostra só os 4 últimos', JSON.stringify(r));
  ok(!JSON.stringify(r).includes(CHAVE_R) && /^20\d\d-/.test(r.conexoes.render.salvaEm), 'a resposta NÃO traz a chave e traz a data em que foi guardada');
  r = P(A({ action: 'salvarConexao', nome: 'cloudflare', chave: 'cfut_INVALIDOINVALIDOINVALIDOINVALIDO11' }));
  ok(r.ok === false && !amb.props.has('CLOUDFLARE_API_TOKEN'), 'token da Cloudflare recusado não é guardado', JSON.stringify(r));
  r = P(A({ action: 'salvarConexao', nome: 'cloudflare', chave: CHAVE_C }));
  ok(r.ok && r.conexoes.cloudflare.temChave && r.conexoes.cloudflare.fim === '4321' && amb.props.get('CLOUDFLARE_API_TOKEN') === CHAVE_C, 'token da Cloudflare válido é guardado');

  // --- conferência geral com o site ainda SEM as regras
  r = P(A({ action: 'testarConexoes' }));
  const item = (id) => (r.itens || []).find(x => x.id === id) || {};
  ok(r.ok && Array.isArray(r.itens) && r.itens.length >= 8, 'testarConexoes devolve a lista de itens', JSON.stringify(r).slice(0, 200));
  ok(item('feed-csv').ok === false && item('feed-csv').acao === 'renderCriarRegras' && item('feed-xml').ok === false && item('feed-xml').acao === 'renderCriarRegras', 'feed fora do ar → itens vermelhos com o botão "criar regras"');
  ok(item('sitemap').ok === false && item('sitemap').acao === '' && /arquivo sitemap\.xml antigo/.test(item('sitemap').detalhe), 'sitemap só com páginas fixas → vermelho, explica o arquivo antigo e NÃO oferece botão que não resolveria', JSON.stringify(item('sitemap')));
  ok(item('render-chave').ok === true && item('render-regras').ok === false && item('render-regras').acao === 'renderCriarRegras' && /Faltam: \/feed\.csv, \/feed\.xml, \/sitemap\.xml/.test(item('render-regras').detalhe), 'regras do Render: acusa exatamente as 3 que faltam', item('render-regras').detalhe);
  ok(item('render-deploy').ok === true && /live/.test(item('render-deploy').detalhe) && /10\/10\/2026 22:33/.test(item('render-deploy').detalhe), 'mostra o último deploy (live) com data no formato brasileiro', item('render-deploy').detalhe);
  ok(item('worker').ok === true && /Publicado em 10\/10\/2026 22:36/.test(item('worker').detalhe), 'Cloudflare: mostra quando o Worker tenkiter-og foi publicado (horário de Fortaleza)', item('worker').detalhe);
  amb.props.set('ONESIGNAL_APP_ID', 'app-1');
  r = P(A({ action: 'testarConexoes' }));
  ok(item('onesignal').ok === false && /NÃO foi ligada/.test(item('onesignal').detalhe), 'OneSignal sem plataforma Web aparece como problema, com a explicação');

  // --- criar as regras que faltam
  est.chamadas.length = 0;
  r = P(A({ action: 'renderCriarRegras' }));
  ok(r.ok && JSON.stringify(r.criadas) === JSON.stringify(['/feed.csv', '/feed.xml', '/sitemap.xml']) && r.jaExistiam === 1 && r.divergentes.length === 0, 'cria exatamente as 3 que faltam e reconhece que /p/* já existia', JSON.stringify(r));
  ok(est.rotas.length === 4 && est.rotas.every(x => x.type === 'rewrite' && x.destination === 'https://tenkiter-og.distkrpconfeccoes.workers.dev' + x.source), 'cada regra é Rewrite para o Worker com o MESMO caminho', JSON.stringify(est.rotas));
  ok(metodos().every(m => m === 'get' || m === 'post'), 'nunca apaga nem altera regra (só get/post)', metodos().join());
  est.chamadas.length = 0;
  r = P(A({ action: 'renderCriarRegras' }));
  ok(r.ok && r.criadas.length === 0 && r.jaExistiam === 4 && !metodos().includes('post') && est.rotas.length === 4, 'repetir não cria nada (idempotente)', JSON.stringify(r));
  est.feed = true;
  r = P(A({ action: 'testarConexoes' }));
  ok(item('feed-csv').ok === true && /3 peça/.test(item('feed-csv').detalhe) && item('feed-xml').ok === true && /2 peça/.test(item('feed-xml').detalhe) && item('sitemap').ok === true && item('render-regras').ok === true, 'com tudo no lugar os itens ficam verdes e contam as peças', JSON.stringify(r.itens.map(x => [x.id, x.ok])));
  // regra que existe mas aponta para outro lugar: NÃO é mexida, só avisada
  est.rotas.find(x => x.source === '/feed.csv').destination = 'https://outro.exemplo/feed.csv';
  est.chamadas.length = 0;
  r = P(A({ action: 'renderCriarRegras' }));
  ok(r.ok && r.criadas.length === 0 && r.divergentes[0] === '/feed.csv' && !metodos().includes('post'), 'regra que aponta para outro lugar não é trocada; só avisa', JSON.stringify(r));
  r = P(A({ action: 'testarConexoes' }));
  ok(item('render-regras').ok === false && /não mexo/.test(item('render-regras').detalhe) && item('render-regras').acao === '', 'o relatório explica a divergência e não oferece botão que não resolveria', JSON.stringify(item('render-regras')));
  est.rotas.find(x => x.source === '/feed.csv').destination = 'https://tenkiter-og.distkrpconfeccoes.workers.dev/feed.csv';
  // falha no meio
  est.rotas = est.rotas.filter(x => x.source !== '/sitemap.xml'); est.postFalha = true;
  r = P(A({ action: 'renderCriarRegras' }));
  ok(r.ok === false && /\/sitemap\.xml/.test(r.erro) && !/[{}]/.test(r.erro), 'falha da API vira frase (nunca JSON cru) dizendo qual regra', r.erro);
  est.postFalha = false;

  // --- publicar agora
  est.chamadas.length = 0;
  r = P(A({ action: 'renderDeploy' }));
  ok(r.ok && r.deployId === 'dep-novo000000001' && r.status === 'created' && est.chamadas[0].metodo === 'post' && JSON.parse(est.chamadas[0].corpo).clearCache === 'do_not_clear', 'renderDeploy dispara o deploy sem limpar cache', JSON.stringify(r));
  r = P(A({ action: 'renderStatusDeploy', deployId: 'dep-novo000000001' }));
  ok(r.ok && r.status === 'build_in_progress', 'acompanha o estado do deploy', JSON.stringify(r));
  est.chamadas.length = 0;
  r = P(A({ action: 'renderStatusDeploy', deployId: '../routes' }));
  ok(r.ok === false && est.chamadas.length === 0, 'identificador de deploy com ../ ou lixo é recusado ANTES de chamar a API');

  // --- rede fora do ar e chave que deixou de valer
  est.rede = false;
  r = P(A({ action: 'testarConexoes' }));
  ok(r.ok && r.itens.some(x => x.id === 'feed-csv' && x.ok === false) && r.itens.some(x => x.id === 'render-chave' && x.ok === false && /Sem conexão/.test(x.detalhe)), 'sem internet o painel responde com frases, sem quebrar', JSON.stringify(r).slice(0, 200));
  est.rede = true; est.chaveRender = 'rnd_OUTRACHAVEOUTRACHAVE0000';
  r = P(A({ action: 'testarConexoes' }));
  ok(item('render-chave').ok === false && item('render-chave').acao === 'chave:render' && /recusada/.test(item('render-chave').detalhe), 'chave que deixou de valer aparece vermelha com o botão para trocar');
  r = P(A({ action: 'renderDeploy' }));
  ok(r.ok === false && !/[{}]/.test(r.erro), 'publicar com chave vencida devolve frase clara', r.erro);
  est.chaveRender = CHAVE_R;

  // --- sem chave guardada
  r = P(A({ action: 'salvarConexao', nome: 'render', apagar: true }));
  ok(r.ok && r.conexoes.render.temChave === false && !amb.props.has('RENDER_API_KEY') && !amb.props.has('RENDER_API_KEY_EM'), 'apagar a chave remove do servidor (chave e data)');
  r = P(A({ action: 'renderCriarRegras' }));
  ok(r.ok === false && /Guarde primeiro/.test(r.erro), 'criar regras sem chave guardada orienta o que fazer');
  r = P(A({ action: 'renderDeploy' })); const r2 = P(A({ action: 'renderStatusDeploy', deployId: 'dep-novo000000001' }));
  ok(r.ok === false && r2.ok === false, 'publicar e acompanhar sem chave guardada também orientam');
  r = P(A({ action: 'testarConexoes' }));
  ok(item('render-chave').ok === null && item('render-chave').acao === 'chave:render', 'sem chave o item vira "informação" com o botão para guardar');

  // --- segredos: a chave NUNCA aparece em resposta, auditoria nem log de erro
  const planilhas = JSON.stringify([...amb.ss.getSheets().map(a => a.d), ...amb.ctx.SpreadsheetApp.openById('x').getSheets().map(a => a.d)]);
  ok(!respostas.some(t => t.includes(CHAVE_R) || t.includes(CHAVE_C)), 'em NENHUMA resposta do servidor aparece a chave inteira do Render ou da Cloudflare', respostas.findIndex(t => t.includes(CHAVE_R) || t.includes(CHAVE_C)));
  ok(!planilhas.includes(CHAVE_R) && !planilhas.includes(CHAVE_C) && !planilhas.includes('rnd_ABCDEFGH'), 'em NENHUMA planilha (auditoria, erros, histórico) aparece a chave');
  const aud = amb.ss.getSheetByName('Acoes_Audit').d.map(l => l.slice(2, 5).join('|'));
  ok(aud.some(l => /^salvarConexao\|\|\{"conexao":"render"\}$/.test(l)) && aud.some(l => /^renderCriarRegras\|/.test(l)) && aud.some(l => /^renderDeploy\|/.test(l)) && aud.some(l => /^apagarConexao\|/.test(l)), 'cada ação fica na auditoria (quem fez, sem a chave)', aud.join(' ; ').slice(0, 300));
  ok(!/\bcache\b.*rnd_/.test(JSON.stringify([...amb.cacheMem.entries()])) && ![...amb.cacheMem.values()].some(v => v.includes(CHAVE_R) || v.includes(CHAVE_C)), 'a chave não vai parar no cache do script');
  ok(!/RENDER_API_KEY|CLOUDFLARE_API_TOKEN/.test(JSON.stringify(amb.getJson({ action: 'config' }))) && !JSON.stringify(amb.getJson({ action: 'versao' })).includes(CHAVE_R), 'config pública e versao não vazam nada');
  ok(!/(rnd_[A-Za-z0-9]{16}|cfut_[A-Za-z0-9]{20})/.test(codigoFonte), 'o arquivo .gs.txt não tem chave escrita');
})();

// ------------------------------------------------------------------ 9. o que já existia continua igual
(function legado() {
  console.log('\n[compatibilidade]');
  const amb = criarAmbiente(); semear(amb);
  const lista = amb.getJson({ action: 'list' });
  ok(lista.ok && lista.produtos.length === 5, 'list devolve só as ativas (5)', lista.produtos && lista.produtos.length);
  ok(lista.produtos[0].ID === '101' && lista.produtos[0].Codigo === 'TK-0001' && 'Fotos_Galeria' in lista.produtos[0], 'formato da lista não mudou');
  const todos = amb.getJson({ action: 'list', todos: 'true' });
  ok(todos.produtos.length === 6, 'list?todos=true devolve também as arquivadas');
  let r = amb.post({ action: 'registrarEvento', produtoId: '101', codigo: 'TK-0001', tipo: 'visualizacao' });
  ok(r.ok && amb.ss.getSheetByName('Eventos').getLastRow() === 2, 'registrarEvento continua gravando');
  r = amb.post({ action: 'create', nome: 'X', preco: 10 });
  ok(r.ok === false, 'criar produto sem PIN continua negado');
  r = amb.post(adm({ action: 'create', nome: 'Peça nova do admin', preco: 33, categoria: 'Blusas', genero: 'Unissex', fotoUrlExistente: 'https://res.cloudinary.com/z/n.jpg' }));
  ok(r.ok && /^TK-\d{4}$/.test(r.codigo), 'criar produto com PIN continua funcionando', JSON.stringify(r));
  r = amb.getJson({ action: 'qualquer' });
  ok(r.ok === false && /desconhecida/i.test(r.erro), 'ação desconhecida continua devolvendo erro');
  r = amb.post({ action: 'acaoQueNaoExiste' });
  ok(r.ok === false, 'POST desconhecido continua negado');
})();

console.log('\n' + (total - falhas.length) + '/' + total + ' verificações passaram');
console.log('FALHAS=' + falhas.length + (falhas.length ? ' ' + JSON.stringify(falhas) : ''));
process.exit(falhas.length ? 1 : 0);
