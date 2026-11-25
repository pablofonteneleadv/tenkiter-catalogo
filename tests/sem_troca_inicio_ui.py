#!/usr/bin/env python3
"""v7.95.0 — Sem troca ao carregar (regra do Pablo, 25/11/2026): a tela inicial do Treinamento não pode mostrar um aviso
(ex.: "Complete seu perfil", "Faça seu currículo") e depois trocar por outro. Um observador grava tudo o que apareceu desde
o primeiro instante. Simulado (tests/mock.py); o servidor responde devagar de propósito."""
import os, sys, json, time
from pathlib import Path
from playwright.sync_api import sync_playwright
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from mock import install, SESSION
BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8777/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ("" if c else " — " + str(e)[:300]))
def resp(route, corpo):
    route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(corpo))
OBS = """(() => { window.__visto = {perfil:false, faca:false, completo:false, cursos:false};
  const marca = () => { const t = document.body ? document.body.innerText : '';
    if (document.getElementById('perfil-banner')) __visto.perfil = true;
    if (/Faça seu currículo/.test(t)) __visto.faca = true;
    if (/Currículo completo/.test(t)) __visto.completo = true;
    if (/Cursos interativos/.test(t)) __visto.cursos = true; };
  new MutationObserver(marca).observe(document, {subtree:true, childList:true, characterData:true});
  document.addEventListener('DOMContentLoaded', marca); })();"""
TUT = [{"id": "t1", "titulo": "Cadastro 1 produto", "status": "publicado", "etapas": [{}] * 20, "versao": 1}]

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    def abrir(ctx, estado, demora_ms):
        pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        def h(route):
            r = route.request
            if r.method != "POST": return route.fallback()
            try: a = json.loads(r.post_data or "{}").get("action")
            except Exception: return route.fallback()
            if a == "curriculo_status": time.sleep(demora_ms / 1000); return resp(route, {"ok": True, "estado": estado, "faltando": []})
            if a == "tutorial_listar": time.sleep(demora_ms / 1000); return resp(route, {"ok": True, "tutoriais": TUT})
            return route.fallback()
        pg.route("**/*", h); pg.goto(BASE + "treinamentos.html"); pg.wait_for_timeout(demora_ms + 2500)
        return pg, erros

    print("== Candidata com currículo completo: 1º acesso e acessos seguintes ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script(OBS); install(ctx, ia=False, versao="4.3")
    pg, erros = abrir(ctx, "completo", 1200)
    v = pg.evaluate("window.__visto")
    chk("1º acesso: nunca mostrou 'Complete seu perfil'", not v["perfil"], v)
    chk("1º acesso: nunca mostrou 'Faça seu currículo'", not v["faca"], v)
    chk("1º acesso: termina em 'Currículo completo'", "Currículo completo" in pg.inner_text("body"))
    chk("sem erro de JavaScript", not erros, erros); pg.close()
    pg, erros = abrir(ctx, "completo", 1500)
    v = pg.evaluate("window.__visto")
    chk("2º acesso: 'Currículo completo' já na primeira pintura (antes do servidor responder)", v["completo"] and not v["perfil"] and not v["faca"], v)
    ini = pg.evaluate("performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd")
    chk("2º acesso: 'Cursos interativos' guardado aparece junto", v["cursos"], v)
    chk("sem erro de JavaScript", not erros, erros); ctx.close()

    print("== Quem não tem currículo: aviso do perfil continua aparecendo ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script(OBS); install(ctx, ia=False, versao="4.3")
    pg, erros = abrir(ctx, "nenhum", 300)
    chk("sem currículo e perfil incompleto: mostra 'Complete seu perfil'", pg.locator("#perfil-banner").count() == 1)
    chk("e o cartão 'Faça seu currículo'", "Faça seu currículo" in pg.inner_text("body"))
    pg.close()
    pg, erros = abrir(ctx, "nenhum", 1500)
    v = pg.evaluate("window.__visto")
    chk("2º acesso: os dois avisos já na primeira pintura", v["perfil"] and v["faca"], v)
    chk("sem erro de JavaScript", not erros, erros); ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
