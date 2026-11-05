"""Regressões de cache, rotas e comprovação negativa, sem provedores reais."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
import urllib.error

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/deploy' / (name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class DistributionTests(unittest.TestCase):
    def recovery_step(self):
        # Extrai o bloco shell que o Actions executa, sem dependência de parser YAML.
        text = (ROOT / '.github/workflows/deploy.yml').read_text()
        block = text.split('      - name: Recuperar publicação do manifesto Android na borda\n', 1)[1].split('\n      - ', 1)[0]
        config, command = block.split('        run: |\n', 1)
        return {'run': '\n'.join(line[10:] for line in command.splitlines() if line.strip()),
                'if': next(line.strip()[4:] for line in config.splitlines() if line.strip().startswith('if: ')),
                'continue-on-error': 'continue-on-error: true' in config,
                'env': config}

    def run_recovery(self, exit_code):
        step = self.recovery_step()
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            checker = folder / 'python3'
            checker.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_LOG"\nexit "$SIM_VERIFIER_EXIT"\n')
            checker.chmod(0o755)
            log = folder / 'calls'
            env = {'PATH': tmp, 'TEST_LOG': str(log), 'SIM_VERIFIER_EXIT': str(exit_code)}
            result = subprocess.run(['/bin/bash', '-e', '-c', step['run']], cwd=ROOT, env=env, capture_output=True)
            return result.returncode, log.read_text().splitlines() if log.exists() else []

    def test_android_recovery_rechecks_without_cloudflare_credentials(self):
        status, calls = self.run_recovery(0)
        self.assertEqual(status, 0)
        self.assertEqual(calls, ['scripts/deploy/verificar_android_manifesto.py --attempts 12 --delay 5'])
        step = self.recovery_step()
        self.assertEqual(step['if'], "steps.android_manifesto.outcome == 'failure'")
        self.assertFalse(step.get('continue-on-error', False))
        self.assertNotIn('CLOUDFLARE_ZONE_ID', step.get('env', {}))

    def test_android_recovery_keeps_failure_blocking(self):
        status, calls = self.run_recovery(1)
        self.assertNotEqual(status, 0)
        self.assertEqual(len(calls), 1)

    def test_site_deploy_does_not_call_inapplicable_purge(self):
        text = (ROOT / '.github/workflows/deploy.yml').read_text()
        deploy = text.split('\n  deploy:\n', 1)[1].split('\n  workers:', 1)[0]
        self.assertIn('scripts/monitoramento/saude_publica.py', deploy)
        self.assertIn('scripts/deploy/verificar_arquivos_internos.py', deploy)
        self.assertNotIn('cloudflare_purge.sh', deploy)
        self.assertNotIn('CLOUDFLARE_ZONE_ID', deploy)

    def test_invalid_zone_cannot_reach_api_or_echo_secrets(self):
        calls = []
        token = 'nao-imprimir-token'
        for zone in ('x' * 31, 'a' * 31, 'a' * 32 + '\n', 'a/b'):
            with self.assertRaises(ValueError) as caught:
                load('cloudflare_purge').purge(zone, token, {}, lambda *args: calls.append(args))
            self.assertNotIn(token, str(caught.exception))
            self.assertNotIn(zone, str(caught.exception))
        self.assertEqual(calls, [])

    def test_purge_requires_explicit_success(self):
        p = load('cloudflare_purge')
        with self.assertRaises(ValueError):
            p.purge('a' * 32, 'token', {}, lambda *args: {'success': False, 'errors': [{'message': 'secret'}]})
        p.purge('a' * 32, 'token', {}, lambda *args: {'success': True})

    def test_transient_network_retry_is_bounded(self):
        p = load('cloudflare_purge')
        calls = []
        def fail(*args):
            calls.append(1)
            raise TimeoutError()
        with self.assertRaises(ValueError):
            p.purge('a' * 32, 'token', {}, fail, lambda delay: None)
        self.assertEqual(len(calls), 3)

    def test_only_canonical_urls_can_be_purged(self):
        p = load('cloudflare_purge')
        self.assertEqual(p.payload('tudo'), {'purge_everything': True})
        self.assertEqual(len(p.payload('https://tenkitermodas.com.br/version.json')['files']), 1)
        for target in ('', 'http://tenkitermodas.com.br/', 'https://outro.com/', 'https://tenkitermodas.com.br.outro.com/'):
            with self.assertRaises(ValueError):
                p.payload(target)

    def test_routes_are_additive_and_idempotent(self):
        m = load('render_internal_routes')
        original = {'source': '/p/*', 'destination': 'https://worker/p/*', 'type': 'rewrite'}
        rows = [original.copy()]
        def request(suffix, body=None):
            if body is not None:
                rows.append(body.copy())
                return body
            return [{'route': row} for row in rows]
        self.assertEqual(m.ensure(request), len(m.SOURCES))
        self.assertEqual(m.ensure(request), 0)
        self.assertEqual(rows[0], original)
        for source in ('/*', '/p/*', '/feed.csv', '/android/*', '/index.html'):
            self.assertNotIn(source, m.SOURCES)

    def test_conflicting_route_blocks_before_any_write(self):
        m = load('render_internal_routes')
        calls = []
        def request(suffix, body=None):
            if body is not None:
                calls.append(body)
            return [{'route': {'source': m.SOURCES[-1], 'destination': '/existing', 'type': 'rewrite'}}]
        with self.assertRaises(ValueError):
            m.ensure(request)
        self.assertEqual(calls, [])

    def test_missing_confirmation_is_failure(self):
        with self.assertRaises(ValueError):
            load('render_internal_routes').ensure(lambda *args: [])

    def test_only_absent_statuses_satisfy_negative_verification(self):
        m = load('verificar_arquivos_internos')
        for status in (404, 410):
            def absent(request, timeout):
                raise urllib.error.HTTPError(request.full_url, status, 'absent', {}, None)
            m.check(absent)
        for status in (403, 500):
            def broken(request, timeout):
                raise urllib.error.HTTPError(request.full_url, status, 'broken', {}, None)
            with self.assertRaises(ValueError):
                m.check(broken)
        class Fallback:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
        with self.assertRaises(ValueError):
            m.check(lambda *args, **kwargs: Fallback())


if __name__ == '__main__':
    unittest.main()
