# Filtros e Mais — painéis da proposta HTML, 7.40.27

Tarefa: refinar a lista ou abrir uma ferramenta de atendimento sem atravessar listas grandes e sem perder a navegação.

Referência: HTML/MHTML da proposta e screenshots do proprietário, com foco nas duas telas indicadas. A versão anterior apresentava conteúdo rente às bordas e campos de rádio longos em tela cheia. Filtros e Mais passam a usar painel inferior com raio20px, fundo escurecido, cabeçalho compacto, margem interna18px, títulos de grupo pequenos e ícones de linha no menu. Mostrar e Etapa da venda usam seletores, preservando as opções exclusivas e a API existentes. Não foram criados filtros combinados que o servidor não suporte.

Aplicar/Limpar ficam em rodapé próprio fora da área rolável; todos os campos e as últimas opções continuam alcançáveis. Mais mantém as ferramentas e permissões existentes e oferece Etapas da venda como na proposta. A abertura de um novo destino aguarda o fechamento da camada anterior para evitar corrida de histórico. Escape, Voltar, clique no fundo e navegação por Tab preservados; o foco fica dentro do painel. A mudança de estrutura é exclusiva desses dois painéis.

Jornada com serviços simulados: aplicar/reabrir etapa, limpar, Mais→Funil→Conversas, permissões reduzidas, ciclo de Tab, Escape e history.back. Cinco viewports320×700,390×844,412×915,1440×900,390×470; texto100/130%, última opção do menu, rodapé e reflow. Margens18px, alvos44px ou maiores, linhas de menu48px, seletores46px, ações48px. axe sem falhas sérias/críticas; sem rolagem lateral ou sobreposição do rodapé. Fluxos da caixa e assinatura22 também conferidos.

Evidências antes/depois e referência original ficam no Cofre privado. Nenhum envio real ou alteração em dados de clientes. Resultado APROVADO COM LIMITAÇÃO: Chromium; Android físico não homologado. Não exige novo APK nem publicação de Apps Script.
