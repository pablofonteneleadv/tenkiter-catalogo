#!/usr/bin/env python3
"""v7.89.0 — Famílias no "Cadastrar vários produtos" e família ao copiar dados (pedido do Pablo, 22/11/2026).
Apps Script e Worker SIMULADOS (tests/mock.py); nada toca em serviço real.
  1. "👪 Família": marcar produtos (foto solta ou grupo unido) e formar famílias; várias famílias; selos F1/F2; desfazer.
  2. Ao cadastrar, cada família é ligada com os produtos criados (uma chamada por família, com todos os produtos).
  3. Copiar dados de um produto que tem família: o formulário mostra a família; ao cadastrar, o produto novo entra nela.
     "Não ligar à família" desfaz. No "vários produtos", quem não tem família própria entra na família copiada.
  4. Painel enxuto: toques de 44 px, sem rolagem lateral (390 e 1440).
    TK_BASE=http://127.0.0.1:8777/ python tests/familias_varias_ui.py"""
import sys, os, io, re
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import install, SESSION
from playwright.sync_api import sync_playwright
from PIL import Image
from pathlib import Path
BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8777/")
EVID = Path(os.environ.get("TK_EVID", os.path.join(AQUI, "saida", "familias-varias"))); EVID.mkdir(parents=True, exist_ok=True)
TMP = EVID / "_fotos"; TMP.mkdir(parents=True, exist_ok=True)
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + (" — " + str(e)[:400] if not c else ""))
CORES = [(196, 120, 92), (64, 96, 150), (40, 120, 90), (170, 60, 80), (220, 180, 90), (90, 70, 140)]
FOTOS = []
for i, c in enumerate(CORES):
    f = TMP / ("f%d.jpg" % (i + 1)); b = io.BytesIO(); Image.new("RGB", (480, 600), c).save(b, "JPEG", quality=80); f.write_bytes(b.getvalue()); FOTOS.append(str(f))

def contexto(b, w, h):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, service_workers="block")
    ctx.add_init_script(SESSION); log = []; st = install(ctx, log=log, versao="4.19", ia=False); st["midia"]["modo"] = "ok"; st["ids_unicos"] = True
    for x in st["produtos"]: x["Status"] = "Ativo"
    return ctx, st, log
def pagina(ctx):
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_selector("#lista-produtos .produto", timeout=20000); pg.wait_for_timeout(1200)
    return pg, errs
def preencher(pg, nome):
    pg.fill("#nome", nome); pg.fill("#preco", "99.90"); pg.fill("#estoque", "2")
    if not pg.locator("#chips-genero .chip:first-child").evaluate('e => e.classList.contains("selecionado")'): pg.click("#chips-genero .chip:first-child")
    if not pg.evaluate("selecionadasCategorias.size"):
        pg.click("#btn-abrir-categorias"); pg.click("#cat-lista .cat-item:has-text('Vestido')"); pg.click("#cat-pronto")
imgs = lambda pg: pg.locator("#galeria-grid .galeria-item img")
def creates(log): return [x for x in log if x.get("action") == "create"]
def esperar(pg, cond, ms=15000):
    t = 0
    while t < ms:
        if cond(): return True
        pg.wait_for_timeout(250); t += 250
    return False
def alvos(pg, sel):
    return pg.evaluate("(s)=>[...document.querySelectorAll(s)].filter(e=>e.offsetParent).filter(e=>{const r=e.getBoundingClientRect();return r.height<43.5||r.width<43.5}).map(e=>e.textContent.trim()+':'+Math.round(e.getBoundingClientRect().height))", sel)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for w, h in [(390, 844), (1440, 900)]:
        print("\n==== %dx%d: famílias no vários produtos ====" % (w, h))
        ctx, st, log = contexto(b, w, h); pg, errs = pagina(ctx)
        pg.click("#card-menu-cadastro > summary"); pg.click("#menu-cad-varias"); pg.wait_for_timeout(400)
        pg.set_input_files("#galeria-input", FOTOS); pg.wait_for_timeout(2500)
        # uniu as fotos 1 e 2 (um produto com 2 fotos)
        pg.click("#uni-unir"); imgs(pg).nth(0).click(); imgs(pg).nth(1).click(); pg.click("#uni-ok"); pg.wait_for_timeout(150)
        lado = pg.evaluate("(()=>{const a=document.getElementById('uni-unir').getBoundingClientRect(),b=document.getElementById('fam-formar').getBoundingClientRect();return Math.abs(a.top-b.top)<2})()")
        chk(f"{w}: botão '👪 Família' ao lado do 'Unir fotos', na mesma linha", pg.is_visible("#fam-formar") and pg.is_visible("#uni-unir") and lado)
        pg.click("#fam-formar"); pg.wait_for_timeout(150)
        chk(f"{w}: modo família explica o que fazer e começa desligado", "mesma família" in pg.inner_text("#unioes") and pg.is_disabled("#fam-ok"))
        imgs(pg).nth(0).click(); imgs(pg).nth(2).click(); pg.wait_for_timeout(150)   # grupo (fotos 1+2) e a foto 3
        chk(f"{w}: tocar numa foto do grupo marca o produto inteiro", pg.locator("#galeria-grid img[aria-checked=true]").count() == 3 and pg.inner_text("#fam-ok") == "Formar família (2)", (pg.locator("#galeria-grid img[aria-checked=true]").count(), pg.inner_text("#fam-ok")))
        pg.click("#fam-ok"); pg.wait_for_timeout(150)
        pg.click("#fam-formar"); imgs(pg).nth(3).click(); imgs(pg).nth(4).click(); pg.click("#fam-ok"); pg.wait_for_timeout(150)
        txt = pg.inner_text("#unioes")
        chk(f"{w}: duas famílias listadas, cada uma com 2 produtos", "Família 1 · 2 produtos" in txt and "Família 2 · 2 produtos" in txt, txt)
        selos = pg.evaluate("[...document.querySelectorAll('#galeria-grid .galeria-item')].map(b=>(b.querySelector('.selo-familia')||{}).textContent||'')")
        chk(f"{w}: selos F1 nas fotos do grupo e da foto 3, F2 nas fotos 4 e 5, nada na 6", selos == ["F1", "F1", "F1", "F2", "F2", ""], selos)
        chk(f"{w}: continua 'Vão ser criados 5 produtos' (família não junta fotos)", "Vão ser criados 5 produtos" in txt, txt)
        chk(f"{w}: painel com toques de pelo menos 44 px", not alvos(pg, "#unioes button"), alvos(pg, "#unioes button"))
        chk(f"{w}: sem rolagem lateral", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        pg.locator("#unioes").scroll_into_view_if_needed(); pg.wait_for_timeout(200); pg.screenshot(path=str(EVID / f"familias-{w}.jpg"), type="jpeg", quality=78)
        # desfazer e refazer a família 2
        pg.locator("#unioes .uni-familia[data-familia='2'] button").click(); pg.wait_for_timeout(100)
        chk(f"{w}: 'Desfazer' tira a família 2 (fotos 4 e 5 voltam sem família)", "Família 2" not in pg.inner_text("#unioes"))
        pg.click("#fam-formar"); imgs(pg).nth(3).click(); imgs(pg).nth(4).click(); pg.click("#fam-ok"); pg.wait_for_timeout(150)
        if w == 390:
            preencher(pg, "Conjunto Família")
            pg.click("#btn-salvar")
            esperar(pg, lambda: len(creates(log)) >= 5, 20000)
            chk("cadastra 5 produtos", len(creates(log)) == 5, len(creates(log)))
            esperar(pg, lambda: len([c for c in st["fam_chamadas"] if c["path"] == "/familias/ligar"]) >= 2, 15000)
            lig = [c["corpo"] for c in st["fam_chamadas"] if c["path"] == "/familias/ligar"]
            chk("liga as 2 famílias, cada uma com os seus 2 produtos novos (uma chamada por família)", len(lig) == 2 and all(len(x["produtos"]) == 2 for x in lig) and len(set(sum([x["produtos"] for x in lig], []))) == 4, lig)
            chk("nome da família vem do nome do produto", all(x.get("nome") == "Conjunto Família" for x in lig), lig)
            chk("as famílias ficam guardadas no servidor", len(st["familias"]) == 2 and all(len(f["membros"]) == 2 for f in st["familias"]), st["familias"])
            chk("nada pendente no aparelho depois de ligar", pg.evaluate("localStorage.getItem('tk_fam_lotes_v1')") in (None, "{}"))
        chk(f"{w}: sem erro de JavaScript", not errs, errs)
        ctx.close()

    print("\n==== copiar dados de um produto com família ====")
    for w, h in [(390, 844), (1440, 900)]:
        ctx, st, log = contexto(b, w, h)
        P = st["produtos"]; a, c = P[3], P[4]
        a.update(Nome="Vestido Lia Floral"); c.update(Nome="Vestido Lia Liso")
        st["familias"].append({"id": "f90", "nome": "Vestido Lia", "membros": [{"produto": str(a["ID"]), "rotulo": "", "ordem": 0}, {"produto": str(c["ID"]), "rotulo": "", "ordem": 1}]})
        pg, errs = pagina(ctx)
        pg.click("#card-menu-cadastro > summary"); pg.click("#menu-cad-nova"); pg.wait_for_timeout(300)
        pg.fill("#nome", "Vestido Lia"); pg.wait_for_timeout(300)
        pg.locator("#nome-sugestoes [data-peca-usar='%s']" % a["ID"]).first.click(); pg.wait_for_timeout(300)
        box = pg.inner_text("#fam-copia") if pg.locator("#fam-copia").count() else ""
        junto = pg.evaluate("(()=>{const a=document.getElementById('aviso-copiado'),f=document.getElementById('fam-copia');return !!(a&&f&&a.nextElementSibling===f)})()")
        chk(f"{w}: copiou de produto com família → logo abaixo do 'Copiei os dados' aparece a família “Vestido Lia” amarrada", "Família “Vestido Lia”" in box and junto, (box, junto))
        chk(f"{w}: 'Não ligar' da família copiada com toque de 44 px", not alvos(pg, "#fam-copia button"), alvos(pg, "#fam-copia button"))
        pg.screenshot(path=str(EVID / f"copia-familia-{w}.jpg"), type="jpeg", quality=78, full_page=False)
        if w == 390:
            pg.set_input_files("#galeria-input", FOTOS[:1]); pg.wait_for_timeout(1500)
            preencher(pg, "Vestido Lia Xadrez")
            pg.click("#btn-salvar")
            esperar(pg, lambda: len(creates(log)) >= 1 and any(c["path"] == "/familias/ligar" for c in st["fam_chamadas"]), 20000)
            f = next(x for x in st["familias"] if x["id"] == "f90")
            chk("ao cadastrar, o produto novo entra na família copiada (3 produtos)", len(f["membros"]) == 3, f)
            # "Não ligar à família"
            pg.click("#card-menu-cadastro > summary"); pg.click("#menu-cad-nova"); pg.wait_for_timeout(300)
            pg.fill("#nome", "Vestido Lia"); pg.wait_for_timeout(300)
            pg.locator("#nome-sugestoes [data-peca-usar='%s']" % c["ID"]).first.click(); pg.wait_for_timeout(300)
            pg.click("#fam-copia button"); pg.wait_for_timeout(200)
            chk("'Não ligar' tira a família do formulário", pg.locator("#fam-copia").count() == 0)
            n0 = len([x for x in st["fam_chamadas"] if x["path"] == "/familias/ligar"])
            pg.set_input_files("#galeria-input", FOTOS[1:2]); pg.wait_for_timeout(1500); preencher(pg, "Vestido Avulso"); pg.click("#btn-salvar")
            esperar(pg, lambda: len(creates(log)) >= 2, 20000); pg.wait_for_timeout(1500)
            chk("sem família: cadastra e não liga a nada", len(creates(log)) == 2 and len([x for x in st["fam_chamadas"] if x["path"] == "/familias/ligar"]) == n0)
            # "vários produtos" copiando: quem não tem família própria entra na copiada
            pg.click("#card-menu-cadastro > summary"); pg.click("#menu-cad-varias"); pg.wait_for_timeout(400)
            pg.set_input_files("#galeria-input", FOTOS[2:5]); pg.wait_for_timeout(2000)
            pg.fill("#nome", "Vestido Lia"); pg.wait_for_timeout(300)
            pg.locator("#nome-sugestoes [data-peca-usar='%s']" % a["ID"]).first.click(); pg.wait_for_timeout(300)
            txt = pg.inner_text("#unioes")
            chk("vários produtos: o painel mostra 'Família “Vestido Lia” · 3 produtos entram (copiada)'", "Vestido Lia" in txt and "3 produtos entram" in txt, txt)
            pg.screenshot(path=str(EVID / "varias-copia-390.jpg"), type="jpeg", quality=78)
            preencher(pg, "Vestido Lia"); n1 = len(creates(log)); pg.click("#btn-salvar")
            esperar(pg, lambda: len(creates(log)) >= n1 + 3 and len(next(x for x in st["familias"] if x["id"] == "f90")["membros"]) >= 6, 25000)
            f = next(x for x in st["familias"] if x["id"] == "f90")
            chk("vários produtos copiando: os 3 produtos novos entram na família copiada", len(f["membros"]) == 6, [m["produto"] for m in f["membros"]])
        chk(f"{w}: sem erro de JavaScript (cópia)", not errs, errs)
        ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
