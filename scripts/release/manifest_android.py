"""Gera manifesto público a partir do APK já assinado e conferido com apksigner."""
import argparse,hashlib,json,pathlib,re
p=argparse.ArgumentParser();p.add_argument('apk',type=pathlib.Path);p.add_argument('--version',required=True);p.add_argument('--code',required=True,type=int);p.add_argument('--notes',required=True);p.add_argument('--output',default='android/latest.json',type=pathlib.Path);a=p.parse_args()
if not re.fullmatch(r'\d+\.\d+\.\d+',a.version) or a.code<1:raise SystemExit('Versão inválida')
size=a.apk.stat().st_size
if not 0<size<=50*1024*1024:raise SystemExit('APK deve ter até 50 MB')
r={'versionCode':a.code,'versionName':a.version,'bytes':size,'sha256':hashlib.file_digest(a.apk.open('rb'),'sha256').hexdigest(),'url':f'https://github.com/pablofonteneleadv/tenkiter-catalogo/releases/download/android-v{a.version}/TENKiTER-Mensagens-{a.version}.apk','notes':a.notes}
a.output.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print('Manifesto gerado; publique e confira o asset antes de disponibilizá-lo no site.')
