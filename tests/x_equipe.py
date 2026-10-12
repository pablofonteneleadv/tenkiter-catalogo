"""X de arquivar no catálogo (v3.7): só Equipe do site (catalogo_cadastrar) ou maior vê; arquiva a peça, uma foto ou o vídeo, com confirmação e Desfazer.
O Apps Script e a internet são SIMULADOS (mock.py, versao 3.7)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
G = ["https://res.cloudinary.com/z/image/upload/v1/g%d.jpg" % i for i in (1, 2, 3)]
VIDEO = "https://res.cloudinary.com/z/video/upload/v1/tenkiter-catalogo/v1.mp4"

def abrir(b, perms, versao="3.7", sessao=True):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    st = install(ctx, perms=perms, versao=versao)
    P = st["produtos"][0]; P["Fotos_Galeria"] = ",".join(G); P["Video_URL"] = VIDEO
    ctx.add_init_script(SESSION if sessao else "localStorage.removeItem('tm_session');")
    ctx.route("**/video/upload/**", lambda r: r.fulfill(body=b"\x00", content_type="video/mp4", headers={"Access-Control-Allow-Origin": "*"}))
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    msgs = []; pg.on("dialog", lambda d: (msgs.append(d.message), d.accept() if st.get("aceitar", True) else d.dismiss()))
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(1200)
    return ctx, pg, st, msgs, erros

with sync_playwright() as p:
    b = p.chromium.launch()
    print("== Quem NÃO vê o X ==")
    ctx, pg, st, m, er = abrir(b, ["portal"]); chk("cliente comum (sem catalogo_cadastrar): nenhum X", pg.locator(".x-equipe").count() == 0); chk("cliente comum: sem botão de cadastrar", pg.locator("#btn-nova-peca:visible").count() == 0); ctx.close()
    ctx, pg, st, m, er = abrir(b, PERMS_ALL, sessao=False); chk("sem entrar na conta: nenhum X", pg.locator(".x-equipe").count() == 0); ctx.close()
    ctx, pg, st, m, er = abrir(b, PERMS_ALL, versao="3.6"); chk("backend antigo (sem midiaRapida): nenhum X (nada de botão que não funciona)", pg.locator(".x-equipe").count() == 0); ctx.close()

    print("== Equipe do site vê o X na grade ==")
    ctx, pg, st, msgs, erros = abrir(b, PERMS_ALL)
    n = pg.locator(".card").count()
    chk("equipe vê o botão ➕ Cadastrar nova peça, que leva ao MESMO cadastro do painel", pg.locator("#btn-nova-peca:visible").count() == 1 and pg.get_attribute("#btn-nova-peca", "href") == "admin.html?novo=1")
    chk("um X diferenciado em cada card da grade", pg.locator(".card .x-equipe").count() == n and n > 3, (pg.locator(".card .x-equipe").count(), n))
    chk("o X fica no canto esquerdo de cima da foto", pg.evaluate("(()=>{const x=document.querySelector('.card .x-equipe').getBoundingClientRect(), c=document.querySelector('.card .img-wrap').getBoundingClientRect(); return x.left-c.left<20 && x.top-c.top<20})()"))
    chk("tocar no X NÃO abre a peça", (pg.locator(".card .x-equipe").first.click(), pg.wait_for_timeout(400), pg.locator("#overlay.aberto").count() == 0)[2])
    chk("pediu confirmação com o nome da peça", msgs and "Arquivar a peça" in msgs[-1], msgs)
    c = [x for x in st.get("x_chamadas", []) if x["action"] == "arquivarRapido"]
    chk("chamou arquivarRapido com a sessão (token, nunca senha)", len(c) == 1 and str(c[0].get("sessao", "")).startswith("tk") and c[0].get("whatsapp") == "88999999999", c)
    pg.wait_for_timeout(300)
    chk("a peça sumiu da grade", pg.locator(".card").count() == n - 1 and pg.locator("#toast-equipe.visivel").count() == 1)
    st["aceitar"] = False; antes = len(st["x_chamadas"])
    pg.locator(".card .x-equipe").first.click(); pg.wait_for_timeout(300)
    chk("cancelar a confirmação não chama o servidor nem tira nada", len(st["x_chamadas"]) == antes and pg.locator(".card").count() == n - 1)
    st["aceitar"] = True
    ctx.close()

    print("== X em cada foto e no vídeo dentro da peça ==")
    ctx, pg, st, msgs, erros = abrir(b, PERMS_ALL)
    pg.locator(".card", has_text=st["produtos"][0]["Codigo"]).first.locator(".abrir-peca").click(); pg.wait_for_selector("#overlay.aberto"); pg.wait_for_timeout(300)
    chk("X grande sobre a foto que está na tela", pg.locator("#x-slide").count() == 1)
    chk("X pequeno em cada miniatura (4 fotos + vídeo = 5)", pg.locator(".thumb-wrap .x-equipe").count() == 5, pg.locator(".thumb-wrap .x-equipe").count())
    pg.locator(".thumb-wrap .x-equipe").nth(2).click(); pg.wait_for_timeout(700)
    chk("confirmação de FOTO", msgs and "Tirar esta FOTO" in msgs[-1] and "dá para desfazer" in msgs[-1], msgs)
    c = [x for x in st["x_chamadas"] if x["action"] == "arquivarMidia"]
    chk("pediu arquivarMidia da foto certa (a 3ª = galeria 2)", len(c) == 1 and c[0]["tipo"] == "foto" and c[0]["url"] == G[1], c)
    chk("sobraram 4 miniaturas (3 fotos + vídeo) e a janela continua aberta", pg.locator(".thumb-wrap").count() == 4 and pg.locator("#overlay.aberto").count() == 1, pg.locator(".thumb-wrap").count())
    chk("aparece 'Desfazer'", pg.locator("#toast-equipe.visivel #toast-equipe-btn:not([hidden])").count() == 1)
    pg.click("#toast-equipe-btn"); pg.wait_for_timeout(900)
    chk("Desfazer chama restaurarMidia", any(x["action"] == "restaurarMidia" for x in st["x_chamadas"]))
    chk("a foto voltou (5 miniaturas)", pg.locator(".thumb-wrap").count() == 5, pg.locator(".thumb-wrap").count())
    pg.locator(".thumb-wrap .x-equipe").nth(4).click(); pg.wait_for_timeout(700)
    c = [x for x in st["x_chamadas"] if x["action"] == "arquivarMidia"]
    chk("X do vídeo: confirmação de VÍDEO e tipo video", "VÍDEO" in msgs[-1] and c[-1]["tipo"] == "video", (msgs[-1], c[-1]))
    chk("o vídeo saiu da peça", pg.locator(".thumb-video").count() == 0)
    pg.click("#x-slide"); pg.wait_for_timeout(700)
    c = [x for x in st["x_chamadas"] if x["action"] == "arquivarMidia"]
    chk("X grande tira a foto que está na tela (foto, de dentro da peça)", c[-1]["tipo"] == "foto" and c[-1]["url"] in G, c[-1])
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close()

    print("== Única foto não sai ==")
    ctx, pg, st, msgs, erros = abrir(b, PERMS_ALL)
    pg.locator(".card", has_text=st["produtos"][1]["Codigo"]).first.locator(".abrir-peca").click(); pg.wait_for_selector("#overlay.aberto"); pg.wait_for_timeout(300)
    n0 = len([x for x in st.get("x_chamadas", []) if x["action"] == "arquivarMidia"])
    pg.click("#x-slide"); pg.wait_for_timeout(500)
    chk("peça com 1 foto só: avisa para arquivar a peça e não chama o servidor", msgs and "única foto" in msgs[-1] and len([x for x in st.get("x_chamadas", []) if x["action"] == "arquivarMidia"]) == n0, msgs)
    ctx.close()

    print("== Visualização não é contada de novo ==")
    ctx, pg, st, msgs, erros = abrir(b, PERMS_ALL)
    pg.locator(".card", has_text=st["produtos"][0]["Codigo"]).first.locator(".abrir-peca").click(); pg.wait_for_selector("#overlay.aberto"); pg.wait_for_timeout(500)
    v0 = len([e for e in st.get("eventos", []) if e.get("tipo") == "visualizacao"]) if isinstance(st.get("eventos"), list) else None
    pg.locator(".thumb-wrap .x-equipe").nth(1).click(); pg.wait_for_timeout(800)
    v1 = len([e for e in st.get("eventos", []) if e.get("tipo") == "visualizacao"]) if isinstance(st.get("eventos"), list) else None
    chk("tirar uma foto não conta outra visualização da peça", v0 == v1, (v0, v1))
    ctx.close(); b.close()

print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
