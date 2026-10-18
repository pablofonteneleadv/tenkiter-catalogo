# okou.md — Estado do projeto e Pendências concretas

Documento de passagem para outra inteligência (ou pessoa) assumir o trabalho. **Reescrito em 18/10/2026** (revisão geral dos `.md`): as seções antigas de 17/10 (plano das 12 fotos, estado da branch v4.17, "main está em …") eram histórico já superado e foram removidas; o que ainda vale está aqui. O detalhe técnico de cada versão fica no `CLAUDE.md`.

**Como manter este arquivo:** a lista da seção 3 é a ÚNICA fonte de pendências. Ao concluir um item, apague-o (não marque como feito). Ao receber um pedido novo do Pablo, acrescente-o. Não deixe "Pendente" espalhado em outros arquivos — aponte para cá.

## 1. Regras obrigatórias (valem sempre)

1. **Deploy do frontend e dos Workers é pelo GitHub**: PR → check "Portão de qualidade" verde → merge (squash) na `main` → `.github/workflows/deploy.yml` publica o site (Render) e os 3 Workers (Cloudflare) sozinho. Sem pedir confirmação ao Pablo (regra dele de 17/10/2026). Não existe deploy manual no Render nem pelo MCP do Render (regra de 18/10/2026). Depois do merge: conferir `https://tenkiter-catalogo.onrender.com/version.json` (campo `commit` = commit do merge), dar `grep` por uma string nova no arquivo publicado e **conferir que os jobs `Publicar tenkiter-ig/midia/og` do deploy estão `success`** (`skipped` = falha silenciosa; foi o bug que o PR #34 corrigiu).
2. **Ponto de restauração antes de cada merge**: branch `backup/pre-<tema>-<data>` apontando para a `main` atual (`git push origin <sha-da-main>:refs/heads/backup/pre-<tema>-<data>`; criar a ref pela API REST é bloqueado pelo proxy).
3. **Backends Apps Script não sobem sozinhos**: o Pablo cola o `.gs.txt` completo no editor e faz "Nova versão". Entregar sempre arquivo COMPLETO, com o número da versão no nome, no cabeçalho, em `VERSAO_*` e no `?action=versao` (os quatro iguais). A fonte-base dos `.gs.txt` é o repositório privado `Tenkiter-cofre`; **antes de editar compare `?action=versao` ao vivo com o cofre — o maior vence** (ver pendência A1). Nunca entregar versão menor que a do ar.
4. **Zip dos `.md`** (`CLAUDE.md` + `okou.md`) a cada atualização: enviar ao Pablo no chat e copiar para o cofre em `md/okou-md-<data>.zip`.
5. **Bateria completa** (`python3 tests/rodar_tudo.py`, Playwright): roda sozinha à noite no GitHub (03:00 UTC) e localmente só quando o Pablo pedir. PR comum roda só o CI rápido.
6. Nunca credenciais no repositório (público), em log ou em teste: chaves só em Propriedades do Script / variáveis de ambiente / secrets do GitHub; testes usam chaves INVENTADAS. Não remover funcionalidade existente (pode melhorar, mover, renomear).

## 2. Estado atual (conferido em 18/10/2026)

- **Site**: `main` no commit do PR #39 (revisão geral dos `.md` + bateria sem falha silenciosa), deploy concluído e os 3 `Publicar` Workers em `success`; service worker `VERSAO = tk-3.16.0`. Para o commit exato, `version.json`.
- **Backends no ar** (`?action=versao`): catálogo **`catalogo-4.21`** (igual ao do cofre) e funcionários/RH **`3.16`** (o cofre só tem a 3.15 — ver A1).
- **Workers Cloudflare**: `tenkiter-ig` (importador, Postagens, fotos de clientes, Fotos com IA v1.5), `tenkiter-midia` (R2), `tenkiter-og` (miniaturas, sitemap, feeds) — publicados pelo deploy; os 3 `Publicar` deram `success` nos deploys dos PRs #34 e #38.
- **CI**: workflows em `ubuntu-24.04` (o GitHub migra `ubuntu-latest` para Ubuntu 26 em 19/10/2026). A bateria completa agendada de 18/10 (00:00 Fortaleza) terminou em FALHA; causa provável e correção na pendência C1.
- **Entregue e testado em 18/10/2026 (v4.27)**: seleção com validade (2 h/3 h) e placa "libera/segura"; sugestões e sinônimos na busca; chip flutuante de ação pendente; fotos avulsas e ordem nas Postagens; texto por foto com "Fazer em todos" desligado; 🎨 Fotos com IA (Worker + `admin-fotoia.js`, fila que espera a cota, instrução editável começando pela SKILL das capas de campanha). Detalhes em `CLAUDE.md` → v4.27.

## 3. PENDÊNCIAS CONCRETAS (lista única)

### A. Dependem do Pablo (Claude não consegue sozinho)

- **A1. Mandar o backend de funcionários 3.16.** O RH ao vivo é a 3.16 (módulo 0 verificado/certificados, PR #36 — alguém colou no Apps Script e o arquivo nunca chegou ao cofre); o cofre tem só a 3.15. Abra o Apps Script de funcionários, copie TODO o código e cole no chat (ou envie o arquivo `funcionario-codigo-3.16.gs.txt`). Até lá o Claude **não edita nem reentrega** o backend de funcionários (entregar a 3.15 seria voltar de versão). O catálogo está sincronizado (cofre = ao vivo = 4.21).
- **A2. Revogar o token da Cloudflare `cfut_…`** que foi colado no chat em 11/10/2026 (vale até 01/12/2026). Atenção: se o secret `CLOUDFLARE_API_TOKEN` do GitHub for esse mesmo token, **crie um token novo (Edit Cloudflare Workers + purge de cache), troque o secret e só então revogue o antigo** — senão o deploy dos Workers para. Vale também para QUALQUER chave colada em conversa (Render, OneSignal, Gemini, Instagram): revogue e guarde a nova só em 🔗 Conexões / cofre.
- **A3. Provar as 🎨 Fotos com IA com uma peça de verdade.** O sandbox não tem chave; o Worker foi testado contra um Google FALSO. Tocar em Ferramentas do gestor → 🎨 Fotos com IA → escolher uma peça → Colocar na fila, e contar o resultado ou a mensagem de erro. Modelos de imagem do Gemini costumam NÃO ter plano gratuito: se aparecer "O plano desta chave não inclui geração de imagens", o pedido fica esperando (6 h) e é preciso uma chave com faturamento ligado (ou aceitar o custo). A chave do Gemini é a mesma já colada em ⚙️ Instagram.
- **A4. Testar no celular de verdade o que só foi simulado**: gestos de 2 dedos (girar/zoom da foto e do texto) nas Postagens; editor de visuais com o dedo; minimizar o app no meio de um vídeo grande no cadastro; a placa "Antes de sair…" da seleção; a placa de avisos ao abrir o app instalado; entrega real de push no Android/iPhone (roteiro em `LEIA-ME-AVISOS.md`). **Homologação da fila de cadastro no Android** (marque cada item que funcionar, anote o que falhar): cadastro só com dados (1 vez só) · 1 foto · várias fotos · vídeo · alternar para o WhatsApp durante o envio · desligar a tela durante o envio · cortar e restaurar a conexão (sem duplicar) · fechar e reabrir o painel (fila recuperada) · resposta perdida depois de gravar (confirma a peça existente, sem duplicar). Também: conferir uma peça “Consultar valor” nas Postagens (arte e legenda).
- **A5. Primeira postagem real no Instagram** (se ainda não foi feita) só com o OK dele, começando por um Story; o token precisa de `instagram_business_content_publish`.
- **A6. Ver o resultado da bateria da noite de 19/10** (Actions → CI → execução agendada → anotações). Se algum teste falhar, o nome aparece como anotação `::error`.
- **A7. Branches com trabalho NÃO mesclado, para decidir** (nada foi apagado e o Claude NÃO consegue apagar branch: o proxy do GitHub devolve 403 em `DELETE git/refs` e em `git push --delete`): `auditoria/2026-10-15` (1 commit: `docs/AUDITORIA-2026-10-15.md`), `claude/claude-plugins-official-marketplace-qujvod` (PR #1 fechado sem merge: skill copiada de plugin), `fix/deploy-buildcommand-purge` e `fix/v4.11-correcoes-painel` (PRs #7 e #5 fechados sem merge; patches de 16/10, superados), `pablofonteneleadv-patch-1` (upload de 16/10 com `common (1).js`; sem PR mesclado), `pablofonteneleadv-patch-4` (PR #20, ver abaixo). Se não quiser nenhum deles, apague pela página de branches do GitHub (ícone de lixeira) ou ligue o workflow da A9.
- **A8. PR #20 ("Add files via upload", `pablofonteneleadv-patch-4`)**: sobe `docs/catalogo-4.16.gs.txt` e `docs/funcionario-3.15.gs.txt` — versões velhas e **backend dentro do repositório público**, contra a regra de segurança (o scan de segredos barra `.gs`). O Claude fechou o PR com um comentário explicando; para reabrir, basta reabrir no GitHub.
- **A9. Apagar as 46 branches obsoletas** (lista em §5, dentro de “Branches para apagar”). São 33 branches de PRs JÁ MESCLADOS (o conteúdo está na `main`), 12 backups de 15–17/10 e 1 branch antiga sem PR (mais `docs/branches-bloqueio-2026-10-18`, deste PR, depois do merge); a sessão do Claude não tem permissão de apagar (403). Duas saídas, escolha uma: (1) em github.com/pablofonteneleadv/tenkiter-catalogo → Settings → General → marque **“Automatically delete head branches”** (as próximas somem sozinhas no merge) e apague as atuais pela lixeira em *Branches*; ou (2) autorize o Claude a criar um workflow manual `limpar-branches.yml` (usa o `GITHUB_TOKEN` do próprio GitHub, só apaga a lista aprovada) — o Claude não criou esse atalho por conta própria porque contornaria uma trava da sessão.

### B. Pedidos do Pablo AINDA NÃO FEITOS (lote de 18/10/2026, 03:25)

Nada abaixo foi implementado. Fazer em etapas pequenas, cada uma por PR + deploy, na ordem sugerida. Referências de código: `admin-postagens.js` (`htmlColagem_`, `colRender_`, `compor()`, `itensEfetivos`, `layoutItens`, `desenharTemplate`), `instagram-worker/worker.js` (módulo "regras v1.4", `CFG_POST_PADRAO`, `intervaloHumanoMs`, `canal`/`canalUsaInstagram_`), `admin.html` (cadastro: `#galeria-grid`).

1. **Sliders Tamanho / Largura / Girar** (item e): muito juntos; ao deslizar mexe no vizinho. Linhas de ≥ 44 px de altura com espaço entre elas, alça maior, `touch-action: pan-y` só fora da alça. (Rápido, só front.)
2. **Emojis (😱😍…) não arrastam** (item d): o texto só com emoji não gera caixa tocável (largura/medida do canvas). Garantir caixa mínima e reconhecimento de toque nesses itens.
3. **Limite de postagens por canal/tipo** (item f): hoje `max24h` (90) conta tudo junto e só o canal Instagram/Ambos. Passar a contar **individualmente por canal e tipo** (Instagram: story, reels, carrossel, feed; WhatsApp: status; "ambos" conta nos dois), cada um com seu máximo configurável na aba 🛡️ Regras. Worker + painel.
4. **Intervalos aleatórios** (item h): em vez de um intervalo fixo por tipo, uma faixa mín–máx por tipo (ex.: Story 2–5 min), sorteada a cada postagem ("revezando"). `intervaloHumanoMs` já sorteia; falta configurar a faixa na aba Regras e usar no escalonamento.
5. **Colagem** (itens a e b): zoom/mover/girar cada foto dentro da colagem (com "Travar a foto" ligado por padrão); mais modelos de colagem; tela própria para escolher o modelo com **pré-visualização** e editar lado a lado; rótulos legíveis no lugar de "0,0,0.5,1".
6. **Seleção de fotos numerada** (item c): a numeração segue a ordem; arrastar para reordenar; **miniatura na proporção do tipo** (story 9:16, feed 4:5, carrossel…) — a colagem de 3 fotos aparece feia na miniatura atual.
7. **Pergunta "terminou de editar as fotos?"** (item g): ao rolar para baixo (perto de Legenda/Quando), perguntar se terminou e se quer **gerar as fotos finais para revisão e postagem** (`htmlGerar_`).
8. **Postagem de várias peças juntas** (item i): selecionar mais de um produto na lista; as fotos aparecem abaixo, todas juntas, cada uma com as informações da sua peça; "Fazer em todos" pergunta **"todas deste produto" ou "todas de todos"**.
9. **Miniaturas do cadastro como serão exibidas** (item j): no cadastro da peça, as miniaturas refletem o formato do site e da postagem (site otimizado para story/feed; as artes do Gemini usam isso); tocar abre uma **janela flutuante** para posicionar/girar/dar zoom já vendo story, feed e carrossel. Provável solução: gravar o enquadramento (crop) como JPEG no canvas e substituir a foto; é a maior das etapas — combinar o desenho com o Pablo antes.

### C. Dívida técnica e correções conhecidas

- **C1. Bateria completa da madrugada falhando.** Causa provável: `backend_gs.js`, `backend_contas.js` e `backend_func.js` leem o `.gs.txt`, que não está no GitHub — nunca poderiam passar lá. Corrigido no PR de 18/10/2026 (`tests/rodar_tudo.py` pula esses testes sem `.gs.txt` e lista os pulados; entram na bateria os testes novos que estavam de fora; cada falha vira anotação `::error`). Falhas conhecidas de antes, não revalidadas: `jornada_funcionaria.py` ("progresso foi enviado ao servidor"), `selecao_link.py`, `rolagem_infinita.py`. Se a noite de 19/10 ainda falhar, abrir as anotações e corrigir. Testes que oscilam (passam e falham em rodadas diferentes): `postagens_admin.py` e `story_video.py` (este só com a máquina carregada) — estabilizar as esperas.
- **C2. Conteúdo protegido, fase 2** (treinamentos): `treinamentos.html` ainda traz 3 manuais embutidos (`app-data`) e o RH responde `listaFechada:false`. Falta tirar os manuais do HTML, fechar o GET público `manuais_lista`/`config_quiz` no backend RH e só então trocar/rotacionar o token antigo (após o Pablo aprovar o mapa de ações do RH). Depende de editar o RH (A1).
- **C3. `curriculos.html`** ainda não tem o padrão tolerante (`TKOcupado`, tempo limite nas gravações, abertura que não cai no login com servidor lento) — `treinamentos.html`, `nav.js` e `admin.html` já têm.
- **C4. "Horário só deste"** da Postagem livre ainda usa o seletor nativo `datetime-local`; trocar pelo seletor de dia/hora (`htmlPicker_`).
- **C5. Indicador persistente de envio mais completo** no cadastro (hoje: plaquinha `#envios-flut` + histórico leve).
- **C6. Guardar a escolha do modelo de Colagem por aparelho.**
- **C7. SEC-20 e assinatura de foto** (restrição de formato/tamanho no upload assinado): exigem editar o catálogo (`Code.gs` completo colado pelo Pablo). Hoje só o vídeo é assinado (`assinarUploadVideo_`).
- **C8. Story em vídeo**: se o celular do Pablo só gerar WebM/VP9, converter para MP4 H.264 (ex.: Cloudinary). Ainda não implementado.
- **C9. Miniatura de `?sel=` no WhatsApp** é a genérica da loja; um `/s/` no Worker `tenkiter-og` daria miniatura por seleção.
- **C10. Lista rápida** (`/lista.json` do Worker) está DESLIGADA de propósito (~1,1 s, igual ao Apps Script); só ligar com cache de borda (KV).
- **C11. Mídia órfã no R2**: foto/vídeo que subiu no pré-envio e foi tirada depois fica no R2 (o limite de custo do Worker protege); apagar do R2 ao excluir peça (o Worker já tem `DELETE`).
- **C12. Escada para sair do Apps Script/Cloudinary** (só com pedido do Pablo, um passo por vez): migrar mídia antiga do Cloudinary, D1 + gravação dupla com a planilha, tirar o catálogo do Apps Script. Upload retomável em partes (multipart R2) só se vídeo grande continuar falhando.
- **C13. GitHub Actions**: aviso de Node 20 nas actions (`checkout@v4`, `setup-node@v4`, `setup-python@v5` rodam forçadas em Node 24); revisar versões. Os workflows ficam em `ubuntu-24.04` até validar Chromium/Playwright no Ubuntu 26.
- **C14. Auditoria de telas ainda NÃO feita** (usar o guia `claude/guia-para-fazer-auditoria-de-qualidade.md` do Projeto; antes de editar: relatório com as 3 caixas — fazer / contra ordem do Pablo / não vale — e ponto de restauração): `curriculo.html` (ordem dos passos, CPF explicado, erros em frase, retomar de onde parou), `curriculos.html` (ver C3), painel do RH e telas do aluno em `treinamentos.html`, `privacidade.html`, `404.html`, rodapé e `nav.js` (nomes iguais em todas as páginas), janelas (Minha conta, Esqueci a senha, Conexões/Cofre, Central de avisos, Postagens, Fotos de clientes, Produtos para aceitar) e o formulário de cadastro de peça.
- **C15. Padronização visual e de nomes** (liberado pelo Pablo como “só ajustes”): sistema único de tipografia, espaçamento, raios e sombras (só `--laranja-txt` em texto; botão laranja = letra preta); o mesmo nome para a mesma coisa em todas as telas (“Minha seleção”, “Pedido” × “Pedidos”, “Peça” × “Produto”); painel do lojista agrupando avisos por urgência com os indicadores do dia no topo; contraste ≥ 4,5:1 e alvo de toque ≥ 44 px nas telas da C14. “Última!” no card ficou mantido (pergunta sem resposta).
- **C16. Editor de visuais das Postagens — o que falta**: gesto de pinça (2 dedos escala/gira) e seleção múltipla; textura orgânica (papel/tecido) da identidade como elemento; alças fora da borda da imagem são cortadas pelo canvas; o código JSON mostra a posição “base” do elemento aberto até ele ser resolvido; desfazer pode perder o ajuste por formato (caso raro); avaliar se a pergunta “nos dois ou só neste formato” incomoda (ex.: lembrar a última resposta); conferir os 10 visuais prontos com foto inteira. Tudo isso só foi simulado, nunca testado com dedo de verdade (A4).

## 4. Como rodar os testes

```
cd tenkiter-catalogo
bash scripts/ci/check_js.sh
python3 scripts/ci/check_html.py
python3 scripts/ci/check_workers.py
bash scripts/ci/check_secrets.sh
python3 -m http.server 8765 &            # servidor local (guarde o PID; não use pkill -f com texto do próprio comando)
export TK_BASE=http://localhost:8765/
# Playwright (uma vez): python3 -m venv /tmp/pwenv && /tmp/pwenv/bin/pip install playwright pillow && /tmp/pwenv/bin/python -m playwright install chromium
/tmp/pwenv/bin/python tests/foto_ia.py    # um teste só
python3 tests/rodar_tudo.py               # bateria completa (~25 min); só com autorização do Pablo
```

- Testes de backend (`backend_gs.js`, `backend_contas.js`, `backend_func.js`, `backend_v316.js`) precisam do `.gs.txt` na raiz do repositório ou em `../tenkiter-cofre`; sem ele a bateria pula e avisa.
- Testes de Worker (`worker_ig.js`, `worker_midia.js`, `worker_og.js`, `worker_canal.js`) usam Node 22 (`node:sqlite`) e Cloudflare/Instagram/Google FALSOS.
- `TK_BASE=https://tenkiter-catalogo.onrender.com/` testa o site publicado.

## 5. Branches e pontos de restauração (revisado em 18/10/2026)

- `main` é protegida. Branches de PRs já mesclados continuam existindo no GitHub até alguém apagar (pendência A9: a sessão do Claude recebe 403 ao apagar). O conteúdo delas já está na `main`; para recriar uma, `git push origin <sha-do-head-do-PR>:refs/heads/<nome>` (SHA em `gh api repos/pablofonteneleadv/tenkiter-catalogo/pulls/<n> --jq .head.sha`).
- `restauracao-antes-auditoria-2026-10-11` fica para sempre (ponto de restauração anterior à auditoria de 11/10).
- Pontos de restauração `backup/pre-*` a MANTER (18/10/2026): `pre-sem-render-2026-10-18` (4867eb4), `pre-fila-colagem-2026-10-18` (747927e), `pre-selecao-fotoia-18-10-2026` (2829cb6), `pre-workers-skipci-2026-10-18` (7a59409), `pre-ubuntu-docs-2026-10-18` (98dc611), `pre-docs-bateria-2026-10-18` (8fbca91), `pre-docs-branches-2026-10-18` (a54b59c).
- Branches com trabalho NÃO mesclado a manter até decisão: ver A7.
- Tag não sobe (proxy dá 403); por isso o ponto de restauração é sempre branch.

<details><summary>Branches para apagar (A9) — 46 no total</summary>

**Backups antigos de 15–17/10 (12)** — todos dentro do histórico da `main`: `backup/pre-admin-lote-busca-2026-10-17`, `backup/pre-auditoria-2026-10-15`, `backup/pre-cadastro-rapido-2026-10-17`, `backup/pre-categorias-chips-2026-10-17`, `backup/pre-cofre-2026-10-17`, `backup/pre-compartilhar-selecao-2026-10-17`, `backup/pre-consultar-valor-2026-10-17`, `backup/pre-opcoes-lista-2026-10-17`, `backup/pre-postagens-toque-2026-10-17`, `backup/pre-pre-envio-2026-10-17`, `backup/pre-ux-2026-10-16-2206`, `backup/pre-v4.17-2026-10-17`.

**PRs já mesclados (33, incluindo `docs/revisao-pendencias-2026-10-18`, o PR #39) + 1 antiga sem PR (`infra/ci-cd-deploy-versionamento`, anterior à `main`)**: `ci/fixar-ubuntu-24-04-2026-10-18`, `ci/portao-docs-rapido`, `docs/cofre-2026-10-17`, `docs/md-copia-zip-2026-10-17`, `docs/okou-2026-10-17`, `docs/revisao-pendencias-2026-10-18`, `docs/sem-instrucao-render-2026-10-18`, `feat/admin-lote-busca-2026-10-17`, `feat/categorias-chips`, `feat/consultar-valor-2026-10-17`, `feat/fila-regras-colagem-2026-10-18`, `feat/galeria-upload-paralelo`, `feat/lote-cadastro-velocidade`, `feat/opcoes-lista`, `feat/postagem-multicanal-wafly`, `feat/postagens-toque-2026-10-17`, `feat/pre-envio-opid`, `feat/selecao-sugestoes-fotoia-18-10`, `feat/upload-fila-cadastro-midia-v4.17`, `fix/ci-portao-espera-testes`, `fix/compartilhar-selecao-2026-10-17`, `fix/deploy-b2`, `fix/v4.10-correcoes-painel`, `fix/worker-ig-v11`, `fix/workers-publicar-skip-ci-2026-10-18`, `infra/ci-cd-deploy-versionamento`, `pablofonteneleadv-patch-2`, `pablofonteneleadv-patch-3`, `pablofonteneleadv-patch-321`, `pablofonteneleadv-patch-5`, `pablofonteneleadv-patch-6`, `perf/ci-tests-seletivos-2026-10-17`, `trabalho`, `treinamento-modulo0-verificado`.

SHAs dos backups, caso um dia precise recriar: `pre-auditoria-2026-10-15` 9d432d7 · `pre-ux-2026-10-16-2206` 1511f5b · `pre-v4.17-2026-10-17` 7e1b98d · `pre-cadastro-rapido-2026-10-17` af252d2 · `pre-categorias-chips-2026-10-17` 8c50830 · `pre-opcoes-lista-2026-10-17` 2a413c6 · `pre-pre-envio-2026-10-17` e1af9c7 · `pre-cofre-2026-10-17` 277d96c · `pre-consultar-valor-2026-10-17` d2bdb05 · `pre-postagens-toque-2026-10-17` a63b49b · `pre-admin-lote-busca-2026-10-17` 9759970 · `pre-compartilhar-selecao-2026-10-17` b770b55.

</details>

## 6. Histórico resumido (17–18/10/2026)

- **17/10**: v4.17 (campos de cadastro visíveis, várias peças sem teto de 8 por lote); CI/CD enxuto (PR #16); v4.18–v4.20 (cadastro rápido, filtro por cor, opções definitivas, pré-envio + `opId`); cofre privado `Tenkiter-cofre`; v4.22 "Consultar valor"; v4.23 Postagens (foto travada, girar, textos por toque); v4.24 barra de lote e busca expansível.
- **18/10 (madrugada)**: v4.25/v4.26 — preço sempre ,99/,49 (backend 4.21), cadastro que não prende a pessoa, fila de Postagens com regras (pausa 22:00–06:30, intervalos por tipo), 🧩 Colagem, 🖼️ Gerar imagens.
- **18/10 (manhã)**: instruções de deploy no Render removidas; módulo 0 verificado do treinamento (PR #36, RH 3.16); v4.27 (PR #37) no ar; PR #34 corrigiu a publicação dos Workers pelo deploy; PR #38 fixou `ubuntu-24.04`; revisão geral dos `.md`, remoção dos pacotes de patch já aplicados (`patches/tenkitermodas-v3.11` e `v4.10`) e dos `.gs.txt` locais velhos.
