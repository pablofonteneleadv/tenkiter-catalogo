# QA-01 — Inventário de cobertura executável e trava anti-regressão (12/11/2026)

## Fato comprovado na main `b297aa2db6b3e30b8a2d1b9b9a7251f047b3132a`

Foi lido o Git tree recursivo, o AST de `tests/rodar_tudo.py`, o mapa de impacto e os workflows, sem executar ações reais.

| Grupo | Quantidade | Como interpretar |
|---|---:|---|
| Todos os arquivos `.py/.js/.cjs` imediatamente em `tests/` | **320** | inclui testes, runners e auxiliares |
| Runner completo | **200** | registrado em `SUITES`, não significa que esteja passando |
| Manifesto por impacto | **147** | registrado em `tests` do mapa |
| Interseção (runner e impacto) | **97** | coberto pelas duas estratégias |
| Só runner completo | **103** | dívida para diagnosticar antes de mapear sem teste verde |
| Só impacto | **50** | intencionalmente executado nas seleções por módulo, não no full antigo |
| Chamados diretamente em workflows, fora das duas listas | **4** | `graphify_automatico.py`, `padroes_check_teste.py`, `rodar_tudo.py` e `testes_impacto_seletor.py` |
| Auxiliares explícitos | **4** | `backend_source.cjs`, `mock.py`, `mock_msg.py`, `run_support.py` |
| Sem registro nas duas modalidades nem chamada direta | **62** | risco real de omissão; pode incluir testes manuais ou antigos, NÃO sinal de aprovação |

**Não confundir** `200+147=347` com 347 testes independentes. Existem exatamente 97 em comum; são 250 arquivos registrados em ao menos uma das duas listas. Há 320 arquivos contando auxiliares e candidatos não classificados.

## O que este lote efetivamente corrige

1. `scripts/ci/inventario_baseline.json` congela 320 arquivos em seis classes; cada exceção antiga é listada nominalmente. O baseline NÃO dá aprovação a itens legados.
2. `scripts/ci/inventario_testes.py` usa o AST para o runner e o manifesto explícito; encontra testes citados diretamente na CI e verifica existência dos caminhos.
3. `--fail-on-regression` bloqueia qualquer arquivo novo sem registro, perda de cobertura anteriormente existente no runner/manifesto, remoção silenciosa de chamada direta ou exclusão de arquivo anterior sem reconciliação explícita.
4. `tests/inventario_cobertura_teste.py` cria fixtures temporárias de forma isolada para demonstrar aprovações e reprovações. Nenhum navegador, Apps Script real, cliente, webhook ou Worker de produção é acessado.
5. O job estático da `ci.yml` executa as provas negativas e o inventário em TODA PR. A saída JSON preserva `counts`, `files`, `arquivo`, `execucao` para consumidores anteriores e ganha campos novos `classes`, `contagens`, `erros`.

## O que permanece pendente (sem mascarar dívida)

- Revisar individualmente os **103** testes só full: definir dono, módulo(s), dependências, dados sintéticos e último resultado; adicionar ao manifesto somente se seguros e validados.
- Auditar os **62** arquivos sem registro: determinar se são testes reais, utilitários, provas manuais obsoletas ou testes que devem ser migrados para execução automática. Não eliminar ou registrar como aprovados por heurística.
- Avaliar os **50** testes só impacto: decidir quais devem também integrar o full, com cuidado para não executar duplicadamente o mesmo cenário sem necessidade.
- Conciliar as 12 falhas históricas do full noturno, sem confundir falhas do teste com bugs de produto.
- Prova de mutação e bloqueio do CI precisam estar verdes antes do merge; uma PR somente de inventário não valida Android físico nem integrações reais.

## Procedimento para novas IAs

Ao criar um teste, incluí-lo em `scripts/ci/testes_impacto_manifesto.json` ou `SUITES` de `rodar_tudo.py`, conforme seu escopo. Um teste que só roda por comando direto no workflow deve realmente ter a invocação na CI. Um auxiliar novo exige uma classificação explicada e atualização do baseline.

Ao retirar ou alterar a natureza de qualquer arquivo listado no baseline, justificar na PR: motivo, substituição, impacto e prova de que o comportamento protegido continua coberto. Atualizar baseline em commit auditável, nunca simplesmente desligar o gate para tornar o CI verde.

**Princípio central:** o inventário distingue **arquivo presente**, **caminho de execução configurado**, **teste executado** e **teste aprovado**. Apenas os logs do CI com código de saída comprovam os dois últimos.

## Resultado operacional esperado

O relatório `tests/saida/inventario-testes.json` apresenta a dívida e as regressões. O portão de qualidade impede novas omissões acidentais sem reexecutar 200 jornadas em toda PR. Os conjuntos legados continuam explicitamente pendentes de migração gradual.

Versão da aplicação não é alterada: este lote só modifica governança e testes.