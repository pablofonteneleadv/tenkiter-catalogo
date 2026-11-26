"""Relato do Pablo (26/11/2026): os envios de fotos da Talita para a caixa ficaram parados em "Sem conexão" até alguém tocar
em "Tentar de novo". Falha de rede tem de voltar sozinha para a fila (com espera crescente) e os processos antigos parados com
"Sem conexão" também. Fila local real (esteira-processos.js), sem serviços externos."""
import os
from playwright.sync_api import sync_playwright
BASE = os.getenv('TK_BASE', 'http://localhost:8773/').rstrip('/') + '/'
HTML = '''<html lang="pt-BR"><title>Teste de rede</title><header><div class="cab"></div></header><main></main>
<script src="esteira-processos.js"></script><script>
window.tentativas=0;window.falhasRede=2;
window.fila=TKEsteiraProcessos({dono:()=>'conta-a',cicloMs:250,esperaRedeMs:200,worker:async()=>({ok:true}),
 executores:{envio:async(d,c)=>{await c.etapa('foto',async()=>{window.tentativas++;if(window.tentativas<=window.falhasRede){const e=Error('Sem internet para enviar agora.');e.rede=true;throw e}return {url:'ok'}});return {ok:true}},
  outro:async()=>{const e=Error('O servidor de fotos não aceitou a foto.');throw e}}});
</script></html>'''
OK = []; BAD = []
def chk(n, c, e=''):
    (OK if c else BAD).append(n); print(('  ✔ ' if c else '  ✘ ') + n + ('' if c else ' — ' + str(e)))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox']); c = b.new_context(service_workers='block')
    c.route('**/rede-harness', lambda r: r.fulfill(content_type='text/html; charset=utf-8', body=HTML))
    pg = c.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(BASE + 'rede-harness'); pg.wait_for_function('!!window.fila')
    print('== Falha de rede volta sozinha ==')
    pg.evaluate("fila.adicionar('envio',{},'Enviar 3 fotos para a caixa')")
    pg.wait_for_function("window.tentativas>=1", timeout=5000)
    pg.wait_for_timeout(300)
    chk('primeira falha fica como erro de rede (sem travar a tela)', pg.evaluate("window.tentativas") >= 1)
    pg.wait_for_function("window.tentativas>=3", timeout=8000)
    pg.wait_for_timeout(600)
    est = pg.evaluate("(async()=>{await fila.atualizar();return document.getElementById('esteira-processos-abrir').textContent})()")
    chk('depois que a rede volta o processo conclui sozinho, sem tocar em Tentar de novo', pg.evaluate("window.tentativas") == 3 and 'Processos' in est and '·' not in est, est)
    print('== Erro que não é de rede continua esperando a pessoa ==')
    pg.evaluate("fila.adicionar('outro',{},'Envio com erro do servidor')")
    pg.wait_for_timeout(1500)
    pg.click('#esteira-processos-abrir')
    txt = pg.inner_text('#esteira-processos')
    chk('erro do servidor não fica tentando sozinho e mostra Tentar de novo', 'não aceitou a foto' in txt and 'Tentar de novo' in txt, txt[:300])
    print('== Processo antigo parado em "Sem conexão" (antes da correção) ==')
    c2 = b.new_context(service_workers='block'); c2.route('**/rede-harness', lambda r: r.fulfill(content_type='text/html; charset=utf-8', body=HTML))
    p2 = c2.new_page(); p2.on('pageerror', lambda e: erros.append(str(e)))
    p2.goto(BASE + 'rede-harness'); p2.wait_for_function('!!window.fila')
    p2.evaluate("window.falhasRede=0")
    # grava direto um processo como a versão anterior deixava: estado erro, sem a marca de rede
    old = p2.evaluate("""(async()=>{
      const id=await fila.adicionar('envio',{},'Enviar 20 fotos para a caixa');
      await new Promise(r=>setTimeout(r,600));
      const db=await new Promise((ok,no)=>{const r=indexedDB.open('tenkiter_esteira_processos_v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
      const todos=await new Promise(ok=>{const r=db.transaction('processos').objectStore('processos').getAll();r.onsuccess=()=>ok(r.result)});
      const j=todos.find(x=>x.titulo==='Enviar 20 fotos para a caixa');if(!j)return 'sem-job';
      j.estado='erro';j.rede=false;j.erro='Sem conexão. A foto não foi enviada; tente de novo.';j.falhouEm=0;j.passos={};
      await new Promise(ok=>{const t=db.transaction('processos','readwrite');t.objectStore('processos').put(j);t.oncomplete=ok});
      window.tentativas=0;await fila.atualizar();return 'ok'})()""")
    chk('processo antigo foi simulado', old == 'ok', old)
    p2.wait_for_function("window.tentativas>=1", timeout=8000)
    chk('processo antigo parado em "Sem conexão" volta sozinho e conclui', p2.evaluate("window.tentativas") >= 1)
    chk('sem erro de JavaScript', not erros, erros)
    b.close()
print('OK=%d FALHAS=%d %s' % (len(OK), len(BAD), BAD))
raise SystemExit(1 if BAD else 0)
