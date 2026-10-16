# v4.11 — Correções do painel (Frontend) — 8 itens

Esta entrega **aplica de fato** as 8 correções que a v4.10 havia deixado apenas como patch
(os arquivos reais nunca foram alterados na `main`). Além disso, fecha dois pontos que faltavam
na v4.10 — a **tela de juntar responsiva** (item 5) e **tamanhos/cores com o mesmo seletor das
categorias** (item 7) — e corrige um bug em que o botão **Separar** nunca aparecia.

## Arquivos entregues

Todos os 5 arquivos vêm como **patch verificado** (aplicam sobre a `main` limpa e reproduzem o
arquivo final **byte a byte**):

| Arquivo | Patch |
|---------|-------|
| `common.js` | `patches/tenkitermodas-v4.11/common.js.patch` |
| `nav.js` | `patches/tenkitermodas-v4.11/nav.js.patch` |
| `catalogo.js` | `patches/tenkitermodas-v4.11/catalogo.js.patch` |
| `admin.html` | `patches/tenkitermodas-v4.11/admin.html.patch` |
| `treinamentos.html` | `patches/tenkitermodas-v4.11/treinamentos.html.patch` |

## Como aplicar os patches

```bash
git checkout main && git pull

# a partir da RAIZ do repositório (os arquivos estão na raiz)
for f in common.js nav.js catalogo.js admin.html treinamentos.html; do
  patch -p1 < patches/tenkitermodas-v4.11/$f.patch
done
```

Conferir (deve imprimir os mesmos md5 nas duas colunas):

```bash
md5sum common.js nav.js catalogo.js admin.html treinamentos.html
# common.js         6a2cd85749db39a35709a8b7580f4525
# nav.js            e8045185fe0806e51d9bfcae133004c1
# catalogo.js       590466d1b422a0829708d5cd9d2ced30
# admin.html        3966cdb3db32e363a419aafb399b8764
# treinamentos.html c0140dfe2c0ae0b48f6f1a8b245018f0
```

## O que muda, item por item

| # | Item pedido | Arquivo(s) | O que foi feito |
|---|-------------|-----------|-----------------|
| 1 | Login único entre as páginas | `common.js`, `treinamentos.html` | `common.js` expõe **`TKSessao`** — uma chave só (`tm_session`) com `ler/salvar/limpar/token/logado/aoMudar`. Entrar no catálogo vale no admin, treinamentos e currículos, sem login repetido. `treinamentos.html` avisa a mudança de sessão. |
| 2 | Barra inferior/menus sem recarregar | `common.js`, `nav.js` | `TKSessao.aoMudar(fn)` + evento `tk:sessao` (e `storage`, para outras abas). `nav.js` redesenha a barra na hora em que a sessão muda — antes só refletia depois de um F5. |
| 3 | Menu "Cadastrar" com 3 caminhos | `admin.html` | Novo `<details id="card-menu-cadastro">` com **📥 Produtos para aceitar** (aparece só quando há algo do Instagram), **➕ Cadastrar nova peça** e **🗃️ Cadastrar várias peças**. |
| 4 | "Cadastrar várias peças" | `admin.html` | `iniciarVarias_()` + bloco `modoFormulario === 'varias'` no submit: preenche os dados UMA vez (título, preço, descrição, categoria, gênero…) e **cada foto vira um produto novo** com esses mesmos dados. |
| 5 | Tela de juntar responsiva | `admin.html` | `.juntar-lista` com `flex:1; min-height:0; overflow-y:auto` — a lista rola sozinha e o botão **Juntar** fica sempre visível no celular. |
| 6 | Separar + Editar em massa | `admin.html` | **✂️ Separar em peças** (inverso do Juntar: mantém a 1ª foto na peça original e cria uma peça nova por foto extra) e **✏️ Editar em massa** (muda UM campo em várias peças, mantendo os outros campos e sem mexer em fotos/vídeo). Corrigido: o botão Separar agora aparece quando há peça marcada. |
| 7 | Ordem do formulário | `admin.html` | Seções reordenadas para **Categoria → Tamanhos → Cores e estampas → Para quem é**. Tamanhos e cores ganharam folhas de escolha com busca/lista/criar/sugestões — o **mesmo sistema das categorias**. |
| 8 | Filtros extras na busca do admin | `admin.html` | Novos filtros: **categoria**, **gênero**, **ordem** (recentes/antigas/nome/maior preço/menor preço), **preço mín/máx** e **✕ Limpar filtros**. |

## Verificação

```bash
bash scripts/ci/check_js.sh        # 25/25 arquivos .js OK
python3 scripts/ci/check_html.py   # 8/8 páginas OK
bash scripts/ci/check_secrets.sh   # nenhuma credencial em texto plano
```
