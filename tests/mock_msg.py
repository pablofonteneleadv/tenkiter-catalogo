"""Servidor falso das rotas /msg/* do Worker (estado na memória). Serve ao teste da Caixa de mensagens; nunca fala com a rede."""
import json, datetime
from urllib.parse import urlparse, parse_qs

# testes que conferem só a mecânica do envio desligam a assinatura do atendente (como se o Admin a tivesse desmarcado)
ASSINATURA_PADRAO = True

def agora(): return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (datetime.datetime.utcnow().microsecond // 1000)
def iso(min_atras): return (datetime.datetime.utcnow() - datetime.timedelta(minutes=min_atras)).strftime("%Y-%m-%dT%H:%M:%S.000Z")

def novo_estado():
    s = {"ligado": {"whatsapp1": "2026-10-25T16:00:00.000Z"}, "pausa": {}, "calls": [], "ig_pronto": False, "assinada": False, "seq": 100, "envio": "ok", "envios": [], "idem": {}, "exportacoes": [], "lidas": [], "ligar": [], "v2": []}
    def conv(id, canal, contato, nome, grupo, ult_dir, previa, min_atras, nao_lidas=0, ult_status=""):
        return {"id": id, "canal": canal, "contato": contato, "nome": nome, "grupo": grupo, "ultima_em": iso(min_atras), "previa": previa, "total": 3, "nao_lidas": nao_lidas, "ult_dir": ult_dir, "ult_entrada_em": iso(min_atras) if ult_dir == "entrada" else iso(min_atras + 5), "ult_saida_em": iso(min_atras) if ult_dir == "saida" else "", "atualizada_em": iso(min_atras), "ult_status": ult_status}
    s["convs"] = [
        conv(1, "whatsapp1", "5588999990000", "Maria", 0, "entrada", "Vocês entregam? <b>x</b>", 130, 2),
        conv(2, "whatsapp1", "5588988887777", "", 0, "saida", "Temos sim, P e M!", 300, 0, "lida"),
        conv(3, "whatsapp1", "120363-group", "Clientes TK", 1, "entrada", "oi grupo", 900, 0),
        conv(4, "whatsapp2", "5588911112222", "João", 0, "entrada", "Boa tarde", 20, 1),
        conv(5, "instagram", "17841400000001", "", 0, "entrada", "Tem P?", 40, 1),
    ]
    def m(id, conv_id, dir, texto, min_atras, status="", tipo="texto"):
        return {"id": id, "conversa_id": conv_id, "direcao": dir, "tipo": tipo, "texto": texto, "enviada_em": iso(min_atras), "status": status, "por": "", "status_em": iso(min_atras)}
    s["msgs"] = [
        m(1, 1, "entrada", "Oi, tem o vestido? <img src=x onerror=window.__xss=1>", 140), m(2, 1, "saida", "Temos sim! Veja:", 135, "lida"), m(3, 1, "entrada", "Vocês entregam? <b>x</b>", 130),
        m(4, 2, "entrada", "Tem P?", 310), m(5, 2, "saida", "Temos sim, P e M! https://tenkitermodas.com.br/p/1.", 300, "lida"),
        m(6, 3, "entrada", "oi grupo", 900),
        m(7, 4, "entrada", "Boa tarde", 20),
        m(8, 5, "entrada", "Tem P?", 40), m(9, 1, "entrada", "", 129, "", "imagem"),
    ]
    # conversa só de mídia (WhatsApp 2), usada nos testes de foto/vídeo/áudio/story
    s["convs"].append(conv(6, "whatsapp2", "5588900001111", "Ana Mídia", 0, "entrada", "[imagem]", 5, 0))
    def mm(id, dir, texto, min_atras, tipo, extra=None):
        x = m(id, 6, dir, texto, min_atras, "", tipo); x.update({"midia": 0, "ctx_tipo": "", "ctx_midia": 0, "ctx_aprox": 0}); x.update(extra or {}); return x
    s["msgs"] += [
        mm(20, "entrada", "Oi", 30, "texto", {"ctx_tipo": "story", "ctx_midia": 1, "ctx_mtipo": "imagem", "ctx_aprox": 1, "ctx_legenda": "Conjunto Plus Size", "ctx_em": iso(200)}),
        mm(21, "entrada", "olha esta", 25, "imagem", {"midia": 1, "midia_mime": "image/jpeg"}),
        mm(22, "entrada", "", 20, "áudio", {"midia": 1, "midia_mime": "audio/ogg", "midia_seg": 12}),
        mm(23, "entrada", "prova", 15, "vídeo", {"midia": 1, "midia_mime": "video/mp4", "midia_seg": 7}),
        mm(24, "entrada", "Quanto?", 10, "texto", {"ctx_tipo": "resposta", "ctx_texto": "R$ 29,99 à vista", "ctx_qdir": "saida"}),
        mm(25, "entrada", "", 5, "imagem", {"midia": 0}),
    ]
    s["anexos"] = []; s["midia_baixada"] = []
    return s

ETQ_PADRAO = [{"id": i + 1, "nome": n, "cor": c, "venda": v, "ordem": i, "pessoas": 0} for i, (n, c, v) in enumerate([("Novo cliente", "cinza", 1), ("Reserva", "ambar", 1), ("Aguardando pagamento", "azul", 1), ("Pago", "verde", 1), ("Enviado", "roxo", 1), ("Troca", "rosa", 0)])]

def pessoa(c):
    """v7.22: mesma regra do Worker (número sem o 9º dígito); grupo e Instagram não entram."""
    if c.get("pessoa"): return c["pessoa"]
    n = c["contato"]
    if c["grupo"] or c["canal"] == "instagram" or not n.isdigit(): return ""
    return n[:4] + n[5:] if len(n) == 13 and n.startswith("55") and n[4] == "9" else n

def enfeitar(s, c):
    """Campos calculados pelo Worker: outro_id (a mesma pessoa no outro WhatsApp) e encerrada_em."""
    c.setdefault("encerrada_em", "")
    p = pessoa(c)
    c["pessoa"] = p
    outro = next((o for o in s["convs"] if p and o["id"] != c["id"] and o["canal"] != c["canal"] and pessoa(o) == p and o["total"] > 0 and not o.get("encerrada_em")), None)
    c["outro_id"] = outro["id"] if outro else None
    return c

def cont(s, canal, tipo=""):
    todas = [enfeitar(s, c) for c in s["convs"] if (canal == "todos" or c["canal"] == canal) and c["total"] > 0 and (tipo != "grupo" or c["grupo"]) and (tipo != "individual" or not c["grupo"])]
    cs = [c for c in todas if not c["encerrada_em"]]
    return {"conversas": len(cs), "nao_lidas": sum(1 for c in cs if c["nao_lidas"] > 0), "sem_resposta": sum(1 for c in cs if not c["grupo"] and c["ult_dir"] == "entrada"), "grupos": sum(1 for c in cs if c["grupo"]),
            "encerradas": len(todas) - len(cs), "ambos": sum(1 for c in cs if c["outro_id"]), "individuais": sum(1 for c in cs if not c["grupo"])}

def agendas(s, cid):
    ag = [x for x in s.get("agenda", []) if x["conversa_id"] == cid]
    return {"pendentes": sorted([x for x in ag if x["status"] in ("pendente", "enviando")], key=lambda x: x["quando"]), "historico": [x for x in ag if x["status"] in ("enviada", "falhou")][-10:]}

def tratar(route, path, method, body, s):
    """Devolve True se tratou. Mutações feitas pelo teste em s ficam visíveis às próximas chamadas."""
    s["calls"].append(path)
    url = urlparse(route.request.url); q = {k: v[0] for k, v in parse_qs(url.query).items()}
    J = lambda o, st=200, h=None: route.fulfill(status=st, json=o, headers=h or {})
    if path == "/msg/presenca":      # v7.40.33: presença aproximada da equipe
        return J({"ok": True}) or True
    if path == "/msg/equipe":        # v7.40.33: presença, totais por pessoa e trilha de ações
        now = agora()
        pres = s.setdefault("presencas", [{"usuario": "5588999999999", "nome": "Ana", "em": now, "conversa_id": 1, "online": True},
                                           {"usuario": "5588977776666", "nome": "Bruno", "em": now, "conversa_id": 0, "online": False}])
        tots = s.setdefault("equipe_totais", [{"usuario": "5588999999999", "nome": "Ana", "acoes": 4, "respostas": 3, "encerramentos": 1, "notas": 0}])
        acts = s.setdefault("equipe_acoes", [{"id": 2, "usuario": "5588999999999", "nome": "Ana", "acao": "responder", "conversa_id": 1, "em": now, "cliente": "Cliente simulado"},
                                              {"id": 1, "usuario": "5588999999999", "nome": "Ana", "acao": "espiar", "conversa_id": 2, "em": now, "cliente": ""}])
        return J({"ok": True, "de": q.get("de", ""), "ate": q.get("ate", ""), "agora": now, "presencas": pres, "totais": tots,
                  "atividades": acts, "temMais": False, "proximo": 0}) or True
    if path == "/msg/iniciar" and method == "POST":   # v7.40.34: WhatsApp envia; Instagram só abre
        destino = str(body.get("destino", ""))
        if body.get("canal") == "instagram":
            if str(body.get("texto") or "").strip():
                return J({"ok": False, "erro": "O Instagram não permite que a loja escreva primeiro. Abra a conversa e responda quando o cliente escrever."}, 400) or True
        elif len("".join(ch for ch in destino if ch.isdigit())) < 10:
            return J({"ok": False, "erro": "Digite um WhatsApp com DDD, como (88) 99999-9999."}, 400) or True
        elif not str(body.get("texto") or "").strip():
            return J({"ok": False, "erro": "Escreva a mensagem antes de enviar."}, 400) or True
        c = next((x for x in s["convs"] if x["id"] == 1), None)
        s.setdefault("iniciadas", []).append(body)
        return J({"ok": True, "conversa": c["id"] if c else 1, "enviada": bool(str(body.get("texto") or "").strip())}) or True
    if path == "/msg/notas":
        cid = int(q.get("conversa", 0)) if method != "POST" else int(body.get("conversa", 0))
        c = next(x for x in s["convs"] if x["id"] == cid)
        alvo = pessoa(c) or "c:%d" % cid
        notas = s.setdefault("notas", {}).setdefault(alvo, [])
        if method == "POST":
            s["seq"] += 1
            n = {"id": s["seq"], "texto": body["texto"], "autor": "Ana", "em": agora()}
            notas.append(n)
            return J({"ok": True, "nota": n}) or True
        if method == "DELETE":
            s.setdefault("notas_apagadas", []).extend(x for x in notas if str(x["id"]) == q.get("id"))
            notas[:] = [x for x in notas if str(x["id"]) != q.get("id")]
        return J({"ok": True, "notas": notas}) or True
    if path == "/msg/resumo":
        canais = {}
        for c in ("whatsapp1", "whatsapp2", "instagram"):
            k = cont(s, c)
            canais[c] = {"conversas": k["conversas"], "mensagens": 9, "ultima": "x" if k["conversas"] else "", "ligadoEm": s["ligado"].get(c, ""), "v2": c in s["v2"], "pausado": bool(s["pausa"].get(c)), "naoLidas": k["nao_lidas"], "semResposta": k["sem_resposta"]}
        canais["instagram"]["pronto"] = s["ig_pronto"]
        return J({"ok": True, "canais": canais, "urlInstagram": "https://tenkiter-ig.example/wh/instagram/SEGREDO" if s["ig_pronto"] else ""}) or True
    if path == "/msg/conversas":
        c = q.get("canal"); f = q.get("filtro", ""); b = (q.get("busca") or "").lower(); tp = q.get("tipo", "")
        s.setdefault("consultas", []).append({"canal": c, "filtro": f, "tipo": tp, "etiqueta": q.get("etiqueta", ""),"fila":q.get("fila",""),"escopo":q.get("escopo","todos")})
        rs = [enfeitar(s, x) for x in s["convs"] if (c == "todos" or x["canal"] == c) and x["total"] > 0]
        if f == "encerradas": rs = [x for x in rs if x["encerrada_em"]]
        elif not b: rs = [x for x in rs if not x["encerrada_em"]]
        if f == "com_notas": rs = [x for x in rs if not x["encerrada_em"] and s.get("notas", {}).get(pessoa(x) or "c:%d" % x["id"])]
        if f == "ambos": rs = [x for x in rs if x["outro_id"]]
        if f == "nao_lidas": rs = [x for x in rs if x["nao_lidas"] > 0]
        if f == "lidas": rs = [x for x in rs if x["nao_lidas"] == 0]
        if f == "sem_resposta": rs = [x for x in rs if not x["grupo"] and x["ult_dir"] == "entrada"]
        if f == "grupos" or tp == "grupo": rs = [x for x in rs if x["grupo"]]
        if tp == "individual": rs = [x for x in rs if not x["grupo"]]
        if q.get("fila") and all("em_atendimento" in x for x in s["convs"]) and tp!="grupo" and f!="encerradas":
            rs=[x for x in rs if not x["grupo"] and not x["encerrada_em"] and bool(x["em_atendimento"])==(q["fila"]=="em_atendimento")]
            if q["fila"]=="em_atendimento" and q.get("escopo")=="meus":rs=[x for x in rs if x.get("dono")=="Pablo"]
        if q.get("etiqueta"): rs = [x for x in rs if any(str(e["id"]) == q["etiqueta"] for e in x.get("etiquetas", []))]
        if b: rs = [x for x in rs if b in (x["nome"] + x["contato"] + x["previa"]).lower() or any(b in mm["texto"].lower() for mm in s["msgs"] if mm["conversa_id"] == x["id"])]
        rs = sorted(rs, key=lambda x: x["ultima_em"], reverse=True)
        g = cont(s, c)
        return J({"ok": True, "conversas": rs, "contagens": cont(s, c, tp), "tipos": {"individuais": g["individuais"], "grupos": g["grupos"]}, "cursor": agora()}) or True
    if path == "/msg/pessoas/google": return J({"ok": True, "fim": True}) or True
    if path == "/msg/contexto": return J({"ok": True, "atualizadas": 0}) or True
    if path == "/msg/pessoa":
        cid = int(q.get("conversa",0)) if method == "GET" else int(body.get("conversa", 0))
        c = next((c for c in s["convs"] if c["id"] == cid), None)
        if not c: return J({"ok": False, "erro": "Não encontrado"},404) or True
        if method != "GET":
            s.setdefault("pessoas_salvas",[]).append(body)
            for item in s["convs"]:
                if item["id"] in body.get("vincular",[]) or item["id"] == cid: item["nome"] = body["nome"]; item["pessoa"] = body.get("whatsapp") or "ig-test"
        return J({"ok":True,"conversa":c,"pessoa":pessoa(c),"nome":c["nome"],"whatsapp":c["contato"] if c["canal"] != "instagram" else "","segundo":"","canais":[enfeitar(s,x) for x in s["convs"] if pessoa(x) == pessoa(c)]}) or True
    if path == "/msg/mensagens":
        cid = int(q["conversa"]); c = enfeitar(s, next(x for x in s["convs"] if x["id"] == cid))
        if not c["grupo"]: c["tamanhos"] = (s.get("fichas", {}).get(pessoa(c) or "c:%d" % cid) or {}).get("tamanhos", "")
        return J({"ok": True, "conversa": c, "mensagens": sorted([x for x in s["msgs"] if x["conversa_id"] == cid], key=lambda x: (x["enviada_em"], x["id"])), "notas": s.get("notas", {}).get(pessoa(c) or "c:%d" % cid, []), "agendadas": agendas(s, cid)["pendentes"], "temMais": False, "cursor": agora()}) or True
    if path == "/msg/acompanhamento":
        cid = int(q.get("conversa") or 0) if method == "GET" else int(body.get("conversa") or 0)
        itens = s.setdefault("acompanhamentos", {})
        if method == "POST":
            s.setdefault("acompanhamento_posts", []).append(body)
            if s.get("acompanhamento_falha"): return J({"ok":False,"erro":"Não foi possível confirmar. Tente novamente."},503) or True
            if body.get("ligado"):
                if not itens.get(cid) or itens[cid]["status"] != "ativo":
                    s["seq"] += 1
                    itens[cid] = {"id":s["seq"],"conversa_id":cid,"status":"ativo","etapa":"lembrete","quando":iso(-120),"autor":"Ana","erro":""}
                    s.setdefault("agenda", []).append({"id":s["seq"],"conversa_id":cid,"tipo":"lembrete","acompanhamento":s["seq"],"status":"pendente","quando":iso(-120),"texto":"Lembrete de acompanhamento","autor":"Ana"})
            elif cid in itens:
                itens[cid]["status"] = "cancelada"
                for a in s.get("agenda", []):
                    if a.get("acompanhamento") == itens[cid]["id"]: a["status"] = "cancelada"
        return J({"ok":True,"acompanhamento":itens.get(cid)}) or True
    if path == "/msg/agendadas":   # v7.40.13: mensagens agendadas
        if not q.get("conversa"):
            s.setdefault("agenda_consultas",[]).append(q)
            itens=[]
            for a in s.get("agenda",[]):
                c=next(x for x in s["convs"] if x["id"]==a["conversa_id"])
                itens.append(dict(a,nome=c["nome"],canal=c["canal"],contato=c["contato"]))
            estado=q.get("status","pendentes")
            if estado=="pendentes": itens=[a for a in itens if a["status"] in ("pendente","enviando")]
            elif estado!="todas": itens=[a for a in itens if a["status"]==estado]
            if q.get("canal") not in (None,"todos"): itens=[a for a in itens if a["canal"]==q["canal"]]
            if q.get("tipo") not in (None,"todos"): itens=[a for a in itens if a.get("tipo","manual")==q["tipo"]]
            if q.get("busca"): itens=[a for a in itens if q["busca"].casefold() in " ".join(str(a.get(k,"")) for k in ("nome","contato","texto","anexo_nome","autor")).casefold()]
            itens.sort(key=lambda a:(a["quando"],a["id"]),reverse=estado!="pendentes");offset=int(q.get("cursor") or 0);mais=len(itens)>offset+30
            return J({"ok":True,"agendamentos":itens[offset:offset+30],"temMais":mais,"proximo":str(offset+30) if mais else ""}) or True
        return J(dict({"ok": True}, **agendas(s, int(q["conversa"])))) or True
    if path == "/msg/agendar":
        s.setdefault("agendar_posts", []).append(body)
        texto = str(body.get("texto") or "").strip(); quando = str(body.get("quando") or "")
        if not texto and not body.get("anexo"): return J({"ok": False, "erro": "Escreva a mensagem antes de agendar."}, 400) or True
        if not quando or quando <= agora(): return J({"ok": False, "erro": "Esse horário já passou. Escolha um horário no futuro."}, 400) or True
        a = next((x for x in s.get("agenda", []) if body.get("idLocal") and x.get("idLocal")==body["idLocal"]),None)
        if not a:
            s["seq"] += 1
            a = {"id": s["seq"], "conversa_id": body["conversa"], "texto": texto, "quando": quando, "autor": "Ana", "status": "pendente", "erro": "", "criado_em": agora(), "enviado_em": "", "idLocal":body.get("idLocal"),"tem_anexo":bool(body.get("anexo")),"anexo_nome":body.get("anexoNome","")}
            s.setdefault("agenda", []).append(a)
        if s.pop("agendar_falha_apos_gravar",False): return J({"ok":False,"erro":"Não foi possível confirmar. Tente novamente."},503) or True
        return J(dict({"ok": True, "agendada": a}, **agendas(s, body["conversa"]))) or True
    if path == "/msg/agendar/cancelar":
        a = next((x for x in s.get("agenda", []) if x["id"] == body.get("id")), None)
        if not a: return J({"ok": False, "erro": "Agendamento não encontrado."}, 404) or True
        if a["status"] != "pendente": return J({"ok": False, "erro": "Não dá mais para cancelar: a mensagem já foi enviada."}, 409) or True
        a["status"] = "cancelada"; s.setdefault("cancelados", []).append(a["id"])
        if a.get("acompanhamento"):
            if a["conversa_id"] in s.get("acompanhamentos",{}): s["acompanhamentos"][a["conversa_id"]]["status"]="cancelada"
            for outro in s.get("agenda",[]):
                if outro.get("acompanhamento")==a["acompanhamento"]: outro["status"]="cancelada"
        return J(dict({"ok": True}, **agendas(s, a["conversa_id"]))) or True
    if path == "/msg/ficha":   # v7.40.14: ficha do cliente (mesmas regras do Worker: por pessoa, limites, só o que existe)
        cid = int(q.get("conversa") or 0) if method == "GET" else int(body.get("conversa") or 0)
        c = next((x for x in s["convs"] if x["id"] == cid), None)
        if not c: return J({"ok": False, "erro": "Conversa não encontrada."}, 404) or True
        if c["grupo"]: return J({"ok": False, "erro": "A ficha do cliente é só para conversas individuais, não para grupos."}, 400) or True
        alvo = pessoa(c) or "c:%d" % cid
        fichas = s.setdefault("fichas", {})
        if method != "GET":
            s.setdefault("ficha_posts", []).append(body)
            if s.get("ficha_falha"): return J({"ok": False, "erro": s["ficha_falha"]}, 500) or True
            lim = {"tamanhos": (60, "Tamanhos"), "preferencias": (300, "Preferências"), "cidade": (60, "Cidade/bairro")}
            novo = dict(fichas.get(alvo) or {"tamanhos": "", "preferencias": "", "cidade": ""})
            for k, (n, nome) in lim.items():
                if body.get(k) is None: continue
                t = " ".join(str(body[k]).split())
                if len(t) > n: return J({"ok": False, "erro": "%s: no máximo %d letras (agora tem %d)." % (nome, n, len(t))}, 400) or True
                novo[k] = t
            if "perfil" in body:
                novo["perfil"] = body["perfil"]
                novo["tamanhos"] = " · ".join(body["perfil"].get("preferencias", {}).get("tamanhos", []))
            elif "perfil" in novo:
                if "cidade" in body: novo["perfil"]["cidade"] = novo["cidade"]
                if "tamanhos" in body: novo["perfil"].setdefault("preferencias", {})["tamanhos"] = [x.strip() for x in novo["tamanhos"].split("·") if x.strip()]
            if "nome" in body:
                if not str(body["nome"]).strip(): return J({"ok":False,"erro":"Informe o nome do cliente."},400) or True
                for item in s["convs"]:
                    if item["id"] == cid or (pessoa(c) and pessoa(item) == pessoa(c)): item["nome"] = body["nome"]
            novo.update({"atualizado_em": agora(), "autor": "Ana"}); fichas[alvo] = novo
        canais = [x for x in s["convs"] if not x["grupo"] and (x["id"] == cid or (pessoa(c) and pessoa(x) == pessoa(c)))]
        ids = [x["id"] for x in canais]
        f = fichas.get(alvo) or {}
        return J({"ok": True, "nome": c.get("nome", ""), "ficha": {"tamanhos": " · ".join(f.get("perfil", {}).get("preferencias", {}).get("tamanhos", [])) or f.get("tamanhos", ""), "preferencias": f.get("preferencias", ""), "cidade": f.get("cidade", ""), "perfil": f.get("perfil", {}), "atualizado_em": f.get("atualizado_em", ""), "autor": f.get("autor", "")},
                  "etiquetas": c.get("etiquetas", []), "notas": list(reversed(s.get("notas", {}).get(alvo, [])))[:5],
                  "canais": [{"id": x["id"], "canal": x["canal"], "contato": x["contato"], "atual": x["id"] == cid} for x in canais],
                  "compras": sorted([{"em": v["em"], "canal": next(x["canal"] for x in canais if x["id"] == v["conversa_id"])} for v in s.get("vendas", []) if v["conversa_id"] in ids], key=lambda v: v["em"], reverse=True)}) or True
    if path == "/msg/etiquetas" and s.get("etq_mock"):   # só quando o teste pede (os outros testes contam os filtros sem etiquetas)
        return J({"ok": True, "etiquetas": s["etq_mock"], "cores": ["cinza", "ambar", "azul", "verde", "roxo", "rosa"]}) or True
    if path == "/msg/rotular" and s.get("etq_mock"):
        c = next(x for x in s["convs"] if x["id"] == body.get("conversa"))
        c["etiquetas"] = [e for e in s["etq_mock"] if e["id"] in body.get("etiquetas", [])]
        return J({"ok": True, "etiquetas": c["etiquetas"]}) or True
    if path in ("/msg/funil", "/msg/funil/mover"):   # v7.40.15: funil de vendas (mesmas regras do Worker: colunas = etiquetas de venda; uma pessoa = um cartão)
        etqs = s.get("etq_mock") or ETQ_PADRAO
        venda = [e for e in sorted(etqs, key=lambda e: (e.get("ordem", 0), e["id"])) if e["venda"] and not e.get("arquivada")]
        alvo = lambda c: pessoa(c) or "c:%d" % c["id"]
        def etq_de(a):   # as etiquetas são da pessoa: vale a de qualquer conversa dela
            for c in s["convs"]:
                if alvo(c) == a and c.get("etiquetas") is not None: return c["etiquetas"]
            return []
        if path == "/msg/funil/mover":
            s.setdefault("funil_posts", []).append(body)
            if s.get("funil_falha"): return J({"ok": False, "erro": s["funil_falha"]}, 500) or True
            c = next((x for x in s["convs"] if x["id"] == body.get("conversa")), None)
            if not c: return J({"ok": False, "erro": "Conversa não encontrada."}, 404) or True
            if c["grupo"]: return J({"ok": False, "erro": "O funil de vendas é só para conversas individuais, não para grupos."}, 400) or True
            e_id = body.get("etiqueta")
            if e_id and not any(e["id"] == e_id for e in venda): return J({"ok": False, "erro": "Essa etapa não existe mais. Atualize o funil e tente de novo."}, 400) or True
            a = alvo(c); novas = [e for e in etq_de(a) if not e["venda"]] + [e for e in venda if e["id"] == e_id]
            for x in s["convs"]:
                if alvo(x) == a: x["etiquetas"] = novas; x["atualizada_em"] = agora()
            return J({"ok": True, "etiquetas": novas}) or True
        cf = q.get("canal") or "todos"
        if cf not in ("todos", "whatsapp1", "whatsapp2", "instagram"): return J({"ok": False, "erro": "Escolha Todas, Instagram, WhatsApp 1 ou WhatsApp 2."}, 400) or True
        s.setdefault("funil_consultas", []).append(cf)
        if s.get("funil_erro"): return J({"ok": False, "erro": s["funil_erro"]}, 500) or True
        melhor = {}
        for c in sorted([x for x in s["convs"] if not x["grupo"] and not x.get("encerrada_em") and x["total"] > 0 and (cf == "todos" or x["canal"] == cf)], key=lambda x: (x["ultima_em"], x["id"]), reverse=True):
            melhor.setdefault(alvo(c), c)
        cols = []
        for e in venda:
            cs = [c for a, c in melhor.items() if any(x["id"] == e["id"] for x in etq_de(a))]
            cols.append({"etiqueta": {"id": e["id"], "nome": e["nome"], "cor": e["cor"]}, "total": len(cs), "cartoes": [{"conversa": c["id"], "nome": c["nome"], "contato": c["contato"], "canal": c["canal"], "previa": c["previa"][:90], "ultima_em": c["ultima_em"], "dono": c.get("dono", "")} for c in cs[:30]]})
        return J({"ok": True, "canal": cf, "colunas": cols}) or True
    if path == "/msg/entrada/reprocessar" and method == "POST":
        s.setdefault("reprocessamentos", []).append(True)
        if s.get("reprocessar_erro"): return J({"ok":False,"erro":"Sem conexão agora. Tente novamente."},503) or True
        s["saude"] = {"alerta": False}
        return J({"ok": True, "iniciado": True}) or True
    if path == "/msg/novidades":
        cid = int(q.get("conversa") or 0); dep = int(q.get("depois") or 0); desde = q.get("desde", "")
        # a "folga" de 3 s do servidor real: devolve o que mudou desde o cursor
        cs = [enfeitar(s, x) for x in s["convs"] if x["atualizada_em"] >= desde[:-1] and x["total"] > 0]
        ms = [x for x in s["msgs"] if cid and x["conversa_id"] == cid and (x["id"] > dep or x["status_em"] >= q.get("st", "z")[:-1])] if cid else []
        return J({"ok": True, "cursor": agora(), "conversas": cs, "mensagens": ms, "notas": s.get("notas", {}).get(pessoa(next(x for x in s["convs"] if x["id"] == cid)) or "c:%d" % cid, []) if cid else [], "contagens": {c: cont(s, c) for c in ("whatsapp1", "whatsapp2", "instagram", "todos")}, "saude": s.get("saude", {"alerta":False}), "acompanhamento":s.get("acompanhamentos",{}).get(cid)}) or True
    if path == "/msg/contagem":
        return J({"ok": True, "contagens": {c: cont(s, c) for c in ("whatsapp1", "whatsapp2", "instagram", "todos")}}) or True
    if path == "/msg/lida" and isinstance(body.get("conversas"), list):
        ids = [i for i in body["conversas"] if isinstance(i, int)]
        s.setdefault("lote_lida", []).append({"ids": ids, "naoLida": bool(body.get("naoLida")), "celular": bool(body.get("celular"))})
        for c in s["convs"]:
            if c["id"] in ids: c["nao_lidas"] = 1 if body.get("naoLida") else 0; c["atualizada_em"] = agora()
        return J({"ok": True, "alteradas": len(ids), "celular": {"ok": 0 if body.get("naoLida") else len(ids), "falhas": 0, "desligado": 0}, "contagens": {k: cont(s, k) for k in ("whatsapp1", "whatsapp2", "instagram", "todos")}}) or True
    if path == "/msg/lida":
        c = next((x for x in s["convs"] if x["id"] == body.get("conversa")), None)
        if c: c["nao_lidas"] = 1 if body.get("naoLida") else 0; s["lidas"].append((c["id"], bool(body.get("naoLida"))))
        cel = None
        if c and not body.get("naoLida") and body.get("celular"):
            cfg = s.setdefault("cfg_leitura", {"whatsapp1": True, "whatsapp2": True, "instagram": True})
            if cfg.get(c["canal"]):
                cel = {"ok": False, "erro": "A Wafly recusou (HTTP 405)."} if s.get("celular_falha") else {"ok": True, "rota": "/modify-chat"}
                s.setdefault("celular", []).append((c["id"], c["canal"]))
            else: cel = {"ok": False, "desligado": True}
        return J({"ok": bool(c), "celular": cel}) or True
    if path == "/msg/zernio/config":
        z = s.setdefault("zernio", {"chave": "", "conta": None, "posts": []})
        if method == "GET": return J({"ok": True, "configurada": bool(z["chave"]), "conta": z["conta"], "conferidaEm": "", "avisoLigado": bool(z["chave"] and z["conta"] and not z.get("semAviso")), "ultimoAviso": {"em": z["ult"], "res": "ok", "evento": "message.received"} if z.get("ult") else None}) or True
        z["posts"].append(body)
        if body.get("apagar"): z["chave"] = ""; z["conta"] = None; return J({"ok": True, "configurada": False}) or True
        contas2 = [{"id": "acc_p", "usuario": "pablo_fontenele88"}, {"id": "acc_t", "usuario": "tenkitermodasceara"}] if z.get("duas") else ([z["conta"]] if z["conta"] else [])
        if body.get("diagnostico") or body.get("testar"):
            if body.get("testar"): z["ult"] = "2026-10-27T21:20:00Z"
            return J({"ok": True, "aviso": {"existe": True, "ativo": not z.get("desligado"), "esteServidor": True, "contaCerta": True, "eventos": ["message.received", "message.sent"]}, "teste": {"enviado": True, "codigo": 200} if body.get("testar") else None, "entregas": [{"em": "2026-10-27T21:10:00Z", "evento": "message.received", "situacao": "failed", "codigo": 404, "erro": "Not Found", "teste": False}], "logsDisponiveis": True, "ultimoRecebido": {"em": "2026-10-27T20:57:52Z", "res": "ok", "evento": "message.sent"}}) or True
        if body.get("listar"): return J({"ok": True, "configurada": True, "conta": z["conta"], "contas": contas2}) or True
        if body.get("escolher"):
            esc = next((c for c in contas2 if c["id"] == body["escolher"]), None)
            if not esc: return J({"ok": False, "erro": "Esse Instagram não está conectado no Zernio."}, 400) or True
            z["conta"] = esc; z["semAviso"] = False; return J({"ok": True, "configurada": True, "conta": esc, "contas": contas2}) or True
        k = str(body.get("chave", ""))
        if len(k) < 20 or " " in k: return J({"ok": False, "erro": "Cole a chave de API completa do Zernio (Settings → API Keys)."}, 400) or True
        if k.startswith("ruim"): return J({"ok": False, "erro": "O Zernio recusou essa chave. Confira se copiou a chave inteira em Settings → API Keys."}, 400) or True
        z["chave"] = k; z["conta"] = None if k.startswith("semig") else {"id": "acc_1", "usuario": "tenkitermodasceara"}
        return J({"ok": True, "configurada": True, "conta": z["conta"], "conferidaEm": agora(), "aviso": {"ok": True} if z["conta"] else None}) or True
    if path.startswith("/msg/contatos/"):
        c = s.setdefault("contatos", {"ligada": False, "conta": "", "backup": None, "relatorio": None, "pedidos": []})
        c["pedidos"].append((path, body))
        if path == "/msg/contatos/situacao":
            return J({"ok": True, "ligada": c["ligada"], "conta": c["conta"], "marcador": "Tenkiter Clientes G", "backup": c["backup"], "relatorio": c["relatorio"] if "relatorio=1" in route.request.url else None,
                      "limpeza": c.get("limpeza"), "auto": bool(c.get("auto")), "planoPronto": bool(c.get("relatorio")), "fila": {"feitos": 38 if c.get("limpeza") else 0, "pendentes": 0, "falhas": 0}}) or True
        if path == "/msg/contatos/limpeza":     # v7.36: limpeza aprovada em etapas
            et = body.get("etapa")
            if et == "juntar":
                passos = {0: ("488", 488), 488: ("", 976)}
                prox, feito = passos.get(int(body.get("desde") or 0), ("", 976))
                return J({"ok": True, "feito": feito, "total": 976, "proximo": prox}) or True
            if et == "padronizar":
                passos = {"": ("q2", 7000), "q2": ("", 13720)}
                prox, feito = passos.get(body.get("pagina") or "", ("", 13720))
                return J({"ok": True, "feito": feito, "total": 13720, "proxima": prox}) or True
            if et == "criar":
                rest = 0 if body.get("continuar") else 23
                return J({"ok": True, "feito": 38 - rest, "total": 38, "restantes": rest}) or True
            if et == "fim":
                c["limpeza"] = {"em": agora(), "juntados": 976, "apagados": 1027, "padronizados": 8790, "criados": 38}; c["auto"] = True
                return J(dict(ok=True, auto=True, **c["limpeza"])) or True
            return J({"ok": False, "erro": "Etapa da limpeza inválida."}, 400) or True
        if path == "/msg/contatos/auto":
            c["auto"] = bool(body.get("ligado")); return J({"ok": True, "auto": c["auto"]}) or True
        if path == "/msg/contatos/config":
            if body.get("desligar"): c.update({"ligada": False, "conta": ""}); return J({"ok": True, "ligada": False}) or True
            if not str(body.get("url", "")).startswith("https://script.google.com/macros/s/"): return J({"ok": False, "erro": "Cole o endereço da implantação da ponte (começa com https://script.google.com/macros/s/ e termina em /exec)."}, 400) or True
            c.update({"ligada": True, "conta": "contatos@exemplo.com"}); return J({"ok": True, "ligada": True, "conta": "contatos@exemplo.com"}) or True
        if path == "/msg/contatos/backup":
            if body.get("partes"):     # v7.33: cópia em partes (ponte 1.1), 15.300 contatos em 3 partes
                passos = {"": ("p2", 5000), "p2": ("p3", 10000), "p3": ("", 15300)}
                prox, lidos = passos.get(body.get("pagina") or "", ("", 15300))
                if not prox: c["backup"] = {"em": agora(), "total": lidos, "arquivo": "contatos-google-2026-10-27-1500", "url": "https://drive.google.com/drive/folders/pastaTESTE00001", "partes": 3}
                return J({"ok": True, "fim": not prox, "lidos": lidos, "totalPessoas": 15300, "parte": 1, "pasta": "pastaTESTE00001", "proxima": prox, "url": "https://drive.google.com/drive/folders/pastaTESTE00001"}) or True
            c["backup"] = {"em": agora(), "total": 1234, "arquivo": "contatos-google-2026-10-26-1800.json", "url": "https://drive.google.com/file/d/abc"}
            return J(dict(ok=True, **c["backup"])) or True
        if path == "/msg/contatos/relatorio":
            if not c["backup"]: return J({"ok": False, "erro": "Faça a cópia de segurança dos contatos antes do relatório."}, 409) or True
            et = body.get("etapa")
            if et == "inicio": return J({"ok": True}) or True
            if et == "parte":
                passos = {"": ("p2", 6000), "p2": ("p3", 12000), "p3": ("", 15300)}
                prox, lidos = passos.get(body.get("pagina") or "", ("", 15300))
                return J({"ok": True, "lidos": lidos, "total": 15300, "proxima": prox}) or True
            c["relatorio"] = {"em": agora(), "total": 1234, "comFone": 1200, "semFone": 34,
                "duplicados": {"total": 2, "contatosEnvolvidos": 5, "lista": [{"chave": "558899990001", "contatos": [{"r": "people/c1", "n": "Maria Silva", "f": ["+5588999990001"]}, {"r": "people/c2", "n": "Maria S.", "f": ["(88) 9999-0001"]}]}, {"chave": "558877770001", "contatos": [{"r": "people/c3", "n": "Rita", "f": ["+5588977770001"]}, {"r": "people/c4", "n": "Rita Loja", "f": ["88977770001"]}, {"r": "people/c5", "n": "Rita 2", "f": ["977770001"]}]}]},
                "corrigir": {"total": 1, "lista": [{"r": "people/c2", "n": "Maria S.", "de": "(88) 9999-0001", "para": "+5588999990001"}]},
                "invalidos": {"total": 1, "lista": [{"r": "people/c9", "n": "Fixo errado", "f": "12345"}]},
                "semCadastro": {"total": 1, "lista": [{"conversa": 2, "canal": "whatsapp1", "nome": "", "fone": "+5588988887777", "ultima": agora()}]}}
            return J(dict(ok=True, **c["relatorio"])) or True
    if path == "/msg/encerrar":
        ids = [i for i in body.get("conversas", []) if isinstance(i, int)]
        if not ids: return J({"ok": False, "erro": "Escolha ao menos uma conversa."}, 400) or True
        s.setdefault("encerrar", []).append({"ids": ids, "reabrir": bool(body.get("reabrir")), "motivo": body.get("motivo")})
        for c in s["convs"]:
            if c["id"] in ids:
                c["encerrada_em"] = "" if body.get("reabrir") else agora(); c["atualizada_em"] = agora()
                c["encerrada_motivo"] = "" if body.get("reabrir") else (body.get("motivo") if body.get("motivo") in ("concluido", "vendeu", "sem_resposta", "engano") else "concluido")
                if not body.get("reabrir"): c["nao_lidas"] = 0
        return J({"ok": True, "alteradas": len(ids), "contagens": {k: cont(s, k) for k in ("whatsapp1", "whatsapp2", "instagram", "todos")}}) or True
    if path == "/msg/auto":   # v7.40.8: respostas automáticas (desligadas por padrão)
        au = s.setdefault("auto", {"boasVindas": {"ligado": False, "texto": "Oi! Que bom ter você aqui 😊 Já já uma das meninas te responde. Se já viu alguma peça, pode mandar o print ou o código que agiliza."}, "foraHorario": {"ligado": False, "texto": "Oi! A loja tá fechada agora, mas sua mensagem ficou guardada aqui. A gente volta {abertura} e te responde 😊 Se quiser, já deixa o print da peça e seu tamanho."}, "feriados": []})
        if method == "POST":
            for k in ("boasVindas", "foraHorario"):
                d = body.get(k) or {}
                if isinstance(d.get("ligado"), bool): au[k]["ligado"] = d["ligado"]
                if isinstance(d.get("texto"), str) and d["texto"].strip(): au[k]["texto"] = d["texto"].strip()[:1000]
            if isinstance(body.get("feriados"), list): au["feriados"] = sorted(set(x for x in body["feriados"] if isinstance(x, str) and len(x) == 10))
            for k in ("expediente", "acompanhamento"):
                if isinstance(body.get(k),dict): au[k] = body[k]
            s.setdefault("auto_posts", []).append(body)
        return J({"ok": True, "auto": au, "agora": {"aberta": False, "abertura": "amanhã às 7h30"}, "ultimo": s.get("auto_ultimo")}) or True
    if path == "/msg/config":
        if method == "GET" and s.get("perfil_erro"): return J({"ok":False,"erro":"Sem conexão agora."},503) or True
        cfg = s.setdefault("cfg_leitura", {"whatsapp1": True, "whatsapp2": True, "instagram": True})
        if method == "POST":
            for k, v in (body.get("lerCelular") or {}).items():
                if k in cfg and isinstance(v, bool): cfg[k] = v
            if isinstance(body.get("assinatura"), bool): s["assinatura"] = body["assinatura"]
            if isinstance(body.get("meuNome"), str): s["meu_nome"] = " ".join(body["meuNome"].replace("*", " ").split())[:30]
            if isinstance(body.get("respostas"), list): s["respostas"] = [r for r in body["respostas"] if r.get("t") and r.get("x")][:30]
            s.setdefault("cfg_posts", []).append(body)
        return J({"ok": True, "config": {"lerCelular": dict(cfg), "assinatura": s.get("assinatura", ASSINATURA_PADRAO)}, "nomeCadastro": s.get("nome_cadastro", "Ana Lojista"), "nomePadrao": s.get("nome_padrao", "Ana"), "meuNome": s.get("meu_nome", ""), "respostas": s.get("respostas"), "ultimaLeitura": {"whatsapp1": {"em": agora(), "ok": True, "rota": "/modify-chat"}, "whatsapp2": None, "instagram": None}}) or True
    if path == "/msg/enviar":
        s["envios"].append(body)
        if body.get("idLocal") in s["idem"]: return J(s["idem"][body["idLocal"]]) or True
        if s["envio"] == "erro": return J({"ok": False, "erro": "A Wafly recusou a mensagem (HTTP 400). Confira se o WhatsApp 1 está conectado."}, 409) or True
        s["seq"] += 1; c = next(x for x in s["convs"] if x["id"] == body["conversa"])
        anexo = body.get("anexo"); tipo_a = {"imagem": "imagem"}.get("imagem") if anexo else "texto"
        msg = {"id": s["seq"], "conversa_id": c["id"], "direcao": "saida", "tipo": tipo_a, "midia": 1 if anexo else 0, "texto": body.get("texto", ""), "enviada_em": agora(), "status": "incerta" if s["envio"] == "incerto" else "enviada", "por": "9999", "status_em": agora()}
        if body.get("previa") and body.get("previaImagem"):
            import re
            link = re.search(r"https?://[^\s<>]+", body.get("texto", ""))
            msg["link_previa"] = json.dumps({"imagem":body["previaImagem"],"titulo":body.get("previaTitulo", ""),"descricao":body.get("previaDescricao", ""),"url":link.group(0) if link else ""})
        s["msgs"].append(msg); c.update({"ult_dir": "saida", "nao_lidas": 0, "previa": body.get("texto", "") or "[imagem]", "ultima_em": msg["enviada_em"], "atualizada_em": msg["enviada_em"], "ult_status": msg["status"], "total": c["total"] + 1})
        r = {"ok": s["envio"] != "incerto", "mensagem": msg}
        if s["envio"] == "incerto": r["incerto"] = True; r["erro"] = "Sem confirmação da Wafly. Confira no WhatsApp antes de tentar de novo."
        s["idem"][body["idLocal"]] = r
        return J(r) or True
    if path == "/msg/stories":
        s["stories_pedidos"] = s.get("stories_pedidos", []) + [url.query]
        return J({"ok": True, "em": agora(), "stories": [{"id": 71, "publicado_em": "2026-10-25T14:00:00.000Z", "legenda": "Vestido alfaiataria", "tipo": "imagem", "n": 1}, {"id": 72, "publicado_em": "2026-10-25T12:00:00.000Z", "legenda": "", "tipo": "video", "n": 1}]}) or True
    if path == "/msg/midia":
        s["midia_baixada"].append(url.query)
        if q.get("ctx") == "1" and q.get("id") == "99": return J({"ok": False, "erro": "x"}, 404) or True
        PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc000000301010018dd8db00000000049454e44ae426082")
        return route.fulfill(status=200, body=PNG, headers={"Content-Type": "image/png"}) or True
    if path == "/msg/anexo":
        s["anexos"].append(q.get("tipo"))
        return J({"ok": True, "anexo": "msg/202610/" + "a" * 24 + ".jpg", "tipo": q.get("tipo"), "mime": "image/jpeg", "bytes": 100}) or True
    if path == "/msg/exportar":
        s["exportacoes"].append(url.query)
        fmt = q.get("formato", "csv")
        return route.fulfill(status=200, body="﻿canal;conversa\r\nWhatsApp 1;1\r\n", headers={"Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="tenkiter-mensagens-teste.%s"' % fmt, "X-TK-Total": "1", "X-TK-Cortado": "0", "Access-Control-Expose-Headers": "Content-Disposition, X-TK-Total, X-TK-Cortado"}) or True
    if path == "/msg/metricas":
        return J({"ok": True, "dias": int(q.get("dias") or 30), "canal": q.get("canal"), "conversas": 12, "entradas": 40, "saidas": 31, "perguntasRespondidas": 20, "perguntasSemResposta": 3, "medianaMin": 12, "mediaMin": 55, "ate5min": 30, "ate60min": 80, "acima24h": 5, "aguardando": {"total": 2, "maisAntigas": [{"id": 1, "canal": "whatsapp1", "nome": "Maria", "desde": iso(130)}]}, "porHora": [{"hora": h, "entradas": (h % 5) * 2, "medianaMin": 10 if h % 5 else None} for h in range(24)]}) or True
    if path == "/msg/instagram/situacao": return J({"ok": True, "token": True, "assinada": s["assinada"], "ultimaTentativa": None}) or True
    if path == "/msg/instagram/assinar": s["assinada"] = True; return J({"ok": True}) or True
    if path == "/msg/instagram/segredo": s["ig_pronto"] = True; return J({"ok": True}) or True
    if path == "/msg/ligar": s["ligado"]["whatsapp" + str(body["slot"])] = "2026-10-25T17:10:00.000Z"; s["ligar"].append(body["slot"]); s["v2"].append("whatsapp" + str(body["slot"])); return J({"ok": True, "avisos": []}) or True
    if path == "/msg/pausar": s["pausa"][body["canal"]] = body["pausar"]; return J({"ok": True, "pausado": body["pausar"]}) or True
    return False
