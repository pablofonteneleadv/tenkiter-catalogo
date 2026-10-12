"""Treinamentos com backend de RH 3.4: manuais e provas só chegam por sessão + permissão (treinamento_conteudo)."""
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
    ctx.add_init_script(SESSION + "localStorage.setItem('tm_manuais_cache_v1', JSON.stringify({manuais:[{id:'2',titulo:'VELHO',blurb:'',nivelMinimo:2,parts:[{title:'x',chapters:[{title:'c',blocks:[{type:'p',text:'CACHE-PUBLICO'}]}]}]}],em:1}));")
    log = []; st = install(ctx, perms=["portal", "manual_1", "avaliacoes", "cliente"], log=log, versao="3.7", protegido=True)
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "treinamentos.html"); pg.wait_for_selector('.card[data-manual="1"]', timeout=8000); pg.wait_for_timeout(600)
    ch = st["conteudo_chamadas"]
    chk("a tela pediu o conteúdo ao servidor com a sessão (nunca a senha)", len(ch) >= 1 and ch[0].get("sessao") == "tk2.x.y" and "senha" not in ch[0], ch[:1])
    chk("a vitrine mostra os 3 manuais (os bloqueados aparecem como bloqueados)", pg.locator(".card[data-manual]").count() == 3 and pg.locator(".card.locked").count() == 2, pg.inner_text("#app")[:300])
    chk("os títulos vêm do servidor", "Manual Um" in pg.inner_text("#app") and "Manual Três" in pg.inner_text("#app"))
    chk("o texto antigo guardado no aparelho (cache público) foi apagado", pg.evaluate("localStorage.getItem('tm_manuais_cache_v1')") is None)
    pg.click('.card[data-manual="1"]'); pg.wait_for_timeout(700)
    chk("abrir o manual 1 mostra o texto que o SERVIDOR mandou", "TEXTO-DO-SERVIDOR-1" in pg.inner_text("#app"), pg.inner_text("#app")[:300])
    pg.locator(".read-toggle-big input").first.check(); pg.wait_for_timeout(800)
    chk("marcar um capítulo mostra que o progresso foi salvo no servidor", "salvo no servidor" in pg.inner_text("#sync-status"), pg.inner_text("#sync-status"))
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
