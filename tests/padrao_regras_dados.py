"""v7.57 — Regras e dados iguais em todas as telas (padrao-dados.js e correções do lote 1). Serviços SIMULADOS (mock.py); nada toca na planilha.
Cobre: filtro de preço da vitrine (à vista) e preço do Google (tabela); "R$ 89,90" na Disponibilidade; "Enviar para modelo IA" com a mesma permissão do cartão;
"Mais recentes" da Gestão com foto nova; foto do cliente (erro cru, chave guardada no aparelho); pedir fotos (chave guardada); funções únicas (erro, telefone, fotos, data/hora de Fortaleza);
travas estáticas (nenhuma tela monta à mão o que já tem função única).   TK_BASE=http://localhost:8765/ python3 tests/padrao_regras_dados.py"""
import sys, os, re, io, glob, json
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(AQUI); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
from PIL import Image
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + (" — " + str(e)[:300] if e and not c else ""))
def ler(f): return open(os.path.join(RAIZ, f), encoding="utf-8").read()

print("== Travas estáticas: um lugar só para cada regra ==")
paginas_com_padrao = [f for f in glob.glob(os.path.join(RAIZ, "*.html")) if "TKPadrao" in open(f, encoding="utf-8").read() or any(j in open(f, encoding="utf-8").read() for j in ("foto-cliente.js", "pedir-fotos.js", "admin-postagens.js"))]
for f in sorted(paginas_com_padrao):
    chk("carrega padrao-dados.js: " + os.path.basename(f), "padrao-dados.js" in open(f, encoding="utf-8").read())
js_usam = [os.path.basename(f) for f in glob.glob(os.path.join(RAIZ, "*.js")) if "TKPadrao" in open(f, encoding="utf-8").read() and not f.endswith("padrao-dados.js")]
for j in js_usam:
    donos = [os.path.basename(h) for h in glob.glob(os.path.join(RAIZ, "*.html")) if j in open(h, encoding="utf-8").read()]
    chk("quem carrega %s também carrega padrao-dados.js" % j, all("padrao-dados.js" in ler(h) for h in donos), donos)
chk("padrao-dados.js está na lista pública e no cache offline", '"padrao-dados.js"' in ler("scripts/deploy/public-files.json") and "/padrao-dados.js" in ler("OneSignalSDKWorker.js"))
chk("padrao-dados.js não depende do common.js para carregar (pode ser usado sozinho)", "typeof formatarTelefone" in ler("padrao-dados.js") and "typeof DESCONTO_AVISTA" in ler("padrao-dados.js"))
chk("common.js intocado (o aplicativo embute esse arquivo)", "TKPadrao" not in ler("common.js"))
todos = {os.path.basename(f): open(f, encoding="utf-8").read() for f in glob.glob(os.path.join(RAIZ, "*.js")) + glob.glob(os.path.join(RAIZ, "*.html"))}
chk("ninguém chama moeda() que não existe", not [f for f, s in todos.items() if re.search(r"(?<![A-Za-z_.$])moeda\(", s)])
cru = []
for f, s in todos.items():
    if f in ("common.js", "padrao-dados.js", "curriculo.html", "vendor-qrcode.js"): continue
    for m in re.finditer(r"""<img[^>]{0,200}?src="'\s*\+\s*(?:esc|escaparHtml)\(""", s): cru.append(f)
    for m in re.finditer(r"""<img[^>]{0,200}?src="\$\{(?:E|esc)\(""", s): cru.append(f)
chk("imagem dinâmica sempre por atribSrc (nenhum <img src=\"'+esc(...)) fora do common.js)", not cru, sorted(set(cru)))
chk("pwa.js e push.js compartilham SITE_URL, não location.origin", "location.origin + '/'" not in re.sub(r"\(typeof SITE_URL === 'string' \? SITE_URL : location\.origin \+ '/'\)", "", ler("pwa.js")) and "SITE_URL" in ler("push.js"))
chk("currículos e treinamentos montam o link do treinamento com SITE_URL", "tenkitermodas.com.br/treinamentos.html" not in ler("curriculos.html") and "tenkitermodas.com.br/treinamentos.html" not in ler("treinamentos.html"))
chk("nenhum '(HTTP ' + status' na tela do editor de visual", '"HTTP "+r.status' not in ler("admin-postagens.js"))
chk("o '10%' do index vem de DESCONTO_AVISTA", ler("index.html").count("data-desconto-avista") >= 2)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    def novo(w=390, h=844, sessao=True, perms=PERMS_ALL, versao="4.20"):
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, service_workers="block", timezone_id="Asia/Tokyo")   # fuso do aparelho DIFERENTE de Fortaleza de propósito
        if sessao: ctx.add_init_script(SESSION)
        log = []; st = install(ctx, log=log, versao=versao, perms=perms)
        return ctx, st, log

    print("== Funções únicas (TKPadrao) ==")
    ctx, st, log = novo(); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(1500)
    r = pg.evaluate("""() => ({
      e1: TKPadrao.erro({erro: '{"erro":"R2 put failed","status":500}'}, 'Padrão.'), e2: TKPadrao.erro(new Error('Failed to fetch')), e3: TKPadrao.erro('(HTTP 413)', 'Tente menor.'),
      e4: TKPadrao.erro({erro: 'Escolha a peça.'}), e5: TKPadrao.erro({erro: '<html>502</html>'}, 'Padrão.'), e6: TKPadrao.erro(null, 'Padrão.'),
      t1: TKPadrao.telefone('5588999990000'), t2: TKPadrao.telefone('88999990000'), t3: TKPadrao.telefone('(88) 3521-1234'), t4: TKPadrao.telefone('558835211234'), t5: TKPadrao.telefone('+14155550100'), t6: TKPadrao.telefone(''),
      f1: TKPadrao.contarFotos({Foto_URL: 'https://a/1.jpg', Fotos_Galeria: 'https://a/1.jpg, https://a/2.jpg,, https://a/3.jpg'}), f2: TKPadrao.contarFotos({Foto_URL: '', Fotos_Galeria: ''}),
      d1: TKPadrao.dataHora('2026-11-07T17:30:00Z', 'completa'), d2: TKPadrao.dataHora('2026-11-07T17:30:00Z', 'hora'), d3: TKPadrao.dataHora('2026-11-07T17:30:00Z', 'curta'), d4: TKPadrao.dataHora('lixo'),
      p1: TKPadrao.plural(1, 'peça', 'peças'), p2: TKPadrao.plural(3, 'peça', 'peças'), de: TKPadrao.descontoTxt(), n1: formatarTelefone('88999990000') })""")
    chk("erro: JSON cru vira a frase padrão", r["e1"] == "Padrão.", r["e1"])
    chk("erro: 'Failed to fetch' vira 'Sem conexão'", r["e2"].startswith("Sem conexão"), r["e2"])
    chk("erro: '(HTTP 413)' vira frase sem código", "413" not in r["e3"] and "HTTP" not in r["e3"], r["e3"])
    chk("erro: frase em português do servidor passa", r["e4"] == "Escolha a peça.")
    chk("erro: HTML/vazio viram o padrão", r["e5"] == "Padrão." and r["e6"] == "Padrão.")
    chk("telefone: com 55 e sem 55 saem iguais, sem 55 cru", r["t1"] == r["t2"] == r["n1"] == "(88) 99999-0000" and r["t4"] == r["t3"] == "(88) 3521-1234", r)
    chk("telefone: de fora do Brasil escrito com + mantém o +", r["t5"] == "+14155550100" and r["t6"] == "")
    chk("fotos: sem repetidas e sem vazias (capa + galeria)", r["f1"] == 3 and r["f2"] == 0, r)
    chk("data/hora: sempre Fortaleza, mesmo com o aparelho no Japão", r["d1"] == "07/11/2026 14:30" and r["d2"] == "14:30" and r["d3"] == "07/11 14:30" and r["d4"] == "", r)
    chk("plural e desconto", r["p1"] == "peça" and r["p2"] == "peças" and r["de"] == "10%")
    chk("o '10%' escrito no HTML é preenchido pela constante", pg.evaluate("[...document.querySelectorAll('[data-desconto-avista]')].every(n => n.textContent === TKPadrao.descontoTxt())"))
    chk("sem erro de JavaScript (index)", not erros, erros); ctx.close()

    print("== Vitrine: filtro de preço = preço à vista; Google = preço de tabela ==")
    ctx, st, log = novo()
    for q in st["produtos"][:3]: q["Status"] = "Ativo"; q["Estoque"] = 5
    st["produtos"][0]["Preco"] = 100.0       # à vista (10%): 90,00
    pid = st["produtos"][0]["ID"]
    pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".card"); pg.wait_for_timeout(900)
    def setar(id_, v): pg.evaluate("(a)=>{const e=document.getElementById(a[0]); e.value=a[1]; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}))}", [id_, v]); pg.wait_for_timeout(600)
    chk("o rótulo do filtro diz 'à vista'", "à vista" in pg.inner_text(".linha-preco") or "à vista" in (pg.evaluate("document.querySelector('.linha-preco').innerText") or "") or "à vista" in ler("index.html").split("linha-preco")[1][:200])
    setar("preco-max", "95")
    chk("máximo R$ 95: peça de R$ 100 (R$ 90 à vista) APARECE — é o preço que o cartão mostra", pg.locator('.card[data-id="%s"]' % pid).count() == 1)
    setar("preco-max", "85")
    chk("máximo R$ 85: some", pg.locator('.card[data-id="%s"]' % pid).count() == 0)
    setar("preco-max", ""); setar("preco-min", "95")
    chk("mínimo R$ 95: some (à vista é R$ 90)", pg.locator('.card[data-id="%s"]' % pid).count() == 0)
    setar("preco-min", "")
    pg.locator('.card[data-id="%s"] .abrir-peca' % pid).click(); pg.wait_for_selector("#overlay.aberto"); pg.wait_for_timeout(600)
    ld = json.loads(pg.evaluate("(document.getElementById('ld-produto')||{}).textContent||'{}'"))
    chk("dados estruturados do Google: preço de tabela (100.00), como o og-worker e o feed", ld.get("offers", {}).get("price") == "100.00", ld.get("offers"))
    chk("o texto da página continua dizendo o à vista", "90,00" in pg.title(), pg.title())
    chk("sem erro de JavaScript (vitrine)", not erros, erros); ctx.close()

    print("== Foto do cliente: erro sem JSON e chave guardada no aparelho ==")
    ctx, st, log = novo(); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    chamadas = []; modo = {"v": "json_cru"}
    def rota(route):
        chamadas.append(route.request.url)
        if modo["v"] == "json_cru": return route.fulfill(status=500, content_type="application/json", body='{"erro":"R2 put failed","status":500}')
        if modo["v"] == "queda": return route.abort()
        return route.fulfill(json={"ok": True, "id": 1})
    ctx.route("**/cliente/foto**", rota)
    buf = io.BytesIO(); Image.new("RGB", (800, 1000), (200, 120, 90)).save(buf, "JPEG")
    def montar_bloco():
        pg.evaluate("() => { const c = TKFotoCliente.bloco(); c.id = 'foto-cli'; document.body.prepend(c); }")
        pg.set_input_files("#foto-cli-arq", files=[{"name": "minha.jpg", "mimeType": "image/jpeg", "buffer": buf.getvalue()}]); pg.wait_for_timeout(900)
        pg.check("#foto-cli-ok")
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(1500); montar_bloco()
    pg.click("#foto-cli-enviar"); pg.wait_for_timeout(1200)
    t = pg.inner_text("#foto-cli-msg")
    chk("resposta com JSON cru do servidor vira frase em português", t and "{" not in t and "R2" not in t and "500" not in t, t)
    modo["v"] = "queda"; pg.click("#foto-cli-enviar"); pg.wait_for_timeout(1200)
    t = pg.inner_text("#foto-cli-msg")
    chk("sem resposta: diz 'sem confirmação' e que não duplica", "Sem confirmação" in t and "não é registrada duas vezes" in t, t)
    op1 = re.search(r"[?&]op=([^&]+)", chamadas[-1]).group(1)
    chk("o envio leva uma chave de operação", len(op1) >= 8, chamadas[-1])
    chk("a chave fica guardada no aparelho", pg.evaluate("!!localStorage.getItem('tk_fc_op_v1')"))
    pg.reload(); pg.wait_for_timeout(1500); montar_bloco(); modo["v"] = "ok"
    pg.click("#foto-cli-enviar"); pg.wait_for_timeout(1200)
    op2 = re.search(r"[?&]op=([^&]+)", chamadas[-1]).group(1)
    chk("depois de recarregar a página, a MESMA foto reusa a MESMA chave", op1 == op2, [op1, op2])
    chk("confirmado: a chave sai do aparelho", pg.evaluate("localStorage.getItem('tk_fc_op_v1')") is None and "Recebemos" in pg.inner_text("#foto-cli-msg"))
    chk("sem erro de JavaScript (foto do cliente)", not erros, erros); ctx.close()

    print("== Pedir fotos: chave guardada no aparelho; plural ==")
    ctx, st, log = novo(); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    cham = []; falhar = {"v": True}
    def pedir(route):
        corpo = json.loads(route.request.post_data or "{}"); cham.append(corpo)
        if falhar["v"]: return route.abort()
        return route.fulfill(json={"ok": True, "id": len(cham)})
    ctx.route("**/esteira/fotos/pedir", pedir)
    pg.goto(BASE + "admin.html"); pg.wait_for_selector("#lista-produtos .produto"); pg.wait_for_timeout(1500)
    lista = [{"ID": st["produtos"][1]["ID"], "Nome": "Blusa teste", "Codigo": "TK-0002", "Foto_URL": ""}]
    def abrir_pf():
        pg.evaluate("(l) => TKPedirFotos.abrir(l, 'gestao')", lista); pg.wait_for_selector("#tk-pedir-fotos:not([hidden])")
        pg.locator('[data-opcao="manequim"]').click(); pg.locator(".pf-enviar").click(); pg.wait_for_timeout(1500)
    abrir_pf()
    chk("sem confirmação: pedido NÃO conta como feito, texto no singular ('Falta 1')", "Falta 1" in pg.inner_text(".pf-status") and "Faltam 1" not in pg.inner_text(".pf-status") and "Tentar o que falta" in pg.inner_text(".pf-enviar"), pg.inner_text(".pf-status"))
    chk("a mensagem não manda repetir às cegas: diz que não duplica", "não é duplicado" in pg.inner_text(".pf-falhas"), pg.inner_text(".pf-falhas"))
    op1 = cham[-1]["op"]
    pg.reload(); pg.wait_for_selector("#lista-produtos .produto"); pg.wait_for_timeout(1500); falhar["v"] = False
    abrir_pf()
    chk("recarregando a página e pedindo de novo, a chave é a MESMA", cham[-1]["op"] == op1, [op1, cham[-1]["op"]])
    chk("confirmado: chave sai do aparelho", pg.evaluate("localStorage.getItem('tk_pf_ops_v1')") in (None, "{}"), pg.evaluate("localStorage.getItem('tk_pf_ops_v1')"))
    chk("sem erro de JavaScript (pedir fotos)", not erros, erros); ctx.close()

    print("== Gestão: Disponibilidade com preço, Mais recentes com foto nova, botão Fotos com IA ==")
    ctx, st, log = novo(); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "admin.html"); pg.wait_for_selector("#lista-produtos .produto"); pg.wait_for_timeout(1800)
    # Mais recentes: peça com foto nova (mapa do TKFotosNovas) sobe
    ordem0 = pg.evaluate("[...document.querySelectorAll('#lista-produtos .produto-chk')].map(c => c.dataset.id)")
    alvo = ordem0[-1]
    antes = ordem0.index(alvo)
    pg.evaluate("(id) => { const m = {}; m[id] = Date.now(); TKFotosNovas.__mapaTeste = m; }", alvo)
    suporta = pg.evaluate("typeof TKFotosNovas === 'object' && typeof TKFotosNovas.ordenar === 'function'")
    chk("a Gestão usa TKFotosNovas.ordenar em 'Mais recentes'", "TKFotosNovas.ordenar(lista)" in ler("admin.html") and suporta)
    pg.evaluate("window.__ordenou = 0; const o = TKFotosNovas.ordenar; TKFotosNovas.ordenar = function (l) { window.__ordenou++; return o.call(this, l); };")
    for v in ("nome", "recentes"):
        pg.evaluate("(v) => { const e = document.getElementById('fa-ordem'); e.value = v; e.dispatchEvent(new Event('change', {bubbles: true})); }", v); pg.wait_for_timeout(400)
    chk("escolher 'Mais recentes' passa a lista pela mesma ordenação da vitrine", pg.evaluate("window.__ordenou") >= 1)
    # contagem de fotos: a Gestão e a vitrine concordam (capa repetida na galeria conta uma vez)
    pg.evaluate("(id) => { const p = produtos.find(x => String(x.ID) === String(id)); p.Foto_URL = 'https://res.cloudinary.com/z/image/upload/v1/a.jpg'; p.Fotos_Galeria = 'https://res.cloudinary.com/z/image/upload/v1/a.jpg, https://res.cloudinary.com/z/image/upload/v1/b.jpg'; renderizarProdutos(); }", ordem0[0])
    qtd = pg.evaluate("(id) => qtdFotos_(produtos.find(x => String(x.ID) === String(id)))", ordem0[0])
    chk("Gestão: capa repetida na galeria conta uma vez (2 fotos, não 3)", qtd == 2, qtd)
    # botão da seleção "Enviar para modelo IA" = mesma regra do cartão
    reg = pg.evaluate("""() => {
      const res = {};
      const antes = usuarioAdmin;
      const tenta = (u) => { usuarioAdmin = u; return new Promise(r => setTimeout(() => r(document.getElementById('btn-bulk-fotoia').hidden), 1300)); };
      return (async () => {
        res.config_sem_fotoia = await tenta({ nome: 'Ana', acessosConfiguraveis: true, permissoes: ['catalogo_cadastrar'] });
        res.config_com_fotoia = await tenta({ nome: 'Ana', acessosConfiguraveis: true, permissoes: ['fotoia'] });
        res.legado_cadastrar = await tenta({ nome: 'Ana', permissoes: ['catalogo_cadastrar'] });
        res.admin_total = await tenta({ nome: 'Ana', acessosConfiguraveis: true, permissoes: ['gerir_acessos'] });
        usuarioAdmin = antes; return res;
      })();
    }""")
    chk("acessos configuráveis SEM 'fotoia': botão escondido (igual ao cartão)", reg["config_sem_fotoia"] is True, reg)
    chk("acessos configuráveis COM 'fotoia': botão aparece", reg["config_com_fotoia"] is False, reg)
    chk("modo antigo com 'cadastrar': botão aparece", reg["legado_cadastrar"] is False, reg)
    chk("Admin total: aparece", reg["admin_total"] is False, reg)
    chk("sem erro de JavaScript (Gestão)", not erros, erros); ctx.close()

    print("== Disponibilidade: preço formatado ==")
    src = ler("admin-disponibilidade.js")
    chk("preço usa formatarReal e TEXTO_CONSULTA (R$ 89,90, não '89.9')", "formatarReal(p.Preco)" in src and "TEXTO_CONSULTA" in src and "moeda" not in src)
    b.close()
print("OK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
