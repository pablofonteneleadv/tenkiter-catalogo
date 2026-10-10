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
def install(ctx, perms=PERMS_ALL, log=None, delay=0):
    P=prods()
    def hd(route):
        r=route.request;u=r.url
        if "script.google.com" in u:
            if r.method=="POST":
                b=json.loads(r.post_data or "{}"); a=b.get("action")
                if log is not None: log.append(b)
                if a=="sessao" or a=="login": return route.fulfill(json={"ok":True,"sessao":"tk2.x.y","usuario":{"whatsapp":"88999999999","name":"Ana Lojista","nome":"Ana Lojista","level":3,"permissoes":perms,"perfil":"Admin"}})
                if a=="curriculos_listar": return route.fulfill(json={"ok":True,"curriculos":[],"status":["Novo","Entrevista"],"motivos":[]})
                if a=="create": return route.fulfill(json={"ok":True,"id":"999","codigo":"TK-0099"})
                return route.fulfill(json={"ok":True,"itens":[],"funcionarios":[],"avaliacoes":[],"lista":[],"cadastrados":[]})
            if "action=versao" in u: return route.fulfill(json={"ok":True,"versao":"3.0","acessos":True,"pinAtivo":False})
            if "action=list" in u: return route.fulfill(json={"ok":True,"produtos":P if "todos=true" in u else [x for x in P if x["Status"]=="Ativo"]})
            if "action=categorias" in u: return route.fulfill(json={"ok":True,"categorias":CATS})
            if "action=generos" in u: return route.fulfill(json={"ok":True,"generos":GENS})
            if "action=stats" in u: return route.fulfill(json={"ok":True,"totalVisualizacoes":120,"totalWhatsapp":18,"produtoMaisVistoId":"1790000000003","produtoMaisVistoCodigo":"TK-0003","produtoMaisVistoViews":40})
            if "manuais_lista" in u: return route.fulfill(json={"ok":True,"manuais":[]})
            return route.fulfill(json={"ok":True})
        if "lh3.googleusercontent" in u or "cloudinary" in u: return route.fulfill(body=PNG,content_type="image/png")
        if u.startswith("http://localhost") or u.startswith(BASE_LOCAL): return route.continue_()
        if "fonts.g" in u: return route.abort()
        return route.abort()
    ctx.route("**/*",hd)
SESSION="localStorage.setItem('tm_session', JSON.stringify({whatsapp:'88999999999',sessao:'tk2.x.y'}));"
