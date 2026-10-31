import os
"""Editor visual do tutorial: reproduz a tela da etapa (cliques anteriores), deixa rolar e TRAVAR o enquadramento; o teste do aluno respeita o que foi travado."""
from playwright.sync_api import sync_playwright
BASE = os.environ.get('TK_BASE', 'http://127.0.0.1:8766/')
PAGINA = """<style>body{font:16px Arial}#sheet{display:none;position:fixed;inset:60px 10px 10px;background:#fff;border:2px solid #333;overflow:auto}#sheet.on{display:block}#fim{margin:40px 0}</style>
<button id='abrir' onclick="document.getElementById('sheet').classList.add('on')">Abrir enquadrar</button>
<div id='sheet'><div style='height:1100px'>conteúdo longo</div><button id='fim'>✔ Usar esta foto</button><div style='height:400px'></div></div>"""
TUT = {"id": "ve", "titulo": "Ver etapa", "pagina": "index.html", "tipo": "independente", "descricao": "", "status": "publicado", "versao": 1, "preparacao": [],
       "etapas": [{"acao": "click", "selector": "#abrir", "alvoNome": "Abrir enquadrar", "instrucao": "Abra o enquadrar", "regra": "acao"},
                  {"acao": "click", "selector": "#fim", "alvoNome": "Usar esta foto", "instrucao": "Toque em Usar esta foto", "regra": "acao"}]}
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 390, 'height': 844}); pg.set_default_timeout(9000)
    for q in ('tutorial_editor=1', 'tutorial_teste=1'):
        pg.route(f'**/index.html?{q}', lambda r: r.fulfill(status=200, content_type='text/html', body=PAGINA))
    pg.goto(BASE + '404.html'); pg.evaluate("document.body.innerHTML='<div id=\"tut-editor-slot\"></div>';window.TMV={init:function(){}};window.__saved=[]")
    pg.add_script_tag(url=BASE + 'tutorial-app.js')
    pg.evaluate("""t => TMV.init({state:()=>({user:{whatsapp:'88',password:'s'},manuaisList:[]}),toast:()=>{},submit:async p=>{if(p.action==='treinamento_conteudo')return {ok:true,manuais:[]};if(p.action==='tutorial_listar')return {ok:true,tutoriais:[t]};if(p.action==='tutorial_salvar'){window.__saved.push(p.tutorial);return {ok:true,tutorial:p.tutorial}};return {ok:true}}})""", TUT)
    pg.evaluate("TKTutorial.montarEditor()")
    pg.locator('[data-edit="ve"]').click(); pg.locator('[data-ed="1"]').click()      # abre direto na etapa 2 (dentro da janela)
    fr = pg.frame_locator('#tv-frame')
    fr.locator('#sheet.on').wait_for()                                               # a etapa 1 foi reproduzida: a janela está aberta
    pg.wait_for_function("document.querySelector('#tv-status').innerText.includes('pronta')")
    # rolar o contêiner da janela até mostrar o botão onde o autor quer (no meio da tela) e travar
    fr.locator('#fim').scroll_into_view_if_needed()
    fr.locator('#sheet').evaluate("e => e.scrollTop = e.scrollHeight")
    fr.locator('#sheet').evaluate("e => { const f=document.getElementById('fim'); e.scrollTop += f.getBoundingClientRect().top - innerHeight*0.30 }")
    pg.locator('#tv-travar').click()                                                 # botão fixo no topo: não precisa abrir o painel
    assert 'travado' in pg.locator('#tv-status').inner_text().lower()
    pg.locator('#tv-painel').click(); assert 'travado' in pg.locator('#tv-enquadrado').inner_text().lower() and pg.locator('#tv-destravar').is_visible()
    pg.locator('#tv-recolher').click(); pg.locator('#tv-salvar').click(); pg.locator('#tut-salvar').click(); pg.wait_for_function('__saved.length===1')
    e = pg.evaluate("__saved[0].etapas[1].enquadramento")
    assert e and 0.2 < e['alvoY'] < 0.45, e
    # teste do aluno: o botão aparece na altura travada, mesmo sendo o último item de uma janela com rolagem interna
    t2 = pg.evaluate("__saved[0]"); t2['status'] = 'publicado'; t2['visao'] = 'admin_total'
    al = b.new_page(viewport={'width': 390, 'height': 844}); al.set_default_timeout(9000)
    al.route('**/index.html?tutorial_teste=1', lambda r: r.fulfill(status=200, content_type='text/html', body=PAGINA))
    al.goto(BASE + '404.html'); al.evaluate("document.body.innerHTML='<div id=\"tut-aluno-slot\"></div>';window.TMV={init:function(){}}")
    al.add_script_tag(url=BASE + 'tutorial-app.js')
    al.evaluate("""t => { TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[t]}:{ok:true},toast:()=>{}}); TKTutorial.montarAluno(); }""", t2)
    al.get_by_role("button", name="Começar atividade").click()
    teste = al.frame_locator('#tt-frame')
    teste.locator('#abrir.tk-tut-alvo').wait_for(); teste.locator('#abrir').click()
    teste.locator('#fim.tk-tut-alvo').wait_for()
    topo = teste.locator('#fim').evaluate("e => e.getBoundingClientRect().top / innerHeight")
    assert abs(topo - e['alvoY']) < 0.06, (topo, e)
    b.close()
print('tutorial_editor_ver_etapa: OK')

# Etapa que é um LINK (navega a prévia, ex.: barra Gestão): a reprodução não pode entrar em loop.
LINK_PAG = "<a id='ir' href='index.html?tutorial_editor=1&p=2'>Gestão</a><button id='b2'>Cadastrar</button>"
T3 = {"id": "lk", "titulo": "Link", "pagina": "index.html", "tipo": "independente", "descricao": "", "status": "publicado", "versao": 1, "preparacao": [],
      "etapas": [{"acao": "click", "selector": "#ir", "alvoNome": "Gestão", "instrucao": "Toque em Gestão", "regra": "acao"},
                 {"acao": "click", "selector": "#b2", "alvoNome": "Cadastrar", "instrucao": "Toque em Cadastrar", "regra": "acao"}]}
with sync_playwright() as p2:
    b = p2.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 390, 'height': 844}); pg.set_default_timeout(9000)
    cargas = []
    pg.route('**/index.html?tutorial_editor=1*', lambda r: (cargas.append(r.request.url), r.fulfill(status=200, content_type='text/html', body=LINK_PAG)))
    pg.goto(BASE + '404.html'); pg.evaluate("document.body.innerHTML='<div id=\"tut-editor-slot\"></div>';window.TMV={init:function(){}}")
    pg.add_script_tag(url=BASE + 'tutorial-app.js')
    pg.evaluate("""t => TMV.init({state:()=>({user:{whatsapp:'88',password:'s'},manuaisList:[]}),toast:()=>{},submit:async p=>{if(p.action==='treinamento_conteudo')return {ok:true,manuais:[]};if(p.action==='tutorial_listar')return {ok:true,tutoriais:[t]};return {ok:true}}})""", T3)
    pg.evaluate("TKTutorial.montarEditor()")
    pg.locator('[data-edit="lk"]').click(); pg.locator('[data-ed="1"]').click()
    pg.wait_for_function("document.querySelector('#tv-status').innerText.includes('pronta')")
    pg.wait_for_timeout(2500)
    assert len(cargas) <= 3, f"a prévia recarregou {len(cargas)} vezes (loop)"
    assert 'pronta' in pg.locator('#tv-status').inner_text() and 'Montando' not in pg.locator('#tv-status').inner_text()
    b.close()
print('tutorial_editor_ver_etapa (link sem loop): OK')
