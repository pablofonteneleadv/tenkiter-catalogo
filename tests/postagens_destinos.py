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


def selecionados(pg):
    return {k for k in ['instagram','whatsapp','whatsapp2','grupo'] if pg.locator('[data-destino='+k+']').get_attribute('aria-pressed')=='true'}
def escolher(pg,destinos):
    for k in ['instagram','whatsapp','whatsapp2','grupo']:
        if (k in selecionados(pg)) != (k in destinos): pg.locator('[data-destino='+k+']').click()
def preparar(pg):
    pg.fill('#po-busca','TK-0003');pg.wait_for_timeout(200);pg.click('.po-card >> nth=0');pg.click('[data-a=usarpecas]');pg.wait_for_timeout(200)
    pg.click('[data-tipo=feed]');pg.click('[data-tpl=original]');pg.fill('#po-leg','Legenda preservada nos destinos')
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox']);ctx,st=novo(b);pg=ctx.new_page();erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
    pg.goto(BASE+'admin.html');pg.wait_for_timeout(2600);abrir(pg)
    chk('quatro destinos + Os 4 no mesmo seletor e sem checkbox antigo',pg.locator('#po-canal [data-destino]').count()==5 and pg.locator('#po-grupo-clientes').count()==0 and 'Ambos' not in pg.inner_text('#po-canal'))
    chk('os 4 destinos começam pré-selecionados',selecionados(pg)=={'instagram','whatsapp','whatsapp2','grupo'},selecionados(pg))
    chk('rótulos pedidos: WhatsApp Status 1, Status 2 e Grupo 1','WhatsApp Status 1' in pg.inner_text('#po-canal') and 'WhatsApp Status 2' in pg.inner_text('#po-canal') and 'WhatsApp Grupo 1' in pg.inner_text('#po-canal'))
    pg.click('[data-destino=todos]')
    chk('Os 4 desmarca quando já estão todos',len(selecionados(pg))==0)
    pg.click('[data-destino=todos]')
    chk('Os 4 ilumina os quatro destinos e o atalho',len(selecionados(pg))==4 and pg.locator('[data-destino=todos]').get_attribute('aria-pressed')=='true')
    if os.environ.get('TK_DESTINOS_SCREENSHOT'):pg.screenshot(path=os.environ['TK_DESTINOS_SCREENSHOT'])
    pg.click('[data-destino=whatsapp]')
    chk('tirar um mantém os outros três e desliga atalho',selecionados(pg)=={'instagram','whatsapp2','grupo'} and pg.locator('[data-destino=todos]').get_attribute('aria-pressed')=='false')
    escolher(pg,{'grupo'});pg.wait_for_timeout(300);pg.reload();pg.wait_for_timeout(2600);abrir(pg)
    chk('rascunho preserva grupo sozinho após recarregar',selecionados(pg)=={'grupo'})
    preparar(pg);escolher(pg,set());pg.click('[data-a=enviar]');pg.wait_for_timeout(300)
    chk('nenhum destino bloqueia envio sem trocar para Instagram',not st['ig'].get('post_chamadas') and 'Escolha pelo menos um destino' in corpo(pg))
    axe(pg,'seletor dos três destinos')
    combos=[{'instagram'},{'whatsapp'},{'whatsapp2'},{'grupo'},{'instagram','whatsapp'},{'instagram','grupo'},{'whatsapp','grupo'},{'whatsapp','whatsapp2'},{'instagram','whatsapp','whatsapp2','grupo'}]
    for i,ds in enumerate(combos):
        if i: aba(pg,'nova');preparar(pg)
        escolher(pg,ds);pg.click('[data-q=agora]');pg.wait_for_timeout(100)
        if pg.locator('[data-a=agora-sim]').count():pg.click('[data-a=agora-sim]')
        pg.click('[data-a=enviar]');pg.wait_for_timeout(1000)
        chamadas=[x['corpo'] for x in st['ig'].get('post_chamadas',[]) if x['path']=='/post']
        pedido=chamadas[-1] if chamadas else {}
        esperado='ambos' if {'instagram','whatsapp'}<=ds else 'instagram' if 'instagram' in ds else 'whatsapp' if 'whatsapp' in ds else 'whatsapp2' if ('whatsapp2' in ds and 'grupo' not in ds) else 'grupo'
        chk('publicar somente em '+','.join(sorted(ds)),pedido.get('canal')==esperado and pedido.get('grupoClientes')==('grupo' in ds) and pedido.get('status2')==('whatsapp2' in ds) and pedido.get('legenda')=='Legenda preservada nos destinos',pedido)
    aba(pg,'nova');preparar(pg);pg.click('[data-tipo=story]');pg.click('[data-tpl=rodape]');pg.check('input[name=po-cta][value=link]');escolher(pg,{'grupo'})
    pg.click('[data-q=agora]');pg.wait_for_timeout(100)
    if pg.locator('[data-a=agora-sim]').count():pg.click('[data-a=agora-sim]')
    pg.click('[data-a=enviar]');pg.wait_for_timeout(1000)
    enviado=[x['corpo'] for x in st['ig']['post_chamadas'] if x['path']=='/post'][-1]
    chk('Story só no grupo é automático mesmo após usar link do Instagram',enviado['posts'][0]['canal']=='grupo' and enviado['posts'][0]['modo']=='auto')
    chk('sem erros JavaScript',not erros,erros)
    b.close()
print('\nOK=%d FALHAS=%d %s'%(len(OK),len(BAD),BAD));sys.exit(1 if BAD else 0)
