#!/usr/bin/env python3
"""v7.86.0 — Conta no canto superior direito (conta.js) e janelas do app Android (nav.js).
Simulado: Apps Script pelo tests/mock.py; nada real é chamado. Confere, em celular e computador:
  - o botão de conta aparece em cada tela da equipe, no canto superior direito, com alvo >= 44 px, sem cobrir nada;
  - abre o menu com "Trocar de conta" e "Sair" (janela padrão: Esc fecha e devolve o foco);
  - Sair apaga a sessão e a OUTRA aba aberta percebe e se atualiza sozinha (sai de uma, sai de todas);
  - entrar numa aba faz a outra se atualizar já entrada (entra numa, entra em todas);
  - sem sessão ou dentro do app unificado (embed) não há botão; na loja só aparece para a equipe;
  - no app Android (TKAndroid simulado), a barra abre a janela da área e o Sair avisa o app.
"""
import os, sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from mock import install, SESSION, PERMS_ALL
BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8777/")
EVID = Path(os.environ.get("TK_EVID", AQUI / "saida" / "conta-topo")); EVID.mkdir(parents=True, exist_ok=True)
ok = 0; falhas = []
def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1; print("  ✔", nome)
    else: falhas.append(nome); print("  ✘", nome, "—", det)
ANDROID = "window.TKAndroid={abrirModulo:function(h){(window.__abriu=window.__abriu||[]).push(h);return true},sairConta:function(){window.__saiu=(window.__saiu||0)+1}};"
TELAS = [("admin.html", "Gestão"), ("curriculos.html", "Currículos")]

def novo_ctx(b, larg, alt, sessao=True, extra=None, perms=PERMS_ALL):
    ctx = b.new_context(viewport={"width": larg, "height": alt}, is_mobile=larg < 600, has_touch=larg < 600, service_workers="block")
    # a sessão entra uma vez só (sair e recarregar não pode trazê-la de volta)
    if sessao: ctx.add_init_script("if(!localStorage.getItem('__semente')){localStorage.setItem('__semente','1');" + SESSION + "}")
    if extra: ctx.add_init_script(extra)
    install(ctx, perms=perms)
    return ctx

def geometria(pg):
    return pg.evaluate("""() => { const b = document.getElementById('tkc-topo'); if (!b) return null; const r = b.getBoundingClientRect();
      const meio = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { x: r.left, y: r.top, w: r.width, h: r.height, dir: innerWidth - r.right, livre: !!(meio && b.contains(meio)), larg: innerWidth,
               semRolagem: document.documentElement.scrollWidth <= innerWidth + 1 }; }""")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for larg, alt in ((390, 844), (320, 700), (1440, 900)):
        for url, nome in TELAS:
            ctx = novo_ctx(b, larg, alt); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
            pg.goto(BASE + url)
            try: pg.wait_for_selector("#tkc-topo", state="visible", timeout=20000); achou = True
            except Exception: achou = False
            g = geometria(pg) if achou else None
            chk(f"{larg} {nome}: botão de conta no canto superior direito", achou and g and g["y"] < 80 and (g["dir"] < 60 or g["x"] > g["larg"] * 0.75), g)
            if achou and g:
                chk(f"{larg} {nome}: alvo de pelo menos 44 px e nada por cima", g["h"] >= 44 and g["w"] >= 44 and g["livre"], g)
                chk(f"{larg} {nome}: sem rolagem horizontal", g["semRolagem"], g)
                pg.wait_for_timeout(300); pg.screenshot(path=str(EVID / f"topo-{nome.split()[0].lower()}-{larg}.jpg"), type="jpeg", quality=78)
            chk(f"{larg} {nome}: sem erro de JavaScript", not erros, erros)
            ctx.close()

    print("== RH: a conta fica no menu do avatar que já existe ==")
    ctx = novo_ctx(b, 390, 844); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "treinamentos.html?painel=rh")
    try: pg.wait_for_selector("#btn-avatar-menu", timeout=20000); tem = True
    except Exception: tem = False
    chk("RH: sem segundo botão de conta por cima do avatar", tem and pg.locator("#tkc-topo").count() == 0)
    if tem:
        pg.click("#btn-avatar-menu"); pg.wait_for_selector("#btn-trocar-conta", state="visible", timeout=4000)
        pg.screenshot(path=str(EVID / "rh-avatar-390.jpg"), type="jpeg", quality=78)
        chk("RH: menu do avatar tem Trocar de conta e Sair", pg.is_visible("#btn-trocar-conta") and pg.is_visible("#btn-logout"))
    chk("RH: sem erro de JavaScript", not erros, erros)
    ctx.close()

    print("== menu, Esc e Sair em todas as abas ==")
    ctx = novo_ctx(b, 390, 844); a1 = ctx.new_page(); a2 = ctx.new_page()
    a1.goto(BASE + "admin.html"); a2.goto(BASE + "curriculos.html")
    a1.wait_for_selector("#tkc-topo", timeout=20000); a2.wait_for_selector("#tkc-topo", timeout=20000)
    a2.bring_to_front(); a2.click("#tkc-topo"); a2.wait_for_selector("#tkc-menu", timeout=4000)
    txt = a2.inner_text("#tkc-menu")
    chk("menu mostra Trocar de conta e Sair, e avisa que vale para todas as telas", "Trocar de conta" in txt and "Sair" in txt and "todas as telas" in txt, txt)
    chk("menu é janela padrão (diálogo, ✕ tk-fechar 44 px)", a2.evaluate("(()=>{const j=document.getElementById('tkc-menu'),f=j.querySelector('.tk-fechar');const r=f.getBoundingClientRect();return j.getAttribute('role')==='dialog'&&r.width>=44&&r.height>=44})()"))
    a2.screenshot(path=str(EVID / "menu-390.jpg"), type="jpeg", quality=78)
    a2.keyboard.press("Escape"); a2.wait_for_timeout(300)
    chk("Esc fecha o menu e o foco volta ao botão", a2.locator("#tkc-menu").count() == 0 and a2.evaluate("document.activeElement && document.activeElement.id") == "tkc-topo")
    conf = []
    a2.on("dialog", lambda d: (conf.append(d.message), d.accept()))
    a2.click("#tkc-topo"); a2.click("#tkc-sair"); a2.wait_for_load_state("load"); a2.wait_for_timeout(800)
    chk("Sair pergunta dizendo que sai de todas as telas", conf and "todas as telas" in conf[-1], conf)
    chk("Sair apaga a sessão e o botão some", a2.evaluate("localStorage.getItem('tm_session')") is None and a2.locator("#tkc-topo").count() == 0)
    a1.bring_to_front(); a1.wait_for_timeout(3500)
    chk("a outra aba (Gestão) percebe e sai também, sem ninguém tocar nela", a1.locator("#tkc-topo").count() == 0 and a1.evaluate("localStorage.getItem('tm_session')") is None)
    print("== entra numa, entra em todas ==")
    a2.evaluate("localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999999999',sessao:'tk2.x.y'}))")
    a1.wait_for_timeout(3500)
    chk("entrar em outra aba faz esta se atualizar já entrada", a1.locator("#tkc-topo").count() == 1, a1.url)
    ctx.close()

    print("== sem sessão, embed e loja de cliente ==")
    ctx = novo_ctx(b, 390, 844, sessao=False); pg = ctx.new_page(); pg.goto(BASE + "curriculos.html"); pg.wait_for_timeout(2500)
    chk("sem sessão: sem botão de conta", pg.locator("#tkc-topo").count() == 0); ctx.close()
    ctx = novo_ctx(b, 390, 844); pg = ctx.new_page(); pg.goto(BASE + "curriculos.html?embed=1&tkapp=1"); pg.wait_for_timeout(2500)
    chk("dentro do app unificado (embed): sem segundo botão", pg.locator("#tkc-topo").count() == 0); ctx.close()
    ctx = novo_ctx(b, 390, 844); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "index.html"); pg.wait_for_selector("#btn-conta-header", state="visible", timeout=20000); pg.wait_for_timeout(1500)
    chk("loja: sem segundo botão; o 'Minha conta' do canto direito continua", pg.locator("#tkc-topo").count() == 0 and pg.is_visible("#btn-conta-header"))
    pg.click("#btn-conta-header"); pg.wait_for_selector("#conta-trocar", state="visible", timeout=6000)
    pg.screenshot(path=str(EVID / "loja-minha-conta-390.jpg"), type="jpeg", quality=78)
    chk("loja: Minha conta tem Trocar de conta e Sair da conta", pg.is_visible("#conta-trocar") and pg.is_visible("#conta-sair"))
    pg.on("dialog", lambda d: d.accept()); pg.click("#conta-trocar"); pg.wait_for_timeout(600)
    chk("loja: Trocar de conta sai e mostra o Entrar na mesma janela", pg.evaluate("localStorage.getItem('tm_session')") is None and pg.locator("#conta-whats").count() == 1)
    chk("loja: sem erro de JavaScript", not erros, erros); ctx.close()

    print("== app Android (TKAndroid simulado) ==")
    ctx = novo_ctx(b, 390, 844, extra=ANDROID); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "admin.html"); pg.wait_for_selector("nav.tk-nav a[data-nav=curriculos]", timeout=20000)
    antes = pg.url
    pg.click("nav.tk-nav a[data-nav=curriculos]"); pg.wait_for_timeout(600)
    ab = pg.evaluate("window.__abriu || []")
    chk("barra de baixo no app: abre a janela de Currículos e a Gestão continua aqui", ab and ab[-1].endswith("/curriculos.html") and pg.url == antes and pg.locator("iframe.tk-app-frame:not([hidden])").count() == 0, (ab, pg.url))
    pg.on("dialog", lambda d: d.accept())
    pg.click("#tkc-topo"); pg.click("#tkc-sair"); pg.wait_for_load_state("load"); pg.wait_for_timeout(500)
    chk("Sair no app avisa o app Android (sai também das Mensagens)", pg.evaluate("localStorage.getItem('tm_session')") is None)
    chk("app: sem erro de JavaScript", not erros, erros)
    ctx.close()
    ctx = novo_ctx(b, 390, 844, extra=ANDROID); pg = ctx.new_page()
    pg.goto(BASE + "admin.html"); pg.wait_for_selector("#tkc-topo", timeout=20000)
    pg.on("dialog", lambda d: d.accept())
    pg.evaluate("window.__saiuAntes = 0; const o = TKAndroid.sairConta; TKAndroid.sairConta = function(){ sessionStorage.setItem('__saiu','1'); o(); }")
    pg.click("#tkc-topo"); pg.click("#tkc-trocar"); pg.wait_for_load_state("load"); pg.wait_for_timeout(500)
    chk("Trocar de conta também avisa o app e limpa a sessão", pg.evaluate("sessionStorage.getItem('__saiu')") == "1" and pg.evaluate("localStorage.getItem('tm_session')") is None)
    ctx.close()
    b.close()

print(f"OK={ok} FALHAS={len(falhas)} {falhas}")
sys.exit(1 if falhas else 0)
