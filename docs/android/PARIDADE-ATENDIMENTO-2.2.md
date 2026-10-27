# Matriz do atendimento completo → Android 2.2

Referência: ações do controlador `admin-mensagens.js`, mantidas nas rotas existentes do Worker. Acesso segue a sessão e a autorização do servidor; não foi ampliada permissão de atendente. A tabela descreve operações, sem prometer carga ilimitada ou apresentação idêntica ao painel web.

| Ações da interface web | Equivalente nativo |
|---|---|
| `aba`, `tipo`, `filtro`, `abrir-canal`, `atualizar` | Faixas de canais/contagens, Mensagens/Grupos, Não lidas/Falta responder/Nos 2 WhatsApp/Encerradas e sincronizar |
| `abrir`, `voltar`, `fechar`, `espiar`, `atender` | Lista/conversa, Voltar e Espiar/Abrir para responder; espiar preserva leitura |
| `selecionar`, `sel-todas`, `sel-sair` | Toque prolongado real, avatar ou Selecionar; selecionar visíveis até 50 e Cancelar |
| `sel-encerrar`, `motivo`, `motivo-cancelar`, `encerrar`, `reabrir` | Encerrar na barra com escolha dos quatro motivos, cancelar e reabrir |
| `sel-lidas`, `sel-naolidas`, `nao-lida` | Lidas/Mais na seleção e menu da conversa |
| `abrir-outro` | Outro WhatsApp no menu da conversa |
| `enviar`, `reenviar`, `descartar`, `fim` | Envio explícito, retry apenas de falha definitiva com chave idempotente, descartar aviso local e Nova mensagem ↓ |
| `gaveta-produtos`, `prod-marcar`, `prodsel-limpar`, `prodsel-usar`, `prodsel-link`, `prod-usar`, `prod-link`, `gaveta-fechar` | Produtos com fotos, busca/estoque, seleção persistente, limpar, copiar link, inserir rascunho e fechar |
| `gaveta-respostas`, `resp-editar`, `resp-usar` | Respostas: adicionar/editar/excluir, inserir e fechar |
| `nome-editar`, `nome-salvar`, `nome-salvar-cfg`, `leitura-cfg` | Configurações de leitura e nome; salvar nome/assinatura e confirmação de leitura por canal, últimas tentativas |
| `anexar`, `anexo-tirar`, `gravar`, `luz-fechar` | Seletor de mídia, remover/cancelar, gravar/parar/ouvir/confirmar e visualizador nativo/Android |
| `story-ver`, `stories-no-ar` | Contexto de mensagem e stories publicados nas últimas 26h; mídia autenticada por post quando necessário |
| `menu-geral`, `menu-conversa` | Menus ⋮ da lista e conversa |
| `exp`, `copiar-ia` | Exportar TXT/CSV/JSON por período/canal/conversa via compartilhamento Android; copiar TXT para IA sem credenciais |
| `painel`, `painel-dias`, `fechar-painel` | Painel nativo com 7/30/90 dias, canais, indicadores, espera, gráfico/detalhe de horas, exportar e fechar |
| `conexao`, `ligar`, `pausar` | Conexões e gravação: WhatsApps, pausa/retomada, diagnóstico e confirmação explícita |
| `segredo`, `assinar` | Diagnóstico Instagram: segredo Meta mascarado, guardar no servidor e assinatura de mensagens |
| `ponte-ligar`, `ponte-backup`, `ponte-relatorio`, `ponte-ver`, `ponte-desligar` | Google Contatos: ponte, cópia no Drive, relatório somente leitura/detalhes e desligamento |

## Verificação e limites

- `NativeInboxTest` (18): gesto real despachado por ListView/filhos e Espiar, atualização durante gesto, seleção/bulk, abertura/leitura, filtros, rascunhos, paginação/histórico além de mil, estados e viewports. O teste antigo que chamava o listener manualmente não demonstrava o gesto; foi substituído.
- `NativeToolsTest` (5): produtos/seleção/estoque/busca/link, respostas, preços com 17 fixtures do catálogo, anexos e microfone/nenhum reenvio automático.
- `NativeAdministrationTest` (9): configuração salva explicitamente, métricas/periodicidade/canal, exportação e datas, cópia sem sessão, limpeza após revogação, pausa confirmada, ponte/relatório sem mutação implícita, controles alcançáveis em várias larguras.
- Serviços e Android simulados (API35/Robolectric); sem efeitos em conversas, conexões ou contatos reais. Sem teste físico de notificações, instalação, codecs ou TalkBack. Notificações existentes foram preservadas; não se afirma que o Android sempre expande o aviso.
- Janela local e exportações têm limites documentados no [guia](APP-2.2.md). O compartilhamento abre o seletor Android, não envia automaticamente para alguém. Relatório de contatos nunca aplica limpeza.
