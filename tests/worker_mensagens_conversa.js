// Testa instagram-worker/worker.js com D1 REAL (SQLite do Node), R2/KV/cache e Instagram FALSOS. Nada vai à Meta, à Cloudflare nem ao Google.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_msg_conversa.mjs');
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
  const meta = new Map();
  const R2 = { async get(k) { const v = objs.get(k); return v ? { size: v.length, httpMetadata: { contentType: (meta.get(k) || {}).contentType }, body: new Response(v).body, async arrayBuffer() { return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength); } } : null; }, async head(k) { const v = objs.get(k); return v ? { size: v.length, httpMetadata: { contentType: (meta.get(k) || {}).contentType } } : null; }, async put(k, b, o) { objs.set(k, Buffer.from(b instanceof ReadableStream ? await new Response(b).arrayBuffer() : b)); meta.set(k, (o && o.httpMetadata) || {}); }, async delete(k) { objs.delete(k); }, async list(o) { const pr = (o && o.prefix) || ''; return { objects: [...objs.keys()].filter((k) => k.startsWith(pr)).map((k) => ({ key: k, size: objs.get(k).length, uploaded: (tempDatas.get(k) || new Date()) })), truncated: false }; } };
  const tempDatas = new Map();
  const KV = { async get(k, t) { const v = kv.get(k); return v === undefined ? null : (t === 'json' ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  const TOKEN = 'IGQVJ_TOKEN_INVENTADO_PARA_TESTE_1234567890';
  // ---- Instagram falso ----
  const GEMINI_OK = 'AIzaINVENTADA_PARA_TESTE_1234567890abcd'; let gemChamadas = [], gemModo = 'ok', gemTexto = '';
  let contaChamadas = [], contaFora = false;
  let postChamadas = [], postErro = null, seqC = 0, containers = {}, publicados = [], videoStatus = 'FINISHED';
  const subChamadas = []; let subAssinada = false;
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
    if (u.startsWith('https://ig.fake/') && u.includes('/me/subscribed_apps')) {
      subChamadas.push({ u, m: (init && init.method) || 'GET', auth: new Headers((init && init.headers) || {}).get('Authorization') });
      if (init && init.method === 'POST') return new Response(JSON.stringify({ success: true }));
      return new Response(JSON.stringify({ data: [{ subscribed_fields: subAssinada ? ['messages'] : [] }] }));
    }
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

  // ======== Mensagens v2: responder, entrega/leitura, falta responder, ao vivo, exportar, métricas ========
  const wh = async (caminho, corpo, extra) => { const r = await w.fetch(new Request('https://ig.test' + caminho, Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) }, extra || {})), env, {}); return { r, j: await r.json().catch(() => null) }; };
  const cfg = (k, v) => DB.prepare('INSERT OR REPLACE INTO cfg (chave, valor) VALUES (?, ?)').bind(k, v).run();
  await wh('/wh/wafly/1/inicial', {});                                  // cria tabelas e o segredo
  const seg = (await DB.prepare("SELECT valor FROM cfg WHERE chave='msg_wh_segredo'").first()).valor;
  const msg = (id, fone, texto, extra) => Object.assign({ type: 'ReceivedCallback', messageId: id, phone: fone, momment: Date.parse('2026-10-25T20:00:00Z'), text: { message: texto }, senderName: 'Maria' }, extra || {});
  const t0 = Date.parse('2026-10-25T20:00:00Z'), em = (min) => t0 + min * 60000;

  // ---- falta responder / não lidas ----
  await wh('/wh/wafly/1/' + seg, msg('A1', '5588999990000', 'Oi, tem o vestido?', { momment: em(0) }));
  await wh('/wh/wafly/1/' + seg, msg('A2', '5588999990000', 'Vocês entregam?', { momment: em(1) }));
  let c = await DB.prepare("SELECT * FROM msg_conversa WHERE canal='whatsapp1' AND contato='5588999990000'").first();
  chk('2 mensagens do cliente = 2 não lidas e falta responder', c.nao_lidas === 2 && c.ult_dir === 'entrada' && c.ult_entrada_em !== '', c);
  let cl = await A('GET', '/msg/conversas?canal=whatsapp1&filtro=sem_resposta');
  chk('filtro "falta responder" lista a conversa e conta', cl.j.conversas.length === 1 && cl.j.contagens.sem_resposta === 1 && cl.j.contagens.nao_lidas === 1, cl.j);
  await wh('/wh/wafly/1/' + seg, msg('A3', '5588999990000', 'Sim, entregamos hoje', { fromMe: true, momment: em(7) }));
  c = await DB.prepare('SELECT * FROM msg_conversa WHERE id=?').bind(c.id).first();
  chk('resposta pelo celular (eco fromMe) zera não lidas e tira de "falta responder"', c.nao_lidas === 0 && c.ult_dir === 'saida' && c.ult_saida_em !== '', c);
  chk('filtro "falta responder" fica vazio', (await A('GET', '/msg/conversas?canal=whatsapp1&filtro=sem_resposta')).j.conversas.length === 0);
  await wh('/wh/wafly/1/' + seg, msg('A4', '5588999990000', 'Obrigada!', { momment: em(8) }));
  chk('nova mensagem do cliente volta a pedir resposta e a ficar não lida', (await A('GET', '/msg/conversas?canal=whatsapp1&filtro=nao_lidas')).j.conversas.length === 1);
  const lida = await A('POST', '/msg/lida', { conversa: c.id });
  chk('marcar como lida zera o contador mas continua "falta responder"', lida.j.ok && (await DB.prepare('SELECT nao_lidas, ult_dir FROM msg_conversa WHERE id=?').bind(c.id).first()).nao_lidas === 0 && (await A('GET', '/msg/conversas?canal=whatsapp1&filtro=sem_resposta')).j.conversas.length === 1);
  await A('POST', '/msg/lida', { conversa: c.id, naoLida: true });
  chk('marcar como não lida volta a 1', (await DB.prepare('SELECT nao_lidas FROM msg_conversa WHERE id=?').bind(c.id).first()).nao_lidas === 1);
  await wh('/wh/wafly/1/' + seg, msg('G9', '120363-group', 'oi grupo', { isGroup: true, chatName: 'Clientes TK', momment: em(9) }));
  chk('grupo não entra em "falta responder"', (await A('GET', '/msg/conversas?canal=whatsapp1&filtro=sem_resposta')).j.contagens.sem_resposta === 1 && (await A('GET', '/msg/conversas?canal=whatsapp1&filtro=grupos')).j.conversas.length === 1);
  chk('busca encontra por texto de qualquer mensagem da conversa', (await A('GET', '/msg/conversas?canal=whatsapp1&busca=entregam')).j.conversas.length === 1);

  // ---- entrega/leitura ----
  chk('mensagem enviada pelo celular nasce "enviada"', (await DB.prepare("SELECT status FROM msg_mensagem WHERE ext_id='A3'").first()).status === 'enviada');
  await wh('/wh/wafly/1/' + seg, { type: 'MessageStatusCallback', status: 'RECEIVED', ids: ['A3'], phone: '5588999990000' });
  chk('RECEIVED vira "entregue"', (await DB.prepare("SELECT status FROM msg_mensagem WHERE ext_id='A3'").first()).status === 'entregue');
  await wh('/wh/wafly/1/' + seg, { type: 'MessageStatusCallback', status: 'READ', ids: ['A3'], phone: '5588999990000' });
  chk('READ vira "lida"', (await DB.prepare("SELECT status FROM msg_mensagem WHERE ext_id='A3'").first()).status === 'lida');
  await wh('/wh/wafly/1/' + seg, { type: 'MessageStatusCallback', status: 'SENT', ids: ['A3'], phone: '5588999990000' });
  chk('o tique nunca desce (SENT depois de READ continua "lida")', (await DB.prepare("SELECT status FROM msg_mensagem WHERE ext_id='A3'").first()).status === 'lida');
  chk('status de id desconhecido não dá erro', (await wh('/wh/wafly/1/' + seg, { type: 'MessageStatusCallback', status: 'READ', ids: ['NAOEXISTE'] })).r.status === 200);
  await wh('/wh/wafly/1/' + seg, { type: 'MessageStatusCallback', status: 'READ_BY_ME', ids: ['A4'], phone: '5588999990000' });
  chk('lida no celular (READ_BY_ME) zera não lidas', (await DB.prepare('SELECT nao_lidas FROM msg_conversa WHERE id=?').bind(c.id).first()).nao_lidas === 0);

  // ---- responder pelo painel (WhatsApp) ----
  let envios = []; let modoZap = 'ok';
  const f1 = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://wafly.com.br/') && u.endsWith('/send-text')) {
      envios.push({ u, h: new Headers(init.headers), b: JSON.parse(init.body) });
      if (modoZap === 'ok') return new Response(JSON.stringify({ zaapId: 'Z1', messageId: 'ENV' + envios.length, id: 'ENV' + envios.length }));
      if (modoZap === 'recusa') return new Response(JSON.stringify({ error: 'x' }), { status: 400 });
      if (modoZap === '500') return new Response('boom', { status: 502 });
      if (modoZap === 'vazio') return new Response('{}', { status: 200 });
    }
    if (u.startsWith('https://wafly.com.br/')) return new Response('{"value":true}');
    return f1(u, init);
  };
  const sem = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'Oi', idLocal: 'abcdefgh1' });
  chk('responder sem Wafly cadastrado: erro legível e nada gravado', sem.r.status === 409 && sem.j.erro.includes('Cadastre o Wafly 1') && envios.length === 0);
  await cfg('wafly_1', JSON.stringify({ instance: 'INST_1', token: 'TOKEN_1', clientToken: 'CLIENT_1' }));
  chk('texto vazio é recusado', (await A('POST', '/msg/enviar', { conversa: c.id, texto: '   ', idLocal: 'abcdefgh2' })).r.status === 400);
  chk('sem idLocal é recusado', (await A('POST', '/msg/enviar', { conversa: c.id, texto: 'oi' })).r.status === 400);
  const ok1 = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'Temos sim! Qual tamanho?', idLocal: 'idlocal-0001' });
  chk('responder envia pela Wafly com telefone e texto certos', ok1.j.ok && envios.length === 1 && envios[0].b.phone === '5588999990000' && envios[0].b.message === 'Temos sim! Qual tamanho?' && envios[0].h.get('client-token') === 'CLIENT_1' && envios[0].u.includes('/send-text'), envios);
  chk('a mensagem aparece na conversa como "enviada" com o final de quem enviou', ok1.j.mensagem.status === 'enviada' && ok1.j.mensagem.por === '0000' && ok1.j.mensagem.direcao === 'saida', ok1.j);
  const conv2 = await DB.prepare('SELECT * FROM msg_conversa WHERE id=?').bind(c.id).first();
  chk('responder tira de "falta responder" e zera não lidas', conv2.ult_dir === 'saida' && conv2.nao_lidas === 0 && conv2.previa.startsWith('Temos sim'));
  const rep = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'Temos sim! Qual tamanho?', idLocal: 'idlocal-0001' });
  chk('o mesmo idLocal não envia duas vezes (toque duplo/rede lenta)', rep.j.ok && envios.length === 1 && rep.j.mensagem.id === ok1.j.mensagem.id);
  await wh('/wh/wafly/1/' + seg, msg('ENV1', '5588999990000', 'Temos sim! Qual tamanho?', { fromMe: true, momment: Date.now() }));
  chk('o eco do que enviamos não duplica a mensagem', (await DB.prepare("SELECT COUNT(*) n FROM msg_mensagem WHERE texto='Temos sim! Qual tamanho?'").first()).n === 1);
  modoZap = 'recusa';
  const rec = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'x', idLocal: 'idlocal-0002' });
  chk('Wafly recusa: erro em português, nada gravado e dá para tentar de novo', rec.r.status === 409 && /recusou/.test(rec.j.erro) && !rec.j.erro.includes('{') && (await DB.prepare("SELECT COUNT(*) n FROM msg_mensagem WHERE texto='x'").first()).n === 0);
  modoZap = '500';
  const inc = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'talvez foi', idLocal: 'idlocal-0003' });
  chk('resposta incerta fica "sem confirmação" e nunca reenvia sozinha', inc.j.incerto === true && inc.j.mensagem.status === 'incerta' && envios.length === 3);
  const inc2 = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'talvez foi', idLocal: 'idlocal-0003' });
  chk('repetir o mesmo idLocal depois de incerta NÃO chama a Wafly de novo', envios.length === 3 && inc2.j.incerto === true);
  modoZap = 'vazio';
  chk('200 sem id também é tratado como incerto', (await A('POST', '/msg/enviar', { conversa: c.id, texto: 'sem id', idLocal: 'idlocal-0004' })).j.incerto === true);
  const gigante = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'a'.repeat(4001), idLocal: 'idlocal-0005' });
  chk('texto grande demais: recusado em português', gigante.r.status === 400 && /grande/.test(gigante.j.erro));

  // ---- responder pelo Instagram ----
  await cfg('ig_token', TOKEN);
  const corpoIg = JSON.stringify({ object: 'instagram', entry: [{ id: 'DONO', messaging: [{ sender: { id: 'CLI9' }, recipient: { id: 'DONO' }, timestamp: Date.now(), message: { mid: 'IGM9', text: 'Tem P?' } }] }] });
  const assinar = async (t) => { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('SEGREDO_APP_META'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return 'sha256=' + Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(t))), (x) => x.toString(16).padStart(2, '0')).join(''); };
  await cfg('ig_app_secret', 'SEGREDO_APP_META');
  await wh('/wh/instagram/' + seg, corpoIg, { headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': await assinar(corpoIg) } });
  const ci = await DB.prepare("SELECT * FROM msg_conversa WHERE canal='instagram' AND contato='CLI9'").first();
  chk('DM do Instagram entra como não lida e pede resposta', ci.nao_lidas === 1 && ci.ult_dir === 'entrada');
  let igEnv = [], modoIg = 'ok'; const f2 = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://ig.fake/v23.0/me/messages')) {
      igEnv.push({ u: String(u), auth: new Headers(init.headers).get('Authorization'), b: JSON.parse(init.body) });
      if (modoIg === 'janela') return new Response(JSON.stringify({ error: { message: 'This message is sent outside of allowed window.', code: 10, error_subcode: 2534022 } }), { status: 400 });
      return new Response(JSON.stringify({ recipient_id: 'CLI9', message_id: 'IGSAIDA1' }));
    }
    return f2(u, init);
  };
  const ri = await A('POST', '/msg/enviar', { conversa: ci.id, texto: 'Tem sim, P e M!', idLocal: 'ig-local-001' });
  chk('Instagram: envia com token no cabeçalho e destinatário certo', ri.j.ok && igEnv[0].auth === 'Bearer ' + TOKEN && igEnv[0].b.recipient.id === 'CLI9' && igEnv[0].b.message.text === 'Tem sim, P e M!', igEnv);
  chk('o token não aparece na resposta', !JSON.stringify(ri.j).includes(TOKEN));
  modoIg = 'janela';
  const rj = await A('POST', '/msg/enviar', { conversa: ci.id, texto: 'tarde demais', idLocal: 'ig-local-002' });
  chk('Instagram fora da janela de 24 h: explica em português', rj.r.status === 409 && /24 horas/.test(rj.j.erro));
  chk('Instagram: limite de 1000 letras explicado', (await A('POST', '/msg/enviar', { conversa: ci.id, texto: 'é'.repeat(600), idLocal: 'ig-local-003' })).j.erro.includes('1000'));
  const lido = JSON.stringify({ object: 'instagram', entry: [{ id: 'DONO', messaging: [{ sender: { id: 'CLI9' }, recipient: { id: 'DONO' }, timestamp: Date.now() + 5000, read: { mid: 'IGSAIDA1' } }] }] });
  await wh('/wh/instagram/' + seg, lido, { headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': await assinar(lido) } });
  chk('Instagram: evento de leitura marca a mensagem da loja como "lida"', (await DB.prepare("SELECT status FROM msg_mensagem WHERE ext_id='IGSAIDA1'").first()).status === 'lida');

  // ---- ao vivo ----
  const antes = (await A('GET', '/msg/novidades?desde=' + encodeURIComponent(new Date(Date.now() - 600000).toISOString()))).j;
  chk('novidades devolvem conversas mudadas e contagens dos 3 canais', antes.ok && antes.conversas.length >= 2 && antes.contagens.whatsapp1 && antes.contagens.instagram.conversas === 1, Object.keys(antes));
  const cur = antes.cursor; await new Promise((r) => setTimeout(r, 25));
  chk('sem nada novo, novidades vem vazio (consulta leve)', (await A('GET', '/msg/novidades?desde=' + encodeURIComponent(new Date(Date.parse(cur) + 20000).toISOString()))).j.conversas.length === 0);
  const ultId = (await DB.prepare('SELECT MAX(id) i FROM msg_mensagem WHERE conversa_id=?').bind(c.id).first()).i;
  await wh('/wh/wafly/1/' + seg, msg('N1', '5588999990000', 'chegou agora', { momment: Date.now() }));
  const nov = (await A('GET', '/msg/novidades?desde=' + encodeURIComponent(cur) + '&conversa=' + c.id + '&depois=' + ultId + '&st=' + encodeURIComponent(cur))).j;
  chk('mensagem nova aparece em novidades com a conversa aberta', nov.mensagens.some((m) => m.texto === 'chegou agora') && nov.conversas.some((x) => x.id === c.id && x.nao_lidas >= 1), nov);
  await wh('/wh/wafly/1/' + seg, { type: 'MessageStatusCallback', status: 'READ', ids: ['ENV1'] });
  const nov2 = (await A('GET', '/msg/novidades?desde=' + encodeURIComponent(cur) + '&conversa=' + c.id + '&depois=' + (ultId + 99) + '&st=' + encodeURIComponent(cur))).j;
  chk('mudança só de status (tique azul) também chega ao vivo', nov2.mensagens.some((m) => m.status === 'lida'), nov2.mensagens);
  chk('contagem leve para o selo do botão', (await A('GET', '/msg/contagem')).j.contagens.whatsapp1.nao_lidas >= 1);

  // ---- exportar ----
  const bruto = async (q) => { const r = await w.fetch(ped('GET', '/msg/exportar?' + q, 'tk2.admin'), env, {}); return { r, t: await r.text() }; };
  const csv = await bruto('conversa=' + c.id + '&formato=csv');
  const bomCsv = new Uint8Array(await (await w.fetch(ped('GET', '/msg/exportar?conversa=' + c.id + '&formato=csv', 'tk2.admin'), env, {})).arrayBuffer());
  chk('exportar CSV: cabeçalho, BOM e download', csv.r.status === 200 && bomCsv[0] === 0xEF && bomCsv[1] === 0xBB && bomCsv[2] === 0xBF && csv.t.replace(/^\uFEFF/, '').startsWith('canal;conversa;contato') && /attachment; filename="tenkiter-mensagens-conversa-\d+-\d{8}\.csv"/.test(csv.r.headers.get('Content-Disposition')), csv.r.headers.get('Content-Disposition'));
  chk('CSV traz quem falou, status e a demora da primeira resposta (7 min)', /Vocês entregam\?/.test(csv.t) && /;loja;texto;"Sim, entregamos hoje";lida;;7\r/.test(csv.t), csv.t.slice(0, 900));
  const txt = await bruto('conversa=' + c.id + '&formato=txt');
  chk('exportar TXT para IA: título, horário de Fortaleza e demora', txt.t.includes('=== WhatsApp 1 · Maria') && txt.t.includes('[25/10/2026 17:00] Cliente: Oi, tem o vestido?') && txt.t.includes('Loja (respondeu em 7 min): Sim, entregamos hoje'), txt.t.slice(0, 600));
  const js = JSON.parse((await bruto('canal=whatsapp1&formato=json')).t);
  chk('exportar JSON do canal inteiro com as conversas', js.conversas.length === 2 && js.conversas.every((x) => Array.isArray(x.mensagens)) && js.cortado === false);
  const tudo = await bruto('formato=csv');
  chk('exportar tudo traz os 3 canais', /WhatsApp 1/.test(tudo.t) && /Instagram/.test(tudo.t));
  await wh('/wh/wafly/2/' + seg, msg('F1', '5588900001111', '=HYPERLINK("http://x","clique")', { momment: Date.now() }));
  chk('CSV protege contra fórmula maliciosa (=, +, -, @)', (await bruto('canal=whatsapp2&formato=csv')).t.includes("\"'=HYPERLINK("));
  chk('filtro por dia', (await bruto('canal=whatsapp1&formato=csv&de=2020-01-01&ate=2020-01-02')).t.split('\r\n').length === 2);
  chk('canal inválido na exportação: 400', (await A('GET', '/msg/exportar?canal=xx')).r.status === 400);
  chk('exportar exige Admin total (sem sessão: 401)', (await w.fetch(ped('GET', '/msg/exportar?formato=csv', ''), env, {})).status === 401);

  // ---- métricas ----
  const met = (await A('GET', '/msg/metricas?canal=whatsapp1&dias=90')).j;
  chk('métricas: contagens, mediana e faixas de tempo', met.ok && met.conversas >= 1 && met.perguntasRespondidas >= 1 && typeof met.medianaMin === 'number' && met.porHora.length === 24, met);
  chk('métricas listam quem está esperando há mais tempo', Array.isArray(met.aguardando.maisAntigas) && met.aguardando.total >= 1);

  // ---- ligar: notify-sent-by-me e status ----
  const puts = []; const f3 = globalThis.fetch;
  globalThis.fetch = async (u, init) => { if (String(u).startsWith('https://wafly.com.br/') && init.method === 'PUT') { puts.push({ u: String(u), b: JSON.parse(init.body) }); return new Response('{"value":true}'); } return f3(u, init); };
  const lig = await A('POST', '/msg/ligar', { slot: 1 });
  chk('ligar também ativa "enviadas pelo celular" e "entregue/lida"', lig.j.ok && lig.j.avisos.length === 0 && puts.some((p) => p.u.endsWith('/update-webhook-received') && p.b.notifySentByMe === true && p.b.value.endsWith('/wh/wafly/1/' + seg)) && puts.some((p) => p.u.endsWith('/update-webhook-message-status') && p.b.value.endsWith('/wh/wafly/1/' + seg)), puts);
  chk('depois de ligar sem avisos o resumo marca "v2" (enviadas e leituras ativas)', (await A('GET', '/msg/resumo')).j.canais.whatsapp1.v2 === true && (await A('GET', '/msg/resumo')).j.canais.whatsapp2.v2 === false);
  let modo404 = 'tudo'; const f4 = globalThis.fetch;
  globalThis.fetch = async (u, init) => { const U = String(u); if (U.startsWith('https://wafly.com.br/') && init && init.body && JSON.parse(init.body).notifySentByMe && (U.endsWith('/update-webhook-received') || (modo404 === 'tudo' && U.endsWith('/update-webhook-received-delivery')))) return new Response('{}', { status: 404 }); return f4(u, init); };
  const lig2 = await A('POST', '/msg/ligar', { slot: 1 });
  chk('se a Wafly não aceitar "enviadas pelo celular", avisa em português, mostra as tentativas e desmarca v2', lig2.j.ok && lig2.j.avisos.length === 1 && /celular/.test(lig2.j.avisos[0]) && lig2.j.detalhes.some((d) => /enviadas PUT 404/.test(d)) && (await A('GET', '/msg/resumo')).j.canais.whatsapp1.v2 === false, lig2.j);
  modo404 = 'so-received';
  const lig3 = await A('POST', '/msg/ligar', { slot: 1 });
  chk('se só o endereço de recebimento recusar, cai para "recebimento+entrega" e marca v2', lig3.j.ok && lig3.j.avisos.length === 0 && (await A('GET', '/msg/resumo')).j.canais.whatsapp1.v2 === true, lig3.j);
  chk('diagnóstico guardado não contém o segredo do endereço', !JSON.stringify((await A('GET', '/msg/diagnostico')).j).includes(seg));
  // ---- revisão: incerta + eco, status não "conserta" incerta, reserva no D1 ----
  await wh('/wh/wafly/1/' + seg, msg('REAL3', '5588999990000', 'talvez foi', { fromMe: true, momment: Date.now() }));
  const rows3 = (await DB.prepare("SELECT ext_id, status FROM msg_mensagem WHERE texto='talvez foi'").all()) || {};
  const l3 = Array.isArray(rows3.results) ? rows3.results : [];
  chk('o eco de uma resposta incerta PROMOVE a mesma bolha (sem duplicar)', l3.length === 1 && l3[0].ext_id === 'REAL3' && l3[0].status === 'enviada', l3);
  modoZap = '500'; const nEnv = envios.length;
  await A('POST', '/msg/enviar', { conversa: c.id, texto: 'incerta que fica', idLocal: 'idlocal-0010' });
  modoZap = 'ok';
  const okDepois = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'depois dela', idLocal: 'idlocal-0011' });
  await wh('/wh/wafly/1/' + seg, { type: 'MessageStatusCallback', status: 'READ', ids: [okDepois.j.mensagem && (await DB.prepare('SELECT ext_id FROM msg_mensagem WHERE id=?').bind(okDepois.j.mensagem.id).first()).ext_id] });
  chk('"lida" de uma mensagem posterior NÃO conserta uma incerta', (await DB.prepare("SELECT status FROM msg_mensagem WHERE texto='incerta que fica'").first()).status === 'incerta');
  await DB.prepare("INSERT INTO cfg (chave, valor) VALUES ('msgenv:crash123456', ?)").bind(new Date().toISOString() + '|enviando').run();
  const antesCrash = envios.length;
  const crash = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'tentativa que caiu no meio', idLocal: 'crash123456' });
  chk('reserva deixada por uma queda no meio: NÃO reenvia, avisa para conferir', crash.j.incerto === true && envios.length === antesCrash && /conferir|Confira/.test(crash.j.erro), crash.j);

  // ======== Mídia (foto/vídeo/áudio) e resposta a story ========
  const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(900, 7)]);
  const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2000, 1)]);
  const MP4_HEVC = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.from('hvc1'), Buffer.alloc(2000, 1)]);
  const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(1500, 3)]);
  let cdnOk = true, cdnChamadas = [], zapMidia = [], igEnvios = [];
  const f5 = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://cdn.wafly.fake/')) { cdnChamadas.push(u); if (!cdnOk) return new Response('x', { status: 404 }); const aud = u.endsWith('.ogg'), vid = u.endsWith('.mp4'); return new Response(aud ? OGG : vid ? MP4 : JPG, { headers: { 'content-type': aud ? 'audio/ogg; codecs=opus' : vid ? 'video/mp4' : 'image/jpeg' } }); }
    if (u.startsWith('https://wafly.com.br/') && /\/send-(image|video|audio)$/.test(u)) { const b = JSON.parse(init.body); zapMidia.push({ rota: u.split('/').pop(), b }); return new Response(JSON.stringify({ messageId: 'MID' + zapMidia.length })); }
    if (u.startsWith('https://ig.fake/') && u.endsWith('/me/messages') && init && init.method === 'POST') { const b = JSON.parse(init.body); igEnvios.push(b); return new Response(JSON.stringify({ message_id: 'IGOUT' + igEnvios.length })); }
    return f5(u, init);
  };
  await cfg('ig_token', TOKEN);
  const tM = Date.now() + 3600000, img = (id, extra) => msg(id, '5588977770000', '', Object.assign({ momment: tM, image: { imageUrl: 'https://cdn.wafly.fake/' + id + '.jpg', caption: 'olha esta', mimeType: 'image/jpeg' } }, extra || {}));
  await wh('/wh/wafly/1/' + seg, img('IMG1'));
  let rI = await DB.prepare("SELECT * FROM msg_mensagem WHERE ext_id='IMG1'").first();
  chk('foto recebida: copiada para o R2 (msg/), tipo imagem, legenda guardada, sem endereço remoto', rI && /^msg\/\d{6}\/[a-f0-9]{24}\.jpg$/.test(rI.midia_chave) && rI.tipo === 'imagem' && rI.texto === 'olha esta' && rI.midia_url === '' && objs.has(rI.midia_chave), rI);
  const cI = await DB.prepare("SELECT id FROM msg_conversa WHERE contato='5588977770000'").first();
  const lm = (await A('GET', '/msg/mensagens?conversa=' + cI.id)).j.mensagens;
  chk('a lista de mensagens informa que há mídia (sem expor o caminho do R2)', lm.length === 1 && lm[0].midia === 1 && !JSON.stringify(lm).includes('msg/'), lm);
  const dl = await w.fetch(ped('GET', '/msg/midia?id=' + rI.id, 'tk2.admin'), env, {});
  chk('/msg/midia devolve os bytes com o tipo certo, só para quem está logado', dl.status === 200 && dl.headers.get('content-type') === 'image/jpeg' && (await dl.arrayBuffer()).byteLength === JPG.length && dl.headers.get('x-content-type-options') === 'nosniff');
  chk('/msg/midia sem sessão: 401', (await w.fetch(ped('GET', '/msg/midia?id=' + rI.id, ''), env, {})).status === 401);
  chk('/msg/midia de id inexistente: 404', (await w.fetch(ped('GET', '/msg/midia?id=99999', 'tk2.admin'), env, {})).status === 404);
  const antesCdn = cdnChamadas.length;
  await wh('/wh/wafly/1/' + seg, img('IMG1'));
  chk('mesma foto reenviada pela Wafly: não baixa de novo nem duplica', cdnChamadas.length === antesCdn && (await DB.prepare("SELECT COUNT(*) AS n FROM msg_mensagem WHERE ext_id='IMG1'").first()).n === 1);
  cdnOk = false;
  await wh('/wh/wafly/1/' + seg, img('IMG2', { momment: tM + 1000 }));
  rI = await DB.prepare("SELECT * FROM msg_mensagem WHERE ext_id='IMG2'").first();
  chk('se a cópia falhar, a mensagem é gravada e o endereço fica para tentar depois', rI && rI.midia_chave === '' && /^https:\/\/cdn\.wafly\.fake\//.test(rI.midia_url) && rI.tipo === 'imagem');
  cdnOk = true;
  const dl2 = await w.fetch(ped('GET', '/msg/midia?id=' + rI.id, 'tk2.admin'), env, {});
  chk('ao abrir, tenta copiar de novo e guarda', dl2.status === 200 && (await DB.prepare('SELECT midia_chave, midia_url FROM msg_mensagem WHERE id=?').bind(rI.id).first()).midia_chave.startsWith('msg/'));
  await wh('/wh/wafly/1/' + seg, msg('AUD1', '5588977770000', '', { momment: tM + 2000, audio: { audioUrl: 'https://cdn.wafly.fake/a1.ogg', mimeType: 'audio/ogg; codecs=opus', seconds: 12, ptt: true } }));
  await wh('/wh/wafly/1/' + seg, msg('VID1', '5588977770000', '', { momment: tM + 3000, video: { videoUrl: 'https://cdn.wafly.fake/v1.mp4', caption: 'prova', mimeType: 'video/mp4', seconds: 7 } }));
  const ma = await DB.prepare("SELECT tipo, midia_mime, midia_seg, texto, midia_chave FROM msg_mensagem WHERE ext_id IN ('AUD1','VID1') ORDER BY ext_id").all();
  chk('áudio (com duração) e vídeo (com legenda) são copiados', ma.results.length === 2 && ma.results[0].tipo === 'áudio' && ma.results[0].midia_mime === 'audio/ogg' && ma.results[0].midia_seg === 12 && ma.results[1].tipo === 'vídeo' && ma.results[1].texto === 'prova' && ma.results.every((x) => x.midia_chave.startsWith('msg/')), ma.results);
  chk('a prévia da conversa mostra o tipo quando não há texto', /^\[(vídeo|áudio|imagem)\]$|prova/.test((await DB.prepare('SELECT previa FROM msg_conversa WHERE id=?').bind(cI.id).first()).previa));
  await wh('/wh/wafly/1/' + seg, msg('DOC1', '5588977770000', '', { momment: tM + 4000, document: { documentUrl: 'https://cdn.wafly.fake/d.pdf', fileName: 'tabela.pdf', mimeType: 'application/pdf' } }));
  chk('documento com tipo não aceito pelo CDN falso não derruba a gravação', (await DB.prepare("SELECT tipo FROM msg_mensagem WHERE ext_id='DOC1'").first()).tipo === 'documento');

  // ---- resposta a story ----
  const pubA = new Date(Date.now() + 3600000 - 5 * 3600000).toISOString(), pubB = new Date(Date.now() + 3600000 - 2 * 3600000).toISOString();
  const midiasP = (k) => JSON.stringify([{ url: 'https://tenkiter-midia.fake/m/' + k, tipo: 'imagem' }]);
  await R2.put('p/storyA.jpg', JPG, { httpMetadata: { contentType: 'image/jpeg' } }); await R2.put('p/storyB.jpg', MP4.length ? JPG : JPG, { httpMetadata: { contentType: 'image/jpeg' } });
  const insPost = (canalP, k, quando, leg) => DB.prepare("INSERT INTO postagem (tipo, modo, legenda, midias, agendado_em, status, canal, publicado_em, criado_em, atualizado_em) VALUES ('story','auto',?,?,?, 'publicado', ?, ?, ?, ?)").bind(leg, midiasP(k), quando, canalP, quando, quando, quando).run();
  await insPost('whatsapp', 'p/storyA.jpg', pubA, 'Conjunto Plus Size'); await insPost('whatsapp', 'p/storyB.jpg', pubB, 'Vestido alfaiataria'); await insPost('whatsapp2', 'p/storyA.jpg', pubA, 'So no 2');
  await wh('/wh/wafly/1/' + seg, msg('ST1', '5588966660000', 'Oi', { momment: tM + 5000, isStatusReply: true, referenceMessageId: 'REFSTATUS' }));
  const forma = (await A('GET', '/msg/diagnostico')).j.forma.whatsapp1;
  chk('diagnóstico não guarda mais avisos brutos (só o formato resumido)', (await A('GET', '/msg/diagnostico')).j.bruto === undefined);
  const st = (await A('GET', '/msg/mensagens?conversa=' + (await DB.prepare("SELECT id FROM msg_conversa WHERE contato='5588966660000'").first()).id)).j.mensagens[0];
  chk('resposta a story: marca como story, acha o Status mais recente e avisa que é "provável" (havia dois)', st.texto === 'Oi' && st.ctx_tipo === 'story' && st.ctx_midia === 1 && st.ctx_aprox === 1 && st.ctx_legenda === 'Vestido alfaiataria' && st.ctx_mtipo === 'imagem' && !!st.ctx_em, st);
  const dls = await w.fetch(ped('GET', '/msg/midia?id=' + st.id + '&ctx=1', 'tk2.admin'), env, {});
  chk('a imagem do story respondido é entregue pela rota autenticada', dls.status === 200 && dls.headers.get('content-type') === 'image/jpeg' && (await dls.arrayBuffer()).byteLength === JPG.length);
  await wh('/wh/wafly/2/' + seg, msg('ST2', '5588955550000', 'Quanto é?', { momment: tM + 6000, isStatusReply: true, referenceMessageId: 'X' }));
  const st2 = (await A('GET', '/msg/mensagens?conversa=' + (await DB.prepare("SELECT id FROM msg_conversa WHERE contato='5588955550000'").first()).id)).j.mensagens[0];
  chk('no WhatsApp 2 só vale story publicado no WhatsApp 2 (exato, não "provável")', st2.ctx_legenda === 'So no 2' && st2.ctx_aprox === 0, st2);
  // ---- "stories no ar": a Wafly não diz qual story foi respondido; a equipe vê os candidatos ----
  const cvS = await DB.prepare("SELECT id FROM msg_conversa WHERE contato='5588966660000'").first();
  const rS = await A('GET', '/msg/stories?conversa=' + cvS.id + '&em=' + encodeURIComponent(new Date(Date.now() + 3600000).toISOString()));
  chk('/msg/stories lista os Status do WhatsApp 1 das últimas 26 h, o mais novo primeiro, sem links', rS.r.status === 200 && rS.j.stories.length === 2 && rS.j.stories[0].legenda === 'Vestido alfaiataria' && rS.j.stories[1].legenda === 'Conjunto Plus Size' && !JSON.stringify(rS.j).includes('tenkiter-midia'), rS.j);
  const rS2 = await A('GET', '/msg/stories?conversa=' + (await DB.prepare("SELECT id FROM msg_conversa WHERE contato='5588955550000'").first()).id + '&em=' + encodeURIComponent(new Date(Date.now() + 3600000).toISOString()));
  chk('/msg/stories do WhatsApp 2 só traz Status do WhatsApp 2', rS2.j.stories.length === 1 && rS2.j.stories[0].legenda === 'So no 2', rS2.j);
  const rS3 = await A('GET', '/msg/stories?conversa=' + cvS.id + '&em=' + encodeURIComponent(new Date(Date.now() - 6 * 3600000).toISOString()));
  chk('/msg/stories respeita o instante da mensagem (nada publicado antes dele)', rS3.j.stories.length === 0, rS3.j);
  chk('/msg/stories de conversa inexistente: 404; sem sessão: 401', (await A('GET', '/msg/stories?conversa=99999')).r.status === 404 && (await w.fetch(ped('GET', '/msg/stories?conversa=' + cvS.id, ''), env, {})).status === 401);
  const pidB = (await DB.prepare("SELECT id FROM postagem WHERE legenda='Vestido alfaiataria'").first()).id;
  const dP = await w.fetch(ped('GET', '/msg/midia?post=' + pidB + '&n=0', 'tk2.admin'), env, {});
  chk('/msg/midia?post= entrega a imagem do Status publicado pela rota autenticada', dP.status === 200 && dP.headers.get('content-type') === 'image/jpeg' && (await dP.arrayBuffer()).byteLength === JPG.length);
  chk('/msg/midia?post= recusa postagem que não é Status publicado e sem sessão', (await w.fetch(ped('GET', '/msg/midia?post=99999&n=0', 'tk2.admin'), env, {})).status === 404 && (await w.fetch(ped('GET', '/msg/midia?post=' + pidB, ''), env, {})).status === 401);
  await wh('/wh/wafly/1/' + seg, msg('ST3', '5588944440000', 'Oi', { momment: tM + 7000, isStatusReply: true }));
  await DB.prepare("UPDATE postagem SET status='erro' WHERE canal='whatsapp'").run();
  await wh('/wh/wafly/1/' + seg, msg('ST4', '5588933330000', 'Oi', { momment: tM + 8000, isStatusReply: true }));
  const st4 = (await A('GET', '/msg/mensagens?conversa=' + (await DB.prepare("SELECT id FROM msg_conversa WHERE contato='5588933330000'").first()).id)).j.mensagens[0];
  chk('sem Status publicado nas últimas 26 h: mostra só o aviso de story, sem imagem', st4.ctx_tipo === 'story' && st4.ctx_midia === 0 && !st4.ctx_em, st4);
  chk('/msg/midia?ctx=1 sem story associado: 404 em português', (await w.fetch(ped('GET', '/msg/midia?id=' + (await DB.prepare("SELECT id FROM msg_mensagem WHERE ext_id='ST4'").first()).id + '&ctx=1', 'tk2.admin'), env, {})).status === 404);
  // resposta citando uma mensagem
  await wh('/wh/wafly/1/' + seg, msg('Q1', '5588922220000', 'Tem a camisa azul?', { momment: tM + 9000 }));
  await wh('/wh/wafly/1/' + seg, msg('Q2', '5588922220000', 'Sim', { momment: tM + 9500, fromMe: true }));
  await wh('/wh/wafly/1/' + seg, msg('Q3', '5588922220000', 'Quanto?', { momment: tM + 10000, referenceMessageId: 'Q2' }));
  const q3 = (await A('GET', '/msg/mensagens?conversa=' + (await DB.prepare("SELECT id FROM msg_conversa WHERE contato='5588922220000'").first()).id)).j.mensagens.find((x) => x.texto === 'Quanto?');
  chk('resposta a uma mensagem anterior mostra o trecho citado e quem escreveu', q3.ctx_tipo === 'resposta' && q3.ctx_texto === 'Sim' && q3.ctx_qdir === 'saida', q3);
  chk('diagnóstico guarda só NOMES dos campos do aviso (nunca conteúdo)', forma && forma.ctx === 'story' && forma.campos.includes('isStatusReply') && !JSON.stringify(forma).includes('REFSTATUS') && !JSON.stringify(forma).includes('5588'), forma);

  // ---- enviar mídia pelo painel ----
  const up = async (tipo, bytes, sess) => { const r = await w.fetch(new Request('https://ig.test/msg/anexo?tipo=' + encodeURIComponent(tipo), { method: 'POST', headers: { Origin: O, 'X-TK-Whats': '88999990000', 'X-TK-Sessao': sess === undefined ? 'tk2.admin' : sess, 'Content-Type': 'application/octet-stream' }, body: bytes }), env, {}); return { r, j: await r.json() }; };
  const upJ = await up('imagem', JPG);
  chk('anexo: foto JPEG válida é guardada em out/ (único prefixo público) com o tipo detectado nos bytes', upJ.j.ok && upJ.j.mime === 'image/jpeg' && /^out\/\d{6}\/[a-f0-9]{24}\.jpg$/.test(upJ.j.anexo) && objs.has(upJ.j.anexo), upJ.j);
  chk('anexo: arquivo que não é foto (mesmo pedindo "imagem") é recusado em português', (await up('imagem', Buffer.from('<html><script>alert(1)</script></html>'))).r.status === 415);
  chk('anexo: foto acima de 8 MB: 413', (await up('imagem', Buffer.concat([JPG, Buffer.alloc(8 * 1048576)]))).r.status === 413);
  const hv = await up('vídeo', MP4_HEVC);
  chk('anexo: vídeo H.265/HEVC é recusado antes de enviar', hv.r.status === 415 && /H\.265/.test(hv.j.erro), hv.j);
  const upV = await up('vídeo', MP4), upA = await up('áudio', OGG);
  chk('anexo: MP4 e áudio OGG válidos', upV.j.ok && upV.j.mime === 'video/mp4' && upA.j.ok && upA.j.mime === 'audio/ogg');
  chk('anexo: tipo desconhecido: 400; sem sessão: 401', (await up('arquivo', JPG)).r.status === 400 && (await up('imagem', JPG, '')).r.status === 401);
  const cWa = (await DB.prepare("SELECT id FROM msg_conversa WHERE contato='5588977770000'").first()).id;
  const eImg = await A('POST', '/msg/enviar', { conversa: cWa, texto: 'Segue a foto', idLocal: 'idmedia-0001', anexo: upJ.j.anexo });
  const zi = zapMidia[zapMidia.length - 1];
  chk('enviar foto pelo WhatsApp: usa /send-image com o endereço público e a legenda', eImg.j.ok && zi.rota === 'send-image' && zi.b.image === 'https://tenkiter-midia.fake/m/' + upJ.j.anexo && zi.b.caption === 'Segue a foto' && zi.b.phone === '5588977770000', zi);
  chk('a foto enviada aparece como mensagem da loja com mídia e legenda', eImg.j.mensagem.tipo === 'imagem' && eImg.j.mensagem.midia === 1 && eImg.j.mensagem.texto === 'Segue a foto' && eImg.j.mensagem.direcao === 'saida', eImg.j.mensagem);
  const eImg2 = await A('POST', '/msg/enviar', { conversa: cWa, texto: 'Segue a foto', idLocal: 'idmedia-0001', anexo: upJ.j.anexo });
  chk('tocar duas vezes não manda duas fotos (idempotente)', eImg2.j.ok && zapMidia.length === 1);
  const antesCdn2 = cdnChamadas.length;
  await wh('/wh/wafly/1/' + seg, img('MID1', { fromMe: true, momment: Date.now() + 3600000 + 20000, image: { imageUrl: 'https://cdn.wafly.fake/eco.jpg', caption: 'Segue a foto' } }));
  chk('o eco da foto enviada pelo painel não duplica a bolha nem baixa de novo', (await DB.prepare("SELECT COUNT(*) AS n FROM msg_mensagem WHERE conversa_id=? AND tipo='imagem' AND direcao='saida'").bind(cWa).first()).n === 1 && cdnChamadas.length === antesCdn2);
  const eVid = await A('POST', '/msg/enviar', { conversa: cWa, texto: '', idLocal: 'idmedia-0002', anexo: upV.j.anexo }), eAud = await A('POST', '/msg/enviar', { conversa: cWa, texto: 'ignorada', idLocal: 'idmedia-0003', anexo: upA.j.anexo, seg: 9 });
  chk('vídeo usa /send-video e áudio usa /send-audio (sem legenda)', eVid.j.ok && zapMidia[1].rota === 'send-video' && zapMidia[1].b.video && eAud.j.ok && zapMidia[2].rota === 'send-audio' && zapMidia[2].b.audio && zapMidia[2].b.caption === undefined && eAud.j.mensagem.midia_seg === 9, [zapMidia[1], zapMidia[2]]);
  chk('anexo inexistente/forjado: recusado', (await A('POST', '/msg/enviar', { conversa: cWa, texto: '', idLocal: 'idmedia-0004', anexo: 'msg/202610/' + 'a'.repeat(24) + '.jpg' })).j.ok === false && (await A('POST', '/msg/enviar', { conversa: cWa, texto: '', idLocal: 'idmedia-0005', anexo: '../segredo' })).r.status === 400);
  const unp = await A('POST', '/msg/enviar', { conversa: cWa, texto: '', idLocal: 'idmedia-0006' });
  chk('sem texto e sem anexo: pede para escrever', unp.r.status === 400);
  // Instagram
  const cIg = (await DB.prepare("SELECT id FROM msg_conversa WHERE canal='instagram' AND contato='CLI9'").first()).id;
  const upI = await up('imagem', JPG);
  const igTxt = await A('POST', '/msg/enviar', { conversa: cIg, texto: 'legenda', idLocal: 'idmedia-0007', anexo: upI.j.anexo });
  chk('Instagram não aceita texto junto com mídia: avisa antes de enviar', igTxt.r.status === 400 && /Instagram/.test(igTxt.j.erro) && igEnvios.length === 0, igTxt.j);
  const igOk = await A('POST', '/msg/enviar', { conversa: cIg, texto: '', idLocal: 'idmedia-0008', anexo: upI.j.anexo });
  chk('Instagram: foto vai como anexo com endereço público', igOk.j.ok && igEnvios[0].message.attachment.type === 'image' && igEnvios[0].message.attachment.payload.url === 'https://tenkiter-midia.fake/m/' + upI.j.anexo, igEnvios[0]);
  // Instagram recebendo mídia e resposta a story
  const corpoIgM = JSON.stringify({ object: 'instagram', entry: [{ id: 'DONO', messaging: [{ sender: { id: 'CLI77' }, recipient: { id: 'DONO' }, timestamp: Date.now() + 3600000 + 50000, message: { mid: 'IGM77', text: 'Amei!', attachments: [{ type: 'image', payload: { url: 'https://cdn.wafly.fake/ig77.jpg' } }], reply_to: { story: { id: 'S1', url: 'https://cdn.wafly.fake/storyig.jpg' } } } }] }] });
  await wh('/wh/instagram/' + seg, corpoIgM, { headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': await assinar(corpoIgM) } });
  const im = await DB.prepare("SELECT * FROM msg_mensagem WHERE ext_id='IGM77'").first();
  chk('Instagram: foto recebida e imagem do story respondido são copiadas', im && im.tipo === 'imagem' && im.midia_chave.startsWith('msg/') && im.ctx_tipo === 'story' && im.ctx_chave.startsWith('msg/'), im);
  const dIg = await w.fetch(ped('GET', '/msg/midia?id=' + im.id + '&ctx=1', 'tk2.admin'), env, {});
  chk('Instagram: story respondido servido pela rota autenticada', dIg.status === 200 && dIg.headers.get('content-type') === 'image/jpeg');
  const exp = await w.fetch(ped('GET', '/msg/exportar?formato=txt&conversa=' + cWa, 'tk2.admin'), env, {});
  chk('exportação identifica fotos/vídeos/áudios como [imagem] etc. e nunca traz endereços de mídia', /\[imagem\]|\[vídeo\]|\[áudio\]/.test(await exp.text()));
  globalThis.fetch = f5;
  console.log('\n' + ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) { console.log(falhas.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
