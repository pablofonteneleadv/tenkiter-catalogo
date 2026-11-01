"""Integração real: cache, fontes alteradas/removidas, contexto curto e privacidade."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

MANAGER = Path(__file__).resolve().parents[1] / 'scripts/graphify/manage.py'

with tempfile.TemporaryDirectory(prefix='tenkiter graphify ') as folder:
    root = Path(folder)
    subprocess.run(['git', 'init', '-q', str(root)], check=True)
    (root / '.gitignore').write_text('graphify-out/\n.env\n')
    (root / '.graphifyignore').write_text('graphify-out/\n.env\n*.min.js\n')
    (root / 'source.py').write_text('def old_removed_symbol_zxy():\n    return 7\n')
    (root / 'caller.py').write_text('from source import old_removed_symbol_zxy\n\ndef entrypoint():\n    return old_removed_symbol_zxy()\n')
    (root / 'README.md').write_text('DOC_SENTINEL_DO_NOT_SEND_TO_ANY_MODEL')
    (root / '.env').write_text('PRIVATE_ONLY=value-for-test')
    (root / 'vendor.min.js').write_text('function vendor_must_not_be_indexed() {}')
    env = {**os.environ, 'GRAPHIFY_BACKEND': 'openai', 'OPENAI_API_KEY': 'fixture-not-a-key'}

    def call(*args):
        result = subprocess.run([sys.executable, str(MANAGER), '--root', str(root), *args],
                                env=env, capture_output=True, text=True, timeout=180)
        assert result.returncode == 0, result.stderr + result.stdout
        return result

    first = call('start')
    state_path = root / 'graphify-out/.tenkiter-state.json'
    graph_path = root / 'graphify-out/graph.json'
    state = json.loads(state_path.read_text())
    assert state['backend'] == 'none' and state['code_only'] and state['nodes'] > 0
    graph = graph_path.read_text()
    assert 'old_removed_symbol_zxy' in graph
    assert 'DOC_SENTINEL' not in graph and 'PRIVATE_ONLY' not in graph and 'vendor_must_not' not in graph
    stamp = graph_path.stat().st_mtime_ns
    second = call('ensure')
    assert graph_path.stat().st_mtime_ns == stamp, 'Grafo sem alterações deve ser reutilizado'
    assert 'cache válido' in second.stderr
    query = call('query', 'old_removed_symbol_zxy', '--budget', '300')
    assert 'old_removed_symbol_zxy' in query.stdout and len(query.stdout) < 5000
    assert graph_path.stat().st_mtime_ns == stamp
    # Mudança sem commit precisa invalidar o índice, inclusive exclusão de símbolos.
    (root / 'source.py').write_text('def fresh_symbol_zxy():\n    return 11\n')
    (root / 'caller.py').write_text('from source import fresh_symbol_zxy\n\ndef entrypoint():\n    return fresh_symbol_zxy()\n')
    call('ensure')
    changed = graph_path.read_text()
    assert 'fresh_symbol_zxy' in changed and 'old_removed_symbol_zxy' not in changed
    assert json.loads(state_path.read_text())['fingerprint'] != state['fingerprint']
    # Arquivo novo e depois removido também alteram o mapa, mesmo sem git add.
    (root / 'extra.py').write_text('def unique_extra_symbol():\n    return 1\n')
    call('query', 'unique_extra_symbol', '--budget', '300')
    assert 'unique_extra_symbol' in graph_path.read_text()
    (root / 'extra.py').unlink()
    call('ensure')
    assert 'unique_extra_symbol' not in graph_path.read_text()
    # Cache adulterado não pode ser aceito como evidência de código.
    graph_path.write_text('{}')
    call('ensure')
    assert json.loads(graph_path.read_text())['nodes']
    assert not (root / 'graphify-out/.tenkiter.lock').exists()
print('OK: Graphify local, cache reutilizado, mudanças/exclusões detectadas, consulta curta e dados privados fora do grafo.')
