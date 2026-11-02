"""Família de produtos na vitrine (v7.44.0): um card por tamanho, cards da mesma família sempre juntos e na ordem da família,
filtro parcial, "Outros tamanhos" na peça aberta, e /familias com erro ou lento = vitrine como antes. Apps Script e Worker SIMULADOS."""
import os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TK_BASE', 'http://localhost:8765/')
OUT = Path(os.environ.get('TK_OUT', '/tmp/familia-vitrine')); OUT.mkdir(parents=True, exist_ok=True)
ok, falhas = 0, []
def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1; print('  ✔ ' + nome)
    else: falhas.append(nome); print('  ✘ ' + nome + ('' if det is None else ' — ' + str(det)[:400]))

SUNGA = {'P': None, 'M': None, 'G': None}
def preparar(st, familias=True):
    P = st['produtos']
    for x in P: x['Status'] = 'Ativo'; x['Estoque'] = 3
    # os tamanhos foram cadastrados em dias diferentes: no servidor ficam espalhados (posições 3, 10 e 16), com outras peças no meio
    for pos, (t, preco) in zip([3, 10, 16], [('G', 59.9), ('P', 39.9), ('M', 44.9)]):
        P[pos].update(Nome='Sunga infantil masculino ' + t, Tamanhos=t, Preco=preco, Categoria='Moda praia', Codigo='SU-' + t)
        SUNGA[t] = P[pos]['ID']
    P[12].update(Preco=41.9, Nome='Short barato')   # peça barata entre os tamanhos: não pode entrar no meio da família
    if familias:
        st['familias'] = [{'id': 'fsunga', 'nome': 'Sunga infantil masculino', 'membros': [{'produto': SUNGA['P'], 'rotulo': 'P', 'ordem': 0}, {'produto': SUNGA['M'], 'rotulo': 'M', 'ordem': 1}, {'produto': SUNGA['G'], 'rotulo': 'G', 'ordem': 2}]}]

def ids_na_grade(pg):
    return pg.eval_on_selector_all('#grid .card[data-id]', 'cs => cs.map(c => c.dataset.id)')

def abrir(b, w, h, modo='', familias=True):
    ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 600, has_touch=w < 600, service_workers='block')
    st = install(ctx, versao='3.7'); preparar(st, familias); st['fam_modo'] = modo
    pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    return ctx, st, pg, erros

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for w, h in [(390, 844), (1440, 900)]:
        ctx, st, pg, erros = abrir(b, w, h)
        pg.goto(BASE + 'index.html'); pg.wait_for_selector('#grid .card[data-id]')
        pg.wait_for_function("(id) => { const ids=[...document.querySelectorAll('#grid .card[data-id]')].map(c=>c.dataset.id); const k=ids.indexOf(id); return k>=0 && ids[k+1] && ids[k+2]; }", arg=SUNGA['P'], timeout=6000)
        ids = ids_na_grade(pg); k = [ids.index(SUNGA[t]) for t in 'PMG']
        chk(f'{w}: um card por tamanho (3 cards da família)', all(x >= 0 for x in k))
        chk(f'{w}: cards da família lado a lado, na ordem P, M, G', k[1] == k[0] + 1 and k[2] == k[0] + 2, k)
        # posição: o bloco entra onde aparecia o primeiro membro na ordem atual ("mais recentes" = lista do servidor invertida)
        primeiro = min(len(st['produtos']) - 1 - pos for pos in [3, 10, 16])
        chk(f'{w}: o bloco entra na posição do primeiro membro na ordem atual', k[0] == primeiro, (k, primeiro))
        chk(f'{w}: /familias foi pedida sem sessão (pública)', any(c['path'] == '/familias' and not c['sessao'] for c in st['fam_chamadas']))
        pg.locator(f'#grid .card[data-id="{SUNGA["P"]}"]').evaluate("e => e.scrollIntoView({block: 'center'})"); pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / f'vitrine_familia_{w}.png'), full_page=False); pg.evaluate('scrollTo(0, 0)')
        # ordem por preço: o bloco segue o primeiro membro (P, o mais barato) e nada entra no meio
        pg.select_option('#ordem', 'menor'); pg.wait_for_timeout(300)
        ids = ids_na_grade(pg); k = [ids.index(SUNGA[t]) for t in 'PMG']
        chk(f'{w}: ordenando por menor preço a família continua junta (P, M, G) e o Short barato fica fora do bloco', k == [k[0], k[0] + 1, k[0] + 2] and ids.index(next(x['ID'] for x in st['produtos'] if x['Nome'] == 'Short barato')) not in k, (k, ids[:6]))
        # filtro parcial: só P e M passam no preço máximo; aparecem só eles, ainda juntos
        pg.select_option('#ordem', index=0)
        pg.evaluate("() => { const m=document.getElementById('preco-max'); m.value='50'; m.dispatchEvent(new Event('input',{bubbles:true})); }"); pg.wait_for_timeout(600)
        ids = ids_na_grade(pg)
        chk(f'{w}: filtro parcial: só P e M aparecem, juntos, sem o G', SUNGA['P'] in ids and SUNGA['M'] in ids and SUNGA['G'] not in ids and ids.index(SUNGA['M']) == ids.index(SUNGA['P']) + 1, ids)
        pg.evaluate("() => { const m=document.getElementById('preco-max'); m.value=''; m.dispatchEvent(new Event('input',{bubbles:true})); }"); pg.wait_for_timeout(600)
        # busca: continua valendo por produto
        pg.fill('#busca', 'sunga'); pg.wait_for_timeout(700)
        ids = ids_na_grade(pg)
        chk(f'{w}: busca "sunga" mostra os 3 tamanhos na ordem', ids[:3] == [SUNGA['P'], SUNGA['M'], SUNGA['G']], ids)
        pg.fill('#busca', ''); pg.wait_for_timeout(700)
        # peça aberta: "Outros tamanhos"
        pg.locator(f'#grid .card[data-id="{SUNGA["M"]}"] .abrir-peca').click(); pg.wait_for_selector('#outros-tamanhos:not([hidden])', timeout=5000)
        ot = pg.locator('#outros-tamanhos')
        chk(f'{w}: peça aberta mostra "Outros tamanhos: P · M · G" com o M marcado', 'Outros tamanhos' in ot.inner_text() and ot.locator('button').all_inner_texts() == ['P', 'M', 'G'] and ot.locator('button[aria-current="true"]').inner_text() == 'M', ot.inner_text())
        alvos = ot.locator('button').evaluate_all('bs => bs.map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); })')
        chk(f'{w}: botões de tamanho com pelo menos 44 px', all(x >= 43.5 for x in alvos), alvos)
        pg.wait_for_timeout(450); ot.evaluate("e => e.scrollIntoView({block: 'center'})"); pg.wait_for_timeout(150)
        pg.screenshot(path=str(OUT / f'vitrine_outros_tamanhos_{w}.png'))
        ot.locator('button', has_text='G').click(); pg.wait_for_timeout(300)
        chk(f'{w}: tocar em G abre o tamanho G (nome e endereço)', 'Sunga infantil masculino G' in pg.inner_text('#modal-conteudo .nome') and 'SU-G' in pg.url and pg.locator('#outros-tamanhos button[aria-current="true"]').inner_text() == 'G', pg.url)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.goto(BASE + 'index.html'); pg.wait_for_selector('#grid .card[data-id]')
        outra = next(x['ID'] for x in st['produtos'] if x['Nome'] == 'Short barato')
        pg.locator(f'#grid .card[data-id="{outra}"] .abrir-peca').click(); pg.wait_for_selector('#overlay.aberto', timeout=5000)
        chk(f'{w}: peça fora de família: sem "Outros tamanhos"', pg.locator('#outros-tamanhos').is_hidden())
        chk(f'{w}: sem rolagem horizontal', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        chk(f'{w}: sem erro de JavaScript', not erros, erros)
        ctx.close()

    # /familias com erro: vitrine exatamente como antes (ordem do servidor, sem agrupar)
    for modo in ['erro', 'lento']:
        ctx, st, pg, erros = abrir(b, 390, 844, modo)
        t0 = time.time(); pg.goto(BASE + 'index.html'); pg.wait_for_selector('#grid .card[data-id]'); t1 = time.time() - t0
        pg.wait_for_timeout(3000)
        ids = ids_na_grade(pg)
        base = [x['ID'] for x in reversed(st['produtos'])][:len(ids)]
        chk(f'/familias {modo}: vitrine pinta sem esperar ({t1:.1f} s) e fica na ordem de sempre', t1 < 2.4 and ids == base, (t1, ids[:8], base[:8]))
        chk(f'/familias {modo}: abrir peça da família funciona, sem "Outros tamanhos"', (pg.locator(f'#grid .card[data-id="{SUNGA["M"]}"] .abrir-peca').click() or True) and pg.wait_for_selector('#overlay.aberto') and pg.locator('#outros-tamanhos').is_hidden())
        chk(f'/familias {modo}: sem erro de JavaScript', not erros, erros)
        for r in st.get('fam_pendentes', []):
            try: r.abort()
            except Exception: pass
        ctx.close()

    # cache local: a segunda visita já pinta agrupado mesmo se /familias falhar depois
    ctx, st, pg, erros = abrir(b, 390, 844)
    pg.goto(BASE + 'index.html'); pg.wait_for_selector('#grid .card[data-id]'); pg.wait_for_timeout(800)
    st['fam_modo'] = 'erro'
    pg.reload(); pg.wait_for_selector('#grid .card[data-id]')
    ids = ids_na_grade(pg); k = [ids.index(SUNGA[t]) for t in 'PMG']
    chk('cache local curto: segunda visita já agrupada mesmo com /familias fora', k == [k[0], k[0] + 1, k[0] + 2], k)
    pg.evaluate("localStorage.setItem('tk_familias_v1', '{quebrado')"); pg.reload(); pg.wait_for_selector('#grid .card[data-id]')
    chk('cache local corrompido não quebra a vitrine', pg.locator('#grid .card[data-id]').count() > 0 and not erros, erros)
    ctx.close()
    b.close()
print(f'OK={ok} FALHAS={len(falhas)} {falhas}')
sys.exit(1 if falhas else 0)
