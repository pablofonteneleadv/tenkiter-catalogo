// Família de produtos (v7.44.0): rotas /familias e /familias/* com D1 REAL (SQLite do Node), catálogo e sessão FALSOS. Nada vai ao Google nem à Cloudflare.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_familias.mjs');
fs.writeFileSync(tmp, fs.readFileSync(process.env.TK_WORKER_SOURCE || path.join(__dirname, '..', 'instagram-worker', 'worker.js')) + '\nexport {famSepararNome_, famPesoRotulo_};');
let ok = 0; const falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 400) : '')); } };
function d1() {
  const db = new DatabaseSync(':memory:');
  const prep = (sql) => { const S = () => db.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, async all() { return { results: S().all(...args).map((x) => ({ ...x })) }; }, async first() { const r = S().get(...args); return r ? { ...r } : null; }, async run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }, _run() { const r = S().run(...args); return { meta: { changes: r.changes } }; } }; return o; };
  return { prepare: prep, async batch(l) { db.exec('BEGIN'); const out = []; try { for (const st of l) out.push(st._run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return out; } };
}
(async () => {
  const W = await import(tmp), w = W.default;
  const cacheMem = new Map();
  globalThis.caches = { default: { async match(r) { const v = cacheMem.get(r.url); return v ? new Response(v) : undefined; }, async put(r, x) { cacheMem.set(r.url, await x.text()); } } };
  const kv = new Map();
  const KV = { async get(k) { return kv.has(k) ? kv.get(k) : null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };

  // ---- separação do tamanho no nome (vários padrões da loja) ----
  const sep = W.famSepararNome_;
  const casos = [
    ['Sunga infantil masculino P', 'sunga infantil masculino', 'P'],
    ['Sunga Infantil Masculino GG', 'sunga infantil masculino', 'GG'],
    ['Conjunto bebê 6 meses', 'conjunto bebe', '6 meses'],
    ['Conjunto Bebe 9 Meses', 'conjunto bebe', '9 meses'],
    ['Vestido festa 4 anos', 'vestido festa', '4 anos'],
    ['Vestido Festa - 10 anos', 'vestido festa', '10 anos'],
    ['Body manga longa RN', 'body manga longa', 'RN'],
    ['Calça jeans 38', 'calca jeans', '38'],
    ['Calça Jeans Tam 40', 'calca jeans', '40'],
    ['Short tactel Nº 12', 'short tactel', '12'],
    ['Pijama G1', 'pijama', 'G1'],
    ['Pijama EXG', 'pijama', 'EXG'],
    ['Boné Único', 'bone', 'Único'],
    ['Bone unico', 'bone', 'Único'],
    ['Camiseta básica (M)', 'camiseta basica', 'M'],
    ['Saia midi 2', 'saia midi', '2'],
  ];
  casos.forEach(([nome, base, rot]) => { const r = sep(nome); chk('nome "' + nome + '" → base "' + base + '" + "' + rot + '"', r.base === base && r.rotulo === rot, r); });
  chk('número fora das faixas (ex.: "Kit 3 peças 20") não vira tamanho', sep('Kit 20').rotulo === '' && sep('Vestido 2024').rotulo === '', [sep('Kit 20'), sep('Vestido 2024')]);
  chk('nome sem tamanho fica inteiro', sep('Vestido longo floral').rotulo === '' && sep('P').rotulo === '');
  chk('nome base original preserva acento e caixa', sep('Conjunto Bebê 6 meses').baseOriginal === 'Conjunto Bebê');
  const ordem = ['G', 'RN', '4 anos', 'P', '6 meses', 'M', 'GG', '2 anos', 'PP'].sort((a, b) => W.famPesoRotulo_(a) - W.famPesoRotulo_(b));
  chk('ordem dos rótulos: RN, meses, anos, depois PP…GG', ordem.join(',') === 'RN,6 meses,2 anos,4 anos,PP,P,M,G,GG', ordem);

  // ---- catálogo falso ----
  const produtos = [
    { ID: '10', Nome: 'Sunga infantil masculino P', Codigo: 'SU-P', Foto_URL: 'https://fotos.fake/su-p.jpg', Status: 'Ativo' },
    { ID: '11', Nome: 'Sunga infantil masculino M', Codigo: 'SU-M', Foto_URL: 'https://fotos.fake/su-m.jpg', Status: 'Ativo' },
    { ID: '12', Nome: 'Sunga Infantil Masculino G', Codigo: 'SU-G', Foto_URL: 'https://fotos.fake/su-g.jpg', Status: 'Ativo' },
    { ID: '20', Nome: 'Vestido festa 2 anos', Status: 'Ativo' },
    { ID: '21', Nome: 'Vestido festa 4 anos', Status: 'Ativo' },
    { ID: '22', Nome: 'Vestido Festa - 6 anos', Status: 'Ativo' },
    { ID: '30', Nome: 'Calça jeans 38', Status: 'Ativo' },
    { ID: '31', Nome: 'Calça Jeans Tam 40', Status: 'Ativo' },
    { ID: '40', Nome: 'Body RN', Status: 'Ativo' },
    { ID: '41', Nome: 'Body 3 meses', Status: 'Inativo' },
    { ID: '50', Nome: 'Blusa única peça', Status: 'Ativo' },
    { ID: '60', Nome: 'Short tactel Nº 10', Status: 'Ativo' },
    { ID: '61', Nome: 'Short tactel nº 12', Status: 'Ativo' },
  ];
  const usuarios = { '88999990001': { nome: 'Pablo', permissoes: ['gerir_acessos'] }, '88999990002': { nome: 'Iara', permissoes: ['catalogo_cadastrar'] }, '88999990004': { nome: 'Visitante', permissoes: ['catalogo_ver'] } };
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://api.fake/')) {
      if (init && init.method === 'POST') { const b = JSON.parse(init.body); if (b.action === 'sessao') { const x = usuarios[b.whatsapp]; return new Response(JSON.stringify(x ? { ok: true, usuario: { ...x, perfis: [] } } : { ok: false })); } }
      if (u.includes('action=list')) return new Response(JSON.stringify({ ok: true, produtos }));
    }
    return new Response('{}', { status: 404 });
  };
  const env = { DB: d1(), CACHE: KV, API_URL: 'https://api.fake/exec' };
  const ctx = { waitUntil() {} };
  const A = async (whats, metodo, rota, corpo) => { const r = await w.fetch(new Request('https://ig.fake' + rota, { method: metodo, headers: { 'Content-Type': 'application/json', 'Origin': 'https://tenkitermodas.com.br', 'X-TK-Whats': whats, 'X-TK-Sessao': 'tk3.sessao-' + whats }, body: corpo ? JSON.stringify(corpo) : undefined }), env, ctx); return { r, j: await r.json() }; };
  const PUB = async () => { const r = await w.fetch(new Request('https://ig.fake/familias', { headers: { Origin: 'https://tenkitermodas.com.br' } }), env, ctx); return { r, j: await r.json() }; };
  const PABLO = '88999990001', IARA = '88999990002', VISITA = '88999990004';

  // ---- pública ----
  let pb = await PUB();
  chk('GET /familias é pública: responde sem sessão, lista vazia', pb.r.status === 200 && pb.j.ok && Array.isArray(pb.j.familias) && pb.j.familias.length === 0, pb.j);
  chk('GET /familias tem cache curto (público, 60 s)', /public/.test(pb.r.headers.get('Cache-Control') || '') && /max-age=60/.test(pb.r.headers.get('Cache-Control') || ''));
  chk('GET /familias manda CORS para a origem da loja', pb.r.headers.get('Access-Control-Allow-Origin') === 'https://tenkitermodas.com.br', [...pb.r.headers]);
  const post = await w.fetch(new Request('https://ig.fake/familias', { method: 'POST', body: '{}' }), env, ctx);
  chk('POST em /familias (pública) é recusado', post.status === 405);

  // ---- permissões ----
  chk('sem sessão: ligar é recusado (401)', (await w.fetch(new Request('https://ig.fake/familias/ligar', { method: 'POST', body: '{}' }), env, ctx)).status === 401);
  const vv = await A(VISITA, 'POST', '/familias/ligar', { produtos: ['10', '11'] });
  chk('conta sem catalogo_cadastrar nem gerir_acessos recebe 403 em português', vv.r.status === 403 && /permissão/.test(vv.j.erro), vv.j);
  chk('sem sessão: sugestões é recusado', (await w.fetch(new Request('https://ig.fake/familias/sugestoes'), env, ctx)).status === 401);

  // ---- sugestões ----
  let sg = await A(IARA, 'GET', '/familias/sugestoes');
  const chaves = (sg.j.sugestoes || []).map((g) => g.chave + ':' + g.membros.map((m) => m.rotulo).join('/'));
  chk('sugestões agrupam por nome sem o tamanho (acento/caixa ignorados)', sg.j.ok && chaves.includes('sunga infantil masculino:P/M/G') && chaves.includes('vestido festa:2 anos/4 anos/6 anos') && chaves.includes('calca jeans:38/40') && chaves.includes('short tactel:10/12'), chaves);
  chk('sugestão não forma grupo de 1 nem inclui inativa', !chaves.some((c) => c.startsWith('body')) && !chaves.some((c) => c.startsWith('blusa')), chaves);
  chk('sugestão traz foto e nome de cada membro', sg.j.sugestoes[0].membros.every((m) => 'foto' in m && m.nome), sg.j.sugestoes[0]);

  // ---- ligar ----
  const lg0 = await A(IARA, 'POST', '/familias/ligar', { produtos: ['10'] });
  chk('ligar com uma peça só é recusado', lg0.r.status === 400 && /duas/.test(lg0.j.erro));
  const lg = await A(IARA, 'POST', '/familias/ligar', { produtos: ['12', '10', '11'] });
  chk('ligar cria a família com nome base e rótulos na ordem P, M, G', lg.j.ok && lg.j.criada && lg.j.familia.nome === 'Sunga infantil masculino' && lg.j.familia.membros.map((m) => m.produto + m.rotulo).join() === '10P,11M,12G', lg.j);
  const fid = lg.j.familia.id;
  pb = await PUB();
  chk('pública mostra a família nova logo depois (cache limpo)', pb.j.familias.length === 1 && pb.j.familias[0].id === fid && pb.j.familias[0].membros.length === 3, pb.j);
  const txt = JSON.stringify(pb.j);
  chk('pública não expõe quem criou nem quando', !/criada_por|criada_em|88999990002/.test(txt), txt);
  chk('pública: cada membro só tem produto, rótulo e ordem', pb.j.familias[0].membros.every((m) => Object.keys(m).sort().join() === 'ordem,produto,rotulo'));
  sg = await A(IARA, 'GET', '/familias/sugestoes');
  chk('família ligada some das sugestões', !(sg.j.sugestoes || []).some((g) => g.chave === 'sunga infantil masculino'));

  const lv = await A(PABLO, 'POST', '/familias/ligar', { produtos: ['20', '21', '22'], nome: 'Vestido de festa infantil', rotulos: { 20: '2 anos', 21: '4 anos', 22: '6 anos' } });
  chk('ligar com nome escolhido e rótulos conferidos', lv.j.ok && lv.j.familia.nome === 'Vestido de festa infantil' && lv.j.familia.membros.map((m) => m.rotulo).join() === '2 anos,4 anos,6 anos', lv.j);
  const conflito = await A(IARA, 'POST', '/familias/ligar', { produtos: ['10', '20'] });
  chk('juntar peças de famílias diferentes é recusado (409) com aviso claro', conflito.r.status === 409 && /famílias diferentes/.test(conflito.j.erro), conflito.j);

  // "+ Novo tamanho": a peça nova (GG) entra na família da original com o rótulo informado
  const novo = await A(IARA, 'POST', '/familias/ligar', { produtos: ['11', '99'], rotulos: { 99: 'GG' } });
  chk('ligar peça nova a uma peça que já tem família usa a mesma família', novo.j.ok && novo.j.criada === false && novo.j.familia.id === fid && novo.j.familia.membros.map((m) => m.rotulo).join() === 'P,M,G,GG', novo.j);

  // ---- membro ----
  const mb = await A(IARA, 'POST', '/familias/membro', { produto: '98', familia: fid, rotulo: 'PP' });
  chk('membro sem ordem entra no lugar do tamanho (PP antes de P)', mb.j.ok && mb.j.familia.membros[0].produto === '98' && mb.j.familia.membros.map((m) => m.rotulo).join() === 'PP,P,M,G,GG', mb.j);
  const mb2 = await A(IARA, 'POST', '/familias/membro', { produto: '98', familia: fid, rotulo: 'XPP', ordem: 9 });
  chk('membro com ordem e rótulo novos é atualizado', mb2.j.ok && mb2.j.familia.membros.at(-1).produto === '98' && mb2.j.familia.membros.at(-1).rotulo === 'XPP', mb2.j);
  chk('membro em família inexistente: 404', (await A(IARA, 'POST', '/familias/membro', { produto: '50', familia: 'fnaoexiste', rotulo: 'P' })).r.status === 404);
  chk('membro de outra família: 409', (await A(IARA, 'POST', '/familias/membro', { produto: '20', familia: fid, rotulo: 'P' })).r.status === 409);
  chk('membro sem peça: 400', (await A(IARA, 'POST', '/familias/membro', { familia: fid })).r.status === 400);

  // ---- desligar ----
  const dl = await A(IARA, 'POST', '/familias/desligar', { produto: '98' });
  chk('tirar da família mantém as outras peças ligadas', dl.j.ok && !dl.j.dissolvida && dl.j.familia.membros.length === 4 && dl.j.familia.membros.map((m) => m.ordem).join() === '0,1,2,3', dl.j);
  chk('tirar peça que não está em família não dá erro', (await A(IARA, 'POST', '/familias/desligar', { produto: '50' })).j.jaEstava === true);
  await A(PABLO, 'POST', '/familias/ligar', { produtos: ['30', '31'] });
  const dl2 = await A(PABLO, 'POST', '/familias/desligar', { produto: '30' });
  chk('família que fica com uma peça só é desfeita', dl2.j.ok && dl2.j.dissolvida === true, dl2.j);
  pb = await PUB();
  chk('pública reflete o desligar', pb.j.familias.length === 2 && !pb.j.familias.some((f) => f.membros.some((m) => m.produto === '31' || m.produto === '98')), pb.j);

  // ---- ignorar sugestão ----
  sg = await A(IARA, 'GET', '/familias/sugestoes');
  chk('calça volta a ser sugerida depois de desfeita', (sg.j.sugestoes || []).some((g) => g.chave === 'calca jeans'));
  await A(IARA, 'POST', '/familias/ignorar', { chave: 'calca jeans' });
  sg = await A(IARA, 'GET', '/familias/sugestoes');
  chk('"Ignorar" tira a sugestão para toda a equipe', !(sg.j.sugestoes || []).some((g) => g.chave === 'calca jeans') && (sg.j.sugestoes || []).some((g) => g.chave === 'short tactel'), sg.j.sugestoes);
  chk('rota desconhecida responde 404 em português', /não existe/.test((await A(IARA, 'GET', '/familias/xyz')).j.erro));

  // ---- erro do D1 vira mensagem legível ----
  const envRuim = { DB: { prepare() { throw new Error('D1 fora'); }, batch() { throw new Error('D1 fora'); } }, CACHE: { async get() { return null; }, async put() {}, async delete() {} }, API_URL: 'https://api.fake/exec' };
  const rr = await w.fetch(new Request('https://ig.fake/familias'), envRuim, ctx); const jr = await rr.json();
  chk('pública com D1 fora: 503 com texto em português, sem detalhe técnico', rr.status === 503 && /não responderam/.test(jr.erro) && !/D1/.test(jr.erro), jr);

  console.log('\n' + ok + ' ok, ' + falhas.length + ' falha(s)');
  if (falhas.length) { console.log('Falhas:\n - ' + falhas.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
