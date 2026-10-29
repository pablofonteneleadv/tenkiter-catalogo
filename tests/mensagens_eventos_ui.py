"""Eventos no atendimento, APIs/WS simulados: rascunho, foco e contexto preservados."""
import os, copy
from pathlib import Path
from mock import install, SESSION, PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright
BASE=os.getenv('TK_BASE','http://localhost:8782/')
OUT=Path(os.getenv('TK_EVID',str(Path(__file__).parent/'evidencias_edicao'/'eventos')));OUT.mkdir(parents=True,exist_ok=True)
FAKE_WS="""window.__sockets=[];window.WebSocket=class{
 constructor(url,protocols){this.url=url;this.protocols=protocols;this.readyState=0;window.__sockets.push(this);setTimeout(()=>{if(this.readyState!==0||window.__wsFail)return;this.readyState=1;this.onopen?.()},5)}
 close(){this.readyState=3;this.onclose?.()}
 send(d){if(JSON.parse(d).tipo==='ping')this.onmessage?.({data:'{"tipo":"pong"}'})}
};window.__sinal=(seq)=>{for(const s of window.__sockets)if(s.readyState===1)s.onmessage?.({data:JSON.stringify({tipo:'atualizar',seq})})};"""
with sync_playwright() as pw:
 b=pw.chromium.launch(args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(412,915),(1440,900),(390,470)]:
  ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=w<600,service_workers='block');ctx.add_init_script(SESSION);ctx.add_init_script(FAKE_WS)
  st=install(ctx,perms=PERMS_ALL,versao='4.28');s=st['ig']['msg']=mock_msg.novo_estado()
  tickets=[]
  def obter(r):
   d=r.request.post_data_json;tickets.append(d)
   r.fulfill(json={'ok':True,'socketUrl':'wss://teste.invalid/msg/tempo-real','renovarEm':240000,'tickets':[{'canal':c,'token':'ticketTeste123456'+c} for c in d['canais']]})
  ctx.route('**/msg/tempo-real/ticket',obter)
  pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'admin.html?app=mensagens');pg.wait_for_selector('#ms-lista .ms-conv')
  pg.wait_for_function('window.__sockets.filter(x=>x.readyState===1).length===3')
  pg.locator('#ms-busca').fill('Maria');pg.wait_for_timeout(450)
  before=copy.deepcopy(s['convs'][0]);s['convs'][0]['previa']='Novidade imediata';s['convs'][0]['atualizada_em']=mock_msg.agora()
  pg.evaluate('window.__sinal(1)');pg.wait_for_function('document.querySelector("#ms-lista").textContent.includes("Novidade imediata")',timeout=1800)
  assert pg.locator('#ms-busca').input_value()=='Maria'
  pg.locator('#ms-lista .ms-conv[data-id="1"]').click();pg.wait_for_selector('#ms-texto');pg.locator('#ms-texto').fill('Rascunho preservado');pg.locator('#ms-texto').focus()
  # Story antigo enriquecido deve atualizar sem mensagem duplicada nem perder o rascunho.
  antigo=s['msgs'][0];antigo.update(ctx_tipo='story',ctx_midia=0,status_em=mock_msg.agora())
  pg.evaluate('window.__sinal(2)');pg.wait_for_function('document.querySelector("#ms-fio").textContent.includes("story")',timeout=1800)
  pg.wait_for_timeout(220);s['msgs'][0]['texto']='Contexto recebido depois';s['msgs'][0]['status_em']=mock_msg.agora()
  pg.evaluate('window.__sinal(3)');pg.wait_for_function('document.querySelector("#ms-fio").textContent.includes("Contexto recebido depois")',timeout=1800)
  assert pg.locator('#ms-texto').input_value()=='Rascunho preservado'
  assert pg.evaluate('document.activeElement.id')=='ms-texto'
  assert pg.locator('#ms-fio .ms-bolha[data-id="1"]').count()==1
  for scale in [100,130]:
   pg.evaluate('(x)=>document.documentElement.style.fontSize=x+"%"',scale)
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert pg.locator('#ms-texto').evaluate('(x)=>x.getBoundingClientRect().bottom<=innerHeight+1')
   pg.screenshot(path=str(OUT/f'eventos-{w}-{h}-{scale}.png'))
  # Falha de WS conserva a consulta periódica original.
  pg.evaluate('window.__wsFail=true;window.__sockets.forEach(s=>{if(s.readyState===1)s.close()})')
  s['msgs'][0].update(texto='Reconciliação por consulta',status_em=mock_msg.agora())
  pg.wait_for_function('document.querySelector("#ms-fio").textContent.includes("Reconciliação por consulta")',timeout=6000)
  assert not errors,errors
  assert tickets and all(set(x)=={'canais'} for x in tickets)
  ctx.close()
 b.close()
print('Eventos UI: cinco telas, texto100/130, atualização rápida, busca/foco/rascunho, enriquecimento e fallback aprovados.')
