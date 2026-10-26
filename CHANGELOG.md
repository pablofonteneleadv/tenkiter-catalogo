# Changelog

Todas as mudanças relevantes do site TENKiTER Modas.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento [SemVer](https://semver.org/lang/pt-BR/).

<!-- novas versões entram logo abaixo desta linha -->

## 7.23.0 — Cadastro: "Cadastrar UM produto" e "Cadastrar vários produtos" — 2026-10-26

- Menu Cadastrar com nomes que não se confundem:
  - "Cadastrar UM produto" (até 8 fotos e 3 vídeos, tudo no mesmo produto);
  - "Cadastrar vários produtos" (cada foto vira um produto, com o mesmo título, valor, tamanho e cor).
- Cada cartão tem um desenho pequeno: 3 fotos → 1 produto, ou 3 fotos → 3 produtos.
- Modo "vários produtos":
  - título e botão com o novo nome;
  - passo 1 "Fotos · uma por produto", com a contagem em produtos;
  - sem o "★ CAPA" e sem a dica de capa, que não se aplicam.
- Selo "novos" do Cadastrar legível (preto no laranja). Service worker renovado (tk-3.38.11).

## 7.22.0 — Mensagens: número do cliente, mesma pessoa nos 2 WhatsApp, encerrar conversas e nome do atendente — 2026-10-26

- Conversas que mostravam "tenkitermodas" ou "Tenkitermodas Reserva" (o nome do próprio WhatsApp da loja, gravado quando a primeira mensagem saía do celular) voltam a mostrar o número. Quando o cliente escrever, aparece o nome que ele colocou no WhatsApp. Mensagem enviada pela loja não dá mais nome à conversa.
- O número do cliente aparece sempre: sem nome, no lugar do nome e formatado; com nome, numa linha pequena junto da etiqueta do canal.
- Mesma pessoa nos dois WhatsApp (comparando com e sem o 9º dígito): sinal "Também no WhatsApp 2/1" na lista, faixa com "Abrir" na conversa e filtro "Nos 2 WhatsApp", em laranja quando há alguém.
- Encerrar conversas: uma pelo ⋯ da conversa, ou várias por ⋯ → "Selecionar conversas" (ou segurando o dedo numa conversa). Encerradas vão para o filtro "Encerradas", saem das contagens e voltam sozinhas quando o cliente escreve de novo. Dá para reabrir à mão.
- Nome do atendente antes da resposta: ligado por padrão, com o primeiro nome do cadastro ("*Ana:*" em negrito no WhatsApp; "Ana:" no Instagram). Cada atendente pode escrever o nome que quer ("Respondendo como Ana · Mudar nome", acima da caixa de mensagem). O Admin liga e desliga para todos em ⋯ → "Configurações (leitura e nome)…". A bolha enviada mostra o nome como rótulo.
- A busca da tela de Mensagens passava 24 px da coluna; corrigido.
- Worker: colunas `pessoa` e `encerrada_em` (criadas sozinhas), `outro_id` na lista, filtros `ambos` e `encerradas`, contagens `ambos`/`encerradas`, a rota `/msg/encerrar` e `/msg/config` com `assinatura` e `meuNome` (o nome de cada atendente). Service worker renovado (tk-3.38.10).

## 7.21.0 — Mensagens: aba Todas, Espiar e leitura no celular; aviso de versão nova — 2026-10-26

- Mensagens: aba mestre "Todas" (WhatsApp 1, WhatsApp 2 e Instagram juntos), que é a que abre, com a etiqueta do canal em cada conversa. Novo filtro "Lidas" ao lado de "Não lidas".
- "Espiar" nas conversas não lidas: mostra as mensagens sem marcar como lida, nem no painel nem no celular oficial. Uma faixa avisa que está espiando, e "Atender" libera a resposta e marca como lida.
- Abrir uma conversa normalmente passa a marcar como lida também no celular oficial: WhatsApp pela Wafly (`modify-chat`, e `read-message` se ele não for aceito) e Instagram com o "visto". Antes o site nunca confirmava a leitura no aparelho.
- Configuração em ⋯ → "Leitura no celular…": liga e desliga por canal e mostra o resultado da última tentativa. Se o celular não confirmar, aparece um aviso uma vez por canal.
- Avisos da tela de Mensagens viraram um aviso flutuante: no celular, ficavam escondidos enquanto a conversa estava aberta.
- Todas as páginas: quando sai uma versão nova do site com a página aberta, aparece a faixa "Saiu uma versão nova do site · Atualizar". Ela nunca recarrega sozinha.
- Worker: `/msg/conversas?canal=todos`, filtro `lidas`, `/msg/lida` com `celular:true` e `/msg/config`. Service worker renovado (tk-3.38.9).

## 7.20.0 — Mensagens: quem mandou cada mensagem no grupo — 2026-10-26

- Grupos do WhatsApp na tela de Mensagens: cada mensagem mostra quem mandou (nome do WhatsApp e número; sem nome, só o número), com uma cor por pessoa, como no WhatsApp. Antes não dava para saber quem tinha escrito.
- Menções "@266124864270572" viram "@Nome" quando a pessoa já falou no grupo.
- Grupo não mostra mais "Foi resposta a um story? Ver stories no ar" em toda mensagem; nas conversas individuais continua.
- Worker de mensagens: grava o autor das mensagens de grupo (colunas `autor_nome`, `autor_fone` e `autor_lid`, criadas sozinhas). A prévia da conversa mostra "Nome: texto" e a exportação mostra o nome no lugar de "cliente".
- Vale para mensagens que chegarem depois da publicação: as que já estavam gravadas não têm o autor, porque ele não era guardado.

## 7.19.0 — Ferramentas do gestor reorganizadas — 2026-10-26

- Ferramentas em grupos (Vendas e clientes, Conteúdo, Planilha e histórico, Sistema), cada uma com ícone, título e uma linha dizendo para que serve. Antes eram onze botões de cores diferentes. Os botões e as permissões continuam os mesmos, e o grupo some quando a pessoa não tem nenhuma ferramenta dele.
- Números do topo no padrão do painel. "Peça mais vista" mostra o código e o nome da peça; antes aparecia "Ver produto" sem ser link quando a peça não tinha código.
- Pedidos com cabeçalho neutro (era laranja forte) e o botão Atualizar com ícone.
- Janelas (Auditoria, Central de avisos, Números reais, Importar, Postagens, Fotos com IA, Mensagens, Conexões) com o mesmo cabeçalho: ícone no título, botão fechar de 44 px e abas com a escolhida em preto.
- Campos de busca, data, telefone e senha com 44 px em todo o painel. Na Auditoria, a busca tinha 22 px.
- Importar planilha: botão "Escolher arquivo" em português, mostrando o nome do arquivo (o navegador mostrava "Choose File").
- Números reais: cartões sem emoji e com o número em preto.
- Configurações avançadas e Log em blocos com título; ação principal preta e secundária com borda, lado a lado no computador.
- Painel: modos do "Editar peças" e opção marcada do "Alterar preços" em preto; formulário com ícone nos botões de foto e vídeo, o passo "9 Descrição e destaque" e o Cancelar com borda.
- Páginas da equipe no mesmo padrão (`acabamento-equipe.css`): Currículos, Treinamentos e Painel do RH (o modo escuro continua) e o formulário público "Trabalhe com a gente".
- Privacidade e Exclusão de dados no mesmo padrão; o service worker guarda `acabamento-equipe.css` (tk-3.38.8).
- Loja, acessibilidade: a lista de sugestões da busca tinha botões de "Refinar" e o link do WhatsApp dentro da lista anunciada ao leitor de tela, o que é inválido. Agora só as opções ficam na lista; "Ver as N peças" passa para antes do Refinar.
- Testes antigos atualizados para a loja e os manuais atuais: `filtros_facetas` e `filtros_v66` (chips com contagem), `filtro_menu_rolagem` (o corpo do painel é que rola), `selecao_vida`, `manual_rico` e `modulo0_verificado`.

## 7.18.0 — "Editar peças" rápido e filtro por valor — 2026-10-26

- "Editar peças" (só dados, sem foto) salva todas as peças numa chamada só (`updateLote`, servidor catálogo 4.28). Antes era uma chamada completa por peça, e 20 peças demoravam o mesmo que 20 cadastros com foto. Se uma peça for recusada, só ela fica com erro e "Tentar de novo"; se o grupo não passar (rede, servidor antigo), cada peça segue pelo envio normal. Com o servidor 4.27, nada muda.
- "Escolher peça para copiar": filtro por valor (cada valor cadastrado com a contagem; "Consultar valor" por último) e ordem "Menor valor" / "Maior valor".

## 7.17.0 — acabamento novo no painel de gestão (Opção A) — 2026-10-26

- Painel no mesmo padrão da vitrine (`acabamento-admin.css`): ícones de linha no lugar dos emojis em "O que fazer agora", Cadastrar, busca, Filtros, cartão da peça, menu ⋯ e barra de seleção; cantos de 6–8 px, bordas finas, sem sombra, escolha marcada em preto.
- Cabeçalho de uma faixa (58 px) com a marca à esquerda; faixa do CPF e conteúdo com a mesma largura no computador (antes ia de ponta a ponta).
- Cartão da peça: Editar como botão principal e Stories/Link/Postar em grade 2×2 no celular, todos com 40 px; menu ⋯ com 44 px por item.
- Barra inferior da equipe (todas as páginas) com ícones de linha.
- Erros que já existiam: "Envios e pendências" não aparece mais vazio no meio do painel; botão "✂ Enquadrar" da miniatura com 32 px de toque (tinha 27); selo "novos" legível (era laranja sobre laranja); 15 escapes Unicode de cinco dígitos trocados pelo caractere.
- Testes antigos atualizados para o cadastro atual (tamanho pela etiqueta, público "Homem"): `cadastro_plano_mestre`, `jornada_lojista`, `enquadrar_cadastro`, `admin_busca_status`.
- Mesmas funções, mesma ordem e mesmos textos; service worker renovado (tk-3.38.7).

## 7.16.0 — copiar de outra peça, ordem alfabética e filtros — 2026-10-26

- Cadastro, passo 3: botão "Copiar dados de outra peça" sempre à vista e as 3 parecidas com foto embaixo do nome. A tela cheia "Escolher peça para copiar" abre nos últimos cadastrados, com busca por nome ou código, filtros de situação, público e categoria (com contagem), ordem (mais recentes/A–Z) e fotos grandes. Tocar na peça copia todos os dados dela, com Desfazer; ✎ abre a peça para editar.
- Cores e categorias em ordem alfabética no cadastro (também depois de criar uma opção nova; "Consulte…" por último) e gravadas assim na peça.
- Loja: Tamanho e Cor já abrem expandidos nos filtros; filtros em ordem A→Z de verdade; Blusa/Conjunto/Short/Vestido não somem mais do menu.
- Loja: fechar a peça com o botão voltar não leva mais a lista ao topo; botões da barra de seleção com 44 px numa linha.

## 7.15.1 — "Editar peças" com "Consultar valor" — 2026-10-26

- A janela "Editar peças" recusava "Preço inválido" em peças "Consultar valor": reenviava o preço 0 sem a marca. Agora a peça segue como "Consultar valor" quando o preço não é alterado (também ao tocar em "Tentar de novo" nos envios que falharam).

## 7.15.0 — acabamento novo da vitrine (Opção A) — 2026-10-26

- Ícones de linha (`icones.js`) no lugar dos emojis no cabeçalho, busca, filtros, cards, peça, seleção, favoritos, barra inferior e rodapé.
- Nova camada `acabamento.css`: escala única de texto, cantos de 6–8 px, bordas finas, sem sombras, selos em preto.
- Preço em preto: "R$ x à vista" e "Normal R$ y", sem o riscado que parecia promoção em todas as peças.
- Card com "Consulte esta peça" como botão principal e "Selecionar" como ação secundária; estoque com ponto de cor e texto.
- Peça aberta: Favoritar, Compartilhar e Selecionar numa linha leve e "Consultar no WhatsApp" inteiro, sem caixa alta.
- Cabeçalho de 56 px com botões de 44 px; a busca fica encostada nele (sumiu a faixa vazia ao rolar).
- Filtros do desktop com campos inteiros (sem "Buscar por produ" e "Mín R" cortados).
- Mesmas funções, mesma ordem e mesmos textos de ação; service worker renovado (tk-3.38.5).

## 7.14.2 — IA insiste quando o Gemini está sobrecarregado — 2026-10-26

- "Gerar com IA" (foto): com o Gemini sobrecarregado (503, "high demand", demora), o painel tenta de novo sozinho, com espera crescente, até 12 vezes; mostra o andamento e tem botão Cancelar.
- Chave recusada ou cota de todos os modelos esgotada param na hora, com frase clara.
- Nada de JSON cru na tela. Funciona com o servidor 4.25; o 4.26 (Cofre) também troca de modelo, do mais barato ao mais caro, em cada tentativa.

## 7.14.1 — correção urgente do cadastro — 2026-10-26

- Cadastro, edição em lote, excluir, avisos e fila offline voltavam "WhatsApp ou senha incorretos" com a pessoa logada: a sessão nova (tk3) ia sem o WhatsApp do dono. O painel agora completa o WhatsApp a partir da própria sessão.
- O envio que termina em outra tela do app (nav.js) também manda o WhatsApp.

## 7.13.0 — editor gráfico de tutoriais — 2026-10-25

- Editar abre uma prévia em tela cheia com Anterior/Próxima, escolha visual do alvo e edição do texto flutuante na tela.
- Alterações são aplicadas à lista ao confirmar e descartadas ao cancelar; salvar/publicar continua explícito.
- Gestão das etapas responsiva com ações à esquerda e instruções multilinha.
- Protege etapas contra eventos antigos e remove cliques automáticos de recuperação.
- Valida digitação ao encerrar a edição e compara preços numéricos antes do ajuste do campo.


## 7.12.1 — marcador de tutorial reutilizável — 2026-10-25

- Remove a escolha de curso do tipo “Conteúdo dentro de um capítulo”.
- Permite reutilizar o mesmo código de atividade em qualquer manual e capítulo do Google Docs.
- Mantém a escolha de curso somente para a parte prática exibida ao final.

## 7.12.0 — atividades dentro dos capítulos — 2026-10-25

- Permite definir cada tutorial como curso independente, parte prática final ou conteúdo de um capítulo.
- Gera um marcador copiável `[[TUTORIAL:id]]` para inserir em qualquer ponto do Google Docs.
- Faz a conclusão do capítulo depender de todos os itens presentes: atividade interativa e checagens rápidas.
- Mantém tutoriais antigos vinculados ao manual como parte prática final.

## 7.11.1 — tutoriais dentro dos cursos do Docs — 2026-10-25

- Carrega os manuais autorizados antes de abrir o gravador, sem depender da ordem em que a tela de treinamentos terminou de iniciar.
- Exibe cada manual do Google Docs no campo “Onde aparece”, ordenado e sem duplicações.
- Mostra uma ação de nova tentativa quando a lista de cursos não puder ser carregada.

## 7.11.0 — cursos interativos e híbridos — 2026-10-25

- Substitui as páginas antigas de prática pelo gravador de atividades integrado aos cursos.
- Permite publicar uma atividade como curso interativo independente ou como parte prática de um manual do Google Docs.
- Registra conclusão, versão, acertos, correções, duração e data no servidor, com cópia local para resistir a falhas momentâneas de conexão.
- Mostra relatório de conclusão à gestão e confirmação ao aluno no próprio curso.
- Guarda o arquivo escolhido durante a gravação e oferece o mesmo arquivo para download durante a atividade.
- Compacta cartões e espaçamentos da tela de treinamentos para reduzir rolagem no celular.
- Adiciona a opção desmarcada “Arquivar após cadastrar” para peças criadas apenas em testes.


## 7.3.6 — gravador móvel compacto — 2026-10-24

- Substitui o cabeçalho alto por uma barra compacta de estado e quatro controles, reduzida ainda mais depois que a gravação começa.
- Divide a criação de texto em edição e posicionamento: a formatação fica recolhida e, ao posicionar, o painel vira uma faixa pequena para liberar a tela.
- Mantém comandos rápidos para editar, salvar ou cancelar enquanto a caixa é arrastada sobre a aplicação.

## 7.3.5 — menu inferior visível no tutorial — 2026-10-24

- Preserva o posicionamento `fixed` e `sticky` do elemento destacado, incluindo a navegação inferior do celular.
- Usa a altura visual dinâmica do navegador para gravação e teste em tela cheia, acompanhando abertura e fechamento das barras móveis.
- Mantém a placa de orientação dentro da área visível e fora do botão solicitado.

## 7.3.4 — etapas humanas, gravação e teste em tela cheia — 2026-10-24

- Impede que cliques automáticos usados para recompor menus sejam aceitos como ação do funcionário e pulem etapas do tutorial.
- Permite inserir, formatar e posicionar textos flutuantes sem encerrar a gravação rápida.
- Gravação e teste ocupam a tela inteira, com barra de controle compacta e a aplicação usando todo o espaço restante.
- Adiciona regressão específica para garantir que a etapa 3 só avance depois do toque real.

## 7.3.3 — seletor de foto e textos arrastáveis — 2026-10-24

- O toque no quadro visível de foto/arquivo passa pelo bloqueio do tutorial e abre câmera ou galeria; a validação continua ocorrendo somente depois da escolha real do arquivo.
- Etapas de arquivo aparecem como `Escolher foto/arquivo`, em vez de `Preencher`.
- Caixas de instrução aceitam posição por arraste no editor, guardam coordenadas, aparecem sobre a tela demonstrada e também podem ser movidas durante o tutorial.

## 7.3.2 — identidade correta dos controles do tutorial — 2026-10-24

- O jogador confirma que o elemento encontrado pelo seletor ainda corresponde ao nome do controle gravado, impedindo que uma posição antiga destaque outro botão ou uma caixa de dicas.
- Quando a estrutura da tela mudou, o controle correto é procurado pelo nome acessível; números dinâmicos entre parênteses não invalidam a correspondência.
- A etapa só aceita a ação no controle identificado corretamente e deixa de avançar por colisões de seletores antigos.

## 7.3.1 — jogador de tutorial estável — 2026-10-24

- A indicação passa a acompanhar o elemento no documento e não fica mais presa ao topo da tela quando o alvo sai da área visível.
- Rolagens suaves concorrentes são interrompidas; o jogador relocaliza, centraliza e aguarda o alvo estabilizar antes de liberar a etapa.
- Elementos recriados dinamicamente por formulários, modais e abas são resolvidos novamente pelo seletor da etapa.

## 7.3.0 — auditoria filtrável e recuperação geral do tutorial — 2026-10-24

- A auditoria usa a sessão atual completa, eliminando o falso erro de PIN para contas autenticadas.
- O histórico pode ser filtrado por data inicial, data final e vários usuários ao mesmo tempo, além da pesquisa por produto, código ou ação.
- O jogador de tutoriais recupera sequências de menus, modais e painéis em qualquer setor ao procurar ações anteriores visíveis até reencontrar o alvo.

## 7.2.6 — alvo visível e tela correta no tutorial — 2026-10-24

- O tutorial só posiciona o destaque quando o controle está realmente visível; campos escondidos deixam de enviar a seta para o cabeçalho.
- Se a tela necessária não terminou de abrir, a última ação de abertura é restaurada e o alvo é centralizado antes de mostrar a orientação.
- A placa “TOQUE AQUI” fica ao lado do controle, escolhendo automaticamente espaço acima ou abaixo sem sair da tela.

## 7.2.5 — indicação visual inequívoca — 2026-10-24

- A etapa destaca o cartão inteiro com contorno azul e branco pulsante, escurece o restante da tela e mostra a placa “👉 TOQUE AQUI”.
- Tutoriais antigos que apontam para um texto interno passam a destacar automaticamente o botão ou cartão clicável que contém esse texto.

## 7.2.4 — fotos e cartões no gravador — 2026-10-24

- Escolher uma foto vira uma única etapa e é validado pela presença real do arquivo, inclusive nos tutoriais gravados antes desta correção.
- Cartões de menu, como Cadastrar e Cadastrar nova peça, são capturados como controles completos e recebem uma borda de foco mais forte durante o teste.

## 7.2.3 — tutorial bloqueia toque fora da etapa — 2026-10-24

- Durante o teste, somente o controle destacado da etapa atual responde; tocar em outro botão não navega nem executa a ação.
- Quando a próxima tela ainda está abrindo, o tutorial bloqueia a interface e procura novamente o alvo automaticamente.

## 7.2.2 — sessão compartilhada em todos os módulos — 2026-10-24

- Postagens, Foto IA, Instagram, fotos de clientes, telemetria e upload R2 passam a aceitar a sessão compartilhada `tk3` já emitida pelo login atual.
- A prévia do gravador de tutoriais mantém o administrador autenticado ao abrir Postagens, sem pedir um segundo login.

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
