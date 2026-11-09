"""Velocidade percebida do Mensageiro: com o servidor LENTO (simulado), a lista, a conversa e a troca de aba
aparecem do que está guardado no aparelho antes da rede responder, e o campo de resposta nunca trava.
Serviços simulados (nada sai para a rede). Chromium; não é Android real."""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION, PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TK_BASE', 'http://localhost:8773/')
LENTO_MS = 2500
ATRASO = """(ms)=>{const f=window.fetch;window.fetch=function(u,i){const p=f.apply(this,arguments);
 return /\\/msg\\/(conversas|mensagens|resumo)/.test(String(u))&&(!i||!i.method||i.method==='GET')?p.then(r=>new Promise(k=>setTimeout(()=>k(r),ms))):p}}"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for w, h in [(390, 844), (1440, 900)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, service_workers='block')
        ctx.add_init_script(SESSION)
        st = install(ctx, perms=PERMS_ALL)
        s = mock_msg.novo_estado(); st['ig']['msg'] = s
        pg = ctx.new_page(); erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))

        def abrir_tela():
            pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(1200)
            pg.evaluate("document.getElementById('btn-abrir-mensagens').click()")

        # 1) primeira visita, servidor rápido: aprende a lista e a conversa
        abrir_tela(); pg.wait_for_selector('#ms-lista .ms-conv')
        pg.locator('#ms-lista .ms-conv').first.click(); pg.wait_for_selector('#ms-fio .ms-bolha')
        pg.wait_for_timeout(500)
        guardado = pg.evaluate("indexedDB.databases().then(l=>l.map(x=>x.name))")
        assert 'tk_msg_recentes_web_v1' in guardado, guardado
        # 2) recarrega a página com o servidor LENTO: lista guardada aparece antes da rede
        pg.add_init_script(f"({ATRASO})({LENTO_MS})")
        pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(1200)
        pg.evaluate("window.__t0=performance.now();document.getElementById('btn-abrir-mensagens').click()")
        pg.wait_for_selector('#ms-lista .ms-conv', timeout=LENTO_MS + 8000)
        lista_ms = pg.evaluate("Math.round(performance.now()-window.__t0)")
        assert lista_ms < 900, f'lista guardada demorou {lista_ms} ms (rede simulada: {LENTO_MS} ms)'
        # 3) conversa: aparece do guardado, com o campo liberado para escrever
        pg.evaluate("window.__t1=performance.now()")
        pg.locator('#ms-lista .ms-conv').first.click()
        pg.wait_for_selector('#ms-fio .ms-bolha', timeout=LENTO_MS + 8000)
        conv_ms = pg.evaluate("Math.round(performance.now()-window.__t1)")
        assert conv_ms < 900, f'conversa guardada demorou {conv_ms} ms (rede simulada: {LENTO_MS} ms)'
        assert pg.locator('.ms-compor').get_attribute('inert') is None, 'campo travado enquanto atualiza'
        assert not pg.locator('#ms-texto').is_disabled()
        pg.fill('#ms-texto', 'digitando enquanto atualiza')
        pg.wait_for_timeout(LENTO_MS + 800)   # chega a resposta da rede: não pode apagar o que a pessoa digitou
        assert pg.input_value('#ms-texto') == 'digitando enquanto atualiza', 'a atualização apagou o texto digitado'
        assert pg.locator('#ms-fio .ms-bolha').count() >= 3
        # 4) bolha ao enviar < 100 ms com o servidor de envio lento
        n0 = pg.locator('#ms-fio .ms-bolha').count()
        pg.evaluate("window.__t2=performance.now()")
        pg.click('#ms-enviar')
        pg.wait_for_function(f"document.querySelectorAll('#ms-fio .ms-bolha').length>{n0}", timeout=3000)
        bolha_ms = pg.evaluate("Math.round(performance.now()-window.__t2)")
        assert bolha_ms < 250, f'bolha de envio demorou {bolha_ms} ms'
        # 5) nada de credencial no que fica guardado no aparelho
        dump = pg.evaluate("new Promise(ok=>{const r=indexedDB.open('tk_msg_recentes_web_v1');r.onsuccess=()=>{const q=r.result.transaction('itens').objectStore('itens').getAll();q.onsuccess=()=>ok(JSON.stringify(q.result))}})")
        assert 'tk2.' not in dump and 'sessao' not in dump.lower(), 'credencial no cache local'
        pg.wait_for_timeout(800)
        assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not erros, erros
        print(f'OK velocidade {w}: lista {lista_ms} ms, conversa {conv_ms} ms, bolha {bolha_ms} ms (rede simulada {LENTO_MS} ms)', flush=True)
        ctx.close()
    b.close()
