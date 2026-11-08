// Cópias reduzidas das fotos (midia-worker, 480 e 240 px): envio ?mini=&w=, leitura ?w= com queda para a original, apagar junto,
// contagem de uso/limite e o gerador das fotos antigas (/internal/mini) com identidade OIDC FALSA assinada aqui.
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const tmp = path.join(os.tmpdir(), 'tk_midia_worker_mini.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '..', 'midia-worker', 'worker.js')));
let ok = 0, falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
const b64u = (b) => Buffer.from(b).toString('base64url');

(async () => {
  const W = await import(tmp); const w = W.default;
  const mem = new Map(), cacheMem = new Map();
  globalThis.caches = { default: { async match(r) { const v = cacheMem.get(r.url); return v ? new Response(v) : undefined; }, async put(r, x) { cacheMem.set(r.url, await x.text()); } } };
  const objs = new Map();
  const R2 = {
    async put(k, b, o) { objs.set(k, { b: Buffer.from(b), o }); },
    async head(k) { const x = objs.get(k); return x ? { size: x.b.length } : null; },
    async delete(k) { objs.delete(k); },
    async list(o) { const todas = Array.from(objs.keys()).sort(); const ini = o && o.cursor ? todas.indexOf(o.cursor) : 0; const lim = (o && o.limit) || 1000; const fatia = todas.slice(ini, ini + lim); const trunc = ini + lim < todas.length;
      return { objects: fatia.map((key) => ({ key, size: objs.get(key).b.length })), truncated: trunc, cursor: trunc ? todas[ini + lim] : undefined }; },
    async get(k) { const x = objs.get(k); if (!x) return null; return { size: x.b.length, httpEtag: '"e"', httpMetadata: { contentType: x.o.httpMetadata.contentType }, body: new Blob([x.b]).stream() }; }
  };
  const KV = { async get(k, t) { const v = mem.get(k); return v === undefined ? null : (t === 'json' ? JSON.parse(v) : v); }, async put(k, v) { mem.set(k, String(v)); } };

  // identidade falsa do GitHub: par RSA gerado agora; o "jwks" público devolve a chave pública
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', use: 'sig', alg: 'RS256' });
  const claimsBase = () => { const n = Math.floor(Date.now() / 1000); return { iss: 'https://token.actions.githubusercontent.com', aud: 'tenkiter-midia-mini', repository: 'pablofonteneleadv/tenkiter-catalogo', repository_id: '1366921721', repository_owner_id: '207932006', repository_owner: 'pablofonteneleadv', ref: 'refs/heads/main', workflow_ref: 'pablofonteneleadv/tenkiter-catalogo/.github/workflows/fotos-mini.yml@refs/heads/main', sub: 'repo:x', event_name: 'workflow_dispatch', exp: n + 300, nbf: n - 5 }; };
  const jwt = (claims) => { const cab = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })), cor = b64u(JSON.stringify(claims)); const sig = crypto.sign('RSA-SHA256', Buffer.from(cab + '.' + cor), privateKey); return cab + '.' + cor + '.' + b64u(sig); };

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://api.fake')) { const b = JSON.parse(init.body); return new Response(JSON.stringify(b.sessao === 'tk2.cadastra' ? { ok: true, usuario: { permissoes: ['catalogo_cadastrar'] } } : b.sessao === 'tk2.admin' ? { ok: true, usuario: { permissoes: ['catalogo_cadastrar', 'catalogo_excluir'] } } : { ok: false })); }
    if (String(u).startsWith('https://token.actions.githubusercontent.com/.well-known/jwks')) return new Response(JSON.stringify({ keys: [jwk] }));
    return realFetch(u, init);
  };
  const env = { MIDIA: R2, CACHE: KV, API_URL: 'https://api.fake/exec' };
  const O = 'https://tenkitermodas.com.br';
  const pedido = (m, p, sess, corpo, extra) => new Request('https://midia.test' + p, { method: m, headers: Object.assign({ Origin: O, 'X-TK-Whats': '88999990000', 'X-TK-Sessao': sess || '' }, extra || {}), body: corpo });
  const jpgDe = (n, b) => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(n, b || 1)]);
  const orig = jpgDe(300 * 1024, 7), mini = jpgDe(40 * 1024, 9), mini240 = jpgDe(9 * 1024, 5);
  const up = (p, corpo, sess) => w.fetch(pedido('POST', p, sess || 'tk2.cadastra', corpo, { 'Content-Length': String(corpo.length) }), env);

  console.log('== Envio da cópia (?mini=) ==');
  let r = await up('/u', orig); let j = await r.json(); const chave = j.chave;
  chk('foto original enviada', r.status === 200 && /^[0-9]{6}\/[0-9a-f]{20}\.jpg$/.test(chave), j);
  const cm = chave.replace('.jpg', '@480.jpg'), cm240 = chave.replace('.jpg', '@240.jpg');
  r = await up('/u?mini=' + chave, mini); j = await r.json();
  chk('cópia guardada ao lado da foto (@480.jpg)', r.status === 200 && j.ok && j.chave === cm && objs.has(cm), j);
  r = await w.fetch(pedido('GET', '/uso', 'tk2.cadastra'), env); j = await r.json();
  chk('cópia entra na conta de uso (2 arquivos, bytes somados)', j.arquivos === 2 && j.bytes === orig.length + mini.length, j);
  r = await up('/u?mini=' + chave, mini); j = await r.json();
  chk('repetir não duplica nem conta de novo', j.ok && j.jaExistia === true, j);
  r = await w.fetch(pedido('GET', '/uso', 'tk2.cadastra'), env); j = await r.json(); chk('uso igual depois do repetido', j.arquivos === 2, j);
  r = await up('/u?mini=' + chave + '&w=240', mini240); j = await r.json();
  chk('cópia de 240 px guardada ao lado (@240.jpg)', r.status === 200 && j.ok && j.chave === cm240 && objs.has(cm240), j);
  r = await up('/u?mini=' + chave + '&w=333', mini); chk('largura desconhecida = 400', r.status === 400);
  r = await w.fetch(pedido('GET', '/uso', 'tk2.cadastra'), env); j = await r.json(); chk('as duas cópias contam no uso', j.arquivos === 3 && j.bytes === orig.length + mini.length + mini240.length, j);
  r = await up('/u?mini=202610/ffffffffffffffffffff.jpg', mini); chk('foto que não existe = 404', r.status === 404);
  r = await up('/u?mini=t/' + chave, mini); chk('foto temporária (t/) não tem cópia = 400', r.status === 400);
  r = await up('/u?mini=../../x.jpg', mini); chk('nome fora do padrão = 400', r.status === 400);
  r = await up('/u?mini=' + chave, jpgDe(200 * 1024)); chk('cópia de 200 KB recusada (413)', r.status === 413);
  const png = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG'), Buffer.alloc(100)]);
  objs.delete(cm); objs.delete(cm240); mem.set('uso', JSON.stringify({ bytes: orig.length + 1004, arquivos: 2 })); r = await up('/u?mini=' + chave, png); chk('cópia que não é JPG = 400', r.status === 400);
  r = await w.fetch(pedido('POST', '/u?mini=' + chave, 'tk2.cliente', mini, { 'Content-Length': String(mini.length) }), env); chk('sem sessão válida = 401', r.status === 401);
  const cheio = Object.assign({}, env, { LIMITE_BYTES: String(orig.length + 10) });
  r = await w.fetch(pedido('POST', '/u?mini=' + chave, 'tk2.cadastra', mini, { 'Content-Length': String(mini.length) }), cheio); chk('cópia respeita o teto de armazenamento (507)', r.status === 507);
  chk('nada gravado quando recusa', !objs.has(cm));
  await up('/u?mini=' + chave, mini); await up('/u?mini=' + chave + '&w=240', mini240);

  console.log('== Leitura pública ?w=480 e ?w=240 ==');
  r = await w.fetch(new Request('https://midia.test/m/' + chave + '?w=480'), env);
  const corpo = Buffer.from(await r.arrayBuffer());
  chk('devolve a cópia (menor), cache de 1 ano', r.status === 200 && corpo.length === mini.length && /immutable/.test(r.headers.get('Cache-Control')) && r.headers.get('X-TK-Mini') === '480', [r.status, corpo.length]);
  chk('CORS aberto e tipo JPG', r.headers.get('Access-Control-Allow-Origin') === '*' && r.headers.get('Content-Type') === 'image/jpeg');
  r = await w.fetch(new Request('https://midia.test/m/' + chave + '?w=240'), env); const c240 = Buffer.from(await r.arrayBuffer());
  chk('?w=240 devolve a cópia pequena', r.status === 200 && c240.length === mini240.length && r.headers.get('X-TK-Mini') === '240', c240.length);
  r = await w.fetch(new Request('https://midia.test/m/' + chave), env); chk('sem ?w continua devolvendo a original inteira', (await r.arrayBuffer()).byteLength === orig.length);
  r = await up('/u', jpgDe(1000, 3)); const semMini = (await r.json()).chave;
  r = await w.fetch(new Request('https://midia.test/m/' + semMini + '?w=480'), env);
  chk('sem cópia: devolve a original (nunca 404), com cache curto', r.status === 200 && (await r.arrayBuffer()).byteLength === 4 + 1000 && !/immutable/.test(r.headers.get('Cache-Control')) && r.headers.get('X-TK-Mini') === 'ausente', r.headers.get('Cache-Control'));
  r = await w.fetch(new Request('https://midia.test/m/' + chave + '?w=999'), env); chk('largura desconhecida = original', (await r.arrayBuffer()).byteLength === orig.length);
  r = await w.fetch(new Request('https://midia.test/m/' + cm), env); chk('chave da cópia não abre direto (sempre por ?w=)', r.status === 404);
  r = await w.fetch(new Request('https://midia.test/m/202610/ffffffffffffffffffff.jpg?w=480'), env); chk('foto inexistente = 404', r.status === 404);

  console.log('== Apagar leva a cópia junto ==');
  r = await w.fetch(pedido('GET', '/uso', 'tk2.cadastra'), env); const u0 = await r.json();
  r = await w.fetch(pedido('DELETE', '/m/' + chave, 'tk2.admin'), env);
  chk('apagar a foto apaga as duas cópias', r.status === 200 && !objs.has(chave) && !objs.has(cm) && !objs.has(cm240));
  r = await w.fetch(pedido('GET', '/uso', 'tk2.cadastra'), env); j = await r.json(); chk('uso desce de acordo', j.arquivos === u0.arquivos - 3 && j.bytes === u0.bytes - orig.length - mini.length - mini240.length, [u0, j]);

  console.log('== Gerador das fotos antigas (/internal/mini) ==');
  objs.clear(); mem.clear();
  const chaves = []; for (let i = 0; i < 6; i++) { const k = '2026' + (i < 3 ? '09' : '10') + '/' + String(i).repeat(20) + (i === 4 ? '.png' : '.jpg'); chaves.push(k); await R2.put(k, i === 4 ? png : orig, { httpMetadata: { contentType: 'image/jpeg' } }); }
  await R2.put('t/202610/' + 'a'.repeat(20) + '.jpg', orig, { httpMetadata: { contentType: 'image/jpeg' } });
  await R2.put('out/202610/' + 'ab12'.repeat(6) + '.jpg', orig, { httpMetadata: { contentType: 'image/jpeg' } });
  await R2.put('202610/' + 'b'.repeat(20) + '.mp4', orig, { httpMetadata: { contentType: 'video/mp4' } });
  await R2.put(chaves[0].replace('.jpg', '@480.jpg'), mini, { httpMetadata: { contentType: 'image/jpeg' } });   // uma já tem as duas
  await R2.put(chaves[0].replace('.jpg', '@240.jpg'), mini240, { httpMetadata: { contentType: 'image/jpeg' } });
  await R2.put(chaves[5].replace('.jpg', '@480.jpg'), mini, { httpMetadata: { contentType: 'image/jpeg' } });   // outra tem só a de 480: ainda falta a de 240
  const ge = (q, tok, m, corpo, extra) => w.fetch(new Request('https://midia.test/internal/mini?' + q, { method: m || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + tok }, extra || {}), body: corpo }), env);
  const bom = jwt(claimsBase());
  r = await w.fetch(new Request('https://midia.test/internal/mini?acao=saude'), env); chk('sem identidade = 401', r.status === 401);
  r = await ge('acao=saude', 'x.y.z'); chk('token inválido = 401', r.status === 401);
  const ruins = { 'outra audiência': { aud: 'tenkiter-video' }, 'outro workflow': { workflow_ref: 'pablofonteneleadv/tenkiter-catalogo/.github/workflows/outro.yml@refs/heads/main' }, 'outra branch': { ref: 'refs/heads/ia/x' }, 'outro repositório': { repository: 'fulano/x' }, 'expirado': { exp: Math.floor(Date.now() / 1000) - 10 }, 'evento pull_request': { event_name: 'pull_request' } };
  for (const [nome, mud] of Object.entries(ruins)) { r = await ge('acao=saude', jwt(Object.assign(claimsBase(), mud))); chk('identidade com ' + nome + ' recusada', r.status === 401); }
  const assinaturaRuim = bom.split('.').slice(0, 2).join('.') + '.' + b64u(Buffer.alloc(256, 1)); r = await ge('acao=saude', assinaturaRuim); chk('assinatura falsa recusada', r.status === 401);
  r = await ge('acao=saude', bom); j = await r.json(); chk('identidade correta passa (saúde)', r.status === 200 && j.ok && j.larguras.join() === '240,480', j);
  r = await ge('acao=lote', bom); j = await r.json();
  const esperados = chaves.filter((k, i) => i !== 0).sort();   // [5] só tem a de 480: continua pendente
  chk('lote lista só fotos de vitrine sem cópia (não t/, out/, vídeo, nem as já feitas)', JSON.stringify(j.pendentes.slice().sort()) === JSON.stringify(esperados) && j.fim === true, j);
  r = await ge('acao=lote&limite=10', bom); j = await r.json(); chk('limite mínimo respeitado e continua com cursor se houver mais', j.ok && (j.fim || j.cursor), j);
  // página pequena: percorre tudo por cursor e junta
  const todos = new Set(); let cur = ''; for (let g = 0; g < 20; g++) { r = await ge('acao=lote&limite=10' + (cur ? '&cursor=' + encodeURIComponent(cur) : ''), bom); j = await r.json(); j.pendentes.forEach((k) => todos.add(k)); if (j.fim) break; cur = j.cursor; }
  chk('paginado por cursor acha os mesmos', JSON.stringify(Array.from(todos).sort()) === JSON.stringify(esperados), Array.from(todos));
  r = await ge('acao=origem&chave=' + chaves[1], bom); chk('baixa a original para reduzir', r.status === 200 && (await r.arrayBuffer()).byteLength === orig.length);
  r = await ge('acao=origem&chave=t/202610/' + 'a'.repeat(20) + '.jpg', bom); chk('só fotos de vitrine (t/ recusado)', r.status === 400);
  r = await ge('acao=gravar&chave=' + chaves[1] + '&w=480', bom, 'POST', mini, { 'Content-Length': String(mini.length) }); j = await r.json();
  chk('grava a cópia de 480 px da foto antiga', r.status === 200 && j.ok && objs.has(chaves[1].replace('.jpg', '@480.jpg')), j);
  r = await ge('acao=gravar&chave=' + chaves[1] + '&w=240', bom, 'POST', mini240, { 'Content-Length': String(mini240.length) }); j = await r.json();
  chk('grava a cópia de 240 px', r.status === 200 && j.ok && objs.has(chaves[1].replace('.jpg', '@240.jpg')), j);
  r = await ge('acao=gravar&chave=' + chaves[1] + '&w=480', bom, 'POST', mini, { 'Content-Length': String(mini.length) }); j = await r.json(); chk('idempotente: segunda vez não duplica', j.jaExistia === true, j);
  r = await ge('acao=gravar&chave=' + chaves[2] + '&w=480', bom, 'POST', jpgDe(200 * 1024), { 'Content-Length': String(200 * 1024 + 4) }); chk('cópia acima de 150 KB recusada', r.status === 413);
  r = await ge('acao=lote', bom); j = await r.json(); chk('depois de gravar a foto sai da lista', !j.pendentes.includes(chaves[1]) && j.pendentes.length === esperados.length - 1, j);
  const antes = objs.size; await ge('acao=lote', bom); chk('o gerador nunca apaga nada', objs.size === antes && objs.has(chaves[1]));
  r = await w.fetch(pedido('GET', '/uso', 'tk2.cadastra'), env); j = await r.json(); chk('gravar pelo gerador entra no uso', j.arquivos === 2 && j.bytes === mini.length + mini240.length, j);

  console.log('\nOK=' + ok + ' FALHAS=' + falhas.length, falhas);
  process.exit(falhas.length ? 1 : 0);
})();
