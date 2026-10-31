"""Portão público: não basta publicar o site se o atualizador oferece APK antigo."""
import argparse,json,pathlib,time,urllib.request
FIELDS=('versionCode','versionName','bytes','sha256','url')
def main():
 p=argparse.ArgumentParser();p.add_argument('--manifest',type=pathlib.Path,default=pathlib.Path('android/latest.json'));p.add_argument('--site',default='https://tenkitermodas.com.br');p.add_argument('--attempts',type=int,default=24);p.add_argument('--delay',type=float,default=10);a=p.parse_args()
 from resolver_android_manifesto import latest
 expected=latest()
 local=json.loads(a.manifest.read_text())
 if local.get('versionCode',0)>expected['versionCode']:raise ValueError('Manifesto local aponta para release ainda não publicada')
 for n in range(max(1,a.attempts)):
  try:
   req=urllib.request.Request(a.site.rstrip('/')+'/android/latest.json',headers={'Cache-Control':'no-cache','Accept':'application/json'})
   with urllib.request.urlopen(req,timeout=15) as r:
    raw=r.read(32769)
    if len(raw)>32768:raise ValueError('manifesto grande demais')
    actual=json.loads(raw)
    if any(actual.get(k)!=expected[k] for k in FIELDS):raise ValueError('o endereço público ainda oferece outra versão do APK')
    if 'no-store' not in r.headers.get('Cache-Control','').lower():raise ValueError('o manifesto ainda permite cache')
   print('Atualizador público conferido: versão '+expected['versionName']+', SHA/tamanho/URL corretos e no-store.');return 0
  except Exception:
   print(f'Manifesto Android ainda não conferido ({n+1}/{a.attempts}); aguardando a borda atualizar.',flush=True)
   if n+1<a.attempts:time.sleep(a.delay)
 print('ERRO: o atualizador público não corresponde ao instalador publicado ou ainda permite cache.');return 1
if __name__=='__main__':raise SystemExit(main())
