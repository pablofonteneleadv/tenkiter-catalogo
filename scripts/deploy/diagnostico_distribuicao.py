"""Diagnóstico explícito somente leitura; saída limitada a metadados não secretos."""
import json
import hashlib
import os
import re
import urllib.request


def get(url, token):
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def main():
    service = os.environ['RENDER_SERVICE_ID'].strip()
    if not re.fullmatch(r'srv-[a-z0-9]+', service):
        raise ValueError('Identificador do serviço inválido.')
    base = 'https://api.render.com/v1/services/' + service
    key = os.environ['RENDER_API_KEY'].strip()
    data = get(base, key)
    details = data.get('serviceDetails', {})
    print(json.dumps({'render': {k: data.get(k) for k in ('type', 'branch', 'rootDir')},
                      'staticSite': {k: details.get(k) for k in ('buildCommand', 'publishPath', 'url')}}, ensure_ascii=False))
    print(json.dumps({'routes': get(base + '/routes?limit=100', key)}, ensure_ascii=False))
    for host in ('https://tenkitermodas.com.br/', 'https://tenkiter-catalogo.onrender.com/'):
        for path in ('version.json', 'scripts/deploy/build_version.sh', 'tests/mock.py', 'tenkiter-arquivos-modificadosok.zip'):
            try:
                with urllib.request.urlopen(urllib.request.Request(host + path, headers={'Cache-Control': 'no-cache'}), timeout=25) as response:
                    body = response.read(4 * 1024 * 1024)
                    print(json.dumps({'url': host + path, 'status': response.status, 'contentType': response.headers.get('Content-Type'), 'sha256': hashlib.sha256(body).hexdigest()}))
            except urllib.error.HTTPError as error:
                print(json.dumps({'url': host + path, 'status': error.code}))
    zone = os.environ.get('CLOUDFLARE_ZONE_ID', '').strip()
    print(json.dumps({'zoneIdValido': bool(re.fullmatch(r'[a-fA-F0-9]{32}', zone))}))
    try:
        zones = get('https://api.cloudflare.com/client/v4/zones?name=tenkitermodas.com.br', os.environ['CLOUDFLARE_API_TOKEN'].strip())
        print(json.dumps({'cloudflareSuccess': zones.get('success'), 'zonasCompativeis': len(zones.get('result', [])),
                          'zoneConfiguradaConfere': any(z.get('id') == zone and z.get('name') == 'tenkitermodas.com.br' for z in zones.get('result', [])),
                          'errorCodes': [e.get('code') for e in zones.get('errors', [])]}))
    except Exception as error:
        print('Cloudflare: consulta somente leitura indisponível (' + type(error).__name__ + ').')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('::error::Diagnóstico interrompido (' + type(error).__name__ + ').')
        raise SystemExit(1)
