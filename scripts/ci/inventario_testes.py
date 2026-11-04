"""Inventaria cobertura de execução; não confunde auxiliares com testes aprovados."""
import ast
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def inventory():
    tree = ast.parse((ROOT / 'tests/rodar_tudo.py').read_text())
    registered = set()
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'SUITES' for t in node.targets):
            registered.update(item.elts[0].value for item in node.value.elts)
    workflow = '\n'.join(p.read_text() for p in (ROOT / '.github/workflows').glob('*.yml'))
    ci = set(re.findall(r'tests/([\w.-]+\.(?:py|js|cjs))', workflow))
    helpers = {'mock.py', 'run_support.py', 'backend_source.cjs', 'rodar_tudo.py'}
    results = []
    for path in sorted((ROOT / 'tests').iterdir()):
        if not path.is_file() or path.suffix not in ('.py', '.js', '.cjs'):
            continue
        name = path.name
        status = 'runner' if name in registered else 'ci' if name in ci else 'auxiliar declarado' if name in helpers else 'revisar registro'
        results.append({'arquivo': name, 'execucao': status})
    return results


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json-report', type=Path)
    args = parser.parse_args()
    results = inventory()
    counts = {key: sum(r['execucao'] == key for r in results)
              for key in ('runner', 'ci', 'auxiliar declarado', 'revisar registro')}
    print('Inventário de testes: ' + ', '.join('%s=%d' % item for item in counts.items()))
    print('Arquivos a revisar não são classificados como aprovados, falhos ou suítes obrigatórias sem inspeção.')
    if args.json_report:
        args.json_report.parent.mkdir(parents=True, exist_ok=True)
        args.json_report.write_text(json.dumps({'counts': counts, 'files': results}, ensure_ascii=False, indent=2) + '\n')
