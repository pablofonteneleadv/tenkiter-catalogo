// Testa instagram-worker/worker.js com D1 REAL (SQLite do Node), R2/KV/cache e Instagram FALSOS. Nada vai à Meta, à Cloudflare nem ao Google.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_wafly.mjs');
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
  await cfg('po_cfg', JSON.stringify({ pausaAtiva: false }));
  const MEDIA_URL = 'https://tenkiter-midia.fake/m/t/202610/dddddddddddddddddddd.jpg';
  const SEG = { inst: 'INST_TESTE_001', tok: 'TOKEN_SECRETO_ABC123', cli: 'CLIENT_SECRETO_XYZ789' };
  const SEG2 = { inst: 'INST_TESTE_002', tok: 'TOKEN_SECRETO_DEF456', cli: 'CLIENT_SECRETO_UVW000' };
  let pubMidia404 = false, waf = [], wmodo = 'ok', recibo = { state: 'accepted', serverAcknowledged: true }, wameChamado = 0;
  const fAnt = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (/^https:\/\/(server\.wame\.api\.br|us\.api-wa\.me|server\.api-wa\.me)\//.test(u)) { wameChamado++; return new Response('{}'); }
    if (pubMidia404 && u.startsWith('https://tenkiter-midia.fake/')) return new Response('nao achei', { status: 404 });
    if (u.startsWith('https://tenkiter-midia.fake/') || u.startsWith('https://x/')) return new Response(Buffer.alloc(900, 7), { headers: { 'content-type': 'image/jpeg' } });
    if (u.startsWith('https://wafly.com.br/api-bridge-whats/')) {
      const metodo = (init && init.method) || 'GET';
      waf.push({ url: u, metodo, body: init && init.body ? JSON.parse(init.body) : null, headers: new Headers((init && init.headers) || {}), redirect: init && init.redirect });
      if (metodo === 'GET' && u.endsWith('/status')) return new Response(JSON.stringify({ value: 'CONNECTED' }));
      if (metodo === 'GET' && u.endsWith('/status-publication')) return new Response(JSON.stringify({ supported: true, connected: true }));
      if (metodo === 'GET') return new Response(JSON.stringify(recibo));
      if (wmodo === 'timeout') throw new Error('timeout');
      if (wmodo === '409') return new Response(JSON.stringify({ error: 'ainda processando' }), { status: 409 });
      if (wmodo === '401') return new Response(JSON.stringify({ error: 'invalid ' + SEG.tok }), { status: 401 });
      if (wmodo === '422') return new Response(JSON.stringify({ error: 'x' }), { status: 422 });
      return new Response(JSON.stringify({ state: 'accepted', messageId: 'W1' }));
    }
    return fAnt(u, init);
  };
  const snap = async () => JSON.stringify([(await DB.prepare('SELECT * FROM postagem ORDER BY id').all()).results, (await DB.prepare('SELECT * FROM postagem_grupo_recibo ORDER BY postagem_id, ordem').all()).results]);

  // ---- fila existente: 40 agendadas no futuro + 2 do Status 2 com erro e recibo antigo do Wame ----
  const futuras = [];
  for (let i = 0; i < 40; i++) futuras.push(await novaPostagem(['whatsapp', 'whatsapp2', 'grupo', 'ambos', 'instagram'][i % 5], 'agendado'));
  await DB.prepare("UPDATE postagem SET agendado_em=?").bind(ts(600)).run();
  const velha = await novaPostagem('whatsapp2', 'erro');
  await DB.prepare("INSERT INTO postagem_grupo_recibo (postagem_id, ordem, estado, atualizado_em) VALUES (?,0,'recusado',?)").bind(velha, agoraIso()).run();
  let antes = await snap();
  const totalAntes = Number((await DB.prepare('SELECT COUNT(*) n FROM postagem').first()).n);

  // ---- sem cadastro: Wafly 1 continua pela ponte do Apps Script; Status 2 indisponível ----
  chk('Status 2 indisponível sem Wafly 2 nem Wame', (await A('GET', '/posts')).j.status2Disponivel === false);
  const g0 = await A('GET', '/post/wafly/config');
  chk('config começa sem cadastro (1 = Apps Script)', g0.j.ok && g0.j.slots[1].configurada === false && g0.j.slots[1].origem === 'appscript' && g0.j.slots[2].origem === 'nenhuma', g0.j);
  let id = await novaPostagem('whatsapp');
  await DB.prepare("UPDATE postagem SET agendado_em='2020-01-01T00:00:00Z' WHERE id=?").bind(id).run();
  await W.processarPostagens(env);
  chk('Wafly 1 sem cadastro usa a ponte do Apps Script', zapPedidos.length === 1 && waf.length === 0 && (await lerPost(id)).status === 'publicado');
  antes = await snap();

  // ---- validação e segredo ----
  const ruim = await A('POST', '/post/wafly/config', { slot: 1, instance: 'a', token: 'b', clientToken: 'c' });
  chk('cadastro inválido é recusado em português', ruim.r.status === 400 && /três campos/.test(ruim.j.erro), ruim.j);
  const slotRuim = await A('POST', '/post/wafly/config', { slot: 3, instance: SEG.inst, token: SEG.tok, clientToken: SEG.cli });
  chk('slot desconhecido é recusado', slotRuim.r.status === 400);
  const s1 = await A('POST', '/post/wafly/config', { slot: 1, instance: SEG.inst, token: SEG.tok, clientToken: SEG.cli });
  const s2 = await A('POST', '/post/wafly/config', { slot: 2, instance: SEG2.inst, token: SEG2.tok, clientToken: SEG2.cli });
  chk('cadastro dos dois slots', s1.j.ok && s2.j.ok && s1.j.origem === 'gestao');
  const g1 = await A('GET', '/post/wafly/config');
  const txt = JSON.stringify(g1.j) + JSON.stringify(s1.j) + JSON.stringify(s2.j);
  chk('tokens nunca voltam ao navegador', !txt.includes(SEG.tok) && !txt.includes(SEG.cli) && !txt.includes(SEG2.tok) && !txt.includes(SEG2.cli));
  chk('a tela vê só o código da instância', g1.j.slots[1].instancia === SEG.inst && g1.j.slots[2].instancia === SEG2.inst && g1.j.slots[1].origem === 'gestao');
  chk('cadastrar não mexeu na fila', (await snap()) === antes);
  chk('Status 2 disponível com Wafly 2', (await A('GET', '/posts')).j.status2Disponivel === true);

  // ---- teste somente leitura ----
  waf = [];
  const t1 = await A('POST', '/post/wafly/teste', { slot: 2 });
  chk('teste consulta sessão e Status, sem enviar nada', t1.j.ok && t1.j.itens.length === 2 && waf.every((x) => x.metodo === 'GET') && waf.length === 2 && waf[0].url.includes(SEG2.inst), t1.j);
  chk('teste sem mexer na fila', (await snap()) === antes);

  // ---- Wafly 1 direto ----
  id = await novaPostagem('whatsapp');
  await DB.prepare("UPDATE postagem SET agendado_em='2020-01-01T00:00:00Z' WHERE id=?").bind(id).run();
  waf = []; zapPedidos = [];
  await W.processarPostagens(env);
  const e1 = waf.find((x) => x.metodo === 'POST');
  chk('Wafly 1 cadastrada: fala direto com a Wafly e não usa o Apps Script', e1 && zapPedidos.length === 0 && (await lerPost(id)).status === 'publicado');
  chk('URL da instância, Client-Token e requestId estável', e1.url === 'https://wafly.com.br/api-bridge-whats/instances/' + SEG.inst + '/token/' + SEG.tok + '/status-publication' && e1.headers.get('client-token') === SEG.cli && e1.body.requestId === 'tkpost-' + String(id).padStart(12, '0') && e1.body.type === 'image' && e1.body.caption === 'Vestido TK-0001 R$ 89,90' && typeof e1.body.content === 'string' && e1.body.content.length > 100 && e1.redirect === 'manual', e1 && e1.body && Object.keys(e1.body));
  // Endereço público da mídia devolve 404 para o Worker (Worker->Worker da mesma conta), mas o arquivo está no R2: tem que publicar lendo direto do bucket.
  pubMidia404 = true; objs.set('t/202610/dddddddddddddddddddd.jpg', Buffer.alloc(900, 7));
  const idR2 = await novaPostagem('whatsapp'); await DB.prepare("UPDATE postagem SET agendado_em='2020-01-01T00:00:00Z', midias=? WHERE id=?").bind(JSON.stringify([{ url: MEDIA_URL, tipo: 'imagem' }]), idR2).run();
  waf = []; await W.processarPostagens(env);
  chk('mídia do R2 é lida direto, mesmo com o endereço público dando 404', (await lerPost(idR2)).status === 'publicado' && waf.some((x) => x.metodo === 'POST'), await lerPost(idR2));
  pubMidia404 = false;
  await W.processarPostagens(env);
  chk('cron não repete postagem publicada', waf.filter((x) => x.metodo === 'POST').length === 1);

  // ---- Wafly 2 assume o Status 2 ----
  const p2 = await novaPostagem('whatsapp2');
  await DB.prepare("UPDATE postagem SET agendado_em='2020-01-01T00:00:00Z' WHERE id=?").bind(p2).run();
  waf = []; wameChamado = 0;
  await W.processarPostagens(env);
  const e2 = waf.find((x) => x.metodo === 'POST');
  chk('Status 2 sai pela instância 2 da Wafly, sem tocar no Wame', e2 && e2.url.includes('/instances/' + SEG2.inst + '/token/' + SEG2.tok + '/') && e2.body.requestId === 'tkpost2-' + String(p2).padStart(12, '0') && wameChamado === 0 && (await lerPost(p2)).status === 'publicado');

  // ---- 409: aguarda e só consulta ----
  const p3 = await novaPostagem('whatsapp2');
  await DB.prepare("UPDATE postagem SET agendado_em='2020-01-01T00:00:00Z' WHERE id=?").bind(p3).run();
  wmodo = '409'; waf = [];
  await W.processarPostagens(env);
  let l3 = await lerPost(p3);
  chk('409 vira aguardando confirmação (não é erro)', l3.status === 'processando' && String(l3.ig_id).startsWith('zapq:tkpost2-') && /Aguardando/.test(l3.erro), l3);
  wmodo = 'ok'; waf = [];
  const cons = await A('POST', '/post/consultar', { id: p3 });
  l3 = await lerPost(p3);
  chk('consulta usa o MESMO requestId e não reenvia', cons.j.ok && waf.length === 1 && waf[0].metodo === 'GET' && waf[0].url.endsWith('/requests/tkpost2-' + String(p3).padStart(12, '0')) && waf[0].url.includes(SEG2.inst) && l3.status === 'publicado', { cons: cons.j, waf: waf.map((x) => x.url) });

  // ---- erros em português, sem segredo ----
  const p4 = await novaPostagem('whatsapp2');
  await DB.prepare("UPDATE postagem SET agendado_em='2020-01-01T00:00:00Z' WHERE id=?").bind(p4).run();
  wmodo = '401';
  await W.processarPostagens(env);
  const l4 = await lerPost(p4);
  chk('credencial recusada: erro legível e sem token', l4.status === 'erro' && /recusou as credenciais/.test(l4.erro) && !l4.erro.includes(SEG.tok) && !l4.erro.includes('{'), l4.erro);
  const p5 = await novaPostagem('whatsapp2');
  await DB.prepare("UPDATE postagem SET agendado_em='2020-01-01T00:00:00Z' WHERE id=?").bind(p5).run();
  wmodo = '422';
  await W.processarPostagens(env);
  chk('recusa 4xx vira erro com HTTP e sem JSON cru', /HTTP 422/.test((await lerPost(p5)).erro));
  wmodo = 'timeout';
  const p6 = await novaPostagem('whatsapp2');
  await DB.prepare("UPDATE postagem SET agendado_em='2020-01-01T00:00:00Z' WHERE id=?").bind(p6).run();
  await W.processarPostagens(env);
  chk('timeout não vira erro nem reenvia', (await lerPost(p6)).status === 'processando' && String((await lerPost(p6)).ig_id).startsWith('zapq:'));
  wmodo = 'ok';

  // Duração MP4 real (mvhd), dois slots e tamanho: recusa local sem POST à Wafly.
  function mp4(segundos, versao=0) {
    const h=Buffer.alloc(versao?40:28), q=8;
    h.writeUInt32BE(h.length,0);h.write('mvhd',4);h[q]=versao;
    const off=q+(versao?20:12);h.writeUInt32BE(1000,off);
    if(versao)h.writeBigUInt64BE(BigInt(segundos*1000),off+4);else h.writeUInt32BE(segundos*1000,off+4);
    const b=Buffer.alloc(8+h.length);b.writeUInt32BE(b.length,0);b.write('moov',4);h.copy(b,8);return b;
  }
  for (const versao of [0,1]) {
    const b=mp4(46,versao);chk('parser MP4 mvhd v'+versao,W.duracaoMp4Status_(b.buffer.slice(b.byteOffset,b.byteOffset+b.length))===46);
  }
  chk('MP4 truncado não causa exceção',W.duracaoMp4Status_(new ArrayBuffer(3))===null);
  for (const slot of [1,2]) {
    const key='t/202610/video-longo.mp4',b=mp4(46);objs.set(key,b);
    const id=await novaPostagem(slot===1?'whatsapp':'whatsapp2');
    await DB.prepare('UPDATE postagem SET midias=? WHERE id=?').bind(JSON.stringify([{url:'https://tenkiter-midia.fake/m/'+key,tipo:'video'}]),id).run();
    waf=[];await W.processarPostagens(env);const row=await lerPost(id);
    chk('Status '+slot+': 46 s barrados antes da API, instrução clara',row.status==='erro'&&/46,0 segundos/.test(row.erro)&&/máximo 30/.test(row.erro)&&!waf.some(x=>x.metodo==='POST'),row.erro);
  }
  const keyGrande='t/202610/video-grande.mp4';objs.set(keyGrande,Buffer.alloc(10485761));
  const grande=await novaPostagem('whatsapp2');await DB.prepare('UPDATE postagem SET midias=? WHERE id=?').bind(JSON.stringify([{url:'https://tenkiter-midia.fake/m/'+keyGrande,tipo:'video'}]),grande).run();
  waf=[];await W.processarPostagens(env);
  chk('10 MB: bloqueio local, sem base64 nem POST',/máximo 10 MB/.test((await lerPost(grande)).erro)&&!waf.some(x=>x.metodo==='POST'));
  objs.set('t/202610/video-curto.mp4',mp4(25));
  const curto=await novaPostagem('whatsapp2');await DB.prepare('UPDATE postagem SET midias=? WHERE id=?').bind(JSON.stringify([{url:'https://tenkiter-midia.fake/m/t/202610/video-curto.mp4',tipo:'video'}]),curto).run();
  waf=[];await W.processarPostagens(env);
  chk('25 s: Status 2 envia vídeo uma vez', (await lerPost(curto)).status==='publicado'&&waf.filter(x=>x.metodo==='POST'&&x.body.type==='video').length===1);

  // ---- postagem com recibo antigo do Wame nunca vai para a Wafly ----
  await DB.prepare("UPDATE postagem SET status='agendado', agendado_em='2020-01-01T00:00:00Z' WHERE id=?").bind(velha).run();
  waf = [];
  await W.processarPostagens(env);
  chk('item com recibo do Wame não é reenviado pela Wafly', waf.filter((x) => x.metodo === 'POST').length === 0 && (await DB.prepare('SELECT estado FROM postagem_grupo_recibo WHERE postagem_id=?').bind(velha).first()).estado === 'recusado');

  // ---- remover cadastro: volta ao antigo e a fila fica intacta ----
  const antesRemover = await snap();
  const rm1 = await A('POST', '/post/wafly/config', { slot: 1, apagar: true });
  const rm2 = await A('POST', '/post/wafly/config', { slot: 2, apagar: true });
  chk('remover volta Wafly 1 ao Apps Script', rm1.j.ok && rm1.j.origem === 'appscript' && rm2.j.ok && (await A('GET', '/post/wafly/config')).j.slots[2].configurada === false);
  chk('remover não altera nenhuma postagem nem recibo', (await snap()) === antesRemover);
  const totalDepois = Number((await DB.prepare('SELECT COUNT(*) n FROM postagem').first()).n);
  const futurasOk = (await DB.prepare("SELECT COUNT(*) n FROM postagem WHERE id IN (" + futuras.join(',') + ") AND status='agendado'").first()).n;
  chk('nenhuma das 40 agendadas foi apagada ou alterada', futurasOk === 40 && totalDepois >= totalAntes);
  console.log('\n' + ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) { console.log(falhas.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
