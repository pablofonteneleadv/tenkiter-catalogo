# Quem cadastrou / quem editou: aparece na lista e no formulário de edição, e o histórico abre (backend 4.1)
import sys, os
AQUI=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,AQUI)
from mock import *
from playwright.sync_api import sync_playwright
OK=[];BAD=[]
def chk(n,c,e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ")+n+((" — "+str(e)) if (e and not c) else ""))
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    for versao in ("4.1","3.7"):
        print("== backend",versao,"==")
        ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,service_workers="block")
        st=install(ctx,versao=versao); ctx.add_init_script(SESSION); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        st["auditoria"]={st["produtos"][-1]["ID"]:{"criadoPor":"Ana Cadastro","criadoEm":"2026-10-11T17:32:00.000Z","editadoPor":"Beto Edita","editadoEm":"2026-10-11T19:05:00.000Z","ultimaAcao":"Editou a peça"}}
        pg.goto(BASE+"admin.html"); pg.wait_for_timeout(2500)
        txt=pg.inner_text("#lista-produtos")
        if versao=="4.1":
            chk("a lista mostra 'Cadastrou: Ana Cadastro' com dia e hora","Cadastrou: Ana Cadastro" in txt and "14:32" in txt,txt[:200])
            chk("mostra quem editou por último","Editou: Beto Edita" in txt)
            chk("só a peça com registro mostra a linha",pg.locator(".produto .audit-linha").count()==1)
            pg.locator(".produto").first.locator(".mais summary").click()
            pg.locator("[data-hist-id]").first.click(); pg.wait_for_timeout(500)
            chk("🕘 Histórico abre a linha do tempo","Beto Edita" in pg.inner_text("#historico-corpo") and "preço 89 → 99" in pg.inner_text("#historico-corpo"),pg.inner_text("#historico-corpo"))
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            chk("Esc fecha o histórico",not pg.locator("#overlay-historico.aberto, #overlay-historico.visivel").count())
            pg.locator(".btn-editar").first.click(); pg.wait_for_timeout(400)
            chk("ao editar, o formulário mostra quem cadastrou/editou",pg.locator("#audit-form:not([hidden])").count()==1 and "Ana Cadastro" in pg.inner_text("#audit-form"))
        else:
            chk("backend sem a novidade: nenhuma linha e nenhum botão Histórico",pg.locator(".audit-linha:not([hidden])").count()==0 and pg.locator("[data-hist-id]").count()==0 and not st.get("aud_chamadas"))
        chk("sem erro de JavaScript",not errs,errs)
        ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d"%(len(OK),len(BAD)),BAD)
sys.exit(1 if BAD else 0)
