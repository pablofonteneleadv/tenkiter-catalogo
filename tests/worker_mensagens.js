// Testa instagram-worker/worker.js com D1 REAL (SQLite do Node), R2/KV/cache e Instagram FALSOS. Nada vai à Meta, à Cloudflare nem ao Google.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_msg.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '..', 'instagram-worker', 'worker.js')));
let ok = 0, falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 300) : '')); } };

function d1() {
  const db = new DatabaseSync(':memory:');
  const prep = (sql) => { const S = () => db.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, async all() { return { results: S().all(...args).map((x) => ({ ...x })) }; }, async first() { const r = S().get(...args); return r ? { ...r } : null; }, async run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }, _run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; };
  return { prepare: prep, async batch(l) { db.exec('BEGIN'); const results = []; try { for (const st of l) results.push(st._run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return results; }, _db: db };
}

(async () => {
  const W = await import(tmp), w = W.default;
  const cacheMem = new Map();
  globalThis.caches = { default: { async match(r) { const v = cacheMem.get(r.url); return v ? new Response(v) : undefined; }, async put(r, x) { cacheMem.set(r.url, await x.text()); } } };
  const objs = new Map(); const kv = new Map();
  const R2 = { async get(k) { const v = objs.get(k); return v ? { size:v.length, async arrayBuffer() { return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength); } } : null; }, async put(k, b) { objs.set(k, Buffer.from(b instanceof ReadableStream ? await new Response(b).arrayBuffer() : b)); }, async delete(k) { objs.delete(k); }, async list(o) { const pr = (o && o.prefix) || ''; return { objects: [...objs.keys()].filter((k) => k.startsWith(pr)).map((k) => ({ key: k, size: objs.get(k).length, uploaded: (tempDatas.get(k) || new Date()) })), truncated: false }; } };
  const tempDatas = new Map();
  const KV = { async get(k, t) { const v = kv.get(k); return v === undefined ? null : (t === 'json' ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  const TOKEN = 'IGQVJ_TOKEN_INVENTADO_PARA_TESTE_1234567890';
  // ---- Instagram falso ----
  const GEMINI_OK = 'AIzaINVENTADA_PARA_TESTE_1234567890abcd'; let gemChamadas = [], gemModo = 'ok', gemTexto = '';
  let contaChamadas = [], contaFora = false;
  let postChamadas = [], postErro = null, seqC = 0, containers = {}, publicados = [], videoStatus = 'FINISHED';
  let paginas = null, feed = [], stories = [], midia404 = {}, tokenValido = true, chamadas = [];
  const cdn = (id, tipo) => 'https://cdn.fake/' + id + (tipo === 'VIDEO' ? '.mp4' : '.jpg');
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://api.fake') && u.includes('action=categorias')) return new Response(JSON.stringify({ ok: true, categorias: ['Vestido', 'Conjunto', 'Blusa'] }));
    if (u.startsWith('https://api.fake') && u.includes('action=generos')) return new Response(JSON.stringify({ ok: true, generos: ['Feminino Adulto', 'Infantil'] }));
    if (u.startsWith('https://generativelanguage.googleapis.com/v1beta/models?')) { const k = new Headers(init.headers)['get']('x-goog-api-key'); return new Response(JSON.stringify(k === GEMINI_OK ? { models: [] } : { error: { message: 'API key not valid' } }), { status: k === GEMINI_OK ? 200 : 400 }); }
    if (u.startsWith('https://generativelanguage.googleapis.com/')) {
      gemChamadas.push({ url: u, headers: new Headers(init.headers), body: JSON.parse(init.body) });
      if (gemModo === 'cota1' && u.includes('gemini-3.5-flash:')) return new Response(JSON.stringify({ error: { message: 'You exceeded your current quota. Please retry in 21h26m11.19s.' } }), { status: 429 });
      if (gemModo === '429') return new Response(JSON.stringify({ error: { message: 'quota key=' + GEMINI_OK } }), { status: 429 });
      if (gemModo === 'lixo') return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'não é json' }] } }] }));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: gemTexto }] } }] }));
    }
    if (u.startsWith('https://api.fake')) { const b = JSON.parse(init.body); if (b.action === 'contaPorWhats') { contaChamadas.push(b); return new Response(JSON.stringify(b.sessao === 'tk2.cliente' ? { ok: false } : contaFora ? { ok: false, erro: 'x' } : String(b.alvo) === '88977776666' ? { ok: true, existe: true, nome: 'Joana Cadastrada' } : { ok: true, existe: false })); } return new Response(JSON.stringify(b.sessao === 'tk2.admin' ? { ok: true, usuario: { permissoes: ['gerir_acessos', 'catalogo_cadastrar'] } } : b.sessao === 'tk2.gerente' ? { ok: true, usuario: { permissoes: ['catalogo_cadastrar'], nome: 'Gerente' } } : b.sessao === 'tk2.cliente' ? { ok: true, usuario: { permissoes: [], nome: 'Maria Cliente', whatsapp: '88988887777' } } : { ok: false })); }
    if (u.startsWith('https://ig.fake') && init && init.method === 'POST') {          // publicação (POST com o token no CORPO)
      const f = new URLSearchParams(String(init.body)), tk = f.get('access_token'); f.delete('access_token');
      postChamadas.push({ u, p: Object.fromEntries(f) });
      if (!tokenValido || tk !== TOKEN) return new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token', code: 190 } }), { status: 400 });
      if (postErro) { const e = postErro; postErro = null; return new Response(JSON.stringify({ error: e }), { status: 400 }); }
      if (u.endsWith('/me/media')) { const id = 'C' + (++seqC); containers[id] = { st: (f.get('video_url') || f.get('media_type') === 'REELS') ? videoStatus : 'FINISHED', p: Object.fromEntries(f) }; return new Response(JSON.stringify({ id })); }
      if (u.endsWith('/me/media_publish')) { publicados.push(f.get('creation_id')); return new Response(JSON.stringify({ id: 'M' + publicados.length })); }
    }
    if (u.startsWith('https://ig.fake') && u.includes('?fields=status_code')) { const id = u.split('/').pop().split('?')[0]; return new Response(JSON.stringify({ status_code: (containers[id] || { st: 'FINISHED' }).st })); }
    if (u.startsWith('https://ig.fake') && u.includes('?fields=permalink')) return new Response(JSON.stringify({ permalink: 'https://www.instagram.com/p/FAKE123/' }));
    if (u.startsWith('https://ig.fake') || u.startsWith('https://graph.fake')) {
      chamadas.push(u);
      const tk = new URL(u).searchParams.get('access_token');
      if (!tokenValido || tk !== TOKEN) return new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token. access_token=' + tk } }), { status: 400 });
      if (u.includes('/refresh_access_token')) return new Response(JSON.stringify({ access_token: TOKEN, expires_in: 5184000 }));
      if (u.includes('/me/stories')) return new Response(JSON.stringify({ data: stories }));
      if (u.includes('/me/media') && paginas) { const aft = new URL(u).searchParams.get('after') || ''; const i = aft ? Number(aft.slice(1)) : 0; const ult = i >= paginas.length - 1; return new Response(JSON.stringify(Object.assign({ data: paginas[i] }, ult ? {} : { paging: { cursors: { after: 'C' + (i + 1) }, next: 'https://ig.fake/next' } }))); }
      if (u.includes('/me/media')) return new Response(JSON.stringify({ data: feed }));
      if (u.includes('/me?')) return new Response(JSON.stringify({ id: '17841422675809095', username: 'tenkitermodasceara' }));
    }
    if (u.startsWith('https://cdn.fake/')) {
      const id = u.split('/').pop().replace(/\.(jpg|mp4)$/, '');
      if (midia404[id]) return new Response('x', { status: 404 });
      const video = u.endsWith('.mp4'); const corpo = Buffer.alloc(video ? 5000 : 800, id.length);
      return new Response(corpo, { headers: { 'content-type': video ? 'video/mp4' : 'image/jpeg', 'content-length': String(corpo.length) } });
    }
    throw new Error('fetch inesperado: ' + u);
  };
  const DB = d1();
  const env = { DB, MIDIA: R2, CACHE: KV, API_URL: 'https://api.fake/exec', MIDIA_URL: 'https://tenkiter-midia.fake', IG_BASE: 'https://ig.fake/v23.0' };
  const O = 'https://tenkitermodas.com.br';
  const ped = (m, p, sess, corpo) => new Request('https://ig.test' + p, { method: m, headers: Object.assign({ Origin: O, 'X-TK-Whats': '88999990000', 'X-TK-Sessao': sess || '', 'Content-Type': 'application/json' }), body: corpo ? JSON.stringify(corpo) : undefined });
  const A = async (m, p, corpo) => { const r = await w.fetch(ped(m, p, 'tk2.admin', corpo), env, {}); return { r, j: await r.json() }; };
  const agoraIso = () => new Date().toISOString();
  const ts = (min) => new Date(Date.now() + min * 60000).toISOString();     // minutos a partir de agora (positivo = depois de conectar)

  // ---------- Canal de postagem (v1.3) ----------
  // Wafly (WhatsApp) é simulada pelo "api.fake": o worker chama waflyStatusRemoto e recebemos o pedido.
  let zapPedidos = [], zapModo = 'ok';
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://api.fake') && init && init.method === 'POST') {
      const b = JSON.parse(init.body);
      if (b.action === 'waflyStatusRemoto') {
        zapPedidos.push(b);
        if (zapModo === 'erro') return new Response(JSON.stringify({ ok: false, erro: 'Ponte do Worker desligada (defina WORKER_TOKEN nas Propriedades do Script).' }));
        return new Response(JSON.stringify({ ok: true, requestId: b.requestId, estado: 'accepted' }));
      }
    }
    return fetchAntes(u, init);
  };
  const midiaFeed = JSON.stringify([{ url: 'https://x/m/t/202610/dddddddddddddddddddd.jpg', tipo: 'imagem' }]);
  const novaPostagem = async (canal, status) => {
    const r = await DB.prepare("INSERT INTO postagem (tipo, modo, legenda, midias, agendado_em, status, canal) VALUES ('feed','auto','Vestido TK-0001 R$ 89,90', ?, ?, ?, ?)").bind(midiaFeed, '2020-01-01T00:00:00Z', status || 'agendado', canal).run();
    return Number(r.lastInsertRowid ?? r.meta?.last_row_id ?? (await DB.prepare("SELECT MAX(id) AS i FROM postagem").first()).i);
  };
  const lerPost = async (id) => DB.prepare("SELECT * FROM postagem WHERE id=?").bind(id).first();
  const cfg = (k, v) => DB.prepare("INSERT OR REPLACE INTO cfg (chave, valor) VALUES (?, ?)").bind(k, v).run();
  await W.processarPostagens(env);
  const wh = async (caminho, corpo, extra) => { const r = await w.fetch(new Request('https://ig.test' + caminho, Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) }, extra || {})), env, {}); return { r, j: await r.json().catch(() => null) }; };
  const SEGREDO = async () => (await DB.prepare("SELECT valor FROM cfg WHERE chave='msg_wh_segredo'").first()).valor;
  const cont = async (t) => Number((await DB.prepare('SELECT COUNT(*) n FROM ' + t).first()).n);

  // ---- segurança do webhook ----
  const sem = await wh('/wh/wafly/1/segredo-errado', { type: 'ReceivedCallback', messageId: 'A1', phone: '5588999990000', text: { message: 'oi' } });
  chk('segredo errado: 404 e nada gravado', sem.r.status === 404 && (await cont('msg_mensagem')) === 0);
  const seg = await SEGREDO();
  chk('segredo é gerado com 48 hex', /^[0-9a-f]{48}$/.test(seg));
  chk('GET no webhook do WhatsApp é recusado', (await w.fetch(new Request('https://ig.test/wh/wafly/1/' + seg), env, {})).status === 405);
  chk('JSON inválido: 400', (await wh('/wh/wafly/1/' + seg, '{nao-json')).r.status === 400);

  // ---- gravação, separada por canal ----
  const msg = (id, fone, texto, extra) => Object.assign({ type: 'ReceivedCallback', messageId: id, phone: fone, fromMe: false, momment: 1792000000000, senderName: 'Maria', text: { message: texto } }, extra || {});
  let r1 = await wh('/wh/wafly/1/' + seg, msg('M1', '5588999990000', 'Oi, tem o vestido TK-0001?'));
  chk('WhatsApp 1: grava mensagem recebida', r1.j.ok && r1.j.nova === true && (await cont('msg_mensagem')) === 1);
  await wh('/wh/wafly/1/' + seg, msg('M1', '5588999990000', 'Oi, tem o vestido TK-0001?'));
  chk('webhook repetido NÃO duplica', (await cont('msg_mensagem')) === 1);
  await wh('/wh/wafly/1/' + seg, msg('M2', '5588999990000', 'Tem sim!', { fromMe: true, momment: 1792000060000, chatName: 'Maria' }));
  const c1 = await DB.prepare("SELECT * FROM msg_conversa WHERE canal='whatsapp1'").first();
  chk('uma conversa por contato, com contagem, prévia e nome', (await cont('msg_conversa')) === 1 && c1.total === 2 && c1.previa === 'Tem sim!' && c1.nome === 'Maria', c1);
  chk('direção entrada/saída', (await DB.prepare("SELECT GROUP_CONCAT(direcao) d FROM (SELECT direcao FROM msg_mensagem ORDER BY id)").first()).d === 'entrada,saida');
  await wh('/wh/wafly/2/' + seg, msg('M1', '5588999990000', 'mesma pessoa no zap 2'));
  chk('WhatsApp 2 é separado (mesmo ext_id e contato, outro canal)', (await cont('msg_conversa')) === 2 && (await cont('msg_mensagem')) === 3);
  await wh('/wh/wafly/1/' + seg, msg('M3', '5588999990000', '', { text: undefined, image: { caption: 'foto do vestido', imageUrl: 'https://x/y.jpg' } }));
  const img = await DB.prepare("SELECT tipo, texto FROM msg_mensagem WHERE ext_id='M3'").first();
  chk('imagem guarda só o tipo e a legenda (nunca a URL)', img.tipo === 'imagem' && img.texto === 'foto do vestido' && !JSON.stringify(await DB.prepare('SELECT * FROM msg_mensagem').all()).includes('x/y.jpg'));
  await wh('/wh/wafly/1/' + seg, msg('M4', 'status@broadcast', 'status de alguém'));
  await wh('/wh/wafly/1/' + seg, { type: 'MessageStatusCallback', ids: ['X'] });
  chk('status@broadcast e outros eventos são ignorados', (await cont('msg_mensagem')) === 4);
  await wh('/wh/wafly/1/' + seg, msg('G1', '120363-group', 'oi grupo', { isGroup: true, chatName: 'Clientes TK' }));
  chk('grupo vira conversa de grupo com o nome do grupo', (await DB.prepare("SELECT grupo, nome FROM msg_conversa WHERE contato='120363-group'").first()).nome === 'Clientes TK');
  await wh('/wh/wafly/1/' + seg, msg('L1', '5588999990000', 'x'.repeat(9000)));
  chk('texto longo é cortado em 4000', (await DB.prepare("SELECT LENGTH(texto) n FROM msg_mensagem WHERE ext_id='L1'").first()).n === 4000);

  // ---- instância diferente da cadastrada ----
  await cfg('wafly_2', JSON.stringify({ instance: 'INST_TESTE_002', token: 'TOKEN_SECRETO_DEF456', clientToken: 'CLIENT_SECRETO_UVW000' }));
  const outra = await wh('/wh/wafly/2/' + seg, msg('Z1', '5588911112222', 'x', { instanceId: 'OUTRA_INSTANCIA' }));
  chk('webhook de outra instância é ignorado', outra.j.ignorado === 'outra instância' && (await DB.prepare("SELECT 1 FROM msg_mensagem WHERE ext_id='Z1'").first()) == null);
  const certa = await wh('/wh/wafly/2/' + seg, msg('Z2', '5588911112222', 'x', { instanceId: 'INST_TESTE_002' }));
  chk('da instância certa grava', certa.j.nova === true);

  // ---- Instagram ----
  const ig = { object: 'instagram', entry: [{ id: 'DONO', messaging: [{ sender: { id: 'CLI1' }, recipient: { id: 'DONO' }, timestamp: 1792000000000, message: { mid: 'IGM1', text: 'quanto custa?' } }, { sender: { id: 'DONO' }, recipient: { id: 'CLI1' }, timestamp: 1792000050000, message: { mid: 'IGM2', text: 'R$ 89', is_echo: true } }] }] };
  const corpoIg = JSON.stringify(ig);
  const semSecret = await wh('/wh/instagram/' + seg, corpoIg);
  chk('Instagram sem IG_APP_SECRET fica fechado (503)', semSecret.r.status === 503 && (await DB.prepare("SELECT 1 FROM msg_conversa WHERE canal='instagram'").first()) == null);
  env.IG_APP_SECRET = 'segredo-do-app-teste';
  const assinar = async (txt) => { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.IG_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return 'sha256=' + Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(txt))), (x) => x.toString(16).padStart(2, '0')).join(''); };
  chk('assinatura inválida: 401', (await wh('/wh/instagram/' + seg, corpoIg, { headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=00' } })).r.status === 401);
  const okIg = await wh('/wh/instagram/' + seg, corpoIg, { headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': await assinar(corpoIg) } });
  const ci = await DB.prepare("SELECT * FROM msg_conversa WHERE canal='instagram'").first();
  chk('Instagram com assinatura válida grava entrada e eco na mesma conversa do cliente', okIg.j.novas === 2 && ci.contato === 'CLI1' && ci.total === 2, okIg.j);
  const ver = await w.fetch(new Request('https://ig.test/wh/instagram/' + seg + '?hub.mode=subscribe&hub.verify_token=' + seg + '&hub.challenge=12345'), env, {});
  chk('verificação do webhook pela Meta devolve o desafio', ver.status === 200 && (await ver.text()) === '12345');
  chk('verificação com token errado: 403', (await w.fetch(new Request('https://ig.test/wh/instagram/' + seg + '?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1'), env, {})).status === 403);

  // ---- pausa ----
  const antesPausa = await cont('msg_mensagem');
  const pz = await A('POST', '/msg/pausar', { canal: 'whatsapp1', pausar: true });
  await wh('/wh/wafly/1/' + seg, msg('P1', '5588999990000', 'durante a pausa'));
  chk('pausa para de gravar sem apagar nada', pz.j.ok && (await cont('msg_mensagem')) === antesPausa);
  await A('POST', '/msg/pausar', { canal: 'whatsapp1', pausar: false });
  await wh('/wh/wafly/1/' + seg, msg('P2', '5588999990000', 'depois da pausa'));
  chk('retomar volta a gravar', (await cont('msg_mensagem')) === antesPausa + 1);

  // ---- rotas do painel (Admin total) ----
  const res = await A('GET', '/msg/resumo');
  chk('resumo por canal', res.j.ok && res.j.canais.whatsapp1.conversas === 2 && res.j.canais.whatsapp2.conversas === 2 && res.j.canais.instagram.conversas === 1 && res.j.canais.instagram.pronto === true, res.j.canais);
  chk('resumo traz o endereço do Instagram só com o segredo certo', res.j.urlInstagram.endsWith('/wh/instagram/' + seg));
  const lista = await A('GET', '/msg/conversas?canal=whatsapp1');
  chk('lista de conversas ordenada da mais recente', lista.j.ok && lista.j.conversas.length === 2 && lista.j.conversas[0].ultima_em >= lista.j.conversas[1].ultima_em);
  chk('busca por texto', (await A('GET', '/msg/conversas?canal=whatsapp1&busca=Clientes')).j.conversas.length === 1);
  chk('canal inválido: 400 em português', (await A('GET', '/msg/conversas?canal=outro')).r.status === 400);
  const fio = await A('GET', '/msg/mensagens?conversa=' + c1.id);
  chk('mensagens da conversa em ordem do tempo', fio.j.ok && fio.j.mensagens[0].direcao === 'entrada' && fio.j.mensagens.length >= 3 && fio.j.mensagens[0].enviada_em <= fio.j.mensagens[1].enviada_em);
  chk('ligar sem Wafly cadastrado: erro legível', (await A('POST', '/msg/ligar', { slot: 1 })).j.erro.includes('Cadastre o Wafly 1'));

  // ---- ligar webhook na Wafly ----
  let put = null; const f0 = globalThis.fetch;
  globalThis.fetch = async (u, init) => { if (String(u).startsWith('https://wafly.com.br/')) { put = { u: String(u), m: init.method, b: JSON.parse(init.body), h: new Headers(init.headers) }; return new Response('{"value":true}'); } return f0(u, init); };
  const lig = await A('POST', '/msg/ligar', { slot: 2 });
  chk('ligar aponta o webhook da instância 2 para o Worker com o segredo', lig.j.ok && put.m === 'PUT' && put.u.endsWith('/update-webhook-received') && put.b.value === 'https://ig.test/wh/wafly/2/' + seg && put.h.get('client-token') === 'CLIENT_SECRETO_UVW000', put);
  chk('ligar registra data e não altera mensagens', (await A('GET', '/msg/resumo')).j.canais.whatsapp2.ligadoEm !== '' && (await cont('msg_mensagem')) === antesPausa + 1);
  console.log('\n' + ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) { console.log(falhas.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
