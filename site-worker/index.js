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
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/') return env.ASSETS.fetch(request);
    url.pathname = '/index.html';
    const r = await env.ASSETS.fetch(new Request(url.toString(), request));
    const resposta = new Response(r.body, r);
    for (const [nome, valor] of Object.entries(SEGURANCA)) if (!resposta.headers.has(nome)) resposta.headers.set(nome, valor);
    return resposta;
  },
};
