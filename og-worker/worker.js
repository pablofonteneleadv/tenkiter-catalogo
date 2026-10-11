/* ====================================================================
 * TENKiTER — og-worker v2 (Cloudflare Worker)
 *
 *   /p/<código>      página da peça com miniatura (og:*), dados estruturados (JSON-LD Product, para o Google) e texto visível;
 *                    a pessoa é levada ao catálogo (?c=<código>). É o link que vai no WhatsApp/Instagram.
 *   /p/<código>?f=3  o MESMO link, mas na 3ª foto da galeria (1 = capa; o vídeo é sempre o último): a miniatura é essa foto (ou um quadro do
 *                    vídeo) e a pessoa cai no catálogo já nela (?c=<código>&f=3). Número inválido = capa.
 *   /sitemap.xml     mapa do site com a página inicial e TODAS as peças ativas (/p/<código>) — para o Google achar cada peça.
 *   /feed.csv        catálogo para a Meta (Instagram/Facebook) e o Google Merchant, gerado da lista (funciona mesmo com o Apps Script antigo).
 *   /feed.xml        o mesmo catálogo em XML (Google Merchant).
 *   /lista.json      a lista pública de peças (CORS liberado; o navegador guarda 60 s). MEDIDO em 10/10/2026: ainda NÃO acelera (~1,1 s, igual ao Apps Script),
 *                    porque o cache de verdade na borda (ex.: Workers KV) não foi feito; por isso LISTA_RAPIDA_URL (common.js) fica vazia.
 *
 * Sem segredos: API_URL e SITE_URL são públicos (o catálogo já é público). Nenhuma credencial entra neste arquivo.
 * Como publicar: painel Cloudflare > Workers & Pages > tenkiter-og > Edit code > colar este arquivo > Deploy.
 * Depois, no Render (Redirects/Rewrites do site estático) crie as regras  /p/* , /sitemap.xml , /feed.csv , /feed.xml  ->  https://tenkiter-og.distkrpconfeccoes.workers.dev/<mesmo caminho>
 * (a regra /p/* já existe; as outras são novas e opcionais).
 * ==================================================================== */
const API_URL = 'https://script.google.com/macros/s/AKfycbyWnKwT5-HB6rv-loxGUtumpWPlJsRZNYp06v5RC3wtiJDUaV9zCMJVRwOEScxwMase_Q/exec';
const SITE_URL = 'https://tenkitermodas.com.br/';
const DESCONTO_AVISTA = 0.10;
const PAGINAS_FIXAS = ['', 'privacidade.html', 'curriculo.html'];

async function produtos() {
  const r = await fetch(API_URL + '?action=list', { redirect: 'follow', cf: { cacheTtl: 60, cacheEverything: true } });
  const j = await r.json();
  if (!(j && j.ok && Array.isArray(j.produtos))) throw new Error('lista inválida');
  return j.produtos;
}

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const xmlEsc = (v) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const real = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',');
const ativa = (p) => String(p.Status == null ? '' : p.Status).trim().toLowerCase() === 'ativo';
const temEstoque = (p) => p.Estoque === '' || p.Estoque == null || Number(p.Estoque) > 0;
const linkPeca = (p) => (String(p.Codigo || '').trim() ? SITE_URL + 'p/' + encodeURIComponent(String(p.Codigo).trim()) : SITE_URL + '?id=' + encodeURIComponent(p.ID));
const CABECALHOS_SEGUROS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };

/** JSON-LD dentro de <script>: "<" vira \u003c para que um nome de peça nunca consiga fechar o script. */
function jsonLd(obj) { return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }

/** Fotos e vídeo da peça NA MESMA ORDEM do catálogo (index.html): capa, galeria e, por último, o vídeo. Mudou lá, mude aqui. */
function midias(p) {
  const fotos = [p.Foto_URL].concat(String(p.Fotos_Galeria || '').split(',').map((s) => s.trim()).filter(Boolean));
  const out = fotos.map((url) => ({ tipo: 'foto', url: String(url || '') }));
  const v = String(p.Video_URL || '');
  if (/^https:\/\/res\.cloudinary\.com\//.test(v)) out.push({ tipo: 'video', url: v, cloudinary: true });
  else if (/^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/preview$/.test(v)) out.push({ tipo: 'video', url: v, cloudinary: false });
  return out;
}
/** Imagem que representa a foto/vídeo na miniatura (og:image). Foto do Google sai em 1200 px (leve para o WhatsApp); vídeo da Cloudinary vira um
 *  quadro dele (30% da duração: o quadro 0 costuma vir preto). Vídeo do Drive não dá miniatura confiável: devolve '' e quem chama usa a capa. */
function imagemDaMidia(m) {
  if (!m) return '';
  if (m.tipo === 'foto') return /^https:\/\/lh3\.googleusercontent\.com\/d\/[\w-]+$/.test(m.url) ? m.url + '=w1200' : m.url;
  if (m.cloudinary && m.url.indexOf('/video/upload/') !== -1) return m.url.replace('/video/upload/', '/video/upload/so_30p,w_1200,c_limit,f_jpg/').replace(/\.[A-Za-z0-9]+(\?.*)?$/, '.jpg');
  return '';
}
/** ?f=<n> do endereço -> número de 2 a 99, ou 1 (capa) se não for um número válido. */
function numeroDaFoto(v) { const n = parseInt(v, 10); return n >= 2 && n <= 99 ? n : 1; }

function pagina(p, cod, f) {
  const lista = midias(p);
  const n = f >= 2 && f <= lista.length ? f : 1;          // foto escolhida (1 = capa)
  const destino = SITE_URL + '?c=' + encodeURIComponent(cod) + (n > 1 ? '&f=' + n : '');
  const cheio = Number(p.Preco) || 0;
  const avista = cheio * (1 - DESCONTO_AVISTA);
  const titulo = p.Nome + (p.Codigo ? ' [' + p.Codigo + ']' : '') + ' — ' + real(avista) + ' à vista';
  const desc = (p.Descricao ? String(p.Descricao).slice(0, 160) + ' | ' : '') + 'De ' + real(cheio) + ' por ' + real(avista) + ' à vista na TENKiTER Modas — Crateús, CE.';
  const capa = p.Foto_URL || (SITE_URL + 'og-banner.jpg');
  const img = imagemDaMidia(lista[n - 1]) || imagemDaMidia(lista[0]) || capa;   // a foto escolhida; sem miniatura própria, a capa
  const canonico = linkPeca(p);
  const urlCompartilhada = n > 1 ? canonico + (canonico.indexOf('?') === -1 ? '?' : '&') + 'f=' + n : canonico;
  const galeria = String(p.Fotos_Galeria || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);
  // Dados estruturados (Google): preço = preço de tabela; o desconto à vista aparece no texto, não como promoção.
  const produtoLd = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.Nome, sku: p.Codigo || String(p.ID), description: String(p.Descricao || p.Nome).slice(0, 500),
    image: [capa].concat(galeria), brand: { '@type': 'Brand', name: 'TENKiTER Modas' }, category: p.Categoria || undefined,
    offers: {
      '@type': 'Offer', url: linkPeca(p), priceCurrency: 'BRL', price: cheio.toFixed(2), itemCondition: 'https://schema.org/NewCondition',
      availability: temEstoque(p) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'TENKiTER Modas' }
    }
  };
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(titulo) + '</title><meta name="description" content="' + esc(desc) + '">' +
    '<link rel="canonical" href="' + esc(canonico) + '">' +
    '<meta property="og:type" content="product"><meta property="og:site_name" content="TENKiTER Modas"><meta property="og:locale" content="pt_BR">' +
    '<meta property="og:title" content="' + esc(titulo) + '"><meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:image" content="' + esc(img) + '"><meta property="og:url" content="' + esc(urlCompartilhada) + '">' +
    '<meta property="product:price:amount" content="' + esc(cheio.toFixed(2)) + '"><meta property="product:price:currency" content="BRL">' +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(titulo) + '">' +
    '<meta name="twitter:description" content="' + esc(desc) + '"><meta name="twitter:image" content="' + esc(img) + '">' +
    '<script type="application/ld+json">' + jsonLd(produtoLd) + '</script>' +
    '<meta http-equiv="refresh" content="0; url=' + esc(destino) + '">' +
    '<script>location.replace(' + JSON.stringify(destino).replace(/</g, '\\u003c') + ');</script>' +
    '</head><body style="font-family:system-ui,sans-serif;text-align:center;padding:40px">' +
    '<h1>' + esc(p.Nome) + '</h1><img src="' + esc(img) + '" alt="' + esc(p.Nome) + '" width="240" style="max-width:100%;height:auto">' +
    '<p>' + esc(desc) + '</p><p><a href="' + esc(destino) + '">Abrir a peça no catálogo</a></p></body></html>';
}

/* ---------------- mapa do site ---------------- */
function sitemap(lista) {
  const urls = PAGINAS_FIXAS.map((c) => '<url><loc>' + xmlEsc(SITE_URL + c) + '</loc></url>').concat(
    lista.filter((p) => ativa(p) && String(p.Codigo || '').trim()).map((p) =>
      '<url><loc>' + xmlEsc(linkPeca(p)) + '</loc>' +
      (p.Foto_URL ? '<image:image><image:loc>' + xmlEsc(p.Foto_URL) + '</image:loc><image:title>' + xmlEsc(String(p.Nome || '').slice(0, 100)) + '</image:title></image:image>' : '') + '</url>'));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' + urls.join('') + '</urlset>';
}

/* ---------------- feed do catálogo (mesmas colunas do backend 3.1: itemFeed_ / COLUNAS_FEED_) ---------------- */
const COLUNAS_FEED = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'additional_image_link', 'brand', 'gender', 'age_group', 'color', 'product_type', 'quantity_to_sell_on_facebook'];
const semAcento = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function itemFeed(p) {
  const cod = String(p.Codigo || '').trim();
  const generos = semAcento(p.Genero);
  const estoqueInf = p.Estoque !== '' && p.Estoque !== null && p.Estoque !== undefined;
  const galeria = String(p.Fotos_Galeria || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 9);
  return {
    id: cod || String(p.ID), title: String(p.Nome || '').slice(0, 150), description: String(p.Descricao || p.Nome || '').slice(0, 5000),
    availability: estoqueInf && Number(p.Estoque) <= 0 ? 'out of stock' : 'in stock', condition: 'new',
    price: (Number(p.Preco) || 0).toFixed(2) + ' BRL', link: linkPeca(p), image_link: String(p.Foto_URL || ''), additional_image_link: galeria.join(','),
    brand: 'TENKiTER Modas',
    gender: /feminino|menina/.test(generos) ? 'female' : (/masculino|menino/.test(generos) ? 'male' : 'unisex'),
    age_group: /infantil|menina|menino/.test(generos) ? 'kids' : 'adult',
    color: String(p.Cores || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3).join('/'),
    product_type: String(p.Categoria || ''),
    quantity_to_sell_on_facebook: estoqueInf ? String(Math.max(0, Number(p.Estoque) || 0)) : ''
  };
}
const csvCampo = (v) => { const t = String(v == null ? '' : v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const itensDoFeed = (lista) => lista.filter((p) => ativa(p) && String(p.Foto_URL || '').trim() && Number(p.Preco) > 0).map(itemFeed);
function feedCsv(lista) {
  return [COLUNAS_FEED.join(',')].concat(itensDoFeed(lista).map((it) => COLUNAS_FEED.map((c) => csvCampo(it[c])).join(','))).join('\r\n') + '\r\n';
}
function feedXml(lista) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel>' +
    '<title>TENKiTER Modas</title><link>' + xmlEsc(SITE_URL) + '</link><description>Catálogo da TENKiTER Modas, Crateús-CE</description>' +
    itensDoFeed(lista).map((it) => '<item>' + COLUNAS_FEED.filter((c) => String(it[c]).length).map((c) => '<g:' + c + '>' + xmlEsc(it[c]) + '</g:' + c + '>').join('') + '</item>').join('') +
    '</channel></rss>';
}

const resposta = (corpo, tipo, cache, extra) => new Response(corpo, { headers: Object.assign({ 'Content-Type': tipo, 'Cache-Control': cache }, CABECALHOS_SEGUROS, extra || {}) });

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const caminho = url.pathname;
    const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' };
    try {
      if (caminho === '/lista.json') {
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: Object.assign({}, CORS, CABECALHOS_SEGUROS) });
        try {
          const lista = await produtos();
          return resposta(JSON.stringify({ ok: true, produtos: lista }), 'application/json; charset=utf-8', 'public, max-age=60', CORS);
        } catch (e) {
          return new Response(JSON.stringify({ ok: false }), { status: 502, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS, CABECALHOS_SEGUROS) });
        }
      }
      if (caminho === '/sitemap.xml') {
        let lista = [];
        try { lista = await produtos(); } catch (e) { /* API fora: devolve ao menos as páginas fixas */ }
        return resposta(sitemap(lista), 'application/xml; charset=utf-8', 'public, max-age=900');
      }
      if (caminho === '/feed.csv' || caminho === '/feed.xml') {
        const lista = await produtos();   // sem lista não há feed: o erro cai no catch e devolve 503 (a Meta tenta de novo depois)
        return caminho === '/feed.csv'
          ? resposta(feedCsv(lista), 'text/csv; charset=utf-8', 'public, max-age=300')
          : resposta(feedXml(lista), 'application/xml; charset=utf-8', 'public, max-age=300');
      }
      const m = caminho.match(/^\/p\/([^/]+)\/?$/);
      if (!m) return Response.redirect(SITE_URL, 302);
      const cod = decodeURIComponent(m[1]);
      try {
        const lista = await produtos();
        const alvo = String(cod).trim().toLowerCase();
        const p = lista.find((x) => String(x.Codigo || '').toLowerCase() === alvo || String(x.ID) === cod);
        if (!p) return Response.redirect(SITE_URL, 302);
        return resposta(pagina(p, p.Codigo || p.ID, numeroDaFoto(url.searchParams.get('f'))), 'text/html; charset=utf-8', 'public, max-age=300');
      } catch (e) {
        const fx = numeroDaFoto(url.searchParams.get('f'));
        return Response.redirect(SITE_URL + '?c=' + encodeURIComponent(cod) + (fx > 1 ? '&f=' + fx : ''), 302); // API fora: a pessoa ainda chega na peça (e na foto)
      }
    } catch (e) {
      return new Response('Catálogo indisponível no momento. Tente de novo em instantes.', { status: 503, headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '120' }, CABECALHOS_SEGUROS) });
    }
  }
};
