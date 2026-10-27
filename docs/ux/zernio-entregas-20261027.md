# Conexões: conferir as entregas do Zernio — 27/10/2026 (site 7.38.2)

Pedido: "Já tem 40 segundos do último oi". As DMs das 18:12 não chegaram ao servidor (o último aviso do Zernio foi às 17:57).

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `zernio-entregas-20261027/06-diagnostico-390.png`.

## Tarefa humana
O gestor descobre, num toque, se o problema está no Zernio (aviso desligado, entrega recusada) ou no nosso servidor, sem abrir o site do Zernio.

## Como ficou
- Com a chave e o Instagram guardados aparecem "Conferir entregas" e "Testar aviso" (secundários, 44 px), abaixo da mensagem do bloco.
- O resultado fica escrito no bloco (role=status), em linhas curtas com ✓/✗ e o que fazer: aviso ativo ou desligado pelo Zernio, endereço e Instagram certos, últimas entregas com data, evento, situação e código HTTP, e o último aviso recebido aqui.
- Sem JSON, sem chave nem segredo.

## Testes
- `conexoes_zernio` 30 (4 novas), `worker_mensagens_conversa` 247 (4 novas). axe sem falhas sérias; sem rolagem horizontal.

Resultado: APROVADO COM LIMITAÇÃO. O formato do histórico de entregas do Zernio foi tirado da documentação deles; a tela tolera nomes de campo diferentes.
