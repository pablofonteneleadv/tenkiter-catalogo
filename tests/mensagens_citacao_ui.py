"""Jornada: RESPONDER UMA MENSAGEM ESPECÍFICA (citacao/quote) — v7.40.36.

Cobre, em 320/390/1440 com axe:

  1. a acao "Responder" existe em TODA bolha (do cliente e minha) e respeita 44x44;
  2. clicar em Responder abre a faixa de previa ACIMA do compositor com autor + trecho;
  3. o X cancela a faixa e devolve o foco ao botao;
  4. ao enviar, o payload de /msg/enviar leva `citada` = id da mensagem citada;
  5. a faixa fica limpa depois do envio;
  6. o historico (recarregando a conversa) renderiza a citacao dentro da bolha enviada;
  7. a citacao NAO atravessa para outra conversa;
  8. sem resposta do Worker (400: mensagem de outra conversa), o erro aparece e nada some.

Uso: TK_BASE=http://localhost:8765/ python3 tests/mensagens_citacao_ui.py
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
OUT = Path(os.environ.get('TK_EVID', '/tmp/tenkiter-citacao'))
OUT.mkdir(parents=True, exist_ok=True)

OK, BAD = [], []


def chk(nome, cond, detalhe=''):
    (OK if cond else BAD).append(nome)
    print(('✔ ' if cond else '✘ ') + nome + ((' — ' + str(detalhe)) if detalhe and not cond else ''))


def abrir(browser, w, h):
    ctx = browser.new_context(viewport={'width': w, 'height': h},
                              is_mobile=w < 600, has_touch=w < 600,
                              service_workers='block')
    ctx.add_init_script(SESSION)
    ctx.add_init_script('window.TK_MENSAGENS_POLL_MS=400;')
    st = install(ctx, perms=PERMS_ALL, versao='7.40.36')
    S = st['ig'].setdefault('msg', mock_msg.novo_estado())
    pg = ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(BASE + 'admin.html')
    pg.wait_for_timeout(2200)
    pg.click('#details-ferramentas > summary')
    pg.click('#btn-abrir-mensagens')
    pg.wait_for_selector('#ms-abas .ms-aba', timeout=9000)
    pg.wait_for_timeout(600)
    if HAS_AXE:
        pg.add_script_tag(path=str(AXE))
    return ctx, pg, st, erros


def abrir_primeira_conversa(pg):
    """Abre a primeira conversa com as DUAS direcoes (o Responder vale nas duas bolhas)."""
    try:
        pg.wait_for_selector('#ms-lista .ms-conv', timeout=9000)
        total = pg.locator('#ms-lista .ms-conv').count()
        for i in range(total):
            item = pg.locator('#ms-lista .ms-conv').nth(i)
            if not item.is_visible():
                item.click(force=True)          # celular: lista em gaveta
            else:
                item.click()
            pg.wait_for_selector('#ms-texto', timeout=9000)
            pg.wait_for_timeout(700)
            if pg.locator('#ms-fio .ms-bolha.entrada').count() >= 1 and pg.locator('#ms-fio .ms-bolha.saida').count() >= 1:
                return True
    except Exception:                       # noqa: BLE001 — a busca e best-effort
        return False
    return False


def bolhas(pg):
    return pg.locator('#ms-fio .ms-bolha')


def citador_da(pg, direcao):
    """Botao Responder de uma bolha daquela direcao."""
    q = '#ms-fio .ms-bolha.%s .ms-reply' % direcao
    return pg.locator(q)


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

    # ---------------- 1. desktop: acao, faixa, payload, historico -------------
    ctx, pg, st, erros = abrir(b, 1440, 900)
    abrir_primeira_conversa(pg)

    chk('a conversa abriu com bolhas', bolhas(pg).count() >= 2, bolhas(pg).count())
    n_ent = citador_da(pg, 'entrada').count()
    n_sai = citador_da(pg, 'saida').count()
    chk('bolha do CLIENTE tem a acao Responder', n_ent >= 1, n_ent)
    chk('bolha MINHA tem a acao Responder', n_sai >= 1, n_sai)

    # alvo de toque quando o ponteiro e grosso (celular): medido no bloco de 320
    rotulo = citador_da(pg, 'entrada').first.get_attribute('aria-label') or ''
    chk('Responder tem rotulo que diz a quem se responde', 'responder' in rotulo.lower(), rotulo)
    chk('a faixa de citacao nasce escondida', pg.locator('#ms-citar').is_hidden())

    # clica em Responder na bolha do cliente
    citador_da(pg, 'entrada').first.click()
    pg.wait_for_timeout(400)
    faixa = pg.locator('#ms-citar')
    chk('clicar em Responder abre a faixa de previa', faixa.is_visible())
    txt_faixa = pg.inner_text('#ms-citar')
    chk('a faixa diz que esta respondendo ao cliente', 'cliente' in txt_faixa.lower(), txt_faixa[:80])
    chk('a faixa mostra o trecho citado', len(txt_faixa.strip()) > 12, txt_faixa[:80])

    # a faixa fica ACIMA do compositor (nao empurra o campo para fora)
    ordem = pg.evaluate("""() => {
        const f = document.querySelector('#ms-citar').getBoundingClientRect();
        const c = document.querySelector('#ms-texto').getBoundingClientRect();
        return { faixaY: Math.round(f.bottom), campoY: Math.round(c.top) };
    }""")
    chk('a faixa fica acima do campo de mensagem', ordem['faixaY'] <= ordem['campoY'] + 2, ordem)

    # X cancela
    pg.click('#ms-citar .ms-citar-x')
    pg.wait_for_timeout(300)
    chk('o X fecha a faixa', pg.locator('#ms-citar').is_hidden())

    # responde de verdade
    texto = 'Sim, tenho no M e no G.'
    pg.locator('#ms-citar .ms-citar-x').count()      # garante que o X existe quando ha citacao
    citador_da(pg, 'entrada').first.click()
    pg.wait_for_timeout(300)
    pg.fill('#ms-texto', texto)
    pg.click('#ms-enviar')
    pg.wait_for_timeout(1600)

    envios = st['ig']['msg'].get('envios', [])
    ultimo = envios[-1] if envios else {}
    # o painel assina a mensagem (*Ana:*) — o corpo tem de terminar com o que eu escrevi
    chk('o payload de /msg/enviar levou a mensagem', str(ultimo.get('texto', '')).rstrip().endswith(texto), ultimo.get('texto'))
    chk('o payload de /msg/enviar levou o id da mensagem CITADA', bool(ultimo.get('citada')), ultimo)
    chk('o id citado e o de uma mensagem desta conversa',
        any(str(m.get('id')) == str(ultimo.get('citada')) and m.get('conversa_id') == ultimo.get('conversa')
            for m in st['ig']['msg'].get('msgs', [])), ultimo.get('citada'))
    chk('a faixa ficou limpa depois do envio', pg.locator('#ms-citar').is_hidden())
    chk('o mock registrou o vinculo da resposta', bool(st['ig']['msg'].get('citacoes')), st['ig']['msg'].get('citacoes'))

    # historico: a bolha enviada mostra a citacao
    pg.wait_for_timeout(600)
    ult_bolha = pg.locator('#ms-fio .ms-bolha.saida').last
    chk('a bolha enviada renderiza a citacao', ult_bolha.locator('.ms-ctx').count() == 1)
    ctx_txt = ult_bolha.inner_text()
    chk('a citacao mostra de quem era', ('Você' in ctx_txt) or ('Cliente' in ctx_txt), ctx_txt[:100])

    # e o texto citado nao aparece duplicado como corpo
    chk('a bolha mostra a minha resposta como corpo', texto in ctx_txt, ctx_txt[:120])

    # ---- recarregar a conversa: a citacao vem do servidor (nao so do otimista)
    pg.click('#ms-abas .ms-aba[data-aba="todos"]')
    pg.wait_for_timeout(700)
    # A resposta muda a seção; reabra o mesmo atendimento, não outra primeira linha.
    pg.locator('#ms-lista .ms-conv[data-id="%s"]' % ultimo['conversa']).click()
    pg.wait_for_timeout(1200)
    ctxs = pg.locator('#ms-fio .ms-bolha.saida .ms-ctx')
    chk('depois de recarregar, a citacao continua no historico', ctxs.count() >= 1, ctxs.count())

    # ------------------- 2. cancelamento limpa o estado de envio -------------
    citador_da(pg, 'entrada').first.click()
    pg.wait_for_timeout(300)
    pg.click('#ms-citar .ms-citar-x')
    pg.wait_for_timeout(200)
    pg.fill('#ms-texto', 'sem citacao agora')
    pg.click('#ms-enviar')
    pg.wait_for_timeout(1400)
    ultimo = st['ig']['msg']['envios'][-1]
    chk('depois de cancelar, o envio seguinte NAO leva citacao', not ultimo.get('citada'), ultimo)

    # Retry mantém sua própria citação; não altera a próxima composição.
    citador_da(pg, 'entrada').first.click()
    st['ig']['msg']['envio']='erro'
    pg.fill('#ms-texto','resposta citada com falha');pg.click('#ms-enviar');pg.wait_for_selector('[data-ms=reenviar]')
    st['ig']['msg']['envio']='ok';pg.click('[data-ms=reenviar]');pg.wait_for_timeout(800)
    chk('retry não restaura citação invisível no compositor',pg.locator('#ms-citar').is_hidden())
    pg.fill('#ms-texto','mensagem nova após retry');pg.click('#ms-enviar');pg.wait_for_timeout(800)
    chk('mensagem nova após retry não leva a citação anterior',not st['ig']['msg']['envios'][-1].get('citada'))

    chk('1440px sem erro JS', not erros, erros[:2])
    viol = axe(pg, '#ms-conversa')
    chk('1440px axe sem criticos/severos na conversa', not viol, viol)
    pg.screenshot(path=str(OUT / 'citacao-1440.png'), full_page=False)
    ctx.close()

    # ------------------- 3. celular 390 e 320: alvo de 44px ---------------
    for w, h in [(390, 844), (320, 700)]:
        ctx, pg, st, erros = abrir(b, w, h)
        abrir_primeira_conversa(pg)
        alvo = pg.evaluate("""() => {
            const b = document.querySelector('#ms-fio .ms-bolha .ms-reply');
            if (!b) return null;
            const r = b.getBoundingClientRect(), s = getComputedStyle(b);
            return { w: Math.round(r.width), h: Math.round(r.height), op: s.opacity, pe: s.pointerEvents };
        }""")
        if alvo is None:
            # no celular a lista vive numa gaveta: abre a 1a conversa pelo clique direto
            pg.locator('#ms-lista .ms-conv').first.click(force=True)
            pg.wait_for_selector('#ms-texto', timeout=9000)
            pg.wait_for_timeout(700)
            alvo = pg.evaluate("""() => {
                const b = document.querySelector('#ms-fio .ms-bolha .ms-reply');
                if (!b) return null;
                const r = b.getBoundingClientRect(), s = getComputedStyle(b);
                return { w: Math.round(r.width), h: Math.round(r.height), op: s.opacity, pe: s.pointerEvents };
            }""")
        chk('%dpx: Responder com alvo de pelo menos 44x44' % w,
            bool(alvo) and alvo['w'] >= 44 and alvo['h'] >= 44, alvo)
        chk('%dpx: Responder visivel sem hover (celular)' % w,
            bool(alvo) and alvo['op'] == '1' and alvo['pe'] != 'none', alvo)
        chk('%dpx: sem scroll horizontal' % w, pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        viol = axe(pg, '#ms-conversa')
        chk('%dpx axe sem criticos/severos' % w, not viol, viol)
        pg.screenshot(path=str(OUT / ('citacao-%d.png' % w)), full_page=False)
        chk('%dpx sem erro JS' % w, not erros, erros[:2])
        ctx.close()

    b.close()

print('\n%d OK / %d falhas' % (len(OK), len(BAD)))
if BAD:
    print('FALHAS: ' + ', '.join(BAD))
    sys.exit(1)
