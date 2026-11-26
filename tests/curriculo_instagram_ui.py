#!/usr/bin/env python3
"""v7.96.7 — Instagram da candidata: só escrever o @ (obrigatório), sem conferência. Pedido do Pablo (26/11/2026): o link para
abrir o perfil, o código no Direct e a prévia confundiam as candidatas. Tudo simulado: Apps Script e Worker são rotas falsas."""
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
        if "/cv/ig-perfil" in u:
            q = u.split("u=")[-1]
            if q in ("maria.silva", "maria.certa", "maria"): return resp(route, {"ok": True, "existe": True, "usuario": q, "nome": "Maria Silva", "foto": "https://scontent.cdninstagram.com/v/m.jpg", "seguidores": "1.234"})
            if est.get("perfil_fora"): return resp(route, {"ok": False, "erro": "fora"})
            if est.get("sem_previa"): return resp(route, {"ok": True, "existe": False, "usuario": q, "semPrevia": True})
            return resp(route, {"ok": True, "existe": False, "usuario": q})
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
    print("== Tela simples: só o @ e Continuar ==")
    est = {}
    ctx, pg, erros = candidata(b, est); pg.goto(BASE + "curriculo.html"); pg.wait_for_selector("#insta", timeout=15000)
    chk("sem link para abrir o perfil, sem Direct e sem prévia", pg.locator("#ig-ver, #ig-direct, #ig-achado, #ig-conf").count() == 0)
    chk("botão principal é 'Continuar'", pg.inner_text("#ok").strip() == "Continuar", pg.inner_text("#ok"))
    pg.click("#ok"); pg.wait_for_timeout(300)
    chk("vazio: pede para digitar e não grava", "Digite seu @" in pg.inner_text("#erro") and not [a for a in est.get("acoes", []) if a.get("action") == "curriculo_instagram"], pg.inner_text("#erro"))
    pg.locator("#insta").press_sequentially("@Maria.Silva", delay=20); pg.wait_for_timeout(900)
    chk("enquanto digita nada muda nem é consultado", pg.input_value("#insta") == "@Maria.Silva" and not est.get("worker"), [pg.input_value("#insta"), est.get("worker")])
    pg.click("#ok"); pg.wait_for_timeout(800)
    ult = [a for a in est["acoes"] if a.get("action") == "curriculo_instagram"][-1]
    chk("grava o @ como escrito (sem validar) e segue", ult.get("instagram") == "@Maria.Silva" and ult.get("euConfirmo") is True and h2(pg) == "Vaga e horários", [ult, h2(pg)])
    chk("nenhuma consulta ao Instagram", not est.get("worker"), est.get("worker"))
    chk("sem erro de JavaScript", not erros, erros); ctx.close()
    print("== Link colado vira @ ==")
    est = {}
    ctx, pg, erros = candidata(b, est); pg.goto(BASE + "curriculo.html"); pg.wait_for_selector("#insta", timeout=15000)
    pg.fill("#insta", "https://www.instagram.com/maria_ok?igsh=abc"); pg.click("#ok"); pg.wait_for_timeout(800)
    ult = [a for a in est["acoes"] if a.get("action") == "curriculo_instagram"][-1]
    chk("link do perfil gravado como @maria_ok", ult.get("instagram") == "@maria_ok", ult)
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
    chk("sem conferência não há selo (nem 'IG ✓' nem 'IG ?')", "IG" not in tx[0] and "IG" not in tx[1], tx)
    chk("código do Direct que bate com a conta: 'IG ✓ Direct'", "IG ✓ Direct" in tx[2], tx[2])
    chk("código do Direct de outra conta: 'IG ?'", "IG ?" in tx[3] and "Direct" not in tx[3], tx[3])
    pg.locator(".item", has_text="Ana Confirmada").locator(".topo").click(); pg.wait_for_timeout(300)
    chk("detalhe mostra a data da confirmação", "Instagram confirmado em" in pg.locator(".item", has_text="Ana Confirmada").locator("dl").inner_text())
    chk("sem erro de JavaScript", not erros, erros); ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
