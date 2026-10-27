# Android TENKiTER Mensagens

App Android nativo de Mensagens com banco SQLite, OneSignal e WorkManager. WebView é usado apenas para login alternativo e atendimento completo. Requer JDK 21, Gradle 8.10.2, Android SDK 35 e build tools. Build de desenvolvimento: `gradle -p android :app:assembleDebug`.

Build assinado: configure `TK_ANDROID_KEYSTORE` (caminho da chave privada), `TK_ANDROID_STORE_PASSWORD`, alias `tenkiter`, e execute `gradle -p android :app:assembleRelease`. Não gere uma chave diferente para atualizar a instalação existente.

Leia `docs/android/INSTALAR-E-ATIVAR.md` no repositório. Segredos Firebase/OneSignal nunca vão neste projeto. App ID OneSignal e package Android são identificadores públicos.

Versão 2.0: `docs/android/APP-2.0.md`. Atualizações: `docs/android/PUBLICAR-VERSAO.md`; manifesto público `android/latest.json`.
