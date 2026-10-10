import sys, json, re
import os
AQUI=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,AQUI)
os.makedirs(os.path.join(AQUI,'saida'),exist_ok=True)
import mock
from mock import *
from playwright.sync_api import sync_playwright
BASE=os.environ.get("TK_BASE","http://localhost:8765/")
from PIL import Image
Image.new("RGB",(900,1200),(190,60,110)).save(os.path.join(AQUI,"saida","foto1.jpg")); Image.new("RGB",(900,1200),(60,90,190)).save(os.path.join(AQUI,"saida","foto2.jpg"))
open(os.path.join(AQUI,"saida","v.mp4"),"wb").write(b"\x00\x00\x00\x18ftypmp42"+b"\x00"*2000)
OK=[];BAD=[]
def chk(nome,cond,extra=""):
    (OK if cond else BAD).append(nome); print(("  ✔ " if cond else "  ✘ ")+nome+(" — "+str(extra) if extra and not cond else ""))
log=[]; ups=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"]); ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    ctx.add_init_script(SESSION)
    base_install=mock.install
    # instala mock padrão, depois sobrepõe cloudinary e assinatura
    install(ctx,log=log)
    def cl(route):
        u=route.request.url; ups.append(u)
        return route.fulfill(json={"secure_url":"https://res.cloudinary.com/z/%s/upload/v1/up%d.%s"%("video" if "/video/" in u else "image",len(ups),"mp4" if "/video/" in u else "jpg")})
    ctx.route("https://api.cloudinary.com/**",cl)
    orig=ctx.route
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("dialog",lambda d:(print("   [dialog]",d.type,d.message[:80]),d.accept()))
    # assinatura: o handler padrão devolve {ok:true}; precisamos de campos -> intercepta antes
    def assin(route):
        r=route.request
        if r.method=="POST" and '"assinarUploadVideo"' in (r.post_data or ""):
            return route.fulfill(json={"ok":True,"cloudName":"z","apiKey":"k","timestamp":1,"folder":"f","signature":"s"})
        return route.fallback()
    ctx.route("**script.google.com/**",assin)
    print("== Jornada do lojista ==")
    pg.goto(BASE+"admin.html"); pg.wait_for_timeout(1500)
    chk("lista abre com peças ativas", pg.locator("#lista-produtos .produto").count()>=10, pg.locator("#lista-produtos .produto").count())
    pg.click("#card-form > summary"); pg.wait_for_timeout(300)
    chk("passo 7 (vídeo) está visível sem abrir 'Mais detalhes'", pg.locator("#passo-video").is_visible() and pg.locator("#details-mais[open]").count()==0)
    chk("botão de vídeo visível", pg.locator("label[for=video-input]").is_visible())
    # preencher
    pg.set_input_files("#galeria-input",[os.path.join(AQUI,"saida","foto1.jpg"),os.path.join(AQUI,"saida","foto2.jpg")]); pg.wait_for_timeout(1200)
    chk("2 fotos aparecem", pg.locator("#galeria-grid .galeria-item").count()==2)
    pg.set_input_files("#video-input",os.path.join(AQUI,"saida","v.mp4")); pg.wait_for_timeout(500)
    pg.fill("#nome","Vestido Midi Floral"); pg.fill("#preco","129.90"); pg.fill("#estoque","4")
    pg.click("#chips-genero .chip:first-child")
    pg.click("#btn-abrir-categorias"); pg.click("#cat-lista .cat-item:has-text('Vestido')"); pg.click("#cat-pronto")
    pg.get_by_role('button',name='P',exact=True).click() if pg.locator('#chips-tamanhos button').count() else pg.locator('#chips-tamanhos .chip').filter(has_text=__import__('re').compile(r'^P$')).click(); pg.locator('#chips-tamanhos .chip').filter(has_text=__import__('re').compile(r'^M$')).click()
    pg.click("#details-mais > summary"); pg.click("#chips-cores .chip:has-text('Preto')"); pg.fill("#descricao","Viscose, caimento leve."); pg.check("#novidade")
    chk("checklist diz tudo certo", "Tudo certo" in pg.inner_text("#cad-falta"))
    pg.click("#btn-salvar"); pg.wait_for_timeout(3500)
    cr=[x for x in log if x.get("action")=="create"]
    chk("enviou 1 create ao servidor", len(cr)==1, len(cr))
    if cr:
        c=cr[0]
        chk("payload: nome/preço/estoque", (c["nome"],c["preco"],c["estoque"])==("Vestido Midi Floral","129.90","4"), (c["nome"],c["preco"],c["estoque"]))
        chk("payload: categoria e gênero", c["categoria"]=="Vestido" and c["genero"]=="Feminino Adulto", (c["categoria"],c["genero"]))
        chk("payload: tamanhos, cores, descrição", c["tamanhos"]=="P, M" and c["cores"]=="Preto" and c["descricao"].startswith("Viscose"), (c["tamanhos"],c["cores"],c["descricao"]))
        chk("payload: novidade true", c["novidade"] is True)
        chk("payload: capa + galeria + vídeo (URLs do Cloudinary)", c["fotoUrlExistente"].startswith("https://res.cloudinary.com") and c["fotosGaleriaExistentes"].count("http")==1 and c.get("videoUrlExistente","").endswith(".mp4"), {k:c.get(k) for k in("fotoUrlExistente","fotosGaleriaExistentes","videoUrlExistente")})
    chk("3 uploads (2 fotos + 1 vídeo)", len(ups)==3, ups)
    chk("formulário limpo para a próxima", pg.input_value("#nome")=="" and pg.locator("#galeria-grid .galeria-item").count()==0)
    print("== Editar / duplicar / arquivar ==")
    pg.click("#lista-produtos .produto:first-child .btn-editar"); pg.wait_for_timeout(500)
    chk("editar abre form preenchido", pg.input_value("#nome")!="" and "Editando" in pg.inner_text("#cad-sum-txt"))
    pg.fill("#preco","77.50"); pg.click("#btn-salvar"); pg.wait_for_timeout(1500)
    up=[x for x in log if x.get("action")=="update"]
    chk("update enviado com novo preço", len(up)==1 and up[0]["preco"]=="77.50" and up[0].get("id"), up[:1])
    
    pg.click("#lista-produtos .produto:first-child details.mais > summary"); pg.click("#lista-produtos .produto:first-child .btn-arquivar"); pg.wait_for_timeout(1200)
    ar=[x for x in log if x.get("action") in("archive","arquivar","setStatus","status","updateStatus")]
    print("   ações vistas:",sorted({x.get('action') for x in log}))
    print("erros JS:",errs)
    b.close()
print("\nOK=%d  FALHAS=%d"%(len(OK),len(BAD)), BAD)
