"""v7.26: foto nova entra INTEIRA no quadro 4:5 (Encaixar com fundo desfocado), sem nada cortado; foto já em 4:5 fica como veio;
o ✂ Enquadrar abre da original e o zoom/corte é opcional; "voltar" leva à foto encaixada padrão (já enviada). Serviços simulados."""
import sys, os, io
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from PIL import Image
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
EVID = os.environ.get("TK_EVID", "")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def jpeg(w, h, cor_topo, cor_base):
    im = Image.new("RGB", (w, h), cor_base); im.paste(Image.new("RGB", (w, h // 6), cor_topo), (0, 0))   # faixa no topo: some se cortar
    b = io.BytesIO(); im.save(b, "JPEG", quality=90); return b.getvalue()
ALTA = jpeg(720, 1520, (0, 0, 255), (230, 120, 40))     # captura de tela 9:19 (como no print do Pablo)
QUADRO = jpeg(800, 1000, (0, 200, 0), (200, 200, 200))  # já 4:5
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2800)
    if not pg.locator("#card-menu-cadastro").evaluate("e => e.open"): pg.click("#card-menu-cadastro > summary")
    pg.click("#menu-cad-nova"); pg.wait_for_timeout(400)
    pg.set_input_files("#galeria-input", [{"name": "print.jpg", "mimeType": "image/jpeg", "buffer": ALTA}, {"name": "quadro.jpg", "mimeType": "image/jpeg", "buffer": QUADRO}])
    pg.wait_for_function("document.querySelectorAll('#galeria-grid .galeria-item').length===2", timeout=20000); pg.wait_for_timeout(1500)
    info = pg.evaluate("""(async()=>{const imgs=[...document.querySelectorAll('#galeria-grid .galeria-item img')];
      const r=[];for(const im of imgs){await im.decode().catch(()=>{});const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d');x.drawImage(im,0,0);
        const px=(fx,fy)=>Array.from(x.getImageData(Math.floor(c.width*fx),Math.floor(c.height*fy),1,1).data).slice(0,3);
        r.push({w:im.naturalWidth,h:im.naturalHeight,centroTopo:px(.5,.06),lateralMeio:px(.03,.5)})}return r})()""")
    a, q = info
    chk("captura comprida vira 1080×1350 (quadro 4:5 do site)", (a["w"], a["h"]) == (1080, 1350), a)
    chk("a faixa do topo continua visível (nada cortado: a foto inteira cabe no quadro)", a["centroTopo"][2] > 150 and a["centroTopo"][0] < 100, a["centroTopo"])
    chk("as sobras dos lados ficam com o fundo desfocado da própria foto (não branco nem preto)", not all(v > 240 for v in a["lateralMeio"]) and not all(v < 15 for v in a["lateralMeio"]), a["lateralMeio"])
    chk("foto que já está em 4:5 fica como veio (sem refazer)", (q["w"], q["h"]) == (800, 1000), q)
    chk("o encaixe padrão não mostra o selo 'ajustada'", pg.locator("#galeria-grid .selo-enq").count() == 0)
    chk("as duas sobem pelo pré-envio (selo 'enviada')", pg.locator("#galeria-grid .pre-badge", has_text="enviada").count() == 2)
    if EVID: pg.locator("[data-passo=fotos]").screenshot(path=os.path.join(EVID, "encaixe-390.png"))
    n_env = len(st["midia"]["envios"])
    pg.locator("#galeria-grid .btn-enq").first.click(); pg.wait_for_function("!document.getElementById('enq-ok').disabled", timeout=10000); pg.wait_for_timeout(300)
    chk("Enquadrar abre da foto original já em 'Encaixar' e sem 'Voltar à original'", pg.evaluate("TKEnquadrar._estado().modo") == "encaixar" and pg.evaluate("TKEnquadrar._estado().img.naturalHeight") == 1200 and pg.locator("#enq-voltar").is_hidden())
    if EVID: pg.screenshot(path=os.path.join(EVID, "enquadrar-encaixar-390.png"))
    pg.evaluate("document.getElementById('enq-ajustes').open=true"); pg.click("[data-enq=modo][data-v=cortar]"); pg.wait_for_timeout(200); pg.click("#enq-ok"); pg.wait_for_timeout(1500)
    chk("zoom/corte é opcional: escolher Cortar troca a foto e mostra 'ajustada'", pg.locator("#galeria-grid .selo-enq").count() == 1 and len(st["midia"]["envios"]) == n_env + 1)
    pg.locator("#galeria-grid .btn-enq").first.click(); pg.wait_for_timeout(800)
    chk("depois de ajustar, aparece 'Voltar à original'", pg.locator("#enq-voltar").is_visible())
    pg.click("#enq-voltar"); pg.wait_for_timeout(800)
    dims = pg.evaluate("(()=>{const im=document.querySelector('#galeria-grid .galeria-item img');return [im.naturalWidth,im.naturalHeight]})()")
    chk("voltar leva à foto encaixada padrão, já enviada (não sobe nada de novo)", dims == [1080, 1350] and pg.locator("#galeria-grid .selo-enq").count() == 0 and len(st["midia"]["envios"]) == n_env + 1 and pg.locator("#galeria-grid .galeria-item").first.locator(".pre-badge", has_text="enviada").count() == 1, [dims, len(st["midia"]["envios"]) - n_env])
    if not pg.locator("#card-menu-cadastro").evaluate("e => e.open"): pg.click("#card-menu-cadastro > summary")
    pg.click("#menu-cad-varias"); pg.wait_for_timeout(400)
    pg.set_input_files("#galeria-input", [{"name": "p.jpg", "mimeType": "image/jpeg", "buffer": ALTA}]); pg.wait_for_timeout(2000)
    d2 = pg.evaluate("(()=>{const im=document.querySelector('#galeria-grid .galeria-item img');return [im.naturalWidth,im.naturalHeight]})()")
    chk("em 'Cadastrar vários produtos' a foto também entra inteira", d2 == [1080, 1350], d2)
    chk("sem erros de JavaScript", not erros, erros)
    b.close()
print("\n%d ok, %d falhas" % (len(OK), len(BAD)))
if BAD: print("\n".join(BAD)); sys.exit(1)
