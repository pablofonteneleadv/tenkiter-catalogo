# Aproveitamento do ECC no TENKiTER

Ideias inspiradas em affaan-m/ECC (MIT, Copyright (c) 2026 Affaan Mustafa). Nenhum código do ECC foi copiado, executado ou instalado; as skills foram reescritas em português, ancoradas nos arquivos e rotas deste repositório. A cópia local usada para leitura fica fora deste repositório.

## O que foi aproveitado (7 skills em `.claude/skills/`)

| Skill TENKiTER | Ideia de origem (ECC) | Para que serve aqui |
|---|---|---|
| `tenkiter-revisao-dupla` | skills/santa-method | Dois revisores independentes, mesma rubrica, teto de 3 rodadas; textos públicos e segurança |
| `tenkiter-bug-vira-teste` | skills/ai-regression-testing | Todo bug vira teste em `tests/` e entra em `testes_impacto_manifesto.json` |
| `tenkiter-falhas-silenciosas` | agents/silent-failure-hunter | Catch vazio, fallback mudo, fetch sem timeout nos Workers; traz achados iniciais com arquivo:linha |
| `tenkiter-auditoria-de-clique` | skills/click-path-audit | Trilha de estado de cada botão da Esteira |
| `tenkiter-canario-pos-deploy` | skills/canary-watch e browser-qa | Checklist somente leitura pós-deploy |
| `tenkiter-seguranca-de-agentes` | skills/agent-security-hardening | Fonte, validador, efeito; trifeta letal; webhooks `/wh/` |
| `tenkiter-plano-em-passos` | skills/blueprint | Objetivo em passos de uma PR, retomável a frio |

## O que foi descartado e por quê

- Cerca de 85% do ECC não tem uso aqui: agentes e skills de linguagens e frameworks que o TENKiTER não usa (Go, Rust, Kotlin, Swift, Django, Spring, Laravel e similares), de bancos e nuvens que não temos e de nichos (trading, ClickHouse etc.). Nosso stack é HTML/JS estático, três Workers Cloudflare, Apps Script e a Esteira em JS puro.
- Hooks e instalador do ECC: não instalados. Executam código na máquina e no fluxo de cada sessão, o que aumenta a superfície de risco (execução arbitrária, alteração de configuração, exfiltração) sem ganho que justifique. Mantemos hooks e CI próprios, auditados neste repositório.
- Comandos, perfis e personas genéricos: repetem o que `CLAUDE.md`, `docs/ia/padroes-site.md` e as skills TENKiTER já definem, e conflitariam com as regras do Cofre, que prevalecem.
- Qualquer coisa que exija serviço externo, chave ou memória remota: fora do escopo, por causa das regras de segredos.

## Ideias futuras (não implementadas)

1. **Gateguard de fatos antes de editar:** o agente lista, com leitura real, o que o arquivo faz e quem o consome antes da primeira edição (cruzando com o Graphify).
2. **Proteção da configuração de CI contra o agente:** alteração em `scripts/ci/`, `.github/workflows/` e baselines (`padroes-baseline.json`, `inventario_baseline.json`) exigiria justificativa explícita e revisão dupla, para impedir que a IA afrouxe portões só para passar.
3. **Avaliação dos próprios portões com corpus:** conjunto de casos que devem passar e que devem falhar para `check_padroes.py`, `check_secrets.sh` e o seletor de testes, medindo falso positivo e falso negativo.
4. **SEO e desempenho web de moda:** auditoria de dados estruturados de produto, `feed.csv`/`feed.xml`, imagens (peso, `srcset`), Core Web Vitals em celular.
5. **Inventário e estoque:** reconciliação de peças, tecidos e disponibilidade entre catálogo, Esteira e planilhas, com detecção de divergência.

## Atribuição

Ideias inspiradas em affaan-m/ECC (MIT, Copyright (c) 2026 Affaan Mustafa). Licença MIT: permissão para uso, cópia e adaptação mantida a nota de copyright e a licença em cópias substanciais; como o conteúdo aqui é reescrito, esta nota registra a origem das ideias.
