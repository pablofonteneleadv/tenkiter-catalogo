"""Confirma 404/410 depois de redirecionamentos; 200 com HTML também é falha."""
import urllib.error
import urllib.request

PATHS = ('scripts/deploy/build_version.sh', 'tests/mock.py', 'lotes-a-c.patch', 'tenkiter-arquivos-modificadosok.zip')
HOSTS = ('https://tenkitermodas.com.br/', 'https://tenkiter-catalogo.onrender.com/')


def check(opener=urllib.request.urlopen):
    failures = []
    for host in HOSTS:
        for path in PATHS:
            try:
                with opener(urllib.request.Request(host + path, headers={'Cache-Control': 'no-cache'}), timeout=25) as response:
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
        print('Arquivos internos: 404/410 confirmados no domínio da loja e no Render.')
    except Exception as error:
        print('::error::' + str(error))
        raise SystemExit(1)
