"""Publica um APK já assinado, preparado na branch android-installers, antes do site.
Executado no GitHub Actions com o token efêmero do job; não contém credenciais.
"""
import hashlib,json,os,pathlib,re,subprocess,tempfile
root=pathlib.Path(__file__).resolve().parents[2]
manifest=root/'android/latest.json'
if not manifest.exists():raise SystemExit(0)
r=json.loads(manifest.read_text());version=r['versionName'];code=r['versionCode'];digest=r['sha256'];size=r['bytes']
if not re.fullmatch(r'\d+\.\d+\.\d+',version) or not isinstance(code,int) or code<1 or not re.fullmatch('[a-f0-9]{64}',digest) or not 0<size<=52428800:raise SystemExit('Manifesto Android inválido')
repo='pablofonteneleadv/tenkiter-catalogo';tag='android-v'+version;filename=f'TENKiTER-Mensagens-{version}.apk'
assert r['url']==f'https://github.com/{repo}/releases/download/{tag}/{filename}'
def gh(*args,optional=False):
 p=subprocess.run(['gh',*args],capture_output=True,text=True,cwd=root)
 if p.returncode and not optional:raise RuntimeError(p.stderr[-1000:])
 return p
found=gh('api',f'repos/{repo}/releases/tags/{tag}',optional=True)
release=json.loads(found.stdout) if found.returncode==0 else None
if release and not release['draft']:
 asset=next((a for a in release['assets'] if a['name']==filename),None)
 if asset and asset['size']==size and asset.get('digest')=='sha256:'+digest:
  print(f'Instalador {version} já publicado e conferido.');raise SystemExit(0)
 # Uma release existente nunca é sobrescrita automaticamente.
 if not asset:raise SystemExit('Release existente sem o APK esperado; confira antes de continuar')
 with tempfile.TemporaryDirectory() as temp:
  gh('release','download',tag,'--repo',repo,'--pattern',filename,'--dir',temp)
  b=(pathlib.Path(temp)/filename).read_bytes()
  if len(b)!=size or hashlib.sha256(b).hexdigest()!=digest:raise SystemExit('Asset existente difere do manifesto')
 print(f'Instalador {version} já publicado e conferido por download.');raise SystemExit(0)
subprocess.run(['git','fetch','--depth=1','origin','refs/heads/android-installers'],cwd=root,check=True)
with tempfile.TemporaryDirectory() as temp:
 folder=pathlib.Path(temp);apk=folder/filename
 with apk.open('wb') as output:
  subprocess.run(['git','show',f'FETCH_HEAD:releases/{version}/{filename}'],cwd=root,stdout=output,check=True)
 b=apk.read_bytes()
 if len(b)!=size or hashlib.sha256(b).hexdigest()!=digest:raise SystemExit('APK preparado difere do manifesto')
 sha=folder/(filename[:-4]+'.sha256');sha.write_text(digest+'  '+filename+'\n')
 notes=folder/'notes.md';notes.write_text(r['notes']+('' if 'desinstale' in r['notes'].lower() else '\n\nInstale sobre a versão anterior, sem desinstalar.')+' A instalação pede confirmação do Android. Fonte: '+os.environ.get('GITHUB_SHA','main')+'\n')
 if release:raise SystemExit('Existe um rascunho desta versão; confira antes de publicar')
 gh('release','create',tag,str(apk),str(sha),'--repo',repo,'--target',os.environ.get('GITHUB_SHA','main'),'--title','TENKiTER Mensagens '+version,'--notes-file',str(notes),'--draft')
 verify=folder/'verify';verify.mkdir()
 gh('release','download',tag,'--repo',repo,'--pattern',filename,'--dir',str(verify))
 assert hashlib.sha256((verify/filename).read_bytes()).hexdigest()==digest
 gh('release','edit',tag,'--repo',repo,'--draft=false')
 print(f'Instalador {version} publicado e conferido antes do site.')
