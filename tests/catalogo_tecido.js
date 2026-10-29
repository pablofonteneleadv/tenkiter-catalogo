'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'catalogo-tecido.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'catalogo-tecido.js' });
const TKTecido = context.window.TKTecido;

assert.deepEqual(Object.keys(TKTecido).sort(), ['aplicar','carregar','ler','opcoes','resolver','salvar','semDescricao','serializar'].sort());

// Ida e volta pelo campo Descricao que o backend atual já persiste.
const descricao = 'Conjunto leve.\n\nCaimento reto.';
const gravada = TKTecido.serializar(descricao, 'Viscose');
assert.equal(gravada, 'Conjunto leve.\n\nCaimento reto.\nTecido: Viscose');
assert.equal(TKTecido.ler({ Descricao: gravada }), 'Viscose');
assert.equal(TKTecido.semDescricao(gravada), descricao);

// Substitui uma linha antiga, mantendo só uma ocorrência; tecido vazio remove a linha.
const comAntigas = 'Antes\nTecido: Algodão\nMeio\ntecido: Crepe\nDepois';
assert.equal(TKTecido.serializar(comAntigas, 'Linho'), 'Antes\nMeio\nDepois\nTecido: Linho');
assert.equal(TKTecido.serializar(comAntigas, ''), 'Antes\nMeio\nDepois');
assert.equal(TKTecido.serializar('Tecido: antigo', '   '), '');

// Só remove linhas dedicadas: menções inline e texto que contém tecido permanecem iguais.
const inline = 'A descrição menciona tecido macio.\n\nOutra linha: “tecido: exemplo” no meio.';
assert.equal(TKTecido.semDescricao(inline), inline);
assert.equal(TKTecido.serializar(inline, 'Malha'), inline + '\nTecido: Malha');
assert.equal(TKTecido.semDescricao('A\r\nTecido: X\r\n\r\nB'), 'A\r\n\r\nB');

// Não interpreta nem executa HTML literal.
const html = '<img src=x onerror=alert(1)> algodão';
const htmlGravado = TKTecido.serializar('Peça', html);
assert.equal(TKTecido.ler({ Descricao: htmlGravado }), html);

// Um Tecido explícito, inclusive vazio, sempre tem precedência sobre o legado em Descricao.
assert.equal(TKTecido.ler({ Tecido: 'Sarja', Descricao: 'Tecido: Viscose' }), 'Sarja');
assert.equal(TKTecido.ler({ Tecido: '', Descricao: 'Tecido: Viscose' }), '');
assert.equal(TKTecido.ler({ Tecido: null, Descricao: 'Tecido: Viscose' }), '');
assert.equal(TKTecido.ler({ Descricao: 'Tecido: Modal\nDescrição' }), 'Modal');
assert.equal(TKTecido.ler({ Descricao: 'descrição sem tecido' }), '');

// Valor em uma só linha, sem controles/rótulo duplicado e limitado a 100 caracteres.
assert.equal(TKTecido.serializar('X', 'Tecido: 100%\n algodão\u0000'), 'X\nTecido: 100% algodão');
assert.equal(TKTecido.ler({ Tecido: 'a'.repeat(110) }).length, 100);
assert.equal(TKTecido.serializar('X', 'a'.repeat(110)).split('\n')[1].length, 108);

console.log('catalogo_tecido: verificações aprovadas');

TKTecido.aplicar({versao:1,itens:[{nome:'Crepe Dior',apelidos:['Dior','Crepe Diór']}]});
assert.equal(TKTecido.ler({Descricao:'Tecido: Dior'}),'Crepe Dior');
assert.equal(TKTecido.serializar('Peça','Dior'),'Peça\nTecido: Crepe Dior');
assert.deepEqual(Array.from(TKTecido.opcoes([{Descricao:'Tecido: Dior'}])),['Crepe Dior']);
