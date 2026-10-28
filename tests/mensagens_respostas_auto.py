"""Mensagens v7.40.8: atalhos de resposta rápida (/oi, /preco, /pix…) e gaveta "Respostas automáticas" (desligadas por padrão).
Serviços simulados (mock_msg.py). TK_EVID=<pasta> guarda as capturas de tela (celular 390 e 412, computador 1440, 320 px)."""
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
ATALHOS = [{"t": "/oi", "x": "Oi, tudo bem? Aqui é a [nome], da TENKiTER 😊 Me diz o que você tá procurando que eu te mostro."},
           {"t": "/preco", "x": "Esse sai por R$ [valor no Pix] no Pix ou dinheiro, ou R$ [valor no cartão] em até 10x sem juros. Qual tamanho você usa? Vejo aqui se tem."},
           {"t": "/pix", "x": "Pode fazer o Pix nessa chave: [chave Pix] ([nome]). Quando pagar, me manda o comprovante que eu já separo sua peça."}]

def tela(b, w, h, mob):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4"); S = st["ig"].setdefault("msg", mock_msg.novo_estado())
    S["respostas"] = [dict(x) for x in ATALHOS]
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000); pg.wait_for_timeout(600)
    return ctx, pg, S, erros
def abrir_auto(pg):
    pg.click("#ms-mais"); pg.wait_for_timeout(300)
    pg.click(".ms-menu [data-ms=auto-cfg]"); pg.wait_for_selector(".ms-auto", timeout=4000); pg.wait_for_timeout(200)
def sem_rolagem_h(pg):
    return pg.evaluate("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('#ms-gaveta *')].every(e=>{const r=e.getBoundingClientRect();return r.width===0||(r.left>=-1&&r.right<=innerWidth+1)})")
def dentro(pg, sel):
    return pg.evaluate("(s)=>{const r=document.querySelector(s).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&r.height>=44}", sel)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    # ===== celular 390×844 =====
    ctx, pg, S, erros = tela(b, 390, 844, True)
    abrir_auto(pg)
    chk("menu ⋯ abre a gaveta 'Respostas automáticas' por cima da lista (celular)", pg.locator("#ms-gaveta").is_visible() and "Respostas automáticas" in pg.inner_text(".ms-gaveta-cab"))
    chk("começa desligado: as duas chaves vêm sem marcar", pg.locator(".ms-auto-sec input[type=checkbox]").count() == 2 and pg.locator(".ms-auto-sec input[type=checkbox]:checked").count() == 0)
    chk("mostra a situação da loja e o horário", "abre amanhã às 7h30" in pg.inner_text(".ms-auto-agora") and "Sábado, 7h30 às 14h" in pg.inner_text(".ms-auto"))
    chk("Salvar fica fixo e visível no pé da gaveta (48 px)", dentro(pg, ".ms-auto-pe .ms-btn") and pg.evaluate("document.querySelector('.ms-auto-pe .ms-btn').getBoundingClientRect().height>=48"))
    chk("390: sem rolagem horizontal na gaveta", sem_rolagem_h(pg))
    axe(pg, "gaveta de respostas automáticas (390)")
    foto(pg, "auto-390-inicio.png")
    pg.locator(".ms-auto-sec").nth(0).locator("input[type=checkbox]").check()
    pg.locator(".ms-auto-sec").nth(1).locator("textarea").fill("Fechado agora. Volto {abertura}!")
    pg.click("[data-ms=auto-feriado-add]"); pg.wait_for_timeout(150)
    chk("incluir feriado sem data avisa em português", "Escolha a data do feriado" in pg.inner_text("#ms-aviso"))
    pg.fill("#ms-auto-data", "2026-11-20"); pg.click("[data-ms=auto-feriado-add]"); pg.wait_for_timeout(150)
    chk("feriado incluído aparece na lista (dd/mm/aaaa) e o que foi digitado continua", "20/11/2026" in pg.inner_text(".ms-auto-feriados") and pg.locator(".ms-auto-sec").nth(1).locator("textarea").input_value() == "Fechado agora. Volto {abertura}!" and pg.locator(".ms-auto-sec").nth(0).locator("input[type=checkbox]").is_checked())
    foto(pg, "auto-390-editando.png")
    pg.click("[data-ms=auto-salvar]"); pg.wait_for_timeout(500)
    post = (S.get("auto_posts") or [{}])[-1]
    chk("Salvar manda tudo junto: Boas-vindas ligada, texto editado e o feriado", post.get("boasVindas", {}).get("ligado") is True and post.get("foraHorario", {}).get("ligado") is False and post.get("foraHorario", {}).get("texto") == "Fechado agora. Volto {abertura}!" and post.get("feriados") == ["2026-11-20"], post)
    chk("confirmação legível depois de salvar", "Boas-vindas ligada" in pg.inner_text("#ms-aviso"), pg.inner_text("#ms-aviso"))
    pg.click("[data-ms=auto-feriado-tirar]"); pg.wait_for_timeout(150)
    chk("remover feriado tira da lista", "Nenhum feriado" in pg.inner_text(".ms-auto-feriados"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    chk("Esc fecha a gaveta", pg.locator("#ms-gaveta").count() == 0)
    # selo "Automática" + atalhos na conversa
    S["seq"] += 1
    S["msgs"].append({"id": S["seq"], "conversa_id": 1, "direcao": "saida", "tipo": "texto", "texto": "Oi! Que bom ter você aqui 😊", "enviada_em": mock_msg.agora(), "status": "entregue", "por": "auto", "status_em": mock_msg.agora()})
    pg.click("#ms-lista .ms-conv[data-id='1']"); pg.wait_for_selector("#ms-texto", timeout=4000); pg.wait_for_timeout(500)
    chk("mensagem automática aparece na conversa com o selo 'Automática'", pg.locator(".ms-bolha.saida .ms-auto-tag").count() == 1 and "Automática" in pg.inner_text(".ms-bolha.saida .ms-auto-tag"))
    foto(pg, "auto-390-selo.png")
    pg.click("[data-ms=gaveta-respostas]"); pg.wait_for_selector(".ms-resp-lista", timeout=3000)
    chk("respostas rápidas mostram os atalhos e a dica do /", "/oi" in pg.inner_text(".ms-resp-lista") and pg.locator(".ms-resp-dica").count() == 1)
    foto(pg, "auto-390-atalhos.png")
    pg.click("[data-ms=resp-usar][data-i='0']"); pg.wait_for_timeout(200)
    chk("/oi: [nome] vira o nome da atendente", pg.input_value("#ms-texto").startswith("Oi, tudo bem? Aqui é a Ana, da TENKiTER"), pg.input_value("#ms-texto"))
    pg.fill("#ms-texto", ""); pg.type("#ms-texto", "/preco "); pg.wait_for_timeout(200)
    v = pg.input_value("#ms-texto")
    chk("escrever '/preco ' coloca o texto do atalho", v.startswith("Esse sai por R$ [valor no Pix]"), v)
    sel = pg.evaluate("(()=>{const t=document.getElementById('ms-texto');return t.value.slice(t.selectionStart,t.selectionEnd)})()")
    chk("o primeiro [colchete] fica selecionado para completar", sel == "[valor no Pix]", sel)
    n0 = len(S["envios"]); pg.click("#ms-enviar"); pg.wait_for_timeout(300)
    chk("não envia com [colchete] sem completar e explica", len(S["envios"]) == n0 and "colchetes" in pg.inner_text("#ms-aviso"))
    pg.fill("#ms-texto", ""); pg.click("[data-ms=gaveta-respostas]"); pg.wait_for_selector(".ms-resp-lista", timeout=3000); pg.click("[data-ms=resp-usar][data-i='2']"); pg.wait_for_timeout(200)
    chk("/pix: [nome] da titular NÃO vira o nome da atendente", "([nome])" in pg.input_value("#ms-texto") and "Ana" not in pg.input_value("#ms-texto"))
    pg.fill("#ms-texto", "Esse sai por R$ 89,90 no Pix"); pg.click("#ms-enviar"); pg.wait_for_timeout(600)
    chk("texto completo envia normalmente", len(S["envios"]) == n0 + 1)
    chk("sem erros JavaScript (390)", not erros, erros)
    ctx.close()
    # ===== celular 412×915 e 320 =====
    for (w, h) in ((412, 915), (320, 640)):
        ctx, pg, S, erros = tela(b, w, h, True)
        abrir_auto(pg)
        chk("%d: gaveta visível, sem rolagem horizontal e Salvar alcançável" % w, pg.locator("#ms-gaveta").is_visible() and sem_rolagem_h(pg) and dentro(pg, ".ms-auto-pe .ms-btn"))
        chk("%d: alvos de toque da gaveta com 44 px ou mais" % w, pg.evaluate("[...document.querySelectorAll('#ms-gaveta button, #ms-gaveta input[type=date], #ms-gaveta label.ms-cfg-linha')].every(e=>e.getBoundingClientRect().height>=44)"))
        foto(pg, "auto-%d.png" % w)
        pg.locator(".ms-auto-sec").nth(1).locator("textarea").focus(); pg.wait_for_timeout(200)
        foto(pg, "auto-%d-texto.png" % w)
        chk("sem erros JavaScript (%d)" % w, not erros, erros)
        ctx.close()
    # ===== computador 1440×900 =====
    ctx, pg, S, erros = tela(b, 1440, 900, False)
    abrir_auto(pg)
    chk("1440: gaveta lateral de até 420 px, sem cobrir a lista", pg.evaluate("document.getElementById('ms-gaveta').getBoundingClientRect().width<=421") and pg.locator(".ms-lateral").is_visible())
    pg.keyboard.press("Tab"); pg.wait_for_timeout(100)
    chk("1440: teclado anda pela gaveta com foco visível", pg.evaluate("!!document.activeElement.closest('#ms-gaveta')"))
    axe(pg, "gaveta de respostas automáticas (1440)")
    foto(pg, "auto-1440.png")
    chk("sem erros JavaScript (1440)", not erros, erros)
    ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
