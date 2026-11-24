#!/usr/bin/env python3
"""v7.91.0 — Instagram da candidata: limpeza do @ enquanto digita e confirmação pelo Direct da loja (código TK-XXXXXX).
Pedido do Pablo (24/11/2026): muitas escreviam o @ errado. Tudo simulado: Apps Script e Worker são rotas falsas."""
import os, sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from mock import install, SESSION, PERMS_ALL
BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8777/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ("" if c else " — " + str(e)[:300]))
PNG = (AQUI.parent / "icon-192.png").read_bytes()
LOGIN = "if(!sessionStorage.getItem('__ja')){sessionStorage.setItem('__ja','1');localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999990001', sessao:'tk2.cand.ok'}));}"
def resp(route, corpo, st=200):
    route.fulfill(status=st, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(corpo))

def candidata(b, est):
    ctx = b.new_context(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(LOGIN)
    ctx.add_init_script("window.open=function(u){window.__aberto=u;return null};")
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    def h(route):
        r = route.request; u = r.url
        if "/cv/ig" in u:
            est.setdefault("worker", []).append(r.method)
            if r.method == "POST": est["codigos"] = est.get("codigos", 0) + 1; return resp(route, {"ok": True, "codigo": "TK-AB2CD3", "loja": "tenkitermodasceara", "direct": True})
            if est.get("chegou"): return resp(route, {"ok": True, "confirmado": True, "usuario": "maria.certa", "nome": "Maria Silva", "foto": "https://scontent.cdninstagram.com/v/m.jpg", "segue": 1})
            return resp(route, {"ok": True, "confirmado": False})
        if "cdn.fake" in u or "cdninstagram" in u: return route.fulfill(status=200, content_type="image/png", body=PNG)
        if "script.google.com" not in u or r.method != "POST": return route.fallback()
        d = json.loads(r.post_data or "{}"); a = d.get("action"); est.setdefault("acoes", []).append(d)
        if a == "curriculo_retomar": return resp(route, {"ok": True, "nome": "Maria Silva", "whatsapp": "88999990001", "sessao": "tk2.cand.ok", "etapa": est.get("etapa", "Instagram"), "fotoUrl": "https://cdn.fake/f.jpg", "dados": {"Instagram": est.get("ig", "")}})
        if a == "curriculo_instagram": est["ig"] = d.get("instagram", ""); return resp(route, {"ok": True})
        return resp(route, {"ok": True})
    ctx.route("**/*", h)
    return ctx, pg, erros
def h2(pg): return pg.evaluate("(document.querySelector('#app h2')||{}).innerText||''")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    print("== Limpeza do @ enquanto digita ==")
    est = {}
    ctx, pg, erros = candidata(b, est); pg.goto(BASE + "curriculo.html"); pg.wait_for_selector("#insta", timeout=15000)
    for digitado, esperado in (("https://www.instagram.com/Maria.Silva_?igsh=abc", "@maria.silva_"), ("@@maria silva", "@mariasilva"), ("@Mária-Silvã", "@mariasilva")):
        pg.fill("#insta", digitado)  # colar dispara um input só
        chk(f"'{digitado}' vira {esperado}", pg.input_value("#insta") == esperado, pg.input_value("#insta"))
    chk("avisa o que foi arrumado", "Arrumamos" in pg.inner_text("#insta-dica"))
    print("== Confirmação pelo Direct ==")
    pg.fill("#insta", "@maria.errada"); pg.click("#ok"); pg.wait_for_selector("#ig-cod", timeout=10000); pg.wait_for_timeout(600)
    chk("mostra o código grande", pg.inner_text("#ig-cod") == "TK-AB2CD3", pg.inner_text("#ig-cod"))
    pg.click("#ig-abrir"); pg.wait_for_timeout(300)
    chk("abre o Direct da loja", pg.evaluate("window.__aberto") == "https://ig.me/m/tenkitermodasceara", pg.evaluate("window.__aberto"))
    chk("explica: cole e envie, depois volte", "cole e envie" in pg.inner_text("#ig-st"), pg.inner_text("#ig-st"))
    print("== A página recarrega ao voltar do Instagram ==")
    pg.reload(); pg.wait_for_selector("#ig-cod", timeout=15000); pg.wait_for_timeout(500)
    chk("volta para a confirmação com o MESMO código (sem pedir outro)", pg.inner_text("#ig-cod") == "TK-AB2CD3" and est.get("codigos") == 1, [pg.inner_text("#ig-cod"), est.get("codigos")])
    est["chegou"] = True; pg.wait_for_selector("#ig-sim", timeout=12000)
    t = pg.inner_text("#ig-achou")
    chk("o código chegou: mostra o @ verdadeiro, o nome e a foto", "@maria.certa" in t and "Maria Silva" in t and pg.locator("#ig-foto img").count() == 1, t)
    chk("avisa que o digitado era diferente", "@maria.errada" in t, t)
    pg.click("#ig-sim"); pg.wait_for_timeout(800)
    ult = [a for a in est["acoes"] if a.get("action") == "curriculo_instagram"][-1]
    chk("grava no currículo o @ do Instagram com o código", ult.get("instagram") == "@maria.certa" and ult.get("igCodigo") == "TK-AB2CD3", ult)
    chk("segue para as perguntas", h2(pg) == "Vaga e horários", h2(pg))
    chk("código pendente apagado do aparelho", pg.evaluate("localStorage.getItem('tk_cv_igcod_88999990001')") is None)
    chk("sem erro de JavaScript", not erros, erros); ctx.close()
    print("== Não consegue confirmar agora ==")
    est = {}
    ctx, pg, erros = candidata(b, est); pg.goto(BASE + "curriculo.html"); pg.wait_for_selector("#insta", timeout=15000)
    pg.fill("#insta", "@maria"); pg.click("#ok"); pg.wait_for_selector("#ig-depois", timeout=10000)
    pg.click("#ig-depois"); pg.wait_for_timeout(600)
    chk("continua sem confirmar (não trava)", h2(pg) == "Vaga e horários", h2(pg))
    chk("sem erro de JavaScript", not erros, erros); ctx.close()

    print("== RH: selo do Instagram no card ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); install(ctx, perms=PERMS_ALL, versao="4.1", protegido=True)
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    base = {"Status": "Novo", "Criado": "2026-11-22T12:00:00Z", "Etapa": "Enviado", "Historico": ""}
    CVS = [dict(base, CvId="A", Nome="Ana Confirmada", WhatsApp="88999990001", Instagram="@ana", InstagramConfirmado="2026-11-24T10:00:00Z"),
           dict(base, CvId="B", Nome="Bia Digitou", WhatsApp="88999990002", Instagram="@bia")]
    def hh(route):
        r = route.request
        if r.method != "POST": return route.fallback()
        try: a = json.loads(r.post_data or "{}").get("action")
        except Exception: return route.fallback()
        if a == "curriculos_listar": return resp(route, {"ok": True, "curriculos": CVS, "status": ["Novo"], "motivos": []})
        if a == "curriculos_treinamento": return resp(route, {"ok": True, "acessoConferido": True, "leitura": [], "resultados": []})
        return route.fallback()
    pg.route("**/*", hh); pg.goto(BASE + "curriculos.html"); pg.wait_for_selector(".item", timeout=15000)
    tx = [pg.locator(".item").nth(i).locator(".topo").inner_text() for i in range(2)]
    chk("confirmada mostra 'IG ✓'; só digitado mostra 'IG ?'", "IG ✓" in tx[0] and "IG ?" in tx[1], tx)
    pg.locator(".item .topo").first.click(); pg.wait_for_timeout(300)
    chk("detalhe mostra a data da confirmação", "Instagram confirmado em" in pg.locator(".item dl").first.inner_text())
    chk("sem erro de JavaScript", not erros, erros); ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
