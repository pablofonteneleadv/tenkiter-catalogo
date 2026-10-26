# Menu Cadastrar: "UM produto" e "vários produtos" — 26/10/2026

Pedido do Pablo (print do menu): "Deixe mais claro isso. Vamos trocar o conceito pois estão se confundindo. Cadastrar UM produto: até 8 fotos e 3 vídeos para o mesmo produto cadastrado (tudo junto). Cadastrar vários produtos: você escolhe várias fotos, mesmo título, valor, tamanho, cor e sai cada foto com esses dados em produtos separados. (...) facilitar a compreensão sem ocupar muito espaço."

Tarefa humana: escolher o caminho certo antes de começar o cadastro.

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência em `cadastro-tipos-20261026/`: `antes-390.png`, `menu-390.png`, `menu-320.png`, `menu-1280.png`, `varios-passo1-390.png`.

## O que mudou
- **Cadastrar UM produto** — "Até 8 fotos e 3 vídeos, tudo no mesmo produto". O texto segue os limites reais do formulário: 8 fotos e 3 vídeos de até 20 MB.
- **Cadastrar vários produtos** — "Cada foto vira um produto, com o mesmo título, valor, tamanho e cor".
- No lugar do ícone, cada cartão tem um desenho pequeno: três fotos → **1** produto, ou três fotos → **1 2 3** produtos. A diferença aparece sem precisar ler a frase. O desenho fica escondido do leitor de tela, porque o texto já diz o mesmo.
- No modo "vários produtos":
  - o título do formulário passa a ser "Cadastrar vários produtos" e o botão, "Cadastrar os produtos";
  - o passo 1 se chama "Fotos · uma por produto", com uma linha embaixo explicando, e a contagem mostra "(3 produtos)";
  - somem o "★ CAPA" e a dica "A primeira foto é a capa", que confundiam porque ali cada foto é um produto.
- Selo "novos" no título Cadastrar: o texto branco no laranja tinha contraste 2,8:1; passou a preto no laranja. Problema antigo, encontrado pelo axe nesta revisão.

## Medições
- 390 px: cada cartão com até 96 px de altura (antes ~72). O texto ocupa 2 linhas.
- 320 px: o desenho encolhe para 50 px de largura e os cartões ficam com até 120 px. Não há rolagem horizontal e nada passa da borda.
- 1280 px: os cartões ficam com uma linha só.

Testes: `cadastro_tipos` (novo, 16 verificações, axe no menu) e os que passam pelo menu/cadastro: `consultar_valor` (43), `cadastro_plano_mestre`, `equipe_catalogo1` (17), `pre_envio` (21), `instagram_admin` (97), `capa_video`.

Resultado: APROVADO. Os textos e o desenho são estáticos e não dependem de serviço externo. Não foi visto num Android real.
