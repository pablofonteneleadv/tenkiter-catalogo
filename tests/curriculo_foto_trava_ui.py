#!/usr/bin/env python3
"""v7.90.0 — "Não consigo passar da foto" (relato do Pablo, 24/11/2026) + CPF e zoom no card de Currículos.
Candidata (curriculo.html): a foto chegava ao servidor e a resposta se perdia; a página recarregava ao abrir a câmera e
voltava ao começo (o login não ficava guardado). RH (curriculos.html): CPF no card, foto com zoom e etapa real.
Tudo simulado (tests/mock.py e rotas próprias); nada vai ao servidor real."""
import os, sys, json, base64
from pathlib import Path
from playwright.sync_api import sync_playwright
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from mock import install, SESSION, PERMS_ALL
BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8777/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ("" if c else " — " + str(e)[:300]))
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC")
FOTO = AQUI / "_foto_teste.png"; FOTO.write_bytes(PNG)
LOGIN = "localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999990001', sessao:'tk2.cand.ok'}));"
def resp(route, corpo):
    route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(corpo))
RETOMAR = {"ok": True, "menor": False, "nome": "Maria Teste", "whatsapp": "88999990001", "sessao": "tk2.cand.ok", "etapa": "Foto", "enviado": False, "status": "Novo", "fotoUrl": "", "dados": {"Instagram": "@maria", "InstagramConfirmado": "2026-11-24T10:00:00Z"}, "perfil": {"altura": "1,65", "peso": "60", "cep": "63700-000", "endereco": "Rua A, 1", "bairro": "Centro", "cidade": "Crateús", "estado": "CE", "fotoCorpoUrl": ""}}

def candidata(b, est, login=True):
    ctx = b.new_context(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True, service_workers="block")
    if login: ctx.add_init_script("if(!sessionStorage.getItem('__ja')){sessionStorage.setItem('__ja','1');" + LOGIN + "}")
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    def h(route):
        r = route.request
        if "script.google.com" not in r.url or r.method != "POST": return route.fallback()
        a = json.loads(r.post_data or "{}").get("action"); est.setdefault("vistos", []).append(a)
        if a == "curriculo_retomar": return resp(route, dict(RETOMAR, fotoUrl=est.get("foto_servidor", ""), etapa="Perfil" if est.get("foto_servidor") else "Foto"))
        if a == "enviar_foto_perfil":
            est["envios"] = est.get("envios", 0) + 1; est.setdefault("tipos", []).append(json.loads(r.post_data or "{}").get("tipo"))
            if est.get("resposta_perdida"): est["foto_servidor"] = "https://lh3.googleusercontent.com/d/x"; return route.abort()
            if est.get("falha_real"): return route.abort()
            est["foto_servidor"] = "https://lh3.googleusercontent.com/d/x"; return resp(route, {"ok": True, "url": est["foto_servidor"]})
        if a == "curriculo_status":
            return resp(route, {"ok": True, "estado": "incompleto", "faltando": ([] if est.get("foto_servidor") else ["Foto de perfil"]) + ["Responder as perguntas e enviar o currículo"]})
        return resp(route, {"ok": True})
    ctx.route("**/*", h)
    return ctx, pg, erros

def h2(pg): return pg.evaluate("(document.querySelector('#app h2')||{}).innerText||''")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    print("== Foto chega, mas a resposta se perde (internet fraca) ==")
    est = {"resposta_perdida": True}
    ctx, pg, erros = candidata(b, est); pg.goto(BASE + "curriculo.html"); pg.wait_for_function("document.querySelector('#app h2') && /foto/i.test(document.querySelector('#app h2').innerText)", timeout=15000)
    chk("abre direto no passo da foto (login guardado)", "foto" in h2(pg).lower(), h2(pg))
    chk("Continuar não fica apagado", not pg.locator("#ok").is_disabled())
    pg.set_input_files("#arq", str(FOTO)); pg.wait_for_timeout(3500)
    chk("confere no servidor e aceita a foto (sem pedir de novo)", "Foto do rosto enviada" in pg.inner_text("#app"), pg.inner_text("#app")[:200])
    pg.click("#ok"); pg.wait_for_timeout(600)
    chk("Continuar leva às perguntas", h2(pg) == "Vaga e horários", [h2(pg), pg.inner_text("#app")[:200]])
    chk("enviou a foto uma vez só", est.get("envios") == 1, est.get("envios"))
    chk("sem erro de JavaScript", not erros, erros); ctx.close()

    print("== Envio normal: rosto e corpo inteiro ==")
    est = {}
    ctx, pg, erros = candidata(b, est); pg.goto(BASE + "curriculo.html"); pg.wait_for_selector("#arq", state="attached", timeout=15000)
    pg.set_input_files("#arq", str(FOTO)); pg.wait_for_timeout(300)
    pg.wait_for_timeout(300)
    chk("aviso pede a de corpo inteiro depois do rosto", "corpo inteiro" in pg.inner_text("#foto-st"), pg.inner_text("#app")[:200])
    chk("a foto do rosto está marcada como obrigatória", "Rosto (obrigatória)" in pg.inner_text("#app") and "obrigat" not in pg.inner_text("#app").split("Corpo inteiro")[1].lower())
    pg.set_input_files("#arq-corpo", str(FOTO)); pg.wait_for_timeout(800)
    chk("foto de corpo inteiro sobe com tipo 'corpo'", est.get("tipos", [])[-1:] == ["corpo"], est.get("tipos"))
    pg.click("#ok"); pg.wait_for_timeout(600)
    chk("Continuar segue para 'Vaga e horários'", h2(pg) == "Vaga e horários", h2(pg)); ctx.close()

    print("== Foto não chegou de verdade: explica e deixa tentar de novo ==")
    est = {"falha_real": True}
    ctx, pg, erros = candidata(b, est); pg.goto(BASE + "curriculo.html"); pg.wait_for_selector("#arq", state="attached", timeout=15000)
    pg.set_input_files("#arq", str(FOTO)); pg.wait_for_timeout(1500)
    err = pg.inner_text("#erro")
    chk("mensagem em português, sem travar", bool(err.strip()) and "foto" in h2(pg).lower(), err)
    chk("botão Escolher foto volta a funcionar", not pg.locator("#esc").is_disabled())
    pg.click("#ok"); pg.wait_for_timeout(800)
    chk("Continuar sem foto explica o que falta", "Escolher foto" in pg.inner_text("#erro"), pg.inner_text("#erro"))
    chk("sem erro de JavaScript", not erros, erros); ctx.close()

    print("== Página recarrega no meio das perguntas (câmera/memória) ==")
    est = {"foto_servidor": "https://lh3.googleusercontent.com/d/x"}
    ctx, pg, erros = candidata(b, est); pg.goto(BASE + "curriculo.html"); pg.wait_for_function("document.querySelector('#app h2') && document.querySelector('#app h2').innerText==='Vaga e horários'", timeout=15000)
    pg.locator('input[name="vaga"]').first.check(force=True)
    for n in ("salario", "inicio"):
        pg.locator(f'input[name="{n}"]').first.check(force=True)
    pg.locator('input[name="ritmo"]').first.check(force=True)
    pg.click("#ok"); pg.wait_for_timeout(500)
    chk("avançou para Experiência", h2(pg) == "Experiência", h2(pg))
    pg.reload(); pg.wait_for_function("document.querySelector('#app h2') && document.querySelector('#app h2').innerText!=='' && !/Carregando/.test(document.body.innerText)", timeout=15000); pg.wait_for_timeout(500)
    chk("recarregou e voltou para Experiência (sem pedir senha)", h2(pg) == "Experiência", h2(pg))
    pg.click("#volta"); pg.wait_for_timeout(400)
    chk("respostas da etapa anterior continuam marcadas", pg.locator('input[name="vaga"]:checked').count() >= 1 and pg.locator('input[name="salario"]:checked').count() == 1)
    chk("sem erro de JavaScript", not erros, erros); ctx.close()

    print("== Cadastro novo guarda o login no aparelho ==")
    ctx, pg, erros = candidata(b, {}, login=False); pg.goto(BASE + "curriculo.html"); pg.wait_for_timeout(1200)
    pg.evaluate("S.whats='88999990002'; S.sessao='tk2.novo'; guardarLogin()")
    s = pg.evaluate("JSON.parse(localStorage.getItem('tm_session')||'null')")
    chk("tm_session guardada com o WhatsApp e a sessão", bool(s) and s.get("whatsapp") == "88999990002" and s.get("sessao") == "tk2.novo", s); ctx.close()

    print("== RH: CPF no card, foto com zoom e etapa real ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); install(ctx, perms=PERMS_ALL, versao="4.1", protegido=True)
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    CV = {"CvId": "CV1", "Nome": "Maria Teste", "WhatsApp": "88999990001", "Status": "Novo", "Criado": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "Etapa": "Foto",
          "Historico": "", "FotoUrl": "https://lh3.googleusercontent.com/d/abc", "CPF": "529.982.247-25"}
    def h(route):
        r = route.request
        if r.method != "POST": return route.fallback()
        try: a = json.loads(r.post_data or "{}").get("action")
        except Exception: return route.fallback()
        if a == "curriculos_listar": return resp(route, {"ok": True, "curriculos": [CV], "status": ["Novo"], "motivos": []})
        if a == "curriculos_treinamento": return resp(route, {"ok": True, "acessoConferido": True, "leitura": [], "resultados": []})
        return route.fallback()
    pg.route("**/*", h); pg.route("**/lh3.googleusercontent.com/**", lambda r: r.fulfill(status=200, content_type="image/png", body=PNG))
    pg.goto(BASE + "curriculos.html"); pg.wait_for_selector(".item", timeout=15000)
    tags = pg.locator(".item .topo .tag").all_inner_texts()   # data de hoje: sem "dias parada"; confere entre as etiquetas
    chk("etapa 'Foto' com foto já enviada aparece como 'Perfil'", "Perfil" in tags and "Foto" not in tags, tags)
    pg.click(".item .topo"); pg.wait_for_timeout(400)
    dl = pg.inner_text(".item dl")
    chk("CPF aparece no card aberto", "CPF" in dl and "529.982.247-25" in dl, dl[:200])
    chk("Cobrar currículo fala das perguntas (não da foto)", "perguntas" in __import__("urllib.parse").parse.unquote(pg.get_attribute("a:has-text('Cobrar currículo')", "href") or ""))
    pg.click("[data-k=ampliar]"); pg.wait_for_timeout(500)
    chk("tocar na foto abre a foto grande", pg.locator("#tkfg.aberto img").count() == 1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    chk("Esc fecha a foto grande", pg.locator("#tkfg.aberto").count() == 0)
    alvo = pg.locator("[data-k=ampliar]").bounding_box()
    chk("área de toque da foto ≥ 44 px", alvo and alvo["height"] >= 44 and alvo["width"] >= 44, alvo)
    pg.screenshot(path=str(AQUI / "saida" / "curriculos_cpf_zoom.png"), full_page=False)
    chk("sem erro de JavaScript", not erros, erros); ctx.close()
    b.close()
try: FOTO.unlink()
except Exception: pass
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
