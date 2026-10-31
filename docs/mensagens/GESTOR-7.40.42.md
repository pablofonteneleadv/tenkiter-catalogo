# Gestão do Mensageiro — 7.40.42

Entrada: Mensagens → Mais → Gestão e configurações. Exclusiva de Admin total, conferida novamente no Worker. O APK abre o atendimento remoto e recebe a mesma central.

- **Agora:** conversas esperando a loja ou o cliente, sem responsável e fora da meta; fila ordenada pela primeira entrada ainda sem resposta humana; carga por responsável; Espiar preserva a leitura. Atualização a cada 30 segundos com tela visível.
- **Equipe:** carteira atual, espera e atrasos; tempos por autoria estável registrada nos novos envios; presença aproximada por 2 minutos e trilha de ações. Atividade não é medida de produtividade ou jornada.
- **Resultados:** primeira resposta de ciclos com início observado, mediana e percentil 90 por bloco de espera, meta por canal, demanda por hora e encerramentos. Períodos Hoje/7/30/90 dias; horário de Fortaleza; tempo corrido ou expediente real com intervalos/exceções. Histórico pode ter até 5 minutos de cache.
- **Qualidade:** início da cobertura, respostas sem autoria confirmada, limites/amostra parcial e alterações das metas. Histórico antigo não é atribuído por nome, assinatura ou responsável atual. Vendeu não comprova pagamento; não há indicadores financeiros ou satisfação inventados.
- **Configurações:** 20 grupos pesquisáveis por escopo Loja/Pessoa/Aparelho. Metas por canal têm controle de versão e auditoria. Acessos usam identificador normalizado pelo servidor. Leitura, identidade, assinatura, respostas, automações, expediente, funil, conexões, contatos, agenda e exportação levam aos editores existentes, com retorno à gestão. Ajustes Android atuam somente no aparelho em uso; não constituem controle remoto de outros celulares.

## Fila de postagens

A visão padrão é **Por mídia**, reunindo foto ou vídeo original, suas partes e destinos. **Por canal** continua disponível e a escolha fica salva por conta/aparelho. Controles manuais e ações por destino são preservados.

Três originais divididos em duas partes cada são **3 vídeos / 6 partes**. O intervalo padrão ou escolhido vale entre os originais. As partes do mesmo vídeo avançam após confirmação da anterior, respeitando as regras de entrega e sem inserir o intervalo editorial entre elas. Entrega incerta continua bloqueando repetição automática. Reagendar um vídeo só move a série inteira quando nenhuma parte começou.

## Dados e implantação

Migração exclusivamente aditiva: origem/intervalo das postagens, identificação estável do responsável/autor, marcação de automação e log de metas. Colunas antigas e histórico preservados; nenhum preenchimento retrospectivo por suposição. Consultas não retornam texto de mensagens. Fila limitada a 5.000 conversas (até 250 exibidas); histórico até 30.000 mensagens e 20.000 encerramentos, com aviso quando parcial. Ações recentes cobrem até 31 dias mesmo quando o indicador histórico usa 90.

Android 2.4.15/code22 → 2.4.16/code23: diagnóstico local de câmera/microfone/notificações/bateria, acesso aos avisos, câmera na revisão de permissões e presença da tela nativa em primeiro plano. Perfil de captura existente preservado. A chave original de assinatura permanece no GitHub Actions.

## Validação

Testes usam serviços simulados e SQLite/Miniflare; nenhum envio real ou alteração de contatos/clientes. São cobertos ACL Admin total, autoria desconhecida, automações, resposta incerta, primeira espera, almoço/noite/domingo/exceção, conflitos de metas, série de vídeos e reagendamento. Jornadas visuais em 320/390/412/1440 px, texto ampliado e altura reduzida, com axe e navegação por teclado. Artefatos no CI.

Limitação: sem aparelho Android físico para validar câmera, entrega Wafly/Instagram ou instalação sobre a versão anterior. Os testes automatizados e a verificação de manifesto, artefato e certificado não substituem essa homologação.

## Revisão visual e release

Tarefa avaliada: identificar prioridades de atendimento e abrir o ajuste correto sem perder contexto. Resultado: **APROVADO COM LIMITAÇÃO**, pela ausência de Android físico. Foram corrigidos o fechamento prematuro na troca de camadas, a perda de foco ao abrir um editor, o contraste da aba selecionada sob hover e a largura herdada dos botões no mobile. Cabeçalho e abas ficam fora da rolagem; o restante rola sem rodapé fixo sobre as ações. Controles da central têm altura mínima de 48 px. Capturas e jornadas dos quatro tamanhos ficam no artefato `evidencias-reparos-integrados` do CI.

Backup de código: branch remota `backup/pre-fila-gestor-20261031`, commit `ff2c0191ff951df48a8f43b08aa550db00751cbd`. Migrações são aditivas; a restauração do código anterior não exige apagar colunas ou histórico. Backup privado de dados existente e suas limitações permanecem no runbook do Cofre.

Candidato Android: workflow `41242681445` aprovado, 4.615.689 bytes, SHA-256 `c0bcdfb5531bf67227e05bb181fa2423be4a4286dfa491f9a96a9d0ba65ecf15`, certificado SHA-256 `09ed81d57207c72a9d49cc5065483a22f57a15528d8a626aa3a99467e1b59a76` igual à versão anterior. O deploy oficial promove esse mesmo candidato e confere o manifesto público.
