'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../pedido.js'), 'utf8');
const start = source.indexOf('var pedidoOperacao_ = null;');
const end = source.indexOf('var rascunhoPedido_ = null;', start);
assert(start >= 0 && end > start);
function environment(storage, crypto = webcrypto) {
  const ctx = vm.createContext({ window: { crypto }, sessionStorage: storage, TextEncoder, Uint8Array });
  vm.runInContext(source.slice(start, end), ctx);
  return ctx;
}
(async () => {
  const memory = new Map();
  const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  const dados = { nome: 'Cliente Teste', whatsapp: '88999991234', entrega: 'retirada', endereco: '', obs: 'Dado somente em memória' };
  const itens = [{ ID: '101' }, { ID: '102' }];
  let ctx = environment(storage);
  const first = await ctx.operacaoPedido_(dados, itens);
  assert.match(first, /^[A-Za-z0-9_-]{6,80}$/);
  assert.equal(await ctx.operacaoPedido_(dados, itens.slice().reverse()), first, 'Ordem dos IDs não cria outra intenção');
  const saved = storage.getItem('tk_pedido_operacao_v1');
  assert(!saved.includes(dados.nome) && !saved.includes(dados.whatsapp) && !saved.includes(dados.obs), 'Armazenamento não contém os dados pessoais');
  ctx = environment(storage);
  assert.equal(await ctx.operacaoPedido_(dados, itens), first, 'Recarregamento mantém a chave da intenção pendente');
  assert.notEqual(await ctx.operacaoPedido_({ ...dados, obs: 'Outra intenção' }, itens), first);
  ctx.concluirOperacaoPedido_();
  assert.equal(memory.size, 0);
  assert.notEqual(await ctx.operacaoPedido_(dados, itens), first, 'Pedido concluído permite nova intenção igual');
  const blocked = { getItem() { throw Error('Indisponível'); }, setItem() { throw Error('Indisponível'); }, removeItem() { throw Error('Indisponível'); } };
  ctx = environment(blocked, { getRandomValues() { throw Error('Indisponível'); } });
  const fallback = await ctx.operacaoPedido_(dados, itens);
  assert.match(fallback, /^[A-Za-z0-9_-]{6,80}$/);
  assert.equal(await ctx.operacaoPedido_(dados, itens), fallback);
  ctx.concluirOperacaoPedido_();
  console.log('OK: intenção estável, recarregamento, nova compra, privacidade e contingência de armazenamento.');
})().catch(error => { console.error(error); process.exitCode = 1; });
