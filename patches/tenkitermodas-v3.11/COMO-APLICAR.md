# v3.11 — frontend (FE-01, CAD-01, CAD-02, service worker)

O GitHub só aceita o conteúdo completo de um arquivo, não um diff. Esses patches são o caminho
íntegro e revisável para versionar as mudanças, e foram **verificados**: aplicados sobre a `main`
limpa reproduzem o arquivo final byte a byte (md5 idêntico).

## O que muda

| Arquivo | Item | Mudança |
|---|---|---|
| `common.js` | **FE-01** | Teto da busca ao atalho da borda: `3500` → `2000` ms, extraído para a constante `LISTA_RAPIDA_MS`. |
| `admin.html` | **CAD-01** | Repassa ao Cloudinary os campos **assinados** extras que o servidor mandar (`allowed_formats`, `max_file_size`, `public_id`, `type`, `eager`, `quality`). Par de front do SEC-20. Retrocompatível: backend antigo não manda nada e o envio continua igual. |
| `admin.html` | **CAD-02** | Rascunho incremental do formulário de cadastro: salva sozinho os campos de texto e as escolhas (gênero/categoria) no aparelho, restaura ao reabrir com aviso e botão "Descartar rascunho". Não rascunha em modo edição, nem quando o formulário está vazio. |
| `OneSignalSDKWorker.js` | **cache PWA** | `VERSAO` `tk-3.9.0` → `tk-3.11.0`; pré-cache ganha `catalogo.css`, `catalogo.js` (extraídos do `index.html` na v3.10 e nunca incluídos — o catálogo abria **sem estilo** offline), `conta.js` e `foto-cliente.js`. **Já aplicado diretamente no repositório.** |

## Como aplicar

```bash
git checkout main && git pull

# a partir da RAIZ do repositório (os arquivos estão na raiz)
patch -p1 < patches/tenkitermodas-v3.11/common.js.patch
patch -p1 < patches/tenkitermodas-v3.11/admin.html.patch

# OneSignalSDKWorker.js já está versionado com a versão nova; use só se quiser reconferir
patch -p1 < patches/tenkitermodas-v3.11/OneSignalSDKWorker.js.patch   # opcional
```

Depois peça ao Render para publicar. Ao subir, **`catalogo.css` e `catalogo.js` precisam ir junto**
com o `index.html` (são referenciados por ele).

## Verificação aplicada antes de entregar

- `node --check` aprovado em `common.js`, `OneSignalSDKWorker.js` e nos blocos inline do `admin.html`.
- Cada patch aplicado sobre a `main` limpa reproduz o arquivo final com **md5 idêntico**.
- IDs/funções usados pelo CAD-02 conferidos no próprio `admin.html` (`form-produto`, `nome`, `preco`,
  `estoque`, `tamanhos`, `cores`, `descricao`, `novidade`, `selecionadasCategorias`,
  `selecionadosGeneros`, `renderizarChips`, `renderizarCategorias_`, `atualizarFaltas_`,
  `cancelarDuplicacao`, `modoFormulario`).
