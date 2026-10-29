# Miniatura do link — 7.40.24

Tarefa humana: conferir a foto da peça antes de enviar e reconhecer o link com a imagem no histórico do atendimento.

## Diagnóstico e alteração

A implementação anterior só mostrava a caixa “Mostrar prévia do link”; não desenhava imagem no composer nem na bolha. O envio à Wafly incluía título/descrição montados no cliente, sem imagem. O contrato atual do `/send-link` não oferece parâmetro para enviar a miniatura explicitamente.

- Antes do envio, marcar a caixa mostra a foto da peça (48×48 px), incluindo a foto escolhida por `?f=` quando estiver na galeria.
- O aplicativo conserva um snapshot de título, descrição, endereço e imagem na mensagem. O contexto `link` usa os campos existentes de contexto; não substitui contexto de story ou citação, não cria tabela e acompanha a retenção do histórico. Reabrir não dispara novo envio.
- Para links da loja, `/send-link` recebe o texto e o link, deixando a Wafly ler o OG completo da página, em vez de substituir por título/descrição parciais. Não inventamos um campo de imagem fora do contrato. Links externos preservam o comportamento anterior.
- OG do produto inclui também `og:image:secure_url` e texto alternativo da imagem.
- Domínio da loja validado por origem exata, imagem limitada aos hosts públicos de mídia já usados. Não há fetch de imagem arbitrária pelo servidor, nem alteração de links fornecidos pelo atendente. Caixa desmarcada e Instagram mantêm seus fluxos.

## Evidência e testes

- Consulta pública do produto TK-0786 e da imagem como WhatsApp, navegador e axios: HTTP200; JPEG RGB1080×1350,261666bytes. A identificação Python-urllib recebeu1010; não foi atribuída como causa do defeito do usuário. Nenhuma configuração de segurança foi alterada.
- OpenAPI e documentação da Wafly consultadas em29/10: `/send-link` aceita phone,message,linkUrl e opcionais title,linkDescription,delayMessage. Descreve cartão com imagem, sem parâmetro para fornecê-la diretamente.
- Baseline reproduz ausência da imagem na interface anterior em quatro viewports.
- Worker:424 verificações SQLite real/provedores simulados, incluindo snapshot persistente, imagem não autorizada, caixa desmarcada e ausência de campos parciais no envio da loja. OG:73 verificações. Prévia anterior:24/24; assinatura:22/22.
- Nova jornada completa em320×700,390×844,412×915 e1440×900, texto130%, teclado simulado por altura470px: imagem dentro da viewport, botão Enviar e clipe com alvo≥44px, caixa≥44px, histórico com foto e reabertura sem reenvio. Conteúdo de atendimento simulado; uma execução usou a foto pública da peça0786 para inspeção visual. Screenshots privados no lote20261029-previa-miniatura.
- Revisão visual corrigiu também o corte das ferramentas em texto ampliado, mantendo ícones e rótulos com reticências em telas estreitas. Sem rolagem horizontal. Sem substituir a área da mensagem por painel adicional.

**APROVADO COM LIMITAÇÃO:** a miniatura do aplicativo e o contrato de envio foram testados; a imagem efetivamente recebida pelo WhatsApp via Wafly não foi homologada. Não houve envio real de teste. O novo modo de pedir o cartão depende do processamento de prévia da Wafly. Se o provedor continuar sem devolver a foto, será necessária validação real e correção do provedor; não classificamos uma simulação como prova de entrega.

## Publicação e restauração

Fonte anterior3973fe2cf0c4568b85c1225edac907f3b479ca1f, branchbackup/pre-previa-miniatura-20261029. Backup recuperável da fonte anterior e proposta no Cofre. Publicação pelo merge/CI/deploy.yml. Sem novo APK: a versão2.4.5 carrega a tela web atualizada. Mensagens antigas no WhatsApp não são reenviadas ou alteradas.
