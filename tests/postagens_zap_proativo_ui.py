"""Postagens 7.48.3 — WhatsApp proativo na tela (Fila Por canal/Por mídia e Já postadas).

Cobre: "Por canal" com um grupo por canal (o "Instagram + WhatsApp" aparece no Story e no WhatsApp Status 1, cada um com o
estado do seu canal; contagens só daquele canal); "Publicado sem confirmação" em texto + ícone; "Consultar resultado" com
retorno visível e carregamento; "Repostar só o WhatsApp" envia a perna certa e informa o horário; "Por mídia" com barra de
ações no topo do card que vale para todos os destinos (Próximo livre no mesmo horário, Postar agora, Cancelar, ▲▼), sem
"Opções do canal" e sem ações nos destinos que estão bem; ações por destino só no erro; miniatura de vídeo sem ícone
quebrado; "Já postadas" com Por mídia/Por canal e filtro Hoje/Ontem/7 dias/Dia e hora; 390 e 1440 sem rolagem horizontal,
alvos ≥ 44 px; axe sem violações graves. Worker simulado (mock.py); nada sai da máquina.

Uso: python3 -m http.server 8793 &  TK_BASE=http://localhost:8793/ python3 tests/postagens_zap_proativo_ui.py
"""
import io, os, sys, tempfile, json
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION, PERMS_ALL, criar_mp4
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

BASE = os.environ.get('TK_BASE', 'http://localhost:8793/')
EVID = Path(__file__).resolve().parent.parent / 'docs' / 'ux' / 'postagens-zap-proativo-20261102'
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


def posts(agora):
    t = agora.replace(second=0, microsecond=0)
    base = {'modo': 'auto', 'legenda': 'Calcinha renda TK-0101', 'link': '', 'criadoPor': 'Ana Lima', 'tentativas': 0, 'erro': '', 'permalink': ''}
    rows = []

    def add(**k):
        r = dict(base); r.update(k); rows.append(r)
    f = lambda n: [{'url': R2 + 'a00000000000000000%02d.jpg' % n, 'tipo': 'imagem'}]
    # 1) Instagram publicado, WhatsApp ainda aguardando a Wafly (não segura o Story).
    add(id=1, origemMidia='m1', tipo='story', canal='ambos', midias=f(1), status='publicado', agendadoEm=iso(t - timedelta(minutes=3)), publicadoEm=iso(t - timedelta(minutes=3)), permalink='https://www.instagram.com/p/FAKE1/',
        zap={'estado': 'aguardando', 'erro': '', 'tentativas': 0, 'consultadoEm': iso(t - timedelta(minutes=1)), 'limiteEm': iso(t + timedelta(minutes=7))})
    # 2) Antigo (como a 916): erro, o WhatsApp segurou o Story.
    add(id=916, origemMidia='m916', tipo='story', canal='ambos', midias=f(2), status='erro', aguardaZap=True, agendadoEm=iso(t - timedelta(hours=2)),
        erro='WhatsApp: a Wafly ainda não confirmou depois de 30 min. Toque em “Consultar resultado” (não reenvia).', zap={'estado': 'antigo', 'erro': '', 'tentativas': 0, 'consultadoEm': '', 'limiteEm': ''})
    # 3) Antigo só WhatsApp 2 (como a 927).
    add(id=927, origemMidia='m927', tipo='story', canal='whatsapp2', midias=f(3), status='erro', aguardaZap=True, agendadoEm=iso(t - timedelta(hours=2)),
        erro='WhatsApp: a Wafly ainda não confirmou depois de 30 min. Toque em “Consultar resultado” (não reenvia).', zap={'estado': 'antigo', 'erro': '', 'tentativas': 0, 'consultadoEm': '', 'limiteEm': ''})
    # 4) Mídia com 3 destinos agendados no mesmo horário.
    for i, c in enumerate(['instagram', 'whatsapp', 'whatsapp2']):
        add(id=40 + i, origemMidia='m4', tipo='story', canal=c, midias=f(4), status='agendado', agendadoEm=iso(t + timedelta(minutes=20)))
    # 5) Vídeo sem pôster (Story + Grupo), agendado depois.
    v = [{'url': R2 + 'v0000000000000000001.mp4', 'tipo': 'video'}]
    add(id=50, origemMidia='m5', tipo='story', canal='instagram', midias=v, status='agendado', agendadoEm=iso(t + timedelta(minutes=40)))
    add(id=51, origemMidia='m5', tipo='story', canal='grupo', midias=v, status='agendado', agendadoEm=iso(t + timedelta(minutes=40)))
    # 6) Reels com erro do Instagram (não é WhatsApp).
    add(id=60, origemMidia='m6', tipo='reels', canal='instagram', midias=v, status='erro', erro='O Instagram recusou o vídeo.', agendadoEm=iso(t + timedelta(minutes=50)))
    # Já postadas
    add(id=70, origemMidia='m7', tipo='story', canal='whatsapp', midias=f(5), status='publicado', agendadoEm=iso(t - timedelta(minutes=30)), publicadoEm=iso(t - timedelta(minutes=30)),
        zap={'estado': 'sem_confirmacao', 'erro': '', 'tentativas': 0, 'consultadoEm': iso(t - timedelta(minutes=20)), 'limiteEm': ''})
    add(id=71, origemMidia='m8', tipo='story', canal='ambos', midias=f(6), status='publicado', agendadoEm=iso(t - timedelta(minutes=50)), publicadoEm=iso(t - timedelta(minutes=50)), permalink='https://www.instagram.com/p/FAKE71/',
        zap={'estado': 'sem_confirmacao', 'erro': '', 'tentativas': 0, 'consultadoEm': '', 'limiteEm': ''})
    add(id=72, origemMidia='m9', tipo='feed', canal='instagram', midias=f(7), status='publicado', agendadoEm=iso(t - timedelta(days=1)), publicadoEm=iso(t - timedelta(days=1)), permalink='https://www.instagram.com/p/FAKE72/')
    return rows


with tempfile.TemporaryDirectory() as temp:
    video = Path(temp) / 'v.mp4'; criar_mp4(str(video), segundos=1); VIDEO = video.read_bytes()
    IMGS = {'a00000000000000000%02d.jpg' % n: jpeg((240 - n * 4, 232, 220), (196, 92 + n * 10, 60)) for n in range(1, 8)}

    def r2(route):
        nome = route.request.url.split('?')[0].rsplit('/', 1)[-1]
        if nome in IMGS: return route.fulfill(body=IMGS[nome], content_type='image/jpeg')
        if nome.endswith('.mp4'): return route.fulfill(body=VIDEO, content_type='video/mp4')
        return route.fulfill(status=404, body='')

    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--no-sandbox'])
        for largura, altura in [(390, 844), (1440, 900)]:
            print('== %d px ==' % largura, flush=True)
            ctx = browser.new_context(viewport={'width': largura, 'height': altura}, device_scale_factor=1, timezone_id='America/Fortaleza')
            ctx.add_init_script(SESSION); ctx.add_init_script('window.TK_POSTAGENS_POLL_MS=60000;')
            st = install(ctx, perms=PERMS_ALL, versao='7.48.3')
            ctx.route('**/m/202611/**', r2)
            g = st['ig']; g['regras'] = True; g['posts'] = posts(datetime.now(timezone.utc))
            consultas, reposts = [], []

            def consultar(route):
                q = json.loads(route.request.post_data); consultas.append(q)
                route.fulfill(json={'ok': True, 'resultado': 'esperando', 'mensagem': 'A Wafly ainda não confirmou (consultado às 18:05; sem resultado ainda). O sistema consulta de novo a cada minuto até 18:12.'})
            ctx.route('**/post/consultar', consultar)

            def repostar(route):
                q = json.loads(route.request.post_data); reposts.append(q)
                route.fulfill(json={'ok': True, 'id': 900 + len(reposts), 'quando': iso(datetime.now(timezone.utc) + timedelta(minutes=65)), 'canal': 'whatsapp'})
            ctx.route('**/post/repostar', repostar)
            dialogos = []
            ctx.on('dialog', lambda d: (dialogos.append(d.message), d.accept()))
            pg = ctx.new_page(); erros = []
            pg.on('pageerror', lambda e: erros.append(str(e)))
            pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(1600)
            pg.click('#details-ferramentas > summary'); pg.click('#btn-abrir-postagens'); pg.wait_for_timeout(400)
            pg.locator('#po-abas [data-aba=fila]').click(); pg.wait_for_timeout(700)

            # ---------- Por canal ----------
            pg.locator('[data-fila-modo=canal]').click(); pg.wait_for_timeout(300)
            for k in ['story', 'status', 'status2', 'grupo', 'reels']:
                if pg.locator('[data-fg="%s"]' % k).count() and pg.locator('[data-fg="%s"]' % k).get_attribute('aria-expanded') != 'true':
                    pg.locator('[data-fg="%s"]' % k).click(); pg.wait_for_timeout(120)
            nomes = pg.evaluate("[...document.querySelectorAll('.po-fg-n')].map(e=>e.textContent)")
            chk('Story' in nomes and 'WhatsApp Status 1' in nomes and 'WhatsApp Status 2' in nomes, 'Por canal: um grupo por canal (Story e WhatsApp Status 1 separados)', nomes)
            chk(pg.locator('[data-fg-sec=story] .po-item[data-id="1"]').count() == 0 and pg.locator('[data-fg-sec=status] .po-item[data-id="1"][data-perna=zap]').count() == 1, '"ambos" com Story publicado: só a perna do WhatsApp continua na Fila')
            chk(pg.locator('[data-fg-sec=story] .po-item[data-id="916"][data-perna=ig]').count() == 1 and pg.locator('[data-fg-sec=status] .po-item[data-id="916"][data-perna=zap]').count() == 1, 'antigo 916 aparece nos dois grupos, cada um com a sua perna')
            story916 = pg.inner_text('[data-fg-sec=story] .po-item[data-id="916"]')
            chk('esperava a confirmação do WhatsApp' in story916 and 'Repostar Story e WhatsApp' in story916 and 'Consultar' not in story916, 'Story da 916: motivo claro e “Repostar Story e WhatsApp”', story916[:300])
            chk(pg.locator('[data-fg-sec=status] .po-item[data-id="916"] [data-a=consultar]').count() == 1, 'WhatsApp da 916: “Consultar resultado” no grupo do Status 1')
            cont = pg.evaluate("Object.fromEntries([...document.querySelectorAll('.po-fg-h')].map(b=>[b.dataset.fg,b.querySelector('.po-fg-c').textContent]))")
            chk(cont.get('story') == '3' and cont.get('status') == '3' and cont.get('status2') == '2', 'contagens só do canal (Story 3, Status 1 3, Status 2 2)', cont)
            chk(pg.locator('[data-fg-sec=status] .po-item[data-id="1"] [data-a=hora], [data-fg-sec=status] .po-item[data-id="1"] [data-a=agora]').count() == 0, 'perna do WhatsApp sem ações de agenda que republicariam o Instagram')
            # Consultar: retorno visível + carregamento
            pg.locator('[data-fg-sec=status] .po-item[data-id="1"] [data-a=consultar]').click(); pg.wait_for_timeout(500)
            aviso = pg.inner_text('.po-aviso') if pg.locator('.po-aviso').count() else ''
            chk(len(consultas) == 1 and 'A Wafly ainda não confirmou (consultado às 18:05' in aviso, 'Consultar resultado mostra o que a Wafly respondeu', aviso)
            # Repostar só o WhatsApp numa perna sem confirmação de "ambos" publicado (vem do Por mídia/histórico); aqui: 927
            b927 = pg.locator('[data-fg-sec=status2] .po-item[data-id="927"] [data-a=repostar]')
            chk(b927.count() == 1, 'antigo 927 oferece Repostar no Status 2')
            b927.click(); pg.wait_for_timeout(500)
            aviso = pg.inner_text('.po-aviso') if pg.locator('.po-aviso').count() else ''
            chk(reposts and reposts[-1]['id'] == 927 and 'próximo horário livre' in aviso and 'ordem' in aviso, 'Repostar agenda no próximo horário livre e informa o horário', aviso)
            chk(any('próximo horário permitido' in d for d in dialogos), 'confirmação de Repostar explica o risco e o horário')
            reels = pg.inner_text('[data-fg-sec=reels] .po-item[data-id="60"]')
            chk('Repostar com novo ID' in reels and 'Postar agora mesmo assim' in reels and 'Descartar' in reels, 'erro do Instagram: Repostar + “Postar agora mesmo assim” (secundário) + Descartar', reels[:200])
            pg.wait_for_timeout(400)
            mini_ok = pg.evaluate("[...document.querySelectorAll('#po-corpo img')].every(i=>!i.complete||i.naturalWidth>0)")
            chk(mini_ok, 'Por canal: nenhuma miniatura quebrada (vídeo sem pôster vira quadro do vídeo)')
            pg.evaluate("document.getElementById('po-corpo').scrollTop=0")
            pg.screenshot(path=str(EVID / ('fila-por-canal-%d.jpg' % largura)), type='jpeg', quality=70)

            # ---------- Por mídia ----------
            pg.locator('[data-fila-modo=midia]').click(); pg.wait_for_timeout(300)
            cards = pg.locator('.po-midia-grupo')
            chk(cards.count() >= 5, 'Por mídia lista as mídias', cards.count())
            def card_de(texto):
                for i in range(cards.count()):
                    if texto in cards.nth(i).inner_text(): return cards.nth(i)
            # mídia m4 (3 destinos agendados): abre e usa a barra
            m4 = None
            for i in range(cards.count()):
                t = cards.nth(i).inner_text()
                if 'Status 2' in t and 'Story' in t and 'Status 1' in t and 'Erro' not in t and 'Confirmando' not in t:
                    m4 = cards.nth(i); break
            chk(m4 is not None, 'card com 3 destinos agendados')
            m4.locator('.po-midia-topo').click(); pg.wait_for_timeout(200)
            chk(m4.locator('.po-mc-bar').count() == 1 and m4.locator('[data-fila-detalhe], summary').count() == 0, 'card aberto: barra de ações no topo e sem “Opções do canal”')
            chk(m4.locator('.po-dest button').count() == 0, 'destinos que estão bem não têm ações')
            chk('Vale para os 3 destinos' in m4.inner_text(), 'barra diz que vale para os 3 destinos')
            alturas = pg.evaluate("[...document.querySelectorAll('.po-mc-bar button')].map(b=>b.getBoundingClientRect().height)")
            chk(alturas and min(alturas) >= 44, 'botões da barra ≥ 44 px', alturas)
            pg.screenshot(path=str(EVID / ('fila-por-midia-barra-%d.jpg' % largura)), type='jpeg', quality=70)
            n0 = len(g['post_chamadas'])
            m4.locator('[data-a=mh-proximo]').click(); pg.wait_for_timeout(700)
            ch = [c for c in g['post_chamadas'][n0:] if c['path'] == '/post/reagendar']
            chk(len(ch) == 3 and len({c['corpo']['quando'] for c in ch}) == 1 and {c['corpo']['id'] for c in ch} == {40, 41, 42}, 'Próximo livre: um toque reagenda os 3 destinos no MESMO horário', ch)
            aviso = pg.inner_text('.po-aviso') if pg.locator('.po-aviso').count() else ''
            chk('nos 3 destinos' in aviso, 'feedback único para todos os destinos', aviso)
            # ▼ desce a mídia inteira (troca horários com a vizinha em todos os destinos)
            n0 = len(g['post_chamadas'])
            bar = pg.locator('.po-midia-grupo.aberto .po-mc-bar').first
            if bar.locator('[data-a=mh-descer]').is_enabled():
                bar.locator('[data-a=mh-descer]').click(); pg.wait_for_timeout(800)
                ch = [c for c in g['post_chamadas'][n0:] if c['path'] == '/post/reagendar']
                chk(len(ch) >= 4 and {40, 41, 42} <= {c['corpo']['id'] for c in ch}, '▼ move a mídia inteira (todas as postagens dela e da vizinha)', ch)
            else:
                chk(False, '▼ habilitado na mídia que não é a última')
            # Postar agora (urgente) e Cancelar: com confirmação, todos os destinos
            aberto = pg.locator('.po-midia-grupo.aberto').first
            n0 = len(g['post_chamadas']); d0 = len(dialogos)
            aberto.locator('[data-a=mh-cancelar]').click(); pg.wait_for_timeout(700)
            ch = [c for c in g['post_chamadas'][n0:] if c['path'] == '/post/cancelar']
            chk(len(dialogos) > d0 and len(ch) == 3, 'Cancelar pede confirmação e cancela os 3 destinos', ch)
            # card do vídeo (m5): Postar agora em todos
            m5 = card_de('Vídeo')
            if m5 is not None:
                if m5.locator('.po-midia-topo').get_attribute('aria-expanded') != 'true': m5.locator('.po-midia-topo').click(); pg.wait_for_timeout(200)
                n0 = len(g['post_chamadas'])
                m5.locator('[data-a=mh-agora]').click(); pg.wait_for_timeout(700)
                ch = [c for c in g['post_chamadas'][n0:] if c['path'] == '/post/reagendar' and c['corpo'].get('quando') == 'agora']
                chk(len(ch) == 2, 'Postar agora (urgente) vale para Story e Grupo da mídia', ch)
            # card do 916: só ações no erro
            c916 = card_de('Sem confirmação')
            chk(c916 is not None, 'chip “Sem confirmação” no card do envio antigo')
            if c916 is not None:
                if c916.locator('.po-midia-topo').get_attribute('aria-expanded') != 'true': c916.locator('.po-midia-topo').click(); pg.wait_for_timeout(200)
                chk(c916.locator('.po-mc-bar').count() == 0 and c916.locator('.po-dest [data-a=repostar]').count() >= 1, 'destino com erro mostra ações; sem barra quando nada está agendado')
            mini_ok = pg.evaluate("[...document.querySelectorAll('.po-midia-grupo img')].every(i=>!i.complete||i.naturalWidth>0)")
            chk(mini_ok, 'Por mídia: nenhuma miniatura quebrada')
            chk(pg.evaluate('document.documentElement.scrollWidth<=innerWidth') and pg.evaluate("(()=>{const c=document.getElementById('po-corpo');return c.scrollWidth<=c.clientWidth+1})()"), 'Fila sem rolagem horizontal em %d' % largura)
            pg.evaluate("document.getElementById('po-corpo').scrollTop=0")
            pg.screenshot(path=str(EVID / ('fila-por-midia-erro-%d.jpg' % largura)), type='jpeg', quality=70)

            # ---------- Já postadas ----------
            pg.locator('#po-abas [data-aba=hist]').click(); pg.wait_for_timeout(500)
            chk(pg.locator('[data-hist-modo=midia]').get_attribute('aria-pressed') == 'true' and pg.locator('[data-hist-modo=canal]').count() == 1, 'Já postadas: Por mídia / Por canal')
            chk(pg.locator('[data-hisp=hoje]').count() == 1 and pg.locator('[data-hisp=ontem]').count() == 1 and pg.locator('[data-hisp="7d"]').count() == 1 and pg.locator('[data-hisp=mais]').count() == 1, 'filtros Todos/Hoje/Ontem/7 dias/Dia e hora')
            chk('Sem confirmação' in pg.inner_text('#po-corpo'), 'chip “Sem confirmação” nas já postadas')
            pg.locator('[data-hisp=ontem]').click(); pg.wait_for_timeout(200)
            chk(pg.locator('.po-midia-grupo').count() == 1 and 'Feed' in pg.inner_text('#po-corpo') or 'Foto' in pg.inner_text('#po-corpo'), 'filtro Ontem mostra só o de ontem')
            pg.locator('[data-hisp=todos]').click(); pg.wait_for_timeout(200)
            pg.locator('[data-hisp=mais]').click(); pg.wait_for_timeout(200)
            chk(pg.locator('[data-hisf=dia]').count() == 1 and pg.locator('[data-hisf=h1]').count() == 1, 'Dia e hora: dia e faixa de horário')
            pg.locator('[data-hisp=mais]').click()
            pg.locator('[data-hist-modo=canal]').click(); pg.wait_for_timeout(300)
            for k in ['story', 'status', 'feed']:
                if pg.locator('[data-fg="h:%s"]' % k).count() and pg.locator('[data-fg="h:%s"]' % k).get_attribute('aria-expanded') != 'true':
                    pg.locator('[data-fg="h:%s"]' % k).click(); pg.wait_for_timeout(120)
            hn = pg.evaluate("[...document.querySelectorAll('.po-fg-n')].map(e=>e.textContent)")
            chk('Story' in hn and 'WhatsApp Status 1' in hn, 'Já postadas por canal: Story e WhatsApp Status 1 separados', hn)
            chk(pg.locator('[data-fg-sec=status] .po-semconf').count() >= 2, '“Publicado sem confirmação” com ícone e texto no histórico')
            chk(pg.locator('[data-fg-sec=status] .po-item[data-id="71"] [data-a=repostar]').inner_text().startswith('Não saiu? Repostar só o WhatsApp'), 'histórico: “Não saiu? Repostar só o WhatsApp”')
            chk(pg.locator('[data-fg-sec=story] .po-item[data-id="71"] a[href*="instagram.com"]').count() == 1, 'histórico mantém “Ver no Instagram”')
            alvos = pg.evaluate("[...document.querySelectorAll('#po-corpo button')].filter(b=>b.offsetParent&&!b.closest('.po-pk')).map(b=>[b.textContent.trim().slice(0,20),Math.round(b.getBoundingClientRect().height)]).filter(x=>x[1]<44)")
            chk(not alvos, 'alvos ≥ 44 px no histórico', alvos)
            chk(pg.evaluate('document.documentElement.scrollWidth<=innerWidth') and pg.evaluate("(()=>{const c=document.getElementById('po-corpo');return c.scrollWidth<=c.clientWidth+1})()"), 'Já postadas sem rolagem horizontal em %d' % largura)
            pg.evaluate("document.getElementById('po-corpo').scrollTop=0")
            pg.screenshot(path=str(EVID / ('ja-postadas-canal-%d.jpg' % largura)), type='jpeg', quality=70)
            pg.locator('[data-fg-sec=status] .po-semconf').first.evaluate("e=>e.closest('.po-item').scrollIntoView({block:'center'})"); pg.wait_for_timeout(150)
            pg.screenshot(path=str(EVID / ('ja-postadas-sem-confirmacao-%d.jpg' % largura)), type='jpeg', quality=70)
            pg.locator('[data-hist-modo=midia]').click(); pg.wait_for_timeout(200)
            pg.locator('.po-midia-topo').first.click(); pg.wait_for_timeout(300)
            pg.screenshot(path=str(EVID / ('ja-postadas-midia-%d.jpg' % largura)), type='jpeg', quality=70)
            pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
            viol = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+': '+v.nodes.map(n=>n.target).join(' '))}")
            chk(not viol, 'axe sem violações graves', viol)
            chk(not erros, 'sem erro de JavaScript', erros)
            ctx.close()
        browser.close()
print('\nOK=%d FALHAS=%d %s' % (len(OKS), len(FALHAS), FALHAS if FALHAS else ''))
sys.exit(1 if FALHAS else 0)
