// v7.40.36 — responder mensagem especifica: o que realmente sai para o cliente.
// Worker REAL com D1 (SQLite do Node) e Wafly/Instagram FALSOS. Nada sai para a rede.
//
//  1. WhatsApp: /send-text leva `messageId` = ext_id da mensagem citada (citacao nativa);
//  2. Instagram: o texto sai com "> trecho" no topo (a API nao tem quote nativo);
//  3. a linha gravada guarda ctx_tipo='resposta' e ctx_texto com o TRECHO citado;
//  4. citar mensagem de OUTRA conversa e recusado (400) e nada e enviado;
//  5. citar mensagem sem ext_id real (inc:...) nao manda messageId invalido;
//  6. depois de reabrir a conversa, o historico devolve a citacao na bolha enviada.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_citar.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '..', 'instagram-worker', 'worker.js')));
let ok = 0, falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  \u2714 ' + n); } else { falhas.push(n); console.log('  \u2718 ' + n + (d !== undefined ? ' \u2014 ' + JSON.stringify(d).slice(0, 400) : '')); } };

function d1() {
  const db = new DatabaseSync(':memory:');
  const prep = (sql) => { const S = () => db.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, async all() { return { results: S().all(...args).map((x) => ({ ...x })) }; }, async first() { const r = S().get(...args); return r ? { ...r } : null; }, async run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }, _run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; };
  return { prepare: prep, async batch(l) { db.exec('BEGIN'); const results = []; try { for (const st of l) results.push(st._run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return results; }, _db: db };
}

(async () => {
  const W = await import(tmp), w = W.default;
  const cacheMem = new Map();
  globalThis.caches = { default: { async match(r) { const v = cacheMem.get(r.url); return v ? new Response(v) : undefined; }, async put(r, x) { cacheMem.set(r.url, await x.text()); } } };
  const objs = new Map(), kv = new Map();
  const R2 = { async get(k) { const v = objs.get(k); return v ? { async arrayBuffer() { return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength); } } : null; }, async put(k, b) { objs.set(k, Buffer.from(b instanceof ReadableStream ? await new Response(b).arrayBuffer() : b)); }, async delete(k) { objs.delete(k); }, async list() { return { objects: [...objs.keys()].map((k) => ({ key: k, size: objs.get(k).length })), truncated: false }; } };

  // ---- Wafly FALSA: guarda cada chamada e confirma com um messageId ----
  let chamadas = [], seq = 0;
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://wafly.com.br')) {
      const corpo = JSON.parse(init.body);
      chamadas.push({ url: u, corpo, headers: new Headers(init.headers) });
      return new Response(JSON.stringify({ messageId: 'WAMID' + (++seq) }), { status: 200 });
    }
    if (u.startsWith('https://ig.fake')) {
      // o IG recebe JSON: { recipient, message: { text } }
      const b = JSON.parse(String(init.body || '{}'));
      chamadas.push({ url: u, corpo: b });
      return new Response(JSON.stringify({ message_id: 'ig.mid.' + (++seq) }), { status: 200 });
    }
    if (u.startsWith('https://api.fake')) { const b = JSON.parse(init.body || '{}'); if (b.sessao === 'tk2.admin') return new Response(JSON.stringify({ ok: true, usuario: { nome: 'Ana', permissoes: ['gerir_acessos'] } })); return new Response(JSON.stringify({ ok: false })); }
    throw new Error('fetch inesperado: ' + u);
  };

  const DB = d1();
  const env = { DB, MIDIA: R2, CACHE: kv, API_URL: 'https://api.fake/exec', IG_BASE: 'https://ig.fake/v23.0' };
  const O = 'https://tenkitermodas.com.br';
  const ped = (m, p, corpo, sess) => new Request('https://ig.test' + p, { method: m, headers: { Origin: O, 'X-TK-Whats': '88999990000', 'X-TK-Sessao': sess === undefined ? 'tk2.admin' : sess, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const A = async (m, p, corpo) => { const r = await w.fetch(ped(m, p, corpo), env, {}); return { r, j: await r.json().catch(() => null) }; };

  // cria as tabelas pelo webhook de inicializacao (mesmo caminho da producao)
  await w.fetch(new Request('https://ig.test/wh/wafly/1/inicial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env, {});

  const cfg = (k, v) => DB.prepare('INSERT OR REPLACE INTO cfg (chave, valor) VALUES (?, ?)').bind(k, v).run();
  // mesmas chaves/formatos que a tela de Conexões grava (JSON validado por validarWafly_)
  await cfg('wafly_1', JSON.stringify({ instance: 'inst001abc', token: 'token123456', clientToken: 'client123456' }));
  await cfg('ig_token', 'IGQVJ_TOKEN_DE_TESTE_1234567890');

  const novaConv = async (canal, contato, nome) => {
    const agora = new Date().toISOString();
    const r = await DB.prepare("INSERT INTO msg_conversa (canal, contato, nome, grupo, ultima_em, previa, total, criado_em) VALUES (?, ?, ?, 0, ?, '', 1, ?)").bind(canal, contato, nome, agora, agora).run();
    return r.meta.last_row_id;
  };
  const cw = await novaConv('whatsapp1', '5588999990000', 'Maria');
  const cw2 = await novaConv('whatsapp1', '5588977776666', 'Joana');
  const ci = await novaConv('instagram', '17841400000001', 'Insta');

  const entrada = async (conv, canal, ext, texto) => {
    const r = await DB.prepare("INSERT INTO msg_mensagem (conversa_id, canal, ext_id, direcao, tipo, texto, enviada_em, gravada_em) VALUES (?, ?, ?, 'entrada', 'texto', ?, ?, ?)").bind(conv, canal, ext, texto, new Date().toISOString(), new Date().toISOString()).run();
    return r.meta.last_row_id;
  };

  const m1 = await entrada(cw, 'whatsapp1', 'WA_IN_1', 'Tem o vestido P?');
  const m2 = await entrada(cw2, 'whatsapp1', 'WA_IN_9', 'mensagem de OUTRA conversa');

  console.log('--- envio e citacao ---');
  const texto1 = 'Tenho sim!';
  const r1 = await A('POST', '/msg/enviar', { conversa: cw, texto: texto1, idLocal: 'citacao-1-20261030', citada: m1 });
  chk('WhatsApp: envio com citacao e aceito', r1.r.status === 200 && r1.j && r1.j.ok, r1.j);
  const envio1 = chamadas.find((c) => c.url.includes('/send-text'));
  chk('WhatsApp: chamou o /send-text', !!envio1, chamadas.map((c) => c.url));
  chk('WhatsApp: o corpo leva messageId da mensagem CITADA', envio1 && envio1.corpo.messageId === 'WA_IN_1', envio1 && envio1.corpo);
  chk('WhatsApp: o texto nao ganhou prefixo ">" (a citacao e nativa)', envio1 && envio1.corpo.message === texto1, envio1 && envio1.corpo.message);

  console.log('--- historico ---');
  const linha = await DB.prepare("SELECT * FROM msg_mensagem WHERE canal=? AND ctx_tipo='resposta' ORDER BY id DESC LIMIT 1").bind('whatsapp1').first();
  chk('historico: a resposta gravou ctx_tipo=resposta', !!linha, linha);
  chk('historico: guardou o TRECHO citado', linha && linha.ctx_trecho === 'Tem o vestido P?', linha && linha.ctx_trecho);
  chk('historico: guardou quem foi citado (Cliente)', linha && linha.ctx_autor === 'Cliente', linha && linha.ctx_autor);
  chk('historico: guardou o id da mensagem citada', linha && String(linha.ctx_ref) === 'WA_IN_1', linha && linha.ctx_ref);

  const lido = await A('GET', '/msg/mensagens?conversa=' + cw);
  const lista = (lido.j && (lido.j.mensagens || lido.j.itens || lido.j.msgs)) || [];
  const ult = lista[lista.length - 1] || {};
  chk('historico: o GET devolve ctx_texto na bolha enviada', ult.ctx_texto === 'Tem o vestido P?', ult.ctx_texto);
  chk('historico: o GET devolve ctx_autor para a citacao', ult.ctx_autor === 'Cliente', ult.ctx_autor);

  console.log('--- Instagram: citacao no texto ---');
  chamadas = [];
  const mi = await entrada(ci, 'instagram', 'IG_IN_1', 'Oi, tem P?');
  const r2 = await A('POST', '/msg/enviar', { conversa: ci, texto: 'Tem P sim', idLocal: 'citacao-2-20261030', citada: mi });
  chk('Instagram: envio com citacao e aceito', r2.r.status === 200 && r2.j && r2.j.ok, r2.j);
  const envioIg = chamadas.find((c) => c.url.includes('/messages'));
  chk('Instagram: chamou /me/messages', !!envioIg, chamadas.map((c) => c.url));
  const textoIg = String((envioIg && envioIg.corpo.message && envioIg.corpo.message.text) || '');
  chk('Instagram: a citacao vai como "> trecho" no texto', textoIg.startsWith('> Oi, tem P?'), textoIg);
  chk('Instagram: a minha mensagem vem depois da citacao', textoIg.includes('Tem P sim'), textoIg);

  console.log('--- guardas ---');
  chamadas = [];
  const r3 = await A('POST', '/msg/enviar', { conversa: cw, texto: 'oi', idLocal: 'citacao-3-20261030', citada: m2 });
  chk('citar mensagem de OUTRA conversa e recusado (400)', r3.r.status === 400 && r3.j && r3.j.ok === false, r3.j);
  chk('citar mensagem de outra conversa NAO envia nada', chamadas.length === 0, chamadas.map((c) => c.url));

  chamadas = [];
  await DB.prepare("UPDATE msg_mensagem SET ext_id='inc:xyz' WHERE id=?").bind(m1).run();
  const r4 = await A('POST', '/msg/enviar', { conversa: cw, texto: 'sem id real', idLocal: 'citacao-4-20261030', citada: m1 });
  const envio4 = chamadas.find((c) => c.url.includes('/send-text'));
  chk('envio incerto: ainda envia a resposta', r4.r.status === 200 && r4.j && r4.j.ok, r4.j);
  chk('envio incerto: NAO manda messageId invalido', envio4 && envio4.corpo.messageId === undefined, envio4 && envio4.corpo);

  chamadas = [];
  const r5 = await A('POST', '/msg/enviar', { conversa: cw, texto: 'sem citacao', idLocal: 'citacao-5-20261030' });
  const envio5 = chamadas.find((c) => c.url.includes('/send-text'));
  chk('sem citada: envio normal continua funcionando', r5.r.status === 200 && r5.j && r5.j.ok, r5.j);
  chk('sem citada: nenhum messageId e enviado', envio5 && envio5.corpo.messageId === undefined, envio5 && envio5.corpo);

  chamadas = [];
  const r6 = await A('POST', '/msg/enviar', { conversa: cw, texto: 'Tenho sim!', idLocal: 'citacao-1-20261030', citada: m1 });
  chk('idempotencia: repetir o idLocal nao dispara novo envio', chamadas.length === 0, chamadas.length);

  console.log('\n' + ok + ' OK / ' + falhas.length + ' falhas');
  if (falhas.length) { console.log('FALHAS: ' + falhas.join(' | ')); process.exit(1); }
})();
