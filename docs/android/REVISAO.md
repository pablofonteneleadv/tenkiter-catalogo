# Revisão Android e experiência de atendimento

Tarefa humana: responder mensagens em um app dedicado e consultar o catálogo no navegador, sem perder a conversa aberta.

Skill: `.agents/skills/tenkiter-estetica-humana/SKILL.md`. Reutiliza a caixa de atendimento e a identidade visual da TENKiTER. Remove painel de Gestão e navegação duplicada no modo app; o site normal permanece igual. Barra nativa de 48dp com Site, Avisos e Sair. A sessão continua submetida à autorização do servidor. Android WebView não expõe ponte JavaScript para código remoto.

Evidência: `tests/app_mensagens.py` em 390×844, 412×915, 1440×900 e 320×700; abriu conversa, escreveu e enviou resposta simulada, conferiu rolagem horizontal e redução de viewport a 480px. Screenshots locais em `tests/saida/app-mensagens-*.png`. Aviso de configuração usa altura medida para reservar espaço e não sobrepor o compositor.

Servidor: testes SQLite + OneSignal simulado para vínculo do aparelho, aviso genérico, não repetição após confirmação, revogação de permissão, logout e chave ausente. Testes existentes do módulo: 49 + 175 cenários aprovados.

APK release 1.0.0 compilado para minSdk 26/targetSdk 35; assinatura RSA conferida por apksigner. Chave preservada em backup privado Drive, fora do repositório. SDK OneSignal nativo 5.10.2.

Resultado: APROVADO COM LIMITAÇÃO. Não houve aparelho Android físico ou emulador nesta sessão. Não foi comprovada entrega real FCM com app fechado. O proprietário ainda precisa criar Firebase e configurar FCM no OneSignal, salvar App API Key no painel e executar o roteiro de homologação. Nenhuma conversa real foi usada em testes nem mensagem real enviada.
