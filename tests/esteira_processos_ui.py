"""Fila local real: persistência, recarga, duas abas e falhas, sem serviços externos."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.getenv('TK_BASE','http://localhost:8773/').rstrip('/')+'/'
HTML='''<html lang="pt-BR"><title>Teste de processos</title><header><div class="cab"></div></header><main><label>Outra tarefa<input id="livre"></label></main><script src="esteira-processos.js"></script><script>window.conta='conta-a';window.fila=TKEsteiraProcessos({dono:()=>conta,worker:async(rota,dados,op)=>{const r=await fetch('/comando',{method:'POST',body:JSON.stringify({op,dados,conta})});return r.json()},executores:{teste:async(d,c)=>{await c.etapa('arquivo',async()=>({bytes:d.arquivo.size}));return c.worker('salvar','/comando',{nome:d.nome})}},aoErro:e=>window.erro=e});</script></html>'''
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);c=b.new_context(service_workers='block');c.route('**/processos-harness',lambda r:r.fulfill(content_type='text/html',body=HTML));held=[];calls=[];receipts={}
 def comando(r):
  d=json.loads(r.request.post_data);calls.append(d);held.append(r)
 c.route('**/comando',comando);pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'processos-harness');pg.wait_for_function('!!window.fila')
 job=pg.evaluate("async()=>fila.adicionar('teste',{nome:'Pedido simulado',arquivo:new Blob(['original'])},'Pedido simulado','recurso-1')")
 pg.wait_for_function("document.querySelector('#esteira-processos-abrir').textContent.includes('1')")
 pg.fill('#livre','Funcionário continua trabalhando');pg.wait_for_timeout(150);assert held and len(calls)==1
 assert pg.evaluate("async()=>{const d=await new Promise(ok=>{const r=indexedDB.open('tenkiter_esteira_processos_v1');r.onsuccess=()=>ok(r.result)});return new Promise(ok=>{const r=d.transaction('processos').objectStore('processos').getAll();r.onsuccess=()=>ok(r.result[0].dados.arquivo.size===8&&r.result[0].passos.arquivo.bytes===8)})}")
 # Another tab shares the queue but cannot run it concurrently.
 pg2=c.new_page();pg2.goto(BASE+'processos-harness');pg2.wait_for_function('!!window.fila');pg2.evaluate('fila.processar()');pg2.wait_for_timeout(200);assert len(calls)==1
 held.pop(0).fulfill(json={'ok':True,'id':19});pg.wait_for_function("document.querySelector('#esteira-processos-abrir').textContent==='Processos'")
 assert pg.locator('#livre').input_value()=='Funcionário continua trabalhando'
 # Save a second command and lose its response, then resume from the same operation ID.
 job2=pg.evaluate("async()=>fila.adicionar('teste',{nome:'Outro pedido',arquivo:new Blob(['foto'])},'Outro pedido')");pg.wait_for_timeout(150);assert len(calls)==2;op=calls[-1]['op'];held.pop(0).abort();pg.wait_for_timeout(150)
 pg.reload();pg.wait_for_function('!!window.fila');pg.click('#esteira-processos-abrir');pg.wait_for_selector('text=Tentar novamente');pg.get_by_role('button',name='Tentar novamente').click();pg.wait_for_timeout(150);assert calls[-1]['op']==op and len(calls)==3
 held.pop(0).fulfill(json={'ok':True,'id':20});pg.wait_for_function("document.querySelector('#esteira-processos-abrir').textContent==='Processos'")
 # Identity and credential boundaries.
 pg.evaluate("conta='conta-b';dispatchEvent(new Event('tk:sessao'))");pg.wait_for_timeout(100);assert 'Pedido simulado' not in pg.inner_text('#esteira-processos')
 assert pg.evaluate("async()=>{try{await fila.adicionar('teste',{sessao:'proibida'},'Inválido');return false}catch(e){return e.message.includes('credenciais')}}")
 assert not errors,errors;c.close();b.close()
print('PASS processos: durable before release; original Blob and checkpoint; two tabs; stable retry after reload; account isolation; no credentials.')
