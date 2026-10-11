// Testa instagram-worker/worker.js com D1 REAL (SQLite do Node), R2/KV/cache e Instagram FALSOS. Nada vai à Meta, à Cloudflare nem ao Google.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_worker.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '..', 'instagram-worker', 'worker.js')));
let ok = 0, falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 300) : '')); } };

function d1() {
  const db = new DatabaseSync(':memory:');
  const prep = (sql) => { const S = () => db.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, async all() { return { results: S().all(...args).map((x) => ({ ...x })) }; }, async first() { const r = S().get(...args); return r ? { ...r } : null; }, async run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }, _run() { S().run(...args); } }; return o; };
  return { prepare: prep, async batch(l) { db.exec('BEGIN'); try { for (const st of l) st._run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return []; }, _db: db };
}

(async () => {
  const W = await import(tmp), w = W.default;
  const cacheMem = new Map();
  globalThis.caches = { default: { async match(r) { const v = cacheMem.get(r.url); return v ? new Response(v) : undefined; }, async put(r, x) { cacheMem.set(r.url, await x.text()); } } };
  const objs = new Map(); const kv = new Map();
  const R2 = { async put(k, b) { objs.set(k, Buffer.from(b instanceof ReadableStream ? await new Response(b).arrayBuffer() : b)); }, async delete(k) { objs.delete(k); } };
  const KV = { async get(k, t) { const v = kv.get(k); return v === undefined ? null : (t === 'json' ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  const TOKEN = 'IGQVJ_TOKEN_INVENTADO_PARA_TESTE_1234567890';
  // ---- Instagram falso ----
  let paginas = null, feed = [], stories = [], midia404 = {}, tokenValido = true, chamadas = [];
  const cdn = (id, tipo) => 'https://cdn.fake/' + id + (tipo === 'VIDEO' ? '.mp4' : '.jpg');
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://api.fake')) { const b = JSON.parse(init.body); return new Response(JSON.stringify(b.sessao === 'tk2.admin' ? { ok: true, usuario: { permissoes: ['gerir_acessos', 'catalogo_cadastrar'] } } : b.sessao === 'tk2.gerente' ? { ok: true, usuario: { permissoes: ['catalogo_cadastrar'] } } : { ok: false })); }
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

  console.log('== Sugestões lidas da legenda ==');
  chk('preço "R$ 89,90"', W.precoDaLegenda('Vestido lindo R$ 89,90 à vista') === '89.90');
  chk('preço "$44,99" (como a loja escreve)', W.precoDaLegenda('P, M, G $44,99') === '44.99');
  chk('sem preço = vazio', W.precoDaLegenda('Novidade na loja!') === '');
  chk('tamanhos "P, M, G"', W.tamanhosDaLegenda('Tam: P, M, G $44,99') === 'P, M, G');
  chk('tamanhos "P/M/GG"', W.tamanhosDaLegenda('P/M/GG') === 'P, M, GG');
  chk('palavra com P/M/G dentro não vira tamanho', W.tamanhosDaLegenda('Pra moda GERAL') === '');
  chk('código TK-0007', W.codigoDaLegenda('veja o TK-0007 no site') === 'TK-0007' && W.codigoDaLegenda('sem código') === '');

  console.log('== Quem acessa ==');
  let r = await w.fetch(ped('GET', '/status', ''), env, {}); chk('sem sessão = 401', r.status === 401);
  r = await w.fetch(ped('GET', '/status', 'tk2.gerente'), env, {}); chk('gerente sem gerir_acessos = 403 (só Admin total)', r.status === 403);
  r = await w.fetch(new Request('https://ig.test/status', { method: 'OPTIONS', headers: { Origin: 'https://malvado.com' } }), env, {}); chk('origem de fora sem CORS', !r.headers.get('Access-Control-Allow-Origin'));
  let { j } = await A('GET', '/status'); chk('status admin ok, ainda sem conexão', j.ok && j.conectado === false && j.contagens.pendente === 0, j);
  let c = await W.ciclo(env, 'cron'); chk('sem token: nada acontece e avisa', c.ok === false && /não conectado/.test(c.erro));

  console.log('== Conectar o Instagram ==');
  tokenValido = false;
  ({ r, j } = await A('POST', '/token', { token: TOKEN })); chk('token recusado pelo Instagram não é guardado', r.status === 400 && !j.ok, j);
  chk('mensagem de erro não contém o token', !JSON.stringify(j).includes(TOKEN));
  ({ r, j } = await A('POST', '/token', { token: 'curto' })); chk('texto que não parece token = 400', r.status === 400);
  tokenValido = true;
  const antes = agoraIso();
  ({ r, j } = await A('POST', '/token', { token: TOKEN })); chk('token bom guardado, devolve só o @', j.ok && j.usuario === 'tenkitermodasceara' && !JSON.stringify(j).includes(TOKEN), j);
  ({ j } = await A('GET', '/status')); chk('status mostra conectado, vence em ~60 dias e NÃO devolve o token', j.conectado && j.venceEmDias >= 59 && !JSON.stringify(j).includes(TOKEN) && j.desde >= antes, j);

  console.log('== Captura: carrossel, reel, foto, story, duplicado, antigo ==');
  const m = (id, extra) => Object.assign({ id: id, caption: '', media_type: 'IMAGE', media_product_type: 'FEED', media_url: cdn(id, 'IMAGE'), permalink: 'https://instagram.com/p/' + id, timestamp: ts(1) }, extra);
  feed = [
    m('C1', { media_type: 'CAROUSEL_ALBUM', caption: 'Look novo! P, M, G $44,99', children: { data: [{ id: 'C1a', media_type: 'IMAGE', media_url: cdn('C1a', 'IMAGE') }, { id: 'C1b', media_type: 'IMAGE', media_url: cdn('C1b', 'IMAGE') }, { id: 'C1v', media_type: 'VIDEO', media_url: cdn('C1v', 'VIDEO'), thumbnail_url: cdn('C1vt', 'IMAGE') }] } }),
    m('R1', { media_type: 'VIDEO', media_product_type: 'REELS', media_url: cdn('R1', 'VIDEO'), thumbnail_url: cdn('R1t', 'IMAGE'), caption: 'Vestido R$ 129,90' }),
    m('F1', { caption: 'Conjunto lindo R$ 89,90 tam P/M/G' }),
    m('F2', { caption: 'Já no site: TK-0007 !' }),
    m('VELHO', { timestamp: '2020-01-01T00:00:00Z', caption: 'post antigo' })
  ];
  stories = [m('S1', { media_product_type: 'STORY', timestamp: ts(2) })];
  c = await W.ciclo(env, 'cron'); chk('ciclo ok e criou 5 rascunhos (carrossel, reel, 2 fotos, story)', c.ok && c.novas === 5, c);
  chk('post anterior à conexão foi ignorado (só dali em diante)', !(await DB.prepare("SELECT 1 AS x FROM ig_midia WHERE id='VELHO'").first()));
  ({ j } = await A('GET', '/rascunhos?grupo=pendente'));
  const porLeg = (txt) => j.rascunhos.find((x) => x.legenda.includes(txt));
  const car = porLeg('Look novo');
  chk('carrossel = 1 rascunho com as 3 mídias, na ordem', car && car.midias.length === 3 && car.midias.map((x) => x.tipo).join() === 'foto,foto,video' && car.midias[0].capa, car);
  chk('preço e tamanhos sugeridos a partir da legenda', car.precoSug === '44.99' && car.tamanhosSug === 'P, M, G', car);
  chk('mídia copiada para o R2 (URL do nosso Worker, nunca a do Instagram)', car.midias.every((x) => x.url.startsWith('https://tenkiter-midia.fake/m/')) && car.midias.every((x) => objs.has(x.url.replace('https://tenkiter-midia.fake/m/', ''))));
  const vid = car.midias[2], chaveV = vid.url.replace('https://tenkiter-midia.fake/m/', '');
  chk('vídeo tem miniatura com o MESMO nome em .jpg (padrão do Worker de mídia)', vid.mini === vid.url.replace(/\.mp4$/, '.jpg') && objs.has(chaveV.replace(/\.mp4$/, '.jpg')), vid);
  const reel = porLeg('Vestido R$ 129');
  chk('reel = 1 rascunho de vídeo com preço 129.90', reel && reel.origem === 'reel' && reel.midias.length === 1 && reel.midias[0].tipo === 'video' && reel.precoSug === '129.90');
  const foto = porLeg('Conjunto lindo');
  chk('foto única: origem feed, preço 89.90, tamanhos P, M, G', foto && foto.origem === 'feed' && foto.precoSug === '89.90' && foto.tamanhosSug === 'P, M, G', foto);
  chk('aparece no grupo Pendentes (não no duplicado)', !porLeg('TK-0007'));
  ({ j } = await A('GET', '/rascunhos?grupo=duplicado')); chk('legenda com TK-0007 = provável duplicado, com o código', j.rascunhos.length === 1 && j.rascunhos[0].codigoDup === 'TK-0007', j.rascunhos);
  ({ j } = await A('GET', '/rascunhos?grupo=sem_id')); chk('Story entra em "Sem identificação"', j.rascunhos.length === 1 && j.rascunhos[0].origem === 'story' && j.contagens.sem_id === 1, j.rascunhos);
  const uso = await KV.get('uso', 'json'); chk('contador de armazenamento (o mesmo do Worker de mídia) subiu', uso.arquivos === 9 && uso.bytes > 10000, uso);

  console.log('== Idempotência ==');
  const nObjs = objs.size;
  c = await W.ciclo(env, 'cron'); chk('rodar de novo não duplica nada', c.novas === 0 && objs.size === nObjs);
  const n1 = await DB.prepare('SELECT COUNT(*) AS n FROM rascunho').first(); chk('continuam 5 rascunhos', n1.n === 5);
  chk('token nunca aparece na URL gravada nem no D1 fora de cfg', !JSON.stringify(await DB.prepare('SELECT * FROM rascunho').all()).includes(TOKEN) && !JSON.stringify(await DB.prepare('SELECT * FROM exec_log').all()).includes(TOKEN));

  console.log('== Limite por ciclo, falha de cópia e armazenamento cheio ==');
  feed = []; for (let i = 0; i < 12; i++) feed.push(m('L' + i, { timestamp: ts(10 + i), caption: 'lote ' + i }));
  stories = [];
  c = await W.ciclo(env, 'cron'); chk('só 10 mídias por ciclo (limite de subrequisições)', c.novas === 10, c);
  c = await W.ciclo(env, 'cron'); chk('o resto sai no ciclo seguinte (nada se perde)', c.novas === 2, c);
  midia404.Q1b = true;
  feed = [m('Q1', { media_type: 'CAROUSEL_ALBUM', timestamp: ts(40), caption: 'quebra', children: { data: [{ id: 'Q1a', media_type: 'IMAGE', media_url: cdn('Q1a', 'IMAGE') }, { id: 'Q1b', media_type: 'IMAGE', media_url: cdn('Q1b', 'IMAGE') }] } })];
  const antesObjs = objs.size;
  c = await W.ciclo(env, 'cron'); chk('carrossel com mídia que falha não grava pela metade', c.ok === false && c.novas === 0 && !(await DB.prepare("SELECT 1 AS x FROM ig_midia WHERE id='Q1'").first()) && objs.size === antesObjs, { c, objs: objs.size, antesObjs });
  ({ j } = await A('GET', '/status')); chk('falha vira "falhas seguidas = 1" no status', j.falhasSeguidas === 1 && j.ultimoCiclo.erro.length > 0, j);
  midia404.Q1b = false;
  c = await W.ciclo(env, 'cron'); chk('na próxima rodada pega o carrossel inteiro', c.ok && c.novas === 1);
  ({ j } = await A('GET', '/status')); chk('sucesso zera as falhas', j.falhasSeguidas === 0);
  feed = [m('Z1', { timestamp: ts(50), caption: 'cheio' })];
  const cheio = Object.assign({}, env, { LIMITE_BYTES: '100' });
  c = await W.ciclo(cheio, 'cron'); chk('armazenamento no teto = recusa e avisa (sem cobrança)', c.ok === false && /armazenamento cheio/.test(c.erro) && !(await DB.prepare("SELECT 1 AS x FROM ig_midia WHERE id='Z1'").first()), c);
  tokenValido = false; for (let i = 0; i < 3; i++) await W.ciclo(env, 'cron'); tokenValido = true;
  ({ j } = await A('GET', '/status')); chk('3 falhas seguidas geram alerta na tela', j.alertas.some((a) => /\d+ vezes seguidas/.test(a)) && !JSON.stringify(j).includes(TOKEN), j.alertas);
  await W.ciclo(env, 'cron');

  console.log('== Buscar agora e histórico ==');
  feed = [m('H1', { timestamp: '2020-02-02T00:00:00Z', caption: 'histórico 1' }), m('H2', { timestamp: '2020-02-03T00:00:00Z', caption: 'histórico 2' })];
  ({ r, j } = await A('POST', '/buscar', { ultimos: 10 })); chk('"importar os últimos N" traz posts anteriores à conexão', j.ok && j.novas === 2, j);
  ({ r, j } = await A('POST', '/buscar', {})); chk('"Buscar agora" repetido em < 1 min = 429', r.status === 429);

  console.log('== Listas, filtros e paginação ==');
  ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=5')); chk('página de 5 com "mais"', j.rascunhos.length === 5 && j.mais === true);
  const ultimo = j.rascunhos[4].id; ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=5&antes=' + ultimo)); chk('próxima página continua de onde parou', j.rascunhos.every((x) => x.id < ultimo) && j.rascunhos.length > 0);
  ({ r } = await A('GET', '/rascunhos?grupo=qualquer')); chk('filtro inválido = 400', r.status === 400);

  console.log('== Ações do editor ==');
  ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=60')); const C = j.rascunhos.find((x) => x.legenda.includes('Look novo'));
  const [m1, m2, m3] = C.midias.map((x) => x.id);
  await A('POST', '/acao', { acao: 'capa', id: C.id, midia: m2 });
  ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=60')); let C2 = j.rascunhos.find((x) => x.id === C.id);
  chk('escolher a capa', C2.midias.find((x) => x.id === m2).capa && C2.midias.filter((x) => x.capa).length === 1);
  await A('POST', '/acao', { acao: 'ordem', id: C.id, midia: m3, delta: -1 });
  ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=60')); C2 = j.rascunhos.find((x) => x.id === C.id);
  chk('mover a mídia para cima (botão, sem arrastar)', C2.midias.map((x) => x.id).join() === [m1, m3, m2].join(), C2.midias.map((x) => x.id));
  ({ j } = await A('POST', '/acao', { acao: 'ordem', id: C.id, midia: m1, delta: -1 })); chk('mover a primeira para cima não quebra', j.ok);
  ({ j } = await A('POST', '/acao', { acao: 'separar', id: C.id, midias: [m3] })); const novoSep = j.novoId;
  chk('separar: 1 mídia vira produto novo', j.ok && novoSep > 0);
  ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=60'));
  chk('o de origem ficou com 2 e o novo com 1 (legenda copiada)', j.rascunhos.find((x) => x.id === C.id).midias.length === 2 && j.rascunhos.find((x) => x.id === novoSep).midias.length === 1 && j.rascunhos.find((x) => x.id === novoSep).legenda.includes('Look novo'));
  ({ r, j } = await A('POST', '/acao', { acao: 'separar', id: C.id, midias: [m1, m2] })); chk('não deixa tirar TODAS as mídias do produto', r.status === 400);
  ({ j } = await A('POST', '/acao', { acao: 'juntar', id: novoSep, para: C.id })); chk('juntar devolve a mídia ao produto', j.ok);
  ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=60')); C2 = j.rascunhos.find((x) => x.id === C.id);
  chk('depois de juntar: 3 mídias de novo e a capa continua uma só', C2.midias.length === 3 && C2.midias.filter((x) => x.capa).length === 1 && !j.rascunhos.find((x) => x.id === novoSep));
  ({ j } = await A('POST', '/acao', { acao: 'removerMidia', id: C.id, midia: m1 })); const avulso = j.novoId;
  ({ j } = await A('GET', '/rascunhos?grupo=sem_id')); chk('remover do produto leva a mídia para "Sem identificação" (nunca se perde)', j.rascunhos.some((x) => x.id === avulso && x.midias.length === 1 && x.midias[0].id === m1), j.rascunhos.map((x) => x.id));
  ({ j } = await A('POST', '/acao', { acao: 'mover', id: avulso, midia: m1, para: C.id }));
  ({ j } = await A('GET', '/rascunhos?grupo=sem_id')); chk('mover mídia para outro produto esvazia e descarta o rascunho avulso', !j.rascunhos.some((x) => x.id === avulso));
  ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=60')); chk('...e a mídia chegou no produto', j.rascunhos.find((x) => x.id === C.id).midias.length === 3);
  await A('POST', '/acao', { acao: 'descartar', id: C.id });
  ({ j } = await A('GET', '/rascunhos?grupo=descartado')); chk('descartar: vai para Descartados', j.rascunhos.some((x) => x.id === C.id));
  ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=60')); chk('...e sai da fila principal', !j.rascunhos.some((x) => x.id === C.id));
  await A('POST', '/acao', { acao: 'restaurar', id: C.id });
  ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=60')); chk('restaurar volta para Pendentes', j.rascunhos.some((x) => x.id === C.id));
  ({ j } = await A('POST', '/acao', { acao: 'grupo', id: C.id, grupo: 'nao_produto' })); ({ j } = await A('GET', '/rascunhos?grupo=nao_produto')); chk('"Não é produto" manda para o grupo próprio', j.rascunhos.some((x) => x.id === C.id));
  ({ r } = await A('POST', '/acao', { acao: 'grupo', id: C.id, grupo: 'hack' })); chk('grupo inválido = 400', r.status === 400);
  ({ r } = await A('POST', '/acao', { acao: 'descartar', id: 999999 })); chk('rascunho que não existe = 404', r.status === 404);
  ({ r } = await A('POST', '/acao', { acao: 'apagarTudo' })); chk('ação desconhecida = 400', r.status === 400);
  ({ j } = await A('POST', '/acao', { acao: 'aceitado', id: C.id, produtoId: '1790000000099' })); chk('aceitado guarda o id do produto criado', j.ok);
  ({ j } = await A('GET', '/rascunhos?grupo=aceito')); chk('aparece em Aceitos com produtoId e sai das filas', j.rascunhos.some((x) => x.id === C.id && x.produtoId === '1790000000099'));
  const st = await DB.prepare("SELECT status FROM ig_midia WHERE id=?").bind(m1).first(); chk('as mídias do aceito ficam "publicada" (não voltam à fila)', st.status === 'publicada');

  console.log('== Importar TODOS os posts ==');
  {
    const mk = (pref, n, t0) => Array.from({ length: n }, (_, k) => m(pref + k, { timestamp: '2019-0' + t0 + '-0' + (k % 9 + 1) + 'T00:00:00Z', caption: 'antigo ' + pref + k }));
    paginas = [mk('PA', 12, 1), mk('PB', 5, 2), mk('PC', 3, 3)];
    midia404['PC1'] = true;                                         // uma mídia quebrada não pode travar o resto
    await DB.prepare("INSERT OR REPLACE INTO cfg (chave, valor) VALUES ('ig_hist_trava', '1')").run(); kv.set('ig_hist_trava', '1');
    ({ r, j } = await A('POST', '/buscar', { todos: true })); chk('duas importações ao mesmo tempo = 429', r.status === 429, j);
    kv.delete('ig_hist_trava');
    let total = 0, puladas = 0, voltas = 0, fim = false;
    while (!fim && voltas < 40) { voltas++; ({ r, j } = await A('POST', '/buscar', { todos: true })); if (!j.ok) break; total += j.novas; puladas += j.puladas; fim = j.fim; }
    chk('importou o histórico em várias chamadas até o fim', fim === true && voltas > 1 && voltas < 40, { voltas, total, j });
    chk('trouxe todos os posts (menos o que tinha mídia quebrada)', total === 19 && puladas === 1, { total, puladas });
    const n = await DB.prepare("SELECT COUNT(*) AS n FROM rascunho WHERE legenda LIKE 'antigo P%'").first(); chk('cada post virou um rascunho (sem duplicar)', n.n === 19, n);
    ({ j } = await A('GET', '/status')); chk('status marca o histórico como completo', j.historico && j.historico.completo === true && j.historico.emAndamento === false, j.historico);
    chk('o token não aparece em nenhuma resposta', !JSON.stringify(j).includes(TOKEN));
    ({ j } = await A('POST', '/buscar', { todos: true })); chk('rodar de novo não duplica nada', j.ok && j.novas === 0 && j.fim === true, j);
    ({ j } = await A('POST', '/buscar', { todos: true, recomecar: true })); chk('"refazer" relê tudo e ainda não duplica', j.ok && j.novas === 0, j);
    const n2 = await DB.prepare("SELECT COUNT(*) AS n FROM rascunho WHERE legenda LIKE 'antigo P%'").first(); chk('continua 19 rascunhos', n2.n === 19, n2);
    // armazenamento cheio PARA a importação (não pula tudo)
    paginas = [mk('PD', 4, 4)]; midia404 = {};
    await DB.prepare("DELETE FROM cfg WHERE chave IN ('ig_hist_fim','ig_hist_depois')").run();
    const cheio2 = Object.assign({}, env, { LIMITE_BYTES: '100' });
    const rc = await W.ciclo(cheio2, 'historico', { todos: true }); chk('armazenamento cheio para a importação total com aviso', rc.ok === false && /armazenamento cheio/.test(rc.erro) && rc.puladas === 0, rc);
    paginas = null;
  }

  console.log('== Token ==');
  const exp = Number(String((await DB.prepare("SELECT valor FROM cfg WHERE chave='ig_token_exp'").first()).valor));
  await DB.prepare("UPDATE cfg SET valor=? WHERE chave='ig_token_exp'").bind(String(Date.now() + 5 * 86400000)).run();
  ({ j } = await A('GET', '/status')); chk('token a menos de 10 dias do fim gera alerta', j.alertas.some((a) => /vence em/.test(a)), j.alertas);
  feed = []; chamadas = []; await W.ciclo(env, 'cron'); chk('o ciclo renova o token sozinho antes de vencer', chamadas.some((u) => u.includes('refresh_access_token')));
  ({ j } = await A('GET', '/status')); chk('depois de renovar o alerta some', !j.alertas.some((a) => /vence em/.test(a)));
  ({ j } = await A('DELETE', '/token')); ({ j } = await A('GET', '/status')); chk('desconectar apaga o token', j.conectado === false);

  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length, falhas);
  process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE', e); process.exit(2); });
