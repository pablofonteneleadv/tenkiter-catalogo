# Como aplicar — Postagem multicanal (Instagram / WhatsApp / Ambos) + Wafly

Branch: `feat/postagem-multicanal-wafly` · PR para `main` · 16/10/2026

Este guia é o passo a passo do **deploy manual**. O PR **não dispara nada**: não há deploy do
Render nem re-publicação de Workers. Quem publica é você.

Ordem recomendada: **A (site) → B (Apps Script) → C (verificação)**. Se inverter, o painel novo
aparece antes do backend novo e o canal `whatsapp` responde "WhatsApp não configurado no servidor".

---

## O que este pacote entrega

| Camada | Arquivo | O que muda |
|---|---|---|
| Frontend | `common.js` | Contrato do canal: `CANAIS_POSTAGEM`, `normalizarCanalPostagem`, `canalUsaInstagram`, `canalUsaWhatsApp`, `rotuloCanalPostagem`, `lerCanalPostagemSalvo`, `salvarCanalPostagem`, `htmlSeletorCanalPostagem`, `ligarSeletorCanalPostagem`. **Sem nenhuma credencial.** |
| Frontend | `admin-postagens.js` | Seletor "Publicar em: Instagram / WhatsApp / Ambos" na tela de postagem; `canal` no corpo do `POST /post`; propagação do canal para a próxima peça do lote. |
| Cache | `OneSignalSDKWorker.js` | `VERSAO` de `tk-3.11.0` → **`tk-3.12.0`**: renova o cache de `common.js` e `admin-postagens.js` em todos os aparelhos. |

**NÃO versionado de propósito** (ver "Segurança" abaixo): os backends `catalogo-4.14.gs` e
`funcionario-3.14.gs`. Eles são colados à mão no Apps Script.

---

## Passo A — Publicar o site (frontend)

1. Mescle o Pull Request em `main` (o CI verde é o portão; o merge em si não publica).
2. No painel do **Render** → serviço `tenkiter-catalogo` → **Manual Deploy → Deploy latest commit**.
   - O `autoDeploy` é `false` de propósito neste projeto.
   - Alternativa por API (se preferir terminal), com `RENDER_API_KEY` e `RENDER_SERVICE_ID`:
     ```bash
     curl -sS -X POST "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \
       -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
       -H "Accept: application/json" -d '{"clearCache":"do_not_clear"}'
     ```
3. Confirme no ar que o commit certo subiu:
   ```bash
   curl -sS https://tenkitermodas.com.br/version.json
   ```
   O campo `commit` deve ser o SHA do merge na `main`.
4. Cache: o `OneSignalSDKWorker.js` com `tk-3.12.0` **já renova sozinho** o cache do site para todo
   mundo (o worker apaga os caches `tk-site-*` antigos no `activate`). Se quiser garantir na borda,
   limpe o cache do Cloudflare para `/common.js`, `/admin-postagens.js` e `/OneSignalSDKWorker.js`.

---

## Passo B — Backends do Apps Script (obrigatório para o WhatsApp funcionar)

O site novo só fala o parâmetro `canal`; **quem aciona a Wafly é o backend**. Sem este passo, o canal
`whatsapp`/`ambos` responde "WhatsApp não configurado no servidor" e nada mais quebra.

### B1. Colar os dois arquivos

1. Abra o projeto do **catálogo** em <https://script.google.com>.
2. Selecione **todo** o conteúdo do editor e substitua pelo conteúdo de **`catalogo-4.14.gs`**
   (arquivo inteiro — não é patch). Salve.
3. Abra o projeto de **treinamento/RH** e repita com **`funcionario-3.14.gs`**.
4. Publique nova versão em **cada** projeto:
   **Implantar → Gerenciar implantações → (lápis) editar → Versão: Nova versão → Implantar.**
   ⚠️ Editar a implantação existente mantém a **mesma URL** do Web App — que é a que está em
   `common.js` (`API_URL`). Não crie uma implantação nova, senão a URL muda e o site aponta para o vazio.

> Os dois arquivos já vêm com o bloco Wafly completo e **leituras só de `PropertiesService`**. Nenhum
> token está escrito no código.

### B2. Criar as 3 propriedades (uma vez, em cada projeto)

**Configurações do projeto (⚙️) → Propriedades do script → Adicionar propriedade.**

| Propriedade | Valor |
|---|---|
| `WAFLY_CLIENT_TOKEN` | seu Client-Token da Wafly |
| `WAFLY_INSTANCE` | sua instância na Wafly |
| `WAFLY_TOKEN` | seu token da instância |

- Crie nos **dois** projetos (catalogo **e** funcionario): os dois trazem o módulo Wafly.
- Sem elas o módulo responde *"WhatsApp não configurado no servidor"* e o resto segue funcionando.
- **Nunca** coloque esses valores em arquivo, no repositório, em print ou no chat. Eles vivem só aqui.

---

## Passo C — Verificação (2 minutos)

1. **Versão e bandeiras do backend** — abra no navegador:
   `https://script.google.com/macros/s/<ID_DA_IMPLANTACAO>/exec?action=versao`
   Deve retornar `catalogo-4.14` com `wafly: true`, `waflyWebhook: true`, `postagemCanal: true`.
2. **Seletor na tela** — abra o painel (`admin.html`), aba **Postagens**, e confira o bloco
   "Publicar em: Instagram · WhatsApp · Ambos". Recarregue com **Ctrl+Shift+R** se não aparecer.
3. **Instagram inalterado** — escolha `Instagram` e poste: o corpo do `POST /post` é o mesmo de antes,
   acrescido apenas do campo `canal`. O fluxo do Worker `tenkiter-ig` não foi tocado.
4. **WhatsApp** — escolha `WhatsApp`, poste e confira o status. Repetir o mesmo envio **não duplica**
   (dedupe por `chaveIdem|telefone|mensagem`); em `ambos`, publica no Instagram e no status.
5. **Erro de autenticação** — com um token inválido o backend devolve frase curta, **não repete** e
   **não vaza** o token no log.

---

## Segurança — o que NUNCA vai para o repositório

- O repositório é **público** e o Render publica a **raiz inteira** do repositório como site
  (`staticPublishPath: ./`). Qualquer `.gs` versionado viraria download público — incluindo o
  `SESSION_SECRET` compartilhado que existe no próprio arquivo.
- Por isso o `.gitignore` **ignora `*.gs`** e o `scripts/ci/check_secrets.sh` do CI **bloqueia**
  qualquer `.gs`/`.gs.txt` versionado. Este PR mantém os backends fora do repositório de propósito.
- As credenciais Wafly (`WAFLY_CLIENT_TOKEN`, `WAFLY_INSTANCE`, `WAFLY_TOKEN`) vivem **apenas** nas
  Propriedades do Script, no servidor. Não há nenhum valor de token no frontend nem no `canal`.
- Varredura rodada antes do commit: `bash scripts/ci/check_secrets.sh` →
  *"Segredos: nenhuma credencial em texto plano encontrada."*

---

## Reverter

- **Site**: `git revert <SHA>` na `main` e disparar o deploy do Render de novo. Para forçar cache,
  suba a `VERSAO` de `OneSignalSDKWorker.js` para `tk-3.13.0`.
- **Apps Script**: `Gerenciar implantações` → editar → escolher a **versão anterior** → Implantar.
  (Nenhum dado é perdido: a mudança é de código.)
