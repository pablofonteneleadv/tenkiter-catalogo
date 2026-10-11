"""O Chrome considera o site INSTALÁVEL? (manifest, ícones, service worker com fetch, start_url, display). Usa o diagnóstico do próprio Chrome
(Page.getInstallabilityErrors) com o service worker de verdade ligado, num servidor local (localhost conta como seguro)."""
import sys, os, json
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)   # service worker LIGADO
    install(ctx)
    # o OneSignal real fica fora (não há internet aqui): o worker já tem try/catch para isso
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(5500)
    reg = pg.evaluate("navigator.serviceWorker.getRegistration('/').then(r=>r?{ativo:!!r.active,url:r.active&&r.active.scriptURL}:null)")
    chk("service worker único registrado e ativo", bool(reg) and reg["ativo"] and reg["url"].endswith("/OneSignalSDKWorker.js"), reg)
    cdp = ctx.new_cdp_session(pg)
    r = cdp.send("Page.getInstallabilityErrors")
    erros_inst = [e.get("errorId") for e in r.get("installabilityErrors", [])]
    chk("o Chrome não aponta nenhum impedimento para instalar", not erros_inst, erros_inst)
    m = pg.evaluate("fetch('/site.webmanifest').then(r=>r.json())")
    chk("manifest: nome, start_url, display standalone e ícones 192/512/maskable", m.get("name") and m.get("start_url") and m.get("display") == "standalone" and
        {"192x192", "512x512"} <= {i["sizes"] for i in m["icons"]} and any("maskable" in i.get("purpose", "") for i in m["icons"]), m)
    chk("página tem meta theme-color e apple-touch-icon (ícone do iPhone)", pg.evaluate("!!document.querySelector('meta[name=theme-color]') && !!document.querySelector('link[rel=apple-touch-icon]')"))
    chk("e o título do app no iPhone (apple-mobile-web-app-title)", pg.evaluate("(document.querySelector('meta[name=apple-mobile-web-app-title]')||{}).content") == "TENKiTER")
    chk("nenhum erro de JavaScript", not erros, erros[:3])
    b.close()
print("\nFALHAS=%d %s" % (len(BAD), BAD))
sys.exit(1 if BAD else 0)
