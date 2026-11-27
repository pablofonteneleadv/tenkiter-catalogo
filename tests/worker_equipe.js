/* Área "Equipe" (27/11/2026): comunicados com "Li e entendi", grupos Gestão e Geral e conversas privadas, só para a equipe.
 * Mesmo Worker, D1 SQLite e backend simulado de tests/worker_esteira.js (apenas o preparo). Avisos (OneSignal) simulados. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let harness = fs.readFileSync(path.join(__dirname, 'worker_esteira.js'), 'utf8').replace(/\r/g, '').split('  // acesso\n')[0];
harness = harness.replace('tk_ig_esteira.mjs', 'tk_ig_equipe.mjs');
const cenarios = String.raw`
  const pend = [], ctx2 = { waitUntil: (p) => { pend.push(p); } };
  const esperar = async () => { while (pend.length) await pend.shift(); };
  const avisos = [], fetchBase = globalThis.fetch;
  globalThis.fetch = async (u, init) => { if (String(u).startsWith('https://api.onesignal.com/notifications')) { avisos.push(JSON.parse(init.body)); return new Response('{"id":"x"}'); } return fetchBase(u, init); };
  const Q = async (whats, metodo, rota, corpo) => {
    const h = { 'Content-Type': 'application/json', 'Origin': 'https://tenkitermodas.com.br' };
    if (whats) { h['X-TK-Whats'] = whats; h['X-TK-Sessao'] = 'tk3.sessao-' + whats; }
    const r = await w.fetch(new Request('https://ig.fake' + rota, { method: metodo, headers: h, body: corpo == null ? undefined : JSON.stringify(corpo) }), env, ctx2);
    let j = null; try { j = await r.clone().json(); } catch (e) { /* sem corpo */ }
    await esperar(); return { status: r.status, j };
  };
  // Pablo (Admin total), Iara e Clarice (equipe). Visita não é da equipe.
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS cfg (chave TEXT PRIMARY KEY, valor TEXT)").run();
  await env.DB.prepare("INSERT OR REPLACE INTO cfg (chave, valor) VALUES ('mobile_onesignal_key', 'k')").run();

  let x = await Q(null, 'GET', '/equipe/inicio');
  chk('sem sessão é recusado', x.status === 401);
  x = await Q(VISITA, 'GET', '/equipe/inicio');
  chk('quem não é da equipe não entra', x.status === 403 && /só para a equipe/.test(x.j.erro), x);
  for (const p of [PABLO, IARA, CLARICE]) await Q(p, 'GET', '/equipe/inicio');
  x = await Q(IARA, 'GET', '/equipe/inicio');
  chk('funcionária vê o grupo Geral e não vê a Gestão', x.j.ok && x.j.salas.some((s) => s.id === 'geral') && !x.j.salas.some((s) => s.id === 'gestao') && x.j.eu.publica === false, x.j);
  chk('lista as colegas para conversar no privado', x.j.pessoas.some((p) => p.whats === CLARICE) && !x.j.pessoas.some((p) => p.whats === IARA));
  x = await Q(PABLO, 'GET', '/equipe/inicio');
  chk('Admin total vê Gestão e Geral e pode publicar', x.j.salas.map((s) => s.id).join() === 'gestao,geral' && x.j.eu.publica && x.j.config, x.j.salas);

  x = await Q(CLARICE, 'POST', '/app/aparelho', { subscription: 'aaaaaaaa-bbbb-cccc-dddd-000000000002' });
  chk('funcionária (sem acesso às Mensagens) liga os avisos da Equipe no celular', x.j.ok === true, x.j);
  await Q(PABLO, 'POST', '/app/aparelho', { subscription: 'aaaaaaaa-bbbb-cccc-dddd-000000000001' });
  await Q(IARA, 'POST', '/app/aparelho', { subscription: 'aaaaaaaa-bbbb-cccc-dddd-000000000003' });
  x = await Q(IARA, 'POST', '/equipe/comunicado', { titulo: 'Oi' });
  chk('quem não publica não cria comunicado', x.status === 403);
  x = await Q(PABLO, 'POST', '/equipe/config', { publicadores: [IARA], gestao: [CLARICE] });
  chk('Admin total escolhe quem publica (ex.: Karla) e quem está na Gestão', x.j.ok);
  x = await Q(CLARICE, 'POST', '/equipe/config', { publicadores: [CLARICE] });
  chk('só o Admin total muda essa escolha', x.status === 403);
  x = await Q(IARA, 'POST', '/equipe/comunicado', { titulo: 'Novo horário de sábado', texto: 'A loja abre às 8h.', importante: true });
  chk('quem foi escolhida publica', x.j.ok && x.j.id > 0, x.j);
  const cid = x.j.id;
  chk('comunicado importante avisa as outras pessoas da equipe (não quem publicou)', avisos.length === 1 && avisos[0].data.comunicado === String(cid) && avisos[0].data.area === 'equipe' && avisos[0].include_subscription_ids.length === 2 && !avisos[0].include_subscription_ids.includes('aaaaaaaa-bbbb-cccc-dddd-000000000003'), avisos);

  x = await Q(CLARICE, 'GET', '/equipe/inicio');
  const c1 = x.j.comunicados.find((c) => c.id === cid);
  chk('aparece sem ler para a Clarice, com contagem de leitura', c1 && c1.lido === false && c1.importante && c1.lidos === 0, c1);
  x = await Q(CLARICE, 'GET', '/equipe/contagem');
  chk('contagem do painel: 1 comunicado sem ler', x.j.comunicados === 1, x.j);
  x = await Q(CLARICE, 'POST', '/equipe/lido', { comunicado: cid }); await Q(CLARICE, 'POST', '/equipe/lido', { comunicado: cid });
  chk('"Li e entendi" grava uma vez só', x.j.ok);
  x = await Q(IARA, 'GET', '/equipe/leituras?id=' + cid);
  chk('quem publicou vê quem leu e quem falta', x.j.leram.length === 1 && x.j.faltam.some((f) => f.nome === 'Pablo'), x.j);
  x = await Q(CLARICE, 'GET', '/equipe/leituras?id=' + cid);
  chk('funcionária não vê o relatório de leitura', x.status === 403);
  const n0 = avisos.length;
  x = await Q(IARA, 'POST', '/equipe/lembrar', { comunicado: cid });
  chk('"Lembrar quem falta" avisa só quem não leu', x.j.ok && x.j.faltam === 1);

  x = await Q(CLARICE, 'POST', '/equipe/mensagem', { sala: 'gestao', texto: 'cheguei' });
  chk('Clarice (escolhida para a Gestão) escreve no grupo Gestão', x.j.ok, x.j);
  x = await Q(IARA, 'POST', '/equipe/mensagem', { sala: 'geral', texto: 'Bom dia, equipe!' });
  chk('qualquer pessoa da equipe escreve no Geral', x.j.ok);
  x = await Q(PABLO, 'GET', '/equipe/inicio');
  chk('não lidas por grupo', x.j.salas.find((s) => s.id === 'geral').naoLidas === 1 && x.j.salas.find((s) => s.id === 'gestao').naoLidas === 1, x.j.salas);
  x = await Q(PABLO, 'GET', '/equipe/sala?id=geral');
  chk('abrir o grupo traz as mensagens e marca como lidas', x.j.mensagens.length === 1 && x.j.mensagens[0].autor === 'Iara' && !x.j.mensagens[0].minha);
  chk('depois de abrir, o Geral fica sem não lidas', (await Q(PABLO, 'GET', '/equipe/inicio')).j.salas.find((s) => s.id === 'geral').naoLidas === 0);

  x = await Q(IARA, 'POST', '/equipe/mensagem', { com: CLARICE, texto: 'me ajuda na vitrine?' });
  chk('conversa privada entre colegas', x.j.ok && x.j.sala.startsWith('p:'), x.j);
  const sala = x.j.sala;
  x = await Q(PABLO, 'GET', '/equipe/sala?id=' + sala);
  chk('ninguém de fora lê uma conversa privada (nem o Admin total)', x.status === 403);
  x = await Q(CLARICE, 'GET', '/equipe/inicio');
  const pv = x.j.salas.find((s) => s.id === sala);
  chk('a privada aparece para a Clarice com o nome da Iara e 1 não lida', pv && pv.nome === 'Iara' && pv.naoLidas === 1, x.j.salas);
  x = await Q(CLARICE, 'GET', '/equipe/sala?com=' + IARA + '&depois=0');
  chk('abrir pelo nome da colega cai na mesma conversa', x.j.sala === sala && x.j.mensagens.length === 1);
  x = await Q(IARA, 'POST', '/equipe/mensagem', { sala: 'p:' + IARA + ':' + PABLO, texto: 'oi' });
  chk('sala privada montada à mão com a ordem errada é recusada', x.status === 403);
  x = await Q(IARA, 'POST', '/equipe/mensagem', { com: '88912345678', texto: 'oi' });
  chk('conversa privada só com quem é da equipe (não com cliente)', x.status === 403, x);
  x = await Q(IARA, 'POST', '/equipe/mensagem', { sala: 'geral', texto: '   ' });
  chk('mensagem vazia é recusada', x.status === 400);
  x = await Q(IARA, 'POST', '/equipe/aparelho-errado', {});
  chk('rota desconhecida: 404 legível', x.status === 404 && /inválida/.test(x.j.erro));
  x = await Q(VISITA, 'POST', '/app/aparelho', { subscription: '11111111-2222-3333-4444-555555555555' });
  chk('quem não é da equipe não liga avisos da Equipe', x.j.ok === false);
  console.log(ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
`;
vm.runInThisContext('(function(require,__dirname,__import){' + harness.replace('await import(', 'await __import(') + cenarios + '})', { filename: __filename })(require, __dirname, (u) => import(u));
