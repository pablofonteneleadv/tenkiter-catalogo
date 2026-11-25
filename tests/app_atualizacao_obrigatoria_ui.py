#!/usr/bin/env python3
"""v7.96.0 — App desatualizado não funciona até atualizar (pedido do Pablo, 25/11/2026).
Simula o app (agente TenkiterAndroid + ponte TKAndroid com versao/atualizar) e a versão publicada em /android/latest.json."""
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
UA = "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 TenkiterAndroid/2.5"
def ponte(v): return "window.__atualizou=0;window.TKAndroid={abrirModulo:function(){return true},sairConta:function(){},podeAtualizar:function(){},versao:function(){return '" + v + "'},atualizar:function(){window.__atualizou++}};"
LATEST = {"versionCode": 35, "versionName": "2.5.4", "bytes": 1, "sha256": "0" * 64, "url": "https://github.com/pablofonteneleadv/tenkiter-catalogo/releases/download/android-v2.5.4/TENKiTER-Mensagens-2.5.4.apk", "notes": ""}

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    def abrir(versao, pagina="admin.html", ua=UA, latest=LATEST, ctx=None):
        if ctx is None:
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", user_agent=ua)
            ctx.add_init_script(SESSION); ctx.add_init_script(ponte(versao)); install(ctx, perms=PERMS_ALL)
            ctx.route("**/android/latest.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(latest)) if latest else r.abort())
        pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(BASE + pagina); pg.wait_for_timeout(2500)
        return ctx, pg, erros
    print("== App 2.5.3 com 2.5.4 publicada ==")
    ctx, pg, erros = abrir("2.5.3")
    chk("aparece a tela 'Atualize o aplicativo' por cima de tudo", pg.locator("#tk-app-velho").is_visible() and "2.5.4" in pg.inner_text("#tk-app-velho"), pg.locator("#tk-app-velho").count())
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    chk("Esc não fecha", pg.locator("#tk-app-velho").is_visible())
    pg.click("#tk-app-velho button"); pg.wait_for_timeout(200)
    chk("'Atualizar agora' chama o atualizador do app", pg.evaluate("window.__atualizou") == 1)
    chk("oferece baixar o instalador pelo navegador", pg.locator("#tk-app-velho a[href*='releases/download/android-v2.5.4']").count() == 1)
    chk("sem erro de JavaScript", not erros, erros)
    print("== Próxima abertura sem rede: a trava já nasce com a tela ==")
    ctx.unroute("**/android/latest.json"); ctx.route("**/android/latest.json", lambda r: r.abort())
    pg2 = ctx.new_page(); pg2.add_init_script("window.__antes=null;document.addEventListener('DOMContentLoaded',()=>{window.__antes=!!document.getElementById('tk-app-velho')})")
    pg2.goto(BASE + "treinamentos.html"); pg2.wait_for_timeout(1500)
    chk("trava aparece já no carregamento (guardada no aparelho)", pg2.evaluate("window.__antes") is True or pg2.locator("#tk-app-velho").is_visible(), pg2.evaluate("window.__antes"))
    ctx.close()
    print("== App já atualizado ==")
    ctx, pg, erros = abrir("2.5.4")
    chk("2.5.4 com 2.5.4 publicada: sem trava", pg.locator("#tk-app-velho").count() == 0)
    chk("sem erro de JavaScript", not erros, erros); ctx.close()
    ctx, pg, erros = abrir("2.5.4-teste")
    chk("versão de teste 2.5.4-teste: sem trava", pg.locator("#tk-app-velho").count() == 0); ctx.close()
    print("== Navegador comum (não é o app) ==")
    ctx, pg, erros = abrir("2.5.3", ua="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36")
    chk("site no navegador nunca trava", pg.locator("#tk-app-velho").count() == 0); ctx.close()
    print("== Sem rede e nada guardado ==")
    ctx, pg, erros = abrir("2.5.3", latest=None)
    chk("não trava sem saber a versão publicada", pg.locator("#tk-app-velho").count() == 0)
    chk("sem erro de JavaScript", not erros, erros); ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
