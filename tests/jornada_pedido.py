"""Jornada do pedido (catálogo público, v3.3): ordenação, ações rápidas do cartão, favoritos, sacola com dados, pedido enviado,
acompanhamento (código + 4 últimos números), compartilhar seleção, rodapé/WhatsApp fixo da loja, aviso de offline, CSP e o
site funcionando com o backend ANTIGO (3.0). O Apps Script é simulado (mock.py)."""
import sys, json, re, os
from urllib.parse import unquote
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
STUB = "window.open=(u)=>{window.__opened=(window.__opened||[]).concat([String(u)]);return {closed:false}}"
SITE = "https://tenkitermodas.com.br/"
ZAP = "5588993223998"

def nova_pagina(ctx, erros, csp):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("console", lambda m: csp.append(m.text) if ("Content Security Policy" in m.text or "Refused to" in m.text) else None)
    pg.add_init_script(STUB)
    pg.on("dialog", lambda d: d.accept())
    return pg

def abertos(pg): return [unquote(u) for u in pg.evaluate("window.__opened||[]")]

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    # ---------------------------------------------------------------- backend NOVO (3.1)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    log = []; st = install(ctx, log=log)
    erros = []; csp = []
    pg = nova_pagina(ctx, erros, csp)
    print("== Catálogo: ordenar, cartão, rodapé ==")
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(1800)
    n0 = pg.locator(".card:not(.esqueleto)").count(); chk("catálogo mostra peças", n0 >= 10, n0)
    def precos():
        return pg.evaluate("""()=>[...document.querySelectorAll('.card .preco')].map(e=>parseFloat((e.childNodes[0].textContent||'').replace(/[^0-9,]/g,'').replace(',','.')))""")
    pg.select_option("#ordem", "menor"); pg.wait_for_timeout(400)
    pr = precos(); chk("ordenar por menor preço", len(pr) > 3 and pr == sorted(pr), pr[:6])
    pg.select_option("#ordem", "maior"); pg.wait_for_timeout(400)
    pr = precos(); chk("ordenar por maior preço", len(pr) > 3 and pr == sorted(pr, reverse=True), pr[:6])
    pg.select_option("#ordem", "az"); pg.wait_for_timeout(400)
    nomes = pg.evaluate("()=>[...document.querySelectorAll('.card .abrir-peca')].map(e=>e.textContent.trim())")
    chk("ordenar por nome A–Z", nomes == sorted(nomes, key=lambda s: s.lower()) or nomes == sorted(nomes), nomes[:5])
    pg.select_option("#ordem", "recentes"); pg.wait_for_timeout(300)

    txt = pg.evaluate("document.body.innerText")
    html = pg.content()
    chk("rodapé mostra o endereço da loja", "Moreira da Rocha" in txt and "759" in txt and "Crateús" in txt)
    chk("não aparece CNPJ", "cnpj" not in html.lower())
    numeros = set(re.findall(r"wa\.me/(\d+)", html))
    chk("todo link wa.me é o fixo da loja (sem número de atendente)", numeros <= {ZAP} and ZAP in numeros, numeros)
    chk("botão flutuante do WhatsApp aponta para a loja", ZAP in (pg.get_attribute("#fab-zap", "href") or ""))
    chk("link do rodapé 'WhatsApp da loja' aponta para a loja", ZAP in (pg.get_attribute("#rod-zap", "href") or ""))

    print("== Ações rápidas no cartão ==")
    D = ".card:not(.esqueleto):has(.ac-sacola)"   # só peças disponíveis (as esgotadas não têm botão de sacola)
    card = pg.locator(D).nth(1)
    cid = card.get_attribute("data-id")
    card.locator(".ac-sacola").click(); pg.wait_for_timeout(250)
    chk("'Sacola' no cartão põe a peça na sacola (sem abrir a peça)", pg.locator("#badge-sacola").inner_text() == "1" and pg.locator("#foto-principal-modal").count() == 0)
    chk("botão do cartão vira 'Na sacola' (aria-pressed)", pg.locator('.card[data-id="%s"] .ac-sacola' % cid).get_attribute("aria-pressed") == "true")
    card2 = pg.locator(D).nth(2); cid2 = card2.get_attribute("data-id")
    card2.locator(".btn-favorito-card").click(); pg.wait_for_timeout(200)
    chk("coração do cartão favorita", pg.locator("#badge-favoritos").inner_text() == "1")
    card3 = pg.locator(D).nth(3); cid3 = card3.get_attribute("data-id")
    card3.locator(".btn-favorito-card").click(); pg.wait_for_timeout(200)

    print("== Favoritos (gaveta) ==")
    pg.click("#btn-favoritos-header"); pg.wait_for_timeout(500)
    chk("gaveta de favoritos abre", pg.locator("#overlay-favoritos.aberto").count() == 1)
    chk("lista os 2 favoritos", pg.locator("#favoritos-conteudo .fav-linha").count() == 2, pg.locator("#favoritos-conteudo .fav-linha").count())
    pg.evaluate("window.__opened=[]")
    pg.click("#fav-pedir"); pg.wait_for_timeout(300)
    op = abertos(pg)
    chk("pedir lista de favoritos abre o WhatsApp DA LOJA", len(op) == 1 and ("wa.me/" + ZAP) in op[0], op)
    chk("mensagem dos favoritos traz o link completo da peça (https://…/p/TK-)", bool(op) and (SITE + "p/TK-") in op[0], op[:1])
    chk("mensagem não traz &amp; escapado", bool(op) and "&amp;" not in op[0])
    pg.click("#fav-mover"); pg.wait_for_timeout(800)
    chk("'Adicionar todos à sacola' abre a sacola com os itens", pg.locator("#overlay-sacola.aberto").count() == 1 and pg.locator("#sacola-conteudo .item-sacola").count() == 3, pg.locator("#sacola-conteudo .item-sacola").count())
    chk("favoritos continuam guardados", pg.locator("#badge-favoritos").inner_text() == "2")

    print("== Sacola → formulário → pedido ==")
    log.clear(); pg.evaluate("window.__opened=[]")
    pg.click("#btn-enviar-sacola"); pg.wait_for_timeout(300)
    chk("sem dados: mostra erro e NÃO envia", "nome" in pg.inner_text("#ped-erro").lower() and not [x for x in log if x.get("action") == "criarPedido"] and not abertos(pg))
    pg.fill("#ped-nome", "Maria Souza"); pg.fill("#ped-whats", "88 9999"); pg.click("#btn-enviar-sacola"); pg.wait_for_timeout(250)
    chk("WhatsApp incompleto é recusado", "whatsapp" in pg.inner_text("#ped-erro").lower() and not [x for x in log if x.get("action") == "criarPedido"])
    chk("campo inválido fica marcado (aria-invalid)", pg.get_attribute("#ped-whats", "aria-invalid") == "true")
    pg.fill("#ped-whats", "88 99876-5432")
    pg.check('input[name="ped-entrega"][value="entrega"]'); pg.wait_for_timeout(150)
    chk("escolher entrega mostra o campo de endereço", pg.locator("#ped-endereco-wrap").is_visible())
    pg.click("#btn-enviar-sacola"); pg.wait_for_timeout(250)
    chk("entrega sem endereço é recusada", "endere" in pg.inner_text("#ped-erro").lower() or "rua" in pg.inner_text("#ped-erro").lower())
    pg.fill("#ped-endereco", "Rua das Flores 100, Centro, Crateús")
    pg.fill("#ped-obs", "Preciso até sexta")
    pg.click("#btn-enviar-sacola"); pg.wait_for_timeout(1200)
    cria = [x for x in log if x.get("action") == "criarPedido"]
    chk("enviou criarPedido ao servidor", len(cria) == 1, len(cria))
    if cria:
        c = cria[0]
        chk("pedido leva nome, whatsapp só dígitos, entrega, endereço e observação", c.get("nome") == "Maria Souza" and c.get("whatsapp") == "88998765432" and c.get("entrega") == "entrega" and "Flores" in c.get("endereco", "") and c.get("obs") == "Preciso até sexta", c)
        chk("pedido leva só os ids das 3 peças (preço é calculado no servidor)", len(c.get("itens", [])) == 3 and all(set(i.keys()) == {"id"} for i in c["itens"]), c.get("itens"))
    chk("tela 'Pedido enviado' com o código", pg.locator("#codigo-pedido").count() == 1 and pg.inner_text("#codigo-pedido") == "PED-0001")
    op = abertos(pg)
    chk("abriu o WhatsApp DA LOJA com a mensagem", len(op) == 1 and ("wa.me/" + ZAP) in op[0], op)
    if op:
        m = op[0]
        chk("mensagem tem o código do pedido", "PED-0001" in m)
        chk("mensagem tem o endereço COMPLETO de acompanhamento (https://tenkitermodas.com.br/?pedido=PED-0001)", (SITE + "?pedido=PED-0001") in m, m[-200:])
        chk("mensagem tem os links completos das peças", (SITE + "p/TK-") in m)
        chk("mensagem tem nome, endereço e observação", "Maria Souza" in m and "Rua das Flores" in m and "Preciso até sexta" in m)
        chk("mensagem sem &amp;", "&amp;" not in m)
    chk("link de acompanhamento na tela é completo", (pg.get_attribute("#link-rastreio-ok", "href") or "").startswith(SITE + "?pedido=PED-0001"))
    chk("botão 'abrir WhatsApp' (reserva, se o pop-up for bloqueado) aponta para a loja", ZAP in (pg.get_attribute("#btn-abrir-zap", "href") or ""))
    chk("sacola esvaziou depois do pedido", pg.locator("#badge-sacola").is_hidden() or pg.inner_text("#badge-sacola") == "0")
    chk("dados NÃO ficaram no aparelho (não marcou 'lembrar')", pg.evaluate("localStorage.getItem('tenkiter_cliente_dados_v1')") is None or pg.evaluate("localStorage.getItem('tenkiter_cliente_dados_v1')") == "null")

    print("== Acompanhar pedido ==")
    pg.click("#btn-ir-rastreio"); pg.wait_for_timeout(900)
    res = pg.inner_text("#rast-resultado")
    chk("acompanhamento mostra pedido, etapa e itens", "PED-0001" in res and ("Pedido recebido" in res or "recebido" in res.lower()) and "TK-" in res, res[:200])
    chk("etapas viram lista com a atual marcada", pg.locator("#rast-resultado ol.etapas li[aria-current='step']").count() == 1)
    st["pedidos"][0]["status"] = "pronto"
    pg.fill("#rast-final", "0000"); pg.click("#btn-consultar"); pg.wait_for_timeout(500)
    chk("4 últimos números errados NÃO mostram o pedido", "Não encontramos" in pg.inner_text("#rast-erro") and pg.locator("#rast-resultado .etapas").count() == 0, pg.inner_text("#rast-erro"))
    pg.fill("#rast-final", "5432"); pg.click("#btn-consultar"); pg.wait_for_timeout(500)
    res = pg.inner_text("#rast-resultado")
    chk("status novo aparece ao consultar de novo (entrega → 'Saiu para entrega')", "Saiu para entrega" in res, res[:200])
    pg.fill("#rast-codigo", "xx"); pg.click("#btn-consultar"); pg.wait_for_timeout(200)
    chk("código malformado: mensagem clara, sem chamar o servidor", "código" in pg.inner_text("#rast-erro").lower())
    pg.fill("#rast-codigo", "PED-0001")
    for _ in range(9):
        pg.fill("#rast-final", "1111"); pg.click("#btn-consultar"); pg.wait_for_timeout(120)
    chk("muitas tentativas erradas bloqueiam (15 min)", "Muitas tentativas" in pg.inner_text("#rast-erro"), pg.inner_text("#rast-erro"))
    pg.click("#btn-fechar-rastreio"); pg.wait_for_timeout(300)

    print("== Link ?pedido=… e rodapé 'Acompanhar' ==")
    pg2 = nova_pagina(ctx, erros, csp)
    pg2.goto(BASE + "index.html?pedido=PED-0001"); pg2.wait_for_timeout(1800)
    chk("?pedido=PED-0001 abre o acompanhamento com o código preenchido", pg2.locator("#overlay-rastreio.aberto").count() == 1 and pg2.input_value("#rast-codigo") == "PED-0001")
    chk("o campo dos 4 últimos números está vazio (não adivinha)", pg2.input_value("#rast-final") == "")
    pg2.close()

    print("== Compartilhar seleção ==")
    pg.goto(BASE + "index.html?q=vestido"); pg.wait_for_timeout(1500)
    if not pg.locator("#btn-share-filtros").is_visible(): pg.click("#btn-filtros-toggle"); pg.wait_for_timeout(300)
    pg.click("#btn-share-filtros"); pg.wait_for_timeout(500)
    val = pg.input_value("#sel-link")
    chk("link da seleção usa o endereço do SITE", val.startswith(SITE) and "q=vestido" in val, val)
    zap = unquote(pg.get_attribute("#sel-zap", "href") or "")
    chk("mensagem de compartilhar tem o link completo", val in zap and zap.startswith("https://wa.me/?text="), zap)
    chk("texto da seleção não cita atendente", "atendente" not in pg.inner_text("#selecao-conteudo").lower())
    pg.click("#btn-fechar-selecao"); pg.wait_for_timeout(250)

    print("== Lembrar dados (só se a pessoa marcar) ==")
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(1500)
    pg.locator(D).first.locator(".ac-sacola").click(); pg.click("#btn-sacola-header"); pg.wait_for_timeout(400)
    pg.fill("#ped-nome", "João Lima"); pg.fill("#ped-whats", "88 98888-7777")
    pg.check("#ped-lembrar"); pg.click("#btn-enviar-sacola"); pg.wait_for_timeout(1000)
    salvo = pg.evaluate("localStorage.getItem('tenkiter_cliente_dados_v1')") or ""
    chk("marcando 'lembrar', o nome fica no aparelho", "João Lima" in salvo)
    chk("nunca guarda observação nem itens no aparelho", "obs" not in salvo and "itens" not in salvo)
    pg.click("#btn-continuar"); pg.wait_for_timeout(300)
    pg.locator(D).nth(4).locator(".ac-sacola").click(); pg.click("#btn-sacola-header"); pg.wait_for_timeout(400)
    chk("na próxima sacola os dados já vêm preenchidos", pg.input_value("#ped-nome") == "João Lima" and "98888" in pg.input_value("#ped-whats"))
    pg.uncheck("#ped-lembrar"); pg.click("#btn-enviar-sacola"); pg.wait_for_timeout(1000)
    chk("desmarcando 'lembrar', os dados somem do aparelho", (pg.evaluate("localStorage.getItem('tenkiter_cliente_dados_v1')") or "null") == "null")

    print("== Sem internet ==")
    pg.click("#btn-continuar"); pg.wait_for_timeout(300)
    ctx.set_offline(True); pg.evaluate("window.dispatchEvent(new Event('offline'))"); pg.wait_for_timeout(300)
    chk("aviso 'Sem internet' aparece", pg.locator("#aviso-offline").is_visible())
    chk("o catálogo continua na tela", pg.locator(".card:not(.esqueleto)").count() >= 10)
    ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(500)
    chk("aviso some quando a internet volta", pg.locator("#aviso-offline").is_hidden())

    chk("nenhum erro de JavaScript", not erros, erros)
    chk("nenhum bloqueio de Content-Security-Policy no console", not csp, csp[:3])
    ctx.close()

    # ---------------------------------------------------------------- backend ANTIGO (3.0): o site tem que seguir funcionando
    print("== Backend antigo (3.0): degradação elegante ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    log = []; install(ctx, log=log, versao="3.0")
    erros = []; csp = []
    pg = nova_pagina(ctx, erros, csp)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(1800)
    pg.locator(D).first.locator(".ac-sacola").click(); pg.click("#btn-sacola-header"); pg.wait_for_timeout(400)
    pg.fill("#ped-nome", "Carla Dias"); pg.fill("#ped-whats", "88 97777-6666"); pg.click("#btn-enviar-sacola"); pg.wait_for_timeout(1000)
    op = abertos(pg)
    chk("sem backend novo o pedido sai normal pelo WhatsApp da loja", len(op) == 1 and ("wa.me/" + ZAP) in op[0], op)
    chk("não chamou criarPedido (o servidor antigo não conhece)", not [x for x in log if x.get("action") == "criarPedido"])
    chk("não mostra código de pedido nem acompanhamento", pg.locator("#codigo-pedido").count() == 0 and pg.locator("#btn-ir-rastreio").count() == 0)
    chk("oferece 'Já enviei — esvaziar a sacola'", pg.locator("#btn-esvaziar-depois").count() == 1)
    chk("a sacola NÃO foi esvaziada sozinha (a pessoa pode ter fechado o WhatsApp)", pg.inner_text("#badge-sacola") == "1")
    pg.click("#btn-esvaziar-depois"); pg.wait_for_timeout(400)
    chk("esvaziar manualmente funciona", pg.locator("#badge-sacola").is_hidden() or pg.inner_text("#badge-sacola") == "0")
    pg.goto(BASE + "index.html?pedido=PED-0001"); pg.wait_for_timeout(1500)
    pg.fill("#rast-final", "6666"); pg.click("#btn-consultar"); pg.wait_for_timeout(500)
    chk("acompanhar sem backend novo: aviso claro (não quebra)", "ainda não está disponível" in pg.inner_text("#rast-erro"), pg.inner_text("#rast-erro"))
    chk("nenhum erro de JavaScript (backend antigo)", not erros, erros)
    ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD)
sys.exit(1 if BAD else 0)
