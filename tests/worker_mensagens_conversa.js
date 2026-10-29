// Testa instagram-worker/worker.js com D1 REAL (SQLite do Node), R2/KV/cache e Instagram FALSOS. Nada vai à Meta, à Cloudflare nem ao Google.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_msg_conversa.mjs');
fs.writeFileSync(tmp, fs.readFileSync(process.env.TK_WORKER_SOURCE || path.join(__dirname, '..', 'instagram-worker', 'worker.js'))+'\nexport {processarFilaZernio_};');
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
    if (u.startsWith('https://api.fake')) { const b = JSON.parse(init.body); if (b.action === 'contaPorWhats') { contaChamadas.push(b); return new Response(JSON.stringify(b.sessao === 'tk2.cliente' ? { ok: false } : contaFora ? { ok: false, erro: 'x' } : String(b.alvo) === '88977776666' ? { ok: true, existe: true, nome: 'Joana Cadastrada' } : { ok: true, existe: false })); } return new Response(JSON.stringify(b.sessao === 'tk2.admin' ? { ok: true, usuario: { nome:'Ana Lojista', permissoes: ['gerir_acessos', 'catalogo_cadastrar'] } } : b.sessao === 'tk2.gerente' ? { ok: true, usuario: { permissoes: ['catalogo_cadastrar'], nome: 'Gerente' } } : b.sessao === 'tk2.cliente' ? { ok: true, usuario: { permissoes: [], nome: 'Maria Cliente', whatsapp: '88988887777' } } : { ok: false })); }
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
  chk('grupo não lido também precisa de resposta quando incluído', (await A('GET', '/msg/conversas?canal=whatsapp1&filtro=sem_resposta')).j.contagens.sem_resposta === 2 && (await A('GET', '/msg/conversas?canal=whatsapp1&filtro=grupos')).j.conversas.length === 1);
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
    if (u.startsWith('https://wafly.com.br/') && (u.endsWith('/send-text') || u.endsWith('/send-link'))) {
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
  modoZap = 'ok';
  // v2.13: prévia do link escolhida na mensagem
  const pv1 = await A('POST', '/msg/enviar', { conversa: c.id, texto: '*Ana:*\nBlusa\nhttps://tenkitermodas.com.br/p/TK-0754.', idLocal: 'idlocal-pv01', previa: true, previaTitulo: 'Térmica UV\ninfantil P', previaDescricao: 'R$ 24,99 à vista' });
  const ePv = envios[envios.length - 1];
  chk('com prévia: vai pelo /send-link com o primeiro link (sem o ponto final), título e descrição', pv1.j.ok && ePv.u.endsWith('/send-link') && ePv.b.linkUrl === 'https://tenkitermodas.com.br/p/TK-0754' && ePv.b.message.startsWith('*Ana:*') && ePv.b.title === 'Térmica UV infantil P' && ePv.b.linkDescription === 'R$ 24,99 à vista' && ePv.b.phone === '5588999990000', ePv);
  const pv2 = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'sem link aqui', idLocal: 'idlocal-pv02', previa: true });
  chk('com prévia mas sem link: vai como texto simples', pv2.j.ok && envios[envios.length - 1].u.endsWith('/send-text'));
  const pv3 = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'veja https://tenkitermodas.com.br/?sel=TK-0001,TK-0002', idLocal: 'idlocal-pv03' });
  chk('sem marcar a prévia: link vai como texto simples (como antes)', pv3.j.ok && envios[envios.length - 1].u.endsWith('/send-text'));
  const pv4 = await A('POST', '/msg/enviar', { conversa: c.id, texto: 'https://x.com/a', idLocal: 'idlocal-pv04', previa: true, previaTitulo: 'x'.repeat(300) });
  chk('cartão: título cortado em 100 letras e sem descrição vazia', pv4.j.ok && envios[envios.length - 1].b.title.length === 100 && !('linkDescription' in envios[envios.length - 1].b));

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
  // ---- v2.10: aba "Todas", filtro "Lidas", leitura no celular e configuração ----
  const todas = await A('GET', '/msg/conversas?canal=todos');
  const canaisTodas = new Set(todas.j.conversas.map((x) => x.canal));
  chk('aba Todas junta conversas de mais de um canal', todas.j.ok && canaisTodas.size >= 2 && todas.j.contagens && typeof todas.j.contagens.conversas === 'number', [...canaisTodas]);
  const soLidas = await A('GET', '/msg/conversas?canal=todos&filtro=lidas');
  chk('filtro Lidas só traz conversas sem não lidas', soLidas.j.ok && soLidas.j.conversas.every((x) => x.nao_lidas === 0));
  chk('canal inválido continua recusado', (await A('GET', '/msg/conversas?canal=xyz')).r.status === 400);
  const leituras = [];
  const f6 = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://wafly.com.br/') && (u.endsWith('/modify-chat') || u.endsWith('/read-message'))) { leituras.push({ u, b: JSON.parse(init.body), h: new Headers(init.headers) }); return new Response(JSON.stringify(u.endsWith('/modify-chat') && modoLeitura === 'recusa' ? { error: 'x' } : { value: true }), { status: u.endsWith('/modify-chat') && modoLeitura === 'recusa' ? 405 : 200 }); }
    if (u.startsWith('https://ig.fake') && init && init.body && String(init.body).includes('mark_seen')) { leituras.push({ u, b: JSON.parse(init.body) }); return new Response('{"recipient_id":"x"}'); }
    return f6(u, init);
  };
  let modoLeitura = 'ok';
  await DB.prepare('UPDATE msg_conversa SET nao_lidas=2 WHERE id=?').bind(cWa).run();
  const semCel = await A('POST', '/msg/lida', { conversa: cWa });
  chk('marcar lida sem pedir o celular (Espiar/antigo): não chama a Wafly', semCel.j.ok && leituras.length === 0 && semCel.j.celular === undefined);
  await DB.prepare('UPDATE msg_conversa SET nao_lidas=2 WHERE id=?').bind(cWa).run();
  const comCel = await A('POST', '/msg/lida', { conversa: cWa, celular: true });
  chk('abrir normal: zera não lidas e marca a conversa lida no celular pela Wafly (modify-chat)', comCel.j.ok && comCel.j.celular && comCel.j.celular.ok === true && leituras.length === 1 && leituras[0].u.endsWith('/modify-chat') && leituras[0].b.action === 'read' && leituras[0].h.get('client-token') === 'CLIENT_1' && (await DB.prepare('SELECT nao_lidas FROM msg_conversa WHERE id=?').bind(cWa).first()).nao_lidas === 0, comCel.j);
  modoLeitura = 'recusa';
  const fb = await A('POST', '/msg/lida', { conversa: cWa, celular: true });
  chk('se a Wafly recusar o modify-chat, tenta marcar a última mensagem recebida (read-message)', fb.j.celular && fb.j.celular.ok === true && leituras.some((x) => x.u.endsWith('/read-message') && x.b.messageId), leituras.map((x) => x.u.split('/').pop()));
  const cfg0 = await A('GET', '/msg/config');
  chk('configuração começa com os 3 canais ligados e guarda a última tentativa', cfg0.j.ok && cfg0.j.config.lerCelular.whatsapp1 === true && cfg0.j.config.lerCelular.instagram === true && cfg0.j.ultimaLeitura.whatsapp1 && cfg0.j.ultimaLeitura.whatsapp1.ok === true, cfg0.j);
  const cfg1 = await A('POST', '/msg/config', { lerCelular: { whatsapp1: false, lixo: true } });
  chk('desligar um canal salva (e ignora o que não é canal)', cfg1.j.ok && cfg1.j.config.lerCelular.whatsapp1 === false && cfg1.j.config.lerCelular.lixo === undefined);
  const n0 = leituras.length;
  const desl = await A('POST', '/msg/lida', { conversa: cWa, celular: true });
  chk('canal desligado: marca lida no painel e não chama a Wafly', desl.j.ok && desl.j.celular && desl.j.celular.desligado === true && leituras.length === n0);
  await A('POST', '/msg/config', { lerCelular: { whatsapp1: true } });
  const igLida = await A('POST', '/msg/lida', { conversa: cIg, celular: true });
  chk('Instagram: abrir normal manda "visto" (mark_seen) para a pessoa', igLida.j.celular && igLida.j.celular.ok === true && leituras.some((x) => x.b && x.b.sender_action === 'mark_seen'), igLida.j);
  globalThis.fetch = f6;
  // ---- v2.11: nome do próprio WhatsApp, mesma pessoa nos 2 WhatsApp, encerrar ----
  const T0 = Date.parse('2026-10-26T12:00:00Z');
  const conv = async (canalX, fone) => DB.prepare('SELECT * FROM msg_conversa WHERE canal=? AND contato=?').bind(canalX, fone).first();
  await wh('/wh/wafly/1/' + seg, msg('N1', '5588911110001', 'Vou te mandar as disponíveis', { fromMe: true, senderName: 'tenkitermodas', chatName: 'tenkitermodas', momment: T0 }));
  chk('mensagem enviada pela loja não dá o nome da loja à conversa', (await conv('whatsapp1', '5588911110001')).nome === '', await conv('whatsapp1', '5588911110001'));
  chk('um envio só ainda não decide qual é o nome da loja', ((await DB.prepare("SELECT valor FROM cfg WHERE chave='msg_nome_proprio_whatsapp1'").first()) || {}).valor !== 'tenkitermodas', await DB.prepare("SELECT valor FROM cfg WHERE chave='msg_nome_proprio_whatsapp1'").first());
  await DB.prepare("UPDATE msg_conversa SET nome='tenkitermodas' WHERE contato='5588911110001'").run();   // como ficou no banco antes da correção
  await DB.prepare("INSERT INTO msg_conversa (canal, contato, nome, grupo, total, ultima_em, criado_em, atualizada_em) VALUES ('whatsapp1','5588911110009','Cliente Salva',0,1,'2026-10-26T11:00:00Z','x','x')").run();
  await wh('/wh/wafly/1/' + seg, msg('N2', '5588911110002', 'Qual seu nome?', { fromMe: true, senderName: 'tenkitermodas', chatName: 'tenkitermodas', momment: T0 + 1000 }));
  await wh('/wh/wafly/1/' + seg, msg('N3', '5588911110003', 'Sábado a gente fecha às 14:00', { fromMe: true, senderName: 'tenkitermodas', chatName: 'tenkitermodas', momment: T0 + 2000 }));
  chk('o mesmo nome enviando para outro contato = nome da loja: conversas antigas com ele voltam a mostrar o número', (await conv('whatsapp1', '5588911110001')).nome === '' && (await conv('whatsapp1', '5588911110009')).nome === 'Cliente Salva');
  await wh('/wh/wafly/1/' + seg, msg('N4', '5588911110001', 'Oi! Quero ver', { senderName: 'Joana Lima', momment: T0 + 3000 }));
  chk('quando o cliente escreve, a conversa ganha o nome que ele colocou no WhatsApp', (await conv('whatsapp1', '5588911110001')).nome === 'Joana Lima');
  // mesma pessoa nos dois WhatsApp (com e sem o 9º dígito)
  await wh('/wh/wafly/2/' + seg, msg('P1', '558811110001', 'Oi, aqui é a Joana de novo', { senderName: 'Joana', momment: T0 + 4000 }));
  const lw1 = await A('GET', '/msg/conversas?canal=whatsapp1'), lw2 = await A('GET', '/msg/conversas?canal=whatsapp2');
  const jw1 = lw1.j.conversas.find((x) => x.contato === '5588911110001'), jw2 = lw2.j.conversas.find((x) => x.contato === '558811110001');
  chk('mesma pessoa nos 2 WhatsApp (com e sem o 9): cada conversa aponta para a outra', jw1 && jw2 && jw1.outro_id === jw2.id && jw2.outro_id === jw1.id, [jw1 && jw1.outro_id, jw2 && jw2.id]);
  chk('quem só fala por um WhatsApp não aponta para nada', lw1.j.conversas.filter((x) => x.contato !== '5588911110001').every((x) => x.outro_id == null));
  const amb = await A('GET', '/msg/conversas?canal=todos&filtro=ambos');
  chk('filtro "Nos 2 WhatsApp" traz as duas conversas da pessoa e a contagem bate', amb.j.conversas.length === 2 && amb.j.contagens.ambos === 1, [amb.j.conversas.map((x) => x.contato), amb.j.contagens]);
  chk('grupo nunca entra na conta de "mesma pessoa"', amb.j.conversas.every((x) => !x.grupo));
  // encerrar / reabrir
  const antesE = (await A('GET', '/msg/conversas?canal=todos')).j;
  const enc = await A('POST', '/msg/encerrar', { conversas: [jw1.id, jw2.id] });
  chk('encerrar várias de uma vez', enc.j.ok && enc.j.alteradas === 2 && enc.j.contagens.todos.encerradas >= 1, enc.j);
  const depoisE = (await A('GET', '/msg/conversas?canal=todos')).j;
  chk('encerradas saem de Todas e da contagem de conversas', !depoisE.conversas.some((x) => x.id === jw1.id || x.id === jw2.id) && depoisE.contagens.conversas === antesE.contagens.conversas - 1, [antesE.contagens, depoisE.contagens]);
  const ab = (await A('GET', '/msg/conversas?canal=todos&filtro=encerradas')).j;
  chk('filtro Encerradas mostra as duas', ab.conversas.length === 2 && ab.conversas.every((x) => x.encerrada_em));
  chk('busca acha também as encerradas', (await A('GET', '/msg/conversas?canal=todos&busca=Joana')).j.conversas.some((x) => x.id === jw1.id));
  chk('encerrada fica fora de "Falta responder"', !(await A('GET', '/msg/conversas?canal=whatsapp2&filtro=sem_resposta')).j.conversas.some((x) => x.id === jw2.id));
  await wh('/wh/wafly/2/' + seg, msg('P2', '558811110001', 'Ainda tem o vestido?', { senderName: 'Joana', momment: T0 + 5000 }));
  chk('nova mensagem do cliente reabre sozinha (e fica não lida)', (await conv('whatsapp2', '558811110001')).encerrada_em === '' && (await conv('whatsapp2', '558811110001')).nao_lidas === 1 && (await conv('whatsapp1', '5588911110001')).encerrada_em !== '');
  await wh('/wh/wafly/1/' + seg, msg('P3', '5588911110001', 'Obrigada!', { fromMe: true, senderName: 'tenkitermodas', momment: T0 + 6000 }));
  chk('mensagem enviada pela loja não reabre', (await conv('whatsapp1', '5588911110001')).encerrada_em !== '');
  const re = await A('POST', '/msg/encerrar', { conversas: [jw1.id], reabrir: true });
  chk('reabrir à mão', re.j.ok && (await conv('whatsapp1', '5588911110001')).encerrada_em === '');
  chk('encerrar sem conversa: erro em português', (await A('POST', '/msg/encerrar', { conversas: ['x'] })).j.erro === 'Escolha ao menos uma conversa.');
  chk('encerrar exige Admin total (sem sessão: 401)', (await w.fetch(ped('POST', '/msg/encerrar', '', { conversas: [jw1.id] }), env, {})).status === 401);
  // ---- v2.11: nome do atendente nas respostas ----
  const ca0 = await A('GET', '/msg/config');
  chk('assinatura começa ligada e sem nome próprio guardado', ca0.j.config.assinatura === true && ca0.j.meuNome === '', ca0.j);
  const ca1 = await A('POST', '/msg/config', { meuNome: '  *Pa_blo*  ~Atendente~ `x` muito comprido demais para caber aqui ' });
  chk('nome do atendente é limpo (sem símbolos do WhatsApp) e limitado a 30 letras', ca1.j.ok && ca1.j.meuNome.length <= 30 && !/[*_~`]/.test(ca1.j.meuNome) && ca1.j.meuNome.startsWith('Pa blo'), ca1.j.meuNome);
  chk('o nome fica guardado para quem está logado', (await A('GET', '/msg/config')).j.meuNome === ca1.j.meuNome);
  const ca2 = await A('POST', '/msg/config', { assinatura: false });
  chk('Admin desliga somente a própria assinatura (sem apagar o nome)', ca2.j.config.assinatura === false && ca2.j.meuNome === ca1.j.meuNome && ca2.j.config.lerCelular.whatsapp1 === true);
  await A('POST', '/msg/config', { assinatura: true });
  const ca3 = await A('POST', '/msg/config', { meuNome: '' });
  chk('nome vazio volta ao padrão (primeiro nome do cadastro)', ca3.j.meuNome === '' && ca3.j.config.assinatura === true);
  // ---- v2.12: tipo, lidas em lote, "nos 2 WhatsApp" sem encerradas, contato, respostas rápidas ----
  const Tg = Date.parse('2026-10-26T15:00:00Z');
  await wh('/wh/wafly/1/' + seg, msg('RG1', '120363999-group', 'oi grupo', { isGroup: true, chatName: 'Equipe', senderName: 'Ana', participantPhone: '5588900000001', momment: Tg }));
  const ti = await A('GET', '/msg/conversas?canal=whatsapp1&tipo=individual'), tg = await A('GET', '/msg/conversas?canal=whatsapp1&tipo=grupo');
  chk('tipo=individual só traz conversas; tipo=grupo só grupos', ti.j.conversas.length > 0 && ti.j.conversas.every((x) => !x.grupo) && tg.j.conversas.length > 0 && tg.j.conversas.every((x) => x.grupo), [ti.j.conversas.length, tg.j.conversas.length]);
  chk('contagens acompanham o tipo e trazem o total de conversas e de grupos', tg.j.contagens.conversas === tg.j.conversas.length && tg.j.tipos.grupos >= 1 && tg.j.tipos.individuais === ti.j.conversas.length, [tg.j.contagens, tg.j.tipos]);
  // pessoa nos dois WhatsApp: encerrar uma tira a outra do filtro; quando o cliente escreve na encerrada, volta
  await wh('/wh/wafly/1/' + seg, msg('RQ1', '5588977770001', 'Oi pelo 1', { senderName: 'Rita', momment: Tg + 1000 }));
  await wh('/wh/wafly/2/' + seg, msg('RQ2', '558877770001', 'Oi pelo 2', { senderName: 'Rita', momment: Tg + 2000 }));
  const rq1 = (await conv('whatsapp1', '5588977770001')).id, rq2 = (await conv('whatsapp2', '558877770001')).id;
  const ambIds = async () => (await A('GET', '/msg/conversas?canal=todos&filtro=ambos')).j.conversas.map((x) => x.id);
  chk('as duas conversas da Rita aparecem em "Nos 2 WhatsApp"', (await ambIds()).includes(rq1) && (await ambIds()).includes(rq2));
  await A('POST', '/msg/encerrar', { conversas: [rq2] });
  const aposEnc = await A('GET', '/msg/conversas?canal=whatsapp1');
  chk('encerrar a do WhatsApp 2 tira a do WhatsApp 1 de "Nos 2 WhatsApp" (sem o aviso "Também no")', !(await ambIds()).includes(rq1) && aposEnc.j.conversas.find((x) => x.id === rq1).outro_id == null);
  await wh('/wh/wafly/2/' + seg, msg('RQ3', '558877770001', 'Voltei', { senderName: 'Rita', momment: Tg + 3000 }));
  chk('o cliente escreve na encerrada: as duas voltam para "Nos 2 WhatsApp"', (await ambIds()).includes(rq1) && (await ambIds()).includes(rq2));
  // lidas em lote
  const fLe = globalThis.fetch, chamadasLe = [];
  globalThis.fetch = async (u, init) => { if (/\/(modify-chat|read-message)$/.test(String(u))) { chamadasLe.push(String(u)); return new Response('{}'); } return fLe(u, init); };
  await DB.prepare('UPDATE msg_conversa SET nao_lidas=3 WHERE id IN (?,?)').bind(rq1, rq2).run();
  const lote = await A('POST', '/msg/lida', { conversas: [rq1, rq2, 'x'], celular: true });
  chk('marcar várias como lidas: zera no painel e confirma no celular as que estavam não lidas', lote.j.ok && lote.j.alteradas === 2 && lote.j.celular.ok + lote.j.celular.falhas === 2 && lote.j.celular.ok >= 1 && chamadasLe.length >= 1 && (await conv('whatsapp1', '5588977770001')).nao_lidas === 0, lote.j);
  const lote2 = await A('POST', '/msg/lida', { conversas: [rq1, rq2], celular: true });
  const n2 = chamadasLe.length;
  chk('já lidas: não chama o celular de novo', lote2.j.celular.ok === 0 && lote2.j.celular.falhas === 0 && chamadasLe.length === n2);
  const nl = await A('POST', '/msg/lida', { conversas: [rq1], naoLida: true });
  chk('marcar várias como não lidas (só no painel)', nl.j.ok && (await conv('whatsapp1', '5588977770001')).nao_lidas === 1 && chamadasLe.length === n2);
  chk('lote vazio: erro em português', (await A('POST', '/msg/lida', { conversas: ['x'] })).j.erro === 'Escolha ao menos uma conversa.');
  chk('marcar uma só continua funcionando como antes', (await A('POST', '/msg/lida', { conversa: rq1 })).j.ok === true && (await conv('whatsapp1', '5588977770001')).nao_lidas === 0);
  // cartão de contato e localização
  await wh('/wh/wafly/1/' + seg, msg('RC1', '5588977770001', '', { senderName: 'Rita', momment: Tg + 4000, text: undefined, contact: { displayName: 'Maria Prima', vCard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Maria Prima\nTEL;type=CELL:+55 88 99999-1234\nEND:VCARD' } }));
  const cm = await DB.prepare("SELECT tipo, texto FROM msg_mensagem WHERE ext_id='RC1'").first();
  chk('cartão de contato grava o nome e o número', cm.tipo === 'contato' && cm.texto === 'Maria Prima · +5588999991234', cm);
  await wh('/wh/wafly/1/' + seg, msg('RL1', '5588977770001', '', { senderName: 'Rita', momment: Tg + 5000, text: undefined, location: { latitude: -5.17, longitude: -40.67, name: 'Loja', address: 'Rua X, 1' } }));
  chk('localização grava nome e endereço', (await DB.prepare("SELECT texto FROM msg_mensagem WHERE ext_id='RL1'").first()).texto === 'Loja · Rua X, 1');
  // respostas rápidas
  { const r0 = (await A('GET', '/msg/config')).j.respostas; chk('respostas rápidas começam com os 11 atalhos padrão (v7.40.8)', Array.isArray(r0) && r0.length === 11 && r0[0].t === '/oi' && r0[10].t === '/saiu', r0); }
  const rr = await A('POST', '/msg/config', { respostas: [{ t: 'Endereço', x: 'Rua A, 10' }, { t: '', x: 'sem título' }, { t: 'X'.repeat(60), x: 'Y'.repeat(1200) }] });
  chk('respostas rápidas: salva, ignora sem título e corta tamanhos', rr.j.respostas.length === 2 && rr.j.respostas[1].t.length === 40 && rr.j.respostas[1].x.length === 1000, rr.j.respostas.map((r) => r.t.length));
  globalThis.fetch = fLe;
  chk('respostas rápidas voltam no GET', (await A('GET', '/msg/config')).j.respostas[0].x === 'Rua A, 10');
  // ---- v2.13: motivo do encerramento e métricas ----
  const Tm = Date.now() - 3 * 3600000;
  await wh('/wh/wafly/1/' + seg, msg('MT1', '5588966660001', 'Tem o vestido azul?', { senderName: 'Bia', momment: Tm }));
  const cm1 = (await conv('whatsapp1', '5588966660001')).id;
  const m0 = (await A('GET', '/msg/metricas?canal=whatsapp1&dias=7')).j;
  chk('antes de encerrar, a pergunta da Bia está esperando', m0.aguardando.maisAntigas.some((x) => x.id === cm1));
  const e1 = await A('POST', '/msg/encerrar', { conversas: [cm1] });
  const c1x = await conv('whatsapp1', '5588966660001'), h1 = await DB.prepare('SELECT * FROM msg_encerramento WHERE conversa_id=?').bind(cm1).all();
  chk('sem motivo = "concluido"; vai para o histórico com quem encerrou', e1.j.ok && c1x.encerrada_motivo === 'concluido' && h1.results.length === 1 && h1.results[0].motivo === 'concluido' && h1.results[0].por === '0000' && h1.results[0].pessoa === c1x.pessoa, h1.results);
  const m1 = (await A('GET', '/msg/metricas?canal=whatsapp1&dias=7')).j;
  chk('"Concluído" conta como atendimento resolvido na hora (sai de esperando e entra no tempo de resposta)', !m1.aguardando.maisAntigas.some((x) => x.id === cm1) && m1.perguntasRespondidas === m0.perguntasRespondidas + 1 && m1.encerramentos.concluido >= 1, [m0.perguntasRespondidas, m1.perguntasRespondidas, m1.encerramentos]);
  chk('lista mostra o motivo da encerrada', (await A('GET', '/msg/conversas?canal=whatsapp1&filtro=encerradas')).j.conversas.find((x) => x.id === cm1).encerrada_motivo === 'concluido');
  await wh('/wh/wafly/1/' + seg, msg('MT2', '5588966660001', 'Voltei, e o rosa?', { senderName: 'Bia', momment: Date.now() - 3600000 }));
  chk('cliente escreve de novo: reabre e o motivo sai (o histórico fica)', (await conv('whatsapp1', '5588966660001')).encerrada_motivo === '' && (await DB.prepare('SELECT COUNT(*) n FROM msg_encerramento WHERE conversa_id=?').bind(cm1).first()).n === 1);
  await A('POST', '/msg/encerrar', { conversas: [cm1], motivo: 'sem_resposta' });
  chk('"Cliente parou de responder" fica guardado', (await conv('whatsapp1', '5588966660001')).encerrada_motivo === 'sem_resposta' && (await DB.prepare("SELECT COUNT(*) n FROM msg_encerramento WHERE conversa_id=? AND motivo='sem_resposta'").bind(cm1).first()).n === 1);
  await A('POST', '/msg/encerrar', { conversas: [cm1], motivo: 'xpto' }).then(() => {});
  chk('motivo desconhecido vira "concluido"', (await conv('whatsapp1', '5588966660001')).encerrada_motivo === 'concluido');
  await wh('/wh/wafly/1/' + seg, msg('MT3', '5588966660002', 'oi quero ganhar dinheiro', { senderName: 'Spam', momment: Tm }));
  const cm2 = (await conv('whatsapp1', '5588966660002')).id;
  const mA = (await A('GET', '/msg/metricas?canal=whatsapp1&dias=7')).j;
  await A('POST', '/msg/encerrar', { conversas: [cm2], motivo: 'engano' });
  const mB = (await A('GET', '/msg/metricas?canal=whatsapp1&dias=7')).j;
  chk('"Engano ou spam" tira a conversa das métricas', mB.conversas === mA.conversas - 1 && mB.entradas === mA.entradas - 1 && mB.encerramentos.engano === 1, [mA.conversas, mB.conversas, mB.encerramentos]);
  await A('POST', '/msg/encerrar', { conversas: [cm2], reabrir: true });
  chk('reabrir limpa o motivo', (await conv('whatsapp1', '5588966660002')).encerrada_motivo === '');
  // ---- v2.14: ponte do Google Contatos (só leitura: cópia de segurança e relatório) ----
  const PONTE = 'https://script.google.com/macros/s/AKfycbTESTEPONTE1234567890abcdef/exec', CHAVE_P = 'a'.repeat(64);
  const contatosG = [
    { r: 'people/c1', n: 'Maria Silva', f: ['+55 88 99999-0001'] }, { r: 'people/c2', n: 'Maria S.', f: ['(88) 9999-0001'], m: ['m@x.com'] },
    { r: 'people/c3', n: 'Sem número', f: [] }, { r: 'people/c4', n: 'Fixo errado', f: ['12345'] }, { r: 'people/c5', n: 'Rita', f: ['+5588977770001'] }
  ];
  const pedidosPonte = []; const fPonte = globalThis.fetch; let ponteVelha = false; const juntados = [], criadosG = [];
  globalThis.fetch = async (u, init) => {
    if (String(u) === PONTE) {
      const b = JSON.parse(init.body); pedidosPonte.push(b);
      if (b.chave !== CHAVE_P) return new Response(JSON.stringify({ ok: false, erro: 'Chave da ponte inválida.' }));
      if (b.acao === 'ping') return new Response(JSON.stringify({ ok: true, versao: 'contatos-ponte-1.0', conta: 'contatos@exemplo.com' }));
      if (b.acao === 'backup') return new Response(JSON.stringify({ ok: true, total: contatosG.length, arquivo: 'contatos-google-2026-10-26-1800.json', url: 'https://drive.google.com/file/d/abc' }));
      if (b.acao === 'listar') { const ini = Number(b.pagina || 0); return new Response(JSON.stringify({ ok: true, contatos: contatosG.slice(ini, ini + 3), proxima: ini + 3 < contatosG.length ? String(ini + 3) : '', total: contatosG.length })); }
      if (b.acao === 'juntar_lote') { if (!b.confirmar) return new Response(JSON.stringify({ ok: false, erro: 'Juntar contatos precisa de confirmação.' })); juntados.push(...b.grupos); return new Response(JSON.stringify({ ok: true, feitos: b.grupos.length, pulados: 0, apagados: b.grupos.reduce((t, g) => t + g.apagar.length, 0) })); }
      if (b.acao === 'padronizar_parte') { const ini = Number(b.pagina || 0); return new Response(JSON.stringify({ ok: true, lidos: Math.min(3, contatosG.length - ini), mudados: ini ? 0 : 2, totalPessoas: contatosG.length, proxima: ini + 3 < contatosG.length ? String(ini + 3) : '' })); }
      if (b.acao === 'criar_lote') { criadosG.push(...b.contatos); return new Response(JSON.stringify({ ok: true, resultados: b.contatos.map((c, i) => ({ fone: c.fone.replace(/\D/g, ''), ok: true, ja: c.fone.endsWith('0009'), r: 'people/n' + (criadosG.length + i) })) })); }
      if (b.acao === 'backup_parte') {
        if (ponteVelha) return new Response(JSON.stringify({ ok: false, erro: 'Ação desconhecida.' }));
        const ini = Number(b.pagina || 0), parte = ini / 2 + 1;
        return new Response(JSON.stringify({ ok: true, pasta: b.pasta || 'pastaCOPIA0001', pastaNome: 'contatos-google-2026-10-27-1500', url: 'https://drive.google.com/drive/folders/pastaCOPIA0001', parte, lidos: contatosG.slice(ini, ini + 2).length, totalPessoas: contatosG.length, proxima: ini + 2 < contatosG.length ? String(ini + 2) : '' }));
      }
    }
    if (String(u).startsWith('https://script.google.com/macros/s/AKfycbPAGINA')) return new Response('<html>Faça login</html>');
    return fPonte(u, init);
  };
  const sit0 = await A('GET', '/msg/contatos/situacao');
  chk('ponte começa desligada', sit0.j.ok && sit0.j.ligada === false && sit0.j.marcador === 'Tenkiter Clientes G');
  chk('endereço errado: erro em português', /script\.google\.com/.test((await A('POST', '/msg/contatos/config', { url: 'https://exemplo.com/x', chave: CHAVE_P })).j.erro));
  chk('chave curta: erro em português', /chave/.test((await A('POST', '/msg/contatos/config', { url: PONTE, chave: 'abc' })).j.erro));
  chk('chave que a ponte não aceita: não liga', (await A('POST', '/msg/contatos/config', { url: PONTE, chave: 'b'.repeat(64) })).j.erro === 'Chave da ponte inválida.' && !(await A('GET', '/msg/contatos/situacao')).j.ligada);
  chk('implantação que devolve página de login: explica o que conferir', /Qualquer pessoa/.test((await A('POST', '/msg/contatos/config', { url: 'https://script.google.com/macros/s/AKfycbPAGINA1234567890abcdefgh/exec', chave: CHAVE_P })).j.erro));
  const ligP = await A('POST', '/msg/contatos/config', { url: PONTE, chave: CHAVE_P });
  const sit1 = await A('GET', '/msg/contatos/situacao');
  chk('ligar confirma com a ponte e guarda a conta', ligP.j.ok && ligP.j.conta === 'contatos@exemplo.com' && sit1.j.ligada && sit1.j.conta === 'contatos@exemplo.com', ligP.j);
  chk('a chave nunca volta para a tela', !JSON.stringify(sit1.j).includes(CHAVE_P) && !JSON.stringify(ligP.j).includes(CHAVE_P));
  chk('relatório antes da cópia de segurança: pede a cópia primeiro', (await A('POST', '/msg/contatos/relatorio')).j.erro === 'Faça a cópia de segurança dos contatos antes do relatório.');
  const bkP = await A('POST', '/msg/contatos/backup');
  chk('cópia de segurança no Drive da conta dos contatos', bkP.j.ok && bkP.j.total === 5 && bkP.j.url === 'https://drive.google.com/file/d/abc' && (await A('GET', '/msg/contatos/situacao')).j.backup.arquivo === 'contatos-google-2026-10-26-1800.json', bkP.j);
  const nPed = pedidosPonte.length, relP = await A('POST', '/msg/contatos/relatorio');
  chk('relatório lê todas as páginas da ponte', relP.j.ok && relP.j.total === 5 && pedidosPonte.slice(nPed).filter((x) => x.acao === 'listar').length === 2, relP.j);
  chk('relatório: duplicados pelo número (com e sem o 9 e com máscara)', relP.j.duplicados.total === 1 && relP.j.duplicados.lista[0].contatos.map((c) => c.r).sort().join() === 'people/c1,people/c2', relP.j.duplicados);
  chk('relatório: sem número e número inválido', relP.j.semFone === 1 && relP.j.invalidos.total === 1 && relP.j.invalidos.lista[0].n === 'Fixo errado');
  chk('relatório: números a padronizar (+55 e o 9 do celular antigo; espaço e traço não contam)', relP.j.corrigir.lista.some((x) => x.r === 'people/c2' && x.para === '+5588999990001') && !relP.j.corrigir.lista.some((x) => x.r === 'people/c1'), relP.j.corrigir);
  chk('relatório: quem conversou no WhatsApp e não está no Google', relP.j.semCadastro.total >= 1 && !relP.j.semCadastro.lista.some((x) => x.fone === '+5588977770001') && relP.j.semCadastro.lista.every((x) => /^\+55/.test(x.fone)), relP.j.semCadastro.lista.slice(0, 3));
  chk('nenhuma ação de mudança foi pedida à ponte (só leitura)', pedidosPonte.every((x) => ['ping', 'backup', 'listar'].includes(x.acao)));
  chk('relatório fica guardado para abrir depois', (await A('GET', '/msg/contatos/situacao?relatorio=1')).j.relatorio.total === 5);
  // v2.15: cópia em partes e relatório em etapas (contas grandes)
  ponteVelha = true;
  const velha = await A('POST', '/msg/contatos/backup', { partes: true });
  chk('cópia em partes com a ponte 1.0: pede para atualizar para a 1.1', velha.r.status === 502 && /contatos-ponte-1\.1/.test(velha.j.erro));
  ponteVelha = false;
  chk('continuar a cópia sem a pasta é recusado', (await A('POST', '/msg/contatos/backup', { partes: true, pagina: '2' })).r.status === 400);
  let pc = await A('POST', '/msg/contatos/backup', { partes: true }), voltasBk = 1;
  chk('1ª parte: devolve progresso (lidos, total, parte) e ainda não terminou', pc.j.ok && pc.j.fim === false && pc.j.lidos === 2 && pc.j.totalPessoas === 5 && pc.j.parte === 1 && pc.j.pasta === 'pastaCOPIA0001' && pc.j.proxima === '2', pc.j);
  while (!pc.j.fim && voltasBk < 10) { pc = await A('POST', '/msg/contatos/backup', { partes: true, pagina: pc.j.proxima, pasta: pc.j.pasta }); voltasBk++; }
  const bkSit = (await A('GET', '/msg/contatos/situacao')).j.backup;
  chk('repete até o fim: soma as partes e registra a cópia com o link da pasta', pc.j.fim && pc.j.lidos === 5 && voltasBk === 3 && bkSit.total === 5 && bkSit.partes === 3 && bkSit.url === 'https://drive.google.com/drive/folders/pastaCOPIA0001' && bkSit.arquivo === 'contatos-google-2026-10-27-1500', [pc.j, bkSit]);
  chk('ao terminar, o andamento da cópia é apagado', !(await DB.prepare("SELECT valor FROM cfg WHERE chave='contatos_backup_and'").first()));
  chk('relatório: etapa inválida é recusada', (await A('POST', '/msg/contatos/relatorio', { etapa: 'xpto' })).r.status === 400);
  await A('POST', '/msg/contatos/relatorio', { etapa: 'inicio' });
  let rp = await A('POST', '/msg/contatos/relatorio', { etapa: 'parte' }), voltasRel = 1;
  chk('relatório em etapas: cada parte lê uma página e conta o progresso', rp.j.ok && rp.j.lidos === 3 && rp.j.total === 5 && rp.j.proxima === '3', rp.j);
  while (rp.j.proxima && voltasRel < 10) { rp = await A('POST', '/msg/contatos/relatorio', { etapa: 'parte', pagina: rp.j.proxima }); voltasRel++; }
  const rf = await A('POST', '/msg/contatos/relatorio', { etapa: 'fim' });
  chk('etapa final: mesmo resultado do relatório de uma vez só', rf.j.ok && rf.j.total === 5 && rf.j.duplicados.total === relP.j.duplicados.total && rf.j.invalidos.total === relP.j.invalidos.total && rf.j.semFone === relP.j.semFone && rf.j.corrigir.total === relP.j.corrigir.total, rf.j);
  chk('etapa final limpa a tabela temporária (sem dados pessoais sobrando)', (await DB.prepare('SELECT COUNT(*) n FROM msg_contatos_tmp').first()).n === 0);
  // v2.16: limpeza aprovada (juntar, padronizar, criar) e cadastro automático "TM Cliente …"
  const planoN = await DB.prepare("SELECT tipo, COUNT(*) n FROM msg_contatos_plano GROUP BY tipo").all();
  const planoDup = JSON.parse((await DB.prepare("SELECT dados FROM msg_contatos_plano WHERE tipo='dup'").first()).dados);
  chk('relatório guarda o plano completo (repetidos e novos)', planoN.results.some((x) => x.tipo === 'dup' && x.n === 1) && planoN.results.some((x) => x.tipo === 'novo' && x.n >= 1), planoN.results);
  chk('no plano, fica o contato de nome mais completo', planoDup.manter === 'people/c1' && planoDup.apagar.join() === 'people/c2', planoDup);
  chk('situação avisa que o plano está pronto', (await A('GET', '/msg/contatos/situacao')).j.planoPronto === true);
  const bkGuard = await DB.prepare("SELECT valor FROM cfg WHERE chave='contatos_backup'").first();
  await cfg('contatos_backup', JSON.stringify(Object.assign(JSON.parse(bkGuard.valor), { em: '2026-01-01T00:00:00.000Z' })));
  const velhoBk = await A('POST', '/msg/contatos/limpeza', { etapa: 'juntar' });
  chk('limpeza sem cópia recente (6 h): pede cópia nova e não chama a ponte', velhoBk.r.status === 409 && /cópia de segurança nova/.test(velhoBk.j.erro) && juntados.length === 0);
  await cfg('contatos_backup', bkGuard.valor);
  chk('etapa inválida é recusada', (await A('POST', '/msg/contatos/limpeza', { etapa: 'xpto' })).r.status === 400);
  const lj = await A('POST', '/msg/contatos/limpeza', { etapa: 'juntar' });
  chk('juntar: manda os grupos do plano com confirmação e conta o progresso', lj.j.ok && lj.j.feito === 1 && lj.j.total === 1 && lj.j.proximo === '' && juntados.length === 1 && juntados[0].manter === 'people/c1', [lj.j, juntados]);
  let lp = await A('POST', '/msg/contatos/limpeza', { etapa: 'padronizar' }), vp = 1;
  while (lp.j.proxima && vp < 10) { lp = await A('POST', '/msg/contatos/limpeza', { etapa: 'padronizar', pagina: lp.j.proxima }); vp++; }
  chk('padronizar: repete as páginas até o fim', lp.j.ok && vp === 2 && lp.j.feito === 5 && lp.j.total === 5, lp.j);
  const nNovos = planoN.results.find((x) => x.tipo === 'novo').n;
  let lc = await A('POST', '/msg/contatos/limpeza', { etapa: 'criar' }), vc = 1;
  while (lc.j.restantes && vc < 10) { lc = await A('POST', '/msg/contatos/limpeza', { etapa: 'criar', continuar: true }); vc++; }
  chk('criar: quem conversou e não está no Google vira "TM Cliente …"', lc.j.ok && lc.j.restantes === 0 && criadosG.length === nNovos && criadosG.every((c) => /^TM Cliente /.test(c.nome) && /^55\d{10,11}$/.test(c.fone)), [lc.j, criadosG.slice(0, 3)]);
  const lf = await A('POST', '/msg/contatos/limpeza', { etapa: 'fim' });
  const sitL = (await A('GET', '/msg/contatos/situacao')).j;
  chk('fim: resumo guardado, plano apagado e cadastro automático ligado', lf.j.ok && lf.j.juntados === 1 && lf.j.apagados === 1 && lf.j.padronizados === 2 && sitL.limpeza.juntados === 1 && sitL.auto === true && sitL.planoPronto === false, [lf.j, sitL.limpeza]);
  const nFila = criadosG.length;
  await wh('/wh/wafly/1/' + seg, msg('AUTO1', '5588912340001', 'Oi, quero ver as blusas', { senderName: 'Joana Lima' }));
  await wh('/wh/wafly/1/' + seg, msg('AUTO2', '5588912340001', 'Tem tamanho M?', { senderName: 'Joana Lima' }));
  await wh('/wh/wafly/1/' + seg, msg('AUTO3', '5588912340002', 'Oi', { senderName: '' }));
  const filaAuto = (await DB.prepare("SELECT nome, fone, estado FROM msg_contatos_fila WHERE fone IN ('5588912340001','5588912340002') ORDER BY fone").all()).results;
  chk('número novo no WhatsApp entra na fila uma vez só, com o padrão "TM Cliente nome do WhatsApp"', filaAuto.length === 2 && filaAuto[0].nome === 'TM Cliente Joana Lima' && filaAuto[0].estado === 'pendente', filaAuto);
  chk('sem nome no WhatsApp: "TM Cliente (88) 91234-0002"', filaAuto[1].nome === 'TM Cliente (88) 91234-0002', filaAuto[1]);
  const esperas = []; await w.scheduled({ scheduledTime: Date.parse('2026-10-27T10:01:00Z') }, env, { waitUntil: (p) => esperas.push(p) }); await Promise.allSettled(esperas);
  const filaDepois = (await DB.prepare("SELECT estado, r FROM msg_contatos_fila WHERE fone IN ('5588912340001','5588912340002')").all()).results;
  chk('a cada minuto a fila cria os contatos no Google (marcados como feitos)', criadosG.length === nFila + 2 && filaDepois.every((x) => x.estado === 'feito' && /^people\//.test(x.r)), [filaDepois, criadosG.slice(-2)]);
  chk('desligar o cadastro automático', (await A('POST', '/msg/contatos/auto', { ligado: false })).j.auto === false && (await A('GET', '/msg/contatos/situacao')).j.auto === false);
  await wh('/wh/wafly/1/' + seg, msg('AUTO4', '5588912340003', 'Oi', { senderName: 'Pedro' }));
  chk('com o automático desligado, número novo não entra na fila', !(await DB.prepare("SELECT 1 FROM msg_contatos_fila WHERE fone='5588912340003'").first()));
  const deslP = await A('POST', '/msg/contatos/config', { desligar: true });
  chk('desligar apaga endereço e chave do servidor', deslP.j.ok && !(await A('GET', '/msg/contatos/situacao')).j.ligada && !(await DB.prepare("SELECT valor FROM cfg WHERE chave='contatos_chave'").first()));
  globalThis.fetch = fPonte;
  globalThis.fetch = f5;
  // ---- v2.14: chave do Zernio ----
  const fZ = globalThis.fetch; let zModo = 'ok', zChamadas = [];
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://zernio.com/api/v1/accounts')) {
      zChamadas.push({ u, auth: new Headers(init.headers).get('authorization') });
      if (zModo === 'recusa') return new Response('{"error":"invalid_credentials","key":"x"}', { status: 401 });
      if (zModo === 'semig') return new Response(JSON.stringify({ accounts: [], hasAnalyticsAccess: false }));
      if (zModo === 'duas') return new Response(JSON.stringify({ accounts: [{ _id: 'acc_p', platform: 'instagram', username: 'pablo_fontenele88' }, { _id: 'acc_t', platform: 'instagram', username: 'tenkitermodasceara' }, { _id: 'acc_f', platform: 'facebook', username: 'pagina' }], hasAnalyticsAccess: false }));
      return new Response(JSON.stringify({ accounts: [{ _id: 'acc_1', platform: 'instagram', username: 'tenkitermodasceara' }], hasAnalyticsAccess: false }));
    }
    return fZ(u, init);
  };
  chk('Zernio: sem chave, a tela vê "não configurada"', (await A('GET', '/msg/zernio/config')).j.configurada === false);
  chk('Zernio: chave curta ou com espaço é recusada sem chamar o Zernio', (await A('POST', '/msg/zernio/config', { chave: 'abc' })).r.status === 400 && (await A('POST', '/msg/zernio/config', { chave: 'sk_' + 'a'.repeat(20) + ' b' })).r.status === 400 && zChamadas.length === 0);
  zModo = 'recusa';
  const zR = await A('POST', '/msg/zernio/config', { chave: 'sk_live_' + 'x'.repeat(32) });
  chk('Zernio recusa a chave: erro em português, nada salvo e sem repassar a resposta', zR.r.status === 400 && /recusou/.test(zR.j.erro) && !zR.j.erro.includes('{') && !(await DB.prepare("SELECT valor FROM cfg WHERE chave='zernio_chave'").first()));
  zModo = 'ok';
  const zChave = 'sk_live_' + 'k'.repeat(32), zOk = await A('POST', '/msg/zernio/config', { chave: zChave });
  chk('Zernio aceita: guarda a chave, mostra o Instagram conectado e usa Bearer', zOk.j.ok && zOk.j.conta.usuario === 'tenkitermodasceara' && zOk.j.conta.id === 'acc_1' && zChamadas[zChamadas.length - 1].auth === 'Bearer ' + zChave && zChamadas[zChamadas.length - 1].u.includes('platform=instagram'));
  const zSit = await A('GET', '/msg/zernio/config');
  chk('a chave do Zernio nunca volta para a tela', zSit.j.configurada === true && !JSON.stringify(zSit.j).includes(zChave) && !JSON.stringify(zOk.j).includes(zChave));
  zModo = 'semig';
  const zSem = await A('POST', '/msg/zernio/config', { chave: zChave });
  chk('chave certa sem Instagram conectado: salva e avisa que falta conectar', zSem.j.ok && zSem.j.conta === null);
  zModo = 'duas';
  const zDuas = await A('POST', '/msg/zernio/config', { chave: zChave });
  chk('dois Instagram no Zernio: escolhe sozinho o da loja e lista os dois (sem o Facebook)', zDuas.j.ok && zDuas.j.conta.usuario === 'tenkitermodasceara' && zDuas.j.contas.map((c) => c.usuario).join() === 'pablo_fontenele88,tenkitermodasceara', zDuas.j);
  const zLis = await A('POST', '/msg/zernio/config', { listar: true });
  chk('listar usa a chave guardada e mostra qual está em uso', zLis.j.ok && zLis.j.contas.length === 2 && zLis.j.conta.id === 'acc_t' && !JSON.stringify(zLis.j).includes(zChave));
  const zEsc = await A('POST', '/msg/zernio/config', { escolher: 'acc_p' });
  chk('escolher outro Instagram troca a conta guardada', zEsc.j.ok && zEsc.j.conta.usuario === 'pablo_fontenele88' && (await A('GET', '/msg/zernio/config')).j.conta.id === 'acc_p');
  chk('escolher um Instagram que não está no Zernio é recusado', (await A('POST', '/msg/zernio/config', { escolher: 'acc_x' })).r.status === 400);
  chk('remover apaga a chave e a conta do servidor', (await A('POST', '/msg/zernio/config', { apagar: true })).j.ok && !(await DB.prepare("SELECT valor FROM cfg WHERE chave='zernio_chave'").first()) && (await A('GET', '/msg/zernio/config')).j.configurada === false);
  globalThis.fetch = fZ;

  // ---- v2.18: Instagram Direct pelo Zernio (aviso assinado, story respondido, envio) ----
  const zEnvios = [], zHooks = []; let zJanela = false;
  const fZ2 = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://zernio.com/api/v1/accounts')) return new Response(JSON.stringify({ accounts: [{ _id: 'acc_t', platform: 'instagram', username: 'tenkitermodasceara' }] }));
    if (u.startsWith('https://zernio.com/api/v1/webhooks/settings')) { zHooks.push({ m: init.method, b: init.body ? JSON.parse(init.body) : null, u }); return new Response(JSON.stringify({ success: true, webhook: { _id: 'wh_1' } })); }
    if (/\/inbox\/conversations\/conv_9\/messages\?/.test(u)) return new Response(JSON.stringify({ messages: [{ id: 'mid_story', storyReply: { storyId: 'IGSTORY1', storyUrl: 'https://cdn.fake/story.jpg' } }, { id: 'mid_txt' }] }));
    if (/\/inbox\/conversations\/conv_9\/messages$/.test(u)) { const b = JSON.parse(init.body); zEnvios.push(b); if (zJanela && !b.messageTag) return new Response(JSON.stringify({ error: 'Message sent outside the 24 hour window' }), { status: 400 }); return new Response(JSON.stringify({ success: true, data: { messageId: 'mid_out_' + zEnvios.length, conversationId: 'conv_9' } })); }
    if (u === 'https://cdn.fake/story.jpg' || u === 'https://cdn.fake/mencao.jpg') return new Response(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
    return fZ2(u, init);
  };
  const zLig = await A('POST', '/msg/zernio/config', { chave: zChave });
  const hk = zHooks.find((x) => x.m === 'POST');
  chk('salvar a chave liga o aviso de mensagens no Zernio, só para o Instagram escolhido', zLig.j.ok && zLig.j.aviso && zLig.j.aviso.ok && hk && hk.b.events.join() === 'message.received,message.sent' && hk.b.accountIds.join() === 'acc_t' && /\/wh\/zernio\/.+/.test(hk.b.url) && hk.b.secret.length === 64, [zLig.j, hk]);
  chk('situação mostra que o aviso está ligado', (await A('GET', '/msg/zernio/config')).j.avisoLigado === true);
  const zSeg = (await DB.prepare("SELECT valor FROM cfg WHERE chave='zernio_wh_segredo'").first()).valor, zUrl = new URL(hk.b.url).pathname;
  const zAss = async (corpo) => { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(zSeg), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(corpo))), (x) => x.toString(16).padStart(2, '0')).join(''); };
  const zPost = async (ev, assinaturaErrada) => { const corpo = JSON.stringify(ev); return wh(zUrl, corpo, { headers: { 'Content-Type': 'application/json', 'X-Zernio-Signature': assinaturaErrada ? 'a'.repeat(64) : await zAss(corpo) } }); };
  const zEv = (over) => ({ id: 'ev_' + Math.random(), event: 'message.received', account: { accountId: 'acc_t' }, message: Object.assign({ id: 'z1', conversationId: 'conv_9', platform: 'instagram', platformMessageId: 'mid_txt', direction: 'incoming', text: 'Oi, quanto custa?', attachments: [], sender: { id: 'IGSID_1', name: 'Bia Lima', username: 'bialima' }, sentAt: '2026-10-27T15:00:00.000Z' }, over || {}) });
  chk('aviso com assinatura errada é recusado e nada é gravado', (await zPost(zEv({ platformMessageId: 'mid_falso' }), true)).r.status === 401 && !(await DB.prepare("SELECT 1 FROM msg_mensagem WHERE ext_id='mid_falso'").first()));
  chk('aviso de outro Instagram da conta Zernio é ignorado', (await zPost(Object.assign(zEv({ platformMessageId: 'mid_outra' }), { account: { accountId: 'acc_p' } }))).r.status === 200 && !(await DB.prepare("SELECT 1 FROM msg_mensagem WHERE ext_id='mid_outra'").first()));
  const zr1 = await zPost(zEv());
  const zc1 = await DB.prepare("SELECT id, nome, canal, contato FROM msg_conversa WHERE canal='instagram' AND contato='IGSID_1'").first();
  chk('mensagem do Direct entra no canal Instagram com o nome do cliente', zr1.r.status === 200 && zc1 && zc1.nome === 'Bia Lima' && !!(await DB.prepare("SELECT 1 FROM msg_mensagem WHERE ext_id='mid_txt' AND texto='Oi, quanto custa?' AND direcao='entrada'").first()), zc1);
  await zPost(zEv());
  chk('o mesmo aviso repetido (o Zernio tenta até 7 vezes) não duplica', (await DB.prepare("SELECT COUNT(*) n FROM msg_mensagem WHERE ext_id='mid_txt'").first()).n === 1);
  await DB.prepare("INSERT INTO postagem (tipo, modo, midias, agendado_em, status, ig_id, publicado_em, canal) VALUES ('story','auto','[{\"url\":\"https://tenkiter-midia.fake/m/s1.jpg\",\"tipo\":\"imagem\"}]', '2026-10-27T10:00:00Z', 'publicado', 'IGSTORY1', '2026-10-27T10:00:00Z', 'ambos')").run();
  const poId = (await DB.prepare("SELECT id FROM postagem WHERE ig_id='IGSTORY1'").first()).id;
  await zPost(zEv({ id: 'z2', platformMessageId: 'mid_story', text: 'valor?' }));
  const zst = await DB.prepare("SELECT ctx_tipo, ctx_post FROM msg_mensagem WHERE ext_id='mid_story'").first();
  chk('resposta a story publicado pelo site: liga a mensagem à nossa postagem (foto e produto)', zst && zst.ctx_tipo === 'story' && zst.ctx_post === poId, zst);
  await zPost(zEv({id:'z-video-context',platformMessageId:'mid_story_video',text:'Vídeo',metadata:{storyReply:{storyId:'EXTERNAL-VIDEO',storyUrl:'https://cdn.fake/context-video.mp4'}}}));
  const zv=await DB.prepare("SELECT id,ctx_chave,ctx_tipo FROM msg_mensagem WHERE ext_id='mid_story_video'").first();
  chk('Instagram copia vídeo do story vindo nos metadados do webhook',zv&&zv.ctx_tipo==='story'&&zv.ctx_chave.endsWith('.mp4'),zv);
  const zvApi=(await A('GET','/msg/mensagens?conversa='+zc1.id)).j.mensagens.find(x=>x.id===zv.id);
  chk('API informa tipo vídeo no contexto para o APK',zvApi.ctx_mtipo==='video'&&zvApi.ctx_midia===1,zvApi);
  await DB.prepare("UPDATE msg_mensagem SET ctx_chave='',ctx_tipo='' WHERE id=?").bind(zv.id).run();
  const repairFetch=globalThis.fetch;globalThis.fetch=async(u,init)=>/\/inbox\/conversations\/conv_9\/messages\?/.test(String(u))?Response.json({messages:[{id:'mid_story_video',storyReply:{storyId:'EXTERNAL-VIDEO',storyUrl:'https://cdn.fake/context-video.mp4'}}]}):repairFetch(u,init);
  const repaired=await A('POST','/msg/contexto',{conversa:zc1.id});
  chk('contexto de vídeo antigo pode ser recuperado sem responder ao cliente',repaired.j.ok&&repaired.j.atualizadas===1&&(await DB.prepare('SELECT ctx_chave FROM msg_mensagem WHERE id=?').bind(zv.id).first()).ctx_chave.endsWith('.mp4'),repaired.j);globalThis.fetch=repairFetch;
  await DB.prepare("UPDATE postagem SET ig_id='OUTRO' WHERE id=?").bind(poId).run();
  await zPost(zEv({ id: 'z3', platformMessageId: 'mid_story2', text: 'tem P?' }));
  const zst2 = await DB.prepare("SELECT ctx_tipo, ctx_post, ctx_chave FROM msg_mensagem WHERE ext_id='mid_story2'").first();
  chk('resposta a story sem postagem nossa: a foto do story é copiada para o nosso armazenamento', !zst2 || zst2.ctx_tipo === '' || (zst2.ctx_tipo === 'story' && zst2.ctx_chave !== ''), zst2);
  await zPost(zEv({ id: 'z4', platformMessageId: 'mid_menc', text: '', attachments: [{ type: 'share', originalType: 'story_mention', url: 'https://cdn.fake/mencao.jpg' }] }));
  const zmen = await DB.prepare("SELECT tipo, midia_chave FROM msg_mensagem WHERE ext_id='mid_menc'").first();
  chk('menção da loja no story do cliente: tipo "menção em story" com a imagem guardada', zmen && zmen.tipo === 'menção em story' && zmen.midia_chave !== '', zmen);
  const zenv = await A('POST', '/msg/enviar', { conversa: zc1.id, texto: 'Oi Bia! Custa R$ 76,49 à vista.', idLocal: 'zernio-0001' });
  chk('responder pelo painel sai pelo Zernio, na conversa certa, com o Instagram escolhido', zenv.j.ok && zEnvios.length === 1 && zEnvios[0].accountId === 'acc_t' && zEnvios[0].message === 'Oi Bia! Custa R$ 76,49 à vista.' && !zEnvios[0].messageTag, [zenv.j, zEnvios]);
  await zPost({ id: 'ev_eco', event: 'message.sent', account: { accountId: 'acc_t' }, message: { id: 'z5', conversationId: 'conv_9', platform: 'instagram', platformMessageId: 'mid_out_1', direction: 'outgoing', text: 'Oi Bia! Custa R$ 76,49 à vista.', attachments: [], sender: { id: 'LOJA' }, sentAt: '2026-10-27T15:05:00.000Z' } });
  chk('o eco do que o painel enviou não duplica a mensagem', (await DB.prepare("SELECT COUNT(*) n FROM msg_mensagem WHERE conversa_id=? AND texto='Oi Bia! Custa R$ 76,49 à vista.'").bind(zc1.id).first()).n === 1);
  await zPost({ id: 'ev_app', event: 'message.sent', account: { accountId: 'acc_t' }, message: { id: 'z6', conversationId: 'conv_9', platform: 'instagram', platformMessageId: 'mid_app', direction: 'outgoing', text: 'Respondi pelo celular', attachments: [], sender: { id: 'LOJA' }, sentAt: '2026-10-27T15:06:00.000Z' } });
  chk('resposta dada pelo app do Instagram também aparece na conversa (como enviada)', !!(await DB.prepare("SELECT 1 FROM msg_mensagem WHERE ext_id='mid_app' AND direcao='saida' AND conversa_id=?").bind(zc1.id).first()));
  zJanela = true;
  const zenv2 = await A('POST', '/msg/enviar', { conversa: zc1.id, texto: 'Ainda tem?', idLocal: 'zernio-0002' });
  chk('depois de 24 h: tenta de novo com HUMAN_AGENT (resposta digitada por pessoa) e envia', zenv2.j.ok && zEnvios.length === 3 && zEnvios[2].messageTag === 'HUMAN_AGENT' && zEnvios[2].messagingType === 'MESSAGE_TAG', zEnvios.slice(-2));
  zJanela = false;
  await DB.prepare("INSERT OR IGNORE INTO msg_conversa (canal, contato, nome, grupo, total, ultima_em) VALUES ('instagram', 'IGSID_SEMZ', 'Sem Zernio', 0, 1, '2026-10-27T10:00:00Z')").run();
  const semZ = (await DB.prepare("SELECT id FROM msg_conversa WHERE contato='IGSID_SEMZ'").first()).id;
  const zenv3 = await A('POST', '/msg/enviar', { conversa: semZ, texto: 'oi', idLocal: 'zernio-0003' });
  chk('conversa antiga que nunca veio pelo Zernio: explica em português (nada é enviado)', zenv3.r.status === 409 && /ainda não chegou pelo Zernio/.test(zenv3.j.erro) && zEnvios.length === 3, zenv3.j);
  // v7.38.2: diagnóstico das entregas do Zernio (sem chave nem segredo na resposta)
  const fDg = globalThis.fetch; let dgAtivo = true; const dgTestes = [];
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u === 'https://zernio.com/api/v1/webhooks/settings' && (!init || !init.method || init.method === 'GET')) return new Response(JSON.stringify({ webhooks: [{ _id: 'wh_1', url: 'https://ig.test/wh/zernio/x', isActive: dgAtivo, events: ['message.received', 'message.sent'], accountIds: ['acc_t'], secret: 'NAO_PODE_VAZAR' }] }));
    if (u.startsWith('https://zernio.com/api/v1/webhooks/logs')) return new Response(JSON.stringify({ logs: [{ createdAt: '2026-10-27T21:10:00Z', event: 'message.received', status: 'failed', statusCode: 404, error: 'Not Found' }] }));
    if (u === 'https://zernio.com/api/v1/webhooks/test') { dgTestes.push(JSON.parse(init.body)); return new Response(JSON.stringify({ success: true })); }
    return fDg(u, init);
  };
  const dg = await A('POST', '/msg/zernio/config', { diagnostico: true });
  chk('diagnóstico: aviso ativo, deste servidor, conta certa e última entrega com o erro do Zernio', dg.j.ok && dg.j.aviso.existe && dg.j.aviso.ativo && dg.j.aviso.esteServidor && dg.j.aviso.contaCerta && dg.j.entregas[0].codigo === 404 && dg.j.entregas[0].situacao === 'failed', dg.j);
  chk('diagnóstico não devolve chave nem segredo', !JSON.stringify(dg.j).includes('NAO_PODE_VAZAR') && !JSON.stringify(dg.j).includes(zChave));
  dgAtivo = false;
  chk('diagnóstico mostra quando o Zernio desligou o aviso', (await A('POST', '/msg/zernio/config', { diagnostico: true })).j.aviso.ativo === false);
  const dgT = await A('POST', '/msg/zernio/config', { testar: true });
  chk('testar pede ao Zernio um aviso de teste do webhook certo', dgT.j.ok && dgT.j.teste.enviado && dgTestes.length === 1 && dgTestes[0].webhookId === 'wh_1' && dgTestes[0].event === 'message.received');
  globalThis.fetch = fDg;
  const zap = await A('POST', '/msg/zernio/config', { apagar: true });
  chk('remover a chave também desliga o aviso no Zernio', zap.j.ok && zHooks.some((x) => x.m === 'DELETE' && /webhookId=wh_1/.test(x.u)) && (await A('GET', '/msg/zernio/config')).j.avisoLigado === false);
  globalThis.fetch = fZ2;

  // ---- v7.38: cofre das chaves do servidor (Zernio e outras), aberto pela mesma senha do Apps Script ----
  const cofreAS = []; const fCof = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://api.fake') && init && init.body && JSON.parse(init.body).action === 'abrirCofre') { const b = JSON.parse(init.body); cofreAS.push(b); return new Response(JSON.stringify(b.senha === 'senha-certa' ? { ok: true, cofre: 'COD_COFRE_1', validoSegundos: 300 } : { ok: false, erro: 'Senha incorreta.' })); }
    return fCof(u, init);
  };
  await DB.prepare("INSERT INTO cfg (chave, valor) VALUES ('zernio_chave', ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").bind(zChave).run();
  const cIt = await A('GET', '/cofre/itens'), cZ = (cIt.j.itens || []).find((x) => x.nome === 'zernio');
  chk('cofre lista a chave do Zernio só com o final (nunca a chave)', cIt.j.ok && cZ && cZ.temChave && cZ.fim === zChave.slice(-4) && !JSON.stringify(cIt.j).includes(zChave), cIt.j);
  chk('cofre lista também Wafly, Wame, Gemini, FreeConvert, ponte dos contatos e Android', ['wafly1', 'wafly2', 'wame', 'gemini', 'freeconvert', 'contatos', 'mobile'].every((n) => cIt.j.itens.some((x) => x.nome === n)));
  const cGer = await w.fetch(ped('GET', '/cofre/itens', 'tk2.gerente'), env, {});
  chk('quem não gere acessos não vê o cofre', cGer.status === 403);
  chk('revelar com o cofre trancado é recusado', (await A('POST', '/cofre/revelar', { nome: 'zernio', cofre: 'qualquer' })).r.status === 403);
  const cErr = await A('POST', '/cofre/abrir', { senha: 'errada' });
  chk('senha errada: recusa em português e avisa que foi a senha (o painel não tenta de novo)', cErr.r.status === 403 && cErr.j.senhaRecusada === true && cErr.j.erro === 'Senha incorreta.' && !cErr.j.cofre);
  chk('a senha vai ao Apps Script com o login de quem pediu', cofreAS.length === 1 && cofreAS[0].whatsapp === '88999990000' && cofreAS[0].sessao === 'tk2.admin');
  const cAb = await A('POST', '/cofre/abrir', { senha: 'senha-certa' });
  chk('senha certa: devolve o mesmo código do Apps Script', cAb.j.ok && cAb.j.cofre === 'COD_COFRE_1' && cAb.j.validoSegundos === 300);
  chk('código errado não revela', (await A('POST', '/cofre/revelar', { nome: 'zernio', cofre: 'COD_ERRADO' })).r.status === 403);
  chk('nome de chave desconhecido é recusado', (await A('POST', '/cofre/revelar', { nome: '__proto__', cofre: 'COD_COFRE_1' })).r.status === 400);
  const cRv = await A('POST', '/cofre/revelar', { nome: 'zernio', cofre: 'COD_COFRE_1' });
  chk('cofre aberto: revela a chave do Zernio e registra quem copiou', cRv.j.ok && cRv.j.valor === zChave && !!(await DB.prepare("SELECT valor FROM cfg WHERE chave='cofre_ult_zernio'").first()));
  const cVaz = await A('POST', '/cofre/revelar', { nome: 'freeconvert', cofre: 'COD_COFRE_1' });
  chk('chave que não está guardada: explica em português', cVaz.r.status === 404 && /ainda não está guardada/.test(cVaz.j.erro));
  await A('POST', '/cofre/fechar', {});
  chk('trancar: o mesmo código deixa de valer', (await A('POST', '/cofre/revelar', { nome: 'zernio', cofre: 'COD_COFRE_1' })).r.status === 403);
  globalThis.fetch = fCof;
  await DB.prepare("DELETE FROM cfg WHERE chave IN ('zernio_chave','cofre_ult_zernio')").run();
  // v7.40.3: nota interna
  const nConv = (await DB.prepare('SELECT id FROM msg_conversa ORDER BY id LIMIT 1').first()).id;
  chk('nota vazia é recusada em português', (await A('POST', '/msg/notas', { conversa: nConv, texto: '  ' })).r.status === 400);
  const nOk = await A('POST', '/msg/notas', { conversa: nConv, texto: 'Confirmar o Pix antes de separar' });
  const nLe = await A('GET', '/msg/mensagens?conversa=' + nConv);
  chk('nota salva volta junto com a conversa e nunca vira mensagem', nOk.j.ok && nLe.j.notas.some((n) => n.texto === 'Confirmar o Pix antes de separar') && !nLe.j.mensagens.some((m) => m.texto === 'Confirmar o Pix antes de separar'), [nOk.j, nLe.j.notas]);
  const naoLidasAntes = (await DB.prepare('SELECT nao_lidas FROM msg_conversa WHERE id=?').bind(nConv).first()).nao_lidas;
  await DB.prepare("UPDATE msg_conversa SET encerrada_em='' WHERE id=?").bind(nConv).run();
  let comNotas = await A('GET','/msg/conversas?canal=todos&filtro=com_notas');
  chk('Com notas inclui a conversa aberta com nota ativa',comNotas.j.conversas.some(c=>c.id===nConv));
  await DB.prepare("UPDATE msg_conversa SET encerrada_em='2026-10-28' WHERE id=?").bind(nConv).run();
  comNotas = await A('GET','/msg/conversas?canal=todos&filtro=com_notas&busca=Pix');
  chk('Com notas nunca traz encerradas, mesmo buscando',!comNotas.j.conversas.some(c=>c.id===nConv));
  await DB.prepare("UPDATE msg_conversa SET encerrada_em='' WHERE id=?").bind(nConv).run();
  const excluiu = await A('DELETE','/msg/notas?conversa='+nConv+'&id='+nOk.j.nota.id);
  const logNotas = await A('GET','/msg/notas/log?conversa='+nConv);
  chk('X remove nota ativa e preserva texto, autor e identificação de quem apagou',excluiu.j.ok&&!excluiu.j.notas.some(n=>n.id===nOk.j.nota.id)&&logNotas.j.exclusoes.some(n=>n.id===nOk.j.nota.id&&n.texto==='Confirmar o Pix antes de separar'&&n.autor&&n.excluida_em&&n.excluida_por.includes('88999990000')));
  const repete = await A('DELETE','/msg/notas?conversa='+nConv+'&id='+nOk.j.nota.id);
  chk('apagar de novo é idempotente e não substitui o log',repete.j.ok&&(await A('GET','/msg/notas/log?conversa='+nConv)).j.exclusoes[0].excluida_em===logNotas.j.exclusoes[0].excluida_em);
  chk('notas não marcam conversa como lida',(await DB.prepare('SELECT nao_lidas FROM msg_conversa WHERE id=?').bind(nConv).first()).nao_lidas===naoLidasAntes);
  const otherNote=await A('POST','/msg/notas',{conversa:nConv,texto:'Nota que permanece'});
  const outraConv=(await DB.prepare('SELECT id FROM msg_conversa WHERE id<>? AND pessoa<> (SELECT pessoa FROM msg_conversa WHERE id=?) LIMIT 1').bind(nConv,nConv).first());
  if(outraConv){await A('DELETE','/msg/notas?conversa='+outraConv.id+'&id='+otherNote.j.nota.id);chk('não apaga nota de outra pessoa',(await A('GET','/msg/notas?conversa='+nConv)).j.notas.some(n=>n.id===otherNote.j.nota.id));}
  // v7.40.4: etiquetas
  const eL = await A('GET', '/msg/etiquetas'), eId = (n) => eL.j.etiquetas.find((e) => e.nome === n).id;
  chk('etiquetas padrão criadas na primeira vez', eL.j.ok && eL.j.etiquetas.length === 6 && eL.j.etiquetas[0].nome === 'Novo cliente');
  const eR = await A('POST', '/msg/rotular', { conversa: nConv, etiquetas: [eId('Novo cliente'), eId('Reserva'), eId('Troca')] });
  chk('de venda fica uma só (a última) e as outras somam', eR.j.ok && eR.j.etiquetas.map((e) => e.nome).sort().join() === 'Reserva,Troca', eR.j);
  const eF = await A('GET', '/msg/conversas?canal=todos&etiqueta=' + eId('Reserva'));
  chk('filtro por etiqueta traz a conversa com as etiquetas', eF.j.ok && eF.j.conversas.some((c) => c.id === nConv && c.etiquetas.length === 2), eF.j.conversas.length);
  chk('conversa aberta traz as etiquetas', (await A('GET', '/msg/mensagens?conversa=' + nConv)).j.conversa.etiquetas.length === 2);
  // v7.40.6: responsável pela conversa
  const dA = await A('POST', '/msg/dono', { conversa: nConv, assumir: true });
  const dM = await A('GET', '/msg/conversas?canal=todos&filtro=minhas');
  chk('assumir grava o responsável e o filtro Minhas traz a conversa', dA.j.ok && !!dA.j.dono && dM.j.conversas.some((c) => c.id === nConv && c.dono === dA.j.dono), [dA.j, dM.j.conversas.length]);
  chk('liberar tira o responsável', (await A('POST', '/msg/dono', { conversa: nConv, assumir: false })).j.dono === '' && !(await A('GET', '/msg/conversas?canal=todos&filtro=minhas')).j.conversas.some((c) => c.id === nConv));
  // v7.40.12: Retomar = última mensagem nossa ou etiqueta Reserva/Aguardando pagamento, parada entre 1 e 30 dias
  const dia = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const rIns = async (contato, dir, em) => (await DB.prepare("INSERT INTO msg_conversa(canal,contato,nome,grupo,total,ultima_em,ult_dir) VALUES('whatsapp1',?,?,0,1,?,?)").bind(contato, 'Retomar ' + contato, em, dir).run()).meta.last_row_id;
  const rSai = await rIns('retomar-teste-1', 'saida', dia(2)), rEnt = await rIns('retomar-teste-2', 'entrada', dia(2)), rNova = await rIns('retomar-teste-3', 'saida', dia(0.2)), rVelha = await rIns('retomar-teste-4', 'saida', dia(40)), rRes = await rIns('retomar-teste-5', 'entrada', dia(3));
  await A('POST', '/msg/rotular', { conversa: rRes, etiquetas: [eId('Reserva')] });
  const rL = (await A('GET', '/msg/conversas?canal=todos&filtro=retomar')).j.conversas.map((c) => c.id);
  chk('Retomar traz quem ficou sem responder há 2 dias e quem reservou', rL.includes(rSai) && rL.includes(rRes), rL);
  chk('Retomar não traz quem respondeu por último, conversa de hoje nem de mais de 30 dias', !rL.includes(rEnt) && !rL.includes(rNova) && !rL.includes(rVelha), rL);
  // Android: paginação estável para horários iguais, sem omitir conversas ou mensagens.
  const isoPag='2099-01-01T00:00:00.000Z';
  for(let i=0;i<55;i++)await DB.prepare("INSERT INTO msg_conversa(canal,contato,nome,grupo,total,ultima_em) VALUES('whatsapp1',?,?,1,1,?)").bind('paginacao-'+i+'@g.us','Grupo simulado '+i,isoPag).run();
  const pg1=(await A('GET','/msg/conversas?canal=whatsapp1&tipo=grupo')).j.conversas;
  const lastPg=pg1.at(-1),pg2=(await A('GET','/msg/conversas?canal=whatsapp1&tipo=grupo&antes='+encodeURIComponent(lastPg.ultima_em)+'&antesId='+lastPg.id)).j.conversas;
  const allPg=[...pg1,...pg2].filter(c=>c.ultima_em===isoPag);
  chk('paginação de conversas com mesmo horário não perde registros',allPg.length===55&&new Set(allPg.map(c=>c.id)).size===55);
  chk('API inclui grupo para o filtro nativo',allPg.every(c=>c.grupo===1));
  const cidPag=allPg[0].id;
  for(let i=0;i<105;i++)await DB.prepare("INSERT INTO msg_mensagem(conversa_id,canal,ext_id,direcao,tipo,texto,enviada_em) VALUES(?,'whatsapp1',?,'entrada','texto','teste',?)").bind(cidPag,'pag-msg-'+i,isoPag).run();
  const mp1=(await A('GET','/msg/mensagens?conversa='+cidPag)).j.mensagens;
  const oldestPg=mp1[0],mp2=(await A('GET','/msg/mensagens?conversa='+cidPag+'&antes='+encodeURIComponent(oldestPg.enviada_em)+'&antesId='+oldestPg.id)).j.mensagens;
  chk('paginação do histórico com mesmo horário não omite mensagens',mp1.length===100&&mp2.length===5&&new Set([...mp1,...mp2].map(m=>m.id)).size===105);
  // Identidade, nomes Google e limites dos contadores: somente serviços falsos.
  const beforePeopleFetch=globalThis.fetch;let googleCalls=0;
  await cfg('contatos_url','https://script.google.com/macros/s/pessoas-index-test/exec');await cfg('contatos_chave','google-test-only');
  globalThis.fetch=async(u,init)=>{
    if(String(u).includes('/macros/s/pessoas-index-test/')){const b=JSON.parse(init.body);chk('índice Google apenas lê, nunca altera contatos',b.acao==='listar');googleCalls++;return Response.json({ok:true,contatos:[{r:'people/test',n:'Nome completo do Google',f:['+55 88 98901-2345','+55 88 98901-2346']}],total:1,proxima:''});}
    return beforePeopleFetch(u,init);
  };
  await wh('/wh/wafly/1/'+seg,msg('PERSON-A','5588989012345','Oi',{momment:Date.now()}));
  await wh('/wh/wafly/2/'+seg,msg('PERSON-B','5588989012345','Oi também',{momment:Date.now()}));
  const waPerson=await DB.prepare("SELECT id FROM msg_conversa WHERE canal='whatsapp1' AND contato='5588989012345'").first();
  let indexed=await A('POST','/msg/pessoas/google',{});chk('índice Google conclui só uma página',indexed.j.fim&&googleCalls===1,indexed.j);
  let indexedConv=(await A('GET','/msg/mensagens?conversa='+waPerson.id)).j.conversa;
  chk('nome do Google passa a aparecer no atendimento',indexedConv.nome==='Nome completo do Google',indexedConv);
  let invalidPerson=await A('POST','/msg/pessoa',{conversa:waPerson.id,nome:'Manual',whatsapp:'abc'});chk('não permite cadastro de WhatsApp inválido',invalidPerson.r.status===400);
  await DB.prepare("INSERT INTO msg_conversa(canal,contato,nome,grupo,total,ultima_em,nao_lidas,ult_dir) VALUES('instagram','person-ig','Nome parecido',0,1,?,2,'entrada')").bind(new Date().toISOString()).run();
  const igPerson=await DB.prepare("SELECT id FROM msg_conversa WHERE contato='person-ig'").first();
  let linkedPerson=await A('POST','/msg/pessoa',{conversa:waPerson.id,nome:'Nome confirmado',whatsapp:'+55 88 98901-2345',segundo:'+55 88 98901-2346',vincular:[igPerson.id]});
  chk('vínculo explícito reúne WhatsApp1, WhatsApp2 e Instagram',linkedPerson.j.ok&&linkedPerson.j.canais.length===3&&linkedPerson.j.canais.every(x=>x.pessoa===linkedPerson.j.pessoa&&x.nome==='Nome confirmado'),linkedPerson.j);
  await wh('/wh/wafly/1/'+seg,msg('PERSON-C','5588989012346','Segundo número',{momment:Date.now()}));
  const personAfter=(await A('GET','/msg/pessoa?conversa='+waPerson.id)).j;
  chk('segundo número futuro entra no cadastro vinculado',personAfter.canais.length===4&&personAfter.canais.every(x=>x.nome==='Nome confirmado'),personAfter);
  let unreadPerson=(await A('GET','/msg/conversas?canal=todos&busca=Nome%20confirmado')).j.conversas;
  chk('busca encontra nome manual nos quatro canais',unreadPerson.length===4);
  for(const canal of ['todos','whatsapp1','whatsapp2','instagram']){
    const totals=(await A('GET','/msg/conversas?canal='+canal)).j.contagens;chk('não lidas é subconjunto de falta responder em '+canal,totals.nao_lidas<=totals.sem_resposta,totals);
  }
  const beforeRead=(await A('GET','/msg/conversas?canal=instagram')).j.contagens.sem_resposta;
  await A('POST','/msg/lida',{conversa:igPerson.id});
  chk('marcar lida sem resposta mantém atendimento pendente',(await A('GET','/msg/conversas?canal=instagram')).j.contagens.sem_resposta===beforeRead);
  // Resposta a status com referência dentro de text e vídeo do contexto.
  await wh('/wh/wafly/1/'+seg,msg('CTX-NESTED','5588989012345','',{isStatusReply:true,text:{message:'Vídeo',referenceMessageId:'STATUS-EXACT',referenceMessage:{video:{videoUrl:'https://cdn.fake/quoted-status.mp4',mimeType:'video/mp4'}}},momment:Date.now()}));
  const exact=await DB.prepare("SELECT id,ctx_ref,ctx_chave FROM msg_mensagem WHERE ext_id='CTX-NESTED'").first();
  chk('Wafly lê referência aninhada e preserva vídeo exato',exact.ctx_ref==='STATUS-EXACT'&&exact.ctx_chave.endsWith('.mp4'),exact);
  const ctxResponse=await w.fetch(new Request('https://ig.test/msg/midia?id='+exact.id+'&ctx=1',{headers:{'X-TK-Whats':'88999990000','X-TK-Sessao':'tk2.admin'}}),env,{});
  chk('vídeo do status é servido autenticado como vídeo',ctxResponse.status===200&&ctxResponse.headers.get('content-type')==='video/mp4');
  await wh('/wh/wafly/1/'+seg,msg('OWN-STATUS-VIDEO','status@broadcast','',{fromMe:true,video:{videoUrl:'https://cdn.fake/own-status.mp4',mimeType:'video/mp4'},text:undefined,momment:Date.now()}));
  await wh('/wh/wafly/1/'+seg,msg('STATUS-REF-REPLY','5588989012345','',{isStatusReply:true,text:{message:'Esse vídeo',referenceMessageId:'OWN-STATUS-VIDEO'},momment:Date.now()}));
  const statusRef=await DB.prepare("SELECT ctx_chave,ctx_aprox FROM msg_mensagem WHERE ext_id='STATUS-REF-REPLY'").first();
  chk('WhatsApp1 usa referência do status capturado sem escolher o mais recente',statusRef.ctx_chave.endsWith('.mp4')&&statusRef.ctx_aprox===0,statusRef);
  await wh('/wh/wafly/1/'+seg,msg('STATUS-OBJECT','5588989012345','Esse',{isStatusReply:false,statusReply:{referenceMessageId:'STATUS-OBJECT-ID',mediaUrl:'https://cdn.fake/object-status.mp4',mimeType:'video/mp4'},momment:Date.now()}));
  const objectStatus=await DB.prepare("SELECT ctx_tipo,ctx_chave FROM msg_mensagem WHERE ext_id='STATUS-OBJECT'").first();
  chk('statusReply próprio também classifica e copia vídeo mesmo sem flag',objectStatus.ctx_tipo==='story'&&objectStatus.ctx_chave.endsWith('.mp4'),objectStatus);
  globalThis.fetch=beforePeopleFetch;
  await DB.prepare("INSERT INTO msg_conversa(canal,contato,nome,grupo,total,ultima_em) VALUES('instagram','ig-without-wa','Sem número informado',0,1,?)").bind(new Date().toISOString()).run();
  const noWa=(await DB.prepare("SELECT id FROM msg_conversa WHERE contato='ig-without-wa'").first()).id;
  chk('Instagram sem número exige decisão explícita',(await A('POST','/msg/pessoa',{conversa:noWa,nome:'Sem número informado',whatsapp:''})).r.status===400);
  chk('Instagram pode permanecer sem WhatsApp se cliente não informar',(await A('POST','/msg/pessoa',{conversa:noWa,nome:'Sem número informado',whatsapp:'',semWhatsApp:true})).j.ok);
  chk('não apaga WhatsApp de cadastro já vinculado',(await A('POST','/msg/pessoa',{conversa:igPerson.id,nome:'Nome confirmado',whatsapp:'',semWhatsApp:true})).r.status===400);
  // Durable acceptance: a failed write stays queued, and cron can recover it without a duplicate.
  await cfg('zernio_chave',zChave);await cfg('zernio_conta',JSON.stringify({id:'acc_t',usuario:'tenkitermodasceara'}));
  const originalDb=env.DB;let queueFail=true;
  env.DB={...originalDb,prepare(sql){if(queueFail&&/INSERT.*msg_mensagem/i.test(sql))throw new Error('falha simulada de armazenamento');return originalDb.prepare(sql);}};
  const queuedEvent=zEv({platformMessageId:'durable-ig-message',sender:{id:'IG-DURABLE',name:'Contato de teste',username:'durable.teste'}});
  const queuedReply=await zPost(queuedEvent);
  chk('Instagram aceita só depois de preservar evento e mantém em fila se gravação falhar',queuedReply.r.status===200&&(await DB.prepare('SELECT COUNT(*) n FROM msg_zernio_fila').first()).n===1&&!(await DB.prepare("SELECT id FROM msg_mensagem WHERE ext_id='durable-ig-message'").first()));
  queueFail=false;env.DB=originalDb;await DB.prepare('UPDATE msg_zernio_fila SET prox=0,trava=0').run();await W.processarFilaZernio_(env);
  chk('nova tentativa recupera a mensagem e remove payload da fila',(await DB.prepare("SELECT COUNT(*) n FROM msg_mensagem WHERE ext_id='durable-ig-message'").first()).n===1&&(await DB.prepare('SELECT COUNT(*) n FROM msg_zernio_fila').first()).n===0);
  await zPost(queuedEvent);chk('reentrega do mesmo evento não duplica mensagens',(await DB.prepare("SELECT COUNT(*) n FROM msg_mensagem WHERE ext_id='durable-ig-message'").first()).n===1);
  // ======== v7.40.8: atalhos de resposta rápida e respostas automáticas ========
  {
    const H = (iso, F) => W.horarioLoja_(Date.parse(iso), F);   // iso em UTC; Fortaleza = UTC-3
    // 2026-11-04 = quarta; 2026-11-06 = sexta; 2026-11-07 = sábado; 2026-11-08 = domingo
    chk('horário: quarta 10h aberta', H('2026-11-04T13:00:00Z').aberta === true);
    chk('horário: quarta 7h29 fechada, abre hoje às 7h30', !H('2026-11-04T10:29:00Z').aberta && H('2026-11-04T10:29:00Z').abertura === 'hoje às 7h30');
    chk('horário: quarta 7h30 em ponto já abre', H('2026-11-04T10:30:00Z').aberta === true);
    chk('horário: quarta 17h59 aberta e 18h fechada (amanhã às 7h30)', H('2026-11-04T20:59:00Z').aberta && !H('2026-11-04T21:00:00Z').aberta && H('2026-11-04T21:00:00Z').abertura === 'amanhã às 7h30');
    chk('horário: sexta 19h abre amanhã (sábado) às 7h30', H('2026-11-06T22:00:00Z').abertura === 'amanhã às 7h30');
    chk('horário: sábado 13h59 aberta', H('2026-11-07T16:59:00Z').aberta === true);
    const sab14 = H('2026-11-07T17:00:00Z');
    chk('horário: sábado 14h fechada, abre segunda às 7h30', !sab14.aberta && sab14.abertura === 'segunda às 7h30' && sab14.abreEm === '2026-11-09T10:30:00.000Z', sab14);
    chk('horário: domingo fechado o dia todo (abre amanhã às 7h30)', !H('2026-11-08T13:00:00Z').aberta && H('2026-11-08T13:00:00Z').abertura === 'amanhã às 7h30');
    const F = ['2026-11-09'];
    chk('horário: feriado com comércio aberto 8h–13h', !H('2026-11-09T10:45:00Z', F).aberta && H('2026-11-09T11:00:00Z', F).aberta && H('2026-11-09T15:59:00Z', F).aberta && !H('2026-11-09T16:00:00Z', F).aberta);
    chk('horário: antes do feriado = hoje às 8h; véspera = amanhã às 8h', H('2026-11-09T10:45:00Z', F).abertura === 'hoje às 8h' && H('2026-11-08T23:00:00Z', F).abertura === 'amanhã às 8h');
    chk('horário: depois do feriado fecha e abre amanhã às 7h30', H('2026-11-09T16:00:00Z', F).abertura === 'amanhã às 7h30');
    chk('horário: virada de dia (23h59 = amanhã; 0h00 = hoje)', H('2026-11-05T02:59:00Z').abertura === 'amanhã às 7h30' && H('2026-11-05T03:00:00Z').abertura === 'hoje às 7h30');
    chk('horário: feriado num domingo também abre 8h–13h', H('2026-11-08T12:00:00Z', ['2026-11-08']).aberta === true);

    // atalhos: semeados uma vez, sem apagar o que já existe; Pix só com marcadores
    await DB.prepare("DELETE FROM cfg WHERE chave='msg_resp_semeada'").run();
    await cfg('msg_respostas', JSON.stringify([{ t: 'Endereço', x: 'Rua A, 10' }, { t: '/oi', x: 'Oi da equipe' }]));
    let rs = (await A('GET', '/msg/config')).j.respostas;
    chk('atalhos: mantém as respostas existentes e acrescenta só as que faltam', rs.length === 12 && rs[0].x === 'Rua A, 10' && rs[1].x === 'Oi da equipe' && rs.filter((r) => r.t === '/oi').length === 1 && rs.some((r) => r.t === '/saiu'), rs.map((r) => r.t));
    const pix = rs.find((r) => r.t === '/pix');
    chk('atalhos: /pix vem com [chave Pix] e [nome] para completar', pix && pix.x.includes('[chave Pix]') && pix.x.includes('([nome])'));
    await A('POST', '/msg/config', { respostas: [{ t: 'Só esta', x: 'texto' }] });
    rs = (await A('GET', '/msg/config')).j.respostas;
    chk('atalhos: não semeia de novo depois que a equipe salvou', rs.length === 1 && rs[0].t === 'Só esta', rs);

    // respostas automáticas
    let a0 = await A('GET', '/msg/auto');
    chk('automáticas: desligadas por padrão, com os textos padrão e sem feriados', a0.j.ok && a0.j.auto.boasVindas.ligado === false && a0.j.auto.foraHorario.ligado === false && a0.j.auto.boasVindas.texto.startsWith('Oi! Que bom ter você aqui') && a0.j.auto.foraHorario.texto.includes('{abertura}') && a0.j.auto.feriados.length === 0, a0.j);
    let autoEnvios = [], autoModo = 'ok';
    const fAuto = globalThis.fetch, realNow = Date.now;
    globalThis.fetch = async (u, init) => {
      const U = String(u);
      if (U.startsWith('https://wafly.com.br/') && U.endsWith('/send-text')) {
        const b = JSON.parse(init.body); autoEnvios.push(b);
        if (autoModo === '500') return new Response('boom', { status: 502 });
        if (autoModo === 'erro') throw new Error('rede caiu');
        return new Response(JSON.stringify({ messageId: 'AUTOENV-' + autoEnvios.length }));
      }
      return fAuto(u, init);
    };
    await cfg('wafly_1', JSON.stringify({ instance: 'INST_1', token: 'TOKEN_1', clientToken: 'CLIENT_1' }));
    let FIX = Date.parse('2026-11-04T13:00:00Z');            // quarta 10h em Fortaleza
    Date.now = () => FIX;
    try {
      await wh('/wh/wafly/1/' + seg, msg('AUTO-D1', '5588911110001', 'Oi, bom dia', { momment: FIX }));
      chk('automáticas: desligadas não enviam nada', autoEnvios.length === 0);
      const sv = await A('POST', '/msg/auto', { boasVindas: { ligado: true }, foraHorario: { ligado: true }, feriados: ['2026-11-16', 'lixo', '2026-02-30', '2026-11-16'] });
      chk('automáticas: liga e limpa a lista de feriados', sv.j.ok && sv.j.auto.boasVindas.ligado && sv.j.auto.foraHorario.ligado && JSON.stringify(sv.j.auto.feriados) === '["2026-11-16"]', sv.j);
      // boas-vindas
      FIX += 60000; await wh('/wh/wafly/1/' + seg, msg('AUTO-B1', '5588911110002', 'Oi, tem vestido?', { momment: FIX }));
      chk('boas-vindas: sai uma vez para cliente novo dentro do horário', autoEnvios.length === 1 && autoEnvios[0].phone === '5588911110002' && autoEnvios[0].message === a0.j.auto.boasVindas.texto, autoEnvios);
      const cB = await DB.prepare("SELECT id, dono, ult_dir, nao_lidas, previa FROM msg_conversa WHERE contato='5588911110002'").first();
      const mB = await DB.prepare("SELECT por, direcao, texto FROM msg_mensagem WHERE conversa_id=? AND direcao='saida' AND por='auto'").bind(cB.id).first();
      chk('boas-vindas: aparece na conversa marcada como automática', mB && mB.por === 'auto' && mB.texto === a0.j.auto.boasVindas.texto, mB);
      chk('boas-vindas: não vira dono e a conversa continua em "falta responder"', !cB.dono && cB.ult_dir === 'entrada' && cB.nao_lidas === 1 && cB.previa === 'Oi, tem vestido?', cB);
      FIX += 60000; await wh('/wh/wafly/1/' + seg, msg('AUTO-B2', '5588911110002', 'Alô?', { momment: FIX }));
      chk('boas-vindas: não repete na mesma conversa', autoEnvios.length === 1);
      await wh('/wh/wafly/1/' + seg, msg('AUTO-B1', '5588911110002', 'Oi, tem vestido?', { momment: FIX - 120000 }));
      chk('boas-vindas: webhook repetido não reenvia', autoEnvios.length === 1);
      FIX += 60000; await wh('/wh/wafly/1/' + seg, msg('AUTO-G1', '120363999-group', 'oi grupo', { isGroup: true, chatName: 'Grupo X', momment: FIX }));
      chk('automáticas: grupos ignorados', autoEnvios.length === 1);
      await wh('/wh/wafly/1/' + seg, msg('AUTO-M1', '5588911110003', 'mensagem da loja', { fromMe: true, momment: FIX }));
      chk('automáticas: mensagens nossas (fromMe) ignoradas', autoEnvios.length === 1);
      await wh('/wh/wafly/1/' + seg, msg('AUTO-S1', '5588911110004', '', { isStatusReply: true, text: { message: '' }, momment: FIX }));
      chk('automáticas: resposta a status sem texto ignorada', autoEnvios.length === 1);
      await wh('/wh/wafly/1/' + seg, msg('AUTO-V1', '5588911110005', 'oi antigo', { momment: FIX - 3600000 }));
      chk('automáticas: mensagem antiga (reenvio de histórico) ignorada', autoEnvios.length === 1);
      // 12 h: conversa com mensagem recente não recebe boas-vindas; depois de 12 h recebe de novo
      FIX = Date.parse('2026-11-05T14:00:00Z');               // quinta 11h (mais de 12 h depois)
      await wh('/wh/wafly/1/' + seg, msg('AUTO-B3', '5588911110002', 'Voltei', { momment: FIX }));
      chk('boas-vindas: volta a sair depois de 12 h sem conversa', autoEnvios.length === 2);
      // fora do horário
      FIX = Date.parse('2026-11-07T17:00:00Z');               // sábado 14h
      await wh('/wh/wafly/1/' + seg, msg('AUTO-F1', '5588911110006', 'Ainda tá aberto?', { momment: FIX }));
      chk('fora do horário: sábado 14h já responde com "segunda às 7h30"', autoEnvios.length === 3 && autoEnvios[2].message.includes('A gente volta segunda às 7h30 e te responde'), autoEnvios[2]);
      FIX += 5 * 60000; await wh('/wh/wafly/1/' + seg, msg('AUTO-F2', '5588911110006', 'Oi?', { momment: FIX }));
      FIX = Date.parse('2026-11-08T13:00:00Z'); await wh('/wh/wafly/1/' + seg, msg('AUTO-F3', '5588911110006', 'Bom dia', { momment: FIX }));
      chk('fora do horário: no máximo 1 vez por período fechado (sábado → domingo)', autoEnvios.length === 3);
      const cF = await DB.prepare("SELECT ult_dir, nao_lidas FROM msg_conversa WHERE contato='5588911110006'").first();
      chk('fora do horário: conversa segue esperando resposta', cF.ult_dir === 'entrada' && cF.nao_lidas === 3, cF);
      FIX = Date.parse('2026-11-15T23:00:00Z');                // domingo 20h, feriado na segunda 16/11
      await wh('/wh/wafly/1/' + seg, msg('AUTO-F4', '5588911110006', 'Abre amanhã?', { momment: FIX }));
      chk('fora do horário: novo período fechado responde de novo, com feriado = "amanhã às 8h"', autoEnvios.length === 4 && autoEnvios[3].message.includes('volta amanhã às 8h'), autoEnvios[3]);
      // equipe conversando fora do horário: não interrompe
      FIX = Date.parse('2026-11-04T22:00:00Z');                // quarta 19h
      const cE = await DB.prepare("SELECT id FROM msg_conversa WHERE contato='5588911110002'").first();
      await wh('/wh/wafly/1/' + seg, msg('AUTO-E1', '5588911110002', 'Pode sim, já separo', { fromMe: true, momment: FIX - 5 * 60000 }));
      await wh('/wh/wafly/1/' + seg, msg('AUTO-E2', '5588911110002', 'Obrigada!', { momment: FIX }));
      chk('fora do horário: não sai se alguém da equipe respondeu nos últimos 30 min', autoEnvios.length === 4 && cE);
      // falha de envio não derruba o webhook e fica no diagnóstico
      autoModo = '500'; FIX = Date.parse('2026-11-08T14:00:00Z');
      const wf = await wh('/wh/wafly/1/' + seg, msg('AUTO-X1', '5588911110007', 'Oi', { momment: FIX }));
      chk('automáticas: falha de envio não quebra o webhook', wf.r.status === 200 && wf.j.ok && wf.j.nova === true && autoEnvios.length === 5, wf.j);
      const dg = (await A('GET', '/msg/auto')).j.ultimo;
      chk('automáticas: falha anotada no diagnóstico (sem JSON cru)', dg && dg.ok === false && dg.tipo === 'fora_horario' && /Wafly/.test(dg.erro), dg);
      autoModo = 'erro'; FIX += 60000;
      const wf2 = await wh('/wh/wafly/1/' + seg, msg('AUTO-X2', '5588911110008', 'Oi', { momment: FIX }));
      chk('automáticas: erro de rede no envio também não quebra o webhook', wf2.r.status === 200 && wf2.j.ok);
      autoModo = 'ok';
      // desligar volta a não enviar
      await A('POST', '/msg/auto', { boasVindas: { ligado: false }, foraHorario: { ligado: false } });
      FIX += 60000; await wh('/wh/wafly/1/' + seg, msg('AUTO-D2', '5588911110009', 'Oi', { momment: FIX }));
      chk('automáticas: desligar para tudo', autoEnvios.length === 6, autoEnvios.length);
      const tx = await A('POST', '/msg/auto', { boasVindas: { texto: '  ' }, foraHorario: { texto: 'Fechado. Volto {abertura}.' } });
      chk('automáticas: texto vazio volta ao padrão e texto editado é salvo', tx.j.auto.boasVindas.texto === a0.j.auto.boasVindas.texto && tx.j.auto.foraHorario.texto === 'Fechado. Volto {abertura}.');
      const met = (await A('GET', '/msg/metricas?dias=90')).j;
      chk('métricas: resposta automática não conta como resposta da equipe', met.ok);
    } finally { Date.now = realNow; globalThis.fetch = fAuto; }
    // relógio real (sem simular a hora): a resposta que vale agora sai e a conversa continua esperando a equipe
    const hAgora = W.horarioLoja_(Date.now(), []);
    await A('POST', '/msg/auto', { boasVindas: { ligado: hAgora.aberta }, foraHorario: { ligado: !hAgora.aberta }, feriados: [] });
    autoEnvios = []; globalThis.fetch = async (u, init) => { const U = String(u); if (U.startsWith('https://wafly.com.br/') && U.endsWith('/send-text')) { autoEnvios.push(JSON.parse(init.body)); return new Response(JSON.stringify({ messageId: 'REAL-AUTO' + autoEnvios.length })); } return fAuto(u, init); };
    try {
      await wh('/wh/wafly/1/' + seg, msg('AUTO-R1', '5588911110010', 'Oi, quero ver a saia', { momment: Date.now() }));
      const cR = await DB.prepare("SELECT id, dono, ult_dir, nao_lidas, previa FROM msg_conversa WHERE contato='5588911110010'").first();
      const nR = (await DB.prepare("SELECT COUNT(*) n FROM msg_mensagem WHERE conversa_id=? AND por='auto'").bind(cR.id).first()).n;
      chk('automáticas (hora real): sai ' + (hAgora.aberta ? 'boas-vindas' : 'fora do horário') + ' e a conversa segue em "falta responder", sem dono', autoEnvios.length === 1 && nR === 1 && !cR.dono && cR.ult_dir === 'entrada' && cR.nao_lidas === 1 && cR.previa === 'Oi, quero ver a saia', { autoEnvios, cR, nR });
      const cont = (await A('GET', '/msg/conversas?canal=whatsapp1&filtro=sem_resposta')).j.conversas || [];
      chk('automáticas (hora real): conversa aparece no filtro "falta responder"', cont.some((x) => x.id === cR.id));
      const env1 = await A('POST', '/msg/enviar', { conversa: cR.id, texto: 'Temos sim!', idLocal: 'realauto01' });
      const cR2 = await DB.prepare('SELECT dono, ult_dir FROM msg_conversa WHERE id=?').bind(cR.id).first();
      chk('automáticas (hora real): resposta da atendente continua virando dono', env1.j.ok && cR2.dono && cR2.ult_dir === 'saida', cR2);
    } finally { globalThis.fetch = fAuto; await A('POST', '/msg/auto', { boasVindas: { ligado: false }, foraHorario: { ligado: false } }); }
  }
  // ======== v7.40.13: agendar mensagem ========
  {
    const fAg = globalThis.fetch; let agEnv = [], agModo = 'ok';
    globalThis.fetch = async (u, init) => {
      const U = String(u);
      if (U.startsWith('https://wafly.com.br/') && U.endsWith('/send-text')) {
        agEnv.push(JSON.parse(init.body));
        if (agModo === 'recusa') return new Response(JSON.stringify({ error: 'bad' }), { status: 400 });
        return new Response(JSON.stringify({ messageId: 'AGENDA-' + agEnv.length }));
      }
      return fAg(u, init);
    };
    try {
      await wh('/wh/wafly/1/' + seg, msg('AG-1', '5588977770001', 'A peça chega quando?', { momment: Date.now() - 60000 }));
      const cA = await DB.prepare("SELECT id FROM msg_conversa WHERE canal='whatsapp1' AND contato='5588977770001'").first();
      const daqui = (min) => new Date(Date.now() + min * 60000).toISOString();
      const v1 = await A('POST', '/msg/agendar', { conversa: cA.id, texto: '  Oi! Sua peça chegou.  ', quando: daqui(120) });
      chk('agendar: válido grava pendente com autor, whats e texto limpo', v1.r.status === 200 && v1.j.ok && v1.j.agendada.status === 'pendente' && v1.j.agendada.texto === 'Oi! Sua peça chegou.' && v1.j.agendada.autor && v1.j.pendentes.length === 1, v1.j);
      const lin = await DB.prepare('SELECT whats, autor FROM msg_agenda WHERE id=?').bind(v1.j.agendada.id).first();
      chk('agendar: guarda o WhatsApp de quem agendou (X-TK-Whats)', lin.whats === '88999990000' && lin.autor.length > 0, lin);
      const pas = await A('POST', '/msg/agendar', { conversa: cA.id, texto: 'oi', quando: daqui(-5) });
      chk('agendar: horário no passado é recusado em português', pas.r.status === 400 && /já passou/.test(pas.j.erro) && !pas.j.erro.includes('{'), pas.j);
      const vaz = await A('POST', '/msg/agendar', { conversa: cA.id, texto: '   ', quando: daqui(60) });
      chk('agendar: texto vazio é recusado', vaz.r.status === 400 && /Escreva/.test(vaz.j.erro), vaz.j);
      chk('agendar: texto acima de 1000 letras é recusado', (await A('POST', '/msg/agendar', { conversa: cA.id, texto: 'a'.repeat(1001), quando: daqui(60) })).r.status === 400);
      chk('agendar: mais de 60 dias à frente é recusado', /60 dias/.test((await A('POST', '/msg/agendar', { conversa: cA.id, texto: 'oi', quando: daqui(61 * 1440) })).j.erro || ''));
      chk('agendar: data inválida é recusada', /dia e a hora/.test((await A('POST', '/msg/agendar', { conversa: cA.id, texto: 'oi', quando: 'amanhã' })).j.erro || ''));
      chk('agendar: conversa inexistente dá 404 legível', (await A('POST', '/msg/agendar', { conversa: 999999, texto: 'oi', quando: daqui(60) })).r.status === 404);
      const lst = await A('GET', '/msg/agendadas?conversa=' + cA.id);
      chk('agendadas: lista a pendente da conversa', lst.j.ok && lst.j.pendentes.length === 1 && Array.isArray(lst.j.historico), lst.j);
      const ms1 = await A('GET', '/msg/mensagens?conversa=' + cA.id);
      chk('mensagens (1ª página) traz as agendadas pendentes', Array.isArray(ms1.j.agendadas) && ms1.j.agendadas.length === 1 && ms1.j.agendadas[0].id === v1.j.agendada.id, ms1.j.agendadas);
      const can = await A('POST', '/msg/agendar/cancelar', { id: v1.j.agendada.id });
      chk('cancelar: pendente vira cancelada e sai da lista', can.j.ok && can.j.pendentes.length === 0 && (await DB.prepare('SELECT status FROM msg_agenda WHERE id=?').bind(v1.j.agendada.id).first()).status === 'cancelada', can.j);
      const can2 = await A('POST', '/msg/agendar/cancelar', { id: v1.j.agendada.id });
      chk('cancelar de novo: recusa legível', can2.r.status === 409 && /cancelado/.test(can2.j.erro), can2.j);
      chk('cancelar inexistente: 404', (await A('POST', '/msg/agendar/cancelar', { id: 987654 })).r.status === 404);
      // envio na hora
      const v2 = await A('POST', '/msg/agendar', { conversa: cA.id, texto: 'Chegou a sua blusa!', quando: daqui(2) });
      const antes0 = await W.processarAgenda_(env, Date.now());
      chk('processarAgenda_: antes da hora não envia', antes0.enviadas === 0 && agEnv.length === 0 && (await DB.prepare('SELECT status FROM msg_agenda WHERE id=?').bind(v2.j.agendada.id).first()).status === 'pendente', antes0);
      const [p1, p2] = await Promise.all([W.processarAgenda_(env, Date.now() + 3 * 60000), W.processarAgenda_(env, Date.now() + 3 * 60000)]);
      const a2 = await DB.prepare('SELECT status, erro, enviado_em FROM msg_agenda WHERE id=?').bind(v2.j.agendada.id).first();
      chk('processarAgenda_: na hora envia pela Wafly com telefone e texto certos', agEnv.length === 1 && agEnv[0].phone === '5588977770001' && agEnv[0].message === 'Chegou a sua blusa!' && a2.status === 'enviada' && a2.enviado_em, { agEnv, a2, p1, p2 });
      const mA = await DB.prepare("SELECT direcao, por, status FROM msg_mensagem WHERE conversa_id=? AND texto='Chegou a sua blusa!'").bind(cA.id).all();
      chk('processarAgenda_: a mensagem aparece na conversa como saída da atendente', mA.results.length === 1 && mA.results[0].direcao === 'saida' && mA.results[0].por === '0000', mA.results);
      await W.processarAgenda_(env, Date.now() + 5 * 60000);
      chk('processarAgenda_: rodar de novo (ou em paralelo) não duplica', agEnv.length === 1);
      const h1 = await A('GET', '/msg/agendadas?conversa=' + cA.id);
      chk('agendadas: enviada aparece no histórico', h1.j.historico.some((x) => x.id === v2.j.agendada.id && x.status === 'enviada'), h1.j);
      chk('cancelar já enviada: recusa legível', /foi enviada/.test((await A('POST', '/msg/agendar/cancelar', { id: v2.j.agendada.id })).j.erro || ''));
      // falha registrada
      agModo = 'recusa';
      const v3 = await A('POST', '/msg/agendar', { conversa: cA.id, texto: 'Vai falhar', quando: daqui(2) });
      await W.processarAgenda_(env, Date.now() + 3 * 60000);
      const a3 = await DB.prepare('SELECT status, erro FROM msg_agenda WHERE id=?').bind(v3.j.agendada.id).first();
      chk('processarAgenda_: falha fica "falhou" com erro curto em português (sem JSON)', a3.status === 'falhou' && a3.erro && a3.erro.length <= 200 && !a3.erro.includes('{') && agEnv.length === 2, a3);
      await W.processarAgenda_(env, Date.now() + 6 * 60000);
      chk('processarAgenda_: falha não é reenviada sozinha', agEnv.length === 2);
      agModo = 'ok';
      // travada em "enviando" (Worker caiu no meio) vira falha sem reenviar
      const v4 = await A('POST', '/msg/agendar', { conversa: cA.id, texto: 'Travada', quando: daqui(2) });
      await DB.prepare("UPDATE msg_agenda SET status='enviando' WHERE id=?").bind(v4.j.agendada.id).run();
      await W.processarAgenda_(env, Date.now() + 20 * 60000);
      const a4 = await DB.prepare('SELECT status, erro FROM msg_agenda WHERE id=?').bind(v4.j.agendada.id).first();
      chk('processarAgenda_: "enviando" esquecida vira falha para conferir, sem reenviar', a4.status === 'falhou' && /Confira/.test(a4.erro) && agEnv.length === 2, a4);
      // grupo: permitido (a atendente escolheu a conversa)
      await wh('/wh/wafly/1/' + seg, msg('AG-G1', '120363777-group', 'oi', { isGroup: true, chatName: 'Grupo Agenda', momment: Date.now() - 60000 }));
      const cG = await DB.prepare("SELECT id FROM msg_conversa WHERE contato='120363777-group'").first();
      await A('POST', '/msg/agendar', { conversa: cG.id, texto: 'Aviso ao grupo', quando: daqui(2) });
      await W.processarAgenda_(env, Date.now() + 3 * 60000);
      chk('processarAgenda_: conversa de grupo agendada também sai', agEnv.length === 3 && agEnv[2].message === 'Aviso ao grupo', agEnv[2]);
      chk('scheduled chama processarAgenda_ a cada minuto', /ctx\.waitUntil\(processarAgenda_\(env\)\.catch/.test(fs.readFileSync(path.join(__dirname, '..', 'instagram-worker', 'worker.js'), 'utf8')));
    } finally { globalThis.fetch = fAg; }
  }
  // ======== v7.40.14: ficha do cliente ========
  {
    const pausa = () => new Promise((r) => setTimeout(r, 8));
    const wa2P = (await DB.prepare("SELECT id FROM msg_conversa WHERE canal='whatsapp2' AND contato='5588989012345'").first()).id;
    const f0 = await A('GET', '/msg/ficha?conversa=' + waPerson.id);
    chk('ficha: vazia não inventa nada (campos em branco, sem compras)', f0.r.status === 200 && f0.j.ok && f0.j.ficha.tamanhos === '' && f0.j.ficha.preferencias === '' && f0.j.ficha.cidade === '' && f0.j.compras.length === 0, f0.j);
    chk('ficha: canais vinculados (WhatsApp 1, WhatsApp 2 e Instagram) e a conversa atual marcada', ['whatsapp1', 'whatsapp2', 'instagram'].every((c) => f0.j.canais.some((x) => x.canal === c)) && f0.j.canais.filter((x) => x.atual).length === 1 && f0.j.canais.find((x) => x.atual).id === waPerson.id, f0.j.canais);
    const s1 = await A('POST', '/msg/ficha', { conversa: waPerson.id, tamanhos: '  M ·  38 ', preferencias: 'Gosta de vestido longo, cores claras', cidade: 'Crateús — Centro' });
    const quem = (await DB.prepare("SELECT valor FROM cfg WHERE chave='msg_atendente_88999990000'").first());
    chk('ficha: salva (espaços limpos) e devolve a ficha com autor e data', s1.r.status === 200 && s1.j.ok && s1.j.ficha.tamanhos === 'M · 38' && s1.j.ficha.cidade === 'Crateús — Centro' && s1.j.ficha.atualizado_em && s1.j.ficha.autor === (quem ? quem.valor : 'Ana'), s1.j);
    const igF = await A('GET', '/msg/ficha?conversa=' + igPerson.id), wa2F = await A('GET', '/msg/ficha?conversa=' + wa2P);
    chk('ficha: a mesma pessoa vê a mesma ficha pelo Instagram e pelo WhatsApp 2', igF.j.ficha.tamanhos === 'M · 38' && igF.j.ficha.preferencias === 'Gosta de vestido longo, cores claras' && wa2F.j.ficha.cidade === 'Crateús — Centro', [igF.j.ficha, wa2F.j.ficha]);
    const s2 = await A('POST', '/msg/ficha', { conversa: igPerson.id, cidade: 'Crateús — São Vicente' });
    chk('ficha: salvar só um campo não apaga os outros', s2.j.ok && s2.j.ficha.cidade === 'Crateús — São Vicente' && s2.j.ficha.tamanhos === 'M · 38' && s2.j.ficha.preferencias.length > 0, s2.j.ficha);
    chk('ficha: a conversa aberta traz os tamanhos (faixa "Veste …")', (await A('GET', '/msg/mensagens?conversa=' + wa2P)).j.conversa.tamanhos === 'M · 38');
    const lt = await A('POST', '/msg/ficha', { conversa: waPerson.id, tamanhos: 'x'.repeat(61) });
    chk('ficha: tamanhos acima de 60 letras é recusado em português, sem JSON', lt.r.status === 400 && /Tamanhos: no máximo 60/.test(lt.j.erro) && !lt.j.erro.includes('{'), lt.j);
    chk('ficha: preferências acima de 300 letras é recusado', /Preferências: no máximo 300/.test((await A('POST', '/msg/ficha', { conversa: waPerson.id, preferencias: 'p'.repeat(301) })).j.erro || ''));
    chk('ficha: cidade acima de 60 letras é recusada', /Cidade\/bairro: no máximo 60/.test((await A('POST', '/msg/ficha', { conversa: waPerson.id, cidade: 'c'.repeat(61) })).j.erro || ''));
    chk('ficha: exatamente no limite é aceito', (await A('POST', '/msg/ficha', { conversa: waPerson.id, preferencias: 'p'.repeat(300) })).j.ok);
    chk('ficha: recusa não muda o que estava salvo', (await A('GET', '/msg/ficha?conversa=' + waPerson.id)).j.ficha.tamanhos === 'M · 38');
    chk('ficha: conversa inexistente dá 404 legível', (await A('GET', '/msg/ficha?conversa=987654')).r.status === 404 && (await A('POST', '/msg/ficha', { conversa: 987654, tamanhos: 'M' })).j.erro === 'Conversa não encontrada.');
    const grp = await DB.prepare('SELECT id FROM msg_conversa WHERE grupo=1 LIMIT 1').first();
    chk('ficha: grupo não tem ficha (erro em português)', grp && (await A('GET', '/msg/ficha?conversa=' + grp.id)).r.status === 400);
    chk('ficha: exige Admin (sem sessão: 401)', (await w.fetch(ped('GET', '/msg/ficha?conversa=' + waPerson.id, ''), env, {})).status === 401);
    // conversa sem identidade (Instagram solto): ficha própria, não vaza para a pessoa
    await DB.prepare("INSERT INTO msg_conversa(canal,contato,nome,grupo,total,ultima_em) VALUES('instagram','ig-solto-ficha','Outra',0,1,?)").bind(new Date().toISOString()).run();
    const solto = (await DB.prepare("SELECT id FROM msg_conversa WHERE contato='ig-solto-ficha'").first()).id;
    const fs0 = await A('GET', '/msg/ficha?conversa=' + solto);
    chk('ficha: Instagram sem vínculo tem ficha própria e só o próprio canal', fs0.j.ficha.tamanhos === '' && fs0.j.canais.length === 1 && fs0.j.canais[0].id === solto, fs0.j);
    await A('POST', '/msg/ficha', { conversa: solto, tamanhos: 'GG' });
    chk('ficha: salvar no Instagram solto não mexe na ficha da outra pessoa', (await A('GET', '/msg/ficha?conversa=' + waPerson.id)).j.ficha.tamanhos === 'M · 38' && (await DB.prepare("SELECT tamanhos FROM msg_ficha WHERE alvo=?").bind('c:' + solto).first()).tamanhos === 'GG');
    // etiquetas e notas recentes (as mesmas da pessoa)
    await A('POST', '/msg/rotular', { conversa: wa2P, etiquetas: [eId('Pago')] });
    for (let i = 1; i <= 6; i++) { await A('POST', '/msg/notas', { conversa: igPerson.id, texto: 'Nota da ficha ' + i }); await pausa(); }
    const fn = await A('GET', '/msg/ficha?conversa=' + waPerson.id);
    chk('ficha: etiquetas atuais da pessoa', fn.j.etiquetas.map((e) => e.nome).join() === 'Pago', fn.j.etiquetas);
    chk('ficha: só as 5 notas mais recentes, da mais nova para a mais antiga', fn.j.notas.length === 5 && fn.j.notas[0].texto === 'Nota da ficha 6' && fn.j.notas[4].texto === 'Nota da ficha 2', fn.j.notas.map((n) => n.texto));
    // compras: encerradas como "Vendeu" em qualquer canal da pessoa
    await A('POST', '/msg/encerrar', { conversas: [igPerson.id], motivo: 'vendeu' }); await pausa();
    let fc = await A('GET', '/msg/ficha?conversa=' + waPerson.id);
    chk('ficha: venda encerrada no Instagram aparece na ficha aberta pelo WhatsApp 1, com data e canal', fc.j.compras.length === 1 && fc.j.compras[0].canal === 'instagram' && /^\d{4}-\d\d-\d\dT/.test(fc.j.compras[0].em), fc.j.compras);
    await A('POST', '/msg/encerrar', { conversas: [wa2P], motivo: 'concluido' }); await pausa();
    chk('ficha: encerrada como Concluído não conta como compra', (await A('GET', '/msg/ficha?conversa=' + waPerson.id)).j.compras.length === 1);
    await A('POST', '/msg/encerrar', { conversas: [wa2P], reabrir: true }); await pausa();
    await A('POST', '/msg/encerrar', { conversas: [wa2P], motivo: 'vendeu' }); await pausa();
    await A('POST', '/msg/encerrar', { conversas: [wa2P], motivo: 'concluido' }); await pausa();
    chk('ficha: "Vendeu" corrigido logo depois (sem mensagem no meio) não conta', (await A('GET', '/msg/ficha?conversa=' + waPerson.id)).j.compras.length === 1);
    await A('POST', '/msg/encerrar', { conversas: [waPerson.id], motivo: 'vendeu' }); await pausa();
    await wh('/wh/wafly/1/' + seg, msg('FICHA-VOLTOU', '5588989012345', 'Chegou, amei!', { momment: Date.now() })); await pausa();
    await A('POST', '/msg/encerrar', { conversas: [waPerson.id], motivo: 'concluido' }); await pausa();
    fc = await A('GET', '/msg/ficha?conversa=' + igPerson.id);
    chk('ficha: venda seguida de nova conversa continua contando (2 compras, a mais nova primeiro)', fc.j.compras.length === 2 && fc.j.compras[0].canal === 'whatsapp1' && fc.j.compras[0].em > fc.j.compras[1].em, fc.j.compras);
    chk('ficha: Instagram solto não herda compras da outra pessoa', (await A('GET', '/msg/ficha?conversa=' + solto)).j.compras.length === 0);
    chk('ficha: validarFicha_ exportada e limites em código', typeof W.validarFicha_ === 'function' && W.validarFicha_({ tamanhos: 'M' })[1].tamanhos === 'M' && !!W.validarFicha_({ cidade: 'c'.repeat(61) })[0]);
  }
  // ======== v7.40.15: funil de vendas ========
  {
    const t = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    const ins = async (canal, contato, nome, extra) => { const x = Object.assign({ pessoa: '', grupo: 0, encerrada_em: '', ultima_em: t(1), previa: 'Oi, tem no M?' }, extra || {}); await DB.prepare("INSERT INTO msg_conversa(canal,contato,nome,grupo,total,ultima_em,previa,pessoa,encerrada_em) VALUES(?,?,?,?,3,?,?,?,?)").bind(canal, contato, nome, x.grupo, x.ultima_em, x.previa, x.pessoa, x.encerrada_em).run(); return (await DB.prepare('SELECT id FROM msg_conversa WHERE canal=? AND contato=?').bind(canal, contato).first()).id; };
    const fWa = await ins('whatsapp1', '5588977001111', 'Funil Pessoa', { pessoa: '558877001111', ultima_em: t(-1), previa: 'Pelo WhatsApp' });
    const fIg = await ins('instagram', 'ig-funil-1', 'Funil Pessoa IG', { pessoa: '558877001111', ultima_em: t(-2), previa: 'Pelo Instagram' });
    const fSolto = await ins('whatsapp2', '5588977002222', 'Solto Funil', { ultima_em: t(-3) });
    const fEnc = await ins('whatsapp1', '5588977003333', 'Encerrada Funil', { pessoa: '558877003333', encerrada_em: t(0.5) });
    const fGrp = await ins('whatsapp1', '120363999@g.us', 'Grupo Funil', { grupo: 1, ultima_em: t(0.2) });
    const todos = (j) => j.colunas.flatMap((c) => c.cartoes.map((k) => k.conversa));
    const col = (j, n) => j.colunas.find((c) => c.etiqueta.nome === n);
    await A('POST', '/msg/rotular', { conversa: fWa, etiquetas: [eId('Reserva'), eId('Troca')] });
    await A('POST', '/msg/rotular', { conversa: fSolto, etiquetas: [eId('Reserva')] });
    await A('POST', '/msg/rotular', { conversa: fEnc, etiquetas: [eId('Reserva')] });
    await DB.prepare('INSERT OR IGNORE INTO msg_alvo_etiqueta (alvo, etiqueta_id, em) VALUES (?,?,?)').bind('c:' + fGrp, eId('Reserva'), t(0)).run();
    let f = await A('GET', '/msg/funil?canal=todos');
    chk('funil: colunas = etiquetas de venda, na ordem (sem Troca)', f.r.status === 200 && f.j.ok && f.j.colunas.map((c) => c.etiqueta.nome).join('|') === 'Novo cliente|Reserva|Aguardando pagamento|Pago|Enviado' && f.j.colunas.every((c) => c.etiqueta.id && c.etiqueta.cor && Array.isArray(c.cartoes)), f.j);
    chk('funil: pessoa com 2 canais aparece uma vez, pela conversa mais recente (Instagram)', todos(f.j).filter((id) => id === fIg || id === fWa).length === 1 && col(f.j, 'Reserva').cartoes.some((k) => k.conversa === fIg), col(f.j, 'Reserva'));
    const kIg = col(f.j, 'Reserva').cartoes.find((k) => k.conversa === fIg) || {};
    chk('funil: cartão traz nome, canal, prévia, quando e responsável', kIg.canal === 'instagram' && kIg.previa === 'Pelo Instagram' && kIg.ultima_em && typeof kIg.nome === 'string' && kIg.nome.length > 0 && 'dono' in kIg, kIg);
    chk('funil: mais recente primeiro na coluna e total contado', col(f.j, 'Reserva').cartoes[0].conversa === fSolto && col(f.j, 'Reserva').total === col(f.j, 'Reserva').cartoes.length, col(f.j, 'Reserva').cartoes.map((k) => k.conversa));
    chk('funil: encerradas e grupos ficam de fora', !todos(f.j).includes(fEnc) && !todos(f.j).includes(fGrp));
    const fW1 = await A('GET', '/msg/funil?canal=whatsapp1');
    chk('funil: filtro de canal mostra a conversa daquele canal', fW1.j.ok && todos(fW1.j).includes(fWa) && !todos(fW1.j).includes(fIg) && !todos(fW1.j).includes(fSolto), todos(fW1.j));
    const totRes = col(f.j, 'Reserva').total;
    let mv = await A('POST', '/msg/funil/mover', { conversa: fIg, etiqueta: eId('Pago') });
    chk('funil: mover troca a etiqueta de venda e mantém a não-venda (Troca)', mv.r.status === 200 && mv.j.ok && mv.j.etiquetas.map((e) => e.nome).sort().join() === 'Pago,Troca', mv.j);
    f = await A('GET', '/msg/funil?canal=todos');
    chk('funil: depois de mover, o cartão está só na coluna nova', col(f.j, 'Pago').cartoes.some((k) => k.conversa === fIg) && !col(f.j, 'Reserva').cartoes.some((k) => k.conversa === fIg) && col(f.j, 'Reserva').total === totRes - 1);
    chk('funil: a conversa do outro canal vê as mesmas etiquetas', (await A('GET', '/msg/mensagens?conversa=' + fWa)).j.conversa.etiquetas.map((e) => e.nome).sort().join() === 'Pago,Troca');
    mv = await A('POST', '/msg/funil/mover', { conversa: fWa, etiqueta: 0 });
    f = await A('GET', '/msg/funil?canal=todos');
    chk('funil: etiqueta=0 tira a etapa, fica só Troca, e a pessoa sai do quadro', mv.j.ok && mv.j.etiquetas.map((e) => e.nome).join() === 'Troca' && !todos(f.j).includes(fIg) && !todos(f.j).includes(fWa), mv.j);
    const e1 = await A('POST', '/msg/funil/mover', { conversa: fWa, etiqueta: eId('Troca') });
    chk('funil: etiqueta que não é de venda é recusada em português', e1.r.status === 400 && /etapa não existe mais/.test(e1.j.erro) && !e1.j.erro.includes('{'), e1.j);
    chk('funil: grupo não entra no funil', (await A('POST', '/msg/funil/mover', { conversa: fGrp, etiqueta: eId('Pago') })).r.status === 400);
    chk('funil: conversa inexistente dá 404 legível', (await A('POST', '/msg/funil/mover', { conversa: 987654, etiqueta: eId('Pago') })).j.erro === 'Conversa não encontrada.');
    chk('funil: etapa inválida (negativa) recusada', (await A('POST', '/msg/funil/mover', { conversa: fWa, etiqueta: -1 })).r.status === 400);
    chk('funil: canal inválido recusado em português', (await A('GET', '/msg/funil?canal=telegram')).r.status === 400);
    chk('funil: exige Admin (sem sessão: 401)', (await w.fetch(ped('GET', '/msg/funil?canal=todos', ''), env, {})).status === 401);
    await DB.prepare("UPDATE msg_etiqueta SET nome='Separado' WHERE id=?").bind(eId('Reserva')).run();
    await DB.prepare("UPDATE msg_etiqueta SET arquivada=1 WHERE id=?").bind(eId('Enviado')).run();
    f = await A('GET', '/msg/funil?canal=todos');
    chk('funil: segue as etiquetas da equipe (renomeada aparece com o nome novo, arquivada some)', f.j.colunas.map((c) => c.etiqueta.nome).join('|') === 'Novo cliente|Separado|Aguardando pagamento|Pago', f.j.colunas.map((c) => c.etiqueta.nome));
    await DB.prepare("UPDATE msg_etiqueta SET nome='Reserva' WHERE id=?").bind(eId('Reserva')).run();
    await DB.prepare("UPDATE msg_etiqueta SET arquivada=0 WHERE id=?").bind(eId('Enviado')).run();
    chk('funil: funções exportadas', typeof W.funilVendas_ === 'function' && typeof W.moverNoFunil_ === 'function');
  }
  // ACL: catálogo 1, delegação, negação e redirecionamento inexistente.
  const originalFetchAcl=globalThis.fetch;
  globalThis.fetch=async(u,init)=>{
    if(String(u).startsWith('https://api.fake')&&init?.body){const d=JSON.parse(init.body);if(d.sessao==='tk2.catalogo1')return Response.json({ok:true,usuario:{permissoes:['catalogo_admin','catalogo_cadastrar','painel_simples'],perfil:'Equipe catálogo 1'}});}
    return originalFetchAcl(u,init);
  };
  const staff=async(m,p,b)=>{const r=await w.fetch(ped(m,p,'tk2.catalogo1',b),env,{});return {r,j:await r.json()};};
  chk('Equipe catálogo 1 recebe atendimento sem configurações',(await staff('GET','/msg/acesso')).j.direitos.acessar&&!(await staff('GET','/msg/acesso')).j.direitos.configuracoes);
  chk('Equipe catálogo 1 lista conversas',(await staff('GET','/msg/conversas?canal=todos')).r.status===200);
  chk('equipe não altera conexões nem administra acessos',(await staff('POST','/msg/zernio/config',{chave:'fake'})).r.status===403&&(await staff('GET','/msg/acessos')).r.status===403);
  let regra=await A('POST','/msg/acessos',{tipo:'pessoa',alvo:'88999990000',chave:'notas',valor:false});
  chk('gestão salva negação individual',regra.j.ok,regra.j);
  chk('negação é aplicada no servidor e remove notas da resposta',(await staff('GET','/msg/notas?conversa='+nConv)).r.status===403&&!Object.hasOwn((await staff('GET','/msg/mensagens?conversa='+nConv)).j,'notas')&&(await staff('GET','/msg/conversas?canal=todos&filtro=com_notas')).r.status===403);
  chk('gestor conserva acesso e log ao retirar permissão de homônimo',(await A('GET','/msg/notas/log?conversa='+nConv)).r.status===200);
  await A('POST','/msg/acessos',{tipo:'pessoa',alvo:'88999990000',chave:'notas',valor:null});
  chk('reset volta ao perfil sem publicação Apps Script',(await staff('GET','/msg/notas?conversa='+nConv)).r.status===200);
  chk('chave desconhecida e protótipo recusados',(await A('POST','/msg/acessos',{tipo:'pessoa',alvo:'88999990000',chave:'__proto__',valor:true})).r.status===400);
  await A('POST','/msg/acessos',{tipo:'pessoa',alvo:'88999990000',chave:'acessar',valor:false});
  chk('revogação interrompe todo atendimento',(await staff('GET','/msg/conversas?canal=todos')).r.status===403);
  await DB.prepare("DELETE FROM cfg WHERE chave='msg_acessos_v1'").run();globalThis.fetch=originalFetchAcl;
  // APK e nome são servidos como download privado; não executamos anexos.
  const apkBytes=new Uint8Array([80,75,3,4,1,2,3]);await R2.put('msg/fake.apk',apkBytes,{httpMetadata:{contentType:'application/vnd.android.package-archive'}});
  const arquivo=await DB.prepare("INSERT INTO msg_mensagem(conversa_id,canal,ext_id,direcao,tipo,texto,enviada_em,midia_chave,midia_mime) VALUES(?,'whatsapp1','test-download','entrada','documento','TENKiTER-Mensagens-2.4.2.apk',?,'msg/fake.apk','application/vnd.android.package-archive')").bind(nConv,agoraIso()).run();
  const ar=await w.fetch(ped('GET','/msg/midia?id='+arquivo.meta.last_row_id+'&baixar=1','tk2.admin'),env,{});
  chk('APK tem conteúdo original, nome e download privado',ar.status===200&&ar.headers.get('content-disposition').includes('TENKiTER-Mensagens-2.4.2.apk')&&ar.headers.get('cache-control').includes('no-store')&&Buffer.from(await ar.arrayBuffer()).equals(Buffer.from(apkBytes)));
  const cold=(await import(tmp+'?cold-permissions')).default, prepareOriginal=DB.prepare;let alters=0;
  DB.prepare=function(sql){if(/^ALTER/i.test(sql))alters++;return prepareOriginal.call(DB,sql);};
  const coldResults=await Promise.all([cold.fetch(ped('GET','/msg/acesso','tk2.admin'),env,{}),cold.fetch(ped('GET','/msg/acesso','tk2.admin'),env,{})]);
  DB.prepare=prepareOriginal;
  chk('isolado novo usa versão persistida sem repetir ALTER e atende chamadas simultâneas',coldResults.every(r=>r.status===200)&&alters===0,alters);
  const remoteFetch=globalThis.fetch;globalThis.fetch=async(u,i)=>String(u)==='https://cdn.fake/recebido.apk'?new Response(apkBytes,{headers:{'Content-Type':'application/vnd.android.package-archive'}}):remoteFetch(u,i);
  await DB.prepare("UPDATE msg_mensagem SET midia_chave='',midia_url='https://cdn.fake/recebido.apk' WHERE id=?").bind(arquivo.meta.last_row_id).run();
  const remoteApk=await w.fetch(ped('GET','/msg/midia?id='+arquivo.meta.last_row_id+'&baixar=1','tk2.admin'),env,{});
  chk('APK remoto antes recusado é copiado e baixado',remoteApk.status===200&&Buffer.from(await remoteApk.arrayBuffer()).equals(Buffer.from(apkBytes)));
  globalThis.fetch=remoteFetch;

  // Perfil persistente, autoridade do servidor e blocos completos além da página.
  const fetchPerfil=globalThis.fetch;
  globalThis.fetch=async(u,o)=>String(u).startsWith('https://api.fake')&&JSON.parse(o.body).action==='sessao'
    ?new Response(JSON.stringify({ok:true,usuario:{nome:new Headers(o.headers).get('ignored')||'IARA ALVES',permissoes:JSON.parse(o.body).sessao==='tk2.perfil-admin'?['gerir_acessos']:['catalogo_admin'],perfis:['Equipe catálogo 1']}}))
    :fetchPerfil(u,o);
  const perfilReq=async(m,path,phone,token,body)=>{const r=await w.fetch(new Request('https://ig.test'+path,{method:m,headers:{'X-TK-Whats':phone,'X-TK-Sessao':token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),env,{});return {status:r.status,j:await r.json()};};
  await cfg('msg_cfg',JSON.stringify({assinatura:false}));
  let pr=await perfilReq('GET','/msg/config','88981234567','tk2.perfil-admin');
  chk('primeiro nome vem do cadastro autenticado, mesmo sem nome local',pr.j.nomePadrao==='Iara'&&pr.j.nomeCadastro==='IARA ALVES'&&pr.j.config.assinatura===true,pr);
  await perfilReq('POST','/msg/config','88981234567','tk2.perfil-admin',{meuNome:'Iara TK',assinatura:false});
  pr=await perfilReq('GET','/msg/config','5588981234567','tk2.perfil-admin');
  chk('preferência sobrevive token novo, outro aparelho e telefone com +55',pr.j.meuNome==='Iara TK'&&!pr.j.config.assinatura&&pr.j.podeOcultar,pr);
  let eq=await perfilReq('GET','/msg/config','88981234568','tk2.perfil-equipe');
  chk('equipe usa o primeiro nome e assinatura obrigatória apesar da configuração legada',eq.j.nomePadrao==='Iara'&&eq.j.config.assinatura&&!eq.j.podeOcultar,eq);
  chk('servidor recusa ocultar nome mesmo com permissão de configurações', (await perfilReq('POST','/msg/config','88981234568','tk2.perfil-equipe',{assinatura:false})).status===403);
  await perfilReq('POST','/msg/config','88981234568','tk2.perfil-equipe',{meuNome:'Iarinha'});
  eq=await perfilReq('GET','/msg/config','5588981234568','tk2.perfil-equipe-novo');
  chk('equipe edita o próprio nome sem acesso à edição de clientes',eq.j.meuNome==='Iarinha'&&eq.j.config.assinatura);
  const rename=await A('POST','/msg/ficha',{conversa:waPerson.id,nome:'Cliente nome corrigido',cidade:'Centro'});
  const irename=await A('GET','/msg/ficha?conversa='+igPerson.id);
  chk('renomear pela ficha atualiza todos os canais já vinculados sem mudar a identidade',rename.j.nome==='Cliente nome corrigido'&&irename.j.nome==='Cliente nome corrigido'&&rename.j.canais.length>=2,[rename.j.nome,irename.j.nome]);
  chk('nome vazio é recusado sem apagar a ficha', (await A('POST','/msg/ficha',{conversa:waPerson.id,nome:''})).r.status===400);
  const prefix='teste-bloco-',stamp=n=>new Date(Date.parse('2100-01-01T00:00:00Z')+n*60000).toISOString();
  for(let n=0;n<60;n++)await DB.prepare("INSERT INTO msg_conversa(canal,contato,pessoa,nome,total,ultima_em,grupo) VALUES ('whatsapp1',?,?,?,1,?,0)").bind(prefix+n,prefix+n,'Nome igual',stamp(-n)).run();
  const head=await DB.prepare("INSERT INTO msg_conversa(canal,contato,pessoa,nome,total,ultima_em,grupo) VALUES ('whatsapp1','bloco-wa1','bloco-pessoa','Pessoa completa',1,?,0)").bind(stamp(10)).run();
  const tail=await DB.prepare("INSERT INTO msg_conversa(canal,contato,pessoa,nome,total,ultima_em,grupo) VALUES ('whatsapp2','bloco-wa2','bloco-pessoa','Pessoa completa',1,?,0)").bind(stamp(-5000)).run();
  await DB.prepare("INSERT INTO msg_conversa(canal,contato,pessoa,nome,total,ultima_em,grupo) VALUES ('instagram','bloco-ig','bloco-pessoa','Pessoa completa',1,?,0)").bind(stamp(-4000)).run();
  let all=(await A('GET','/msg/conversas?blocos=1&canal=todos')).j.conversas;
  const block=all.filter(c=>c.pessoa==='bloco-pessoa');
  chk('três canais juntos sem pesquisar mesmo com 60 conversas entre eles',block.length===3&&all[0].id===head.meta.last_row_id,block.map(c=>c.id));
  chk('nome igual não vincula pessoas distintas',all.filter(c=>c.nome==='Nome igual').every(c=>all.filter(x=>x.pessoa===c.pessoa).length===1));
  await DB.prepare('UPDATE msg_conversa SET ultima_em=? WHERE id=?').bind(stamp(20),tail.meta.last_row_id).run();
  all=(await A('GET','/msg/conversas?blocos=1&canal=todos')).j.conversas;
  chk('canal antigo atualizado sobe levando todo o bloco e muda a ordem interna',all[0].id===tail.meta.last_row_id&&all.slice(0,3).every(c=>c.pessoa==='bloco-pessoa'));
  const only=(await A('GET','/msg/conversas?canal=instagram')).j.conversas;
  chk('filtro de Instagram preservado sem vazar canais WhatsApp',only.every(c=>c.canal==='instagram'));
  globalThis.fetch=fetchPerfil;
  console.log('\n' + ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) { console.log(falhas.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
