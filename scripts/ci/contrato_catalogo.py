"""Contrato público do catálogo: validação local e leitura remota explícita, sem gravações."""
import argparse
import json
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[2]


def validate(data):
    if not isinstance(data, dict) or data.get('ok') is not True or not isinstance(data.get('produtos'), list):
        raise ValueError('Resposta deve conter ok=true e uma lista de produtos.')
    for index, product in enumerate(data['produtos']):
        if not isinstance(product, dict):
            raise ValueError('Produto %d não é um objeto.' % index)
        for field, kinds in {'ID': (str, int, float), 'Nome': (str,), 'Preco': (str, int, float), 'Status': (str,)}.items():
            value = product.get(field)
            if isinstance(value, bool) or not isinstance(value, kinds):
                raise ValueError('Produto %d: campo obrigatório %s ausente ou de tipo incompatível.' % (index, field))
        if not str(product['ID']).strip():
            raise ValueError('Produto %d sem identificador.' % index)
    return len(data['produtos'])


def read(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'TENKiTER-contrato-leitura'})
    with urllib.request.urlopen(request, timeout=20) as response:
        content = response.read(8 * 1024 * 1024 + 1)
    if len(content) > 8 * 1024 * 1024:
        raise ValueError('Resposta maior que o limite de conferência.')
    return json.loads(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--fixture', type=Path)
    group.add_argument('--live', action='store_true', help='Consulta somente GET de versão e lista na API pública de common.js.')
    args = parser.parse_args()
    if args.fixture:
        count = validate(json.loads(args.fixture.read_text()))
    else:
        source = (ROOT / 'common.js').read_text()
        match = re.search(r'https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec', source)
        if not match:
            raise ValueError('Endereço público do backend não encontrado em common.js.')
        url = match[0]
        version = read(url + '?action=versao')
        if not version.get('ok') or not re.fullmatch(r'catalogo-\d+\.\d+', str(version.get('versao', ''))):
            raise ValueError('Versão do catálogo fora do contrato esperado.')
        count = validate(read(url + '?action=list'))
    print('Contrato público aprovado: %d produtos; lista vazia e campos adicionais são compatíveis.' % count)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Contrato público não validado: ' + type(error).__name__ + '. Consulte a disponibilidade e o formato esperado; nenhum dado foi alterado.')
        raise SystemExit(1)
