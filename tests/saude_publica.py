"""Contratos do monitor com respostas simuladas, sem consultas reais."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('monitor', ROOT / 'scripts/monitoramento/saude_publica.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture(path):
    bodies = {'': ('text/html', b'<html>TENKiTER</html>'),
              'version.json': ('application/json', json.dumps({'versao': '7.53.5', 'commit': 'a' * 40}).encode()),
              'pedido.js': ('text/javascript', b'function operacaoPedido_(){}'),
              'treinamentos.html': ('text/html', b'<html><script src="rh-permissoes.js"></script><link rel="stylesheet" href="rh-permissoes.css"></html>'),
              'rh-permissoes.js': ('text/javascript', b'window.TKPermissoes={}'),
              'rh-permissoes.css': ('text/css', b'body.rh-admin{color:#111}'),
              'feed.csv': ('text/csv', b'id,title,availability,price,link,image_link\r\n'),
              'feed.xml': ('application/xml', b'<rss version="2.0"><channel/></rss>'),
              'sitemap.xml': ('application/xml', b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>')}
    kind, body = bodies[path]
    return 200, {'content-type': kind, 'cache-control': 'no-store'}, body


class MonitorTests(unittest.TestCase):
    def test_uses_canonical_site(self):
        self.assertEqual(m.site_url('const SITE_URL="https://exemplo.com/";'), 'https://exemplo.com/')
        with self.assertRaises(ValueError):
            m.site_url('const API_URL="https://outro.com/";')

    def test_all_resources_and_empty_sitemap_are_valid(self):
        result = m.check('https://exemplo.com/', lambda url: fixture(url.removeprefix('https://exemplo.com/')), 'a' * 40)
        self.assertTrue(result['ok'])
        self.assertEqual(len(result['verificacoes']), 9)

    def test_html_fallback_is_rejected_for_each_asset(self):
        for path in ('version.json', 'pedido.js', 'rh-permissoes.js', 'rh-permissoes.css', 'sitemap.xml', 'feed.csv', 'feed.xml'):
            with self.subTest(path=path), self.assertRaises((ValueError, json.JSONDecodeError)):
                m.validate(path, *fixture(''))

    def test_csv_truncation_and_wrong_xml_are_rejected(self):
        for body in (b'id,title\n', b'id,title,availability,price,link,image_link\n1,short\n',
                     b'id,title,availability,price,link,image_link\n"unfinished'):
            with self.assertRaises((ValueError, m.csv.Error)):
                m.validate('feed.csv', 200, {'content-type': 'text/csv'}, body)
        for body in (b'<html/>', b'<rss/>', b'<broken'):
            with self.assertRaises((ValueError, m.ET.ParseError)):
                m.validate('feed.xml', 200, {'content-type': 'application/xml'}, body)

    def test_missing_asset_and_empty_body_fail(self):
        for status, body in ((404, b'no'), (500, b'bad'), (200, b'')):
            with self.subTest(status=status), self.assertRaises(ValueError):
                m.validate('pedido.js', status, {'content-type': 'text/javascript'}, body)

    def test_old_commit_and_cache_are_rejected(self):
        with self.assertRaises(ValueError):
            m.validate('version.json', *fixture('version.json'), expected_commit='b' * 40)
        status, headers, body = fixture('version.json')
        headers['cache-control'] = 'public, max-age=300'
        with self.assertRaises(ValueError):
            m.validate('version.json', status, headers, body)

    def test_invalid_metadata_is_rejected(self):
        for data in ({'versao': '7.1', 'commit': 'a' * 40}, {'versao': '7.1.0', 'commit': ''}):
            with self.assertRaises(ValueError):
                m.validate('version.json', 200, {'cache-control': 'no-store'}, json.dumps(data).encode())

    def test_network_failure_does_not_skip_remaining_resources_or_leak_body(self):
        calls = []
        def fail(url):
            calls.append(url)
            raise TimeoutError('conteudo-privado')
        result = m.check('https://exemplo.com/', fail)
        self.assertFalse(result['ok'])
        self.assertEqual(len(calls), 9)
        self.assertNotIn('conteudo-privado', json.dumps(result))

    def test_wrong_sitemap_namespace_and_unbranded_page_fail(self):
        for path, kind, body in [('sitemap.xml', 'application/xml', b'<urlset/>'), ('', 'text/html', b'<html>outro</html>')]:
            with self.assertRaises(ValueError):
                m.validate(path, 200, {'content-type': kind}, body)


if __name__ == '__main__':
    unittest.main()
