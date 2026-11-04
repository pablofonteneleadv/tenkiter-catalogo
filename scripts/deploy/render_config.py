"""Confere buildCommand e publishPath efetivos antes do deploy estático."""
import json
import os
import urllib.request


def ensure(request, build, publish):
    wanted = {'buildCommand': build, 'publishPath': publish}
    current = request('GET')
    details = current.get('serviceDetails', {})
    if all(details.get(k) == v for k, v in wanted.items()):
        return
    request('PATCH', {'serviceDetails': wanted})
    details = request('GET').get('serviceDetails', {})
    if not all(details.get(k) == v for k, v in wanted.items()):
        raise ValueError('Render não confirmou buildCommand/publishPath. Deploy interrompido para não publicar a raiz do checkout.')


def main():
    key = os.environ['RENDER_API_KEY'].strip()
    service = os.environ['RENDER_SERVICE_ID'].strip()
    if not key or not service or not service.replace('-', '').isalnum():
        raise ValueError('Configuração do Render ausente ou inválida.')
    url = 'https://api.render.com/v1/services/' + service

    def request(method, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={
            'Authorization': 'Bearer ' + key, 'Accept': 'application/json', 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    ensure(request, os.environ.get('BUILD_COMMAND', 'bash scripts/deploy/build_version.sh'), '.public-site')
    print('Render: buildCommand e diretório público confirmados.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Não imprimir respostas remotas nem conteúdo de credenciais.
        print('::error::Não foi possível confirmar a configuração de publicação do Render (' + type(error).__name__ + ').')
        raise SystemExit(1)
