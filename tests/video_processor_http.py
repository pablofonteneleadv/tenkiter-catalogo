"""Cliente do processador se identifica sem afrouxar autenticação ou limites."""
import importlib.util,io,json,os
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('processor',Path(__file__).resolve().parents[1]/'scripts/wafly/process_queue.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class Response(io.BytesIO):pass
seen=[]
def request(req,timeout):
 seen.append(req)
 assert req.get_header('User-agent')==p.USER_AGENT
 return Response(json.dumps({'value':'simulado','ok':True}).encode())
with patch('urllib.request.urlopen',side_effect=request),patch.dict(os.environ,{'ACTIONS_ID_TOKEN_REQUEST_URL':'https://token.test/?api-version=2','ACTIONS_ID_TOKEN_REQUEST_TOKEN':'simulado'}):
 assert p.token()=='simulado'
 assert p.api('saude')['ok']
 assert seen[-1].get_header('Authorization')=='Bearer simulado'
 assert seen[-1].full_url==p.BASE+'?acao=saude'
with patch.object(p,'token',return_value='simulado'),patch('urllib.request.urlopen',return_value=Response(b'x'*65537)):
 try:p.api('saude');raise AssertionError('Resposta ilimitada aceita')
 except ValueError:pass
print('OK: identificação HTTP explícita, OIDC preservado e leitura limitada.')
