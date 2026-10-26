"""v7.14.2: "Gerar com IA" com o Gemini sobrecarregado tenta de novo sozinho até dar certo (formato do servidor 4.25 e 4.26),
para na hora com chave recusada, deixa cancelar e nunca mostra JSON cru."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK=[];BAD=[]
def chk(n,c,e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ")+n+(" — "+str(e) if e and not c else ""))
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
def abrir(p, **op):
    b=p.chromium.launch(args=["--no-sandbox"]); ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_IA_ESPERA_MS=40;")
    st=install(ctx,versao="3.5"); st["ia_foto_ok"]=True; st.update(op)
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("dialog",lambda d:d.accept())
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(2500)
    pg.locator("#card-menu-cadastro > summary").click(); pg.evaluate("document.getElementById('card-form').open=true")
    pg.evaluate("p=>{fotosItens.push({b64:p})}",PNG); pg.fill("#nome","Vestido")
    return b,pg,st,errs
with sync_playwright() as p:
    print("== servidor 4.25 (erro antigo, com JSON) sobrecarregado 3 vezes")
    b,pg,st,errs=abrir(p, ia_foto_sobrecarga=3)
    pg.click("#btn-foto-ia"); pg.wait_for_selector("#btn-foto-ia-aplicar",timeout=20000)
    chk("tentou 4 vezes e deu certo sozinho", len(st["ia_chamadas"])==4, len(st["ia_chamadas"]))
    chk("mostra a sugestão da IA", "Conjunto Cropped Preto" in pg.input_value("[data-ia-txt=nome]"))
    chk("sem erro de JS", not errs, errs); b.close()
    print("== servidor 4.26 (transitorio:true) sobrecarregado 2 vezes")
    b,pg,st,errs=abrir(p, ia_foto_sobrecarga=2, ia_foto_formato_novo=True)
    pg.click("#btn-foto-ia"); pg.wait_for_selector("#btn-foto-ia-aplicar",timeout=20000)
    chk("tentou 3 vezes e deu certo", len(st["ia_chamadas"])==3, len(st["ia_chamadas"])); b.close()
    print("== durante a espera: aviso claro e Cancelar")
    b,pg,st,errs=abrir(p, ia_foto_sobrecarga=99)
    pg.evaluate("window.TK_IA_ESPERA_MS=2000"); pg.click("#btn-foto-ia"); pg.wait_for_selector("#btn-foto-ia-cancelar",timeout=10000)
    t=pg.inner_text("#foto-ia-box")
    chk("avisa que está sobrecarregado e que vai tentar de novo, sem JSON", "sobrecarregado" in t and "tentar de novo" in t and "{" not in t, t)
    chk("o botão mostra que está tentando de novo", "Tentando de novo" in pg.inner_text("#btn-foto-ia"))
    pg.click("#btn-foto-ia-cancelar"); pg.wait_for_timeout(400)
    chk("Cancelar para e libera o botão", "cancelada" in pg.inner_text("#foto-ia-box") and pg.is_enabled("#btn-foto-ia"), pg.inner_text("#foto-ia-box"))
    n=len(st["ia_chamadas"]); pg.wait_for_timeout(2500)
    chk("depois de cancelar não chama mais o servidor", len(st["ia_chamadas"])==n, (n,len(st["ia_chamadas"]))); b.close()
    print("== sempre sobrecarregado: desiste com frase clara depois do limite")
    b,pg,st,errs=abrir(p, ia_foto_sobrecarga=99)
    pg.evaluate("window.TK_IA_ESPERA_MS=1"); pg.click("#btn-foto-ia")
    pg.wait_for_function("()=>/continua sobrecarregado/.test(document.getElementById('foto-ia-box').innerText)",timeout=30000)
    t=pg.inner_text("#foto-ia-box")
    chk("12 tentativas e frase sem JSON", len(st["ia_chamadas"])==12 and "{" not in t, (len(st["ia_chamadas"]),t)); b.close()
    print("== chave recusada: não insiste")
    b,pg,st,errs=abrir(p, ia_foto_chave_ruim=True)
    pg.click("#btn-foto-ia"); pg.wait_for_function("()=>/chave/i.test(document.getElementById('foto-ia-box').innerText)",timeout=10000)
    chk("1 tentativa só", len(st["ia_chamadas"])==1, len(st["ia_chamadas"])); b.close()
print("OK=%d FALHAS=%d %s"%(len(OK),len(BAD),BAD))
