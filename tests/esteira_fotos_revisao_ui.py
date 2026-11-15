"""v7.81.0 — Esteira: revisar as fotos ANTES de adicionar ao produto (ver, enquadrar, girar, capa, ordem, tirar) e desfazer por 8 s.
Servidor da Esteira e de fotos SIMULADOS (tests/esteira_ui.py e tests/esteira_fotos_ui.py). Nada vai ao Google, à Cloudflare nem à mídia.
Celular (320, 390, 412) e computador (1440)."""
import os, re
from pathlib import Path
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).parent
EVID = Path(os.environ.get("TK_EVID", AQUI / "saida" / "esteira-fotos-revisao")); EVID.mkdir(parents=True, exist_ok=True)
_src = (AQUI / "esteira_fotos_ui.py").read_text(encoding="utf-8").split("\nwith sync_playwright() as p:")[0]
_ns = {"__file__": str(AQUI / "esteira_fotos_ui.py"), "__name__": "esteira_fotos_base"}
exec(compile(_src, "esteira_fotos_base", "exec"), _ns)
instalar, fotos_srv, BASE, _png_cor = _ns["instalar"], _ns["fotos_srv"], _ns["BASE"], _ns["_png_cor"]
ok, falhas = 0, []


def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1; print("  ✔ " + nome)
    else: falhas.append(nome); print("  ✘ " + nome + ("" if det is None else " — " + str(det)[:300]))


def shot(pg, nome): pg.screenshot(path=str(EVID / (nome + ".jpg")), type="jpeg", quality=78)
def foto(cor, n): return {"name": f"foto{n}.png", "mimeType": "image/png", "buffer": _png_cor(cor, 64, 80)}
CORES = [(196, 160, 120), (120, 140, 170), (170, 110, 90), (110, 150, 120)]
FOTOS = [foto(c, i) for i, c in enumerate(CORES)]


def entrar(pg):
    pg.fill("#login-w", "88999999999"); pg.fill("#login-s", "senha")
    pg.get_by_role("button", name="Entrar", exact=True).click()


def abrir_fotos(b, w, h):
    ctx = b.new_context(viewport={"width": w, "height": h}, service_workers="block", has_touch=w < 600)
    st = instalar(ctx); f = fotos_srv(ctx, st)
    pg = ctx.new_page(); pg.set_default_timeout(8000); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "esteira.html"); entrar(pg); pg.locator(".peca").first.wait_for()
    pg.click("[data-aba=fotos]"); pg.locator("#fotos-pedidas .pedido-fotos").first.wait_for()
    return ctx, pg, st, f, erros


def revisao(pg): return pg.locator(".folha[aria-label='Revisar fotos']")


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    print("== Revisão: o que a pessoa pode fazer antes de enviar ==")
    ctx, pg, st, f, erros = abrir_fotos(b, 390, 844)
    dialogos = []
    pg.on("dialog", lambda d: (dialogos.append(d.message), d.dismiss()))
    envios = []
    ctx.on("request", lambda r: envios.append(r.url) if "tenkiter-midia" in r.url and r.method == "POST" else None)
    pg.locator("#fotos-pedidas .arq-foto").first.set_input_files(FOTOS[:3])
    revisao(pg).wait_for()
    pg.locator(".rev-card").nth(2).wait_for()
    chk("Escolher as fotos abre a revisão e NÃO envia nada", pg.locator(".rev-card").count() == 3 and f["uploads"] == 0 and not envios, (pg.locator(".rev-card").count(), f["uploads"]))
    pg.wait_for_function("document.querySelector('.rev-atuais summary')")
    chk("Mostra 'Como está hoje' com as fotos que o produto já tem", "Como está hoje" in revisao(pg).inner_text() and pg.locator(".rev-atuais .mini").count() >= 1)
    chk("Mostra o que foi pedido e quantas cabem", "Pedido:" in revisao(pg).inner_text() and "Cabem mais" in revisao(pg).inner_text())
    quadros = pg.evaluate("[...document.querySelectorAll('.rev-quadro')].map(q=>{const r=q.getBoundingClientRect();return r.width/r.height})")
    chk("Cada foto aparece no quadro 4:5 do site", len(quadros) == 3 and all(abs(x - 0.8) < 0.02 for x in quadros), quadros)
    pequenos = pg.evaluate("[...document.querySelectorAll('.folha button')].filter(b=>b.getClientRects().length&&!b.closest('.fundo[hidden]')).map(b=>{const r=b.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height),b.getAttribute('aria-label')||b.textContent]}).filter(x=>x[0]<44||x[1]<44)")
    chk("Todos os botões da revisão têm pelo menos 44 px", not pequenos, pequenos)
    shot(pg, "revisao-390")
    # girar
    antes = pg.evaluate("(()=>{const i=document.querySelector('.rev-card img');return [i.naturalWidth,i.naturalHeight]})()")
    pg.locator(".rev-card").first.get_by_role("button", name=re.compile("Girar")).click()
    pg.wait_for_function("(a)=>{const i=document.querySelector('.rev-card img');return i&&i.complete&&i.naturalWidth===a[1]&&i.naturalHeight===a[0]}", arg=antes)
    chk("Girar 90° troca largura e altura da foto", True)
    # mover
    primeira = pg.locator(".rev-card").first.get_attribute("data-foto")
    pg.locator(".rev-card").first.get_by_role("button", name=re.compile("depois")).click()
    chk("Mover a foto para depois muda a ordem", pg.locator(".rev-card").first.get_attribute("data-foto") != primeira and pg.locator(".rev-card").nth(1).get_attribute("data-foto") == primeira)
    # capa
    pg.locator(".rev-card").nth(1).get_by_role("button", name=re.compile("Tornar capa")).click()
    chk("Tornar capa marca só essa foto", pg.locator(".rev-card.capa").count() == 1 and pg.locator(".rev-card").nth(1).get_attribute("class").count("capa") == 1 and pg.locator(".rev-card").nth(1).get_by_role("button", name=re.compile("É a capa")).get_attribute("aria-pressed") == "true")
    # tirar
    pg.locator(".rev-card").nth(2).get_by_role("button", name=re.compile("Tirar")).click()
    chk("Tirar uma foto atualiza a contagem do botão principal", pg.locator(".rev-card").count() == 2 and pg.locator("#rev-confirmar").inner_text() == "Adicionar 2 fotos")
    # enquadrar (janela já usada no cadastro da Gestão)
    pg.locator(".rev-card").first.get_by_role("button", name=re.compile("Enquadrar")).click()
    pg.locator("#enq-cv").wait_for()
    pg.wait_for_function("(()=>{const b=document.querySelector('#enq-ok');return b&&!b.disabled})()", timeout=6000)
    pg.get_by_role("button", name=re.compile("Usar esta foto")).click()
    pg.wait_for_function("!document.querySelector('#enq-cv')||document.querySelector('#enq-cv').offsetParent===null")
    chk("Enquadrar abre a janela 4:5 e devolve a foto ajustada à revisão", pg.locator(".rev-card").count() == 2 and revisao(pg).is_visible())
    # cancelar com fotos escolhidas pergunta antes
    revisao(pg).get_by_role("button", name="Cancelar").click()
    chk("Cancelar com fotos na lista pergunta antes de descartar (e fica se a pessoa não confirmar)", len(dialogos) == 1 and revisao(pg).is_visible(), dialogos)
    # confirmar e desfazer
    pg.locator("#rev-confirmar").click()
    pg.locator(".tk-aviso button.tk-aviso-desfazer").wait_for()
    chk("Confirmar mostra aviso com Desfazer e ainda não enviou nada", not revisao(pg).count() and f["uploads"] == 0 and not envios)
    shot(pg, "desfazer-390")
    pg.locator(".tk-aviso button.tk-aviso-desfazer").click()
    pg.wait_for_timeout(9500)
    chk("Desfazer cancela: nada é enviado e o botão volta a funcionar", f["uploads"] == 0 and not envios and pg.locator("#fotos-pedidas .add-fotos").first.is_enabled(), f["uploads"])
    ctx.close()

    print("== Confirmar: envia em 8 s, com a capa e a ordem escolhidas ==")
    ctx, pg, st, f, erros = abrir_fotos(b, 390, 844)
    pg.locator("#fotos-pedidas .arq-foto").first.set_input_files(FOTOS[:3])
    revisao(pg).wait_for(); pg.locator(".rev-card").nth(2).wait_for(); pg.wait_for_function("document.querySelector('.rev-atuais summary')")
    pg.locator(".rev-card").nth(1).get_by_role("button", name=re.compile("Tornar capa")).click()
    pg.locator("#rev-confirmar").click(); pg.locator(".tk-aviso button.tk-aviso-desfazer").wait_for()
    pg.wait_for_function("window.__x||true"); pg.wait_for_timeout(1000)
    chk("Antes dos 8 s ainda não enviou", f["uploads"] == 0)
    pg.wait_for_function("1", timeout=1000)
    deadline = 14000
    pg.wait_for_timeout(8500)
    pg.wait_for_function("true")
    for _ in range(40):
        if f["uploads"] >= 3 and st["updates"]: break
        pg.wait_for_timeout(250)
    chk("Passados os 8 s, as 3 fotos sobem uma a uma", f["uploads"] == 3, f["uploads"])
    up = st["updates"][-1] if st["updates"] else {}
    chk("A foto escolhida como capa (a 2ª da lista) vira a capa do produto", up.get("fotoUrlExistente", "").endswith("up002.jpg"), up.get("fotoUrlExistente"))
    chk("As outras entram na galeria, na ordem da revisão", up.get("fotosGaleriaExistentes", "").count("up001.jpg") == 1 and up.get("fotosGaleriaExistentes", "").count("up003.jpg") == 1, up.get("fotosGaleriaExistentes"))
    ctx.close()

    print("== Tela que sai de cena envia na hora (nada se perde) ==")
    ctx, pg, st, f, erros = abrir_fotos(b, 390, 844)
    pg.locator("#fotos-pedidas .arq-foto").first.set_input_files(FOTOS[:2])
    revisao(pg).wait_for(); pg.locator(".rev-card").nth(1).wait_for()
    pg.locator("#rev-confirmar").click(); pg.locator(".tk-aviso button.tk-aviso-desfazer").wait_for()
    pg.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
    for _ in range(40):
        if f["uploads"] >= 2: break
        pg.wait_for_timeout(250)
    chk("Ao ocultar a tela, as fotos entram na fila na hora", f["uploads"] == 2, f["uploads"])
    ctx.close()

    print("== Visual e acessibilidade em 320, 412 e 1440 px ==")
    for w, h in [(320, 844), (412, 915), (1440, 900)]:
        ctx, pg, st, f, erros = abrir_fotos(b, w, h)
        pg.locator("#fotos-pedidas .arq-foto").first.set_input_files(FOTOS[:4])
        revisao(pg).wait_for(); pg.locator(".rev-card").nth(3).wait_for(); pg.wait_for_function("document.querySelector('.rev-atuais summary')")
        pg.wait_for_timeout(300)
        chk(f"{w}: sem rolagem horizontal e botão principal visível na tela", pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1") and pg.evaluate("(()=>{const r=document.querySelector('#rev-confirmar').getBoundingClientRect();return r.bottom<=innerHeight+1&&r.top>=0})()"))
        pg.keyboard.press("Tab")
        chk(f"{w}: o foco fica dentro da janela (Tab)", pg.evaluate("!!document.activeElement.closest('.folha')"))
        shot(pg, f"revisao-{w}")
        chk(f"{w}: sem erro de página", not erros, erros)
        ctx.close()


    print("== Envio para a caixa passa pela mesma revisão ==")
    ctx, pg, st, f, erros = abrir_fotos(b, 390, 844)
    pg.click("text=Enviar fotos para a caixa"); pg.wait_for_selector("#cx-escolher")
    pg.set_input_files("#cx-arq", FOTOS[:3])
    pg.locator(".folha[aria-label='Revisar fotos para a caixa']").wait_for(); pg.locator(".rev-card").nth(2).wait_for(); pg.wait_for_timeout(300)
    r = pg.locator(".folha[aria-label='Revisar fotos para a caixa']")
    chk("Caixa: a revisão abre antes de listar, sem capa nem 'Como está hoje'", pg.locator(".rev-card").count() == 3 and not r.get_by_role("button", name=re.compile("capa")).count() and "Como está hoje" not in r.inner_text() and f["uploads"] == 0)
    chk("Caixa: o botão principal diz 'Usar 3 fotos' e informa quantas cabem no envio", pg.locator("#rev-confirmar").inner_text() == "Usar 3 fotos" and "Cabem mais 17" in r.inner_text(), r.inner_text()[:200])
    shot(pg, "revisao-caixa-390")
    r.locator(".rev-card").first.get_by_role("button", name=re.compile("Girar")).click()
    pg.wait_for_timeout(600)
    r.locator(".rev-card").nth(2).get_by_role("button", name=re.compile("Tirar")).click()
    pg.locator("#rev-confirmar").click()
    pg.wait_for_selector(".folha[aria-label='Revisar fotos para a caixa']", state="detached")
    chk("Caixa: depois de confirmar, as 2 fotos revisadas vão para a lista do envio (ainda nada enviado)", pg.locator(".cx-linha").count() == 2 and f["uploads"] == 0, (pg.locator(".cx-linha").count(), f["uploads"]))
    ctx.close()
    print("== Tarefa de fotos da Preparação usa a mesma revisão ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, service_workers="block", has_touch=True)
    st = instalar(ctx); f = fotos_srv(ctx, st)
    pg = ctx.new_page(); pg.set_default_timeout(8000)
    pg.goto(BASE + "esteira.html"); entrar(pg); pg.locator(".peca").first.wait_for()
    pg.click("[data-aba=prep]"); pg.wait_for_selector(".arq-foto", state="attached")
    pg.locator(".arq-foto").first.set_input_files(FOTOS[:2])
    revisao(pg).wait_for()
    chk("Adicionar fotos numa tarefa também abre a revisão antes de enviar", pg.locator(".rev-card").count() == 2 and f["uploads"] == 0)
    ctx.close()
    b.close()

print(f"{ok} ok, {len(falhas)} falhas")
print("FALHAS=%d" % len(falhas))
if falhas: raise SystemExit(1)
