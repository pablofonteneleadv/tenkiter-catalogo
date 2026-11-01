# Checklist de revisão visual

## Coerência e escopo

- [ ] Tela atual e vizinha foram inspecionadas; tokens/componentes ativos identificados.
- [ ] Mudança tem critérios de sucesso, diferenças justificadas e preserva o contexto do trabalho.
- [ ] Não há tema genérico, biblioteca desnecessária, CSS duplicado ou regressão nos consumidores compartilhados.
- [ ] Critérios específicos de catálogo, mensageiro, postagens, gestão e APK foram aplicados conforme o escopo.

## Tarefa e hierarquia

- [ ] A ação principal é identificável em até dois segundos.
- [ ] Controles secundários não competem com ela.
- [ ] A pessoa sabe onde está, o que aconteceu e qual é o próximo passo.

## Espaço e comportamento

- [ ] 390×844, 412×915, 1440×900 e reflow a 320 px foram verificados.
- [ ] Teclado aberto, safe area, barra inferior e orientação/altura variável não escondem conteúdo.
- [ ] Overlays nunca cobrem o próprio alvo.
- [ ] Não existe rolagem horizontal acidental.
- [ ] Redimensionamento e carregamento não geram saltos prejudiciais.

## Visual e conteúdo

- [ ] Tipografia, cores, bordas, raios e espaçamentos seguem a linguagem TENKiTER.
- [ ] Não há cartões dentro de cartões sem necessidade.
- [ ] Rótulos são concretos e o texto foi reduzido ao necessário.
- [ ] Fotos e dados comerciais mantêm prioridade visual.
- [ ] Erro, vazio, carregamento, sucesso e bloqueio foram desenhados.

## Acessibilidade

- [ ] Contraste AA e foco visível.
- [ ] Alvos confortáveis e nomes acessíveis.
- [ ] Jornada completa por teclado.
- [ ] Zoom/texto ampliado e movimento reduzido.
- [ ] Cor e ícone não são o único meio de comunicar.

## Dados e continuidade

- [ ] Indicadores têm período, unidade, definição, atualização e ação útil; zero difere de indisponível.
- [ ] Filtros têm escopo claro e gráficos oferecem acesso textual aos valores.
- [ ] Submissão duplicada é impedida; progresso é verdadeiro e falha parcial tem recuperação.
- [ ] Fechar, alternar layout ou receber atualização preserva rascunho, foco e posição.
- [ ] Ações estão conectadas ao fluxo real, com permissões e confirmação coerentes.

## Evidência

- [ ] Screenshots antes/depois ou referência visual equivalente.
- [ ] Teste automatizado da tarefa principal e das colisões.
- [ ] Medidas de barras, painéis e alvos registradas.
- [ ] Resultado final e limitações documentados.
