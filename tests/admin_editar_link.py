"""v7.48.0: link "Editar no cadastro" da Esteira → admin.html?editar=<ID> abre a edição normal do produto na Gestão.
Espera o login (sem prazo enquanto a tela de entrar está aberta), avisa em português quando o produto não existe ou o acesso não permite editar.
O Apps Script e a internet são SIMULADOS (tests/mock.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
ALVO = prods()[2]  # "Conjunto ..." com ID conhecido
def abrir(b, perms=PERMS_ALL, sessao=True, ident=ALVO["ID"], larg=390, alt=844):
    ctx = b.new_context(viewport={"width": larg, "height": alt}, is_mobile=larg < 600, has_touch=larg < 600, service_workers="block")
    if sessao: ctx.add_init_script(SESSION)
    install(ctx, perms=perms, versao="4.20")
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html?editar=" + ident)
    return ctx, pg, erros
def aviso(pg):
    return pg.evaluate("(()=>{const a=document.querySelector('#tk-avisos .tk-aviso');return a?a.textContent:''})()")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    print("== Deep link ?editar= (logada, com permissão) ==")
    for larg, alt in ((390, 844), (1440, 900)):
        ctx, pg, erros = abrir(b, larg=larg, alt=alt)
        pg.wait_for_function("(document.getElementById('titulo-form')||{}).textContent.indexOf('Editando')===0", timeout=15000)
        chk(f"{larg}: abre a edição do produto certo", ALVO["Nome"] in pg.inner_text("#titulo-form") and pg.input_value("#produto-id") == ALVO["ID"], pg.inner_text("#titulo-form"))
        chk(f"{larg}: o formulário fica aberto e o link sai da barra de endereço", pg.evaluate("document.getElementById('card-form').open") and "editar=" not in pg.url)
        pg.wait_for_timeout(700)
        os.makedirs(os.path.join(AQUI, "saida"), exist_ok=True)
        pg.screenshot(path=os.path.join(AQUI, "saida", f"admin_editar_link_{larg}.png"))
        chk(f"{larg}: sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        chk(f"{larg}: sem erro de JavaScript", not erros, erros)
        ctx.close()
    print("== Produto que não existe ==")
    ctx, pg, erros = abrir(b, ident="999999")
    pg.wait_for_function("!!document.querySelector('#tk-avisos .tk-aviso')", timeout=15000)
    chk("aviso legível quando o produto não existe", "Não encontrei esse produto" in aviso(pg) and "{" not in aviso(pg), aviso(pg))
    chk("não abre edição de outro produto", "Editando" not in pg.inner_text("#titulo-form"))
    ctx.close()
    print("== Acesso sem permissão de cadastrar ==")
    ctx, pg, erros = abrir(b, perms=["catalogo_admin"])
    pg.wait_for_function("!!document.querySelector('#tk-avisos .tk-aviso')", timeout=15000)
    chk("aviso legível quando o acesso não permite editar", "não permite editar" in aviso(pg), aviso(pg))
    chk("sem permissão a edição não abre", "Editando" not in pg.inner_text("#titulo-form"))
    ctx.close()
    print("== Sem login: espera a pessoa entrar ==")
    ctx, pg, erros = abrir(b, sessao=False)
    pg.wait_for_selector("#login-overlay.visivel", timeout=10000)
    pg.wait_for_timeout(1500)
    chk("com a tela de entrar aberta, pede login e não desiste", "Entre na sua conta" in aviso(pg) and "editar=" in pg.url, aviso(pg))
    pg.fill("#lo-whats", "88999999999"); pg.fill("#lo-senha", "senha"); pg.click("#lo-entrar")
    pg.wait_for_function("(document.getElementById('titulo-form')||{}).textContent.indexOf('Editando')===0", timeout=15000)
    chk("depois de entrar abre a edição do produto", ALVO["Nome"] in pg.inner_text("#titulo-form"))
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close()
    print("== Link quebrado ==")
    ctx, pg, erros = abrir(b, ident="%3Cscript%3E")
    pg.wait_for_function("!!document.querySelector('#tk-avisos .tk-aviso')", timeout=15000)
    chk("link com ID inválido: aviso legível, sem abrir nada", "link de edição está incompleto" in aviso(pg) and "Editando" not in pg.inner_text("#titulo-form"), aviso(pg))
    ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
