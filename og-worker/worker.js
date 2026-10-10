/* ====================================================================
 * TENKiTER — og-worker (Cloudflare Worker) — miniatura por produto no WhatsApp
 * Responde em  /p/<código>  com <meta og:*> da peça e leva a pessoa ao catálogo (?c=<código>).
 * Sem segredos: API_URL e SITE_URL são públicos (o catálogo já é público).
 * Colar no painel Cloudflare: Workers & Pages > Create > Hello World > Edit code.
 * ==================================================================== */
const API_URL = 'https://script.google.com/macros/s/AKfycbyWnKwT5-HB6rv-loxGUtumpWPlJsRZNYp06v5RC3wtiJDUaV9zCMJVRwOEScxwMase_Q/exec';
const SITE_URL = 'https://tenkitermodas.com.br/';
const DESCONTO_AVISTA = 0.10;

async function produtos() {
  const r = await fetch(API_URL + '?action=list', { redirect: 'follow', cf: { cacheTtl: 60, cacheEverything: true } });
  const j = await r.json();
  return j && j.ok && Array.isArray(j.produtos) ? j.produtos : [];
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


export default {
  async fetch(req) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/p\/([^/]+)\/?$/);
    if (!m) return Response.redirect(SITE_URL, 302);
    const cod = decodeURIComponent(m[1]);
    try {
      const lista = await produtos();
      const alvo = String(cod).trim().toLowerCase();
      const p = lista.find((x) => String(x.Codigo || '').toLowerCase() === alvo || String(x.ID) === cod);
      if (!p) return Response.redirect(SITE_URL, 302);
      return new Response(pagina(p, p.Codigo || p.ID), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    } catch (e) {
      return Response.redirect(SITE_URL + '?c=' + encodeURIComponent(cod), 302); // API fora: a pessoa ainda chega na peça
    }
  }
};
