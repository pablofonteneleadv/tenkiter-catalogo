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

const infantil3 = T.gravar('', 'M', ['3 anos', '4 anos'], true);
const infantil13 = T.gravar('', 'M', ['13 anos', '14 anos'], true);
assert.equal(infantil3, 'M, Etiqueta: M, Idade: 3 anos, Idade: 4 anos');
assert.equal(infantil13, 'M, Etiqueta: M, Idade: 13 anos, Idade: 14 anos');
assert.deepEqual(T.cliente(infantil3), { tipo: 'idade', titulo: 'Idades', valores: ['3 anos', '4 anos'] });
assert.deepEqual(T.cliente(infantil13).valores, ['13 anos', '14 anos']);
assert.ok(!T.cliente(infantil3).valores.includes('M'), 'etiqueta não pode aparecer no filtro infantil');
assert.ok(!T.cliente(infantil13).valores.includes('3 anos'), 'mesma etiqueta infantil pode vestir outras idades');

const adulto = T.gravar('', 'G', ['42', '44', '44'], false);
assert.equal(adulto, 'G, Etiqueta: G, Veste: 42, Veste: 44');
assert.deepEqual(T.cliente(adulto), { tipo: 'numero', titulo: 'Numerações', valores: ['42', '44'] });
assert.deepEqual(T.ler(adulto), { etiqueta: 'G', idades: [], numeros: ['42', '44'], antigos: ['G'] });

const trocouPublico = T.gravar(adulto, 'G', ['5 anos'], true);
assert.deepEqual(T.cliente(trocouPublico).valores, ['5 anos']);
assert.ok(!trocouPublico.includes('Veste:'));
const desligouLetra = T.gravar(adulto, '', [], false);
assert.equal(desligouLetra, '', 'ao desmarcar a etiqueta, ela deixa de aparecer como tamanho legado');

assert.deepEqual(T.cliente('PP, P, M, G'), { tipo: 'legado', titulo: 'Tamanhos', valores: ['PP', 'P', 'M', 'G'] });
assert.deepEqual(T.cliente('Consultar tamanhos disponíveis').valores, []);
assert.deepEqual(T.cliente('Único').valores, ['Único']);
assert.deepEqual(T.cliente('P, M, G', 'Infantil Menina').valores, [], 'letras legadas não devem aparecer no infantil');
assert.deepEqual(T.cliente('M, Etiqueta: M, Idade: 3 anos', 'Infantil Menina').valores, ['3 anos']);
assert.deepEqual(T.cliente('Idade: 3 anos, Idade: 3 anos').valores, ['3 anos']);
assert.equal(T.gravar('P, M, G', '', [], false), 'P, M, G', 'editar outros campos não pode apagar tamanhos antigos');
assert.equal(T.gravar('P, M, G', 'M', ['38'], false), 'M, Etiqueta: M, Veste: 38');

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
// Predefinicoes do cadastro: adulto automatico, infantil sem chute de etiqueta.
for (const [etiqueta, numeros] of Object.entries({PP:['34'],P:['36'],M:['38','40'],G:['42','44'],GG:['46']})) {
  assert.ok(admin.includes(etiqueta + ":[" + numeros.map(n=>"'"+n+"'").join(',') + "]"), 'predefinicao adulta ausente: '+etiqueta);
}
assert.ok(admin.includes('cadFaixas_=new Set(cadPredefinirFaixas_(cadEtiqueta_))'), 'clique na etiqueta deve preselecionar numeros');
assert.ok(admin.includes("cadInfantil_() ? []"), 'etiquetas infantis nao devem presumir idade');
assert.ok(admin.includes("CAD_IDADES_CRIANCA_ = Array.from({length:16},(_,i)=>(i+2)+' anos')"), 'crianca inicia aos 2 anos');
assert.ok(admin.includes("'18-24 meses'"), 'baby termina em 24 meses');
assert.ok(!admin.includes("const CAD_IDADES_ = ['RN'"), 'nao misturar meses de baby com anos de crianca');
console.log('Cadastro vinculado: 19 cenários/assertivas essenciais aprovados.');
