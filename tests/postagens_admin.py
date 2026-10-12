"""Aba Postagens (admin-postagens.js, v4.6): escolher peça/mídias, tipo (Feed, Carrossel, Reels, Story), Original/Templates (canvas -> JPEG -> R2), legenda, agora x agendado,
fila (cancelar / tentar de novo), Story com link = tarefa manual (baixar, copiar, "Já postei"), quem pode ver o botão, teclado e axe. Worker do Instagram e R2 simulados (mock.py)."""
import sys, os, json
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.map(v=>v.id+'×'+v.nodes.length+' '+v.nodes.slice(0,2).map(n=>n.html.slice(0,90)).join('|'))}")
    chk("axe — " + label, not r, "; ".join(r))
def novo(b, perms=PERMS_ALL, versao="4.3"):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", permissions=["clipboard-read", "clipboard-write"])
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    st = install(ctx, perms=perms, versao=versao); st["midia"]["modo"] = "ok"
    return ctx, st
def abrir(pg):
    if pg.locator("#details-ferramentas[open]").count() == 0: pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(700)
def corpo(pg): return pg.inner_text("#po-corpo")
def aba(pg, nome): pg.click("#po-abas [data-aba=%s]" % nome); pg.wait_for_timeout(500)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    erros = []; dialogos = []
    ctx, st = novo(b); g = st["ig"]
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: (dialogos.append(d.message), d.accept()))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)

    print("== Quem vê ==")
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    chk("Admin total vê o botão 📸 Postagens", pg.locator("#btn-abrir-postagens").is_visible())
    c2, _ = novo(b, perms=["catalogo_cadastrar", "catalogo_admin"]); p2 = c2.new_page(); p2.goto(BASE + "admin.html"); p2.wait_for_timeout(2600); p2.click("#details-ferramentas > summary"); p2.wait_for_timeout(250)
    chk("quem cadastra peças (sem Admin total) também vê", p2.locator("#btn-abrir-postagens").is_visible())
    c3, _ = novo(b, perms=["catalogo_admin", "catalogo_push"]); p3 = c3.new_page(); p3.goto(BASE + "admin.html"); p3.wait_for_timeout(2600); p3.click("#details-ferramentas > summary"); p3.wait_for_timeout(250)
    chk("quem não cadastra NÃO vê", not p3.locator("#btn-abrir-postagens").is_visible())
    c2.close(); c3.close()

    print("== Nova postagem: Feed agora com template ==")
    abrir(pg)
    chk("abre com as 4 abas e o passo 1", pg.locator("#overlay-postagens.aberto").count() == 1 and pg.locator("#po-abas [role=tab]").count() == 4 and "Qual peça?" in corpo(pg))
    pg.fill("#po-busca", "TK-0003"); pg.wait_for_timeout(300)
    chk("busca por código mostra a peça", pg.locator(".po-peca").count() >= 1, corpo(pg)[:200])
    pg.click(".po-peca >> nth=0"); pg.wait_for_timeout(400)
    t = corpo(pg)
    chk("peça escolhida: tipos, visual, legenda e quando aparecem", all(x in t for x in ["O que postar?", "Visual", "Legenda", "Quando?"]), t[:300])
    leg = pg.input_value("#po-leg")
    chk("legenda automática: nome, preço à vista, código e link completo da peça", "à vista" in leg and "TK-0003" in leg and "https://tenkitermodas.com.br/p/TK-0003" in leg and "#tenkitermodas" in leg, leg[:300])
    chk("Feed marca só 1 foto", pg.locator(".po-m[aria-pressed=true]").count() == 1)
    pg.click("[data-a=previa]"); pg.wait_for_timeout(1500)
    chk("prévia do template mostra a imagem montada (canvas 1080x1350)", pg.eval_on_selector_all("#po-previa canvas", "c=>c.length>0 && c[0].width===1080 && c[0].height===1350"))
    for tpl in ["promo", "minimal", "vitrine", "original"]:
        pg.click("[data-tpl=%s]" % tpl); pg.click("[data-a=previa]"); pg.wait_for_timeout(900)
        chk("template %s monta a prévia" % tpl, pg.locator("#po-previa canvas").count() == 1)
    pg.click("[data-tpl=classico]")
    axe(pg, "Nova postagem")
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
    c = g["post_chamadas"][-1]["corpo"] if g.get("post_chamadas") else {}
    chk("enviou 1 Feed 'agora' com a mídia do R2 e a legenda", c.get("tipo") == "feed" and c.get("quando") == "agora" and len(c.get("midias", [])) == 1 and "tenkiter-midia" in c["midias"][0]["url"] and "TK-0003" in c.get("legenda", ""), c)
    chk("subiu ao R2 uma imagem montada de verdade (não a miniatura)", st["midia"]["envios"] and st["midia"]["envios"][0].get("tam", 0) > 5000, st["midia"]["envios"][:1])
    chk("guarda a peça e o template no pedido", c.get("produto") == "TK-0003" and c.get("template") == "classico")
    chk("vai para 'Já postadas' com aviso", "Enviado" in corpo(pg) or "Já postadas" in pg.inner_text("#po-abas"), corpo(pg)[:200])
    aba(pg, "hist"); chk("histórico mostra Publicado + link do Instagram", "Publicado" in corpo(pg) and pg.locator("#po-corpo a:has-text('Ver no Instagram')").count() == 1)

    print("== Carrossel e validações ==")
    aba(pg, "nova"); pg.fill("#po-busca", "TK-0004"); pg.wait_for_timeout(300); pg.click(".po-peca >> nth=0"); pg.wait_for_timeout(300)
    pg.click("[data-tipo=carrossel]"); pg.wait_for_timeout(200)
    n = pg.locator(".po-m[aria-pressed=true]").count()
    chk("Carrossel marca as fotos da peça (2 ou mais quando existem)", n >= 1, n)
    pg.click("[data-tipo=reels]"); pg.click("[data-a=enviar]"); pg.wait_for_timeout(300)
    chk("Reels sem vídeo é barrado com frase", "1 vídeo" in corpo(pg) and "role" in pg.inner_html("#po-corpo"))
    chk("Reels não oferece template", pg.locator("[data-tpl]").count() == 0)

    print("== Story com link (manual) ==")
    pg.click("[data-tipo=story]"); pg.wait_for_timeout(200)
    chk("Story oferece a caixinha 'Story com link' e explica", pg.locator("#po-manual").count() == 1 and "não deixa colocar link" in corpo(pg))
    pg.click("[data-tpl=vitrine]"); pg.check("#po-manual"); pg.wait_for_timeout(200)
    chk("botão vira 'Preparar Story para postar à mão'", "Preparar Story" in pg.inner_text(".po-enviar"))
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
    c = g["post_chamadas"][-1]["corpo"]
    chk("cria Stories manuais com o link completo da peça (um por foto)", all(q["modo"] == "manual" and q["link"] == "https://tenkitermodas.com.br/p/TK-0004" and q["tipo"] == "story" and len(q["midias"]) == 1 for q in c["posts"]), c)
    chk("abre na aba 'Postar à mão'", pg.locator("#po-abas [data-aba=manual][aria-selected=true]").count() == 1 and "Passo a passo" in corpo(pg), corpo(pg)[:200])
    chk("tem Baixar mídia, Copiar link, Abrir o Instagram e Já postei", all(pg.locator("#po-corpo :text('%s')" % x).count() for x in ["Baixar mídia", "Copiar link", "Abrir o Instagram", "Já postei"]))
    pg.click("[data-a=copiar-link] >> nth=0"); pg.wait_for_timeout(300)
    chk("copiar link põe o endereço completo na área de transferência", pg.evaluate("navigator.clipboard.readText()") == "https://tenkitermodas.com.br/p/TK-0004")
    axe(pg, "Postar à mão")
    antes = pg.locator(".po-item").count()
    pg.click("[data-a=feito] >> nth=0"); pg.wait_for_timeout(700)
    chk("'Já postei' tira da lista", pg.locator(".po-item").count() == antes - 1)

    print("== Agendado, cancelar, erro ==")
    aba(pg, "nova"); pg.fill("#po-busca", "TK-0005"); pg.wait_for_timeout(300); pg.click(".po-peca >> nth=0"); pg.wait_for_timeout(300)
    pg.click("[data-q=agendar]"); pg.fill("#po-data", "2020-01-01T10:00"); pg.click("[data-a=enviar]"); pg.wait_for_timeout(300)
    chk("data no passado é barrada", "pelo menos 1 minuto" in corpo(pg))
    import datetime
    fut = (datetime.datetime.now() + datetime.timedelta(days=2)).strftime("%Y-%m-%dT10:00")
    pg.fill("#po-data", fut); pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
    c = g["post_chamadas"][-1]["corpo"]
    chk("agendado vai com data ISO no futuro", c["quando"].endswith("Z") and c["quando"] > "2026-10-12", c.get("quando"))
    chk("abre a Fila com 'Agendado'", "Agendado" in corpo(pg) and pg.locator("[data-a=cancelar]").count() >= 1)
    pg.click("[data-a=cancelar] >> nth=0"); pg.wait_for_timeout(600)
    chk("cancelar pede confirmação e tira da fila", any("Cancelar" in d for d in dialogos) and "Nada na fila" in corpo(pg), corpo(pg)[:150])
    g["posts"].append({"id": 900, "tipo": "feed", "modo": "auto", "legenda": "x", "midias": [{"url": "https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/a1.jpg", "tipo": "imagem"}], "agendadoEm": "2026-10-11T12:00:00Z", "status": "erro", "tentativas": 3, "erro": "O Instagram não aceitou a mídia. Confira o formato.", "permalink": "", "criadoPor": "Ana"})
    aba(pg, "fila")
    chk("erro aparece como frase (sem JSON) com 'Tentar de novo'", "O Instagram não aceitou" in corpo(pg) and "{" not in corpo(pg) and pg.locator("[data-a=agora]").count() == 1)
    pg.click("[data-a=agora]"); pg.wait_for_timeout(700)
    chk("tentar de novo manda reagendar 'agora'", g["post_chamadas"][-1]["path"] == "/post/reagendar" and g["post_chamadas"][-1]["corpo"]["quando"] == "agora")

    print("== Cartão da lista e seleção em massa ==")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelectorAll('#overlay-postagens').forEach(o=>o.classList.remove('aberto'))")
    chk("cada cartão ativo tem o botão 📸 Postar", pg.locator(".produto .btn-postar").count() >= 3)
    pg.locator(".produto details.mais > summary").first.click(); pg.wait_for_timeout(200)
    chk("menu ⋯ aberto não é recortado (cartão deixa de conter o desenho)", pg.evaluate("getComputedStyle(document.querySelector('.produto:has(details.mais[open])')).contentVisibility") == "visible")
    pg.mouse.click(5, 300); pg.wait_for_timeout(200)
    pg.locator(".produto .btn-postar").first.click(); pg.wait_for_timeout(900)
    chk("📸 Postar do cartão abre a aba com a peça já escolhida e a lista", pg.locator("#overlay-postagens.aberto").count() == 1 and "Lista para postar (1)" in corpo(pg) and "O que postar?" in corpo(pg), corpo(pg)[:200])
    pg.evaluate("document.querySelector('#overlay-postagens').classList.remove('aberto')")
    pg.locator(".produto-chk").nth(0).check(); pg.locator(".produto-chk").nth(1).check(); pg.wait_for_timeout(200)
    chk("com peças marcadas aparece 'Enviar para Postagens' na barra", pg.locator("#btn-bulk-postar").is_visible())
    pg.click("#btn-bulk-postar"); pg.wait_for_timeout(900)
    chk("2 peças marcadas viram uma lista de 2", "Lista para postar (2)" in corpo(pg), corpo(pg)[:200])
    chk("a seleção em massa é limpa depois de enviar", pg.locator("#bulk-bar.ativa").count() == 0)
    antes = len(g["posts"])
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
    chk("enviou a 1ª e já passou para a 2ª da lista com as mesmas escolhas", "Próxima da lista" in corpo(pg) and "Lista para postar (1)" in corpo(pg) and len(g["posts"]) == antes + 1, corpo(pg)[:250])
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
    chk("a lista termina e vai para o histórico", len(g["posts"]) == antes + 2 and "Lista para postar" not in corpo(pg))
    axe(pg, "lista de postagem")
    pg.evaluate("document.querySelector('#overlay-postagens').classList.remove('aberto')")

    print("== Recusas do servidor e teclado ==")
    abrir(pg)
    aba(pg, "nova"); pg.fill("#po-busca", "TK-0006"); pg.wait_for_timeout(300); pg.click(".po-peca >> nth=0"); pg.wait_for_timeout(300)
    g["post_recusa"] = "O Instagram não está conectado. Peça ao Admin total para conectar em Conexões."
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(2500)
    chk("recusa do servidor vira aviso vermelho com a frase", "não está conectado" in corpo(pg) and pg.locator(".po-aviso.erro").count() >= 1)
    chk("o aviso não vira JSON", "{" not in corpo(pg))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    chk("Esc fecha a janela", pg.locator("#overlay-postagens.aberto").count() == 0)
    chk("sem erros de JavaScript na página", not erros, erros[:3])
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
