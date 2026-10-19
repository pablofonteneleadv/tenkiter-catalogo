"""Postagens v4.36: elemento adicionado "só nesta foto" x "em todas as fotos", mover vale só para a foto ativa (ou todas com
"Fazer em todos"), arte final (assinatura) muda ao adicionar. Apps Script/internet SIMULADOS."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
BAD = []
def chk(n, c, e=""):
    if not c: BAD.append(n)
    print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
GAL = ",".join("https://res.cloudinary.com/z/image/upload/v1/g%d.jpg" % i for i in (1, 2))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"
    for _p in st["produtos"]: _p["Fotos_Galeria"] = GAL
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(1400)
    for i in range(3):
        if pg.locator(".po-m[aria-pressed=true]").count() < 3 and pg.locator(".po-m").nth(i).get_attribute("aria-pressed") != "true":
            pg.locator(".po-m").nth(i).click(); pg.wait_for_timeout(200)
    pg.wait_for_timeout(1500)
    chk("3 fotos = 3 prévias", pg.locator("#po-previa canvas").count() == 3)
    def tem(i, pref="x_"): return pg.evaluate("(i)=>((document.querySelectorAll('#po-previa canvas')[i]._boxes)||[]).filter(x=>String(x.k).startsWith('x_')).length", i)
    pg.evaluate("document.querySelector('[data-a=addabrir]').scrollIntoView({block:'center'})")
    pg.click("[data-a=addabrir]"); pg.wait_for_timeout(500)
    chk("com várias fotos aparece 'Só nesta foto' x 'Em todas'", pg.locator("[data-addem=foto]").count() == 1 and pg.locator("[data-addem=todas]").count() == 1)
    pg.click("[data-addem=foto]"); pg.click("[data-addforma=estrela]"); pg.wait_for_timeout(1200)
    chk("'Só nesta foto': a estrela aparece na 1ª foto e não nas outras", tem(0) == 1 and tem(1) == 0 and tem(2) == 0, [tem(0), tem(1), tem(2)])
    pg.evaluate("document.querySelector('[data-a=addabrir]').scrollIntoView({block:'center'})")
    pg.click("[data-a=addabrir]"); pg.wait_for_timeout(500)
    pg.click("[data-addem=todas]"); pg.click("[data-addemoji='🔥']"); pg.wait_for_timeout(1200)
    chk("'Em todas': o emoji aparece nas 3 fotos", tem(0) == 2 and tem(1) == 1 and tem(2) == 1, [tem(0), tem(1), tem(2)])
    # mover o emoji só na 2ª foto (Fazer em todos desligado)
    pg.locator("#po-previa canvas").nth(1).scroll_into_view_if_needed(); pg.wait_for_timeout(250)
    r = pg.evaluate("""(()=>{const c=document.querySelectorAll('#po-previa canvas')[1];const bb=c.getBoundingClientRect();const k=bb.width/(c._W||c.width);const x=c._boxes.find(q=>String(q.k).startsWith('x_'));return {x:bb.left+(x.x0+x.x1)/2*k,y:bb.top+(x.y0+x.y1)/2*k,k:x.k}})()""")
    def posi(i): return pg.evaluate("(i)=>{const c=document.querySelectorAll('#po-previa canvas')[i];const x=(c._boxes||[]).find(q=>String(q.k).startsWith('x_'));return x?Math.round((x.y0+x.y1)/2):-1}", i)
    y0 = [posi(0), posi(1), posi(2)]
    pg.mouse.move(r["x"], r["y"]); pg.mouse.down(); pg.mouse.move(r["x"], r["y"] - 60, steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
    y1 = [posi(0), posi(1), posi(2)]
    chk("mover na 2ª foto (sem 'Fazer em todos') muda só ela", y1[1] < y0[1] - 20 and y1[2] == y0[2], (y0, y1))
    pg.locator("[data-a=todos]").check(); pg.wait_for_timeout(300)
    pg.locator("#po-previa canvas").nth(2).scroll_into_view_if_needed(); pg.wait_for_timeout(250)
    r = pg.evaluate("""(()=>{const c=document.querySelectorAll('#po-previa canvas')[2];const bb=c.getBoundingClientRect();const k=bb.width/(c._W||c.width);const x=c._boxes.find(q=>String(q.k).startsWith('x_'));return {x:bb.left+(x.x0+x.x1)/2*k,y:bb.top+(x.y0+x.y1)/2*k}})()""")
    pg.mouse.move(r["x"], r["y"]); pg.mouse.down(); pg.mouse.move(r["x"], r["y"] - 50, steps=6); pg.mouse.up(); pg.wait_for_timeout(700)
    y2 = [posi(0), posi(1), posi(2)]
    chk("com 'Fazer em todos' ligado a posição vale para todas", y2[0] < y1[0] - 10 and y2[2] < y1[2] - 15 and abs(y2[0] - y2[2]) < 3, (y1, y2))
    chk("sem erros de JavaScript", not erros, erros[:3])
    b.close()
print("\nFALHAS=%d %s" % (len(BAD), BAD)); sys.exit(1 if BAD else 0)
