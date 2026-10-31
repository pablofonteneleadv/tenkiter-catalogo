"""Não aprovar site+manifesto antigos quando há APK estável mais novo. Sem rede."""
import contextlib,io,json,sys,tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts/deploy'))
import resolver_android_manifesto as resolver
import verificar_android_manifesto as verificar
repo=resolver.REPO
new={'versionCode':19,'versionName':'2.4.12','bytes':100,'sha256':'a'*64,'url':f'https://github.com/{repo}/releases/download/android-v2.4.12/TENKiTER-Mensagens-2.4.12.apk'}
release={'tag_name':'android-v2.4.12','draft':False,'prerelease':False,'assets':[{'name':'manifest.json','browser_download_url':'https://fixture.test/manifest.json'},{'name':'TENKiTER-Mensagens-2.4.12.apk','size':100,'digest':'sha256:'+'a'*64}]}
with patch.object(resolver,'get',side_effect=lambda url:[dict(release,tag_name='android-v2.4.13',draft=True),release] if '/releases?' in url else new):assert resolver.latest()==new
with patch.object(resolver,'get',side_effect=lambda url:[dict(release,assets=[])] if '/releases?' in url else new):
 try:resolver.latest();raise AssertionError('Release incompleta foi aceita')
 except ValueError:pass
with patch.object(resolver,'get',side_effect=lambda url:[release] if '/releases?' in url else dict(new,sha256='b'*64)):
 try:resolver.latest();raise AssertionError('Hash divergente foi aceito')
 except ValueError:pass
class Response:
 def __init__(self,data,cache='no-store'):self.data=data;self.headers={'Cache-Control':cache}
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,n):return json.dumps(self.data).encode()
with tempfile.TemporaryDirectory() as tmp:
 path=Path(tmp)/'latest.json';old=dict(new,versionCode=17,versionName='2.4.10');path.write_text(json.dumps(old))
 with patch.object(resolver,'latest',return_value=new),patch.object(sys,'argv',['check','--manifest',str(path),'--attempts','1']),contextlib.redirect_stdout(io.StringIO()):
  with patch('urllib.request.urlopen',return_value=Response(old)):assert verificar.main()==1,'Local e site antigos passaram apesar da release nova'
  with patch('urllib.request.urlopen',return_value=Response(new)):assert verificar.main()==0
  with patch('urllib.request.urlopen',return_value=Response(new,'max-age=300')):assert verificar.main()==1
print('OK: release estável mais recente, hash, manifesto antigo e no-store.')
