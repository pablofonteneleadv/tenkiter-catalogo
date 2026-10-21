// P-19: contrato de persistência por formato, sem navegador ou rede.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '..', 'admin-postagens.js'), 'utf8');
const memory = new Map();
const ctx = vm.createContext({nova: {tipo:'story'}, COL_LAYOUTS:[['4'], ['2h']],
  colLim_: (v,a,b) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : a)),
  localStorage: {getItem:k => memory.get(k) || null, setItem:(k,v) => memory.set(k,v)}});
vm.runInContext(source.slice(source.indexOf('function colEst_()'), source.indexOf('const colCel_')), ctx);
memory.set('tk_po_col_v1', JSON.stringify({l:'2h',fundo:'#FFFFFF',gap:12,rd:3,aj:'caber'}));
assert.equal(vm.runInContext('colEst_().gap', ctx), 12);
vm.runInContext('colEst_().gap=40; colSalvarModelo_(); nova.tipo="feed"', ctx);
assert.equal(vm.runInContext('colEst_().gap', ctx), 12);
vm.runInContext('colEst_().gap=8; colSalvarModelo_(); nova.tipo="story"', ctx);
assert.equal(vm.runInContext('colEst_().gap', ctx), 40);
vm.runInContext('nova.tipo="carrossel"', ctx);
assert.equal(vm.runInContext('colEst_().gap', ctx), 8);
const saved = JSON.parse(memory.get('tk_po_col_v2'));
assert.equal(saved.story.gap,40);
assert.equal(saved.feed.gap,8);
assert.equal(JSON.parse(memory.get('tk_po_col_v1')).gap,12);
memory.set('tk_po_col_v2', '{inválido');
vm.runInContext('nova.col=null', ctx);
assert.equal(vm.runInContext('colEst_().gap', ctx),8);
console.log('OK=8 FALHAS=0 (migração, Story/Feed separados, Carrossel usa 4:5, legado preservado e cache corrompido).');
