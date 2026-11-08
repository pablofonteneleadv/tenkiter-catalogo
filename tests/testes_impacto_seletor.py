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
check(p["modulos"] == ["treinamentos"], "Manual/Google Docs não roda Esteira, Fotos IA ou vídeos")
p = select(["mensagens.html"])
check(set(p["modulos"]) == {"mensagens"}, "Mensagens recebe módulo apropriado")
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
check(set(p["modulos"]) == {"treinamentos","postagens","midia"}, "PR descreve módulos extras sem precisar criar labels")
p = I.plano(["treinamentos.html"], "pull_request", "rapido", [], "CI-EXTRA: todos")
check(set(p["modulos"]) == m and p["suite_completa"], "CI-EXTRA: todos força máxima cobertura")
p = I.plano(["treinamentos.html"], "pull_request", "rapido", [], "CI-EXTRA: modulo-invalido")
check(set(p["modulos"]) == m, "Módulo extra desconhecido amplia por prudência")
p = select(["treinamentos.html"], labels=["ci:postagens"])
check(set(p["modulos"]) == {"treinamentos","postagens"}, "Rótulo manual acrescenta testes sem remover cobertura automática")
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
print("SELETOR CI: regressões de segurança e cobertura aprovadas.")
