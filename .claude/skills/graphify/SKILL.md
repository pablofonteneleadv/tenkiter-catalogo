---
name: graphify
description: Use ao iniciar trabalho técnico neste repositório e para localizar relações, dependências e impacto entre arquivos. Prepara e consulta automaticamente um grafo local de código, com saída curta e sem LLM.
---

# Graphify no TENKiTER

Este perfil do projeto adapta o Graphify oficial às regras do proprietário. Leia `AGENTS.md`, `CLAUDE.md` e o setor atual do Cofre; eles prevalecem sobre sugestões e inferências do grafo.

1. No início da tarefa, execute na raiz: `python3 scripts/graphify/manage.py start`. O comando instala a versão isolada se necessário e reutiliza ou atualiza o índice local por conteúdo.
2. Consulte o assunto: `python3 scripts/graphify/manage.py query "assunto da tarefa"`. O limite padrão é 1.200 tokens; refine com nomes de funções/arquivos em vez de despejar o grafo inteiro.
3. Para relações e impacto, use `path "A" "B"`, `explain "símbolo"` ou `affected "símbolo"`, com o mesmo prefixo `python3 scripts/graphify/manage.py`. As consultas verificam atualização automaticamente.
4. Leia os trechos originais indicados, use busca textual pontual e execute os testes do setor. `EXTRACTED` e `INFERRED` têm níveis de evidência diferentes. Ausência no índice não prova ausência no código.
5. Depois das alterações, execute `ensure` e consulte o fluxo afetado. Registre no PR a consulta útil e qualquer limite de cobertura.

## Limites obrigatórios

- Apenas AST local de código: o wrapper fixa `GRAPHIFY_BACKEND=none`, `--code-only` e desativa o histórico global de perguntas. Não aproveite chaves de API presentes no ambiente para fazer análise semântica automaticamente.
- O Cofre privado, documentos, imagens e vídeos não são indexados por esse perfil. Não copie conteúdo privado para o repositório/grafo público.
- `graphify-out/` é cache ignorado pelo Git, não um artefato de produção. Não o publique, comite ou envie a serviços externos.
- Algumas gramáticas, incluindo Kotlin/Gradle, têm extração parcial. Confira `graphify-out/build.log`; não trate aviso do parser como diagnóstico de compilação.
- Se instalação, rede ou parser falhar, informe a limitação e continue com fontes/testes diretamente. Não finja uma consulta bem-sucedida, não use grafo antigo como prova e não relaxe autenticação, testes ou regras de publicação.
- Este fluxo não exige subagentes, alteração global de configuração do assistente, serviço Graphify Cloud ou IA paga.

Procedimento e alcance por ferramenta: `docs/ia/graphify.md` na raiz do repositório.
