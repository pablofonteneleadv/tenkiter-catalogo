# Mensageiro — layout compacto 7.40.45

Tarefa: localizar quem espera resposta e abrir a conversa correta, com mais área útil e a mesma identidade TENKiTER.

## Composição entregue

Topo com identidade e conexão na mesma linha secundária. Abas, busca, seleção e navegação preservadas. Canal, Toda a equipe/Só meus, não respondidos, individuais/grupos, situação e etapa ficam no painel Filtros; apenas escolhas ativas ocupam a lista. Mostra até dois resumos e um botão +N para acessar todos, evitando um cabeçalho crescente. Cancelar não aplica, Limpar restaura os padrões.

Seções leves de uma linha: Aguardando equipe e Demais conversas, com contagem dos blocos. Ordenação, agrupamento de canais vinculados e alternância entre lista dividida/contínua preservados. Metadados quebram de forma legível: canal, responsável, histórico e etiqueta. Telefone permanece na conversa e aparece no card quando há nomes iguais com contatos diferentes. Informações de espera e agendamento mantidas. Nota não altera fila.

## Decisão sobre o APK

WebKeeper.HOME aponta para admin.html?app=mensagens e MainActivity usa a WebView para abrir esse endereço. Os três assets remotos alterados têm cache key 7.40.45 no HTML. Não houve mudança nativa/ponte/Manifest/build: sem APK novo; instalador 2.4.21/code28 preservado.

A Activity já aplica systemBars/IME aos limites da WebView. Somente quando a ponte Android de versão existe, o rodapé web usa zero como reserva adicional de safe area. Navegador/PWA continuam usando env(safe-area-inset-bottom). Chromium não reproduziu a grande faixa branca do print: a correção cobre a duplicação de reserva pelo contrato de insets, sem alegar homologação no aparelho do proprietário.

## Evidência e validação

Antes/depois com os mesmos dados simulados: em390×844, topo90→64px e área de lista479→557px (+78px); em412×915, lista550→628px (+78px); em320×700,335→413px. Rodapé64px e botões52px no cenário sem safe area adicional. Seções e cards mais leves aumentam também o conteúdo aproveitável dentro dessa área. Valores são do Chromium, não medição física do celular.

Matriz320×700,390×844,412×915,1440×900 e390×470, texto100/130%. Jornadas: aplicar/cancelar/limpar filtros, validação de tipos vazios, canal Instagram, resumos +N, nomes iguais, seleção/encerramento, leitura/Espiar, alternância persistente, links de canais, busca, envio/retry/exportação simulados e rascunho com teclado. axe sem violações sérias/críticas nos cenários executados. Nenhum envio real. Screenshots de CI em tests/saida/reparos/layout; referências locais comparáveis em review/layout-antes e review/layout-final fora do Git.

Revisão visual conforme skill tenkiter-estetica-humana: observadas lista móvel, texto ampliado, painel de filtros em altura reduzida e coluna desktop; padrão de cores, ícones e componentes existente preservado. APROVADO COM LIMITAÇÃO: jornadas de navegador simuladas aprovadas; WebView/aparelho físico não homologados. CI remoto e publicação precisam ser confirmados no registro do lote.

## Ajuste de ferramenta associado

Durante a atualização do grafo, Graphify recusou a redução legítima após retirar código do cabeçalho antigo. O wrapper passa allow-dedup-shrink somente ao extrator local code-only: permite atualizar a saída gerada sem preservar símbolos obsoletos. Não altera fontes, banco, autenticação ou critérios de testes. Teste real de cache/alteração/exclusão/privacidade executado novamente.

## Restauração

Backup remoto backup/pre-mensageiro-layout-20261101 em6b2f3a9e80f044ba7a408b223e022b8c676190fa. Reverter a PR pelo fluxo normal restaura apresentação e ferramentas. Nenhuma migração ou remoção de dados.
