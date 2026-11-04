"""Monitor público somente GET, sem sessão, pedidos, mensagens ou dados de clientes."""
import argparse
import csv
import io
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
LIMIT = 8 * 1024 * 1024


def site_url(source):
    match = re.search(r'\bSITE_URL\s*=\s*"(https://[^"\s]+/)"', source)
    if not match:
        raise ValueError('SITE_URL não encontrado em common.js.')
    return match[1]


def read(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'TENKiTER-monitor-somente-leitura', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=25) as response:
        body = response.read(LIMIT + 1)
        if len(body) > LIMIT:
            raise ValueError('Resposta excedeu o limite da conferência.')
        return response.status, {k.lower(): v for k, v in response.headers.items()}, body


def validate(path, status, headers, body, expected_commit=None):
    if status != 200 or not body.strip():
        raise ValueError('Resposta ausente ou HTTP incompatível.')
    content_type = headers.get('content-type', '').lower()
    text = body.decode('utf-8-sig')
    if path == '':
        if 'text/html' not in content_type or 'tenkiter' not in text.lower() or '<html' not in text.lower():
            raise ValueError('Página inicial fora do contrato.')
    elif path == 'version.json':
        data = json.loads(text)
        if not re.fullmatch(r'\d+\.\d+\.\d+', str(data.get('versao', ''))) or not re.fullmatch(r'[a-f0-9]{40}', str(data.get('commit', ''))):
            raise ValueError('Metadados da versão inválidos.')
        if 'no-store' not in headers.get('cache-control', '').lower():
            raise ValueError('Versão sem proteção contra cache antigo.')
        if expected_commit and data['commit'] != expected_commit:
            raise ValueError('Commit público diferente do esperado.')
    elif path == 'pedido.js':
        if 'javascript' not in content_type or text.lstrip().startswith('<') or 'operacaoPedido_' not in text:
            raise ValueError('Script de pedidos incompatível ou substituído por HTML.')
    elif path == 'feed.csv':
        if 'text/csv' not in content_type:
            raise ValueError('Feed CSV substituído por outro formato.')
        rows = csv.reader(io.StringIO(text), strict=True)
        columns = next(rows)
        required = {'id', 'title', 'availability', 'price', 'link', 'image_link'}
        if len(columns) != len(set(columns)) or not required.issubset(columns):
            raise ValueError('Cabeçalho do feed fora do contrato.')
        if any(len(row) != len(columns) for row in rows if row):
            raise ValueError('Feed CSV incompleto ou com colunas inconsistentes.')
    elif path == 'feed.xml':
        if 'xml' not in content_type:
            raise ValueError('Feed XML substituído por outro formato.')
        root = ET.fromstring(text)
        if root.tag != 'rss' or root.find('channel') is None:
            raise ValueError('Feed XML fora do contrato RSS.')
    elif path == 'sitemap.xml':
        if 'xml' not in content_type or ET.fromstring(text).tag != '{http://www.sitemaps.org/schemas/sitemap/0.9}urlset':
            raise ValueError('Sitemap fora do contrato.')


def check(base, fetch=read, expected_commit=None):
    results = []
    for path in ('', 'version.json', 'pedido.js', 'sitemap.xml', 'feed.csv', 'feed.xml'):
        start = time.monotonic()
        try:
            validate(path, *fetch(base + path), expected_commit=expected_commit)
            result = {'ok': True}
        except Exception as error:
            # Não registrar corpo, cabeçalhos de autenticação ou URLs de redirecionamento.
            result = {'ok': False, 'erro': type(error).__name__}
        results.append({'recurso': '/' + path, **result, 'duracao_s': round(time.monotonic() - start, 3)})
    return {'conferido_em': datetime.now(timezone.utc).isoformat(), 'ok': all(r['ok'] for r in results), 'verificacoes': results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-commit')
    parser.add_argument('--json-report', type=Path)
    args = parser.parse_args()
    result = check(site_url((ROOT / 'common.js').read_text()), expected_commit=args.expected_commit)
    if args.json_report:
        args.json_report.parent.mkdir(parents=True, exist_ok=True)
        args.json_report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    for row in result['verificacoes']:
        print(('OK' if row['ok'] else 'FALHOU') + ' ' + row['recurso'] + (' (' + row['erro'] + ')' if not row['ok'] else ''))
    raise SystemExit(0 if result['ok'] else 1)


if __name__ == '__main__':
    main()
