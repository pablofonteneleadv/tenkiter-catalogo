"""v5.6: excluir avaliação sem travar — a linha sai da tela na hora, servidor lento não congela, 'já apagada' conta como feito,
abertura lenta NÃO manda para o login, e enquanto grava o recarregar fica protegido."""
import sys, os, json, time
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def aval(i, nota):
    return {"linha": i + 2, "dataHora": "2026-10-08T19:2%d:00.000Z" % i, "whatsapp": "88993063899", "nome": "Thais Gomes", "nivel": 1, "manual": "TM Funcionário Iniciando", "nota": nota, "total": 6, "percentual": round(nota * 100 / 6), "erros": []}
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION)
    ctx.add_init_script("""(function(){var f=window.fetch;window.__atraso={};window.fetch=function(u,o){var a='';try{a=JSON.parse((o&&o.body)||'{}').action||''}catch(e){}var d=window.__atraso[a]||0;if(!d)return f.apply(this,arguments);var self=this,args=arguments;return new Promise(function(r){setTimeout(r,d)}).then(function(){return f.apply(self,args)})}})();""")
    install(ctx, perms=PERMS_ALL, versao="4.1", protegido=True)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    est = {"res": [aval(0, 0), aval(1, 6), aval(2, 0)], "rel_atraso": 0, "del_atraso": 1.2, "sessao_cai": False, "dels": [], "rels": 0}
    def h(route):
        r = route.request
        if r.method != "POST": return route.fallback()
        try: b_ = json.loads(r.post_data or "{}")
        except Exception: return route.fallback()
        a = b_.get("action")
        if a == "sessao" and est["sessao_cai"]: return route.abort()
        if a == "relatorio_equipe":
            est["rels"] += 1
            return route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({"ok": True, "funcionarios": [], "resultados": [dict(x) for x in est["res"]]}))
        if a == "excluir_avaliacao":
            est["dels"].append(b_.get("dataHora"))
            ach = [x for x in est["res"] if x["dataHora"] == b_.get("dataHora")]
            if not ach: return route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({"ok": False, "erro": "Não encontrei essa avaliação (talvez já tenha sido apagada). Atualize a lista."}))
            est["res"].remove(ach[0])
            return route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({"ok": True}))
        return route.fallback()
    pg.route("**/*", h)
    print("== Excluir sem travar ==")
    pg.goto(BASE + "treinamentos.html?painel=rh"); pg.wait_for_timeout(2500)
    pg.locator('[data-tab="desempenho"]').click(); pg.wait_for_timeout(3000)
    pg.evaluate("document.querySelectorAll('.ds-grupo').forEach(function(d){d.open=true})"); pg.wait_for_timeout(300)
    n0 = pg.locator(".ds-del").count()
    chk("3 avaliações aparecem", n0 == 3, n0)
    pg.evaluate("window.__atraso.relatorio_equipe=6000;window.__atraso.excluir_avaliacao=1200")
    pg.locator(".ds-del").first.click(); pg.wait_for_timeout(300)
    chk("enquanto grava, o sistema marca 'ocupado' (recarregar protegido)", pg.evaluate("window.TKOcupado && window.TKOcupado.pendentes()") >= 1)
    chk("e puxar para recarregar fica bloqueado", pg.evaluate("getComputedStyle(document.documentElement).overscrollBehaviorY") == "contain")
    pg.wait_for_timeout(2000)
    n1 = pg.locator(".ds-del").count()
    chk("a linha SAI da tela logo após o servidor confirmar (sem esperar o relatório lento)", n1 == 2 and est["rels"] <= 2, (n1, est["rels"]))
    chk("terminou: não fica mais 'ocupado'", pg.evaluate("window.TKOcupado.pendentes()") == 0)
    chk("recarregar volta ao normal", pg.evaluate("getComputedStyle(document.documentElement).overscrollBehaviorY") != "contain")
    pg.evaluate("window.__atraso={}")
    print("== Já estava apagada ==")
    est["res"] = [x for x in est["res"] if x["dataHora"] != aval(2, 0)["dataHora"]]  # servidor já não tem a 3ª
    pg.locator(".ds-del").last.click(); pg.wait_for_timeout(2500)
    chk("'já apagada' conta como feito e some da tela", pg.locator(".ds-del").count() == 1, pg.locator(".ds-del").count())
    print("== Abertura lenta não manda para o login ==")
    est["sessao_cai"] = True
    pg.goto(BASE + "treinamentos.html"); pg.wait_for_timeout(9000)
    txt = pg.inner_text("#app")
    chk("mostra 'servidor está demorando' e não o login", "demorando" in txt and pg.locator("#login-whats").count() == 0, txt[:120])
    chk("a sessão continua guardada", pg.evaluate("!!localStorage.getItem('tm_session')"))
    est["sessao_cai"] = False
    pg.click("#tm-retentar"); pg.wait_for_timeout(2500)
    chk("'Tentar de novo' entra na conta sem pedir senha", pg.locator("#login-whats").count() == 0 and pg.locator("#tm-retentar").count() == 0)
    chk("nenhum erro de JavaScript", not erros, erros[:2])
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
