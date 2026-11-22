#!/usr/bin/env python3
"""v7.89.1 — Tela vazia no app em TODAS as áreas (relato do Pablo, 22/11/2026).
No app, as janelas (Gestão, Esteira, Mensagens…) dividem o mesmo login e uma delas renova o código da sessão de vez em
quando. Nenhuma tela pode ficar vazia, deslogar ou perder o que mostra por causa disso. Simulado (tests/mock.py)."""
import os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from mock import install, SESSION, PERMS_ALL
BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8777/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ("" if c else " — " + str(e)[:300]))
UA = "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 TenkiterAndroid/2.5"
PONTE = "window.TKAndroid={abrirModulo:function(){return true},sairConta:function(){},podeAtualizar:function(){},versao:function(){return '2.5.3'},atualizar:function(){}};"
RENOVA = "(()=>{const s=JSON.parse(localStorage.getItem('tm_session'));s.sessao=s.sessao+'r';localStorage.setItem('tm_session',JSON.stringify(s))})()"
# tela, endereço, seletor que prova que a tela está montada e com conteúdo
TELAS = [
    ("Gestão", "admin.html", "#lista-produtos .produto"),
    ("Postagens", "admin.html?abrir=postagens", "#overlay-postagens.aberto"),
    ("Mensagens", "admin.html?app=mensagens", "#ms-mais"),
    ("Principal", "index.html", ".produto, article"),
    ("RH", "treinamentos.html?painel=rh", ".hero-rh"),
    ("Currículos", "curriculos.html", "header h1"),
]
def montada(pg, sel):
    return pg.evaluate("""(sel)=>{const e=document.querySelector(sel);if(!e)return false;const lo=document.getElementById('login-overlay');
      if(lo&&lo.classList.contains('visivel'))return false;return true}""", sel)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for nome, url, sel in TELAS:
        for atraso in (0, 150, 400, 1500, "aberta"):
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", user_agent=UA)
            ctx.add_init_script("if(!localStorage.getItem('__semente')){localStorage.setItem('__semente','1');" + SESSION + "}")
            ctx.add_init_script(PONTE); install(ctx, perms=PERMS_ALL)
            pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
            outra = ctx.new_page(); outra.goto(BASE + "404.html", wait_until="domcontentloaded")
            if atraso == "aberta":
                pg.goto(BASE + url)
                try: pg.wait_for_function("(s)=>!!document.querySelector(s)", arg=sel, timeout=25000)
                except Exception: pass
                pg.wait_for_timeout(800); outra.evaluate(RENOVA); pg.bring_to_front(); pg.wait_for_timeout(3500)
            else:
                pg.goto(BASE + url, wait_until="commit"); pg.wait_for_timeout(atraso); outra.evaluate(RENOVA)
                try: pg.wait_for_function("(s)=>!!document.querySelector(s)", arg=sel, timeout=25000)
                except Exception: pass
                pg.wait_for_timeout(2500)
            ok = montada(pg, sel)
            chk(f"{nome}: código renovado {'com a tela aberta' if atraso == 'aberta' else str(atraso) + ' ms depois de abrir'} — tela continua montada, sem pedir login", ok,
                pg.evaluate("(()=>({url:location.href,txt:document.body.innerText.slice(0,120)}))()"))
            chk(f"{nome} ({atraso}): sem erro de JavaScript", not erros, erros[:3])
            ctx.close()
    # Rede ruim no app: um arquivo auxiliar (tamanhos) que não carrega não pode deixar a lista vazia.
    for nome, url, sel in (("Gestão", "admin.html", "#lista-produtos .produto"), ("Principal", "index.html", ".produto, article")):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", user_agent=UA)
        ctx.add_init_script(SESSION); ctx.add_init_script(PONTE); install(ctx, perms=PERMS_ALL)
        ctx.route("**/tamanhos-vinculados.js*", lambda r: r.abort())
        pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(BASE + url)
        try: pg.wait_for_function("(s)=>!!document.querySelector(s)", arg=sel, timeout=25000)
        except Exception: pass
        pg.wait_for_timeout(1500)
        chk(f"{nome}: sem o arquivo de tamanhos, a lista aparece mesmo assim", montada(pg, sel), erros[:3])
        chk(f"{nome} (sem tamanhos): sem erro de JavaScript", not erros, erros[:3])
        ctx.close()
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
