"""Módulo 0 "verificado": checagem na lição, prova com pergunta da regra de ouro, prática validada, certificado e verificação.
Backend RH simulado (mesmas regras do funcionario-codigo-3.16). Gera prints se TK_PRINTS=pasta."""
import sys, os, json, re, time
from playwright.sync_api import sync_playwright
AQUI = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
PRINTS = os.environ.get("TK_PRINTS", "")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def shot(pg, nome, full=False):
    if PRINTS:
        os.makedirs(PRINTS, exist_ok=True); pg.screenshot(path=os.path.join(PRINTS, nome + ".png"), full_page=full)

PARTES = json.load(open(os.path.join(AQUI, "fixtures_modulo0", "modulo0_parts.json"), encoding="utf8"))
PROVA = json.load(open(os.path.join(AQUI, "fixtures_modulo0", "prova0.json"), encoding="utf8"))
def slug(t): return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
for pt in PARTES:
    for c in pt["chapters"]: c["id"] = slug(c["title"]); c["hash"] = "h" + str(len(json.dumps(c["blocks"])))
CAPS = [c for pt in PARTES for c in pt["chapters"]]
PRATICA = [b["text"] for b in CAPS[-1]["blocks"] if b["type"] == "bul"]

def novo_backend(perms, whats="88999999999", nome="Pablo Teste"):
    st = {"lidos": set(), "resultados": [], "praticas": [], "certs": [], "log": []}
    def sit():
        pct = max([r["pct"] for r in st["resultados"] if r["crit"] == 0] or [-1])
        prat = st["praticas"][-1] if st["praticas"] else None
        req = {"leitura": len(st["lidos"]) >= len(CAPS), "prova": pct >= 70, "pratica": bool(prat and prat["resultado"] == "aprovada")}
        melhor = max([r["pct"] for r in st["resultados"]] or [-1])
        return {"ok": True, "manualId": "m900", "titulo": "Módulo 0 – Iniciando", "capitulos": len(CAPS), "lidos": len(st["lidos"]), "minimo": 70,
                "melhorFeito": melhor >= 0, "provaOk": req["prova"], "criticaErrada": melhor >= 70 and not req["prova"],
                "praticaResultado": prat["resultado"] if prat else "", "req": req, "elegivel": all(req.values()),
                "certificado": next((c for c in st["certs"] if c["status"] != "revogado"), None)}
    def post(b):
        a = b.get("action"); st["log"].append(b)
        if a in ("sessao", "login"): return {"ok": True, "sessao": "tk2.x.y", "usuario": {"whatsapp": whats, "name": nome, "nome": nome, "level": 10, "permissoes": perms, "perfil": "Admin"}}
        if a == "treinamento_conteudo":
            gestor = "gerir_manuais" in perms
            ms = [{"id": "m900", "titulo": "Módulo 0 – Iniciando", "blurb": "Teste · só administrador", "nivelMinimo": 10, "ordem": 1, "liberado": True, "parts": PARTES}] if gestor else []
            pv = {"m900": {"title": "Avaliação — Módulo 0", "pass": 0.7, "count": 0, "modo": "ordem", "opcoes": 0, "max": 3,
                           "questions": [{"q": ("[CRÍTICA] " if q["critica"] else "") + q["q"], "options": q["options"], "correct": q["correct"], "explain": q["explain"]} for q in PROVA]}} if gestor else {}
            return {"ok": True, "manuais": ms, "provas": pv, "resets": {}}
        if a == "avaliacoes_contagem": return {"ok": True, "porId": {"m900": len(st["resultados"])}, "contagem": {}, "maxPorManual": {"m900": 3}, "max": 3}
        if a == "resultado":
            nota, tot = b.get("nota", 0), b.get("total", 1)
            st["resultados"].append({"pct": round(100 * nota / tot), "crit": b.get("criticasErradas", 0)})
            return {"ok": True, "tentativa": len(st["resultados"]), "max": 3}
        if a == "manual_marcar_lido":
            (st["lidos"].add if b.get("lido") else st["lidos"].discard)(b["capId"]); return {"ok": True}
        if a == "manual_sincronizar_lote":
            for i in b.get("itens", []):
                if i.get("lido"): st["lidos"].add(i["capId"])
            return {"ok": True, "gravados": 0}
        if a == "certificado_status": return sit()
        if a == "certificado_emitir":
            s = sit()
            if s["certificado"]: return {"ok": True, "certificado": s["certificado"], "jaExistia": True}
            if not s["elegivel"]: return {"ok": False, "naoElegivel": True, "erro": "Ainda faltam requisitos.", "situacao": s}
            c = {"codigo": "TK-7QX4-M2RB", "nome": nome, "titulo": "Módulo 0 – Iniciando", "emitidoEm": "2026-10-18T14:00:00.000Z", "validadoPor": st["praticas"][-1]["validadoPor"], "status": "valido", "whatsapp": whats}
            st["certs"].append(c); return {"ok": True, "certificado": c}
        if a == "certificado_meus": return {"ok": True, "certificados": st["certs"]}
        if a == "certificado_revogar":
            for c in st["certs"]: c["status"] = "revogado"
            return {"ok": True}
        if a == "pratica_listar": return {"ok": True, "praticas": st["praticas"][-1:]}
        if a == "pratica_validar":
            st["praticas"].append({"whatsapp": b["whatsappAlvo"], "manualId": b["manualId"], "itens": b["itens"], "resultado": "aprovada" if b["aprovado"] else "refazer", "validadoPor": nome, "obs": b.get("obs", "")})
            return {"ok": True, "resultado": st["praticas"][-1]["resultado"]}
        if a == "relatorio_equipe": return {"ok": True, "funcionarios": [{"nome": nome, "whatsapp": whats, "nivel": 10, "status": "ativo"}, {"nome": "Bia Funcionária", "whatsapp": "88988887777", "nivel": 1, "status": "ativo"}], "resultados": []}
        if a == "curriculo_status": return {"ok": True, "estado": "completo"}
        return {"ok": True}
    return st, post

def instalar(ctx, perms):
    st, post = novo_backend(perms)
    def h(route):
        req = route.request; cors = {"access-control-allow-origin": "*"}
        if "script.google.com" not in req.url: return route.continue_()
        if req.method == "POST":
            try: b = json.loads(req.post_data or "{}")
            except Exception: b = {}
            return route.fulfill(json=post(b), headers=cors)
        q = req.url.split("?", 1)[-1]
        if "action=versao" in q: return route.fulfill(json={"ok": True, "versao": "3.16", "acessos": True, "conteudoProtegido": True, "certificados": True, "praticas": True, "manualSoGestor": True}, headers=cors)
        if "action=certificado_verificar" in q:
            return route.fulfill(json={"ok": True, "encontrado": "7QX4" in q.upper(), "valido": True, "codigo": "TK-7QX4-M2RB", "nome": "Pablo Teste", "titulo": "Módulo 0 – Iniciando", "emitidoEm": "2026-10-18T14:00:00.000Z", "validadoPor": "Karla"}, headers=cors)
        return route.fulfill(json={"ok": True, "configs": [], "manuais": [], "produtos": []}, headers=cors)
    ctx.route("**/*", h)
    return st

SESSION = "localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999999999',sessao:'tk2.x.y'}));"
GESTOR = ["portal", "avaliacoes", "gerir_manuais", "equipe_relatorio", "dados_pessoais", "manual_1", "manual_2", "manual_3"]
FUNC = ["portal", "avaliacoes", "manual_1"]

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", locale="pt-BR")
    ctx.add_init_script(SESSION); st = instalar(ctx, GESTOR)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    print("== Administrador vê o manual de teste ==")
    pg.goto(BASE + "treinamentos.html"); pg.wait_for_timeout(2500)
    chk("a tela inicial mostra o card do módulo 0 com a etiqueta 'SÓ ADMINISTRADOR'", "SÓ ADMINISTRADOR" in pg.inner_text("#app"), pg.inner_text("#app")[:300])
    shot(pg, "01-inicio-card-so-admin")
    pg.locator(".card[data-manual='m900']").click(); pg.wait_for_timeout(900)
    print("== Lição com checagem ==")
    chk("há 7 lições/capítulos e 7 checagens de prática no total (a de prática não tem)", pg.locator(".chapter").count() == 7 and pg.locator(".tmv-chk").count() == 7, (pg.locator(".chapter").count(), pg.locator(".tmv-chk").count()))
    chk("'Faça agora' aparece destacado", pg.locator(".tmv-facaagora").count() == 6)
    cap1 = pg.locator(".chapter").first
    chk("confirmar leitura está TRAVADO até responder a checagem", cap1.locator(".read-toggle-big input").is_disabled() and "Responda a checagem" in cap1.inner_text())
    cap1.scroll_into_view_if_needed(); shot(pg, "02-licao-1-checagem-travada")
    cap1.locator(".tmv-op").nth(0).click(); pg.wait_for_timeout(300)
    chk("alternativa errada: avisa, marca e continua travado", cap1.locator(".tmv-fb.erro").count() == 1 and cap1.locator(".read-toggle-big input").is_disabled())
    chk("a alternativa errada não revela a certa", cap1.locator(".tmv-op.certa").count() == 0)
    cap1.locator(".tmv-chk").scroll_into_view_if_needed(); shot(pg, "03-checagem-errou")
    cap1.locator(".tmv-op").nth(1).click(); pg.wait_for_timeout(300)
    chk("alternativa certa: mostra a explicação e libera a confirmação de leitura", cap1.locator(".tmv-fb.ok").count() == 1 and not cap1.locator(".read-toggle-big input").is_disabled())
    shot(pg, "04-checagem-acertou")
    cap1.locator(".read-toggle-big input").check(force=True); pg.wait_for_timeout(500)
    chk("leitura confirmada vai ao servidor", CAPS[0]["id"] in st["lidos"], st["lidos"])
    # lição 5 tem duas checagens: só libera com as duas
    cap5 = pg.locator(".chapter").nth(4)
    chk("lição com duas checagens", cap5.locator(".tmv-chk").count() == 2)
    cap5.locator(".tmv-chk").nth(0).locator(".tmv-op").nth(1).click(); pg.wait_for_timeout(200)
    chk("só uma respondida: ainda travado", cap5.locator(".read-toggle-big input").is_disabled())
    cap5.locator(".tmv-chk").nth(1).locator(".tmv-op").nth(1).click(); pg.wait_for_timeout(200)
    chk("as duas respondidas: libera", not cap5.locator(".read-toggle-big input").is_disabled())
    print("== Painel do certificado bloqueado ==")
    chk("o painel 'Seu certificado' aparece no fim e o botão está bloqueado", pg.locator("#tmv-painel").count() == 1 and pg.locator("#tmv-emitir").is_disabled(), pg.inner_text("#tmv-painel")[:200])
    pg.locator("#tmv-painel").scroll_into_view_if_needed(); shot(pg, "05-painel-certificado-bloqueado")
    # ler o resto (todas as lições)
    for i in range(pg.locator(".chapter").count()):
        cap = pg.locator(".chapter").nth(i)
        for k in range(cap.locator(".tmv-chk").count()):
            ch = cap.locator(".tmv-chk").nth(k)
            if ch.locator(".tmv-op.certa").count() == 0: ch.locator(".tmv-op").nth(int(ch.get_attribute("data-correct"))).click(); pg.wait_for_timeout(120)
        cb = cap.locator(".read-toggle-big input")
        if not cb.is_checked(): cb.check(force=True); pg.wait_for_timeout(150)
    pg.wait_for_timeout(600)
    chk("todas as lições lidas no servidor", len(st["lidos"]) == 7, st["lidos"])
    print("== Prova com pergunta da regra de ouro ==")
    pg.click("#btn-ir-avaliacao"); pg.wait_for_timeout(700)
    pg.locator("#gate-ok").check(force=True); pg.click("#gate-start"); pg.wait_for_timeout(600)
    chk("a prova marca as perguntas da regra de ouro", pg.locator(".quiz-q .qn b").count() == 5 and "[CRÍTICA]" not in pg.inner_text("#quiz-form"))
    shot(pg, "06-prova-regra-de-ouro")
    def responder(erra_critica):
        for i in range(pg.locator(".quiz-q").count()):
            q = pg.locator(".quiz-q").nth(i); alvo = 1
            if erra_critica and i == 0: alvo = 0
            r = pg.locator('input[name="q%d"]' % i).nth(alvo); r.evaluate("e => e.scrollIntoView({block:'center'})"); r.check(force=True)
        pg.click("#quiz-corrigir"); pg.wait_for_timeout(900)
    responder(True)
    txt = pg.inner_text("#quiz-result")
    chk("90% com uma pergunta da regra de ouro errada: NÃO passa", "regra de ouro" in txt and "Ainda não" in txt, txt[:200])
    chk("o servidor recebe criticasErradas=1", st["resultados"] and st["resultados"][-1]["crit"] == 1, st["resultados"])
    shot(pg, "07-prova-errou-regra-de-ouro", full=True)
    pg.click("#retry-quiz"); pg.wait_for_selector("#gate-ok", timeout=15000); pg.locator("#gate-ok").check(force=True); pg.click("#gate-start"); pg.wait_for_selector("#quiz-corrigir", timeout=10000); pg.wait_for_timeout(1500)
    responder(False)
    chk("tudo certo: aprovado", "Aprovado" in pg.inner_text("#quiz-result"))
    shot(pg, "08-prova-aprovada")
    pg.click("#qr-reler"); pg.wait_for_timeout(800)
    pg.locator("#tmv-painel").scroll_into_view_if_needed()
    chk("painel: leitura ok, prova ok, falta só a prática; botão ainda bloqueado", pg.locator("#tmv-emitir").is_disabled() and pg.locator(".tmv-req li.ok").count() == 2, pg.inner_text("#tmv-painel"))
    shot(pg, "09-painel-falta-pratica")
    print("== Gestor valida a prática ==")
    pg.locator("#btn-admin-rh").click(); pg.wait_for_timeout(1200)
    pg.locator(".admin-tab", has_text="Prática").click(); pg.wait_for_timeout(900)
    chk("a aba 'Prática & Certificados' mostra os 5 itens da prática", pg.locator("#tmv-adm label.it").count() == 5, pg.inner_text("#tmv-adm")[:200])
    shot(pg, "10-gestor-pratica")
    pg.click("#tmv-aprovar"); pg.wait_for_timeout(500)
    chk("aprovar com itens desmarcados é barrado no próprio site", not st["praticas"])
    for i in range(5): pg.locator("#tmv-adm label.it input").nth(i).check(force=True)
    pg.click("#tmv-aprovar"); pg.wait_for_timeout(900)
    chk("prática aprovada é gravada com quem validou", st["praticas"] and st["praticas"][-1]["resultado"] == "aprovada" and st["praticas"][-1]["validadoPor"] == "Pablo Teste")
    shot(pg, "11-gestor-pratica-aprovada")
    print("== Certificado ==")
    pg.go_back(); pg.wait_for_timeout(300)
    pg.goto(BASE + "treinamentos.html"); pg.wait_for_timeout(2500)
    pg.locator(".card[data-manual='m900']").click(); pg.wait_for_timeout(1000)
    pg.locator("#tmv-painel").scroll_into_view_if_needed()
    chk("com os três requisitos o botão libera", not pg.locator("#tmv-emitir").is_disabled(), pg.inner_text("#tmv-painel"))
    shot(pg, "12-painel-liberado")
    pg.click("#tmv-emitir"); pg.wait_for_timeout(1500)
    chk("o certificado abre com nome, treinamento, código e QR", pg.locator("#tmv-cert").count() == 1 and "TK-7QX4-M2RB" in pg.inner_text("#tmv-cert") and "Pablo Teste" in pg.inner_text("#tmv-cert") and pg.locator("#tmv-qr svg").count() == 1)
    chk("o certificado NÃO mostra nota", not re.search(r"nota|\d+\s*%|\d+/\d+", pg.inner_text(".tmv-cert-page"), re.I), pg.inner_text(".tmv-cert-page"))
    shot(pg, "13-certificado")
    chk("sem erros de JavaScript", not erros, erros)
    ctx.close()
    print("== Funcionária comum não vê nada ==")
    c2 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", locale="pt-BR")
    c2.add_init_script(SESSION); st2 = instalar(c2, FUNC); q = c2.new_page(); q.on("pageerror", lambda e: erros.append(str(e)))
    q.goto(BASE + "treinamentos.html"); q.wait_for_timeout(2500)
    chk("funcionária não vê o módulo 0 na lista", "Módulo 0" not in q.inner_text("#app") and q.locator(".card[data-manual='m900']").count() == 0, q.inner_text("#app")[:200])
    c2.close()
    print("== Página pública de verificação ==")
    c3 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, service_workers="block", locale="pt-BR"); instalar(c3, FUNC); v = c3.new_page()
    v.goto(BASE + "verificar.html?c=TK-7QX4-M2RB"); v.wait_for_timeout(1200)
    t = v.inner_text("#r")
    chk("o código confere e mostra nome e treinamento, sem nota", "verificado" in t.lower() and "Pablo Teste" in t and "Módulo 0" in t and not re.search(r"nota|%", t, re.I), t)
    shot(v, "14-verificar-publico")
    v.fill("#c", "TK-0000-0000"); v.click("button[type=submit]"); v.wait_for_timeout(800)
    chk("código inventado: 'não encontrado'", "não encontrado" in v.inner_text("#r").lower(), v.inner_text("#r"))
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
