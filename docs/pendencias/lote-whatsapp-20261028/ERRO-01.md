> Atualização: o proprietário autorizou concluir e publicar o lote em 28/10/2026. As restrições abaixo descrevem a fase anterior; ver PUBLICACAO.md para o resultado final.

# Erro 1 — canal atual/atalho e contexto de status

**Lote em preparação. Não publicar, fazer merge, alterar conexões ou replicar configuração de produção antes da autorização explícita do proprietário.** Próximos erros entram no mesmo lote.

Referências: prints1002050914 e1002050917. Principal deve ser WhatsApp1; reserva WhatsApp2. Números da loja registrados apenas no log privado, sem credenciais no repositório público.

## Evidência e hipótese

No primeiro print o cabeçalho diz WhatsApp1; o botão WhatsApp2 abaixo é navegação para outra conversa vinculada. No segundo cabeçalho WhatsApp2 e botão WhatsApp1 têm o sentido inverso. Isso confirma ambiguidade visual do atalho, não comprova troca do vínculo real das instâncias. O mapeamento do número conectado deve ser verificado antes de inverter qualquer canal.

Consulta de produção somente leitura: o último diagnóstico do reserva já contém statusReply com campos messageId/participant/type/video; a reprodução do vídeo funcionou no aparelho conforme relato do proprietário. O diagnóstico do principal está antigo porque o código só o atualizava para mídia ou contexto reconhecido. Texto recebido sem contexto — justamente a falha investigada — não atualizava a evidência. A causa da ausência de contexto no principal ainda não está confirmada.

## Preparado nesta branch

- Cabeçalho explícito “Canal atual: WhatsApp…” e atalho “Abrir conversa no WhatsApp…”. Teste verifica que o atalho troca somente a conversa selecionada, sem relabelar a atual.
- Diagnóstico de forma para texto sem contexto, mantendo separado o último status reconhecido. Guarda somente nomes de campos, flags e informação do número conectado da própria loja; sem conteúdo de mensagens, número de cliente ou tokens.
- Registro de origem por canal para conferir número conectado e instância após a futura publicação autorizada. Nenhuma troca automática de canais.
- Tratamento de vídeo/statusReply do reserva preservado.

## Pendente para o lote

Comparar as opções das duas conexões e o formato do callback do principal. Replicar somente as opções compatíveis da configuração funcional, preservando a instância, o número e as credenciais próprios de cada canal. Não copiar as credenciais do reserva para o principal. Validar com nova resposta a status quando o proprietário autorizar a publicação/teste; não foram enviadas mensagens reais como teste.

Testes locais: 273 verificações Worker/SQLite/provedores falsos e 43 Android/Robolectric passaram. [Prévia simulada de390px](canal-390.png). Skill de estética aplicada; revisão do rótulo APROVADA COM LIMITAÇÃO de validação física. Não há APK/release/deploy desta pendência. Verificações no aparelho e da configuração real continuam pendentes.
