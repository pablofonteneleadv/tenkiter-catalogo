# Perfil do atendimento e ficha única — 7.40.23

Tarefa humana: abrir o atendimento pronto para responder com o próprio nome, reconhecer a conta em uso e manter todos os canais da pessoa juntos.

## Resultado

- Nome padrão obtido do primeiro nome do cadastro autenticado, incluindo os campos `nome` e `name`. Preferência de atendimento persistida no servidor, por identidade normalizada do usuário; mantém nomes legados com/sem +55 e nono dígito. Não depende de token nem de aparelho.
- Lápis abre edição em gaveta; caixa de mensagem fica livre. Somente Admin total pode ocultar a própria assinatura. A opção não existe para equipe; servidor recusa sua alteração e garante a assinatura nos textos enviados/agendados por equipe. A configuração global antiga não desliga a assinatura dos demais.
- Cache local por conta mantém o nome durante falha temporária. Resposta atrasada de consulta não sobrescreve a preferência recém-salva. Conta diferente invalida o perfil em memória.
- Topo da lista identifica o usuário pelo nome cadastrado.
- Busca vazia passa a pedir `blocos=1`: limite de 50 pessoas aplicado antes de trazer seus canais. Antes, o limite era de 50 conversas, e podia cortar os canais antigos; pesquisar reduzia o conjunto e parecia corrigir. Ordenação interna e externa segue a mensagem mais recente. Sem inferir vínculo por nome. Filtros de canal continuam valendo; API antiga mantém paginação por conversa.
- Nome do cliente editável na Ficha, com os outros dados. Transação atualiza nome nos canais da mesma identidade sem mudar vínculos. Telefones e canais ficam em seção recolhida na ficha; não há segunda janela “Contato e canais”.

## Validação

- SQLite real em memória e provedores simulados: 420 verificações do Worker, sem falhas. Casos novos incluem troca de formato do telefone e token, preferências de pessoas diferentes, assinatura da equipe, nome compartilhado entre canais e três canais separados por mais de 50 conversas.
- Mesmos testes contra o código anterior reproduzem falhas de padrão/persistência, renomeação e bloco incompleto; relatório de baseline preservado no Cofre.
- Oito jornadas de interface (admin/equipe), 320×700, 390×844, 412×915 e 1440×900, texto 130%, altura reduzida a 470 px simulando teclado, toque e teclado. Nome preservado ao reabrir e durante erro temporário de perfil; edição do cliente e ação Salvar alcançáveis.
- Regressões: Ficha 46/46, assinatura 22/22; sessão e Android notificação/Voltar/áudio/seletor visual em quatro viewports. JavaScript, HTML, skill UX e scan de segredos verificados.
- Referências atuais de Workers, API D1 e tipos `@cloudflare/workers-types` 5.20261028.1 consultados. SQL usa parâmetros, gravação de nome/ficha usa batch transacional, nenhum novo binding ou schema.

## Revisão visual

Tarefa principal preservada: composer com clipe/microfone/mensagem; edição sob demanda. Alvos críticos de 44–48 px; botão Salvar em rodapé da gaveta com no mínimo 48 px. Sem rolagem horizontal em 320 px; nome completo no topo pode truncar visualmente com `title`. A gaveta rola, com rodapé separado, sem botão encoberto na simulação de teclado. Evidências no lote privado `20261029-atendente-ficha`.

**APROVADO COM LIMITAÇÃO:** execução web com serviços simulados, sem homologação em aparelho físico. As mudanças são carregadas pelo APK 2.4.5 já publicado; sem novo instalador. Não houve mensagens/push de teste a clientes, alteração do Apps Script ou migração de dados em produção. Confirmação de recebimento real e teclado do fabricante continua dependente do aparelho.

## Publicação e restauração

Fonte anterior: `a83ff6c5c57dbc2747cd879018d5faef3b6e16f9`, branch `backup/pre-perfil-ficha-20261029`. Backup privado da fonte anterior, proposta e evidências no Cofre. Publicação pelo CI e `deploy.yml` após merge; commit público e conclusão ficam registrados no lote privado.
