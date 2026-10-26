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
  const R2 = { async get(k) { const v = objs.get(k); return v ? { size:v.length, async arrayBuffer() { return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength); } } : null; }, async put(k, b) { objs.set(k, Buffer.from(b instanceof ReadableStream ? await new Response(b).arrayBuffer() : b)); }, async delete(k) { objs.delete(k); }, async list(o) { const pr = (o && o.prefix) || ''; return { objects: [...objs.keys()].filter((k) => k.startsWith(pr)).map((k) => ({ key: k, size: objs.get(k).length, uploaded: (tempDatas.get(k) || new Date()) })), truncated: false }; } };
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
  console.log('\n' + ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) { console.log(falhas.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
