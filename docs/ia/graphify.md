# Graphify automático no TENKiTER

A pedido do proprietário, toda IA que fizer trabalho técnico deve preparar e consultar o grafo como parte do fluxo. As instruções atuais do Cofre, a evidência do código e os testes continuam obrigatórios.

## Fluxo comum

```bash
python3 scripts/graphify/manage.py start
python3 scripts/graphify/manage.py query "assunto ou nome da função" --budget 1200
python3 scripts/graphify/manage.py affected "nome da função"
# Depois de alterar código:
python3 scripts/graphify/manage.py ensure
```

`path "A" "B"` mostra relações e `explain "símbolo"` detalha um nó. Use perguntas progressivamente mais específicas; leia os trechos indicados para confirmar a conclusão. Uma busca pontual por texto continua útil. Não despeje `graph.json` no contexto da IA.

O wrapper instala Graphify0.9.100 isoladamente quando necessário, reaproveitando uma instalação compatível de uv/pipx. Sem ela, usa um venv do próprio usuário, nunca o Python global. Requer Python3.10+; a primeira instalação precisa de acesso ao PyPI. Mantém as configurações de rede/proxy herdadas.

O cache é por cópia do repositório em `graphify-out/`. Antes de cada consulta, compara conteúdo dos arquivos de código e entradas de resolução. Alteração, adição, exclusão, troca de fonte ou adulteração do grafo provoca atualização. Arquivos sem mudança reutilizam o grafo; não é necessário reconstruir a cada sessão. Uma trava evita construções concorrentes; mudança de código durante a extração é informada em vez de declarar o grafo atualizado.

## Como chega a cada IA

| Ferramenta | Entrada automática/configurada |
|---|---|
| Codex e agentes compatíveis | `AGENTS.md`, skill em `.agents/` e `.codex/`; o agente deve executar o comando inicial obrigatório |
| Claude Code | `CLAUDE.md`, skill `.claude/` e hook `SessionStart` que prepara o índice; preservado `PreToolUse` de segredos |
| Cursor | Regra `.cursor/rules/tenkiter-graphify.mdc` com `alwaysApply: true` |
| GitHub Copilot | `.github/copilot-instructions.md`; coding agent com setup steps prepara o índice pelo workflow específico |
| Gemini CLI | `GEMINI.md` encaminha ao mesmo procedimento |
| Outras IAs | Devem obedecer `AGENTS.md`; não há como impor um hook universal a uma ferramenta que ignore instruções do repositório |

As configurações são versionadas; o cache e instalações locais não. Novos clones recebem as regras e o comando instala/prepara o necessário. Não são alteradas configurações globais pessoais nem habilitados subagentes. Falha em um hook informa o limite e permite continuar com fontes/testes, sem desativar segurança ou fingir que o grafo está válido.

## Benefícios e custos reais

- Consultas curtas localizam relações e reduzem a necessidade de reler arquivos completos, com índice reutilizável entre sessões.
- Atualização por conteúdo e teste de exclusão evitam depender de um mapa antigo após reparos.
- O primeiro mapa de referência continha347 arquivos,4.710nós e10.725relações; são números daquele checkout, não uma meta fixa.
- Não foi medida economia de tokens em atendimentos reais de IA. O limite padrão de1.200tokens é um orçamento da CLI, não garantia de redução percentual ou de cobrança.
- Há custo de instalação, armazenamento e construção/atualização local. O uso comum não depende de serviço Graphify Cloud e não executa chamadas a modelos de IA.
- O parser apontou extração parcial em alguns Kotlin/Gradle e arquivos sem símbolos. Isso não é diagnóstico de compilação. Ausência no grafo não prova que uma função não existe, e uma relação inferida não vale como chamada executada.

## Privacidade e alcance

O processo fixa `GRAPHIFY_BACKEND=none`, usa `--code-only` e desativa o log global de perguntas, mesmo havendo chaves de API no ambiente. Não indexa documentos, PDFs, imagens, vídeos ou o Cofre externo. `.graphifyignore` exclui segredos, dependências, binários e saídas geradas. SQL/configs são cobertos somente quando o extrator reconhecer o formato; não são feitas conexões com bancos de produção.

O índice pode conter nomes e trechos de código e fica ignorado pelo Git. Não o comite, publique ou envie a serviços externos. Nenhum dado do site, mensagem ou atendimento é alterado por esta integração. Sem alteração de interface do produto e sem necessidade de APK novo.

## Manutenção e verificação

- CI confere os pontos de entrada e executa teste real de cache, atualização, exclusões, consultas curtas e arquivos privados excluídos.
- Atualização de versão/perfil passa por PR e teste; mantenha as três cópias da skill idênticas.
- Registre no PR uma consulta útil e limites de cobertura. Em falha de instalação/rede, prossiga com fontes/testes e deixe explícito que o Graphify não pôde ser usado.
- O cache pode ser reconstruído. Reverter este lote remove regras/hooks do projeto, mas não modifica dados de produção ou desinstala ferramentas pessoais.
