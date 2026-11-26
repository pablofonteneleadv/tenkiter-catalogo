// 7.96.x (relato do Pablo, 26/11/2026: o 📎 das Mensagens no app parou). A Cloudflare redirecionava /admin.html para /admin
// (html_handling padrão). O app só confia na página /admin.html (seletor de arquivos, entrega da conversa da notificação),
// então tudo continua em .html, como era no Render: html_handling = "none". Com isso a raiz "/" não acha o index.html
// sozinha; só para ela (run_worker_first = ["/"]) este script entrega o /index.html. O resto nem passa por aqui.
// Os cabeçalhos de "/*" vêm de scripts/deploy/cf_site_headers.py (_headers); aqui só se garantem se faltarem.
const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
};
// Endereços sem .html (o site redirecionava para eles entre 25 e 26/11/2026; o app e favoritos podem ter guardado):
// voltam para a página .html em vez de cair em "Não achamos essa página". Lista = páginas de scripts/deploy/public-files.json;
// cada uma também está em run_worker_first (site-worker/wrangler.toml), senão este script nem é chamado.
const PAGINAS = ['admin', 'curriculo', 'curriculos', 'esteira', 'exclusao-dados', 'fotos-ia', 'index', 'manual', 'privacidade',
  'treinamento-cadastro-simulacao', 'treinamentos', 'verificar'];
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const nome = url.pathname.replace(/^\/+|\/+$/g, '');
    if (url.pathname !== '/' && PAGINAS.includes(nome)) {
      url.pathname = '/' + nome + '.html';
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname !== '/') return env.ASSETS.fetch(request);
    url.pathname = '/index.html';
    const r = await env.ASSETS.fetch(new Request(url.toString(), request));
    const resposta = new Response(r.body, r);
    for (const [nome, valor] of Object.entries(SEGURANCA)) if (!resposta.headers.has(nome)) resposta.headers.set(nome, valor);
    return resposta;
  },
};
