"""Mensagens v7.30: "Mostrar prévia do link" escolhida em cada mensagem do WhatsApp (caixinha junto da mensagem).
Marcada, o envio leva previa + título/descrição do cartão (produto, seleção ou loja). Serviços simulados (mock.py + mock_msg.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
import mock_msg
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
EVID = os.environ.get("TK_EVID", "")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.getElementById('overlay-mensagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+'×'+v.nodes.length)}")
    chk("axe — " + label, not r, r)
def foto(pg, nome):
    if EVID: pg.screenshot(path=os.path.join(EVID, nome))
def tela(b, w, h, mob, conv=4):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4"); S = st["ig"].setdefault("msg", mock_msg.novo_estado())
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2800)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000); pg.wait_for_timeout(600)
    pg.click("#ms-lista .ms-conv[data-id='%d']" % conv); pg.wait_for_selector("#ms-texto", timeout=4000)
    return ctx, pg, S, erros
def produto(pg, termo="vestido liso"):
    pg.click("[data-ms=gaveta-produtos]"); pg.wait_for_selector("#ms-gaveta", timeout=3000)
    pg.fill("#ms-prod-busca", termo); pg.wait_for_timeout(300)
    nome = pg.locator("#ms-prod-lista .ms-prod b").first.text_content()
    pg.locator("#ms-prod-lista [data-ms=prod-usar]").first.click(); pg.wait_for_timeout(250)
    return nome
VIS = "(()=>{const w=document.getElementById('ms-previa');return !!w&&!w.hidden&&w.offsetHeight>0})()"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx, pg, S, erros = tela(b, 390, 844, True)
    print("== Aparece só quando faz sentido ==")
    chk("sem texto: a caixinha não aparece", not pg.evaluate(VIS))
    pg.fill("#ms-texto", "Oi, tudo bem?"); pg.wait_for_timeout(100)
    chk("texto sem link: continua escondida", not pg.evaluate(VIS))
    pg.fill("#ms-texto", "")
    nome = produto(pg)
    chk("com link na mensagem (produto): aparece 'Mostrar prévia do link'", pg.evaluate(VIS) and "Mostrar prévia do link" in pg.locator("#ms-previa").inner_text())
    chk("começa desmarcada (como era antes)", not pg.is_checked("#ms-previa-chk"))
    alvo = pg.locator("#ms-previa label").bounding_box()
    chk("área de toque da caixinha ≥ 44 px de altura", alvo["height"] >= 44, alvo)
    axe(pg, "caixinha da prévia")
    foto(pg, "01-desmarcada-390.png")
    print("== Envio ==")
    pg.click("#ms-enviar"); pg.wait_for_timeout(500)
    e = S["envios"][-1]
    chk("desmarcada: envia sem prévia", not e.get("previa"), e)
    chk("depois de enviar, a caixinha some (mensagem vazia)", not pg.evaluate(VIS))
    produto(pg); pg.check("#ms-previa-chk"); foto(pg, "02-marcada-390.png")
    pg.click("#ms-enviar"); pg.wait_for_timeout(500)
    e = S["envios"][-1]
    chk("marcada: envia com prévia, título = nome da peça e descrição com preço e tamanhos",
        e.get("previa") is True and e.get("previaTitulo") == nome and "à vista" in e.get("previaDescricao", "") and "/p/" in e.get("texto", ""), e)
    produto(pg)
    chk("a escolha fica lembrada no próximo link do mesmo canal", pg.is_checked("#ms-previa-chk"))
    pg.fill("#ms-texto", ""); pg.wait_for_timeout(100)
    pg.click("[data-ms=gaveta-produtos]"); pg.fill("#ms-prod-busca", "vestido"); pg.wait_for_timeout(300)
    for i in range(2): pg.locator("#ms-prod-lista .ms-prod-marca").nth(i).tap()
    pg.click("[data-ms=prodsel-usar]"); pg.wait_for_timeout(250); pg.click("#ms-enviar"); pg.wait_for_timeout(500)
    e = S["envios"][-1]
    chk("seleção com prévia: cartão 'Peças separadas para você · 2 peças'", e.get("previa") is True and e.get("previaTitulo") == "Peças separadas para você" and e.get("previaDescricao") == "2 peças na TENKiTER Modas", e)
    pg.fill("#ms-texto", "Olha https://exemplo.com/x"); pg.wait_for_timeout(100); pg.click("#ms-enviar"); pg.wait_for_timeout(500)
    e = S["envios"][-1]
    chk("link de fora: prévia sem inventar título (o WhatsApp decide)", e.get("previa") is True and e.get("previaTitulo") == "" and e.get("previaDescricao") == "", e)
    pg.uncheck("#ms-previa-chk") if pg.evaluate(VIS) else None
    chk("sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
    chk("sem erros de JS (390)", not erros, erros); ctx.close()
    print("== Instagram ==")
    ctx, pg, S, erros = tela(b, 390, 844, True, conv=5)
    canal = next(c["canal"] for c in S["convs"] if c["id"] == 5)
    pg.fill("#ms-texto", "Veja https://tenkitermodas.com.br/p/TK-0005"); pg.wait_for_timeout(100)
    chk("Instagram (" + canal + "): a caixinha não aparece (o Instagram decide a prévia)", canal == "instagram" and not pg.evaluate(VIS))
    chk("sem erros de JS (Instagram)", not erros, erros); ctx.close()
    for (w, h, mob, nome_f) in [(412, 915, True, "03-marcada-412.png"), (1440, 900, False, "04-marcada-1440.png")]:
        ctx, pg, S, erros = tela(b, w, h, mob)
        produto(pg); pg.check("#ms-previa-chk"); pg.wait_for_timeout(100)
        box = pg.locator("#ms-previa").bounding_box(); comp = pg.locator(".ms-compor").bounding_box()
        chk("%d px: caixinha logo acima da mensagem, dentro da tela" % w, pg.evaluate(VIS) and box["y"] + box["height"] <= comp["y"] + 1 and comp["y"] + comp["height"] <= h + 0.5, [box, comp])
        chk("%d px: sem rolagem horizontal" % w, pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
        axe(pg, "%d px" % w); foto(pg, nome_f)
        chk("sem erros de JS (%d)" % w, not erros, erros); ctx.close()
    b.close()
print("\n%d ok, %d falhas" % (len(OK), len(BAD)))
if BAD: sys.exit(1)
