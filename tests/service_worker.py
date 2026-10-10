"""Service worker único (OneSignalSDKWorker.js): instala, guarda o site, abre SEM internet de verdade, o link curto /p/<código> sem internet
leva ao catálogo, admin/treinamentos nunca entram no cache e o worker NÃO morre quando o endereço do OneSignal está bloqueado.

Como simula "sem internet": o navegador é fechado e aberto de novo com o MESMO perfil (o cache do worker e a lista de peças ficam no aparelho),
e então o servidor é desligado (teste local) ou o nome do site deixa de resolver (teste no ar). Só desligar a rede da página não serve:
o service worker faz as próprias requisições e não seria afetado.
Aqui o service worker fica LIGADO (nos outros testes ele é bloqueado)."""
import sys, os, json, subprocess, socket, time, tempfile, shutil
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE")
srv = None
if not BASE:
    porta = 8771
    s = socket.socket(); livre = s.connect_ex(("127.0.0.1", porta)) != 0; s.close()
    if not livre: print("porta 8771 ocupada"); sys.exit(1)
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(porta)], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    BASE = "http://localhost:%d/" % porta
os.environ["TK_BASE"] = BASE
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))

perfil = tempfile.mkdtemp(prefix="tk-sw-")
VIEW = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="allow")
try:
    with sync_playwright() as p:
        print("== Instalação (com internet) ==")
        ctx = p.chromium.launch_persistent_context(perfil, args=["--no-sandbox"], **VIEW)
        install(ctx)   # o endereço do OneSignal cai no "abort" do mock: é exatamente o caso do bloqueador de anúncios
        pg = ctx.pages[0] if ctx.pages else ctx.new_page()
        pg.goto(BASE + "index.html"); pg.wait_for_timeout(4200)   # pwa.js registra 2,5 s depois do carregamento
        ativo = pg.evaluate("""async()=>{const r=await navigator.serviceWorker.getRegistration('/'); if(!r) return 'sem registro'; await navigator.serviceWorker.ready; return (r.active&&r.active.state)||'?' }""")
        chk("service worker registrado e ativo (mesmo com OneSignal bloqueado)", ativo == "activated", ativo)
        chk("é o arquivo único do OneSignal (não existe um segundo worker)", pg.evaluate("navigator.serviceWorker.getRegistration('/').then(r=>r.active.scriptURL)").endswith("/OneSignalSDKWorker.js"))
        pg.reload(); pg.wait_for_timeout(1800)
        chk("a página passa a ser controlada pelo worker", pg.evaluate("!!navigator.serviceWorker.controller"))
        errs404 = []
        pg.on("response", lambda r: errs404.append(r.url) if (r.status >= 400 and r.url.startswith(BASE) and "p/TK" not in r.url) else None)
        pg.locator(".card:not(.esqueleto)").first.click(); pg.wait_for_timeout(900)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        pg.reload(); pg.wait_for_timeout(2200)
        chk("nenhum pedido do próprio site dá erro (404) com o worker ligado", not errs404, errs404[:3])
        caches = pg.evaluate("caches.keys()")
        chk("cache do site criado", any(c.startswith("tk-site-") for c in caches), caches)
        pg.wait_for_timeout(800)
        guardados = pg.evaluate("""async()=>{const nome=(await caches.keys()).find(n=>n.startsWith('tk-site-')); const c=await caches.open(nome); return (await c.keys()).map(r=>new URL(r.url).pathname)}""")
        chk("guardou o essencial (index, common.js, pedido.js, privacidade)", all(x in guardados for x in ("/index.html", "/common.js", "/pedido.js", "/privacidade.html")), guardados)
        chk("admin / treinamentos / currículos NÃO ficam no cache", not [x for x in guardados if any(k in x for k in ("admin", "treinamentos", "curriculo", "manual"))], guardados)
        chk("o cache não guarda chamadas do Apps Script", not [x for x in guardados if "macros" in x])
        n_on = pg.locator(".card:not(.esqueleto)").count()
        chk("catálogo com internet mostra as peças", n_on >= 10, n_on)
        pg.goto(BASE + "privacidade.html"); pg.wait_for_timeout(800)
        pg.goto(BASE + "index.html"); pg.wait_for_timeout(2500)   # deixa a lista de peças guardada no aparelho
        ctx.close()

        print("== Sem internet (navegador reaberto com o mesmo perfil) ==")
        if srv: srv.terminate(); srv.wait(); srv = None
        extra = [] if BASE.startswith("http://localhost") else ["--host-resolver-rules=MAP * ~NOTFOUND"]   # local: servidor desligado; no ar: o nome do site deixa de resolver
        ctx = p.chromium.launch_persistent_context(perfil, args=["--no-sandbox"] + extra, **VIEW)   # SEM install(): nada simulado, rede de verdade (inexistente)
        ctx.set_offline(True)   # a página também sabe que está sem rede (navigator.onLine = false)
        off = ctx.pages[0] if ctx.pages else ctx.new_page()
        off_err = []; off.on("pageerror", lambda e: off_err.append(str(e)))
        off.goto(BASE + "index.html"); off.wait_for_timeout(3000)
        n = off.locator(".card:not(.esqueleto)").count()
        chk("catálogo abre sem internet e mostra as peças salvas", n >= 10, n)
        chk("aparece o aviso 'Sem internet'", off.locator("#aviso-offline").is_visible())
        chk("sem erro de JavaScript offline", not off_err, off_err)
        off.locator(".card:not(.esqueleto) .abrir-peca").first.click(); off.wait_for_timeout(900)
        chk("abrir uma peça offline funciona", off.locator("#overlay.aberto").count() == 1)
        off.keyboard.press("Escape"); off.wait_for_timeout(400)
        off.goto(BASE + "privacidade.html"); off.wait_for_timeout(1200)
        chk("política de privacidade também abre offline", "Política de privacidade" in off.inner_text("h1"))
        off.goto(BASE + "p/TK-0007"); off.wait_for_timeout(3000)
        chk("link curto /p/TK-0007 sem internet cai no catálogo com a peça aberta", "c=TK-0007" in off.url and off.locator("#overlay.aberto").count() == 1, off.url)
        try:
            off.goto(BASE + "admin.html"); off.wait_for_timeout(1500)
            admin_abriu = off.locator("#lista-produtos").count() > 0
        except Exception:
            admin_abriu = False   # navegador mostrou "sem conexão": é o esperado
        chk("admin NÃO abre do cache (é do gestor, precisa de internet)", not admin_abriu)
        ctx.close()
        sw = open(os.path.join(RAIZ, "OneSignalSDKWorker.js"), encoding="utf-8").read()
        chk("limpeza: ao ativar, apaga os caches de versões antigas do site", "n.indexOf('tk-site-') === 0 && n !== CACHE_SITE" in sw and "var VERSAO = " in sw)
        chk("OneSignal bloqueado não derruba o worker (importScripts dentro de try)", "try { importScripts(" in sw)
finally:
    if srv: srv.terminate()
    shutil.rmtree(perfil, ignore_errors=True)
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD)
sys.exit(1 if BAD else 0)
