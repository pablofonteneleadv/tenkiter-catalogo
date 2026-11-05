'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const common=fs.readFileSync('common.js','utf8');
const fragment=common.slice(common.indexOf('function estoqueInformado('),common.indexOf('function ehNovidade('));
assert(fragment.includes('function estaEsgotado('));
const c={};vm.createContext(c);vm.runInContext(fragment,c);
let checks=0;
for(const [value,known,soldOut]of [['',false,false],[null,false,false],[undefined,false,false],[0,true,true],['0',true,true],[2,true,false],['3',true,false]]){
 assert.equal(c.estoqueInformado({Estoque:value}),known);assert.equal(c.estaEsgotado({Estoque:value}),soldOut);checks+=2;
}
const workerContext={Response,URL,module:{exports:{}},fetch:async()=>{throw Error('não usar rede')}};
vm.runInNewContext(fs.readFileSync('og-worker/worker.js','utf8').replace('export default','module.exports ='),workerContext);
for(const value of ['',null,undefined]){
 const item=workerContext.itemFeed({ID:1,Nome:'Peça simulada',Preco:10,Estoque:value});
 assert.equal(item.quantity_to_sell_on_facebook,'');assert.notEqual(item.availability,'out of stock');checks+=2;
}
console.log('PASS estoque opcional: '+checks+' verificações; vazio não é zero nem indisponível.');
