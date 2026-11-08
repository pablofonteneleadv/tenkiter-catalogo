"""Fotos leves + painel leve (07/11/2026). Serviços SIMULADOS (Apps Script e Worker de mídia); fotos de 1080 px de verdade (JPEG ~300 KB) servidas do disco.
Mede, em 390 px com a CPU 4x mais lenta (celular simples):
  - vitrine: bytes de imagem ao abrir e ao rolar (meta: < 1 MB com as cópias de 480 px);
  - painel (admin.html) ANTES do login: nós do DOM na lista e bytes de imagem (meta: lista vazia e 0 byte de foto);
  - painel DEPOIS do login: tempo até a lista ficar utilizável e bytes de foto.
Uso: TK_BASE=http://localhost:8765/ python3 tests/painel_leve.py   (TK_SO_MEDIR=1 só imprime os números, sem exigir metas — serve para comparar com a main antiga)."""
import sys, os, io, json, random, tempfile, time, importlib.util
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
from PIL import Image, ImageFilter
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
SO_MEDIR = os.environ.get("TK_SO_MEDIR") == "1"
OK = []; BAD = []
def chk(n, c, e=""):
    if SO_MEDIR: return
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))

# --- fotos de 1080 px "de verdade" (textura + ruído; JPEG q88 dá 250-450 KB como as do R2) e as cópias de 480 px feitas pelo mesmo código do backfill ---
spec = importlib.util.spec_from_file_location("gerar_minis", os.path.join(os.path.dirname(AQUI), "scripts", "fotos", "gerar_minis.py")); gm = importlib.util.module_from_spec(spec); spec.loader.exec_module(gm)
def foto(seed):
    rnd = random.Random(seed); base = Image.new("RGB", (54, 68))
    base.putdata([(rnd.randint(40, 230), rnd.randint(40, 230), rnd.randint(40, 230)) for _ in range(54 * 68)])
    im = base.resize((1080, 1350), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))
    ru = Image.effect_noise((1080, 1350), 28).convert("RGB")
    im = Image.blend(im, ru, 0.2)
    b = io.BytesIO(); im.save(b, "JPEG", quality=82); return b.getvalue()
ORIG = [foto(s) for s in range(8)]; MINI = [gm.reduzir(o, 480) for o in ORIG]; MINI240 = [gm.reduzir(o, 240) for o in ORIG]
if not SO_MEDIR: print("fotos: original %d KB (média), cópia 480 px %d KB, cópia 240 px %d KB" % (sum(map(len, ORIG)) // 8 // 1024, sum(map(len, MINI)) // 8 // 1024, sum(map(len, MINI240)) // 8 // 1024))

def produtos(n=697):
    out = prods(n)
    for i, p in enumerate(out):
        h = "%020x" % (0xabc000 + i * 7919)
        base = "https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/2026%02d/" % (9 + i % 2)
        p["Foto_URL"] = base + h + ".jpg"
        p["Fotos_Galeria"] = base + "%020x" % (0xabc000 + i * 7919 + 1) + ".jpg" if i % 2 == 0 else ""
        p["Status"] = "Arquivado" if i % 11 == 10 else "Ativo"
    return out

def midia_falsa(ctx, reg, com_mini=True):
    """Worker de mídia simulado: ?w=480 devolve a cópia (como o real); sem ?w devolve a original."""
    def h(route):
        u = route.request.url
        if route.request.method != "GET" or "/m/" not in u: return route.fallback()
        chave = u.split("/m/")[1].split("?")[0]; i = int(chave.split("/")[1].split(".")[0], 16) % 8
        mini = ("w=480" in u or "w=240" in u) and com_mini
        corpo = (MINI240[i] if "w=240" in u else MINI[i]) if mini else ORIG[i]; reg.append((u, len(corpo), mini))
        return route.fulfill(body=corpo, content_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*"})
    ctx.route("https://tenkiter-midia.*/**", h)

def contexto(b, sessao=True, reg=None, largura=390):
    ctx = b.new_context(viewport={"width": largura, "height": 844}, is_mobile=largura < 600, has_touch=largura < 600, service_workers="block")
    if sessao: ctx.add_init_script(SESSION)
    st = install(ctx, perms=PERMS_ALL, versao="4.28"); st["produtos"][:] = produtos()
    midia_falsa(ctx, reg if reg is not None else [])
    return ctx, st

def kb(reg): return round(sum(x[1] for x in reg) / 1024)

M = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []

    # ---------------- vitrine ----------------
    reg = []; ctx, st = contexto(b, sessao=False, reg=reg)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    cdp = ctx.new_cdp_session(pg); cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".card, .produto-card, [data-id]", timeout=20000); pg.wait_for_timeout(2500)
    M["vitrine_abrir_kb"] = kb(reg); M["vitrine_abrir_fotos"] = len(reg)
    for _ in range(8): pg.mouse.wheel(0, 700); pg.wait_for_timeout(250)
    pg.wait_for_timeout(1500)
    M["vitrine_rolar_kb"] = kb(reg); M["vitrine_rolar_fotos"] = len(reg)
    M["vitrine_cartoes"] = pg.evaluate("document.querySelectorAll('img').length")
    ctx.close()

    # ---------------- painel ANTES do login (sem sessão: aparece a janela de entrada) ----------------
    reg = []; ctx, st = contexto(b, sessao=False, reg=reg)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); chamadas = []
    pg.on("request", lambda r: chamadas.append(r.url) if "action=list" in r.url else None)
    cdp = ctx.new_cdp_session(pg); cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    pg.goto(BASE + "admin.html"); pg.wait_for_selector("#login-overlay.visivel", timeout=20000); pg.wait_for_timeout(2500)
    M["painel_antes_login_nos_lista"] = pg.evaluate("document.querySelectorAll('#lista-produtos *').length")
    M["painel_antes_login_nos_total"] = pg.evaluate("document.querySelectorAll('*').length")
    M["painel_antes_login_fotos_kb"] = kb(reg); M["painel_antes_login_fotos"] = len(reg); M["painel_antes_login_pediu_lista"] = len(chamadas)
    # ---------------- painel DEPOIS do login ----------------
    pg.fill("#lo-whats", "88999999999"); pg.fill("#lo-senha", "senha123")
    t0 = time.time(); pg.click("#lo-entrar")
    pg.wait_for_function("document.querySelectorAll('#lista-produtos .produto:not(.sk)').length > 0", timeout=30000)
    M["painel_depois_login_ms_ate_lista"] = round((time.time() - t0) * 1000)
    pg.wait_for_timeout(2500)
    M["painel_depois_login_nos_lista"] = pg.evaluate("document.querySelectorAll('#lista-produtos *').length")
    M["painel_depois_login_cartoes"] = pg.evaluate("document.querySelectorAll('#lista-produtos .produto').length")
    M["painel_depois_login_fotos_kb"] = kb(reg); M["painel_depois_login_fotos"] = len(reg)
    M["painel_cartao_content_visibility"] = pg.evaluate("getComputedStyle(document.querySelector('#lista-produtos .produto')).contentVisibility")
    M["painel_cartao_intrinsic"] = pg.evaluate("getComputedStyle(document.querySelector('#lista-produtos .produto')).containIntrinsicSize")
    ctx.close()

    # ---------------- painel com sessão guardada (já logado): continua abrindo a lista ----------------
    reg = []; ctx, st = contexto(b, sessao=True, reg=reg)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    cdp = ctx.new_cdp_session(pg); cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    t0 = time.time(); pg.goto(BASE + "admin.html")
    pg.wait_for_function("document.querySelectorAll('#lista-produtos .produto:not(.sk)').length > 0", timeout=30000)
    M["painel_logado_ms_ate_lista"] = round((time.time() - t0) * 1000); pg.wait_for_timeout(2000)
    M["painel_logado_login_visivel"] = pg.evaluate("document.getElementById('login-overlay').classList.contains('visivel')")
    M["painel_logado_cartoes"] = pg.evaluate("document.querySelectorAll('#lista-produtos .produto').length")
    ctx.close(); b.close()

print(json.dumps(M, indent=1, ensure_ascii=False))
if SO_MEDIR: sys.exit(0)

print("== Fotos leves ==")
chk("vitrine ao abrir, em 390 px: menos de 1 MB de foto", M["vitrine_abrir_kb"] < 1024, M["vitrine_abrir_kb"])
chk("vitrine depois de rolar: menos de 1,5 MB", M["vitrine_rolar_kb"] < 1536, M["vitrine_rolar_kb"])
print("== Painel antes do login ==")
chk("lista de produtos vazia (zero nós) atrás da janela de entrada", M["painel_antes_login_nos_lista"] <= 5, M["painel_antes_login_nos_lista"])
chk("nenhuma foto baixada antes do login", M["painel_antes_login_fotos"] == 0, M["painel_antes_login_fotos"])
chk("nem a lista de produtos foi pedida ao servidor antes do login", M["painel_antes_login_pediu_lista"] == 0, M["painel_antes_login_pediu_lista"])
print("== Painel depois do login ==")
chk("a lista aparece depois de entrar", M["painel_depois_login_cartoes"] > 500, M["painel_depois_login_cartoes"])
chk("cartões só desenham o que aparece (content-visibility: auto + tamanho reservado)", M["painel_cartao_content_visibility"] == "auto" and "px" in M["painel_cartao_intrinsic"], (M["painel_cartao_content_visibility"], M["painel_cartao_intrinsic"]))
chk("fotos do painel usam as cópias leves (< 400 KB para os cartões que aparecem)", M["painel_depois_login_fotos_kb"] < 400, M["painel_depois_login_fotos_kb"])
chk("quem já estava logado vê a lista sem a janela de entrada", M["painel_logado_cartoes"] > 500 and not M["painel_logado_login_visivel"], (M["painel_logado_cartoes"], M["painel_logado_login_visivel"]))
chk("sem erro de JavaScript", not erros, erros)
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
