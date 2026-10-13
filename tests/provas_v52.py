"""v5.2: prova só corrige com tudo respondido, 'n de 3' vem do servidor (nunca 4 de 3), reenvio não conta duas vezes,
botão ✕ e 'Zerar pessoa' só para Admin total, e botão 'Editar produto' no catálogo só para equipe."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    log = []; st = install(ctx, perms=PERMS_ALL + ["avaliacoes", "manual_1", "manual_2", "manual_3"], log=log, versao="3.7", protegido=True)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    print("== Prova: tudo respondido, limite no servidor ==")
    pg.goto(BASE + "treinamentos.html"); pg.wait_for_timeout(1500)
    pg.fill("#login-whats", "88999999999"); pg.fill("#login-pass", "1234"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    pg.locator(".card[data-manual]").first.click(); pg.wait_for_timeout(800)
    for i in range(pg.locator(".chapter input[type=checkbox]").count()): pg.locator(".chapter input[type=checkbox]").nth(i).check(force=True)
    pg.wait_for_timeout(1000); pg.click("#btn-ir-avaliacao"); pg.wait_for_timeout(900)
    chk("a tela de antes mostra 0 de 3 (vindo do servidor)", "0 de 3" in pg.inner_text("#app"))
    pg.locator("#gate-ok").check(force=True); pg.click("#gate-start"); pg.wait_for_timeout(700)
    chk("a prova abre com o formulário", pg.locator("#quiz-corrigir").count() == 1)
    pg.click("#quiz-corrigir"); pg.wait_for_timeout(500)
    chk("sem responder nada: avisa, marca a pergunta e NÃO envia nada ao servidor", pg.locator(".quiz-faltou").count() >= 1 and not any(x.get("action") == "resultado" for x in log))
    chk("o aviso é uma frase legível", pg.locator("#quiz-aviso:visible").count() == 1 and len(pg.inner_text("#quiz-aviso")) > 10)
    def responder_e_corrigir():
        n = pg.locator(".quiz-q").count()
        for i in range(n): pg.locator('input[name="q%d"]' % i).first.check(force=True)
        pg.click("#quiz-corrigir"); pg.wait_for_timeout(900)
    responder_e_corrigir()
    res = [x for x in log if x.get("action") == "resultado"]
    chk("respondida: envia 1 resultado com manualId e tentativaId", len(res) == 1 and res[0].get("manualId") and res[0].get("tentativaId"), res)
    chk("a tela mostra 'avaliação 1 de 3'", "1 de 3" in pg.inner_text("#app"), pg.inner_text("#app")[-200:])
    txt = pg.inner_text("#quiz-result")
    chk("tela final reforça que a nota não é o mais importante e manda reler o manual", "O mais importante não é a nota" in txt and "ler o manual várias vezes" in txt and pg.locator("#qr-reler").count() == 1)
    chk("o botão Corrigir some depois de corrigir", not pg.locator("#quiz-corrigir").is_visible())
    pg.click("#qr-reler"); pg.wait_for_timeout(600)
    chk("'Reler o manual' volta ao manual (sem a prova aberta)", pg.locator(".chapter").count() >= 1 and pg.locator("#quiz-corrigir").count() == 0)
    st["aval_feitas"] = {"1": 3}
    chk("sem erros de JavaScript", not erros, erros)
    ctx.close()
    print("== Catálogo: botão Editar produto só para a equipe ==")
    c2 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    c2.add_init_script(SESSION); install(c2, perms=PERMS_ALL, versao="4.1"); q = c2.new_page(); q.on("dialog", lambda d: d.accept())
    q.goto(BASE + "index.html"); q.wait_for_timeout(2500)
    q.locator(".card").first.click(); q.wait_for_timeout(900)
    chk("equipe vê ✎ Editar produto no modal", q.locator("#btn-editar-peca").count() == 1 and "admin.html?editar=" in (q.get_attribute("#btn-editar-peca", "href") or ""))
    c2.close()
    c3 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    install(c3, perms=[], versao="4.1"); r = c3.new_page()
    r.goto(BASE + "index.html"); r.wait_for_timeout(2500); r.locator(".card").first.click(); r.wait_for_timeout(900)
    chk("visitante NÃO vê o botão Editar", r.locator("#btn-editar-peca").count() == 0)
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
