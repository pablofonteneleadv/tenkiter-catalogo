# v4.10 — Correções do painel (Frontend) — 8 itens

O GitHub só aceita o conteúdo completo de um arquivo, não um diff. Estes patches são o caminho
íntegro e revisável para versionar as mudanças, e foram **verificados**: aplicados sobre a `main`
limpa reproduzem cada arquivo final **byte a byte** (md5 idêntico).

## Como aplicar

```bash
git checkout main && git pull

# a partir da RAIZ do repositório (os arquivos estão na raiz)
patch -p1 < patches/tenkitermodas-v4.10/common.js.patch
patch -p1 < patches/tenkitermodas-v4.10/nav.js.patch
patch -p1 < patches/tenkitermodas-v4.10/catalogo.js.patch
patch -p1 < patches/tenkitermodas-v4.10/admin.html.patch
patch -p1 < patches/tenkitermodas-v4.10/treinamentos.html.patch
```

Conferir (deve imprimir `OK` nas cinco linhas):

```bash
md5sum admin.html catalogo.js common.js nav.js treinamentos.html
# admin.html        3f10a91842f5a696f2689a95ce2bd8e6
# catalogo.js       590466d1b422a0829708d5cd9d2ced30
# common.js         6a2cd85749db39a35709a8b7580f4525
# nav.js            e8045185fe0806e51d9bfcae133004c1
# treinamentos.html c0140dfe2c0ae0b48f6f1a8b245018f0
```

## O que muda, item por item

| # | Item pedido | Arquivo(s) | O que foi feito |
|---|-------------|-----------|-----------------|
| 1 | Login único entre as páginas | `common.js`, `treinamentos.html` | `common.js` passa a expor **`TKSessao`** — uma chave só (`tm_session`) com `ler/salvar/limpar/token/logado/aoMudar`. Entrar no catálogo vale no admin, treinamentos e currículos, sem login repetido. `treinamentos.html` avisa a mudança de sessão. |
| 2 | Barra inferior/menus sem recarregar | `common.js`, `nav.js` | `TKSessao.aoMudar(fn)` + evento `tk:sessao` (e `storage`, para outras abas). `nav.js` redesenha a barra na hora em que a sessão muda — antes só refletia depois de um F5. |
| 3 | Menu "Cadastrar" com 3 caminhos | `admin.html` | Novo `<details id="card-menu-cadastro">` com **📥 Produtos para aceitar** (aparece só quando há algo do Instagram), **➕ Cadastrar nova peça** e **🗂️ Cadastrar várias peças** (mesmos dados, uma foto por peça → N produtos). |
| 4 | Barra de ações em lote no celular | `admin.html` | `.bulk-bar-actions` com rolagem horizontal (`overflow-x:auto`), barra fixa no topo e botão **⋯ Mais ações** — "Juntar" e "Separar" nunca mais ficam fora da tela. |
| 5 | Separar e Editar em massa | `admin.html` | **✂️ Separar em peças** (inverso do Juntar: mantém a 1ª foto na peça original e cria uma peça nova por foto extra) e **✏️ Editar em massa** (muda um campo em várias peças, mantendo os outros campos e sem mexer em fotos/vídeo). |
| 6 | "Enviar para postagem" com a sessão | `catalogo.js`, `admin.html` | O catálogo **não manda mais o link cru**: sem sessão abre o login ali mesmo; com sessão leva `sessao`/`whatsapp` na URL e o admin adota a sessão compartilhada antes de pedir login. |
| 7 | Ordem do formulário | `admin.html` | Seções reordenadas para **Categoria → Tamanhos → Cores e estampas → Para quem é**, com o mesmo seletor de chips/busca das categorias e tamanhos. |
| 8 | Filtros extras na busca do admin | `admin.html` | Novos filtros: **categoria**, **gênero**, **ordem** (recentes/antigas/nome/maior preço/menor preço), **preço mín/máx** e **✕ Limpar filtros**. |

## Verificação

```bash
bash scripts/ci/check_js.sh        # 25/25 arquivos .js OK
python3 scripts/ci/check_html.py   # 8/8 páginas OK
bash scripts/ci/check_secrets.sh   # nenhuma credencial em texto plano
```
