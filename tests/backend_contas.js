#!/usr/bin/env node
/* Testa CPF, e-mail, login por e-mail/WhatsApp/CPF e RECUPERAR SENHA (bloco compartilhado dos dois backends) com planilha e cache SIMULADOS. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.resolve(__dirname, '..');
const arqs = fs.readdirSync(RAIZ).filter(f => /^funcionario-codigo-\d+\.\d+\.gs\.txt$/.test(f)).sort((a, b) => { const p = x => x.match(/(\d+)\.(\d+)/).slice(1).map(Number); return p(a)[0] - p(b)[0] || p(a)[1] - p(b)[1]; });
const ARQ = arqs[arqs.length - 1], fonte = fs.readFileSync(path.join(RAIZ, ARQ), 'utf8');
let falhas = [], total = 0; const CACHE = new Map();
function ok(c, n, d) { total++; if (!c) { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? (typeof d === 'string' ? '\n' + d : '  (' + JSON.stringify(d) + ')') : '')); } else console.log('  ✔ ' + n); }
function diffTrechos(a, b) {
  const aa = a.split('\n'), bb = b.split('\n');
  const dp = Array.from({ length: aa.length + 1 }, () => new Uint32Array(bb.length + 1));
  for (let i = aa.length - 1; i >= 0; i--) {
    for (let j = bb.length - 1; j >= 0; j--) {
      dp[i][j] = aa[i] === bb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const linhas = ['--- bloco catálogo', '+++ bloco funcionário'];
  let i = 0, j = 0;
  while (i < aa.length || j < bb.length) {
    if (i < aa.length && j < bb.length && aa[i] === bb[j]) { i++; j++; }
    else if (i < aa.length && (j === bb.length || dp[i + 1][j] >= dp[i][j + 1])) linhas.push('-' + aa[i++]);
    else linhas.push('+' + bb[j++]);
  }
  return linhas.length > 2 ? linhas.join('\n') : '(sem diferenças de linha; verificar espaços ou finais de linha)';
}
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
  CacheService: { getScriptCache: () => ({ get: k => (CACHE.has(k) ? CACHE.get(k) : null), put(k, v) { CACHE.set(k, String(v)); }, remove(k) { CACHE.delete(k); }, getAll: () => ({}), putAll() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {} }) },
  Utilities: { formatDate: () => '2026-10-11T10:00:00', getUuid: () => 'u', computeDigest: () => [1], computeHmacSha256Signature: () => [1], DigestAlgorithm: {} },
  Session: { getScriptTimeZone: () => 'America/Fortaleza' }, ContentService: { MimeType: {}, createTextOutput: t => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }) } };
vm.createContext(ctx); vm.runInContext(fonte, ctx, { filename: ARQ });
const run = e => vm.runInContext(e, ctx);
console.log('Arquivo testado: ' + ARQ);

const chaves = run('acChaves_()');
const aba = ss.insertSheet('Pessoas');
aba.appendRow(['nome', 'whatsapp', 'senha', 'nivel', 'status', 'perfil'].concat(chaves.map(k => 'perm_' + k)));
const pessoa = (nome, w, senha, perfil, status) => { const l = [nome, w, senha, 1, status || 'Ativo', perfil]; chaves.forEach(() => l.push('')); aba.appendRow(l); };
pessoa('Ana Cliente', '85991111111', 'SenhaAna88', 'Cliente');
pessoa('Bia Aluna', '85992222222', 'SenhaBia88', 'Aluno');
pessoa('Eva Estagiaria', '85993333333', 'SenhaEva88', 'Estagiário');
pessoa('Ivo Inativo', '85994444444', 'SenhaIvo88', 'Aluno', 'Inativo');
pessoa('Adm Total', '85995555555', 'SenhaAdm88', 'Admin total');
const J = o => JSON.parse(o.getContent());
const login = (ident, senha) => { ctx.__d = { identificador: ident, senha }; return J(run('loginUsuario_(__d)')); };
const recup = d => { ctx.__r = d; return run('acRecuperarSenha_(__r)'); };
const salvar = (w, campos) => { ctx.__c = campos; return run('acSalvarIdentificadores_("' + w + '", __c)'); };

console.log('\n[CPF válido]');
ok(run('acCpfValido_("529.982.247-25")') === true && run('acCpfValido_("52998224725")') === true, 'CPF verdadeiro passa (com ou sem pontos)');
ok(run('acCpfValido_("111.111.111-11")') === false && run('acCpfValido_("123.456.789-00")') === false && run('acCpfValido_("5299822472")') === false, 'repetido, dígito errado e curto são recusados');
ok(run('acCpfFormatado_("52998224725")') === '529.982.247-25', 'formata 000.000.000-00');

console.log('\n[gravar CPF e e-mail]');
let r = salvar('85991111111', { cpf: '111.111.111-11' }); ok(!r.ok && r.campo === 'cpf', 'CPF falso não grava', r);
r = salvar('85991111111', { email: 'sem-arroba' }); ok(!r.ok && r.campo === 'email', 'e-mail sem @ não grava', r);
r = salvar('85992222222', { cpf: '529.982.247-25', email: 'Bia@Exemplo.com ' }); ok(r.ok, 'Bia grava CPF e e-mail (colunas criadas na hora)', r);
const hd = aba.d[0].map(h => String(h).toLowerCase());
ok(hd.includes('cpf') && hd.includes('email'), 'a planilha ganhou as colunas CPF e Email');
const linhaBia = aba.d.find(l => l[1] === '85992222222');
ok(linhaBia[hd.indexOf('cpf')] === '529.982.247-25' && linhaBia[hd.indexOf('email')] === 'bia@exemplo.com', 'CPF fica formatado e e-mail em minúsculas', [linhaBia[hd.indexOf('cpf')], linhaBia[hd.indexOf('email')]]);
r = salvar('85991111111', { cpf: '52998224725' }); ok(!r.ok && r.emUso, 'o mesmo CPF em OUTRA conta é recusado', r);
r = salvar('85991111111', { email: 'bia@exemplo.com' }); ok(!r.ok && r.emUso, 'o mesmo e-mail em OUTRA conta é recusado', r);
r = salvar('85992222222', { cpf: '529.982.247-25' }); ok(r.ok, 'a própria pessoa pode regravar o mesmo CPF', r);

console.log('\n[login por e-mail, WhatsApp ou CPF]');
let l = login('85992222222', 'SenhaBia88'); ok(l.ok && l.usuario.whatsapp === '85992222222', 'WhatsApp continua entrando', l);
l = login('bia@exemplo.com', 'SenhaBia88'); ok(l.ok && l.usuario.whatsapp === '85992222222', 'entra com e-mail', l);
l = login('BIA@EXEMPLO.COM', 'SenhaBia88'); ok(l.ok, 'e-mail sem diferenciar maiúscula', l);
l = login('529.982.247-25', 'SenhaBia88'); ok(l.ok && l.usuario.whatsapp === '85992222222', 'entra com CPF formatado', l);
l = login('52998224725', 'SenhaBia88'); ok(l.ok, 'entra com CPF só números', l);
ok(l.usuario.cpf === '529.982.247-25' && l.usuario.email === 'bia@exemplo.com', 'o usuário devolvido traz o próprio CPF e e-mail', l.usuario);
l = login('bia@exemplo.com', 'SenhaErrada88'); ok(!l.ok, 'senha errada continua recusada', l);
l = login('naoexiste@x.com', 'SenhaBia88'); ok(!l.ok, 'e-mail que não existe não entra', l);
// 2 contas com o mesmo e-mail (cadastro antigo/manual na planilha): ambíguo = não entra por e-mail
aba.d.find(l2 => l2[1] === '85991111111')[hd.indexOf('email')] = 'bia@exemplo.com';
l = login('bia@exemplo.com', 'SenhaBia88'); ok(!l.ok, 'e-mail repetido em duas contas é ambíguo: não entra por ele', l);
l = login('85992222222', 'SenhaBia88'); ok(l.ok, 'mas o WhatsApp dessas contas segue funcionando', l);
aba.d.find(l2 => l2[1] === '85991111111')[hd.indexOf('email')] = '';
// 11 dígitos que são um CPF E o WhatsApp de outra conta: o WhatsApp ganha
pessoa('Gêmeo', '52998224725', 'SenhaGemeo88', 'Cliente');
l = login('52998224725', 'SenhaGemeo88'); ok(l.ok && l.usuario.whatsapp === '52998224725', 'número que é WhatsApp de uma conta entra nela (não confunde com CPF de outra)', l);

console.log('\n[recuperar senha]');
r = recup({ identificador: '000.000.000-00', novaSenha: 'NovaSenha88' }); ok(!r.ok && r.semConta, 'conta que não existe: avisa com frase', r);
r = recup({ identificador: '85991111111', novaSenha: 'NovaSenha88' }); ok(!r.ok && r.precisaGestao && /gestão/.test(r.erro), 'Cliente sem CPF/nascimento: manda chamar a gestão', r);
r = recup({ identificador: '85994444444', novaSenha: 'NovaSenha88' }); ok(!r.ok && r.inativa, 'conta desativada não recupera sozinha', r);
run('acGravarCampo_("85992222222", "datanascimento", "DataNascimento", "01/01/1990")');   // SEC-08: toda conta precisa de CPF E nascimento para trocar a senha sozinha
// Única senha curta intencional: este caso valida a recusa de senha abaixo do mínimo.
r = recup({ identificador: '85992222222', nascimento: '1990-01-01', cpf: '529.982.247-25', novaSenha: 'abc' }); ok(!r.ok && r.faltaSenha, 'senha nova curta é recusada', r);
r = recup({ identificador: '85992222222', nascimento: '1990-01-01', cpf: '111.111.111-11', novaSenha: 'NovaSenha88' }); ok(!r.ok && r.naoConfere && r.restam === 4, 'CPF errado: não confere e diz quantas tentativas restam', r);
ok(login('85992222222', 'SenhaBia88').ok, 'depois do erro a senha antiga continua valendo');
r = recup({ identificador: 'bia@exemplo.com', nascimento: '1990-01-01', cpf: '529.982.247-25', novaSenha: 'NovaSenha88' }); ok(r.ok && r.usuario && r.sessao, 'CPF certo (achando por e-mail): troca a senha e já entra', r);
ok(!login('85992222222', 'SenhaBia88').ok && login('85992222222', 'NovaSenha88').ok, 'senha antiga deixa de valer, a nova entra');
r = recup({ identificador: '85992222222', nascimento: '1990-01-01', cpf: '529.982.247-25', novaSenha: 'NovaSenha99' }); ok(r.ok, 'o contador de erros zerou depois do acerto', r);
r = recup({ identificador: '85992222222', nascimento: '1990-01-01', cpf: '111.111.111-11', novaSenha: 'SenhaErrada88' }); ok(!r.ok && !JSON.stringify(r).includes('529.982') && !JSON.stringify(r).includes('2005'), 'a resposta de erro nunca devolve CPF/nascimento', r); CACHE.clear();

console.log('\n[nascimento: dd/mm/aaaa e aaaa-mm-dd valem igual]');
run('acGravarCampo_("85991111111", "datanascimento", "DataNascimento", "10/02/2005")');
r = recup({ identificador: '85991111111', nascimento: '2005-02-10', novaSenha: 'SenhaAna999' }); ok(!r.ok && r.precisaGestao, 'só nascimento cadastrado (sem CPF): NÃO troca sozinho (SEC-08 exige CPF E nascimento)', r);
run('acGravarCampo_("85991111111", "cpf", "CPF", "390.533.447-05")');
r = recup({ identificador: '85991111111', cpf: '39053344705', nascimento: '2005-02-11', novaSenha: 'SenhaAna888' }); ok(!r.ok && r.naoConfere, 'data errada não confere', r);
r = recup({ identificador: '85991111111', cpf: '39053344705', nascimento: '2005-02-10', novaSenha: 'SenhaAna999' }); ok(r.ok, 'CPF e nascimento (formato ISO) conferem: troca', r);
ok(login('85991111111', 'SenhaAna999').ok, 'Ana entra com a senha nova');
r = recup({ identificador: '85991111111', nascimento: '10/02/2005', novaSenha: 'SenhaAna000' }); ok(!r.ok && r.naoConfere && /CPF e a data/.test(r.erro), 'com CPF e nascimento cadastrados, os DOIS são exigidos', r);
r = recup({ identificador: '85991111111', nascimento: '10/02/2005', cpf: '39053344705', novaSenha: 'SenhaAna000' }); ok(r.ok, 'com os dois certos (CPF só números) troca', r);

console.log('\n[bloqueio por tentativas]');
for (let i = 0; i < 5; i++) recup({ identificador: '85992222222', nascimento: '1990-01-01', cpf: '111.111.111-11', novaSenha: 'SenhaErrada88' });
r = recup({ identificador: '85992222222', nascimento: '1990-01-01', cpf: '529.982.247-25', novaSenha: 'SenhaCorreta88' }); ok(!r.ok && r.bloqueado, 'após 5 erros nem o CPF certo passa (15 min)', r);
CACHE.clear();

console.log('\n[conta da equipe]');
run('acGravarCampo_("85993333333", "datanascimento", "DataNascimento", "01/01/1999")');
r = recup({ identificador: '85993333333', nascimento: '01/01/1999', novaSenha: 'SenhaEva444' }); ok(!r.ok && r.precisaGestao && /gestão/.test(r.erro), 'Estagiário só com nascimento: NÃO troca sozinho (só a gestão)', r);
run('acGravarCampo_("85993333333", "cpf", "CPF", "529.982.247-25")');   // (mesmo CPF da Bia só para o teste de equipe; a regra de unicidade é do cadastro)
r = recup({ identificador: '85993333333', nascimento: '01/01/1999', cpf: '52998224725', novaSenha: 'SenhaEva444' }); ok(r.ok, 'Estagiário com CPF + nascimento cadastrados e conferidos troca sozinho', r);
r = recup({ identificador: '85995555555', novaSenha: 'SenhaAdm666' }); ok(!r.ok && r.precisaGestao, 'Admin total sem CPF/nascimento: só a gestão', r);

console.log('\n[conta que já existe]');
ctx.__x = null;
r = run('acRegistrar_("Outra Bia", "85992222222", "qualquer", "Aluno", {})'); ok(!r.ok && r.contaExiste === true, 'cadastro com WhatsApp existente devolve contaExiste:true (a tela oferece Entrar/Esqueci a senha)', r);

console.log('\n[os dois backends têm o MESMO bloco]');
const tira = f => { const t = fs.readFileSync(path.join(RAIZ, f), 'utf8'); const i = t.indexOf('/* ---------- v3.9: CPF, e-mail'); const j = t.indexOf('function acTodasLinhas_() {'); return t.slice(i, j).replace(/\/\* -{10} v[\d.]+ \/ PERF-01[\s\S]*?\*\//, '/* PERF-01 (comentário próprio de cada backend, ignorado na comparação) */'); };
const cat = fs.readdirSync(RAIZ).filter(f => /^catalogo-codigo-\d+\.\d+\.gs\.txt$/.test(f)).sort().pop();
const blocoCatalogo = tira(cat), blocoFuncionario = tira(ARQ);
ok(blocoCatalogo.length > 5000 && blocoCatalogo === blocoFuncionario, 'bloco compartilhado idêntico em ' + cat + ' e ' + ARQ,
  blocoCatalogo.length > 5000 && blocoCatalogo === blocoFuncionario ? undefined : diffTrechos(blocoCatalogo, blocoFuncionario));

console.log('\n' + (total - falhas.length) + '/' + total + ' verificações passaram');
console.log('FALHAS=' + falhas.length);
process.exit(falhas.length ? 1 : 0);
