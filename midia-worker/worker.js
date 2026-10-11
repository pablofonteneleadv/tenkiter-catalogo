// Worker `tenkiter-midia` — fotos e vídeos da TENKiTER no R2 da Cloudflare (substitui o Cloudinary para o que for NOVO).
//
// Por que é barato e sem surpresa de custo:
//  - Servir arquivo (saída) no R2 é GRÁTIS; só se paga armazenamento acima de 10 GB (~R$ 0,08 por GB/mês).
//  - NÃO há redimensionamento por uso (Images) nem Stream: nada aqui cobra por visualização.
//  - TRAVAS DURAS: foto <= 2,5 MB, vídeo <= 15 MB, só tipos conhecidos (conferidos pelos bytes), no máx. 400 envios/dia
//    e o total guardado nunca passa de LIMITE_BYTES (padrão 9,5 GB = abaixo da faixa grátis de 10 GB). Passou? recusa o envio.
//
// Rotas:
//   GET|HEAD /m/<chave>   arquivo (cache de 1 ano, Range para vídeo)           — público
//   POST     /u           envia foto/vídeo (corpo = o arquivo)                  — só equipe com `catalogo_cadastrar`
//   DELETE   /m/<chave>   apaga                                                 — só equipe com `catalogo_excluir`
//   GET      /uso         quanto está guardado / limite                         — só equipe com `catalogo_cadastrar`
// Quem pode enviar é decidido pelo Apps Script (ação `sessao`): cabeçalhos X-TK-Whats e X-TK-Sessao (token, nunca senha).
// Bindings: MIDIA (R2), CACHE (KV), API_URL (texto), LIMITE_BYTES (texto, opcional), ORIGENS (texto, opcional, separado por vírgula).

const FOTO_MAX = 2.5 * 1024 * 1024;
const VIDEO_MAX = 15 * 1024 * 1024;
const ENVIOS_DIA_MAX = 400;
const LIMITE_PADRAO = 9.5 * 1024 * 1024 * 1024;
const ORIGENS_PADRAO = ['https://tenkitermodas.com.br', 'https://www.tenkitermodas.com.br', 'https://tenkiter-catalogo.onrender.com'];
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
  if (!whats || !/^tk[12]\./.test(sessao)) return null;           // só token de sessão, nunca senha
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

function dia() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }   // dia de Fortaleza

const CHAVE_OK = /^[0-9]{6}\/[0-9a-f]{20}\.(jpg|png|webp|mp4|webm)$/;

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
      const chave = caminho.slice(3);
      if (!CHAVE_OK.test(chave)) return resp({ ok: false, erro: 'Não encontrado.' }, 404);
      const range = req.headers.get('Range');
      const obj = await env.MIDIA.get(chave, range ? { range: req.headers } : undefined);
      if (!obj) return resp({ ok: false, erro: 'Não encontrado.' }, 404);
      const h = new Headers({ 'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes', 'ETag': obj.httpEtag, 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin', 'X-Content-Type-Options': 'nosniff' });
      let status = 200;
      if (range && obj.range) {
        const ini = obj.range.offset || 0, fim = obj.range.length != null ? ini + obj.range.length - 1 : obj.size - 1;
        h.set('Content-Range', 'bytes ' + ini + '-' + fim + '/' + obj.size); h.set('Content-Length', String(fim - ini + 1)); status = 206;
      } else h.set('Content-Length', String(obj.size));
      return new Response(req.method === 'HEAD' ? null : obj.body, { status: status, headers: h });
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
      if (tam > VIDEO_MAX) return resp({ ok: false, erro: 'Arquivo grande demais (máximo 15 MB para vídeo e 2,5 MB para foto).' }, 413, H());
      const buf = await req.arrayBuffer();
      if (buf.byteLength !== tam) return resp({ ok: false, erro: 'Envio incompleto.' }, 400, H());
      const tipo = tipoPelosBytes(buf);
      if (!tipo) return resp({ ok: false, erro: 'Formato não aceito. Use foto JPG/PNG/WEBP ou vídeo MP4/WEBM.' }, 415, H());
      if (!tipo.video && buf.byteLength > FOTO_MAX) return resp({ ok: false, erro: 'Foto grande demais (máximo 2,5 MB). Reduza e envie de novo.' }, 413, H());
      const hoje = 'env_' + dia();
      const feitos = parseInt((await env.CACHE.get(hoje)) || '0', 10) || 0;
      if (feitos >= ENVIOS_DIA_MAX) return resp({ ok: false, erro: 'Limite de envios de hoje atingido. Tente amanhã.' }, 429, H());
      const uso = await lerUso(env);
      if (uso.bytes + buf.byteLength > limite(env)) return resp({ ok: false, erro: 'Armazenamento cheio (limite de segurança para não gerar cobrança). Apague arquivos antigos.' }, 507, H());
      const aleatorio = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => ('0' + b.toString(16)).slice(-2)).join('');
      const chave = dia().slice(0, 7).replace('-', '') + '/' + aleatorio + '.' + tipo.ext;
      await env.MIDIA.put(chave, buf, { httpMetadata: { contentType: tipo.mime, cacheControl: 'public, max-age=31536000, immutable' } });
      uso.bytes += buf.byteLength; uso.arquivos += 1;
      await gravarUso(env, uso);
      await env.CACHE.put(hoje, String(feitos + 1), { expirationTtl: 172800 });
      return resp({ ok: true, chave: chave, url: url.origin + '/m/' + chave, tipo: tipo.video ? 'video' : 'foto', bytes: buf.byteLength }, 200, H());
    }

    if (caminho.startsWith('/m/') && req.method === 'DELETE') {
      if (perms.indexOf('catalogo_excluir') === -1) return resp({ ok: false, erro: 'Sem permissão para apagar.' }, 403, H());
      const chave = caminho.slice(3);
      if (!CHAVE_OK.test(chave)) return resp({ ok: false, erro: 'Não encontrado.' }, 404, H());
      const cab = await env.MIDIA.head(chave);
      if (!cab) return resp({ ok: false, erro: 'Não encontrado.' }, 404, H());
      await env.MIDIA.delete(chave);
      const uso = await lerUso(env);
      uso.bytes = Math.max(0, uso.bytes - cab.size); uso.arquivos = Math.max(0, uso.arquivos - 1);
      await gravarUso(env, uso);
      return resp({ ok: true }, 200, H());
    }

    return resp({ ok: false, erro: 'Não encontrado.' }, 404, H());
  }
};
