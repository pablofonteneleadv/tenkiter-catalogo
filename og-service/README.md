# Serviço OG histórico

Este diretório preserva a implementação HTTP anterior das páginas de compartilhamento.
O pipeline atual do repositório publica `og-worker/` no Cloudflare; `og-service/`
não faz parte da distribuição estática nem dos alvos do workflow de Workers.

O código foi preservado para referência e recuperação. Isso não comprova que nenhuma
instância antiga exista fora do pipeline: verificar consumidores e infraestrutura antes
de excluir o diretório ou desativar serviços externos.

Para o fluxo mantido, consultar `og-worker/LEIA-ME.md` e `docs/CI-CD.md`.
