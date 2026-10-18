"""v4.21 — a busca do admin RESPEITA o filtro Ativas/Esgotadas/Arquivadas/Todas (pedido do Pablo) e avisa quantas peças de outros filtros também combinam;
os botões da linha (Stories/Link/Postar) mostram o emoji certo (\\u1F3A8 sem chaves virava "ˮ18").   python3 tests/admin_busca_status.py"""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + (" — " + str(e) if e and not c else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block"); ctx.add_init_script(SESSION)
    st = install(ctx, versao="4.20"); P = st["produtos"]
    for i, q in enumerate(P[:6]):
        q["Nome"] = "Calça Cargo Jeans %d" % i; q["Status"] = "Ativo" if i < 2 else "Arquivado"; q["Estoque"] = 3
    pg = ctx.new_page(); er = []; pg.on("pageerror", lambda e: er.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2200)
    pg.fill("#busca-admin", "cargo"); pg.wait_for_timeout(500)
    nomes = pg.evaluate("[...document.querySelectorAll('#lista-produtos .produto .nome')].map(e=>e.textContent)")
    chk("com 'Ativas' marcado, a busca mostra SÓ as ativas (2)", len(nomes) == 2, nomes)
    chk("nenhuma peça arquivada aparece", pg.locator("#lista-produtos .produto.arquivado").count() == 0)
    aviso = pg.inner_text("#lista-produtos .aviso-busca") if pg.locator(".aviso-busca").count() else ""
    chk("avisa que mais 4 peças fora de 'Ativas' também combinam", "4 peças" in aviso and "Ativas" in aviso, aviso)
    pg.click("#busca-ver-todas"); pg.wait_for_timeout(500)
    chk("'Ver em Todas' troca o filtro e mostra as 6", pg.locator("#lista-produtos .produto").count() == 6 and "selecionado" in (pg.get_attribute('#filtros-lista [data-f=todas]', 'class') or ""), pg.locator("#lista-produtos .produto").count())
    chk("em 'Todas' não aparece mais o aviso", pg.locator(".aviso-busca").count() == 0)
    pg.click("#filtros-lista [data-f=arquivadas]"); pg.wait_for_timeout(400)
    chk("filtro 'Arquivadas' + busca: só as 4 arquivadas e aviso das 2 ativas", pg.locator("#lista-produtos .produto").count() == 4 and "2 peças" in pg.inner_text(".aviso-busca"))
    pg.click("#filtros-lista [data-f=ativas]"); pg.fill("#busca-admin", "zzzz"); pg.wait_for_timeout(400)
    chk("busca sem resultado diz o filtro em que procurou", "em “Ativas”" in pg.inner_text("#lista-produtos"), pg.inner_text("#lista-produtos"))
    pg.fill("#busca-admin", ""); pg.wait_for_timeout(400)
    t = pg.evaluate("[...document.querySelectorAll('#lista-produtos .produto')][0].textContent")
    chk("botões da linha com emoji certo (🎨 Stories, 🔗 Link, 📸 Postar)", "\U0001F3A8 Stories" in t and "\U0001F517 Link" in t and "\U0001F4F8 Postar" in t and "\\u1F" not in t, t[-120:])
    src = open(os.path.join(AQUI, "..", "admin.html"), encoding="utf-8").read()
    import re
    chk("nenhum escape \\uXXXXX de 5 dígitos sobrou no admin.html", not re.search(r"\\u1F[0-9A-Fa-f]{3}", src))
    chk("sem erro de JavaScript", not er, er); b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)))
sys.exit(1 if BAD else 0)
