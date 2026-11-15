"""v7.82.0 — Gestão avisa o servidor de que a Esteira pode ser aberta em seguida (aquecerEsteira_ em admin.html).
Testa a função como está no admin.html, com sessão e servidor simulados: no máximo uma chamada a cada 4 min, só cabeçalhos de sessão,
nada quando não há sessão, e nunca atrapalha a página."""
import os, re
from pathlib import Path
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).parent
BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8777/")
ok, falhas = 0, []


def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1; print("  ✔ " + nome)
    else: falhas.append(nome); print("  ✘ " + nome + ("" if det is None else " — " + str(det)[:300]))


html = (AQUI.parent / "admin.html").read_text(encoding="utf-8")
ini = html.index("function aquecerEsteira_()")
fim = html.index("  function aplicarPermissoes(usuario)", ini)
FUNCAO = html[ini:fim]
chk("A função existe no admin.html e só é chamada para quem tem a Esteira", "if (podeEst) aquecerEsteira_();" in html)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(service_workers="block")
    chamadas = []
    ctx.route("**/esteira/aquecer", lambda r, _q: (chamadas.append(dict(r.request.headers)), r.fulfill(json={"ok": True})))
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "404.html")
    pg.evaluate("""(f) => { window.INSTAGRAM_URL = 'https://tenkiter-ig.distkrpconfeccoes.workers.dev'; window.getSessao = () => window.__sessao || null; eval(f + '; window.aquecer = aquecerEsteira_;'); }""", FUNCAO)
    pg.evaluate("window.aquecer()"); pg.wait_for_timeout(2200)
    chk("Sem sessão não chama o servidor", len(chamadas) == 0)
    pg.evaluate("window.__sessao = { whatsapp: '88999999999', sessao: 'tk3.teste.sessao' }; sessionStorage.removeItem('tk-aquecer-esteira'); window.aquecer()")
    pg.wait_for_timeout(2200)
    chk("Com sessão chama /esteira/aquecer uma vez, com os cabeçalhos de sessão e nada mais", len(chamadas) == 1 and chamadas[0].get("x-tk-whats") == "88999999999" and chamadas[0].get("x-tk-sessao") == "tk3.teste.sessao", chamadas)
    pg.evaluate("window.aquecer(); window.aquecer()"); pg.wait_for_timeout(2200)
    chk("Chamadas repetidas em menos de 4 min não repetem o pedido", len(chamadas) == 1, len(chamadas))
    pg.evaluate("sessionStorage.setItem('tk-aquecer-esteira', String(Date.now() - 250000)); window.aquecer()"); pg.wait_for_timeout(2200)
    chk("Passados 4 min, aquece de novo", len(chamadas) == 2, len(chamadas))
    # servidor fora do ar não derruba nada
    ctx.unroute("**/esteira/aquecer"); ctx.route("**/esteira/aquecer", lambda r, _q: r.abort())
    pg.evaluate("sessionStorage.removeItem('tk-aquecer-esteira'); window.aquecer()"); pg.wait_for_timeout(2200)
    chk("Falha de rede não gera erro na página", not erros, erros)
    b.close()

print(f"{ok} ok, {len(falhas)} falhas")
print("FALHAS=%d" % len(falhas))
if falhas: raise SystemExit(1)
