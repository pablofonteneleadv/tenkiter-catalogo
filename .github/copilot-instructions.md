# TENKiTER — instruções para Copilot

Siga `AGENTS.md`, `CLAUDE.md`, a skill `.agents/skills/graphify/SKILL.md` e o setor atual do Cofre. No início de toda tarefa técnica: `python3 scripts/graphify/manage.py start`; depois consulte `python3 scripts/graphify/manage.py query "assunto da tarefa"`. Antes de concluir alterações, use `ensure` e confira o impacto.

O workflow `copilot-setup-steps.yml` prepara o grafo em sessões do coding agent que suportam setup steps. No Chat/IDE, execute o comando de início se o setup não tiver ocorrido. Use apenas o perfil local/sem LLM; confirme trechos e testes, registre cobertura parcial/falha e não publique o cache. Detalhes em `docs/ia/graphify.md`.
