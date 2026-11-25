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
        if a == "curriculo_retomar": return resp(route, {"ok": True, "nome": "Maria Silva", "whatsapp": "88999990001", "sessao": "tk2.cand.ok", "etapa": est.get("etapa", "Instagram"), "fotoUrl": "https://cdn.fake/f.jpg", "dados": {"Instagram": est.get("ig", "")}, "perfil": {"altura": "1,65", "peso": "60", "cep": "63700-000", "endereco": "Rua A, 1", "bairro": "Centro", "cidade": "Crateús", "estado": "CE"}})
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
    pg.fill("#insta", "@maria.errada"); pg.click("#ig-direct"); pg.wait_for_selector("#ig-cod", timeout=10000); pg.wait_for_timeout(600)
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
    print("== Confirmar com um toque (sem Direct) ==")
    est = {}
    ctx, pg, erros = candidata(b, est); pg.goto(BASE + "curriculo.html"); pg.wait_for_selector("#insta", timeout=15000)
    pg.fill("#insta", "@Maria.Silva")
    chk("mostra o link para abrir o próprio perfil", pg.get_attribute("#ig-ver", "href") == "https://www.instagram.com/maria.silva/" and pg.locator("#ig-conf").is_visible(), pg.get_attribute("#ig-ver", "href"))
    chk("botão principal é 'É o meu Instagram'", "É o meu Instagram" in pg.inner_text("#ok"))
    pg.click("#ok"); pg.wait_for_timeout(800)
    ult = [a for a in est["acoes"] if a.get("action") == "curriculo_instagram"][-1]
    chk("grava o @ com a confirmação da própria candidata", ult.get("instagram") == "@maria.silva" and ult.get("euConfirmo") is True and not ult.get("igCodigo"), ult)
    chk("segue sem passar pelo Direct", h2(pg) == "Vaga e horários" and est.get("codigos") is None, [h2(pg), est.get("codigos")])
    chk("sem erro de JavaScript", not erros, erros); ctx.close()
    print("== Do Direct dá para voltar e confirmar com um toque ==")
    est = {}
    ctx, pg, erros = candidata(b, est); pg.goto(BASE + "curriculo.html"); pg.wait_for_selector("#insta", timeout=15000)
    pg.fill("#insta", "@maria"); pg.click("#ig-direct"); pg.wait_for_selector("#ig-voltar", timeout=10000)
    pg.click("#ig-voltar"); pg.wait_for_selector("#insta", timeout=5000)
    chk("voltou para a tela do @ com o que tinha digitado", pg.input_value("#insta") == "@maria", pg.input_value("#insta"))
    chk("sem erro de JavaScript", not erros, erros); ctx.close()

    print("== RH: selo do Instagram no card ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); install(ctx, perms=PERMS_ALL, versao="4.1", protegido=True)
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    base = {"Status": "Novo", "Criado": "2026-11-22T12:00:00Z", "Etapa": "Enviado", "Historico": ""}
    CVS = [dict(base, CvId="A", Nome="Ana Confirmada", WhatsApp="88999990001", Instagram="@ana", InstagramConfirmado="2026-11-24T10:00:00Z"),
           dict(base, CvId="B", Nome="Bia Digitou", WhatsApp="88999990002", Instagram="@bia"),
           dict(base, CvId="C", Nome="Cris Direct", WhatsApp="88999990003", Instagram="@cris", InstagramConfirmado="2026-11-24T10:00:00Z", InstagramCodigo="TK-AB2CD3"),
           dict(base, CvId="D", Nome="Dani Outra", WhatsApp="88999990004", Instagram="@dani", InstagramConfirmado="2026-11-24T10:00:00Z", InstagramCodigo="TK-ZZ2ZZ3")]
    def hh(route):
        r = route.request
        if "/cv/ig" in r.url: return resp(route, {"ok": True, "confirmado": True, "usuario": "cris" if "AB2CD3" in r.url else "outra.conta"})
        if r.method != "POST": return route.fallback()
        try: a = json.loads(r.post_data or "{}").get("action")
        except Exception: return route.fallback()
        if a == "curriculos_listar": return resp(route, {"ok": True, "curriculos": CVS, "status": ["Novo"], "motivos": []})
        if a == "curriculos_treinamento": return resp(route, {"ok": True, "acessoConferido": True, "leitura": [], "resultados": []})
        return route.fallback()
    pg.route("**/*", hh); pg.goto(BASE + "curriculos.html"); pg.wait_for_selector(".item", timeout=15000)
    pg.wait_for_timeout(1200)
    tx = [pg.locator(".item", has_text=n).locator(".topo").inner_text() for n in ("Ana Confirmada", "Bia Digitou", "Cris Direct", "Dani Outra")]
    chk("confirmada pela candidata 'IG ✓'; só digitado 'IG ?'", "IG ✓" in tx[0] and "Direct" not in tx[0] and "IG ?" in tx[1], tx)
    chk("código do Direct que bate com a conta: 'IG ✓ Direct'", "IG ✓ Direct" in tx[2], tx[2])
    chk("código do Direct de outra conta: 'IG ?'", "IG ?" in tx[3] and "Direct" not in tx[3], tx[3])
    pg.locator(".item", has_text="Ana Confirmada").locator(".topo").click(); pg.wait_for_timeout(300)
    chk("detalhe mostra a data da confirmação", "Instagram confirmado em" in pg.locator(".item", has_text="Ana Confirmada").locator("dl").inner_text())
    chk("sem erro de JavaScript", not erros, erros); ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
