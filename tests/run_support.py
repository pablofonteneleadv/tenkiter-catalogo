"""Pré-requisitos e relatório do runner; importar este módulo não inicia testes."""
import importlib.util
import json
import shutil
import subprocess
from pathlib import Path


def preflight(root, suites):
    missing = []
    node = shutil.which('node')
    if not node:
        missing.append('Node.js 22 ou superior')
    else:
        version = subprocess.run([node, '-p', 'process.versions.node.split(".")[0]'],
                                 capture_output=True, text=True, check=True)
        if int(version.stdout.strip()) < 22:
            missing.append('Node.js 22 ou superior')
    sources = '\n'.join((root / 'tests' / name).read_text() for name, _ in suites)
    if 'playwright' in sources or 'from mock import' in sources:
        for module in ('playwright', 'PIL'):
            if importlib.util.find_spec(module) is None:
                missing.append(module)
    if 'ffmpeg' in sources and not shutil.which('ffmpeg'):
        missing.append('ffmpeg')
    if 'axe.min.js' in sources and not (root / 'tests' / 'axe.min.js').is_file():
        missing.append('tests/axe.min.js (axe-core 4.10.2)')
    if 'miniflare' in sources and not (root / 'instagram-worker/node_modules/miniflare').is_dir():
        missing.append('npm ci --prefix instagram-worker --ignore-scripts')
    return missing


def backend_available(root, prefix, minimum=(0, 0)):
    if not shutil.which('node'):
        return False
    # Um único resolvedor escolhe o mesmo arquivo utilizado pelos runners JS.
    script = "const b=require(process.argv[1]).localizar(process.argv[2],JSON.parse(process.argv[3]));console.log(b.nome)"
    result = subprocess.run(['node', '-e', script, str(root / 'tests/backend_source.cjs'),
                             prefix, json.dumps(minimum)], capture_output=True, text=True)
    return result.returncode == 0


def write_report(path, results, environment_errors=None):
    counts = {status: sum(r['status'] == status for r in results)
              for status in ('passed', 'failed', 'skipped')}
    payload = {'counts': counts, 'environment_errors': environment_errors or [], 'results': results}
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    return payload
