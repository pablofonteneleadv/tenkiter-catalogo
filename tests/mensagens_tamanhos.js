'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../tamanhos-vinculados.js');
const src = fs.readFileSync(path.join(__dirname, '../admin-mensagens.js'), 'utf8');
const inicio = src.indexOf('  function resumoTamanhosProduto_(p) {');
const fim = src.indexOf('  function linkDe_(p)', inicio);
assert.ok(inicio >= 0 && fim > inicio, 'função de resumo do mensageiro deve existir');
const resumo = new Function('TKTamanhos', src.slice(inicio, fim) + '\nreturn resumoTamanhosProduto_;')(T);
function produto(Tamanhos, Genero) { return {Tamanhos, Genero}; }
assert.deepEqual(resumo(produto('M, Etiqueta: M, Idade: 2 anos, Idade: 3 anos, Idade: 4 anos','Infantil Menino')).texto,'2 a 4 anos');
assert.deepEqual(resumo(produto('M, Etiqueta: M, Idade: 2 anos, Idade: 4 anos, Idade: 10 anos','Infantil Menino')).texto,'2/4/10 anos');
assert.deepEqual(resumo(produto('G, Etiqueta: G, Veste: 38, Veste: 40, Veste: 42, Veste: 44','Feminino Adulto')).texto,'38 ao 44');
assert.deepEqual(resumo(produto('G, Etiqueta: G, Veste: 38, Veste: 42, Veste: 44','Feminino Adulto')).texto,'38/42/44');
assert.deepEqual(resumo(produto('P, M, G','Feminino Adulto')).texto,'P/M/G');
assert.ok(src.includes("tam.titulo + ': ' + tam.texto"), 'legenda e card devem usar resumo limpo');
assert.ok(src.includes("const tam = resumoTamanhosProduto_(p);"), 'card deve chamar resumo único');
console.log('Mensagens: resumo de idades, numerações e compatibilidade legada OK.');
