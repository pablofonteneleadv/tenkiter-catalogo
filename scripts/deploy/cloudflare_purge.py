"""Purge com validação prévia e diagnóstico sem expor credenciais ou respostas."""
import json
import os
import re
import time
import urllib.parse
import urllib.request


def payload(target):
    if target == 'tudo':
        return {'purge_everything': True}
    urls = [u.strip() for u in target.split(',') if u.strip()]
    if not urls or any(urllib.parse.urlsplit(u).scheme != 'https' or urllib.parse.urlsplit(u).hostname != 'tenkitermodas.com.br' for u in urls):
        raise ValueError('URLs de purge fora do domínio da loja.')
    return {'files': urls}


def purge(zone, token, body, request, pause=time.sleep):
    # Não inventar caracteres ausentes nem tentar adivinhar o identificador.
    if not re.fullmatch(r'[a-fA-F0-9]{32}', zone):
        raise ValueError('CLOUDFLARE_ZONE_ID inválido: precisa conter exatamente 32 caracteres hexadecimais. Corrija no GitHub Secrets; não envie o valor pelo chat.')
    if not token or any(c.isspace() for c in token):
        raise ValueError('CLOUDFLARE_API_TOKEN ausente ou contém espaço interno. Corrija no GitHub Secrets.')
    for attempt in range(3):
        try:
            response = request(zone, token, body)
            if response.get('success') is True:
                return
            raise ValueError('Cloudflare não confirmou a limpeza; confira Cache Purge e o escopo da zona no token.')
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2:
                raise ValueError('Cloudflare indisponível após três tentativas.') from None
            pause(2)


def main():
    def request(zone, token, body):
        req = urllib.request.Request('https://api.cloudflare.com/client/v4/zones/' + zone + '/purge_cache',
                                     data=json.dumps(body).encode(), method='POST',
                                     headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    purge(os.environ.get('CLOUDFLARE_ZONE_ID', '').strip(), os.environ.get('CLOUDFLARE_API_TOKEN', '').strip(),
          payload(os.environ.get('PURGE_ALVO', 'tudo')), request)
    print('PURGE_OK: Cloudflare confirmou a limpeza.')


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        print('::error::' + str(error))
        raise SystemExit(1)
    except Exception as error:
        print('::error::Purge não confirmado (' + type(error).__name__ + '). Verifique configuração e permissões no GitHub.')
        raise SystemExit(1)
