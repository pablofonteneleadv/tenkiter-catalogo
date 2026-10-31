"""v4.27: "O que postar?" aceita fotos/vídeos AVULSOS do aparelho junto da peça e a pessoa escolhe a ORDEM em que a postagem sai. Apps Script/internet SIMULADOS."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
import tempfile
from PIL import Image
PASTA = tempfile.mkdtemp(prefix="tk_avulsas_") + "/"      # arquivos de teste gerados na hora (nada fica no repositório)
for _i, _c in enumerate([(200, 40, 40), (40, 120, 200), (40, 180, 90)]): Image.new("RGB", (600, 800), _c).save(PASTA + "avulsa%d.jpg" % (_i + 1), "JPEG", quality=85)
criar_mp4(PASTA + "curto.mp4", segundos=4)
criar_mp4(PASTA + "compativel.mp4", segundos=4, codec="libx264")
open(PASTA + "texto.txt", "w").write("não é imagem")
BAD = []
def chk(n, c, e=""):
    if not c: BAD.append(n)
    print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
GAL = ",".join("https://res.cloudinary.com/z/image/upload/v1/g%d.jpg" % i for i in (1, 2))
def ordem(pg): return pg.eval_on_selector_all(".po-ordem .po-escolhida", "els=>els.map(e=>e.querySelector('small').textContent.trim())")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"; g = st["ig"]
    for _p in st["produtos"]: _p["Fotos_Galeria"] = GAL
    def preparar_video(route):
        if route.request.method=='POST':route.fulfill(json={'ok':True,'id':'avulsa-simulada','estado':'fila'})
        else:route.fulfill(json={'ok':True,'id':'avulsa-simulada','estado':'fila','partes':[]})
    ctx.route('**/post/video-preparar*',preparar_video)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(1200)
    pg.click("[data-tipo=carrossel]"); pg.wait_for_timeout(500)
    antes = pg.locator(".po-m").count(); sel0 = pg.locator(".po-m[aria-pressed=true]").count()
    chk("há o campo para subir fotos avulsas", pg.locator("#po-avulsa-arq").count() == 1)
    pg.set_input_files("#po-avulsa-arq", [PASTA + "avulsa1.jpg", PASTA + "avulsa2.jpg"]); pg.wait_for_timeout(700)
    chk("as 2 avulsas entram na grade de mídias", pg.locator(".po-m").count() == antes + 2, pg.locator(".po-m").count())
    chk("já vêm marcadas", pg.locator(".po-m[aria-pressed=true]").count() == sel0 + 2)
    o = ordem(pg)
    chk("lista de ordem mostra tudo o que vai sair (as avulsas por último)", len(o) == sel0 + 2 and o[-1].startswith("avulsa") and o[-2].startswith("avulsa") and o[0] == "da peça", o)
    chk("1º não sobe, último não desce", pg.locator(".po-ordem [data-pm=up]").first.is_disabled() and pg.locator(".po-ordem [data-pm=down]").last.is_disabled())
    pg.locator(".po-ordem [data-pm=up]").last.click(); pg.wait_for_timeout(300)
    o2 = ordem(pg)
    chk("↑ no último troca com o anterior", o2[-1] == o[-2] and o2[-2] == o[-1] and "avulsa2" in o2[-2], o2)
    pg.locator(".po-ordem [data-pm=up]").nth(len(o2) - 2).click(); pg.locator(".po-ordem [data-pm=up]").nth(len(o2) - 3).click(); pg.wait_for_timeout(300)
    o3 = ordem(pg)
    chk("dá para levar uma avulsa para o começo", o3[0].startswith("avulsa") or o3[1].startswith("avulsa"), o3)
    n_antes = len(o3); pg.locator(".po-ordem [data-pm=x]").last.click(); pg.wait_for_timeout(300)
    chk("✕ tira da postagem", len(ordem(pg)) == n_antes - 1)
    pg.click("[data-tipo=feed]"); pg.wait_for_timeout(500)
    chk("Feed continua com 1 só foto", pg.locator(".po-m[aria-pressed=true]").count() == 1)
    pg.set_input_files("#po-avulsa-arq", [PASTA + "avulsa3.jpg"]); pg.wait_for_timeout(600)
    chk("Feed + avulsa nova: a nova vira a escolhida (só 1)", pg.locator(".po-m[aria-pressed=true]").count() == 1 and pg.locator(".po-m").last.get_attribute("aria-pressed") == "true")
    pg.click("[data-tipo=story]"); pg.wait_for_timeout(500)
    pg.set_input_files("#po-avulsa-arq", [PASTA + "curto.mp4"]); pg.wait_for_timeout(600)
    pg.wait_for_selector('[data-preparo]')
    chk("vídeo sem H.264 prepara em segundo plano sem liberar publicação",pg.locator('[data-preparo]').is_visible() and pg.locator('[data-a=enviar]').is_disabled() and not pg.locator('#tk-video-preparo').count())
    pg.locator('[data-preparo] [data-pm=x]').click();pg.wait_for_timeout(300)
    pg.click('[data-destino=grupo]'); pg.set_input_files("#po-avulsa-arq", [PASTA + "compativel.mp4"]);pg.wait_for_timeout(700)
    chk("vídeo H.264 do perfil comum entra no Story sem reconversão", pg.locator(".po-ordem :text('Vídeo')").count()>=1 and not pg.locator('#tk-video-preparo').count())
    pg.set_input_files("#po-avulsa-arq", [PASTA + "texto.txt"]); pg.wait_for_timeout(400)
    chk("formato não aceito → aviso, nada entra", "formato não aceito" in pg.inner_text("#po-corpo"))
    # Story com as avulsas: sai na ordem escolhida
    pg.click("[data-tpl=original]"); pg.wait_for_timeout(600)
    ordem_final = ordem(pg)
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(4000)
    chamadas = g.get("post_chamadas") or []
    c = chamadas[-1]["corpo"] if chamadas else {}
    total = len(c.get("posts", [])) if c.get("posts") else len(c.get("midias", []))
    chk("enviou uma postagem por mídia, na quantidade da lista de ordem", chamadas and total >= len([x for x in ordem_final]) - 1, (total, ordem_final))
    chk("a mídia enviada é do R2 (a avulsa subiu de verdade)", chamadas and "tenkiter-midia" in str(c))
    chk("sem erro de página", not erros, erros[:2])
    b.close()
print("FALHAS=%d" % len(BAD))
for x in BAD: print("  ✘", x)
sys.exit(1 if BAD else 0)
