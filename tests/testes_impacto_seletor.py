#!/usr/bin/env python3
"""Regressões do seletor: base, dúvida, compartilhados, novo teste e escalonamento."""
import importlib.util
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("impacto", BASE / "scripts/ci/testes_impacto.py")
I = importlib.util.module_from_spec(spec)
spec.loader.exec_module(I)

def check(cond, rotulo):
    assert cond, rotulo
    print("OK: " + rotulo)

m = set(I.MODULOS)
def select(files, event="pull_request", suite="rapido", labels=None):
    return I.plano(files, event, suite, labels or [])

p = select(["treinamentos.html","tm-verificado.js"])
check(p["modulos"] == ["treinamentos", "padroes"], "Manual/Google Docs não roda Esteira, Fotos IA ou vídeos (soma só os padrões de interface)")
p = select(["mensagens.html"])
check(set(p["modulos"]) == {"mensagens", "padroes"}, "Mensagens recebe módulo apropriado (+ padrões de interface)")
p = select(["postagens.html","midia-worker/src/index.js"])
check({"postagens","midia","esteira","fotoia","infra"}.issubset(set(p["modulos"])), "Duas áreas e Worker expandem impacto")
p = select(["common.js"])
check(set(p["modulos"]) == m, "Arquivos compartilhados: todos os testes")
p = select(["nova-funcionalidade.js"])
check(set(p["modulos"]) == m, "Arquivo desconhecido: falha segura, todos")
p = select(["tests/regressao_nova.py"])
check(set(p["modulos"]) == m, "Teste ainda sem mapa: amplia para todos")
p = select(["docs/operacao.md", "README.md"])
check(p["so_docs"] and not p["modulos"], "Só documentação não consome bateria de interface")
p = select(["docs/operacao.md"], suite="completo")
check(not p["so_docs"] and set(p["modulos"]) == m, "Completo manual não é ignorado por docs")
p = I.plano(["treinamentos.html"], "pull_request", "rapido", [], "CI-EXTRA: postagens,midia")
check(set(p["modulos"]) == {"treinamentos","postagens","midia","padroes"}, "PR descreve módulos extras sem precisar criar labels")
p = I.plano(["treinamentos.html"], "pull_request", "rapido", [], "CI-EXTRA: todos")
check(set(p["modulos"]) == m and p["suite_completa"], "CI-EXTRA: todos força máxima cobertura")
p = I.plano(["treinamentos.html"], "pull_request", "rapido", [], "CI-EXTRA: modulo-invalido")
check(set(p["modulos"]) == m, "Módulo extra desconhecido amplia por prudência")
p = select(["treinamentos.html"], labels=["ci:postagens"])
check(set(p["modulos"]) == {"treinamentos","postagens","padroes"}, "Rótulo manual acrescenta testes sem remover cobertura automática")
p = select(["treinamentos.html"], labels=["ci:todos"])
check(set(p["modulos"]) == m and p["suite_completa"], "Rótulo de prudência amplia todos")
p = select(["treinamentos.html"], event="schedule")
check(p["suite_completa"] and set(p["modulos"]) == m, "Agendado executa todos")
p = select([])
check(set(p["modulos"]) == m, "Diff ausente não aprova sem validar")
p = select(["AGENTS.md"])
check(p["graphify_alterado"], "Instruções da IA acionam Graphify")
# O CI sozinho é validado pelo seletor + smoke de setores distintos; não roda
# 115 testes por mudar a própria regra de escolha de testes.
ci_files = [".github/workflows/ci.yml", "scripts/ci/testes_impacto.py",
            "scripts/ci/testes_impacto_manifesto.json", "tests/testes_impacto_seletor.py",
            "docs/ia/testes-por-impacto.md", "AGENTS.md", "CLAUDE.md"]
# Metadados de entrega: o número de versão, o mapa de testes e o runner não disparam a bateria inteira.
p = select(["treinamentos.html", "VERSION", "CHANGELOG.md", "scripts/ci/testes_impacto_manifesto.json", "tests/rodar_tudo.py"])
check(set(p["modulos"]) == {"treinamentos", "ci", "padroes"}, "Versão, changelog, mapa de testes e runner somam só o módulo ci")
p = select(["instagram-worker/worker.js", "VERSION"])
check("treinamentos" not in p["modulos"] and "catalogo" not in p["modulos"], "Worker de mensagens + versão não roda treinamentos nem catálogo")
check("padroes" not in p["modulos"], "Worker (sem arquivo de interface) NÃO roda os padrões de interface")
p = select(["OneSignalSDKWorker.js"])
check(set(p["modulos"]) == {"push", "infra"}, "Número do service worker roda push e infra, não tudo")
p = select(["scripts/ci/testes_impacto.py", "VERSION"])
check(set(p["modulos"]) == m, "Mexer na regra do seletor junto com produto continua amplo (fail-safe)")
p = select(ci_files)
check(p["modulos"] == ["ci"] and not p["suite_completa"], "CI isolado executa smoke dirigido, não a plataforma inteira")
p = select(ci_files + ["common.js"])
check(set(p["modulos"]) == m, "CI com código compartilhado mantém cobertura total")
p = select([".github/workflows/deploy.yml"])
check(set(p["modulos"]) == m, "Alteração em deploy continua de alto risco")
p = select(["scripts/ci/check_secrets.sh"])
check(set(p["modulos"]) == m, "Mudança de segurança do CI continua ampla")
p = I.plano(ci_files, "pull_request", "rapido", [], "CI-EXTRA: mensagens")
check(set(p["modulos"]) == {"ci","mensagens"}, "CI isolado admite cobertura adicional por dúvida")
p = select(ci_files, labels=["ci:todos"])
check(set(p["modulos"]) == m and p["suite_completa"], "CI isolado permite forçar todos manualmente")
p = select(ci_files, suite="completo")
check(set(p["modulos"]) == m and p["suite_completa"], "Modo completo nunca vira smoke")
check(len([k for k, v in I.M["tests"].items() if "ci" in v]) >= 4, "CI executa pelo menos quatro testes independentes")
p = select(["tests/manual_fidelidade_ui.py"])
check(p["modulos"] == ["treinamentos"], "Testes existentes mantêm classificação explícita")
check(len(I.M["tests"]) >= 110, "Inventário abrange bateria antiga e testes dirigidos")
check(all(set(tags).issubset(m) and tags for tags in I.M["tests"].values()), "Registro contém somente módulos válidos")
check(all((BASE / f).is_file() for f in I.M["tests"]), "Todos os arquivos do manifesto existem")
check(len(set(I.M["tests"])) == len(I.M["tests"]), "Nenhum arquivo duplicado")

# A execução por shards reduz o tempo total, nunca o número de testes.
# A soma de todos os shards DEVE ser exatamente igual ao plano original.
for arquivos in (["treinamentos.html"], ["mensagens.html"], ["common.js"],
                 [".github/workflows/ci.yml"]):
    pl = select(arquivos)
    n = I.numero_shards(pl)
    todos = [(c,tags) for c,tags in I.M["tests"].items() if set(tags).intersection(pl["modulos"])]
    partes = [I.selecionar_shard(todos, i, n) for i in range(n)]
    todos_distribuidos = [c for parte in partes for c,_ in parte]
    check(len(todos_distribuidos) == len(todos) and
          set(todos_distribuidos) == {c for c,_ in todos} and
          len(set(todos_distribuidos)) == len(todos),
          f"{arquivos}: todos os testes distribuídos sem perda/duplicação")
check(I.numero_shards(select(["common.js"])) == 4, "Impacto amplo usa quatro jobs paralelos")
check(I.numero_shards(select(["treinamentos.html"], suite="completo")) == 1,
      "Full/noturno continua único para não duplicar a bateria")
for indice,total in ((-1,4),(4,4),(0,0)):
    try:
        I.selecionar_shard([("a",[])], indice, total)
    except ValueError:
        pass
    else:
        raise AssertionError("Shard inválido aceito")

print("SELETOR CI: regressões de segurança e cobertura aprovadas.")

# ---- Padrões obrigatórios do site (docs/ia/padroes-site.md): módulo "padroes" para QUALQUER arquivo de interface ----
# Medido: avisos 33 s + vocabulário 28 s + regras/dados 35 s + janelas 108 s = ~3,4 min. padrao_aparencia_ui.py (267 s, só ele
# passaria dos 6 min) segue nos módulos de área (catalogo, mensagens, postagens, esteira, fotoia, treinamentos).
TESTES_PADROES = {"tests/janelas_padrao.py", "tests/padrao_vocabulario.py",
                  "tests/avisos_padrao.py", "tests/padrao_regras_dados.py"}
check("padroes" in m, "módulo padroes existe no manifesto")
check({t for t, tags in I.M["tests"].items() if "padroes" in tags} == TESTES_PADROES, "módulo padroes mapeia exatamente os 4 testes de estrutura (sem o de aparência, 267 s)")
check(all((BASE / t).is_file() for t in TESTES_PADROES), "os testes do módulo padroes existem")
p = select(["treinamentos.html"])
check(set(p["modulos"]) == {"treinamentos", "padroes"}, "treinamentos.html roda treinamentos + padroes")
p = select(["mensagens-ficha.js"])
check("padroes" in p["modulos"] and "mensagens" in p["modulos"], "JS de interface de Mensagens soma padroes")
p = select(["catalogo.css"])
check("padroes" in p["modulos"], "CSS de interface soma padroes")
p = select(["nova-pagina.html"])
check(set(p["modulos"]) == m, "página nova e desconhecida continua fail-safe (todos)")
p = select(["instagram-worker/worker.js"])
check("padroes" not in p["modulos"], "PR só de worker NÃO roda padroes")
p = select(["midia-worker/worker.js", "VERSION"])
check("padroes" not in p["modulos"], "worker + VERSION NÃO roda padroes")
p = select(["VERSION", "CHANGELOG.md", "scripts/ci/testes_impacto_manifesto.json"])
check(p["modulos"] == ["ci"], "só VERSION/CHANGELOG/manifesto: módulo ci, sem padroes")
p = select(["docs/ia/padroes-site.md", "README.md"])
check(p["so_docs"] and not p["modulos"], "só documentação NÃO roda padroes nem navegador")
p = select(["tests/janelas_padrao.py"])
check("padroes" in p["modulos"], "mudar um dos testes do módulo padroes roda o módulo padroes")
p = select(["OneSignalSDKWorker.js"])
check("padroes" not in p["modulos"], "número do service worker NÃO é interface")
# Plano executável: o módulo padroes escolhe exatamente os 4 testes de estrutura (sem rodar a plataforma inteira)
escolhidos = {t for t, tags in I.M["tests"].items() if "padroes" in tags}
check(escolhidos == TESTES_PADROES and I.numero_shards(I.plano(["treinamentos.html"], "pull_request", "rapido", [])) >= 1, "plano de uma página de interface é finito")
# A trava estática dos padrões é coberta pelo módulo ci e pela lista do CI isolado (não dispara a plataforma)
for arq in ("scripts/ci/check_padroes.py", "scripts/ci/padroes-baseline.json", "tests/padroes_check_teste.py"):
    check(I.classificar(arq) == {"ci"}, "classificado como ci (estático): " + arq)
p = select(ci_files + ["scripts/ci/check_padroes.py", "scripts/ci/padroes-baseline.json", "tests/padroes_check_teste.py",
                       "docs/ia/padroes-site.md", ".claude/skills/tenkiter-estetica-humana/SKILL.md",
                       ".agents/skills/tenkiter-estetica-humana/SKILL.md",
                       ".claude/skills/tenkiter-estetica-humana/references/contrato-visual.md",
                       ".agents/skills/tenkiter-estetica-humana/references/contrato-visual.md"])
check(p["modulos"] == ["ci"], "PR só de CI + padrões estáticos + instruções: perfil ci isolado")
p = select(["scripts/ci/padroes-baseline.json", "admin-postagens.js"])
check("padroes" in p["modulos"] and "ci" in p["modulos"] and "postagens" in p["modulos"], "pagar dívida (baseline + JS de interface) roda os padrões, não tudo")
check(set(p["modulos"]) != m, "pagar dívida não aciona a plataforma inteira")
print("seletor de padrões: OK")
