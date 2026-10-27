"""Instala apenas a regra de cache do atualizador; preserva as demais regras Render."""
import json,os,urllib.request,urllib.parse
key=os.environ['RENDER_API_KEY'].strip();service=os.environ['RENDER_SERVICE_ID'].strip()
base='https://api.render.com/v1/services/'+urllib.parse.quote(service,safe='')+'/headers'
def request(url,body=None):
 req=urllib.request.Request(url,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+key,'Accept':'application/json','Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
rows=[];cursor=''
for _ in range(10):
 page=request(base+'?limit=100'+('&cursor='+urllib.parse.quote(cursor,safe='') if cursor else ''))
 rows.extend(page)
 if len(page)<100:break
 cursor=page[-1]['cursor']
else:raise SystemExit('Muitas regras de cabeçalho; confira a paginação antes de alterar.')
target=[x['header'] for x in rows if x['header']['path']=='/android/latest.json' and x['header']['name'].lower()=='cache-control']
if target:
 if not all('no-store' in x['value'].lower() for x in target):raise SystemExit('Existe regra diferente para o manifesto; preserve e revise antes de alterar.')
 print('Manifesto Android já possui no-store no Render.')
else:
 r=request(base,{'path':'/android/latest.json','name':'Cache-Control','value':'no-store, max-age=0'})
 if 'no-store' not in (r.get('header',r.get('headers',r))).get('value',''):raise SystemExit('O Render não confirmou o cabeçalho do manifesto.')
 print('Manifesto Android configurado com no-store no Render; demais regras preservadas.')
