"""Padrão de vocabulário e de avisos (v7.57.0): falha se aparecerem os termos banidos em texto de interface.

Regras (decisões do dono): produto (não "peça"), seleção (não "sacola"), Gestão (não "Painel do Atendente"/"gestor total"),
Pedir fotos (não "Solicitar fotos"), "Tentar de novo" (não "novamente"), MB (não MiB), "…" (não "..."),
Excluir = destruir de vez · Arquivar = esconder e dá para reativar · Remover = tirar de uma lista (não "Apagar" em botão),
confirmação destrutiva = confirm() (não "toque de novo"), senha = campo de senha (não prompt()), alert() só em erro que exige ação.

Duas partes:
  1) VARREDURA ESTÁTICA do texto de interface em todos os .js/.html do site (linhas de comentário não contam).
  2) VARREDURA NA TELA (Chromium + serviços simulados): texto visível, aria-label, title e placeholder das telas principais.
Não valida Android nem integração real. Saída: "FALHAS=0" quando tudo passa.
"""
import os, re, sys, glob
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
RAIZ = os.path.dirname(AQUI)
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)[:600]) if (e and not c) else ""))

# ---------------------------------------------------------------- regras
B = lambda p, f=0: re.compile(p, f)
BANIDOS = [  # (nome, regex, explicação)
    ("sacola", B(r"(?<=[\s>(“\"'])[Ss]acolas?(?![\w\-_'\":])"), "use seleção"),
    ("peça", B(r"(?<![\w\-.#$/_'\"])[Pp]eças?(?![\w\-_])"), "use produto"),
    ("Solicitar fotos", B(r"[Ss]olicit(ar|e|ando) fotos"), "use Pedir fotos"),
    ("novamente (tentar)", B(r"[Tt]ent(e|ar|ando)( \w+)? novamente"), "use tente de novo / Tentar de novo"),
    ("Painel do Atendente", B(r"Painel do Atendente"), "use Gestão"),
    ("gestor total", B(r"[Gg]estor total"), "use Admin total"),
    ("MiB", B(r"\bMiB\b"), "use MB"),
    ("reticências ...", B(r"(?<=[A-Za-zÀ-ÿ])\.\.\.(?=[\s'\"<`)\]]|$)"), "use …"),
    ("Apagar (rótulo)", B(r"(?<![\w.#-])(Apagar|Apague)(?![\w])"), "use Excluir (destruir) ou Remover (tirar da lista)"),
    ("toque de novo (confirmação)", B(r"(?<=['\">])[Tt]oque de novo para (aceitar|tirar|descartar|cancelar|refazer|confirmar|mostrar)"), "use confirm()"),
    ("nova senha por prompt()", B(r"prompt\(\s*['\"]Nova senha"), "use TKAviso.pedirSenha"),
    ("Editar no cadastro", B(r"Editar no cadastro"), "use Editar produto"),
    ("maiúscula no meio do botão", B(r"Enviar Agora|Arquivar em Massa|Marcar Novidades|Alterar Preços|Baixar Imagem|>Usar (Título|Descrição)<|Gerar Título/Descrição"), "use forma de frase"),
    ("sem conexão fora do padrão", B(r"Sem conexão agora\. (Tente|Verifique|Confira)|Sem conexão agora [—-] tente|Sem conexão\. (Tente|Confira)|Sem conexão com o servidor"), "use: Sem conexão. Verifique a internet e tente de novo."),
    ("Gênero (rótulo de gestão)", B(r"(?<![\w.])Gênero(?![\w])"), "use Público"),
    ("tu/você", B(r"entra no nosso site|e faz a avaliação"), "use você (entre / faça)"),
]
# exceções documentadas: (arquivo, regra, trecho que pode ficar)
PERMITIDO = [
    ("*", "peça", r"Peça (ao|para|a ele)|peça a ele|vendidas separadamente"),   # "Peça" = verbo pedir; texto de DADOS já gravado
    ("*", "Apagar (rótulo)", r"apagar o que guardamos|apague os dados"),
    ("privacidade.html", "*", r".*"), ("exclusao-dados.html", "*", r".*"),      # textos jurídicos: revisão própria
    ("common.js", "*", r".*"),   # sacola/peça/"Sem conexão com o servidor" aqui: ficam para o lote que pode tocar common.js (o APK embute o arquivo)
    ("*", "Apagar (rótulo)", r"Apague parte do texto"),
    ("*", "peça", r"Peça (ao|para|a ele)|peça a ele|vendidas separadamente"),
    ("__", "peça", r"__"),            # mensagens de status do pedido: ficam para o lote que pode tocar common.js (APK embute o arquivo)
    ("admin-postagens.js", "sacola", r".*"), # "Sacola" é o NOME DO DESENHO (ícone de sacola) no editor visual, não a seleção da cliente
    ("treinamento-cadastro-simulacao.html", "Gênero (rótulo de gestão)", r".*"),
    ("treinamento-cadastro-simulacao.html", "peça", r".*"),
    ("a11y.js", "Gênero (rótulo de gestão)", r".*"),
]
# alert() só para erro que exige ação / texto longo a ler; qualquer outro vira aviso que não trava (TKAviso)
ALERTS_OK = {"admin.html": 2, "curriculo.html": 2, "common.js": 1}

def sem_comentario(linha):
    t = linha.strip()
    return not (t.startswith("//") or t.startswith("*") or t.startswith("/*") or t.startswith("<!--") or t.startswith("#"))
def sem_comentario_fim(linha):  # tira "// comentário" no fim de linhas de código (não dentro de URL)
    return re.sub(r"(?<![:\"'\w])//\s.*$", "", linha)

arquivos = sorted(f for f in glob.glob(os.path.join(RAIZ, "*.js")) + glob.glob(os.path.join(RAIZ, "*.html"))
                  if not os.path.basename(f).startswith(("vendor", "OneSignalSDK")))
achados = {}
n_alert = {}
for f in arquivos:
    nome = os.path.basename(f)
    txt = open(f, encoding="utf-8").read()
    em_bloco = False
    for i, ln in enumerate(txt.split("\n"), 1):
        t = ln.strip()
        if em_bloco:
            if "*/" in t: em_bloco = False
            continue
        if t.startswith("/*") and "*/" not in t: em_bloco = True; continue
        if not sem_comentario(ln): continue
        cod = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), sem_comentario_fim(ln))
        if re.search(r"(?<![\w.$])alert\(", cod): n_alert[nome] = n_alert.get(nome, 0) + 1
        for rn, rx, expl in BANIDOS:
            for m in rx.finditer(cod):
                trecho = cod[max(0, m.start() - 25): m.end() + 40]
                liberado = any((a in ("*", nome)) and (r in ("*", rn)) and re.search(p, cod[max(0, m.start() - 12): m.end() + 30]) for a, r, p in PERMITIDO)
                if not liberado: achados.setdefault((rn, expl), []).append("%s:%d %s" % (nome, i, trecho.strip()[:90]))
for (rn, expl), lst in sorted(achados.items()):
    chk("estático: sem '%s' em texto de interface (%s)" % (rn, expl), False, "; ".join(lst[:6]) + (" … +%d" % (len(lst) - 6) if len(lst) > 6 else ""))
for rn, rx, expl in BANIDOS:
    if (rn, expl) not in achados: chk("estático: sem '%s' em texto de interface (%s)" % (rn, expl), True)
sobras = {k: v for k, v in n_alert.items() if v > ALERTS_OK.get(k, 0)}
chk("estático: alert() só nos erros que exigem ação (admin.html 2, curriculo.html 2)", not sobras, sobras)

# ---------------------------------------------------------------- na tela
from playwright.sync_api import sync_playwright
from mock import install, SESSION
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
TELA_BAN = re.compile(r"[Ss]acola|Painel do Atendente|[Ss]olicitar fotos|[Tt]ent(e|ar) novamente|[Gg]estor total|\bMiB\b|(?<![\w])(?:[Pp]eças|[Pp]eça(?! (?:ao|para|a ele)))(?![\w])|Editar no cadastro")
PAGINAS = ["index.html", "admin.html", "esteira.html", "fotos-ia.html", "treinamentos.html", "curriculos.html"]
JS_TEXTOS = """() => { const t = [document.body.innerText]; const so = '[aria-label],[title],[placeholder],[alt]';
  document.querySelectorAll(so).forEach(e => ['aria-label','title','placeholder','alt'].forEach(a => { const v = e.getAttribute(a); if (v) t.push(v); }));
  t.push(document.title); return t.join('\\n'); }"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for vp in ({"width": 390, "height": 844}, {"width": 1440, "height": 900}):
        ctx = b.new_context(viewport=vp, service_workers="block"); ctx.add_init_script(SESSION)
        install(ctx)
        for pag in PAGINAS:
            pg = ctx.new_page(); pg.on("dialog", lambda d: d.accept())
            try:
                pg.goto(BASE + pag); pg.wait_for_timeout(1800)
                if pag == "admin.html":   # abre o que costuma esconder rótulos: barra de seleção e filtros
                    try:
                        pg.locator("#lista-produtos .produto-chk").nth(0).check(); pg.wait_for_timeout(300)
                    except Exception: pass
                txt = pg.evaluate(JS_TEXTOS)
                ach = sorted(set(txt[max(0, m.start() - 30): m.end() + 20].replace(chr(10), ' ') for m in TELA_BAN.finditer(txt)))
                # texto dos dados simulados (ex.: "Peça antiga" do mock) não conta: só os rótulos da interface
                chk("tela %s (%dpx): sem termos banidos no texto visível/acessível" % (pag, vp["width"]), not ach, ach)
            finally:
                pg.close()
        ctx.close()
    b.close()
print("OK=%d FALHAS=%d" % (len(OK), len(BAD)))
sys.exit(1 if BAD else 0)
