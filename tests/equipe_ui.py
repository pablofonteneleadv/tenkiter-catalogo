"""Área "Equipe": dúvidas, entendimento explícito, grupos Gestão/Geral e conversa privada.
Servidor da Equipe SIMULADO aqui (estado em memória); login simulado. Nada sai da máquina."""
import json, os, sys
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TK_BASE', 'http://127.0.0.1:8777/')
AQUI = os.path.dirname(os.path.abspath(__file__))
OK, BAD = [], []
def chk(n, c, e=''):
    (OK if c else BAD).append(n); print(('  ✔ ' if c else '  ✘ ') + n + ((' — ' + str(e)[:300]) if (e and not c) else ''), flush=True)

SESSION = "localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999990001',sessao:'tk3.x'}));"

def estado_novo(publica):
    return {'publica': publica, 'lidos': set(), 'assinados': set(), 'duvidas': [], 'duvida_ops': {}, 'tarefas': [{'id': 1, 'titulo': 'Conferir o caixa da manhã', 'detalhe': '', 'para': 'Todas', 'minha': True, 'prazo': '', 'repete': 'diaria', 'criador': 'Karla', 'feita': None, 'atrasada': False},
        {'id': 2, 'titulo': 'Fotografar a chegada da Rose', 'detalhe': '12 peças', 'para': 'Pablo', 'minha': True, 'prazo': '2026-11-26', 'repete': '', 'criador': 'Karla', 'feita': None, 'atrasada': True}], 'msgs': {'geral': [{'id': 1, 'minha': False, 'autor': 'Iara', 'texto': 'Bom dia, equipe!', 'em': '2026-11-27T12:00:00Z'}], 'gestao': []}, 'chamadas': [], 'coms': [
        {'id': 7, 'autor': 'Karla', 'titulo': 'Novo horário de sábado', 'texto': 'A loja abre às 8h.', 'importante': True, 'em': '2026-11-27T12:10:00Z', 'lidos': 1, 'total': 4},
        {'id': 6, 'autor': 'Pablo', 'titulo': 'Fotos dos vestidos novos', 'texto': 'Fotografar no manequim.', 'importante': False, 'em': '2026-11-26T15:00:00Z', 'lidos': 3, 'total': 4}]}

def duvida_fixture(ident=1, sigilo=False, minha=False, estado='nova'):
    return dict(id=ident, autor='88999990001' if minha else '88999990002', autor_nome='Pablo' if minha else 'Iara', texto='Como conferir o tamanho antes de entregar?', sigilo=sigilo, comunicado=None, estado=estado, sala='', gestor_nome='', resposta='', em='2026-11-27T14:00:00Z', minha=minha, podeConversar=False)

def instalar(ctx, st):
    def rota(route):
        req = route.request; u = urlparse(req.url); p = u.path; q = parse_qs(u.query)
        corpo = json.loads(req.post_data or '{}') if req.method == 'POST' else {}
        st['chamadas'].append((req.method, p, corpo))
        J = lambda d, s=200: route.fulfill(status=s, content_type='application/json', body=json.dumps(d))
        if p == '/equipe/inicio':
            coms = [dict(c, lido=(c['id'] in st['lidos']), confirmado=(c['id'] in st['assinados']), assinaturas=1 + int(c['id'] in st['assinados']), duvidaPendente=any(d['minha'] and d['comunicado'] == c['id'] and d['estado'] != 'resolvida' for d in st['duvidas'])) for c in st['coms']]
            salas = ([{'id': 'gestao', 'tipo': 'grupo', 'nome': 'Gestão', 'ultima': None, 'naoLidas': 0}] if st['publica'] else []) + [{'id': 'geral', 'tipo': 'grupo', 'nome': 'Geral (toda a equipe)', 'ultima': {'autor': 'Iara', 'texto': 'Bom dia, equipe!', 'em': '2026-11-27T12:00:00Z'}, 'naoLidas': 1}]
            return J({'ok': True, 'eu': {'whats': '88999990001', 'nome': 'Pablo', 'admin': st['publica'], 'publica': st['publica'], 'gestao': st['publica']}, 'comunicados': coms, 'salas': salas,
                      'pessoas': [{'whats': '88999990002', 'nome': 'Iara'}, {'whats': '88999990003', 'nome': 'Karla'}]})
        if p == '/equipe/tarefas': return J({'ok': True, 'tarefas': st['tarefas'], 'hoje': '2026-11-27'})
        if p == '/equipe/tarefa':
            st['tarefas'].insert(0, {'id': 3, 'titulo': corpo['titulo'], 'detalhe': corpo.get('detalhe', ''), 'para': 'Todas' if corpo['para'] == 'todos' else 'Iara', 'minha': corpo['para'] == 'todos', 'prazo': corpo.get('prazo', ''), 'repete': corpo.get('repete', ''), 'criador': 'Pablo', 'feita': None, 'atrasada': False}); return J({'ok': True, 'id': 3})
        if p == '/equipe/tarefa/feita':
            for t in st['tarefas']:
                if t['id'] == corpo['tarefa']: t['feita'] = None if corpo.get('desfazer') else {'por': 'Pablo', 'em': '2026-11-27T13:20:00Z'}
            return J({'ok': True})
        if p == '/equipe/tarefa/apagar': st['tarefas'] = [t for t in st['tarefas'] if t['id'] != corpo['tarefa']]; return J({'ok': True})
        if p == '/equipe/comunicado/apagar': st['coms'] = [c for c in st['coms'] if c['id'] != corpo['comunicado']]; return J({'ok': True})
        if p == '/equipe/lido':
            if not corpo.get('entendimento') or any(d['minha'] and d['comunicado'] == corpo['comunicado'] and d['estado'] != 'resolvida' for d in st['duvidas']): return J({'ok': False, 'erro': 'Esclareça a dúvida antes de confirmar.'}, 409)
            st['lidos'].add(corpo['comunicado']); st['assinados'].add(corpo['comunicado']); return J({'ok': True})
        if p == '/equipe/comunicado':
            if not st['publica']: return J({'ok': False, 'erro': 'Só quem publica.'}, 403)
            st['coms'].insert(0, {'id': 8, 'autor': 'Pablo', 'titulo': corpo['titulo'], 'texto': corpo['texto'], 'importante': corpo['importante'], 'em': '2026-11-27T13:00:00Z', 'lidos': 0, 'total': 4}); st['lidos'].add(8); return J({'ok': True, 'id': 8})
        if p == '/equipe/leituras': return J({'ok': True, 'leram': [{'nome': 'Iara'}], 'confirmaram': [{'nome': 'Iara', 'em': '2026-11-27T14:00:00Z', 'declaracao': 'Entendi e não tenho dúvidas'}], 'duvidas': [], 'faltam': [{'nome': 'Karla'}, {'nome': 'Lara'}]})
        if p == '/equipe/duvidas':
            if st.get('negar_duvidas'): return J({'ok': False, 'erro': 'Você não tem acesso à Equipe.'}, 403)
            if st.get('falhar_lista'): return J({'ok': False, 'erro': 'Não consegui carregar as dúvidas.'}, 503)
            return J({'ok': True, 'duvidas': [d for d in st['duvidas'] if not d['sigilo'] or d['minha'] or st['publica']]})
        if p == '/equipe/duvida':
            op = corpo.get('opId')
            if op not in st['duvida_ops']:
                ident = max([d['id'] for d in st['duvidas']] + [0]) + 1
                st['duvida_ops'][op] = ident
                st['duvidas'].append(dict(id=ident, autor='88999990001', autor_nome='Pablo', texto=corpo['texto'], sigilo=corpo['sigilo'], comunicado=corpo.get('comunicado'), estado='nova', sala='', gestor_nome='', resposta='', em='2026-11-27T14:00:00Z', minha=True, podeConversar=False))
                st['assinados'].discard(corpo.get('comunicado'))
            if st.pop('falhar_envio', False): return route.abort('failed')
            return J({'ok': True, 'id': st['duvida_ops'][op]})
        if p.startswith('/equipe/duvida/'):
            d = next(d for d in st['duvidas'] if d['id'] == corpo['duvida'])
            if p.endswith('/encaminhar'):
                if corpo['canal'] == 'geral' and d['sigilo']: return J({'ok': False, 'erro': 'Dúvida sigilosa só no privado.'}, 403)
                d.update(estado='em_conversa', sala='geral' if corpo['canal'] == 'geral' else 'p:88999990001:88999990002', gestor_nome='Karla', podeConversar=True)
            elif p.endswith('/responder'): d.update(estado='respondida', resposta=corpo['resposta'])
            elif p.endswith('/entendi'): d['estado'] = 'resolvida'
            elif p.endswith('/reabrir'): d.update(estado='nova', sala='', podeConversar=False)
            return J({'ok': True, 'id': d['id'], 'estado': d['estado'], 'sala': d['sala']})
        if p == '/equipe/lembrar': return J({'ok': True, 'faltam': 2, 'avisados': 2})
        if p == '/equipe/config': return J({'ok': True})
        if p == '/equipe/sala':
            sala = q.get('id', [None])[0] or ('p:88999990001:' + q['com'][0]); depois = int(q.get('depois', ['0'])[0])
            return J({'ok': True, 'sala': sala, 'mensagens': [m for m in st['msgs'].setdefault(sala, []) if m['id'] > depois]})
        if p == '/equipe/mensagem':
            sala = corpo.get('sala') or ('p:88999990001:' + corpo['com']); l = st['msgs'].setdefault(sala, [])
            l.append({'id': 100 + len(l), 'minha': True, 'autor': 'Pablo', 'texto': corpo['texto'], 'em': '2026-11-27T13:05:00Z'}); return J({'ok': True, 'sala': sala, 'id': 100 + len(l)})
        return J({'ok': False, 'erro': 'rota'}, 404)
    ctx.route('**/equipe/**', rota)
    ctx.route('**/script.google.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"ok":false}'))

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--no-sandbox'])
    os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
    for w, h in ((390, 844), (412, 915), (1440, 900)):
        print('== %d px ==' % w)
        ctx = b.new_context(viewport={'width': w, 'height': h}, service_workers='block', timezone_id='America/Fortaleza')
        ctx.add_init_script(SESSION); st = estado_novo(True); instalar(ctx, st)
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(BASE + 'equipe.html'); pg.wait_for_selector('[data-comunicado="7"]')
        pg.wait_for_function("document.querySelector('#eq-aba-tarefas') && document.querySelector('#eq-aba-tarefas').textContent.includes('·')")
        chk(f'{w}: abas Comunicados, Conversas e Tarefas (padrão tk-abas), com contagem', pg.locator('.tk-abas [role=tab]').count() == 3 and 'Comunicados · 2' in pg.inner_text('#eq-aba-comunicados') and 'Conversas · 1' in pg.inner_text('#eq-aba-conversas') and 'Tarefas · 2' in pg.inner_text('#eq-aba-tarefas'), pg.inner_text('.tk-abas'))
        primeiro = pg.locator('article.card').first
        chk(f'{w}: comunicado importante vem primeiro, com confirmação explícita', '📌 Novo horário de sábado' in primeiro.inner_text() and primeiro.locator('button.tk-btn-prim', has_text='Entendi e não tenho dúvidas').count() == 1)
        primeiro.locator('button', has_text='Entendi e não tenho dúvidas').click(); pg.wait_for_selector('[data-comunicado="7"] .lido')
        chk(f'{w}: entendimento explícito enviado e exibido', ('POST', '/equipe/lido', {'comunicado': 7, 'entendimento': True}) in st['chamadas'] and 'Você confirmou que entendeu' in pg.inner_text('[data-comunicado="7"]'))
        chk(f'{w}: gestão vê contagem de entendimento, sem confundir leitura', 'Entendimento confirmado por 2 de 3' in pg.inner_text('[data-comunicado="7"]'), pg.inner_text('[data-comunicado="7"]'))
        pg.locator('[data-comunicado="7"] button', has_text='Quem confirmou').click(); pg.wait_for_function("document.querySelector('[data-comunicado=\"7\"]').textContent.includes('Faltam')")
        chk(f'{w}: assinatura mostra pessoa, declaração, data e quem falta', 'Faltam: Karla, Lara' in pg.inner_text('[data-comunicado="7"]') and 'Iara ·' in pg.inner_text('[data-comunicado="7"]') and 'Entendi e não tenho dúvidas' in pg.inner_text('[data-comunicado="7"]'))
        pg.locator('summary', has_text='Novo comunicado').click()
        pg.fill('input[name=titulo]', 'Reunião amanhã'); pg.fill('textarea[name=texto]', 'Às 8h, antes de abrir.'); pg.check('input[name=importante]')
        pg.locator('button', has_text='Publicar para a equipe').click(); pg.wait_for_selector('[data-comunicado="8"]')
        chk(f'{w}: publicar comunicado importante', any(c[1] == '/equipe/comunicado' and c[2]['importante'] is True and c[2]['titulo'] == 'Reunião amanhã' for c in st['chamadas']))
        chk(f'{w}: a tela não tem mais a lista "Quem publica" (vem das permissões)', pg.locator('summary', has_text='Quem publica').count() == 0)
        pg.on('dialog', lambda d: d.accept())
        pg.locator('[data-comunicado="6"] button', has_text='Excluir').click(); pg.wait_for_selector('[data-comunicado="6"]', state='detached')
        chk(f'{w}: gestão apaga comunicado (com confirmação)', any(c[1] == '/equipe/comunicado/apagar' for c in st['chamadas']))
        pg.click('#eq-aba-tarefas'); pg.wait_for_selector('[data-tarefa="2"]')
        chk(f'{w}: Tarefas: a atrasada vem primeiro, com prazo e "atrasada"', pg.locator('article.tarefa').first.get_attribute('data-tarefa') == '2' and 'atrasada' in pg.inner_text('[data-tarefa="2"]') and 'prazo 26/11/2026' in pg.inner_text('[data-tarefa="2"]'))
        pg.locator('[data-tarefa="1"] input[type=checkbox]').check(); pg.wait_for_function("document.querySelector('[data-tarefa=\"1\"]').textContent.includes('feita por')")
        chk(f'{w}: marcar tarefa como feita mostra quem fez', 'feita por Pablo' in pg.inner_text('[data-tarefa="1"]'))
        pg.locator('summary', has_text='Nova tarefa').click(); pg.fill('input[name=titulo]', 'Arrumar a vitrine'); pg.select_option('select[name=repete]', 'semanal')
        pg.locator('button', has_text='Criar tarefa').click(); pg.wait_for_selector('[data-tarefa="3"]')
        chk(f'{w}: gestão cria tarefa semanal para todas', any(c[1] == '/equipe/tarefa' and c[2]['repete'] == 'semanal' and c[2]['para'] == 'todos' for c in st['chamadas']))
        if w == 390: pg.screenshot(path=os.path.join(AQUI, 'saida', 'equipe_tarefas_390.png'), full_page=True)
        pg.click('#eq-aba-comunicados'); pg.wait_for_selector('[data-comunicado="7"]')
        if w == 390: pg.screenshot(path=os.path.join(AQUI, 'saida', 'equipe_comunicados_390.png'), full_page=True) if os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True) is None else None
        pg.click('#eq-aba-conversas'); pg.wait_for_selector('.sala[data-sala=geral]')
        chk(f'{w}: Conversas: grupos Gestão e Geral em destaque, com não lidas', pg.locator('.sala[data-sala=gestao]').count() == 1 and '1' in pg.inner_text('.sala[data-sala=geral] .tk-selo'))
        pg.click('.sala[data-sala=geral]'); pg.wait_for_selector('.bal')
        chk(f'{w}: abrir o Geral mostra as mensagens com o nome de quem escreveu', 'Iara' in pg.inner_text('.bal') and 'Bom dia, equipe!' in pg.inner_text('.bal'))
        pg.fill('.escrever textarea', 'Bom dia! Hoje chega mercadoria.'); pg.click('.escrever button'); pg.wait_for_selector('.bal.minha')
        chk(f'{w}: enviar mensagem no grupo', any(c[1] == '/equipe/mensagem' and c[2].get('sala') == 'geral' for c in st['chamadas']) and 'Hoje chega mercadoria' in pg.inner_text('.bal.minha'))
        if w == 390: pg.screenshot(path=os.path.join(AQUI, 'saida', 'equipe_grupo_390.png'))
        pg.go_back(); pg.wait_for_selector('.sala[data-sala=geral]')
        chk(f'{w}: Voltar do celular sai da conversa e volta para a lista', pg.locator('.escrever').count() == 0)
        pg.locator('summary', has_text='Conversa privada').click(); pg.locator('details button', has_text='Iara').click(); pg.wait_for_selector('.escrever')
        pg.fill('.escrever textarea', 'me ajuda na vitrine?'); pg.click('.escrever button'); pg.wait_for_selector('.bal.minha')
        chk(f'{w}: conversa privada com uma colega', any(c[1] == '/equipe/mensagem' and c[2].get('com') == '88999990002' for c in st['chamadas']))
        alvos = pg.evaluate("[...document.querySelectorAll('button, summary, textarea')].filter(e=>e.offsetParent).map(e=>e.getBoundingClientRect()).filter(r=>r.height<44||r.width<44).length")
        chk(f'{w}: toques de pelo menos 44 px', alvos == 0, alvos)
        chk(f'{w}: sem rolagem horizontal', pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
        chk(f'{w}: sem erro de JavaScript', not erros, erros)
        ctx.close()
    print('== Funcionária (não publica) ==')
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block'); ctx.add_init_script(SESSION); st = estado_novo(False); instalar(ctx, st)
    pg = ctx.new_page(); pg.goto(BASE + 'equipe.html'); pg.wait_for_selector('[data-comunicado="7"]')
    chk('funcionária não vê "Novo comunicado", "Quem confirmou" nem "Excluir"', pg.locator('summary', has_text='Novo comunicado').count() == 0 and pg.locator('button', has_text='Quem confirmou').count() == 0 and pg.locator('button', has_text='Excluir').count() == 0)
    pg.click('#eq-aba-tarefas'); pg.wait_for_selector('[data-tarefa="1"]')
    chk('funcionária não vê "Nova tarefa" nem "Excluir" nas tarefas', pg.locator('summary', has_text='Nova tarefa').count() == 0 and pg.locator('button', has_text='Excluir').count() == 0)
    pg.click('#eq-aba-conversas'); pg.wait_for_selector('.sala[data-sala=geral]')
    chk('funcionária vê o Geral e não vê a Gestão', pg.locator('.sala[data-sala=gestao]').count() == 0)
    ctx.close()
    print('== Dúvidas: jornada, sigilo, rascunho e assinatura ==')
    for w, h in ((390, 844), (412, 915), (1440, 900)):
        ctx = b.new_context(viewport={'width': w, 'height': h}, service_workers='block', timezone_id='America/Fortaleza')
        ctx.add_init_script(SESSION); st = estado_novo(False); st['lidos'].add(7); instalar(ctx, st)
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(BASE + 'equipe.html'); pg.wait_for_selector('[data-comunicado="7"]'); pg.wait_for_selector('.eq-duvidas')
        chk(f'{w}: leitura antiga não vira assinatura', 'Leitura anterior registrada' in pg.inner_text('[data-comunicado="7"]') and pg.locator('[data-comunicado="7"] button', has_text='Entendi e não tenho dúvidas').count() == 1)
        pg.locator('[data-comunicado="7"] summary', has_text='Tenho uma dúvida').click()
        f = pg.locator('form[data-eq-form="duvida-7"]'); f.locator('textarea').fill('Não entendi como conferir o tamanho.')
        f.locator('input[name=sigilo]').check()
        st['coms'][0]['texto'] = 'Confira a etiqueta antes de entregar.'
        pg.evaluate('TKEquipe.recarregar()')
        chk(f'{w}: atualização mantém pergunta, sigilo e formulário aberto', f.locator('textarea').input_value() == 'Não entendi como conferir o tamanho.' and f.locator('input[name=sigilo]').is_checked() and f.is_visible())
        pg.click('#eq-aba-conversas'); pg.click('#eq-aba-comunicados')
        chk(f'{w}: trocar aba mantém rascunho em memória', f.locator('textarea').input_value() == 'Não entendi como conferir o tamanho.' and f.is_visible())
        st['falhar_envio'] = True
        f.locator('button', has_text='Enviar dúvida').click(); pg.wait_for_function("!document.querySelector('form[data-eq-form=\"duvida-7\"] button').disabled")
        chk(f'{w}: erro de envio preserva texto para tentar de novo', f.locator('textarea').input_value() == 'Não entendi como conferir o tamanho.')
        f.locator('button', has_text='Enviar dúvida').click(); pg.wait_for_selector('[data-duvida="1"]')
        envios = [c[2] for c in st['chamadas'] if c[1] == '/equipe/duvida']
        chk(f'{w}: retry usa mesma operação, sem duplicar dúvida', len(envios) == 2 and envios[0]['opId'] == envios[1]['opId'] and len(st['duvidas']) == 1)
        chk(f'{w}: sigilo visível à autora e entendimento bloqueado enquanto há dúvida', 'Sigilo' in pg.inner_text('[data-duvida="1"]') and pg.locator('[data-comunicado="7"] button', has_text='Entendi e não tenho dúvidas').count() == 0)
        chk(f'{w}: texto e rascunho sigiloso não vão ao armazenamento persistente', 'Não entendi como conferir' not in pg.evaluate('JSON.stringify(localStorage)'))
        st['duvidas'][0].update(estado='em_conversa', sala='p:88999990001:88999990002', gestor_nome='Karla', podeConversar=True)
        pg.evaluate('TKEquipe.recarregar()'); pg.locator('[data-duvida="1"] button', has_text='Ir para conversa').click(); pg.wait_for_selector('.escrever')
        chk(f'{w}: encaminhamento abre conversa com contexto e foco para responder', 'Não entendi como conferir' in pg.inner_text('main') and pg.locator('.escrever textarea').evaluate('(e)=>e===document.activeElement'))
        pg.go_back(); pg.wait_for_selector('[data-duvida="1"]')
        chk(f'{w}: Voltar da conversa retorna à dúvida', pg.locator('.eq-duvidas').count() == 1)
        st['duvidas'][0].update(estado='respondida', resposta='Veja o tamanho na etiqueta e confira com o pedido.')
        pg.evaluate('TKEquipe.recarregar()'); pg.locator('[data-duvida="1"] button', has_text='Ainda tenho dúvida').click()
        pg.wait_for_function("document.querySelector('[data-duvida=\"1\"]').textContent.includes('Aguardando a gestão')")
        chk(f'{w}: pessoa pode dizer que ainda não entendeu', st['duvidas'][0]['estado'] == 'nova' and 7 not in st['assinados'])
        st['duvidas'][0]['estado'] = 'respondida'; pg.evaluate('TKEquipe.recarregar()')
        pg.locator('[data-duvida="1"] button', has_text='Agora entendi').click()
        pg.wait_for_function("document.querySelector('[data-duvida=\"1\"]').textContent.includes('Entendimento confirmado')")
        chk(f'{w}: resolver dúvida não assina comunicado automaticamente', st['duvidas'][0]['estado'] == 'resolvida' and 7 not in st['assinados'])
        pg.locator('[data-comunicado="7"] button', has_text='Entendi e não tenho dúvidas').click(); pg.wait_for_selector('[data-comunicado="7"] .lido')
        chk(f'{w}: pessoa confirma comunicado depois de esclarecer', 7 in st['assinados'])
        chk(f'{w}: jornada de dúvidas sem erro de JavaScript', not erros, erros)
        ctx.close()

        ctx = b.new_context(viewport={'width': w, 'height': h}, service_workers='block', timezone_id='America/Fortaleza')
        ctx.add_init_script(SESSION); st = estado_novo(True)
        st['duvidas'] = [duvida_fixture(1, True), duvida_fixture(2, False)]; instalar(ctx, st)
        pg = ctx.new_page(); pg.goto(BASE + 'equipe.html'); pg.wait_for_selector('[data-duvida="1"]')
        chk(f'{w}: dúvida sigilosa oferece apenas privado à gestão', pg.locator('[data-duvida="1"] button', has_text='Resolver no privado').count() == 1 and pg.locator('[data-duvida="1"] button', has_text='Resolver no Geral').count() == 0)
        pg.locator('[data-duvida="1"] button', has_text='Resolver no privado').click(); pg.wait_for_selector('[data-duvida="1"] summary')
        pg.locator('[data-duvida="1"] summary', has_text='Registrar orientação').click()
        pg.locator('[data-duvida="1"] textarea').fill('Orientação privada sem publicar para colegas.')
        pg.locator('[data-duvida="1"] button', has_text='Enviar orientação').click()
        pg.wait_for_function("document.querySelector('[data-duvida=\"1\"]').textContent.includes('Aguardando confirmar entendimento')")
        chk(f'{w}: gestão orienta mas não confirma pela funcionária', pg.locator('[data-duvida="1"] button', has_text='Agora entendi').count() == 0 and st['duvidas'][0]['estado'] == 'respondida')
        pg.locator('[data-duvida="2"] button', has_text='Resolver no Geral').click()
        pg.wait_for_selector('[data-duvida="2"] summary'); pg.locator('[data-duvida="2"] summary').click()
        chk(f'{w}: resumo público alerta para não copiar conversa privada', 'Toda a equipe verá esta orientação' in pg.inner_text('[data-duvida="2"]'))
        st['duvidas'][0]['estado'] = 'resolvida'; pg.evaluate('TKEquipe.recarregar()')
        pg.locator('[data-duvida="1"] button', has_text='Preparar comunicado').click()
        fc = pg.locator('form[data-eq-form="comunicado"]')
        chk(f'{w}: comunicado derivado de sigilo começa vazio e pede cuidado', fc.locator('textarea').input_value() == '' and 'sem nomes nem detalhes' in fc.inner_text())
        fc.locator('input[name=titulo]').fill('Como conferir o tamanho')
        fc.locator('textarea').fill('Confira a etiqueta e o pedido antes de entregar.')
        dialogos = []; pg.on('dialog', lambda d: (dialogos.append(d.message), d.accept()))
        fc.locator('button', has_text='Publicar para a equipe').click(); pg.wait_for_selector('[data-comunicado="8"]')
        chk(f'{w}: publicação derivada exige revisão explícita e vínculo', bool(dialogos) and 'não identifica' in dialogos[0] and any(c[1] == '/equipe/comunicado' and c[2].get('origemDuvida') == 1 for c in st['chamadas']))
        st['duvidas'][0]['estado'] = 'nova'; pg.evaluate('TKEquipe.recarregar()')
        # Captura sem avisos transitórios; erros não são ocultados.
        pg.wait_for_timeout(6500)
        pg.screenshot(path=os.path.join(AQUI, 'saida', f'equipe_duvidas_{w}.png'), full_page=True)
        alvos = pg.evaluate("[...document.querySelectorAll('button, summary, textarea')].filter(e=>e.offsetParent).map(e=>e.getBoundingClientRect()).filter(r=>r.height<44||r.width<44).length")
        chk(f'{w}: dúvidas com alvos de 44 px e sem rolagem horizontal', alvos == 0 and pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), alvos)
        for largura, altura in ((320, 640), (390, 470)):
            pg.set_viewport_size({'width': largura, 'height': altura}); pg.evaluate("document.documentElement.style.fontSize='130%'")
            chk(f'{w}: dúvidas cabem em {largura}x{altura} com texto 130%', pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
        st['negar_duvidas'] = True; pg.evaluate('TKEquipe.recarregar()')
        chk(f'{w}: acesso revogado limpa conteúdo de dúvidas', pg.locator('[data-duvida]').count() == 0 and 'Como conferir o tamanho antes' not in pg.inner_text('main'))
        ctx.close()

    print('== Visibilidade pública e falha de leitura ==')
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block'); ctx.add_init_script(SESSION); st = estado_novo(False)
    privada = duvida_fixture(1, True); privada['texto'] = 'Segredo que outra colega não pode ver'
    publica = duvida_fixture(2, False, False, 'em_conversa'); publica.update(sala='', podeConversar=False)
    st['duvidas'] = [privada, publica]; instalar(ctx, st); pg = ctx.new_page(); pg.goto(BASE + 'equipe.html'); pg.wait_for_selector('[data-duvida="2"]')
    chk('outra colega vê pública sem receber sigilo nem link da privada', pg.locator('[data-duvida="1"]').count() == 0 and pg.locator('[data-duvida="2"] button', has_text='Ir para conversa').count() == 0 and 'Segredo que outra' not in pg.inner_text('main'))
    st['falhar_lista'] = True; pg.evaluate('TKEquipe.recarregar()')
    chk('falha de leitura oferece tentar de novo sem inventar lista vazia', pg.locator('.eq-duvidas button', has_text='Tentar de novo').count() == 1 and pg.locator('[data-duvida="2"]').count() == 1)
    ctx.close()
    print('== Sem conta ==')
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block'); pg = ctx.new_page(); pg.goto(BASE + 'equipe.html'); pg.wait_for_selector('main .card')
    chk('sem conta: pede para entrar, em português', 'Entre na sua conta' in pg.inner_text('main') and pg.locator('button', has_text='Entrar na minha conta').count() == 1)
    ctx.close(); b.close()
print(f'\nOK={len(OK)} FALHAS={len(BAD)} {BAD}')
sys.exit(1 if BAD else 0)
