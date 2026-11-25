#!/usr/bin/env python3
"""v7.93.0 — Perfil dentro do currículo (pedido do Pablo, 24/11/2026).
O currículo pede o que o "Meu perfil" precisa (fotos, altura, peso e endereço) e só termina com o Instagram confirmado.
Quem já tinha enviado e falta algo vai direto ao que falta. No portal, quem tem currículo não vê "Complete seu perfil".
Simulado (rotas falsas para o Apps Script, o Worker e o ViaCEP)."""
import os, sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from mock import install, SESSION
BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8777/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ("" if c else " — " + str(e)[:300]))
PNG = (AQUI.parent / "icon-192.png").read_bytes()
LOGIN = "if(!sessionStorage.getItem('__ja')){sessionStorage.setItem('__ja','1');localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999990001', sessao:'tk2.cand.ok'}));}"
def resp(route, corpo):
    route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(corpo))
def h2(pg): return pg.evaluate("(document.querySelector('#app h2')||{}).innerText||''")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    print("== Currículo já enviado, sem Instagram confirmado e sem dados do perfil ==")
    est = {"perfil": {"altura": "", "peso": "", "cep": "", "endereco": "", "bairro": "", "cidade": "", "estado": "", "fotoCorpoUrl": ""}}
    ctx = b.new_context(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(LOGIN); ctx.add_init_script("window.open=function(){return null};")
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    def h(route):
        r = route.request; u = r.url
        if "/cv/ig-perfil" in u: return resp(route, {"ok": True, "existe": False, "semPrevia": True})   # como na nuvem hoje
        if "/cv/ig" in u:
            if r.method == "POST": return resp(route, {"ok": True, "codigo": "TK-AB2CD3", "loja": "tenkitermodasceara"})
            return resp(route, {"ok": True, "confirmado": True, "usuario": "maria.certa", "nome": "Maria", "foto": ""})
        if "viacep.com.br" in u:
            return resp(route, {"cep": "63700-000", "logradouro": "Rua Firmino Rosa", "bairro": "Centro", "localidade": "Crateús", "uf": "CE"})
        if "script.google.com" not in u or r.method != "POST": return route.fallback()
        d = json.loads(r.post_data or "{}"); a = d.get("action"); est.setdefault("acoes", []).append(d)
        if a == "curriculo_retomar": return resp(route, {"ok": True, "nome": "Maria Silva", "whatsapp": "88999990001", "sessao": "tk2.cand.ok", "etapa": "Enviado", "enviado": True, "status": "Novo", "fotoUrl": "https://lh3.googleusercontent.com/d/x", "dados": {"Instagram": "@maria.errada", "InstagramConfirmado": ""}, "perfil": est["perfil"]})
        if a == "atualizar_perfil": est["perfil"].update(d.get("campos", {})); return resp(route, {"ok": True})
        if a == "curriculo_status": return resp(route, {"ok": True, "estado": "completo", "faltando": []})
        return resp(route, {"ok": True})
    ctx.route("**/*", h)
    pg.goto(BASE + "curriculo.html"); pg.wait_for_selector("#insta", timeout=15000)
    chk("vai direto confirmar o Instagram (não às perguntas)", h2(pg) == "Seu Instagram" and pg.input_value("#insta") == "@maria.errada", [h2(pg), pg.input_value("#insta")])
    pg.click("#ok"); pg.wait_for_selector("#cep", timeout=10000)
    chk("depois do Instagram pede os dados do perfil", h2(pg) == "Seus dados", h2(pg))
    pg.fill("#altura", "165"); pg.fill("#peso", "62,5")
    pg.locator("#cep").press_sequentially("63700000", delay=10); pg.wait_for_timeout(800)
    chk("o CEP preenche rua, bairro, cidade e estado", pg.input_value("#bairro") == "Centro" and pg.input_value("#cidade") == "Crateús" and pg.input_value("#estado") == "CE" and pg.input_value("#endereco").startswith("Rua Firmino Rosa"), [pg.input_value("#endereco"), pg.input_value("#cidade")])
    chk("o CEP fica com o traço", pg.input_value("#cep") == "63700-000", pg.input_value("#cep"))
    pg.fill("#endereco", ""); pg.click("#ok"); pg.wait_for_timeout(300)
    chk("sem endereço explica", "endereço" in pg.inner_text("#erro").lower(), pg.inner_text("#erro"))
    chk("rótulo é 'Bairro ou distrito'", "Bairro ou distrito" in pg.inner_text("#app"))
    pg.fill("#endereco", "Rua Firmino Rosa, 120"); pg.click("#ok"); pg.wait_for_timeout(1200)
    sal = [a for a in est["acoes"] if a.get("action") == "atualizar_perfil"]
    c = sal[-1]["campos"] if sal else {}
    chk("salva no perfil: altura em metros, peso, endereço completo", c.get("altura") == "1,65" and c.get("peso") == "63" and c.get("endereco") == "Rua Firmino Rosa, 120" and c.get("estado") == "CE", c)
    chk("já enviado e agora completo: termina na tela de enviado", "enviado" in pg.inner_text("#app").lower(), pg.inner_text("#app")[:160])
    chk("sem erro de JavaScript", not erros, erros); ctx.close()

    print("== Altura, peso e CEP são opcionais ==")
    est["perfil"] = {"altura": "", "peso": "", "cep": "", "endereco": "", "bairro": "", "cidade": "", "estado": "", "fotoCorpoUrl": ""}; est["acoes"] = []
    ctx = b.new_context(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(LOGIN); ctx.add_init_script("window.open=function(){return null};")
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); ctx.route("**/*", h)
    pg.goto(BASE + "curriculo.html"); pg.wait_for_selector("#insta", timeout=15000); pg.click("#ok"); pg.wait_for_selector("#cep", timeout=10000)
    pg.fill("#endereco", "Sítio Boa Vista"); pg.fill("#bairro", "Distrito de Ibiapaba"); pg.fill("#cidade", "Crateús"); pg.fill("#estado", "ce")
    pg.click("#ok"); pg.wait_for_timeout(1200)
    c = [a for a in est["acoes"] if a.get("action") == "atualizar_perfil"][-1]["campos"]
    chk("passa sem altura, peso e CEP (e sem número no endereço do interior)", c.get("altura") == "" and c.get("peso") == "" and c.get("cep") == "" and c.get("endereco") == "Sítio Boa Vista" and c.get("estado") == "CE", c)
    chk("sem erro de JavaScript", not erros, erros); ctx.close()

    print("== Portal: quem tem currículo não vê 'Complete seu perfil' ==")
    for estado, deve in (("completo", False), ("nenhum", True)):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
        ctx.add_init_script(SESSION); install(ctx, ia=False, versao="4.3")
        pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        def fazer(estado):
          def hs(route):
            r = route.request
            if r.method != "POST": return route.fallback()
            try: a = json.loads(r.post_data or "{}").get("action")
            except Exception: return route.fallback()
            if a == "curriculo_status": return resp(route, {"ok": True, "estado": estado, "faltando": []})
            return route.fallback()
          return hs
        pg.route("**/*", fazer(estado)); pg.goto(BASE + "treinamentos.html"); pg.wait_for_timeout(3500)
        tem = pg.locator("#perfil-banner").count() == 1
        chk(f"currículo '{estado}': aviso do perfil {'aparece' if deve else 'some'}", tem == deve, [tem, pg.inner_text("body")[:200]])
        chk(f"currículo '{estado}': sem erro de JavaScript", not erros, erros); ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
