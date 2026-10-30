---
name: tenkiter-android-release
description: Procedimento obrigatório de versionamento, assinatura, publicação e atualização do APK Android TENKiTER após mudanças que afetem o aplicativo.
---

# TENKiTER — release Android ponta a ponta (OBRIGATÓRIO)

## Regra inegociável
Quando qualquer alteração exigir APK novo, o trabalho NÃO termina no merge do código, no deploy do site ou na criação isolada de uma GitHub Release. A entrega só está concluída quando o APK assinado está publicado, o manifesto público anuncia exatamente essa versão e o botão **Mais > Atualizar app** detecta a atualização, baixa, valida e oferece instalação sobre a versão anterior, preservando dados.

Aplicar antes de editar, antes do merge e após o deploy. Não pedir ao usuário para realizar etapas técnicas repetitivas; automatizar e verificar. Não declarar sucesso com base apenas em workflow verde.

## Quando exigir APK novo
- Mudança em `android/app/**`, código Kotlin/Java, Gradle, Manifest, permissões, notificações, ponte nativa, captura de mídia, instalação, updater ou recursos embarcados.
- Mudança em arquivos compartilhados usados no build nativo (por exemplo `common.js`) que altere comportamento ou configuração incorporada ao APK.
- Mudança em assinatura, packageId, configuração de build, SDK ou distribuição.
- Mudança só no HTML/CSS/JS servido remotamente pode dispensar APK **somente após verificar** que o app carrega o conteúdo remoto e não depende de mudança nativa. Documentar a decisão no PR.
- Mudança na própria automação de release requer teste controlado do pipeline; evitar gerar versão fictícia.

## Pipeline obrigatório
1. Identificar versão anterior no `android/latest.json`, `android/app/build.gradle`, releases e versão efetivamente servida por `https://tenkitermodas.com.br/android/latest.json`.
2. Garantir incremento monotônico de `versionCode` e `versionName` (ex.: 2.4.5/code 12 -> 2.4.6/code 13). Nunca reutilizar tag/versionCode; nunca gerar duas versões concorrentes para o mesmo commit.
3. Executar `:app:testDebugUnitTest`, `:app:lintDebug`, `:app:assembleRelease` com Java/Gradle/Android SDK configurados.
4. Assinar **com a chave original**, recuperada exclusivamente dos GitHub Actions Secrets `ANDROID_KEYSTORE_B64` e `ANDROID_KEYSTORE_PASSWORD`; alias `tenkiter`. Nunca registrar, imprimir, expor ou versionar chave/senhas. Falhar fechado se ausentes.
5. Verificar com `apksigner verify --verbose --print-certs`: APK válido, package `br.com.tenkitermodas.mensagens`, versionCode correto e fingerprint SHA-256 do certificado igual ao APK anterior de produção. Não confundir hash SHA-256 do arquivo com fingerprint do certificado. Se não houver APK anterior confiável, não afirmar compatibilidade; bloquear atualização automática até conferir.
6. Publicar release `android-vX.Y.Z` com `TENKiTER-Mensagens-X.Y.Z.apk` e arquivo `.sha256`. Verificar download, tamanho e SHA-256 publicados; nunca substituir silenciosamente release existente.
7. Atualizar `android/latest.json` com `versionCode`, `versionName`, `bytes`, `sha256`, `url` e `notes` **da mesma release**.
8. A branch `main` é protegida: nunca usar `git push origin HEAD:main` em GitHub Actions. Abrir PR para atualizar o manifesto, executar CI obrigatório e fazer merge permitido. Preferir pipeline serializado/único que garanta publicação do APK antes do manifesto e evite recursão ou versões extras. Não desativar proteção da branch.
9. O merge do PR de funcionalidade que exigir APK deve acionar a publicação automaticamente; o merge do PR do manifesto deve acionar o deploy do site. Não depender de workflow_dispatch manual. Conferir que os gatilhos por paths cobrem as alterações relevantes.
10. Após deploy, fazer GET sem cache em `https://tenkitermodas.com.br/android/latest.json` e comparar TODOS os campos críticos com a release; exigir `Cache-Control: no-store`, URL acessível e artefato íntegro. Se falhar, workflow vermelho, alerta claro e correção, sem anunciar sucesso.
11. Validar jornada do botão `Mais > Atualizar app` em versão anterior: deve mostrar versão nova, baixar, validar tamanho/hash/package/versão/certificado, pedir permissão Android quando necessário e abrir instalador para atualização **sem desinstalar**. Conferir após instalação que versão instalada mudou e sessão/dados permaneceram. Testes automatizados devem cobrir manifesto antigo, cache, falha de rede, divergência de assinatura, versão não superior e URL inválida.
12. Registrar no PR/release: versão antiga/nova, versionCode, commit, link da release, hash do APK, fingerprint de assinatura comparado, execução CI, deploy, manifesto público e evidência do teste do botão. Se teste em aparelho não for possível, registrar explicitamente **não validado em dispositivo**, não inventar aprovação.

## Falhas conhecidas (30/10/2026)
A release 2.4.6 foi criada mas o manifesto ficou em 2.4.5: `android-auto-release.yml` tentou push direto na `main` e recebeu `GH006: Protected branch update failed`. O job de deploy ficou verde porque comparou o site com o manifesto **antigo** no repositório. Portanto:
- Nunca usar sucesso do deploy como prova de que a versão mais recente foi anunciada.
- Comparar manifesto com a **última release estável válida**, além do arquivo local.
- A publicação do manifesto deve usar PR/CI/merge compatíveis com proteção, ou mecanismo transacional aprovado que preserve a proteção.
- O pipeline deve falhar quando existir release mais nova sem manifesto correspondente; criar alerta e recuperação idempotente.
- Evitar corrida entre workflow de APK e deploy; definir dependências explícitas, serialização e deduplicação.

## Critérios de aceite
**Concluído** somente se: CI verde; APK release assinado e certificado compatível; release e checksum íntegros; manifesto atualizado na main e no site; botão detecta e oferece a versão; instalação sobre versão anterior validada (ou marcada como pendente se não houver aparelho). Se qualquer item falhar, reportar **parcial/incompleto**, identificar etapa e corrigir antes de encerrar.
