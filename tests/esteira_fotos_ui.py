"""v7.52.0 — Esteira: pedir fotos com opções prontas, cartão só de fotos, caixa de fotos da equipe e Preparação sem instruções.
Jornada em esteira.html (e o cadastro da Gestão aberto com as fotos da caixa) com catálogo, login, servidor da Esteira e servidor de
fotos SIMULADOS. Nada vai ao Google, à Cloudflare nem ao servidor de mídia. Celular (390) e computador (1440).
Evidências .jpg em tests/saida/esteira-fotos/ (TK_EVID=docs/ux/esteira-fotos-20261103 gera as do PR)."""
import json, os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).parent
EVID = Path(os.environ.get("TK_EVID", AQUI / "saida" / "esteira-fotos")); EVID.mkdir(parents=True, exist_ok=True)
# reaproveita o servidor simulado da Esteira (catálogo, login, conferência, preparação) de tests/esteira_ui.py, sem rodar a jornada dele
_src = (AQUI / "esteira_ui.py").read_text(encoding="utf-8").split("\nwith sync_playwright() as p:")[0]
_ns = {"__file__": str(AQUI / "esteira_ui.py"), "__name__": "esteira_base"}
exec(compile(_src, "esteira_ui_base", "exec"), _ns)
instalar, BASE, PNG, _png_cor = _ns["instalar"], _ns["BASE"], _ns["PNG"], _ns["_png_cor"]
ok, falhas = 0, []
def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1; print("  ✔ " + nome)
    else: falhas.append(nome); print("  ✘ " + nome + ("" if det is None else " — " + str(det)[:400]))
def foto_png(cor): return {"name": "foto%d.png" % sum(cor), "mimeType": "image/png", "buffer": _png_cor(cor, 64, 80)}
def shot(pg, nome, full=False): pg.screenshot(path=str(EVID / (nome + ".jpg")), type="jpeg", quality=78, full_page=full)
SEM_ROLAGEM = "document.documentElement.scrollWidth <= innerWidth"
ALVOS = "(sel)=>[...document.querySelectorAll(sel)].filter(b=>b.getClientRects().length && getComputedStyle(b).visibility!=='hidden').map(b=>{const r=b.getBoundingClientRect();return [Math.round(Math.min(r.width,r.height)*10)/10,(b.textContent||b.getAttribute('aria-label')||'').trim().slice(0,30)]})"
def alvos_ok(pg, sel):
    v = pg.evaluate(ALVOS, sel); ruins = [x for x in v if x[0] < 43.5]; return not ruins, ruins
M = "https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202611/"

def fotos_srv(ctx, st, admin=True):
    """Rotas novas (/esteira/fotos*, /esteira/caixa*) e o servidor de fotos; o resto cai no simulado de esteira_ui.py."""
    f = {"pedidos": [{"produto": "1001", "nome": "Vestido Midi Linho", "codigo": "TK-1001", "foto": M.replace("202611/", "") + "x.jpg", "noSite": True, "itens": [
            {"id": 51, "rotulos": ["No pano", "No manequim"], "obs": "luz natural", "texto": "", "por": "Pablo", "em": "2026-11-02T10:00:00Z"},
            {"id": 52, "rotulos": ["Outro: foto das costas"], "obs": "", "texto": "", "por": "Iara", "em": "2026-11-03T09:00:00Z"}]}],
         "pedir": [], "concluir": [], "enviar": [], "usar": [], "descartar": [], "uploads": 0, "falhar_upload": [], "seq": 200,
         "caixa": [
            {"id": 101, "url": M + "bia1.jpg", "descricao": "vestido azul no manequim", "descricaoLote": "Vestidos que chegaram hoje", "lote": "lt-bia", "produto": "", "produtoNome": "", "por": "Bia", "minha": False, "em": "2026-11-03T08:10:00Z", "status": "nova", "repetidaDe": None},
            {"id": 102, "url": M + "bia2.jpg", "descricao": "", "descricaoLote": "Vestidos que chegaram hoje", "lote": "lt-bia", "produto": "", "produtoNome": "", "por": "Bia", "minha": False, "em": "2026-11-03T08:10:00Z", "status": "nova", "repetidaDe": None},
            {"id": 103, "url": M + "bia3.jpg", "descricao": "", "descricaoLote": "Vestidos que chegaram hoje", "lote": "lt-bia", "produto": "", "produtoNome": "", "por": "Bia", "minha": False, "em": "2026-11-03T08:10:00Z", "status": "nova", "repetidaDe": {"id": 90, "em": "2026-11-01T10:00:00Z", "por": "Clarice"}},
            {"id": 104, "url": M + "iara1.jpg", "descricao": "costas do floral", "descricaoLote": "", "lote": "lt-iara", "produto": "1002", "produtoNome": "Vestido Longo Floral", "por": "Iara", "minha": True, "em": "2026-11-03T09:30:00Z", "status": "nova", "repetidaDe": None}]}
    st["f"] = f
    def item_saida(i): return dict({"usoProduto": "", "usoNome": "", "usadaPor": "", "usadaEm": ""}, **i)
    def hd(route):
        req = route.request; u = req.url
        if "tenkiter-midia" in u and req.method == "POST":
            f["uploads"] += 1
            if f["uploads"] in f["falhar_upload"]: return route.fulfill(status=503, json={"ok": False, "erro": "O servidor de fotos está ocupado. Tente de novo."})
            return route.fulfill(json={"ok": True, "url": M + "up%03d.jpg" % f["uploads"], "tipo": "foto"})
        if "tenkiter-ig" not in u: return route.fallback()
        path = re.sub(r"^https://[^/]+", "", u).split("?")[0]
        b = json.loads(req.post_data or "{}") if req.method == "POST" else {}
        J = lambda d, s=200: route.fulfill(status=s, json=d)
        eu = {"whats": "88999999999", "nome": "Iara", "admin": admin, "membro": True, "confere": True, "aceitar": admin, "gestorFotos": admin}
        if path == "/esteira/fotos": return J({"ok": True, "eu": eu, "pedidos": f["pedidos"], "caixaNovas": sum(1 for i in f["caixa"] if i["status"] == "nova") if admin else 0})
        if path == "/esteira/fotos/pedir":
            f["pedir"].append(b)
            if not b.get("opcoes") and not b.get("outro"): return J({"ok": False, "erro": "Escolha como quer as fotos."}, 400)
            x = next(p for p in _ns_todos() if p["ID"] == b["produto"])
            rot = [{"pano": "No pano", "manequim": "No manequim", "cores": "Das outras cores/estampas"}[k] for k in b.get("opcoes", [])] + (["Outro: " + b["outro"]] if b.get("outro") else [])
            f["seq"] += 1; g = next((g for g in f["pedidos"] if g["produto"] == b["produto"]), None)
            if not g: g = {"produto": b["produto"], "nome": x["Nome"], "codigo": x["Codigo"], "foto": x["Foto_URL"], "noSite": x["Status"] == "Ativo", "itens": []}; f["pedidos"].append(g)
            g["itens"].append({"id": f["seq"], "rotulos": rot, "obs": b.get("obs", ""), "texto": "", "por": "Iara", "em": "2026-11-03T12:00:00Z"})
            return J({"ok": True, "id": f["seq"], "repetido": False})
        if path == "/esteira/fotos/concluir":
            f["concluir"].append(b); ids = set(b.get("ids", [])); st["feitas"].extend(ids)
            for g in f["pedidos"]: g["itens"] = [i for i in g["itens"] if i["id"] not in ids]
            f["pedidos"] = [g for g in f["pedidos"] if g["itens"]]
            return J({"ok": True, "concluidos": len(ids)})
        if path == "/esteira/caixa/enviar":
            f["enviar"].append(b); out = []
            for it in b["itens"]:
                ja = next((i for i in f["caixa"] if i.get("op") == it["op"]), None)
                if not ja:
                    f["seq"] += 1; ja = {"id": f["seq"], "op": it["op"], "url": it["url"], "descricao": it.get("descricao", ""), "descricaoLote": b.get("descricaoLote", ""), "lote": b["lote"], "produto": b.get("produto", ""), "produtoNome": b.get("produtoNome", ""), "por": "Iara", "minha": True, "em": "2026-11-03T12:30:00Z", "status": "nova", "repetidaDe": None}
                    f["caixa"].insert(0, ja)
                out.append(item_saida(ja))
            return J({"ok": True, "itens": out})
        if path == "/esteira/caixa":
            ver = (re.search(r"ver=(\w+)", u) or [None, "novas"])[1]
            if not admin: its = [i for i in f["caixa"] if i["minha"]]
            else: its = [i for i in f["caixa"] if (i["status"] in ("nova", "cadastro") if ver == "novas" else i["status"] == ("usada" if ver == "usadas" else "descartada"))]
            base_ = f["caixa"] if admin else [i for i in f["caixa"] if i["minha"]]
            cont = {"novas": sum(1 for i in base_ if i["status"] in ("nova", "cadastro")), "usadas": sum(1 for i in base_ if i["status"] == "usada"), "descartadas": sum(1 for i in base_ if i["status"] == "descartada")}
            return J({"ok": True, "gestor": admin, "ver": ver if admin else "minhas", "contagem": cont, "itens": [item_saida(i) for i in its]})
        if path.startswith("/esteira/caixa/") and not admin: return J({"ok": False, "erro": "Só o administrador total e quem cadastra peças usam as fotos recebidas."}, 403)
        if path == "/esteira/caixa/usar":
            f["usar"].append(b); n = 0
            for i in f["caixa"]:
                if i["id"] in b["ids"]:
                    if b["uso"] == "cadastro" and i["status"] in ("nova", "cadastro"): i.update(status="cadastro", usadaPor="Iara", usadaEm="2026-11-03T13:00:00Z"); n += 1
                    elif b["uso"] != "cadastro" and i["status"] != "usada": i.update(status="usada", usoProduto=b["produto"], usoNome=b.get("produtoNome", ""), usadaPor="Iara", usadaEm="2026-11-03T13:00:00Z"); n += 1
            return J({"ok": True, "marcadas": n})
        if path == "/esteira/caixa/descartar":
            f["descartar"].append(b); n = 0
            for i in f["caixa"]:
                if i["id"] in b["ids"]:
                    if b.get("desfazer") and i["status"] in ("descartada", "cadastro"): i["status"] = "nova"; n += 1
                    elif not b.get("desfazer") and i["status"] in ("nova", "cadastro"): i.update(status="descartada", usadaPor="Iara", usadaEm="2026-11-03T13:00:00Z"); n += 1
            return J({"ok": True, "marcadas": n})
        return route.fallback()
    ctx.route("**/*", hd)
    return f

_TODOS = []
def _ns_todos(): return _TODOS

def entrar(pg):
    pg.goto(BASE + "esteira.html"); pg.wait_for_selector("#login-w", timeout=8000)
    pg.fill("#login-w", "88999999999"); pg.fill("#login-s", "senha"); pg.click("text=Entrar >> nth=-1"); pg.wait_for_selector(".peca", timeout=8000)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for w, h in [(390, 844), (1440, 900)]:
        print(f"== Esteira {w}px (gestor) ==")
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600)
        st = instalar(ctx)
        _TODOS[:] = _ns["PRODUTOS"] + [_ns["ARQUIVADA"], _ns["ARQUIVADA2"]]
        st["outras"].append(dict(id=61, produto="1003", tipo="foto", titulo="Fotos pedidas", funcao="Fotos", origem="pedido_fotos", instrucao="No manequim", rotulos=["No manequim"], pedidoObs="mostrar o caimento", por="Pablo", criada_em="2026-11-02T12:00:00Z", produtoNome="Saia Plissada Midi", produtoCodigo="TK-1003", produtoFoto="", noSite=True))
        f = fotos_srv(ctx, st)
        pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
        entrar(pg)
        # ---- 1. pedido de fotos na conferência ----
        pg.locator('.peca[data-produto="1001"]').click(); pg.wait_for_selector(".folha", timeout=4000)
        chk(f"{w}: conferência oferece 'Pedir fotos' e as opções só aparecem ao tocar", pg.is_visible("#conf-pedir-fotos") and not pg.is_visible('[data-escolha="conf"]'))
        pg.click("#conf-pedir-fotos")
        ops = pg.locator('[data-escolha="conf"] .opc-fotos button').all_inner_texts()
        chk(f"{w}: opções prontas para tocar (no pano, no manequim, outras cores/estampas, outro)", ops == ["No pano", "No manequim", "Das outras cores/estampas", "Outro (escrever)"], ops)
        pg.click("text=Salvar conferência"); pg.wait_for_timeout(200)
        chk(f"{w}: sem escolher nada, avisa em português e não salva", "Escolha como quer as fotos" in pg.inner_text(".folha") and not st.get("conf_corpos"))
        pg.click('[data-escolha="conf"] button[data-opcao="pano"]'); pg.click('[data-escolha="conf"] button[data-opcao="outro"]')
        chk(f"{w}: 'Outro (escrever)' abre o campo de texto", pg.is_visible("#conf-outro"))
        pg.click("text=Salvar conferência"); pg.wait_for_timeout(200)
        chk(f"{w}: 'Outro' sem texto pede para escrever", "Escreva em “Outro”" in pg.inner_text(".folha") and not st.get("conf_corpos"))
        pg.fill("#conf-outro", "foto das costas"); pg.fill("#conf-obs", "com luz natural")
        pg.locator("#conf-obs").scroll_into_view_if_needed(); shot(pg, f"conferir-pedir-fotos-{w}")
        ok_t, ruins = alvos_ok(pg, ".folha button")
        chk(f"{w}: botões da conferência com pelo menos 44 px", ok_t, ruins)
        pg.click("text=Salvar conferência"); pg.wait_for_selector(".folha", state="detached", timeout=6000)
        cb = st["conf_corpos"][-1]
        chk(f"{w}: conferência leva o pedido com as opções, o 'Outro' e a observação", cb.get("fotoNova") is True and cb.get("pedidoFotos") == {"opcoes": ["pano"], "querOutro": True, "outro": "foto das costas", "obs": "com luz natural"}, cb)
        # ---- tarefa só de fotos no Hoje ----
        ch = pg.locator("#fotos-pedidas-hoje .pedido-fotos")
        chk(f"{w}: Hoje mostra 'Fotos pedidas' num cartão só de fotos (sem checklist da preparação)", ch.count() == 1 and "No manequim" in ch.inner_text() and "mostrar o caimento" in ch.inner_text() and "Pedido por Pablo em 02/11/26" in ch.inner_text() and ch.locator(".tarefa").count() == 0, ch.inner_text() if ch.count() else "")
        chk(f"{w}: cartão tem Adicionar fotos, Feito, Ver no site e Editar no cadastro", ch.locator("button.add-fotos").count() == 1 and ch.locator("button.feito-fotos").count() == 1 and "p/TK-1003" in (ch.locator("a.ver-site").get_attribute("href") or "") and ch.locator("a.editar-cadastro").get_attribute("href") == "admin.html?editar=1003")
        chk(f"{w}: 'Tarefas da sua função' não repete o pedido de fotos", "Fotos pedidas" not in pg.inner_text("#tarefas-hoje"))
        ch.scroll_into_view_if_needed(); shot(pg, f"hoje-fotos-pedidas-{w}")
        ch.locator("button.feito-fotos").click(); pg.wait_for_selector("#fotos-pedidas-hoje >> text=Pedido concluído.", timeout=5000)
        chk(f"{w}: Feito conclui o pedido no servidor", f["concluir"][-1] == {"ids": [61]})
        pg.wait_for_selector("#fotos-pedidas-hoje", state="detached", timeout=6000)
        chk(f"{w}: depois de feito o cartão some do Hoje", pg.locator("#fotos-pedidas-hoje").count() == 0)
        # ---- 3. Preparação sem instruções ----
        pg.click("nav.abas button[data-aba=prep]"); pg.wait_for_selector("text=Blusa Nova Tricô", timeout=6000)
        tp = pg.inner_text("#prep-topo")
        chk(f"{w}: Preparação: só título, botão e lista (sem 'Peça nova passa por aqui…' e sem passos)", "passa por aqui" not in pg.inner_text("main") and pg.locator("ol.passos").count() == 0 and tp.split("\n")[0] == "Preparação" and "Colocar peça em preparação" in tp, tp)
        chk(f"{w}: Preparação sem o texto longo de 'Outras tarefas' e da tarefa de cadastro", "Fotos novas pedidas na conferência e tarefas" not in pg.inner_text("main") and "Os dados estão em" not in pg.inner_text("main"))
        shot(pg, f"preparacao-sem-instrucoes-{w}")
        # ---- 1. aba Fotos: cartão por peça, vários pedidos juntos ----
        pg.click("nav.abas button[data-aba=fotos]"); pg.wait_for_selector("#fotos-pedidas .pedido-fotos", timeout=6000)
        cf = pg.locator('#fotos-pedidas .pedido-fotos[data-produto="1001"]')
        chk(f"{w}: aba Fotos junta os 2 pedidos da peça num cartão, com quem pediu e quando", cf.locator(".pedidos-lista li").count() == 2 and all(x in cf.inner_text() for x in ["Vestido Midi Linho", "TK-1001", "No pano · No manequim", "“luz natural”", "Pedido por Pablo em 02/11/26", "Outro: foto das costas", "Pedido por Iara em 03/11/26"]), cf.inner_text())
        pg.wait_for_selector('#fotos-pedidas .pedido-fotos[data-produto="1001"] .foto-bt', timeout=4000)
        cf.locator(".foto-bt").click(); pg.wait_for_selector("#tkfg.aberto", timeout=6000)
        chk(f"{w}: toque na foto abre todas as fotos com 'Ver no site'", "Foto 1 de 3" in pg.inner_text("#tkfg-cont") and "p/TK-1001" in (pg.get_attribute("#tkfg-link", "href") or ""))
        pg.keyboard.press("Escape"); pg.wait_for_selector("#tkfg.aberto", state="hidden", timeout=4000)
        shot(pg, f"fotos-aba-{w}")
        ok_t, ruins = alvos_ok(pg, "main button, main a.bt, nav button")
        chk(f"{w}: aba Fotos com alvos de pelo menos 44 px", ok_t, ruins)
        chk(f"{w}: aba Fotos sem rolagem horizontal", pg.evaluate(SEM_ROLAGEM))
        n_up = len(st["updates"])
        cf.locator("input.arq-foto").set_input_files([foto_png((200, 80, 60)), foto_png((60, 90, 200))])
        pg.wait_for_selector("text=2 fotos adicionadas ao produto. Pedido concluído.", timeout=8000)
        up = st["updates"][-1] if len(st["updates"]) > n_up else {}
        chk(f"{w}: 'Adicionar fotos' sobe ao servidor de fotos e acrescenta à galeria da peça", up.get("id") == "1001" and (M + "up001.jpg") in up.get("fotosGaleriaExistentes", "") and (M + "up002.jpg") in up.get("fotosGaleriaExistentes", "") and up.get("fotoUrlExistente") == "https://midia.fake/m/1001-capa.jpg", up)
        chk(f"{w}: adicionar fotos conclui os 2 pedidos de uma vez", f["concluir"][-1] == {"ids": [51, 52], "fotos": 2}, f["concluir"][-1])
        pg.wait_for_selector("#fotos-pedidas >> text=Nenhum pedido de fotos aberto.", timeout=6000)
        # pedir fotos numa tela própria (escolhendo a peça)
        pg.click("text=Pedir fotos de uma peça"); pg.wait_for_selector("#pf-busca", timeout=4000)
        pg.fill("#pf-busca", "saia"); pg.wait_for_selector('.folha [data-escolher="1003"]', timeout=6000); pg.click('.folha [data-escolher="1003"]')
        pg.click('[data-escolha="pf"] button[data-opcao="manequim"]'); pg.click('[data-escolha="pf"] button[data-opcao="cores"]')
        chk(f"{w}: a peça escolhida aparece e a busca some", pg.is_visible(".folha .peca-escolhida") and "Saia Plissada Midi" in pg.inner_text(".folha .peca-escolhida") and not pg.is_visible("#pf-busca"))
        shot(pg, f"pedir-fotos-folha-{w}")
        pg.click("#pf-pedir"); pg.wait_for_selector(".folha", state="detached", timeout=6000)
        pb = f["pedir"][-1]
        chk(f"{w}: pedido salvo com a peça, as opções e um id contra toque duplo", pb.get("produto") == "1003" and pb.get("opcoes") == ["manequim", "cores"] and re.match(r"^pf-[a-z0-9]+$", pb.get("op", "")) and pb.get("querOutro") is False, pb)
        pg.wait_for_selector('#fotos-pedidas .pedido-fotos[data-produto="1003"]', timeout=6000)
        chk(f"{w}: depois de pedir, o cartão aparece e o aviso confirma", "Fotos pedidas." in pg.inner_text("#fotos-status") and "No manequim · Das outras cores/estampas" in pg.inner_text("#fotos-pedidas"))
        # ---- 2. caixa: envio em lote com descrição, foto repetida e envio interrompido ----
        pg.click("text=Enviar fotos para a caixa"); pg.wait_for_selector("#cx-escolher", timeout=4000)
        chk(f"{w}: sem foto o botão de enviar fica desligado", pg.is_disabled("#cx-enviar"))
        pg.set_input_files("#cx-arq", [foto_png((10, 120, 90)), foto_png((10, 120, 90)), foto_png((150, 40, 160))])
        pg.wait_for_selector(".cx-linha >> nth=1", timeout=4000)
        chk(f"{w}: foto repetida na mesma escolha fica de fora (e avisa)", pg.locator(".cx-linha").count() == 2 and "1 foto repetida ficou de fora" in pg.inner_text(".folha"), pg.inner_text(".folha")[:300])
        pg.locator(".cx-linha input").first.fill("vestido verde, falta cadastrar")
        pg.fill("#cx-desc-lote", "Chegaram hoje da Malharia Sol")
        pg.click("text=Ligar a uma peça do catálogo (opcional)"); pg.fill("#cx-busca", "midi linho"); pg.wait_for_selector('.folha [data-escolher="1001"]', timeout=6000); pg.click('.folha [data-escolher="1001"]')
        chk(f"{w}: peça ligada (opcional) aparece no envio", "Vestido Midi Linho" in pg.inner_text(".folha .cx-peca"))
        shot(pg, f"caixa-enviar-folha-{w}")
        ok_t, ruins = alvos_ok(pg, ".folha button, .folha input[type=text], .folha textarea")
        chk(f"{w}: folha de envio com alvos de pelo menos 44 px", ok_t, ruins)
        up0 = f["uploads"]; f["falhar_upload"] = [up0 + 2]
        pg.click("#cx-enviar"); pg.wait_for_selector(".folha >> text=ficou guardada neste aparelho", timeout=8000)
        e1 = f["enviar"][-1]
        chk(f"{w}: envio interrompido: a 1ª chega à caixa, a outra fica guardada e a tela explica", len(f["enviar"]) == 1 and len(e1["itens"]) == 1 and "1 foto chegou à caixa" in pg.inner_text(".folha") and pg.inner_text("#cx-enviar") == "Tentar de novo", pg.inner_text(".folha")[-300:])
        chk(f"{w}: o lote leva a descrição de todas, a da foto, a peça e a impressão digital", e1["descricaoLote"] == "Chegaram hoje da Malharia Sol" and e1["itens"][0]["descricao"] == "vestido verde, falta cadastrar" and e1["produto"] == "1001" and e1["produtoNome"] == "Vestido Midi Linho" and re.match(r"^[a-f0-9]{32}$", e1["itens"][0]["hash"]) and re.match(r"^cx-", e1["itens"][0]["op"]), e1)
        shot(pg, f"caixa-envio-interrompido-{w}")
        # A confirmação do envio não depende da leitura posterior da lista.
        leituras_retidas = []
        def reter_lista(route): leituras_retidas.append(route)
        ctx.route("**/esteira/fotos", reter_lista)
        with pg.expect_request("**/esteira/fotos", timeout=8000): pg.click("#cx-enviar")
        pg.wait_for_selector(".folha", state="detached", timeout=8000)
        e2 = f["enviar"][-1]
        chk(f"{w}: 'Tentar de novo' envia só a que faltava, no mesmo lote", len(f["enviar"]) == 2 and len(e2["itens"]) == 1 and e2["lote"] == e1["lote"] and e2["itens"][0]["op"] != e1["itens"][0]["op"], e2)
        chk(f"{w}: aviso de sucesso", "1 foto enviada para a caixa." in pg.inner_text("#fotos-status"))
        ctx.unroute("**/esteira/fotos", reter_lista)
        for route in leituras_retidas: route.fallback()
        # envio interrompido com a tela fechada: retoma ao voltar para a aba Fotos
        pg.click("text=Enviar fotos para a caixa"); pg.wait_for_selector("#cx-escolher", timeout=4000)
        pg.set_input_files("#cx-arq", [foto_png((240, 200, 20))]); pg.wait_for_selector(".cx-linha", timeout=4000)
        f["falhar_upload"] = [f["uploads"] + 1]
        pg.click("#cx-enviar"); pg.wait_for_selector(".folha >> text=Tentar de novo", timeout=8000)
        pg.keyboard.press("Escape"); n_env = len(f["enviar"])
        pg.reload(); pg.wait_for_selector(".peca", timeout=8000)
        pg.click("nav.abas button[data-aba=fotos]")
        pg.wait_for_selector("#fotos-status >> text=do envio interrompido chegou à caixa", timeout=10000)
        chk(f"{w}: depois de recarregar, a foto guardada no aparelho sobe sozinha e entra na caixa", len(f["enviar"]) == n_env + 1 and len(f["enviar"][-1]["itens"]) == 1)
        # ---- 2. gestor: colocar num produto, cadastrar produto novo, descartar ----
        pg.wait_for_selector("#caixa .cx-item", timeout=6000)
        cxt = pg.inner_text("#caixa")
        chk(f"{w}: 'Fotos recebidas' mostra quem enviou, quando, descrição, peça indicada e foto repetida", all(x in cxt for x in ["Fotos recebidas", "Bia · 03/11/26 · 3 fotos", "“Vestidos que chegaram hoje”", "vestido azul no manequim", "Repetida", "Igual a uma enviada por Clarice em 01/11/26", "Peça indicada: Vestido Longo Floral", "Sem descrição"]), cxt[:600])
        chk(f"{w}: barra de ações só aparece com foto escolhida", not pg.is_visible(".cx-barra"))
        pg.click('.cx-item[data-caixa="104"] .cx-sel')
        chk(f"{w}: escolher marca a foto e mostra a barra", pg.get_attribute('.cx-item[data-caixa="104"] .cx-sel', "aria-pressed") == "true" and pg.is_visible(".cx-barra") and "1 foto escolhida" in pg.inner_text(".cx-barra"))
        shot(pg, f"caixa-gestor-{w}")
        pg.click(".cx-barra .cx-colocar"); pg.wait_for_selector(".folha .peca-escolhida", timeout=6000)
        chk(f"{w}: 'Colocar num produto' já sugere a peça indicada por quem enviou", "Vestido Longo Floral" in pg.inner_text(".folha .peca-escolhida") and "Tem 1 foto; cabem mais 7." in pg.inner_text(".folha"))
        pg.click('.folha .cx-capa button:has-text("Capa: foto 1")')
        shot(pg, f"caixa-colocar-folha-{w}")
        n_up = len(st["updates"]); pg.click("#cx-colocar-ok"); pg.wait_for_selector(".folha", state="detached", timeout=8000)
        up = st["updates"][-1] if len(st["updates"]) > n_up else {}
        chk(f"{w}: foto entra na peça existente como capa (a capa antiga vai para a galeria)", up.get("id") == "1002" and up.get("fotoUrlExistente") == M + "iara1.jpg" and up.get("fotosGaleriaExistentes", "").startswith("https://midia.fake/m/1002-capa.jpg") and up.get("nome") == "Vestido Longo Floral", up)
        chk(f"{w}: a caixa marca a foto como usada naquela peça", f["usar"][-1] == {"ids": [104], "uso": "produto", "produto": "1002", "produtoNome": "Vestido Longo Floral"}, f["usar"][-1])
        chk(f"{w}: conta como foto nova da peça (toque com as fotos que entraram)", (st.get("toques") or [{}])[-1].get("fotos") == [{"url": M + "iara1.jpg", "de": ""}], (st.get("toques") or [{}])[-1])
        pg.wait_for_selector("#fotos-status >> text=1 foto colocada em Vestido Longo Floral.", timeout=6000)
        pg.click('.cx-item[data-caixa="101"] .cx-sel'); pg.click('.cx-item[data-caixa="102"] .cx-sel')
        pg.click(".cx-barra .cx-novo"); pg.wait_for_selector("#cx-abrir-cadastro", timeout=4000)
        chk(f"{w}: 'Cadastrar produto novo' abre a Gestão com as fotos (um produto)", pg.get_attribute("#cx-abrir-cadastro", "href") == "admin.html?caixaFotos=101,102&modo=um" and pg.get_attribute("#cx-abrir-cadastro", "target") == "_blank")
        pg.click('.folha .cx-modo[data-modo="varias"]')
        chk(f"{w}: opção 'Vários produtos' (cada foto vira um produto)", pg.get_attribute("#cx-abrir-cadastro", "href") == "admin.html?caixaFotos=101,102&modo=varias")
        shot(pg, f"caixa-cadastro-folha-{w}")
        with ctx.expect_page() as pop: pg.click("#cx-abrir-cadastro")
        pop.value.close()
        pg.wait_for_selector('.cx-item[data-caixa="101"] >> text=Em cadastro', timeout=6000)
        chk(f"{w}: as fotos ficam 'Em cadastro' (continuam na caixa) até o produto ser salvo", f["usar"][-1] == {"ids": [101, 102], "uso": "cadastro"} and pg.locator('.cx-item[data-caixa="101"] .cx-voltar').count() == 1)
        pg.click('.cx-item[data-caixa="102"] .cx-voltar'); pg.wait_for_selector("#fotos-status >> text=A foto voltou para a caixa.", timeout=6000)
        chk(f"{w}: 'Voltar para a caixa' desfaz o cadastro aberto e não feito", f["descartar"][-1] == {"ids": [102], "desfazer": True})
        pg.click('.cx-item[data-caixa="103"] .cx-sel'); bd = pg.locator(".cx-barra .cx-descartar"); bd.click()
        chk(f"{w}: descartar pede confirmação no próprio botão", "Toque de novo" in bd.inner_text() and not [x for x in f["descartar"] if not x.get("desfazer")])
        bd.click(); pg.wait_for_selector("#fotos-status >> text=1 foto descartada", timeout=6000)
        chk(f"{w}: foto descartada sai da caixa (fica em Descartadas)", f["descartar"][-1] == {"ids": [103]} and pg.locator('.cx-item[data-caixa="103"]').count() == 0)
        pg.click('.cx-filtro button[data-ver="usadas"]'); pg.wait_for_selector('.cx-item[data-caixa="104"]', timeout=6000)
        chk(f"{w}: 'Usadas' mostra em qual peça cada foto foi usada, por quem e quando", "Em Vestido Longo Floral, por Iara em 03/11/26." in pg.inner_text("#caixa") and pg.locator("#caixa .cx-sel").count() == 0)
        pg.locator("#caixa").scroll_into_view_if_needed(); pg.evaluate("window.scrollTo(0, document.getElementById('caixa').getBoundingClientRect().top + scrollY - 110)"); pg.wait_for_timeout(150)
        shot(pg, f"caixa-usadas-{w}")
        pg.click('.cx-filtro button[data-ver="descartadas"]'); pg.wait_for_selector('.cx-item[data-caixa="103"] .cx-voltar', timeout=6000)
        pg.click('.cx-item[data-caixa="103"] .cx-voltar'); pg.wait_for_selector("#fotos-status >> text=A foto voltou para a caixa.", timeout=6000)
        chk(f"{w}: descarte pode ser desfeito", f["descartar"][-1] == {"ids": [103], "desfazer": True})
        ok_t, ruins = alvos_ok(pg, "main button, main a.bt, nav button")
        chk(f"{w}: caixa com alvos de pelo menos 44 px", ok_t, ruins)
        chk(f"{w}: caixa sem rolagem horizontal", pg.evaluate(SEM_ROLAGEM))
        if w == 390:
            pg.set_viewport_size({"width": 320, "height": 700}); pg.wait_for_timeout(200)
            chk("320: aba Fotos sem rolagem horizontal (reflow)", pg.evaluate(SEM_ROLAGEM))
            pg.set_viewport_size({"width": w, "height": h}); pg.wait_for_timeout(200)
            chk("390: as 6 abas do Admin cabem sem rolar", pg.evaluate("(()=>{const n=document.getElementById('abas');return n.scrollWidth<=n.clientWidth+1})()"), pg.locator("nav.abas button").all_inner_texts())
        chk(f"{w}: sem erro de JavaScript", not erros, erros)
        ctx.close()
        # ---- equipe (não cadastra): envia e acompanha só as próprias fotos ----
        print(f"== Esteira {w}px (equipe) ==")
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600)
        st = instalar(ctx, admin=False); f = fotos_srv(ctx, st, admin=False)
        f["caixa"][3].update(status="usada", usoProduto="1002", usoNome="Vestido Longo Floral", usadaPor="Pablo", usadaEm="2026-11-03T13:00:00Z")
        pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        entrar(pg); pg.click("nav.abas button[data-aba=fotos]"); pg.wait_for_selector("#caixa .cx-item", timeout=6000)
        chk(f"{w}: equipe vê 'Suas fotos enviadas', só as próprias, com o que já foi usado", "Suas fotos enviadas" in pg.inner_text("#caixa") and pg.locator("#caixa .cx-item").count() == 1 and "✓ Usada" in pg.inner_text("#caixa") and "Em Vestido Longo Floral, por Pablo" in pg.inner_text("#caixa"))
        chk(f"{w}: equipe não escolhe, não descarta e não coloca fotos em peças", pg.locator("#caixa .cx-sel").count() == 0 and pg.locator(".cx-barra").count() == 0 and pg.locator(".cx-filtro").count() == 0)
        chk(f"{w}: equipe também pede fotos e envia para a caixa", pg.is_visible("text=Enviar fotos para a caixa") and pg.is_visible("text=Pedir fotos de uma peça"))
        pg.evaluate("window.scrollTo(0, document.getElementById('caixa').getBoundingClientRect().top + scrollY - 110)"); pg.wait_for_timeout(150)
        shot(pg, f"caixa-equipe-{w}")
        chk(f"{w}: equipe sem erro de JavaScript", not erros, erros)
        ctx.close()
    b.close()

# ---- Gestão: cadastro aberto com as fotos da caixa (admin.html?caixaFotos=…) ----
sys.path.insert(0, str(AQUI))
from mock import install, SESSION
TK_ADMIN = os.environ.get("TK_BASE", BASE)
def admin_ctx(p, larg=390, alt=844):
    b = p.chromium.launch(args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": larg, "height": alt}, is_mobile=larg < 600, has_touch=larg < 600, service_workers="block")
    ctx.add_init_script(SESSION); log = []
    st = install(ctx, log=log, versao="3.5")
    cx = {"itens": {11: {"id": 11, "url": M + "cx11.jpg", "descricao": "vestido azul, P e M", "descricaoLote": "Chegaram hoje", "por": "Bia", "status": "cadastro"}, 12: {"id": 12, "url": M + "cx12.jpg", "descricao": "", "descricaoLote": "Chegaram hoje", "por": "Bia", "status": "cadastro"}, 13: {"id": 13, "url": M + "cx13.jpg", "descricao": "", "descricaoLote": "Chegaram hoje", "por": "Bia", "status": "nova"}}, "usar": [], "lidas": []}
    def hd(route):
        u = route.request.url
        if route.request.resource_type == "image" and "/m/202611/cx" in u:   # fotos da caixa (cor fixa por foto, só para a evidência)
            return route.fulfill(body=_png_cor([(196, 120, 90), (110, 150, 120), (120, 140, 190)][int(re.search(r"cx(\d+)", u).group(1)) % 3], 120, 150), content_type="image/png")
        if "tenkiter-ig." in u and "/esteira/caixa/" in u:
            if "/esteira/caixa/itens" in u:
                ids = [int(x) for x in re.search(r"ids=([0-9,]+)", u).group(1).split(",")]; cx["lidas"].append(ids)
                return route.fulfill(json={"ok": True, "itens": [cx["itens"][i] for i in ids if i in cx["itens"]]})
            if "/esteira/caixa/usar" in u:
                cx["usar"].append(json.loads(route.request.post_data or "{}")); return route.fulfill(json={"ok": True, "marcadas": 1})
        return route.fallback()
    ctx.route("**/*", hd)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    return b, ctx, pg, st, log, errs, cx
def preencher(pg, nome, preco="80"):
    pg.fill("#nome", nome); pg.fill("#preco", preco); pg.fill("#estoque", "2")
    if not pg.locator("#chips-genero .chip:first-child").evaluate('e => e.classList.contains("selecionado")'): pg.click("#chips-genero .chip:first-child")
    pg.click("#btn-abrir-categorias"); pg.click("#cat-lista .cat-item:has-text('Vestido')"); pg.click("#cat-pronto")
with sync_playwright() as p:
    for larg, alt in ((390, 844), (1440, 900)):
        print(f"== Gestão {larg}px: um produto com as fotos da caixa ==")
        b, ctx, pg, st, log, errs, cx = admin_ctx(p, larg, alt)
        pg.goto(TK_ADMIN + "admin.html?caixaFotos=11,12&modo=um")
        pg.wait_for_function("(document.getElementById('titulo-form')||{}).textContent==='Produto novo com fotos da caixa'", timeout=20000)
        chk(f"{larg}: abre o cadastro normal já com as 2 fotos (a 1ª como capa)", pg.locator("#galeria-grid .galeria-item").count() == 2 and pg.locator("#galeria-grid .galeria-item.capa").count() == 1 and pg.evaluate("document.getElementById('card-form').open"))
        al = pg.inner_text("#aviso-lote")
        chk(f"{larg}: mostra quem enviou e a descrição da equipe; o link sai da barra", "enviadas por Bia" in al and "vestido azul, P e M" in al and "caixaFotos" not in pg.url, al)
        pg.evaluate("window.scrollTo(0, document.getElementById('galeria-grid').getBoundingClientRect().top + scrollY - 160)"); pg.wait_for_timeout(300); shot(pg, f"gestao-cadastro-fotos-{larg}")
        pg.locator("#aviso-lote").scroll_into_view_if_needed(); pg.wait_for_timeout(300); shot(pg, f"gestao-cadastro-aviso-{larg}")
        if larg == 390:
            preencher(pg, "Vestido azul caixa")
            pg.click("#btn-salvar"); pg.wait_for_timeout(5000)
            cr = [x for x in log if x.get("action") == "create"]
            chk("produto criado com as fotos da caixa (capa e galeria, sem subir de novo)", len(cr) == 1 and cr[0].get("fotoUrlExistente") == M + "cx11.jpg" and cr[0].get("fotosGaleriaExistentes") == M + "cx12.jpg", cr[:1])
            us = cx["usar"][-1] if cx["usar"] else {}
            chk("depois de salvo, a caixa marca as 2 fotos como usadas no produto criado", us.get("ids") == [11, 12] and us.get("uso") == "criado" and bool(us.get("produto")), cx["usar"])
            chk("o importador do Instagram não recebe o aviso das fotos da caixa", not [c for c in st["ig"]["chamadas"] if c["path"] == "/acao"], [c for c in st["ig"]["chamadas"] if c["path"] == "/acao"])
        chk(f"{larg}: Gestão sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        chk(f"{larg}: Gestão sem erro de JavaScript", not errs, errs)
        b.close()
    for larg, alt in ((390, 844), (1440, 900)):
        print(f"== Gestão {larg}px: vários produtos com uniões (7.50.0) ==")
        b, ctx, pg, st, log, errs, cx = admin_ctx(p, larg, alt)
        pg.goto(TK_ADMIN + "admin.html?caixaFotos=11,12,13&modo=varias")
        pg.wait_for_function("(document.getElementById('titulo-form')||{}).textContent==='Cadastrar vários produtos' && document.querySelectorAll('#galeria-grid .galeria-item').length===3", timeout=20000)
        chk(f"{larg}: abre 'Cadastrar vários produtos' com as 3 fotos da caixa: 'Vão ser criados 3 produtos'", "Vão ser criados 3 produtos" in pg.inner_text("#unioes") and pg.inner_text("#btn-salvar") == "Cadastrar 3 produtos" and "Unir fotos" in pg.inner_text("#aviso-lote") and "enviadas por Bia" in pg.inner_text("#aviso-lote"), (pg.inner_text("#unioes"), pg.inner_text("#aviso-lote")))
        imgs = lambda: pg.locator("#galeria-grid .galeria-item img")
        pg.click("#uni-unir"); imgs().nth(0).click(); imgs().nth(1).click(); pg.click("#uni-ok"); pg.wait_for_timeout(200)
        chk(f"{larg}: 'Unir fotos' junta as 2 do mesmo produto → 'Vão ser criados 2 produtos'", "Vão ser criados 2 produtos" in pg.inner_text("#unioes") and pg.inner_text("#btn-salvar") == "Cadastrar 2 produtos", pg.inner_text("#unioes"))
        pg.evaluate("window.scrollTo(0, document.getElementById('galeria-grid').getBoundingClientRect().top + scrollY - 160)"); pg.wait_for_timeout(300); shot(pg, f"gestao-varias-unioes-{larg}")
        if larg == 390:
            preencher(pg, "Conjunto caixa")
            pg.click("#btn-salvar"); pg.wait_for_timeout(8000)
            cr = [x for x in log if x.get("action") == "create"]
            fotos = sorted((c.get("fotoUrlExistente", "").split("/")[-1], c.get("fotosGaleriaExistentes", "").split("/")[-1]) for c in cr)
            chk("2 produtos: o grupo (capa + galeria) e a foto solta, pelos endereços (sem subir de novo)", len(cr) == 2 and fotos == [("cx11.jpg", "cx12.jpg"), ("cx13.jpg", "")], fotos)
            chk("cada produto criado marca as suas fotos da caixa como usadas (um aviso por produto)", sorted(tuple(u["ids"]) for u in cx["usar"] if u.get("uso") == "criado") == [(11, 12), (13,)], cx["usar"])
        chk(f"{larg}: Gestão (vários) sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        chk(f"{larg}: sem erro de JavaScript", not errs, errs)
        b.close()
    print("== Gestão: link quebrado ==")
    b, ctx, pg, st, log, errs, cx = admin_ctx(p)
    cx["itens"] = {}
    pg.goto(TK_ADMIN + "admin.html?caixaFotos=99&modo=um")
    pg.wait_for_function("!document.getElementById('aviso-rapido').hidden", timeout=20000)
    av = pg.evaluate("document.getElementById('aviso-rapido').textContent")
    chk("fotos que não estão mais na caixa: aviso em português, cadastro não abre sozinho", "não estão mais na caixa" in av and "fotos da caixa" not in pg.inner_text("#titulo-form"), av)
    b.close()

print(f"OK={ok} FALHAS={len(falhas)} {falhas}")
sys.exit(1 if falhas else 0)
