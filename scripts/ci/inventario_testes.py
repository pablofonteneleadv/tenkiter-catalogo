#!/usr/bin/env python3
"""Inventário auditável das duas modalidades de testes da TENKiTER (QA-01).

Não executa testes, não acessa APIs e não altera arquivos. O baseline registra
dívida legada, NÃO a transforma em sucesso. Mudanças que retiram cobertura,
apagam testes antigos ou criam testes órfãos falham com --fail-on-regression.
"""
from __future__ import annotations

import argparse
import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "scripts/ci/inventario_baseline.json"
EXT = {".py", ".js", ".cjs"}
CLASSES = ("ambos", "somente_full", "somente_impacto", "ci_direto", "auxiliares", "legado_sem_registro")
CI_DIRETO = re.compile(r"\b(?:python3?|node)\s+(tests/[\w.-]+\.(?:py|js|cjs))\b")


def _runner(root: Path) -> list[str]:
    arvore = ast.parse((root / "tests/rodar_tudo.py").read_text(encoding="utf-8"))
    suites = []
    for node in arvore.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "SUITES" for t in node.targets
        ):
            if not isinstance(node.value, (ast.List, ast.Tuple)):
                raise ValueError("SUITES deixou de ser uma lista estática")
            for item in node.value.elts:
                if not isinstance(item, (ast.Tuple, ast.List)) or not item.elts:
                    raise ValueError("Entrada desconhecida em SUITES")
                nome = ast.literal_eval(item.elts[0])
                if not isinstance(nome, str):
                    raise ValueError("Nome de suíte não literal")
                suites.append("tests/" + nome)
    if not suites:
        raise ValueError("SUITES não encontrada ou vazia")
    if len(suites) != len(set(suites)):
        raise ValueError("Suíte repetida no runner")
    return suites


def _diretos_ci(root: Path) -> set[str]:
    saida = set()
    for arquivo in (root / ".github/workflows").glob("*.yml"):
        for linha in arquivo.read_text(encoding="utf-8").splitlines():
            if linha.lstrip().startswith("#"):
                continue
            saida.update(CI_DIRETO.findall(linha))
    return saida


def _mapa(root: Path) -> dict:
    obj = json.loads((root / "scripts/ci/testes_impacto_manifesto.json").read_text(encoding="utf-8"))
    modulos = set(obj["modules"])
    for path, tags in obj["tests"].items():
        if not path.startswith("tests/") or not tags or set(tags) - modulos:
            raise ValueError("Manifesto inválido para " + path)
    return obj["tests"]


def levantar(root: Path = ROOT) -> dict:
    files = {p.relative_to(root).as_posix() for p in (root / "tests").iterdir()
             if p.is_file() and p.suffix in EXT}
    full, impacto, direto = set(_runner(root)), set(_mapa(root)), _diretos_ci(root)
    referidos = full | impacto | direto
    inexistentes = sorted(referidos - files)
    return {
        "files": files, "full": full, "impacto": impacto, "ci_direto": direto,
        "inexistentes": inexistentes,
    }



# Compatibilidade: consumidores antigos de inventory() e JSON precisam continuar
# recebendo 'arquivo', 'execucao', 'counts' e 'files' sem mudança semântica.
def inventory(root: Path = ROOT) -> list[dict]:
    dados = levantar(root)
    auxiliares = {"tests/mock_msg.py", "tests/mock.py", "tests/run_support.py",
                  "tests/backend_source.cjs", "tests/rodar_tudo.py"}
    resultado = []
    for path in sorted(dados["files"]):
        estado = ("runner" if path in dados["full"]
                  else "ci" if path in dados["ci_direto"]
                  else "auxiliar declarado" if path in auxiliares
                  else "revisar registro")
        resultado.append({"arquivo": path.removeprefix("tests/"), "execucao": estado})
    return resultado


def classes_atuais(dados: dict, auxiliares: set[str]) -> dict:
    saida = {k: set() for k in CLASSES}
    for p in dados["files"]:
        if p in dados["full"] and p in dados["impacto"]:
            c = "ambos"
        elif p in dados["full"]:
            c = "somente_full"
        elif p in dados["impacto"]:
            c = "somente_impacto"
        elif p in dados["ci_direto"]:
            c = "ci_direto"
        elif p in auxiliares:
            c = "auxiliares"
        else:
            c = "legado_sem_registro"
        saida[c].add(p)
    return saida


def avaliar(root: Path = ROOT, arquivo_baseline: Path | None = None) -> dict:
    dados = levantar(root)
    arquivo = arquivo_baseline or root / "scripts/ci/inventario_baseline.json"
    ref = json.loads(arquivo.read_text(encoding="utf-8"))
    if ref.get("schema") != 1:
        raise ValueError("Baseline do inventário sem schema 1")
    baseline = {c: set(ref.get(c, [])) for c in CLASSES}
    total = sum((list(sorted(v)) for v in baseline.values()), [])
    erros = []
    if len(total) != len(set(total)):
        erros.append("Baseline com arquivos repetidos em diferentes classes")
    antigas = set(total)
    atual = classes_atuais(dados, baseline["auxiliares"])
    for p in dados["inexistentes"]:
        erros.append("Arquivo referenciado mas inexistente: " + p)
    for p in sorted(antigas - dados["files"]):
        erros.append("Arquivo legado excluído sem reconciliação explícita: " + p)
    antigas_full = baseline["ambos"] | baseline["somente_full"]
    antigas_impacto = baseline["ambos"] | baseline["somente_impacto"]
    antigas_direto = baseline["ci_direto"]
    for p in sorted(antigas_full & dados["files"] - dados["full"]):
        erros.append("Saiu da bateria full: " + p)
    for p in sorted(antigas_impacto & dados["files"] - dados["impacto"]):
        erros.append("Saiu do manifesto de impacto: " + p)
    for p in sorted(antigas_direto & dados["files"] - dados["ci_direto"]
                    - dados["full"] - dados["impacto"]):
        erros.append("Saiu da chamada direta na CI: " + p)
    novos = dados["files"] - antigas
    for p in sorted(novos - dados["full"] - dados["impacto"] - dados["ci_direto"]):
        erros.append("Arquivo de teste novo sem registro nem CI direta: " + p)
    # Um helper novo deve entrar na lista auxiliares revisada, em vez de ficar órfão.
    # Erros no baseline não podem desaparecer por mudança de nomes de classe.
    for p in sorted(baseline["auxiliares"] & dados["full"]):
        erros.append("Auxiliar declarado virou suíte sem atualizar baseline: " + p)
    relatorio = {
        "schema": 1,
        "contagens": {c: len(atual[c]) for c in CLASSES},
        "cobertura": {
            "arquivos": len(dados["files"]),
            "full": len(dados["full"]),
            "impacto": len(dados["impacto"]),
            "citados_diretamente_na_ci": len(dados["ci_direto"]),
            "novos_classificados": len(novos & (dados["full"] | dados["impacto"] | dados["ci_direto"])),
        },
        "classes": {c: sorted(atual[c]) for c in CLASSES},
        "erros": erros,
    }
    linhas = inventory(root)
    relatorio["files"] = linhas
    relatorio["counts"] = {estado: sum(row["execucao"] == estado for row in linhas)
                           for estado in ("runner", "ci", "auxiliar declarado", "revisar registro")}
    return relatorio


def main() -> int:
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--json-report", type=Path)
    cli.add_argument("--baseline", type=Path)
    cli.add_argument("--fail-on-regression", action="store_true")
    args = cli.parse_args()
    try:
        r = avaliar(ROOT, args.baseline)
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as exc:
        print("::error::Inventário inválido: " + str(exc))
        return 2
    c = r["contagens"]
    print("QA-01 arquivos=%d; full=%d; impacto=%d; ambos=%d; só-full=%d; só-impacto=%d; CI-direto=%d; auxiliares=%d; legado-sem-registro=%d" %
          (r["cobertura"]["arquivos"], r["cobertura"]["full"], r["cobertura"]["impacto"],
           c["ambos"], c["somente_full"], c["somente_impacto"], c["ci_direto"],
           c["auxiliares"], c["legado_sem_registro"]))
    print("Dívida legada permanece explícita; não confundir presença de arquivo com aprovação.")
    for erro in r["erros"]:
        print("::error::QA-01: " + erro)
    if args.json_report:
        args.json_report.parent.mkdir(parents=True, exist_ok=True)
        args.json_report.write_text(json.dumps(r, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 1 if args.fail_on_regression and r["erros"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
