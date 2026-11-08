// v7.49.0 — Fotos postadas e fotos novas: registro por foto postada (inclusive colagem/modelo), "Publicado sem confirmação" conta,
// erro/agendado/cancelado não; postagens antigas como legado; mapa público "peça → última foto nova" sem dados pessoais e com cache curto;
// foto nova x outra edição (preço/nome/estoque não mexe nas fotos), recorte de foto antiga não vira foto nova.
// D1 real (SQLite do Node); catálogo, sessão e KV FALSOS. Nada sai da máquina.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_fotos_postadas.mjs');
fs.writeFileSync(tmp, fs.readFileSync(process.env.TK_WORKER_SOURCE || path.join(__dirname, '..', 'instagram-worker', 'worker.js')) + '\nexport {fpVarrer_, estCatalogo_};');
let ok = 0; const falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 500) : '')); } };
function d1() {
  const db = new DatabaseSync(':memory:');
  const prep = (sql) => { const S = () => db.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, async all() { return { results: S().all(...args).map((x) => ({ ...x })) }; }, async first() { const r = S().get(...args); return r ? { ...r } : null; }, async run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }, _run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; };
  return { prepare: prep, async batch(l) { db.exec('BEGIN'); const out = []; try { for (const st of l) out.push(st._run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return out; } };
}
const F = (n) => 'https://res.cloudinary.com/z/image/upload/v1/' + n + '.jpg';
(async () => {
  const W = await import(tmp), w = W.default;
  const kv = new Map();
  const KV = { async get(k) { return kv.has(k) ? kv.get(k) : null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  globalThis.caches = { default: { async match() { return undefined; }, async put() {} } };
  const produtos = [
    { ID: '101', Nome: 'Vestido floral', Codigo: 'TK-0101', Foto_URL: F('a1'), Fotos_Galeria: '', Status: 'Ativo', Preco: 89.9 },
    { ID: '102', Nome: 'Blusa lisa', Codigo: 'TK-0102', Foto_URL: F('b1'), Fotos_Galeria: F('b2'), Status: 'Ativo', Preco: 49.9 },
    { ID: '103', Nome: 'Short jeans', Codigo: 'TK-0103', Foto_URL: F('c1'), Fotos_Galeria: '', Status: 'Ativo', Preco: 59.9 },
  ];
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://api.fake/')) {
      if (init && init.method === 'POST') return new Response(JSON.stringify({ ok: true, usuario: { nome: 'Pablo', whatsapp: '88999990001', permissoes: ['gerir_acessos', 'catalogo_cadastrar'], perfis: [] } }));
      if (u.includes('action=list')) return new Response(JSON.stringify({ ok: true, produtos }));
    }
    throw new Error('fetch inesperado: ' + u);
  };
  const DB = d1();
  const env = { DB, CACHE: KV, API_URL: 'https://api.fake/exec' };
  const esperas = [];
  const ctx = { waitUntil(p) { esperas.push(p); } };
  const A = async (m, rota, corpo) => { const r = await w.fetch(new Request('https://ig.fake' + rota, { method: m, headers: { 'Content-Type': 'application/json', Origin: 'https://tenkitermodas.com.br', 'X-TK-Whats': '88999990001', 'X-TK-Sessao': 'tk3.sessao' }, body: corpo ? JSON.stringify(corpo) : undefined }), env, ctx); return { r, j: await r.json() }; };
  const PUB = async () => { const r = await w.fetch(new Request('https://ig.fake/catalogo/fotos-novas', { headers: { Origin: 'https://tenkitermodas.com.br' } }), env, ctx); return { r, j: await r.json() }; };

  // ---- esquema: coluna nova aditiva, nada apagado ----
  await A('GET', '/posts');
  const cols = (await DB.prepare('PRAGMA table_info(postagem)').all()).results.map((c) => c.name);
  chk('coluna postagem.fotos_origem criada (aditiva)', cols.includes('fotos_origem'), cols);
  await DB.prepare("INSERT OR REPLACE INTO cfg (chave, valor) VALUES ('ig_token', 'TOKEN_FALSO_TESTE')").run();

  // ---- postagem nova com origem: feed com modelo (URL gerada nova) e colagem (2 fotos numa imagem) ----
  const gerada = 'https://tenkiter-midia.fake/m/202611/gerada1.jpg', colagem = 'https://tenkiter-midia.fake/m/202611/colagem1.jpg';
  const p1 = await A('POST', '/post', { tipo: 'feed', quando: 'sequencia', canal: 'instagram', produto: 'TK-0102', midias: [{ url: gerada, tipo: 'imagem' }], fotosOrigem: [{ u: F('b1'), p: '102' }, { u: 'javascript:alert(1)', p: 'x' }] });
  chk('POST /post aceita fotosOrigem e descarta endereço inválido', p1.j.ok, p1.j);
  const r1 = await DB.prepare('SELECT fotos_origem FROM postagem WHERE id=?').bind(p1.j.ids[0]).first();
  chk('a postagem guarda a foto ORIGINAL do catálogo (não a imagem gerada)', JSON.parse(r1.fotos_origem).length === 1 && JSON.parse(r1.fotos_origem)[0].u === F('b1'), r1);
  const p2 = await A('POST', '/post', { posts: [{ tipo: 'story', quando: 'sequencia', canal: 'whatsapp', produto: 'TK-0101', midias: [{ url: colagem, tipo: 'imagem' }], fotosOrigem: [{ u: F('a1'), p: '101' }, { u: F('c1'), p: '103' }] }] });
  chk('POST de Story com colagem (2 origens) aceito', p2.j.ok, p2.j);
  const p3 = await A('POST', '/post', { tipo: 'feed', quando: 'sequencia', canal: 'instagram', midias: [{ url: F('b2'), tipo: 'imagem' }], fotosOrigem: [{ u: F('b2'), p: '102' }] });
  const semOrigem = await A('POST', '/post', { tipo: 'feed', quando: 'sequencia', canal: 'instagram', midias: [{ url: 'https://tenkiter-midia.fake/m/x.jpg', tipo: 'imagem' }] });
  chk('postagem sem fotosOrigem continua funcionando (coluna vazia)', semOrigem.j.ok && (await DB.prepare('SELECT fotos_origem FROM postagem WHERE id=?').bind(semOrigem.j.ids[0]).first()).fotos_origem === '');

  let fp = await A('GET', '/post/fotos-postadas');
  chk('agendada não conta como postada', fp.j.ok && Object.keys(fp.j.porUrl).length === 0 && fp.j.legado.length === 0, fp.j);

  const T1 = '2026-10-29T15:00:00.000Z', T2 = '2026-11-02T12:00:00.000Z';
  await DB.prepare("UPDATE postagem SET status='publicado', publicado_em=? WHERE id=?").bind(T1, p1.j.ids[0]).run();
  await DB.prepare("UPDATE postagem SET status='publicado', publicado_em=?, zap_estado='sem_confirmacao' WHERE id=?").bind(T2, p2.j.ids[0]).run();
  await DB.prepare("UPDATE postagem SET status='erro', erro='falhou' WHERE id=?").bind(p3.j.ids[0]).run();
  fp = await A('GET', '/post/fotos-postadas');
  chk('publicado conta: foto b1 postada em T1 (mesmo com modelo/URL nova)', fp.j.porUrl[F('b1')] === T1, fp.j.porUrl);
  chk('"Publicado sem confirmação" conta e as DUAS fotos da colagem contam', fp.j.porUrl[F('a1')] === T2 && fp.j.porUrl[F('c1')] === T2, fp.j.porUrl);
  chk('erro não conta (b2 não aparece)', !(F('b2') in fp.j.porUrl), fp.j.porUrl);
  chk('imagem gerada/colagem não vira "foto postada" (só as originais)', !(gerada in fp.j.porUrl) && !(colagem in fp.j.porUrl));
  // ambos: Instagram com erro, WhatsApp confirmado = postada; cancelado não conta
  await DB.prepare("UPDATE postagem SET status='erro', zap_estado='confirmado', atualizado_em=? WHERE id=?").bind(T2, p3.j.ids[0]).run();
  fp = await A('GET', '/post/fotos-postadas');
  chk('"ambos" com WhatsApp confirmado conta mesmo com o Instagram em erro', fp.j.porUrl[F('b2')] === T2, fp.j.porUrl);
  await DB.prepare("UPDATE postagem SET status='cancelado', zap_estado='' WHERE id=?").bind(p3.j.ids[0]).run();
  fp = await A('GET', '/post/fotos-postadas');
  chk('cancelada não conta', !(F('b2') in fp.j.porUrl), fp.j.porUrl);
  // a mais recente vence
  await DB.prepare("UPDATE postagem SET status='publicado', publicado_em='2026-10-01T10:00:00.000Z', zap_estado='' WHERE id=?").bind(p3.j.ids[0]).run();
  await DB.prepare("UPDATE postagem SET fotos_origem=? WHERE id=?").bind(JSON.stringify([{ u: F('b1'), p: '102' }]), p3.j.ids[0]).run();
  fp = await A('GET', '/post/fotos-postadas');
  chk('com duas postagens da mesma foto, vale a mais recente', fp.j.porUrl[F('b1')] === T1, fp.j.porUrl);

  // ---- legado: postagem antiga sem fotos_origem ----
  await DB.prepare("INSERT INTO postagem (tipo, modo, legenda, midias, produto, agendado_em, status, publicado_em, canal) VALUES ('feed','auto','', ?, 'TK-0103', ?, 'publicado', ?, 'instagram')").bind(JSON.stringify([{ url: 'https://tenkiter-midia.fake/m/antiga-modelo.jpg', tipo: 'imagem' }, { url: 'https://x.fake/v.mp4', tipo: 'video' }]), T1, T1).run();
  fp = await A('GET', '/post/fotos-postadas');
  const leg = fp.j.legado.find((x) => x.c === 'TK-0103');
  chk('postagem antiga vira legado com código da peça e só as fotos (vídeo fora)', leg && leg.u.length === 1 && leg.em === T1, fp.j.legado);

  // ---- repostar leva fotos_origem junto ----
  await DB.prepare("UPDATE postagem SET status='erro' WHERE id=?").bind(semOrigem.j.ids[0]).run();
  await DB.prepare("UPDATE postagem SET fotos_origem=? WHERE id=?").bind(JSON.stringify([{ u: F('c1'), p: '103' }]), semOrigem.j.ids[0]).run();
  const rp = await A('POST', '/post/repostar', { id: semOrigem.j.ids[0], confirmarRisco: true });
  const copia = rp.j.ok ? await DB.prepare('SELECT fotos_origem, status FROM postagem WHERE id=?').bind(rp.j.id).first() : null;
  chk('"Repostar" copia as fotos de origem para a nova postagem', copia && JSON.parse(copia.fotos_origem)[0].u === F('c1'), [rp.j, copia]);

  // ---- fotos novas ----
  let pb = await PUB();
  chk('GET /catalogo/fotos-novas é pública e começa vazia', pb.r.status === 200 && pb.j.ok && Object.keys(pb.j.fotosNovas).length === 0, pb.j);
  chk('cache curto (público, 60 s) e CORS da loja', /public/.test(pb.r.headers.get('Cache-Control')) && /max-age=60/.test(pb.r.headers.get('Cache-Control')) && pb.r.headers.get('Access-Control-Allow-Origin') === 'https://tenkitermodas.com.br');
  await Promise.all(esperas.splice(0));
  const base = (await DB.prepare('SELECT COUNT(*) AS n, SUM(nova) AS s FROM foto_catalogo').first());
  chk('a primeira varredura (em segundo plano) só registra referência: nenhuma foto vira "nova"', base.n === 4 && !base.s, base);
  chk('POST na rota pública é recusado', (await w.fetch(new Request('https://ig.fake/catalogo/fotos-novas', { method: 'POST', body: '{}' }), env, ctx)).status === 405);

  // outra edição (preço, nome, estoque) não mexe nas fotos → nada novo
  produtos[0].Preco = 79.9; produtos[0].Nome = 'Vestido floral midi'; produtos[0].Estoque = 2;
  let v = await W.fpVarrer_(env, await W.estCatalogo_(env, true), '2026-11-03T09:00:00.000Z');
  chk('edição de preço/nome/estoque não conta como foto nova', v.novas === 0, v);
  // foto nova incluída na galeria
  produtos[0].Fotos_Galeria = F('a2');
  v = await W.fpVarrer_(env, await W.estCatalogo_(env, true), '2026-11-03T10:00:00.000Z');
  chk('foto incluída na galeria é detectada como foto nova', v.novas === 1, v);
  // peça nova (nunca vista) só vira referência
  produtos.push({ ID: '104', Nome: 'Saia', Codigo: 'TK-0104', Foto_URL: F('d1'), Fotos_Galeria: F('d2'), Status: 'Ativo' });
  v = await W.fpVarrer_(env, await W.estCatalogo_(env, true), '2026-11-03T10:05:00.000Z');
  chk('peça nova (já vai pelo cadastro) não ganha "foto nova"', v.novas === 0 && v.base === 2, v);
  // tirar uma foto ou reordenar não é foto nova
  produtos[1].Foto_URL = F('b2'); produtos[1].Fotos_Galeria = F('b1');
  v = await W.fpVarrer_(env, await W.estCatalogo_(env, true), '2026-11-03T10:06:00.000Z');
  chk('trocar a capa por outra foto que já existia não é foto nova', v.novas === 0, v);
  pb = await PUB();
  chk('mapa público: peça 101 com a data da última foto nova', pb.j.fotosNovas['101'] === '2026-11-03T10:00:00.000Z' && Object.keys(pb.j.fotosNovas).length === 1, pb.j);
  const txt = JSON.stringify(pb.j);
  chk('mapa público só tem id → data (sem URL, nome, telefone ou quem salvou)', !/https?:|88999|Pablo|Vestido/.test(txt) && Object.values(pb.j.fotosNovas).every((x) => /^\d{4}-\d\d-\d\dT/.test(x)), txt);

  // ---- Gestão avisa na hora (/esteira/toque): foto nova e recorte de foto antiga ----
  const tq = await A('POST', '/esteira/toque', { ids: ['103'], antes: [F('c1')], fotos: [{ url: F('c2') }, { url: F('c1-recorte'), de: F('c1') }] });
  chk('/esteira/toque com foto nova registra 1 foto nova (o recorte não conta)', tq.j.ok && tq.j.fotosNovas === 1, tq.j);
  pb = await PUB();
  chk('o mapa público já mostra a peça 103 (cache limpo na hora)', !!pb.j.fotosNovas['103'], pb.j);
  const tq2 = await A('POST', '/esteira/toque', { ids: ['102'] });
  chk('/esteira/toque sem fotos (preço, tamanho, estoque) não registra foto nova', tq2.j.ok && tq2.j.fotosNovas === 0, tq2.j);
  fp = await A('GET', '/post/fotos-postadas');
  chk('recorte de foto antiga aparece como derivada (herda "postada" da original)', fp.j.derivadas[F('c1-recorte')] === F('c1'), fp.j.derivadas);
  // a varredura depois do toque não duplica
  produtos[2].Fotos_Galeria = F('c2') + ',' + F('c1-recorte');
  v = await W.fpVarrer_(env, await W.estCatalogo_(env, true), '2026-11-03T11:00:00.000Z');
  chk('varredura depois do aviso da Gestão não conta de novo', v.novas === 0, v);

  // ---- sem sessão: a lista de postadas é protegida ----
  const ss = await w.fetch(new Request('https://ig.fake/post/fotos-postadas'), env, ctx);
  chk('GET /post/fotos-postadas exige sessão (401)', ss.status === 401);

  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length);
  if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
