# Publicar versões do APK

1. Parta de `main` em branch `ia/...`; preserve backup. Aumente `versionCode` (sempre crescente) e `versionName` em `android/app/build.gradle`.
2. Faça as alterações, execute testes Android e revisão estética. Compile release usando a assinatura já preservada (`TK_ANDROID_KEYSTORE`, `TK_ANDROID_STORE_PASSWORD`, alias `tenkiter`). Não gere uma chave nova.
3. Confira `apksigner verify --print-certs`, package `br.com.tenkitermodas.mensagens`, versionCode/name, tamanho e SHA-256. A assinatura deve ser a mesma da 1.0.0.
4. Prepare `android/latest.json` com `versionCode`, `versionName`, `bytes`, `sha256`, `notes` e URL do asset da release (`https://github.com/pablofonteneleadv/tenkiter-catalogo/releases/download/android-vVERSAO/TENKiTER-Mensagens-VERSAO.apk`). Use `scripts/release/manifest_android.py`.
5. Publique o APK assinado e seu SHA256 na release/tag `android-vVERSAO`, apontando para o commit testado da branch. Não publique tokens, JSON Firebase, senhas ou JKS. Leia o asset e compare hash antes de liberar o manifesto.
6. Preserve também APK e fonte em release no `Tenkiter-cofre` privado. A distribuição não deve depender de senha do GitHub dentro do app.
7. Abra PR, aguarde CI verde (inclui testes e compilação Android), faça merge/deploy pelo fluxo usual autorizado. Confirme `version.json`, `android/latest.json` e download do asset.
8. No aparelho com a versão anterior que já possua o botão (2.0.0+), toque “Atualizar app”, baixe e confirme o instalador. Confira login, banco e avisos após atualizar.

O workflow manual “APK Android” também compila release quando os GitHub Secrets `ANDROID_KEYSTORE_B64` e `ANDROID_KEYSTORE_PASSWORD` estiverem configurados. A integração desta sessão não pôde cadastrá-los anteriormente; a compilação local assinada continua disponível com o backup privado da chave.
