// v7.84.0 — Teto real do Instagram (50 publicações por API a cada 24 h corridas). D1 real (SQLite do Node); Instagram e Wafly FALSOS.
// Reproduz o caso real de 19–20/11/2026: 16 pausas "limite do Instagram", todas com exatamente 50 publicadas nas 24 h anteriores,
// e a fila esperando às cegas (15 → 120 min). Cobre: teto 50 nas regras, ritmo do "Na sequência", espera da vaga EXATA sem chamar o
// Instagram, WhatsApp do "ambos" no horário, erro 2207042 com o código guardado e a previsão mostrada antes de postar.
// Nada sai da máquina e nenhuma credencial real é lida.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_teto_instagram.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '..', 'instagram-worker', 'worker.js')));
let ok = 0; const falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 600) : '')); } };
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
  let wafPosts = [], igPub = [], igCriar = [], seqC = 0, igErro = null, cotaFake = { usado: 0, total: 50 }, cotaChamadas = 0;
  globalThis.fetch = async (u, init) => {
    u = String(u); const metodo = (init && init.method) || 'GET';
    if (u.startsWith('https://api.fake')) return new Response(JSON.stringify({ ok: true, usuario: { permissoes: ['gerir_acessos', 'catalogo_cadastrar'], nome: 'Gestor' } }));
    if (u.startsWith('https://tenkiter-midia.fake/')) return new Response(Buffer.alloc(900, 7), { headers: { 'content-type': 'image/jpeg' } });
    if (u.startsWith('https://wafly.com.br/api-bridge-whats/')) {
      const body = init && init.body ? JSON.parse(init.body) : null;
      if (metodo === 'GET') return new Response(JSON.stringify(u.includes('/requests/') ? { state: 'accepted', serverAcknowledged: true } : { supported: true, connected: true, contactsReady: true }));
      wafPosts.push(body); return new Response(JSON.stringify({ state: 'accepted' }));
    }
    if (u.startsWith('https://ig.fake')) {
      if (u.includes('/refresh_access_token')) return new Response(JSON.stringify({ access_token: TOKEN, expires_in: 5184000 }));
      if (u.includes('/me/content_publishing_limit')) { cotaChamadas++; return new Response(JSON.stringify({ data: [{ quota_usage: cotaFake.usado, config: { quota_total: cotaFake.total, quota_duration: 86400 } }] })); }
      const corpo = init && init.body ? new URLSearchParams(String(init.body)) : null;
      if (metodo === 'POST' && u.endsWith('/me/media')) { igCriar.push(Date.now()); return new Response(JSON.stringify({ id: 'C' + (++seqC) })); }
      if (metodo === 'POST' && u.endsWith('/me/media_publish')) {
        if (igErro) return new Response(JSON.stringify({ error: igErro.error }), { status: igErro.status || 400 });
        igPub.push(corpo.get('creation_id')); return new Response(JSON.stringify({ id: 'M' + igPub.length }));
      }
      if (u.includes('?fields=status_code')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
      if (u.includes('?fields=permalink')) return new Response(JSON.stringify({ permalink: 'https://www.instagram.com/p/FAKE/' }));
      if (u.includes('/me?fields=id,username')) return new Response(JSON.stringify({ id: '1', username: 'tenkiter' }));
    }
    throw new Error('fetch inesperado: ' + u);
  };
  const DB = d1();
  const env = { DB, MIDIA: R2, CACHE: KV, API_URL: 'https://api.fake/exec', MIDIA_URL: 'https://tenkiter-midia.fake', IG_BASE: 'https://ig.fake/v23.0' };
  const ped = (m, p, corpo) => new Request('https://ig.test' + p, { method: m, headers: { Origin: 'https://tenkitermodas.com.br', 'X-TK-Whats': '88999990000', 'X-TK-Sessao': 'tk2.admin', 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const A = async (m, p, corpo) => { const r = await w.fetch(ped(m, p, corpo), env, {}); return { r, j: await r.json() }; };
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
  const passar = async (min) => {
    const ms = min * 60000, rs = (await DB.prepare('SELECT id,agendado_em,publicado_em,zap_desde,zap_consulta,inicio_proc,atualizado_em FROM postagem').all()).results;
    for (const r of rs) { const s = (v) => v && isFinite(Date.parse(v)) ? new Date(Date.parse(v) - ms).toISOString() : v; await DB.prepare('UPDATE postagem SET agendado_em=?,publicado_em=?,zap_desde=?,zap_consulta=?,inicio_proc=?,atualizado_em=? WHERE id=?').bind(s(r.agendado_em), s(r.publicado_em), s(r.zap_desde), s(r.zap_consulta), s(r.inicio_proc), s(r.atualizado_em), r.id).run(); }
    const u = Number(await cfgV('ig_ultima_ms')) || 0; if (u) await cfg('ig_ultima_ms', u - ms);
    const pa = await cfgV('ig_pausa_ate'); if (pa) await cfg('ig_pausa_ate', new Date(Date.parse(pa) - ms).toISOString());
  };
  /** `n` Stories já publicados no Instagram: o mais antigo `maisAntigoMin` minutos atrás, o mais novo 30 min atrás. */
  const publicadas = async (n, maisAntigoMin) => {
    for (let i = 0; i < n; i++) { const m = -maisAntigoMin + i * ((maisAntigoMin - 30) / Math.max(1, n - 1)); await nova('instagram', { status: 'publicado', publicado_em: iso(m), agendado_em: iso(m), ig_id: 'M-antigo-' + i }); }
  };
  const zerar = async () => { await DB.prepare('DELETE FROM postagem').run(); for (const k of ['ig_pausa_ate', 'ig_pausa_motivo', 'ig_pausa_estado', 'ig_ultima_ms', 'ig_cota_real', 'po_eventos']) await cfg(k, null); igErro = null; wafPosts = []; igPub = []; igCriar = []; cotaChamadas = 0; };
  await P();                                                                                      // cria o esquema
  await cfg('wafly_1', JSON.stringify({ instance: 'INST_TESTE_001', token: 'TOKEN_TESTE_AAA111', clientToken: 'CLIENT_TESTE_BBB222' }));
  await cfg('wafly_2', JSON.stringify({ instance: 'INST_TESTE_002', token: 'TOKEN_TESTE_CCC333', clientToken: 'CLIENT_TESTE_DDD444' }));
  await cfg('ig_token', TOKEN); await cfg('ig_token_exp', String(Date.now() + 50 * 86400000));

  console.log('== Regras: teto real 50 e ritmo do "Na sequência" ==');
  const N = W.normalizarCfgPost;
  const prod = N({ pausaAtiva: true, pausaDe: '22:00', pausaAte: '06:30', max24h: 100, canais: { story: { max24h: 90, gapMin: 120, gapMax: 1200 }, status: { max24h: 90, gapMin: 120, gapMax: 1200 }, reels: { max24h: 20, gapMin: 300, gapMax: 1200 } } });
  chk('a regra gravada em produção (Instagram 100, Story 90) vira 50 e 50; WhatsApp continua 90', prod.max24h === 50 && prod.canais.story.max24h === 50 && prod.canais.status.max24h === 90 && prod.canais.reels.max24h === 20, prod);
  chk('padrão sem configuração: teto 50', N(null).max24h === 50);
  chk('horas ativas: 06:30–22:00 = 930 min; sem pausa = 1440 min', W.minutosAtivosDia_(true, '22:00', '06:30') === 930 && W.minutosAtivosDia_(false, '22:00', '06:30') === 1440 && W.minutosAtivosDia_(true, '01:00', '05:00') === 1200);
  chk('ritmo: 50 em 930 min = 1116 s (~19 min) entre publicações do Instagram', W.ritmoIgSeg_(true, '22:00', '06:30', 50) === 1116);
  const rit = W.cfgRitmoIg_(prod);
  chk('"Na sequência": o sorteio médio do Story fica >= 19 min e o WhatsApp não muda', (rit.canais.story.gapMin + rit.canais.story.gapMax) / 2 >= 1116 && rit.canais.story.gapMin >= 890 && rit.canais.status.gapMin === 120 && rit.canais.status.gapMax === 1200, rit.canais);
  chk('as regras salvas não são alteradas pelo ritmo (só a cópia usada no "Na sequência")', prod.canais.story.gapMin === 120);
  const cheio = W.cfgRitmoIg_(N({ pausaAtiva: true, canais: { story: { gapMin: 1800, gapMax: 3600 } } }));
  chk('quem já configurou intervalo maior que o ritmo continua com o dele', cheio.canais.story.gapMin === 1800 && cheio.canais.story.gapMax === 3600);
  const fila50 = Array.from({ length: 50 }, (_, i) => Date.parse('2026-11-20T12:00:00Z') + i * 18 * 60000);   // 50 publicadas a partir das 09:00 de Fortaleza
  const prev = W.preverCotaIg_(N({ pausaAtiva: false }), 50, fila50, [Date.parse('2026-11-21T03:00:00Z'), Date.parse('2026-11-21T03:00:00Z')]);
  chk('previsão pura: com 50 nas 24 h, a 1ª nova sai 1 min depois da mais antiga completar 24 h; a 2ª, depois da 2ª mais antiga', prev[0] === fila50[0] + 86400000 + 60000 && prev[1] === fila50[1] + 86400000 + 60000, prev.map((t) => new Date(t).toISOString()));
  const prevPausa = W.preverCotaIg_(N({ pausaAtiva: true, pausaDe: '22:00', pausaAte: '06:30' }), 50, fila50.map((t) => t - 4 * 3600000), [Date.parse('2026-11-21T01:00:00Z')]);
  chk('previsão pura: vaga que abre na madrugada passa para o fim da pausa (06:30)', new Date(prevPausa[0]).toISOString() === '2026-11-21T09:30:00.000Z', new Date(prevPausa[0]).toISOString());

  console.log('== Caso real: 50 publicadas nas 24 h, chega a 51ª ==');
  await zerar();
  await cfg('po_cfg', JSON.stringify({ pausaAtiva: false, max24h: 100, canais: { story: { max24h: 90, gapMin: 120, gapMax: 120 }, status: { max24h: 90, gapMin: 120, gapMax: 120 } } }));
  await publicadas(50, 24 * 60 - 10);                                                              // a mais antiga completa 24 h daqui a 10 min
  cotaFake = { usado: 50, total: 50 };
  const amb = await nova('ambos', { origem_midia: 'bloco-1' }), stAmb = await nova('whatsapp2', { origem_midia: 'bloco-1' }), soIg = await nova('instagram', { agendado_em: iso(-0.5) });
  await P();
  let la = await L(amb), ls = await L(soIg);
  chk('nenhuma chamada de publicação ao Instagram sem vaga (antes: recusa e pausa às cegas)', igCriar.length === 0 && igPub.length === 0, [igCriar.length, igPub.length]);
  chk('a cota oficial foi conferida (perto do teto)', cotaChamadas >= 1 && JSON.parse(await cfgV('ig_cota_real')).total === 50);
  chk('bloco: sem vaga no Instagram, o WhatsApp do "ambos" NÃO sai separado', !la.zap_estado && wafPosts.length === 0, [la.zap_estado, wafPosts.length]);
  chk('bloco: o Status 2 da mesma mídia também espera, dizendo que sai junto', (await L(stAmb)).status === 'agendado' && /sair junto/.test((await L(stAmb)).erro), await L(stAmb));
  chk('o "ambos" espera a vaga com a hora certa, sem virar erro', la.status === 'agendado' && /Aguardando vaga no limite do Instagram \(50/.test(la.erro) && /próxima vaga por volta das/.test(la.erro) && /saem juntos/.test(la.erro), la.erro);
  chk('só-Instagram fica agendado, sem erro e sem pausa global', ls.status === 'agendado' && !(await cfgV('ig_pausa_ate')), [ls.status, await cfgV('ig_pausa_ate')]);
  let { j } = await A('GET', '/posts?limite=250');
  chk('a tela recebe a cota do Instagram (50 de 50 e quando abre a vaga) e o ritmo', j.cotaIg && j.cotaIg.usadas === 50 && j.cotaIg.limite === 50 && !!j.cotaIg.liberaEm && j.cotaIg.ritmoMin === 29, j.cotaIg);
  await passar(12); cotaFake = { usado: 49, total: 50 }; await cfg('ig_cota_real', null);
  await P();
  la = await L(amb);
  chk('a vaga abriu (a mais antiga completou 24 h): sai UMA publicação no Instagram, a mais antiga da fila', igPub.length === 1 && la.status === 'publicado' && (await L(soIg)).status === 'agendado', [igPub.length, la.status, (await L(soIg)).status]);
  chk('bloco: o "ambos" saiu inteiro (Instagram + WhatsApp uma vez) e o Status 2 da mesma mídia junto', la.zap_estado && wafPosts.filter((b) => String(b.requestId || '').startsWith('tkpost-' + String(amb).padStart(12, '0'))).length === 1 && (await L(stAmb)).status === 'publicado', [la.zap_estado, wafPosts.length, (await L(stAmb)).status]);

  console.log('== Ao criar: o bloco já entra no horário da vaga, todos os destinos juntos ==');
  await zerar(); await cfg('po_cfg', JSON.stringify({ pausaAtiva: false }));
  await publicadas(50, 24 * 60 - 30); cotaFake = { usado: 50, total: 50 };                      // a mais antiga completa 24 h daqui a 30 min
  let cr = await A('POST', '/post', { posts: [{ tipo: 'story', canal: 'ambos', status2: true, midias: JSON.parse(midia), quando: 'agora' }] });
  const linhasBloco = (await DB.prepare("SELECT canal, agendado_em FROM postagem WHERE status='agendado'").all()).results;
  chk('“Agora mesmo” sem vaga: o bloco vai para a vaga (~31 min), não fica para o Instagram recusar', cr.j.ok && Math.abs(Date.parse(cr.j.quandos[0]) - (Date.now() + 31 * 60000)) < 90000 && cr.j.ajustes.some((a) => a.motivo === 'teto_instagram'), [cr.j.quandos, cr.j.ajustes]);
  chk('todos os destinos da mídia (Instagram+Status 1 e Status 2) no MESMO horário', linhasBloco.length === 2 && linhasBloco[0].agendado_em === linhasBloco[1].agendado_em, linhasBloco);

  console.log('== Instagram recusa com 2207042 (teto): espera exata e código guardado ==');
  await zerar();
  await cfg('po_cfg', JSON.stringify({ pausaAtiva: false, canais: { story: { max24h: 90, gapMin: 120, gapMax: 120 } } }));
  await publicadas(49, 24 * 60 - 40);                                                              // 49 nossas; outro aplicativo usou a 50ª
  cotaFake = { usado: 49, total: 50 };                                                             // a cota conferida ainda mostra vaga
  igErro = { status: 400, error: { message: 'The maximum number of posts were published', type: 'OAuthException', code: 9, error_subcode: 2207042 } };
  const r1 = await nova('instagram');
  await P();
  const est = JSON.parse((await cfgV('ig_pausa_estado')) || '{}'), ate = Date.parse(await cfgV('ig_pausa_ate'));
  chk('vira espera do teto (tipo "cota"), não pausa de 15 min às cegas, e não sobe o nível do backoff', est.tipo === 'cota' && est.nivel === 0, est);
  chk('a espera termina 1 min depois da publicação mais antiga completar 24 h (~41 min), não 15 → 120 min', Math.abs(ate - (Date.now() + 41 * 60000)) < 90000, Math.round((ate - Date.now()) / 60000));
  chk('a postagem continua agendada, sem gastar tentativa', (await L(r1)).status === 'agendado' && (await L(r1)).tentativas === 0);
  const ev = JSON.parse(await cfgV('po_eventos'))[0].texto;
  chk('o registro guarda o código e o texto originais do Instagram', /código 9\/2207042/.test(ev) && /maximum number of posts/.test(ev) && /teto de publicações do Instagram/.test(ev), ev);
  await zerar(); await cfg('po_cfg', JSON.stringify({ pausaAtiva: false }));
  igErro = { status: 400, error: { message: 'User is performing too many actions', type: 'OAuthException', code: 2, error_subcode: 2207051 } };
  await nova('instagram'); await P();
  chk('bloqueio anti-spam de verdade (2207051, longe do teto) continua com a espera crescente de 15 min', JSON.parse(await cfgV('ig_pausa_estado')).tipo === 'limite' && Math.abs(Date.parse(await cfgV('ig_pausa_ate')) - Date.now() - 15 * 60000) < 60000);

  console.log('== Aviso antes de postar ==');
  await zerar(); await cfg('po_cfg', JSON.stringify({ pausaAtiva: false }));
  ({ j } = await A('POST', '/post/previsao-ig', { n: 5, tipo: 'story', canal: 'ambos', quando: 'sequencia' }));
  chk('com vaga: sem problema e com os horários previstos', j.ok && j.aplica && j.problema === false && j.teto === 50 && j.usados === 0 && /cabem/.test(j.frase) && j.solucoes.length === 0, j);
  await publicadas(48, 24 * 60 - 60); cotaFake = { usado: 48, total: 50 };
  ({ j } = await A('POST', '/post/previsao-ig', { n: 5, tipo: 'story', canal: 'ambos', quando: 'sequencia' }));
  chk('perto do teto: avisa quantas vão esperar e até quando', j.problema === true && j.atrasadas >= 3 && j.cabemSemAtraso === 2 && /vão esperar vaga/.test(j.frase) && /Já saíram 48/.test(j.frase), j);
  chk('dá soluções: seguir (todos os destinos juntos), só WhatsApp e escolher menos', ['seguir', 'whatsapp', 'menos'].every((s) => j.solucoes.some((x) => x.id === s)) && /todos os destinos juntos/.test(j.solucoes[0].texto) && /Nenhum destino sai separado/.test(j.solucoes[0].texto), j.solucoes);
  ({ j } = await A('POST', '/post/previsao-ig', { n: 5, tipo: 'story', canal: 'whatsapp', quando: 'sequencia' }));
  chk('só WhatsApp: o teto do Instagram não se aplica', j.ok && j.aplica === false);
  const antes = (await DB.prepare('SELECT COUNT(*) n FROM postagem').first()).n;
  chk('a previsão não cria nada na fila', antes === 48);

  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length, falhas);
  process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
