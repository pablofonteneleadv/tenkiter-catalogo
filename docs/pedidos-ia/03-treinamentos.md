# 03-treinamentos — TREINAMENTOS (P-10, P-16 parte permitida, P-25 esqueleto, P-18 só nota)

Leia antes `INSTRUCOES-IA.md` (raiz) e as regras do `CLAUDE.md` que tocam estes arquivos.

**P-10 · Manual rico com Doc real** (sem acesso ao Doc): revise `analisarDocManual_` (runs/cor/marca-texto/links, `getPositionedImages`, tabela 1×N com foto numa célula, vídeo em linha/chip, citação `> `) atrás de casos que a API real do Docs devolve diferente do simulador: foto em linha + texto no mesmo parágrafo, foto em tabela aninhada, texto vazio, `getPositionedImages` sem tamanho, cor `null`, link `#bookmark`, vídeo `youtu.be`/`shorts`/Drive com `usp=sharing`. Acrescente casos ao `backend_manual_rico.js` e deixe o parser tolerante (nunca lançar; ignorar o que não entende). Se mexer: RH **3.18**.
**P-16 · Conteúdo protegido fase 2 — parte permitida**: (a) em `treinamentos.html`, preparar a remoção dos 3 manuais embutidos (`app-data`): servidor vira fonte única quando `conteudoProtegido`; reserva embutida só se o servidor não responder; (b) no backend RH, ação/bandeira para **fechar o GET público** `manuais_lista`/`config_quiz` (`listaFechada`), **desligada por padrão**. **BLOQUEADO**: rotacionar o token antigo e ligar a bandeira (precisa aprovação do dono) — documente o passo a passo.
**P-25 · Manual 2 — BLOQUEADO** (falta o tema). Entregue só `proposta/manual2-modelo.md` no formato do Manual 1 (clique a clique, enxuto; caixas Relaxa/Atenção/Dica/Exemplo/Regra de ouro; "Faça agora"; "Checagem:"; ponte para "Peça a explicação completa"), com `[TEMA]`.
**P-18 · Doc "Questões de práticas" por card — NÃO FAZER agora** (dono pediu para ~1 mês). Só descreva em 10 linhas o desenho sugerido.

## Testes do setor
`manual_rico.py`, `modulo0_verificado.py`, `conteudo_protegido.py`, `backend_manual_rico.js`, `backend_func.js`, `backend_v316.js`, `provas_v52.py`, `excluir_avaliacao_lento.py`, `jornada_funcionaria.py`
