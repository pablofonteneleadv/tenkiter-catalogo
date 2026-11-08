# Instruções do repositório TENKiTER

## Início de toda tarefa técnica — Graphify

Leia a skill `.agents/skills/graphify/SKILL.md`. Execute `python3 scripts/graphify/manage.py start` e consulte o assunto com `python3 scripts/graphify/manage.py query "assunto da tarefa"`. Instalação, criação e atualização do grafo são automáticas; as consultas também verificam atualização. Depois de alterar código, execute `ensure` e confira o impacto.

Use o grafo para reduzir releituras e localizar relações; confirme os trechos nas fontes e faça os testes. Respeite as instruções atuais do Cofre. O perfil é local, sem LLM/IA paga, e o cache não é versionado. Em caso de falha ou cobertura parcial, registre o limite e use fontes/testes diretamente. Registre a consulta útil no PR. Veja `docs/ia/graphify.md`.

## CI por impacto — regra obrigatória para qualquer IA

Antes de abrir PR, leia [a política de testes por impacto](docs/ia/testes-por-impacto.md) e consulte o plano automático no GitHub Actions. Rode os testes do módulo afetado, **amplie por prudência** em fluxos compartilhados ou quando houver dúvida, usando os rótulos `ci:<módulo>` ou `ci:todos`. Testes de segurança e sintaxe continuam em toda PR; bateria completa permanece diária/manual. Nunca desative testes, contorne o portão do CI nem reduza a cobertura só para acelerar. Código novo/desconhecido recebe cobertura total até ser mapeado em `scripts/ci/testes_impacto.py` e `scripts/ci/testes_impacto_manifesto.json`.

## Regras existentes

Para qualquer alteração visual ou de comportamento da interface, leia e aplique `.agents/skills/tenkiter-estetica-humana/SKILL.md` antes de editar e novamente antes de aprovar merge/deploy.

A revisão estética é um portão obrigatório: execute a jornada real, valide mobile e desktop, registre evidência e corrija qualquer reprovação. Mudanças de backend sem impacto visual não exigem esse portão.

As regras operacionais e de segurança existentes em `CLAUDE.md` continuam obrigatórias.

Para toda alteração que exija novo APK Android, leia e aplique obrigatoriamente `.agents/skills/tenkiter-android-release/SKILL.md`. Merge/deploy só são considerados completos com APK assinado, manifesto público atualizado e atualização pelo botão interno validada ou limitação de teste explicitada.
