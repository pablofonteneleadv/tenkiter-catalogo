"""Publica uma versão explícita e idempotente. Sem push/PR de bot na main protegida."""
import hashlib,json,os,re,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];REPO='pablofonteneleadv/tenkiter-catalogo'
def gh(*args):return subprocess.check_output(['gh',*args],cwd=ROOT,text=True)
def version(v):return tuple(map(int,v.split('.')))
def fingerprint():
 paths=['android/app','android/build.gradle','android/settings.gradle','android/gradle.properties','common.js']
 return hashlib.sha256(subprocess.check_output(['git','ls-tree','-r','HEAD','--',*paths],cwd=ROOT)).hexdigest()
def main():
 source=fingerprint();s=(ROOT/'android/app/build.gradle').read_text();m=re.search(r"versionCode\s+(\d+);\s*versionName\s+'([^']+)'",s);code=int(m[1]);name=m[2];tag='android-v'+name;filename=f'TENKiTER-Mensagens-{name}.apk'
 releases=json.loads(gh('api',f'repos/{REPO}/releases?per_page=100'))
 stable=[r for r in releases if not r['draft'] and not r['prerelease'] and re.fullmatch(r'android-v\d+\.\d+\.\d+',r['tag_name'])]
 previous=max([r for r in stable if r['tag_name']!=tag],key=lambda r:version(r['tag_name'][9:]),default=None)
 existing=next((r for r in releases if r['tag_name']==tag),None)
 marker='<!-- tenkiter-source:'+source+' -->'
 if existing and marker not in (existing.get('body') or ''):raise SystemExit('Tag existente com outra fonte. Incremente versionCode/versionName; não sobrescreva release')
 if previous and version(name)<=version(previous['tag_name'][9:]):raise SystemExit('Versão deve superar a release estável anterior')
 folder=ROOT/'dist';folder.mkdir(exist_ok=True);apk=folder/filename
 if existing:
  gh('release','download',tag,'--repo',REPO,'--dir',str(folder),'--clobber');print('Reutilizando release verificada da mesma fonte.')
 else:
  subprocess.run(['gradle','-p','android',':app:testDebugUnitTest',':app:lintDebug',':app:assembleRelease','--console','plain'],cwd=ROOT,check=True)
  candidates=list((ROOT/'android/app/build/outputs/apk/release').glob('*.apk'))
  if len(candidates)!=1:raise SystemExit('APK release não localizado de forma única')
  apk.write_bytes(candidates[0].read_bytes())
 signer=Path(os.environ['ANDROID_HOME'])/'build-tools/35.0.0/apksigner'
 def cert(p):
  output=subprocess.check_output([str(signer),'verify','--verbose','--print-certs',str(p)],text=True)
  match=re.search(r'Signer #1 certificate SHA-256 digest: ([a-f0-9]+)',output)
  if not match:raise ValueError('Certificado não localizado')
  return match[1]
 current_cert=cert(apk)
 if not previous:raise SystemExit('APK anterior confiável indisponível; não publicar atualização automática')
 with tempfile.TemporaryDirectory() as tmp:
  prevname=f"TENKiTER-Mensagens-{previous['tag_name'][9:]}.apk"
  gh('release','download',previous['tag_name'],'--repo',REPO,'--pattern',prevname,'--dir',tmp)
  if cert(Path(tmp)/prevname)!=current_cert:raise SystemExit('Certificado diverge da release anterior')
  old_badging=subprocess.check_output([str(Path(os.environ['ANDROID_HOME'])/'build-tools/35.0.0/aapt'),'dump','badging',str(Path(tmp)/prevname)],text=True)
  if code<=int(re.search(r"versionCode='(\d+)'",old_badging)[1]):raise SystemExit('versionCode não supera o APK anterior')
 analyzer=Path(os.environ['ANDROID_HOME'])/'build-tools/35.0.0/aapt'
 badging=subprocess.check_output([str(analyzer),'dump','badging',str(apk)],text=True)
 if f"name='br.com.tenkitermodas.mensagens' versionCode='{code}' versionName='{name}'" not in badging:raise SystemExit('Package/versão do APK divergente')
 digest=hashlib.sha256(apk.read_bytes()).hexdigest();size=apk.stat().st_size
 manifest={'versionCode':code,'versionName':name,'bytes':size,'sha256':digest,'url':f'https://github.com/{REPO}/releases/download/{tag}/{filename}','notes':'Melhorias de mídia, câmera e confiabilidade. Instale sobre a versão anterior para preservar seus dados.'}
 (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');(folder/(filename[:-4]+'.sha256')).write_text(digest+'  '+filename+'\n')
 if existing:
  asset=next((a for a in existing['assets'] if a['name']==filename),None)
  if not asset or asset['size']!=size or (asset.get('digest') and asset['digest']!='sha256:'+digest):raise SystemExit('APK existente diverge do manifesto')
 else:
  notes=folder/'notes.md';notes.write_text('APK assinado e certificado comparado à versão anterior. Instale sem desinstalar.\n\n'+marker+'\n\nTeste em Android físico não executado nesta automação.\n')
  gh('release','create',tag,str(apk),str(folder/(filename[:-4]+'.sha256')),str(folder/'manifest.json'),'--repo',REPO,'--target',os.environ['GITHUB_SHA'],'--title','TENKiTER Android '+name,'--notes-file',str(notes),'--draft')
 # Somente a main aprovada publica o candidato; rerun reutiliza bytes, versão e assinatura.
 if os.environ['GITHUB_REF']=='refs/heads/main':gh('release','edit',tag,'--repo',REPO,'--draft=false','--latest')
 print('Release '+name+' verificada. Certificado SHA-256: '+current_cert)
if __name__=='__main__':main()
