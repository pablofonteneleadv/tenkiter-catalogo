# 06-infra — INFRA CLOUDFLARE / CATÁLOGO (P-20, P-23 — só preparar)

Leia antes `INSTRUCOES-IA.md` (raiz) e as regras do `CLAUDE.md` que tocam estes arquivos.

**P-20 · R2/Cloudinary/D1 — BLOQUEADO para executar** (só com pedido do dono). Entregue `proposta/infra-r2-d1.md`: passos, ordem, riscos, testes e custo de (a) apagar do R2 ao excluir peça (verifique se o Worker `tenkiter-midia` já tem rota de apagar), (b) migrar a mídia antiga do Cloudinary com cópia+conferência antes de trocar, (c) D1 com gravação dupla. Código só se trivial e totalmente testável com R2 falso; nada ativo em produção.
**P-23 · `/lista.json` rápida — PARADO de propósito** (mediu ~1,1 s = Apps Script; falta cache de borda). Pode preparar, **desligado** (`LISTA_RAPIDA_URL` continua vazia), cache KV de TTL curto com invalidação no Worker `tenkiter-og`, com testes em `worker_og.js` e `lista_rapida.py`.

## Testes do setor
`worker_midia.js`, `worker_og.js`, `lista_rapida.py`, `midia_r2.py`, `instagram_admin.py`
