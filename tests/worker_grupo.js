// Testa instagram-worker/worker.js com D1 REAL (SQLite do Node), R2/KV/cache e Instagram FALSOS. Nada vai à Meta, à Cloudflare nem ao Google.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_grupo.mjs');
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

  // ---------- Canal de postagem (v1.3) ----------
  // Wafly (WhatsApp) é simulada pelo "api.fake": o worker chama waflyStatusRemoto e recebemos o pedido.
  let zapPedidos = [], zapModo = 'ok';
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://api.fake') && init && init.method === 'POST') {
      const b = JSON.parse(init.body);
      if (b.action === 'waflyStatusRemoto') {
        zapPedidos.push(b);
        if (zapModo === 'erro') return new Response(JSON.stringify({ ok: false, erro: 'Ponte do Worker desligada (defina WORKER_TOKEN nas Propriedades do Script).' }));
        return new Response(JSON.stringify({ ok: true, requestId: b.requestId, estado: 'accepted' }));
      }
    }
    return fetchAntes(u, init);
  };
  const midiaFeed = JSON.stringify([{ url: 'https://x/m/t/202610/dddddddddddddddddddd.jpg', tipo: 'imagem' }]);
  const novaPostagem = async (canal, status) => {
    const r = await DB.prepare("INSERT INTO postagem (tipo, modo, legenda, midias, agendado_em, status, canal) VALUES ('feed','auto','Vestido TK-0001 R$ 89,90', ?, ?, ?, ?)").bind(midiaFeed, '2020-01-01T00:00:00Z', status || 'agendado', canal).run();
    return Number(r.lastInsertRowid ?? r.meta?.last_row_id ?? (await DB.prepare("SELECT MAX(id) AS i FROM postagem").first()).i);
  };
  const lerPost = async (id) => DB.prepare("SELECT * FROM postagem WHERE id=?").bind(id).first();
  const cfg = (k, v) => DB.prepare("INSERT OR REPLACE INTO cfg (chave, valor) VALUES (?, ?)").bind(k, v).run();


  await W.processarPostagens(env);
  await cfg('po_cfg', JSON.stringify({pausaAtiva:false}));
  env.WAFLY_GRUPO_CLIENTES = JSON.stringify({instance:'INST_TESTE', token:'TOKEN_TESTE',clientToken:'CLIENT_TESTE',phone:'120363000000000000-group'});
  let grupoCalls=[], modo='ok';
  const fAnterior=globalThis.fetch;
  globalThis.fetch=async(u,init)=>{
    if(String(u).startsWith('https://wafly.com.br/')) {
      grupoCalls.push({url:String(u),body:JSON.parse(init.body),headers:new Headers(init.headers)});
      if(modo==='timeout') throw new Error('timeout');
      if(modo==='negado') return new Response(JSON.stringify({error:'sem permissão TOKEN_TESTE'}),{status:403});
      return new Response(JSON.stringify({value:true,messageId:'M-'+grupoCalls.length}));
    }
    return fAnterior(u,init);
  };
  let id=await novaPostagem('grupo');
  await W.processarPostagens(env);
  chk('grupo sem Instagram publica com legenda e destino privado', (await lerPost(id)).status==='publicado' && grupoCalls.length===1 && grupoCalls[0].body.caption==='Vestido TK-0001 R$ 89,90' && grupoCalls[0].body.phone==='120363000000000000-group');
  chk('usa send-image e header, sem messageId como falsa idempotência',grupoCalls[0].url.endsWith('/send-image')&&grupoCalls[0].headers.get('Client-Token')==='CLIENT_TESTE'&&!grupoCalls[0].body.messageId);
  await W.processarPostagens(env);
  chk('cron não repete envio publicado',grupoCalls.length===1);
  const medias=[{url:'https://cdn.fake/a.jpg',tipo:'imagem'},{url:'https://cdn.fake/b.mp4',tipo:'video'}];
  id=await novaPostagem('grupo');
  await DB.prepare('UPDATE postagem SET midias=? WHERE id=?').bind(JSON.stringify(medias),id).run();
  await Promise.all([W.processarPostagens(env), W.processarPostagens(env)]);
  chk('carrossel misto mantém ordem e legenda em cada mídia',grupoCalls.length===3&&grupoCalls[1].url.endsWith('/send-image')&&grupoCalls[2].url.endsWith('/send-video')&&grupoCalls[2].body.caption==='Vestido TK-0001 R$ 89,90');
  chk('concorrência não duplica mídias', (await lerPost(id)).status==='publicado' && grupoCalls.length===3);
  modo='timeout';id=await novaPostagem('grupo');await W.processarPostagens(env);
  chk('timeout é visível e não publica', (await lerPost(id)).status==='erro');
  const count=grupoCalls.length;
  await DB.prepare("UPDATE postagem SET status='agendado' WHERE id=?").bind(id).run();
  modo='ok';await W.processarPostagens(env);
  chk('tentativa posterior não reenvia resultado incerto',grupoCalls.length===count&&(await lerPost(id)).status==='erro');
  modo='negado';id=await novaPostagem('grupo');await W.processarPostagens(env);
  chk('403 preserva erro legível sem segredo',!(await lerPost(id)).erro.includes('TOKEN_TESTE')&&(await lerPost(id)).status==='erro');
  const r=await A('POST','/post/reagendar',{id,quando:'agora'});
  modo='ok';await W.processarPostagens(env);
  chk('rejeição explícita permite nova tentativa manual',r.j.ok&&(await lerPost(id)).status==='publicado');
  const body={tipo:'story',modo:'manual',legenda:'Legenda aprovada',midias:[medias[0]],quando:ts(10),link:'https://loja.fake/',canal:'instagram',grupoClientes:true};
  const out=await A('POST','/post',body);
  const linhas=(await DB.prepare('SELECT * FROM postagem WHERE id IN (?,?) ORDER BY id').bind(...out.j.ids).all()).results;
  chk('Story manual cria grupo automático independente com legenda',linhas.length===2&&linhas[0].modo==='manual'&&linhas[1].modo==='auto'&&linhas[1].canal==='grupo'&&linhas[1].legenda===body.legenda);
  chk('fila identifica destino grupo', (await A('GET','/posts')).j.posts.some(p=>p.canal==='grupo'));
  await cfg('ig_token',TOKEN);
  for(const tipo of ['feed','carrossel','reels','story']) {
    const midias=tipo==='carrossel'?medias:tipo==='reels'?[medias[1]]:[medias[0]];
    const out=await A('POST','/post',{tipo,midias,quando:ts(20),canal:'ambos',grupoClientes:true,legenda:'Com legenda'});
    chk(tipo+' combina Instagram/Status/grupo',out.j.ok&&out.j.ids.length===2);
  }
  const soZap=await A('POST','/post',{tipo:'feed',midias:[medias[0]],quando:ts(25),canal:'whatsapp',grupoClientes:true,legenda:'Só WhatsApp'});
  chk('Status do WhatsApp pode combinar com grupo sem Instagram',soZap.j.ok&&soZap.j.ids.length===2);
  const forbidden=await w.fetch(ped('POST','/post','tk2.cliente',body),env,{});
  chk('cliente sem permissão não agenda publicação no grupo',forbidden.status===403);
  const antes=Number((await DB.prepare('SELECT COUNT(*) AS n FROM postagem').first()).n);
  delete env.WAFLY_GRUPO_CLIENTES;
  const sem=await A('POST','/post',body);
  chk('sem configuração recusa antes de criar qualquer destino',sem.r.status===409&&Number((await DB.prepare('SELECT COUNT(*) AS n FROM postagem').first()).n)===antes);
  chk('grupo tem intervalo e limite próprios',JSON.stringify(W.bucketsDoPost('feed','grupo'))==='["grupo"]'&&W.CANAL_FILA_PADRAO.grupo.max24h===40);
  console.log('\nOK='+ok+' FALHAS='+falhas.length,falhas);process.exit(falhas.length?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
