"""v4.27: "ação pendente de conexão" vira plaquinha FLUTUANTE (não some ao rolar) e o resultado da sincronização é um aviso rápido, sem alert() que trava a tela."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
BAD = []
def chk(n, c, e=""):
    if not c: BAD.append(n)
    print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
FILA = "localStorage.setItem('tenkiter_fila_offline', JSON.stringify([{corpo:{action:'ping_teste'}, em:Date.now()}]));"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for larg in (360, 390):
        print("== %d px" % larg)
        ctx = b.new_context(viewport={"width": larg, "height": 780}, is_mobile=True, has_touch=True, service_workers="block")
        ctx.add_init_script(SESSION); ctx.add_init_script("if(!sessionStorage.getItem('__f')){sessionStorage.setItem('__f','1');" + FILA + "}")
        install(ctx, perms=PERMS_ALL, versao="4.20")
        pg = ctx.new_page(); dialogos = []; pg.on("dialog", lambda d: (dialogos.append(d.message), d.accept()))
        pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2800)
        chk("plaquinha aparece com a contagem", pg.locator("#sync-bar:visible").count() == 1 and "1 ação pendente de conexão" in pg.inner_text("#sync-texto"))
        pos = pg.evaluate("(()=>{const e=document.getElementById('sync-bar'),r=e.getBoundingClientRect();return {pos:getComputedStyle(e).position,top:r.top,bottom:r.bottom,vh:innerHeight,l:r.left,r:r.right,vw:innerWidth}})()")
        chk("é flutuante (fixed) e fica dentro da tela", pos["pos"] == "fixed" and 0 <= pos["l"] and pos["r"] <= pos["vw"] and pos["bottom"] <= pos["vh"], pos)
        pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); pg.wait_for_timeout(300)
        chk("continua à vista depois de rolar a página", pg.locator("#sync-bar").is_visible() and pg.evaluate("document.getElementById('sync-bar').getBoundingClientRect().bottom <= innerHeight"))
        pg.evaluate("window.scrollTo(0, 0)")
        chk("botão Sincronizar ≥ 40 px", pg.evaluate("document.getElementById('btn-sincronizar').getBoundingClientRect().height >= 40"))
        pg.click("#btn-sincronizar"); pg.wait_for_timeout(1500)
        chk("nenhum alert() travou a tela", dialogos == [], dialogos)
        chk("some quando não há mais pendência", pg.locator("#sync-bar:visible").count() == 0 and pg.evaluate("getFilaOffline().length") == 0)
        chk("avisa em plaquinha rápida", pg.locator("#aviso-rapido:visible").count() == 1 and "Tudo sincronizado" in pg.inner_text("#aviso-rapido"), pg.inner_text("#aviso-rapido"))
        pg.wait_for_timeout(5200)
        chk("o aviso rápido some sozinho", pg.locator("#aviso-rapido:visible").count() == 0)
        ctx.close()
    b.close()
print("FALHAS=%d" % len(BAD))
sys.exit(1 if BAD else 0)
