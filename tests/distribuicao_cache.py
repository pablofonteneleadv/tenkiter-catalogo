"""Regressões de cache, rotas e comprovação negativa, sem provedores reais."""
import importlib.util
from pathlib import Path
import unittest
import urllib.error

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/deploy' / (name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class DistributionTests(unittest.TestCase):
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
