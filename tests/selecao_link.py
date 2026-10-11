"""Compartilhar seleção (v3.4): o link TEM que levar as peças escolhidas (?sel=TK-0010,TK-0011,…) e abrir mostrando só elas.
Bug real reportado: 4 favoritos viravam só "https://tenkitermodas.com.br/" (o atendente não via quais peças eram)."""
import sys, os, re
from urllib.parse import unquote, urlparse, parse_qs
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
SITE = "https://tenkitermodas.com.br/"
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
STUB = "window.open=(u)=>{window.__opened=(window.__opened||[]).concat([String(u)]);return {closed:false}}"

def pag(ctx, erros):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.add_init_script(STUB)
    return pg

def visiveis(pg):
    return pg.evaluate("()=>[...document.querySelectorAll('.card:not(.esqueleto)')].map(c=>c.getAttribute('data-id'))")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx, versao="3.3")
    erros = []
    pg = pag(ctx, erros)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(1800)

    print("== Favoritos -> link com as peças ==")
    D = ".card:not(.esqueleto):has(.ac-sacola)"
    ids = []
    for i in (1, 2, 3, 4):
        c = pg.locator(D).nth(i); ids.append(c.get_attribute("data-id")); c.locator(".btn-favorito-card").click(); pg.wait_for_timeout(150)
    chk("4 favoritos marcados", pg.locator("#badge-favoritos").inner_text() == "4")
    cods = pg.evaluate("(ids)=>ids.map(id=>{const p=produtos.find(x=>String(x.ID)===id);return p.Codigo||p.ID})", ids)
    pg.evaluate("document.querySelector('.favoritos-chip').click()"); pg.wait_for_timeout(500)
    chk("filtro 'Favoritos' mostra 4 peças", len(visiveis(pg)) == 4, visiveis(pg))
    if not pg.locator("#btn-share-filtros").is_visible(): pg.click("#btn-filtros-toggle"); pg.wait_for_timeout(300)
    pg.click("#btn-share-filtros"); pg.wait_for_timeout(500)
    link = pg.input_value("#sel-link")
    q = parse_qs(urlparse(link).query)
    chk("o link é do SITE e leva ?sel= com os 4 códigos", link.startswith(SITE + "?sel=") and set(q.get("sel", [""])[0].split(",")) == set(cods), link)
    chk("sem caixinha 'lista fixa' (favoritos já é lista fixa)", pg.locator("#sel-fixa").count() == 0)
    zap = unquote(pg.get_attribute("#sel-zap", "href") or "")
    chk("mensagem do WhatsApp termina com o link completo e clicável", zap.startswith("https://wa.me/?text=") and zap.rstrip().endswith(link), zap[-120:])
    chk("mensagem lista as peças com preço", zap.count("• ") == 4 and "à vista" in zap, zap)
    chk("texto não cita atendente", "atendente" not in pg.inner_text("#selecao-conteudo").lower())
    pg.click("#btn-fechar-selecao"); pg.wait_for_timeout(250)

    print("== Quem abre o link vê só essas peças ==")
    ctx2 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx2, versao="3.3")
    pg2 = pag(ctx2, erros)
    pg2.goto(BASE + "index.html?" + urlparse(link).query); pg2.wait_for_timeout(1800)
    chk("abre com exatamente 4 peças", len(visiveis(pg2)) == 4, visiveis(pg2))
    chk("são as mesmas peças", set(visiveis(pg2)) == set(ids), visiveis(pg2))
    chk("faixa 'Peças separadas para você: 4 peças'", "Peças separadas para você: 4 peças" in pg2.inner_text("#aviso-selecao"), pg2.inner_text("#aviso-selecao"))
    chk("contagem diz 4 peças da seleção", "4 peças da seleção" in pg2.inner_text("#contagem"), pg2.inner_text("#contagem"))
    chk("o endereço continua com ?sel= (copiar da barra também funciona)", "sel=" in pg2.url)
    # reabrir a seleção recebida e compartilhar de novo mantém a lista
    if not pg2.locator("#btn-share-filtros").is_visible(): pg2.click("#btn-filtros-toggle"); pg2.wait_for_timeout(300)
    pg2.click("#btn-share-filtros"); pg2.wait_for_timeout(400)
    chk("recompartilhar a seleção recebida mantém as mesmas peças", set(parse_qs(urlparse(pg2.input_value('#sel-link')).query)['sel'][0].split(',')) == set(cods))
    pg2.click("#btn-fechar-selecao"); pg2.wait_for_timeout(250)
    pg2.click("#aviso-selecao-todas"); pg2.wait_for_timeout(500)
    chk("'Ver todas as peças' sai da seleção", pg2.locator("#aviso-selecao").is_hidden() and len(visiveis(pg2)) > 4 and "sel=" not in pg2.url, pg2.url)

    print("== Código em minúsculas, peça sem código (ID) e peça que não existe mais ==")
    ids_sem_cod = pg2.evaluate("()=>produtos.filter(x=>!x.Codigo).slice(0,1).map(x=>String(x.ID))")
    cod1 = cods[0] if cods[0].startswith("TK-") else ""
    tokens = [t for t in [cod1.lower(), (ids_sem_cod[0] if ids_sem_cod else ""), "TK-9999"] if t]
    pg2.goto(BASE + "index.html?sel=" + ",".join(tokens)); pg2.wait_for_timeout(1800)
    esperadas = len(tokens) - 1
    chk("casa por código sem diferenciar maiúscula e por ID quando não tem código", len(visiveis(pg2)) == esperadas, (tokens, visiveis(pg2)))
    chk("avisa que 1 peça não está mais disponível", "1 peça desta seleção não está mais disponível" in pg2.inner_text("#aviso-selecao"), pg2.inner_text("#aviso-selecao"))
    pg2.goto(BASE + "index.html?sel=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E,TK-0001"); pg2.wait_for_timeout(1500)
    chk("sel com HTML: a faixa mostra texto, nunca tag", pg2.locator("#aviso-selecao img").count() == 0 and not erros)

    print("== Busca dentro da seleção nunca some (regra: busca não pode ficar presa a filtro) ==")
    pg2.goto(BASE + "index.html?sel=" + ",".join(cods)); pg2.wait_for_timeout(1500)
    pg2.fill("#busca", "zzzzzzzz"); pg2.wait_for_timeout(700)
    chk("busca sem resultado na seleção não deixa tela vazia sem explicação", pg2.locator("#vazio").is_visible() or "toda a loja" in pg2.inner_text("#contagem"), pg2.inner_text("#contagem"))
    pg2.fill("#busca", ""); pg2.wait_for_timeout(500)
    pg2.click("#btn-filtros-toggle") if pg2.locator("#btn-limpar").is_hidden() else None
    pg2.wait_for_timeout(200)
    pg2.click("#btn-limpar"); pg2.wait_for_timeout(500)
    chk("'Limpar filtros' também sai da seleção", pg2.locator("#aviso-selecao").is_hidden() and len(visiveis(pg2)) > 4)

    print("== Filtro comum: escolhe entre 'filtros' e 'lista fixa' ==")
    pg2.goto(BASE + "index.html?q=vestido"); pg2.wait_for_timeout(1500)
    n = len(visiveis(pg2))
    if not pg2.locator("#btn-share-filtros").is_visible(): pg2.click("#btn-filtros-toggle"); pg2.wait_for_timeout(300)
    pg2.click("#btn-share-filtros"); pg2.wait_for_timeout(500)
    v = pg2.input_value("#sel-link")
    chk("por padrão o link leva os filtros (q=vestido), como sempre", v.startswith(SITE) and "q=vestido" in v and "sel=" not in v, v)
    tem_caixa = pg2.locator("#sel-fixa").count() == 1
    chk("há a caixinha 'Enviar só estas N peças (lista fixa)'", tem_caixa or n > 60 or n == 0, n)
    if tem_caixa:
        pg2.check("#sel-fixa"); pg2.wait_for_timeout(300)
        v2 = pg2.input_value("#sel-link")
        chk("marcando a caixinha o link vira lista fixa (?sel=)", v2.startswith(SITE + "?sel=") and "q=" not in v2 and len(v2.split("sel=")[1].split(",")) == min(n, 60), v2)
        pg2.uncheck("#sel-fixa"); pg2.wait_for_timeout(300)
        chk("desmarcando volta aos filtros", "q=vestido" in pg2.input_value("#sel-link"))
    pg2.click("#btn-fechar-selecao"); pg2.wait_for_timeout(250)

    print("== Sem filtro nenhum: link da loja, sem caixinha ==")
    pg2.goto(BASE + "index.html"); pg2.wait_for_timeout(1500)
    if not pg2.locator("#btn-share-filtros").is_visible(): pg2.click("#btn-filtros-toggle"); pg2.wait_for_timeout(300)
    pg2.click("#btn-share-filtros"); pg2.wait_for_timeout(400)
    chk("sem filtro o link é o da loja", pg2.input_value("#sel-link") == SITE and pg2.locator("#sel-fixa").count() == 0, pg2.input_value("#sel-link"))

    chk("nenhum erro de JavaScript", not erros, erros[:3])
    b.close()

print("\nRESULTADO: %d ok, %d falhas" % (len(OK), len(BAD)))
print("FALHAS=%d %s" % (len(BAD), BAD))
sys.exit(1 if BAD else 0)
