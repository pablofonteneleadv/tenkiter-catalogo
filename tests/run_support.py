"""Pré-requisitos e relatório do runner; importar este módulo não inicia testes."""
import importlib.util
from contextlib import contextmanager
import os
import socket
import time
import urllib.request
import json
import re
import shutil
import subprocess
from pathlib import Path


def sqlite_fixture_needed(root, suites):
    """Usa a lista única da CI de impacto para selecionar o Worker SQLite de teste."""
    # O manifesto pertence ao runner versionado, não ao root sintético de preflight.
    # Falhar se o manifesto oficial sumir: nunca desabilitar a fixture silenciosamente.
    manifest_path = Path(__file__).resolve().parents[1] / 'scripts/ci/testes_impacto_manifesto.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    requires = set(manifest['sql_fixture'])
    return any('tests/' + name in requires for name, _ in suites)


def sqlite_fixture_server(root, suites):
    """Inicia/espera/encerra somente fixture LOCAL; nunca conecta a uma API da loja.

    Se TK_QA_PORT for fornecida pelo executor por impacto, exige a fixture
    já disponível. Sem esse env cria uma porta local efêmera e encerra o
    processo no finally mesmo após falha de qualquer suíte.
    """
    if not sqlite_fixture_needed(root, suites):
        from contextlib import nullcontext
        return nullcontext(None)

    @contextmanager
    def open_fixture():
        external = os.environ.get('TK_QA_PORT', '').strip()
        if external:
            port = int(external)
            if not (1 <= port <= 65535):
                raise RuntimeError('TK_QA_PORT fora do intervalo permitido.')
            own = None
        else:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.bind(('127.0.0.1', 0))
                port = sock.getsockname()[1]
            env = dict(os.environ, TK_QA_PORT=str(port))
            own = subprocess.Popen(
                ['node', str(root / 'tests/fixtures/solicitacoes_server.cjs')],
                cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        try:
            for _ in range(80):
                if own is not None and own.poll() is not None:
                    raise RuntimeError('Servidor SQLite simulado terminou antes de ficar disponível.')
                try:
                    with urllib.request.urlopen(
                        'http://127.0.0.1:%d/qa/estado' % port, timeout=.3
                    ) as response:
                        if response.status == 200:
                            state = json.loads(response.read(65536))
                            if isinstance(state, dict) and isinstance(state.get('solicitacoes'), list):
                                break
                except (OSError, ValueError):
                    time.sleep(.125)
            else:
                raise RuntimeError('Fixture SQLite não respondeu em /qa/estado na porta local.')
            yield str(port)
        finally:
            if own is not None:
                if own.poll() is None:
                    own.terminate()
                try:
                    own.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    own.kill()
                    own.wait(timeout=5)

    return open_fixture()


def preflight(root, suites):
    missing = []
    sources = '\n'.join((root / 'tests' / name).read_text() for name, _ in suites)
    # Python autônomo não depende de Node. Suites JS/CJS e Python que invoca
    # Node continuam exigindo o runtime mínimo do projeto.
    needs_node = any(name.endswith(('.js', '.cjs')) for name, _ in suites) or re.search(r"['\"]node['\"]|node:", sources) or sqlite_fixture_needed(root, suites)
    if needs_node:
        node = shutil.which('node')
        if not node:
            missing.append('Node.js 22 ou superior')
        else:
            version = subprocess.run([node, '-p', 'process.versions.node.split(".")[0]'],
                                     capture_output=True, text=True, check=True)
            if int(version.stdout.strip()) < 22:
                missing.append('Node.js 22 ou superior')
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
