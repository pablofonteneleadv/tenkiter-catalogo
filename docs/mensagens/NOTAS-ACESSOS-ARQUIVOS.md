# Atendimento: notas, acessos, arquivos e produtos — 7.40.19 / Android 2.4.4

A equipe pode registrar uma orientação interna enquanto espia, sem dar baixa na leitura. O atalho **Notas · n** aparece no atendimento quando há notas ativas; **Nota para equipe** permite criar a primeira no modo Espiar. O filtro **Com notas** contém somente conversas abertas com notas ativas, inclusive ao pesquisar. Notas são compartilhadas pelos canais já vinculados da pessoa.

O X faz exclusão lógica. O registro original conserva texto, autor, data, data da exclusão e nome/número do funcionário que apagou. A gestão e pessoas com Notas + Exportar consultam o histórico autenticado em `GET /msg/notas/log?conversa=ID`. Apagar repetidamente não substitui o histórico. A migração acrescenta somente duas colunas em `msg_nota`; não apaga mensagens nem notas antigas.

**Equipe catálogo 1** recebe atendimento, produtos, arquivos, contatos, etiquetas, notas, agenda e respostas rápidas. Conexões, automações, métricas, funil e exportação precisam ser concedidos. Em **RH → Acessos → Permissões → Ferramentas de Mensagens**, cada ferramenta pode herdar o perfil, ser permitida ou bloqueada para uma pessoa. As regras adicionais ficam no Worker privado e são aplicadas no servidor, no site, no APK e na seleção de destinatários de notificações. Admin total conserva todos os acessos. Não é necessário publicar um Apps Script novo.

Arquivos recebidos como APK, ZIP e documentos Office deixam de ser recusados pelo filtro de MIME. Downloads são autenticados, privados e têm nome original. O novo APK usa o seletor de documentos do Android; não pede acesso amplo ao armazenamento e não executa/instala anexos. Transfere primeiro para arquivo temporário e verifica novamente a conta antes de salvar no destino. Mídia que já expirou no provedor pode continuar indisponível; limite de captura remota permanece 20 MiB.

O aplicativo solicita atualização imediata da lista ao voltar à tela e ao receber notificação em primeiro plano. Consultas simultâneas são reunidas. O Worker deixa de repetir todas as migrações a cada novo isolado: usa versão persistida após conferir as colunas necessárias e uma inicialização compartilhada por banco. Não há promessa de latência medida em aparelho; entrega OneSignal/rede ainda precisa de validação física.

Produtos têm filtros por tamanho, categoria, cor e público. O painel abre ao digitar dois caracteres, mantém a seleção de peças e mostra contagens. Tamanhos usam a mesma interpretação `TKTamanhos.cliente` do catálogo: numerações/idades vinculadas prevalecem sobre a etiqueta interna.

## Validação

- Worker de atendimento: 409 verificações, incluindo exclusão lógica, idempotência, ausência de leitura, filtro de encerradas, ACL negativa, revogação, arquivo APK remoto e inicialização em isolado novo.
- Push: registro, entrega simulada, deduplicação, revogação e logout.
- UI dirigida: notas em Espiar, equipe catálogo 1, filtros de produtos, retorno de notificação e Instagram.
- Android: testes unitários e lint; build de distribuição somente pelo workflow oficial com a chave já preservada nos GitHub Secrets. Nunca usar a chave local antiga.
- Nenhum envio real de mensagem/push ou consumo de IA como teste.

Revisão visual: tarefa principal é anotar/escolher uma peça sem perder o atendimento. Referência: telas enviadas pelo proprietário. Viewports 320×700, 390×844, 412×915 e 1440×900; fonte 130% e altura reduzida a 470 px para simular teclado. Notas usam corpo rolável com padding 16 px, botões críticos 48 px e X com nome acessível. Filtros têm área rolável de até 240 px e seleção fora da lista. Estado vazio, espera, sucesso e erro preservam a próxima ação. **APROVADO COM LIMITAÇÃO**: evidência em testes simulados, sem homologação em aparelho físico.

O workflow Android passa a compilar também no push protegido da main com alterações em `android/**` ou no próprio workflow. PRs continuam compilando somente APK de teste, sem secrets. O manifesto público só muda depois de verificar o APK oficial assinado.

## Instalador oficial conferido

Artefato do workflow `APK Android` 40758508536, fonte main `41c06ca5a01902b04e311b040607ba625b8c3cfc`. Pacote `br.com.tenkitermodas.mensagens`, versão 2.4.4, código 11, 4.580.785 bytes. Assinatura v2 válida e mesmo certificado de 2.4.3: `09ed81d57207c72a9d49cc5065483a22f57a15528d8a626aa3a99467e1b59a76`. SHA-256 do APK: `9f92bfbf517c05f1d440d4da381ef92cd6464f57bd8378acd5968e8d04e11158`. Cópia recuperável em `android-installers/releases/2.4.4/`. A distribuição ocorre pelo deploy oficial depois da aprovação do PR de manifesto.
