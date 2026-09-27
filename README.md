# TENKiTER Modas — Catálogo Digital

Catálogo online da TENKiTER Modas (Crateús, CE), hospedado no GitHub Pages:
**https://pablofonteneleadv.github.io/tenkiter-catalogo/**

## Arquivos

- **`index.html`** — catálogo público, para os clientes. Filtros por categoria, gênero, preço e busca; ao abrir um produto, o cliente pode chamar no WhatsApp ou compartilhar a foto.
- **`admin.html`** — painel do atendente/lojista. Cadastro de produtos (com corte de foto, estoque, tamanhos, cores, "novidade"), dashboard de disponíveis/esgotados, ações em lote (reajuste de preço, marcar novidade, arquivar) e link para o Instagram Stories. Protegido por PIN.
- **`common.js`** — configuração e funções compartilhadas entre `index.html` e `admin.html` (URL da API, desconto à vista, número de WhatsApp, formatação de preço, checagem de estoque/novidade). **Qualquer mudança nesses valores deve ser feita só aqui.**

## Backend

O backend é um Google Apps Script (Web App) conectado a uma planilha do Google Sheets (produtos) e a uma pasta do Google Drive (fotos). A URL do Web App fica em `common.js`, na constante `API_URL`.

> ⚠️ **Atenção**: `index.html` e `admin.html` devem sempre usar a mesma `API_URL` (a de `common.js`). Se algum dia precisar apontar para uma nova implantação do Apps Script, troque só ali — nunca crie uma URL diferente em outro arquivo, senão o cadastro e o catálogo público passam a ler/escrever planilhas diferentes.

## Como editar

Não há build nem dependências — é HTML/CSS/JS puro. Basta editar os arquivos e publicar (o GitHub Pages atualiza automaticamente a partir da branch `main`).
