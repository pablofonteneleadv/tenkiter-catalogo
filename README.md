# TENKiTER Modas — Catálogo Digital

Catálogo online da TENKiTER Modas (Crateús, CE), hospedado no Render:
**https://tenkiter-catalogo.onrender.com/**

## Arquivos

- **`index.html`** — catálogo público, para os clientes. Filtros por categoria, gênero, preço e busca; favoritos, sacola (combina várias peças numa só mensagem), busca por voz; ao abrir um produto, o cliente pode chamar no WhatsApp ou compartilhar a foto.
- **`admin.html`** — painel do atendente/lojista. Cadastro de produtos (com corte de foto, estoque, tamanhos, cores, "novidade"), duplicar peça, arquivar/excluir por item, dashboard de disponíveis/esgotados, ações em lote (reajuste de preço, marcar novidade, arquivar), fila offline com sincronização manual, gerador de arte para Stories e configuração da URL da API. Protegido por PIN.
- **`common.js`** — configuração e funções compartilhadas entre `index.html` e `admin.html` (URL da API, endereço público do site, desconto à vista, número de WhatsApp, favoritos, sacola, fila offline, formatação de preço, checagem de estoque/novidade). **Qualquer mudança nesses valores deve ser feita só aqui.**

## Backend

O backend é um Google Apps Script (Web App) conectado a uma planilha do Google Sheets (produtos) e a uma pasta do Google Drive (fotos). A URL do Web App fica em `common.js`, na constante `API_URL`.

> ⚠️ **Atenção**: `index.html` e `admin.html` devem sempre usar a mesma `API_URL` (a de `common.js`). Se algum dia precisar apontar para uma nova implantação do Apps Script, troque só ali — nunca crie uma URL diferente em outro arquivo, senão o cadastro e o catálogo público passam a ler/escrever planilhas diferentes.
>
> A `API_URL` é só o backend de dados — **nunca** deve ser usada para montar um link a ser compartilhado com o cliente (WhatsApp, Stories, etc.). Todo link compartilhável usa a constante `SITE_URL` (o endereço do site no Render), também em `common.js`.

## Como editar

Não há build nem dependências — é HTML/CSS/JS puro. Basta editar os arquivos e subir no GitHub (branch `main`); o Render publica automaticamente a partir dela.
