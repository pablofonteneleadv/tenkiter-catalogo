"""Resolve manifesto da última release estável, já publicada e assinada pelo pipeline."""
import json,os,re,urllib.request
from pathlib import Path
REPO='pablofonteneleadv/tenkiter-catalogo'
def get(url):
 headers={'Accept':'application/vnd.github+json','User-Agent':'TENKiTER-deploy'}
 if os.environ.get('GH_TOKEN') and url.startswith('https://api.github.com/'):headers['Authorization']='Bearer '+os.environ['GH_TOKEN']
 with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30) as r:
  raw=r.read(2*1048576+1)
  if len(raw)>2*1048576:raise ValueError('Resposta muito grande')
  return json.loads(raw)
def latest():
 releases=get(f'https://api.github.com/repos/{REPO}/releases?per_page=100')
 releases=[r for r in releases if not r['draft'] and not r['prerelease'] and re.fullmatch(r'android-v\d+\.\d+\.\d+',r['tag_name'])]
 r=max(releases,key=lambda r:tuple(map(int,r['tag_name'][9:].split('.'))));name=r['tag_name'][9:]
 manifest=next((a for a in r['assets'] if a['name']=='manifest.json'),None)
 if not manifest:raise ValueError('Release mais recente não possui manifesto verificado')
 m=get(manifest['browser_download_url']);filename=f'TENKiTER-Mensagens-{name}.apk';apk=next((a for a in r['assets'] if a['name']==filename),None)
 if m['versionName']!=name or m['url']!=f'https://github.com/{REPO}/releases/download/android-v{name}/{filename}' or not apk or m['bytes']!=apk['size'] or apk.get('digest')!='sha256:'+m['sha256']:raise ValueError('Manifesto não corresponde à release mais recente')
 return m
if __name__=='__main__':
 Path('android/latest.json').write_text(json.dumps(latest(),ensure_ascii=False,indent=2)+'\n')
 print('Manifesto resolvido a partir da release estável verificada.')
