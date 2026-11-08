"""v7.57 — Postagens: chave de operação (idLocal) no envio. Tocar de novo depois de erro/timeout SEM confirmação reusa a mesma chave
(o servidor devolve a mesma resposta e não cria outra postagem); a chave só muda quando a pessoa envia algo diferente ou depois de confirmado.
A tela diz "Sem confirmação..." e nunca convida a repetir às cegas. Worker do Instagram simulado (mock.py); 390 px.
Uso: TK_BASE=http://localhost:8765/ python3 tests/postagens_chave_ui.py"""
import sys, os, re
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)[:300]) if (e and not c) else ""))
def corpo(pg): return pg.inner_text("#po-corpo")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", timezone_id="America/Fortaleza")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    st = install(ctx, versao="4.3"); st["midia"]["modo"] = "ok"; g = st["ig"]
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    estado = {"derrubar": 0}
    def rota(route):
        if route.request.method == "POST" and route.request.url.rstrip("/").endswith("/post") and estado["derrubar"] > 0:
            estado["derrubar"] -= 1; return route.abort()      # a rede cai SEM resposta: não se sabe se o servidor recebeu
        return route.fallback()
    pg.route(re.compile(r".*/post$"), rota)
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(700)
    pg.fill("#po-busca", "TK-0003"); pg.wait_for_timeout(300); pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(400); pg.click("[data-tipo=feed]"); pg.wait_for_timeout(1500)

    def envios(): return [x["corpo"] for x in g.get("post_chamadas", []) if x["path"] == "/post"]
    estado["derrubar"] = 1
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
    t = corpo(pg)
    chk("rede caiu: a tela diz 'Sem confirmação' e manda conferir a Fila", "Sem confirmação" in t and "Fila" in t, t[:300])
    chk("a tela não mostra JSON nem código HTTP", "{" not in t and "HTTP" not in t)
    chk("a tela não manda 'tente de novo' às cegas", "Tente de novo" not in t.split("Sem confirmação")[1][:200] if "Sem confirmação" in t else False)
    chk("nenhuma postagem foi criada ainda", len(envios()) == 0)
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
    e = envios()
    chk("segundo toque: chegou 1 envio com chave (idLocal)", len(e) == 1 and re.match(r"^[A-Za-z0-9_-]{8,64}$", str(e[0].get("idLocal", ""))), e)
    primeira = e[0].get("idLocal") if e else None
    chk("o envio foi confirmado (avisa e some o rascunho)", "Enviado" in corpo(pg) or "Já postadas" in pg.inner_text("#po-abas") or len(g["posts"]) >= 1)
    # Chave guardada no aparelho enquanto não há confirmação; limpa depois de confirmar
    chk("chave removida do aparelho depois da confirmação", pg.evaluate("localStorage.getItem('tk_po_envio_v1')") is None)

    # Segundo envio (outra coisa): chave nova; falha, muda a legenda -> chave diferente; falha de novo, mesma legenda -> mesma chave
    pg.click("#po-abas [data-aba=nova]"); pg.wait_for_timeout(500)
    pg.fill("#po-busca", "TK-0004"); pg.wait_for_timeout(300); pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(400); pg.click("[data-tipo=feed]"); pg.wait_for_timeout(1200)
    estado["derrubar"] = 2
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(2000)
    k1 = pg.evaluate("JSON.parse(localStorage.getItem('tk_po_envio_v1')||'null')")
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(2000)
    k2 = pg.evaluate("JSON.parse(localStorage.getItem('tk_po_envio_v1')||'null')")
    chk("duas tentativas sem confirmação reusam a MESMA chave", k1 and k2 and k1["id"] == k2["id"], [k1, k2])
    pg.fill("#po-leg", "Legenda diferente TK-0004"); pg.wait_for_timeout(200)
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
    e = envios()
    chk("enviar algo diferente usa chave NOVA", len(e) == 2 and e[1].get("idLocal") and e[1]["idLocal"] != primeira and e[1]["idLocal"] != k1["id"], [x.get("idLocal") for x in e])
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close(); b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
