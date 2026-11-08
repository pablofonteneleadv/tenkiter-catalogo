"""Prova do manual: o estagiário sempre consegue finalizar.
- pergunta impossível de responder (sem alternativas) não trava o botão Corrigir;
- se o servidor recusa ou some, a tela diz o MOTIVO em português, guarda a nota no aparelho e oferece 'Enviar de novo';
- a nota guardada é reenviada sozinha ao entrar de novo.
Apps Script SIMULADO.   python3 tests/prova_resiliente.py"""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)[:300]) if (e and not c) else ""))
ESTAGIARIO = ["portal", "manual_1", "manual_2", "avaliacoes", "catalogo_admin", "catalogo_cadastrar", "cliente"]

def abrir(b, st_extra):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    log = []; st = install(ctx, perms=ESTAGIARIO, log=log, versao="3.7", protegido=True); st.update(st_extra)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    return ctx, pg, log, st, errs

def entrar_na_prova(pg):
    pg.goto(BASE + "treinamentos.html"); pg.wait_for_timeout(1500)
    pg.fill("#login-whats", "88999999999"); pg.fill("#login-pass", "1234"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    pg.locator(".card[data-manual]").first.click(); pg.wait_for_timeout(800)
    for i in range(pg.locator(".chapter input[type=checkbox]").count()): pg.locator(".chapter input[type=checkbox]").nth(i).check(force=True)
    pg.wait_for_timeout(1000); pg.click("#btn-ir-avaliacao"); pg.wait_for_timeout(900)
    pg.locator("#gate-ok").check(force=True); pg.click("#gate-start"); pg.wait_for_timeout(700)

def responder(pg):
    for i in range(pg.locator(".quiz-q").count()):
        if pg.locator('input[name="q%d"]' % i).count(): pg.locator('input[name="q%d"]' % i).first.check(force=True)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    print("== pergunta sem alternativas não trava a prova ==")
    ctx, pg, log, st, errs = abrir(b, {"provas_extra": {"1": [{"q": "Pergunta quebrada no Docs", "options": [], "correct": 0, "explain": "x"}, {"q": "Só uma alternativa", "options": ["única"], "correct": 0, "explain": "x"}]}})
    entrar_na_prova(pg)
    chk("só aparecem as perguntas que podem ser respondidas", pg.locator(".quiz-q").count() == 1, pg.locator(".quiz-q").count())
    responder(pg); pg.click("#quiz-corrigir"); pg.wait_for_timeout(900)
    chk("finaliza e envia o resultado", any(x.get("action") == "resultado" for x in log))
    chk("sem erro de JavaScript", not errs, errs)
    ctx.close()

    print("== servidor recusa: motivo claro, nota guardada, Enviar de novo ==")
    ctx, pg, log, st, errs = abrir(b, {"resultado_erro": {"ok": False, "erro": "Sessão inválida. Saia e entre de novo para registrar sua nota.", "sessaoInvalida": True}})
    entrar_na_prova(pg); responder(pg); pg.click("#quiz-corrigir"); pg.wait_for_timeout(1200)
    txt = pg.inner_text("#quiz-result")
    chk("a nota aparece mesmo assim", "/" in pg.inner_text("#quiz-result .score"))
    chk("diz o motivo (sessão) e que a nota está guardada", "sessão" in txt.lower() and "guardada" in txt.lower(), txt[:300])
    chk("tem o botão 'Enviar de novo'", pg.locator("#reenviar-resultado").count() == 1)
    chk("a nota ficou guardada no aparelho", pg.evaluate("Object.keys(localStorage).some(k => k.startsWith('tm_resultado_pend_'))"))
    chk("nota pendente sem credenciais", pg.evaluate("""() => Object.keys(localStorage).filter(k => k.startsWith('tm_resultado_pend_')).every(k => (JSON.parse(localStorage.getItem(k) || '[]')).every(x => !('senha' in x) && !('sessao' in x) && !('token' in x)))"""))
    st["resultado_erro"] = None
    pg.click("#reenviar-resultado"); pg.wait_for_timeout(900)
    chk("Enviar de novo funciona quando o servidor volta", pg.locator("#reenviar-resultado").count() == 0 and "avaliação 1 de 3" in pg.inner_text("#quiz-result"), pg.inner_text("#quiz-result")[:300])
    chk("nota guardada some depois de confirmada", not pg.evaluate("Object.keys(localStorage).some(k => k.startsWith('tm_resultado_pend_') && JSON.parse(localStorage.getItem(k) || '[]').length)"))
    chk("sem erro de JavaScript", not errs, errs)
    ctx.close()

    print("== sem internet: reenvio automático ao entrar de novo ==")
    ctx, pg, log, st, errs = abrir(b, {"resultado_erro": {"ok": False, "erro": "sem conexão"}})
    entrar_na_prova(pg); responder(pg); pg.click("#quiz-corrigir"); pg.wait_for_timeout(1200)
    chk("sem conexão: mensagem amigável", "conexão" in pg.inner_text("#quiz-result").lower() and "{" not in pg.inner_text("#quiz-result"))
    n_antes = len([x for x in log if x.get("action") == "resultado"])
    st["resultado_erro"] = None
    pg.goto(BASE + "treinamentos.html"); pg.wait_for_timeout(2500)
    if pg.locator("#login-whats").count():
        pg.fill("#login-whats", "88999999999"); pg.fill("#login-pass", "1234"); pg.keyboard.press("Enter"); pg.wait_for_timeout(2500)
    n_depois = len([x for x in log if x.get("action") == "resultado"])
    chk("ao entrar de novo a nota guardada é reenviada sozinha", n_depois > n_antes, (n_antes, n_depois))
    chk("sem erro de JavaScript", not errs, errs)
    ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
