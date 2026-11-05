"""Valida somente as credenciais necessárias aos Workers workers.dev; apenas GET."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request


def clean(value):
    return value.replace('\r', '').replace('\n', '').replace('\t', '').strip()


def validate(token, account, get):
    if not token or not account:
        raise ValueError('CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID precisam estar configurados no GitHub Secrets.')
    verification = get('https://api.cloudflare.com/client/v4/user/tokens/verify', token)
    if verification.get('success') is not True or verification.get('result', {}).get('status') != 'active':
        raise ValueError('Cloudflare não confirmou token ativo; nenhuma publicação foi iniciada.')
    scripts = get('https://api.cloudflare.com/client/v4/accounts/' + urllib.parse.quote(account, safe='') + '/workers/scripts', token)
    if scripts.get('success') is not True or not isinstance(scripts.get('result'), list):
        raise ValueError('Cloudflare não confirmou acesso aos Workers da conta. Confira Workers Scripts no escopo do token.')
    expected = {'tenkiter-og', 'tenkiter-ig', 'tenkiter-midia'}
    return {'tokenAtivo': True, 'leituraWorkersConfirmada': True,
            'workersEsperadosEncontrados': sorted(expected & {s.get('id', '') for s in scripts['result']})}


def get(url, token):
    request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)


def main():
    result = validate(clean(os.environ.get('CLOUDFLARE_API_TOKEN', '')), clean(os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')), get)
    print('Cloudflare: token ativo e acesso à conta dos Workers confirmados.')
    print('Zone ID não é requisito dos Workers em workers.dev; purge do domínio é verificação separada.')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        print('::error::' + str(error))
        raise SystemExit(1)
    except Exception as error:
        print('::error::Credenciais dos Workers não confirmadas (' + type(error).__name__ + '). Nenhuma resposta/credencial foi impressa.')
        raise SystemExit(1)
