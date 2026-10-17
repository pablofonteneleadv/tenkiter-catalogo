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
def install(ctx, perms=PERMS_ALL, log=None, delay=0, versao="3.2", pixel="", sem_codigo=0, ia=True, protegido=False):
    """Simula o Apps Script. versao="3.2" (padrão) liga também apagar/renomear categoria; "3.1" tem pedidos/métricas/CSV/integrações mas não mexe em categoria; "3.0" é o backend antigo (o site tem que seguir funcionando).
    Devolve um dicionário de estado (pedidos, integrações, produtos...) para os testes conferirem."""
    P=prods()
    for i in range(sem_codigo):
        q=dict(P[i]); q["ID"]=str(1790000009000+i); q["Nome"]="Peça antiga %d"%(i+1); q["Codigo"]=""; P.append(q)
    novo = versao != "3.0"
    st={"produtos":P,"pedidos":[],"falhas":{},"integ":{"pixelId":pixel,"capi":False,"teste":"","graph":"v23.0","sinonimos":"","segmentos":"Clientes Infantil"},"push":[],"importados":[],"seq":0,"ia":ia,"categorias":list(CATS),"midia":{"modo":"recusa","envios":[]},"ig":{"conectado":True,"seq":10,"chamadas":[],"rasc":[{"id":1,"grupo":"pendente","status":"pendente","origem":"carrossel","legenda":"Vestido floral TK-0003 R$ 89,90 P M G","permalink":"https://www.instagram.com/p/AAA/","publicadoEm":"2026-10-10T12:00:00Z","precoSug":"89.90","tamanhosSug":"P, M, G","codigoDup":"TK-0003","produtoId":"","midias":[{"id":"m1","tipo":"foto","url":"https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/a1.jpg","mini":"https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/a1.jpg","capa":True},{"id":"m2","tipo":"foto","url":"https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/a2.jpg","mini":"https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/a2.jpg","capa":False}]},{"id":2,"grupo":"sem_id","status":"pendente","origem":"story","legenda":"","permalink":"","publicadoEm":"2026-10-10T13:00:00Z","precoSug":"","tamanhosSug":"","codigoDup":"","produtoId":"","midias":[{"id":"m3","tipo":"foto","url":"https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/a3.jpg","mini":"https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/a3.jpg","capa":True}]}]}}
    cat_gestao = versao >= "3.2"
    push3 = novo and versao >= "3.3"     # avisos completos (pushCompleto): público, agendamento, modelos, histórico com números
    conex = novo and versao >= "3.4"     # Conexões (conexoes): chaves do Render/Cloudflare guardadas no servidor, situação, regras, publicar
    conex5 = conex and versao >= "3.5"   # Conexões com OneSignal (conexoesOnesignal): Organization ID + chave da organização, "Ligar os avisos agora"
    st["conex"]={"render":{"temChave":False,"fim":"","salvaEm":""},"cloudflare":{"temChave":False,"fim":"","salvaEm":""}}
    if conex5: st["conex"]["onesignal"]={"temChave":False,"fim":"","salvaEm":"","orgId":"","appId":"535f6b0d-c866-43c2-b241-43bd7ab62fae","chaveEnvio":False}
    st["ligou"]=0
    conex43 = conex5 and versao >= "4.3"  # Instagram nas Conexões + cofre (conexoesInstagram)
    if conex43: st["conex"]["instagram"]={"temChave":False,"fim":"","salvaEm":""}
    conex6 = conex5 and versao >= "3.6"   # Cofre (conexoesCopiar): abrirCofre (senha de novo) + revelarConexao
    avanc = conex5                        # metricasAvancadas + dispositivos (3.5 parte 2): Números reais com filtros, aparelhos e contagem por público
    st["metricas_pedidos"]=[]; st["dispositivos"]=[]
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
    if conex5: FLAGS["conexoesOnesignal"]=True
    if conex6: FLAGS["conexoesCopiar"]=True
    if conex43: FLAGS["conexoesInstagram"]=True
    if versao>="3.7" and novo: FLAGS["midiaRapida"]=True; FLAGS["juntarProdutos"]=True
    if versao>="4.1" and novo: FLAGS["auditoriaProdutos"]=True
    if versao>="4.18" and novo: FLAGS["opcoesLista"]=True
    if versao>="4.19" and novo: FLAGS["opIdempotente"]=True
    st["opcoes"]={"tamanhos":["PP","P","M","G","GG","Único"],"cores":["Preto","Branco","Estampado"]}
    st["opcoes_add"]=[]
    if avanc: FLAGS["metricasAvancadas"]=True; FLAGS["dispositivos"]=True
    if protegido: FLAGS["conteudoProtegido"]=True   # backend de RH 3.4: treinamento_conteudo
    st["conteudo_chamadas"]=[]
    def limpa(n): return " ".join(str(n or "").replace(","," ").split())[:60].strip()
    def norm(n):
        import unicodedata
        return "".join(c for c in unicodedata.normalize("NFD",str(n)) if unicodedata.category(c)!="Mn").lower().strip()
    def cats_da(x): return [c.strip() for c in str(x.get("Categoria","")).split(",") if c.strip()]
    def cliente(ped):
        return {"codigo":ped["codigo"],"data":ped["data"],"atualizado":ped["atualizado"],"status":ped["status"],"entrega":ped["entrega"],"total":ped["total"],"itens":[{"nome":i["nome"],"codigo":i["codigo"]} for i in ped["itens"]]}
    def post(b):
        a=b.get("action")
        if a=="avaliacoes_contagem":
            feitas=st.setdefault("aval_feitas",{})
            return {"ok":True,"porId":{i:feitas.get(i,0) for i in ("1","2","3")},"contagem":{},"maxPorManual":{"1":3,"2":3,"3":3},"max":3}
        if a=="resultado" and b.get("manualId"):
            feitas=st.setdefault("aval_feitas",{}); vistos=st.setdefault("aval_ids",set()); mid=str(b.get("manualId"))
            if b.get("tentativaId") in vistos: return {"ok":True,"repetida":True,"tentativa":feitas.get(mid,0),"max":3}
            if feitas.get(mid,0)>=3: return {"ok":False,"limite":True,"tentativa":feitas.get(mid,0),"max":3,"erro":"Você já usou as 3 avaliações deste manual."}
            vistos.add(b.get("tentativaId")); feitas[mid]=feitas.get(mid,0)+1
            return {"ok":True,"tentativa":feitas[mid],"max":3}
        if a=="treinamento_conteudo":
            st["conteudo_chamadas"].append(b)
            tem=lambda c: c in perms
            ms=[]
            for i,tit in (("1","Manual Um"),("2","Manual Dois"),("3","Manual Três")):
                lib=tem("portal") and tem("manual_"+i)
                ms.append({"id":i,"titulo":tit,"blurb":"resumo "+i,"nivelMinimo":int(i),"ordem":int(i),"liberado":lib,"parts":([{"title":"Parte","chapters":[{"title":"Cap "+i,"id":"cap-"+i,"hash":"h"+i,"blocks":[{"type":"p","text":"TEXTO-DO-SERVIDOR-"+i}]}]}] if lib else [])})
            provas={i:{"title":"Prova "+i,"pass":0.7,"questions":[{"q":"Pergunta do servidor?","options":["A","B"],"correct":1,"explain":"x"}]} for i in ("1","2","3") if tem("avaliacoes") and tem("manual_"+i)}
            return {"ok":True,"manuais":ms,"provas":provas}
        if versao>="4.1" and a=="auditoriaProdutos":
            st.setdefault("aud_chamadas",[]).append(b)
            return {"ok":True,"itens":st.get("auditoria",{"1790000000000":{"criadoPor":"Ana Cadastro","criadoEm":"2026-10-11T17:32:00.000Z","editadoPor":"Beto Edita","editadoEm":"2026-10-11T19:05:00.000Z","ultimaAcao":"Editou a peça"}})}
        if versao>="4.1" and a=="historicoProduto":
            return {"ok":True,"historico":[{"quando":"2026-10-11T19:05:00.000Z","quem":"Beto Edita","acao":"Editou a peça","resumo":"preço 89 → 99"},{"quando":"2026-10-11T17:32:00.000Z","quem":"Ana Cadastro","acao":"Cadastrou a peça","resumo":""}]}
        if versao>="3.7" and a in("arquivarRapido","arquivarMidia","restaurarMidia","juntarProdutos"):
            st.setdefault("x_chamadas",[]).append(b)
            if "catalogo_cadastrar" not in perms: return {"ok":False,"semPermissao":True,"erro":"Você não tem permissão para essa ação."}
            x=next((q for q in P if str(q["ID"])==str(b.get("id") or b.get("destinoId"))),None)
            if a=="juntarProdutos": return {"ok":True,"arquivados":len(b.get("origemIds",[]))}
            if a=="restaurarMidia":
                r=st.setdefault("x_arq",{}).get(b.get("registro"))
                if not r: return {"ok":False,"erro":"Registro não encontrado."}
                y=next(q for q in P if str(q["ID"])==r["id"]); gal=[g for g in y["Fotos_Galeria"].split(",") if g]
                if r["tipo"]=="video": y["Video_URL"]=r["url"]
                else: gal.insert(r["pos"],r["url"]); y["Fotos_Galeria"]=",".join(gal)
                return {"ok":True}
            if not x: return {"ok":False,"erro":"Produto não encontrado."}
            if a=="arquivarRapido": x["Status"]="Inativo"; return {"ok":True}
            gal=[g for g in x["Fotos_Galeria"].split(",") if g]; url=b.get("url")
            if b.get("tipo")=="video": x["Video_URL"]=""; pos=0; nova=""
            elif url==x["Foto_URL"]:
                if not gal: return {"ok":False,"erro":"Essa é a única foto do produto. Para tirar o produto do site, arquive o produto inteiro."}
                nova=gal[0]; x["Foto_URL"]=nova; x["Fotos_Galeria"]=",".join(gal[1:]); pos=0
            elif url in gal: pos=gal.index(url); gal.remove(url); x["Fotos_Galeria"]=",".join(gal); nova=""
            else: return {"ok":False,"erro":"Essa foto já não está no produto."}
            reg="MA%d"%(len(st.setdefault("x_arq",{}))+1); st["x_arq"][reg]={"id":str(x["ID"]),"tipo":b.get("tipo"),"url":url,"pos":pos}
            return {"ok":True,"registro":reg,"novaCapa":nova}
        if a in("acessos_listar","acessos_perfil"):
            AP=st.setdefault("acpessoas",[{"whatsapp":"88999999999","nome":"Ana Lojista","perfil":"Admin total","status":"Ativo"},{"whatsapp":"88988887777","nome":"Cris Cliente","perfil":"Cliente","status":"Ativo"}])
            PF={"Cliente":["cliente"],"Aluno":["portal"],"Equipe do site":["catalogo_admin","catalogo_cadastrar"],"Funcionário":["portal","catalogo_admin","catalogo_cadastrar"],"Admin total":["cliente","portal","catalogo_admin","catalogo_cadastrar","gerir_acessos"]}
            if a=="acessos_perfil":
                st.setdefault("perfil_chamadas",[]).append(b)
                if "gerir_acessos" not in perms: return {"ok":False,"semPermissao":True,"erro":"Sem permissão."}
                nomes=b.get("perfis") or ([b.get("perfil")] if b.get("perfil") else [])
                if not nomes: return {"ok":False,"erro":"Escolha pelo menos um perfil."}
                if any(n not in PF for n in nomes): return {"ok":False,"erro":"Perfil desconhecido."}
                alvo=next((q for q in AP if q["whatsapp"]==b.get("whatsappAlvo")),None)
                if not alvo: return {"ok":False,"erro":"Pessoa não encontrada."}
                outros=[n for n in nomes if n!="Cliente"]; fin=(["Cliente"]+outros) if outros else ["Cliente"]
                perm=sorted({k for n in fin for k in PF[n]})
                if alvo["whatsapp"]=="88999999999" and "gerir_acessos" not in perm: return {"ok":False,"erro":"Você não pode tirar o seu próprio acesso de Admin total (para não se trancar para fora). Peça a outro Admin total para mudar o seu perfil."}
                alvo["perfil"]=", ".join(fin); return {"ok":True,"perfil":alvo["perfil"]}
            pes=[]
            for q in AP:
                ns=[n.strip() for n in q["perfil"].split(",")]; perm=sorted({k for n in ns for k in PF.get(n,[])})
                pes.append(dict(q,permissoes=perm,nivel=1,cadastro="2026-10-01T10:00:00",fotoPerfilUrl="",fotoCorpoUrl="",curriculo="",curriculoEtapa="",curriculoAntigo=False))
            return {"ok":True,"pessoas":pes,"perfis":[{"nome":n,"desc":"","permissoes":v} for n,v in PF.items()],"permissoes":[{"chave":k,"rotulo":k,"grupo":"Geral"} for k in ["cliente","portal","catalogo_admin","catalogo_cadastrar","gerir_acessos"]],"totalClientes":1,"eu":"88999999999","truncado":False}
        if a in("sessao","login"): return {"ok":True,"sessao":"tk2.x.y","usuario":{"whatsapp":"88999999999","name":"Ana Lojista","nome":"Ana Lojista","level":3,"permissoes":perms,"perfil":"Admin"}}
        if a=="curriculos_listar": return {"ok":True,"curriculos":[],"status":["Novo","Entrevista"],"motivos":[]}
        if a=="create":
            op=b.get("opId"); cr_=st.setdefault("creates",{})
            if op and versao>="4.19" and op in cr_: return dict(cr_[op],repetido=True)
            r_={"ok":True,"id":"999","codigo":"TK-0099"}
            if op: cr_[op]=r_
            return r_
        if a=="sugerirPorFoto": st.setdefault("ia_chamadas",[]).append(b.get("fotos",[])); return {"ok":False,"erro":"Teste: IA simulada."}
        if a in("addTamanho","addCor"):
            if "gerir_acessos" not in perms: return {"ok":False,"semPermissao":True,"erro":"Você não tem permissão para essa ação."}
            n=limpa(b.get("nome")); ch="cores" if a=="addCor" else "tamanhos"
            if not n: return {"ok":False,"erro":"Escreva o nome."}
            ja=[c for c in st["opcoes"][ch] if norm(c)==norm(n)]
            if ja: return {"ok":True,"nome":ja[0],"jaExistia":True}
            st["opcoes"][ch].append(n); st["opcoes_add"].append((a,n)); return {"ok":True,"nome":n}
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
        if avanc and a=="dispositivo":
            st["dispositivos"].append(dict(b)); return {"ok":True}
        if avanc and a=="metricas":
            st["metricas_pedidos"].append(dict(b))
            nome={"app":"App instalado","site":"Navegador","nao_informado":"Não informado"}
            partes=["de %s a %s"%(b["de"],b["ate"]) if b.get("de") else "últimos %d dias"%int(b.get("dias",30))]
            if b.get("horaDe") is not None: partes.append("das %sh às %sh59"%(b["horaDe"],b["horaAte"]))
            if b.get("diasSemana"): partes.append(", ".join(["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][d] for d in b["diasSemana"]))
            for k in("origem","dispositivo","fonte","categoria","genero"):
                if b.get(k): partes.append("%s %s"%(k,nome.get(b[k],b[k])))
            filtrado=len(partes)>1 or int(b.get("dias",30))!=30
            f=0.25 if filtrado else 1.0
            ndias=int(b.get("dias",30)) if not b.get("de") else 7
            vis=int(120*f); zap=int(18*f)
            ap={"total":12,"instalaram":4,"instalaramNoPeriodo":2,"usaramAppNoPeriodo":3,"pushAtivos":7,"pushAtivosNoApp":3,"pushAtivosVistos30":6,"porPlataforma":{"android":4,"ios":2,"computador":1,"outro":0},"comConta":5,"desde":"11/10/2026",
                "onesignal":({"inscritos":15,"recebem":11} if st["conex"].get("onesignal",{}).get("temChave") else None)}
            if st.get("sem_aparelhos"): ap.update({"total":0,"instalaram":0,"instalaramNoPeriodo":0,"usaramAppNoPeriodo":0,"pushAtivos":0,"pushAtivosNoApp":0,"comConta":0,"porPlataforma":{"android":0,"ios":0,"computador":0,"outro":0}})
            return {"ok":True,"dias":int(b.get("dias",30)),"geradoEm":"11/10/2026 12:00","semDados":st.get("sem_dados",False),"filtros":{"dias":int(b.get("dias",30)),"de":b.get("de",""),"ate":b.get("ate","")},
                "filtrosDescricao":" · ".join(partes),"filtrado":filtrado,
                "totais":dict({"visualizacoes":vis,"whatsapp":zap,"whatsappPor100Visualizacoes":15.0,"visitantes":int(40*f),"visitas":int(55*f)},**({"pessoasViram":int(30*f),"pessoasWhats":int(9*f)} if st.get("pessoas_reais") else {})),
                "funil":dict({"visitantes":int(40*f),"visualizacoes":vis,"whatsapp":zap,"pedidos":len(st["pedidos"])},**({"pessoasViram":int(30*f),"pessoasWhats":int(9*f)} if st.get("pessoas_reais") else {})),
                "porDia":[{"dia":"2026-10-%02d"%(1+i%10),"visualizacoes":i%7,"whatsapp":i%3,"pedidos":0} for i in range(ndias)],
                "porHora":[{"hora":h,"visualizacoes":(h*3)%11,"whatsapp":h%3} for h in range(24)],
                "porDiaSemana":[{"dia":d,"nome":["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][d],"visualizacoes":d*4,"whatsapp":d} for d in range(7)],
                "porOrigem":[{"chave":"app","nome":"App instalado","visualizacoes":30,"whatsapp":5,"visitantes":10,"taxa":16.7},{"chave":"site","nome":"Navegador","visualizacoes":60,"whatsapp":8,"visitantes":25,"taxa":13.3},{"chave":"nao_informado","nome":"Não informado","visualizacoes":30,"whatsapp":5,"visitantes":0,"taxa":16.7}],
                "porDispositivo":[{"chave":"android","nome":"Android","visualizacoes":70,"whatsapp":10,"visitantes":22,"taxa":14.3},{"chave":"ios","nome":"iPhone / iPad","visualizacoes":20,"whatsapp":3,"visitantes":8,"taxa":15.0}],
                "porFonte":[{"chave":"instagram","nome":"Instagram","visualizacoes":50,"whatsapp":9,"visitantes":18,"taxa":18.0},{"chave":"direto","nome":"Direto (link sem origem, digitado ou app)","visualizacoes":40,"whatsapp":5,"visitantes":12,"taxa":12.5}],
                "porGenero":[{"chave":"Feminino Adulto","nome":"Feminino Adulto","visualizacoes":80,"whatsapp":12,"taxa":15.0}],
                "categorias":[{"nome":"Vestido","visualizacoes":60,"whatsapp":9,"taxa":15.0}],
                "topProdutos":[{"id":"1","codigo":"TK-0007","nome":"Vestido Floral","visualizacoes":40,"whatsapp":8,"taxa":20.0}],
                "pedidos":{"total":len(st["pedidos"]),"valor":sum(x["total"] for x in st["pedidos"]),"porStatus":{},"concluidos":0,"valorConcluidos":0},
                "opcoes":{"categorias":["Blusas","Vestido"],"generos":["Feminino Adulto","Infantil Menina"]},
                "cobertura":{"eventos":100,"comVisitante":70,"desde":"11/10/2026"},"aparelhos":ap}
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
        if conex and a in("statusConexoes","salvarConexao","testarConexoes","renderCriarRegras","renderDeploy","renderStatusDeploy","onesignalConfigurar","abrirCofre","fecharCofre","revelarConexao"):
            if "gerir_acessos" not in perms: return {"ok":False,"semPermissao":True,"erro":"Você não tem permissão para essa ação."}
            C=st["conex"]
            def estado(extra=None):
                r={"ok":True,"conexoes":{k:{"rotulo":k.title(),**v} for k,v in C.items()},"servico":"srv-dasa63fpn0mc73fh8fgg",
                   "enderecos":{"feedCsv":"https://tenkitermodas.com.br/feed.csv","feedXml":"https://tenkitermodas.com.br/feed.xml","sitemap":"https://tenkitermodas.com.br/sitemap.xml"}}
                r.update(extra or {}); return r
            if a in("abrirCofre","fecharCofre","revelarConexao"):
                cf=st.setdefault("cofre",{"codigo":"","chamadas":[],"falhas":0,"valores":{"render":"rnd_FALSO_PARA_TESTE_123456","cloudflare":"cfut_FALSO_PARA_TESTE_123456","onesignal":"os_v2_org_FALSO_PARA_TESTE","onesignalEnvio":"os_v2_app_FALSO_PARA_TESTE","instagram":"IGAA_FALSO_PARA_TESTE_123456"}})
                cf["chamadas"].append({k:v for k,v in b.items() if k!="valor"})
                if a=="abrirCofre":
                    if b.get("senha")!="senha-certa":
                        cf["falhas"]+=1; return {"ok":False,"erro":"Senha incorreta."}
                    cf["codigo"]="abc123COFRE"; return {"ok":True,"cofre":cf["codigo"],"validoSegundos":300}
                if a=="fecharCofre": cf["codigo"]=""; return {"ok":True}
                if not cf["codigo"] or b.get("cofre")!=cf["codigo"]: return {"ok":False,"cofreFechado":True,"erro":"O cofre está trancado. Digite sua senha para abrir."}
                return {"ok":True,"nome":b.get("nome"),"valor":cf["valores"][b.get("nome")]}
            if a=="statusConexoes": return estado()
            if a=="salvarConexao":
                n=b.get("nome")
                if n not in C: return {"ok":False,"erro":"Conexão desconhecida."}
                if b.get("apagar") is True:
                    C[n]={**C[n],"temChave":False,"fim":"","salvaEm":""}
                    if n=="onesignal": C[n]["orgId"]=""
                    st["apagou"]=n; return estado()
                k=str(b.get("chave","")).strip(); st["chave_enviada"]=k; st["org_enviado"]=b.get("orgId")
                if n=="onesignal" and not (str(b.get("orgId") or "").strip() or C[n]["orgId"]): return {"ok":False,"erro":"O Organization ID parece errado: é um código de letras, números e traços. Copie de novo na tela Security do OneSignal."}
                if len(k)<20: return {"ok":False,"erro":"Essa chave parece incompleta ou com caracteres estranhos. Cole de novo, só a chave, sem espaços."}
                if "RECUSADA" in k: return {"ok":False,"erro":"Não guardei a chave: A chave foi recusada (inválida, vencida ou sem permissão)."}
                C[n]={**C[n],"temChave":True,"fim":k[-4:],"salvaEm":"2026-10-10T22:40:00.000Z"}
                if n=="onesignal": C[n]["orgId"]=str(b.get("orgId") or C[n]["orgId"]).strip().lower()
                return estado({"detalhe":'Enxerga o site "tenkiter-catalogo".' if n=="render" else ('Enxerga o app "Tenkitermodas".' if n=="onesignal" else "Chave ativa.")})
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
                if conex5:
                    oc=C["onesignal"]; web=bool(st["pushcfg"]["web"]); env=bool(st["pushcfg"]["chave"])
                    for x in it:
                        if x["id"]=="onesignal": x["acao"]="" if web or not oc["temChave"] else "onesignalConfigurar"
                    it.append({"id":"onesignal-envio","rotulo":"Avisos (chave de envio do app)","ok":env,"detalhe":"A chave de envio funciona." if env else "Falta a chave de envio do app (ONESIGNAL_REST_API_KEY): sem ela o site não consegue mandar avisos.","acao":"" if env or not oc["temChave"] else "onesignalConfigurar"})
                    if not oc["temChave"]: it.append({"id":"onesignal-chave","rotulo":"OneSignal (ligar os avisos pelo painel)","ok":None,"detalhe":"Sem chave guardada. Guarde o Organization ID e a chave abaixo.","acao":"chave:onesignal"})
                    else: it.append({"id":"onesignal-chave","rotulo":"OneSignal (ligar os avisos pelo painel)","ok":True,"detalhe":'Enxerga o app "Tenkitermodas".',"acao":""})
                if not cc: it.append({"id":"cloudflare-chave","rotulo":"Cloudflare (Worker das miniaturas, feed e mapa)","ok":None,"detalhe":"Sem chave guardada. É opcional.","acao":"chave:cloudflare"})
                else: it.append({"id":"worker","rotulo":"Worker tenkiter-og","ok":True,"detalhe":"Publicado em 10/10/2026 22:36.","acao":""})
                return {"ok":True,"itens":it,"quando":"2026-10-10T22:41:00.000Z"}
            if a=="onesignalConfigurar":
                oc=C.get("onesignal")
                if not oc or not oc["temChave"] or not oc["orgId"]: return {"ok":False,"erro":"Guarde primeiro o Organization ID e a chave do OneSignal (em Conexões)."}
                st["ligou"]+=1
                if st.get("liga_falha"): return {"ok":False,"erro":"Não consegui ligar a plataforma Web: O serviço respondeu com erro 400.","passos":[{"id":"app","ok":True,"detalhe":'App "Tenkitermodas" encontrado.'}]}
                novo_envio=not st["pushcfg"]["chave"]; ja_web=st["pushcfg"]["web"]
                st["pushcfg"]["web"]=True; st["pushcfg"]["chave"]=True; oc["chaveEnvio"]=True
                passos=[{"id":"app","ok":True,"detalhe":'App "Tenkitermodas" encontrado.'},
                        {"id":"web","ok":True,"detalhe":"A plataforma Web já estava configurada para https://tenkitermodas.com.br." if ja_web else "Plataforma Web ligada para https://tenkitermodas.com.br."},
                        {"id":"envio","ok":True,"detalhe":"Criei a chave de envio do app e guardei no servidor." if novo_envio else "A chave de envio que já estava no servidor funciona."},
                        {"id":"conferencia","ok":True,"detalhe":"O OneSignal já responde: plataforma Web ligada."}]
                return estado({"passos":passos,"webPronto":True})
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
                    "interesses":[{"chave":"feminino-adulto","rotulo":"Feminino Adulto"},{"chave":"infantil-menina","rotulo":"Infantil Menina"}],"autoNovoPedido":c["novo"],"autoPedido":c["etapa"],
                    **({"contasAtivas":{"total":5,"equipe":1,"alunos":2,"portal":3,"clientes":1},
                        "perfis":[{"nome":"Admin","total":1,"ativos":1},{"nome":"Aluno","total":3,"ativos":2},{"nome":"Cliente","total":2,"ativos":1}],
                        "acessos":[{"chave":"catalogo_push","rotulo":"Enviar avisos","grupo":"Catálogo","total":2,"ativos":1},{"chave":"portal","rotulo":"Portal de treinamento","grupo":"Portal","total":4,"ativos":3}],
                        "interesses":[{"chave":"feminino-adulto","rotulo":"Feminino Adulto","total":4},{"chave":"infantil-menina","rotulo":"Infantil Menina","total":0}],
                        "etapas":{"novo":2,"pronto":1,"concluido":5},
                        "aparelhos":{"ativos":7,"ativosNoApp":3,"instalaram":4,"comConta":5,"desde":"11/10/2026","onesignal":({"inscritos":15,"recebem":11} if st["conex"].get("onesignal",{}).get("temChave") else None)}} if avanc else {})}
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
            if t in("grupo","perfil","acesso"): return {"ok":True,"descricao":"Grupo "+str(au.get("grupo") or au.get("perfis") or au.get("chaves")),"quantidade":2,"porAparelho":False,"amostra":["Bia Aluna","Caio Cliente"],**({"comAviso":1} if avanc else {})}
            if t=="pessoas": return {"ok":True,"descricao":"%d pessoa(s) escolhida(s)"%len(au.get("ids",[])),"quantidade":len(au.get("ids",[])),"porAparelho":False,"amostra":[x["nome"] for x in st["pessoas"] if x["pid"] in au.get("ids",[])]}
            if t=="pedido" and not au.get("codigo"): return {"ok":False,"erro":"Informe o código do pedido."}
            return {"ok":True,"descricao":"Todos que ativaram os avisos" if t=="todos" else str(t),"quantidade":None,"porAparelho":True,"amostra":[],**({"aparelhos":{"todos":7,"app":3,"interesse":4}.get(t)} if avanc else {})}
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
            n=0; faltar=[str(i) for i in st.get("lote_faltar",[])]
            for x in P:
                if str(x["ID"]) in [str(i) for i in b.get("ids",[])] and str(x["ID"]) not in faltar:
                    n+=1
                    if b.get("tipoAcao")=="alterarEstoque": x["Estoque"]=b.get("valor")
                    if b.get("tipoAcao")=="alterarCategoria": x["Categoria"]=b.get("valor")
                    if b.get("tipoAcao")=="arquivar": x["Status"]="Inativo"
            st["lote"]=dict(b); return {"ok":True,"afetados":n,"pedidos":len(b.get("ids",[])),"faltaram":[str(i) for i in b.get("ids",[]) if str(i) in faltar]}
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
            if "action=opcoes" in u: return route.fulfill(json={"ok":True,"tamanhos":list(st["opcoes"]["tamanhos"]),"cores":list(st["opcoes"]["cores"])})
            if "action=categorias" in u: return route.fulfill(json={"ok":True,"categorias":list(st["categorias"])})
            if "action=generos" in u: return route.fulfill(json={"ok":True,"generos":GENS})
            if "action=stats" in u: return route.fulfill(json={"ok":True,"totalVisualizacoes":120,"totalWhatsapp":18,"produtoMaisVistoId":"1790000000003","produtoMaisVistoCodigo":"TK-0003","produtoMaisVistoViews":40})
            if "manuais_lista" in u: return route.fulfill(json={"ok":True,"manuais":[]})
            return route.fulfill(json={"ok":True})
        if "tenkiter-ig." in u:        # Worker do importador do Instagram (simulado): st["ig"]
            g=st["ig"]; h=route.request.headers; m=route.request.method; path=u.split("workers.dev",1)[1].split("?")[0]
            def cont():
                c={"pendente":0,"sem_id":0,"duplicado":0,"nao_produto":0,"descartado":0,"aceito":0}
                for r in g["rasc"]:
                    k=r["grupo"] if r["status"]=="pendente" else r["status"]; c[k]=c.get(k,0)+1
                return c
            g["chamadas"].append({"m":m,"path":path,"whats":h.get("x-tk-whats"),"sessao":h.get("x-tk-sessao"),"corpo":(route.request.post_data if "image/" not in (h.get("content-type") or "") else "<binário>")})
            if m=="OPTIONS": return route.fulfill(status=204,body="")
            if g.get("fora"): return route.fulfill(status=404,json={"ok":False,"erro":"Não encontrado."})
            if not (h.get("x-tk-sessao") or "").startswith("tk"): return route.fulfill(status=401,json={"ok":False,"erro":"Entre na sua conta de administrador."})
            if path=="/cliente/foto" or path.startswith("/fotos"):      # fotos de clientes (Worker v4.7): st["ig"]["fotos"]
                from urllib.parse import urlparse, parse_qs
                g.setdefault("fotos",[]); g.setdefault("foto_chamadas",[]); g.setdefault("foto_seq",50)
                qs=parse_qs(urlparse(u).query); q1=lambda k:(qs.get(k) or [""])[0]
                if path=="/fotos" and m=="GET":
                    stt=q1("status") or "nova"; cs={}
                    for x in g["fotos"]: cs[x["status"]]=cs.get(x["status"],0)+1
                    return route.fulfill(json={"ok":True,"fotos":[x for x in reversed(g["fotos"]) if x["status"]==stt],"contagens":cs})
                if path=="/fotos/acao":
                    fb=json.loads(route.request.post_data or "{}"); g["foto_chamadas"].append({"path":path,"corpo":fb})
                    for x in g["fotos"]:
                        if x["id"] in (fb.get("ids") or []): x["status"]={"usada":"usada","descartar":"descartada","restaurar":"nova"}[fb["acao"]]
                    return route.fulfill(json={"ok":True})
                raw=route.request.post_data_buffer or b""
                g["foto_chamadas"].append({"path":path,"q":dict((k,v[0]) for k,v in qs.items()),"tam":len(raw),"jpeg":raw[:3]==b"\xff\xd8\xff"})
                if path=="/cliente/foto":
                    if g.get("foto_recusa"): return route.fulfill(status=429,json={"ok":False,"erro":g["foto_recusa"]})
                    if q1("aceito")!="1": return route.fulfill(status=400,json={"ok":False,"erro":"Marque que autoriza a loja a usar a foto nos Stories."})
                    g["foto_seq"]+=1; g["fotos"].append({"id":g["foto_seq"],"origem":"cliente","url":"https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/fc%d.jpg"%g["foto_seq"],"whats":"88988887777","nome":"Maria Cliente","instagram":q1("ig").lstrip("@").lower(),"obs":q1("obs"),"status":"nova","vinculo":"conta","criadoPor":"Maria Cliente"})
                    return route.fulfill(json={"ok":True,"id":g["foto_seq"]})
                if path=="/fotos/nova":
                    w=q1("whats"); ig2=q1("ig").lstrip("@").lower()
                    if not w and not ig2: return route.fulfill(status=400,json={"ok":False,"erro":"Informe o WhatsApp ou o Instagram de quem mandou a foto (pelo menos um)."})
                    nome=""; vinc="nenhum"
                    if w=="88977776666": nome="Joana Cadastrada"; vinc="conta"
                    elif ig2:
                        h=next((x for x in g["fotos"] if x["instagram"]==ig2 and (x["whats"] or x["nome"])),None)
                        if h: w=h["whats"]; nome=h["nome"]; vinc="historico"
                    g["foto_seq"]+=1; g["fotos"].append({"id":g["foto_seq"],"origem":"equipe","url":"https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/fe%d.jpg"%g["foto_seq"],"whats":w,"nome":nome,"instagram":ig2,"obs":q1("obs"),"status":"nova","vinculo":vinc,"criadoPor":q1("por")})
                    return route.fulfill(json={"ok":True,"id":g["foto_seq"],"vinculo":vinc,"nome":nome,"whats":w,"instagram":ig2})
            if path=="/posts" or path.startswith("/post"):      # fila de postagens (Worker v4.6): st["ig"]["posts"]
                g.setdefault("posts",[]); g.setdefault("post_chamadas",[]); g.setdefault("post_seq",100)
                if path=="/posts": return route.fulfill(json={"ok":True,"posts":[x for x in g["posts"] if x["status"]!="cancelado"],"contagens":{},"conectado":g["conectado"],"usuario":"tenkitermodasceara"})
                pb=json.loads(route.request.post_data or "{}")
                g["post_chamadas"].append({"path":path,"corpo":pb})
                if path=="/post":
                    if g.get("post_recusa"): return route.fulfill(status=400,json={"ok":False,"erro":g["post_recusa"]})
                    ids=[]; quandos=[]
                    for q in (pb.get("posts") or [pb]):
                        g["post_seq"]+=1; man=q.get("modo")=="manual"; agora=q.get("quando")=="agora"
                        g["posts"].append({"id":g["post_seq"],"tipo":q["tipo"],"modo":q.get("modo","auto"),"legenda":q.get("legenda",""),"midias":q["midias"],"produto":q.get("produto",""),"template":q.get("template",""),"link":q.get("link",""),"agendadoEm":"2026-10-12T15:00:00Z" if not agora else "2026-10-11T12:00:00Z","status":"manual_pendente" if man else ("publicado" if agora and not g.get("post_fica") else "agendado"),"tentativas":0,"erro":"","permalink":"https://www.instagram.com/p/FAKE/" if agora and not man else "","criadoPor":q.get("por","")})
                        ids.append(g["post_seq"]); quandos.append("2026-10-12T15:%02d:00Z"%(len(ids)*2))
                    return route.fulfill(json={"ok":True,"ids":ids,"quandos":quandos})
                x=next((q for q in g["posts"] if q["id"]==pb.get("id")),None)
                if not x: return route.fulfill(status=404,json={"ok":False,"erro":"Postagem não encontrada."})
                if path=="/post/cancelar": x["status"]="cancelado"
                elif path=="/post/reagendar": x["status"]="publicado"; x["erro"]=""
                elif path=="/post/feito": x["status"]="manual_feito"
                return route.fulfill(json={"ok":True})
            body=json.loads(route.request.post_data or "{}") if m=="POST" else {}
            if path=="/status": return route.fulfill(json={"ok":True,"conectado":g["conectado"],"usuario":"tenkitermodasceara","venceEmDias":55,"contagens":cont(),"ultimoCiclo":{"inicio":"2026-10-11T05:00:00Z","fim":"2026-10-11T05:00:02Z","novas":0,"erro":""},"novasDesdeOntem":2,"alertas":g.get("alertas",[]),"ia":{"ligada":g.get("ia_ligada",False),"fim":"abcd","pendentes":sum(1 for r in g["rasc"] if r["status"]=="pendente" and r.get("iaStatus")!="ok") if g.get("ia_ligada") else 0},"historico":{"completo":g.get("hist_completo",False),"emAndamento":g.get("hist_andamento",False)}})
            if path=="/rascunhos":
                gr=(u.split("grupo=")[1].split("&")[0] if "grupo=" in u else "pendente")
                l=[r for r in g["rasc"] if (r["status"]==gr if gr in ("descartado","aceito") else (r["status"]=="pendente" and (r["grupo"] in ("pendente","sem_id") if gr=="pendente" else r["grupo"]==gr)))]
                return route.fulfill(json={"ok":True,"rascunhos":l,"mais":False,"contagens":cont()})
            if path=="/ia":
                if not g.get("ia_ligada"): return route.fulfill(json={"ok":False,"erro":"A IA ainda não foi ligada."})
                feitas=0
                for r in g["rasc"]:
                    if feitas>=2: break
                    if r["status"]=="pendente" and r.get("iaStatus")!="ok":
                        r["iaStatus"]="ok"; r["ia"]={"produto":True,"nome":"Vestido Alfaiataria Premium Vermelho","generos":["Feminino Adulto"],"categorias":["Vestido"],"cores":["Vermelho"],"tamanhos":[],"descricao":"Vestido curto com babado na barra."}
                        r["precoFoto"]="70.00"; r["precoSug"]="77.78"; feitas+=1
                g.setdefault("ia_lotes",[]).append(feitas)
                rest=sum(1 for r in g["rasc"] if r["status"]=="pendente" and r.get("iaStatus")!="ok")
                return route.fulfill(json={"ok":True,"feitas":feitas,"restantes":rest})
            if path=="/ia-chave":
                if m=="DELETE": g["ia_ligada"]=False; return route.fulfill(json={"ok":True})
                if len(body.get("chave",""))<20: return route.fulfill(status=400,json={"ok":False,"erro":"Essa chave parece incompleta ou com caracteres estranhos. Cole de novo, só a chave."})
                g["ia_ligada"]=True; g["ia_chave_recebida"]=body["chave"]; return route.fulfill(json={"ok":True,"fim":body["chave"][-4:]})
            if path=="/token":
                if m=="DELETE": g["conectado"]=False; return route.fulfill(json={"ok":True})
                if len(body.get("token",""))<20: return route.fulfill(status=400,json={"ok":False,"erro":"Esse texto não parece um token do Instagram."})
                g["conectado"]=True; g["token_recebido"]=body["token"]; return route.fulfill(json={"ok":True,"usuario":"tenkitermodasceara"})
            if path=="/buscar":
                if body.get("todos"):
                    g.setdefault("hist_chamadas",[]).append(body); n=len(g["hist_chamadas"])
                    if g.get("hist_erro_na")==n: return route.fulfill(json={"ok":False,"erro":"Instagram: limite de chamadas. Tente em alguns minutos."})
                    fim = n>=g.get("hist_lotes",3)
                    if fim: g["hist_completo"]=True; g["hist_andamento"]=False
                    else: g["hist_andamento"]=True
                    return route.fulfill(json={"ok":True,"novas":4,"puladas":1 if fim else 0,"fim":fim})
                return route.fulfill(json={"ok":True,"novas":1})
            if path=="/acao":
                r=next((x for x in g["rasc"] if x["id"]==body.get("id")),None); a=body.get("acao")
                if not r: return route.fulfill(status=404,json={"ok":False,"erro":"Rascunho não encontrado."})
                if a=="descartar": r["status"]="descartado"
                elif a=="restaurar": r["status"]="pendente"
                elif a=="grupo": r["grupo"]=body["grupo"]; r["status"]="pendente"
                elif a=="juntar":
                    pa=next((x for x in g["rasc"] if x["id"]==body.get("para")),None)
                    if not pa: return route.fulfill(status=400,json={"ok":False,"erro":"Não deu para juntar."})
                    pa["midias"]+=r["midias"]; r["midias"]=[]; r["status"]="descartado"; pa.pop("ia",None); pa["iaStatus"]=""
                    g.setdefault("juntadas",[]).append([r["id"],pa["id"]])
                elif a=="removerMidia":
                    mm=next((x for x in r["midias"] if x["id"]==body.get("midia")),None)
                    if not mm: return route.fulfill(status=400,json={"ok":False,"erro":"Mídia não encontrada."})
                    r["midias"]=[x for x in r["midias"] if x["id"]!=mm["id"]]
                    novo_id=max(x["id"] for x in g["rasc"])+1
                    g["rasc"].append({"id":novo_id,"grupo":"sem_id","status":"pendente","origem":"feed","legenda":"","permalink":"","publicadoEm":"2026-10-01T00:00:00Z","precoSug":"","tamanhosSug":"","midias":[mm],"iaStatus":""})
                    g.setdefault("removidas",[]).append([r["id"],mm["id"]])
                elif a=="lerIA": r["iaStatus"]="ok"; r["ia"]={"produto":True,"nome":"Lido de novo","generos":[],"categorias":[],"cores":[],"tamanhos":[],"descricao":""}
                elif a=="aceitado": r["status"]="aceito"; r["produtoId"]=body.get("produtoId","")
                elif a=="capa":
                    for x in r["midias"]: x["capa"]=(x["id"]==body["midia"])
                elif a=="ordem":
                    ms=r["midias"]; i=[x["id"] for x in ms].index(body["midia"]); j=i+(-1 if body["delta"]<0 else 1)
                    if 0<=j<len(ms): ms[i],ms[j]=ms[j],ms[i]
                return route.fulfill(json={"ok":True,"contagens":cont()})
            return route.fulfill(status=404,json={"ok":False,"erro":"Não encontrado."})
        if "tenkiter-midia" in u:     # Worker de mídia (R2): padrão = recusa rápida (o painel cai no Cloudinary); st["midia"]["modo"]="ok" aceita e guarda o que foi enviado
            m=st["midia"]
            if route.request.method=="POST" and "/u?poster=" in u:
                m.setdefault("posters",[]).append({"chave":u.split("poster=")[1],"tam":len(route.request.post_data_buffer or b""),"ctype":route.request.headers.get("content-type")})
                return route.fulfill(json={"ok":True,"url":"x"})
            if route.request.method=="POST" and u.endswith("/u"):
                m["envios"].append({"tam":len(route.request.post_data_buffer or b""),"whats":route.request.headers.get("x-tk-whats"),"sessao":route.request.headers.get("x-tk-sessao")})
                if m["modo"]=="ok":
                    n=len(m["envios"]); video=(route.request.headers.get("content-type") or "").startswith("video/")
                    return route.fulfill(json={"ok":True,"url":"https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/202610/%020x.%s"%(n,("webm" if "webm" in (route.request.headers.get("content-type") or "") else "mp4") if video else "jpg"),"tipo":"video" if video else "foto"})
                return route.fulfill(status=503,json={"ok":False,"erro":"Armazenamento cheio (teste)." if m["modo"]=="cheio" else "Indisponível (teste)."})
            return route.fulfill(body=PNG,content_type="image/png")
        if "lh3.googleusercontent" in u or "cloudinary" in u: return route.fulfill(body=PNG,content_type="image/png")
        if "connect.facebook.net" in u: return route.fulfill(body="/* fbevents simulado */",content_type="application/javascript")
        if u.startswith("http://localhost") or u.startswith(BASE_LOCAL): return route.continue_()
        if "fonts.g" in u: return route.abort()
        return route.abort()
    ctx.route("**/*",hd)
    return st
SESSION="localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999999999',sessao:'tk2.x.y'}));"
