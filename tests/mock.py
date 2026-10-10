import json, os
BASE_LOCAL=os.environ.get("TK_BASE","http://localhost:8765/")
CATS=["Blusa","Calça","Camiseta","Conjunto","Saia","Vestido","Macacão","Short","Jaqueta","Biquíni"]
GENS=["Feminino Adulto","Masculino Adulto","Infantil Menina","Infantil Menino","Unissex"]
def prods(n=24):
    out=[]
    for i in range(1,n+1):
        out.append({"ID":str(1790000000000+i),"Nome":"%s %s"%(CATS[i%len(CATS)],["Floral","Liso","Listrado","Premium"][i%4]),"Categoria":CATS[i%len(CATS)],"Genero":GENS[i%3],
          "Preco":49.9+i*7,"Foto_URL":"https://lh3.googleusercontent.com/d/ID%d"%i if i%2 else "https://res.cloudinary.com/z/image/upload/v1/x%d.jpg"%i,
          "Status":"Arquivado" if i%11==0 else "Ativo","Estoque":("" if i%5==0 else (0 if i%7==0 else i%6+1)),"Codigo":"TK-%04d"%i,
          "Fotos_Galeria":"","Video_URL":"","Novidade":i%4==0,"Tamanhos":"P, M, G","Cores":"Preto, Bege","Descricao":"Tecido leve, caimento solto.","Foto_Stories_URL":""})
    return out
PNG=bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0f01f0005000201a5f645400000000049454e44ae426082")
PERMS_ALL=["catalogo_admin","gerir_acessos","equipe_relatorio","gerir_manuais","dados_pessoais","catalogo_cadastrar","catalogo_excluir","catalogo_precos","catalogo_auditoria","catalogo_push","portal"]
def install(ctx, perms=PERMS_ALL, log=None, delay=0, versao="3.1", pixel="", sem_codigo=0, ia=True):
    """Simula o Apps Script. versao="3.1" liga pedidos/métricas/CSV/integrações (como o backend novo); "3.0" é o backend antigo (o site tem que seguir funcionando).
    Devolve um dicionário de estado (pedidos, integrações, produtos...) para os testes conferirem."""
    P=prods()
    for i in range(sem_codigo):
        q=dict(P[i]); q["ID"]=str(1790000009000+i); q["Nome"]="Peça antiga %d"%(i+1); q["Codigo"]=""; P.append(q)
    novo = versao != "3.0"
    st={"produtos":P,"pedidos":[],"falhas":{},"integ":{"pixelId":pixel,"capi":False,"teste":"","graph":"v23.0","sinonimos":"","segmentos":"Clientes Infantil"},"push":[],"importados":[],"seq":0,"ia":ia}
    FLAGS={"ok":True,"versao":"catalogo-3.1","acessos":True,"pinAtivo":False,"pedidos":True,"config":True,"metricas":True,"importacao":True,"feed":True,"integracoes":True,"codigos":True,"pushHistorico":True,"loteCategoria":True} if novo else {"ok":True,"versao":"catalogo-3.0","acessos":True,"pinAtivo":False}
    def cliente(ped):
        return {"codigo":ped["codigo"],"data":ped["data"],"atualizado":ped["atualizado"],"status":ped["status"],"entrega":ped["entrega"],"total":ped["total"],"itens":[{"nome":i["nome"],"codigo":i["codigo"]} for i in ped["itens"]]}
    def post(b):
        a=b.get("action")
        if a in("sessao","login"): return {"ok":True,"sessao":"tk2.x.y","usuario":{"whatsapp":"88999999999","name":"Ana Lojista","nome":"Ana Lojista","level":3,"permissoes":perms,"perfil":"Admin"}}
        if a=="curriculos_listar": return {"ok":True,"curriculos":[],"status":["Novo","Entrevista"],"motivos":[]}
        if a=="create": return {"ok":True,"id":"999","codigo":"TK-0099"}
        if novo and a=="criarPedido":
            ids=[str(i.get("id")) for i in b.get("itens",[])]
            itens=[x for x in P if str(x["ID"]) in ids and x["Status"]=="Ativo" and x["Estoque"]!=0]
            if len(str(b.get("nome","")).strip())<2: return {"ok":False,"erro":"Informe seu nome."}
            if not itens: return {"ok":False,"erro":"As peças escolhidas não estão mais disponíveis."}
            st["seq"]+=1; cod="PED-%04d"%st["seq"]
            ped={"codigo":cod,"data":"10/10/2026 12:00","atualizado":"10/10/2026 12:00","status":"novo","entrega":b.get("entrega","retirada"),"total":round(sum(x["Preco"]*0.9 for x in itens),2),
                 "itens":[{"id":x["ID"],"nome":x["Nome"],"codigo":x["Codigo"],"preco":round(x["Preco"]*0.9,2)} for x in itens],"nome":b.get("nome"),"whatsapp":"".join(c for c in str(b.get("whatsapp","")) if c.isdigit()),
                 "endereco":b.get("endereco",""),"obs":b.get("obs",""),"nota":"","origem":"site","historico":[{"quando":"10/10/2026 12:00","status":"novo","por":"cliente"}]}
            st["pedidos"].append(ped); return {"ok":True,"codigo":cod,"total":ped["total"]}
        if novo and a=="consultarPedido":
            cod=str(b.get("codigo","")).upper(); fim=str(b.get("final",""))
            if st["falhas"].get(cod,0)>=8: return {"ok":False,"bloqueado":True}
            for ped in st["pedidos"]:
                if ped["codigo"]==cod and ped["whatsapp"][-4:]==fim: return {"ok":True,"pedido":cliente(ped)}
            st["falhas"][cod]=st["falhas"].get(cod,0)+1; return {"ok":False,"naoEncontrado":True}
        if novo and a=="listarPedidos":
            cont={}
            for ped in st["pedidos"]: cont[ped["status"]]=cont.get(ped["status"],0)+1
            return {"ok":True,"pedidos":list(reversed(st["pedidos"])),"contagem":cont,"total":len(st["pedidos"])}
        if novo and a=="atualizarPedido":
            for ped in st["pedidos"]:
                if ped["codigo"]==b.get("codigo"):
                    if b.get("status") and b["status"]!=ped["status"]:
                        ped["status"]=b["status"]; ped["historico"].append({"quando":"10/10/2026 12:30","status":b["status"],"por":"Ana Lojista"})
                    if "nota" in b: ped["nota"]=b["nota"]
                    return {"ok":True,"pedido":ped}
            return {"ok":False,"erro":"Pedido não encontrado."}
        if novo and a=="metricas":
            dias=int(b.get("dias",30))
            return {"ok":True,"dias":dias,"geradoEm":"10/10/2026 12:00","semDados":False,"totais":{"visualizacoes":120,"whatsapp":18,"whatsappPor100Visualizacoes":15.0},
                "porDia":[{"dia":"2026-10-%02d"%(1+i%10),"visualizacoes":i%7,"whatsapp":i%3,"pedidos":0} for i in range(dias)],
                "topProdutos":[{"id":"1","codigo":"TK-0007","nome":"Vestido Floral","visualizacoes":40,"whatsapp":8,"taxa":20.0}],
                "categorias":[{"nome":"Vestido","visualizacoes":60,"whatsapp":9,"taxa":15.0}],
                "pedidos":{"total":len(st["pedidos"]),"valor":sum(x["total"] for x in st["pedidos"]),"porStatus":{},"concluidos":0,"valorConcluidos":0}}
        if novo and a=="gerarCodigosFaltantes":
            ger=[]; n=500
            for x in P:
                if not x["Codigo"]:
                    n+=1; x["Codigo"]="TK-%04d"%n; ger.append({"id":x["ID"],"nome":x["Nome"],"codigo":x["Codigo"]})
            return {"ok":True,"geradas":ger,"duplicados":[]}
        if novo and a=="importarProdutos":
            sim=b.get("simular") is True; at=[];cr=[];ig=[]
            for n,l in enumerate(b.get("linhas",[])):
                num=n+2; cod=(l.get("codigo") or "").upper(); alvo=next((x for x in P if x["Codigo"]==cod),None) if cod else None
                if alvo:
                    campos=[]
                    if l.get("preco"):
                        try: novo_p=float(l["preco"].replace(",","."))
                        except: ig.append({"linha":num,"codigo":cod,"motivo":"Preço inválido."}); continue
                        campos.append("preço: %s → %s"%(alvo["Preco"],novo_p))
                        if not sim: alvo["Preco"]=novo_p
                    if not campos: ig.append({"linha":num,"codigo":cod,"motivo":"Nada mudou.","semMudanca":True}); continue
                    at.append({"linha":num,"id":alvo["ID"],"codigo":cod,"nome":alvo["Nome"],"campos":campos})
                elif l.get("nome") and l.get("preco") and str(l.get("foto_url","")).startswith("https://"):
                    cr.append({"linha":num,"id":"n%d"%n,"codigo":"TK-%04d"%(700+n),"nome":l["nome"]})
                else: ig.append({"linha":num,"codigo":cod,"motivo":"Peça nova precisa de nome, preço e foto (https://)."})
            if not sim: st["importados"].append((at,cr))
            return {"ok":True,"simulacao":sim,"atualizados":at,"criados":cr,"ignorados":ig}
        if novo and a=="statusIntegracoes":
            i=st["integ"]; return {"ok":True,"pixelId":i["pixelId"],"capiConfigurado":i["capi"],"testeCodigo":i["teste"],"graphVersao":i["graph"],"sinonimos":i["sinonimos"],"segmentosPush":i["segmentos"]}
        if novo and a=="salvarIntegracoes":
            i=st["integ"]; st["salvou"]=dict(b)
            if "pixelId" in b: i["pixelId"]=b["pixelId"]
            if b.get("tokenCapi"): i["capi"]=True
            if b.get("limparTokenCapi"): i["capi"]=False
            for k,c in(("testeCodigo","teste"),("graphVersao","graph"),("sinonimos","sinonimos"),("segmentosPush","segmentos")):
                if k in b: i[c]=b[k]
            return {"ok":True,"pixelId":i["pixelId"],"capiConfigurado":i["capi"],"testeCodigo":i["teste"],"graphVersao":i["graph"],"sinonimos":i["sinonimos"],"segmentosPush":i["segmentos"]}
        if novo and a=="pushHistorico":
            return {"ok":True,"segmentos":["Subscribed Users"]+[s.strip() for s in st["integ"]["segmentos"].split(",") if s.strip()],"historico":list(reversed(st["push"]))}
        if a=="enviarPush":
            st["push"].append({"quando":"10/10/2026 12:00","quem":"Ana Lojista","titulo":b.get("titulo"),"mensagem":b.get("mensagem"),"segmento":b.get("segmento") or "Subscribed Users","destinatarios":7,"url":""}); st["ultimo_push"]=dict(b)
            return {"ok":True,"destinatarios":7}
        if a=="bulkUpdate":
            n=0
            for x in P:
                if str(x["ID"]) in [str(i) for i in b.get("ids",[])]:
                    n+=1
                    if b.get("tipoAcao")=="alterarEstoque": x["Estoque"]=b.get("valor")
                    if b.get("tipoAcao")=="alterarCategoria": x["Categoria"]=b.get("valor")
                    if b.get("tipoAcao")=="arquivar": x["Status"]="Inativo"
            st["lote"]=dict(b); return {"ok":True,"afetados":n}
        if a=="gerarSeo":
            if st["ia"]: return {"ok":True,"titulo":"Título IA","descricao":"Descrição IA"}
            return {"ok":True,"local":True,"aviso":"Chave do Gemini não configurada.","titulo":(b.get("nome","")+" | TENKiTER Modas")[:60],"descricao":b.get("nome","")+" na TENKiTER Modas, em Crateús-CE. 10% de desconto à vista. Peça pelo WhatsApp."}
        return {"ok":True,"itens":[],"funcionarios":[],"avaliacoes":[],"lista":[],"cadastrados":[]}
    def hd(route):
        r=route.request;u=r.url
        if "script.google.com" in u:
            if r.method=="POST":
                b=json.loads(r.post_data or "{}")
                if log is not None: log.append(b)
                if delay: __import__("time").sleep(delay)
                return route.fulfill(json=post(b))
            if "action=versao" in u: return route.fulfill(json=FLAGS)
            if "action=config" in u: return route.fulfill(json={"ok":True,"config":{"pixelId":st["integ"]["pixelId"],"sinonimos":[x for x in st["integ"]["sinonimos"].split("\n") if "=" in x]}})
            if "action=list" in u: return route.fulfill(json={"ok":True,"produtos":P if "todos=true" in u else [x for x in P if x["Status"]=="Ativo"]})
            if "action=categorias" in u: return route.fulfill(json={"ok":True,"categorias":CATS})
            if "action=generos" in u: return route.fulfill(json={"ok":True,"generos":GENS})
            if "action=stats" in u: return route.fulfill(json={"ok":True,"totalVisualizacoes":120,"totalWhatsapp":18,"produtoMaisVistoId":"1790000000003","produtoMaisVistoCodigo":"TK-0003","produtoMaisVistoViews":40})
            if "manuais_lista" in u: return route.fulfill(json={"ok":True,"manuais":[]})
            return route.fulfill(json={"ok":True})
        if "lh3.googleusercontent" in u or "cloudinary" in u: return route.fulfill(body=PNG,content_type="image/png")
        if "connect.facebook.net" in u: return route.fulfill(body="/* fbevents simulado */",content_type="application/javascript")
        if u.startswith("http://localhost") or u.startswith(BASE_LOCAL): return route.continue_()
        if "fonts.g" in u: return route.abort()
        return route.abort()
    ctx.route("**/*",hd)
    return st
SESSION="localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999999999',sessao:'tk2.x.y'}));"
