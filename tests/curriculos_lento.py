"""v4.32 (C3): curriculos.html com servidor lento — abertura que NÃO cai no login, leitura que tenta 2×, gravação que NUNCA repete sozinha
(só 1 pedido), mensagem clara quando a resposta demora ("pode ter sido salva") e recarregar protegido enquanto grava (TKOcupado)."""
import sys, os, json
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
CV = {"CvId": "CV1", "Nome": "Maria Teste", "WhatsApp": "88999990001", "Status": "Novo", "Criado": "2026-10-15T12:00:00Z", "Etapa": "Enviado", "Historico": ""}
def resp(route, corpo):
    route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(corpo))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    def nova(est, sessao_cai=False):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
        ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_CURR_LIMITE_ESCRITA_MS=700;")
        install(ctx, perms=PERMS_ALL, versao="4.1", protegido=True)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
        def h(route):
            r = route.request
            if r.method != "POST": return route.fallback()
            try: b_ = json.loads(r.post_data or "{}")
            except Exception: return route.fallback()
            a = b_.get("action"); est["vistos"].append(a)
            if a == "sessao" and est.get("sessao_cai"): return route.abort()
            if a == "curriculos_listar":
                est["listagens"] = est.get("listagens", 0) + 1
                if est.get("listar_cai_1a") and est["listagens"] == 1: return route.abort()
                return resp(route, {"ok": True, "curriculos": [dict(CV)], "status": ["Novo", "Entrevista"], "motivos": []})
            if a == "curriculos_treinamento": return resp(route, {"ok": True, "leitura": [], "resultados": []})
            if a == "curriculos_atualizar":
                est["gravacoes"] += 1
                if est.get("grava_trava"): return   # nunca responde: o tempo limite da página corta
                return resp(route, {"ok": True, "historico": ""})
            return route.fallback()
        pg.route("**/*", h)
        return ctx, pg
    def salvar(pg):
        pg.click(".item .topo"); pg.wait_for_timeout(400)
        pg.select_option("[data-k=st]", "Entrevista"); pg.click("[data-k=sv]")

    print("== Abertura com servidor que não responde: NÃO manda para o login ==")
    est = {"vistos": [], "gravacoes": 0, "sessao_cai": True}
    ctx, pg = nova(est); pg.goto(BASE + "curriculos.html"); pg.wait_for_timeout(2500)
    t = pg.inner_text("#app")
    chk("mostra 'Não foi possível carregar' + Tentar de novo", "Não foi possível carregar" in t and pg.locator("#tentar").count() == 1, t[:160])
    chk("não mostra a tela de login", pg.locator("#go").count() == 0 and "Entrar" not in t)
    chk("a sessão continua guardada no aparelho", bool(pg.evaluate("localStorage.getItem('tm_session')")))
    est["sessao_cai"] = False; pg.click("#tentar"); pg.wait_for_timeout(2000)
    chk("voltou o servidor: 'Tentar de novo' abre a lista", pg.locator(".item").count() == 1 and "Maria Teste" in pg.inner_text("#app"), pg.inner_text("#app")[:120]); ctx.close()

    print("== Leitura tenta 2× (1ª resposta perdida) ==")
    est = {"vistos": [], "gravacoes": 0, "listar_cai_1a": True}
    ctx, pg = nova(est); pg.goto(BASE + "curriculos.html"); pg.wait_for_timeout(3500)
    chk("a lista abriu mesmo com a 1ª leitura perdida", pg.locator(".item").count() == 1, pg.inner_text("#app")[:120])
    chk("foram 2 pedidos de lista", est["listagens"] == 2, est["listagens"]); ctx.close()

    print("== Gravação com resposta que demora: 1 pedido só, frase clara, recarregar protegido ==")
    est = {"vistos": [], "gravacoes": 0, "grava_trava": True}
    ctx, pg = nova(est); pg.goto(BASE + "curriculos.html"); pg.wait_for_timeout(2500)
    salvar(pg); pg.wait_for_timeout(250)
    chk("enquanto grava o recarregar fica protegido (TKOcupado)", pg.evaluate("TKOcupado.pendentes()") == 1)
    chk("o botão Salvar fica travado (sem clique duplo)", pg.is_disabled("[data-k=sv]"))
    pg.wait_for_timeout(1400)
    ms = pg.inner_text("[data-k=ms]")
    chk("frase clara: pode ter sido salva, confira antes de repetir", "pode ter sido salva" in ms and "{" not in ms, ms)
    chk("NÃO repetiu a gravação sozinho (1 pedido)", est["gravacoes"] == 1, est["gravacoes"])
    chk("soltou a proteção e o botão voltou", pg.evaluate("TKOcupado.pendentes()") == 0 and pg.is_enabled("[data-k=sv]"))
    est["grava_trava"] = False; pg.click("[data-k=sv]"); pg.wait_for_timeout(600)
    chk("tentar de novo salva normalmente", "Salvo" in pg.inner_text("[data-k=ms]") and est["gravacoes"] == 2, pg.inner_text("[data-k=ms]")); ctx.close()
    chk("sem erro de JavaScript", not erros, erros); b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD)
sys.exit(1 if BAD else 0)
