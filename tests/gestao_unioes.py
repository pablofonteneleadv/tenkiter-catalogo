"""v7.50.0 — Pedidos do Pablo (03/11/2026), com Apps Script e Worker SIMULADOS (mock.py). Nada toca em serviço real.
 1. Cadastro "vários produtos": UNIÕES de fotos (grupo = 1 produto com capa + galeria; fotos soltas = 1 produto cada).
 2. Juntar na loja (index) em segundo plano, com aviso discreto do resultado.
 3. Minha seleção: tocar na miniatura/nome abre a peça.
 4. Login instantâneo entre loja e Gestão (sessão guardada no aparelho; servidor confere por trás; sessão inválida desloga com aviso).
 5. Card da Gestão mostra quantas fotos a peça tem ("📷 6").
 6. Separar: cada foto vira um produto (família nova/atual ou soltos), prévia "Vai virar N produtos", em segundo plano e retomável.
 7. "Cadastrar peça" saiu do "O que fazer agora".
    TK_BASE=http://localhost:8796/ python3 tests/gestao_unioes.py      (TK_EVID=pasta grava as capturas .jpg)"""
import sys, os, re, io, hashlib
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
from pathlib import Path
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
EVID = os.environ.get("TK_EVID", "")
TMP = Path(os.environ.get("TK_OUT", "/tmp/gestao-unioes")); TMP.mkdir(parents=True, exist_ok=True)
if EVID: Path(EVID).mkdir(parents=True, exist_ok=True)
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + (" — " + str(e)[:500] if e and not c else ""))

CORES = [(196, 120, 92), (64, 96, 150), (40, 120, 90), (170, 60, 80), (220, 180, 90), (90, 70, 140), (30, 30, 30), (200, 200, 190)]
def foto_jpg(cor, rotulo=""):
    im = Image.new("RGB", (480, 600), cor); d = ImageDraw.Draw(im)
    d.rectangle([150, 120, 330, 520], fill=tuple(min(255, c + 45) for c in cor)); d.ellipse([200, 40, 280, 120], fill=(235, 210, 190))
    if rotulo: d.text((20, 560), rotulo, fill=(255, 255, 255))
    b = io.BytesIO(); im.save(b, "JPEG", quality=80); return b.getvalue()
FOTOS = []
for i in range(6):
    f = TMP / ("lote%d.jpg" % (i + 1)); f.write_bytes(foto_jpg(CORES[i], "foto %d" % (i + 1))); FOTOS.append(str(f))
def imagens_realistas(ctx):
    """Fotos de produto coloridas (por endereço) para as capturas; registrada depois do mock, então vale antes dele."""
    def h(route):
        n = int(hashlib.md5(route.request.url.encode()).hexdigest()[:4], 16)
        route.fulfill(body=foto_jpg(CORES[n % len(CORES)]), content_type="image/jpeg")
    ctx.route(re.compile(r".*(lh3\.googleusercontent|cloudinary|tenkiter-midia.*/m/|x/g\d).*"), lambda r: h(r) if r.request.method == "GET" else r.fallback())
def evid(pg, nome):
    if EVID: pg.screenshot(path=os.path.join(EVID, nome), type="jpeg", quality=72)
def aviso(pg): return pg.evaluate("(()=>{const e=document.getElementById('tk-fila-lote');return e&&!e.hidden?{txt:e.innerText,estado:e.dataset.estado}:null})()")
def esperar_aviso(pg, estado, ms=8000):
    try: pg.wait_for_function("e => { const x = document.getElementById('tk-fila-lote'); return x && !x.hidden && x.dataset.estado === e; }", arg=estado, timeout=ms)
    except Exception: pass
    return aviso(pg)

def contexto(b, w, h, versao="4.19", sessao=True):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, service_workers="block")
    if sessao: ctx.add_init_script(SESSION)
    log = []; st = install(ctx, log=log, versao=versao, ia=False); imagens_realistas(ctx)
    return ctx, st, log
def pagina(ctx, url, esperar=".produto, .card"):
    pg = ctx.new_page(); errs = []; msgs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: (msgs.append(d.message), d.accept()))
    pg.goto(BASE + url)
    return pg, errs, msgs
def preencher(pg, nome):
    pg.fill("#nome", nome); pg.fill("#preco", "99.90"); pg.fill("#estoque", "2")
    if not pg.locator("#chips-genero .chip:first-child").evaluate('e => e.classList.contains("selecionado")'):
        pg.click("#chips-genero .chip:first-child")
    pg.click("#btn-abrir-categorias"); pg.click("#cat-lista .cat-item:has-text('Vestido')"); pg.click("#cat-pronto")
    pg.locator('#cad-etiquetas button').filter(has_text=re.compile(r'^P$')).click()

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for w, h in [(390, 844), (1440, 900)]:
        print("\n==== %dx%d ====" % (w, h))
        # ---------------------------------------------------------------- 7 + 5 + 6: Gestão
        ctx, st, log = contexto(b, w, h); st["ids_unicos"] = True; st["midia"]["modo"] = "ok"
        P = st["produtos"]
        for x in P: x["Status"] = "Ativo"
        P[23].update(Nome="Vestido Midi Floral", Codigo="TK-0821", Fotos_Galeria=",".join("https://res.cloudinary.com/z/image/upload/v1/tk821_%d.jpg" % i for i in range(2, 7)), Video_URL="", Tamanhos="P, M, G", Cores="Azul")
        P[22].update(Nome="Blusa Ciganinha", Codigo="TK-0822", Fotos_Galeria="https://res.cloudinary.com/z/image/upload/v1/tk822_2.jpg,https://res.cloudinary.com/z/image/upload/v1/tk822_3.jpg")
        pg, errs, msgs = pagina(ctx, "admin.html"); pg.wait_for_selector("#lista-produtos .produto"); pg.wait_for_timeout(1500)
        # 7
        chk(f"{w} item 7: 'Cadastrar peça' saiu do 'O que fazer agora'", pg.locator("#atalhos-hoje [data-atalho=cadastrar]").count() == 0 and "Cadastrar peça" not in pg.inner_text("#atalhos-hoje") and pg.locator("#card-menu-cadastro > summary").is_visible())
        chk(f"{w} item 7: os outros atalhos continuam", pg.locator("#atalhos-hoje [data-atalho=postagens], #atalhos-hoje [data-atalho=lista], #atalhos-hoje [data-atalho=ferramentas]").count() == 3)
        pg.evaluate("window.scrollTo(0,0)"); evid(pg, "gestao-topo-%d.jpg" % w)
        # 5
        card = pg.locator(".produto", has=pg.locator(".codigo", has_text="TK-0821")).first
        card.scroll_into_view_if_needed()
        selo = card.locator(".foto-qtd")
        chk(f"{w} item 5: card do TK-0821 mostra '📷 6' na miniatura", selo.count() == 1 and selo.inner_text().strip().endswith("6") and "6 fotos" in card.locator(".foto-ampliar").get_attribute("aria-label"), selo.count() and selo.inner_text())
        um = pg.locator(".produto", has=pg.locator(".codigo", has_text="TK-0001")).first
        chk(f"{w} item 5: peça de 1 foto não ganha selo", um.locator(".foto-qtd").count() == 0)
        r = pg.evaluate("(()=>{const s=document.querySelector('.foto-qtd').getBoundingClientRect(),i=document.querySelector('.foto-qtd').closest('.foto-ampliar').getBoundingClientRect();return {dentro:s.left>=i.left&&s.right<=i.right&&s.bottom<=i.bottom&&s.top>=i.top, w:s.width, iw:i.width}})()")
        chk(f"{w} item 5: selo cabe dentro da miniatura (não cobre a foto toda)", r["dentro"] and r["w"] < r["iw"] * 0.8, r)
        pg.evaluate("window.scrollBy(0,-80)"); evid(pg, "gestao-card-fotos-%d.jpg" % w)
        # 6 — barra de seleção
        card.locator(".produto-chk").check(); pg.wait_for_timeout(250)
        pg.click("#btn-bulk-mais"); pg.wait_for_timeout(150)
        chk(f"{w} item 6: com o TK-0821 marcado, 'Mais ações' oferece 'Separar em 6 produtos'", pg.locator("#btn-bulk-separar").is_visible() and "Separar em 6 produtos" in pg.inner_text("#btn-bulk-separar"))
        um.locator(".produto-chk").check(); pg.wait_for_timeout(250)
        chk(f"{w} item 6: com 2 peças marcadas o Separar some", pg.locator("#btn-bulk-separar").is_hidden())
        pg.click("#btn-cancelar-bulk"); pg.wait_for_timeout(200)
        um.locator(".produto-chk").check(); pg.wait_for_timeout(250)
        chk(f"{w} item 6: peça de 1 foto não oferece Separar", pg.locator("#btn-bulk-separar").is_hidden())
        pg.click("#btn-cancelar-bulk"); pg.wait_for_timeout(200)
        # 6 — menu ⋯ do card, prévia e família nova
        card = pg.locator(".produto", has=pg.locator(".codigo", has_text="TK-0821")).first
        card.locator("details.mais > summary").click(); pg.wait_for_timeout(150)
        chk(f"{w} item 6: menu ⋯ do card tem 'Separar em 6 produtos'", card.locator("[data-separar-id]").is_visible())
        card.locator("[data-separar-id]").click(); pg.wait_for_selector("#overlay-separar.aberto")
        prev = pg.inner_text("#sep-previa")
        chk(f"{w} item 6: prévia 'Vai virar 6 produtos' (TK-0821 fica com a 1ª foto, 5 novos)", "Vai virar 6 produtos" in prev and "TK-0821 fica com a 1ª foto" in prev and "5 produtos novos" in prev and pg.locator("#sep-fotos .sep-foto").count() == 6, prev)
        chk(f"{w} item 6: escolha família (nova) ou soltos, com 'Separar em 6 produtos'", "família nova" in pg.inner_text("#sep-fam") and "Deixar soltos" in pg.inner_text("#sep-fam") and pg.inner_text("#sep-ok") == "Separar em 6 produtos")
        dim = pg.evaluate("(()=>{const s=document.querySelector('#overlay-separar .sheet').getBoundingClientRect(),b=document.getElementById('sep-ok').getBoundingClientRect();return {topo:s.top>=0, ok:b.bottom<=innerHeight, h:b.height, sx:document.documentElement.scrollWidth<=innerWidth}})()")
        chk(f"{w} item 6: janela cabe na tela, botão alcançável (≥44 px), sem rolagem lateral", dim["topo"] and dim["ok"] and dim["h"] >= 44 and dim["sx"], dim)
        evid(pg, "separar-janela-%d.jpg" % w)
        n_cr0 = len([x for x in log if x.get("action") == "create"])
        st["create_falha_em"] = 3   # a 3ª criação falha uma vez: retomar não pode duplicar
        pg.click("#sep-ok"); pg.wait_for_timeout(200)
        chk(f"{w} item 6: a janela fecha na hora", pg.locator("#overlay-separar.aberto").count() == 0)
        a = esperar_aviso(pg, "erro")
        chk(f"{w} item 6: falha no meio → erro legível que diz que nada foi perdido, com 'Tentar de novo'", a and "Planilha ocupada" in a["txt"] and "Nada foi perdido" in a["txt"] and "Tentar de novo" in a["txt"], a)
        evid(pg, "separar-erro-%d.jpg" % w)
        pg.locator("#tk-fila-lote button", has_text="Tentar de novo").click()
        a = esperar_aviso(pg, "ok")
        chk(f"{w} item 6: retoma e termina: 'Pronto: TK-0821 virou 6 produtos na mesma família.'", a and "Pronto: TK-0821 virou 6 produtos na mesma família." in a["txt"], a)
        evid(pg, "separar-pronto-%d.jpg" % w)
        cr = [x for x in log if x.get("action") == "create"][n_cr0:]
        okc = [x for x in cr]
        novos = [x for x in P if x["ID"].startswith("1795")]
        chk(f"{w} item 6: 5 produtos novos (sem duplicar no retry), cada um com UMA das fotos extras", len(novos) == 5 and sorted(x["Foto_URL"] for x in novos) == sorted("https://res.cloudinary.com/z/image/upload/v1/tk821_%d.jpg" % i for i in range(2, 7)) and all(x["Fotos_Galeria"] == "" for x in novos), [(x["Foto_URL"], x["Fotos_Galeria"]) for x in novos])
        chk(f"{w} item 6: mesmas informações (nome, preço, tamanhos, cores, categoria) e sem aviso push", all(x["nome"] == "Vestido Midi Floral" and x["tamanhos"] == "P, M, G" and x["cores"] == "Azul" and x.get("notificarPush") is False and x.get("novidade") is False for x in okc), [(x.get("nome"), x.get("tamanhos")) for x in okc])
        ops = [x.get("opId") for x in okc]
        chk(f"{w} item 6: cada produto novo com opId próprio (k-1…k-5); o retry repetiu o mesmo opId", len(set(ops)) == 5 and all(re.match(r"^lt\w+-[1-5]$", o or "") for o in ops), ops)
        up = [x for x in log if x.get("action") == "update" and str(x.get("id")) == P[23]["ID"]]
        chk(f"{w} item 6: a original fica com a 1ª foto (e os mesmos dados); nada apagado", up and up[-1]["fotoUrlExistente"] == P[23]["Foto_URL"] and up[-1]["fotosGaleriaExistentes"] == "" and up[-1]["nome"] == "Vestido Midi Floral" and P[23]["Status"] == "Ativo", up[-1] if up else None)
        lg = [c for c in st["fam_chamadas"] if c["path"] == "/familias/ligar"]
        chk(f"{w} item 6: família nova com as 6 peças (original + 5 novas)", lg and len(lg[-1]["corpo"]["produtos"]) == 6 and lg[-1]["corpo"]["produtos"][0] == P[23]["ID"] and lg[-1]["corpo"].get("juntar") is True and lg[-1]["corpo"].get("nome") == "Vestido Midi Floral", lg[-1] if lg else None)
        pg.wait_for_timeout(600)
        chk(f"{w} item 6: a lista recarregou e o TK-0821 não tem mais selo de várias fotos", pg.locator(".produto", has=pg.locator(".codigo", has_text="TK-0821")).first.locator(".foto-qtd").count() == 0)
        # 6 — "deixar soltos"
        n_lig = len(lg)
        card2 = pg.locator(".produto", has=pg.locator(".codigo", has_text="TK-0822")).first
        card2.locator("details.mais > summary").click(); card2.locator("[data-separar-id]").click(); pg.wait_for_selector("#overlay-separar.aberto")
        pg.check("input[name=sep-fam][value=nao]"); pg.click("#sep-ok")
        a = esperar_aviso(pg, "ok")
        chk(f"{w} item 6: 'Deixar soltos' termina sem ligar família", a and "virou 3 produtos soltos" in a["txt"] and len([c for c in st["fam_chamadas"] if c["path"] == "/familias/ligar"]) == n_lig, a)
        chk(f"{w} Gestão: sem erro de JavaScript", not errs, errs)
        ctx.close()

        # ---------------------------------------------------------------- 1: uniões no cadastro de vários produtos
        ctx, st, log = contexto(b, w, h); st["midia"]["modo"] = "ok"
        pg, errs, msgs = pagina(ctx, "admin.html"); pg.wait_for_selector("#lista-produtos .produto"); pg.wait_for_timeout(1200)
        pg.click("#card-menu-cadastro > summary"); pg.click("#menu-cad-varias"); pg.wait_for_timeout(500)
        pg.set_input_files("#galeria-input", FOTOS); pg.wait_for_timeout(2500)
        chk(f"{w} item 1: 6 fotos soltas = 'Vão ser criados 6 produtos' e botão 'Cadastrar 6 produtos'", "Vão ser criados 6 produtos" in pg.inner_text("#unioes") and pg.inner_text("#btn-salvar") == "Cadastrar 6 produtos" and pg.inner_text("#galeria-contador") == "(6 produtos)", pg.inner_text("#unioes"))
        pg.locator("[data-passo=fotos]").scroll_into_view_if_needed(); evid(pg, "unioes-inicio-%d.jpg" % w)
        pg.click("#uni-unir"); pg.wait_for_timeout(150)
        chk(f"{w} item 1: 'Unir fotos' explica o que fazer e 'Unir' começa desligado", "Toque nas fotos" in pg.inner_text("#unioes") and pg.is_disabled("#uni-ok"))
        imgs = lambda: pg.locator("#galeria-grid .galeria-item img")
        imgs().nth(1).click(); imgs().nth(2).click(); imgs().nth(3).click(); pg.wait_for_timeout(150)
        chk(f"{w} item 1: marcar 3 fotos → 'Unir 3 fotos' (fotos marcadas com ✓ e aria-checked)", pg.inner_text("#uni-ok") == "Unir 3 fotos" and pg.locator("#galeria-grid img[aria-checked=true]").count() == 3)
        evid(pg, "unioes-marcando-%d.jpg" % w)
        pg.click("#uni-ok"); pg.wait_for_timeout(150)
        chk(f"{w} item 1: grupo 1 com 3 fotos → 'Vão ser criados 4 produtos'", "Vão ser criados 4 produtos" in pg.inner_text("#unioes") and "Grupo 1 · 3 fotos" in pg.inner_text("#unioes") and pg.locator("#galeria-grid [data-grupo='1']").count() == 3, pg.inner_text("#unioes"))
        # segundo grupo pelo teclado (foto 5 e 6)
        pg.click("#uni-unir"); imgs().nth(4).focus(); pg.keyboard.press("Space"); imgs().nth(5).focus(); pg.keyboard.press("Enter"); pg.wait_for_timeout(100)
        pg.click("#uni-ok"); pg.wait_for_timeout(150)
        chk(f"{w} item 1: 2 grupos + 1 solta → 'Vão ser criados 3 produtos' (por teclado também)", "Vão ser criados 3 produtos" in pg.inner_text("#unioes") and "1 foto solta + 2 grupos" in pg.inner_text("#unioes") and pg.inner_text("#btn-salvar") == "Cadastrar 3 produtos", pg.inner_text("#unioes"))
        capa_antes = pg.evaluate("fotosItens.filter(i=>i.grupo&&i.grupo===fotosItens[4].grupo).map(i=>i.prev.slice(-30))")
        pg.locator(".uni-grupo[data-grupo='2'] button", has_text="Trocar capa").click(); pg.wait_for_timeout(100)
        capa_dep = pg.evaluate("(()=>{const g=fotosItens[4].grupo;return fotosItens.filter(i=>i.grupo===g).map(i=>i.prev.slice(-30))})()")
        chk(f"{w} item 1: 'Trocar capa' faz a outra foto do grupo virar a capa (★ G2)", capa_dep == list(reversed(capa_antes)) and pg.locator("#galeria-grid .selo-grupo.capa-g").count() == 2, [capa_antes, capa_dep])
        pg.locator(".uni-grupo[data-grupo='2'] button", has_text="Desfazer").click(); pg.wait_for_timeout(100)
        chk(f"{w} item 1: 'Desfazer' volta as 2 fotos a soltas → 4 produtos", "Vão ser criados 4 produtos" in pg.inner_text("#unioes") and pg.locator(".uni-grupo").count() == 1)
        pg.click("#uni-unir"); imgs().nth(4).click(); imgs().nth(5).click(); pg.click("#uni-ok"); pg.wait_for_timeout(150)
        dims = pg.evaluate("(()=>{const bs=[...document.querySelectorAll('#unioes button')].map(b=>b.getBoundingClientRect().height);return {min:Math.min(...bs), sx:document.documentElement.scrollWidth<=innerWidth}})()")
        chk(f"{w} item 1: botões das uniões ≥ 40 px e sem rolagem lateral", dims["min"] >= 40 and dims["sx"], dims)
        pg.locator("[data-passo=fotos]").scroll_into_view_if_needed(); evid(pg, "unioes-grupos-%d.jpg" % w)
        preencher(pg, "Conjunto Unido")
        n0 = len(st["midia"]["envios"])
        pg.click("#btn-salvar"); pg.wait_for_timeout(5000)
        cr = [x for x in log if x.get("action") == "create" and x.get("nome") == "Conjunto Unido"]
        gal = sorted(len([g for g in str(x.get("fotosGaleriaExistentes", "")).split(",") if g]) for x in cr)
        chk(f"{w} item 1: cria 3 produtos (1 solta + grupo de 3 + grupo de 2), cada grupo com capa + galeria", len(cr) == 3 and gal == [0, 1, 2] and all(x.get("fotoUrlExistente", "").startswith("https://tenkiter-midia.") for x in cr), [(x.get("fotoUrlExistente"), x.get("fotosGaleriaExistentes")) for x in cr])
        chk(f"{w} item 1: nenhuma foto subiu de novo ao salvar (aproveita o pré-envio) e cada create tem opId", len(st["midia"]["envios"]) == n0 == 6 and len({x.get("opId") for x in cr}) == 3, [n0, len(st["midia"]["envios"])])
        todas = [x["fotoUrlExistente"] for x in cr] + [g for x in cr for g in x.get("fotosGaleriaExistentes", "").split(",") if g]
        chk(f"{w} item 1: as 6 fotos foram usadas, cada uma em UM produto só", len(todas) == 6 and len(set(todas)) == 6, todas)
        chk(f"{w} cadastro: sem erro de JavaScript", not errs, errs)
        ctx.close()

    # ---------------------------------------------------------------- 4: login instantâneo loja → Gestão e Gestão → loja
    print("\n==== sessão rápida ====")
    for w, h in [(390, 844), (1440, 900)]:
        ctx, st, log = contexto(b, w, h)
        pg, errs, msgs = pagina(ctx, "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(2000)
        cache = pg.evaluate("localStorage.getItem('tk_usuario_cache_v1')")
        chk(f"{w} item 4: a loja guarda o 'quem é você' preso à sessão (sem token, sem senha, sem telefone)", cache and "Ana Lojista" in cache and "tk2.x.y" not in cache and "88999999999" not in cache, cache)
        st["segurar_sessao"] = True   # o servidor de contas fica "lento": a Gestão tem que abrir logada mesmo assim
        pg.goto(BASE + "admin.html"); pg.wait_for_timeout(700)
        lbl = pg.inner_text("#lbl-funcionario")
        chk(f"{w} item 4: loja → Gestão: em <1 s já aparece 'Atendente: Ana Lojista' (sem 'Anônimo · Identificar-se') com o servidor ainda conferindo", lbl == "Ana Lojista" and not pg.locator("#btn-trocar-user").is_visible() and not pg.locator("#login-overlay.visivel").count() and len(st.get("sessao_pendentes", [])) >= 1, [lbl, len(st.get("sessao_pendentes", []))])
        chk(f"{w} item 4: até o servidor confirmar, ações sensíveis ficam escondidas (excluir de vez, conexões, importar)", pg.evaluate("document.body.classList.contains('sessao-conferindo')") and pg.evaluate("[...document.querySelectorAll('.btn-excluir,#btn-abrir-conexoes')].every(e=>getComputedStyle(e).display==='none')"))
        pg.evaluate("window.scrollTo(0,0)"); evid(pg, "sessao-gestao-instantanea-%d.jpg" % w)
        rt, bd = st["sessao_pendentes"].pop(0); rt.fulfill(json=st["_post"](bd)); st["segurar_sessao"] = False
        pg.wait_for_timeout(800)
        chk(f"{w} item 4: servidor confirmou → libera tudo (sem recarregar)", not pg.evaluate("document.body.classList.contains('sessao-conferindo')") and pg.inner_text("#lbl-funcionario") == "Ana Lojista")
        # Gestão → loja
        st["segurar_sessao"] = True
        pg.goto(BASE + "index.html"); pg.wait_for_timeout(700)
        bt = pg.locator("#btn-conta-header")
        chk(f"{w} item 4: Gestão → loja: o botão da conta já mostra 'A' (logada) com o servidor ainda conferindo", bt.is_visible() and bt.inner_text().strip() == "A" and "Ana Lojista" in (bt.get_attribute("title") or ""), [bt.inner_text(), bt.get_attribute("title")])
        # sessão inválida: desloga com aviso
        for rt, bd in st.get("sessao_pendentes", []): rt.fulfill(json={"ok": False, "sessaoInvalida": True, "erro": "Sessão expirada."})
        st["sessao_pendentes"] = []
        pg.wait_for_timeout(900)
        chk(f"{w} item 4: sessão recusada pelo servidor → loja desloga e avisa em português", pg.locator("#btn-conta-header").inner_text().strip() != "A" and "sessão terminou" in pg.inner_text("#toast-equipe"), pg.inner_text("#toast-equipe"))
        chk(f"{w} item 4: sem sessão, nada guardado vale (cache apagado)", pg.evaluate("localStorage.getItem('tk_usuario_cache_v1')") is None and pg.evaluate("localStorage.getItem('tm_session')") is None)
        chk(f"{w} sessão: sem erro de JavaScript", not errs, errs)
        ctx.close()
        # Gestão com sessão que o servidor recusa (cache antigo): desloga com aviso
        ctx, st, log = contexto(b, w, h)
        pg, errs, msgs = pagina(ctx, "admin.html"); pg.wait_for_selector("#lista-produtos .produto"); pg.wait_for_timeout(1200)
        st["segurar_sessao"] = True
        pg.reload(); pg.wait_for_timeout(700)
        chk(f"{w} item 4: Gestão → Gestão (recarregar) também abre logada na hora", pg.inner_text("#lbl-funcionario") == "Ana Lojista")
        for rt, bd in st.get("sessao_pendentes", []): rt.fulfill(json={"ok": False, "sessaoInvalida": True, "erro": "Sessão expirada."})
        st["sessao_pendentes"] = []; st["segurar_sessao"] = False
        pg.wait_for_timeout(1000)
        chk(f"{w} item 4: sessão inválida na Gestão → tela de login com 'Sua sessão terminou…'", pg.locator("#login-overlay.visivel").count() == 1 and "sessão terminou" in pg.inner_text("#lo-erro") and pg.inner_text("#lbl-funcionario") == "Anônimo", pg.inner_text("#lo-erro"))
        evid(pg, "sessao-invalida-gestao-%d.jpg" % w)
        ctx.close()

    # ---------------------------------------------------------------- 2 e 3: loja (index)
    print("\n==== loja ====")
    for w, h in [(390, 844), (1440, 900)]:
        ctx, st, log = contexto(b, w, h, versao="3.7")
        P = st["produtos"]
        pg, errs, msgs = pagina(ctx, "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(1500)
        # 3: Minha seleção
        ids = pg.evaluate("[String(produtos[0].ID), String(produtos[1].ID)]")
        pg.evaluate("salvarSacola(%s); atualizarSacolaHeader_()" % ids); pg.wait_for_timeout(200)
        pg.evaluate("abrirSacola()"); pg.wait_for_selector("#overlay-sacola.aberto")
        nome1 = pg.evaluate("produtos[1].Nome")
        pg.wait_for_timeout(600); evid(pg, "selecao-%d.jpg" % w)
        mb = pg.locator("#sacola-conteudo .item-sacola .mini-btn").nth(1)
        chk(f"{w} item 3: miniatura da seleção é um botão 'Ver a peça …' (≥44 px)", mb.get_attribute("aria-label") == "Ver a peça " + nome1 and mb.bounding_box()["height"] >= 44, mb.get_attribute("aria-label"))
        mb.click(); pg.wait_for_timeout(700)
        top = pg.evaluate("(()=>{const o=document.getElementById('overlay'),r=o.querySelector('.modal').getBoundingClientRect(),el=document.elementFromPoint(r.left+r.width/2,r.top+40);return {aberto:o.classList.contains('aberto'),porCima:o.contains(el),nome:(document.querySelector('#modal-conteudo h2, #modal-conteudo .nome')||{}).textContent||''}})()")
        chk(f"{w} item 3: tocar na miniatura abre a peça POR CIMA da seleção", top["aberto"] and top["porCima"] and nome1 in pg.inner_text("#modal-conteudo"), top)
        evid(pg, "selecao-abriu-peca-%d.jpg" % w)
        pg.go_back(); pg.wait_for_timeout(500)
        chk(f"{w} item 3: voltar fecha a peça e a seleção continua aberta", not pg.evaluate("document.getElementById('overlay').classList.contains('aberto')") and pg.locator("#overlay-sacola.aberto").count() == 1)
        pg.locator("#sacola-conteudo .item-sacola .nome-btn").nth(0).click(); pg.wait_for_timeout(400)
        chk(f"{w} item 3: tocar no nome também abre a peça", pg.evaluate("document.getElementById('overlay').classList.contains('aberto')") and pg.evaluate("produtos[0].Nome") in pg.inner_text("#modal-conteudo"))
        pg.go_back(); pg.wait_for_timeout(300); pg.go_back(); pg.wait_for_timeout(400)
        # 2: juntar na loja em segundo plano
        st["segurar_juntar"] = True
        pg.evaluate("salvarSacola([String(produtos[2].ID), String(produtos[3].ID)]); atualizarBarraFiltros_()"); pg.wait_for_timeout(300)
        pg.click("#btn-lote-menu"); pg.click('#lote-menu [data-lote=btn-bulk-juntar]'); pg.wait_for_selector("#overlay-juntar.aberto")
        cod = pg.evaluate("produtos[2].Codigo")
        pg.click("#juntar-ok"); pg.wait_for_timeout(400)
        a = aviso(pg)
        chk(f"{w} item 2 (loja): a janela fecha na hora e o aviso mostra 'Juntando 2 peças em {cod}…'", pg.locator("#overlay-juntar.aberto").count() == 0 and a and a["estado"] == "rodando" and ("Juntando 2 peças em " + cod) in a["txt"], a)
        pg.wait_for_timeout(400); evid(pg, "loja-juntando-%d.jpg" % w)
        chk(f"{w} item 2 (loja): a pessoa continua usando a loja (abrir uma peça funciona)", (pg.evaluate("abrirDetalhe(produtos[5].ID)") or True) and pg.evaluate("document.getElementById('overlay').classList.contains('aberto')"))
        pg.go_back(); pg.wait_for_timeout(300)
        rt, bd = st["juntar_pendentes"].pop(0); rt.fulfill(json=st["_post"](bd)); st["segurar_juntar"] = False
        a = esperar_aviso(pg, "ok"); pg.wait_for_timeout(400)
        chk(f"{w} item 2 (loja): resultado 'Pronto: {cod} ficou com 2 fotos; 1 arquivada.'", a and ("Pronto: %s ficou com 2 fotos; 1 arquivada." % cod) in a["txt"], a)
        evid(pg, "loja-juntou-%d.jpg" % w)
        pos = pg.evaluate("(()=>{const a=document.getElementById('tk-fila-lote').getBoundingClientRect(),n=document.querySelector('.tk-nav');const r=n&&n.getClientRects().length&&getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().top>innerHeight/2?n.getBoundingClientRect():{top:innerHeight};return {acima:a.bottom<=r.top+1, dentro:a.left>=0&&a.right<=innerWidth}})()")
        chk(f"{w} item 2 (loja): aviso acima da barra inferior e dentro da tela", pos["acima"] and pos["dentro"], pos)
        chk(f"{w} loja: sem erro de JavaScript", not errs, errs)
        ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
