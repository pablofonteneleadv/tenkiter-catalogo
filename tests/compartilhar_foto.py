"""Compartilhar a FOTO (ou o vídeo) ESCOLHIDA: o link leva ?f=<n>, o arquivo enviado é aquele, o catálogo abre já nela e a sacola lembra da escolha.
Cobre: janela da peça (setas, miniaturas, endereço), "Compartilhar foto e link" (foto, vídeo da Cloudinary, vídeo do Drive, cancelar, sem
compartilhar nativo), "Pedir no WhatsApp", "Perguntar se volta" (esgotada), abrir por ?c=&f=, números inválidos e a sacola (link e miniatura).
O Apps Script e a internet são SIMULADOS (mock.py)."""
import sys, os, re, json
from urllib.parse import unquote
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))

G = ["https://res.cloudinary.com/z/image/upload/v1/g%d.jpg" % i for i in (1, 2, 3)]
VIDEO = "https://res.cloudinary.com/z/video/upload/v1/tenkiter-catalogo/v1.mp4"
DRIVE = "https://drive.google.com/file/d/AbC_123-x/preview"
MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 64

STUB = """
window.__shares=[]; window.__opened=[]; window.__modoShare='ok';
window.open=(u)=>{window.__opened.push(String(u));return null};
Object.defineProperty(navigator,'canShare',{value:(d)=>!!d,configurable:true});
Object.defineProperty(navigator,'share',{value:async(d)=>{
  if(window.__modoShare==='cancelar'){const e=new Error('cancelado');e.name='AbortError';throw e}
  if(window.__modoShare==='erro'){const e=new Error('não permitido');e.name='NotAllowedError';throw e}
  window.__shares.push({files:(d.files||[]).map(f=>({name:f.name,type:f.type,size:f.size})),text:d.text||''});
},configurable:true,writable:true});
"""

def nova_pagina(b, ctx_extra=None, drive=False, esgotada=False, nativo=True):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    st = install(ctx)
    P = st["produtos"][0]            # TK-0001
    P["Fotos_Galeria"] = ",".join(G); P["Video_URL"] = DRIVE if drive else VIDEO; P["Estoque"] = 0 if esgotada else 5
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    buscas = []
    pg.on("request", lambda r: buscas.append((r.resource_type, r.url)))
    pg.route("**/video/upload/**", lambda route: route.fulfill(body=MP4, content_type="video/mp4;codecs=avc1", headers={"Access-Control-Allow-Origin": "*"}))
    pg.add_init_script(STUB if nativo else STUB + "\ndelete navigator.share; Object.defineProperty(navigator,'share',{value:undefined,configurable:true});")
    pg.on("dialog", lambda d: d.accept())
    return ctx, pg, erros, buscas

def abrir(pg, query="?c=TK-0001"):
    pg.goto(BASE + "index.html" + query); pg.wait_for_timeout(1600)

def contador(pg): return (pg.locator("#contador-slide").text_content() or "").strip()
def url_ok(pg, f):
    q = re.search(r"[?&]f=(\d+)", pg.url); c = re.search(r"[?&]c=TK-0001(&|$)", pg.url)
    return (q and int(q.group(1)) == f if f else not q) and c is not None

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    print("== Janela da peça: o endereço e os botões acompanham a foto na tela ==")
    ctx, pg, erros, buscas = nova_pagina(b); abrir(pg)
    chk("abre na capa: contador 1 / 5 (capa + 3 da galeria + vídeo)", contador(pg) == "1 / 5", contador(pg))
    chk("na capa o endereço não tem ?f", url_ok(pg, 0), pg.url)
    pg.click('.thumb-item[data-idx="2"]'); pg.wait_for_timeout(400)
    chk("toque na 3ª miniatura: contador 3 / 5", contador(pg) == "3 / 5", contador(pg))
    chk("endereço virou ?c=TK-0001&f=3 (copiar o endereço do navegador também leva a essa foto)", url_ok(pg, 3), pg.url)
    voltas_antes = pg.evaluate("history.length")
    pg.click("#seta-dir"); pg.wait_for_timeout(300)
    chk("seta direita: 4 / 5 e ?f=4", contador(pg) == "4 / 5" and url_ok(pg, 4), (contador(pg), pg.url))
    chk("trocar de foto NÃO empilha histórico (o botão voltar continua fechando a janela)", pg.evaluate("history.length") == voltas_antes)
    pg.click("#seta-esq"); pg.wait_for_timeout(300)

    print("== 'Compartilhar foto e link' manda a foto que está na tela ==")
    buscas.clear()
    pg.click("#btn-anexar-foto"); pg.wait_for_timeout(900)
    sh = pg.evaluate("window.__shares")
    chk("compartilhou uma vez", len(sh) == 1, sh)
    if sh:
        chk("o arquivo é uma imagem (.jpg)", sh[0]["files"] and sh[0]["files"][0]["name"].endswith(".jpg") and sh[0]["files"][0]["type"].startswith("image/"), sh[0]["files"])
        chk("o texto leva o link /p/TK-0001?f=3 (o link abre na mesma foto e a miniatura é ela)", "https://tenkitermodas.com.br/p/TK-0001?f=3" in sh[0]["text"], sh[0]["text"])
    baixou = [u for t, u in buscas if t == "fetch" and u == G[1]]
    chk("baixou a 3ª foto (a selecionada), não a capa", len(baixou) == 1, [u for t, u in buscas if t == "fetch"])
    chk("o botão voltou ao normal depois", "Compartilhar foto e link" in (pg.locator("#btn-anexar-foto").text_content() or "") and pg.locator("#btn-anexar-foto").is_enabled())

    print("== 'Pedir no WhatsApp' leva a mesma foto ==")
    pg.evaluate("window.__opened=[]")
    pg.click("#btn-quero"); pg.wait_for_timeout(400)
    op = [unquote(o) for o in pg.evaluate("window.__opened")]
    chk("mensagem do pedido tem /p/TK-0001?f=3", any("https://tenkitermodas.com.br/p/TK-0001?f=3" in o for o in op), op)
    chk("e continua indo para o WhatsApp da loja", any("wa.me/5588993223998" in o for o in op), op)

    print("== O vídeo (último item) ==")
    pg.click('.thumb-item[data-idx="4"]'); pg.wait_for_timeout(500)
    chk("5 / 5 e ?f=5", contador(pg) == "5 / 5" and url_ok(pg, 5), (contador(pg), pg.url))
    chk("o vídeo aparece na janela", pg.locator("#slide-area video").count() == 1)
    buscas.clear(); pg.evaluate("window.__shares=[]")
    pg.click("#btn-anexar-foto"); pg.wait_for_timeout(1000)
    sh = pg.evaluate("window.__shares")
    chk("manda o VÍDEO como arquivo (.mp4, tipo video/mp4 sem o complemento do codec)", sh and sh[0]["files"] and sh[0]["files"][0]["name"].endswith(".mp4") and sh[0]["files"][0]["type"] == "video/mp4", sh)
    chk("texto marca (vídeo) e o link leva ao vídeo (?f=5)", sh and "(vídeo)" in sh[0]["text"] and "/p/TK-0001?f=5" in sh[0]["text"], sh)
    chk("baixou o arquivo do vídeo", any(t == "fetch" and u == VIDEO for t, u in buscas))
    pg.click('.thumb-item[data-idx="0"]'); pg.wait_for_timeout(400)
    chk("voltar para a capa tira o ?f do endereço", url_ok(pg, 0), pg.url)
    pg.evaluate("window.__shares=[]"); pg.click("#btn-anexar-foto"); pg.wait_for_timeout(800)
    sh = pg.evaluate("window.__shares")
    chk("na capa o link é o de sempre (/p/TK-0001, sem ?f)", sh and "/p/TK-0001\n" in sh[0]["text"] and "?f=" not in sh[0]["text"], sh)
    print("   erros JS:", erros)
    chk("sem erro de JavaScript", not erros, erros)
    ctx.close()

    print("== Compartilhar: cancelar, sem recurso nativo, erro ==")
    ctx, pg, erros, _ = nova_pagina(b); abrir(pg)
    pg.click('.thumb-item[data-idx="1"]'); pg.wait_for_timeout(300)
    pg.evaluate("window.__modoShare='cancelar'; window.__opened=[]")
    pg.click("#btn-anexar-foto"); pg.wait_for_timeout(700)
    chk("a pessoa fecha a janela de compartilhar: não abre mais nada (antes abria o WhatsApp da loja)", pg.evaluate("window.__opened.length") == 0, pg.evaluate("window.__opened"))
    pg.evaluate("window.__modoShare='erro'")
    pg.click("#btn-anexar-foto"); pg.wait_for_timeout(700)
    op = [unquote(o) for o in pg.evaluate("window.__opened")]
    chk("se o compartilhar nativo falha, abre o WhatsApp para ESCOLHER o contato, com o link da foto", len(op) == 1 and op[0].startswith("https://wa.me/?text=") and "/p/TK-0001?f=2" in op[0], op)
    ctx.close()
    ctx, pg, erros, _ = nova_pagina(b, nativo=False); abrir(pg)
    pg.click('.thumb-item[data-idx="3"]'); pg.wait_for_timeout(300)
    pg.evaluate("window.__opened=[]"); pg.click("#btn-anexar-foto"); pg.wait_for_timeout(700)
    op = [unquote(o) for o in pg.evaluate("window.__opened")]
    chk("computador (sem compartilhar nativo): abre o WhatsApp para escolher o contato, com o link da foto", len(op) == 1 and op[0].startswith("https://wa.me/?text=") and "/p/TK-0001?f=4" in op[0], op)
    ctx.close()

    print("== Vídeo do Drive: não dá para baixar -> vai o link (a miniatura vem do Worker) ==")
    ctx, pg, erros, _ = nova_pagina(b, drive=True); abrir(pg)
    pg.click('.thumb-item[data-idx="4"]'); pg.wait_for_timeout(500)
    chk("o vídeo do Drive aparece (iframe)", pg.locator("#slide-area iframe").count() == 1)
    pg.evaluate("window.__shares=[]"); pg.click("#btn-anexar-foto"); pg.wait_for_timeout(800)
    sh = pg.evaluate("window.__shares")
    chk("compartilha só o texto com o link ?f=5 (sem arquivo)", sh and not sh[0]["files"] and "/p/TK-0001?f=5" in sh[0]["text"], sh)
    ctx.close()

    print("== Abrir por link ?c=&f= ==")
    for f, esperado, rotulo in ((3, "3 / 5", "?f=3 abre na 3ª foto"), (5, "5 / 5", "?f=5 abre no vídeo"), (1, "1 / 5", "?f=1 é a capa"), (9, "1 / 5", "?f=9 (não existe) cai na capa"), ("abc", "1 / 5", "?f=abc cai na capa"), (0, "1 / 5", "?f=0 cai na capa")):
        ctx, pg, erros, _ = nova_pagina(b); abrir(pg, "?c=TK-0001&f=%s" % f)
        chk(rotulo, pg.locator("#foto-principal-modal, #slide-area video").count() >= 1 and contador(pg) == esperado, (contador(pg), pg.url))
        if f == 3:
            src = pg.evaluate("document.querySelector('#foto-principal-modal').src")
            chk("a foto que aparece é a 3ª (g2.jpg)", src == G[1], src)
            chk("a miniatura 3 está marcada como a ativa", pg.evaluate("document.querySelector('.thumb-item.ativa').dataset.idx") == "2")
            pg.click("#btn-quero"); pg.wait_for_timeout(300)
            op = [unquote(o) for o in pg.evaluate("window.__opened")]
            chk("pedir logo depois de abrir pelo link já leva ?f=3", any("/p/TK-0001?f=3" in o for o in op), op)
        chk("sem erro de JavaScript (%s)" % f, not erros, erros)
        ctx.close()
    ctx, pg, erros, _ = nova_pagina(b); abrir(pg, "?id=1790000000001&f=2")
    chk("link antigo por ?id= também aceita ?f=", contador(pg) == "2 / 5", contador(pg))
    ctx.close()

    print("== Peça esgotada: 'Perguntar se volta' ==")
    ctx, pg, erros, _ = nova_pagina(b, esgotada=True); abrir(pg)
    pg.click('.thumb-item[data-idx="1"]'); pg.wait_for_timeout(300)
    pg.evaluate("window.__opened=[]"); pg.click("#btn-perguntar"); pg.wait_for_timeout(300)
    op = [unquote(o) for o in pg.evaluate("window.__opened")]
    chk("o link da pergunta leva à foto que a pessoa estava vendo", any("/p/TK-0001?f=2" in o for o in op), op)
    ctx.close()

    print("== Cartão da lista: sem janela aberta, vale a capa ==")
    ctx, pg, erros, _ = nova_pagina(b); abrir(pg, "")
    pg.evaluate("window.__opened=[]"); pg.locator('.card[data-id="1790000000001"] .ac-pedir').click(); pg.wait_for_timeout(300)
    op = [unquote(o) for o in pg.evaluate("window.__opened")]
    chk("'Pedir' no cartão usa o link da capa (sem ?f)", any("/p/TK-0001" in o and "?f=" not in o for o in op), op)
    ctx.close()

    print("== Sacola lembra a foto escolhida ==")
    ctx, pg, erros, _ = nova_pagina(b); abrir(pg)
    pg.click('.thumb-item[data-idx="2"]'); pg.wait_for_timeout(300)
    pg.click("#btn-sacola-modal"); pg.wait_for_timeout(300)
    chk("guardou a foto 3 para a peça na sacola", pg.evaluate("JSON.parse(localStorage.getItem('tenkiter_sacola_foto_v1')||'{}')['1790000000001']") == 3)
    pg.click("#btn-fechar-modal"); pg.wait_for_timeout(500)
    pg.evaluate("abrirSacola()"); pg.wait_for_timeout(600)
    img = pg.evaluate("document.querySelector('.item-sacola img').getAttribute('src')")
    chk("a miniatura da sacola é a 3ª foto (não a capa)", "g2.jpg" in img, img)
    pg.fill("#ped-nome", "Maria Teste"); pg.fill("#ped-whats", "88999990000"); pg.evaluate("window.__opened=[]")
    pg.click("#btn-enviar-sacola"); pg.wait_for_timeout(1200)
    op = [unquote(o) for o in pg.evaluate("window.__opened")]
    chk("a mensagem do pedido leva o link da peça NA FOTO escolhida", any("/p/TK-0001?f=3" in o for o in op), op)
    chk("sem erro de JavaScript", not erros, erros)
    pg.evaluate("limparSacola()")
    chk("esvaziar a sacola apaga a foto guardada", pg.evaluate("localStorage.getItem('tenkiter_sacola_foto_v1')") in ("{}", None))
    ctx.close()
    ctx, pg, erros, _ = nova_pagina(b); abrir(pg, "")
    pg.locator('.card[data-id="1790000000001"] .ac-sacola').click(); pg.wait_for_timeout(300)
    chk("sacola pelo cartão da lista não guarda foto (vale a capa)", pg.evaluate("JSON.parse(localStorage.getItem('tenkiter_sacola_foto_v1')||'{}')['1790000000001']") is None)
    ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD)
sys.exit(1 if BAD else 0)
