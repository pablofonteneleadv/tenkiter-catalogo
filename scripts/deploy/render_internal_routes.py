"""Proteção aditiva de URLs internas antigas; preserva rotas comerciais existentes."""
import json
import os
import re
import urllib.parse
import urllib.request

SOURCES = ('/scripts/*', '/tests/*', '/docs/*', '/og-service/*', '/og-worker/*',
           '/midia-worker/*', '/instagram-worker/*', '/.github/*', '/.agents/*',
           '/lotes-a-c.patch', '/tenkiter-arquivos-modificadosok.zip', '/CLAUDE.md', '/AGENTS.md')
DESTINATION = '/__arquivo-interno-indisponivel__'


def list_routes(request):
    rows, cursor = [], ''
    for _ in range(10):
        page = request('?limit=100' + ('&cursor=' + urllib.parse.quote(cursor, safe='') if cursor else ''))
        rows.extend(item['route'] for item in page)
        if len(page) < 100:
            return rows
        cursor = page[-1]['cursor']
        if not cursor:
            break
    raise ValueError('Paginação incompleta; nenhuma rota substituída.')


def ensure(request):
    rows = list_routes(request)
    missing = []
    for source in SOURCES:
        found = [r for r in rows if r['source'] == source]
        if any(r['type'] != 'redirect' or r['destination'] != DESTINATION for r in found):
            raise ValueError('Conflito de rota interna; revisão necessária.')
        if not found:
            missing.append({'source': source, 'destination': DESTINATION, 'type': 'redirect'})
    for row in missing:
        request('', row)
    rows = list_routes(request)
    if any(not any(r['source'] == source and r['type'] == 'redirect' and r['destination'] == DESTINATION for r in rows) for source in SOURCES):
        raise ValueError('Render não confirmou proteção de URLs internas.')
    return len(missing)


def main():
    key, service = os.environ['RENDER_API_KEY'].strip(), os.environ['RENDER_SERVICE_ID'].strip()
    if not re.fullmatch(r'srv-[a-z0-9]+', service):
        raise ValueError('Serviço inválido.')
    base = 'https://api.render.com/v1/services/' + service + '/routes'
    def request(suffix, body=None):
        req = urllib.request.Request(base + suffix, data=None if body is None else json.dumps(body).encode(),
                                     headers={'Authorization': 'Bearer ' + key, 'Accept': 'application/json', 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    print('Render: %d proteções internas acrescentadas; rotas existentes preservadas.' % ensure(request))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('::error::Proteção interna não confirmada (' + type(error).__name__ + ').')
        raise SystemExit(1)
