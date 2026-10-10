#!/usr/bin/env node
/* Testa o Worker da Cloudflare (og-worker/worker.js) rodando o código de verdade com o Apps Script SIMULADO (fetch falso).
 * Confere: página da peça (og:*, JSON-LD, redirecionamento), mapa do site, catálogo CSV/XML (igual ao do backend 3.1), lista rápida e os caminhos de erro.
 *   node tests/worker_og.js            (sai com código 1 se algo falhar)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.resolve(__dirname, '..');
let falhas = [], total = 0;
function ok(cond, nome, detalhe) { total++; if (!cond) { falhas.push(nome); console.log('  ✘ ' + nome + (detalhe !== undefined ? '  (' + String(detalhe).slice(0, 300) + ')' : '')); } else console.log('  ✔ ' + nome); }

// ---------------------------------------------------------------- carrega o Worker (export default -> module.exports)
const fonteWorker = fs.readFileSync(path.join(RAIZ, 'og-worker', 'worker.js'), 'utf8');
let apiLista = null, apiQuebrada = false, chamadasApi = 0;
function carregar() {
  const ctx = { Response, URL, fetch: async (u) => {
    chamadasApi++;
    if (apiQuebrada) throw new Error('API fora do ar');
    if (!String(u).includes('?action=list')) throw new Error('chamada inesperada: ' + u);
    return { json: async () => ({ ok: true, produtos: apiLista }) };
  }, module: { exports: {} }, console, String, Number, Array, JSON, Object, RegExp, encodeURIComponent, decodeURIComponent, Math };
  vm.runInNewContext(fonteWorker.replace('export default', 'module.exports ='), ctx);
  return ctx.module.exports;
}
const W = carregar();
const pedir = (caminho, metodo) => W.fetch(new Request('https://tenkiter-og.exemplo.workers.dev' + caminho, { method: metodo || 'GET' }));

const SITE = 'https://tenkitermodas.com.br/';
const base = [
  { ID: 1, Nome: 'Blusa Floral', Categoria: 'Blusas', Genero: 'Feminino', Preco: 50, Foto_URL: 'https://res.cloudinary.com/x/image/upload/v1/a.jpg', Status: 'Ativo', Descricao: 'Blusa leve, tecido "viscose" & renda', Estoque: 3, Tamanhos: 'P,M', Cores: 'Azul, Rosa, Verde, Preto', Codigo: 'TK-0001', Fotos_Galeria: 'https://x/g1.jpg, https://x/g2.jpg' },
  { ID: 2, Nome: 'Fantasia Infantil', Categoria: 'Fantasias', Genero: 'Menino', Preco: 89.9, Foto_URL: 'https://res.cloudinary.com/x/image/upload/v1/b.jpg', Status: 'ativo', Descricao: '', Estoque: 0, Cores: '', Codigo: 'TK-0002', Fotos_Galeria: '' },
  { ID: 3, Nome: 'Camisa </script><script>alert(1)</script>', Categoria: 'Camisas', Genero: 'Masculino', Preco: 70, Foto_URL: 'https://x/c.jpg', Status: 'Ativo', Descricao: 'Descrição <b>x</b>', Estoque: '', Codigo: 'TK-0003' },
  { ID: 4, Nome: 'Peça arquivada', Categoria: 'Blusas', Genero: 'Feminino', Preco: 10, Foto_URL: 'https://x/d.jpg', Status: 'Arquivado', Codigo: 'TK-0004' },
  { ID: 5, Nome: 'Sem foto', Categoria: 'Blusas', Genero: 'Feminino', Preco: 10, Foto_URL: '', Status: 'Ativo', Codigo: 'TK-0005' },
  { ID: 6, Nome: 'Sem código (antiga)', Categoria: 'Blusas', Genero: 'Feminino', Preco: 33, Foto_URL: 'https://x/e.jpg', Status: 'Ativo', Codigo: '' },
  { ID: 7, Nome: 'Preço zero', Categoria: 'Blusas', Genero: 'Feminino', Preco: 0, Foto_URL: 'https://x/f.jpg', Status: 'Ativo', Codigo: 'TK-0007' }
];

(async () => {
  apiLista = base;

  console.log('== Página da peça /p/<código> ==');
  let r = await pedir('/p/TK-0001'); let h = await r.text();
  ok(r.status === 200 && /text\/html/.test(r.headers.get('content-type')), 'peça existente responde 200 em HTML');
  ok(/<meta property="og:title" content="Blusa Floral \[TK-0001\] — R\$ 45,00 à vista">/.test(h), 'og:title com nome, código e preço à vista', (h.match(/og:title[^>]*>/) || [])[0]);
  ok(h.includes('<meta property="og:image" content="https://res.cloudinary.com/x/image/upload/v1/a.jpg">'), 'og:image é a foto da peça');
  ok(h.includes('<link rel="canonical" href="' + SITE + 'p/TK-0001">'), 'link canônico é o endereço curto da peça');
  ok(h.includes('location.replace("' + SITE + '?c=TK-0001")') && h.includes('url=' + SITE + '?c=TK-0001'), 'leva a pessoa ao catálogo com a peça aberta (?c=)');
  ok(h.includes('R$ 50,00 por R$ 45,00') || h.includes('De R$ 50,00 por R$ 45,00'), 'texto mostra preço cheio e à vista (10%)');
  ok(!/3x|sem juros/i.test(h), 'não promete parcelamento sem juros');
  const ld = (h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
  let j = null; try { j = JSON.parse(ld); } catch (e) {}
  ok(j && j['@type'] === 'Product' && j.sku === 'TK-0001' && j.offers.price === '50.00' && j.offers.priceCurrency === 'BRL', 'JSON-LD Product válido (preço de tabela, BRL, SKU)', ld);
  ok(j && j.offers.availability === 'https://schema.org/InStock' && j.image.length === 3, 'JSON-LD: em estoque e com as fotos da galeria');
  ok(j && j.offers.url === SITE + 'p/TK-0001', 'JSON-LD: url da oferta é o endereço curto');
  ok(h.includes('<h1>Blusa Floral</h1>') && h.includes('Abrir a peça no catálogo'), 'conteúdo visível (nome, foto e link) para quem não executa JavaScript');
  ok(r.headers.get('x-content-type-options') === 'nosniff', 'cabeçalho de segurança nosniff');

  r = await pedir('/p/tk-0001/'); h = await r.text();
  ok(r.status === 200 && h.includes('Blusa Floral'), 'código em minúsculas e com barra no final também acha a peça');
  r = await pedir('/p/1'); h = await r.text();
  ok(r.status === 200 && h.includes('Blusa Floral'), 'também acha pelo ID numérico');
  r = await pedir('/p/TK-0002'); h = await r.text();
  ok(JSON.parse(h.match(/ld\+json">([\s\S]*?)<\/script>/)[1]).offers.availability === 'https://schema.org/OutOfStock', 'peça esgotada vira OutOfStock no JSON-LD');
  r = await pedir('/p/TK-0003'); h = await r.text();
  const blocoLd = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  ok(!/<\/?script/i.test(blocoLd) && JSON.parse(blocoLd).name.includes('alert(1)'), 'nome malicioso não consegue fechar o <script> do JSON-LD');
  ok((h.match(/<script/g) || []).length === 2 && !h.includes('<b>x</b>') && !h.includes('<script>alert'), 'nome/descrição com HTML saem escapados na página');
  r = await pedir('/p/NAO-EXISTE');
  ok(r.status === 302 && r.headers.get('location') === SITE, 'código que não existe leva à loja (302)');
  apiQuebrada = true; r = await pedir('/p/TK-0001');
  ok(r.status === 302 && r.headers.get('location') === SITE + '?c=TK-0001', 'com o Apps Script fora do ar, ainda leva a pessoa até a peça (?c=)');
  apiQuebrada = false;
  r = await pedir('/qualquer-coisa');
  ok(r.status === 302 && r.headers.get('location') === SITE, 'endereço desconhecido leva à loja');

  console.log('== /sitemap.xml ==');
  r = await pedir('/sitemap.xml'); let x = await r.text();
  ok(r.status === 200 && /application\/xml/.test(r.headers.get('content-type')), 'sitemap responde 200 em XML');
  ok(x.includes('<loc>' + SITE + '</loc>') && x.includes('<loc>' + SITE + 'privacidade.html</loc>'), 'tem a página inicial e a de privacidade');
  ok(x.includes('<loc>' + SITE + 'p/TK-0001</loc>') && x.includes('<loc>' + SITE + 'p/TK-0002</loc>') && x.includes('<loc>' + SITE + 'p/TK-0003</loc>'), 'tem as peças ativas (inclusive esgotada)');
  ok(!x.includes('p/TK-0004'), 'não tem peça arquivada');
  ok(!x.includes('<loc>' + SITE + 'p/</loc>') && !x.includes('?id=6'), 'não lista peça sem código');
  ok(x.includes('<image:loc>https://res.cloudinary.com/x/image/upload/v1/a.jpg</image:loc>'), 'cada peça leva a foto (sitemap de imagens)');
  ok(!x.includes('</script>') && x.includes('&lt;/script&gt;'), 'caracteres especiais do nome saem escapados no XML');
  apiQuebrada = true; r = await pedir('/sitemap.xml'); x = await r.text(); apiQuebrada = false;
  ok(r.status === 200 && x.includes('<loc>' + SITE + '</loc>') && !x.includes('/p/'), 'com o Apps Script fora do ar devolve ao menos as páginas fixas');

  console.log('== /feed.csv e /feed.xml (mesmo catálogo do backend 3.1) ==');
  const back = fs.readdirSync(RAIZ).filter(f => /^catalogo-codigo-\d+\.\d+\.gs\.txt$/.test(f)).sort().pop();
  const fonteBack = fs.readFileSync(path.join(RAIZ, back), 'utf8');
  const colunasBack = JSON.parse(fonteBack.match(/const COLUNAS_FEED_ = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  r = await pedir('/feed.csv'); let csv = await r.text();
  ok(r.status === 200 && /text\/csv/.test(r.headers.get('content-type')), 'feed.csv responde 200 em CSV');
  const linhas = csv.split('\r\n'); linhas.pop();
  ok(linhas[0] === colunasBack.join(','), 'colunas iguais às do backend (' + back + ')', linhas[0]);
  ok(csv.endsWith('\r\n') && !/[^\r]\n/.test(csv.replace(/"[^"]*"/g, '')), 'linhas terminam em CRLF');
  ok(linhas.length === 1 + 4, 'só entram peças ativas, com foto e preço > 0 (4 de 7; a sem código usa o ID)', linhas.length);
  ok(linhas[1].startsWith('TK-0001,Blusa Floral,"Blusa leve, tecido ""viscose"" & renda",in stock,new,50.00 BRL,' + SITE + 'p/TK-0001,'), 'primeira linha: id, título, descrição com aspas escapadas, estoque, preço cheio, link curto', linhas[1]);
  ok(linhas[1].includes('Azul/Rosa/Verde') && !linhas[1].includes('Preto'), 'cores: no máximo 3, separadas por "/"');
  ok(linhas[2].includes('out of stock') && linhas[2].includes(',male,kids,'), 'esgotada vira out of stock; Menino -> male/kids');
  // confere campo a campo com a função de verdade do backend
  const ctxBack = vm.createContext({ SITE_URL: SITE, String, Number, Math });
  vm.runInContext("function normalizar_(v){return String(v==null?'':v).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();}", ctxBack);
  vm.runInContext(fonteBack.match(/function linkPecaSite_\(p\) \{[\s\S]*?\n\}\n/)[0] + fonteBack.match(/function itemFeed_\(p\) \{[\s\S]*?\n\}\n/)[0], ctxBack);
  const csvCampo = (v) => { const t = String(v == null ? '' : v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const esperado = base.filter(p => String(p.Status).toLowerCase() === 'ativo' && String(p.Foto_URL || '').trim() && Number(p.Preco) > 0)
    .map(p => colunasBack.map(c => csvCampo(ctxBack.itemFeed_(p)[c])).join(',')).join('\r\n');
  ok(linhas.slice(1).join('\r\n') === esperado, 'cada linha é idêntica ao que o backend 3.1 gera (itemFeed_)', linhas.slice(1).join('|').slice(0, 200));
  r = await pedir('/feed.xml'); x = await r.text();
  ok(r.status === 200 && x.startsWith('<?xml') && x.includes('xmlns:g="http://base.google.com/ns/1.0"'), 'feed.xml é RSS do Google Merchant');
  ok((x.match(/<item>/g) || []).length === 4 && x.includes('<g:price>50.00 BRL</g:price>') && x.includes('<g:id>TK-0001</g:id>'), 'quatro itens com g:id e g:price');
  ok(x.includes('&amp; renda') && !x.includes('<g:description>Blusa leve, tecido "viscose" & renda'), 'descrição escapada no XML');
  ok(!/<g:color><\/g:color>/.test(x), 'campos vazios não viram tags vazias');
  apiQuebrada = true; r = await pedir('/feed.csv'); const t503 = await r.text(); apiQuebrada = false;
  ok(r.status === 503 && r.headers.get('retry-after') === '120' && t503.includes('indisponível'), 'sem lista não há feed: 503 com Retry-After (a Meta tenta de novo)');

  console.log('== /lista.json (lista rápida) ==');
  r = await pedir('/lista.json'); const lj = await r.json();
  ok(r.status === 200 && lj.ok === true && lj.produtos.length === base.length, 'devolve a lista pública');
  ok(r.headers.get('access-control-allow-origin') === '*' && /max-age=60/.test(r.headers.get('cache-control')), 'CORS liberado e cache de 60 s');
  r = await pedir('/lista.json', 'OPTIONS');
  ok(r.status === 204 && r.headers.get('access-control-allow-origin') === '*', 'pré-voo (OPTIONS) responde 204 com CORS');
  apiQuebrada = true; r = await pedir('/lista.json'); const lq = await r.json(); apiQuebrada = false;
  ok(r.status === 502 && lq.ok === false && r.headers.get('cache-control') === 'no-store' && r.headers.get('access-control-allow-origin') === '*', 'API fora do ar: 502 sem cache (o catálogo cai no Apps Script)');

  console.log('== Higiene ==');
  ok(!/token|secret|apikey|api_key|password/i.test(fonteWorker.replace(/API_URL/g, '')), 'o Worker não tem segredo (nada de token/chave)');
  ok(!/cnpj/i.test(fonteWorker), 'sem CNPJ');
  ok(/AKfycby[\w-]+/.test(fonteWorker) && (fs.readFileSync(path.join(RAIZ, 'common.js'), 'utf8').match(/AKfycby[\w-]+/) || [])[0] === (fonteWorker.match(/AKfycby[\w-]+/) || [])[0], 'o Worker aponta para a MESMA API_URL do common.js');
  ok(fonteWorker.includes("const SITE_URL = 'https://tenkitermodas.com.br/'"), 'links compartilháveis usam SITE_URL (nunca a API)');

  console.log('\nOK=%d FALHAS=%d', total - falhas.length, falhas.length, falhas);
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
