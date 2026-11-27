/* App 2.6 — PIN da pessoa guardado na conta (/app/pin): um PIN por usuário, valendo em todo celular; registro de toda
 * tentativa; a cada 3 erros seguidos, alerta sigiloso (não grava nas Mensagens). Mesmo Worker, D1 SQLite e backend simulado
 * de tests/worker_esteira.js (apenas o preparo). Nada vai à Wafly de verdade. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let harness = fs.readFileSync(path.join(__dirname, 'worker_esteira.js'), 'utf8').replace(/\r/g, '').split('  // acesso\n')[0];
harness = harness.replace('tk_ig_esteira.mjs', 'tk_ig_app_pin.mjs');
const cenarios = String.raw`
  const pend = [], ctx2 = { waitUntil: (p) => { pend.push(p); } };
  const esperar = async () => { while (pend.length) await pend.shift(); };
  const Q = async (whats, metodo, rota, corpo) => {
    const h = { 'Content-Type': 'application/json', 'Origin': 'https://tenkitermodas.com.br' };
    if (whats) { h['X-TK-Whats'] = whats; h['X-TK-Sessao'] = 'tk3.sessao-' + whats; }
    const r = await w.fetch(new Request('https://ig.fake' + rota, { method: metodo, headers: h, body: corpo == null ? undefined : JSON.stringify(corpo) }), env, ctx2);
    let j = null; try { j = await r.clone().json(); } catch (e) { /* sem corpo */ }
    await esperar(); return { status: r.status, j };
  };
  const log = async () => ((await env.DB.prepare('SELECT * FROM app_pin_log ORDER BY id').all()).results);

  let x = await Q(null, 'GET', '/app/pin');
  chk('sem sessão é recusado', x.status === 401);
  x = await Q(PABLO, 'GET', '/app/pin');
  chk('sem PIN ainda: temPin=false', x.status === 200 && x.j.ok && x.j.temPin === false, x.j);
  x = await Q(IARA, 'POST', '/app/pin', { pin: '12a4' });
  chk('PIN que não tem 4 números é recusado', x.status === 400 && /4 números/.test(x.j.erro), x.j);
  x = await Q(IARA, 'POST', '/app/pin', { pin: '2580', aparelho: 'cel-loja-1', modelo: 'Samsung A15' });
  chk('Iara cria o PIN', x.status === 200 && x.j.ok && x.j.sal && x.j.hash && x.j.iter === 6000, x.j);
  const criado = x.j;
  x = await Q(IARA, 'GET', '/app/pin');
  chk('em outro celular, a mesma conta já tem PIN (não pede outro)', x.j.temPin === true && x.j.hash === criado.hash && x.j.sal === criado.sal, x.j);
  const nodeCrypto = require('crypto');
  const meu = nodeCrypto.pbkdf2Sync('2580', Buffer.from(criado.sal, 'base64'), criado.iter, 32, 'sha256').toString('base64');
  chk('hash igual ao do app (PBKDF2-SHA256, 256 bits, Base64): o celular confere na hora', meu === criado.hash);
  x = await Q(CLARICE, 'GET', '/app/pin');
  chk('outra pessoa não lê o PIN da Iara (cada uma só vê o próprio)', x.j.temPin === false, x.j);
  chk('o registro guarda a criação do PIN, sem o PIN em si', (await log()).some((l) => l.evento === 'pin_criado' && l.whats === IARA && l.modelo === 'Samsung A15') && !JSON.stringify(await log()).includes('2580'));

  await Q(PABLO, 'GET', '/app/pin');   // Admin total que usa o app passa a receber os alertas
  const admins = (await env.DB.prepare('SELECT whats FROM app_admin_alerta').all()).results.map((l) => l.whats);
  chk('Admin total que usa o app entra na lista de alertas; quem não é, não', admins.includes(PABLO) && !admins.includes(IARA), admins);

  for (let i = 1; i <= 2; i++) { x = await Q(IARA, 'POST', '/app/pin/tentativa', { certo: false, aparelho: 'cel-loja-1', modelo: 'Samsung A15', quemUsava: 'Clarice', nome: 'Iara' }); }
  chk('2 erros: sem alerta, tentativa continua liberada', x.j.ok && x.j.seguidos === 2 && x.j.alerta === false, x.j);
  x = await Q(IARA, 'POST', '/app/pin/tentativa', { certo: false, aparelho: 'cel-loja-1', modelo: 'Samsung A15', quemUsava: 'Clarice', nome: 'Iara' });
  chk('3º erro seguido dispara o alerta (a Wafly simulada recusa, fica registrado)', x.j.seguidos === 3 && x.j.alerta === true, x.j);
  const l3 = (await log()).filter((l) => l.evento === 'pin_errado');
  chk('cada erro fica no registro com celular, modelo e quem estava usando', l3.length === 3 && l3[2].quem_usava === 'Clarice' && l3[2].seguidos === 3 && l3[2].alerta !== '', l3[2]);
  for (let i = 0; i < 3; i++) x = await Q(IARA, 'POST', '/app/pin/tentativa', { certo: false });
  chk('sem trava: o 6º erro ainda é aceito e alerta de novo', x.j.ok && x.j.seguidos === 6 && x.j.alerta === true, x.j);
  x = await Q(IARA, 'POST', '/app/pin/tentativa', { certo: true, aparelho: 'cel-loja-1' });
  chk('acerto zera a contagem e também fica no registro', x.j.ok && x.j.seguidos === 0 && (await log()).slice(-1)[0].evento === 'pin_certo');
  x = await Q(IARA, 'POST', '/app/pin', { pin: '1397' });
  chk('trocar o PIN muda o hash (vale nos outros celulares na próxima consulta)', x.j.ok && x.j.hash !== criado.hash);

  chk('mensagem de alerta enviada pela loja é reconhecida (não entra nas Mensagens)', W.pinEhAlerta_({ direcao: 'saida', texto: W.PIN_MARCA_ + '\n3 PINs errados' }) && !W.pinEhAlerta_({ direcao: 'entrada', texto: W.PIN_MARCA_ }) && !W.pinEhAlerta_({ direcao: 'saida', texto: 'oi' }));
  console.log(ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
`;
vm.runInThisContext('(function(require,__dirname,__import){' + harness.replace('await import(', 'await __import(') + cenarios + '})', { filename: __filename })(require, __dirname, (u) => import(u));
