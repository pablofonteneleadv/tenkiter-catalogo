"""Avisos que não travam (TKAviso, v7.57.0): região única empilhada, tempos, erro que não some, sem sobreposição com faixas,
arquivar/reativar produto com "Desfazer", campo de senha e leitor de tela no Treinamentos. Chromium + serviços simulados;
não é validação no Android."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)[:400]) if (e and not c) else ""))

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for vp in ({"width": 390, "height": 844}, {"width": 1440, "height": 900}):
        w = vp["width"]
        ctx = b.new_context(viewport=vp, is_mobile=(w < 500), has_touch=(w < 500), service_workers="block")
        ctx.add_init_script(SESSION)
        log = []; st = install(ctx, log=log)
        dlg = []
        def on_dialog(d, dlg=dlg): dlg.append((d.type, d.message)); d.accept()
        pg = ctx.new_page(); pg.on("dialog", on_dialog)
        pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)

        # 1) região única, role=status, tempos
        pg.evaluate("TKAviso.ok('Pronto de teste.'); TKAviso.erro('Falha de teste.'); TKAviso.info('Info de teste.')")
        info = pg.evaluate("""() => { const r = document.getElementById('tk-avisos'); const it = [...r.querySelectorAll('.tk-aviso')];
          return { role: r.getAttribute('role'), live: r.getAttribute('aria-live'), n: it.length, rects: it.map(e => { const b = e.getBoundingClientRect(); return [b.top, b.bottom, b.left, b.right]; }), vh: innerHeight }; }""")
        chk("%d: região única #tk-avisos com role=status e aria-live" % w, info["role"] == "status" and info["live"] == "polite" and info["n"] == 3, info)
        rs = sorted(info["rects"])
        chk("%d: avisos empilhados sem sobreposição" % w, all(rs[i][1] <= rs[i + 1][0] + 0.5 for i in range(len(rs) - 1)), rs)
        chk("%d: avisos dentro da tela" % w, all(r[0] >= 0 and r[1] <= info["vh"] for r in rs), rs)
        pg.wait_for_timeout(6600)
        txt = pg.inner_text("#tk-avisos")
        chk("%d: sucesso e info somem sozinhos em ~6 s; erro NÃO some" % w, "Pronto de teste" not in txt and "Info de teste" not in txt and "Falha de teste" in txt, txt)
        chk("%d: erro tem botão Fechar de 44 px" % w, pg.evaluate("(() => { const b = document.querySelector('#tk-avisos .tk-aviso-erro button'); if (!b) return false; const r = b.getBoundingClientRect(); return r.height >= 43.5 && r.width >= 43.5; })()"))
        pg.click("#tk-avisos .tk-aviso-erro button"); pg.wait_for_timeout(200)
        chk("%d: Fechar remove o erro" % w, pg.locator("#tk-avisos .tk-aviso").count() == 0)

        # 2) não cobre a faixa fixa de juntar/separar (fila-lote.js a 86 px do rodapé)
        pg.evaluate("""() => { const f = document.createElement('div'); f.className = 'tk-fila-lote'; f.id = 'faixa-teste'; f.textContent = 'Não consegui juntar agora. Tente de novo.';
          f.style.minHeight = '96px'; document.body.appendChild(f); }""")
        pg.evaluate("TKAviso.erro('Aviso novo perto da faixa.')"); pg.wait_for_timeout(200)
        pos = pg.evaluate("""() => { const f = document.getElementById('faixa-teste').getBoundingClientRect(); const a = document.getElementById('tk-avisos').getBoundingClientRect();
          return { faixaTopo: f.top, avisoBase: a.bottom, faixaBase: f.bottom, avisoTopo: a.top }; }""")
        chk("%d: aviso fica ACIMA da faixa de juntar/separar (não cobre o erro dela)" % w, pos["avisoBase"] <= pos["faixaTopo"] + 0.5, pos)
        pg.evaluate("document.getElementById('faixa-teste').remove(); document.querySelectorAll('#tk-avisos .tk-aviso').forEach(e => e.remove())")

        # 3) campo de senha numa janela (no lugar de prompt())
        pg.evaluate("window.__senha = 'pendente'; TKAviso.pedirSenha({ titulo: 'Nova senha', texto: 'Teste' }).then(v => { window.__senha = v; }); 0"); pg.wait_for_timeout(200)
        tipo = pg.evaluate("(document.querySelector('.tk-senha-caixa input') || {}).type")
        chk("%d: nova senha usa campo type=password" % w, tipo == "password", tipo)
        pg.fill(".tk-senha-caixa input", "ab"); pg.click(".tk-senha-ok"); pg.wait_for_timeout(150)
        chk("%d: senha curta é recusada com frase legível" % w, "pelo menos 4" in pg.inner_text(".tk-senha-erro"))
        pg.fill(".tk-senha-caixa input", "abcd"); pg.click(".tk-senha-ok"); pg.wait_for_timeout(200)
        chk("%d: senha válida volta ao chamador e fecha a janela" % w, pg.evaluate("window.__senha") == "abcd" and pg.locator(".tk-senha-caixa").count() == 0)
        chk("%d: nenhum prompt()/alert() nativo foi aberto" % w, dlg == [], dlg)

        # 4) arquivar produto: confirmação, botão travado, aviso com Desfazer, depois reativa
        pg.wait_for_selector("[data-arquivar-id]", state="attached", timeout=8000)
        btn = pg.locator("[data-arquivar-id]").first
        pid = btn.get_attribute("data-arquivar-id")
        n0 = len(log)
        btn.dispatch_event("click"); pg.wait_for_timeout(1500)
        confirms = [m for t, m in dlg if t == "confirm"]
        chk("%d: arquivar pede confirm() dizendo a consequência" % w, any("Arquivar este produto" in m and "pode ser reativado" in m for m in confirms), confirms)
        av = pg.inner_text("#tk-avisos")
        chk("%d: arquivar mostra aviso de sucesso com Desfazer" % w, "Produto arquivado" in av and pg.locator("#tk-avisos .tk-aviso-desfazer").count() == 1, av)
        pg.click("#tk-avisos .tk-aviso-desfazer"); pg.wait_for_timeout(1500)
        chk("%d: Desfazer reativa o produto" % w, "Produto reativado" in pg.inner_text("#tk-avisos"), pg.inner_text("#tk-avisos"))
        ctx.close()

    # 5) Treinamentos: aviso anunciado por leitor de tela
    ctx = b.new_context(viewport={"width": 390, "height": 844}, service_workers="block"); ctx.add_init_script(SESSION); install(ctx)
    pg = ctx.new_page(); pg.goto(BASE + "treinamentos.html"); pg.wait_for_timeout(1500)
    at = pg.evaluate("(() => { const t = document.getElementById('toast'); return [t.getAttribute('role'), t.getAttribute('aria-live')]; })()")
    chk("treinamentos: #toast tem role=status e aria-live", at == ["status", "polite"], at)
    ctx.close(); b.close()
print("OK=%d FALHAS=%d" % (len(OK), len(BAD)))
sys.exit(1 if BAD else 0)
