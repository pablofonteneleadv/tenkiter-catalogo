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
  integrações, avisos no painel), `privacidade.html`, `404.html`, `site.webmanifest`, `robots.txt` (o `sitemap.xml` e os feeds vêm do Worker — não recriar `sitemap.xml` no repositório: arquivo estático ganha da regra Rewrite do Render).
- **Backend**: dois Apps Script Web Apps separados, versionados por nome de arquivo
  (`<nome>-<versão>.gs.txt`):
  - `catalogo-codigo-4.3.gs.txt` — catálogo + autenticação central + pedidos/métricas/importação/feed/integrações (v3.1) + apagar/renomear categoria só para Admin total (v3.2) + avisos push completos (v3.3) + Conexões Render/Cloudflare (v3.4) + OneSignal nas Conexões e Números reais com filtros/aparelhos (v3.5) + Cofre das Conexões com dupla verificação (v3.6) + X de arquivar no catálogo, mídia arquivada reversível e juntar produtos (v3.7).
  - `funcionario-codigo-3.3.gs.txt` — RH/treinamento/contratação (v3.1: Admin total não consegue rebaixar/desativar a PRÓPRIA conta; a trava "sobrar 1 Admin" já existia).
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

- Link público da peça: **sempre** `linkProduto(p)` (common.js) = `SITE_URL + 'p/<código>'` (com a foto/vídeo escolhido: `linkProduto(p, n)` = `.../p/<código>?f=n`, ver seção "Foto escolhida" no fim). Nunca montar a partir de
  `API_URL` — o `?action=share` do Apps Script devolve HTML dentro de um iframe do Google, o WhatsApp não lê as meta
  tags `og:*` dali e a mensagem mostrava o endereço do script sem miniatura (bug real, não repetir).
- Miniatura **por produto**: Cloudflare Worker `tenkiter-og` (código em `og-worker/worker.js`, endereço
  `https://tenkiter-og.distkrpconfeccoes.workers.dev`) devolve HTML com `og:*` em `/p/<código>` e redireciona a pessoa para
  `?c=<código>`. No Render existe a regra Rewrite `/p/*` -> `<worker>/p/*` (confirmado: faz proxy, não redireciona). Se mudar
  o código do Worker, publicar de novo na Cloudflare (painel ou API). `og-service/` (Node) é alternativa antiga, não usada. O Worker é **v2 e está PUBLICADO desde 10/10/2026** (publicado pela API da Cloudflare, `og-worker/publicar.py`; JSON-LD, `/sitemap.xml`, `/feed.csv|xml`, `/lista.json`) — guia de publicação em `og-worker/LEIA-ME.md`. **Regras Rewrite no Render (criadas em 10/10/2026 pela API do Render):** `/p/*`, `/feed.csv`, `/feed.xml`, `/sitemap.xml` → mesmo caminho no Worker (rotas e cabeçalhos do Render só se mexem por API REST — `https://api.render.com/v1/services/<id>/routes` — ou pelo painel; o MCP do Render não tem isso).
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
- **Nunca escreva `<img src="${...}">` em modelo de texto dentro de página HTML** (bug real, só aparecia no site publicado): o Chrome lê a página
  aos pedaços — principalmente quando ela passa pelo service worker — e às vezes "enxerga" esse `<img>` dentro do `<script>`, pedindo uma foto
  chamada literalmente `${escaparHtml(...)}` (404 no log). Use `<img ${atribSrc(url)} alt="">` (common.js; o texto deixa de parecer um `src`).
  Em `index.html` e `admin.html` isso já vale e `tests/service_worker.py` falha se a forma antiga voltar. `curriculo.html`, `curriculos.html` e
  `treinamentos.html` ainda têm `<img src="' + ... + '">`, mas não passam pelo service worker (e nunca deram o problema); se um dia passarem, troque
  também. Para reproduzir: servidor local que entrega o `.html` em pedaços de 8–20 KB e service worker ligado. A foto principal do modal da peça
  continua recebendo o `src` por JavaScript depois do `innerHTML`. A CSP de `index.html` (`<meta http-equiv=Content-Security-Policy>`) precisa
  listar todo domínio novo em `connect-src`/`img-src` (já inclui o Worker `tenkiter-og`).
- **Lista rápida (opcional, DESLIGADA de propósito)**: o Worker `/lista.json` mediu ~1,1 s (igual ao Apps Script) — falta cache de borda (KV) para valer a pena; não ligue antes disso. `buscarListaPublica()` (common.js) usa `LISTA_RAPIDA_URL` (vazia = desligada) e cai no Apps Script se o Worker falhar
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

## v3.4 — foto escolhida no compartilhar e categorias do painel (backend 3.2)

- **A foto/vídeo que a pessoa está vendo é a que vai** (pedido do Pablo: "se está selecionada a preta, o WhatsApp tem que mandar a preta, não a capa").
  Identidade da mídia = número do slide `f` (1 = capa, depois a galeria, vídeo por último). `linkProduto(p, f)` → `SITE_URL/p/<código>?f=n` (só com
  n ≥ 2; capa = link limpo de sempre). O Worker (`og-worker/worker.js`, `?f=n`) usa aquela foto em `og:image` (vídeo do Cloudinary: quadro `so_30p` em
  JPG; `so_0` sai preto), mantém o canonical sem `?f` e redireciona para `?c=<código>&f=n`; o catálogo abre naquele slide e mantém o endereço em
  sincronia (`history.replaceState`). `compartilharComFoto` (index.html) manda o ARQUIVO da mídia escolhida pelo Web Share (orçamento de 3,5 s por causa
  da ativação do toque; vídeo do Drive vai só como texto+link); cancelar = silêncio; sem compartilhamento nativo ou falha = `wa.me/?text=`. "Pedir no
  WhatsApp" e "Na sacola" usam o mesmo slide; a sacola guarda a escolha no aparelho (`tenkiter_sacola_foto_v1`, podada em `salvarSacola`) e a mensagem
  do pedido leva o link com `?f=`. **Publicar o Worker de novo sempre que `og-worker/worker.js` mudar** (`og-worker/publicar.py`, token em variável de
  ambiente, nunca no repositório). Teste: `tests/compartilhar_foto.py` + seção "Foto escolhida" de `tests/worker_og.js`.
- **Categorias (backend 3.2 + admin.html)**: nome sempre limpo (`nomeDeLista_` no servidor e `limparNomeCategoria_` no painel: vírgula vira espaço, espaços
  repetidos viram um, máx. 60) — vírgula quebrava a peça em duas categorias, porque a coluna `Categoria` é separada por vírgula. Duplicada (sem acento/maiúscula)
  reaproveita a existente (`jaExistia`). `excluirCategoria` / `renomearCategoria` são **só Admin total** (`gerir_acessos`) e **só com login**
  (`ACOES_SO_COM_LOGIN_`: o PIN antigo é recusado com `exigeLogin`); apagar categoria EM USO devolve `emUso:n` e só apaga com `confirmar:true`
  (as peças perdem só essa categoria); renomear para nome que já existe JUNTA (`juntou:true`); ambas gravam em `Acoes_Audit`. O painel só mostra ✎/× se
  `versao.categoriasGestao` **e** login **e** `gerir_acessos` (`podeGerirCategorias_`). Ao criar: campo largo (o `button{width:100%}` global espremia o
  campo — todo botão novo ao lado de campo precisa de `width:auto`), prévia "Vai ser criada como: …", sugestões já cadastradas (tocar copia o nome para
  mudar só o final; ✎ Corrigir ao lado para Admin total). O "Nome da peça" também sugere peças parecidas (copiar / Editar) e avisa nome repetido sem
  impedir. Credencial de toda chamada nova do painel: `chamarAdmin_` (pin+sessao+whatsapp), nunca só `pin: adminPin`.
- **Teste**: `tests/admin_categorias.py`; no simulador de backend (`tests/backend_gs.js`) a aba de pessoas precisa do cabeçalho `Nome/WhatsApp/Senha` e o
  `Utilities` simulado precisa de `computeHmacSha256Signature` para criar contas de verdade; `tests/mock.py` tem categorias com estado
  (`install(..., versao="3.2")`; `"3.1"` = sem a bandeira, `"3.0"` = backend antigo).

## v3.4 (parte 2) — avisos push completos, instalar o app, seleção por link (backend 3.3)

- **Pedido do Pablo**: o app instalado mostrava "Notificações: Sem permissão" e ele quer (1) instalar no Android e no iPhone pelo FIM da página, (2) push
  completo: segmentar por cliente, usuário, acesso, aluno, "do jeito que a gente quiser", que a notificação APAREÇA, copiando algo 100% funcional.
  Decisão: **OneSignal continua sendo o motor** (já é o serviço pronto e testado do mundo todo); o que é nosso é a ligação conta↔aparelho, o convite no
  momento certo, a Central de avisos e os testes. Causa do "Sem permissão": o app OneSignal `535f6b0d-…` **não tem a plataforma Web configurada**
  (o endpoint `https://api.onesignal.com/sync/<appId>/web?callback=x` responde `"success":false`) e o Android nunca concede permissão sozinho. Sem a
  configuração do OneSignal (Pablo, `LEIA-ME-AVISOS.md` passo 1) nada chega a ninguém — o site mostra `em-breve` e esconde o sininho em vez de prometer.
- **`push.js`** (carregado em index/admin/treinamentos logo depois de `a11y.js`; precisa de `common.js` antes): `window.TKPush`. O SDK v16 só é baixado depois
  de `sync` dizer que o app está configurado e só onde pode funcionar (`suporte()`: `ok | embutido | ios-antigo | ios-instalar | nao-suportado | sem-app`).
  `resumo()`: `em-breve | <suporte> | bloqueado | negado | ativo | ativando | pausado | pendente`. **`Notification.requestPermission` só dentro de um toque**
  (`ativar()` é chamado direto do `onclick`; nunca de timer/`load`) — o convite automático só ABRE uma janela nossa, quem pede é o botão. Convite: no app
  instalado, equipe/aluno no navegador, logo após `appinstalled` (`TKPush.aposInstalar()`); máx. 3, ≥ 3 dias entre eles, "Não quero receber" = `nunca`.
  iPhone: só com o app instalado (iOS ≥ 16.4); navegador embutido (Instagram/WhatsApp) não faz push nem instala. Ajuda por motivo (`abrirAjuda`),
  inclusive "Pausar atividade no app quando não usado" (o Android TIRA a permissão), bateria "Sem restrições" e Início automático da Xiaomi.
  Não existe `allowLocalhostAsSecureOrigin` neste SDK; não ligue `notifyButton` nem os prompts do painel do OneSignal (pedido duplicado).
- **Identidade**: o aparelho faz `OneSignal.login(pushId)`; `pushId = 'tk' + HMAC(push|whats)` calculado SÓ no servidor e entregue por `pushIdentidade`,
  ação aberta que aceita apenas token de sessão `tk1./tk2.` (nunca senha). Logout/troca de conta (`tk:sessao`, `storage`, poll 3 s) desliga o aparelho.
  Pedido de visitante sem conta: apelido `ped_<dígitos>` (ex. `ped_0001`) com valor `pk`+HMAC (`pushKey`, devolvido por `criarPedido`/`consultarPedido`),
  até 5 por aparelho. **Nada pessoal no aparelho**: só escolhas de aviso, chaves opacas e contadores do convite (`tk_push_*`).
- **Backend 3.3** (módulo "AVISOS (push) COMPLETOS"): `pushEnviar_` nunca lança; UM método de alvo por requisição (`include_aliases` | `filters` |
  `included_segments`). Públicos sensíveis (grupo/perfil/acesso/pessoas/pedido/pedidos) são resolvidos NO SERVIDOR pela planilha de pessoas e vão como
  `external_id`; marketing (todos/app/interesse) usa etiquetas (`av_novidades`, `origem`, `int_<slug>`, `tipo`) respeitando "novidades e promoções" desligado.
  `{nome}` = uma requisição por pessoa (`fetchAll`, máx. 300). Agendar ≤ 30 dias, `ttl`, só `https://` em link/imagem. Chave `os_v2_…` usa `Key`, a antiga
  `Basic` (fallback automático). Automáticos: pedido novo → equipe (`catalogo_cadastrar`), mudança de etapa → cliente; vão numa fila (`pushFila_`) liberada
  DEPOIS de soltar o lock do script (`pushDespacharFila_`). `salvarPushConfig` exige `gerir_acessos`; as demais ações de push, `catalogo_push`. Bandeira em
  `versao`: `pushCompleto`; público: `GET ?action=pushconfig` (interesses). Planilhas novas: `Push_Modelos` (6 modelos de série), `Push_Historico` ganhou
  NotifId/Audiencia/Agendado/Imagem.
- **`admin-push.js`** (Central de avisos; só liga com `pushCompleto`, senão o painel simples antigo): abas Enviar / Histórico / Modelos / Preparar. Intercepta
  o clique de `#btn-abrir-push` em fase de captura. Preparar recarrega `pushStatus` sempre (a pessoa configura o OneSignal e volta para conferir).
  Erros viram frase, nunca JSON. Botão de aviso com fundo laranja = letra preta.
- **Instalar o app** (`pwa.js` + seção `#instalar-app` DENTRO do rodapé, depois dos links = "abaixo de tudo"): Android/Chrome usa `beforeinstallprompt` (guardado;
  `prompt()` só dentro do toque); sem o evento mostra o passo a passo, nunca um botão que não faz nada; iPhone não tem API de instalar → botão chama
  `navigator.share()` + passos sempre à vista; navegador embutido → "Copiar o endereço". **Todo botão do rodapé com `display` próprio precisa de regra
  `[hidden]{display:none}`** (o `.rodape li button{display:inline-flex}` anulava o `hidden` e o botão de instalar aparecia sempre — bug real, achado pelo teste).
  Service worker único `OneSignalSDKWorker.js` agora `VERSAO='tk-3.4.0'` e `/push.js` em `BASICO`.
- **Seleção por link** (`?sel=TK-0010,TK-0011,…`): "Compartilhar seleção" com favoritos (ou com uma seleção recebida) gera `SITE_URL?sel=<códigos>` e a mensagem do WhatsApp
  lista cada peça com preço e termina com o link completo; antes mandava só `SITE_URL` e o atendente não via quais peças eram (bug real). Filtro comum
  (busca/categoria/preço) continua mandando os filtros, com a caixinha "Enviar só estas N peças (lista fixa)". `index.html`: `selecaoFixa`, `naSelecaoFixa_`
  (casa por código sem diferenciar maiúscula ou, sem código, pelo ID), faixa `#aviso-selecao` ("Peças separadas para você: N" + avisa as que saíram da
  loja + "Ver todas as peças"); "Limpar filtros" também sai da seleção; busca sem resultado dentro da seleção mostra a loja toda (regra 3). Máx. 60 peças.
  A miniatura no WhatsApp do link `?sel=` é a genérica da loja (o Worker só gera miniatura por peça; um `/s/` no Worker seria o próximo passo).
- **Testes novos** (em `rodar_tudo.py`): `selecao_link.py`, `central_avisos.py`, `push_cliente.py` (OneSignal FALSO com `navigator.userActivation` para provar que a
  permissão sai de um toque; UAs de Android/iPhone/iOS antigo/Instagram/computador; `beforeinstallprompt`/`appinstalled` simulados), `instalabilidade.py`
  (`Page.getInstallabilityErrors` do Chrome com o service worker de verdade), e a seção 8c de `backend_gs.js` (302 checagens com um OneSignal falso).
  `tests/mock.py`: `install(ctx, versao="3.3")` liga `pushCompleto` e as ações novas (`pushStatus/pushPrevia/pushPessoas/pushNumeros/pushCancelar/pushModelos/…`).
  **Entrega real no Android/iPhone NÃO é testável no sandbox**: roteiro no aparelho em `LEIA-ME-AVISOS.md`.

## v3.4 (parte 3) — Conexões: chaves do Render/Cloudflare no servidor (backend 3.4)

- **Pedido do Pablo**: ter o painel "pré-configurado" para não depender de colar chave em toda conversa. Decisão: aba **🔗 Conexões** no admin (`admin-conexoes.js`),
  **só Admin total (`gerir_acessos`) e só com login** (as 6 ações novas estão em `ACOES_SO_COM_LOGIN_`: `statusConexoes`, `salvarConexao`, `testarConexoes`,
  `renderCriarRegras`, `renderDeploy`, `renderStatusDeploy`; o PIN antigo recebe `exigeLogin`). Bandeira em `versao`: `conexoes`.
- **A chave NUNCA volta para o navegador, nunca vai ao GitHub, não entra em log, em `Acoes_Audit` nem em cache.** Fica nas Propriedades do Script
  (`RENDER_API_KEY`, `CLOUDFLARE_API_TOKEN`, mais `<nome>_EM` com a data); a tela só vê "guardada ✓" + 4 últimos caracteres. `salvarConexao` TESTA a chave na API antes
  de guardar (chave inválida/de outra conta não é guardada). A chave do Render dá poder sobre a conta INTEIRA (o Render não limita escopo) — por isso o aviso na tela.
- **Claude NÃO consegue ler essas chaves em sessões futuras** (não há ação que as devolva, de propósito; o Claude também não tem o login do Admin). Quem usa a chave é o
  painel. Para o Claude, em cada conversa: variáveis de ambiente `RENDER_API_KEY` / `CLOUDFLARE_API_TOKEN` na sessão, ou o Pablo cola de novo — sempre só como variável de
  ambiente do comando (`RENDER_API_KEY=… python3 …`), nunca em arquivo; ao fim pedir para revogar. Ver o skill `tenkiter-apis-e-acessos`.
- **Render**: o MCP do Render não mexe em rotas/cabeçalhos; pela API REST: `GET/POST https://api.render.com/v1/services/srv-dasa63fpn0mc73fh8fgg/routes`
  (`{"type":"rewrite","source":"/feed.csv","destination":"https://tenkiter-og.distkrpconfeccoes.workers.dev/feed.csv"}`), `POST .../deploys`. Regras que existem
  (10/10/2026): `/p/*`, `/feed.csv`, `/feed.xml`, `/sitemap.xml`. `renderCriarRegras` só ACRESCENTA (nunca apaga nem troca regra que aponta para outro lugar).
  **Arquivo estático ganha da regra Rewrite**: nunca recriar `sitemap.xml` no repositório.
- **Cloudflare**: Worker `tenkiter-og` publicado por `CLOUDFLARE_API_TOKEN=… python3 og-worker/publicar.py` (v2.1 publicada em 10/10/2026: `?f=N` por foto + currículo no sitemap).
  Há também um Worker `tenkite-og2` antigo na conta (não usado).
- **Testes**: seção 8d de `tests/backend_gs.js` (Render e Cloudflare FALSOS; confere permissões, chave testada antes de guardar, regras só acrescentadas, ID de deploy
  com `../` recusado, a chave em NENHUMA resposta/planilha/cache/arquivo) e `tests/conexoes_admin.py` (tela: chave limpa do campo e fora do HTML/localStorage, situação, criar
  regras, publicar e acompanhar, copiar endereços, teclado, axe). `tests/mock.py`: `install(..., versao="3.4")`. O intervalo de acompanhamento do deploy é
  `window.TK_CONEXOES_POLL_MS` (padrão 5000 ms; os testes usam 250).

## v3.5 — OneSignal nas Conexões: liga os avisos pelo painel (backend 3.5)

- **Pedido do Pablo**: "quero que estas API vão pra configuração do site" (Organization ID + Organization API Key do OneSignal). A Web do app foi ligada em
  10/10/2026 com `PUT https://api.onesignal.com/apps/<app_id>` (`Authorization: Key <Organization API Key>`; campos `organization_id`, `site_name`,
  `chrome_web_origin`, `safari_site_origin`, `safari_apns_p12:""`, `safari_apns_p12_password:""`, `chrome_web_default_notification_icon` = `icon-256.png`).
  Organization ID e App ID são públicos; **a Organization API Key (`os_v2_org_…`) manda em TODOS os apps da organização** — só no servidor, nunca em arquivo,
  teste, commit ou conversa. O bloqueio automático já barrou uma tentativa de pôr a chave real num teste: **testes usam chaves INVENTADAS** (ver 8e de
  `tests/backend_gs.js` e `CHAVE_O` de `tests/conexoes_admin.py`).
- **Backend 3.5** (bandeira `conexoesOnesignal`; o front só mostra o bloco com ela): `CONEXOES_.onesignal` (`ONESIGNAL_ORG_API_KEY`, mais `ONESIGNAL_ORG_ID` público),
  `salvarConexao` com `orgId` (testa `GET /apps/<id>` e confere `organization_id`), `onesignalConfigurar` (Admin total, só com login): lê o app → liga a plataforma Web se
  faltar → grava `ONESIGNAL_APP_ID` se faltar → **cria a chave de envio do app** (`POST /apps/<id>/auth/tokens`, devolve `formatted_token` UMA vez) se
  `ONESIGNAL_REST_API_KEY` não existe ou foi recusada → confere o `sync`. Idempotente; nenhuma chave volta ao navegador (a resposta de `GET /apps/<id>` traz `basic_auth_key`:
  nunca repassar). Apagar a conexão remove a chave da organização e o código, **não** a chave de envio.
- **Cache do `sync` do OneSignal**: `https://api.onesignal.com/sync/<appId>/web?callback=x` tem `s-maxage=3600` na borda — um "not configured for web push" ficava preso por até
  1 hora depois de ligar (e o backend/`push.js` liam `callback=x` fixo). Agora backend e `push.js` mandam um parâmetro `_` novo (backend: a cada consulta; `push.js`: a cada 10 min).
  Para conferir à mão use `?callback=zz$RANDOM`.
- **Claude continua sem ler essas chaves** em sessões futuras (mesma regra das outras). Para mexer no OneSignal por conta própria: variável de ambiente `ONESIGNAL_ORG_API_KEY`
  + `ONESIGNAL_ORG_ID` no comando, ou o Pablo cola de novo. O mais simples é ele tocar em **📣 Ligar os avisos agora** no painel.

## v3.5 (parte 2) — Números reais com filtros, aparelhos anônimos e contagem por público (backend 3.5)

- **Pedido do Pablo**: "nos dados reais mais informações e maiores opções de afunilamento, seleção até por horário (se ativo); quantas pessoas instalaram, quantas têm o push
  ativo; nas configurações dos push, ao selecionar os alvos, quero ver do lado quantos tem em cada um (igual à seleção de categoria do currículo)". "Se ativo" foi lido como
  **horário OPCIONAL (desligado por padrão)**.
- **Aparelho ANÔNIMO** (`TKDisp` em `common.js`, exposto como `window.TKDisp` — `const` no topo do arquivo NÃO vira propriedade de `window`): código aleatório `tk_vid_v1` (24 hex)
  + `tk_disp_estado_v1` (só `instalou/pushAtivo/novidades/interesses`) + `tk_disp_env_v1` (assinatura do último envio). **Nunca** nome, telefone, endereço ou senha. Quem tem sessão
  manda só o TOKEN (`tk1./tk2.`); o servidor calcula o `pushId` (HMAC) e liga o aparelho à conta; sair da conta manda `logout`. Os envios são **juntados** (espera 1,5 s) e
  espaçados ≥ 17 s (o servidor ignora o mesmo aparelho em < 15 s); sem mudança, no máximo 1 aviso de "existo" a cada 6 h; "nunca teve aviso" = "não disse" (não gasta envio só
  para dizer "não"). Ganchos de teste: `window.TK_DISP_ATRASO_MS` / `TK_DISP_ESPERA_MS`. Quem chama: `pwa.js` (ping por visita + `appinstalled` + app aberto como app), `push.js`
  (`informarPainel()` dentro de `mudou()`, `definirInteresse`, `definirNovidades`, `salvarPrefs`; só depois do SDK ficar `pronto`), `index.html` (`registrarEvento` leva
  `TKDisp.perfil()` = `visitante/origem/dispositivo/fonte`; 1 evento `visita` por sessão).
- **Fonte da visita** (`detectarFonte`, 1× por sessão em `sessionStorage`): `?utm_source=`/`?fonte=`/`igshid`/`fbclid`/`gclid`, depois o `document.referrer`, depois o navegador embutido
  (Instagram/Facebook/TikTok). Link compartilhado no WhatsApp chega **sem referrer** → cai em "Direto (link sem origem, digitado ou app)"; não dá para separar.
- **Backend 3.5 (parte 2)**: aba `Dispositivos` (14 colunas, uma linha por aparelho; teto 30 000 linhas e 400 aparelhos novos/hora — os dois só barram aparelho NOVO), ação aberta
  `dispositivo`; `Eventos` ganhou `Origem/Dispositivo/Fonte/Visitante` (cabeçalho completado sozinho em planilha antiga; a trava anti-repetição agora é por aparelho);
  `metricas` com filtros (`dias` ou `de/ate`, `horaDe/horaAte` com virada de meia-noite, `diasSemana`, `origem/dispositivo/fonte/categoria/genero`, `nao_informado` aceito) e
  devolve `totais.visitantes`, `funil`, `porHora`, `porDiaSemana`, `porOrigem/porDispositivo/porFonte/porGenero`, `opcoes`, `cobertura` e `aparelhos` (**sem** `pushIds`/`interesses`
  internos — teste confere). `pushStatus` ganhou `contasAtivas`, `ativos` em perfis/acessos, `total` em interesses, `etapas`, `aparelhos`; `pushPrevia` ganhou `comAviso` e `aparelhos`.
  Bandeiras em `versao`: `metricasAvancadas`, `dispositivos`. `dispositivosResumo_(ini, fim, comOneSignal)` só consulta o OneSignal (cache 5 min) onde precisa.
- **Honestidade dos números**: aparelho/origem/fonte só existem para eventos **depois** do deploy (`cobertura.desde`; antes = "Não informado"); "instalaram" e "aviso ativo" contam só
  quem voltou ao site depois disso — o total real de quem recebe aviso é o do OneSignal (`messageable_players`, aparece quando a chave da organização está em Conexões). Pedidos
  respeitam período/horário/dia da semana, **não** origem/aparelho/categoria (o pedido não tem esses dados).
- **Front**: `admin-gestao.js` (Números reais: filtros em `<details>`, cada mudança busca de novo; `mtDefinir_`; resposta velha é descartada por `mtSeq`; linha de tabela vira filtro;
  sem `metricasAvancadas` cai na tela simples antiga `abrirMetricasSimples_`), `admin-push.js` (`contagemPublico`, `cont()`: "(5 · 2 com aviso)"; só "(5)" com backend sem a contagem —
  nunca "undefined"), `privacidade.html` ganhou a linha do código anônimo.
- **Testes**: seção 8f de `tests/backend_gs.js` (filtros, virada de meia-noite, dia da semana, cache por combinação, 30 000/400, sem telefone/token/chave), `tests/numeros_reais.py`,
  `tests/aparelho_anonimo.py`, `tests/central_contagens.py`; `tests/mock.py` com `versao="3.5"` liga `metricasAvancadas`/`dispositivos` (`3.4` = tela antiga). O `id` de modelo de
  aviso agora tem sufixo aleatório (dois cliques no mesmo milissegundo repetiam o código e quebravam um teste de vez em quando).

## v3.6 — saindo do Apps Script/Cloudinary: mídia no R2 da Cloudflare (decisão do Pablo: "Opção 1, o mais barato possível, sem risco de custo absurdo nas imagens")

- **Plano (escada)**: degrau 0 = tudo grátis (Workers free, KV, D1, R2 até 10 GB). Só sobe para Workers Paid (US$ 5) quando o painel da Cloudflare mostrar uso perto de 100 mil requisições/dia.
  **Não ligar** Images (redimensionar sob demanda) nem Stream: cobram por uso — só se o Pablo mandar. Banco/Supabase (degraus 3 e 4) só com pedido e confirmação dele.
- **Recursos já criados na conta Cloudflare (11/10/2026)**: bucket R2 `tenkiter-midia`, banco D1 `tenkiter-db` (VAZIO, ainda sem tabelas; migração da planilha para o D1 é a próxima etapa, com gravação dupla
  e conferência antes de trocar), KV `tenkiter-cache`. Worker **`tenkiter-midia`** (`midia-worker/worker.js`, publicado por `CLOUDFLARE_API_TOKEN=… python3 midia-worker/publicar.py`; bindings `MIDIA`=R2, `CACHE`=KV, `API_URL`)
  em `https://tenkiter-midia.distkrpconfeccoes.workers.dev` (o token não enxergou a zona `tenkitermodas.com.br`, então ficou sem domínio próprio; `midia.tenkitermodas.com.br` já é aceito pelo front/Worker se um dia ligar).
- **Travas contra custo (no Worker, não no navegador)**: foto ≤ 2,5 MB, vídeo ≤ 15 MB, tipo conferido pelos BYTES (JPG/PNG/WEBP/MP4/WEBM; HEIC recusado), ≤ 400 envios/dia, total guardado ≤ 9,5 GB (`LIMITE_BYTES`, abaixo dos 10 GB grátis; passou = 507).
  Servir arquivo (saída) no R2 é grátis. Quem envia: `POST /u` com `X-TK-Whats` + `X-TK-Sessao` (SÓ token `tk1./tk2.`, nunca senha); o Worker pergunta ao Apps Script (`sessao`) e exige `catalogo_cadastrar` (apagar: `catalogo_excluir`); resultado guardado 2 min no cache da borda.
  `GET /uso` mostra bytes/arquivos/limite. `GET /m/<AAAAMM>/<20 hex>.<ext>` é público, cache de 1 ano, com Range (vídeo).
- **Painel (`admin.html`)**: `subirMidia_` tenta o R2 primeiro (foto/vídeo dentro do limite e com login por token); PIN antigo, arquivo maior ou QUALQUER falha do R2 caem no Cloudinary como sempre foi — o envio nunca para.
  O que já está no Cloudinary/Drive continua igual. `ehVideoDireto()` (common.js) reconhece vídeo do Cloudinary OU do R2 (host travado: `tenkiter-midia.<conta>.workers.dev` / `midia.tenkitermodas.com.br`) — index, admin e `og-worker` usam.
  **Miniatura de vídeo do R2**: o painel tira um quadro aos 30% NO CELULAR (`quadroDoVideo_`, canvas, JPG ≤ 400 KB) e envia `POST /u?poster=<chave do vídeo>`; o Worker guarda com o MESMO nome do vídeo terminando em `.jpg`
  (sem coluna nova: `posterDoVideo(url)` em common.js, `imagemDaMidia` no og-worker). Falha ao tirar/enviar o quadro nunca derruba o envio; o og-worker faz HEAD na miniatura e, se não existir, usa a capa. Apagar o vídeo apaga a miniatura.
  Vídeo do Cloudinary continua gerando o quadro por transformação (`so_30p`). Fotos do R2 não têm `fotoMini` (a foto já sobe reduzida pelo painel). CSP do `index.html` e `HOSTS_FOTO` do service worker (`tk-3.5.0`) incluem o host.
- **Pendente (peça um passo por vez)**: apagar do R2 ao excluir peça (Worker já tem `DELETE`), migrar mídia antiga do Cloudinary, D1 + gravação dupla com a planilha, tirar o catálogo do Apps Script (lista pelo KV). O token `cfut_…` que o Pablo colou no chat vale até 01/12/2026: **pedir para revogar**.
- **Testes**: `tests/worker_midia.js` (R2/KV/Apps Script falsos) e `tests/midia_r2.py` (painel → R2, vídeo grande → Cloudinary, R2 recusa → Cloudinary); `tests/mock.py` ganhou `st["midia"]["modo"]` (`recusa` padrão | `ok` | `cheio`).

## v3.6 — Importador do Instagram ("Produtos para aceitar")

- **Pedido do Pablo**: `claude/instrucoes-importador-instagram.md` (projeto). Tudo que a loja posta (feed, carrossel, Reel, Story) vira RASCUNHO; só vira peça quando ele aceita. **Só LÊ o Instagram — a decisão "sem postagem automática" continua valendo.**
- **Worker `tenkiter-ig`** (`instagram-worker/worker.js`, publicar com `instagram-worker/publicar.py`): cron `*/30 * * * *`, D1 próprio `tenkiter-ig` (separado do `tenkiter-db`), copia as mídias para o R2 (`tenkiter-midia`, mesmo contador de custo), token do Instagram no D1 (nunca volta à tela). Rotas (todas exigem sessão `tk1./tk2.` e `gerir_acessos`): `GET /status`, `GET /rascunhos?grupo=&limite=&antes=`, `POST /acao`, `POST /buscar`, `POST|DELETE /token`. `INSTAGRAM_URL` em `common.js`.
- **Painel** (`admin-instagram.js`, faixa `#ig-faixa` acima do cadastro): abas Pendentes/Sem identificação/Prováveis duplicados/Não é produto/Descartados; editor de mídias (ordem, capa, tirar, separar, juntar); descartar tem "Desfazer". **Aceitar** chama `window.tkAceitarRascunho` (admin.html), que preenche o cadastro normal; ao salvar, o evento `tk:peca-salva` faz o painel avisar `acao:'aceitado'`. Preço/tamanhos vêm só de regex na legenda; duplicado só por código TK na legenda (IA da imagem NÃO está na fase 1).
- **PUBLICADO em 11/10/2026** em `https://tenkiter-ig.distkrpconfeccoes.workers.dev` (D1 `tenkiter-ig` id `15731893-d51a-4631-877f-6b7a6517bd54`, criado pelo MCP porque o token não tinha permissão de D1; `TK_D1_ID=<id> CLOUDFLARE_API_TOKEN=… python3 instagram-worker/publicar.py` reaproveita). Cron de 30 min ligado; `/status` sem login = 401, CORS ok. Falta conectar o Instagram (token da Meta) pelo painel.
- **Importar TODOS os posts** (pedido do Pablo, 11/10/2026): botão "📦 Importar TODOS os posts" na tela de conexão do painel (`importarTodos` em `admin-instagram.js`). `POST /buscar {todos:true}` no Worker lê o feed
  página por página (`MAX_PAGINAS`=8 por chamada, `MAX_POR_CICLO`=10 mídias), guarda o cursor em `cfg.ig_hist_depois` (e `ig_hist_fim` ao acabar) — fechar a tela/erro = continua de onde parou; `recomecar:true` relê do
  início (não duplica: `ig_midia` já tem o id). O painel chama em sequência até `fim:true`. Trava `ig_hist_trava` (KV, 60 s) impede duas importações juntas e o cron espera. Mídia quebrada é PULADA (`puladas`) e conta no
  aviso final; "armazenamento cheio" PARA tudo. Sem o Worker novo o painel detecta (`fim` não-booleano) e avisa. Status ganhou `historico:{completo,emAndamento}`. Testes: seção "Importar TODOS os posts" de `tests/worker_ig.js`
  e `tests/instagram_admin.py`. **Publicar o Worker `tenkiter-ig` de novo** quando mudar (`instagram-worker/publicar.py`).
- **Foto grande + IA com foto do R2** (pedido do Pablo, 11/10/2026): toque em QUALQUER miniatura (cadastro `#galeria-grid`, lista e editor de "Produtos para aceitar") abre `TKFotoGrande.abrir({itens, indice, capa, aoCapa})` (common.js; foto original, ‹ ›, toque amplia, "★ Usar como capa" onde faz sentido; o Esc é capturado para fechar SÓ a foto, senão o a11y.js fecha a janela de baixo). Antes, tocar na miniatura do cadastro trocava a capa sozinho.
  **"Preencher pela foto (IA)"**: o backend (`sugerirPorFotoComGemini_`) só baixa foto do Cloudinary ou recebe `b64`; foto do R2/Instagram era descartada ("Não consegui ler nenhuma das fotos"). Correção só no front (`urlParaB64Ia_` em admin.html): o navegador baixa, reduz (capa 1280 px para o texto escrito nela ficar legível, demais 768) e manda `b64`; o R2 já devolve CORS `*`. Teste: `tests/instagram_admin.py` (mock `sugerirPorFoto` guarda as fotos em `st["ia_chamadas"]`).
- **Juntar vários posts + IA lê as fotos na importação** (pedido do Pablo, 11/10/2026): (1) lista "Produtos para aceitar" ganhou caixinha "Marcar para juntar" em cada post e o botão **🔗 Juntar N posts em 1 produto** no topo (`juntarMarcados`: o 1º da lista é o destino, os demais entram nele um por vez pela ação `juntar` do Worker; os absorvidos ficam em Descartados).
  (2) **IA no Worker** (`analisarRascunho`/`analisarPendentes`, `POST /ia`, `POST|DELETE /ia-chave`): chave do Gemini guardada em `cfg.gemini_key` (D1; só Admin total cola em ⚙️ Instagram; nunca volta; a chave vai no cabeçalho `x-goog-api-key`, nunca na URL). O cron lê até 5 posts por ciclo e o painel
  lê de 2 em 2 enquanto a janela está aberta (`rodarIA`). Lê até 4 imagens do R2 (+ legenda) e devolve nome, preço ESCRITO na foto, gênero/categoria (só valores da loja — lista vem de `?action=categorias|generos`, cache 10 min), cores, tamanhos, descrição. Colunas novas em `rascunho`: `ia_status` (''|lendo|ok|erro), `ia_json`, `ia_tent` (máx. 2),
  `ia_em`, `preco_foto` (ALTER TABLE automático em `iniciar`). 429 = "espera" sem gastar tentativa. `juntar`/`separar` zeram `ia_status` (releitura). `tkAceitarRascunho` (admin.html) preenche nome/cores/descrição/categoria/gênero com `r.ia`.
  **Regra de preço (Pablo)**: o preço escrito nas fotos já é o À VISTA (10% off); ",99" no fim arredonda para cima (69,99 → 70,00); o catálogo guarda o CHEIO: `cheio = ceil(à vista ÷ 0,90)` em centavos (70,00 → **77,78**, e o site mostra 70,00 à vista; 77,77 mostraria 69,99). Função `precoDasFotos` (testada em `tests/worker_ig.js`). Sem preço na foto, vale o preço da legenda (regex) como antes.
  Backend Apps Script NÃO mudou (nada novo para colar). Testes: seção "IA lê as fotos do post" de `worker_ig.js` (Gemini FALSO) e as seções de Juntar/IA em `instagram_admin.py`.
- **Não provado**: Worker -> Apps Script `sessao` real a partir da Cloudflare, e o Instagram real (variante da API, tipo de token, Story). Testes usam Instagram FALSO (`tests/worker_ig.js`, `tests/instagram_admin.py`; `mock.py` tem `st["ig"]`). Guia do token: `LEIA-ME-INSTAGRAM.md`.

## v3.6 (parte 2) — Cofre das Conexões (backend 3.6) — EXCEÇÃO à regra "a chave nunca volta ao navegador"

- **Pedido do Pablo (decisão dele, explícita)**: "quero as chaves e tokens salvos e fáceis de copiar, tudo centralizado… faça o cofre, com dupla verificação de segurança". Por isso, SÓ no cofre, a chave guardada nas Propriedades do Script pode voltar ao navegador do Admin total. Todo o resto (statusConexoes etc.) segue mostrando só "guardada ✓" + 4 últimos caracteres.
- **Dupla verificação**: (1) sessão de login (`tk1./tk2.`, PIN antigo = `exigeLogin`) com `gerir_acessos`; (2) `abrirCofre {senha}` = senha da PRÓPRIA conta digitada de novo (token de sessão não vale como senha; 5 erros = 15 min bloqueado, nem a certa abre; erro vai para `Acoes_Audit` como `cofreSenhaErrada`). Acertou → código aleatório (cache, 5 min, preso ao WhatsApp) só na memória da tela. `revelarConexao {nome, cofre}` (`render|cloudflare|onesignal|onesignalEnvio`; lista fixa `COFRE_`, nada de outras propriedades) devolve o valor; audita só o NOME; 30 cópias/10 min. `fecharCofre` tranca (também ao fechar a janela e aos 5 min). Bandeira `conexoesCopiar`.
- **Front** (`admin-conexoes.js`, bloco `#cx-cofre`): a chave vai direto para a área de transferência, nunca para o DOM/localStorage; sem permissão de clipboard cai em `window.prompt`. Bloco "Dados para copiar" ao lado: só IDs/endereços públicos.
- **Testes**: seção 8g de `tests/backend_gs.js` (chaves INVENTADAS) e `tests/cofre_admin.py`; `mock.py` com `versao="3.6"`.
- **Claude continua sem ler o cofre sozinho**: o Pablo copia e cola na conversa; usar só como variável de ambiente do comando e pedir para revogar no fim.

- **Ordem da lista "Produtos para aceitar"** (pedido do Pablo, 11/10/2026): mais recente primeiro pela data/hora do POST no Instagram (`publicado_em`, 19 primeiros caracteres), desempate por `id`; antes era `id DESC` (ordem de importação, que na importação total ficava embaralhada). O cursor `antes` continua sendo o id do último item (o servidor busca a data dele). Teste em `tests/worker_ig.js`. Worker republicado.
- **Stories** (11/10/2026, Pablo: "hoje foram postados vários e nenhum foi importado"): havia 0 Stories no banco desde sempre porque o erro de `/me/stories` era engolido em silêncio. Agora `buscarStories()` guarda `cfg.ig_story_info` ({em, no_ar, erro}); `status.stories` e um alerta "Não consegui ler os Stories…" aparecem no painel. Story IGNORA `ig_desde` (vale 24 h: importa todos os que estão no ar) e a importação total também os busca (o histórico do feed não traz Story). Testes: seção "Stories" de `tests/worker_ig.js`.

## v3.7/3.8 — X de arquivar no catálogo, juntar produtos e vários perfis por pessoa (backend catálogo 3.8 + funcionários 3.2)

- **Pedido do Pablo (11/10/2026)**: (1) quem é "Funcionário do site" ou maior arquiva, **pelo próprio catálogo**, a peça inteira ou uma foto/vídeo, com um ✕ diferenciado (vermelho, borda tracejada) no canto esquerdo de cima da foto na grade e em cada foto/vídeo dentro da peça; (2) "Juntar" produtos repetidos na lista do admin; (3) mais de um perfil por pessoa.
- **Permissão escolhida: `catalogo_cadastrar`** (perfil "Equipe do site" já a tem; ninguém precisa de `catalogo_excluir`). Ações novas no backend, todas com sessão `tk1./tk2.` e `catalogo_cadastrar`: `arquivarRapido`, `arquivarMidia`, `restaurarMidia`, `midiasArquivadas`, `juntarProdutos`. **Nada é apagado**: a foto/vídeo tirado vai para a aba `Midia_Arquivada` (com posição para voltar no mesmo lugar) e `Acoes_Audit` guarda o antes/depois (juntar leva as fotos para o destino e ARQUIVA os outros, colunas deles intactas = reversível).
- **Front** (`index.html`): o X só existe se `versaoServidor().midiaRapida` **e** a sessão tem `catalogo_cadastrar` (`definirEquipe_`); sem backend 3.7+ não aparece botão que não funciona. Confirmação simples (`confirm`), aviso com "Desfazer" (chama `restaurarMidia`) por 12 s. Peça com uma foto só: não deixa tirar a foto (pede para arquivar a peça). Depois de arquivar a grade é refeita com `aplicarFiltros()` (não `renderizarGrid()` — a grade usa `listaFiltradaAtual`). Reabrir a peça depois de tirar uma foto NÃO conta nova visualização (`abrirDetalhe(id, slide, silencioso)`).
- **Juntar** (`admin.html`, botão `#btn-bulk-juntar` na barra de lote, só com `versao.juntarProdutos` e ≥ 2 marcados): janela `#overlay-juntar` escolhe qual fica; erro de limite de fotos aparece como frase. Credencial via `chamarAdmin_`.
- **Vários perfis** (funcionários 3.2; catálogo 3.8 só LÊ): a coluna `Perfil` pode ser `Cliente, Aluno, Equipe do site`. Permissões = **soma** dos perfis (`acPermsDosPerfis_`); "Cliente" vai sempre junto. `acessos_perfil` aceita `perfis:[...]` (e `perfil` de um só, como antes). Marcar/desmarcar refaz as caixinhas `perm_*` pela soma (ajustes individuais são refeitos — o painel pergunta antes). **Travas mantidas** e valem para a soma: ninguém tira o PRÓPRIO Admin total e sempre sobra um Admin total ativo. "Só cliente" = a lista é exatamente `Cliente`. Painel RH (`treinamentos.html`): caixinhas `data-perfil-set` no lugar da lista suspensa; com backend antigo e mais de um perfil, mostra frase pedindo o backend 3.2.
- **Testes**: `tests/x_equipe.py`, `tests/juntar_admin.py`, `tests/acessos_perfis.py`, `tests/backend_func.js` (backend de funcionários com planilha simulada), seção 8h de `tests/backend_gs.js`; `tests/mock.py` ganhou `versao="3.7"` (ações do X/juntar, `st["x_chamadas"]`, `st["x_arq"]`) e `acessos_listar/acessos_perfil` com estado (`st["acpessoas"]`, `st["perfil_chamadas"]`).
- **Colar à mão (Apps Script)**: `catalogo-codigo-4.3.gs.txt` no Apps Script do CATÁLOGO e `funcionario-codigo-3.3.gs.txt` no de FUNCIONÁRIOS, "Nova versão" nos dois; conferir com `?action=versao`.

## v3.8 (parte 2) — Importador: limites ao juntar, "Cadastrar separado" e conta do preço (Worker `tenkiter-ig`, só front + Worker)

- **Pedido do Pablo (11/10/2026)**: (1) juntar posts respeita **8 fotos + 1 vídeo** e deixa ESCOLHER; (2) opção **🧩 Cadastrar separado**; (3) o preço final com desconto tem que ser IGUAL ao escrito na foto.
- **Juntar** (`admin-instagram.js`, `iniciarJuncao`): cabe → confirmação e junta direto; passa → tela de escolha (`desenharEscolha`, contador "Fotos n/8 · Vídeo n/1", a caixinha NÃO deixa passar do limite; a tela se redesenha a cada clique — nos testes use `.click()`, não `.check()/.uncheck()`). `executarJuncao` junta e depois tira o que ficou de fora com `removerMidia` (vira mídia solta em Pendentes; nada se perde).
- **Cadastrar separado** (`separadoMarcados` → `window.tkAceitarSeparado` em `admin.html`): abre o cadastro normal preenchido pelo 1º post, com faixa `#aviso-lote`; ao salvar, cria 1 produto por post (`dadosDoPostSeparado_`: mesmas informações, fotos PRÓPRIAS de cada post, máx. 8 fotos), cada `rascunhoId` marcado aceito; push só do primeiro. Post só com vídeo é barrado.
- **Preço (regra única, `precoDasFotos` no Worker)**: o valor escrito (na foto OU na legenda) é o À VISTA (10% off); o catálogo guarda o CHEIO = menor centavo `c` tal que `(c/100*0.9).toFixed(2)` == valor escrito (o site mostra `Preco*(1-DESCONTO_AVISTA)`). Busca exata, conferida de R$ 1 a 3000. Colunas: `preco_sug` = cheio, `preco_foto` = à vista. Migração `mig_preco_v2` em `iniciar` recalcula rascunhos antigos. **Só vale depois de republicar o Worker `tenkiter-ig`** (`instagram-worker/publicar.py`).
- **Testes**: `tests/worker_ig.js` (120), `tests/instagram_admin.py` (83; novas seções "Juntar passando do limite" e "Cadastrar separado"); `tests/mock.py` ganhou `removerMidia`.

## v3.9 — anti-duplicado por foto (backend catálogo 3.9)

- O freio de 10 s do `criarProduto_` (mesmo nome + preço) quebrava o "Cadastrar separado" (e qualquer lote com nome/preço iguais). Agora só barra se a **capa também for igual** (`fotoUrlExistente` = Foto_URL da linha); capa diferente passa. Upload novo em base64 (sem endereço) mantém o freio antigo. Bandeira `duplicadoPorFoto`. Colar `catalogo-codigo-4.3.gs.txt` à mão.

## v4.0 — CPF, e-mail, login múltiplo e "Esqueci a senha" (catálogo 4.0 + funcionários 3.3)

- **Pedido do Pablo (11/10/2026)**: contas que já existem devem ser FÁCEIS ("as chances de não lembrar a senha são muito grandes, precisamos reter"); campo CPF formatado nos cadastros; entra com **e-mail, WhatsApp ou CPF**.
  Regras: **currículo (`curriculo.html`) = CPF obrigatório** (validado, `acCpfValido_`); **cliente = CPF e e-mail opcionais**, explicados na tela; **Estagiário em diante (nível ≥ 2 ou qualquer permissão de equipe: `precisaCpf` em `conta.js`) sem CPF = faixa vermelha grande NA MESMA TELA**
  (`TKConta.faixaCpf`: treinamentos home e admin topo; salva por `salvar_identificadores`, sem ir a configurações).
- **Bloco compartilhado de contas** (nos DOIS `.gs.txt`, tem que ficar idêntico — `tests/backend_contas.js` confere): `acResolverIdentificador_` (e-mail → coluna `email`; só dígitos → WhatsApp de conta existente primeiro, depois CPF válido na coluna `cpf`; senão WhatsApp normalizado),
  `acSalvarIdentificadores_` (valida, CPF/e-mail únicos → `emUso`, grava CPF `000.000.000-00`, e-mail minúsculo; cria as colunas CPF/Email sozinho), `acRecuperarSenha_`, `acSalvarMeusIdentificadores_`. Login (`login`) aceita `identificador`; o front continua mandando `whatsapp` também (backend antigo).
  Respostas de login/sessão devolvem o WhatsApp REAL da conta — a sessão `tk2.<whats>.<hmac>` não muda, então o multi-login é só resolução no servidor.
- **Recuperar senha sem e-mail/SMS** (`recuperar_senha`, ação ABERTA): confere CPF e/ou data de nascimento cadastrados; conta com permissão sensível exige os DOIS; 5 erros = 15 min travado; conta sem nenhum dos dois, ou da equipe sem os dois → `precisaGestao` e a tela abre o `wa.me` da loja com mensagem pronta (link completo, regra 2).
  Acertou → troca a senha e já devolve `{usuario, sessao}` (entra direto). Nada de CPF/senha/nascimento é guardado no aparelho.
- **"Conta já existe"** nunca mais é só um erro: `TKConta.avisoContaExiste` mostra cartão com **Entrar** e **Esqueci a senha**; backend devolve `contaExiste:true` (registrar, `curriculo_cadastro`) e `emUso:true` para CPF/e-mail de outra conta.
- **Front**: `conta.js` (carregar DEPOIS de `a11y.js`; janelas fecham com Esc porque os botões levam a classe `btn-fechar`; `#tkc-recuperar` está em `JANELAS` do `a11y.js`). `common.js`: `entrarComSenha(identificador, senha)`, `registrarClienteApi(..., extras)`, `chamarConta`. `curriculo.html` não carrega `common.js` (usa o próprio `api()`).
  Currículo: coluna `CPF` (no fim de `CV_HEADERS`) e CPF também na conta. Campo "WhatsApp" da 1ª tela do currículo continua só WhatsApp (o `curriculo_iniciar` não resolve e-mail/CPF).
- **Aviso ao sair com envios pendentes** (`admin.html`): os envios da fila rodam NA página; `window.TKSairBloqueio()` devolve o texto se há envio pendente e `nav.js` pergunta (`confirm`) antes de qualquer link da barra inferior; `beforeunload` cobre fechar a aba. Sem envio pendente não pergunta.
- **Copiar peça parecida** (`admin.html`, sugestões do "Nome da peça"): traz TUDO (preço, categorias, gêneros, tamanhos, cores, descrição…) menos código e fotos, com o aviso `#aviso-copiado`; editando uma peça, copia só o nome. Depois de copiar, "✎ Editar" outra peça pergunta antes de descartar.
- **Testes**: `tests/backend_contas.js`, `tests/backend_func.js`, `tests/contas_cpf.py` (telas + axe + aviso de saída), `tests/admin_categorias.py` (copiar). `jornada_funcionaria.py` "progresso foi enviado ao servidor" já falhava ANTES desta mudança (conferido no HEAD anterior) — não é regressão.
- **Colar à mão (Apps Script)**: `catalogo-codigo-4.3.gs.txt` (catálogo) e `funcionario-codigo-3.3.gs.txt` (funcionários), "Nova versão" nos dois; conferir `?action=versao` (flags `cpf, recuperarSenha, loginMultiplo`). Sem o backend novo o site funciona como antes (login só por WhatsApp), mas CPF/recuperação só valem depois de colar os dois.

## v4.1 — plaquinha flutuante de convite para instalar o app (`pwa.js`, só front)

- **Pedido do Pablo (11/10/2026)**: reconhecer se a pessoa vem do app ou do site normal; fora do app, aparece uma plaquinha flutuante com o convite.
- **Reconhece o app** (`vindoDoApp()`): `display-mode: standalone`/`navigator.standalone`, referrer `android-app://`, ou `?origem=app`/`?source=pwa` (o `start_url` do manifest é `/?origem=app`). Só convida em celular (iOS/Android) — nunca em computador.
- **Plaquinha** `#tk-convite-app` (acima da barra inferior, `z-index:80`): Android com `beforeinstallprompt` → "📲 Instalar o app" (o `prompt()` roda dentro do toque); iPhone → "Como instalar" (Compartilhar + rola até `#instalar-app`); navegador embutido (Instagram/WhatsApp) → "Copiar endereço"; Android sem o evento → passo a passo.
  "Agora não" volta só após ≥ 3 dias, no máximo 3 vezes; "Não mostrar mais" = nunca (`tk_convite_app_v1`); `appinstalled` desliga para sempre; não abre por cima de janela aberta. Aparece 9 s após o carregamento (`window.TK_CONVITE_ATRASO_MS` nos testes). Só `index.html` (carrega `pwa.js`).
- Service worker `VERSAO='tk-3.6.0'`. Teste: `tests/convite_app.py`.

## v4.2 — quem cadastrou/editou (backend catálogo 4.1) e fila de envios que sobrevive (admin.html)

- **Pedido do Pablo (11/10/2026)**: (1) "o cadastro do produto deixe registrado quem cadastrou, quem e quando editou e etc"; (2) se minimizar o app ou ir a outro app, o envio não pode se perder.
- **Auditoria** (`catalogo-codigo-4.3.gs.txt`, bandeira `auditoriaProdutos`): colunas `CriadoPor/CriadoEm/EditadoPor/EditadoEm/UltimaAcao` na planilha de produtos (criadas sozinhas). O NOME vem da sessão de login (`aut.nome` → `body.funcionario`; o texto digitado no aparelho é ignorado com login; com o PIN antigo vale o digitado).
  Carimbo central: `despacharComCarimbo_` (create, update, delete, reativar, arquivarRapido, arquivarMidia, restaurarMidia, juntarProdutos, bulkUpdate); falha no carimbo NUNCA derruba a ação. **Essas colunas são removidas da lista PÚBLICA** (`?action=list`) — nome de funcionário não pode vazar; a equipe lê por `auditoriaProdutos` e `historicoProduto {id}` (permissão `catalogo_cadastrar`; linha do tempo vem da aba `Acoes_Audit`).
  Front: linha "Cadastrou: X · dd/mm hh:mm — Editou: Y · …" na lista e no formulário de edição, botão "🕘 Histórico" no menu ⋯ (`#overlay-historico`, entra na lista do `popstate`). Só aparece com backend 4.1. Testes: seção 8i de `backend_gs.js`, `tests/auditoria_produto.py`; `mock.py` `versao="4.1"`.
- **Fila de envios no aparelho** (`admin.html`): cada envio é gravado no IndexedDB `tenkiter_admin_envios_v1` (dados da peça + fotos em base64 + arquivo do vídeo; **nunca senha/token** — a credencial entra na hora de enviar). Ao abrir o painel logado, `restaurarEnvios_` retoma sozinho o que ficou (abre o cartão de cadastro para a pessoa ver).
  Antes do POST final o item vira `etapa:'salvando'`; se o app morreu aí, na volta NÃO reenvia (podia duplicar): mostra "não sei se esta peça chegou a ser salva… confira na lista" com Tentar de novo / Descartar. Apaga do aparelho ao terminar (ok/aviso/offline) ou ao descartar. `visibilitychange` retoma a fila ao voltar ao app; Wake Lock mantém a tela ligada enquanto envia.
  **Limite honesto**: navegador/PWA CONGELA a página quando minimiza ou troca de app (Android e iPhone); nada garante envio em segundo plano sem Background Sync no service worker (só Android/Chrome; iPhone não tem) — por isso a fila é guardada e retoma, mas só TERMINA com o painel aberto. O aviso de saída da barra inferior diz isso. Teste: `tests/envios_retomar.py`.

## v4.3 — validação de avisos a cada abertura do app, "Não mostrar mais" minúsculo, ações fixas no modal da peça (só front)

- **Pedido do Pablo (11/10/2026)**: (1) "Não mostrar mais" da plaquinha de instalar bem menor (`.tkcv-n` 10 px, canto, cinza `#9a9a9a`) para não induzir; (2) **toda vez que o app instalado abre**, validar a permissão de avisos: ativo = nada acontece; desligado = placa pedindo.
  `push.js` `validarAoAbrir()` (só `standalone()`; chamada ao fim da init do SDK e nos caminhos de SDK bloqueado/timeout): `pendente|pausado|negado|bloqueado` → `#tk-placa-aviso` (z-index 80, acima da barra); `pendente/pausado` → botão "🔔 Ativar avisos" chama `ativar()` DENTRO do toque; `negado/bloqueado` → "Ver como liberar" = `abrirAjuda(r)`.
  **Sem "não mostrar mais" de propósito**; "Agora não" vale só até fechar o app (`sessionStorage tk_placa_aviso_sessao_v1`) e volta na abertura seguinte. Some sozinha se virar `ativo` (`mudou()`). No app NÃO abre mais a janela modal de convite (só navegador de equipe/aluno mantém). Gancho de teste: `window.TK_PLACA_ATRASO_MS` (padrão 2500).
- **Modal da peça (index.html)**: "Favoritar" e "Compartilhar foto e link" agora ficam DENTRO da `.barra-compra` fixa (linha de cima; Sacola/Pedir na de baixo), sempre à vista sem rolar (pedido: "tudo à mostra na tela").
- Service worker `VERSAO='tk-3.7.0'`. Testes: `push_cliente.py` (placa: ativa/negada/ativo/fora do app), `convite_app.py` (tamanho do "Não mostrar mais").

## v4.4 — Tamanhos virando data (backend catálogo 4.2 + front)

- **Bug real (Pablo, 11/10/2026)**: "Fantasia infantil 2/4/6 anos" mostrava `Tamanhos: 2006-04-02T08:00:00.000Z` — o Google Planilhas converte "2/4/6" em data ao gravar. **Backend 4.2** (bandeira `textoPlano`): criar/editar força formato texto (`@`) em Tamanhos/Cores e a lista pública devolve `Date` de volta como `d/M/yy` (`textoPlano_`). **Front** (`textoPlano()` em `common.js`, usado no modal da peça e no formulário de edição) faz o mesmo com a data ISO — conserta já o que está gravado, mesmo antes de colar o backend. Depois de colar o 4.2, reabrir/salvar a peça grava o texto de verdade na célula.
- **Rapidez (Pablo, 11/10/2026)**: plaquinha de instalar o app abre após 2 s (antes 9 s; `TK_CONVITE_ATRASO_MS`); o ✕ da equipe aparece já na 1ª tela por palpite do último acesso (`tk_equipe_dica_v1` = só "1/0", sem dado pessoal; só vale com sessão salva) e é corrigido por `definirEquipe_` assim que o servidor confirma (sessão vencida → `definirEquipe_(null)` tira o ✕). O servidor continua sendo quem decide a permissão.

## Instagram — decisão atualizada (11/10/2026)
- O Pablo pediu de novo, explicitamente, a aba **Postagens** (Feed, Carrossel, Reels, Story; agendada ou na hora; original ou template). A regra "sem postagem automática" fica **superada só para essa aba**. Investigação e plano em `claude/plano-postagens-instagram.md` (projeto). Fatos-chave: a API NÃO agenda (agenda é nossa, fila + cron no Worker) e NÃO aceita link/figurinha em Story → Story com link é semi-manual (push + baixar mídia + copiar legenda/link). Nada implementado ainda; aguardar as decisões do Pablo.

## v4.5 — Instagram no cofre das Conexões (backend catálogo 4.3)

- **Pedido do Pablo (11/10/2026)**: opção do Instagram no cofre. Conexão `instagram` (`INSTAGRAM_TOKEN` nas Propriedades do Script, testada em `graph.instagram.com/me` antes de guardar) + item no cofre (`revelarConexao nome=instagram`, mesma dupla verificação). Bandeira `conexoesInstagram`.
  É uma **cópia**: o Worker `tenkiter-ig` guarda o token dele no D1 (renova sozinho). `admin-conexoes.js` ao guardar liga o Worker primeiro (`POST /token`) e só então guarda a cópia; apagar remove os dois. A cópia pode ficar velha se o Worker renovar.
  Para a aba de postagens o token precisa da permissão `instagram_business_content_publish` (guia passo a passo dado ao Pablo; ver `claude/plano-postagens-instagram.md`). Testes: seção 8g de `backend_gs.js`, `cofre_admin.py` (backend 4.3); `mock.py` `versao="4.3"`.

## v4.6 — Aba Postagens: publicar no Instagram (Worker `tenkiter-ig` + `admin-postagens.js`)

- **Decisão do Pablo (11/10/2026)**: aba **Postagens** (Feed, Carrossel, Reels, Story; agora ou agendado; original ou template). A regra "sem postagem automática" ficou superada SÓ para esta aba. Plano/pesquisa: `claude/plano-postagens-instagram.md` (projeto).
- **Worker** (`instagram-worker/worker.js`, módulo POSTAGENS; cron agora `* * * * *`): tabela `postagem` (status `agendado|processando|manual_pendente|manual_feito|publicado|erro|cancelado`). A API do Instagram NÃO agenda — a agenda é nossa (fila no D1 + cron de 1 min; o import e a IA rodam só nos minutos 0 e 30).
  Fluxo: `POST /me/media` (container) → espera `status_code=FINISHED` (vídeo até 20 min) → `POST /me/media_publish`; carrossel = 1 container por mídia + pai. Token sempre no CORPO do POST (nunca no endereço). Erros viram frase (`fraseErroIG`): token vencido/sem permissão = erro na hora; mídia recusada = +5 min (máx. 3 tentativas); limite do Instagram = +30 min sem gastar tentativa; teto 90 publicações/24 h.
  **Story com link NÃO existe na API** → `modo:'manual'`: vira `manual_pendente` e a pessoa termina no app do Instagram (baixar mídia, copiar link, "Já postei"). Rotas: `GET /posts`, `POST /post` (um ou `posts[]` ≤12), `/post/cancelar`, `/post/reagendar`, `/post/feito`. Quem pode: `gerir_acessos` **ou** `catalogo_cadastrar` (o resto do Worker segue só Admin total). **Publicar o Worker de novo** quando mudar (`instagram-worker/publicar.py`; o cron mudou para 1 min).
- **Painel** (`admin-postagens.js`, botão 📸 Postagens em Ferramentas, mesmo padrão do `admin-instagram.js`: login por token `tk1./tk2.`): peça → tipo → mídias → Original/Template (Clássico, Promoção, Minimal, Vitrine; canvas → JPEG 1080×1350, Story 1080×1920) → legenda automática (nome, preço à vista, código, `linkProduto`) → agora/agendar → Fila / Postar à mão / Já postadas. Imagem sobe ao R2 (`/u`), cai no `subirMidia_` (Cloudinary) se falhar. Story = 1 Story por foto marcada. Vídeo só se for direto (R2/Cloudinary) ou subido do aparelho (≤15 MB).
- **Testes**: seção "POSTAGENS" de `tests/worker_ig.js` (Instagram FALSO com POST/status/permalink) e `tests/postagens_admin.py` (mock `st["ig"]["posts"]`, `post_chamadas`, `post_recusa`). **Primeira postagem real só com o OK do Pablo** (começar por um Story); o token precisa de `instagram_business_content_publish`.
