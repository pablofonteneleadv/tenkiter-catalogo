"""Esteira de Produtos (v7.41.0): jornada da página esteira.html com catálogo, login e servidor da Esteira SIMULADOS.
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

def instalar(ctx, admin=True):
    st = {"updates": [], "conferidas": [], "equipe": [{"whats": "88999999999", "nome": "Iara", "confere": 1, "rodizio": 1, "atendente": 1, "aceitar": 0, "ativo": 1}], "logou": False}
    def item(p, feito=False):
        return {"id": p["ID"], "nome": p["Nome"], "codigo": p["Codigo"], "categoria": p["Categoria"], "genero": p["Genero"], "estoque": p["Estoque"], "tamanhos": p["Tamanhos"], "cores": p["Cores"], "foto": "", "cadastro": p["Data_Cadastro"], "grupo": p["Categoria"] + " · " + p["Genero"], "feito": feito, "atualizado_em": "", "conferido_em": "" if p["ID"] != "1003" else "2026-09-20T12:00:00Z"}
    def hd(route):
        req = route.request; u = req.url
        if "script.google.com" in u:
            if req.method == "GET" and "action=list" in u: return route.fulfill(json={"ok": True, "produtos": PRODUTOS})
            b = json.loads(req.post_data or "{}")
            if b.get("action") == "login":
                st["logou"] = True
                return route.fulfill(json={"ok": True, "sessao": "tk3.teste.sessao", "usuario": {"whatsapp": "88999999999", "nome": "Iara", "permissoes": ["catalogo_cadastrar"] + (["gerir_acessos"] if admin else [])}})
            if b.get("action") == "update": st["updates"].append(b); return route.fulfill(json={"ok": True})
            if b.get("action") == "sessao": return route.fulfill(json={"ok": True, "usuario": {"whatsapp": "88999999999", "nome": "Iara", "permissoes": ["catalogo_cadastrar"]}})
            return route.fulfill(json={"ok": False, "erro": "Ação não simulada."})
        if "tenkiter-ig" in u:
            path = re.sub(r"^https://[^/]+", "", u).split("?")[0]
            if path == "/esteira/hoje":
                lista = [item(p, p["ID"] in st["conferidas"]) for p in PRODUTOS]
                return route.fulfill(json={"ok": True, "data": "2026-11-01", "eu": {"whats": "88999999999", "nome": "Iara", "admin": admin, "membro": True, "confere": True, "aceitar": admin},
                    "lista": lista, "feitas": sum(1 for x in lista if x["feito"]), "total": len(lista),
                    "funcoes": [{"funcao": "Fotos", "instrucoes": "Fotografar as peças novas no manequim.\nConferir as fotos de detalhe."}],
                    "escala": [{"funcao": "Fotos", "whats": "88999999999", "nome": "Iara", "alterado": False}, {"funcao": "Caixa", "whats": "", "nome": "", "alterado": False}]})
            if path == "/esteira/conferir":
                b = json.loads(req.post_data or "{}"); st["conferidas"].append(b["id"]); st.setdefault("conf_corpos", []).append(b)
                return route.fulfill(json={"ok": True, "divergiu": True})
            if not admin: return route.fulfill(status=403, json={"ok": False, "erro": "Só o administrador total acessa esta parte da Esteira."})
            if path == "/esteira/painel":
                return route.fulfill(json={"ok": True, "data": "2026-11-01", "progresso": [{"whats": "88999999999", "nome": "Iara", "total": 20, "feitas": 12}], "divergencia30": {"conferencias": 40, "divergentes": 3}, "idade": {"ate30": 182, "ate60": 96, "ate90": 41, "mais90": 63, "semData": 0}})
            if path == "/esteira/config" and req.method == "GET":
                return route.fulfill(json={"ok": True, "config": {"porPessoa": 20, "diasSemRepetir": 21, "pesos": {"nunca": 40, "diaConf": 1, "diaCadastro": 0.5, "diaSemEdicao": 0.3, "estoqueBaixo": 15, "divergiu": 20}, "funcoes": ["Limpeza", "Caixa", "Fotos", "Atendimento online"], "instrucoes": {"Fotos": "Fotografar no manequim."}},
                    "equipe": st["equipe"], "escalaPadrao": [{"dia": 1, "funcao": "Fotos", "whats": "88999999999"}], "hoje": "2026-11-01", "escalaHoje": {"Limpeza": {"whats": "", "alterado": False}, "Caixa": {"whats": "", "alterado": False}, "Fotos": {"whats": "88999999999", "alterado": False}, "Atendimento online": {"whats": "", "alterado": False}}})
            if path == "/esteira/equipe":
                b = json.loads(req.post_data or "{}")
                if len(re.sub(r"\D", "", b.get("whats", ""))) < 10: return route.fulfill(status=400, json={"ok": False, "erro": "Informe o WhatsApp da pessoa com DDD (é o mesmo do login dela)."})
                st["equipe"].append({"whats": re.sub(r"\D", "", b["whats"]), "nome": b["nome"], "confere": 1, "rodizio": 1, "atendente": 0, "aceitar": 0, "ativo": 1})
                return route.fulfill(json={"ok": True, "equipe": st["equipe"]})
            if path == "/esteira/config" and req.method == "POST": st["cfg"] = json.loads(req.post_data or "{}"); return route.fulfill(json={"ok": True})
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
        chk(f"{w}: configurações sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        pg.screenshot(path=str(OUT / f"esteira_config_{w}.png"), full_page=True)
        chk(f"{w}: sem erro de JavaScript", not erros, erros)
        ctx.close()
    # funcionária sem Admin total: sem abas de gestão
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    instalar(ctx, admin=False); ctx.add_init_script("localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999999999',sessao:'tk3.teste.sessao'}));")
    pg = ctx.new_page(); pg.goto(BASE + "esteira.html"); pg.wait_for_selector(".peca", timeout=8000)
    chk("funcionária não vê Painel nem Configurações", pg.locator("nav.abas").is_hidden() and "Configurações" not in pg.inner_text("body"), [pg.locator("nav.abas").is_hidden(), pg.inner_text("body")[:400]])
    ctx.close(); b.close()
print(f"OK={ok} FALHAS={len(falhas)} {falhas}")
sys.exit(1 if falhas else 0)
