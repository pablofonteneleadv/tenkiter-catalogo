"""Etapa de foto: o app lê as fotos e LIMPA o campo de arquivo antes do teste conferir — a etapa deve contar como feita (antes pedia a mesma coisa para sempre)."""
from playwright.sync_api import sync_playwright
BASE = 'http://127.0.0.1:8766/'
PAGINA = """<label id='l' for='f'>📷 Escolher fotos</label><input type='file' id='f' multiple style='display:none'><button id='ok'>Seguir</button><div id='lista'></div>
<script>document.addEventListener('change',function(e){if(e.target.id!=='f')return;var n=e.target.files.length;document.getElementById('lista').textContent=n+' fotos';e.target.value='';},true);</script>"""
TUT = {"id": "al", "titulo": "Fotos", "pagina": "index.html", "tipo": "independente", "descricao": "", "status": "publicado", "versao": 1, "preparacao": [], "visao": "admin_total",
       "etapas": [{"acao": "arquivo", "selector": "#f", "alvoNome": "Fotos", "instrucao": "Adicione 3 fotos", "regra": "preenchido", "erro": "Faça exatamente como foi pedido para continuar."},
                  {"acao": "click", "selector": "#ok", "alvoNome": "Seguir", "instrucao": "Toque em Seguir", "regra": "acao"}]}
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 390, 'height': 844}); pg.set_default_timeout(9000)
    pg.route('**/index.html?tutorial_teste=1', lambda r: r.fulfill(status=200, content_type='text/html', body=PAGINA))
    pg.goto(BASE + '404.html'); pg.evaluate("document.body.innerHTML='<div id=\"tut-aluno-slot\"></div>';window.TMV={init:function(){}}")
    pg.add_script_tag(url=BASE + 'tutorial-app.js')
    pg.evaluate("""t => { TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[t]}:{ok:true},toast:()=>{}}); TKTutorial.montarAluno(); }""", TUT)
    pg.get_by_role("button", name="Começar atividade").click()
    fr = pg.frame_locator('#tt-frame')
    fr.locator('#l.tk-tut-alvo').wait_for(state='attached')
    fr.locator('#f').set_input_files([{'name': f'{i}.jpg', 'mimeType': 'image/jpeg', 'buffer': b'x'} for i in range(3)])
    pg.wait_for_function("document.querySelector('#tt-guia').innerText.includes('Etapa 2')")
    assert 'exatamente' not in pg.locator('#tt-guia').inner_text()
    b.close()
print('tutorial_arquivo_limpo_pelo_app: OK')
