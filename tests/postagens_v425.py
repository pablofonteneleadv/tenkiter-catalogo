"""Postagens (18/10/2026): foto escolhida fica no meio e TRAVADA, toque com folga, "Fazer em todos" (posição/giro/largura), largura da caixa de texto
e arrastar suave (a prévia é desenhada em meia resolução; a arte final continua 1080). Dedo de verdade via CDP (390 px). Apps Script e internet SIMULADOS."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
GAL = ",".join("https://res.cloudinary.com/z/image/upload/v1/g%d.jpg" % i for i in (1, 2))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"; erros = []
    for _p in st["produtos"]: _p["Fotos_Galeria"] = GAL
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    cdp = ctx.new_cdp_session(pg)
    def tp(pts): return [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]
    def gesto(ini, fim, passos=8):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": tp(ini)})
        for i in range(1, passos + 1):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": tp([(a[0] + (z[0] - a[0]) * i / passos, a[1] + (z[1] - a[1]) * i / passos) for a, z in zip(ini, fim)])}); pg.wait_for_timeout(16)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); pg.wait_for_timeout(250)
    def toque(x, y): gesto([(x, y)], [(x, y)], 1)
    def boxes(i):
        return pg.evaluate("(i)=>{const c=document.querySelectorAll('#po-previa canvas')[i];const r=c.getBoundingClientRect();const k=r.width/c._W;return (c._boxes||[]).filter(x=>x.k).map(x=>({k:x.k,x:r.left+(x.x0+x.x1)/2*k,y:r.top+(x.y0+x.y1)/2*k,w:x.x1-x.x0,cx:(x.x0+x.x1)/2/c._W,cy:(x.y0+x.y1)/2/c._H,x0:r.left+x.x0*k,x1:r.left+x.x1*k,y0:r.top+x.y0*k,y1:r.top+x.y1*k}))}", i)
    def ver(): pg.evaluate("(()=>{const e=document.querySelector('#po-previa');e.scrollIntoView({block:'center'});e.scrollLeft=0})()"); pg.wait_for_timeout(350)
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(1400)
    for i in range(3):
        if pg.locator(".po-m[aria-pressed=true]").count() < 3 and pg.locator(".po-m").count() > i and pg.locator(".po-m").nth(i).get_attribute("aria-pressed") != "true":
            pg.locator(".po-m").nth(i).click(); pg.wait_for_timeout(200)
    pg.wait_for_timeout(1500)
    n = pg.locator("#po-previa canvas").count()
    chk("3 fotos escolhidas = 3 prévias", n == 3, n)

    print("== Prévia leve, arte final intacta ==")
    d = pg.evaluate("(()=>{const c=document.querySelector('#po-previa canvas');return {w:c.width,h:c.height,W:c._W,H:c._H}})()")
    chk("a prévia é desenhada em metade (540×960) e conhece o tamanho real (1080×1920)", d["w"] == 540 and d["h"] == 960 and d["W"] == 1080 and d["H"] == 1920, d)

    print("== Foto escolhida: no meio e TRAVADA ==")
    ver()
    chk("começa com 'Travar a foto' marcada", pg.locator("[data-a=travar]").is_checked())
    pg.locator("[data-a=travar]").uncheck(); pg.wait_for_timeout(200)
    chk("desmarcar libera a foto", not pg.locator("[data-a=travar]").is_checked())
    r = pg.evaluate("(()=>{const c=document.querySelectorAll('#po-previa canvas')[1].getBoundingClientRect();return {x:c.left+c.width*.5,y:c.top+c.height*.05}})()")
    toque(r["x"], r["y"]); pg.wait_for_timeout(900)
    chk("tocar em OUTRA foto marca 'Travar a foto' de novo (evita mexer sem querer)", pg.locator("[data-a=travar]").is_checked())
    dif = pg.evaluate("(()=>{const bx=document.querySelector('#po-previa').getBoundingClientRect(),c=document.querySelectorAll('#po-previa canvas')[1].getBoundingClientRect();return Math.abs((c.left+c.width/2)-(bx.left+bx.width/2))})()")
    chk("a foto escolhida fica no MEIO da faixa de prévias", dif < 8, dif)
    chk("a borda de seleção está na foto tocada", pg.evaluate("document.querySelectorAll('#po-previa canvas')[1].classList.contains('ativa')"))

    print("== Toque com folga ==")
    ver(); bxs = boxes(0)
    pt = pg.evaluate("""(bxs)=>{const c=document.querySelectorAll('#po-previa canvas')[0].getBoundingClientRect();
      for(let y=c.top+6;y<c.bottom-6;y+=3)for(let x=c.left+6;x<c.right-6;x+=3){
        if(bxs.some(b=>x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1))continue;
        let best=null,bd=1e9;bxs.forEach(b=>{const d=Math.hypot(Math.max(b.x0-x,0,x-b.x1),Math.max(b.y0-y,0,y-b.y1));if(d<bd){bd=d;best=b.k}});
        if(bd>=7&&bd<=12)return{x,y,k:best,d:bd}}return null}""", bxs)
    chk("existe um ponto a ~10 px de um texto, fora de qualquer caixa", pt is not None)
    toque(pt["x"], pt["y"]); pg.wait_for_timeout(300)
    k = pg.evaluate("(()=>{const e=document.querySelector('[data-seltx][aria-pressed=true]');return e?e.dataset.seltx:null})()")
    chk("tocar um pouco FORA do texto (~10 px) ainda escolhe o texto mais perto", k == pt["k"], (k, pt))
    k = k or "nome"
    print("== Largura da caixa de texto ==")
    pg.evaluate("(k)=>{const e=document.getElementById('po-det');e.open=true}", k); pg.wait_for_timeout(150)
    pg.fill("#po-tx-%s" % k, "Vestido Longo Floral Premium Edição Especial Verão"); pg.wait_for_timeout(400); ver()
    w0 = [x for x in boxes(0) if x["k"] == k][0]["w"]
    pg.evaluate("(k)=>{const e=document.getElementById('po-det');e.open=true}", k); pg.wait_for_timeout(150)
    pg.evaluate("(k)=>{const s=document.getElementById('po-lw-'+k);s.value=2;s.dispatchEvent(new Event('input',{bubbles:true}))}", k); pg.wait_for_timeout(500)
    w1 = [x for x in boxes(0) if x["k"] == k][0]["w"]
    chk("aumentar a Largura deixa a caixa do texto mais larga (cabe mais texto)", w1 > w0 * 1.05, (w0, w1))
    chk("tem a barra 'Largura' no campo do texto", pg.locator("#po-lw-%s" % k).count() == 1)

    print("== Fazer em todos ==")
    chk("'Fazer em todos' vem DESMARCADO", pg.locator("[data-a=todos]").count() == 1 and not pg.locator("[data-a=todos]").is_checked())
    ver(); a = [x for x in boxes(0) if x["k"] == k][0]
    gesto([(a["x"], a["y"])], [(a["x"] + 20, a["y"] + 60)], 6); pg.wait_for_timeout(500)
    b0 = [x for x in boxes(0) if x["k"] == k][0]; b1 = [x for x in boxes(1) if x["k"] == k][0]
    chk("desligado: mexer numa foto NÃO muda as outras", abs(b0["cy"] - b1["cy"]) > 0.01, (b0["cy"], b1["cy"]))
    pg.locator("[data-a=todos]").check(); pg.wait_for_timeout(150)
    ver(); a = [x for x in boxes(0) if x["k"] == k][0]
    gesto([(a["x"], a["y"])], [(a["x"] - 10, a["y"] - 50)], 6); pg.wait_for_timeout(900)
    b0 = [x for x in boxes(0) if x["k"] == k][0]; b1 = [x for x in boxes(1) if x["k"] == k][0]; b2 = [x for x in boxes(2) if x["k"] == k][0]
    chk("ligado: a posição do texto vira a mesma nas 3 fotos", abs(b0["cy"] - b1["cy"]) < 0.005 and abs(b0["cy"] - b2["cy"]) < 0.005 and abs(b0["cx"] - b1["cx"]) < 0.005, (b0["cx"], b0["cy"], b1["cy"], b2["cy"]))
    pg.evaluate("(k)=>{const s=document.getElementById('po-lw-'+k);s.value=1.5;s.dispatchEvent(new Event('input',{bubbles:true}))}", k); pg.wait_for_timeout(500)
    vals = pg.evaluate("[...document.querySelectorAll('[data-lw]')].map(e=>Number(e.value))")
    chk("ligado: a Largura vale para todos os textos", len(set(vals)) == 1 and abs(vals[0] - 1.5) < 0.01, vals)
    chk("sem erro de JavaScript", not erros, erros)
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
