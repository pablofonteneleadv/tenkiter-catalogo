#!/usr/bin/env python3
"""v7.92.0 — Senha nova com mínimo de 8, conferida no próprio campo (pedido do Pablo, 24/11/2026).
O servidor exige 8 desde antes; as telas diziam 4 e só no final recusavam, obrigando a voltar.
Currículo, Minha conta (loja) e cadastro do Treinamento. Simulado (tests/mock.py)."""
import os, sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from mock import install
BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8777/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ("" if c else " — " + str(e)[:300]))
def resp(route, corpo):
    route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(corpo))
def conferir(pg, sel, nome):
    pg.fill(sel, "")
    d = pg.locator(sel + " + .tkc-senha-dica")
    chk(f"{nome}: dica 'Mínimo 8' logo abaixo do campo", d.count() == 1 and "Mínimo 8" in d.inner_text(), d.all_inner_texts())
    pg.fill(sel, "12345")
    chk(f"{nome}: com 5 mostra 'Faltam 3'", "Faltam 3" in d.inner_text() and pg.get_attribute(sel, "aria-invalid") == "true", d.inner_text())
    pg.fill(sel, "12345678")
    chk(f"{nome}: com 8 mostra ✓", "✓" in d.inner_text() and pg.get_attribute(sel, "aria-invalid") == "false", d.inner_text())

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    print("== Currículo: criar senha ==")
    ctx = b.new_context(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True, service_workers="block")
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    def h(route):
        r = route.request
        if "script.google.com" not in r.url or r.method != "POST": return route.fallback()
        a = json.loads(r.post_data or "{}").get("action")
        if a == "curriculo_iniciar": return resp(route, {"ok": True, "modo": "novo"})
        return resp(route, {"ok": True})
    ctx.route("**/*", h)
    pg.goto(BASE + "curriculo.html"); pg.wait_for_selector("#whats0", timeout=15000)
    pg.fill("#whats0", "88999990009"); pg.click("#ok"); pg.wait_for_selector("#senha", timeout=10000)
    chk("texto diz 'Mínimo 8 caracteres'", "Mínimo 8 caracteres" in pg.inner_text("#app"), pg.inner_text("#app")[:300])
    conferir(pg, "#senha", "Currículo")
    pg.fill("#email", "maria@exemplo.com"); pg.fill("#nome", "Maria Silva"); pg.fill("#senha", "1234567"); pg.click("#ok"); pg.wait_for_timeout(400)
    chk("Continuar com 7 caracteres não avança e explica", "8 caracteres" in pg.inner_text("#erro") and pg.locator("#senha").count() == 1, pg.inner_text("#erro"))
    chk("o cursor volta para a senha", pg.evaluate("document.activeElement && document.activeElement.id") == "senha")
    pg.fill("#senha", "12345678"); pg.click("#ok"); pg.wait_for_timeout(500)
    chk("com 8 segue para a próxima etapa", pg.locator("#senha").count() == 0, pg.inner_text("#app")[:120])
    chk("sem erro de JavaScript", not erros, erros); ctx.close()

    print("== Loja: Minha conta > Criar conta ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx, ia=False, versao="4.3")
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2000)
    pg.evaluate("document.getElementById('btn-conta-header').style.display='';document.getElementById('btn-conta-header').click()"); pg.wait_for_timeout(700)
    pg.locator(".conta-abas > button").nth(1).click(); pg.wait_for_selector("#conta-senha", timeout=5000)
    chk("placeholder diz mín. 8", "8" in (pg.get_attribute("#conta-senha", "placeholder") or ""))
    conferir(pg, "#conta-senha", "Minha conta")
    pg.fill("#conta-nome", "Maria"); pg.fill("#conta-whats", "88999990009"); pg.fill("#conta-senha", "1234"); pg.click("#conta-ok"); pg.wait_for_timeout(300)
    chk("Criar conta com 4 explica o mínimo de 8", "8 caracteres" in pg.inner_text("#conta-erro"), pg.inner_text("#conta-erro"))
    chk("sem erro de JavaScript", not erros, erros); ctx.close()

    print("== Treinamento: cadastro ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx, ia=False, versao="4.3")
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "treinamentos.html"); pg.wait_for_timeout(1500); pg.click("#link-cadastro"); pg.wait_for_selector("#cad-senha", timeout=5000)
    conferir(pg, "#cad-senha", "Treinamento")
    pg.fill("#cad-nome", "Bia Souza"); pg.fill("#cad-whats", "88977776666"); pg.fill("#cad-senha", "123456"); pg.click("#cad-btn"); pg.wait_for_timeout(300)
    chk("Cadastrar com 6 explica o mínimo de 8", "8 caracteres" in pg.inner_text("#login-error"), pg.inner_text("#login-error"))
    pg.screenshot(path=str(AQUI / "saida" / "senha_treinamento.png"))
    chk("sem erro de JavaScript", not erros, erros); ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
