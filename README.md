# TENKiTER Modas — Catálogo Digital

Catálogo online da TENKiTER Modas (Crateús, CE), hospedado no Render:
**https://tenkiter-catalogo.onrender.com/**

## Arquivos

**Páginas**
- **`index.html`** — catálogo público, para os clientes. Filtros por categoria, gênero, preço e busca tolerante (sem acento, várias palavras, 1 letra errada); favoritos, sacola (combina várias peças num pedido só), busca por voz; ao abrir um produto, o cliente chama no WhatsApp da loja ou compartilha. Funciona como app instalável (seção "Instale o app" no fim da página, para Android e iPhone) e abre sem internet com as últimas peças vistas. "Compartilhar seleção" gera um link que abre exatamente as peças escolhidas.
- **`admin.html`** — painel do lojista. Cadastro de produtos (corte de foto, estoque, tamanhos, cores, "novidade", vídeo e galeria), duplicar peça, arquivar/excluir, ações em lote, fila offline, gerador de arte para Stories (JPG e **vídeo gravado no navegador**), **Central de avisos** (`admin-push.js`: push para todos, equipe, alunos, perfis, acessos, pessoas ou o cliente de um pedido; agendamento, modelos, histórico), e o bloco de gestão (`admin-gestao.js`): **pedidos** com etapas, **números reais**, **importar/exportar planilha CSV**, **integrações** (Pixel da Meta, catálogo para Instagram/Google). Acesso por login (WhatsApp + senha) com permissões.
- **`treinamentos.html`** — portal de treinamento e painel do RH. **`curriculos.html`** (gestão, só equipe) e **`curriculo.html`** (candidatura pública). `manual.html` só redireciona (endereço antigo; não divulgar).
- **`privacidade.html`** (política de privacidade, modelo a ser revisado pelo responsável) e **`404.html`**.

**Scripts compartilhados**
- **`common.js`** — configuração e funções compartilhadas (URL da API, endereço público do site, desconto à vista, número de WhatsApp da loja, favoritos, sacola, fila offline, formatação de preço, miniaturas, lista rápida). **Qualquer mudança nesses valores deve ser feita só aqui.**
- **`pedido.js`** (sacola com formulário, pedido enviado, acompanhar pedido, favoritos, compartilhar seleção), **`meta.js`** (Pixel da Meta — desligado até haver ID e aceite do visitante), **`pwa.js`** + **`push.js`** + **`OneSignalSDKWorker.js`** (instalar o app, avisos push e cache offline; um único service worker; guia dos avisos em **`LEIA-ME-AVISOS.md`**), **`nav.js`** (barra inferior), **`a11y.js`** (acessibilidade: foco, Esc, Tab preso nas janelas).
- **`site.webmanifest`**, ícones, **`robots.txt`**, **`sitemap.xml`** (páginas fixas; o mapa completo das peças vem do Worker, ver `og-worker/LEIA-ME.md`).

**Fora do site**
- **`og-worker/`** — Worker da Cloudflare (miniatura e dados do Google por peça, mapa do site, catálogo para Meta/Google, lista rápida). Guia: `og-worker/LEIA-ME.md`.
- **`tests/`** — baterias automáticas (`python3 tests/rodar_tudo.py`). Ver `CLAUDE.md`.

## Backend

O catálogo usa `catalogo-codigo-3.3.gs.txt` e o RH/treinamento `funcionario-codigo-3.0.gs.txt` (os outros `.gs.txt` são históricos). O backend é um Google Apps Script (Web App) conectado a uma planilha do Google Sheets (produtos) e a uma pasta do Google Drive (fotos). A URL do Web App fica em `common.js`, na constante `API_URL`.

> ⚠️ **Atenção**: `index.html` e `admin.html` devem sempre usar a mesma `API_URL` (a de `common.js`). Se algum dia precisar apontar para uma nova implantação do Apps Script, troque só ali — nunca crie uma URL diferente em outro arquivo, senão o cadastro e o catálogo público passam a ler/escrever planilhas diferentes.
>
> A `API_URL` é só o backend de dados — **nunca** deve ser usada para montar um link a ser compartilhado com o cliente (WhatsApp, Stories, etc.). Todo link compartilhável usa a constante `SITE_URL` (o endereço do site no Render), também em `common.js`.

## Como editar

Não há build nem dependências — é HTML/CSS/JS puro. Basta editar os arquivos e subir no GitHub (branch `main`). O deploy automático do Render nem sempre dispara: depois de cada push, dispare o deploy e confirme que o site no ar tem o código novo (passo a passo em `CLAUDE.md`). **Os backends em Apps Script não sobem sozinhos**: cole o arquivo `.gs.txt` novo no editor do Apps Script e use *Gerenciar implantações → editar → Nova versão*. Rode `python3 tests/rodar_tudo.py` antes de publicar.
