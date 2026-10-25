"""Conexões: campo da chave do Wame (WhatsApp Status 2). Serviços simulados; a chave nunca volta para a tela nem fica no aparelho."""
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
    pg.click("#btn-abrir-conexoes"); pg.wait_for_timeout(1500)
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
    chk("bloco do Wame aparece em Conexões", "Status 2 — Wame" in corpo(pg) and pg.locator("#cx-wm-chave").count() == 1)
    chk("situação inicial: nenhuma chave cadastrada", "Nenhuma chave Wame" in pg.inner_text("#cx-wm-status"), pg.inner_text("#cx-wm-status"))
    chk("campo é de senha, sem autopreenchimento", pg.get_attribute("#cx-wm-chave", "type") == "password" and pg.get_attribute("#cx-wm-chave", "autocomplete") == "new-password")
    chk("o servidor padrão vem escolhido e há 3 opções", pg.input_value("#cx-wm-servidor") == "server.wame.api.br" and pg.locator("#cx-wm-servidor option").count() == 3)
    pg.fill("#cx-wm-chave", "curta"); pg.click("[data-cx=wm-guardar]"); pg.wait_for_timeout(500)
    chk("chave inválida mostra erro legível, sem JSON", "parece inválida" in pg.inner_text("#cx-wm-msg") and "{" not in pg.inner_text("#cx-wm-msg"), pg.inner_text("#cx-wm-msg"))
    CH = "CHAVE_WAME_FALSA_1234567890"
    pg.fill("#cx-wm-chave", CH); pg.click("[data-cx=wm-guardar]"); pg.wait_for_timeout(600)
    chk("chave válida é guardada e o campo é limpo", "guardados no servidor" in pg.inner_text("#cx-wm-msg") and pg.input_value("#cx-wm-chave") == "")
    chk("situação passa a configurada", "✓ Chave Wame configurada" in pg.inner_text("#cx-wm-status"), pg.inner_text("#cx-wm-status"))
    chk("a chave não aparece em nenhum lugar da tela", CH not in pg.content())
    chk("a chave não fica no armazenamento do aparelho", CH not in pg.evaluate("JSON.stringify(localStorage)+JSON.stringify(sessionStorage)"))
    pg.click("[data-cx=wm-testar]"); pg.wait_for_timeout(700)
    chk("Testar conexão lista cada servidor e diz onde a chave funciona", "us.api-wa.me: conectado" in pg.inner_text("#cx-wm-res") and "não reconhece a chave" in pg.inner_text("#cx-wm-res") and "Escolha esse servidor" in pg.inner_text("#cx-wm-msg"), [pg.inner_text("#cx-wm-res"), pg.inner_text("#cx-wm-msg")])
    pg.select_option("#cx-wm-servidor", "us.api-wa.me"); pg.click("[data-cx=wm-guardar]"); pg.wait_for_timeout(600)
    chk("trocar só o servidor salva sem precisar colar a chave de novo", "Servidor atualizado" in pg.inner_text("#cx-wm-msg") and "us.api-wa.me" in pg.inner_text("#cx-wm-status"), [pg.inner_text("#cx-wm-msg"), pg.inner_text("#cx-wm-status")])
    chk("o teste não envia nada: só chamou a rota de teste, nenhuma postagem", len(st["ig"].get("wame_testes", [])) == 1 and not [c for c in st["ig"].get("post_chamadas", []) if c["path"] == "/post"])
    axe(pg, "Conexões — bloco do Wame")
    pg.click("[data-cx=wm-apagar]"); pg.wait_for_timeout(600)
    chk("remover limpa a situação", "Nenhuma chave Wame" in pg.inner_text("#cx-wm-status") and "removida" in pg.inner_text("#cx-wm-msg"))
    ctx2, st2 = novo_contexto(b, perms=[x for x in PERMS_ALL if x != "gerir_acessos"])
    pg2 = pagina(ctx2, erros); pg2.goto(BASE + "admin.html"); pg2.wait_for_timeout(2600)
    abrir_ferramentas(pg2)
    chk("quem não é Admin total nem vê o botão de Conexões", not pg2.locator("#btn-abrir-conexoes").is_visible())
    chk("sem erros JavaScript", not erros, erros)
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
