#!/usr/bin/env node
/* v3.16: manual só-gestor, prática validada, mínimo e certificado verificável. Planilha SIMULADA, chaves inventadas. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.resolve(__dirname, '..');
const RAIZ_GS = fs.existsSync(path.join(RAIZ,'funcionario-codigo-3.16.gs.txt')) ? RAIZ : path.resolve(RAIZ,'..','tenkiter-cofre');
const arqs = fs.readdirSync(RAIZ_GS).filter(f => /^funcionario-codigo-\d+\.\d+\.gs\.txt$/.test(f)).sort((a, b) => { const p = x => x.match(/(\d+)\.(\d+)/).slice(1).map(Number); return p(a)[0] - p(b)[0] || p(a)[1] - p(b)[1]; });
const ARQ = arqs[arqs.length - 1], fonte = fs.readFileSync(path.join(RAIZ_GS, ARQ), 'utf8');
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
console.log('Arquivo testado: ' + ARQ);
const run = e => vm.runInContext(e, ctx);
const J = o => JSON.parse(o._t);
// dublês: login, planilhas e manuais
const ABAS = { Progresso: new Aba('Progresso'), Resultados: new Aba('Resultados') };
ABAS.Progresso.appendRow(['WhatsApp','ProgressoJSON','AtualizadoEm']);
ABAS.Resultados.appendRow(['DataHora','WhatsApp','Nome','Nivel','Manual','Nota','Total','Percentual','Erros','ManualId','TentativaId','CriticasErradas']);
ctx.__ABAS = ABAS;
const USERS = {
  PABLO: { whatsapp: '85990000001', name: 'Pablo', permissoes: ['portal','avaliacoes','gerir_manuais','manual_1','manual_2','manual_3'] },
  KARLA: { whatsapp: '85990000002', name: 'Karla', permissoes: ['portal','avaliacoes','gerir_manuais','manual_1','manual_2','manual_3'] },
  ANA:   { whatsapp: '85990000003', name: 'Ana Teste', permissoes: ['portal','avaliacoes','manual_1','manual_2','manual_3'] },
};
ctx.__USERS = USERS; ctx.__quem = 'ANA';
run('acVerificar_ = function (w, c) { var u = __USERS[__quem]; return u ? { ok: true, usuario: u } : { ok: false, erro: "x" }; };');
run('acExigir_ = function (w, c, perm) { var u = __USERS[__quem]; if (!u) return { ok: false, erro: "x" }; if (perm && u.permissoes.indexOf(perm) === -1) return { ok: false, semPermissao: true, erro: "sem permissão" }; return { ok: true, usuario: u }; };');
run('getProgressoSheet_ = function () { return __ABAS.Progresso; }; resultadosSheet_ = function () { return __ABAS.Resultados; }; acLog_ = function () {};');
const MANUAIS = [
  { id: '1', titulo: 'Manual Aberto', blurb: '', nivelMinimo: 1, docId: '', docUrl: '', ordem: 1, atualizadoEm: '', parts: [{ title: 'P', chapters: [{ id: 'a', hash: 'h1', title: 'A', blocks: [] }] }] },
  { id: 'm900', titulo: 'Módulo 0 teste', blurb: '', nivelMinimo: 10, docId: '', docUrl: '', ordem: 2, atualizadoEm: '', parts: [{ title: 'P', chapters: [{ id: 'l1', hash: 'x1', title: 'L1', blocks: [] }, { id: 'l2', hash: 'x2', title: 'L2', blocks: [] }] }] },
];
ctx.__M = MANUAIS; run('lerManuais_ = function () { return __M; }; cfgQuizDoManual_ = function () { return { pass: 0.7, count: 0, modo: "tudo", opcoes: 0, max: 3 }; }; conteudoBase_ = function () { return { lista: __M, provas: { "1": { questions: [] }, "m900": { questions: [] } }, gestorInfo: {} }; };');
const como = q => { ctx.__quem = q; };
const acao = (nome, d) => J(run('doPost({ postData: { contents: JSON.stringify(Object.assign({ token: tokenCompartilhado_(), action: ' + JSON.stringify(nome) + ' }, ' + JSON.stringify(d || {}) + ')) } })'));
const lerTodos = () => { ctx.__quem = 'ANA'; };

console.log('\n[manual só para administrador]');
como('ANA');
let r = J(run('treinamentoConteudoAcao_({ whatsapp: "x", sessao: "x" })'));
ok(r.ok && r.manuais.every(m => m.id !== 'm900') && JSON.stringify(r).indexOf('Módulo 0 teste') === -1, 'funcionária NÃO recebe nem o título do manual só-gestor', r.manuais.map(m => [m.id, m.liberado]));
ok(!('m900' in r.provas), 'e sem prova dele');
como('PABLO');
r = J(run('treinamentoConteudoAcao_({ whatsapp: "x", sessao: "x" })'));
ok(r.manuais.find(m => m.id === 'm900').liberado && r.manuais.find(m => m.id === 'm900').parts.length === 1 && 'm900' in r.provas, 'gestor vê o manual de teste e a prova');
ok(J(run('doGet({ parameter: { action: "manuais_lista" } })')).manuais.every(m => m.id !== 'm900'), 'lista pública de manuais não mostra o manual só-gestor');
como('ANA');
r = acao('resultado', { whatsapp: 'x', sessao: 'x', manualId: 'm900', nota: 9, total: 10, tentativaId: 'a1' });
ok(r.ok === false, 'funcionária não consegue gravar nota no manual só-gestor', r);
r = acao('resultado', { whatsapp: 'x', sessao: 'x', manualId: '1', nota: 9, total: 10, tentativaId: 'a2' });
ok(r.ok === true, 'manual aberto continua gravando nota', r);
ok(acao('certificado_status', { whatsapp: 'x', sessao: 'x', manualId: 'm900' }).ok === false, 'funcionária não vê status do manual só-gestor');
ok(JSON.parse(run('JSON.stringify(doGet({ parameter: { action: "versao" } })._t)')) && J(run('doGet({ parameter: { action: "versao" } })')).certificados === true, 'versao anuncia certificados/praticas/manualSoGestor');

console.log('\n[caminho completo até o certificado]');
como('PABLO');
const manual = 'm900';
const reg = (n, t, crit, id) => acao('resultado', { whatsapp: 'x', sessao: 'x', manualId: manual, nota: n, total: t, tentativaId: id, nome: 'Pablo', criticasErradas: crit || 0 });
let st = acao('certificado_status', { whatsapp: 'x', sessao: 'x', manualId: manual });
ok(st.ok && !st.elegivel && st.capitulos === 2 && st.lidos === 0 && st.minimo === 70, 'começa sem nada: 0 de 2 capítulos, mínimo 70%', st);
let em = acao('certificado_emitir', { whatsapp: 'x', sessao: 'x', manualId: manual });
ok(em.ok === false && em.naoElegivel, 'não emite sem cumprir os requisitos', em);
acao('manual_marcar_lido', { whatsapp: 'x', sessao: 'x', manualId: manual, capId: 'l1', hash: 'x1', lido: true });
acao('manual_marcar_lido', { whatsapp: 'x', sessao: 'x', manualId: manual, capId: 'l2', hash: 'x2', lido: true });
st = acao('certificado_status', { whatsapp: 'x', sessao: 'x', manualId: manual });
ok(st.req.leitura && !st.req.prova && !st.req.pratica, 'leu tudo, falta prova e prática', st.req);
reg(5, 10, 0, 'p1'); // 50%
st = acao('certificado_status', { whatsapp: 'x', sessao: 'x', manualId: manual });
ok(!st.req.prova, '50% é menos que o mínimo de 70%: não conta', st);
reg(9, 10, 1, 'p2'); // 90% mas errou crítica
st = acao('certificado_status', { whatsapp: 'x', sessao: 'x', manualId: manual });
ok(!st.req.prova && st.criticaErrada, '90% com pergunta crítica errada NÃO conta (e avisa o motivo)', st);
reg(8, 10, 0, 'p3'); // 80% sem crítica
st = acao('certificado_status', { whatsapp: 'x', sessao: 'x', manualId: manual });
ok(st.req.prova && !st.elegivel, '80% sem crítica errada: prova ok, ainda falta a prática', st);
em = acao('certificado_emitir', { whatsapp: 'x', sessao: 'x', manualId: manual });
ok(em.ok === false && em.naoElegivel, 'sem prática validada ainda não emite', em);
// prática
como('ANA');
r = acao('pratica_validar', { whatsapp: 'x', sessao: 'x', whatsappAlvo: '85990000003', manualId: manual, itens: [{ t: 'a', ok: true }], aprovado: true });
ok(r.ok === false, 'funcionária não pode validar prática', r);
como('PABLO');
r = acao('pratica_validar', { whatsapp: 'x', sessao: 'x', whatsappAlvo: '85990000001', manualId: manual, itens: [{ t: 'Cumprimentou todo cliente', ok: true }, { t: 'Fechou pelo checklist', ok: false }], aprovado: true });
ok(r.ok === false && /todos os itens/.test(r.erro), 'aprovar com item desmarcado é recusado', r);
r = acao('pratica_validar', { whatsapp: 'x', sessao: 'x', whatsappAlvo: '85990000001', manualId: manual, itens: [{ t: 'Cumprimentou todo cliente', ok: true }, { t: 'Fechou pelo checklist', ok: true }], aprovado: true });
ok(r.ok && r.resultado === 'aprovada', 'gestor aprova a prática (autovalidação permitida SÓ no manual de teste)', r);
st = acao('certificado_status', { whatsapp: 'x', sessao: 'x', manualId: manual });
ok(st.elegivel, 'agora está elegível', st);
em = acao('certificado_emitir', { whatsapp: 'x', sessao: 'x', manualId: manual });
ok(em.ok && /^TK-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(em.certificado.codigo) && em.certificado.validadoPor === 'Pablo', 'emite certificado com código TK-XXXX-XXXX e quem validou', em);
const cod = em.certificado.codigo;
ok(!JSON.stringify(em).match(/nota|percentual|cpf/i), 'certificado não carrega nota nem CPF');
const em2 = acao('certificado_emitir', { whatsapp: 'x', sessao: 'x', manualId: manual });
ok(em2.ok && em2.jaExistia && em2.certificado.codigo === cod, 'pedir de novo devolve o mesmo (não duplica)');
console.log('\n[verificação pública]');
let vp = J(run('doGet({ parameter: { action: "certificado_verificar", codigo: ' + JSON.stringify(cod.toLowerCase()) + ' } })'));
ok(vp.encontrado && vp.valido && vp.nome === 'Pablo' && vp.titulo === 'Módulo 0 teste', 'código confere (aceita minúsculas) e mostra nome/treinamento', vp);
ok(!('nota' in vp) && !('whatsapp' in vp) && !('percentual' in vp), 'resposta pública não expõe nota nem WhatsApp');
ok(J(run('doGet({ parameter: { action: "certificado_verificar", codigo: "TK-AAAA-BBBB" } })')).encontrado === false, 'código inventado: não encontrado');
como('ANA');
ok(acao('certificado_revogar', { whatsapp: 'x', sessao: 'x', codigo: cod }).ok === false, 'funcionária não revoga');
como('KARLA');
ok(acao('certificado_revogar', { whatsapp: 'x', sessao: 'x', codigo: cod }).ok === true, 'gestor revoga');
vp = J(run('doGet({ parameter: { action: "certificado_verificar", codigo: ' + JSON.stringify(cod) + ' } })'));
ok(vp.encontrado && vp.valido === false, 'depois de revogar a verificação mostra inválido', vp);

console.log('\n[prática em manual aberto]');
como('KARLA');
r = acao('pratica_validar', { whatsapp: 'x', sessao: 'x', whatsappAlvo: '85990000002', manualId: '1', itens: [{ t: 'a', ok: true }], aprovado: true });
ok(r.ok === false && /própria/.test(r.erro), 'em manual aberto à equipe ninguém valida a própria prática', r);
r = acao('pratica_validar', { whatsapp: 'x', sessao: 'x', whatsappAlvo: '85990000003', manualId: '1', itens: [{ t: 'a', ok: true }], aprovado: false, obs: 'refazer abertura' });
ok(r.ok && r.resultado === 'refazer', 'gestor pode pedir para refazer (fica registrado)', r);
como('ANA');
r = acao('pratica_listar', { whatsapp: 'x', sessao: 'x' });
ok(r.ok && r.praticas.length === 1 && r.praticas[0].whatsapp === '85990000003', 'funcionária vê só as próprias práticas', r);

console.log('\n' + (total - falhas.length) + '/' + total + ' verificações passaram');
console.log('FALHAS=' + falhas.length);
process.exit(falhas.length ? 1 : 0);
