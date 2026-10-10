# TENKiTER Modas — Catálogo Digital (contexto para o Claude Code)

Repositório público, sem build/dependências: HTML/CSS/JS puro + backend em Google Apps Script.

## Arquitetura (resumo — detalhes completos em README.md e LEIA-ME-ATUALIZAR.md)

- **Frontend** hospedado no Render (site estático): `index.html` (catálogo público), `admin.html`
  (painel do lojista), `curriculos.html` (gestão de currículos, só equipe)/`curriculo.html` (candidatura pública)/`treinamentos.html`
  (portal de treinamento + painel do RH; era `manual.html`, que agora é só um redirecionamento — nunca divulgar o nome antigo),
  `nav.js` (barra inferior ÚNICA de todas as páginas: para mudar menu/permissões, edite só ele),
  `common.js` (config compartilhada — **única fonte de verdade** para `API_URL`/`SITE_URL`).
  Também no front: `pedido.js` (sacola com formulário, pedido enviado, acompanhar pedido, favoritos, compartilhar seleção), `meta.js` (Pixel da
  Meta, desligado por padrão), `pwa.js` (instalar o app + registra o service worker), `admin-gestao.js` (pedidos, números, importar CSV,
  integrações, avisos no painel), `privacidade.html`, `404.html`, `site.webmanifest`, `robots.txt`, `sitemap.xml`.
- **Backend**: dois Apps Script Web Apps separados, versionados por nome de arquivo
  (`<nome>-<versão>.gs.txt`):
  - `catalogo-codigo-3.1.gs.txt` — catálogo + autenticação central + pedidos/métricas/importação/feed/integrações (v3.1).
  - `funcionario-codigo-3.0.gs.txt` — RH/treinamento/contratação.
  - Arquivos antigos (`Code-treinamento-v4.0.gs.txt`, `v4.1.gs.txt`, `atualizado.gs.txt`,
    `tenkiter-codigo-v2.1.gs.txt`) são **históricos — não editar nem usar como referência**.

## Regras que já causaram bugs reais (não repetir)

1. **`API_URL` ≠ `SITE_URL`.** `API_URL` é só o backend de dados; nunca usar para montar link
   compartilhável (WhatsApp, Stories). Link compartilhável é sempre `SITE_URL`. `index.html` e
   `admin.html` têm que apontar para a mesma `API_URL` — trocar só em `common.js`.
2. **Toda mensagem enviada ao cliente/candidato (WhatsApp etc.) tem que ter o endereço completo e
   clicável** (ex. `https://tenkitermodas.com.br/treinamentos.html`), nunca só o nome do arquivo. "Tem
   que facilitar" — a pessoa só clica.
3. **Busca sempre ignora filtros ativos.** Quando há termo de busca, ele busca em TUDO,
   independente de status/etapa/agenda selecionados — nunca ANDar busca com filtro.
4. **Nunca dumpar JSON cru na UI.** Erros/respostas estruturadas (ex. `errosDetalhados` dos
   testes) sempre renderizados como cards legíveis, nunca como texto JSON escapado.
5. **Convenção de versão dos `.gs.txt`**: ao editar um backend, sempre `git mv` para o próximo
   número de versão no nome do arquivo, E atualizar o comentário de cabeçalho E o campo
   `versao` retornado por `doGet` com `action=='versao'` — os três têm que ficar sincronizados.

## Deploy — como funciona de fato (não como o README promete)

- **Frontend (Render)**: embora o serviço tenha `autoDeploy: yes`, o deploy automático ao fazer
  push para `main` se mostrou pouco confiável na prática. Depois de cada push, sempre disparar
  deploy explícito e confirmar:
  1. `mcp__Render__trigger_deploy` (serviço `srv-dasa63fpn0mc73fh8fgg`, workspace
     `tea-d001phk9c44c73fd13h0`)
  2. `mcp__Render__get_deploy` em loop até `status: "live"`
  3. `curl` em `https://tenkiter-catalogo.onrender.com/<arquivo>` e `grep` por uma string nova
     do próprio commit, para confirmar que o ar está servindo o código novo (não só "live").
- **Backend (Apps Script)**: **não pode ser deployado por automação** — precisa que o Pablo cole
  manualmente o `.gs.txt` no editor do Apps Script e clique em "Nova versão" (Gerenciar
  implantações → editar → Nova versão). Depois que ele confirmar, validar com:
  - `curl` em `?action=versao` esperando a versão nova (GET funciona normal com curl).
  - Para testar ações via **POST**, curl com User-Agent padrão cai na proteção
    anti-bot do Google (HTTP 405 + página de erro do Google Drive). Usar Python
    `urllib.request` com um header `User-Agent` de navegador — isso retorna o JSON real.

## Link e miniatura do produto

- Link público da peça: **sempre** `linkProduto(p)` (common.js) = `SITE_URL + 'p/<código>'`. Nunca montar a partir de
  `API_URL` — o `?action=share` do Apps Script devolve HTML dentro de um iframe do Google, o WhatsApp não lê as meta
  tags `og:*` dali e a mensagem mostrava o endereço do script sem miniatura (bug real, não repetir).
- Miniatura **por produto**: Cloudflare Worker `tenkiter-og` (código em `og-worker/worker.js`, endereço
  `https://tenkiter-og.distkrpconfeccoes.workers.dev`) devolve HTML com `og:*` em `/p/<código>` e redireciona a pessoa para
  `?c=<código>`. No Render existe a regra Rewrite `/p/*` -> `<worker>/p/*` (confirmado: faz proxy, não redireciona). Se mudar
  o código do Worker, publicar de novo na Cloudflare (painel ou API). `og-service/` (Node) é alternativa antiga, não usada. O Worker agora é **v2** (JSON-LD, `/sitemap.xml`, `/feed.csv|xml`, `/lista.json`) — guia de publicação em `og-worker/LEIA-ME.md`.
  `index.html` mantém `og:image` genérico (`og-banner.jpg`) para o link da loja em si.

## Instagram / redes sociais

Decisão já tomada: **sem postagem automática via API do Instagram.** O fluxo é manual —
`admin.html` já tem um gerador de arte para Stories que o lojista compartilha manualmente. Não
implementar integração automática de postagem sem o Pablo pedir explicitamente de novo.

## Segurança

Repositório é **público** — nunca commitar chaves, tokens, PIN em texto plano ou qualquer
segredo. Credenciais/URLs sensíveis ficam só em variáveis de ambiente do Render ou nas
Propriedades do Script do Apps Script, nunca no código versionado.

## v3.1 — gestão/RH alinhados ao catálogo (convenções novas)

- **Miniaturas**: toda foto de LISTA usa `fotoMini(url, largura)` (common.js: Google `lh3 /d/<id>` -> `=w<N>`, Cloudinary ->
  `w_<N>,c_limit,f_auto,q_auto`). Foto grande (modal do produto, Stories, IA) usa a URL original.
- **Cadastro de produto (admin.html)**: formulário em passos numerados dentro de `details#card-form`. Obrigatórios: foto, nome,
  preço, "para quem é" e categoria (`faltasDoForm_()`); sem eles o envio não sai. Categoria = folha com busca (`#overlay-categorias`),
  nunca todas as chips na tela; categoria nova que já existe (sem acento/maiúscula) reaproveita a existente. Os IDs antigos dos campos
  foram mantidos (a IA e o envio dependem deles) — se mexer, preserve.
- **Lista de peças (admin)**: filtros Ativas/Esgotadas/Arquivadas/Todas; **busca ignora o filtro** (regra 3). "Selecionar todos" vale só
  para o que está na tela (`listaVisivel_()`).
- **Velocidade**: admin mostra a lista/categorias do cache do aparelho (`tenkiter_admin_prod_v1`, `tenkiter_admin_listas_v1`) e busca
  tudo em paralelo; treinamentos guarda só a lista de manuais (`tm_manuais_cache_v1`) — NUNCA guardar dados pessoais de funcionário/
  candidato em localStorage. Overlays/folhas usam `z-index:100` (a barra `nav.js` é 90; abaixo disso ela cobre os botões).

## v3.2 — acessibilidade, busca e testes (convenções novas)

- **`a11y.js`** (carregado em TODAS as páginas, logo depois de `nav.js`): liga `<label>` sem `for` ao campo seguinte, dá foco/Esc/Tab-preso
  a janelas (`#overlay`, `#overlay-sacola`, `#overlay-compartilhar`, `.overlay-sheet`, `#modal-conta`, `#login-overlay` — abrem com a classe
  `aberto`/`visivel`; uma janela nova precisa entrar na lista `JANELAS` do arquivo) e torna `.card[data-manual]`/`#brand-home`/`[data-tk-btn]`
  focáveis por Tab + Enter/Espaço. Área clicável nova que não é `<button>`/`<a>`: use `data-tk-btn` ou, melhor, um botão de verdade.
- **Cores de texto**: nunca `--laranja` (#E67E22) como cor de TEXTO sobre fundo claro (contraste 2,8:1) — use `--laranja-txt` (#A85200;
  em `treinamentos.html` é `--accent-txt`). Botão com FUNDO laranja leva letra **preta** (#0d0d0d), nunca branca (em `treinamentos.html`:
  `--on-accent`). Cinza de texto mínimo `#666` (nunca `#777/#888/#999` sobre branco).
- `treinamentos.html` agora tem DOCTYPE/`<html lang>`/`<main id="app">` (antes abria em "modo antigo" do navegador). `#app` usa
  `min-height: calc(100dvh - 76px)` por causa da barra inferior — se a altura da barra (`nav.js`) mudar, mude lá também.
- **Catálogo**: busca tolerante (sem acento, vários termos, nome+código+categoria+gênero+cor+descrição, 1 letra errada); se a busca com os
  filtros der zero, mostra a loja toda com aviso (busca nunca some por filtro escondido). No celular os filtros começam recolhidos (botão
  Filtros). Endereço da peça aberta é `?c=<código>` (igual ao link compartilhado).
- **Testes**: `tests/` (Playwright + Apps Script SIMULADO — não toca em planilha/WhatsApp). `python3 tests/rodar_tudo.py` roda lojista, cliente,
  funcionária, teclado, busca e axe (acessibilidade) em ~2 min; `TK_BASE=https://tenkiter-catalogo.onrender.com/` testa o site publicado.
  Rode antes de todo deploy que mexa em tela. Setup uma vez: `pip install playwright pillow`, `playwright install chromium` e baixar o
  `axe.min.js` (comando no cabeçalho de `tests/rodar_tudo.py`).

## v3.3 — pedidos, app instalável, medição e Story em vídeo (convenções novas)

- **WhatsApp é SEMPRE o fixo da loja** (`WHATSAPP_NUMERO` / `linkWhatsApp`). Não existe número de atendente nem roteamento por atendente — foi
  pedido e **recusado** pelo Pablo; não reintroduzir. Também recusados: tamanho/cor/quantidade escolhidos no modal e na sacola, CNPJ na
  privacidade/rodapé, horário de funcionamento inventado e "3x sem juros" (só vale o que a loja realmente oferece: 10% à vista).
  Endereço da loja (para textos/privacidade/JSON-LD): Rua Dr. Moreira da Rocha 759, Crateús-CE.
- **Fluxo do pedido** (`pedido.js` + backend 3.1): sacola → formulário (nome, WhatsApp, entrega/retirada, observação) → `criarPedido` (aberto; o
  servidor RECALCULA preços pela planilha e ignora peça arquivada/esgotada) → código `PED-0001` + mensagem de WhatsApp com links completos.
  Cliente acompanha com código + 4 últimos números do WhatsApp (`consultarPedido`, freio de tentativas; nunca devolve telefone/endereço). Etapas:
  novo → em_atendimento → aguardando_pagamento → separacao → pronto → concluido / cancelado. Texto que vai ao WhatsApp é **texto puro** (nunca
  passa por `escaparHtml`: gerava `&amp;`). Dados do cliente só ficam no aparelho com "Lembrar meus dados" marcado.
- **Compatibilidade com backend antigo**: o front consulta `?action=versao` (`versaoServidor()`) e liga cada recurso pela bandeira
  (`pedidos, config, metricas, importacao, feed, integracoes, codigos, pushHistorico, loteCategoria`). Com o backend 3.0 o site funciona como
  antes (pedido segue só pelo WhatsApp, painel sem as telas novas). Sempre teste com `install(ctx, versao="3.0")` em `tests/mock.py`. Ao
  adicionar recurso novo no backend: nova bandeira em `versao` + front que só liga se ela existir.
- **Pixel da Meta (`meta.js`)**: só liga com ID do Pixel (Gestão > Integrações; público, vem em `?action=config`) **e** consentimento do visitante
  (LGPD, `tenkiter_consent_meta_v1`). Sem ID não há pedido de rede nem aviso. O token da API de Conversões é digitado uma vez no painel e fica **só
  nas Propriedades do Script** (`META_CAPI_TOKEN`; nunca volta ao navegador nem vai ao GitHub). Navegador e servidor usam o MESMO `eventId`
  (`novoEventId_`) para a Meta não contar duas vezes; `registrarEvento(..., semCapi=true)` só conta na planilha (usado no pedido com várias peças, que o Pixel conta uma vez só).
  Integração com a sacola/loja do Instagram: só preparada (feed CSV/XML + Pixel); depende da Meta aprovar o comércio. Postagem automática
  continua proibida (seção "Instagram").
- **Service worker ÚNICO**: `OneSignalSDKWorker.js` faz OneSignal **e** cache offline (só pode haver um worker por escopo); `pwa.js` o registra.
  `importScripts` do OneSignal vai dentro de `try/catch` (bloqueador de anúncios não pode derrubar o cache). Estratégia: rede primeiro para o
  site, cache primeiro para fotos; **admin, treinamentos e currículos nunca entram no cache** (dados de gente). Para forçar renovação em todos os
  aparelhos, troque `VERSAO` (hoje `tk-3.3.0`). Se mexer em arquivo do site que precise abrir offline, acrescente-o em `BASICO` no worker (e em `FORA_DO_CACHE` se for área interna).
- **Peça de imagem por JS**: no modal da peça o `src` da foto é atribuído por JavaScript depois do `innerHTML` (com CSP por `<meta>` + service
  worker, o Chrome chegou a pedir o texto literal `${...}` do template como URL — bug real). Não volte a montar `<img src="${...}">` em template
  para essa foto. A CSP de `index.html` (`<meta http-equiv=Content-Security-Policy>`) precisa listar todo domínio novo em `connect-src`/`img-src`
  (já inclui o Worker `tenkiter-og`).
- **Lista rápida (opcional)**: `buscarListaPublica()` (common.js) usa `LISTA_RAPIDA_URL` (vazia = desligada) e cai no Apps Script se o Worker falhar
  ou passar de 3,5 s. Todo `fetch(API_URL+'?action=list')` do catálogo passa por ela.
- **Story em vídeo (admin, janela da arte)**: grava ~7 s no navegador (canvas + `MediaRecorder`). O resultado depende do navegador: MP4/H.264 serve
  ao Instagram; WebM ou VP9 pode ser recusado — o painel analisa os bytes reais do arquivo e dá o parecer (verde/atenção), nunca promete. Se o
  celular do Pablo só gerar WebM/VP9, o próximo investimento é converter para MP4 H.264 (ex.: Cloudinary) — **ainda não implementado**. O Story em
  JPG segue idêntico (`gerarEBaixarImagemStories`).
- **Toque**: alvo mínimo 24 px; links de nome da peça são `<button class="abrir-peca">` com `padding` (ver CSS do `index.html`).
- **Testes novos** (todos em `python3 tests/rodar_tudo.py`, ~6 min; precisa de `ffmpeg` para o Story em vídeo e `node` para os dois últimos):
  `jornada_pedido.py`, `admin_gestao.py`, `novas_telas.py` (axe/teclado das telas novas), `lista_rapida.py`, `story_video.py`, `service_worker.py`
  (offline de verdade: perfil persistente + servidor desligado), `backend_gs.js` (roda o `.gs.txt` em memória) e `worker_og.js` (Worker v2). Fatos
  do Playwright que custaram caro: bloqueie service workers nos testes comuns; `set_offline`/`route` NÃO afetam o que o service worker busca;
  `route.fulfill` já injeta CORS (para simular bloqueio, devolva um `Access-Control-Allow-Origin` diferente).
- **Nunca rodar `pkill -f` com texto que apareça no próprio comando** (mata o shell). Para encerrar servidores de teste use o PID.
