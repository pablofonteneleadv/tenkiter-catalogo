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
            if a == "curriculos_treinamento":
                est["leituras"] = est.get("leituras", 0) + 1
                respostas = est.get("treinos") or [{"ok": True, "leitura": [], "resultados": []}]
                return resp(route, respostas[min(est["leituras"] - 1, len(respostas) - 1)])
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

    print("== RH: manuais ainda não iniciados + atualização de permissões + cache na memória ==")
    iniciando = {"titulo": "TM Funcionário Iniciando", "total": 8, "lidos": 8, "faltam": 0, "precisamReler": 0, "podeProva": True}
    online1 = {"titulo": "TM Online 1", "total": 6, "lidos": 0, "faltam": 6, "precisamReler": 0, "podeProva": True}
    online2 = {"titulo": "TM Online 2", "total": 4, "lidos": 0, "faltam": 4, "precisamReler": 0, "podeProva": False}
    est = {"vistos": [], "gravacoes": 0, "treinos": [
        {"ok": True, "acessoConferido": True, "leitura": [iniciando, online1], "resultados": []},
        {"ok": True, "acessoConferido": True, "leitura": [online1, online2], "resultados": []},
        {"ok": False, "erro": "temporariamente indisponível"}
    ]}
    ctx, pg = nova(est); pg.goto(BASE + "curriculos.html"); pg.wait_for_timeout(1600)
    pg.click(".item .topo")
    pg.wait_for_function("document.querySelector('[data-k=treino]')?.textContent.includes('TM Online 1')")
    txt = pg.inner_text("[data-k=treino]")
    chk("manual disponível sem leitura aparece", "TM Online 1" in txt and "0 de 6" in txt and "ainda não iniciou" in txt, txt[:260])
    chk("manual concluído continua visível", "TM Funcionário Iniciando" in txt, txt[:260])
    pg.click(".item .topo"); pg.click(".item .topo")
    pg.wait_for_function("document.querySelector('[data-k=treino]')?.textContent.includes('TM Online 2')")
    txt = pg.inner_text("[data-k=treino]")
    chk("nova permissão e novo manual atualizam ao reabrir", "TM Online 2" in txt and "TM Funcionário Iniciando" not in txt, txt[:260])
    chk("reabertura provoca nova leitura autenticada", est.get("leituras") == 2, est.get("leituras"))
    pg.click("[data-k=atualizar-treino]")
    pg.wait_for_function("document.querySelector('[data-k=treino]')?.textContent.includes('última consulta')")
    txt = pg.inner_text("[data-k=treino]")
    chk("falha de atualização preserva histórico só para consulta, sem cobrar", "TM Online 1" in txt and "TM Online 2" in txt and "apenas informativa" in txt and "Cobrar leitura" not in txt and "Cobrar prova" not in txt, txt[:300])
    chk("atualização manual faz uma consulta, sem duplicar", est.get("leituras") == 3, est.get("leituras"))
    chk("botão Atualizar tem altura mínima de 44px", pg.locator("[data-k=atualizar-treino]").evaluate("(el) => el.getBoundingClientRect().height") >= 44)
    ctx.close()

    print("== Contrato RH 2.0: não cobrar sem prova atual de acesso ==")
    est = {"vistos": [], "gravacoes": 0, "treinos": [
        {"ok": True, "leitura": [online1, online2], "resultados": []},  # Apps Script antigo sem prova de acesso
        {"ok": True, "acessoConferido": True, "leitura": [], "resultados": []},  # nível 0 / Cliente
        {"ok": True, "acessoConferido": True, "leitura": [iniciando], "resultados": []},
        {"ok": True, "acessoConferido": True, "leitura": [online2], "resultados": []},
    ]}
    ctx, pg = nova(est); pg.goto(BASE + "curriculos.html"); pg.wait_for_timeout(1600)
    pg.click(".item .topo")
    pg.wait_for_function("document.querySelector('[data-k=treino]')?.textContent.includes('conferência de acessos')")
    txt = pg.inner_text("[data-k=treino]")
    chk("servidor antigo não autoriza cobranças mesmo trazendo todos os manuais", "Cobrar" not in txt and "TM Online 1" not in txt, txt)
    pg.click("[data-k=atualizar-treino]")
    pg.wait_for_function("document.querySelector('[data-k=treino]')?.textContent.includes('Nenhum treinamento liberado')")
    chk("nível 0 não vê manual nem recebe cobrança", "Cobrar" not in pg.inner_text("[data-k=treino]"))
    pg.click("[data-k=atualizar-treino]")
    pg.wait_for_function("document.querySelector('[data-k=treino]')?.textContent.includes('TM Funcionário Iniciando')")
    chk("manual liberado pode ser visto, sem outros manuais", "TM Online" not in pg.inner_text("[data-k=treino]"))
    pg.click("[data-k=atualizar-treino]")
    pg.wait_for_function("document.querySelector('[data-k=treino]')?.textContent.includes('TM Online 2')")
    txt = pg.inner_text("[data-k=treino]")
    chk("revogação remove antigo da cobrança após atualizar", "TM Funcionário Iniciando" not in txt, txt)
    chk("manual sem avaliações permite leitura mas impede cobrar prova", "Cobrar leitura" in txt and "Cobrar prova" not in txt, txt)
    chk("sem rolagem horizontal no celular", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    pg.set_viewport_size({"width": 1440, "height": 900})
    chk("sem rolagem horizontal em desktop", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    ctx.close()
    chk("sem erro de JavaScript", not erros, erros); b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD)
sys.exit(1 if BAD else 0)
