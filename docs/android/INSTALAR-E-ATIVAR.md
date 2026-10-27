# TENKiTER Mensagens — Android 1.0.0

APK assinado para Android 8 ou superior. O aplicativo abre o módulo Mensagens e o botão Site abre o navegador, permitindo alternar entre atendimento e catálogo. Usa o login e as permissões já existentes: atualmente o módulo exige `gerir_acessos` (Admin total). Instalar o APK não concede novas permissões.

## Instalar

1. Baixe `TENKiTER-Mensagens-1.0.0.apk` no celular.
2. Abra o arquivo e autorize a instalação por esse navegador/gerenciador de arquivos, quando o Android pedir.
3. Entre com a conta autorizada. O login do navegador não é copiado automaticamente para o app.
4. Use Site para abrir o catálogo no navegador. Voltar retorna da conversa para a lista; na lista, envia o app para segundo plano.
5. Para sair da conta e parar os avisos no aparelho, use Sair.

## Preparar Firebase e OneSignal (uma vez)

1. Acesse https://console.firebase.google.com/ e crie o projeto **TENKiTER Mensagens**. Analytics é opcional.
2. Abra a engrenagem → Configurações do projeto → Cloud Messaging. Confira se Firebase Cloud Messaging API (V1) está habilitada. Se precisar, abra o link de gerenciamento da API no Google Cloud e habilite-a.
3. Vá a Contas de serviço → Firebase Admin SDK → Gerar nova chave privada. Guarde o JSON fora de pastas públicas. Não cole seu conteúdo em conversas ou no GitHub.
4. Em https://dashboard.onesignal.com/ abra o aplicativo da TENKiTER com ID `535f6b0d-c866-43c2-b241-43bd7ab62fae`.
5. Settings → Push & In-App → Google Android (FCM) → configurar/editar. Envie ali o JSON de conta de serviço do Firebase. Se a interface pedir Sender ID, use o número do projeto indicado na aba Cloud Messaging do Firebase. Siga as confirmações do OneSignal.
6. Este APK usa o SDK nativo do OneSignal: **não precisa incorporar google-services.json nem recompilar só por configurar FCM no OneSignal**. A configuração remota precisa estar no mesmo App ID acima.
7. No OneSignal, Settings → Keys & IDs → crie/copiei uma **App API Key**, limitada ao aplicativo da TENKiTER. Não use Organization API Key.
8. No site: Gestão → Outras ferramentas → Conexões → **Aplicativo Android · Mensagens**. Cole a App API Key e toque Salvar chave. O servidor confere a chave com uma consulta; isso não envia mensagem.
9. No APK, toque Avisos → Ativar e aceite a permissão Android. Aguarde a inscrição e entre na conta. Se configurou FCM depois de instalar, feche/abra o app e use Avisos novamente.

## Conferir entrega

1. Com uma conta autorizada no APK, confirme que não aparece aviso de configuração pendente.
2. Coloque o app em segundo plano. Peça a uma pessoa enviar uma mensagem nova a um dos canais conectados. Não reutilize webhook antigo.
3. O servidor tenta enviar o aviso assim que grava a mensagem recebida. Uma rotina a cada minuto recupera falhas pendentes. A entrega posterior depende de OneSignal/FCM, internet e restrições do Android. Não é uma garantia de tempo real.
4. Toque no aviso: ele abre a conversa. A tela bloqueada mostra somente um aviso genérico, sem texto do cliente.
5. Repita com a tela bloqueada e depois com o app removido dos recentes. **Forçar parada nas configurações Android impede avisos até abrir o aplicativo novamente.** Em aparelhos com economia agressiva, permita execução/notificações em segundo plano conforme a configuração do fabricante.
6. Teste Sair: o SDK é desinscrito no aparelho e o vínculo é removido do servidor. Uma conta sem permissão não deve acessar a caixa nem receber novos avisos.

A primeira versão avisa mensagens **individuais recebidas**, não respostas enviadas, mensagens históricas ou grupos. Conversas de grupo continuam disponíveis no app. O registro do aparelho é renovado ao abrir o app; após 30 dias sem revalidar a sessão, deixa de ser elegível para envio. Cada envio verifica a sessão/permissão no servidor, com o cache de sessão de até dois minutos já utilizado pelo módulo.

## O que foi e o que ainda não foi validado

APK release compilado e assinatura conferida. Caixa de mensagens, teclado com viewport reduzida, login e registro simulados em 390×844, 412×915, 1440×900 e 320×700. Servidor testado com SQLite, sessões e OneSignal simulados: registro, deduplicação, revogação e logout.

**Ainda não homologado em um Android físico. Entrega real com app fechado depende da configuração Firebase/OneSignal acima e do teste no aparelho.** A compilação não comprova a entrega do push.

## Assinatura e futuras versões

Package: `br.com.tenkitermodas.mensagens`. A atualização precisa usar a mesma assinatura. A chave e sua senha foram guardadas no backup privado da loja; não ficam no código nem no APK. O workflow manual `APK Android` exige os GitHub Secrets `ANDROID_KEYSTORE_B64` e `ANDROID_KEYSTORE_PASSWORD`, que ainda precisam ser cadastrados por alguém com permissão de administrar os secrets. O ambiente desta sessão não conseguiu cadastrá-los.

## Abertura e cache (site 7.31.0)

O APK 1.0.0 recebe esta melhoria pela página publicada, sem reinstalar. A abertura não carrega mais o catálogo inteiro, categorias e estatísticas: Produtos carrega apenas ao abrir a gaveta. Lista e resumo de atendimento carregam em paralelo.

Depois de um acesso autorizado, ficam salvas no aparelho as últimas listas e até 80 mensagens das conversas consultadas (até dez consultas, teto de 500 mil caracteres, validade de 24 horas). Anexos e URLs de mídia não são salvos. Ao reabrir, o sistema pode mostrar essa cópia enquanto atualiza; responder e demais gravações ficam bloqueados nessa conversa até confirmação do servidor. Sair e recusa de acesso limpam as cópias. O cache pertence à conta e sessão que o criou.

Isto não é um aplicativo inteiramente offline: carregar a página e validar o login ainda dependem da rede. A notificação imediata significa que o servidor inicia o envio na chegada; a latência final depende da Wafly/Meta, OneSignal, FCM, conexão e Android.
