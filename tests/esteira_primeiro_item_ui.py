"""v7.79.0 — Esteira: primeiro item utilizável em Hoje e em Fotos.
Servidor da Esteira SIMULADO (reaproveita tests/esteira_ui.py e tests/esteira_fotos_ui.py). Nada vai ao Google nem à Cloudflare.

Hoje: /esteira/hoje/primeiros devolve identidade, resumo e os primeiros cartões; a resposta completa (/esteira/hoje) fica RETIDA e só
depois é liberada. Prova que o cartão abre antes, que os nós da tela são reaproveitados, que o botão tocado não se desloca, que a falha
da resposta completa mantém os cartões e oferece nova tentativa, e que sem a rota nova tudo funciona como antes.
Fotos: Caixa e pedidos são blocos independentes na primeira entrada.
Celular (320, 390, 412) e computador (1440)."""
import json, os, re
from pathlib import Path
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).parent
EVID = Path(os.environ.get("TK_EVID", AQUI / "saida" / "esteira-primeiro-item")); EVID.mkdir(parents=True, exist_ok=True)
_src = (AQUI / "esteira_fotos_ui.py").read_text(encoding="utf-8").split("\nwith sync_playwright() as p:")[0]
_ns = {"__file__": str(AQUI / "esteira_fotos_ui.py"), "__name__": "esteira_fotos_base"}
exec(compile(_src, "esteira_fotos_base", "exec"), _ns)
instalar, fotos_srv, BASE = _ns["instalar"], _ns["fotos_srv"], _ns["BASE"]
ok, falhas = 0, []


def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1; print("  ✔ " + nome)
    else: falhas.append(nome); print("  ✘ " + nome + ("" if det is None else " — " + str(det)[:300]))


def shot(pg, nome): pg.screenshot(path=str(EVID / (nome + ".jpg")), type="jpeg", quality=78)


def entrar(pg):
    pg.fill("#login-w", "88999999999"); pg.fill("#login-s", "senha")
    pg.get_by_role("button", name="Entrar", exact=True).click()


def derivar(full, n=2):
    """Resposta de /esteira/hoje/primeiros no mesmo contrato do Worker, a partir da resposta completa do simulado."""
    return {"ok": True, "eu": {"admin": True, "nome": "Iara"}, "acesso": "acesso-teste", "data": full["data"],
            "resumoHoje": {"total": full["total"], "feitas": full["feitas"], "pedidos": full["pedidos"]},
            "pronto": True, "lista": full["lista"][:n], "restantes": len(full["lista"]) - n, "total": full["total"],
            "feitas": full["feitas"], "pecas": full["pecas"], "categoria": full["categoria"]}


def contexto(b, w, h, **kw):
    ctx = b.new_context(viewport={"width": w, "height": h}, service_workers="block", has_touch=w < 600, **kw)
    st = instalar(ctx); fotos_srv(ctx, st)
    return ctx, st


def capturar_completa(b):
    """Faz um login normal e guarda a resposta completa de Hoje para derivar os primeiros cartões."""
    ctx, st = contexto(b, 390, 844)
    pg = ctx.new_page()
    with pg.expect_response(lambda r: r.url.endswith("/esteira/hoje")) as info:
        pg.goto(BASE + "esteira.html"); entrar(pg)
    full = info.value.json(); pg.locator(".peca").first.wait_for(); ctx.close()
    return full


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    full = capturar_completa(b)
    chk("Base: resposta completa de Hoje tem cartões e blocos acima da lista", len(full["lista"]) >= 3 and full["funcoes"] and full["tarefas"])
    clones = [dict(full["lista"][0], id=str(7000 + k), nome=f"Peça de teste {k + 1}", codigo=f"TK-{7000 + k}") for k in range(22)]
    longo = dict(full, lista=full["lista"] + clones, total=full["total"] + 22, pecas=full["pecas"] + 22)

    for w, h in [(320, 844), (390, 844), (412, 915), (1440, 900)]:
        print(f"== Hoje {w}px ==")
        ctx, st = contexto(b, w, h)
        retidas = []
        ctx.route("**/esteira/hoje/primeiros", lambda r: r.fulfill(json=derivar(longo)))
        ctx.route(re.compile(r".*/esteira/hoje$"), lambda r: retidas.append(r))
        pg = ctx.new_page(); pg.set_default_timeout(6000); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(BASE + "esteira.html"); entrar(pg)
        pg.locator(".peca").first.wait_for()
        chk(f"{w}: primeiro cartão aparece com a resposta completa retida", len(retidas) == 1 and pg.locator(".peca").count() == 2, (len(retidas), pg.locator(".peca").count()))
        chk(f"{w}: abas liberadas e o restante é anunciado sem tomar o foco", pg.locator("#abas").is_visible() and "restante da lista" in pg.locator("#hoje-resto").inner_text() and pg.locator("#hoje-resto").get_attribute("role") == "status")
        chk(f"{w}: placeholder de espera some e não há rolagem horizontal", not pg.locator("[data-espera]").count() and pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
        pg.evaluate("()=>{const b=document.querySelector('.peca');b.__marca=1;window.__nos=[...document.querySelectorAll('.peca-linha')]}")
        shot(pg, f"hoje-primeiros-{w}")
        # o cartão é utilizável: abre a conferência antes do restante chegar
        pg.locator(".peca").first.click(); pg.locator(".folha").wait_for()
        chk(f"{w}: conferência abre a partir do primeiro cartão (sem esperar a lista completa)", "Conferir produto" in pg.locator(".folha").inner_text() and len(retidas) == 1)
        pg.keyboard.press("Escape")
        if pg.locator(".folha").count(): pg.locator(".folha .fechar").click()
        topo0 = pg.evaluate("[...document.querySelectorAll('.peca')].find(b=>b.__marca).getBoundingClientRect().top")
        retidas[0].fulfill(json=longo)
        pg.wait_for_function("!document.querySelector('#hoje-resto')")
        pg.locator("#tarefas-hoje, .funcao").first.wait_for()
        chk(f"{w}: o mesmo botão continua na tela (nó reaproveitado, sem recriar)", pg.evaluate("[...document.querySelectorAll('.peca')].some(b=>b.__marca) && window.__nos.every(n=>n.isConnected)"))
        pg.wait_for_timeout(800)
        topo1 = pg.evaluate("[...document.querySelectorAll('.peca')].find(b=>b.__marca).getBoundingClientRect().top")
        rolou = pg.evaluate("scrollY")
        # Sem a compensação o botão desceria a altura dos blocos novos (centenas de px). O resíduo vem de miniaturas que terminam de carregar depois.
        chk(f"{w}: blocos novos entram acima sem deslocar o botão (antes {topo0:.0f}px, depois {topo1:.0f}px, rolagem {rolou:.0f}px)", rolou > 100 and abs(topo1 - topo0) <= 3, (topo0, topo1, rolou))
        chk(f"{w}: lista completa sem repetição e ids únicos", pg.locator(".peca").count() == len(longo["lista"]) and pg.evaluate("(()=>{const ids=[...document.querySelectorAll('#app [id]')].map(e=>e.id);return ids.length===new Set(ids).size})()"))
        shot(pg, f"hoje-completo-{w}")
        chk(f"{w}: sem erro de página", not erros, erros)
        ctx.close()

    print("== Hoje: falha da resposta completa ==")
    ctx, st = contexto(b, 390, 844)
    retidas = []
    ctx.route("**/esteira/hoje/primeiros", lambda r: r.fulfill(json=derivar(full)))
    ctx.route(re.compile(r".*/esteira/hoje$"), lambda r: retidas.append(r))
    pg = ctx.new_page(); pg.set_default_timeout(6000)
    pg.goto(BASE + "esteira.html"); entrar(pg); pg.locator(".peca").first.wait_for()
    retidas[0].fulfill(status=503, json={"ok": False, "erro": "O catálogo não respondeu agora. Tente de novo."})
    pg.wait_for_function("document.querySelector('#hoje-resto')?.innerText.includes('Não consegui carregar o restante')")
    chk("Falha: os primeiros cartões continuam e o aviso fica no fim, com nova tentativa", pg.locator(".peca").count() == 2 and pg.locator("#hoje-resto button").count() == 1 and not pg.locator(".esteira-atualizacao").count())
    shot(pg, "hoje-falha-parcial-390")
    pg.locator("#hoje-resto button").click(); pg.wait_for_timeout(200)
    chk("Falha: tentar de novo refaz a leitura completa", len(retidas) == 2)
    retidas[1].fallback(); pg.wait_for_function("document.querySelectorAll('.peca').length===%d" % len(full["lista"]))
    chk("Falha: depois da nova tentativa a lista completa aparece", not pg.locator("#hoje-resto").count())
    ctx.close()

    print("== Hoje: troca de aba enquanto o restante carrega ==")
    ctx, st = contexto(b, 390, 844)
    retidas = []
    ctx.route("**/esteira/hoje/primeiros", lambda r: r.fulfill(json=derivar(full)))
    ctx.route(re.compile(r".*/esteira/hoje$"), lambda r: retidas.append(r))
    pg = ctx.new_page(); pg.set_default_timeout(6000)
    pg.goto(BASE + "esteira.html"); entrar(pg); pg.locator(".peca").first.wait_for()
    pg.click("[data-aba=pedidos]"); pg.wait_for_selector("text=Pedidos ao fornecedor"); pg.click("[data-aba=hoje]")
    chk("Troca de aba: ao voltar, os primeiros cartões continuam (sem voltar ao 'Montando')", pg.locator(".peca").count() == 2 and "Montando a sua lista" not in pg.inner_text("main"))
    for r in retidas: r.fallback()
    ctx.close()

    print("== Hoje: sem a rota nova ou sem lista pronta ==")
    for nome, resposta in [("rota ausente (Worker anterior)", dict(status=404, json={"ok": False, "erro": "x"})),
                           ("catálogo frio", dict(json={**derivar(full), "pronto": False, "motivo": "sem_catalogo", "lista": []})),
                           ("sem lista do dia", dict(json={"ok": True, "eu": {"admin": True, "nome": "Iara"}, "acesso": "a", "data": full["data"], "resumoHoje": {"total": 0, "feitas": 0, "pedidos": {}}, "pronto": False, "motivo": "sem_lista"}))]:
        ctx, st = contexto(b, 390, 844)
        retidas = []
        ctx.route("**/esteira/hoje/primeiros", lambda r, _q, resposta=resposta: r.fulfill(**resposta))
        ctx.route(re.compile(r".*/esteira/hoje$"), lambda r: retidas.append(r))
        pg = ctx.new_page(); pg.set_default_timeout(6000)
        pg.goto(BASE + "esteira.html"); entrar(pg); pg.locator("#abas").wait_for(); pg.wait_for_timeout(300)
        chk(f"{nome}: as abas abrem e nenhum cartão falso aparece antes da resposta completa", pg.locator("#abas").is_visible() and not pg.locator(".peca").count() and len(retidas) == 1)
        retidas[0].fallback(); pg.locator(".peca").first.wait_for()
        chk(f"{nome}: a resposta completa monta Hoje como antes", pg.locator(".peca").count() == len(full["lista"]))
        ctx.close()


    print("== Medidas anônimas e esqueleto ==")
    ctx, st = contexto(b, 390, 844)
    medidas = []; retidas = []; retidas_p = []
    ctx.route("**/esteira/medida", lambda r, _q: (medidas.append(json.loads(r.request.post_data or "{}")), r.fulfill(json={"ok": True})))
    ctx.route("**/esteira/hoje/primeiros", lambda r, _q: retidas_p.append(r))
    ctx.route(re.compile(r".*/esteira/hoje$"), lambda r: retidas.append(r))
    pg = ctx.new_page(); pg.set_default_timeout(8000)
    pg.goto(BASE + "esteira.html"); entrar(pg)
    pg.locator("[data-espera] .esq i").first.wait_for(state="attached")
    chk("Esqueleto: o texto de espera continua e traz 3 linhas de esqueleto escondidas dos leitores de tela", pg.locator("[data-espera] .esq i").count() == 3 and pg.locator("[data-espera] .esq").get_attribute("aria-hidden") == "true" and "Montando a sua lista" in pg.locator("[data-espera]").inner_text())
    shot(pg, "hoje-esqueleto-390")
    retidas_p[0].fulfill(json=derivar(full)); pg.locator(".peca").first.wait_for()
    retidas[0].fallback(); pg.wait_for_function("!document.querySelector('#hoje-resto')"); pg.wait_for_timeout(3600)
    hoje_m = [m for m in medidas if m.get("aba") == "hoje"]
    chk("Medida: um envio de Hoje, com forma de abertura e tempo até o primeiro cartão", len(hoje_m) == 1 and hoje_m[0]["via"] in ("frio", "retomada") and 0 < hoje_m[0]["item_ms"] < 60000, medidas)
    chk("Medida: só campos permitidos, sem WhatsApp, sessão nem URL", bool(hoje_m) and set(hoje_m[0]) <= {"aba", "via", "item_ms", "util_ms", "rede", "cpu", "mem", "v"} and "88999999999" not in json.dumps(hoje_m[0]) and bool(re.fullmatch(r"[0-9][0-9A-Za-z._-]*", hoje_m[0].get("v", "0"))), hoje_m)
    ctx.close()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, service_workers="block", reduced_motion="reduce")
    st = instalar(ctx); fotos_srv(ctx, st)
    retidas = []
    ctx.route(re.compile(r".*/esteira/hoje$"), lambda r: retidas.append(r))
    ctx.route("**/esteira/hoje/primeiros", lambda r, _q: r.fulfill(status=404, json={"ok": False}))
    pg = ctx.new_page(); pg.set_default_timeout(8000)
    pg.goto(BASE + "esteira.html"); entrar(pg); pg.locator("[data-espera] .esq i").first.wait_for(state="attached")
    chk("Esqueleto: com 'menos movimento' a animação é desligada", pg.evaluate("getComputedStyle(document.querySelector('[data-espera] .esq i')).animationName") == "none")
    for r in retidas: r.fallback()
    ctx.close()
    print("== Fotos: blocos independentes na primeira entrada ==")
    for w, h in [(390, 844), (1440, 900)]:
        ctx, st = contexto(b, w, h)
        retidas = []
        pg = ctx.new_page(); pg.set_default_timeout(6000); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(BASE + "esteira.html"); entrar(pg); pg.locator(".peca").first.wait_for()
        ctx.route(re.compile(r".*/esteira/fotos$"), lambda r: retidas.append(r))
        pg.click("[data-aba=fotos]")
        pg.locator("[data-caixa]").first.wait_for()
        chk(f"{w}: Caixa aparece com os pedidos retidos; ações já utilizáveis", len(retidas) == 1 and pg.get_by_role("button", name="Enviar fotos para a caixa").is_enabled() and pg.get_by_role("button", name="Pedir fotos de um produto").is_enabled())
        chk(f"{w}: pedidos mostram espera própria e a primeira miniatura vem com prioridade", "Carregando os pedidos de fotos" in pg.locator("#fotos-pedidas").inner_text() and pg.evaluate("(()=>{const i=document.querySelector('.cx-item img');return !!i&&i.loading==='eager'})()"))
        shot(pg, f"fotos-caixa-primeiro-{w}")
        retidas[0].fulfill(status=500, json={"ok": False, "erro": "Não consegui abrir os pedidos agora."})
        pg.wait_for_function("document.querySelector('#fotos-pedidas button')")
        chk(f"{w}: falha dos pedidos tem recuperação própria e a Caixa segue intacta", pg.locator("[data-caixa]").count() >= 1 and "Tentar de novo" in pg.locator("#fotos-pedidas").inner_text())
        pg.locator("#fotos-pedidas button").click(); pg.wait_for_timeout(100)
        chk(f"{w}: tentar de novo dos pedidos refaz só a leitura", len(retidas) == 2 or pg.locator("#fotos-pedidas").inner_text().count("Vestido"))
        if len(retidas) >= 2: retidas[1].fallback()
        pg.wait_for_function("document.querySelector('#fotos-pedidas')?.innerText.includes('Vestido Midi Linho')")
        chk(f"{w}: pedidos aparecem sem refazer a Caixa e sem rolagem horizontal", pg.locator("[data-caixa]").count() >= 1 and pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
        shot(pg, f"fotos-completa-{w}")
        chk(f"{w}: sem erro de página", not erros, erros)
        ctx.close()
    b.close()

print(f"{ok} ok, {len(falhas)} falhas")
print("FALHAS=%d" % len(falhas))
if falhas: raise SystemExit(1)
