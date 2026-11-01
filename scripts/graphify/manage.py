#!/usr/bin/env python3
"""Graphify local e reutilizável: preparação, atualização e consultas do TENKiTER."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

VERSION = '0.9.100'
ROOT = Path(__file__).resolve().parents[2]
DETECT = '''import json,sys
from pathlib import Path
from graphify.detect import detect
r=detect(Path(sys.argv[1]))
print(json.dumps({'files':r['files']['code']+r.get('resolution_inputs',[]),
 'skipped':len(r.get('skipped_sensitive',[])), 'walk_errors':len(r.get('walk_errors',[]))}))'''


def environment():
    env = dict(os.environ)
    env.update(GRAPHIFY_BACKEND='none', GRAPHIFY_QUERY_LOG_DISABLE='1',
               GRAPHIFY_OUT='graphify-out', PYTHONUTF8='1')
    return env


def run(args, root, **kwargs):
    return subprocess.run([str(a) for a in args], cwd=root, env=environment(),
                          text=True, check=True, **kwargs)


@contextmanager
def lock(path, seconds=180):
    """Um único construtor por cache; libera trava deixada por processo encerrado."""
    path.parent.mkdir(parents=True, exist_ok=True)
    until = time.monotonic() + seconds
    while True:
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, 'w') as out:
                out.write(str(os.getpid()))
            break
        except FileExistsError:
            try:
                pid = int(path.read_text())
                if os.name != 'nt':
                    os.kill(pid, 0)
                elif time.time() - path.stat().st_mtime > 600:
                    path.unlink(missing_ok=True)
                    continue
            except ProcessLookupError:
                path.unlink(missing_ok=True)
                continue
            except (ValueError, OSError):
                if path.exists() and time.time() - path.stat().st_mtime > 600:
                    path.unlink(missing_ok=True)
                    continue
            if time.monotonic() >= until:
                raise RuntimeError('Outro processo ainda prepara o grafo. Tente novamente.')
            time.sleep(0.2)
    try:
        yield
    finally:
        path.unlink(missing_ok=True)


def valid_python(executable, root):
    if not executable or not Path(executable).is_file():
        return False
    try:
        result = run([executable, '-c',
                      "from importlib.metadata import version; print(version('graphifyy'))"],
                     root, capture_output=True, timeout=10)
        return result.stdout.strip() == VERSION
    except (OSError, subprocess.SubprocessError):
        return False


def tool_python(root):
    # Reaproveita uv/pipx existentes sem atualizar nem modificar o ambiente global.
    binary = shutil.which('graphify')
    if binary:
        try:
            with open(binary, 'rb') as src:
                line = src.readline(1024).decode('utf-8').strip()
            candidate = line[2:] if line.startswith('#!') else ''
            if 'python' in Path(candidate).name and valid_python(candidate, root):
                return candidate
        except (OSError, UnicodeError):
            pass
    cache = Path.home() / '.cache' / 'tenkiter-graphify' / VERSION / sys.implementation.cache_tag
    python = cache / 'venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    with lock(cache / '.install.lock'):
        if not valid_python(python, root):
            uv = shutil.which('uv')
            if uv:
                if not python.is_file():
                    run([uv, 'venv', '--python', sys.executable, cache / 'venv'], root,
                        capture_output=True, timeout=120)
                command = [uv, 'pip', 'install', '--python', python, 'graphifyy==' + VERSION]
            else:
                run([sys.executable, '-m', 'venv', cache / 'venv'], root,
                    capture_output=True, timeout=120)
                command = [python, '-m', 'pip', 'install', 'graphifyy==' + VERSION]
            run(command, root, capture_output=True, timeout=240)
    return str(python)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs(python, root):
    result = json.loads(run([python, '-c', DETECT, root], root,
                            capture_output=True, timeout=60).stdout)
    files = {}
    for name in sorted(set(result['files'])):
        path = Path(name).resolve()
        if not path.is_relative_to(root):
            raise RuntimeError('Arquivo de código aponta para fora do projeto; revise o vínculo.')
        files[path.relative_to(root).as_posix()] = digest(path)
    profile = root / '.graphifyignore'
    if profile.exists():
        files['.graphifyignore'] = digest(profile)
    identity = {'version': VERSION, 'root': str(root), 'files': files, 'backend': 'none'}
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest(), result


def ensure(root):
    root = root.resolve()
    git_root = Path(run(['git', 'rev-parse', '--show-toplevel'], root,
                        capture_output=True).stdout.strip()).resolve()
    if git_root != root:
        raise RuntimeError('Execute na raiz do repositório, ou use --root com essa raiz.')
    python = tool_python(root)
    out = root / 'graphify-out'
    graph = out / 'graph.json'
    state_path = out / '.tenkiter-state.json'
    with lock(out / '.tenkiter.lock'):
        fingerprint, detected = inputs(python, root)
        try:
            old = json.loads(state_path.read_text())
        except (OSError, ValueError):
            old = {}
        if old.get('fingerprint') == fingerprint and graph.exists() and old.get('graph_sha256') == digest(graph):
            return python, old, False
        # --force honra exclusões/refatorações que diminuem o grafo; o cache AST é local.
        log = out / 'build.log'
        with log.open('w', encoding='utf-8') as output:
            run([python, '-m', 'graphify', 'extract', root, '--code-only',
                 '--max-workers', '2', '--force'], root, stdout=output,
                stderr=subprocess.STDOUT, timeout=180)
        if inputs(python, root)[0] != fingerprint:
            raise RuntimeError('O código mudou durante a indexação. Execute novamente antes de consultar.')
        data = json.loads(graph.read_text())
        warnings = [line.strip() for line in log.read_text().splitlines() if 'warning:' in line.lower()]
        state = {'fingerprint': fingerprint, 'graph_sha256': digest(graph), 'version': VERSION,
                 'root': str(root), 'backend': 'none', 'code_only': True,
                 'nodes': len(data.get('nodes', [])), 'edges': len(data.get('links', [])),
                 'files': len(detected['files']), 'skipped_sensitive': detected['skipped'],
                 'walk_errors': detected['walk_errors'], 'warnings': warnings,
                 'updated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
        temporary = state_path.with_suffix('.tmp')
        temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(state_path)
        return python, state, True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    sub = parser.add_subparsers(dest='action', required=True)
    for action in ['start', 'ensure', 'session']:
        sub.add_parser(action)
    for action in ['query', 'explain', 'affected']:
        p = sub.add_parser(action)
        p.add_argument('question')
        if action == 'query':
            p.add_argument('--budget', type=int, default=1200, choices=range(100, 4001), metavar='100..4000')
    p = sub.add_parser('path')
    p.add_argument('source')
    p.add_argument('target')
    args = parser.parse_args()
    try:
        python, state, rebuilt = ensure(args.root)
        print('Graphify: ' + ('atualizado' if rebuilt else 'cache válido') +
              f" · {state['nodes']} nós · {state['edges']} relações · local, sem LLM.", file=sys.stderr)
        if state['warnings'] or state['walk_errors']:
            print('Cobertura parcial do parser; ausência no grafo não prova ausência no código. '
                  'Detalhes em graphify-out/build.log.', file=sys.stderr)
        if args.action in ['start', 'ensure', 'session']:
            print('Consulte: python3 scripts/graphify/manage.py query "assunto da tarefa". '
                  'Confirme os trechos encontrados e respeite AGENTS.md/Cofre.')
            return 0
        command = [python, '-m', 'graphify', args.action]
        command += [args.source, args.target] if args.action == 'path' else [args.question]
        command += ['--graph', args.root.resolve() / 'graphify-out/graph.json']
        if args.action == 'query':
            command += ['--budget', str(args.budget)]
        return subprocess.run([str(a) for a in command], cwd=args.root.resolve(), env=environment()).returncode
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        print('Graphify indisponível: ' + str(error) +
              '\nUse fontes/testes diretamente e registre a limitação; não use grafo antigo como prova.', file=sys.stderr)
        # Um hook de sessão informa o limite sem impedir o trabalho ou contornar segurança.
        return 0 if args.action == 'session' else 1


if __name__ == '__main__':
    raise SystemExit(main())
