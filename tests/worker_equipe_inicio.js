/* v7.40.33 — presença, equipe e início de conversa (itens retomados do #305).
   D1 SQLite real; nenhum envio a destinatário real. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-equipe-inicio.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '../instagram-worker/worker.js')) + '\nexport {equipeAtendimento_,iniciarConversa_,registrarAtividade_};');
  const W = await import(tmp);
  const cache = new Map(), kv = new Map();
  global.caches = { default: { async match(r) { return cache.has(r.url) ? Response.json(cache.get(r.url)) : undefined; }, async put(r, v) { cache.set(r.url, await v.json()); } } };
  let envios = [];
  global.fetch = async (u, opt) => {
    if (String(u) === 'https://backend.test') return Response.json({ ok: true, sessao: 'tk3.5588999999999.' + Math.floor(Date.now() / 1000 + 30 * 86400) + '.simulada', usuario: { nome: 'Ana Teste', permissoes: ['gerir_acessos'] } });
    assert(/\/send-(text|image)$/.test(String(u)), 'Serviço não simulado');
    envios.push(JSON.parse(opt.body)); return Response.json({ messageId: 'simulado-' + envios.length });
  };
  const CACHE = { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  const env = { DB, CACHE, MIDIA: require('./helpers/r2_condicional')(), API_URL: 'https://backend.test', MIDIA_URL: 'https://midia.test' };
  const headers = { 'X-TK-Whats': '5588999999999', 'X-TK-Sessao': 'tk3.teste' };
  const chamar = async (rota, metodo = 'GET', corpo) => { const r = await W.default.fetch(new Request('https://worker.test' + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined }), env, {}); return { status: r.status, j: await r.json() }; };

  await chamar('/msg/config');
  const seg = sqlite.prepare("SELECT valor FROM cfg WHERE chave='msg_wh_segredo'").get();
  if (!seg) await chamar('/wh/wafly/1/iniciar', 'POST', {});
  const segredo = sqlite.prepare("SELECT valor FROM cfg WHERE chave='msg_wh_segredo'").get().valor;
  const wh = async (id, slot = 1, telefone = '5588991234567', nome = 'Cliente simulado') => W.default.fetch(new Request('https://worker.test/wh/wafly/' + slot + '/' + segredo, { method: 'POST', body: JSON.stringify({ type: 'ReceivedCallback', messageId: id, phone: telefone, senderName: nome, fromMe: false, text: { message: 'Teste' }, momment: Date.now() }) }), env, {});
  await wh('entrada-1');
  const conv = sqlite.prepare("SELECT id FROM msg_conversa WHERE canal='whatsapp1'").get().id;

  // ---- início de conversa ----
  assert.equal((await chamar('/msg/iniciar', 'POST', { canal: 'telegram', destino: '88999999999' })).status, 400, 'Canal desconhecido é recusado');
  assert.equal((await chamar('/msg/iniciar', 'POST', { canal: 'whatsapp1', destino: '1234' })).status, 400, 'Número sem DDD é recusado');
  assert.equal((await chamar('/msg/iniciar', 'POST', { canal: 'instagram', destino: 'nome inválido!' })).status, 400, '@ inválido é recusado');
  assert.equal((await chamar('/msg/iniciar', 'POST', { canal: 'instagram', destino: '@naoexiste' })).status, 409, 'Instagram não abre conversa inexistente');

  // Já existente: reaproveita, não duplica e não envia nada.
  const existente = await chamar('/msg/iniciar', 'POST', { canal: 'whatsapp1', destino: '(88) 99123-4567' });
  assert.equal(existente.status, 200); assert.equal(existente.j.conversa, conv);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_conversa WHERE canal='whatsapp1' AND contato='5588991234567'").get().n, 1, 'Conversa existente é reaproveitada');
  assert.equal(envios.length, 0, 'Abrir conversa não envia mensagem');

  // Nova: cria a conversa do zero, com a chave de pessoa, sem mensagem.
  const nova = await chamar('/msg/iniciar', 'POST', { canal: 'whatsapp2', destino: '88988887777' });
  assert.equal(nova.status, 200); assert(nova.j.conversa > 0);
  const gravada = sqlite.prepare('SELECT * FROM msg_conversa WHERE id=?').get(nova.j.conversa);
  assert.equal(gravada.canal, 'whatsapp2'); assert.equal(gravada.grupo, 0); assert.equal(gravada.total, 0, 'Conversa nasce sem mensagem');
  assert(gravada.pessoa, 'Chave de pessoa preenchida');
  const repetida = await chamar('/msg/iniciar', 'POST', { canal: 'whatsapp2', destino: '88 98888-7777' });
  assert.equal(repetida.j.conversa, nova.j.conversa, 'Mesmo número não duplica conversa');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_conversa WHERE canal='whatsapp2'").get().n, 1);

  // ---- presença ----
  const p1 = await chamar('/msg/presenca', 'POST', { conversa: conv });
  assert.equal(p1.status, 200); assert(p1.j.ok);
  const registro = sqlite.prepare('SELECT * FROM msg_presenca').get();
  assert.equal(registro.conversa_id, conv); assert(registro.nome.startsWith('Ana'), 'Nome de quem está usando vem da sessão');
  assert(registro.usuario.length >= 10, 'Usuário gravado pela chave normalizada');
  const dono = registro.usuario;
  assert.equal((await chamar('/msg/presenca', 'POST', { conversa: 999999 })).status, 404, 'Conversa inexistente é recusada');

  // Segunda batida na mesma conversa dentro de 2 minutos não gera linha nova.
  const antesAtividade = sqlite.prepare('SELECT COUNT(*) n FROM msg_atividade').get().n;
  await chamar('/msg/presenca', 'POST', { conversa: conv });
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_atividade').get().n, antesAtividade, 'Batida repetida não infla a trilha');
  // Trocar de conversa muda o estado e registra.
  await chamar('/msg/presenca', 'POST', { conversa: nova.j.conversa });
  assert.equal(sqlite.prepare('SELECT conversa_id FROM msg_presenca WHERE usuario=?').get(dono).conversa_id, nova.j.conversa);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_atividade WHERE acao='visualizar'").get().n, 2);

  // ---- primeira mensagem pelo WhatsApp (v7.40.34) ----
  sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run('wafly_1', JSON.stringify({ instance: 'teste-01', token: 'simulado', clientToken: 'simulado' }));
  sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run('wafly_2', JSON.stringify({ instance: 'teste-02', token: 'simulado', clientToken: 'simulado' }));
  // Sem texto continua apenas abrindo (o Instagram e o "só abrir" dependem disso).
  const soAbre = await chamar('/msg/iniciar', 'POST', { canal: 'whatsapp1', destino: '(88) 99123-4567' });
  assert.equal(soAbre.status, 200); assert.equal(soAbre.j.enviada, false);
  assert.equal(envios.length, 0, 'Sem texto não envia nada');
  // Com texto: sai pela Wafly e a bolha fica gravada na conversa.
  const primeira = await chamar('/msg/iniciar', 'POST', { canal: 'whatsapp2', destino: '88 98888-7777', texto: 'Oi! Chegou a peça que você pediu.', idLocal: 'iniciar-conversa-0001' });
  assert.equal(primeira.status, 200, JSON.stringify(primeira.j));
  assert.equal(primeira.j.enviada, true, 'WhatsApp com texto envia a primeira mensagem');
  assert.equal(primeira.j.conversa, nova.j.conversa, 'Envia na conversa que a gaveta abriu');
  assert.equal(envios.length, 1, 'Uma mensagem, um envio');
  assert.equal(envios[0].message, 'Oi! Chegou a peça que você pediu.', 'O texto sai inteiro, sem assinatura para administrador');
  const bolha = sqlite.prepare("SELECT * FROM msg_mensagem WHERE conversa_id=? AND direcao='saida'").get(primeira.j.conversa);
  assert(bolha, 'A mensagem enviada é gravada na conversa'); assert.equal(bolha.texto, 'Oi! Chegou a peça que você pediu.');
  assert.equal(sqlite.prepare('SELECT total FROM msg_conversa WHERE id=?').get(primeira.j.conversa).total, 1, 'A conversa deixa de nascer vazia');
  assert.equal(sqlite.prepare('SELECT dono FROM msg_conversa WHERE id=?').get(primeira.j.conversa).dono.startsWith('Ana'), true, 'Quem fala primeiro vira responsável');
  await new Promise(r => setTimeout(r, 120));
  assert(sqlite.prepare("SELECT * FROM msg_atividade WHERE acao='responder' AND conversa_id=?").get(primeira.j.conversa), 'A resposta confirmada entra na trilha');
  // Repetir o mesmo idLocal não manda a mensagem duas vezes.
  const repetido = await chamar('/msg/iniciar', 'POST', { canal: 'whatsapp2', destino: '88 98888-7777', texto: 'Oi! Chegou a peça que você pediu.', idLocal: 'iniciar-conversa-0001' });
  assert.equal(repetido.status, 200); assert.equal(envios.length, 1, 'Mesmo idLocal não reenvia');
  // Instagram nunca envia, mesmo que chegue texto.
  assert.equal((await chamar('/msg/iniciar', 'POST', { canal: 'instagram', destino: '@naoexiste', texto: 'Oi' })).status, 409, 'Instagram segue só abrindo conversa existente');
  assert.equal(envios.length, 1, 'Instagram nunca envia');

  // ---- trilha das ações confirmadas ----
  const envio = await chamar('/msg/enviar', 'POST', { conversa: conv, texto: 'Olá, tudo bem?', idLocal: 'envio-equipe-0001' });
  assert.equal(envio.status, 200);
  await new Promise(r => setTimeout(r, 120));
  const linha = sqlite.prepare("SELECT * FROM msg_atividade WHERE acao='responder' AND conversa_id=?").get(conv);
  assert(linha, 'Envio confirmado entra na trilha'); assert.equal(linha.conversa_id, conv);
  assert(!JSON.stringify(linha).includes('tudo bem'), 'A trilha guarda a ação, nunca o texto da mensagem');
  // Mesmo idLocal não duplica a ação.
  await chamar('/msg/enviar', 'POST', { conversa: conv, texto: 'Olá, tudo bem?', idLocal: 'envio-equipe-0001' });
  await new Promise(r => setTimeout(r, 120));
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_atividade WHERE acao='responder' AND conversa_id=?").get(conv).n, 1, 'Reenvio do mesmo idLocal não duplica');
  // Ação que falha não vira trilha.
  const tentativas = sqlite.prepare('SELECT COUNT(*) n FROM msg_atividade').get().n;
  assert.equal((await chamar('/msg/enviar', 'POST', { conversa: 999999, texto: 'x' })).status >= 400, true);
  await new Promise(r => setTimeout(r, 120));
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_atividade').get().n, tentativas, 'Falha não gera trilha');

  // ---- equipe ----
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const eq = await chamar('/msg/equipe?de=' + hoje + '&ate=' + hoje);
  assert.equal(eq.status, 200); assert(eq.j.ok);
  assert(eq.j.presencas.some(p => p.usuario === dono && p.online === true), 'Presença recente aparece online');
  const total = eq.j.totais.find(t => t.usuario === dono);
  assert(total && total.respostas === 2, 'Totais contam as duas respostas confirmadas (primeira mensagem + envio)');
  assert.equal(eq.j.atividades[0].acao, 'responder', 'Histórico vem do mais recente');
  assert(eq.j.atividades[0].nome.startsWith('Ana'), 'Histórico mostra o nome de quem agiu');
  assert(!JSON.stringify(eq.j).includes('tudo bem'), 'Equipe não expõe conteúdo de mensagem');
  assert.equal((await chamar('/msg/equipe?de=2026-13-01&ate=2026-13-02')).status, 400, 'Data inválida é recusada');
  const inicio = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
  assert.equal((await chamar('/msg/equipe?de=' + inicio + '&ate=' + hoje)).status, 400, 'Período acima de 31 dias é recusado');
  const filtrado = await chamar('/msg/equipe?de=' + hoje + '&ate=' + hoje + '&usuario=5588000000000');
  assert.equal(filtrado.j.totais.length, 0, 'Filtro por pessoa funciona');
  // Presença antiga não conta como online.
  sqlite.prepare('UPDATE msg_presenca SET em=? WHERE usuario=?').run(new Date(Date.now() - 10 * 60000).toISOString(), dono);
  const velha = await chamar('/msg/equipe?de=' + hoje + '&ate=' + hoje);
  assert.equal(velha.j.presencas.find(p => p.usuario === dono).online, false, 'Presença vence em 2 minutos');

  // ---- acesso ----
  cache.clear();
  global.fetch = async (u) => String(u) === 'https://backend.test' ? Response.json({ ok: true, sessao: 'tk3.5588999999999.' + Math.floor(Date.now() / 1000 + 30 * 86400) + '.simulada', usuario: { nome: 'Sem acesso', permissoes: [] } }) : Response.json({ messageId: 'x' });
  assert.equal((await chamar('/msg/presenca', 'POST', { conversa: conv })).status, 403, 'Sem acesso à ferramenta não bate presença');

  console.log('Equipe/início: iniciar sem enviar, presença de 2 minutos, trilha só de ação confirmada, totais e filtros aprovados.');
})().catch(e => { console.error(e); process.exitCode = 1; });
