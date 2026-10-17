"""Painel -> R2: fotos e vídeos NOVOS vão para o Worker de mídia; foto/vídeo grande, PIN antigo ou falha do R2 caem no Cloudinary (o envio nunca para)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI); os.makedirs(os.path.join(AQUI, "saida"), exist_ok=True)
import mock
from mock import *
from playwright.sync_api import sync_playwright
from PIL import Image
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
S = os.path.join(AQUI, "saida")
Image.new("RGB", (900, 1200), (190, 60, 110)).save(os.path.join(S, "r2foto1.jpg")); Image.new("RGB", (900, 1200), (60, 90, 190)).save(os.path.join(S, "r2foto2.jpg"))
open(os.path.join(S, "r2v.mp4"), "wb").write(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 2000)
open(os.path.join(S, "r2grande.mp4"), "wb").write(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * (16 * 1048576))
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + (" — " + str(e) if e and not c else ""))

def cenario(p, modo, video, sessao=True):
    b = p.chromium.launch(args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    ctx.add_init_script(SESSION if sessao else "localStorage.removeItem('tm_session');")
    log = []; ups = []
    st = install(ctx, log=log, versao="3.5"); st["midia"]["modo"] = modo
    def cl(route):
        u = route.request.url; ups.append(u)
        return route.fulfill(json={"secure_url": "https://res.cloudinary.com/z/%s/upload/v1/up%d.%s" % ("video" if "/video/" in u else "image", len(ups), "mp4" if "/video/" in u else "jpg")})
    ctx.route("https://api.cloudinary.com/**", cl)
    def assin(route):
        r = route.request
        if r.method == "POST" and '"assinarUploadVideo"' in (r.post_data or ""): return route.fulfill(json={"ok": True, "cloudName": "z", "apiKey": "k", "timestamp": 1, "folder": "f", "signature": "s"})
        return route.fallback()
    ctx.route("**script.google.com/**", assin)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(1500)
    if not sessao: pg.evaluate("window.adminPin && 0")
    pg.evaluate("document.getElementById('card-form').open=true"); pg.wait_for_timeout(300)
    pg.set_input_files("#galeria-input", [os.path.join(S, "r2foto1.jpg"), os.path.join(S, "r2foto2.jpg")]); pg.wait_for_timeout(1200)
    pg.set_input_files("#video-input", os.path.join(S, video)); pg.wait_for_timeout(500)
    pg.fill("#nome", "Vestido R2"); pg.fill("#preco", "99.90"); pg.fill("#estoque", "2")
    pg.click("#chips-genero .chip:first-child")
    pg.click("#btn-abrir-categorias"); pg.click("#cat-lista .cat-item:has-text('Vestido')"); pg.click("#cat-pronto")
    pg.locator('#chips-tamanhos .chip').filter(has_text=__import__('re').compile(r'^P$')).click()
    pg.click("#btn-salvar"); pg.wait_for_timeout(4500)
    cr = [x for x in log if x.get("action") == "create"]
    r = (st, cr, ups, errs); b.close(); return r

with sync_playwright() as p:
    print("== R2 aceita: 2 fotos + vídeo pequeno ==")
    st, cr, ups, errs = cenario(p, "ok", "r2v.webm")
    chk("3 envios ao R2", len(st["midia"]["envios"]) == 3, len(st["midia"]["envios"]))
    chk("nada foi ao Cloudinary", len(ups) == 0, ups)
    chk("envio leva a sessão (token, não senha) e o WhatsApp", all((e["sessao"] or "").startswith("tk") and e["whats"] == "88999999999" for e in st["midia"]["envios"]), st["midia"]["envios"][:1])
    chk("peça criada com URLs do R2 (capa, galeria e vídeo)", len(cr) == 1 and cr[0]["fotoUrlExistente"].startswith("https://tenkiter-midia.") and cr[0]["fotosGaleriaExistentes"].count("tenkiter-midia") == 1 and cr[0].get("videoUrlExistente", "").endswith(".webm") and "tenkiter-midia" in cr[0].get("videoUrlExistente", ""), cr and {k: cr[0].get(k) for k in ("fotoUrlExistente", "fotosGaleriaExistentes", "videoUrlExistente")})
    chk("sem erro de JavaScript", not errs, errs)
    ps = st["midia"].get("posters", [])
    chk("miniatura do vídeo (um quadro JPG pequeno) enviada ao R2 para o vídeo certo", len(ps) == 1 and 500 < ps[0]["tam"] <= 400 * 1024 and ps[0]["chave"].endswith(".webm") and ps[0]["ctype"] in (None, "image/jpeg", "text/plain;charset=UTF-8"), ps)
    print("== Vídeo de 16 MB: passa do limite do R2, vai ao Cloudinary; fotos seguem no R2 ==")
    st, cr, ups, errs = cenario(p, "ok", "r2grande.mp4")
    chk("fotos no R2 (2) e vídeo grande no Cloudinary (1)", len(st["midia"]["envios"]) == 2 and len(ups) == 1 and "/video/" in ups[0], (len(st["midia"]["envios"]), ups))
    chk("peça criada: foto do R2, vídeo do Cloudinary", len(cr) == 1 and cr[0]["fotoUrlExistente"].startswith("https://tenkiter-midia.") and "res.cloudinary.com" in cr[0].get("videoUrlExistente", ""), cr and cr[0].get("videoUrlExistente"))
    print("== R2 recusa (armazenamento cheio): cai no Cloudinary sem parar o envio ==")
    st, cr, ups, errs = cenario(p, "cheio", "r2v.mp4")
    chk("R2 tentado e recusado, tudo vai ao Cloudinary (3)", len(ups) == 3 and len(cr) == 1 and cr[0]["fotoUrlExistente"].startswith("https://res.cloudinary.com"), (len(ups), len(cr)))
    chk("sem erro de JavaScript", not errs, errs)
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
