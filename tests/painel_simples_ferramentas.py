"""Painel simplificado (perfil Equipe catálogo 1 + extras): mostra só a ferramenta que a pessoa recebeu (Fotos com IA, Esteira, Mensagens) e nada de gestão.
Serviços SIMULADOS (tests/mock.py), Chromium.   TK_BASE=http://localhost:8765/ python3 tests/painel_simples_ferramentas.py"""
import os, sys
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import install, SESSION
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK, BAD = [], []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)[:300]) if (e and not c) else ""))
VIS = "id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; }"
def abrir(b, w, perms):
    ctx = b.new_context(viewport={"width": w, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); install(ctx, perms=perms, ia=False, versao="4.3")
    pg = ctx.new_page(); pg.on("dialog", lambda d: d.accept()); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(3000)
    return ctx, pg, erros
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for w in (390, 1440):
        # Equipe catálogo 1 + Esteira + IA (modo antigo: IA vem de "cadastrar produtos")
        ctx, pg, erros = abrir(b, w, ["catalogo_admin", "catalogo_cadastrar", "painel_simples", "cliente", "esteira"])
        simples = pg.evaluate("document.body.classList.contains('painel-simples')")
        chk("%d: continua no painel simplificado (sem pedidos/números/preços)" % w, simples)
        chk("%d: Ferramentas aparece para quem recebeu IA/Esteira" % w, pg.evaluate(VIS, "details-ferramentas"))
        pg.evaluate("document.getElementById('details-ferramentas').open = true"); pg.wait_for_timeout(300)
        chk("%d: tile Esteira aparece" % w, pg.evaluate(VIS, "btn-abrir-esteira"))
        chk("%d: o tile da Esteira leva a esteira.html" % w, pg.evaluate("(document.getElementById('btn-abrir-esteira')||{}).getAttribute('href')") == "esteira.html")
        chk("%d: tile Fotos com IA aparece" % w, pg.evaluate(VIS, "btn-abrir-fotoia"))
        for oculto in ("btn-abrir-conexoes", "btn-abrir-metricas", "btn-abrir-push", "atalho-pedidos", "atalho-numeros"):
            chk("%d: %s continua escondido" % (w, oculto), not pg.evaluate(VIS, oculto))
        chk("%d: sem rolagem lateral" % w, pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        chk("%d: sem erro de JavaScript" % w, not erros, erros)
        ctx.close()
        # Só o painel simplificado, sem Esteira: o tile da Esteira não aparece
        ctx, pg, erros = abrir(b, w, ["catalogo_admin", "painel_simples", "cliente"])
        chk("%d: sem o acesso Esteira, o tile da Esteira não aparece" % w, not pg.evaluate(VIS, "btn-abrir-esteira"))
        ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD[:5]))
sys.exit(1 if BAD else 0)
