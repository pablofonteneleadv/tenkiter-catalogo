"""Confirma 404/410 depois de redirecionamentos; 200 com HTML também é falha."""
import urllib.error
import urllib.request

PATHS = ('scripts/deploy/build_version.sh', 'tests/mock.py', 'lotes-a-c.patch', 'tenkiter-arquivos-modificadosok.zip')
HOSTS = ('https://tenkitermodas.com.br/', 'https://tenkiter-site.distkrpconfeccoes.workers.dev/')


def check(opener=urllib.request.urlopen):
    failures = []
    for host in HOSTS:
        for path in PATHS:
            try:
                # 7.96.8: com o domínio na Cloudflare, pedido sem User-Agent leva 403 da proteção contra robôs (não diz nada do arquivo).
                headers = {'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0 (compatible; TENKiTER-conferencia-deploy)'}
                with opener(urllib.request.Request(host + path, headers=headers), timeout=25) as response:
                    status = response.status
            except urllib.error.HTTPError as error:
                status = error.code
            except Exception:
                status = 0
            if status not in (404, 410):
                failures.append(host + path)
    if failures:
        raise ValueError('%d URLs internas ainda não terminaram em 404/410.' % len(failures))


if __name__ == '__main__':
    try:
        check()
        print('Arquivos internos: 404/410 confirmados no domínio da loja e no site da Cloudflare.')
    except Exception as error:
        print('::error::' + str(error))
        raise SystemExit(1)
