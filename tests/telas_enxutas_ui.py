#!/usr/bin/env python3
"""v7.87.0 — Telas mais enxutas no celular (proposta aprovada pelo Pablo em 22/11/2026) e topo do app Android.
Simulado (tests/mock.py). No celular: some o que repetia (barra do Atendente, atalho de Ferramentas, frase do RH) e os
atalhos ficam numa linha; toques continuam com 44 px. No computador nada muda. No app Android o topo não soma a barra
de status de novo (--tk-seguro-topo = 0)."""
import os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from mock import install, SESSION
BASE = os.environ.get("TK_BASE", "http://127.0.0.1:8777/")
EVID = Path(os.environ.get("TK_EVID", AQUI / "saida" / "telas-enxutas")); EVID.mkdir(parents=True, exist_ok=True)
ok = 0; falhas = []
def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1; print("  ✔", nome)
    else: falhas.append(nome); print("  ✘", nome, "—", det)
UA_APP = "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 TenkiterAndroid/2.5"
def ctx_de(b, larg, alt, ua=None):
    o = dict(viewport={"width": larg, "height": alt}, is_mobile=larg < 600, has_touch=larg < 600, service_workers="block")
    if ua: o["user_agent"] = ua
    c = b.new_context(**o); c.add_init_script(SESSION); c.add_init_script("document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='.tkc-faixa{display:none!important}';document.head.appendChild(s)})"); install(c); return c
VIS = "(s)=>{const e=document.querySelector(s);return !!(e&&e.offsetParent!==null&&getComputedStyle(e).display!=='none')}"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for larg, alt in ((390, 844), (320, 700), (1440, 900)):
        cel = larg < 600
        print(f"== Gestão {larg}px ==")
        c = ctx_de(b, larg, alt); pg = c.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(BASE + "admin.html"); pg.wait_for_selector("#tkc-topo", timeout=20000); pg.wait_for_timeout(2500)
        barra = pg.evaluate(VIS, ".usuario-bar"); sub = pg.evaluate(VIS, "body > header > p")
        chk(f"{larg}: barra do Atendente {'some (nome e Sair no botão de conta)' if cel else 'continua'}", barra != cel, barra)
        chk(f"{larg}: linha 'Gestão & Atendimento' do topo {'some' if cel else 'continua'}", sub != cel, sub)
        at = pg.evaluate("[...document.querySelectorAll('#atalhos-hoje .atalhos-linha button')].filter(e=>e.offsetParent!==null).map(e=>{const r=e.getBoundingClientRect();return {k:e.dataset.atalho,t:Math.round(r.top),h:r.height}})")
        if cel:
            chk(f"{larg}: atalhos numa linha só, sem o 'Ferramentas' repetido", len({a['t'] for a in at}) == 1 and 'ferramentas' not in [a['k'] for a in at] and len(at) >= 2, at)
            chk(f"{larg}: atalhos com toque de pelo menos 44 px", all(a['h'] >= 44 for a in at), at)
            chk(f"{larg}: faixa 'Ferramentas do gestor' com nome curto", pg.evaluate("(()=>{const s=document.querySelector('#details-ferramentas > summary');return s&&s.innerText.trim().endsWith('Ferramentas do gestor')})()"))
        else:
            chk(f"{larg}: computador mantém o 'Ferramentas do gestor' nos atalhos e o nome completo da faixa", 'ferramentas' in [a['k'] for a in at] and "auditoria" in pg.inner_text("#details-ferramentas > summary"), at)
        chk(f"{larg}: Gestão sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        pg.screenshot(path=str(EVID / f"gestao-{larg}.jpg"), type="jpeg", quality=78)
        chk(f"{larg}: Gestão sem erro de JavaScript", not erros, erros); c.close()
        print(f"== RH {larg}px ==")
        c = ctx_de(b, larg, alt); pg = c.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(BASE + "treinamentos.html?painel=rh"); pg.wait_for_selector(".hero-rh h1", timeout=20000); pg.wait_for_timeout(1000)
        frase = pg.evaluate(VIS, ".hero-rh p")
        chk(f"{larg}: frase de explicação do RH {'some' if cel else 'continua'}", frase != cel, frase)
        if cel: chk(f"{larg}: título do RH menor (≤ 21 px)", pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.hero-rh h1')).fontSize)") <= 21)
        chk(f"{larg}: RH sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        pg.screenshot(path=str(EVID / f"rh-{larg}.jpg"), type="jpeg", quality=78)
        chk(f"{larg}: RH sem erro de JavaScript", not erros, erros); c.close()
    print("== app Android: topo sem somar a barra de status ==")
    for ua, nome in ((UA_APP, "app"), (None, "navegador")):
        c = ctx_de(b, 390, 844, ua); pg = c.new_page(); pg.goto(BASE + "treinamentos.html?painel=rh"); pg.wait_for_selector(".topbar", timeout=20000); pg.wait_for_timeout(800)
        marca = pg.evaluate("document.documentElement.classList.contains('tk-app-android')")
        var = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--tk-seguro-topo').trim()")
        if nome == "app": chk("app: marca tk-app-android e recuo do topo = 0 (o app já desconta a barra de status)", marca and var in ("0px", "0"), (marca, var))
        else: chk("navegador: sem a marca do app (o recuo continua vindo do aparelho)", not marca and pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--tk-seguro-topo')") != "", (marca, var))
        chk(f"{nome}: topo do Treinamento grudado em 0 px", pg.evaluate("getComputedStyle(document.querySelector('.topbar')).top") == "0px")
        c.close()
    b.close()
print(f"OK={ok} FALHAS={len(falhas)} {falhas}")
sys.exit(1 if falhas else 0)
