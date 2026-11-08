// Worker `tenkiter-midia` — fotos e vídeos da TENKiTER no R2 da Cloudflare (substitui o Cloudinary para o que for NOVO).
//
// Por que é barato e sem surpresa de custo:
//  - Servir arquivo (saída) no R2 é GRÁTIS; só se paga armazenamento acima de 10 GB (~R$ 0,08 por GB/mês).
//  - NÃO há redimensionamento por uso (Images) nem Stream: nada aqui cobra por visualização.
//  - TRAVAS DURAS: foto <= 2,5 MB, vídeo <= 40 MB, só tipos conhecidos (conferidos pelos bytes), no máx. 600 envios/dia
//    e o total guardado nunca passa de LIMITE_BYTES (padrão 9,5 GB = abaixo da faixa grátis de 10 GB). Passou? recusa o envio.
//
// Rotas:
//   GET|HEAD /m/<chave>   arquivo (cache de 1 ano, Range para vídeo)           — público
//   GET|HEAD /m/<chave>?w=480|240  foto reduzida (cópia <chave>@480.jpg / @240.jpg); sem cópia, devolve a original (cache curto) — público
//   POST     /u?mini=<chave>&w=480|240  guarda a cópia reduzida (JPG) de uma foto já enviada — só equipe com `catalogo_cadastrar`
//   /internal/mini        gerador das cópias das fotos ANTIGAS (workflow fotos-mini.yml, identidade OIDC do GitHub, sem segredo)
//   POST     /u           envia foto/vídeo (corpo = o arquivo)                  — só equipe com `catalogo_cadastrar`
//   DELETE   /m/<chave>   apaga                                                 — só equipe com `catalogo_excluir`
//   GET      /uso         quanto está guardado / limite                         — só equipe com `catalogo_cadastrar`
// Quem pode enviar é decidido pelo Apps Script (ação `sessao`): cabeçalhos X-TK-Whats e X-TK-Sessao (token, nunca senha).
// Bindings: MIDIA (R2), CACHE (KV), API_URL (texto), LIMITE_BYTES (texto, opcional), ORIGENS (texto, opcional, separado por vírgula).

const FOTO_MAX = 2.5 * 1024 * 1024;
const VIDEO_MAX = 40 * 1024 * 1024;
const ENVIOS_DIA_MAX = 600;
const LIMITE_PADRAO = 9.5 * 1024 * 1024 * 1024;
/* Origens autorizadas a enviar midia (CORS). Precisa cobrir todo endereco de onde
 * o painel e servido — inclusive a copia do repositorio no GitHub Pages. */
const ORIGENS_PADRAO = ['https://tenkitermodas.com.br', 'https://www.tenkitermodas.com.br', 'https://tenkiter-catalogo.onrender.com', 'https://pablofonteneleadv.github.io'];
const UA = 'Mozilla/5.0 (compatible; tenkiter-midia/1.0)';

/** Descobre o tipo pelos PRIMEIROS BYTES (o que o navegador diz não vale). */
export function tipoPelosBytes(b) {
  const u = new Uint8Array(b.slice ? b.slice(0, 16) : b);
  const eq = (i, s) => s.split('').every((c, k) => u[i + k] === c.charCodeAt(0));
  if (u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg', video: false };
  if (u[0] === 0x89 && eq(1, 'PNG')) return { mime: 'image/png', ext: 'png', video: false };
  if (eq(0, 'RIFF') && eq(8, 'WEBP')) return { mime: 'image/webp', ext: 'webp', video: false };
  if (eq(4, 'ftyp')) return /^(heic|heix|mif1|msf1)/.test(String.fromCharCode(u[8], u[9], u[10], u[11])) ? null : { mime: 'video/mp4', ext: 'mp4', video: true };
  if (u[0] === 0x1A && u[1] === 0x45 && u[2] === 0xDF && u[3] === 0xA3) return { mime: 'video/webm', ext: 'webm', video: true };
  return null;
}

// Inspeciona identificadores de codec no contêiner MP4 antes de liberar a mídia.
// Resultado 'desconhecido' não equivale a H.264 validado.
function codecMp4_(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 12) return 'desconhecido';
  const achados = new Set();
  // Procura sample entries (incluindo moov); não depende de metadados do navegador.
  for (let i = 0; i + 4 <= b.length; i++) {
    if (b[i] === 0x68 && b[i+1] === 0x76 && b[i+2] === 0x63 && b[i+3] === 0x31) achados.add('hvc1');
    if (b[i] === 0x68 && b[i+1] === 0x65 && b[i+2] === 0x76 && b[i+3] === 0x31) achados.add('hev1');
    if (b[i] === 0x61 && b[i+1] === 0x76 && b[i+2] === 0x63 && (b[i+3] === 0x31 || b[i+3] === 0x33)) achados.add('avc');
  }
  if (achados.has('hvc1') || achados.has('hev1')) return 'hevc';
  if (achados.has('avc')) return 'h264';
  return 'desconhecido';
}

function origemPermitida(env, req) {
  const o = req.headers.get('Origin') || '';
  const lista = (env.ORIGENS ? String(env.ORIGENS).split(',') : ORIGENS_PADRAO).map(s => s.trim());
  return lista.indexOf(o) !== -1 ? o : '';
}
function resp(corpo, status, extra) {
  const h = new Headers(extra || {});
  if (typeof corpo === 'object' && corpo !== null && !(corpo instanceof ReadableStream) && !(corpo instanceof ArrayBuffer)) { h.set('Content-Type', 'application/json; charset=utf-8'); corpo = JSON.stringify(corpo); }
  return new Response(corpo, { status: status || 200, headers: h });
}
function cors(env, req, h) {
  const o = origemPermitida(env, req);
  const x = new Headers(h || {});
  if (o) { x.set('Access-Control-Allow-Origin', o); x.set('Vary', 'Origin'); }
  return x;
}

async function sha(texto) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(d), b => ('0' + b.toString(16)).slice(-2)).join('');
}

/** Pergunta ao Apps Script se a sessão vale e quais permissões tem. Guarda o resultado 2 min no cache da borda (sem custo). */
async function permissoes(env, req) {
  const whats = (req.headers.get('X-TK-Whats') || '').replace(/\D/g, '').slice(0, 20);
  const sessao = (req.headers.get('X-TK-Sessao') || '').slice(0, 400);
  if (!whats || !/^tk[123]\./.test(sessao)) return null;           // só token de sessão, nunca senha
  const chave = new Request('https://sessao.invalid/' + (await sha(whats + '|' + sessao)));
  const cache = caches.default;
  const guardado = await cache.match(chave);
  if (guardado) return guardado.json();
  let lista = null;
  try {
    const r = await fetch(env.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA }, body: JSON.stringify({ action: 'sessao', whatsapp: whats, sessao: sessao }) });
    const j = await r.json();
    if (j && j.ok && j.usuario && Array.isArray(j.usuario.permissoes)) lista = j.usuario.permissoes;
  } catch (e) { return null; }
  if (lista) await cache.put(chave, new Response(JSON.stringify(lista), { headers: { 'Cache-Control': 'max-age=120' } }));
  return lista;
}

async function lerUso(env) {
  const v = await env.CACHE.get('uso', 'json');
  return v && typeof v.bytes === 'number' ? v : { bytes: 0, arquivos: 0 };
}
async function gravarUso(env, uso) { await env.CACHE.put('uso', JSON.stringify(uso)); }
function limite(env) { const n = Number(env.LIMITE_BYTES); return n > 0 ? n : LIMITE_PADRAO; }

/** Chave da cópia reduzida de uma foto: 202610/abc….jpg -> 202610/abc…@480.jpg ou @240.jpg (vazio se não for foto de vitrine ou largura desconhecida). */
function chaveMini(chave, larg) { const m = FOTO_ORIG_OK.exec(chave); return m && MINI_LARGURAS.indexOf(larg) !== -1 ? m[1] + '@' + larg + '.jpg' : ''; }
/** Largura pedida em ?w=: ausente = 480; presente mas desconhecida = 0 (recusa). */
function larguraEnvio(v) { return v == null ? 480 : larguraPedida(v); }
function larguraPedida(v) { const n = parseInt(v || '', 10); return MINI_LARGURAS.indexOf(n) !== -1 ? n : 0; }

/** Guarda a cópia reduzida (JPG) de uma foto já existente. Idempotente: se já existe, não grava de novo. Conta no uso e respeita o limite de armazenamento. */
async function guardarMini(env, chaveOrig, buf, larg) {
  const cm = chaveMini(chaveOrig, larg);
  if (!cm) return { status: 400, corpo: { ok: false, erro: 'Cópia reduzida inválida (só para foto enviada pelo painel, em 240 ou 480 px).' } };
  const tipo = tipoPelosBytes(buf);
  if (!tipo || tipo.ext !== 'jpg') return { status: 400, corpo: { ok: false, erro: 'Cópia reduzida inválida (precisa ser JPG).' } };
  if (buf.byteLength > MINI_MAX) return { status: 413, corpo: { ok: false, erro: 'Cópia reduzida grande demais (máximo 150 KB).' } };
  if (!(await env.MIDIA.head(chaveOrig))) return { status: 404, corpo: { ok: false, erro: 'Foto não encontrada.' } };
  if (await env.MIDIA.head(cm)) return { status: 200, corpo: { ok: true, chave: cm, jaExistia: true } };
  const uso = await lerUso(env);
  if (uso.bytes + buf.byteLength > limite(env)) return { status: 507, corpo: { ok: false, erro: 'Armazenamento cheio (limite de segurança para não gerar cobrança). Apague arquivos antigos.' } };
  await env.MIDIA.put(cm, buf, { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' } });
  uso.bytes += buf.byteLength; uso.arquivos += 1;
  await gravarUso(env, uso);
  return { status: 200, corpo: { ok: true, chave: cm, bytes: buf.byteLength } };
}

// ---- Gerador das cópias das fotos antigas (roda no GitHub Actions; o Worker não redimensiona nada) ----
// A identidade é o token OIDC que o GitHub entrega ao workflow `fotos-mini.yml` da `main` (audiência `tenkiter-midia-mini`): não existe segredo nem senha.
function claimsMiniOk(c) {
  const n = Date.now() / 1000, repo = 'pablofonteneleadv/tenkiter-catalogo';
  return c.iss === 'https://token.actions.githubusercontent.com' && c.aud === 'tenkiter-midia-mini' && c.repository === repo && c.repository_id === '1366921721' && c.repository_owner_id === '207932006' && c.repository_owner === 'pablofonteneleadv' && c.ref === 'refs/heads/main' && c.workflow_ref === repo + '/.github/workflows/fotos-mini.yml@refs/heads/main' && typeof c.sub === 'string' && c.sub.length > 0 && ['push', 'workflow_dispatch', 'schedule'].includes(c.event_name) && Number.isFinite(c.exp) && c.exp > n && c.exp < n + 900 && Number.isFinite(c.nbf) && c.nbf <= n + 30;
}
async function autorizarMini(req) {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (token.length > 16000) return false;
    const partes = token.split('.'); if (partes.length !== 3) return false;
    const dec = (x) => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
    const cab = JSON.parse(new TextDecoder().decode(dec(partes[0]))), claims = JSON.parse(new TextDecoder().decode(dec(partes[1])));
    if (cab.alg !== 'RS256' || typeof cab.kid !== 'string' || !claimsMiniOk(claims)) return false;
    const r = await fetch('https://token.actions.githubusercontent.com/.well-known/jwks', { signal: AbortSignal.timeout(10000), cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!r.ok) return false;
    const jwks = await r.json();
    const jwk = jwks.keys && jwks.keys.find((k) => k.kid === cab.kid && k.kty === 'RSA' && k.use === 'sig'); if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, dec(partes[2]), new TextEncoder().encode(partes[0] + '.' + partes[1]));
  } catch (e) { return false; }
}
/** Rotas /internal/mini: saude | lote (lista fotos sem cópia, uma página) | origem (baixa a original) | gravar (guarda a cópia). Nada aqui apaga ou troca arquivo. */
async function geradorMini(env, req, url, J) {
  if (!(await autorizarMini(req))) return J({ ok: false, erro: 'Identidade do gerador não autorizada.' }, 401);
  const acao = url.searchParams.get('acao') || '';
  if (acao === 'saude') { await env.MIDIA.list({ limit: 1 }); const u = await lerUso(env); return J({ ok: true, gerador: 'mini-v2', larguras: MINI_LARGURAS, bytes: u.bytes, limite: limite(env) }); }
  if (acao === 'lote' && req.method === 'GET') {
    const lim = Math.max(10, Math.min(1000, parseInt(url.searchParams.get('limite') || '500', 10) || 500));
    const pag = await env.MIDIA.list({ limit: lim, cursor: url.searchParams.get('cursor') || undefined });
    const chaves = pag.objects.map((o) => o.key), existe = new Set(chaves);
    const pendentes = [];
    for (let i = 0; i < chaves.length; i++) {
      const k = chaves[i]; if (!FOTO_ORIG_OK.test(k)) continue;
      // as cópias vêm logo depois da original na ordem das chaves; só as últimas da página precisam de conferência à parte
      let falta = false;
      for (const l of MINI_LARGURAS) {
        const cm = chaveMini(k, l);
        if (existe.has(cm)) continue;
        if (pag.truncated && i >= chaves.length - 3 && (await env.MIDIA.head(cm))) continue;
        falta = true; break;
      }
      if (falta) pendentes.push(k);
    }
    return J({ ok: true, pendentes: pendentes, cursor: pag.truncated ? pag.cursor : null, fim: !pag.truncated });
  }
  const chave = url.searchParams.get('chave') || '';
  if (!FOTO_ORIG_OK.test(chave)) return J({ ok: false, erro: 'Chave inválida.' }, 400);
  if (acao === 'origem' && req.method === 'GET') {
    const o = await env.MIDIA.get(chave); if (!o) return J({ ok: false, erro: 'Não encontrado.' }, 404);
    if (o.size > FOTO_MAX) return J({ ok: false, erro: 'Original acima do limite.' }, 413);
    return new Response(o.body, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(o.size) } });
  }
  if (acao === 'gravar' && req.method === 'POST') {
    const tam = Number(req.headers.get('Content-Length'));
    if (!tam || tam > MINI_MAX) return J({ ok: false, erro: 'Tamanho inválido (máximo 150 KB).' }, 413);
    const buf = await req.arrayBuffer(); if (buf.byteLength !== tam) return J({ ok: false, erro: 'Envio incompleto.' }, 400);
    const r = await guardarMini(env, chave, buf, larguraEnvio(url.searchParams.get('w')));
    return J(r.corpo, r.status);
  }
  return J({ ok: false, erro: 'Ação desconhecida.' }, 404);
}

function dia() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }   // dia de Fortaleza

const CHAVE_OK = /^(t\/)?[0-9]{6}\/[0-9a-f]{20}\.(jpg|png|webp|mp4|webm)$/;
/** Mídia que a loja envia por Mensagens (foto/vídeo/áudio): chave aleatória de 96 bits, em out/. Só leitura pública (a Wafly e a Meta precisam abrir o link). */
const SAIDA_OK = /^out\/[0-9]{6}\/[0-9a-f]{24}\.(jpg|png|webp|mp4|mov|ogg|mp3|m4a|aac|weba|wav|amr)$/;
const MINI_MAX = 150 * 1024;     // cópia reduzida da foto (480 px: ~30-60 KB; 240 px: ~8-15 KB); 150 KB é a trava
const MINI_LARGURAS = [240, 480];   // 480 = cartões da vitrine; 240 = miniaturas pequenas (lista do painel, bolinhas de fotos, sacola)
const FOTO_ORIG_OK = /^([0-9]{6}\/[0-9a-f]{20})\.(jpg|png|webp)$/;   // foto "de vitrine" (não temporária): só estas têm cópia reduzida
const POSTER_MAX = 400 * 1024;   // miniatura de vídeo: um quadro em JPG, pequeno de propósito

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const caminho = url.pathname;

    if (req.method === 'OPTIONS') {
      const h = cors(env, req, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-TK-Whats, X-TK-Sessao', 'Access-Control-Max-Age': '86400' });
      return new Response(null, { status: 204, headers: h });
    }

    // ---- arquivo público ----
    if (caminho.startsWith('/m/') && (req.method === 'GET' || req.method === 'HEAD')) {
      let chave = caminho.slice(3);
      if (!CHAVE_OK.test(chave) && !SAIDA_OK.test(chave)) return resp({ ok: false, erro: 'Não encontrado.' }, 404);
      const range = req.headers.get('Range');
      // ?w=480: devolve a cópia reduzida se existir; se ainda não existir (foto antiga sem backfill), devolve a original — nunca 404
      const larg = larguraPedida(url.searchParams.get('w'));
      const queroMini = larg > 0 && FOTO_ORIG_OK.test(chave);
      let semMini = false, miniOk = false, obj = null;
      if (queroMini) {
        obj = await env.MIDIA.get(chaveMini(chave, larg), range ? { range: req.headers } : undefined);
        if (obj) miniOk = true; else semMini = true;
      }
      if (!obj) obj = await env.MIDIA.get(chave, range ? { range: req.headers } : undefined);
      if (!obj) return resp({ ok: false, erro: 'Não encontrado.' }, 404);
      const h = new Headers({ 'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream', 'Cache-Control': semMini ? 'public, max-age=3600' : 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes', 'ETag': obj.httpEtag, 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin', 'X-Content-Type-Options': 'nosniff' });
      if (miniOk) h.set('X-TK-Mini', String(larg)); else if (semMini) h.set('X-TK-Mini', 'ausente');
      let status = 200;
      if (range && obj.range) {
        const ini = obj.range.offset || 0, fim = obj.range.length != null ? ini + obj.range.length - 1 : obj.size - 1;
        h.set('Content-Range', 'bytes ' + ini + '-' + fim + '/' + obj.size); h.set('Content-Length', String(fim - ini + 1)); status = 206;
      } else h.set('Content-Length', String(obj.size));
      return new Response(req.method === 'HEAD' ? null : obj.body, { status: status, headers: h });
    }

    // ---- gerador das cópias das fotos antigas (identidade do GitHub, não é a equipe) ----
    if (caminho === '/internal/mini') {
      try { return await geradorMini(env, req, url, (c, st) => resp(c, st || 200, { 'Cache-Control': 'no-store' })); }
      catch (e) { return resp({ ok: false, erro: 'Gerador indisponível.' }, 503, { 'Cache-Control': 'no-store' }); }
    }

    // ---- daqui para baixo: só equipe ----
    const perms = await permissoes(env, req);
    const H = (extra) => cors(env, req, extra);
    if (!perms) return resp({ ok: false, erro: 'Entre na sua conta para enviar arquivos.' }, 401, H());

    if (caminho === '/uso' && req.method === 'GET') {
      if (perms.indexOf('catalogo_cadastrar') === -1) return resp({ ok: false, erro: 'Sem permissão.' }, 403, H());
      const u = await lerUso(env);
      return resp({ ok: true, bytes: u.bytes, arquivos: u.arquivos, limite: limite(env), gratisAte: 10 * 1024 * 1024 * 1024, alerta: u.bytes >= 0.8 * limite(env) }, 200, H({ 'Cache-Control': 'no-store' }));
    }

    if (caminho === '/u' && req.method === 'POST') {
      if (perms.indexOf('catalogo_cadastrar') === -1) return resp({ ok: false, erro: 'Sem permissão para enviar.' }, 403, H());
      const tam = Number(req.headers.get('Content-Length'));
      if (!tam || tam < 0) return resp({ ok: false, erro: 'Tamanho do arquivo não informado.' }, 411, H());
      if (tam > VIDEO_MAX) return resp({ ok: false, erro: 'Arquivo grande demais (máximo 40 MB para vídeo e 2,5 MB para foto).' }, 413, H());
      const buf = await req.arrayBuffer();
      if (buf.byteLength !== tam) return resp({ ok: false, erro: 'Envio incompleto.' }, 400, H());
      const tipo = tipoPelosBytes(buf);
      const codecVideo = tipo && tipo.ext === 'mp4' ? codecMp4_(buf) : tipo && tipo.video ? 'desconhecido' : null;
      if (!tipo) return resp({ ok: false, erro: 'Formato não aceito. Use foto JPG/PNG/WEBP ou vídeo MP4/WEBM.' }, 415, H());
      if (!tipo.video && buf.byteLength > FOTO_MAX) return resp({ ok: false, erro: 'Foto grande demais (máximo 2,5 MB). Reduza e envie de novo.' }, 413, H());
      // ?poster=<chave do vídeo>: este arquivo é a MINIATURA de um vídeo já enviado — fica com o mesmo nome do vídeo, terminando em .jpg
      const paraVideo = url.searchParams.get('poster');
      let chaveFixa = '';
      if (paraVideo) {
        const m = /^([0-9]{6}\/[0-9a-f]{20})\.(mp4|webm)$/.exec(paraVideo);
        if (!m || tipo.ext !== 'jpg') return resp({ ok: false, erro: 'Miniatura inválida (precisa ser JPG de um vídeo enviado).' }, 400, H());
        if (buf.byteLength > POSTER_MAX) return resp({ ok: false, erro: 'Miniatura grande demais (máximo 400 KB).' }, 413, H());
        if (!(await env.MIDIA.head(paraVideo))) return resp({ ok: false, erro: 'Vídeo não encontrado.' }, 404, H());
        if (await env.MIDIA.head(m[1] + '.jpg')) return resp({ ok: true, chave: m[1] + '.jpg', url: url.origin + '/m/' + m[1] + '.jpg', tipo: 'foto', jaExistia: true }, 200, H());
        chaveFixa = m[1] + '.jpg';
      }
      // ?mini=<chave da foto>: este arquivo é a CÓPIA REDUZIDA (480 px) de uma foto já enviada — fica ao lado dela, com o sufixo @480
      const paraFoto = url.searchParams.get('mini');
      if (paraFoto) {
        const r = await guardarMini(env, paraFoto, buf, larguraEnvio(url.searchParams.get('w')));
        return resp(r.corpo, r.status, H());
      }
      const hoje = 'env_' + dia();
      const feitos = parseInt((await env.CACHE.get(hoje)) || '0', 10) || 0;
      if (feitos >= ENVIOS_DIA_MAX) return resp({ ok: false, erro: 'Limite de envios de hoje atingido. Tente amanhã.' }, 429, H());
      const uso = await lerUso(env);
      if (uso.bytes + buf.byteLength > limite(env)) return resp({ ok: false, erro: 'Armazenamento cheio (limite de segurança para não gerar cobrança). Apague arquivos antigos.' }, 507, H());
      const aleatorio = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => ('0' + b.toString(16)).slice(-2)).join('');
      // ?temp=1: arquivo TEMPORÁRIO (postagem livre/template): fica em t/ e o Worker tenkiter-ig apaga sozinho depois de 5 dias
      const pref = url.searchParams.get('temp') === '1' && !chaveFixa ? 't/' : '';
      const chave = chaveFixa || (pref + dia().slice(0, 7).replace('-', '') + '/' + aleatorio + '.' + tipo.ext);
      await env.MIDIA.put(chave, buf, { httpMetadata: { contentType: tipo.mime, cacheControl: 'public, max-age=31536000, immutable' } });
      uso.bytes += buf.byteLength; uso.arquivos += 1;
      await gravarUso(env, uso);
      await env.CACHE.put(hoje, String(feitos + 1), { expirationTtl: 172800 });
      return resp({ ok: true, chave: chave, url: url.origin + '/m/' + chave, tipo: tipo.video ? 'video' : 'foto', codecVideo, requerConversao: codecVideo === 'hevc', bytes: buf.byteLength }, 200, H());
    }

    if (caminho.startsWith('/m/') && req.method === 'DELETE') {
      if (perms.indexOf('catalogo_excluir') === -1) return resp({ ok: false, erro: 'Sem permissão para apagar.' }, 403, H());
      const chave = caminho.slice(3);
      if (!CHAVE_OK.test(chave)) return resp({ ok: false, erro: 'Não encontrado.' }, 404, H());
      const cab = await env.MIDIA.head(chave);
      if (!cab) return resp({ ok: false, erro: 'Não encontrado.' }, 404, H());
      await env.MIDIA.delete(chave);
      let tirou = cab.size, arqs = 1;
      const mv = /^([0-9]{6}\/[0-9a-f]{20})\.(mp4|webm)$/.exec(chave);
      const cabP = mv ? await env.MIDIA.head(mv[1] + '.jpg') : null;     // miniatura do vídeo vai junto
      if (cabP) { await env.MIDIA.delete(mv[1] + '.jpg'); tirou += cabP.size; arqs += 1; }
      for (const l of MINI_LARGURAS) {                                      // cópias reduzidas da foto vão junto
        const cmx = chaveMini(chave, l), cabM = cmx ? await env.MIDIA.head(cmx) : null;
        if (cabM) { await env.MIDIA.delete(cmx); tirou += cabM.size; arqs += 1; }
      }
      const uso = await lerUso(env);
      uso.bytes = Math.max(0, uso.bytes - tirou); uso.arquivos = Math.max(0, uso.arquivos - arqs);
      await gravarUso(env, uso);
      return resp({ ok: true }, 200, H());
    }

    return resp({ ok: false, erro: 'Não encontrado.' }, 404, H());
  }
};
