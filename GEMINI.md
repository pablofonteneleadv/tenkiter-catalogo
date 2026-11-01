# TENKiTER — instruções para Gemini

Leia `AGENTS.md`, `CLAUDE.md`, `.agents/skills/graphify/SKILL.md` e o setor atual do Cofre. Em toda tarefa técnica, execute `python3 scripts/graphify/manage.py start` e consulte `python3 scripts/graphify/manage.py query "assunto da tarefa"`. As consultas atualizam o índice automaticamente; use `ensure` também depois de alterar código.

A análise automática é apenas AST local, sem LLM/IA paga. Confirme fontes e testes; cobertura parcial não comprova ausência de uma função. Se o Graphify não puder executar, registre o limite e use as fontes diretamente. Veja `docs/ia/graphify.md`.
