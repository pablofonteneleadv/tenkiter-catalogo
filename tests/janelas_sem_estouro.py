"""Nenhuma janela/aba do painel fica mais larga que a tela do celular (320/360/390/412) — sem rolagem lateral.
Regressão: Pablo precisou deslizar para a direita em Postagens e outras janelas no Android.
Serviços SIMULADOS (tests/mock.py), Chromium (não é Android).   TK_BASE=http://localhost:8765/ python3 tests/janelas_sem_estouro.py"""
import os, sys
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import install, SESSION, PERMS_ALL
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
GATILHOS = ["atalho-postagens", "btn-abrir-conexoes", "btn-abrir-push", "btn-abrir-metricas", "btn-abrir-mensagens",
            "btn-abrir-fotoia", "btn-abrir-categorias", "btn-abrir-tamanhos", "btn-abrir-cores", "btn-abrir-auditoria",
            "atalho-pedidos", "atalho-estoque"]
MEDIR = """() => {
  const out = [], de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 2) out.push('pagina ' + de.scrollWidth + '>' + de.clientWidth);
  for (const c of document.querySelectorAll('.overlay-sheet.aberto, .overlay-sheet.aberto .sheet, .overlay.aberto, dialog[open], [role=dialog]')) {
    if (c.getClientRects().length && c.scrollWidth > c.clientWidth + 2) out.push((c.id || c.className).toString().slice(0, 30) + ' ' + c.scrollWidth + '>' + c.clientWidth);
  }
  return out; }"""
OK, BAD = 0, []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for w in (320, 360, 390, 412):
        ctx = b.new_context(viewport={"width": w, "height": 800}, is_mobile=True, has_touch=True, service_workers="block")
        ctx.add_init_script(SESSION); install(ctx, perms=PERMS_ALL, ia=False, versao="4.3")
        pg = ctx.new_page(); pg.on("dialog", lambda d: d.accept())
        pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2500)
        def medir(rot):
            global OK
            r = pg.evaluate(MEDIR)
            if r: BAD.append("%d %s: %s" % (w, rot, r)); print("  ✘ %d %s: %s" % (w, rot, r))
            else: OK += 1
        medir("início")
        for g in GATILHOS:
            try:
                pg.evaluate("id => { const e = document.getElementById(id); if (e) { e.hidden = false; e.click(); } }", g)
                pg.wait_for_timeout(900); medir(g)
                abas = pg.query_selector_all("[role=tablist]:not([hidden]) > [role=tab], .po-abas > button")
                for i in range(min(len(abas), 10)):
                    try:
                        t = pg.query_selector_all("[role=tablist]:not([hidden]) > [role=tab], .po-abas > button")[i]
                        if t.is_visible(): t.click(timeout=1500); pg.wait_for_timeout(500); medir("%s > aba %d" % (g, i))
                    except Exception: pass
                pg.keyboard.press("Escape"); pg.evaluate("() => document.querySelectorAll('.overlay-sheet.aberto').forEach(o => o.classList.remove('aberto'))")
            except Exception: pass
        ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (OK, len(BAD), BAD[:5]))
sys.exit(1 if BAD else 0)
