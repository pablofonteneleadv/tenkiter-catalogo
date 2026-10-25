"""Conexões: Wafly 1 e Wafly 2 pelo admin. Serviços simulados; tokens nunca voltam para a tela nem ficam no aparelho."""
import sys, os, json
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
AXE = open(os.path.join(AQUI, 'axe.min.js')).read()
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});return r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,ex:v.nodes.slice(0,3).map(n=>n.target.join(' ')+' :: '+(n.failureSummary||'').split('\\n')[1])}))}")
    chk("axe — " + label, not r, "; ".join("%s×%d %s" % (v['id'], v['n'], v['ex'][:2]) for v in r))
DIALOGOS = []
def dialogo(d):
    DIALOGOS.append((d.type, d.message)); d.accept()
CHAVE_R = "rnd_SEGREDOSEGREDOSEGREDO7788"
CHAVE_C = "cfut_SEGREDODACLOUDFLARE0123456789ab"
CHAVE_O = "os_v2_org_SEGREDODAORGANIZACAOFALSA0123456789xyz"     # inventada: o repositório é público, nunca usar chave real em teste
ORG_ID = "b0b0b0b0-1111-4222-8333-444444444444"
POLL = "window.TK_CONEXOES_POLL_MS=250;"

def pagina(ctx, erros):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", dialogo)
    return pg
def abrir_ferramentas(pg):
    if pg.locator("#details-ferramentas[open]").count() == 0:
        pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
def abrir(pg):
    abrir_ferramentas(pg)
    pg.click("#btn-abrir-conexoes"); pg.wait_for_timeout(1500); pg.evaluate("document.querySelectorAll('#cx-corpo .cx-grupo').forEach(g=>g.open=true)"); pg.wait_for_timeout(300)
def corpo(pg): return pg.inner_text("#cx-corpo")
def novo_contexto(b, perms=PERMS_ALL, versao="3.4", log=None):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script(POLL)
    st = install(ctx, perms=perms, log=log, versao=versao)
    return ctx, st

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx, st = novo_contexto(b)
    erros = []
    pg = pagina(ctx, erros)
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    abrir(pg)
    chk("blocos Wafly 1 e 2 aparecem em Conexões", "Status 1 — Wafly" in corpo(pg) and "Status 2 — Wafly" in corpo(pg))
    chk("Wafly 1 começa em uso pelo Apps Script", "Apps Script" in pg.inner_text("#cx-wf1-status"), pg.inner_text("#cx-wf1-status"))
    chk("Wafly 2 começa sem cadastro", "Nenhuma instância" in pg.inner_text("#cx-wf2-status"))
    chk("tokens são campos de senha", all(pg.get_attribute(i, "type") == "password" for i in ["#cx-wf1-tok", "#cx-wf1-cli", "#cx-wf2-tok", "#cx-wf2-cli"]))
    pg.fill("#cx-wf2-inst", "INST_TESTE_002"); pg.click("[data-cx=wf2-guardar]"); pg.wait_for_timeout(400)
    chk("faltando campo, avisa em português sem enviar", "três campos" in pg.inner_text("#cx-wf2-msg") and not st["ig"].get("wafly_posts"), pg.inner_text("#cx-wf2-msg"))
    TOK, CLI = "TOKEN_FALSO_ABC123456", "CLIENT_FALSO_XYZ123456"
    pg.fill("#cx-wf2-tok", TOK); pg.fill("#cx-wf2-cli", CLI); pg.click("[data-cx=wf2-guardar]"); pg.wait_for_timeout(600)
    chk("Wafly 2 guardada e campos secretos limpos", "Guardado" in pg.inner_text("#cx-wf2-msg") and pg.input_value("#cx-wf2-tok") == "" and pg.input_value("#cx-wf2-cli") == "")
    chk("situação mostra cadastrada e o código da instância", "Cadastrada" in pg.inner_text("#cx-wf2-status") and "INST_TESTE_002" in pg.inner_text("#cx-wf2-status"), pg.inner_text("#cx-wf2-status"))
    chk("tokens não aparecem na tela nem no aparelho", TOK not in pg.content() and CLI not in pg.content() and TOK not in pg.evaluate("JSON.stringify(localStorage)+JSON.stringify(sessionStorage)"))
    pg.fill("#cx-wf1-inst", "INST_TESTE_001"); pg.fill("#cx-wf1-tok", TOK); pg.fill("#cx-wf1-cli", CLI); pg.click("[data-cx=wf1-guardar]"); pg.wait_for_timeout(600)
    chk("Wafly 1 guardada", "Cadastrada" in pg.inner_text("#cx-wf1-status") and "INST_TESTE_001" in pg.inner_text("#cx-wf1-status"), pg.inner_text("#cx-wf1-status"))
    pg.click("[data-cx=wf1-testar]"); pg.wait_for_timeout(600)
    chk("teste lista sessão e Status e diz que não enviou nada", "Sessão do WhatsApp: conectada" in pg.inner_text("#cx-wf1-res") and "nada foi enviado" in pg.inner_text("#cx-wf1-msg") and st["ig"]["wafly_testes"][-1]["slot"] == 1, pg.inner_text("#cx-wf1-msg"))
    chk("nenhuma postagem foi criada ou mexida", not [c for c in st["ig"].get("post_chamadas", []) if c["path"] in ("/post", "/post/cancelar", "/post/reagendar")])
    axe(pg, "Conexões — blocos Wafly")
    pg.click("[data-cx=wf1-apagar]"); pg.wait_for_timeout(600)
    chk("remover o 1 volta ao Apps Script e avisa que a fila não mudou", "Apps Script" in pg.inner_text("#cx-wf1-status") and "fila não foi alterada" in pg.inner_text("#cx-wf1-msg"), pg.inner_text("#cx-wf1-msg"))
    chk("o 2 continua cadastrado", "Cadastrada" in pg.inner_text("#cx-wf2-status"))
    ctx2, st2 = novo_contexto(b, perms=[x for x in PERMS_ALL if x != "gerir_acessos"])
    pg2 = pagina(ctx2, erros); pg2.goto(BASE + "admin.html"); pg2.wait_for_timeout(2600)
    abrir_ferramentas(pg2)
    chk("quem não é Admin total nem vê Conexões", not pg2.locator("#btn-abrir-conexoes").is_visible())
    chk("sem erros JavaScript", not erros, erros)
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
