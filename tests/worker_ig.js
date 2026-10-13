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
  const R2 = { async get(k) { const v = objs.get(k); return v ? { async arrayBuffer() { return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength); } } : null; }, async put(k, b) { objs.set(k, Buffer.from(b instanceof ReadableStream ? await new Response(b).arrayBuffer() : b)); }, async delete(k) { objs.delete(k); }, async list(o) { const pr = (o && o.prefix) || ''; return { objects: [...objs.keys()].filter((k) => k.startsWith(pr)).map((k) => ({ key: k, size: objs.get(k).length, uploaded: (tempDatas.get(k) || new Date()) })), truncated: false }; } };
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
  chk('preço da legenda é o À VISTA (44,99 → 45,00): cheio 50,00 no catálogo; tamanhos sugeridos', car.precoSug === '50.00' && car.precoFoto === '45.00' && car.tamanhosSug === 'P, M, G', car);
  chk('mídia copiada para o R2 (URL do nosso Worker, nunca a do Instagram)', car.midias.every((x) => x.url.startsWith('https://tenkiter-midia.fake/m/')) && car.midias.every((x) => objs.has(x.url.replace('https://tenkiter-midia.fake/m/', ''))));
  const vid = car.midias[2], chaveV = vid.url.replace('https://tenkiter-midia.fake/m/', '');
  chk('vídeo tem miniatura com o MESMO nome em .jpg (padrão do Worker de mídia)', vid.mini === vid.url.replace(/\.mp4$/, '.jpg') && objs.has(chaveV.replace(/\.mp4$/, '.jpg')), vid);
  const reel = porLeg('Vestido R$ 129');
  chk('reel = 1 rascunho de vídeo com preço escrito 129,90 = cheio 144,33', reel && reel.origem === 'reel' && reel.midias.length === 1 && reel.midias[0].tipo === 'video' && reel.precoSug === '144.33' && reel.precoFoto === '129.90');
  const foto = porLeg('Conjunto lindo');
  chk('foto única: origem feed, preço escrito 89,90 = cheio 99,89, tamanhos P, M, G', foto && foto.origem === 'feed' && foto.precoSug === '99.89' && foto.precoFoto === '89.90' && foto.tamanhosSug === 'P, M, G', foto);
  chk('aparece no grupo Pendentes (não no duplicado)', !porLeg('TK-0007'));
  ({ j } = await A('GET', '/rascunhos?grupo=duplicado')); chk('legenda com TK-0007 = provável duplicado, com o código', j.rascunhos.length === 1 && j.rascunhos[0].codigoDup === 'TK-0007', j.rascunhos);
  ({ j } = await A('GET', '/rascunhos?grupo=sem_id')); chk('Story entra em "Sem identificação"', j.rascunhos.length === 1 && j.rascunhos[0].origem === 'story' && j.contagens.sem_id === 1, j.rascunhos);
  const uso = await KV.get('uso', 'json'); chk('contador de armazenamento (o mesmo do Worker de mídia) subiu', uso.arquivos === 9 && uso.bytes > 10000, uso);

  console.log('== Idempotência ==');
  const nObjs = objs.size;
  c = await W.ciclo(env, 'cron'); chk('rodar de novo não duplica nada', c.novas === 0 && objs.size === nObjs);
  const n1 = await DB.prepare('SELECT COUNT(*) AS n FROM rascunho').first(); chk('continuam 5 rascunhos', n1.n === 5);
  chk('token nunca aparece na URL gravada nem no D1 fora de cfg', !JSON.stringify(await DB.prepare('SELECT * FROM rascunho').all()).includes(TOKEN) && !JSON.stringify(await DB.prepare('SELECT * FROM exec_log').all()).includes(TOKEN));

  console.log('== Stories ==');
  {
    const desdeAntigo = await DB.prepare("SELECT valor FROM cfg WHERE chave='ig_desde'").first();
    const velho = new Date(new Date(desdeAntigo.valor).getTime() - 3 * 3600000).toISOString();
    feed = []; stories = [m('SV1', { media_product_type: 'STORY', timestamp: velho })];
    c = await W.ciclo(env, 'cron'); chk('Story no ar postado ANTES da conexão também entra (Story ignora o "desde")', c.novas === 1, c);
    ({ j } = await A('GET', '/rascunhos?grupo=sem_id')); chk('Story vai para "Sem identificação" com origem story', j.rascunhos.some((x) => x.origem === 'story'), j.rascunhos.map((x) => x.origem));
    ({ j } = await A('GET', '/status')); chk('status mostra quantos Stories estão no ar e nenhum aviso', j.stories && j.stories.no_ar === 1 && !j.stories.erro && !j.alertas.some((a) => /Stories/.test(a)), j.stories);
    stories = [m('SV2', { media_product_type: 'STORY', timestamp: ts(1) })];
    c = await W.ciclo(env, 'historico', { todos: true }); chk('importação total também traz os Stories no ar', c.ok && await DB.prepare("SELECT 1 AS x FROM ig_midia WHERE pai_id='SV2'").first(), c);
    const orig = globalThis.fetch; globalThis.fetch = async (u, i) => (String(u).includes('/me/stories') ? new Response(JSON.stringify({ error: { message: '(#10) Application does not have permission' } }), { status: 400 }) : orig(u, i));
    stories = []; feed = []; c = await W.ciclo(env, 'cron'); globalThis.fetch = orig;
    ({ j } = await A('GET', '/status')); chk('erro ao ler Stories vira aviso no painel (não fica em silêncio) e o ciclo segue ok', c.ok && j.alertas.some((a) => /Stories.*permission/.test(a)), j.alertas);
    chk('o aviso não vaza o token', !JSON.stringify(j).includes(TOKEN));
    c = await W.ciclo(env, 'cron'); ({ j } = await A('GET', '/status')); chk('voltando a funcionar o aviso some', !j.alertas.some((a) => /Stories/.test(a)));
  }

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
  const ultimo = j.rascunhos[4].id; ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=5&antes=' + ultimo)); chk('próxima página continua de onde parou', j.rascunhos.length > 0);
  {
    /* ordem = data/hora do POST (mais recente primeiro), não a ordem de importação; vale também entre páginas */
    const todos = (await DB.prepare("SELECT id FROM rascunho WHERE status='pendente' AND grupo IN ('pendente','sem_id') ORDER BY id").all()).results;
    for (let i = 0; i < todos.length; i++) await DB.prepare('UPDATE rascunho SET publicado_em=? WHERE id=?').bind('2026-09-' + String(10 + ((i * 7) % 15)).padStart(2, '0') + 'T1' + (i % 10) + ':00:00+0000', todos[i].id).run();
    const dh = (x) => String(x.publicadoEm).slice(0, 19);
    let tudo = [], antes2 = 0;
    for (let n = 0; n < 20; n++) { ({ j } = await A('GET', '/rascunhos?grupo=pendente&limite=3' + (antes2 ? '&antes=' + antes2 : ''))); tudo = tudo.concat(j.rascunhos); if (!j.mais) break; antes2 = j.rascunhos[j.rascunhos.length - 1].id; }
    chk('lista em ordem de data/hora do post, mais recente primeiro, atravessando páginas', tudo.length === todos.length && tudo.every((x, i) => i === 0 || dh(tudo[i - 1]) >= dh(x)) && new Set(tudo.map((x) => x.id)).size === tudo.length, tudo.map(dh));
  }
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

  console.log('== IA lê as fotos do post ==');
  {
    const P = W.precoDasFotos;
    chk('69,99 nas fotos = 70,00 à vista = 77,78 cheio (o site mostra 70,00)', JSON.stringify(P('69,99')) === JSON.stringify({ avista: '70.00', cheio: '77.78' }), P('69,99'));
    chk('59,99 → 60,00 → 66,67', P(59.99).avista === '60.00' && P(59.99).cheio === '66.67', P(59.99));
    chk('90 → 100,00 (sem sobra de ponto flutuante)', P('90').cheio === '100.00', P('90'));
    chk('89,90 não é ",99": fica 89,90 → 99,89', P('89,90').avista === '89.90' && P('89,90').cheio === '99.89', P('89,90'));
    chk('R$ 100 → 111,11 (à vista mostra 100,00 mesmo)', P('R$ 100').cheio === '111.11');
    {   // de R$ 1,00 a R$ 3.000,00: o que o site MOSTRA à vista (cheio × 0,90, 2 casas) é exatamente o preço escrito
      let ruins = 0; for (let c = 100; c <= 300000; c++) { if (c % 100 === 99) continue; const n = (c / 100).toFixed(2), q = P(n), f = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (f(Number(q.cheio) * (1 - 0.10)) !== f(n)) ruins++; }
      chk('296.902 preços de R$ 1 a R$ 3.000: o à vista exibido é SEMPRE igual ao escrito', ruins === 0, ruins);
    }
    chk('lixo / zero / negativo / enorme = sem preço', P('abc') === null && P(0) === null && P(-5) === null && P(9999999) === null && P(null) === null);
    chk('à vista × 0,90 do preço cheio nunca fica abaixo do que está na foto', [19.99, 29.99, 49.99, 69.99, 89.9, 120, 33.33].every((v) => { const q = P(v); return Math.round(Number(q.cheio) * 0.9 * 100) / 100 >= Number(q.avista) - 0.0001; }));

    let r2, j2;
    feed = [m('IA1', { timestamp: ts(5), caption: 'Arraste para o lado 👉', children: undefined })];
    await W.ciclo(env, 'cron');
    const rIA = await DB.prepare("SELECT id FROM rascunho WHERE legenda LIKE 'Arraste para o lado%'").first();
    ({ r: r2, j: j2 } = await A('GET', '/status')); chk('sem chave: status diz IA desligada', j2.ia && j2.ia.ligada === false, j2.ia);
    let pr = await W.analisarPendentes(env, 3); chk('sem chave nada é lido e ninguém quebra', pr.semChave === true && gemChamadas.length === 0, pr);
    ({ r: r2, j: j2 } = await A('POST', '/ia-chave', { chave: 'curta' })); chk('chave com formato estranho = 400 sem falar com o Google', r2.status === 400 && gemChamadas.length === 0, j2);
    ({ r: r2, j: j2 } = await A('POST', '/ia-chave', { chave: 'AIzaRECUSADA_PELO_GOOGLE_1234567890' })); chk('Google recusa a chave = frase clara e NÃO guarda', r2.status === 400 && /recusou/.test(j2.erro) && !(await DB.prepare("SELECT 1 AS x FROM cfg WHERE chave='gemini_key'").first()), j2);
    ({ r: r2, j: j2 } = await A('POST', '/ia-chave', { chave: GEMINI_OK })); chk('chave boa é guardada (resposta só tem os 4 últimos)', j2.ok && j2.fim === GEMINI_OK.slice(-4) && !JSON.stringify(j2).includes(GEMINI_OK), j2);
    ({ r: r2, j: j2 } = await A('GET', '/status')); chk('status: IA ligada, com pendentes, sem a chave', j2.ia.ligada === true && j2.ia.pendentes >= 1 && !JSON.stringify(j2).includes(GEMINI_OK), j2.ia);

    gemTexto = JSON.stringify({ produto: true, nome: 'Vestido Alfaiataria Premium Vermelho', preco: 69.99, generos: ['feminino adulto', 'Inexistente'], categorias: ['Vestido', 'Coisa que não existe'], cores: ['Vermelho'], tamanhos: ['p', 'm'], descricao: 'Vestido curto com babado na barra.' });
    ({ r: r2, j: j2 } = await A('POST', '/ia', { limite: 3 })); chk('POST /ia lê os pendentes', j2.ok && j2.feitas >= 1, j2);
    const ult = gemChamadas[gemChamadas.length - 1];
    chk('a chave vai no cabeçalho, nunca na URL', ult.headers.get('x-goog-api-key') === GEMINI_OK && !ult.url.includes(GEMINI_OK), ult.url);
    chk('foto vai como imagem pronta e o pedido fala em ler o texto da imagem e em NÃO inventar preço', ult.body.contents[0].parts.some((x) => x.inline_data && x.inline_data.data) && /ESCRITO nas imagens/.test(ult.body.contents[0].parts[0].text) && /NUNCA invente/.test(ult.body.contents[0].parts[0].text));
    chk('o pedido leva só as categorias e gêneros da loja', /Vestido/.test(ult.body.contents[0].parts[0].text) && /Feminino Adulto/.test(ult.body.contents[0].parts[0].text));
    ({ j: j2 } = await A('GET', '/rascunhos?grupo=pendente&limite=60'));
    const L = j2.rascunhos.find((x) => x.id === rIA.id);
    chk('rascunho ficou com nome, cores e descrição da IA', L.iaStatus === 'ok' && L.ia.nome === 'Vestido Alfaiataria Premium Vermelho' && L.ia.cores[0] === 'Vermelho' && /babado/.test(L.ia.descricao), L);
    chk('categoria/gênero fora das listas da loja são descartados (e o resto casa sem diferenciar maiúscula)', JSON.stringify(L.ia.categorias) === '["Vestido"]' && JSON.stringify(L.ia.generos) === '["Feminino Adulto"]', L.ia);
    chk('preço: 69,99 na foto → 70,00 à vista → 77,78 sugerido', L.precoFoto === '70.00' && L.precoSug === '77.78', [L.precoFoto, L.precoSug]);
    chk('tamanhos lidos entram quando a legenda não tinha', L.tamanhosSug === 'P, M', L.tamanhosSug);
    chk('a chave não aparece em nenhuma lista', !JSON.stringify(j2).includes(GEMINI_OK));
    const gt = gemTexto; gemTexto = JSON.stringify({ produto: true, nome: 'OUTRO NOME', preco: null, generos: [], categorias: [], cores: [], tamanhos: [], descricao: '' });
    await A('POST', '/ia', { limite: 3 }); const lido = await DB.prepare('SELECT ia_json FROM rascunho WHERE id=?').bind(rIA.id).first(); gemTexto = gt;
    chk('post já lido não é lido (nem cobrado) de novo', JSON.parse(lido.ia_json).nome === 'Vestido Alfaiataria Premium Vermelho', lido);

    // limite de uso (429) não conta como erro do post
    feed = [m('IA2', { timestamp: ts(6), caption: 'segundo' })]; await W.ciclo(env, 'cron');
    gemModo = '429'; ({ j: j2 } = await A('POST', '/ia', { limite: 3 }));
    chk('429: devolve "espera" e segue sem marcar erro definitivo', j2.espera === true && j2.feitas === 0, j2);
    const e429 = await DB.prepare("SELECT ia_status, ia_tent FROM rascunho WHERE legenda='segundo'").first(); chk('429 não gasta tentativa', e429.ia_tent === 0, e429);
    chk('o texto do erro não vaza a chave', !JSON.stringify(j2).includes(GEMINI_OK));
    // cota de UM modelo acabou: troca para o próximo e lembra qual esgotou
    await env.CACHE.delete('ia_esgotados'); feed = [m('IA2B', { timestamp: ts(6), caption: 'cota um' })]; await W.ciclo(env, 'cron');
    gemModo = 'cota1'; let c0 = gemChamadas.length; ({ j: j2 } = await A('POST', '/ia', { limite: 1 }));
    const usadas = gemChamadas.slice(c0).map((x) => (/models\/([^:]+):/.exec(x.url) || [])[1]);
    chk('cota do 1º modelo acabou: usa o próximo e leu o post', j2.feitas === 1 && usadas[0] === 'gemini-3.5-flash' && usadas[1] === 'gemini-3.7-flash', { j2, usadas });
    feed = [m('IA2C', { timestamp: ts(6), caption: 'cota dois' })]; await W.ciclo(env, 'cron'); c0 = gemChamadas.length; await A('POST', '/ia', { limite: 1 });
    const usadas2 = gemChamadas.slice(c0).map((x) => (/models\/([^:]+):/.exec(x.url) || [])[1]);
    chk('modelo esgotado fica de molho: nem é chamado de novo', usadas2.length >= 1 && !usadas2.includes('gemini-3.5-flash') && usadas2[0] === 'gemini-3.7-flash', usadas2);
    await env.CACHE.delete('ia_esgotados');
    gemModo = 'lixo'; for (let i = 0; i < 3; i++) await A('POST', '/ia', { limite: 1 });
    const e2 = await DB.prepare("SELECT ia_status, ia_tent FROM rascunho WHERE legenda='segundo'").first(); chk('resposta ilegível: tenta até 2 vezes e desiste (sem laço infinito)', e2.ia_status === 'erro' && e2.ia_tent === 2, e2);
    gemModo = 'ok';

    // cron lê sozinho depois de buscar
    feed = [m('IA3', { timestamp: ts(7), caption: 'terceiro' })]; const n0 = gemChamadas.length;
    await W.default.scheduled({}, env, { waitUntil: (p) => p });
    await new Promise((ok) => setTimeout(ok, 50));
    chk('o cron lê as fotos dos posts novos sozinho', gemChamadas.length > n0, gemChamadas.length - n0);

    // juntar / separar pedem nova leitura
    feed = []; const a = await DB.prepare("SELECT id FROM rascunho WHERE legenda='terceiro'").first(), b2 = await DB.prepare("SELECT id FROM rascunho WHERE legenda='Arraste para o lado 👉'").first();
    await A('POST', '/acao', { acao: 'juntar', id: a.id, para: b2.id });
    const jj = await DB.prepare('SELECT ia_status FROM rascunho WHERE id=?').bind(b2.id).first(); chk('juntar manda ler as fotos de novo (agora são mais fotos)', jj.ia_status === '', jj);
    ({ r: r2, j: j2 } = await A('POST', '/acao', { acao: 'lerIA', id: b2.id })); chk('"ler as fotos de novo" funciona', j2.ok === true, j2);
    ({ r: r2, j: j2 } = await A('DELETE', '/ia-chave')); ({ j: j2 } = await A('GET', '/status')); chk('desligar apaga a chave', j2.ia.ligada === false);
  }

  console.log('== POSTAGENS (publicar no Instagram) ==');
  {
    // o token foi apagado no fim da seção anterior? Aqui ele ainda existe (a seção "Token" vem depois)
    const IMG = (n) => ({ url: 'https://tenkiter-midia.fake/m/202610/img' + n + '.jpg', tipo: 'imagem' }), VID = { url: 'https://tenkiter-midia.fake/m/202610/v1.mp4', tipo: 'video' };
    const G = async (m, pth, corpo) => { const r = await w.fetch(ped(m, pth, 'tk2.gerente', corpo), env, {}); return { r, j: await r.json() }; };
    const rodar = async (n) => { for (let i = 0; i < (n || 1); i++) await W.processarPostagens(env); };
    const linha = (id) => DB.prepare('SELECT * FROM postagem WHERE id=?').bind(id).first();
    let x;
    // ---- quem pode
    r = await w.fetch(ped('GET', '/posts', ''), env, {}); chk('postagens: sem sessão = 401', r.status === 401);
    x = await G('GET', '/posts'); chk('equipe que cadastra (catalogo_cadastrar) vê a fila de postagens', x.r.status === 200 && x.j.ok === true && x.j.conectado === true, x.j);
    x = await G('GET', '/status'); chk('mas continua SEM acesso ao importador/token (só Admin total)', x.r.status === 403);
    r = await w.fetch(ped('GET', '/posts', 'tk2.outro'), env, {}); chk('sessão sem nenhuma das duas permissões = 401', r.status === 401);
    // ---- validação
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(1), IMG(2)] }); chk('feed com 2 fotos é recusado com frase', x.r.status === 400 && /exatamente 1 foto/.test(x.j.erro), x.j);
    x = await G('POST', '/post', { tipo: 'carrossel', midias: [IMG(1)] }); chk('carrossel com 1 foto é recusado', x.r.status === 400 && /2 a 10/.test(x.j.erro));
    x = await G('POST', '/post', { tipo: 'carrossel', midias: Array.from({ length: 11 }, (_, i) => IMG(i)) }); chk('carrossel com 11 é recusado (máx. 10)', x.r.status === 400);
    x = await G('POST', '/post', { tipo: 'reels', midias: [IMG(1)] }); chk('Reels sem vídeo é recusado', x.r.status === 400 && /1 vídeo/.test(x.j.erro));
    x = await G('POST', '/post', { tipo: 'story', midias: [IMG(1), IMG(2)] }); chk('Story com 2 mídias é recusado (1 por Story)', x.r.status === 400);
    x = await G('POST', '/post', { tipo: 'feed', midias: [{ url: 'http://x/a.jpg', tipo: 'imagem' }] }); chk('mídia sem https é recusada', x.r.status === 400);
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(1)], modo: 'manual' }); chk('modo manual só para Story', x.r.status === 400);
    x = await G('POST', '/post', { tipo: 'story', modo: 'manual', link: 'javascript:alert(1)', midias: [IMG(1)] }); chk('link do Story só aceita https', x.r.status === 400);
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(1)], quando: 'amanhã cedo' }); chk('data inválida é recusada', x.r.status === 400);
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(1)], quando: new Date(Date.now() + 90 * 86400000).toISOString() }); chk('mais de 60 dias à frente é recusado', x.r.status === 400);
    // ---- FEED agora
    postChamadas = []; publicados = [];
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(1)], legenda: 'Vestido TK-0001 R$ 70,00 à vista', quando: 'agora', por: 'Ana' }); const idFeed = x.j.ids[0];
    chk('criar Feed "agora" devolve o id', x.j.ok === true && idFeed > 0, x.j);
    await rodar();
    let L = await linha(idFeed);
    chk('Feed publicado na hora: container com image_url + legenda, depois media_publish', L.status === 'publicado' && postChamadas[0].p.image_url === IMG(1).url && postChamadas[0].p.caption.includes('TK-0001') && postChamadas[1].u.endsWith('/media_publish'), [L.status, postChamadas]);
    chk('guarda o link do post e quem criou', L.permalink === 'https://www.instagram.com/p/FAKE123/' && L.criado_por === 'Ana' && !!L.publicado_em, L);
    chk('o token vai no CORPO do POST, nunca no endereço', postChamadas.every((c) => !c.u.includes('access_token') && !c.u.includes(TOKEN)));
    // ---- AGENDADO no futuro não sai antes da hora
    postChamadas = [];
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(2)], legenda: 'depois', quando: ts(120) }); const idFut = x.j.ids[0];
    await rodar(2); L = await linha(idFut);
    chk('agendado para daqui a 2 h NÃO publica agora', L.status === 'agendado' && postChamadas.length === 0, L.status);
    await DB.prepare('UPDATE postagem SET agendado_em=? WHERE id=?').bind(ts(-1), idFut).run();
    await rodar(); L = await linha(idFut); chk('quando chega a hora, o cron publica', L.status === 'publicado', L);
    // ---- CARROSSEL com vídeo que demora
    postChamadas = []; containers = {}; videoStatus = 'IN_PROGRESS'; const pubAntes = publicados.length;
    x = await G('POST', '/post', { tipo: 'carrossel', midias: [IMG(1), IMG(2), VID], legenda: 'Carrossel', quando: 'agora' }); const idCar = x.j.ids[0];
    await rodar(); L = await linha(idCar);
    chk('carrossel: cria 1 container por mídia (o vídeo marcado VIDEO) e fica processando', L.status === 'processando' && postChamadas.filter((c) => c.p.is_carousel_item === 'true').length === 3 && postChamadas.some((c) => c.p.media_type === 'VIDEO'), [L.status, postChamadas.length]);
    chk('ainda NÃO criou o container do carrossel nem publicou (vídeo em processamento)', !postChamadas.some((c) => c.p.media_type === 'CAROUSEL') && publicados.length === pubAntes);
    videoStatus = 'FINISHED'; Object.values(containers).forEach((c) => { c.st = 'FINISHED'; });
    await rodar(); L = await linha(idCar);
    const pai = postChamadas.find((c) => c.p.media_type === 'CAROUSEL');
    chk('quando o vídeo termina: cria o container pai com os 3 filhos e publica', L.status === 'publicado' && pai && pai.p.children.split(',').length === 3 && pai.p.caption === 'Carrossel', [L.status, pai]);
    // ---- REELS
    postChamadas = []; videoStatus = 'FINISHED';
    x = await G('POST', '/post', { tipo: 'reels', midias: [VID], legenda: 'Reels da loja', quando: 'agora' }); await rodar(); L = await linha(x.j.ids[0]);
    chk('Reels: media_type REELS + video_url + legenda + share_to_feed', L.status === 'publicado' && postChamadas[0].p.media_type === 'REELS' && postChamadas[0].p.video_url === VID.url && postChamadas[0].p.share_to_feed === 'true', postChamadas[0]);
    // ---- STORY (foto e vídeo) e vários Stories de uma vez
    postChamadas = [];
    x = await G('POST', '/post', { posts: [{ tipo: 'story', midias: [IMG(1)], quando: 'agora', grupo: 'p1' }, { tipo: 'story', midias: [VID], quando: 'agora', grupo: 'p1' }] });
    chk('vários Stories num pedido só (1 por foto)', x.j.ok === true && x.j.ids.length === 2, x.j);
    await rodar(); chk('Story de foto usa media_type STORIES + image_url; de vídeo, video_url', postChamadas.some((c) => c.p.media_type === 'STORIES' && c.p.image_url) && postChamadas.some((c) => c.p.media_type === 'STORIES' && c.p.video_url));
    chk('Story não manda legenda (a API não aceita)', postChamadas.every((c) => c.p.media_type !== 'STORIES' || c.p.caption === undefined));
    // ---- STORY COM LINK = semi-manual
    postChamadas = [];
    x = await G('POST', '/post', { tipo: 'story', modo: 'manual', link: 'https://tenkitermodas.com.br/p/TK-0001', legenda: 'Vestido novo 👇', midias: [IMG(3)], quando: 'agora' }); const idMan = x.j.ids[0];
    await rodar(); L = await linha(idMan);
    chk('Story com link NÃO vai pela API: fica "manual_pendente" esperando a pessoa', L.status === 'manual_pendente' && postChamadas.length === 0 && L.link === 'https://tenkitermodas.com.br/p/TK-0001', [L.status, postChamadas.length]);
    x = await G('POST', '/post/feito', { id: idMan }); L = await linha(idMan); chk('"já postei" fecha como manual_feito', x.j.ok === true && L.status === 'manual_feito');
    x = await G('POST', '/post/feito', { id: idFeed }); chk('não dá para marcar "feito" numa postagem automática', x.r.status === 409);

    // ---- NA SEQUÊNCIA (intervalo humano) e mesmo horário
    await DB.prepare("DELETE FROM postagem WHERE status IN ('agendado','erro')").run();
    x = await G('POST', '/post', { posts: [1, 2, 3, 4].map((n) => ({ tipo: 'story', midias: [IMG(n)], quando: 'sequencia' })) });
    const q = x.j.quandos.map((t) => Date.parse(t));
    chk('na sequência: 4 Stories saem escalonados, cada um 1 a 3 min depois do anterior', x.j.ok && q.length === 4 && q.every((t, i) => i === 0 || (t - q[i - 1] >= 60000 && t - q[i - 1] <= 180000)), x.j.quandos);
    chk('o 1º da sequência sai em ~1 min (não na mesma hora do pedido)', q[0] - Date.now() > 30000 && q[0] - Date.now() < 90000);
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(5)], quando: 'sequencia' });
    chk('um pedido novo entra DEPOIS da fila de sequência (3 a 9 min depois da última)', Date.parse(x.j.quandos[0]) - q[3] >= 180000 && Date.parse(x.j.quandos[0]) - q[3] <= 540000, [x.j.quandos, q[3]]);
    const idsSeq = (await DB.prepare("SELECT id FROM postagem WHERE seq=1 AND status='agendado'").all()).results.length;
    chk('as da sequência ficam marcadas como sequência', idsSeq === 5, idsSeq);
    chk('o intervalo humano varia (não é sempre igual)', new Set(Array.from({ length: 30 }, () => W.intervaloHumanoMs('feed', 'feed'))).size > 5);
    // vários no MESMO horário: todos saem (4 por minuto, o resto no minuto seguinte), em ordem
    await DB.prepare("DELETE FROM postagem WHERE status='agendado'").run();
    const mesma = ts(180); const ids6 = [];
    for (let n = 0; n < 6; n++) { x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(n)], quando: mesma }); ids6.push(x.j.ids[0]); chk('mesmo horário #' + (n + 1) + ' é aceito (sem conflito)', x.j.ok === true, x.j); }
    await DB.prepare('UPDATE postagem SET agendado_em=? WHERE id IN (' + ids6.join(',') + ')').bind(ts(-1)).run();
    publicados = []; await rodar(); const n1 = publicados.length; await rodar();
    chk('6 no mesmo horário: 4 no 1º minuto e os 2 restantes no seguinte', n1 === 4 && publicados.length === 6, [n1, publicados.length]);
    chk('todas publicadas, sem erro', (await DB.prepare("SELECT COUNT(*) AS n FROM postagem WHERE id IN (" + ids6.join(',') + ") AND status='publicado'").first()).n === 6);
    // ---- cancelar / reagendar
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(4)], quando: ts(300) }); const idC = x.j.ids[0];
    x = await G('POST', '/post/cancelar', { id: idC }); L = await linha(idC); chk('cancelar uma agendada', x.j.ok === true && L.status === 'cancelado');
    x = await G('POST', '/post/cancelar', { id: idFeed }); chk('não cancela o que já foi publicado', x.r.status === 409);
    x = await G('POST', '/posts'.replace('/posts', '/post/cancelar'), { id: 99999 }); chk('postagem que não existe = 404', x.r.status === 404);
    ({ j } = await G('GET', '/posts')); chk('a fila não mostra as canceladas', !j.posts.some((q) => q.id === idC));
    chk('a fila nunca expõe containers/token', !JSON.stringify(j).includes(TOKEN) && !JSON.stringify(j).includes('containers'));
    // ---- erros do Instagram viram frase e tentam de novo
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(5)], quando: 'agora' }); const idE = x.j.ids[0];
    postErro = { message: 'Media download has failed', code: 9004, error_subcode: 2207052 }; await rodar(); L = await linha(idE);
    chk('mídia recusada pelo Instagram: volta para a fila (+5 min) com frase, sem JSON', L.status === 'agendado' && L.tentativas === 1 && /não aceitou a mídia/.test(L.erro) && !/\{/.test(L.erro), L);
    await DB.prepare('UPDATE postagem SET agendado_em=? WHERE id=?').bind(ts(-1), idE).run(); await rodar(); L = await linha(idE);
    chk('na 2ª tentativa publica e limpa o erro', L.status === 'publicado' && L.erro === '', L);
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(6)], quando: 'agora' }); const idP = x.j.ids[0];
    postErro = { message: '(#10) Application does not have permission', code: 10 }; await rodar(); L = await linha(idP);
    chk('sem permissão de publicar: erro na hora (não adianta repetir) com a frase certa', L.status === 'erro' && /instagram_business_content_publish/.test(L.erro), L);
    x = await G('POST', '/post/reagendar', { id: idP, quando: 'agora' }); await rodar(); L = await linha(idP);
    chk('"Tentar de novo" depois de corrigir o token publica', x.j.ok === true && L.status === 'publicado', L);
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(7)], quando: 'agora' }); const idL = x.j.ids[0];
    postErro = { message: 'Application request limit reached', code: 4 }; await rodar(); L = await linha(idL);
    chk('limite do Instagram: espera 30 min sem gastar tentativa', L.status === 'agendado' && L.tentativas === 0 && Date.parse(L.agendado_em) - Date.now() > 25 * 60000, L);
    await DB.prepare('UPDATE postagem SET agendado_em=? WHERE id=?').bind(ts(-1), idL).run(); await rodar();
    // ---- 3 falhas seguidas = erro
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(8)], quando: 'agora' }); const id3 = x.j.ids[0];
    for (let i = 0; i < 3; i++) { postErro = { message: 'Media download has failed', code: 9004, error_subcode: 2207052 }; await DB.prepare('UPDATE postagem SET agendado_em=? WHERE id=?').bind(ts(-1), id3).run(); await rodar(); }
    L = await linha(id3); chk('3 falhas seguidas: para em "erro" (não fica tentando para sempre)', L.status === 'erro' && L.tentativas === 3, L);
    // ---- token vencido
    tokenValido = false; x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(9)], quando: 'agora' }); await rodar(); L = await linha(x.j.ids[0]);
    chk('token vencido: erro com a frase "gere outro" (sem repetir)', L.status === 'erro' && /venceu ou foi recusado/.test(L.erro), L); tokenValido = true;
    // ---- limite diário
    await DB.prepare("DELETE FROM postagem WHERE status='agendado'").run();
    const hoje = agoraIso();
    const antes = Number((await DB.prepare("SELECT COUNT(*) AS n FROM postagem WHERE status='publicado' AND publicado_em>=?").bind(new Date(Date.now() - 86400000).toISOString()).first()).n);
    for (let i = antes; i < 90; i++) await DB.prepare("INSERT INTO postagem (tipo, legenda, midias, agendado_em, status, publicado_em, criado_em) VALUES ('feed','','[]',?, 'publicado', ?, ?)").bind(hoje, hoje, hoje).run();
    postChamadas = []; x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(1)], quando: 'agora' }); await rodar(); L = await linha(x.j.ids[0]);
    chk('com 90 publicações em 24 h a próxima espera (limite do Instagram)', L.status === 'agendado' && postChamadas.length === 0, L.status);
    await DB.prepare("DELETE FROM postagem WHERE status IN ('publicado') AND tipo='feed' AND legenda='' AND midias='[]'").run();
    // ---- sem token conectado
    const tk = (await DB.prepare("SELECT valor FROM cfg WHERE chave='ig_token'").first()).valor;
    await DB.prepare("DELETE FROM cfg WHERE chave='ig_token'").run();
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(1)], quando: 'agora' }); chk('sem Instagram conectado: recusa com frase clara', x.r.status === 409 && /não está conectado/.test(x.j.erro), x.j);
    x = await G('POST', '/post', { tipo: 'story', modo: 'manual', link: 'https://tenkitermodas.com.br/', midias: [IMG(1)], quando: 'agora' }); chk('mas Story manual (com link) funciona sem token', x.j.ok === true);
    await DB.prepare("INSERT INTO cfg (chave, valor) VALUES ('ig_token', ?)").bind(tk).run();
    // ---- agendada para daqui a 1 min no cron real (scheduledTime)
    chk('processarPostagens nunca lança, nem sem nada na fila', (await W.processarPostagens(env)).erro !== true);
    chk('fraseErroIG não vaza o token', !JSON.stringify(W.fraseErroIG({ message: 'x access_token=SEGREDO123 y', code: 1 })).includes('SEGREDO123'));
  }

  console.log('== FOTOS DE CLIENTES (Ela usa TM) ==');
  {
    const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1]);
    const bin = (m, p, sess, corpo, tipo) => new Request('https://ig.test' + p, { method: m, headers: { Origin: O, 'X-TK-Whats': '88999990000', 'X-TK-Sessao': sess || '', 'Content-Type': tipo || 'image/jpeg' }, body: corpo });
    const E = async (p, corpo, sess) => { const r = await w.fetch(bin('POST', p, sess || 'tk2.gerente', corpo), env, {}); return { r, j: await r.json() }; };
    const C = async (q, corpo, sess) => { const r = await w.fetch(bin('POST', '/cliente/foto' + q, sess || 'tk2.cliente', corpo), env, {}); return { r, j: await r.json() }; };
    let x, r2;
    // ---- cliente
    x = await C('?aceito=1&obs=Usei%20no%20anivers%C3%A1rio&ig=%40Maria.Cli', JPG); const idC1 = x.j.id;
    chk('cliente logado envia a foto (só com a autorização marcada)', x.r.status === 200 && x.j.ok && idC1 > 0, x.j);
    let L = await DB.prepare('SELECT * FROM foto_cliente WHERE id=?').bind(idC1).first();
    chk('fica ligada ao cadastro (WhatsApp e nome da SESSÃO, não do que veio no pedido), com observação e Instagram limpo', L.whats === '88988887777' && L.nome === 'Maria Cliente' && L.origem === 'cliente' && L.vinculo === 'conta' && L.obs === 'Usei no aniversário' && L.instagram === 'maria.cli', L);
    chk('a foto foi para o R2 com o endereço público do Worker de mídia', /^https:\/\/tenkiter-midia\.fake\/m\/\d{6}\/[0-9a-f]{20}\.jpg$/.test(L.url), L.url);
    x = await C('', JPG); chk('sem marcar a autorização: recusa', x.r.status === 400 && /autoriza/.test(x.j.erro));
    x = await C('?aceito=1', JPG, 'tk2.fantasma'); chk('sem login válido: 401', x.r.status === 401);
    x = await C('?aceito=1', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])); chk('arquivo que não é imagem (pelos bytes) é recusado com frase', x.r.status === 400 && /Formato não aceito/.test(x.j.erro));
    x = await C('?aceito=1', new Uint8Array(2.6 * 1048576).fill(0).map((v, i) => (i < 4 ? [0xff, 0xd8, 0xff, 0xe0][i] : 0))); chk('foto acima de 2,5 MB é recusada', x.r.status === 400 && /2,5 MB/.test(x.j.erro));
    for (let k = 0; k < 4; k++) x = await C('?aceito=1', k === 1 ? PNG : JPG); x = await C('?aceito=1', JPG);
    chk('limite de 5 fotos por dia por cliente', x.r.status === 429 && /5 fotos hoje/.test(x.j.erro), x.j);
    r2 = await w.fetch(bin('POST', '/fotos/nova?whats=88977776666', 'tk2.cliente', JPG), env, {}); chk('cliente comum NÃO acessa as rotas da equipe', r2.status === 403);
    r2 = await w.fetch(bin('GET', '/fotos', 'tk2.cliente'), env, {}); chk('nem a lista de fotos', r2.status === 403);
    // ---- equipe anexa a foto recebida
    contaChamadas = [];
    x = await E('/fotos/nova', JPG); chk('equipe: sem WhatsApp e sem Instagram = recusa (obrigatório um dos dois)', x.r.status === 400 && /pelo menos um/.test(x.j.erro));
    x = await E('/fotos/nova?whats=8899', JPG); chk('WhatsApp incompleto é recusado', x.r.status === 400);
    x = await E('/fotos/nova?whats=(88)%2097777-6666&por=Ana', JPG);
    chk('WhatsApp que já tem conta: vincula automaticamente e traz o nome', x.j.ok && x.j.vinculo === 'conta' && x.j.nome === 'Joana Cadastrada' && x.j.whats === '88977776666', x.j);
    chk('a consulta de conta usa a sessão de quem anexou', contaChamadas.length === 1 && contaChamadas[0].sessao === 'tk2.gerente' && contaChamadas[0].alvo === '88977776666');
    x = await E('/fotos/nova?whats=88966665555&ig=%40Nova.Pessoa', PNG); chk('WhatsApp sem conta + Instagram: envia só com o que tem', x.j.ok && x.j.vinculo === 'nenhum' && x.j.nome === '' && x.j.instagram === 'nova.pessoa', x.j);
    x = await E('/fotos/nova?ig=nova.pessoa', JPG); chk('só Instagram que já apareceu antes: reaproveita o WhatsApp da outra foto', x.j.ok && x.j.whats === '88966665555' && x.j.vinculo === 'historico', x.j);
    x = await E('/fotos/nova?ig=maria.cli', JPG); chk('só Instagram da cliente que enviou pelo site: vincula à conta dela (nome e WhatsApp)', x.j.ok && x.j.nome === 'Maria Cliente' && x.j.whats === '88988887777', x.j);
    x = await E('/fotos/nova?ig=https://instagram.com/Alguem.Novo/', JPG); chk('Instagram colado como link vira @usuario limpo', x.j.ok && x.j.instagram === 'alguem.novo' && x.j.vinculo === 'nenhum', x.j);
    contaFora = true; x = await E('/fotos/nova?whats=88977776666', JPG); chk('se a consulta de conta falha, a foto entra mesmo assim (histórico do WhatsApp)', x.j.ok === true && x.j.nome === 'Joana Cadastrada', x.j); contaFora = false;
    x = await E('/fotos/nova?whats=88955554444', new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9])); chk('equipe também só anexa imagem de verdade', x.r.status === 400);
    // ---- lista e ações
    r2 = await w.fetch(bin('GET', '/fotos?status=nova', 'tk2.gerente'), env, {}); const lista = await r2.json();
    chk('equipe lista as fotos novas (de cliente e de equipe) sem token/chave', r2.status === 200 && lista.fotos.length >= 7 && lista.fotos.some((f) => f.origem === 'cliente') && lista.fotos.some((f) => f.origem === 'equipe') && !JSON.stringify(lista).includes('chave'), lista.contagens);
    const alvoId = lista.fotos[0].id;
    x = await (await w.fetch(ped('POST', '/fotos/acao', 'tk2.gerente', { ids: [alvoId], acao: 'usada' }), env, {})).json(); chk('marcar como usada', x.ok && (await DB.prepare('SELECT status FROM foto_cliente WHERE id=?').bind(alvoId).first()).status === 'usada');
    x = await (await w.fetch(ped('POST', '/fotos/acao', 'tk2.gerente', { ids: [alvoId], acao: 'descartar' }), env, {})).json(); chk('descartar', (await DB.prepare('SELECT status FROM foto_cliente WHERE id=?').bind(alvoId).first()).status === 'descartada');
    x = await (await w.fetch(ped('POST', '/fotos/acao', 'tk2.gerente', { ids: [alvoId], acao: 'restaurar' }), env, {})).json(); chk('restaurar volta para nova', (await DB.prepare('SELECT status FROM foto_cliente WHERE id=?').bind(alvoId).first()).status === 'nova');
    x = await (await w.fetch(ped('POST', '/fotos/acao', 'tk2.gerente', { ids: [alvoId], acao: 'apagar' }), env, {})).json(); chk('ação desconhecida é recusada', x.ok === false);
    x = await (await w.fetch(ped('GET', '/fotos/visuais', 'tk2.gerente'), env, {})).json(); chk('visuais: começa sem nada guardado', x.ok === true && x.dados === null);
    x = await (await w.fetch(ped('POST', '/fotos/visuais', 'tk2.gerente', { dados: { tk_po_cta_v1: '{"a":1}' } }), env, {})).json(); chk('visuais: salva', x.ok === true);
    x = await (await w.fetch(ped('GET', '/fotos/visuais', 'tk2.gerente'), env, {})).json(); chk('visuais: volta o que foi salvo (vale em outro aparelho)', x.dados && x.dados.tk_po_cta_v1 === '{"a":1}');
    x = await (await w.fetch(ped('POST', '/fotos/visuais', 'tk2.gerente', { dados: { g: 'x'.repeat(210000) } }), env, {})).json(); chk('visuais: recusa configuração enorme', x.ok === false);
    r2 = await w.fetch(ped('GET', '/fotos/visuais'), env, {}); chk('visuais: sem login é recusado', r2.status === 401 || r2.status === 403);
    r2 = await w.fetch(ped('GET', '/status', 'tk2.gerente'), env, {}); chk('quem só cadastra continua sem o importador', r2.status === 403);
  }

  console.log('== Token ==');
  const exp = Number(String((await DB.prepare("SELECT valor FROM cfg WHERE chave='ig_token_exp'").first()).valor));
  await DB.prepare("UPDATE cfg SET valor=? WHERE chave='ig_token_exp'").bind(String(Date.now() + 5 * 86400000)).run();
  ({ j } = await A('GET', '/status')); chk('token a menos de 10 dias do fim gera alerta', j.alertas.some((a) => /vence em/.test(a)), j.alertas);
  feed = []; chamadas = []; await W.ciclo(env, 'cron'); chk('o ciclo renova o token sozinho antes de vencer', chamadas.some((u) => u.includes('refresh_access_token')));
  ({ j } = await A('GET', '/status')); chk('depois de renovar o alerta some', !j.alertas.some((a) => /vence em/.test(a)));
  ({ j } = await A('DELETE', '/token')); ({ j } = await A('GET', '/status')); chk('desconectar apaga o token', j.conectado === false);

  console.log('== Limpeza de mídia temporária (5 dias) ==');
  {
    const velho = new Date(Date.now() - 6 * 86400000), novo = new Date(Date.now() - 2 * 86400000);
    objs.set('t/202610/aaaaaaaaaaaaaaaaaaaa.jpg', Buffer.alloc(100)); tempDatas.set('t/202610/aaaaaaaaaaaaaaaaaaaa.jpg', velho);
    objs.set('t/202610/bbbbbbbbbbbbbbbbbbbb.jpg', Buffer.alloc(100)); tempDatas.set('t/202610/bbbbbbbbbbbbbbbbbbbb.jpg', novo);
    objs.set('t/202610/cccccccccccccccccccc.jpg', Buffer.alloc(100)); tempDatas.set('t/202610/cccccccccccccccccccc.jpg', velho);
    objs.set('202610/dddddddddddddddddddd.jpg', Buffer.alloc(100)); tempDatas.set('202610/dddddddddddddddddddd.jpg', velho);
    await DB.prepare("INSERT INTO postagem (tipo, modo, midias, agendado_em, status) VALUES ('story','auto', ?, '2026-12-01T10:00:00Z', 'agendado')").bind(JSON.stringify([{ url: 'https://x/m/t/202610/cccccccccccccccccccc.jpg', tipo: 'imagem' }])).run();
    const rl = await W.limparTemporarios(env, Date.now());
    chk('apaga a temporária com mais de 5 dias', !objs.has('t/202610/aaaaaaaaaaaaaaaaaaaa.jpg'), rl);
    chk('mantém a temporária recente', objs.has('t/202610/bbbbbbbbbbbbbbbbbbbb.jpg'));
    chk('mantém a velha que ainda está numa postagem agendada', objs.has('t/202610/cccccccccccccccccccc.jpg'));
    chk('nunca mexe em mídia que não é temporária', objs.has('202610/dddddddddddddddddddd.jpg'));
  }

  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length, falhas);
  process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE', e); process.exit(2); });
