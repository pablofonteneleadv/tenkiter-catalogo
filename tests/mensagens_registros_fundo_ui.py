"""Uploads lentos, falha parcial e recarga: Worker/SQLite locais, sem mensagens reais."""
import os, sys, json, io, uuid, urllib.request, urllib.error
from pathlib import Path
from urllib.parse import urlsplit
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION, PERMS_ALL
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
OUT=Path(os.environ.get('TK_EVID',str(Path(__file__).parent/'saida/registros-fundo')));OUT.mkdir(parents=True,exist_ok=True)
def foto(i):
    # O servidor ignora a mesma imagem repetida no pedido; cada foto do teste precisa de conteúdo próprio.
    b=io.BytesIO();Image.new('RGB',(180,240),(30+i*11%200,102,120)).save(b,format='PNG');return b.getvalue()
def api(path,body=None,headers=None,method=None):
    try:
        with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:'+os.environ.get('TK_QA_PORT','8774')+path,data=body,headers=headers or {},method=method)) as r:return r.status,r.read(),r.headers.get('Content-Type','application/json')
    except urllib.error.HTTPError as e:return e.code,e.read(),e.headers.get('Content-Type','application/json')
def forward(route):
    req=route.request;u=urlsplit(req.url);code,body,mime=api(u.path+'?'+u.query,req.post_data_buffer,req.headers,req.method);route.fulfill(status=code,body=body,content_type=mime)
with sync_playwright() as p:
    browser=p.chromium.launch(args=['--no-sandbox'])
    for width,height in [(390,844),(412,915),(1440,900),(320,700)]:
        api('/qa/reset');ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<500,service_workers='block');ctx.add_init_script(SESSION);st=install(ctx,perms=PERMS_ALL)
        retenidos=[];chamadas=[];reter=True
        def novos(route):
            req=route.request;path=urlsplit(req.url).path
            if path=='/msg/solicitacoes/foto' and req.method=='POST':
                chamadas.append(req.url)
                if reter:retenidos.append(route);return
            if path.startswith(('/msg/solicitacoes','/msg/cliente-foto')):return forward(route)
            route.fallback()
        ctx.route('**/*',novos);pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(e.stack))
        def abrir():
            pg.goto(BASE+'admin.html');pg.locator('#details-ferramentas > summary').click();pg.locator('#btn-abrir-mensagens').click();pg.locator('.ms-conv').first.wait_for()
        def esperar_retenido():
            for _ in range(100):
                if retenidos:return retenidos.pop(0)
                pg.wait_for_timeout(50)
            raise AssertionError('Upload esperado não começou')
        abrir();pg.locator('#ms-lista .ms-conv[data-id="1"]').click();pg.get_by_role('button',name='Pedido do cliente',exact=True).click();pg.get_by_label('Descrição geral do pedido',exact=True).fill('Três referências, tamanho XXG, preservar as confirmadas.')
        pg.set_input_files('#ms-registro-fotos',[{'name':f'foto-{i}.png','mimeType':'image/png','buffer':foto(i)} for i in range(3)])
        pg.get_by_role('button',name='Registrar pedido',exact=True).click();pg.locator('#ms-gaveta').wait_for(state='detached');primeira=esperar_retenido()
        assert pg.locator('#ms-texto').is_enabled()
        pg.locator('#ms-texto').fill('Rascunho do atendimento enquanto as fotos são guardadas')
        pg.get_by_role('button',name='Acompanhar registros de clientes',exact=True).wait_for()
        caixas=pg.evaluate("()=>{const b=document.querySelector('#ms-registro-flutuante').getBoundingClientRect(),t=document.querySelector('#ms-assina').getBoundingClientRect();return {b:b.bottom,t:t.top}}")
        assert caixas['b']<=caixas['t'],caixas
        pg.screenshot(path=str(OUT/f'guardando-sem-bloquear-{width}.png'))
        print('ETAPA',width,'primeiro upload retido e conversa livre',flush=True)
        # Trocar de cliente enquanto o primeiro upload está retido não muda o destino do pedido.
        if width<700:pg.get_by_role('button',name='Voltar para as conversas',exact=True).click()
        pg.locator('#ms-lista .ms-conv[data-id="4"]').click();pg.locator('#ms-texto').fill('Outro atendimento continua livre')
        forward(primeira);segunda=esperar_retenido();segunda.fulfill(status=503,json={'ok':False,'erro':'Falha simulada de rede.'})
        pg.get_by_role('button',name='Acompanhar registros de clientes',exact=True).click();pg.get_by_role('button',name='Tentar de novo',exact=True).wait_for();assert 'preservadas' in pg.inner_text('#ms-gaveta')
        assert json.loads(api('/qa/estado')[1])['solicitacoes'][0]['conversa_id']==1
        pg.get_by_role('button',name='Tentar de novo',exact=True).click();segunda_tentativa=esperar_retenido();assert chamadas[1]==chamadas[2]
        print('ETAPA',width,'erro parcial e retry com mesmo ID',flush=True)
        # Queda da página: a fila já está no IndexedDB. Abortar e recarregar com os mesmos IDs.
        reter=False;abrir()
        pg.get_by_role('button',name='Acompanhar registros de clientes',exact=True).click()
        pg.get_by_text('Pedido registrado. Nenhuma mensagem foi enviada.',exact=True).wait_for()
        estado=json.loads(api('/qa/estado')[1]);assert len(estado['solicitacoes'])==1
        assert chamadas.count(chamadas[0])==1,'Foto já confirmada foi enviada novamente'
        pg.get_by_role('button',name='Ver pedidos deste cliente',exact=True).click();pg.locator('.ms-solicitacao-mini').nth(2).wait_for();assert pg.locator('.ms-solicitacao-mini').count()==3
        assert not st['ig']['msg']['envios'] and not errors,errors
        # Três miniaturas na mesma linha, proporção 4:5, alvos de 44 px e sem rolagem lateral.
        pg.wait_for_function("[...document.querySelectorAll('.ms-solicitacao-mini img')].length===3 && [...document.querySelectorAll('.ms-solicitacao-mini img')].every(e=>e.complete&&e.naturalWidth>0)")
        caixas=pg.locator('.ms-solicitacao-mini').evaluate_all('l=>l.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,w:r.width,h:r.height}})')
        assert max(c['y'] for c in caixas)-min(c['y'] for c in caixas)<2 and all(c['w']>=44 and c['h']>=44 and abs(c['w']/c['h']-0.8)<0.03 for c in caixas),caixas
        assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
        pg.screenshot(path=str(OUT/f'retomado-tres-fotos-{width}.png'))
        pg.locator('.ms-solicitacao-mini').first.click();pg.locator('.ms-solicitacao-ampliada img').wait_for(state='visible');pg.wait_for_function("document.querySelector('.ms-solicitacao-ampliada img').naturalWidth>0")
        assert '1 de 3' in pg.inner_text('.ms-solicitacao-ampliada');pg.get_by_role('button',name='Voltar às solicitações',exact=True).click();pg.locator('.ms-solicitacao-mini').first.wait_for()
        if width==412:
            headers={'X-TK-Whats':'5588999999999','X-TK-Sessao':'tk3.teste','Content-Type':'image/png'}
            for i in range(17):
                code,_,_=api('/msg/solicitacoes/foto?solicitacao='+estado['solicitacoes'][0]['id']+'&foto='+str(uuid.uuid4()),foto(i+10),headers,'POST')
                assert code==200,code
            pg.get_by_role('button',name='Fechar Solicitações de clientes',exact=True).click()
            pg.get_by_role('tab',name='Solicitações de clientes',exact=True).click()
            pg.locator('.ms-solicitacao-mini').nth(2).wait_for()
            assert pg.locator('.ms-solicitacao-mini').count()==3
            assert pg.locator('.ms-solicitacao-mini').nth(2).get_attribute('data-mais')=='+17'
            pg.locator('.ms-solicitacao-mini').nth(2).click()
            for _ in range(17):pg.get_by_role('button',name='Próxima →',exact=True).click()
            assert '20 de 20' in pg.inner_text('.ms-solicitacao-ampliada')
            assert pg.get_by_role('button',name='Próxima →',exact=True).is_disabled()
            pg.get_by_role('button',name='Voltar às solicitações',exact=True).click()
            pg.screenshot(path=str(OUT/'vinte-fotos-lista-compacta-412.png'))

        for rota in retenidos:
            try:rota.abort()
            except Exception:pass
        ctx.close();print('PASS',width,'upload lento livre; cliente original; falha parcial; recarga sem duplicar')
    browser.close()
print('FALHAS=0')
