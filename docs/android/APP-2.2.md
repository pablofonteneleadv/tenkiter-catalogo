# TENKiTER Mensagens 2.2.0

Atualize pelo botão **Atualizar app**, sem desinstalar. A faixa abaixo do cabeçalho informa **v2.2.0**; o Android ainda pede a confirmação da instalação. Código 5, mesma assinatura das versões anteriores.

## Selecionar e encerrar

Segure o texto, avatar ou Espiar de uma conversa para selecionar sem abrir. Também pode tocar **Selecionar**, visível acima da lista, ou tocar no avatar. Marque as conversas e use **Encerrar**, que fica na barra de seleção; informe o motivo. **Lidas** e **Mais → Não lidas/Reabrir** usam as mesmas regras do atendimento completo. São até 50 por lote; Cancelar sai da seleção. A atualização da lista aguarda o fim do toque para não cancelar o gesto.

## Funções do atendimento na tela nativa

No menu **⋮** da lista:

- **Painel de atendimento:** espera atual, primeira resposta, encerramentos, perguntas por hora, canais e períodos de 7/30/90 dias. Toque nas conversas que esperam há mais tempo para atender.
- **Configurações de leitura e nome:** confirmação de leitura por canal, últimas tentativas, nome do atendente e assinatura compartilhada. Só Salvar altera a configuração.
- **Conexões e gravação:** ativar recebimento/envios/leituras nos WhatsApps, pausar/retomar, diagnósticos WhatsApp e Instagram, guardar segredo Meta, assinar mensagens e copiar webhook protegido. Confirme as operações de alteração.
- **Google Contatos:** ligar a ponte existente, fazer cópia no Drive, gerar/ver relatório e desligar. Relatório não junta nem apaga contatos. **Aplicar a limpeza aprovada**, no relatório, pede confirmação e faz cópia nova antes de juntar/padronizar/criar contatos; ao terminar liga o cadastro automático. Essa operação altera contatos reais, diferentemente de gerar o relatório.
- **Exportar conversas:** TXT para IA, CSV ou JSON; todas, canal ou conversa; datas inicial e final. O Android abre Salvar/Compartilhar e o usuário escolhe o destino. Arquivos grandes podem ser limitados pelo servidor, com aviso para dividir por datas.

No menu de uma conversa: encerrar/reabrir, marcar não lida, abrir no outro WhatsApp, leitura/assinatura, copiar texto para IA e exportar. **Espiar** conserva não lida e oculta o envio; **Abrir para responder** inicia atendimento normal. Produtos, respostas rápidas, anexos e gravação continuam disponíveis.

Produtos agora mostram foto, quantidade e filtro de estoque; busca ignora acentos e combina termos. A seleção permanece entre buscas, pode ser limpa e pode virar link copiado ou rascunho. Preços usam a mesma regra do catálogo. Respostas rápidas permitem adicionar/editar/excluir, com salvamento explícito. Nada é enviado ao inserir rascunhos.

**Mensagens anteriores** consulta o servidor e conserva páginas antigas em memória enquanto a conversa está aberta, além da janela de mil mensagens do banco. **Nova mensagem ↓** aparece se você estiver lendo acima do final. **Stories publicados** pode abrir a mídia autenticada do post. Erros de envio exigem conferência; descartar aviso local não apaga mensagem do servidor e não envia novamente.

## Notificações e dados

Continuam as notificações de 2.1 com nome, canal, prévia e ações **Espiar/Abrir conversa**. Espiar não confirma leitura. Push e WorkManager sincronizam em segundo plano, sujeitos à conexão e às restrições do Android; não há promessa de processo permanente. A lista consulta alterações a cada quatro segundos em primeiro plano, com cache local imediato.

A lista local mostra até mil conversas por consulta; busca também consulta o texto no servidor. Banco mantém mil mensagens por conversa em cem conversas recentes; páginas anteriores abertas ficam temporariamente em memória. Sessão cifrada e validade local máxima de 24h desde a confirmação de acesso. Exportações/mídias temporárias: até uma hora/64 MB, removidas ao abrir o app, sair ou trocar de conta. Chaves de integração ficam no servidor; não são incluídas no APK, exportação ou banco local. URLs externas de fotos públicas usam download anônimo permitido, sem enviar sessão.

A prévia de links acompanha o painel web atual: ao escrever um link no WhatsApp, **Mostrar prévia do link (miniatura)** aparece acima do campo; começa desmarcada e lembra a escolha por canal. Não se aplica a anexos ou Instagram. Produtos/seleções usam o título correspondente quando o catálogo já foi consultado.

Cópia e relatório de Google Contatos usam partes, com andamento visível, tela mantida acesa enquanto o app está aberto e **Parar após esta parte**. A cópia requer a ponte atualizada (1.2 para limpeza). Se interromper ou perder conexão, recomece; relatório/cópia não aplicam limpeza. Na limpeza confirmada, alterações já aplicadas permanecem se parar.

O menu Atendimento completo continua como alternativa, mas as operações listadas acima já são nativas. Veja [matriz de funções](PARIDADE-ATENDIMENTO-2.2.md) e [revisão visual](../revisoes/android-paridade-2.2.md).

38 testes Robolectric, lint Release e compilação assinada passaram. Instalação, teclado real, TalkBack, microfone/codecs, compartilhamento com outros apps e entrega de notificação com app fechado precisam de conferência no aparelho. Nenhuma mensagem, notificação ou alteração de conexão real foi usada como teste.
