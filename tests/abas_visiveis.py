"""Faixas de abas (.tk-abas) mostram várias abas, cada uma do tamanho do próprio texto — nunca uma aba por tela.
Regressão real de 08/11/2026: em Postagens cada aba ficou com a largura da tela (o módulo tem `button{width:100%}`) e só "Nova postagem" aparecia.
Serviços SIMULADOS (tests/mock.py), Chromium.   TK_BASE=http://localhost:8765/ python3 tests/abas_visiveis.py"""
import os, sys
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import install, SESSION, PERMS_ALL
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK, BAD = [], []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)[:300]) if (e and not c) else ""))

MEDIR = """() => [...document.querySelectorAll('.tk-abas')].filter(c => c.getClientRects().length).map(c => {
  const tabs = [...c.querySelectorAll(':scope > [role=tab], :scope > button')].filter(t => t.getClientRects().length);
  const cw = c.clientWidth, larg = tabs.map(t => Math.round(t.getBoundingClientRect().width));
  return {id: c.id || c.className, n: tabs.length, cw, larg, esticada: tabs.length > 1 && larg.some(w => w >= cw * 0.9),
          visiveis: tabs.filter(t => { const r = t.getBoundingClientRect(), cr = c.getBoundingClientRect(); return r.left < cr.right - 8 && r.right > cr.left + 8; }).length};
})"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for w, h in [(390, 844), (1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, service_workers="block")
        ctx.add_init_script(SESSION); install(ctx, perms=PERMS_ALL, ia=False, versao="4.3")
        pg = ctx.new_page(); pg.on("dialog", lambda d: d.accept()); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2500)
        for rotulo, gatilho in [("Postagens", "#atalho-postagens"), ("Instagram", "#btn-abrir-conexoes"), ("Avisos", "#btn-abrir-push"), ("Números", "#btn-abrir-metricas")]:
            try:
                pg.evaluate("(s)=>{const e=document.querySelector(s); if(e){e.hidden=false; e.click()}}", gatilho); pg.wait_for_timeout(1200)
            except Exception:
                continue
            for faixa in pg.evaluate(MEDIR):
                chk(f"{w} {rotulo}: faixa '{faixa['id'][:24]}' não estica as abas ({faixa['larg']} em {faixa['cw']} px)", not faixa["esticada"], faixa)
                chk(f"{w} {rotulo}: faixa '{faixa['id'][:24]}' mostra mais de uma aba na primeira tela", faixa["n"] < 2 or faixa["visiveis"] >= 2, faixa)
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        pg.evaluate("(s)=>{const e=document.querySelector(s); if(e){e.hidden=false; e.click()}}", "#atalho-postagens"); pg.wait_for_timeout(1200)
        nomes = pg.evaluate("[...document.querySelectorAll('#overlay-postagens .po-abas > button')].map(t=>t.textContent.trim())")
        chk(f"{w} Postagens: existem as abas Nova postagem, Fila, Postar à mão e Já postadas", all(any(x in n for n in nomes) for x in ("Nova postagem", "Fila", "Postar à mão", "Já postadas")), nomes)
        chk(f"{w} sem erro de JavaScript", not erros, erros)
        ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
