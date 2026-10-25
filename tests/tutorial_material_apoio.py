"""Material de apoio da etapa: o editor lista/adiciona/remove arquivos e o aluno vê um único botão discreto que baixa todos de uma vez."""
from playwright.sync_api import sync_playwright
BASE = 'http://127.0.0.1:8766/'
PAGINA = "<input type='file' id='f' multiple><button id='ok'>Salvar</button>"
A = lambda n: {"url": f"https://midia.test/{n}.jpg", "nome": f"{n}.jpg", "tipo": "image/jpeg", "tamanho": 10}
TUT = {"id": "ma", "titulo": "Material", "pagina": "index.html", "tipo": "independente", "descricao": "", "status": "publicado", "versao": 1, "preparacao": [],
       "etapas": [{"acao": "arquivo", "selector": "#f", "alvoNome": "Fotos", "instrucao": "Adicione as fotos", "regra": "preenchido", "arquivo": A('a'), "arquivos": [A('a'), A('b'), A('c')]},
                  {"acao": "click", "selector": "#ok", "alvoNome": "Salvar", "instrucao": "Toque em Salvar", "regra": "acao", "arquivo": A('z')}]}
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 390, 'height': 844}); pg.set_default_timeout(9000)
    pg.route('**/index.html?tutorial_editor=1*', lambda r: r.fulfill(status=200, content_type='text/html', body=PAGINA))
    pg.route('https://midia.test/**', lambda r: r.fulfill(status=200, content_type='image/jpeg', headers={'access-control-allow-origin': '*'}, body=b'x'))
    pg.goto(BASE + '404.html'); pg.evaluate("document.body.innerHTML='<div id=\"tut-editor-slot\"></div>';window.TMV={init:function(){}};window.__saved=[]")
    pg.add_script_tag(url=BASE + 'tutorial-app.js')
    pg.evaluate("""t => TMV.init({state:()=>({user:{whatsapp:'88',password:'s'},manuaisList:[]}),toast:()=>{},submit:async p=>{if(p.action==='treinamento_conteudo')return {ok:true,manuais:[]};if(p.action==='tutorial_listar')return {ok:true,tutoriais:[t]};if(p.action==='tutorial_salvar'){window.__saved.push(p.tutorial);return {ok:true,tutorial:p.tutorial}};return {ok:true}}})""", TUT)
    pg.evaluate("TKTutorial.montarEditor()")
    pg.locator('[data-edit="ma"]').click(); pg.locator('[data-ed="0"]').click()
    pg.locator('#tv-painel').click()
    assert pg.locator('.tv-apoios li').count() == 3
    pg.locator('[data-apoio-rm="1"]').click()                    # apaga o 2º
    assert pg.locator('.tv-apoios li').count() == 2
    pg.locator('#tv-recolher').click(); pg.locator('#tv-salvar').click(); pg.locator('#tut-salvar').click(); pg.wait_for_function('__saved.length===1')
    e = pg.evaluate("__saved[0].etapas[0]")
    assert [a['nome'] for a in e['arquivos']] == ['a.jpg', 'c.jpg'] and e['arquivo']['nome'] == 'a.jpg', e
    # aluno: um botão só, baixa tudo
    t2 = pg.evaluate("__saved[0]"); t2['status'] = 'publicado'; t2['visao'] = 'admin_total'
    al = b.new_page(viewport={'width': 390, 'height': 844}); al.set_default_timeout(9000)
    al.route('**/index.html?tutorial_teste=1', lambda r: r.fulfill(status=200, content_type='text/html', body=PAGINA))
    al.route('https://midia.test/**', lambda r: r.fulfill(status=200, content_type='image/jpeg', headers={'access-control-allow-origin': '*'}, body=b'x'))
    al.goto(BASE + '404.html'); al.evaluate("document.body.innerHTML='<div id=\"tut-aluno-slot\"></div>';window.TMV={init:function(){}}")
    al.add_script_tag(url=BASE + 'tutorial-app.js')
    al.evaluate("""t => { TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[t]}:{ok:true},toast:()=>{}}); TKTutorial.montarAluno(); }""", t2)
    al.get_by_role("button", name="Começar atividade").click()
    al.locator('#tt-baixar-arquivo').wait_for()
    assert al.locator('#tt-baixar-arquivo').count() == 1 and '(2 arquivos)' in al.locator('#tt-baixar-arquivo').inner_text()
    baixados = []
    al.on('download', lambda d: baixados.append(d.suggested_filename))
    al.locator('#tt-baixar-arquivo').click()
    for _ in range(30):
        if len(baixados) >= 2: break
        al.wait_for_timeout(500)
    assert sorted(baixados) == ['a.jpg', 'c.jpg'], baixados
    b.close()
print('tutorial_material_apoio: OK')

# Servidor antigo (Apps Script sem a 3.28) descarta arquivos[]: o editor avisa claramente em vez de perder em silêncio.
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 390, 'height': 844}); pg.set_default_timeout(9000)
    pg.route('**/index.html?tutorial_editor=1*', lambda r: r.fulfill(status=200, content_type='text/html', body=PAGINA))
    pg.route('https://midia.test/**', lambda r: r.fulfill(status=200, content_type='image/jpeg', headers={'access-control-allow-origin': '*'}, body=b'x'))
    pg.goto(BASE + '404.html'); pg.evaluate("document.body.innerHTML='<div id=\"tut-editor-slot\"></div>';window.TMV={init:function(){}};window.__avisos=[]")
    pg.add_script_tag(url=BASE + 'tutorial-app.js')
    pg.evaluate("""t => TMV.init({state:()=>({user:{whatsapp:'88',password:'s'},manuaisList:[]}),toast:m=>window.__avisos.push(m),submit:async p=>{if(p.action==='treinamento_conteudo')return {ok:true,manuais:[]};if(p.action==='tutorial_listar')return {ok:true,tutoriais:[t]};if(p.action==='tutorial_salvar'){const c=JSON.parse(JSON.stringify(p.tutorial));c.etapas.forEach(e=>{delete e.arquivos;delete e.mostrarApoio});return {ok:true,tutorial:c}};return {ok:true}}})""", TUT)
    pg.evaluate("TKTutorial.montarEditor()")
    pg.locator('[data-edit="ma"]').click(); pg.locator('#tut-salvar').click()
    pg.wait_for_function("__avisos.some(a=>a.includes('3.28'))")
    assert 'materiais de apoio' in pg.evaluate("__avisos.join(' ')")
    b.close()
print('tutorial_material_apoio (servidor antigo avisa): OK')
