"""Aplica cabeçalhos aditivos; preserva regras desconhecidas e recusa conflitos."""
import json
import os
import urllib.parse
import urllib.request

HEADERS = [
    {'path': '/*', 'name': 'X-Content-Type-Options', 'value': 'nosniff'},
    {'path': '/*', 'name': 'X-Frame-Options', 'value': 'SAMEORIGIN'},
    {'path': '/*', 'name': 'Referrer-Policy', 'value': 'strict-origin-when-cross-origin'},
    {'path': '/*', 'name': 'Strict-Transport-Security', 'value': 'max-age=31536000'},
    {'path': '/version.json', 'name': 'Cache-Control', 'value': 'no-store'},
    {'path': '/android/latest.json', 'name': 'Cache-Control', 'value': 'no-store, max-age=0'},
]


def list_headers(request):
    rows, cursor = [], ''
    for _ in range(10):
        page = request('?limit=100' + ('&cursor=' + urllib.parse.quote(cursor, safe='') if cursor else ''))
        rows.extend(item['header'] for item in page)
        if len(page) < 100:
            return rows
        cursor = page[-1]['cursor']
        if not cursor:
            raise ValueError('Paginação de cabeçalhos incompleta.')
    raise ValueError('Limite de paginação atingido; nenhuma regra foi substituída.')


def compatible(current, wanted):
    if current == wanted:
        return True
    if wanted['name'].lower() == 'cache-control':
        return 'no-store' in current['value'].lower()
    return current['value'].strip().lower() == wanted['value'].strip().lower()


def ensure(request):
    rows = list_headers(request)
    missing = []
    # Confere todos os conflitos antes de começar a criar regras.
    for wanted in HEADERS:
        found = [r for r in rows if r['path'] == wanted['path'] and r['name'].lower() == wanted['name'].lower()]
        if any(not compatible(r, wanted) for r in found):
            raise ValueError('Regra existente precisa de revisão: ' + wanted['name'])
        if not found:
            missing.append(wanted)
    for wanted in missing:
        request('', wanted)
    rows = list_headers(request)
    for wanted in HEADERS:
        found = [r for r in rows if r['path'] == wanted['path'] and r['name'].lower() == wanted['name'].lower()]
        if not found or any(not compatible(r, wanted) for r in found):
            raise ValueError('Render não confirmou o cabeçalho: ' + wanted['name'])
    return len(missing)


def main():
    key, service = os.environ['RENDER_API_KEY'].strip(), os.environ['RENDER_SERVICE_ID'].strip()
    if not key or not service:
        raise ValueError('Credenciais do Render ausentes.')
    base = 'https://api.render.com/v1/services/' + urllib.parse.quote(service, safe='') + '/headers'
    def request(suffix, body=None):
        req = urllib.request.Request(base + suffix, data=None if body is None else json.dumps(body).encode(),
                                     headers={'Authorization': 'Bearer ' + key, 'Accept': 'application/json', 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    count = ensure(request)
    print('Render: cabeçalhos de segurança e cache confirmados; %d regras acrescentadas, demais preservadas.' % count)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('::error::Cabeçalhos não confirmados (' + type(error).__name__ + '). Nenhum conflito foi sobrescrito.')
        raise SystemExit(1)
