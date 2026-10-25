"""Tutorial: o TESTE nunca grava de verdade (servidor nem fila local) — o clique no passo continua valendo."""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8766/"
TELA = """<script src='common.js'></script><script>window.fetchGuardado=window.fetch.bind(window)</script><button id='salvar' onclick="window.rodou=1">Cadastrar</button>"""
TUT = {"id": "sg", "titulo": "Salvar", "descricao": "", "pagina": "index.html", "status": "publicado", "versao": 1, "preparacao": [],
       "etapas": [{"selector": "#salvar", "alvoNome": "Cadastrar", "acao": "click", "regra": "acao", "valor": "",
                   "instrucao": "Toque em Cadastrar", "observacao": "", "erro": ""}]}
posts = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.on("request", lambda r: posts.append(r.url) if r.method == "POST" and "alvo-real.invalid" in r.url else None)
    page.route("**/index.html?tutorial_teste=1", lambda r: r.fulfill(status=200, content_type="text/html", body=TELA))
    page.route("**/alvo-real.invalid/**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"ok":true,"real":true}'))
    page.goto(BASE + "404.html")
    page.evaluate("document.body.innerHTML='<div id=\"tut-aluno-slot\"></div>';window.TMV={init:function(){}}")
    page.add_script_tag(url=BASE + "tutorial-app.js")
    page.evaluate("""t => { TMV.init({state:()=>({user:{whatsapp:'88',password:'s'}}),
      submit:async p=>p.action==='tutorial_listar'?{ok:true,tutoriais:[t]}:{ok:true},toast:()=>{}});
      TKTutorial.montarAluno(); }""", TUT)
    page.get_by_role("button", name="Começar atividade").click()
    fr = page.frame_locator("#tt-frame")
    fr.locator("#salvar.tk-tut-alvo").wait_for()
    r = fr.locator("#salvar").evaluate("""async () => {
      const f = await (await fetch('https://alvo-real.invalid/exec', {method:'POST', body:'{}'})).json();
      const x = await new Promise(ok => { const q = new XMLHttpRequest(); q.open('POST', 'https://alvo-real.invalid/u'); q.onload = () => ok(JSON.parse(q.responseText)); q.onerror = () => ok({erroRede:true}); q.send('x'); });
      const g = await (await fetch('https://alvo-real.invalid/exec')).json();
      const db = await new Promise(ok => { const q = indexedDB.open('tenkiter_admin_envios_v1', 1); q.onsuccess = () => ok('aberto'); q.onerror = () => ok('erro'); });
      const nomes = await new Promise(ok => { const q = parent.indexedDB.databases().then(l => ok(l.map(d => d.name))); });
      const guardado = await (await window.fetchGuardado('https://alvo-real.invalid/exec', {method:'POST', body:'{}'})).json();
      return {f, x, g, db, nomes, guardado};
    }""")
    assert r["f"].get("simulado") and not r["f"]["ok"], r
    assert r["x"].get("simulado"), r
    assert r["guardado"].get("simulado"), "o fetch guardado pela página no início (como o admin.html faz) também precisa ser isolado: " + str(r)
    assert r["g"].get("real") is True, "leituras (GET) continuam reais"
    assert not posts, f"nenhum POST pode sair da tela de teste: {posts}"
    assert "tenkiter_admin_envios_v1" not in r["nomes"] and any("tutorial_teste_tenkiter_admin_envios_v1" == n for n in r["nomes"]), r["nomes"]
    hist = fr.locator("#salvar").evaluate("() => { localStorage.setItem('tk_envios_hist_v1', '[\"teste\"]'); localStorage.setItem('chave_normal_x', '1'); return [parent.localStorage.getItem('tk_envios_hist_v1'), parent.localStorage.getItem('chave_normal_x'), parent.localStorage.getItem('tutorial_teste_tk_envios_hist_v1')]; }")
    assert hist[0] is None and hist[1] == "1" and hist[2] == '["teste"]', "histórico de envios do teste não pode ir para o histórico real: " + str(hist)
    fr.locator("#salvar").click()
    page.wait_for_function("document.querySelector('#tt-guia').innerText.includes('Tutorial concluído corretamente')")
    browser.close()
print("tutorial_teste_sem_gravar: OK")
