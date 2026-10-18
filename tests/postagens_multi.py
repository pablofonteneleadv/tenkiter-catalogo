"""Postagens (18/10/2026): várias peças JUNTAS. As fotos de todas aparecem juntas, cada foto leva os dados da SUA peça,
'Fazer em todos' escolhe entre as fotos da mesma peça ou todas, e o Story sai com o grupo/link de cada peça.
Apps Script, Worker e R2 SIMULADOS (mock.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=60000;")
    st = install(ctx, perms=PERMS_ALL, versao="4.3"); st["midia"]["modo"] = "ok"; g = st["ig"]; g["regras"] = True; erros = []
    for q in st["produtos"]:
        i = int(q["Codigo"].split("-")[1]); q["Fotos_Galeria"] = ",".join("https://res.cloudinary.com/z/image/upload/v1/p%dg%d.jpg" % (i, k) for k in (1, 2))
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2400)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
    print("== Escolher várias peças e juntar ==")
    chk("com 1 peça marcada não há 'juntas'", (pg.click(".po-card >> nth=0") or True) and pg.locator("[data-a=usarjuntas]").count() == 0)
    pg.click(".po-card >> nth=1"); pg.click(".po-card >> nth=2"); pg.wait_for_timeout(300)
    chk("com 3 marcadas aparecem as duas saídas: uma por vez e todas juntas", pg.locator("[data-a=usarpecas]").count() == 1 and "3 peças juntas" in pg.inner_text("[data-a=usarjuntas]"), pg.inner_text(".po-barra-sel"))
    nomes = pg.eval_on_selector_all(".po-card[aria-pressed=true] b", "l=>l.map(e=>e.textContent)"); cods = pg.eval_on_selector_all(".po-card[aria-pressed=true] small", "l=>l.map(e=>e.textContent.split(' · ')[0])")
    pg.click("[data-a=usarjuntas]"); pg.wait_for_timeout(900)
    chk("abre o modo 'peças juntas' com as 3 peças e um ✕ em cada", pg.locator(".po-multi [data-mx]").count() == 3 and "3 peças juntas" in pg.inner_text(".po-multi"))
    chk("todas as fotos aparecem juntas na mesma lista (3 peças × 3 fotos)", pg.locator(".po-midias .po-m").count() == 9, pg.locator(".po-midias .po-m").count())
    badges = pg.eval_on_selector_all(".po-midias .po-m .po-c", "l=>l.map(e=>e.textContent)")
    chk("cada foto mostra o código da sua peça", len(badges) == 9 and set(badges) == set(c.strip() for c in cods), (badges, cods))
    pg.click("[data-tipo=story]"); pg.wait_for_timeout(1200)
    chk("por padrão só a capa de cada peça vem marcada (3 Stories)", pg.locator(".po-midias .po-m[aria-pressed=true]").count() == 3)
    chk("a legenda leva os dados das 3 peças", all(c.strip() in pg.input_value("#po-leg") for c in cods), pg.input_value("#po-leg")[:200])
    chk("uma prévia por foto escolhida", pg.locator("#po-previa canvas").count() == 3)

    print("== Cada foto com a informação da sua peça ==")
    pg.evaluate("()=>{const d=document.getElementById('po-det'); if(d) d.open=true}")
    def valor_nome(): return pg.evaluate("(()=>{const e=document.querySelector('[data-tx=nome]');return e?e.value:null})()")
    v0 = valor_nome()
    pg.locator("#po-previa canvas").nth(1).scroll_into_view_if_needed(); pg.locator("#po-previa canvas").nth(1).click(position={"x": 40, "y": 40}); pg.wait_for_timeout(500)
    v1 = valor_nome()
    chk("o campo 'Nome' mostra o nome da peça da foto escolhida", v0 is not None and v1 is not None and v0 != v1 and v0.strip() in [n.strip() for n in nomes] and v1.strip() in [n.strip() for n in nomes], (v0, v1, nomes))

    print("== Fazer em todos: só esta peça × todas ==")
    pg.locator(".po-midias .po-m").nth(1).click(); pg.wait_for_timeout(300)   # 2ª foto da 1ª peça
    chk("agora 4 fotos escolhidas", pg.locator(".po-midias .po-m[aria-pressed=true]").count() == 4)
    pg.evaluate("()=>{const d=document.getElementById('po-det'); if(d) d.open=true}")
    pg.locator("#po-previa canvas").nth(0).scroll_into_view_if_needed(); pg.locator("#po-previa canvas").nth(0).click(position={"x": 40, "y": 40}); pg.wait_for_timeout(400)
    pg.check("[data-a=todos]"); pg.wait_for_timeout(500)
    chk("ligando 'Fazer em todos' aparece a escolha de quais fotos", pg.locator("[data-escopo]").count() == 2 and pg.get_attribute("[data-escopo=peca]", "aria-pressed") == "true")
    pg.evaluate("()=>{const d=document.getElementById('po-det'); if(d) d.open=true}")
    ks = pg.eval_on_selector_all("[data-oc]", "l=>l.map(e=>e.dataset.oc)")
    k1 = ks[0]; k2 = ks[1] if len(ks) > 1 else ks[0]
    def oc(k): return pg.get_attribute("[data-oc=%s]" % k, "aria-pressed")
    pg.click("[data-oc=%s]" % k1); pg.wait_for_timeout(400)
    def ativar(i):
        pg.locator("#po-previa canvas").nth(i).scroll_into_view_if_needed(); pg.locator("#po-previa canvas").nth(i).click(position={"x": 40, "y": 40}); pg.wait_for_timeout(450)
        pg.evaluate("()=>{const d=document.getElementById('po-det'); if(d) d.open=true}")
    ativar(1)   # 2ª foto da mesma peça
    a_mesma = oc(k1)
    ativar(2)   # foto de outra peça
    a_outra = oc(k1)
    chk("escopo 'só as fotos desta peça': vale na outra foto da MESMA peça e NÃO nas outras peças", a_mesma == "true" and a_outra == "false", (a_mesma, a_outra))
    pg.click("[data-escopo=todas]"); pg.wait_for_timeout(500)
    pg.evaluate("()=>{const d=document.getElementById('po-det'); if(d) d.open=true}")
    ativar(0)
    pg.click("[data-oc=%s]" % k2); pg.wait_for_timeout(400)
    ativar(2); a_outra2 = oc(k2)
    chk("escopo 'todas as peças': vale também nas fotos de outras peças", a_outra2 == "true", a_outra2)

    print("== Postar: cada Story leva a sua peça ==")
    pg.click("[data-a=enviar]"); pg.wait_for_timeout(3500)
    c = g["post_chamadas"][-1]["corpo"]; posts = c.get("posts") or []
    grupos = [q.get("grupo") for q in posts]
    chk("saem 4 Stories, um por foto escolhida", len(posts) == 4, len(posts))
    chk("cada Story leva o grupo/produto da SUA peça (3 peças diferentes)", len(set(grupos)) == 3 and set(grupos) == set(c.strip() for c in cods) and [q.get("produto") for q in posts] == grupos, (grupos, cods))
    chk("sem erro de JavaScript", not erros, erros)

    print("== Tirar uma peça ==")
    pg.click("#po-abas [data-aba=nova]"); pg.wait_for_timeout(500)
    pg.click(".po-card >> nth=0"); pg.click(".po-card >> nth=1"); pg.click("[data-a=usarjuntas]"); pg.wait_for_timeout(900)
    chk("2 peças juntas", pg.locator(".po-multi [data-mx]").count() == 2)
    pg.locator(".po-multi [data-mx]").nth(1).click(); pg.wait_for_timeout(600)
    chk("tirando uma sobra só 1: volta ao modo normal de uma peça, só com as fotos dela", pg.locator(".po-multi").count() == 0 and pg.locator(".po-escolhida [data-a=trocar]").count() == 1 and pg.locator(".po-midias .po-m").count() == 3, pg.locator(".po-midias .po-m").count())
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.map(v=>v.id+'x'+v.nodes.length+' '+v.nodes.slice(0,2).map(n=>n.html.slice(0,90)).join('|'))}")
    chk("axe — tela de peças juntas", not r, "; ".join(r))
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
