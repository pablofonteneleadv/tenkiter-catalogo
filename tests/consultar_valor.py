"""v4.21 — "Consultar valor" (peça sem preço): catálogo, sacola, cadastro único e em massa, edição, lista, Alterar preços em lote e Postagens.
O Apps Script (mock.py, versao 4.20) e a internet são SIMULADOS.   python3 tests/consultar_valor.py"""
import sys, os, re, json
from urllib.parse import unquote
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI); os.makedirs(os.path.join(AQUI, "saida"), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
from PIL import Image
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
S = os.path.join(AQUI, "saida")
Image.new("RGB", (900, 1200), (60, 110, 190)).save(os.path.join(S, "cv1.jpg")); Image.new("RGB", (900, 1200), (190, 110, 60)).save(os.path.join(S, "cv2.jpg"))
OK = []; BAD = []
STUB = "window.open=(u)=>{window.__opened=(window.__opened||[]).concat([String(u)]);return {closed:false}}"
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + (" — " + str(e) if e and not c else ""))
def abertos(pg): return [unquote(u) for u in pg.evaluate("window.__opened||[]")]

def catalogo(b, versao="4.20"):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script("window.TK_PEDIDOS=true;")  # cenário de pedido opcional
    log = []; st = install(ctx, log=log, versao=versao)
    for q in st["produtos"][:3]: q["Status"] = "Ativo"; q["Estoque"] = 5
    st["produtos"][0]["Preco"] = 0            # a primeira peça é "Consulte valor"
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept()); pg.add_init_script(STUB)
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(900)
    return ctx, pg, st, log, erros

def admin(b, versao="4.20", perms=PERMS_ALL):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); log = []
    st = install(ctx, log=log, versao=versao, perms=perms); st["midia"]["modo"] = "ok"
    ctx.route("https://api.cloudinary.com/**", lambda r: r.fulfill(json={"secure_url": "https://res.cloudinary.com/z/image/upload/v1/up.jpg"}))
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(1800)
    return ctx, pg, st, log, erros

def preencher(pg, nome="Peça sob consulta", preco=None):
    pg.fill("#nome", nome)
    if preco: pg.fill("#preco", preco)
    if not pg.locator("#chips-genero .chip:first-child").evaluate('e => e.classList.contains("selecionado")'):
        pg.click("#chips-genero .chip:first-child")
    pg.click("#btn-abrir-categorias"); pg.click("#cat-lista .cat-item:has-text('Vestido')"); pg.click("#cat-pronto")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    print("== Catálogo: peça sem preço mostra 'Consulte valor' ==")
    ctx, pg, st, log, er = catalogo(b)
    pid = st["produtos"][0]["ID"]
    card = pg.locator('.card[data-id="%s"]' % pid)
    chk("o cartão mostra 'Consulte valor'", "Consulte valor" in card.inner_text(), card.inner_text())
    chk("NUNCA aparece R$ 0,00 na grade", "R$ 0,00" not in pg.inner_text("#grid"))
    pg.select_option("#ordem", "menor"); pg.wait_for_timeout(400)
    ids = pg.evaluate("[...document.querySelectorAll('.card')].map(c=>c.dataset.id)")
    chk("ordenar por menor preço: 'Consulte valor' vai para o FIM", ids and ids[-1] == pid and ids[0] != pid, ids[:3])
    pg.select_option("#ordem", "maior"); pg.wait_for_timeout(400)
    ids = pg.evaluate("[...document.querySelectorAll('.card')].map(c=>c.dataset.id)")
    chk("ordenar por maior preço: também no fim", ids and ids[-1] == pid, ids[-3:])
    pg.select_option("#ordem", "recentes"); pg.wait_for_timeout(300)
    pg.evaluate("(()=>{const e=document.getElementById('preco-max'); e.value='5000'; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}))})()"); pg.wait_for_timeout(500)
    chk("filtro de preço máximo NÃO traz a peça sem preço", pg.locator('.card[data-id="%s"]' % pid).count() == 0)
    pg.evaluate("(()=>{const e=document.getElementById('preco-max'); e.value=''; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}))})()"); pg.wait_for_timeout(500)
    chk("limpando o filtro ela volta", pg.locator('.card[data-id="%s"]' % pid).count() == 1)

    print("== Catálogo: janela da peça, título e WhatsApp ==")
    pg.locator('.card[data-id="%s"] .abrir-peca' % pid).click(); pg.wait_for_selector("#overlay.aberto"); pg.wait_for_timeout(500)
    m = pg.inner_text("#modal-conteudo")
    chk("janela da peça mostra 'Consulte valor' e não R$ 0,00 nem 'à vista'", "Consulte valor" in m and "R$ 0,00" not in m and "à vista" not in m.split("Consulte valor")[0][-40:], m[:300])
    chk("título da página usa 'Consulte valor'", "Consulte valor" in pg.title() and "R$" not in pg.title(), pg.title())
    ld = pg.evaluate("(document.getElementById('ld-produto')||{}).textContent||''")
    chk("dados estruturados sem oferta de preço", ld and "offers" not in ld, ld[:120])
    pg.evaluate("window.__opened=[]")
    pg.locator("#modal-conteudo .btn-zap, #modal-conteudo [id^=btn-pedir], #modal-conteudo .bc-pedir").first.click(); pg.wait_for_timeout(500)
    op = abertos(pg)
    chk("mensagem do WhatsApp pergunta o valor (sem R$ 0,00)", op and "saber o valor" in op[-1] and "R$ 0,00" not in op[-1], op)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    print("== Catálogo: sacola mistura peça com preço e sem preço ==")
    pg.evaluate("window.__opened=[]")
    pg.locator('.card[data-id="%s"] .ac-sacola' % pid).click(); pg.wait_for_timeout(200)
    outro = st["produtos"][1]["ID"]
    pg.locator('.card[data-id="%s"] .ac-sacola' % outro).click(); pg.wait_for_timeout(200)
    pg.click("#btn-sacola-header"); pg.wait_for_selector("#overlay-sacola.aberto"); pg.wait_for_timeout(400)
    s = pg.inner_text("#sacola-conteudo")
    chk("sacola: a peça sem preço aparece como 'Consulte valor'", "Consulte valor" in s, s[:300])
    esperado = "R$ %.2f" % (st["produtos"][1]["Preco"] * 0.9)
    tot = pg.inner_text(".bc-total strong")
    chk("total soma só a peça COM preço e avisa que tem peça a consultar", esperado.replace(".", ",") in tot and "consulta" in tot.lower(), (tot, esperado))
    pg.fill("#ped-nome", "Maria Souza"); pg.fill("#ped-whats", "88 99876-5432"); pg.click("#btn-enviar-sacola"); pg.wait_for_timeout(1500)
    cria = [x for x in log if x.get("action") == "criarPedido"]
    chk("o pedido leva as duas peças ao servidor", len(cria) == 1 and len(cria[0].get("itens", [])) == 2, cria)
    op = abertos(pg)
    chk("mensagem do pedido: 'consulte o valor' na peça sem preço e total sem R$ 0,00 enganoso", op and "consulte o valor" in op[-1] and "a consultar" in op[-1], op[-1:] if op else op)
    chk("sem erro de JavaScript no catálogo", not er, er); ctx.close()

    print("== Admin: cadastro de UMA peça com 'Consultar valor' ==")
    ctx, pg, st, log, er = admin(b)
    pg.evaluate("document.getElementById('card-form').open=true"); pg.wait_for_timeout(300)
    chk("backend 4.20: a opção 'Consultar valor' aparece", pg.locator("#linha-consulta").is_visible())
    pg.set_input_files("#galeria-input", os.path.join(S, "cv1.jpg")); pg.wait_for_timeout(1500)
    preencher(pg)
    chk("sem preço e sem a marca: o aviso de falta pede o preço", "preço" in pg.inner_text("#cad-falta"), pg.inner_text("#cad-falta"))
    pg.check("#consultar-valor"); pg.wait_for_timeout(200)
    chk("marcado: campo de preço travado e vazio", pg.is_disabled("#preco") and pg.input_value("#preco") == "")
    chk("marcado: o aviso diz 'Tudo certo' (preço deixa de ser obrigatório)", "Tudo certo" in pg.inner_text("#cad-falta"), pg.inner_text("#cad-falta"))
    chk("marcado: a dica explica que vai aparecer 'Consulte valor'", "Consulte valor" in pg.inner_text("#dica-avista"))
    pg.click("#btn-salvar"); pg.wait_for_timeout(2500)
    cr = [x for x in log if x.get("action") == "create"]
    chk("create leva consultarValor:true e preço vazio", len(cr) == 1 and cr[0].get("consultarValor") is True and cr[0].get("preco") == "", cr and {k: cr[0].get(k) for k in ("consultarValor", "preco")})
    chk("depois de salvar o formulário volta ao normal (preço liberado, caixa desmarcada)", pg.is_enabled("#preco") and not pg.is_checked("#consultar-valor"))

    print("== Admin: cadastro com preço escrito NÃO manda a marca ligada ==")
    pg.evaluate("document.getElementById('card-form').open=true"); pg.wait_for_timeout(300)
    pg.set_input_files("#galeria-input", os.path.join(S, "cv2.jpg")); pg.wait_for_timeout(1500)
    preencher(pg, "Peça com preço", "89.90")
    pg.click("#btn-salvar"); pg.wait_for_timeout(2500)
    cr = [x for x in log if x.get("action") == "create"]
    chk("create com valor escrito: consultarValor:false e preço corrigido pela regra ,99 (89,90 → 89.99)", len(cr) == 2 and cr[1].get("consultarValor") is False and cr[1].get("preco") == "89.99", cr and cr[-1])

    print("== Admin: várias peças de uma vez com 'Consultar valor' ==")
    pg.click("#details-ferramentas > summary") if pg.locator("#details-ferramentas[open]").count() == 0 and False else None
    pg.evaluate("document.getElementById('menu-cad-varias') && document.getElementById('menu-cad-varias').click()"); pg.wait_for_timeout(500)
    pg.evaluate("document.getElementById('card-form').open=true"); pg.wait_for_timeout(300)
    pg.set_input_files("#galeria-input", [os.path.join(S, "cv1.jpg"), os.path.join(S, "cv2.jpg")]); pg.wait_for_timeout(2000)
    preencher(pg, "Lote sob consulta")
    pg.check("#consultar-valor"); pg.wait_for_timeout(200)
    pg.click("#btn-salvar"); pg.wait_for_timeout(3500)
    cr = [x for x in log if x.get("action") == "create" and x.get("nome") == "Lote sob consulta"]
    chk("lote: cada peça vai com consultarValor:true", len(cr) == 2 and all(x.get("consultarValor") is True and x.get("preco") == "" for x in cr), cr)

    print("== Admin: lista, editar e voltar ao valor escrito ==")
    st["produtos"][2]["Preco"] = 0
    pg.reload(); pg.wait_for_timeout(2000)
    linha = pg.locator(".produto", has_text=st["produtos"][2]["Codigo"]).first
    chk("a lista do admin mostra 'Consulte valor' na peça sem preço", "Consulte valor" in (linha.text_content() or "") and "R$ 0,00" not in (linha.text_content() or ""), (linha.text_content() or "")[:200])
    linha.locator(".btn-editar").evaluate("e=>e.click()"); pg.wait_for_timeout(800)
    chk("editar: a caixa já vem marcada e o preço travado", pg.is_checked("#consultar-valor") and pg.is_disabled("#preco"))
    pg.uncheck("#consultar-valor"); pg.wait_for_timeout(200)
    chk("desmarcar libera o preço e volta a exigir valor", pg.is_enabled("#preco") and "preço" in pg.inner_text("#cad-falta"))
    pg.fill("#preco", "120"); pg.click("#btn-salvar"); pg.wait_for_timeout(2000)
    up = [x for x in log if x.get("action") == "update"]
    chk("update leva consultarValor:false e o preço novo corrigido pela regra ,99 (120 → 119.99)", up and up[-1].get("consultarValor") is False and str(up[-1].get("preco")) == "119.99", up[-1:] )
    chk("sem erro de JavaScript no admin", not er, er); ctx.close()

    print("== Admin: Alterar preços em lote (% / valor escrito / Consultar valor) ==")
    ctx, pg, st, log, er = admin(b)
    st["produtos"][3]["Preco"] = 0
    pg.reload(); pg.wait_for_timeout(2000)
    pg.evaluate("document.querySelectorAll('.produto-chk').forEach((c,i)=>{ if(i<2) c.click(); })"); pg.wait_for_timeout(400)
    pg.click("#btn-bulk-preco"); pg.wait_for_timeout(400)
    chk("abre uma janela própria (não mais o prompt do navegador)", pg.locator("#overlay-precos.aberto").count() == 1)
    chk("com o backend 4.20 aparecem as 3 opções", pg.locator("#overlay-precos .precos-modo:visible").count() == 3)
    pg.click("#precos-ok"); pg.wait_for_timeout(200)
    chk("% sem número: mostra a frase de erro e não envia", pg.locator("#precos-erro:visible").count() == 1 and not [x for x in log if x.get("action") == "bulkUpdate"])
    pg.click("#overlay-precos .precos-modo:has(input[value=escrito])"); pg.wait_for_timeout(150)
    pg.fill("#precos-valor", "0"); pg.click("#precos-ok"); pg.wait_for_timeout(200)
    chk("valor escrito 0: recusa", pg.locator("#precos-erro:visible").count() == 1)
    pg.fill("#precos-valor", "99,90"); pg.click("#precos-ok"); pg.wait_for_timeout(1500)
    bl = [x for x in log if x.get("action") == "bulkUpdate"]
    chk("valor escrito: bulkUpdate valorEscrito com 99.9", bl and bl[-1].get("tipoAcao") == "valorEscrito" and float(bl[-1].get("valor")) == 99.9 and len(bl[-1].get("ids", [])) == 2, bl[-1:])
    pg.evaluate("document.querySelectorAll('.produto-chk').forEach((c,i)=>{ if(i<2) c.click(); })"); pg.wait_for_timeout(400)
    pg.click("#btn-bulk-preco"); pg.wait_for_timeout(300)
    pg.click("#overlay-precos .precos-modo:has(input[value=consulta])"); pg.wait_for_timeout(150)
    pg.click("#precos-ok"); pg.wait_for_timeout(1500)
    bl = [x for x in log if x.get("action") == "bulkUpdate"]
    chk("Consultar valor: bulkUpdate consultarValor para as 2 marcadas", bl and bl[-1].get("tipoAcao") == "consultarValor" and len(bl[-1].get("ids", [])) == 2, bl[-1:])
    pg.evaluate("document.querySelectorAll('.produto-chk').forEach((c,i)=>{ if(i<2) c.click(); })"); pg.wait_for_timeout(400)
    pg.click("#btn-bulk-preco"); pg.wait_for_timeout(300)
    pg.fill("#precos-pct", "10"); pg.click("#precos-ok"); pg.wait_for_timeout(1500)
    bl = [x for x in log if x.get("action") == "bulkUpdate"]
    chk("% continua funcionando (ajustarPrecoPorcento 10)", bl and bl[-1].get("tipoAcao") == "ajustarPrecoPorcento" and float(bl[-1].get("valor")) == 10, bl[-1:])
    chk("sem erro de JavaScript", not er, er); ctx.close()

    print("== Admin com backend ANTIGO (4.19): nada de botão que não funciona ==")
    ctx, pg, st, log, er = admin(b, versao="4.19")
    pg.evaluate("document.getElementById('card-form').open=true"); pg.wait_for_timeout(300)
    chk("sem a bandeira, a opção 'Consultar valor' fica escondida", pg.locator("#linha-consulta").is_hidden())
    pg.evaluate("document.querySelectorAll('.produto-chk').forEach((c,i)=>{ if(i<1) c.click(); })"); pg.wait_for_timeout(300)
    pg.click("#btn-bulk-preco"); pg.wait_for_timeout(300)
    chk("Alterar preços só oferece o % (como antes)", pg.locator("#overlay-precos .precos-modo:visible").count() == 1)
    ctx.close()

    print("== Postagens: peça sem preço vira 'Consulte valor' sozinha, junto com peças com preço ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", permissions=["clipboard-read", "clipboard-write"])
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    log = []; st = install(ctx, log=log, versao="4.20"); st["midia"]["modo"] = "ok"
    for q in st["produtos"][:3]: q["Status"] = "Ativo"; q["Estoque"] = 5; q["Foto_URL"] = "https://res.cloudinary.com/z/image/upload/v1/x%s.jpg" % q["Codigo"]
    st["produtos"][0]["Preco"] = 0
    pg = ctx.new_page(); er = []; pg.on("pageerror", lambda e: er.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2400)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(900)
    cartoes = pg.locator(".po-card")
    chk("a grade de peças da aba mostra 'Consulte valor' (e não R$ 0,00)", "Consulte valor" in pg.inner_text("#po-corpo") and "R$ 0,00" not in pg.inner_text("#po-corpo"))
    pg.locator(".po-card", has_text=st["produtos"][0]["Codigo"]).first.click(); pg.locator(".po-card", has_text=st["produtos"][1]["Codigo"]).first.click(); pg.wait_for_timeout(300)
    pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(900)
    corpo = pg.inner_text("#po-corpo")
    chk("em lote: a peça sem preço vem marcada e travada em 'sem preço'; a outra, com a caixa livre", pg.locator("[data-sp]:checked:disabled").count() >= 1 and pg.locator("[data-sp]:not(:checked):not(:disabled)").count() >= 1, corpo[:300])
    _c = pg.inner_text("#po-corpo"); i0 = _c.find("R$ 0,00")
    if i0 >= 0: print("   contexto R$ 0,00:", repr(_c[max(0, i0 - 120):i0 + 60]))
    chk("a legenda da peça sem preço fala 'Consulte valor' (nunca R$ 0,00)", "R$ 0,00" not in pg.inner_text("#po-corpo") and pg.locator("#po-leg").count() == 1 and ("Consulte valor" in pg.input_value("#po-leg") if pg.locator("#po-leg").count() else True), pg.input_value("#po-leg")[:200] if pg.locator("#po-leg").count() else "sem campo")
    chk("sem erro de JavaScript nas Postagens", not er, er); ctx.close()

    b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)))
if BAD: print("FALHARAM:", BAD)
sys.exit(1 if BAD else 0)
