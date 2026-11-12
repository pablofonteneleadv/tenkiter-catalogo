// v7.56.4 — envio de mensagem rápido: a sessão é conferida UMA vez (e fica no cache de 2 min), não 3 vezes seguidas.
// Worker REAL com D1 (SQLite do Node), Apps Script e Wafly FALSOS. Nada sai para a rede.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_rapido.mjs');
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
  let chamadas = [], seq = 0, sessaoChamadas = 0;
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
    if (u.startsWith('https://api.fake')) { const b = JSON.parse(init.body || '{}'); if (b.action === 'sessao') { sessaoChamadas++; await new Promise((r) => setTimeout(r, 60)); if (b.sessao === 'tk2.admin') return new Response(JSON.stringify({ ok: true, usuario: { nome: 'Ana', permissoes: ['gerir_acessos'] } })); if (b.sessao === 'tk2.equipe') return new Response(JSON.stringify({ ok: true, usuario: { nome: 'Bia Souza', permissoes: ['catalogo_admin', 'catalogo_cadastrar', 'painel_simples'], perfil: 'Equipe catálogo 1' } })); return new Response(JSON.stringify({ ok: false })); } return new Response(JSON.stringify({ ok: false })); }
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


  const ped2 = (m, p, corpo, sess, whats) => new Request('https://ig.test' + p, { method: m, headers: { Origin: O, 'X-TK-Whats': whats || '88999990000', 'X-TK-Sessao': sess, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const B = async (m, p, corpo, sess, whats) => { const r = await w.fetch(ped2(m, p, corpo, sess, whats), env, {}); return { r, j: await r.json().catch(() => null) }; };
  const cx = await novaConv('whatsapp1', '5588911112222', 'Cliente Rápido');
  console.log('--- equipe (sem Admin total), cache frio: UMA conferência de sessão por envio ---');
  cacheMem.clear(); sessaoChamadas = 0;
  let t0 = Date.now();
  const e1 = await B('POST', '/msg/enviar', { conversa: cx, texto: 'Oi, tudo bem?', idLocal: 'rapido-0001-20261108' }, 'tk2.equipe');
  const t1 = Date.now() - t0;
  chk('envio da equipe funciona', e1.r.status === 200 && e1.j && e1.j.ok, e1.j);
  chk('só 1 consulta de sessão (antes eram 3)', sessaoChamadas === 1, sessaoChamadas);
  chk('o texto sai assinado com o nome da atendente', chamadas.some((c) => c.url.includes('/send-text') && /^\*Bia:\*\nOi, tudo bem\?$/.test(c.corpo.message)), chamadas.map((c) => c.corpo));
  console.log('--- cache quente: nenhuma consulta de sessão ---');
  sessaoChamadas = 0; t0 = Date.now();
  const e2 = await B('POST', '/msg/enviar', { conversa: cx, texto: 'Segue o link', idLocal: 'rapido-0002-20261108' }, 'tk2.equipe');
  const t2 = Date.now() - t0;
  chk('segundo envio funciona', e2.r.status === 200 && e2.j && e2.j.ok, e2.j);
  chk('com o cache aquecido, 0 consultas de sessão', sessaoChamadas === 0, sessaoChamadas);
  chk('e fica mais rápido que o primeiro', t2 < t1, [t1, t2]);
  console.log('--- a leitura (GET) aquece o cache para o envio ---');
  cacheMem.clear(); sessaoChamadas = 0;
  await B('GET', '/msg/contagem', null, 'tk2.equipe');
  const antes = sessaoChamadas; sessaoChamadas = 0;
  const e3 = await B('POST', '/msg/enviar', { conversa: cx, texto: 'Mais uma', idLocal: 'rapido-0003-20261108' }, 'tk2.equipe');
  chk('o GET aqueceu o cache (1 consulta)', antes === 1, antes);
  chk('o envio logo depois não consulta de novo', e3.r.status === 200 && sessaoChamadas === 0, sessaoChamadas);
  console.log('--- admin e sessões inválidas ---');
  cacheMem.clear(); sessaoChamadas = 0;
  const e4 = await B('POST', '/msg/enviar', { conversa: cx, texto: 'Admin enviando', idLocal: 'rapido-0004-20261108' }, 'tk2.admin');
  chk('admin: envio funciona com 1 consulta', e4.r.status === 200 && e4.j && e4.j.ok && sessaoChamadas === 1, [e4.r.status, sessaoChamadas]);
  const e5 = await B('POST', '/msg/enviar', { conversa: cx, texto: 'x', idLocal: 'rapido-0005-20261108' }, 'tk2.invalida');
  chk('sessão inválida continua barrada (401)', e5.r.status === 401, e5.r.status);
  const e6 = await B('POST', '/msg/enviar', { conversa: cx, texto: 'x', idLocal: 'rapido-0006-20261108' }, 'sem-prefixo');
  chk('sem sessão no formato continua barrado (401)', e6.r.status === 401, e6.r.status);
  console.log('--- ações de acesso NÃO usam o cache ---');
  cacheMem.clear(); sessaoChamadas = 0;
  await B('GET', '/msg/contagem', null, 'tk2.equipe'); sessaoChamadas = 0;
  await B('POST', '/msg/config', { assinatura: false }, 'tk2.equipe');
  chk('/msg/config confere a sessão na hora (sem cache)', sessaoChamadas === 1, sessaoChamadas);
  console.log('--- o dono da conversa é gravado ---');
  const conv = await DB.prepare('SELECT dono FROM msg_conversa WHERE id=?').bind(cx).first();
  chk('quem respondeu primeiro virou o responsável', conv && /Bia/.test(conv.dono || ''), conv);


  console.log('--- sessão travada no Apps Script não segura o Worker indefinidamente ---');
  {
    // Prova sintética: nenhum envio real. Tempo real de 15 s é comprimido a 35 ms.
    const fetchNormal = globalThis.fetch, tempoNormal = AbortSignal.timeout;
    let calls = 0, signalPresent = false, limiteMs = 0;
    try {
      AbortSignal.timeout = function (ms) { limiteMs = ms; return tempoNormal.call(AbortSignal, 35); };
      globalThis.fetch = (url, init) => {
        if (String(url).startsWith('https://api.fake') && init && init.method === 'POST') {
          const body = JSON.parse(init.body || '{}');
          if (body.action === 'sessao' && body.sessao === 'tk2.sessao-travada-teste') {
            calls++;
            signalPresent = !!init.signal;
            return new Promise((resolve, reject) => {
              if (!init.signal) {
                // Sem AbortSignal, a dependência demora: reproduz o bug em 140 ms.
                setTimeout(() => reject(new Error('Apps Script fictício indisponível')), 140);
              } else if (init.signal.aborted) {
                reject(init.signal.reason || new Error('abort'));
              } else {
                init.signal.addEventListener('abort',
                  () => reject(init.signal.reason || new Error('abort')), { once: true });
              }
            });
          }
        }
        return fetchNormal(url, init);
      };
      const t = Date.now();
      const falha = await B('POST', '/msg/tempo-real/ticket',
        { canais: ['whatsapp1'] }, 'tk2.sessao-travada-teste');
      const duracao = Date.now() - t;
      chk('Apps Script de sessão travado retorna 503, não 401 nem acesso permitido',
        falha.r.status === 503 && falha.j && falha.j.ok === false,
        { status: falha.r.status, resposta: falha.j });
      chk('requisição externa tem timeout explícito de até 20s e aborta cedo no teste',
        calls === 1 && signalPresent && limiteMs >= 5000 && limiteMs <= 20000 && duracao < 120,
        { calls, signalPresent, limiteMs, duracao });
    } finally {
      globalThis.fetch = fetchNormal;
      AbortSignal.timeout = tempoNormal;
    }
  }

  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length + ' ' + JSON.stringify(falhas));
  process.exit(falhas.length ? 1 : 0);
})();
