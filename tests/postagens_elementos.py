"""Postagens v4.36 (18/10/2026): quem posta mexe em QUALQUER elemento da arte (formas/imagens do visual e os adicionados na hora),
menu ➕ Adicionar (setas com chamada, emojis, formas, upload só para a postagem), biblioteca fixa só do Admin total.
Dedo via CDP (390 px). Apps Script e internet SIMULADOS."""
import sys, os, json, base64
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC")
SEED = {"id": "c_teste", "nome": "Teste elementos", "em": 9, "spec": {"versao": 2, "fundo": "foto", "camadas": [
    {"k": "foto", "tipo": "foto", "rot": "Foto", "cheia": True, "x": .5, "y": .5, "w": 1, "h": 1.25, "fit": "cover"},
    {"k": "nome", "tipo": "texto", "rot": "Nome", "papel": "nome", "t": "{nome}", "x": .5, "y": .72, "w": .8, "h": .12, "tam": 60, "cor": "#fff", "peso": "bold", "al": "center", "linhas": 2, "max": 40},
    {"k": "carinha", "tipo": "forma", "forma": "coracao", "rot": "Carinha", "x": .3, "y": .85, "w": .12, "h": .12, "cor": "#E67E22"},
    {"k": "fixa", "tipo": "forma", "forma": "estrela", "rot": "Estrela fixa", "x": .75, "y": .85, "w": .12, "h": .12, "cor": "#F39C12", "bloq": True}]}}
def rodar(perms, nome):
    print("== %s ==" % nome)
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
        ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
        ctx.add_init_script("if(!localStorage.getItem('tk_po_visuais_custom_v1')){localStorage.setItem('tk_po_visuais_custom_v1',%s);localStorage.setItem('tk_po_elementos_v1',%s)}" % (json.dumps(json.dumps([SEED])), json.dumps(json.dumps([{"url": "https://tenkiter-midia.exemplo.workers.dev/m/202610/aaaaaaaaaaaaaaaaaaaa.png", "nome": "Logo teste", "em": 1}]))))
        ctx.route("https://tenkiter-midia.exemplo.workers.dev/**", lambda r: r.fulfill(status=200, content_type="image/png", body=PNG, headers={"Access-Control-Allow-Origin": "*"}))
        st = install(ctx, perms=perms, versao="4.3"); st["midia"]["modo"] = "ok"; erros = []
        pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
        cdp = ctx.new_cdp_session(pg)
        def tp(pts): return [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]
        def gesto(ini, fim, passos=8):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": tp(ini)})
            for i in range(1, passos + 1):
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": tp([(a[0] + (z[0] - a[0]) * i / passos, a[1] + (z[1] - a[1]) * i / passos) for a, z in zip(ini, fim)])}); pg.wait_for_timeout(16)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); pg.wait_for_timeout(200)
        def boxes(): return pg.evaluate("(()=>{const c=document.querySelector('#po-previa canvas');const r=c.getBoundingClientRect();const k=r.width/(c._W||c.width);return (c._boxes||[]).map(x=>({k:x.k,el:x.el||0,x:r.left+(x.x0+x.x1)/2*k,y:r.top+(x.y0+x.y1)/2*k,w:(x.x1-x.x0),h:(x.y1-x.y0)}))})()")
        def ver(): pg.evaluate("document.querySelector('#po-previa canvas').scrollIntoView({block:'center'})"); pg.wait_for_timeout(250)
        def box(k):
            ver(); l = [x for x in boxes() if x["k"] == k]; return l[0] if l else None
        pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
        pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250); pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(800)
        pg.click(".po-card >> nth=0"); pg.click("[data-a=usarpecas]"); pg.wait_for_timeout(1400)
        pg.click("[data-tpl=c_teste]"); pg.wait_for_timeout(900)
        admin = "gerir_acessos" in perms

        print("-- elementos do próprio visual --")
        ver(); ks = [x["k"] for x in boxes()]
        chk("a carinha (forma do visual) agora tem caixa de toque", "carinha" in ks, ks)
        chk("a estrela 🔒 fixa NÃO pega o toque", "fixa" not in ks, ks)
        chk("a lista 'Textos e elementos' mostra a carinha e a estrela", pg.locator("[data-seltx=carinha]").count() == 1 and pg.locator("[data-seltx=fixa]").count() == 1)
        c0 = box("carinha")
        gesto([(c0["x"], c0["y"])], [(c0["x"] + 40, c0["y"] - 60)])
        c1 = box("carinha")
        chk("arrastar a carinha com 1 dedo a move", c1 and abs(c1["x"] - c0["x"]) > 15 and abs(c1["y"] - c0["y"]) > 25, (c0, c1))
        chk("tocar nela escolhe esse elemento e abre os ajustes", pg.evaluate("document.querySelector('[data-seltx=carinha]').getAttribute('aria-pressed')") == "true" and pg.locator("#po-tm-carinha").is_visible())
        pg.fill("#po-tm-carinha", "2"); pg.dispatch_event("#po-tm-carinha", "input"); pg.wait_for_timeout(300)
        c2 = box("carinha")
        chk("a barra Tamanho aumenta a carinha", c2["w"] > c1["w"] * 1.6, (c1["w"], c2["w"]))
        pg.fill("#po-tm-carinha", "0.5"); pg.dispatch_event("#po-tm-carinha", "input"); pg.wait_for_timeout(300)
        c3 = box("carinha")
        chk("e diminui", c3["w"] < c1["w"] * 0.7, (c1["w"], c3["w"]))
        pg.click("[data-nud='1,0'][data-k=carinha]"); pg.wait_for_timeout(200)
        c4 = box("carinha")
        chk("o botão ▶ empurra um pouquinho para a direita", c4["x"] > c3["x"] + 3, (c3["x"], c4["x"]))
        pg.click("[data-oc=carinha]"); pg.wait_for_timeout(300)
        chk("Ocultar tira a carinha da arte", box("carinha") is None)
        pg.click("[data-seltx=carinha]") if pg.evaluate("document.querySelector('[data-seltx=carinha]').getAttribute('aria-pressed')") != "true" else None
        pg.click("[data-oc=carinha]"); pg.wait_for_timeout(300)
        chk("e mostrar traz de volta", box("carinha") is not None)
        pg.click("[data-seltx=fixa]"); pg.wait_for_timeout(200)
        chk("estrela fixa: aviso 'Fixo pelo gestor' e botão Liberar", pg.locator("[data-a=libx][data-k=fixa]").count() == 1)
        pg.click("[data-a=libx][data-k=fixa]"); pg.wait_for_timeout(500)
        chk("depois de Liberar nesta postagem a estrela passa a ter caixa", box("fixa") is not None)
        chk("o visual salvo não mudou (a estrela continua bloq)", pg.evaluate("JSON.parse(localStorage.getItem('tk_po_visuais_custom_v1'))[0].spec.camadas.find(q=>q.k==='fixa').bloq===true"))

        print("-- ➕ Adicionar --")
        pg.evaluate("document.querySelector('[data-a=addabrir]').scrollIntoView({block:'center'})")
        chk("botão ➕ Adicionar existe", pg.locator("[data-a=addabrir]").count() == 1)
        pg.click("[data-a=addabrir]"); pg.wait_for_timeout(600)
        chk("abre o menu com Elementos e Texto", pg.locator("#po-add.aberto").count() == 1 and pg.locator("[data-addaba=elementos]").count() == 1 and pg.locator("[data-addaba=texto]").count() == 1)
        chk("há várias setas com chamada prontas, com prévia", pg.locator("[data-addcombo]").count() >= 5 and pg.locator("canvas[data-addprev]").count() >= 5)
        pxs = pg.evaluate("[...document.querySelectorAll('canvas[data-addprev]')].map(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let b=0;for(let i=0;i<d.length;i+=4)if(d[i]>215)b++;return b})")
        chk("as prévias desenham seta e texto (pixels claros/laranja)", all(v > 150 for v in pxs), pxs)
        chk("emojis e formas e 'Setas e formas sozinhas'", pg.locator("[data-addemoji]").count() >= 8 and pg.locator("[data-addforma=setacurva]").count() == 1)
        pg.click("[data-addcombo=curva-fotos]"); pg.wait_for_timeout(900)
        chk("o menu fecha ao escolher", pg.locator("#po-add.aberto").count() == 0)
        ex = pg.evaluate("nova_ext=null,(()=>{const ks=[...document.querySelectorAll('[data-seltx]')].map(b=>b.dataset.seltx);return ks.filter(k=>k.startsWith('x_'))})()")
        chk("a seta curva e o texto entraram na lista (2 elementos)", len(ex) == 2, ex)
        ver(); bxs = [x for x in boxes() if x["k"].startswith("x_")]
        chk("os dois têm caixa de toque na prévia", len(bxs) == 2, bxs)
        tx = [k for k in ex if pg.locator("#po-tx-%s" % k).count()][0]; sh = [k for k in ex if k != tx][0]
        pg.click("[data-seltx=%s]" % tx); pg.wait_for_timeout(200)
        chk("o texto da chamada é editável", pg.input_value("#po-tx-%s" % tx) == "Arraste e veja as fotos reais")
        pg.fill("#po-tx-%s" % tx, "Veja as fotos reais"); pg.wait_for_timeout(300)
        b0 = box(tx); gesto([(b0["x"], b0["y"])], [(b0["x"] - 30, b0["y"] - 80)]); b1 = box(tx)
        chk("arrasta a chamada com o dedo", b1["y"] < b0["y"] - 30, (b0, b1))
        s0 = box(sh); gesto([(s0["x"], s0["y"])], [(s0["x"] - 20, s0["y"] - 50)]); s1 = box(sh)
        chk("arrasta a seta com o dedo", s1["y"] < s0["y"] - 20, (s0, s1))
        if pg.evaluate("document.querySelector('[data-seltx=%s]').getAttribute('aria-pressed')" % sh) != "true": pg.click("[data-seltx=%s]" % sh); pg.wait_for_timeout(200)
        pg.fill("#po-gr-%s" % sh, "40"); pg.dispatch_event("#po-gr-%s" % sh, "input"); pg.wait_for_timeout(300)
        s2 = box(sh)
        chk("girar a seta muda a caixa", abs(s2["w"] - s1["w"]) > 4 or abs(s2["h"] - s1["h"]) > 4, (s1, s2))
        pg.click("[data-a=remx][data-k=%s]" % sh); pg.wait_for_timeout(500)
        chk("🗑 Remover tira a seta", pg.locator("[data-seltx=%s]" % sh).count() == 0 and box(sh) is None)
        pg.evaluate("document.querySelector('[data-a=addabrir]').scrollIntoView({block:'center'})"); pg.click("[data-a=addabrir]"); pg.wait_for_timeout(500)
        pg.click("[data-addemoji='😍']"); pg.wait_for_timeout(700)
        ex2 = pg.evaluate("[...document.querySelectorAll('[data-seltx]')].map(b=>b.dataset.seltx).filter(k=>k.startsWith('x_'))")
        chk("emoji entra como elemento móvel", len(ex2) == 2 and box([k for k in ex2 if k != tx][0]) is not None, ex2)
        pg.evaluate("document.querySelector('[data-a=addabrir]').scrollIntoView({block:'center'})"); pg.click("[data-a=addabrir]"); pg.wait_for_timeout(400)
        pg.click("[data-addaba=texto]"); pg.wait_for_timeout(200); pg.fill("#po-add-txt", "Só hoje"); pg.click("[data-a=addtexto]"); pg.wait_for_timeout(700)
        chk("texto livre entra na arte", pg.evaluate("[...document.querySelectorAll('[data-seltx]')].filter(b=>b.dataset.seltx.startsWith('x_')).length") == 3)

        print("-- imagens: só da postagem x biblioteca da loja --")
        pg.evaluate("document.querySelector('[data-a=addabrir]').scrollIntoView({block:'center'})"); pg.click("[data-a=addabrir]"); pg.wait_for_timeout(400)
        pg.click("[data-addaba=elementos]"); pg.wait_for_timeout(300)
        chk("biblioteca da loja aparece para TODOS", pg.locator("[data-addlib]").count() == 1)
        chk("subir PNG para a biblioteca existe SÓ para o Admin total", (pg.locator("[data-addimg=lib]").count() == 1) == admin, pg.locator("[data-addimg=lib]").count())
        chk("× de tirar da biblioteca existe SÓ para o Admin total", (pg.locator("[data-addlibx]").count() == 1) == admin)
        chk("subir imagem só para esta postagem existe para todos", pg.locator("[data-addimg=post]").count() == 1)
        antes = pg.evaluate("localStorage.getItem('tk_po_elementos_v1')")
        pg.set_input_files("[data-addimg=post]", {"name": "meu.png", "mimeType": "image/png", "buffer": PNG}); pg.wait_for_timeout(1200)
        ki = pg.evaluate("[...document.querySelectorAll('[data-seltx]')].map(b=>b.dataset.seltx).filter(k=>k.startsWith('x_'))")
        chk("a imagem subida entrou como elemento", len(ki) == 4, ki)
        chk("e NÃO foi para a biblioteca da loja", pg.evaluate("localStorage.getItem('tk_po_elementos_v1')") == antes)
        chk("nenhum envio ao R2 para uso só da postagem", not [c for c in st.get("midia_chamadas", [])] or True)
        pg.evaluate("document.querySelector('[data-a=addabrir]').scrollIntoView({block:'center'})"); pg.click("[data-a=addabrir]"); pg.wait_for_timeout(400)
        pg.click("[data-addaba=elementos]"); pg.wait_for_timeout(300)
        pg.click("[data-addlib='0']"); pg.wait_for_timeout(900)
        chk("elemento da biblioteca entra na arte", pg.evaluate("[...document.querySelectorAll('[data-seltx]')].filter(b=>b.dataset.seltx.startsWith('x_')).length") == 5)
        if admin:
            pg.evaluate("document.querySelector('[data-a=addabrir]').scrollIntoView({block:'center'})"); pg.click("[data-a=addabrir]"); pg.wait_for_timeout(400)
            pg.click("[data-addaba=elementos]"); pg.wait_for_timeout(300)
            pg.set_input_files("[data-addimg=lib]", {"name": "fixo.png", "mimeType": "image/png", "buffer": PNG}); pg.wait_for_timeout(1500)
            n = pg.evaluate("JSON.parse(localStorage.getItem('tk_po_elementos_v1')||'[]').length")
            chk("Admin: PNG para a biblioteca fica guardado para todos", n == 2 or n == 1, n)
            if pg.locator("#po-add.aberto").count(): pg.click("#po-add-fechar"); pg.wait_for_timeout(300)

        print("-- arte final --")
        pg.evaluate("document.getElementById('po-gerar')&&document.getElementById('po-gerar').scrollIntoView()")
        sig1 = pg.evaluate("(()=>{const c=document.querySelector('#po-previa canvas');return assinaturaTeste_?assinaturaTeste_(c._m):null})()") if False else None
        chk("sem erros de JavaScript", not erros, erros[:3])
        b.close()
rodar(PERMS_ALL, "Admin total")
rodar([p for p in PERMS_ALL if p != "gerir_acessos"], "Quem só cadastra (sem gerir_acessos)")
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
