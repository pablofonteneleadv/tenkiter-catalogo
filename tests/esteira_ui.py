"""Esteira de Produtos (v7.41.0; preparação 7.42.0; pedidos 7.43.0): jornada da página esteira.html com catálogo, login e servidor da Esteira SIMULADOS.
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
          "uploads": 0, "bulks": [], "bulk_falha": False, "pedidos": {}, "seq_ped": 0, "seq_item": 0, "salvos": [], "ped_corpos": [], "creates": [], "ops": {}, "estoques": {}, "arquivar_falha": False, "aceitos": [], "preparados": [], "feitas": [], "cfgs": [],
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
    # ---- v7.43.0: servidor de pedidos SIMULADO (mesmas regras do worker: a equipe nunca recebe custo nem quantidade pedida) ----
    def situacao(it):
        if it["tipo"] == "extra": return "extra"
        if it.get("nao_veio"): return "nao_veio"
        if it.get("qtd_contada") is None: return "sem_contagem"
        c, q = it["qtd_contada"], it["qtd_pedida"]
        return "bateu" if c == q else "nao_veio" if c == 0 else "faltou" if c < q else "sobrou"
    def ped_admin(p):
        return dict({k: v for k, v in p.items() if k != "itens"}, itens=[dict(it, situacao=situacao(it)) for it in p["itens"]])
    def ped_equipe(p):
        its = [{"id": it["id"], "tipo": it["tipo"], "nome": it["nome"], "tamanhos": it.get("tamanhos", ""), "cores": it.get("cores", ""), "fotos": it.get("fotos", []), "qtd_contada": it.get("qtd_contada"), "contagens": it.get("contagens", 0), "nao_veio": bool(it.get("nao_veio")), "contado": it.get("qtd_contada") is not None or bool(it.get("nao_veio")), "bateu": None if it["tipo"] == "extra" or it.get("qtd_contada") is None or it.get("nao_veio") else situacao(it) == "bateu"} for it in p["itens"]]
        return {"id": p["id"], "fornecedor": p["fornecedor"], "previsao": p["previsao"], "status": p["status"], "itens": its}
    def resumo(p):
        n = [it for it in p["itens"] if it["tipo"] != "extra"]
        return {"id": p["id"], "fornecedor": p["fornecedor"], "previsao": p["previsao"], "status": p["status"], "itens": len(n), "contados": sum(1 for it in n if it.get("qtd_contada") is not None or it.get("nao_veio")), "faltaAplicar": sum(1 for it in p["itens"] if (it.get("qtd_aceita") or 0) > 0 and not it.get("aplicado_em"))}
    def pedidos_rota(route, req, path):
        b = json.loads(req.post_data or "{}") if req.method == "POST" else {}
        pid = int(b.get("id") or 0) if req.method == "POST" else int((re.search(r"[?&]id=(\d+)", req.url) or [0, 0])[1])
        p = st["pedidos"].get(pid)
        st["ped_corpos"].append((path, b))
        J = lambda d, s=200: route.fulfill(status=s, json=d)
        acha = lambda: next((it for it in p["itens"] if it["id"] == int(b.get("item") or 0)), None)
        if path == "/esteira/pedidos":
            if admin: return J({"ok": True, "admin": True, "pedidos": [resumo(x) for x in sorted(st["pedidos"].values(), key=lambda x: -x["id"])]})
            return J({"ok": True, "admin": False, "pedidos": [{k: v for k, v in resumo(x).items() if k != "faltaAplicar"} for x in st["pedidos"].values() if x["status"] == "a_caminho"]})
        if path == "/esteira/pedidos/abrir":
            if admin: return J({"ok": True, "admin": True, "pedido": ped_admin(p)})
            if p["status"] != "a_caminho": return J({"ok": False, "erro": "Este pedido já foi conferido e está com o administrador."}, 403)
            return J({"ok": True, "admin": False, "pedido": ped_equipe(p)})
        if path == "/esteira/pedidos/contar":
            it = acha(); it["qtd_contada"] = int(b["qtd"]); it["contagens"] = it.get("contagens", 0) + 1; it["nao_veio"] = False
            return J({"ok": True, "item": it["id"], "bateu": None if it["tipo"] == "extra" else situacao(it) == "bateu", "contagens": it["contagens"]})
        if path == "/esteira/pedidos/nao-veio":
            it = acha(); it["nao_veio"] = b.get("naoVeio") is not False; it["qtd_contada"] = 0 if it["nao_veio"] else None
            return J({"ok": True, "item": it["id"], "naoVeio": it["nao_veio"]})
        if path == "/esteira/pedidos/extra":
            st["seq_item"] += 1; p["itens"].append({"id": st["seq_item"], "tipo": "extra", "nome": b["nome"].strip(), "fotos": b.get("fotos", []), "qtd_pedida": 0, "custo": None, "qtd_contada": b["qtd"], "contagens": 1, "nao_veio": False, "decisao": "", "qtd_aceita": None, "produto_criado": "", "aplicado_em": "", "categoria": "", "genero": "", "preco": "", "tamanhos": "", "cores": ""})
            return J({"ok": True, "item": st["seq_item"]})
        if path == "/esteira/pedidos/extra-remover":
            p["itens"] = [it for it in p["itens"] if not (it["id"] == int(b["item"]) and it["tipo"] == "extra")]; return J({"ok": True})
        if path == "/esteira/pedidos/concluir":
            falta = sum(1 for it in p["itens"] if it["tipo"] != "extra" and it.get("qtd_contada") is None and not it.get("nao_veio"))
            if falta: return J({"ok": False, "erro": f"Faltam contar {falta} itens."}, 400)
            p["status"] = "conferido"; p["conferido_por"] = "Iara"; p["conferido_em"] = "2026-11-01T15:00:00Z"; return J({"ok": True, "status": "conferido"})
        if not admin: return J({"ok": False, "erro": "Só o administrador total cuida do pedido, dos custos e da aprovação."}, 403)
        if path == "/esteira/pedidos/salvar":
            if not str(b.get("fornecedor", "")).strip(): return J({"ok": False, "erro": "Informe o fornecedor."}, 400)
            if not p:
                st["seq_ped"] += 1; p = {"id": st["seq_ped"], "status": "rascunho", "itens": [], "criado_em": "2026-11-01T12:00:00Z", "conferido_por": "", "conferido_em": "", "aprovado_em": ""}; st["pedidos"][p["id"]] = p
            antigos = {it["id"]: it for it in p["itens"]}; novos = []
            for x in b.get("itens", []):
                if not x.get("id"): st["seq_item"] += 1
                iid = x.get("id") or st["seq_item"]; base = antigos.get(iid, {"qtd_contada": None, "contagens": 0, "nao_veio": False, "decisao": "", "qtd_aceita": None, "produto_criado": "", "aplicado_em": ""})
                c = str(x.get("custo") or "").replace(",", ".")
                novos.append(dict(base, id=iid, tipo=x["tipo"], produto=x.get("produto", ""), nome=x["nome"], categoria=x.get("categoria", ""), genero=x.get("genero", ""), preco=str(x.get("preco") or "").replace(",", "."), tamanhos=x.get("tamanhos", ""), cores=x.get("cores", ""), fotos=x.get("fotos", []), qtd_pedida=int(x.get("qtd_pedida") or 0), custo=float(c) if c else None))
            p.update(fornecedor=b["fornecedor"].strip(), previsao=b.get("previsao", ""), obs=b.get("obs", ""), fotos=b.get("fotos", []), itens=novos + [it for it in p["itens"] if it["tipo"] == "extra"])
            st["salvos"].append(b); return J({"ok": True, "pedido": ped_admin(p)})
        if path == "/esteira/pedidos/enviar": p["status"] = "a_caminho"; return J({"ok": True, "status": "a_caminho"})
        if path == "/esteira/pedidos/cancelar": p["status"] = "cancelado"; return J({"ok": True, "status": "cancelado"})
        if path == "/esteira/pedidos/decidir":
            it = acha(); it["decisao"] = b["decisao"]
            for k in ["nome", "categoria", "genero", "tamanhos", "cores"]:
                if b.get(k) is not None: it[k] = b[k].strip() or it[k]
            if b.get("preco") is not None: it["preco"] = b["preco"].replace(",", ".")
            if b.get("custo") is not None: it["custo"] = float(str(b["custo"]).replace(",", "."))
            return J({"ok": True, "item": dict(it, situacao=situacao(it))})
        if path == "/esteira/pedidos/aprovar":
            pend = [it for it in p["itens"] if situacao(it) != "bateu" and not it.get("decisao")]
            if pend: return J({"ok": False, "erro": f"Decida os {len(pend)} itens com diferença antes de aprovar."}, 400)
            for it in p["itens"]:
                s, c = situacao(it), it.get("qtd_contada") or 0
                it["qtd_aceita"] = 0 if it.get("nao_veio") else ((0 if s == "extra" else min(c, it["qtd_pedida"])) if it.get("decisao") == "devolver" else c)
                if it["qtd_aceita"] == 0: it["aplicado_em"] = "2026-11-01T16:00:00Z"
            p["status"] = "aprovado"; p["aprovado_em"] = "2026-11-01T16:00:00Z"; return J({"ok": True, "pedido": ped_admin(p)})
        if path == "/esteira/pedidos/aplicado":
            it = acha()
            if it.get("aplicado_em"): return J({"ok": True, "jaAplicado": True, "item": dict(it, situacao=situacao(it)), "produtoCriado": it.get("produto_criado", "")})
            fase = b.get("fase", "fim")
            if fase == "inicio":
                if "aplic" not in it or b.get("refazer"): it["aplic"] = {"antes": int(b["antes"]), "depois": int(b["antes"]) + it["qtd_aceita"]}
                return J({"ok": True, "aplic": it["aplic"]})
            if fase == "criado":
                if not it.get("produto_criado"): it["produto_criado"] = b["produtoCriado"]
                return J({"ok": True, "produtoCriado": it["produto_criado"]})
            it["aplicado_em"] = "2026-11-01T16:05:00Z"; return J({"ok": True, "item": dict(it, situacao=situacao(it))})
        return J({"ok": False, "erro": "Ação de pedido não simulada."}, 404)
    def hd(route):
        req = route.request; u = req.url
        if "script.google.com" in u:
            if req.method == "GET" and "action=list" in u: return route.fulfill(json={"ok": True, "produtos": [dict(x, Estoque=st["estoques"].get(x["ID"], x.get("Estoque", ""))) for x in todos]})
            b = json.loads(req.post_data or "{}")
            if b.get("action") == "login":
                st["logou"] = True
                return route.fulfill(json={"ok": True, "sessao": "tk3.teste.sessao", "usuario": {"whatsapp": "88999999999", "nome": "Iara", "permissoes": ["catalogo_cadastrar"] + (["gerir_acessos"] if admin else [])}})
            if b.get("action") == "update": st["updates"].append(b); st["estoques"][str(b.get("id"))] = b.get("estoque", ""); return route.fulfill(json={"ok": True})
            if b.get("action") == "create":                      # v7.43.0: produto novo do pedido (opId: reenviar devolve o mesmo)
                st["creates"].append(b)
                if b.get("opId") not in st["ops"]:
                    nid = str(7001 + len(st["ops"])); st["ops"][b.get("opId")] = nid
                    todos.append({"ID": nid, "Nome": b["nome"], "Codigo": "TK-" + nid, "Categoria": b["categoria"], "Genero": b["genero"], "Preco": b["preco"], "Estoque": b["estoque"], "Tamanhos": b["tamanhos"], "Cores": b["cores"], "Descricao": "", "Novidade": "", "Foto_URL": b["fotoUrlExistente"], "Fotos_Galeria": b["fotosGaleriaExistentes"], "Status": "Ativo", "Data_Cadastro": "2026-11-01T16:00:00Z"})
                nid = st["ops"][b.get("opId")]
                return route.fulfill(json={"ok": True, "id": nid, "codigo": "TK-" + nid})
            if b.get("action") == "bulkUpdate" and b.get("tipoAcao") == "arquivar":
                st["bulks"].append(b)
                if st["arquivar_falha"]: st["arquivar_falha"] = False; return route.fulfill(json={"ok": False, "erro": "O catálogo está ocupado agora."})
                for x in todos:
                    if x["ID"] in b.get("ids", []): x["Status"] = "Inativo"
                return route.fulfill(json={"ok": True})
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
            if path.startswith("/esteira/pedidos"): return pedidos_rota(route, req, path)
            if path == "/esteira/hoje":
                lista = [item(p, p["ID"] in st["conferidas"]) for p in PRODUTOS]
                return route.fulfill(json={"ok": True, "data": "2026-11-01", "eu": {"whats": "88999999999", "nome": "Iara", "admin": admin, "membro": True, "confere": True, "aceitar": admin},
                    "pedidos": ({"conferir": 0, "aprovar": sum(1 for x in st["pedidos"].values() if x["status"] == "conferido"), "aplicar": sum(1 for x in st["pedidos"].values() if x["status"] == "aprovado" and any((i.get("qtd_aceita") or 0) > 0 and not i.get("aplicado_em") for i in x["itens"]))} if admin else {"conferir": sum(1 for x in st["pedidos"].values() if x["status"] == "a_caminho")}),
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
        pg.click("nav.abas button[data-aba=prep]"); pg.wait_for_selector("text=Blusa Nova Tricô", timeout=6000)
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
        pg.click("nav.abas button[data-aba=painel]"); pg.wait_for_selector("text=Conferência de hoje")
        chk(f"{w}: painel mostra progresso, diferença e idade", all(x in pg.inner_text("main") for x in ["12/20", "3 de 40", "mais de 90 dias"]))
        pg.click("nav.abas button[data-aba=config]"); pg.wait_for_selector("text=Incluir pessoa")
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
        # ---- v7.43.0: pedido ao fornecedor → chegada (contagem cega) → aprovação → catálogo ----
        pg.click("nav.abas button[data-aba=pedidos]"); pg.wait_for_selector("text=Pedidos ao fornecedor", timeout=6000)
        chk(f"{w}: aba Pedidos do Admin explica que custo é só dela", "Custo e quantidade pedida aparecem só para você" in pg.inner_text("main") and "Nenhum pedido ainda" in pg.inner_text("main"))
        pg.click("text=Novo pedido"); pg.wait_for_selector("#ped-fornecedor")
        pg.fill("#ped-fornecedor", "Confecção Aurora"); pg.fill("#ped-previsao", "2026-11-05")
        pg.locator("#ped-editor input.arq-foto").set_input_files({"name": "nota.png", "mimeType": "image/png", "buffer": PNG}); pg.wait_for_selector("#ped-editor >> text=Foto enviada.", timeout=6000)
        pg.click("text=+ Peça do catálogo"); pg.wait_for_selector("#ped-busca"); pg.fill("#ped-busca", "saia")
        pg.wait_for_selector(".folha .busca-res >> text=Saia Plissada Midi", timeout=6000); pg.click(".folha .busca-res >> text=Saia Plissada Midi"); pg.wait_for_selector(".folha", state="detached")
        pg.locator("input.qtd-ped").nth(0).fill("5"); pg.locator("input.custo-ped").nth(0).fill("45,90")
        pg.click("text=+ Peça do catálogo"); pg.fill("#ped-busca", "longo"); pg.click(".folha .busca-res >> text=Vestido Longo Floral"); pg.wait_for_selector(".folha", state="detached")
        pg.locator("input.qtd-ped").nth(1).fill("4"); pg.locator("input.custo-ped").nth(1).fill("60")
        pg.click("text=+ Produto novo"); pg.wait_for_selector("#novo-nome"); pg.fill("#novo-nome", "Vestido Chemise Verde")
        pg.click("text=Incluir no pedido")
        chk(f"{w}: produto novo sem categoria/público: aviso em português", "Informe a categoria e o público" in pg.inner_text(".folha"))
        pg.fill("#novo-categoria", "Vestidos"); pg.fill("#novo-genero", "Feminino Adulto"); pg.fill("#novo-preco", "159,90"); pg.fill("#novo-tamanhos", "P, M, G"); pg.fill("#novo-cores", "Verde")
        pg.locator(".folha input.arq-foto").set_input_files({"name": "forn.png", "mimeType": "image/png", "buffer": PNG}); pg.wait_for_selector(".folha >> text=Foto enviada.", timeout=6000)
        pg.screenshot(path=str(OUT / f"esteira_pedido_novo_produto_{w}.png"))
        pg.click("text=Incluir no pedido"); pg.wait_for_selector(".folha", state="detached")
        pg.locator("input.qtd-ped").nth(2).fill("6"); pg.locator("input.custo-ped").nth(2).fill("70")
        chk(f"{w}: editor soma peças e custo (só para o Admin)", "Total: 15 peças · custo R$ 889,50" in pg.inner_text("main"), pg.inner_text("main")[-300:])
        pg.screenshot(path=str(OUT / f"esteira_pedido_editor_{w}.png"), full_page=True)
        chk(f"{w}: editor sem rolagem horizontal e botões ≥ 44 px", pg.evaluate("document.documentElement.scrollWidth <= innerWidth") and all(x >= 43.5 for x in pg.evaluate("[...document.querySelectorAll('main button')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})")))
        pg.click("#ped-enviar"); pg.wait_for_selector("text=A caminho", timeout=6000)
        sv = st["salvos"][-1]
        chk(f"{w}: pedido salvo com fornecedor, previsão, fotos e itens (reposição + novo com custo)", sv["fornecedor"] == "Confecção Aurora" and sv["previsao"] == "2026-11-05" and sv["fotos"] == [URL_FOTO] and [i["tipo"] for i in sv["itens"]] == ["reposicao", "reposicao", "novo"] and sv["itens"][0]["produto"] == "1003" and sv["itens"][0]["custo"] == "45,90" and sv["itens"][2]["fotos"] == [URL_FOTO] and sv["itens"][2]["categoria"] == "Vestidos" and st["pedidos"][1]["status"] == "a_caminho", sv)
        # chegada: o Admin também pode contar pela tela da equipe (contagem cega)
        pg.click('.peca.pedido[data-pedido="1"]'); pg.wait_for_selector("text=Conferir chegada (contagem cega)"); pg.click("text=Conferir chegada (contagem cega)")
        pg.wait_for_selector(".item-cont", timeout=6000)
        txt = pg.inner_text("main")
        chk(f"{w}: contagem cega: nada de custo nem quantidade pedida na tela", "R$" not in txt and "45,90" not in txt and "Pedido:" not in txt and "0/3" in txt, txt[:400])
        card = lambda nome: pg.locator(".item-cont", has_text=nome)
        card("Saia Plissada Midi").locator("input.qtd-contada").fill("5"); card("Saia Plissada Midi").locator("button", has_text="Conferir").click()
        pg.wait_for_selector(".item-cont >> text=Bateu com o pedido", timeout=6000)
        chk(f"{w}: contou certo → 'Bateu com o pedido' na hora", "Bateu com o pedido (5 peças)" in card("Saia Plissada Midi").inner_text())
        card("Vestido Longo Floral").locator("input.qtd-contada").fill("3"); card("Vestido Longo Floral").locator("button", has_text="Conferir").click()
        pg.wait_for_selector(".item-cont >> text=Não bateu com o pedido", timeout=6000)
        chk(f"{w}: contou diferente → 'Não bateu' sem dizer o esperado, com Recontar e Confirmar", "Você contou 3" in card("Vestido Longo Floral").inner_text() and "4" not in card("Vestido Longo Floral").inner_text() and card("Vestido Longo Floral").locator("button", has_text="Confirmar 3").count() == 1)
        card("Vestido Longo Floral").locator("button", has_text="Recontar").click()
        chk(f"{w}: Recontar reabre o campo vazio", card("Vestido Longo Floral").locator("input.qtd-contada").input_value() == "" and "Conte de novo" in card("Vestido Longo Floral").inner_text())
        card("Vestido Longo Floral").locator("input.qtd-contada").fill("3"); card("Vestido Longo Floral").locator("input.qtd-contada").press("Enter")
        card("Vestido Longo Floral").locator("button", has_text="Confirmar 3").click()
        chk(f"{w}: recontagem registrada (2 tentativas) e confirmada", [x for x in st["pedidos"][1]["itens"] if x["nome"] == "Vestido Longo Floral"][0]["contagens"] == 2 and "Contagem confirmada: 3" in card("Vestido Longo Floral").inner_text())
        pg.click("text=Enviar para a Karla aprovar")
        chk(f"{w}: enviar com item sem contagem: diz o que falta", "Falta contar 1 item" in pg.inner_text("main") and st["pedidos"][1]["status"] == "a_caminho")
        card("Vestido Chemise Verde").locator("input.qtd-contada").fill("8"); card("Vestido Chemise Verde").locator("button", has_text="Conferir").click()
        pg.wait_for_selector('.item-cont:has-text("Vestido Chemise Verde") >> text=Não bateu', timeout=6000)
        pg.click("text=Enviar para a Karla aprovar")
        chk(f"{w}: enviar com 'não bateu' sem confirmar: pede recontar ou confirmar", "Reconte ou confirme o item que não bateu: Vestido Chemise Verde" in pg.inner_text("main"))
        card("Vestido Chemise Verde").locator("button", has_text="Confirmar 8").click()
        pg.click("text=+ Veio um modelo que não está aqui"); pg.wait_for_selector("#extra-nome")
        pg.fill("#extra-nome", "Blusa listrada azul"); pg.fill("#extra-qtd", "2")
        pg.locator(".folha input.arq-foto").set_input_files({"name": "extra.png", "mimeType": "image/png", "buffer": PNG}); pg.wait_for_selector(".folha >> text=Foto enviada.", timeout=6000)
        pg.screenshot(path=str(OUT / f"esteira_chegada_extra_{w}.png"))
        pg.click("text=Incluir na chegada"); pg.wait_for_selector("#extras >> text=Blusa listrada azul", timeout=6000)
        chk(f"{w}: modelo que veio a mais entra com foto e quantidade", any(x["tipo"] == "extra" and x["qtd_contada"] == 2 and x["fotos"] == [URL_FOTO] for x in st["pedidos"][1]["itens"]))
        pg.screenshot(path=str(OUT / f"esteira_chegada_{w}.png"), full_page=True)
        chk(f"{w}: contagem sem rolagem horizontal e botões ≥ 44 px", pg.evaluate("document.documentElement.scrollWidth <= innerWidth") and all(x >= 43.5 for x in pg.evaluate("[...document.querySelectorAll('main button')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})")))
        pg.click("text=Enviar para a Karla aprovar"); pg.wait_for_selector("#chegada-enviada", timeout=6000)
        chk(f"{w}: chegada enviada para aprovação", st["pedidos"][1]["status"] == "conferido")
        pg.click("nav.abas button[data-aba=hoje]"); pg.wait_for_selector(".aviso-ped", timeout=6000)
        chk(f"{w}: Hoje do Admin avisa 'Chegada esperando aprovação'", "Chegada esperando aprovação" in pg.inner_text(".aviso-ped"))
        pg.click(".aviso-ped >> text=Ver pedidos"); pg.wait_for_selector("text=Esperando sua aprovação", timeout=6000)
        pg.click('.peca.pedido[data-pedido="1"]'); pg.wait_for_selector("#aprovar-cab", timeout=6000)
        txt = pg.inner_text("main")
        chk(f"{w}: aprovação mostra só as diferenças e 'N itens vieram certos'", "1 item veio certo" in txt and pg.locator(".card.dif").count() == 3 and "Saia Plissada" not in txt and "Faltou 1" in txt and "Sobrou 2" in txt and "Veio a mais" in txt, txt[:500])
        pg.click("#ped-aprovar")
        chk(f"{w}: aprovar sem decidir: aviso, nada aprovado", "Decida os 3 itens" in pg.inner_text("main") and st["pedidos"][1]["status"] == "conferido")
        dif = lambda nome: pg.locator(".card.dif", has_text=nome)
        dif("Vestido Longo Floral").locator('button[data-decisao="cobrar"]').click(); pg.wait_for_selector('.card.dif:has-text("Vestido Longo Floral") button[data-decisao="cobrar"][aria-pressed="true"]', timeout=6000)
        dif("Vestido Chemise Verde").locator('button[data-decisao="devolver"]').click(); pg.wait_for_selector('.card.dif:has-text("Vestido Chemise Verde") button[data-decisao="devolver"][aria-pressed="true"]', timeout=6000)
        dif("Blusa listrada").locator('button[data-decisao="incluir"]').click(); pg.wait_for_selector(".custo-extra")
        dif("Blusa listrada").locator("button", has_text="Incluir com estes dados").click()
        chk(f"{w}: incluir o que veio a mais pede o custo", "Informe o custo unitário" in dif("Blusa listrada").inner_text())
        dif("Blusa listrada").locator(".custo-extra").fill("25,50"); dif("Blusa listrada").locator(".cat-extra").fill("Blusas"); dif("Blusa listrada").locator(".gen-extra").fill("Feminino Adulto")
        dif("Blusa listrada").locator("button", has_text="Incluir com estes dados").click(); pg.wait_for_selector('.card.dif:has-text("Blusa listrada") button[data-decisao="incluir"][aria-pressed="true"]', timeout=6000)
        chk(f"{w}: decisões gravadas (cobrar, devolver sobra, incluir com custo)", [x.get("decisao") for x in st["pedidos"][1]["itens"]] == ["", "cobrar", "devolver", "incluir"] and st["pedidos"][1]["itens"][3]["custo"] == 25.5, [x.get("decisao") for x in st["pedidos"][1]["itens"]])
        pg.screenshot(path=str(OUT / f"esteira_aprovacao_{w}.png"), full_page=True)
        chk(f"{w}: aprovação sem rolagem horizontal e botões ≥ 44 px", pg.evaluate("document.documentElement.scrollWidth <= innerWidth") and all(x >= 43.5 for x in pg.evaluate("[...document.querySelectorAll('main button')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})")))
        # aprovar → catálogo: o 1º arquivar falha (nada fica pela metade sem aviso)
        n_up, n_cr, n_bk = len(st["updates"]), len(st["creates"]), len(st["bulks"]); st["arquivar_falha"] = True
        pg.click("#ped-aprovar"); pg.wait_for_selector("text=Ficou 1 item com aviso", timeout=10000)
        ups = st["updates"][n_up:]; crs = st["creates"][n_cr:]
        u3 = next((u for u in ups if u["id"] == "1003"), {}); u2 = next((u for u in ups if u["id"] == "1002"), {})
        chk(f"{w}: reposição soma ao estoque pelo update completo (6+5=11, 2+3=5)", u3.get("estoque") == "11" and u3.get("nome") == "Saia Plissada Midi" and u2.get("estoque") == "5" and u2.get("tamanhos") == "M, G" and u3.get("sessao") == "tk3.teste.sessao", [u3, u2])
        c1 = crs[0] if crs else {}
        chk(f"{w}: produto novo criado com a ação create do painel (foto do fornecedor vira capa, 6 aceitas, preço, opId por item)", len(crs) == 2 and c1.get("nome") == "Vestido Chemise Verde" and c1.get("estoque") == "6" and c1.get("preco") == "159.90" and c1.get("fotoUrlExistente") == URL_FOTO and c1.get("categoria") == "Vestidos" and c1.get("genero") == "Feminino Adulto" and c1.get("novidade") is False and c1.get("opId") == "est1x3" and c1.get("sessao") == "tk3.teste.sessao", crs)
        chk(f"{w}: custo nunca vai para o catálogo (create/update/bulk)", all("custo" not in json.dumps(x) for x in st["creates"] + st["updates"] + st["bulks"]))
        chk(f"{w}: arquivar falhou: aviso legível dizendo o que foi feito e o que falta", "foi criado (ID 7001) e pode estar aparecendo no site" in pg.locator('.card.aplicar:has-text("Vestido Chemise Verde")').inner_text() and pg.locator('.card.aplicar:has-text("Vestido Chemise Verde") button', has_text="Tentar de novo").count() == 1)
        chk(f"{w}: extra incluído foi criado, arquivado e posto em Preparação", crs[1].get("nome") == "Blusa listrada azul" and crs[1].get("consultarValor") is True and any(b.get("tipoAcao") == "arquivar" and b.get("ids") == ["7002"] for b in st["bulks"][n_bk:]) and "7002" in st["preparados"], [crs[1:], st["preparados"]])
        pg.locator('.card.aplicar:has-text("Vestido Chemise Verde") button', has_text="Tentar de novo").click()
        pg.wait_for_selector("text=Tudo no catálogo", timeout=10000)
        chk(f"{w}: tentar de novo não cria outra peça; arquiva e põe em Preparação", len(st["creates"]) == n_cr + 2 and any(b.get("tipoAcao") == "arquivar" and b.get("ids") == ["7001"] for b in st["bulks"][n_bk:]) and "7001" in st["preparados"] and all(x.get("aplicado_em") for x in st["pedidos"][1]["itens"]))
        chk(f"{w}: resumo para cobrar e devolver ao fornecedor", "Cobrar do fornecedor" in pg.inner_text("main") and "Vestido Longo Floral: faltou 1 peça (R$ 60,00 cada, R$ 60,00)" in pg.inner_text("main") and "Vestido Chemise Verde: 2 peças" in pg.inner_text("main"), pg.inner_text("main")[-400:])
        pg.screenshot(path=str(OUT / f"esteira_aplicacao_{w}.png"), full_page=True)
        chk(f"{w}: tela de aplicação sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        chk(f"{w}: as abas cabem sem rolar", pg.evaluate("(()=>{const n=document.getElementById('abas');return n.scrollWidth<=n.clientWidth+1})()"), pg.locator("nav.abas button").all_inner_texts())
        chk(f"{w}: sem erro de JavaScript", not erros, erros)
        ctx.close()
    # funcionária sem Admin total: sem abas de gestão
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    instalar(ctx, admin=False); ctx.add_init_script("localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999999999',sessao:'tk3.teste.sessao'}));")
    pg = ctx.new_page(); pg.goto(BASE + "esteira.html"); pg.wait_for_selector(".peca", timeout=8000)
    chk("funcionária vê Hoje, Preparação e Pedidos, sem Painel nem Configurações", pg.locator("nav.abas button").all_inner_texts() == ["Hoje", "Preparação", "Pedidos"] and "Configurações" not in pg.inner_text("body"), pg.locator("nav.abas button").all_inner_texts())
    pg.click("nav.abas >> text=Preparação"); pg.wait_for_selector("text=Blusa Nova Tricô", timeout=6000)
    chk("funcionária não coloca peça nem aceita para o site", pg.locator("text=Colocar peça em preparação").count() == 0 and pg.locator("button.aceitar").count() == 0)
    chk("tarefa de outra função aparece sem botão Feito", pg.locator('.tarefa[data-tarefa="16"] button').count() == 0 and pg.locator('.tarefa[data-tarefa="11"] button', has_text="Feito").count() == 1)
    pg.screenshot(path=str(OUT / "esteira_prep_funcionaria_390.png"), full_page=True)
    ctx.close()
    # ---- v7.43.0: equipe confere a chegada (contagem cega, Hoje avisa, foto do modelo a mais) ----
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    st = instalar(ctx, admin=False); ctx.add_init_script("localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999999999',sessao:'tk3.teste.sessao'}));")
    st["seq_item"] = 12; st["seq_ped"] = 7
    st["pedidos"][7] = {"id": 7, "fornecedor": "Malharia Sol", "previsao": "2026-11-01", "status": "a_caminho", "obs": "nota com preços", "fotos": ["https://midia.fake/m/nota-precos.jpg"], "itens": [
        {"id": 11, "tipo": "reposicao", "produto": "1001", "nome": "Vestido Midi Linho", "tamanhos": "P, M, G", "cores": "Preto", "fotos": [], "qtd_pedida": 7, "custo": 52.5, "qtd_contada": None, "contagens": 0, "nao_veio": False},
        {"id": 12, "tipo": "novo", "nome": "Conjunto Linho Cru", "categoria": "Conjuntos", "genero": "Feminino Adulto", "preco": "199.9", "tamanhos": "M", "cores": "Cru", "fotos": [], "qtd_pedida": 3, "custo": 88.0, "qtd_contada": None, "contagens": 0, "nao_veio": False}]}
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "esteira.html"); pg.wait_for_selector(".aviso-ped", timeout=8000)
    chk("equipe: Hoje avisa 'Chegou pedido para conferir'", "Chegou pedido para conferir" in pg.inner_text(".aviso-ped"))
    chk("equipe: abas Hoje, Preparação e Pedidos", pg.locator("nav.abas button").all_inner_texts() == ["Hoje", "Preparação", "Pedidos"], pg.locator("nav.abas button").all_inner_texts())
    pg.click(".aviso-ped >> text=Conferir chegada"); pg.wait_for_selector("text=Chegou mercadoria", timeout=6000)
    chk("equipe: 'Chegou mercadoria' lista o pedido a caminho, sem botão de novo pedido", "Malharia Sol" in pg.inner_text("main") and pg.locator("text=Novo pedido").count() == 0)
    pg.click('.peca.pedido[data-pedido="7"]'); pg.wait_for_selector(".item-cont", timeout=6000)
    corpos = [b2 for (pa, b2) in st["ped_corpos"]]
    txt = pg.inner_text("body")
    chk("equipe: na tela não aparece custo, quantidade pedida, preço nem foto da nota", all(x not in txt for x in ["52", "88", "R$", "199", "nota"]) and pg.locator("img[src*='nota-precos']").count() == 0, txt[:300])
    c11 = pg.locator('.item-cont[data-item="11"]'); c11.locator("input.qtd-contada").fill("7"); c11.locator("button", has_text="Conferir").click()
    pg.wait_for_selector('.item-cont[data-item="11"] >> text=Bateu com o pedido', timeout=6000)
    c12 = pg.locator('.item-cont[data-item="12"]'); c12.locator("button", has_text="Não veio").click()
    pg.wait_for_selector('.item-cont[data-item="12"] >> text=Marcado: não veio', timeout=6000)
    chk("equipe: 'Não veio' registrado", st["pedidos"][7]["itens"][1]["nao_veio"] is True and "2/2" in pg.inner_text("main"))
    pg.click("text=+ Veio um modelo que não está aqui"); pg.fill("#extra-nome", "Short jeans")
    pg.click("text=Incluir na chegada")
    chk("equipe: modelo a mais sem quantidade: aviso", "Digite quantas peças vieram" in pg.inner_text(".folha"))
    pg.fill("#extra-qtd", "3"); pg.locator(".folha input.arq-foto").set_input_files({"name": "x.png", "mimeType": "image/png", "buffer": PNG}); pg.wait_for_selector(".folha >> text=Foto enviada.", timeout=6000)
    pg.click("text=Incluir na chegada"); pg.wait_for_selector("#extras >> text=Short jeans", timeout=6000)
    tirar = pg.locator('#extras button', has_text="Tirar"); tirar.click()
    chk("equipe: tirar modelo a mais pede confirmação no botão", tirar.inner_text() == "Tirar mesmo?" and len([x for x in st["pedidos"][7]["itens"] if x["tipo"] == "extra"]) == 1)
    pg.screenshot(path=str(OUT / "esteira_chegada_funcionaria_390.png"), full_page=True)
    chk("equipe: contagem sem rolagem horizontal e botões ≥ 44 px", pg.evaluate("document.documentElement.scrollWidth <= innerWidth") and all(x >= 43.5 for x in pg.evaluate("[...document.querySelectorAll('main button')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height)})")))
    pg.click("text=Enviar para a Karla aprovar"); pg.wait_for_selector("#chegada-enviada", timeout=6000)
    chk("equipe: chegada enviada para a Karla", st["pedidos"][7]["status"] == "conferido" and "A Karla vai ver as diferenças" in pg.inner_text("main"))
    chk("equipe: sem erro de JavaScript", not erros, erros)
    ctx.close()
    b.close()
print(f"OK={ok} FALHAS={len(falhas)} {falhas}")
sys.exit(1 if falhas else 0)
