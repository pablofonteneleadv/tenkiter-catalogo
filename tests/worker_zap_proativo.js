// v7.48.3 — WhatsApp (Wafly) proativo: consulta a cada ~1 min por até 10 min, "Publicado sem confirmação", reenvio único com
// requestId novo em falha definitiva, "ambos" sem segurar o Instagram, Repostar no próximo horário livre sem furar a ordem e
// Consultar com resposta legível. D1 real (SQLite do Node); Wafly, Instagram, R2 e Apps Script FALSOS. Nada sai da máquina.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_zap_proativo.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '..', 'instagram-worker', 'worker.js')));
let ok = 0; const falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 400) : '')); } };
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
  const TOKEN = 'IGQVJ_TOKEN_INVENTADO_PARA_TESTE_1234567890';
  // ---- Wafly falsa: POST /status-publication e GET /status-publication/requests/<id> ----
  let waf = [], postModo = 'ok', recibos = {}, reciboPadrao = { status: 200, body: { state: 'pending' } }, ponteRecibo = null, publicadosIG = [], seqC = 0;
  globalThis.fetch = async (u, init) => {
    u = String(u); const metodo = (init && init.method) || 'GET';
    if (u.startsWith('https://api.fake')) { if(ponteRecibo&&init?.body&&JSON.parse(init.body).consultar)return new Response(JSON.stringify(ponteRecibo)); return new Response(JSON.stringify({ ok: true, usuario: { permissoes: ['gerir_acessos', 'catalogo_cadastrar'], nome: 'Gestor' } })); }
    if (u.startsWith('https://tenkiter-midia.fake/')) return new Response(Buffer.alloc(900, 7), { headers: { 'content-type': 'image/jpeg' } });
    if (u.startsWith('https://wafly.com.br/api-bridge-whats/')) {
      const body = init && init.body ? JSON.parse(init.body) : null;
      waf.push({ url: u, metodo, body });
      if (metodo === 'GET') { const rid = decodeURIComponent(u.split('/requests/')[1] || ''); const r = recibos[rid] || reciboPadrao; return new Response(JSON.stringify(r.body), { status: r.status }); }
      const modo = typeof postModo === 'function' ? postModo(body) : postModo;
      if (modo === '409') return new Response(JSON.stringify({ error: 'STATUS_NOT_CONFIRMED' }), { status: 409 });
      if (modo === '422') return new Response(JSON.stringify({ error: 'x' }), { status: 422 });
      return new Response(JSON.stringify({ state: 'accepted' }));
    }
    if (u.startsWith('https://ig.fake')) {
      if (u.includes('/refresh_access_token')) return new Response(JSON.stringify({ access_token: TOKEN, expires_in: 5184000 }));
      if (metodo === 'POST' && u.endsWith('/me/media')) return new Response(JSON.stringify({ id: 'C' + (++seqC) }));
      if (metodo === 'POST' && u.endsWith('/me/media_publish')) { publicadosIG.push(Date.now()); return new Response(JSON.stringify({ id: 'M' + publicadosIG.length })); }
      if (u.includes('?fields=status_code')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
      if (u.includes('?fields=permalink')) return new Response(JSON.stringify({ permalink: 'https://www.instagram.com/p/FAKE/' }));
    }
    throw new Error('fetch inesperado: ' + u);
  };
  const DB = d1();
  const env = { DB, MIDIA: R2, CACHE: KV, API_URL: 'https://api.fake/exec', MIDIA_URL: 'https://tenkiter-midia.fake', IG_BASE: 'https://ig.fake/v23.0' };
  const ped = (m, p, corpo) => new Request('https://ig.test' + p, { method: m, headers: { Origin: 'https://tenkitermodas.com.br', 'X-TK-Whats': '88999990000', 'X-TK-Sessao': 'tk2.admin', 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const A = async (m, p, corpo) => { const r = await w.fetch(ped(m, p, corpo), env, {}); return { r, j: await r.json() }; };
  const iso = (min) => new Date(Date.now() + min * 60000).toISOString();
  const midia = JSON.stringify([{ url: 'https://tenkiter-midia.fake/m/t/202611/aaaaaaaaaaaaaaaaaaaa.jpg', tipo: 'imagem' }]);
  const nova = async (canal, status, extra) => {
    const r = await DB.prepare("INSERT INTO postagem (tipo, modo, legenda, midias, agendado_em, status, canal) VALUES ('story','auto','Calcinha TK-0001', ?, ?, ?, ?)").bind(midia, iso(-1), status || 'agendado', canal).run();
    const id = r.meta.last_row_id; if (extra) for (const [k, v] of Object.entries(extra)) await DB.prepare('UPDATE postagem SET ' + k + '=? WHERE id=?').bind(v, id).run();
    return id;
  };
  const L = (id) => DB.prepare('SELECT * FROM postagem WHERE id=?').bind(id).first();
  const cfg = (k, v) => DB.prepare('INSERT OR REPLACE INTO cfg (chave, valor) VALUES (?, ?)').bind(k, v).run();
  const rid = (slot, id, s) => (slot === 2 ? 'tkpost2-' : 'tkpost-') + String(id).padStart(12, '0') + (s || '');
  const passar = async (id, min) => DB.prepare('UPDATE postagem SET zap_consulta=?, atualizado_em=? WHERE id=?').bind(iso(-min), iso(-min), id).run();
  const envelhecer = async (id, min) => DB.prepare('UPDATE postagem SET zap_desde=?, inicio_proc=?, zap_consulta=?, atualizado_em=? WHERE id=?').bind(iso(-min), iso(-min), iso(-2), iso(-2), id).run();
  const P = async () => W.processarPostagens(env);
  await P();
  await cfg('po_cfg', JSON.stringify({ pausaAtiva: false, canais: { status: { gapMin: 300, gapMax: 300, max24h: 100 }, status2: { gapMin: 300, gapMax: 300, max24h: 100 }, story: { gapMin: 300, gapMax: 300, max24h: 100 } } }));
  await cfg('wafly_1', JSON.stringify({ instance: 'INST_TESTE_001', token: 'TOKEN_TESTE_AAA111', clientToken: 'CLIENT_TESTE_BBB222' }));
  await cfg('wafly_2', JSON.stringify({ instance: 'INST_TESTE_002', token: 'TOKEN_TESTE_CCC333', clientToken: 'CLIENT_TESTE_DDD444' }));
  await cfg('ig_token', TOKEN); await cfg('ig_token_exp', String(Date.now() + 50 * 86400000));
  const posts_ = (l) => l.filter((x) => x.metodo === 'POST');

  console.log('== aceito ==');
  let a = await nova('whatsapp'); postModo = '409'; waf = []; await P();
  chk('409 na publicação = aguardando (status processando, marcador zapq:)', (await L(a)).status === 'processando' && (await L(a)).zap_estado === 'aguardando');
  recibos[rid(1, a)] = { status: 200, body: { state: 'accepted', serverAcknowledged: true } }; await passar(a, 1); waf = []; await P();
  let la = await L(a);
  chk('accepted+serverAcknowledged na consulta seguinte (~1 min) = publicado, sem reenviar', la.status === 'publicado' && la.zap_estado === 'confirmado' && posts_(waf).length === 0 && waf.length === 1, [la.status, la.zap_estado, waf.length]);

  console.log('== desconhecido por 10 min ==');
  let b = await nova('whatsapp2'); postModo = '409'; await P(); waf = [];
  for (let m = 1; m <= 9; m++) { await DB.prepare('UPDATE postagem SET zap_desde=?, inicio_proc=?, zap_consulta=? WHERE id=?').bind(iso(-m), iso(-m), iso(-1.2), b).run(); await P(); }
  chk('dentro dos 10 min: consulta a cada minuto, segue aguardando e nada é reenviado', (await L(b)).status === 'processando' && waf.filter((x) => x.metodo === 'GET').length === 9 && posts_(waf).length === 0, waf.length);
  const cons = await A('POST', '/post/consultar', { id: b });
  chk('Consultar resultado (aguardando): mensagem legível com o horário da consulta, sem JSON cru', cons.j.ok && cons.j.resultado === 'esperando' && /A Wafly ainda não confirmou \(consultado às \d\d:\d\d/.test(cons.j.mensagem) && !/[{}]/.test(cons.j.mensagem), cons.j);
  await envelhecer(b, 11); waf = []; await P();
  let lb = await L(b);
  chk('passou de 10 min sem resposta definitiva = "Publicado sem confirmação" (publicado + marcador) e sem reenvio', lb.status === 'publicado' && lb.zap_estado === 'sem_confirmacao' && lb.erro === '' && posts_(waf).length === 0, [lb.status, lb.zap_estado]);
  const vb = (await A('GET', '/posts')).j.posts.find((x) => x.id === b);
  chk('/posts entrega o marcador para o aviso discreto da tela', vb.zap && vb.zap.estado === 'sem_confirmacao' && !JSON.stringify(vb.zap).includes('tkpost'), vb.zap);

  console.log('== recibo ausente: incerteza sem reenvio ==');
  let c = await nova('whatsapp2'); postModo = '409'; await P();
  recibos[rid(2, c)] = { status: 404, body: { error: 'not found' } }; postModo = 'ok'; await passar(c, 1); waf = []; await P();
  let lc = await L(c), pc = posts_(waf)[0];
  chk('recibo 404 não comprova falha: consulta o mesmo ID sem criar -r1', posts_(waf).length === 0 && lc.status === 'processando' && lc.zap_req === rid(2,c) && lc.zap_tent === 0, [lc.status,lc.zap_tent]);
  await envelhecer(c,11); waf=[]; await P(); lc=await L(c);
  chk('404 após a janela fica sem confirmação e preserva o ID da tentativa', lc.zap_estado === 'sem_confirmacao' && lc.zap_req === rid(2,c) && posts_(waf).length === 0, lc.zap_estado);
  let c2 = await nova('whatsapp2'); postModo = '409'; await P();
  recibos[rid(2, c2)] = { status: 200, body: {state:'failed'} }; await passar(c2, 1); await P();
  await passar(c2, 1); waf = []; await P();
  chk('slotDoRequestId_ com sufixo: a consulta do -r1 vai para a instância 2', waf.length === 1 && waf[0].metodo === 'GET' && waf[0].url.includes('/instances/INST_TESTE_002/') && waf[0].url.endsWith('/requests/' + rid(2, c2, '-r1')), waf.map((x) => x.url));

  let d = await nova('whatsapp'); postModo = '409'; await P();
  recibos[rid(1, d)] = { status: 200, body: { state: 'failed' } }; await passar(d, 1); waf = []; await P();
  let ld = await L(d);
  chk('estado "failed": reenvio com -r1; reenvio sem confirmação volta a aguardar (janela nova)', ld.status === 'processando' && ld.ig_id === 'zapq:' + rid(1, d, '-r1') && ld.zap_tent === 1 && posts_(waf).length === 1, [ld.status, ld.ig_id]);
  recibos[rid(1, d, '-r1')] = { status: 200, body: { state: 'rejected' } }; await passar(d, 1); waf = []; await P();
  ld = await L(d);
  chk('reenvio também falhou = erro com motivo em português e próxima ação', ld.status === 'erro' && ld.zap_estado === 'erro' && /não publicou, nem na nova tentativa automática/.test(ld.erro) && /Repostar/.test(ld.erro) && !/[{}]/.test(ld.erro) && posts_(waf).length === 0, ld.erro);
  waf = []; for (let i = 0; i < 5; i++) { await DB.prepare('UPDATE postagem SET atualizado_em=?, zap_consulta=? WHERE id=?').bind(iso(-90), iso(-90), d).run(); await P(); }
  chk('erro final sai do fluxo automático: o cron não consulta, não reenvia e não publica horas depois', (await L(d)).status === 'erro' && waf.filter((x) => x.url.includes(rid(1, d))).length === 0);
  let e2 = await nova('whatsapp'); postModo = '409'; await P();
  recibos[rid(1, e2)] = { status: 200, body: { state: 'expired' } }; postModo = '422'; await passar(e2, 1); waf = []; await P();
  chk('reenvio recusado (422) = erro na hora, uma só tentativa', (await L(e2)).status === 'erro' && posts_(waf).length === 1 && /nova tentativa automática falhou/.test((await L(e2)).erro));

  console.log('== ambos: WhatsApp pendente não segura o Instagram ==');
  publicadosIG = []; postModo = '409';
  let f = await nova('ambos'); waf = []; await P();
  let lf = await L(f);
  chk('ambos: Instagram publica no horário mesmo com o WhatsApp sem confirmação', lf.status === 'publicado' && publicadosIG.length === 1 && lf.ig_id === 'M1' && lf.permalink !== '', [lf.status, lf.ig_id]);
  chk('ambos: perna do WhatsApp guardada à parte (aguardando), sem perder o ig_id', lf.zap_estado === 'aguardando' && lf.zap_req === rid(1, f));
  recibos[rid(1, f)] = { status: 200, body: { state: 'accepted', serverAcknowledged: true } }; await passar(f, 1); await P();
  lf = await L(f);
  chk('ambos: confirmação do WhatsApp em paralelo; Instagram não republicado', lf.zap_estado === 'confirmado' && lf.ig_id === 'M1' && publicadosIG.length === 1);
  let g = await nova('ambos'); await P(); await envelhecer(g, 11); await P();
  chk('ambos: 10 min sem resposta = WhatsApp "sem confirmação"; Instagram continua publicado', (await L(g)).status === 'publicado' && (await L(g)).zap_estado === 'sem_confirmacao');

  console.log('== Repostar: próximo horário livre do mesmo canal, sem furar a ordem ==');
  await DB.prepare("UPDATE postagem SET status='cancelado' WHERE status='agendado'").run();
  const leva = []; for (let i = 1; i <= 5; i++) leva.push(await nova('whatsapp', 'agendado', { agendado_em: iso(5 * i) }));
  const longe = await nova('whatsapp', 'agendado', { agendado_em: iso(3 * 24 * 60) });
  const outro = await nova('instagram', 'agendado', { agendado_em: iso(2) });
  const semConf = await nova('whatsapp', 'publicado', { zap_estado: 'sem_confirmacao', ig_id: 'tkpost-x', publicado_em: iso(-20) });
  let rp = await A('POST', '/post/repostar', { id: semConf, confirmarRisco: true });
  const tRep = Date.parse(rp.j.quando), tUlt = Date.parse((await L(leva[4])).agendado_em);
  chk('"Publicado sem confirmação" pode ser repostado e vai para DEPOIS da leva já agendada do canal', rp.j.ok && tRep >= tUlt + 300000 - 1000 && tRep < Date.parse((await L(longe)).agendado_em), [rp.j, new Date(tUlt).toISOString()]);
  chk('repostagem não mexe na ordem das agendadas nem na origem publicada', (await Promise.all(leva.map(L))).every((x, i) => Math.abs(Date.parse(x.agendado_em) - (Date.now() + 5 * (i + 1) * 60000)) < 5000) && (await L(semConf)).status === 'publicado', null);
  chk('resposta informa o horário escolhido e o canal', typeof rp.j.quando === 'string' && rp.j.canal === 'whatsapp');
  const ambErro = await nova('ambos', 'publicado', { zap_estado: 'erro', zap_erro: 'WhatsApp Status 1: falhou', ig_id: 'M9' });
  rp = await A('POST', '/post/repostar', { id: ambErro, confirmarRisco: true, perna: 'whatsapp' });
  const cop = await L(rp.j.id);
  chk('ambos com Instagram publicado: "Repostar só o WhatsApp" cria cópia só do Status 1 e não republica o Instagram', rp.j.ok && cop.canal === 'whatsapp' && (await L(ambErro)).status === 'publicado' && (await L(ambErro)).zap_estado === 'repostado', [rp.j, cop.canal]);
  rp = await A('POST', '/post/repostar', { id: f, confirmarRisco: true });
  chk('nada para repostar quando os dois canais saíram (409 legível)', rp.r.status === 409 && /Só postagens/.test(rp.j.erro), rp.j);

  console.log('== Antigos (916/927): tratados só quando a pessoa toca ==');
  const old916 = await nova('ambos', 'erro', { ig_id: 'zapq:' + 'tkpost-000000009916', inicio_proc: iso(-120), atualizado_em: iso(-90), erro: 'WhatsApp: a Wafly ainda não confirmou depois de 30 min. Toque em “Consultar resultado” (não reenvia).' });
  const old927 = await nova('whatsapp2', 'erro', { ig_id: 'zapq:' + 'tkpost2-000000009927', inicio_proc: iso(-120), atualizado_em: iso(-90), erro: 'WhatsApp: a Wafly ainda não confirmou depois de 30 min.' });
  publicadosIG = []; waf = []; for (let i = 0; i < 3; i++) await P();
  chk('cron não mexe nem publica os antigos em erro', (await L(old916)).status === 'erro' && (await L(old927)).status === 'erro' && publicadosIG.length === 0 && waf.length === 0);
  recibos['tkpost-000000009916'] = { status: 200, body: { state: 'accepted', serverAcknowledged: true } };
  let k = await A('POST', '/post/consultar', { id: old916 });
  let l916 = await L(old916);
  chk('916: Consultar mostra o que a Wafly respondeu e avisa que o Instagram não saiu (sem publicar)', k.j.ok && /Confirmado/.test(k.j.mensagem) && /Instagram/.test(k.j.mensagem) && l916.status === 'erro' && l916.zap_estado === 'confirmado' && publicadosIG.length === 0, k.j);
  rp = await A('POST', '/post/repostar', { id: old916, confirmarRisco: true });
  chk('916: Repostar leva só o Instagram (o WhatsApp já saiu) ao próximo horário livre do Story', rp.j.ok && (await L(rp.j.id)).canal === 'instagram' && Date.parse(rp.j.quando) > Date.now(), rp.j);
  recibos['tkpost2-000000009927'] = { status: 404, body: {} }; waf = [];
  k = await A('POST', '/post/consultar', { id: old927 });
  chk('927: 404 antigo continua incerto, sem alegar falha nem reenviar', k.j.ok && k.j.resultado === 'sem_confirmacao' && /não confirmou/.test(k.j.mensagem) && posts_(waf).length === 0 && (await L(old927)).zap_estado === 'sem_confirmacao', k.j);
  console.log('== recibo ausente em respostas 200 e ponte legada ==');
  for(const body of [{state:'not_found'},{state:'error',code:'REQUEST_NOT_FOUND'},{state:'error',error:{code:'REQUEST_NOT_FOUND'}}]) {
    const id=await nova('whatsapp2','processando');const requestId=rid(2,id);
    await DB.prepare("UPDATE postagem SET ig_id=?,zap_req=?,zap_estado='aguardando',zap_desde=?,inicio_proc=? WHERE id=?").bind('zapq:'+requestId,requestId,iso(-1),iso(-1),id).run();
    recibos[requestId]={status:200,body};waf=[];const r=await A('POST','/post/consultar',{id});
    chk('recibo ausente com HTTP 200 mantém o ID e não reenvia: '+JSON.stringify(body),r.j.resultado==='esperando'&&(await L(id)).zap_tent===0&&posts_(waf).length===0,r.j);
    await DB.prepare("UPDATE postagem SET status='cancelado' WHERE id=?").bind(id).run();
  }
  const bridge=await nova('whatsapp','processando'),bridgeRid=rid(1,bridge);
  await DB.prepare("UPDATE postagem SET ig_id=?,zap_req=?,zap_estado='aguardando',zap_desde=?,inicio_proc=? WHERE id=?").bind('zapq:'+bridgeRid,bridgeRid,iso(-1),iso(-1),bridge).run();
  await DB.prepare("DELETE FROM cfg WHERE chave='wafly_1'").run();
  for(const body of [{ok:false,http:404},{ok:true,estado:'error',code:'REQUEST_NOT_FOUND'},{ok:true,estado:'not_found'},{ok:false,naoEncontrado:true}]) {
    ponteRecibo=body;waf=[];const r=await A('POST','/post/consultar',{id:bridge});
    chk('ponte mantém a incerteza sem reenvio: '+JSON.stringify(body),r.j.resultado==='esperando'&&(await L(bridge)).zap_tent===0&&posts_(waf).length===0,r.j);
  }
  const s = JSON.stringify((await DB.prepare('SELECT erro, zap_erro FROM postagem').all()).results);
  chk('nenhuma mensagem gravada expõe token ou Client-Token', !s.includes('TOKEN_TESTE') && !s.includes('CLIENT_TESTE'));
  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length); if (falhas.length) { console.log(falhas.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(2); });
