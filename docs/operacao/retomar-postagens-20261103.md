# Retomada de postagens —03/11/2026

Solicitação: retomar os destinos pendentes preservando Story/Status já publicados e fiscalizar as confirmações. Screenshot indica destinos aguardando com horário vencido; não comprova sozinho uma falha da API.

## Diagnóstico confirmado no código/testes

O teto total do Instagram é90 por padrão e os destinos têm tetos próprios (Story/Status1/Grupo/Status2:40 por padrão). São limites internos configuráveis, não uma afirmação de cota universal das APIs. O cron examinava apenas40registros vencidos; se todos estavam no limite de um destino, outro destino livre atrás deles ficava invisível. Teste reproduzido e corrigido.

## Mudanças

- Cron examina até200pendentes (capacidade total da fila), sem aumentar o máximo de4tentativas de envio por ciclo. Consulta de partes dividida em lotes de40pares, até80parâmetros por consulta, dentro do limiteD1.
- `/posts` informa por destino a espera por limite24h, usados/limite e próxima vaga calculada na janela móvel. Card mostra Limite40/40 e o próximo horário deixa de aparentar simplesmente uma fila esquecida.
- Fila→Retomar pendentes seleciona somente destinos automáticos com horário vencido. API `/post/retomar-pendentes` recebe IDs explícitos e idLocal estável. Publicados, futuros, processando, erros e envios com recibo em confirmação ficam intactos.
- Mesmos IDs e mídia; não cria cópias nem zera comprovantes. Redistribui horários respeitando pausa, intervalo do destino e intervalo editorial; partes consecutivas mantêm política vigente.
- Somente gestor pode marcar Ajustar para90 por destino. Altera apenas canais dos pendentes selecionados, mantém teto globalInstagram e demais regras. Configuração anterior/autoria/IDs ficam em `po_retoma_ultima`, privada no banco. Sem ajuste, limites atuais são mantidos.
- Reserva por usuário+idLocal impede duplo clique/rede lenta de reorganizar novamente. Retomada incerta permanece para conferência; não repete a operação automaticamente.

## Evidência

WorkerIG407, Waflyproativo27, canal11, originais/partes e teste novo de cotas/retomada passaram em simulaçãoSQLite/R2/provedores locais. Cobre40bloqueados não escondendo outro destino, janela24h, regra90, recibos e publicados intactos, equipe sem alterar regra, anonimato recusado, replay sem mover horários e consultas<=100parâmetros.

UI:320/390/412/1440 e altura470, texto100/130%, polling preservando escolha, falha após salvar + retry com mesmoidLocal, publicados preservados, ações44px e axeAA. Revisão visual no390/130% mantém o painel atual; retomada recolhida ocupa uma ação, explicações abrem sob demanda. APROVADO COM LIMITAÇÃO: sem aparelhoAndroid físico ou publicação real como teste.

Graphify: `start`, query fila postagens limites canal status2 retomar; query específica processarPostagens/contarUsados24h_; ensure e impacto retomarPendentesPost_. Índice local semLLM, cobertura parcial do parser; fontes e testes confirmados diretamente.

## Operação real e continuidade

ConectorCloudflare retornou reautenticação obrigatória; Wrangler local está sem login. O proprietário autorizou reconectar e retomar/fiscalizar os pendentes, mas autorização textual não conclui OAuth. Até este registro preparatório **não foi possível consultar nem retomar a fila real**. Não afirmar que os destinos do screenshot foram publicados.

Após login: consultar somente po_cfg e postagens pendentes da ocorrência, registrar snapshot privado/recuperação; identificar IDs/destinos e comprovantes; retomar somente vencidos não enviados, ajustar para90 somente destinos envolvidos se necessário e autorizado; observar cron/recibos até resultado. Separar confirmação real de Publicado sem confirmação (política7.48.3 mantém essa distinção). Não repostar destinos já confirmados e não zerar IDs de envio.

Backup de fonte anterior e evidências no Cofre; branch backup/pre-retomar-postagens-20261103. Sem migração de esquema/novoAPK/AppsScript. CI/deploy devem ser registrados após confirmação. Outras melhorias continuam preservadas no checkpoint e no trabalho WIP de Nova conversa, não fazem parte deste reparo.
