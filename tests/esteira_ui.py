"""Esteira de Produtos (v7.41.0; preparação 7.42.0): jornada da página esteira.html com catálogo, login e servidor da Esteira SIMULADOS.
Nada vai ao Google nem à Cloudflare. Celular (390) e computador (1440)."""
import json, os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TK_BASE', 'http://127.0.0.1:8777/')
OUT = Path(os.environ.get('TK_OUT', Path(__file__).parent / 'saida')); OUT.mkdir(parents=True, exist_ok=True)
ok, falhas = 0, []
def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1; print('  ✔ ' + nome)
    else: falhas.append(nome); print('  ✘ ' + nome + ('' if det is None else ' — ' + str(det)[:300]))

PRODUTOS = [
    {"ID": "1001", "Nome": "Vestido Midi Linho", "Codigo": "TK-1001", "Categoria": "Vestidos", "Genero": "Feminino Adulto", "Preco": "129.9", "Estoque": "4", "Tamanhos": "P, M, G", "Cores": "Preto, Areia", "Descricao": "Linho leve", "Novidade": "", "Foto_URL": "", "Fotos_Galeria": "", "Status": "Ativo", "Data_Cadastro": "2026-08-18T12:00:00Z"},
    {"ID": "1002", "Nome": "Vestido Longo Floral", "Codigo": "TK-1002", "Categoria": "Vestidos", "Genero": "Feminino Adulto", "Preco": "149.9", "Estoque": "2", "Tamanhos": "M, G", "Cores": "Azul", "Descricao": "", "Novidade": "", "Foto_URL": "", "Fotos_Galeria": "", "Status": "Ativo", "Data_Cadastro": "2026-07-01T12:00:00Z"},
    {"ID": "1003", "Nome": "Saia Plissada Midi", "Codigo": "TK-1003", "Categoria": "Saias", "Genero": "Feminino Adulto", "Preco": "89.9", "Estoque": "6", "Tamanhos": "P, M", "Cores": "Verde", "Descricao": "", "Novidade": "", "Foto_URL": "", "Fotos_Galeria": "", "Status": "Ativo", "Data_Cadastro": "2026-09-10T12:00:00Z"},
]
# v7.42.0: peça arquivada (fora do site) que está em preparação
ARQUIVADA = {"ID": "2001", "Nome": "Blusa Nova Tricô", "Codigo": "TK-2001", "Categoria": "Blusas", "Genero": "Feminino Adulto", "Preco": "99.9", "Estoque": "5", "Tamanhos": "P, M", "Cores": "Creme", "Descricao": "Tricô macio", "Novidade": "", "Foto_URL": "", "Fotos_Galeria": "", "Status": "Inativo", "Data_Cadastro": "2026-10-30T12:00:00Z"}
URL_FOTO = "https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202611/abcdef0123456789abcd.jpg"
def _png(w=40, h=50):                                  # foto PNG válida gerada aqui (nada de arquivo real)
    import struct, zlib
    bloco = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    linhas = b"".join(b"\x00" + bytes([230, 126, 34]) * w for _ in range(h))
    return b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + bloco(b"IDAT", zlib.compress(linhas)) + bloco(b"IEND", b"")
PNG = _png()

def instalar(ctx, admin=True):
    st = {"updates": [], "conferidas": [], "equipe": [{"whats": "88999999999", "nome": "Iara", "confere": 1, "rodizio": 1, "atendente": 1, "aceitar": 0, "ativo": 1}], "logou": False,
          "uploads": 0, "bulks": [], "bulk_falha": False, "aceitos": [], "preparados": [], "feitas": [], "cfgs": [],
          "prep": {"2001": [dict(id=11, tipo="cadastro", titulo="Cadastro conferido", funcao="Fotos"), dict(id=12, tipo="foto", titulo="1ª foto", funcao="Fotos"), dict(id=13, tipo="foto", titulo="Fotos de detalhe", funcao="Fotos"), dict(id=14, tipo="foto", titulo="Foto no manequim", funcao="Fotos"), dict(id=15, tipo="cores_tamanhos", titulo="Conferir cores e tamanhos", funcao="Fotos"), dict(id=16, tipo="outro", titulo="Passar etiqueta", funcao="Caixa")]},
          "outras": [dict(id=21, produto="1002", tipo="foto", titulo="Foto nova", funcao="Fotos", origem="conferencia", instrucao="Pedida na conferência por Iara.", produtoNome="Vestido Longo Floral", produtoCodigo="TK-1002", produtoFoto="")]}
    todos = PRODUTOS + [dict(ARQUIVADA)]
    def tarefa(t, pid):
        feita = t["id"] in st["feitas"]
        return dict({"produto": pid, "instrucao": "", "origem": "preparacao", "obs": "", "feita_em": "2026-11-01T12:00:00Z" if feita else "", "feita_por": "Iara" if feita else "", "quem": "Iara" if t["funcao"] == "Fotos" else ""}, **t, status="feita" if feita else "pendente", posso=admin or t["funcao"] == "Fotos")
    def preparacao():
        prods = []
        for pid, ts in st["prep"].items():
            x = next(p for p in todos if p["ID"] == pid); tt = [tarefa(t, pid) for t in ts]
            prods.append({"id": pid, "nome": x["Nome"], "codigo": x["Codigo"], "foto": x["Foto_URL"], "noSite": x["Status"] == "Ativo", "preparado_em": "2026-10-31T12:00:00Z", "preparado_por": "Pablo", "tarefas": tt, "feitas": sum(1 for t in tt if t["status"] == "feita"), "total": len(tt)})
        outras = [tarefa(t, t["produto"]) for t in st["outras"] if t["id"] not in st["feitas"]]
        return {"ok": True, "data": "2026-11-01", "eu": {"whats": "88999999999", "nome": "Iara", "admin": admin, "membro": True, "confere": True, "aceitar": admin}, "podeAceitar": admin, "funcoes": ["Limpeza", "Caixa", "Fotos", "Atendimento online"], "produtos": prods, "outras": outras}
    def tarefas_hoje():
        out = []
        for pid, ts in st["prep"].items():
            x = next(p for p in todos if p["ID"] == pid)
            out += [dict(tarefa(t, pid), produtoNome=x["Nome"], produtoCodigo=x["Codigo"], produtoFoto="", posso=True) for t in ts if t["funcao"] == "Fotos" and t["id"] not in st["feitas"]]
        return out + [dict(tarefa(t, t["produto"]), posso=True) for t in st["outras"] if t["id"] not in st["feitas"]]
    def item(p, feito=False):
        return {"id": p["ID"], "nome": p["Nome"], "codigo": p["Codigo"], "categoria": p["Categoria"], "genero": p["Genero"], "estoque": p["Estoque"], "tamanhos": p["Tamanhos"], "cores": p["Cores"], "foto": "", "cadastro": p["Data_Cadastro"], "grupo": p["Categoria"] + " · " + p["Genero"], "feito": feito, "atualizado_em": "", "conferido_em": "" if p["ID"] != "1003" else "2026-09-20T12:00:00Z"}
    def hd(route):
        req = route.request; u = req.url
        if "script.google.com" in u:
            if req.method == "GET" and "action=list" in u: return route.fulfill(json={"ok": True, "produtos": todos})
            b = json.loads(req.post_data or "{}")
            if b.get("action") == "login":
                st["logou"] = True
                return route.fulfill(json={"ok": True, "sessao": "tk3.teste.sessao", "usuario": {"whatsapp": "88999999999", "nome": "Iara", "permissoes": ["catalogo_cadastrar"] + (["gerir_acessos"] if admin else [])}})
            if b.get("action") == "update": st["updates"].append(b); return route.fulfill(json={"ok": True})
            if b.get("action") == "bulkUpdate":
                st["bulks"].append(b)
                if st["bulk_falha"]: return route.fulfill(json={"ok": False, "erro": "Sem permissão para reativar peças."})
                for x in todos:
                    if x["ID"] in b.get("ids", []): x["Status"] = "Ativo"
                return route.fulfill(json={"ok": True})
            if b.get("action") == "sessao": return route.fulfill(json={"ok": True, "usuario": {"whatsapp": "88999999999", "nome": "Iara", "permissoes": ["catalogo_cadastrar"]}})
            return route.fulfill(json={"ok": False, "erro": "Ação não simulada."})
        if "tenkiter-midia" in u and req.method == "POST":
            st["uploads"] += 1; st["upload_hdr"] = req.headers.get("x-tk-sessao")
            return route.fulfill(json={"ok": True, "url": URL_FOTO, "tipo": "foto"})
        if "tenkiter-ig" in u:
            path = re.sub(r"^https://[^/]+", "", u).split("?")[0]
            if path == "/esteira/hoje":
                lista = [item(p, p["ID"] in st["conferidas"]) for p in PRODUTOS]
                return route.fulfill(json={"ok": True, "data": "2026-11-01", "eu": {"whats": "88999999999", "nome": "Iara", "admin": admin, "membro": True, "confere": True, "aceitar": admin},
                    "lista": lista, "feitas": sum(1 for x in lista if x["feito"]), "total": len(lista),
                    "funcoes": [{"funcao": "Fotos", "instrucoes": "Fotografar as peças novas no manequim.\nConferir as fotos de detalhe."}], "tarefas": tarefas_hoje(),
                    "escala": [{"funcao": "Fotos", "whats": "88999999999", "nome": "Iara", "alterado": False}, {"funcao": "Caixa", "whats": "", "nome": "", "alterado": False}]})
            if path == "/esteira/conferir":
                b = json.loads(req.post_data or "{}"); st["conferidas"].append(b["id"]); st.setdefault("conf_corpos", []).append(b)
                return route.fulfill(json={"ok": True, "divergiu": True})
            if path == "/esteira/preparacao": return route.fulfill(json=preparacao())
            if path == "/esteira/tarefa":
                b = json.loads(req.post_data or "{}"); st.setdefault("tarefa_corpos", []).append(b)
                if b.get("feita") is False: st["feitas"] = [x for x in st["feitas"] if x != b["id"]]
                else: st["feitas"].append(b["id"])
                return route.fulfill(json={"ok": True})
            if path == "/esteira/toque": st.setdefault("toques", []).append(json.loads(req.post_data or "{}")); return route.fulfill(json={"ok": True, "registradas": 1})
            if path == "/esteira/preparar":
                if not admin: return route.fulfill(status=403, json={"ok": False, "erro": "Só o administrador total ou quem aceita peças para o site coloca peça em preparação."})
                b = json.loads(req.post_data or "{}"); st["preparados"].append(b["id"])
                st["prep"][b["id"]] = [dict(id=100 + k, tipo="outro", titulo=t, funcao="Fotos") for k, t in enumerate(["Cadastro conferido", "1ª foto"])]
                return route.fulfill(json={"ok": True, "criadas": 2})
            if path == "/esteira/aceitar":
                b = json.loads(req.post_data or "{}"); st["aceitos"].append(b["id"]); st["prep"].pop(b["id"], None)
                return route.fulfill(json={"ok": True, "dispensadas": 3})
            if not admin: return route.fulfill(status=403, json={"ok": False, "erro": "Só o administrador total acessa esta parte da Esteira."})
            if path == "/esteira/painel":
                return route.fulfill(json={"ok": True, "data": "2026-11-01", "progresso": [{"whats": "88999999999", "nome": "Iara", "total": 20, "feitas": 12}], "divergencia30": {"conferencias": 40, "divergentes": 3}, "idade": {"ate30": 182, "ate60": 96, "ate90": 41, "mais90": 63, "semData": 0}})
            if path == "/esteira/config" and req.method == "GET":
                return route.fulfill(json={"ok": True, "config": {"porPessoa": 20, "diasSemRepetir": 21, "pesos": {"nunca": 40, "diaConf": 1, "diaCadastro": 0.5, "diaSemEdicao": 0.3, "estoqueBaixo": 15, "divergiu": 20}, "funcoes": ["Limpeza", "Caixa", "Fotos", "Atendimento online"], "instrucoes": {"Fotos": "Fotografar no manequim."}, "modelosPreparacao": [{"tipo": "cadastro", "titulo": "Cadastro conferido", "instrucao": "Confira nome e preço.", "funcao": "Fotos"}, {"tipo": "foto", "titulo": "1ª foto", "instrucao": "", "funcao": "Fotos"}]},
                    "equipe": st["equipe"], "escalaPadrao": [{"dia": 1, "funcao": "Fotos", "whats": "88999999999"}], "hoje": "2026-11-01", "escalaHoje": {"Limpeza": {"whats": "", "alterado": False}, "Caixa": {"whats": "", "alterado": False}, "Fotos": {"whats": "88999999999", "alterado": False}, "Atendimento online": {"whats": "", "alterado": False}}})
            if path == "/esteira/equipe":
                b = json.loads(req.post_data or "{}")
                if len(re.sub(r"\D", "", b.get("whats", ""))) < 10: return route.fulfill(status=400, json={"ok": False, "erro": "Informe o WhatsApp da pessoa com DDD (é o mesmo do login dela)."})
                st["equipe"].append({"whats": re.sub(r"\D", "", b["whats"]), "nome": b["nome"], "confere": 1, "rodizio": 1, "atendente": 0, "aceitar": 0, "ativo": 1})
                return route.fulfill(json={"ok": True, "equipe": st["equipe"]})
            if path == "/esteira/config" and req.method == "POST": st["cfg"] = json.loads(req.post_data or "{}"); st["cfgs"].append(st["cfg"]); return route.fulfill(json={"ok": True})
            return route.fulfill(json={"ok": True})
        if u.startswith(BASE.rstrip("/")): return route.continue_()
        return route.abort()
    ctx.route("**/*", hd)
    return st

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for w, h in [(390, 844), (1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600)
        st = instalar(ctx)
        pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(BASE + "esteira.html"); pg.wait_for_selector("#login-w", timeout=8000)
        chk(f"{w}: sem login abre a tela de entrar", pg.locator("#login-s").is_visible())
        pg.fill("#login-w", "88999999999"); pg.fill("#login-s", "senha"); pg.click("text=Entrar >> nth=-1")
        pg.wait_for_selector(".peca", timeout=8000)
        chk(f"{w}: depois de entrar mostra a lista do dia", pg.locator(".peca").count() == 3 and st["logou"])
        chk(f"{w}: progresso 0/3 e grupos do dia", "0/3" in pg.inner_text("main") and "Vestidos" in pg.inner_text("main"))
        chk(f"{w}: função do dia com instruções", "Sua função hoje: Fotos" in pg.inner_text("main") and "manequim" in pg.inner_text("main"))
        chk(f"{w}: peças agrupadas por categoria", pg.locator(".grupo-tit").count() == 2)
        chk(f"{w}: nunca conferida aparece marcada", pg.locator(".chip.er").count() == 2)
        pg.screenshot(path=str(OUT / f"esteira_hoje_{w}.png"), full_page=True)
        pg.locator(".peca").first.click(); pg.wait_for_selector(".folha", timeout=4000)
        chk(f"{w}: conferência mostra cadastro, última atualização e conferência", all(x in pg.inner_text(".folha") for x in ["Cadastro", "Última atualização", "Última conferência", "18/08/26"]))
        pg.click("text=Salvar conferência")
        chk(f"{w}: sem contagem pede o número em português", "Digite quantas peças" in pg.inner_text(".folha") and not st["conferidas"])
        pg.fill("#conf-estoque", "2")
        chk(f"{w}: avisa que difere do site antes de salvar", "O site diz 4" in pg.inner_text(".folha"))
        pg.locator(".chips button", has_text="G").first.click()
        pg.screenshot(path=str(OUT / f"esteira_conferir_{w}.png"))
        pg.click("text=Salvar conferência"); pg.wait_for_selector(".folha", state="detached", timeout=6000)
        up = st["updates"][-1] if st["updates"] else {}
        chk(f"{w}: salva no catálogo estoque e tamanhos, mantendo o resto do produto", up.get("estoque") == "2" and up.get("tamanhos") == "P, M" and up.get("nome") == "Vestido Midi Linho" and up.get("descricao") == "Linho leve" and up.get("cores") == "Preto, Areia" and up.get("sessao") == "tk3.teste.sessao", up)
        chk(f"{w}: registra a conferência no servidor e atualiza o progresso", st["conferidas"] == ["1001"] and "1/3" in pg.inner_text("main"))
        pg.locator(".peca").nth(1).click(); pg.wait_for_selector(".folha"); pg.click("text=Não achei"); pg.click("text=Salvar conferência"); pg.wait_for_selector(".folha", state="detached", timeout=6000)
        chk(f"{w}: 'não achei' registra sem mexer no catálogo", len(st["updates"]) == 1 and st["conf_corpos"][-1]["achou"] is False)
        chk(f"{w}: sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        alvos = pg.evaluate("[...document.querySelectorAll('main button, nav button')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})")
        chk(f"{w}: botões com pelo menos 44 px", all(x >= 43.5 for x in alvos), alvos)
        # ---- v7.42.0: tarefas da função na aba Hoje ----
        th = pg.locator("#tarefas-hoje")
        chk(f"{w}: Hoje mostra 'Tarefas da sua função' com as 6 tarefas de Fotos", th.is_visible() and th.locator(".tarefa").count() == 6 and "Blusa Nova Tricô" in th.inner_text() and "Foto nova" in th.inner_text(), th.inner_text()[:300] if th.count() else "")
        th.locator('.tarefa[data-tarefa="11"] button', has_text="Feito").click()
        pg.wait_for_function("document.querySelectorAll('#tarefas-hoje .tarefa').length === 5", timeout=6000)
        chk(f"{w}: Feito no Hoje grava e tira a tarefa da lista", st["feitas"] == [11] and st["tarefa_corpos"][-1]["feita"] is True)
        # ---- aba Preparação ----
        pg.click("nav.abas >> text=Preparação"); pg.wait_for_selector("text=Blusa Nova Tricô", timeout=6000)
        card = pg.locator('[data-produto="2001"]')
        chk(f"{w}: Preparação mostra a peça, progresso 1/6 e que está fora do site", "1/6" in card.inner_text() and "fora do site até ser aceita" in card.inner_text() and "Cadastro conferido — feita" in card.inner_text(), card.inner_text()[:300])
        chk(f"{w}: Preparação lista 'Outras tarefas' (foto nova da conferência)", "Outras tarefas" in pg.inner_text("main") and "Vestido Longo Floral" in pg.inner_text("main"))
        # foto dentro da tarefa: mesmo caminho do painel (servidor de fotos) e pacote completo do update
        card.locator('.tarefa[data-tarefa="12"] input.arq-foto').set_input_files({"name": "foto.png", "mimeType": "image/png", "buffer": PNG})
        pg.wait_for_selector("text=1 foto adicionada ao produto", timeout=8000)
        up = st["updates"][-1] if st["updates"] else {}
        chk(f"{w}: foto sobe ao servidor de fotos com a sessão e vira capa da peça sem foto", st["uploads"] == 1 and st["upload_hdr"] == "tk3.teste.sessao" and up.get("id") == "2001" and up.get("fotoUrlExistente") == URL_FOTO and up.get("nome") == "Blusa Nova Tricô" and up.get("descricao") == "Tricô macio" and up.get("sessao") == "tk3.teste.sessao", up)
        chk(f"{w}: foto conta como atualização à mão e preenche a observação", (st.get("toques") or [{}])[-1].get("ids") == ["2001"] and card.locator('.tarefa[data-tarefa="12"] input[type=text]').input_value() == "1 foto enviada pela Esteira")
        card.locator('.tarefa[data-tarefa="12"] button', has_text="Feito").click()
        pg.wait_for_selector('[data-produto="2001"] >> text=2/6', timeout=6000)
        chk(f"{w}: Feito na Preparação leva a observação e avança o progresso", st["tarefa_corpos"][-1] == {"id": 12, "feita": True, "obs": "1 foto enviada pela Esteira"}, st["tarefa_corpos"][-1])
        pg.screenshot(path=str(OUT / f"esteira_prep_{w}.png"), full_page=True)
        # aceitar: confirmação no próprio botão; catálogo recusa → erro legível, nada registrado
        st["bulk_falha"] = True
        ac = pg.locator('[data-produto="2001"] button.aceitar'); ac.click()
        chk(f"{w}: aceitar pede confirmação no botão (faltam 4 tarefas)", "Faltam 4 tarefas" in ac.inner_text() and not st["bulks"], ac.inner_text())
        ac.click(); pg.wait_for_selector("text=Sem permissão para reativar peças.", timeout=6000)
        chk(f"{w}: catálogo recusou: erro legível, aceite não registrado e botão volta", st["aceitos"] == [] and len(st["bulks"]) == 1 and ac.inner_text() == "Aceitar para o site")
        st["bulk_falha"] = False
        ac.click(); ac.click(); pg.wait_for_selector("text=Nenhuma peça em preparação agora.", timeout=6000)
        bk = st["bulks"][-1]
        chk(f"{w}: aceitar reativa no catálogo (bulkUpdate reativar) antes de registrar", bk.get("tipoAcao") == "reativar" and bk.get("ids") == ["2001"] and bk.get("sessao") == "tk3.teste.sessao" and bk.get("whatsapp") == "88999999999" and st["aceitos"] == ["2001"], bk)
        # colocar peça em preparação (busca no catálogo)
        pg.click("text=Colocar peça em preparação"); pg.fill("#prep-busca", "saia")
        pg.wait_for_selector(".busca-res >> text=Saia Plissada Midi", timeout=6000)
        pg.click(".busca-res >> text=Saia Plissada Midi"); pg.wait_for_selector('[data-produto="1003"]', timeout=6000)
        chk(f"{w}: colocar em preparação cria a peça com tarefas", st["preparados"] == ["1003"] and "0/2" in pg.locator('[data-produto="1003"]').inner_text())
        pg.locator('[data-produto="1003"] button.aceitar').click(); pg.locator('[data-produto="1003"] button.aceitar').click(); pg.wait_for_selector("text=Nenhuma peça em preparação agora.", timeout=6000)
        chk(f"{w}: peça já ativa: aceita sem reativar no catálogo", st["aceitos"] == ["2001", "1003"] and len(st["bulks"]) == 2)
        chk(f"{w}: Preparação sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        alvos = pg.evaluate("[...document.querySelectorAll('main button, nav button')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})")
        chk(f"{w}: Preparação com botões de pelo menos 44 px", all(x >= 43.5 for x in alvos), alvos)
        # Admin total
        pg.click("nav.abas >> text=Painel"); pg.wait_for_selector("text=Conferência de hoje")
        chk(f"{w}: painel mostra progresso, diferença e idade", all(x in pg.inner_text("main") for x in ["12/20", "3 de 40", "mais de 90 dias"]))
        pg.click("nav.abas >> text=Configurações"); pg.wait_for_selector("text=Incluir pessoa")
        chk(f"{w}: configurações com equipe, escala de hoje, padrão e regras", all(x in pg.inner_text("main") for x in ["Equipe", "Escala de hoje", "Padrão da semana", "Pesos da escolha"]))
        pg.fill("#eq-nome", "Clarice"); pg.fill("#eq-whats", "123"); pg.click("text=Incluir na equipe"); pg.wait_for_timeout(300)
        chk(f"{w}: WhatsApp curto mostra erro legível", "com DDD" in pg.inner_text("main"))
        pg.fill("#eq-whats", "(88) 99999-0003"); pg.click("text=Incluir na equipe"); pg.wait_for_timeout(500)
        chk(f"{w}: pessoa incluída aparece na equipe", "Clarice · 88999990003" in pg.inner_text("main"))
        pg.click("text=Salvar funções e regras"); pg.wait_for_timeout(300)
        chk(f"{w}: regras salvas com instruções", "Salvo." in pg.inner_text("main") and "Fotos" in json.dumps(st.get("cfg", {})))
        chk(f"{w}: configurações mostram as tarefas da preparação e quem aceita", "Tarefas da preparação" in pg.inner_text("main") and "Aceitam para o site: administrador total." in pg.inner_text("main"))
        pg.fill("#mod-titulo-0", "Cadastro revisado"); pg.click("#cfg-preparacao >> text=Acrescentar tarefa"); pg.fill("#mod-titulo-2", "Etiqueta")
        pg.click("text=Salvar tarefas da preparação"); pg.wait_for_selector("text=Vale para as próximas peças", timeout=4000)
        mp = st["cfgs"][-1].get("config", {})
        chk(f"{w}: modelos salvos sozinhos (sem mexer nas regras)", [m["titulo"] for m in mp.get("modelosPreparacao", [])] == ["Cadastro revisado", "1ª foto", "Etiqueta"] and mp["modelosPreparacao"][1]["tipo"] == "foto" and "porPessoa" not in mp, mp)
        chk(f"{w}: configurações sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        pg.screenshot(path=str(OUT / f"esteira_config_{w}.png"), full_page=True)
        chk(f"{w}: sem erro de JavaScript", not erros, erros)
        ctx.close()
    # funcionária sem Admin total: sem abas de gestão
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    instalar(ctx, admin=False); ctx.add_init_script("localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999999999',sessao:'tk3.teste.sessao'}));")
    pg = ctx.new_page(); pg.goto(BASE + "esteira.html"); pg.wait_for_selector(".peca", timeout=8000)
    chk("funcionária vê Hoje e Preparação, sem Painel nem Configurações", pg.locator("nav.abas button").all_inner_texts() == ["Hoje", "Preparação"] and "Configurações" not in pg.inner_text("body"), pg.locator("nav.abas button").all_inner_texts())
    pg.click("nav.abas >> text=Preparação"); pg.wait_for_selector("text=Blusa Nova Tricô", timeout=6000)
    chk("funcionária não coloca peça nem aceita para o site", pg.locator("text=Colocar peça em preparação").count() == 0 and pg.locator("button.aceitar").count() == 0)
    chk("tarefa de outra função aparece sem botão Feito", pg.locator('.tarefa[data-tarefa="16"] button').count() == 0 and pg.locator('.tarefa[data-tarefa="11"] button', has_text="Feito").count() == 1)
    pg.screenshot(path=str(OUT / "esteira_prep_funcionaria_390.png"), full_page=True)
    ctx.close(); b.close()
print(f"OK={ok} FALHAS={len(falhas)} {falhas}")
sys.exit(1 if falhas else 0)
