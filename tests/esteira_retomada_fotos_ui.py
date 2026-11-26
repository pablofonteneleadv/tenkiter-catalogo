"""Retomada de Fotos no Chromium com perfil em disco e APIs simuladas."""
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import sync_playwright

AQUI = Path(__file__).parent
fonte = AQUI / "esteira_fotos_ui.py"
fixtures = {"__file__": str(fonte), "__name__": "esteira_fotos_base"}
exec(compile(fonte.read_text(encoding="utf-8").split("\nwith sync_playwright() as p:")[0],
             str(fonte), "exec"), fixtures)
BASE = fixtures["BASE"]
EVID = Path(os.environ.get("TK_EVID", AQUI / "saida" / "esteira-fluidez" / "fotos-retomada"))
EVID.mkdir(parents=True, exist_ok=True)
VISTAS = [(320, 844), (390, 844), (412, 915), (1440, 900)]
DIA = (datetime.now(timezone.utc) - timedelta(hours=3)).date().isoformat()
ACESSO = "acesso-simulado"
REVOGADO = "Seu acesso não permite entrar na Esteira."
LER = "() => TKEsteiraRetomada().ler(getSessao())"
ATRASAR_IDB = """
ms => {
  const abrir = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function(nome, ...args) {
    const pedido = abrir.call(this, nome, ...args);
    if (nome === 'tk-esteira-retomada-v1') {
      const sucesso = Object.getOwnPropertyDescriptor(IDBOpenDBRequest.prototype, 'onsuccess')
        || Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess');
      Object.defineProperty(pedido, 'onsuccess', {
        set(fn) {
          sucesso.set.call(this, evento => setTimeout(() => {
            performance.mark('teste:idb:aberto');
            fn.call(this, evento);
          }, ms));
        }
      });
    }
    return pedido;
  };
}
"""


def contexto(chromium, perfil, largura, altura, estado, atraso=0):
    mobile = largura < 600
    ctx = chromium.launch_persistent_context(
        perfil, viewport={"width": largura, "height": altura},
        service_workers="block", is_mobile=mobile, has_touch=mobile, args=["--no-sandbox"])
    ctx.route("**/*", lambda r: r.fallback() if r.request.url.startswith(BASE) else r.abort())
    st = fixtures["instalar"](ctx, admin=estado["admin"])
    fotos = fixtures["fotos_srv"](ctx, st, admin=estado["admin"])
    for n in range(105, 128):
        fotos["caixa"].append({**fotos["caixa"][-1], "id": n, "lote": "lt-iara"})
    eu = {"admin": estado["admin"], "gestorFotos": estado["admin"], "nome": "Iara"}

    def esteira(rota):
        req = rota.request
        url = urlsplit(req.url)
        if req.method != "GET":
            if url.path.endswith("/esteira/medida"):   # medida anônima de velocidade (telemetria), não grava dado da Esteira
                return rota.fulfill(json={"ok": True})
            estado["escritas"].append(url.path)
            return rota.abort()
        caminho = url.path.rsplit("/", 1)[-1]
        estado["gets"].append((caminho, url.query))
        sync = dict(ok=True, eu=eu, acesso=ACESSO, data=DIA, revisao=estado["rev"])
        dados = dict(ok=True, acesso=ACESSO, diaRevisao=DIA, revisao=estado["rev"])
        if caminho == "sincronizar":
            if estado["reter_sync"]:
                estado["retidas"].append(rota)
                return
            return rota.fulfill(json=sync)
        if caminho == "menu":
            return rota.fulfill(json=sync)
        if caminho == "fotos":
            if estado["reter_fotos"]:
                estado["retidas"].append(rota)
                return
            return pedidos_fotos(rota, dados)
        if caminho == "caixa":
            if estado["reter_caixa"]:
                estado["retidas"].append(rota)
                return
            return caixa(rota, dados)
        return rota.fallback()

    def pedidos_fotos(rota, dados=None):
        dados = dados or dict(ok=True, acesso=ACESSO, diaRevisao=DIA, revisao=estado["rev"])
        pedidos = fotos["pedidos"]
        if estado["rev"] == "r2":
            pedidos[0]["nome"] = "Vestido atualizado"
        return rota.fulfill(json={**dados, "eu": eu, "pedidos": pedidos,
                                  "caixaNovas": len(fotos["caixa"]),
                                  "volumeTeste": estado["volume"], "token": "remover-teste",
                                  "arquivoLocal": "blob:remover-teste"})

    def caixa(rota, dados=None):
        query = parse_qs(urlsplit(rota.request.url).query)
        ver = query.get("ver", ["novas"])[0]
        antes = int(query.get("antes", ["999"])[0])
        lista = sorted((x for x in fotos["caixa"] if x["id"] < antes
                        and (estado["admin"] or x["minha"])), key=lambda x: -x["id"])
        if ver != "novas":
            lista = []
        if estado["rev"] == "r2" and lista:
            lista[0] = {**lista[0], "descricao": "Foto atualizada na caixa"}
        return rota.fulfill(json={
            **(dados or dict(ok=True, acesso=ACESSO, diaRevisao=DIA, revisao=estado["rev"])),
            "gestor": estado["admin"], "ver": ver, "contagem": {"novas": len(fotos["caixa"])},
            "itens": lista[:24], "proximo": lista[23]["id"] if len(lista) > 24 else None,
        })

    ctx.route("**/esteira/**", esteira)
    pg = ctx.pages[0]
    pg.set_default_timeout(10000)
    pg.on("pageerror", lambda e: estado["erros"].append(str(e)))
    if atraso:
        pg.add_init_script(f"({ATRASAR_IDB})({atraso})")
    return ctx, pg, caixa, pedidos_fotos


def novo_estado(admin=True, volume=""):
    return dict(admin=admin, rev="r1", volume=volume, reter_caixa=False, reter_fotos=False, reter_sync=False,
                retidas=[], gets=[], escritas=[], erros=[])


def login(pg):
    pg.goto(BASE + "esteira.html")
    pg.fill("#login-w", "88999999999")
    pg.fill("#login-s", "senha")
    pg.locator("#login-s").press("Enter")
    pg.locator(".peca").first.wait_for()


def acionar(locator, mobile):
    if mobile:
        locator.tap()
    else:
        locator.focus()
        locator.press("Enter")


def esperar_rota(pg, estado):
    for _ in range(100):
        if estado["retidas"]:
            return estado["retidas"].pop(0)
        pg.wait_for_timeout(50)
    raise AssertionError(estado["gets"])


def esperar_snapshot(pg, condicao):
    for _ in range(70):
        if pg.evaluate(f"async () => {{ const salvo = await ({LER})(); return {condicao}; }}"):
            return
        pg.wait_for_timeout(50)
    raise AssertionError("Snapshot não atingiu o estado esperado: " + condicao)


def foto_gets(estado):
    return [nome for nome, _ in estado["gets"] if nome in ("fotos", "caixa")]


def capturar(pg, nome):
    assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    pg.screenshot(path=str(EVID / (nome + ".jpg")), type="jpeg", quality=82)


def jornada(chromium, largura, altura):
    mobile = largura < 600
    with TemporaryDirectory() as perfil:
        estado = novo_estado(volume="é" * 260_000)
        estado["reter_caixa"] = True
        estado["reter_fotos"] = True
        ctx, pg, caixa, pedidos_fotos = contexto(chromium, perfil, largura, altura, estado)
        login(pg)
        if largura == 390:
            capturar(pg, f"hoje-{largura}")
        acionar(pg.locator("[data-aba=fotos]"), mobile)
        retidas = [esperar_rota(pg, estado), esperar_rota(pg, estado)]
        por_rota = {urlsplit(r.request.url).path: r for r in retidas}
        assert set(por_rota) == {"/esteira/fotos", "/esteira/caixa"}
        # v7.79.0: na primeira entrada as ações aparecem já; pedidos e Caixa chegam cada um no seu tempo.
        assert pg.locator("#fotos-topo").is_visible()
        assert pg.locator("#fotos-pedidas").inner_text().count("Carregando os pedidos de fotos")
        assert not pg.locator("[data-caixa]").count()
        estado["reter_fotos"] = False
        pedidos_fotos(por_rota["/esteira/fotos"])
        pg.wait_for_function("!document.querySelector('#fotos-pedidas')?.innerText.includes('Carregando os pedidos')")
        pg.wait_for_timeout(360)
        assert (pg.evaluate(LER) or {}).get("aba") != "fotos"
        estado["reter_caixa"] = False
        caixa(por_rota["/esteira/caixa"])
        pg.locator('[data-caixa="127"]').wait_for()
        capturar(pg, f"fotos-{largura}")
        acionar(pg.get_by_role("button", name="Carregar mais fotos"), mobile)
        acionar(pg.locator('[data-caixa="101"] .cx-sel'), mobile)
        esperar_snapshot(pg, "salvo?.caixaPaginas === 2 && salvo.selecao.includes(101)")
        salvo = pg.evaluate(LER)
        assert len(salvo["leituras"]) == 3
        assert "remover-teste" not in json.dumps(salvo)
        assert len(json.dumps(salvo, ensure_ascii=False).encode()) > 450_000
        pg.locator('[data-caixa="101"]').scroll_into_view_if_needed()
        capturar(pg, f"caixa-{largura}")
        esperar_snapshot(pg, "salvo?.rolagem === Math.round(scrollY) && salvo.selecao.includes(101)")
        pos = pg.evaluate("Math.round(scrollY)")
        ctx.close()
        estado["gets"].clear()
        estado["reter_sync"] = True
        ctx, pg, _, _ = contexto(chromium, perfil, largura, altura, estado, atraso=1800)
        pg.goto(BASE + "esteira.html", wait_until="domcontentloaded")
        sync = esperar_rota(pg, estado)
        assert urlsplit(sync.request.url).query == "aba=fotos"
        assert not pg.locator("[data-caixa], #fotos-pedidas").count()
        assert not pg.evaluate("performance.getEntriesByName('teste:idb:aberto').length")
        sync.fulfill(json={"ok": True, "eu": {"admin": True, "gestorFotos": True, "nome": "Iara"},
                           "acesso": ACESSO, "data": DIA, "revisao": "r1"})
        pg.locator('[data-caixa="101"] .cx-sel[aria-pressed=true]').wait_for()
        assert abs(pg.evaluate("scrollY") - pos) < 3
        assert estado["gets"] == [("sincronizar", "aba=fotos")], estado["gets"]
        util = pg.evaluate("performance.getEntriesByName('esteira:fotos:retomada')[0].startTime")
        print(f"{largura}px: retomada em {util:.0f} ms, GETs completos=0", flush=True)
        capturar(pg, f"retomada-{largura}")
        acionar(pg.locator("[data-aba=hoje]"), mobile)
        pg.locator("main[data-tela=hoje] .peca").first.wait_for()
        acionar(pg.locator("[data-aba=fotos]"), mobile)
        pg.locator('[data-caixa="101"] .cx-sel[aria-pressed=true]').wait_for()
        pg.wait_for_timeout(300)
        assert not foto_gets(estado), estado["gets"]
        capturar(pg, f"troca-apos-retomada-{largura}")
        if largura == 390:
            acionar(pg.get_by_role("button", name="Atualizar fotos", exact=True), mobile)
            for _ in range(30):
                if len(foto_gets(estado)) >= 2:
                    break
                pg.wait_for_timeout(50)
            assert sorted(foto_gets(estado)) == ["caixa", "fotos"], estado["gets"]
            assert pg.locator('[data-caixa="101"] .cx-sel[aria-pressed=true]').is_visible()
        assert not estado["escritas"] and not estado["erros"], estado
        ctx.close()

        if largura != 390:
            return

        estado["gets"].clear()
        ctx, pg, _, _ = contexto(chromium, perfil, largura, altura, estado)
        pg.goto(BASE + "esteira.html", wait_until="domcontentloaded")
        esperar_rota(pg, estado).fulfill(json={
            "ok": True, "eu": {"admin": True, "gestorFotos": True, "nome": "Iara"},
            "acesso": ACESSO, "data": DIA, "revisao": "r2",
        })
        pg.get_by_text("Há fotos novas ou alteradas.", exact=False).wait_for()
        assert pg.locator('[data-caixa="101"] .cx-sel[aria-pressed=true]').is_visible()
        assert not foto_gets(estado)
        ctx.close()

        estado["gets"].clear()
        ctx, pg, _, _ = contexto(chromium, perfil, largura, altura, estado)
        pg.goto(BASE + "esteira.html", wait_until="domcontentloaded")
        negado = esperar_rota(pg, estado)
        negado.fulfill(status=403, json={"ok": False, "acessoRevogado": True, "erro": REVOGADO})
        pg.locator("#login-w").wait_for()
        assert not pg.locator("#fotos-pedidas, #caixa").count()
        assert not foto_gets(estado)
        esperar_snapshot(pg, "salvo === null")
        capturar(pg, "acesso-revogado-390")
        assert not estado["escritas"] and not estado["erros"], estado
        ctx.close()


def copia_legada_da_equipe(chromium):
    with TemporaryDirectory() as perfil:
        estado = novo_estado(admin=False)
        ctx, pg, _, _ = contexto(chromium, perfil, 390, 844, estado)
        login(pg)
        acionar(pg.locator("[data-aba=fotos]"), True)
        pg.locator("[data-caixa]").first.wait_for()
        esperar_snapshot(pg, "salvo?.aba === 'fotos'")
        pg.goto(BASE + "404.html")
        pg.add_script_tag(url=BASE + "esteira-fluidez.js")
        pg.evaluate("""async () => {
          const cache = TKEsteiraRetomada(), sessao = getSessao();
          const salvo = await cache.ler(sessao);
          salvo.leituras = salvo.leituras.map(([rota, dados]) => [rota.replace('&ver=novas', ''), dados]);
          await cache.gravar(sessao, salvo, () => true);
        }""")
        assert any(rota == "/esteira/caixa?pagina=1" for rota, _ in pg.evaluate(LER)["leituras"])
        ctx.close()

        estado["gets"].clear()
        ctx, pg, _, _ = contexto(chromium, perfil, 390, 844, estado)
        pg.goto(BASE + "esteira.html")
        pg.locator("[data-caixa]").first.wait_for()
        assert pg.get_by_role("heading", name="Suas fotos enviadas").is_visible()
        assert not pg.locator('[data-caixa="101"]').count()
        assert estado["gets"] == [("sincronizar", "aba=fotos")], estado["gets"]
        assert not estado["escritas"] and not estado["erros"], estado
        ctx.close()


def sessao_expirada_durante_leituras(chromium):
    with TemporaryDirectory() as perfil:
        estado = novo_estado()
        estado["reter_fotos"] = estado["reter_caixa"] = True
        ctx, pg, _, pedidos_fotos = contexto(chromium, perfil, 390, 844, estado)
        login(pg)
        acionar(pg.locator("[data-aba=fotos]"), True)
        retidas = [esperar_rota(pg, estado), esperar_rota(pg, estado)]
        por_rota = {urlsplit(r.request.url).path: r for r in retidas}
        por_rota["/esteira/caixa"].fulfill(status=401, json={"ok": False, "erro": "Sessão expirada."})
        pg.locator("#login-w").wait_for()
        pedidos_fotos(por_rota["/esteira/fotos"])
        pg.wait_for_timeout(350)
        assert not pg.locator("#fotos-pedidas, #caixa").count()
        esperar_snapshot(pg, "salvo === null")
        assert not estado["escritas"] and not estado["erros"], estado
        ctx.close()


def limites_e_revisao(chromium):
    for volume, admin, perdida in [("", False, False), ("é" * 1_010_000, True, False), ("", True, True)]:
        with TemporaryDirectory() as perfil:
            estado = novo_estado(admin=admin, volume=volume)
            ctx, pg, _, _ = contexto(chromium, perfil, 390, 844, estado)
            login(pg)
            assert foto_gets(estado) == []
            acionar(pg.locator("[data-aba=fotos]"), True)
            pg.locator("[data-caixa]").first.wait_for()
            if not admin:
                assert pg.get_by_role("heading", name="Suas fotos enviadas").is_visible()
                assert not pg.locator('[data-caixa="101"]').count()
            esperar_snapshot(pg, "salvo?.aba === 'fotos'")
            salvo = pg.evaluate(LER)
            assert bool(salvo["leituras"]) == (not volume)
            assert not volume or len(json.dumps(salvo).encode()) < 4096
            if perdida:
                # A dica de aba é útil mesmo quando o registro foi perdido.
                pg.goto(BASE + "404.html")
                pg.evaluate("""() => new Promise((resolve, reject) => {
                  const req = indexedDB.open('tk-esteira-retomada-v1', 1);
                  req.onerror = () => reject(req.error);
                  req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction('telas', 'readwrite');
                    tx.objectStore('telas').clear();
                    tx.oncomplete = () => { db.close(); resolve(); };
                    tx.onerror = () => reject(tx.error);
                  };
                })""")
                assert pg.evaluate("localStorage.getItem('tk-esteira-ultima-aba-v1')")
            ctx.close()

            estado["rev"] = "r2"
            estado["gets"].clear()
            ctx, pg, _, _ = contexto(chromium, perfil, 390, 844, estado)
            pg.goto(BASE + "esteira.html")
            pg.get_by_text("Vestido atualizado", exact=True).wait_for()
            pg.get_by_text("Foto atualizada na caixa", exact=True).wait_for()
            assert sorted(foto_gets(estado)) == ["caixa", "fotos"], estado["gets"]
            assert estado["gets"][0] == ("sincronizar", "aba=fotos")
            print(f"Fallback de Fotos: {('registro ausente' if perdida else 'acima de 2 MB' if volume else 'revisão alterada da equipe')}, 2 GETs completos",
                  flush=True)
            assert not estado["escritas"] and not estado["erros"], estado
            ctx.close()


def navegar_enquanto_o_cache_abre(chromium, largura, altura):
    mobile = largura < 600
    with TemporaryDirectory() as perfil:
        estado = novo_estado(admin=largura != 412)
        ctx, pg, _, _ = contexto(chromium, perfil, largura, altura, estado)
        login(pg)
        acionar(pg.locator("[data-aba=fotos]"), mobile)
        pg.locator("[data-caixa]").first.wait_for()
        esperar_snapshot(pg, "salvo?.aba === 'fotos' && salvo.leituras.length === 2")
        ctx.close()

        estado["gets"].clear()
        estado["reter_sync"] = True
        ctx, pg, _, _ = contexto(chromium, perfil, largura, altura, estado, atraso=2600)
        pg.goto(BASE + "esteira.html", wait_until="domcontentloaded")
        sync = esperar_rota(pg, estado)
        assert not pg.locator("[data-aba=pedidos]").is_visible()
        assert not pg.locator("[data-caixa], #fotos-pedidas").count()
        sync.fulfill(json={
            "ok": True, "eu": {"admin": estado["admin"], "gestorFotos": estado["admin"], "nome": "Iara"},
            "acesso": ACESSO, "data": DIA, "revisao": "r1",
        })
        pg.locator("[data-aba=pedidos]").wait_for()
        assert not pg.evaluate("performance.getEntriesByName('teste:idb:aberto').length")
        assert pg.locator("[data-aba=fotos]").get_attribute("aria-selected") == "true"
        assert pg.locator("[data-aba=config]").count() == int(estado["admin"])
        assert pg.get_by_text("Carregando a aba…", exact=True).is_visible()
        capturar(pg, f"abas-antes-do-cache-{largura}")
        acionar(pg.locator("[data-aba=fotos]"), mobile)
        acionar(pg.locator("[data-aba=pedidos]"), mobile)
        pg.locator("main[data-tela=pedidos] h2").first.wait_for()
        assert not pg.evaluate("performance.getEntriesByName('teste:idb:aberto').length")
        pg.wait_for_function("performance.getEntriesByName('teste:idb:aberto').length > 0")
        pg.wait_for_timeout(260)
        assert pg.locator("[data-aba=pedidos]").get_attribute("aria-selected") == "true"
        assert pg.locator("main[data-tela=pedidos] h2").first.is_visible()
        assert estado["gets"] == [("sincronizar", "aba=fotos"), ("pedidos", "")], estado["gets"]
        assert not estado["escritas"] and not estado["erros"], estado
        capturar(pg, f"pedidos-durante-retomada-{largura}")
        ctx.close()


with sync_playwright() as p:
    for largura, altura in VISTAS:
        jornada(p.chromium, largura, altura)
        navegar_enquanto_o_cache_abre(p.chromium, largura, altura)
    limites_e_revisao(p.chromium)
    copia_legada_da_equipe(p.chromium)
    sessao_expirada_durante_leituras(p.chromium)
print("PASS retomada de Fotos e Caixa")
