# TENKiTER Mensagens 2.4.0

Código 7. A tela principal do app passa a ser a mesma tela **Mensagens** do site (`admin.html?app=mensagens`). Qualquer mudança publicada no site aparece no app sem precisar de um APK novo.

- O app mantém a página aberta enquanto está em segundo plano: ao voltar, as conversas continuam carregadas.
- Girar a tela não recarrega a página.
- O botão Voltar fora de uma conversa manda o app para o fundo, sem fechar.
- Tocar num aviso abre a conversa direto no site.
- A sincronização nativa a cada 4 s fica pausada com o site aberto, o que economiza bateria e leituras do D1. Avisos e sincronização em segundo plano continuam.
- A sessão do app só é copiada para o site quando o site ainda não tem uma. Assim, **Menu → Trocar usuário…** (site 7.40.7) funciona também dentro do app.
- Sem conexão, o app avisa e tenta abrir de novo sozinho.

## Nova assinatura (28/10/2026)

A chave das versões 1.0 a 2.3 se perdeu. A 2.4.0 é assinada com uma chave nova (alias `tenkiter`, certificado SHA-256 `09ed81d57207c72a9d49cc5065483a22f57a15528d8a626aa3a99467e1b59a76`).

- **Só desta vez:** desinstale o app antigo e instale a 2.4.0 pelo link do release `android-v2.4.0`. Login e conversas voltam do servidor.
- O botão "Atualizar app" das versões antigas recusa esta versão, porque a assinatura é diferente. Isso é esperado.
- A partir da 2.4.0, as atualizações voltam a instalar por cima.
- A chave e a senha ficam com o Pablo, fora do repositório. Ele cadastra os Secrets `ANDROID_KEYSTORE_B64` e `ANDROID_KEYSTORE_PASSWORD` para o workflow "APK Android" assinar sozinho.

## Versão de teste

Cada PR do app gera no GitHub o artefato `TENKiTER-Mensagens-Android`, com o APK de depuração. Ele se chama **Mensagens TESTE** (pacote `br.com.tenkitermodas.mensagens.teste`) e instala **ao lado** do app oficial, sem substituí-lo. Os avisos (push) podem não funcionar nessa versão de teste.

## 2.4.1 (código 8)

- A tela carregada fica guardada (`WebKeeper`) enquanto o processo do app vive. Fechar e abrir de novo não recarrega tudo. Se o Android encerrar o app para liberar memória, a primeira abertura carrega de novo.
- Site 7.40.8: no app, a janela Mensagens reabre sozinha se o Voltar a fechar. Antes ficava a tela bege com a barra Catálogo/Gestão.
