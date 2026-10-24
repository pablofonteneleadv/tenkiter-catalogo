# Changelog

Todas as mudanças relevantes do site TENKiTER Modas.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento [SemVer](https://semver.org/lang/pt-BR/).

<!-- novas versões entram logo abaixo desta linha -->

## 7.2.1 — escolher início e visão do tutorial — 2026-10-24

- O editor abre em modo de preparação e só cria etapas depois de “Começar a gravação daqui”; a preparação é repetida silenciosamente para o aluno.
- A prévia permite escolher a visão de Cliente, Aluno, Novato, Estagiário, Funcionário, Equipe do site, Equipe catálogo, Encarregado, Admin, Admin total ou Responsável RH.


## 7.2.0 — gravação rápida de tutoriais — 2026-10-24

- Cliques gravados passam a executar normalmente, permitindo abrir menus e continuar gravando dentro deles.
- O modo rápido registra cliques, seleções e textos digitados sem abrir o formulário a cada ação; campos recebem validação exata automaticamente.
- Ao encerrar, todas as etapas aparecem numa planilha editável. Textos flutuantes aceitam tamanho, cores, borda, posição, negrito, itálico e sublinhado.


## 7.1.4 — atualização garantida do editor — 2026-10-24

- Os arquivos do editor recebem versão na URL para o celular descartar a cópia antiga imediatamente.

## 7.1.3 — editor de tutoriais sempre visível — 2026-10-24

- O editor deixa de depender da existência de um manual com capítulo de prática e passa a aparecer sempre para quem pode gerir manuais.

## 7.1.2 — sessão preservada entre áreas — 2026-10-24

- Uma rejeição de sessão pelo RH não apaga mais o login válido do Catálogo e da Gestão.
- Quando uma sessão antiga precisa ser convertida, o portal explica que basta entrar uma vez e mantém as opções da barra inferior.

## 7.1.1 — gravador de tutoriais — 2026-10-24

- O RH pode gravar um tutorial escolhendo controles diretamente numa prévia da tela real, escrever orientação e observação, ordenar etapas e definir a regra de acerto.
- O modo de teste destaca a etapa, bloqueia a ação verdadeira e informa o erro imediatamente. Tutoriais publicados aparecem para a equipe e registram acertos, erros e duração.
- Novo backend RH 3.21 guarda tutoriais, versões e resultados com a mesma permissão usada para gerir manuais.

## Pacote 1 — menu, pesquisa e filtros — 2026-10-23

- **Menos coisa antes do primeiro produto.** Gênero e categorias passam a viver num único bloco recolhido no celular (aberto no desktop) e a faixa de vantagens nasce fechada no celular. A vitrine aparece antes, sem 22 controles no caminho.
- **A grade não pula mais ao carregar.** A caixa da foto reserva a altura antes de a imagem chegar (aspect-ratio) e as faixas de pílulas têm altura mínima — o CLS cai de 0,18 para menos de 0,10.
- **Cartão mais limpo e mais baixo.** As duas ações ficam lado a lado em qualquer tela e a categoria saiu do cartão (ela já aparece na pílula selecionada e na janela da peça).
- **Barra inferior só no celular.** No desktop (a partir de 900px) a barra de compra sai de cena e o espaço que ela ocupava volta para a página. No celular ela continua com Início · Buscar · Seleção · Atendente.
- **Nada de letra miúda.** Código do produto, categoria e rótulo da barra inferior têm piso de 12px.
- **"Limpar filtros" sempre à vista** quando há filtro ativo — antes, no celular, ele ficava escondido dentro da gaveta fechada.
- **Categorias repetidas juntadas.** "Blusa" e "Blusas", "Vestido" e "Vestidos", "Conjunto" e "Conjuntos", "Short" e "Shorts" passam a aparecer uma vez só, na forma com mais peças (mapa de sinônimos aplicado na leitura, sem mexer na planilha).
- **Cache-busting** `?v=` em catalogo.js, vitrine.js e vitrine.css, para o navegador não servir a versão antiga.

## Enquadramento por gestos — 2026-10-22

- A foto abre maior e os ajustes ficam recolhidos. Arrastar, pinçar e girar continuam disponíveis; desfazer e aplicar a todas ficam à vista.


## Treinamento protegido — 2026-10-22

- Manuais passam a vir somente da sessão autorizada; conteúdo embutido e cache legado removidos. Configuração de provas usa POST protegido quando o RH anuncia suporte.


## Fotos com IA — 2026-10-21

- Planejar até 20 looks, dividir em grupos de até dois ou três respeitando quatro referências, trocar peças por arrasto/teclado e retomar somente o restante após falha parcial.

- Cada resultado guarda as peças e preços à vista usados no pedido; legenda e link da seleção podem ser copiados numa seção recolhível.

## Capa de vídeo — 2026-10-21

- No cadastro, reproduzir o vídeo e escolher um quadro como nova foto de capa, preservando fotos e vídeo até salvar.


## Em revisão — cadastro (2026-10-21)

- Duplicação mantém nome e atributos, sem mídia; padrões se aplicam somente a cadastros novos.
- A primeira escolha de outro gênero substitui o padrão automático; escolhas seguintes permitem múltiplos gêneros.
- Pendências de envio permanecem acessíveis e o retorno ao menu aguarda confirmação de sucesso.


## [Não publicado] - 2026-10-18 (v4.27)

### Adicionado
- **Seleção com validade**: a seleção de peças expira em 2 h sem uso (3 h se o cliente toca em "segura minha seleção"); ao tentar sair aparece a placa "Libera a seleção / Segura, volto já já / Continuar vendo a loja" (vale também para link `?sel=`).
- **Busca com sugestões**: enquanto digita, mostra peças e categorias que têm resultado; se não existe igual, mostra "Não achei igual" e sinônimos (camisa/camiseta/blusa…).
- **Painel**: ação pendente de conexão vira um chip flutuante (sem `alert`); "O que postar" aceita fotos e vídeos avulsos do aparelho com a ordem escolhida; com "Fazer em todos" desligado, editar o texto vale só para a foto selecionada.
- **🎨 Fotos com IA** (gestor e equipe do site): o Gemini gera uma capa de campanha a partir de 1–4 fotos reais da peça, com instrução editável pelo gestor; sem cota o pedido espera na fila e roda quando a cota volta. **Ainda não foi provado contra o Google real** (modelos de imagem costumam não ter plano gratuito).

### Corrigido
- **Publicação dos Workers pelo deploy** (PR #34): com `skip_ci` os jobs `Publicar …` ficavam *skipped* e nenhum Worker era publicado desde 16/10/2026.

### Alterado
- Workflows fixados em `ubuntu-24.04` (o GitHub migra `ubuntu-latest` para o Ubuntu 26 em 19/10/2026).
- Documentação revisada: versões dos backends (catálogo 4.21, RH 3.16), fim das instruções de colar versões antigas, pendências reunidas em `okou.md`; pacotes de patch já aplicados (`patches/tenkitermodas-v3.11`, `v4.10`) removidos.

## [Não publicado] - 2026-10-18

### Adicionado
- **Treinamento "verificado" (módulo 0, só administrador)**: checagem rápida dentro da lição (sem nota; só libera
  "Confirmo que li" depois de acertar), perguntas da *regra de ouro* na prova (`[CRÍTICA]`: errou uma, não passa),
  aba **Prática & Certificados** para a gestão validar a prática (fica registrado quem e quando), certificado com
  código e QR (sem nota, sem CPF) e página pública `verificar.html`. Novos arquivos: `tm-verificado.js`,
  `verificar.html`, `vendor-qrcode.js` (qrcode-generator 1.4.4, MIT).
  **Só liga quando o backend RH 3.16 anuncia `certificados` em `?action=versao`**; manuais 1 a 3 não mudam.

## [Não publicado] - 2026-10-16

### Adicionado
- **Postagem multicanal (Instagram · WhatsApp · Ambos)**: seletor de canal na tela de postagem do
  painel. O contrato do canal passa a viver em `common.js` e o `POST /post` envia
  `canal=instagram|whatsapp|ambos`. Com `instagram` (padrão) o comportamento é idêntico ao de antes.
- **Integração Wafly (status do WhatsApp) no backend** (Apps Script 4.14 / 3.14, **fora do
  repositório**): envio server-side de texto e status com deduplicação, retry idempotente e validação
  de webhook. As credenciais `WAFLY_CLIENT_TOKEN`, `WAFLY_INSTANCE` e `WAFLY_TOKEN` ficam **apenas**
  nas Propriedades do Script — nunca no repositório, no frontend ou nos logs.

### Alterado
- **Cache do site**: `OneSignalSDKWorker.js` — `VERSAO` de `tk-3.11.0` para `tk-3.12.0`, para renovar o
  cache de `common.js` e `admin-postagens.js` em todos os aparelhos.

### Notas
- Histórico do passo a passo (Apps Script e as 3 propriedades da Wafly) em
  `patches/postagem-multicanal-wafly/como-aplicar.md`.

## [1.0.0] - 2026-10-15

### Adicionado
- **INFRA-01 — Pipeline de CI/CD**: GitHub Actions com scan de segredos, validação de sintaxe JS,
  checagem de estrutura HTML e a bateria de testes que já existia no repositório (`tests/`).
  Portão de qualidade obrigatório antes de qualquer deploy.
- **INFRA-02 — Deploy confiável**: deploy disparado pela API do Render dentro do CI, com
  acompanhamento até o status `live`, limpeza de cache no Cloudflare e verificação do commit
  publicado em `/version.json`. Substitui o fluxo manual (trigger + polling + curl na mão).
- **INFRA-08 — Versionamento**: `VERSION`, `CHANGELOG.md`, `version.json` publicado no ar e
  workflow de release que cria tag semver + GitHub Release.

### Notas
- Os backends `.gs` continuam fora do repositório (por segurança) e seguem com deploy manual
  no Apps Script — ver `docs/CI-CD.md`.
