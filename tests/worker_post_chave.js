// v7.57 — Chave de operação do POST /post (idLocal): tocar de novo após erro/timeout não cria outra postagem. D1 real (SQLite do Node); serviços FALSOS.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_post_chave.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '..', 'instagram-worker', 'worker.js')));
let ok = 0; const falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 500) : '')); } };
function d1() {
  const db = new DatabaseSync(':memory:');
  const prep = (sql) => { const S = () => db.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, async all() { return { results: S().all(...args).map((x) => ({ ...x })) }; }, async first() { const r = S().get(...args); return r ? { ...r } : null; }, async run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }, _run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; };
  return { prepare: prep, async batch(l) { db.exec('BEGIN'); const results = []; try { for (const st of l) results.push(st._run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return results; }, _db: db };
}
(async () => {
  const W = await import(require('node:url').pathToFileURL(tmp).href), w = W.default;
  const cacheMem = new Map(), kv = new Map(), objs = new Map();
  globalThis.caches = { default: { async match(r) { const v = cacheMem.get(r.url); return v ? new Response(v) : undefined; }, async put(r, x) { cacheMem.set(r.url, await x.text()); } } };
  const R2 = { async get(k) { const v = objs.get(k); return v ? { size: v.length, async arrayBuffer() { return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength); } } : null; }, async put(k, b) { objs.set(k, Buffer.from(b)); }, async delete(k) { objs.delete(k); }, async list() { return { objects: [], truncated: false }; } };
  const KV = { async get(k) { return kv.has(k) ? kv.get(k) : null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  objs.set('t/202611/aaaaaaaaaaaaaaaaaaaa.jpg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(900, 7)]));
  const TOKEN = 'IGQVJ_TOKEN_INVENTADO_PARA_TESTE_1234567890';
  // ---- Serviços falsos ----
  let wafPosts = [], grupoPosts = [], igPub = [], igCriar = [], seqC = 0, igErro = null;   // igErro: null | {status, error}
  globalThis.fetch = async (u, init) => {
    u = String(u); const metodo = (init && init.method) || 'GET';
    if (u.startsWith('https://api.fake')) return new Response(JSON.stringify({ ok: true, usuario: String(init && init.body || '').includes('tk2.gerente') ? { permissoes: ['catalogo_cadastrar'], nome: 'Equipe' } : { permissoes: ['gerir_acessos', 'catalogo_cadastrar'], nome: 'Gestor' } }));
    if (u.startsWith('https://tenkiter-midia.fake/')) return new Response(Buffer.alloc(900, 7), { headers: { 'content-type': 'image/jpeg' } });
    if (u.startsWith('https://wafly.com.br/api-bridge-whats/')) {
      const body = init && init.body ? JSON.parse(init.body) : null;
      if (/\/send-(image|video)$/.test(u)) { grupoPosts.push(body); return new Response(JSON.stringify({ messageId: 'G' + grupoPosts.length })); }
      if (metodo === 'GET') return new Response(JSON.stringify(u.includes('/requests/') ? { state: 'accepted', serverAcknowledged: true } : { supported: true, connected: true, contactsReady: true }));
      wafPosts.push(body); return new Response(JSON.stringify({ state: 'accepted' }));
    }
    if (u.startsWith('https://ig.fake')) {
      if (u.includes('/refresh_access_token')) return new Response(JSON.stringify({ access_token: TOKEN, expires_in: 5184000 }));
      const corpo = init && init.body ? new URLSearchParams(String(init.body)) : null;
      if (metodo === 'POST' && u.endsWith('/me/media')) { igCriar.push(Date.now()); return new Response(JSON.stringify({ id: 'C' + (++seqC) })); }
      if (metodo === 'POST' && u.endsWith('/me/media_publish')) {
        if (igErro) { const e = typeof igErro === 'function' ? igErro() : igErro; if (e) return new Response(JSON.stringify({ error: e.error }), { status: e.status || 400 }); }
        igPub.push(corpo.get('creation_id')); return new Response(JSON.stringify({ id: 'M' + igPub.length }));
      }
      if (u.includes('?fields=status_code')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
      if (u.includes('?fields=permalink')) return new Response(JSON.stringify({ permalink: 'https://www.instagram.com/p/FAKE/' }));
      if (u.includes('/me?fields=id,username')) return new Response(JSON.stringify({ id: '1', username: 'tenkiter' }));
    }
    throw new Error('fetch inesperado: ' + u);
  };
  const DB = d1();
  const env = { DB, MIDIA: R2, CACHE: KV, API_URL: 'https://api.fake/exec', MIDIA_URL: 'https://tenkiter-midia.fake', IG_BASE: 'https://ig.fake/v23.0',
    WAFLY_GRUPO_CLIENTES: JSON.stringify({ instance: 'INST_TESTE', token: 'TOKEN_TESTE', clientToken: 'CLIENT_TESTE', phone: '120363000000000000-group' }) };
  const ped = (m, p, sess, corpo) => new Request('https://ig.test' + p, { method: m, headers: { Origin: 'https://tenkitermodas.com.br', 'X-TK-Whats': '88999990000', 'X-TK-Sessao': sess || 'tk2.admin', 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const A = async (m, p, corpo, sess) => { const r = await w.fetch(ped(m, p, sess, corpo), env, {}); return { r, j: await r.json() }; };
  const iso = (min) => new Date(Date.now() + min * 60000).toISOString();
  const midia = JSON.stringify([{ url: 'https://tenkiter-midia.fake/m/t/202611/aaaaaaaaaaaaaaaaaaaa.jpg', tipo: 'imagem' }]);
  const nova = async (canal, extra) => {
    const r = await DB.prepare("INSERT INTO postagem (tipo, modo, legenda, midias, agendado_em, status, canal, criado_em, atualizado_em) VALUES ('story','auto','Calcinha TK-0001', ?, ?, 'agendado', ?, ?, ?)").bind(midia, iso(-1), canal, iso(-1), iso(-1)).run();
    const id = r.meta.last_row_id; if (extra) for (const [k, v] of Object.entries(extra)) await DB.prepare('UPDATE postagem SET ' + k + '=? WHERE id=?').bind(v, id).run();
    return id;
  };
  const L = (id) => DB.prepare('SELECT * FROM postagem WHERE id=?').bind(id).first();
  const cfg = (k, v) => v === null ? DB.prepare('DELETE FROM cfg WHERE chave=?').bind(k).run() : DB.prepare('INSERT OR REPLACE INTO cfg (chave, valor) VALUES (?, ?)').bind(k, String(v)).run();
  const cfgV = async (k) => ((await DB.prepare('SELECT valor FROM cfg WHERE chave=?').bind(k).first()) || {}).valor;
  const P = async () => W.processarPostagens(env);
  /** Simula `min` minutos passando: recua todos os horários gravados (e o último Instagram). */
  const passar = async (min) => {
    const ms = min * 60000, rs = (await DB.prepare('SELECT id,agendado_em,publicado_em,zap_desde,zap_consulta,inicio_proc,atualizado_em FROM postagem').all()).results;
    for (const r of rs) { const s = (v) => v && isFinite(Date.parse(v)) ? new Date(Date.parse(v) - ms).toISOString() : v; await DB.prepare('UPDATE postagem SET agendado_em=?,publicado_em=?,zap_desde=?,zap_consulta=?,inicio_proc=?,atualizado_em=? WHERE id=?').bind(s(r.agendado_em), s(r.publicado_em), s(r.zap_desde), s(r.zap_consulta), s(r.inicio_proc), s(r.atualizado_em), r.id).run(); }
    const u = Number(await cfgV('ig_ultima_ms')) || 0; if (u) await cfg('ig_ultima_ms', u - ms);
    const pa = await cfgV('ig_pausa_ate'); if (pa) await cfg('ig_pausa_ate', new Date(Date.parse(pa) - ms).toISOString());
  };
  const limparFila = async () => { await DB.prepare("UPDATE postagem SET status='cancelado' WHERE status IN ('agendado','processando','erro','manual_pendente')").run(); for (const k of ['ig_pausa_ate', 'ig_pausa_motivo', 'ig_pausa_estado', 'ig_aviso_gestor', 'ig_ultima_ms']) await cfg(k, null); igErro = null; await passar(5); };   // recua o relógio: o espaço mínimo do Instagram não vaza entre cenários
  const TOO_MANY = { status: 400, error: { message: 'User is performing too many actions', type: 'OAuthException', code: 2, error_subcode: 2207051 } };

  await P();   // cria o esquema
  await cfg('ig_token', 'x');
  const IMG = (n) => ({ url: 'https://tenkiter-midia.fake/m/t/202611/aaaaaaaaaaaaaaaaaaaa.jpg', tipo: 'imagem' });
  const corpo = (extra) => Object.assign({ tipo: 'feed', quando: iso(30), canal: 'instagram', produto: 'TK-0102', legenda: 'Teste', midias: [IMG(1)] }, extra || {});
  const conta = async () => ((await DB.prepare("SELECT COUNT(*) n FROM postagem WHERE status<>'cancelado'").first()) || {}).n;
  const base = await conta();

  let a = await A('POST', '/post', corpo({ idLocal: 'chave-aaaaaaaa-1' }));
  chk('primeiro envio com chave cria a postagem', a.r.status === 200 && a.j.ok && a.j.ids.length === 1, a.j);
  chk('1 postagem na fila', (await conta()) === base + 1);
  const b1 = await A('POST', '/post', corpo({ idLocal: 'chave-aaaaaaaa-1' }));
  chk('mesma chave devolve a MESMA resposta', b1.r.status === 200 && JSON.stringify(b1.j.ids) === JSON.stringify(a.j.ids) && b1.j.ok, b1.j);
  chk('mesma chave NÃO cria outra postagem', (await conta()) === base + 1);
  const b2 = await A('POST', '/post', corpo({ idLocal: 'chave-aaaaaaaa-1', legenda: 'outra legenda' }));
  chk('mesma chave com só a legenda diferente: devolve a resposta guardada, sem criar outra', b2.j.ok && JSON.stringify(b2.j.ids) === JSON.stringify(a.j.ids) && (await conta()) === base + 1, b2.j);
  const b3 = await A('POST', '/post', corpo({ idLocal: 'chave-aaaaaaaa-1', tipo: 'story', canal: 'whatsapp' }));
  chk('mesma chave com outro tipo/canal: 409 em português, sem criar', b3.r.status === 409 && /mudou/.test(b3.j.erro) && !/[{}]/.test(b3.j.erro) && (await conta()) === base + 1, b3.j);
  const c = await A('POST', '/post', corpo({ idLocal: 'chave-aaaaaaaa-2' }));
  chk('chave nova cria outra postagem', c.j.ok && (await conta()) === base + 2 && c.j.ids[0] !== a.j.ids[0], c.j);
  const e = await A('POST', '/post', corpo({ idLocal: 'chave-aaaaaaaa-3', tipo: 'feed', midias: [IMG(1), IMG(2)] }));
  chk('erro definitivo (feed com 2 fotos) não cria e libera a chave', e.r.status === 400 && /exatamente 1 foto/.test(e.j.erro), e.j);
  const e2 = await A('POST', '/post', corpo({ idLocal: 'chave-aaaaaaaa-3' }));
  chk('depois de corrigir, a MESMA chave envia normalmente (1 postagem)', e2.j.ok && (await conta()) === base + 3, e2.j);
  const semChave = await A('POST', '/post', corpo());
  chk('tela antiga sem chave continua funcionando', semChave.j.ok && (await conta()) === base + 4, semChave.j);
  const ruim = await A('POST', '/post', corpo({ idLocal: 'a b' }));
  chk('chave mal formada: 400 em português', ruim.r.status === 400 && /Atualize/.test(ruim.j.erro), ruim.j);
  // envio em duas chamadas paralelas com a mesma chave: uma só postagem
  const [p1, p2] = await Promise.all([A('POST', '/post', corpo({ idLocal: 'chave-aaaaaaaa-4' })), A('POST', '/post', corpo({ idLocal: 'chave-aaaaaaaa-4' }))]);
  chk('duas chamadas ao mesmo tempo com a mesma chave: só 1 postagem', (await conta()) === base + 5 && (p1.j.ok || p2.j.ok), [p1.j, p2.j]);
  const outra = await w.fetch(new Request('https://ig.test/post', { method: 'POST', headers: { Origin: 'https://tenkitermodas.com.br', 'X-TK-Whats': '88911112222', 'X-TK-Sessao': 'tk2.admin', 'Content-Type': 'application/json' }, body: JSON.stringify(corpo({ idLocal: 'chave-aaaaaaaa-1' })) }), env, {});
  const oj = await outra.json();
  chk('a chave vale por conta: outra pessoa com o mesmo texto cria a dela', oj.ok && (await conta()) === base + 6, oj);

  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length + (falhas.length ? ' ' + JSON.stringify(falhas) : ''));
  if (falhas.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
