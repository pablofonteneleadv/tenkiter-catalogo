'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const api=require('../tamanhos-vinculados.js');
const js=fs.readFileSync(path.join(__dirname,'..','admin-mensagens.js'),'utf8');
const admin=fs.readFileSync(path.join(__dirname,'..','admin.html'),'utf8');
const cases=[
 ['M, Etiqueta: M, Idade: 2 anos, Idade: 3 anos, Idade: 4 anos','Infantil Menino','Idades: 2 a 4 anos'],
 ['M, Etiqueta: M, Idade: 2 anos, Idade: 4 anos, Idade: 10 anos, Idade: 12 anos','Infantil Menina','Idades: 2/4/10/12 anos'],
 ['M, Etiqueta: M, Veste: 38, Veste: 40, Veste: 42, Veste: 44','Feminino Adulto','Numerações: 38 ao 44'],
 ['G, Etiqueta: G, Veste: 38, Veste: 40, Veste: 44','Feminino Adulto','Numerações: 38/40/44'],
];
cases.forEach(([txt,g,expected])=>{const d=api.cliente(txt,g);assert.equal(d.titulo+': '+api.resumir(d.valores,d.tipo),expected);});
assert.ok(js.includes("tam.titulo + ': ' + tam.texto"),'tamanho da lista e da mensagem devem ser formatados');
assert.ok(js.includes("function resumoTamanhosProduto_(p)"),'a mesma função é usada no picker e no texto');
const versaoMensagens=(admin.match(/admin-mensagens\.js\?v=([0-9.]+)/)||[])[1];
assert.ok(versaoMensagens&&versaoMensagens.localeCompare('7.40.25','en',{numeric:true})>=0,'cache deve incluir a correção de tamanhos ou versão posterior');
console.log('Resumo dos tamanhos no atendimento: 7 verificações aprovadas.');
