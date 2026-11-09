"""v7.65.0: textos com concordância certa, compatibilidade com textos antigos gravados e acabamento visual das abas/foco/caixa.
Serviços SIMULADOS (tests/mock.py), Chromium (não é Android).   TK_BASE=http://localhost:8765/ python3 tests/textos_visual.py"""
import os, re, sys, json
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
RAIZ = os.path.dirname(AQUI)
from mock import install, SESSION, PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK, BAD = [], []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)[:300]) if (e and not c) else ""))
def ler(f): return open(os.path.join(RAIZ, f), encoding="utf-8").read()

# ---- 1. concordância (estático): frases que já saíram erradas na troca mecânica "peça" -> "produto"
ERRADOS = [r"Produtos mais vistas", r"próximas? produtos?\b(?! [a-zç]+ (em|para))", r"as próximas produtos", r"produtos vendidas", r"produtos paradas",
           r"(?<!destes )produtos já foram postadas", r"próxima produto", r"Garanta a sua no catálogo", r"produtos? (são|ficam|estão) puladas"]
ARQ = [f for f in os.listdir(RAIZ) if f.endswith((".js", ".html")) and not f.startswith(("vendor", "OneSignalSDK"))]
achados = {}
for f in ARQ:
    t = ler(f)
    for rx in ERRADOS:
        if rx.startswith("próximas?"): continue
        m = re.search(rx, t)
        if m: achados.setdefault(f, []).append(m.group(0))
chk("textos sem concordância errada (produto é masculino)", not achados, achados)
chk("Gestão: 'Produtos mais vistos' nas duas listas", ler("admin-gestao.js").count("<h3>Produtos mais vistos</h3>") == 2)
chk("Esteira: 'os próximos produtos colocados em preparação'", "Vale para os próximos produtos colocados em preparação." in ler("esteira.html"))

# ---- 2. compatibilidade com textos já gravados (peça/produto), sem migrar dados
cat = ler("catalogo.js")
rx_js = re.search(r"(/\^Composição com [^\n]*?\\\./)\.test", cat)
chk("catalogo.js reconhece a composição com 'peças' e com 'produtos'", bool(rx_js))
if rx_js:
    py = rx_js.group(1)[1:-1].replace("\\u00e7", "ç")
    for s, esperado in [("Composição com peças vendidas separadamente. Consulte...", True), ("Composição com produtos vendidas separadamente. X", True),
                        ("Composição com produtos vendidos separadamente. X", True), ("Outra descrição qualquer", False)]:
        chk(f"composição reconhece: {s[:44]}", bool(re.search(py, s)) == esperado)
chk("Fotos IA grava a forma nova (vendidos)", "Composição com produtos vendidos separadamente." in ler("fotoia-servico.js"))
adm = ler("admin.html")
m2 = re.search(r"!(/\^Editou \([^\n]*?/)\.test\(a\.ultimaAcao\)", adm)
chk("Histórico trata 'Editou a peça' e 'Editou o produto' igual", bool(m2))
if m2:
    py = m2.group(1)[1:-1].replace("\\u00e7", "ç")
    chk("regex da última ação: antiga e nova batem", bool(re.search(py, "Editou a peça")) and bool(re.search(py, "Editou o produto")) and not re.search(py, "Excluiu o produto"))

# ---- 3. contraste do anel de foco (token único em tk-padrao.css)
def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
def razao(a, b):
    x, y = sorted((lum(a), lum(b)), reverse=True); return (x + .05) / (y + .05)
tok = re.search(r"--tk-foco-cor:\s*(#[0-9A-Fa-f]{6})", ler("tk-padrao.css"))
chk("token --tk-foco-cor em hexadecimal", bool(tok))
if tok:
    cor = tok.group(1)
    for fundo in ("#ffffff", "#fff8e6", "#f5f1e8", "#eeeeee", "#0d0d0d"):
        chk(f"foco {cor} sobre {fundo} >= 3,5:1", razao(cor, fundo) >= 3.5, round(razao(cor, fundo), 2))
jan = ler("janelas.css")
chk("janelas.css desenha o anel com o token (sem laranja solto)", "outline: 3px solid var(--tk-foco-cor" in jan and "outline: 3px solid #E67E22" not in jan)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    # ---- 4. Mensagens no computador: nenhuma palavra das abas parte no meio; alvo 44 px
    for w, h in [(1440, 900), (390, 844)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, service_workers="block")
        ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
        st = install(ctx, perms=PERMS_ALL, versao="7.40.35"); st["ig"].setdefault("msg", mock_msg.novo_estado())
        pg = ctx.new_page(); pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2200)
        pg.click("#details-ferramentas > summary"); pg.click("#btn-abrir-mensagens")
        pg.wait_for_selector("#ms-abas .ms-aba", timeout=9000); pg.wait_for_timeout(700)
        r = pg.evaluate("""()=>{const abas=[...document.querySelectorAll('#ms-abas .ms-aba')];const quebradas=[];
          abas.forEach(a=>{const w=document.createTreeWalker(a,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const re=/\\S+/g;let m;while(m=re.exec(n.nodeValue)){
            if(/^\\d+\\+?$/.test(m[0]))continue;const rg=document.createRange();rg.setStart(n,m.index);rg.setEnd(n,m.index+m[0].length);
            const linhas=new Set([...rg.getClientRects()].map(x=>Math.round(x.top)));if(linhas.size>1)quebradas.push(m[0]);}}});
          return {n:abas.length,quebradas,altura:Math.min(...abas.map(a=>a.getBoundingClientRect().height)),cortada:abas.some(a=>a.scrollWidth>a.clientWidth+1)}}""")
        chk(f"{w}px Mensagens: {r['n']} abas, nenhuma palavra partida", r["n"] >= 5 and not r["quebradas"], r)
        chk(f"{w}px Mensagens: abas com 44 px ou mais e sem texto cortado", r["altura"] >= 43.5 and not r["cortada"], r)
        ctx.close()
    # ---- 5. Currículos: as duas abas dividem a linha (não ficam estreitas)
    CV = {"CvId": "CV1", "Nome": "Maria Teste", "WhatsApp": "88999990001", "Status": "Novo", "Criado": "2026-10-15T12:00:00Z", "Etapa": "Enviado", "Historico": ""}
    for w, h in [(1440, 900), (390, 844)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, service_workers="block")
        ctx.add_init_script(SESSION); install(ctx, perms=PERMS_ALL, versao="4.1", protegido=True)
        pg = ctx.new_page()
        def h_(route):
            rq = route.request
            if rq.method != "POST": return route.fallback()
            try: b_ = json.loads(rq.post_data or "{}")
            except Exception: return route.fallback()
            a = b_.get("action"); hd = {"access-control-allow-origin": "*"}
            if a == "curriculos_listar": return route.fulfill(status=200, content_type="application/json", headers=hd, body=json.dumps({"ok": True, "curriculos": [CV], "status": ["Novo", "Entrevista"], "motivos": []}))
            if a == "curriculos_treinamento": return route.fulfill(status=200, content_type="application/json", headers=hd, body=json.dumps({"ok": True, "leitura": [], "resultados": []}))
            return route.fallback()
        pg.route("**/*", h_)
        pg.goto(BASE + "curriculos.html"); pg.wait_for_timeout(2500)
        r = pg.evaluate("""()=>{const c=document.querySelector('.tk-abas');if(!c)return null;const t=[...c.querySelectorAll(':scope > button')];
          return {n:t.length,cw:c.clientWidth,larg:t.map(x=>Math.round(x.getBoundingClientRect().width)),alt:Math.min(...t.map(x=>x.getBoundingClientRect().height)),horiz:document.documentElement.scrollWidth>innerWidth}}""")
        chk(f"{w}px Currículos: 2 abas ocupam a linha (>= 40% cada), 44 px, sem rolagem lateral", bool(r) and r["n"] == 2 and all(x >= r["cw"] * 0.4 for x in r["larg"]) and r["alt"] >= 43.5 and not r["horiz"], r)
        ctx.close()
    # ---- 6. Minha conta: a aba Entrar volta a ter largura confortável
    for w, h in [(390, 844), (1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, service_workers="block")
        install(ctx, ia=False, versao="4.3")   # sem SESSION: visitante, a janela mostra Entrar / Criar conta
        pg = ctx.new_page(); pg.goto(BASE + "index.html"); pg.wait_for_timeout(2000)
        pg.evaluate("document.getElementById('btn-conta-header').style.display='';document.getElementById('btn-conta-header').click()"); pg.wait_for_timeout(700)
        r = pg.evaluate("""()=>{const t=[...document.querySelectorAll('.conta-abas > button')];return {n:t.length,larg:t.map(x=>Math.round(x.getBoundingClientRect().width)),alt:t.map(x=>Math.round(x.getBoundingClientRect().height)),txt:t.map(x=>x.textContent)}}""")
        chk(f"{w}px Minha conta: abas Entrar/Criar conta com 120 px ou mais e 44 px de altura", r["n"] == 2 and min(r["larg"]) >= 120 and min(r["alt"]) >= 44, r)
        ctx.close()
    # ---- 7. caixa de seleção da lista da Gestão: vazia x marcada distintas, alvo de 44 px
    ctx = b.new_context(viewport={"width": 390, "height": 400}); pg = ctx.new_page()
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(800)
    r = pg.evaluate("""()=>{const css=['catalogo.css','tk-padrao.css'];const fr=document.createElement('div');fr.style.cssText='position:relative;width:160px;height:200px;background:#fff';
      fr.innerHTML='<input type=checkbox class=produto-chk id=zv><input type=checkbox class=produto-chk id=zm checked>';document.body.appendChild(fr);
      const g=(id)=>{const e=document.getElementById(id),s=getComputedStyle(e,'::before'),b=e.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),bg:s.backgroundColor,borda:s.borderTopColor,sombra:s.boxShadow}};
      return {vazia:g('zv'),marcada:g('zm')}}""")
    v, mk = r["vazia"], r["marcada"]
    chk("caixa de seleção: alvo de 44 px nos dois estados", v["w"] >= 44 and v["h"] >= 44 and mk["w"] >= 44, r)
    chk("caixa de seleção: borda branca e sombra escura nos dois estados", "255, 255, 255" in v["borda"] and "255, 255, 255" in mk["borda"] and v["sombra"] != "none" and mk["sombra"] != "none", r)
    chk("caixa de seleção: marcada (laranja) difere da vazia (escura)", v["bg"] != mk["bg"] and "230, 126, 34" in mk["bg"], r)
    ctx.close()
    b.close()

print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
