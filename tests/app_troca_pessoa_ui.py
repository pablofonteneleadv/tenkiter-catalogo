"""App 2.6 — troca de pessoa no celular (common.js + conta.js). O app (simulado aqui pela ponte TKAndroid) diz quem está usando;
o site guarda o que é da pessoa anterior num pacote só dela, apaga da tela e traz o pacote de quem está usando.
O que é do aparelho fica. Navegador comum (sem a ponte) e app sem pessoas salvas: nada muda. Sem rede real."""
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8777/")
ok, falhas = 0, []
def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1; print("  ✔ " + nome)
    else: falhas.append(nome); print("  ✘ " + nome + ("" if det is None else " — " + str(det)[:300]))

LARA, TALITA = "88999990001", "88999990002"
PAGINA = "<!doctype html><html><head><meta charset=utf-8></head><body><h1>teste</h1><script src='common.js'></script><script src='conta.js'></script></body></html>"
PONTE = """
// o alvo vem de window.name (sobrevive ao recarregar e não entra no localStorage que está sendo testado)
window.__alvo = (window.name || '').indexOf('alvo:') === 0 ? window.name.slice(5) : null;
window.__vistas = [];
if (window.__alvo !== null && window.__alvo !== 'SEM') window.TKAndroid = {
  pessoaAtiva: function () { return window.__alvo; },
  pessoaVista: function (d) { window.__vistas.push(d); },
  trocarPessoa: function () { window.__trocar = 1; },
  versao: function () { return '2.6.0'; }
};
"""

def ler(pg): return pg.evaluate("() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; }")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(service_workers="block")
    ctx.add_init_script(PONTE)
    ctx.route("**/__teste_pessoa.html", lambda r: r.fulfill(status=200, content_type="text/html; charset=utf-8", body=PAGINA))
    ctx.route("**/script.google.com/**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"ok":false}'))
    ctx.route("**/android/latest.json*", lambda r: r.fulfill(status=200, content_type="application/json", body='{"versionName":"2.6.0"}'))
    pg = ctx.new_page(); erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    URL = BASE + "__teste_pessoa.html"
    pg.goto(URL)

    def preparar(estado, alvo):
        pg.evaluate("([e, a]) => { localStorage.clear(); sessionStorage.clear(); for (const k in e) localStorage.setItem(k, e[k]); window.name = 'alvo:' + (a === null ? 'SEM' : a); }", [estado, alvo])
        pg.reload(); pg.wait_for_timeout(300)

    lara_dados = {
        "tm_session": json.dumps({"whatsapp": LARA, "sessao": "tok-lara"}),
        "tk_envios_hist_v1": "[\"envio da Lara\"]",
        "tk-esteira-ultima-aba-v1": "fotos",
        "tenkiter_catalogo_cache_v1": "{\"produtos\":[1]}",
        "tk_app_minimo_v1": "2.6.0",
        "tenkiter_admin_prod_v1": "x" * 5000,
        "tk_cv_rasc_" + LARA: "rascunho",
    }

    print("== Navegador comum e app sem pessoas salvas: nada muda ==")
    preparar(lara_dados, None)
    chk("sem a ponte do app, a sessão e os dados ficam como estão", ler(pg).get("tk_envios_hist_v1") == "[\"envio da Lara\"]" and LARA in ler(pg).get("tm_session", ""))
    preparar(lara_dados, "")
    chk("app sem pessoas salvas ('' na ponte): nada muda", ler(pg).get("tk_envios_hist_v1") == "[\"envio da Lara\"]" and LARA in ler(pg).get("tm_session", ""))

    print("== Lara → Talita ==")
    preparar(lara_dados, json.dumps({"w": TALITA, "s": "tok-talita"}))
    d = ler(pg)
    chk("a sessão passa a ser a da Talita", json.loads(d.get("tm_session", "{}")).get("whatsapp") == TALITA and json.loads(d["tm_session"]).get("sessao") == "tok-talita", d.get("tm_session"))
    chk("o histórico e a última aba da Lara somem da tela", "tk_envios_hist_v1" not in d and "tk-esteira-ultima-aba-v1" not in d, list(d))
    pac = json.loads(d.get("tkp:" + LARA, "{}"))
    chk("ficam guardados no pacote da Lara", pac.get("tk_envios_hist_v1") == "[\"envio da Lara\"]" and pac.get("tk-esteira-ultima-aba-v1") == "fotos", pac)
    chk("o pacote não leva a sessão nem o cache grande de produtos (volta sozinho)", "tm_session" not in pac and "tenkiter_admin_prod_v1" not in pac and "tenkiter_admin_prod_v1" not in d)
    chk("o que é do aparelho fica (catálogo público, versão do app)", d.get("tenkiter_catalogo_cache_v1") == "{\"produtos\":[1]}" and d.get("tk_app_minimo_v1") == "2.6.0")
    chk("o rascunho que já leva o WhatsApp da Lara fica onde está", d.get("tk_cv_rasc_" + LARA) == "rascunho")

    print("== Talita trabalha; volta para a Lara ==")
    pg.evaluate("() => { localStorage.setItem('tk_envios_hist_v1', '[\"envio da Talita\"]'); window.name = 'alvo:' + JSON.stringify({w: '" + LARA + "', s: 'tok-lara-2'}); }")
    pg.reload(); pg.wait_for_timeout(300); d = ler(pg)
    chk("a Lara volta com o histórico dela", d.get("tk_envios_hist_v1") == "[\"envio da Lara\"]" and d.get("tk-esteira-ultima-aba-v1") == "fotos", d.get("tk_envios_hist_v1"))
    chk("a sessão é a que o app guardou para a Lara", json.loads(d["tm_session"]) == {"whatsapp": LARA, "sessao": "tok-lara-2"})
    chk("o pacote da Lara foi usado e apagado; o da Talita está guardado", "tkp:" + LARA not in d and json.loads(d.get("tkp:" + TALITA, "{}")).get("tk_envios_hist_v1") == "[\"envio da Talita\"]")

    print("== Ninguém usando (Sair / Outra pessoa) ==")
    pg.evaluate("() => { window.name = 'alvo:' + JSON.stringify({w: ''}); }"); pg.reload(); pg.wait_for_timeout(300); d = ler(pg)
    chk("sem sessão e sem os dados da Lara na tela", "tm_session" not in d and "tk_envios_hist_v1" not in d and "tkp:" + LARA in d, list(d))

    print("== Mesma pessoa: só atualiza o token, sem mexer nos dados ==")
    preparar(lara_dados, json.dumps({"w": LARA, "s": "tok-lara-renovado"})); d = ler(pg)
    chk("token atualizado e dados intactos", json.loads(d["tm_session"])["sessao"] == "tok-lara-renovado" and d.get("tk_envios_hist_v1") == "[\"envio da Lara\"]" and not any(k.startswith("tkp:") for k in d))

    print("== conta.js conta ao app quem entrou ==")
    preparar(dict(lara_dados, tm_nav_perms=json.dumps({"w": LARA, "p": ["catalogo_admin"], "t": 0})), json.dumps({"w": LARA, "s": "tok-lara"}))
    pg.wait_for_timeout(300)
    vistas = [json.loads(x) for x in pg.evaluate("() => window.__vistas")]
    chk("o app recebe WhatsApp, sessão e direitos", any(v.get("w") == LARA and v.get("s") == "tok-lara" and v.get("perms") == ["catalogo_admin"] for v in vistas), vistas)
    chk("sem erros de JavaScript", not erros, erros)
    b.close()

print(f"\n{ok} ok, {len(falhas)} falhas")
sys.exit(1 if falhas else 0)
