"""Mensagens v7.40.17: "IA no atendimento" — Resumo da conversa (gaveta com Copiar) e Sugerir resposta (vai para o campo de mensagem,
com "[confirmar]" selecionado e aviso "Revise antes de enviar"; NUNCA envia sozinha). No celular fica no menu ⋯ da conversa; no computador
também no botão IA da barra. Serviços simulados (mock_msg.py). TK_EVID=<pasta> guarda as capturas (celular 390, computador 1440)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
import mock_msg
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
EVID = os.environ.get("TK_EVID", "")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.getElementById('overlay-mensagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+'×'+v.nodes.length+' '+v.nodes.slice(0,2).map(x=>x.target.join(' ')).join(','))}")
    chk("axe — " + label, not r, r)
def foto(pg, nome):
    if EVID: pg.screenshot(path=os.path.join(EVID, nome))
DIALOGOS = []
def tela(b, w, h, mob, conv):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob, service_workers="block")
    try: ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE.rstrip("/"))
    except Exception: pass
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4"); S = st["ig"].setdefault("msg", mock_msg.novo_estado())
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: (DIALOGOS.append(d.message), d.accept()))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000); pg.wait_for_timeout(600)
    pg.click("#ms-lista .ms-conv[data-id='%d']" % conv); pg.wait_for_selector("#ms-texto", timeout=4000); pg.wait_for_timeout(500)
    return ctx, pg, S, erros
def sem_rolagem_h(pg):
    return pg.evaluate("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('#overlay-mensagens *')].filter(e=>e.getClientRects().length&&!e.closest('.ms-fio,.ms-filtros,.ms-abas,.ms-chips')).every(e=>{const r=e.getBoundingClientRect();return r.width===0||(r.left>=-1&&r.right<=innerWidth+1)})")
def dentro(pg, sel):
    return pg.evaluate("(s)=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&r.height>=44}", sel)
ALVOS = "(sel)=>[...document.querySelectorAll(sel)].filter(e=>e.getClientRects().length).filter(e=>{const r=e.getBoundingClientRect();return r.height<44||r.width<44}).map(e=>(e.id||e.textContent.trim())+':'+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))"
def menu_conv(pg):
    pg.click("#ms-mais-conv"); pg.wait_for_timeout(300)
def txt(pg, sel): return pg.inner_text(sel)
SUG = "Entrega sim! Aqui em Crateús a taxa fica [confirmar]. Me manda seu endereço que eu já combino?"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    # ===== celular 390×844: Maria (WhatsApp 1), com texto e foto =====
    ctx, pg, S, erros = tela(b, 390, 844, True, 1)
    chk("390: botão IA não aperta a barra no celular (fica no menu ⋯)", pg.evaluate("getComputedStyle(document.getElementById('ms-ia-btn')).display") == "none")
    chk("390: barra de ferramentas sem estourar a largura", pg.evaluate("(()=>{const w=document.getElementById('ms-assina');return w.scrollWidth<=w.clientWidth+1})()"))
    foto(pg, "ia-390-conversa.png")
    menu_conv(pg)
    itens = [pg.locator(".ms-menu button").nth(i).inner_text() for i in range(pg.locator(".ms-menu button").count())]
    chk("menu ⋯ tem 'Resumo da conversa (IA)' e 'Sugerir resposta (IA)'", "Resumo da conversa (IA)" in itens and "Sugerir resposta (IA)" in itens, itens)
    chk("390: itens do menu com 44 px ou mais", not pg.evaluate(ALVOS, ".ms-menu button"), pg.evaluate(ALVOS, ".ms-menu button"))
    foto(pg, "ia-390-menu.png")
    pg.click(".ms-menu [data-ms=ia-resumo]"); pg.wait_for_selector("#ms-ia-texto", timeout=4000); pg.wait_for_timeout(200)
    post = (S.get("ia_posts") or [{}])[-1]
    chk("resumo: pede ao servidor {conversa, tipo:'resumo'}", post.get("conversa") == 1 and post.get("tipo") == "resumo", post)
    chk("resumo: abre a gaveta 'Resumo da conversa' com as linhas da IA", "Resumo da conversa" in txt(pg, ".ms-gaveta-cab") and txt(pg, "#ms-ia-texto").count("•") == 3)
    chk("resumo: texto entra como texto (sem HTML) e o foco vai para ele", pg.evaluate("!document.querySelector('#ms-ia-resumo img, #ms-ia-resumo script') && document.activeElement.id==='ms-ia-texto'"))
    chk("resumo: 'Copiar' é a ação principal, visível no pé", dentro(pg, "#ms-ia-copiar") and "prim" in pg.get_attribute("#ms-ia-copiar", "class"))
    chk("390: gaveta sem rolagem horizontal", sem_rolagem_h(pg))
    chk("390: alvos da gaveta com 44 px ou mais", not pg.evaluate(ALVOS, "#ms-gaveta button"), pg.evaluate(ALVOS, "#ms-gaveta button"))
    axe(pg, "resumo (390)")
    foto(pg, "ia-390-resumo.png")
    pg.click("#ms-ia-copiar"); pg.wait_for_timeout(300)
    chk("Copiar: aviso em português ('Resumo copiado.' ou texto selecionado)", ("Resumo copiado" in txt(pg, "#ms-aviso")) or ("selecionado" in txt(pg, "#ms-aviso")), txt(pg, "#ms-aviso"))
    try: copiado = pg.evaluate("navigator.clipboard.readText()")
    except Exception: copiado = None
    chk("Copiar: o resumo vai para a área de transferência", copiado is None or "Próximo passo" in copiado, copiado)
    # sugerir a partir da gaveta do resumo
    n_env = len(S["envios"])
    pg.click("#ms-gaveta [data-ms=ia-sugerir]"); pg.wait_for_timeout(500)
    chk("sugestão: a gaveta fecha e o texto cai no campo de mensagem", pg.locator("#ms-gaveta").count() == 0 and pg.input_value("#ms-texto") == SUG, pg.input_value("#ms-texto"))
    chk("sugestão: foco no campo com '[confirmar]' selecionado", pg.evaluate("(()=>{const t=document.getElementById('ms-texto');return document.activeElement===t&&t.value.slice(t.selectionStart,t.selectionEnd)==='[confirmar]'})()"))
    chk("sugestão: aviso discreto 'Revise antes de enviar'", pg.locator("#ms-ia-status").is_visible() and "Revise antes de enviar" in txt(pg, "#ms-ia-status") and pg.get_attribute("#ms-ia-status", "role") == "status")
    chk("sugestão: NUNCA envia sozinha (nenhum /msg/enviar)", len(S["envios"]) == n_env and not pg.locator("#ms-enviar").is_disabled(), S["envios"][n_env:])
    post = (S.get("ia_posts") or [{}])[-1]
    chk("sugestão: pede {conversa, tipo:'sugestao'}", post.get("conversa") == 1 and post.get("tipo") == "sugestao", post)
    chk("390: campo de mensagem e Enviar visíveis, sem rolagem horizontal", dentro(pg, "#ms-texto") and dentro(pg, "#ms-enviar") and sem_rolagem_h(pg))
    axe(pg, "sugestão no campo (390)")
    foto(pg, "ia-390-sugestao.png")
    # campo já escrito: pergunta antes de trocar
    pg.fill("#ms-texto", "Oi Maria"); n0 = len(DIALOGOS)
    S["ia_sugestao"] = "Tem sim! Qual tamanho você usa?"
    menu_conv(pg); pg.click(".ms-menu [data-ms=ia-sugerir]"); pg.wait_for_timeout(500)
    chk("campo já escrito: pergunta antes de trocar pela sugestão", len(DIALOGOS) == n0 + 1 and "Trocar o que já está escrito" in DIALOGOS[-1], DIALOGOS[-1:])
    chk("sem [confirmar]: cursor no fim e aviso 'Revise antes de enviar'", pg.input_value("#ms-texto") == "Tem sim! Qual tamanho você usa?" and pg.evaluate("(()=>{const t=document.getElementById('ms-texto');return t.selectionStart===t.value.length})()") and "Revise antes de enviar" in txt(pg, "#ms-ia-status"))
    # a atendente envia (ela decide): o aviso some
    pg.click("#ms-enviar"); pg.wait_for_timeout(700)
    chk("enviar é decisão da atendente: 1 envio com o texto revisado e o aviso some", len(S["envios"]) == n_env + 1 and S["envios"][-1].get("texto", "").endswith("Tem sim! Qual tamanho você usa?") and pg.locator("#ms-ia-status").count() == 0, S["envios"][n_env:])
    # erros legíveis
    S["ia_modo"] = "sem_chave"; n_env = len(S["envios"])
    menu_conv(pg); pg.click(".ms-menu [data-ms=ia-sugerir]"); pg.wait_for_timeout(500)
    chk("sem chave: 'IA ainda não configurada no servidor' perto do campo, sem JSON, campo intacto", "IA ainda não configurada no servidor" in txt(pg, "#ms-ia-status") and "{" not in txt(pg, "#ms-ia-status") and pg.input_value("#ms-texto") == "" and len(S["envios"]) == n_env)
    foto(pg, "ia-390-sem-chave.png")
    menu_conv(pg); pg.click(".ms-menu [data-ms=ia-resumo]"); pg.wait_for_selector(".ms-ia-erro", timeout=4000)
    chk("sem chave (resumo): gaveta explica e não oferece 'Tentar de novo'", "IA ainda não configurada no servidor" in txt(pg, "#ms-ia-resumo") and pg.locator("#ms-ia-resumo [data-ms=ia-resumo]").count() == 0)
    S["ia_modo"] = "falha"; pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    menu_conv(pg); pg.click(".ms-menu [data-ms=ia-resumo]"); pg.wait_for_selector(".ms-ia-erro", timeout=4000)
    chk("falha temporária: erro legível e 'Tentar de novo'", "não conseguiu responder" in txt(pg, "#ms-ia-resumo") and pg.locator("#ms-ia-resumo [data-ms=ia-resumo]").count() == 1)
    S["ia_modo"] = "ok"; pg.click("#ms-ia-resumo [data-ms=ia-resumo]"); pg.wait_for_selector("#ms-ia-texto", timeout=4000)
    chk("'Tentar de novo' busca o resumo outra vez", txt(pg, "#ms-ia-texto").count("•") == 3)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    chk("Esc fecha a gaveta do resumo", pg.locator("#ms-gaveta").count() == 0)
    S["ia_modo"] = "limite"
    menu_conv(pg); pg.click(".ms-menu [data-ms=ia-sugerir]"); pg.wait_for_timeout(500)
    chk("limite do dia: aviso em português", "limite do dia" in txt(pg, "#ms-ia-status"))
    S["ia_modo"] = "ok"
    chk("sem erros JavaScript (390)", not erros, erros)
    ctx.close()
    # ===== computador 1440×900: João (WhatsApp 2) — botão IA na barra =====
    ctx, pg, S, erros = tela(b, 1440, 900, False, 4)
    chk("1440: botão IA visível na barra, com nome acessível e 44 px", pg.locator("#ms-ia-btn").is_visible() and "IA" in (pg.get_attribute("#ms-ia-btn", "aria-label") or "") and dentro(pg, "#ms-ia-btn"))
    pg.click("#ms-ia-btn"); pg.wait_for_timeout(300)
    chk("1440: o botão IA abre as duas opções", [pg.locator(".ms-menu button").nth(i).inner_text() for i in range(pg.locator(".ms-menu button").count())] == ["Resumo da conversa", "Sugerir resposta"])
    chk("1440: o menu da IA abre inteiro dentro da tela (para cima, perto do rodapé)", pg.evaluate("(()=>{const r=document.querySelector('.ms-menu').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"))
    foto(pg, "ia-1440-menu.png")
    n_env = len(S["envios"])
    pg.click(".ms-menu [data-ms=ia-sugerir]"); pg.wait_for_timeout(500)
    chk("1440: sugestão no campo, foco e [confirmar] selecionado, sem enviar", pg.input_value("#ms-texto") == SUG and pg.evaluate("(()=>{const t=document.getElementById('ms-texto');return document.activeElement===t&&t.value.slice(t.selectionStart,t.selectionEnd)==='[confirmar]'})()") and len(S["envios"]) == n_env)
    foto(pg, "ia-1440-sugestao.png")
    pg.click("#ms-ia-btn"); pg.wait_for_timeout(300); pg.click(".ms-menu [data-ms=ia-resumo]"); pg.wait_for_selector("#ms-ia-texto", timeout=4000)
    chk("1440: resumo em gaveta lateral (até 420 px) com a lista à mostra", pg.evaluate("document.getElementById('ms-gaveta').getBoundingClientRect().width<=421") and pg.locator(".ms-lateral").is_visible())
    chk("1440: abrir o resumo não apaga a sugestão do campo", pg.input_value("#ms-texto") == SUG)
    chk("1440: sem rolagem horizontal e alvos ≥ 44 px", sem_rolagem_h(pg) and not pg.evaluate(ALVOS, "#ms-gaveta button"), pg.evaluate(ALVOS, "#ms-gaveta button"))
    axe(pg, "resumo (1440)")
    foto(pg, "ia-1440-resumo.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    chk("1440: Esc fecha e volta o foco ao campo de mensagem", pg.locator("#ms-gaveta").count() == 0 and pg.evaluate("document.activeElement.id") == "ms-texto")
    chk("1440: nenhuma mensagem foi enviada pela IA", len(S["envios"]) == n_env)
    chk("sem erros JavaScript (1440)", not erros, erros)
    ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
