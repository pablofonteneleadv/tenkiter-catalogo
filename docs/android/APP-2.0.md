# TENKiTER Mensagens 2.0.0

## Usar a nova versão

Instale o APK 2.0.0 sobre a versão 1.0.0, sem desinstalar. O package e a assinatura são os mesmos. Entre com a mesma conta autorizada da TENKiTER. Se preferir recuperar acesso ou aproveitar o login do site, use “Entrar ou recuperar acesso pelo site”; depois volte em “Conversas”.

A caixa principal agora é Android nativa: lista, busca local, filtro por canal, mensagens recentes e resposta de texto. Ela abre o banco local sem carregar o painel web. “Completo” abre o atendimento existente para fotos, áudio, vídeos, produtos, histórico mais antigo e demais ferramentas.

O banco guarda dados de até 200 conversas para exibição; mensagens recentes são limitadas a 300 por conversa e cem conversas com histórico. A sessão fica cifrada com uma chave do Android Keystore; tokens e anexos não entram no banco. O banco privado do aplicativo não participa do backup Android. Sair apaga banco, credenciais e pendências locais e desativa a inscrição de push. Trocar de conta também remove as conversas locais anteriores.

Ao abrir, mostra o que estiver salvo e busca atualizações. A cópia local pode ser consultada por até 24 horas desde a última confirmação de acesso; responder exige confirmação da rede. Na primeira entrada, é necessário fazer a sincronização inicial. Não há histórico local anterior à instalação desta versão.

## Segundo plano

OneSignal/FCM mostra a notificação e aciona uma extensão nativa que solicita sincronização pelo WorkManager, mesmo sem a tela aberta. Há também uma tarefa periódica de recuperação (intervalo mínimo Android de 15 minutos, executada conforme o sistema permitir). Na tela aberta, a verificação é a cada oito segundos; notificações também atualizam o banco e a interface.

Expedição e periodicidade não equivalem a um processo permanentemente ligado: Android, fabricante, conexão, permissões e quota podem atrasar trabalhos. Remover dos recentes normalmente preserva notificações; “Forçar parada” nas configurações bloqueia execução até reabrir. Não foi feita medição de entrega FCM em aparelho físico nesta entrega.

## Atualizar aplicativo

O botão **Atualizar app** fica na barra superior, inclusive na tela de login. Ele consulta `https://tenkitermodas.com.br/android/latest.json`.

1. Havendo uma versão superior, mostra número, notas e tamanho.
2. “Baixar atualização” baixa o APK publicado na release oficial do projeto.
3. Confere tamanho, SHA-256, package, versionCode e assinatura igual à do aplicativo instalado.
4. “Instalar” abre o instalador Android. Na primeira vez, o sistema pode pedir “Permitir desta fonte” para TENKiTER Mensagens; volte ao app após permitir.
5. Confirme a instalação. O Android preserva o banco e as configurações da mesma instalação.

A instalação exige confirmação do usuário; não é instalação silenciosa. Na versão 1.0.0 ainda não existe esse botão: esta primeira troca para 2.0.0 é manual. As próximas poderão partir do próprio aplicativo.

O Cofre privado guarda cópia do código e do instalador. A distribuição usa uma release pública do APK assinado, sem dados de clientes ou credenciais. A chave privada de assinatura continua no backup privado já existente e fora do Git.
