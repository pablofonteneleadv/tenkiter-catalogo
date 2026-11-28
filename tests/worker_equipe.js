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
  await Q(CLARICE, 'POST', '/equipe/lido', { comunicado: cid, entendimento: true }); x = await Q(CLARICE, 'POST', '/equipe/lido', { comunicado: cid, entendimento: true });
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

  // ---- dúvidas, sigilo e declaração individual de entendimento ----
  const LARA = '88999990005', GESTORA = '88999990006';
  usuarios[LARA] = { nome: 'Lara', permissoes: ['catalogo_cadastrar'] };
  usuarios[GESTORA] = { nome: 'Gestora', permissoes: ['equipe_gestao'] };
  x = await Q(GESTORA, 'GET', '/equipe/inicio');
  chk('permissão equipe_gestao sozinha dá acesso e gestão', x.status === 200 && x.j.eu.gestao, x);
  await Q(LARA, 'GET', '/equipe/inicio');
  chk('sem sessão não lista dúvidas', (await Q(null, 'GET', '/equipe/duvidas')).status === 401);
  chk('cliente não cria dúvida', (await Q(VISITA, 'POST', '/equipe/duvida', { texto: 'x', opId: 'visita-01' })).status === 403);
  chk('dúvida vazia é recusada', (await Q(CLARICE, 'POST', '/equipe/duvida', { texto: ' ', opId: 'duvida-01' })).status === 400);
  chk('dúvida precisa de identificador para reenvio seguro', (await Q(CLARICE, 'POST', '/equipe/duvida', { texto: 'Como faço?' })).status === 400);
  chk('dúvida vinculada exige comunicado existente', (await Q(CLARICE, 'POST', '/equipe/duvida', { texto: 'Como faço?', comunicado: 9999, opId: 'duvida-02' })).status === 404);
  x = await Q(CLARICE, 'POST', '/equipe/duvida', { texto: 'Como separar as roupas?', opId: 'publica-01' }); const publica = x.j.id;
  chk('funcionária cria dúvida pública por padrão', x.j.ok && x.j.estado === 'nova');
  x = await Q(LARA, 'GET', '/equipe/duvidas');
  chk('colega vê dúvida pública', x.j.duvidas.some((d) => d.id === publica && !d.sigilo));
  x = await Q(CLARICE, 'POST', '/equipe/duvida', { texto: 'Como separar as roupas?', opId: 'publica-01' });
  chk('reenvio da dúvida retorna o mesmo registro', x.j.id === publica && (await env.DB.prepare("SELECT COUNT(*) n FROM eq_duvida WHERE op_id='publica-01'").first()).n === 1);
  chk('mesmo identificador com outro texto não reaproveita dúvida silenciosamente', (await Q(CLARICE, 'POST', '/equipe/duvida', { texto: 'Outro assunto', opId: 'publica-01' })).status === 409);
  x = await Q(CLARICE, 'POST', '/equipe/duvida', { texto: 'Assunto reservado da Clarice', sigilo: true, opId: 'sigilo-01' }); const sigilo = x.j.id;
  const colega = await Q(LARA, 'GET', '/equipe/duvidas'), gestao = await Q(PABLO, 'GET', '/equipe/duvidas');
  chk('sigilo só aparece para autora e gestão', !colega.j.duvidas.some((d) => d.id === sigilo) && gestao.j.duvidas.some((d) => d.id === sigilo) && (await Q(CLARICE, 'GET', '/equipe/duvidas')).j.duvidas.some((d) => d.id === sigilo));
  chk('resposta da colega não contém nenhum texto sigiloso', !JSON.stringify(colega.j).includes('Assunto reservado'));
  chk('avisos de dúvida nunca levam o texto', !avisos.some((a) => a.data?.duvida && JSON.stringify(a).includes('Assunto reservado')));
  chk('tentativa direta de colega em dúvida sigilosa não revela existência', (await Q(LARA, 'POST', '/equipe/duvida/entendi', { duvida: sigilo })).status === 404);
  chk('funcionária não escolhe canal da dúvida', (await Q(CLARICE, 'POST', '/equipe/duvida/encaminhar', { duvida: publica, canal: 'geral' })).status === 403);
  chk('gestão não manda sigilo para Geral', (await Q(PABLO, 'POST', '/equipe/duvida/encaminhar', { duvida: sigilo, canal: 'geral' })).status === 403);
  chk('gestão precisa escolher um canal válido', (await Q(PABLO, 'POST', '/equipe/duvida/encaminhar', { duvida: publica, canal: 'gestao' })).status === 400);
  chk('autora não confirma antes da orientação', (await Q(CLARICE, 'POST', '/equipe/duvida/entendi', { duvida: publica })).status === 409);
  chk('gestão não responde antes de encaminhar', (await Q(PABLO, 'POST', '/equipe/duvida/responder', { duvida: publica, resposta: 'Por categoria.' })).status === 409);
  x = await Q(IARA, 'POST', '/equipe/duvida/encaminhar', { duvida: sigilo, canal: 'privado' }); const salaSigilo = x.j.sala;
  chk('sigilo vai para privado entre autora e gestora', x.j.ok && salaSigilo === 'p:' + IARA + ':' + CLARICE);
  x = await Q(PABLO, 'GET', '/equipe/duvidas');
  chk('outra gestão vê dúvida sigilosa, mas não recebe sala privada', x.j.duvidas.find((d) => d.id === sigilo).sala === '' && !x.j.duvidas.find((d) => d.id === sigilo).podeConversar);
  chk('Admin total segue sem ler conversa privada alheia', (await Q(PABLO, 'GET', '/equipe/sala?id=' + salaSigilo)).status === 403);
  chk('outra gestão não responde pela gestora responsável', (await Q(PABLO, 'POST', '/equipe/duvida/responder', { duvida: sigilo, resposta: 'Resposta.' })).status === 403);
  chk('sigilo não copia texto para mensagens do grupo', !(await env.DB.prepare("SELECT 1 FROM eq_msg WHERE sala='geral' AND texto LIKE '%Assunto reservado%'").first()));
  x = await Q(IARA, 'POST', '/equipe/duvida/responder', { duvida: sigilo, resposta: 'Orientação reservada.' });
  chk('orientação aguarda confirmação da autora', x.j.ok && x.j.estado === 'respondida');
  chk('gestão não confirma pela autora', (await Q(PABLO, 'POST', '/equipe/duvida/entendi', { duvida: sigilo })).status === 403);
  chk('autora confirma que entendeu a dúvida', (await Q(CLARICE, 'POST', '/equipe/duvida/entendi', { duvida: sigilo })).j.estado === 'resolvida');
  chk('confirmar a mesma dúvida é idempotente', (await Q(CLARICE, 'POST', '/equipe/duvida/entendi', { duvida: sigilo })).j.ok);
  chk('colega não reabre dúvida pública de outra pessoa', (await Q(LARA, 'POST', '/equipe/duvida/reabrir', { duvida: publica })).status === 403);
  x = await Q(PABLO, 'POST', '/equipe/duvida/encaminhar', { duvida: publica, canal: 'geral' });
  chk('gestão encaminha dúvida pública ao Geral', x.j.ok && x.j.sala === 'geral');
  chk('contador da autora inclui conversa para acompanhar', (await Q(CLARICE, 'GET', '/equipe/contagem')).j.duvidas >= 1);
  chk('contador de colega não inclui dúvidas alheias', (await Q(LARA, 'GET', '/equipe/contagem')).j.duvidas === 0);
  chk('contador da gestão inclui dúvida pendente', (await Q(PABLO, 'GET', '/equipe/contagem')).j.duvidas >= 1);

  x = await Q(IARA, 'POST', '/equipe/comunicado', { titulo: 'Como separar roupas', texto: 'Separe por categoria.' }); const comunicado = x.j.id;
  x = await Q(CLARICE, 'POST', '/equipe/lido', { comunicado });
  chk('leitura legada não se torna assinatura', x.j.ok && x.j.confirmado === false && !(await env.DB.prepare('SELECT 1 FROM eq_assinatura WHERE comunicado=?').bind(comunicado).first()));
  x = await Q(CLARICE, 'POST', '/equipe/lido', { comunicado, entendimento: true });
  chk('declaração explícita guarda nome, texto e horário da sessão', x.j.confirmado && x.j.assinatura.nome === 'Clarice' && x.j.assinatura.declaracao === 'Entendi e não tenho dúvidas sobre este comunicado.' && !!x.j.assinatura.em);
  await Q(CLARICE, 'POST', '/equipe/lido', { comunicado, entendimento: true });
  chk('retry da assinatura não duplica o histórico', (await env.DB.prepare('SELECT COUNT(*) n FROM eq_assinatura WHERE comunicado=?').bind(comunicado).first()).n === 1);
  x = await Q(CLARICE, 'POST', '/equipe/duvida', { texto: 'E as peças sem etiqueta?', sigilo: true, comunicado, opId: 'comunicado-01' }); const vinculada = x.j.id;
  const assinada = await env.DB.prepare('SELECT * FROM eq_assinatura WHERE comunicado=?').bind(comunicado).first();
  chk('perguntar revoga a confirmação sem apagar assinatura histórica', !!assinada.revogada_em && assinada.nome === 'Clarice');
  x = await Q(CLARICE, 'GET', '/equipe/inicio'); const card = x.j.comunicados.find((c) => c.id === comunicado);
  chk('comunicado indica dúvida pendente e não confirmado', card.duvidaPendente && !card.confirmado && card.assinaturas === 0);
  chk('não assina enquanto a dúvida está aberta', (await Q(CLARICE, 'POST', '/equipe/lido', { comunicado, entendimento: true })).status === 409);
  x = await Q(PABLO, 'GET', '/equipe/leituras?id=' + comunicado);
  chk('gestão distingue confirmações, faltantes e dúvidas', x.j.confirmaram.length === 0 && x.j.faltam.some((p) => p.nome === 'Clarice') && x.j.duvidas.some((d) => d.id === vinculada));
  await Q(PABLO, 'POST', '/equipe/duvida/encaminhar', { duvida: vinculada, canal: 'privado' });
  await Q(PABLO, 'POST', '/equipe/duvida/responder', { duvida: vinculada, resposta: 'Separe para conferência.' });
  chk('resposta ainda não autoriza assinatura sem autora entender', (await Q(CLARICE, 'POST', '/equipe/lido', { comunicado, entendimento: true })).status === 409);
  await Q(CLARICE, 'POST', '/equipe/duvida/entendi', { duvida: vinculada });
  chk('entender a dúvida não assina comunicado automaticamente', !(await env.DB.prepare("SELECT 1 FROM eq_assinatura WHERE comunicado=? AND revogada_em=''").bind(comunicado).first()));
  chk('após esclarecer, autora declara entendimento do comunicado', (await Q(CLARICE, 'POST', '/equipe/lido', { comunicado, entendimento: true })).j.confirmado);
  chk('nova assinatura preserva a anterior revogada', (await env.DB.prepare('SELECT COUNT(*) n FROM eq_assinatura WHERE comunicado=?').bind(comunicado).first()).n === 2);
  await Q(CLARICE, 'POST', '/equipe/duvida', { texto: 'E as peças sem etiqueta?', sigilo: true, comunicado, opId: 'comunicado-01' });
  chk('retry antigo da dúvida resolvida não revoga assinatura posterior', !!(await env.DB.prepare("SELECT 1 FROM eq_assinatura WHERE comunicado=? AND revogada_em=''").bind(comunicado).first()));
  x = await Q(IARA, 'POST', '/equipe/comunicado', { titulo: 'Orientação geral', texto: 'Somente o resumo revisado.', origemDuvida: vinculada }); const derivado = x.j.id;
  chk('gestão cria comunicado de solução revisada sem copiar sigilo', x.j.ok && (await env.DB.prepare('SELECT texto FROM eq_comunicado WHERE id=?').bind(derivado).first()).texto === 'Somente o resumo revisado.' && (await env.DB.prepare('SELECT duvida FROM eq_comunicado_origem WHERE comunicado=?').bind(derivado).first()).duvida === vinculada);
  x = await Q(CLARICE, 'POST', '/equipe/duvida/reabrir', { duvida: vinculada });
  chk('autora reabre e assinatura vigente é revogada', x.j.estado === 'nova' && !(await env.DB.prepare("SELECT 1 FROM eq_assinatura WHERE comunicado=? AND revogada_em=''").bind(comunicado).first()));
  chk('histórico conserva orientação ao reabrir', (await env.DB.prepare("SELECT COUNT(*) n FROM eq_duvida_evento WHERE duvida=? AND acao='responder'").bind(vinculada).first()).n === 1);
  chk('não transforma dúvida ainda aberta em comunicado', (await Q(IARA, 'POST', '/equipe/comunicado', { titulo: 'Ainda não', origemDuvida: vinculada })).status === 409);
  chk('funcionária não publica a solução como comunicado', (await Q(CLARICE, 'POST', '/equipe/comunicado', { titulo: 'Ainda não', origemDuvida: sigilo })).status === 403);
  // Intercala outra requisição entre a leitura otimista e a transação, sem relógio ou rede reais.
  {
    x = await Q(IARA, 'POST', '/equipe/comunicado', { titulo: 'Concorrência de dúvidas' }); const comCorrida = x.j.id;
    await Q(CLARICE, 'POST', '/equipe/lido', { comunicado: comCorrida, entendimento: true });
    const prepararOriginal = env.DB.prepare.bind(env.DB), loteOriginal = env.DB.batch.bind(env.DB);
    let intercalou = false;
    env.DB.prepare = (sql) => Object.assign(prepararOriginal(sql), { eqSqlTeste: sql });
    env.DB.batch = async (lote) => {
      if (!intercalou && lote.some((s) => s.eqSqlTeste?.startsWith('INSERT OR IGNORE INTO eq_duvida '))) {
        intercalou = true;
        await Q(CLARICE, 'POST', '/equipe/duvida', { texto: 'Pergunta pública que venceu', opId: 'corrida-op-01' });
      }
      return loteOriginal(lote);
    };
    try {
      x = await Q(CLARICE, 'POST', '/equipe/duvida', { texto: 'Pergunta reservada concorrente', sigilo: true, comunicado: comCorrida, opId: 'corrida-op-01' });
    } finally { env.DB.prepare = prepararOriginal; env.DB.batch = loteOriginal; }
    const vencedora = await env.DB.prepare("SELECT * FROM eq_duvida WHERE autor=? AND op_id='corrida-op-01'").bind(CLARICE).first();
    chk('mesmo opId concorrente com payload diferente devolve 409, nunca sucesso de sigilo falso', intercalou && x.status === 409 && vencedora.sigilo === 0 && vencedora.texto === 'Pergunta pública que venceu');
    chk('concorrente perdedora não revoga assinatura nem leitura de outro comunicado', !!(await env.DB.prepare("SELECT 1 FROM eq_assinatura WHERE comunicado=? AND whats=? AND revogada_em=''").bind(comCorrida, CLARICE).first()) && !!(await env.DB.prepare('SELECT 1 FROM eq_leitura WHERE comunicado=? AND whats=?').bind(comCorrida, CLARICE).first()));

    x = await Q(CLARICE, 'POST', '/equipe/duvida', { texto: 'Como aplicar a orientação?', comunicado: comCorrida, opId: 'corrida-reabrir-01' }); const dCorrida = x.j.id;
    await Q(PABLO, 'POST', '/equipe/duvida/encaminhar', { duvida: dCorrida, canal: 'privado' });
    await Q(PABLO, 'POST', '/equipe/duvida/responder', { duvida: dCorrida, resposta: 'Orientação esclarecida.' });
    intercalou = false;
    env.DB.prepare = (sql) => Object.assign(prepararOriginal(sql), { eqSqlTeste: sql });
    env.DB.batch = async (lote) => {
      if (!intercalou && lote.some((s) => s.eqSqlTeste?.startsWith('UPDATE eq_duvida SET estado='))) {
        intercalou = true;
        await Q(CLARICE, 'POST', '/equipe/duvida/entendi', { duvida: dCorrida });
        await Q(CLARICE, 'POST', '/equipe/lido', { comunicado: comCorrida, entendimento: true });
      }
      return loteOriginal(lote);
    };
    try { x = await Q(CLARICE, 'POST', '/equipe/duvida/reabrir', { duvida: dCorrida }); }
    finally { env.DB.prepare = prepararOriginal; env.DB.batch = loteOriginal; }
    chk('reabrir concorrente vencido devolve 409 sem sobrescrever a resolução', intercalou && x.status === 409 && (await env.DB.prepare('SELECT estado FROM eq_duvida WHERE id=?').bind(dCorrida).first()).estado === 'resolvida');
    chk('reabrir vencido não apaga leitura nem assinatura confirmadas pela vencedora', !!(await env.DB.prepare('SELECT 1 FROM eq_leitura WHERE comunicado=? AND whats=?').bind(comCorrida, CLARICE).first()) && !!(await env.DB.prepare("SELECT 1 FROM eq_assinatura WHERE comunicado=? AND whats=? AND revogada_em=''").bind(comCorrida, CLARICE).first()));
    chk('reabrir vencido não grava evento de auditoria falso', (await env.DB.prepare("SELECT COUNT(*) n FROM eq_duvida_evento WHERE duvida=? AND acao='reabrir'").bind(dCorrida).first()).n === 0);
  }
  // Simulação de horário fixo, sem depender da hora em que o teste roda.
  const DataReal = globalThis.Date;
  try {
    globalThis.Date = class extends DataReal { constructor(...args) { super(...(args.length ? args : ['2026-11-28T02:00:00Z'])); } static now() { return DataReal.parse('2026-11-28T02:00:00Z'); } };
    const antesQuieto = avisos.length;
    x = await Q(IARA, 'POST', '/equipe/lembrar', { comunicado });
    chk('lembrete normal respeita silêncio de 21h a 7h', x.j.ok && x.j.avisados === 0 && avisos.length === antesQuieto);
    x = await Q(IARA, 'POST', '/equipe/lembrar', { comunicado: cid });
    chk('comunicado importante pode avisar durante silêncio', x.j.ok && x.j.avisados > 0 && avisos.length === antesQuieto + 1);
  } finally { globalThis.Date = DataReal; }
  console.log(ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
`;
vm.runInThisContext('(function(require,__dirname,__import){' + harness.replace('await import(', 'await __import(') + cenarios + '})', { filename: __filename })(require, __dirname, (u) => import(u));
