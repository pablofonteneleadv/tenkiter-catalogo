"""Família de produtos na Gestão (v7.44.0/v7.47.0): família = mesmo produto (estampa ou tamanho). Nada é digitado à parte.
"+ Nova variação desta família" (pré-preenchido, sem fotos/tamanhos/cores, liga ao salvar), "Ligar como família" na seleção em lote (só confirma), "Sugestões de famílias" (Ligar/Ignorar) e "Tirar da família". Apps Script e Worker SIMULADOS.
    python3 tests/familia_gestao.py"""
DLG = []
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
    P[0].update(Nome="Conjunto longo Farm", Tamanhos="P, M", Cores="Azul", Estoque=4, Categoria="Short", Genero="Infantil Menino", Codigo="CF-AZ")
    P[1].update(Nome="Vestido festa 2 anos", Codigo="VF-2"); P[2].update(Nome="Vestido festa 4 anos", Codigo="VF-4")
    P[9].update(Nome="Vestido festa 6 anos", Codigo="VF-6"); P[10].update(Nome="Vestido festa 8 anos", Codigo="VF-8")
    st["fam_sugestoes"] = [
        {"chave": "calca jeans", "nome": "Calça jeans", "membros": [{"produto": P[3]["ID"], "nome": "Calça jeans 38", "rotulo": "38", "foto": P[3]["Foto_URL"], "codigo": "CJ-38"}, {"produto": P[4]["ID"], "nome": "Calça jeans 40", "rotulo": "40", "foto": P[4]["Foto_URL"], "codigo": "CJ-40"}]},
        {"chave": "short tactel", "nome": "Short tactel", "membros": [{"produto": P[5]["ID"], "nome": "Short tactel 10", "rotulo": "10", "foto": "", "codigo": ""}, {"produto": P[6]["ID"], "nome": "Short tactel 12", "rotulo": "12", "foto": "", "codigo": ""}]},
        {"chave": "blusa ciganinha", "nome": "Blusa ciganinha", "membros": [{"produto": P[7]["ID"], "nome": "Blusa ciganinha", "rotulo": "", "foto": P[7]["Foto_URL"], "codigo": "BC-1"}, {"produto": P[8]["ID"], "nome": "Blusa ciganinha", "rotulo": "", "foto": P[8]["Foto_URL"], "codigo": "BC-2"}]}]
    return P

def chamadas(st, path): return [c for c in st["fam_chamadas"] if c["path"] == path]

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for w, h in [(390, 844), (1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, service_workers="block")
        ctx.add_init_script(SESSION); log = []
        st = install(ctx, log=log, versao="4.19"); st["midia"]["modo"] = "ok"; P = preparar(st)
        orig = P[0]["ID"]
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: (DLG.append(d.message), d.accept()))
        pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2500)

        # ---- edição: família da peça + "+ Nova variação desta família" (estampa nova: nada é digitado à parte) ----
        pg.evaluate(f"editarProduto('{orig}')"); pg.wait_for_selector("#fam-form:not([hidden]) .fam-novo", timeout=6000)
        chk(f"{w}: na edição aparece a família do produto e o botão '+ Nova variação desta família'", "ainda não está ligado" in pg.inner_text("#fam-form") and pg.locator("#fam-form .fam-novo").inner_text() == "+ Nova variação desta família")
        pg.locator("#fam-form").scroll_into_view_if_needed(); pg.screenshot(path=str(OUT / f"gestao_edicao_familia_{w}.png"))
        pg.click("#fam-form .fam-novo"); pg.wait_for_function("document.getElementById('titulo-form').textContent.startsWith('Nova variação')", timeout=4000)
        v = pg.evaluate("({nome: nome.value, tam: tamanhos.value, cores: cores.value, est: estoque.value, fotos: fotosItens.length, preco: preco.value, cat: [...selecionadasCategorias].join(), gen: [...selecionadosGeneros].join(), id: document.getElementById('produto-id').value, tit: document.getElementById('titulo-form').textContent})")
        chk(f"{w}: nova variação abre o cadastro pré-preenchido com o mesmo nome e dados da original", v["nome"] == "Conjunto longo Farm" and v["id"] == "" and v["cat"] == "Short" and v["gen"] == "Infantil Menino" and float(v["preco"] or 0) > 0, v)
        chk(f"{w}: fotos, tamanhos, cores e quantidade ficam vazios", v["fotos"] == 0 and v["tam"] == "" and v["cores"] == "" and v["est"] == "", v)
        chk(f"{w}: nenhum campo à parte para digitar tamanho, idade ou cor", pg.locator("#fam-rotulo, #fam-rotulo-origem, #fam-rotulo-box").count() == 0 and pg.locator("#fam-form input").count() == 0)
        chk(f"{w}: botão diz 'Cadastrar esta variação'", pg.inner_text("#btn-salvar").strip() == "Cadastrar esta variação", pg.inner_text("#btn-salvar"))
        pg.set_input_files("#galeria-input", FOTO); pg.wait_for_timeout(1500)
        pg.locator("#fam-form").scroll_into_view_if_needed(); pg.screenshot(path=str(OUT / f"gestao_nova_variacao_{w}.png"))
        n0 = len([x for x in log if x.get("action") == "create"])
        pg.click("#btn-salvar")
        pg.wait_for_timeout(4500)
        cr = [x for x in log if x.get("action") == "create"]
        c = cr[-1] if cr else {}
        chk(f"{w}: cadastra o produto novo com o mesmo nome e sem tamanhos/cores copiados", len(cr) == n0 + 1 and c.get("nome") == "Conjunto longo Farm" and c.get("tamanhos") == "" and c.get("cores") == "", {k: c.get(k) for k in ["nome", "tamanhos", "cores"]})
        lg = chamadas(st, "/familias/ligar")
        chk(f"{w}: ao salvar, liga o produto novo à família (cria a família com a original), sem rótulo digitado", lg and lg[-1]["corpo"]["produtos"] == [orig, "999"] and lg[-1]["corpo"]["rotulos"] == {} and lg[-1]["corpo"].get("nome") == "Conjunto longo Farm" and lg[-1]["sessao"], lg[-1] if lg else None)
        chk(f"{w}: avisa que a variação entrou na família", "Variação cadastrada e ligada à família" in pg.inner_text("#status"), pg.inner_text("#status"))

        # ---- lote: "Ligar como família" só confirma (não pede nem muda nada) ----
        pg.evaluate("document.querySelector('#lista-produtos').scrollIntoView()"); pg.wait_for_timeout(300)
        for nome in ["Vestido festa 2 anos", "Vestido festa 4 anos"]:
            pg.locator(f'#lista-produtos .produto:has-text("{nome}") input[type=checkbox]').first.check()
        pg.wait_for_timeout(200)
        chk(f"{w}: com 2 produtos marcados aparece 'Ligar como família'", pg.locator("#btn-bulk-familia").is_visible())
        pg.click("#btn-bulk-familia"); pg.wait_for_selector("#overlay-familias.aberto", timeout=4000)
        chk(f"{w}: a janela não tem nenhum campo para digitar (nome, tamanho, idade)", pg.locator("#fam-corpo input, #fam-corpo textarea").count() == 0)
        chk(f"{w}: a janela mostra os produtos com foto, nome e código", pg.locator("#fam-corpo .fam-membro").count() == 2 and "Vestido festa 2 anos" in pg.inner_text("#fam-corpo") and "VF-4" in pg.inner_text("#fam-corpo") and "Nada neles muda" in pg.inner_text("#fam-corpo"))
        chk(f"{w}: nomes do mesmo produto não geram alerta", pg.locator("#fam-corpo .fam-alerta").count() == 0)
        pg.screenshot(path=str(OUT / f"gestao_ligar_lote_{w}.png"))
        pg.click("#fam-pe .fam-prim"); pg.wait_for_timeout(800)
        lg = chamadas(st, "/familias/ligar")[-1]["corpo"]
        chk(f"{w}: ligar em lote manda só os produtos (rótulos tirados do nome, sem nome digitado)", lg["produtos"] == [P[1]["ID"], P[2]["ID"]] and lg["rotulos"] == {P[1]["ID"]: "2 anos", P[2]["ID"]: "4 anos"} and "nome" not in lg, lg)
        chk(f"{w}: depois de ligar a janela fecha, a seleção limpa e o aviso aparece", pg.locator("#overlay-familias.aberto").count() == 0 and not pg.locator("#bulk-bar.ativa").count() and "ligada com 2 produtos" in pg.inner_text("#status"), pg.inner_text("#status"))

        # ---- v7.47.1: selo de família nos cards da lista ----
        pg.wait_for_timeout(300)
        selo = pg.locator('#lista-produtos .produto:has-text("Vestido festa 2 anos") .fam-selo')
        chk(f"{w}: card da lista mostra o selo 'Família · 2 produtos'", selo.count() == 1 and selo.inner_text().strip() == "Família · 2 produtos", selo.all_inner_texts())
        chk(f"{w}: produto sem família não tem selo", pg.locator('#lista-produtos .produto:has-text("Vestido festa 6 anos") .fam-selo').count() == 0)
        pg.locator('#lista-produtos .produto:has-text("Vestido festa 2 anos")').first.scroll_into_view_if_needed(); pg.screenshot(path=str(OUT / f"gestao_lista_selo_{w}.png"))

        # ---- v7.47.1: peça que já tem família não é ligada de novo sem a pessoa resolver ----
        def marcar(*nomes):
            pg.wait_for_function("!document.querySelector('#overlay-familias.aberto') && TKCamadas.total() === 0", timeout=4000)
            pg.evaluate("selecionadosBulk.clear(); atualizarBarraBulk(); renderizarProdutos()"); pg.wait_for_timeout(150)
            for nome in nomes: pg.locator(f'#lista-produtos .produto:has-text("{nome}") input[type=checkbox]').first.check()
            pg.click("#btn-bulk-familia"); pg.wait_for_selector("#overlay-familias.aberto", timeout=4000)
        n_lig = len(chamadas(st, "/familias/ligar"))
        marcar("Vestido festa 2 anos", "Vestido festa 6 anos", "Vestido festa 8 anos")
        tf = pg.locator("#fam-corpo .fam-membro.tem-fam")
        chk(f"{w}: conflito: indica qual produto já tem família e em qual", tf.count() == 1 and "VF-2" in tf.inner_text() and "Já está na família “Vestido festa 2 anos” · 2 produtos" in tf.inner_text(), tf.all_inner_texts())
        chk(f"{w}: conflito: não oferece criar família nova; oferece juntar todas (4 produtos)", pg.inner_text("#fam-pe .fam-prim") == "Juntar todos na família “Vestido festa 2 anos” (4 produtos)" and "Ligar 3" not in pg.inner_text("#fam-pe"), pg.inner_text("#fam-pe"))
        chk(f"{w}: conflito: cada produto com família tem 'Tirar desta seleção' e 'Tirar da família'", tf.locator("button").all_inner_texts() == ["Tirar desta seleção", "Tirar da família “Vestido festa 2 anos”"], tf.locator("button").all_inner_texts())
        alv = pg.evaluate("[...document.querySelectorAll('#overlay-familias button')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})")
        chk(f"{w}: conflito: botões com pelo menos 44 px", all(x >= 43.5 for x in alv), alv)
        pg.screenshot(path=str(OUT / f"gestao_conflito_{w}.png"))
        tf.locator("button", has_text="Tirar desta seleção").click(); pg.wait_for_timeout(300)
        chk(f"{w}: 'Tirar desta seleção' tira o produto e libera criar a família nova com as outras", pg.locator("#fam-corpo .fam-membro").count() == 2 and pg.locator("#fam-corpo .tem-fam").count() == 0 and pg.inner_text("#fam-pe .fam-prim") == "Ligar 2 produtos como família" and "VF-2 saiu desta seleção" in pg.inner_text("#fam-pe"), pg.inner_text("#fam-pe"))
        chk(f"{w}: 'Tirar desta seleção' desmarca também na lista", pg.evaluate("[...selecionadosBulk].length") == 2)
        chk(f"{w}: nada foi ligado enquanto havia conflito", len(chamadas(st, "/familias/ligar")) == n_lig)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        # juntar todas na família que já existe
        marcar("Vestido festa 2 anos", "Vestido festa 6 anos")
        pg.click("#fam-pe .fam-prim"); pg.wait_for_timeout(700)
        lg = chamadas(st, "/familias/ligar")[-1]["corpo"]
        chk(f"{w}: 'Juntar todas' manda juntar e a família passa a ter 3 produtos", lg.get("juntar") is True and lg["produtos"] == [P[1]["ID"], P[9]["ID"]] and "agora tem 3 produtos" in pg.inner_text("#status"), [lg, pg.inner_text("#status")])
        # todas já na mesma família: nada a ligar
        marcar("Vestido festa 2 anos", "Vestido festa 6 anos")
        chk(f"{w}: todas já na mesma família: avisa e não deixa ligar de novo", "Não há nada para ligar" in pg.inner_text("#fam-corpo") and pg.locator("#fam-pe .fam-prim").count() == 0 and pg.locator("#fam-pe button", has_text="Fechar").count() == 1)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
        chk(f"{w}: Esc fecha só a janela (não sai da Gestão)", pg.url.endswith("admin.html") and pg.locator("#overlay-familias.aberto").count() == 0, pg.url)
        # tirar da família onde está para colocar na nova
        marcar("Vestido festa 4 anos", "Vestido festa 8 anos")
        btf = pg.locator("#fam-corpo .tem-fam button", has_text="Tirar da família")
        btf.click(); pg.wait_for_timeout(600)
        chk(f"{w}: 'Tirar da família' pede confirm() com a consequência", any("Tirar este produto da família" in m and "continua no site" in m for m in DLG), DLG)
        chk(f"{w}: depois de tirar da família, o produto fica livre e dá para ligar a família nova", any(c["corpo"].get("produto") == P[2]["ID"] for c in chamadas(st, "/familias/desligar")) and pg.locator("#fam-corpo .tem-fam").count() == 0 and pg.inner_text("#fam-pe .fam-prim") == "Ligar 2 produtos como família" and "saiu da família" in pg.inner_text("#fam-pe"), pg.inner_text("#fam-pe"))
        pg.click("#fam-pe .fam-prim"); pg.wait_for_timeout(700)
        lg = chamadas(st, "/familias/ligar")[-1]["corpo"]
        chk(f"{w}: família nova criada sem 'juntar'", lg["produtos"] == [P[2]["ID"], P[10]["ID"]] and "juntar" not in lg and "ligada com 2 produtos" in pg.inner_text("#status"), [lg, pg.inner_text("#status")])
        pg.wait_for_function("!document.querySelector('#overlay-familias.aberto') && TKCamadas.total() === 0", timeout=4000)

        # ---- v7.47.1: na edição, tocar na foto de outra peça da família abre a edição dela ----
        pg.evaluate("selecionadosBulk.clear(); atualizarBarraBulk(); renderizarProdutos()")
        pg.evaluate(f"editarProduto('{P[1]['ID']}')"); pg.wait_for_selector("#fam-form .fam-tam.atual", timeout=6000)
        outra = pg.locator("#fam-form button.fam-tam")
        chk(f"{w}: o outro produto da família é um botão com nome acessível", outra.count() == 1 and (outra.get_attribute("aria-label") or "") == "Abrir VF-6 Vestido festa 6 anos, 6 anos", outra.get_attribute("aria-label") if outra.count() else None)
        outra.click(); pg.wait_for_timeout(500)
        chk(f"{w}: tocar na foto abre a edição daquele produto", pg.input_value("#produto-id") == P[9]["ID"] and pg.locator("#fam-form .fam-tam.atual").count() == 1 and "Vestido festa 6 anos" in pg.inner_text("#titulo-form"), [pg.input_value("#produto-id"), pg.inner_text("#titulo-form")])
        pg.locator("#fam-form button.fam-tam").click(); pg.wait_for_timeout(500)
        chk(f"{w}: e volta para a outra pela foto dela", pg.input_value("#produto-id") == P[1]["ID"])
        pg.evaluate("document.getElementById('btn-cancelar-duplicar').click()")

        # ---- sugestões ----
        pg.click("#btn-fam-sugestoes"); pg.wait_for_selector("#overlay-familias.aberto .fam-sug", timeout=4000)
        chk(f"{w}: sugestões listam os grupos com fotos e tamanhos", pg.locator(".fam-sug").count() == 3 and "38 · 40" in pg.inner_text(".fam-sug >> nth=0") and pg.locator(".fam-sug >> nth=0").locator("img").count() == 2)
        est = pg.locator('.fam-sug[data-chave="blusa ciganinha"]')
        chk(f"{w}: sugestão de estampas (mesmo nome, sem tamanho) mostra '2 produtos' e o código de cada foto", "2 produtos" in est.inner_text() and est.locator("figcaption").all_inner_texts() == ["BC-1", "BC-2"], est.inner_text())
        est.locator("button", has_text="Ligar").click(); pg.wait_for_timeout(600)
        lg = chamadas(st, "/familias/ligar")[-1]["corpo"]
        chk(f"{w}: ligar estampas manda os produtos sem rótulo", lg["produtos"] == [P[7]["ID"], P[8]["ID"]] and lg["rotulos"] == {}, lg)
        alvos = pg.evaluate("[...document.querySelectorAll('#overlay-familias button')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})")
        chk(f"{w}: botões da gaveta com pelo menos 44 px", all(x >= 43.5 for x in alvos), alvos)
        pg.screenshot(path=str(OUT / f"gestao_sugestoes_{w}.png"))
        pg.locator('.fam-sug[data-chave="short tactel"] button', has_text="Ignorar").click(); pg.wait_for_timeout(500)
        chk(f"{w}: 'Ignorar' tira a sugestão e avisa o servidor", pg.locator('.fam-sug[data-chave="short tactel"]').count() == 0 and chamadas(st, "/familias/ignorar")[-1]["corpo"]["chave"] == "short tactel")
        pg.locator('.fam-sug[data-chave="calca jeans"] button', has_text="Ligar").click(); pg.wait_for_timeout(600)
        lg = chamadas(st, "/familias/ligar")[-1]["corpo"]
        chk(f"{w}: 'Ligar' liga o grupo com os rótulos tirados do nome e mostra que acabou", lg["produtos"] == [P[3]["ID"], P[4]["ID"]] and lg["rotulos"] == {P[3]["ID"]: "38", P[4]["ID"]: "40"} and "Nenhuma sugestão agora" in pg.inner_text("#fam-corpo"), lg)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        chk(f"{w}: Esc fecha a gaveta", pg.locator("#overlay-familias.aberto").count() == 0)

        # ---- tirar da família ----
        pg.evaluate("document.getElementById('btn-cancelar-duplicar').click()")
        pg.evaluate(f"editarProduto('{orig}')"); pg.wait_for_selector("#fam-form .fam-tirar", timeout=6000)
        chk(f"{w}: edição mostra a família com a foto de cada produto e esta marcada", "Família: Conjunto longo Farm · 2 produtos" in pg.inner_text("#fam-form") and pg.locator("#fam-form .fam-tam").count() == 2 and pg.locator("#fam-form .fam-tam.atual[aria-current=true]").count() == 1 and pg.locator("#fam-form .fam-tam.atual").inner_text() == "esta", pg.inner_text("#fam-form"))
        pg.locator("#fam-form").scroll_into_view_if_needed(); pg.screenshot(path=str(OUT / f"gestao_edicao_com_familia_{w}.png"))
        alv = pg.evaluate("[...document.querySelectorAll('#fam-form button')].map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})")
        chk(f"{w}: botões da caixa Família com pelo menos 44 px", all(x >= 43.5 for x in alv), alv)
        pg.click("#fam-form .fam-tirar"); pg.wait_for_timeout(600)
        chk(f"{w}: 'Tirar da família' pede confirm() antes", any("Tirar este produto da família" in m for m in DLG), DLG)
        chk(f"{w}: tirar da família chama o servidor e atualiza a caixa", chamadas(st, "/familias/desligar")[-1]["corpo"] == {"produto": orig} and "ainda não está ligado" in pg.inner_text("#fam-form") and "família foi desfeita" in pg.inner_text("#status"), pg.inner_text("#status"))
        chk(f"{w}: sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        chk(f"{w}: sem erro de JavaScript", not errs, errs)
        ctx.close()

    # servidor das famílias fora: a ligação fica guardada e é refeita na próxima abertura
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); log = []
    st = install(ctx, log=log, versao="4.19"); st["midia"]["modo"] = "ok"; P = preparar(st)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: (DLG.append(d.message), d.accept()))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2500)
    st["ig"]["fora"] = True
    pg.evaluate(f"editarProduto('{P[0]['ID']}')"); pg.wait_for_selector("#fam-form .fam-novo", timeout=6000)
    pg.click("#fam-form .fam-novo"); pg.wait_for_timeout(300); pg.set_input_files("#galeria-input", FOTO); pg.wait_for_timeout(1500)
    pg.click("#btn-salvar"); pg.wait_for_timeout(4500)
    chk("servidor fora: o produto é cadastrado e o aviso diz que a ligação será refeita", any(x.get("nome") == "Conjunto longo Farm" for x in log if x.get("action") == "create") and "tento de novo sozinho" in pg.inner_text("#status"), pg.inner_text("#status"))
    st["ig"]["fora"] = False
    pg.reload(); pg.wait_for_timeout(3000)
    chk("na próxima abertura a ligação pendente é feita", any(c["corpo"].get("produtos") == [P[0]["ID"], "999"] for c in chamadas(st, "/familias/ligar")) and pg.evaluate("localStorage.getItem('tk_fam_pendentes_v1')") == "[]")
    chk("servidor fora: sem erro de JavaScript", not errs, errs)
    ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
