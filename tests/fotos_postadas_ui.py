"""v7.49.0 — Fotos postadas e fotos novas (vitrine + Postagens). Apps Script e Worker SIMULADOS (mock.py); nada real é chamado.
Vitrine: peça com foto nova vai para o topo em "mais recentes"; ordenar por nome respeita a escolha; Worker com erro ou lento = como antes.
Postador: fotos já postadas vêm desmarcadas com "Postada hoje"/"Postada há N dias"; marcar mesmo assim funciona (modelo e colagem
levam as fotos originais em fotosOrigem); todas postadas = aviso claro; sinal discreto na lista de peças; postagem antiga casa por posição."""
import os, sys, time, datetime
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION, PERMS_ALL
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TK_BASE', 'http://localhost:8765/')
EVID = Path(os.environ.get('TK_EVID', str(Path(__file__).parent / 'saida' / 'fotos-postadas')))   # evidência do PR: TK_EVID=docs/ux/fotos-postadas-20261102; EVID.mkdir(parents=True, exist_ok=True)
AXE = (Path(__file__).parent / 'axe.min.js').read_text() if (Path(__file__).parent / 'axe.min.js').exists() else ''
ok, falhas = 0, []
def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1; print('  ✔ ' + nome)
    else: falhas.append(nome); print('  ✘ ' + nome + ('' if det is None else ' — ' + str(det)[:500]))
def foto(pg, nome):
    pg.screenshot(path=str(EVID / nome), type='jpeg', quality=82, full_page=False)
def iso(dias):
    return (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=dias)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
def sem_rolagem_horizontal(pg):
    return pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
def ids_na_grade(pg):
    return pg.eval_on_selector_all('#grid .card[data-id]', 'cs => cs.map(c => c.dataset.id)')
def axe(pg, sel, rotulo):
    if not AXE: return
    pg.evaluate(AXE)
    r = pg.evaluate("async(s)=>{const r=await axe.run(document.querySelector(s),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>v.id+'×'+v.nodes.length+' '+v.nodes.slice(0,2).map(n=>n.html.slice(0,90)).join('|'))}", sel)
    chk('axe — ' + rotulo, not r, '; '.join(r))

IMG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0f01f0005000201a5f645400000000049454e44ae426082")
def gradiente():
    from PIL import Image
    import io
    im = Image.new('RGB', (480, 600))
    px = im.load()
    for x in range(480):
        for y in range(600): px[x, y] = (200 - x // 4, 120 + y // 8, 90 + x // 6)
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    GRAD = gradiente()
    # ======================= VITRINE =======================
    print('== Vitrine: ordem por foto nova ==')
    for w, h in [(390, 844), (1440, 900)]:
        base_ord = None
        for modo in ['', 'ok', 'az', 'erro', 'lento']:
            ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 600, has_touch=w < 600, service_workers='block', timezone_id='America/Fortaleza')
            st = install(ctx, versao='3.7')
            for x in st['produtos']: x['Status'] = 'Ativo'; x['Estoque'] = 3
            alvo = st['produtos'][2]['ID']          # peça antiga (cadastrada no começo): no fim da ordem "mais recentes"
            if modo in ('ok', 'az'): st['fotos_novas'] = {alvo: iso(0)}
            if modo == 'erro': st['fn_modo'] = 'erro'; st['fotos_novas'] = {alvo: iso(0)}
            if modo == 'lento': st['fn_modo'] = 'lento'
            pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
            t0 = time.time(); pg.goto(BASE + 'index.html'); pg.wait_for_selector('#grid .card[data-id]'); t_pinta = time.time() - t0
            if modo == 'az': pg.select_option('#ordem', 'az'); pg.wait_for_timeout(400)
            pg.wait_for_timeout(900)
            ids = ids_na_grade(pg)
            if modo == '':
                base_ord = ids
                chk(f'{w}: sem foto nova a peça antiga fica onde estava (fim da ordem)', ids.index(alvo) > 5, ids.index(alvo))
            elif modo == 'ok':
                chk(f'{w}: peça com foto nova vai para o topo em "mais recentes"', ids[0] == alvo, ids[:4])
                chk(f'{w}: o resto mantém a ordem de antes', [i for i in ids if i != alvo] == [i for i in base_ord if i != alvo])
                chk(f'{w}: /catalogo/fotos-novas pedida sem sessão (pública)', any(not c['sessao'] for c in st.get('fn_chamadas', [])))
                chk(f'{w}: sem rolagem horizontal', sem_rolagem_horizontal(pg))
                foto(pg, f'vitrine_foto_nova_{w}.jpg')
            elif modo == 'az':
                nomes = pg.eval_on_selector_all('#grid .card[data-id] .card-nome, #grid .card[data-id] h3', 'l => l.map(e => e.textContent.trim())')
                ordenado = pg.evaluate("(ids) => { const P = produtos; return ids.map(i => P.find(p => String(p.ID) === i)).map(p => p.Nome); }", ids)
                chk(f'{w}: ordenar por nome respeita a escolha (foto nova não fura)', ordenado == sorted(ordenado, key=lambda s: s.lower()) or pg.evaluate("(ids)=>{const n=ids.map(i=>produtos.find(p=>String(p.ID)===i).Nome);return n.every((x,k)=>k===0||n[k-1].localeCompare(x,'pt-BR')<=0)}", ids), ordenado[:5])
                chk(f'{w}: com nome, a peça com foto nova não está forçada no topo', ids[0] != alvo or ordenado[0] == pg.evaluate("(i)=>produtos.find(p=>String(p.ID)===i).Nome", alvo))
            elif modo == 'erro':
                chk(f'{w}: Worker com erro = vitrine como antes', ids == base_ord, (ids[:4], base_ord[:4]))
            elif modo == 'lento':
                chk(f'{w}: Worker lento não segura a vitrine (pintou em {t_pinta:.1f}s)', t_pinta < 2.4, t_pinta)
                chk(f'{w}: Worker lento = vitrine como antes', ids == base_ord)
            chk(f'{w}/{modo or "base"}: sem erro de página', not erros, erros)
            ctx.close()

    # ======================= POSTADOR =======================
    print('== Postador: fotos postadas ==')
    for w, h in [(390, 844), (1440, 900)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 600, has_touch=w < 600, service_workers='block', timezone_id='America/Fortaleza')
        ctx.add_init_script(SESSION); ctx.add_init_script('window.TK_POSTAGENS_POLL_MS=60000;')
        st = install(ctx, perms=PERMS_ALL, versao='4.3'); st['midia']['modo'] = 'ok'; g = st['ig']; g['regras'] = True
        P = [x for x in st['produtos'] if x['Status'] == 'Ativo']
        for x in st['produtos']: x['Foto_URL'] = 'https://res.cloudinary.com/z/image/upload/v1/capa%s.jpg' % x['ID'][-2:]
        A, B, C = P[-1], P[-2], P[-3]        # A: 4 fotos, 2 postadas | B: 1 foto já postada | C: postagem antiga (legado) com modelo
        gal = ['https://res.cloudinary.com/z/image/upload/v1/a%d.jpg' % i for i in (1, 2, 3)]
        A['Fotos_Galeria'] = ','.join(gal); A['Nome'] = 'Vestido floral midi'
        B['Nome'] = 'Blusa canelada'; C['Nome'] = 'Short jeans'; C['Fotos_Galeria'] = 'https://res.cloudinary.com/z/image/upload/v1/c-nova.jpg'
        g['postadas'] = {'porUrl': {A['Foto_URL']: iso(0), gal[0]: iso(3), B['Foto_URL']: iso(5)},
                         'legado': [{'c': C['Codigo'], 'u': ['https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/modelo-antigo.jpg'], 'em': iso(12)}], 'derivadas': {}}
        st['fotos_novas'] = {C['ID']: iso(0)}   # C ganhou foto nova hoje: sobe na lista do postador
        ctx.route('**/res.cloudinary.com/**', lambda route: route.fulfill(body=GRAD, content_type='image/png', headers={'Access-Control-Allow-Origin': '*'}))
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(2400)
        pg.click('#details-ferramentas > summary'); pg.wait_for_timeout(250); pg.click('#btn-abrir-postagens'); pg.wait_for_timeout(1200)
        # lista de peças: sinal discreto
        primeiro = pg.locator('.po-card').first.get_attribute('data-psel')
        chk(f'{w}: lista do postador põe no começo a peça que ganhou foto nova', primeiro == C['ID'], (primeiro, C['ID']))
        def sinal(pid):
            l = pg.locator(f'.po-card[data-psel="{pid}"] .po-sinal')
            return l.inner_text().strip() if l.count() else ''
        chk(f'{w}: lista mostra "2 fotos novas para postar" na peça com 2 de 4 postadas', sinal(A['ID']) == '2 fotos novas para postar', sinal(A['ID']))
        chk(f'{w}: lista mostra "Tudo já postado há 5 dias" na peça toda postada', sinal(B['ID']) == 'Tudo já postado há 5 dias', sinal(B['ID']))
        chk(f'{w}: postagem antiga com modelo casa pela posição (capa) → "1 foto nova para postar"', sinal(C['ID']) == '1 foto nova para postar', sinal(C['ID']))
        chk(f'{w}: peça nunca postada diz que a foto ainda não foi postada', sinal(P[0]['ID']) == 'Foto ainda não postada', sinal(P[0]['ID']))
        st_sinal = pg.evaluate("(()=>{const e=document.querySelector('.po-sinal-novas');if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {fs:parseFloat(c.fontSize),w:r.width,cor:c.color,fundo:c.backgroundColor}})()")
        chk(f'{w}: sinal legível (texto ≥ 11 px, não só cor)', st_sinal and st_sinal['fs'] >= 11, st_sinal)
        card = pg.locator(f'.po-card[data-psel="{A["ID"]}"]'); card.evaluate("e => e.scrollIntoView({block: 'center'})"); pg.wait_for_timeout(300)
        chk(f'{w}: card da peça continua com alvo ≥ 44 px', card.bounding_box()['height'] >= 44)
        foto(pg, f'postador_lista_{w}.jpg')
        chk(f'{w}: lista sem rolagem horizontal', sem_rolagem_horizontal(pg))
        # escolher A
        card.click(); pg.click('[data-a=usarpecas]'); pg.wait_for_timeout(600)
        pg.click('[data-tipo=carrossel]'); pg.wait_for_timeout(600)
        th = pg.locator('.po-midias .po-m')
        estado = [(th.nth(i).get_attribute('aria-pressed'), th.nth(i).locator('.po-postada').inner_text() if th.nth(i).locator('.po-postada').count() else '') for i in range(th.count())]
        chk(f'{w}: carrossel — fotos postadas vêm desmarcadas, as novas marcadas', [e[0] for e in estado[:4]] == ['false', 'false', 'true', 'true'], estado)
        chk(f'{w}: selo "Postada hoje" e "Postada há 3 dias" em texto', estado[0][1].replace('\n', ' ') == 'Postada hoje' and estado[1][1].replace('\n', ' ') == 'Postada há 3 dias', estado)
        chk(f'{w}: o selo também está no nome acessível da foto', 'postada hoje' in (th.nth(0).get_attribute('aria-label') or ''), th.nth(0).get_attribute('aria-label'))
        selo = pg.evaluate("(()=>{const e=document.querySelector('.po-m .po-postada'),m=e.closest('.po-m');const r=e.getBoundingClientRect(),q=m.getBoundingClientRect(),c=getComputedStyle(e);return {fs:parseFloat(c.fontSize),alt:r.height,thumb:q.height,w:q.width,h:q.height,dentro:r.left>=q.left-1&&r.right<=q.right+1&&r.bottom<=q.bottom+1}})()")
        chk(f'{w}: selo cabe na miniatura e não cobre a maior parte da foto', selo['dentro'] and selo['alt'] <= selo['thumb'] * 0.45, selo)
        chk(f'{w}: miniatura (alvo de toque) ≥ 44 px', selo['w'] >= 44 and selo['h'] >= 44, selo)
        chk(f'{w}: dica explica que as já postadas vêm desmarcadas', pg.locator('.po-postadas-dica').count() == 1 and 'desmarcadas' in pg.inner_text('.po-postadas-dica'))
        pg.locator('.po-midias').scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        foto(pg, f'postador_fotos_{w}.jpg')
        chk(f'{w}: seleção sem rolagem horizontal', sem_rolagem_horizontal(pg))
        if w == 390: axe(pg, '#overlay-postagens', f'{w}: seleção com fotos postadas')
        # feed: só uma — a primeira NÃO postada
        pg.click('[data-tipo=feed]'); pg.wait_for_timeout(400)
        pres = [th.nth(i).get_attribute('aria-pressed') for i in range(4)]
        chk(f'{w}: feed escolhe a primeira foto NÃO postada', pres == ['false', 'false', 'true', 'false'], pres)
        # marcar uma postada mesmo assim e postar com modelo
        th.nth(0).click(); pg.wait_for_timeout(300)
        chk(f'{w}: dá para marcar uma foto postada e usar', th.nth(0).get_attribute('aria-pressed') == 'true')
        n0 = len(g.get('post_chamadas', []))
        pg.click('[data-a=enviar]'); pg.wait_for_timeout(3500)
        pc = [c for c in g.get('post_chamadas', [])[n0:] if c['path'] == '/post']
        corpo = pc[-1]['corpo'] if pc else {}
        chk(f'{w}: postar com a foto já postada manda a foto ORIGINAL em fotosOrigem', corpo.get('fotosOrigem') == [{'u': A['Foto_URL'], 'p': A['ID']}], corpo.get('fotosOrigem'))
        # colagem com fotos postadas
        pg.evaluate("window.tkPostarPecas([%r])" % A['ID']); pg.wait_for_timeout(900)
        pg.click('[data-tipo=story]'); pg.wait_for_timeout(500)
        pg.click('[data-a=col-abrir]'); pg.wait_for_timeout(900)
        if pg.locator('[data-ctl="4"]').count(): pg.click('[data-ctl="4"]'); pg.wait_for_timeout(300)
        pg.click('#po-ct-criar'); pg.wait_for_timeout(1800)
        n0 = len(g.get('post_chamadas', []))
        pg.click('[data-a=enviar]'); pg.wait_for_timeout(3500)
        pc = [c for c in g.get('post_chamadas', [])[n0:] if c['path'] == '/post']
        corpo = pc[-1]['corpo'] if pc else {}
        origens = [o['u'] for q in corpo.get('posts', []) for o in q.get('fotosOrigem', [])]
        chk(f'{w}: colagem leva as fotos usadas (inclusive as já postadas) em fotosOrigem', set(origens) == {A['Foto_URL']} | set(gal), origens)
        # B: todas postadas → aviso
        pg.evaluate("window.tkPostarPecas([%r])" % B['ID']); pg.wait_for_timeout(900)
        pg.click('[data-tipo=feed]'); pg.wait_for_timeout(400)
        av = pg.locator('.po-postadas-aviso')
        chk(f'{w}: todas postadas → aviso claro', av.count() == 1 and 'já foi postada' in av.inner_text() and 'há 5 dias' in av.inner_text(), av.inner_text() if av.count() else '')
        chk(f'{w}: todas postadas → nada pré-marcado, mas dá para escolher', pg.locator('.po-midias .po-m[aria-pressed=true]').count() == 0)
        pg.locator('.po-postadas-aviso').scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        foto(pg, f'postador_todas_postadas_{w}.jpg')
        pg.locator('.po-midias .po-m').nth(0).click(); pg.wait_for_timeout(300)
        chk(f'{w}: escolher a foto postada mesmo assim funciona', pg.locator('.po-midias .po-m').nth(0).get_attribute('aria-pressed') == 'true')
        chk(f'{w}: postador sem erro de página', not erros, erros)
        ctx.close()

    # Worker de postagens fora: o postador segue como antes (tudo marcado como sempre, sem selo)
    print('== Postador sem a lista de postadas ==')
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    ctx.add_init_script(SESSION); ctx.add_init_script('window.TK_POSTAGENS_POLL_MS=60000;')
    st = install(ctx, perms=PERMS_ALL, versao='4.3'); g = st['ig']; g['postadas_modo'] = 'erro'
    for x in st['produtos']: x['Fotos_Galeria'] = 'https://res.cloudinary.com/z/image/upload/v1/g1.jpg'
    ctx.route('**/res.cloudinary.com/**', lambda route: route.fulfill(body=GRAD, content_type='image/png', headers={'Access-Control-Allow-Origin': '*'}))
    pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(2400)
    pg.click('#details-ferramentas > summary'); pg.wait_for_timeout(250); pg.click('#btn-abrir-postagens'); pg.wait_for_timeout(1000)
    chk('sem a lista de postadas: nenhum sinal na lista', pg.locator('.po-sinal').count() == 0)
    pg.click('.po-card >> nth=0'); pg.click('[data-a=usarpecas]'); pg.wait_for_timeout(500); pg.click('[data-tipo=carrossel]'); pg.wait_for_timeout(400)
    chk('sem a lista de postadas: carrossel marca as fotos como antes, sem selo', pg.locator('.po-midias .po-m[aria-pressed=true]').count() == 2 and pg.locator('.po-postada').count() == 0)
    chk('sem erro de página', not erros, erros)
    ctx.close()
    b.close()

print(f'\n{ok} ok, {len(falhas)} falha(s)')
print(f'OK={ok} FALHAS={len(falhas)}')
sys.exit(1 if falhas else 0)
