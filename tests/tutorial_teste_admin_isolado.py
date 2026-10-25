"""Teste do tutorial dentro do admin.html REAL: o `fetchOriginal` que a página guarda no início também fica isolado (nada vai ao servidor de verdade)."""
import os, sys
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import SESSION, install, PERMS_ALL
from playwright.sync_api import sync_playwright
B = os.environ.get("TK_BASE", "http://localhost:8765/")
T = {"id": "n", "titulo": "Cadastro", "descricao": "", "pagina": "index.html", "tipo": "independente", "status": "publicado", "versao": 1, "preparacao": [], "visao": "admin_total",
     "etapas": [{"selector": "#galeria-input", "alvoNome": "Galeria", "acao": "arquivo", "regra": "preenchido", "valor": "", "instrucao": "Adicione fotos", "observacao": "", "erro": ""}]}
html = open(os.path.join(AQUI, '..', 'admin.html'), encoding='utf-8').read()
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 412, "height": 780}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); install(ctx, perms=PERMS_ALL)
    pg = ctx.new_page(); pg.set_default_timeout(9000)
    pg.route("**/index.html?tutorial_teste=1", lambda r: r.fulfill(status=200, content_type='text/html', body=html.replace('<head>', '<head><base href="' + B + '">', 1)))
    pg.goto(B + "404.html"); pg.evaluate("document.body.innerHTML='<div id=\"tut-aluno-slot\"></div>';window.TMV={init:function(){}}")
    pg.add_script_tag(url=B + "tutorial-app.js")
    pg.evaluate("""t=>{TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[t]}:{ok:true},toast:()=>{}});TKTutorial.montarAluno();}""", T)
    pg.get_by_role("button", name="Começar atividade").click()
    fr = None
    for _ in range(40):
        fr = pg.frame(url=lambda u: 'tutorial_teste=1' in u)
        if fr and fr.evaluate("typeof fetchOriginal") == 'function': break
        pg.wait_for_timeout(250)
    r = fr.evaluate("fetchOriginal('https://alvo-real.invalid/x',{method:'POST',body:'{}'}).then(r=>r.json())")
    assert r.get('simulado') is True, r
    b.close()
print("tutorial_teste_admin_isolado: OK")
