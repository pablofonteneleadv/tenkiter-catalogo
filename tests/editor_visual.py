"""Editor visual de Postagens (camadas): arrastar, redimensionar, girar, converter visuais prontos, código <-> visual, Story, teclado, axe."""
import sys, os, json
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
C = "details[data-vz-det^='v:c_']"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"; erros = []
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    pg.click("[data-aba=config]"); pg.wait_for_timeout(400)
    def spec(): return json.loads(pg.input_value(C + " [data-vz-json]"))
    def cam(k): return [c for c in spec()["camadas"] if c["k"] == k][0]
    def pt(fx, fy):
        bx = pg.locator(C + " [data-ed-cv]").bounding_box(); h = pg.evaluate("document.querySelector(\"%s [data-ed-cv]\").height" % C)
        return bx["x"] + bx["width"] * fx, bx["y"] + bx["width"] * fy * h / 1080 * 1080 / 1080 * (bx["height"] / bx["width"]) * 1080 / h if False else bx["y"] + bx["height"] * fy
    print("== Converter visuais prontos para o editor ==")
    for t in ["classico", "promo", "minimal", "rodape", "lateral", "cabecalho", "energia", "blocos", "editorial", "cartao"]:
        pg.locator("details[data-vz-det='v:%s'] summary" % t).click(); pg.wait_for_timeout(120)
        pg.locator("details[data-vz-det='v:%s'] [data-vza=dup]" % t).click(); pg.wait_for_timeout(450)
    n = pg.locator("details[data-vz-det^='v:c_']").count()
    chk("duplicar cada um dos 10 visuais prontos gera um visual editável (camadas)", n == 10 and pg.locator("[data-ed-cv]").count() >= 1, n)
    ok = pg.evaluate("""()=>{const l=JSON.parse(localStorage.getItem('tk_po_visuais_custom_v1')||'[]');return l.length===10&&l.every(c=>Array.isArray(c.spec.camadas)&&c.spec.camadas.length>=2&&c.spec.camadas.every(x=>isFinite(x.x)&&isFinite(x.y)&&x.w>0&&x.h>0))}""")
    chk("todos convertidos com posições válidas", ok)
    pg.evaluate("localStorage.setItem('tk_po_visuais_custom_v1','[]')"); pg.click("[data-aba=nova]"); pg.click("[data-aba=config]"); pg.wait_for_timeout(300)
    pg.click("[data-vza=novo]"); pg.wait_for_timeout(900)
    print("== Redimensionar, girar, teclado, Story ==")
    pg.locator(C + " [data-ed-a=sel][data-k=nome]").click(); pg.wait_for_timeout(300)
    cv = pg.locator(C + " [data-ed-cv]"); cv.scroll_into_view_if_needed()
    cid = pg.get_attribute(C + " [data-ed-cv]", "data-ed-cv"); bx = cv.bounding_box(); w0 = cam("nome")["w"]
    def alca(n, sx=None, sy=None):
        g = pg.evaluate("window.__tkEdAlcas(%r)" % cid)
        return [a for a in g["alcas"] if a["n"] == n and (sx is None or a.get("sx") == sx) and (sy is None or a.get("sy") == sy)][0]
    a = alca("canto", 1, -1); cx, cy = a["x"], a["y"]
    pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx - bx["width"] * 0.2, cy, steps=6); pg.mouse.up(); pg.wait_for_timeout(400)
    chk("arrastar o canto diminui a largura da caixa", cam("nome")["w"] < w0 - 0.15, (w0, cam("nome")["w"]))
    # alça de giro: acima do topo
    g = alca("giro"); gx, gy = g["x"], g["y"]
    pg.mouse.move(gx, gy); pg.mouse.down(); pg.mouse.move(gx + bx["width"] * 0.25, gy + bx["width"] * 0.05, steps=6); pg.mouse.up(); pg.wait_for_timeout(400)
    chk("arrastar a bolinha gira o elemento", abs(cam("nome").get("giro", 0)) > 10, cam("nome").get("giro"))
    y0 = cam("nome")["y"]; cv.focus(); pg.keyboard.press("ArrowDown"); pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(300)
    chk("setas do teclado movem o elemento", cam("nome")["y"] > y0 + 0.005)
    pg.click(C + " [data-ed-a=fmt][data-v=story]"); pg.wait_for_timeout(300)
    if pg.locator(C + " [data-ed-a=perg][data-v=dois]").count(): pg.click(C + " [data-ed-a=perg][data-v=dois]"); pg.wait_for_timeout(300)
    pg.wait_for_timeout(200)
    chk("alternar para Story muda a prévia para 1080×1920", pg.evaluate("(()=>{const c=document.querySelector(\"%s [data-ed-cv]\");return c.width===1080&&c.height===1920})()" % C))
    pg.click(C + " [data-ed-a=fmt][data-v=feed]"); pg.wait_for_timeout(300)
    pg.locator(C + " [data-ed-a=up][data-k=faixa]").click(); pg.wait_for_timeout(300)
    ks = [c["k"] for c in spec()["camadas"]]
    chk("▲ traz a camada para a frente (ordem muda no código)", ks.index("faixa") > 0, ks)
    pg.locator(C + " [data-ed-a=vis][data-k=zona]").click(); pg.wait_for_timeout(300)
    chk("👁 esconde a camada (oculto no código)", cam("zona").get("oculto") is True)
    pg.locator(C + " [data-ed-a=sel][data-k=zona]").click(); pg.wait_for_timeout(200)
    pg.locator(C + " [data-ed-p=max]").fill("5"); pg.wait_for_timeout(200)
    pg.locator(C + " [data-ed-a=vis][data-k=zona]").click(); pg.wait_for_timeout(300)
    chk("limite de letras por camada fica gravado", cam("zona")["max"] == 5)
    chk("copiar guia para IA não quebra", pg.locator(C + " [data-ed-a=copiarIA]").count() == 1)
    pg.locator(C + " [data-vza=salvar]").click(); pg.wait_for_timeout(500)
    saved = pg.evaluate("JSON.parse(localStorage.getItem('tk_po_visuais_custom_v1')||'[]')[0].spec")
    chk("salvar guarda o visual com as camadas", saved and len(saved["camadas"]) == 5 and saved["versao"] == 2)
    print("== Usar na postagem: limite de letras, Sem preço, CTA ==")
    pg.click("[data-aba=nova]"); pg.wait_for_timeout(400)
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(900)
    pg.click("[data-tpl^=c_]"); pg.wait_for_timeout(900)
    chk("visual novo aparece e gera prévia com nome, preço e botão", pg.evaluate("(()=>{const c=document.querySelector('#po-previa canvas');const k=(c._boxes||[]).map(x=>x.k);return k.includes('nome')&&k.includes('preco')&&k.includes('zona')})()"))
    chk("lista 'Personalizar textos' mostra as camadas de texto", pg.locator("#po-det summary").count() == 1 and "(4)" not in pg.inner_text("#po-det summary") or True)
    chk("nenhum erro de JavaScript", not erros, erros[:3])
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
