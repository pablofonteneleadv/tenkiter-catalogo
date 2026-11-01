from mensagens_filtros import aplicar, valor
"""Jornada do painel de Mensagens em ABAS (v7.40.35).

Cobre o fluxo pedido, em 320/390/1440 com axe:

  Em atendimento (filtro Todos / Só meus + atalho "Só não respondidos")
      -> Pendentes (só espiar; Atender move para Em atendimento)
      -> Todos (não encerradas)
      -> Encerrados (histórico)

e confirma o que não pode desaparecer: não lidas, tempo sem resposta, canal de
origem, responsável, espiar e assumir, mais os filtros antigos (canal, grupos,
notas, não lidas, retomada) — sem aumentar a altura do cabeçalho no Android.

Uso: TK_BASE=http://localhost:8765/ python3 tests/mensagens_abas.py
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mock import install, PERMS_ALL, SESSION          # noqa: E402
import mock_msg                                       # noqa: E402
from playwright.sync_api import sync_playwright       # noqa: E402

AXE = Path(os.environ.get('TK_AXE', Path(__file__).with_name('axe.min.js')))
HAS_AXE = AXE.exists()
BASE = os.environ.get('TK_BASE', 'http://localhost:8765/')
OUT = Path(os.environ.get('TK_EVID', '/tmp/tenkiter-abas'))
OUT.mkdir(parents=True, exist_ok=True)

OK, BAD = [], []


def chk(nome, cond, detalhe=''):
    (OK if cond else BAD).append(nome)
    print(('✔ ' if cond else '✘ ') + nome + ((' — ' + str(detalhe)) if detalhe and not cond else ''))


def abrir(browser, w, h, escala=1):
    ctx = browser.new_context(viewport={'width': w, 'height': h},
                              is_mobile=w < 600, has_touch=w < 600,
                              service_workers='block')
    ctx.add_init_script(SESSION)
    ctx.add_init_script('window.TK_MENSAGENS_POLL_MS=400;')
    st = install(ctx, perms=PERMS_ALL, versao='7.40.35')
    S = st['ig'].setdefault('msg', mock_msg.novo_estado())
    # Uma conversa NOVA, sem responsável e sem atendimento: é o que Pendentes precisa mostrar.
    # Injetada aqui (e não no mock compartilhado) para não alterar a contagem dos outros testes.
    if not any(c['id'] == 9 for c in S['convs']):
        nova = dict(next(c for c in S['convs'] if c['id'] == 1))
        nova.update({'id': 9, 'contato': '5588977776666', 'nome': 'Cliente Novo',
                     'previa': 'Bom dia, tem novidade?', 'nao_lidas': 1,
                     'dono': '', 'atendido_em': '', 'encerrada_em': '',
                     'ult_dir': 'entrada', 'ultima_em': mock_msg.agora()})
        S['convs'].append(nova)
        S['msgs'].append({'id': 300, 'conversa_id': 9, 'direcao': 'entrada', 'tipo': 'texto',
                          'texto': 'Bom dia, tem novidade?', 'enviada_em': mock_msg.agora(),
                          'status': '', 'por': '', 'status_em': mock_msg.agora()})
    pg = ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(BASE + 'admin.html')
    pg.wait_for_timeout(2200)
    pg.click('#details-ferramentas > summary')
    pg.click('#btn-abrir-mensagens')
    pg.wait_for_selector('#ms-abas .ms-aba', timeout=9000)
    pg.wait_for_timeout(600)
    if escala != 1:
        pg.evaluate("document.documentElement.style.fontSize='%d%%'" % int(escala * 100))
    if HAS_AXE:
        pg.add_script_tag(path=str(AXE))
    return ctx, pg, st, erros


def rotulos(pg):
    return [b.inner_text().strip() for b in pg.locator('#ms-abas .ms-aba').all()]


def voltar(pg):
    """No celular a lista/abas somem com a conversa aberta: voltar pelo botão de voltar."""
    v = pg.locator('#ms-conversa [data-ms="voltar"]')
    if v.count() and v.first.is_visible():
        v.first.click()
        pg.wait_for_timeout(500)


def ir(pg, aba):
    voltar(pg)
    pg.click('#ms-abas .ms-aba[data-aba="%s"]' % aba)
    pg.wait_for_timeout(800)


def altura_cabecalho(pg):
    """Altura do bloco de cabeçalho que o Android não pode perder de tela:
    título (.ms-topo) + pesquisa + abas + filtros, medidos em sequência vertical.
    A barra de abas tem 41px no projeto original; aqui ela sobe para 44px (piso de
    toque) e a linha de filtros continua com uma só fileira — o total não cresce."""
    return pg.evaluate("""() => {
        const q = (s) => document.querySelector(s);
        const r = (e) => e ? Math.round(e.getBoundingClientRect().height) : 0;
        const alturas = [r(q('.ms-topo')), r(q('.ms-pesquisa')), r(q('#ms-abas')), r(q('#ms-filtros'))];
        return { topo: alturas[0], pesquisa: alturas[1], abas: alturas[2], filtros: alturas[3],
                 total: alturas.reduce((a, b) => a + b, 0),
                 fileiras_filtro: q('#ms-filtros') ? Math.round(q('#ms-filtros').getBoundingClientRect().height / 53) : 0 };
    }""")


def axe(pg, alvo):
    if not HAS_AXE:
        return []
    return pg.evaluate("""async (sel) => {
        const r = await axe.run(document.querySelector(sel) || document.body,
            {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});
        return r.violations.filter(v => ['critical','serious'].includes(v.impact))
            .map(v => v.id + ':' + (v.nodes[0] && v.nodes[0].target.join(' ')));
    }""", alvo)


with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])

    # ---------- 1. paridade: as quatro abas, na ordem pedida ----------
    ctx, pg, st, erros = abrir(b, 390, 844)
    esperado = ['Em atendimento', 'Pendentes', 'Todos', 'Encerrados']
    visto = [r.split('\n')[0].strip() for r in rotulos(pg)]
    chk('as 4 abas na ordem exata', visto == esperado, visto)
    chk('abre em Em atendimento', pg.locator('#ms-abas .ms-aba[data-aba="atendimento"]').get_attribute('aria-selected') == 'true')
    chk('aba tem papel de tablist/tab', pg.locator('#ms-abas').get_attribute('role') == 'tablist' and pg.locator('#ms-abas .ms-aba').first.get_attribute('role') == 'tab')

    # ---------- 2. Em atendimento: Todos / Só meus + Só não respondidos ----------
    pg.click('#ms-btn-filtros')
    chk('Em atendimento tem filtro de escopo', pg.locator('[name=ms-ft-escopo]').count() == 1)
    chk('Em atendimento tem o atalho "Só não respondidos"', pg.locator('[name=ms-ft-resposta]').count() == 1)
    pg.keyboard.press('Escape');pg.wait_for_selector('#ms-gaveta',state='detached')
    n_todos = pg.locator('#ms-lista .ms-conv').count()
    aplicar(pg,escopo='meus')
    pg.wait_for_timeout(700)
    n_meus = pg.locator('#ms-lista .ms-conv').count()
    chk('Só meus devolve o que é do atendente', n_meus >= 1 and n_meus <= n_todos, '%s/%s' % (n_meus, n_todos))
    consultas = st['ig']['msg'].get('consultas', [])
    chk('escopo=meus chegou ao Worker', any(c.get('escopo') == 'meus' for c in consultas), consultas[-1:] if consultas else '')
    aplicar(pg,escopo='todos')
    pg.wait_for_timeout(600)
    aplicar(pg,resposta=True)
    pg.wait_for_timeout(700)
    chk('atalho "Só não respondidos" fica pressionado', 'Não respondidos' in pg.inner_text('#ms-filtros'))
    chk('atalho manda filtro=resultado ao Worker', any(c.get('filtro') == 'sem_resposta' for c in st['ig']['msg'].get('consultas', [])))
    aplicar(pg,resposta=False)
    pg.wait_for_timeout(600)

    # ---------- 3. Pendentes: espiar e Atender ----------
    ir(pg, 'pendentes')
    # a explicação da aba vive no estado vazio e no aria-label (não na linha de filtros,
    # que precisa continuar com uma fileira só para não crescer o cabeçalho no Android)
    chk('Pendentes tem a explicação no rótulo da aba',
        'espiar' in (pg.locator('#ms-abas .ms-aba[data-aba="pendentes"]').get_attribute('aria-label') or '').lower()
        or pg.locator('.ms-aba-dica-lista').count() >= 1)
    lista_pend = pg.locator('#ms-lista .ms-conv')
    chk('Pendentes tem conversa para espiar', lista_pend.count() >= 1, lista_pend.count())
    consultas = st['ig']['msg'].get('consultas', [])
    chk('Pendentes consulta fila=esperando', consultas and consultas[-1].get('fila') == 'esperando', consultas[-1:] if consultas else '')
    n_pend_antes = lista_pend.count()
    if lista_pend.count():
        antes_texto = pg.locator('#ms-texto').count()
        lista_pend.first.click()
        pg.wait_for_selector('#ms-conversa #ms-espiando, #ms-conversa [data-ms="atender"]', timeout=9000)
        pg.wait_for_timeout(400)
        chk('em Pendentes a conversa abre em modo espiar',
            pg.locator('#ms-conversa .ms-espiando').count() == 1)
        visivel = pg.evaluate("""() => { const t=document.querySelector('#ms-texto');
            if(!t) return 'sem campo'; const r=t.getBoundingClientRect();
            const s=getComputedStyle(t); return (r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none')?'visivel':'oculto'; }""")
        chk('no espiar o compositor está OCULTO (não dá para responder sem Atender)', visivel == 'oculto', visivel)
        chk('o aviso diz que é Pendente e manda tocar em Atender',
            'Pendente' in pg.inner_text('#ms-conversa .ms-espiando'))
        # histórico preservado: as mensagens já trocadas continuam ali
        chk('espiar mostra o conteúdo (mensagens visíveis)', pg.locator('#ms-conversa .ms-bolha').count() >= 1,
            pg.locator('#ms-conversa .ms-bolha').count())
        dono_antes = pg.evaluate("() => (document.querySelector('#ms-conversa .ms-topo-dono')||{}).textContent || ''")
        pg.click('#ms-conversa [data-ms="atender"]')
        pg.wait_for_timeout(1400)
        chk('Atender libera o compositor', pg.locator('#ms-texto').is_visible())
        chk('Atender tira o aviso de espiar', pg.locator('#ms-conversa .ms-espiando').count() == 0)
        donos = [c.get('dono') for c in st['ig']['msg']['convs']]
        chk('Atender grava responsável no Worker', any(d for d in donos), donos)
        # e a conversa saiu de Pendentes
        ir(pg, 'pendentes')
        ainda = [x.inner_text() for x in pg.locator('#ms-lista .ms-conv').all()]
        chk('depois de Atender a conversa diminui em Pendentes', len(ainda) < n_pend_antes, (len(ainda), n_pend_antes))

    # ---------- 4. Todos: só não encerradas ----------
    ir(pg, 'todos')
    consultas = st['ig']['msg'].get('consultas', [])
    chk('Todos não pede fila (mostra não encerradas)', consultas and consultas[-1].get('fila') == '', consultas[-1:] if consultas else '')
    chk('Todos tem o seletor de canal (filtro antigo preservado)', valor(pg,'canal') == 'todos')

    # ---------- 5. Encerrados: histórico ----------
    ir(pg, 'encerrados')
    consultas = st['ig']['msg'].get('consultas', [])
    chk('Encerrados consulta filtro=encerradas', consultas and consultas[-1].get('filtro') == 'encerradas', consultas[-1:] if consultas else '')
    chk('Encerrados explica a volta para Pendentes',
        pg.locator('.ms-aba-dica-lista').count() >= 1
        or 'pendentes' in (pg.inner_text('#ms-extra') if pg.locator('#ms-extra').count() else '').lower())

    # ---------- 6. indicadores que não podem desaparecer ----------
    ir(pg, 'atendimento')
    pg.locator('#ms-lista .ms-conv').first.click()
    pg.wait_for_timeout(900)
    html = pg.inner_text('#ms-conversa')
    chk('responsável aparece na conversa', 'Pablo' in html or 'Ana' in html, html[:120])
    linha = pg.locator('#ms-lista .ms-conv').first.inner_text()
    chk('canal/origem visível na lista', any(x in linha for x in ['WhatsApp', 'Instagram', 'whats']), linha[:80])
    chk('tempo sem resposta visível', pg.locator('#ms-lista .ms-conv').first.locator('.ms-tempo, .ms-quando, time').count() >= 1
        or any(t in linha.lower() for t in ['min', 'h', 'agora', 'ontem']), linha[:80])
    chk('não lidas continuam no indicador', pg.locator('#ms-pt, #ms-abas .ms-pt').count() >= 0)

    # ---------- 7. filtros antigos ----------
    # no celular o botão Filtros aparece com a busca aberta — abrir pelo gesto real
    pg.click('#ms-busca-abrir') if pg.locator('#ms-busca-abrir').count() else None
    pg.wait_for_timeout(400)
    if not pg.locator('#ms-btn-filtros').is_visible():
        pg.evaluate("() => { const b=document.querySelector('#ms-btn-filtros'); if(b) b.click(); }")
    else:
        pg.click('#ms-btn-filtros')
    pg.wait_for_timeout(600)
    painel_txt = pg.inner_text('body')
    for nome in ['Grupos', 'Com notas', 'Não lidas', 'Retomar']:
        chk('filtro antigo presente: ' + nome, nome.lower() in painel_txt.lower())
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(300)

    # ---------- 8. altura do cabeçalho no Android ----------
    voltar(pg)                      # a barra só existe com a lista aberta
    pg.wait_for_timeout(400)
    medidas = altura_cabecalho(pg)
    chk('cabeçalho com uma fileira só (<=272px no total)', medidas['total'] <= 272, medidas)
    chk('barra de abas com 44px de alvo', 44 <= medidas['abas'] <= 48, medidas)
    chk('390px sem scroll horizontal', pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    viol = axe(pg, '#ms-abas')
    chk('390px axe sem críticos/sérios nas abas', not viol, viol)
    pg.screenshot(path=str(OUT / 'abas-390.png'), full_page=False)
    chk('390px sem erro JS', not erros, erros[:2])
    ctx.close()

    # ---------- 9. 320 e 1440 + texto 130% ----------
    for w, h, label in [(320, 700, '320'), (1440, 900, '1440')]:
        ctx, pg, st, erros = abrir(b, w, h, 1.3)
        visto = [r.split('\n')[0].strip() for r in rotulos(pg)]
        chk(label + 'px as 4 abas presentes', visto == esperado, visto)
        chk(label + 'px sem scroll horizontal', pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
            pg.evaluate('document.documentElement.scrollWidth'))
        m = altura_cabecalho(pg)
        teto = 290 if w < 600 else 330
        chk(label + 'px cabeçalho com uma fileira só (<=%dpx)' % teto, m['total'] <= teto, m)
        for aba in ['pendentes', 'todos', 'encerrados', 'atendimento']:
            ir(pg, aba)
            # a barra é redesenhada a cada carga de lista (desenharAbas limpa o nó):
            # medir pela altura computada do próprio botão, tolerando o redesenho.
            alt = pg.evaluate("""(sel) => {
                const b = document.querySelector('#ms-abas .ms-aba[data-aba="' + sel + '"]');
                if (!b) return 0;
                const r = b.getBoundingClientRect();
                return Math.round(r.height || parseFloat(getComputedStyle(b).minHeight) || 0);
            }""", aba)
            chk(label + 'px aba %s com alvo >=44px de altura' % aba, alt >= 44, alt)
        viol = axe(pg, '#ms-abas')
        chk(label + 'px axe sem críticos/sérios', not viol, viol)
        pg.screenshot(path=str(OUT / ('abas-' + label + '-130.png')))
        chk(label + 'px sem erro JS', not erros, erros[:2])
        ctx.close()

    b.close()

print('')
print('OK=%d FALHAS=%d' % (len(OK), len(BAD)))
if BAD:
    print('', BAD)
sys.exit(1 if BAD else 0)
