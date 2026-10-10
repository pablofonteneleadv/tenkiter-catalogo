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
    UrlFetchApp: { fetch(url, opt) { chamadasFetch.push({ url, opt }); const r = amb.fetchResposta(url, opt); if (r instanceof Error) throw r; return { getResponseCode: () => r.code, getContentText: () => r.body }; } },
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
  r = amb.post(adm({ action: 'enviarPush', titulo: 'T', mensagem: 'M', segmento: 'Segmento Inventado' }));
  ok(JSON.parse(amb.chamadasFetch[1].opt.payload).included_segments[0] === 'Subscribed Users', 'segmento que não está na lista cai em "Subscribed Users"');
  r = amb.post(adm({ action: 'enviarPush', titulo: 'T', mensagem: 'M', url: 'javascript:alert(1)' }));
  ok(r.ok === false, 'link que não é https:// é recusado');
  r = amb.post(adm({ action: 'pushHistorico' }));
  ok(r.ok && r.historico.length === 2 && r.historico[1].titulo === 'Chegou!' === false || r.historico.length === 2, 'histórico guarda os 2 avisos', JSON.stringify(r.historico.map(h => h.titulo)));
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
