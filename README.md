# TENKiTER Modas — Catálogo Digital

Catálogo online da TENKiTER Modas (Crateús, CE), hospedado no Render:
**https://tenkiter-catalogo.onrender.com/**

## Arquivos

**Páginas**
- **`index.html`** — catálogo público, para os clientes. Filtros por categoria, gênero, preço e busca tolerante (sem acento, várias palavras, 1 letra errada); favoritos, sacola (combina várias peças num pedido só), busca por voz; ao abrir um produto, o cliente chama no WhatsApp da loja ou compartilha. Funciona como app instalável (seção "Instale o app" no fim da página, para Android e iPhone) e abre sem internet com as últimas peças vistas. "Compartilhar seleção" gera um link que abre exatamente as peças escolhidas.
- **`admin.html`** — painel do lojista. Cadastro de produtos (corte de foto, estoque, tamanhos, cores, "novidade", vídeo e galeria), duplicar peça, arquivar/excluir, ações em lote, fila offline, gerador de arte para Stories (JPG e **vídeo gravado no navegador**), **Central de avisos** (`admin-push.js`: push para todos, equipe, alunos, perfis, acessos, pessoas ou o cliente de um pedido; agendamento, modelos, histórico), e o bloco de gestão (`admin-gestao.js`, `admin-push.js` (Central de avisos), `admin-conexoes.js` (Conexões: chaves do Render/Cloudflare no servidor, situação, regras, publicar)): **pedidos** com etapas, **números reais** (com filtros de período, horário opcional, dia da semana, app/navegador, aparelho, origem, categoria e gênero, e quantas pessoas instalaram o app e têm aviso ativo — contagem anônima, sem nome nem telefone), **importar/exportar planilha CSV**, **integrações** (Pixel da Meta, catálogo para Instagram/Google). Acesso por login (WhatsApp, e-mail ou CPF + senha) com permissões. Também: **📸 Postagens** (publica no Instagram — Feed, Carrossel, Reels e Story — na hora ou agendado, com editor de visuais, colagem e fila com regras), **📥 Produtos para aceitar** (importador do Instagram), **🎨 Fotos com IA** (Gemini gera capas de campanha; fila que espera a cota) e **Conexões** (chaves guardadas no servidor, com cofre).
- **`treinamentos.html`** — portal de treinamento e painel do RH. **`curriculos.html`** (gestão, só equipe) e **`curriculo.html`** (candidatura pública). `manual.html` só redireciona (endereço antigo; não divulgar).
- **`privacidade.html`** (política de privacidade, modelo a ser revisado pelo responsável) e **`404.html`**.

**Scripts compartilhados**
- **`common.js`** — configuração e funções compartilhadas (URL da API, endereço público do site, desconto à vista, número de WhatsApp da loja, favoritos, sacola, fila offline, formatação de preço, miniaturas, lista rápida). **Qualquer mudança nesses valores deve ser feita só aqui.**
- **`pedido.js`** (sacola com formulário, pedido enviado, acompanhar pedido, favoritos, compartilhar seleção), **`meta.js`** (Pixel da Meta — desligado até haver ID e aceite do visitante), **`pwa.js`** + **`push.js`** + **`OneSignalSDKWorker.js`** (instalar o app, avisos push e cache offline; um único service worker; guia dos avisos em **`LEIA-ME-AVISOS.md`**), **`nav.js`** (barra inferior), **`a11y.js`** (acessibilidade: foco, Esc, Tab preso nas janelas).
- **`site.webmanifest`**, ícones, **`robots.txt`**. O `sitemap.xml` e o feed (`/feed.csv`, `/feed.xml`) **não são arquivos do site**: o Render repassa (Rewrite) para o Worker `tenkiter-og`, que monta tudo com as peças ativas — ver `og-worker/LEIA-ME.md`.

**Fora do site**
- **`og-worker/`** — Worker da Cloudflare (miniatura e dados do Google por peça, mapa do site, catálogo para Meta/Google, lista rápida). Guia: `og-worker/LEIA-ME.md`.
- **`instagram-worker/`** (Worker `tenkiter-ig`: importador do Instagram, fila de Postagens com regras, fotos de clientes, Fotos com IA) e **`midia-worker/`** (Worker `tenkiter-midia`: fotos e vídeos no R2). Guias: `LEIA-ME-INSTAGRAM.md` e `CLAUDE.md`. Os três Workers são publicados sozinhos pelo GitHub a cada merge na `main`.
- **`tests/`** — baterias automáticas (`python3 tests/rodar_tudo.py`). Ver `CLAUDE.md`.

## Backend

O backend são dois Google Apps Script (Web App), um para o **catálogo** (planilha de produtos, pedidos, contas, pasta de fotos no Drive) e outro para o **RH/treinamento** (funcionários, currículos, provas). Versões no ar em 18/10/2026: catálogo `catalogo-4.21` e RH `3.16` (confira sempre por `?action=versao`). Os arquivos `.gs.txt` **não ficam neste repositório público**: a cópia de trabalho está no repositório privado `Tenkiter-cofre`, e o Claude entrega o arquivo no chat quando há versão nova (os `.gs.txt` antigos são históricos). A URL do Web App do catálogo fica em `common.js`, na constante `API_URL`.

> ⚠️ **Atenção**: `index.html` e `admin.html` devem sempre usar a mesma `API_URL` (a de `common.js`). Se algum dia precisar apontar para uma nova implantação do Apps Script, troque só ali — nunca crie uma URL diferente em outro arquivo, senão o cadastro e o catálogo público passam a ler/escrever planilhas diferentes.
>
> A `API_URL` é só o backend de dados — **nunca** deve ser usada para montar um link a ser compartilhado com o cliente (WhatsApp, Stories, etc.). Todo link compartilhável usa a constante `SITE_URL` (o endereço do site no Render), também em `common.js`.

## Como editar

Não há build nem dependências — é HTML/CSS/JS puro. Edite numa branch, abra o PR e, com o check **Portão de qualidade** verde, faça o merge na `main`. O deploy é automático pelo GitHub: o merge aciona `.github/workflows/deploy.yml`, que publica o site (Render) e os três Workers (Cloudflare) e confirma o commit no ar em `/version.json` (passo a passo em `CLAUDE.md` e `docs/CI-CD.md`). Antes de cada merge cria-se um ponto de restauração (`backup/pre-<tema>-<data>`). **Os backends em Apps Script não sobem sozinhos**: cole o arquivo `.gs.txt` novo no editor do Apps Script e use *Gerenciar implantações → editar → Nova versão* (guia: `LEIA-ME-ATUALIZAR.md`). O CI de cada PR roda a parte rápida dos testes; a bateria completa (`python3 tests/rodar_tudo.py`, Playwright) roda à noite e sob pedido.
