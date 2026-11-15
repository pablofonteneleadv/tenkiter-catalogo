---
name: tenkiter-bug-vira-teste
description: Use sempre que um bug for encontrado ou corrigido no TENKiTER (site, Esteira, Workers). Todo bug vira um teste que falha antes da correção e passa depois, registrado no manifesto de testes por impacto para rodar no CI certo. Cobre também o caso sandbox x produção.
---

# Todo bug vira teste

Inspirada em ECC skills/ai-regression-testing (MIT). Quando a mesma IA escreve e revisa a correção, a revisão herda o ponto cego da escrita: a correção "parece certa" e o bug volta. Só um teste automático pega esse cego.

## Regra

Bug sem teste não está corrigido. A PR de correção contém: (1) teste que reproduz o bug, (2) a correção, (3) registro no manifesto. Se o teste não puder existir, a PR diz por quê.

## Passo a passo

1. **Reproduza primeiro.** Escreva o teste a partir do sintoma real (relato do dono, log, tela) e rode-o contra o código SEM a correção. Ele precisa falhar. Teste que nunca falhou não prova nada.
2. **Escolha o tipo e a pasta (`tests/`).**
   - Regra de Worker (D1/KV simulados): `tests/worker_<assunto>.js` (padrão dos existentes, ex.: `worker_esteira.js`, `worker_postagens_limites.js`).
   - Tela/fluxo: `tests/<assunto>_ui.py` com Playwright; base em `TK_BASE` (ver `tests/esteira_processos_ui.py`).
   - Regra pura do front: `tests/<modulo>.js`, como `tests/catalogo_tecido.js`.
   - Imprima uma linha final inequívoca (`PASS ...` ou `FALHAS=0`); o `tests/rodar_tudo.py` confere essa saída.
3. **Teste o contrato, não a implementação.** Verifique o que o usuário vê ou o que a API devolve, e a forma completa: se o bug foi "campo X ausente na resposta", afirme X na resposta e também que o dado chega da origem (a consulta que o produz, não só o objeto montado).
4. **Registre no manifesto** `scripts/ci/testes_impacto_manifesto.json`: em `tests`, a chave `"tests/<arquivo>"` com a lista de módulos de impacto (`catalogo`, `mensagens`, `postagens`, `esteira`, `fotoia`, `midia`, `treinamentos`, `push`, `infra`, `padroes`, `ci`). Ao escolher, siga `docs/ia/testes-por-impacto.md`: inclua o módulo vizinho se o bug cruza serviços compartilhados.
5. **Confira o registro.** Rode `python3 scripts/ci/inventario_testes.py --fail-on-regression` (teste sem registro é órfão) e `python3 scripts/ci/testes_impacto.py planejar --arquivos <alterados>` com a lista dos arquivos alterados para ver que o módulo certo seleciona o teste. Teste novo também entra em `tests/rodar_tudo.py` quando pertencer à bateria completa.
6. **Rode o teste novo e os vizinhos do módulo.** Não rode a bateria inteira por hábito.

## Caso sandbox x produção

Código com dois caminhos (teste/simulado e real) esconde bug no caminho real: o teste passa no simulado, o mesmo bug existe em produção. Exemplos aqui: Wafly/Wame e Zernio simulados nos `tests/worker_wafly.js`, `worker_wame.js`; D1 simulado nos `worker_*.js`.
- O teste do bug cobre o caminho real quando possível (ex.: a consulta SQL/`SELECT` de fato usada, a forma do corpo do webhook real).
- Se só o simulado puder rodar, registre no log "validado só em simulação" (regra 16 do `CLAUDE.md`) e deixe o item na lista de conferência pós-deploy (`tenkiter-canario-pos-deploy`).
- Quando uma correção toca "resposta + consulta", teste as duas pontas: o bug clássico é adicionar o campo na resposta e esquecer de buscá-lo.

## Não fazer

- Corrigir e depois escrever o teste olhando a correção: ele vai confirmar o erro.
- Apagar ou afrouxar teste existente para passar o CI.
- Teste que depende de rede real, de relógio sem controle ou de dados de cliente.
