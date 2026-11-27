/* Área "Equipe": comunicados com "Li e entendi", grupos Gestão e Geral, conversas privadas e tarefas, só para a equipe.
 * Gestão (publica, cria tarefa, apaga, grupo Gestão) vem das permissões: "equipe_gestao" ou perfis Admin total, Admin e Responsável RH.
 * Mesmo Worker, D1 SQLite e backend simulado de tests/worker_esteira.js (apenas o preparo). Avisos (OneSignal) simulados. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let harness = fs.readFileSync(path.join(__dirname, 'worker_esteira.js'), 'utf8').replace(/\r/g, '').split('  // acesso\n')[0];
harness = harness.replace('tk_ig_esteira.mjs', 'tk_ig_equipe.mjs');
const cenarios = String.raw`
  const pend = [], ctx2 = { waitUntil: (p) => { pend.push(p); } };
  const esperar = async () => { while (pend.length) await pend.shift(); };
  const avisos = [], fetchBase = globalThis.fetch;
  // Iara tem o perfil "Admin" (gestão sem ser Admin total); Clarice é funcionária; Visita não é da equipe.
  const PERFIS = { '88999990002': ['Admin'], '88999990003': ['Funcionário'] };
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://api.onesignal.com/notifications')) { avisos.push(JSON.parse(init.body)); return new Response('{"id":"x"}'); }
    if (String(u).startsWith('https://api.fake/') && init && init.method === 'POST') { const b = JSON.parse(init.body); if (b.action === 'sessao' && PERFIS[b.whatsapp]) { const r = await fetchBase(u, init), j = await r.json(); if (j.usuario) j.usuario.perfis = PERFIS[b.whatsapp]; return new Response(JSON.stringify(j)); } }
    return fetchBase(u, init);
  };
  const Q = async (whats, metodo, rota, corpo) => {
    const h = { 'Content-Type': 'application/json', 'Origin': 'https://tenkitermodas.com.br' };
    if (whats) { h['X-TK-Whats'] = whats; h['X-TK-Sessao'] = 'tk3.sessao-' + whats; }
    const r = await w.fetch(new Request('https://ig.fake' + rota, { method: metodo, headers: h, body: corpo == null ? undefined : JSON.stringify(corpo) }), env, ctx2);
    let j = null; try { j = await r.clone().json(); } catch (e) { /* sem corpo */ }
    await esperar(); return { status: r.status, j };
  };
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS cfg (chave TEXT PRIMARY KEY, valor TEXT)").run();
  await env.DB.prepare("INSERT OR REPLACE INTO cfg (chave, valor) VALUES ('mobile_onesignal_key', 'k')").run();

  chk('perfis que são gestão: Admin total, Admin e Responsável RH (com ou sem acento); permissão equipe_gestao também',
    W.eqEhGestao_(Object.assign(['catalogo_admin'], { msgPerfis: ['Responsavel RH'] })) && W.eqEhGestao_(Object.assign([], { msgPerfis: ['Responsável RH'] })) && W.eqEhGestao_(Object.assign([], { msgPerfis: ['Admin'] }))
    && W.eqEhGestao_(['equipe_gestao']) && W.eqEhGestao_(['gerir_acessos']) && !W.eqEhGestao_(Object.assign(['catalogo_admin'], { msgPerfis: ['Encarregado', 'Funcionário'] })));
  let x = await Q(null, 'GET', '/equipe/inicio');
  chk('sem sessão é recusado', x.status === 401);
  x = await Q(VISITA, 'GET', '/equipe/inicio');
  chk('quem não é da equipe não entra', x.status === 403 && /só para a equipe/.test(x.j.erro), x);
  for (const p of [PABLO, IARA, CLARICE]) await Q(p, 'GET', '/equipe/inicio');
  x = await Q(CLARICE, 'GET', '/equipe/inicio');
  chk('funcionária vê o Geral e não vê a Gestão, e não publica', x.j.ok && x.j.salas.some((s) => s.id === 'geral') && !x.j.salas.some((s) => s.id === 'gestao') && x.j.eu.publica === false && x.j.eu.gestao === false, x.j);
  chk('lista as colegas para conversar no privado', x.j.pessoas.some((p) => p.whats === IARA) && !x.j.pessoas.some((p) => p.whats === CLARICE));
  chk('a tela não traz mais lista de quem publica (vem das permissões)', !('config' in x.j));
  x = await Q(IARA, 'GET', '/equipe/inicio');
  chk('perfil Admin é gestão: vê a Gestão e publica', x.j.salas.map((s) => s.id).join() === 'gestao,geral' && x.j.eu.publica && x.j.eu.gestao && !x.j.eu.admin, x.j.eu);
  x = await Q(PABLO, 'POST', '/equipe/config', { publicadores: [CLARICE] });
  chk('a configuração por lista foi aposentada (410, aponta para as permissões)', x.status === 410 && /permiss/.test(x.j.erro));

  for (const [w, s] of [[PABLO, 1], [IARA, 2], [CLARICE, 3]]) await Q(w, 'POST', '/app/aparelho', { subscription: 'aaaaaaaa-bbbb-cccc-dddd-00000000000' + s });
  x = await Q(CLARICE, 'POST', '/equipe/comunicado', { titulo: 'Oi' });
  chk('quem não é gestão não cria comunicado', x.status === 403);
  x = await Q(IARA, 'POST', '/equipe/comunicado', { titulo: 'Novo horário de sábado', texto: 'A loja abre às 8h.', importante: true });
  chk('gestão publica comunicado importante', x.j.ok && x.j.id > 0, x.j);
  const cid = x.j.id;
  chk('o aviso vai para as outras pessoas da equipe (não para quem publicou)', avisos.length === 1 && avisos[0].data.comunicado === String(cid) && avisos[0].include_subscription_ids.length === 2 && !avisos[0].include_subscription_ids.includes('aaaaaaaa-bbbb-cccc-dddd-000000000002'), avisos);
  x = await Q(CLARICE, 'GET', '/equipe/inicio');
  const c1 = x.j.comunicados.find((c) => c.id === cid);
  chk('aparece sem ler para a Clarice', c1 && c1.lido === false && c1.importante, c1);
  await Q(CLARICE, 'POST', '/equipe/lido', { comunicado: cid }); x = await Q(CLARICE, 'POST', '/equipe/lido', { comunicado: cid });
  chk('"Li e entendi" grava uma vez só', x.j.ok);
  x = await Q(IARA, 'GET', '/equipe/leituras?id=' + cid);
  chk('gestão vê quem leu e quem falta', x.j.leram.length === 1 && x.j.faltam.some((f) => f.nome === 'Pablo'), x.j);
  chk('funcionária não vê o relatório de leitura', (await Q(CLARICE, 'GET', '/equipe/leituras?id=' + cid)).status === 403);
  x = await Q(IARA, 'POST', '/equipe/lembrar', { comunicado: cid });
  chk('"Lembrar quem falta" avisa só quem não leu', x.j.ok && x.j.faltam === 1);
  chk('funcionária não apaga comunicado', (await Q(CLARICE, 'POST', '/equipe/comunicado/apagar', { comunicado: cid })).status === 403);
  x = await Q(PABLO, 'POST', '/equipe/comunicado', { titulo: 'Rascunho errado' }); const cErr = x.j.id;
  x = await Q(IARA, 'POST', '/equipe/comunicado/apagar', { comunicado: cErr });
  chk('gestão apaga comunicado (sai da lista de todas)', x.j.ok && !(await Q(CLARICE, 'GET', '/equipe/inicio')).j.comunicados.some((c) => c.id === cErr));

  x = await Q(CLARICE, 'POST', '/equipe/mensagem', { sala: 'gestao', texto: 'oi' });
  chk('funcionária não escreve na Gestão', x.status === 403);
  const a0 = avisos.length;
  x = await Q(PABLO, 'POST', '/equipe/mensagem', { sala: 'gestao', texto: 'reunião às 18h' });
  chk('gestão escreve na Gestão', x.j.ok);
  x = await Q(IARA, 'POST', '/equipe/mensagem', { sala: 'geral', texto: 'Bom dia, equipe!' });
  chk('qualquer pessoa da equipe escreve no Geral', x.j.ok);
  x = await Q(PABLO, 'GET', '/equipe/inicio');
  chk('não lidas por grupo', x.j.salas.find((s) => s.id === 'geral').naoLidas === 1, x.j.salas);
  x = await Q(PABLO, 'GET', '/equipe/sala?id=geral');
  chk('abrir o grupo traz as mensagens e marca como lidas', x.j.mensagens.length === 1 && x.j.mensagens[0].autor === 'Iara' && (await Q(PABLO, 'GET', '/equipe/inicio')).j.salas.find((s) => s.id === 'geral').naoLidas === 0);

  x = await Q(CLARICE, 'POST', '/equipe/mensagem', { com: IARA, texto: 'me ajuda na vitrine?' });
  chk('conversa privada entre colegas', x.j.ok && x.j.sala.startsWith('p:'), x.j);
  const sala = x.j.sala;
  chk('ninguém de fora lê uma conversa privada (nem o Admin total)', (await Q(PABLO, 'GET', '/equipe/sala?id=' + sala)).status === 403);
  x = await Q(IARA, 'GET', '/equipe/inicio');
  chk('a privada aparece com o nome de quem escreveu e 1 não lida', x.j.salas.some((s) => s.id === sala && s.nome === 'Clarice' && s.naoLidas === 1), x.j.salas);
  chk('conversa privada só com quem é da equipe (não com cliente)', (await Q(IARA, 'POST', '/equipe/mensagem', { com: '88912345678', texto: 'oi' })).status === 403);
  chk('mensagem vazia é recusada', (await Q(IARA, 'POST', '/equipe/mensagem', { sala: 'geral', texto: '   ' })).status === 400);

  // ---- tarefas ----
  chk('funcionária não cria tarefa', (await Q(CLARICE, 'POST', '/equipe/tarefa', { titulo: 'x' })).status === 403);
  x = await Q(IARA, 'POST', '/equipe/tarefa', { titulo: 'Conferir o caixa da manhã', para: 'todos', repete: 'diaria' });
  chk('gestão cria tarefa diária para todas', x.j.ok);
  const tTodas = x.j.id;
  x = await Q(IARA, 'POST', '/equipe/tarefa', { titulo: 'Fotografar a chegada da Rose', para: CLARICE, prazo: '2020-01-01' });
  chk('gestão cria tarefa de uma pessoa, com prazo', x.j.ok);
  const tClarice = x.j.id;
  chk('tarefa para quem não é da equipe é recusada', (await Q(IARA, 'POST', '/equipe/tarefa', { titulo: 'x', para: '88912345678' })).status === 400);
  x = await Q(CLARICE, 'GET', '/equipe/tarefas');
  const tc = x.j.tarefas.find((t) => t.id === tClarice);
  chk('a Clarice vê a tarefa dela (atrasada) e a geral', tc && tc.minha && tc.atrasada && x.j.tarefas.some((t) => t.id === tTodas), x.j.tarefas);
  x = await Q(PABLO, 'GET', '/equipe/contagem');
  chk('contagem do painel inclui tarefas de hoje', x.j.tarefas >= 1 && x.j.total >= x.j.tarefas, x.j);
  chk('outra funcionária não marca a tarefa da Clarice', (await Q(VISITA, 'POST', '/equipe/tarefa/feita', { tarefa: tClarice })).status === 403);
  x = await Q(CLARICE, 'POST', '/equipe/tarefa/feita', { tarefa: tTodas });
  chk('tarefa geral: quem fizer marca, e fica "feita por" para todas', x.j.ok && (await Q(PABLO, 'GET', '/equipe/tarefas')).j.tarefas.find((t) => t.id === tTodas).feita.por === 'Clarice');
  x = await Q(CLARICE, 'POST', '/equipe/tarefa/feita', { tarefa: tTodas, desfazer: true });
  chk('dá para desfazer', x.j.ok && !(await Q(PABLO, 'GET', '/equipe/tarefas')).j.tarefas.find((t) => t.id === tTodas).feita);
  chk('funcionária não apaga tarefa', (await Q(CLARICE, 'POST', '/equipe/tarefa/apagar', { tarefa: tTodas })).status === 403);
  x = await Q(IARA, 'POST', '/equipe/tarefa/apagar', { tarefa: tTodas });
  chk('gestão apaga tarefa', x.j.ok && !(await Q(CLARICE, 'GET', '/equipe/tarefas')).j.tarefas.some((t) => t.id === tTodas));
  chk('rota desconhecida: 404 legível', (await Q(IARA, 'POST', '/equipe/xyz', {})).status === 404);
  chk('quem não é da equipe não liga avisos da Equipe', (await Q(VISITA, 'POST', '/app/aparelho', { subscription: '11111111-2222-3333-4444-555555555555' })).j.ok === false);
  console.log(ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
`;
vm.runInThisContext('(function(require,__dirname,__import){' + harness.replace('await import(', 'await __import(') + cenarios + '})', { filename: __filename })(require, __dirname, (u) => import(u));
