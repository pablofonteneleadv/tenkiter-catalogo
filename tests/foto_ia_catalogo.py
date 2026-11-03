"""Fotos IA: lote por foto, referências/looks, incorporação parcial/idempotente, produto misto e vitrine. Serviços simulados."""
import os, sys, json, io
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION, PERMS_ALL
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
BASE = os.environ.get('TK_BASE', 'http://localhost:8773/')
OUT = Path('tests/saida/fotoia-catalogo'); OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])
    for width, height in [(390,844),(412,915),(1440,900),(320,700)]:
        ctx = browser.new_context(viewport={'width': width,'height': height},has_touch=True,service_workers='block')
        ctx.add_init_script(SESSION)
        st = install(ctx,versao='4.28',perms=PERMS_ALL); st['ids_unicos'] = True
        ps = st['produtos']; a,b = ps[2],ps[3]
        a['Nome']='Blusa infantil floral 6 anos'; a['Categoria']='Blusa'; a['Genero']='Infantil Menina'; a['Tamanhos']='6 anos'
        b['Nome']='Short infantil liso 6 anos'; b['Categoria']='Short'; b['Genero']='Infantil Menina'; b['Tamanhos']='6 anos'
        a['Fotos_Galeria']='https://res.cloudinary.com/z/image/upload/v1/galeria.jpg'; a['Video_URL']='https://res.cloudinary.com/z/video/upload/v1/video.mp4'
        fotos_originais = [a['Foto_URL'], a['Fotos_Galeria']]; valor_original=a['Preco']
        copies=[]; links=[]; falhar=[True]
        def incorporar(route):
            copies.append(json.loads(route.request.post_data)); route.fulfill(json={'ok':True,'url':'https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202611/'+'a'*20+'.jpg'})
        def vincular(route):
            if route.request.method=='GET': return route.fulfill(json={'ok':True,'produto':links[0]['produto'] if links else ''})
            body=json.loads(route.request.post_data)
            if falhar[0]: falhar[0]=False; return route.fulfill(status=503,json={'ok':False,'erro':'Falha simulada no vínculo.'})
            links[:] = [{'produto':body['produto'],'membros':[a['ID'],b['ID']]}]; route.fulfill(json={'ok':True})
        ctx.route('**/fotoia/incorporar',incorporar); ctx.route('**/fotoia/composicao*',vincular)
        ctx.route('**/catalogo/composicoes',lambda r:r.fulfill(json={'ok':True,'composicoes':links}))
        fixture=Image.new('RGB',(400,600),'#e9e5dc'); desenho=ImageDraw.Draw(fixture); desenho.polygon([(110,120),(155,100),(245,100),(290,120),(330,220),(275,245),(255,200),(260,375),(140,375),(145,200),(125,245),(70,220)],fill='#3f665a'); desenho.rectangle((145,385,195,550),fill='#343d45'); desenho.rectangle((205,385,255,550),fill='#343d45'); desenho.text((95,570),'FOTO SIMULADA - SEM IA',fill='#202020'); arq=io.BytesIO();fixture.save(arq,format='JPEG'); foto_bytes=arq.getvalue()
        def imagem(route): route.fulfill(body=foto_bytes,content_type='image/jpeg',headers={'Access-Control-Allow-Origin':'*'})
        for host in ['res.cloudinary.com','lh3.googleusercontent.com','tenkiter-midia.distkrpconfeccoes.workers.dev']:ctx.route('https://'+host+'/**',imagem)
        pg=ctx.new_page(); errors=[]; pg.on('pageerror',lambda e:errors.append(str(e)))
        pg.goto(BASE+'admin.html'); pg.wait_for_function('typeof produtos!=="undefined" && produtos.length>0')
        pg.evaluate('tkFotoIA.abrir()'); pg.wait_for_selector('#fia-busca')
        # One selected output photo, two garments = one model, without reference splitting.
        for q in [a,b]:
            pg.fill('#fia-busca',q['Codigo']); pg.click('.fia-peca'); pg.locator('.fia-grupo').filter(has=pg.locator('h4',has_text=q['Nome'])).locator('.fia-foto button').first.click()
        pg.fill('#fia-modelos-foto','2'); pg.locator('#fia-modelos-foto').dispatch_event('change'); pg.click('[data-a=planejar]')
        assert 'exatamente 2' in pg.locator('#fia-aba').inner_text()
        pg.fill('#fia-modelos-foto','1'); pg.locator('#fia-modelos-foto').dispatch_event('change'); pg.select_option('#fia-motor','klein9b'); pg.click('[data-a=planejar]')
        assert pg.locator('[data-a=editar-foto]').count()==1
        pg.locator('[data-a=editar-foto]').click(); assert pg.locator('.fia-selitem').count()==2
        pg.click('[data-a=planejar]')
        # Second independent photo, full look. Pairing must not leak to this photo.
        pg.fill('#fia-busca','TK-0005'); pg.click('.fia-peca'); pg.locator('.fia-foto button').first.click()
        pg.locator('.fia-selitem [data-v=look]').click(); pg.select_option('#fia-motor','fluxdev'); pg.click('[data-a=planejar]')
        assert pg.locator('[data-a=editar-foto]').count()==2
        pg.evaluate("document.getElementById('fia-corpo').scrollTop=0")
        pg.screenshot(path=str(OUT/f'lote-{width}.png'))
        pg.click('[data-a=enviar]'); pg.wait_for_selector('[data-a=aba][data-v=fila][aria-selected=true]')
        fi=st['ig']['fotoia']; calls=[c['body'] for c in fi['chamadas'] if c['path']=='/fotoia/fila']
        assert len(calls)==2 and calls[0]['papeis']==['cima','baixo'] and calls[0]['looks']==[[0,1]]
        assert calls[0]['motor']=='klein9b' and calls[1]['motor']=='fluxdev' and calls[1]['looks']==[[0]]
        assert calls[0]['pedidoId']!=calls[1]['pedidoId']
        # Approved result with both registered sources.
        job=fi['itens'][-1]; job['status']='aprovada'; job['resultado']=a['Foto_URL']; job['modelo']='cloudflare:flux-2-klein-9b'
        pg.click('[data-a=aba][data-v=gerar]'); pg.click('[data-a=aba][data-v=fila]')
        card=pg.locator('.fia-cartao').filter(has=pg.locator('.fia-catalogo')); card.locator('summary').filter(has_text='Colocar no produto').click()
        box=card.locator('.fia-catalogo-produto'); box.locator('[data-fia-capa]').first.check()
        box.locator('[data-a=catalogo-salvar]:not([data-misto])').click(); pg.wait_for_function('document.querySelector("[data-fia-retorno]").textContent.includes("Foto adicionada")')
        assert a['Foto_URL'].endswith('a'*20+'.jpg') and all(u in a['Fotos_Galeria'] for u in fotos_originais)
        assert a['Preco']==valor_original and a['Video_URL'].endswith('video.mp4')
        assert b['Foto_URL']!=a['Foto_URL'] and a['Foto_URL'] in b['Fotos_Galeria']
        # Click again never duplicates gallery; sparse update leaves price, names, stock, videos alone.
        box.locator('[data-a=catalogo-salvar]:not([data-misto])').click(); pg.wait_for_function('document.querySelector("[data-fia-retorno]").textContent.includes("Foto adicionada")')
        assert len(a['Fotos_Galeria'].split(','))==2
        assert all(set(u).issubset({'action','id','fotoUrlExistente','fotosGaleriaExistentes','pin','sessao','whatsapp','funcionario'}) for u in st['atualizados'])
        # Fail linking after create, then retry with the same opId: only one actual product.
        box.locator('[data-misto=sim]').click(); pg.wait_for_function('document.querySelector("[data-fia-retorno]").textContent.includes("faltou vincular")')
        box.locator('[data-misto=sim]').click(); pg.wait_for_function('document.querySelector("[data-fia-retorno]").textContent.includes("Produto misto criado")')
        assert len(st['criados'])==1 and len(links)==1
        novo=next(q for q in ps if q['ID']==links[0]['produto']); assert float(novo['Preco'])==0 and novo['Foto_URL']==a['Foto_URL']
        box.scroll_into_view_if_needed(); pg.screenshot(path=str(OUT/f'incorporar-{width}.png'))
        assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        if width == 390:
            for w,h,zoom in [(390,470,1.3),(320,700,1.3)]:
                pg.set_viewport_size({'width':w,'height':h}); pg.evaluate('(v)=>document.documentElement.style.fontSize=(v*100)+"%"',zoom)
                box.locator('[data-misto=sim]').scroll_into_view_if_needed()
                assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
                rect=box.locator('[data-misto=sim]').bounding_box(); assert rect['x']>=0 and rect['x']+rect['width']<=w+1 and rect['height']>=44
            pg.set_viewport_size({'width':width,'height':height});pg.evaluate('document.documentElement.style.fontSize=""')
        if Path('tests/axe.min.js').exists():
            pg.add_script_tag(path='tests/axe.min.js')
            erros_axe=pg.evaluate("async()=> (await axe.run(document.querySelector('.sheet-fia'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))")
            assert not erros_axe,erros_axe
        # Real public product detail journey; right arrow and touch navigate constituent slides.
        pg.goto(BASE+'?c='+novo['Codigo']); pg.wait_for_selector('.composicao-ia-dica')
        pg.locator('#seta-dir').click(); pg.wait_for_selector('.composicao-ia-slide')
        assert a['Nome'] in pg.locator('.composicao-ia-slide').inner_text()
        assert 'à vista' in pg.locator('.composicao-ia-slide').inner_text()
        pg.screenshot(path=str(OUT/f'vitrine-{width}.png'))
        pg.locator('.composicao-ia-slide a').first.click(); pg.wait_for_function('(id)=>location.search.includes(id)',arg=a['Codigo'])
        assert pg.locator('#modal-conteudo').inner_text().find(a['Nome'])>=0
        assert not errors,errors
        if width == 390:
            # Exact owner example: 3 models (2 pairs + full), 2 pairs, 2 full looks, 1 full look.
            arquivos=[]
            for n in range(5):
                arq=OUT/('referencia-%s.jpg'%n); Image.new('RGB',(120,180),(60+n*30,110,130)).save(arq); arquivos.append(str(arq))
            pg.goto(BASE+'admin.html'); pg.wait_for_function('typeof produtos!=="undefined" && produtos.length>0'); pg.evaluate('tkFotoIA.abrir()'); pg.wait_for_selector('#fia-busca')
            for modelos,papeis in [(3,['cima','baixo','cima','baixo','look']),(2,['cima','baixo','cima','baixo']),(2,['look','look']),(1,['look'])]:
                pg.set_input_files('#fia-arq',arquivos[:len(papeis)])
                for i,papel in enumerate(papeis): pg.locator('.fia-selitem').nth(i).locator('[data-a=papel][data-v='+papel+']').click()
                pg.fill('#fia-modelos-foto',str(modelos));pg.locator('#fia-modelos-foto').dispatch_event('change');pg.click('[data-a=planejar]')
            assert pg.locator('[data-a=editar-foto]').count()==4
            pg.evaluate("document.getElementById('fia-corpo').scrollTop=0");pg.screenshot(path=str(OUT/'quatro-fotos-390.png'))
            n_antes=len(fi['itens']); conta=[0]
            def falha_parcial(route):
                conta[0]+=1
                if conta[0]==2:return route.fulfill(status=503,json={'ok':False,'erro':'Falha parcial simulada'})
                route.fallback()
            ctx.route('**/fotoia/fila',falha_parcial)
            pg.click('[data-a=enviar]');pg.wait_for_selector('.fia-erro')
            assert len(fi['itens'])==n_antes+1 and pg.locator('[data-a=editar-foto]').count()==3
            pg.click('[data-a=enviar]');pg.wait_for_selector('[data-a=aba][data-v=fila][aria-selected=true]')
            assert len(fi['itens'])==n_antes+4
            lote=[c['body'] for c in fi['chamadas'] if c['path']=='/fotoia/fila'][-4:]
            assert [len(c['looks']) for c in lote]==[3,2,2,1]
            assert [c['fotos'] for c in lote]==['<5 fotos>','<4 fotos>','<2 fotos>','<1 fotos>']
            assert lote[0]['refs']=='<0 refs>' and len(set(c['pedidoId'] for c in lote))==4
        ctx.close()
    browser.close()
print('FOTOS IA CATÁLOGO PASS: lote por foto, motores, edição, capa/galeria, originais, preço/vídeo, retry misto, vínculos e vitrine; 4 viewports.')
