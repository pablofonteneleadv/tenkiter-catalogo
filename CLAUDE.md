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
  - `catalogo-codigo-3.5.gs.txt` — catálogo + autenticação central + pedidos/métricas/importação/feed/integrações (v3.1) + apagar/renomear categoria só para Admin total (v3.2) + avisos push completos (v3.3) + Conexões Render/Cloudflare (v3.4) + OneSignal nas Conexões e Números reais com filtros/aparelhos (v3.5).
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
