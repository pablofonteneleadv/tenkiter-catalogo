"""Gancho da LISTA RÁPIDA (LISTA_RAPIDA_URL em common.js): desligado por padrão; ligado, o catálogo pega a lista do Worker da Cloudflare e,
se o Worker falhar / demorar / devolver lixo, cai sozinho no Apps Script (a loja nunca fica sem peças).
O common.js é trocado em memória (o arquivo do repositório não muda) para ligar o endereço do Worker de mentira."""
import sys, os, json, time
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
WORKER = "https://tenkiter-og.distkrpconfeccoes.workers.dev/lista.json"
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))

fonte_common = open(os.path.join(os.path.dirname(AQUI), "common.js"), encoding="utf-8").read()
chk("no repositório a lista rápida vem DESLIGADA (LISTA_RAPIDA_URL vazio)", "const LISTA_RAPIDA_URL = '';" in fonte_common)

def cenario(b, nome, worker):
    """worker: 'ok' | 'erro500' | 'lixo' | 'lento' | 'fora' | None (hook desligado). Devolve (cartões, chamadas ao worker, chamadas ao Apps Script, erros JS)"""
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    chamadas = {"worker": 0, "apps": 0}
    lista_worker = [dict(p) for p in prods()[:5]]
    for i, p in enumerate(lista_worker): p["Nome"] = "DO WORKER %d" % (i + 1); p["Status"] = "Ativo"; p["Estoque"] = 5
    if worker:
        def common(route):
            route.fulfill(body=fonte_common.replace("const LISTA_RAPIDA_URL = '';", "const LISTA_RAPIDA_URL = '%s';" % WORKER), content_type="application/javascript")
        pg.route("**/common.js*", common)
        def w(route):
            chamadas["worker"] += 1
            cab = {"Access-Control-Allow-Origin": "*"}
            if worker == "ok": return route.fulfill(json={"ok": True, "produtos": lista_worker}, headers=cab)
            if worker == "erro500": return route.fulfill(status=502, json={"ok": False}, headers=cab)
            if worker == "lixo": return route.fulfill(body="<html>isto não é JSON</html>", content_type="text/html", headers=cab)
            if worker == "vazio": return route.fulfill(json={"ok": True}, headers=cab)
            if worker == "lento": time.sleep(5.2); return route.fulfill(json={"ok": True, "produtos": lista_worker}, headers=cab)
            return route.abort()
        pg.route(WORKER, w)
    def conta(req):
        if "script.google.com" in req.url and "action=list" in req.url: chamadas["apps"] += 1
    pg.on("request", conta)
    t0 = time.time(); pg.goto(BASE + "index.html"); pg.wait_for_timeout(4800 if worker == "lento" else 2200)
    cartoes = pg.evaluate("[...document.querySelectorAll('.card:not(.esqueleto) .nome')].map(e=>e.textContent.trim())")
    ctx.close()
    return cartoes, chamadas, erros

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    print("== Desligado (padrão do repositório) ==")
    c, ch, er = cenario(b, "desligado", None)
    chk("catálogo normal: peças do Apps Script", len(c) >= 10 and not any("DO WORKER" in x for x in c), c[:3])
    chk("busca no Apps Script e não toca no Worker", ch["apps"] >= 1 and ch["worker"] == 0, ch)
    chk("sem erro de JavaScript", not er, er)

    print("== Ligado e funcionando ==")
    c, ch, er = cenario(b, "ok", "ok")
    chk("catálogo mostra a lista que veio do Worker", sorted(c) == ["DO WORKER %d" % i for i in range(1, 6)], c)
    chk("Worker foi consultado", ch["worker"] >= 1, ch)
    chk("sem erro de JavaScript", not er, er)

    for modo, rotulo in (("erro500", "Worker responde erro 502"), ("lixo", "Worker devolve algo que não é JSON"), ("vazio", "Worker devolve JSON sem a lista"), ("fora", "Worker fora do ar (conexão cai)")):
        print("== " + rotulo + " ==")
        c, ch, er = cenario(b, modo, modo)
        chk("cai no Apps Script e mostra as peças da loja", len(c) >= 10 and not any("DO WORKER" in x for x in c), c[:3])
        chk("tentou o Worker e depois o Apps Script", ch["worker"] >= 1 and ch["apps"] >= 1, ch)
        chk("sem erro de JavaScript", not er, er)

    print("== Worker lento (mais de 3,5 s) ==")
    c, ch, er = cenario(b, "lento", "lento")
    chk("desiste do Worker em 3,5 s e usa o Apps Script", len(c) >= 10 and not any("DO WORKER" in x for x in c), c[:3])
    chk("sem erro de JavaScript", not er, er)
    b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD)
sys.exit(1 if BAD else 0)
