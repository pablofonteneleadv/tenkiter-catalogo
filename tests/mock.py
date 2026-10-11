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
def install(ctx, perms=PERMS_ALL, log=None, delay=0, versao="3.2", pixel="", sem_codigo=0, ia=True):
    """Simula o Apps Script. versao="3.2" (padrão) liga também apagar/renomear categoria; "3.1" tem pedidos/métricas/CSV/integrações mas não mexe em categoria; "3.0" é o backend antigo (o site tem que seguir funcionando).
    Devolve um dicionário de estado (pedidos, integrações, produtos...) para os testes conferirem."""
    P=prods()
    for i in range(sem_codigo):
        q=dict(P[i]); q["ID"]=str(1790000009000+i); q["Nome"]="Peça antiga %d"%(i+1); q["Codigo"]=""; P.append(q)
    novo = versao != "3.0"
    st={"produtos":P,"pedidos":[],"falhas":{},"integ":{"pixelId":pixel,"capi":False,"teste":"","graph":"v23.0","sinonimos":"","segmentos":"Clientes Infantil"},"push":[],"importados":[],"seq":0,"ia":ia,"categorias":list(CATS)}
    cat_gestao = versao >= "3.2"
    push3 = novo and versao >= "3.3"     # avisos completos (pushCompleto): público, agendamento, modelos, histórico com números
    conex = novo and versao >= "3.4"     # Conexões (conexoes): chaves do Render/Cloudflare guardadas no servidor, situação, regras, publicar
    st["conex"]={"render":{"temChave":False,"fim":"","salvaEm":""},"cloudflare":{"temChave":False,"fim":"","salvaEm":""}}
    st["regras_ok"]=False; st["deploys"]=0; st["status_deploy"]=0
    st["modelos"]=[{"id":"m1","rotulo":"Promoção","titulo":"Promoção de fim de semana! 🎉","mensagem":"{nome}, 20% off até domingo.","url":"","imagem":""},
                   {"id":"m2","rotulo":"Chegou novidade","titulo":"Chegou novidade! ✨","mensagem":"Peças novas no catálogo.","url":"","imagem":""}]
    st["pessoas"]=[{"pid":"tkaluna0000000000000000000000001","nome":"Bia Aluna","perfil":"Aluno","tel":"(88) 9****-0005","grupo":"aluno"},
                   {"pid":"tkclient000000000000000000000002","nome":"Caio Cliente","perfil":"Cliente","tel":"(88) 9****-7777","grupo":"cliente"}]
    st["pushcfg"]={"chave":True,"web":True,"novo":True,"etapa":True}
    st["avisos"]=[]
    FLAGS={"ok":True,"versao":"catalogo-"+versao,"acessos":True,"pinAtivo":False,"pedidos":True,"config":True,"metricas":True,"importacao":True,"feed":True,"integracoes":True,"codigos":True,"pushHistorico":True,"loteCategoria":True} if novo else {"ok":True,"versao":"catalogo-3.0","acessos":True,"pinAtivo":False}
    if cat_gestao: FLAGS["categoriasGestao"]=True
    if push3: FLAGS["pushCompleto"]=True
    if conex: FLAGS["conexoes"]=True
    def limpa(n): return " ".join(str(n or "").replace(","," ").split())[:60].strip()
    def norm(n):
        import unicodedata
        return "".join(c for c in unicodedata.normalize("NFD",str(n)) if unicodedata.category(c)!="Mn").lower().strip()
    def cats_da(x): return [c.strip() for c in str(x.get("Categoria","")).split(",") if c.strip()]
    def cliente(ped):
        return {"codigo":ped["codigo"],"data":ped["data"],"atualizado":ped["atualizado"],"status":ped["status"],"entrega":ped["entrega"],"total":ped["total"],"itens":[{"nome":i["nome"],"codigo":i["codigo"]} for i in ped["itens"]]}
    def post(b):
        a=b.get("action")
        if a in("sessao","login"): return {"ok":True,"sessao":"tk2.x.y","usuario":{"whatsapp":"88999999999","name":"Ana Lojista","nome":"Ana Lojista","level":3,"permissoes":perms,"perfil":"Admin"}}
        if a=="curriculos_listar": return {"ok":True,"curriculos":[],"status":["Novo","Entrevista"],"motivos":[]}
        if a=="create": return {"ok":True,"id":"999","codigo":"TK-0099"}
        if a=="addCategoria":
            n=limpa(b.get("nome"))
            if not n: return {"ok":False,"erro":"Escreva o nome da categoria."}
            ja=[c for c in st["categorias"] if norm(c)==norm(n)]
            if ja: return {"ok":True,"nome":ja[0],"jaExistia":True}
            st["categorias"].append(n); return {"ok":True,"nome":n}
        if cat_gestao and a in("excluirCategoria","renomearCategoria"):
            if "gerir_acessos" not in perms: return {"ok":False,"semPermissao":True,"erro":"Você não tem permissão para essa ação."}
            alvo=[c for c in st["categorias"] if norm(c)==norm(b.get("nome"))]
            if not alvo: return {"ok":False,"naoExiste":True,"erro":"Essa categoria não existe mais."}
            alvo=alvo[0]; pecas=[x for x in P if any(norm(c)==norm(alvo) for c in cats_da(x))]
            if a=="excluirCategoria":
                if pecas and not b.get("confirmar"): return {"ok":False,"emUso":len(pecas),"erro":"Essa categoria está em %d peça(s)."%len(pecas)}
                for x in pecas: x["Categoria"]=", ".join(c for c in cats_da(x) if norm(c)!=norm(alvo))
                st["categorias"]=[c for c in st["categorias"] if c!=alvo]; return {"ok":True,"pecas":len(pecas)}
            novo_nome=limpa(b.get("novoNome"))
            if not novo_nome: return {"ok":False,"erro":"Escreva o novo nome."}
            existe=[c for c in st["categorias"] if norm(c)==norm(novo_nome) and c!=alvo]
            final=existe[0] if existe else novo_nome
            for x in pecas:
                novas=[]
                for c in cats_da(x):
                    c2=final if norm(c)==norm(alvo) else c
                    if c2 not in novas: novas.append(c2)
                x["Categoria"]=", ".join(novas)
            st["categorias"]=[c for c in st["categorias"] if c!=alvo]
            if not existe: st["categorias"].append(final)
            return {"ok":True,"nome":final,"juntou":bool(existe),"pecas":len(pecas)}
        if novo and a=="criarPedido":
            ids=[str(i.get("id")) for i in b.get("itens",[])]
            itens=[x for x in P if str(x["ID"]) in ids and x["Status"]=="Ativo" and x["Estoque"]!=0]
            if len(str(b.get("nome","")).strip())<2: return {"ok":False,"erro":"Informe seu nome."}
            if not itens: return {"ok":False,"erro":"As peças escolhidas não estão mais disponíveis."}
            st["seq"]+=1; cod="PED-%04d"%st["seq"]
            ped={"codigo":cod,"data":"10/10/2026 12:00","atualizado":"10/10/2026 12:00","status":"novo","entrega":b.get("entrega","retirada"),"total":round(sum(x["Preco"]*0.9 for x in itens),2),
                 "itens":[{"id":x["ID"],"nome":x["Nome"],"codigo":x["Codigo"],"preco":round(x["Preco"]*0.9,2)} for x in itens],"nome":b.get("nome"),"whatsapp":"".join(c for c in str(b.get("whatsapp","")) if c.isdigit()),
                 "endereco":b.get("endereco",""),"obs":b.get("obs",""),"nota":"","origem":"site","historico":[{"quando":"10/10/2026 12:00","status":"novo","por":"cliente"}]}
            st["pedidos"].append(ped); r={"ok":True,"codigo":cod,"total":ped["total"]}
            if push3: r["pushKey"]="pk%028d"%st["seq"]
            return r
        if novo and a=="consultarPedido":
            cod=str(b.get("codigo","")).upper(); fim=str(b.get("final",""))
            if st["falhas"].get(cod,0)>=8: return {"ok":False,"bloqueado":True}
            for ped in st["pedidos"]:
                if ped["codigo"]==cod and ped["whatsapp"][-4:]==fim:
                    r={"ok":True,"pedido":cliente(ped)}
                    if push3: r["pushKey"]="pk%028d"%int(cod[4:])
                    return r
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
        if conex and a in("statusConexoes","salvarConexao","testarConexoes","renderCriarRegras","renderDeploy","renderStatusDeploy"):
            if "gerir_acessos" not in perms: return {"ok":False,"semPermissao":True,"erro":"Você não tem permissão para essa ação."}
            C=st["conex"]
            def estado(extra=None):
                r={"ok":True,"conexoes":{k:{"rotulo":k.title(),**v} for k,v in C.items()},"servico":"srv-dasa63fpn0mc73fh8fgg",
                   "enderecos":{"feedCsv":"https://tenkitermodas.com.br/feed.csv","feedXml":"https://tenkitermodas.com.br/feed.xml","sitemap":"https://tenkitermodas.com.br/sitemap.xml"}}
                r.update(extra or {}); return r
            if a=="statusConexoes": return estado()
            if a=="salvarConexao":
                n=b.get("nome")
                if n not in C: return {"ok":False,"erro":"Conexão desconhecida."}
                if b.get("apagar") is True: C[n]={"temChave":False,"fim":"","salvaEm":""}; st["apagou"]=n; return estado()
                k=str(b.get("chave","")).strip(); st["chave_enviada"]=k
                if len(k)<20: return {"ok":False,"erro":"Essa chave parece incompleta ou com caracteres estranhos. Cole de novo, só a chave, sem espaços."}
                if "RECUSADA" in k: return {"ok":False,"erro":"Não guardei a chave: A chave foi recusada (inválida, vencida ou sem permissão)."}
                C[n]={"temChave":True,"fim":k[-4:],"salvaEm":"2026-10-10T22:40:00.000Z"}
                return estado({"detalhe":'Enxerga o site "tenkiter-catalogo".' if n=="render" else "Chave ativa."})
            if a=="testarConexoes":
                ok=st["regras_ok"]; rc=C["render"]["temChave"]; cc=C["cloudflare"]["temChave"]; acao="renderCriarRegras" if rc else "chave:render"
                it=[{"id":"feed-csv","rotulo":"Catálogo para a Meta (feed.csv)","ok":ok,"detalhe":"9 peça(s) no feed do seu site." if ok else "O endereço https://tenkitermodas.com.br/feed.csv não entregou o catálogo (falta a regra no Render).","acao":"" if ok else acao},
                    {"id":"feed-xml","rotulo":"Catálogo para o Google (feed.xml)","ok":ok,"detalhe":"9 peça(s) no feed do seu site." if ok else "O endereço https://tenkitermodas.com.br/feed.xml não entregou o catálogo (falta a regra no Render).","acao":"" if ok else acao},
                    {"id":"sitemap","rotulo":"Mapa do site para o Google (sitemap.xml)","ok":ok,"detalhe":"Lista 9 peça(s) além das páginas fixas." if ok else "O endereço https://tenkitermodas.com.br/sitemap.xml não respondeu direito.","acao":"" if ok else acao},
                    {"id":"onesignal","rotulo":"Avisos (OneSignal, plataforma Web)","ok":bool(st["pushcfg"]["web"]),"detalhe":"Plataforma Web ligada: os avisos podem chegar." if st["pushcfg"]["web"] else "A plataforma Web do OneSignal ainda NÃO foi ligada: sem isso nenhum aviso chega.","acao":""}]
                if not rc: it.append({"id":"render-chave","rotulo":"Render (publicar e regras)","ok":None,"detalhe":"Sem chave guardada. Guarde abaixo para o painel conseguir conferir as regras e publicar o site.","acao":"chave:render"})
                else:
                    it.append({"id":"render-chave","rotulo":"Render (publicar e regras)","ok":True,"detalhe":'Enxerga o site "tenkiter-catalogo".',"acao":""})
                    it.append({"id":"render-regras","rotulo":"Regras do Render","ok":ok,"detalhe":"Todas no lugar: /p/*, /feed.csv, /feed.xml, /sitemap.xml." if ok else "Faltam: /feed.csv, /feed.xml, /sitemap.xml.","acao":"" if ok else "renderCriarRegras"})
                if not cc: it.append({"id":"cloudflare-chave","rotulo":"Cloudflare (Worker das miniaturas, feed e mapa)","ok":None,"detalhe":"Sem chave guardada. É opcional.","acao":"chave:cloudflare"})
                else: it.append({"id":"worker","rotulo":"Worker tenkiter-og","ok":True,"detalhe":"Publicado em 10/10/2026 22:36.","acao":""})
                return {"ok":True,"itens":it,"quando":"2026-10-10T22:41:00.000Z"}
            if a=="renderCriarRegras":
                if not C["render"]["temChave"]: return {"ok":False,"erro":"Guarde primeiro a chave do Render (em Conexões)."}
                criar=[] if st["regras_ok"] else ["/feed.csv","/feed.xml","/sitemap.xml"]; st["regras_ok"]=True
                return {"ok":True,"criadas":criar,"divergentes":[],"jaExistiam":4-len(criar)}
            if a=="renderDeploy":
                if not C["render"]["temChave"]: return {"ok":False,"erro":"Guarde primeiro a chave do Render (em Conexões)."}
                st["deploys"]+=1; st["status_deploy"]=0; return {"ok":True,"deployId":"dep-novo000000001","status":"created"}
            if a=="renderStatusDeploy":
                st["status_deploy"]+=1
                if st.get("deploy_falha"): return {"ok":True,"status":"build_failed"}
                return {"ok":True,"status":"build_in_progress" if st["status_deploy"]<2 else "live"}
        if push3 and a=="pushIdentidade":
            if not str(b.get("sessao","")).startswith("tk"): return {"ok":False,"sessaoInvalida":True,"erro":"Sessão inválida. Entre de novo."}
            return {"ok":True,"pushId":"tkpush0000000000000000000000000","nome":"Ana Lojista","perfil":"Admin","tipo":"equipe","equipe":True}
        if push3 and a=="pushStatus":
            c=st["pushcfg"]
            return {"ok":True,"appId":"535f6b0d-c866-43c2-b241-43bd7ab62fae","chaveConfigurada":c["chave"],"webPronto":c["web"],"segmentos":["Subscribed Users"],
                    "contas":{"total":9,"equipe":2,"alunos":3,"portal":4,"clientes":2},"perfis":[{"nome":"Admin","total":1},{"nome":"Aluno","total":3},{"nome":"Cliente","total":2}],
                    "acessos":[{"chave":"catalogo_push","rotulo":"Enviar avisos","grupo":"Catálogo","total":2},{"chave":"portal","rotulo":"Portal de treinamento","grupo":"Portal","total":4}],
                    "interesses":[{"chave":"feminino-adulto","rotulo":"Feminino Adulto"},{"chave":"infantil-menina","rotulo":"Infantil Menina"}],"autoNovoPedido":c["novo"],"autoPedido":c["etapa"]}
        if push3 and a=="salvarPushConfig":
            if "gerir_acessos" not in perms: return {"ok":False,"semPermissao":True,"erro":"Você não tem permissão para essa ação."}
            if "autoNovoPedido" in b: st["pushcfg"]["novo"]=bool(b["autoNovoPedido"])
            if "autoPedido" in b: st["pushcfg"]["etapa"]=bool(b["autoPedido"])
            return post({"action":"pushStatus"})
        if push3 and a=="pushModelos": return {"ok":True,"modelos":list(st["modelos"])}
        if push3 and a=="salvarPushModelo":
            m=dict(b.get("modelo") or {})
            if not (m.get("rotulo") and m.get("titulo") and m.get("mensagem")): return {"ok":False,"erro":"Modelo: nome, título e mensagem são obrigatórios."}
            if m.get("id"):
                st["modelos"]=[dict(m) if x["id"]==m["id"] else x for x in st["modelos"]]
            else:
                m["id"]="m%d"%(len(st["modelos"])+10); st["modelos"].append(m)
            return {"ok":True,"id":m["id"],"modelos":list(st["modelos"])}
        if push3 and a=="excluirPushModelo":
            st["modelos"]=[x for x in st["modelos"] if x["id"]!=b.get("id")]; return {"ok":True,"modelos":list(st["modelos"])}
        if push3 and a=="pushPessoas":
            q=norm(b.get("q",""))
            return {"ok":True,"pessoas":[x for x in st["pessoas"] if q and q in norm(x["nome"])]}
        if push3 and a=="pushPrevia":
            au=b.get("audiencia") or {}; t=au.get("tipo")
            if t in("grupo","perfil","acesso"): return {"ok":True,"descricao":"Grupo "+str(au.get("grupo") or au.get("perfis") or au.get("chaves")),"quantidade":2,"porAparelho":False,"amostra":["Bia Aluna","Caio Cliente"]}
            if t=="pessoas": return {"ok":True,"descricao":"%d pessoa(s) escolhida(s)"%len(au.get("ids",[])),"quantidade":len(au.get("ids",[])),"porAparelho":False,"amostra":[x["nome"] for x in st["pessoas"] if x["pid"] in au.get("ids",[])]}
            if t=="pedido" and not au.get("codigo"): return {"ok":False,"erro":"Informe o código do pedido."}
            return {"ok":True,"descricao":"Todos que ativaram os avisos" if t=="todos" else str(t),"quantidade":None,"porAparelho":True,"amostra":[]}
        if push3 and a=="enviarPush":
            if not b.get("titulo") or not b.get("mensagem"): return {"ok":False,"erro":"Título e mensagem são obrigatórios."}
            if st["pushcfg"].get("falhar"): return {"ok":False,"erro":st["pushcfg"]["falhar"],"semAviso":["Caio Cliente"]}
            st["ultimo_push"]=dict(b); au=b.get("audiencia") or {}
            nid="nid%04d"%(len(st["avisos"])+1); agend=bool(b.get("agendarEm"))
            st["avisos"].append(nid)
            st["push"].append({"quando":"10/10/2026 12:00","quem":"Ana Lojista","titulo":b.get("titulo"),"mensagem":b.get("mensagem"),"segmento":"","destinatarios":2,"url":b.get("url") or "","resultado":"agendado" if agend else "enviado","id":nid,"audiencia":str(au.get("tipo")),"agendado":"11/10/2026 09:00" if agend else "","imagem":b.get("imagem") or ""})
            return {"ok":True,"id":nid,"destinatarios":2,"agendado":agend,"descricao":str(au.get("tipo")),"pessoas":2,"semAviso":st["pushcfg"].get("semAviso",[]),"individuais":False}
        if push3 and a=="pushNumeros": return {"ok":True,"entregues":5,"falhas":1,"cliques":2,"restantes":0,"cancelado":False}
        if push3 and a=="pushCancelar":
            for x in st["push"]:
                if x.get("id")==b.get("id"): x["resultado"]="cancelado"
            return {"ok":True}
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
            if "action=pushconfig" in u: return route.fulfill(json={"ok":True,"interesses":[{"chave":"feminino-adulto","rotulo":"Feminino Adulto"},{"chave":"infantil-menina","rotulo":"Infantil Menina"}]} if push3 else {"ok":True})
            if "action=categorias" in u: return route.fulfill(json={"ok":True,"categorias":list(st["categorias"])})
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
