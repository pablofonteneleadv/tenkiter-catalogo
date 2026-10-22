"""Manual rico (RH 3.17 + site): cor/marca-texto/negrito/links por trecho, foto ao lado do texto, vídeo, caixas coloridas,
lição com checagem sem caixinha de "li" (só conclui acertando e abre a próxima), botões do Doc da prova em todo card e o guia
"Como formatar". Backend RH SIMULADO (nada toca em planilha/Doc). Gera prints se TK_PRINTS=pasta."""
import sys, os, json
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
PRINTS = os.environ.get("TK_PRINTS", "")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def shot(pg, nome, full=False):
    if PRINTS:
        os.makedirs(PRINTS, exist_ok=True); pg.screenshot(path=os.path.join(PRINTS, nome + ".png"), full_page=full)

def P(t, **k):
    b = {"type": "p", "text": t, "bold": False}; b.update(k); return b

def montar_blocos(hash_extra=""):
    return [
        [  # Lição 1: tudo de formatação + uma checagem
            P("Texto com negrito, cor, marca-texto e link.", runs=[
                {"t": "Texto com "}, {"t": "negrito", "b": 1}, {"t": ", "}, {"t": "cor", "c": "#c0392b"}, {"t": ", "},
                {"t": "azul escuro", "c": "#1a237e"}, {"t": ", "}, {"t": "marca-texto", "h": "#fff176"}, {"t": " e "},
                {"t": "link", "a": "https://tenkitermodas.com.br/treinamentos.html"}, {"t": " e "},
                {"t": "link falso", "a": "javascript:alert(1)"}, {"t": " <b>x</b>."}]),
            P("Centralizado", al="c"),
            {"type": "img", "src": "icon-192.png", "width": 192, "height": 192, "side": "left", "pct": 30},
            P("Este parágrafo contorna a foto da esquerda e precisa ficar ao lado dela, também no celular, sem sumir nem cobrir a foto. " * 3),
            {"type": "img", "src": "icon-192.png", "width": 192, "height": 192, "side": "full"},
            {"type": "video", "kind": "yt", "id": "dQw4w9WgXcQ", "vertical": 0},
            {"type": "video", "kind": "yt", "id": 'x"onload="alert(1)', "vertical": 0},
            {"type": "video", "kind": "mp4", "src": "https://exemplo.test/aula.mp4"},
            {"type": "video", "kind": "mp4", "src": "javascript:alert(1)"},
            {"type": "table", "rows": [["Termo", "Significado"], ["TM", "TENKiTER Modas"]]},
            P("Faça agora: abra o painel e confira o estoque.", runs=[{"t": "Faça agora: "}, {"t": "abra o painel", "b": 1}, {"t": " e confira o estoque."}]),
            P("Relaxa: errar faz parte.", runs=[{"t": "Relaxa: "}, {"t": "errar", "b": 1}, {"t": " faz parte."}]),
            P("Atenção: nunca deixe o caixa aberto."), P("Importante: confira o troco."),
            P("Dica: pergunte o tamanho antes."), P("Exemplo: a cliente pediu outra cor."), P("Regra de ouro: o cliente vem primeiro."),
            P("Checagem: Quem vem primeiro?"), P("a) A pressa"), P("b) O cliente *"), P("c) O caixa"), P("Explicação: o cliente vem primeiro."),
        ],
        [P("Lição dois."), P("Checagem: Como cumprimentar?"), P("a) Com um sorriso *"), P("b) Calado"), P("Explicação: um sorriso abre a conversa.")],
        [P("Lição três, sem checagem: só a caixinha de leitura.")],
    ]

def novo_backend(perms, estado):
    st = {"lidos": set(), "log": [], "gets": []}
    def conteudo():
        blocos = montar_blocos()
        caps = []
        for i, bl in enumerate(blocos):
            caps.append({"title": "Lição %d" % (i + 1), "id": "licao-%d" % (i + 1), "hash": "h%d%s" % (i + 1, estado["hash1"] if i == 0 else ""), "blocks": bl})
        m = {"id": "1", "titulo": "Manual Rico", "blurb": "teste", "nivelMinimo": 1, "ordem": 1, "liberado": True, "parts": [{"title": "Parte", "chapters": caps}]}
        if "gerir_manuais" in perms:
            m.update({"docUrl": "https://docs.google.com/document/d/aaa/edit", "provaDocUrl": "https://docs.google.com/document/d/bbb/edit", "provaAtualizadoEm": ""})
            m2 = {"id": "2", "titulo": "Manual sem prova", "blurb": "", "nivelMinimo": 1, "ordem": 2, "liberado": True,
                  "parts": [{"title": "P", "chapters": [{"title": "C", "id": "c", "hash": "h", "blocks": [P("x")]}]}], "docUrl": "https://docs.google.com/document/d/ccc/edit"}
            return [m, m2]
        return [m]
    def post(b):
        a = b.get("action"); st["log"].append(b)
        if a in ("sessao", "login"): return {"ok": True, "sessao": "tk2.x.y", "usuario": {"whatsapp": "88999999999", "name": "Ana", "nome": "Ana", "level": 10 if "gerir_manuais" in perms else 1, "permissoes": perms, "perfil": "Admin" if "gerir_manuais" in perms else "Aluno"}}
        if a == "config_quiz": return {"ok": "gerir_manuais" in perms, "configs": []}
        if a == "treinamento_conteudo": return {"ok": True, "manuais": conteudo(), "provas": {}, "resets": {}}
        if a == "manual_marcar_lido":
            (st["lidos"].add if b.get("lido") else st["lidos"].discard)(b["capId"]); return {"ok": True}
        if a == "manual_sincronizar_lote":
            for i in b.get("itens", []):
                if i.get("lido"): st["lidos"].add(i["capId"])
            return {"ok": True, "gravados": 0}
        if a == "criar_manual_vazio": return {"ok": True, "manualId": "m3", "docUrl": "https://docs.google.com/document/d/ddd/edit", "prova": {"ok": True, "modelo": True, "docUrl": "https://docs.google.com/document/d/eee/edit"}}
        if a == "importar_manual_doc": return {"ok": True, "manualId": "m4", "privado": True}
        if a == "prova_sincronizar": return {"ok": True, "perguntas": 10, "avisos": [], "modelo": 10, "atualizadoEm": "2026-10-18T14:00:00.000Z"}
        if a == "sincronizar_manual": return {"ok": True, "parts": [], "atualizadoEm": "2026-10-18T14:00:00.000Z", "aviso": "O manual é grande: tirei cores."}
        if a == "relatorio_equipe": return {"ok": True, "funcionarios": [], "resultados": []}
        if a == "avaliacoes_contagem": return {"ok": True, "porId": {}, "contagem": {}, "maxPorManual": {}, "max": 3}
        if a == "curriculo_status": return {"ok": True, "estado": "completo"}
        return {"ok": True}
    return st, post

def instalar(ctx, perms, estado):
    st, post = novo_backend(perms, estado)
    def h(route):
        req = route.request; cors = {"access-control-allow-origin": "*"}
        if "script.google.com" not in req.url: return route.continue_()
        if req.method == "POST":
            try: b = json.loads(req.post_data or "{}")
            except Exception: b = {}
            return route.fulfill(json=post(b), headers=cors)
        q = req.url.split("?", 1)[-1]
        st["gets"].append(q)
        if "action=versao" in q: return route.fulfill(json={"ok": True, "versao": estado.get("versao", "3.17"), "configQuizProtegida": estado.get("versao") in ("3.18", "3.19"), "importarManualDoc": estado.get("versao") == "3.19", "acessos": True, "conteudoProtegido": True, "manualRico": True, "provaModelo": True}, headers=cors)
        return route.fulfill(json={"ok": True, "configs": [], "manuais": [], "produtos": []}, headers=cors)
    ctx.route("**/*", h)
    return st

AXE = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "axe.min.js"), encoding="utf8").read()
def axe_viol(pg, raiz="document"):
    pg.evaluate(AXE)
    r = pg.evaluate("axe.run(%s, {runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}).then(r => r.violations.map(v => v.id + ': ' + v.nodes.slice(0,3).map(n => (n.target||[]).join(' ') + ' [' + ((n.any[0]||{}).message||'') + ']').join(' | ')))" % raiz)
    return r

SESSION = "localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999999999',sessao:'tk2.x.y'}));"
ALUNO = ["portal", "avaliacoes", "manual_1"]
GESTOR = ["portal", "avaliacoes", "gerir_manuais", "equipe_relatorio", "dados_pessoais", "manual_1", "manual_2"]

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    estado = {"hash1": ""}
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", locale="pt-BR")
    ctx.add_init_script(SESSION)
    ctx.add_init_script("localStorage.setItem('tm_manuais_cache_v1', JSON.stringify({manuais:[{id:'antigo',titulo:'Conteúdo de outra sessão',parts:[]}]}));")
    st = instalar(ctx, ALUNO, estado)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "treinamentos.html"); pg.wait_for_selector('.card[data-manual="1"]', timeout=10000); pg.wait_for_timeout(500)
    chk("P-16 HTML não embute manuais nem provas", pg.evaluate("Object.keys(JSON.parse(document.getElementById('app-data').textContent).manuals).length === 0"))
    chk("P-16 cache de outra sessão é apagado", pg.evaluate("localStorage.getItem('tm_manuais_cache_v1')") is None)
    chk("P-16 não consulta GET público de manual/configuração", not any("action=manuais_lista" in q or "action=config_quiz" in q for q in st["gets"]))
    pg.click('.card[data-manual="1"]'); pg.wait_for_selector(".chapter", timeout=8000); pg.wait_for_timeout(500)
    c1 = pg.locator(".chapter").nth(0)

    print("== Texto com formatação por trecho ==")
    par = c1.locator("p").first
    chk("negrito por trecho vira <strong>", par.locator("strong", has_text="negrito").count() == 1)
    cor = par.locator(".rc", has_text="cor").first
    chk("cor da letra vem do Doc (vermelho)", cor.evaluate("e => getComputedStyle(e).color") == "rgb(192, 57, 43)", cor.evaluate("e => getComputedStyle(e).color"))
    marca = par.locator("mark.rh").first
    chk("marca-texto amarelo com letra escura", marca.evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(255, 241, 118)" and marca.evaluate("e => getComputedStyle(e).color") == "rgb(28, 27, 24)", marca.evaluate("e => getComputedStyle(e).color + ' / ' + getComputedStyle(e).backgroundColor"))
    lk = par.locator("a", has_text="link").first
    chk("link https abre em outra aba com rel seguro", lk.get_attribute("href") == "https://tenkitermodas.com.br/treinamentos.html" and lk.get_attribute("target") == "_blank" and "noopener" in (lk.get_attribute("rel") or ""))
    chk("link javascript: NÃO vira link", par.locator("a[href^='javascript']").count() == 0 and "link falso" in par.inner_text())
    chk("HTML dentro do texto aparece como texto (nada é injetado)", "<b>x</b>" in par.inner_text() and par.locator("b").count() == 0)
    chk("alinhamento centralizado do Doc", c1.locator("p", has_text="Centralizado").evaluate("e => getComputedStyle(e).textAlign") == "center")

    print("== Foto ao lado do texto ==")
    img = c1.locator(".manual-img-wrap.lado-esq").first
    chk("foto ao lado: flutua à esquerda", img.evaluate("e => getComputedStyle(e).float") == "left")
    larg = img.evaluate("e => e.getBoundingClientRect().width"); corpo = c1.evaluate("e => e.getBoundingClientRect().width")
    chk("largura da foto segue a do Doc (~30%) e nunca passa de 46%", 100 <= larg <= corpo * 0.46 + 1, (larg, corpo))
    caixa = img.evaluate("e => { const r = e.getBoundingClientRect(); return [r.right, r.top, r.bottom]; }")
    primeira = c1.locator("p", has_text="contorna a foto").evaluate("e => { const r = document.createRange(); r.selectNodeContents(e); const q = r.getClientRects()[0]; return [q.left, q.top]; }")
    chk("o texto começa AO LADO da foto (não embaixo nem por cima)", primeira[0] >= caixa[0] - 1 and caixa[1] - 2 <= primeira[1] <= caixa[2], (primeira, caixa))
    chk("foto sozinha (full) continua grande e sem flutuar", c1.locator(".manual-img-wrap:not(.lado-esq):not(.lado-dir)").first.evaluate("e => getComputedStyle(e).float") == "none")
    shot(pg, "r1-foto-ao-lado")

    print("== Vídeo ==")
    ifr = c1.locator(".manual-video iframe")
    chk("YouTube vira player nocookie; id estranho não vira nada", ifr.count() == 1 and ifr.first.get_attribute("src").startswith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), ifr.count())
    chk("arquivo .mp4 https vira <video controls>; javascript: não", c1.locator(".manual-video video[controls]").count() == 1 and c1.locator("video[src^='javascript']").count() == 0)
    chk("sempre há um link para abrir o vídeo em outra aba", c1.locator(".manual-video a.vlink").count() == 2)

    print("== Caixas coloridas ==")
    chk("5 tipos de caixa (+ Importante) com cores próprias", c1.locator(".aviso-good").count() == 1 and c1.locator(".aviso-warn").count() == 2 and c1.locator(".aviso-tip").count() == 1 and c1.locator(".aviso-neutro").count() == 1 and c1.locator(".aviso-ouro").count() == 1)
    chk("o rótulo vira etiqueta e não repete 'Relaxa:' no texto", "Relaxa:" not in c1.locator(".aviso-good").inner_text() and "RELAXA" in c1.locator(".aviso-good .aviso-tag").inner_text().upper())
    chk("negrito dentro da caixa é mantido", c1.locator(".aviso-good strong", has_text="errar").count() == 1)
    chk("'Faça agora' mantém o negrito e tira o rótulo do texto", c1.locator(".tmv-facaagora strong", has_text="abra o painel").count() == 1 and "Faça agora:" not in c1.locator(".tmv-facaagora").inner_text())
    fundos = c1.evaluate("e => [...e.querySelectorAll('.aviso')].map(a => getComputedStyle(a).backgroundColor)")
    chk("as caixas não têm todas a mesma cor", len(set(fundos)) >= 4, fundos)
    shot(pg, "r2-caixas", full=True)

    print("== Tema escuro ==")
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    azul = par.locator(".rc", has_text="azul escuro").first
    cor_escuro = azul.evaluate("e => getComputedStyle(e).color")
    chk("cor muito escura é clareada no tema escuro (continua legível)", cor_escuro != "rgb(26, 35, 126)", cor_escuro)
    pg.evaluate("document.documentElement.removeAttribute('data-theme')")

    print("== Lição com checagem: sem caixinha, só avança acertando ==")
    c2 = pg.locator(".chapter").nth(1); c3 = pg.locator(".chapter").nth(2)
    chk("a lição 1 (com checagem) não tem a caixinha de leitura", c1.locator(".read-toggle-big").count() == 0 and "Responda a checagem" in c1.locator(".cap-status").inner_text())
    chk("lição 2 e 3 começam travadas; aluno não vê botão de gestão", pg.locator(".chapter.cap-travado").count() == 2 and pg.locator("button[data-livre]").count() == 0)
    chk("lição travada esconde o conteúdo e explica por quê", not c2.locator(".tmv-chk").first.is_visible() and "Lição 1" in c2.locator(".cap-trava").inner_text())
    c1.locator(".tmv-chk .tmv-op").nth(0).click(); pg.wait_for_timeout(250)
    chk("resposta errada não avança", c2.evaluate("e => e.classList.contains('cap-travado')") and not c1.locator(".cap-status.ok").count())
    c1.locator(".tmv-chk .tmv-op").nth(1).click(); pg.wait_for_timeout(500)
    chk("resposta certa conclui a lição 1 e já avisa o servidor", c1.locator(".cap-status.ok").count() == 1 and "licao-1" in st["lidos"], st["lidos"])
    chk("a lição 2 abriu; a 3 segue travada (a 2 ainda não foi concluída)", not c2.evaluate("e => e.classList.contains('cap-travado')") and c3.evaluate("e => e.classList.contains('cap-travado')"))
    c1.locator(".cap-prox").click(); pg.wait_for_timeout(600)
    c2.locator(".tmv-op").nth(0).click(); pg.wait_for_timeout(500)
    chk("lição 2 concluída libera a 3, que tem a caixinha normal de leitura", c2.locator(".cap-status.ok").count() == 1 and not c3.evaluate("e => e.classList.contains('cap-travado')") and c3.locator(".read-toggle-big input").count() == 1)
    c3.locator(".read-toggle-big input").check(force=True); pg.wait_for_timeout(400)
    chk("as 3 lições ficam lidas no servidor", st["lidos"] == {"licao-1", "licao-2", "licao-3"}, st["lidos"])
    shot(pg, "r3-licao-concluida")

    print("== Acessibilidade (axe) da lição rica ==")
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(600)   # espera as transições de cor terminarem (axe mede no meio delas)
    v = axe_viol(pg); chk("lição rica no tema claro: sem problema de acessibilidade/contraste", not v, v)
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')"); pg.wait_for_timeout(600)
    v = axe_viol(pg); chk("lição rica no tema escuro: sem problema de acessibilidade/contraste", not v, v)
    pg.evaluate("document.documentElement.removeAttribute('data-theme')")

    print("== Depois de recarregar ==")
    pg.reload(); pg.wait_for_selector('.card[data-manual="1"]', timeout=10000); pg.click('.card[data-manual="1"]'); pg.wait_for_selector(".chapter", timeout=8000); pg.wait_for_timeout(500)
    chk("o que já foi concluído continua concluído e nada fica travado", pg.locator(".chapter .cap-status.ok").count() == 2 and pg.locator(".chapter.cap-travado").count() == 0)
    estado["hash1"] = "NOVO"   # o gestor mudou o texto da lição 1 depois que o aluno concluiu
    pg.reload(); pg.wait_for_selector('.card[data-manual="1"]', timeout=10000); pg.click('.card[data-manual="1"]'); pg.wait_for_selector(".chapter", timeout=8000); pg.wait_for_timeout(500)
    chk("lição que mudou volta a pedir a checagem (e avisa que foi atualizada)", pg.locator(".chapter").nth(0).locator(".cap-status.ok").count() == 0 and pg.locator(".chapter").nth(0).locator(".chapter-stale-alert").count() == 1 and pg.locator(".chapter").nth(0).locator(".tmv-chk .tmv-op.certa").count() == 0)
    chk("sem erro de JavaScript (aluno)", not erros, erros)
    ctx.close()

    print("== Gestão: Doc da prova em todo card e guia de formatação ==")
    estado["versao"] = "3.18"
    estado["hash1"] = ""
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", locale="pt-BR")
    ctx.add_init_script(SESSION); st = instalar(ctx, GESTOR, estado)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "treinamentos.html"); pg.wait_for_selector('.card[data-manual="1"]', timeout=10000); pg.wait_for_timeout(400)
    pg.click('.card[data-manual="1"]'); pg.wait_for_selector(".chapter", timeout=8000); pg.wait_for_timeout(400)
    chk("gestão vê o aviso de trava e o botão para abrir mesmo assim", pg.locator("button[data-livre='1']").count() == 2)
    pg.locator("#btn-admin-rh").click(); pg.wait_for_timeout(1200)
    pg.locator(".admin-tab", has_text="Conteúdo").click(); pg.wait_for_timeout(900)
    cards = pg.locator("details.manual-card")
    chk("os dois manuais aparecem", cards.count() == 2, cards.count())
    cards.nth(0).locator("summary").click(); cards.nth(1).locator("summary").click(); pg.wait_for_timeout(300)
    c_a, c_b = cards.nth(0), cards.nth(1)
    chk("manual com Doc de prova: botões 'Abrir o Doc da prova' e 'Sincronizar prova'", c_a.locator("a", has_text="Abrir o Doc da prova").count() == 1 and c_a.locator(".prova-sync-btn").count() == 1)
    chk("Doc novo avisa das 10 perguntas de exemplo até sincronizar", "10 perguntas de exemplo" in c_a.inner_text() and "(Modelo)" in c_a.inner_text())
    chk("manual SEM prova também mostra o bloco, com 'Criar Doc da prova'", c_b.locator(".prova-bloco").count() == 1 and c_b.locator(".prova-criar-btn").count() == 1)
    c_a.locator(".prova-sync-btn").click(); pg.wait_for_timeout(600)
    chk("sincronizar avisa que ainda restam perguntas de exemplo", "EXEMPLO" in pg.inner_text("#toast"), pg.inner_text("#toast"))
    shot(pg, "r4-card-prova", full=True)
    g = pg.locator("#guia-formatar"); g.locator("summary").click(); pg.wait_for_timeout(300)
    chk("o guia 'Como formatar' existe e mostra exemplos de verdade", g.locator(".guia-par").count() >= 9 and g.locator(".aviso").count() == 5 and g.locator("mark.rh").count() >= 1 and g.locator(".manual-img-wrap.lado-esq").count() == 1 and g.locator(".tmv-chk").count() == 1)
    g.locator(".tmv-chk .tmv-op").nth(1).click(); pg.wait_for_timeout(200)
    chk("a checagem do guia responde ao clique (é só exemplo)", g.locator(".tmv-chk .tmv-op.certa").count() == 1)
    shot(pg, "r5-guia", full=True)
    v = axe_viol(pg, "document.getElementById('guia-formatar')"); chk("guia 'Como formatar' aberto: sem problema de acessibilidade/contraste", not v, v)
    cfg_calls = [x for x in st["log"] if x.get("action") == "config_quiz"]
    chk("P-16 gestor 3.18 lê configuração com sessão pelo POST", bool(cfg_calls) and all(x.get("sessao") == "tk2.x.y" for x in cfg_calls))
    estado["versao"] = "3.19"
    pg.reload(); pg.wait_for_selector('.card[data-manual="1"]', timeout=10000)
    pg.locator("#btn-admin-rh").click(); pg.wait_for_timeout(700)
    pg.locator(".admin-tab", has_text="Conteúdo").click(); pg.wait_for_timeout(500)
    chk("importar Doc aparece somente com RH 3.19", pg.locator("#btn-importar-manual").count() == 1)
    pg.locator("#btn-importar-manual").click(); pg.wait_for_timeout(100)
    chk("link inválido é bloqueado antes de enviar", not any(x.get("action") == "importar_manual_doc" for x in st["log"]))
    pg.fill("#manual-doc-existente", "https://docs.google.com/document/d/EXEMPLO_ID_PARA_TESTE_123/edit")
    pg.locator("#btn-importar-manual").click(); pg.wait_for_timeout(700)
    chamadas_importar = [x for x in st["log"] if x.get("action") == "importar_manual_doc"]
    chk("importa Doc com sessão do gestor e informa revisão privada", len(chamadas_importar) == 1 and chamadas_importar[0].get("docUrl", "").endswith("/edit") and "revisão" in pg.inner_text("#toast").lower())
    chk("sem erro de JavaScript (gestão)", not erros, erros)
    ctx.close(); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
