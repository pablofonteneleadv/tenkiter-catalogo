"""Postagens 7.56 — fila à prova de falhas bobas, na tela (Fila).

Cobre: faixa discreta "Saúde das postagens" por canal (Instagram em pausa até HH:MM com motivo, WhatsApp seguindo normal,
"Precisa de atenção: N item" com o motivo); item "Aguardando pausa do Instagram" com horário previsto, diferente de erro;
parte de série "ambos" com WhatsApp confirmado e Instagram em erro = "Instagram não saiu" + "Repostar só o Story";
série parada com aviso claro; botão do gestor "Retomar Instagram agora" (confirma, chama o servidor, some a pausa);
equipe sem Admin total não vê o botão; faixa "Normal" discreta; espaço mínimo do Instagram configurável na aba Regras;
390 e 1440 sem rolagem horizontal, alvos ≥ 44 px, axe sem violações graves. Worker simulado (mock.py); nada sai da máquina.

Uso: python3 -m http.server 8800 &  TK_BASE=http://localhost:8800/ python3 tests/postagens_prova_falhas_ui.py
"""
import io, os, sys, json
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION, PERMS_ALL
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

BASE = os.environ.get('TK_BASE', 'http://localhost:8800/')
EVID = Path(__file__).resolve().parent.parent / 'docs' / 'ux' / 'postagens-prova-falhas-20261106'
EVID.mkdir(parents=True, exist_ok=True)
R2 = 'https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202611/'
FALHAS, OKS = [], []


def chk(cond, nome, extra=''):
    (OKS if cond else FALHAS).append(nome)
    print(('  ✔ ' if cond else '  ✘ ') + nome + ('' if cond or not extra else ' — ' + str(extra)[:300]), flush=True)


def jpeg(fundo, roupa):
    im = Image.new('RGB', (360, 450), fundo); d = ImageDraw.Draw(im)
    d.polygon([(150, 60), (210, 60), (230, 150), (290, 420), (70, 420), (130, 150)], fill=roupa)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=80); return b.getvalue()


def iso(dt):
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def cenario(agora, pausa=True):
    t = agora.replace(second=0, microsecond=0)
    ate = t + timedelta(minutes=27)
    base = {'modo': 'auto', 'legenda': 'Conjunto canelado TK-0207', 'link': '', 'criadoPor': 'Ana Lima', 'tentativas': 0, 'erro': '', 'permalink': '', 'atencao': ''}
    rows = []

    def add(**k):
        r = dict(base); r.update(k); rows.append(r)
    f = lambda n: [{'url': R2 + 'b00000000000000000%02d.jpg' % n, 'tipo': 'imagem'}]
    esp = {'tipo': 'limite', 'ate': iso(ate), 'motivo': 'limite do Instagram', 'previsto': iso(ate)} if pausa else None
    # Série real: parte 1 com WhatsApp confirmado e Instagram "too many actions"; partes 2 e 3 já saíram.
    serie = lambda n: {'id': 'serie-1345', 'ordem': n, 'total': 3}
    add(id=1345, origemMidia='v1', tipo='story', canal='ambos', midias=f(1), status='erro', tentativas=3, serie=serie(1), agendadoEm=iso(t - timedelta(hours=22)),
        erro='Instagram: User is performing too many actions', zap={'estado': 'confirmado', 'erro': '', 'tentativas': 0, 'consultadoEm': '', 'limiteEm': ''})
    for n in (2, 3):
        add(id=1345 + n, origemMidia='v1', tipo='story', canal='ambos', midias=f(1), status='publicado', serie=serie(n), agendadoEm=iso(t - timedelta(minutes=10 - n)), publicadoEm=iso(t - timedelta(minutes=10 - n)),
            permalink='https://www.instagram.com/p/FAKE%d/' % n, zap={'estado': 'confirmado', 'erro': '', 'tentativas': 0, 'consultadoEm': '', 'limiteEm': ''})
    # "ambos" na pausa: WhatsApp já saiu, Story aguarda a pausa.
    add(id=2001, origemMidia='m2', tipo='story', canal='ambos', midias=f(2), status='agendado', agendadoEm=iso(t - timedelta(minutes=4)), esperaIg=esp,
        erro='Aguardando a pausa do Instagram (até %s): limite do Instagram.' % ate.strftime('%H:%M') if pausa else '',
        zap={'estado': 'confirmado', 'erro': '', 'tentativas': 0, 'consultadoEm': '', 'limiteEm': ''})
    # Só Instagram aguardando a pausa.
    add(id=2002, origemMidia='m3', tipo='story', canal='instagram', midias=f(3), status='agendado', agendadoEm=iso(t - timedelta(minutes=2)), esperaIg=esp)
    # Série parada (parte 1 não saiu, sem WhatsApp).
    add(id=3001, origemMidia='v2', tipo='story', canal='instagram', midias=f(4), status='erro', serie={'id': 's2', 'ordem': 1, 'total': 2}, agendadoEm=iso(t - timedelta(minutes=40)),
        erro='O Instagram não aceitou a mídia (precisa ser JPEG ou MP4 público, dentro das proporções).')
    add(id=3002, origemMidia='v2', tipo='story', canal='instagram', midias=f(4), status='agendado', serie={'id': 's2', 'ordem': 2, 'total': 2}, agendadoEm=iso(t - timedelta(minutes=40)),
        atencao='Sequência parada: a parte 1 de 2 não saiu. Esta parte não sai sozinha para não ficar fora de ordem. Use “Cancelar partes pendentes” ou agende o vídeo de novo.')
    # Grupo e Status 2 normais.
    add(id=4001, origemMidia='m5', tipo='story', canal='grupo', midias=f(5), status='agendado', agendadoEm=iso(t + timedelta(minutes=12)))
    add(id=4002, origemMidia='m5', tipo='story', canal='whatsapp2', midias=f(5), status='agendado', agendadoEm=iso(t + timedelta(minutes=12)))
    hm = ate.astimezone(timezone(timedelta(hours=-3))).strftime('%H:%M')
    ig_txt = ('Em pausa até %s (limite do Instagram) · Precisa de atenção: 3 itens' % hm) if pausa else 'Precisa de atenção: 3 itens'
    saude = {
        'geral': ('Instagram em pausa até %s (limite do Instagram) — WhatsApp seguindo normal' % hm) if pausa else 'Precisa de atenção: 3 itens',
        'normal': False,
        'canais': {
            'instagram': {'nome': 'Instagram', 'estado': 'pausa' if pausa else 'atencao', 'texto': ig_txt, 'atencao': 3,
                          'motivos': ['Instagram não saiu (o WhatsApp saiu) — use “Repostar só o Story”.', 'Sequência parada: a parte 1 de 2 não saiu.']},
            'status': {'nome': 'WhatsApp Status 1', 'estado': 'normal', 'texto': 'Seguindo normal' if pausa else 'Normal', 'atencao': 0, 'motivos': []},
            'grupo': {'nome': 'Grupo clientes', 'estado': 'normal', 'texto': 'Normal', 'atencao': 0, 'motivos': []},
            'status2': {'nome': 'WhatsApp Status 2', 'estado': 'normal', 'texto': 'Normal', 'atencao': 0, 'motivos': []},
        },
        'instagram': {'estado': 'pausa' if pausa else 'atencao', 'ate': iso(ate) if pausa else '', 'motivo': 'limite do Instagram' if pausa else '', 'nivel': 1},
        'podeRetomarIg': pausa, 'avisoGestor': '', 'eventos': [],
    }
    return rows, saude, hm


IMGS = {'b00000000000000000%02d.jpg' % n: jpeg((240 - n * 4, 232, 222), (60 + n * 20, 92, 140)) for n in range(1, 7)}


def r2(route):
    nome = route.request.url.split('?')[0].rsplit('/', 1)[-1]
    if nome in IMGS: return route.fulfill(body=IMGS[nome], content_type='image/jpeg')
    return route.fulfill(status=404, body='')


def sem_rolagem(pg):
    return pg.evaluate('document.documentElement.scrollWidth<=innerWidth') and pg.evaluate("(()=>{const c=document.getElementById('po-corpo');return c.scrollWidth<=c.clientWidth+1})()")


def alvos_pequenos(pg, sel):
    return pg.evaluate("s=>[...document.querySelectorAll(s)].filter(b=>b.offsetParent).map(b=>[b.textContent.trim().slice(0,24),Math.round(b.getBoundingClientRect().height)]).filter(x=>x[1]<44)", sel)


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])
    for largura, altura in [(390, 844), (1440, 900)]:
        print('== %d px ==' % largura, flush=True)
        ctx = browser.new_context(viewport={'width': largura, 'height': altura}, device_scale_factor=1, timezone_id='America/Fortaleza')
        ctx.add_init_script(SESSION); ctx.add_init_script('window.TK_POSTAGENS_POLL_MS=60000;')
        st = install(ctx, perms=PERMS_ALL, versao='7.56.0')
        ctx.route('**/m/202611/**', r2)
        g = st['ig']; g['regras'] = True
        g['regras_cfg'] = {"pausaAtiva": True, "pausaDe": "22:00", "pausaAte": "06:30", "max24h": 90, "agoraIgnora": True, "partesRapidas": True, "igGapMin": 3,
                           "canais": {"story": {"max24h": 40, "gapMin": 120, "gapMax": 300}, "status": {"max24h": 40, "gapMin": 120, "gapMax": 300}, "feed": {"max24h": 20, "gapMin": 300, "gapMax": 600}, "carrossel": {"max24h": 20, "gapMin": 300, "gapMax": 600}, "reels": {"max24h": 10, "gapMin": 600, "gapMax": 1200}}}
        g['posts'], g['saude'], hm = cenario(datetime.now(timezone.utc))
        retomadas, reposts = [], []

        def retomar(route):
            retomadas.append(1)
            g['posts'], g['saude'], _ = cenario(datetime.now(timezone.utc), pausa=False)
            route.fulfill(json={'ok': True, 'mensagem': 'Instagram retomado. As postagens que esperavam a pausa saem na ordem, com o espaço mínimo entre elas.'})
        ctx.route('**/post/ig-retomar', retomar)

        def repostar(route):
            reposts.append(json.loads(route.request.post_data))
            route.fulfill(json={'ok': True, 'id': 9001, 'quando': iso(datetime.now(timezone.utc) + timedelta(minutes=30)), 'canal': 'instagram'})
        ctx.route('**/post/repostar', repostar)
        dialogos = []
        ctx.on('dialog', lambda d: (dialogos.append(d.message), d.accept()))
        pg = ctx.new_page(); erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(1600)
        pg.click('#details-ferramentas > summary'); pg.click('#btn-abrir-postagens'); pg.wait_for_timeout(400)
        pg.locator('#po-abas [data-aba=fila]').click(); pg.wait_for_timeout(700)

        # ---------- Faixa de saúde ----------
        faixa = pg.locator('.po-saude')
        chk(faixa.count() == 1, 'faixa “Saúde das postagens” no topo da Fila')
        txt = faixa.inner_text() if faixa.count() else ''
        chk(('Instagram em pausa até %s (limite do Instagram) — WhatsApp seguindo normal' % hm) in txt, 'faixa: “Instagram em pausa até HH:MM (limite do Instagram) — WhatsApp seguindo normal”', txt)
        chk('WhatsApp Status 1' in txt and 'Seguindo normal' in txt and ('Grupo clientes' in txt or 'Grupo 1' in txt) and 'WhatsApp Status 2' in txt, 'faixa mostra cada canal', txt)
        chk('Precisa de atenção: 3 itens' in txt, 'faixa: “Precisa de atenção: N itens” no Instagram')
        chk(faixa.get_attribute('role') == 'status' and 'pausa' in (faixa.get_attribute('class') or ''), 'faixa é região de status e tem o tom de pausa (sem vermelho de erro)')
        chk(not any(c in txt for c in ['{', '}', 'OAuthException', 'too many']), 'faixa em português, sem JSON nem texto cru do Instagram', txt)
        pg.locator('.po-saude summary').click(); pg.wait_for_timeout(150)
        chk('Repostar só o Story' in faixa.inner_text(), '“Ver o motivo” abre os motivos em português')

        # ---------- Por canal ----------
        pg.locator('[data-fila-modo=canal]').click(); pg.wait_for_timeout(300)
        for k in ['story', 'status', 'status2', 'grupo']:
            b = pg.locator('[data-fg="%s"]' % k)
            if b.count() and b.get_attribute('aria-expanded') != 'true': b.click(); pg.wait_for_timeout(120)
        it = pg.locator('[data-fg-sec=story] .po-item[data-id="2002"]')
        it_txt = it.inner_text() if it.count() else ''
        chk('Aguardando pausa do Instagram' in it_txt and ('Sai por volta de %s' % hm) in it_txt, 'item: “Aguardando pausa do Instagram” com horário previsto', it_txt[:300])
        chk(it.locator('.po-st.erro').count() == 0 and it.locator('.po-erro').count() == 0, 'item aguardando a pausa não aparece como erro')
        amb = pg.locator('[data-fg-sec=story] .po-item[data-id="2001"]')
        chk(amb.count() == 1 and 'Aguardando pausa do Instagram' in amb.inner_text() and 'publicado' in amb.inner_text().lower(), '“ambos”: Story aguardando a pausa e WhatsApp já publicado', amb.inner_text()[:300] if amb.count() else '')
        s1 = pg.locator('[data-fg-sec=story] .po-item[data-id="1345"]')
        s1_txt = s1.inner_text() if s1.count() else ''
        chk('Instagram não saiu' in s1_txt and 'o WhatsApp saiu' in s1_txt, 'parte 1 da série real: “Instagram não saiu” com o motivo', s1_txt[:300])
        chk('too many' not in s1_txt.lower() and 'excesso de ações' in s1_txt, 'motivo em português (sem o texto cru em inglês do Instagram)', s1_txt[:300])
        chk(s1.locator('[data-a=agora]').count() == 0, 'parte de série com “Repostar só o Story” não oferece “Postar agora” (que remexeria a série)')
        rb = s1.locator('[data-a=repostar]')
        chk(rb.count() == 1 and rb.inner_text().strip() == 'Repostar só o Story', 'parte 1: botão “Repostar só o Story”')
        if rb.count():
            rb.click(); pg.wait_for_timeout(500)
            chk(reposts and reposts[-1].get('id') == 1345 and reposts[-1].get('perna') == 'instagram', '“Repostar só o Story” envia só a perna do Instagram', reposts)
        sp = pg.locator('[data-fg-sec=story] .po-item[data-id="3002"]')
        chk(sp.count() == 1 and 'Sequência parada' in sp.inner_text(), 'série parada mostra o aviso claro')
        chk(sem_rolagem(pg), 'Fila por canal sem rolagem horizontal em %d' % largura)
        pequenos = alvos_pequenos(pg, '#po-corpo button')
        chk(not pequenos, 'alvos ≥ 44 px na Fila por canal', pequenos)
        pg.evaluate("document.getElementById('po-corpo').scrollTop=0")
        pg.screenshot(path=str(EVID / ('fila-saude-pausa-%d.jpg' % largura)), type='jpeg', quality=72)
        s1.evaluate("e=>e.scrollIntoView({block:'center'})"); pg.wait_for_timeout(150)
        pg.screenshot(path=str(EVID / ('fila-instagram-nao-saiu-%d.jpg' % largura)), type='jpeg', quality=72)
        it.evaluate("e=>e.scrollIntoView({block:'center'})"); pg.wait_for_timeout(150)
        pg.screenshot(path=str(EVID / ('fila-aguardando-pausa-%d.jpg' % largura)), type='jpeg', quality=72)

        # ---------- Por mídia ----------
        pg.locator('[data-fila-modo=midia]').click(); pg.wait_for_timeout(300)
        chips = pg.evaluate("[...document.querySelectorAll('.po-mc-chip')].map(e=>e.textContent)")
        chk(any('Pausa do Instagram' in c for c in chips), 'Por mídia: chip “Pausa do Instagram” (não “Erro”)', chips)
        chk(sem_rolagem(pg), 'Fila por mídia sem rolagem horizontal em %d' % largura)
        pg.evaluate("document.getElementById('po-corpo').scrollTop=0")
        pg.screenshot(path=str(EVID / ('fila-por-midia-pausa-%d.jpg' % largura)), type='jpeg', quality=72)

        # ---------- Retomar Instagram agora ----------
        bt = pg.locator('.po-saude [data-a=ig-retomar]')
        chk(bt.count() == 1 and bt.inner_text().strip() == 'Retomar Instagram agora', 'gestor vê “Retomar Instagram agora”')
        chk(not alvos_pequenos(pg, '.po-saude button, .po-saude summary'), 'botão e “Ver o motivo” com ≥ 44 px')
        bt.click(); pg.wait_for_timeout(700)
        chk(retomadas and dialogos and 'Retomar o Instagram' in dialogos[-1], 'pede confirmação e chama o servidor', dialogos)
        txt2 = pg.inner_text('.po-saude') if pg.locator('.po-saude').count() else ''
        chk('em pausa' not in txt2 and pg.locator('.po-saude [data-a=ig-retomar]').count() == 0, 'depois de retomar a pausa some da faixa', txt2)
        aviso = pg.inner_text('.po-aviso') if pg.locator('.po-aviso').count() else ''
        chk('Instagram retomado' in aviso, 'retorno visível em português', aviso)
        pg.evaluate("document.getElementById('po-corpo').scrollTop=0")
        pg.screenshot(path=str(EVID / ('fila-saude-retomada-%d.jpg' % largura)), type='jpeg', quality=72)

        # ---------- Regras: espaço mínimo do Instagram ----------
        pg.locator('#po-abas [data-aba=regras]').click(); pg.wait_for_timeout(500)
        campo = pg.locator('#rg-igGapMin')
        chk(campo.count() == 1 and campo.input_value() == '3', 'Regras: espaço mínimo do Instagram configurável (3 min)')
        if campo.count():
            campo.evaluate("e=>e.scrollIntoView({block:'center'})"); pg.wait_for_timeout(120)
            pg.screenshot(path=str(EVID / ('regras-espaco-instagram-%d.jpg' % largura)), type='jpeg', quality=72)
        chk(sem_rolagem(pg), 'Regras sem rolagem horizontal em %d' % largura)

        pg.locator('#po-abas [data-aba=fila]').click(); pg.wait_for_timeout(500)
        pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
        viol = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+': '+v.nodes.map(n=>n.target).join(' '))}")
        chk(not viol, 'axe sem violações graves', viol)
        chk(not erros, 'sem erro de JavaScript', erros)
        ctx.close()

    # ---------- Equipe sem Admin total; tudo normal ----------
    print('== equipe / faixa normal ==', flush=True)
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, timezone_id='America/Fortaleza')
    ctx.add_init_script(SESSION); ctx.add_init_script('window.TK_POSTAGENS_POLL_MS=60000;')
    st = install(ctx, perms=PERMS_ALL, versao='7.56.0'); ctx.route('**/m/202611/**', r2)
    g = st['ig']; g['regras'] = True; g['pode_regras'] = False
    rows, saude, _ = cenario(datetime.now(timezone.utc)); saude['podeRetomarIg'] = False
    g['posts'], g['saude'] = rows, saude
    pg = ctx.new_page(); pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(1600)
    pg.click('#details-ferramentas > summary'); pg.click('#btn-abrir-postagens'); pg.wait_for_timeout(400)
    pg.locator('#po-abas [data-aba=fila]').click(); pg.wait_for_timeout(600)
    chk(pg.locator('.po-saude').count() == 1 and pg.locator('.po-saude [data-a=ig-retomar]').count() == 0, 'equipe vê a faixa, mas não o botão de retomar')
    g['posts'] = [r for r in rows if r['id'] in (4001, 4002)]
    g['saude'] = {'geral': 'Normal', 'normal': True, 'canais': {k: {'nome': n, 'estado': 'normal', 'texto': 'Normal', 'atencao': 0, 'motivos': []} for k, n in [('instagram', 'Instagram'), ('status', 'WhatsApp Status 1'), ('grupo', 'Grupo clientes'), ('status2', 'WhatsApp Status 2')]},
                  'instagram': {'estado': 'normal', 'ate': '', 'motivo': '', 'nivel': 0}, 'podeRetomarIg': False, 'avisoGestor': '', 'eventos': []}
    pg.locator('#po-abas [data-aba=hist]').click(); pg.wait_for_timeout(300); pg.locator('#po-abas [data-aba=fila]').click(); pg.wait_for_timeout(600)
    f = pg.inner_text('.po-saude') if pg.locator('.po-saude').count() else ''
    chk(' '.join(f.split()) == 'Saúde das postagens: Normal' and pg.locator('.po-saude li').count() == 0, 'tudo normal: faixa discreta de uma linha', f)
    pg.screenshot(path=str(EVID / 'fila-saude-normal-390.jpg'), type='jpeg', quality=72)
    ctx.close()
    browser.close()
print('\nOK=%d FALHAS=%d %s' % (len(OKS), len(FALHAS), FALHAS if FALHAS else ''))
sys.exit(1 if FALHAS else 0)
