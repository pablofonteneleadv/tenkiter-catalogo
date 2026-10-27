"""Conexões → Instagram: guardar a chave do Zernio (Instagram Direct). Serviços simulados; a chave nunca volta para a tela nem fica no aparelho."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
import mock_msg
from playwright.sync_api import sync_playwright
AXE = open(os.path.join(AQUI, 'axe.min.js')).read()
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
EVID = os.environ.get("TK_EVID", "")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.getElementById('cx-corpo'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+'×'+v.nodes.length)}")
    chk("axe — " + label, not r, r)
def foto(pg, nome):
    if EVID: pg.locator("#cx-zr-status").scroll_into_view_if_needed(); pg.screenshot(path=os.path.join(EVID, nome))
CHAVE = "sk_live_FALSA_" + "x" * 30          # inventada: o repositório é público
def tela(b, w, h, mob):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob, service_workers="block")
    ctx.add_init_script(SESSION)
    st = install(ctx, perms=PERMS_ALL, versao="3.4"); Z = st["ig"].setdefault("msg", mock_msg.novo_estado())
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    if pg.locator("#details-ferramentas[open]").count() == 0: pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-conexoes"); pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelectorAll('#cx-corpo .cx-grupo').forEach(g=>g.open=true)"); pg.wait_for_timeout(300)
    return ctx, pg, Z, erros
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx, pg, Z, erros = tela(b, 390, 844, True)
    chk("bloco 'Instagram Direct · Zernio' aparece no grupo Instagram", pg.locator("details:has(#cx-zr-status) >> text=Instagram Direct · Zernio").count() == 1)
    chk("começa sem chave guardada", "Nenhuma chave" in pg.inner_text("#cx-zr-status"), pg.inner_text("#cx-zr-status"))
    chk("passo a passo curto (criar conta, conectar, Settings → API Keys)", "Settings → API Keys" in pg.inner_text("#cx-corpo") and pg.locator(".cx-passos li").count() >= 3)
    chk("campo da chave é do tipo senha", pg.get_attribute("#cx-zr-key", "type") == "password")
    foto(pg, "01-sem-chave-390.png")
    pg.click("[data-cx=zr-guardar]"); pg.wait_for_timeout(300)
    chk("vazio: avisa em português e não chama o servidor", "Cole a chave" in pg.inner_text("#cx-zr-msg") and not Z.get("zernio", {}).get("posts"))
    pg.fill("#cx-zr-key", "ruim_" + "y" * 30); pg.click("[data-cx=zr-guardar]"); pg.wait_for_timeout(500)
    chk("chave recusada: erro legível, sem JSON", "recusou" in pg.inner_text("#cx-zr-msg") and "{" not in pg.inner_text("#cx-zr-msg"))
    pg.fill("#cx-zr-key", "semig_" + "z" * 30); pg.click("[data-cx=zr-guardar]"); pg.wait_for_timeout(500)
    chk("chave certa sem Instagram: guarda e diz que falta conectar", "falta conectar" in pg.inner_text("#cx-zr-status") and "conecte o Instagram" in pg.inner_text("#cx-zr-msg"))
    pg.fill("#cx-zr-key", CHAVE); pg.click("[data-cx=zr-guardar]"); pg.wait_for_timeout(500)
    chk("chave certa: mostra o Instagram conectado e limpa o campo", "@tenkitermodasceara" in pg.inner_text("#cx-zr-status") and pg.input_value("#cx-zr-key") == "")
    chk("a chave não aparece na tela nem no armazenamento do aparelho", CHAVE not in pg.content() and CHAVE not in pg.evaluate("JSON.stringify(localStorage)+JSON.stringify(sessionStorage)"))
    axe(pg, "Conexões com Zernio"); foto(pg, "02-conectado-390.png")
    chk("sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
    alvos = pg.evaluate("[...document.querySelectorAll('[data-cx^=zr-]')].map(b=>Math.round(b.getBoundingClientRect().height))")
    chk("botões com pelo menos 44 px", all(h >= 44 for h in alvos), alvos)
    pg.click("[data-cx=zr-apagar]"); pg.wait_for_timeout(500)
    chk("remover (com confirmação) apaga e volta a 'Nenhuma chave'", "Nenhuma chave" in pg.inner_text("#cx-zr-status") and Z["zernio"]["posts"][-1] == {"apagar": True})
    chk("sem erros de JS (390)", not erros, erros); ctx.close()
    ctx, pg, Z, erros = tela(b, 1440, 900, False)
    axe(pg, "1440 px"); foto(pg, "03-sem-chave-1440.png")
    chk("sem erros de JS (1440)", not erros, erros); ctx.close()
    b.close()
print("\n%d ok, %d falhas" % (len(OK), len(BAD)))
if BAD: sys.exit(1)
