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
    headers = get(base + '/headers?limit=100', key)
    print(json.dumps({'renderCacheHeaders': [
        {k: row.get('header', row).get(k) for k in ('path', 'name', 'value')}
        for row in headers if str(row.get('header', row).get('name', '')).lower() == 'cache-control'
    ]}, ensure_ascii=False))
    for host in ('https://tenkitermodas.com.br/', 'https://tenkiter-catalogo.onrender.com/'):
        for path in ('version.json', 'scripts/deploy/build_version.sh', 'tests/mock.py', 'tenkiter-arquivos-modificadosok.zip'):
            try:
                with urllib.request.urlopen(urllib.request.Request(host + path, headers={'Cache-Control': 'no-cache'}), timeout=25) as response:
                    body = response.read(4 * 1024 * 1024)
                    print(json.dumps({'url': host + path, 'status': response.status, 'contentType': response.headers.get('Content-Type'),
                                      'cacheControl': response.headers.get('Cache-Control'), 'cacheStatus': response.headers.get('CF-Cache-Status'),
                                      'age': response.headers.get('Age'), 'sha256': hashlib.sha256(body).hexdigest()}))
            except urllib.error.HTTPError as error:
                print(json.dumps({'url': host + path, 'status': error.code}))
    import importlib.util
    from pathlib import Path
    spec = importlib.util.spec_from_file_location('worker_credentials', Path(__file__).resolve().parents[1] / 'ci/check_worker_credentials.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    try:
        result = module.validate(module.clean(os.environ.get('CLOUDFLARE_API_TOKEN', '')),
                                 module.clean(os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')), get)
        print(json.dumps({'contaWorkers': result}, ensure_ascii=False))
    except Exception as error:
        print('Conta Workers não confirmada (' + type(error).__name__ + ').')
    zone = os.environ.get('CLOUDFLARE_ZONE_ID', '').strip()
    print(json.dumps({'zoneIdValido': bool(re.fullmatch(r'[a-fA-F0-9]{32}', zone))}))
    try:
        zones = get('https://api.cloudflare.com/client/v4/zones?name=tenkitermodas.com.br', os.environ['CLOUDFLARE_API_TOKEN'].strip())
        print(json.dumps({'cloudflareSuccess': zones.get('success'), 'zonasCompativeis': len(zones.get('result', [])),
                          'zoneConfiguradaConfere': any(z.get('id') == zone and z.get('name') == 'tenkitermodas.com.br' for z in zones.get('result', [])),
                          'errorCodes': [e.get('code') for e in zones.get('errors', [])]}))
    except Exception as error:
        print('Cloudflare: consulta somente leitura indisponível (' + type(error).__name__ + ').')



def diagnostico_postagens_somente_leitura():
    """Operação pontual: SELECT de metadados e GET de capacidades; nunca publica."""
    import tomllib
    from pathlib import Path
    from datetime import datetime, timezone
    class SemRedirecionar(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    opener = urllib.request.build_opener(SemRedirecionar)
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '').strip()
    if not re.fullmatch(r'[a-fA-F0-9]{32}', account):
        raise ValueError('Conta inválida para diagnóstico.')
    config = tomllib.loads(Path('instagram-worker/wrangler.toml').read_text())
    db = next(x['database_id'] for x in config['d1_databases'] if x['binding'] == 'DB')
    token = os.environ['CLOUDFLARE_API_TOKEN'].strip()
    def select(sql):
        if not sql.lstrip().upper().startswith('SELECT ') or ';' in sql:
            raise ValueError('Somente SELECT único permitido.')
        req = urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/' + account + '/d1/database/' + db + '/query',
            data=json.dumps({'sql': sql, 'params': []}).encode(), method='POST',
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with opener.open(req, timeout=25) as response:
            result = json.load(response)
        if result.get('success') is not True:
            raise ValueError('Leitura D1 não confirmada.')
        return result['result'][0]['results']
    result = {'somente_leitura': True, 'conferido_em_utc': datetime.now(timezone.utc).isoformat()}
    try:
        result['fila_status2'] = select("SELECT status,COUNT(*) AS quantidade FROM postagem WHERE canal='whatsapp2' GROUP BY status")
        result['ultimo_status2_confirmado'] = select("SELECT MAX(publicado_em) AS publicado_em FROM postagem WHERE canal='whatsapp2' AND status='publicado'")
        result['proximo_status2'] = select("SELECT MIN(agendado_em) AS agendado_em FROM postagem WHERE canal='whatsapp2' AND status='agendado'")
        result['originais_futuros_divergentes'] = select("SELECT COUNT(*) AS quantidade FROM (SELECT origem_midia FROM postagem p WHERE status='agendado' AND agendado_em>=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND origem_midia<>'' AND NOT EXISTS(SELECT 1 FROM postagem q WHERE q.origem_midia=p.origem_midia AND q.status IN ('publicado','processando','manual_feito','manual_pendente')) GROUP BY origem_midia HAVING COUNT(DISTINCT agendado_em)>1)")
        # Credenciais permanecem apenas em memória e são usadas só no GET documentado.
        rows = select("SELECT valor FROM cfg WHERE chave='wafly_2' LIMIT 1")
        provider = json.loads(rows[0]['valor']) if rows else {}
        if all(provider.get(k) for k in ('instance', 'token', 'clientToken')):
            from urllib.parse import quote
            url = 'https://wafly.com.br/api-bridge-whats/instances/' + quote(str(provider['instance']),safe='') + '/token/' + quote(str(provider['token']),safe='') + '/status-publication'
            req = urllib.request.Request(url, headers={'Client-Token': str(provider['clientToken']), 'Accept': 'application/json'})
            with opener.open(req, timeout=20) as response:
                capacity = json.load(response)
                result['wafly2'] = {'http': response.status, **{k: capacity.get(k) for k in ('connected','supported','contactsReady')}}
        else:
            result['wafly2'] = {'configurada': False}
    except Exception as error:
        # Nunca imprime URL do provedor, corpo de erro ou credenciais.
        result['limite_diagnostico'] = type(error).__name__
    print(json.dumps({'diagnosticoPostagens': result},ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
        diagnostico_postagens_somente_leitura()
    except Exception as error:
        print('::error::Diagnóstico interrompido (' + type(error).__name__ + ').')
        raise SystemExit(1)
