// Testa midia-worker/worker.js com R2, KV, cache e Apps Script FALSOS (nada vai à Cloudflare nem ao Google).
const fs = require('fs'), path = require('path'), os = require('os');
const tmp = path.join(os.tmpdir(), 'tk_midia_worker.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '..', 'midia-worker', 'worker.js')));
let ok = 0, falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };

(async () => {
  const W = await import(tmp); const w = W.default;
  const mem = new Map(); const cacheMem = new Map();
  globalThis.caches = { default: { async match(r) { const v = cacheMem.get(r.url); return v ? new Response(v) : undefined; }, async put(r, x) { cacheMem.set(r.url, await x.text()); } } };
  const objs = new Map();
  const R2 = {
    async put(k, b, o) { objs.set(k, { b: Buffer.from(b), o }); },
    async head(k) { const x = objs.get(k); return x ? { size: x.b.length } : null; },
    async delete(k) { objs.delete(k); },
    async get(k, op) { const x = objs.get(k); if (!x) return null; const o = { size: x.b.length, httpEtag: '"e"', httpMetadata: { contentType: x.o.httpMetadata.contentType }, body: new Blob([x.b]).stream() };
      if (op && op.range) { const m = /bytes=(\d+)-(\d*)/.exec(op.range.get('Range')); const a = +m[1], z = m[2] ? +m[2] : x.b.length - 1; o.range = { offset: a, length: z - a + 1 }; o.body = new Blob([x.b.subarray(a, z + 1)]).stream(); } return o; }
  };
  const KV = { async get(k, t) { const v = mem.get(k); return v === undefined ? null : (t === 'json' ? JSON.parse(v) : v); }, async put(k, v) { mem.set(k, String(v)); } };
  let chamadasApi = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => { if (String(u).startsWith('https://api.fake')) { chamadasApi++; const b = JSON.parse(init.body);
      if (b.sessao === 'tk2.admin') return new Response(JSON.stringify({ ok: true, usuario: { permissoes: ['catalogo_cadastrar', 'catalogo_excluir'] } }));
      if (b.sessao === 'tk2.cadastra') return new Response(JSON.stringify({ ok: true, usuario: { permissoes: ['catalogo_cadastrar'] } }));
      if (b.sessao === 'tk2.cliente') return new Response(JSON.stringify({ ok: true, usuario: { permissoes: [] } }));
      return new Response(JSON.stringify({ ok: false })); } return realFetch(u, init); };
  const env = { MIDIA: R2, CACHE: KV, API_URL: 'https://api.fake/exec' };
  const O = 'https://tenkitermodas.com.br';
  const pedido = (m, p, sess, corpo, extra) => new Request('https://midia.test' + p, { method: m, headers: Object.assign({ Origin: O, 'X-TK-Whats': '88999990000', 'X-TK-Sessao': sess || '' }, extra || {}), body: corpo });
  const jpg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(1000, 1)]);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(1000, 2)]);
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(100)]);

  console.log('== Tipo pelos bytes ==');
  chk('JPG', W.tipoPelosBytes(jpg).ext === 'jpg'); chk('MP4', W.tipoPelosBytes(mp4).ext === 'mp4'); chk('HEIC recusado', W.tipoPelosBytes(heic) === null);
  chk('texto/HTML recusado', W.tipoPelosBytes(Buffer.from('<html><script>alert(1)</script>')) === null);

  console.log('== Quem pode enviar ==');
  let r = await w.fetch(pedido('POST', '/u', '', jpg, { 'Content-Length': String(jpg.length) }), env); chk('sem sessão = 401', r.status === 401);
  r = await w.fetch(pedido('POST', '/u', 'senha123', jpg, { 'Content-Length': String(jpg.length) }), env); chk('senha (não é token) = 401', r.status === 401);
  r = await w.fetch(pedido('POST', '/u', 'tk2.cliente', jpg, { 'Content-Length': String(jpg.length) }), env); chk('cliente sem permissão = 403', r.status === 403);
  r = await w.fetch(pedido('POST', '/u', 'tk2.errada', jpg, { 'Content-Length': String(jpg.length) }), env); chk('sessão inválida = 401', r.status === 401);

  console.log('== Envio e leitura ==');
  r = await w.fetch(pedido('POST', '/u', 'tk2.cadastra', jpg, { 'Content-Length': String(jpg.length) }), env); let j = await r.json();
  chk('equipe envia foto', r.status === 200 && j.ok && /^[0-9]{6}\/[0-9a-f]{20}\.jpg$/.test(j.chave), j);
  chk('CORS só para o site', r.headers.get('Access-Control-Allow-Origin') === O);
  const chave = j.chave;
  r = await w.fetch(new Request('https://midia.test/m/' + chave), env);
  chk('foto pública, cache de 1 ano', r.status === 200 && /immutable/.test(r.headers.get('Cache-Control')) && r.headers.get('Content-Type') === 'image/jpeg');
  r = await w.fetch(new Request('https://midia.test/m/' + chave, { headers: { Range: 'bytes=0-9' } }), env);
  chk('Range (vídeo) devolve 206', r.status === 206 && r.headers.get('Content-Range').startsWith('bytes 0-9/'), r.status);
  r = await w.fetch(new Request('https://midia.test/m/202610/zzzz.jpg'), env); chk('chave fora do padrão = 404', r.status === 404);
  const antes = chamadasApi;
  await w.fetch(pedido('GET', '/uso', 'tk2.cadastra'), env); chk('sessão guardada 2 min (não pergunta ao Google de novo)', chamadasApi === antes);
  r = await w.fetch(pedido('GET', '/uso', 'tk2.cadastra'), env); j = await r.json(); chk('uso conta 1 arquivo', j.arquivos === 1 && j.bytes === jpg.length && j.limite > 9e9, j);

  console.log('== Travas de custo ==');
  const grande = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(3 * 1024 * 1024)]);
  r = await w.fetch(pedido('POST', '/u', 'tk2.cadastra', grande, { 'Content-Length': String(grande.length) }), env); chk('foto de 3 MB recusada (413)', r.status === 413);
  const enorme = Buffer.concat([mp4, Buffer.alloc(16 * 1024 * 1024)]);
  r = await w.fetch(pedido('POST', '/u', 'tk2.cadastra', enorme, { 'Content-Length': String(enorme.length) }), env); chk('vídeo de 16 MB recusado (413)', r.status === 413);
  r = await w.fetch(pedido('POST', '/u', 'tk2.cadastra', mp4, { 'Content-Length': String(mp4.length) }), env); chk('vídeo pequeno aceito', r.status === 200);
  r = await w.fetch(pedido('POST', '/u', 'tk2.cadastra', Buffer.from('MZ' + 'x'.repeat(500)), { 'Content-Length': '502' }), env); chk('arquivo estranho recusado (415)', r.status === 415);
  r = await w.fetch(pedido('POST', '/u', 'tk2.cadastra', heic, { 'Content-Length': String(heic.length) }), env); chk('HEIC recusado (415)', r.status === 415);
  r = await w.fetch(pedido('POST', '/u', 'tk2.cadastra', jpg, {}), env); chk('sem Content-Length = 411', r.status === 411);
  const cheio = Object.assign({}, env, { LIMITE_BYTES: String(jpg.length + mp4.length + 10) });
  r = await w.fetch(pedido('POST', '/u', 'tk2.cadastra', jpg, { 'Content-Length': String(jpg.length) }), cheio); chk('passou do teto de armazenamento = 507', r.status === 507);
  mem.set('env_' + new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), '400');
  r = await w.fetch(pedido('POST', '/u', 'tk2.cadastra', jpg, { 'Content-Length': String(jpg.length) }), env); chk('400 envios no dia = 429', r.status === 429);

  console.log('== Miniatura de vídeo (?poster=) ==');
  mem.delete('env_' + new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10));   // zera o contador do dia (o teste anterior o encheu)
  r = await w.fetch(pedido('POST', '/u', 'tk2.cadastra', mp4, { 'Content-Length': String(mp4.length) }), env); j = await r.json(); const vch = j.chave;
  r = await w.fetch(pedido('POST', '/u?poster=' + vch, 'tk2.cadastra', jpg, { 'Content-Length': String(jpg.length) }), env); j = await r.json();
  chk('miniatura fica com o nome do vídeo + .jpg', r.status === 200 && j.chave === vch.replace('.mp4', '.jpg'), j);
  r = await w.fetch(pedido('POST', '/u?poster=' + vch, 'tk2.cadastra', jpg, { 'Content-Length': String(jpg.length) }), env); j = await r.json(); chk('repetir não duplica nem conta de novo', j.ok && j.jaExistia === true, j);
  r = await w.fetch(pedido('POST', '/u?poster=202610/ffffffffffffffffffff.mp4', 'tk2.cadastra', jpg, { 'Content-Length': String(jpg.length) }), env); chk('vídeo que não existe = 404', r.status === 404);
  r = await w.fetch(pedido('POST', '/u?poster=' + vch, 'tk2.cadastra', mp4, { 'Content-Length': String(mp4.length) }), env); chk('miniatura que não é JPG = 400', r.status === 400);
  r = await w.fetch(pedido('POST', '/u?poster=../../x.mp4', 'tk2.cadastra', jpg, { 'Content-Length': String(jpg.length) }), env); chk('nome de vídeo fora do padrão = 400', r.status === 400);
  const jgrande = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(500 * 1024)]);
  mem.delete('env_' + new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10));
  objs.delete(vch.replace('.mp4', '.jpg'));
  r = await w.fetch(pedido('POST', '/u?poster=' + vch, 'tk2.cadastra', jgrande, { 'Content-Length': String(jgrande.length) }), env); chk('miniatura de 500 KB = 413', r.status === 413);
  r = await w.fetch(pedido('POST', '/u?poster=' + vch, 'tk2.cadastra', jpg, { 'Content-Length': String(jpg.length) }), env);
  r = await w.fetch(pedido('DELETE', '/m/' + vch, 'tk2.admin'), env); chk('apagar o vídeo apaga a miniatura junto', r.status === 200 && !objs.has(vch) && !objs.has(vch.replace('.mp4', '.jpg')));

  console.log('== Apagar ==');
  r = await w.fetch(pedido('DELETE', '/m/' + chave, 'tk2.cadastra'), env); chk('quem só cadastra não apaga (403)', r.status === 403);
  r = await w.fetch(pedido('DELETE', '/m/' + chave, 'tk2.admin'), env); chk('com permissão apaga', r.status === 200 && !objs.has(chave));
  r = await w.fetch(pedido('GET', '/uso', 'tk2.admin'), env); j = await r.json(); chk('uso desce ao apagar', j.arquivos >= 0 && j.arquivos < 5, j);
  r = await w.fetch(new Request('https://midia.test/u', { method: 'OPTIONS', headers: { Origin: O } }), env); chk('OPTIONS 204 com CORS', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === O);
  r = await w.fetch(new Request('https://midia.test/u', { method: 'OPTIONS', headers: { Origin: 'https://malvado.com' } }), env); chk('origem de fora sem CORS', !r.headers.get('Access-Control-Allow-Origin'));

  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length, falhas);
  process.exit(falhas.length ? 1 : 0);
})();
