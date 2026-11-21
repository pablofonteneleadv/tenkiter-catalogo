"""v7.84.0 — Postagens: aviso do teto do Instagram ANTES de postar (50 publicações por API a cada 24 h).

Cobre: ao tocar em Postar com o Instagram entre os destinos, a tela pergunta ao servidor (/post/previsao-ig, só leitura). Se o teto vai
atrasar algo, aparece o aviso "Limite do Instagram" logo acima do botão, com a frase do servidor e as saídas; nada é criado ainda.
"Postar assim mesmo" envia de verdade; "Só WhatsApp" troca o destino sem enviar; "Escolher menos" só fecha o aviso. Sem problema
no teto, envia direto sem aviso. Servidor antigo (rota inexistente) não trava o envio. 390 e 1440 sem rolagem horizontal, botões
do aviso >= 44 px, foco no aviso. Worker simulado (mock.py); nada sai da máquina.
Uso: TK_BASE=http://localhost:8765/ python3 tests/postagens_teto_ig_ui.py"""
import sys, os, re, json
from pathlib import Path
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
EVID = Path(AQUI).parent / "docs" / "ux" / "postagens-teto-instagram-20261120"
EVID.mkdir(parents=True, exist_ok=True)
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)[:300]) if (e and not c) else ""))

PREV_RUIM = {"ok": True, "aplica": True, "teto": 50, "usados": 48, "naFila": 0, "n": 1, "atrasadas": 1, "amanha": 0, "cabemSemAtraso": 0, "problema": True,
             "frase": "O Instagram aceita 50 publicações a cada 24 h. Já saíram 50. Esta publicação vai esperar vaga: sai por volta das 16:15.",
             "solucoes": [{"id": "seguir", "texto": "Postar assim mesmo: o WhatsApp sai no horário e o Instagram sai sozinho quando abrir vaga (último por volta das 16:15)."},
                          {"id": "whatsapp", "texto": "Mandar só para o WhatsApp (o Instagram fica de fora deste envio)."},
                          {"id": "depois", "texto": "Agendar para mais tarde (a próxima vaga abre por volta das 16:15)."}]}
PREV_BOA = {"ok": True, "aplica": True, "teto": 50, "usados": 3, "problema": False, "frase": "Cabem.", "solucoes": []}

def corpo(pg): return pg.inner_text("#po-corpo")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for largura, altura in ((390, 844), (1440, 900)):
        ctx = b.new_context(viewport={"width": largura, "height": altura}, is_mobile=largura < 500, has_touch=largura < 500, service_workers="block", timezone_id="America/Fortaleza")
        ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
        st = install(ctx, versao="4.3"); st["midia"]["modo"] = "ok"; g = st["ig"]
        erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
        estado = {"prev": PREV_RUIM, "pedidos": [], "ausente": False}
        def rota(route):
            if route.request.method == "POST":
                try: estado["pedidos"].append(json.loads(route.request.post_data or "{}"))
                except Exception: estado["pedidos"].append({})
            if estado["ausente"]:
                return route.fulfill(status=404, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps({"ok": False, "erro": "Rota não encontrada."}))
            return route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"}, body=json.dumps(estado["prev"]))
        pg.route(re.compile(r".*/post/previsao-ig$"), rota)
        def envios(): return [x for x in g.get("post_chamadas", []) if x["path"] == "/post"]
        def abrir_feed(codigo):
            pg.click("#po-abas [data-aba=nova]") if pg.locator("#po-abas [data-aba=nova]").count() else None
            pg.wait_for_timeout(400)
            pg.fill("#po-busca", codigo); pg.wait_for_timeout(300); pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(400); pg.click("[data-tipo=feed]"); pg.wait_for_timeout(1200)
        pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
        pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(700)
        abrir_feed("TK-0003")
        print("== %d px ==" % largura)
        pg.click("[data-a=enviar]"); pg.wait_for_timeout(1500)
        al = pg.locator("#po-cota-ig")
        chk("%d: o teto vai atrasar → aparece o aviso “Limite do Instagram” e nada é criado" % largura, al.count() == 1 and "Limite do Instagram" in al.inner_text() and len(envios()) == 0, [al.count(), len(envios())])
        chk("%d: a tela perguntou ao servidor com o tipo e o destino" % largura, estado["pedidos"] and estado["pedidos"][-1].get("tipo") == "feed" and estado["pedidos"][-1].get("canal") in ("ambos", "instagram"), estado["pedidos"][-1:] )
        chk("%d: o aviso mostra a frase do servidor e as 3 saídas" % largura, "Já saíram 50" in al.inner_text() and al.locator("button").count() == 3, al.inner_text())
        chk("%d: o aviso recebe o foco (leitor de tela e teclado)" % largura, pg.evaluate("document.activeElement && document.activeElement.id") == "po-cota-ig")
        alturas = [bx["height"] for bx in [x.bounding_box() for x in al.locator("button").all()] if bx]
        chk("%d: botões do aviso com pelo menos 44 px" % largura, alturas and min(alturas) >= 44, alturas)
        bx = al.bounding_box()
        chk("%d: o aviso cabe na largura, sem rolagem horizontal" % largura, bx and bx["x"] >= 0 and bx["x"] + bx["width"] <= largura and pg.evaluate("document.documentElement.scrollWidth") <= largura, [bx, pg.evaluate("document.documentElement.scrollWidth")])
        al.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        pg.screenshot(path=str(EVID / ("aviso-teto-%d.png" % largura)))
        # "Só WhatsApp": troca o destino, fecha o aviso, não envia
        pg.click("#po-cota-ig [data-sol=whatsapp]"); pg.wait_for_timeout(600)
        chk("%d: “Só WhatsApp” fecha o aviso, troca o destino e não envia" % largura, pg.locator("#po-cota-ig").count() == 0 and len(envios()) == 0 and "só WhatsApp" in corpo(pg), corpo(pg)[:200])
        pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
        chk("%d: com destino só WhatsApp não há pergunta do Instagram e o envio sai" % largura, len(envios()) == 1 and envios()[-1]["corpo"].get("canal") == "whatsapp", [len(envios()), envios()[-1]["corpo"].get("canal") if envios() else None])
        # "Postar assim mesmo": envia de verdade, sem perguntar de novo
        abrir_feed("TK-0004"); pg.wait_for_timeout(300)
        n0 = len(envios()); pg.click("[data-a=enviar]"); pg.wait_for_timeout(1500)
        chk("%d: de novo o aviso (outra peça, Instagram nos destinos)" % largura, pg.locator("#po-cota-ig").count() == 1 and len(envios()) == n0)
        pg.click("#po-cota-ig [data-sol=seguir]"); pg.wait_for_timeout(2500)
        chk("%d: “Postar assim mesmo” envia uma vez, sem perguntar de novo" % largura, len(envios()) == n0 + 1 and pg.locator("#po-cota-ig").count() == 0, len(envios()) - n0)
        # Sem problema no teto: envia direto
        estado["prev"] = PREV_BOA; abrir_feed("TK-0005"); n0 = len(envios()); pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
        chk("%d: com vaga, envia direto sem aviso" % largura, len(envios()) == n0 + 1)
        # Servidor antigo (sem a rota): não trava o envio
        estado["ausente"] = True; abrir_feed("TK-0006"); n0 = len(envios()); pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
        chk("%d: servidor sem a previsão não trava o envio" % largura, len(envios()) == n0 + 1)
        chk("%d: sem erro de JavaScript" % largura, not erros, erros)
        ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
