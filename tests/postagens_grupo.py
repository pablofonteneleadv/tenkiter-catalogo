"""Aba Postagens (admin-postagens.js, v4.6): escolher peça/mídias, tipo (Feed, Carrossel, Reels, Story), Original/Templates (canvas -> JPEG -> R2), legenda, agora x agendado,
fila (cancelar / tentar de novo), Story com link = tarefa manual (baixar, copiar, "Já postei"), quem pode ver o botão, teclado e axe. Worker do Instagram e R2 simulados (mock.py)."""
import sys, os, json, datetime
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def abre_det(pg):
    pg.evaluate("()=>{const d=document.getElementById('po-det'); if(d) d.open=true}")
def sel_tx(pg, k):
    """Escolhe o texto k (como tocar nele): só o campo dele aparece embaixo."""
    abre_det(pg)
    if pg.get_attribute("[data-seltx=%s]" % k, "aria-pressed") != "true": pg.click("[data-seltx=%s]" % k)
    pg.wait_for_timeout(150)

def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-postagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.map(v=>v.id+'×'+v.nodes.length+' '+v.nodes.slice(0,2).map(n=>n.html.slice(0,90)).join('|'))}")
    chk("axe — " + label, not r, "; ".join(r))
def novo(b, perms=PERMS_ALL, versao="4.3"):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", timezone_id="America/Fortaleza", permissions=["clipboard-read", "clipboard-write"])
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
    st = install(ctx, perms=perms, versao=versao); st["midia"]["modo"] = "ok"
    return ctx, st
def abrir(pg):
    if pg.locator("#details-ferramentas[open]").count() == 0: pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-postagens"); pg.wait_for_timeout(700)
def corpo(pg): return pg.inner_text("#po-corpo")
def garantir(pg):
    if pg.locator('#overlay-postagens.aberto').count() == 0: abrir(pg)
def marca(pg, dia, h, m=0):
    """Escolhe dia (0 = hoje), hora e minuto no seletor rápido (tocar, sem campo nativo)."""
    pg.click("[data-pkc=nova][data-pk='d:%d']" % dia); pg.click("[data-pkc=nova][data-pk='h:%d']" % h); pg.click("[data-pkc=nova][data-pk='m:%d']" % m); pg.wait_for_timeout(150)
def aba(pg, nome): pg.click("#po-abas [data-aba=%s]" % nome); pg.wait_for_timeout(500)


with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox'])
    ctx,st=novo(b); pg=ctx.new_page(); erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
    pg.goto(BASE+'admin.html');pg.wait_for_timeout(2600);abrir(pg)
    chk('Grupo clientes pré-selecionado ao abrir Story',pg.locator('#po-grupo-clientes').is_checked())
    pg.fill('#po-busca','TK-0003');pg.wait_for_timeout(300);pg.click('.po-card >> nth=0');pg.click('[data-a=usarpecas]');pg.wait_for_timeout(400)
    chk('Story pré-selecionado',pg.locator('[data-tipo=story]').get_attribute('aria-pressed')=='true')
    for tipo in ['feed','carrossel','reels','story']:
        pg.click('[data-tipo='+tipo+']')
        chk(tipo+' mantém grupo selecionado',pg.locator('#po-grupo-clientes').is_checked())
    pg.locator('#po-grupo-clientes').uncheck()
    pg.click('[data-tipo=feed]')
    chk('trocar formato respeita grupo desmarcado',not pg.locator('#po-grupo-clientes').is_checked())
    pg.locator('#po-grupo-clientes').check()
    pg.locator('[data-tpl=original]').click();pg.fill('#po-leg','Legenda do grupo com link https://loja.fake/')
    pg.locator('[data-q=agora]').click();pg.wait_for_timeout(200)
    if pg.locator('[data-a=agora-sim]').count():pg.locator('[data-a=agora-sim]').click()
    pg.locator('[data-a=enviar]').click();pg.wait_for_timeout(1800)
    chamadas=[x['corpo'] for x in st['ig'].get('post_chamadas',[]) if x['path']=='/post']
    chk('pedido leva seleção do grupo e legenda editada',bool(chamadas) and chamadas[-1].get('grupoClientes') is True and chamadas[-1].get('legenda')=='Legenda do grupo com link https://loja.fake/')
    chk('sem erros de JavaScript',not erros,erros)
    b.close()
print('\nOK=%d FALHAS=%d %s'%(len(OK),len(BAD),BAD));sys.exit(1 if BAD else 0)
