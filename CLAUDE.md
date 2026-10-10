# TENKiTER Modas — Catálogo Digital (contexto para o Claude Code)

Repositório público, sem build/dependências: HTML/CSS/JS puro + backend em Google Apps Script.

## Arquitetura (resumo — detalhes completos em README.md e LEIA-ME-ATUALIZAR.md)

- **Frontend** hospedado no Render (site estático): `index.html` (catálogo público), `admin.html`
  (painel do lojista), `curriculos.html` (gestão de currículos, só equipe)/`curriculo.html` (candidatura pública)/`treinamentos.html`
  (portal de treinamento + painel do RH; era `manual.html`, que agora é só um redirecionamento — nunca divulgar o nome antigo),
  `nav.js` (barra inferior ÚNICA de todas as páginas: para mudar menu/permissões, edite só ele),
  `common.js` (config compartilhada — **única fonte de verdade** para `API_URL`/`SITE_URL`).
- **Backend**: dois Apps Script Web Apps separados, versionados por nome de arquivo
  (`<nome>-<versão>.gs.txt`):
  - `catalogo-codigo-3.0.gs.txt` — catálogo + autenticação central.
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
  o código do Worker, publicar de novo na Cloudflare (painel ou API). `og-service/` (Node) é alternativa antiga, não usada.
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
