/* ====================================================================
 * TENKiTER — service worker ÚNICO do site (v3.4)
 *
 * Só pode existir UM service worker por endereço, e o OneSignal (avisos push) já usa este arquivo.
 * Por isso ele faz as duas coisas: (1) OneSignal, (2) deixar o catálogo abrir sem internet.
 * NÃO renomeie este arquivo: quem já ativou os avisos está ligado a ele.
 *
 * Regras do cache (simples e seguras):
 *  - Páginas e arquivos do site (HTML, JS, CSS, ícones): REDE PRIMEIRO. Com internet, sempre o código mais novo; sem internet, o último que a pessoa viu.
 *  - Fotos (Google/Cloudinary): usa a foto guardada se tiver, e atualiza por trás. Só guarda resposta legível (nada de "opaca": gasta muita memória do aparelho).
 *  - Dados (Apps Script, OneSignal, Meta) e tudo que não for GET: NÃO mexe. O catálogo já guarda a própria lista no aparelho.
 *  - Admin, RH e currículos nunca ficam no cache deste worker.
 * Para forçar renovação do cache de todo mundo: troque VERSAO abaixo.
 * ==================================================================== */
// Se o endereço do OneSignal estiver bloqueado (bloqueador de anúncios, rede da escola/empresa), o worker NÃO pode morrer junto:
// sem isto o navegador recusa o arquivo inteiro e o catálogo deixa de abrir sem internet. Só os avisos push ficam de fora.
try { importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js'); } catch (e) { /* segue só com o cache */ }

var VERSAO = 'tk-3.4.0';
var CACHE_SITE = 'tk-site-' + VERSAO;
var CACHE_FOTOS = 'tk-fotos-v1';
var MAX_FOTOS = 160;
var BASICO = ['/', '/index.html', '/common.js', '/meta.js', '/pedido.js', '/push.js', '/pwa.js', '/nav.js', '/a11y.js', '/privacidade.html', '/site.webmanifest', '/logo-mark.png', '/icon-192.png', '/favicon.ico'];
var PAGINAS = /^\/(index\.html|privacidade\.html)?$/;
var ESTATICOS = /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|webmanifest|woff2?)$/i;
var FORA_DO_CACHE = /^\/(admin|treinamentos|curriculos|curriculo|manual)\.html$/;
var HOSTS_FOTO = /^(?:lh3\.googleusercontent\.com|res\.cloudinary\.com)$/;

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE_SITE).then(function (c) {
      return Promise.all(BASICO.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.filter(function (n) { return n.indexOf('tk-site-') === 0 && n !== CACHE_SITE; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/** Rede primeiro; guarda a cópia; sem rede, devolve a última cópia. `chave` junta todas as variações de endereço (?c=...) numa cópia só. */
function redePrimeiro(req, chave) {
  return fetch(req).then(function (resp) {
    if (resp && resp.ok && resp.type === 'basic') {
      var copia = resp.clone();
      caches.open(CACHE_SITE).then(function (c) { c.put(chave, copia); });
    }
    return resp;
  }).catch(function () {
    return caches.open(CACHE_SITE).then(function (c) {
      return c.match(chave).then(function (achou) {
        if (achou) return achou;
        if (req.mode === 'navigate') return c.match('/index.html');
        return Response.error();
      });
    });
  });
}

/** Foto: se já está guardada, mostra na hora. Se não, busca (modo legível), guarda e mostra. Hosts sem CORS caem no jeito normal. */
function fotoComCache(req) {
  return caches.open(CACHE_FOTOS).then(function (c) {
    return c.match(req.url).then(function (guardada) {
      if (guardada) return guardada;
      return fetch(req.url, { mode: 'cors', credentials: 'omit' }).then(function (resp) {
        if (resp && resp.ok && resp.type === 'cors') {
          c.put(req.url, resp.clone()).then(function () {
            return c.keys().then(function (ks) { if (ks.length > MAX_FOTOS) return c.delete(ks[0]); });
          });
        }
        return resp;
      }).catch(function () { return fetch(req); });
    });
  });
}

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (FORA_DO_CACHE.test(url.pathname)) return;
    // link curto da peça (/p/TK-0008): sem internet vai direto para o catálogo com a peça aberta
    var p = url.pathname.match(/^\/p\/([^/]+)\/?$/);
    if (p && req.mode === 'navigate') {
      ev.respondWith(fetch(req).catch(function () { return Response.redirect('/?c=' + p[1], 302); }));
      return;
    }
    if (req.mode === 'navigate' && PAGINAS.test(url.pathname)) {
      ev.respondWith(redePrimeiro(req, url.pathname === '/privacidade.html' ? '/privacidade.html' : '/index.html'));
      return;
    }
    if (ESTATICOS.test(url.pathname) && url.pathname.indexOf('/OneSignal') !== 0) { ev.respondWith(redePrimeiro(req, url.pathname)); return; }
    return;
  }
  if (HOSTS_FOTO.test(url.hostname) && req.destination === 'image') { ev.respondWith(fotoComCache(req)); }
});
