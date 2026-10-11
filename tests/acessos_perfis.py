"""Painel de Acessos do RH (treinamentos.html): vários perfis por pessoa, com caixinhas. O Apps Script é simulado (mock.py)."""
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
    ctx.add_init_script(SESSION); log = []; st = install(ctx, perms=PERMS_ALL + ["avaliacoes", "manual_1"], log=log, versao="3.7")
    erros = []; msgs = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: (msgs.append(d.message), d.accept()))
    pg.goto(BASE + "treinamentos.html?painel=rh"); pg.wait_for_timeout(1800)
    pg.click('.admin-tab[data-tab="acessos"]'); pg.wait_for_selector(".ac-card"); pg.wait_for_timeout(500)
    # Cris aparece só se "Cliente" estiver marcado no filtro; busca ignora o filtro (regra 3)
    pg.click("#ac-todos"); pg.wait_for_timeout(500)
    card = pg.locator('.ac-card[data-whats="88988887777"]')
    chk("achou a Cris (filtro Todos)", card.count() == 1, pg.inner_text("#app")[:200])
    chk("cada pessoa tem caixinhas de perfil (não mais lista suspensa)", card.locator("input[data-perfil-set]").count() >= 5 and pg.locator("select.ac-perfil").count() == 0)
    chk("Cliente vem marcado e travado (todos são clientes)", card.locator('input[data-perfil-set="Cliente"]').is_checked() and card.locator('input[data-perfil-set="Cliente"]').is_disabled())
    card.locator('input[data-perfil-set="Aluno"]').check(); pg.wait_for_timeout(900)
    c = st["perfil_chamadas"][-1]
    chk("marcar Aluno manda a lista de perfis (só o novo, o Cliente é implícito)", c["perfis"] == ["Aluno"] and c["perfil"] == "Aluno" and c["whatsappAlvo"] == "88988887777", c)
    card = pg.locator('.ac-card[data-whats="88988887777"]')
    card.locator('input[data-perfil-set="Equipe do site"]').check(); pg.wait_for_timeout(900)
    c = st["perfil_chamadas"][-1]
    chk("marcar Equipe do site junto manda os dois perfis", c["perfis"] == ["Aluno", "Equipe do site"] and "perfil" not in c, c)
    chk("o servidor guardou os dois, com Cliente junto", st["acpessoas"][1]["perfil"] == "Cliente, Aluno, Equipe do site", st["acpessoas"][1])
    card = pg.locator('.ac-card[data-whats="88988887777"]')
    chk("a tela mostra Aluno e Equipe do site marcados", card.locator('input[data-perfil-set="Aluno"]').is_checked() and card.locator('input[data-perfil-set="Equipe do site"]').is_checked())
    card.locator('input[data-perfil-set="Aluno"]').uncheck(); pg.wait_for_timeout(900)
    c = st["perfil_chamadas"][-1]
    chk("desmarcar o Aluno deixa só a Equipe do site", c["perfis"] == ["Equipe do site"] and st["acpessoas"][1]["perfil"] == "Cliente, Equipe do site", (c, st["acpessoas"][1]))
    card = pg.locator('.ac-card[data-whats="88988887777"]')
    card.locator('input[data-perfil-set="Equipe do site"]').uncheck(); pg.wait_for_timeout(900)
    chk("sem nenhum outro, volta a ser só Cliente", st["acpessoas"][1]["perfil"] == "Cliente" and st["perfil_chamadas"][-1]["perfis"] == ["Cliente"], st["acpessoas"][1])
    # a própria conta: tentar tirar o Admin total mostra a frase do servidor
    eu = pg.locator('.ac-card[data-whats="88999999999"]')
    eu.locator('input[data-perfil-set="Admin total"]').uncheck(); pg.wait_for_timeout(900)
    chk("tirar o PRÓPRIO Admin total é recusado (e a caixinha volta marcada)", st["acpessoas"][0]["perfil"] == "Admin total" and pg.locator('.ac-card[data-whats="88999999999"] input[data-perfil-set="Admin total"]').is_checked())
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
