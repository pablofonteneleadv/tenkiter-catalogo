> Atual: [APK 2.2 — seleção corrigida e funções administrativas nativas](APP-2.2.md). Este documento registra a versão 2.1.

# TENKiTER Mensagens 2.1.0

Instale pelo botão **Atualizar app**, sem desinstalar. A assinatura, conta e banco são preservados. O Android pede confirmação da instalação.

## Atendimento nativo

- Canais Todas, WhatsApp 1, WhatsApp 2 e Instagram com contagens das conversas salvas. Deslize a faixa para ver os demais canais/filtros. Mensagens e Grupos podem ficar ligados juntos ou separadamente. Não lidas, Falta responder, Nos 2 WhatsApp e Encerradas distinguem estados diferentes.
- Ordem por última mensagem, recebida ou enviada. O número de não lidas conta mensagens; Falta responder mostra tempo desde a última entrada quando a última direção é do cliente.
- **Espiar** abre sem marcar leitura e sem campo de envio. **Abrir para responder** passa ao atendimento normal. Leitura só é confirmada enquanto a tela nativa e o aplicativo estão visíveis, com sessão válida; o servidor respeita a configuração de leitura do canal no celular.
- Menu ⋮ → **Selecionar conversas**, ou segure uma conversa. Marque até 50 e escolha lidas, não lidas, encerrar ou reabrir. Encerramento pede motivo (concluído, vendeu, sem resposta, engano/spam). Marcar não lida ou encerrar a conversa aberta retorna à lista para preservar o estado escolhido.
- Busca local imediata e consulta no servidor após pausa de digitação; o servidor também pesquisa texto do histórico. Encerradas busca no servidor ao ativar o filtro. A carga traz até mil conversas e passa a consultar mudanças; paginação usa data e ID para não perder empates de horário.

## Na conversa

- **Produtos:** busque nome/código/tamanho/cor, marque até 60 e coloque no rascunho o produto ou seleção com links do site. Preço à vista segue a regra de common.js, com desconto extraído no build e fixtures de paridade. O usuário revisa o texto antes de enviar.
- **Respostas:** insira uma resposta no rascunho; adicione, edite ou exclua respostas compartilhadas da equipe. Salvar altera o mesmo cadastro do site. Menu da conversa → Configurar assinatura usa o nome e a configuração existentes; a assinatura é aplicada no envio de texto/legenda.
- **Anexar:** escolha foto, vídeo ou áudio, ou grave áudio AAC de até dois minutos. A gravação pode ser ouvida/parada antes da confirmação. Arquivo só sai depois de confirmar Enviar. Ao sair da tela a gravação é descartada, sem envio. Fotos até 8 MB e vídeos/áudios até 16 MB; o servidor valida formato. Instagram recebe anexo sem legenda, conforme a regra do serviço.
- Fotos abrem numa janela nativa. Áudio, vídeo, PDF e outros arquivos usam um visualizador Android com permissão temporária de leitura; não recebem sessão/token. Contextos de mensagens/status podem ser abertos pelo botão Ver contexto. Contato/localização continuam legíveis.
- Mensagens anteriores carregam até mil mensagens locais por conversa. O atendimento completo no menu continua disponível para histórico além do cache e configurações avançadas (contatos, diagnósticos e métricas).

## Notificações

O servidor valida a sessão e a permissão do atendente antes de enviar ao OneSignal. O aviso leva nome/canal e até 220 caracteres do texto ou tipo de mídia; grupos também mostram autor. Não leva sessão, URL privada de mídia ou chave de API. Tarefa atrasada consulta a última entrada para não substituir a prévia atual por uma antiga. Conversas já lidas/encerradas ou mensagens apagadas não geram aviso atrasado.

Expanda a notificação para ver **Espiar** e **Abrir conversa**. Tocar no aviso ou em Espiar abre a prévia sem marcar leitura. Abrir conversa faz a abertura normal. O conteúdo na tela bloqueada respeita a configuração de privacidade do Android (visibilidade privada). O sistema decide a apresentação/expansão; não há instalação silenciosa nem serviço de microfone permanente.

Push dispara sincronização sem marcar leitura; WorkManager mantém recuperação periódica. Entrega real, tela bloqueada, microfone, codecs e visualizadores ainda precisam ser conferidos no aparelho. Compilação, fluxos e payloads foram testados com Android/serviços simulados, sem envio real de teste.

## Dados e segurança

Banco privado com até mil metadados de conversas; até mil mensagens por conversa e histórico de cem conversas recentes. A leitura local continua sujeita à validade de 24h desde a última confirmação de acesso. Sessão cifrada por Android Keystore. Sem URLs/chaves de mídia no banco e sem backup Android. Mídias recebidas são temporárias, com limite de download de 32 MB e cache de até 64 MB/uma hora (também removido ao abrir o app, sair ou trocar conta). Arquivos de gravação são temporários. Resultados tardios da conta anterior são descartados; sair limpa banco, pendências e arquivos temporários.
