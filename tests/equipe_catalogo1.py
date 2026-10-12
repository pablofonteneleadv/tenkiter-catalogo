"""Perfil 'Equipe catálogo 1' (painel simplificado): vê cadastro, lista e Postagens; não vê pedidos, números, ferramentas do gestor nem ações em lote que afetam a loja."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def abre(b, perms):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); st = install(ctx, perms=perms, versao="4.3"); st["midia"]["modo"] = "ok"
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2800); return ctx, pg, erros
def vis(pg, sel): return pg.evaluate("(s)=>{const e=document.querySelector(s);return !!e&&getComputedStyle(e).display!=='none'&&!e.closest('[hidden]')}", sel)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    print("== Equipe catálogo 1 ==")
    ctx, pg, erros = abre(b, ["catalogo_admin", "catalogo_cadastrar", "painel_simples", "cliente"])
    chk("o painel entra em modo simplificado", pg.evaluate("document.body.classList.contains('painel-simples')"))
    chk("vê o cadastro de peça", vis(pg, "#card-form"))
    chk("vê a lista (Estoque) e a busca", vis(pg, "#busca-admin") and vis(pg, "#lista-produtos"))
    chk("vê Postagens no 'O que fazer agora'", vis(pg, "#atalho-postagens"))
    chk("NÃO vê Pedidos nem Números", not vis(pg, "#atalho-pedidos") and not vis(pg, "#atalho-numeros") and not vis(pg, "#card-pedidos"))
    chk("NÃO vê 'Ferramentas do gestor' (números, avisos, auditoria, configurações, conexões)", not vis(pg, "#details-ferramentas") and not vis(pg, "[data-atalho=ferramentas]"))
    chk("NÃO vê o importador do Instagram", not vis(pg, "#ig-faixa"))
    pg.locator(".produto-chk").first.check(force=True); pg.wait_for_timeout(300)
    chk("na seleção em lote só sobra 'Enviar para Postagens'", vis(pg, "#btn-bulk-postar") and not vis(pg, "#btn-bulk-preco") and not vis(pg, "#btn-bulk-arquivar") and not vis(pg, "#btn-bulk-novidade") and not vis(pg, "#btn-bulk-reativar"))
    chk("não arquiva nem exclui peça da lista", not vis(pg, ".btn-arquivar") and not vis(pg, ".btn-excluir"))
    pg.click("#atalho-postagens"); pg.wait_for_timeout(1000)
    chk("o atalho Postagens abre a janela de postagens", pg.locator("#overlay-postagens.aberto").count() == 1)
    chk("e lá dentro estão Com peça, Ela usa TM e Livre", all(pg.locator("[data-modo=%s]" % m).count() == 1 for m in ("peca", "cliente", "livre")))
    chk("sem erro de JavaScript", not erros, erros[:2]); ctx.close()
    print("== Quem soma outro perfil maior continua vendo tudo ==")
    ctx, pg, erros = abre(b, ["catalogo_admin", "catalogo_cadastrar", "painel_simples", "catalogo_excluir", "catalogo_precos", "cliente"])
    chk("com 'excluir' e 'preços em lote' NÃO fica simplificado", not pg.evaluate("document.body.classList.contains('painel-simples')") and vis(pg, "#btn-bulk-preco") is not None)
    ctx.close()
    print("== Equipe + RH (sem auditoria nem gerir_acessos) ==")
    ctx, pg, erros = abre(b, ["catalogo_admin", "catalogo_cadastrar", "dados_pessoais", "cliente"])
    pg.evaluate("document.getElementById('details-ferramentas').open = true")
    chk("NÃO vê estatísticas, exportar, URL do sistema, chave da IA nem log de depuração", not vis(pg, "#stats-panel") and not vis(pg, "#btn-exportar-csv") and not vis(pg, "#details-config") and not vis(pg, "#details-log-debug"))
    chk("continua vendo Postagens", vis(pg, "#btn-abrir-postagens"))
    ctx.close()
    ctx, pg, erros = abre(b, ["catalogo_admin", "catalogo_cadastrar", "catalogo_excluir", "catalogo_precos", "catalogo_auditoria", "catalogo_push", "gerir_acessos", "cliente"])
    chk("Admin total vê as Ferramentas do gestor", vis(pg, "#details-ferramentas"))
    pg.evaluate("document.getElementById('details-ferramentas').open = true")
    chk("Admin total vê estatísticas, exportar e configurações", vis(pg, "#stats-panel") and vis(pg, "#btn-exportar-csv") and vis(pg, "#details-config"))
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD); sys.exit(1 if BAD else 0)
