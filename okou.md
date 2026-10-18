# okou.md — Ponto de partida para continuar o TENKiTER Catálogo

Documento de passagem para outra inteligência (ou pessoa) assumir o trabalho. Foi escrito em 17/10/2026, a partir da conversa "TENKiTER Training and Results Review" (export `okou-data-export.zip`) e do estado do repositório.

## 1. Regras obrigatórias (vêm da especificação mestra, PDF `Document_Merged (8).pdf`, seção 2)

1. **Atualizado em 17/10/2026 pelo Pablo**: o deploy do frontend é feito pelo Okou direto pelo GitHub (merge na `main` dispara `deploy.yml`), sem esperar confirmação, sempre com ponto de restauração `backup/pre-...` antes. A bateria completa roda só quando o Pablo pedir, com o site já atualizado. A cada atualização, enviar também um zip com os `.md` alterados (copia para guardar) pelo chat.
2. O Pablo cola manualmente o `Code.gs` completo no Google Apps Script quando o backend muda. Entregar sempre arquivo completo, nunca trecho.
3. Trabalhar em branch separada e abrir PR. Merge na `main` e deploy são autorizados pelo Pablo (ver seção 8), com ponto de restauração antes.
4. Não acessar, alterar, remover ou inventar credenciais. Segredos só em Propriedades do Script / variáveis de ambiente, nunca no front, no repositório ou em logs.
5. Não criar projeto novo nem reescrever o sistema. Não remover funcionalidades existentes.

## 2. Repositório e branches

- Repositório: https://github.com/pablofonteneleadv/tenkiter-catalogo
- `main` está em `7e1b98d` (perf: upload paralelo da galeria, até 3 fotos). Esse commit já foi publicado.
- Branch de trabalho: `feat/upload-fila-cadastro-midia-v4.17` (criada a partir da `main`).
- Commits desta branch:
  - `9a7587d` — Foto 12 (campos visíveis) e Foto 8 (várias peças sem teto de 8 por lote), com ajuste dos testes.
  - (commit seguinte) — `CLAUDE.md` v4.17 e `okou.md`.
- Commit `e640f19`, citado na conversa anterior, **não existe mais** no ambiente. Foi refeito como `9a7587d` a partir do `main`, com o mesmo conteúdo descrito na conversa.
- Branches antigas no remoto (`feat/galeria-upload-paralelo`, `feat/postagem-multicanal-wafly`, `fix/*`, `backup/*`, `auditoria/*`) são de trabalhos anteriores. Não apagar.

## 3. Histórico da conversa (resumo cronológico)

1. **Pedido inicial**: resumir os treinamentos e os resultados das planilhas "TENKiTER Treinamento - Funcionarios" e "TENKiTER Treinamento - Resultados" (Google Drive). O resumo foi feito, com dados pessoais (telefones, CPFs, senhas) excluídos. Correção feita: no Manual 1 há **4 tentativas com 4 ou menos acertos** (não 6) e **5 com 5 acertos**. A aprovação integral (19 de 28) estava correta. O arquivo `entregas/resumo-onboarding-tenkiter.md` **não está no ambiente atual**; precisa ser refeito se for necessário.
2. **Especificação mestra** (PDF de 320 páginas, capturas nas páginas 309–320): implementar velocidade, persistência de uploads, cadastro de produtos, editor de imagens, postagem multicanal e experiência mobile. A auditoria mostrou que parte já existe (fila IndexedDB `tenkiter_admin_envios_v1`, envio direto de vídeo ao Cloudinary, guarda de arquivo único na galeria, seletor multicanal).
3. **Backend**: `catalogo-4.16.gs.txt` e `funcionario-3.15.gs.txt` foram recebidos. `assinarUploadVideo_` assina só `folder` e `timestamp`. O SEC-20 (restrição de formato e tamanho) ficou pendente de propósito. Não existe assinatura de foto.
4. **Velocidade — as 4 opções** (thread `f116ecb4`, 17/10/2026 00:56):
   - **A. Ajuste de UX no admin**: liberar a tela logo após "Salvar", mostrar a fila e subir as fotos em paralelo. Só front. Estado: o upload paralelo (3 por vez) já está no `main`; faltam liberar a tela após "Salvar" e exibir a fila de forma clara. **Recomendada.**
   - **B. Fila de cadastro no servidor**: o servidor grava sozinho a partir das URLs já enviadas. Estado: não implementada. Uma fila só no servidor não resolve, porque as fotos sobem do aparelho antes do POST final. Exige `Code.gs`.
   - **C. Postagens em fila com deduplicação**: depende da Wafly e do Worker `tenkiter-ig`. Não feita.
   - **D. Service worker com envio em segundo plano**: descartada, não funciona no iPhone.
   - Uma conversa posterior (01:50) propõe A + B com service worker para Android e `BroadcastChannel`. Ainda não foi validada.
5. **Implementação feita** (branch v4.17): Foto 12 e Foto 8 (ver seção 2).

## 4. Diagnósticos importantes

- `admin.html` é o painel. Os scripts `admin-postagens.js` e `admin-gestao.js` estão minificados/difíceis de buscar. Buscas por padrão exato podem falhar. Usar buscas com limite de caracteres (`cut -c1-300`) para não estourar a saída.
- `MAX_GALERIA = 8` (`admin.html`, por volta da linha 1219) limita fotos de **uma** peça. No modo "várias peças", o limite agora vale por peça.
- A pasta `/home/user/workspace` foi recriada em um sandbox novo. Não há mais clone local anterior nem `entregas/`; reclonar o repositório.
- O `render.yaml` define `autoDeploy: false` de propósito. O deploy é disparado pela API dentro de `.github/workflows/deploy.yml` (ver `docs/CI-CD.md`).
- Os arquivos `CLAUDE.md` e `okou.md` da raiz eram pedidos explícitos da conversa. Antes faltavam no repositório; agora estão na branch.

## 5. Testes e como rodar

```
cd tenkiter-catalogo
bash scripts/ci/check_js.sh
python3 scripts/ci/check_html.py
python3 scripts/ci/check_workers.py
bash scripts/ci/check_secrets.sh
python3 -m http.server 8765 &            # servidor local
export TK_BASE=http://localhost:8765/
# Playwright (venv, pip e chromium): python3 -m venv /tmp/pwenv && /tmp/pwenv/bin/pip install playwright pillow && /tmp/pwenv/bin/python -m playwright install chromium
/tmp/pwenv/bin/python tests/admin_gestao.py      # 80/80
/tmp/pwenv/bin/python tests/jornada_lojista.py   # 15/15
```

- Resultados nesta versão: CI 4/4 OK; `admin_gestao` 80/80; `jornada_lojista` 15/15; `postagens_admin` 101/101, `editor_visual` 14/14, `acessos_perfis` 11/11, `juntar_admin` 8/8 e `admin_categorias` sem falhas (rodados na sessão anterior, antes de a branch ser recriada).
- A bateria completa estoura 15 minutos em uma só execução. Rodar em partes.
- Falhas já existentes no `main` (não causadas por esta branch): `selecao_link`, `rolagem_infinita`, `lista_rapida`.
- `TK_BASE=https://tenkiter-catalogo.onrender.com/` testa o site publicado.

## 6. Pendências, em ordem sugerida

1. **Auditoria das Fotos 3 a 6** (Story/Status padrão, prévia automática, modos de enquadramento). Não há base de código verificada ainda.
2. **Foto 1**: remover os atalhos duplicados do painel ("Produtos para aceitar" e "Cadastrar nova peça") sem perder o acesso pelo menu Cadastrar.
3. **Opção A de velocidade**: liberar a tela após "Salvar" e mostrar a fila.
4. **Fotos 2, 7, 10 e 11**: responsividade, editor simplificado, chips de categoria e permissões.
5. **Backend (exige `Code.gs` completo colado pelo Pablo)**: assinatura de foto, SEC-20, múltiplos vídeos com migração de `Video_URL`, categorias.
6. Testes novos: cadastro com mais de 8 fotos em modo "várias peças"; idempotência; retomada após falha de rede; tela pequena.
7. Abrir PR de `feat/upload-fila-cadastro-midia-v4.17` para `main` e deixar o deploy com o Pablo.

## 7. Estado de publicação

(Ver seção 8 para o estado após o merge.)

## 7a. Estado antes do merge

- Nada foi mesclado na `main`.
- Nenhum deploy foi feito no Render.
- Branch enviada ao GitHub e PR #13 aberto para `main`. O merge e o deploy foram autorizados pelo Pablo em 17/10/2026 (ver seção 8).

## 8. Merge e deploy

- Autorizado explicitamente pelo Pablo (17/10/2026) para fazer merge do PR #13 na `main` e disparar o deploy pelo GitHub Actions (`deploy.yml`).
- Ponto de restauração: `backup/pre-v4.17-2026-10-17` apontando para `7e1b98d` (main antes do merge).
- Resultado: deploy do merge (run `39003543585`) concluído com sucesso em 17/10/2026 às 05:04 UTC. `version.json` do site publicado mostra o commit `62219f0` (`https://tenkiter-catalogo.onrender.com/version.json`). O `admin.html` no ar já contém o novo texto e não tem mais o `<details>` de "Mais detalhes".
- Um segundo run de Deploy do mesmo commit (`39004832640`) ficou em andamento depois; não foi disparado pelo Okou e precisa ser conferido.

## 9. Plano de ação — capturas de teste no celular (17/10/2026)

Recebidas 12 capturas do Pablo (`IMG_20261016_2252xx` a `2330xx`). Abaixo: o que cada uma pede, o estado real e em qual lote entra. Os lotes são feitos de uma vez para evitar várias idas ao GitHub.

### 9.1 Avaliação por foto

| Foto | Pedido do Pablo | Estado | Onde mexer |
|---|---|---|---|
| 01 | Tirar a aba "Pedidos" (fica dentro de Cadastrar) e o botão duplicado "➕ Cadastrar nova peça" abaixo do menu | Não feito (cartão `card-pedidos` ainda no ar) | `admin.html` |
| 02 | Lista de estoque: busca não responsiva no celular; filtros em menu expansível (ao clicar em procurar abre, ao sair recolhe); cores e categorias visíveis; tipografia dos cards feia; botões Editar/Stories/Link/Postar cortados | Não feito | `admin.html` (CSS/markup da lista) |
| 03 | Em "Nova postagem", o padrão deve ser **Story** (não Feed) | Não feito | `admin-postagens.js` |
| 04 | "Ver como vai ficar" sempre aberto; enquadramento inicial **Encaixar (fundo desfocado)** | Não feito | `admin-postagens.js` |
| 05 | Remover o texto longo da prévia; as 3 opções de enquadramento (Cortar / Encaixar / Com margens) lado a lado, embaixo da prévia | Não feito | `admin-postagens.js` |
| 06 | Remover a seção "Zoom da foto" (barra e texto); permitir girar com dois dedos; checkbox "Mover a foto com o dedo" marcado = trava a foto; desmarcado = arrasta a foto quando só os textos estão selecionados | Não feito | `admin-postagens.js` |
| 07 | Textos da prévia com o mesmo comportamento do editor de visuais: tocar no texto, aumentar/diminuir com dois dedos, arrastar, editar só aquele campo | Não feito | `admin-postagens.js` |
| 08 | "Cadastrar várias peças": o limite de 8 não deve aparecer (cada foto vira uma peça); permitir salvar vídeo para depois juntar produtos | Parcial: a regra de lote já está no `main` (v4.17), mas a captura mostra "0 de 8" e o alerta antigo, então é provável que o celular ainda esteja com a versão anterior (cache). Vídeos por lote dependem do backend | `admin.html` + `Code.gs` (vídeos) |
| 09 | Foto única com o X: em vez de mostrar "Essa é a única foto…", tratar como arquivar a peça (com confirmação) | Não feito | `admin.html` / `index.html` (lista e catálogo) |
| 10 | Categorias e tamanhos: mostrar todas as opções como chips (igual aos tamanhos); cores e estampas sem campo de texto livre (só o Admin edita a lista, com ordem); "Vídeo da peça" vira o passo 2 e aceita mais vídeos além das 8 fotos | Não feito. Cores/estampas: a lista vem do admin, falta esconder o texto livre para não admin | `admin.html`; vídeos múltiplos com `Code.gs` |
| 11 | "Mais detalhes" sai; Descrição, Gerar com IA e Novidade ficam à vista, logo acima do botão Salvar | Parcial: o `<details>` foi removido no `main` (v4.17), mas a captura ainda mostra o cabeçalho, portanto é versão antiga. Confirmar no celular | `admin.html` |
| 12 | Pedido de fotos/vídeos repetidos com menu compacto (usar as fotos 10 e 11 como referência) | Mesmo conteúdo das 10 e 11 | — |

### 9.2 Lotes de execução (ordem sugerida)

**Lote A — Cadastro (admin.html), um PR só** (fotos 01, 08, 09, 10, 11)
- Remover `card-pedidos` do topo e o botão duplicado "Cadastrar nova peça" (foto 01).
- Chips de categoria e tamanhos sempre visíveis; cores e estampas sem texto livre para não admin (foto 10).
- Vídeo da peça como passo 2 (foto 10).
- Confirmar a v4.17 no celular (fotos 08 e 11) antes de mexer de novo.
- Foto única + X = arquivar (foto 09), em `admin.html` (lista/formulário) e `index.html` (catálogo).

**Lote B — Estoque (admin.html)** (foto 02)
- Busca responsiva, filtros em menu expansível que recolhe ao sair, cores e categorias visíveis, tipografia e botões dos cards.

**Lote C — Postagens (admin-postagens.js)** (fotos 03 a 07), um PR só
- Story por padrão; "Ver como vai ficar" aberto; Encaixar por padrão.
- Remover texto da prévia; três enquadramentos em linha.
- Remover o bloco de zoom; girar com dois dedos; checkbox de trava com comportamento novo.
- Editar textos da prévia tocando neles (mesmo comportamento do editor de visuais).

**Lote D — Backend + velocidade (exige Code.gs completo colado pelo Pablo)**
- Vários vídeos por lote (foto 08/10), migração de `Video_URL`.
- Velocidade de cadastro: liberar a tela logo após "Salvar" e mostrar a fila de envios (opção A da conversa de velocidade).
- Assinatura de foto e SEC-20 (pendências antigas).
- Só começar esse lote quando o Pablo colar o `Code.gs`. Enquanto isso, os lotes A, B e C são só front.

### 9.3 Como evitar esperas no GitHub
- PR só com `.md` agora pula a bateria de navegador (PR #15): fica verde em ~1 minuto.
- PR de código faz a bateria completa (~10 min). Por isso, cada lote é um PR só, com todas as mudanças dele.
- Deploy automático no merge está autorizado. Ponto de restauração antes de cada merge: `backup/pre-...`.
- Cópia em zip dos `.md` a cada atualização (enviada pelo chat).

### 9.4 Estado de publicação desta seção
- `main` em `dc7e267` (PR #13 v4.17, #14 docs, #15 CI rápido para `.md`).
- Nada das fotos 01 a 12 foi implementado ainda. Esta seção é só o plano.

## 17/10/2026 — v4.19 tamanhos/cores permanentes
- Front no ar (commit 1f2f595). Backend `catalogo-codigo-4.18.gs.txt` entregue ao Pablo: colar no Apps Script do catálogo + Nova versão; conferir `?action=versao` (`opcoesLista`).
- Pendente: Background Sync (Android/Chrome) para envios; revisar `postagens_*.py`; bateria completa só com autorização; pedir revogação do token Cloudflare `cfut_…`.

## 17/10/2026 (noite) — v4.20 pré-envio + opId
- Front: mídias sobem ao escolher; cadastro leva só dados + endereços; `opId` evita peça duplicada; ao minimizar, pacote final via fetch keepalive; app que fechou na hora de salvar reenvia sozinho (backend 4.19).
- Backend `catalogo-codigo-4.19.gs.txt` (substitui o 4.18) entregue ao Pablo: colar + Nova versão; conferir `opIdempotente`.
- Pendente: teste em celular real (minimizar durante vídeo grande); upload retomável em partes (multipart R2) só se vídeo grande continuar falhando; limpar mídia órfã; revisar `postagens_*.py` e `x_equipe.py`; bateria completa só com autorização; revogar token Cloudflare `cfut_…`.

## 17/10/2026 (noite) — Tenkiter-cofre
- Repositório privado `pablofonteneleadv/Tenkiter-cofre` anexado à sessão. Regra: toda entrega (`.gs.txt` + zip dos `.md`) também vai para lá, e o `.gs` mais novo DE LÁ é a base de qualquer edição de backend (regra completa na seção v4.21 do `CLAUDE.md`).
- Achado: o cofre tinha `catalogo-codigo-4.18` (base exata do 4.19) e `funcionario-3.15`; a cópia local do funcionário era a 3.8 (velha). Backend de funcionários atual = **3.15**.

## 17/10/2026 (noite) — v4.22 Consultar valor + busca respeitando filtro
- Feito: "Consultar valor" ponta a ponta (backend 4.20 + catálogo + sacola/pedido + Worker OG + Postagens + admin cadastro/lote), busca do admin respeitando Ativas/Esgotadas/Arquivadas, emoji dos botões Stories/Link/Postar. SW tk-3.13.0.
- Testes verdes: consultar_valor 43, admin_busca_status 10, backend_gs 615, worker_og 73, admin_gestao, jornada_lojista, pre_envio, opcoes_lista, juntar_admin, lote_falhas, selecao_botoes. Falhas antigas (não regressão): jornada_pedido (link completo), x_equipe (X de 1 foto).
- Pablo precisa colar `catalogo-codigo-4.20.gs.txt` no Apps Script do CATÁLOGO + "Nova versão".
- Próximo (checklist das imagens de 17/10): Postagens (Story/Encaixar padrão, prévia aberta, travar foto, girar, editar texto tocando), barra de lote responsiva, busca como menu expansível, remover duplicados do painel, vídeo como passo 2 do cadastro, remover "Mais detalhes", X da única foto = arquivar peça.

## 17/10/2026 (noite) — Postagens: travar foto, girar, textos por toque
- Feito: caixa "Travar a foto" (marcada), foto gira com 2 dedos, "Personalizar textos" por toque (escolhe, move, aumenta, gira; embaixo só o campo escolhido), sem texto explicativo; x_equipe.py corrigido (X da única foto já arquivava a peça).
- Backend 4.20 colado pelo Pablo e conferido (`consultarValor: true`).
- Falta da checklist: lote responsivo, busca expansível, duplicados do painel, vídeo no passo 2, remover "Mais detalhes" (conferir se já sumiu), categorias visíveis.


## 18/10/2026 — preço ,99/,49, cadastro que não prende, fila de Postagens com regras, Colagem, Gerar imagens
- Pedido do Pablo (12 imagens + texto). Backend: `catalogo-codigo-4.21.gs.txt` (colar à mão; conferir `?action=versao` → `precoTerminacao: true`). Worker `tenkiter-ig` com regras da fila: publicado pelo `deploy.yml` no merge. Service worker `tk-3.15.0`.
- Feito: botão "Enviar para consultor TM🧡" (WhatsApp da loja); preço sempre ,99/,49 no à vista (front + backend); opções (categoria/cor/tamanho) definitivas, só Admin total cria; aviso "Ainda falta N peça" só quando a mídia ainda sobe; `nav.js` termina cadastro leve em qualquer tela + histórico;
  Postagens: prévia leve (meia resolução), foto centralizada e travada ao trocar, toque com folga, largura da caixa, "Fazer em todos", fila por tipo com regras (pausa 22:00–06:30, intervalo mínimo por tipo, só gestor edita), ▲▼/🕐/⏭, "Agora mesmo" discreto com confirmação, seletor rápido de dia/hora, 🧩 Colagem, 🖼️ Gerar imagens (Postar reaproveita).
- Testes passando: `postagens_fila.py` 49, `postagens_colagem.py` 26, `postagens_v425.py` 16, `postagens_admin.py` 102, `postagens_v49.py` 71, `postagens_toque.py` 28, `visual_v58/59/60`, `editor_visual`, `editor_toque`, `worker_ig.js` 260, `backend_gs.js` 615, CI local (JS/HTML/segredos/workers).
- Limites honestos: gestos de 2 dedos só simulados; se o SO matar o navegador, o cadastro leve retoma só ao reabrir; pausa padrão ligada (22:00–06:30) é decisão minha (o gestor muda na aba 🛡️ Regras); "Fazer em todos" cobre texto, não o enquadramento da foto.
- Pendente: bateria completa (só com autorização do Pablo); "Horário só deste" da Postagem livre ainda usa o seletor nativo; pedir ao Pablo para revogar o token Cloudflare `cfut_…` (vale até 01/12/2026).
