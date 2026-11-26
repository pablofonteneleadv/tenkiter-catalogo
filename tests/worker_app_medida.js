/* 7.96.14 — Fase 0 do app 2.6: medida anônima do tempo de abertura de cada área (/app/medida).
 * Mesmo Worker, D1 SQLite e backend simulado de tests/worker_esteira.js (apenas o preparo). */
const fs = require('fs'), path = require('path'), vm = require('vm');
let harness = fs.readFileSync(path.join(__dirname, 'worker_esteira.js'), 'utf8').replace(/\r/g, '').split('  // acesso\n')[0];
harness = harness.replace('tk_ig_esteira.mjs', 'tk_ig_app_medida.mjs');
const cenarios = String.raw`
  const pend = [], ctx2 = { waitUntil: (p) => { pend.push(p); } };
  const esperar = async () => { while (pend.length) await pend.shift(); };
  const Q = async (whats, corpo, o = {}) => {
    const h = { 'Content-Type': 'application/json', 'Origin': 'https://tenkitermodas.com.br' };
    if (whats) { h['X-TK-Whats'] = whats; h['X-TK-Sessao'] = o.sessao || 'tk3.sessao-' + whats; }
    const r = await w.fetch(new Request('https://ig.fake/app/medida', { method: 'POST', headers: h, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) }), env, ctx2);
    let j = null; try { j = await r.clone().json(); } catch (e) { /* sem corpo */ }
    return { r, j, status: r.status };
  };
  const linhas = async () => { try { return (await env.DB.prepare('SELECT * FROM app_medida').all()).results; } catch (e) { return []; } };
  const BOA = { area: 'mensagens', via: 'app', tipo: 'frio', html_ms: 420, dom_ms: 1800, load_ms: 2600, pronto_ms: 0, app_v: '2.5.6', site_v: '7.96.14', rede: '4g', cpu: 8, mem: 4, aparelho: 'a1b2c3d4e5' };

  let x = await Q(null, BOA); await esperar();
  chk('sem sessão é recusada e nada é gravado', x.status === 401 && (await linhas()).length === 0, { s: x.status });
  x = await Q(IARA, BOA); await esperar();
  chk('funcionária logada grava a medida', x.status === 200 && x.j && x.j.ok && (await linhas()).length === 1, { s: x.status, j: x.j });
  const l = (await linhas())[0];
  chk('a medida não guarda WhatsApp, sessão nem nome', !JSON.stringify(l).includes(IARA) && !JSON.stringify(l).includes('tk3.') && !('whats' in l) && !('nome' in l), l);
  chk('campos gravados como enviados', l.area === 'mensagens' && l.via === 'app' && l.tipo === 'frio' && l.dom_ms === 1800 && l.load_ms === 2600 && l.app_v === '2.5.6' && l.aparelho === 'a1b2c3d4e5', l);
  for (const [nome, mudar] of [
    ['área fora da lista', { area: 'banco' }], ['via fora da lista', { via: 'x' }], ['tipo fora da lista', { tipo: 'x' }],
    ['tempo negativo', { dom_ms: -1 }], ['tempo gigante', { load_ms: 999999 }], ['dom zero', { dom_ms: 0 }], ['tempo não inteiro', { html_ms: 1.5 }]
  ]) {
    const antes = (await linhas()).length;
    x = await Q(IARA, Object.assign({}, BOA, mudar)); await esperar();
    chk('recusa ' + nome + ' (400) sem gravar', x.status === 400 && (await linhas()).length === antes, { s: x.status });
  }
  x = await Q(IARA, Object.assign({}, BOA, { aparelho: 'ABC<script>', app_v: 'x"y', rede: '5g', mem: 3, cpu: 999 })); await esperar();
  const ult = (await linhas()).slice(-1)[0];
  chk('valores estranhos opcionais viram vazio/zero, sem quebrar', x.status === 200 && ult.aparelho === '' && ult.app_v === '' && ult.rede === '' && ult.mem === 0 && ult.cpu === 0, ult);
  x = await Q(IARA, 'x'.repeat(2000)); await esperar();
  chk('corpo grande demais é recusado (413)', x.status === 413);
  x = await Q(IARA, '{quebrado'); await esperar();
  chk('JSON quebrado é recusado (400)', x.status === 400);
  console.log(ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
`;
vm.runInThisContext('(function(require,__dirname,__import){' + harness.replace('await import(', 'await __import(') + cenarios + '})', { filename: __filename })(require, __dirname, (u) => import(u));
