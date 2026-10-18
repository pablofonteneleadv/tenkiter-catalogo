"""Postagens (18/10/2026): ao rolar para baixo depois de editar as fotos, pergunta 'Terminou de editar?' e oferece gerar as fotos finais.
Só pergunta de novo se algo mudou. Apps Script, Worker e R2 SIMULADOS (mock.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=60000;")
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"; g = st["ig"]; g["regras"] = True; erros = []
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2400)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(500); pg.click("[data-tipo=story]"); pg.wait_for_timeout(1200)
    def ver(): return pg.evaluate("(()=>{const e=document.getElementById('po-terminou');return !!e&&!e.hidden&&e.getBoundingClientRect().height>10})()")
    def rolar(y): pg.evaluate("y=>{const c=document.getElementById('po-corpo');c.scrollTop=y;c.dispatchEvent(new Event('scroll'))}", y); pg.wait_for_timeout(350)
    print("== Terminou de editar? ==")
    chk("no começo da tela a pergunta NÃO aparece", not ver())
    rolar(0)
    pg.evaluate("document.getElementById('po-corpo').scrollTop=document.getElementById('po-corpo').scrollHeight"); pg.wait_for_timeout(100); rolar(99999)
    chk("ao rolar para baixo (depois do visual) aparece a pergunta", ver(), pg.evaluate("document.getElementById('po-terminou')&&document.getElementById('po-terminou').outerHTML.slice(0,200)"))
    t = pg.inner_text("#po-terminou")
    chk("o texto pergunta se terminou de editar e oferece gerar as fotos finais", "Terminou de editar" in t and "Gerar as fotos finais" in t and "Ainda estou editando" in t, t)
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#po-terminou'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.map(v=>v.id+'x'+v.nodes.length)}")
    chk("axe — aviso 'Terminou de editar?'", not r, r)
    pg.click("[data-tm=nao]"); pg.wait_for_timeout(300)
    chk("'Ainda estou editando' fecha o aviso", not ver())
    rolar(0); rolar(99999)
    chk("sem mudar nada, rolar de novo NÃO pergunta outra vez", not ver())
    rolar(0)
    pg.evaluate("()=>{const d=document.getElementById('po-det'); if(d) d.open=true}")
    k = pg.evaluate("document.querySelector('[data-seltx]')&&document.querySelector('[data-seltx]').dataset.seltx")
    if k:
        pg.click("[data-seltx=%s]" % k); pg.wait_for_timeout(200); pg.fill("#po-tx-%s" % k, "Mudei o texto"); pg.wait_for_timeout(500)
    rolar(0); rolar(99999)
    chk("depois de mexer em algo, rolar para baixo pergunta de novo", ver())
    antes = len(st["midia"]["envios"])
    pg.click("[data-tm=sim]"); pg.wait_for_timeout(4500)
    chk("'Gerar as fotos finais' gera e sobe as imagens", len(st["midia"]["envios"]) > antes and "pronta" in pg.inner_text("#po-gerar"), pg.inner_text("#po-gerar")[:160])
    chk("o aviso some e o bloco 'Gerar imagens' fica à vista para revisão", not ver() and pg.evaluate("(()=>{const r=document.getElementById('po-gerar').getBoundingClientRect(),c=document.getElementById('po-corpo').getBoundingClientRect();return r.top<c.bottom&&r.bottom>c.top})()"))
    rolar(0); rolar(99999)
    chk("com tudo gerado, não pergunta mais", not ver())
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
