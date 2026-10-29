/* Regressão: etiqueta interna ≠ idade ou numeração visível para a cliente.
 * Sem dependências. Execução: node tests/cadastro_vinculos.js
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../tamanhos-vinculados.js');
const raiz = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(raiz, 'admin.html'), 'utf8');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const catalogo = fs.readFileSync(path.join(raiz, 'catalogo.js'), 'utf8');
const vitrine = fs.readFileSync(path.join(raiz, 'vitrine.js'), 'utf8');

const infantil3 = T.gravar('', ['M'], ['3 anos', '4 anos'], true);
assert.equal(infantil3, 'M, Etiqueta: M, Idade: 3 anos, Idade: 4 anos');
assert.deepEqual(T.cliente(infantil3).valores, ['3 anos','4 anos']);
const diversas = T.gravar('', ['P','M'], ['1 ano','2 anos','3 anos','4 anos'], true);
assert.equal(T.ler(diversas).etiqueta, 'P/M');
assert.deepEqual(T.cliente(diversas).valores, ['1 ano','2 anos','3 anos','4 anos']);
assert.deepEqual(T.cliente(T.gravar(diversas, ['M'], ['3 anos','4 anos'], true)).valores, ['3 anos','4 anos']);
const adulto = T.gravar('', ['G','GG'], ['40','42','44','46'], false);
assert.equal(T.ler(adulto).etiqueta,'G/GG');
assert.deepEqual(T.cliente(adulto).valores, ['40','42','44','46']);
assert.equal(T.resumir(['2 anos','3 anos','4 anos','5 anos','6 anos','7 anos','8 anos','9 anos','10 anos','11 anos','12 anos'],'idade'),'2 a 12 anos');
assert.equal(T.resumir(['2 anos','4 anos','10 anos','12 anos'],'idade'),'2/4/10/12 anos');
assert.equal(T.resumir(['38','40','42','44'],'numero'),'38 ao 44');
assert.equal(T.resumir(['38','40','44'],'numero'),'38/40/44');
assert.equal(T.resumir(['2 anos'],'idade'),'2 anos');
assert.equal(T.resumir(['36'],'numero'),'36');
assert.deepEqual(T.cliente('P, M, G'), {tipo:'legado',titulo:'Tamanhos',valores:['P','M','G']});
assert.deepEqual(T.cliente('P, M, G','Infantil Menina').valores,[]);
assert.equal(T.gravar('P, M, G', '', [], false),'P, M, G');
assert.equal(T.gravar('P, M, G', ['M'], ['38'], false),'M, Etiqueta: M, Veste: 38');

for (const pagina of [admin, index]) {
  assert.ok(pagina.includes('tamanhos-vinculados.js?v=1'), 'script de tamanhos compartilhado deve ser carregado');
  assert.ok(pagina.indexOf('tamanhos-vinculados.js?v=1') < pagina.indexOf('catalogo.js') ||
    pagina === admin, 'parser deve carregar antes do catálogo');
}
const ordem = ['data-passo="categoria"', 'data-passo="genero"', 'data-passo="tamanhos"', 'data-passo="cores"']
  .map(marca => admin.indexOf(marca));
assert.ok(ordem.every((v, i) => v >= 0 && (!i || v > ordem[i - 1])), 'público deve vir antes dos tamanhos');
for (const publico of ['Mulher', 'Menina', 'Baby Menina', 'Homem', 'Menino', 'Baby Menino']) {
  assert.ok(admin.includes("['" + publico + "','") || admin.includes("['" + publico + "', '"), 'público ausente: ' + publico);
}
assert.ok(admin.includes('TKTamanhos.gravar('), 'cadastro deve usar serializer comum');
assert.ok(admin.includes('TKTamanhos.ler('), 'edição deve recuperar os vínculos');
assert.ok(catalogo.includes('TKTamanhos.cliente('), 'vitrine deve usar o parser');
assert.ok(catalogo.includes('linhaTamanhoCliente_(p)'), 'detalhes do produto devem omitir etiquetas internas');
assert.ok(index.includes('Tamanho ou idade'), 'filtro deve comunicar idades infantis');
assert.ok(vitrine.includes('TKTamanhos.cliente('), 'cards e modal devem usar idades/numerações reais');
assert.ok(!vitrine.includes("listaDeTags(textoPlano(p.Tamanhos || '')).filter"), 'interface não pode expor metadados internos');
// As referencias sugeridas podem ser alteradas manualmente.
for(const [etiqueta,numeros] of Object.entries({PP:['34'],M:['36','38'],G:['40','42'],GG:['44','46']})) {
 assert.ok(admin.includes(etiqueta+":["+numeros.map(n=>"'"+n+"'").join(',')+"]"),'referencia adulta: '+etiqueta);
}
for(const [etiqueta,inicio] of Object.entries({P:1,M:3,G:5,GG:7,Juv10:9,Juv12:11,Juv14:13,Juv16:15})) {
 assert.ok(admin.includes(etiqueta+":['"+inicio+" ano"+(inicio>1?'s':'')+"','"+(inicio+1)+" anos']"),'referencia infantil: '+etiqueta);
}
assert.ok(admin.includes('cadEtiquetas_.has(v)'), 'multisselecao das letras');
assert.ok(admin.includes('TKTamanhos.resumir('),'card da gestao resumido');
console.log('Cadastro vinculado: testes de multi-etiquetas, referencia e faixas aprovados.');
