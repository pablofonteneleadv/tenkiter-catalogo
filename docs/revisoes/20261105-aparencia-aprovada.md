# Aparência aprovada — auditoria

O proprietário aprovou o comparativo e a aplicação até deploy em05/11/2026. A tarefa é encontrar as ferramentas de gestão, ler suas descrições e compartilhar a busca sem perder o contexto. São preservados IDs, destinos, permissões, ações e estoque opcional.

Foram editadas as regras ativas de acabamento, sem novo tema ou biblioteca: títulos16px, descrições14px com linha1,45 e cor#53534d, espaçamento12px, summary16px e alvos de compartilhamento de44px. O atalho passa de“Outras ferramentas” para“Ferramentas do gestor”. A proposta aumenta a altura de algumas listas, conforme a comparação aprovada. Regras antigas de34px no botão de adicionar resultados e39px no compartilhamento dentro do painel de filtros foram superadas no acabamento compartilhado.

## Verificação

`tests/aparencia_aprovada_ui.py` executou as tarefas com Apps Script simulado e produtos fictícios em320×740,390×844,412×915 e1440×900: abrir/fechar ferramentas pelo teclado, download CSV, compartilhar filtro pela barra da busca e pelo painel de filtros, passando pela janela de seleção, gerar link HTTPS canônico, fechar e limpar filtro. Conferiu alvos44×44px, texto ampliado125%, ausência de rolagem horizontal e perfil simplificado sem revelar ferramentas restritas. Capturas e medidas são artefatos do CI em`tests/saida/aparencia-aprovada/`.

Referência anterior: comparativo aprovado preservado no Cofre, lote20261104-decisoes-auditoria. Capturas renderizadas atuais foram examinadas em celular e desktop. A cor secundária proposta tem contraste superior a4,5:1 no fundo branco. Não foi feita uma auditoria AA de todo o aplicativo.

Resultado: APROVADO COM LIMITAÇÃO — jornadas web simuladas; sem homologação em aparelho físico ou envios reais. Os caminhos de erro existentes não foram redesenhados. Não houve mudança nativa: `WebKeeper.HOME` e `MainActivity` carregam o HTML remoto de tenkitermodas.com.br/admin.html. HTML/CSS desta rodada dispensam novo APK; a distribuição existente segue o workflow oficial.

Graphify preparado/atualizado e consultado por`ferr-tile details-ferramentas btn-compartilhar-filtros` e`filtrarFerramentas_ compartilhar filtro`. O parser tem cobertura parcial; fontes e testes foram usados como prova. O Cofre não foi indexado nem copiado para o repositório público.

## Correção encontrada pelo CI

A jornada existente pedir_fotos_lote.py revelou sobreposição do menu de lote pela navegação inferior em390×470 com texto130%. Mantidos botões44px, o menu em fluxo passou a limitar sua altura a metade da viewport (teto360px), com rolagem interna; ao abrir, é trazido ao centro somente se extrapolar a área entre cabeçalho e navegação. Nenhuma ação foi removida e o teste não foi relaxado. A jornada completa passou em75verificações simuladas, incluindo duas telas baixas, texto ampliado, teclado, retry e troca de conta.
