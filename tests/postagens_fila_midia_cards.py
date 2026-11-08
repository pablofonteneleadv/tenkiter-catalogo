"""Fila → Por mídia em cards recolhidos (v7.48.2).

Cobre: cada mídia começa recolhida com miniatura real, tipo, ordem, próximo horário, chips de destino com
estado em texto e autoria; tocar/teclado expande e recolhe; o estado sobrevive à atualização da fila
(polling) e à troca Por mídia ↔ Por canal sem mexer na rolagem; foto e vídeo com miniatura de verdade
(pôster .jpg, ou o próprio quadro do vídeo quando o pôster não existe); placeholder digno quando ainda não
há imagem; Por canal intacto; sem rolagem horizontal; sem erro de JavaScript.

Uso: TK_BASE=http://localhost:8792/ python3 tests/postagens_fila_midia_cards.py
     TK_CAPTURA=antes  ... grava só as capturas (sem conferir), para comparar com a versão anterior.
"""
import io, os, sys, tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mock import install, SESSION, PERMS_ALL, criar_mp4
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

BASE = os.environ.get('TK_BASE', 'http://localhost:8792/')
CAPTURA = os.environ.get('TK_CAPTURA', 'depois')
EVID = Path(__file__).resolve().parent.parent / 'docs' / 'ux' / 'postagens-fila-midia-20261102'
EVID.mkdir(parents=True, exist_ok=True)
R2 = 'https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202611/'
FALHAS = []


def chk(cond, nome):
    if not cond:
        FALHAS.append(nome)
        print('FALHOU:', nome, flush=True)


def jpeg(fundo, roupa):
    """Foto sintética de produto (silhueta de vestido) — nada de foto real de cliente."""
    im = Image.new('RGB', (360, 450), fundo)
    d = ImageDraw.Draw(im)
    d.polygon([(150, 60), (210, 60), (230, 150), (290, 420), (70, 420), (130, 150)], fill=roupa)
    d.ellipse((160, 20, 200, 60), fill=(222, 190, 160))
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=80)
    return b.getvalue()


def iso(dt):
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def fila_ficticia(agora):
    hoje = agora.replace(second=0, microsecond=0)
    t1, t2, t3, t4 = hoje + timedelta(minutes=20), hoje + timedelta(minutes=50), hoje + timedelta(days=1, hours=2), hoje + timedelta(days=2)
    base = {'modo': 'auto', 'legenda': 'Vestido midi em viscose', 'link': 'https://tenkitermodas.com.br/', 'criadoEm': iso(agora - timedelta(hours=1))}
    rows = []

    def add(**k):
        r = dict(base); r.update(k); r['id'] = len(rows) + 1; rows.append(r)
    foto = [{'url': R2 + 'a0000000000000000001.jpg', 'tipo': 'imagem'}]
    # 1) Foto com três destinos (como no print do proprietário): Story enviando, Status 1 e 2 agendados.
    add(origemMidia='foto-vestido', tipo='story', canal='instagram', midias=foto, status='processando', agendadoEm=iso(t1), criadoPor='Ana Lima')
    add(origemMidia='foto-vestido', tipo='story', canal='whatsapp', midias=foto, status='agendado', agendadoEm=iso(t2), criadoPor='Ana Lima')
    add(origemMidia='foto-vestido', tipo='story', canal='whatsapp2', midias=foto, status='agendado', agendadoEm=iso(t2), criadoPor='Ana Lima')
    # 2) Vídeo original em 2 partes, com pôster .jpg no Worker de mídia.
    for canal in ['instagram', 'whatsapp']:
        for parte in [1, 2]:
            add(origemMidia='video-conjunto', serie={'id': 'serie-conj-' + canal, 'ordem': parte, 'total': 2}, tipo='story', canal=canal,
                midias=[{'url': R2 + 'b000000000000000000%d.mp4' % parte, 'tipo': 'video'}], status='agendado', agendadoEm=iso(t3), criadoPor='Bruno Costa')
    # 3) Vídeo do Worker SEM pôster (.jpg 404): a miniatura vem do próprio quadro do vídeo.
    add(origemMidia='video-sem-poster', tipo='reels', canal='instagram', midias=[{'url': R2 + 'c0000000000000000001.mp4', 'tipo': 'video'}], status='erro', erro='O Instagram recusou o vídeo.', agendadoEm=iso(t3), criadoPor='Ana Lima')
    # 4) Vídeo ainda em conversão no servidor: placeholder, nunca quadrado branco.
    add(origemMidia='video-convertendo', tipo='story', canal='whatsapp', midias=[{'url': R2 + 'd0000000000000000001.mp4', 'tipo': 'video'}], status='transcodificando', agendadoEm=iso(t4), criadoPor='Bruno Costa')
    # 5) Carrossel do Cloudinary com três fotos.
    car = [{'url': 'https://res.cloudinary.com/demo/image/upload/car%d.jpg' % n, 'tipo': 'imagem'} for n in (1, 2, 3)]
    add(origemMidia='carrossel-colecao', tipo='carrossel', canal='instagram', midias=car, status='agendado', agendadoEm=iso(t4 + timedelta(hours=1)), criadoPor='Ana Lima')
    # 6) Story manual (falta postar à mão).
    add(origemMidia='foto-manual', tipo='story', canal='instagram', midias=[{'url': R2 + 'e0000000000000000001.jpg', 'tipo': 'imagem'}], status='manual_pendente', agendadoEm=iso(t4 + timedelta(hours=2)), criadoPor='Ana Lima')
    return rows


with tempfile.TemporaryDirectory() as temp:
    video = Path(temp) / 'v.mp4'
    criar_mp4(str(video), segundos=1)
    VIDEO = video.read_bytes()
    IMGS = {
        'a0000000000000000001.jpg': jpeg((240, 232, 220), (196, 92, 60)),
        'b0000000000000000001.jpg': jpeg((228, 236, 240), (40, 70, 120)),
        'e0000000000000000001.jpg': jpeg((236, 240, 228), (90, 120, 60)),
    }
    CLOUD = {'car%d.jpg' % n: jpeg((245, 238, 230), c) for n, c in ((1, (150, 40, 80)), (2, (40, 40, 40)), (3, (200, 160, 60)))}

    def r2(route):
        nome = route.request.url.split('?')[0].rsplit('/', 1)[-1]
        if nome in IMGS:
            return route.fulfill(body=IMGS[nome], content_type='image/jpeg')
        if nome.endswith('.mp4'):
            return route.fulfill(body=VIDEO, content_type='video/mp4')
        return route.fulfill(status=404, body='')

    def cloud(route):
        nome = route.request.url.split('?')[0].rsplit('/', 1)[-1]
        return route.fulfill(body=CLOUD.get(nome, IMGS['a0000000000000000001.jpg']), content_type='image/jpeg')

    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--no-sandbox'])
        for largura, altura in [(390, 844), (1440, 900)]:
            ctx = browser.new_context(viewport={'width': largura, 'height': altura}, device_scale_factor=1)
            ctx.add_init_script(SESSION)
            ctx.add_init_script('window.TK_POSTAGENS_POLL_MS=700;')
            st = install(ctx, perms=PERMS_ALL, versao='7.40.42')
            ctx.route('**/m/202611/**', r2)
            ctx.route('https://res.cloudinary.com/demo/**', cloud)
            g = st['ig']; g['regras'] = True; g['posts'] = fila_ficticia(datetime.now(timezone.utc))
            ctx.on('dialog', lambda d: d.accept())
            pg = ctx.new_page(); erros = []
            pg.on('pageerror', lambda e: erros.append(str(e)))
            pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(1600)
            pg.click('#details-ferramentas > summary'); pg.click('#btn-abrir-postagens'); pg.wait_for_timeout(400)
            pg.locator('#po-abas [data-aba=fila]').click(); pg.wait_for_timeout(900)
            sufixo = '%s-%d' % (CAPTURA, largura)
            pg.screenshot(path=str(EVID / ('fila-midia-%s.jpg' % sufixo)), type='jpeg', quality=70)
            if CAPTURA == 'antes':
                print('captura antes', largura, flush=True); ctx.close(); continue

            cards = pg.locator('.po-midia-grupo')
            chk(cards.count() == 6, '6 mídias originais (foto, vídeo 2 partes, vídeo sem pôster, convertendo, carrossel, manual)')
            botoes = pg.locator('.po-midia-topo')
            chk(all(botoes.nth(i).get_attribute('aria-expanded') == 'false' for i in range(botoes.count())), 'todas as mídias começam recolhidas')
            chk(pg.locator('.po-midia-canal').count() == 0, 'destinos completos só aparecem depois de abrir')
            primeiro = cards.first.inner_text()
            chk('1º' in primeiro and 'Foto' in primeiro and 'Ana Lima' in primeiro, 'card mostra ordem, tipo e autoria: ' + primeiro)
            chk('Story' in primeiro and 'Enviando' in primeiro and 'Status 2' in primeiro, 'chips com destino e estado em texto')
            chk('Próx.' in primeiro or 'próx.' in primeiro, 'card mostra o próximo horário')
            chk('2 partes' in cards.nth(1).inner_text(), 'vídeo original mostra o número de partes')
            chk('Erro' in cards.nth(2).inner_text(), 'erro aparece em texto no chip')
            chk('Carrossel' in cards.nth(4).inner_text() and '3 fotos' in cards.nth(4).inner_text(), 'carrossel mostra quantas fotos')
            chk('Falta postar' in cards.nth(5).inner_text(), 'manual pendente aparece como “Falta postar”')
            # Miniaturas reais.
            pg.wait_for_function("[...document.querySelectorAll('.po-midia-grupo .po-mini img')].every(i=>i.complete)", timeout=8000)
            foto_ok = pg.evaluate("(()=>{const i=document.querySelector('.po-midia-grupo .po-mini img');return i&&i.src.endsWith('a0000000000000000001.jpg')&&i.naturalWidth>0})()")
            chk(foto_ok, 'miniatura da foto tem src válido e carregou')
            poster = pg.evaluate("(()=>{const i=document.querySelectorAll('.po-midia-grupo')[1].querySelector('.po-mini img');return i&&i.src.endsWith('b0000000000000000001.jpg')&&i.naturalWidth>0})()")
            chk(poster, 'vídeo com pôster .jpg mostra o pôster')
            pg.wait_for_function("(()=>{const v=document.querySelectorAll('.po-midia-grupo')[2].querySelector('.po-mini video');return v&&v.readyState>=2})()", timeout=8000)
            chk(True, 'vídeo sem pôster usa o quadro do próprio vídeo')
            proc = cards.nth(3).locator('.po-mini')
            chk('processamento' in (proc.get_attribute('aria-label') or '').lower() and proc.locator('img,video').count() == 0, 'vídeo em conversão mostra placeholder com texto')
            chk(pg.evaluate("[...document.querySelectorAll('.po-midia-grupo .po-mini img')].every(i=>i.naturalWidth>0)"), 'nenhuma miniatura quebrada/vazia')
            car = pg.evaluate("(()=>{const i=document.querySelectorAll('.po-midia-grupo')[4].querySelector('.po-mini img');return i&&/car1\\.jpg$/.test(i.src)&&i.naturalWidth>0})()")
            chk(car, 'carrossel mostra a primeira foto')
            # Alvos ≥ 44 px.
            alturas = pg.evaluate("[...document.querySelectorAll('.po-midia-topo')].map(b=>b.getBoundingClientRect().height)")
            chk(min(alturas) >= 44, 'botão do card ≥ 44 px (%s)' % alturas)
            print('medidas', largura, 'alturas dos cards recolhidos:', [round(x) for x in alturas], 'chips:', pg.evaluate("[...document.querySelectorAll('.po-mc-chip')].map(c=>Math.round(c.getBoundingClientRect().height))")[:3], 'miniatura:', pg.evaluate("(()=>{const r=document.querySelector('.po-mini').getBoundingClientRect();return [r.width,r.height]})()"), flush=True)
            if largura == 390:   # parte de baixo da lista: placeholder, carrossel e Story manual
                cards.nth(3).evaluate("e=>e.scrollIntoView({block:'start'})")
                pg.screenshot(path=str(EVID / ('fila-midia-recolhida-fim-%d.jpg' % largura)), type='jpeg', quality=70)
                pg.evaluate("document.getElementById('po-corpo').scrollTop=0")
            # Toque abre.
            botoes.nth(0).click()
            chk(botoes.nth(0).get_attribute('aria-expanded') == 'true', 'toque abre o card')
            chk(cards.first.locator('.po-midia-canal').count() == 3, 'card aberto lista os 3 destinos')
            chk(cards.first.locator('[data-fila-detalhe]').count() == 0 and cards.first.locator('.po-mc-bar').count() == 1, '7.48.3: sem “Opções do canal”; ações da mídia ficam na barra do card')
            chk(pg.evaluate("document.activeElement&&document.activeElement.classList.contains('po-midia-topo')"), 'foco continua no botão do card')
            # Teclado: Enter abre o segundo, Espaço recolhe.
            botoes.nth(1).focus(); pg.keyboard.press('Enter')
            chk(botoes.nth(1).get_attribute('aria-expanded') == 'true', 'Enter abre pelo teclado')
            chk(cards.nth(1).locator('[data-a=mh-hora]').count() == 1, 'ações do vídeo em partes (Horário) na barra do card aberto')
            pg.keyboard.press('Space')
            chk(botoes.nth(1).get_attribute('aria-expanded') == 'false', 'Espaço recolhe pelo teclado')
            # 7.48.3: reagendar pela barra do card (vale para todos os destinos da mídia).
            canal = cards.first.locator('.po-mc-bar')
            canal.get_by_role('button', name='🕐 Horário').click()
            chk('Novo horário para todos os destinos' in cards.first.inner_text(), 'reagendar pela barra do card continua funcionando')
            cards.first.get_by_role('button', name='Voltar').first.click() if cards.first.get_by_role('button', name='Voltar').count() else None
            # Polling: muda a fila no servidor; o card aberto continua aberto e a rolagem não pula.
            botoes.nth(4).click()
            corpo = pg.locator('#po-corpo')
            pg.evaluate("document.getElementById('po-corpo').scrollTop=180")
            antes = pg.evaluate("document.getElementById('po-corpo').scrollTop")
            g['posts'][0]['status'] = 'publicado'
            pg.wait_for_function("document.querySelector('.po-midia-grupo')&&/Publicado/.test(document.querySelector('.po-midia-grupo').innerText)", timeout=6000)
            chk(botoes.nth(0).get_attribute('aria-expanded') == 'true' and botoes.nth(4).get_attribute('aria-expanded') == 'true', 'atualização da fila preserva cards abertos')
            chk(cards.first.locator('.po-mc-bar').count() == 1, 'atualização preserva a barra de ações do card aberto')
            depois = pg.evaluate("document.getElementById('po-corpo').scrollTop")
            chk(abs(depois - antes) <= 2, 'atualização não pula a rolagem (%s → %s)' % (antes, depois))
            # Por canal intacto e volta preservando.
            pg.locator('[data-fila-modo=canal]').click()
            chk(pg.locator('.po-fg-h').count() >= 3, 'Por canal mostra os grupos por destino')
            if pg.locator('[data-fg=story]').get_attribute('aria-expanded') != 'true':
                pg.locator('[data-fg=story]').click()
            n_story = pg.locator('[data-fg-sec=story] .po-item').count()
            chk(n_story == 2, 'Por canal abre a lista do Story com as 2 partes agendadas (%d)' % n_story)
            chk(pg.evaluate("[...document.querySelectorAll('[data-fg-sec=story] .po-th img')].every(i=>i.getAttribute('src'))"), 'Por canal mantém miniaturas com src')
            pg.locator('[data-fila-modo=midia]').click()
            chk(botoes.nth(0).get_attribute('aria-expanded') == 'true', 'voltar a Por mídia mantém o card aberto')
            # Filtros continuam.
            pg.locator('[data-filp=hoje]').click()
            chk(pg.locator('.po-midia-grupo').count() == 1, 'filtro Hoje deixa só a foto de hoje')
            pg.locator('[data-filp=todos]').click()
            chk(pg.evaluate('document.documentElement.scrollWidth<=innerWidth') and pg.evaluate("(()=>{const c=document.getElementById('po-corpo');return c.scrollWidth<=c.clientWidth+1})()"), 'sem rolagem horizontal em %d' % largura)
            pg.locator('.po-midia-grupo').first.scroll_into_view_if_needed()
            pg.evaluate("document.getElementById('po-corpo').scrollTop=0")
            pg.screenshot(path=str(EVID / ('fila-midia-aberta-%d.jpg' % largura)), type='jpeg', quality=70)
            pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
            viol = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+': '+v.nodes.map(n=>n.target).join(' '))}")
            chk(not viol, 'axe sem violações graves: %s' % viol)
            chk(not erros, 'sem erro de JavaScript: %s' % erros)
            print('OK', largura, flush=True)
            ctx.close()
        browser.close()
print('FALHAS=%d' % len(FALHAS), FALHAS if FALHAS else '')
sys.exit(1 if FALHAS else 0)
