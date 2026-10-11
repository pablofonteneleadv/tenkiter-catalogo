"""Cofre das Conexões (v3.6): copiar chaves só com DUPLA verificação (login de Admin total + senha digitada de novo). A chave nunca aparece na tela nem no aparelho (só na área de transferência)."""
import sys, os, re
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
AXE = open(os.path.join(AQUI, 'axe.min.js')).read()
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
DIAL = []
def novo(b, perms=PERMS_ALL, versao="3.6"):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); st = install(ctx, perms=perms, versao=versao)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE.split("/", 3)[0] + "//" + BASE.split("/", 3)[2])
    for k in ("render", "cloudflare", "onesignal"):
        st["conex"][k].update({"temChave": True, "fim": "1234"})
    st["conex"]["onesignal"]["chaveEnvio"] = True
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: (DIAL.append((d.type, d.message)), d.accept()))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-conexoes"); pg.wait_for_timeout(1500)
    return ctx, pg, st, erros
SEGREDOS = re.compile(r"rnd_FALSO|cfut_FALSO|os_v2_(org|app)_FALSO")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx, pg, st, erros = novo(b)
    print("== Cofre trancado ==")
    chk("cofre aparece trancado, pedindo a senha", pg.locator("#cx-cofre-senha").is_visible() and pg.get_attribute("#cx-cofre-senha", "type") == "password" and pg.locator("[data-cx=cofre-copiar]").count() == 0)
    pg.click("[data-cx=cofre-abrir]"); pg.wait_for_timeout(300)
    chk("sem digitar a senha: frase de erro e nada enviado", "Digite a senha" in pg.inner_text("#cx-msg-cofre") and not st.get("cofre"))
    pg.fill("#cx-cofre-senha", "senha-errada"); pg.click("[data-cx=cofre-abrir]"); pg.wait_for_timeout(500)
    chk("senha errada: recusa, campo limpo, continua trancado", "Senha incorreta" in pg.inner_text("#cx-msg-cofre") and pg.input_value("#cx-cofre-senha") == "" and pg.locator("[data-cx=cofre-copiar]").count() == 0)
    print("== Abrir com a senha certa ==")
    pg.fill("#cx-cofre-senha", "senha-certa"); pg.click("[data-cx=cofre-abrir]"); pg.wait_for_selector("[data-cx=cofre-copiar]")
    chk("abriu: 4 chaves com botão Copiar e contagem regressiva", pg.locator("[data-cx=cofre-copiar]").count() == 4 and "tranca em" in pg.inner_text("#cx-cofre-tempo") or "Cofre aberto" in pg.inner_text("#cx-cofre-tempo"))
    html = pg.content(); ls = pg.evaluate("JSON.stringify(localStorage)+JSON.stringify(sessionStorage)")
    chk("senha digitada e código de abertura fora do HTML e do armazenamento", "senha-certa" not in html and "senha-certa" not in ls and "abc123COFRE" not in html and "abc123COFRE" not in ls)
    pg.evaluate(AXE)
    ax = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#cx-cofre'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.map(v=>v.id+' '+v.nodes[0].target.join(' '))}")
    chk("axe — cofre aberto", not ax, ax)
    print("== Copiar ==")
    pg.click("[data-cx=cofre-copiar][data-nome=render]"); pg.wait_for_timeout(700)
    chk("Render: copiada para a área de transferência e avisa", pg.evaluate("navigator.clipboard.readText()") == "rnd_FALSO_PARA_TESTE_123456" and "Copiada" in pg.inner_text("#cx-msg-cofre"))
    pg.click("[data-cx=cofre-copiar][data-nome=onesignalEnvio]"); pg.wait_for_timeout(700)
    chk("chave de envio do OneSignal também", pg.evaluate("navigator.clipboard.readText()") == "os_v2_app_FALSO_PARA_TESTE")
    chk("a chave NUNCA aparece na tela nem no aparelho", not SEGREDOS.search(pg.content()) and not SEGREDOS.search(pg.evaluate("JSON.stringify(localStorage)+JSON.stringify(sessionStorage)")))
    chk("o código de abertura vai junto em cada cópia", all(c.get("cofre") == "abc123COFRE" for c in st["cofre"]["chamadas"] if c.get("action") == "revelarConexao"))
    print("== Trancar ==")
    pg.click("[data-cx=cofre-trancar]"); pg.wait_for_timeout(500)
    chk("trancou na tela e no servidor", pg.locator("#cx-cofre-senha").is_visible() and st["cofre"]["codigo"] == "")
    pg.fill("#cx-cofre-senha", "senha-certa"); pg.click("[data-cx=cofre-abrir]"); pg.wait_for_selector("[data-cx=cofre-copiar]")
    pg.evaluate("document.querySelector('#overlay-conexoes .sheet-x, #cx-fechar').click()"); pg.wait_for_timeout(600)
    chk("fechar a janela tranca o cofre no servidor", st["cofre"]["codigo"] == "")
    chk("nenhum erro de JavaScript", not erros, erros[:3])
    ctx.close()
    print("== Quem não vê / backend antigo ==")
    c2, p2, st2, e2 = novo(b, versao="3.5")
    chk("backend 3.5 (sem a bandeira): nenhum cofre", p2.locator("#cx-cofre").count() == 0)
    c2.close()
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
