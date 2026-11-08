# TENKiTER — padrões obrigatórios do site (a "constituição")

Atualização: 08/11/2026. Vale para toda pessoa e toda IA que mexe em interface, textos ou regras de dados.

**Princípio (decisão do dono, Pablo):** o TENKiTER é **UM site com vários módulos**. Cada módulo reaproveita o mesmo botão, a mesma janela, o mesmo aviso, a mesma cor e a mesma regra. Quem precisa de algo parecido **usa o componente dono**; não escreve outro. Padrão novo ou exceção entra **aqui primeiro** (seção 7), nunca dentro do CSS/JS de um módulo.

**Como o CI confere** (barato, sem esperar a plataforma inteira):

| Camada | O que é | Quando roda |
|---|---|---|
| `scripts/ci/check_padroes.py` | regras estáticas por texto (Python puro, ~2 s) com **catraca**: dívida antiga está em `scripts/ci/padroes-baseline.json`; o check só falha se a contagem **sobe**, ou **desce** sem o baseline descer | toda PR (job estático) |
| `tests/padroes_check_teste.py` | testa o próprio check (casos que falham e que passam) | toda PR (job estático) |
| módulo `padroes` do seletor | PR que muda **html, css ou js de interface** roda também `padrao_aparencia_ui`, `janelas_padrao`, `padrao_vocabulario`, `avisos_padrao`, `padrao_regras_dados` (Chromium, serviços simulados) | PR com arquivo de interface |
| `check_ux_skill.py` + skill `tenkiter-estetica-humana` | revisão humana/IA em 390 e 1440 px com evidência | toda mudança visual |

**Dívida conhecida e catraca.** `python3 scripts/ci/check_padroes.py --listar` mostra cada ocorrência. Ao corrigir uma, rode `python3 scripts/ci/check_padroes.py --atualizar` (o baseline só aceita descer). Subir exige `--aceitar-aumento` e justificativa na PR: é exceção, siga a seção 7. Nunca apague regra nem teste para a PR passar.

## 1. Janelas e camadas

| Tema | Padrão | DONO (um só lugar) | Proibido | Conferência |
|---|---|---|---|---|
| Comportamento | foco preso (Tab), Esc/Voltar fecham só a janela do topo, foco volta a quem abriu | `a11y.js` (`TKJanela.prender`) + `TKCamadas` (`common.js`: `empilhar`/`desempilhar`) | `keydown` de Esc próprio; `history.pushState` próprio para janela | `janelas_padrao.py` |
| Fechar | `class="tk-fechar"`: ✕ 44×44, contornado, canto superior direito, `aria-label="Fechar"` | `janelas.css` | botão de fechar com outro desenho/tamanho | `fechar-sem-tk-fechar` + `janelas_padrao.py` |
| Abas | `class="tk-abas"` + `role="tablist"`; aba ativa com `aria-selected="true"` (preto) | `janelas.css` | `role="tablist"` sem `tk-abas`; aba ativa só por cor | `tablist-sem-tk-abas` + `janelas_padrao.py` |
| Camadas | escala `--z-sticky … --z-aviso` | `janelas.css` (`:root`) | `z-index` numérico acima de 10 (0–10 só para empilhar dentro do próprio componente) | `z-index` |
| Travar o fundo | só a classe `html.tk-travado` | `janelas.css` | `body.style.overflow`, `fx-travado`, `body.x { overflow:hidden }` | `travar-fundo` |
| Pular para o conteúdo | `.tk-pular` ("Ir para o conteúdo"), criado por `a11y.js` | `a11y.js` + `janelas.css` | skip link próprio | `pagina-sem-padrao` |
| Foco | contorno 3 px laranja (`--tk-foco-cor`) | `janelas.css` / `tk-padrao.css` | `outline:none` sem substituto; foco de outra cor | `janelas_padrao.py`, `padrao_aparencia_ui.py` |
| Toda página HTML | carrega `janelas.css`, `a11y.js` e `tk-padrao.css` | cada `.html` | página nova sem os três | `pagina-sem-padrao` |

## 2. Aparência

| Tema | Padrão | DONO | Proibido | Conferência |
|---|---|---|---|---|
| Cor | `--laranja` (preenchimento) e `--laranja-txt` (texto/contorno sobre claro, contraste 5,9:1) | `tk-padrao.css` (e `catalogo.css` onde o token nasce) | qualquer hex/`rgba()` de laranja ou marrom solto (`#E67E22`, `#A85200`, `#f39c12`…) | `laranja-solto` + `padrao_aparencia_ui.py` (R4) |
| Alvo de toque | mínimo 44×44 px (`--tk-alvo`); ação principal 48 px | `tk-padrao.css` | controle menor que 44 px (exceto link dentro de texto corrido) | `padrao_aparencia_ui.py` (R1) |
| Campo | 44 px de altura, fonte 16 px, raio 8 px (`.tk-campo`) | `tk-padrao.css` | campo com altura/fonte/raio próprios | R2 |
| Botão por papel | `.tk-btn-prim` (48 px, raio 8, texto escuro sobre laranja), `.tk-btn-sec`, `.tk-btn-perigo`, `.tk-btn-texto` | `tk-padrao.css` | novo botão laranja com raio/sombra/altura própria; texto branco sobre laranja | R7 |
| Chip | `.tk-chip`; marcado expõe `aria-pressed="true"` | `tk-padrao.css` | chip marcado só por cor | R6 |
| Selos | `.tk-selo` (texto) e `.tk-selo-foto` (sobre a foto) | `tk-padrao.css` | selo com raio/cor próprios | `padrao_aparencia_ui.py` |
| Busca | `input.tk-busca` (lupa à esquerda) | `tk-padrao.css` | caixa de busca com ícone próprio | `padrao_aparencia_ui.py` |
| Foto de produto | proporção 4:5 (`--tk-foto`) em vitrine, galeria e Gestão | `tk-padrao.css` | `aspect-ratio` ou altura fixa própria para foto | R5 |

## 3. Avisos, confirmações e operações demoradas

| Situação | Padrão | DONO | Proibido | Conferência |
|---|---|---|---|---|
| Resultado/feedback | `TKAviso.ok / info / aviso / erro` (região única `#tk-avisos`; erro não some sozinho; "Desfazer" quando reversível) | `avisos.js` | toast/barra de aviso próprios (`class="toast"`, `function toast`) | `toast-proprio` + `avisos_padrao.py` |
| Senha | `TKAviso.pedirSenha` (campo de senha) | `avisos.js` | `prompt()` pedindo senha | `prompt-senha` + `padrao_vocabulario.py` |
| Texto de erro | `TKAviso.textoErro` / `TKPadrao.erro` | `avisos.js` / `padrao-dados.js` | repassar `e.message` cru | `http-na-tela` |
| Plural | `TKAviso.plural` / `tkPlural` / `TKPadrao.plural` | `avisos.js` / `padrao-dados.js` | `n + ' produto(s)'` | revisão |
| Ação destrutiva | `confirm()` nativo dizendo a **consequência** ("Excluir 3 produtos? Não dá para desfazer.") | cada tela chama `confirm()` | confirmação por "toque de novo"; ação destrutiva sem pergunta | `padrao_vocabulario.py` ("toque de novo") |
| `alert()` | só para erro que **exige ação** ou texto longo a ler; a lista fechada está no baseline (`admin.html` 2, `curriculo.html` 2, `common.js` 1) | — | `alert()` para qualquer outro aviso | `alert` |
| Operação demorada | `TKOcupado.inicio('o que está fazendo')` e chamar o `fim()` retornado | `nav.js` | gravação longa sem `TKOcupado` (a pessoa perde dados ao sair) | revisão + testes do setor |

## 4. Dados e regras

| Tema | Padrão | DONO | Proibido | Conferência |
|---|---|---|---|---|
| Funções únicas | `TKPadrao.erro / telefone / contarFotos / dataHora / plural / descontoTxt` | `padrao-dados.js` (carregue antes de quem usa) | montar à mão telefone, data/hora (sempre Fortaleza), contagem de fotos ou frase de erro | `padrao-dados` + `padrao_regras_dados.py` |
| Erro ao usuário | português, sem JSON/HTTP cru, dizendo o que fazer | `TKPadrao.erro(e, 'frase padrão')` | `'HTTP ' + status`, `{"erro":...}`, `Failed to fetch` na tela | `http-na-tela` + `padrao_regras_dados.py` |
| Escrita idempotente | **chave de operação** (`opId`/`idLocal`) em toda escrita que pode ser reenviada | cada tela, conforme a skill `tenkiter-cadastro-assincrono` | reenvio que duplica produto/pedido/mensagem | testes do setor |
| Nomes novos | só **Admin total** cria nome de categoria/tamanho/cor/tecido (checagem **no código**, não só botão escondido) | tela + servidor | criar nome sem checar o perfil | `padrao_regras_dados.py` |
| Preço | mesmo cálculo para todos: `DESCONTO_AVISTA` / `precoTerminacao`; o "10%" vem de `data-desconto-avista` | `common.js` | `moeda()`/`typeof moeda` (não existe); percentual escrito à mão | `moeda` + `padrao_regras_dados.py` |
| Links | compartilháveis usam `SITE_URL`; API usa `API_URL` | `common.js` | `location.origin` ou domínio escrito à mão em link que a pessoa copia | `location-origin` |
| Imagem dinâmica | `'<img ' + atribSrc(fotoMini(url, 480)) + '>'` | `common.js` | `<img src="' + url + '">` | `img-sem-atribsrc` |
| Upload de foto ao R2 | `TKMiniFoto.enviar` (envia original + cópias leves) | `mini-foto.js` | upload de foto por `fetch` próprio | `padrao_regras_dados.py` |
| Cache do `common.js` | todas as páginas pedem o **mesmo** `common.js?v=`; quem muda o `common.js` sobe o `?v=` em todas, no número do `VERSION` da PR | cada `.html` | página com `?v=` diferente ou sem `?v=` | `common-versao` |
| `padrao-dados.js` | toda página que usa `TKPadrao` (direta ou por outro script) o carrega | cada `.html` | `TKPadrao` sem o arquivo | `padrao-dados` |

## 5. Vocabulário oficial (decisão do dono)

| Use | Não use | Observação |
|---|---|---|
| **produto** | peça | em textos de interface |
| **seleção** | sacola | |
| **Gestão** | Painel do Atendente | área de administração |
| **Admin total** | gestor total | perfil |
| **Pedir fotos** | Solicitar fotos | |
| **Editar produto** | Editar no cadastro | |
| **Tentar de novo** / "tente de novo" | novamente | |
| **…** (um caractere) | `...` | |
| **MB** | MiB | |
| **você** | tu / "entra no nosso site" | |
| Sem conexão. Verifique a internet e tente de novo. | outras frases de "sem conexão" | |
| **Público** | Gênero | rótulo na Gestão |

Verbos: **Excluir** = destruir de vez (confirmação com a consequência) · **Arquivar** = esconder, dá para reativar · **Remover** = tirar de uma lista (não apaga o item). **Apagar** não é rótulo de botão. Frases em forma de frase ("Enviar agora"), não "Enviar Agora".

**Exceções deliberadas** (ficam de propósito; a lista executável é `PERMITIDO` em `tests/padrao_vocabulario.py`): "Sacola" como **nome do ícone** no editor visual de postagens (`admin-postagens.js`); textos jurídicos (`privacidade.html`, `exclusao-dados.html`); "Peça" como verbo de pedir; mensagens vindas do servidor e dados já gravados na planilha (ex.: `fotoia-plano.js` espelha o Worker de Fotos IA; status do pedido no `common.js`); `treinamento-cadastro-simulacao.html` (simulação de treinamento). Conferência: `vocabulario` (no `check_padroes.py`, reaproveita as listas do teste) + `padrao_vocabulario.py` (inclusive o texto visível nas telas).

## 6. Mapa rápido: "preciso de…" → use

| Preciso de | Use |
|---|---|
| abrir uma janela/folha | `TKCamadas.empilhar` + `TKJanela.prender` + `.tk-fechar`, `z-index: var(--z-folha)` |
| avisar que salvou/falhou | `TKAviso.ok / erro` |
| perguntar antes de apagar | `confirm('Excluir …? Não dá para desfazer.')` |
| pedir senha | `TKAviso.pedirSenha` |
| mostrar erro de rede/servidor | `TKAviso.erro(TKPadrao.erro(e, 'Não foi possível salvar. Tente de novo.'))` |
| botão | `.tk-btn-prim / -sec / -perigo / -texto` |
| lista de opções marcáveis | `.tk-chip` com `aria-pressed` |
| foto de produto | `atribSrc(fotoMini(url, 480))` em moldura 4:5 |
| link para o site | `SITE_URL` |
| gravação longa | `TKOcupado.inicio(...)` |

## 7. Como propor uma EXCEÇÃO ou um componente novo

1. **Primeiro tente o componente existente.** Faltou uma variante? A correção é no **dono** (tabelas acima), beneficiando todos os módulos.
2. **A PR altera este documento antes do código**: o que muda, quem é o novo dono (um arquivo só), o que passa a ser proibido e como o CI confere (regra no `check_padroes.py` ou teste em navegador).
3. **Nada de CSS/JS de um módulo definindo de novo** botão, janela, aviso, cor, camada ou frase de erro.
4. **Exceção pontual:** só com justificativa na PR. Ela entra como linha em `PERMITIDO` (vocabulário) ou como alta no baseline com `--aceitar-aumento`, sempre visível no diff para revisão. Exceção sem aprovação do proprietário é recusada.
5. Mudança visual segue a skill `tenkiter-estetica-humana` (390 e 1440 px, evidência). Rode `check_padroes.py`, `padroes_check_teste.py` e, para interface, o plano `python3 scripts/ci/testes_impacto.py planejar --arquivos ...` (inclui o módulo `padroes`).
6. Nunca desative a regra nem o teste para a PR ficar verde: pague a dívida (e baixe o baseline) ou proponha a exceção como acima.

**Fora do alcance desta trava (continua revisão humana):** a qualidade do texto, a escolha entre Excluir/Arquivar/Remover, a consequência dita no `confirm()`, o uso de `TKOcupado` e a chave de operação nas escritas. Simulação em Chromium não prova Android nem integração real.
