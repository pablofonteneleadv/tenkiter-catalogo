"""Gera metadados de publicação; rejeita SHA ausente/inválido antes de escrever."""
import datetime
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def write_version(output, root=ROOT):
    root = Path(root)
    commit = os.environ.get('RENDER_GIT_COMMIT')
    if commit is None:
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Commit de publicação ausente ou inválido.')
    branch = os.environ.get('RENDER_GIT_BRANCH') or subprocess.check_output(
        ['git', 'rev-parse', '--abbrev-ref', 'HEAD'], cwd=root, text=True).strip()
    version = (root / 'VERSION').read_text().strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('VERSION deve conter uma versão numérica válida.')
    metadata = {'versao': version, 'commit': commit, 'branch': branch,
                'publicado_em': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                'servico': 'tenkiter-catalogo'}
    Path(output).write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    return metadata


if __name__ == '__main__':
    import sys
    data = write_version(sys.argv[1])
    print('version.json gerado para o commit ' + data['commit'])
