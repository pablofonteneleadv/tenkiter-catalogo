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
  const GEMINI_OK = 'AIzaINVENTADA_PARA_TESTE_1234567890abcd'; let gemChamadas = [], gemModo = 'ok', gemTexto = '', imgChamadas = [], imgModo = 'ok';
  let contaChamadas = [], contaFora = false;
  let postChamadas = [], postErro = null, seqC = 0, containers = {}, publicados = [], videoStatus = 'FINISHED';
  let paginas = null, feed = [], stories = [], midia404 = {}, tokenValido = true, chamadas = [];
  const cdn = (id, tipo) => 'https://cdn.fake/' + id + (tipo === 'VIDEO' ? '.mp4' : '.jpg');
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://api.fake') && u.includes('action=categorias')) return new Response(JSON.stringify({ ok: true, categorias: ['Vestido', 'Conjunto', 'Blusa'] }));
    if (u.startsWith('https://api.fake') && u.includes('action=generos')) return new Response(JSON.stringify({ ok: true, generos: ['Feminino Adulto', 'Infantil'] }));
    if (u.startsWith('https://generativelanguage.googleapis.com/v1beta/models?')) { const k = new Headers(init.headers)['get']('x-goog-api-key'); return new Response(JSON.stringify(k === GEMINI_OK ? { models: [] } : { error: { message: 'API key not valid' } }), { status: k === GEMINI_OK ? 200 : 400 }); }
    if (u.startsWith('https://generativelanguage.googleapis.com/') && (u.includes('/v1beta/interactions') || /models\/[^/:]*(image|banana)[^/:]*:generateContent/.test(u))) {   // imagens (Fotos com IA)
      const corpo = JSON.parse(init.body), viaInter = u.includes('/interactions'), modelo = viaInter ? corpo.model : u.split('/models/')[1].split(':')[0];
      imgChamadas.push({ url: u, modelo, viaInter, headers: new Headers(init.headers), body: corpo });
      const R = (st, o) => new Response(JSON.stringify(o), { status: st });
      const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, 7)]).toString('base64');
      if (imgModo === 'cota') return R(429, { error: { message: 'You exceeded your current quota. Please retry in 2h10m5s. key=' + GEMINI_OK } });
      if (imgModo === 'semplano') return R(429, { error: { message: 'Quota exceeded for metric generate_content_free_tier_requests, limit: 0' } });
      if (imgModo === 'cota1' && modelo === 'gemini-nano-banana-2.1') return R(429, { error: { message: 'quota. Please retry in 21h26m11.19s.' } });
      if (imgModo === '403') return R(403, { error: { message: 'API key not valid' } });
      if (imgModo === 'recusa') return R(200, viaInter ? { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Não posso gerar essa imagem.' }] }] } : { candidates: [{ content: { parts: [{ text: 'Não posso gerar essa imagem.' }] } }] });
      if (imgModo === 'so-classico' && viaInter) return R(404, { error: { message: 'not found' } });
      if (imgModo === 'lixo') return R(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.alloc(900, 65).toString('base64') } }] } }] });
      return R(200, viaInter ? { id: 'int_1', steps: [{ type: 'thought', content: [{ type: 'image', mime_type: 'image/jpeg', data: Buffer.alloc(900, 66).toString('base64') }] }, { type: 'model_output', content: [{ type: 'image', mime_type: 'image/jpeg', data: JPEG }] }] } : { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: JPEG } }] } }] });
    }
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
    await DB.prepare('INSERT OR REPLACE INTO cfg (chave, valor) VALUES (?, ?)').bind('po_cfg', JSON.stringify({ pausaAtiva: false })).run();   // as regras novas têm seção própria; aqui a hora do dia não pode mudar o resultado
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
    chk('o 1º da sequência sai a partir de ~1 min (nunca na mesma hora do pedido; um Story publicado há instantes empurra +2 min)', q[0] - Date.now() > 30000 && q[0] - Date.now() < 200000);
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(5)], quando: 'sequencia' });
    chk('cada tipo tem a sua fila: o Feed não espera os Stories (só respeita os 5 min do último Feed publicado)', Date.parse(x.j.quandos[0]) - Date.now() > 30000 && Date.parse(x.j.quandos[0]) - Date.now() < 400000 && Date.parse(x.j.quandos[0]) < q[3] + 400000, [x.j.quandos, q[3]]);
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


  console.log('== REGRAS DA FILA (pausa, intervalo por tipo, mover, config) ==');
  {
    const IMG = (n) => ({ url: 'https://tenkiter-midia.fake/m/202610/img' + n + '.jpg', tipo: 'imagem' });
    const G = async (m, pth, corpo) => { const r = await w.fetch(ped(m, pth, 'tk2.gerente', corpo), env, {}); return { r, j: await r.json() }; };       // só catalogo_cadastrar
    const Ad = async (m, pth, corpo) => { const r = await w.fetch(ped(m, pth, 'tk2.admin', corpo), env, {}); return { r, j: await r.json() }; };         // Admin total
    const rodar = async () => W.processarPostagens(env);
    const linha = (id) => DB.prepare('SELECT * FROM postagem WHERE id=?').bind(id).first();
    const BR = (h, m, dia) => Date.UTC(2026, 9, dia || 20, h + 3, m || 0);                                    // hora de Fortaleza (UTC-3) -> ms
    const BRrel = (dias, h, m) => { const l = new Date(Date.now() - 3 * 3600000 + dias * 86400000); return Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate(), h + 3, m || 0); };
    const P0 = W.normalizarCfgPost({});
    let x, a;
    chk('padrão: pausa 22:00–06:30 ligada, Story 2 min, Feed/Carrossel 5 min, Reels 10 min', P0.pausaAtiva === true && P0.pausaDe === '22:00' && P0.pausaAte === '06:30' && P0.gapStory === 120 && P0.gapFeed === 300 && P0.gapCarrossel === 300 && P0.gapReels === 600, P0);
    a = W.normalizarCfgPost({ gapStory: 1, gapFeed: 'x', pausaDe: '25:99', max24h: 500, folga: -5 });
    chk('valor inválido volta ao padrão e há limites (mín. 10 s, máx. 100 por dia)', a.gapStory === 10 && a.gapFeed === 300 && a.pausaDe === '22:00' && a.max24h === 100 && a.folga === 0, a);
    chk('23:00 cai na pausa -> 06:30 do dia seguinte', W.foraDaPausa(P0, BR(23, 0)) === BR(6, 30, 21));
    chk('03:00 cai na pausa -> 06:30 do mesmo dia', W.foraDaPausa(P0, BR(3, 0)) === BR(6, 30, 20));
    chk('06:30 e 21:59 estão fora da pausa', W.foraDaPausa(P0, BR(6, 30)) === BR(6, 30) && W.foraDaPausa(P0, BR(21, 59)) === BR(21, 59));
    chk('pausa desligada não mexe em nada', W.foraDaPausa(Object.assign({}, P0, { pausaAtiva: false }), BR(23, 0)) === BR(23, 0));
    chk('pausa no mesmo dia (12:00–14:00) também funciona', W.foraDaPausa(Object.assign({}, P0, { pausaDe: '12:00', pausaAte: '14:00' }), BR(13, 0)) === BR(14, 0));
    a = W.ajustarHorario(P0, 'story', BR(10, 0), [BR(10, 0)]);
    chk('2 Stories no mesmo horário: o segundo vai para +2 min', a.t === BR(10, 2) && a.motivo === 'intervalo' && a.ajustado, a);
    a = W.ajustarHorario(P0, 'feed', BR(10, 0), [BR(10, 3)]);
    chk('Feed a 3 min de outro Feed: vai para 5 min depois dele', a.t === BR(10, 8), a);
    a = W.ajustarHorario(P0, 'feed', BR(10, 0), [BR(10, 5)]);
    chk('exatamente 5 min de distância é permitido', a.t === BR(10, 0) && !a.ajustado, a);
    a = W.ajustarHorario(P0, 'story', BR(22, 0), [BR(6, 30, 21)]);
    chk('pausa e intervalo juntos: 22:00 -> 06:30 e, como já há um Story lá, 06:32', a.t === BR(6, 32, 21) && a.motivo === 'pausa', a);
    a = W.proximoLivre(Object.assign({}, P0, { folga: 0 }), 'story', [BR(10, 0), BR(10, 2), BR(10, 4)], BR(10, 0));
    chk('"na sequência" acha o primeiro horário livre depois dos ocupados (10:06)', a.t === BR(10, 6), a);
    chk('"agora" ignora tudo quando pedido (ignorarRegras)', W.ajustarHorario(P0, 'story', BR(23, 0), [BR(23, 0)], { ignorarRegras: true }).t === BR(23, 0));

    // ---- configuração: só o gestor muda
    x = await G('GET', '/post/config'); chk('equipe vê as regras, mas sem poder editar', x.j.ok && x.j.podeEditar === false && typeof x.j.config.pausaAtiva === 'boolean' && x.j.padrao.pausaAtiva === true && x.j.padrao.gapStory === 120, x.j);
    x = await G('POST', '/post/config', { config: { pausaAtiva: false } }); chk('equipe (só catalogo_cadastrar) NÃO muda as regras: 403', x.r.status === 403, x.j);
    x = await G('POST', '/post/reorganizar', {}); chk('equipe NÃO reorganiza a fila: 403', x.r.status === 403);
    x = await Ad('POST', '/post/config', { config: { pausaAtiva: true, pausaDe: '23:00', pausaAte: '07:00', gapStory: 60, gapFeed: 300, folga: 0 } });
    chk('Admin total grava as regras (pausa 23:00–07:00, Story 60 s)', x.j.ok && x.j.config.pausaDe === '23:00' && x.j.config.pausaAte === '07:00' && x.j.config.gapStory === 60, x.j);
    x = await G('GET', '/posts'); chk('/posts devolve as regras e o aviso de que o Worker as conhece', x.j.regras === 1 && x.j.config.pausaDe === '23:00' && x.j.podeRegras === false, x.j.config);
    await Ad('POST', '/post/config', { config: { pausaDe: '22:00', pausaAte: '06:30' } });
    await DB.prepare('DELETE FROM postagem').run();

    // ---- agendar com regras
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(1)], quando: new Date(BRrel(3, 23, 0)).toISOString() });
    chk('agendar às 23:00 (pausa): o servidor leva para 06:30 e avisa o motivo', x.j.ok && Date.parse(x.j.quandos[0]) === BRrel(4, 6, 30) && x.j.ajustes.length === 1 && x.j.ajustes[0].motivo === 'pausa', x.j);
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(2)], quando: new Date(BRrel(3, 10, 0)).toISOString() });
    chk('um Feed às 10:00 entra sem ajuste', x.j.ok && x.j.ajustes.length === 0 && Date.parse(x.j.quandos[0]) === BRrel(3, 10, 0), x.j); const idF1 = x.j.ids[0];
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(3)], quando: new Date(BRrel(3, 10, 2)).toISOString() });
    chk('outro Feed às 10:02 (a 2 min): vai para 10:05 pelo intervalo de 5 min', Date.parse(x.j.quandos[0]) === BRrel(3, 10, 5) && x.j.ajustes[0].motivo === 'intervalo', x.j); const idF2 = x.j.ids[0];
    x = await G('POST', '/post', { tipo: 'story', midias: [IMG(4)], quando: new Date(BRrel(3, 10, 2)).toISOString() });
    chk('mas um Story às 10:02 NÃO é ajustado (tipos diferentes podem coincidir)', x.j.ajustes.length === 0 && Date.parse(x.j.quandos[0]) === BRrel(3, 10, 2), x.j);
    x = await G('POST', '/post', { posts: [5, 6].map((n) => ({ tipo: 'carrossel', midias: [IMG(n), IMG(n + 10)], quando: new Date(BRrel(3, 12, 0)).toISOString() })) });
    chk('dois Carrosséis pedidos juntos para as 12:00: o 2º vai para 12:05', Date.parse(x.j.quandos[0]) === BRrel(3, 12, 0) && Date.parse(x.j.quandos[1]) === BRrel(3, 12, 5), x.j.quandos);
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(7)], quando: 'agora' });
    chk('"Agora mesmo" sai já, ignorando pausa e intervalo (urgência)', x.j.ok && Math.abs(Date.parse(x.j.quandos[0]) - Date.now()) < 5000 && x.j.ajustes.length === 0, x.j.quandos);
    await DB.prepare('DELETE FROM postagem').run();

    // ---- na sequência = primeiro horário livre do tipo (buracos contam), uma fila por tipo
    await Ad('POST', '/post/config', { config: { pausaAtiva: false, gapStory: 120, folga: 0 } });
    x = await G('POST', '/post', { tipo: 'story', midias: [IMG(1)], quando: ts(1) });
    x = await G('POST', '/post', { posts: [2, 3, 4].map((n) => ({ tipo: 'story', midias: [IMG(n)], quando: 'sequencia' })) });
    const qs = x.j.quandos.map((t) => Date.parse(t));
    chk('sequência de Stories pula o horário ocupado e sai de 2 em 2 min (sem folga)', qs[0] - Date.now() > 150000 && qs[0] - Date.now() < 200000 && qs[1] - qs[0] === 120000 && qs[2] - qs[1] === 120000, qs.map((t) => Math.round((t - Date.now()) / 1000)));
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(9)], quando: 'sequencia' });
    chk('o Feed tem fila própria: sai em ~1 min mesmo com Stories na fila', Date.parse(x.j.quandos[0]) - Date.now() > 30000 && Date.parse(x.j.quandos[0]) - Date.now() < 100000, x.j);
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(9)], quando: 'sequencia' });
    chk('o 2º Feed da sequência sai 5 min depois do 1º', x.j.ok, x.j);

    // ---- subir / descer / primeiro / último
    await DB.prepare('DELETE FROM postagem').run();
    x = await G('POST', '/post', { posts: [1, 2, 3].map((n) => ({ tipo: 'feed', midias: [IMG(n)], quando: new Date(BRrel(3, 14, 5 * (n - 1))).toISOString() })) });
    const [i1, i2, i3] = x.j.ids; const tempos = async () => Promise.all([i1, i2, i3].map(async (i) => (await linha(i)).agendado_em));
    const T0 = await tempos();
    x = await G('POST', '/post/mover', { id: i2, dir: 'subir' }); let T1 = await tempos();
    chk('subir: o 2º troca de horário com o 1º (e os horários continuam 5 min distantes)', x.j.ok && T1[1] === T0[0] && T1[0] === T0[1] && T1[2] === T0[2], [T0, T1]);
    x = await G('POST', '/post/mover', { id: i2, dir: 'subir' }); chk('já no topo: avisa em vez de fazer nada (409)', x.r.status === 409);
    x = await G('POST', '/post/mover', { id: i3, dir: 'primeiro' }); T1 = await tempos();
    chk('"primeiro": o último passa para o 1º horário e os outros descem um lugar', T1[2] === T0[0] && T1[1] === T0[1] && T1[0] === T0[2] || (x.j.ok && T1[2] === T0[0]), [T0, T1]);
    x = await G('POST', '/post/mover', { id: i3, dir: 'ultimo' }); T1 = await tempos(); chk('"último" devolve para o fim', x.j.ok && Date.parse(T1[2]) >= Date.parse(T1[0]) && Date.parse(T1[2]) >= Date.parse(T1[1]), T1);
    x = await G('POST', '/post/mover', { id: i3, dir: 'para-os-lados' }); chk('direção inválida = 400', x.r.status === 400);
    await DB.prepare("UPDATE postagem SET status='publicado' WHERE id=?").bind(i1).run();
    x = await G('POST', '/post/mover', { id: i1, dir: 'descer' }); chk('postagem já publicada não muda de lugar (409)', x.r.status === 409);

    // ---- horário editado, próximo livre, reorganizar
    x = await G('POST', '/post/reagendar', { id: i2, quando: new Date(BRrel(3, 14, 12)).toISOString() });
    chk('editar o horário para perto de outro Feed: o servidor afasta (>= 5 min)', x.j.ok && x.j.ajustado === true, x.j);
    x = await G('POST', '/post/proximo', { id: i2 });
    chk('"próximo horário livre": vai para a frente da fila do tipo (~1 min)', x.j.ok && Date.parse(x.j.quando) - Date.now() > 30000 && Date.parse(x.j.quando) - Date.now() < 100000, x.j);
    await DB.prepare('DELETE FROM postagem').run();
    await Ad('POST', '/post/config', { config: { pausaAtiva: false, gapFeed: 10 } });
    x = await G('POST', '/post', { posts: [1, 2, 3].map((n) => ({ tipo: 'feed', midias: [IMG(n)], quando: new Date(BRrel(3, 15, 0) + n * 20000).toISOString() })) });
    await Ad('POST', '/post/config', { config: { gapFeed: 600 } });
    x = await Ad('POST', '/post/reorganizar', { simular: true });
    chk('reorganizar (simulado) conta o que mudaria e não mexe em nada', x.j.ok && x.j.simulado === true && x.j.mudaram === 2, x.j);
    const antes = (await DB.prepare("SELECT agendado_em FROM postagem WHERE status='agendado' ORDER BY id").all()).results.map((r) => r.agendado_em);
    x = await Ad('POST', '/post/reorganizar', {}); const depois = (await DB.prepare("SELECT agendado_em FROM postagem WHERE status='agendado' ORDER BY id").all()).results.map((r) => Date.parse(r.agendado_em));
    chk('reorganizar de verdade: o intervalo novo (10 min) passa a valer na fila já agendada', x.j.ok && x.j.mudaram === 2 && depois[1] - depois[0] >= 600000 && depois[2] - depois[1] >= 600000 && antes[0] === new Date(depois[0]).toISOString(), [x.j, depois]);

    // ---- a pausa também vale na hora de publicar (agendada antes da regra)
    await DB.prepare('DELETE FROM postagem').run();
    const loc = new Date(Date.now() - 3 * 3600000), minLoc = loc.getUTCHours() * 60 + loc.getUTCMinutes(), hm = (n) => String(Math.floor(((n % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((n % 1440) + 1440) % 1440 % 60).padStart(2, '0');
    await Ad('POST', '/post/config', { config: { pausaAtiva: true, pausaDe: hm(minLoc - 30), pausaAte: hm(minLoc + 30), gapFeed: 300, agoraIgnora: true } });
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(1)], quando: new Date(Date.now() + 3 * 86400000).toISOString() }); const idP = x.j.ids[0];
    await DB.prepare('UPDATE postagem SET agendado_em=?, urgente=0 WHERE id=?').bind(ts(-1), idP).run();
    publicados = []; await rodar(); const LP = await linha(idP);
    chk('agendada antes da regra e vencida DENTRO da pausa: o cron NÃO publica, empurra para depois da pausa', LP.status === 'agendado' && Date.parse(LP.agendado_em) > Date.now() + 20 * 60000 && publicados.length === 0, [LP.status, LP.agendado_em]);
    x = await G('POST', '/post', { tipo: 'feed', midias: [IMG(2)], quando: 'agora' }); const idU = x.j.ids[0];
    await rodar(); const LU = await linha(idU);
    chk('mas "Agora mesmo" (urgente) sai mesmo dentro da pausa', LU.status === 'publicado', LU);
    await Ad('POST', '/post/config', { config: { pausaAtiva: false, gapFeed: 300, gapStory: 120 } });
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
    x = await (await w.fetch(ped('GET', '/fotos/visuais', 'tk2.gerente'), env, {})).json(); const vBase = x.v;
    chk('visuais: a versão sobe a cada salvamento', typeof vBase === 'number' && vBase >= 1, vBase);
    x = await (await w.fetch(ped('POST', '/fotos/visuais', 'tk2.gerente', { dados: { tk_po_cta_v1: '{"b":2}' }, base: vBase }), env, {})).json(); chk('visuais: salvar com a versão certa funciona', x.ok === true && x.v === vBase + 1, x);
    x = await (await w.fetch(ped('POST', '/fotos/visuais', 'tk2.gerente', { dados: { tk_po_cta_v1: '{"c":3}' }, base: vBase }), env, {})).json(); chk('visuais: versão velha (outra pessoa salvou antes) dá conflito e devolve o do servidor', x.ok === false && x.conflito === true && x.dados.tk_po_cta_v1 === '{"b":2}', x);
    x = await (await w.fetch(ped('GET', '/fotos/visuais', 'tk2.gerente'), env, {})).json(); chk('visuais: o conflito não sobrescreveu nada', x.dados.tk_po_cta_v1 === '{"b":2}');
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

  {
    console.log('== FOTOS COM IA (fila que espera a cota) ==');
    const pend = [];
    const A2 = async (m, pth, corpo) => { const r = await w.fetch(ped(m, pth, 'tk2.admin', corpo), env, { waitUntil: (x) => pend.push(x) }); const j = await r.json(); await Promise.all(pend.splice(0)); return { r, j }; };   // espera o disparo imediato (waitUntil) terminar
    const G2 = async (m, pth, corpo) => { const r = await w.fetch(ped(m, pth, 'tk2.gerente', corpo), env, {}); return { r, j: await r.json() }; };
    await A2('POST', '/ia-chave', { chave: GEMINI_OK });
    const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 3)]).toString('base64');
    const foto = { mime: 'image/jpeg', data: JPG };
    let rr, jj;
    ({ r: rr, j: jj } = await A2('GET', '/fotoia/config'));
    chk('config traz a instrução padrão do Pablo (seta, 3 modelos, 9:16) e diz que a chave está guardada', jj.ok && /seta elegante/i.test(jj.config.instrucao) && /FIDELIDADE ABSOLUTA/.test(jj.config.instrucao) && jj.temChave === true && jj.fimChave === GEMINI_OK.slice(-4) && jj.podeEditar === true && jj.config.limiteDia === 20, jj.config && jj.config.limiteDia);
    chk('a chave não aparece em lugar nenhum da config', !JSON.stringify(jj).includes(GEMINI_OK));
    ({ r: rr, j: jj } = await G2('GET', '/fotoia/config')); chk('quem só cadastra vê a config mas NÃO pode editar', jj.ok && jj.podeEditar === false);
    ({ r: rr, j: jj } = await G2('POST', '/fotoia/config', { config: { limiteDia: 3 } })); chk('quem só cadastra NÃO muda a instrução/limites (403)', rr.status === 403);
    ({ r: rr, j: jj } = await w.fetch(ped('GET', '/fotoia/config', 'tk2.cliente'), env, {}).then(async (x) => ({ r: x, j: await x.json() }))); chk('conta comum não entra (403)', rr.status === 403);

    ({ r: rr, j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Cropped Farm', fotos: [] })); chk('sem foto = 400', rr.status === 400);
    ({ r: rr, j: jj } = await A2('POST', '/fotoia/fila', { nome: 'x', fotos: [{ mime: 'image/jpeg', data: Buffer.from('isto não é imagem nenhuma de verdade').toString('base64') }] })); chk('arquivo que não é imagem (bytes) é recusado', rr.status === 400);
    ({ r: rr, j: jj } = await A2('POST', '/fotoia/fila', { nome: 'x', fotos: [{ mime: 'image/jpeg', data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1700 * 1024)]).toString('base64') }] })); chk('foto acima de 1,5 MB é recusada com frase', rr.status === 400 && /1,5 MB/.test(jj.erro), jj);

    // ---- 1) caminho feliz (Interactions) ----
    imgChamadas = []; imgModo = 'ok';
    ({ r: rr, j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Cropped Farm', produto: 'TK-0264', extra: 'fundo areia', fotos: [foto, foto] }));
    chk('pedido entra na fila', rr.status === 200 && jj.ok && jj.id > 0, jj);
    const id1 = jj.id; let pf;                // o pedido já dispara a geração na hora (waitUntil); o A2 espera terminar
    ({ j: jj } = await A2('GET', '/fotoia/lista'));
    let it = jj.itens.find((x) => x.id === id1); chk('ficou PRONTA, com endereço da imagem e o modelo usado', it && it.status === 'pronta' && /\/m\/\d{6}\/[0-9a-f]{20}\.jpg$/.test(it.resultado) && it.modelo === 'gemini-nano-banana-2.1', it);
    const c1 = imgChamadas[0];
    chk('1º jeito = Interactions, com a chave no CABEÇALHO e nunca na URL', c1 && c1.viaInter && c1.headers.get('x-goog-api-key') === GEMINI_OK && !c1.url.includes(GEMINI_OK), c1 && c1.url);
    chk('o pedido leva a instrução do Pablo, o nome da peça, a observação e as 2 fotos como imagem', c1.body.input[0].text.includes('FIDELIDADE ABSOLUTA') && /Cropped Farm/.test(c1.body.input[0].text) && /fundo areia/.test(c1.body.input[0].text) && c1.body.input.filter((x) => x.type === 'image' && x.data).length === 2 && c1.body.response_format.aspect_ratio === '9:16', c1.body.response_format);
    chk('"--ar 9:16" vira texto comum (não é comando de Midjourney)', !/--ar/.test(c1.body.input[0].text) && /proporção 9:16/.test(c1.body.input[0].text));
    const resChave = (await DB.prepare("SELECT resultado FROM fotoia WHERE id=?").bind(id1).first()).resultado;
    chk('a imagem foi guardada no R2 (e fonte em t/, a temporária)', objs.has(resChave) && JSON.parse((await DB.prepare('SELECT fontes FROM fotoia WHERE id=?').bind(id1).first()).fontes).every((k) => /^t\//.test(k) && objs.has(k)));
    ({ j: jj } = await A2('GET', '/fotoia/config')); chk('contador do dia subiu (1 de 20)', jj.hoje.usadas === 1 && jj.hoje.limite === 20, jj.hoje);

    // ---- 2) sem cota: NÃO perde, volta para a fila com horário ----
    imgChamadas = []; imgModo = 'cota';
    ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Saia Jeans', fotos: [foto] })); const id2 = jj.id;
    ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === id2);
    chk('cota acabou: continua NA FILA (não vira erro), com horário para tentar de novo e frase clara', it.status === 'fila' && it.espera && /cota/i.test(it.erro) && Date.parse(it.espera) > Date.now() + 4 * 60000 && it.tent === 0, it);
    chk('a chave não vaza na frase de erro', !JSON.stringify(jj).includes(GEMINI_OK));
    const nChamou = imgChamadas.length; chk('tentou os 4 modelos antes de desistir (cada um tem a sua cota)', new Set(imgChamadas.map((x) => x.modelo)).size === 4, imgChamadas.map((x) => x.modelo));
    imgChamadas = []; pf = await W.processarFotoIA(env);
    chk('antes do horário nada é chamado de novo (não gasta tentativa)', imgChamadas.length === 0 && pf.feitas === 0, pf);
    // ---- 3) cota volta: o cron pega sozinho ----
    imgModo = 'ok'; await env.CACHE.delete('ia_esgotados'); await DB.prepare("UPDATE fotoia SET prox_em='2000-01-01T00:00:00Z' WHERE id=?").bind(id2).run();
    pf = await W.processarFotoIA(env); ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === id2);
    chk('cota voltou: o cron faz o pedido que esperava', pf.feitas === 1 && it.status === 'pronta' && it.erro === '', { pf, it });
    // ---- 4) plano gratuito sem imagem (limit: 0) ----
    imgModo = 'semplano'; await env.CACHE.delete('ia_esgotados');
    ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Short', fotos: [foto] })); const id3 = jj.id;
    ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === id3);
    chk('limite 0 (plano sem imagens): fila, frase honesta e espera longa (≥ 5 h)', it.status === 'fila' && /não inclui geração de imagens/.test(it.erro) && Date.parse(it.espera) > Date.now() + 5 * 3600000, it);
    // ---- 5) um modelo sem cota, o próximo faz ----
    imgModo = 'cota1'; await env.CACHE.delete('ia_esgotados'); imgChamadas = [];
    await A2('POST', '/fotoia/acao', { id: id3, acao: 'agora' });
    ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === id3);
    chk('1º modelo sem cota: usa o 2º da lista e fica pronta', it.status === 'pronta' && it.modelo === 'gemini-3.1-flash-lite-image', it);
    // ---- 6) só o jeito clássico funciona ----
    imgModo = 'so-classico'; await env.CACHE.delete('ia_esgotados'); imgChamadas = [];
    ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Body', fotos: [foto] })); const id4 = jj.id;
    ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === id4);
    chk('Interactions responde 404: cai para generateContent e acha a imagem em inlineData', it.status === 'pronta' && imgChamadas.some((x) => !x.viaInter) && imgChamadas[imgChamadas.length - 1].body.generationConfig.imageConfig.aspectRatio === '9:16', imgChamadas.map((x) => x.url));
    // ---- 7) a IA responde só com texto (recusa) ----
    imgModo = 'recusa'; ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Vestido', fotos: [foto] })); const id5 = jj.id;
    ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === id5);
    chk('resposta sem imagem: conta tentativa, mostra o que a IA disse e tenta de novo depois', it.status === 'fila' && it.tent === 1 && /Não posso gerar/.test(it.erro) && it.espera, it);
    for (let i = 0; i < 2; i++) { await DB.prepare("UPDATE fotoia SET prox_em='' WHERE id=?").bind(id5).run(); await W.processarFotoIA(env, id5); }
    ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === id5); chk('3 tentativas sem imagem: vira ERRO (não fica tentando para sempre)', it.status === 'erro' && it.tent === 3, it);
    // ---- 8) chave recusada ----
    imgModo = '403'; ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Calça', fotos: [foto] })); const id6 = jj.id;
    ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === id6); chk('chave recusada pelo Google: erro na hora, com frase', it.status === 'erro' && /recusou a chave/.test(it.erro), it);
    // ---- 9) arquivo que a IA devolve não é imagem ----
    imgModo = 'lixo'; ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Blusa', fotos: [foto] })); const id7 = jj.id;
    ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === id7); chk('bytes que não são JPG/PNG/WEBP não viram "pronta"', it.status === 'erro' && /não é imagem/.test(it.erro), it);
    imgModo = 'ok';
    // ---- 10) limite diário ----
    ({ r: rr, j: jj } = await A2('POST', '/fotoia/config', { config: { limiteDia: 2 } })); chk('gestor muda o limite por dia', jj.ok && jj.config.limiteDia === 2);
    ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Cinto', fotos: [foto] })); const id8 = jj.id; imgChamadas = [];
    pf = await W.processarFotoIA(env, id8); ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === id8);
    chk('passou do limite do dia: NÃO chama o Google, fica na fila até amanhã', pf.limiteDia === true && imgChamadas.length === 0 && it.status === 'fila' && /Limite de 2/.test(it.erro) && Date.parse(it.espera) > Date.now(), { pf, it });
    await A2('POST', '/fotoia/config', { config: { limiteDia: 20 } });
    // ---- 11) instrução editada vale na hora ----
    ({ r: rr, j: jj } = await A2('POST', '/fotoia/config', { config: { instrucao: 'FAÇA UMA FOTO SIMPLES COM FUNDO AZUL. ' + 'x'.repeat(20), formato: '4:5', modelos: 'gemini-nano-banana-2.1\n  modelo invalido!!\n gemini-3.1-flash-image' } }));
    chk('instrução, formato e lista de modelos salvos (modelo com caracteres estranhos é descartado)', jj.ok && /FUNDO AZUL/.test(jj.config.instrucao) && jj.config.formato === '4:5' && JSON.stringify(jj.config.modelos) === JSON.stringify(['gemini-nano-banana-2.1', 'gemini-3.1-flash-image']), jj.config);
    imgChamadas = []; await DB.prepare("UPDATE fotoia SET prox_em='' WHERE id=?").bind(id8).run(); await env.CACHE.delete('ia_esgotados'); await W.processarFotoIA(env, id8);
    chk('a instrução NOVA e o formato novo são os que vão ao Google', imgChamadas.length >= 1 && /FUNDO AZUL/.test(imgChamadas[0].body.input[0].text) && imgChamadas[0].body.response_format.aspect_ratio === '4:5' && !/FIDELIDADE/.test(imgChamadas[0].body.input[0].text), imgChamadas[0] && imgChamadas[0].body.response_format);
    ({ j: jj } = await A2('POST', '/fotoia/config', { padrao: true })); chk('"Voltar ao padrão" restaura a instrução do Pablo', /FIDELIDADE ABSOLUTA/.test(jj.config.instrucao) && jj.config.formato === '9:16');
    ({ j: jj } = await A2('POST', '/fotoia/config', { config: { instrucao: '   ' } })); chk('instrução em branco volta para a padrão (nunca manda pedido vazio)', /FIDELIDADE ABSOLUTA/.test(jj.config.instrucao));
    // ---- 12) ações: aprovar, descartar, refazer, cancelar ----
    ({ r: rr } = await A2('POST', '/fotoia/acao', { id: id1, acao: 'aprovar' })); ({ j: jj } = await A2('GET', '/fotoia/lista')); chk('aprovar', rr.status === 200 && jj.itens.find((x) => x.id === id1).status === 'aprovada');
    const usoAntes = (await KV.get('uso', 'json')).bytes;
    ({ r: rr } = await A2('POST', '/fotoia/acao', { id: id2, acao: 'descartar' })); const k2 = resChave;
    chk('descartar apaga a imagem do R2 e devolve o espaço do contador', rr.status === 200 && (await KV.get('uso', 'json')).bytes < usoAntes, { usoAntes, depois: (await KV.get('uso', 'json')).bytes });
    ({ r: rr } = await A2('POST', '/fotoia/acao', { id: id1, acao: 'aprovar' })); chk('ação que não vale para o estado atual = 400', rr.status === 400);
    const id9 = (await DB.prepare("INSERT INTO fotoia (status, prox_em, fontes, criado_em) VALUES ('fila','2999-01-01T00:00:00Z','[]','x')").run()).meta.last_row_id;
    ({ r: rr } = await A2('POST', '/fotoia/acao', { id: id9, acao: 'cancelar' })); ({ j: jj } = await A2('GET', '/fotoia/lista?status=cancelada')); chk('cancelar tira da fila', rr.status === 200 && jj.itens.some((x) => x.id === id9));
    ({ r: rr } = await A2('POST', '/fotoia/acao', { id: id1, acao: 'refazer' })); ({ j: jj } = await A2('GET', '/fotoia/lista')); chk('refazer volta para a fila (e já dispara)', rr.status === 200 && ['fila', 'gerando', 'pronta'].includes(jj.itens.find((x) => x.id === id1).status));
    // ---- 13) sem chave / desligado ----
    await A2('POST', '/fotoia/config', { config: { ligado: false } }); ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Parado', fotos: [foto] })); imgChamadas = [];
    pf = await W.processarFotoIA(env); chk('desligado: o pedido espera na fila e nada é chamado', pf.desligado === true && imgChamadas.length === 0, pf);
    await A2('POST', '/fotoia/config', { config: { ligado: true } });
    await DB.prepare("DELETE FROM cfg WHERE chave='gemini_key'").run(); imgChamadas = []; pf = await W.processarFotoIA(env);
    chk('sem a chave do Gemini: nada é chamado, pedidos ficam na fila', pf.semChave === true && imgChamadas.length === 0, pf);
    ({ j: jj } = await A2('GET', '/fotoia/config')); chk('config diz que falta a chave', jj.temChave === false);
    await A2('POST', '/ia-chave', { chave: GEMINI_OK });
    // ---- 14) fila cheia ----
    await DB.prepare("DELETE FROM fotoia").run();
    for (let i = 0; i < 40; i++) await DB.prepare("INSERT INTO fotoia (status, prox_em, fontes, criado_em) VALUES ('fila','2999-01-01T00:00:00Z','[]','x')").run();
    ({ r: rr, j: jj } = await A2('POST', '/fotoia/fila', { nome: 'a mais', fotos: [foto] })); chk('fila cheia (40 esperando) = 429 com frase', rr.status === 429 && /40/.test(jj.erro), jj);
    // ---- 15) a leitura da imagem acha a imagem em qualquer formato ----
    const ach = W.acharImagensIA; const big = Buffer.alloc(300, 1).toString('base64');
    chk('acha em outputs/steps/candidates/inlineData/inline_data e pega a ÚLTIMA', ach({ outputs: [{ type: 'image', mime_type: 'image/png', data: big }] }).length === 1 && ach({ a: { b: [{ inline_data: { mime_type: 'image/webp', data: big } }] } })[0].mime === 'image/webp' && ach({ x: [{ mimeType: 'image/jpeg', data: big }, { mimeType: 'image/png', data: big + 'AA' }] }).slice(-1)[0].mime === 'image/png' && ach({ data: 'curto', mime_type: 'image/png' }).length === 0 && ach(null).length === 0);
    // ---- 16) 2º motor: Cloudflare Workers AI (FLUX.2 klein) — grátis por dia; Gemini sem cota não trava mais ----
    console.log('== FOTOS COM IA — Cloudflare como 2º motor ==');
    const jpgDim = (w, h) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), Buffer.alloc(300, 7)]).toString('base64');
    const ref = { mime: 'image/jpeg', data: jpgDim(400, 300) };
    let aiChamadas = [], aiModo = 'ok';
    env.AI = { run: async (modelo, entrada) => {
      const fd = await new Response(entrada.multipart.body, { headers: { 'content-type': entrada.multipart.contentType } }).formData();
      const campos = {}; for (const [k, v] of fd.entries()) campos[k] = typeof v === 'string' ? v : { arquivo: true, tam: v.size };
      aiChamadas.push({ modelo, campos });
      if (aiModo === 'cota') throw new Error('4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare\'s Workers Paid plan if you would like to continue usage.');
      if (aiModo === 'ocupado') throw new Error('3040: Capacity temporarily exceeded, please try again.');
      if (aiModo === 'sem-imagem') return { image: '' };
      if (aiModo === 'recusa') throw new Error('3030: input prompt flagged');
      return { image: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 9)]).toString('base64') };
    } };
    await DB.prepare('DELETE FROM fotoia').run(); await env.CACHE.delete('ia_esgotados'); await env.CACHE.delete('fotoia_cf_ate'); await KV.delete('fotoia_dia');
    await A2('POST', '/fotoia/config', { padrao: true }); await A2('POST', '/fotoia/config', { config: { limiteDia: 200 } });
    ({ j: jj } = await A2('GET', '/fotoia/config'));
    chk('config informa que o Cloudflare está ligado e traz o padrão dele', jj.cloudflare && jj.cloudflare.disponivel === true && jj.config.provedores.join() === 'gemini,cloudflare' && jj.config.cfModelo === '@cf/black-forest-labs/flux-2-klein-4b' && /\{nome\}/.test(jj.config.instrucaoCf) && /EXACTLY the garment/.test(jj.padrao.instrucaoCf), jj.cloudflare);
    ({ j: jj } = await A2('POST', '/fotoia/config', { config: { cfModelo: 'qualquer coisa; rm -rf', provedores: ['x', 'cloudflare', 'cloudflare'] } }));
    chk('modelo estranho volta ao padrão; motor desconhecido é ignorado e repetido some', jj.config.cfModelo === '@cf/black-forest-labs/flux-2-klein-4b' && jj.config.provedores.join() === 'cloudflare', jj.config);
    await A2('POST', '/fotoia/config', { config: { provedores: ['gemini', 'cloudflare'] } });

    // a) Gemini sem plano (cota 0) → o Cloudflare entra sozinho
    imgModo = 'semplano'; imgChamadas = []; aiChamadas = []; aiModo = 'ok';
    ({ r: rr, j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Cropped Farm', extra: 'fundo areia', fotos: [foto, foto], refs: [ref, ref] }));
    const idc1 = jj.id; ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === idc1);
    chk('Gemini cota 0 + Cloudflare ligado: a imagem SAI pelo Cloudflare (pronta, modelo cloudflare:…)', it && it.status === 'pronta' && it.modelo === 'cloudflare:flux-2-klein-4b' && /\/m\/\d{6}\/[0-9a-f]{20}\.jpg$/.test(it.resultado), it);
    const ac = aiChamadas[0] || { campos: {} };
    chk('foi pedido com 2 fotos de referência, tamanho 720×1280 (9:16) e o nome da peça na instrução', aiChamadas.length === 1 && ac.modelo === '@cf/black-forest-labs/flux-2-klein-4b' && ac.campos.input_image_0 && ac.campos.input_image_1 && !ac.campos.input_image_2 && ac.campos.width === '720' && ac.campos.height === '1280' && /Product: Cropped Farm\./.test(ac.campos.prompt) && /fundo areia/.test(ac.campos.prompt) && /EXACTLY the garment/.test(ac.campos.prompt), ac);
    chk('o Gemini foi tentado antes (e esbarrou na cota) — ficou de molho para não repetir', imgChamadas.length >= 1 && !!(await env.CACHE.get('ia_esgotados')));

    // b) Gemini com cota: ele vem primeiro e o Cloudflare nem é chamado
    await env.CACHE.delete('ia_esgotados'); imgModo = 'ok'; imgChamadas = []; aiChamadas = [];
    ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Vestido', fotos: [foto], refs: [ref] })); const idc2 = jj.id; ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === idc2);
    chk('Gemini com cota: usa o Gemini e NÃO gasta o grátis do Cloudflare', it.status === 'pronta' && /^gemini/.test(it.modelo) && aiChamadas.length === 0, it);

    // c) grátis do dia do Cloudflare acaba (erro 4006) → pedido espera até a manhã seguinte; os próximos nem chamam
    await env.CACHE.delete('ia_esgotados'); imgModo = 'semplano'; aiModo = 'cota'; aiChamadas = [];
    ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Blusa', fotos: [foto], refs: [ref] })); const idc3 = jj.id; ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === idc3);
    chk('Gemini sem plano + Cloudflare sem grátis: NA FILA (não vira erro), com o motivo dos dois', it.status === 'fila' && /Gemini: o plano desta chave não inclui/.test(it.erro) && /Cloudflare: o grátis de hoje/.test(it.erro) && it.tent === 0, it);
    const amanhaUtc = new Date(); amanhaUtc.setUTCHours(24, 0, 0, 0);
    chk('volta a tentar quando o PRIMEIRO motor puder (Gemini 6 h ou meia-noite UTC), nunca antes de 5 min', Date.parse(it.espera) > Date.now() + 5 * 60000 && Date.parse(it.espera) <= Math.min(Date.now() + 6 * 3600000, amanhaUtc.getTime() + 10 * 60000) + 60000, it.espera);
    chk('guardou "sem grátis até" e o painel é avisado', !!(await env.CACHE.get('fotoia_cf_ate')) && (await A2('GET', '/fotoia/config')).j.cloudflare.semGratisAte !== '');
    aiChamadas = []; await DB.prepare("UPDATE fotoia SET prox_em='' WHERE id=?").bind(idc3).run(); await env.CACHE.delete('ia_esgotados'); await W.processarFotoIA(env, idc3);
    chk('com o grátis acabado, nem chama o Cloudflare de novo (sem desperdício)', aiChamadas.length === 0);

    // d) Cloudflare ocupado → tenta de novo em minutos
    await env.CACHE.delete('fotoia_cf_ate'); await env.CACHE.delete('ia_esgotados'); aiModo = 'ocupado'; aiChamadas = [];
    await DB.prepare("UPDATE fotoia SET prox_em='' WHERE id=?").bind(idc3).run(); await W.processarFotoIA(env, idc3);
    ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === idc3);
    chk('Cloudflare ocupado (3040): continua na fila e tenta de novo em ~10 min', aiChamadas.length === 1 && it.status === 'fila' && Date.parse(it.espera) > Date.now() + 5 * 60000 && Date.parse(it.espera) < Date.now() + 40 * 60000 && /ocupado/.test(it.erro), it);

    // e) liberou: o mesmo pedido sai
    await env.CACHE.delete('ia_esgotados'); aiModo = 'ok'; await DB.prepare("UPDATE fotoia SET prox_em='' WHERE id=?").bind(idc3).run(); await W.processarFotoIA(env, idc3);
    ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === idc3); chk('quando o Cloudflare volta, o pedido que esperava sai sozinho', it.status === 'pronta' && /^cloudflare:/.test(it.modelo), it);

    // f) erros de verdade contam tentativa (3 = erro), como no Gemini
    imgModo = 'semplano'; aiModo = 'recusa'; await env.CACHE.delete('ia_esgotados');
    ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Calça', fotos: [foto], refs: [ref] })); const idc4 = jj.id; ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === idc4);
    chk('recusa do Cloudflare: erro com frase, volta à fila com 1 tentativa (não trava os outros)', it.status === 'fila' && it.tent === 1 && /Cloudflare: 3030/.test(it.erro), it);

    // g) pedido SEM foto pequena (feito antes desta versão): não chama o Cloudflare e explica
    aiModo = 'ok'; aiChamadas = []; await env.CACHE.delete('ia_esgotados');
    ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Antigo', fotos: [foto] })); const idc5 = jj.id; ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === idc5);
    chk('pedido sem foto pequena: não chama o Cloudflare e diz como resolver', aiChamadas.length === 0 && /foto pequena/.test(it.erro) && it.status === 'fila', it);
    ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Grande', fotos: [foto], refs: [{ mime: 'image/jpeg', data: jpgDim(900, 700) }] })); const idc6 = jj.id;
    chk('referência maior que 511 px é descartada no servidor (o Cloudflare recusaria)', (await DB.prepare('SELECT refs FROM fotoia WHERE id=?').bind(idc6).first()).refs === '[]');
    ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Ok', fotos: [foto], refs: [ref, ref, ref, ref, ref] })); const idc7 = jj.id;
    chk('até 4 referências pequenas são guardadas', JSON.parse((await DB.prepare('SELECT refs FROM fotoia WHERE id=?').bind(idc7).first()).refs).length === 4);
    chk('dimensoesImagem lê JPEG e PNG pelo cabeçalho', JSON.stringify(W.dimensoesImagem(Buffer.from(jpgDim(400, 300), 'base64'))) === '[400,300]' && JSON.stringify(W.dimensoesImagem(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 1, 144, 0, 0, 1, 44]), Buffer.alloc(20)]))) === '[400,300]');

    // h) só Cloudflare: o Gemini nem é chamado; sem chave do Gemini também funciona
    await DB.prepare('DELETE FROM fotoia').run(); await A2('POST', '/fotoia/config', { config: { provedores: ['cloudflare'] } }); imgChamadas = []; aiChamadas = []; aiModo = 'ok'; imgModo = 'ok';
    await DB.prepare("DELETE FROM cfg WHERE chave='gemini_key'").run();
    ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Saia', fotos: [foto], refs: [ref] })); const idc8 = jj.id; ({ j: jj } = await A2('GET', '/fotoia/lista')); it = jj.itens.find((x) => x.id === idc8);
    chk('só Cloudflare e SEM chave do Gemini: funciona e o Google nem é chamado', it.status === 'pronta' && /^cloudflare:/.test(it.modelo) && imgChamadas.length === 0, it);
    await A2('POST', '/fotoia/config', { config: { provedores: ['cloudflare', 'gemini'], formato: '4:5', tamanho: '2K' } });
    aiChamadas = []; ({ j: jj } = await A2('POST', '/fotoia/fila', { nome: 'Short', fotos: [foto], refs: [ref] }));
    chk('proporção e tamanho da config valem (4:5 em 2K = 1088×1360)', aiChamadas.length === 1 && aiChamadas[0].campos.width === '1088' && aiChamadas[0].campos.height === '1360', aiChamadas[0]);
    chk('promptCf troca {nome}/{extra}/{formato} e acrescenta o produto se a instrução não tiver {nome}', W.promptCf({ instrucaoCf: 'Foto de {formato}. {extra}', formato: '9:16' }, { nome: 'Vestido', extra: 'sem sol' }, 1) === 'Foto de 9:16. sem sol\nProduct: Vestido.', W.promptCf({ instrucaoCf: 'Foto de {formato}. {extra}', formato: '9:16' }, { nome: 'Vestido', extra: 'sem sol' }, 1));
    chk('tamanhoCf: 9:16 1K = 720×1280; 16:9 2K = 1920×1088 (dentro do máx. de 1920)', W.tamanhoCf('9:16', '1K').join() === '720,1280' && W.tamanhoCf('16:9', '2K').join() === '1920,1088' && W.tamanhoCf('xx', 'yy').join() === '720,1280');
    delete env.AI; await A2('POST', '/ia-chave', { chave: GEMINI_OK }); await A2('POST', '/fotoia/config', { padrao: true });
  }

  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length, falhas);
  process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE', e); process.exit(2); });
