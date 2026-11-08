"""Juntar produtos repetidos na lista do admin (v3.7) — v7.50.0: roda em SEGUNDO PLANO (fila-lote.js).
A janela fecha na hora, a pessoa continua trabalhando, um aviso discreto mostra o andamento e o resultado; a fila fica no aparelho
(IndexedDB) e retoma depois de recarregar, com o mesmo opId (não junta duas vezes). Erro legível com "Tentar de novo".
Apps Script simulado (mock.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)[:400]) if (e and not c) else ""))
def sessao(b, versao):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); log = []; st = install(ctx, log=log, ia=False, versao=versao)
    erros = []; msgs = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: (msgs.append(d.message), d.accept()))
    pg.goto(BASE + "admin.html"); pg.wait_for_selector("#lista-produtos .produto"); pg.wait_for_timeout(1200)
    return ctx, pg, st, msgs, erros
def aviso(pg): return pg.evaluate("(()=>{const e=document.getElementById('tk-fila-lote');return e&&!e.hidden?{txt:e.innerText,estado:e.dataset.estado}:null})()")
def marcar(pg, *ns):
    for n in ns: pg.locator(".produto-chk").nth(n).check()
    pg.wait_for_timeout(250)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, st, msgs, er = sessao(b, "3.6")
    marcar(pg, 0, 1)
    chk("backend antigo: sem botão Juntar", pg.locator("#btn-bulk-juntar:visible").count() == 0); ctx.close()

    ctx, pg, st, msgs, er = sessao(b, "3.7")
    st["segurar_juntar"] = True
    P = st["produtos"]
    lista = pg.evaluate("[...document.querySelectorAll('.produto-chk')].slice(0,3).map(e=>e.dataset.id)")
    porId = {x["ID"]: x for x in P}
    porId[lista[1]]["Fotos_Galeria"] = "https://x/g1.jpg,https://x/g2.jpg"; porId[lista[2]]["Fotos_Galeria"] = "https://x/g3.jpg,https://x/g4.jpg"
    marcar(pg, 0)
    chk("com 1 marcado: sem Juntar", pg.locator("#btn-bulk-juntar:visible").count() == 0)
    marcar(pg, 1, 2)
    chk("com 3 marcados: aparece Juntar", pg.locator("#btn-bulk-juntar:visible").count() == 1)
    pg.click("#btn-bulk-juntar"); pg.wait_for_selector("#overlay-juntar.aberto")
    chk("janela lista as 3 produtos, a 1ª já escolhida", pg.locator("#juntar-lista input[type=radio]").count() == 3 and pg.locator("#juntar-lista input:checked").count() == 1)
    pg.locator("#juntar-lista input").nth(1).check(); dest = pg.locator("#juntar-lista input:checked").get_attribute("value")
    cod = porId[dest]["Codigo"]
    pg.click("#juntar-ok"); pg.wait_for_timeout(500)
    chk("confirmou antes (e avisou que dá para continuar trabalhando)", any("Juntar 2 produtos" in m and "continuar trabalhando" in m for m in msgs), msgs)
    chk("a janela fecha NA HORA, sem esperar o servidor", pg.locator("#overlay-juntar.aberto").count() == 0 and len(st.get("juntar_pendentes", [])) == 1)
    a = aviso(pg)
    chk("aviso discreto: 'Juntando 3 produtos em TK-…'", a and a["estado"] == "rodando" and ("Juntando 3 produtos em " + cod) in a["txt"], a)
    pg.screenshot(path="/tmp/juntar_andando_390.png")
    chk("a seleção foi limpa", pg.locator("#bulk-bar.ativa").count() == 0)
    marcar(pg, 5)
    chk("a lista segue usável enquanto junta (marcar outro produto funciona)", pg.locator("#bulk-bar.ativa").count() == 1)
    pg.locator("#btn-cancelar-bulk").click(); pg.wait_for_timeout(200)
    pend = st["juntar_pendentes"][0][1]
    chk("chamou juntarProdutos com o destino escolhido, os 2 outros, sessão e opId", str(pend["destinoId"]) == dest and len(pend["origemIds"]) == 2 and dest not in map(str, pend["origemIds"]) and str(pend.get("sessao", "")).startswith("tk") and str(pend.get("opId", "")).startswith("lt"), pend)
    guardado = pg.evaluate("""new Promise(r=>{const q=indexedDB.open('tenkiter_lote_fila_v1',1);q.onsuccess=()=>{const g=q.result.transaction('t').objectStore('t').getAll();g.onsuccess=()=>r(g.result)}})""")
    chk("fila guardada no aparelho SEM credencial (só ids/códigos/nomes)", len(guardado) == 1 and "tk2.x.y" not in str(guardado) and "88999999999" not in str(guardado), guardado)
    # ---- recarregou no meio: retoma sozinho, com o MESMO opId (o servidor não junta duas vezes)
    st["juntar_pendentes"].clear(); st["segurar_juntar"] = False   # a resposta nunca chega: a página recarrega no meio
    pg.reload(); pg.wait_for_selector("#lista-produtos .produto"); pg.wait_for_timeout(2500)
    jt = pg.evaluate("TKFilaLote.lista()")
    a = aviso(pg); nf = 1 + len([g for g in porId[dest]["Fotos_Galeria"].split(",") if g])
    chk("depois de recarregar: retomou e terminou ('Pronto: TK-… ficou com N fotos; 2 arquivadas.')", a and a["estado"] == "ok" and nf >= 5 and ("Pronto: %s ficou com %d fotos; 2 arquivadas." % (cod, nf)) in a["txt"], [a, nf])
    pg.screenshot(path="/tmp/juntar_pronto_390.png")
    chk("retomada usou o mesmo opId (idempotente) e o servidor juntou uma vez só", st.get("juntar_n") == 1 and jt and pend["opId"] == jt[0]["k"], [st.get("juntar_n"), pend.get("opId"), jt])
    chk("as outras 2 produtos ficaram arquivados", sum(1 for x in P if x["ID"] in map(str, pend["origemIds"]) and x["Status"] == "Inativo") == 2)
    pg.locator("#tk-fila-lote button", has_text="OK").click(); pg.wait_for_timeout(200)
    chk("OK fecha o aviso", aviso(pg) is None)
    # ---- erro legível com "Tentar de novo"
    st["juntar_erro"] = "O produto já passou do limite de 8 fotos."
    marcar(pg, 6, 7); pg.click("#btn-bulk-juntar"); pg.wait_for_selector("#overlay-juntar.aberto"); pg.click("#juntar-ok"); pg.wait_for_timeout(1500)
    a = aviso(pg)
    chk("erro em português, sem JSON cru, com 'Tentar de novo' e 'Descartar'", a and a["estado"] == "erro" and "limite de 8 fotos" in a["txt"] and "{" not in a["txt"] and pg.locator("#tk-fila-lote button", has_text="Tentar de novo").count() == 1 and pg.locator("#tk-fila-lote button", has_text="Descartar").count() == 1, a)
    pg.screenshot(path="/tmp/juntar_erro_390.png")
    st["juntar_erro"] = ""
    pg.locator("#tk-fila-lote button", has_text="Tentar de novo").click(); pg.wait_for_timeout(1500)
    a = aviso(pg)
    chk("Tentar de novo termina com 'Pronto'", a and a["estado"] == "ok" and "Pronto:" in a["txt"], a)
    chk("sem erro de JavaScript", not er, er); ctx.close(); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
