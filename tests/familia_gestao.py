"""Família de produtos na Gestão (v7.44.0): "+ Novo tamanho desta família" (pré-preenchido, sem fotos/tamanhos/cores, liga ao salvar),
"Ligar como família" na seleção em lote, "Sugestões de famílias" (Ligar/Ignorar) e "Tirar da família". Apps Script e Worker SIMULADOS.
    python3 tests/familia_gestao.py"""
import sys, os, json
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
from PIL import Image
from pathlib import Path
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OUT = Path(os.environ.get("TK_OUT", "/tmp/familia-gestao")); OUT.mkdir(parents=True, exist_ok=True)
FOTO = str(OUT / "foto_tam.jpg"); Image.new("RGB", (900, 1200), (40, 90, 160)).save(FOTO)
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + (" — " + str(e)[:400] if e and not c else ""))

def preparar(st):
    P = st["produtos"]
    for x in P: x["Status"] = "Ativo"
    P[0].update(Nome="Sunga infantil masculino P", Tamanhos="P", Cores="Azul, Verde", Estoque=4, Categoria="Short", Genero="Infantil Menino", Codigo="SU-P")
    P[1].update(Nome="Vestido festa 2 anos", Codigo="VF-2"); P[2].update(Nome="Vestido festa 4 anos", Codigo="VF-4")
    st["fam_sugestoes"] = [
        {"chave": "calca jeans", "nome": "Calça jeans", "membros": [{"produto": P[3]["ID"], "nome": "Calça jeans 38", "rotulo": "38", "foto": P[3]["Foto_URL"], "codigo": "CJ-38"}, {"produto": P[4]["ID"], "nome": "Calça jeans 40", "rotulo": "40", "foto": P[4]["Foto_URL"], "codigo": "CJ-40"}]},
        {"chave": "short tactel", "nome": "Short tactel", "membros": [{"produto": P[5]["ID"], "nome": "Short tactel 10", "rotulo": "10", "foto": "", "codigo": ""}, {"produto": P[6]["ID"], "nome": "Short tactel 12", "rotulo": "12", "foto": "", "codigo": ""}]}]
    return P

def chamadas(st, path): return [c for c in st["fam_chamadas"] if c["path"] == path]

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for w, h in [(390, 844), (1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, service_workers="block")
        ctx.add_init_script(SESSION); log = []
        st = install(ctx, log=log, versao="4.19"); st["midia"]["modo"] = "ok"; P = preparar(st)
        orig = P[0]["ID"]
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
        pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2500)

        # ---- edição: família da peça + "+ Novo tamanho desta família" ----
        pg.evaluate(f"editarProduto('{orig}')"); pg.wait_for_selector("#fam-form:not([hidden]) .fam-novo", timeout=6000)
        chk(f"{w}: na edição aparece a família da peça e o botão '+ Novo tamanho desta família'", "ainda não está ligada" in pg.inner_text("#fam-form") and pg.locator("#fam-form .fam-novo").inner_text() == "+ Novo tamanho desta família")
        pg.locator("#fam-form").scroll_into_view_if_needed(); pg.screenshot(path=str(OUT / f"gestao_edicao_familia_{w}.png"))
        pg.click("#fam-form .fam-novo"); pg.wait_for_selector("#fam-rotulo", timeout=4000)
        v = pg.evaluate("({nome: nome.value, tam: tamanhos.value, cores: cores.value, est: estoque.value, fotos: fotosItens.length, preco: preco.value, cat: [...selecionadasCategorias].join(), gen: [...selecionadosGeneros].join(), id: document.getElementById('produto-id').value, tit: document.getElementById('titulo-form').textContent, orig: (document.getElementById('fam-rotulo-origem')||{}).value})")
        chk(f"{w}: novo tamanho abre o cadastro pré-preenchido com o nome sem o tamanho", v["nome"] == "Sunga infantil masculino" and v["id"] == "" and v["tit"].startswith("Novo tamanho") and v["cat"] == "Short" and v["gen"] == "Infantil Menino" and float(v["preco"] or 0) > 0, v)
        chk(f"{w}: fotos, tamanhos, cores e quantidade ficam vazios", v["fotos"] == 0 and v["tam"] == "" and v["cores"] == "" and v["est"] == "", v)
        chk(f"{w}: pede 'Tamanho/idade desta peça' e confirma o da original (P)", pg.locator("label[for=fam-rotulo]").is_visible() and v["orig"] == "P", v)
        pg.set_input_files("#galeria-input", FOTO); pg.wait_for_timeout(1500)
        n0 = len([x for x in log if x.get("action") == "create"])
        pg.click("#btn-salvar"); pg.wait_for_timeout(500)
        chk(f"{w}: sem o tamanho/idade não cadastra e avisa em português", len([x for x in log if x.get("action") == "create"]) == n0 and "Escreva o tamanho" in pg.inner_text("#fam-prev") and pg.evaluate("document.activeElement.id") == "fam-rotulo")
        pg.fill("#fam-rotulo", "GG")
        chk(f"{w}: mostra o nome final que vai ao site", pg.inner_text("#fam-prev") == "Nome no site: Sunga infantil masculino GG", pg.inner_text("#fam-prev"))
        pg.locator("#fam-rotulo-box").scroll_into_view_if_needed(); pg.screenshot(path=str(OUT / f"gestao_novo_tamanho_{w}.png"))
        pg.click("#btn-salvar")
        pg.wait_for_timeout(4500)
        cr = [x for x in log if x.get("action") == "create"]
        c = cr[-1] if cr else {}
        chk(f"{w}: cadastra a peça nova com o nome final e sem tamanhos/cores copiados", len(cr) == n0 + 1 and c.get("nome") == "Sunga infantil masculino GG" and c.get("tamanhos") == "" and c.get("cores") == "", {k: c.get(k) for k in ["nome", "tamanhos", "cores"]})
        lg = chamadas(st, "/familias/ligar")
        chk(f"{w}: ao salvar, liga a peça nova à família (cria a família com a original) e manda os rótulos", lg and lg[-1]["corpo"]["produtos"] == [orig, "999"] and lg[-1]["corpo"]["rotulos"] == {orig: "P", "999": "GG"} and lg[-1]["corpo"].get("nome") == "Sunga infantil masculino" and lg[-1]["sessao"], lg[-1] if lg else None)
        chk(f"{w}: avisa que o tamanho entrou na família", "ligado à família" in pg.inner_text("#status"), pg.inner_text("#status"))

        # ---- lote: "Ligar como família" ----
        pg.evaluate("document.querySelector('#lista-produtos').scrollIntoView()"); pg.wait_for_timeout(300)
        for nome in ["Vestido festa 2 anos", "Vestido festa 4 anos"]:
            pg.locator(f'#lista-produtos .produto:has-text("{nome}") input[type=checkbox]').first.check()
        pg.wait_for_timeout(200)
        chk(f"{w}: com 2 peças marcadas aparece 'Ligar como família'", pg.locator("#btn-bulk-familia").is_visible())
        pg.click("#btn-bulk-familia"); pg.wait_for_selector("#overlay-familias.aberto", timeout=4000)
        rots = pg.eval_on_selector_all("#fam-corpo .fam-rot", "es => es.map(e => e.value)")
        chk(f"{w}: janela sugere o nome da família e os rótulos de cada peça", pg.input_value("#fam-nome") == "Vestido festa" and rots == ["2 anos", "4 anos"], (pg.input_value("#fam-nome"), rots))
        pg.screenshot(path=str(OUT / f"gestao_ligar_lote_{w}.png"))
        pg.fill("#fam-nome", "Vestido de festa infantil")
        pg.click("#fam-pe .fam-prim"); pg.wait_for_timeout(800)
        lg = chamadas(st, "/familias/ligar")[-1]["corpo"]
        chk(f"{w}: ligar em lote manda as peças, o nome escolhido e os rótulos conferidos", lg["nome"] == "Vestido de festa infantil" and lg["rotulos"] == {P[1]["ID"]: "2 anos", P[2]["ID"]: "4 anos"}, lg)
        chk(f"{w}: depois de ligar a janela fecha, a seleção limpa e o aviso aparece", pg.locator("#overlay-familias.aberto").count() == 0 and not pg.locator("#bulk-bar.ativa").count() and "Vestido de festa infantil" in pg.inner_text("#status"), pg.inner_text("#status"))

        # ---- sugestões ----
        pg.click("#btn-fam-sugestoes"); pg.wait_for_selector("#overlay-familias.aberto .fam-sug", timeout=4000)
        chk(f"{w}: sugestões listam os grupos com fotos e tamanhos", pg.locator(".fam-sug").count() == 2 and "38 · 40" in pg.inner_text(".fam-sug >> nth=0") and pg.locator(".fam-sug >> nth=0").locator("img").count() == 2)
        alvos = pg.evaluate("[...document.querySelectorAll('#overlay-familias button')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})")
        chk(f"{w}: botões da gaveta com pelo menos 44 px", all(x >= 43.5 for x in alvos), alvos)
        pg.screenshot(path=str(OUT / f"gestao_sugestoes_{w}.png"))
        pg.locator('.fam-sug[data-chave="short tactel"] button', has_text="Ignorar").click(); pg.wait_for_timeout(500)
        chk(f"{w}: 'Ignorar' tira a sugestão e avisa o servidor", pg.locator('.fam-sug[data-chave="short tactel"]').count() == 0 and chamadas(st, "/familias/ignorar")[-1]["corpo"]["chave"] == "short tactel")
        pg.locator('.fam-sug[data-chave="calca jeans"] button', has_text="Ligar").click(); pg.wait_for_timeout(600)
        lg = chamadas(st, "/familias/ligar")[-1]["corpo"]
        chk(f"{w}: 'Ligar' liga o grupo com os rótulos sugeridos e mostra que acabou", lg["produtos"] == [P[3]["ID"], P[4]["ID"]] and lg["rotulos"] == {P[3]["ID"]: "38", P[4]["ID"]: "40"} and "Nenhuma sugestão agora" in pg.inner_text("#fam-corpo"), lg)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        chk(f"{w}: Esc fecha a gaveta", pg.locator("#overlay-familias.aberto").count() == 0)

        # ---- tirar da família ----
        pg.evaluate("document.getElementById('btn-cancelar-duplicar').click()")
        pg.evaluate(f"editarProduto('{orig}')"); pg.wait_for_selector("#fam-form .fam-tirar", timeout=6000)
        chk(f"{w}: edição mostra a família com os tamanhos e este marcado", "Família: Sunga infantil masculino" in pg.inner_text("#fam-form") and pg.locator("#fam-form .fam-tam").all_inner_texts() == ["P", "GG"] and pg.locator("#fam-form .fam-tam.atual").inner_text() == "P", pg.inner_text("#fam-form"))
        pg.click("#fam-form .fam-tirar")
        chk(f"{w}: 'Tirar da família' pede um segundo toque antes", pg.locator("#fam-form .fam-tirar").inner_text() == "Toque de novo para tirar" and not chamadas(st, "/familias/desligar"))
        pg.click("#fam-form .fam-tirar"); pg.wait_for_timeout(600)
        chk(f"{w}: tirar da família chama o servidor e atualiza a caixa", chamadas(st, "/familias/desligar")[-1]["corpo"] == {"produto": orig} and "ainda não está ligada" in pg.inner_text("#fam-form") and "família foi desfeita" in pg.inner_text("#status"), pg.inner_text("#status"))
        chk(f"{w}: sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        chk(f"{w}: sem erro de JavaScript", not errs, errs)
        ctx.close()

    # servidor das famílias fora: a ligação fica guardada e é refeita na próxima abertura
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); log = []
    st = install(ctx, log=log, versao="4.19"); st["midia"]["modo"] = "ok"; P = preparar(st)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2500)
    st["ig"]["fora"] = True
    pg.evaluate(f"editarProduto('{P[0]['ID']}')"); pg.wait_for_selector("#fam-form .fam-novo", timeout=6000)
    pg.click("#fam-form .fam-novo"); pg.fill("#fam-rotulo", "M"); pg.set_input_files("#galeria-input", FOTO); pg.wait_for_timeout(1500)
    pg.click("#btn-salvar"); pg.wait_for_timeout(4500)
    chk("servidor fora: a peça é cadastrada e o aviso diz que a ligação será refeita", any(x.get("nome") == "Sunga infantil masculino M" for x in log if x.get("action") == "create") and "tento de novo sozinho" in pg.inner_text("#status"), pg.inner_text("#status"))
    st["ig"]["fora"] = False
    pg.reload(); pg.wait_for_timeout(3000)
    chk("na próxima abertura a ligação pendente é feita", any(c["corpo"].get("produtos") == [P[0]["ID"], "999"] and c["corpo"]["rotulos"].get("999") == "M" for c in chamadas(st, "/familias/ligar")) and pg.evaluate("localStorage.getItem('tk_fam_pendentes_v1')") == "[]")
    chk("servidor fora: sem erro de JavaScript", not errs, errs)
    ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
