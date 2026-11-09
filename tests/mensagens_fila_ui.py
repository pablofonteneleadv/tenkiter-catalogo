"""Fila de envio do Mensageiro: várias mensagens em sequência, outra conversa durante o envio, falha no meio,
recarga com fila pendente e resposta perdida, sem nunca duplicar para o cliente. Serviços simulados (nada sai para a rede).
Chromium; não é Android real."""
import os, sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION, PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TK_BASE', 'http://localhost:8773/')
FALHAS = []
def chk(nome, cond, det=''):
    if cond: print('  ✔', nome)
    else: FALHAS.append(nome); print('  ✘', nome, '—', str(det)[:300])

# Servidor simulado LENTO e controlável pela página: atraso, falha por texto, resposta perdida e retenção.
ENVIO = """(()=>{const f=window.fetch;window.__cfg={atraso:0,falhar:[],perder:[],reter:false};window.__voo={};window.__max={};window.__simult=0;
window.fetch=function(u,i){if(/\\/msg\\/enviar/.test(String(u))&&i&&i.method==='POST'){const b=JSON.parse(i.body),c=window.__cfg,k=b.conversa,self=this,args=arguments;
 if(c.reter)return new Promise(()=>{});
 window.__voo[k]=(window.__voo[k]||0)+1;window.__max[k]=Math.max(window.__max[k]||0,window.__voo[k]);window.__simult=Math.max(window.__simult,Object.values(window.__voo).reduce((a,x)=>a+x,0));
 const fim=()=>{window.__voo[k]--};
 if(c.falhar.some(x=>b.texto.endsWith(x)))return new Promise(ok=>setTimeout(()=>{fim();ok(new Response(JSON.stringify({ok:false,erro:'A Wafly recusou a mensagem (HTTP 400). Confira se o WhatsApp 1 está conectado.'}),{status:409,headers:{'Content-Type':'application/json'}}))},300));
 return new Promise((ok,no)=>setTimeout(()=>{f.apply(self,args).then(r=>{fim();if(c.perder.some(x=>b.texto.endsWith(x))){c.perder=c.perder.filter(x=>!b.texto.endsWith(x));no(new TypeError('Failed to fetch'));return}ok(r)},e=>{fim();no(e)})},c.atraso))}
 return f.apply(this,arguments)}})()"""

import re
def saidas(s, conv=None):
    return [re.sub(r'^\*[^*]+:\*\n', '', m['texto']) for m in s['msgs'] if m['direcao'] == 'saida' and (conv is None or m['conversa_id'] == conv)]

def tiques(pg):
    return pg.evaluate("[...document.querySelectorAll('#ms-fio .ms-bolha.saida')].map(b=>[(b.querySelector('.ms-bolha-tx,.ms-tx')||b).textContent.slice(0,40),b.querySelector('.ms-tique')?.getAttribute('aria-label')||''])")

def enviar(pg, texto):
    pg.fill('#ms-texto', texto); pg.click('#ms-enviar')

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for w, h in [(390, 844), (1440, 900)]:
        print('== largura', w)
        ctx = b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); ctx.add_init_script(SESSION)
        st = install(ctx, perms=PERMS_ALL); s = mock_msg.novo_estado(); st['ig']['msg'] = s
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        def abrir(conv=None):
            pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(1200); pg.evaluate(ENVIO)
            pg.evaluate("document.getElementById('btn-abrir-mensagens').click()"); pg.wait_for_selector('#ms-lista .ms-conv')
            pg.locator('#ms-lista .ms-conv' + (f'[data-id="{conv}"]' if conv else '')).first.click(); pg.wait_for_selector('#ms-texto')
        abrir(1); cid = int(pg.evaluate("document.querySelector('#ms-lista .ms-conv[aria-current=true]')?.dataset.id||1"))
        # ---- A) três mensagens em sequência com servidor lento: bolhas na hora, ordem preservada, uma por vez na conversa
        pg.evaluate("window.__cfg.atraso=1200")
        t0 = pg.evaluate("performance.now()")
        for t in ['um', 'dois', 'tres']: enviar(pg, t)
        gasto = pg.evaluate(f"Math.round(performance.now()-{t0})")
        chk(f'três bolhas na tela em {gasto} ms, sem esperar o servidor', gasto < 900 and len(tiques(pg)) >= 3, (gasto, tiques(pg)))
        rot = [x[1] for x in tiques(pg)][-3:]
        chk('primeira enviando e as outras na fila (⏳)', rot[0] == 'Enviando' and rot[1:] == ['Na fila', 'Na fila'], rot)
        chk('o botão volta a aceitar texto enquanto a fila anda', pg.locator('#ms-texto').is_enabled() and 'Enviando' not in pg.inner_text('#ms-enviar'))
        pg.wait_for_function("window.__voo&&Object.values(window.__voo).every(x=>x===0)&&document.querySelectorAll('#ms-fio .ms-bolha.saida .ms-tique[aria-label=Enviada]').length>=3", timeout=15000)
        ordem = saidas(s, cid)[-3:]
        chk('ordem de escrita preservada no servidor', ordem == ['um', 'dois', 'tres'], ordem)
        chk('na mesma conversa nunca houve dois envios ao mesmo tempo', pg.evaluate(f"window.__max['{cid}']") == 1, pg.evaluate("window.__max"))
        chk('todas confirmadas (✓)', [x[1] for x in tiques(pg)][-3:] == ['Enviada'] * 3, tiques(pg))
        # ---- B) falha no meio: as seguintes DA MESMA conversa esperam; "Tentar de novo" libera em ordem, sem duplicar
        pg.evaluate("window.__cfg.atraso=100;window.__cfg.falhar=['b2']")
        antes = len(saidas(s))
        for t in ['b1', 'b2', 'b3']: enviar(pg, t)
        pg.wait_for_selector('#ms-fio .ms-bolha.falhou', timeout=8000); pg.wait_for_timeout(400)
        chk('só a primeira saiu; a segunda falhou e a terceira aguarda', saidas(s)[antes:] == ['b1'], saidas(s)[antes:])
        r = [x[1] for x in tiques(pg)][-3:]
        chk('rótulos: Enviada / Não enviada / Aguardando a anterior', r == ['Enviada', 'Não enviada', 'Aguardando a anterior'], r)
        chk('botão Tentar de novo por mensagem', pg.locator('#ms-fio .ms-bolha.falhou [data-ms=reenviar]').count() == 1)
        chk('texto explica o que acontece com a seguinte', 'Aguardando a mensagem anterior' in pg.inner_text('#ms-fio'))
        pg.evaluate("window.__cfg.falhar=[]"); pg.click('#ms-fio .ms-bolha.falhou [data-ms=reenviar]')
        pg.wait_for_function("document.querySelectorAll('#ms-fio .ms-bolha.saida .ms-tique[aria-label=Enviada]').length>=6", timeout=10000)
        chk('depois de tentar de novo saem b2 e b3, na ordem, uma vez cada', saidas(s)[antes:] == ['b1', 'b2', 'b3'], saidas(s)[antes:])
        # ---- C) "Descartar" libera as seguintes
        pg.evaluate("window.__cfg.falhar=['c1']")
        antes = len(saidas(s))
        for t in ['c1', 'c2']: enviar(pg, t)
        pg.wait_for_selector('#ms-fio .ms-bolha.falhou', timeout=8000); pg.wait_for_timeout(300)
        pg.click('#ms-fio .ms-bolha.falhou [data-ms=descartar]')
        pg.wait_for_function("document.querySelectorAll('#ms-fio .ms-bolha.saida .ms-tique[aria-label=Enviada]').length>=7", timeout=10000)
        chk('descartar a que falhou libera a seguinte (c1 nunca vai ao cliente)', saidas(s)[antes:] == ['c2'], saidas(s)[antes:])
        pg.evaluate("window.__cfg.falhar=[]")
        # ---- D) resposta perdida (o servidor recebeu, a resposta não voltou): tenta sozinho com a mesma chave, sem duplicar
        pg.evaluate("window.__cfg.perder=['perdida']"); antes = len(saidas(s))
        enviar(pg, 'perdida')
        pg.wait_for_function("document.querySelectorAll('#ms-fio .ms-bolha.saida .ms-tique[aria-label=Enviada]').length>=8", timeout=15000)
        chk('resposta perdida: reenvio automático não duplica', saidas(s)[antes:] == ['perdida'], saidas(s)[antes:])
        # ---- D2) foto e texto em seguida: o arquivo entra na MESMA ordem (foto primeiro), um de cada vez
        PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc000000301010018dd8db00000000049454e44ae426082")
        pg.evaluate("window.__cfg.atraso=900"); n_antes = len([m for m in s['msgs'] if m['direcao'] == 'saida'])
        pg.set_input_files('#ms-arquivo', {'name': 'foto.png', 'mimeType': 'image/png', 'buffer': PNG})
        pg.wait_for_function("document.querySelector('#ms-enviar')&&!document.querySelector('#ms-enviar').disabled", timeout=8000)
        pg.click('#ms-enviar'); enviar(pg, 'depois da foto')
        pg.wait_for_function("[...document.querySelectorAll('#ms-fio .ms-bolha.saida')].some(b=>b.textContent.includes('depois da foto')&&b.querySelector('.ms-tique[aria-label=Enviada]'))", timeout=20000); pg.wait_for_timeout(500)
        novos = [(m['tipo'], re.sub(r'^\*[^*]+:\*\n', '', m['texto'])) for m in s['msgs'] if m['direcao'] == 'saida'][n_antes:]
        chk('foto sai primeiro e o texto depois, uma vez cada', [t for t, _ in novos] == ['imagem', 'texto'] and novos[1][1] == 'depois da foto', novos)
        chk('upload da foto feito uma única vez', len(s['anexos']) == 1, s['anexos'])
        # ---- E) recarga com a fila pendente: o texto estava guardado, volta e sai uma única vez
        pg.evaluate("window.__cfg.reter=true"); antes = len(saidas(s))
        enviar(pg, 'sobrevive')
        pg.wait_for_timeout(500)
        guardado = pg.evaluate("new Promise(ok=>{const r=indexedDB.open('tk_mensagens_fila_v1');r.onsuccess=()=>{const q=r.result.transaction('itens').objectStore('itens').getAll();q.onsuccess=()=>ok(JSON.stringify(q.result))}})")
        chk('o texto digitado está guardado no aparelho antes de sair', 'sobrevive' in guardado)
        chk('nenhuma credencial na fila guardada', 'tk2.' not in guardado and 'sessao' not in guardado.lower(), guardado[:200])
        chk('nada saiu ainda (servidor "preso")', saidas(s)[antes:] == [])
        pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(2500)
        chk('depois de recarregar, a mensagem guardada saiu sozinha, uma vez', saidas(s)[antes:] == ['sobrevive'], saidas(s)[antes:])
        pg.evaluate(ENVIO); pg.evaluate("document.getElementById('btn-abrir-mensagens').click()"); pg.wait_for_selector('#ms-lista .ms-conv')
        pg.wait_for_timeout(1200)
        vazio = pg.evaluate("new Promise(ok=>{const r=indexedDB.open('tk_mensagens_fila_v1');r.onsuccess=()=>{const q=r.result.transaction('itens').objectStore('itens').getAll();q.onsuccess=()=>ok(q.result.length)}})")
        chk('fila guardada esvaziada depois de confirmada', vazio == 0, vazio)
        # ---- F) mensagem guardada há mais de 30 min NÃO sai sozinha
        antigo = {'id': 'lvelha0000000000aa', 'dono': pg.evaluate("(getSessao().whatsapp||'').replace(/\\D/g,'')"), 'conversa': cid, 'seq': 1, 'criado': 1, 'estado': 'fila', 'erro': '', 'dados': {'texto': 'velha demais'}}
        pg.evaluate("(x)=>new Promise(ok=>{const r=indexedDB.open('tk_mensagens_fila_v1');r.onsuccess=()=>{const t=r.result.transaction('itens','readwrite');t.objectStore('itens').put(x);t.oncomplete=ok}})", antigo)
        antes = len(saidas(s)); pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(2000)
        chk('mensagem guardada há mais de 30 min não sai sozinha', 'velha demais' not in saidas(s))
        if w == 1440:
            # ---- G) outra conversa DURANTE o envio: as duas saem ao mesmo tempo; falha numa não trava a outra
            s['msgs'][:] = [m for m in s['msgs'] if m['texto'] != 'velha demais']
            pg.evaluate(ENVIO); pg.evaluate("document.getElementById('btn-abrir-mensagens').click()"); pg.wait_for_selector('#ms-lista .ms-conv')
            ids = pg.locator('#ms-lista .ms-conv').evaluate_all("xs=>xs.map(x=>x.dataset.id)")
            a_, b_ = ids[0], ids[1]
            pg.evaluate("window.__cfg.atraso=1500;window.__simult=0")
            pg.locator(f'#ms-lista .ms-conv[data-id="{a_}"]').click(); pg.wait_for_selector('#ms-texto'); enviar(pg, 'g-a')
            pg.locator(f'#ms-lista .ms-conv[data-id="{b_}"]').click(); pg.wait_for_selector('#ms-texto'); enviar(pg, 'g-b')
            pg.wait_for_timeout(300)
            chk('trocar de conversa com envio em andamento: a bolha de b já está na tela', 'g-b' in pg.inner_text('#ms-fio'))
            pg.wait_for_timeout(3200)
            chk('as duas conversas enviaram ao mesmo tempo', pg.evaluate("window.__simult") >= 2, pg.evaluate("window.__simult"))
            chk('as duas mensagens chegaram, cada uma na sua conversa', 'g-a' in saidas(s, int(a_)) and 'g-b' in saidas(s, int(b_)))
            pg.evaluate("window.__cfg.atraso=100;window.__cfg.falhar=['g-erro']")
            pg.locator(f'#ms-lista .ms-conv[data-id="{a_}"]').click(); pg.wait_for_selector('#ms-texto'); enviar(pg, 'g-erro')
            pg.locator(f'#ms-lista .ms-conv[data-id="{b_}"]').click(); pg.wait_for_selector('#ms-texto'); enviar(pg, 'g-outra'); enviar(pg, 'g-outra2')
            pg.wait_for_timeout(2500)
            chk('a outra conversa enviou normalmente enquanto a primeira falhou', saidas(s, int(b_))[-2:] == ['g-outra', 'g-outra2'], saidas(s, int(b_)))
            chk('a mensagem que falhou não foi para o cliente', 'g-erro' not in saidas(s))
            chk('aviso de falha na conversa que não está aberta', 'não foi enviada' in pg.inner_text('#ms-aviso'), pg.inner_text('#ms-aviso'))
        chk('sem rolagem lateral', pg.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        chk('sem erros de JavaScript', not erros, erros)
        ctx.close()
    b.close()
print(f'FALHAS={len(FALHAS)}', FALHAS)
sys.exit(1 if FALHAS else 0)
