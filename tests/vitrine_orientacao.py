"""Vitrine (auditoria 11/10/2026): textos de consulta/seleção, filtros ativos removíveis, rolagem preservada ao voltar da peça, ajuda no fim da lista."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    st = install(ctx, versao="3.7"); erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(900)
    # v7.0 (VIT-6): o CTA do cartão diz o que faz e onde — "Pedir no WhatsApp" —
    # em vez do genérico "Consultar", que não dizia para onde o toque levava.
    chk("cartão: CTA nomeia o WhatsApp (não mais 'Consultar')", "WhatsApp" in pg.locator(".ac-pedir").first.inner_text(), pg.locator(".ac-pedir").first.inner_text())
    chk("cartão: botão 'Selecionar' e título da seleção", "Selecionar" in pg.locator(".ac-sacola").first.inner_text() and pg.get_attribute("#btn-sacola-header", "title") == "Abrir minha seleção")
    chk("a busca vem ANTES da faixa de vantagens", pg.evaluate("document.getElementById('busca').getBoundingClientRect().top < document.getElementById('beneficios').getBoundingClientRect().top"))
    chk("faixa de vantagens fala em 'Consulte'", "Consulte pelo WhatsApp" in pg.inner_text("#beneficios"))
    chk("sem filtro nenhum, a faixa de filtros ativos não aparece", pg.locator("#etiquetas-ativas").is_hidden())
    # etiquetas de filtros ativos
    pg.click("#btn-filtros-toggle"); pg.wait_for_timeout(200)
    pg.locator("#chips-extra button").first.click(); pg.wait_for_timeout(500)
    chk("filtro ligado aparece como etiqueta removível", pg.locator("#etiquetas-ativas .etiqueta-ativa").count() == 1 and "Novidades" in pg.inner_text("#etiquetas-ativas"), pg.inner_text("#etiquetas-ativas"))
    chk("a contagem de peças acompanha", "peças encontradas" in pg.inner_text("#contagem") or "peça encontrada" in pg.inner_text("#contagem"), pg.inner_text("#contagem"))
    pg.fill("#preco-min", "100"); pg.wait_for_timeout(600)
    chk("preço mínimo vira outra etiqueta", pg.locator("#etiquetas-ativas .etiqueta-ativa").count() == 2 and "a partir de R$ 100" in pg.inner_text("#etiquetas-ativas"), pg.inner_text("#etiquetas-ativas"))
    if pg.locator("#fx-fechar").is_visible(): pg.click("#fx-fechar"); pg.wait_for_timeout(300)   # v6.5: o menu é um painel de tela cheia no celular
    pg.locator("#etiquetas-ativas .etiqueta-ativa", has_text="Preço").click(); pg.wait_for_timeout(500)
    chk("tocar na etiqueta tira só aquele filtro", pg.input_value("#preco-min") == "" and pg.locator("#etiquetas-ativas .etiqueta-ativa").count() == 1)
    pg.locator("#etiquetas-ativas .btn-limpar").click(); pg.wait_for_timeout(500)
    chk("'Limpar tudo' zera tudo e some com a faixa", pg.locator("#etiquetas-ativas").is_hidden() and pg.locator("#chips-extra button[aria-pressed='true']").count() == 0)
    # rolagem preservada ao voltar da peça
    pg.evaluate("window.scrollTo(0,700)"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelectorAll('.card .abrir-peca')[6].click()"); pg.wait_for_timeout(600)
    chk("a peça abriu", pg.locator("#overlay.aberto").count() == 1)
    chk("botão do modal diz 'CONSULTAR NO WHATSAPP'", "CONSULTAR NO WHATSAPP" in pg.inner_text("#btn-quero"), pg.inner_text("#btn-quero"))
    pg.go_back(); pg.wait_for_timeout(600)
    chk("ao voltar, a lista continua onde estava (rolagem preservada)", abs(pg.evaluate("scrollY") - 700) < 5, pg.evaluate("scrollY"))
    # ajuda no fim da lista
    href = pg.get_attribute("#ajuda-zap", "href")
    chk("bloco de ajuda leva ao WhatsApp da loja com mensagem pronta (link completo)", href.startswith("https://wa.me/") and "text=" in href, href)
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
