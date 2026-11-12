#!/usr/bin/env node
/* Regressão da caixa de fotos: erro de confirmação nunca descarta a pendência.
 * Teste 100% simulado em VM; NÃO acessa D1, clientes ou Worker real.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '..', 'admin-caixa-fotos.js'), 'utf8');

function criarCenario(respostas, temSessao = true) {
  const store = new Map();
  const eventos = new Map();
  const chamadas = [];
  const avisos = [];
  const intervalos = [];
  const atrasados = [];
  let agora = 1_000_000;
  const ctx = {
    window: {
      addEventListener: (tipo, fn) => eventos.set('window:' + tipo, fn),
      tkAvisoRapido: (texto) => avisos.push(texto)
    },
    document: {
      hidden: false,
      addEventListener: (tipo, fn) => eventos.set('document:' + tipo, fn)
    },
    location: { search: '' },
    getSessao: () => temSessao ? { whatsapp: 'usuario-ficticio', sessao: 'tk-ficticia' } : null,
    INSTAGRAM_URL: 'https://fake.worker.invalid',
    localStorage: {
      getItem: (chave) => store.get(chave) || null,
      setItem: (chave, valor) => store.set(chave, valor)
    },
    Date: class extends Date { static now() { return agora; } },
    setTimeout: (fn, ms) => { atrasados.push({ fn, ms }); return atrasados.length; },
    setInterval: (fn, ms) => { intervalos.push({ fn, ms }); return intervalos.length; },
    fetch: (url, opcoes) => {
      chamadas.push({ url, metodo: opcoes.method, corpo: JSON.parse(opcoes.body), headers: opcoes.headers });
      assert.ok(respostas.length, 'Requisição inesperada sem resposta configurada');
      const prox = respostas.shift();
      if (prox instanceof Error) return Promise.reject(prox);
      return Promise.resolve({ ok: prox.http >= 200 && prox.http < 300, status: prox.http,
        json: () => Promise.resolve(prox.corpo) });
    }
  };
  vm.runInNewContext(script, ctx, { filename: 'admin-caixa-fotos.js' });
  const emit = (tipo, detalhe = {}) => {
    const fn = eventos.get(tipo);
    assert.equal(typeof fn, 'function', 'Evento não registrado: ' + tipo);
    fn(detalhe);
  };
  return {
    store, eventos, chamadas, avisos, intervalos, atrasados, ctx, emit,
    avancar: (ms) => { agora += ms; },
    pendentes: () => JSON.parse(store.get('tk_caixa_usar_v1') || '[]'),
    salvar: (ids, id = 'P-100') =>
      emit('window:tk:peca-salva', { detail: { rascunhoId: 'caixa:' + ids.join('.'), id, codigo: id } })
  };
}

const esvaziarMicrotasks = async () => {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
};
let aprovados = 0;
async function prova(nome, run) {
  await run();
  aprovados++;
  console.log('PASS:', nome);
}

(async () => {
  await prova('HTTP 500 mantém pendência e avisa sem duplicar requisição', async () => {
    const x = criarCenario([{ http: 500, corpo: { ok: false, erro: 'falha simulada' } },
                             { http: 200, corpo: { ok: true, marcadas: 2 } }]);
    x.salvar([11, 12]);
    await esvaziarMicrotasks();
    assert.equal(x.chamadas.length, 1);
    assert.equal(x.chamadas[0].url, 'https://fake.worker.invalid/esteira/caixa/usar');
    assert.equal(x.chamadas[0].metodo, 'POST');
    assert.deepEqual(x.chamadas[0].corpo, { ids: [11, 12], uso: 'criado', produto: 'P-100', produtoNome: 'P-100' });
    assert.equal(x.pendentes().length, 1);
    assert.ok(x.avisos.some(s => /pendente neste aparelho/i.test(s)), x.avisos.join(' | '));
    assert.ok(!x.store.get('tk_caixa_usar_v1').includes('tk-ficticia'), 'Sessão vazou para o armazenamento');
    x.emit('window:online');
    await esvaziarMicrotasks();
    assert.equal(x.chamadas.length, 1, 'Backoff não evitou requisição antecipada');
    x.avancar(30_001);
    x.emit('window:online');
    await esvaziarMicrotasks();
    assert.equal(x.chamadas.length, 2);
    assert.equal(x.pendentes().length, 0);
    assert.ok(x.avisos.some(s => /confirmou o uso das fotos/i.test(s)));
    x.emit('window:focus');
    await esvaziarMicrotasks();
    assert.equal(x.chamadas.length, 2, 'Pendência resolvida foi reenviada');
  });

  await prova('HTTP 200 com ok:false também mantém pendência', async () => {
    const x = criarCenario([{ http: 200, corpo: { ok: false } }]);
    x.salvar([21], 'P-21');
    await esvaziarMicrotasks();
    assert.equal(x.pendentes().length, 1);
    assert.equal(x.chamadas.length, 1);
    assert.equal(x.avisos.length, 1);
  });

  await prova('Sem conexão: reconciliação posterior via focus e temporizador', async () => {
    const x = criarCenario([new Error('rede indisponível'), { http: 200, corpo: { ok: true } }]);
    x.salvar([31], 'P-31');
    await esvaziarMicrotasks();
    assert.equal(x.pendentes().length, 1);
    assert.equal(x.intervalos.length, 1);
    assert.equal(x.intervalos[0].ms, 60000);
    x.intervalos[0].fn();
    await esvaziarMicrotasks();
    assert.equal(x.chamadas.length, 1);
    x.avancar(31_000);
    x.emit('window:focus');
    await esvaziarMicrotasks();
    assert.equal(x.pendentes().length, 0);
    assert.equal(x.chamadas.length, 2);
  });

  await prova('Aba oculta não reenvia; voltar à tela retoma', async () => {
    const x = criarCenario([{ http: 500, corpo: {} }, { http: 200, corpo: { ok: true } }]);
    x.salvar([41], 'P-41');
    await esvaziarMicrotasks();
    x.avancar(61_000);
    x.ctx.document.hidden = true;
    x.intervalos[0].fn();
    await esvaziarMicrotasks();
    assert.equal(x.chamadas.length, 1);
    x.ctx.document.hidden = false;
    x.emit('document:visibilitychange');
    await esvaziarMicrotasks();
    assert.equal(x.chamadas.length, 2);
    assert.equal(x.pendentes().length, 0);
  });

  await prova('Duas peças: sucesso de uma não apaga pendência da outra', async () => {
    const x = criarCenario([{ http: 500, corpo: { ok: false } }, { http: 200, corpo: { ok: true } },
                             { http: 200, corpo: { ok: true } }]);
    x.salvar([51], 'P-51');
    x.salvar([52], 'P-52');
    await esvaziarMicrotasks();
    assert.equal(x.chamadas.length, 2);
    assert.deepEqual(x.pendentes().map(v => v.produto), ['P-51']);
    x.avancar(31_000);
    x.emit('window:online');
    await esvaziarMicrotasks();
    assert.equal(x.pendentes().length, 0);
    assert.deepEqual(x.chamadas.map(c => c.corpo.produto), ['P-51', 'P-52', 'P-51']);
  });

  await prova('Sem sessão não envia e preserva pendência local', async () => {
    const x = criarCenario([], false);
    x.salvar([61], 'P-61');
    await esvaziarMicrotasks();
    assert.equal(x.chamadas.length, 0);
    assert.equal(x.pendentes().length, 1);
  });

  await prova('Registro histórico inválido não é excluído silenciosamente', async () => {
    const x = criarCenario([]);
    x.store.set('tk_caixa_usar_v1', JSON.stringify([{ k: 'antigo-sem-id', ids: [], produto: 'P-70' }]));
    x.emit('window:online');
    await esvaziarMicrotasks();
    assert.equal(x.chamadas.length, 0);
    assert.equal(x.pendentes().length, 1);
  });

  console.log('PASS caixa_fotos_recuperacao:', aprovados, 'provas, sem rede real.');
})().catch(err => { console.error(err); process.exitCode = 1; });
