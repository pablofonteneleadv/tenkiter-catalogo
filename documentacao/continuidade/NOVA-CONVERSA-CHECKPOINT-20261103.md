# Nova conversa — checkpoint em revisão

Trabalho interrompido por prioridade do proprietário: corrigir/retomar fila de postagens em03/11. Não publicar este lote sem concluir validação.

Inclui endpoint /msg/iniciar, painel Mais→Nova conversa, reutilização de WhatsApp pelo número, Instagram por @ conhecido (sem envio frio), tabela aditiva msg_instagram_usuario e atualização pelo webhook autenticado. Não envia nada ao abrir. Fonte baseada emmain7.40.32.

438 verificações de conversa passaram, incluindo @bialima via webhookZernio com nome de exibição Bia Lima. Teste worker_acompanhamento falha linha107: um número inválido com prefixo+00 é aceito pela normalização; validar formato/código de país antes de pessoaTelefone_. Corrigir. Faltam jornada UI, ACL específica, conflitos/troca de username, migração/backup/revisão e CI/deploy. Sem bump de versão ou deploy deste trabalho.

Filas7.40.32 publicadas: PR307, mergef2f0e0b04cf22add4114d0b1248909acdeb77035, CI40999258264 verde, deploy40999863265 concluído, version.json confirmado2026-10-30T03:54:51Z; assetSHA256e8bf57ff4723225a76f023529f0597f336a0771f20ebb8b718f32d369200ca1a. Auditoria final pendente no Cofre54 (branch remota preservada).
