# Permissões por acesso e equipe da Esteira

A tarefa é escolher um acesso, entender o que ele permite e configurar todas as pessoas vinculadas. O proprietário esclareceu que deseja editar o **nome** do acesso. Não foi criado roteamento de página inicial por perfil.

## Contrato e composição

Acessos atribui perfis às pessoas e mantém ajustes individuais. A aba vizinha Permissões lista os acessos; abrir uma linha mostra nome, descrição e permissões agrupadas por área, com salvar/cancelar e exclusão com substituição. Cliente e Admin total ficam protegidos. A confirmação informa quantas pessoas serão afetadas. Revisão do servidor impede sobrescrever mudanças de outra sessão; erros conservam o rascunho.

O RH inteiro mantém preto quente, fundo claro, laranja na ação principal, fontes Inter/Poppins com alternativa do sistema, bordas discretas e espaçamento de 8/16/24px. `rh-permissoes.css` é restrito a `body.rh-admin`; portal, catálogo e Mensageiro mantêm seus estilos. O cabeçalho deixa de repetir a ação de abrir o RH quando ele já está aberto. Abas e filtros têm rolagem própria; filtros/ordenação e perfis individuais se expandem sob demanda. Expandir perfis permanece aberto ao marcar vários acessos. Nenhuma biblioteca foi adicionada.

## Regras efetivas

- Definições são salvas no servidor RH, não só no navegador. Renomear atualiza vínculos; excluir exige substituto quando há pessoas. Exceções individuais são preservadas.
- Mensageiro mantém regras pessoais e regras antigas de perfil até sua edição central. Antes de editar um perfil antigo, a tela consulta essas regras; falha nessa consulta impede sobrescrevê-las inadvertidamente.
- Postador e Fotos IA têm permissões próprias no Worker. Postador também precisa de entrada na Gestão; isso não concede edição de produtos. Conexões, chaves e configurações restritas continuam reservadas ao administrador.
- Esteira usa somente pessoas ativas com a permissão `esteira`, com conferência/lista e rodízio automático por dia. Admin total pode administrar sem participar do rodízio. Aceitar peças é uma permissão separada.
- Na modalidade nova, cadastro e escala semanal antigos ficam preservados, mas não concedem acesso nem fixam o rodízio. Ajustes da escala de um dia continuam possíveis. Revogações da Esteira são verificadas na próxima requisição; leituras de outras ferramentas conservam o cache de sessão existente de até dois minutos, e gravações revalidam a sessão.

## Integração das alterações recentes

Antes da publicação, foram buscadas e incorporadas as bases `a369e0f` (catálogo, PR374) e `3d07b45` (Cofre, PR84). Preservadas melhorias visuais, correções de cache/deploy, menu de lote acima da navegação e autenticação Wafly do RH3.30. A nova candidata é RH3.31, acompanhada do catálogo4.30; fontes privadas permanecem exclusivamente no Cofre.

Conferência pública de leitura anterior: site7.54.5 no commit `a369e0f`, RH3.30 com `waflyAcoesProtegidas=true`, catálogo4.29. Não houve envio de mensagem, geração paga ou escrita em planilha real como teste.

## Validação

Jornadas simuladas em390×844,412×915,1440×900 e reflow320px: criar, renomear, excluir com substituição, perfis protegidos, busca vazia, erro com recuperação, teclado/Enter/foco, área reduzida a500px e texto ampliado130%. Regressões dos acessos por pessoa e Mensageiro também passam. Capturas anteriores e posteriores são examinadas; a aba de desempenho e a de conteúdo são verificadas com os mesmos estilos.

Backend: catálogo, contas, perfis, novos modelos, certificados e manuais ricos; Worker: Esteira, fotos, novos acessos, Mensageiro e gestor. Entrada inválida, permissões e proteção Wafly também são reexecutadas na RH3.31. Regressão da aparência aprovada7.54.5 passa após integrar a base, com CSV, teclado, busca e compartilhamento.

Graphify foi tentado no início, consulta e atualização final; a extração excedeu180s neste Windows. A atualização final também foi interrompida após repetição de processos da própria extração. Nenhum grafo antigo foi usado como evidência: relações e impacto foram conferidos nas fontes e nos testes dirigidos.

Resultado visual: APROVADO COM LIMITAÇÃO — jornadas web com dados fictícios; teclado virtual aproximado por redução da área visível, sem homologação em Android físico. Não há alteração nativa nem de `common.js`. Esta revisão não é auditoria de acessibilidade de todas as telas do projeto.

Medições: cabeçalho64px, navegação inferior51,25px e reserva inferior104px mais safe area. A primeira pessoa começa emy578,8 nas duas larguras móveis; a página deixa de gastar a primeira tela inteira com filtros. Voltar, salvar, cancelar e excluir medem48px de altura, com largura mínima97px. Não foi encontrada rolagem horizontal do documento em320px ou com texto ampliado. Antes/depois em390/412/1440px e medidas ficam em[permissoes-rh](permissoes-rh/); capturas longas do editor podem repetir a barra fixa na altura da viewport e não devem ser interpretadas como documento estático.

## Ativação

Frontend e Worker são compatíveis com as versões anteriores e seguem o deploy normal após CI verde. A aba informa a necessidade da atualização enquanto o RH antigo estiver publicado. A publicação dos dois Apps Scripts é manual pelo proprietário. O procedimento e a preservação da equipe antes da troca estão no lote privado `20261105-permissoes-rh`.
