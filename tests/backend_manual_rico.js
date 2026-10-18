#!/usr/bin/env node
/* v3.17 (RH): manual com formatação rica + prova-modelo junto com o manual. Google Docs / Drive / planilha SIMULADOS.
 * Confere: cores, marca-texto, negrito por trecho, links, foto ao lado do texto (Quebrar texto, em linha, tabela 1x2),
 * vídeo, citação, tabela, hash que IGNORA aparência, degraus do "manual grande demais", guia ignorado pelo site,
 * manual novo com Doc de prova (10 questões-modelo que o leitor da prova entende) e que NÃO vão ao ar sozinhas. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.resolve(__dirname, '..');
const RAIZ_GS = fs.readdirSync(RAIZ).some(f => /^funcionario-codigo-\d+\.\d+\.gs\.txt$/.test(f)) ? RAIZ : path.resolve(RAIZ, '..', 'tenkiter-cofre');
const ver = f => f.match(/(\d+)\.(\d+)/).slice(1).map(Number);
const arqs = fs.readdirSync(RAIZ_GS).filter(f => /^funcionario-codigo-\d+\.\d+\.gs\.txt$/.test(f)).sort((a, b) => ver(a)[0] - ver(b)[0] || ver(a)[1] - ver(b)[1]);
const ARQ = arqs[arqs.length - 1], fonte = fs.readFileSync(path.join(RAIZ_GS, ARQ), 'utf8');
let falhas = [], total = 0;
function ok(c, n, d) { total++; if (!c) { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? '  (' + JSON.stringify(d).slice(0, 400) + ')' : '')); } else console.log('  ✔ ' + n); }

/* ---------- planilha simulada ---------- */
class Aba {
  constructor(n) { this.nome = n; this.d = []; }
  get ncols() { return this.d.reduce((m, r) => Math.max(m, r.length), 0); }
  appendRow(r) { this.d.push(r.slice()); } getLastRow() { return this.d.length; } getLastColumn() { return this.ncols; }
  getDataRange() { const n = this.ncols; return { getValues: () => this.d.map(r => { const c = r.slice(); while (c.length < n) c.push(''); return c; }) }; }
  getRange(r, c, nr, nc) { nr = nr || 1; nc = nc || 1; const s = this; return {
    getValues() { const o = []; for (let i = 0; i < nr; i++) { const l = []; for (let j = 0; j < nc; j++) { const v = (s.d[r - 1 + i] || [])[c - 1 + j]; l.push(v === undefined ? '' : v); } o.push(l); } return o; },
    getValue() { return this.getValues()[0][0]; }, setValue(v) { s._set(r, c, v); return this; },
    setValues(m) { m.forEach((l, i) => l.forEach((v, j) => s._set(r + i, c + j, v))); return this; }, setNumberFormat() { return this; }, setDataValidation() { return this; } }; }
  _set(r, c, v) { while (this.d.length < r) this.d.push([]); const l = this.d[r - 1]; while (l.length < c) l.push(''); l[c - 1] = v; }
  hideSheet() {} deleteRow(r) { this.d.splice(r - 1, 1); }
}
const ss = { abas: [], getSheetByName(n) { return this.abas.find(a => a.nome === n) || null; }, insertSheet(n) { const a = new Aba(n); this.abas.push(a); return a; }, getSheets() { return this.abas; } };

/* ---------- Google Docs simulado (lê e escreve) ---------- */
const ET = { PARAGRAPH: 'PARAGRAPH', LIST_ITEM: 'LIST_ITEM', TABLE: 'TABLE', INLINE_IMAGE: 'INLINE_IMAGE', TEXT: 'TEXT', RICH_LINK: 'RICH_LINK', HORIZONTAL_RULE: 'HR' };
const HEAD = { NORMAL: 'NORMAL', HEADING1: 'H1', HEADING2: 'H2', HEADING3: 'H3', TITLE: 'TITLE', SUBTITLE: 'SUBTITLE' };
const HA = { CENTER: 'CENTER', RIGHT: 'RIGHT', LEFT: 'LEFT' };
class Texto {
  constructor(par) { this.p = par; }
  getText() { return this.p.texto; }
  _attrs(i) { return this.p.attrs[i] || {}; }
  getTextAttributeIndices() {
    const out = []; let ant = null;
    for (let i = 0; i < this.p.texto.length; i++) { const sig = JSON.stringify(this._attrs(i)); if (sig !== ant) { out.push(i); ant = sig; } }
    return out;
  }
  isBold(i) { if (i === undefined) { const t = this.p.texto.length; if (!t) return false; let v = null; for (let k = 0; k < t; k++) { const b = !!this._attrs(k).b; if (v === null) v = b; else if (v !== b) return null; } return v; } return !!this._attrs(i).b; }
  isItalic(i) { return !!this._attrs(i).i; } isUnderline(i) { return !!this._attrs(i).u; } isStrikethrough(i) { return !!this._attrs(i).s; }
  getForegroundColor(i) { return this._attrs(i).c || '#000000'; } getBackgroundColor(i) { return this._attrs(i).h || null; }
  getLinkUrl(i) { return this._attrs(i).a || null; }
  _set(a, b, k, v) { for (let i = a; i <= b; i++) { this.p.attrs[i] = Object.assign({}, this.p.attrs[i] || {}); if (v === undefined || v === false || v === null) delete this.p.attrs[i][k]; else this.p.attrs[i][k] = v; } return this; }
  setBold(a, b, v) { if (typeof a === 'boolean') return this._set(0, this.p.texto.length - 1, 'b', a); return this._set(a, b, 'b', v); }
  setItalic(a, b, v) { if (typeof a === 'boolean') return this._set(0, this.p.texto.length - 1, 'i', a); return this._set(a, b, 'i', v); }
  setForegroundColor(a, b, c) { return this._set(a, b, 'c', String(c).toLowerCase()); }
  setBackgroundColor(a, b, c) { return this._set(a, b, 'h', String(c).toLowerCase()); }
}
class Par {
  constructor(texto, o) { this.tipo = ET.PARAGRAPH; this.texto = texto || ''; this.head = HEAD.NORMAL; this.attrs = []; this.filhos = []; this.posic = []; this.alin = HA.LEFT; Object.assign(this, o || {}); }
  getType() { return this.tipo; } asParagraph() { return this; } asListItem() { return this; }
  getText() { return this.texto; } getHeading() { return this.head; } setHeading(h) { this.head = h; return this; }
  editAsText() { return new Texto(this); } getAlignment() { return this.alin; }
  getNumChildren() { return this.filhos.length ? this.filhos.length : (this.texto ? 1 : 0); }
  getChild(i) {
    if (!this.filhos.length) return { getType: () => ET.TEXT, asText: () => new Texto(this) };
    const f = this.filhos[i];
    return { getType: () => f.t, asText: () => ({ getText: () => f.texto || '' }), asInlineImage: () => f.img, asRichLink: () => ({ getUrl: () => f.url }) };
  }
  getPositionedImages() { return this.posic; }
  getNestingLevel() { return this.nivel || 0; } setNestingLevel(n) { this.nivel = n; return this; } setGlyphType() { return this; }
}
class Celula { constructor(pars) { this.pars = pars; } getNumChildren() { return this.pars.length; } getChild(i) { return this.pars[i]; } getText() { return this.pars.map(p => p.texto).join('\n'); } }
class Linha { constructor(cels) { this.cels = cels; } getNumCells() { return this.cels.length; } getCell(i) { return this.cels[i]; } }
class Tabela { constructor(linhas) { this.tipo = ET.TABLE; this.linhas = linhas; } getType() { return this.tipo; } asTable() { return this; } getNumRows() { return this.linhas.length; } getRow(i) { return this.linhas[i]; } }
class Corpo {
  constructor() { this.el = []; this.largura = 595; this.ml = 28; this.mr = 28; }
  getNumChildren() { return this.el.length; } getChild(i) { return this.el[i]; }
  getPageWidth() { return this.largura; } getMarginLeft() { return this.ml; } getMarginRight() { return this.mr; }
  clear() { this.el = []; return this; }
  appendParagraph(t) { const p = new Par(t); this.el.push(p); return p; }
  appendListItem(t) { const p = new Par(t, { tipo: ET.LIST_ITEM }); this.el.push(p); return p; }
  appendHorizontalRule() { this.el.push({ getType: () => ET.HORIZONTAL_RULE }); }
}
const DOCS = {};
let contaDoc = 0;
const docFalso = (id) => { const body = new Corpo(); return { id, body, getBody: () => body, getId: () => id, saveAndClose() {} }; };
const DocumentApp = { ElementType: ET, ParagraphHeading: HEAD, HorizontalAlignment: HA,
  create: (titulo) => { const d = docFalso('doc' + (++contaDoc)); d.titulo = titulo; DOCS[d.id] = d; return d; },
  openById: (id) => DOCS[id] };
const ARQUIVOS = [];
const DriveApp = { Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 },
  getFoldersByName: () => ({ hasNext: () => true, next: () => ({ createFile: (blob) => { const f = { getId: () => 'img' + (ARQUIVOS.push(blob)), setSharing() {} }; return f; } }) }),
  createFolder: () => null };

const ctx = { console, Date, JSON, Math, String, Number, Array, Object, RegExp, parseInt, parseFloat, isNaN, Error, DocumentApp, DriveApp,
  Logger: { log() {} }, SpreadsheetApp: { openById: () => ss, getActiveSpreadsheet: () => ss, newDataValidation: () => ({ requireCheckbox() { return this; }, build() { return {}; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {}, getAll: () => ({}), putAll() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {} }) },
  Utilities: { formatDate: () => '2026-10-18T10:00:00', getUuid: () => 'u', computeDigest: (alg, txt) => { let h = 0; for (const ch of String(txt)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return [h & 255, (h >> 8) & 255, (h >> 16) & 255, (h >> 24) & 255]; },
    base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64'), computeHmacSha256Signature: () => [1], DigestAlgorithm: { MD5: 1 } },
  Session: { getScriptTimeZone: () => 'America/Fortaleza' }, ContentService: { MimeType: {}, createTextOutput: t => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }) } };
vm.createContext(ctx); vm.runInContext(fonte, ctx, { filename: ARQ });
const run = e => vm.runInContext(e, ctx);
const J = o => JSON.parse(o._t);
console.log('Arquivo testado: ' + ARQ);

const novoDoc = (fn) => { const d = DocumentApp.create('t'); fn(d.body); return d.id; };
const H1 = (b, t) => { const p = b.appendParagraph(t); p.head = HEAD.HEADING1; return p; };
const H2 = (b, t) => { const p = b.appendParagraph(t); p.head = HEAD.HEADING2; return p; };
const analisar = (id) => { ctx.__id = id; return JSON.parse(JSON.stringify(run('analisarDocManual_(__id)'))); };
const blocos = (parts) => parts.reduce((a, pt) => a.concat(...pt.chapters.map(c => c.blocks)), []);
const pintar = (p, ini, fim, k, v) => { for (let i = ini; i <= fim; i++) { p.attrs[i] = Object.assign({}, p.attrs[i] || {}); p.attrs[i][k] = v; } };

console.log('\n[versão e bandeiras]');
ok(/-- v3\.\d+$/.test(fonte.split('\n')[0]), 'cabeçalho traz a versão');
const vj = J(run('doGet({ parameter: { action: "versao" } })'));
ok(vj.manualRico === true && vj.provaModelo === true, 'versao anuncia manualRico e provaModelo', vj);
ok(fonte.split('\n')[0].endsWith('-- v' + vj.versao) && ARQ.indexOf(vj.versao) !== -1, 'nome do arquivo, cabeçalho e versao batem (' + vj.versao + ')');

console.log('\n[texto simples não muda]');
let id = novoDoc(b => { H1(b, 'Parte'); H2(b, 'Lição'); b.appendParagraph('Texto simples.'); b.appendParagraph('Tudo em negrito.').editAsText().setBold(true); });
let bl = blocos(analisar(id));
ok(JSON.stringify(bl[0]) === '{"type":"p","text":"Texto simples.","bold":false}', 'parágrafo sem formatação sai IGUAL ao de antes (sem runs, sem al)', bl[0]);
ok(JSON.stringify(bl[1]) === '{"type":"p","text":"Tudo em negrito.","bold":true}', 'parágrafo todo em negrito: bold:true e sem runs', bl[1]);

console.log('\n[cor, marca-texto, negrito por trecho, links]');
id = novoDoc(b => {
  H1(b, 'Parte'); H2(b, 'Lição');
  const p = b.appendParagraph('Abertura: conferência rápida com negrito, vermelho e amarelo.');
  const ixn = p.texto.indexOf('negrito'), ixv = p.texto.indexOf('vermelho');
  pintar(p, ixn, ixn + 6, 'b', true); pintar(p, ixv, ixv + 7, 'c', '#ff0000'); pintar(p, 0, 8, 'h', '#ffff00');
  const q = b.appendParagraph('Veja o site oficial agora.'); pintar(q, 8, 17, 'a', 'https://tenkitermodas.com.br'); pintar(q, 8, 17, 'u', true); pintar(q, 8, 17, 'c', '#1155cc');
  const r = b.appendParagraph('Tudo negrito e vermelho'); pintar(r, 0, 22, 'b', true); pintar(r, 14, 22, 'c', '#cc0000');
  const n = b.appendParagraph('Preto e branco são normais'); pintar(n, 0, 4, 'c', '#000000'); pintar(n, 10, 15, 'c', '#ffffff'); pintar(n, 17, 20, 'c', '#333333');
  const e = b.appendParagraph('Itálico e tachado 😀'); pintar(e, 0, 5, 'i', true); pintar(e, 9, 14, 's', true);
});
bl = blocos(analisar(id));
let r0 = bl[0].runs;
ok(r0 && r0[0].t === 'Abertura:' && r0[0].h === '#ffff00', 'marca-texto amarelo no começo vira h', r0);
ok(r0.some(x => x.b === 1 && x.t.indexOf('negrito') >= 0), 'negrito por trecho vira b', r0);
ok(r0.some(x => x.c === '#ff0000' && /vermelho/.test(x.t)), 'cor da letra vira c', r0);
ok(r0.map(x => x.t).join('') === bl[0].text, 'os trechos juntos dão exatamente o texto do parágrafo', r0.map(x => x.t).join(''));
const rq = bl[1].runs;
ok(rq && rq.some(x => x.a === 'https://tenkitermodas.com.br') && !rq.some(x => x.u || x.c), 'link guarda só o endereço (sublinhado/azul automáticos do Docs não viram estilo)', rq);
const rt = bl[2];
ok(rt.bold === true && rt.runs && rt.runs.every(x => !x.b) && rt.runs.some(x => x.c === '#cc0000'), 'parágrafo todo em negrito + cor: bold:true e runs sem repetir o b', rt);
ok(!bl[3].runs, 'preto, branco e cinza escuro NÃO viram cor (o site cuida do tema escuro)', bl[3]);
ok(bl[4].runs && bl[4].runs.some(x => x.i === 1) && bl[4].runs.some(x => x.s === 1) && bl[4].text.indexOf('😀') > 0, 'itálico, tachado e emoji continuam', bl[4]);

console.log('\n[alinhamento]');
id = novoDoc(b => { H1(b, 'P'); H2(b, 'L'); b.appendParagraph('Centro').alin = HA.CENTER; b.appendParagraph('Direita').alin = HA.RIGHT; b.appendParagraph('Esquerda'); });
bl = blocos(analisar(id));
ok(bl[0].al === 'c' && bl[1].al === 'r' && bl[2].al === undefined, 'centralizado e à direita viram al; esquerda não grava nada', bl.map(x => x.al));

console.log('\n[fotos: Quebrar texto, em linha e em tabela]');
const img = (w, h) => ({ getBlob: () => ({ w }), getWidth: () => w, getHeight: () => h });
const pos = (w, off, layout) => Object.assign(img(w, w * 2), { getLeftOffset: () => off, getLayout: () => layout });
id = novoDoc(b => {
  H1(b, 'P'); H2(b, 'L');
  b.appendParagraph('Texto ao lado da foto da esquerda.').posic = [pos(160, 0, 'WRAP_TEXT')];
  b.appendParagraph('Texto ao lado da foto da direita.').posic = [pos(160, 330, 'WRAP_TEXT')];
  b.appendParagraph('Foto que quebra o texto.').posic = [pos(160, 0, 'BREAK_BOTH')];
  b.appendParagraph('Foto enorme.').posic = [pos(480, 0, 'WRAP_TEXT')];
  b.appendParagraph('Foto antes do texto na mesma linha').filhos = [{ t: ET.INLINE_IMAGE, img: img(120, 200) }, { t: ET.TEXT, texto: 'Foto antes do texto na mesma linha' }];
  b.appendParagraph('Texto e depois a foto').filhos = [{ t: ET.TEXT, texto: 'Texto e depois a foto' }, { t: ET.INLINE_IMAGE, img: img(120, 200) }];
  const so = b.appendParagraph(''); so.filhos = [{ t: ET.INLINE_IMAGE, img: img(300, 200) }];
});
bl = blocos(analisar(id));
const imgs = bl.filter(x => x.type === 'img');
ok(imgs.length === 7 && imgs[0].side === 'left' && imgs[1].side === 'right', 'Quebrar texto: foto à esquerda e à direita guardam o lado', imgs.map(x => x.side));
ok(imgs[0].pct >= 25 && imgs[0].pct <= 35, 'e a largura relativa (160 de ~539 pt ≈ 30%)', imgs[0].pct);
ok(imgs[2].side === 'full' && imgs[3].side === 'full', 'foto que quebra o texto, ou larga demais (>60%), fica em linha própria (full)', imgs.map(x => x.side));
ok(imgs[4].side === 'left' && imgs[5].side === 'right', 'foto em linha ANTES do texto vai à esquerda; DEPOIS do texto, à direita', imgs.map(x => x.side));
ok(imgs[6].side === undefined && imgs[6].width === 300, 'foto sozinha na linha continua um bloco comum (sem side)', imgs[6]);
const ordem = bl.map(x => x.type + (x.side ? ':' + x.side : '')).slice(0, 4);
ok(JSON.stringify(ordem) === JSON.stringify(['img:left', 'p', 'img:right', 'p']), 'a foto vem ANTES do texto dela (o site faz o texto contornar)', ordem);
ok(/^https:\/\/lh3\.googleusercontent\.com\/d\/img\d+$/.test(imgs[0].src), 'a foto é salva no Drive e vira endereço público', imgs[0].src);

id = novoDoc(b => {
  H1(b, 'P'); H2(b, 'L');
  const fotoCel = new Celula([Object.assign(new Par(''), { filhos: [{ t: ET.INLINE_IMAGE, img: img(150, 260) }] })]);
  const txtCel = new Celula([new Par('Seu dia tem três momentos:'), Object.assign(new Par('Abertura: conferência'), { tipo: ET.LIST_ITEM })]);
  b.el.push(new Tabela([new Linha([fotoCel, txtCel])]));
  b.el.push(new Tabela([new Linha([new Celula([new Par('Hora')]), new Celula([new Par('O quê')])]), new Linha([new Celula([new Par('8h')]), new Celula([new Par('Abrir a loja')])])]));
});
bl = blocos(analisar(id));
ok(bl[0].type === 'img' && bl[0].side === 'left' && bl[1].type === 'p' && bl[1].text === 'Seu dia tem três momentos:' && bl[2].type === 'bul', 'tabela de 1 linha com foto à esquerda e texto à direita = foto ao lado do texto', bl.map(x => x.type + (x.side || '')));
ok(bl[3].type === 'table' && JSON.stringify(bl[3].rows) === JSON.stringify([['Hora', 'O quê'], ['8h', 'Abrir a loja']]), 'tabela comum vira bloco table (antes sumia)', bl[3]);

console.log('\n[vídeo]');
const so1 = (t, extra) => { const idv = novoDoc(b => { H1(b, 'P'); H2(b, 'L'); const p = b.appendParagraph(t); if (extra) extra(p); }); return blocos(analisar(idv)); };
let v = so1('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
ok(v[0].type === 'video' && v[0].kind === 'yt' && v[0].id === 'dQw4w9WgXcQ', 'link do YouTube sozinho vira vídeo', v);
v = so1('Vídeo: https://youtu.be/dQw4w9WgXcQ?t=5');
ok(v[0].type === 'video' && v[0].id === 'dQw4w9WgXcQ', '"Vídeo:" na frente também vale (youtu.be)', v);
v = so1('https://www.youtube.com/shorts/abcdefghijk');
ok(v[0].kind === 'yt' && v[0].vertical === 1, 'Shorts é vertical', v);
v = so1('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view?usp=sharing');
ok(v[0].kind === 'drive' && v[0].id === '1AbCdEfGhIjKlMnOpQr', 'vídeo do Google Drive', v);
v = so1('https://vimeo.com/123456789');
ok(v[0].kind === 'vimeo' && v[0].id === '123456789', 'Vimeo', v);
v = so1('https://midia.exemplo.com/aula.mp4');
ok(v[0].kind === 'mp4' && v[0].src === 'https://midia.exemplo.com/aula.mp4', 'arquivo .mp4', v);
v = so1('Assista ao vídeo da aula', p => { pintar(p, 0, 22, 'a', 'https://youtu.be/dQw4w9WgXcQ'); });
ok(v[0].type === 'p', 'texto qualquer com link no meio NÃO vira vídeo (continua parágrafo com link)', v[0].type);
v = so1('Vídeo da aula', p => { pintar(p, 0, 12, 'a', 'https://youtu.be/dQw4w9WgXcQ'); });
ok(v[0].type === 'p' && v[0].runs && v[0].runs[0].a, 'link com texto livre fica como link no parágrafo (o site mostra o link clicável)', v[0]);
v = so1('Veja também https://example.com/pagina para saber mais');
ok(v[0].type === 'p', 'URL no meio de uma frase continua texto', v[0]);
v = so1('', p => { p.filhos = [{ t: ET.RICH_LINK, url: 'https://youtu.be/dQw4w9WgXcQ' }]; });
ok(v.length === 1 && v[0].type === 'video', 'chip inteligente do YouTube (link rico) também vira vídeo', v);
v = so1('https://site.com/pagina');
ok(v[0].type === 'p', 'endereço que não é vídeo continua parágrafo', v[0]);

console.log('\n[citação, lista e o que vem antes do 1º Título 1]');
id = novoDoc(b => {
  b.appendParagraph('Título do documento').head = HEAD.TITLE;
  b.appendParagraph('Texto de apresentação que o site ignora.');
  H1(b, 'Parte'); H2(b, 'L');
  const q = b.appendParagraph('> Frase em destaque'); pintar(q, 2, 6, 'b', true);
  const it = b.appendListItem('Item com cor'); pintar(it, 5, 7, 'c', '#00aa00');
  b.appendParagraph('Subtítulo').head = HEAD.SUBTITLE;
});
let parts = analisar(id);
bl = blocos(parts);
ok(parts.length === 1 && !JSON.stringify(parts).includes('apresentação'), 'tudo antes do 1º Título 1 continua ignorado');
ok(bl[0].type === 'quote' && bl[0].text === 'Frase em destaque' && bl[0].runs && bl[0].runs.map(x => x.t).join('') === 'Frase em destaque', 'citação "> " perde o "> " também nos trechos', bl[0]);
ok(bl[1].type === 'bul' && bl[1].runs && bl[1].runs.some(x => x.c === '#00aa00'), 'item de lista guarda a cor', bl[1]);
ok(bl[2].type === 'quote', 'estilo Subtítulo continua citação');

console.log('\n[hash ignora aparência]');
const hash = (b) => { ctx.__b = b; return run('manHash_(__b)'); };
const base = [{ type: 'p', text: 'Olá mundo', bold: false }, { type: 'img', src: 'https://x/y', width: 10, height: 20 }];
const rico = [{ type: 'p', text: 'Olá mundo', bold: false, runs: [{ t: 'Olá', c: '#ff0000' }, { t: ' mundo' }], al: 'c' }, { type: 'img', src: 'https://x/y', width: 10, height: 20, side: 'left', pct: 30 }];
ok(hash(base) === hash(rico), 'cor, alinhamento, lado e largura da foto NÃO mudam o hash (ninguém precisa reler)');
ok(hash(base) !== hash([{ type: 'p', text: 'Olá mundo!', bold: false }, base[1]]), 'mudar o texto muda o hash');
ok(hash(base) !== hash([{ type: 'p', text: 'Olá mundo', bold: true }, base[1]]), 'e virar negrito de parágrafo inteiro também (campo antigo bold continua contando)');
ok(run('JSON.stringify(manHash_([{type:"p",text:"a",bold:false}]) === manHash_([{type:"p",text:"a",bold:false}]))') === 'true', 'mesmo conteúdo, mesmo hash');

console.log('\n[manual grande demais: degraus]');
const bigRuns = []; for (let i = 0; i < 60; i++) bigRuns.push({ t: 'palavra' + i + ' ', c: '#ff0000', h: '#ffff00', a: 'https://exemplo.com/' + i });
const grande = () => ({ parts: [{ title: 'P', chapters: [{ title: 'C', blocks: Array.from({ length: 40 }, (_, i) => ({ type: 'p', text: 'x'.repeat(120) + i, bold: false, runs: bigRuns.slice(0, 20).map((r, k) => Object.assign({ b: k % 2 ? 1 : undefined }, r)) })) }] }] });
ctx.__g = grande().parts; run('manSimplificarBlocos_(__g, 1)');
const n1 = ctx.__g[0].chapters[0].blocks[0].runs;
ok(n1 && n1.every(x => !x.c && !x.h && !x.a) && n1.some(x => x.b === 1), 'degrau 1 tira cor, marca-texto e link e mantém negrito', n1 && n1.slice(0, 2));
ctx.__g = grande().parts; run('manSimplificarBlocos_(__g, 2)');
ok(!('runs' in ctx.__g[0].chapters[0].blocks[0]) && ctx.__g[0].chapters[0].blocks[0].text.length > 100, 'degrau 2 tira todos os trechos e o texto fica inteiro');

console.log('\n[sincronizar: manual pequeno, depois manual grande]');
const manuais = new Aba('Manuais'); manuais.appendRow(['Id', 'Titulo', 'Blurb', 'Nivel', 'DocId', 'Ordem', 'PartsJSON', 'AtualizadoEm', 'ProvaDocId', 'ProvaJSON', 'ProvaEm']);
ctx.__man = manuais; run('getManuaisSheet_ = function () { return __man; }; exigirPerm_ = function () { return { ok: true, usuario: { name: "Pablo", whatsapp: "859" } }; };');
manuais.appendRow(['m1', 'Teste', '', 1, id, 1, '[]', '', '', '', '']);
let sr = J(run('sincronizarManual_({ manualId: "m1" })'));
ok(sr.ok && sr.aviso === '' && manuais.d[1][6].length > 10, 'sincroniza normal, sem aviso', sr.aviso);
const docGrande = novoDoc(b => { H1(b, 'P'); H2(b, 'C'); for (let i = 0; i < 40; i++) { const p = b.appendParagraph(('palavra' + i + ' ').repeat(25)); for (let k = 0; k < 25; k++) { const a = k * ('palavra' + i + ' ').length; pintar(p, a, a + 5, 'c', '#ff0000'); pintar(p, a + 1, a + 4, 'h', '#ffff00'); } } });
manuais.d[1][4] = docGrande; manuais.d[1][6] = '[]';
sr = J(run('sincronizarManual_({ manualId: "m1" })'));
const salvo = manuais.d[1][6];
ok(sr.ok && /tirei cores/.test(sr.aviso) && salvo.length <= 45000 && salvo.indexOf('#ff0000') === -1, 'manual grande: tira cor/marca-texto, avisa e salva sem perder texto', { aviso: sr.aviso, tam: salvo.length });
ok(JSON.parse(salvo)[0].chapters[0].blocks.length === 40 && JSON.parse(salvo)[0].chapters[0].blocks[39].text.indexOf('palavra39') === 0, 'todos os 40 parágrafos continuam lá');

console.log('\n[manual novo: guia + exemplo + Doc da prova com 10 questões-modelo]');
manuais.d.length = 1; contaDoc += 0;
const cr = J(run('criarManualVazio_({ titulo: "Atendimento 1", blurb: "b", nivelMinimo: 2 })'));
ok(cr.ok && cr.docUrl && cr.prova && cr.prova.ok && cr.prova.modelo === true && cr.prova.perguntas === 10, 'criar manual já cria o Doc da prova com 10 questões-modelo', cr);
const linhaM = manuais.d[1];
ok(linhaM[6] === '[]', 'o exemplo do manual NÃO vai ao ar (parts continua vazio até sincronizar)', linhaM[6]);
ok(linhaM[8] && !linhaM[9] && !linhaM[10], 'prova: Doc ligado ao manual, mas SEM perguntas na planilha e sem "sincronizada em" (nenhum aluno vê prova ainda)', linhaM.slice(8));
const docManual = DOCS[linhaM[4]];
const tit = docManual.body.el.filter(e => e.head === HEAD.TITLE).length, h1 = docManual.body.el.findIndex(e => e.head === HEAD.HEADING1);
ok(tit === 1 && h1 > 3, 'o Doc do manual começa com o guia (Título do documento + linhas) ANTES do 1º Título 1', { tit, h1 });
const guiaTexto = docManual.body.el.slice(0, h1).map(e => e.texto || '').join('\n');
ok(/Quebrar texto/.test(guiaTexto) && /Checagem:/.test(guiaTexto) && /Relaxa:/.test(guiaTexto) && /Vídeo/.test(guiaTexto) && /Sincronizar manual/.test(guiaTexto), 'o guia explica foto ao lado, vídeo, Faça agora, Checagem, caixas e como sincronizar');
parts = analisar(linhaM[4]); bl = blocos(parts);
ok(parts.length === 1 && parts[0].chapters.length === 1 && !JSON.stringify(parts).includes('GUIA DE FORMATAÇÃO'), 'lendo esse Doc de novo: o guia é IGNORADO e sobra 1 parte com 1 lição de exemplo', parts.map(p => p.chapters.length));
const ex = bl[0];
ok(ex.runs && ex.runs.some(x => x.b) && ex.runs.some(x => x.c === '#c0392b') && ex.runs.some(x => x.h === '#fff176'), 'a lição de exemplo mostra negrito, cor e marca-texto', ex.runs);
ok(bl.some(x => /^Faça agora:/.test(x.text)) && bl.some(x => /^Checagem:/.test(x.text)) && bl.filter(x => /^(Relaxa|Atenção|Dica|Exemplo|Regra de ouro):/.test(x.text)).length === 5, 'e traz Faça agora, Checagem e as 5 caixas coloridas', bl.map(x => (x.text || '').slice(0, 12)));

const docProva = DOCS[linhaM[8]];
const linhasProva = docProva.body.el.filter(e => e.getType() !== ET.HORIZONTAL_RULE).map(e => ({ texto: e.texto || '', negrito: !!(e.attrs.length && e.attrs.every(a => a && a.b)) }));
ctx.__lp = linhasProva; const pp = JSON.parse(JSON.stringify(run('provaParse_(__lp)')));
ok(pp.perguntas.length === 10 && pp.avisos.length === 0, 'o leitor da prova entende as 10 questões-modelo sem nenhum aviso', { n: pp.perguntas.length, avisos: pp.avisos });
const nOp = pp.perguntas.map(q => q.options.length);
ok(Math.min(...nOp) === 2 && Math.max(...nOp) === 6 && [3, 4, 5].every(n => nOp.indexOf(n) >= 0), 'o modelo mostra de 2 a 6 alternativas', nOp);
ok(pp.perguntas.filter(q => /^\[CRÍTICA\]/.test(q.q)).length === 1, 'uma pergunta [CRÍTICA] de exemplo');
ok(pp.perguntas.every(q => /Modelo\)/.test(q.q)) && pp.perguntas.every(q => q.correct >= 0 && q.correct < q.options.length), 'todas marcadas "(Modelo)" e com a certa dentro das alternativas');
ok(/ATENÇÃO: as perguntas abaixo são um MODELO/.test(linhasProva.map(l => l.texto).join('\n')), 'o Doc avisa que é modelo e que não aparece para ninguém antes de sincronizar');

// sincronizar a prova do modelo: funciona e AVISA que ainda são modelo
const sp = J(run('provaSincronizarAcao_({ manualId: "' + linhaM[0] + '" })'));
ok(sp.ok && sp.perguntas === 10 && sp.modelo === 10, 'sincronizar o modelo sem editar publica, mas avisa que as 10 ainda são do modelo', sp);
// manual com prova já existente não é refeito
const cr2 = J(run('provaCriarDocDoManual_("' + linhaM[0] + '")') ? { _t: JSON.stringify(run('provaCriarDocDoManual_("' + linhaM[0] + '")')) } : { _t: '{}' });
ok(cr2.jaExistia === true, 'pedir o Doc da prova de novo devolve o que já existe (não cria outro)', cr2);

console.log('\n[manuais antigos: criar o Doc da prova continua igual]');
manuais.appendRow(['2', 'Semente', '', 2, '', 2, '[]', '', '', '', '']);
const crs = run('provaCriarDocDoManual_("2")');
ok(crs.ok && crs.perguntas > 0 && crs.modelo === false, 'manual-semente com perguntas antigas continua levando as perguntas dele (não o modelo)', crs);

console.log('\n' + (total - falhas.length) + '/' + total + ' verificações passaram');
console.log('FALHAS=' + falhas.length);
process.exit(falhas.length ? 1 : 0);
