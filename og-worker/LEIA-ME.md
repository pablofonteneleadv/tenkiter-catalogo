# Worker da Cloudflare — `tenkiter-og` (v2)

Endereço: `https://tenkiter-og.distkrpconfeccoes.workers.dev` · código: `og-worker/worker.js` (um arquivo só, sem dependências, **sem segredo**).

| Caminho | Para quê |
|---|---|
| `/p/<código>` | Página da peça com miniatura (`og:*`) para o WhatsApp/Instagram, **dados estruturados `Product` (JSON-LD)** para o Google e texto visível; leva a pessoa a `?c=<código>`. É o link que o botão de compartilhar gera (`linkProduto(p)`). |
| `/sitemap.xml` | Mapa do site: página inicial, privacidade e **todas as peças ativas** (`/p/<código>`, com foto). Se o Apps Script cair, devolve só as páginas fixas. |
| `/feed.csv` e `/feed.xml` | Catálogo para a Meta (Instagram/Facebook) e para o Google Merchant. **As mesmas colunas e regras do backend** (`itemFeed_`) — o teste `tests/worker_og.js` compara linha a linha. Preço = preço de tabela (o desconto à vista é condição de pagamento, não promoção). |
| `/lista.json` | A lista pública de peças (CORS liberado; o navegador guarda 60 s). **Hoje NÃO deixa o catálogo mais rápido**: medido em 10/10/2026, responde em ~1,1 s (o Apps Script direto leva ~1,6 s e o Worker sem chamar o Apps Script, ~0,2 s) — o cache do Worker não pega na borda. O catálogo só usa se `LISTA_RAPIDA_URL` (em `common.js`) estiver preenchido; se o Worker falhar ou passar de 3,5 s, cai no Apps Script sozinho. Para ficar rápido de verdade é preciso guardar a lista na borda (Workers KV com atualização em segundo plano; o Cache API não funciona em `*.workers.dev`). |

Qualquer outro caminho redireciona para a loja. Se o Apps Script estiver fora do ar, `/p/<código>` ainda leva a pessoa à peça (`?c=`), `/sitemap.xml` devolve as páginas fixas e `/feed.*` responde 503 com `Retry-After` (a Meta tenta de novo).

## Como publicar (precisa do Pablo ou de um token novo da Cloudflare)

**Jeito rápido (por API, sem instalar nada):** crie um token em Cloudflare → Meu perfil → API Tokens com o modelo *Edit Cloudflare Workers* (coloque data de fim, no máximo 1–2 dias) e rode `CLOUDFLARE_API_TOKEN=<token> python3 og-worker/publicar.py`; depois `node tests/worker_og.js` e abra os endereços da lista abaixo. Apague o token ao terminar. Foi assim que o Worker v2 foi publicado em 10/10/2026. (Pelo painel também serve: passos 1–3 abaixo.)

1. Cloudflare → **Workers & Pages** → `tenkiter-og` → **Edit code** → apague tudo → cole o conteúdo de `og-worker/worker.js` → **Deploy**.
2. Confira no navegador (troque `TK-0001` por um código que exista):
   - `https://tenkiter-og.distkrpconfeccoes.workers.dev/p/TK-0001` (deve redirecionar para o catálogo; "ver código-fonte" mostra `application/ld+json`);
   - `.../sitemap.xml`, `.../feed.csv`, `.../lista.json`.
3. **Render → o site estático → Redirects/Rewrites** (a regra `/p/*` já existe). Crie, do tipo **Rewrite**:
   - `/feed.csv` → `https://tenkiter-og.distkrpconfeccoes.workers.dev/feed.csv`
   - `/feed.xml` → `https://tenkiter-og.distkrpconfeccoes.workers.dev/feed.xml`
   - `/sitemap.xml` → `https://tenkiter-og.distkrpconfeccoes.workers.dev/sitemap.xml` — **e então apague o `sitemap.xml` do repositório** (o arquivo estático tem só 3 páginas; não dependa de qual dos dois o Render serve primeiro). Depois abra `https://tenkitermodas.com.br/sitemap.xml` e confira se listou as peças.
4. (**Não ligue ainda** — sem o cache de borda não ganha velocidade, ver a tabela acima) em `common.js` troque `const LISTA_RAPIDA_URL = '';` por `'https://tenkiter-og.distkrpconfeccoes.workers.dev/lista.json'`, rode `python3 tests/rodar_tudo.py` e publique. Para desligar: volte a `''`.
5. Google Search Console: cadastre `https://tenkitermodas.com.br/sitemap.xml`. Meta (Gerenciador de Comércio) / Google Merchant: fonte de dados por link → `https://tenkitermodas.com.br/feed.csv` (ou `.xml` no Google).

## Cuidados

- `API_URL` e `SITE_URL` do Worker são públicos e **têm que ser iguais aos de `common.js`** (o teste confere a `API_URL`). Se trocar a implantação do Apps Script, troque nos dois lugares e publique o Worker de novo.
- Nunca coloque chave, token ou senha neste arquivo (repositório público). O token da API de Conversões da Meta fica só nas Propriedades do Script do Apps Script.
- Links compartilháveis sempre pelo `SITE_URL` (`https://tenkitermodas.com.br/p/<código>`), nunca pelo endereço do Apps Script.
- Cabeçalhos de segurança do **site** (CSP em cabeçalho, HSTS, `X-Frame-Options`...) são configurados no Render (Settings → Headers) ou numa regra da Cloudflare; o Worker só cobre as suas próprias respostas (`nosniff`, `Referrer-Policy`). O `index.html` já tem uma CSP por `<meta>`.
- `og-service/` (Node) é uma alternativa antiga, não usada.

## Testar sem publicar

`node tests/worker_og.js` roda este arquivo de verdade com o Apps Script simulado (peça, JSON-LD, sitemap, feed igual ao do backend, lista rápida, caminhos de erro). Entra em `python3 tests/rodar_tudo.py`.
