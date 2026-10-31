"""Fila v2 (25/10/2026): cada destino é um menu dobrável (nome, quantidade, próximo horário), filtros por dia/horário e seleção
para editar vários de uma vez (data, próximo livre, postar agora, cancelar). Worker e Apps Script SIMULADOS (mock.py)."""
import sys, os, json, datetime
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.map(v=>v.id+'×'+v.nodes.length+' '+v.nodes.slice(0,2).map(n=>n.html.slice(0,80)).join('|'))}")
    chk("axe — " + label, not r, "; ".join(r))
def iso(dias, h, m=0):
    d = datetime.datetime.now().replace(hour=h, minute=m, second=0, microsecond=0) + datetime.timedelta(days=dias)
    return d.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
def post(i, tipo, quando, canal="instagram", status="agendado", midia=None, erro=""):
    return {"id": i, "tipo": tipo, "modo": "auto", "canal": canal, "legenda": "Legenda %d" % i,
            "midias": [{"url": midia or "https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/aa%d.jpg" % i, "tipo": "foto"}],
            "produto": "TK-0003", "template": "", "link": "", "agendadoEm": quando, "status": status, "erro": erro, "criadoPor": "Loja", "permalink": ""}
IGUAL = "https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/igual.jpg"
POSTS = lambda: [
    post(1, "story", iso(1, 9, 30), midia=IGUAL), post(2, "story", iso(1, 11, 0)), post(3, "story", iso(3, 18, 15)),
    post(4, "story", iso(1, 9, 31), canal="whatsapp", midia=IGUAL), post(5, "story", iso(1, 9, 32), canal="whatsapp2", midia=IGUAL),
    post(6, "story", iso(2, 14, 0), canal="whatsapp2", status="erro", erro="WhatsApp Status 2: o plano atual do Wame não inclui o recurso “status”. É preciso o plano Pro."),
    post(7, "story", iso(1, 9, 33), canal="grupo", midia=IGUAL), post(8, "feed", iso(5, 12, 0))]
def abrir(b, abertos=None):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=60000;")
    if abertos is not None: ctx.add_init_script("try{if(!sessionStorage.getItem('tk_ini')){localStorage.setItem('tk_po_fila_abertos',%s);sessionStorage.setItem('tk_ini','1')}}catch(e){}" % json.dumps(json.dumps(abertos)))
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"
    g = st["ig"]; g["regras"] = True; g["pode_regras"] = True; g["posts"] = POSTS()
    pg = ctx.new_page(); erros = []; msgs = []
    pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: (msgs.append(d.message), d.accept()))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2400)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    pg.click("#po-abas [data-aba=fila]"); pg.wait_for_timeout(500); pg.locator("[data-fila-modo=canal]").click()
    return ctx, pg, st, g, erros, msgs
def chamadas(g, path): return [c for c in g["post_chamadas"] if c["path"] == path]
def cab(pg, k): return pg.locator('[data-fg="%s"]' % k)
def itens(pg): return pg.locator("#po-corpo .po-item").count()

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx, pg, st, g, erros, msgs = abrir(b)
    print("== Grupos dobrados ==")
    chk("todos os destinos começam dobrados (nenhum cartão visível)", pg.locator(".po-fg-h").count() == 5 and itens(pg) == 0 and pg.locator('.po-fg-h[aria-expanded="true"]').count() == 0, pg.inner_text("#po-corpo")[:200])
    chk("o título do menu é o nome do destino", all(n in pg.inner_text("#po-corpo") for n in ["Story", "WhatsApp Status 1", "WhatsApp Status 2", "WhatsApp Grupo 1", "Feed"]))
    chk("ao lado só o número de itens (Story = 3)", cab(pg, "story").locator(".po-fg-c").inner_text().strip() == "3" and cab(pg, "status2").locator(".po-fg-c").inner_text().strip() == "2")
    prox = cab(pg, "story").locator(".po-fg-p").inner_text().strip()
    chk("e o próximo horário do próprio grupo (amanhã 09:30)", "amanhã" in prox and "09:30" in prox, prox)
    chk("Status 2 mostra o aviso de problema no cabeçalho", "⚠" in cab(pg, "status2").inner_text())
    chk("o próximo do Status 2 ignora a postagem com erro (amanhã 09:32)", "09:32" in cab(pg, "status2").locator(".po-fg-p").inner_text())
    chk("nome acessível resume o grupo", "Story, 3 postagens, próxima" in cab(pg, "story").get_attribute("aria-label"), cab(pg, "story").get_attribute("aria-label"))
    alt = cab(pg, "story").bounding_box()["height"]
    chk("alvo de toque do cabeçalho com 48 px ou mais", alt >= 48, alt)
    print("== Abrir e fechar ==")
    cab(pg, "story").click(); pg.wait_for_timeout(250)
    chk("tocar abre e mostra os 3 cartões do Story", cab(pg, "story").get_attribute("aria-expanded") == "true" and itens(pg) == 3)
    chk("o foco continua no cabeçalho depois de abrir", pg.evaluate("document.activeElement.dataset.fg") == "story")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(250)
    chk("Enter no cabeçalho fecha de novo", cab(pg, "story").get_attribute("aria-expanded") == "false" and itens(pg) == 0)
    cab(pg, "status2").click(); pg.wait_for_timeout(250)
    chk("o cartão com erro aparece com o motivo do plano", "plano atual do Wame" in pg.inner_text("#po-corpo") and "Tentar de novo" in pg.inner_text("#po-corpo"))
    pg.reload(); pg.wait_for_timeout(2400); pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800); pg.click("#po-abas [data-aba=fila]"); pg.wait_for_timeout(500)
    chk("o que ficou aberto continua aberto depois de recarregar", cab(pg, "status2").get_attribute("aria-expanded") == "true" and cab(pg, "story").get_attribute("aria-expanded") == "false")
    cab(pg, "status2").click(); pg.wait_for_timeout(200)
    print("== Filtros ==")
    pg.click('[data-filp=amanha]'); pg.wait_for_timeout(300)
    chk("Amanhã: Story cai para 2 (09:30 e 11:00) e Feed some", cab(pg, "story").locator(".po-fg-c").inner_text().strip() == "2" and cab(pg, "feed").count() == 0 and "Mostrando 5 de 8" in pg.inner_text("#po-corpo"), pg.inner_text("#po-corpo")[:600])
    pg.click('[data-filp="7d"]'); pg.wait_for_timeout(300)
    chk("7 dias: volta a mostrar tudo", pg.locator(".po-fg-h").count() == 5 and "Mostrando 8 de 8" in pg.inner_text("#po-corpo"))
    pg.click('[data-filp=mais]'); pg.wait_for_timeout(300)
    pg.fill('[data-filf=h1]', "09:00"); pg.wait_for_timeout(200); pg.fill('[data-filf=h2]', "10:00"); pg.wait_for_timeout(300)
    chk("faixa de horário 09:00–10:00 deixa só as 4 postagens da manhã", "Mostrando 4 de 8" in pg.inner_text("#po-corpo") and cab(pg, "feed").count() == 0, pg.inner_text("#po-corpo")[:200])
    chk("o campo de horário mantém o valor digitado e o foco", pg.input_value('[data-filf=h2]') == "10:00" and pg.evaluate("document.activeElement.dataset.filf") == "h2")
    pg.click('[data-filp=limpar]'); pg.wait_for_timeout(300)
    chk("Limpar filtros mostra tudo de novo", pg.locator(".po-fg-h").count() == 5 and "Mostrando" not in pg.inner_text("#po-corpo"))
    pg.click('[data-filp=mais]'); pg.wait_for_timeout(200)
    print("== Seleção e ações em massa ==")
    cab(pg, "story").click(); pg.wait_for_timeout(250)
    chk("sem seleção não há barra de ações", pg.locator(".po-lote").count() == 0)
    pg.locator('[data-filsel="1"]').check(); pg.wait_for_timeout(250)
    chk("marcar uma postagem abre a barra com a contagem", pg.locator(".po-lote").count() == 1 and "1 selecionada" in pg.locator(".po-lote").inner_text())
    chk("o cabeçalho do grupo mostra quantas estão marcadas", "✓ 1" in cab(pg, "story").inner_text())
    pg.click('[data-filb=igual]'); pg.wait_for_timeout(300)
    chk("Mesma mídia marca as outras 3 que usam a mesma foto (WhatsApp, Status 2 e Grupo)", "4 selecionadas" in pg.locator(".po-lote").inner_text() and "Marquei mais 3" in pg.inner_text("#po-corpo"), pg.locator(".po-lote").inner_text())
    box = pg.locator(".po-lote").bounding_box()
    chk("a barra cabe na tela (sem rolagem lateral) e fica visível", pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth") and 0 <= box["y"] and box["y"] + box["height"] <= 844, box)
    axe(pg, "Fila com grupo aberto e barra de ações")
    pg.click('[data-filb=hora]'); pg.wait_for_timeout(300)
    chk("Data/hora abre o seletor para as 4", "Novo horário para as 4" in pg.inner_text(".po-lote") and pg.locator('[data-pkc="filalote"]').count() > 0)
    pg.click('[data-pkc="filalote"][data-pk="d:2"]'); pg.wait_for_timeout(250); pg.click('[data-pkc="filalote"][data-pk="h:20"]'); pg.wait_for_timeout(250)
    pg.click('[data-filb=hora-ok]'); pg.wait_for_timeout(900)
    rg = chamadas(g, "/post/reagendar")
    chk("aplicou o mesmo horário às 4 postagens, uma chamada por postagem", sorted(c["corpo"]["id"] for c in rg) == [1, 4, 5, 7] and len({c["corpo"]["quando"] for c in rg}) == 1, rg)
    chk("avisa o resultado e limpa a seleção", "Horário atualizado em 4 postagens" in pg.inner_text("#po-corpo") and pg.locator(".po-lote").count() == 0, pg.inner_text("#po-corpo")[:250])
    pg.locator('[data-filsel="2"]').check(); pg.locator('[data-filsel="3"]').check(); pg.wait_for_timeout(250)
    pg.click('[data-filb=proximo]'); pg.wait_for_timeout(800)
    chk("Próximo livre age em cada uma das 2 marcadas", sorted(c["corpo"]["id"] for c in chamadas(g, "/post/proximo")) == [2, 3])
    pg.locator('[data-filsel="2"]').check(); pg.wait_for_timeout(250)
    n_msg = len(msgs); pg.click('[data-filb=agora]'); pg.wait_for_timeout(800)
    chk("Postar agora pede confirmação e manda 'agora'", len(msgs) == n_msg + 1 and any(c["corpo"].get("quando") == "agora" and c["corpo"]["id"] == 2 for c in chamadas(g, "/post/reagendar")), msgs[n_msg:])
    cab(pg, "story").click(); pg.wait_for_timeout(200); cab(pg, "story").click(); pg.wait_for_timeout(250)
    pg.locator('[data-filsel="3"]').check(); pg.wait_for_timeout(250)
    pg.click('[data-filb=cancelar]'); pg.wait_for_timeout(800)
    chk("Cancelar pede confirmação e cancela só a marcada", any(c["corpo"]["id"] == 3 for c in chamadas(g, "/post/cancelar")) and len(chamadas(g, "/post/cancelar")) == 1)
    cab(pg, "status2").click(); pg.wait_for_timeout(250)
    pg.click('[data-fgsel=status2]'); pg.wait_for_timeout(250)
    chk("Marcar todos do grupo marca os 2 do Status 2 (inclusive o com erro)", "2 selecionadas" in pg.locator(".po-lote").inner_text())
    pg.click('[data-fgsel=status2]'); pg.wait_for_timeout(250)
    chk("e desmarca de novo no mesmo botão", pg.locator(".po-lote").count() == 0)
    chk("sem erros JavaScript", not erros, erros)
    ctx.close()
    ctx, pg, st, g, erros, msgs = abrir(b, abertos=["story", "status", "status2", "grupo", "feed"])
    print("== Visual em 390 px, tudo aberto ==")
    chk("com tudo aberto aparecem os cartões e não há rolagem lateral", itens(pg) == 8 and pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth"), itens(pg))
    pg.screenshot(path=os.path.join(AQUI, "saida", "fila_v2_aberta.png"))
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
