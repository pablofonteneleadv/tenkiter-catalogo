# Android TENKiTER Mensagens

App Android nativo de Mensagens com banco SQLite, OneSignal e WorkManager. WebView é usado apenas para login alternativo e atendimento completo. Requer JDK 21, Gradle 8.10.2, Android SDK 35 e build tools. Build de desenvolvimento: `gradle -p android :app:assembleDebug`.

Build assinado: configure `TK_ANDROID_KEYSTORE` (caminho da chave privada), `TK_ANDROID_STORE_PASSWORD`, alias `tenkiter`, e execute `gradle -p android :app:assembleRelease`. Não gere uma chave diferente para atualizar a instalação existente.

Leia `docs/android/INSTALAR-E-ATIVAR.md` no repositório. Segredos Firebase/OneSignal nunca vão neste projeto. App ID OneSignal e package Android são identificadores públicos.

Versão 2.0: `docs/android/APP-2.0.md`. Atualizações: `docs/android/PUBLICAR-VERSAO.md`; manifesto público `android/latest.json`.

## APK automático
O workflow `.github/workflows/android-auto-release.yml` roda após alterações Android aprovadas e integradas na `main`, ou manualmente pelo GitHub Actions. Ele testa, compila com a chave de assinatura original, cria a versão no GitHub Releases, disponibiliza o APK e atualiza `android/latest.json` para o aviso de atualização do app.

**Pré-requisitos:** os secrets `ANDROID_KEYSTORE_B64` e `ANDROID_KEYSTORE_PASSWORD` devem conter a chave original do aplicativo instalado. Sem eles, o fluxo falha sem publicar APK incompatível. O repositório precisa permitir que GitHub Actions escreva no conteúdo e publique releases. Alterações só na interface web não geram APK automaticamente, pois o aplicativo carrega o site sem precisar reinstalar. A instalação de novas versões ainda requer confirmação do Android; não há instalação silenciosa.

**Validação:** acompanhe Actions → Android APK automático. O download assinado fica em Releases, com hash SHA-256. Evite disparar builds paralelos e não altere o package ID.
