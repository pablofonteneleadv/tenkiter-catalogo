/* v7.67.0 — excluir solicitação de cliente: exclusão lógica, permissão no servidor e por pessoa.
   D1 SQLite real em memória; serviços simulados; nenhum envio real e nenhum dado real apagado. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

const ADMIN = '5588999999999', ATENDENTE = '5588977770001', EQUIPE1 = '5588977770002';
(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-solicitacoes-excluir.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '../instagram-worker/worker.js')) + '\nexport {msgRecurso_,MSG_FERRAMENTAS_};');
  const W = await import(require('node:url').pathToFileURL(tmp).href);
  const cache = new Map(), kv = new Map();
  global.caches = { default: { async match(r) { return cache.has(r.url) ? Response.json(cache.get(r.url)) : undefined; }, async put(r, v) { cache.set(r.url, await v.json()); } } };
  let envios = [];
  global.fetch = async (u, opt) => {
    if (String(u) === 'https://backend.test') {
      const w = JSON.parse(opt.body || '{}').whatsapp;
      const usuario = w === ATENDENTE ? { nome: 'Bia Atendente', permissoes: ['msg_acessar', 'msg_responder'], acessosConfiguraveis: true, perfis: ['Atendimento'] }
        : w === EQUIPE1 ? { nome: 'Caio Catalogo', permissoes: ['catalogo_admin', 'painel_simples'], perfis: ['Equipe Catalogo 1'] }
        : { nome: 'Ana Teste', permissoes: ['gerir_acessos'] };
      return Response.json({ ok: true, sessao: 'tk3.' + w + '.' + Math.floor(Date.now() / 1000 + 30 * 86400) + '.simulada', usuario });
    }
    assert(/\/send-(text|image)$/.test(String(u)), 'Serviço não simulado');
    envios.push(JSON.parse(opt.body)); return Response.json({ messageId: 'simulado-' + envios.length });
  };
  const CACHE = { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  const env = { DB, CACHE, MIDIA: require('./helpers/r2_condicional')(), API_URL: 'https://backend.test', MIDIA_URL: 'https://midia.test' };
  const quem = w => ({ 'X-TK-Whats': w, 'X-TK-Sessao': 'tk3.' + w });
  const chamar = async (w, rota, metodo = 'GET', corpo) => { const r = await W.default.fetch(new Request('https://worker.test' + rota, { method: metodo, headers: quem(w), body: corpo ? JSON.stringify(corpo) : undefined }), env, {}); return { status: r.status, j: await r.json() }; };

  // Banco "antigo": a tabela existe sem as colunas novas e já tem uma solicitação. A migração só acrescenta colunas.
  sqlite.exec("CREATE TABLE msg_solicitacao(id TEXT PRIMARY KEY,conversa_id INTEGER NOT NULL,descricao TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pendente',obs TEXT NOT NULL DEFAULT '',responsavel TEXT NOT NULL DEFAULT '',criado_por TEXT NOT NULL,criado_em TEXT NOT NULL,atualizado_em TEXT NOT NULL,versao INTEGER NOT NULL DEFAULT 1)");
  const ANTIGA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await chamar(ADMIN, '/msg/config');
  const conv = Number(sqlite.prepare("INSERT INTO msg_conversa(canal,contato,nome,grupo) VALUES('whatsapp1','5588991234567','Cliente Teste',0)").run().lastInsertRowid);
  sqlite.prepare("INSERT INTO msg_solicitacao(id,conversa_id,descricao,criado_por,criado_em,atualizado_em) VALUES(?,?,?,?,?,?)").run(ANTIGA, conv, 'Pedido antigo, de antes da novidade', ADMIN, '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z');
  let l = await chamar(ADMIN, '/msg/solicitacoes?status=todas');
  assert.equal(l.status, 200, JSON.stringify(l));
  assert.deepEqual(l.j.itens.map(x => x.id), [ANTIGA], 'Solicitação antiga continua aparecendo após a migração');
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(msg_solicitacao)').all().map(c => c.name).filter(n => n.startsWith('excluida')), ['excluida_em', 'excluida_por']);
  assert.equal((await chamar(ADMIN, '/msg/solicitacoes')).status, 200, 'Migração idempotente (segunda chamada)');

  const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', FOTO = '33333333-3333-4333-8333-333333333333';
  for (const [id, d] of [[A, 'Vestido azul M'], [B, 'Saia midi preta G']]) assert.equal((await chamar(ADMIN, '/msg/solicitacoes', 'POST', { id, conversa: conv, descricao: d })).status, 200);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=', 'base64');
  const foto = async (w, sol) => { const r = await W.default.fetch(new Request('https://worker.test/msg/solicitacoes/foto?solicitacao=' + sol + '&foto=' + FOTO, { method: 'POST', headers: quem(w), body: png }), env, {}); return r.status; };
  assert.equal(await foto(ADMIN, A), 200);
  const ids = async (w, q = '') => (await chamar(w, '/msg/solicitacoes?status=todas' + q)).j.itens.map(x => x.id).sort();
  assert.deepEqual(await ids(ADMIN), [A, B, ANTIGA].sort());

  // Quem não tem a permissão: o servidor recusa (chamada direta, sem passar pela tela) e nada muda.
  for (const w of [ATENDENTE, EQUIPE1]) {
    const acesso = await chamar(w, '/msg/acesso');
    assert.equal(acesso.j.direitos.acessar, true); assert.equal(acesso.j.direitos.excluir_solicitacao, false, 'Sem permissão por padrão');
    for (const rota of ['excluir', 'restaurar']) {
      const r = await chamar(w, '/msg/solicitacoes/' + rota, 'POST', { id: A });
      assert.equal(r.status, 403); assert.match(r.j.erro, /Seu acesso não permite/, 'Recusa em português'); assert.ok(!/[{\[]/.test(r.j.erro));
    }
  }
  assert.equal(sqlite.prepare("SELECT excluida_em FROM msg_solicitacao WHERE id=?").get(A).excluida_em, '', 'Recusa não altera nada');
  assert.equal((await chamar(ATENDENTE, '/msg/solicitacoes')).status, 200, 'Quem atende continua vendo e respondendo');
  assert.equal((await W.default.fetch(new Request('https://worker.test/msg/solicitacoes/excluir', { method: 'POST', body: '{}' }), env, {})).status, 401, 'Sem sessão não exclui');

  // Admin total exclui: some de todas as listagens e filtros; os dados continuam no D1.
  assert.equal((await chamar(ADMIN, '/msg/solicitacoes/excluir', 'POST', { id: 'invalido' })).status, 400);
  assert.equal((await chamar(ADMIN, '/msg/solicitacoes/excluir', 'POST', { id: '99999999-9999-4999-8999-999999999999' })).status, 404);
  let r = await chamar(ADMIN, '/msg/solicitacoes/excluir', 'POST', { id: A });
  assert.equal(r.status, 200); assert.equal(r.j.excluida, true);
  const linha = sqlite.prepare('SELECT * FROM msg_solicitacao WHERE id=?').get(A);
  assert.ok(linha.excluida_em && linha.excluida_por === ADMIN, 'Registra quando e quem excluiu'); assert.equal(linha.descricao, 'Vestido azul M');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_solicitacao_foto WHERE solicitacao=?').get(A).n, 1, 'Fotos continuam guardadas');
  for (const q of ['', '&conversa=' + conv]) assert.deepEqual(await ids(ADMIN, q), [B, ANTIGA].sort());
  for (const f of ['abertas', 'pendente', 'em_atendimento', 'atendida', 'todas']) assert.ok(!(await chamar(ADMIN, '/msg/solicitacoes?status=' + f)).j.itens.some(x => x.id === A), 'Não aparece em ' + f);
  assert.equal(await foto(ADMIN, A), 404, 'Excluída não recebe mais fotos');
  assert.equal((await W.default.fetch(new Request('https://worker.test/msg/solicitacoes/foto?solicitacao=' + A + '&foto=' + FOTO, { headers: quem(ADMIN) }), env, {})).status, 404, 'Foto de excluída não é entregue');
  assert.equal((await chamar(ADMIN, '/msg/solicitacoes/editar', 'POST', { id: A, versao: 1, status: 'atendida' })).status, 404);
  const eventos = sqlite.prepare('SELECT COUNT(*) n FROM msg_solicitacao_evento WHERE solicitacao=?').get(A).n;
  const quando = linha.excluida_em;
  r = await chamar(ADMIN, '/msg/solicitacoes/excluir', 'POST', { id: A });
  assert.equal(r.status, 200, 'Excluir duas vezes é aceito');
  assert.equal(sqlite.prepare('SELECT excluida_em FROM msg_solicitacao WHERE id=?').get(A).excluida_em, quando, 'Segunda exclusão não reescreve');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_solicitacao_evento WHERE solicitacao=?').get(A).n, eventos);

  // Desfazer: restaura (e repetir também é aceito).
  assert.equal((await chamar(ADMIN, '/msg/solicitacoes/restaurar', 'POST', { id: A })).status, 200);
  assert.equal((await chamar(ADMIN, '/msg/solicitacoes/restaurar', 'POST', { id: A })).status, 200);
  assert.deepEqual(await ids(ADMIN), [A, B, ANTIGA].sort());
  assert.equal(sqlite.prepare('SELECT excluida_por FROM msg_solicitacao WHERE id=?').get(A).excluida_por, '');

  // O Admin total concede a outra pessoa (mesmo mecanismo das demais ferramentas) e depois retira.
  assert.ok(W.MSG_FERRAMENTAS_.excluir_solicitacao);
  const acessos = await chamar(ADMIN, '/msg/acessos');
  assert.equal(acessos.j.ferramentas.excluir_solicitacao, 'Excluir solicitações de clientes', 'Aparece na lista de permissões por pessoa');
  assert.equal((await chamar(ATENDENTE, '/msg/acessos', 'POST', { tipo: 'pessoa', alvo: ATENDENTE, chave: 'excluir_solicitacao', valor: true })).status, 403, 'Só a gestão concede');
  assert.equal((await chamar(ADMIN, '/msg/acessos', 'POST', { tipo: 'pessoa', alvo: ATENDENTE, chave: 'excluir_solicitacao', valor: true })).status, 200);
  assert.equal((await chamar(ATENDENTE, '/msg/acesso')).j.direitos.excluir_solicitacao, true);
  assert.equal((await chamar(EQUIPE1, '/msg/solicitacoes/excluir', 'POST', { id: B })).status, 403, 'Concessão vale só para a pessoa escolhida');
  r = await chamar(ATENDENTE, '/msg/solicitacoes/excluir', 'POST', { id: B });
  assert.equal(r.status, 200); assert.equal(sqlite.prepare('SELECT excluida_por FROM msg_solicitacao WHERE id=?').get(B).excluida_por, ATENDENTE);
  assert.deepEqual(await ids(ATENDENTE), [A, ANTIGA].sort());
  assert.equal((await chamar(ADMIN, '/msg/acessos', 'POST', { tipo: 'pessoa', alvo: ATENDENTE, chave: 'excluir_solicitacao', valor: null })).status, 200);
  assert.equal((await chamar(ATENDENTE, '/msg/solicitacoes/restaurar', 'POST', { id: B })).status, 403, 'Retirada volta a recusar');
  assert.equal((await chamar(ADMIN, '/msg/solicitacoes/restaurar', 'POST', { id: B })).status, 200);

  assert.equal(W.msgRecurso_('/msg/solicitacoes/excluir', { method: 'POST' }, new URL('https://worker.test')), 'excluir_solicitacao');
  assert.equal(W.msgRecurso_('/msg/solicitacoes/restaurar', { method: 'POST' }, new URL('https://worker.test')), 'excluir_solicitacao');
  assert.equal(W.msgRecurso_('/msg/solicitacoes/editar', { method: 'POST' }, new URL('https://worker.test')), 'responder');
  assert.equal(envios.length, 0, 'Nenhuma ação envia mensagens');
  console.log('OK solicitações excluir: migração aditiva, exclusão lógica, permissão no servidor, concessão por pessoa, idempotência e nenhum envio.');
})().catch(e => { console.error(e); process.exitCode = 1; });
