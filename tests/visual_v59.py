"""v5.9: tipografia/estilos da marca em texto, elementos da marca, PNG do celular na biblioteca, foto do produto como elemento (camada mais ao fundo)."""
import sys, os, json, re, base64
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
C = "details[data-vz-det^='v:c_']"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 1100, "height": 900}, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    pg.click("[data-aba=config]"); pg.wait_for_timeout(400); pg.click("[data-vza=novo]"); pg.wait_for_timeout(900)
    def spec(): return json.loads(pg.input_value(C + " [data-vz-json]"))
    def cam(k): return [c for c in spec()["camadas"] if c["k"] == k][0]
    print("== Tipografia e estilos ==")
    pg.locator(C + " [data-ed-a=sel][data-k=nome]").click(); pg.wait_for_timeout(300)
    pg.select_option(C + " [data-ed-p=fam]", "dancing"); pg.wait_for_timeout(300)
    chk("escolher tipografia grava a família", cam("nome").get("fam") == "dancing", cam("nome"))
    pg.locator(C + " [data-ed-p=italico]").check(); pg.locator(C + " [data-ed-p=caixa]").check(); pg.wait_for_timeout(300)
    chk("itálico e maiúsculas gravam", cam("nome").get("estilo") == "italic" and cam("nome").get("caixa") == "alta", cam("nome"))
    pg.locator(C + " [data-ed-a=estilo][data-est=chamada]").click(); pg.wait_for_timeout(300)
    n = cam("nome"); chk("estilo pronto 'Chamada' aplica Oswald/maiúsculas/espaçamento", n.get("fam") == "oswald" and n.get("caixa") == "alta" and n.get("espac") == 4 and "estilo" not in n, n)
    pg.locator(C + " [data-ed-p=contOn]").check(); pg.wait_for_timeout(300)
    chk("contorno na letra liga", "contorno" in cam("nome"))
    pg.locator(C + " .ed-swb[data-ed-sw='#E67E22']").first.click(); pg.wait_for_timeout(300)
    chk("cor da marca em um toque", any(x for x in [cam("nome").get("cor"), (cam("nome").get("contorno") or {}).get("cor")] if str(x).lower() == "#e67e22"), cam("nome"))
    print("== Frases e elementos da marca ==")
    antes = len(spec()["camadas"])
    pg.select_option(C + " [data-ed-frase]", "8"); pg.locator(C + " [data-ed-a=addfrase]").click(); pg.wait_for_timeout(400)
    sp = spec(); chk("frase da marca entra como texto manuscrito", len(sp["camadas"]) == antes + 1 and sp["camadas"][-1].get("fam") == "dancing" and "acolhe" not in sp["camadas"][-1]["t"] and "Com você" in sp["camadas"][-1]["t"], sp["camadas"][-1])
    for f in ["caminhao", "pin", "faisca", "sacola", "cabide", "balao"]:
        pg.locator(C + " [data-ed-a=addforma][data-forma=%s]" % f).click(); pg.wait_for_timeout(150)
    fs = [c.get("forma") for c in spec()["camadas"] if c["tipo"] == "forma"]
    chk("elementos da marca (caminhão, pin, faísca, sacola, cabide, balão)", all(f in fs for f in ["caminhao", "pin", "faisca", "sacola", "cabide", "balao"]), fs)
    print("== PNG do celular vira elemento fixo e entra na biblioteca ==")
    pg.set_input_files(C + " input[data-ed-img]:not([data-ed-troca]) >> nth=0", {"name": "meu-selo.png", "mimeType": "image/png", "buffer": PNG}); pg.wait_for_timeout(1800)
    ims = [c for c in spec()["camadas"] if c["tipo"] == "imagem"]
    chk("PNG enviado vira camada de imagem", len(ims) >= 1, len(ims))
    lib = pg.evaluate("localStorage.getItem('tk_po_elementos_v1')")
    chk("fica na biblioteca (se subiu ao servidor)", (lib is not None and "meu-selo" in lib) or (ims and ims[0]["src"].startswith("data:")), lib)
    print("== Foto do produto como elemento ==")
    chk("visual novo já nasce com a foto como camada mais ao fundo", spec()["camadas"][0]["tipo"] == "foto")
    pg.locator(C + " [data-ed-a=sel][data-k=foto]").click(); pg.wait_for_timeout(200); pg.locator(C + " [data-ed-a=qdel]").first.click(); pg.wait_for_timeout(300)
    chk("dá para tirar a foto e recolocar", all(c["tipo"] != "foto" for c in spec()["camadas"]))
    pg.locator(C + " [data-ed-a=addfoto]").click(); pg.wait_for_timeout(500)
    sp = spec(); f0 = sp["camadas"][0]
    chk("foto vira a PRIMEIRA camada (mais ao fundo)", f0["tipo"] == "foto", f0)
    chk("ocupa a tela toda por padrão", f0.get("cheia") is True)
    pg.locator(C + " [data-ed-a=sel][data-k=foto]").click(); pg.wait_for_timeout(300)
    pg.fill(C + " [data-ed-p=w]", "60"); pg.dispatch_event(C + " [data-ed-p=w]", "change"); pg.wait_for_timeout(400)
    f0 = spec()["camadas"][0]
    chk("definir a largura fixa o espaço (sai do 'tela toda')", abs(f0["w"] - 0.6) < 0.01 and "cheia" not in f0, f0)
    chk("a foto não tem botões de Frente/Trás (sempre ao fundo)", pg.locator(C + " .ed-rapido [data-ed-a=qdown]:visible, .ed-rapido [data-ed-a=qup]:visible").count() == 0)
    pg.locator(C + " [data-ed-a=sel][data-k=nome]").click(); pg.wait_for_timeout(200)
    for _ in range(40): pg.locator(C + " [data-ed-a=qdown]").first.click()
    pg.wait_for_timeout(300)
    chk("nenhum elemento passa para trás da foto", spec()["camadas"][0]["tipo"] == "foto")
    pg.locator(C + " [data-ed-a=sel][data-k=foto]").click(); pg.wait_for_timeout(200)
    pg.locator(C + " [data-ed-a=fotocheia]").click(); pg.wait_for_timeout(300)
    chk("'Ocupar a tela toda' volta ao modo tela cheia", spec()["camadas"][0].get("cheia") is True)
    pg.locator(C + " [data-ed-p=fundoCor]").evaluate("e=>{e.value='#2c2c2c';e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(300)
    chk("cor atrás da foto fica no visual", str(spec().get("fundoCor", "")).lower() == "#2c2c2c", spec().get("fundoCor"))
    chk("nenhum erro de JavaScript", not erros, erros[:3])
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
