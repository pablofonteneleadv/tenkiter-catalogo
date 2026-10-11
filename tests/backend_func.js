#!/usr/bin/env node
/* Testa o BACKEND de Funcionários/Acessos (funcionario-codigo-*.gs.txt) com planilha SIMULADA: vários perfis por pessoa (v3.2) e as travas da v3.1. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.resolve(__dirname, '..');
const arqs = fs.readdirSync(RAIZ).filter(f => /^funcionario-codigo-\d+\.\d+\.gs\.txt$/.test(f)).sort((a, b) => { const p = x => x.match(/(\d+)\.(\d+)/).slice(1).map(Number); return p(a)[0] - p(b)[0] || p(a)[1] - p(b)[1]; });
const ARQ = arqs[arqs.length - 1], fonte = fs.readFileSync(path.join(RAIZ, ARQ), 'utf8');
let falhas = [], total = 0;
function ok(c, n, d) { total++; if (!c) { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); } else console.log('  ✔ ' + n); }
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
const ctx = { console, Date, JSON, Math, String, Number, Array, Object, RegExp, parseInt, parseFloat, isNaN, Error,
  Logger: { log() {} }, SpreadsheetApp: { openById: () => ss, getActiveSpreadsheet: () => ss, newDataValidation: () => ({ requireCheckbox() { return this; }, build() { return {}; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {}, getAll: () => ({}), putAll() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {} }) },
  Utilities: { formatDate: () => '2026-10-11T10:00:00', getUuid: () => 'u', computeDigest: () => [1], computeHmacSha256Signature: () => [1], DigestAlgorithm: {} },
  Session: { getScriptTimeZone: () => 'America/Fortaleza' }, ContentService: { MimeType: {}, createTextOutput: t => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }) } };
vm.createContext(ctx); vm.runInContext(fonte, ctx, { filename: ARQ });
const run = e => vm.runInContext(e, ctx);
console.log('Arquivo testado: ' + ARQ);
const chaves = run('acChaves_()');
const aba = ss.insertSheet('Pessoas');
aba.appendRow(['nome', 'whatsapp', 'senha', 'nivel', 'status', 'perfil'].concat(chaves.map(k => 'perm_' + k)));
const pessoa = (nome, w, perfil) => { const l = [nome, w, 'x', 1, 'Ativo', perfil]; chaves.forEach(() => l.push('')); aba.appendRow(l); };
pessoa('Admin Um', '85991047615', 'Admin total'); pessoa('Admin Dois', '85992222222', 'Admin total'); pessoa('Cris Cliente', '85993333333', 'Cliente');
const perfilDe = w => run('acLinhasDoWhats_("' + w + '")')[0];
const permsDe = w => { ctx.__l = perfilDe(w); return run('acPermsDaLinha_(__l)'); };
const definir = (w, lista, quem) => { ctx.__q = quem; ctx.__lista = lista; return run('acessosDefinirPerfilSemTrava_("' + w + '", __lista, __q)'); };
const EU = { name: 'Admin Um', whatsapp: '85991047615' }, OUTRO = { name: 'Terceiro', whatsapp: '85990000000' };

console.log('\n[vários perfis]');
let r = definir('85993333333', ['Aluno', 'Equipe do site'], EU);
ok(r.ok && r.perfil === 'Cliente, Aluno, Equipe do site', 'cliente vira Aluno + Equipe do site (Cliente continua junto)', r);
let p = permsDe('85993333333');
ok(p.portal && p.catalogo_cadastrar && p.cliente, 'recebe a SOMA: portal (Aluno) + cadastrar (Equipe do site) + cliente', p);
ok(!p.gerir_acessos && !p.catalogo_excluir, 'e não ganha o que nenhum perfil dá (gerir acessos / excluir)');
r = definir('85993333333', ['Equipe do site'], EU);
p = permsDe('85993333333');
ok(r.ok && r.perfil === 'Cliente, Equipe do site' && !p.portal && p.catalogo_cadastrar, 'tirar o Aluno tira só o que era dele (portal), mantém o resto', { r, p });
r = definir('85993333333', 'Cliente, Funcionário', EU);
ok(r.ok && r.perfil === 'Cliente, Funcionário', 'também aceita texto separado por vírgula (compatível)', r);
r = definir('85993333333', ['Cliente'], EU);
p = permsDe('85993333333');
ok(r.ok && r.perfil === 'Cliente' && !p.portal && !p.catalogo_cadastrar && p.cliente, 'só Cliente: volta a ser só cliente', { r, p });
r = definir('85993333333', [], EU); ok(!r.ok && /pelo menos um perfil/.test(r.erro), 'lista vazia é recusada', r);
r = definir('85993333333', ['Aluno', 'Inventado'], EU); ok(!r.ok && /desconhecido/.test(r.erro), 'perfil que não existe é recusado e nada muda', r);
ok(perfilDe('85993333333').perfil === 'Cliente', 'depois da recusa o perfil continua o mesmo');

console.log('\n[caixinhas em branco herdam a soma]');
const L = perfilDe('85993333333'); aba.d[L.__row - 1][5] = 'Cliente, Aluno, Equipe do site'; chaves.forEach((k, i) => { aba.d[L.__row - 1][6 + i] = ''; });
p = permsDe('85993333333');
ok(p.portal && p.catalogo_cadastrar, 'linha com perfil "A, B" e caixinhas vazias: vale a soma', p);
aba.d[L.__row - 1][6 + chaves.indexOf('portal')] = false;
ok(permsDe('85993333333').portal === false && permsDe('85993333333').catalogo_cadastrar === true, 'caixinha desmarcada à mão ainda vale por cima do perfil');

console.log('\n[travas continuam]');
r = definir('85991047615', ['Funcionário'], EU); ok(!r.ok && /próprio acesso/.test(r.erro), 'Admin total não rebaixa a PRÓPRIA conta (nem com vários perfis)', r);
r = definir('85991047615', ['Aluno', 'Funcionário'], EU); ok(!r.ok, 'nem combinando perfis sem Admin total', r);
r = definir('85991047615', ['Admin total', 'Aluno'], EU); ok(r.ok && /Admin total/.test(r.perfil), 'pode somar perfis mantendo Admin total', r);
r = definir('85992222222', ['Funcionário'], EU); ok(r.ok, 'outro Admin total pode rebaixar o Dois (sobra o Um)', r);
r = definir('85991047615', ['Funcionário'], OUTRO); ok(!r.ok && /pelo menos um Admin/.test(r.erro), 'não deixa ficar sem Admin total ativo', r);
console.log('\n' + (total - falhas.length) + '/' + total + ' verificações passaram');
console.log('FALHAS=' + falhas.length);
process.exit(falhas.length ? 1 : 0);
