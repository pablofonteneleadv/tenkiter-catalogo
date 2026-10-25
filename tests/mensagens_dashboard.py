"""Mensagens: dashboard das conversas guardadas. Serviços simulados; texto de conversa nunca vira HTML."""
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
    pg.click("#btn-abrir-mensagens"); pg.wait_for_timeout(1500)
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
    chk("abre o dashboard com as 3 abas", pg.locator(".ms-aba").count() == 3 and "Instagram" in pg.inner_text("#ms-corpo"))
    chk("abas mostram quantas conversas", "2 conversas" in pg.inner_text("[data-canal=whatsapp1]"), pg.inner_text("#ms-corpo")[:200])
    chk("WhatsApp 1 mostra que está gravando", "Gravando desde" in pg.inner_text(".ms-caixa"))
    chk("lista mostra nome, número formatado de grupo e prévia", "Maria" in pg.inner_text("#ms-lista") and "Grupo 120363" in pg.inner_text("#ms-lista"), pg.inner_text("#ms-lista"))
    chk("prévia com HTML aparece como texto", "<b>x</b>" in pg.inner_text("#ms-lista") and pg.locator("#ms-lista b >> text=x").count() == 0)
    pg.click("[data-ms=abrir] >> nth=0"); pg.wait_for_timeout(600)
    chk("abre a conversa com entrada e saída", pg.locator(".ms-bolha.entrada").count() == 1 and pg.locator(".ms-bolha.saida").count() == 1 and "[imagem]" in pg.inner_text(".ms-bolha.saida"))
    chk("texto com HTML malicioso não executa", pg.evaluate("window.__xss") is None and pg.locator(".ms-bolha img").count() == 0)
    pg.click("[data-ms=voltar]"); pg.wait_for_timeout(600)
    pg.click("[data-canal=whatsapp2]"); pg.wait_for_timeout(600)
    chk("WhatsApp 2 ainda não ligado oferece ligar", "Ainda não está gravando" in pg.inner_text(".ms-caixa") and pg.locator("[data-ms=ligar]").count() == 1)
    chk("canal vazio explica em português", "Ainda não chegou nenhuma mensagem" in pg.inner_text("#ms-lista"))
    pg.click("[data-ms=ligar]"); pg.wait_for_timeout(800)
    chk("pediu confirmação antes de ligar", any(d[0] == "confirm" and "Nada é apagado" in d[1] for d in DIALOGOS), DIALOGOS)
    chk("depois de ligar mostra gravando", "Gravando desde" in pg.inner_text(".ms-caixa"))
    pg.click("[data-ms=pausar]"); pg.wait_for_timeout(600)
    chk("pausar muda o estado e o botão", "Gravação pausada" in pg.inner_text(".ms-caixa") and "Retomar" in pg.inner_text(".ms-caixa"))
    pg.click("[data-canal=instagram]"); pg.wait_for_timeout(600)
    chk("Instagram explica o que falta, sem jargão cru", "Ainda não ligado" in pg.inner_text(".ms-caixa") and "{" not in pg.inner_text(".ms-caixa"))
    chk("nada foi apagado: só chamadas de leitura, ligar e pausar", all(c in ("/msg/resumo", "/msg/conversas", "/msg/mensagens", "/msg/ligar", "/msg/pausar") for c in st["ig"]["msg"]["calls"]))
    axe(pg, "Mensagens")
    ctx2, st2 = novo_contexto(b, perms=[x for x in PERMS_ALL if x != "gerir_acessos"])
    pg2 = pagina(ctx2, erros); pg2.goto(BASE + "admin.html"); pg2.wait_for_timeout(2600)
    abrir_ferramentas(pg2)
    chk("quem não é Admin total não vê o botão", not pg2.locator("#btn-abrir-mensagens").is_visible())
    chk("sem erros JavaScript", not erros, erros)
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
