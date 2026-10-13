"""v6.0: ajuste por formato (Feed/Story) com pergunta, botões explicados, virar texto comum no preço."""
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
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 1100, "height": 900}, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    install(ctx, perms=PERMS_ALL, versao="4.3")
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    pg.click("[data-aba=config]"); pg.wait_for_timeout(400); pg.click("[data-vza=novo]"); pg.wait_for_timeout(900)
    def spec(): return json.loads(pg.input_value(C + " [data-vz-json]"))
    def cam(k): return [c for c in spec()["camadas"] if c["k"] == k][0]
    sel = lambda k: pg.locator(C + " [data-ed-a=sel][data-k=%s]" % k).click()
    print("== Pergunta Feed/Story ==")
    sel("nome"); pg.wait_for_timeout(200); x0 = cam("nome")["x"]
    pg.fill(C + " [data-ed-p=x]", "20"); pg.dispatch_event(C + " [data-ed-p=x]", "change"); pg.wait_for_timeout(300)
    sel("zona"); pg.wait_for_timeout(300)
    chk("ao sair do elemento aparece a pergunta", pg.locator(C + " .ed-pergunta").count() == 1)
    pg.locator(C + " [data-ed-a=perg][data-v=este]").click(); pg.wait_for_timeout(300)
    n = cam("nome"); chk("'só no Feed' guarda ajuste em ov.feed e mantém a base", abs(n["x"] - x0) < 1e-6 and abs(n["ov"]["feed"]["x"] - 0.2) < 1e-6, n)
    pg.locator(C + " [data-ed-a=fmt][data-v=story]").click(); pg.wait_for_timeout(400)
    sel("nome"); pg.wait_for_timeout(300)
    chk("no Story o nome continua na posição base", abs(float(pg.input_value(C + " [data-ed-p=x]")) - x0 * 100) < 0.6, pg.input_value(C + " [data-ed-p=x]"))
    pg.fill(C + " [data-ed-p=y]", "30"); pg.dispatch_event(C + " [data-ed-p=y]", "change"); pg.wait_for_timeout(300)
    pg.locator(C + " [data-ed-a=fmt][data-v=feed]").click(); pg.wait_for_timeout(300)
    chk("trocar de formato com ajuste pendente pergunta antes", pg.locator(C + " .ed-pergunta").count() == 1)
    pg.locator(C + " [data-ed-a=perg][data-v=dois]").click(); pg.wait_for_timeout(500)
    n = cam("nome"); chk("'Nos dois' vira base e vale no formato novo", abs(n["y"] - 0.3) < 1e-6 and "y" not in (n.get("ov", {}).get("story", {})), n)
    chk("depois de responder, o formato trocou para Feed", pg.locator(C + " [data-ed-a=fmt][data-v=feed][aria-pressed=true]").count() == 1)
    print("== Botões explicados ==")
    chk("ímã e proporção têm nome na tela", "Ímã" in pg.inner_text(C + " .ed-barra") and "Proporção" in pg.inner_text(C + " .ed-barra"))
    print("== Virar texto comum no preço ==")
    sp = spec(); sp["camadas"] = [c for c in sp["camadas"]]; cam_p = [c for c in sp["camadas"] if c["k"] == "preco"][0]; cam_p["esp"] = {"big": True}
    pg.fill(C + " [data-vz-json]", json.dumps(sp)); pg.wait_for_timeout(900)
    sel("preco"); pg.wait_for_timeout(300)
    chk("botão existe", pg.locator(C + " [data-ed-a=espoff]").count() == 1)
    pg.locator(C + " [data-ed-a=espoff]").click(); pg.wait_for_timeout(400)
    chk("virou texto comum (sem esp)", "esp" not in cam("preco"))
    chk("nenhum erro de JavaScript", not erros, erros[:3])
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
