# ATUALIZAÇÃO MAIS RECENTE — catálogo v3.3 (backend) + site v3.4

> Tudo que está abaixo desta seção (títulos "v4 / v2", "Atualização 3" etc.) é o **histórico** das atualizações antigas, mantido como registro. Os arquivos `Code-*.gs.txt`, `tenkiter-codigo-v2.1.gs.txt` e `Code-treinamento-*.gs.txt` citados lá são antigos: **não use**. Os atuais são `catalogo-codigo-3.3.gs.txt` e `funcionario-codigo-3.0.gs.txt`.

**Nada apaga dados: só acrescenta abas/colunas. Ordem importa.**

1. **Site primeiro (já publicado pelo Claude).** O site novo funciona também com o backend antigo (pedido segue só pelo WhatsApp, painel sem as telas novas). Nada quebra se você demorar no passo 2.
2. **Backend do catálogo** — Apps Script do *catálogo*: apague todo o código, cole o conteúdo de **`catalogo-codigo-3.5.gs.txt`** (já inclui o 3.2, 3.3 e 3.4), salve; *Implantar → Gerenciar implantações → lápis → Nova versão → Implantar* (a URL não muda). Aceite as permissões se o Google pedir.
   - Conferir: abra `<URL do Apps Script>?action=versao` — deve aparecer `"versao":"catalogo-3.5"`, `"pedidos":true`, `"categoriasGestao":true`, `"pushCompleto":true`, `"conexoes":true`, `"conexoesOnesignal":true`, `"metricasAvancadas":true` e `"dispositivos":true`.
   - **Números reais com filtros (novo no 3.5):** Gestão → 📊 Números reais → período (7/30/90 dias ou datas), **horário do dia (opcional)**, dias da semana, app ou navegador, aparelho, de onde veio, categoria e gênero; mostra também quantas pessoas instalaram o app e quantas têm aviso ativo. Os dados de aparelho/origem só existem a partir do dia em que o site novo entrou no ar (antes aparece "Não informado"); a aba **Dispositivos** da planilha é criada sozinha e guarda só um código aleatório por aparelho (sem nome nem telefone).
   - No painel, na lista de peças aparece o aviso "⚠️ peças sem código": toque em **Gerar códigos agora** uma vez (as peças antigas sem código ganham `TK-####`; os códigos que já existem não mudam).
   - Quem tinha WhatsApp de 10 dígitos na planilha precisa entrar de novo **uma vez** (mudança da v3.0 — igual ao portal).
3. **Pixel / API de Conversões (quando quiser; o resto funciona sem isso).** Painel → *Integrações*: cole o ID do Pixel (só números) e, se for usar a API de Conversões, o token da Meta (fica só no servidor, nunca volta para a tela). Vazio = tudo desligado e o aviso de cookies nem aparece.
4. **Instagram / Facebook / Google.** Painel → *Integrações* → copie o endereço do catálogo (CSV) e cadastre na Meta (Gerenciador de Comércio) / Google Merchant. A loja do Instagram depende da aprovação da Meta; postagem automática continua desligada (decisão do projeto).
5. **Cloudflare / Render (melhora o Google e o catálogo da Meta):** o Worker v2 **já está publicado** (10/10/2026) e `/p/<código>` no seu domínio já usa a versão nova. As regras Rewrite de `/feed.csv`, `/feed.xml` e `/sitemap.xml` **já foram criadas no Render** (10/10/2026) e o `sitemap.xml` estático saiu do repositório; falta só você cadastrar o sitemap no Google Search Console e o feed na Meta/Google Merchant (passo 5 de `og-worker/LEIA-ME.md`). A lista rápida fica desligada (ainda não ganha velocidade).

6. **Avisos (notificações) no celular — leia `LEIA-ME-AVISOS.md`.** Dois passos seus: (a) no **OneSignal**, ligar a plataforma **Web** (Site URL `https://tenkitermodas.com.br`) — sem isso nenhum aviso chega; (b) no Apps Script, conferir as propriedades `ONESIGNAL_APP_ID` e `ONESIGNAL_REST_API_KEY`. Depois, o roteiro de teste no seu Android/iPhone está no mesmo arquivo.

**Segurança — faça hoje:** apague do chat/arquivos qualquer token da Cloudflare, chave da API do Render e chave do Gemini que tenham sido colados em conversas; gere novos se precisar. Nada disso deve ir para o GitHub (o repositório é público).

**O que o cliente passa a ter:** sacola com formulário e código de pedido (`PED-0001`), acompanhar pedido com o código + 4 últimos números do WhatsApp, favoritos e "pedir lista" pelo WhatsApp da loja, app instalável, catálogo que abre sem internet, política de privacidade.
**Novo na v3.2/v3.4:** o botão de compartilhar manda a **foto ou vídeo que está na tela** (não só a capa) e o link abre a peça nessa foto; categorias com campo visível, sugestões já cadastradas, ✎ corrigir e × apagar (só Admin total, só com login — o PIN antigo não vale para isso); "Nome da peça" sugere peças parecidas. Depois de colar o 3.2 no Apps Script, o painel liga sozinho os botões novos de categoria. O Worker da Cloudflare (`og-worker/worker.js`) precisa ser publicado de novo para a miniatura acompanhar a foto escolhida (`og-worker/LEIA-ME.md`).
**Novo na v3.3/v3.4 (avisos e app):** no **fim do site** agora tem "Instale o app" (Android e iPhone, com o botão certo para cada um); o app convida a **ativar os avisos** logo depois de instalar; "Compartilhar seleção" com favoritos manda um **link que abre exatamente as peças escolhidas** (`?sel=…`) e a lista com preços; o cliente pode **ser avisado quando o pedido mudar de etapa**.
**O que o lojista passa a ter:** a **Central de avisos** (Gestão → 📢): enviar para todos, quem instalou o app, interesse, equipe, alunos, perfil, acesso, pessoas específicas ou o cliente de um pedido, com `{nome}`, imagem, agendamento, prévia, modelos próprios, histórico com entregues/cliques e checklist do que falta configurar; pedidos com etapas e mensagem pronta de WhatsApp, números reais, importar/exportar CSV, lote de categoria/estoque, avisos com modelos e histórico, Story em vídeo (teste no seu celular; veja o parecer que o painel dá), integrações.

---

# TENKiTER — Acesso unificado (v4 / v2): como atualizar sem derrubar nada

**Ordem importa. Faça na sequência. Nada apaga dados: a migração faz backup antes.**

## 1. Script de treinamento (planilha de funcionários)
1. Abra o Apps Script do treinamento → substitua TODO o código por `scripts/Code-treinamento-v4.0.gs.txt`.
2. Implantar → Gerenciar implantações → editar a implantação atual → **Nova versão** (a URL não muda).
3. No editor, rode **`migrarParaAcessosUnificados`** (aceite as permissões). Cria as colunas `Perfil` e `perm_...`, as abas `Perfis`, `Permissoes`, `Acessos_Log`, e converte cada Nível antigo: 1=Novato, 2=Estagiário, 3=Funcionário, 10=Admin total.
4. Rode **`diagnostico`** e confira: "Admins totais ativos" ≥ 1. Se for 0, coloque TRUE em `perm_gerir_acessos` na sua linha.

Nesse ponto os sites antigos continuam funcionando normalmente.

## 2. Script do catálogo
1. Substitua TODO o código do Apps Script do catálogo por `scripts/tenkiter-codigo-v2.1.gs.txt` → **Nova versão** na implantação atual.
2. Rode `diagnostico`. O **PIN antigo continua valendo** (convivência) — ninguém fica sem acesso.

## 3. Site (GitHub)
Envie para o repositório, substituindo: `treinamentos.html`, `admin.html`, `index.html`, `common.js` (pasta `site/`). Depois faça o deploy no Render (se não subir sozinho, me peça que eu disparo).

## 4. Configurar as pessoas
1. Entre no portal com seu WhatsApp e senha → **Painel do RH / Admin → Acessos**.
2. Por pessoa: escolha o **perfil** (marca as permissões sozinho) e, em **Permissões**, marque/desmarque individualmente (✱ = diferente do padrão do perfil).
   - Perfis: Cliente, Aluno, Novato, Estagiário, Funcionário, **Equipe do site** (só catálogo, sem portal), Encarregado, Admin, Admin total.
3. Quem só usava o PIN do catálogo precisa de uma conta (**+ Nova pessoa** ou o próprio cadastro no portal) e do perfil certo.

## 5. Endurecer (só depois de tudo conferido)
- Catálogo: rode **`desligarPinLegado`** quando todos que mexem no admin já tiverem login. (Voltar: `religarPinLegado`.)
- Treinamento: rode **`fecharListaPublica`** (some a lista pública de funcionários). Só rode depois de o site novo estar no ar e os aparelhos terem recarregado.
- Depois: `migrarSenhasParaHash` (embaralha as senhas; recusa rodar com a lista aberta).
- Agende `fazerBackupAgora` toda semana (Acionadores) nos dois scripts.

## O que muda para cada tipo de pessoa
- **Cliente**: pode criar conta no catálogo (ícone 👤) — favoritos e sacola ficam salvos. Sem conta, o catálogo funciona como sempre.
- **Aluno/Novato/Estagiário/Funcionário**: portal por permissão de manual; catálogo só onde o perfil libera.
- **Equipe do site**: entra no admin do catálogo, **não** no portal de aprendizagem.
- **Admin total**: painel Acessos, histórico de quem mudou o quê.

## Observações
- Login único: o mesmo WhatsApp+senha vale no portal, no admin e no catálogo; a sessão é compartilhada entre as páginas.
- Favoritos entre aparelhos são **unidos** (nada se perde); remover um favorito em um aparelho pode reaparecer se outro aparelho ainda o tiver.
- Trava anti-tentativa: 8 senhas erradas bloqueiam aquele WhatsApp por 15 min (quem já está logado não é afetado).
- Conteúdo dos manuais ainda está embutido na página (bloqueio de nível é visual). Restringir o conteúdo de verdade é um passo futuro.
- Se `ADMIN_PIN` nunca foi definido no catálogo, o admin está aberto enquanto o PIN antigo estiver ligado — desligue-o.

---
## Atualização: miniatura do perfil + até 8 fotos e 1 vídeo por peça

Arquivos que mudaram: os 2 scripts, `treinamentos.html`, `admin.html`, `index.html`.
1. Script do treinamento → cole `Code-treinamento-v4.0.gs.txt` → Implantar > Gerenciar implantações > lápis > **Nova versão**.
2. Script do catálogo → cole `tenkiter-codigo-v2.1.gs.txt` → **Nova versão**. Na 1ª vez que salvar um vídeo, o Google pode pedir para autorizar o acesso ao Drive: aceite.
3. Suba `treinamentos.html`, `admin.html`, `index.html` no GitHub (substituindo) e aguarde o deploy do Render.
Fotos de perfil antigas: o portal converte o link sozinho, não precisa reenviar.
Vídeo: MP4/MOV/WEBM, até 20 MB, 1 por peça. Fotos extras: até 8, além da principal.

---
## Atualização 3 (filtro de perfis, Aluno/Cliente, salvar em segundo plano, galeria com setas, link do Render)
Mesmos 6 arquivos: 2 scripts (Nova versão nos dois) + manual.html, admin.html, index.html no GitHub.
Depois de atualizar o script do treinamento, rode UMA vez a função `converterNovatosEmAlunos` (Executar) para quem hoje está "Novato" virar "Aluno".
