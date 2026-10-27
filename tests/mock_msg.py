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

def pessoa(c):
    """v7.22: mesma regra do Worker (número sem o 9º dígito); grupo e Instagram não entram."""
    n = c["contato"]
    if c["grupo"] or c["canal"] == "instagram" or not n.isdigit(): return ""
    return n[:4] + n[5:] if len(n) == 13 and n.startswith("55") and n[4] == "9" else n

def enfeitar(s, c):
    """Campos calculados pelo Worker: outro_id (a mesma pessoa no outro WhatsApp) e encerrada_em."""
    c.setdefault("encerrada_em", "")
    p = pessoa(c)
    outro = next((o for o in s["convs"] if p and o["id"] != c["id"] and o["canal"] != c["canal"] and pessoa(o) == p and o["total"] > 0 and not o.get("encerrada_em")), None)
    c["outro_id"] = outro["id"] if outro else None
    return c

def cont(s, canal, tipo=""):
    todas = [enfeitar(s, c) for c in s["convs"] if (canal == "todos" or c["canal"] == canal) and c["total"] > 0 and (tipo != "grupo" or c["grupo"]) and (tipo != "individual" or not c["grupo"])]
    cs = [c for c in todas if not c["encerrada_em"]]
    return {"conversas": len(cs), "nao_lidas": sum(1 for c in cs if c["nao_lidas"] > 0), "sem_resposta": sum(1 for c in cs if not c["grupo"] and c["ult_dir"] == "entrada"), "grupos": sum(1 for c in cs if c["grupo"]),
            "encerradas": len(todas) - len(cs), "ambos": sum(1 for c in cs if c["outro_id"]), "individuais": sum(1 for c in cs if not c["grupo"])}

def tratar(route, path, method, body, s):
    """Devolve True se tratou. Mutações feitas pelo teste em s ficam visíveis às próximas chamadas."""
    s["calls"].append(path)
    url = urlparse(route.request.url); q = {k: v[0] for k, v in parse_qs(url.query).items()}
    J = lambda o, st=200, h=None: route.fulfill(status=st, json=o, headers=h or {})
    if path == "/msg/resumo":
        canais = {}
        for c in ("whatsapp1", "whatsapp2", "instagram"):
            k = cont(s, c)
            canais[c] = {"conversas": k["conversas"], "mensagens": 9, "ultima": "x" if k["conversas"] else "", "ligadoEm": s["ligado"].get(c, ""), "v2": c in s["v2"], "pausado": bool(s["pausa"].get(c)), "naoLidas": k["nao_lidas"], "semResposta": k["sem_resposta"]}
        canais["instagram"]["pronto"] = s["ig_pronto"]
        return J({"ok": True, "canais": canais, "urlInstagram": "https://tenkiter-ig.example/wh/instagram/SEGREDO" if s["ig_pronto"] else ""}) or True
    if path == "/msg/conversas":
        c = q.get("canal"); f = q.get("filtro", ""); b = (q.get("busca") or "").lower(); tp = q.get("tipo", "")
        s.setdefault("consultas", []).append({"canal": c, "filtro": f, "tipo": tp})
        rs = [enfeitar(s, x) for x in s["convs"] if (c == "todos" or x["canal"] == c) and x["total"] > 0]
        if f == "encerradas": rs = [x for x in rs if x["encerrada_em"]]
        elif not b: rs = [x for x in rs if not x["encerrada_em"]]
        if f == "ambos": rs = [x for x in rs if x["outro_id"]]
        if f == "nao_lidas": rs = [x for x in rs if x["nao_lidas"] > 0]
        if f == "lidas": rs = [x for x in rs if x["nao_lidas"] == 0]
        if f == "sem_resposta": rs = [x for x in rs if not x["grupo"] and x["ult_dir"] == "entrada"]
        if f == "grupos" or tp == "grupo": rs = [x for x in rs if x["grupo"]]
        if tp == "individual": rs = [x for x in rs if not x["grupo"]]
        if b: rs = [x for x in rs if b in (x["nome"] + x["contato"] + x["previa"]).lower() or any(b in mm["texto"].lower() for mm in s["msgs"] if mm["conversa_id"] == x["id"])]
        rs = sorted(rs, key=lambda x: x["ultima_em"], reverse=True)
        g = cont(s, c)
        return J({"ok": True, "conversas": rs, "contagens": cont(s, c, tp), "tipos": {"individuais": g["individuais"], "grupos": g["grupos"]}, "cursor": agora()}) or True
    if path == "/msg/mensagens":
        cid = int(q["conversa"]); c = enfeitar(s, next(x for x in s["convs"] if x["id"] == cid))
        return J({"ok": True, "conversa": c, "mensagens": sorted([x for x in s["msgs"] if x["conversa_id"] == cid], key=lambda x: (x["enviada_em"], x["id"])), "temMais": False, "cursor": agora()}) or True
    if path == "/msg/novidades":
        cid = int(q.get("conversa") or 0); dep = int(q.get("depois") or 0); desde = q.get("desde", "")
        # a "folga" de 3 s do servidor real: devolve o que mudou desde o cursor
        cs = [enfeitar(s, x) for x in s["convs"] if x["atualizada_em"] >= desde[:-1] and x["total"] > 0]
        ms = [x for x in s["msgs"] if cid and x["conversa_id"] == cid and (x["id"] > dep or x["status_em"] >= q.get("st", "z")[:-1])] if cid else []
        return J({"ok": True, "cursor": agora(), "conversas": cs, "mensagens": ms, "contagens": {c: cont(s, c) for c in ("whatsapp1", "whatsapp2", "instagram", "todos")}}) or True
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
        if method == "GET": return J({"ok": True, "configurada": bool(z["chave"]), "conta": z["conta"], "conferidaEm": "", "avisoLigado": bool(z["chave"] and z["conta"]), "ultimoAviso": None}) or True
        z["posts"].append(body)
        if body.get("apagar"): z["chave"] = ""; z["conta"] = None; return J({"ok": True, "configurada": False}) or True
        contas2 = [{"id": "acc_p", "usuario": "pablo_fontenele88"}, {"id": "acc_t", "usuario": "tenkitermodasceara"}] if z.get("duas") else ([z["conta"]] if z["conta"] else [])
        if body.get("listar"): return J({"ok": True, "configurada": True, "conta": z["conta"], "contas": contas2}) or True
        if body.get("escolher"):
            esc = next((c for c in contas2 if c["id"] == body["escolher"]), None)
            if not esc: return J({"ok": False, "erro": "Esse Instagram não está conectado no Zernio."}, 400) or True
            z["conta"] = esc; return J({"ok": True, "configurada": True, "conta": esc, "contas": contas2}) or True
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
    if path == "/msg/config":
        cfg = s.setdefault("cfg_leitura", {"whatsapp1": True, "whatsapp2": True, "instagram": True})
        if method == "POST":
            for k, v in (body.get("lerCelular") or {}).items():
                if k in cfg and isinstance(v, bool): cfg[k] = v
            if isinstance(body.get("assinatura"), bool): s["assinatura"] = body["assinatura"]
            if isinstance(body.get("meuNome"), str): s["meu_nome"] = " ".join(body["meuNome"].replace("*", " ").split())[:30]
            if isinstance(body.get("respostas"), list): s["respostas"] = [r for r in body["respostas"] if r.get("t") and r.get("x")][:30]
            s.setdefault("cfg_posts", []).append(body)
        return J({"ok": True, "config": {"lerCelular": dict(cfg), "assinatura": s.get("assinatura", ASSINATURA_PADRAO)}, "meuNome": s.get("meu_nome", ""), "respostas": s.get("respostas"), "ultimaLeitura": {"whatsapp1": {"em": agora(), "ok": True, "rota": "/modify-chat"}, "whatsapp2": None, "instagram": None}}) or True
    if path == "/msg/enviar":
        s["envios"].append(body)
        if body.get("idLocal") in s["idem"]: return J(s["idem"][body["idLocal"]]) or True
        if s["envio"] == "erro": return J({"ok": False, "erro": "A Wafly recusou a mensagem (HTTP 400). Confira se o WhatsApp 1 está conectado."}, 409) or True
        s["seq"] += 1; c = next(x for x in s["convs"] if x["id"] == body["conversa"])
        anexo = body.get("anexo"); tipo_a = {"imagem": "imagem"}.get("imagem") if anexo else "texto"
        msg = {"id": s["seq"], "conversa_id": c["id"], "direcao": "saida", "tipo": tipo_a, "midia": 1 if anexo else 0, "texto": body.get("texto", ""), "enviada_em": agora(), "status": "incerta" if s["envio"] == "incerto" else "enviada", "por": "9999", "status_em": agora()}
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
