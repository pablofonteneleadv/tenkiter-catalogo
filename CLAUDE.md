# TENKiTER Modas — Catálogo Digital (contexto para o Claude Code)

Repositório público, sem build/dependências: HTML/CSS/JS puro + backend em Google Apps Script.

## Arquitetura (resumo — detalhes completos em README.md e LEIA-ME-ATUALIZAR.md)

- **Frontend** hospedado no Render (site estático): `index.html` (catálogo público), `admin.html`
  (painel do lojista), `curriculos.html`/`curriculo.html`/`manual.html` (RH/treinamento),
  `common.js` (config compartilhada — **única fonte de verdade** para `API_URL`/`SITE_URL`).
- **Backend**: dois Apps Script Web Apps separados, versionados por nome de arquivo
  (`<nome>-<versão>.gs.txt`):
  - `catalogo-codigo-3.0.gs.txt` — catálogo + autenticação central.
  - `funcionario-codigo-4.6.gs.txt` — RH/treinamento/contratação.
  - Arquivos antigos (`Code-treinamento-v4.0.gs.txt`, `v4.1.gs.txt`, `atualizado.gs.txt`,
    `tenkiter-codigo-v2.1.gs.txt`) são **históricos — não editar nem usar como referência**.

## Regras que já causaram bugs reais (não repetir)

1. **`API_URL` ≠ `SITE_URL`.** `API_URL` é só o backend de dados; nunca usar para montar link
   compartilhável (WhatsApp, Stories). Link compartilhável é sempre `SITE_URL`. `index.html` e
   `admin.html` têm que apontar para a mesma `API_URL` — trocar só em `common.js`.
2. **Toda mensagem enviada ao cliente/candidato (WhatsApp etc.) tem que ter o endereço completo e
   clicável** (ex. `https://tenkitermodas.com.br/manual.html`), nunca só o nome do arquivo. "Tem
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

## Instagram / redes sociais

Decisão já tomada: **sem postagem automática via API do Instagram.** O fluxo é manual —
`admin.html` já tem um gerador de arte para Stories que o lojista compartilha manualmente. Não
implementar integração automática de postagem sem o Pablo pedir explicitamente de novo.

## Segurança

Repositório é **público** — nunca commitar chaves, tokens, PIN em texto plano ou qualquer
segredo. Credenciais/URLs sensíveis ficam só em variáveis de ambiente do Render ou nas
Propriedades do Script do Apps Script, nunca no código versionado.
