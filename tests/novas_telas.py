"""Acessibilidade (axe) e teclado das telas NOVAS da v3.3/3.1: favoritos, sacola com formulário, pedido enviado, acompanhar pedido,
compartilhar seleção, privacidade, 404 e, no painel, pedidos / números / importar / integrações / avisos.
Também confere que as janelas novas prendem o Tab, fecham com Esc e devolvem o foco."""
import sys, json, os
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
AXE = open(os.path.join(AQUI, 'axe.min.js')).read()
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});return r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,ex:v.nodes.slice(0,3).map(n=>n.target.join(' ')+' :: '+(n.failureSummary||'').split('\\n')[1])}))}")
    chk("axe — " + label, not r, "; ".join("%s×%d %s" % (v['id'], v['n'], v['ex'][:2]) for v in r))
STUB = "window.open=(u)=>{window.__opened=(window.__opened||[]).concat([String(u)]);return {closed:false}}"

def preso(pg, sel, n=30):
    for _ in range(n):
        pg.keyboard.press("Tab")
        if not pg.evaluate("(s)=>document.querySelector(s).contains(document.activeElement)", sel): return False
    for _ in range(n):
        pg.keyboard.press("Shift+Tab")
        if not pg.evaluate("(s)=>document.querySelector(s).contains(document.activeElement)", sel): return False
    return True

def janela(pg, nome, abrir, sel, estado="aberto"):
    """abre, confere foco dentro / Tab preso / axe / Esc fecha / foco volta"""
    abrir(); pg.wait_for_timeout(600)
    chk(nome + ": abre", pg.locator(sel + "." + estado).count() == 1)
    chk(nome + ": foco vai para dentro", pg.evaluate("(s)=>document.querySelector(s).contains(document.activeElement)", sel), pg.evaluate("document.activeElement.tagName+'#'+document.activeElement.id"))
    chk(nome + ": Tab fica preso na janela", preso(pg, sel))
    chk(nome + ": tem nome acessível (role=dialog + aria-label/labelledby)", pg.evaluate("(s)=>{const e=document.querySelector(s);const d=e.querySelector('[role=dialog]')||e;return d.getAttribute('role')==='dialog'&&!!(d.getAttribute('aria-label')||d.getAttribute('aria-labelledby'))}", sel))
    axe(pg, nome)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    chk(nome + ": Esc fecha", pg.locator(sel + "." + estado).count() == 0)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    print("== Catálogo ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(ctx); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); pg.add_init_script(STUB)
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(1800)
    D = ".card:not(.esqueleto):has(.ac-sacola)"
    axe(pg, "catálogo (com benefícios, cartões, rodapé e botão flutuante)")
    for i in (0, 1):
        pg.locator(D).nth(i).locator(".btn-favorito-card").click()
    pg.locator(D).nth(0).locator(".ac-sacola").click(); pg.wait_for_timeout(200)
    janela(pg, "favoritos", lambda: pg.click("#btn-favoritos-header"), "#overlay-favoritos")
    chk("favoritos: foco volta ao botão do cabeçalho", pg.evaluate("document.activeElement.id") == "btn-favoritos-header", pg.evaluate("document.activeElement.id"))
    janela(pg, "sacola com formulário", lambda: pg.click("#btn-sacola-header"), "#overlay-sacola")
    # pedido enviado (backend simulado) e acompanhamento
    pg.click("#btn-sacola-header"); pg.wait_for_timeout(500)
    pg.fill("#ped-nome", "Maria Souza"); pg.fill("#ped-whats", "88 99876-5432"); pg.click("#btn-enviar-sacola"); pg.wait_for_timeout(1200)
    chk("pedido enviado: tela aparece", pg.locator("#pedido-ok").count() == 1)
    axe(pg, "pedido enviado")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    janela(pg, "acompanhar pedido", lambda: pg.click("#rod-rastrear"), "#overlay-rastreio")
    pg.click("#rod-rastrear"); pg.wait_for_timeout(500)
    pg.fill("#rast-codigo", "PED-0001"); pg.fill("#rast-final", "5432"); pg.click("#btn-consultar"); pg.wait_for_timeout(900)
    axe(pg, "acompanhar pedido com resultado (etapas)")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    def abrir_sel():
        if not pg.locator("#btn-share-filtros").is_visible(): pg.click("#btn-filtros-toggle"); pg.wait_for_timeout(300)
        pg.click("#btn-share-filtros")
    janela(pg, "compartilhar seleção", abrir_sel, "#overlay-selecao")
    chk("nenhum erro de JavaScript (catálogo)", not erros, erros)
    ctx.close()

    print("== Páginas simples ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, service_workers="block"); install(ctx); pg = ctx.new_page()
    pg.goto(BASE + "privacidade.html"); pg.wait_for_timeout(700); axe(pg, "privacidade.html")
    chk("privacidade: sem CNPJ, com o endereço da loja", "cnpj" not in pg.content().lower() and "Moreira da Rocha" in pg.inner_text("body"))
    pg.goto(BASE + "404.html"); pg.wait_for_timeout(700); axe(pg, "404.html")
    ctx.close()

    print("== Painel do lojista ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block"); ctx.add_init_script(SESSION)
    st = install(ctx, sem_codigo=2)
    st["pedidos"].append({"codigo": "PED-0001", "data": "10/10/2026 11:00", "atualizado": "10/10/2026 11:00", "status": "novo", "entrega": "entrega", "total": 90.0,
        "itens": [{"id": "1", "nome": "Blusa Floral", "codigo": "TK-0003", "preco": 50.0}], "nome": "Maria Souza", "whatsapp": "88998765432",
        "endereco": "Rua das Flores 100", "obs": "", "nota": "", "origem": "site", "historico": [{"quando": "10/10/2026 11:00", "status": "novo", "por": "cliente"}]})
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept(""))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    axe(pg, "painel: lista com aviso de pedido novo e de códigos faltantes")
    pg.click("#card-pedidos > summary"); pg.wait_for_timeout(900)
    axe(pg, "painel: pedidos abertos")
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(300)
    janela(pg, "painel: números reais", lambda: pg.click("#btn-abrir-metricas"), "#overlay-gestao")
    chk("painel: foco volta ao botão de números", pg.evaluate("document.activeElement.id") == "btn-abrir-metricas", pg.evaluate("document.activeElement.id"))
    janela(pg, "painel: importar planilha", lambda: pg.click("#btn-importar-csv"), "#overlay-gestao")
    pg.click("#btn-importar-csv"); pg.wait_for_timeout(400)
    open(os.path.join(AQUI, "saida", "import_a11y.csv"), "w", encoding="utf-8").write("codigo;nome;preco;foto_url\r\nTK-0007;;99,90;\r\nTK-0003;;abc;\r\n;Nova;59,90;https://res.cloudinary.com/z/image/upload/v1/n.jpg\r\n")
    pg.set_input_files("#imp-arquivo", os.path.join(AQUI, "saida", "import_a11y.csv")); pg.wait_for_timeout(1200)
    axe(pg, "painel: importar com prévia")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    janela(pg, "painel: integrações", lambda: pg.click("#btn-abrir-integracoes"), "#overlay-gestao")
    pg.click("#btn-abrir-push"); pg.wait_for_timeout(500)
    pg.click('#push-modelos [data-pm="0"]'); pg.click("#btn-push-historico"); pg.wait_for_timeout(800)
    axe(pg, "painel: histórico de avisos")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    axe(pg, "painel: avisos com modelos e segmento")
    janela(pg, "painel: arte do Story (com bloco de vídeo)", lambda: pg.locator(".btn-arte").first.click(), "#overlay-compartilhar")
    chk("nenhum erro de JavaScript (painel)", not erros, erros)
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD)
sys.exit(1 if BAD else 0)
