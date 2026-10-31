#!/usr/bin/env python3
"""Processador privado: OIDC do workflow/main. Não envia nem agenda publicações."""
import json,os,subprocess,tempfile,time,urllib.request,urllib.parse,urllib.error
from pathlib import Path
USER_AGENT='TENKiTER-Video-Processor/1.0 (+https://github.com/pablofonteneleadv/tenkiter-catalogo)'
BASE='https://tenkiter-ig.distkrpconfeccoes.workers.dev/internal/video'
def token():
 url=os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']+'&audience=tenkiter-video'
 req=urllib.request.Request(url,headers={'Authorization':'Bearer '+os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN'],'User-Agent':USER_AGENT})
 with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)['value']
def api(acao,job=None,body=None,method='GET',binary=False,part=None):
 query={'acao':acao}
 if job:query['id']=job['id']
 if part is not None:query['parte']=part
 headers={'Authorization':'Bearer '+token(),'User-Agent':USER_AGENT}
 if job:headers['X-Video-Lease']=job['lease']
 if body is not None:headers['Content-Type']='application/octet-stream'
 req=urllib.request.Request(BASE+'?'+urllib.parse.urlencode(query),data=body,method=method,headers=headers)
 with urllib.request.urlopen(req,timeout=90) as r:
  raw=r.read(40*1048576+1 if binary else 65537)
  if len(raw)>(40*1048576 if binary else 65536):raise ValueError('Resposta excedeu limite')
  return raw if binary else json.loads(raw)
def main():
 for attempt in range(36):
  try:
   print('Identidade e bindings:',api('saude'));break
  except urllib.error.HTTPError as error:
   if error.code not in (404,503) or attempt==35:raise
   print('Aguardando publicação do Worker atualizado…');time.sleep(10)
 if os.environ.get('VIDEO_HEALTH_ONLY')=='1':return
 failed=False
 for _ in range(3):
  job=api('proximo',method='POST').get('job')
  if not job:break
  try:
   with tempfile.TemporaryDirectory() as d:
    inp=Path(d)/'original';out=Path(d)/'final.mp4';inp.write_bytes(api('origem',job,binary=True))
    if job.get('partes'):
     from transcode import probe,plan_parts
     actual=float(probe(inp)['format']['duration'])
     if abs(actual-job['duracao'])>.15 or plan_parts(job['duracao'],job['inicio'])!=job['partes']:raise ValueError('Plano não corresponde ao original')
     budget=min(9961472,256*1048576//len(job['partes']))
     for part in job['partes']:
      subprocess.run(['bash','scripts/wafly/transcode.sh',str(inp),str(out),'--profile','postagens','--start',str(part['inicio']),'--duration',str(part['duracao']),'--max-bytes',str(budget)],check=True,timeout=650)
      r=api('resultado',job,out.read_bytes(),'POST',part=part['ordem'])
      if not r.get('ok'):raise ValueError('Parte não aceita')
    else:
     subprocess.run(['bash','scripts/wafly/transcode.sh',str(inp),str(out),'--profile',job['perfil'],'--start',str(job['inicio']),'--duration',str(job['duracao'])],check=True,timeout=650)
     r=api('resultado',job,out.read_bytes(),'POST')
     if not r.get('ok'):raise ValueError('Resultado não aceito')
   print('Vídeo preparado; aguardando conferência e envio manual.')
  except Exception:
   failed=True;api('falha',job,method='POST');print('Falha de preparação registrada; nenhum envio realizado.')
 if failed:raise SystemExit(1)
if __name__=='__main__':main()
