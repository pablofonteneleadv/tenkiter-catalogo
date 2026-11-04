"""Regressões de distribuição, metadados e execução dos testes; sem serviços reais."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))
from run_support import write_report, preflight


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/deploy' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AuditTests(unittest.TestCase):
    def test_public_allowlist_excludes_repository_and_work_artifacts(self):
        output = load('prepare_public').prepare()
        allowed = set(json.loads((ROOT / 'scripts/deploy/public-files.json').read_text()))
        actual = {str(p.relative_to(output)) for p in output.rglob('*') if p.is_file()}
        self.assertEqual(actual, allowed)
        self.assertIn('index.html', actual)
        self.assertIn('esteira-processos.js',actual)
        self.assertIn('produtos-busca.js',actual)
        self.assertIn('android/latest.json', actual)
        self.assertFalse(any(p.endswith(('.zip', '.patch', '.gs.txt', '.md')) for p in actual))
        self.assertFalse(any(p.startswith(('tests/', 'scripts/', '.git/', 'instagram-worker/')) for p in actual))

    def test_symlink_and_parent_traversal_cannot_publish(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'scripts/deploy').mkdir(parents=True)
            manifest = root / 'scripts/deploy/public-files.json'
            for name in ('../private.txt', '/etc/passwd', '.git/config'):
                manifest.write_text(json.dumps([name]))
                with self.assertRaises(ValueError):
                    load('prepare_public').prepare(root)
            (root / 'leak.html').symlink_to('/etc/passwd')
            manifest.write_text('["leak.html"]')
            with self.assertRaises(ValueError):
                load('prepare_public').prepare(root)

    def test_build_does_not_modify_sources_and_has_valid_sha(self):
        manifest = json.loads((ROOT / 'scripts/deploy/public-files.json').read_text())
        before = {p: (ROOT / p).read_bytes() for p in manifest}
        env = dict(os.environ)
        env.pop('RENDER_GIT_COMMIT', None)
        subprocess.run(['bash', 'scripts/deploy/build_version.sh'], cwd=ROOT, env=env, check=True, capture_output=True)
        self.assertTrue(all((ROOT / p).read_bytes() == content for p, content in before.items()))
        metadata = json.loads((ROOT / '.public-site/version.json').read_text())
        self.assertRegex(metadata['commit'], r'^[0-9a-f]{40}$')

    def test_invalid_sha_never_replaces_existing_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'version.json'
            output.write_text('preservar')
            for value in ('', 'desconhecido', 'a"b', 'a' * 39):
                with patch.dict(os.environ, {'RENDER_GIT_COMMIT': value}):
                    with self.assertRaises(ValueError):
                        load('write_version').write_version(output)
                self.assertEqual(output.read_text(), 'preservar')

    def test_metadata_json_escapes_branch(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {
                'RENDER_GIT_COMMIT': 'a' * 40, 'RENDER_GIT_BRANCH': 'ia/"teste'}):
            output = Path(tmp) / 'version.json'
            load('write_version').write_version(output)
            self.assertEqual(json.loads(output.read_text())['branch'], 'ia/"teste')

    def test_render_configuration_must_be_read_back(self):
        config = {'serviceDetails': {'buildCommand': 'old', 'publishPath': './'}}
        calls = []
        def request(method, body=None):
            calls.append(method)
            if body:
                config['serviceDetails'].update(body['serviceDetails'])
            return config
        load('render_config').ensure(request, 'build', '.public-site')
        self.assertEqual(calls, ['GET', 'PATCH', 'GET'])
        calls.clear()
        load('render_config').ensure(request, 'build', '.public-site')
        self.assertEqual(calls, ['GET'])

    def test_render_ignored_patch_blocks_deployment(self):
        with self.assertRaises(ValueError):
            load('render_config').ensure(lambda *_: {'serviceDetails': {}}, 'build', '.public-site')

    def test_missing_backend_has_explicit_skip_and_strict_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = dict(os.environ, TK_COFRE_DIR=tmp)
            report = Path(tmp) / 'report.json'
            command = [sys.executable, 'tests/rodar_tudo.py', '--suite', 'backend_gs.js',
                       '--require-backends', '--json-report', str(report)]
            result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            counts = json.loads(report.read_text())['counts']
            self.assertEqual(counts, {'passed': 0, 'failed': 0, 'skipped': 1})

    def test_direct_backend_runner_reports_missing_private_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(['node', 'tests/backend_source.cjs', 'catalogo'], cwd=ROOT,
                                    env=dict(os.environ, TK_COFRE_DIR=tmp), capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn('TK_COFRE_DIR', result.stderr)

    def test_report_replaces_previous_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'report.json'
            write_report(path, [{'suite': 'old', 'status': 'passed'}])
            write_report(path, [], ['Node ausente'])
            data = json.loads(path.read_text())
            self.assertEqual(data['counts']['passed'], 0)
            self.assertEqual(data['environment_errors'], ['Node ausente'])

    def test_catalogue_contract_handles_empty_optional_and_invalid_products(self):
        spec = importlib.util.spec_from_file_location('contract', ROOT / 'scripts/ci/contrato_catalogo.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        from mock import prods
        self.assertEqual(module.validate({'ok': True, 'produtos': prods()}), 24)
        self.assertEqual(module.validate({'ok': True, 'produtos': []}), 0)
        for data in ({}, {'ok': True, 'produtos': [{}]}, {'ok': True, 'produtos': [{'ID': True, 'Nome': 'N', 'Preco': 1, 'Status': 'Ativo'}]}):
            with self.assertRaises(ValueError): module.validate(data)

    def test_secret_scan_never_echoes_matching_content(self):
        with tempfile.TemporaryDirectory() as tmp:
            fake = Path(tmp) / 'git'
            sentinel = 'rnd_' + 'TESTE_NAO_E_CREDENCIAL_REAL_' * 2
            fake.write_text("#!/bin/sh\nif [ \"$1\" = \"grep\" ]; then printf '%s\\n' 'app.js:3:" + sentinel + "'; fi\n")
            fake.chmod(0o755)
            result = subprocess.run(['bash', 'scripts/ci/check_secrets.sh'], cwd=ROOT,
                                    env=dict(os.environ, PATH=tmp + os.pathsep + os.environ['PATH']), capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertNotIn(sentinel, result.stdout + result.stderr)
            self.assertIn('conteúdo omitido', result.stdout)

    def test_render_headers_are_additive_and_idempotent(self):
        module = load('render_headers')
        legacy = {'path': '/legado', 'name': 'X-Legado', 'value': 'preservar'}
        rows = [legacy.copy()]
        def request(suffix, body=None):
            if body: rows.append(body.copy())
            return [{'header': r} for r in rows]
        self.assertEqual(module.ensure(request), 6)
        self.assertEqual(module.ensure(request), 0)
        self.assertIn(legacy, rows)
        self.assertFalse(any(r['name'] == 'Permissions-Policy' for r in rows))

    def test_render_headers_conflict_prevents_writes(self):
        module = load('render_headers')
        writes = []
        def request(suffix, body=None):
            if body: writes.append(body)
            return [{'header': {'path': '/*', 'name': 'X-Frame-Options', 'value': 'DENY'}}]
        with self.assertRaises(ValueError): module.ensure(request)
        self.assertEqual(writes, [])

    def test_preflight_distinguishes_missing_toolchain(self):
        with patch('run_support.shutil.which', return_value=None):
            self.assertIn('Node.js 22 ou superior', preflight(ROOT, [('backend_gs.js', None)]))


if __name__ == '__main__':
    unittest.main(verbosity=2)
