#!/usr/bin/env python3
"""Provas positivas e negativas do inventário QA-01, isoladas do site real."""
import importlib.util
import json
import tempfile
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "scripts/ci/inventario_testes.py"
spec = importlib.util.spec_from_file_location("inventario_qa01", SRC)
I = importlib.util.module_from_spec(spec)
spec.loader.exec_module(I)

CLASSES = ["ambos", "somente_full", "somente_impacto", "ci_direto", "auxiliares", "legado_sem_registro"]


def fixture(root):
    tests = root / "tests"
    ci = root / "scripts/ci"
    workflows = root / ".github/workflows"
    for d in (tests, ci, workflows):
        d.mkdir(parents=True, exist_ok=True)
    for n in ("a.py", "b.py", "c.py", "d.py", "mock.py", "legacy.py"):
        (tests / n).write_text("# fictício\n")
    runner = tests / "rodar_tudo.py"
    runner.write_text('SUITES = [("a.py", lambda o: True), ("b.py", lambda o: True)]\n')
    manifest = ci / "testes_impacto_manifesto.json"
    manifest.write_text(json.dumps({"modules": ["ci"], "tests": {
        "tests/a.py": ["ci"], "tests/c.py": ["ci"]}}))
    workflow = workflows / "ci.yml"
    workflow.write_text("jobs:\n  tests:\n    steps:\n      - run: python3 tests/d.py\n      - run: python3 tests/rodar_tudo.py\n")
    baseline = ci / "inventario_baseline.json"
    baseline.write_text(json.dumps({
        "schema": 1, "ambos": ["tests/a.py"], "somente_full": ["tests/b.py"],
        "somente_impacto": ["tests/c.py"], "ci_direto": ["tests/d.py", "tests/rodar_tudo.py"],
        "auxiliares": ["tests/mock.py"], "legado_sem_registro": ["tests/legacy.py"]
    }))
    return runner, manifest, workflow, baseline


def check(label, mutator=None, esperado=None, erro=None):
    with tempfile.TemporaryDirectory(prefix="qa01-") as d:
        root = Path(d)
        files = fixture(root)
        if mutator:
            mutator(root, *files)
        result = I.avaliar(root)
        if esperado is not None:
            assert result["contagens"] == esperado, (label, result["contagens"])
        if erro is None:
            assert not result["erros"], (label, result["erros"])
        else:
            assert any(erro in x for x in result["erros"]), (label, result["erros"])
        print("PASS: " + label)


def editar_manifest(root, runner, manifest, workflow, baseline, item, value):
    x = json.loads(manifest.read_text())
    if value is None:
        del x["tests"][item]
    else:
        x["tests"][item] = value
    manifest.write_text(json.dumps(x))


def adicionar_na_lista(root, runner, manifest, workflow, baseline):
    (root / "tests/new.py").write_text("# novo\n")
    editar_manifest(root, runner, manifest, workflow, baseline, "tests/new.py", ["ci"])


check("baseline válido e legado explicitamente não aprovado",
      esperado=dict(zip(CLASSES, [1, 1, 1, 2, 1, 1])))
check("arquivo novo registrado no manifesto é permitido", adicionar_na_lista)
check("arquivo novo sem nenhum registro reprova",
      lambda r, *f: (r / "tests/new.py").write_text("# órfão\n"),
      erro="Arquivo de teste novo sem registro")
check("remover teste antigo do manifesto reprova",
      lambda r, *f: editar_manifest(r, *f, "tests/a.py", None),
      erro="Saiu do manifesto de impacto")
check("tirar teste antigo da bateria full reprova",
      lambda r, runner, *_: runner.write_text('SUITES = [("a.py", lambda o: True)]\n'),
      erro="Saiu da bateria full")
check("excluir teste legado reprova",
      lambda r, *_: (r / "tests/b.py").unlink(),
      erro="Arquivo legado excluído")
check("retirar chamada direta sem outra cobertura reprova",
      lambda r, runner, manifest, workflow, baseline: workflow.write_text("jobs:\n"),
      erro="Saiu da chamada direta")
check("registrar um legado em uma segunda modalidade melhora cobertura",
      lambda r, runner, manifest, workflow, baseline: editar_manifest(r, runner, manifest, workflow, baseline, "tests/b.py", ["ci"]))
with tempfile.TemporaryDirectory(prefix="qa01-invalido-") as d:
    r = Path(d)
    runner, manifest, workflow, baseline = fixture(r)
    editar_manifest(r, runner, manifest, workflow, baseline, "tests/a.py", ["inexistente"])
    try:
        I.avaliar(r)
    except ValueError:
        print("PASS: manifesto com módulo inválido reprova")
    else:
        raise AssertionError("Manifesto com módulo inválido aprovado")
print("QA-01: provas do inventário concluídas.")
