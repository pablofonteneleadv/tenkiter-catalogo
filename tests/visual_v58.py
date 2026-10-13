"""v5.8: texto do editor que muda de verdade, contador de letras, rascunho que sobrevive a recarregar, várias opções de texto do botão (Zona do link),
servidor lento não derruba o login."""
import sys, os, json, re
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
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    def abre():
        pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
        pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
        pg.click("[data-aba=config]"); pg.wait_for_timeout(400)
    abre(); pg.click("[data-vza=novo]"); pg.wait_for_timeout(900)
    def spec(): return json.loads(pg.input_value(C + " [data-vz-json]"))
    def cam(k): return [c for c in spec()["camadas"] if c["k"] == k][0]
    print("== Contador de letras e exemplo ==")
    pg.locator(C + " [data-ed-a=sel][data-k=nome]").click(); pg.wait_for_timeout(300)
    cont = lambda: pg.inner_text(C + " [data-ed-cont]")
    chk("mostra o contador de letras", "letras" in cont(), cont())
    pg.fill(C + " [data-ed-p=max]", "8"); pg.wait_for_timeout(300)
    chk("limite menor que o exemplo avisa quantas letras aparecem", re.search(r"Mostra 8 de \d+", cont()) is not None, cont())
    pg.select_option(C + " [data-ed-amostra]", "longo"); pg.wait_for_timeout(300)
    chk("trocar o exemplo para nome longo muda a conta", "de 4" in cont() or "de 5" in cont(), cont())
    print("== Mudança em texto de estilo especial vale ==")
    pg.locator(C + " [data-ed-a=sel][data-k=preco]").click(); pg.wait_for_timeout(300)
    sp = spec(); [c for c in sp["camadas"] if c["k"] == "preco"][0]["esp"] = {"up": True}
    pg.fill(C + " [data-vz-json]", json.dumps(sp)); pg.wait_for_timeout(900)
    pg.locator(C + " [data-ed-a=sel][data-k=nome]").click(); pg.locator(C + " [data-ed-a=sel][data-k=preco]").click(); pg.wait_for_timeout(300)
    tem_esp = "esp" in cam("preco")
    chk("o preço agora tem estilo especial (via código)", tem_esp)
    if tem_esp:
        chk("avisa que é estilo especial e oferece virar texto comum", pg.locator(C + " [data-ed-a=espoff]").count() == 1)
        pg.locator(C + " [data-ed-p=bgOn]").check(); pg.wait_for_timeout(400)
        chk("caixa de fundo desliga o estilo especial e grava o fundo", "esp" not in cam("preco") and "bg" in cam("preco"), cam("preco"))
    print("== Rascunho sobrevive a recarregar ==")
    pg.locator(C + " [data-ed-a=sel][data-k=nome]").click(); pg.wait_for_timeout(200)
    pg.fill(C + " [data-ed-p=t]", "NOME RASCUNHO {nome}"); pg.wait_for_timeout(500)
    chk("marca ● não salvo", pg.locator(C + " .vz-sujo:visible").count() >= 1)
    chk("rascunho guardado no aparelho", "NOME RASCUNHO" in (pg.evaluate("localStorage.getItem('tk_po_rascunho_visuais_v1')") or ""))
    abre()
    pg.wait_for_timeout(300)
    chk("ao voltar, recupera o que estava sendo editado", "NOME RASCUNHO" in pg.input_value(C + " [data-vz-json]") and "Recuperei" in pg.inner_text("#po-corpo"))
    pg.locator(C + " [data-vza=salvar]").click(); pg.wait_for_timeout(500)
    chk("salvar limpa o rascunho", not (json.loads(pg.evaluate("localStorage.getItem('tk_po_rascunho_visuais_v1')||'{}'"))))
    print("== Várias opções de texto do botão ==")
    if not pg.evaluate("document.querySelector(\"details[data-vz-det^='v:c_']\").open"): pg.locator("details[data-vz-det^='v:c_'] > summary").first.click(); pg.wait_for_timeout(300)
    cid = pg.get_attribute(C + " [data-vz-cta]", "data-vz-cta")
    pg.fill(C + " [data-vz-cta]", "Chame no WhatsApp\nCompre online\nVeja no site"); pg.dispatch_event(C + " [data-vz-cta]", "change"); pg.wait_for_timeout(300)
    ops = json.loads(pg.evaluate("localStorage.getItem('tk_po_cta_v1')||'{}'")).get(cid)
    chk("guarda a lista de opções", ops == ["Chame no WhatsApp", "Compre online", "Veja no site"], ops)
    pg.click("[data-aba=nova]"); pg.wait_for_timeout(400)
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(900)
    pg.click("[data-tipo=story]"); pg.wait_for_timeout(300); pg.click("[data-tpl=%s]" % cid); pg.wait_for_timeout(500)
    rd = pg.locator("input[name=po-cta]")
    chk("Story mostra as opções + 'Usar o link no Instagram' por último", rd.count() == 4 and rd.nth(3).get_attribute("value") == "link", rd.count())
    rd.nth(1).check(); pg.wait_for_timeout(300)
    chk("escolher outra opção não vira Story com link", "Preparar Story" not in pg.inner_text(".po-enviar"))
    pg.locator("input[name=po-cta][value=link]").check(); pg.wait_for_timeout(300)
    chk("a última opção liga o Story com link", "Preparar Story" in pg.inner_text(".po-enviar"))
    pg.click("[data-tipo=feed]"); pg.wait_for_timeout(300)
    chk("no Feed só aparecem as opções de texto (sem link)", pg.locator("input[name=po-cta]").count() == 3)
    print("== Servidor lento não derruba o login ==")
    ctx2 = b.new_context(viewport={"width": 1100, "height": 900}, service_workers="block")
    ctx2.add_init_script(SESSION); install(ctx2, perms=PERMS_ALL, versao="4.3")
    pg2 = ctx2.new_page(); pg2.route(re.compile(r"action=versao"), lambda r: r.fulfill(status=500, body="{}"))
    pg2.goto(BASE + "admin.html"); pg2.wait_for_timeout(3000)
    chk("versão do servidor fora do ar: continua logado (sem tela de login)", pg2.locator("#login-overlay.visivel").count() == 0)
    chk("nenhum erro de JavaScript", not erros, erros[:2])
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
