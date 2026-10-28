# TENKiTER Mensagens 2.4.0

Código 7. A tela principal do app passa a ser a mesma tela **Mensagens** do site (`admin.html?app=mensagens`). Qualquer mudança publicada no site aparece no app sem precisar de um APK novo.

- O app mantém a página aberta enquanto está em segundo plano: ao voltar, as conversas continuam carregadas.
- Girar a tela não recarrega a página.
- O botão Voltar fora de uma conversa manda o app para o fundo, sem fechar.
- Tocar num aviso abre a conversa direto no site.
- A sincronização nativa a cada 4 s fica pausada com o site aberto, o que economiza bateria e leituras do D1. Avisos e sincronização em segundo plano continuam.
- A sessão do app só é copiada para o site quando o site ainda não tem uma. Assim, **Menu → Trocar usuário…** (site 7.40.7) funciona também dentro do app.
- Sem conexão, o app avisa e tenta abrir de novo sozinho.

Publicação: instalar por cima exige o APK assinado com a mesma chave das versões anteriores. Veja `PUBLICAR-VERSAO.md`. O `android/latest.json` só muda depois que o APK assinado estiver no release `android-v2.4.0`.

## Versão de teste

Cada PR do app gera no GitHub o artefato `TENKiTER-Mensagens-Android`, com o APK de depuração. Ele se chama **Mensagens TESTE** (pacote `br.com.tenkitermodas.mensagens.teste`) e instala **ao lado** do app oficial, sem substituí-lo. Os avisos (push) podem não funcionar nessa versão de teste.
