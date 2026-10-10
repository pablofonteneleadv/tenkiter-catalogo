/* ====================================================================
 * TENKiTER — og-service — miniatura (prévia) por produto no WhatsApp
 *
 * Por que existe: o site é estático (Render Static Site) e o Apps Script só entrega HTML dentro de um
 * quadro (iframe) -- o WhatsApp/Instagram/Facebook não leem as <meta og:*> de nenhum dos dois, então o link de
 * uma peça nunca mostra a foto dela. Este serviço mínimo (zero dependências) responde em  /p/<código>  com uma
 * página que tem as meta tags certas (foto, nome, preço) e manda a pessoa para o catálogo na peça.
 *
 * Variáveis de ambiente (nenhuma é segredo; o catálogo já é público):
 *   API_URL   endereço do Apps Script do catálogo (o mesmo do common.js)
 *   SITE_URL  https://tenkitermodas.com.br/
 *   PORT      definido pelo Render
 * ==================================================================== */
const http = require('http');

const API_URL = process.env.API_URL || '';
const SITE_URL = (process.env.SITE_URL || 'https://tenkitermodas.com.br/').replace(/\/?$/, '/');
const DESCONTO_AVISTA = 0.10;
const CACHE_MS = 60 * 1000;

let cache = { em: 0, produtos: [] };

async function produtos() {
  if (Date.now() - cache.em < CACHE_MS && cache.produtos.length) return cache.produtos;
  const r = await fetch(API_URL + '?action=list', { redirect: 'follow' });
  const j = await r.json();
  if (j && j.ok && Array.isArray(j.produtos)) cache = { em: Date.now(), produtos: j.produtos };
  return cache.produtos;
}

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const real = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',');

function pagina(p, cod) {
  const destino = SITE_URL + '?c=' + encodeURIComponent(cod);
  const cheio = Number(p.Preco) || 0;
  const avista = cheio * (1 - DESCONTO_AVISTA);
  const titulo = p.Nome + (p.Codigo ? ' [' + p.Codigo + ']' : '') + ' — ' + real(avista) + ' à vista';
  const desc = (p.Descricao ? String(p.Descricao).slice(0, 160) + ' | ' : '') + 'De ' + real(cheio) + ' por ' + real(avista) + ' à vista na TENKiTER Modas — Crateús, CE.';
  const img = p.Foto_URL || (SITE_URL + 'og-banner.jpg');
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(titulo) + '</title>' +
    '<meta property="og:type" content="product"><meta property="og:site_name" content="TENKiTER Modas"><meta property="og:locale" content="pt_BR">' +
    '<meta property="og:title" content="' + esc(titulo) + '"><meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:image" content="' + esc(img) + '"><meta property="og:url" content="' + esc(destino) + '">' +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(titulo) + '">' +
    '<meta name="twitter:description" content="' + esc(desc) + '"><meta name="twitter:image" content="' + esc(img) + '">' +
    '<meta http-equiv="refresh" content="0; url=' + esc(destino) + '">' +
    '<script>location.replace(' + JSON.stringify(destino) + ');</script>' +
    '</head><body style="font-family:system-ui,sans-serif;text-align:center;padding:40px"><a href="' + esc(destino) + '">Abrir a peça no catálogo</a></body></html>';
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  const m = url.pathname.match(/^\/p\/([^/]+)\/?$/);
  if (!m) { res.writeHead(302, { Location: SITE_URL }); return res.end(); }
  const cod = decodeURIComponent(m[1]);
  try {
    const lista = await produtos();
    const alvo = String(cod).trim().toLowerCase();
    const p = lista.find((x) => String(x.Codigo || '').toLowerCase() === alvo || String(x.ID) === cod);
    if (!p) { res.writeHead(302, { Location: SITE_URL }); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
    res.end(pagina(p, p.Codigo || p.ID));
  } catch (e) {
    res.writeHead(302, { Location: SITE_URL + '?c=' + encodeURIComponent(cod) }); // se a API falhar, a pessoa ainda chega na peça
    res.end();
  }
}).listen(process.env.PORT || 3000, () => console.log('og-service no ar'));
