// Testa instagram-worker/worker.js com D1 REAL (SQLite do Node), R2/KV/cache e Instagram FALSOS. Nada vai à Meta, à Cloudflare nem ao Google.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_wame.mjs');
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
  await cfg('po_cfg', JSON.stringify({pausaAtiva:false}));
  const MEDIA_URL = 'https://tenkiter-midia.fake/m/t/202610/dddddddddddddddddddd.jpg';
  let wame = [], wmodo = 'ok', liberar = null;
  const fAnt = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://server.wame.api.br/')) {
      wame.push({ url: String(u), body: JSON.parse(init.body), headers: new Headers(init.headers), redirect: init.redirect });
      if (wmodo === 'aguardar') await new Promise((r) => { liberar = r; });
      if (wmodo === 'timeout') throw new Error('timeout');
      if (wmodo === 'negado') return new Response(JSON.stringify({ error: 'instância desconectada' }), { status: 401 });
      if (wmodo === '500') return new Response('oops', { status: 502 });
      if (wmodo === 'erro200') return new Response(JSON.stringify({ error: 'falhou' }), { status: 200 });
      return new Response(JSON.stringify({ key: { id: 'WAME-' + wame.length }, status: 'PENDING' }));
    }
    return fAnt(u, init);
  };
  // ---- sem configuração ----
  let r0 = await A('POST', '/post', { tipo: 'story', modo: 'auto', legenda: 'x', midias: [{ url: MEDIA_URL, tipo: 'imagem' }], quando: ts(15), status2: true, canal: 'instagram' });
  chk('sem segredo, agendar Status 2 é recusado em português', r0.r.status === 409 && /Status 2 ainda não está configurado/.test(r0.j.erro), r0.j);
  chk('listagem avisa que Status 2 está indisponível', (await A('GET', '/posts')).j.status2Disponivel === false);
  // ---- com configuração ----
  env.WAME_STATUS_2 = JSON.stringify({ key: 'CHAVE_WAME_TESTE_123' });
  chk('listagem avisa que Status 2 está disponível', (await A('GET', '/posts')).j.status2Disponivel === true);
  env.WAME_STATUS_2 = JSON.stringify({ key: 'CHAVE_WAME_TESTE_123', base: 'https://evil.example.com' });
  chk('base fora da Wame é ignorada (sem enviar chave a terceiros)', (await A('GET', '/posts')).j.status2Disponivel === false);
  env.WAME_STATUS_2 = JSON.stringify({ key: 'CHAVE_WAME_TESTE_123' });

  let id = await novaPostagem('whatsapp2');
  await W.processarPostagens(env);
  let p1 = await lerPost(id);
  chk('Status 2 publica imagem pela Wame com legenda', p1.status === 'publicado' && wame.length === 1 && wame[0].url === 'https://server.wame.api.br/CHAVE_WAME_TESTE_123/status/image' && wame[0].body.caption === 'Vestido TK-0001 R$ 89,90' && wame[0].body.url === 'https://x/m/t/202610/dddddddddddddddddddd.jpg', { p1, wame });
  chk('redirect manual e sem credenciais extras', wame[0].redirect === 'manual' && !wame[0].headers.get('authorization') && !wame[0].headers.get('client-token'));
  await W.processarPostagens(env);
  chk('cron não repete postagem já publicada', wame.length === 1);
  chk('recibo aceito guarda o id da mensagem', (await DB.prepare("SELECT estado, mensagem_id FROM postagem_grupo_recibo WHERE postagem_id=?").bind(id).first()).mensagem_id === 'WAME-1');
  // vídeo
  id = await novaPostagem('whatsapp2');
  await DB.prepare('UPDATE postagem SET midias=? WHERE id=?').bind(JSON.stringify([{ url: 'https://x/m/t/202610/v.mp4', tipo: 'video' }]), id).run();
  await W.processarPostagens(env);
  chk('vídeo vai por /status/video', wame.length === 2 && wame[1].url.endsWith('/status/video') && (await lerPost(id)).status === 'publicado');
  // várias mídias: cada uma vira um Status, com recibo por mídia
  id = await novaPostagem('whatsapp2');
  await DB.prepare('UPDATE postagem SET midias=? WHERE id=?').bind(JSON.stringify([{ url: 'https://x/m/a.jpg', tipo: 'imagem' }, { url: 'https://x/m/b.jpg', tipo: 'imagem' }]), id).run();
  await W.processarPostagens(env);
  chk('duas mídias = dois Status, na ordem', wame.length === 4 && wame[2].body.url.endsWith('/a.jpg') && wame[3].body.url.endsWith('/b.jpg') && (await lerPost(id)).status === 'publicado');
  // recusa explícita
  wmodo = 'negado'; id = await novaPostagem('whatsapp2'); await W.processarPostagens(env);
  let pn = await lerPost(id);
  chk('401 da Wame vira erro claro, sem JSON cru nem chave', pn.status === 'erro' && /recusou a publicação \(HTTP 401\)/.test(pn.erro) && !/CHAVE_WAME|error|\{/.test(pn.erro), pn.erro);
  chk('recusa permite nova tentativa (recibo recusado)', (await DB.prepare("SELECT estado FROM postagem_grupo_recibo WHERE postagem_id=?").bind(id).first()).estado === 'recusado');
  // resposta incerta: nunca reenvia
  wmodo = '500'; id = await novaPostagem('whatsapp2'); let antes = wame.length; await W.processarPostagens(env);
  let pi = await lerPost(id);
  chk('502 deixa aguardando confirmação', pi.status === 'processando' && /aguardando confirmação/.test(pi.erro) && wame.length === antes + 1, pi);
  await W.processarPostagens(env); await W.processarPostagens(env);
  chk('cron NÃO reenvia enquanto aguarda (sem duplicar Status)', wame.length === antes + 1);
  wmodo = 'timeout'; id = await novaPostagem('whatsapp2'); antes = wame.length; await W.processarPostagens(env);
  chk('timeout/rede também aguarda sem reenviar', (await lerPost(id)).status === 'processando' && wame.length === antes + 1);
  await W.processarPostagens(env); chk('e continua sem reenviar', wame.length === antes + 1);
  wmodo = 'erro200'; id = await novaPostagem('whatsapp2'); antes = wame.length; await W.processarPostagens(env);
  chk('200 com campo de erro não conta como publicado', (await lerPost(id)).status === 'processando' && wame.length === antes + 1);
  await DB.prepare("UPDATE postagem SET status='erro' WHERE id=?").bind(id).run();
  const agr = await A('POST', '/post/reagendar', { id, quando: 'agora' });
  chk('reagendar recusa quando o envio ficou sem confirmação', agr.r.status === 409 && /sem confirmação/.test(agr.j.erro) && /Status 2/.test(agr.j.erro), agr.j);
  wmodo = 'ok';
  // ---- expansão pela tela: 4 destinos de uma vez ----
  await cfg('ig_token', TOKEN);
  const antesN = Number((await DB.prepare('SELECT COUNT(*) AS n FROM postagem').first()).n);
  const quatro = await A('POST', '/post', { tipo: 'story', modo: 'auto', legenda: 'Os 4', midias: [{ url: MEDIA_URL, tipo: 'imagem' }], quando: ts(15), canal: 'ambos', grupoClientes: true, status2: true });
  const nDepois = Number((await DB.prepare('SELECT COUNT(*) AS n FROM postagem').first()).n);
  env.WAFLY_GRUPO_CLIENTES = JSON.stringify({ instance: 'I', token: 'T', clientToken: 'C', phone: '120363000000000000-group' });
  const quatro2 = await A('POST', '/post', { tipo: 'story', modo: 'auto', legenda: 'Os 4', midias: [{ url: MEDIA_URL, tipo: 'imagem' }], quando: ts(15), canal: 'ambos', grupoClientes: true, status2: true });
  chk('sem grupo configurado, o pedido inteiro é recusado e nada entra na fila', quatro.r.status === 409 && nDepois === antesN, quatro.j);
  const linhas = (await DB.prepare("SELECT canal FROM postagem WHERE legenda='Os 4' ORDER BY id").all()).results.map((x) => x.canal).sort();
  chk('os 4 destinos viram 3 linhas: ambos (Instagram+Status 1), grupo e whatsapp2', quatro2.r.status === 200 && JSON.stringify(linhas) === JSON.stringify(['ambos', 'grupo', 'whatsapp2']) && quatro2.j.status2 === 1, { linhas, j: quatro2.j });
  const so2 = await A('POST', '/post', { tipo: 'story', modo: 'auto', legenda: 'So2', midias: [{ url: MEDIA_URL, tipo: 'imagem' }], quando: ts(15), canal: 'whatsapp2' });
  chk('canal whatsapp2 sozinho é aceito e gravado como whatsapp2', so2.r.status === 200 && (await DB.prepare("SELECT canal FROM postagem WHERE legenda='So2'").first()).canal === 'whatsapp2', so2.j);
  const fila2 = (await A('GET', '/posts')).j;
  chk('regras da fila trazem o canal status2 com limites', fila2.config.canais.status2 && fila2.config.canais.status2.max24h === 40, fila2.config && fila2.config.canais);
  const rep = await A('POST', '/post/repostar', { id: (await DB.prepare("SELECT id FROM postagem WHERE canal='whatsapp2' AND status='erro' LIMIT 1").first())?.id || 0, confirmarRisco: true });
  chk('repostar um Status 2 com erro cria cópia com o mesmo canal', rep.r.status === 200 && (await DB.prepare('SELECT canal FROM postagem WHERE id=?').bind(rep.j.id).first()).canal === 'whatsapp2', rep.j);
  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length, falhas); process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
