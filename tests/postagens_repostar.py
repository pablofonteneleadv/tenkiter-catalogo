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
    ctx.add_init_script(SESSION); ctx.add_init_script("try{localStorage.setItem('tk_po_fila_abertos',JSON.stringify(['story','grupo','status','status2','feed','carrossel','reels']))}catch(e){}"); ctx.add_init_script("window.TK_POSTAGENS_POLL_MS=400;")
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
    b=p.chromium.launch(args=['--no-sandbox']);ctx,st=novo(b);g=st['ig'];g['regras']=True
    origem={'id':901,'tipo':'story','modo':'auto','legenda':'Legenda original','midias':[],'canal':'ambos','status':'erro','aguardaZap':True,'agendadoEm':'2026-10-21T13:11:00Z','erro':'Wafly ainda não confirmou','tentativas':0,'criadoPor':'Equipe'}
    g['posts']=[dict(origem),dict(origem,id=902),dict(origem,id=904,canal='grupo',aguardaZap=False,grupoEnvioIncerto=True),dict(origem,id=905,canal='grupo',aguardaZap=False,grupoMidiaIncompativel=True,erro='Grupo clientes: este MP4 usa H.265/HEVC.')];pedidos=[];avisos=[]
    def repost(route):
        q=json.loads(route.request.post_data);pedidos.append(q)
        g['posts'][0]['status']='cancelado';g['posts'].append(dict(origem,id=903,status='agendado',aguardaZap=False))
        route.fulfill(json={'ok':True,'id':903,'quando':'2026-10-23T09:30:00Z'})
    ctx.route('**/post/repostar',repost)
    pg=ctx.new_page();erros=[];pg.on('pageerror',lambda e:erros.append(str(e)));pg.on('dialog',lambda d:(avisos.append(d.message),d.accept()))
    pg.goto(BASE+'admin.html');pg.wait_for_timeout(2600);abrir(pg);aba(pg,'fila')
    item=pg.locator('.po-item[data-id="901"]')
    chk('erro incerto oferece consultar, repostar e descartar',item.locator('[data-a=consultar]').count()==1 and item.locator('[data-a=repostar]').count()==1 and item.locator('[data-a=cancelar]').inner_text()=='Descartar')
    grupo=pg.locator('.po-item[data-id="904"]')
    chk('grupo sem confirmação oferece somente repostar ou descartar',grupo.locator('[data-a=agora], [data-a=hora], [data-a=proximo]').count()==0 and grupo.locator('[data-a=repostar]').count()==1 and grupo.locator('[data-a=cancelar]').inner_text()=='Descartar')
    codec=pg.locator('.po-item[data-id="905"]')
    chk('grupo com HEVC oferece só descartar, sem repetir mídia incompatível',codec.locator('[data-a=agora], [data-a=hora], [data-a=proximo], [data-a=repostar]').count()==0 and codec.locator('[data-a=cancelar]').inner_text()=='Descartar')
    axe(pg,'erro incerto com novas ações')
    item.locator('[data-a=repostar]').click();pg.wait_for_timeout(800)
    chk('confirmação explica duplicação e regras',bool(avisos) and 'duplicar' in avisos[-1] and 'próximo horário permitido' in avisos[-1])
    chk('repostagem envia origem e reconhecimento explícito',len(pedidos)==1 and pedidos[0]['id']==901 and pedidos[0]['confirmarRisco'] is True)
    chk('fila mostra nova cópia e encerra antiga',pg.locator('.po-item[data-id="903"]').count()==1 and pg.locator('.po-item[data-id="901"]').count()==0)
    pg.locator('.po-item[data-id="902"] [data-a=cancelar]').click();pg.wait_for_timeout(800)
    chk('descartar retira o item sem pedir novo envio',pg.locator('.po-item[data-id="902"]').count()==0 and len(pedidos)==1)
    chk('sem erros JavaScript',not erros,erros)
    b.close()
print('\nOK=%d FALHAS=%d %s'%(len(OK),len(BAD),BAD));sys.exit(1 if BAD else 0)
