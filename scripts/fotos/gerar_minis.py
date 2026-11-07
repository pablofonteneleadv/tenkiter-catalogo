#!/usr/bin/env python3
"""Gera as cópias reduzidas (240 e 480 px) das fotos ANTIGAS do R2, em lotes. Idempotente e aditivo: nunca apaga nem troca a original.

Identidade: token OIDC do GitHub Actions (audiência `tenkiter-midia-mini`) — não usa segredo nenhum. O Worker `tenkiter-midia`
só aceita o workflow `fotos-mini.yml` da `main` (rota /internal/mini).
Variáveis: MINI_BASE (endereço do Worker; padrão o de produção), MINI_MAX (máx. de fotos por execução; padrão 300),
MINI_SO_SAUDE=1 (só confere a identidade), MINI_TOKEN_TESTE (só para teste local com serviço simulado).
"""
import io, json, os, sys, time, urllib.error, urllib.parse, urllib.request

LARGURAS = (240, 480)   # 480 = cartões da vitrine; 240 = miniaturas pequenas (lista do painel, bolinhas, sacola)
ALTURA_MAX = {240: 320, 480: 640}
MAX_BYTES = 150 * 1024
USER_AGENT = 'TENKiTER-Fotos-Mini/1.0 (+https://github.com/pablofonteneleadv/tenkiter-catalogo)'
BASE = os.environ.get('MINI_BASE', 'https://tenkiter-midia.distkrpconfeccoes.workers.dev') + '/internal/mini'


def token():
    teste = os.environ.get('MINI_TOKEN_TESTE')
    if teste:
        return teste
    url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'] + '&audience=tenkiter-midia-mini'
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN'], 'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)['value']


def chamar(acao, params=None, corpo=None, bruto=False):
    q = {'acao': acao}
    q.update(params or {})
    cab = {'Authorization': 'Bearer ' + token(), 'User-Agent': USER_AGENT}
    if corpo is not None:
        cab['Content-Type'] = 'application/octet-stream'
    req = urllib.request.Request(BASE + '?' + urllib.parse.urlencode(q), data=corpo, method='POST' if corpo is not None else 'GET', headers=cab)
    with urllib.request.urlopen(req, timeout=90) as r:
        dados = r.read(5 * 1048576 + 1)
    if len(dados) > 5 * 1048576:
        raise ValueError('Resposta acima do limite')
    return dados if bruto else json.loads(dados)


def reduzir(dados, largura=480):
    """Bytes da foto original -> bytes JPEG com a largura pedida (sem ampliar), menor que 150 KB."""
    from PIL import Image, ImageOps
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(dados)))
    if img.mode in ('RGBA', 'LA', 'P'):
        fundo = Image.new('RGB', img.size, (255, 255, 255))
        img = img.convert('RGBA')
        fundo.paste(img, mask=img.split()[-1])
        img = fundo
    else:
        img = img.convert('RGB')
    esc = min(1.0, largura / img.width, ALTURA_MAX[largura] / img.height)
    if esc < 1.0:
        img = img.resize((max(1, round(img.width * esc)), max(1, round(img.height * esc))), Image.LANCZOS)
    for q in (74, 62, 50, 40):
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=q, optimize=True, progressive=True)
        if buf.tell() <= MAX_BYTES:
            return buf.getvalue()
    raise ValueError('Não coube em 150 KB')


def main():
    for tentativa in range(36):
        try:
            print('Identidade e armazenamento:', chamar('saude'))
            break
        except urllib.error.HTTPError as erro:
            if erro.code not in (404, 503) or tentativa == 35:
                raise
            print('Aguardando publicação do Worker atualizado…')
            time.sleep(10)
    if os.environ.get('MINI_SO_SAUDE') == '1':
        return 0
    maximo = int(os.environ.get('MINI_MAX', '300'))
    feitas = falhas = 0
    cursor = ''
    while feitas + falhas < maximo:
        lote = chamar('lote', {'cursor': cursor, 'limite': 500} if cursor else {'limite': 500})
        for chave in lote['pendentes']:
            if feitas + falhas >= maximo:
                break
            try:
                original = chamar('origem', {'chave': chave}, bruto=True)
                tamanhos = []
                for largura in LARGURAS:
                    mini = reduzir(original, largura)
                    r = chamar('gravar', {'chave': chave, 'w': largura}, corpo=mini)
                    if not r.get('ok'):
                        raise ValueError(r.get('erro') or 'recusada')
                    tamanhos.append(len(mini))
                feitas += 1
                print('ok', chave, tamanhos, 'bytes')
            except Exception as erro:   # uma foto ruim não para as outras; a próxima execução tenta de novo
                falhas += 1
                print('falhou', chave, '-', erro)
        if lote.get('fim') or not lote.get('cursor'):
            break
        cursor = lote['cursor']
    print('Resumo: cópias criadas', feitas, '| falhas', falhas, '| (rodar de novo continua de onde parou)')
    return 1 if falhas and not feitas else 0


if __name__ == '__main__':
    sys.exit(main())
