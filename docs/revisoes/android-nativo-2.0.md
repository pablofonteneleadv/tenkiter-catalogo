# APK Mensagens 2.0 — revisão funcional e estética

Tarefa humana: abrir as conversas salvas sem esperar o painel web, responder e manter o aplicativo atualizado pelo próprio aparelho.

## Resultado implementado

- Lista, busca local, filtro e conversa de texto em Views Android nativas; SQLite é a fonte inicial. Credenciais em SharedPreferences cifradas AES-GCM com chave Android Keystore, separadas do banco.
- Extensão OneSignal aciona WorkManager ao receber aviso novo; tarefa periódica de recuperação (15 min mínimos, sujeita ao Android). A notificação não é bloqueada esperando sincronização. Primeiro login e primeira sincronização requerem rede.
- Conta/sessão validadas no backend e Worker. Troca/logout removem dados locais; respostas de requisições antigas não repovoam o banco após logout. Modo de leitura local por 24 h desde a última validação; responder depende da rede. Envios incertos não são repetidos automaticamente e retry explícito usa o mesmo idLocal.
- Botão Atualizar app permanece disponível no login e na caixa. Manifesto público com versão/hash/tamanho/notas; instalador na release oficial. Download limitado a 50 MB; HTTPS e hosts restritos, hash, package, versionCode e certificado verificados antes de abrir o instalador do Android. Permissão de instalar desta fonte e confirmação do sistema são preservadas.
- Completo mantém as ferramentas existentes (anexos, produtos, histórico antigo). Não há bridge JavaScript exposta; eventual aproveitamento de sessão web é uma leitura pontual feita pelo nativo, em página/origem verificadas e com revalidação no servidor.

## Evidência

Sete testes Robolectric com APIs Android SDK 35 e gráficos nativos passaram: telas/lista/conversa offline e ações, banco persistente/reabertura/limpeza, manifesto inválido, sincronização com API simulada e descarte depois de logout, idLocal em retry, login com altura reduzida e preservação de rascunho quando chega mensagem. Nenhuma chamada de atendimento real foi feita como teste.

Telas renderizadas pelo Android simulado: 390×844, 412×915, 320×700 e 900×900; login em 390×480 simulando área disponível com teclado. Evidência em `android/app/build/reports/native-ui/`. Alvos primários têm 48 px/dp nas medidas de teste; fonte 14–17 sp para ações e conteúdo, título 23 sp. Cabeçalho 52 dp; faixa de estado compacta no fluxo; nenhuma barra cobre o compositor. Caixa mantém o padrão preto quente/laranja/fundo claro, separadores discretos e conteúdo prioritário. Rascunho e rolagem são preservados nas atualizações da conversa.

Lint release sem erros. Corrigido recurso de navegação da versão anterior que exigia API 27, com variante values-v27; minSdk 26 preservado. Package/versão e assinatura conferidos com aapt/apksigner; certificado igual ao da 1.0.0.

Resultado: **APROVADO COM LIMITAÇÃO**. Testes Android simulados, compilação e verificações de assinatura não comprovam entrega FCM/WorkManager nem instalação em um Android físico. O sistema/fabricante pode atrasar trabalhos; não se promete processo permanentemente ativo nem a mesma latência do WhatsApp.
