// v7.56 — Fila de Postagens à prova de falhas bobas. D1 real (SQLite do Node); Instagram, Wafly, Grupo, R2 e Apps Script FALSOS.
// Reproduz o caso real de 05/11/2026 (série "ambos" com WhatsApp confirmado + Instagram "too many actions" travando Story e
// Status 1 por ~22 h) e cobre: pausa global do Instagram com backoff, WhatsApp seguindo na pausa sem duplicar, retomada
// sozinha e pelo gestor, vigia de 20 min, token vencido, "enviando" preso, Grupo/Status 2 normais, espaço mínimo do Instagram.
// Nada sai da máquina e nenhuma credencial real é lida.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_prova_falhas.mjs');
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
  await P();                                                                                      // cria o esquema
  await cfg('po_cfg', JSON.stringify({ pausaAtiva: false, canais: { status: { gapMin: 120, gapMax: 120, max24h: 100 }, story: { gapMin: 120, gapMax: 120, max24h: 100 }, grupo: { gapMin: 120, gapMax: 120, max24h: 100 }, status2: { gapMin: 120, gapMax: 120, max24h: 100 } } }));
  await cfg('wafly_1', JSON.stringify({ instance: 'INST_TESTE_001', token: 'TOKEN_TESTE_AAA111', clientToken: 'CLIENT_TESTE_BBB222' }));
  await cfg('wafly_2', JSON.stringify({ instance: 'INST_TESTE_002', token: 'TOKEN_TESTE_CCC333', clientToken: 'CLIENT_TESTE_DDD444' }));
  await cfg('ig_token', TOKEN); await cfg('ig_token_exp', String(Date.now() + 50 * 86400000));
  const cols = new Set((await DB.prepare('PRAGMA table_info(postagem)').all()).results.map((c) => c.name));
  chk('esquema aditivo: colunas atencao e atencao_em criadas', cols.has('atencao') && cols.has('atencao_em'));

  console.log('== Classificação dos erros do Instagram ==');
  const F = W.fraseErroIG;
  chk('"User is performing too many actions" = espera (por texto, sem código)', F({ message: 'User is performing too many actions' }).espera === true);
  chk('code 9 / subcode 2207042 (teto de publicações) = espera', F({ code: 9, sub: 2207042, message: 'x' }).espera === true);
  chk('code 4, 17, 32, 368, 613 e subcode 2207051 = espera', [4, 17, 32, 368, 613].every((c) => F({ code: c, message: 'x' }).espera) && F({ code: 2, sub: 2207051, message: 'x' }).espera);
  chk('"Action is blocked", "rate limit", "Please try again later" e HTTP 429 = espera', ['Action is blocked', 'Application rate limit reached', 'Please try again later'].every((m) => F({ message: m }).espera) && F({ http: 429, message: 'x' }).espera);
  chk('code 190 / "Session has expired" = token (pausa + aviso)', F({ code: 190, message: 'x' }).conta === 'token' && F({ message: 'Error validating access token: Session has expired' }).conta === 'token');
  chk('HTTP 500 / sem conexão / code 2 = instável (espera curta)', F({ http: 500, message: 'x' }).transitorio && F({ http: 0, message: 'não consegui falar com o Instagram' }).transitorio && F({ code: 2, message: 'An unexpected error has occurred. Please retry your request later.' }).transitorio);
  chk('mídia recusada (2207052) = erro só do item, nunca pausa', !F({ code: 9004, sub: 2207052, message: 'Media download has failed' }).espera && !F({ code: 9004, sub: 2207052, message: 'Media download has failed' }).transitorio);
  chk('"Media ID is not available" e "requested resource does not exist" = mídia ainda preparando (repete com o mesmo container, não é mídia inválida)', [F({ code: 9007, sub: 2207027, message: 'Media ID is not available' }), F({ code: 24, sub: 2207006, message: 'The requested resource does not exist' }), F({ message: 'Instagram: The requested resource does not exist' })].every((f) => f.transitorio && f.preparando && !f.espera));
  chk('frases em português, sem JSON e sem token', [F({ message: 'too many actions access_token=SEGREDO' }), F({ code: 190 }), F({ http: 500 })].every((f) => !/[{}]/.test(f.frase) && !f.frase.includes('SEGREDO')));

  console.log('== Caso real (05/11): série "ambos" parte 1 com WhatsApp ok + Instagram "too many actions" ==');
  const S = 'serie-real-1345', ant = iso(-22 * 60);
  const p1 = await nova('ambos', { serie: S, parte: 1, partes: 3, status: 'erro', tentativas: 3, zap_estado: 'confirmado', zap_req: 'tkpost-000000001345', ig_id: 'zap:tkpost-000000001345', zap_desde: ant, erro: 'Instagram: User is performing too many actions', agendado_em: ant });
  const p2 = await nova('ambos', { serie: S, parte: 2, partes: 3, agendado_em: ant });
  const p3 = await nova('ambos', { serie: S, parte: 3, partes: 3, agendado_em: ant });
  const outros = [await nova('ambos', { agendado_em: iso(-20 * 60) }), await nova('instagram', { agendado_em: iso(-19 * 60) }), await nova('whatsapp', { agendado_em: iso(-18 * 60) })];
  const totalAntes = (await DB.prepare('SELECT COUNT(*) n FROM postagem').first()).n;
  wafPosts = []; igPub = [];
  for (let i = 0; i < 12; i++) { await P(); await passar(4); }
  const ls = await Promise.all([p1, p2, p3, ...outros].map(L));
  chk('partes 2 e 3 seguiram (WhatsApp e Instagram publicados)', ls[1].status === 'publicado' && ls[2].status === 'publicado' && ls[1].zap_estado === 'confirmado' && ls[2].zap_estado === 'confirmado', ls.slice(1, 3).map((x) => [x.status, x.zap_estado, x.erro]));
  chk('as outras postagens do Story e do Status 1 NÃO ficaram travadas', ls.slice(3).every((x) => x.status === 'publicado'), ls.slice(3).map((x) => [x.canal, x.status, x.erro]));
  chk('o WhatsApp da parte 1 não foi reenviado', !wafPosts.some((b) => String(b.requestId).startsWith('tkpost-' + String(p1).padStart(12, '0'))));
  chk('parte 1 continua visível: Instagram não saiu, WhatsApp confirmado', ls[0].status === 'erro' && ls[0].zap_estado === 'confirmado');
  let { j } = await A('GET', '/posts?limite=250');
  chk('saúde: Instagram "Precisa de atenção" com "Repostar só o Story"', j.saude && j.saude.canais.instagram.atencao >= 1 && j.saude.canais.instagram.motivos.some((m) => /Repostar só o Story/.test(m)), j.saude);
  let x = await A('POST', '/post/repostar', { id: p1, perna: 'instagram', confirmarRisco: true });
  chk('"Repostar só o Story" funciona numa parte de série (cópia avulsa só do Instagram)', x.j.ok === true && x.j.canal === 'instagram', x.j);
  const copia = x.j.id ? await L(x.j.id) : null;
  chk('a cópia não entra na série e a parte original não trava nada', copia && !copia.serie && W.parteSaiu_(await L(p1)) && !W.parteFalhou_(await L(p1)), copia);
  chk('nenhuma linha apagada (só aditivo)', (await DB.prepare('SELECT COUNT(*) n FROM postagem').first()).n === totalAntes + 1);

  console.log('== Série parada (parte em erro sem WhatsApp) não segura ninguém ==');
  await limparFila();
  const s2 = 'serie-parada';
  const q1 = await nova('instagram', { serie: s2, parte: 1, partes: 2, status: 'erro', erro: 'O Instagram não aceitou a mídia.', agendado_em: iso(-60) });
  const q2 = await nova('instagram', { serie: s2, parte: 2, partes: 2, agendado_em: iso(-60) });
  const livre = await nova('instagram', { agendado_em: iso(-30) });
  await P();
  chk('outra postagem do Story sai mesmo com a série parada', (await L(livre)).status === 'publicado', await L(livre));
  chk('a parte seguinte fica parada com aviso claro (não sai fora de ordem)', (await L(q2)).status === 'agendado' && /Sequência parada/.test((await L(q2)).atencao), await L(q2));
  ({ j } = await A('GET', '/posts?limite=250'));
  chk('a tela recebe o aviso da parte parada', j.posts.find((q) => q.id === q2).atencao.includes('Sequência parada'));
  void q1;

  console.log('== "too many actions" = pausa global com backoff, sem erro ==');
  await limparFila();
  const t1 = await nova('instagram'); igErro = TOO_MANY; igPub = [];
  await P();
  let lt = await L(t1), est = JSON.parse(await cfgV('ig_pausa_estado'));
  chk('1ª vez: pausa de 15 min, postagem continua agendada (sem erro, sem gastar tentativa)', lt.status === 'agendado' && lt.tentativas === 0 && est.nivel === 1 && Math.abs(Date.parse(await cfgV('ig_pausa_ate')) - Date.now() - 15 * 60000) < 60000, [lt.status, lt.tentativas, est]);
  chk('motivo em português guardado', (await cfgV('ig_pausa_motivo')) === 'limite do Instagram' && /pausa do Instagram/.test(lt.erro));
  const chamadas = igCriar.length; await P();
  chk('durante a pausa o Instagram não é chamado', igCriar.length === chamadas && igPub.length === 0);
  const durs = [];
  for (let i = 0; i < 4; i++) { await passar(4); await cfg('ig_pausa_ate', iso(-1)); await P(); durs.push(Math.round((Date.parse(await cfgV('ig_pausa_ate')) - Date.now()) / 60000)); }
  chk('backoff crescente 30 → 60 → 120 min e para no máximo de 2 h', durs[0] === 30 && durs[1] === 60 && durs[2] === 120 && durs[3] === 120, durs);
  chk('mesmo depois de várias recusas, nada virou erro', (await L(t1)).status === 'agendado');
  igErro = null; await passar(4); await cfg('ig_pausa_ate', iso(-1)); await P();
  chk('pausa acabou: o Instagram retoma sozinho', (await L(t1)).status === 'publicado' && igPub.length === 1);
  est = JSON.parse(await cfgV('ig_pausa_estado'));
  chk('1 publicação ainda não zera o backoff', est.nivel === 4 && est.sucessos === 1, est);
  const t2 = await nova('instagram'); await passar(4); await P(); est = JSON.parse(await cfgV('ig_pausa_estado'));
  chk('2 publicações seguidas: volta ao normal', (await L(t2)).status === 'publicado' && est.nivel === 0, est);

  console.log('== Na pausa: WhatsApp sai, Instagram espera; Grupo e Status 2 normais ==');
  await limparFila();
  await cfg('ig_pausa_ate', iso(15)); await cfg('ig_pausa_motivo', 'limite do Instagram'); await cfg('ig_pausa_estado', JSON.stringify({ tipo: 'limite', nivel: 1, sucessos: 0 }));
  const amb = await nova('ambos'), soIg = await nova('instagram'), grp = await nova('grupo'), st2 = await nova('whatsapp2'), zap1 = await nova('whatsapp');
  wafPosts = []; grupoPosts = []; igPub = []; igCriar = [];
  await P();
  let la = await L(amb);
  chk('"ambos": WhatsApp sai no horário', la.zap_estado === 'confirmado' && wafPosts.filter((b) => b.requestId === 'tkpost-' + String(amb).padStart(12, '0')).length === 1, la);
  chk('"ambos": Instagram espera a pausa (agendado, não erro)', la.status === 'agendado' && /Aguardando a pausa do Instagram/.test(la.erro), la.erro);
  chk('só-Instagram espera sem virar erro', (await L(soIg)).status === 'agendado');
  chk('Grupo clientes e Status 2 e Status 1 saem normais', (await L(grp)).status === 'publicado' && (await L(st2)).status === 'publicado' && (await L(zap1)).status === 'publicado', [await L(grp), await L(st2)].map((q) => [q.status, q.erro]));
  chk('o Instagram não foi chamado', igCriar.length === 0 && igPub.length === 0);
  await P(); await P();
  chk('sem duplicar o WhatsApp do "ambos" nas passagens seguintes', wafPosts.filter((b) => b.requestId === 'tkpost-' + String(amb).padStart(12, '0')).length === 1);
  ({ j } = await A('GET', '/posts?limite=250'));
  const pa = j.posts.find((q) => q.id === amb);
  chk('tela: item "aguardando pausa do Instagram" com horário previsto', pa.esperaIg && pa.esperaIg.previsto && pa.status === 'agendado', pa.esperaIg);
  chk('tela: faixa de saúde "Instagram em pausa até … — WhatsApp seguindo normal"', /^Instagram em pausa até \d\d:\d\d \(limite do Instagram\) — WhatsApp seguindo normal$/.test(j.saude.geral) && j.saude.canais.status.texto === 'Seguindo normal' && j.saude.canais.grupo.texto === 'Normal', j.saude);
  chk('tela: gestor pode "Retomar Instagram agora"', j.saude.podeRetomarIg === true);
  x = await A('POST', '/post/ig-retomar', {}, 'tk2.gerente');
  chk('equipe sem Admin total não retoma (403, frase em português)', x.r.status === 403 && /gestor/.test(x.j.erro), x.j);
  x = await A('POST', '/post/ig-retomar', {});
  chk('gestor retoma: a pausa é limpa', x.j.ok === true && !(await cfgV('ig_pausa_ate')), x.j);
  await P(); await passar(4); await P();
  la = await L(amb);
  chk('depois da pausa o Instagram do "ambos" sai sozinho, sem repetir o WhatsApp', la.status === 'publicado' && (await L(soIg)).status === 'publicado' && wafPosts.filter((b) => b.requestId === 'tkpost-' + String(amb).padStart(12, '0')).length === 1, [la.status, (await L(soIg)).status]);

  console.log('== Série "ambos" na pausa: WhatsApp das partes segue, Stories saem depois na ordem ==');
  await limparFila();
  await cfg('ig_pausa_ate', iso(15)); await cfg('ig_pausa_motivo', 'limite do Instagram');
  const s3 = 'serie-pausa', r1 = await nova('ambos', { serie: s3, parte: 1, partes: 2 }), r2 = await nova('ambos', { serie: s3, parte: 2, partes: 2 });
  wafPosts = []; igPub = [];
  await P(); await P();
  chk('as duas partes saíram no WhatsApp durante a pausa', (await L(r1)).zap_estado === 'confirmado' && (await L(r2)).zap_estado === 'confirmado' && igPub.length === 0);
  await cfg('ig_pausa_ate', iso(-1));
  for (let i = 0; i < 4; i++) { await P(); await passar(4); }
  const c1 = JSON.parse((await L(r1)).containers || '{}').principal, c2 = JSON.parse((await L(r2)).containers || '{}').principal;
  chk('Stories publicados na ordem (parte 1 antes da parte 2)', (await L(r1)).status === 'publicado' && (await L(r2)).status === 'publicado' && igPub.indexOf(c1) === 0 && igPub.indexOf(c2) === 1, igPub);

  console.log('== Vigia: nenhuma série segura o canal por mais de 20 min ==');
  await limparFila();
  const s4 = 'serie-manual', v1 = await nova('instagram', { serie: s4, parte: 1, partes: 2, status: 'publicado', publicado_em: iso(-5), agendado_em: iso(-6) });
  const v2 = await nova('instagram', { serie: s4, parte: 2, partes: 2, modo: 'manual', status: 'manual_pendente', agendado_em: iso(-5) });
  const espera = await nova('instagram', { agendado_em: iso(-3) });
  await P();
  chk('dentro de 20 min a série ainda segura o Story (partes juntas)', (await L(espera)).status === 'agendado');
  await passar(25); await P();
  chk('passou de 20 min: a parte vai para "precisa de atenção" com o motivo', /Precisa de atenção.*aguardando a postagem manual/.test((await L(v2)).atencao), (await L(v2)).atencao);
  chk('…e a fila segue', (await L(espera)).status === 'publicado', await L(espera));
  chk('o motivo ficou registrado no histórico de eventos', JSON.parse(await cfgV('po_eventos')).some((e) => /Postagem \d+: Precisa de atenção/.test(e.texto)));
  void v1;

  console.log('== Token vencido: pausa + aviso, sem dezenas de erros ==');
  await limparFila();
  const tk = []; for (let i = 0; i < 6; i++) tk.push(await nova(i % 2 ? 'ambos' : 'instagram'));
  igErro = { status: 400, error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190, error_subcode: 463 } }; igPub = []; igCriar = []; wafPosts = [];
  await P(); await P();
  const lk = await Promise.all(tk.map(L));
  chk('nenhuma postagem virou erro', lk.every((q) => q.status === 'agendado'), lk.map((q) => q.status));
  chk('o Instagram foi chamado uma vez só (depois, pausa)', igCriar.length === 1, igCriar.length);
  chk('os "ambos" mandaram o WhatsApp mesmo assim', lk.filter((q) => q.canal === 'ambos').every((q) => q.zap_estado === 'confirmado'));
  ({ j } = await A('GET', '/posts?limite=250'));
  chk('aviso ao gestor na faixa de saúde', /vencido/.test(j.saude.avisoGestor) && j.saude.canais.instagram.estado === 'desconectado', j.saude);
  igErro = null; x = await A('POST', '/token', { token: TOKEN });
  chk('conectar o token de novo limpa a pausa e o aviso', x.j.ok === true && !(await cfgV('ig_pausa_ate')) && !(await cfgV('ig_aviso_gestor')), x.j);
  await DB.prepare("DELETE FROM cfg WHERE chave='ig_token'").run();
  const semTk = await nova('instagram'); await P();
  chk('sem token conectado: espera (não vira erro)', (await L(semTk)).status === 'agendado' && /desconectado/.test((await L(semTk)).erro), await L(semTk));
  await cfg('ig_token', TOKEN);

  console.log('== Instabilidade (HTTP 500) = espera curta limitada ==');
  await limparFila();
  const ins = await nova('instagram'); igErro = { status: 500, error: { message: 'Service temporarily unavailable', code: 2, is_transient: true } };
  await P(); let li = await L(ins);
  chk('500: volta para a fila, 1 tentativa, pausa curta de 5 min', li.status === 'agendado' && li.tentativas === 1 && JSON.parse(await cfgV('ig_pausa_estado')).tipo === 'instavel' && Math.round((Date.parse(await cfgV('ig_pausa_ate')) - Date.now()) / 60000) === 5, li);
  for (let i = 0; i < 6; i++) { await cfg('ig_pausa_ate', iso(-1)); await passar(4); await P(); }
  li = await L(ins);
  chk('tentativas limitadas: depois de 6, erro claro só desse item', li.status === 'erro' && li.tentativas === 6 && /instável/.test(li.erro) && !/[{}]/.test(li.erro), li);

  console.log('== "Enviando" preso há mais de 30 min = recuperação automática ==');
  await limparFila(); igPub = [];
  const pr = await nova('instagram', { status: 'processando', containers: JSON.stringify({ principal: 'C777' }), inicio_proc: iso(-40), atualizado_em: iso(-40) });
  const prg = await nova('grupo', { status: 'processando', inicio_proc: iso(-40), atualizado_em: iso(-40) });
  await DB.prepare("INSERT INTO postagem_grupo_recibo (postagem_id,ordem,estado,atualizado_em) VALUES (?,0,'enviando',?)").bind(prg, iso(-40)).run();
  grupoPosts = [];
  await P();
  chk('Instagram preso: recuperado e publicado aproveitando o container já criado', (await L(pr)).status === 'publicado' && igPub.includes('C777'), [await L(pr), igPub]);
  chk('Grupo preso: sai da fila com frase clara, sem reenviar', (await L(prg)).status === 'erro' && /mais de 30 min/.test((await L(prg)).erro) && grupoPosts.length === 0, await L(prg));

  console.log('== Espaço mínimo do Instagram, inclusive "Agora mesmo" ==');
  await limparFila(); igPub = [];
  const u1 = await nova('instagram', { urgente: 1 }), u2 = await nova('instagram', { urgente: 1 });
  await P(); await P();
  chk('dois urgentes: só um sai no mesmo instante (padrão 3 min)', igPub.length === 1 && (await L(u2)).status === 'agendado', igPub);
  await passar(2); await P();
  chk('com 2 min ainda espera', igPub.length === 1);
  await passar(2); await P();
  chk('depois de 3 min o segundo sai', igPub.length === 2 && (await L(u1)).status === 'publicado' && (await L(u2)).status === 'publicado');
  x = await A('POST', '/post/config', { config: { igGapMin: 99 } });
  chk('o gestor configura o espaço (limitado a 30 min)', x.j.ok && x.j.config.igGapMin === 30, x.j.config);
  x = await A('POST', '/post/config', { config: { igGapMin: 3 } });
  chk('padrão é 3 min', W.normalizarCfgPost({}).igGapMin === 3 && x.j.config.igGapMin === 3);

  console.log('== Mídia inválida = erro só daquele item ==');
  await limparFila();
  const mi = await nova('instagram'), ok2 = await nova('whatsapp');
  igErro = { status: 400, error: { message: 'Media download has failed', code: 9004, error_subcode: 2207052 } };
  await P();
  chk('mídia recusada: o item tenta de novo depois, sem pausa global', (await L(mi)).tentativas === 1 && !(await cfgV('ig_pausa_ate')) && (await L(ok2)).status === 'publicado');

  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length + (falhas.length ? ' ' + JSON.stringify(falhas) : ''));
  if (falhas.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
