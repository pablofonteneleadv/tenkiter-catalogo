# 01-testes-ci — TESTES E CI (P-11, P-12, P-13)

Leia antes `INSTRUCOES-IA.md` (raiz) e as regras do `CLAUDE.md` que tocam estes arquivos.

**P-11 · Bateria noturna falhou ("exit code 1")** em 18→19/10. Causa provável: `backend_gs.js`/`backend_contas.js`/`backend_func.js`/`backend_v316.js`/`backend_manual_rico.js` leem o `.gs.txt` (que não está no repo público). `rodar_tudo.py` já PULA esses (`PRECISA_GS`) e anota `::error` por teste que cai. Rode o que for possível aqui, separe **falha de ambiente** (sem ffmpeg, sem fontes do Google, sem rede) de **bug real** e corrija os bugs reais. Nesta pasta só há parte do site: o que precisar do resto, descreva no relatório em vez de adivinhar.
**P-12 · Fixture velha (C1)**: `tests/backend_contas.js` falha com 3.16 e 3.17 porque a fixture espera `recuperar_senha` sem `precisaGestao`. Atualize a fixture ao comportamento real (conta sem CPF/nascimento, ou da equipe sem os dois → `precisaGestao`). Não mexa no backend para agradar o teste.
**P-13 · Falhas antigas**: `selecao_link.py`, `rolagem_infinita.py`, `lista_rapida.py`. Descubra se o teste ficou velho ou o site regrediu e conserte o lado certo. Contexto: seleção por link tem UM botão "Ver os outros produtos do site"; `LISTA_RAPIDA_URL=""` (desligada de propósito) é válido; rolagem infinita usa IntersectionObserver com 1500 px de antecedência.
Critério: nenhuma falha que não seja de ambiente.

## Testes do setor
`selecao_link.py`, `rolagem_infinita.py`, `lista_rapida.py`, `backend_contas.js`, `selecao_vida.py`, `busca.py`, `worker_og.js`, `backend_gs.js`, `backend_func.js`, `backend_v316.js`, `backend_manual_rico.js`
